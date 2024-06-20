import type {} from './porffor.d.ts';

export const __Object_keys = (obj: any): any[] => {
  const out: any[] = Porffor.allocate();

  const t: i32 = Porffor.rawType(obj);
  if (t == Porffor.TYPES.object) {
    const keys: Set = Porffor.wasm.i32.load(obj, 0, 0);
    for (const x of keys) {
      Porffor.fastPush(out, x);
    }
  } else if (Porffor.fastOr(
    t == Porffor.TYPES.array,
    t == Porffor.TYPES.bytestring,
    t == Porffor.TYPES.string
  )) {
    const len: i32 = obj.length;
    for (let i: i32 = 0; i < len; i++) {
      Porffor.fastPush(out, __Number_prototype_toString(i));
    }
  }

  return out;
};

export const __Object_prototype_toString = (_this: object) => {
  let out: bytestring = '[object Object]';
  return out;
};

export const __Object_prototype_toLocaleString = (_this: object) => __Object_prototype_toLocaleString(_this);