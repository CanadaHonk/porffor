import type {} from './porffor.d.ts';

let __Porffor_json_bufLimit: i32 = 0;

export const __Porffor_bytestring_bufferStr = (buffer: i32, str: bytestring): i32 => {
  const len: i32 = str.length;
  if (buffer + 4 + len > __Porffor_json_bufLimit) return buffer + len;
  let strPtr: i32 = Porffor.IR.ptr(str);
  let ptr: i32 = buffer;
  let endPtr: i32 = ptr + len;

  while (ptr + 4 <= endPtr) {
    Porffor.IR.storeI32(ptr, 4, Porffor.IR.loadI32(strPtr, 4));
    ptr += 4;
    strPtr += 4;
  }

  while (ptr < endPtr) {
    Porffor.IR.storeU8(ptr++, 4, Porffor.IR.loadU8(strPtr++, 4));
  }

  return ptr;
};

export const __Porffor_bytestring_bufferChar = (buffer: i32, char: i32): i32 => {
  if (buffer + 5 > __Porffor_json_bufLimit) return buffer + 1;
  Porffor.IR.storeU8(buffer, 4, char);
  return buffer + 1;
};

export const __Porffor_bytestring_buffer2Char = (buffer: i32, char1: i32, char2: i32): i32 => {
  if (buffer + 6 > __Porffor_json_bufLimit) return buffer + 2;
  Porffor.IR.storeU8(buffer, 4, char1);
  Porffor.IR.storeU8(buffer + 1, 4, char2);
  return buffer + 2;
};

export const __Porffor_json_canSerialize = (value: any): boolean => {
  if (Porffor.fastOr(
    value === null,
    value === true,
    value === false,
    (Porffor.type(value) | 0b10000000) == Porffor.TYPES.bytestring,
    Porffor.type(value) == Porffor.TYPES.stringobject,
    Porffor.type(value) == Porffor.TYPES.number,
    Porffor.type(value) == Porffor.TYPES.numberobject,
    Porffor.type(value) == Porffor.TYPES.booleanobject,
    Porffor.type(value) == Porffor.TYPES.array,
    Porffor.type(value) > Porffor.TYPES.function
  )) return true;

  if (Porffor.type(value) == Porffor.TYPES.bigint) {
    throw new TypeError('Cannot serialize BigInts');
  }

  return false;
};

export const __Porffor_json_serialize = (_buffer: i32, value: any, depth: i32, space: bytestring|undefined): i32 => {
  // somewhat modelled after 25.5.2.2 SerializeJSONProperty: https://tc39.es/ecma262/#sec-serializejsonproperty
  let buffer: i32 = _buffer;
  if (value === null) return __Porffor_bytestring_bufferStr(buffer, 'null');
  if (value === true) return __Porffor_bytestring_bufferStr(buffer, 'true');
  if (value === false) return __Porffor_bytestring_bufferStr(buffer, 'false');

  // boolean object -> [[BooleanData]]
  if (Porffor.type(value) == Porffor.TYPES.booleanobject) {
    if (value.valueOf()) return __Porffor_bytestring_bufferStr(buffer, 'true');
    return __Porffor_bytestring_bufferStr(buffer, 'false');
  }

  if (Porffor.fastOr(
    (Porffor.type(value) | 0b10000000) == Porffor.TYPES.bytestring,
    Porffor.type(value) == Porffor.TYPES.stringobject
  )) { // string
    buffer = __Porffor_bytestring_bufferChar(buffer, 34); // start "

    const len: i32 = value.length;
    for (let i: i32 = 0; i < len; i++) {
      const c: i32 = value.charCodeAt(i);
      if (c < 0x20) {
        if (c == 0x08) {
          buffer = __Porffor_bytestring_buffer2Char(buffer, 92, 98); // \b
          continue;
        }

        if (c == 0x09) {
          buffer = __Porffor_bytestring_buffer2Char(buffer, 92, 116); // \t
          continue;
        }

        if (c == 0x0a) {
          buffer = __Porffor_bytestring_buffer2Char(buffer, 92, 110); // \n
          continue;
        }

        if (c == 0x0c) {
          buffer = __Porffor_bytestring_buffer2Char(buffer, 92, 102); // \f
          continue;
        }

        if (c == 0x0d) {
          buffer = __Porffor_bytestring_buffer2Char(buffer, 92, 114); // \r
          continue;
        }

        // \u00FF
        buffer = __Porffor_bytestring_buffer2Char(buffer, 92, 117); // \u
        buffer = __Porffor_bytestring_buffer2Char(buffer, 48, 48); // 00

        const h1: i32 = (c & 0xf0) / 0x10;
        const h2: i32 = c & 0x0f;
        buffer = __Porffor_bytestring_buffer2Char(buffer, h1 < 10 ? h1 + 48 : h1 + 55, h2 < 10 ? h2 + 48 : h2 + 55); // 0-9 or A-F
        continue;
      }

      if (c == 0x22) { // "
        buffer = __Porffor_bytestring_buffer2Char(buffer, 92, 34); // \"
        continue;
      }

      if (c == 0x5c) { // \
        buffer = __Porffor_bytestring_buffer2Char(buffer, 92, 92); // \\
        continue;
      }

      // todo: support non-bytestrings
      buffer = __Porffor_bytestring_bufferChar(buffer, c);
    }

    return __Porffor_bytestring_bufferChar(buffer, 34); // final "
  }

  if (Porffor.fastOr(
    Porffor.type(value) == Porffor.TYPES.number,
    Porffor.type(value) == Porffor.TYPES.numberobject
  )) { // number
    if (Number.isFinite(value)) {
      return __Porffor_bytestring_bufferStr(buffer, Porffor.callThis(__Number_prototype_toString, value, 10));
    }

    return __Porffor_bytestring_bufferStr(buffer, 'null');
  }

  if (Porffor.type(value) == Porffor.TYPES.array) {
    buffer = __Porffor_bytestring_bufferChar(buffer, 91); // [

    const hasSpace: boolean = space !== undefined;
    depth += 1;

    for (const x of (value as any[])) {
      if (hasSpace) {
        buffer = __Porffor_bytestring_bufferChar(buffer, 10); // \n
        for (let i: i32 = 0; i < depth; i++) buffer = __Porffor_bytestring_bufferStr(buffer, space as bytestring);
      }

      if (__Porffor_json_canSerialize(x)) {
        buffer = __Porffor_json_serialize(buffer, x, depth, space);
      } else {
        // non-serializable value, write null
        buffer = __Porffor_bytestring_bufferStr(buffer, 'null');
      }

      buffer = __Porffor_bytestring_bufferChar(buffer, 44); // ,
    }

    depth -= 1;

    // swap trailing , with ] (or \n or append if empty)
    if ((buffer - _buffer) > 1) {
      if (hasSpace) {
        if (buffer + 4 <= __Porffor_json_bufLimit) Porffor.IR.storeU8(buffer, 3, 10); // \n
        for (let i: i32 = 0; i < depth; i++) buffer = __Porffor_bytestring_bufferStr(buffer, space as bytestring);
        return __Porffor_bytestring_bufferChar(buffer, 93); // ]
      }

      if (buffer + 4 <= __Porffor_json_bufLimit) Porffor.IR.storeU8(buffer, 3, 93); // ]
      return buffer;
    }

    return __Porffor_bytestring_bufferChar(buffer, 93); // ]
  }

  if (Porffor.type(value) > 0x06) {
    // non-function object
    buffer = __Porffor_bytestring_bufferChar(buffer, 123); // {

    const hasSpace: boolean = space !== undefined;
    depth += 1;

    for (const key: bytestring in (value as object)) {
      // skip symbol keys
      if (Porffor.type(key) == Porffor.TYPES.symbol) continue;

      const val: any = (value as object)[key];
      if (!__Porffor_json_canSerialize(val)) {
        // skip non-serializable value
        continue;
      }

      if (hasSpace) {
        buffer = __Porffor_bytestring_bufferChar(buffer, 10); // \n
        for (let i: i32 = 0; i < depth; i++) buffer = __Porffor_bytestring_bufferStr(buffer, space as bytestring);
      }

      buffer = __Porffor_bytestring_bufferChar(buffer, 34); // "
      buffer = __Porffor_bytestring_bufferStr(buffer, key);
      buffer = __Porffor_bytestring_bufferChar(buffer, 34); // "

      buffer = __Porffor_bytestring_bufferChar(buffer, 58); // :
      if (hasSpace) buffer = __Porffor_bytestring_bufferChar(buffer, 32); // space

      buffer = __Porffor_json_serialize(buffer, val, depth, space);
      buffer = __Porffor_bytestring_bufferChar(buffer, 44); // ,
    }

    depth -= 1;

    // swap trailing , with } (or \n or append if empty)
    if ((buffer - _buffer) > 1) {
      if (hasSpace) {
        if (buffer + 4 <= __Porffor_json_bufLimit) Porffor.IR.storeU8(buffer, 3, 10); // \n
        for (let i: i32 = 0; i < depth; i++) buffer = __Porffor_bytestring_bufferStr(buffer, space as bytestring);
        return __Porffor_bytestring_bufferChar(buffer, 125); // }
      }

      if (buffer + 4 <= __Porffor_json_bufLimit) Porffor.IR.storeU8(buffer, 3, 125); // }
      return buffer;
    }

    return __Porffor_bytestring_bufferChar(buffer, 125); // }
  }

  if (Porffor.type(value) == 0x04) {
    // bigint
    throw new TypeError('Cannot serialize BigInts');
  }

  return -1;
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
        const spaceStr: bytestring = Porffor.malloc(6 + space);
        Porffor.IR.storeI32(spaceStr, 0, 0);
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

  let cap: i32 = 4096;
  let buffer: bytestring = Porffor.malloc(6 + cap);
  __Porffor_json_bufLimit = (buffer as i32) + 4 + cap;
  let out: i32 = __Porffor_json_serialize(buffer, value, 0, space);
  if (out == -1) return undefined;

  const needed: i32 = out - (buffer as i32);
  if (needed > cap) {
    cap = needed;
    buffer = Porffor.malloc(6 + cap);
    __Porffor_json_bufLimit = (buffer as i32) + 4 + cap;
    out = __Porffor_json_serialize(buffer, value, 0, space);
  }

  buffer.length = out - (buffer as i32);
  return buffer;
};


export const __Porffor_json_skipWhitespace = (text: bytestring, pos: i32, len: i32): i32 => {
  while (pos < len) {
    const c: i32 = text.charCodeAt(pos);
    if (c > 32) break; // fast path

    if (c == 32 || c == 9 || c == 10 || c == 13) pos++;
      else break;
  }

  return pos;
};

export const __Porffor_json_parseValue = (text: bytestring, posPtr: i32, len: i32): any => {
  let pos: i32 = __Porffor_json_skipWhitespace(text, Porffor.IR.loadI32(posPtr, 0), len);
  if (pos >= len) throw new SyntaxError('Unexpected end of JSON input');

  const c: i32 = text.charCodeAt(pos);
  if (c == 110) { // 'n' - null
    if (pos + 4 <= len &&
        text.charCodeAt(pos + 1) == 117 && // 'u'
        text.charCodeAt(pos + 2) == 108 && // 'l'
        text.charCodeAt(pos + 3) == 108) { // 'l'
      pos += 4;
      Porffor.IR.storeI32(posPtr, 0, pos);
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
      Porffor.IR.storeI32(posPtr, 0, pos);
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
      Porffor.IR.storeI32(posPtr, 0, pos);
      return false;
    }
    throw new SyntaxError('Unexpected token');
  }

  if (c == 34) { // '"' - string
    pos++;

    let strEnd: i32 = pos;
    let hasEscape: boolean = false;
    while (strEnd < len) {
      const ch: i32 = text.charCodeAt(strEnd);
      if (ch == 34) break;
      if (ch == 92) {
        hasEscape = true;
        strEnd++;
      }
      strEnd++;
    }
    if (strEnd >= len) throw new SyntaxError('Unterminated string');

    const out: bytestring = Porffor.malloc(6 + (strEnd - pos));
    Porffor.IR.storeI32(out, 0, 0);

    if (!hasEscape) {
      while (pos < strEnd) {
        const ch: i32 = text.charCodeAt(pos);
        if (ch >= 0x00 && ch <= 0x1f) throw new SyntaxError('Unescaped control character');
        Porffor.bytestring.appendChar(out, ch);
        pos++;
      }
      pos++;
      Porffor.IR.storeI32(posPtr, 0, pos);
      return out;
    }

    while (pos < len) {
      const ch: i32 = text.charCodeAt(pos);
      if (ch == 34) { // closing "
        pos++;
        Porffor.IR.storeI32(posPtr, 0, pos);
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
    const arr: any[] = Porffor.array.new(4);
    __Porffor_json_skipWhitespace();

    if (pos < len && text.charCodeAt(pos) == 93) { // empty array
      pos++;
      Porffor.IR.storeI32(posPtr, 0, pos);
      return arr;
    }

    while (true) {
      Porffor.IR.storeI32(posPtr, 0, pos);
      Porffor.array.fastPush(arr, __Porffor_json_parseValue(text, posPtr, len));
      pos = __Porffor_json_skipWhitespace(text, Porffor.IR.loadI32(posPtr, 0), len);
      if (pos >= len) throw new SyntaxError('Unterminated array');

      const next: i32 = text.charCodeAt(pos);
      if (next == 93) { // ]
        pos++;
        Porffor.IR.storeI32(posPtr, 0, pos);
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
    __Porffor_json_skipWhitespace();

    if (pos < len && text.charCodeAt(pos) == 125) { // empty object
      pos++;
      Porffor.IR.storeI32(posPtr, 0, pos);
      return obj;
    }

    while (true) {
      pos = __Porffor_json_skipWhitespace(text, pos, len);
      if (pos >= len || text.charCodeAt(pos) != 34) throw new SyntaxError('Expected string key');

      Porffor.IR.storeI32(posPtr, 0, pos);
      const key: any = __Porffor_json_parseValue(text, posPtr, len);
      pos = __Porffor_json_skipWhitespace(text, Porffor.IR.loadI32(posPtr, 0), len);
      if (pos >= len || text.charCodeAt(pos) != 58) throw new SyntaxError('Expected :');
      pos++;

      Porffor.IR.storeI32(posPtr, 0, pos);
      const value: any = __Porffor_json_parseValue(text, posPtr, len);
      obj[key] = value;

      pos = __Porffor_json_skipWhitespace(text, Porffor.IR.loadI32(posPtr, 0), len);
      if (pos >= len) throw new SyntaxError('Unterminated object');

      const next: i32 = text.charCodeAt(pos);
      if (next == 125) { // }
        pos++;
        Porffor.IR.storeI32(posPtr, 0, pos);
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

    Porffor.IR.storeI32(posPtr, 0, pos);
    return ecma262.StringToNumber(Porffor.callThis(__ByteString_prototype_slice, text, start, pos));
  }

  throw new SyntaxError('Unexpected token');
};

export const __JSON_parse = (_: bytestring) => {
  // todo: support non-bytestrings
  const posPtr: i32 = Porffor.malloc(4);
  Porffor.IR.storeI32(posPtr, 0, 0);

  return __Porffor_json_parseValue(_, posPtr, _.length);
};
