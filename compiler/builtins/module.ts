// @porf --closures
import type {} from './porffor.d.ts';

// non-extensible mirror of the exports so proxy invariants hold
export const __Porffor_module_namespace = (names: any[], getters: object, evaluate: any): any => {
  const deferred: boolean = evaluate !== undefined;

  const target: object = Porffor.object.new(4);
  __Porffor_object_setPrototype(target, null);
  // a deferred namespace's then is never an export property
  for (let i: i32 = 0; i < names.length; i++) {
    if (Porffor.fastAnd(deferred, names[i] === 'then')) continue;
    __Porffor_object_fastAdd(target, names[i], undefined, 0b1100);
  }
  __Porffor_object_fastAdd(target, Symbol.toStringTag, deferred ? 'Deferred Module' : 'Module', 0b0000);
  __Object_preventExtensions(target);

  const symbolLike = (key: any): boolean => Porffor.fastOr(Porffor.type(key) == Porffor.TYPES.symbol, Porffor.fastAnd(deferred, key === 'then'));

  const handler: object = Porffor.object.new(12);
  handler.getPrototypeOf = (): any => null;
  handler.setPrototypeOf = (t: any, proto: any): boolean => proto === null;
  handler.isExtensible = (): boolean => false;
  handler.preventExtensions = (): boolean => true;

  handler.getOwnPropertyDescriptor = (t: any, key: any): any => {
    if (symbolLike(key)) return __Object_getOwnPropertyDescriptor(t, key);
    if (deferred) evaluate();
    if (!__Object_hasOwn(getters, key)) return undefined;

    const desc: object = {};
    desc.value = getters[key];
    desc.writable = true;
    desc.enumerable = true;
    desc.configurable = false;
    return desc;
  };

  handler.defineProperty = (t: any, key: any, desc: any): boolean => {
    if (symbolLike(key)) return __Reflect_defineProperty(t, key, desc);
    if (deferred) evaluate();
    if (!__Object_hasOwn(getters, key)) return false;

    if (desc.configurable === true) return false;
    if (desc.enumerable === false) return false;
    if (Porffor.fastOr('get' in desc, 'set' in desc)) return false;
    if (desc.writable === false) return false;
    if ('value' in desc) return __Object_is(desc.value, getters[key]);
    return true;
  };

  handler.has = (t: any, key: any): boolean => {
    if (symbolLike(key)) return key in t;
    if (deferred) evaluate();
    return __Object_hasOwn(getters, key);
  };

  handler.get = (t: any, key: any): any => {
    if (symbolLike(key)) return t[key];
    if (deferred) evaluate();
    if (!__Object_hasOwn(getters, key)) return undefined;
    return getters[key];
  };

  handler.set = (): boolean => false;

  handler.deleteProperty = (t: any, key: any): boolean => {
    if (symbolLike(key)) return __Reflect_deleteProperty(t, key);
    if (deferred) evaluate();
    return !__Object_hasOwn(getters, key);
  };

  handler.ownKeys = (): any[] => {
    if (deferred) evaluate();
    const out: any[] = Porffor.array.new(names.length + 1);
    for (let i: i32 = 0; i < names.length; i++) out[i] = names[i];
    out[names.length] = Symbol.toStringTag;
    return out;
  };

  return new Proxy(target, handler);
};

export const __Porffor_module_resolve = (dir: any, spec: any): any => {
  if (!Porffor.fastOr(spec.startsWith('./'), spec.startsWith('../'), spec.startsWith('/'))) return spec;

  const parts: any[] = Porffor.array.new(8);
  const segments: any[] = (spec.startsWith('/') ? spec : dir + '/' + spec).split('/');
  for (let i: i32 = 0; i < segments.length; i++) {
    const x: any = segments[i];
    if (x == '..') parts.pop();
      else if (Porffor.fastAnd(x != '.', x != '')) parts.push(x);
  }

  return '/' + parts.join('/');
};
