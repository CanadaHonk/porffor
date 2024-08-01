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

The repo comes with easy alias scripts for Unix and Windows, which you can use like so:
- Unix: `./porf path/to/script.js`
- Windows: `.\porf path/to/script.js`

You can also swap out `node` in the alias to use another runtime like Deno (`deno run -A ...`) or Bun (`bun ...`), or just use it yourself (eg `node runner/index.js ...`, `bun runner/index.js ...`). Node, Deno, Bun should work.

### Precompile

**If you update any file inside `compiler/builtins` you will need to do this for it to update inside Porffor otherwise your changes will have no effect.** Run `./porf precompile` to precompile. It may error during this, if so, you might have an error in your code or there could be a compiler error with Porffor (feel free to ask for help as soon as you encounter any errors with it).

<br>

## Types

Porffor has usual JS types (or at least the ones it supports), but also internal types for various reasons.

### ByteString

The most important and widely used internal type is ByteString. Regular strings in Porffor are UTF-16 encoded, so each character uses 2 bytes. ByteStrings are special strings which are used when the characters in a string only use ASCII/LATIN-1 characters, so the lower byte of the UTF-16 characters are unused. Instead of wasting memory with all the unused memory, ByteStrings instead use 1 byte per character. This halves memory usage of such strings and also makes operating on them faster. The downside is that many Porffor built-ins have to be written twice, slightly different, for both `String` and `ByteString` types.

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

Stores the length `length` at pointer `pointer`, setting the length of an object. This is mostly unneeded today as you can just do `obj.length = length`. [^1]

<br>

## Example

Here is the code for `ByteString.prototype.toUpperCase()`:

```ts
export const __ByteString_prototype_toUpperCase = (_this: bytestring) => {
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
export const __ByteString_prototype_toUpperCase = (_this: bytestring) => {
```

Here we define a built-in for Porffor. Notably:
- We do not use `a.b.c`, instead we use `__a_b_c`
- We use a `_this` argument, as `this` does not exist in Porffor yet
- We use an arrow function
- We do not set a return type as prototype methods cannot use them currently or errors can happen.

---

```ts
  const len: i32 = _this.length;

  let out: bytestring = '';
  Porffor.wasm.i32.store(out, len, 0, 0);
```

This sets up the `out` variable we are going to write to for the output of this function. We set the length in advance to be the same as `_this`, as `foo.length == foo.toLowerCase().length`, because we will later be manually writing to it using Wasm intrinsics, which will not update the length themselves.

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

- For declaring variables, you must use explicit type annotations currently (eg `let a: number = 1`, not `let a = 1`).
- You might spot `Porffor.fastOr`/`Porffor.fastAnd`, these are non-short circuiting versions of `||`/`&&`, taking any number of conditions as arguments. You shouldn't don't need to use or worry about these.
- Attempt to avoid object/string/array-heavy code and use more variables instead if possible, easier on memory and CPU/perf.
- Do not set a return type for prototype methods, it can cause errors/unexpected results.
- You cannot use other functions in the file not exported, or variables not inside the current function.
- `if (...)` uses a fast truthy implementation which is not spec-compliant as most conditions should be strictly checked. To use spec-compliant behavior, use `if (!!...)`.
- For object (string/array/etc) literals, you must use a variable eg `const out: bytestring = 'foobar'; console.log(out);` instead of `console.log('foobar')` due to precompile's allocator constraints.
- You should generally use non-strict equality ops (`==`/`!=`).

<br>

### Porffor.wasm
This is a macro that is essentially equivalent to C's `asm` macro. It allows you to write inline Wasm bytecode in a similar format to [WAT](https://developer.mozilla.org/en-US/docs/WebAssembly/Understanding_the_text_format).

Let's look at an example to better illustrate how the format works.

```ts
export const add_i32 = (a: any, b: any) => {
  Porffor.wasm`
  local aCasted i32
  local bCasted i32
  returns i32 i32

  ;; if both types are number
  local.get ${a+1}
  i32.const 1
  i32.eq
  local.get ${b+1}
  i32.const 1
  i32.eq
  i32.and
  if
    local.get ${a}
    i32.from
    local.set aCasted

    local.get ${b}
    i32.from
    local.set bCasted

    local.get aCasted
    local.get bCasted
    i32.add
    i32.const 1
    return
  end

  ;; return (0, 0) otherwise
  i32.const 0
  i32.const 0
  return`;
}
```

---

```
local aCasted i32
local bCasted i32
```

Here we define two locals, which you can think of as typed variables. Here both of them have the type of `i32`, which was explained above. This type can also be `f64` or `i64`, which are doubles and 64-bit integers respectively.

---

```
returns i32 i32
```

This sets the return type of the function, what the stack must look like before a `return` instruction. Normally Porffor functions have the return type `(f64, i32)`, which represents the valtype (usually f64) and an i32 type.

> [!WARNING]
> This is something you have to be incredibly careful with, as Porffor expects most functions to return `(valtype, i32)`. Be incredibly careful when using this.

---

```
;; if both types are number
```

This is a comment. `;;` is Wasm's `//`.

---

```
local.get ${a+1}
i32.const 1
i32.eq
local.get ${b+1}
i32.const 1
i32.eq
i32.and
```

This part is a little more complicated, first you have to understand how Wasm represents function parameters and local variables in general. When looking at the decompiled output of something like `let a = 1;`, you'll likely see something like this:
```
f64.const 1
i32.const 1
local.set 1 ;; a#type (i32)
local.set 0 ;; a
```
Here the `i32.const 1` is equivalent to `TYPES.number`, which aligns with what we told Porffor to do, but what's up with the `local.set`s to a number? Well, internally locals are represented with indexes, and in this example `a` was assigned 0, and `a#type` was assigned 1.

That's where `local.get ${a+1}` comes from, it's Porffor's way of saying "get the local variable at index of `a` plus one". In most cases, this is the variable's type. The rest of the snippet is just checking if both of the parameters' types are equal to `TYPES.number`.

---

```
if
  local.get ${a}
  i32.from
  local.set aCasted

  local.get ${b}
  i32.from
  local.set bCasted
```

Here we start an if block, equivalent to JS's `if (...) {}`, and as the locals' names imply, cast them to `i32`s. There is one strange thing about this section though, if you look at Wasm's list of instructions you won't find a `i32.from`. This is because Porffor has custom instructions for converting to and from the valtype. In this case, converting the valtype into an `i32`. There are a few more of these instructions, but in general these instructions come in the format of `type.from` (create `type` from valtype) and `type.to` (create valtype from `type`). You can find a full list at the bottom of `codegen.js`.

---

```
  local.get aCasted
  local.get bCasted
  i32.add
  i32.const 1
  return
end
```

Here, we get our two casted locals and add them together, returning the result and a `i32` with the value of 1. We then end the if block with the `end` instruction.

---

```
;; return (0, 0) otherwise
i32.const 0
i32.const 0
return
```

Finally, we return `(0, 0)` if either type is not a number. This example was very contrived, but should give you a good sense of how to use `Porffor.wasm`.

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

For the first time, ensure you run `./test262/setup.sh` (Unix) or `.\test262\setup.cmd` (Windows).

Run `node test262` to run all the tests and get an output of total overall test results.

Warning: this will consume 1-6GB of memory and ~90% of all CPU cores while running (depending on thread count), it should take 10-30 minutes depending on machine. You can specify how many threads with `--threads=N`, it will use the number of CPU threads by default.

The main thing you want to pay attention to is the emoji summary (lol):
```
🧪 50005 | 🤠 7007 (-89) | ❌ 1914 (-32) | 💀 13904 (-61) | 📝 23477 (-120) | ⏰ 2 | 🏗 2073 (+302) | 💥 1628
```

To break this down:
🧪 total 🤠 pass ❌ fail 💀 runtime error 📝 todo (error) ⏰ timeout 🏗️ wasm compile error 💥 compile error

The diff compared to the last commit (with test262 data) is shown in brackets. Basically, you want passes 🤠 up, and errors 💀📝🏗💥 down. It is fine if some errors change balance/etc, as long as they are not new failures.

It will also log new passes/fails. Be careful as sometimes the overall passes can increase, but other files have also regressed into failures which you might miss. Also keep in mind some tests may have been false positives before, but we can investigate the diff together :)

### Debugging tips

- Use `node test262 path/to/tests` to run specific test262 dirs/files (eg `node test262 built-ins/Date`).
- Use `--log-errors` to log the errors of individual tests.
- Use `--debug-asserts` to log expected/actual of assertion failures (experimental).

<br>

### Resources

- [MDN](https://developer.mozilla.org/en-US/), not only a great resource for learning JS, but also for implementing it, as it has high level descriptions of functionality, as well as links to the relevant portions of the spec that govern the feature.
- [WebAssembly Opcodes](https://pengowray.github.io/wasm-ops/), this website not only describes what each wasm instruction does but the necessary stack needed, and contains some other useful resources as well.

[^1]: The last two args are necessary for the Wasm instruction, but you don't need to worry about them (the first is alignment, the second is byte offset).