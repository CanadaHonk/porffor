// @porf --closures
import type {} from './porffor.d.ts';

// `eval` is invalid syntax so work around
export const _eval = (source: string) => {
  throw new SyntaxError('Dynamic code evaluation is not supported');
};

export const Function = function (source: string) {
  throw new SyntaxError('Dynamic code evaluation is not supported');
};

export const __Function_prototype_toString = function (this: Function) {
  const out: bytestring = Porffor.malloc(256);
  Porffor.IR.storeI32(out, 0, 0);

  Porffor.bytestring.appendStr(out, 'function ');
  Porffor.bytestring.appendStr(out, __Porffor_funcLut_name(this));
  Porffor.bytestring.appendStr(out, '() { [native code] }');
  return out;
};

export const __Function_prototype_toLocaleString = function (this: Function) { return Porffor.callThis(__Function_prototype_toString, this); };

export const __Function_prototype_apply = function (this: Function, thisArg: any, argsArray: any) {
  return Porffor.call(this, Array.from(argsArray ?? []) as any[], thisArg, null);
};

export const __Function_prototype_call = function (this: Function, thisArg: any, ...args: any[]) {
  return Porffor.call(this, args, thisArg, null);
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
  Object.defineProperty(bound, 'name', { value: 'bound ' + (this as any).name, configurable: true });

  let length: f64 = (Object.getOwnPropertyDescriptor(this, 'length') as any).value - args.length;
  if (length < 0) length = 0;
  Object.defineProperty(bound, 'length', { value: length, configurable: true });

  return bound;
};


export const __Porffor_generateArgumentsObject = (argc: i32, hasRest: boolean, ...args: any[]) => {
  let obj: object = {}, i: i32 = 0, limit: i32 = args.length;
  if (hasRest) limit--;
  limit = Math.min(argc, limit);

  while (i < limit) {
    obj[i] = args[i];
    i++;
  }

  if (hasRest) {
    const rest: any[] = args[limit];
    const len: i32 = rest.length;
    for (let j: i32 = 0; j < len; j++) {
      obj[i] = rest[j];
      i++;
    }
  }

  obj.length = i;
  return obj;
};
