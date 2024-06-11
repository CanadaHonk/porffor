import type {} from './porffor.d.ts';

export const __ArrayBuffer_isView = function (value: any): boolean {
  if (value.buffer) return true;
  return false;
};

export const ArrayBuffer = function (length: number): ArrayBuffer {
  if (!new.target) throw new TypeError("Constructor ArrayBuffer requires 'new'");

  if (length < 0) throw new RangeError('Invalid ArrayBuffer length (negative)');
  if (length > 34359738368) throw new RangeError('Invalid ArrayBuffer length (>32GiB)');

  length |= 0;

  const out: ArrayBuffer = Porffor.allocateBytes(length + 4);
  Porffor.wasm.i32.store(out, length, 0, 0);

  return out;
};

export const __ArrayBuffer_prototype_byteLength$get = (_this: ArrayBuffer) => {
  return Porffor.wasm.i32.load(_this, 0, 0);
};

export const __ArrayBuffer_prototype_slice = (_this: ArrayBuffer, start: number, end: any) => {
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