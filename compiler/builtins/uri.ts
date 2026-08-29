import type {} from './porffor.d.ts';

export const __Porffor_uriHexDigit = (c: i32): i32 => {
  if (c >= 48 && c <= 57) return c - 48;  // 0-9
  if (c >= 65 && c <= 70) return c - 55;  // A-F
  if (c >= 97 && c <= 102) return c - 87; // a-f
  return -1;
};

// shared encoder. m1/m2/m3 are bitsets of ascii chars 32-127 left unencoded
// (bit (c & 31) of m[(c - 32) >> 5]); chars 0-31 are always encoded.
// legacy (escape): %XX for chars < 256, %uXXXX above, no utf-8.
export const __Porffor_uriEncode = (input: any, m1: i32, m2: i32, m3: i32, legacy: boolean): bytestring => {
  input = __ecma262_ToString(input);
  const len: i32 = input.length;
  const wide: boolean = Porffor.type(input) == Porffor.TYPES.string;
  const ptr: i32 = Porffor.IR.ptr(input);

  const hex: bytestring = '0123456789ABCDEF';
  const hexPtr: i32 = Porffor.IR.ptr(hex);

  // scan the prefix needing no encoding; commonly all of it
  let start: i32 = 0;
  if (wide) {
    while (start < len) {
      const chr: i32 = Porffor.IR.loadU16(ptr + start * 2, 4);
      if (chr < 32 || chr > 127) break;

      let m: i32 = m1;
      const bucket: i32 = (chr - 32) >> 5;
      if (bucket == 1) m = m2;
        else if (bucket == 2) m = m3;
      if (((m >>> (chr & 31)) & 1) == 0) break;

      start++;
    }
  } else {
    Porffor.c`
    const u8* s = MEM + ptr + 4;
    const u32 masks[4] = { 0, (u32)m1, (u32)m2, (u32)m3 };
    i32 k = 0;
    while (k < len && s[k] < 128 && ((masks[s[k] >> 5] >> (s[k] & 31)) & 1)) k++;
    start = k;
    `;
  }
  if (start == len && !wide) return input;

  let worst: i32 = 3;
  if (wide) worst = legacy ? 6 : 9;
  const out: bytestring = Porffor.malloc(6 + start + (len - start) * worst);
  const outPtr: i32 = Porffor.IR.ptr(out);

  if (wide) {
    for (let k: i32 = 0; k < start; k++) Porffor.IR.storeU8(outPtr + k, 4, Porffor.IR.loadU16(ptr + k * 2, 4));
  } else {
    Porffor.IR.copy(outPtr + 4, ptr + 4, start);
  }

  let o: i32 = outPtr + start;
  for (let i: i32 = start; i < len; i++) {
    const chr: i32 = wide ? Porffor.IR.loadU16(ptr + i * 2, 4) : Porffor.IR.loadU8(ptr + i, 4);

    if (chr >= 32 && chr < 128) {
      let m: i32 = m1;
      const bucket: i32 = (chr - 32) >> 5;
      if (bucket == 1) m = m2;
        else if (bucket == 2) m = m3;

      if ((m >>> (chr & 31)) & 1) {
        Porffor.IR.storeU8(o++, 4, chr);
        continue;
      }
    }

    if (legacy) {
      if (chr < 256) {
        Porffor.IR.storeU8(o, 4, 37); // %
        Porffor.IR.storeU8(o + 1, 4, Porffor.IR.loadU8(hexPtr + (chr >> 4), 4));
        Porffor.IR.storeU8(o + 2, 4, Porffor.IR.loadU8(hexPtr + (chr & 15), 4));
        o += 3;
      } else {
        Porffor.IR.storeU8(o, 4, 37); // %
        Porffor.IR.storeU8(o + 1, 4, 117); // u
        Porffor.IR.storeU8(o + 2, 4, Porffor.IR.loadU8(hexPtr + ((chr >> 12) & 15), 4));
        Porffor.IR.storeU8(o + 3, 4, Porffor.IR.loadU8(hexPtr + ((chr >> 8) & 15), 4));
        Porffor.IR.storeU8(o + 4, 4, Porffor.IR.loadU8(hexPtr + ((chr >> 4) & 15), 4));
        Porffor.IR.storeU8(o + 5, 4, Porffor.IR.loadU8(hexPtr + (chr & 15), 4));
        o += 6;
      }
      continue;
    }

    let cp: i32 = chr;
    if (cp >= 0xD800 && cp <= 0xDFFF) {
      // only a high surrogate followed by a low surrogate is encodable
      if (cp >= 0xDC00 || i + 1 == len) throw new URIError('URI malformed');
      const low: i32 = Porffor.IR.loadU16(ptr + (i + 1) * 2, 4);
      if (low < 0xDC00 || low > 0xDFFF) throw new URIError('URI malformed');
      cp = 0x10000 + ((cp - 0xD800) << 10) + (low - 0xDC00);
      i++;
    }

    // utf-8 lead byte, then continuation bytes, each as %XX
    let cont: i32 = 0;
    let lead: i32 = cp;
    if (cp >= 0x80) {
      if (cp < 0x800) {
        cont = 1;
        lead = 0xC0 | (cp >> 6);
      } else if (cp < 0x10000) {
        cont = 2;
        lead = 0xE0 | (cp >> 12);
      } else {
        cont = 3;
        lead = 0xF0 | (cp >> 18);
      }
    }

    Porffor.IR.storeU8(o, 4, 37); // %
    Porffor.IR.storeU8(o + 1, 4, Porffor.IR.loadU8(hexPtr + (lead >> 4), 4));
    Porffor.IR.storeU8(o + 2, 4, Porffor.IR.loadU8(hexPtr + (lead & 15), 4));
    o += 3;

    for (let e: i32 = cont; e > 0; e--) {
      const byte: i32 = 0x80 | ((cp >> ((e - 1) * 6)) & 63);
      Porffor.IR.storeU8(o, 4, 37); // %
      Porffor.IR.storeU8(o + 1, 4, Porffor.IR.loadU8(hexPtr + (byte >> 4), 4));
      Porffor.IR.storeU8(o + 2, 4, Porffor.IR.loadU8(hexPtr + (byte & 15), 4));
      o += 3;
    }
  }

  out.length = o - outPtr;
  return out;
};

// unencoded: A-Z a-z 0-9 @ * + - . / _
export const escape = (input: any): bytestring =>
  __Porffor_uriEncode(input, 67103744, -2013265921, 134217726, true);

// unencoded: A-Z a-z 0-9 ! # $ & ' ( ) * + , - . / : ; = ? @ _ ~
export const encodeURI = (input: any): bytestring =>
  __Porffor_uriEncode(input, -1342177318, -2013265921, 1207959550, false);

// unencoded: A-Z a-z 0-9 ! ' ( ) * - . _ ~
export const encodeURIComponent = (input: any): bytestring =>
  __Porffor_uriEncode(input, 67069826, -2013265922, 1207959550, false);

// shared decoder. decodeURI (component false) keeps its reserved set
// (# $ & + , / : ; = ? @, a bitset of chars 35-64 here) %XX-escaped.
export const __Porffor_uriDecode = (input: any, component: boolean): bytestring|string => {
  input = __ecma262_ToString(input);
  const len: i32 = input.length;
  const wide: boolean = Porffor.type(input) == Porffor.TYPES.string;
  const ptr: i32 = Porffor.IR.ptr(input);

  // nothing to decode without %
  let start: i32 = 0;
  if (wide) {
    while (start < len && Porffor.IR.loadU16(ptr + start * 2, 4) != 37) start++;
  } else {
    Porffor.c`
    const void* found = memchr(MEM + ptr + 4, '%', (u32)len);
    start = found ? (i32)((const u8*)found - (MEM + ptr + 4)) : len;
    `;
  }
  if (start == len) return input;

  const out: string = Porffor.malloc(6 + len * 2);
  const outPtr: i32 = Porffor.IR.ptr(out);

  let maxChr: i32 = 0;
  let j: i32 = 0;
  for (; j < start; j++) {
    const chr: i32 = wide ? Porffor.IR.loadU16(ptr + j * 2, 4) : Porffor.IR.loadU8(ptr + j, 4);
    Porffor.IR.storeU16(outPtr + j * 2, 4, chr);
    if (chr > maxChr) maxChr = chr;
  }

  let i: i32 = start;
  while (i < len) {
    const chr: i32 = wide ? Porffor.IR.loadU16(ptr + i * 2, 4) : Porffor.IR.loadU8(ptr + i, 4);
    i++;

    if (chr != 37) { // %
      Porffor.IR.storeU16(outPtr + j * 2, 4, chr);
      if (chr > maxChr) maxChr = chr;
      j++;
      continue;
    }

    if (i + 2 > len) throw new URIError('URI malformed');
    const h1: i32 = wide ? Porffor.IR.loadU16(ptr + i * 2, 4) : Porffor.IR.loadU8(ptr + i, 4);
    const h2: i32 = wide ? Porffor.IR.loadU16(ptr + (i + 1) * 2, 4) : Porffor.IR.loadU8(ptr + i + 1, 4);
    const n1: i32 = __Porffor_uriHexDigit(h1);
    const n2: i32 = __Porffor_uriHexDigit(h2);
    if (n1 < 0 || n2 < 0) throw new URIError('URI malformed');
    i += 2;

    const byte1: i32 = (n1 << 4) | n2;
    if (byte1 < 0x80) {
      // decodeURI leaves its reserved set escaped, with original hex chars
      if (!component && byte1 >= 35 && byte1 <= 64 && ((897585931 >>> (byte1 - 35)) & 1)) {
        Porffor.IR.storeU16(outPtr + j * 2, 4, 37);
        Porffor.IR.storeU16(outPtr + (j + 1) * 2, 4, h1);
        Porffor.IR.storeU16(outPtr + (j + 2) * 2, 4, h2);
        if (h1 > maxChr) maxChr = h1;
        j += 3;
      } else {
        Porffor.IR.storeU16(outPtr + j * 2, 4, byte1);
        if (byte1 > maxChr) maxChr = byte1;
        j++;
      }
      continue;
    }

    let extra: i32 = 0, cp: i32 = 0, min: i32 = 0;
    if ((byte1 & 0xE0) == 0xC0) {
      extra = 1; cp = byte1 & 0x1F; min = 0x80;
    } else if ((byte1 & 0xF0) == 0xE0) {
      extra = 2; cp = byte1 & 0x0F; min = 0x800;
    } else if ((byte1 & 0xF8) == 0xF0) {
      extra = 3; cp = byte1 & 0x07; min = 0x10000;
    } else throw new URIError('URI malformed');

    for (let e: i32 = 0; e < extra; e++) {
      if (i + 3 > len) throw new URIError('URI malformed');
      const pc: i32 = wide ? Porffor.IR.loadU16(ptr + i * 2, 4) : Porffor.IR.loadU8(ptr + i, 4);
      if (pc != 37) throw new URIError('URI malformed');
      const c1: i32 = __Porffor_uriHexDigit(wide ? Porffor.IR.loadU16(ptr + (i + 1) * 2, 4) : Porffor.IR.loadU8(ptr + i + 1, 4));
      const c2: i32 = __Porffor_uriHexDigit(wide ? Porffor.IR.loadU16(ptr + (i + 2) * 2, 4) : Porffor.IR.loadU8(ptr + i + 2, 4));
      if (c1 < 0 || c2 < 0) throw new URIError('URI malformed');
      const cont: i32 = (c1 << 4) | c2;
      if ((cont & 0xC0) != 0x80) throw new URIError('URI malformed');
      cp = (cp << 6) | (cont & 0x3F);
      i += 3;
    }

    if (cp < min || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) throw new URIError('URI malformed');

    if (cp > 0xFFFF) {
      cp -= 0x10000;
      Porffor.IR.storeU16(outPtr + j * 2, 4, 0xD800 + (cp >> 10));
      Porffor.IR.storeU16(outPtr + (j + 1) * 2, 4, 0xDC00 + (cp & 0x3FF));
      j += 2;
      maxChr = 0xFFFF;
    } else {
      Porffor.IR.storeU16(outPtr + j * 2, 4, cp);
      if (cp > maxChr) maxChr = cp;
      j++;
    }
  }

  out.length = j;
  if (maxChr < 256) {
    const narrow: bytestring = Porffor.IR.ptr(out);
    for (let k: i32 = 0; k < j; k++) Porffor.IR.storeU8(outPtr + k, 4, Porffor.IR.loadU8(outPtr + k * 2, 4));
    return narrow;
  }
  return out;
};

export const decodeURI = (input: any): bytestring|string =>
  __Porffor_uriDecode(input, false);

export const decodeURIComponent = (input: any): bytestring|string =>
  __Porffor_uriDecode(input, true);

export const unescape = (input: any): bytestring|string => {
  input = __ecma262_ToString(input);
  const len: i32 = input.length;
  const wide: boolean = Porffor.type(input) == Porffor.TYPES.string;
  const ptr: i32 = Porffor.IR.ptr(input);

  let start: i32 = 0;
  if (wide) {
    while (start < len && Porffor.IR.loadU16(ptr + start * 2, 4) != 37) start++;
  } else {
    Porffor.c`
    const void* found = memchr(MEM + ptr + 4, '%', (u32)len);
    start = found ? (i32)((const u8*)found - (MEM + ptr + 4)) : len;
    `;
  }
  if (start == len) return input;

  const out: string = Porffor.malloc(6 + len * 2);
  const outPtr: i32 = Porffor.IR.ptr(out);

  let maxChr: i32 = 0;
  let j: i32 = 0;
  for (; j < start; j++) {
    const chr: i32 = wide ? Porffor.IR.loadU16(ptr + j * 2, 4) : Porffor.IR.loadU8(ptr + j, 4);
    Porffor.IR.storeU16(outPtr + j * 2, 4, chr);
    if (chr > maxChr) maxChr = chr;
  }

  let i: i32 = start;
  while (i < len) {
    let chr: i32 = wide ? Porffor.IR.loadU16(ptr + i * 2, 4) : Porffor.IR.loadU8(ptr + i, 4);
    i++;

    if (chr == 37) { // %
      // %uXXXX, else %XX, else literal %
      if (i + 5 <= len && (wide ? Porffor.IR.loadU16(ptr + i * 2, 4) : Porffor.IR.loadU8(ptr + i, 4)) == 117) { // u
        const n1: i32 = __Porffor_uriHexDigit(wide ? Porffor.IR.loadU16(ptr + (i + 1) * 2, 4) : Porffor.IR.loadU8(ptr + i + 1, 4));
        const n2: i32 = __Porffor_uriHexDigit(wide ? Porffor.IR.loadU16(ptr + (i + 2) * 2, 4) : Porffor.IR.loadU8(ptr + i + 2, 4));
        const n3: i32 = __Porffor_uriHexDigit(wide ? Porffor.IR.loadU16(ptr + (i + 3) * 2, 4) : Porffor.IR.loadU8(ptr + i + 3, 4));
        const n4: i32 = __Porffor_uriHexDigit(wide ? Porffor.IR.loadU16(ptr + (i + 4) * 2, 4) : Porffor.IR.loadU8(ptr + i + 4, 4));
        if (n1 >= 0 && n2 >= 0 && n3 >= 0 && n4 >= 0) {
          chr = (n1 << 12) | (n2 << 8) | (n3 << 4) | n4;
          i += 5;
        }
      } else if (i + 2 <= len) {
        const n1: i32 = __Porffor_uriHexDigit(wide ? Porffor.IR.loadU16(ptr + i * 2, 4) : Porffor.IR.loadU8(ptr + i, 4));
        const n2: i32 = __Porffor_uriHexDigit(wide ? Porffor.IR.loadU16(ptr + (i + 1) * 2, 4) : Porffor.IR.loadU8(ptr + i + 1, 4));
        if (n1 >= 0 && n2 >= 0) {
          chr = (n1 << 4) | n2;
          i += 2;
        }
      }
    }

    Porffor.IR.storeU16(outPtr + j * 2, 4, chr);
    if (chr > maxChr) maxChr = chr;
    j++;
  }

  out.length = j;
  if (maxChr < 256) {
    const narrow: bytestring = Porffor.IR.ptr(out);
    for (let k: i32 = 0; k < j; k++) Porffor.IR.storeU8(outPtr + k, 4, Porffor.IR.loadU8(outPtr + k * 2, 4));
    return narrow;
  }
  return out;
};
