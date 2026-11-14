// @porf --closures
import type {} from './porffor.d.ts';

export const __Porffor_decorate_check = (value: any): any => {
  if (Porffor.type(value) != Porffor.TYPES.function) throw new TypeError('Decorators must return a function');
  return value;
};

export const __Porffor_decorate_metadata = (parent: any): object => {
  const inherited: any = parent == null ? undefined : parent[Symbol.metadata];
  return Object.create(inherited === undefined ? null : inherited);
};

// decorators as [ receiver, decorator ] pairs, fields return [ initializers, extra initializers ]
export const __Porffor_decorate = (decorators: any[], kind: any, value: any, name: any, isStatic: boolean, privateName: any, metadata: object, extra: any[]): any => {
  const isField: boolean = kind == 'field' || kind == 'accessor';
  const accessor: boolean = kind == 'getter' || kind == 'setter' || kind == 'accessor';
  const isPrivate: boolean = privateName !== undefined;
  // array literals here are static data
  const initializers: any[] = Porffor.array.new(0);
  if (isField) extra = Porffor.array.new(0);

  for (let i: i32 = decorators.length - 2; i >= 0; i -= 2) {
    const context: any = { kind, name };
    if (kind != 'class') {
      context.static = isStatic;
      context.private = isPrivate;
      const access: any = context.access = {};
      access.has = isPrivate ? (obj: any): boolean => __Porffor_private_has(privateName, obj) : (obj: any): boolean => name in obj;
      if (kind != 'setter') access.get = isPrivate
        ? (accessor ? (obj: any): any => __Porffor_private_getAccessor(privateName, obj) : (obj: any): any => __Porffor_private_get(privateName, obj))
        : (obj: any): any => obj[name];
      if (kind == 'setter' || isField) access.set = isPrivate
        ? (accessor ? (obj: any, value: any): void => __Porffor_private_setAccessor(privateName, obj, value) : (obj: any, value: any): void => __Porffor_private_set(privateName, obj, value))
        : (obj: any, value: any): void => { obj[name] = value; };
    }

    // closures capture by value
    const state: any = { done: false };
    context.addInitializer = (initializer: any): void => {
      if (state.done) throw new TypeError('Cannot add initializers after decoration has completed');
      Porffor.array.fastPush(extra, __Porffor_decorate_check(initializer));
    };
    context.metadata = metadata;

    const args: any[] = Porffor.array.new(2);
    args[0] = kind == 'accessor' ? { get: value[0], set: value[1] } : value;
    args[1] = context;
    const result: any = Porffor.call(decorators[i + 1], args, decorators[i], null);
    state.done = true;
    if (result === undefined) continue;

    if (kind == 'accessor') {
      if (!Porffor.object.isObject(result)) throw new TypeError('Accessor decorators must return an object or undefined');
      const get: any = result.get;
      if (get !== undefined) value[0] = __Porffor_decorate_check(get);
      const set: any = result.set;
      if (set !== undefined) value[1] = __Porffor_decorate_check(set);
      const init: any = result.init;
      if (init !== undefined) initializers.unshift(__Porffor_decorate_check(init));
    } else if (kind == 'field') initializers.unshift(__Porffor_decorate_check(result));
      else value = __Porffor_decorate_check(result);
  }

  if (!isField) return value;
  const record: any[] = Porffor.array.new(2);
  record[0] = initializers;
  record[1] = extra;
  return record;
};

export const __Porffor_decorate_init = (thisArg: any, record: any[], value: any): any => {
  const initializers: any[] = record[0];
  for (let i: i32 = 0; i < initializers.length; i++) {
    const args: any[] = Porffor.array.new(1);
    args[0] = value;
    value = Porffor.call(initializers[i], args, thisArg, null);
  }
  return value;
};

export const __Porffor_decorate_extra = (thisArg: any, initializers: any[]): void => {
  for (let i: i32 = 0; i < initializers.length; i++) Porffor.call(initializers[i], Porffor.array.new(0), thisArg, null);
};

export const __Porffor_accessor = (storage: symbol, key: any): any[] => {
  const pair: any[] = Porffor.array.new(2);
  pair[0] = function (this: any): any {
    return __Porffor_private_get(storage, this);
  };
  pair[1] = function (this: any, value: any): void {
    __Porffor_private_set(storage, this, value);
  };
  __Porffor_function_setName(pair[0], key, 'get ');
  __Porffor_function_setName(pair[1], key, 'set ');
  return pair;
};
