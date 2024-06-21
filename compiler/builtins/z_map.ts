import type {} from './porffor.d.ts';

export const __Map_prototype_size$get = (_this: Map) => {
  return Porffor.wasm.i32.load(Porffor.wasm.i32.load(_this, 0, 0), 0, 0);
};

export const __Map_prototype_has = (_this: Map, key: any) => {
  const keys: Set = Porffor.wasm.i32.load(_this, 0, 0);
  return __Set_prototype_has(keys, key);
};

export const __Map_prototype_get = (_this: Map, key: any) => {
  const keys: Set = Porffor.wasm.i32.load(_this, 0, 0);
  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);

  const size: i32 = Porffor.wasm.i32.load(keys, 0, 0);

  for (let i: i32 = 0; i < size; i++) {
    if (Porffor.set.read(keys, i) === key) return vals[i];
  }

  return undefined;
};

export const __Map_prototype_set = (_this: Map, key: any, value: any) => {
  const keys: Set = Porffor.wasm.i32.load(_this, 0, 0);
  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);

  const size: i32 = Porffor.wasm.i32.load(keys, 0, 0);

  for (let i: i32 = 0; i < size; i++) {
    if (Porffor.set.read(keys, i) === key) {
      vals[i] = value;
      return _this;
    }
  }

  // add key if non-existent
  // increment size by 1
  Porffor.wasm.i32.store(keys, size + 1, 0, 0);

  // write new key at end
  Porffor.set.write(keys, size, key);

  // write new value at end
  vals[size] = value;

  return _this;
};

export const __Map_prototype_delete = (_this: Map, key: any) => {
  const keys: Set = Porffor.wasm.i32.load(_this, 0, 0);
  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);

  const size: i32 = Porffor.wasm.i32.load(keys, 0, 0);

  for (let i: i32 = 0; i < size; i++) {
    if (Porffor.set.read(keys, i) === key) {
      __Set_prototype_delete(keys, key);
      __Array_prototype_splice(vals, i, 1);

      return true;
    }
  }

  return false;
};

export const __Map_prototype_clear = (_this: Map) => {
  const keys: Set = Porffor.wasm.i32.load(_this, 0, 0);
  __Set_prototype_clear(keys);

  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);
  vals.length = 0;
};

export const __Map_prototype_forEach = (_this: Map, callbackFn: any) => {
  const keys: Set = Porffor.wasm.i32.load(_this, 0, 0);
  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);

  const size: i32 = Porffor.wasm.i32.load(keys, 0, 0);

  let i: i32 = 0;
  while (i < size) {
    callbackFn(vals[i], Porffor.set.read(keys, i++), _this);
  }
};

export const Map = function (iterable: any): Map {
  if (!new.target) throw new TypeError("Constructor Map requires 'new'");

  const out: Map = Porffor.allocateBytes(8);

  const keys: Set = Porffor.allocate();
  Porffor.wasm.i32.store(out, keys, 0, 0);

  const vals: any[] = Porffor.allocate();
  Porffor.wasm.i32.store(out, vals, 0, 4);

  if (iterable != null) for (const x of iterable) {
    if (Porffor.rawType(x) < 0x06) throw new TypeError('Iterator contains non-object');
    __Map_prototype_set(out, x[0], x[1]);
  }

  return out;
};

export const __Map_prototype_keys = (_this: Map) => {
  const keys: Set = Porffor.wasm.i32.load(_this, 0, 0);
  const out: any[] = Porffor.allocate();

  for (const x of keys) {
    Porffor.fastPush(out, x);
  }

  return out;
};

export const __Map_prototype_values = (_this: Map) => {
  const size: i32 = Porffor.wasm.i32.load(Porffor.wasm.i32.load(_this, 0, 0), 0, 0);
  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);
  const out: any[] = Porffor.allocate();

  for (let i: i32 = 0; i < size; i++) {
    Porffor.fastPush(out, vals[i]);
  }

  return out;
};

export const __Map_prototype_toString = (_this: Map) => {
  const str: bytestring = '[object Map]';
  return str;
}

export const __Map_prototype_toLocaleString = (_this: Map) => __Map_prototype_toString(_this);