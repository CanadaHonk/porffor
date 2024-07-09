import type {} from './porffor.d.ts';

// todo: support non-bytestring properly
// todo: support constructor/string objects properly
export const String = function (value: any): bytestring {
  // note: this is seperated like this for optimization reasons
  if (!new.target) if (Porffor.rawType(value) == Porffor.TYPES.symbol) return __Symbol_prototype_toString(value);
  return ecma262.ToString(value);
};

export const __String_fromCharCode = (...codes: any[]): bytestring|string => {
  let out: string = Porffor.allocate();

  const len: i32 = codes.length;
  out.length = len;

  let bytestringable: boolean = true;
  for (let i: i32 = 0; i < len; i++) {
    const v: i32 = __ecma262_ToIntegerOrInfinity(codes[i]);
    if (v > 0xFF) bytestringable = false;

    Porffor.wasm.i32.store16(Porffor.wasm`local.get ${out}` + i * 2, v, 0, 4);
  }

  if (bytestringable) {
    let out2: bytestring = Porffor.wasm`local.get ${out}`;
    for (let i: i32 = 0; i < len; i++) {
      Porffor.wasm.i32.store8(
        Porffor.wasm`local.get ${out}` + i,
        Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${out}` + i * 2, 0, 4),
        0, 4);
    }

    return out2;
  }

  return out;
};