// Parse exponent part after 'e' or 'E'
// Returns the exponent value (can be negative), or NaN on failure
// strict: if true, returns NaN on any non-digit char; if false, stops at non-digit
export const __Porffor_parseExp = (str: unknown, i: i32, len: i32, strict: boolean): f64 => {
  let expNeg: boolean = false;
  let exp: i32 = 0;
  let hasDigit: boolean = false;

  // Check for +/- after E
  if (i < len) {
    const sign: i32 = str.charCodeAt(i);
    if (sign == 43) { // +
      i++;
    } else if (sign == 45) { // -
      expNeg = true;
      i++;
    }
  }

  // Must have at least one digit
  if (strict && i >= len) return NaN;

  // Parse exponent digits
  while (i < len) {
    const chr: i32 = str.charCodeAt(i);
    if (chr >= 48 && chr <= 57) { // 0-9
      exp = (exp * 10) + chr - 48;
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
      n = (n * radix) + chr - 48;
    } else if (radix > 10) {
      if (chr >= 97 && chr < (87 + radix)) {
        n = (n * radix) + chr - 87;
      } else if (chr >= 65 && chr < (55 + radix)) {
        n = (n * radix) + chr - 55;
      } else {
        return NaN;
      }
    } else {
      return NaN;
    }
  }

  return n;
};

export const __Porffor_stn_float = (str: unknown, i: i32): f64 => {
  let n: f64 = 0;
  let dec: i32 = 0;

  const len: i32 = str.length;
  if (len - i == 0) return NaN;

  while (i < len) {
    const chr: i32 = str.charCodeAt(i++);

    if (chr >= 48 && chr <= 57) { // 0-9
      if (dec) {
        dec *= 10;
        n += (chr - 48) / dec;
      } else n = (n * 10) + chr - 48;
    } else if (chr == 46) { // .
      if (dec) return NaN;
      dec = 1;
    } else if (chr == 69 || chr == 101) { // E or e
      const exp: f64 = __Porffor_parseExp(str, i, len, true);
      if (Number.isNaN(exp)) return NaN;
      if (exp < 0) return n / (10 ** -exp);
      return n * (10 ** exp);
    } else {
      return NaN;
    }
  }

  return n;
};

// 7.1.4.1.1 StringToNumber (str)
// https://tc39.es/ecma262/#sec-stringtonumber
export const __ecma262_StringToNumber = (str: unknown): number => {
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

  if (str.charCodeAt(i) == 73) {
    // next char is 'I', likely 'Infinity' so check each char lol
    if (
      str.charCodeAt(i + 1) == 110 && // n
      str.charCodeAt(i + 2) == 102 && // f
      str.charCodeAt(i + 3) == 105 && // i
      str.charCodeAt(i + 4) == 110 && // n
      str.charCodeAt(i + 5) == 105 && // i
      str.charCodeAt(i + 6) == 116 && // t
      str.charCodeAt(i + 7) == 121 // y
    ) {
      // no way, it matched
      let n: f64 = Infinity;
      return negative ? -n : n;
    }

    return NaN;
  }

  const n: f64 = __Porffor_stn_float(str, i);

  if (negative) return -n;
  return n;
};