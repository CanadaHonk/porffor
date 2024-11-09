import type {} from './porffor.d.ts';

export const __Function_prototype_toString = (_this: Function) => {
  const out: bytestring = Porffor.allocate();

  Porffor.bytestring.appendStr(out, 'function ');
  Porffor.bytestring.appendStr(out, _this.name);
  Porffor.bytestring.appendStr(out, '() { [native code] }');
  return out;
};

export const __Function_prototype_toLocaleString = (_this: Function) => __Function_prototype_toString(_this);

export const __Function_prototype_apply = (_this: Function, thisArg: any, argsArray: any) => {
  argsArray = Array.from(argsArray ?? []);
  return Reflect.apply(_this, thisArg, argsArray);
};