import type {} from './porffor.d.ts';

export const __Set_prototype_size$get = (_this: Set) => {
  return Porffor.wasm.i32.load(_this, 0, 0);
};

export const __Set_prototype_values = (_this: Set) => {
  // todo: this should return an iterator not array
  const size: number = Porffor.wasm.i32.load(_this, 0, 0);

  const out: any[] = __Porffor_allocate();
  for (let i: number = 0; i < size; i++) {
    Porffor.array.fastPush(out, (_this as any[])[i]);
  }

  return out;
};

export const __Set_prototype_keys = (_this: Set) => {
  return __Set_prototype_values(_this);
};

export const __Set_prototype_has = (_this: Set, value: any) => {
  const size: number = Porffor.wasm.i32.load(_this, 0, 0);

  for (let i: number = 0; i < size; i++) {
    if ((_this as any[])[i] === value) return true;
  }

  return false;
};

export const __Set_prototype_add = (_this: Set, value: any) => {
  const size: number = Porffor.wasm.i32.load(_this, 0, 0);

  // check if already in set
  for (let i: number = 0; i < size; i++) {
    if ((_this as any[])[i] === value) return _this;
  }

  // not, add it
  // increment size by 1
  Porffor.wasm.i32.store(_this, size + 1, 0, 0);

  // write new value at end
  (_this as any[])[size] = value;

  return _this;
};

export const __Set_prototype_delete = (_this: Set, value: any) => {
  // check if already in set
  const size: number = Porffor.wasm.i32.load(_this, 0, 0);
  for (let i: number = 0; i < size; i++) {
    if ((_this as any[])[i] === value) {
      // found, delete
      Porffor.array.fastRemove(_this, i, size);
      return true;
    }
  }

  // not, return false
  return false;
};

export const __Set_prototype_clear = (_this: Set) => {
  // just set size to 0
  // do not need to delete any as old will just be overwritten
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
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  const out: Set = new Set(_this);
  for (const x of other) {
    out.add(x);
  }

  return out;
};

export const __Set_prototype_intersection = (_this: Set, other: any) => {
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  const out: Set = new Set(_this);
  for (const x of other) {
    out.add(x);
  }

  return out;
};

export const __Set_prototype_difference = (_this: Set, other: any) => {
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  const out: Set = new Set(_this);
  for (const x of other) {
    out.delete(x);
  }

  return out;
};

export const __Set_prototype_symmetricDifference = (_this: Set, other: any) => {
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  const out: Set = new Set(_this);
  for (const x of other) {
    if (_this.has(x)) out.delete(x);
      else out.add(x);
  }

  return out;
};

export const __Set_prototype_isSubsetOf = (_this: Set, other: any) => {
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  for (const x of _this) {
    if (!other.has(x)) return false;
  }

  return true;
};

export const __Set_prototype_isSupersetOf = (_this: Set, other: any) => {
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  for (const x of other) {
    if (!_this.has(x)) return false;
  }

  return true;
};

export const __Set_prototype_isDisjointFrom = (_this: Set, other: any) => {
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  for (const x of _this) {
    if (other.has(x)) return false;
  }

  return true;
};

export const __Set_prototype_toString = (_this: Set) => '[object Set]';
export const __Set_prototype_toLocaleString = (_this: Set) => __Set_prototype_toString(_this);