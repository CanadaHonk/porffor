import type {} from './porffor.d.ts';

// arraybuffer layout: byteLength (i32, -1 if detached), flags (i32), data
// flags: maxByteLength in the low 31 bits (0x7fffffff if fixed length, 0x7ffffffe if immutable), shared in the top bit
// resizable buffers allocate maxByteLength upfront so views never move

export const __ArrayBuffer_isView = (value: any): boolean => {
  return Porffor.fastOr(
    Porffor.type(value) == Porffor.TYPES.dataview,
    Porffor.fastAnd(Porffor.type(value) >= Porffor.TYPES.uint8clampedarray, Porffor.type(value) <= Porffor.TYPES.float64array)
  );
};

export const __Porffor_arraybuffer_detach = (buffer: any): void => {
  if (__Porffor_arraybuffer_isImmutable(Porffor.IR.ptr(buffer))) throw new TypeError('Cannot detach an immutable ArrayBuffer');

  // mark as detached by setting length = "-1"
  Porffor.IR.storeI32(buffer, 0, 4294967295);
};

export const __Porffor_arraybuffer_maxOption = (options: any): number => {
  if (!__Porffor_object_isObject(options)) return -1;

  const maxByteLength: any = options.maxByteLength;
  if (Porffor.type(maxByteLength) == Porffor.TYPES.undefined) return -1;
  return ecma262.ToIndex(maxByteLength);
};

export const __Porffor_arraybuffer_maxByteLength = (buffer: i32): i32 => {
  const max: i32 = Porffor.IR.loadI32(buffer, 4) & 0x7fffffff;
  return max >= 0x7ffffffe ? -1 : max;
};

export const __Porffor_arraybuffer_isImmutable = (buffer: i32): boolean => (Porffor.IR.loadI32(buffer, 4) & 0x7fffffff) == 0x7ffffffe;

export const __Porffor_arraybuffer_isShared = (buffer: i32): boolean => Porffor.IR.loadI32(buffer, 4) < 0;

// maxByteLength -1 for fixed length, -2 for immutable
export const __Porffor_arraybuffer_alloc = (byteLength: number, maxByteLength: number, shared: boolean): i32 => {
  if (Porffor.fastAnd(maxByteLength >= 0, byteLength > maxByteLength)) throw new RangeError('Invalid ArrayBuffer length (over maxByteLength)');

  const capacity: number = maxByteLength >= 0 ? maxByteLength : byteLength;
  const max: i32 = maxByteLength >= 0 ? maxByteLength : (maxByteLength == -2 ? 0x7ffffffe : 0x7fffffff);
  if (capacity > 2147483639) throw new RangeError('Invalid ArrayBuffer length (over maximum supported length)');

  const out: i32 = Porffor.malloc(capacity + 8);
  Porffor.IR.storeI32(out, 0, byteLength);
  Porffor.IR.storeI32(out, 4, max | (shared ? 0x80000000 : 0));
  Porffor.IR.fill(out + 8, 0, capacity);
  return out;
};

export const __Porffor_arraybuffer_setLength = (buffer: i32, newLength: i32): void => {
  const len: i32 = Porffor.IR.loadI32(buffer, 0);
  if (newLength > len) Porffor.IR.fill(buffer + 8 + len, 0, newLength - len);
  Porffor.IR.storeI32(buffer, 0, newLength);
};

export const ArrayBuffer = function (length: any, options: any = undefined): ArrayBuffer {
  // 1. If NewTarget is undefined, throw a TypeError exception.
  if (!new.target) throw new TypeError("Constructor ArrayBuffer requires 'new'");

  // 2. Let byteLength be ? ToIndex(length).
  const byteLength: number = ecma262.ToIndex(length);

  // 3. Let requestedMaxByteLength be ? GetArrayBufferMaxByteLengthOption(options).
  const maxByteLength: number = __Porffor_arraybuffer_maxOption(options);

  return __Porffor_arraybuffer_alloc(byteLength, maxByteLength, false) as ArrayBuffer;
};

export const __ArrayBuffer_prototype_byteLength$get = function (this: ArrayBuffer) {
  const read: i32 = Porffor.IR.loadI32(this, 0);
  return read >= 0 ? read : 0;
};

export const __ArrayBuffer_prototype_maxByteLength$get = function (this: ArrayBuffer) {
  const read: i32 = Porffor.IR.loadI32(this, 0);
  if (read < 0) return 0;

  const max: i32 = __Porffor_arraybuffer_maxByteLength(Porffor.IR.ptr(this));
  return max >= 0 ? max : read;
};

export const __ArrayBuffer_prototype_detached$get = function (this: ArrayBuffer) {
  return Porffor.IR.loadI32(this, 0) < 0;
};

export const __ArrayBuffer_prototype_resizable$get = function (this: ArrayBuffer) {
  return __Porffor_arraybuffer_maxByteLength(Porffor.IR.ptr(this)) >= 0;
};

export const __ArrayBuffer_prototype_immutable$get = function (this: ArrayBuffer) {
  return __Porffor_arraybuffer_isImmutable(Porffor.IR.ptr(this));
};

export const __ArrayBuffer_prototype_slice = function (this: ArrayBuffer, start: any, end: any) {
  if (Porffor.IR.loadI32(this, 0) < 0) throw new TypeError('Called ArrayBuffer.prototype.slice on a detached ArrayBuffer');

  const len: i32 = Porffor.IR.loadI32(this, 0);
  start = ecma262.ToIntegerOrInfinity(start);
  if (Porffor.type(end) == Porffor.TYPES.undefined) end = len;
    else end = ecma262.ToIntegerOrInfinity(end);

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

  const newLen: i32 = end > start ? end - start : 0;
  const out: ArrayBuffer = __Porffor_arraybuffer_alloc(newLen, -1, false);

  // conversions above could have detached or shrunk this
  const currentLen: i32 = Porffor.IR.loadI32(this, 0);
  if (currentLen < 0) throw new TypeError('Called ArrayBuffer.prototype.slice on a detached ArrayBuffer');
  if (start < currentLen) {
    const count: i32 = currentLen - start < newLen ? currentLen - start : newLen;
    Porffor.IR.copy(Porffor.IR.ptr(out) + 8, Porffor.IR.ptr(this) + 8 + start, count);
  }

  return out;
};

export const __ArrayBuffer_prototype_sliceToImmutable = function (this: ArrayBuffer, start: any, end: any) {
  if (Porffor.IR.loadI32(this, 0) < 0) throw new TypeError('Called ArrayBuffer.prototype.sliceToImmutable on a detached ArrayBuffer');

  const len: i32 = Porffor.IR.loadI32(this, 0);
  const first: i32 = __Porffor_typedArray_relIndex(start, len);
  const final: i32 = Porffor.type(end) == Porffor.TYPES.undefined ? len : __Porffor_typedArray_relIndex(end, len);

  const newLen: i32 = final > first ? final - first : 0;
  if (Porffor.IR.loadI32(this, 0) < 0) throw new TypeError('Called ArrayBuffer.prototype.sliceToImmutable on a detached ArrayBuffer');
  if (Porffor.IR.loadI32(this, 0) < final) throw new RangeError('ArrayBuffer is too small for the slice');

  const out: ArrayBuffer = __Porffor_arraybuffer_alloc(newLen, -2, false);
  Porffor.IR.copy(Porffor.IR.ptr(out) + 8, Porffor.IR.ptr(this) + 8 + first, newLen);
  return out;
};

export const __Porffor_arraybuffer_copyAndDetach = (buffer: ArrayBuffer, newLength: any, newMaxByteLength: number): ArrayBuffer => {
  let newByteLength: number = 0;
  if (Porffor.type(newLength) == Porffor.TYPES.undefined) {
    newByteLength = Porffor.IR.loadI32(buffer, 0);
  } else {
    newByteLength = ecma262.ToIndex(newLength);
  }

  const len: i32 = Porffor.IR.loadI32(buffer, 0);
  if (len < 0) throw new TypeError('Cannot transfer a detached ArrayBuffer');
  if (__Porffor_arraybuffer_isImmutable(Porffor.IR.ptr(buffer))) throw new TypeError('Cannot transfer an immutable ArrayBuffer');

  const out: ArrayBuffer = __Porffor_arraybuffer_alloc(newByteLength, newMaxByteLength, false);
  Porffor.IR.copy(Porffor.IR.ptr(out) + 8, Porffor.IR.ptr(buffer) + 8, newByteLength < len ? newByteLength : len);

  __Porffor_arraybuffer_detach(buffer);

  return out;
};

export const __ArrayBuffer_prototype_transfer = function (this: ArrayBuffer, newLength: any) {
  return __Porffor_arraybuffer_copyAndDetach(this, newLength, __Porffor_arraybuffer_maxByteLength(Porffor.IR.ptr(this)));
};

export const __ArrayBuffer_prototype_transferToFixedLength = function (this: ArrayBuffer, newLength: any) {
  return __Porffor_arraybuffer_copyAndDetach(this, newLength, -1);
};

export const __ArrayBuffer_prototype_transferToImmutable = function (this: ArrayBuffer, newLength: any) {
  return __Porffor_arraybuffer_copyAndDetach(this, newLength, -2);
};

export const __ArrayBuffer_prototype_resize = function (this: ArrayBuffer, newLength: any) {
  const max: i32 = __Porffor_arraybuffer_maxByteLength(Porffor.IR.ptr(this));
  if (max < 0) throw new TypeError('Called ArrayBuffer.prototype.resize on a non-resizable ArrayBuffer');

  const newByteLength: number = ecma262.ToIndex(newLength);
  if (Porffor.IR.loadI32(this, 0) < 0) throw new TypeError('Called ArrayBuffer.prototype.resize on a detached ArrayBuffer');
  if (newByteLength > max) throw new RangeError('New length is over maxByteLength');

  __Porffor_arraybuffer_setLength(Porffor.IR.ptr(this), newByteLength);
  return undefined;
};


export const __ArrayBuffer_Symbol_species$get = function (this: any): any {
  return this;
};

export const __SharedArrayBuffer_Symbol_species$get = function (this: any): any {
  return this;
};

export const SharedArrayBuffer = function (length: any, options: any = undefined): SharedArrayBuffer {
  // 1. If NewTarget is undefined, throw a TypeError exception.
  if (!new.target) throw new TypeError("Constructor SharedArrayBuffer requires 'new'");

  // 2. Let byteLength be ? ToIndex(length).
  const byteLength: number = ecma262.ToIndex(length);

  // 3. Let requestedMaxByteLength be ? GetArrayBufferMaxByteLengthOption(options).
  const maxByteLength: number = __Porffor_arraybuffer_maxOption(options);

  return __Porffor_arraybuffer_alloc(byteLength, maxByteLength, true) as SharedArrayBuffer;
};

export const __SharedArrayBuffer_prototype_byteLength$get = function (this: SharedArrayBuffer) {
  return Porffor.IR.loadI32(this, 0);
};

export const __SharedArrayBuffer_prototype_maxByteLength$get = function (this: SharedArrayBuffer) {
  const max: i32 = __Porffor_arraybuffer_maxByteLength(Porffor.IR.ptr(this));
  return max >= 0 ? max : Porffor.IR.loadI32(this, 0);
};

export const __SharedArrayBuffer_prototype_growable$get = function (this: SharedArrayBuffer) {
  return __Porffor_arraybuffer_maxByteLength(Porffor.IR.ptr(this)) >= 0;
};


export const __SharedArrayBuffer_prototype_slice = function (this: SharedArrayBuffer, start: any, end: any) {
  const len: i32 = Porffor.IR.loadI32(this, 0);
  start = ecma262.ToIntegerOrInfinity(start);
  if (Porffor.type(end) == Porffor.TYPES.undefined) end = len;
    else end = ecma262.ToIntegerOrInfinity(end);

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

  const newLen: i32 = end > start ? end - start : 0;
  const out: SharedArrayBuffer = __Porffor_arraybuffer_alloc(newLen, -1, true);
  Porffor.IR.copy(Porffor.IR.ptr(out) + 8, Porffor.IR.ptr(this) + 8 + start, newLen);

  return out;
};

export const __SharedArrayBuffer_prototype_grow = function (this: SharedArrayBuffer, newLength: any) {
  const max: i32 = __Porffor_arraybuffer_maxByteLength(Porffor.IR.ptr(this));
  if (max < 0) throw new TypeError('Called SharedArrayBuffer.prototype.grow on a non-growable SharedArrayBuffer');

  const newByteLength: number = ecma262.ToIndex(newLength);
  if (newByteLength > max) throw new RangeError('New length is over maxByteLength');
  if (newByteLength < Porffor.IR.loadI32(this, 0)) throw new RangeError('SharedArrayBuffer cannot shrink');

  __Porffor_arraybuffer_setLength(Porffor.IR.ptr(this), newByteLength);
  return undefined;
};
