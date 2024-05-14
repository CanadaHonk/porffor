// @porf --funsafe-no-unlikely-proto-checks

export const __Array_isArray = (x: unknown): boolean =>
  // Porffor.wasm`local.get ${x+1}` == Porffor.TYPES.array;
  Porffor.rawType(x) == Porffor.TYPES.array;

export const __Array_prototype_slice = (_this: any[], start: number, end: number) => {
  const len: i32 = _this.length;
  if (Porffor.rawType(end) == Porffor.TYPES.undefined) end = len;

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

  let out: any[] = [];

  if (start > end) return out;

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const thisPtrEnd: i32 = thisPtr + end * 8;

  thisPtr += start * 8;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.f64.store(outPtr, Porffor.wasm.f64.load(thisPtr, 0, 4), 0, 4);
    thisPtr += 8;
    outPtr += 8;
  }

  out.length = end - start;

  return out;
};

export const __Array_prototype_indexOf = (_this: any[], searchElement: any, position: number) => {
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
      else position |= 0;
  } else position = 0;

  for (let i: i32 = position; i < len; i++) {
    if (_this[i] == searchElement) return i;
  }

  return -1;
};

export const __Array_prototype_lastIndexOf = (_this: any[], searchElement: any, position: number) => {
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
      else position |= 0;
  } else position = 0;

  for (let i: i32 = len - 1; i >= position; i--) {
    if (_this[i] == searchElement) return i;
  }

  return -1;
};

export const __Array_prototype_includes = (_this: any[], searchElement: any, position: number) => {
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
      else position |= 0;
  } else position = 0;

  for (let i: i32 = position; i < len; i++) {
    if (_this[i] == searchElement) return true;
  }

  return false;
};

export const __Array_prototype_with = (_this: any[], index: number, value: any) => {
  const len: i32 = _this.length;
  if (index < 0) {
    index = len + index;
    if (index < 0) {
      throw new RangeError('Invalid index');
    }
  }

  if (index > len) {
    throw new RangeError('Invalid index');
  }

  // todo: allocator is bad here?
  let out: any[] = [];

  Porffor.clone(_this, out);

  out[index] = value;

  return out;
};

export const __Array_prototype_reverse = (_this: any[]) => {
  const len: i32 = _this.length;

  let start: i32 = 0;
  let end: i32 = len - 1;

  while (start < end) {
    const tmp: i32 = _this[start];
    _this[start++] = _this[end];
    _this[end--] = tmp;
  }

  return _this;
};

// todo: this has memory/allocation bugs so sometimes crashes :(
export const __Array_prototype_toReversed = (_this: any[]) => {
  const len: i32 = _this.length;

  let start: i32 = 0;
  let end: i32 = len - 1;

  let out: any[] = [];
  out.length = len;

  while (start < end) {
    out[start] = _this[end];
    out[end--] = _this[start++];
  }

  return out;
};

export const __Array_prototype_valueOf = (_this: any[]) => {
  return _this;
};