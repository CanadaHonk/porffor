export const Map = function (iterable: any): Map {
  if (!new.target) throw new TypeError("Constructor Map requires 'new'");

  const out: Map = Porffor.allocateBytes(8);

  const keys: Set = Porffor.allocate();
  Porffor.wasm.i32.store(out, keys, 0, 0);

  const vals: any[] = Porffor.allocate();
  Porffor.wasm.i32.store(out, vals, 0, 4);

  return out;
};

export const __Map_prototype_size$get = (_this: Map) => {
  return Porffor.wasm.i32.load(Porffor.wasm.i32.load(_this, 0, 0), 0, 0);
};

export const __Map_prototype_has = (_this: Map, key: any) => {
  const keys: Set = Porffor.wasm.i32.load(_this, 0, 0);
  return __Set_prototype_has(key);
};

export const __Map_prototype_get = (_this: Map, key: any) => {
  const keys: Set = Porffor.wasm.i32.load(_this, 0, 0);
  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);

  const keyIdx: i32 = Porffor.set.indexOf(keys, key);
  if (keyIdx == -1) return undefined;

  return vals[keyIdx];
};

export const __Map_prototype_set = (_this: Map, key: any, value: any) => {
  const keys: Set = Porffor.wasm.i32.load(_this, 0, 0);
  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);

  const size: i32 = Porffor.wasm.i32.load(keys, 0, 0);

  let keyIdx: i32 = Porffor.set.indexOf(keys, key);
  if (keyIdx == -1) {
    // add key if non-existent
    keyIdx = size;
    __Set_prototype_add(keys, key);
  }

  vals[keyIdx] = value;

  return _this;
};

export const __Map_prototype_delete = (_this: Map, key: any) => {
  const keys: Set = Porffor.wasm.i32.load(_this, 0, 0);

  const keyIdx = Porffor.set.indexOf(keys, key);
  if (keyIdx == -1) return false;

  __Set_prototype_delete(keys, key);

  const vals: any[] = Porffor.wasm.i32.load(_this, 0, 4);
  __Array_prototype_splice(keyIdx, 1);

  return true;
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

export const __Map_prototype_keys = (_this: Map) => {
  const keys: Set = Porffor.wasm.i32.load(_this, 0, 0);
  const out: any[] = Porffor.allocate();

  for (const x of keys) {
    out.push(x);
  }

  return out;
};

export const __Map_prototype_values = (_this: Map) => {
  const vals: Set = Porffor.wasm.i32.load(_this, 0, 4);
  const out: any[] = Porffor.allocate();

  for (const x of vals) {
    out.push(x);
  }

  return out;
};