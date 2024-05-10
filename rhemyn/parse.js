const State = {
  none: 0,
  insideSet: 1
};

const Quantifiers = {
  '*': [ 0 ], // 0 -
  '+': [ 1 ], // 1 -
  '?': [ 0, 1 ], // 0 - 1
};
const QuantifierKeys = Object.keys(Quantifiers);

const getArg = (name, def) => {
  const arg = (typeof process !== 'undefined' ? process.argv : Deno.args).find(x => x.startsWith(`--${name}=`));
  if (arg) return arg.split('=')[0];

  return def;
};

// full is spec-compliant but slower. not needed most of the time. (evil)
const DotChars = () => ({
  full: [ '\n', '\r', '\u2028', '\u2029' ],
  fast: [ '\n', '\r' ]
})[getArg('regex-dot', 'fast')];

const WordChars = () => ({
  full: [ [ 'a', 'z' ], [ 'A', 'Z' ], [ '0', '9' ], '_' ],
  fast: [ [ '_', 'z' ], [ 'A', 'Z' ], [ '0', '9' ] ] // skip individual _ with _-z BUT it also matches '`'
})[getArg('regex-word', 'full')];

const WhitespaceChars = () => ({
  full: [ ' ', '\t', '\n', '\r', '\u2028', '\u2029' ],
  fast: [ ' ', '\t', '\n', '\r' ]
})[getArg('regex-ws', 'fast')];

const _Metachars = () => ({
  unescaped: {
    '.': [ DotChars(), true ], // dot
  },
  escaped: {
    d: [ [ [ '0', '9' ] ], false ], // digit
    D: [ [ [ '0', '9' ] ], true ], // not digit
    w: [ WordChars(), false ], // word
    W: [ WordChars(), true ], // not word
    s: [ WhitespaceChars(), false ], // whitespace
    S: [ WhitespaceChars(), true ], // not whitespace
  }
});

const EscapeSequences = {
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '0': '\0'
};

const HexDigit = /[0-9a-fA-F]/;

export default str => {
  const Metachars = _Metachars();

  const out = {
    type: 'Expression',
    body: []
  };
  let node = out, parents = [];

  let state = State.none, setIndex = 0, escape = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];

    const charNode = char => ({
      type: 'Character',
      char
    });

    const rangeNode = (from, to) => ({
      type: 'Range',
      from,
      to
    });

    const addChar = (char = c) => {
      node.body.push(charNode(char));
    };

    const addSet = (matches, negated = false) => {
      let body = matches.map(x => x[1] ? rangeNode(x[0], x[1]) : charNode(x));
      if (state === State.insideSet) {
        // if negated, mark each node as negated for merge
        if (negated) body = body.map(x => {
          x.negated = true;
          return x;
        });

        // already in set, merge bodies
        node.body.push(...body);
        return;
      }

      node.body.push({
        type: 'Set',
        body,
        negated
      });
    };

    const addMetachar = meta => {
      const [ matches, negated = false ] = meta;
      return addSet(matches, negated);
    };

    // get next char and consume it
    const seek = (allowEscaped = true) => {
      const cNext = str[++i];

      if (cNext === '\\') return !allowEscaped ? undefined : [ str[++i], true ];
      return !allowEscaped ? cNext : [ cNext, false ];
    };

    // get next char without consuming
    const peek = (allowEscaped = true, offset = 0) => {
      const cNext = str[i + 1 + offset];

      if (cNext === '\\') return !allowEscaped ? undefined : [ str[i + 2 + offset], true ];
      return !allowEscaped ? cNext : [ cNext, false ];
    };

    if (escape) {
      escape = false;
      if (EscapeSequences[c]) {
        addChar(EscapeSequences[c]);
        continue;
      }

      if (Metachars.escaped[c]) {
        addMetachar(Metachars.escaped[c]);
        continue;
      }

      if (c === 'c') {
        // \c (not [A-Za-z] ...) = literal \c... (WHY)
        const next = peek(false);
        if (next == null || /[^a-zA-Z]/.test(next)) {
          addChar('\\');
          addChar('c');
          continue;
        }

        // \c[A-Za-z]
        const code = seek(false).charCodeAt(0);
        addChar(String.fromCharCode(code % 32));
        continue;
      }

      if (c === 'x') {
        // \x = x
        // \xH = xH
        // \x[0-9a-zA-Z][0-9a-zA-Z] = \xAB
        const next1 = peek(false);
        const next2 = peek(false, 1);

        // missing a char or invalid hex digit
        if (next1 == null || next2 == null || !HexDigit.test(next1) || !HexDigit.test(next2)) {
          addChar('x');
          continue;
        }

        const code = parseInt(seek(false) + seek(false), 16);
        addChar(String.fromCodePoint(code));
        continue;
      }

      if (c === 'u') {
        // '\u' = u
        // '\uHHH' = uHHH
        // '\uABCD' = \uABCD
        const next1 = peek(false);
        const next2 = peek(false, 1);
        const next3 = peek(false, 2);
        const next4 = peek(false, 3);

        // missing a char or invalid hex digit
        if (next1 == null || next2 == null || next3 == null || next4 == null || !HexDigit.test(next1) || !HexDigit.test(next2) || !HexDigit.test(next3) || !HexDigit.test(next4)) {
          addChar('u');
          continue;
        }

        const code = parseInt(seek(false) + seek(false) + seek(false) + seek(false), 16);
        addChar(String.fromCodePoint(code));
        continue;
      }

      addChar();
      continue;
    }

    if (c === '\\') {
      escape = true;
      continue;
    }

    switch (state) {
      case State.none:
        if (c === '[') {
          parents.push(node);
          node = {
            type: 'Set',
            body: [],
            negated: false
          };

          parents.at(-1).body.push(node);

          state = State.insideSet;
          setIndex = 0;
          continue;
        }

        if (c === '(') {
          parents.push(node);
          node = {
            type: 'Group',
            body: []
          };

          parents.at(-1).body.push(node);
          continue;
        }

        if (c === ')') {
          if (node.type !== 'Group') throw new SyntaxError('Unmatched closing parenthesis');

          node = parents.pop();
          continue;
        }

        if (QuantifierKeys.includes(c)) {
          const last = node.body.at(-1);
          if (!last) continue; // ignore, maybe lookahead

          last.quantifier = Quantifiers[c];

          // lazy modifier
          if (peek(false) === '?') last.lazy = true;

          continue;
        }

        if (Metachars.unescaped[c]) {
          addMetachar(Metachars.unescaped[c]);
          continue;
        }

        addChar();
        break;

      case State.insideSet:
        setIndex++;
        if (setIndex === 1) {
          // first char in set
          if (c === '^') {
            node.negated = true;
            continue;
          }
        }

        if (c === ']') {
          state = State.none;
          node = parents.pop();

          continue;
        }

        // range
        if (c === '-') {
          // start of set (or not char), just literal -
          if (node.body.at(-1)?.char == null) {
            addChar(); // add -
            continue;
          }

          const from = node.body.pop().char;
          const [ to, escaped ] = seek();

          // end of set, just literal -
          if (to == null || (!escaped && to === ']')) {
            addChar(from); // add from char back
            i--; // rollback seek

            addChar(); // add -
            continue;
          }

          // next char was escaped and a metachar, just literal -
          if (escaped && Metachars.escaped[to] != null) {
            i -= 2; // rollback seek

            addChar(); // add -
            continue;
          }

          if (to < from) throw new SyntaxError('Range out of order');

          node.body.push(rangeNode(from, to));
          continue;
        }

        addChar();
        break;
    }
  }

  // still in a group by the end
  if (node.type !== 'Expression') throw new SyntaxError('Unmatched opening parenthesis');

  // still in a set by the end
  if (state === State.insideSet) throw new SyntaxError('Unmatched opening square bracket');

  return out;
};