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
    // digits can be >= 2^31: wrap into i32 instead of saturating
    const d: number = digits[i];
    if (d != 0) allZero = false;

    Porffor.IR.storeI32(ptr + i * 4, 4, d | 0);
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

// round half to even, digits are base 2^32 most significant first
export const __Porffor_bigint_toNumber = (x: f64): f64 => {
  if (Math.abs(x) < 0x8000000000000) return x as number;
  const ptr: i32 = x - 0x8000000000000;

  const negative: boolean = Porffor.IR.loadU8(ptr, 0) != 0;
  const len: i32 = Porffor.IR.loadU16(ptr, 2);
  let first: i32 = 0;
  while (first < len && Porffor.IR.loadI32(ptr + first * 4, 4) == 0) first++;
  if (first == len) return 0;

  const top: number = Porffor.IR.loadI32(ptr + first * 4, 4) >>> 0;
  const bits: i32 = (len - first - 1) * 32 + 32 - Math.clz32(top);
  const take: i32 = bits < 53 ? bits : 53;
  let m: number = 0;
  for (let i: i32 = bits - 1; i >= bits - take; i--)
    m = m * 2 + ((Porffor.IR.loadI32(ptr + (len - 1 - (i >> 5)) * 4, 4) >>> (i & 31)) & 1);

  if (bits > 53) {
    const r: i32 = (Porffor.IR.loadI32(ptr + (len - 1 - ((bits - 54) >> 5)) * 4, 4) >>> ((bits - 54) & 31)) & 1;
    let sticky: boolean = false;
    for (let i: i32 = bits - 55; i >= 0; i--) {
      if (((Porffor.IR.loadI32(ptr + (len - 1 - (i >> 5)) * 4, 4) >>> (i & 31)) & 1) != 0) {
        sticky = true;
        break;
      }
    }
    if (r == 1 && (sticky || m % 2 == 1)) m += 1;
    m *= 2 ** (bits - 53);
  }

  if (negative) m = -m;
  return m;
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
  if (Porffor.fastAnd(offset > 0, offset == len)) throw new SyntaxError('Invalid character in BigInt string');

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
    if (digit > 9) {
      digit = (char | 0x20) - 87;
      if (digit < 10) digit = -1; // @ or `
    }
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
    let carry: number = 0;
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

export const __Porffor_bigint_toString = (x: f64, radix: any): string|bytestring => {
  if (Math.abs(x) < 0x8000000000000) return Porffor.callThis(__Number_prototype_toString, x, radix);

  let r: i32 = 10;
  if (radix !== undefined) {
    const rn: number = Math.trunc(ecma262.ToNumber(radix));
    if (Porffor.fastOr(rn < 2, rn > 36)) throw new RangeError('toString() radix argument must be between 2 and 36');
    r = rn;
  }

  const ptr: i32 = x - 0x8000000000000;
  const negative: boolean = Porffor.IR.loadU8(ptr, 0) != 0;
  const len: i32 = Porffor.IR.loadU16(ptr, 2);
  const digits: number[] = Porffor.array.new(len);
  for (let i: i32 = 0; i < len; i++) digits[i] = Porffor.IR.loadI32(ptr + i * 4, 4) >>> 0;

  // base 2^32 needs at most 32 output digits per input digit
  const rev: bytestring = Porffor.malloc(len * 32 + 8);
  let l: i32 = 0;
  let start: i32 = 0;
  while (start < len) {
    let carry: number = 0;
    for (let j: i32 = start; j < len; j++) {
      const v: number = carry * 0x100000000 + digits[j];
      const q: number = Math.floor(v / r);
      carry = v - q * r;
      digits[j] = q;
    }

    let c: i32 = carry;
    if (c < 10) c += 48;
      else c += 87;
    Porffor.IR.storeU8(Porffor.IR.ptr(rev) + l, 4, c);
    l++;

    while (start < len && digits[start] == 0) start++;
  }

  const out: bytestring = Porffor.malloc(l + 8);
  let outPtr: i32 = Porffor.IR.ptr(out);
  if (negative) Porffor.IR.storeU8(outPtr++, 4, 45);
  for (let i: i32 = l - 1; i >= 0; i--) Porffor.IR.storeU8(outPtr++, 4, Porffor.IR.loadU8(Porffor.IR.ptr(rev) + i, 4));
  out.length = outPtr - Porffor.IR.ptr(out);
  return out;
};

// 7.1.14 StringToBigInt (str)
export const __Porffor_bigint_fromStringOrUndefined = (str: string|bytestring): any => {
  try {
    return __ecma262_ToBigInt(str.trim());
  } catch {
    return undefined;
  }
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

// arithmetic on magnitudes as little-endian base 2^16 limbs (products stay exact in f64)
export const __Porffor_bigint_mag = (x: f64): number[] => {
  const out: number[] = Porffor.array.new(8);
  if (Math.abs(x) < 0x8000000000000) {
    let v: number = Math.abs(x);
    while (v > 0) {
      const q: number = Math.floor(v / 65536);
      out.push(v - q * 65536);
      v = q;
    }
    return out;
  }

  const ptr: i32 = x - 0x8000000000000;
  const len: i32 = Porffor.IR.loadU16(ptr, 2);
  for (let i: i32 = len - 1; i >= 0; i--) {
    const d: number = Porffor.IR.loadI32(ptr + i * 4, 4) >>> 0;
    const hi: number = Math.floor(d / 65536);
    out.push(d - hi * 65536);
    out.push(hi);
  }
  while (out.length > 0 && out[out.length - 1] == 0) out.length = out.length - 1;
  return out;
};

export const __Porffor_bigint_isNegative = (x: f64): boolean => {
  if (Math.abs(x) < 0x8000000000000) return x < 0;
  return Porffor.IR.loadU8(x - 0x8000000000000, 0) != 0;
};

export const __Porffor_bigint_fromMag = (negative: boolean, mag: number[]): bigint => {
  const n: i32 = mag.length;
  if (n == 0) return 0 as bigint;

  if (n <= 3) {
    // below 2^48: inline
    let v: number = 0;
    for (let i: i32 = n - 1; i >= 0; i--) v = v * 65536 + mag[i];
    if (negative) v = -v;
    return v as bigint;
  }

  const nd: i32 = (n + 1) >> 1;
  const digits: number[] = Porffor.array.new(nd);
  digits.length = nd;
  for (let i: i32 = 0; i < nd; i++) {
    const lo: number = mag[i * 2];
    const hi: number = i * 2 + 1 < n ? mag[i * 2 + 1] : 0;
    digits[nd - 1 - i] = hi * 65536 + lo;
  }
  return __Porffor_bigint_fromDigits(negative, digits);
};

export const __Porffor_bigint_cmpMag = (a: number[], b: number[]): i32 => {
  if (a.length != b.length) return a.length < b.length ? -1 : 1;
  for (let i: i32 = a.length - 1; i >= 0; i--) {
    if (a[i] != b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};

export const __Porffor_bigint_addMag = (a: number[], b: number[]): number[] => {
  const n: i32 = a.length > b.length ? a.length : b.length;
  const out: number[] = Porffor.array.new(n + 1);
  let carry: number = 0;
  for (let i: i32 = 0; i < n; i++) {
    let s: number = carry;
    if (i < a.length) s += a[i];
    if (i < b.length) s += b[i];
    carry = s >= 65536 ? 1 : 0;
    out.push(s - carry * 65536);
  }
  if (carry != 0) out.push(carry);
  return out;
};

// a >= b
export const __Porffor_bigint_subMag = (a: number[], b: number[]): number[] => {
  const out: number[] = Porffor.array.new(a.length);
  let borrow: number = 0;
  for (let i: i32 = 0; i < a.length; i++) {
    let s: number = a[i] - borrow;
    if (i < b.length) s -= b[i];
    borrow = s < 0 ? 1 : 0;
    out.push(s + borrow * 65536);
  }
  while (out.length > 0 && out[out.length - 1] == 0) out.length = out.length - 1;
  return out;
};

export const __Porffor_bigint_mulMag = (a: number[], b: number[]): number[] => {
  const n: i32 = a.length + b.length;
  const out: number[] = Porffor.array.new(n);
  out.length = n;
  for (let i: i32 = 0; i < n; i++) out[i] = 0;
  for (let i: i32 = 0; i < a.length; i++) {
    let carry: number = 0;
    const ai: number = a[i];
    for (let j: i32 = 0; j < b.length; j++) {
      const t: number = out[i + j] + ai * b[j] + carry;
      carry = Math.floor(t / 65536);
      out[i + j] = t - carry * 65536;
    }
    let k: i32 = i + b.length;
    while (carry != 0) {
      const t: number = out[k] + carry;
      carry = Math.floor(t / 65536);
      out[k] = t - carry * 65536;
      k++;
    }
  }
  while (out.length > 0 && out[out.length - 1] == 0) out.length = out.length - 1;
  return out;
};

export const __Porffor_bigint_divModMag = (a: number[], b: number[]): any[] => {
  const q: number[] = Porffor.array.new(a.length);
  q.length = a.length;
  for (let i: i32 = 0; i < a.length; i++) q[i] = 0;

  if (b.length == 1) {
    const d: number = b[0];
    let rem: number = 0;
    for (let i: i32 = a.length - 1; i >= 0; i--) {
      const cur: number = rem * 65536 + a[i];
      const qd: number = Math.floor(cur / d);
      q[i] = qd;
      rem = cur - qd * d;
    }
    const rm: number[] = Porffor.array.new(1);
    if (rem != 0) rm.push(rem);
    while (q.length > 0 && q[q.length - 1] == 0) q.length = q.length - 1;
    return [ q, rm ];
  }

  let r: number[] = Porffor.array.new(b.length + 1);
  for (let i: i32 = a.length * 16 - 1; i >= 0; i--) {
    let carry: number = Math.floor(a[i >> 4] / (1 << (i & 15))) % 2;
    for (let j: i32 = 0; j < r.length; j++) {
      const t: number = r[j] * 2 + carry;
      carry = t >= 65536 ? 1 : 0;
      r[j] = t - carry * 65536;
    }
    if (carry != 0) r.push(carry);
    if (__Porffor_bigint_cmpMag(r, b) >= 0) {
      r = __Porffor_bigint_subMag(r, b);
      q[i >> 4] += 1 << (i & 15);
    }
  }
  while (q.length > 0 && q[q.length - 1] == 0) q.length = q.length - 1;
  return [ q, r ];
};

export const __Porffor_bigint_twos = (mag: number[], negative: boolean, len: i32): number[] => {
  const out: number[] = Porffor.array.new(len);
  out.length = len;
  // negative: ~(mag - 1)
  let borrow: number = negative ? 1 : 0;
  for (let i: i32 = 0; i < len; i++) {
    let d: number = i < mag.length ? mag[i] : 0;
    if (negative) {
      d -= borrow;
      borrow = 0;
      if (d < 0) {
        d += 65536;
        borrow = 1;
      }
      d = 65535 - d;
    }
    out[i] = d;
  }
  return out;
};

export const __Porffor_bigint_fromTwos = (t: number[], negative: boolean): bigint => {
  if (negative) {
    // magnitude: ~t + 1
    let carry: number = 1;
    for (let i: i32 = 0; i < t.length; i++) {
      let d: number = 65535 - t[i] + carry;
      carry = 0;
      if (d == 65536) {
        d = 0;
        carry = 1;
      }
      t[i] = d;
    }
  }
  while (t.length > 0 && t[t.length - 1] == 0) t.length = t.length - 1;
  return __Porffor_bigint_fromMag(negative, t);
};

export const __Porffor_bigint_shlMag = (m: number[], n: number): number[] => {
  const limbs: number = Math.floor(n / 16);
  if (limbs + m.length > 4096) throw new RangeError('Maximum BigInt size exceeded');
  const scale: number = 2 ** (n % 16);
  const out: number[] = Porffor.array.new(m.length + limbs + 1);
  for (let i: i32 = 0; i < limbs; i++) out.push(0);
  let carry: number = 0;
  for (let i: i32 = 0; i < m.length; i++) {
    const v: number = m[i] * scale + carry;
    carry = Math.floor(v / 65536);
    out.push(v - carry * 65536);
  }
  if (carry > 0) out.push(carry);
  return out;
};

export const __Porffor_bigint_shrMag = (m: number[], n: number): number[] => {
  const limbs: number = Math.floor(n / 16);
  const scale: number = 2 ** (n % 16);
  const out: number[] = Porffor.array.new(8);
  for (let i: number = limbs; i < m.length; i++) {
    const high: number = i + 1 < m.length ? m[i + 1] % scale : 0;
    out.push(Math.floor(m[i] / scale) + high * (65536 / scale));
  }
  while (out.length > 0 && out[out.length - 1] == 0) out.length = out.length - 1;
  return out;
};

// op: 0 + 1 - 2 * 3 / 4 % 5 ** 6 & 7 | 8 ^ 9 << 10 >> 11 >>>
export const __Porffor_bigint_arith = (op: i32, a: f64, b: f64): bigint => {
  const an: boolean = __Porffor_bigint_isNegative(a);
  const bn: boolean = __Porffor_bigint_isNegative(b);
  const am: number[] = __Porffor_bigint_mag(a);
  const bm: number[] = __Porffor_bigint_mag(b);

  if (op >= 6 && op <= 8) {
    const len: i32 = (am.length > bm.length ? am.length : bm.length) + 1;
    const at: number[] = __Porffor_bigint_twos(am, an, len);
    const bt: number[] = __Porffor_bigint_twos(bm, bn, len);
    for (let i: i32 = 0; i < len; i++) at[i] = op == 6 ? at[i] & bt[i] : op == 7 ? at[i] | bt[i] : at[i] ^ bt[i];
    return __Porffor_bigint_fromTwos(at, op == 6 ? an && bn : op == 7 ? an || bn : an != bn);
  }

  if (op == 11) throw new TypeError('BigInts have no unsigned right shift, use >> instead');
  if (op == 9 || op == 10) {
    let n: number = __Porffor_bigint_toNumber(b);
    let left: boolean = op == 9;
    if (n < 0) {
      n = -n;
      left = !left;
    }
    if (left) return __Porffor_bigint_fromMag(an, __Porffor_bigint_shlMag(am, n));
    if (!an) return __Porffor_bigint_fromMag(false, __Porffor_bigint_shrMag(am, n));

    // floor for negatives: -(((|a| - 1) >> n) + 1)
    const one: number[] = Porffor.array.new(1);
    one.push(1);
    return __Porffor_bigint_fromMag(true, __Porffor_bigint_addMag(__Porffor_bigint_shrMag(__Porffor_bigint_subMag(am, one), n), one));
  }

  if (op == 0 || op == 1) {
    const bneg: boolean = op == 1 ? !bn : bn;
    if (an == bneg) return __Porffor_bigint_fromMag(an, __Porffor_bigint_addMag(am, bm));
    const c: i32 = __Porffor_bigint_cmpMag(am, bm);
    if (c == 0) return 0 as bigint;
    if (c > 0) return __Porffor_bigint_fromMag(an, __Porffor_bigint_subMag(am, bm));
    return __Porffor_bigint_fromMag(bneg, __Porffor_bigint_subMag(bm, am));
  }

  if (op == 2) return __Porffor_bigint_fromMag(an != bn, __Porffor_bigint_mulMag(am, bm));

  if (op == 3 || op == 4) {
    // truncating division, the remainder takes the dividend's sign
    if (bm.length == 0) throw new RangeError('Division by zero');
    const qr: any[] = __Porffor_bigint_divModMag(am, bm);
    if (op == 3) return __Porffor_bigint_fromMag(an != bn, qr[0]);
    return __Porffor_bigint_fromMag(an, qr[1]);
  }

  if (bn) throw new RangeError('Exponent must be non-negative');
  let e: number = __Porffor_bigint_toNumber(b);
  const odd: boolean = e % 2 == 1;
  let result: number[] = Porffor.array.new(1);
  result.push(1);
  let base: number[] = am;
  while (e > 0) {
    if (e % 2 == 1) result = __Porffor_bigint_mulMag(result, base);
    e = Math.floor(e / 2);
    if (e > 0) {
      if (base.length > 4096) throw new RangeError('Maximum BigInt size exceeded');
      base = __Porffor_bigint_mulMag(base, base);
    }
    if (result.length > 4096) throw new RangeError('Maximum BigInt size exceeded');
  }
  return __Porffor_bigint_fromMag(an && odd, result);
};

export const __Porffor_bigint_binop = (op: i32, a: any, b: any): any => {
  if (op == 0) {
    a = ecma262.ToPrimitive.Number(a);
    b = ecma262.ToPrimitive.Number(b);
    if (Porffor.fastOr((Porffor.type(a) | 0b10000000) == Porffor.TYPES.bytestring, (Porffor.type(b) | 0b10000000) == Porffor.TYPES.bytestring)) {
      const sa: any = ecma262.ToString(a);
      const sb: any = ecma262.ToString(b);
      return sa + sb;
    }
  }
  if (Porffor.type(a) != Porffor.TYPES.bigint) a = ecma262.ToNumeric(a);
  if (Porffor.type(b) != Porffor.TYPES.bigint) b = ecma262.ToNumeric(b);
  if (Porffor.fastOr(Porffor.type(a) != Porffor.TYPES.bigint, Porffor.type(b) != Porffor.TYPES.bigint))
    throw new TypeError('Cannot mix BigInts and non-BigInts in numeric expressions');
  return __Porffor_bigint_arith(op, a, b);
};
