# Rhemyn
A basic experimental WIP regex engine/AOT Wasm compiler in JS. Regex engine for Porffor! Uses own regex parser, no dependencies (excluding porffor internals). <br>
Age: ~1 day (of work)

Made for use with Porffor but could possibly be adapted, implementation/library notes:
- Exposes functions for each regex "operation" (eg test, match)
- Given a regex pattern string (eg `a+`), it returns a "function" object
- Wasm function returned expects an i32 pointer to a UTF-16 string (can add UTF-8 option later if someone else actually wants to use this)

## syntax
🟢 supported 🟡 partial 🟠 parsed only 🔴 unsupported

- 🟢 literal characters (eg `a`)
- 🟢 escaping (eg `\.\n\cJ\x0a\u000a`)
  - 🟢 character itself (eg `\.`)
  - 🟢 escape sequences (eg `\n`)
  - 🟢 control character (eg `\cJ`)
  - 🟢 unicode code points (eg `\x00`, `\u0000`, `\u{10FFFF}`)
- 🟢 sets (eg `[ab]`)
  - 🟢 ranges (eg `[a-z]`)
  - 🟢 negated sets (eg `[^ab]`)
  - 🔴 unicode set expressions (eg `[[a-z]&&[b-e]]`)
- 🟢 metacharacters
  - 🟢 dot (eg `a.b`)
  - 🟢 digit, not digit (eg `\d\D`)
  - 🟢 word, not word (eg `\w\W`)
  - 🟢 whitespace, not whitespace (eg `\s\S`)
  - 🟠 unicode properties (eg `\p{ID_Continue}`)
- 🟡 quantifiers
  - 🟡 star (eg `a*`)
  - 🟡 plus (eg `a+`)
  - 🟡 optional (eg `a?`)
  - 🟠 lazy modifier (eg `a*?`)
  - 🟠 n repetitions (eg `a{4}`)
  - 🟠 n-m repetitions (eg `a{2,4}`)
- 🟠 disjunctions (eg `a|b`)
- 🟠 groups
  - 🟠 capturing groups (eg `(a)`)
  - 🟠 named capturing groups (eg `(?<foo>a)`)
  - 🟠 non-capturing groups (eg `(?:a)`)
  - 🟠 backreferences (eg `\1`)
  - 🟠 named backreferences (eg `\k<foo>`)
- 🟠 assertions
  - 🟠 beginning (eg `^a`)
  - 🟠 end (eg `a$`)
  - 🟠 word boundary assertion (eg `\b\B`)
  - 🟠 positive look-ahead (eg `(?=a)`)
  - 🟠 negative look-ahead (eg `(?!a)`)
  - 🟠 positive look-behind (eg `(?<=a)`)
  - 🟠 negative look-behind (eg `(?<!a)`)
