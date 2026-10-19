// @porf --closures
import type {} from './porffor.d.ts';

// `eval` is invalid syntax so work around
export const _eval = (source: string) => {
  throw new SyntaxError('Dynamic code evaluation is not supported');
};

export const Function = function (source: string) {
  throw new SyntaxError('Dynamic code evaluation is not supported');
};

export const __Porffor_function_setName = (fn: any, key: any, prefix: any): void => {
  let name: any = key;
  if (Porffor.type(key) == Porffor.TYPES.symbol) {
    const description: any = (key as Symbol).description;
    name = description === undefined ? '' : '[' + description + ']';
  }

  __Porffor_object_define(__Porffor_object_underlying(fn), 'name', prefix + name, 0b0010);
};

export const __Function_prototype_toString = function (this: Function) {
  const out: bytestring = Porffor.malloc(256);
  Porffor.IR.storeI32(out, 0, 0);

  Porffor.bytestring.appendStr(out, 'function ');
  Porffor.bytestring.appendStr(out, __Porffor_funcLut_name(this));
  Porffor.bytestring.appendStr(out, '() { [native code] }');
  return out;
};

// %ThrowTypeError%, sloppy functions read null
export const __Function_prototype_caller$get = function (this: any) {
  if (Porffor.type(this) == Porffor.TYPES.function && (__Porffor_funcLut_flags(this) & 0b1000) != 0) return null;
  throw new TypeError("'caller' and 'arguments' cannot be accessed on strict functions");
};
export const __Function_prototype_arguments$get = function (this: any) { return Porffor.callThis(__Function_prototype_caller$get, this); };

export const __Function_prototype_toLocaleString = function (this: Function) { return Porffor.callThis(__Function_prototype_toString, this); };

export const __Function_prototype_apply = function (this: Function, thisArg: any, argsArray: any) {
  return Porffor.call(this, Array.from(argsArray ?? []) as any[], thisArg, null);
};

export const __Function_prototype_call = function (this: Function, thisArg: any, ...args: any[]) {
  return Porffor.call(this, args, thisArg, null);
};

export const __Function_prototype_Symbol_hasInstance = function (this: any, V: any) {
  return __Porffor_object_ordinaryHasInstance(this, V);
};

export const __Function_prototype_bind = function (this: Function, thisArg: any, ...args: any[]) {
  // capture the receiver before bound's own `this` shadows it
  const target: Function = this;
  const bound = function (...callArgs: any[]) {
    // new.target passes through, bound itself maps to the target
    if (new.target === undefined) return Porffor.call(target, args.concat(callArgs), thisArg, undefined);
    return Porffor.call(target, args.concat(callArgs), null, new.target === bound ? target : new.target);
  };

  // property/descriptor paths (not funcLut) so chained binds see the bound name/length
  let name: any = (this as any).name;
  if ((Porffor.type(name) | 0b10000000) != Porffor.TYPES.bytestring) name = '';
  Object.defineProperty(bound, 'name', { value: 'bound ' + name, configurable: true });

  const lengthDesc: any = Object.getOwnPropertyDescriptor(this, 'length');
  let length: number = 0;
  if (lengthDesc !== undefined && Porffor.type(lengthDesc.value) == Porffor.TYPES.number) {
    length = ecma262.ToIntegerOrInfinity(lengthDesc.value) - args.length;
    if (length < 0) length = 0;
  }
  Object.defineProperty(bound, 'length', { value: length, configurable: true });

  // bound functions have no own prototype property: drop the one given to constructor closures
  const underlying: any = __Porffor_object_underlying(bound);
  const entryPtr: i32 = __Porffor_object_lookup(underlying, 'prototype', __Porffor_object_hash('prototype'));
  if (entryPtr != 0) {
    Porffor.IR.storeU8(entryPtr, 16, Porffor.IR.loadU8(entryPtr, 16) | 0b0010);
    __Porffor_object_delete(underlying, 'prototype');
  }

  return bound;
};
