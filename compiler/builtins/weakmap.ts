import type {} from './porffor.d.ts';

// map container with keys restricted to objects/symbols (identity hash), the gc
// sweep tombstones dead keys via a C mirror of __Porffor_hashIdentity - keep in sync

export const __WeakMap_prototype_has = function (this: WeakMap, key: any) {
  if (!Porffor.object.isObjectOrSymbol(key)) return false;
  return Porffor.callThis(__Map_prototype_has, this as Map, key);
};

export const __WeakMap_prototype_get = function (this: WeakMap, key: any) {
  if (!Porffor.object.isObjectOrSymbol(key)) return undefined;
  return Porffor.callThis(__Map_prototype_get, this as Map, key);
};

export const __WeakMap_prototype_set = function (this: WeakMap, key: any, value: any) {
  if (!Porffor.object.isObjectOrSymbol(key)) throw new TypeError('Value in WeakMap needs to be an object or symbol');

  Porffor.callThis(__Map_prototype_set, this as Map, key, value);
  return this;
};

export const __WeakMap_prototype_delete = function (this: WeakMap, key: any) {
  if (!Porffor.object.isObjectOrSymbol(key)) return false;
  return Porffor.callThis(__Map_prototype_delete, this as Map, key);
};

export const WeakMap = function (iterable: any): WeakMap {
  if (!new.target) throw new TypeError("Constructor WeakMap requires 'new'");

  const out: WeakMap = __Porffor_hashtableNew(true);
  Porffor.IR.gcBarrier(out, Porffor.TYPES.weakmap);

  if (iterable != null) for (const x of iterable) {
    if (!Porffor.object.isObject(x)) throw new TypeError('Iterator contains non-object');
    Porffor.callThis(__WeakMap_prototype_set, out, x[0], x[1]);
  }

  return out;
};

export const __WeakMap_prototype_toString = function (this: WeakMap) { return '[object WeakMap]'; };
export const __WeakMap_prototype_toLocaleString = function (this: WeakMap) { return Porffor.callThis(__WeakMap_prototype_toString, this); };

// https://github.com/tc39/proposal-upsert
export const __WeakMap_prototype_getOrInsert = function (this: WeakMap, key: any, value: any) {
  if (!Porffor.callThis(__WeakMap_prototype_has, this, key)) {
    Porffor.callThis(__WeakMap_prototype_set, this, key, value);
  }

  return Porffor.callThis(__WeakMap_prototype_get, this, key);
};

export const __WeakMap_prototype_getOrInsertComputed = function (this: WeakMap, key: any, callbackFn: any) {
  if (!Porffor.callThis(__WeakMap_prototype_has, this, key)) {
    Porffor.callThis(__WeakMap_prototype_set, this, key, callbackFn(key));
  }

  return Porffor.callThis(__WeakMap_prototype_get, this, key);
};

// private names: a WeakMap per name per class evaluation
export const __Porffor_private_new = (): WeakMap => new WeakMap();

// keys are only ever objects so an identity probe suffices
export const __Porffor_private_find = (map: WeakMap, obj: any): i32 => {
  const buckets: i32 = Porffor.IR.loadI32(map, 8);
  if (buckets == 0) return -1;

  const keysEntries: i32 = Porffor.IR.loadI32(Porffor.IR.loadI32(map, 0), 4);
  const mask: i32 = Porffor.IR.loadI32(map, 12) - 1;
  const type: i32 = Porffor.type(obj);
  const ptr: i32 = Porffor.IR.ptr(obj);
  let slot: i32 = __Porffor_hashIdentity(obj) & mask;
  while (true) {
    const entry: i32 = Porffor.IR.loadI32(buckets + slot * 4, 0);
    if (entry == 0) return -1;

    if (entry != -1) {
      const key: any = Porffor.IR.loadJv(keysEntries + (entry - 1) * 8, 0);
      if (Porffor.fastAnd(Porffor.IR.ptr(key) == ptr, Porffor.type(key) == type)) return entry - 1;
    }

    slot = (slot + 1) & mask;
  }
};

export const __Porffor_private_add = (map: WeakMap, obj: any, value: any): void => {
  if (__Porffor_private_find(map, obj) != -1) throw new TypeError('Cannot initialize private element twice on the same object');
  if (!__Object_isExtensible(obj)) throw new TypeError('Cannot add private element to non-extensible object');
  Porffor.callThis(__Map_prototype_set, map as Map, obj, value);
};

export const __Porffor_private_index = (map: WeakMap, obj: any): i32 => {
  const index: i32 = __Porffor_private_find(map, obj);
  if (index == -1) throw new TypeError('Object does not have this private element');
  return index;
};

export const __Porffor_private_get = (map: WeakMap, obj: any): any => {
  const vals: any[] = Porffor.IR.loadI32(map, 4);
  return vals[__Porffor_private_index(map, obj)];
};

export const __Porffor_private_set = (map: WeakMap, obj: any, value: any): void => {
  const vals: any[] = Porffor.IR.loadI32(map, 4);
  vals[__Porffor_private_index(map, obj)] = value;
};

export const __Porffor_private_getAccessor = (map: WeakMap, obj: any): any => {
  const get: any = (__Porffor_private_get(map, obj) as any[])[0];
  if (get === undefined) throw new TypeError('Private accessor has no getter');
  return Porffor.callThis(get, obj);
};

export const __Porffor_private_setAccessor = (map: WeakMap, obj: any, value: any): void => {
  const set: any = (__Porffor_private_get(map, obj) as any[])[1];
  if (set === undefined) throw new TypeError('Private accessor has no setter');
  Porffor.callThis(set, obj, value);
};

export const __Porffor_private_setMethod = (map: WeakMap, obj: any): void => {
  __Porffor_private_index(map, obj);
  throw new TypeError('Private method is not writable');
};

export const __Porffor_private_has = (map: WeakMap, obj: any): boolean => {
  if (!Porffor.object.isObject(obj)) throw new TypeError('Right-hand side of private in must be an object');
  return __Porffor_private_find(map, obj) != -1;
};
