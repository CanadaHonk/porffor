import type {} from './porffor.d.ts';

export function __WeakMap_prototype_has(key: any) {
  return __Map_prototype_has.call(this, key)
}

export function __WeakMap_prototype_set(key: any, value: any) {
  if (!Porffor.object.isObjectOrSymbol(key)) throw new TypeError('Value in WeakSet needs to be an object or symbol');

  __Map_prototype_set.call(this, key, value);
  return this;
};

export function __WeakMap_prototype_delete(key: any) {
  return __Map_prototype_delete.call(this, key)
};

export function WeakMap(iterable: any): WeakMap {
  if (!new.target) throw new TypeError("Constructor WeakMap requires 'new'");

  const out: WeakMap = Porffor.allocateBytes(8);

  const keys: Set = Porffor.allocate();
  Porffor.wasm.i32.store(out, keys, 0, 0);

  const vals: any[] = Porffor.allocate();
  Porffor.wasm.i32.store(out, vals, 0, 4);

  if (iterable != null) for (const x of iterable) {
    if (!Porffor.object.isObject(x)) throw new TypeError('Iterator contains non-object');
    __WeakMap_prototype_set.call(out, x[0], x[1]);
  }

  return out;
};

export function __WeakMap_prototype_toString() {
  const out: bytestring = '[object WeakMap]';
  return out;
};

export function __WeakMap_prototype_toLocaleString() {
  return __WeakMap_prototype_toString.call(this);
};