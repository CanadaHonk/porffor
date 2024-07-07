import type {} from './porffor.d.ts';

export const __ArrayBuffer_isView = (value: any): boolean => {
  if (value.buffer) return true;
  return false;
};

export const ArrayBuffer = function (length: any): ArrayBuffer {
  // 1. If NewTarget is undefined, throw a TypeError exception.
  if (!new.target) throw new TypeError("Constructor ArrayBuffer requires 'new'");

  // 2. Let byteLength be ? ToIndex(length).
  const byteLength: number = ecma262.ToIndex(length);

  if (byteLength < 0) throw new RangeError('Invalid ArrayBuffer length (negative)');
  if (byteLength > 4294967295) throw new RangeError('Invalid ArrayBuffer length (over 32 bit address space)');

  const out: ArrayBuffer = Porffor.allocateBytes(byteLength + 4);
  Porffor.wasm.i32.store(out, byteLength, 0, 0);

  return out;
};

export const __ArrayBuffer_prototype_byteLength$get = (_this: ArrayBuffer) => {
  Porffor.wasm`
local read i32
local.get ${_this}
i32.to_u
i32.load 0 0
local.tee read
i32.const 0
local.get read
i32.const 0
i32.ge_s
select
i32.from_u
i32.const 1
return`;
};

export const __ArrayBuffer_prototype_maxByteLength$get = (_this: ArrayBuffer) => {
  Porffor.wasm`
local read i32
local.get ${_this}
i32.to_u
i32.load 0 0
local.tee read
i32.const 0
local.get read
i32.const 0
i32.ge_s
select
i32.from_u
i32.const 1
return`;
};

export const __ArrayBuffer_prototype_detached$get = (_this: ArrayBuffer) => {
  Porffor.wasm`
local.get ${_this}
i32.to_u
i32.load 0 0
i32.const 4294967295
i32.eq
i32.from_u
i32.const 2
return`;
};

export const __ArrayBuffer_prototype_resizable$get = (_this: ArrayBuffer) => {
  return false;
};

export const __ArrayBuffer_prototype_slice = (_this: ArrayBuffer, start: any, end: any) => {
  if (_this.detached) throw new TypeError('Called ArrayBuffer.prototype.slice on a detached ArrayBuffer');

  const len: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  if (Porffor.rawType(end) == Porffor.TYPES.undefined) end = len;

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

  const out: ArrayBuffer = Porffor.allocateBytes(4 + (end - start));
  Porffor.wasm.i32.store(out, end - start, 0, 0);

  Porffor.wasm`
;; dst = out + 4
local.get ${out}
i32.to_u
i32.const 4
i32.add

;; src = this + 4 + start
local.get ${_this}
i32.to_u
i32.const 4
i32.add
local.get ${start}
i32.to_u
i32.add

;; size = end - start
local.get ${end}
i32.to_u
local.get ${start}
i32.to_u
i32.sub

memory.copy 0 0`;

  return out;
};


export const __ArrayBuffer_prototype_transfer = (_this: ArrayBuffer, newLength: any) => {
  if (_this.detached) throw new TypeError('Called ArrayBuffer.prototype.transfer on a detached ArrayBuffer');

  const len: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  if (Porffor.rawType(newLength) == Porffor.TYPES.undefined) newLength = len;

  // make new arraybuffer
  const out: ArrayBuffer = new ArrayBuffer(newLength);
  Porffor.wasm.i32.store(out, newLength, 0, 0);

  // copy data to it
  Porffor.wasm`
;; dst = out + 4
local.get ${out}
i32.to_u
i32.const 4
i32.add

;; src = this + 4
local.get ${_this}
i32.to_u
i32.const 4
i32.add

;; size = min(newLength, len)
local.get ${newLength}
local.get ${len}
f64.min
i32.to_u

memory.copy 0 0`;

  // mark as detached by setting length = "-1"
  Porffor.wasm.i32.store(_this, 4294967295, 0, 0);

  return out;
};

export const __ArrayBuffer_prototype_transferToFixedLength = (_this: ArrayBuffer, newLength: any) => __ArrayBuffer_prototype_transfer(_this, newLength);

export const __ArrayBuffer_prototype_resize = (_this: ArrayBuffer, newLength: any) => {
  // todo: resizable not implemented yet so just always fail
  throw new TypeError('Called ArrayBuffer.prototype.resize on a non-resizable ArrayBuffer');
};


export const SharedArrayBuffer = function (length: any): SharedArrayBuffer {
  // 1. If NewTarget is undefined, throw a TypeError exception.
  if (!new.target) throw new TypeError("Constructor SharedArrayBuffer requires 'new'");

  // 2. Let byteLength be ? ToIndex(length).
  const byteLength: number = ecma262.ToIndex(length);

  if (byteLength < 0) throw new RangeError('Invalid SharedArrayBuffer length (negative)');
  if (byteLength > 4294967295) throw new RangeError('Invalid SharedArrayBuffer length (over 32 bit address space)');

  const out: SharedArrayBuffer = Porffor.allocateBytes(byteLength + 4);
  Porffor.wasm.i32.store(out, byteLength, 0, 0);

  return out;
};

export const __SharedArrayBuffer_prototype_byteLength$get = (_this: SharedArrayBuffer) => {
  return Porffor.wasm.i32.load(_this, 0, 0);
};

export const __SharedArrayBuffer_prototype_maxByteLength$get = (_this: SharedArrayBuffer) => {
  return Porffor.wasm.i32.load(_this, 0, 0);
};

export const __SharedArrayBuffer_prototype_growable$get = (_this: SharedArrayBuffer) => {
  return false;
};


export const __SharedArrayBuffer_prototype_slice = (_this: SharedArrayBuffer, start: any, end: any) => {
  const len: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  if (Porffor.rawType(end) == Porffor.TYPES.undefined) end = len;

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

  const out: SharedArrayBuffer = Porffor.allocateBytes(4 + (end - start));
  Porffor.wasm.i32.store(out, end - start, 0, 0);

  Porffor.wasm`
;; dst = out + 4
local.get ${out}
i32.to_u
i32.const 4
i32.add

;; src = this + 4 + start
local.get ${_this}
i32.to_u
i32.const 4
i32.add
local.get ${start}
i32.to_u
i32.add

;; size = end - start
local.get ${end}
i32.to_u
local.get ${start}
i32.to_u
i32.sub

memory.copy 0 0`;

  return out;
};

export const __SharedArrayBuffer_prototype_grow = (_this: SharedArrayBuffer, newLength: any) => {
  // todo: growable not implemented yet so just always fail
  throw new TypeError('Called SharedArrayBuffer.prototype.grow on a non-growable SharedArrayBuffer');
};