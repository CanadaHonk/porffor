import type {} from './porffor.d.ts';

export const __Reflect_get = (target: any, prop: any, receiver: any = target) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(target) == Porffor.TYPES.proxy) return __Porffor_proxy_get(target, ecma262.ToPropertyKey(prop), receiver);
  }
  if (receiver !== target) return __Porffor_object_getWithReceiver(target, prop, receiver);

  return target[prop];
};

export const __Reflect_set = (target: any, prop: any, value: any, receiver: any = target) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(target) == Porffor.TYPES.proxy) return __Porffor_proxy_set(target, ecma262.ToPropertyKey(prop), value, receiver);
  }

  // typed array [[Set]] with another receiver ignores invalid integer indices
  if (Porffor.fastAnd(
    Porffor.type(target) >= Porffor.TYPES.uint8clampedarray,
    Porffor.type(target) <= Porffor.TYPES.float64array,
    Porffor.type(prop) == Porffor.TYPES.number,
    receiver !== target
  )) {
    if (!__Porffor_typedArray_validIndex(target, prop)) return true;
  }
  if (receiver !== target) return __Porffor_object_setWithReceiver(target, prop, value, receiver);

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
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(target) == Porffor.TYPES.proxy) return __Porffor_proxy_defineProperty(target, ecma262.ToPropertyKey(prop), descriptor);
  }

  try {
    Object.defineProperty(target, prop, descriptor);
    return true;
  } catch {
    return false;
  }
};

export const __Reflect_deleteProperty = (target: any, prop: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(target) == Porffor.TYPES.proxy) return __Porffor_proxy_delete(target, ecma262.ToPropertyKey(prop));
  }

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
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(target) == Porffor.TYPES.proxy) return __Porffor_proxy_preventExtensions(target);
  }

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
  if (!Porffor.object.isObjectOrNull(proto)) throw new TypeError('Prototype should be an object or null');
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(target) == Porffor.TYPES.proxy) return __Porffor_proxy_setPrototypeOf(target, proto);
  }

  try {
    Object.setPrototypeOf(target, proto);
    return true;
  } catch {
    return false;
  }
};

export const __Reflect_ownKeys = (target: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(target) == Porffor.TYPES.proxy) return __Porffor_proxy_ownKeys(target);
  }

  return __Porffor_object_ownKeys(target, 0b011);
};


export const __Reflect_apply = (target: any, thisArgument: any, argumentsList: any) => {
  return Porffor.call(target, argumentsList, thisArgument, null);
};

export const __Reflect_construct = (target: any, argumentsList: any, newTarget: any = target) => {
  // todo: giving undefined/null to newTarget should not default
  if (!__ecma262_IsConstructor(target)) throw new TypeError('Target is not a constructor');
  if (!__ecma262_IsConstructor(newTarget)) throw new TypeError('newTarget is not a constructor');
  const out: any = Porffor.call(target, argumentsList, null, newTarget);

  // builtins create instances with their default prototype: swap in newTarget's
  if (newTarget !== target) {
    const t: i32 = Porffor.type(out);
    if (Porffor.fastOr(
      Porffor.fastAnd(t != Porffor.TYPES.object, t != Porffor.TYPES.function, t != Porffor.TYPES.proxy),
      __Object_getPrototypeOf(out) === target.prototype
    )) {
      const proto: any = newTarget.prototype;
      if (Porffor.object.isObject(proto)) __Object_setPrototypeOf(out, proto);
    }
  }

  return out;
};
