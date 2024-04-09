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

### Setup
1. Clone this repo (`git clone https://github.com/CanadaHonk/porffor.git`)
2. `npm install` - for parser(s)

### Running a file
The repos comes with easy alias files for Unix and Windows, which you can use like so:
- Unix: `./porf path/to/script.js`
- Windows: `.\porf path/to/script.js`

Please note that further examples below will just use `./porf`, you need to use `.\porf` on Windows. You can also swap out `node` in the alias to use another runtime like Deno (`deno run -A`) or Bun (`bun ...`), or just use it yourself (eg `node runner/index.js ...`, `bun runner/index.js ...`). Node and Bun should work great, Deno support is WIP.

### Trying a REPL
**`./porf`**. Just run it with no script file argument.

### Compiling to native binaries
> [!WARNING]
> Compiling to native binaries uses [2c](#2c), Porffor's own Wasm -> C compiler, which is experimental.

**`./porf native path/to/script.js out(.exe)`**. You can specify the compiler with `-compiler=clang/zig/gcc`, and which opt level to use with `-cO=O3` (`Ofast` by default). Output binaries are also stripped by default.

### Compiling to C
> [!WARNING]
> Compiling to C uses [2c](#2c), Porffor's own Wasm -> C compiler, which is experimental.

**`./porf c path/to/script.js (out.c)`**. When not including an output file, it will be printed to stdout instead.

### Compiling to a Wasm binary
**`./porf compile path/to/script.js out.wasm`**. Currently it does not use an import standard like WASI, so it is mostly unusable.

### Options
- `-target=wasm|c|native` (default: `wasm`) to set target output (native compiles c output to binary, see args below)
- `-target=c|native` only:
  - `-o=out.c|out.exe|out` to set file to output c or binary
- `-target=native` only:
  - `-compiler=clang` to set compiler binary (path/name) to use to compile
  - `-cO=O3` to set compiler opt argument
- `-parser=acorn|@babel/parser|meriyah|hermes-parser` (default: `acorn`) to set which parser to use
- `-parse-types` to enable parsing type annotations/typescript. if `-parser` is unset, changes default to `@babel/parser`. does not type check
- `-opt-types` to perform optimizations using type annotations as compiler hints. does not type check
- `-valtype=i32|i64|f64` (default: `f64`) to set valtype
- `-O0` to disable opt
- `-O1` (default) to enable basic opt (simplify insts, treeshake wasm imports)
- `-O2` to enable advanced opt (inlining). unstable
- `-O3` to enable advanceder opt (precompute const math). unstable
- `-no-run` to not run wasm output, just compile
- `-opt-log` to log some opts
- `-code-log` to log some codegen (you probably want `-funcs`)
- `-regex-log` to log some regex
- `-funcs` to log funcs
- `-ast-log` to log AST
- `-opt-funcs` to log funcs after opt
- `-sections` to log sections as hex
- `-opt-no-inline` to not inline any funcs
- `-tail-call` to enable tail calls (experimental + not widely implemented)
- `-compile-hints` to enable V8 compilation hints (experimental + doesn't seem to do much?)

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

### Built-ins

- `NaN` and `Infinity` (f64 only)
- `isNaN()` and `isFinite()` (f64 only)
- Most of `Number` (`MAX_VALUE`, `MIN_VALUE`, `MAX_SAFE_INTEGER`, `MIN_SAFE_INTEGER`, `POSITIVE_INFINITY`, `NEGATIVE_INFINITY`, `EPSILON`, `NaN`, `isNaN`, `isFinite`, `isInteger`, `isSafeInteger`) (some f64 only)
- Some `Math` funcs (`Math.sqrt`, `Math.abs`, `Math.floor`, `Math.sign`, `Math.round`, `Math.trunc`, `Math.clz32`, `Math.fround`, `Math.random`) (f64 only)
- Basic `globalThis` support
- Basic `Boolean` and `Number`
- Basic `eval` for literals
- `Math.random()` using self-made xorshift128+ PRNG
- Some of `performance` (`now()`)
- Some of `Array.prototype` (`at`, `push`, `pop`, `shift`, `fill`)
- Some of `String.prototype` (`at`, `charAt`, `charCodeAt`)

### Custom

- Supports i32, i64, and f64 for valtypes
- Start of a SIMD api (docs needed)
- Intrinsic functions (see below)
- Inlining wasm via ``asm`...``\` "macro"

## Todo
No particular order and no guarentees, just what could happen soon™

- Arrays
  - More of `Array` prototype
  - Arrays/strings inside arrays
  - Destructuring
- Objects
  - Basic object expressions (eg `{}`, `{ a: 0 }`)
- Asur
  - Support memory
  - Support exceptions
- More math operators (`**`, etc)
- `do { ... } while (...)`
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
- Runtime
  - WASI target
  - Run precompiled Wasm file if given
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
- Self hosted testing?

## Performance
*For the features it supports most of the time*, Porffor is *blazingly fast* compared to most interpreters and common engines running without JIT. For those with JIT, it is usually slower by default, but can catch up with compiler arguments and typed input, even more so when compiling to native binaries.

## Optimizations
Mostly for reducing size. I do not really care about compiler perf/time as long as it is reasonable. We do not use/rely on external opt tools (`wasm-opt`, etc), instead doing optimization inside the compiler itself creating even smaller code sizes than `wasm-opt` itself can produce as we have more internal information.

### Traditional opts
- Inlining functions (WIP, limited)
- Inline const math ops
- Tail calls (behind flag `-tail-call`)

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
Porffor can run Test262 via some hacks/transforms which remove unsupported features whilst still doing the same asserts (eg simpler error messages using literals only). It currently passes >10% (see latest commit desc for latest and details). Use `node test262` to test, it will also show a difference of overall results between the last commit and current results.

## Codebase
- `compiler`: contains the compiler itself
  - `builtins.js`: all built-ins of the engine (spec, custom. vars, funcs)
  - `codeGen.js`: code (wasm) generation, ast -> wasm. The bulk of the effort
  - `decompile.js`: basic wasm decompiler for debug info
  - `embedding.js`: utils for embedding consts
  - `encoding.js`: utils for encoding things as bytes as wasm expects
  - `expression.js`: mapping most operators to an opcode (advanced are as built-ins eg `f64_%`)
  - `index.js`: doing all the compiler steps, takes code in, wasm out
  - `opt.js`: self-made wasm bytecode optimizer
  - `parse.js`: parser simply wrapping acorn
  - `sections.js`: assembles wasm ops and metadata into a wasm module/file
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

## VSCode extension
There is a vscode extension in `vscode-ext` which tweaks JS syntax highlighting to be nicer with porffor features (eg highlighting wasm inside of inline asm).

## Isn't this the same as AssemblyScript/other Wasm langs?
No. they are not alike at all internally and have very different goals/ideals:
- Porffor is made as a generic JS engine, not for Wasm stuff specifically
- Porffor primarily consumes JS
- Porffor is written in pure JS and compiles itself, not using Binaryen/etc
- (Also I didn't know it existed when I started this, lol)

## FAQ

### 1. Why the name?
`purple` in Welsh is `porffor`. Why purple?
- No other JS engine is purple colored
- Purple is pretty cool
- Purple apparently represents "ambition", which is.. one word to describe this project
- The hard to speak name is also the noise your brain makes in reaction to this idea!

### 2. Why at all?
Yes!

### 3. But what about spec compliance?
Lol, no. (sorry.)
