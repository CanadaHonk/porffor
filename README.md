# porffor
a **very basic** wip js wasm jit compiler in js. rough hours of work: 6

## limitations
- **only number type, no string/array/object at all**
- no built-ins/prototype/etc
- no errors
- no global variables
- no variables between scopes (except args)
- literal callees only in calls (eg `print()` works, `a = print; a()` does not)
- there is no version of the spec this is based on, I add (easy) things I use

## supported
- number literals
- declaring functions
- calling functions *literal callees only*
- `return`
- `let`/`const`/`var` basic declarations
- integer `+-/*`

## soon todo
- switch from i32 to f64 for number
- basic arrow functions?
- global variables
- `console.log`/etc hack
- really basic bools
- moar operators
- `if`
- `for (let i = 0; i < N; i++)`/etc

## parser
uses [acorn](https://github.com/acornjs/acorn), pretty neat.

## usage
basically nothing will work :). see files in `test` for examples.

1. clone repo
2. `npm install`
3. `node runner path/to/code.js`
4. profit

### flags
- `-raw` for no info logs (just raw js output)
- `-funcs` to log funcs (internal representations)
- `-sections` to log sections as hex

## faq

### 1. why name
`purple` in Welsh is `porffor`. why purple?
- no other js engine is purple colored
- purple is pretty cool
- purple apparently represents "ambition", which is.. one word to describe this project
- the hard to speak name is also the noise your brain makes in reaction to this idea

### 2. why at all
yes.