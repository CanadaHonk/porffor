// todo: support non-bytestring properly
export const String = (value: any): bytestring => {
  if (Porffor.rawType(value) == Porffor.TYPES.symbol) return __Symbol_prototype_toString(value);
  return __ecma262_ToString(value);
};

// todo: support constructor/string objects properly
export const String$constructor = (value: any): bytestring => {
  return __ecma262_ToString(value);
};