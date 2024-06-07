// @porf --valtype=i32
import type {} from './porffor.d.ts';

export const __String_fromCharCode = (code: i32) => {
  // todo: support >1 arg
  code |= 0;

  if (code < 256) {
    let out = Porffor.allocateBytes<bytestring>(5);
    out.length = 1;
    Porffor.wasm.i32.store8(out, code, 0, 4);
    return out;
  }
  
  let out = Porffor.allocateBytes<string>(5);
  out.length = 1;
  Porffor.wasm.i32.store16(out, code, 0, 4);
  return out;
};

export const __String_prototype_toUpperCase = (_this: string) => {
  // todo: unicode not just ascii
  const len: i32 = _this.length;

  let out = Porffor.allocateBytes<string>(4 + len*2);
  Porffor.wasm.i32.store(out, len, 0, 0);

  let i: i32 = Porffor.wasm`local.get ${_this}`,
      j: i32 = Porffor.wasm`local.get ${out}`;

  const endPtr: i32 = i + len * 2;
  while (i < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load16_u(i, 0, 4);
    i += 2;

    if (chr >= 97) if (chr <= 122) chr -= 32;

    Porffor.wasm.i32.store16(j, chr, 0, 4);
    j += 2;
  }

  return out;
};

export const __ByteString_prototype_toUpperCase = (_this: bytestring) => {
  const len: i32 = _this.length;

  let out = Porffor.allocateBytes<bytestring>(4 + len);
  out.length = len;

  let i: i32 = Porffor.wasm`local.get ${_this}`,
      j: i32 = Porffor.wasm`local.get ${out}`;

  const endPtr: i32 = i + len;
  while (i < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);

    if (chr >= 97) if (chr <= 122) chr -= 32;

    Porffor.wasm.i32.store8(j++, chr, 0, 4);
  }

  return out;
};


export const __String_prototype_toLowerCase = (_this: string) => {
  // todo: unicode not just ascii
  const len: i32 = _this.length;

  let out = Porffor.allocateBytes<string>(4 + len * 2);
  out.length = len;

  let i: i32 = Porffor.wasm`local.get ${_this}`,
      j: i32 = Porffor.wasm`local.get ${out}`;

  const endPtr: i32 = i + len * 2;
  while (i < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load16_u(i, 0, 4);
    i += 2;

    if (chr >= 65) if (chr <= 90) chr += 32;

    Porffor.wasm.i32.store16(j, chr, 0, 4);
    j += 2;
  }

  return out;
};

export const __ByteString_prototype_toLowerCase = (_this: bytestring) => {
  const len: i32 = _this.length;

  let out = Porffor.allocateBytes<bytestring>(4 + len);
  out.length = len;

  let i: i32 = Porffor.wasm`local.get ${_this}`,
      j: i32 = Porffor.wasm`local.get ${out}`;

  const endPtr: i32 = i + len;
  while (i < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);

    if (chr >= 65) if (chr <= 90) chr += 32;

    Porffor.wasm.i32.store8(j++, chr, 0, 4);
  }

  return out;
};


export const __String_prototype_startsWith = (_this: string, searchString: string, position: number) => {
  // todo: handle bytestring searchString

  // todo/perf: investigate whether for counter vs while ++s are faster
  // todo: handle when searchString is bytestring

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
      else position |= 0;
  } else position = 0;

  thisPtr += position * 2;

  const searchLen: i32 = searchString.length * 2;
  for (let i: i32 = 0; i < searchLen; i += 2) {
    let chr: i32 = Porffor.wasm.i32.load16_u(thisPtr + i, 0, 4);
    let expected: i32 = Porffor.wasm.i32.load16_u(searchPtr + i, 0, 4);

    if (chr != expected) return false;
  }

  return true;
};

export const __ByteString_prototype_startsWith = (_this: bytestring, searchString: bytestring, position: number) => {
  // if searching non-bytestring, bytestring will not start with it
  // todo: change this to just check if = string and ToString others
  if (Porffor.wasm`local.get ${searchString+1}` != Porffor.TYPES.bytestring) return false;

  // todo/perf: investigate whether for counter vs while ++s are faster

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
      else position |= 0;
  } else position = 0;

  thisPtr += position;

  const searchLen: i32 = searchString.length;
  for (let i: i32 = 0; i < searchLen; i++) {
    let chr: i32 = Porffor.wasm.i32.load8_u(thisPtr + i, 0, 4);
    let expected: i32 = Porffor.wasm.i32.load8_u(searchPtr + i, 0, 4);

    if (chr != expected) return false;
  }

  return true;
};


export const __String_prototype_endsWith = (_this: string, searchString: string, endPosition: number) => {
  // todo: handle bytestring searchString

  let i: i32 = Porffor.wasm`local.get ${_this}`,
      j: i32 = Porffor.wasm`local.get ${searchString}`;

  const searchLen: i32 = searchString.length;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;

  // endPosition ??= len;
  if (Porffor.wasm`local.get ${endPosition+1}` == Porffor.TYPES.undefined) endPosition = len;

  if (endPosition > 0) {
    if (endPosition > len) endPosition = len;
      else endPosition |= 0;
  } else endPosition = 0;

  endPosition -= searchLen;

  if (endPosition < 0) return false;

  i += endPosition * 2;

  const endPtr: i32 = j + searchLen * 2;
  while (j < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load16_u(i, 0, 4);
    let expected: i32 = Porffor.wasm.i32.load16_u(j, 0, 4);

    i += 2;
    j += 2;

    if (chr != expected) return false;
  }

  return true;
};

export const __ByteString_prototype_endsWith = (_this: bytestring, searchString: bytestring, endPosition: number) => {
  // if searching non-bytestring, bytestring will not start with it
  // todo: change this to just check if = string and ToString others
  if (Porffor.wasm`local.get ${searchString+1}` != Porffor.TYPES.bytestring) return false;

  let i: i32 = Porffor.wasm`local.get ${_this}`,
      j: i32 = Porffor.wasm`local.get ${searchString}`;

  const searchLen: i32 = searchString.length;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;

  // endPosition ??= len;
  if (Porffor.wasm`local.get ${endPosition+1}` == Porffor.TYPES.undefined) endPosition = len;

  if (endPosition > 0) {
    if (endPosition > len) endPosition = len;
      else endPosition |= 0;
  } else endPosition = 0;

  endPosition -= searchLen;

  if (endPosition < 0) return false;

  i += endPosition;

  const endPtr: i32 = j + searchLen;
  while (j < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);
    let expected: i32 = Porffor.wasm.i32.load8_u(j++, 0, 4);

    if (chr != expected) return false;
  }

  return true;
};


export const __String_prototype_indexOf = (_this: string, searchString: string, position: number) => {
  // todo: handle bytestring searchString
  // todo: proper toString support for non-bytestrings
  // const rightStr: bytestring = __ecma262_ToString(searchString);
  if (_this.length < searchString.length) return -1;

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  const searchLenX2: i32 = searchString.length * 2;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
      else position |= 0;
  } else position = 0;

  const thisPtrEnd: i32 = thisPtr + (len * 2) - searchLenX2;

  thisPtr += position * 2;

  while (thisPtr <= thisPtrEnd) {
    let match: boolean = true;
    for (let i: i32 = 0; i < searchLenX2; i += 2) {
      let chr: i32 = Porffor.wasm.i32.load16_u(thisPtr + i, 0, 4);
      let expected: i32 = Porffor.wasm.i32.load16_u(searchPtr + i, 0, 4);

      if (chr != expected) {
        match = false;
        break;
      }
    }

    if (match) return (thisPtr - Porffor.wasm`local.get ${_this}`) / 2;

    thisPtr += 2;
  }

  return -1;
};

export const __ByteString_prototype_indexOf = (_this: bytestring, searchString: any, position: number) => {
  const rightStr: bytestring = __ecma262_ToString(searchString);
  const searchLen: i32 = rightStr.length;
  if (_this.length < searchLen) return -1;

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${rightStr}`;


  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
      else position |= 0;
  } else position = 0;

  const thisPtrEnd: i32 = thisPtr + len - searchLen;

  thisPtr += position;

  while (thisPtr <= thisPtrEnd) {
    let match: boolean = true;
    for (let i: i32 = 0; i < searchLen; i++) {
      let chr: i32 = Porffor.wasm.i32.load8_u(thisPtr + i, 0, 4);
      let expected: i32 = Porffor.wasm.i32.load8_u(searchPtr + i, 0, 4);

      if (chr != expected) {
        match = false;
        break;
      }
    }

    if (match) return thisPtr - Porffor.wasm`local.get ${_this}`;

    thisPtr++;
  }

  return -1;
};


export const __String_prototype_lastIndexOf = (_this: string, searchString: string, position: number) => {
  // todo: handle bytestring searchString

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  const searchLen: i32 = searchString.length;
  const searchLenX2: i32 = searchLen * 2;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;

  // endPosition ??= len;
  if (Porffor.wasm`local.get ${position+1}` == Porffor.TYPES.undefined) position = len - searchLen;

  if (position > 0) {
    const max: i32 = len - searchLen;
    if (position > max) position = max;
      else position |= 0;
  } else position = 0;

  const thisPtrStart: i32 = thisPtr;

  thisPtr += position * 2;

  while (thisPtr >= thisPtrStart) {
    let match: boolean = true;
    for (let i: i32 = 0; i < searchLenX2; i += 2) {
      let chr: i32 = Porffor.wasm.i32.load8_u(thisPtr + i, 0, 4);
      let expected: i32 = Porffor.wasm.i32.load8_u(searchPtr + i, 0, 4);

      if (chr != expected) {
        match = false;
        break;
      }
    }

    if (match) return (thisPtr - Porffor.wasm`local.get ${_this}`) / 2;

    thisPtr -= 2;
  }

  return -1;
};

export const __ByteString_prototype_lastIndexOf = (_this: bytestring, searchString: bytestring, position: number) => {
  // if searching non-bytestring, bytestring will not start with it
  // todo: change this to just check if = string and ToString others
  if (Porffor.wasm`local.get ${searchString+1}` != Porffor.TYPES.bytestring) return -1;

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  const searchLen: i32 = searchString.length;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;

  // endPosition ??= len;
  if (Porffor.wasm`local.get ${position+1}` == Porffor.TYPES.undefined) position = len - searchLen;

  if (position > 0) {
    const max: i32 = len - searchLen;
    if (position > max) position = max;
      else position |= 0;
  } else position = 0;

  const thisPtrStart: i32 = thisPtr;

  thisPtr += position;

  while (thisPtr >= thisPtrStart) {
    let match: boolean = true;
    for (let i: i32 = 0; i < searchLen; i++) {
      let chr: i32 = Porffor.wasm.i32.load8_u(thisPtr + i, 0, 4);
      let expected: i32 = Porffor.wasm.i32.load8_u(searchPtr + i, 0, 4);

      if (chr != expected) {
        match = false;
        break;
      }
    }

    if (match) return thisPtr - Porffor.wasm`local.get ${_this}`;

    thisPtr--;
  }

  return -1;
};


export const __String_prototype_includes = (_this: string, searchString: string, position: number) => {
  // todo: handle bytestring searchString
  // todo: searchstring = searchstring.toString()

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  const searchLenX2: i32 = searchString.length * 2;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
      else position |= 0;
  } else position = 0;

  const thisPtrEnd: i32 = thisPtr + (len * 2) - searchLenX2;

  thisPtr += position * 2;

  while (thisPtr <= thisPtrEnd) {
    let match: boolean = true;
    for (let i: i32 = 0; i < searchLenX2; i += 2) {
      let chr: i32 = Porffor.wasm.i32.load16_u(thisPtr + i, 0, 4);
      let expected: i32 = Porffor.wasm.i32.load16_u(searchPtr + i, 0, 4);

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

export const __ByteString_prototype_includes = (_this: bytestring, searchString: any, position: number) => {
  // if searching non-bytestring, bytestring will not start with it
  const searchStr: bytestring = __ecma262_ToString(searchString);

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchStr}`;

  const searchLen: i32 = searchStr.length;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
      else position |= 0;
  } else position = 0;

  const thisPtrEnd: i32 = thisPtr + len - searchLen;

  thisPtr += position;

  while (thisPtr <= thisPtrEnd) {
    let match: boolean = true;
    for (let i: i32 = 0; i < searchLen; i++) {
      let chr: i32 = Porffor.wasm.i32.load8_u(thisPtr + i, 0, 4);
      let expected: i32 = Porffor.wasm.i32.load8_u(searchPtr + i, 0, 4);

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


export const __String_prototype_padStart = (_this: string, targetLength: number, padString: string) => {
  let out = Porffor.allocatePage<string>();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  // const padStringPtr: i32 = Porffor.wasm`local.get ${padString}`;

  const len: i32 = _this.length;

  targetLength |= 0;

  const todo: i32 = targetLength - len;
  if (todo > 0) {
    if (Porffor.wasm`local.get ${padString+1}` == Porffor.TYPES.undefined) {
      for (let i: i32 = 0; i < todo; i++) {
        Porffor.wasm.i32.store16(outPtr, 32, 0, 4);
        outPtr += 2;
      }

      out.length = targetLength;
    } else {
      const padStringLen: i32 = padString.length;
      if (padStringLen > 0) {
        for (let i: i32 = 0; i < todo; i++) {
          // Porffor.wasm.i32.store16(outPtr, Porffor.wasm.i32.load16_u(padStringPtr + (i % padStringLen) * 2, 0, 4), 0, 4);
          Porffor.wasm.i32.store16(outPtr, padString.charCodeAt(i % padStringLen), 0, 4);
          outPtr += 2;
        }
        out.length = targetLength;
      } else out.length = len;
    }
  } else out.length = len;

  const thisPtrEnd: i32 = thisPtr + len * 2;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.i32.store16(outPtr, Porffor.wasm.i32.load16_u(thisPtr, 0, 4), 0, 4);

    thisPtr += 2;
    outPtr += 2;
  }

  return out;
};

export const __ByteString_prototype_padStart = (_this: bytestring, targetLength: number, padString: bytestring) => {
  // todo: handle padString being non-bytestring

  let out = Porffor.allocatePage<bytestring>();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const padStringPtr: i32 = Porffor.wasm`local.get ${padString}`;

  const len: i32 = _this.length;

  targetLength |= 0;

  const todo: i32 = targetLength - len;
  if (todo > 0) {
    if (Porffor.wasm`local.get ${padString+1}` == Porffor.TYPES.undefined) {
      for (let i: i32 = 0; i < todo; i++) {
        Porffor.wasm.i32.store8(outPtr++, 32, 0, 4);
      }

      out.length = targetLength;
    } else {
      const padStringLen: i32 = padString.length;
      if (padStringLen > 0) {
        for (let i: i32 = 0; i < todo; i++) {
          Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(padStringPtr + (i % padStringLen), 0, 4), 0, 4);
          // Porffor.wasm.i32.store8(outPtr++, padString.charCodeAt(i % padStringLen), 0, 4);
        }

        out.length = targetLength;
      } else out.length = len;
    }
  } else out.length = len;

  const thisPtrEnd: i32 = thisPtr + len;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(thisPtr++, 0, 4), 0, 4);
  }

  return out;
};


export const __String_prototype_padEnd = (_this: string, targetLength: number, padString: string) => {
  let out = Porffor.allocatePage<string>();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  // const padStringPtr: i32 = Porffor.wasm`local.get ${padString}`;

  const len: i32 = _this.length;

  const thisPtrEnd: i32 = thisPtr + len * 2;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.i32.store16(outPtr, Porffor.wasm.i32.load16_u(thisPtr, 0, 4), 0, 4);

    thisPtr += 2;
    outPtr += 2;
  }

  targetLength |= 0;

  const todo: i32 = targetLength - len;
  if (todo > 0) {
    if (Porffor.wasm`local.get ${padString+1}` == Porffor.TYPES.undefined) {
      for (let i: i32 = 0; i < todo; i++) {
        Porffor.wasm.i32.store16(outPtr, 32, 0, 4);
        outPtr += 2;
      }

      out.length = targetLength;
    } else {
      const padStringLen: i32 = padString.length;
      if (padStringLen > 0) {
        for (let i: i32 = 0; i < todo; i++) {
          // Porffor.wasm.i32.store16(outPtr, Porffor.wasm.i32.load16_u(padStringPtr + (i % padStringLen) * 2, 0, 4), 0, 4);
          Porffor.wasm.i32.store16(outPtr, padString.charCodeAt(i % padStringLen), 0, 4);
          outPtr += 2;
        }
        out.length = targetLength;
      } else out.length = len;
    }
  } else out.length = len;

  return out;
};

export const __ByteString_prototype_padEnd = (_this: bytestring, targetLength: number, padString: bytestring) => {
  // todo: handle padString being non-bytestring

  let out = Porffor.allocatePage<bytestring>();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const padStringPtr: i32 = Porffor.wasm`local.get ${padString}`;

  const len: i32 = _this.length;

  const thisPtrEnd: i32 = thisPtr + len;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(thisPtr++, 0, 4), 0, 4);
  }

  targetLength |= 0;

  const todo: i32 = targetLength - len;
  if (todo > 0) {
    if (Porffor.wasm`local.get ${padString+1}` == Porffor.TYPES.undefined) {
      for (let i: i32 = 0; i < todo; i++) {
        Porffor.wasm.i32.store8(outPtr++, 32, 0, 4);
      }

      out.length = targetLength;
    } else {
      const padStringLen: i32 = padString.length;
      if (padStringLen > 0) {
        for (let i: i32 = 0; i < todo; i++) {
          Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(padStringPtr + (i % padStringLen), 0, 4), 0, 4);
          // Porffor.wasm.i32.store8(outPtr++, padString.charCodeAt(i % padStringLen), 0, 4);
        }

        out.length = targetLength;
      } else out.length = len;
    }
  } else out.length = len;

  return out;
};


export const __String_prototype_substring = (_this: string, start: number, end: number) => {
  const len: i32 = _this.length;
  if (Porffor.wasm`local.get ${end+1}` == Porffor.TYPES.undefined) end = len;
    else if (start > end) {
      const tmp: i32 = end;
      end = start;
      start = tmp;
    }

  start |= 0;
  end |= 0;

  if (start < 0) start = 0;
  if (start > len) start = len;
  if (end < 0) end = 0;
  if (end > len) end = len;

  const outLen: i32 = end - start;
  let out = Porffor.allocateBytes<string>(4 + outLen * 2);
  out.length = outLen;
  
  const outPtr: i32 = Porffor.wasm`local.get ${out}`;
  const thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  Porffor.wasm.memory.copy(outPtr + 4, thisPtr + 4 + start, outLen * 2)

  return out;
};

export const __ByteString_prototype_substring = (_this: bytestring, start: number, end: number) => {
  const len: i32 = _this.length;
  if (Porffor.wasm`local.get ${end+1}` == Porffor.TYPES.undefined) end = len;
    else if (start > end) {
      const tmp: i32 = end;
      end = start;
      start = tmp;
    }

  start |= 0;
  end |= 0;

  if (start < 0) start = 0;
  if (start > len) start = len;
  if (end < 0) end = 0;
  if (end > len) end = len;

  const outLen: i32 = end - start;
  let out = Porffor.allocateBytes<bytestring>(4 + outLen);
  out.length = outLen;

  const outPtr: i32 = Porffor.wasm`local.get ${out}`;
  const thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  
  Porffor.wasm.memory.copy(outPtr + 4, thisPtr + 4 + start, outLen)

  return out;
};


export const __String_prototype_substr = (_this: string, start: number, length: number) => {
  const len: i32 = _this.length;

  start |= 0;

  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }

  if (Porffor.wasm`local.get ${length+1}` == Porffor.TYPES.undefined) length = len - start;

  length |= 0;

  if (start + length > len) length = len - start;

  let out = Porffor.allocatePage<string>();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  thisPtr += start * 2;

  const thisPtrEnd: i32 = thisPtr + length * 2;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.i32.store16(outPtr, Porffor.wasm.i32.load16_u(thisPtr, 0, 4), 0, 4);

    thisPtr += 2;
    outPtr += 2;
  }

  out.length = length;

  return out;
};

export const __ByteString_prototype_substr = (_this: string, start: number, length: number) => {
  const len: i32 = _this.length;

  start |= 0;

  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }

  if (Porffor.wasm`local.get ${length+1}` == Porffor.TYPES.undefined) length = len - start;

  length |= 0;

  if (start + length > len) length = len - start;

  let out = Porffor.allocatePage<bytestring>();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  thisPtr += start;

  const thisPtrEnd: i32 = thisPtr + length;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(thisPtr++, 0, 4), 0, 4);
  }

  out.length = length;

  return out;
};


export const __String_prototype_slice = (_this: string, start: number, end: number) => {
  const len: i32 = _this.length;
  if (Porffor.wasm`local.get ${end+1}` == Porffor.TYPES.undefined) end = len;

  start |= 0;
  end |= 0;

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

  if (start > end) return '';
  if (start == end) return '';
  
  const outLen: i32 = end - start;
  let out = Porffor.allocateBytes<string>(4 + outLen * 2);
  
  const outPtr: i32 = Porffor.wasm`local.get ${out}`;
  const thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  Porffor.wasm.memory.copy(outPtr + 4, thisPtr + 4 + start, outLen*2)
  out.length = outLen;

  return out;
};

export const __ByteString_prototype_slice = (_this: bytestring, start: number, end: number) => {
  const len: i32 = _this.length;
  if (Porffor.wasm`local.get ${end+1}` == Porffor.TYPES.undefined) end = len;

  start |= 0;
  end |= 0;

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

  if (start > end) return '';
  if (start == end) return '';
  
  const outLen: i32 = end - start;
  let out = Porffor.allocateBytes<bytestring>(4 + outLen);
  
  const outPtr: i32 = Porffor.wasm`local.get ${out}`;
  const thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  Porffor.wasm.memory.copy(outPtr + 4, thisPtr + 4 + start, outLen)
  out.length = outLen;

  return out;
};


export const __String_prototype_trimStart = (_this: string) => {
  let len: i32 = _this.length;
  
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const thisPtrEnd: i32 = thisPtr + len * 2;
  
  while (thisPtr < thisPtrEnd) {
    const chr: i32 = Porffor.wasm.i32.load16_u(thisPtr, 0, 4);
    if (Porffor.fastOr(chr == 0x0009, chr == 0x000b, chr == 0x000c, chr == 0x0020, chr == 0x00a0, chr == 0xfeff, chr == 0x000a, chr == 0x000d, chr == 0x2028, chr == 0x2029)) {
      thisPtr += 2;
      len--;
      continue;
    }
    break;
  }
  
  let out = Porffor.allocateBytes<string>(4 + len*2);
  out.length = len;
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  
  Porffor.wasm.memory.copy(outPtr + 4, thisPtr + 4, len * 2);
  return out;
};

export const __ByteString_prototype_trimStart = (_this: bytestring) => {
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  
  let len: i32 = _this.length;
  
  const thisPtrEnd: i32 = thisPtr + len;
  
  while (thisPtr < thisPtrEnd) {
    const chr: i32 = Porffor.wasm.i32.load8_u(thisPtr, 0, 4);
    if (Porffor.fastOr(chr == 0x0009, chr == 0x000b, chr == 0x000c, chr == 0x0020, chr == 0x00a0, chr == 0xfeff, chr == 0x000a, chr == 0x000d, chr == 0x2028, chr == 0x2029)) {
      thisPtr ++;
      len--;
      continue;
    }
    break;
  }
  
  let out = Porffor.allocateBytes<bytestring>(4 + len);
  out.length = len;
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  Porffor.wasm.memory.copy(outPtr + 4, thisPtr + 4, len);
  return out;
};


export const __String_prototype_trimEnd = (_this: string) => {
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const thisPtrStart: i32 = thisPtr;
  
  let len: i32 = _this.length;
  thisPtr += (len * 2) - 2;

  while (thisPtr > thisPtrStart) {
    const chr: i32 = Porffor.wasm.i32.load16_u(thisPtr, 0, 4);
    if (Porffor.fastOr(chr == 0x0009, chr == 0x000b, chr == 0x000c, chr == 0x0020, chr == 0x00a0, chr == 0xfeff, chr == 0x000a, chr == 0x000d, chr == 0x2028, chr == 0x2029)) {
      thisPtr -= 2;
      len--;
      continue;
    }
    break;
  }

  let out = Porffor.allocateBytes<bytestring>(4 + len * 2);
  out.length = len;
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  Porffor.wasm.memory.copy(outPtr + 4, thisPtrStart + 4, len * 2);
  return out;
};

export const __ByteString_prototype_trimEnd = (_this: bytestring) => {
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const thisPtrStart: i32 = thisPtr;
  
  let len: i32 = _this.length;
  thisPtr += len - 1;

  while (thisPtr > thisPtrStart) {
    const chr: i32 = Porffor.wasm.i32.load8_u(thisPtr, 0, 4);
    if (Porffor.fastOr(chr == 0x0009, chr == 0x000b, chr == 0x000c, chr == 0x0020, chr == 0x00a0, chr == 0xfeff, chr == 0x000a, chr == 0x000d, chr == 0x2028, chr == 0x2029)) {
      thisPtr -= 1;
      len--;
      continue;
    }
    break;
  }

  let out = Porffor.allocateBytes<bytestring>(4 + len);
  out.length = len;
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  Porffor.wasm.memory.copy(outPtr + 4, thisPtrStart + 4, len);
  return out;
};


export const __String_prototype_trim = (_this: string) => {
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  
  let len: i32 = _this.length;
  
  const thisPtrEnd: i32 = thisPtr + len * 2;
  
  while (thisPtr < thisPtrEnd) {
    const chr: i32 = Porffor.wasm.i32.load16_u(thisPtr, 0, 4);
    if (Porffor.fastOr(chr == 0x0009, chr == 0x000b, chr == 0x000c, chr == 0x0020, chr == 0x00a0, chr == 0xfeff, chr == 0x000a, chr == 0x000d, chr == 0x2028, chr == 0x2029)) {
      thisPtr += 2;
      len--;
      continue;
    }
    break;
  }
  
  const thisPtrStart: i32 = thisPtr;
  thisPtr += len * 2 - 2;

  while (thisPtr > thisPtrStart) {
    const chr: i32 = Porffor.wasm.i32.load16_u(thisPtr, 0, 4);
    if (Porffor.fastOr(chr == 0x0009, chr == 0x000b, chr == 0x000c, chr == 0x0020, chr == 0x00a0, chr == 0xfeff, chr == 0x000a, chr == 0x000d, chr == 0x2028, chr == 0x2029)) {
      thisPtr -= 2;
      len--;
      continue;
    }
    break;
  }

  let out = Porffor.allocateBytes<bytestring>(4 + len * 2);
  out.length = len;
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  Porffor.wasm.memory.copy(outPtr + 4, thisPtrStart + 4, len * 2);
  return out;
};

export const __ByteString_prototype_trim = (_this: bytestring) => {
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  
  let len: i32 = _this.length;
  
  const thisPtrEnd: i32 = thisPtr + len;
  
  while (thisPtr < thisPtrEnd) {
    const chr: i32 = Porffor.wasm.i32.load8_u(thisPtr, 0, 4);
    if (Porffor.fastOr(chr == 0x0009, chr == 0x000b, chr == 0x000c, chr == 0x0020, chr == 0x00a0, chr == 0xfeff, chr == 0x000a, chr == 0x000d, chr == 0x2028, chr == 0x2029)) {
      thisPtr ++;
      len--;
      continue;
    }
    break;
  }
  
  const thisPtrStart: i32 = thisPtr;
  thisPtr += len - 1;

  while (thisPtr > thisPtrStart) {
    const chr: i32 = Porffor.wasm.i32.load8_u(thisPtr, 0, 4);
    if (Porffor.fastOr(chr == 0x0009, chr == 0x000b, chr == 0x000c, chr == 0x0020, chr == 0x00a0, chr == 0xfeff, chr == 0x000a, chr == 0x000d, chr == 0x2028, chr == 0x2029)) {
      thisPtr -= 1;
      len--;
      continue;
    }
    break;
  }

  let out = Porffor.allocateBytes<bytestring>(4 + len);
  out.length = len;
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  Porffor.wasm.memory.copy(outPtr + 4, thisPtrStart + 4, len);
  return out;
};

// 22.1.3.29 String.prototype.toString ()
// https://tc39.es/ecma262/#sec-string.prototype.tostring
export const __String_prototype_toString = (_this: string) => {
  // 1. Return ? ThisStringValue(this value).
  return _this;
};

export const __ByteString_prototype_toString = (_this: bytestring) => {
  // 1. Return ? ThisStringValue(this value).
  return _this;
};


// 22.1.3.35 String.prototype.valueOf ()
// https://tc39.es/ecma262/#sec-string.prototype.valueof
export const __String_prototype_valueOf = (_this: string) => {
  // 1. Return ? ThisStringValue(this value).
  return _this;
};

export const __ByteString_prototype_valueOf = (_this: bytestring) => {
  // 1. Return ? ThisStringValue(this value).
  return _this;
};