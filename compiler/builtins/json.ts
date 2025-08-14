import type {} from './porffor.d.ts';

export const __Porffor_json_serialize = (value: any, depth: i32, space: bytestring|undefined): bytestring|undefined => {
  // somewhat modelled after 25.5.2.2 SerializeJSONProperty: https://tc39.es/ecma262/#sec-serializejsonproperty
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';

  if (Porffor.fastOr(
    (Porffor.type(value) | 0b10000000) == Porffor.TYPES.bytestring,
    Porffor.type(value) == Porffor.TYPES.stringobject
  )) { // string
    const out: bytestring = Porffor.allocate();
    Porffor.bytestring.appendChar(out, 34); // start "

    const len: i32 = value.length;
    for (let i: i32 = 0; i < len; i++) {
      const c: i32 = value.charCodeAt(i);
      if (c < 0x20) {
        if (c == 0x08) {
          Porffor.bytestring.append2Char(out, 92, 98); // \b
          continue;
        }

        if (c == 0x09) {
          Porffor.bytestring.append2Char(out, 92, 116); // \t
          continue;
        }

        if (c == 0x0a) {
          Porffor.bytestring.append2Char(out, 92, 110); // \n
          continue;
        }

        if (c == 0x0c) {
          Porffor.bytestring.append2Char(out, 92, 102); // \f
          continue;
        }

        if (c == 0x0d) {
          Porffor.bytestring.append2Char(out, 92, 114); // \r
          continue;
        }

        // \u00FF
        Porffor.bytestring.append2Char(out, 92, 117); // \u
        Porffor.bytestring.append2Char(out, 48, 48); // 00

        const h1: i32 = (c & 0xf0) / 0x10;
        const h2: i32 = c & 0x0f;
        Porffor.bytestring.appendChar(out, h1 < 10 ? h1 + 48 : h1 + 55); // 0-9 or A-F
        Porffor.bytestring.appendChar(out, h2 < 10 ? h2 + 48 : h2 + 55); // 0-9 or A-F
        continue;
      }

      if (c == 0x22) { // "
        Porffor.bytestring.append2Char(out, 92, 34); // \"
        continue;
      }

      if (c == 0x5c) { // \
        Porffor.bytestring.append2Char(out, 92, 92); // \\
        continue;
      }

      // todo: support non-bytestrings
      Porffor.bytestring.appendChar(out, c);
    }

    Porffor.bytestring.appendChar(out, 34); // final "
    return out;
  }

  if (Porffor.fastOr(
    Porffor.type(value) == Porffor.TYPES.number,
    Porffor.type(value) == Porffor.TYPES.numberobject
  )) { // number
    if (Number.isFinite(value)) return value + '';
    return 'null';
  }

  if (Porffor.type(value) == Porffor.TYPES.array) {
    const out: bytestring = Porffor.allocate();
    Porffor.bytestring.appendChar(out, 91); // [

    const hasSpace: boolean = space !== undefined;
    depth += 1;

    for (const x of (value as any[])) {
      if (hasSpace) {
        Porffor.bytestring.appendChar(out, 10); // \n
        for (let i: i32 = 0; i < depth; i++) Porffor.bytestring.appendStr(out, space as bytestring);
      }

      Porffor.bytestring.appendStr(out, __Porffor_json_serialize(x, depth, space) ?? 'null');

      Porffor.bytestring.appendChar(out, 44); // ,
    }

    depth -= 1;

    // swap trailing , with ] (or append if empty)
    if (out.length > 1) {
      if (hasSpace) {
        Porffor.bytestring.appendChar(out, 10); // \n
        for (let i: i32 = 0; i < depth; i++) Porffor.bytestring.appendStr(out, space as bytestring);
        Porffor.bytestring.appendChar(out, 93); // ]
      } else {
        Porffor.wasm.i32.store8(Porffor.wasm`local.get ${out}` + out.length, 93, 0, 3); // ]
      }
    } else {
      Porffor.bytestring.appendChar(out, 93); // ]
    }

    return out;
  }

  if (Porffor.type(value) > 0x06) {
    // non-function object
    const out: bytestring = Porffor.allocate();
    Porffor.bytestring.appendChar(out, 123); // {

    const hasSpace: boolean = space !== undefined;
    depth += 1;

    for (const key in (value as object)) {
      // skip symbol keys
      if (Porffor.type(key) == Porffor.TYPES.symbol) continue;

      // skip non-serializable values (functions, etc)
      const val: bytestring|undefined = __Porffor_json_serialize((value as object)[key], depth, space);
      if (val == null) continue;

      if (hasSpace) {
        Porffor.bytestring.appendChar(out, 10); // \n
        for (let i: i32 = 0; i < depth; i++) Porffor.bytestring.appendStr(out, space as bytestring);
      }

      Porffor.bytestring.appendChar(out, 34); // "
      Porffor.bytestring.appendStr(out, key);
      Porffor.bytestring.appendChar(out, 34); // "

      Porffor.bytestring.appendChar(out, 58); // :
      if (hasSpace) Porffor.bytestring.appendChar(out, 32); // space

      Porffor.bytestring.appendStr(out, val);

      Porffor.bytestring.appendChar(out, 44); // ,
    }

    depth -= 1;

    // swap trailing , with } (or append if empty)
    if (out.length > 1) {
      if (hasSpace) {
        Porffor.bytestring.appendChar(out, 10); // \n
        for (let i: i32 = 0; i < depth; i++) Porffor.bytestring.appendStr(out, space as bytestring);
        Porffor.bytestring.appendChar(out, 125); // }
      } else {
        Porffor.wasm.i32.store8(Porffor.wasm`local.get ${out}` + out.length, 125, 0, 3); // }
      }
    } else {
      Porffor.bytestring.appendChar(out, 125); // }
    }

    return out;
  }

  if (Porffor.type(value) == 0x04) {
    // bigint
    throw new TypeError('Cannot serialize BigInts');
  }

  return undefined;
};

export const __JSON_stringify = (value: any, replacer: any, space: any) => {
  // todo: replacer

  if (space !== undefined) {
    if (Porffor.fastOr(
      Porffor.type(space) == Porffor.TYPES.number,
      Porffor.type(space) == Porffor.TYPES.numberobject
    )) {
      space = Math.min(Math.trunc(space), 10);

      if (space < 1) {
        space = undefined;
      } else {
        const spaceStr: bytestring = Porffor.allocate();
        for (let i: i32 = 0; i < space; i++) Porffor.bytestring.appendChar(spaceStr, 32);

        space = spaceStr;
      }
    } else if (Porffor.fastOr(
      (Porffor.type(space) | 0b10000000) == Porffor.TYPES.bytestring,
      Porffor.type(space) == Porffor.TYPES.stringobject
    )) {
      // if empty, make it undefined
      const len: i32 = space.length;
      if (len == 0) {
        space = undefined;
      } else if (len > 10) {
        space = space.slice(0, 10);
      }
    } else {
      // not a number or string, make it undefined
      space = undefined;
    }
  }

  return __Porffor_json_serialize(value, 0, space);
};


// todo: not globals when closures work well
let text: bytestring, pos: i32, len: i32;
export const __JSON_parse = (_: bytestring) => {
  text = _;
  pos = 0;
  len = text.length;

  const skipWhitespace = () => {
    while (pos < len) {
      const c: i32 = text.charCodeAt(pos);
      if (c > 32) break; // fast path

      if (c == 32 || c == 9 || c == 10 || c == 13) pos++;
        else break;
    }
  };

  const parseValue = (): any => {
    skipWhitespace();
    if (pos >= len) throw new SyntaxError('Unexpected end of JSON input');

    const c: i32 = text.charCodeAt(pos);
    if (c == 110) { // 'n' - null
      if (pos + 4 <= len &&
          text.charCodeAt(pos + 1) == 117 && // 'u'
          text.charCodeAt(pos + 2) == 108 && // 'l'
          text.charCodeAt(pos + 3) == 108) { // 'l'
        pos += 4;
        return null;
      }
      throw new SyntaxError('Unexpected token');
    }

    if (c == 116) { // 't' - true
      if (pos + 4 <= len &&
          text.charCodeAt(pos + 1) == 114 && // 'r'
          text.charCodeAt(pos + 2) == 117 && // 'u'
          text.charCodeAt(pos + 3) == 101) { // 'e'
        pos += 4;
        return true;
      }
      throw new SyntaxError('Unexpected token');
    }

    if (c == 102) { // 'f' - false
      if (pos + 5 <= len &&
          text.charCodeAt(pos + 1) == 97 && // 'a'
          text.charCodeAt(pos + 2) == 108 && // 'l'
          text.charCodeAt(pos + 3) == 115 && // 's'
          text.charCodeAt(pos + 4) == 101) { // 'e'
        pos += 5;
        return false;
      }
      throw new SyntaxError('Unexpected token');
    }

    if (c == 34) { // '"' - string
      pos++;
      const out: bytestring = Porffor.allocate();

      while (pos < len) {
        const ch: i32 = text.charCodeAt(pos);
        if (ch == 34) { // closing "
          pos++;
          return out;
        }
        if (ch == 92) { // backslash
          pos++;
          if (pos >= len) throw new SyntaxError('Unterminated string');

          const esc: i32 = text.charCodeAt(pos++);
          if (esc == 34) Porffor.bytestring.appendChar(out, 34); // \"
            else if (esc == 92) Porffor.bytestring.appendChar(out, 92); // \\
            else if (esc == 47) Porffor.bytestring.appendChar(out, 47); // \/
            else if (esc == 98) Porffor.bytestring.appendChar(out, 8); // \b
            else if (esc == 102) Porffor.bytestring.appendChar(out, 12); // \f
            else if (esc == 110) Porffor.bytestring.appendChar(out, 10); // \n
            else if (esc == 114) Porffor.bytestring.appendChar(out, 13); // \r
            else if (esc == 116) Porffor.bytestring.appendChar(out, 9); // \t
            else if (esc == 117) { // \u
              if (pos + 4 >= len) throw new SyntaxError('Invalid unicode escape');
              let unicode: i32 = 0;
              for (let i: i32 = 0; i < 4; i++) {
                const hex: i32 = text.charCodeAt(pos + i);
                unicode <<= 4;
                if (hex >= 48 && hex <= 57) unicode |= hex - 48; // 0-9
                  else if (hex >= 65 && hex <= 70) unicode |= hex - 55; // A-F
                  else if (hex >= 97 && hex <= 102) unicode |= hex - 87; // a-f
                  else throw new SyntaxError('Invalid unicode escape');
              }
              pos += 4;
              Porffor.bytestring.appendChar(out, unicode);
            } else throw new SyntaxError('Invalid escape sequence');
        } else {
          if (ch >= 0x00 && ch <= 0x1f) throw new SyntaxError('Unescaped control character');
          Porffor.bytestring.appendChar(out, ch);
          pos++;
        }
      }
      throw new SyntaxError('Unterminated string');
    }

    if (c == 91) { // '[' - array
      pos++;
      const arr: any[] = Porffor.allocate();
      skipWhitespace();

      if (pos < len && text.charCodeAt(pos) == 93) { // empty array
        pos++;
        return arr;
      }

      while (true) {
        Porffor.array.fastPush(arr, parseValue());
        skipWhitespace();
        if (pos >= len) throw new SyntaxError('Unterminated array');

        const next: i32 = text.charCodeAt(pos);
        if (next == 93) { // ]
          pos++;
          break;
        }
        if (next == 44) { // ,
          pos++;
          continue;
        }
        throw new SyntaxError('Expected , or ]');
      }
      return arr;
    }

    if (c == 123) { // '{' - object
      pos++;
      const obj: any = {};
      skipWhitespace();

      if (pos < len && text.charCodeAt(pos) == 125) { // empty object
        pos++;
        return obj;
      }

      while (true) {
        skipWhitespace();
        if (pos >= len || text.charCodeAt(pos) != 34) throw new SyntaxError('Expected string key');

        const key: any = parseValue();
        skipWhitespace();
        if (pos >= len || text.charCodeAt(pos) != 58) throw new SyntaxError('Expected :');
        pos++;

        const value: any = parseValue();
        obj[key] = value;

        skipWhitespace();
        if (pos >= len) throw new SyntaxError('Unterminated object');

        const next: i32 = text.charCodeAt(pos);
        if (next == 125) { // }
          pos++;
          break;
        }
        if (next == 44) { // ,
          pos++;
          continue;
        }
        throw new SyntaxError('Expected , or }');
      }
      return obj;
    }

    // number
    if ((c >= 48 && c <= 57) || c == 45) { // 0-9 or -
      const start: i32 = pos;
      if (c == 45) pos++; // skip -

      while (pos < len) {
        const ch: i32 = text.charCodeAt(pos);
        if (ch >= 48 && ch <= 57) pos++; // 0-9
          else if (ch == 46 || ch == 101 || ch == 69) pos++; // . e E
          else if ((ch == 43 || ch == 45) && pos > start + 1) pos++; // + - (not at start)
          else break;
      }

      return ecma262.StringToNumber(__ByteString_prototype_slice(text, start, pos));
    }

    throw new SyntaxError('Unexpected token');
  };

  return parseValue();
};