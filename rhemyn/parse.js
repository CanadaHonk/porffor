"use strict";

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

const charNode = char => ({
  type: 'Character',
  char
});

const rangeNode = (from, to) => ({
  type: 'Range',
  from,
  to
});

const parseEscape = (str, index, inSet, unicodeMode, unicodeSetsMode) => {
  const c = str[index++];
  if (!c) {
    throw new SyntaxError('Unterminated escape sequence at end of pattern');
  }
  if (EscapeSequences[c]) {
    return [ EscapeSequences[c], index ];
  }
  if (c === 'c') {
    // \c (not [A-Za-z] ...) = literal \c... (WHY)
    const next = str[index];
    if (next == null || /[^a-zA-Z]/.test(next)) {
      if (unicodeMode) {
        throw new SyntaxError('Invalid control character escape, expected /\\\\c[a-zA-Z]/');
      }
      if (!inSet || /[^0-9_]/.test(next)) {
        return [ '\\', index - 1 ];
      }
      // legacy: \c3 = \x13 and \c_ = \x1F
    }
    // \c[A-Za-z]
    const code = next.charCodeAt(0);
    return [ String.fromCharCode(code % 32), index + 1 ];
  }
  if (c === 'x' || c === 'u') {
    // \x = x
    // \xH = xH
    // \x[0-9a-zA-Z][0-9a-zA-Z] = \xAB
    // '\u' = u
    // '\uHHH' = uHHH
    // '\uABCD' = \uABCD
    if (unicodeMode && str[index] === '{') {
      index++;
      const endIndex = str.indexOf('}', index);
      if (endIndex < 0) {
        throw new SyntaxError('Unterminated unicode character escape');
      }
      const hexStr = str.substring(index, endIndex);
      if (/[^0-9a-fA-F]/.test(hexStr)) {
        throw new SyntaxError('Invalid unicode character escape, expected /\\\\u\\{[0-9a-fA-F]*\\}/');
      }
      const code = parseInt(hexStr, 16);
      if (code >= 0x110000) {
        throw new SyntaxError('Invalid unicode character escape, code point may not be above U+10FFFF');
      }
      return [ String.fromCodePoint(code), endIndex + 1 ];
    }
    const count = c === 'x' ? 2 : 4;
    const next = str.substr(index, count);

    // missing a char or invalid hex digit
    if (next.length < count || /[^0-9a-fA-F]/.test(next)) {
      if (unicodeMode) {
        throw new SyntaxError(`Invalid hex character escape, expected /\\\\${c}[0-9a-fA-F]{${count}}/`);
      }
      return [ c, index ];
    }
    const code = parseInt(next, 16);
    return [ String.fromCharCode(code), index + count ];
  }
  if (inSet && c === 'b') {
    return [ '\b', index ];
  }
  if (unicodeMode) {
    let allowedSymbols = '^$\\.*+?()[]{}|/';
    if (inSet) {
      if (unicodeSetsMode) {
        allowedSymbols += '&-!#%,:;<=>@`~';
      } else {
        allowedSymbols += '-';
      }
    }
    if (!allowedSymbols.includes(c)) {
      throw new SyntaxError(`Invalid identity escape '${c}', expected one of: ${allowedSymbols}`);
    }
  }
  return [ c, index ];
};

const classEscapeNode = (classType, negated) => ({
  type: 'CharacterClassEscape',
  classType,
  negated
});

const unicodeClassEscapeNode = (property, value, negated) => ({
  type: 'CharacterClassEscape',
  classType: 'UnicodeProperty',
  property,
  value,
  negated
});

const parseClassEscape = (str, index, unicodeMode) => {
  switch (str[index]) {
    case 'd': return [ classEscapeNode('Digit', false), index + 1 ];
    case 'D': return [ classEscapeNode('Digit', true), index + 1 ];
    case 's': return [ classEscapeNode('Whitespace', false), index + 1 ];
    case 'S': return [ classEscapeNode('Whitespace', true), index + 1 ];
    case 'w': return [ classEscapeNode('WordCharacter', false), index + 1 ];
    case 'W': return [ classEscapeNode('WordCharacter', true), index + 1 ];
    case 'p':
    case 'P':
      if (!unicodeMode) {
        return [ null, index ];
      }
      const negated = str[index] === 'P';
      index++;
      if (str[index] !== '{') {
        throw new SyntaxError('Invalid escape sequence \\p, expected unicode property \\p{...}');
      }
      index++;
      const endIndex = str.indexOf('}', index);
      if (endIndex < 0) {
        throw new SyntaxError('Unterminated unicode property escape sequence');
      }
      let property = str.substring(index, endIndex);
      let value = null;
      const eq = property.indexOf('=');
      if (eq >= 0) {
        value = property.substring(eq + 1);
        property = property.substring(0, eq);
      }
      // todo: validate unicode property
      return [ unicodeClassEscapeNode(property, value, negated), index ];
    default:
      return [ null, index ];
  }
};

const parseSet = (str, index, unicodeMode, unicodeSetsMode) => {
  let negated = false;
  if (str[index] === '^') {
    negated = true;
    index++;
  }
  if (!unicodeSetsMode) {
    // Simple character classes
    
  }
};

const parseParenthesizedType = (str, index) => {
  if (str[index] !== '?') {
    return [{
      type: 'Group',
      body: [],
      capture: true
    }, index ];
  }
  // special
  index++;
  let c = str[index++];
  switch (c) {
    case ':':
      // non-capturing
      return [ {
        type: 'Group',
        body: []
      }, index ];
    case '=':
      // positive look-ahead
      return [ {
        type: 'LookAhead',
        body: [],
        negated: false
      }, index ];
    case '!':
      // negative look-ahead
      return [ {
        type: 'LookAhead',
        body: [],
        negated: true
      }, index ];
    case '<':
      // look-behind / group name
      c = str[index];
      if (c === '=' || c === '!') {
        return [ {
          type: 'LookBehind',
          body: [],
          negated: c === '!'
        }, index + 1 ];
      }
      const endIndex = str.indexOf('>');
      if (endIndex < 0) {
        throw new SyntaxError('Expected group name after (?<, for look-behinds use (?<= or (?<!');
      }
      const name = str.substring(index, endIndex);
      // todo: validate name
      return [ {
        type: 'Group',
        body: [],
        capture: name
      }, endIndex + 1 ];
    default:
      throw new SyntaxError(`Invalid group specifier: Expected one of (?=, (?! or (?< but found (?${c}`);
  }
};

const parseQuantifier = (str, index) => {
  let c = str[index++];
  switch (c) {
    case '*':
      return [ [ 0 ], index ]; // 0 or above
    case '+':
      return [ [ 1 ], index ]; // 1 or above
    case '?':
      return [ [ 0, 1 ], index ]; // 0 - 1
    case '{':
      if (!(str[index] >= '0' && str[index] <= '9')) {
        return [ new SyntaxError('Invalid quantifier, expected number'), -1 ];
      }
      let min = 0;
      while (str[index] >= '0' && str[index] <= '9') {
        min *= 10;
        min += str.charCodeAt(index++) - 48;
      }
      if (str[index] === '}') {
        return [ [ min, min ], index + 1 ];
      }
      if (str[index] !== ',') {
        return [ new SyntaxError("Invalid quantifier, expected ',' or '}' after minimum count"), -1 ];
      }
      index++;
      if (!(str[index] >= '0' && str[index] <= '9')) {
        if (str[index] !== '}') {
          return [ new SyntaxError("Unclosed quantifier, expected '}'"), -1 ];
        }
        return [ [ min ], index + 1 ];
      }
      let max = 0;
      do {
        max *= 10;
        max += str.charCodeAt(index++) - 48;
      } while (str[index] >= '0' && str[index] <= '9');
      if (str[index] !== '}') {
        return [ new SyntaxError("Unclosed quantifier, expected '}'"), -1 ];
      }
      return [ [ min, max ], index + 1 ];
    default:
      return [ null, index - 1 ];
  }
};

export default (str, unicodeMode = false, unicodeSetsMode = false) => {
  const Metachars = _Metachars();

  const out = {
    type: 'Expression',
    body: []
  };
  let node = out, target = node.body, parents = [];

  let i = 0;
  const applyQuantifier = to => {
    while (true) {
      const [ quantifier, newIndex ] = parseQuantifier(str, i);
      if (newIndex === -1) {
        if (unicodeMode) {
          throw quantifier; // error
        }
        // assume '{'
        to = charNode('{');
        target.push(to);
        i++;
        // perf: try repeating '{' using loop
        continue;
      }
      if (quantifier == null) {
        return;
      }
      i = newIndex;
      to.quantifier = quantifier;
      if (str[i] === '?') {
        to.lazy = true;
        i++;
      }
      break;
    }
  };
  const addChar = (char, quantifiable = true) => {
    const n = charNode(char);
    if (quantifiable) {
      applyQuantifier(n);
    }
    target.push(n);
  };

  while (i < str.length) {
    const c = str[i++];

    switch (c) {
      case '^':
        target.push({
          type: 'Begin'
        });
        break;
      case '$':
        target.push({
          type: 'End'
        });
        break;
      case '\\': {
        if (str[i] >= '1' && str[i] <= '9') {
          let number = str.charCodeAt(i++) - 48;
          while (str[i] >= '0' && str[i] <= '9') {
            number *= 10;
            number += str.charCodeAt(i++) - 48;
          }
          const n = {
            type: 'Backreference',
            number
          };
          target.push(n);
          applyQuantifier(n);
          break;
        }
        if (str[i] === 'k') {
          i++;
          if (str[i] !== '<') {
            // todo: fail if there aren't any named groups
            if (unicodeMode) {
              throw new SyntaxError('Invalid named backreference, expected \\k<...>');
            }
            addChar('k');
            break;
          }
          i++;
          const endIndex = str.indexOf('>', i);
          if (endIndex < 0) {
            // todo: fail if there aren't any named groups
            if (unicodeMode) {
              throw new SyntaxError('Unclosed named backreference');
            }
            addChar('k', false);
            addChar('<');
            break;
          }
          const name = str.substring(i, endIndex);
          // todo: validate name
          const n = {
            type: 'NamedBackreference',
            name
          };
          target.push(n);
          i = endIndex + 1;
          applyQuantifier(n);
          break;
        }
        if (str[i] === 'b') {
          target.push({
            type: 'WordBoundary',
            negated: false
          });
          i++;
          break;
        }
        if (str[i] === 'B') {
          target.push({
            type: 'WordBoundary',
            negated: true
          });
          i++;
          break;
        }
        const [ escape, newIndex ] = parseClassEscape(str, i, unicodeMode, unicodeSetsMode);
        if (escape) {
          target.push(escape);
          i = newIndex;
          applyQuantifier(escape);
          break;
        }
        const [ char, newIndex2 ] = parseEscape(str, i, false, unicodeMode, unicodeSetsMode);
        i = newIndex2;
        addChar(char);
      } break;
      case '[': {
        const [ set, newIndex ] = parseSet(str, i, unicodeMode, unicodeSetsMode);
        target.push(set);
        i = newIndex;
        applyQuantifier(set);
      } break;
      case '(': {
        const [ newNode, newIndex ] = parseParenthesizedType(str, i);
        parents.push(node);
        node = newNode;
        target = node.body;
        i = newIndex;
      } break;
      case ')': {
        let parent = parents.pop();
        if (node.type === 'Disjunction') {
          node = parent;
          parent = parents.pop();
        }
        if (!parent) {
          throw new SyntaxError("Unmatched ')'");
        }
        const newTarget = parent.type === 'Disjunction' ? parent.options.at(-1) : parent.body;
        newTarget.push(node);
        target = newTarget;
        if (node.type === 'Group' || (!unicodeMode && node.type === 'LookAhead')) {
          applyQuantifier(node);
        }
        node = parent;
      } break;
      case '*': case '+': case '?': {
        throw new SyntaxError(`Unexpected quantifier '${c}'`);
      } break;
      case '{': {
        const [ quantifier, newIndex ] = parseQuantifier(str, i - 1);
        if (newIndex === -1) {
          if (unicodeMode) {
            throw quantifier; // error
          }
        } else {
          throw new SyntaxError(`Unexpected quantifier '${str.substring(i - 1, newIndex)}'`);
        }
      } break;
      case '}': case ']': {
        if (unicodeMode) {
          throw new SyntaxError(`Unmatched '${c}'`);
        }
        addChar(c);
      } break;
      case '|': {
        if (node.type !== 'Disjunction') {
          parents.push(node);
          node.body = [ {
            type: 'Disjunction',
            options: [ target ]
          } ];
          node = node.body[0];
        }
        target = [];
        node.options.push(target);
      } break;
      default: {
        addChar(c);
      }
    }
  }

  if (node.type === 'Disjunction') node = parents.pop();

  // still in a group by the end
  if (node.type !== 'Expression') throw new SyntaxError('Unmatched opening parenthesis');

  return out;
};