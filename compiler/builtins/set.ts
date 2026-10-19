import type {} from './porffor.d.ts';

// shares the ordered hash table container from map.ts (vals slot @4 = 0)

export const __Set_prototype_size$get = function (this: Set) {
  const keys: any[] = Porffor.IR.loadI32(this, 0);
  return keys.length - Porffor.IR.loadI32(this, 16);
};

export const __Set_prototype_values = function (this: Set) {
  return __Porffor_SetIterator_new(this, 0);
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
  return __Porffor_SetIterator_new(this, 3);
};

// GetSetRecord(obj) as [ set, size, has, keys ]
export const __Porffor_set_record = (obj: any): any[] => {
  if (!Porffor.object.isObject(obj)) throw new TypeError('Set method argument is not an object');

  const numSize: number = ecma262.ToNumber(obj.size);
  if (Number.isNaN(numSize)) throw new TypeError('Set-like size is NaN');
  const intSize: number = ecma262.ToIntegerOrInfinity(numSize);
  if (intSize < 0) throw new RangeError('Set-like size is negative');

  const has: any = obj.has;
  if (Porffor.type(has) != Porffor.TYPES.function) throw new TypeError('Set-like has is not a function');
  const keys: any = obj.keys;
  if (Porffor.type(keys) != Porffor.TYPES.function) throw new TypeError('Set-like keys is not a function');

  const out: any[] = Porffor.array.new(4);
  out[0] = obj;
  out[1] = intSize;
  out[2] = has;
  out[3] = keys;
  return out;
};

// GetIteratorFromMethod(set, keys) as [ iterator, next ]
export const __Porffor_set_keysIterator = (rec: any[]): any[] => {
  const iter: any = Porffor.call(rec[3], Porffor.array.new(0), rec[0], undefined);
  if (!Porffor.object.isObject(iter)) throw new TypeError('Set-like keys() result is not an object');

  const out: any[] = Porffor.array.new(2);
  out[0] = iter;
  out[1] = iter.next;
  return out;
};

// IteratorStepValue: [ done, value ] in out, -0 canonicalized to +0
export const __Porffor_set_step = (iter: any[], out: any[]): boolean => {
  const result: any = Porffor.call(iter[1], Porffor.array.new(0), iter[0], undefined);
  if (!Porffor.object.isObject(result)) throw new TypeError('Iterator result is not an object');
  if (!!result.done) return false;

  let value: any = result.value;
  if (Porffor.fastAnd(Porffor.type(value) == Porffor.TYPES.number, value == 0)) value = 0;
  out[0] = value;
  return true;
};

export const __Porffor_set_has = (rec: any[], x: any): boolean => {
  const args: any[] = Porffor.array.new(1);
  args[0] = x;
  return !!Porffor.call(rec[2], args, rec[0], undefined);
};

export const __Porffor_set_close = (iter: any[]): void => {
  const ret: any = iter[0].return;
  if (ret != null) Porffor.call(ret, Porffor.array.new(0), iter[0], undefined);
};

export const __Porffor_set_copy = (set: Set): Set => {
  const out: Set = __Porffor_hashtableNew(false);
  Porffor.IR.gcBarrier(out, Porffor.TYPES.set);
  for (const x of set) Porffor.callThis(__Set_prototype_add, out, x);
  return out;
};

export const __Set_prototype_union = function (this: Set, other: any) {
  const rec: any[] = __Porffor_set_record(other);
  const iter: any[] = __Porffor_set_keysIterator(rec);

  const out: Set = __Porffor_set_copy(this);
  const step: any[] = Porffor.array.new(1);
  while (__Porffor_set_step(iter, step)) Porffor.callThis(__Set_prototype_add, out, step[0]);

  return out;
};

export const __Set_prototype_intersection = function (this: Set, other: any) {
  const rec: any[] = __Porffor_set_record(other);

  const out: Set = __Porffor_hashtableNew(false);
  Porffor.IR.gcBarrier(out, Porffor.TYPES.set);
  if (Porffor.callThis(__Set_prototype_size$get, this) <= rec[1]) {
    for (const x of this) {
      if (!!__Porffor_set_has(rec, x)) Porffor.callThis(__Set_prototype_add, out, x);
    }
  } else {
    const iter: any[] = __Porffor_set_keysIterator(rec);
    const step: any[] = Porffor.array.new(1);
    while (__Porffor_set_step(iter, step)) {
      if (Porffor.callThis(__Set_prototype_has, this, step[0])) Porffor.callThis(__Set_prototype_add, out, step[0]);
    }
  }

  return out;
};

export const __Set_prototype_difference = function (this: Set, other: any) {
  const rec: any[] = __Porffor_set_record(other);

  const out: Set = __Porffor_set_copy(this);
  if (Porffor.callThis(__Set_prototype_size$get, this) <= rec[1]) {
    for (const x of this) {
      if (!!__Porffor_set_has(rec, x)) Porffor.callThis(__Set_prototype_delete, out, x);
    }
  } else {
    const iter: any[] = __Porffor_set_keysIterator(rec);
    const step: any[] = Porffor.array.new(1);
    while (__Porffor_set_step(iter, step)) Porffor.callThis(__Set_prototype_delete, out, step[0]);
  }

  return out;
};

export const __Set_prototype_symmetricDifference = function (this: Set, other: any) {
  const rec: any[] = __Porffor_set_record(other);
  const iter: any[] = __Porffor_set_keysIterator(rec);

  const out: Set = __Porffor_set_copy(this);
  const step: any[] = Porffor.array.new(1);
  while (__Porffor_set_step(iter, step)) {
    const x: any = step[0];
    if (Porffor.callThis(__Set_prototype_has, this, x)) Porffor.callThis(__Set_prototype_delete, out, x);
      else Porffor.callThis(__Set_prototype_add, out, x);
  }

  return out;
};

export const __Set_prototype_isSubsetOf = function (this: Set, other: any) {
  const rec: any[] = __Porffor_set_record(other);
  if (Porffor.callThis(__Set_prototype_size$get, this) > rec[1]) return false;

  for (const x of this) {
    if (!__Porffor_set_has(rec, x)) return false;
  }

  return true;
};

export const __Set_prototype_isSupersetOf = function (this: Set, other: any) {
  const rec: any[] = __Porffor_set_record(other);
  if (Porffor.callThis(__Set_prototype_size$get, this) < rec[1]) return false;

  const iter: any[] = __Porffor_set_keysIterator(rec);
  const step: any[] = Porffor.array.new(1);
  while (__Porffor_set_step(iter, step)) {
    if (!Porffor.callThis(__Set_prototype_has, this, step[0])) {
      __Porffor_set_close(iter);
      return false;
    }
  }

  return true;
};

export const __Set_prototype_isDisjointFrom = function (this: Set, other: any) {
  const rec: any[] = __Porffor_set_record(other);

  if (Porffor.callThis(__Set_prototype_size$get, this) <= rec[1]) {
    for (const x of this) {
      if (!!__Porffor_set_has(rec, x)) return false;
    }
  } else {
    const iter: any[] = __Porffor_set_keysIterator(rec);
    const step: any[] = Porffor.array.new(1);
    while (__Porffor_set_step(iter, step)) {
      if (Porffor.callThis(__Set_prototype_has, this, step[0])) {
        __Porffor_set_close(iter);
        return false;
      }
    }
  }

  return true;
};

export const __Set_prototype_toString = function (this: Set) { return '[object Set]'; };
export const __Set_prototype_toLocaleString = function (this: Set) { return Porffor.callThis(__Set_prototype_toString, this); };

export const __Set_prototype_Symbol_iterator = function (this: Set) {
  return __Porffor_SetIterator_new(this, 0);
};
