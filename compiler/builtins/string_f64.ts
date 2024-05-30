import type {} from './porffor.d.ts';

// todo: support non-bytestring properly
// todo: support constructor/string objects properly
export const String = function (value: any): bytestring {
  if (!new.target && Porffor.rawType(value) == Porffor.TYPES.symbol) return __Symbol_prototype_toString(value);
  return __ecma262_ToString(value);
};