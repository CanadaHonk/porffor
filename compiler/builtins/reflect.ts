import type {} from './porffor.d.ts';

// todo: support receiver
export const __Reflect_get = (target: any, prop: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');

  return target[prop];
};

// todo: support receiver
export const __Reflect_set = (target: any, prop: any, value: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');

  try {
    target[prop] = value;
    return true;
  } catch {
    return false;
  }
};

export const __Reflect_has = (target: any, prop: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');

  return prop in target;
};

export const __Reflect_defineProperty = (target: any, prop: any, descriptor: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');
  if (!Porffor.object.isObject(descriptor)) throw new TypeError('Descriptor is a non-object');

  try {
    Object.defineProperty(target, prop, descriptor);
    return true;
  } catch {
    return false;
  }
};

export const __Reflect_deleteProperty = (target: any, prop: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');

  return delete target[prop];
};

export const __Reflect_getOwnPropertyDescriptor = (target: any, prop: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');

  return Object.getOwnPropertyDescriptor(target, prop);
};

export const __Reflect_isExtensible = (target: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');

  return Object.isExtensible(target);
};

export const __Reflect_preventExtensions = (target: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');

  try {
    Object.preventExtensions(target);
    return true;
  } catch {
    return false;
  }
};

export const __Reflect_getPrototypeOf = (target: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');

  return Object.getPrototypeOf(target);
};

export const __Reflect_setPrototypeOf = (target: any, proto: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');

  try {
    Object.setPrototypeOf(target, proto);
    return true;
  } catch {
    return false;
  }
};

export const __Reflect_ownKeys = (target: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');

  const out: any[] = Porffor.allocate();

  const t: i32 = Porffor.rawType(target);
  if (t == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.wasm`local.get ${target}` + 5;
    const endPtr: i32 = ptr + Porffor.wasm.i32.load(target, 0, 0) * 14;

    let i: i32 = 0;
    for (; ptr < endPtr; ptr += 14) {
      let key: any;
      Porffor.wasm`local raw i32
local msb i32
local.get ${ptr}
i32.to_u
i32.load 0 0
local.set raw

local.get raw
i32.const 30
i32.shr_u
local.tee msb
if i32
  i32.const 5 ;; symbol
  i32.const 67 ;; string
  local.get msb
  i32.const 3
  i32.eq
  select
  local.set ${key+1}

  local.get raw
  i32.const 1073741823
  i32.and ;; unset 2 MSBs
else
  i32.const 195
  local.set ${key+1}

  local.get raw
end
i32.from_u
local.set ${key}`;

      out[i++] = key;
    }

    out.length = i;
  } else {
    if (Porffor.fastOr(
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

    target = __Porffor_object_getObject(target);
    if (Porffor.rawType(target) == Porffor.TYPES.object) {
      const objKeys: any[] = __Reflect_ownKeys(target);
      for (const x of objKeys) Porffor.array.fastPush(out, x);
    }
  }

  return out;
};