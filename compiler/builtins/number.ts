import type {} from './porffor.d.ts';

// 21.1.1.1 Number (value)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-number-constructor-number-value
export const Number = function (value: any): number|any {
  let n: number = 0;

  // 1. If value is present, then
  // todo: handle undefined (NaN) and not present (0) args differently
  if (Porffor.type(value) != Porffor.TYPES.undefined) {
    // a. Let prim be ? ToNumeric(value).
    let prim: any = value;
    if (Porffor.object.isObject(prim)) prim = __ecma262_ToPrimitive_Number(prim);

    // b. If prim is a BigInt, let n be 𝔽(ℝ(prim)).
    // c. Otherwise, let n be prim.
    if (Porffor.type(prim) == Porffor.TYPES.bigint) n = __Porffor_bigint_toNumber(prim);
      else n = ecma262.ToNumber(prim);
  }

  // 2. Else,
  // a. Let n be +0𝔽.
  // n is already 0 (from init value)

  // 3. If NewTarget is undefined, return n.
  if (!new.target) return n;

  // 4. Let O be ? OrdinaryCreateFromConstructor(NewTarget, "%Number.prototype%", « [[NumberData]] »).
  // 5. Set O.[[NumberData]] to n.
  // 6. Return O.
  return n as NumberObject;
};

export const isNaN = (value: any): boolean => {
  const number: number = ecma262.ToNumber(value);
  return number != number;
};

export const __Number_isNaN = (value: any): boolean =>
  Porffor.type(value) == Porffor.TYPES.number && value != value;

export const isFinite = (value: any): boolean => {
  const number: number = ecma262.ToNumber(value);
  const delta: number = number - number;
  return delta == delta;
};

export const __Number_isFinite = (value: any): boolean => {
  if (Porffor.type(value) != Porffor.TYPES.number) return false;
  const delta: number = value - value;
  return delta == delta;
};

export const __Number_isInteger = (value: any): boolean => Porffor.type(value) == Porffor.TYPES.number && value % 1 == 0;

export const __Number_isSafeInteger = (value: any): boolean => {
  if (Porffor.type(value) != Porffor.TYPES.number) return false;
  if (value % 1 != 0) return false;
  return value >= -9007199254740991 && value <= 9007199254740991;
};

// radix: number|any for type check
export const __Number_prototype_toString = function (this: number, radix: number|any) {
  let n: number = this;
  if (Porffor.type(radix) != Porffor.TYPES.number) {
    // todo: string to number
    radix = 10;
  }

  radix = Math.trunc(radix);
  if (radix < 2 || radix > 36) {
    throw new RangeError('toString() radix argument must be between 2 and 36');
  }

  let out: bytestring = '';
  Porffor.c`out = porf_num_to_radix(n, (i32)radix.val);`;
  return out;
};

export const __Number_prototype_toFixed = function (this: number, fractionDigits: number) {
  let n: number = this;
  fractionDigits = Math.trunc(fractionDigits);
  if (fractionDigits < 0 || fractionDigits > 100) {
    throw new RangeError('toFixed() fractionDigits argument must be between 0 and 100');
  }

  let out: bytestring = '';
  Porffor.c`out = porf_num_to_fixed(n, (i32)fractionDigits.val);`;
  return out;
};

export const __Number_prototype_toLocaleString = function (this: number) { return Porffor.callThis(__Number_prototype_toString, this, 10); };

// fractionDigits: number|any for type check
export const __Number_prototype_toExponential = function (this: number, fractionDigits: number|any) {
  let n: number = this;
  let f: i32 = -1;
  if (Porffor.type(fractionDigits) == Porffor.TYPES.number) {
    fractionDigits = Math.trunc(fractionDigits);
    if (Number.isFinite(n) && (fractionDigits < 0 || fractionDigits > 100)) {
      throw new RangeError('toExponential() fractionDigits argument must be between 0 and 100');
    }
    f = fractionDigits;
  }

  let out: bytestring = '';
  Porffor.c`out = porf_num_to_exponential(n, f);`;
  return out;
};

export const __Number_prototype_toPrecision = function (this: number, precision: any) {
  let n: number = this;
  let out: bytestring = '';
  if (Porffor.type(precision) == Porffor.TYPES.undefined) {
    Porffor.c`out = porf_num_to_str(n);`;
    return out;
  }

  const p: i32 = ecma262.ToIntegerOrInfinity(precision);
  if (Number.isFinite(n) && (p < 1 || p > 100)) {
    throw new RangeError('toPrecision() argument must be between 1 and 100');
  }

  Porffor.c`out = porf_num_to_precision(n, p);`;
  return out;
};

// 21.1.3.7 Number.prototype.valueOf ()
// https://tc39.es/ecma262/#sec-number.prototype.valueof
export const __Number_prototype_valueOf = function (this: number) {
  // 1. Return ? ThisNumberValue(this value).
  return this as f64;
};


export const parseInt = (input: any, radix: any): f64 => {
  input = ecma262.ToString(input).trimStart();
  radix = ecma262.ToIntegerOrInfinity(radix);
  if (!Number.isFinite(radix)) radix = 0;

  let n: f64 = 0;
  Porffor.c`n = porf_parse_int(input, (i32)radix.val);`;
  return n;
};

export const __Number_parseInt = (input: any, radix: any): f64 => parseInt(input, radix);

export const parseFloat = (input: any): f64 => {
  input = ecma262.ToString(input).trimStart();
  if (input.length == 0) return NaN;

  let n: f64 = 0;
  Porffor.c`n = porf_str_to_num(input, 0);`;
  return n;
};

export const __Number_parseFloat = (input: any): f64 => parseFloat(input);
