import type {} from './porffor.d.ts';

// 20.3.3.2 Boolean.prototype.toString ()
// https://tc39.es/ecma262/#sec-boolean.prototype.tostring
export function __Boolean_prototype_toString() {
  // 1. Let b be ? ThisBooleanValue(this value).
  // 2. If b is true, return "true"; else return "false".
  let out: bytestring = Porffor.allocate();
  if (this) out = 'true';
    else out = 'false';

  return out;
};

// 20.3.3.3 Boolean.prototype.valueOf ()
// https://tc39.es/ecma262/#sec-boolean.prototype.valueof
export function __Boolean_prototype_valueOf() {
  // 1. Return ? ThisBooleanValue(this value).
  return this;
};