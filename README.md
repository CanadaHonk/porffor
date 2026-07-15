# Porffor &nbsp;<sup><sub>/ˈpɔrfɔr/ &nbsp;*(poor-for)*</sup></sub>
A from-scratch experimental **AOT** optimizing JS/TS -> C/native engine/compiler/runtime in JS. Research project, not yet intended for serious use.<br>

<img src="https://github.com/CanadaHonk/porffor/assets/19228318/de8ad753-8ce3-4dcd-838e-f4d49452f8f8" alt="Screenshot of terminal showing Porffor running and compiling a hello world" width="60%">

## Design
Porffor is a very unique JS engine, due many wildly different approaches. It is seriously limited, but what it can do, it does pretty well. Key differences:
- 100% AOT compiled (no JIT or interpreter)
- Zero constant runtime/preluded code
- Minimal native runtime imports

Porffor is primarily built from scratch, the only thing that is not is the parser (using [Acorn](https://github.com/acornjs/acorn)). You could imagine it as compiling a language which is a sub (some things unsupported) and super (new/custom apis) set of javascript. Not based on any particular spec version.

## Usage
Expect nothing to work! Only very limited JS is currently supported. See files in `bench` for examples.

### Install
**`npm install -g porffor@latest`**. It's that easy (hopefully) :)

### Trying a REPL
**`porf`**. Just run it with no script file argument.

### Running a JS file
**`porf path/to/script.js`**

### Compiling to native binaries
> [!WARNING]
> Compiling to native binaries uses [2c](#2c), Porffor's own IR -> C compiler, which is experimental.

**`porf native path/to/script.js out(.exe)`**. You can specify the compiler with `--compiler=clang|gcc|zig` (`clang` by default), and which optimization level to use with `--cO=Ofast|O3|O2|O1|O0` (`Ofast` by default). Output binaries are also stripped by default.

### Compiling to C
> [!WARNING]
> Compiling to C uses [2c](#2c), Porffor's own IR -> C compiler, which is experimental.

**`porf c path/to/script.js (out.c)`**. When not including an output file, it will be printed to stdout instead.

### Profiling a JS file
> [!WARNING]
> Experimental WIP feature!

**`porf profile path/to/script.js`**

### Debugging a JS file
> [!WARNING]
> Very experimental WIP feature!

**`porf debug path/to/script.js`**

### Options
- `--parser=acorn|@babel/parser|meriyah|hermes-parser` (default: `acorn`) to set which parser to use
- `--parse-types` to enable parsing type annotations/typescript. if `-parser` is unset, changes default to `@babel/parser`. does not type check
- `--opt-types` to perform optimizations using type annotations as compiler hints. does not type check
- `-O0` to disable opt
- `-O1` (default) to enable basic opt (simplify insts, treeshake low-level imports)
- `-O2` to enable advanced opt (partial evaluation). unstable!

## Current limitations
- Limited async support (`Promise` and `await` have known bugs)
- No variables between scopes (except args and globals)
- No `eval()`/`Function()` etc (since it is AOT)

## Sub-engines

### 2c
2c is Porffor's own IR -> C compiler, using generated low-level instruction arrays and internal info to generate specific and efficient C code. Little boilerplate/preluded code or required external files, just for CLI binaries.

## Versioning
Porffor releases use a monotonically increasing pre-alpha number, beginning with `pre-alpha 1`. The `pre-alpha-1` Git tag is the source of truth; CI increments the latest release tag and injects the version while building without creating a version commit. Version output also identifies the exact source commit and release date, for example `pre-alpha 1 (a3f9c21 2026-07-15)`.

## Performance
*For the features it supports most of the time*, Porffor is *blazingly fast* compared to most interpreters and common engines running without JIT. For those with JIT, it is usually slower by default, but can catch up with compiler arguments and typed input, even more so when compiling to native binaries.

## Codebase
- `compiler`: contains the compiler itself
  - `builtins`: built-in apis written in typescript
  - `2c.js`: custom IR-to-C engine
  - `builtins.js`: all manually written built-ins of the engine (spec, custom. vars, funcs)
  - `builtins_precompiled.js`: generated builtins from the `builtins/` folder
  - `codegen.js`: low-level IR generation. The bulk of the effort
  - `encoding.js`: utils for binary encoding helpers
  - `expression.js`: mapping most operators to an opcode (advanced are as built-ins eg `f64_%`)
  - `index.js`: doing all the compiler steps, takes code in, C/native out
  - `opt.js`: self-made low-level IR optimizer
  - `parse.js`: parser simply wrapping acorn (or other acorn-like parsers)
  - `precompile.js`: the tool to generate `builtins_precompied.js`
  - `prefs.js`: a utility to read command line arguments
  - `prototype.js`: some builtin prototype functions (~legacy)
  - `types.js`: definitions for each of the builtin types
- `runtime`: contains utils for running JS with the compiler
  - `index.js`: the main file, you probably want to use this
  - `repl.js`: basic repl (uses `node:repl`)

- `test262`: test262 runner and utils

## Usecases
Currently, Porffor is seriously limited in features and functionality, however it has some key benefits:
- Safety. As Porffor is written in JS, a memory-safe language\*, it avoids some classes of compiler implementation bugs. (\* This relies on the underlying implementations being secure.)
- Compiling JS to native binaries. This is still very early!
- Low-level intrinsics for when you want to beat the compiler in performance, or just want fine grained functionality.
- Potential for SIMD operations and other lower level concepts.
- More in future probably?

- Bulk memory operations (optional, can get away without sometimes)
- Exception handling (optional, only for errors)
- Tail calls (opt-in, off by default)

## The name
`purple` in Welsh is `porffor`. Why purple?
- No other JS engine is purple colored
- Purple is pretty cool
- Purple apparently represents "ambition", which is one word to describe this project
