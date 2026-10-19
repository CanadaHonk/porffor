// @porf --closures
import type {} from './porffor.d.ts';

// proxies are [ target, handler ] arrays retagged as proxy, revoked = null handler
export const __Porffor_proxy_target = (proxy: any): any => {
  const record: any[] = Porffor.as(proxy, Porffor.TYPES.array);
  return record[0];
};

export const __Porffor_proxy_handler = (proxy: any): any => {
  const record: any[] = Porffor.as(proxy, Porffor.TYPES.array);
  const handler: any = record[1];
  if (handler == null) throw new TypeError('Cannot perform operation on a revoked proxy');
  return handler;
};

export const __Porffor_proxy_trap = (handler: any, name: any): any => {
  const trap: any = handler[name];
  if (trap == null) return undefined;
  if (Porffor.type(trap) != Porffor.TYPES.function) throw new TypeError('Proxy trap is not a function');
  return trap;
};

export const Proxy = function (target: any, handler: any): any {
  if (!new.target) throw new TypeError("Constructor Proxy requires 'new'");
  if (!__Porffor_object_isObject(target)) throw new TypeError('Cannot create proxy with a non-object as target');
  if (!__Porffor_object_isObject(handler)) throw new TypeError('Cannot create proxy with a non-object as handler');

  const record: any[] = Porffor.array.new(2);
  Porffor.array.fastPush(record, target);
  Porffor.array.fastPush(record, handler);
  return Porffor.as(record, Porffor.TYPES.proxy);
};

export const __Proxy_revocable = (target: any, handler: any): object => {
  const proxy: any = new Proxy(target, handler);
  const out: object = {};
  out.proxy = proxy;
  out.revoke = (): void => {
    const record: any[] = Porffor.as(proxy, Porffor.TYPES.array);
    record[1] = null;
  };
  return out;
};

export const __Porffor_proxy_sameValue = (a: any, b: any): boolean => __Object_is(a, b);
export const __Porffor_proxy_isDataDesc = (desc: any): boolean => Porffor.fastOr('value' in desc, 'writable' in desc);

export const __Porffor_proxy_get = (proxy: any, key: any, receiver: any): any => {
  const handler: any = __Porffor_proxy_handler(proxy);
  const target: any = __Porffor_proxy_target(proxy);
  const trap: any = __Porffor_proxy_trap(handler, 'get');
  if (trap === undefined) {
    return __Porffor_object_getWithReceiver(target, key, receiver);
  }

  const result: any = trap.call(handler, target, key, receiver);
  const desc: any = __Object_getOwnPropertyDescriptor(target, key);
  if (desc !== undefined && desc.configurable === false) {
    if (__Porffor_proxy_isDataDesc(desc)) {
      if (desc.writable === false && !__Porffor_proxy_sameValue(result, desc.value)) throw new TypeError('Proxy get trap result differs from a non-writable, non-configurable target property');
    } else if (desc.get === undefined && result !== undefined) throw new TypeError('Proxy get trap returned a value for a non-configurable accessor without a getter');
  }
  return result;
};

export const __Porffor_proxy_set = (proxy: any, key: any, value: any, receiver: any): boolean => {
  const handler: any = __Porffor_proxy_handler(proxy);
  const target: any = __Porffor_proxy_target(proxy);
  const trap: any = __Porffor_proxy_trap(handler, 'set');
  if (trap === undefined) {
    return __Porffor_object_setWithReceiver(target, key, value, receiver);
  }

  const ok: boolean = !!trap.call(handler, target, key, value, receiver);
  if (!ok) return false;
  const desc: any = __Object_getOwnPropertyDescriptor(target, key);
  if (desc !== undefined && desc.configurable === false) {
    if (__Porffor_proxy_isDataDesc(desc)) {
      if (desc.writable === false && !__Porffor_proxy_sameValue(value, desc.value)) throw new TypeError('Proxy set trap succeeded for a non-writable, non-configurable target property');
    } else if (desc.set === undefined) throw new TypeError('Proxy set trap succeeded for a non-configurable accessor without a setter');
  }
  return true;
};

export const __Porffor_proxy_has = (proxy: any, key: any): boolean => {
  const handler: any = __Porffor_proxy_handler(proxy);
  const target: any = __Porffor_proxy_target(proxy);
  const trap: any = __Porffor_proxy_trap(handler, 'has');
  if (trap === undefined) return key in target;

  const ok: boolean = !!trap.call(handler, target, key);
  if (!ok) {
    const desc: any = __Object_getOwnPropertyDescriptor(target, key);
    if (desc !== undefined) {
      if (desc.configurable === false) throw new TypeError('Proxy has trap hid a non-configurable target property');
      if (!__Object_isExtensible(target)) throw new TypeError('Proxy has trap hid a property of a non-extensible target');
    }
  }
  return ok;
};

export const __Porffor_proxy_delete = (proxy: any, key: any): boolean => {
  const handler: any = __Porffor_proxy_handler(proxy);
  const target: any = __Porffor_proxy_target(proxy);
  const trap: any = __Porffor_proxy_trap(handler, 'deleteProperty');
  if (trap === undefined) return __Porffor_object_delete(target, key);

  const ok: boolean = !!trap.call(handler, target, key);
  if (!ok) return false;
  const desc: any = __Object_getOwnPropertyDescriptor(target, key);
  if (desc !== undefined) {
    if (desc.configurable === false) throw new TypeError('Proxy deleteProperty trap removed a non-configurable target property');
    if (!__Object_isExtensible(target)) throw new TypeError('Proxy deleteProperty trap removed a property of a non-extensible target');
  }
  return true;
};

export const __Porffor_proxy_getOwnPropertyDescriptor = (proxy: any, key: any): any => {
  const handler: any = __Porffor_proxy_handler(proxy);
  const target: any = __Porffor_proxy_target(proxy);
  const trap: any = __Porffor_proxy_trap(handler, 'getOwnPropertyDescriptor');
  if (trap === undefined) return __Object_getOwnPropertyDescriptor(target, key);

  const result: any = trap.call(handler, target, key);
  if (result !== undefined && !__Porffor_object_isObject(result)) throw new TypeError('Proxy getOwnPropertyDescriptor trap returned neither object nor undefined');
  const targetDesc: any = __Object_getOwnPropertyDescriptor(target, key);
  if (result === undefined) {
    if (targetDesc === undefined) return undefined;
    if (targetDesc.configurable === false) throw new TypeError('Proxy getOwnPropertyDescriptor trap hid a non-configurable target property');
    if (!__Object_isExtensible(target)) throw new TypeError('Proxy getOwnPropertyDescriptor trap hid a property of a non-extensible target');
    return undefined;
  }

  // ToPropertyDescriptor + CompletePropertyDescriptor
  const desc: object = {};
  const accessor: boolean = Porffor.fastOr('get' in result, 'set' in result);
  if (accessor) {
    if (Porffor.fastOr('value' in result, 'writable' in result)) throw new TypeError('Invalid property descriptor. Cannot both specify accessors and a value or writable attribute');
    desc.get = result.get;
    desc.set = result.set;
    if (desc.get !== undefined && Porffor.type(desc.get) != Porffor.TYPES.function) throw new TypeError('Getter must be a function');
    if (desc.set !== undefined && Porffor.type(desc.set) != Porffor.TYPES.function) throw new TypeError('Setter must be a function');
  } else {
    desc.value = result.value;
    desc.writable = !!result.writable;
  }
  desc.enumerable = !!result.enumerable;
  desc.configurable = !!result.configurable;

  const extensible: boolean = __Object_isExtensible(target);
  if (targetDesc === undefined) {
    if (!extensible) throw new TypeError('Proxy getOwnPropertyDescriptor trap reported a new property on a non-extensible target');
    if (!desc.configurable) throw new TypeError('Proxy getOwnPropertyDescriptor trap reported a non-configurable property that does not exist on the target');
  } else if (!desc.configurable) {
    if (targetDesc.configurable !== false) throw new TypeError('Proxy getOwnPropertyDescriptor trap reported a configurable target property as non-configurable');
    if (Porffor.fastAnd(!accessor, desc.writable === false, targetDesc.writable === true)) throw new TypeError('Proxy getOwnPropertyDescriptor trap reported a writable target property as non-writable');
  }
  return desc;
};

export const __Porffor_proxy_defineProperty = (proxy: any, key: any, desc: any): boolean => {
  const handler: any = __Porffor_proxy_handler(proxy);
  const target: any = __Porffor_proxy_target(proxy);
  const trap: any = __Porffor_proxy_trap(handler, 'defineProperty');
  if (trap === undefined) {
    __Object_defineProperty(target, key, desc);
    return true;
  }

  const ok: boolean = !!trap.call(handler, target, key, desc);
  if (!ok) return false;
  const targetDesc: any = __Object_getOwnPropertyDescriptor(target, key);
  const settingConfigFalse: boolean = Porffor.fastAnd('configurable' in desc, !desc.configurable);
  if (targetDesc === undefined) {
    if (!__Object_isExtensible(target)) throw new TypeError('Proxy defineProperty trap added a property to a non-extensible target');
    if (settingConfigFalse) throw new TypeError('Proxy defineProperty trap defined a non-configurable property that does not exist on the target');
  } else {
    if (Porffor.fastAnd(settingConfigFalse, targetDesc.configurable === true)) throw new TypeError('Proxy defineProperty trap defined a configurable target property as non-configurable');
    if (Porffor.fastAnd(__Porffor_proxy_isDataDesc(targetDesc), targetDesc.configurable === false, targetDesc.writable === true, 'writable' in desc, !desc.writable)) throw new TypeError('Proxy defineProperty trap made a non-configurable writable target property non-writable');
  }
  return true;
};

export const __Porffor_proxy_ownKeys = (proxy: any): any[] => {
  const handler: any = __Porffor_proxy_handler(proxy);
  const target: any = __Porffor_proxy_target(proxy);
  const trap: any = __Porffor_proxy_trap(handler, 'ownKeys');
  if (trap === undefined) return __Reflect_ownKeys(target);

  const result: any = trap.call(handler, target);
  if (!__Porffor_object_isObject(result)) throw new TypeError('Proxy ownKeys trap result is not an object');
  let len: number = ecma262.ToIntegerOrInfinity(result.length);
  if (len < 0) len = 0;
  const keys: any[] = Porffor.array.new(4);
  for (let i: number = 0; i < len; i++) {
    const key: any = result[i];
    const t: i32 = Porffor.type(key);
    if (Porffor.fastAnd(t != Porffor.TYPES.string, t != Porffor.TYPES.bytestring, t != Porffor.TYPES.symbol)) throw new TypeError('Proxy ownKeys trap result must contain only strings and symbols');
    if (keys.includes(key)) throw new TypeError('Proxy ownKeys trap result contains duplicate entries');
    Porffor.array.fastPush(keys, key);
  }

  const extensible: boolean = __Object_isExtensible(target);
  const targetKeys: any[] = __Reflect_ownKeys(target);
  let uncheckedCount: i32 = keys.length;
  for (let i: i32 = 0; i < targetKeys.length; i++) {
    const key: any = targetKeys[i];
    const desc: any = __Object_getOwnPropertyDescriptor(target, key);
    const present: boolean = keys.includes(key);
    if (Porffor.fastAnd(desc !== undefined, desc.configurable === false)) {
      if (!present) throw new TypeError('Proxy ownKeys trap result must include all non-configurable target keys');
      uncheckedCount--;
    } else if (!extensible) {
      if (!present) throw new TypeError('Proxy ownKeys trap result must include all keys of a non-extensible target');
      uncheckedCount--;
    }
  }
  if (Porffor.fastAnd(!extensible, uncheckedCount != 0)) throw new TypeError('Proxy ownKeys trap result must not add keys to a non-extensible target');
  return keys;
};

export const __Porffor_proxy_getPrototypeOf = (proxy: any): any => {
  const handler: any = __Porffor_proxy_handler(proxy);
  const target: any = __Porffor_proxy_target(proxy);
  const trap: any = __Porffor_proxy_trap(handler, 'getPrototypeOf');
  if (trap === undefined) return __Object_getPrototypeOf(target);

  const proto: any = trap.call(handler, target);
  if (!__Porffor_object_isObjectOrNull(proto)) throw new TypeError('Proxy getPrototypeOf trap returned neither object nor null');
  if (__Object_isExtensible(target)) return proto;
  if (!__Porffor_proxy_sameValue(proto, __Object_getPrototypeOf(target))) throw new TypeError('Proxy getPrototypeOf trap result differs from the prototype of a non-extensible target');
  return proto;
};

export const __Porffor_proxy_setPrototypeOf = (proxy: any, proto: any): boolean => {
  const handler: any = __Porffor_proxy_handler(proxy);
  const target: any = __Porffor_proxy_target(proxy);
  const trap: any = __Porffor_proxy_trap(handler, 'setPrototypeOf');
  if (trap === undefined) return __Reflect_setPrototypeOf(target, proto);

  const ok: boolean = !!trap.call(handler, target, proto);
  if (!ok) return false;
  if (__Object_isExtensible(target)) return true;
  if (!__Porffor_proxy_sameValue(proto, __Object_getPrototypeOf(target))) throw new TypeError('Proxy setPrototypeOf trap changed the prototype of a non-extensible target');
  return true;
};

export const __Porffor_proxy_isExtensible = (proxy: any): boolean => {
  const handler: any = __Porffor_proxy_handler(proxy);
  const target: any = __Porffor_proxy_target(proxy);
  const trap: any = __Porffor_proxy_trap(handler, 'isExtensible');
  if (trap === undefined) return __Object_isExtensible(target);

  const ok: boolean = !!trap.call(handler, target);
  if (ok != __Object_isExtensible(target)) throw new TypeError('Proxy isExtensible trap result differs from the target');
  return ok;
};

export const __Porffor_proxy_preventExtensions = (proxy: any): boolean => {
  const handler: any = __Porffor_proxy_handler(proxy);
  const target: any = __Porffor_proxy_target(proxy);
  const trap: any = __Porffor_proxy_trap(handler, 'preventExtensions');
  if (trap === undefined) return __Reflect_preventExtensions(target);

  const ok: boolean = !!trap.call(handler, target);
  if (Porffor.fastAnd(ok, __Object_isExtensible(target))) throw new TypeError('Proxy preventExtensions trap reported success for an extensible target');
  return ok;
};

export const __Porffor_proxy_typeof = (proxy: any): bytestring => {
  const target: any = __Porffor_proxy_target(proxy);
  if (Porffor.type(target) == Porffor.TYPES.function) return 'function';
  if (Porffor.type(target) == Porffor.TYPES.proxy) return __Porffor_proxy_typeof(target);
  return 'object';
};

export const __Porffor_proxy_isCallable = (proxy: any): boolean => {
  const target: any = __Porffor_proxy_target(proxy);
  if (Porffor.type(target) == Porffor.TYPES.function) return true;
  if (Porffor.type(target) == Porffor.TYPES.proxy) return __Porffor_proxy_isCallable(target);
  return false;
};

export const __Porffor_proxy_call = (proxy: any, thisArg: any, newTarget: any, ...args: any[]): any => {
  const target: any = __Porffor_proxy_target(proxy);
  const handler: any = __Porffor_proxy_handler(proxy);
  if (!__Porffor_proxy_isCallable(proxy)) throw new TypeError('proxy target is not a function');

  if (Porffor.type(newTarget) != Porffor.TYPES.undefined) {
    if (!__ecma262_IsConstructor(target)) throw new TypeError('proxy target is not a constructor');
    const trap: any = __Porffor_proxy_trap(handler, 'construct');
    if (trap === undefined) return Porffor.call(target, args, null, newTarget);

    const result: any = trap.call(handler, target, args, newTarget);
    if (!__Porffor_object_isObject(result)) throw new TypeError('proxy [[Construct]] must return an object');
    return result;
  }

  const trap: any = __Porffor_proxy_trap(handler, 'apply');
  if (trap === undefined) return Porffor.call(target, args, thisArg, null);
  return trap.call(handler, target, thisArg, args);
};
