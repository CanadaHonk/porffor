// @porf --valtype=i32
import type {} from './porffor.d.ts';

export const __String_prototype_toUpperCase = (_this: string) => {
  // todo: unicode not just ascii
  const len: i32 = _this.length;

  let out: string = Porffor.allocate();
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

  let out: bytestring = Porffor.allocate();
  Porffor.wasm.i32.store(out, len, 0, 0);

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

  let out: string = Porffor.allocate();
  Porffor.wasm.i32.store(out, len, 0, 0);

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

  let out: bytestring = Porffor.allocate();
  Porffor.wasm.i32.store(out, len, 0, 0);

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

export const __ByteString_prototype_indexOf = (_this: bytestring, searchString: bytestring, position: number) => {
  // if searching non-bytestring, bytestring will not start with it
  // todo: change this to just check if = string and ToString others
  if (Porffor.wasm`local.get ${searchString+1}` != Porffor.TYPES.bytestring) return -1;

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  const searchLen: i32 = searchString.length;

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

export const __ByteString_prototype_includes = (_this: bytestring, searchString: bytestring, position: number) => {
  // if searching non-bytestring, bytestring will not start with it
  // todo: change this to just check if = string and ToString others
  if (Porffor.wasm`local.get ${searchString+1}` != Porffor.TYPES.bytestring) return -1;

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  const searchLen: i32 = searchString.length;

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
  let out: string = Porffor.allocate();

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

  let out: bytestring = Porffor.allocate();

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
  let out: string = Porffor.allocate();

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

  let out: bytestring = Porffor.allocate();

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

  let out: string = Porffor.allocate();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const thisPtrEnd: i32 = thisPtr + end * 2;

  thisPtr += start * 2;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.i32.store16(outPtr, Porffor.wasm.i32.load16_u(thisPtr, 0, 4), 0, 4);

    thisPtr += 2;
    outPtr += 2;
  }

  out.length = end - start;

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

  let out: bytestring = Porffor.allocate();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const thisPtrEnd: i32 = thisPtr + end;

  thisPtr += start;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(thisPtr++, 0, 4), 0, 4);
  }

  out.length = end - start;

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

  let out: string = Porffor.allocate();

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

  let out: bytestring = Porffor.allocate();

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

  let out: string = Porffor.allocate();

  if (start > end) return out;

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const thisPtrEnd: i32 = thisPtr + end * 2;

  thisPtr += start * 2;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.i32.store16(outPtr, Porffor.wasm.i32.load16_u(thisPtr, 0, 4), 0, 4);

    thisPtr += 2;
    outPtr += 2;
  }

  out.length = end - start;

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

  let out: bytestring = Porffor.allocate();

  if (start > end) return out;

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const thisPtrEnd: i32 = thisPtr + end;

  thisPtr += start;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(thisPtr++, 0, 4), 0, 4);
  }

  out.length = end - start;

  return out;
};


export const __String_prototype_trimStart = (_this: string) => {
  let out: string = Porffor.allocate();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const len: i32 = _this.length;

  const thisPtrEnd: i32 = thisPtr + len * 2;

  let n: i32 = 0, start: boolean = true;
  while (thisPtr < thisPtrEnd) {
    const chr: i32 = Porffor.wasm.i32.load16_u(thisPtr, 0, 4);
    thisPtr += 2;

    if (start) {
      // todo: not spec compliant, needs more unicode chars
      if (Porffor.fastOr(chr == 0x9, chr == 0xb, chr == 0xc, chr == 0xfeff, chr == 0x20, chr == 0xa0, chr == 0x1680, chr == 0x2000, chr == 0x2001, chr == 0x2002, chr == 0x2003, chr == 0x2004, chr == 0x2005, chr == 0x2006, chr == 0x2007, chr == 0x2008, chr == 0x2009, chr == 0x200a, chr == 0x202f, chr == 0x205f, chr == 0x3000, chr == 0xa, chr == 0xd, chr == 0x2028, chr == 0x2029)) {
        n++;
        continue;
      }

      start = false;
    }

    Porffor.wasm.i32.store16(outPtr, chr, 0, 4);
    outPtr += 2;
  }

  out.length = len - n;

  return out;
};

export const __ByteString_prototype_trimStart = (_this: bytestring) => {
  let out: bytestring = Porffor.allocate();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const len: i32 = _this.length;

  const thisPtrEnd: i32 = thisPtr + len;

  let n: i32 = 0, start: boolean = true;
  while (thisPtr < thisPtrEnd) {
    const chr: i32 = Porffor.wasm.i32.load8_u(thisPtr++, 0, 4);

    if (start) {
      // todo: not spec compliant, needs more unicode chars
      if (Porffor.fastOr(chr == 0x9, chr == 0xb, chr == 0xc, chr == 0xfeff, chr == 0x20, chr == 0xa0, chr == 0x1680, chr == 0x2000, chr == 0x2001, chr == 0x2002, chr == 0x2003, chr == 0x2004, chr == 0x2005, chr == 0x2006, chr == 0x2007, chr == 0x2008, chr == 0x2009, chr == 0x200a, chr == 0x202f, chr == 0x205f, chr == 0x3000, chr == 0xa, chr == 0xd, chr == 0x2028, chr == 0x2029)) {
        n++;
        continue;
      }

      start = false;
    }

    Porffor.wasm.i32.store8(outPtr++, chr, 0, 4);
  }

  out.length = len - n;

  return out;
};


export const __String_prototype_trimEnd = (_this: string) => {
  let out: string = Porffor.allocate();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const len: i32 = _this.length;

  const thisPtrStart: i32 = thisPtr;

  thisPtr += len * 2;
  outPtr += len * 2;

  let n: i32 = 0, start: boolean = true;
  while (thisPtr > thisPtrStart) {
    thisPtr -= 2;
    const chr: i32 = Porffor.wasm.i32.load16_u(thisPtr, 0, 4);

    outPtr -= 2;

    if (start) {
      // todo: not spec compliant, needs more unicode chars
      if (Porffor.fastOr(chr == 0x9, chr == 0xb, chr == 0xc, chr == 0xfeff, chr == 0x20, chr == 0xa0, chr == 0x1680, chr == 0x2000, chr == 0x2001, chr == 0x2002, chr == 0x2003, chr == 0x2004, chr == 0x2005, chr == 0x2006, chr == 0x2007, chr == 0x2008, chr == 0x2009, chr == 0x200a, chr == 0x202f, chr == 0x205f, chr == 0x3000, chr == 0xa, chr == 0xd, chr == 0x2028, chr == 0x2029)) {
        n++;
        continue;
      }

      start = false;
    }

    Porffor.wasm.i32.store16(outPtr, chr, 0, 4);
  }

  out.length = len - n;

  return out;
};

export const __ByteString_prototype_trimEnd = (_this: bytestring) => {
  let out: bytestring = Porffor.allocate();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const len: i32 = _this.length;

  const thisPtrStart: i32 = thisPtr;

  thisPtr += len;
  outPtr += len;

  let n: i32 = 0, start: boolean = true;
  while (thisPtr > thisPtrStart) {
    const chr: i32 = Porffor.wasm.i32.load8_u(--thisPtr, 0, 4);

    outPtr--;

    if (start) {
      // todo: not spec compliant, needs more unicode chars
      if (Porffor.fastOr(chr == 0x9, chr == 0xb, chr == 0xc, chr == 0xfeff, chr == 0x20, chr == 0xa0, chr == 0x1680, chr == 0x2000, chr == 0x2001, chr == 0x2002, chr == 0x2003, chr == 0x2004, chr == 0x2005, chr == 0x2006, chr == 0x2007, chr == 0x2008, chr == 0x2009, chr == 0x200a, chr == 0x202f, chr == 0x205f, chr == 0x3000, chr == 0xa, chr == 0xd, chr == 0x2028, chr == 0x2029)) {
        n++;
        continue;
      }

      start = false;
    }

    Porffor.wasm.i32.store8(outPtr, chr, 0, 4);
  }

  out.length = len - n;

  return out;
};

export const __String_prototype_trim = (_this: string) => {
  // todo/perf: optimize and not just reuse
  return __String_prototype_trimStart(__String_prototype_trimEnd(_this));
};

export const __ByteString_prototype_trim = (_this: bytestring) => {
  // todo/perf: optimize and not just reuse
  return __ByteString_prototype_trimStart(__ByteString_prototype_trimEnd(_this));
};


export const __String_prototype_concat = (_this: string, ...vals: any[]) => {
  // todo/perf: rewrite to use memory.copy?
  let out: string = Porffor.allocate();
  out += _this;

  const valsLen: i32 = vals.length;
  for (let i: i32 = 0; i < valsLen; i++) {
    let x: any;
    Porffor.wasm`
local.get ${vals}
local.get ${i}
i32.const 9
i32.mul
i32.add
f64.load 0 4

local.get ${vals}
local.get ${i}
i32.const 9
i32.mul
i32.add
i32.load8_u 0 12

call __ecma262_ToString
local.set ${x+1}
i32.trunc_sat_f64_u
local.set ${x}`;

    out += x;
  }

  return out;
};

export const __ByteString_prototype_concat = (_this: bytestring, ...vals: any[]) => {
  // todo/perf: rewrite to use memory.copy?
  let out: string = Porffor.allocate();
  out += _this;

  const valsLen: i32 = vals.length;
  for (let i: i32 = 0; i < valsLen; i++) {
    let x: any;
    Porffor.wasm`
local.get ${vals}
local.get ${i}
i32.const 9
i32.mul
i32.add
f64.load 0 4

local.get ${vals}
local.get ${i}
i32.const 9
i32.mul
i32.add
i32.load8_u 0 12

call __ecma262_ToString
local.set ${x+1}
i32.trunc_sat_f64_u
local.set ${x}`;

    out += x;
  }

  return out;
};

export const __String_prototype_repeat = (_this: string, count: number) => {
  let out: string = Porffor.allocate();

  count |= 0;
  if (count < 0) throw new RangeError('Invalid count value');

  const thisLen: i32 = _this.length * 2;
  for (let i: i32 = 0; i < count; i++) {
    Porffor.wasm`
;; dst = out + 4 + i * thisLen
local.get ${out}
i32.const 4
i32.add
local.get ${i}
local.get ${thisLen}
i32.mul
i32.add

;; src = this + 4
local.get ${_this}
i32.const 4
i32.add

;; size = thisLen
local.get ${thisLen}

memory.copy 0 0`;
  }

  Porffor.wasm.i32.store(out, thisLen * count, 0, 0);
  return out;
};

export const __ByteString_prototype_repeat = (_this: string, count: number) => {
  let out: bytestring = Porffor.allocate();

  count |= 0;
  if (count < 0) throw new RangeError('Invalid count value');

  const thisLen: i32 = _this.length;
  for (let i: i32 = 0; i < count; i++) {
    Porffor.wasm`
;; dst = out + 4 + i * thisLen
local.get ${out}
i32.const 4
i32.add
local.get ${i}
local.get ${thisLen}
i32.mul
i32.add

;; src = this + 4
local.get ${_this}
i32.const 4
i32.add

;; size = thisLen
local.get ${thisLen}

memory.copy 0 0`;
  }

  Porffor.wasm.i32.store(out, thisLen * count, 0, 0);
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

export const __String_prototype_toLocaleString = (_this: string) => __String_prototype_toString(_this);
export const __ByteString_prototype_toLocaleString = (_this: bytestring) => __ByteString_prototype_toString(_this);

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