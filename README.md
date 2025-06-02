# Porffor &nbsp;<sup><sub>/ˈpɔrfɔr/ &nbsp;*(poor-for)*</sup></sub>
A from-scratch experimental **AOT** optimizing JS/TS -> Wasm/C engine/compiler/runtime in JS. Research project, not yet intended for serious use.<br>

<img src="https://github.com/CanadaHonk/porffor/assets/19228318/de8ad753-8ce3-4dcd-838e-f4d49452f8f8" alt="Screenshot of terminal showing Porffor running and compiling a hello world" width="60%">

## Design
Porffor is a very unique JS engine, due many wildly different approaches. It is seriously limited, but what it can do, it does pretty well. Key differences:
- 100% AOT compiled (no JIT or interpreter)
- Zero constant runtime/preluded code
- Least Wasm imports possible (only I/O)

Porffor is primarily built from scratch, the only thing that is not is the parser (using [Acorn](https://github.com/acornjs/acorn)). Binaryen/etc is not used, we make final wasm binaries ourself. You could imagine it as compiling a language which is a sub (some things unsupported) and super (new/custom apis) set of javascript. Not based on any particular spec version.

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

**`porf native path/to/script.js out(.exe)`**. You can specify the compiler with `--compiler=clang|gcc|zig` (`clang` by default), and which optimization level to use with `--cO=Ofast|O3|O2|O1|O0` (`Ofast` by default). Output binaries are also stripped by default.

### Compiling to C
> [!WARNING]
> Compiling to C uses [2c](#2c), Porffor's own Wasm -> C compiler, which is experimental.

**`porf c path/to/script.js (out.c)`**. When not including an output file, it will be printed to stdout instead.

### Profiling a JS file
> [!WARNING]
> Experimental WIP feature!

**`porf profile path/to/script.js`**

### Debugging a JS file
> [!WARNING]
> Very experimental WIP feature!

**`porf debug path/to/script.js`**

<!-- ### Debugging the compiled Wasm of a JS file
> [!WARNING]
> Very experimental WIP feature!

**`porf dissect path/to/script.js`** -->


### Options
- `--parser=acorn|@babel/parser|meriyah|hermes-parser` (default: `acorn`) to set which parser to use
- `--parse-types` to enable parsing type annotations/typescript. if `-parser` is unset, changes default to `@babel/parser`. does not type check
- `--opt-types` to perform optimizations using type annotations as compiler hints. does not type check
- `--valtype=i32|f64` (default: `f64`) to set valtype
- `-O0` to disable opt
- `-O1` (default) to enable basic opt (simplify insts, treeshake wasm imports)
- `-O2` to enable advanced opt (partial evaluation). unstable!

## Current limitations
- Limited async support (`Promise` and `await` have known bugs)
- No variables between scopes (except args and globals)
- No `eval()`/`Function()` etc (since it is AOT)

## Sub-engines

<!-- ### Asur
Asur is Porffor's own Wasm engine; it is an intentionally simple interpreter written in JS. It is very WIP. See [its readme](asur/README.md) for more details. -->

### 2c
2c is Porffor's own Wasm -> C compiler, using generated Wasm bytecode and internal info to generate specific and efficient C code. Little boilerplate/preluded code or required external files, just for CLI binaries (not like wasm2c very much).

## Versioning
Porffor uses a unique versioning system, here's an example: `0.48.7`. Let's break it down:
1. `0` - major, always `0` as Porffor is not ready yet
2. `48` - minor, total Test262 pass percentage (rounded half down, eg `49.4%` -> `48`, `49.5%` -> `49`)
3. `7` - micro, build number for that minor (incremented each git push)

## Performance
*For the features it supports most of the time*, Porffor is *blazingly fast* compared to most interpreters and common engines running without JIT. For those with JIT, it is usually slower by default, but can catch up with compiler arguments and typed input, even more so when compiling to native binaries.

## Codebase
- `compiler`: contains the compiler itself
  - `builtins`: built-in apis written in typescript
  - `2c.js`: custom wasm-to-c engine
  - `allocator.js`: static/compile-time allocator
  - `assemble.js`: assembles wasm ops and metadata into a spec-compliant wasm module/file
  - `builtins.js`: all manually written built-ins of the engine (spec, custom. vars, funcs)
  - `builtins_object.js`: all the various built-in objects (think `String`, `globalThis`, etc.)
  - `builtins_precompiled.js`: dynamically generated builtins from the `builtins/` folder
  - `codegen.js`: code (wasm) generation, ast -> wasm. The bulk of the effort
  - `cyclone.js`: wasm partial constant evaluator (it is fast and dangerous hence "cyclone")
  - `disassemble.js`: wasm disassembler using internal debug info
  - `encoding.js`: utils for encoding things as bytes as wasm expects
  - `expression.js`: mapping most operators to an opcode (advanced are as built-ins eg `f64_%`)
  - `havoc.js`: wasm rewrite library (it wreaks havoc upon wasm bytecode hence "havoc")
  - `index.js`: doing all the compiler steps, takes code in, wasm out
  - `opt.js`: self-made wasm bytecode optimizer
  - `parse.js`: parser simply wrapping acorn (or other acorn-like parsers)
  - `pgo.js`: a profile guided optimizer
  - `precompile.js`: the tool to generate `builtins_precompied.js`
  - `prefs.js`: a utility to read command line arguments
  - `prototype.js`: some builtin prototype functions (~legacy)
  - `types.js`: definitions for each of the builtin types
  - `wasmSpec.js`: "enums"/info from wasm spec
  - `wrap.js`: wrapper for compiler which instantiates and produces nice exports

- `runtime`: contains utils for running JS with the compiler
  - `index.js`: the main file, you probably want to use this
  - `repl.js`: basic repl (uses `node:repl`)

- `test262`: test262 runner and utils

## Usecases
Currently, Porffor is seriously limited in features and functionality, however it has some key benefits:
- Safety. As Porffor is written in JS, a memory-safe language\*, and compiles JS to Wasm, a fully sandboxed environment\*, it is quite safe. (\* These rely on the underlying implementations being secure. You could also run Wasm, or even Porffor itself, with an interpreter instead of a JIT for bonus security points too.)
- Compiling JS to native binaries. This is still very early!
- Inline Wasm for when you want to beat the compiler in performance, or just want fine grained functionality.
- Potential for SIMD operations and other lower level concepts.
- More in future probably?

## Wasm proposals used
Porffor intentionally does not use Wasm proposals which are not commonly implemented yet (eg GC) so it can be used in as many places as possible.

- Multi-value **(required)**
- Non-trapping float-to-int conversions **(required)**
- Bulk memory operations (optional, can get away without sometimes)
- Exception handling (optional, only for errors)
- Tail calls (opt-in, off by default)

## The name
`purple` in Welsh is `porffor`. Why purple?
- No other JS engine is purple colored
- Purple is pretty cool
- Purple apparently represents "ambition", which is one word to describe this project
