// @porf --valtype=i32
import type {} from './porffor.d.ts';

export const __Porffor_strcmp = (a: any, b: any): boolean => {
  // a and b must be string or bytestring
  // fast path: check if pointers are equal
  if (Porffor.wasm`local.get ${a}` == Porffor.wasm`local.get ${b}`) return true;

  let al: i32 = Porffor.wasm.i32.load(a, 0, 0);
  let bl: i32 = Porffor.wasm.i32.load(b, 0, 0);

  // fast path: check if lengths are inequal
  if (al != bl) return false;

  if (Porffor.wasm`local.get ${a+1}` == Porffor.TYPES.bytestring) {
    if (Porffor.wasm`local.get ${b+1}` == Porffor.TYPES.bytestring) {
      // bytestring, bytestring
      // this path is hyper-optimized as it is by far the most common and (perf) important

      let ap32: i32 = a - 28;
      let bp32: i32 = b - 28;
      let ap8: i32 = a - 4;
      let bp8: i32 = b - 4;
      Porffor.wasm`
;; load in 2 i64x2 chunks while length >= 32
local.get ${al}
i32.const 32
i32.ge_s
if 64
  loop 64
    local.get ${ap32}
    local.get ${al}
    i32.add
    v128.load 0 0

    local.get ${bp32}
    local.get ${al}
    i32.add
    v128.load 0 0
    v128.xor

    local.get ${ap32}
    local.get ${al}
    i32.add
    v128.load 0 16

    local.get ${bp32}
    local.get ${al}
    i32.add
    v128.load 0 16
    v128.xor

    v128.or
    v128.any_true
    if 64
      i32.const 0
      return
    end

    local.get ${al}
    i32.const 32
    i32.sub
    local.tee ${al}
    i32.const 32
    i32.ge_s
    br_if 0
  end
end

;; load in i64 chunks while length >= 8
local.get ${al}
i32.const 8
i32.ge_s
if 64
  loop 64
    local.get ${ap8}
    local.get ${al}
    i32.add
    i64.load 0 0

    local.get ${bp8}
    local.get ${al}
    i32.add
    i64.load 0 0

    i64.ne
    if 64
      i32.const 0
      return
    end

    local.get ${al}
    i32.const 8
    i32.sub
    local.tee ${al}
    i32.const 8
    i32.ge_s
    br_if 0
  end
end

;; load in u16 chunks while length >= 2
local.get ${al}
i32.const 2
i32.ge_s
if 64
  loop 64
    local.get ${a}
    local.get ${al}
    i32.add
    i32.load16_u 0 2

    local.get ${b}
    local.get ${al}
    i32.add
    i32.load16_u 0 2

    i32.ne
    if 64
      i32.const 0
      return
    end

    local.get ${al}
    i32.const 2
    i32.sub
    local.tee ${al}
    i32.const 2
    i32.ge_s
    br_if 0
  end
end`;

      // check bonus char if exists
      if (al == 1) {
        if (Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${a}`, 0, 4) !=
            Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${b}`, 0, 4)) return false;
      }
      return true;
    } else {
      // bytestring, string
      for (let i: i32 = 0; i < al; i++) {
        if (Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${a}` + i, 0, 4) !=
            Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${b}` + i*2, 0, 4)) return false;
      }
      return true;
    }
  } else {
    if (Porffor.wasm`local.get ${b+1}` == Porffor.TYPES.bytestring) {
      // string, bytestring
      for (let i: i32 = 0; i < al; i++) {
        if (Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${a}` + i*2, 0, 4) !=
            Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${b}` + i, 0, 4)) return false;
      }
      return true;
    } else {
      // string, string
      // change char lengths to byte lengths
      al *= 2;
      bl *= 2;

      // copied from bytestring, bytestring
      let ap32: i32 = a - 28;
      let bp32: i32 = b - 28;
      let ap8: i32 = a - 4;
      let bp8: i32 = b - 4;
      Porffor.wasm`
;; load in 2 i64x2 chunks while length >= 32
local.get ${al}
i32.const 32
i32.ge_s
if 64
  loop 64
    local.get ${ap32}
    local.get ${al}
    i32.add
    v128.load 0 0

    local.get ${bp32}
    local.get ${al}
    i32.add
    v128.load 0 0
    v128.xor

    local.get ${ap32}
    local.get ${al}
    i32.add
    v128.load 0 16

    local.get ${bp32}
    local.get ${al}
    i32.add
    v128.load 0 16
    v128.xor

    v128.or
    v128.any_true
    if 64
      i32.const 0
      return
    end

    local.get ${al}
    i32.const 32
    i32.sub
    local.tee ${al}
    i32.const 32
    i32.ge_s
    br_if 0
  end
end

;; load in i64 chunks while length >= 8
local.get ${al}
i32.const 8
i32.ge_s
if 64
  loop 64
    local.get ${ap8}
    local.get ${al}
    i32.add
    i64.load 0 0

    local.get ${bp8}
    local.get ${al}
    i32.add
    i64.load 0 0

    i64.ne
    if 64
      i32.const 0
      return
    end

    local.get ${al}
    i32.const 8
    i32.sub
    local.tee ${al}
    i32.const 8
    i32.ge_s
    br_if 0
  end
end

;; load in u16 chunks while length >= 2
local.get ${al}
i32.const 2
i32.ge_s
if 64
  loop 64
    local.get ${a}
    local.get ${al}
    i32.add
    i32.load16_u 0 2

    local.get ${b}
    local.get ${al}
    i32.add
    i32.load16_u 0 2

    i32.ne
    if 64
      i32.const 0
      return
    end

    local.get ${al}
    i32.const 2
    i32.sub
    local.tee ${al}
    i32.const 2
    i32.ge_s
    br_if 0
  end
end`;
      return true;
    }
  }
};

export const __Porffor_strcat = (a: any, b: any): any => {
  // a and b must be string or bytestring

  const al: i32 = Porffor.wasm.i32.load(a, 0, 0);
  const bl: i32 = Porffor.wasm.i32.load(b, 0, 0);

  if (Porffor.wasm`local.get ${a+1}` == Porffor.TYPES.bytestring) {
    if (Porffor.wasm`local.get ${b+1}` == Porffor.TYPES.bytestring) {
      // bytestring, bytestring
      const out: bytestring = Porffor.malloc(6 + al + bl);

      // out.length = a.length + b.length
      Porffor.wasm.i32.store(out, al + bl, 0, 0);

      // copy left (fast memcpy)
      Porffor.wasm.memory.copy(Porffor.wasm`local.get ${out}` + 4, Porffor.wasm`local.get ${a}` + 4, al, 0, 0);

      // copy right (fast memcpy)
      Porffor.wasm.memory.copy(Porffor.wasm`local.get ${out}` + 4 + al, Porffor.wasm`local.get ${b}` + 4, bl, 0, 0);

      return out;
    } else {
      // bytestring, string
      const out: string = Porffor.malloc(6 + (al + bl) * 2);

      // out.length = a.length + b.length
      Porffor.wasm.i32.store(out, al + bl, 0, 0);

      // copy left (slow bytestring -> string)
      for (let i: i32 = 0; i < al; i++) {
        Porffor.wasm.i32.store16(Porffor.wasm`local.get ${out}` + i*2, Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${a}` + i, 0, 4), 0, 4);
      }

      // copy right (fast memcpy)
      Porffor.wasm.memory.copy(Porffor.wasm`local.get ${out}` + 4 + al*2, Porffor.wasm`local.get ${b}` + 4, bl * 2, 0, 0);

      return out;
    }
  } else {
    if (Porffor.wasm`local.get ${b+1}` == Porffor.TYPES.bytestring) {
      // string, bytestring
      const out: string = Porffor.malloc(6 + (al + bl) * 2);

      // out.length = a.length + b.length
      Porffor.wasm.i32.store(out, al + bl, 0, 0);

      // copy left (fast memcpy)
      Porffor.wasm.memory.copy(Porffor.wasm`local.get ${out}` + 4, Porffor.wasm`local.get ${a}` + 4, al * 2, 0, 0);

      // copy right (slow bytestring -> string)
      let ptr: i32 = Porffor.wasm`local.get ${out}` + al*2;
      for (let i: i32 = 0; i < bl; i++) {
        Porffor.wasm.i32.store16(ptr + i*2, Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${b}` + i, 0, 4), 0, 4);
      }

      return out;
    } else {
      // string, string
      const out: string = Porffor.malloc(6 + (al + bl) * 2);

      // out.length = a.length + b.length
      Porffor.wasm.i32.store(out, al + bl, 0, 0);

      // copy left (fast memcpy)
      Porffor.wasm.memory.copy(Porffor.wasm`local.get ${out}` + 4, Porffor.wasm`local.get ${a}` + 4, al * 2, 0, 0);

      // copy right (fast memcpy)
      Porffor.wasm.memory.copy(Porffor.wasm`local.get ${out}` + 4 + al*2, Porffor.wasm`local.get ${b}` + 4, bl * 2, 0, 0);

      return out;
    }
  }
};


export const __String_prototype_at = (_this: string, index: number) => {
  const len: i32 = _this.length;

  if (index < 0) index = len + index;
  if (Porffor.fastOr(index < 0, index >= len)) return undefined;

  let out: string = Porffor.malloc(8);
  Porffor.wasm.i32.store(out, 1, 0, 0); // out.length = 1

  Porffor.wasm.i32.store16(
    Porffor.wasm`local.get ${out}`,
    Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${_this}` + index * 2, 0, 4),
    0, 4);
  return out;
};

export const __ByteString_prototype_at = (_this: bytestring, index: number) => {
  const len: i32 = _this.length;

  if (index < 0) index = len + index;
  if (Porffor.fastOr(index < 0, index >= len)) return undefined;

  let out: bytestring = Porffor.malloc(8);
  Porffor.wasm.i32.store(out, 1, 0, 0); // out.length = 1

  Porffor.wasm.i32.store8(
    Porffor.wasm`local.get ${out}`,
    Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${_this}` + index, 0, 4),
    0, 4);
  return out;
};

export const __String_prototype_charAt = (_this: string, index: number) => {
  const len: i32 = _this.length;

  if (Porffor.fastOr(index < 0, index >= len)) return '';

  let out: string = Porffor.malloc(8);
  Porffor.wasm.i32.store(out, 1, 0, 0); // out.length = 1

  Porffor.wasm.i32.store16(
    Porffor.wasm`local.get ${out}`,
    Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${_this}` + index * 2, 0, 4),
    0, 4);
  return out;
};

export const __ByteString_prototype_charAt = (_this: bytestring, index: number) => {
  const len: i32 = _this.length;

  if (Porffor.fastOr(index < 0, index >= len)) return '';

  let out: bytestring = Porffor.malloc(8);
  Porffor.wasm.i32.store(out, 1, 0, 0); // out.length = 1

  Porffor.wasm.i32.store8(
    Porffor.wasm`local.get ${out}`,
    Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${_this}` + index, 0, 4),
    0, 4);
  return out;
};

export const __String_prototype_toUpperCase = (_this: string) => {
  // todo: unicode not just ascii
  const len: i32 = _this.length;

  let out: string = Porffor.malloc();
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

  let out: bytestring = Porffor.malloc();
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

  let out: string = Porffor.malloc();
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

  let out: bytestring = Porffor.malloc();
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

export const __String_prototype_toLocaleUpperCase = (_this: string) => __String_prototype_toUpperCase(_this);
export const __ByteString_prototype_toLocaleUpperCase = (_this: bytestring) => __ByteString_prototype_toLowerCase(_this);
export const __String_prototype_toLocaleLowerCase = (_this: string) => __String_prototype_toUpperCase(_this);
export const __ByteString_prototype_toLocaleLowerCase = (_this: bytestring) => __ByteString_prototype_toLowerCase(_this);

export const __String_prototype_codePointAt = (_this: string, index: number) => {
  const len: i32 = _this.length;

  if (Porffor.fastOr(index < 0, index >= len)) return undefined;

  index *= 2;
  const c1: i32 = Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${_this}` + index, 0, 4);
  if (Porffor.fastAnd(c1 >= 0xD800, c1 <= 0xDBFF)) {
    // 1st char is leading surrogate, handle 2nd char
    // check oob
    if (index + 1 >= len) return c1;

    const c2: i32 = Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${_this}` + index + 2, 0, 4);
    if (Porffor.fastAnd(c2 >= 0xDC00, c2 <= 0xDFFF)) {
      // 2nd char is trailing surrogate, return code point
      return (c1 << 10) + c2 - 56613888;
    }
  }

  return c1;
};

export const __ByteString_prototype_codePointAt = (_this: bytestring, index: number) => {
  const len: i32 = _this.length;

  if (Porffor.fastOr(index < 0, index >= len)) return undefined;

  // bytestrings cannot have surrogates, so just do charCodeAt
  return Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${_this}` + index, 0, 4);
};

export const __String_prototype_startsWith = (_this: string, searchString: string, position: number = 0) => {
  // todo: handle bytestring searchString

  // todo/perf: investigate whether for counter vs while ++s are faster
  // todo: handle when searchString is bytestring

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
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

export const __ByteString_prototype_startsWith = (_this: bytestring, searchString: bytestring, position: number = 0) => {
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


export const __String_prototype_endsWith = (_this: string, searchString: string, endPosition: any = undefined) => {
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

export const __ByteString_prototype_endsWith = (_this: bytestring, searchString: bytestring, endPosition: any = undefined) => {
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


export const __String_prototype_indexOf = (_this: string, searchString: any, position: any = 0) => {
  searchString = ecma262.ToString(searchString);
  if (Porffor.wasm`local.get ${searchString+1}` == Porffor.TYPES.bytestring) {
    searchString = Porffor.bytestringToString(searchString);
  }
  position = ecma262.ToIntegerOrInfinity(position);

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  const searchLenX2: i32 = searchString.length * 2;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
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

export const __ByteString_prototype_indexOf = (_this: bytestring, searchString: any, position: any = 0) => {
  searchString = ecma262.ToString(searchString);
  if (Porffor.wasm`local.get ${searchString+1}` != Porffor.TYPES.bytestring) {
    return __String_prototype_indexOf(Porffor.bytestringToString(_this), searchString, position);
  }
  position = ecma262.ToIntegerOrInfinity(position);

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  const searchLen: i32 = searchString.length;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
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


export const __String_prototype_lastIndexOf = (_this: string, searchString: any, position: any = undefined) => {
  searchString = ecma262.ToString(searchString);
  if (Porffor.wasm`local.get ${searchString+1}` == Porffor.TYPES.bytestring) {
    searchString = Porffor.bytestringToString(searchString);
  }

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

export const __ByteString_prototype_lastIndexOf = (_this: bytestring, searchString: any, position: any = undefined) => {
  searchString = ecma262.ToString(searchString);
  if (Porffor.wasm`local.get ${searchString+1}` != Porffor.TYPES.bytestring) {
    return __String_prototype_lastIndexOf(Porffor.bytestringToString(_this), searchString, position);
  }

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


export const __String_prototype_includes = (_this: string, searchString: string, position: number = 0) => {
  // todo: handle bytestring searchString

  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  const searchLenX2: i32 = searchString.length * 2;

  // todo/perf: make position oob handling optional (via pref or fast variant?)
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
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

export const __ByteString_prototype_includes = (_this: bytestring, searchString: bytestring, position: number = 0) => {
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


export const __String_prototype_padStart = (_this: string, targetLength: number, padString: any = undefined) => {
  let out: string = Porffor.malloc();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const len: i32 = _this.length;
  const todo: i32 = targetLength - len;
  if (todo > 0) {
    if (Porffor.wasm`local.get ${padString+1}` == Porffor.TYPES.undefined) {
      for (let i: i32 = 0; i < todo; i++) {
        Porffor.wasm.i32.store16(outPtr, 32, 0, 4);
        outPtr += 2;
      }

      out.length = targetLength;
    } else {
      // Convert padString to string if not already
      padString = ecma262.ToString(padString);
      // Convert bytestring to string since we use UTF-16 memory access
      if (Porffor.wasm`local.get ${padString+1}` == Porffor.TYPES.bytestring) {
        padString = Porffor.bytestringToString(padString);
      }
      const padStringLen: i32 = padString.length;
      if (padStringLen > 0) {
        for (let i: i32 = 0; i < todo; i++) {
          Porffor.wasm.i32.store16(outPtr, Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${padString}` + (i % padStringLen) * 2, 0, 4), 0, 4);
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

export const __ByteString_prototype_padStart = (_this: bytestring, targetLength: number, padString: any = undefined) => {
  let out: bytestring = Porffor.malloc();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const len: i32 = _this.length;
  const todo: i32 = targetLength - len;
  if (todo > 0) {
    if (Porffor.wasm`local.get ${padString+1}` == Porffor.TYPES.undefined) {
      for (let i: i32 = 0; i < todo; i++) {
        Porffor.wasm.i32.store8(outPtr++, 32, 0, 4);
      }

      out.length = targetLength;
    } else {
      // Convert padString to string if not already
      padString = ecma262.ToString(padString);
      // If padString is non-bytestring, delegate to String version
      if (Porffor.wasm`local.get ${padString+1}` != Porffor.TYPES.bytestring) {
        return __String_prototype_padStart(Porffor.bytestringToString(_this), targetLength, padString);
      }
      const padStringLen: i32 = padString.length;
      if (padStringLen > 0) {
        for (let i: i32 = 0; i < todo; i++) {
          Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${padString}` + (i % padStringLen), 0, 4), 0, 4);
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


export const __String_prototype_padEnd = (_this: string, targetLength: number, padString: any = undefined) => {
  let out: string = Porffor.malloc();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const len: i32 = _this.length;

  const thisPtrEnd: i32 = thisPtr + len * 2;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.i32.store16(outPtr, Porffor.wasm.i32.load16_u(thisPtr, 0, 4), 0, 4);

    thisPtr += 2;
    outPtr += 2;
  }

  const todo: i32 = targetLength - len;
  if (todo > 0) {
    if (Porffor.wasm`local.get ${padString+1}` == Porffor.TYPES.undefined) {
      for (let i: i32 = 0; i < todo; i++) {
        Porffor.wasm.i32.store16(outPtr, 32, 0, 4);
        outPtr += 2;
      }

      out.length = targetLength;
    } else {
      // Convert padString to string if not already
      padString = ecma262.ToString(padString);
      // Convert bytestring to string since we use UTF-16 memory access
      if (Porffor.wasm`local.get ${padString+1}` == Porffor.TYPES.bytestring) {
        padString = Porffor.bytestringToString(padString);
      }
      const padStringLen: i32 = padString.length;
      if (padStringLen > 0) {
        for (let i: i32 = 0; i < todo; i++) {
          Porffor.wasm.i32.store16(outPtr, Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${padString}` + (i % padStringLen) * 2, 0, 4), 0, 4);
          outPtr += 2;
        }
        out.length = targetLength;
      } else out.length = len;
    }
  } else out.length = len;
  return out;
};

export const __ByteString_prototype_padEnd = (_this: bytestring, targetLength: number, padString: any = undefined) => {
  let out: bytestring = Porffor.malloc();

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const len: i32 = _this.length;

  const thisPtrEnd: i32 = thisPtr + len;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(thisPtr++, 0, 4), 0, 4);
  }

  const todo: i32 = targetLength - len;
  if (todo > 0) {
    if (Porffor.wasm`local.get ${padString+1}` == Porffor.TYPES.undefined) {
      for (let i: i32 = 0; i < todo; i++) {
        Porffor.wasm.i32.store8(outPtr++, 32, 0, 4);
      }

      out.length = targetLength;
    } else {
      // Convert padString to string if not already
      padString = ecma262.ToString(padString);
      // If padString is non-bytestring, delegate to String version
      if (Porffor.wasm`local.get ${padString+1}` != Porffor.TYPES.bytestring) {
        return __String_prototype_padEnd(Porffor.bytestringToString(_this), targetLength, padString);
      }
      const padStringLen: i32 = padString.length;
      if (padStringLen > 0) {
        for (let i: i32 = 0; i < todo; i++) {
          Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${padString}` + (i % padStringLen), 0, 4), 0, 4);
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


  if (start < 0) start = 0;
  if (start > len) start = len;
  if (end < 0) end = 0;
  if (end > len) end = len;

  let out: string = Porffor.malloc();

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


  if (start < 0) start = 0;
  if (start > len) start = len;
  if (end < 0) end = 0;
  if (end > len) end = len;

  let out: bytestring = Porffor.malloc();

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
  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }

  if (Porffor.wasm`local.get ${length+1}` == Porffor.TYPES.undefined) length = len - start;
  if (start + length > len) length = len - start;

  let out: string = Porffor.malloc();

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

export const __ByteString_prototype_substr = (_this: bytestring, start: number, length: number) => {
  const len: i32 = _this.length;
  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }

  if (Porffor.wasm`local.get ${length+1}` == Porffor.TYPES.undefined) length = len - start;
  if (start + length > len) length = len - start;

  let out: bytestring = Porffor.malloc();

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

  let out: string = Porffor.malloc();

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

  let out: bytestring = Porffor.malloc();

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
  let out: string = Porffor.malloc();

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
  let out: bytestring = Porffor.malloc();

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
  let out: string = Porffor.malloc();

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
  let out: bytestring = Porffor.malloc();

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
  let out: any = Porffor.malloc();
  Porffor.clone(_this, out);

  // copy _this type to out
  Porffor.wasm`
local.get ${_this+1}
local.set ${out+1}`;

  const valsLen: i32 = vals.length;
  for (let i: i32 = 0; i < valsLen; i++) {
    Porffor.wasm`
local.get ${out}
f64.convert_i32_u
local.get ${out+1}

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

call __Porffor_concatStrings
local.set ${out+1}
i32.trunc_sat_f64_u
local.set ${out}`;
  }

  return out;
};

export const __ByteString_prototype_concat = (_this: bytestring, ...vals: any[]) => {
  let out: any = Porffor.malloc();
  Porffor.clone(_this, out);

  // copy _this type to out
  Porffor.wasm`
local.get ${_this+1}
local.set ${out+1}`;

  const valsLen: i32 = vals.length;
  for (let i: i32 = 0; i < valsLen; i++) {
    Porffor.wasm`
local.get ${out}
f64.convert_i32_u
local.get ${out+1}

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

call __Porffor_concatStrings
local.set ${out+1}
i32.trunc_sat_f64_u
local.set ${out}`;
  }

  return out;
};

export const __String_prototype_repeat = (_this: string, cnt: any) => {
  const count: number = ecma262.ToIntegerOrInfinity(cnt);
  if (count < 0) throw new RangeError('Invalid count value');

  let out: string = Porffor.malloc();
  const thisLen: i32 = _this.length * 2;
  if (thisLen == 0) return '';

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

export const __ByteString_prototype_repeat = (_this: bytestring, cnt: any) => {
  const count: number = ecma262.ToIntegerOrInfinity(cnt);
  if (count < 0) throw new RangeError('Invalid count value');

  let out: bytestring = Porffor.malloc();
  const thisLen: i32 = _this.length;
  if (thisLen == 0) return '';

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


export const __String_prototype_split = (_this: string, separator: any, limit: any) => {
  let out: any[] = Porffor.malloc(), outLen: i32 = 0;

  if (Porffor.wasm`local.get ${limit+1}` == Porffor.TYPES.undefined) limit = Number.MAX_SAFE_INTEGER;
  if (limit < 0) limit = Number.MAX_SAFE_INTEGER;
  if (limit == 0) {
    out.length = 0;
    return out;
  }

  if (Porffor.wasm`local.get ${separator+1}` == Porffor.TYPES.undefined) {
    out.length = 1;
    // out[0] = _this; (but in wasm as it is a f64 array and we are in i32 space)
    Porffor.wasm`
local.get ${out}
local.get ${_this}
f64.convert_i32_u
f64.store 0 4

local.get ${out}
i32.const 67
i32.store8 0 12`;
    return out;
  }

  separator = ecma262.ToString(separator);

  let tmp: string = Porffor.malloc(), tmpLen: i32 = 0;
  const thisLen: i32 = _this.length * 2, sepLen: i32 = separator.length;
  if (sepLen == 1) {
    // fast path: single char separator
    const sepChar: i32 = separator.charCodeAt(0);
    for (let i: i32 = 0; i < thisLen; i += 2) {
      const x: i32 = Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${_this}` + i, 0, 4);

      if (x == sepChar) {
        if (outLen >= limit) {
          out.length = outLen;
          return out;
        }

        tmp.length = tmpLen;
        Porffor.wasm`
local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
local.get ${tmp}
f64.convert_i32_u
f64.store 0 4

local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
i32.const 67
i32.store8 0 12`;
        outLen++;

        tmp = Porffor.malloc();
        tmpLen = 0;
        continue;
      }

      Porffor.wasm.i32.store16(Porffor.wasm`local.get ${tmp}` + tmpLen * 2, x, 0, 4);
      tmpLen++;
    }
  } else if (sepLen == 0) {
    tmpLen = 1;
    let produced: i32 = 0;
    for (let i = 0; i < thisLen && produced < limit; i += 2) {
      tmp = Porffor.malloc(8);
      const x: i32 = Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${_this}` + i, 0, 4);

      Porffor.wasm.i32.store16(Porffor.wasm`local.get ${tmp}`, x, 0, 4);
      tmp.length = tmpLen;
      out.length = outLen;

Porffor.wasm`
local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
local.get ${tmp}
f64.convert_i32_u
f64.store 0 4
local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
i32.const 67
i32.store8 0 12`;
      outLen++;
      produced++;
    }
    return out;
  } else {
    let sepInd: i32 = 0;
    for (let i: i32 = 0; i < thisLen; i += 2) {
      const x: i32 = Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${_this}` + i, 0, 4);

      if (x == separator.charCodeAt(sepInd)) {
        if (++sepInd == sepLen) {
          if (outLen >= limit) {
            out.length = outLen;
            return out;
          }

          tmp.length = tmpLen - (sepLen - 1);
          Porffor.wasm`
local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
local.get ${tmp}
f64.convert_i32_u
f64.store 0 4

local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
i32.const 67
i32.store8 0 12`;
          outLen++;

          tmp = Porffor.malloc();
          tmpLen = 0;
          continue;
        }
      } else sepInd = 0;

      Porffor.wasm.i32.store16(Porffor.wasm`local.get ${tmp}` + tmpLen * 2, x, 0, 4);
      tmpLen++;
    }
  }

  if (outLen < limit) {
    // per spec, push final (possibly empty) segment unless limited
    tmp.length = tmpLen;
    Porffor.wasm`
local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
local.get ${tmp}
f64.convert_i32_u
f64.store 0 4

local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
i32.const 67
i32.store8 0 12`;
    outLen++;
  }

  out.length = outLen;
  return out;
};

export const __ByteString_prototype_split = (_this: bytestring, separator: any, limit: any) => {
  let out: any[] = Porffor.malloc(), outLen: i32 = 0;

  if (Porffor.wasm`local.get ${limit+1}` == Porffor.TYPES.undefined) limit = Number.MAX_SAFE_INTEGER;
  if (limit < 0) limit = Number.MAX_SAFE_INTEGER;
  if (limit == 0) {
    out.length = 0;
    return out;
  }

  if (Porffor.wasm`local.get ${separator+1}` == Porffor.TYPES.undefined) {
    out.length = 1;
    // out[0] = _this; (but in wasm as it is a f64 array and we are in i32 space)
    Porffor.wasm`
local.get ${out}
local.get ${_this}
f64.convert_i32_u
f64.store 0 4

local.get ${out}
i32.const 195
i32.store8 0 12`;
    return out;
  }

  separator = ecma262.ToString(separator);

  let tmp: bytestring = Porffor.malloc(), tmpLen: i32 = 0;
  const thisLen: i32 = _this.length, sepLen: i32 = separator.length;
  if (sepLen == 1) {
    // fast path: single char separator
    const sepChar: i32 = separator.charCodeAt(0);
    for (let i: i32 = 0; i < thisLen; i++) {
      const x: i32 = Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${_this}` + i, 0, 4);

      if (x == sepChar) {
        if (outLen >= limit) {
          out.length = outLen;
          return out;
        }

        tmp.length = tmpLen;
        Porffor.wasm`
local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
local.get ${tmp}
f64.convert_i32_u
f64.store 0 4

local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
i32.const 195
i32.store8 0 12`;
        outLen++;

        tmp = Porffor.malloc();
        tmpLen = 0;
        continue;
      }

      Porffor.wasm.i32.store8(Porffor.wasm`local.get ${tmp}` + tmpLen, x, 0, 4);
      tmpLen++;
    }
  } else if (sepLen == 0) {
    tmpLen = 1;
    let produced: i32 = 0;
    for (let i = 0; i < thisLen && produced < limit; i++) {
      tmp = Porffor.malloc(8);
      const x: i32 = Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${_this}` + i, 0, 4);

      Porffor.wasm.i32.store8(Porffor.wasm`local.get ${tmp}`, x, 0, 4);
      tmp.length = tmpLen;
      out.length = outLen;

Porffor.wasm`
local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
local.get ${tmp}
f64.convert_i32_u
f64.store 0 4

local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
i32.const 195
i32.store8 0 12`;
      outLen++;
      produced++;
    }
    return out;
  } else {
    let sepInd: i32 = 0;
    for (let i: i32 = 0; i < thisLen; i++) {
      const x: i32 = Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${_this}` + i, 0, 4);

      if (x == separator.charCodeAt(sepInd)) {
        if (++sepInd == sepLen) {
          if (outLen >= limit) {
            out.length = outLen;
            return out;
          }

          tmp.length = tmpLen - (sepLen - 1);
          Porffor.wasm`
local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
local.get ${tmp}
f64.convert_i32_u
f64.store 0 4

local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
i32.const 195
i32.store8 0 12`;
          outLen++;

          tmp = Porffor.malloc();
          tmpLen = 0;
          continue;
        }
      } else sepInd = 0;

      Porffor.wasm.i32.store8(Porffor.wasm`local.get ${tmp}` + tmpLen, x, 0, 4);
      tmpLen++;
    }
  }

  if (outLen < limit) {
    tmp.length = tmpLen;
    Porffor.wasm`
local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
local.get ${tmp}
f64.convert_i32_u
f64.store 0 4

local.get ${out}
local.get ${outLen}
i32.const 9
i32.mul
i32.add
i32.const 195
i32.store8 0 12`;
    outLen++;
  }

  out.length = outLen;
  return out;
};


export const __String_prototype_localeCompare = (_this: string, compareString: any) => {
  compareString = ecma262.ToString(compareString);

  const thisLen: i32 = _this.length;
  const compareLen: i32 = compareString.length;
  const maxLen: i32 = thisLen > compareLen ? thisLen : compareLen;

  for (let i: i32 = 0; i < maxLen; i++) {
    const a: i32 = _this.charCodeAt(i);
    const b: i32 = compareString.charCodeAt(i);

    if (a > b) return 1;
    if (b > a) return -1;
  }

  if (thisLen > compareLen) return 1;
  if (compareLen > thisLen) return -1;

  return 0;
};

export const __ByteString_prototype_localeCompare = (_this: bytestring, compareString: any) => {
  compareString = ecma262.ToString(compareString);

  const thisLen: i32 = _this.length;
  const compareLen: i32 = compareString.length;
  const maxLen: i32 = thisLen > compareLen ? thisLen : compareLen;

  for (let i: i32 = 0; i < maxLen; i++) {
    const a: i32 = _this.charCodeAt(i);
    const b: i32 = compareString.charCodeAt(i);

    if (a > b) return 1;
    if (b > a) return -1;
  }

  if (thisLen > compareLen) return 1;
  if (compareLen > thisLen) return -1;

  return 0;
};


export const __String_prototype_isWellFormed = (_this: string) => {
  let ptr: i32 = Porffor.wasm`local.get ${_this}`;
  const endPtr: i32 = ptr + _this.length * 2;
  while (ptr < endPtr) {
    const c1: i32 = Porffor.wasm.i32.load16_u(ptr, 0, 4);

    if (Porffor.fastAnd(c1 >= 0xDC00, c1 <= 0xDFFF)) {
      // lone trailing surrogate, bad
      return false;
    }

    if (Porffor.fastAnd(c1 >= 0xD800, c1 <= 0xDBFF)) {
      // leading surrogate, peek if next is trailing
      const c2: i32 = ptr + 2 < endPtr ? Porffor.wasm.i32.load16_u(ptr + 2, 0, 4) : 0;

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

export const __ByteString_prototype_isWellFormed = (_this: bytestring) => {
  // bytestrings cannot have surrogates, so always true
  return true;
};

export const __String_prototype_toWellFormed = (_this: string) => {
  let out: string = Porffor.malloc();
  Porffor.clone(_this, out);

  let ptr: i32 = Porffor.wasm`local.get ${out}`;
  const endPtr: i32 = ptr + out.length * 2;
  while (ptr < endPtr) {
    const c1: i32 = Porffor.wasm.i32.load16_u(ptr, 0, 4);

    if (Porffor.fastAnd(c1 >= 0xDC00, c1 <= 0xDFFF)) {
      // lone trailing surrogate, bad
      Porffor.wasm.i32.store16(ptr, 0xFFFD, 0, 4);
    }

    if (Porffor.fastAnd(c1 >= 0xD800, c1 <= 0xDBFF)) {
      // leading surrogate, peek if next is trailing
      const c2: i32 = ptr + 2 < endPtr ? Porffor.wasm.i32.load16_u(ptr + 2, 0, 4) : 0;

      if (Porffor.fastAnd(c2 >= 0xDC00, c2 <= 0xDFFF)) {
        // next is trailing surrogate, skip it too
        ptr += 2;
      } else {
        // lone leading surrogate, bad
        Porffor.wasm.i32.store16(ptr, 0xFFFD, 0, 4);
      }
    }

    ptr += 2;
  }

  return out;
};

export const __ByteString_prototype_toWellFormed = (_this: bytestring) => {
  // bytestrings cannot have surrogates, so just copy
  let out: bytestring = Porffor.malloc();
  Porffor.clone(_this, out);
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