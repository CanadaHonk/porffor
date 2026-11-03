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

  __Porffor_hashtableSet(this, key, value);
  // minor gcs rescan from the lowest written entry
  const index: i32 = __Porffor_hashtableLookup(this, key);
  if (index < Porffor.IR.loadI32(this, 20)) Porffor.IR.storeI32(this, 20, index);
  Porffor.IR.gcBarrier(this, Porffor.TYPES.weakmap);
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

// private names: a symbol per name per class evaluation, elements are private-flagged own properties
export const __Porffor_private_new = (): symbol => Symbol();

export const __Porffor_private_find = (name: symbol, obj: any): i32 => {
  const holder: any = Porffor.type(obj) == Porffor.TYPES.object ? obj : __Porffor_object_underlyingIfAny(obj);
  if (holder == null) return 0;
  return __Porffor_object_find(holder, name, 0);
};

export const __Porffor_private_add = (name: symbol, obj: any, value: any): void => {
  if (__Porffor_private_find(name, obj) != 0) throw new TypeError('Cannot initialize private element twice on the same object');
  if (!__Object_isExtensible(obj)) throw new TypeError('Cannot add private element to non-extensible object');
  const holder: any = Porffor.type(obj) == Porffor.TYPES.object ? obj : __Porffor_object_underlying(obj);
  __Porffor_object_slotWrite(holder, __Porffor_object_add(holder, name, 0, 0b10000), value);
};

export const __Porffor_private_get = (name: symbol, obj: any): any => {
  const slot: i32 = __Porffor_private_find(name, obj);
  if (slot == 0) throw new TypeError('Cannot read private member from an object whose class did not declare it');
  return __Porffor_object_slotValue(Porffor.type(obj) == Porffor.TYPES.object ? obj : __Porffor_object_underlying(obj), slot - 1);
};

export const __Porffor_private_set = (name: symbol, obj: any, value: any): void => {
  const slot: i32 = __Porffor_private_find(name, obj);
  if (slot == 0) throw new TypeError('Cannot write private member to an object whose class did not declare it');
  __Porffor_object_slotWrite(Porffor.type(obj) == Porffor.TYPES.object ? obj : __Porffor_object_underlying(obj), slot - 1, value);
};

export const __Porffor_private_getAccessor = (name: symbol, obj: any): any => {
  const get: any = (__Porffor_private_get(name, obj) as any[])[0];
  if (get === undefined) throw new TypeError('Private accessor has no getter');
  return Porffor.callThis(get, obj);
};

export const __Porffor_private_setAccessor = (name: symbol, obj: any, value: any): void => {
  const set: any = (__Porffor_private_get(name, obj) as any[])[1];
  if (set === undefined) throw new TypeError('Private accessor has no setter');
  Porffor.callThis(set, obj, value);
};

export const __Porffor_private_setMethod = (name: symbol, obj: any): void => {
  if (__Porffor_private_find(name, obj) == 0) throw new TypeError('Object does not have this private element');
  throw new TypeError('Private method is not writable');
};

export const __Porffor_private_has = (name: symbol, obj: any): boolean => {
  if (!Porffor.object.isObject(obj)) throw new TypeError('Right-hand side of private in must be an object');
  return __Porffor_private_find(name, obj) != 0;
};
