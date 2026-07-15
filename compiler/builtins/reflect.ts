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

  try {
    return delete target[prop];
  } catch {
    return false;
  }
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

  const out: any[] = Porffor.array.new(4);
  let i: i32 = 0;

  if (Porffor.type(target) == Porffor.TYPES.array) {
    const arrayLen: i32 = (target as any[]).length;
    for (let j: i32 = 0; j < arrayLen; j++) {
      if (!__Porffor_array_has(target as any[], j)) continue;
      out[i++] = Porffor.callThis(__Number_prototype_toString, j);
    }
  }

  target = __Porffor_object_underlying(target);
  if (Porffor.type(target) == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.object.entriesPtr(target);
    const endPtr: i32 = ptr + Porffor.IR.loadU16(target, 0) * 20;

    for (; ptr < endPtr; ptr += 20) {
      let key: any = Porffor.as(Porffor.IR.loadI32(ptr, 4), Porffor.IR.loadU8(ptr, 18));

      out[i++] = key;
    }
  }

  out.length = i;
  return out;
};


export const __Reflect_apply = (target: any, thisArgument: any, argumentsList: any) => {
  return Porffor.call(target, argumentsList, thisArgument, null);
};

export const __Reflect_construct = (target: any, argumentsList: any, newTarget: any = target) => {
  // todo: giving undefined/null to newTarget should not default
  if (!__ecma262_IsConstructor(target)) throw new TypeError('Target is not a constructor');
  if (!__ecma262_IsConstructor(newTarget)) throw new TypeError('newTarget is not a constructor');
  return Porffor.call(target, argumentsList, null, newTarget);
};
