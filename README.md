# porffor
a basic experimental wip *aot* optimizing js -> wasm engine/compiler/runtime in js. not serious/intended for (real) use. (this is a straight forward, honest readme)<br>
age: ~1 month

## design
porffor is a very unique js engine, due a very different approach. it is seriously limited, but what it can do, it does pretty well. key differences:
- 100% aot compiled *(not jit)*
- everything is a number
- no constant runtime/preluded code
- least Wasm imports possible (only stdio)

porffor is mostly built from scratch, the only thing that is not is the parser (using [acorn](https://github.com/acornjs/acorn)). binaryen/etc is not used, we make final wasm binaries ourself. you could imagine it as compiling a language which is a sub (some things unsupported) and super (new/custom apis) set of javascript. not based on any particular spec version, focusing on function/working over spec compliance.

## limitations
- no full object support yet
- little built-ins/prototype
- no async/promise/await
- no variables between scopes (except args and globals)
- literal callees only in calls (eg `print()` works, `a = print; a()` does not)

## supported
see [optimizations](#optimizations) for opts implemented/supported.

### proposals
these include some early (stage 1/0) and/or dead (last commit years ago) proposals but *I* think they are pretty neat, so.

#### `Math` proposals (stage 1/0)

- [`Math.clamp` Proposal](https://github.com/Richienb/proposal-math-clamp): `Math.clamp` (stage 0 - last commit april 2023)
- [`Math` Extensions Proposal](https://github.com/rwaldron/proposal-math-extensions): `Math.scale`, `Math.radians`, `Math.degrees`, `Math.RAD_PER_DEG`, `Math.DEG_PER_RAD` (stage 1 - last commit september 2020)
- [`Math.signbit` Proposal](https://github.com/tc39/proposal-Math.signbit): `Math.signbit` (stage 1 - last commit february 2020)

### language

- number literals
- declaring functions
- calling functions *literal callees only*
- `return`
- `let`/`const`/`var` basic declarations
- some basic integer operators (`+-/*%`)
- some basic integer bitwise operators (`&|`)
- equality operators (`==`, `!=`, etc)
- gt/lt operators (`>`, `<`, `>=`, etc)
- some unary operators (`!`, `+`, `-`)
- logical operators (`&&`, `||`)
- declaring multiple variables in one (`let a, b = 0`)
- global variables (`var`/none in top scope)
- functions returning 1 number
- bool literals as ints (not real type)
- `if` and `if ... else`
- anonymous functions
- setting functions using vars (`const foo = function() { ... }`)
- arrow functions
- `undefined`/`null` as ints (hack)
- update expressions (`a++`, `++b`, `c--`, etc)
- `for` loops (`for (let i = 0; i < N; i++)`, etc)
- hack for "chars" as ints (`'X'` -> `88`)
- *basic* objects (hack)
- `console.log` (hack)
- `while` loops
- `break` and `continue`
- named export funcs
- iife support
- assignment operators (`+=`, `-=`, `>>=`, `&&=`, etc)
- conditional/ternary operator (`cond ? a : b`)
- recursive functions
- bare returns (`return`)
- `throw` (literals only)
- basic `try { ... } catch { ... }` (no error given)
- calling functions with non-matching arguments (eg `f(a, b); f(0); f(1, 2, 3);`)
- `typeof` mostly (static-ish)
- runtime errors for undeclared variables (`ReferenceError`), not functions (`TypeError`)
- array creation via `[]` (eg `let arr = [ 1, 2, 3 ]`)
- array member access via `arr[ind]` (eg `arr[0]`)
- string literals (`'hello world'`)
- string member (char) access via `str[ind]` (eg `str[0]`)
- string concat (`+`) (eg `'a' + 'b'`)
- truthy/falsy (eg `!'' == true`)
- string comparison (eg `'a' == 'a'`, `'a' != 'b'`)

### built-ins

- `NaN` and `Infinity` (f64 only)
- `isNaN()` and `isFinite()` (f64 only)
- most of `Number` (`MAX_VALUE`, `MIN_VALUE`, `MAX_SAFE_INTEGER`, `MIN_SAFE_INTEGER`, `POSITIVE_INFINITY`, `NEGATIVE_INFINITY`, `EPSILON`, `NaN`, `isNaN`, `isFinite`, `isInteger`, `isSafeInteger`) (some f64 only)
- some `Math` funcs (`Math.sqrt`, `Math.abs`, `Math.floor`, `Math.sign`, `Math.round`, `Math.trunc`, `Math.clz32`, `Math.fround`, `Math.random`) (f64 only)
- basic `globalThis` support
- basic `Boolean` and `Number`
- basic `eval` (literals only)
- `Math.random()` using self-made xorshift128+ PRNG
- some of `performance` (`now()`)
- some of `Array.prototype` (`at`, `push`, `pop`, `shift`)
- some of `String.prototype` (`at`, `charAt`, `charCodeAt`)

### custom

- basic `assert` func
- supports i32, i64, and f64 for valtypes
- wip SIMD api (docs needed)
- intrinsic functions (see below)
- inlining wasm via ``asm`...``\` "macro"

## soon todo
- arrays
  - member setting (`arr[0] = 2`)
  - more of `Array` prototype
  - arrays/strings inside arrays
- strings
  - member setting
- more math operators (`**`, etc)
- `do { ... } while (...)`
- exceptions
  - `try { } finally {}`
  - rethrowing inside catch
- optimizations
  - rewrite local indexes per func for smallest local header and remove unused idxs
  - smarter inline selection (snapshots?)
  - remove const ifs (`if (true)`, etc)
  - use data segments for initing arrays

## test262
porffor can run test262 via some hacks/transforms which remove unsupported features whilst still doing the same asserts (eg simpler error messages using literals only). it currently passes >10% (see latest commit desc for latest and details). use `node test262` to test, it will also show a difference of overall results between the last commit and current results.

## optimizations
mostly for reducing size. do not really care about compiler perf/time as long as it is reasonable. we do not use/rely on external opt tools (`wasm-opt`, etc), instead doing optimization inside the compiler itself creating even smaller code sizes than `wasm-opt` itself can produce as we have more internal information. (this also enables fast + small runtime use as a potential cursed jit in frontend).

### traditional opts
- inlining functions (wip, limited)
- inline const math ops
- tail calls (behind flag `-tail-call`)

### wasm transforms
- `local.set`, `local.get` -> `local.tee`
- `i32.const 0`, `i32.eq` -> `i32.eqz`
- `i64.extend_i32_s`, `i32.wrap_i64` -> ``
- `f64.convert_i32_u`, `i32.trunc_sat_f64_s` -> ``
- `return`, `end` -> `end`
- remove some redundant sets/gets
- remove unneeded single just used vars
- remove unneeded blocks (no `br`s inside)
- remove unused imports

### wasm module
- type cache/index (no repeated types)
- no main func if empty (and other exports)

## codebase
- `compiler`: contains the compiler itself
  - `builtins.js`: all built-ins of the engine (spec, custom. vars, funcs)
  - `codeGen.js`: code (wasm) generation, ast -> wasm, the bulk of the effort
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

- `runner`: contains utils for running js with the compiler
  - `index.js`: the main file, you probably want to use this
  - `info.js`: runs with extra info printed
  - `repl.js`: basic repl (uses `node:repl`)

- `test`: contains many test files for majority of supported features
- `test262`: test262 runner and utils

## usecases
basically none (other than giving people headaches). potential as a tiny fast advanced expression evaluator (for math)?

## usage
basically nothing will work :). see files in `test` for examples.

1. clone repo
2. `npm install`
3. `node test` to run tests (all should pass)
4. `node runner path/to/code.js` to run a file (or `node runner` to use wip repl)

you can also use deno (`deno run -A ...` instead of `node ...`), or bun (`bun ...` instead of `node ...`)

### flags
- `-raw` for no info logs (just raw js output)
- `-valtype=i32|i64|f64` to set valtype, f64 by default
- `-O0` to disable opt
- `-O1` (default) to enable basic opt (simplify insts, treeshake wasm imports)
- `-O2` to enable advanced opt (inlining)
- `-O3` to enable advanceder opt (precompute const math)
- `-no-run` to not run wasm output, just compile
- `-opt-log` to log some opts
- `-code-log` to log some codegen (you probably want `-funcs`)
- `-funcs` to log funcs (internal representations)
- `-opt-funcs` to log funcs after opt
- `-sections` to log sections as hex
- `-opt-no-inline` to not inline any funcs
- `-tail-call` to enable tail calls (not widely implemented)

## vscode extension
there is a vscode extension in `porffor-for-vscode` which tweaks js syntax highlighting to be nicer with porffor features (eg highlighting wasm inside of inline asm).

## wasm output
porffor optimizes for size as much as possible. current output is ~as small as possible (even with manual asm editing) for some simple functions.

### example
this javascript (159 bytes unminified):
```js
function isPrime(number) {
  if (number === 1) return false;

  for (let i = 2; i < number; i++) {
    if (number % i == 0) return false;
  }

  return true;
}
```

compiles into this wasm, in 7.3ms (just compile time), 90 bytes large (including module):
```wasm
(i32) -> (i32) ;; isPrime
  local.get 0 ;; number
  i32.const 1
  i32.eq
  if ;; label @2
    i32.const 0
    return
  end
  i32.const 2
  local.set 1 ;; i
  loop ;; label @2
    local.get 1 ;; i
    local.get 0 ;; number
    i32.lt_s
    if ;; label @3
      local.get 0 ;; number
      local.get 1 ;; i
      i32.rem_s
      i32.eqz
      if ;; label @4
        i32.const 0
        return
      end
      local.get 1 ;; i
      i32.const 1
      i32.add
      local.set 1 ;; i
      br 1 ;; goto @2
    end
  end
  i32.const 1
end
```

## isn't this the same as assemblyscript?
no. they are not alike at all internally and have different goals/ideals:
- porffor is made as a generic js engine, not for wasm stuff specifically
- porffor takes in js, not a different language or typescript like assemblyscript
- porffor is made in pure js and compiles itself, not using binaryen/etc
- (also I didn't know it existed when I started this)

## faq

### 1. why name
`purple` in Welsh is `porffor`. why purple?
- no other js engine is purple colored
- purple is pretty cool
- purple apparently represents "ambition", which is.. one word to describe this project
- the hard to speak name is also the noise your brain makes in reaction to this idea

### 2. why at all
yes.

### 3. but what about spec compliance?
lol, no. (sorry.)
