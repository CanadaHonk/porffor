// parse exponent after e/E -> value (may be negative) or NaN, strict: NaN on non-digit, else stop there
export const __Porffor_parseExp = (str: unknown, i: i32, len: i32, strict: boolean): f64 => {
  let expNeg: boolean = false;
  let exp: i32 = 0;
  let hasDigit: boolean = false;

  // optional sign
  if (i < len) {
    const sign: i32 = str.charCodeAt(i);
    if (sign == 43) { // +
      i++;
    } else if (sign == 45) { // -
      expNeg = true;
      i++;
    }
  }

  // strict: at least one digit required
  if (strict && i >= len) return NaN;

  // saturate exp well past f64 range so absurd exponents can't wrap i32
  while (i < len) {
    const chr: i32 = str.charCodeAt(i);
    if (chr >= 48 && chr <= 57) { // 0-9
      if (exp < 1000000) exp = (exp * 10) + chr - 48;
      hasDigit = true;
      i++;
    } else {
      if (strict) return NaN;
      break;
    }
  }

  if (!hasDigit) return NaN;

  if (expNeg) return -exp;
  return exp;
};

export const __Porffor_stn_int = (str: unknown, radix: i32, i: i32): f64 => {
  let nMax: i32 = 58;
  if (radix < 10) nMax = 48 + radix;

  let n: f64 = 0;

  const len: i32 = str.length;
  if (len - i == 0) return NaN;

  while (i < len) {
    const chr: i32 = str.charCodeAt(i++);

    if (chr >= 48 && chr < nMax) {
      n = (n * radix) + (chr - 48);
    } else if (radix > 10) {
      if (chr >= 97 && chr < (87 + radix)) {
        n = (n * radix) + (chr - 87);
      } else if (chr >= 65 && chr < (55 + radix)) {
        n = (n * radix) + (chr - 55);
      } else {
        return NaN;
      }
    } else {
      return NaN;
    }
  }

  return n;
};

// correctly-rounded decimal -> f64. fast path: <= 15 sig digits and exact power-of-10
// scale (single rounding). slow path: exact big-decimal buffer normalized into [1,2) by
// digit-wise halving/doubling, then bits extracted with guard+sticky round-to-even
export const __Porffor_stn_float = (str: unknown, i: i32, strict: boolean): f64 => {
  const len: i32 = str.length;
  if (len - i == 0) return NaN;

  // parse into digits d1..dnd (leading zeros skipped), value = 0.d1..dnd * 10^decExp, sticky = dropped nonzero digits
  const NDMAX: i32 = 800;
  const digits: i32 = Porffor.malloc(NDMAX);
  let nd: i32 = 0;
  // possibly-negative quantities stay f64: builtin i32 arith is u32 ops + saturating converts
  let decExp: f64 = 0;
  let seenDigit: boolean = false;
  let seenPoint: boolean = false;
  let leadingZeros: boolean = true;
  let sticky: boolean = false;

  while (i < len) {
    const chr: i32 = str.charCodeAt(i++);

    if (chr >= 48 && chr <= 57) { // 0-9
      const d: i32 = chr - 48;
      seenDigit = true;
      if (d == 0 && leadingZeros) {
        if (seenPoint) decExp--;
      } else {
        leadingZeros = false;
        if (nd < NDMAX) Porffor.IR.storeU8(digits + nd++, 0, d);
          else if (d != 0) sticky = true;
        if (!seenPoint) decExp++;
      }
    } else if (chr == 46) { // .
      if (seenPoint) {
        if (strict) return NaN;
        break;
      }
      seenPoint = true;
    } else if (chr == 69 || chr == 101) { // E or e
      if (!seenDigit) {
        if (strict) return NaN;
        break;
      }
      const exp: f64 = __Porffor_parseExp(str, i, len, strict);
      if (Number.isNaN(exp)) {
        if (strict) return NaN;
        break;
      }
      decExp += exp;
      break;
    } else {
      if (strict) return NaN;
      break;
    }
  }
  if (!seenDigit) return NaN;

  while (nd > 0 && Porffor.IR.loadU8(digits + nd - 1, 0) == 0) nd--;
  if (nd == 0) return 0;

  // fast path: mantissa exact in f64, scale exact power of 10 (<= 1e22)
  const e10: f64 = decExp - nd;
  if (!sticky && nd <= 15 && e10 >= -22 && e10 <= 22) {
    let man: f64 = 0;
    for (let j: i32 = 0; j < nd; j++) man = man * 10 + Porffor.IR.loadU8(digits + j, 0);
    let scale: f64 = 1;
    let k: f64 = e10;
    if (k < 0) k = -k;
    while (k-- > 0) scale *= 10;
    if (e10 < 0) return man / scale;
    return man * scale;
  }

  // beyond any rounding relevance either way
  if (decExp > 310) return Infinity;
  if (decExp < -330) return 0;

  // exact decimal buffer, buf[j] has weight 10^(POINT-1-j), digits live in [lo, hi]
  const CAP: i32 = 2400;
  const POINT: i32 = 1200;
  const buf: i32 = Porffor.malloc(CAP);
  Porffor.IR.fill(buf, 0, CAP);
  let lo: i32 = (POINT - decExp) as i32;
  let hi: i32 = lo + nd - 1;
  for (let j: i32 = 0; j < nd; j++) Porffor.IR.storeU8(buf + lo + j, 0, Porffor.IR.loadU8(digits + j, 0));

  // normalize to [1,2): integer part = digit 1 at POINT-1
  let e2: f64 = 0;
  while (true) {
    if (lo < POINT - 1 || (lo == POINT - 1 && Porffor.IR.loadU8(buf + lo, 0) >= 2)) {
      // integer part 2 or more, halve
      let carry: i32 = 0;
      for (let k: i32 = lo; k <= hi; k++) {
        const cur: i32 = carry * 10 + Porffor.IR.loadU8(buf + k, 0);
        Porffor.IR.storeU8(buf + k, 0, cur >> 1);
        carry = cur & 1;
      }
      if (carry) {
        if (hi + 1 >= CAP) sticky = true;
          else Porffor.IR.storeU8(buf + ++hi, 0, 5);
      }
      while (lo < hi && Porffor.IR.loadU8(buf + lo, 0) == 0) lo++;
      e2++;
      continue;
    }
    if (lo >= POINT) {
      // below 1, double
      let carry: i32 = 0;
      for (let k: i32 = hi; k >= lo; k--) {
        const t: i32 = Porffor.IR.loadU8(buf + k, 0) * 2 + carry;
        if (t >= 10) {
          Porffor.IR.storeU8(buf + k, 0, t - 10);
          carry = 1;
        } else {
          Porffor.IR.storeU8(buf + k, 0, t);
          carry = 0;
        }
      }
      if (carry) Porffor.IR.storeU8(buf + --lo, 0, 1);
      while (hi > lo && Porffor.IR.loadU8(buf + hi, 0) == 0) hi--;
      e2--;
      continue;
    }
    break;
  }

  if (e2 > 1023) return Infinity;

  let bitsAvail: f64 = 53;
  if (e2 < -1022) bitsAvail = 53 + (e2 + 1022);
  if (bitsAvail < 0) return 0;

  // extract bits, invariant: value in [0,2), next bit = integer digit
  let m: f64 = 0;
  let b: i32 = 0;
  let empty: boolean = false;
  while (b < bitsAvail) {
    let bit: i32 = 0;
    if (lo == POINT - 1) {
      bit = Porffor.IR.loadU8(buf + lo, 0);
      Porffor.IR.storeU8(buf + lo, 0, 0);
      lo = POINT;
      while (lo <= hi && Porffor.IR.loadU8(buf + lo, 0) == 0) lo++;
    }
    m = m * 2 + bit;
    b++;
    if (lo > hi) {
      empty = true;
      while (b < bitsAvail) {
        m *= 2;
        b++;
      }
      break;
    }

    // double for the next bit
    let carry: i32 = 0;
    for (let k: i32 = hi; k >= lo; k--) {
      const t: i32 = Porffor.IR.loadU8(buf + k, 0) * 2 + carry;
      if (t >= 10) {
        Porffor.IR.storeU8(buf + k, 0, t - 10);
        carry = 1;
      } else {
        Porffor.IR.storeU8(buf + k, 0, t);
        carry = 0;
      }
    }
    if (carry) Porffor.IR.storeU8(buf + --lo, 0, 1);
    while (hi > lo && Porffor.IR.loadU8(buf + hi, 0) == 0) hi--;
  }

  // round to nearest even: guard = next bit, sticky = rest
  if (!empty) {
    let guard: i32 = 0;
    if (lo == POINT - 1) {
      guard = Porffor.IR.loadU8(buf + lo, 0);
      Porffor.IR.storeU8(buf + lo, 0, 0);
      lo = POINT;
      while (lo <= hi && Porffor.IR.loadU8(buf + lo, 0) == 0) lo++;
    }
    if (lo <= hi) sticky = true;
    if (guard && (sticky || m % 2 == 1)) m += 1;
  }

  // m * 2^(e2 - bitsAvail + 1), both exact
  let k: f64 = e2 - bitsAvail + 1;
  let r: f64 = m;
  while (k > 0) {
    r *= 2;
    k--;
  }
  while (k < 0) {
    r *= 0.5;
    k++;
  }
  return r;
};

// 7.1.4.1.1 StringToNumber (str)
// https://tc39.es/ecma262/#sec-stringtonumber
export const __ecma262_StringToNumber = (str: string|bytestring): number => {
  // trim whitespace
  str = str.trim();

  if (str.length == 0) return 0;

  // check 0x, 0o, 0b prefixes
  const first: i32 = str.charCodeAt(0);
  const second: i32 = str.charCodeAt(1);

  if (first == 48) {
    // starts with 0, check for prefixes

    if (second == 120 || second == 88) { // 0x (hex)
      return __Porffor_stn_int(str, 16, 2);
    }

    if (second == 111 || second == 79) { // 0o (octal)
      return __Porffor_stn_int(str, 8, 2);
    }

    if (second == 98 || second == 66) { // 0b (binary)
      return __Porffor_stn_int(str, 2, 2);
    }
  }

  let i: i32 = 0;
  let negative: boolean = false;

  // +, skip char
  if (first == 43) {
    i = 1;
  }

  // -, set negative and skip char
  if (first == 45) {
    negative = true;
    i = 1;
  }

  if (i + 8 == str.length &&
      str.charCodeAt(i) == 73) { // I
    // likely 'Infinity' so check each char lol
    if (
      str.charCodeAt(i + 1) == 110 && // n
      str.charCodeAt(i + 2) == 102 && // f
      str.charCodeAt(i + 3) == 105 && // i
      str.charCodeAt(i + 4) == 110 && // n
      str.charCodeAt(i + 5) == 105 && // i
      str.charCodeAt(i + 6) == 116 && // t
      str.charCodeAt(i + 7) == 121    // y
    ) {
      let n: f64 = Infinity;
      return negative ? -n : n;
    }

    return NaN;
  }

  const n: f64 = __Porffor_stn_float(str, i, true);

  if (negative) return -n;
  return n;
};
