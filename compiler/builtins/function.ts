import type {} from './porffor.d.ts';

// `eval` is invalid syntax so work around
export const _eval = (source: string) => {
  throw new SyntaxError('Dynamic code evaluation is not supported');
};

export const Function = function (source: string) {
  throw new SyntaxError('Dynamic code evaluation is not supported');
};

export const __Function_prototype_toString = (_this: Function) => {
  const out: bytestring = Porffor.malloc(256);

  Porffor.bytestring.appendStr(out, 'function ');
  Porffor.bytestring.appendStr(out, __Porffor_funcLut_name(_this));
  Porffor.bytestring.appendStr(out, '() { [native code] }');
  return out;
};

export const __Function_prototype_toLocaleString = (_this: Function) => __Function_prototype_toString(_this);

export const __Function_prototype_apply = (_this: Function, thisArg: any, argsArray: any) => {
  return Porffor.call(_this, Array.from(argsArray ?? []) as any[], thisArg, null);
};

export const __Function_prototype_bind = (_this: Function, thisArg: any, argsArray: any) => {
  // todo: no good way to bind without dynamic functions or closure yet, just return function
  return _this;
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