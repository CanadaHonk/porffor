import type {} from './porffor.d.ts';

// digits is an array of u32s as digits in base 2^32
export const __Porffor_bigint_fromDigits = (negative: boolean, digits: i32[]): bigint => {
  const len: i32 = digits.length;
  if (len > 16383) throw new RangeError('Maximum BigInt size exceeded'); // (65536 - 4) / 4

  const ptr: i32 = Porffor.malloc(4 + len * 4);

  Porffor.IR.storeU8(ptr, 0, negative ? 1 : 0); // sign
  Porffor.IR.storeU16(ptr, 2, len); // digit count

  let allZero: boolean = true;
  for (let i: i32 = 0; i < len; i++) {
    const d: i32 = digits[i];
    if (d != 0) allZero = false;

    Porffor.IR.storeI32(ptr + i * 4, 4, d);
  }

  if (allZero) {
    return 0 as bigint;
  }

  return (ptr + 0x8000000000000) as bigint;
};

export const __Porffor_bigint_fromNumber = (n: number): bigint => {
  if (!Number.isInteger(n) || !Number.isFinite(n)) throw new RangeError('Cannot use non-integer as BigInt');
  if (Math.abs(n) < 0x8000000000000) return n as bigint;

  const negative: boolean = n < 0;
  n = Math.abs(n);

  const digits: i32[] = Porffor.array.new(4);
  while (n > 0) {
    digits.unshift(n % 0x100000000);
    n = Math.trunc(n / 0x100000000);
  }

  return __Porffor_bigint_fromDigits(negative, digits);
};

export const __Porffor_bigint_toNumber = (x: f64): f64 => {
  if (Math.abs(x) < 0x8000000000000) return x as number;
  x -= 0x8000000000000;

  const negative: boolean = Porffor.IR.loadU8(x, 0) != 0;
  const len: i32 = Porffor.IR.loadU16(x, 2);

  let out: number = 0;
  for (let i: i32 = 0; i < len; i++) {
    const d: number = Porffor.IR.loadI32(x + i * 4, 4) >>> 0;
    out = out * 0x100000000 + d;
  }

  if (negative) out = -out;
  return out;
};

export const __Porffor_bigint_fromString = (n: string|bytestring): bigint => {
  const len: i32 = n.length;

  let negative: boolean = false;
  let offset: i32 = 0;
  if (n[0] == '-') {
    negative = true;
    offset = 1;
  } else if (n[0] == '+') {
    offset = 1;
  }

  let radix: i32 = 10;
  if (len - offset >= 2 && n[offset] == '0') {
    const prefix: i32 = n.charCodeAt(offset + 1) | 0x20;
    if (prefix == 120) { // x
      radix = 16;
      offset += 2;
    } else if (prefix == 111) { // o
      radix = 8;
      offset += 2;
    } else if (prefix == 98) { // b
      radix = 2;
      offset += 2;
    }
  }

  // n -> base 2^32 digits (most to least significant)
  // 4294967295 -> [ 4294967295 ]
  // 4294967296 -> [ 1, 0 ]
  // 4294967297 -> [ 1, 1 ]

  const BASE: number = 0x100000000; // 2^32
  const digitLen: i32 = len - offset;
  const digits: i32[] = Porffor.array.new(digitLen);
  digits.length = digitLen;

  let i: i32 = 0;
  let acc: number = 0;
  while (i < digitLen) {
    const char: i32 = n.charCodeAt(offset + i);
    let digit: i32 = char - 48;
    if (digit > 9) digit = (char | 0x20) - 87;
    if (Porffor.fastOr(digit < 0, digit >= radix)) throw new SyntaxError('Invalid character in BigInt string');

    digits[i++] = digit;
    acc = acc * radix + digit;
  }

  if (acc < 0x8000000000000) {
    // inline if small enough
    if (negative) acc = -acc;
    return acc as bigint;
  }

  const result: i32[] = Porffor.array.new(digitLen);
  while (digits.length > 0) {
    let carry: i32 = 0;
    for (let j: i32 = 0; j < digits.length; j++) {
      let value: number = carry * radix + digits[j];
      let quotient: i32 = Math.floor(value / BASE);
      carry = value % BASE;

      digits[j] = quotient;
    }

    while (digits.length > 0 && digits[0] == 0) digits.shift();
    if (carry != 0 || digits.length > 0) result.unshift(carry);
  }

  return __Porffor_bigint_fromDigits(negative, result);
};

export const __Porffor_bigint_toString = (x: number, radix: any): string|bytestring => {
  // todo: actually use bigint
  return Porffor.callThis(__Number_prototype_toString, Math.trunc(__Porffor_bigint_toNumber(x)), radix);
};

// 7.1.13 ToBigInt (argument)
// https://tc39.es/ecma262/#sec-tobigint
export const __ecma262_ToBigInt = (argument: any): bigint => {
  // BigInt: already primitive, ToPrimitive would return it unchanged
  if (Porffor.type(argument) == Porffor.TYPES.bigint) return argument;

  // 1. Let prim be ? ToPrimitive(argument, number).
  const prim: any = ecma262.ToPrimitive.Number(argument);

  // 2. Return the value that prim corresponds to in Table 12.
  // Table 12: BigInt Conversions
  // Argument Type 	Result
  // BigInt 	Return prim.
  if (Porffor.type(prim) == Porffor.TYPES.bigint) return prim;

  // String
  //     1. Let n be StringToBigInt(prim).
  //     2. If n is undefined, throw a SyntaxError exception.
  //     3. Return n.
  if ((Porffor.type(prim) | 0b10000000) == Porffor.TYPES.bytestring) {
    // folded literals allow signed radix; StringToBigInt does not
    if ((prim[0] == '-' || prim[0] == '+') && prim.length >= 3 && prim[1] == '0') {
      const prefix: i32 = prim.charCodeAt(2) | 0x20;
      if (prefix == 120 || prefix == 111 || prefix == 98)
        throw new SyntaxError('Invalid character in BigInt string');
    }

    return __Porffor_bigint_fromString(prim);
  }

  // Boolean 	Return 1n if prim is true and 0n if prim is false.
  if (Porffor.type(prim) == Porffor.TYPES.boolean) return prim ? 1n : 0n;

  // Number 	Throw a TypeError exception.
  // Symbol 	Throw a TypeError exception.
  // Undefined 	Throw a TypeError exception.
  // Null 	Throw a TypeError exception.
  throw new TypeError('Cannot convert to BigInt');
};

// 21.2.1.1 BigInt (value)
// https://tc39.es/ecma262/#sec-bigint-constructor-number-value
export const BigInt = (value: any): bigint => {
  // 1. If NewTarget is not undefined, throw a TypeError exception.
  // 2. Let prim be ? ToPrimitive(value, number).
  const prim: any = ecma262.ToPrimitive.Number(value);

  // 3. If prim is a Number, return ? NumberToBigInt(prim).
  if (Porffor.type(prim) == Porffor.TYPES.number) return __Porffor_bigint_fromNumber(prim);

  // 4. Otherwise, return ? ToBigInt(prim).
  return __ecma262_ToBigInt(prim);
};

export const __BigInt_asIntN = (bits: any, bigint: any): bigint => {
  bits = ecma262.ToIndex(bits);
  bigint = __ecma262_ToBigInt(bigint);
  if (bits == 0) return 0n;
  if (bits == 64) {
    return __Porffor_bigint_fromS64(__Porffor_bigint_toI64(bigint));
  }

  const mod: number = 2 ** bits;
  const sign: number = 2 ** (bits - 1);
  let n: number = __Porffor_bigint_toNumber(bigint) % mod;
  if (n < 0) n += mod;
  if (n >= sign) n -= mod;
  return __Porffor_bigint_fromNumber(n);
};

export const __BigInt_asUintN = (bits: any, bigint: any): bigint => {
  bits = ecma262.ToIndex(bits);
  bigint = __ecma262_ToBigInt(bigint);
  if (bits == 0) return 0n;
  if (bits == 64) {
    return __Porffor_bigint_fromU64(__Porffor_bigint_toI64(bigint));
  }

  const mod: number = 2 ** bits;
  let n: number = __Porffor_bigint_toNumber(bigint) % mod;
  if (n < 0) n += mod;
  return __Porffor_bigint_fromNumber(n);
};

export const __BigInt_prototype_toString = function (this: bigint, radix: any) {
  return __Porffor_bigint_toString(this, radix);
};

export const __BigInt_prototype_toLocaleString = function (this: bigint) {
  return __Porffor_bigint_toString(this, 10);
};

export const __BigInt_prototype_valueOf = function (this: bigint) {
  return this;
};
