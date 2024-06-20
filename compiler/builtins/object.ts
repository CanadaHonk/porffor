import type {} from './porffor.d.ts';

export const __Object_keys = (obj: any): any[] => {
  const out: any[] = Porffor.allocate();

  const t: i32 = Porffor.rawType(obj);
  if (t == Porffor.TYPES.object) {
    const keys: Set = Porffor.wasm.i32.load(obj, 0, 0);
    const size: i32 = Porffor.wasm.i32.load(keys, 0, 0);
    out.length = size;

    for (let i: i32 = 0; i < size; i++) {
      out[i] = Porffor.set.read(keys, i);
    }
  } else if (Porffor.fastOr(
    t == Porffor.TYPES.array,
    t == Porffor.TYPES.bytestring,
    t == Porffor.TYPES.string
  )) {
    const len: i32 = obj.length;
    out.length = len;

    for (let i: i32 = 0; i < len; i++) {
      out[i] = __Number_prototype_toString(i);
    }
  }

  return out;
};

export const __Object_values = (obj: any): any[] => {
  const out: any[] = Porffor.allocate();

  const t: i32 = Porffor.rawType(obj);
  if (t == Porffor.TYPES.object) {
    const size: i32 = Porffor.wasm.i32.load(Porffor.wasm.i32.load(obj, 0, 0), 0, 0);
    const vals: any[] = Porffor.wasm.i32.load(obj, 0, 4);

    out.length = size;
    for (let i: i32 = 0; i < size; i++) {
      out[i] = vals[i];
    }
  } else if (Porffor.fastOr(
    t == Porffor.TYPES.array,
    t == Porffor.TYPES.bytestring,
    t == Porffor.TYPES.string
  )) {
    const len: i32 = obj.length;
    out.length = len;

    for (let i: i32 = 0; i < len; i++) {
      out[i] = obj[i];
    }
  }

  return out;
};

export const __Object_prototype_toString = (_this: object) => {
  let out: bytestring = '[object Object]';
  return out;
};

export const __Object_prototype_toLocaleString = (_this: object) => __Object_prototype_toLocaleString(_this);