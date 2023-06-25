# porffor
a **very basic** wip js wasm compiler in js. this is not a serious project ;)<br>
age: <1 day. rough hours of work: 6

## limitations
- **only number type, no string/array/object/etc at all**
- no built-ins/prototype/etc
- no errors
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
- declaring multiple variables in one
- global variables (`var` in top scope)
- functions returning 1 number
- bool literals as ints (not real type)

## soon todo
- switch from i32 to f64 for number
- basic arrow functions?
- `console.log`/etc hack
- really basic bools (not the actual type just convert to number lol)
- moar math operators
- equality operators
- `if`
- `for (let i = 0; i < N; i++)`/etc
- `assert` func
- inline functions (insane opt)
- tree shake wasm imports (lol)

## usecases
basically none (other than giving people headaches). potential as a tiny fast advanced expression evaluator (for math)?

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