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


// 22.1.1.1 String (value)
// https://tc39.es/ecma262/#sec-string-constructor-string-value
export const String = function (...args: any[]): string|bytestring|StringObject {
  let s: bytestring|string = '';

  // 1. If value is not present, then
  // a. Let s be the empty String.
  // s is already empty

  // 2. Else,
  if (args.length > 0) {
    const value: any = args[0];

    // a. If NewTarget is undefined and value is a Symbol, return SymbolDescriptiveString(value).
    if (!new.target && Porffor.type(value) == Porffor.TYPES.symbol) return __Symbol_prototype_toString(value);

    // b. Let s be ? ToString(value).
    s = ecma262.ToString(value);
  }

  // 3. If NewTarget is undefined, return s.
  if (!new.target) return s;

  // 4. Return StringCreate(s, ? GetPrototypeFromConstructor(NewTarget, "%String.prototype%")).

  // force bytestrings to strings
  if (Porffor.type(s) == Porffor.TYPES.bytestring) s = Porffor.bytestringToString(s);

  return s as StringObject;
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

// in f64 file as returns NaN which returns 0 in i32
export const __String_prototype_charCodeAt = (_this: string, index: number) => {
  const len: i32 = _this.length;

  index |= 0;
  if (Porffor.fastOr(index < 0, index >= len)) return NaN;

  return Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${_this}` + index * 2, 0, 4);
};

export const __ByteString_prototype_charCodeAt = (_this: bytestring, index: number) => {
  const len: i32 = _this.length;

  index |= 0;
  if (Porffor.fastOr(index < 0, index >= len)) return NaN;

  return Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${_this}` + index, 0, 4);
};