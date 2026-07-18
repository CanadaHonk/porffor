// porffor's own JS + TS parser, single module by design (selfhosted bundling: no cross-module mutable bindings)
import { isIdStartUni, isIdContinueUni } from './unicode.js';

// token kinds
const T_EOF = 0, T_NAME = 1, T_NUM = 2, T_BIGINT = 3, T_STRING = 4, T_REGEXP = 5, T_PRIVATE = 6,
  T_TEMPLATE = 7, T_BACKQUOTE = 8,
  T_LPAREN = 9, T_RPAREN = 10, T_LBRACE = 11, T_RBRACE = 12, T_LBRACKET = 13, T_RBRACKET = 14,
  T_SEMI = 15, T_COMMA = 16, T_COLON = 17, T_QUESTION = 18, T_QDOT = 19, T_DOT = 20, T_ELLIPSIS = 21,
  T_ARROW = 22, T_AT = 23, T_INCDEC = 24, T_PREFIX = 25, T_EQ = 26, T_ASSIGN = 27,
  T_BINOP = 28, T_PLUSMIN = 29, T_STAR = 30, T_STARSTAR = 31, T_SLASH = 32, T_LT = 33, T_GT = 34,
  T_BREAK = 40, T_CASE = 41, T_CATCH = 42, T_CLASS = 43, T_CONST = 44, T_CONTINUE = 45,
  T_DEBUGGER = 46, T_DEFAULT = 47, T_DELETE = 48, T_DO = 49, T_ELSE = 50, T_ENUM = 51,
  T_EXPORT = 52, T_EXTENDS = 53, T_FALSE = 54, T_FINALLY = 55, T_FOR = 56, T_FUNCTION = 57,
  T_IF = 58, T_IMPORT = 59, T_IN = 60, T_INSTANCEOF = 61, T_NEW = 62, T_NULL = 63,
  T_RETURN = 64, T_SUPER = 65, T_SWITCH = 66, T_THIS = 67, T_THROW = 68, T_TRUE = 69,
  T_TRY = 70, T_TYPEOF = 71, T_VAR = 72, T_VOID = 73, T_WHILE = 74, T_WITH = 75;

const keywordKinds = {
  break: T_BREAK, case: T_CASE, catch: T_CATCH, class: T_CLASS, const: T_CONST, continue: T_CONTINUE,
  debugger: T_DEBUGGER, default: T_DEFAULT, delete: T_DELETE, do: T_DO, else: T_ELSE, enum: T_ENUM,
  export: T_EXPORT, extends: T_EXTENDS, false: T_FALSE, finally: T_FINALLY, for: T_FOR, function: T_FUNCTION,
  if: T_IF, import: T_IMPORT, in: T_IN, instanceof: T_INSTANCEOF, new: T_NEW, null: T_NULL,
  return: T_RETURN, super: T_SUPER, switch: T_SWITCH, this: T_THIS, throw: T_THROW, true: T_TRUE,
  try: T_TRY, typeof: T_TYPEOF, var: T_VAR, void: T_VOID, while: T_WHILE, with: T_WITH
};

// lexer state
let input = '', inputLen = 0, pos = 0, isModule = false, ts = false;
let tokKind = T_EOF, tokStart = 0, tokEnd = 0, tokValue = null, tokPrec = 0;
let tokEsc = false, tokOctalPos = -1, newlineBefore = false, prevEnd = 0, prevStart = 0;

const lineCol = p => {
  let line = 1, col = 0;
  for (let i = 0; i < p; i++) {
    const c = input.charCodeAt(i);
    if (c === 10 || c === 8232 || c === 8233 || (c === 13 && input.charCodeAt(i + 1) !== 10)) {
      line++;
      col = 0;
    } else col++;
  }
  return line + ':' + col;
};

const raise = (p, msg) => {
  throw new SyntaxError(`${msg} (${lineCol(p)})`);
};

const isNewline = c => c === 10 || c === 13 || c === 8232 || c === 8233;
const isSpace = c => c === 32 || c === 9 || c === 11 || c === 12 || c === 160 || c === 65279 ||
  (c >= 5760 && (c === 5760 || (c >= 8192 && c <= 8202) || c === 8239 || c === 8287 || c === 12288));

const isIdStart = c => {
  if (c < 65) return c === 36;
  if (c <= 90) return true;
  if (c < 97) return c === 95;
  if (c <= 122) return true;
  if (c < 128) return false;
  return isIdStartUni(c);
};

const isIdChar = c => {
  if (c < 48) return c === 36;
  if (c <= 57) return true;
  if (c < 65) return false;
  if (c <= 90) return true;
  if (c < 97) return c === 95;
  if (c <= 122) return true;
  if (c < 128) return false;
  return isIdContinueUni(c);
};

const fullCodePoint = () => {
  const c = input.charCodeAt(pos);
  if (c >= 0xd800 && c <= 0xdbff) {
    const c2 = input.charCodeAt(pos + 1);
    if (c2 >= 0xdc00 && c2 <= 0xdfff) return (c << 10) + c2 - 0x35fdc00;
  }
  return c;
};

const skipLineComment = () => {
  while (pos < inputLen && !isNewline(input.charCodeAt(pos))) pos++;
};

const skipSpace = () => {
  while (pos < inputLen) {
    const c = input.charCodeAt(pos);
    if (c === 32 || c === 9) {
      pos++;
    } else if (isNewline(c)) {
      newlineBefore = true;
      pos++;
    } else if (c === 47) { // /
      const c2 = input.charCodeAt(pos + 1);
      if (c2 === 47) {
        pos += 2;
        skipLineComment();
      } else if (c2 === 42) { // /*
        const start = pos;
        pos += 2;
        while (true) {
          if (pos >= inputLen) raise(start, 'Unterminated comment');
          const cc = input.charCodeAt(pos);
          if (cc === 42 && input.charCodeAt(pos + 1) === 47) {
            pos += 2;
            break;
          }
          if (isNewline(cc)) newlineBefore = true;
          pos++;
        }
      } else break;
    } else if (c === 60 && !isModule && input.charCodeAt(pos + 1) === 33 &&
        input.charCodeAt(pos + 2) === 45 && input.charCodeAt(pos + 3) === 45) { // <!--
      pos += 4;
      skipLineComment();
    } else if (c === 45 && !isModule && (newlineBefore || prevEnd === 0) &&
        input.charCodeAt(pos + 1) === 45 && input.charCodeAt(pos + 2) === 62) { // -->
      pos += 3;
      skipLineComment();
    } else if (isSpace(c)) {
      pos++;
    } else break;
  }
};

const finishToken = (kind, value = null, prec = 0) => {
  tokKind = kind;
  tokEnd = pos;
  tokValue = value;
  tokPrec = prec;
};

const next = () => {
  prevEnd = tokEnd;
  prevStart = tokStart;
  newlineBefore = false;
  tokEsc = false;
  tokOctalPos = -1;
  skipSpace();
  tokStart = pos;
  if (pos >= inputLen) return finishToken(T_EOF);

  const c = input.charCodeAt(pos);
  if (isIdStart(c) || ((c >= 0xd800 && c <= 0xdbff) && isIdStart(fullCodePoint()))) return readWord();
  if (c === 92) return readWord(); // \uXXXX identifier

  switch (c) {
    case 48: case 49: case 50: case 51: case 52: case 53: case 54: case 55: case 56: case 57:
      return readNumber(false);
    case 34: case 39: return readString(c);
    case 96: pos++; return finishToken(T_BACKQUOTE);
    case 40: pos++; return finishToken(T_LPAREN);
    case 41: pos++; return finishToken(T_RPAREN);
    case 123: pos++; return finishToken(T_LBRACE);
    case 125: pos++; return finishToken(T_RBRACE);
    case 91: pos++; return finishToken(T_LBRACKET);
    case 93: pos++; return finishToken(T_RBRACKET);
    case 59: pos++; return finishToken(T_SEMI);
    case 44: pos++; return finishToken(T_COMMA);
    case 58: pos++; return finishToken(T_COLON);
    case 64: pos++; return finishToken(T_AT);

    case 46: { // .
      const c2 = input.charCodeAt(pos + 1);
      if (c2 >= 48 && c2 <= 57) return readNumber(true);
      if (c2 === 46 && input.charCodeAt(pos + 2) === 46) {
        pos += 3;
        return finishToken(T_ELLIPSIS);
      }
      pos++;
      return finishToken(T_DOT);
    }

    case 63: { // ?
      const c2 = input.charCodeAt(pos + 1);
      if (c2 === 46 && !(input.charCodeAt(pos + 2) >= 48 && input.charCodeAt(pos + 2) <= 57)) {
        pos += 2;
        return finishToken(T_QDOT);
      }
      if (c2 === 63) {
        if (input.charCodeAt(pos + 2) === 61) {
          pos += 3;
          return finishToken(T_ASSIGN, '??=');
        }
        pos += 2;
        return finishToken(T_BINOP, '??', 1);
      }
      pos++;
      return finishToken(T_QUESTION);
    }

    case 61: { // =
      const c2 = input.charCodeAt(pos + 1);
      if (c2 === 61) {
        if (input.charCodeAt(pos + 2) === 61) {
          pos += 3;
          return finishToken(T_BINOP, '===', 7);
        }
        pos += 2;
        return finishToken(T_BINOP, '==', 7);
      }
      if (c2 === 62) {
        pos += 2;
        return finishToken(T_ARROW);
      }
      pos++;
      return finishToken(T_EQ, '=');
    }

    case 33: { // !
      const c2 = input.charCodeAt(pos + 1);
      if (c2 === 61) {
        if (input.charCodeAt(pos + 2) === 61) {
          pos += 3;
          return finishToken(T_BINOP, '!==', 7);
        }
        pos += 2;
        return finishToken(T_BINOP, '!=', 7);
      }
      pos++;
      return finishToken(T_PREFIX, '!');
    }

    case 126: pos++; return finishToken(T_PREFIX, '~');

    case 43: case 45: { // + -
      const c2 = input.charCodeAt(pos + 1);
      if (c2 === c) {
        pos += 2;
        return finishToken(T_INCDEC, c === 43 ? '++' : '--');
      }
      if (c2 === 61) {
        pos += 2;
        return finishToken(T_ASSIGN, c === 43 ? '+=' : '-=');
      }
      pos++;
      return finishToken(T_PLUSMIN, c === 43 ? '+' : '-', 10);
    }

    case 42: { // *
      const c2 = input.charCodeAt(pos + 1);
      if (c2 === 42) {
        if (input.charCodeAt(pos + 2) === 61) {
          pos += 3;
          return finishToken(T_ASSIGN, '**=');
        }
        pos += 2;
        return finishToken(T_STARSTAR, '**', 12);
      }
      if (c2 === 61) {
        pos += 2;
        return finishToken(T_ASSIGN, '*=');
      }
      pos++;
      return finishToken(T_STAR, '*', 11);
    }

    case 47: { // / (comments already skipped)
      if (input.charCodeAt(pos + 1) === 61) {
        pos += 2;
        return finishToken(T_ASSIGN, '/=');
      }
      pos++;
      return finishToken(T_SLASH, '/', 11);
    }

    case 37: { // %
      if (input.charCodeAt(pos + 1) === 61) {
        pos += 2;
        return finishToken(T_ASSIGN, '%=');
      }
      pos++;
      return finishToken(T_BINOP, '%', 11);
    }

    case 38: { // &
      const c2 = input.charCodeAt(pos + 1);
      if (c2 === 38) {
        if (input.charCodeAt(pos + 2) === 61) {
          pos += 3;
          return finishToken(T_ASSIGN, '&&=');
        }
        pos += 2;
        return finishToken(T_BINOP, '&&', 3);
      }
      if (c2 === 61) {
        pos += 2;
        return finishToken(T_ASSIGN, '&=');
      }
      pos++;
      return finishToken(T_BINOP, '&', 6);
    }

    case 124: { // |
      const c2 = input.charCodeAt(pos + 1);
      if (c2 === 124) {
        if (input.charCodeAt(pos + 2) === 61) {
          pos += 3;
          return finishToken(T_ASSIGN, '||=');
        }
        pos += 2;
        return finishToken(T_BINOP, '||', 2);
      }
      if (c2 === 61) {
        pos += 2;
        return finishToken(T_ASSIGN, '|=');
      }
      pos++;
      return finishToken(T_BINOP, '|', 4);
    }

    case 94: { // ^
      if (input.charCodeAt(pos + 1) === 61) {
        pos += 2;
        return finishToken(T_ASSIGN, '^=');
      }
      pos++;
      return finishToken(T_BINOP, '^', 5);
    }

    case 60: { // <
      const c2 = input.charCodeAt(pos + 1);
      if (c2 === 60) {
        if (input.charCodeAt(pos + 2) === 61) {
          pos += 3;
          return finishToken(T_ASSIGN, '<<=');
        }
        pos += 2;
        return finishToken(T_BINOP, '<<', 9);
      }
      if (c2 === 61) {
        pos += 2;
        return finishToken(T_BINOP, '<=', 8);
      }
      pos++;
      return finishToken(T_LT, '<', 8);
    }

    case 62: { // >
      const c2 = input.charCodeAt(pos + 1);
      if (c2 === 62) {
        const c3 = input.charCodeAt(pos + 2);
        if (c3 === 62) {
          if (input.charCodeAt(pos + 3) === 61) {
            pos += 4;
            return finishToken(T_ASSIGN, '>>>=');
          }
          pos += 3;
          return finishToken(T_BINOP, '>>>', 9);
        }
        if (c3 === 61) {
          pos += 3;
          return finishToken(T_ASSIGN, '>>=');
        }
        pos += 2;
        return finishToken(T_BINOP, '>>', 9);
      }
      if (c2 === 61) {
        pos += 2;
        return finishToken(T_BINOP, '>=', 8);
      }
      pos++;
      return finishToken(T_GT, '>', 8);
    }

    case 35: { // #
      pos++;
      const c2 = input.charCodeAt(pos);
      if (!(isIdStart(c2) || c2 === 92 || ((c2 >= 0xd800 && c2 <= 0xdbff) && isIdStart(fullCodePoint()))))
        raise(tokStart, 'Invalid or unexpected token');
      readWord();
      return finishToken(T_PRIVATE, tokValue);
    }
  }

  raise(pos, `Unexpected character '${String.fromCodePoint(fullCodePoint())}'`);
};

// identifiers + keywords
const readWord = () => {
  let word = '', chunkStart = pos, esc = false;
  let first = true;
  while (pos < inputLen) {
    const c = input.charCodeAt(pos);
    if (isIdChar(c)) {
      pos++;
    } else if (c >= 0xd800 && c <= 0xdbff) {
      const cp = fullCodePoint();
      if (!isIdContinueUni(cp)) break;
      pos += 2;
    } else if (c === 92) { // \
      esc = true;
      word += input.slice(chunkStart, pos);
      const escStart = pos;
      pos++;
      if (input.charCodeAt(pos) !== 117) raise(escStart, 'Expecting Unicode escape sequence \\uXXXX'); // u
      pos++;
      const cp = readUnicodeEscape();
      if (first ? !isIdStart(cp) : !isIdChar(cp)) raise(escStart, 'Invalid Unicode escape');
      word += String.fromCodePoint(cp);
      chunkStart = pos;
    } else break;
    first = false;
  }
  word += input.slice(chunkStart, pos);
  tokEsc = esc;

  if (!esc && word.length >= 2 && word.length <= 10) {
    const k = keywordKinds[word];
    if (typeof k === 'number') {
      let prec = 0;
      if (k === T_IN || k === T_INSTANCEOF) prec = 8;
      return finishToken(k, word, prec);
    }
  }
  return finishToken(T_NAME, word);
};

// \uXXXX or \u{...}, pos after the 'u'
const readUnicodeEscape = () => {
  const start = pos;
  if (input.charCodeAt(pos) === 123) { // {
    pos++;
    let cp = 0, any = false;
    while (true) {
      const d = hexDigit(input.charCodeAt(pos));
      if (d < 0) break;
      any = true;
      cp = cp * 16 + d;
      if (cp > 0x10ffff) raise(start, 'Code point out of bounds');
      pos++;
    }
    if (!any || input.charCodeAt(pos) !== 125) raise(start, 'Invalid Unicode escape');
    pos++;
    return cp;
  }

  let cp = 0;
  for (let i = 0; i < 4; i++) {
    const d = hexDigit(input.charCodeAt(pos));
    if (d < 0) raise(start, 'Invalid Unicode escape');
    cp = cp * 16 + d;
    pos++;
  }
  return cp;
};

const hexDigit = c => {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 97 && c <= 102) return c - 87;
  if (c >= 65 && c <= 70) return c - 55;
  return -1;
};

// numbers. readDigits state: accumulated value (exact while <= MAX_SAFE_INTEGER) + flags
let digitsVal = 0, digitsSawSep = false, digitsOverflow = false;

const stripSeps = str => {
  if (str.indexOf('_') === -1) return str;
  let out = '';
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== '_') out += str[i];
  }
  return out;
};

const readNumber = startsWithDot => {
  const start = pos;
  let isFloat = startsWithDot, isBigInt = false, legacyOctal = false, octalLike = false;
  digitsSawSep = false;
  digitsOverflow = false;

  if (!startsWithDot && input.charCodeAt(pos) === 48) { // 0
    const c2 = input.charCodeAt(pos + 1);
    if (c2 === 120 || c2 === 88) return readRadixNumber(16); // xX
    if (c2 === 111 || c2 === 79) return readRadixNumber(8); // oO
    if (c2 === 98 || c2 === 66) return readRadixNumber(2); // bB
    if (c2 === 95) raise(pos + 1, 'Numeric separator can not be used after leading 0'); // _

    if (c2 >= 48 && c2 <= 57) {
      // legacy octal / non-octal decimal
      pos++;
      let sawEight = false, val8 = 0, big = false;
      while (pos < inputLen) {
        const c = input.charCodeAt(pos);
        if (c >= 48 && c <= 55) {
          val8 = val8 * 8 + (c - 48);
          pos++;
        } else if (c === 56 || c === 57) {
          sawEight = true;
          pos++;
        } else break;
      }
      if (input.charCodeAt(pos) === 95) raise(pos, 'Numeric separator is not allowed in legacy octal literals');
      octalLike = true;
      if (!sawEight) {
        legacyOctal = true;
        // legacy octal cannot continue as float/exponent/bigint
        const c = input.charCodeAt(pos);
        if (c === 46 || c === 110 || c === 101 || c === 69) raise(pos, 'Invalid number');
        checkNumberEnd();
        finishToken(T_NUM, val8 > 9007199254740991 ? parseInt(input.slice(start, pos), 8) : val8);
        tokOctalPos = start;
        return;
      }
      // 08 / 09: decimal semantics, may continue as float
    }
  }

  if (!octalLike && !startsWithDot) readDigits(10, false);
  if (startsWithDot) {
    pos++;
    readDigits(10, false);
    isFloat = true;
  } else if (input.charCodeAt(pos) === 46) {
    pos++;
    readDigits(10, true);
    isFloat = true;
  }

  let c = input.charCodeAt(pos);
  if (c === 101 || c === 69) { // eE
    pos++;
    c = input.charCodeAt(pos);
    if (c === 43 || c === 45) pos++;
    readDigits(10, false);
    isFloat = true;
  } else if (c === 110 && !isFloat && !octalLike) { // n
    pos++;
    isBigInt = true;
  }

  checkNumberEnd();
  if (isBigInt) {
    finishToken(T_BIGINT, stripSeps(input.slice(start, pos - 1)));
    return;
  }
  if (!isFloat && !octalLike && !digitsOverflow) {
    // pure decimal int: digit loop already has the exact value
    finishToken(T_NUM, digitsVal);
    return;
  }
  const raw = input.slice(start, pos);
  finishToken(T_NUM, Number(digitsSawSep ? stripSeps(raw) : raw));
  if (octalLike) tokOctalPos = start;
};

const readRadixNumber = radix => {
  const start = pos;
  pos += 2;
  digitsSawSep = false;
  digitsOverflow = false;
  readDigits(radix, false);
  let isBigInt = false;
  if (input.charCodeAt(pos) === 110) { // n
    pos++;
    isBigInt = true;
  }
  checkNumberEnd();
  if (isBigInt) {
    finishToken(T_BIGINT, stripSeps(input.slice(start, pos - 1)));
    return;
  }
  if (!digitsOverflow) {
    finishToken(T_NUM, digitsVal);
    return;
  }
  const raw = input.slice(start, pos);
  finishToken(T_NUM, Number(digitsSawSep ? stripSeps(raw) : raw));
};

const readDigits = (radix, optional) => {
  const start = pos;
  let lastWasSep = false, any = false, val = 0;
  while (pos < inputLen) {
    const c = input.charCodeAt(pos);
    if (c === 95) { // _
      if (!any || lastWasSep) raise(pos, 'Invalid numeric separator');
      lastWasSep = true;
      digitsSawSep = true;
      pos++;
      continue;
    }
    let d;
    if (radix === 16) d = hexDigit(c);
    else if (c >= 48 && c < 48 + radix) d = c - 48;
    else d = -1;
    if (d < 0) break;
    any = true;
    lastWasSep = false;
    val = val * radix + d;
    pos++;
  }
  if (lastWasSep) raise(pos - 1, 'Numeric separator is not allowed at the end');
  if (!any && !optional) raise(start, 'Invalid number');
  // exact only while every intermediate stayed a safe integer
  if (val > 9007199254740991) digitsOverflow = true;
  digitsVal = val;
};

const checkNumberEnd = () => {
  const c = input.charCodeAt(pos);
  if (pos < inputLen && (isIdStart(c) || (c >= 48 && c <= 57) ||
      ((c >= 0xd800 && c <= 0xdbff) && isIdStart(fullCodePoint()))))
    raise(pos, 'Identifier directly after number');
};

const readString = quote => {
  pos++;
  let parts = null, chunkStart = pos;
  while (true) {
    if (pos >= inputLen) raise(tokStart, 'Unterminated string');
    const c = input.charCodeAt(pos);
    if (c === quote) break;
    if (c === 92) { // \
      if (parts === null) parts = [];
      parts.push(input.slice(chunkStart, pos));
      parts.push(readEscapedChar(false));
      chunkStart = pos;
    } else if (c === 10 || c === 13) {
      raise(tokStart, 'Unterminated string');
    } else {
      pos++;
    }
  }
  const last = input.slice(chunkStart, pos);
  pos++;
  finishToken(T_STRING, parts === null ? last : (parts.push(last), parts.join('')));
};

// pos at backslash, -> decoded string, null for invalid template escape
const readEscapedChar = inTemplate => {
  const start = pos;
  pos++;
  const c = input.charCodeAt(pos);
  pos++;
  switch (c) {
    case 110: return '\n'; // n
    case 114: return '\r'; // r
    case 116: return '\t'; // t
    case 98: return '\b'; // b
    case 118: return '\v'; // v
    case 102: return '\f'; // f

    case 120: { // x
      const d1 = hexDigit(input.charCodeAt(pos)), d2 = hexDigit(input.charCodeAt(pos + 1));
      if (d1 < 0 || d2 < 0) {
        if (inTemplate) return null;
        raise(start, 'Invalid hexadecimal escape sequence');
      }
      pos += 2;
      return String.fromCharCode(d1 * 16 + d2);
    }

    case 117: { // u
      if (inTemplate) {
        // tagged templates allow bad \u, try the decode without raising
        const save = pos;
        try {
          return String.fromCodePoint(readUnicodeEscape());
        } catch {
          pos = save;
          return null;
        }
      }
      return String.fromCodePoint(readUnicodeEscape());
    }

    case 13: // \r\n line continuation
      if (input.charCodeAt(pos) === 10) pos++;
      return '';
    case 10: case 8232: case 8233:
      return '';

    case 48: case 49: case 50: case 51: case 52: case 53: case 54: case 55: { // 0-7
      let octal = c - 48;
      const c2 = input.charCodeAt(pos);
      if (octal === 0 && !(c2 >= 48 && c2 <= 57)) return '\0'; // plain \0
      if (inTemplate) return null;
      // legacy octal escape (sloppy strings only, checked by parser)
      if (tokOctalPos < 0) tokOctalPos = start;
      if (c <= 51 && c2 >= 48 && c2 <= 55) { // up to 3 digits when first <= 3
        octal = octal * 8 + c2 - 48;
        pos++;
        const c3 = input.charCodeAt(pos);
        if (c3 >= 48 && c3 <= 55) {
          octal = octal * 8 + c3 - 48;
          pos++;
        }
      } else if (c2 >= 48 && c2 <= 55) {
        octal = octal * 8 + c2 - 48;
        pos++;
      }
      return String.fromCharCode(octal);
    }

    case 56: case 57: // 8 9
      if (inTemplate) return null;
      if (tokOctalPos < 0) tokOctalPos = start;
      return String.fromCharCode(c);

    default:
      if (pos > inputLen) raise(tokStart, 'Unterminated string');
      return String.fromCharCode(c);
  }
};

// template element from tokEnd (current token ` or }), finishes T_TEMPLATE { raw, cooked (null on invalid escape), tail }
const readTmplToken = () => {
  prevEnd = tokEnd;
  prevStart = tokStart;
  newlineBefore = false;
  pos = tokEnd;
  tokStart = pos;
  let parts = null, chunkStart = pos, invalid = false, tail = false;
  while (true) {
    if (pos >= inputLen) raise(tokStart, 'Unterminated template');
    const c = input.charCodeAt(pos);
    if (c === 96) { // `
      tail = true;
      break;
    }
    if (c === 36 && input.charCodeAt(pos + 1) === 123) break; // ${
    if (c === 92) {
      if (parts === null) parts = [];
      parts.push(input.slice(chunkStart, pos));
      const piece = readEscapedChar(true);
      if (piece === null) invalid = true;
      else parts.push(piece);
      chunkStart = pos;
    } else if (c === 13) {
      if (parts === null) parts = [];
      parts.push(input.slice(chunkStart, pos));
      parts.push('\n');
      pos++;
      if (input.charCodeAt(pos) === 10) pos++;
      chunkStart = pos;
    } else {
      pos++;
    }
  }
  const lastPart = input.slice(chunkStart, pos);
  const out = parts === null ? lastPart : (parts.push(lastPart), parts.join(''));
  const rawEnd = pos;
  pos += tail ? 1 : 2;
  const raw = input.slice(tokStart, rawEnd).replace(/\r\n?/g, '\n');
  finishToken(T_TEMPLATE, { raw, cooked: invalid ? null : out, tail });
};

// current token / or /=, re-lex from tokStart as a regex
const readRegexp = () => {
  pos = tokStart + 1;
  let inClass = false, escaped = false;
  while (true) {
    if (pos >= inputLen) raise(tokStart, 'Unterminated regular expression');
    const c = input.charCodeAt(pos);
    if (isNewline(c)) raise(tokStart, 'Unterminated regular expression');
    if (escaped) {
      escaped = false;
    } else if (c === 92) {
      escaped = true;
    } else if (c === 91) { // [
      inClass = true;
    } else if (c === 93) { // ]
      inClass = false;
    } else if (c === 47 && !inClass) { // /
      break;
    }
    pos++;
  }
  const pattern = input.slice(tokStart + 1, pos);
  pos++;

  const flagsStart = pos;
  while (pos < inputLen) {
    const c = input.charCodeAt(pos);
    if (isIdChar(c)) pos++;
    else if (c === 92 || (c >= 0xd800 && c <= 0xdbff && isIdContinueUni(fullCodePoint()))) raise(pos, 'Invalid regular expression flag');
    else break;
  }
  const flags = input.slice(flagsStart, pos);

  let seen = '';
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i];
    if (!'dgimsuvy'.includes(f) || seen.includes(f)) raise(flagsStart, 'Invalid regular expression flags');
    seen += f;
  }
  if (seen.includes('u') && seen.includes('v')) raise(flagsStart, 'Invalid regular expression flags');

  // pattern validation delegates to the host regex engine (selfhosted: regexp.ts)
  try {
    new RegExp(pattern, flags);
  } catch (e) {
    raise(tokStart, `Invalid regular expression: ${e.message}`);
  }

  finishToken(T_REGEXP, { pattern, flags });
};

// splits a >>-family token in type contexts: consumes one '>' and re-forms the rest
const splitGt = () => {
  const v = tokValue;
  tokStart++;
  if (v === '>>') finishToken(T_GT, '>', 8);
  else if (v === '>>>') finishToken(T_BINOP, '>>', 9);
  else if (v === '>=') finishToken(T_EQ, '=');
  else if (v === '>>=') finishToken(T_BINOP, '>=', 8);
  else if (v === '>>>=') finishToken(T_ASSIGN, '>>=');
  tokEnd = tokStart + (typeof tokValue === 'string' ? tokValue.length : 1);
};

const initLexer = (src, module, typescript) => {
  input = src;
  inputLen = src.length;
  pos = 0;
  isModule = module;
  ts = typescript;
  tokKind = T_EOF;
  tokStart = tokEnd = prevEnd = prevStart = 0;
  tokValue = null;
  tokPrec = 0;
  newlineBefore = false;

  // hashbang
  if (src.charCodeAt(0) === 35 && src.charCodeAt(1) === 33) {
    pos = 2;
    skipLineComment();
  }
};

const SCOPE_TOP = 1, SCOPE_FUNCTION = 2, SCOPE_ASYNC = 4, SCOPE_GENERATOR = 8, SCOPE_ARROW = 16,
  SCOPE_SIMPLE_CATCH = 32, SCOPE_SUPER = 64, SCOPE_DIRECT_SUPER = 128, SCOPE_STATIC_BLOCK = 256,
  SCOPE_FIELD_INIT = 512, SCOPE_VAR = SCOPE_TOP | SCOPE_FUNCTION | SCOPE_STATIC_BLOCK;
const BIND_VAR = 1, BIND_LEXICAL = 2, BIND_FUNCTION = 3, BIND_SIMPLE_CATCH = 4, BIND_OUTSIDE = 5;

let strict = false;
let scopeStack = [];
let labels = [];
let privateStack = [];
let potentialArrowAt = -1, potentialArrowInForAwait = false;
let yieldPos = 0, awaitPos = 0, awaitIdentPos = 0;
let undefinedExports = null;

const functionFlags = (async, generator) =>
  SCOPE_FUNCTION | (async ? SCOPE_ASYNC : 0) | (generator ? SCOPE_GENERATOR : 0);

// per-scope name bitmap: 1 = var, 2 = lexical, 4 = function.
// '__proto__' needs a scalar slot: computed ['__proto__'] writes don't stick selfhosted
const enterScope = flags => {
  scopeStack.push({ flags, names: { __proto__: null }, protoBits: 0, catchParam: null });
};

const nameBits = (scope, name) =>
  name === '__proto__' ? scope.protoBits : (scope.names[name] | 0);

const addNameBit = (scope, name, bit) => {
  if (name === '__proto__') scope.protoBits |= bit;
  else scope.names[name] = (scope.names[name] | 0) | bit;
};
const exitScope = () => scopeStack.pop();

const currentScope = () => scopeStack[scopeStack.length - 1];
const currentVarScope = () => {
  for (let i = scopeStack.length - 1; ; i--) {
    if (scopeStack[i].flags & (SCOPE_VAR | SCOPE_FIELD_INIT)) return scopeStack[i];
  }
};
const currentThisScope = () => {
  for (let i = scopeStack.length - 1; ; i--) {
    if ((scopeStack[i].flags & (SCOPE_VAR | SCOPE_FIELD_INIT)) && !(scopeStack[i].flags & SCOPE_ARROW)) return scopeStack[i];
  }
};

const inFunction = () => (currentVarScope().flags & SCOPE_FUNCTION) > 0;
const inGenerator = () => (currentVarScope().flags & SCOPE_GENERATOR) > 0;
const inAsync = () => (currentVarScope().flags & SCOPE_ASYNC) > 0;
const canAwait = () => {
  for (let i = scopeStack.length - 1; i >= 0; i--) {
    const flags = scopeStack[i].flags;
    if (flags & (SCOPE_STATIC_BLOCK | SCOPE_FIELD_INIT)) return false;
    if (flags & SCOPE_FUNCTION) return (flags & SCOPE_ASYNC) > 0;
  }
  return isModule;
};
const allowSuper = () => (currentThisScope().flags & SCOPE_SUPER) > 0;
const allowDirectSuper = () => (currentThisScope().flags & SCOPE_DIRECT_SUPER) > 0;
const allowNewDotTarget = () => {
  for (let i = scopeStack.length - 1; i >= 0; i--) {
    const flags = scopeStack[i].flags;
    if ((flags & (SCOPE_STATIC_BLOCK | SCOPE_FIELD_INIT)) ||
        ((flags & SCOPE_FUNCTION) && !(flags & SCOPE_ARROW))) return true;
  }
  return false;
};

const treatFunctionsAsVarInScope = scope =>
  (scope.flags & SCOPE_FUNCTION) > 0 || (!isModule && (scope.flags & SCOPE_TOP));

const declareName = (name, bindingType, p) => {
  let redeclared = false;
  if (bindingType === BIND_LEXICAL) {
    const scope = currentScope();
    redeclared = nameBits(scope, name) !== 0;
    addNameBit(scope, name, 2);
    if (isModule && (scope.flags & SCOPE_TOP)) undefinedExports?.delete(name);
  } else if (bindingType === BIND_SIMPLE_CATCH) {
    const scope = currentScope();
    addNameBit(scope, name, 2);
    scope.catchParam = name;
  } else if (bindingType === BIND_FUNCTION) {
    const scope = currentScope();
    const bits = nameBits(scope, name);
    if (treatFunctionsAsVarInScope(scope)) redeclared = (bits & 2) !== 0;
    else redeclared = (bits & 3) !== 0;
    addNameBit(scope, name, 4);
  } else {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      const scope = scopeStack[i];
      const bits = nameBits(scope, name);
      if (((bits & 2) && !((scope.flags & SCOPE_SIMPLE_CATCH) && scope.catchParam === name)) ||
          (!treatFunctionsAsVarInScope(scope) && (bits & 4))) {
        redeclared = true;
        break;
      }
      addNameBit(scope, name, 1);
      if (isModule && (scope.flags & SCOPE_TOP)) undefinedExports?.delete(name);
      if (scope.flags & SCOPE_VAR) break;
    }
  }
  if (redeclared) raise(p, `Identifier '${name}' has already been declared`);
};

const checkLocalExport = id => {
  if ((nameBits(scopeStack[0], id.name) & 3) === 0) undefinedExports?.set(id.name, id.start);
};

const eat = kind => {
  if (tokKind === kind) {
    next();
    return true;
  }
  return false;
};

const expect = kind => {
  if (!eat(kind)) unexpected();
};

const unexpected = (p = tokStart) => {
  if (tokKind === T_EOF) raise(p, 'Unexpected end of input');
  raise(p, `Unexpected token '${input.slice(tokStart, tokEnd)}'`);
};

const isContextual = name => tokKind === T_NAME && tokValue === name && !tokEsc;
const eatContextual = name => {
  if (isContextual(name)) {
    next();
    return true;
  }
  return false;
};
const expectContextual = name => {
  if (!eatContextual(name)) unexpected();
};

const canInsertSemicolon = () => tokKind === T_EOF || tokKind === T_RBRACE || newlineBefore;
const semicolon = () => {
  if (!eat(T_SEMI) && !canInsertSemicolon()) unexpected();
};

const saveState = () => [ pos, tokKind, tokStart, tokEnd, tokValue, tokPrec, tokEsc, tokOctalPos, newlineBefore, prevEnd, prevStart ];
const restoreState = s => {
  pos = s[0]; tokKind = s[1]; tokStart = s[2]; tokEnd = s[3]; tokValue = s[4]; tokPrec = s[5];
  tokEsc = s[6]; tokOctalPos = s[7]; newlineBefore = s[8]; prevEnd = s[9]; prevStart = s[10];
};

// lookahead: [kind, value, start, esc, newlineBefore]
const peekToken = () => {
  const s = saveState();
  next();
  const out = [ tokKind, tokValue, tokStart, tokEsc, newlineBefore ];
  restoreState(s);
  return out;
};

// destructuring-errors side channel
const newRefDE = () => ({ shorthandAssign: -1, trailingComma: -1, parenthesizedAssign: -1, parenthesizedBind: -1, doubleProto: -1 });

const checkExpressionErrors = (refDE, andThrow) => {
  if (!refDE) return false;
  const { shorthandAssign, doubleProto } = refDE;
  if (!andThrow) return shorthandAssign >= 0 || doubleProto >= 0;
  if (shorthandAssign >= 0) raise(shorthandAssign, 'Shorthand property assignments are valid only in destructuring patterns');
  if (doubleProto >= 0) raise(doubleProto, 'Redefinition of __proto__ property');
};

const checkPatternErrors = (refDE, isAssign) => {
  if (!refDE) return;
  if (refDE.trailingComma >= 0) raise(refDE.trailingComma, 'Comma is not permitted after the rest element');
  const parens = isAssign ? refDE.parenthesizedAssign : refDE.parenthesizedBind;
  if (parens >= 0) raise(parens, isAssign ? 'Assigning to rvalue' : 'Parenthesized pattern');
};

const checkYieldAwaitInDefaultParams = () => {
  if (yieldPos && (!awaitPos || yieldPos < awaitPos)) raise(yieldPos, 'Yield expression cannot be a default value');
  if (awaitPos) raise(awaitPos, 'Await expression cannot be a default value');
};

// reserved words
const isStrictReserved = name => {
  switch (name) {
    case 'implements': case 'interface': case 'let': case 'package': case 'private':
    case 'protected': case 'public': case 'static': case 'yield':
      return true;
  }
  return false;
};

const inClassStaticBlock = () => (currentVarScope().flags & SCOPE_STATIC_BLOCK) > 0;

const checkUnreserved = (start, name) => {
  if (inGenerator() && name === 'yield') raise(start, "Cannot use 'yield' as identifier inside a generator");
  if (inAsync() && name === 'await') raise(start, "Cannot use 'await' as identifier inside an async function");
  if (!(currentThisScope().flags & SCOPE_VAR) && name === 'arguments') raise(start, "Cannot use 'arguments' in class field initializer");
  if (inClassStaticBlock() && (name === 'arguments' || name === 'await'))
    raise(start, `Cannot use ${name} in class static initialization block`);
  if (typeof keywordKinds[name] === 'number') raise(start, `Unexpected keyword '${name}'`);
  if (name === 'enum') raise(start, `The keyword '${name}' is reserved`);
  if (isModule && name === 'await') raise(start, "Cannot use keyword 'await' outside an async function");
  if (strict && isStrictReserved(name)) raise(start, `The keyword '${name}' is reserved`);
};

const parseIdentNode = () => {
  const start = tokStart;
  let name;
  if (tokKind === T_NAME) name = tokValue;
  else if (tokKind >= T_BREAK) name = tokValue; // keyword used liberally
  else unexpected();
  return { type: 'Identifier', start, end: tokEnd, name };
};

const parseIdent = liberal => {
  const node = parseIdentNode();
  const wasEsc = tokEsc;
  if (!liberal && tokKind !== T_NAME) unexpected();
  next();
  if (!liberal) {
    if (wasEsc && typeof keywordKinds[node.name] === 'number')
      raise(node.start, 'Escape sequence in keyword ' + node.name);
    checkUnreserved(node.start, node.name);
    if (node.name === 'await' && !awaitIdentPos) awaitIdentPos = node.start;
  }
  return node;
};

const parsePrivateIdent = () => {
  if (tokKind !== T_PRIVATE) unexpected();
  const node = { type: 'PrivateIdentifier', start: tokStart, end: tokEnd, name: tokValue };
  next();
  if (privateStack.length === 0) raise(node.start, `Private field '#${node.name}' must be declared in an enclosing class`);
  else privateStack[privateStack.length - 1].used.push(node);
  return node;
};

// lvalue conversion + checks
const toAssignable = (node, isBinding, refDE) => {
  switch (node.type) {
    case 'Identifier':
      if (inAsync() && node.name === 'await') raise(node.start, "Cannot use 'await' as identifier inside an async function");
      break;

    case 'ObjectPattern': case 'ArrayPattern': case 'AssignmentPattern': case 'RestElement':
      break;

    case 'ObjectExpression':
      node.type = 'ObjectPattern';
      if (refDE) checkPatternErrors(refDE, true);
      for (const prop of node.properties) {
        toAssignable(prop, isBinding);
        if (prop.type === 'RestElement' && (prop.argument.type === 'ArrayPattern' || prop.argument.type === 'ObjectPattern'))
          raise(prop.argument.start, 'Unexpected token');
      }
      break;

    case 'Property':
      if (node.kind !== 'init') raise(node.key.start, "Object pattern can't contain getter or setter");
      toAssignable(node.value, isBinding);
      break;

    case 'ArrayExpression':
      node.type = 'ArrayPattern';
      if (refDE) checkPatternErrors(refDE, true);
      for (const elem of node.elements) {
        if (elem !== null) toAssignable(elem, isBinding);
      }
      break;

    case 'SpreadElement':
      node.type = 'RestElement';
      toAssignable(node.argument, isBinding);
      if (node.argument.type === 'AssignmentPattern') raise(node.argument.start, 'Rest elements cannot have a default value');
      break;

    case 'AssignmentExpression':
      if (node.operator !== '=') raise(node.left.end, "Only '=' operator can be used for specifying default value.");
      node.type = 'AssignmentPattern';
      node.operator = undefined;
      toAssignable(node.left, isBinding);
      break;

    case 'MemberExpression':
      if (!isBinding) break;
      raise(node.start, 'Binding member expression');

    default:
      raise(node.start, (isBinding ? 'Binding' : 'Assigning to') + ' rvalue');
  }
  return node;
};

// raw (non-pattern) assignment target
const checkLValSimple = (node, bindingType = 0) => {
  const isBind = bindingType !== 0;
  switch (node.type) {
    case 'Identifier':
      if (strict && (node.name === 'eval' || node.name === 'arguments'))
        raise(node.start, `${isBind ? 'Binding' : 'Assigning to'} '${node.name}' in strict mode`);
      if (isBind) {
        if (bindingType === BIND_LEXICAL && node.name === 'let')
          raise(node.start, 'let is disallowed as a lexically bound name');
        if (bindingType !== BIND_OUTSIDE) declareName(node.name, bindingType, node.start);
      }
      break;

    case 'ChainExpression':
      raise(node.start, 'Optional chaining cannot appear in left-hand side');

    case 'MemberExpression':
      if (isBind) raise(node.start, 'Binding member expression');
      break;

    case 'CallExpression':
      if (isBind) raise(node.start, 'Binding call expression');
      if (strict) raise(node.start, 'Assigning to rvalue');
      break;

    case 'ParenthesizedExpression':
      if (isBind) raise(node.start, 'Binding parenthesized expression');
      return checkLValSimple(node.expression, bindingType);

    case 'TSAsExpression': case 'TSSatisfiesExpression': case 'TSNonNullExpression':
      return checkLValSimple(node.expression, bindingType);

    default:
      raise(node.start, (isBind ? 'Binding' : 'Assigning to') + ' rvalue');
  }
};

const checkLValPattern = (node, bindingType = 0) => {
  switch (node.type) {
    case 'ObjectPattern':
      for (const prop of node.properties) checkLValInnerPattern(prop, bindingType);
      break;

    case 'ArrayPattern':
      for (const elem of node.elements) {
        if (elem !== null) checkLValInnerPattern(elem, bindingType);
      }
      break;

    default:
      checkLValSimple(node, bindingType);
  }
};

const checkLValInnerPattern = (node, bindingType = 0) => {
  switch (node.type) {
    case 'Property':
      checkLValInnerPattern(node.value, bindingType);
      break;

    case 'AssignmentPattern':
      checkLValPattern(node.left, bindingType);
      break;

    case 'RestElement':
      checkLValPattern(node.argument, bindingType);
      break;

    case 'TSParameterProperty':
      checkLValInnerPattern(node.parameter, bindingType);
      break;

    default:
      checkLValPattern(node, bindingType);
  }
};

// binding patterns (declaration positions)
const parseBindingAtom = () => {
  switch (tokKind) {
    case T_LBRACKET: {
      const start = tokStart;
      next();
      const elements = parseBindingList(T_RBRACKET, true, true);
      return { type: 'ArrayPattern', start, end: prevEnd, elements };
    }
    case T_LBRACE:
      return parseObj(true);
  }
  return parseIdent(false);
};

const parseBindingList = (close, allowEmpty, allowTrailingComma, allowModifiers = false) => {
  const elts = [];
  let first = true;
  while (!eat(close)) {
    if (first) first = false;
    else expect(T_COMMA);
    if (allowEmpty && tokKind === T_COMMA) {
      elts.push(null);
    } else if (allowTrailingComma && afterTrailingComma(close)) {
      break;
    } else if (tokKind === T_ELLIPSIS) {
      const rest = parseRestBinding();
      parseBindingListItem(rest);
      elts.push(rest);
      if (tokKind === T_COMMA) raise(tokStart, 'Comma is not permitted after the rest element');
      expect(close);
      break;
    } else {
      elts.push(parseAssignableListItem(allowModifiers));
    }
  }
  return elts;
};

// TS overrides these for parameter properties/annotations
const parseAssignableListItem = allowModifiers => {
  if (ts) return tsParseAssignableListItem(allowModifiers);
  const elem = parseMaybeDefault(tokStart);
  parseBindingListItem(elem);
  return elem;
};
const parseBindingListItem = param => {
  if (ts) tsParseBindingListItem(param);
  return param;
};

const parseRestBinding = () => {
  const start = tokStart;
  next();
  const argument = parseBindingAtom();
  return { type: 'RestElement', start, end: prevEnd, argument };
};

const parseMaybeDefault = (startPos, left = null) => {
  left = left ?? parseBindingAtom();
  if (ts) {
    if (tokKind === T_QUESTION) {
      left.optional = true;
      left.end = tokEnd;
      next();
    }
    if (tokKind === T_COLON) left = tsParamAnnotation(left);
  }
  if (tokKind !== T_EQ) return left;
  next();
  const right = parseMaybeAssign(false);
  return { type: 'AssignmentPattern', start: startPos, end: prevEnd, left, right };
};

const afterTrailingComma = (close, notNext) => {
  if (tokKind === close) {
    if (!notNext) next();
    return true;
  }
  return false;
};

const parseExpression = (noIn, refDE) => {
  const start = tokStart;
  const expr = parseMaybeAssign(noIn, refDE);
  if (tokKind === T_COMMA) {
    const expressions = [ expr ];
    while (eat(T_COMMA)) expressions.push(parseMaybeAssign(noIn, refDE));
    return { type: 'SequenceExpression', start, end: prevEnd, expressions };
  }
  return expr;
};

const parseMaybeAssign = (noIn, refDE, afterLeftParse) => {
  if (isContextual('yield') && inGenerator()) return parseYield(noIn);

  let ownDE = false;
  let oldParenAssign = -1, oldTrailingComma = -1, oldDoubleProto = -1;
  if (refDE) {
    oldParenAssign = refDE.parenthesizedAssign;
    oldTrailingComma = refDE.trailingComma;
    oldDoubleProto = refDE.doubleProto;
    refDE.parenthesizedAssign = refDE.trailingComma = refDE.doubleProto = -1;
  } else {
    refDE = newRefDE();
    ownDE = true;
  }

  const start = tokStart;
  if (tokKind === T_LPAREN || tokKind === T_NAME) {
    potentialArrowAt = tokStart;
    potentialArrowInForAwait = noIn === 'await';
  }

  let left = parseMaybeConditional(noIn, refDE);
  if (afterLeftParse) left = afterLeftParse(left, start);

  if (tokKind === T_EQ || tokKind === T_ASSIGN) {
    const operator = tokKind === T_EQ ? '=' : tokValue;
    const isEq = tokKind === T_EQ && !(left.type === 'CallExpression' && !strict);
    if (isEq) left = toAssignable(left, false, refDE);
    if (!ownDE) refDE.parenthesizedAssign = refDE.trailingComma = refDE.doubleProto = -1;
    if (refDE.shorthandAssign >= left.start) refDE.shorthandAssign = -1;
    if (isEq) {
      checkLValPattern(left);
    } else {
      // annex-B web-compat call targets don't extend to logical assignment
      if (left.type === 'CallExpression' && (operator === '&&=' || operator === '||=' || operator === '??='))
        raise(left.start, 'Assigning to rvalue');
      checkLValSimple(left);
    }
    next();
    const right = parseMaybeAssign(noIn);
    if (oldDoubleProto > -1 && refDE.doubleProto < 0) refDE.doubleProto = oldDoubleProto;
    return { type: 'AssignmentExpression', start, end: prevEnd, operator, left, right };
  }

  if (ownDE) checkExpressionErrors(refDE, true);
  if (oldParenAssign > -1) refDE.parenthesizedAssign = oldParenAssign;
  if (oldTrailingComma > -1) refDE.trailingComma = oldTrailingComma;
  if (oldDoubleProto > -1) refDE.doubleProto = oldDoubleProto;
  return left;
};

const parseMaybeConditional = (noIn, refDE) => {
  const start = tokStart;
  const expr = parseExprOps(noIn, refDE);
  if (checkExpressionErrors(refDE)) return expr;
  if (eat(T_QUESTION)) {
    const consequent = parseMaybeAssign(false);
    expect(T_COLON);
    const alternate = parseMaybeAssign(noIn);
    return { type: 'ConditionalExpression', start, end: prevEnd, test: expr, consequent, alternate };
  }
  return expr;
};

const parseExprOps = (noIn, refDE) => {
  const start = tokStart;
  const expr = parseMaybeUnary(refDE, false, false, noIn);
  if (checkExpressionErrors(refDE)) return expr;
  return expr.start === start && expr.type === 'ArrowFunctionExpression' ? expr : parseExprOp(expr, start, -1, noIn);
};

const parseExprOp = (left, leftStart, minPrec, noIn) => {
  while (true) {
    let prec = tokPrec;
    if (tokKind === T_STARSTAR) prec = 0; // ** handled in parseMaybeUnary
    if (ts && !newlineBefore && minPrec < 8 && (isContextual('as') || isContextual('satisfies'))) {
      left = tokValue === 'as' ? tsParseAs(left, leftStart) : tsParseSatisfies(left, leftStart);
      continue;
    }
    if (prec <= 0 || prec <= minPrec) return left;
    if (tokKind === T_IN && noIn) return left;
    const logical = tokKind === T_BINOP && (tokValue === '&&' || tokValue === '||');
    const coalesce = tokKind === T_BINOP && tokValue === '??';
    const operator = tokValue;
    const opPrec = coalesce ? 3 : prec; // parse ?? operands like && so mixing is adjacent
    next();
    const rightStart = tokStart;
    const right = parseExprOp(parseMaybeUnary(null, false, false, noIn), rightStart, opPrec, noIn);
    if (right.type === 'PrivateIdentifier') raise(right.start, 'Private identifier can only be left side of binary expression');
    left = {
      type: logical || coalesce ? 'LogicalExpression' : 'BinaryExpression',
      start: leftStart, end: prevEnd, left, operator, right
    };
    if ((logical && tokKind === T_BINOP && tokValue === '??') ||
        (coalesce && tokKind === T_BINOP && (tokValue === '&&' || tokValue === '||')))
      raise(tokStart, 'Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses');
  }
};

const isPrivateFieldAccess = node =>
  (node.type === 'MemberExpression' && node.property.type === 'PrivateIdentifier') ||
  (node.type === 'ChainExpression' && isPrivateFieldAccess(node.expression));

const parseMaybeUnary = (refDE, sawUnary, incDec, noIn) => {
  const start = tokStart;
  let expr;

  if (isContextual('await') && canAwait()) {
    expr = parseAwait(noIn);
    sawUnary = true;
  } else if (tokKind === T_PREFIX || tokKind === T_PLUSMIN || tokKind === T_DELETE || tokKind === T_VOID ||
      tokKind === T_TYPEOF || tokKind === T_INCDEC) {
    const operator = tokValue;
    const update = tokKind === T_INCDEC;
    const isDelete = tokKind === T_DELETE;
    next();
    const argument = parseMaybeUnary(null, true, update, noIn);
    checkExpressionErrors(refDE, true);
    if (update) {
      checkLValSimple(argument);
    } else if (isDelete) {
      if (strict && argument.type === 'Identifier') raise(start, 'Deleting local variable in strict mode');
      if (isPrivateFieldAccess(argument)) raise(start, 'Private fields can not be deleted');
      sawUnary = true;
    } else {
      sawUnary = true;
    }
    expr = {
      type: update ? 'UpdateExpression' : 'UnaryExpression',
      start, end: prevEnd, operator, prefix: true, argument
    };
  } else if (!sawUnary && tokKind === T_PRIVATE) {
    if (noIn || privateStack.length === 0) unexpected();
    expr = parsePrivateIdent();
    if (tokKind !== T_IN) unexpected();
    return expr;
  } else {
    expr = parseExprSubscripts(refDE, noIn);
    if (checkExpressionErrors(refDE)) return expr;
    while (tokKind === T_INCDEC && !canInsertSemicolon()) {
      checkLValSimple(expr);
      expr = { type: 'UpdateExpression', start, end: tokEnd, operator: tokValue, prefix: false, argument: expr };
      next();
    }
  }

  if (!incDec && tokKind === T_STARSTAR) {
    if (sawUnary) raise(start, 'Unary operator used immediately before exponentiation expression. Parenthesis must be used to disambiguate operator precedence');
    next();
    const right = parseMaybeUnary(null, false, false, noIn);
    return { type: 'BinaryExpression', start, end: prevEnd, left: expr, operator: '**', right };
  }
  return expr;
};

const parseExprSubscripts = (refDE, noIn) => {
  const start = tokStart;
  const expr = parseExprAtom(refDE, noIn);
  if (expr.type === 'ArrowFunctionExpression' && input.slice(prevStart, prevEnd) !== ')') return expr;
  const result = parseSubscripts(expr, start, false, noIn);
  if (refDE && result.type === 'MemberExpression') {
    if (refDE.parenthesizedAssign >= result.start) refDE.parenthesizedAssign = -1;
    if (refDE.parenthesizedBind >= result.start) refDE.parenthesizedBind = -1;
    if (refDE.trailingComma >= result.start) refDE.trailingComma = -1;
  }
  return result;
};

const parseSubscripts = (base, startPos, noCalls, noIn) => {
  const maybeAsyncArrow = base.end - base.start === 5 && prevEnd === base.end &&
    potentialArrowAt === base.start && base.type === 'Identifier' && base.name === 'async' &&
    !canInsertSemicolon();
  let optionalChained = false;

  while (true) {
    let element = parseSubscript(base, startPos, noCalls, maybeAsyncArrow, optionalChained, noIn);
    if (element.optional) optionalChained = true;
    if (element === base || element.type === 'ArrowFunctionExpression') {
      if (optionalChained) {
        element = { type: 'ChainExpression', start: startPos, end: prevEnd, expression: element };
      }
      return element;
    }
    base = element;
  }
};

const parseSubscript = (base, startPos, noCalls, maybeAsyncArrow, optionalChained, noIn) => {
  const optionalSupported = !noCalls;
  const optional = optionalSupported && eat(T_QDOT);
  if (noCalls && tokKind === T_QDOT) raise(tokStart, 'Optional chaining cannot appear in the callee of new expressions');

  const computed = eat(T_LBRACKET);
  if (computed || (optional && tokKind !== T_LPAREN && tokKind !== T_BACKQUOTE && !(ts && tokKind === T_LT)) || eat(T_DOT)) {
    let property;
    if (computed) {
      property = parseExpression(false);
      expect(T_RBRACKET);
    } else if (tokKind === T_PRIVATE && base.type !== 'Super') {
      property = parsePrivateIdent();
    } else {
      property = parseIdent(true);
    }
    return { type: 'MemberExpression', start: startPos, end: prevEnd, object: base, property, computed, optional };
  }

  if (!noCalls && tokKind === T_LPAREN) {
    if (ts && maybeAsyncArrow && !optional && tsParenLooksLikeArrow()) {
      const arrow = tsTry(() => tsParseArrowTail(startPos, true, noIn, null));
      if (arrow) return arrow;
    }
    const oldYieldPos = yieldPos, oldAwaitPos = awaitPos, oldAwaitIdentPos = awaitIdentPos;
    yieldPos = 0;
    awaitPos = 0;
    awaitIdentPos = 0;
    const refDE = newRefDE();
    next();
    const exprList = parseExprList(T_RPAREN, true, false, refDE);
    if (maybeAsyncArrow && !optional && !canInsertSemicolon() && eat(T_ARROW)) {
      checkPatternErrors(refDE, false);
      checkYieldAwaitInDefaultParams();
      if (awaitIdentPos > 0) raise(awaitIdentPos, "Cannot use 'await' as identifier inside an async function");
      yieldPos = oldYieldPos;
      awaitPos = oldAwaitPos;
      awaitIdentPos = oldAwaitIdentPos;
      return parseArrowExpression(startPos, exprList, true, noIn);
    }
    checkExpressionErrors(refDE, true);
    yieldPos = oldYieldPos || yieldPos;
    awaitPos = oldAwaitPos || awaitPos;
    awaitIdentPos = oldAwaitIdentPos || awaitIdentPos;
    return { type: 'CallExpression', start: startPos, end: prevEnd, callee: base, arguments: exprList, optional };
  }

  if (tokKind === T_BACKQUOTE) {
    if (optional || optionalChained) raise(tokStart, 'Optional chaining cannot appear in the tag of tagged template expressions');
    const quasi = parseTemplate(true);
    return { type: 'TaggedTemplateExpression', start: startPos, end: prevEnd, tag: base, quasi };
  }

  if (ts) {
    const tsResult = tsParseSubscript(base, startPos, noCalls, optional, optionalChained, noIn);
    if (tsResult) return tsResult;
  }

  if (optional) unexpected();
  return base;
};

const parseExprAtom = (refDE, noIn, forNew) => {
  if (tokKind === T_SLASH || (tokKind === T_ASSIGN && tokValue === '/=')) readRegexp();

  const start = tokStart;
  const canBeArrow = potentialArrowAt === start;

  switch (tokKind) {
    case T_SUPER: {
      if (!allowSuper()) raise(start, "'super' keyword unexpected here");
      next();
      if (tokKind === T_LPAREN && !allowDirectSuper()) raise(start, 'super() call outside constructor of a subclass');
      if (tokKind !== T_DOT && tokKind !== T_LBRACKET && tokKind !== T_LPAREN) unexpected();
      return { type: 'Super', start, end: prevEnd };
    }

    case T_THIS: {
      next();
      return { type: 'ThisExpression', start, end: prevEnd };
    }

    case T_NAME: {
      const containsEsc = tokEsc;
      const id = parseIdent(false);

      if (id.name === 'async' && !containsEsc && !canInsertSemicolon() && tokKind === T_FUNCTION) {
        next();
        return parseFunction(start, 0, true);
      }

      if (canBeArrow && !canInsertSemicolon()) {
        if (eat(T_ARROW)) return parseArrowExpression(start, [ id ], false, noIn);

        if (ts && id.name === 'async' && !containsEsc && tokKind === T_LT && !newlineBefore) {
          const arrow = tsTry(() => {
            const typeParameters = tsParseTypeParams();
            if (tokKind !== T_LPAREN) unexpected();
            return tsParseArrowTail(start, true, noIn, typeParameters);
          });
          if (arrow) return arrow;
        }

        if (id.name === 'async' && !containsEsc && tokKind === T_NAME && !newlineBefore &&
            (!potentialArrowInForAwait || tokValue !== 'of' || tokEsc)) {
          const id2 = parseIdent(false);
          if (canInsertSemicolon() || !eat(T_ARROW)) unexpected();
          return parseArrowExpression(start, [ id2 ], true, noIn);
        }
      }
      return id;
    }

    case T_REGEXP: {
      const { pattern, flags } = tokValue;
      let value = null;
      try {
        value = new RegExp(pattern, flags);
      } catch {}
      const node = { type: 'Literal', start, end: tokEnd, value, regex: { pattern, flags } };
      next();
      return node;
    }

    case T_NUM: case T_STRING: {
      if (tokOctalPos >= 0 && strict)
        raise(tokOctalPos, tokKind === T_NUM ? 'Octal literals are not allowed in strict mode' : 'Octal escape sequences are not allowed in strict mode');
      const node = { type: 'Literal', start, end: tokEnd, value: tokValue };
      next();
      return node;
    }

    case T_BIGINT: {
      const node = { type: 'Literal', start, end: tokEnd, bigint: tokValue };
      next();
      return node;
    }

    case T_NULL: {
      next();
      return { type: 'Literal', start, end: prevEnd, value: null };
    }

    case T_TRUE: case T_FALSE: {
      const value = tokKind === T_TRUE;
      next();
      return { type: 'Literal', start, end: prevEnd, value };
    }

    case T_LPAREN: {
      if (ts && canBeArrow && tsParenLooksLikeArrow()) {
        const arrow = tsTry(() => tsParseArrowTail(start, false, noIn, null));
        if (arrow) return arrow;
      }
      const expr = parseParenAndDistinguishExpression(canBeArrow, noIn);
      if (refDE) {
        if (refDE.parenthesizedAssign < 0 && !(expr.type === 'Identifier' || expr.type === 'MemberExpression'))
          refDE.parenthesizedAssign = start;
        if (refDE.parenthesizedBind < 0) refDE.parenthesizedBind = start;
      }
      return expr;
    }

    case T_LBRACKET: {
      next();
      const elements = parseExprList(T_RBRACKET, true, true, refDE);
      return { type: 'ArrayExpression', start, end: prevEnd, elements };
    }

    case T_LBRACE:
      return parseObj(false, refDE);

    case T_FUNCTION:
      next();
      return parseFunction(start, 0, false);

    case T_CLASS:
      return parseClass(false);

    case T_AT: {
      const decorators = parseDecorators();
      if (tokKind !== T_CLASS) unexpected();
      const cls = parseClass(false);
      cls.decorators = decorators;
      cls.start = decorators[0].start;
      return cls;
    }

    case T_NEW:
      return parseNew();

    case T_BACKQUOTE:
      return parseTemplate(false);

    case T_IMPORT: {
      const ahead = peekToken();
      if (ahead[0] === T_LPAREN) {
        const iStart = tokStart;
        next();
        return parseDynamicImport(iStart, null);
      }
      if (ahead[0] === T_DOT) return parseImportDot(forNew);
      unexpected();
    }

    default:
      if (ts) {
        const node = tsParseExprAtom(refDE, noIn, canBeArrow);
        if (node) return node;
      }
      unexpected();
  }
};

// current token is (
const parseDynamicImport = (start, phase) => {
  next(); // (
  const source = parseMaybeAssign(false);
  let options = null;
  if (eat(T_COMMA) && tokKind !== T_RPAREN) {
    options = parseMaybeAssign(false);
    if (tokKind === T_COMMA) next();
  }
  expect(T_RPAREN);
  return { type: 'ImportExpression', start, end: prevEnd, source, options, phase };
};

const parseImportDot = forNew => {
  const start = tokStart;
  next();
  next(); // .
  if ((isContextual('defer') || isContextual('source')) && peekToken()[0] === T_LPAREN) {
    if (forNew) raise(start, 'Cannot use new with import()');
    const phase = tokValue;
    next();
    return parseDynamicImport(start, phase);
  }
  if (!isContextual('meta')) raise(tokStart, "The only valid meta property for import is 'import.meta'");
  if (tokEsc) raise(tokStart, "'import.meta' must not contain escaped characters");
  if (!isModule) raise(start, "Cannot use 'import.meta' outside a module");
  const property = parseIdent(true);
  return {
    type: 'MetaProperty', start, end: prevEnd,
    meta: { type: 'Identifier', start, end: start + 6, name: 'import' },
    property
  };
};

const parseNew = () => {
  const start = tokStart;
  const meta = parseIdentNode();
  next();

  if (eat(T_DOT)) {
    if (!isContextual('target')) raise(tokStart, "The only valid meta property for new is 'new.target'");
    if (tokEsc) raise(tokStart, "'new.target' must not contain escaped characters");
    const property = parseIdent(true);
    if (!allowNewDotTarget()) raise(start, "'new.target' can only be used in functions and class static block");
    return { type: 'MetaProperty', start, end: prevEnd, meta, property };
  }

  const calleeStart = tokStart;
  if (tokKind === T_IMPORT && peekToken()[0] === T_LPAREN) raise(tokStart, 'Cannot use new with import()');
  const callee = parseSubscripts(parseExprAtom(null, false, true), calleeStart, true, false);
  let args = [];
  if (tokKind === T_LPAREN) {
    next();
    args = parseExprList(T_RPAREN, true, false);
  }
  return { type: 'NewExpression', start, end: prevEnd, callee, arguments: args };
};

// typeMode: parse types in the \${} slots (TS template literal types)
const parseTemplate = (tagged, typeMode = false) => {
  const start = tokStart;
  const quasis = [], expressions = [];
  while (true) {
    readTmplToken();
    const { raw, cooked, tail } = tokValue;
    if (cooked === null && !tagged) raise(tokStart, 'Bad escape sequence in untagged template literal');
    quasis.push({
      type: 'TemplateElement', start: tokStart, end: tokEnd - (tail ? 1 : 2),
      value: { raw, cooked }, tail
    });
    if (tail) break;
    next();
    expressions.push(typeMode ? tsParseType() : parseExpression(false));
    if (tokKind !== T_RBRACE) unexpected();
  }
  next();
  return { type: 'TemplateLiteral', start, end: prevEnd, quasis, expressions };
};

const parseParenAndDistinguishExpression = (canBeArrow, noIn) => {
  const startPos = tokStart;
  next();
  const innerStart = tokStart;
  const exprList = [];
  let first = true, lastIsComma = false, spreadStart = 0;
  const refDE = newRefDE();
  const oldYieldPos = yieldPos, oldAwaitPos = awaitPos;
  yieldPos = 0;
  awaitPos = 0;

  while (tokKind !== T_RPAREN) {
    if (first) first = false;
    else expect(T_COMMA);
    if (tokKind === T_RPAREN) {
      lastIsComma = true;
      break;
    }
    if (tokKind === T_ELLIPSIS) {
      spreadStart = tokStart;
      exprList.push(parseRestBinding());
      if (tokKind === T_COMMA) raise(tokStart, 'Comma is not permitted after the rest element');
      break;
    }
    exprList.push(parseMaybeAssign(false, refDE));
  }
  const innerEnd = prevEnd;
  expect(T_RPAREN);

  if (canBeArrow && !canInsertSemicolon() && eat(T_ARROW)) {
    checkPatternErrors(refDE, false);
    checkYieldAwaitInDefaultParams();
    yieldPos = oldYieldPos;
    awaitPos = oldAwaitPos;
    return parseArrowExpression(startPos, exprList, false, noIn);
  }

  if (exprList.length === 0 || lastIsComma) unexpected(prevStart);
  if (spreadStart) unexpected(spreadStart);
  checkExpressionErrors(refDE, true);
  yieldPos = oldYieldPos || yieldPos;
  awaitPos = oldAwaitPos || awaitPos;

  if (exprList.length > 1) return { type: 'SequenceExpression', start: innerStart, end: innerEnd, expressions: exprList };
  return exprList[0];
};

const parseYield = noIn => {
  if (!yieldPos) yieldPos = tokStart;
  const start = tokStart;
  next();
  let delegate = false, argument = null;
  if (tokKind === T_STAR && !newlineBefore) {
    delegate = true;
    next();
    argument = parseMaybeAssign(noIn);
  } else if (!(tokKind === T_SEMI || canInsertSemicolon() || tokKind === T_RPAREN || tokKind === T_RBRACKET ||
      tokKind === T_COMMA || tokKind === T_COLON || tokKind === T_EOF ||
      (tokKind === T_BINOP && tokValue === '??') || tokKind === T_QUESTION)) {
    argument = parseMaybeAssign(noIn);
  }
  return { type: 'YieldExpression', start, end: prevEnd, delegate, argument };
};

const parseAwait = noIn => {
  if (!awaitPos) awaitPos = tokStart;
  const start = tokStart;
  next();
  const argument = parseMaybeUnary(null, true, false, noIn);
  return { type: 'AwaitExpression', start, end: prevEnd, argument };
};

const parseExprList = (close, allowTrailingComma, allowEmpty, refDE) => {
  const elts = [];
  let first = true;
  while (!eat(close)) {
    if (!first) {
      expect(T_COMMA);
      if (allowTrailingComma && afterTrailingComma(close)) break;
    } else first = false;

    let elt;
    if (allowEmpty && tokKind === T_COMMA) {
      elt = null;
    } else if (tokKind === T_ELLIPSIS) {
      elt = parseSpread(refDE);
      if (refDE && tokKind === T_COMMA && refDE.trailingComma < 0) refDE.trailingComma = tokStart;
    } else {
      elt = parseMaybeAssign(false, refDE);
    }
    elts.push(elt);
  }
  return elts;
};

const parseSpread = refDE => {
  const start = tokStart;
  next();
  const argument = parseMaybeAssign(false, refDE);
  return { type: 'SpreadElement', start, end: prevEnd, argument };
};

const parseObj = (isPattern, refDE) => {
  const start = tokStart;
  next();
  const properties = [];
  let first = true;
  const propHash = { proto: false };
  while (!eat(T_RBRACE)) {
    if (!first) {
      expect(T_COMMA);
      if (afterTrailingComma(T_RBRACE)) break;
    } else first = false;

    const prop = parseProperty(isPattern, refDE);
    if (!isPattern) checkPropClash(prop, propHash, refDE);
    properties.push(prop);
  }
  return { type: isPattern ? 'ObjectPattern' : 'ObjectExpression', start, end: prevEnd, properties };
};

const parseProperty = (isPattern, refDE) => {
  const start = tokStart;

  if (tokKind === T_ELLIPSIS) {
    if (isPattern) {
      const rest = parseRestBinding();
      if (rest.argument.type !== 'Identifier') raise(rest.argument.start, 'Unexpected token');
      if (tokKind === T_COMMA) raise(tokStart, 'Comma is not permitted after the rest element');
      return rest;
    }
    const node = parseSpread(refDE);
    if (refDE && tokKind === T_COMMA && refDE.trailingComma < 0) refDE.trailingComma = tokStart;
    return node;
  }

  let isGenerator = false, isAsync = false;
  const startPos = tokStart;
  if (!isPattern) isGenerator = eat(T_STAR);
  const containsEsc = tokEsc;

  let { key, computed } = parsePropertyName();
  if (!isPattern && !isGenerator && !containsEsc && !computed && key.type === 'Identifier' && key.name === 'async' &&
      !newlineBefore &&
      (tokKind === T_NAME || tokKind === T_NUM || tokKind === T_BIGINT || tokKind === T_STRING || tokKind === T_LBRACKET ||
       tokKind === T_STAR || tokKind >= T_BREAK)) {
    isAsync = true;
    isGenerator = eat(T_STAR);
    ({ key, computed } = parsePropertyName());
  }

  return parsePropertyValue(start, key, computed, isPattern, isGenerator, isAsync, startPos, refDE, containsEsc);
};

const parsePropertyValue = (start, key, computed, isPattern, isGenerator, isAsync, startPos, refDE, containsEsc) => {
  if ((isGenerator || isAsync) && tokKind === T_COLON) unexpected();

  if (eat(T_COLON)) {
    const value = isPattern ? parseMaybeDefault(tokStart) : parseMaybeAssign(false, refDE);
    return { type: 'Property', start, end: prevEnd, method: false, shorthand: false, computed, key, kind: 'init', value };
  }

  if (tokKind === T_LPAREN || (ts && tokKind === T_LT)) {
    if (isPattern) unexpected();
    const value = parseMethod(isGenerator, isAsync, false);
    return { type: 'Property', start, end: prevEnd, method: true, shorthand: false, computed, key, kind: 'init', value };
  }

  if (!isPattern && !containsEsc && !computed && key.type === 'Identifier' && (key.name === 'get' || key.name === 'set') &&
      tokKind !== T_COMMA && tokKind !== T_RBRACE && tokKind !== T_EQ) {
    if (isGenerator || isAsync) unexpected();
    const kind = key.name;
    const inner = parsePropertyName();
    const value = parseMethod(false, false, false);
    const paramCount = kind === 'get' ? 0 : 1;
    if (value.params.length !== paramCount)
      raise(value.start, kind === 'get' ? 'getter should have no params' : 'setter should have exactly one param');
    if (kind === 'set' && value.params[0]?.type === 'RestElement')
      raise(value.params[0].start, 'Setter cannot use rest params');
    return { type: 'Property', start, end: prevEnd, method: false, shorthand: false, computed: inner.computed, key: inner.key, kind, value };
  }

  if (!computed && key.type === 'Identifier') {
    if (isGenerator || isAsync) unexpected();
    checkUnreserved(key.start, key.name);
    if (key.name === 'await' && !awaitIdentPos) awaitIdentPos = key.start;
    let value;
    if (isPattern) {
      value = parseMaybeDefault(startPos, copyIdent(key));
    } else if (tokKind === T_EQ && refDE) {
      if (refDE.shorthandAssign < 0) refDE.shorthandAssign = tokStart;
      value = parseMaybeDefault(startPos, copyIdent(key));
    } else {
      value = copyIdent(key);
    }
    return { type: 'Property', start, end: prevEnd, method: false, shorthand: true, computed, key, kind: 'init', value };
  }

  unexpected();
};

const copyIdent = key => ({ type: 'Identifier', start: key.start, end: key.end, name: key.name });

const checkPropClash = (prop, propHash, refDE) => {
  if (prop.type === 'SpreadElement' || prop.computed || prop.method || prop.shorthand) return;
  const key = prop.key;
  let name;
  if (key.type === 'Identifier') name = key.name;
  else if (key.type === 'Literal') name = String(key.value);
  else return;
  if (name === '__proto__' && prop.kind === 'init') {
    if (propHash.proto) {
      if (refDE) {
        if (refDE.doubleProto < 0) refDE.doubleProto = key.start;
      } else raise(key.start, 'Redefinition of __proto__ property');
    }
    propHash.proto = true;
  }
};

const parsePropertyName = () => {
  if (eat(T_LBRACKET)) {
    const key = parseMaybeAssign(false);
    expect(T_RBRACKET);
    return { key, computed: true };
  }
  if (tokKind === T_NUM || tokKind === T_STRING || tokKind === T_BIGINT) {
    return { key: parseExprAtom(null, false), computed: false };
  }
  return { key: parseIdent(true), computed: false };
};

const parseMethod = (isGenerator, isAsync, allowDirectSuperFlag, allowNoBody) => {
  const start = tokStart;
  const oldYieldPos = yieldPos, oldAwaitPos = awaitPos, oldAwaitIdentPos = awaitIdentPos;
  yieldPos = 0;
  awaitPos = 0;
  awaitIdentPos = 0;
  enterScope(functionFlags(isAsync, isGenerator) | SCOPE_SUPER | (allowDirectSuperFlag ? SCOPE_DIRECT_SUPER : 0));

  let typeParameters = null, returnType = null;
  if (ts && tokKind === T_LT) typeParameters = tsParseTypeParams();
  expect(T_LPAREN);
  const params = parseBindingList(T_RPAREN, false, true, true);
  if (ts && tokKind === T_COLON) returnType = tsParseReturnType();
  checkYieldAwaitInDefaultParams();

  const node = {
    type: 'FunctionExpression', start, end: 0, id: null, expression: false,
    generator: isGenerator, async: isAsync, params, body: null
  };
  if (ts) {
    node.typeParameters = typeParameters;
    node.returnType = returnType;
    if (allowNoBody && tokKind !== T_LBRACE) {
      exitScope();
      yieldPos = oldYieldPos;
      awaitPos = oldAwaitPos;
      awaitIdentPos = oldAwaitIdentPos;
      node.end = prevEnd;
      return node;
    }
  }
  parseFunctionBody(node, false, true);
  yieldPos = oldYieldPos;
  awaitPos = oldAwaitPos;
  awaitIdentPos = oldAwaitIdentPos;
  node.end = prevEnd;
  return node;
};

const parseArrowExpression = (start, params, isAsync, noIn) => {
  const oldYieldPos = yieldPos, oldAwaitPos = awaitPos, oldAwaitIdentPos = awaitIdentPos;
  enterScope(functionFlags(isAsync, false) | SCOPE_ARROW);
  yieldPos = 0;
  awaitPos = 0;
  awaitIdentPos = 0;

  const node = {
    type: 'ArrowFunctionExpression', start, end: 0, id: null, expression: false,
    generator: false, async: isAsync, params: toAssignableList(params, true), body: null
  };
  parseFunctionBody(node, true, false);

  yieldPos = oldYieldPos;
  awaitPos = oldAwaitPos;
  awaitIdentPos = oldAwaitIdentPos;
  node.end = prevEnd;
  return node;
};

const toAssignableList = (exprList, isBinding) => {
  for (let i = 0; i < exprList.length; i++) {
    if (exprList[i]) toAssignable(exprList[i], isBinding);
  }
  return exprList;
};

// scans ahead from p (inside a block/program) for a 'use strict' directive without parsing
const strictDirective = p => {
  while (true) {
    p = skipSpaceFrom(p);
    const quote = input.charCodeAt(p);
    if (quote !== 34 && quote !== 39) return false; // " '

    // scan string literal
    let q = p + 1;
    while (q < inputLen) {
      const c = input.charCodeAt(q);
      if (c === quote) break;
      if (c === 92) q += 2;
      else if (c === 10 || c === 13) return false;
      else q++;
    }
    if (q >= inputLen) return false;
    const content = input.slice(p + 1, q);
    q++;

    if (content === 'use strict') {
      // only counts as a full statement: ; } EOF or ASI after newline
      const afterStart = q;
      const after = skipSpaceFrom(q);
      const nc = input.charCodeAt(after);
      if (after >= inputLen || nc === 59 || nc === 125) return true; // ; }
      let sawNewline = false;
      for (let i = afterStart; i < after; i++) {
        const c = input.charCodeAt(i);
        if (c === 10 || c === 13 || c === 8232 || c === 8233) sawNewline = true;
      }
      if (!sawNewline) return false;
      // newline: directive unless next token continues the expression
      if (nc === 40 || nc === 96 || nc === 46 || nc === 91 || nc === 43 || nc === 45 || nc === 47 ||
          nc === 42 || nc === 37 || nc === 60 || nc === 62 || nc === 61 || nc === 44 || nc === 63 ||
          nc === 94 || nc === 38 || nc === 124) return false; // ( ` . [ + - / * % < > = , ? ^ & |
      if (nc === 33 && input.charCodeAt(after + 1) === 61) return false; // !=
      return true;
    }

    p = q;
    p = skipSpaceFrom(p);
    if (input.charCodeAt(p) === 59) p++; // ;
  }
};

const skipSpaceFrom = p => {
  while (p < inputLen) {
    const c = input.charCodeAt(p);
    if (c === 32 || c === 9 || isNewline(c) || isSpace(c)) p++;
    else if (c === 47 && input.charCodeAt(p + 1) === 47) {
      p += 2;
      while (p < inputLen && !isNewline(input.charCodeAt(p))) p++;
    } else if (c === 47 && input.charCodeAt(p + 1) === 42) {
      p += 2;
      while (p < inputLen && !(input.charCodeAt(p) === 42 && input.charCodeAt(p + 1) === 47)) p++;
      p += 2;
    } else break;
  }
  return p;
};

const parseFunctionBody = (node, isArrowFunction, isMethod) => {
  const isExpression = isArrowFunction && tokKind !== T_LBRACE;
  const oldStrict = strict;
  let useStrict = false;

  if (isExpression) {
    checkParams(node, false);
    node.body = parseMaybeAssign(false);
    node.expression = true;
  } else {
    const nonSimple = !isSimpleParamList(node.params);
    if (!oldStrict || nonSimple) {
      useStrict = strictDirective(tokEnd);
      if (useStrict && nonSimple)
        raise(node.start, "Illegal 'use strict' directive in function with non-simple parameter list");
    }

    const oldLabels = labels;
    labels = [];
    if (useStrict) strict = true;
    checkParams(node, !oldStrict && !useStrict && !isArrowFunction && !isMethod && isSimpleParamList(node.params));
    if (strict && node.id) checkLValSimple(node.id, BIND_OUTSIDE);
    node.body = parseBlock(false, true);
    node.expression = false;
    labels = oldLabels;
  }

  exitScope();
  strict = oldStrict;
};

const isSimpleParamList = params => {
  for (const p of params) {
    if (p.type !== 'Identifier' && !(ts && p.type === 'TSParameterProperty' && p.parameter.type === 'Identifier')) return false;
  }
  return true;
};

const checkParams = (node, allowDuplicates) => {
  const nameHash = allowDuplicates ? null : [];
  for (const param of node.params) checkParamBinding(param, nameHash);
};

const checkParamBinding = (param, nameHash) => {
  checkLValInnerPattern(param, BIND_VAR);
  if (nameHash) collectParamNames(param, nameHash);
};

const collectParamNames = (param, names) => {
  switch (param.type) {
    case 'Identifier':
      if (names.includes(param.name)) raise(param.start, 'Argument name clash');
      names.push(param.name);
      break;
    case 'ObjectPattern':
      for (const p of param.properties) collectParamNames(p, names);
      break;
    case 'ArrayPattern':
      for (const el of param.elements) {
        if (el) collectParamNames(el, names);
      }
      break;
    case 'Property':
      collectParamNames(param.value, names);
      break;
    case 'AssignmentPattern':
      collectParamNames(param.left, names);
      break;
    case 'RestElement':
      collectParamNames(param.argument, names);
      break;
    case 'TSParameterProperty':
      collectParamNames(param.parameter, names);
      break;
  }
};

const loopLabel = { kind: 'loop', name: null, statementStart: 0 };
const switchLabel = { kind: 'switch', name: null, statementStart: 0 };
let exportsSeen = null;

const isLetDeclaration = context => {
  if (!isContextual('let')) return false;
  const after = skipSpaceFrom(pos);
  const nc = input.charCodeAt(after);
  if (nc === 91 || nc === 92) return true; // [ \
  if (context) return false;
  if (nc === 123 || (nc > 0xd7ff && nc < 0xdc00)) return true; // { astral
  if (isIdStart(nc)) {
    let p = after + 1;
    let c;
    while (p < inputLen && isIdChar(c = input.charCodeAt(p))) p++;
    if (c === 92 || (c > 0xd7ff && c < 0xdc00)) return true;
    const ident = input.slice(after, p);
    if (ident !== 'in' && ident !== 'instanceof') return true;
  }
  return false;
};

const isUsingDecl = isFor => {
  if (!isContextual('using')) return false;
  const after = skipSpaceFrom(pos);
  for (let i = pos; i < after; i++) {
    if (isNewline(input.charCodeAt(i))) return false;
  }
  const c = input.charCodeAt(after);
  if (!(isIdStart(c) || c === 92 || (c > 0xd7ff && c < 0xdc00))) return false;
  if (isFor) {
    let p = after;
    while (p < inputLen && isIdChar(input.charCodeAt(p))) p++;
    if (input.slice(after, p) === 'of') {
      const afterOf = skipSpaceFrom(p);
      if (!(input.charCodeAt(afterOf) === 61 && input.charCodeAt(afterOf + 1) !== 61)) return false;
    }
  }
  return true;
};

const isAwaitUsingDecl = isFor => {
  if (!isContextual('await')) return false;
  const after = skipSpaceFrom(pos);
  for (let i = pos; i < after; i++) {
    if (isNewline(input.charCodeAt(i))) return false;
  }
  if (input.slice(after, after + 5) !== 'using') return false;
  const afterUsing = after + 5;
  if (isIdChar(input.charCodeAt(afterUsing))) return false;
  const after2 = skipSpaceFrom(afterUsing);
  for (let i = afterUsing; i < after2; i++) {
    if (isNewline(input.charCodeAt(i))) return false;
  }
  const c = input.charCodeAt(after2);
  return isIdStart(c) || c === 92 || (c > 0xd7ff && c < 0xdc00);
};

const isAsyncFunctionDecl = () => {
  if (!isContextual('async')) return false;
  const after = skipSpaceFrom(pos);
  for (let i = pos; i < after; i++) {
    if (isNewline(input.charCodeAt(i))) return false;
  }
  if (input.slice(after, after + 8) !== 'function') return false;
  const c = input.charCodeAt(after + 8);
  return after + 8 === inputLen || !(isIdChar(c) || (c > 0xd7ff && c < 0xdc00));
};

let inCaseList = false;

const parseStatement = (context, topLevel) => {
  const wasInCaseList = inCaseList;
  inCaseList = false;
  let starttype = tokKind, kind = null;
  if (isLetDeclaration(context)) {
    starttype = T_VAR;
    kind = 'let';
  } else if (isUsingDecl(false)) {
    if (topLevel && !isModule) raise(tokStart, 'Using declaration cannot appear in the top level when source type is `script`');
    if (context || wasInCaseList) raise(tokStart, 'Using declaration cannot appear in this position');
    starttype = T_VAR;
    kind = 'using';
  } else if (isAwaitUsingDecl(false)) {
    if (!canAwait()) raise(tokStart, 'Await using cannot appear outside of async function');
    if (topLevel && !isModule) raise(tokStart, 'Using declaration cannot appear in the top level when source type is `script`');
    if (context || wasInCaseList) raise(tokStart, 'Using declaration cannot appear in this position');
    starttype = T_VAR;
    kind = 'await using';
  }
  const start = tokStart;

  switch (starttype) {
    case T_BREAK: case T_CONTINUE: return parseBreakContinueStatement(starttype === T_BREAK);
    case T_DEBUGGER: {
      next();
      semicolon();
      return { type: 'DebuggerStatement', start, end: prevEnd };
    }
    case T_DO: return parseDoStatement();
    case T_FOR: return parseForStatement();
    case T_FUNCTION:
      if (context && (strict || (context !== 'if' && context !== 'label'))) unexpected();
      next();
      return parseFunction(start, FUNC_STATEMENT | (context ? FUNC_HANGING_STATEMENT : 0), false);
    case T_CLASS:
      if (context) unexpected();
      return parseClass(true);
    case T_IF: return parseIfStatement();
    case T_RETURN: return parseReturnStatement();
    case T_SWITCH: return parseSwitchStatement();
    case T_THROW: return parseThrowStatement();
    case T_TRY: return parseTryStatement();
    case T_VAR: case T_CONST: {
      if (ts && tokKind === T_CONST && peekToken()[0] === T_ENUM) {
        if (context) unexpected();
        next();
        return tsParseEnum(start, true, false);
      }
      kind = kind || tokValue;
      if (context && kind !== 'var' && kind !== 'using' && kind !== 'await using') unexpected();
      return parseVarStatement(kind);
    }
    case T_WHILE: return parseWhileStatement();
    case T_WITH: return parseWithStatement();
    case T_LBRACE: return parseBlock(true);
    case T_SEMI: {
      next();
      return { type: 'EmptyStatement', start, end: prevEnd };
    }
    case T_IMPORT: {
      const ahead = peekToken();
      if (ahead[0] !== T_LPAREN && ahead[0] !== T_DOT) {
        if (ts && ahead[0] === T_NAME) {
          // import X = ... is legal outside modules
          const st = saveState();
          next();
          next();
          const isEquals = tokKind === T_EQ;
          restoreState(st);
          if (isEquals) return parseImport();
        }
        if (!topLevel && !(ts && tsInNamespace)) raise(start, "'import' and 'export' may only appear at the top level");
        if (!isModule && !ts) raise(start, "'import' and 'export' may appear only with 'sourceType: module'");
        return parseImport();
      }
      break;
    }
    case T_EXPORT:
      if (!topLevel && !(ts && tsInNamespace)) raise(start, "'import' and 'export' may only appear at the top level");
      if (!isModule && !ts) raise(start, "'import' and 'export' may appear only with 'sourceType: module'");
      return parseExport();

    case T_AT: {
      const decorators = parseDecorators();
      if (ts && isContextual('abstract') && peekToken()[0] === T_CLASS) next();
      if (tokKind !== T_CLASS) unexpected();
      const cls = parseClass(true);
      cls.decorators = decorators;
      cls.start = decorators[0].start;
      return cls;
    }

    case T_ENUM:
      if (ts && peekToken()[0] === T_NAME) {
        if (context) unexpected();
        return tsParseEnum(start, false, false);
      }
      break;
  }

  if (isAsyncFunctionDecl()) {
    if (context) unexpected();
    next();
    next();
    return parseFunction(start, FUNC_STATEMENT, true);
  }

  if (ts) {
    const node = tsParseStatement(context, topLevel, start);
    if (node) return node;
  }

  const maybeName = tokValue;
  const expr = parseExpression(false);
  if (starttype === T_NAME && expr.type === 'Identifier' && eat(T_COLON))
    return parseLabeledStatement(start, maybeName, expr, context);
  semicolon();
  return { type: 'ExpressionStatement', start, end: prevEnd, expression: expr, directive: undefined };
};

const parseBreakContinueStatement = isBreak => {
  const start = tokStart;
  const keyword = isBreak ? 'break' : 'continue';
  next();
  let label = null;
  if (!eat(T_SEMI) && !canInsertSemicolon()) {
    if (tokKind !== T_NAME) unexpected();
    label = parseIdent(false);
    semicolon();
  }

  let i = 0;
  for (; i < labels.length; i++) {
    const lab = labels[i];
    if (label == null || lab.name === label.name) {
      if (lab.kind != null && (isBreak || lab.kind === 'loop')) break;
      if (label && isBreak) break;
    }
  }
  if (i === labels.length) raise(start, 'Unsyntactic ' + keyword);
  return { type: isBreak ? 'BreakStatement' : 'ContinueStatement', start, end: prevEnd, label };
};

const parseParenExpression = () => {
  expect(T_LPAREN);
  const val = parseExpression(false);
  expect(T_RPAREN);
  return val;
};

const parseDoStatement = () => {
  const start = tokStart;
  next();
  labels.push(loopLabel);
  const body = parseStatement('do');
  labels.pop();
  expect(T_WHILE);
  const test = parseParenExpression();
  eat(T_SEMI);
  return { type: 'DoWhileStatement', start, end: prevEnd, body, test };
};

const parseWhileStatement = () => {
  const start = tokStart;
  next();
  const test = parseParenExpression();
  labels.push(loopLabel);
  const body = parseStatement('while');
  labels.pop();
  return { type: 'WhileStatement', start, end: prevEnd, test, body };
};

const parseWithStatement = () => {
  const start = tokStart;
  if (strict) raise(start, "'with' in strict mode");
  next();
  const object = parseParenExpression();
  const body = parseStatement('with');
  return { type: 'WithStatement', start, end: prevEnd, object, body };
};

const parseIfStatement = () => {
  const start = tokStart;
  next();
  const test = parseParenExpression();
  const consequent = parseStatement('if');
  const alternate = eat(T_ELSE) ? parseStatement('if') : null;
  return { type: 'IfStatement', start, end: prevEnd, test, consequent, alternate };
};

const parseReturnStatement = () => {
  const start = tokStart;
  if (!inFunction()) raise(start, "'return' outside of function");
  next();
  let argument = null;
  if (!eat(T_SEMI) && !canInsertSemicolon()) {
    argument = parseExpression(false);
    semicolon();
  }
  return { type: 'ReturnStatement', start, end: prevEnd, argument };
};

const parseSwitchStatement = () => {
  const start = tokStart;
  next();
  const discriminant = parseParenExpression();
  const cases = [];
  expect(T_LBRACE);
  labels.push(switchLabel);
  enterScope(0);

  let cur = null, sawDefault = false;
  while (tokKind !== T_RBRACE) {
    if (tokKind === T_CASE || tokKind === T_DEFAULT) {
      const isCase = tokKind === T_CASE;
      if (cur) cur.end = prevEnd;
      const caseStart = tokStart;
      next();
      let test = null;
      if (isCase) {
        test = parseExpression(false);
      } else {
        if (sawDefault) raise(caseStart, 'Multiple default clauses');
        sawDefault = true;
      }
      expect(T_COLON);
      cur = { type: 'SwitchCase', start: caseStart, end: 0, consequent: [], test };
      cases.push(cur);
    } else {
      if (!cur) unexpected();
      inCaseList = true;
      cur.consequent.push(parseStatement(null));
      inCaseList = false;
    }
  }
  exitScope();
  if (cur) cur.end = prevEnd;
  next(); // }
  labels.pop();
  return { type: 'SwitchStatement', start, end: prevEnd, discriminant, cases };
};

const parseThrowStatement = () => {
  const start = tokStart;
  next();
  if (newlineBefore) raise(prevEnd, 'Illegal newline after throw');
  const argument = parseExpression(false);
  semicolon();
  return { type: 'ThrowStatement', start, end: prevEnd, argument };
};

const parseCatchClauseParam = () => {
  const param = parseBindingAtom();
  const simple = param.type === 'Identifier';
  enterScope(simple ? SCOPE_SIMPLE_CATCH : 0);
  checkLValPattern(param, simple ? BIND_SIMPLE_CATCH : BIND_LEXICAL);
  if (ts && tokKind === T_COLON) tsCatchAnnotation(param);
  expect(T_RPAREN);
  return param;
};

const parseTryStatement = () => {
  const start = tokStart;
  next();
  const block = parseBlock(true);
  let handler = null;
  if (tokKind === T_CATCH) {
    const cStart = tokStart;
    next();
    let param = null;
    if (eat(T_LPAREN)) {
      param = parseCatchClauseParam();
    } else {
      enterScope(0);
    }
    const body = parseBlock(false);
    exitScope();
    handler = { type: 'CatchClause', start: cStart, end: prevEnd, param, body };
  }
  const finalizer = eat(T_FINALLY) ? parseBlock(true) : null;
  if (!handler && !finalizer) raise(start, 'Missing catch or finally clause');
  return { type: 'TryStatement', start, end: prevEnd, block, handler, finalizer };
};

const parseVarStatement = kind => {
  const start = tokStart;
  next();
  if (kind === 'await using') next();
  const declarations = parseVar(false, kind);
  semicolon();
  return { type: 'VariableDeclaration', start, end: prevEnd, declarations, kind };
};

const parseVar = (isFor, kind) => {
  const declarations = [];
  while (true) {
    const declStart = tokStart;
    const id = parseVarId(kind);
    let init = null;
    if (eat(T_EQ)) {
      init = parseMaybeAssign(isFor);
    } else if (kind === 'const' && !(tokKind === T_IN || isContextual('of'))) {
      if (!(ts && tsAmbient)) unexpected();
    } else if ((kind === 'using' || kind === 'await using') && !(isFor && (tokKind === T_IN || isContextual('of')))) {
      raise(prevEnd, `Missing initializer in ${kind} declaration`);
    } else if (id.type !== 'Identifier' && !(isFor && (tokKind === T_IN || isContextual('of')))) {
      raise(prevEnd, 'Complex binding patterns require an initialization value');
    }
    declarations.push({ type: 'VariableDeclarator', start: declStart, end: prevEnd, id, init });
    if (!eat(T_COMMA)) break;
  }
  return declarations;
};

const parseVarId = kind => {
  if ((kind === 'using' || kind === 'await using') && (tokKind === T_LBRACKET || tokKind === T_LBRACE)) unexpected();
  const id = parseBindingAtom();
  checkLValPattern(id, kind === 'var' ? BIND_VAR : BIND_LEXICAL);
  if (ts) {
    if (tokKind === T_PREFIX && tokValue === '!' && !newlineBefore) {
      id.definite = true;
      next();
    }
    if (tokKind === T_COLON) return tsParamAnnotation(id);
  }
  return id;
};

const isDirectiveStatement = stmt =>
  stmt.type === 'ExpressionStatement' && stmt.expression.type === 'Literal' &&
  typeof stmt.expression.value === 'string' && stmt.expression.start === stmt.start;

const parseBlock = (createNewLexicalScope = true, directives = false) => {
  const start = tokStart;
  expect(T_LBRACE);
  if (createNewLexicalScope) enterScope(0);
  const body = [];
  let prologue = directives;
  while (!eat(T_RBRACE)) {
    const stmt = parseStatement(null);
    if (prologue) {
      if (isDirectiveStatement(stmt)) stmt.directive = stmt.expression.value;
      else prologue = false;
    }
    body.push(stmt);
  }
  if (createNewLexicalScope) exitScope();
  return { type: 'BlockStatement', start, end: prevEnd, body };
};

const parseForStatement = () => {
  const start = tokStart;
  next();
  const awaitAt = canAwait() && eatContextual('await') ? prevStart : -1;
  labels.push(loopLabel);
  enterScope(0);
  expect(T_LPAREN);

  if (tokKind === T_SEMI) {
    if (awaitAt > -1) unexpected(awaitAt);
    return parseFor(start, null);
  }

  const isLet_ = isLetDeclaration(null);
  const isUsing_ = !isLet_ && isUsingDecl(true);
  const isAwaitUsing_ = !isLet_ && !isUsing_ && isAwaitUsingDecl(true);
  if (tokKind === T_VAR || tokKind === T_CONST || isLet_ || isUsing_ || isAwaitUsing_) {
    const kind = isLet_ ? 'let' : isUsing_ ? 'using' : isAwaitUsing_ ? 'await using' : tokValue;
    const varStart = tokStart;
    if (isAwaitUsing_) {
      if (!canAwait()) raise(tokStart, 'Await using cannot appear outside of async function');
      next();
    }
    next();
    const declarations = parseVar(true, kind);
    const init = { type: 'VariableDeclaration', start: varStart, end: prevEnd, declarations, kind };
    if ((tokKind === T_IN || isContextual('of')) && declarations.length === 1) {
      if (tokKind === T_IN) {
        if (awaitAt > -1) unexpected(awaitAt);
        if (kind === 'using' || kind === 'await using')
          raise(varStart, `The left-hand side of a for-in loop may not be ${kind === 'using' ? 'a using declaration' : 'an await using declaration'}`);
      }
      return parseForIn(start, init, awaitAt);
    }
    if (awaitAt > -1) unexpected(awaitAt);
    return parseFor(start, init);
  }

  const startsWithLet = isContextual('let');
  const refDE = newRefDE();
  const containsEsc = tokEsc;
  const init = parseExpression(awaitAt > -1 ? 'await' : true, refDE);
  let isForOf = false;
  if (tokKind === T_IN || (isForOf = isContextual('of'))) {
    if (awaitAt > -1 && tokKind === T_IN) unexpected(awaitAt);
    if (startsWithLet && isForOf && !containsEsc)
      raise(init.start, "The left-hand side of a for-of loop may not start with 'let'");
    if (!(init.type === 'CallExpression' && !strict)) toAssignable(init, false, refDE);
    checkLValPattern(init);
    return parseForIn(start, init, awaitAt);
  }
  checkExpressionErrors(refDE, true);
  if (awaitAt > -1) unexpected(awaitAt);
  return parseFor(start, init);
};

const parseFor = (start, init) => {
  expect(T_SEMI);
  const test = tokKind === T_SEMI ? null : parseExpression(false);
  expect(T_SEMI);
  const update = tokKind === T_RPAREN ? null : parseExpression(false);
  expect(T_RPAREN);
  const body = parseStatement('for');
  exitScope();
  labels.pop();
  return { type: 'ForStatement', start, end: prevEnd, init, test, update, body };
};

const parseForIn = (start, init, awaitAt) => {
  const isForIn = tokKind === T_IN;
  next();

  if (init.type === 'VariableDeclaration' && init.declarations[0].init != null &&
      (!isForIn || strict || init.kind !== 'var' || init.declarations[0].id.type !== 'Identifier')) {
    raise(init.start, `${isForIn ? 'for-in' : 'for-of'} loop variable declaration may not have an initializer`);
  }

  const right = isForIn ? parseExpression(false) : parseMaybeAssign(false);
  expect(T_RPAREN);
  const body = parseStatement('for');
  exitScope();
  labels.pop();

  if (isForIn) return { type: 'ForInStatement', start, end: prevEnd, left: init, right, body };
  return { type: 'ForOfStatement', start, end: prevEnd, await: awaitAt > -1, left: init, right, body };
};

const parseLabeledStatement = (start, maybeName, expr, context) => {
  for (const label of labels) {
    if (label.name === maybeName) raise(expr.start, `Label '${maybeName}' is already declared`);
  }

  const kind = tokKind === T_FOR || tokKind === T_WHILE || tokKind === T_DO ? 'loop'
    : tokKind === T_SWITCH ? 'switch' : null;
  for (let i = labels.length - 1; i >= 0; i--) {
    const label = labels[i];
    if (label.statementStart === start) {
      label.statementStart = tokStart;
      label.kind = kind;
    } else break;
  }

  labels.push({ name: maybeName, kind, statementStart: tokStart });
  const body = parseStatement(context ? (context.indexOf('label') === -1 ? context + 'label' : context) : 'label');
  labels.pop();
  return { type: 'LabeledStatement', start, end: prevEnd, body, label: expr };
};

const FUNC_STATEMENT = 1, FUNC_HANGING_STATEMENT = 2, FUNC_NULLABLE_ID = 4;

const parseFunction = (start, statement, isAsync) => {
  let generator = false;
  if (tokKind === T_STAR && (statement & FUNC_HANGING_STATEMENT)) unexpected();
  generator = eat(T_STAR);

  let id = null;
  if (statement & FUNC_STATEMENT) {
    id = (statement & FUNC_NULLABLE_ID) && tokKind !== T_NAME ? null : parseIdent(false);
    if (id && !(statement & FUNC_HANGING_STATEMENT) && !ts)
      checkLValSimple(id, strict || generator || isAsync
        ? (treatFunctionsAsVarInScope(currentScope()) ? BIND_VAR : BIND_LEXICAL)
        : BIND_FUNCTION);
  }

  const oldYieldPos = yieldPos, oldAwaitPos = awaitPos, oldAwaitIdentPos = awaitIdentPos;
  yieldPos = 0;
  awaitPos = 0;
  awaitIdentPos = 0;
  enterScope(functionFlags(isAsync, generator));

  if (!(statement & FUNC_STATEMENT)) id = tokKind === T_NAME ? parseIdent(false) : null;

  const node = {
    type: statement & FUNC_STATEMENT ? 'FunctionDeclaration' : 'FunctionExpression',
    start, end: 0, id, expression: false, generator, async: isAsync, params: null, body: null
  };
  if (ts) {
    node.typeParameters = tokKind === T_LT ? tsParseTypeParams() : null;
  }
  expect(T_LPAREN);
  node.params = parseBindingList(T_RPAREN, false, true);
  if (ts) {
    node.returnType = tokKind === T_COLON ? tsParseReturnType() : null;
    if (tokKind !== T_LBRACE) {
      // TS overload signature (no body)
      exitScope();
      yieldPos = oldYieldPos;
      awaitPos = oldAwaitPos;
      awaitIdentPos = oldAwaitIdentPos;
      return tsFinishOverloadSignature(node);
    }
  }
  checkYieldAwaitInDefaultParams();
  parseFunctionBody(node, false, false);

  yieldPos = oldYieldPos;
  awaitPos = oldAwaitPos;
  awaitIdentPos = oldAwaitIdentPos;
  node.end = prevEnd;
  return node;
};

const parseClass = (isStatement, isAbstract = false, isDeclare = false) => {
  const start = tokStart;
  next();

  const oldStrict = strict;
  strict = true;

  let id = null;
  if (tokKind === T_NAME && !(ts && tokValue === 'implements')) {
    id = parseIdent(false);
    if (isStatement === true) checkLValSimple(id, BIND_LEXICAL);
  } else if (isStatement === true) {
    unexpected();
  }

  let typeParameters = null, superTypeArguments = null, implemented = null;
  if (ts && tokKind === T_LT) typeParameters = tsParseTypeParams();

  const superClass = eat(T_EXTENDS) ? parseExprSubscripts(null, false) : null;
  if (ts) {
    if (tokKind === T_LT) superTypeArguments = tsParseTypeArgs();
    if (isContextual('implements')) implemented = tsParseImplements();
  }

  const privateNames = { declared: {}, used: [] };
  privateStack.push(privateNames);

  const cbStart = tokStart;
  expect(T_LBRACE);
  const body = [];
  let hadConstructor = false;
  while (!eat(T_RBRACE)) {
    if (eat(T_SEMI)) continue;
    const element = parseClassElement(superClass !== null);
    if (element === null) continue;
    body.push(element);
    if (element.type === 'MethodDefinition' && element.kind === 'constructor') {
      if (hadConstructor) raise(element.start, 'Duplicate constructor in the same class');
      hadConstructor = true;
    } else if (element.key && element.key.type === 'PrivateIdentifier' && isPrivateNameConflicted(privateNames.declared, element)) {
      raise(element.key.start, `Identifier '#${element.key.name}' has already been declared`);
    }
  }

  strict = oldStrict;
  exitClassBody();

  const node = {
    type: isStatement ? 'ClassDeclaration' : 'ClassExpression',
    start, end: prevEnd, id, superClass, decorators: [],
    body: { type: 'ClassBody', start: cbStart, end: prevEnd, body }
  };
  if (ts) {
    node.typeParameters = typeParameters;
    node.superTypeArguments = superTypeArguments;
    node.implements = implemented;
    node.abstract = isAbstract;
    node.declare = isDeclare;
  }
  return node;
};

const exitClassBody = () => {
  const { declared, used } = privateStack.pop();
  const parent = privateStack.length === 0 ? null : privateStack[privateStack.length - 1];
  for (const id of used) {
    if (!Object.hasOwn(declared, id.name)) {
      if (parent) parent.used.push(id);
      else raise(id.start, `Private field '#${id.name}' must be declared in an enclosing class`);
    }
  }
};

const isPrivateNameConflicted = (declared, element) => {
  const name = element.key.name;
  const curr = declared[name];
  let next_ = 'true';
  if (element.type === 'MethodDefinition' && (element.kind === 'get' || element.kind === 'set'))
    next_ = (element.static ? 's' : 'i') + element.kind;
  if ((curr === 'iget' && next_ === 'iset') || (curr === 'iset' && next_ === 'iget') ||
      (curr === 'sget' && next_ === 'sset') || (curr === 'sset' && next_ === 'sget')) {
    declared[name] = 'true';
    return false;
  }
  if (!curr) {
    declared[name] = next_;
    return false;
  }
  return true;
};

const parseDecoratorExpression = () => {
  const start = tokStart;
  if (tokKind === T_LPAREN) {
    next();
    const expr = parseExpression(false);
    expect(T_RPAREN);
    return expr;
  }
  let expr = parseIdent(false);
  while (tokKind === T_DOT) {
    next();
    const property = tokKind === T_PRIVATE ? parsePrivateIdent() : parseIdent(true);
    expr = { type: 'MemberExpression', start, end: prevEnd, object: expr, property, computed: false, optional: false };
  }
  if (tokKind === T_LPAREN) {
    next();
    const args = parseExprList(T_RPAREN, true, false);
    expr = { type: 'CallExpression', start, end: prevEnd, callee: expr, arguments: args, optional: false };
  }
  return expr;
};

const parseDecorators = () => {
  const list = [];
  while (tokKind === T_AT) {
    const start = tokStart;
    next();
    const expression = parseDecoratorExpression();
    list.push({ type: 'Decorator', start, end: prevEnd, expression });
  }
  return list;
};

const isClassElementNameStart = () =>
  tokKind === T_NAME || tokKind === T_PRIVATE || tokKind === T_NUM || tokKind === T_BIGINT ||
  tokKind === T_STRING || tokKind === T_LBRACKET || tokKind >= T_BREAK;

const checkKeyName = (computed, key, name) =>
  !computed && ((key.type === 'Identifier' && key.name === name) ||
    (key.type === 'Literal' && key.value === name));

const parseClassElement = constructorAllowsSuper => {
  let decorators = [];
  if (tokKind === T_AT) {
    decorators = parseDecorators();
    if (tokKind === T_RBRACE || tokKind === T_SEMI) unexpected();
  }
  const el = parseClassElementInner(constructorAllowsSuper);
  el.decorators = decorators;
  if (decorators.length) {
    if (el.type === 'StaticBlock') raise(decorators[0].start, 'Decorators are not valid here');
    el.start = decorators[0].start;
  }
  return el;
};

const tsIsClassModifier = name => {
  switch (name) {
    case 'public': case 'private': case 'protected': case 'readonly': case 'abstract':
    case 'declare': case 'override':
      return true;
  }
  return false;
};

const parseClassElementInner = constructorAllowsSuper => {
  const start = tokStart;
  let keyName = '', isGenerator = false, isAsync = false, kind = 'method', isStatic = false, isAccessor = false;
  let tsMods = null;

  if (ts) {
    // class modifiers come in any order around static
    while (tokKind === T_NAME && !tokEsc && (tsIsClassModifier(tokValue) ||
        (tokValue === 'static' && !isStatic))) {
      const word = tokValue;
      const st = saveState();
      next();
      if (!(isClassElementNameStart() || tokKind === T_STAR ||
          (tokKind === T_NAME && (tsIsClassModifier(tokValue) || tokValue === 'static' || tokValue === 'accessor' || tokValue === 'async' || tokValue === 'get' || tokValue === 'set')))) {
        restoreState(st);
        break;
      }
      if (word === 'static') {
        isStatic = true;
        if (tokKind === T_LBRACE) {
          restoreState(st);
          break;
        }
        continue;
      }
      tsMods = tsMods ?? { accessibility: null, readonly: false, abstract: false, declare: false, override: false };
      if (word === 'readonly') tsMods.readonly = true;
      else if (word === 'abstract') tsMods.abstract = true;
      else if (word === 'declare') tsMods.declare = true;
      else if (word === 'override') tsMods.override = true;
      else tsMods.accessibility = word;
    }
    if (tsIsIndexSignature()) return tsParseIndexSignature(start, isStatic, tsMods?.readonly ?? false);
  }

  if (!isStatic && eatContextual('static')) {
    if (tokKind === T_LBRACE) return parseClassStaticBlock(start);
    if (isClassElementNameStart() || tokKind === T_STAR) isStatic = true;
    else keyName = 'static';
  }
  if (!keyName && isContextual('accessor')) {
    next();
    if (isClassElementNameStart() && !canInsertSemicolon()) isAccessor = true;
    else keyName = 'accessor';
  }
  if (!keyName && !isAccessor && eatContextual('async')) {
    if ((isClassElementNameStart() || tokKind === T_STAR) && !canInsertSemicolon()) isAsync = true;
    else keyName = 'async';
  }
  if (!keyName && eat(T_STAR)) isGenerator = true;
  if (!keyName && !isAsync && !isGenerator) {
    const lastValue = tokValue;
    if (isContextual('get') || isContextual('set')) {
      next();
      if (isClassElementNameStart()) kind = lastValue;
      else keyName = lastValue;
    }
  }

  let key, computed;
  if (keyName) {
    computed = false;
    key = { type: 'Identifier', start: prevStart, end: prevEnd, name: keyName };
  } else {
    ({ key, computed } = parseClassElementName());
  }

  let optional = false;
  if (ts && tokKind === T_QUESTION) {
    optional = true;
    next();
  }

  if (isAccessor) return parseClassField(start, key, computed, isStatic, true, tsMods, optional);

  if (tokKind === T_LPAREN || kind !== 'method' || isGenerator || isAsync || (ts && tokKind === T_LT)) {
    const isConstructor = !isStatic && checkKeyName(computed, key, 'constructor');
    if (isConstructor && kind !== 'method') raise(key.start, "Constructor can't have get/set modifier");
    return parseClassMethod(start, key, computed, isStatic, isGenerator, isAsync,
      isConstructor ? 'constructor' : kind, isConstructor && constructorAllowsSuper, tsMods, optional);
  }
  return parseClassField(start, key, computed, isStatic, false, tsMods, optional);
};

const parseClassElementName = () => {
  if (tokKind === T_PRIVATE) {
    if (tokValue === 'constructor') raise(tokStart, "Classes can't have an element named '#constructor'");
    return { key: parsePrivateIdent(), computed: false };
  }
  return parsePropertyName();
};

const parseClassMethod = (start, key, computed, isStatic, isGenerator, isAsync, kind, allowsDirectSuper, tsMods, optional) => {
  if (kind === 'constructor') {
    if (isGenerator) raise(key.start, "Constructor can't be a generator");
    if (isAsync) raise(key.start, "Constructor can't be an async method");
  } else if (isStatic && checkKeyName(computed, key, 'prototype')) {
    raise(key.start, 'Classes may not have a static property named prototype');
  }

  const value = parseMethod(isGenerator, isAsync, allowsDirectSuper, ts);
  const noBody = ts && value.body === null;
  if (noBody) semicolon();

  if (kind === 'get' && value.params.length !== 0) raise(value.start, 'getter should have no params');
  if (kind === 'set' && value.params.length !== 1) raise(value.start, 'setter should have exactly one param');
  if (kind === 'set' && value.params[0].type === 'RestElement') raise(value.params[0].start, 'Setter cannot use rest params');

  const node = {
    type: tsMods?.abstract ? 'TSAbstractMethodDefinition' : noBody ? 'TSDeclareMethod' : 'MethodDefinition',
    start, end: prevEnd, static: isStatic, computed, key, kind, value
  };
  if (ts) {
    node.optional = optional;
    node.accessibility = tsMods?.accessibility ?? null;
    node.override = tsMods?.override ?? false;
  }
  return node;
};

const parseClassField = (start, key, computed, isStatic, isAccessor = false, tsMods = null, optional = false) => {
  if (checkKeyName(computed, key, 'constructor')) raise(key.start, "Classes can't have a field named 'constructor'");
  if (isStatic && checkKeyName(computed, key, 'prototype')) raise(key.start, "Classes can't have a static field named 'prototype'");

  let definite = false, typeAnnotation = null;
  if (ts) {
    if (tokKind === T_PREFIX && tokValue === '!' && !newlineBefore) {
      definite = true;
      next();
    }
    if (tokKind === T_COLON) typeAnnotation = tsTypeAnnotation();
  }

  let value = null;
  if (eat(T_EQ)) {
    enterScope(SCOPE_FIELD_INIT | SCOPE_SUPER);
    value = parseMaybeAssign(false);
    exitScope();
  }
  semicolon();
  const node = {
    type: tsMods?.abstract ? 'TSAbstractPropertyDefinition' : isAccessor ? 'AccessorProperty' : 'PropertyDefinition',
    start, end: prevEnd, static: isStatic, computed, key, value
  };
  if (ts) {
    node.typeAnnotation = typeAnnotation;
    node.optional = optional;
    node.definite = definite;
    node.readonly = tsMods?.readonly ?? false;
    node.declare = tsMods?.declare ?? false;
    node.accessibility = tsMods?.accessibility ?? null;
    node.override = tsMods?.override ?? false;
  }
  return node;
};

const parseClassStaticBlock = start => {
  const oldLabels = labels;
  labels = [];
  enterScope(SCOPE_STATIC_BLOCK | SCOPE_SUPER);
  const body = [];
  next(); // {
  while (tokKind !== T_RBRACE) {
    if (tokKind === T_EOF) unexpected();
    body.push(parseStatement(null));
  }
  next();
  exitScope();
  labels = oldLabels;
  return { type: 'StaticBlock', start, end: prevEnd, body };
};

const hasLoneSurrogate = s => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const c2 = s.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) i++;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
};

const parseStringLiteral = () => {
  const node = { type: 'Literal', start: tokStart, end: tokEnd, value: tokValue };
  next();
  return node;
};

const parseModuleExportName = () => {
  if (tokKind === T_STRING) {
    const lit = parseStringLiteral();
    if (hasLoneSurrogate(lit.value)) raise(lit.start, 'An export name cannot include a lone surrogate');
    return lit;
  }
  return parseIdent(true);
};

const parseWithClause = () => {
  const attributes = [];
  if (!eat(T_WITH)) return attributes;
  expect(T_LBRACE);
  const seen = [];
  let first = true;
  while (!eat(T_RBRACE)) {
    if (!first) {
      expect(T_COMMA);
      if (afterTrailingComma(T_RBRACE)) break;
    } else first = false;

    const start = tokStart;
    const key = tokKind === T_STRING ? parseStringLiteral() : parseIdent(true);
    const keyName = key.type === 'Identifier' ? key.name : key.value;
    if (seen.includes(keyName)) raise(key.start, `Duplicate attribute key '${keyName}'`);
    seen.push(keyName);
    expect(T_COLON);
    if (tokKind !== T_STRING) raise(tokStart, 'Only string is supported as an attribute value');
    const value = parseStringLiteral();
    attributes.push({ type: 'ImportAttribute', start, end: prevEnd, key, value });
  }
  return attributes;
};

const isSourcePhaseImport = () => {
  const st = saveState();
  next();
  let ok = false;
  if (tokKind === T_NAME) {
    if (tokValue !== 'from') {
      ok = true;
    } else {
      next();
      ok = tokKind === T_NAME && tokValue === 'from';
    }
  }
  restoreState(st);
  return ok;
};

const parseImportDefaultSpecifier = () => {
  const start = tokStart;
  const local = parseIdent(false);
  checkLValSimple(local, BIND_LEXICAL);
  return { type: 'ImportDefaultSpecifier', start, end: prevEnd, local };
};

const parseImportNamespaceSpecifier = () => {
  const start = tokStart;
  next(); // *
  expectContextual('as');
  const local = parseIdent(false);
  checkLValSimple(local, BIND_LEXICAL);
  return { type: 'ImportNamespaceSpecifier', start, end: prevEnd, local };
};

const parseImport = () => {
  const start = tokStart;
  next();

  let importKind = ts ? 'value' : undefined;
  if (ts) {
    if (tokKind === T_NAME && peekToken()[0] === T_EQ) return tsParseImportEquals(start, false, 'value');
    if (isContextual('type') && !tokEsc) {
      const ahead = peekToken();
      let isType = false;
      if (ahead[0] === T_STAR || ahead[0] === T_LBRACE) {
        isType = true;
      } else if (ahead[0] === T_NAME) {
        if (ahead[1] !== 'from') {
          isType = true;
        } else {
          const st = saveState();
          next();
          next();
          isType = isContextual('from');
          restoreState(st);
        }
      }
      if (isType) {
        importKind = 'type';
        next();
        if (tokKind === T_NAME && peekToken()[0] === T_EQ) return tsParseImportEquals(start, false, 'type');
      }
    }
  }

  let specifiers, source, phase = null;
  if (tokKind === T_STRING) {
    specifiers = [];
    source = parseStringLiteral();
  } else {
    if (isContextual('defer') && !tokEsc && peekToken()[0] === T_STAR) {
      phase = 'defer';
      next();
      specifiers = [ parseImportNamespaceSpecifier() ];
    } else if (isContextual('source') && !tokEsc && isSourcePhaseImport()) {
      phase = 'source';
      next();
      specifiers = [ parseImportDefaultSpecifier() ];
    } else {
      specifiers = parseImportSpecifiers();
    }
    expectContextual('from');
    if (tokKind !== T_STRING) unexpected();
    source = parseStringLiteral();
  }
  const attributes = parseWithClause();
  semicolon();
  const node = { type: 'ImportDeclaration', start, end: prevEnd, specifiers, source, attributes, phase };
  if (ts) node.importKind = importKind;
  return node;
};

const parseImportSpecifiers = () => {
  const nodes = [];
  let first = true;
  if (tokKind === T_NAME) {
    nodes.push(parseImportDefaultSpecifier());
    if (!eat(T_COMMA)) return nodes;
  }
  if (tokKind === T_STAR) {
    nodes.push(parseImportNamespaceSpecifier());
    return nodes;
  }
  expect(T_LBRACE);
  while (!eat(T_RBRACE)) {
    if (!first) {
      expect(T_COMMA);
      if (afterTrailingComma(T_RBRACE)) break;
    } else first = false;

    const start = tokStart;
    let specKind;
    if (ts) {
      specKind = 'value';
      if (isContextual('type') && !tokEsc && tsSpecifierIsType()) {
        specKind = 'type';
        next();
      }
    }
    const imported = parseModuleExportName();
    let local;
    if (eatContextual('as')) {
      local = parseIdent(false);
    } else {
      if (imported.type === 'Identifier') checkUnreserved(imported.start, imported.name);
      local = imported;
    }
    checkLValSimple(local, BIND_LEXICAL);
    const spec = { type: 'ImportSpecifier', start, end: prevEnd, imported, local };
    if (ts) spec.importKind = specKind;
    nodes.push(spec);
  }
  return nodes;
};

const checkExport = (name, p) => {
  if (!exportsSeen) return;
  if (typeof name !== 'string') name = name.type === 'Identifier' ? name.name : name.value;
  if (Object.hasOwn(exportsSeen, name)) raise(p, `Duplicate export '${name}'`);
  exportsSeen[name] = true;
};

const checkPatternExport = pattern => {
  switch (pattern.type) {
    case 'Identifier':
      checkExport(pattern.name, pattern.start);
      break;
    case 'ObjectPattern':
      for (const prop of pattern.properties) checkPatternExport(prop);
      break;
    case 'ArrayPattern':
      for (const elt of pattern.elements) {
        if (elt) checkPatternExport(elt);
      }
      break;
    case 'Property':
      checkPatternExport(pattern.value);
      break;
    case 'AssignmentPattern':
      checkPatternExport(pattern.left);
      break;
    case 'RestElement':
      checkPatternExport(pattern.argument);
      break;
  }
};

const shouldParseExportStatement = () =>
  tokKind === T_VAR || tokKind === T_CONST || tokKind === T_FUNCTION || tokKind === T_CLASS ||
  isLetDeclaration(null) || isAsyncFunctionDecl() ||
  (ts && (isContextual('interface') || isContextual('type') || isContextual('enum') || isContextual('namespace') ||
    isContextual('module') || isContextual('declare') || isContextual('abstract') || isContextual('import')));

const parseExport = () => {
  const start = tokStart;
  next();

  if (ts) {
    const node = tsParseExportSpecial(start);
    if (node) return node;
  }

  if (eat(T_STAR)) {
    let exported = null;
    if (eatContextual('as')) {
      exported = parseModuleExportName();
      checkExport(exported, exported.start);
    }
    expectContextual('from');
    if (tokKind !== T_STRING) unexpected();
    const source = parseStringLiteral();
    const attributes = parseWithClause();
    semicolon();
    return { type: 'ExportAllDeclaration', start, end: prevEnd, exported, source, attributes };
  }

  if (eat(T_DEFAULT)) {
    checkExport('default', prevStart);
    let declaration;
    if (tokKind === T_AT) {
      const decorators = parseDecorators();
      if (tokKind !== T_CLASS) unexpected();
      declaration = parseClass('nullableID');
      declaration.decorators = decorators;
      declaration.start = decorators[0].start;
      return { type: 'ExportDefaultDeclaration', start, end: prevEnd, declaration };
    }
    if (tokKind === T_FUNCTION) {
      const fStart = tokStart;
      next();
      declaration = parseFunction(fStart, FUNC_STATEMENT | FUNC_NULLABLE_ID, false);
    } else if (isAsyncFunctionDecl()) {
      const fStart = tokStart;
      next();
      next();
      declaration = parseFunction(fStart, FUNC_STATEMENT | FUNC_NULLABLE_ID, true);
    } else if (tokKind === T_CLASS) {
      declaration = parseClass('nullableID');
    } else if (ts && isContextual('abstract') && peekToken()[0] === T_CLASS) {
      next();
      declaration = parseClass('nullableID', true);
    } else if (ts && isContextual('interface') && peekToken()[0] === T_NAME) {
      declaration = tsParseInterface(tokStart, false);
    } else {
      declaration = parseMaybeAssign(false);
      semicolon();
    }
    return { type: 'ExportDefaultDeclaration', start, end: prevEnd, declaration };
  }

  if (tokKind === T_AT || shouldParseExportStatement()) {
    const declaration = parseStatement(null);
    if (declaration.type === 'VariableDeclaration') {
      for (const decl of declaration.declarations) checkPatternExport(decl.id);
    } else if (declaration.id && !(ts && (declaration.type === 'TSInterfaceDeclaration' || declaration.type === 'TSTypeAliasDeclaration' || declaration.type === 'TSModuleDeclaration'))) {
      checkExport(declaration.id, declaration.id.start);
    }
    return { type: 'ExportNamedDeclaration', start, end: prevEnd, declaration, specifiers: [], source: null, attributes: [] };
  }

  const specifiers = parseExportSpecifiers(false);
  let source = null, attributes = [];
  if (eatContextual('from')) {
    if (tokKind !== T_STRING) unexpected();
    source = parseStringLiteral();
    attributes = parseWithClause();
  } else {
    for (const spec of specifiers) {
      if (spec.local.type === 'Literal') raise(spec.local.start, 'A string literal cannot be used as an exported binding without `from`');
      checkUnreserved(spec.local.start, spec.local.name);
      checkLocalExport(spec.local);
    }
  }
  semicolon();
  return { type: 'ExportNamedDeclaration', start, end: prevEnd, declaration: null, specifiers, source, attributes };
};

const parseExportSpecifiers = typeOnly => {
  const nodes = [];
  let first = true;
  expect(T_LBRACE);
  while (!eat(T_RBRACE)) {
    if (!first) {
      expect(T_COMMA);
      if (afterTrailingComma(T_RBRACE)) break;
    } else first = false;

    const start = tokStart;
    let specKind;
    if (ts) {
      specKind = 'value';
      if (!typeOnly && isContextual('type') && !tokEsc && tsSpecifierIsType()) {
        specKind = 'type';
        next();
      }
    }
    const local = parseModuleExportName();
    const exported = eatContextual('as') ? parseModuleExportName() : local;
    if (!typeOnly && specKind !== 'type') checkExport(exported, exported.start);
    const spec = { type: 'ExportSpecifier', start, end: prevEnd, local, exported };
    if (ts) spec.exportKind = specKind;
    nodes.push(spec);
  }
  return nodes;
};

// run fn, on SyntaxError restore parser state and return null
const tsTry = fn => {
  const st = saveState();
  const scopeLen = scopeStack.length, labelsLen = labels.length;
  const privTop = privateStack[privateStack.length - 1];
  const privLen = privTop ? privTop.used.length : 0;
  const oy = yieldPos, oa = awaitPos, oai = awaitIdentPos, oldStrict = strict;
  try {
    return fn();
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    restoreState(st);
    scopeStack.length = scopeLen;
    labels.length = labelsLen;
    if (privTop) privTop.used.length = privLen;
    yieldPos = oy;
    awaitPos = oa;
    awaitIdentPos = oai;
    strict = oldStrict;
    return null;
  }
};

const tsExpectGt = () => {
  if (tokKind === T_GT) return next();
  if (typeof tokValue === 'string' && tokValue[0] === '>') return splitGt();
  unexpected();
};

const tsEntityName = () => {
  const start = tokStart;
  let entity = parseIdent(true);
  while (eat(T_DOT)) {
    const right = parseIdent(true);
    entity = { type: 'TSQualifiedName', start, end: prevEnd, left: entity, right };
  }
  return entity;
};

const tsTypeAnnotationNode = (start, type) => ({ type: 'TSTypeAnnotation', start, end: prevEnd, typeAnnotation: type });

const tsTypeAnnotation = () => {
  const start = tokStart;
  next(); // :
  return tsTypeAnnotationNode(start, tsParseType());
};

const tsKeywordTypes = {
  any: 'TSAnyKeyword', unknown: 'TSUnknownKeyword', never: 'TSNeverKeyword',
  undefined: 'TSUndefinedKeyword', string: 'TSStringKeyword', number: 'TSNumberKeyword',
  boolean: 'TSBooleanKeyword', object: 'TSObjectKeyword', symbol: 'TSSymbolKeyword',
  bigint: 'TSBigIntKeyword', intrinsic: 'TSIntrinsicKeyword'
};

const tsParseTypeParams = () => {
  const start = tokStart;
  next(); // <
  const params = [];
  while (tokKind !== T_GT) {
    const pStart = tokStart;
    let isIn = false, isOut = false, isConst = false;
    while (true) {
      if ((isContextual('in') || tokKind === T_IN) && (peekToken()[0] === T_NAME || peekToken()[0] >= T_BREAK)) {
        isIn = true;
        next();
      } else if (isContextual('out') && (peekToken()[0] === T_NAME || peekToken()[0] >= T_BREAK)) {
        isOut = true;
        next();
      } else if (tokKind === T_CONST && (peekToken()[0] === T_NAME || peekToken()[0] >= T_BREAK)) {
        isConst = true;
        next();
      } else break;
    }
    const name = parseIdent(true);
    const constraint = eat(T_EXTENDS) ? tsParseType() : null;
    const def = eat(T_EQ) ? tsParseType() : null;
    params.push({ type: 'TSTypeParameter', start: pStart, end: prevEnd, name, constraint, default: def, in: isIn, out: isOut, const: isConst });
    if (tokKind !== T_GT) expect(T_COMMA);
  }
  next(); // >
  return { type: 'TSTypeParameterDeclaration', start, end: prevEnd, params };
};

// '<' Type,+ '>' (instantiation); current token is <
const tsParseTypeArgs = () => {
  const start = tokStart;
  next(); // <
  const params = [];
  while (true) {
    params.push(tsParseType());
    if (tokKind === T_COMMA) {
      next();
      continue;
    }
    break;
  }
  tsExpectGt();
  return { type: 'TSTypeParameterInstantiation', start, end: tokStart, params };
};

const tsParseSignatureParams = () => {
  expect(T_LPAREN);
  return parseBindingList(T_RPAREN, false, true, true);
};

const tsParseFunctionType = () => {
  const start = tokStart;
  const typeParameters = tokKind === T_LT ? tsParseTypeParams() : null;
  const parameters = tsParseSignatureParams();
  const rStart = tokStart;
  expect(T_ARROW);
  const typeAnnotation = tsTypeAnnotationNode(rStart, tsParseReturnTypeInner());
  return { type: 'TSFunctionType', start, end: prevEnd, typeParameters, parameters, typeAnnotation };
};

const tsParseConstructorType = () => {
  const start = tokStart;
  let isAbstract = false;
  if (isContextual('abstract')) {
    isAbstract = true;
    next();
  }
  expect(T_NEW);
  const typeParameters = tokKind === T_LT ? tsParseTypeParams() : null;
  const parameters = tsParseSignatureParams();
  const rStart = tokStart;
  expect(T_ARROW);
  const typeAnnotation = tsTypeAnnotationNode(rStart, tsParseType());
  return { type: 'TSConstructorType', start, end: prevEnd, typeParameters, parameters, typeAnnotation, abstract: isAbstract };
};

const tsParseThisType = () => {
  const start = tokStart;
  next();
  return { type: 'TSThisType', start, end: prevEnd };
};

const tsParseReturnTypeInner = () => {
  const start = tokStart;
  if (isContextual('asserts')) {
    const ahead = peekToken();
    if (!ahead[4] && (ahead[0] === T_NAME || ahead[0] === T_THIS)) {
      next();
      const parameterName = tokKind === T_THIS ? tsParseThisType() : parseIdent(true);
      let typeAnnotation = null;
      if (isContextual('is')) {
        const tStart = tokStart;
        next();
        typeAnnotation = tsTypeAnnotationNode(tStart, tsParseType());
      }
      return { type: 'TSTypePredicate', start, end: prevEnd, parameterName, typeAnnotation, asserts: true };
    }
  }
  if (tokKind === T_NAME || tokKind === T_THIS) {
    const ahead = peekToken();
    if (ahead[0] === T_NAME && ahead[1] === 'is' && !ahead[3] && !ahead[4]) {
      const parameterName = tokKind === T_THIS ? tsParseThisType() : parseIdent(true);
      const tStart = tokStart;
      next(); // is
      const typeAnnotation = tsTypeAnnotationNode(tStart, tsParseType());
      return { type: 'TSTypePredicate', start, end: prevEnd, parameterName, typeAnnotation, asserts: false };
    }
  }
  return tsParseType();
};

const tsParseReturnType = () => {
  const start = tokStart;
  next(); // :
  return tsTypeAnnotationNode(start, tsParseReturnTypeInner());
};

let tsNoConditional = false;

const tsParseType = () => {
  const oldNC = tsNoConditional;
  tsNoConditional = false;
  try {
    return tsParseTypeInner();
  } finally {
    tsNoConditional = oldNC;
  }
};

const tsParseFnOrCtorType = () => {
  if (tokKind === T_LT || tokKind === T_NEW || (isContextual('abstract') && peekToken()[0] === T_NEW))
    return tokKind === T_LT ? tsParseFunctionType() : tsParseConstructorType();
  if (tokKind === T_LPAREN) return tsTry(tsParseFunctionType);
  return null;
};

const tsParseTypeInner = () => {
  const fn = tsParseFnOrCtorType();
  if (fn) return fn;

  const start = tokStart;
  const checkType = tsParseUnionType();
  if (tokKind === T_EXTENDS && !newlineBefore) {
    next();
    const extendsType = tsParseNonConditionalType();
    expect(T_QUESTION);
    const trueType = tsParseType();
    expect(T_COLON);
    const falseType = tsParseType();
    return { type: 'TSConditionalType', start, end: prevEnd, checkType, extendsType, trueType, falseType };
  }
  return checkType;
};

const tsParseNonConditionalType = () => {
  const oldNC = tsNoConditional;
  tsNoConditional = true;
  try {
    return tsParseFnOrCtorType() ?? tsParseUnionType();
  } finally {
    tsNoConditional = oldNC;
  }
};

const tsParseUnionType = () => {
  const start = tokStart;
  if (tokKind === T_BINOP && tokValue === '|') next();
  const types = [ tsParseIntersectionType() ];
  while (tokKind === T_BINOP && tokValue === '|') {
    next();
    types.push(tsParseIntersectionType());
  }
  if (types.length === 1) return types[0];
  return { type: 'TSUnionType', start, end: prevEnd, types };
};

const tsParseIntersectionType = () => {
  const start = tokStart;
  if (tokKind === T_BINOP && tokValue === '&') next();
  const types = [ tsParseTypeOperator() ];
  while (tokKind === T_BINOP && tokValue === '&') {
    next();
    types.push(tsParseTypeOperator());
  }
  if (types.length === 1) return types[0];
  return { type: 'TSIntersectionType', start, end: prevEnd, types };
};

const tsTypeCanFollowModifier = () => {
  switch (tokKind) {
    case T_NAME: case T_THIS: case T_NULL: case T_VOID: case T_CONST: case T_TYPEOF: case T_IMPORT:
    case T_STRING: case T_NUM: case T_BIGINT: case T_TRUE: case T_FALSE: case T_NEW:
    case T_LBRACE: case T_LBRACKET: case T_LPAREN: case T_LT: case T_BACKQUOTE:
      return true;
    case T_PLUSMIN: return tokValue === '-';
  }
  return false;
};

const tsParseTypeOperator = () => {
  const start = tokStart;
  if (isContextual('keyof') || isContextual('unique') || isContextual('readonly')) {
    const operator = tokValue;
    const st = saveState();
    next();
    if (tsTypeCanFollowModifier()) {
      return { type: 'TSTypeOperator', start, end: prevEnd, operator, typeAnnotation: tsParseTypeOperator() };
    }
    restoreState(st);
  }
  if (isContextual('infer')) {
    const ahead = peekToken();
    if (ahead[0] === T_NAME || ahead[0] >= T_BREAK) {
      next();
      const nStart = tokStart;
      const name = parseIdent(true);
      let constraint = null;
      if (tokKind === T_EXTENDS && !newlineBefore) {
        constraint = tsTry(() => {
          next();
          const c = tsParseNonConditionalType();
          // constraint kept when the following '?' closes an enclosing conditional
          if (!tsNoConditional && tokKind === T_QUESTION) unexpected();
          return c;
        });
      }
      const typeParameter = { type: 'TSTypeParameter', start: nStart, end: prevEnd, name, constraint, default: null, in: false, out: false, const: false };
      return { type: 'TSInferType', start, end: prevEnd, typeParameter };
    }
  }
  return tsParsePostfixType();
};

const tsParsePostfixType = () => {
  const start = tokStart;
  let type = tsParsePrimaryType();
  while (tokKind === T_LBRACKET && !newlineBefore) {
    next();
    if (eat(T_RBRACKET)) {
      type = { type: 'TSArrayType', start, end: prevEnd, elementType: type };
    } else {
      const indexType = tsParseType();
      expect(T_RBRACKET);
      type = { type: 'TSIndexedAccessType', start, end: prevEnd, objectType: type, indexType };
    }
  }
  return type;
};

const tsParsePrimaryType = () => {
  const start = tokStart;
  switch (tokKind) {
    case T_NAME: {
      const kw = tsKeywordTypes[tokValue];
      if (typeof kw === 'string') {
        const ahead = peekToken()[0];
        if (ahead !== T_DOT && ahead !== T_LT) {
          next();
          return { type: kw, start, end: prevEnd };
        }
      }
      const typeName = tsEntityName();
      const typeParameters = tokKind === T_LT && !newlineBefore ? tsParseTypeArgs() : null;
      return { type: 'TSTypeReference', start, end: prevEnd, typeName, typeParameters };
    }

    case T_VOID: {
      next();
      return { type: 'TSVoidKeyword', start, end: prevEnd };
    }
    case T_NULL: {
      next();
      return { type: 'TSNullKeyword', start, end: prevEnd };
    }
    case T_THIS:
      return tsParseThisType();
    case T_CONST: {
      // 'as const' assertions
      next();
      return { type: 'TSTypeReference', start, end: prevEnd, typeName: { type: 'Identifier', start, end: prevEnd, name: 'const' }, typeParameters: null };
    }

    case T_STRING: case T_NUM: case T_BIGINT: case T_TRUE: case T_FALSE: {
      const literal = parseExprAtom(null, false);
      return { type: 'TSLiteralType', start, end: prevEnd, literal };
    }

    case T_PLUSMIN: {
      if (tokValue !== '-') unexpected();
      next();
      if (tokKind !== T_NUM && tokKind !== T_BIGINT) unexpected();
      const arg = parseExprAtom(null, false);
      const literal = { type: 'UnaryExpression', start, end: prevEnd, operator: '-', prefix: true, argument: arg };
      return { type: 'TSLiteralType', start, end: prevEnd, literal };
    }

    case T_BACKQUOTE:
      return tsParseTemplateLiteralType();

    case T_LBRACE:
      return tsLooksLikeMappedType() ? tsParseMappedType() : tsParseTypeLiteral();

    case T_LBRACKET:
      return tsParseTupleType();

    case T_TYPEOF: {
      next();
      const exprName = tokKind === T_IMPORT ? tsParseImportType() : tsEntityName();
      const typeParameters = tokKind === T_LT && !newlineBefore ? tsParseTypeArgs() : null;
      return { type: 'TSTypeQuery', start, end: prevEnd, exprName, typeParameters };
    }

    case T_IMPORT:
      return tsParseImportType();

    case T_LPAREN: {
      next();
      const typeAnnotation = tsParseType();
      expect(T_RPAREN);
      return { type: 'TSParenthesizedType', start, end: prevEnd, typeAnnotation };
    }
  }
  unexpected();
};

const tsParseTypeLiteral = () => {
  const start = tokStart;
  const members = tsParseObjectTypeMembers();
  return { type: 'TSTypeLiteral', start, end: prevEnd, members };
};

const tsParseImportType = () => {
  const start = tokStart;
  next(); // import
  expect(T_LPAREN);
  if (tokKind !== T_STRING) unexpected();
  const argument = parseStringLiteral();
  let options = null;
  if (eat(T_COMMA) && tokKind !== T_RPAREN) {
    options = parseObj(false);
    if (tokKind === T_COMMA) next();
  }
  expect(T_RPAREN);
  let qualifier = null;
  if (eat(T_DOT)) qualifier = tsEntityName();
  const typeParameters = tokKind === T_LT && !newlineBefore ? tsParseTypeArgs() : null;
  return { type: 'TSImportType', start, end: prevEnd, argument, options, qualifier, typeParameters };
};

const tsParseTemplateLiteralType = () => {
  const start = tokStart;
  const literal = parseTemplate(true, true);
  return { type: 'TSLiteralType', start, end: prevEnd, literal };
};

const tsLooksLikeMappedType = () => {
  // '{' ('+'|'-')? 'readonly'? '[' ident 'in'
  const st = saveState();
  next(); // {
  let ok = true;
  if (tokKind === T_PLUSMIN) {
    next();
    if (isContextual('readonly')) next();
    else ok = false;
  } else if (isContextual('readonly')) {
    next();
  }
  if (ok && tokKind === T_LBRACKET) {
    next();
    if (tokKind === T_NAME) {
      next();
      ok = tokKind === T_IN;
    } else ok = false;
  } else ok = false;
  restoreState(st);
  return ok;
};

const tsParseMappedType = () => {
  const start = tokStart;
  next(); // {
  let readonly = false;
  if (tokKind === T_PLUSMIN) {
    readonly = tokValue;
    next();
    expectContextual('readonly');
  } else if (eatContextual('readonly')) {
    readonly = true;
  }
  expect(T_LBRACKET);
  const pStart = tokStart;
  const name = parseIdent(true);
  expect(T_IN);
  const constraint = tsParseType();
  const typeParameter = { type: 'TSTypeParameter', start: pStart, end: prevEnd, name, constraint, default: null, in: false, out: false, const: false };
  let nameType = null;
  if (eatContextual('as')) nameType = tsParseType();
  expect(T_RBRACKET);
  let optional = false;
  if (tokKind === T_PLUSMIN) {
    optional = tokValue;
    next();
    expect(T_QUESTION);
  } else if (eat(T_QUESTION)) {
    optional = true;
  }
  const typeAnnotation = eat(T_COLON) ? tsParseType() : null;
  if (!eat(T_SEMI)) eat(T_COMMA);
  expect(T_RBRACE);
  return { type: 'TSMappedType', start, end: prevEnd, typeParameter, nameType, optional, readonly, typeAnnotation };
};

const tsParseTupleType = () => {
  const start = tokStart;
  next(); // [
  const elementTypes = [];
  let first = true;
  while (!eat(T_RBRACKET)) {
    if (!first) {
      expect(T_COMMA);
      if (afterTrailingComma(T_RBRACKET)) break;
    } else first = false;

    const eStart = tokStart;
    if (tokKind === T_ELLIPSIS) {
      next();
      const typeAnnotation = tsParseTupleMember();
      elementTypes.push({ type: 'TSRestType', start: eStart, end: prevEnd, typeAnnotation });
    } else {
      elementTypes.push(tsParseTupleMember());
    }
  }
  return { type: 'TSTupleType', start, end: prevEnd, elementTypes };
};

const tsParseTupleMember = () => {
  const start = tokStart;
  if (tokKind === T_NAME || tokKind >= T_BREAK) {
    const ahead = peekToken();
    if (ahead[0] === T_COLON || ahead[0] === T_QUESTION) {
      const named = tsTry(() => {
        const label = parseIdent(true);
        const optional = eat(T_QUESTION);
        if (!eat(T_COLON)) unexpected();
        const elementType = tsParseType();
        return { type: 'TSNamedTupleMember', start, end: prevEnd, label, optional, elementType };
      });
      if (named) return named;
    }
  }
  const t = tsParseType();
  if (eat(T_QUESTION)) return { type: 'TSOptionalType', start, end: prevEnd, typeAnnotation: t };
  return t;
};

const tsParseObjectTypeMembers = () => {
  expect(T_LBRACE);
  const members = [];
  while (!eat(T_RBRACE)) {
    if (tokKind === T_EOF) unexpected();
    members.push(tsParseTypeMember());
    if (!eat(T_COMMA) && !eat(T_SEMI) && tokKind !== T_RBRACE && !newlineBefore) unexpected();
  }
  return members;
};

const tsIsIndexSignature = () => {
  // '[' ident ':', distinct from computed property '[expr]:'
  if (tokKind !== T_LBRACKET) return false;
  const st = saveState();
  next();
  let ok = false;
  if (tokKind === T_NAME) {
    next();
    ok = tokKind === T_COLON;
  }
  restoreState(st);
  return ok;
};

const tsParseIndexSignature = (start, isStatic, readonly) => {
  next(); // [
  let param = parseIdent(false);
  param = tsParamAnnotation(param);
  expect(T_RBRACKET);
  const typeAnnotation = tokKind === T_COLON ? tsTypeAnnotation() : null;
  return { type: 'TSIndexSignature', start, end: prevEnd, parameters: [ param ], typeAnnotation, static: isStatic, readonly };
};

const tsParseSignatureTail = () => {
  const typeParameters = tokKind === T_LT ? tsParseTypeParams() : null;
  const parameters = tsParseSignatureParams();
  const returnType = tokKind === T_COLON ? tsParseReturnType() : null;
  return { typeParameters, parameters, returnType };
};

const tsParseTypeMember = () => {
  const start = tokStart;

  if (tokKind === T_LPAREN || tokKind === T_LT) {
    const { typeParameters, parameters, returnType } = tsParseSignatureTail();
    return { type: 'TSCallSignatureDeclaration', start, end: prevEnd, typeParameters, parameters, returnType };
  }

  if (tokKind === T_NEW) {
    const ahead = peekToken();
    if (ahead[0] === T_LPAREN || ahead[0] === T_LT) {
      next();
      const { typeParameters, parameters, returnType } = tsParseSignatureTail();
      return { type: 'TSConstructSignatureDeclaration', start, end: prevEnd, typeParameters, parameters, returnType };
    }
  }

  let readonly = false;
  if (isContextual('readonly')) {
    const ahead = peekToken();
    if (ahead[0] !== T_COLON && ahead[0] !== T_QUESTION && ahead[0] !== T_LPAREN && ahead[0] !== T_LT &&
        ahead[0] !== T_COMMA && ahead[0] !== T_SEMI && ahead[0] !== T_RBRACE) {
      readonly = true;
      next();
    }
  }

  if (tsIsIndexSignature()) return tsParseIndexSignature(start, false, readonly);

  if ((isContextual('get') || isContextual('set')) && !readonly) {
    const ahead = peekToken();
    if (ahead[0] === T_NAME || ahead[0] === T_STRING || ahead[0] === T_NUM || ahead[0] === T_LBRACKET || ahead[0] >= T_BREAK) {
      const kind = tokValue;
      next();
      const { key, computed } = parsePropertyName();
      const optional = eat(T_QUESTION);
      const { typeParameters, parameters, returnType } = tsParseSignatureTail();
      return { type: 'TSMethodSignature', start, end: prevEnd, key, computed, optional, kind, typeParameters, parameters, returnType };
    }
  }

  const { key, computed } = parsePropertyName();
  const optional = eat(T_QUESTION);

  if (tokKind === T_LPAREN || tokKind === T_LT) {
    const { typeParameters, parameters, returnType } = tsParseSignatureTail();
    return { type: 'TSMethodSignature', start, end: prevEnd, key, computed, optional, kind: 'method', typeParameters, parameters, returnType };
  }

  const typeAnnotation = tokKind === T_COLON ? tsTypeAnnotation() : null;
  return { type: 'TSPropertySignature', start, end: prevEnd, key, computed, optional, readonly, typeAnnotation };
};

const tsParamAnnotation = left => {
  left.typeAnnotation = tsTypeAnnotation();
  left.end = prevEnd;
  return left;
};

const tsCatchAnnotation = param => {
  param.typeAnnotation = tsTypeAnnotation();
  param.end = prevEnd;
  return param;
};

const tsParseBindingListItem = param => {
  if (tokKind === T_QUESTION) {
    param.optional = true;
    next();
  }
  if (tokKind === T_COLON) {
    param.typeAnnotation = tsTypeAnnotation();
    param.end = prevEnd;
  }
  return param;
};

const tsIsParamModifier = name => {
  switch (name) {
    case 'public': case 'private': case 'protected': case 'readonly': case 'override':
      return true;
  }
  return false;
};

const tsParseAssignableListItem = allowModifiers => {
  const start = tokStart;
  let decorators = [];
  if (tokKind === T_AT) decorators = parseDecorators();

  let accessibility = null, readonly = false, override = false;
  if (allowModifiers) {
    while (tokKind === T_NAME && !tokEsc && tsIsParamModifier(tokValue)) {
      const ahead = peekToken();
      if (!(ahead[0] === T_NAME || ahead[0] === T_LBRACE || ahead[0] === T_LBRACKET || ahead[0] === T_ELLIPSIS || ahead[0] === T_THIS)) break;
      if (tokValue === 'readonly') readonly = true;
      else if (tokValue === 'override') override = true;
      else accessibility = tokValue;
      next();
    }
  }

  let elem;
  if (tokKind === T_ELLIPSIS) {
    elem = parseRestBinding();
    tsParseBindingListItem(elem);
  } else if (tokKind === T_THIS) {
    const thisId = { type: 'Identifier', start: tokStart, end: tokEnd, name: 'this' };
    next();
    elem = tsParseBindingListItem(thisId);
  } else {
    elem = parseMaybeDefault(tokStart);
  }

  if (accessibility || readonly || override || decorators.length) {
    elem = {
      type: 'TSParameterProperty', start, end: prevEnd, parameter: elem,
      accessibility, readonly, override, static: false, decorators
    };
  }
  return elem;
};

const tsParseAs = (left, leftStart) => {
  next(); // as
  const typeAnnotation = tokKind === T_CONST && peekToken()[0] !== T_DOT
    ? tsParsePrimaryType() : tsParseType();
  return { type: 'TSAsExpression', start: leftStart, end: prevEnd, expression: left, typeAnnotation };
};

const tsParseSatisfies = (left, leftStart) => {
  next(); // satisfies
  const typeAnnotation = tsParseType();
  return { type: 'TSSatisfiesExpression', start: leftStart, end: prevEnd, expression: left, typeAnnotation };
};

// tokens after 'f<T>' that keep it an instantiation (TS canFollowTypeArgumentsInExpression)
const tsCanFollowTypeArgs = () => {
  switch (tokKind) {
    case T_LPAREN: case T_BACKQUOTE: case T_COMMA: case T_DOT: case T_QDOT:
    case T_RPAREN: case T_RBRACKET: case T_COLON: case T_SEMI: case T_QUESTION:
    case T_RBRACE: case T_EOF:
      return true;
    case T_BINOP:
      return tokValue === '==' || tokValue === '===' || tokValue === '!=' || tokValue === '!==' ||
        tokValue === '&&' || tokValue === '||' || tokValue === '??' ||
        tokValue === '^' || tokValue === '&' || tokValue === '|';
  }
  return false;
};

// TS in subscript position: x! and f<T> calls/instantiations
const tsParseSubscript = (base, startPos, noCalls, optional, optionalChained, noIn) => {
  if (tokKind === T_PREFIX && tokValue === '!' && !newlineBefore) {
    next();
    return { type: 'TSNonNullExpression', start: startPos, end: prevEnd, expression: base };
  }

  if (tokKind === T_LT || (tokKind === T_BINOP && tokValue === '<<')) {
    const result = tsTry(() => {
      if (tokKind === T_BINOP) {
        // f<<T>> lexed '<<', split into two '<'
        tokStart++;
        finishToken(T_LT, '<', 8);
        tokEnd = tokStart + 1;
      }
      const typeParameters = tsParseTypeArgs();
      if (tokKind === T_LPAREN && !noCalls) {
        next();
        const exprList = parseExprList(T_RPAREN, true, false);
        return { type: 'CallExpression', start: startPos, end: prevEnd, callee: base, arguments: exprList, optional, typeParameters };
      }
      if (tokKind === T_BACKQUOTE) {
        if (optional || optionalChained) raise(tokStart, 'Optional chaining cannot appear in the tag of tagged template expressions');
        const quasi = parseTemplate(true);
        return { type: 'TaggedTemplateExpression', start: startPos, end: prevEnd, tag: base, quasi, typeParameters };
      }
      if (optional) unexpected();
      if (!tsCanFollowTypeArgs()) unexpected(); // relational after all
      return { type: 'TSInstantiationExpression', start: startPos, end: prevEnd, expression: base, typeParameters };
    });
    if (result) return result;
  }
  return null;
};

// cheap lookahead: could '(' start arrow params? sound negatives only, avoids tsTry's throw-and-reparse
const tsParenLooksLikeArrow = () => {
  const st = saveState();
  next(); // (
  let result;
  if (tokKind === T_RPAREN) {
    next();
    result = tokKind === T_ARROW || tokKind === T_COLON;
  } else if (tokKind === T_ELLIPSIS || tokKind === T_LBRACE || tokKind === T_LBRACKET || tokKind === T_AT) {
    result = true; // rest/destructuring: ambiguous, worth the try
  } else if (tokKind === T_NAME || tokKind === T_THIS) {
    next();
    if (tokKind === T_COLON || tokKind === T_QUESTION || tokKind === T_COMMA || tokKind === T_EQ) {
      result = true;
    } else if (tokKind === T_RPAREN) {
      next();
      result = tokKind === T_ARROW || tokKind === T_COLON;
    } else {
      result = false;
    }
  } else {
    result = false;
  }
  restoreState(st);
  return result;
};

// '(' params ')' retType? '=>' body, current token is '('
const tsParseArrowTail = (start, isAsync, noIn, typeParameters) => {
  const oldYieldPos = yieldPos, oldAwaitPos = awaitPos, oldAwaitIdentPos = awaitIdentPos;
  yieldPos = 0;
  awaitPos = 0;
  awaitIdentPos = 0;
  enterScope(functionFlags(isAsync, false) | SCOPE_ARROW);

  next(); // (
  const params = parseBindingList(T_RPAREN, false, true);
  const returnType = tokKind === T_COLON ? tsParseReturnType() : null;
  if (canInsertSemicolon() || tokKind !== T_ARROW) unexpected();
  next();
  checkYieldAwaitInDefaultParams();

  const node = {
    type: 'ArrowFunctionExpression', start, end: 0, id: null, expression: false,
    generator: false, async: isAsync, params, body: null, typeParameters, returnType
  };
  parseFunctionBody(node, true, false);

  yieldPos = oldYieldPos;
  awaitPos = oldAwaitPos;
  awaitIdentPos = oldAwaitIdentPos;
  node.end = prevEnd;
  return node;
};

// expression-start '<': generic arrow or type assertion
const tsParseExprAtom = (refDE, noIn, canBeArrow) => {
  if (tokKind !== T_LT) return null;
  const start = tokStart;

  const arrow = tsTry(() => {
    const typeParameters = tsParseTypeParams();
    if (tokKind !== T_LPAREN) unexpected();
    return tsParseArrowTail(start, false, noIn, typeParameters);
  });
  if (arrow) return arrow;

  // type assertion <T>expr
  next(); // <
  const typeAnnotation = tsParseType();
  tsExpectGt();
  const expression = parseMaybeUnary(null, true, false, noIn);
  return { type: 'TSTypeAssertion', start, end: prevEnd, typeAnnotation, expression };
};

const tsFinishOverloadSignature = node => {
  semicolon();
  node.type = 'TSDeclareFunction';
  node.end = prevEnd;
  return node;
};

let tsInNamespace = false, tsAmbient = false;

const tsParseInterface = (start, isDeclare) => {
  next(); // interface
  const id = parseIdent(false);
  const typeParameters = tokKind === T_LT ? tsParseTypeParams() : null;
  let heritage = [];
  if (eat(T_EXTENDS)) {
    while (true) {
      const hStart = tokStart;
      const expression = tsEntityName();
      const typeParameters2 = tokKind === T_LT ? tsParseTypeArgs() : null;
      heritage.push({ type: 'TSInterfaceHeritage', start: hStart, end: prevEnd, expression, typeParameters: typeParameters2 });
      if (!eat(T_COMMA)) break;
    }
  }
  const bStart = tokStart;
  const members = tsParseObjectTypeMembers();
  return {
    type: 'TSInterfaceDeclaration', start, end: prevEnd, id, typeParameters,
    extends: heritage, body: { type: 'TSInterfaceBody', start: bStart, end: prevEnd, body: members },
    declare: isDeclare
  };
};

const tsParseTypeAlias = (start, isDeclare) => {
  next(); // type
  const id = parseIdent(false);
  const typeParameters = tokKind === T_LT ? tsParseTypeParams() : null;
  expect(T_EQ);
  const typeAnnotation = tsParseType();
  semicolon();
  return { type: 'TSTypeAliasDeclaration', start, end: prevEnd, id, typeParameters, typeAnnotation, declare: isDeclare };
};

const tsParseEnum = (start, isConst, isDeclare) => {
  next(); // enum
  const id = parseIdent(false);
  expect(T_LBRACE);
  const members = [];
  let first = true;
  while (!eat(T_RBRACE)) {
    if (!first) {
      expect(T_COMMA);
      if (afterTrailingComma(T_RBRACE)) break;
    } else first = false;

    const mStart = tokStart;
    const mid = tokKind === T_STRING ? parseStringLiteral() : parseIdent(true);
    const initializer = eat(T_EQ) ? parseMaybeAssign(false) : null;
    members.push({ type: 'TSEnumMember', start: mStart, end: prevEnd, id: mid, initializer });
  }
  return { type: 'TSEnumDeclaration', start, end: prevEnd, id, members, const: isConst, declare: isDeclare };
};

const tsParseModuleBlock = () => {
  const start = tokStart;
  expect(T_LBRACE);
  enterScope(SCOPE_TOP);
  const oldNs = tsInNamespace, oldExports = exportsSeen;
  tsInNamespace = true;
  exportsSeen = {};
  const body = [];
  while (!eat(T_RBRACE)) {
    if (tokKind === T_EOF) unexpected();
    body.push(parseStatement(null));
  }
  tsInNamespace = oldNs;
  exportsSeen = oldExports;
  exitScope();
  return { type: 'TSModuleBlock', start, end: prevEnd, body };
};

const tsParseModuleName = (start, isDeclare) => {
  const id = parseIdent(false);
  let body;
  if (eat(T_DOT)) {
    body = tsParseModuleName(tokStart, isDeclare);
  } else {
    body = tsParseModuleBlock();
  }
  return { type: 'TSModuleDeclaration', start, end: prevEnd, id, body, declare: isDeclare, global: false };
};

const tsParseModuleDecl = (start, isDeclare) => {
  const isModuleKeyword = tokValue === 'module';
  next(); // namespace | module
  if (isModuleKeyword && tokKind === T_STRING) {
    const id = parseStringLiteral();
    let body = null;
    if (tokKind === T_LBRACE) body = tsParseModuleBlock();
    else semicolon();
    return { type: 'TSModuleDeclaration', start, end: prevEnd, id, body, declare: isDeclare, global: false };
  }
  return tsParseModuleName(start, isDeclare);
};

const tsParseGlobal = (start, isDeclare) => {
  const id = parseIdent(true);
  const body = tsParseModuleBlock();
  return { type: 'TSModuleDeclaration', start, end: prevEnd, id, body, declare: isDeclare, global: true };
};

const tsParseDeclare = start => {
  next(); // declare
  const oldAmbient = tsAmbient;
  tsAmbient = true;
  let node;
  try {
    if (tokKind === T_CLASS) {
      node = parseClass(true, false, true);
    } else if (tokKind === T_FUNCTION) {
      next();
      node = parseFunction(tokStart, FUNC_STATEMENT, false);
      node.declare = true;
      node.start = start;
      return node;
    } else if (tokKind === T_VAR || tokKind === T_CONST || isLetDeclaration(null)) {
      if (ts && tokKind === T_CONST && peekToken()[1] === 'enum') {
        next();
        node = tsParseEnum(start, true, true);
      } else {
        node = parseVarStatement(tokKind === T_VAR || tokKind === T_CONST ? tokValue : 'let');
        node.declare = true;
      }
    } else if (isContextual('abstract') && peekToken()[0] === T_CLASS) {
      next();
      node = parseClass(true, true, true);
    } else if (tokKind === T_ENUM) {
      node = tsParseEnum(start, false, true);
    } else if (isContextual('namespace') || isContextual('module')) {
      node = tsParseModuleDecl(start, true);
    } else if (isContextual('global')) {
      node = tsParseGlobal(start, true);
    } else if (isContextual('interface')) {
      node = tsParseInterface(start, true);
    } else if (isContextual('type')) {
      node = tsParseTypeAlias(start, true);
    } else {
      unexpected();
    }
  } finally {
    tsAmbient = oldAmbient;
  }
  node.start = start;
  return node;
};

const tsParseStatement = (context, topLevel, start) => {
  if (tokEsc || tokKind !== T_NAME) return undefined;
  const word = tokValue;

  if (word === 'interface') {
    const ahead = peekToken();
    if (ahead[0] === T_NAME && !ahead[4]) {
      if (context) unexpected();
      return tsParseInterface(start, false);
    }
  } else if (word === 'type') {
    const ahead = peekToken();
    if (ahead[0] === T_NAME && !ahead[4]) {
      if (context) unexpected();
      return tsParseTypeAlias(start, false);
    }
  } else if (word === 'enum') {
    if (peekToken()[0] === T_NAME) {
      if (context) unexpected();
      return tsParseEnum(start, false, false);
    }
  } else if (word === 'namespace' || word === 'module') {
    const ahead = peekToken();
    if ((ahead[0] === T_NAME || (word === 'module' && ahead[0] === T_STRING)) && !ahead[4]) {
      if (context) unexpected();
      return tsParseModuleDecl(start, false);
    }
  } else if (word === 'declare') {
    const ahead = peekToken();
    if (!ahead[4] && (ahead[0] === T_CLASS || ahead[0] === T_FUNCTION || ahead[0] === T_VAR || ahead[0] === T_CONST || ahead[0] === T_ENUM ||
        (ahead[0] === T_NAME && (ahead[1] === 'let' || ahead[1] === 'namespace' ||
          ahead[1] === 'module' || ahead[1] === 'global' || ahead[1] === 'interface' || ahead[1] === 'type' ||
          ahead[1] === 'abstract')))) {
      if (context) unexpected();
      return tsParseDeclare(start);
    }
  } else if (word === 'abstract') {
    if (peekToken()[0] === T_CLASS) {
      if (context) unexpected();
      next();
      const cls = parseClass(true, true, false);
      cls.start = start;
      return cls;
    }
  } else if (word === 'global') {
    if (peekToken()[0] === T_LBRACE) return tsParseGlobal(start, false);
  }
  return undefined;
};

const tsParseImportEquals = (start, isExport, importKind) => {
  const id = parseIdent(false);
  checkLValSimple(id, BIND_LEXICAL);
  expect(T_EQ);
  let moduleReference;
  if (isContextual('require') && peekToken()[0] === T_LPAREN) {
    const rStart = tokStart;
    next();
    next(); // (
    if (tokKind !== T_STRING) unexpected();
    const expression = parseStringLiteral();
    expect(T_RPAREN);
    moduleReference = { type: 'TSExternalModuleReference', start: rStart, end: prevEnd, expression };
  } else {
    moduleReference = tsEntityName();
  }
  semicolon();
  return { type: 'TSImportEqualsDeclaration', start, end: prevEnd, id, moduleReference, isExport, importKind };
};

// is 'type' in a specifier list a type marker?
const tsSpecifierIsType = () => {
  const st = saveState();
  next();
  let result = false;
  if (tokKind === T_NAME || tokKind === T_STRING || tokKind >= T_BREAK) {
    if (!(tokKind === T_NAME && tokValue === 'as')) {
      result = true; // type X
    } else {
      next();
      if (tokKind === T_NAME || tokKind >= T_BREAK) {
        next();
        result = tokKind === T_NAME || tokKind >= T_BREAK; // type as as x → type; type as X → value
      } else {
        result = true; // {type as} → type-only of 'as'
      }
    }
  }
  restoreState(st);
  return result;
};

const tsParseExportSpecial = start => {
  if (tokKind === T_EQ) {
    next();
    const expression = parseExpression(false);
    semicolon();
    return { type: 'TSExportAssignment', start, end: prevEnd, expression };
  }

  if (isContextual('as') && peekToken()[1] === 'namespace') {
    next();
    next();
    const id = parseIdent(false);
    semicolon();
    return { type: 'TSNamespaceExportDeclaration', start, end: prevEnd, id };
  }

  if (tokKind === T_IMPORT) {
    // export import X = ...
    next();
    return tsParseImportEquals(start, true, 'value');
  }

  if (isContextual('type')) {
    const ahead = peekToken();
    if (ahead[0] === T_LBRACE) {
      next();
      const specifiers = parseExportSpecifiers(true);
      let source = null, attributes = [];
      if (eatContextual('from')) {
        if (tokKind !== T_STRING) unexpected();
        source = parseStringLiteral();
        attributes = parseWithClause();
      }
      semicolon();
      return { type: 'ExportNamedDeclaration', start, end: prevEnd, declaration: null, specifiers, source, attributes, exportKind: 'type' };
    }
    if (ahead[0] === T_STAR) {
      next();
      next();
      let exported = null;
      if (eatContextual('as')) exported = parseModuleExportName();
      expectContextual('from');
      if (tokKind !== T_STRING) unexpected();
      const source = parseStringLiteral();
      const attributes = parseWithClause();
      semicolon();
      return { type: 'ExportAllDeclaration', start, end: prevEnd, exported, source, attributes, exportKind: 'type' };
    }
  }
  return null;
};

const tsParseImplements = () => {
  next(); // implements
  const list = [];
  while (true) {
    const start = tokStart;
    const expression = tsEntityName();
    const typeParameters = tokKind === T_LT ? tsParseTypeArgs() : null;
    list.push({ type: 'TSClassImplements', start, end: prevEnd, expression, typeParameters });
    if (!eat(T_COMMA)) break;
  }
  return list;
};

export default (src, opts = {}) => {
  initLexer(src, !!opts.module, !!opts.ts);

  strict = isModule;
  scopeStack = [];
  labels = [];
  privateStack = [];
  potentialArrowAt = -1;
  potentialArrowInForAwait = false;
  yieldPos = 0;
  awaitPos = 0;
  awaitIdentPos = 0;
  undefinedExports = isModule ? new Map() : null;
  exportsSeen = isModule ? {} : null;

  enterScope(SCOPE_TOP);
  if (!isModule && strictDirective(pos)) strict = true;

  next();
  const body = [];
  let prologue = true;
  while (tokKind !== T_EOF) {
    const stmt = parseStatement(null, true);
    if (prologue) {
      if (isDirectiveStatement(stmt)) stmt.directive = stmt.expression.value;
      else prologue = false;
    }
    body.push(stmt);
  }

  if (undefinedExports) {
    for (const [ name, p ] of undefinedExports) raise(p, `Export '${name}' is not defined`);
  }
  exitScope();

  return { type: 'Program', start: 0, end: inputLen, body, sourceType: isModule ? 'module' : 'script' };
};
