import type {} from './porffor.d.ts';

export const __Map_prototype_size$get = function (this: Map) {
  const keys: any[] = Porffor.IR.loadI32(this, 0);
  return keys.length - Porffor.IR.loadI32(this, 16);
};

export const __Map_prototype_has = function (this: Map, key: any) {
  return __Porffor_hashtableLookup(this, key) != -1;
};

export const __Map_prototype_get = function (this: Map, key: any) {
  const index: i32 = __Porffor_hashtableLookup(this, key);
  if (index == -1) return undefined;

  const vals: any[] = Porffor.IR.loadI32(this, 4);
  return vals[index];
};

export const __Map_prototype_set = function (this: Map, key: any, value: any) {
  const vals: any[] = Porffor.IR.loadI32(this, 4);

  const index: i32 = __Porffor_hashtableLookup(this, key);
  if (index != -1) {
    vals[index] = value;
    return this;
  }

  // push the value first so vals stays in sync if append compacts both arrays
  Porffor.array.fastPush(vals, value);
  __Porffor_hashtableAppend(this, key);
  return this;
};

export const __Map_prototype_delete = function (this: Map, key: any) {
  const index: i32 = __Porffor_hashtableLookup(this, key);
  if (index == -1) return false;

  __Porffor_hashtableTombstone(this, key, index);
  return true;
};

export const __Map_prototype_clear = function (this: Map) {
  const keys: any[] = Porffor.IR.loadI32(this, 0);
  __Porffor_array_ensure(keys, 0);
  keys.length = 0;

  const vals: any[] = Porffor.IR.loadI32(this, 4);
  __Porffor_array_ensure(vals, 0);
  vals.length = 0;

  Porffor.IR.storeI32(this, 8, 0);
  Porffor.IR.storeI32(this, 12, 0);
  Porffor.IR.storeI32(this, 16, 0);
};

export const __Map_prototype_forEach = function (this: Map, callbackFn: any, thisArg: any = undefined) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('callbackFn is not a function');

  const keys: any[] = Porffor.IR.loadI32(this, 0);
  const keysEntries: i32 = Porffor.IR.loadI32(keys, 4);
  const vals: any[] = Porffor.IR.loadI32(this, 4);

  const size: i32 = keys.length;
  for (let i: i32 = 0; i < size; i++) {
    if (Porffor.IR.loadU64(keysEntries + i * 8, 0) == -1) continue;
    callbackFn.call(thisArg, vals[i], keys[i], this);
  }
};

export const Map = function (iterable: any): Map {
  if (!new.target) throw new TypeError("Constructor Map requires 'new'");

  const out: Map = __Porffor_hashtableNew(true);
  Porffor.IR.gcBarrier(out, Porffor.TYPES.map);

  if (iterable != null) for (const x of iterable) {
    if (!Porffor.object.isObject(x)) throw new TypeError('Iterator contains non-object');
    Porffor.callThis(__Map_prototype_set, out, x[0], x[1]);
  }

  return out;
};

export const __Map_prototype_keys = function (this: Map) {
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

export const __Map_prototype_values = function (this: Map) {
  const keys: any[] = Porffor.IR.loadI32(this, 0);
  const keysEntries: i32 = Porffor.IR.loadI32(keys, 4);
  const vals: any[] = Porffor.IR.loadI32(this, 4);
  const out: any[] = Porffor.array.new(4);

  const size: i32 = keys.length;
  for (let i: i32 = 0; i < size; i++) {
    if (Porffor.IR.loadU64(keysEntries + i * 8, 0) == -1) continue;
    Porffor.array.fastPush(out, vals[i]);
  }

  return out;
};

export const __Map_prototype_entries = function (this: Map) {
  const keys: any[] = Porffor.IR.loadI32(this, 0);
  const keysEntries: i32 = Porffor.IR.loadI32(keys, 4);
  const vals: any[] = Porffor.IR.loadI32(this, 4);
  const out: any[] = Porffor.array.new(4);

  const size: i32 = keys.length;
  for (let i: i32 = 0; i < size; i++) {
    if (Porffor.IR.loadU64(keysEntries + i * 8, 0) == -1) continue;
    const entry: any[] = Porffor.array.new(2);
    Porffor.array.fastPush(entry, keys[i]);
    Porffor.array.fastPush(entry, vals[i]);
    Porffor.array.fastPush(out, entry);
  }

  return out;
};

export const __Map_prototype_toString = function (this: Map) { return '[object Map]'; };
export const __Map_prototype_toLocaleString = function (this: Map) { return Porffor.callThis(__Map_prototype_toString, this); };

// https://github.com/tc39/proposal-upsert
export const __Map_prototype_getOrInsert = function (this: Map, key: any, value: any) {
  if (!Porffor.callThis(__Map_prototype_has, this, key)) {
    Porffor.callThis(__Map_prototype_set, this, key, value);
  }

  return Porffor.callThis(__Map_prototype_get, this, key);
};

export const __Map_prototype_getOrInsertComputed = function (this: Map, key: any, callbackFn: any) {
  if (!Porffor.callThis(__Map_prototype_has, this, key)) {
    Porffor.callThis(__Map_prototype_set, this, key, callbackFn(key));
  }

  return Porffor.callThis(__Map_prototype_get, this, key);
};
