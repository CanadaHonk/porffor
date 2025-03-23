import type {} from './porffor.d.ts';

export const __Function_prototype_toString = (_this: Function) => {
  const out: bytestring = Porffor.allocate();

  Porffor.bytestring.appendStr(out, 'function ');
  Porffor.bytestring.appendStr(out, __Porffor_funcLut_name(_this));
  Porffor.bytestring.appendStr(out, '() { [native code] }');
  return out;
};

export const __Function_prototype_toLocaleString = (_this: Function) => __Function_prototype_toString(_this);

export const __Function_prototype_apply = (_this: Function, thisArg: any, argsArray: any) => {
  argsArray = Array.from(argsArray ?? []);
  return Porffor.call(_this, argsArray, thisArg, null);
};

export const __Function_prototype_bind = (_this: Function, thisArg: any, argsArray: any) => {
  // todo: no good way to bind without dynamic functions or closure yet, just return function
  return _this;
};