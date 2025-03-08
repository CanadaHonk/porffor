import type {} from './porffor.d.ts';

export const __Porffor_compareStrings = (a: any, b: any): boolean => {
  if ((Porffor.type(a) | 0b10000000) != Porffor.TYPES.bytestring) {
    // a is not string or bytestring
    // check if it is bad type or value
    if (Porffor.fastOr(
      a == null,

      Porffor.type(a) == Porffor.TYPES.symbol,
      Porffor.type(a) == Porffor.TYPES.boolean
    )) return false;

    a = ecma262.ToString(a);
  }

  if ((Porffor.type(b) | 0b10000000) != Porffor.TYPES.bytestring) {
    // b is not string or bytestring
    // check if it is bad type or value
    if (Porffor.fastOr(
      b == null,

      Porffor.type(b) == Porffor.TYPES.symbol,
      Porffor.type(b) == Porffor.TYPES.boolean
    )) return false;

    b = ecma262.ToString(b);
  }

  return Porffor.strcmp(a, b);
};

export const __Porffor_concatStrings = (a: any, b: any): any => {
  if ((Porffor.type(a) | 0b10000000) != Porffor.TYPES.bytestring) {
    // a is not string or bytestring
    a = ecma262.ToString(a);
  }

  if ((Porffor.type(b) | 0b10000000) != Porffor.TYPES.bytestring) {
    // b is not string or bytestring
    b = ecma262.ToString(b);
  }

  return Porffor.strcat(a, b);
};