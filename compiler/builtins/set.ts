import type {} from './porffor.d.ts';

// shares the ordered hash table container from map.ts (vals slot @4 = 0)

export const __Set_prototype_size$get = function (this: Set) {
  const keys: any[] = Porffor.IR.loadI32(this, 0);
  return keys.length - Porffor.IR.loadI32(this, 16);
};

export const __Set_prototype_values = function (this: Set) {
  // todo: this should return an iterator not array
  const keys: any[] = Porffor.IR.loadI32(this, 0);
  const keysEntries: i32 = Porffor.IR.loadI32(keys, 4);
  const out: any[] = Porffor.array.new(4);

  const size: i32 = keys.length;
  for (let i: i32 = 0; i < size; i++) {
    if (Porffor.IR.loadU64(keysEntries + i * 8, 0) == -1) continue;
    Porffor.array.fastPush(out, keys[i]);
  }

  return out;
};

export const __Set_prototype_keys = function (this: Set) {
  return Porffor.callThis(__Set_prototype_values, this);
};

export const __Set_prototype_has = function (this: Set, value: any) {
  return __Porffor_hashtableLookup(this, value) != -1;
};

export const __Set_prototype_add = function (this: Set, value: any) {
  if (__Porffor_hashtableLookup(this, value) == -1) {
    __Porffor_hashtableAppend(this, value);
  }

  return this;
};

export const __Set_prototype_delete = function (this: Set, value: any) {
  const index: i32 = __Porffor_hashtableLookup(this, value);
  if (index == -1) return false;

  __Porffor_hashtableTombstone(this, value, index);
  return true;
};

export const __Set_prototype_clear = function (this: Set) {
  const keys: any[] = Porffor.IR.loadI32(this, 0);
  __Porffor_array_ensure(keys, 0);
  keys.length = 0;

  Porffor.IR.storeI32(this, 8, 0);
  Porffor.IR.storeI32(this, 12, 0);
  Porffor.IR.storeI32(this, 16, 0);
};

export const __Set_prototype_forEach = function (this: Set, callbackFn: any, thisArg: any = undefined) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('callbackFn is not a function');

  for (const x of this) {
    callbackFn.call(thisArg, x, x, this);
  }
};

export const Set = function (iterable: any): Set {
  if (!new.target) throw new TypeError("Constructor Set requires 'new'");

  const out: Set = __Porffor_hashtableNew(false);
  Porffor.IR.gcBarrier(out, Porffor.TYPES.set);

  if (iterable != null) for (const x of iterable) {
    Porffor.callThis(__Set_prototype_add, out, x);
  }

  return out;
};

export const __Set_prototype_entries = function (this: Set) {
  const values: any[] = Porffor.callThis(__Set_prototype_values, this);
  const out: any[] = Porffor.array.new(4);

  const size: i32 = values.length;
  for (let i: i32 = 0; i < size; i++) {
    const entry: any[] = Porffor.array.new(2);
    Porffor.array.fastPush(entry, values[i]);
    Porffor.array.fastPush(entry, values[i]);
    Porffor.array.fastPush(out, entry);
  }

  return out;
};

export const __Set_prototype_union = function (this: Set, other: any) {
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  const out: Set = new Set(this);
  for (const x of other) {
    out.add(x);
  }

  return out;
};

export const __Set_prototype_intersection = function (this: Set, other: any) {
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  const out: Set = new Set();
  for (const x of this) {
    if (other.has(x)) out.add(x);
  }

  return out;
};

export const __Set_prototype_difference = function (this: Set, other: any) {
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  const out: Set = new Set(this);
  for (const x of other) {
    out.delete(x);
  }

  return out;
};

export const __Set_prototype_symmetricDifference = function (this: Set, other: any) {
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  const out: Set = new Set(this);
  for (const x of other) {
    if (this.has(x)) out.delete(x);
      else out.add(x);
  }

  return out;
};

export const __Set_prototype_isSubsetOf = function (this: Set, other: any) {
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  for (const x of this) {
    if (!other.has(x)) return false;
  }

  return true;
};

export const __Set_prototype_isSupersetOf = function (this: Set, other: any) {
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  for (const x of other) {
    if (!this.has(x)) return false;
  }

  return true;
};

export const __Set_prototype_isDisjointFrom = function (this: Set, other: any) {
  if (Porffor.type(other) != Porffor.TYPES.set) throw new TypeError('other argument must be a Set');

  for (const x of this) {
    if (other.has(x)) return false;
  }

  return true;
};

export const __Set_prototype_toString = function (this: Set) { return '[object Set]'; };
export const __Set_prototype_toLocaleString = function (this: Set) { return Porffor.callThis(__Set_prototype_toString, this); };
