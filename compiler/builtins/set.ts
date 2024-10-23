import type {} from './porffor.d.ts';

// dark wasm magic for dealing with memory, sorry.
export const __Porffor_set_read = (set: Set, index: number): any => {
  Porffor.wasm`
local offset i32
local.get ${index}
i32.to_u
i32.const 9
i32.mul
local.get ${set}
i32.to_u
i32.add
local.set offset

local.get offset
f64.load 0 4

local.get offset
i32.load8_u 0 12
return`;
};

export const __Porffor_set_write = (set: Set, index: number, value: any): boolean => {
  Porffor.wasm`
local offset i32
local.get ${index}
i32.to_u
i32.const 9
i32.mul
local.get ${set}
i32.to_u
i32.add
local.set offset

local.get offset
local.get ${value}
f64.store 0 4

local.get offset
local.get ${value+1}
i32.store8 0 12`;

  return true;
};


export const __Set_prototype_size$get = (_this: Set) => {
  return Porffor.wasm.i32.load(_this, 0, 0);
};

export const __Set_prototype_values = (_this: Set) => {
  // todo: this should return an iterator not array
  const size: number = Porffor.wasm.i32.load(_this, 0, 0);

  const out: any[] = __Porffor_allocate();
  for (let i: number = 0; i < size; i++) {
    const val: any = __Porffor_set_read(_this, i);
    Porffor.array.fastPush(out, val);
  }

  return out;
};

export const __Set_prototype_keys = (_this: Set) => {
  return __Set_prototype_values(_this);
};

export const __Set_prototype_has = (_this: Set, value: any) => {
  const size: number = Porffor.wasm.i32.load(_this, 0, 0);

  for (let i: number = 0; i < size; i++) {
    if (__Porffor_set_read(_this, i) === value) return true;
  }

  return false;
};

export const __Set_prototype_add = (_this: Set, value: any) => {
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

export const __Set_prototype_delete = (_this: Set, value: any) => {
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

export const __Set_prototype_clear = (_this: Set) => {
  // just set size to 0
  // do not need to delete any as will not be accessed anymore,
  // and will be overwritten with new add
  Porffor.wasm.i32.store(_this, 0, 0, 0);
};

export const __Set_prototype_forEach = (_this: Set, callbackFn: any) => {
  for (const x of _this) {
    callbackFn(x, x, _this);
  }
};

export const Set = function (iterable: any): Set {
  if (!new.target) throw new TypeError("Constructor Set requires 'new'");

  const out: Set = __Porffor_allocate();

  if (iterable != null) for (const x of iterable) {
    __Set_prototype_add(out, x);
  }

  return out;
};

export const __Set_prototype_union = (_this: Set, other: any) => {
  if (Porffor.rawType(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  const out: Set = new Set(_this);
  for (const x of other) {
    out.add(x);
  }

  return out;
};

export const __Set_prototype_intersection = (_this: Set, other: any) => {
  if (Porffor.rawType(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  const out: Set = new Set(_this);
  for (const x of other) {
    out.add(x);
  }

  return out;
};

export const __Set_prototype_difference = (_this: Set, other: any) => {
  if (Porffor.rawType(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  const out: Set = new Set(_this);
  for (const x of other) {
    out.delete(x);
  }

  return out;
};

export const __Set_prototype_symmetricDifference = (_this: Set, other: any) => {
  if (Porffor.rawType(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  const out: Set = new Set(_this);
  for (const x of other) {
    if (_this.has(x)) out.delete(x);
      else out.add(x);
  }

  return out;
};

export const __Set_prototype_isSubsetOf = (_this: Set, other: any) => {
  if (Porffor.rawType(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  for (const x of _this) {
    if (!other.has(x)) return false;
  }

  return true;
};

export const __Set_prototype_isSupersetOf = (_this: Set, other: any) => {
  if (Porffor.rawType(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  for (const x of other) {
    if (!_this.has(x)) return false;
  }

  return true;
};

export const __Set_prototype_isDisjointFrom = (_this: Set, other: any) => {
  if (Porffor.rawType(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  for (const x of _this) {
    if (other.has(x)) return false;
  }

  return true;
};

export const __Set_prototype_toString = (_this: Set) => '[object Set]';
export const __Set_prototype_toLocaleString = (_this: Set) => __Set_prototype_toString(_this);