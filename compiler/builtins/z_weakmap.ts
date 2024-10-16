import type {} from './porffor.d.ts';

export const __WeakMap_prototype_has = (_this: WeakMap, key: any) => {
  const map: Map = _this;
  return __Map_prototype_has(map, key);
};

export const __WeakMap_prototype_set = (_this: WeakMap, key: any, value: any) => {
  if (!Porffor.object.isObjectOrSymbol(key)) throw new TypeError('Value in WeakSet needs to be an object or symbol');

  const map: Map = _this;
  __Map_prototype_set(map, key, value);
  return _this;
};

export const __WeakMap_prototype_delete = (_this: WeakMap, key: any) => {
  const map: Map = _this;
  return __Map_prototype_delete(map, key);
};

export const WeakMap = function (iterable: any): WeakMap {
  if (!new.target) throw new TypeError("Constructor WeakMap requires 'new'");

  const out: WeakMap = Porffor.allocateBytes(8);

  const keys: Set = Porffor.allocate();
  Porffor.wasm.i32.store(out, keys, 0, 0);

  const vals: any[] = Porffor.allocate();
  Porffor.wasm.i32.store(out, vals, 0, 4);

  if (iterable != null) for (const x of iterable) {
    if (!Porffor.object.isObject(x)) throw new TypeError('Iterator contains non-object');
    __WeakMap_prototype_set(out, x[0], x[1]);
  }

  return out;
};

export const __WeakMap_prototype_toString = (_this: WeakMap) => '[object WeakMap]';
export const __WeakMap_prototype_toLocaleString = (_this: WeakMap) => __WeakMap_prototype_toString(_this);