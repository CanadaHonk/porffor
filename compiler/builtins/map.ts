import type {} from './porffor.d.ts';

export const __Map_prototype_size$get = (_this: Map) => {
  return Porffor.wasm.i32.load(Porffor.wasm.i32.load(_this, 0, 0), 0, 0);
};

export const __Map_prototype_has = (_this: Map, key: any) => {
  const keys: any[] = Porffor.wasm.i32.load(_this, 0, 0);
  for (const x of keys) {
    if (x === key) return true;
  }

  return false;
};

export const __Map_prototype_get = (_this: Map, key: any) => {
  const keys: any[] = Porffor.wasm.i32.load(_this, 0, 0);
  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);

  const size: i32 = Porffor.wasm.i32.load(keys, 0, 0);
  for (let i: i32 = 0; i < size; i++) {
    if (keys[i] === key) return vals[i];
  }

  return undefined;
};

export const __Map_prototype_set = (_this: Map, key: any, value: any) => {
  const keys: any[] = Porffor.wasm.i32.load(_this, 0, 0);
  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);

  const size: i32 = keys.length;
  for (let i: i32 = 0; i < size; i++) {
    if (keys[i] === key) {
      vals[i] = value;
      return _this;
    }
  }

  // add key if non-existent
  // increment size by 1
  keys.length = size + 1;

  // write new key and value at end
  keys[size] = key;
  vals[size] = value;

  return _this;
};

export const __Map_prototype_delete = (_this: Map, key: any) => {
  const keys: any[] = Porffor.wasm.i32.load(_this, 0, 0);
  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);

  const size: i32 = keys.length;
  for (let i: i32 = 0; i < size; i++) {
    if (keys[i] === key) {
      Porffor.array.fastRemove(keys, i, size);
      Porffor.array.fastRemove(vals, i, size);
      return true;
    }
  }

  return false;
};

export const __Map_prototype_clear = (_this: Map) => {
  const keys: any[] = Porffor.wasm.i32.load(_this, 0, 0);
  keys.length = 0;

  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);
  vals.length = 0;
};

export const __Map_prototype_forEach = (_this: Map, callbackFn: any) => {
  const keys: any[] = Porffor.wasm.i32.load(_this, 0, 0);
  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);

  const size: i32 = Porffor.wasm.i32.load(keys, 0, 0);

  let i: i32 = 0;
  while (i < size) {
    callbackFn(vals[i], keys[i++], _this);
  }
};

export const Map = function (iterable: any): Map {
  if (!new.target) throw new TypeError("Constructor Map requires 'new'");

  const out: Map = Porffor.allocateBytes(8);

  const keys: any[] = Porffor.allocate();
  const vals: any[] = Porffor.allocate();
  Porffor.wasm.i32.store(out, keys, 0, 0);
  Porffor.wasm.i32.store(out, vals, 0, 4);

  if (iterable != null) for (const x of iterable) {
    if (!Porffor.object.isObject(x)) throw new TypeError('Iterator contains non-object');
    __Map_prototype_set(out, x[0], x[1]);
  }

  return out;
};

export const __Map_prototype_keys = (_this: Map) => {
  const keys: any[] = Porffor.wasm.i32.load(_this, 0, 0);
  const out: any[] = Porffor.allocate();

  for (const x of keys) {
    Porffor.array.fastPush(out, x);
  }

  return out;
};

export const __Map_prototype_values = (_this: Map) => {
  const size: i32 = Porffor.wasm.i32.load(Porffor.wasm.i32.load(_this, 0, 0), 0, 0);
  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);
  const out: any[] = Porffor.allocate();

  for (let i: i32 = 0; i < size; i++) {
    Porffor.array.fastPush(out, vals[i]);
  }

  return out;
};

export const __Map_prototype_toString = (_this: Map) => '[object Map]';
export const __Map_prototype_toLocaleString = (_this: Map) => __Map_prototype_toString(_this);

// https://github.com/tc39/proposal-upsert
export const __Map_prototype_getOrInsert = (_this: Map, key: any, value: any) => {
  if (!__Map_prototype_has(_this, key)) {
    __Map_prototype_set(_this, key, value);
  }

  return __Map_prototype_get(_this, key);
};

export const __Map_prototype_getOrInsertComputed = (_this: Map, key: any, callbackFn: any) => {
  if (!__Map_prototype_has(_this, key)) {
    __Map_prototype_set(_this, key, callbackFn(key));
  }

  return __Map_prototype_get(_this, key);
};