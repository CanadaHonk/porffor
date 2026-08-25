import type {} from './porffor.d.ts';

export const __Porffor_strcmp = (a: any, b: any): boolean => {
  // a and b must be string or bytestring
  // fast path: check if pointers are equal
  if (Porffor.IR.ptr(a) == Porffor.IR.ptr(b)) return true;

  const al: i32 = Porffor.IR.loadI32(a, 0);
  const bl: i32 = Porffor.IR.loadI32(b, 0);

  // fast path: check if lengths are inequal
  if (al != bl) return false;

  const aBytes: boolean = Porffor.type(a) == Porffor.TYPES.bytestring;
  const bBytes: boolean = Porffor.type(b) == Porffor.TYPES.bytestring;
  for (let i: i32 = 0; i < al; i++) {
    const ac: i32 = aBytes ? Porffor.IR.loadU8(Porffor.IR.ptr(a) + i, 4) : Porffor.IR.loadU16(Porffor.IR.ptr(a) + i * 2, 4);
    const bc: i32 = bBytes ? Porffor.IR.loadU8(Porffor.IR.ptr(b) + i, 4) : Porffor.IR.loadU16(Porffor.IR.ptr(b) + i * 2, 4);
    if (ac != bc) return false;
  }

  return true;
};

export const __Porffor_strcat = (a: any, b: any): any => {
  // a and b must be string or bytestring

  const al: i32 = Porffor.IR.loadI32(a, 0);
  const bl: i32 = Porffor.IR.loadI32(b, 0);
  const aPtr: i32 = Porffor.IR.ptr(a);
  const bPtr: i32 = Porffor.IR.ptr(b);

  if (Porffor.type(a) == Porffor.TYPES.bytestring) {
    if (Porffor.type(b) == Porffor.TYPES.bytestring) {
      // bytestring, bytestring
      const out: bytestring = Porffor.malloc(6 + al + bl);

      Porffor.IR.storeI32(out, 0, al + bl);

      // copy left (fast memcpy)
      Porffor.IR.copy(Porffor.IR.ptr(out) + 4, aPtr + 4, al);

      // copy right (fast memcpy)
      Porffor.IR.copy(Porffor.IR.ptr(out) + 4 + al, bPtr + 4, bl);

      return out;
    } else {
      // bytestring, string
      const out: string = Porffor.malloc(6 + (al + bl) * 2);

      Porffor.IR.storeI32(out, 0, al + bl);

      // copy left (slow bytestring -> string)
      for (let i: i32 = 0; i < al; i++) {
        Porffor.IR.storeU16(Porffor.IR.ptr(out) + i*2, 4, Porffor.IR.loadU8(aPtr + i, 4));
      }

      // copy right (fast memcpy)
      Porffor.IR.copy(Porffor.IR.ptr(out) + 4 + al*2, bPtr + 4, bl * 2);

      return out;
    }
  } else {
    if (Porffor.type(b) == Porffor.TYPES.bytestring) {
      // string, bytestring
      const out: string = Porffor.malloc(6 + (al + bl) * 2);

      Porffor.IR.storeI32(out, 0, al + bl);

      // copy left (fast memcpy)
      Porffor.IR.copy(Porffor.IR.ptr(out) + 4, aPtr + 4, al * 2);

      // copy right (slow bytestring -> string)
      let ptr: i32 = Porffor.IR.ptr(out) + al*2;
      for (let i: i32 = 0; i < bl; i++) {
        Porffor.IR.storeU16(ptr + i*2, 4, Porffor.IR.loadU8(bPtr + i, 4));
      }

      return out;
    } else {
      // string, string
      const out: string = Porffor.malloc(6 + (al + bl) * 2);

      Porffor.IR.storeI32(out, 0, al + bl);

      // copy left (fast memcpy)
      Porffor.IR.copy(Porffor.IR.ptr(out) + 4, aPtr + 4, al * 2);

      // copy right (fast memcpy)
      Porffor.IR.copy(Porffor.IR.ptr(out) + 4 + al*2, bPtr + 4, bl * 2);

      return out;
    }
  }
};


export const __String_prototype_at = function (this: string, index: number) {
  const len: i32 = this.length;

  if (index < 0) index = len + index;
  if (Porffor.fastOr(index < 0, index >= len)) return undefined;

  const out: string = Porffor.malloc(8);
  Porffor.IR.storeI32(out, 0, 1); // out.length = 1

  Porffor.IR.storeU16(Porffor.IR.ptr(out), 4, Porffor.IR.loadU16(Porffor.IR.ptr(this) + index * 2, 4));
  return out;
};

export const __ByteString_prototype_at = function (this: bytestring, index: number) {
  const len: i32 = this.length;

  if (index < 0) index = len + index;
  if (Porffor.fastOr(index < 0, index >= len)) return undefined;

  const out: bytestring = Porffor.malloc(8);
  Porffor.IR.storeI32(out, 0, 1); // out.length = 1

  Porffor.IR.storeU8(Porffor.IR.ptr(out), 4, Porffor.IR.loadU8(Porffor.IR.ptr(this) + index, 4));
  return out;
};

export const __String_prototype_charAt = function (this: string, index: number) {
  const len: i32 = this.length;

  if (Porffor.fastOr(index < 0, index >= len)) return '';

  const out: string = Porffor.malloc(8);
  Porffor.IR.storeI32(out, 0, 1); // out.length = 1

  Porffor.IR.storeU16(Porffor.IR.ptr(out), 4, Porffor.IR.loadU16(Porffor.IR.ptr(this) + index * 2, 4));
  return out;
};

export const __ByteString_prototype_charAt = function (this: bytestring, index: number) {
  const len: i32 = this.length;

  if (Porffor.fastOr(index < 0, index >= len)) return '';

  const out: bytestring = Porffor.malloc(8);
  Porffor.IR.storeI32(out, 0, 1); // out.length = 1

  Porffor.IR.storeU8(Porffor.IR.ptr(out), 4, Porffor.IR.loadU8(Porffor.IR.ptr(this) + index, 4));
  return out;
};

export const __String_prototype_toUpperCase = function (this: string) {
  // todo: unicode not just ascii
  const len: i32 = this.length;

  const out: string = Porffor.malloc(6 + len * 2);
  Porffor.IR.storeI32(out, 0, len);

  let i: i32 = Porffor.IR.ptr(this),
      j: i32 = Porffor.IR.ptr(out);

  const endPtr: i32 = i + len * 2;
  while (i < endPtr) {
    let chr: i32 = Porffor.IR.loadU16(i, 4);
    i += 2;

    if (chr >= 97) if (chr <= 122) chr -= 32;

    Porffor.IR.storeU16(j, 4, chr);
    j += 2;
  }

  return out;
};

export const __ByteString_prototype_toUpperCase = function (this: bytestring) {
  const len: i32 = this.length;

  const out: bytestring = Porffor.malloc(6 + len);
  Porffor.IR.storeI32(out, 0, len);

  let i: i32 = Porffor.IR.ptr(this),
      j: i32 = Porffor.IR.ptr(out);

  const endPtr: i32 = i + len;
  while (i < endPtr) {
    let chr: i32 = Porffor.IR.loadU8(i++, 4);

    if (chr >= 97) if (chr <= 122) chr -= 32;

    Porffor.IR.storeU8(j++, 4, chr);
  }

  return out;
};

export const __String_prototype_toLowerCase = function (this: string) {
  // todo: unicode not just ascii
  const len: i32 = this.length;

  const out: string = Porffor.malloc(6 + len * 2);
  Porffor.IR.storeI32(out, 0, len);

  let i: i32 = Porffor.IR.ptr(this),
      j: i32 = Porffor.IR.ptr(out);

  const endPtr: i32 = i + len * 2;
  while (i < endPtr) {
    let chr: i32 = Porffor.IR.loadU16(i, 4);
    i += 2;

    if (chr >= 65) if (chr <= 90) chr += 32;

    Porffor.IR.storeU16(j, 4, chr);
    j += 2;
  }

  return out;
};

export const __ByteString_prototype_toLowerCase = function (this: bytestring) {
  const len: i32 = this.length;

  const out: bytestring = Porffor.malloc(6 + len);
  Porffor.IR.storeI32(out, 0, len);

  let i: i32 = Porffor.IR.ptr(this),
      j: i32 = Porffor.IR.ptr(out);

  const endPtr: i32 = i + len;
  while (i < endPtr) {
    let chr: i32 = Porffor.IR.loadU8(i++, 4);

    if (chr >= 65) if (chr <= 90) chr += 32;

    Porffor.IR.storeU8(j++, 4, chr);
  }

  return out;
};

export const __String_prototype_toLocaleUpperCase = function (this: string) { return Porffor.callThis(__String_prototype_toUpperCase, this); };
export const __ByteString_prototype_toLocaleUpperCase = function (this: bytestring) { return Porffor.callThis(__ByteString_prototype_toUpperCase, this); };
export const __String_prototype_toLocaleLowerCase = function (this: string) { return Porffor.callThis(__String_prototype_toLowerCase, this); };
export const __ByteString_prototype_toLocaleLowerCase = function (this: bytestring) { return Porffor.callThis(__ByteString_prototype_toLowerCase, this); };

export const __String_prototype_codePointAt = function (this: string, index: number) {
  const len: i32 = this.length;

  if (Porffor.fastOr(index < 0, index >= len)) return undefined;

  index *= 2;
  const c1: i32 = Porffor.IR.loadU16(Porffor.IR.ptr(this) + index, 4);
  if (Porffor.fastAnd(c1 >= 0xD800, c1 <= 0xDBFF)) {
    // 1st char is leading surrogate, handle 2nd char
    // check oob
    if (index + 1 >= len) return c1;

    const c2: i32 = Porffor.IR.loadU16(Porffor.IR.ptr(this) + index + 2, 4);
    if (Porffor.fastAnd(c2 >= 0xDC00, c2 <= 0xDFFF)) {
      // 2nd char is trailing surrogate, return code point
      return (c1 << 10) + c2 - 56613888;
    }
  }

  return c1;
};

export const __ByteString_prototype_codePointAt = function (this: bytestring, index: number) {
  const len: i32 = this.length;

  if (Porffor.fastOr(index < 0, index >= len)) return undefined;

  // bytestrings cannot have surrogates, so just do charCodeAt
  return Porffor.IR.loadU8(Porffor.IR.ptr(this) + index, 4);
};

export const __String_prototype_startsWith = function (this: string, searchString: string, position: number = 0) {
  // todo: handle bytestring searchString
  // todo/perf: investigate whether for counter vs while ++s are faster

  let thisPtr: i32 = Porffor.IR.ptr(this);
  const searchPtr: i32 = Porffor.IR.ptr(searchString);

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = this.length;
  if (position > 0) {
    if (position > len) position = len;
  } else position = 0;

  if (searchString.length > len - position) return false;

  thisPtr += position * 2;

  const searchLen: i32 = searchString.length * 2;
  for (let i: i32 = 0; i < searchLen; i += 2) {
    let chr: i32 = Porffor.IR.loadU16(thisPtr + i, 4);
    let expected: i32 = Porffor.IR.loadU16(searchPtr + i, 4);

    if (chr != expected) return false;
  }

  return true;
};

export const __ByteString_prototype_startsWith = function (this: bytestring, searchString: bytestring, position: number = 0) {
  // if searching non-bytestring, bytestring will not start with it
  // todo: change this to just check if = string and ToString others
  if (Porffor.type(searchString) != Porffor.TYPES.bytestring) return false;

  // todo/perf: investigate whether for counter vs while ++s are faster

  let thisPtr: i32 = Porffor.IR.ptr(this);
  const searchPtr: i32 = Porffor.IR.ptr(searchString);

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = this.length;
  if (position > 0) {
    if (position > len) position = len;
  } else position = 0;

  if (searchString.length > len - position) return false;

  thisPtr += position;

  const searchLen: i32 = searchString.length;
  for (let i: i32 = 0; i < searchLen; i++) {
    let chr: i32 = Porffor.IR.loadU8(thisPtr + i, 4);
    let expected: i32 = Porffor.IR.loadU8(searchPtr + i, 4);

    if (chr != expected) return false;
  }

  return true;
};


export const __String_prototype_endsWith = function (this: string, searchString: string, endPosition: any = undefined) {
  // todo: handle bytestring searchString

  let i: i32 = Porffor.IR.ptr(this),
      j: i32 = Porffor.IR.ptr(searchString);

  const searchLen: i32 = searchString.length;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = this.length;

  if (Porffor.type(endPosition) == Porffor.TYPES.undefined) endPosition = len;

  if (endPosition > 0) {
    if (endPosition > len) endPosition = len;
  } else endPosition = 0;

  endPosition -= searchLen;

  if (endPosition < 0) return false;

  i += endPosition * 2;

  const endPtr: i32 = j + searchLen * 2;
  while (j < endPtr) {
    let chr: i32 = Porffor.IR.loadU16(i, 4);
    let expected: i32 = Porffor.IR.loadU16(j, 4);

    i += 2;
    j += 2;

    if (chr != expected) return false;
  }

  return true;
};

export const __ByteString_prototype_endsWith = function (this: bytestring, searchString: bytestring, endPosition: any = undefined) {
  // if searching non-bytestring, bytestring will not start with it
  // todo: change this to just check if = string and ToString others
  if (Porffor.type(searchString) != Porffor.TYPES.bytestring) return false;

  let i: i32 = Porffor.IR.ptr(this),
      j: i32 = Porffor.IR.ptr(searchString);

  const searchLen: i32 = searchString.length;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = this.length;

  if (Porffor.type(endPosition) == Porffor.TYPES.undefined) endPosition = len;

  if (endPosition > 0) {
    if (endPosition > len) endPosition = len;
  } else endPosition = 0;

  endPosition -= searchLen;

  if (endPosition < 0) return false;

  i += endPosition;

  const endPtr: i32 = j + searchLen;
  while (j < endPtr) {
    let chr: i32 = Porffor.IR.loadU8(i++, 4);
    let expected: i32 = Porffor.IR.loadU8(j++, 4);

    if (chr != expected) return false;
  }

  return true;
};


export const __String_prototype_indexOf = function (this: string, searchString: any, position: any = 0) {
  searchString = ecma262.ToString(searchString);
  if (Porffor.type(searchString) == Porffor.TYPES.bytestring) {
    searchString = Porffor.bytestringToString(searchString);
  }
  position = ecma262.ToIntegerOrInfinity(position);

  let thisPtr: i32 = Porffor.IR.ptr(this);
  const searchPtr: i32 = Porffor.IR.ptr(searchString);

  const searchLenX2: i32 = searchString.length * 2;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = this.length;
  if (position > 0) {
    if (position > len) position = len;
  } else position = 0;

  // longer search than rest: negative end would saturate (i32) and scan all memory
  if (searchString.length > len) return -1;

  const thisPtrEnd: i32 = thisPtr + (len * 2) - searchLenX2;

  thisPtr += position * 2;

  while (thisPtr <= thisPtrEnd) {
    let match: boolean = true;
    for (let i: i32 = 0; i < searchLenX2; i += 2) {
      let chr: i32 = Porffor.IR.loadU16(thisPtr + i, 4);
      let expected: i32 = Porffor.IR.loadU16(searchPtr + i, 4);

      if (chr != expected) {
        match = false;
        break;
      }
    }

    if (match) return (thisPtr - Porffor.IR.ptr(this)) / 2;

    thisPtr += 2;
  }

  return -1;
};

export const __ByteString_prototype_indexOf = function (this: bytestring, searchString: any, position: any = 0) {
  searchString = ecma262.ToString(searchString);
  if (Porffor.type(searchString) != Porffor.TYPES.bytestring) {
    return Porffor.callThis(__String_prototype_indexOf, Porffor.bytestringToString(this), searchString, position);
  }
  position = ecma262.ToIntegerOrInfinity(position);

  let thisPtr: i32 = Porffor.IR.ptr(this);
  const searchPtr: i32 = Porffor.IR.ptr(searchString);

  const searchLen: i32 = searchString.length;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = this.length;
  if (position > 0) {
    if (position > len) position = len;
  } else position = 0;

  // longer search than rest: negative end would saturate (i32) and scan all memory
  if (searchLen > len) return -1;

  const thisPtrEnd: i32 = thisPtr + len - searchLen;

  thisPtr += position;

  while (thisPtr <= thisPtrEnd) {
    let match: boolean = true;
    for (let i: i32 = 0; i < searchLen; i++) {
      let chr: i32 = Porffor.IR.loadU8(thisPtr + i, 4);
      let expected: i32 = Porffor.IR.loadU8(searchPtr + i, 4);

      if (chr != expected) {
        match = false;
        break;
      }
    }

    if (match) return thisPtr - Porffor.IR.ptr(this);

    thisPtr++;
  }

  return -1;
};


export const __String_prototype_lastIndexOf = function (this: string, searchString: any, position: any = undefined) {
  searchString = ecma262.ToString(searchString);
  if (Porffor.type(searchString) == Porffor.TYPES.bytestring) {
    searchString = Porffor.bytestringToString(searchString);
  }

  let thisPtr: i32 = Porffor.IR.ptr(this);
  const searchPtr: i32 = Porffor.IR.ptr(searchString);

  const searchLen: i32 = searchString.length;
  const searchLenX2: i32 = searchLen * 2;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = this.length;
  if (searchLen > len) return -1;

  if (Porffor.type(position) == Porffor.TYPES.undefined) position = len - searchLen;

  if (position > 0) {
    const max: i32 = len - searchLen;
    if (position > max) position = max;
  } else position = 0;

  const thisPtrStart: i32 = thisPtr;

  thisPtr += position * 2;

  while (thisPtr >= thisPtrStart) {
    let match: boolean = true;
    for (let i: i32 = 0; i < searchLenX2; i += 2) {
      let chr: i32 = Porffor.IR.loadU8(thisPtr + i, 4);
      let expected: i32 = Porffor.IR.loadU8(searchPtr + i, 4);

      if (chr != expected) {
        match = false;
        break;
      }
    }

    if (match) return (thisPtr - Porffor.IR.ptr(this)) / 2;

    thisPtr -= 2;
  }

  return -1;
};

export const __ByteString_prototype_lastIndexOf = function (this: bytestring, searchString: any, position: any = undefined) {
  searchString = ecma262.ToString(searchString);
  if (Porffor.type(searchString) != Porffor.TYPES.bytestring) {
    return Porffor.callThis(__String_prototype_lastIndexOf, Porffor.bytestringToString(this), searchString, position);
  }

  let thisPtr: i32 = Porffor.IR.ptr(this);
  const searchPtr: i32 = Porffor.IR.ptr(searchString);

  const searchLen: i32 = searchString.length;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = this.length;
  if (searchLen > len) return -1;

  if (Porffor.type(position) == Porffor.TYPES.undefined) position = len - searchLen;

  if (position > 0) {
    const max: i32 = len - searchLen;
    if (position > max) position = max;
  } else position = 0;

  const thisPtrStart: i32 = thisPtr;

  thisPtr += position;

  while (thisPtr >= thisPtrStart) {
    let match: boolean = true;
    for (let i: i32 = 0; i < searchLen; i++) {
      let chr: i32 = Porffor.IR.loadU8(thisPtr + i, 4);
      let expected: i32 = Porffor.IR.loadU8(searchPtr + i, 4);

      if (chr != expected) {
        match = false;
        break;
      }
    }

    if (match) return thisPtr - Porffor.IR.ptr(this);

    thisPtr--;
  }

  return -1;
};


export const __String_prototype_includes = function (this: string, searchString: any, position: number = 0) {
  searchString = ecma262.ToString(searchString);
  if (Porffor.type(searchString) == Porffor.TYPES.bytestring) {
    searchString = Porffor.bytestringToString(searchString);
  }

  let thisPtr: i32 = Porffor.IR.ptr(this);
  const searchPtr: i32 = Porffor.IR.ptr(searchString);

  const searchLenX2: i32 = searchString.length * 2;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = this.length;
  if (position > 0) {
    if (position > len) position = len;
  } else position = 0;

  // longer search than rest: negative end would saturate (i32) and scan all memory
  if (searchString.length > len) return false;

  const thisPtrEnd: i32 = thisPtr + (len * 2) - searchLenX2;

  thisPtr += position * 2;

  while (thisPtr <= thisPtrEnd) {
    let match: boolean = true;
    for (let i: i32 = 0; i < searchLenX2; i += 2) {
      let chr: i32 = Porffor.IR.loadU16(thisPtr + i, 4);
      let expected: i32 = Porffor.IR.loadU16(searchPtr + i, 4);

      if (chr != expected) {
        match = false;
        break;
      }
    }

    if (match) return true;

    thisPtr += 2;
  }

  return false;
};

export const __ByteString_prototype_includes = function (this: bytestring, searchString: any, position: number = 0) {
  searchString = ecma262.ToString(searchString);
  if (Porffor.type(searchString) != Porffor.TYPES.bytestring) {
    return Porffor.callThis(__String_prototype_includes, Porffor.bytestringToString(this), searchString, position);
  }

  let thisPtr: i32 = Porffor.IR.ptr(this);
  const searchPtr: i32 = Porffor.IR.ptr(searchString);

  const searchLen: i32 = searchString.length;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = this.length;
  if (position > 0) {
    if (position > len) position = len;
  } else position = 0;

  // longer search than rest: negative end would saturate (i32) and scan all memory
  if (searchLen > len) return false;

  const thisPtrEnd: i32 = thisPtr + len - searchLen;

  thisPtr += position;

  while (thisPtr <= thisPtrEnd) {
    let match: boolean = true;
    for (let i: i32 = 0; i < searchLen; i++) {
      let chr: i32 = Porffor.IR.loadU8(thisPtr + i, 4);
      let expected: i32 = Porffor.IR.loadU8(searchPtr + i, 4);

      if (chr != expected) {
        match = false;
        break;
      }
    }

    if (match) return true;

    thisPtr++;
  }

  return false;
};


export const __String_prototype_padStart = function (this: string, targetLength: any, padString: any = undefined) {
  const len: i32 = this.length;
  targetLength = ecma262.ToIntegerOrInfinity(targetLength);
  if (targetLength <= len) return this;

  if (Porffor.type(padString) == Porffor.TYPES.undefined) padString = ' ';
  else padString = ecma262.ToString(padString);
  if (Porffor.type(padString) == Porffor.TYPES.bytestring) padString = Porffor.bytestringToString(padString);

  const padStringLen: i32 = padString.length;
  if (padStringLen == 0) return this;
  if (targetLength > 1073741820) throw new RangeError('Invalid string length');

  const todo: i32 = targetLength - len;
  const out: string = Porffor.malloc(6 + targetLength * 2);
  let outPtr: i32 = Porffor.IR.ptr(out);
  for (let i: i32 = 0; i < todo; i++) {
    Porffor.IR.storeU16(outPtr, 4, Porffor.IR.loadU16(Porffor.IR.ptr(padString) + (i % padStringLen) * 2, 4));
    outPtr += 2;
  }

  let thisPtr: i32 = Porffor.IR.ptr(this);
  const thisPtrEnd: i32 = thisPtr + len * 2;
  while (thisPtr < thisPtrEnd) {
    Porffor.IR.storeU16(outPtr, 4, Porffor.IR.loadU16(thisPtr, 4));
    thisPtr += 2;
    outPtr += 2;
  }

  out.length = targetLength;
  return out;
};

export const __ByteString_prototype_padStart = function (this: bytestring, targetLength: any, padString: any = undefined) {
  const len: i32 = this.length;
  targetLength = ecma262.ToIntegerOrInfinity(targetLength);
  if (targetLength <= len) return this;

  if (Porffor.type(padString) != Porffor.TYPES.undefined) {
    padString = ecma262.ToString(padString);
    if (Porffor.type(padString) != Porffor.TYPES.bytestring) {
      return Porffor.callThis(__String_prototype_padStart, Porffor.bytestringToString(this), targetLength, padString);
    }
    if (padString.length == 0) return this;
  }
  if (targetLength > 2147483641) throw new RangeError('Invalid string length');

  const todo: i32 = targetLength - len;
  const out: bytestring = Porffor.malloc(6 + targetLength);
  let outPtr: i32 = Porffor.IR.ptr(out);
  if (Porffor.type(padString) == Porffor.TYPES.undefined) {
    for (let i: i32 = 0; i < todo; i++) Porffor.IR.storeU8(outPtr++, 4, 32);
  } else {
    const padStringLen: i32 = padString.length;
    for (let i: i32 = 0; i < todo; i++) {
      Porffor.IR.storeU8(outPtr++, 4, Porffor.IR.loadU8(Porffor.IR.ptr(padString) + (i % padStringLen), 4));
    }
  }

  let thisPtr: i32 = Porffor.IR.ptr(this);
  const thisPtrEnd: i32 = thisPtr + len;
  while (thisPtr < thisPtrEnd) Porffor.IR.storeU8(outPtr++, 4, Porffor.IR.loadU8(thisPtr++, 4));

  out.length = targetLength;
  return out;
};


export const __String_prototype_padEnd = function (this: string, targetLength: any, padString: any = undefined) {
  const len: i32 = this.length;
  targetLength = ecma262.ToIntegerOrInfinity(targetLength);
  if (targetLength <= len) return this;

  if (Porffor.type(padString) == Porffor.TYPES.undefined) padString = ' ';
  else padString = ecma262.ToString(padString);
  if (Porffor.type(padString) == Porffor.TYPES.bytestring) padString = Porffor.bytestringToString(padString);

  const padStringLen: i32 = padString.length;
  if (padStringLen == 0) return this;
  if (targetLength > 1073741820) throw new RangeError('Invalid string length');

  const out: string = Porffor.malloc(6 + targetLength * 2);
  let outPtr: i32 = Porffor.IR.ptr(out);
  let thisPtr: i32 = Porffor.IR.ptr(this);
  const thisPtrEnd: i32 = thisPtr + len * 2;
  while (thisPtr < thisPtrEnd) {
    Porffor.IR.storeU16(outPtr, 4, Porffor.IR.loadU16(thisPtr, 4));
    thisPtr += 2;
    outPtr += 2;
  }

  const todo: i32 = targetLength - len;
  for (let i: i32 = 0; i < todo; i++) {
    Porffor.IR.storeU16(outPtr, 4, Porffor.IR.loadU16(Porffor.IR.ptr(padString) + (i % padStringLen) * 2, 4));
    outPtr += 2;
  }

  out.length = targetLength;
  return out;
};

export const __ByteString_prototype_padEnd = function (this: bytestring, targetLength: any, padString: any = undefined) {
  const len: i32 = this.length;
  targetLength = ecma262.ToIntegerOrInfinity(targetLength);
  if (targetLength <= len) return this;

  if (Porffor.type(padString) != Porffor.TYPES.undefined) {
    padString = ecma262.ToString(padString);
    if (Porffor.type(padString) != Porffor.TYPES.bytestring) {
      return Porffor.callThis(__String_prototype_padEnd, Porffor.bytestringToString(this), targetLength, padString);
    }
    if (padString.length == 0) return this;
  }
  if (targetLength > 2147483641) throw new RangeError('Invalid string length');

  const out: bytestring = Porffor.malloc(6 + targetLength);
  let outPtr: i32 = Porffor.IR.ptr(out);
  let thisPtr: i32 = Porffor.IR.ptr(this);
  const thisPtrEnd: i32 = thisPtr + len;
  while (thisPtr < thisPtrEnd) Porffor.IR.storeU8(outPtr++, 4, Porffor.IR.loadU8(thisPtr++, 4));

  const todo: i32 = targetLength - len;
  if (Porffor.type(padString) == Porffor.TYPES.undefined) {
    for (let i: i32 = 0; i < todo; i++) Porffor.IR.storeU8(outPtr++, 4, 32);
  } else {
    const padStringLen: i32 = padString.length;
    for (let i: i32 = 0; i < todo; i++) {
      Porffor.IR.storeU8(outPtr++, 4, Porffor.IR.loadU8(Porffor.IR.ptr(padString) + (i % padStringLen), 4));
    }
  }

  out.length = targetLength;
  return out;
};


export const __Porffor_string_substringToBest = (str: string, start: number, end: number): bytestring|string => {
  const outLen: i32 = end - start;
  let thisPtr: i32 = Porffor.IR.ptr(str);
  const thisPtrEnd: i32 = thisPtr + end * 2;
  thisPtr += start * 2;

  let string: boolean = false;
  let scanPtr: i32 = thisPtr;
  while (scanPtr < thisPtrEnd) {
    if (Porffor.IR.loadU16(scanPtr, 4) > 0xff) {
      string = true;
      break;
    }

    scanPtr += 2;
  }

  if (!string) {
    const out: bytestring = Porffor.malloc(6 + outLen);
    let outPtr: i32 = Porffor.IR.ptr(out);
    while (thisPtr < thisPtrEnd) {
      Porffor.IR.storeU8(outPtr++, 4, Porffor.IR.loadU16(thisPtr, 4));
      thisPtr += 2;
    }

    out.length = outLen;
    return out;
  }

  const out: string = Porffor.malloc(6 + outLen * 2);
  if (outLen > 0) Porffor.IR.copy(Porffor.IR.ptr(out) + 4, Porffor.IR.ptr(str) + 4 + start * 2, outLen * 2);

  out.length = outLen;
  return out;
};

export const __String_prototype_substring = function (this: string, start: number, end: number) {
  const len: i32 = this.length;
  if (Porffor.type(end) == Porffor.TYPES.undefined) {
    end = len;
  } else if (start > end) {
    const tmp: i32 = end;
    end = start;
    start = tmp;
  }

  if (start < 0) start = 0;
  if (start > len) start = len;
  if (end < 0) end = 0;
  if (end > len) end = len;

  return __Porffor_string_substringToBest(this, start, end);
};

export const __ByteString_prototype_substring = function (this: bytestring, start: number, end: number) {
  const len: i32 = this.length;
  if (Porffor.type(end) == Porffor.TYPES.undefined) {
    end = len;
  } else if (start > end) {
    const tmp: i32 = end;
    end = start;
    start = tmp;
  }

  if (start < 0) start = 0;
  if (start > len) start = len;
  if (end < 0) end = 0;
  if (end > len) end = len;

  const outLen: i32 = end - start;
  const out: bytestring = Porffor.malloc(6 + outLen);
  if (outLen > 0) Porffor.IR.copy(Porffor.IR.ptr(out) + 4, Porffor.IR.ptr(this) + 4 + start, outLen);

  out.length = outLen;
  return out;
};


export const __String_prototype_substr = function (this: string, start: number, length: number) {
  const len: i32 = this.length;
  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }

  if (Porffor.type(length) == Porffor.TYPES.undefined) length = len - start;
  if (start + length > len) length = len - start;

  return __Porffor_string_substringToBest(this, start, start + length);
};

export const __ByteString_prototype_substr = function (this: bytestring, start: number, length: number) {
  const len: i32 = this.length;
  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }

  if (Porffor.type(length) == Porffor.TYPES.undefined) length = len - start;
  if (start + length > len) length = len - start;

  const out: bytestring = Porffor.malloc(6 + length);

  let outPtr: i32 = Porffor.IR.ptr(out);
  let thisPtr: i32 = Porffor.IR.ptr(this);

  thisPtr += start;

  const thisPtrEnd: i32 = thisPtr + length;

  while (thisPtr < thisPtrEnd) {
    Porffor.IR.storeU8(outPtr++, 4, Porffor.IR.loadU8(thisPtr++, 4));
  }

  out.length = length;
  return out;
};


export const __String_prototype_slice = function (this: string, start: number, end: any) {
  const len: i32 = this.length;
  if (Porffor.type(end) == Porffor.TYPES.undefined) end = len;

  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }
  if (start > len) start = len;
  if (end < 0) {
    end = len + end;
    if (end < 0) end = 0;
  }
  if (end > len) end = len;

  if (start > end) end = start;

  return __Porffor_string_substringToBest(this, start, end);
};

export const __ByteString_prototype_slice = function (this: bytestring, start: number, end: any) {
  const len: i32 = this.length;
  if (Porffor.type(end) == Porffor.TYPES.undefined) end = len;

  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }
  if (start > len) start = len;
  if (end < 0) {
    end = len + end;
    if (end < 0) end = 0;
  }
  if (end > len) end = len;

  if (start > end) end = start;

  const out: bytestring = Porffor.malloc(6 + (end - start));

  let outPtr: i32 = Porffor.IR.ptr(out);
  let thisPtr: i32 = Porffor.IR.ptr(this);

  const thisPtrEnd: i32 = thisPtr + end;

  thisPtr += start;

  while (thisPtr < thisPtrEnd) {
    Porffor.IR.storeU8(outPtr++, 4, Porffor.IR.loadU8(thisPtr++, 4));
  }

  out.length = end - start;
  return out;
};


export const __String_prototype_trimStart = function (this: string) {
  const len: i32 = this.length;
  const out: string = Porffor.malloc(6 + len * 2);

  let outPtr: i32 = Porffor.IR.ptr(out);
  let thisPtr: i32 = Porffor.IR.ptr(this);

  const thisPtrEnd: i32 = thisPtr + len * 2;

  let n: i32 = 0, start: boolean = true;
  while (thisPtr < thisPtrEnd) {
    const chr: i32 = Porffor.IR.loadU16(thisPtr, 4);
    thisPtr += 2;

    if (start) {
      // todo: not spec compliant, needs more unicode chars
      if (Porffor.fastOr(chr == 0x9, chr == 0xb, chr == 0xc, chr == 0xfeff, chr == 0x20, chr == 0xa0, chr == 0x1680, chr == 0x2000, chr == 0x2001, chr == 0x2002, chr == 0x2003, chr == 0x2004, chr == 0x2005, chr == 0x2006, chr == 0x2007, chr == 0x2008, chr == 0x2009, chr == 0x200a, chr == 0x202f, chr == 0x205f, chr == 0x3000, chr == 0xa, chr == 0xd, chr == 0x2028, chr == 0x2029)) {
        n++;
        continue;
      }

      start = false;
    }

    Porffor.IR.storeU16(outPtr, 4, chr);
    outPtr += 2;
  }

  out.length = len - n;
  return out;
};

export const __ByteString_prototype_trimStart = function (this: bytestring) {
  const len: i32 = this.length;
  const out: bytestring = Porffor.malloc(6 + len);

  let outPtr: i32 = Porffor.IR.ptr(out);
  let thisPtr: i32 = Porffor.IR.ptr(this);

  const thisPtrEnd: i32 = thisPtr + len;

  let n: i32 = 0, start: boolean = true;
  while (thisPtr < thisPtrEnd) {
    const chr: i32 = Porffor.IR.loadU8(thisPtr++, 4);

    if (start) {
      // todo: not spec compliant, needs more unicode chars
      if (Porffor.fastOr(chr == 0x9, chr == 0xb, chr == 0xc, chr == 0xfeff, chr == 0x20, chr == 0xa0, chr == 0x1680, chr == 0x2000, chr == 0x2001, chr == 0x2002, chr == 0x2003, chr == 0x2004, chr == 0x2005, chr == 0x2006, chr == 0x2007, chr == 0x2008, chr == 0x2009, chr == 0x200a, chr == 0x202f, chr == 0x205f, chr == 0x3000, chr == 0xa, chr == 0xd, chr == 0x2028, chr == 0x2029)) {
        n++;
        continue;
      }

      start = false;
    }

    Porffor.IR.storeU8(outPtr++, 4, chr);
  }

  out.length = len - n;
  return out;
};


export const __String_prototype_trimEnd = function (this: string) {
  const len: i32 = this.length;
  const out: string = Porffor.malloc(6 + len * 2);

  let outPtr: i32 = Porffor.IR.ptr(out);
  let thisPtr: i32 = Porffor.IR.ptr(this);

  const thisPtrStart: i32 = thisPtr;

  thisPtr += len * 2;
  outPtr += len * 2;

  let n: i32 = 0, start: boolean = true;
  while (thisPtr > thisPtrStart) {
    thisPtr -= 2;
    const chr: i32 = Porffor.IR.loadU16(thisPtr, 4);

    outPtr -= 2;

    if (start) {
      // todo: not spec compliant, needs more unicode chars
      if (Porffor.fastOr(chr == 0x9, chr == 0xb, chr == 0xc, chr == 0xfeff, chr == 0x20, chr == 0xa0, chr == 0x1680, chr == 0x2000, chr == 0x2001, chr == 0x2002, chr == 0x2003, chr == 0x2004, chr == 0x2005, chr == 0x2006, chr == 0x2007, chr == 0x2008, chr == 0x2009, chr == 0x200a, chr == 0x202f, chr == 0x205f, chr == 0x3000, chr == 0xa, chr == 0xd, chr == 0x2028, chr == 0x2029)) {
        n++;
        continue;
      }

      start = false;
    }

    Porffor.IR.storeU16(outPtr, 4, chr);
  }

  out.length = len - n;
  return out;
};

export const __ByteString_prototype_trimEnd = function (this: bytestring) {
  const len: i32 = this.length;
  const out: bytestring = Porffor.malloc(6 + len);

  let outPtr: i32 = Porffor.IR.ptr(out);
  let thisPtr: i32 = Porffor.IR.ptr(this);

  const thisPtrStart: i32 = thisPtr;

  thisPtr += len;
  outPtr += len;

  let n: i32 = 0, start: boolean = true;
  while (thisPtr > thisPtrStart) {
    const chr: i32 = Porffor.IR.loadU8(--thisPtr, 4);

    outPtr--;

    if (start) {
      // todo: not spec compliant, needs more unicode chars
      if (Porffor.fastOr(chr == 0x9, chr == 0xb, chr == 0xc, chr == 0xfeff, chr == 0x20, chr == 0xa0, chr == 0x1680, chr == 0x2000, chr == 0x2001, chr == 0x2002, chr == 0x2003, chr == 0x2004, chr == 0x2005, chr == 0x2006, chr == 0x2007, chr == 0x2008, chr == 0x2009, chr == 0x200a, chr == 0x202f, chr == 0x205f, chr == 0x3000, chr == 0xa, chr == 0xd, chr == 0x2028, chr == 0x2029)) {
        n++;
        continue;
      }

      start = false;
    }

    Porffor.IR.storeU8(outPtr, 4, chr);
  }

  out.length = len - n;
  return out;
};

export const __String_prototype_trim = function (this: string) {
  // todo/perf: optimize and not just reuse
  return Porffor.callThis(__String_prototype_trimStart, Porffor.callThis(__String_prototype_trimEnd, this));
};

export const __ByteString_prototype_trim = function (this: bytestring) {
  // todo/perf: optimize and not just reuse
  return Porffor.callThis(__ByteString_prototype_trimStart, Porffor.callThis(__ByteString_prototype_trimEnd, this));
};


export const __String_prototype_concat = function (this: string, ...vals: any[]) {
  let out: any = this;
  const valsLen: i32 = vals.length;
  for (let i: i32 = 0; i < valsLen; i++) {
    out = __Porffor_concatStrings(out, vals[i]);
  }

  return out;
};

export const __ByteString_prototype_concat = function (this: bytestring, ...vals: any[]) {
  let out: any = this;
  const valsLen: i32 = vals.length;
  for (let i: i32 = 0; i < valsLen; i++) {
    out = __Porffor_concatStrings(out, vals[i]);
  }

  return out;
};

export const __String_prototype_repeat = function (this: string, cnt: any) {
  const count: number = ecma262.ToIntegerOrInfinity(cnt);
  if (count < 0) throw new RangeError('Invalid count value');

  const thisLen: i32 = this.length * 2;
  if (thisLen == 0) return '';

  const out: string = Porffor.malloc(6 + thisLen * count);
  for (let i: i32 = 0; i < count; i++) {
    Porffor.IR.copy(Porffor.IR.ptr(out) + 4 + i * thisLen, Porffor.IR.ptr(this) + 4, thisLen);
  }

  Porffor.IR.storeI32(out, 0, this.length * count);
  return out;
};

export const __ByteString_prototype_repeat = function (this: bytestring, cnt: any) {
  const count: number = ecma262.ToIntegerOrInfinity(cnt);
  if (count < 0) throw new RangeError('Invalid count value');

  const thisLen: i32 = this.length;
  if (thisLen == 0) return '';

  const out: bytestring = Porffor.malloc(6 + thisLen * count);
  for (let i: i32 = 0; i < count; i++) {
    Porffor.IR.copy(Porffor.IR.ptr(out) + 4 + i * thisLen, Porffor.IR.ptr(this) + 4, thisLen);
  }

  Porffor.IR.storeI32(out, 0, thisLen * count);
  return out;
};

export const __Porffor_string_substringLike = (str: any, start: number, end: number) => {
  if (Porffor.type(str) == Porffor.TYPES.bytestring) {
    return Porffor.callThis(__ByteString_prototype_substring, str, start, end);
  }

  return Porffor.callThis(__String_prototype_substring, str, start, end);
};

export const __Porffor_string_indexOfLike = (str: any, searchString: any, position: any = 0) => {
  if (Porffor.type(str) == Porffor.TYPES.bytestring) {
    return Porffor.callThis(__ByteString_prototype_indexOf, str, searchString, position);
  }

  return Porffor.callThis(__String_prototype_indexOf, str, searchString, position);
};

export const __Porffor_string_emptyLike = (str: any) => __Porffor_string_substringLike(str, 0, 0);

export const __Porffor_string_getSubstitution = (str: any, match: any[], position: number, replacement: any) => {
  replacement = ecma262.ToString(replacement);

  let out: any = __Porffor_string_emptyLike(replacement);
  let i: i32 = 0;
  const len: i32 = replacement.length;

  while (i < len) {
    if (replacement.charCodeAt(i) != 36 || i + 1 >= len) {
      out = __Porffor_strcat(out, __Porffor_string_substringLike(replacement, i, i + 1));
      i++;
      continue;
    }

    const next: i32 = replacement.charCodeAt(i + 1);
    if (next == 36) {
      out = __Porffor_strcat(out, __Porffor_string_substringLike(replacement, i, i + 1));
      i += 2;
      continue;
    }

    if (next == 38) {
      const matchValue: any = match[0];
      out = __Porffor_strcat(out, matchValue);
      i += 2;
      continue;
    }

    if (next == 96) {
      out = __Porffor_strcat(out, __Porffor_string_substringLike(str, 0, position));
      i += 2;
      continue;
    }

    if (next == 39) {
      const matchValue: any = match[0];
      const matchLen: i32 = matchValue.length;
      const thisLen: i32 = str.length;
      out = __Porffor_strcat(out, __Porffor_string_substringLike(str, position + matchLen, thisLen));
      i += 2;
      continue;
    }

    if (next == 60) { // $<name>
      const groups: any = match.groups;
      if (groups !== undefined) {
        let gt: i32 = -1;
        for (let j: i32 = i + 2; j < len; j++) {
          if (replacement.charCodeAt(j) == 62) { gt = j; break; }
        }
        if (gt != -1) {
          const name: any = __Porffor_string_substringLike(replacement, i + 2, gt);
          const capture: any = Porffor.object.get(groups, name);
          if (capture !== undefined) out = __Porffor_strcat(out, ecma262.ToString(capture));
          i = gt + 1;
          continue;
        }
      }
    }

    if (next >= 48 && next <= 57) {
      let captureIndex: i32 = next - 48;
      let consumed: i32 = 2;

      if (i + 2 < len) {
        const nextNext: i32 = replacement.charCodeAt(i + 2);
        if (captureIndex != 0 && nextNext >= 48 && nextNext <= 57) {
          const twoDigit: i32 = captureIndex * 10 + nextNext - 48;
          if (twoDigit < match.length) {
            captureIndex = twoDigit;
            consumed = 3;
          }
        }
      }

      if (captureIndex > 0 && captureIndex < match.length) {
        const capture: any = match[captureIndex];
        if (capture !== undefined) out = __Porffor_strcat(out, capture);
        i += consumed;
        continue;
      }
    }

    out = __Porffor_strcat(out, __Porffor_string_substringLike(replacement, i, i + 1));
    i++;
  }

  return out;
};

export const __Porffor_array_getI32 = (arr: any[], index: i32): any => {
  return arr[index];
};

export const __Porffor_string_applyReplacer = (str: any, match: any[], position: number, replaceValue: any) => {
  if (Porffor.type(replaceValue) == Porffor.TYPES.function) {
    const len: i32 = match.length;
    const m0: any = __Porffor_array_getI32(match, 0);
    if (len <= 1) return ecma262.ToString(replaceValue(m0, position, str));
    const m1: any = __Porffor_array_getI32(match, 1);
    if (len == 2) return ecma262.ToString(replaceValue(m0, m1, position, str));
    const m2: any = __Porffor_array_getI32(match, 2);
    if (len == 3) return ecma262.ToString(replaceValue(m0, m1, m2, position, str));
    const m3: any = __Porffor_array_getI32(match, 3);
    if (len == 4) return ecma262.ToString(replaceValue(m0, m1, m2, m3, position, str));
    const m4: any = __Porffor_array_getI32(match, 4);
    if (len == 5) return ecma262.ToString(replaceValue(m0, m1, m2, m3, m4, position, str));

    throw new RangeError('String.prototype.replace callback supports up to 4 capture groups');
  }

  return __Porffor_string_getSubstitution(str, match, position, replaceValue);
};

export const __Porffor_string_replace = (str: any, searchValue: any, replaceValue: any) => {
  const thisLen: i32 = str.length;

  if (Porffor.type(searchValue) == Porffor.TYPES.regexp) {
    const global: boolean = Porffor.callThis(__RegExp_prototype_global$get, searchValue);
    const strType: i32 = Porffor.type(str);
    const uv: boolean = (Porffor.IR.loadU16(searchValue, 4) & 0b10010000) != 0;

    let out: any = __Porffor_string_emptyLike(str);
    let matched: boolean = false;
    let appendIndex: i32 = 0;
    let searchIndex: i32 = 0;

    // plain replacement (no '$') only needs match positions
    let plain: boolean = false;
    let repl: any = replaceValue;
    if (Porffor.type(replaceValue) != Porffor.TYPES.function) {
      repl = ecma262.ToString(replaceValue);
      plain = __Porffor_string_indexOfLike(repl, '$', 0) == -1;
    }

    // all-bytestring case builds one growing buffer instead of strcat chains
    if (plain && strType == Porffor.TYPES.bytestring && Porffor.type(repl) == Porffor.TYPES.bytestring) {
      const replLen: i32 = (repl as bytestring).length;
      let cap: i32 = thisLen + replLen + 16;
      let buf: i32 = Porffor.malloc(cap + 8);
      let bufLen: i32 = 0;
      while (searchIndex <= thisLen) {
        const matchEnd: i32 = __Porffor_regex_interpretFrom(searchValue, str, 2, searchIndex);
        if (matchEnd == -1) break;
        const matchIndex: i32 = __Porffor_regex_matchStart();
        matched = true;
        const segLen: i32 = matchIndex - appendIndex;
        if (bufLen + segLen + replLen > cap) {
          while (cap < bufLen + segLen + replLen) cap *= 2;
          const nbuf: i32 = Porffor.malloc(cap + 8);
          Porffor.IR.copy(nbuf + 4, buf + 4, bufLen);
          buf = nbuf;
        }
        Porffor.IR.copy(buf + 4 + bufLen, Porffor.IR.ptr(str) + 4 + appendIndex, segLen);
        bufLen += segLen;
        Porffor.IR.copy(buf + 4 + bufLen, Porffor.IR.ptr(repl) + 4, replLen);
        bufLen += replLen;

        appendIndex = matchEnd;
        if (!global) break;
        if (matchEnd == matchIndex) {
          if (matchEnd >= thisLen) break;
          searchIndex = matchEnd + 1;
          continue;
        }
        searchIndex = matchEnd;
      }
      if (!matched) return str;
      const tailLen: i32 = thisLen - appendIndex;
      if (bufLen + tailLen > cap) {
        cap = bufLen + tailLen;
        const nbuf: i32 = Porffor.malloc(cap + 8);
        Porffor.IR.copy(nbuf + 4, buf + 4, bufLen);
        buf = nbuf;
      }
      Porffor.IR.copy(buf + 4 + bufLen, Porffor.IR.ptr(str) + 4 + appendIndex, tailLen);
      bufLen += tailLen;
      Porffor.IR.storeI32(buf, 0, bufLen);
      return buf as bytestring;
    }

    while (searchIndex <= thisLen) {
      let matchIndex: i32 = 0;
      let matchEnd: i32 = 0;
      if (plain) {
        matchEnd = __Porffor_regex_interpretFrom(searchValue, str, 2, searchIndex);
        if (matchEnd == -1) break;
        matchIndex = __Porffor_regex_matchStart();
        matched = true;
        out = __Porffor_strcat(out, __Porffor_regex_inputSubstring(str, strType, appendIndex, matchIndex));
        out = __Porffor_strcat(out, repl);
      } else {
        const match: any = __Porffor_regex_interpretFrom(searchValue, str, 0, searchIndex);
        if (match == null) break;
        matched = true;
        matchIndex = match.index;
        const matchValue: any = match[0];
        matchEnd = matchIndex + matchValue.length;
        out = __Porffor_strcat(out, __Porffor_regex_inputSubstring(str, strType, appendIndex, matchIndex));
        out = __Porffor_strcat(out, __Porffor_string_applyReplacer(str, match, matchIndex, replaceValue));
      }

      appendIndex = matchEnd;
      if (!global) break;

      if (matchEnd == matchIndex) {
        if (matchEnd >= thisLen) break;
        searchIndex = matchEnd + 1;
        if (uv && strType == Porffor.TYPES.string && searchIndex < thisLen) {
          const u1: i32 = Porffor.IR.loadU16(Porffor.IR.ptr(str) + matchEnd * 2, 4);
          const u2: i32 = Porffor.IR.loadU16(Porffor.IR.ptr(str) + searchIndex * 2, 4);
          if (u1 >= 0xD800 && u1 <= 0xDBFF && u2 >= 0xDC00 && u2 <= 0xDFFF) searchIndex += 1;
        }
        continue;
      }

      searchIndex = matchEnd;
    }

    if (!matched) return str;
    return __Porffor_strcat(out, __Porffor_regex_inputSubstring(str, strType, appendIndex, thisLen));
  }

  searchValue = ecma262.ToString(searchValue);
  const searchLen: i32 = searchValue.length;
  const matchIndex: i32 = searchLen == 0 ? 0 : __Porffor_string_indexOfLike(str, searchValue, 0);
  if (matchIndex == -1) return str;

  const match: any[] = Porffor.array.new(1);
  match[0] = searchValue;
  match.index = matchIndex;
  match.input = str;

  let out: any = __Porffor_string_emptyLike(str);
  out = __Porffor_strcat(out, __Porffor_string_substringLike(str, 0, matchIndex));
  out = __Porffor_strcat(out, __Porffor_string_applyReplacer(str, match, matchIndex, replaceValue));
  return __Porffor_strcat(out, __Porffor_string_substringLike(str, matchIndex + searchLen, thisLen));
};

export const __String_prototype_replace = function (this: string, searchValue: any, replaceValue: any) {
  return __Porffor_string_replace(this, searchValue, replaceValue);
};

export const __ByteString_prototype_replace = function (this: bytestring, searchValue: any, replaceValue: any) {
  return __Porffor_string_replace(this, searchValue, replaceValue);
};

export const __Porffor_string_replaceAll = (str: any, searchValue: any, replaceValue: any) => {
  const thisLen: i32 = str.length;

  if (Porffor.type(searchValue) == Porffor.TYPES.regexp) {
    if (!Porffor.callThis(__RegExp_prototype_global$get, searchValue)) {
      throw new TypeError('String.prototype.replaceAll called with a non-global RegExp argument');
    }

    return __Porffor_string_replace(str, searchValue, replaceValue);
  }

  searchValue = ecma262.ToString(searchValue);
  const searchLen: i32 = searchValue.length;
  const match: any[] = Porffor.array.new(1);
  match[0] = searchValue;
  match.input = str;

  let out: any = __Porffor_string_emptyLike(str);
  let appendIndex: i32 = 0;
  let searchIndex: i32 = 0;
  let matched: boolean = false;

  while (searchIndex <= thisLen) {
    const matchIndex: i32 = searchLen == 0 ? searchIndex : __Porffor_string_indexOfLike(str, searchValue, searchIndex);
    if (matchIndex == -1) break;

    matched = true;
    match.index = matchIndex;
    out = __Porffor_strcat(out, __Porffor_string_substringLike(str, appendIndex, matchIndex));
    out = __Porffor_strcat(out, __Porffor_string_applyReplacer(str, match, matchIndex, replaceValue));

    appendIndex = matchIndex + searchLen;
    if (searchLen == 0) {
      if (matchIndex >= thisLen) break;
      searchIndex = matchIndex + 1;
      continue;
    }

    searchIndex = appendIndex;
  }

  if (!matched) return str;
  return __Porffor_strcat(out, __Porffor_string_substringLike(str, appendIndex, thisLen));
};

export const __String_prototype_replaceAll = function (this: string, searchValue: any, replaceValue: any) {
  return __Porffor_string_replaceAll(this, searchValue, replaceValue);
};

export const __ByteString_prototype_replaceAll = function (this: bytestring, searchValue: any, replaceValue: any) {
  return __Porffor_string_replaceAll(this, searchValue, replaceValue);
};



// regex split per spec: split between separator matches, splicing captures in, uses the engine's positions mode
export const __Porffor_string_splitRegex = (str: any, separator: any, limit: number, out: any[]): any[] => {
  let outLen: i32 = 0;
  const strType: i32 = Porffor.type(str);
  const thisLen: i32 = str.length;
  const nCaps: i32 = Porffor.IR.loadU16(separator, 6);
  const uv: boolean = (Porffor.IR.loadU16(separator, 4) & 0b10010000) != 0;

  if (thisLen == 0) {
    const e0: i32 = __Porffor_regex_interpretFrom(separator, str, 2, 0);
    out.length = 0;
    if (e0 == -1) Porffor.array.fastPush(out, str);
    return out;
  }

  let p: i32 = 0;
  let q: i32 = 0;
  while (q < thisLen) {
    const e: i32 = __Porffor_regex_interpretFrom(separator, str, 2, q);
    if (e == -1) break;
    const mi: i32 = __Porffor_regex_matchStart();
    if (e == p) { // empty match at previous split point: advance
      q = mi + 1;
      if (uv && strType == Porffor.TYPES.string && q < thisLen) {
        const u1: i32 = Porffor.IR.loadU16(Porffor.IR.ptr(str) + (q - 1) * 2, 4);
        const u2: i32 = Porffor.IR.loadU16(Porffor.IR.ptr(str) + q * 2, 4);
        if (u1 >= 0xD800 && u1 <= 0xDBFF && u2 >= 0xDC00 && u2 <= 0xDFFF) q += 1;
      }
      continue;
    }

    outLen = Porffor.array.fastPush(out, __Porffor_regex_inputSubstring(str, strType, p, mi));
    if (outLen >= limit) { out.length = outLen; return out; }
    for (let k: i32 = 0; k < nCaps; k++) {
      const cs: i32 = __Porffor_regex_capsRead(k * 2);
      const ce: i32 = __Porffor_regex_capsRead(k * 2 + 1);
      if (cs != -1 && ce != -1) outLen = Porffor.array.fastPush(out, __Porffor_regex_inputSubstring(str, strType, cs, ce));
        else outLen = Porffor.array.fastPush(out, undefined);
      if (outLen >= limit) { out.length = outLen; return out; }
    }
    p = e;
    q = e;
  }

  outLen = Porffor.array.fastPush(out, __Porffor_regex_inputSubstring(str, strType, p, thisLen));
  out.length = outLen;
  return out;
};

export const __String_prototype_split = function (this: string, separator: any, limit: any) {
  const out: any[] = Porffor.array.new(4);
  let outLen: i32 = 0;

  if (Porffor.type(limit) == Porffor.TYPES.undefined) {
    limit = Number.MAX_SAFE_INTEGER;
  } else {
    limit = ecma262.ToIntegerOrInfinity(limit);
    if (limit < 0) limit = Number.MAX_SAFE_INTEGER;
  }

  if (Porffor.type(separator) == Porffor.TYPES.undefined) {
    if (limit == 0) {
      out.length = 0;
      return out;
    }

    out.length = 1;
    Porffor.IR.storeJv(Porffor.IR.loadI32(out, 4), 0, this);
    return out;
  }

  if (Porffor.type(separator) == Porffor.TYPES.regexp) {
    if (limit == 0) {
      out.length = 0;
      return out;
    }

    return __Porffor_string_splitRegex(this, separator, limit, out);
  }

  separator = ecma262.ToString(separator);
  if (limit == 0) {
    out.length = 0;
    return out;
  }

  const thisLen: i32 = this.length, sepLen: i32 = separator.length;
  if (sepLen == 1) {
    // fast path: single char separator
    const sepChar: i32 = separator.charCodeAt(0);
    let start: i32 = 0;
    for (let i: i32 = 0; i < thisLen; i++) {
      const x: i32 = Porffor.IR.loadU16(Porffor.IR.ptr(this) + i * 2, 4);

      if (x == sepChar) {
        if (outLen >= limit) {
          out.length = outLen;
          return out;
        }

        outLen = Porffor.array.fastPush(out, Porffor.callThis(__String_prototype_substring, this, start, i));
        start = i + 1;
      }
    }

    if (outLen < limit) {
      outLen = Porffor.array.fastPush(out, Porffor.callThis(__String_prototype_substring, this, start, thisLen));
    }
  } else if (sepLen == 0) {
    let produced: i32 = 0;
    for (let i = 0; i < thisLen && produced < limit; i++) {
      outLen = Porffor.array.fastPush(out, Porffor.callThis(__String_prototype_substring, this, i, i + 1));
      produced++;
    }
  } else {
    let start: i32 = 0;
    const maxStart: i32 = thisLen - sepLen;
    let i: i32 = 0;
    while (i <= maxStart) {
      let match: boolean = true;
      for (let j: i32 = 0; j < sepLen; j++) {
        const x: i32 = Porffor.IR.loadU16(Porffor.IR.ptr(this) + (i + j) * 2, 4);
        if (x != separator.charCodeAt(j)) {
          match = false;
          break;
        }
      }

      if (match) {
        if (outLen >= limit) {
          out.length = outLen;
          return out;
        }

        outLen = Porffor.array.fastPush(out, Porffor.callThis(__String_prototype_substring, this, start, i));
        i += sepLen;
        start = i;
        continue;
      }

      i++;
    }

    if (outLen < limit) {
      outLen = Porffor.array.fastPush(out, Porffor.callThis(__String_prototype_substring, this, start, thisLen));
    }
  }

  out.length = outLen;
  return out;
};

export const __ByteString_prototype_split = function (this: bytestring, separator: any, limit: any) {
  const out: any[] = Porffor.array.new(4);
  let outLen: i32 = 0;

  if (Porffor.type(limit) == Porffor.TYPES.undefined) {
    limit = Number.MAX_SAFE_INTEGER;
  } else {
    limit = ecma262.ToIntegerOrInfinity(limit);
    if (limit < 0) limit = Number.MAX_SAFE_INTEGER;
  }

  if (Porffor.type(separator) == Porffor.TYPES.undefined) {
    if (limit == 0) {
      out.length = 0;
      return out;
    }

    out.length = 1;
    Porffor.IR.storeJv(Porffor.IR.loadI32(out, 4), 0, this);
    return out;
  }

  if (Porffor.type(separator) == Porffor.TYPES.regexp) {
    if (limit == 0) {
      out.length = 0;
      return out;
    }

    return __Porffor_string_splitRegex(this, separator, limit, out);
  }

  separator = ecma262.ToString(separator);
  if (limit == 0) {
    out.length = 0;
    return out;
  }

  const thisLen: i32 = this.length, sepLen: i32 = separator.length;
  if (sepLen == 1) {
    // fast path: single char separator
    const sepChar: i32 = separator.charCodeAt(0);
    let start: i32 = 0;
    for (let i: i32 = 0; i < thisLen; i++) {
      const x: i32 = Porffor.IR.loadU8(Porffor.IR.ptr(this) + i, 4);

      if (x == sepChar) {
        if (outLen >= limit) {
          out.length = outLen;
          return out;
        }

        outLen = Porffor.array.fastPush(out, Porffor.callThis(__ByteString_prototype_substring, this, start, i));
        start = i + 1;
      }
    }

    if (outLen < limit) {
      outLen = Porffor.array.fastPush(out, Porffor.callThis(__ByteString_prototype_substring, this, start, thisLen));
    }
  } else if (sepLen == 0) {
    let produced: i32 = 0;
    for (let i = 0; i < thisLen && produced < limit; i++) {
      outLen = Porffor.array.fastPush(out, Porffor.callThis(__ByteString_prototype_substring, this, i, i + 1));
      produced++;
    }
  } else {
    let start: i32 = 0;
    const maxStart: i32 = thisLen - sepLen;
    let i: i32 = 0;
    while (i <= maxStart) {
      let match: boolean = true;
      for (let j: i32 = 0; j < sepLen; j++) {
        const x: i32 = Porffor.IR.loadU8(Porffor.IR.ptr(this) + i + j, 4);
        if (x != separator.charCodeAt(j)) {
          match = false;
          break;
        }
      }

      if (match) {
        if (outLen >= limit) {
          out.length = outLen;
          return out;
        }

        outLen = Porffor.array.fastPush(out, Porffor.callThis(__ByteString_prototype_substring, this, start, i));
        i += sepLen;
        start = i;
        continue;
      }

      i++;
    }

    if (outLen < limit) {
      outLen = Porffor.array.fastPush(out, Porffor.callThis(__ByteString_prototype_substring, this, start, thisLen));
    }
  }

  out.length = outLen;
  return out;
};


export const __String_prototype_localeCompare = function (this: string, compareString: any) {
  compareString = ecma262.ToString(compareString);

  const thisLen: i32 = this.length;
  const compareLen: i32 = compareString.length;
  const maxLen: i32 = thisLen > compareLen ? thisLen : compareLen;
  const thisPtr: i32 = Porffor.IR.ptr(this);
  const comparePtr: i32 = Porffor.IR.ptr(compareString);
  const thisString: boolean = Porffor.type(this) == Porffor.TYPES.string;
  const compareStringType: i32 = Porffor.type(compareString);
  const compareStringString: boolean = compareStringType == Porffor.TYPES.string;

  for (let i: i32 = 0; i < maxLen; i++) {
    const a: i32 = thisString ? Porffor.IR.loadU16(thisPtr + i * 2, 4) : Porffor.IR.loadU8(thisPtr + i, 4);
    const b: i32 = compareStringString ? Porffor.IR.loadU16(comparePtr + i * 2, 4) : Porffor.IR.loadU8(comparePtr + i, 4);

    if (a > b) return 1;
    if (b > a) return -1;
  }

  if (thisLen > compareLen) return 1;
  if (compareLen > thisLen) return -1;

  return 0;
};

export const __ByteString_prototype_localeCompare = function (this: bytestring, compareString: any) {
  compareString = ecma262.ToString(compareString);

  const thisLen: i32 = this.length;
  const compareLen: i32 = compareString.length;
  const maxLen: i32 = thisLen > compareLen ? thisLen : compareLen;
  const thisPtr: i32 = Porffor.IR.ptr(this);
  const comparePtr: i32 = Porffor.IR.ptr(compareString);
  const compareStringType: i32 = Porffor.type(compareString);
  const compareStringString: boolean = compareStringType == Porffor.TYPES.string;

  for (let i: i32 = 0; i < maxLen; i++) {
    const a: i32 = Porffor.IR.loadU8(thisPtr + i, 4);
    const b: i32 = compareStringString ? Porffor.IR.loadU16(comparePtr + i * 2, 4) : Porffor.IR.loadU8(comparePtr + i, 4);

    if (a > b) return 1;
    if (b > a) return -1;
  }

  if (thisLen > compareLen) return 1;
  if (compareLen > thisLen) return -1;

  return 0;
};


export const __String_prototype_isWellFormed = function (this: string) {
  let ptr: i32 = Porffor.IR.ptr(this);
  const endPtr: i32 = ptr + this.length * 2;
  while (ptr < endPtr) {
    const c1: i32 = Porffor.IR.loadU16(ptr, 4);

    if (Porffor.fastAnd(c1 >= 0xDC00, c1 <= 0xDFFF)) {
      // lone trailing surrogate, bad
      return false;
    }

    if (Porffor.fastAnd(c1 >= 0xD800, c1 <= 0xDBFF)) {
      // leading surrogate, peek if next is trailing
      const c2: i32 = ptr + 2 < endPtr ? Porffor.IR.loadU16(ptr + 2, 4) : 0;

      if (Porffor.fastAnd(c2 >= 0xDC00, c2 <= 0xDFFF)) {
        // next is trailing surrogate, skip it too
        ptr += 2;
      } else {
        // lone leading surrogate, bad
        return false;
      }
    }

    ptr += 2;
  }

  return true;
};

export const __ByteString_prototype_isWellFormed = function (this: bytestring) {
  // bytestrings cannot have surrogates, so always true
  return true;
};

export const __String_prototype_toWellFormed = function (this: string) {
  const len: i32 = this.length;
  const out: string = Porffor.malloc(6 + len * 2);
  Porffor.IR.copy(out, this, 4 + len * 2);

  let ptr: i32 = Porffor.IR.ptr(out);
  const endPtr: i32 = ptr + len * 2;
  while (ptr < endPtr) {
    const c1: i32 = Porffor.IR.loadU16(ptr, 4);

    if (Porffor.fastAnd(c1 >= 0xDC00, c1 <= 0xDFFF)) {
      // lone trailing surrogate, bad
      Porffor.IR.storeU16(ptr, 4, 0xFFFD);
    }

    if (Porffor.fastAnd(c1 >= 0xD800, c1 <= 0xDBFF)) {
      // leading surrogate, peek if next is trailing
      const c2: i32 = ptr + 2 < endPtr ? Porffor.IR.loadU16(ptr + 2, 4) : 0;

      if (Porffor.fastAnd(c2 >= 0xDC00, c2 <= 0xDFFF)) {
        // next is trailing surrogate, skip it too
        ptr += 2;
      } else {
        // lone leading surrogate, bad
        Porffor.IR.storeU16(ptr, 4, 0xFFFD);
      }
    }

    ptr += 2;
  }

  return out;
};

export const __ByteString_prototype_toWellFormed = function (this: bytestring) {
  // bytestrings cannot have surrogates, so just return this
  return this;
};


// 22.1.3.29 String.prototype.toString ()
// https://tc39.es/ecma262/#sec-string.prototype.tostring
export const __String_prototype_toString = function (this: string) {
  // 1. Return ? ThisStringValue(this value).
  return this;
};

export const __ByteString_prototype_toString = function (this: bytestring) {
  // 1. Return ? ThisStringValue(this value).
  return this;
};

export const __String_prototype_toLocaleString = function (this: string) { return Porffor.callThis(__String_prototype_toString, this); };
export const __ByteString_prototype_toLocaleString = function (this: bytestring) { return Porffor.callThis(__ByteString_prototype_toString, this); };

// 22.1.3.35 String.prototype.valueOf ()
// https://tc39.es/ecma262/#sec-string.prototype.valueof
export const __String_prototype_valueOf = function (this: string) {
  // 1. Return ? ThisStringValue(this value).
  return this;
};

export const __ByteString_prototype_valueOf = function (this: bytestring) {
  // 1. Return ? ThisStringValue(this value).
  return this;
};
