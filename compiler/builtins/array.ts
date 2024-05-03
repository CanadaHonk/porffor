// @porf -funsafe-no-unlikely-proto-checks

export const __Array_isArray = (x: unknown): boolean =>
  // Porffor.wasm`local.get ${x+1}` == Porffor.TYPES._array;
  Porffor.rawType(x) == Porffor.TYPES._array;

export const ___array_prototype_slice = (_this: any[], start: number, end: number) => {
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

export const ___array_prototype_indexOf = (_this: any[], searchElement: any, position: number) => {
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

export const ___array_prototype_lastIndexOf = (_this: any[], searchElement: any, position: number) => {
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

export const ___array_prototype_includes = (_this: any[], searchElement: any, position: number) => {
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

export const ___array_prototype_with = (_this: any[], index: number, value: any) => {
  const len: i32 = _this.length;
  if (index < 0) {
    index = len + index;
    if (index < 0) {
      // todo: throw RangeError: Invalid index
      return null;
    }
  }

  if (index > len) {
    // todo: throw RangeError: Invalid index
    return null;
  }

  // todo: allocator is bad here?
  let out: any[] = [];

  Porffor.clone(_this, out);

  out[index] = value;

  return out;
};