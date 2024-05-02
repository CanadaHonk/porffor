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