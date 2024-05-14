// 20.3.3.2 Boolean.prototype.toString ()
// https://tc39.es/ecma262/#sec-boolean.prototype.tostring
export const __Boolean_prototype_toString = (_this: boolean) => {
  // 1. Let b be ? ThisBooleanValue(this value).
  // 2. If b is true, return "true"; else return "false".
  let out: bytestring = '';
  if (_this) out = 'true';
    else out = 'false';

  return out;
};

// 20.3.3.3 Boolean.prototype.valueOf ()
// https://tc39.es/ecma262/#sec-boolean.prototype.valueof
export const __Boolean_prototype_valueOf = (_this: boolean) => {
  // 1. Return ? ThisBooleanValue(this value).
  return _this;
};
