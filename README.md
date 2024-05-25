# Porffor &nbsp;<sup><sub>/ˈpɔrfɔr/ &nbsp;*(poor-for)*</sup></sub>
A from-scratch experimental **AOT** optimizing JS/TS -> Wasm/C engine/compiler/runtime in JS. Not serious/intended for (real) use. (this is a straight forward, honest readme)<br>
Age: ~6 months (very on and off)

## Design
Porffor is a very unique JS engine, due many wildly different approaches. It is seriously limited, but what it can do, it does pretty well. Key differences:
- 100% AOT compiled (no JIT)
- No constant runtime/preluded code
- Least Wasm imports possible (only I/O)

Porffor is primarily built from scratch, the only thing that is not is the parser (using [Acorn](https://github.com/acornjs/acorn)). Binaryen/etc is not used, we make final wasm binaries ourself. You could imagine it as compiling a language which is a sub (some things unsupported) and super (new/custom apis) set of javascript. Not based on any particular spec version, focusing on function/working over spec compliance.

## Usage
Expect nothing to work! Only very limited JS is currently supported. See files in `bench` for examples.

### Install
**`npm install -g porffor@latest`**. It's that easy (hopefully) :)

### Trying a REPL
**`porf`**. Just run it with no script file argument.

### Running a JS file
**`porf path/to/script.js`**

### Compiling to Wasm
**`porf wasm path/to/script.js out.wasm`**. Currently it does not use an import standard like WASI, so it is mostly unusable on its own.

### Compiling to native binaries
> [!WARNING]
> Compiling to native binaries uses [2c](#2c), Porffor's own Wasm -> C compiler, which is experimental.

**`porf native path/to/script.js out(.exe)`**. You can specify the compiler with `--compiler=clang/gcc/zig` (`clang` by default), and which optimization level to use with `--cO=Ofast/O3/O2/O1/O0` (`Ofast` by default). Output binaries are also stripped by default.

### Compiling to C
> [!WARNING]
> Compiling to C uses [2c](#2c), Porffor's own Wasm -> C compiler, which is experimental.

**`porf c path/to/script.js (out.c)`**. When not including an output file, it will be printed to stdout instead.

### Profiling a JS file
> [!WARNING]
> Very experimental WIP feature!

**`porf profile path/to/script.js`**

### Debugging a JS file
> [!WARNING]
> Very experimental WIP feature!

**`porf debug path/to/script.js`**

### Debugging the compiled Wasm of a JS file
> [!WARNING]
> Very experimental WIP feature!

**`porf debug-wasm path/to/script.js`**


### Options
- `--parser=acorn|@babel/parser|meriyah|hermes-parser` (default: `acorn`) to set which parser to use
- `--parse-types` to enable parsing type annotations/typescript. if `-parser` is unset, changes default to `@babel/parser`. does not type check
- `--opt-types` to perform optimizations using type annotations as compiler hints. does not type check
- `--valtype=i32|i64|f64` (default: `f64`) to set valtype
- `-O0` to disable opt
- `-O1` (default) to enable basic opt (simplify insts, treeshake wasm imports)
- `-O2` to enable advanced opt (inlining). unstable
- `-O3` to enable advanceder opt (precompute const math). unstable
- `--no-run` to not run wasm output, just compile
- `--opt-log` to log some opts
- `--code-log` to log some codegen (you probably want `-funcs`)
- `--regex-log` to log some regex
- `--funcs` to log funcs
- `--ast-log` to log AST
- `--opt-funcs` to log funcs after opt
- `--sections` to log sections as hex
- `--opt-no-inline` to not inline any funcs
- `--tail-call` to enable tail calls (experimental + not widely implemented)
- `--compile-hints` to enable V8 compilation hints (experimental + doesn't seem to do much?)

## Limitations
- No full object support yet
- Little built-ins/prototype
- No async/promise/await
- No variables between scopes (except args and globals)
- Literal callees only in calls (eg `print()` works, `a = print; a()` does not)
- No `eval()` etc (since it is AOT)

## Sub-engines

### Asur
Asur is Porffor's own Wasm engine; it is an intentionally simple interpreter written in JS. It is very WIP. See [its readme](asur/README.md) for more details.

### Rhemyn
Rhemyn is Porffor's own regex engine; it compiles literal regex to Wasm bytecode AOT (remind you of anything?). It is quite basic and WIP. See [its readme](rhemyn/README.md) for more details.

### 2c
2c is Porffor's own Wasm -> C compiler, using generated Wasm bytecode and internal info to generate specific and efficient/fast C code. Little boilerplate/preluded code or required external files, just for CLI binaries (not like wasm2c very much).

## Supported
See [optimizations](#optimizations) for opts implemented/supported.

### Proposals
These include some early (stage 1/0) and/or dead (last commit years ago) proposals but *I* think they are pretty neat, so.

#### `Math` proposals (stage 1/0)

- [`Math.clamp` Proposal](https://github.com/Richienb/proposal-math-clamp): `Math.clamp` (stage 0 - last commit april 2023)
- [`Math` Extensions Proposal](https://github.com/rwaldron/proposal-math-extensions): `Math.scale`, `Math.radians`, `Math.degrees`, `Math.RAD_PER_DEG`, `Math.DEG_PER_RAD` (stage 1 - last commit september 2020)
- [`Math.signbit` Proposal](https://github.com/tc39/proposal-Math.signbit): `Math.signbit` (stage 1 - last commit february 2020)

### Language

- Number literals
- Declaring functions
- Calling functions *literal callees only*
- `return`
- `let`/`const`/`var` basic declarations
- Some basic integer operators (`+-/*%`)
- Some basic integer bitwise operators (`&|`)
- Equality operators (`==`, `!=`, etc)
- GT/LT operators (`>`, `<`, `>=`, etc)
- Some unary operators (`!`, `+`, `-`)
- Logical operators (`&&`, `||`)
- Declaring multiple variables in one (`let a, b = 0`)
- Global variables (`var`/none in top scope)
- Functions returning 1 number
- Bool literals as ints (not real type)
- `if` and `if ... else`
- Anonymous functions
- Setting functions using vars (`const foo = function() { ... }`)
- Arrow functions
- `undefined`/`null` as ints (hack)
- Update expressions (`a++`, `++b`, `c--`, etc)
- `for` loops (`for (let i = 0; i < N; i++)`, etc)
- *Basic* objects (hack)
- `console.log` (hack)
- `while` loops
- `break` and `continue`
- Named export funcs
- IIFE support
- Assignment operators (`+=`, `-=`, `>>=`, `&&=`, etc)
- Conditional/ternary operator (`cond ? a : b`)
- Recursive functions
- Bare returns (`return`)
- `throw` (literals only)
- Basic `try { ... } catch { ... }` (no error given)
- Calling functions with non-matching arguments (eg `f(a, b); f(0); f(1, 2, 3);`)
- `typeof`
- Runtime errors for undeclared variables (`ReferenceError`), not functions (`TypeError`)
- Array creation via `[]` (eg `let arr = [ 1, 2, 3 ]`)
- Array member access via `arr[ind]` (eg `arr[0]`)
- String literals (`'hello world'`)
- String member (char) access via `str[ind]` (eg `str[0]`)
- String concat (`+`) (eg `'a' + 'b'`)
- Truthy/falsy (eg `!'' == true`)
- String comparison (eg `'a' == 'a'`, `'a' != 'b'`)
- Nullish coalescing operator (`??`)
- `for...of` (arrays and strings)
- Array member setting (`arr[0] = 2`, `arr[0] += 2`, etc)
- Array constructor (`Array(5)`, `new Array(1, 2, 3)`)
- Labelled statements (`foo: while (...)`)
- `do...while` loops

### Built-ins

- `NaN` and `Infinity`
- `isNaN()` and `isFinite()`
- Most of `Number` (`MAX_VALUE`, `MIN_VALUE`, `MAX_SAFE_INTEGER`, `MIN_SAFE_INTEGER`, `POSITIVE_INFINITY`, `NEGATIVE_INFINITY`, `EPSILON`, `NaN`, `isNaN`, `isFinite`, `isInteger`, `isSafeInteger`)
- Some `Math` funcs (`sqrt`, `abs`, `floor`, `sign`, `round`, `trunc`, `clz32`, `fround`, `random`)
- Basic `globalThis` support
- Basic `Boolean` and `Number`
- Basic `eval` for literals
- `Math.random()` using self-made xorshift128+ PRNG
- Some of `performance` (`now()`, `timeOrigin`)
- Some of `Array.prototype` (`at`, `push`, `pop`, `shift`, `fill`, `slice`, `indexOf`, `lastIndexOf`, `includes`, `with`, `reverse`, `toReversed`)
- Some of `Array` (`of`, `isArray`)
- Most of `String.prototype` (`at`, `charAt`, `charCodeAt`, `toUpperCase`, `toLowerCase`, `startsWith`, `endsWith`, `indexOf`, `lastIndexOf`, `includes`, `padStart`, `padEnd`, `substring`, `substr`, `slice`, `trimStart`, `trimEnd`, `trim`, `toString`, `big`, `blink`, `bold`, `fixed`, `italics`, `small`, `strike`, `sub`, `sup`,  `trimLeft`, `trimRight`, )
- Some of `crypto` (`randomUUID`)
- `escape`
- `btoa`
- Most of `Number.prototype` (`toString`, `toFixed`, `toExponential`)
- `parseInt`
- Spec-compliant `Date`

### Custom

- Supports i32, i64, and f64 for valtypes
- Start of a SIMD api (docs needed)
- Intrinsic functions (see below)
- Inlining wasm via ``asm`...``\` "macro"

## Versioning
Porffor uses a unique versioning system, here's an example: `0.14.0-15cb49f07`. Let's break it down:
1. `0` - major, always `0` as Porffor is not ready yet
2. `14` - minor, total Test262 pass percentage (floored to nearest int)
3. `0` - micro, always `0` as unused
4. `15cb49f07` - commit hash

## Performance
*For the features it supports most of the time*, Porffor is *blazingly fast* compared to most interpreters and common engines running without JIT. For those with JIT, it is usually slower by default, but can catch up with compiler arguments and typed input, even more so when compiling to native binaries.

## Optimizations
Mostly for reducing size. I do not really care about compiler perf/time as long as it is reasonable. We do not use/rely on external opt tools (`wasm-opt`, etc), instead doing optimization inside the compiler itself creating even smaller code sizes than `wasm-opt` itself can produce as we have more internal information.

### Traditional opts
- Inlining functions (WIP, limited)
- Inline const math ops
- Tail calls (behind flag `--tail-call`)

### Wasm transforms
- `local.set`, `local.get` -> `local.tee`
- `i32.const 0`, `i32.eq` -> `i32.eqz`
- `i64.extend_i32_s`, `i32.wrap_i64` -> ``
- `f64.convert_i32_u`, `i32.trunc_sat_f64_s` -> ``
- `return`, `end` -> `end`
- Change const, convert to const of converted valtype (eg `f64.const`, `i32.trunc_sat_f64_s -> `i32.const`)
- Remove some redundant sets/gets
- Remove unneeded single just used vars
- Remove unneeded blocks (no `br`s inside)
- Remove unused imports
- Use data segments for initing arrays/strings
- (Likely more not documented yet, todo)

### Wasm module
- Type cache/index (no repeated types)
- No main func if empty (and other exports)
- No tags if unused/optimized out

## Test262
Porffor can run Test262 via some hacks/transforms which remove unsupported features whilst still doing the same asserts (eg simpler error messages using literals only). It currently passes >14% (see latest commit desc for latest and details). Use `node test262` to test, it will also show a difference of overall results between the last commit and current results.

## Codebase
- `compiler`: contains the compiler itself
  - `builtins.js`: all built-ins of the engine (spec, custom. vars, funcs)
  - `codegen.js`: code (wasm) generation, ast -> wasm. The bulk of the effort
  - `decompile.js`: basic wasm decompiler for debug info
  - `embedding.js`: utils for embedding consts
  - `encoding.js`: utils for encoding things as bytes as wasm expects
  - `expression.js`: mapping most operators to an opcode (advanced are as built-ins eg `f64_%`)
  - `index.js`: doing all the compiler steps, takes code in, wasm out
  - `opt.js`: self-made wasm bytecode optimizer
  - `parse.js`: parser simply wrapping acorn
  - `assemble.js`: assembles wasm ops and metadata into a wasm module/file
  - `wasmSpec.js`: "enums"/info from wasm spec
  - `wrap.js`: wrapper for compiler which instantiates and produces nice exports

- `runner`: contains utils for running JS with the compiler
  - `index.js`: the main file, you probably want to use this
  - `info.js`: runs with extra info printed
  - `repl.js`: basic repl (uses `node:repl`)

- `rhemyn`: contains [Rhemyn](#rhemyn) - our regex engine (used by Porffor)
  - `compile.js`: compiles regex ast into wasm bytecode
  - `parse.js`: own regex parser

- `test`: contains many test files for majority of supported features
- `test262`: test262 runner and utils

## Usecases
Basically none right now (other than giving people headaches). Potential ideas:
- Safety. As Porffor is written in JS, a memory-safe language\*, and compiles JS to Wasm, a fully sandboxed environment\*, it is quite safe. (\* These rely on the underlying implementations being secure. You could also run Wasm, or even Porffor itself, with an interpreter instead of a JIT for bonus security points too.)
- Compiling JS to native binaries. This is still very early!
- More in future probably?

## Todo
No particular order and no guarentees, just what could happen soon™

- Arrays
  - Destructuring
- Objects
  - Basic object expressions (eg `{}`, `{ a: 0 }`)
- Asur
  - Support memory
  - Support exceptions
- More math operators (`**`, etc)
- Typed export inputs (array)
- Exceptions
  - Rewrite to use actual strings (optional?)
  - `try { } finally { }`
  - Rethrowing inside catch
- Optimizations
  - Rewrite local indexes per func for smallest local header and remove unused idxs
  - Smarter inline selection (snapshots?)
  - Remove const ifs (`if (true)`, etc)
  - Memory alignment
  - Add general pref for always using "fast" (non-short circuiting) or/and
- Runtime
  - WASI target
  - Run precompiled Wasm file if given
- Docs
  - Update codebase readme section
- Cool proposals
  - [Optional Chaining Assignment](https://github.com/tc39/proposal-optional-chaining-assignment)
  - [Modulus and Additional Integer Math](https://github.com/tc39/proposal-integer-and-modulus-math)
  - [Array Equality](https://github.com/tc39/proposal-array-equality)
  - [Declarations in Conditionals](https://github.com/tc39/proposal-Declarations-in-Conditionals)
  - [Seeded Pseudo-Random Numbers](https://github.com/tc39/proposal-seeded-random)
  - [`do` expressions](https://github.com/tc39/proposal-do-expressions)
  - [String Trim Characters](https://github.com/Kingwl/proposal-string-trim-characters)
- Posts
  - Inlining investigation
  - JS -> Native
  - Precompiled TS built-ins
  - Asur
  - `escape()` optimization
- Self hosted testing?

## VSCode extension
There is a vscode extension in `vscode-ext` which tweaks JS syntax highlighting to be nicer with porffor features (eg highlighting wasm inside of inline asm).

## Wasm proposals used
Porffor intentionally does not use Wasm proposals which are not commonly implemented yet (eg GC) so it can be used in as many places as possible.

- Multi-value **(required)**
- Non-trapping float-to-int conversions **(required)**
- Bulk memory operations (optional, can get away without sometimes)
- Exception handling (optional, only for errors)
- Tail calls (opt-in, off by default)


## FAQ

### 1. Why the name?
`purple` in Welsh is `porffor`. Why purple?
- No other JS engine is purple colored
- Purple is pretty cool
- Purple apparently represents "ambition", which is.. one word to describe this project
- The hard to speak name is also the noise your brain makes in reaction to this idea!

### 2. Why at all?
Yes!

## 3. Isn't this the same as AssemblyScript/other Wasm langs?
No. they are not alike at all internally and have very different goals/ideals:
- Porffor is made as a generic JS engine, not for Wasm stuff specifically
- Porffor primarily consumes JS
- Porffor is written in pure JS and compiles itself, not using Binaryen/etc
- (Also I didn't know it existed when I started this, lol)
