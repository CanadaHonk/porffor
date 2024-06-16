import type {} from './porffor.d.ts';

export const __WeakMap_prototype_has = (_this: WeakMap, key: any) => __Map_prototype_has(_this, key);

export const __WeakMap_prototype_set = (_this: WeakMap, key: any, value: any) => {
  if (Porffor.rawType(key) < 0x04) throw new TypeError('Value in WeakSet needs to be an object or symbol');

  __Map_prototype_set(_this, key, value);
  return _this;
};

export const __WeakMap_prototype_delete = (_this: WeakMap, key: any) => __Map_prototype_delete(_this, key);

export const WeakMap = function (iterable: any): WeakMap {
  if (!new.target) throw new TypeError("Constructor WeakMap requires 'new'");

  const out: WeakMap = new Map(iterable)

  return out;
};

export const __WeakMap_prototype_toString = (_this: WeakMap) => {
  const out: bytestring = '[object WeakMap]';
  return out;
};

export const __WeakMap_prototype_toLocaleString = (_this: WeakMap) => __WeakMap_prototype_toString(_this);