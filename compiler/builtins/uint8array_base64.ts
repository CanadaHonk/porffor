import type {} from './porffor.d.ts';

export const __Porffor_uint8array_validate = (ta: any): void => {
  if (Porffor.type(ta) != Porffor.TYPES.uint8array) {
    throw new TypeError('Method called on incompatible receiver');
  }
};

// GetOptionsObject then its alphabet, true for base64url
export const __Porffor_base64_alphabet = (options: any): boolean => {
  if (Porffor.type(options) == Porffor.TYPES.undefined) return false;
  if (!Porffor.object.isObject(options)) throw new TypeError('Options must be an object');

  const alphabet: any = options.alphabet;
  if (Porffor.type(alphabet) == Porffor.TYPES.undefined) return false;
  if ((Porffor.type(alphabet) | 0b10000000) == Porffor.TYPES.bytestring) {
    if (Porffor.strcmp(alphabet, 'base64')) return false;
    if (Porffor.strcmp(alphabet, 'base64url')) return true;
  }
  throw new TypeError('Invalid alphabet');
};

// 0 loose, 1 strict, 2 stop-before-partial
export const __Porffor_base64_lastChunkHandling = (options: any): i32 => {
  if (Porffor.type(options) == Porffor.TYPES.undefined) return 0;

  const handling: any = options.lastChunkHandling;
  if (Porffor.type(handling) == Porffor.TYPES.undefined) return 0;
  if ((Porffor.type(handling) | 0b10000000) == Porffor.TYPES.bytestring) {
    if (Porffor.strcmp(handling, 'loose')) return 0;
    if (Porffor.strcmp(handling, 'strict')) return 1;
    if (Porffor.strcmp(handling, 'stop-before-partial')) return 2;
  }
  throw new TypeError('Invalid lastChunkHandling');
};

export const __Uint8Array_prototype_toBase64 = function (this: any, options: any = undefined) {
  __Porffor_uint8array_validate(this);
  const url: boolean = __Porffor_base64_alphabet(options);
  let omitPadding: boolean = false;
  if (Porffor.type(options) != Porffor.TYPES.undefined) omitPadding = !!options.omitPadding;

  const len: i32 = __Porffor_typedArray_validate(this);
  const taPtr: i32 = Porffor.IR.ptr(this);
  const bufferPtr: i32 = Porffor.IR.loadI32(taPtr, 4);

  const output: bytestring = Porffor.malloc(4 + Math.ceil(len / 3) * 4);
  const outPtr: i32 = Porffor.IR.ptr(output);

  let alphabetStr: bytestring;
  if (url) {
    alphabetStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  } else {
    alphabetStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  }
  const alphabetPtr: i32 = Porffor.IR.ptr(alphabetStr);

  let i: i32 = 0;
  let j: i32 = outPtr;

  const fullChunks: i32 = Math.floor(len / 3) * 3;
  while (i < fullChunks) {
    const b1: i32 = Porffor.IR.loadU8(bufferPtr + i++, 4);
    const b2: i32 = Porffor.IR.loadU8(bufferPtr + i++, 4);
    const b3: i32 = Porffor.IR.loadU8(bufferPtr + i++, 4);

    const enc1: i32 = b1 >> 2;
    const enc2: i32 = ((b1 & 3) << 4) | (b2 >> 4);
    const enc3: i32 = ((b2 & 15) << 2) | (b3 >> 6);
    const enc4: i32 = b3 & 63;

    Porffor.IR.storeU8(j++, 4, Porffor.IR.loadU8(alphabetPtr + enc1, 4));
    Porffor.IR.storeU8(j++, 4, Porffor.IR.loadU8(alphabetPtr + enc2, 4));
    Porffor.IR.storeU8(j++, 4, Porffor.IR.loadU8(alphabetPtr + enc3, 4));
    Porffor.IR.storeU8(j++, 4, Porffor.IR.loadU8(alphabetPtr + enc4, 4));
  }

  const remaining: i32 = len - i;
  if (remaining == 1) {
    const b1: i32 = Porffor.IR.loadU8(bufferPtr + i, 4);
    const enc1: i32 = b1 >> 2;
    const enc2: i32 = (b1 & 3) << 4;

    Porffor.IR.storeU8(j++, 4, Porffor.IR.loadU8(alphabetPtr + enc1, 4));
    Porffor.IR.storeU8(j++, 4, Porffor.IR.loadU8(alphabetPtr + enc2, 4));
    if (!omitPadding) {
    Porffor.IR.storeU8(j++, 4, 61); // '='
    Porffor.IR.storeU8(j++, 4, 61); // '='
    }
  } else if (remaining == 2) {
    const b1: i32 = Porffor.IR.loadU8(bufferPtr + i, 4);
    const b2: i32 = Porffor.IR.loadU8(bufferPtr + i + 1, 4);
    const enc1: i32 = b1 >> 2;
    const enc2: i32 = ((b1 & 3) << 4) | (b2 >> 4);
    const enc3: i32 = (b2 & 15) << 2;

    Porffor.IR.storeU8(j++, 4, Porffor.IR.loadU8(alphabetPtr + enc1, 4));
    Porffor.IR.storeU8(j++, 4, Porffor.IR.loadU8(alphabetPtr + enc2, 4));
    Porffor.IR.storeU8(j++, 4, Porffor.IR.loadU8(alphabetPtr + enc3, 4));
    if (!omitPadding) {
    Porffor.IR.storeU8(j++, 4, 61); // '='
    }
  }

  output.length = j - Porffor.IR.ptr(output);
  return output;
};

export const __Uint8Array_prototype_toHex = function (this: any) {
  __Porffor_uint8array_validate(this);
  const len: i32 = __Porffor_typedArray_validate(this);
  const taPtr: i32 = Porffor.IR.ptr(this);
  const bufferPtr: i32 = Porffor.IR.loadI32(taPtr, 4);

  const output: bytestring = Porffor.malloc(4 + len * 2);
  const outPtr: i32 = Porffor.IR.ptr(output);

  const hexChars: bytestring = '0123456789abcdef';
  const hexPtr: i32 = Porffor.IR.ptr(hexChars);

  let i: i32 = 0;
  let j: i32 = outPtr;
  while (i < len) {
    const byte: i32 = Porffor.IR.loadU8(bufferPtr + i++, 4);
    Porffor.IR.storeU8(j++, 4, Porffor.IR.loadU8(hexPtr + (byte >> 4), 4));
    Porffor.IR.storeU8(j++, 4, Porffor.IR.loadU8(hexPtr + (byte & 15), 4));
  }

  output.length = j - Porffor.IR.ptr(output);
  return output;
};

export const __Porffor_base64_value = (c: i32, url: boolean): i32 => {
  if (Porffor.fastAnd(c >= 65, c <= 90)) return c - 65; // A-Z
  if (Porffor.fastAnd(c >= 97, c <= 122)) return c - 71; // a-z
  if (Porffor.fastAnd(c >= 48, c <= 57)) return c + 4; // 0-9
  if (url) {
    if (c == 45) return 62; // -
    if (c == 95) return 63; // _
  } else {
    if (c == 43) return 62; // +
    if (c == 47) return 63; // /
  }
  return 64;
};

export const __Porffor_base64_skipWhitespace = (ptr: i32, wide: boolean, i: i32, length: i32): i32 => {
  while (i < length) {
    const c: i32 = wide ? Porffor.IR.loadU16(ptr + i * 2, 4) : Porffor.IR.loadU8(ptr + i, 4);
    if (Porffor.fastAnd(c != 9, c != 10, c != 12, c != 13, c != 32)) break;
    i++;
  }
  return i;
};

// decode a final 2 or 3 char chunk -> bytes written
export const __Porffor_base64_partialChunk = (chunk: i32, chunkLength: i32, strict: boolean, dest: i32): i32 => {
  if (chunkLength == 2) {
    if (Porffor.fastAnd(strict, (chunk & 15) != 0)) throw new SyntaxError('Invalid base64 padding');
    Porffor.IR.storeU8(dest, 4, chunk >> 4);
    return 1;
  }

  if (Porffor.fastAnd(strict, (chunk & 3) != 0)) throw new SyntaxError('Invalid base64 padding');
  Porffor.IR.storeU8(dest, 4, chunk >> 10);
  Porffor.IR.storeU8(dest + 1, 4, (chunk >> 2) & 255);
  return 2;
};

// FromBase64, writing decoded chunks to dest as it goes -> { read, written }
export const __Porffor_fromBase64 = (str: any, url: boolean, lastChunkHandling: i32, dest: i32, maxLength: i32): object => {
  const ptr: i32 = Porffor.IR.ptr(str);
  const wide: boolean = Porffor.type(str) == Porffor.TYPES.string;
  const length: i32 = str.length;

  let read: i32 = 0;
  let written: i32 = 0;
  let chunk: i32 = 0;
  let chunkLength: i32 = 0;
  let i: i32 = 0;
  while (written < maxLength) {
    i = __Porffor_base64_skipWhitespace(ptr, wide, i, length);
    if (i == length) {
      if (chunkLength > 0) {
        if (lastChunkHandling == 2) break;
        if (Porffor.fastOr(lastChunkHandling == 1, chunkLength == 1)) throw new SyntaxError('Invalid base64 string');
        written += __Porffor_base64_partialChunk(chunk, chunkLength, false, dest + written);
      }
      read = length;
      break;
    }

    const c: i32 = wide ? Porffor.IR.loadU16(ptr + i * 2, 4) : Porffor.IR.loadU8(ptr + i, 4);
    i++;
    if (c == 61) { // =
      if (chunkLength < 2) throw new SyntaxError('Invalid base64 padding');
      i = __Porffor_base64_skipWhitespace(ptr, wide, i, length);
      if (chunkLength == 2) {
        if (i == length) {
          if (lastChunkHandling == 2) break;
          throw new SyntaxError('Invalid base64 padding');
        }
        const next: i32 = wide ? Porffor.IR.loadU16(ptr + i * 2, 4) : Porffor.IR.loadU8(ptr + i, 4);
        if (next == 61) i = __Porffor_base64_skipWhitespace(ptr, wide, i + 1, length);
      }
      if (i < length) throw new SyntaxError('Invalid base64 padding');

      written += __Porffor_base64_partialChunk(chunk, chunkLength, lastChunkHandling == 1, dest + written);
      read = length;
      break;
    }

    const value: i32 = __Porffor_base64_value(c, url);
    if (value == 64) throw new SyntaxError('Invalid base64 character');

    // stop before a partial chunk that would not fit
    const remaining: i32 = maxLength - written;
    if (Porffor.fastOr(Porffor.fastAnd(remaining == 1, chunkLength == 2), Porffor.fastAnd(remaining == 2, chunkLength == 3))) break;

    chunk = (chunk << 6) | value;
    chunkLength++;
    if (chunkLength == 4) {
      Porffor.IR.storeU8(dest + written, 4, chunk >> 16);
      Porffor.IR.storeU8(dest + written + 1, 4, (chunk >> 8) & 255);
      Porffor.IR.storeU8(dest + written + 2, 4, chunk & 255);
      written += 3;
      chunk = 0;
      chunkLength = 0;
      read = i;
    }
  }

  const result: object = {};
  result.read = read;
  result.written = written;
  return result;
};

export const __Uint8Array_fromBase64 = (str: any, options: any = undefined) => {
  if ((Porffor.type(str) | 0b10000000) != Porffor.TYPES.bytestring) {
    throw new TypeError('First argument must be a string');
  }

  const url: boolean = __Porffor_base64_alphabet(options);
  const lastChunkHandling: i32 = __Porffor_base64_lastChunkHandling(options);

  // never more bytes than chars
  const bytes: i32 = Porffor.malloc(4 + str.length);
  const written: i32 = __Porffor_fromBase64(str, url, lastChunkHandling, bytes, str.length).written;

  const ta: Uint8Array = new Uint8Array(written);
  Porffor.IR.copy(Porffor.IR.loadI32(Porffor.IR.ptr(ta), 4) + 4, bytes + 4, written);
  return ta;
};

export const __Uint8Array_prototype_setFromBase64 = function (this: any, str: any, options: any = undefined) {
  __Porffor_uint8array_validate(this);
  if (__Porffor_typedArray_immutable(this)) throw new TypeError('Cannot write to an immutable ArrayBuffer');
  if ((Porffor.type(str) | 0b10000000) != Porffor.TYPES.bytestring) {
    throw new TypeError('First argument must be a string');
  }

  const url: boolean = __Porffor_base64_alphabet(options);
  const lastChunkHandling: i32 = __Porffor_base64_lastChunkHandling(options);

  const byteLength: i32 = __Porffor_typedArray_validate(this);
  return __Porffor_fromBase64(str, url, lastChunkHandling, Porffor.IR.loadI32(this, 4), byteLength);
};

export const __Porffor_hexValue = (c: i32): i32 => {
  if (Porffor.fastAnd(c >= 48, c <= 57)) return c - 48; // 0-9
  if (Porffor.fastAnd(c >= 97, c <= 102)) return c - 87; // a-f
  if (Porffor.fastAnd(c >= 65, c <= 70)) return c - 55; // A-F
  return 16;
};

// FromHex, writing bytes to dest as it goes -> { read, written }
export const __Porffor_fromHex = (str: any, dest: i32, maxLength: i32): object => {
  const ptr: i32 = Porffor.IR.ptr(str);
  const wide: boolean = Porffor.type(str) == Porffor.TYPES.string;
  const length: i32 = str.length;

  if ((length & 1) != 0) {
    throw new SyntaxError('Hex string must have even length');
  }

  let read: i32 = 0;
  let written: i32 = 0;
  while (Porffor.fastAnd(read < length, written < maxLength)) {
    const hi: i32 = __Porffor_hexValue(wide ? Porffor.IR.loadU16(ptr + read * 2, 4) : Porffor.IR.loadU8(ptr + read, 4));
    const lo: i32 = __Porffor_hexValue(wide ? Porffor.IR.loadU16(ptr + read * 2 + 2, 4) : Porffor.IR.loadU8(ptr + read + 1, 4));
    if (Porffor.fastOr(hi == 16, lo == 16)) throw new SyntaxError('Invalid hex character');

    Porffor.IR.storeU8(dest + written, 4, (hi << 4) | lo);
    written++;
    read += 2;
  }

  const result: object = {};
  result.read = read;
  result.written = written;
  return result;
};

export const __Uint8Array_fromHex = (str: any) => {
  if ((Porffor.type(str) | 0b10000000) != Porffor.TYPES.bytestring) {
    throw new TypeError('First argument must be a string');
  }

  const ta: Uint8Array = new Uint8Array(str.length >> 1);
  __Porffor_fromHex(str, Porffor.IR.loadI32(Porffor.IR.ptr(ta), 4), str.length >> 1);
  return ta;
};

export const __Uint8Array_prototype_setFromHex = function (this: any, str: any) {
  __Porffor_uint8array_validate(this);
  if (__Porffor_typedArray_immutable(this)) throw new TypeError('Cannot write to an immutable ArrayBuffer');
  if ((Porffor.type(str) | 0b10000000) != Porffor.TYPES.bytestring) {
    throw new TypeError('First argument must be a string');
  }

  const byteLength: i32 = __Porffor_typedArray_validate(this);
  return __Porffor_fromHex(str, Porffor.IR.loadI32(this, 4), byteLength);
};
