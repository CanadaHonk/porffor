import type {} from './porffor.d.ts';

export const __Function_prototype_toString = (_this: Function) => {
  const out: bytestring = Porffor.allocate();

  const prefix: bytestring = 'function ';
  Porffor.bytestring.appendStr(out, prefix);

  Porffor.bytestring.appendStr(out, _this.name);

  const postfix: bytestring = '() { [native code] }';
  Porffor.bytestring.appendStr(out, postfix);
  return out;
};

export const __Function_prototype_toLocaleString = (_this: Function) => __Function_prototype_toString(_this);