# Contributing to Porffor

Hello! Thanks for your potential interest in contributing to Porffor :)

This document hopes to help you understand Porffor-specific TS, specifically for writing built-ins (inside `compiler/builtins/*.ts` eg `btoa`, `String.prototype.trim`, ...). This guide isn't really meant for modifying the compiler itself yet (eg `compiler/codegen.js`), as built-ins are ~easier to implement and more useful at the moment.

I mostly presume decent JS knowledge, with some basic TS too but nothing complicated. Knowing low-level stuff generally (pointers, etc) and/or Wasm (bytecode) is also a plus but hopefully not required.

If you have any questions you can ask in [the Porffor Discord](https://discord.gg/6crs9Znx9R), please feel free to ask anything if you get stuck :)

Please read this entire document before beginning as there are important things throughout.

<br>

## Setup

1. Clone the repo and enter the repo (`git clone https://github.com/CanadaHonk/porffor.git`)
2. `npm install`

### Precompile

**If you update any file inside `compiler/builtins` you will need to do this for it to update inside Porffor otherwise your changes will have no effect.** Run `node compiler/precompile.js` to precompile. It may error during this, if so, you might have an error in your code or there could be a compiler error with Porffor (feel free to ask for help as soon as you encounter any errors with it).

<br>

## Types

Porffor has usual JS types (or at least the ones it supports), but also internal types for various reasons.

### ByteString

The most important and widely used internal type is ByteString (also called `bytestring` or `_bytestring` in code). Regular strings in Porffor are UTF-16 encoded, so each character uses 2 bytes. ByteStrings are special strings which are used when the characters in a string only use ASCII/LATIN-1 characters, so the lower byte of the UTF-16 characters are unused. Instead of wasting memory with all the unused memory, ByteStrings instead use 1 byte per character. This halves memory usage of such strings and also makes operating on them faster. The downside is that many Porffor built-ins have to be written twice, slightly different, for both `String` and `ByteString` types.

### i32

This is complicated internally but essentially, only use it for pointers. (This is not signed or unsigned, instead it is the Wasm valtype `i32` so the signage is ~instruction dependant).

<br>

## Pointers

Pointers are the main (and most difficult) unique feature you ~need to understand when dealing with objects (arrays, strings, ...).

We'll explain things per common usage you will likely need to know:

## Commonly used Wasm code

### Get a pointer

```js
Porffor.wasm`local.get ${foobar}`
```

Gets the pointer to the variable `foobar`. You don't really need to worry about how it works in detail, but essentially it gets the pointer as a number (type) instead of as the object it is.

### Store a character in a ByteString

```js
Porffor.wasm.i32.store8(pointer, characterCode, 0, 4)
```

Stores the character code `characterCode` at the pointer `pointer` **for a ByteString**.[^1]

### Store a character in a String

```js
Porffor.wasm.i32.store16(pointer, characterCode, 0, 4)
```

Stores the character code `characterCode` at the pointer `pointer` **for a String**.[^1]

### Load a character from a ByteString

```js
Porffor.wasm.i32.load8_u(pointer, 0, 4)
```

Loads the character code at the pointer `pointer` **for a ByteString**.[^1]

### Load a character from a String

```js
Porffor.wasm.i32.load16_u(pointer, 0, 4)
```

Loads the character code at the pointer `pointer` **for a String**.[^1]

### Manually store the length of an object

```js
Porffor.wasm.i32.store(pointer, length, 0, 0)
```

Stores the length `length` at pointer `pointer`, setting the length of an object. This is mostly unneeded today as you can just do `obj.length = length`. [^2]

<br>

## Example

Here is the code for `ByteString.prototype.toUpperCase()`:

```ts
export const ___bytestring_prototype_toUpperCase = (_this: bytestring) => {
  const len: i32 = _this.length;

  let out: bytestring = '';
  Porffor.wasm.i32.store(out, len, 0, 0);

  let i: i32 = Porffor.wasm`local.get ${_this}`,
      j: i32 = Porffor.wasm`local.get ${out}`;

  const endPtr: i32 = i + len;
  while (i < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);

    if (chr >= 97) if (chr <= 122) chr -= 32;

    Porffor.wasm.i32.store8(j++, chr, 0, 4);
  }

  return out;
};
```

Now let's go through it section by section:

```ts
export const ___bytestring_prototype_toUpperCase = (_this: bytestring) => {
```

Here we define a built-in for Porffor. Notably:
- We do not use `a.b.c`, instead we use `__a_b_c`
- The ByteString type is actually `_bytestring`, as internal types have an extra `_` at the beginning (this is due to be fixed/simplified soon(tm))
- We use a `_this` argument, as `this` does not exist in Porffor yet
- We use an arrow function

---

```ts
  const len: i32 = _this.length;

  let out: bytestring = '';
  Porffor.wasm.i32.store(out, len, 0, 0);
```

This sets up the `out` variable we are going to write to for the output of this function. We set the length in advance to be the same as `_this`, as `foo.length == foo.toLowerCase().length`, because we will later be manually writing to it using Wasm instrinsics, which will not update the length themselves.

---

```ts
  let i: i32 = Porffor.wasm`local.get ${_this}`,
      j: i32 = Porffor.wasm`local.get ${out}`;
```

Get the pointers for `_this` and `out` as `i32`s (~`number`s).

---

```ts
  const endPtr: i32 = i + len;
  while (i < endPtr) {
```

Set up an end target pointer as the pointer variable for `_this` plus the length of it. Loop below until that pointer reaches the end target, so we iterate through the entire string.

---

```ts
    let chr: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);
```

Read the character (code) from the current `_this` pointer variable, and increment it so next iteration it reads the next character, etc.

---

```ts
    if (chr >= 97) if (chr <= 122) chr -= 32;
```

If the character code is >= 97 (`a`) and <= 122 (`z`), decrease it by 32, making it an upper case character. eg: 97 (`a`) - 32 = 65 (`A`).

---

```ts
    Porffor.wasm.i32.store8(j++, chr, 0, 4);
```

Store the character code into the `out` pointer variable, and increment it.

<br>

## Porffor-specific TS notes

- For declaring variables, you must use explicit type annotations currently (eg `let a: number = 1`, not `let a = 1`)
- You might spot `Porffor.fastOr`/`Porffor.fastAnd`, these are non-short circuiting versions of `||`/`&&`, taking any number of conditions as arguments. You shouldn't don't need to use or worry about these.
- **There are ~no objects, you cannot use them/literals.**
- Attempt to avoid string/array-heavy code and use more variables instead if possible, easier on memory and CPU/perf.

<br>

## Formatting/linting

There is 0 setup for this (right now). You can try looking through the other built-ins files but do not worry about it a lot, I honestly do not mind going through and cleaning up after a PR as long as the code itself is good :^)

<br>

## Commit (message) style

You should ideally have one commit per notable change (using amend/force push). Commit messages should be like `${file}: ${description}`. Don't be afraid to use long titles if needed, but try and be short if possible. Bonus points for detail in commit description. ~~Gold star for jokes in description too.~~

Examples:
```
builtins/date: impl toJSON
builtins/date: fix ToIntegerOrInfinity returning -0
codegen: fix inline wasm for unreachable
builtins/array: wip toReversed
builtins/tostring_number: impl radix
```

<br>

## Test262

Make sure you have Test262 cloned already **inside of `test262/`** (`git clone https://github.com/tc39/test262.git test262/test262`).

Run `node test262` to run all the tests and get an output of total overall test results. The main thing you want to pay attention to is the emoji summary (lol):
```
🧪 50005 | 🤠 7007 (-89) | ❌ 1914 (-32) | 💀 13904 (-61) | 📝 23477 (-120) | ⏰ 2 | 🏗 2073 (+302) | 💥 1628
```

To break this down:
🧪 total 🤠 pass ❌ fail 💀 runtime error 📝 todo (error) ⏰ timeout 🏗️ wasm compile error 💥 compile error

The diff compared to the last commit (with test262 data) is shown in brackets. Basically, you can passes 🤠 up, and errors 💀📝🏗💥 down. It is fine if some errors change balance/etc, as long as they are not new failures.

It will also log new passes/fails. Be careful as sometimes the overall passes can increase, but other files have also regressed into failures which you might miss. Also keep in mind some tests may have been false positives before, but we can investigate the diff together :)

### Debugging tips

- Use `node test262 path/to/tests` to run specific test262 dirs/files (eg `node test262 built-ins/Date`).
- Use `--log-errors` to log the errors of individual tests.
- Use `--debug-asserts` to log expected/actual of assertion failures (experimental).

<br>

[^1]: The `0, 4` args are necessary for the Wasm instruction, but you don't need to worry about them (`0` alignment, `4` byte offset for length).

[^2]: The `0, 4` args are necessary for the Wasm instruction, but you don't need to worry about them (`0` alignment, `0` byte offset).