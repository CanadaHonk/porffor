import type {} from './porffor.d.ts';

export const __Porffor_compareStrings = (a: any, b: any): boolean => {
  let at: i32 = Porffor.rawType(a);
  let bt: i32 = Porffor.rawType(b);

  if ((at | 0b10000000) != Porffor.TYPES.bytestring) {
    // a is not string or bytestring
    // check if it is bad type or value
    if (Porffor.fastOr(
      a == null,

      at == Porffor.TYPES.symbol,
      at == Porffor.TYPES.boolean
    )) return false;

    // todo/perf: just use a.toString()?
    a = ecma262.ToString(a);
    at = Porffor.rawType(a);
  }

  if ((bt | 0b10000000) != Porffor.TYPES.bytestring) {
    // b is not string or bytestring
    // check if it is bad type or value
    if (Porffor.fastOr(
      b == null,

      bt == Porffor.TYPES.symbol,
      bt == Porffor.TYPES.boolean
    )) return false;

    // todo/perf: just use b.toString()?
    b = ecma262.ToString(b);
    bt = Porffor.rawType(b);
  }

  // todo: fast path for bs v bs
  // todo: fast path for s  v s
  // todo: fast path for bs v s
  // todo: fast path for s  v bs

  return Porffor.strcmp(a, b);
};