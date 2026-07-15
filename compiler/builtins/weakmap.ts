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
