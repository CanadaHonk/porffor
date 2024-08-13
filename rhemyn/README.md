# Rhemyn
A basic experimental WIP regex engine/AOT Wasm compiler in JS. Regex engine for Porffor! Uses its own regex parser, no dependencies (excluding Porffor internals). <br>
Age: ~1 day (of work)

Made for use with Porffor but could possibly be adapted, implementation/library notes:
- Exposes functions for each regex "operation" (e.g., test, match)
- Given a regex pattern string (e.g., `a+`), it returns a "function" object
- The Wasm function returned expects an i32 pointer to a UTF-16 string (can add UTF-8 option later if needed)

## syntax
🟢 supported 🟡 partial 🟠 parsed only 🔴 unsupported

- 🟢 literal characters (e.g., `a`)
- 🟢 escaping (e.g., `\.\n\cJ\x0a\u000a`)
  - 🟢 character itself (e.g., `\.`)
  - 🟢 escape sequences (e.g., `\n`)
  - 🟢 control character (e.g., `\cJ`)
  - 🟢 unicode code points (e.g., `\x00`, `\u0000`)
- 🟢 sets (e.g., `[ab]`)
  - 🟢 ranges (e.g., `[a-z]`)
  - 🟢 negated sets (e.g., `[^ab]`)
- 🟢 metacharacters
  - 🟢 dot (e.g., `a.b`)
  - 🟢 digit, not digit (e.g., `\d\D`)
  - 🟢 word, not word (e.g., `\w\W`)
  - 🟢 whitespace, not whitespace (e.g., `\s\S`)
- 🟡 quantifiers
  - 🟡 star (e.g., `a*`)
  - 🟡 plus (e.g., `a+`)
  - 🟡 optional (e.g., `a?`)
  - 🟠 lazy modifier (e.g., `a*?`)
  - 🔴 n repetitions (e.g., `a{4}`)
  - 🔴 n-m repetitions (e.g., `a{2,4}`)
- 🟠 groups
  - 🟠 capturing groups (e.g., `(a)`)
  - 🔴 non-capturing groups (e.g., `(?:a)`)
- 🔴 assertions
  - 🔴 beginning (e.g., `^a`)
  - 🔴 end (e.g., `a$`)
  - 🔴 word boundary assertion (e.g., `\b\B`)
