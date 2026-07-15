import type {} from './porffor.d.ts';

export const __ArrayBuffer_isView = (value: any): boolean => {
  return Porffor.fastOr(
    Porffor.type(value) == Porffor.TYPES.dataview,
    Porffor.fastAnd(Porffor.type(value) >= Porffor.TYPES.uint8clampedarray, Porffor.type(value) <= Porffor.TYPES.float64array)
  );
};

export const __Porffor_arraybuffer_detach = (buffer: any): void => {
  // mark as detached by setting length = "-1"
  Porffor.IR.storeI32(buffer, 0, 4294967295);
};

export const ArrayBuffer = function (length: any): ArrayBuffer {
  // 1. If NewTarget is undefined, throw a TypeError exception.
  if (!new.target) throw new TypeError("Constructor ArrayBuffer requires 'new'");

  // 2. Let byteLength be ? ToIndex(length).
  const byteLength: number = ecma262.ToIndex(length);

  if (byteLength < 0) throw new RangeError('Invalid ArrayBuffer length (negative)');
  if (byteLength > 2147483643) throw new RangeError('Invalid ArrayBuffer length (over maximum supported length)');

  const out: ArrayBuffer = Porffor.malloc(byteLength + 4);
  Porffor.IR.storeI32(out, 0, byteLength);
  Porffor.IR.fill(Porffor.IR.ptr(out) + 4, 0, byteLength);

  return out;
};

export const __ArrayBuffer_prototype_byteLength$get = function (this: ArrayBuffer) {
  const read: i32 = Porffor.IR.loadI32(this, 0);
  return read >= 0 ? read : 0;
};

export const __ArrayBuffer_prototype_maxByteLength$get = function (this: ArrayBuffer) {
  const read: i32 = Porffor.IR.loadI32(this, 0);
  return read >= 0 ? read : 0;
};

export const __ArrayBuffer_prototype_detached$get = function (this: ArrayBuffer) {
  return Porffor.IR.loadI32(this, 0) == 4294967295;
};

export const __ArrayBuffer_prototype_resizable$get = function (this: ArrayBuffer) {
  return false;
};

export const __ArrayBuffer_prototype_slice = function (this: ArrayBuffer, start: any, end: any) {
  if (this.detached) throw new TypeError('Called ArrayBuffer.prototype.slice on a detached ArrayBuffer');

  const len: i32 = Porffor.IR.loadI32(this, 0);
  if (Porffor.type(end) == Porffor.TYPES.undefined) end = len;

  start = ecma262.ToIntegerOrInfinity(start);
  end = ecma262.ToIntegerOrInfinity(end);

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

  const out: ArrayBuffer = Porffor.malloc(4 + (end - start));
  Porffor.IR.storeI32(out, 0, end - start);

  Porffor.IR.copy(Porffor.IR.ptr(out) + 4, Porffor.IR.ptr(this) + 4 + start, end - start);

  return out;
};


export const __ArrayBuffer_prototype_transfer = function (this: ArrayBuffer, newLength: any) {
  if (this.detached) throw new TypeError('Called ArrayBuffer.prototype.transfer on a detached ArrayBuffer');

  const len: i32 = Porffor.IR.loadI32(this, 0);
  if (Porffor.type(newLength) == Porffor.TYPES.undefined) newLength = len;

  // make new arraybuffer
  const out: ArrayBuffer = new ArrayBuffer(newLength);
  Porffor.IR.storeI32(out, 0, newLength);

  Porffor.IR.copy(Porffor.IR.ptr(out) + 4, Porffor.IR.ptr(this) + 4, Math.min(newLength, len));

  __Porffor_arraybuffer_detach(this);

  return out;
};

export const __ArrayBuffer_prototype_transferToFixedLength = function (this: ArrayBuffer, newLength: any) { return Porffor.callThis(__ArrayBuffer_prototype_transfer, this, newLength); };

export const __ArrayBuffer_prototype_resize = function (this: ArrayBuffer, newLength: any) {
  // todo: resizable not implemented yet so just always fail
  throw new TypeError('Called ArrayBuffer.prototype.resize on a non-resizable ArrayBuffer');
};


export const SharedArrayBuffer = function (length: any): SharedArrayBuffer {
  // 1. If NewTarget is undefined, throw a TypeError exception.
  if (!new.target) throw new TypeError("Constructor SharedArrayBuffer requires 'new'");

  // 2. Let byteLength be ? ToIndex(length).
  const byteLength: number = ecma262.ToIndex(length);

  if (byteLength < 0) throw new RangeError('Invalid SharedArrayBuffer length (negative)');
  if (byteLength > 2147483643) throw new RangeError('Invalid SharedArrayBuffer length (over maximum supported length)');

  const out: SharedArrayBuffer = Porffor.malloc(byteLength + 4);
  Porffor.IR.storeI32(out, 0, byteLength);
  Porffor.IR.fill(Porffor.IR.ptr(out) + 4, 0, byteLength);

  return out;
};

export const __SharedArrayBuffer_prototype_byteLength$get = function (this: SharedArrayBuffer) {
  return Porffor.IR.loadI32(this, 0);
};

export const __SharedArrayBuffer_prototype_maxByteLength$get = function (this: SharedArrayBuffer) {
  return Porffor.IR.loadI32(this, 0);
};

export const __SharedArrayBuffer_prototype_growable$get = function (this: SharedArrayBuffer) {
  return false;
};


export const __SharedArrayBuffer_prototype_slice = function (this: SharedArrayBuffer, start: any, end: any) {
  const len: i32 = Porffor.IR.loadI32(this, 0);
  if (Porffor.type(end) == Porffor.TYPES.undefined) end = len;

  start = ecma262.ToIntegerOrInfinity(start);
  end = ecma262.ToIntegerOrInfinity(end);

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

  const out: SharedArrayBuffer = Porffor.malloc(4 + (end - start));
  Porffor.IR.storeI32(out, 0, end - start);

  Porffor.IR.copy(Porffor.IR.ptr(out) + 4, Porffor.IR.ptr(this) + 4 + start, end - start);

  return out;
};

export const __SharedArrayBuffer_prototype_grow = function (this: SharedArrayBuffer, newLength: any) {
  // todo: growable not implemented yet so just always fail
  throw new TypeError('Called SharedArrayBuffer.prototype.grow on a non-growable SharedArrayBuffer');
};
