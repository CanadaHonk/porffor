import type {} from './porffor.d.ts';

export const __ArrayBuffer_isView = function (value: any): boolean {
  if (value.buffer) return true;
  return false;
};

export const ArrayBuffer = function (length: number): ArrayBuffer {
  if (!new.target) throw new TypeError("Constructor ArrayBuffer requires 'new'");

  if (length < 0) throw new RangeError('Invalid ArrayBuffer length (negative)');
  if (length > 4294967295) throw new RangeError('Invalid ArrayBuffer length (over 32 bit address space)');

  length |= 0;

  const out: ArrayBuffer = Porffor.allocateBytes(length + 4);
  Porffor.wasm.i32.store(out, length, 0, 0);

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
i32.const 0
return`;
};

export const __ArrayBuffer_prototype_maxByteLength$get = (_this: ArrayBuffer) => {
  return _this.byteLength;
};

export const __ArrayBuffer_prototype_detached$get = (_this: ArrayBuffer) => {
  Porffor.wasm`
local.get ${_this}
i32.to_u
i32.load 0 0
i32.const 4294967295
i32.eq
i32.from_u
i32.const 1
return`;
};

export const __ArrayBuffer_prototype_resizable$get = (_this: ArrayBuffer) => {
  return false;
};

export const __ArrayBuffer_prototype_slice = (_this: ArrayBuffer, start: number, end: any) => {
  if (_this.detached) throw new TypeError('Called ArrayBuffer.prototype.slice on a detached ArrayBuffer');

  const len: i32 = Porffor.wasm.i32.load(_this, 0, 0);

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

export const __ArrayBuffer_prototype_transfer = (_this: ArrayBuffer, newByteLength: any) => {
  if (_this.detached) throw new TypeError('Called ArrayBuffer.prototype.transfer on a detached ArrayBuffer');

  const len: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  if (Porffor.rawType(newByteLength) == Porffor.TYPES.undefined) newByteLength = len;

  // make new arraybuffer
  const out: ArrayBuffer = new ArrayBuffer(newByteLength);
  Porffor.wasm.i32.store(out, newByteLength, 0, 0);

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

;; size = min(newByteLength, len)
local.get ${newByteLength}
local.get ${len}
f64.min
i32.to_u

memory.copy 0 0`;

  // mark as detached by setting length = "-1"
  Porffor.wasm.i32.store(_this, 4294967295, 0, 0);

  return out;
};