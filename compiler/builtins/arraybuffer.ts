import type {} from './porffor.d.ts';

// arraybuffer layout: byteLength (i32, -1 if detached), flags (i32), data
// flags: maxByteLength in the low 31 bits (0x7fffffff if fixed length), shared in the top bit
// resizable buffers allocate maxByteLength upfront so views never move

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

// GetArrayBufferMaxByteLengthOption, -1 if none
export const __Porffor_arraybuffer_maxOption = (options: any): number => {
  if (!__Porffor_object_isObject(options)) return -1;

  const maxByteLength: any = options.maxByteLength;
  if (Porffor.type(maxByteLength) == Porffor.TYPES.undefined) return -1;
  return ecma262.ToIndex(maxByteLength);
};

export const __Porffor_arraybuffer_maxByteLength = (buffer: i32): i32 => {
  const max: i32 = Porffor.IR.loadI32(buffer, 4) & 0x7fffffff;
  return max == 0x7fffffff ? -1 : max;
};

export const __Porffor_arraybuffer_isShared = (buffer: i32): boolean => Porffor.IR.loadI32(buffer, 4) < 0;

export const __Porffor_arraybuffer_alloc = (byteLength: number, maxByteLength: number, shared: boolean): i32 => {
  if (Porffor.fastAnd(maxByteLength >= 0, byteLength > maxByteLength)) throw new RangeError('Invalid ArrayBuffer length (over maxByteLength)');

  const capacity: number = maxByteLength >= 0 ? maxByteLength : byteLength;
  if (capacity > 2147483639) throw new RangeError('Invalid ArrayBuffer length (over maximum supported length)');

  const out: i32 = Porffor.malloc(capacity + 8);
  Porffor.IR.storeI32(out, 0, byteLength);
  Porffor.IR.storeI32(out, 4, (maxByteLength >= 0 ? maxByteLength : 0x7fffffff) | (shared ? 0x80000000 : 0));
  Porffor.IR.fill(out + 8, 0, capacity);
  return out;
};

// set the byte length of a resizable buffer, zeroing bytes leaving/entering the view
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

// ArrayBufferCopyAndDetach
export const __Porffor_arraybuffer_copyAndDetach = (buffer: ArrayBuffer, newLength: any, preserveResizability: boolean): ArrayBuffer => {
  let newByteLength: number = 0;
  if (Porffor.type(newLength) == Porffor.TYPES.undefined) {
    newByteLength = Porffor.IR.loadI32(buffer, 0);
  } else {
    newByteLength = ecma262.ToIndex(newLength);
  }

  const len: i32 = Porffor.IR.loadI32(buffer, 0);
  if (len < 0) throw new TypeError('Cannot transfer a detached ArrayBuffer');

  let newMaxByteLength: number = -1;
  if (preserveResizability) newMaxByteLength = __Porffor_arraybuffer_maxByteLength(Porffor.IR.ptr(buffer));

  const out: ArrayBuffer = __Porffor_arraybuffer_alloc(newByteLength, newMaxByteLength, false);
  Porffor.IR.copy(Porffor.IR.ptr(out) + 8, Porffor.IR.ptr(buffer) + 8, newByteLength < len ? newByteLength : len);

  __Porffor_arraybuffer_detach(buffer);

  return out;
};

export const __ArrayBuffer_prototype_transfer = function (this: ArrayBuffer, newLength: any) {
  return __Porffor_arraybuffer_copyAndDetach(this, newLength, true);
};

export const __ArrayBuffer_prototype_transferToFixedLength = function (this: ArrayBuffer, newLength: any) {
  return __Porffor_arraybuffer_copyAndDetach(this, newLength, false);
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
