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
  let out: string = Porffor.malloc();

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

export const __String_fromCodePoint = (...codePoints: any[]): string => {
  let out: string = Porffor.malloc();

  const len: i32 = codePoints.length;
  let outLength: i32 = 0;

  for (let i: i32 = 0; i < len; i++) {
    const codepoint: number = ecma262.ToNumber(codePoints[i]);

    if (codepoint != (codepoint | 0)) {
      throw new RangeError('Invalid code point');
    }

    // Check if code point is valid (0 to 0x10FFFF)
    if (Porffor.fastOr(codepoint < 0, codepoint > 0x10FFFF)) {
      throw new RangeError('Invalid code point');
    }

    if (codepoint <= 0xFFFF) {
      // BMP code point - single 16-bit unit
      outLength++;
    } else {
      // Supplementary code point - surrogate pair (2 units)
      outLength += 2;
    }
  }

  out.length = outLength;
  let outIndex: i32 = 0;

  for (let i: i32 = 0; i < len; i++) {
    const codepoint: number = ecma262.ToNumber(codePoints[i]);

    if (codepoint <= 0xFFFF) {
      // BMP code point
      Porffor.wasm.i32.store16(Porffor.wasm`local.get ${out}` + outIndex * 2, codepoint, 0, 4);
      outIndex++;
    } else {
      // Supplementary code point - encode as surrogate pair
      const cpMinusBase: i32 = codepoint - 0x10000;
      const highSurrogate: i32 = 0xD800 + (cpMinusBase >> 10);
      const lowSurrogate: i32 = 0xDC00 + (cpMinusBase & 0x3FF);

      Porffor.wasm.i32.store16(Porffor.wasm`local.get ${out}` + outIndex * 2, highSurrogate, 0, 4);
      Porffor.wasm.i32.store16(Porffor.wasm`local.get ${out}` + outIndex * 2, lowSurrogate, 0, 6);
      outIndex += 2;
    }
  }

  return out;
};

// in f64 file as returns NaN which returns 0 in i32
export const __String_prototype_charCodeAt = (_this: string, index: any) => {
  index = ecma262.ToIntegerOrInfinity(index);

  const len: i32 = _this.length;

  if (Porffor.fastOr(index < 0, index >= len)) return NaN;

  return Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${_this}` + index * 2, 0, 4);
};

export const __ByteString_prototype_charCodeAt = (_this: bytestring, index: any) => {
  index = ecma262.ToIntegerOrInfinity(index);

  const len: i32 = _this.length;

  if (Porffor.fastOr(index < 0, index >= len)) return NaN;

  return Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${_this}` + index, 0, 4);
};

// 22.1.2.4 String.raw ( template, ...substitutions )
// https://tc39.es/ecma262/#sec-string.raw
export const __String_raw = (template: any, ...substitutions: any[]): string => {
  // 1. Let substitutionCount be the number of elements in substitutions.
  const substitutionCount: i32 = substitutions.length;

  // 2. Let cooked be ? ToObject(template).
  // 3. Let literals be ? ToObject(? Get(cooked, "raw")).
  const literals: any = template.raw;
  if (literals == null) throw new TypeError('Cannot convert undefined or null to object');

  // 4. Let literalCount be ? LengthOfArrayLike(literals).
  const literalCount: number = ecma262.ToIntegerOrInfinity(Porffor.type(literals) == Porffor.TYPES.object ? (literals as object)['length'] : literals.length);

  // 5. If literalCount ≤ 0, return the empty String.
  if (literalCount <= 0) return '';

  // 6. Let R be the empty String.
  let R: string = '';

  // 7. Let nextIndex be 0.
  let nextIndex: i32 = 0;

  // 8. Repeat,
  while (true) {
    // a. Let nextLiteralVal be ? Get(literals, ! ToString(𝔽(nextIndex))).
    // b. Let nextLiteral be ? ToString(nextLiteralVal).
    // c. Set R to the string-concatenation of R and nextLiteral.
    R = __Porffor_concatStrings(R, literals[nextIndex]);

    // d. If nextIndex + 1 = literalCount, return R.
    if (nextIndex + 1 == literalCount) return R;

    // e. If nextIndex < substitutionCount, then
    if (nextIndex < substitutionCount) {
      // i. Let nextSubVal be substitutions[nextIndex].
      // ii. Let nextSub be ? ToString(nextSubVal).
      // iii. Set R to the string-concatenation of R and nextSub.
      R = __Porffor_concatStrings(R, substitutions[nextIndex]);
    }

    // f. Set nextIndex to nextIndex + 1.
    nextIndex += 1;
  }
};