import type {} from './porffor.d.ts';

export const __WeakSet_prototype_has = (_this: WeakSet, value: any) => {
  const size: number = Porffor.wasm.i32.load(_this, 0, 0);

  for (let i: number = 0; i < size; i++) {
    if (__Porffor_set_read(_this, i) === value) return true;
  }

  return false;
};

export const __WeakSet_prototype_add = (_this: WeakSet, value: any) => {
  if (Porffor.rawType(value) < 0x04) throw new TypeError('Value in WeakSet needs to be an object or symbol');

  const size: number = Porffor.wasm.i32.load(_this, 0, 0);

  // check if already in set
  for (let i: number = 0; i < size; i++) {
    if (__Porffor_set_read(_this, i) === value) return _this;
  }

  // not, add it
  // increment size by 1
  Porffor.wasm.i32.store(_this, size + 1, 0, 0);

  // write new value at end
  __Porffor_set_write(_this, size, value);

  return _this;
};

export const __WeakSet_prototype_delete = (_this: WeakSet, value: any) => {
  const size: number = Porffor.wasm.i32.load(_this, 0, 0);

  // check if already in set
  for (let i: number = 0; i < size; i++) {
    if (__Porffor_set_read(_this, i) === value) {
      // found, delete
      // decrement size by 1
      Porffor.wasm.i32.store(_this, size - 1, 0, 0);

      // offset all elements after by -1 ind
      Porffor.wasm`
local offset i32
local.get ${i}
i32.to_u
i32.const 9
i32.mul
local.get ${_this}
i32.to_u
i32.add
i32.const 4
i32.add
local.set offset

;; dst = offset (this element)
local.get offset

;; src = offset + 9 (this element + 1 element)
local.get offset
i32.const 9
i32.add

;; size = (size - i - 1) * 9
local.get ${size}
local.get ${i}
f64.sub
i32.to_u
i32.const 1
i32.sub
i32.const 9
i32.mul

memory.copy 0 0`;

      return true;
    }
  }

  // not, return false
  return false;
};

export const WeakSet = function (iterable: any): WeakSet {
  if (!new.target) throw new TypeError("Constructor Set requires 'new'");

  const out: WeakSet = __Porffor_allocate();

  if (Porffor.rawType(iterable) != Porffor.TYPES.undefined) for (const x of iterable) {
    __WeakSet_prototype_add(out, x);
  }

  return out;
};

export const __WeakSet_prototype_toString = (_this: WeakSet) => {
  const out: bytestring = '[object WeakSet]';
  return out;
};

export const __WeakSet_prototype_toLocaleString = (_this: WeakSet) => __WeakSet_prototype_toString(_this);