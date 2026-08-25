import type {} from './porffor.d.ts';

// 21.1.1.1 Number (value)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-number-constructor-number-value
export const Number = function (value: any): number|any {
  let n: number = 0;

  // 1. If value is present, then
  // todo: handle undefined (NaN) and not present (0) args differently
  if (Porffor.type(value) != Porffor.TYPES.undefined) {
    // a. Let prim be ? ToNumeric(value).
    n = ecma262.ToNumeric(value);

    // b. If prim is a BigInt, let n be 𝔽(ℝ(prim)).
    if (Porffor.comptime.flag`hasType.bigint`) {
      if (Porffor.type(n) == Porffor.TYPES.bigint)
        n = Porffor.bigint.toNumber(n);
    }

    // c. Otherwise, let n be prim.
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
export const __Number_isNaN = isNaN;

export const isFinite = (value: number): boolean => {
  const delta: number = value - value;
  return delta == delta;
};
export const __Number_isFinite = isFinite;

export const __Number_isInteger = (value: number): boolean => value == Infinity || value == -Infinity || value % 1 == 0;

export const __Number_isSafeInteger = (value: number): boolean => {
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

  if (!Number.isFinite(n)) {
    if (Number.isNaN(n)) return 'NaN';
    if (n == Infinity) return 'Infinity';
    return '-Infinity';
  }

  if (n == 0) {
    return '0';
  }

  const out: bytestring = Porffor.malloc(512);
  let outPtr: i32 = Porffor.IR.ptr(out);
  let negative: i32 = 0;

  // if negative value
  if (n < 0) {
    negative = 1;
    n = -n; // turn value positive for later use
    Porffor.IR.storeU8(outPtr++, 4, 45); // prepend -
  }

  let i: f64 = Math.trunc(n);

  let digits: bytestring = Porffor.malloc(512); // byte "array"

  let l: i32 = 0;
  if (radix == 10) {
    if (i >= 1e21) {
      let exponential: bytestring = '';
      Porffor.c`exponential = porf_num_to_str(negative ? -n : n);`;
      return exponential;
    }

    if (n < 1e-6) {
      // small exponential
      let decimal: f64 = n;

      let e: i32 = 0;
      while (decimal < 1) {
        decimal *= radix;
        e++;
      }

      let lastNonZero: i32 = 0;
      while (l < 17) {
        const intPart: i32 = Math.trunc(decimal);
        Porffor.IR.storeU8(Porffor.IR.ptr(digits) + l, 4, intPart);
        if (intPart != 0) lastNonZero = l;
        l++;

        decimal = (decimal - intPart) * radix;
        if (decimal < 1e-12) break;
      }
      l = lastNonZero + 1;

      let digitsPtr: i32 = Porffor.IR.ptr(digits);
      let endPtr: i32 = outPtr + l;
      let dotPlace: i32 = outPtr + 1;
      while (outPtr < endPtr) {
        let digit: i32 = Porffor.IR.loadU8(digitsPtr++, 4);

        if (outPtr == dotPlace) {
          Porffor.IR.storeU8(outPtr++, 4, 46); // .
          endPtr++;
        }

        if (digit < 10) digit += 48; // 0-9
          else digit += 87; // a-z

        Porffor.IR.storeU8(outPtr++, 4, digit);
      }

      Porffor.IR.storeU8(outPtr++, 4, 101); // e
      Porffor.IR.storeU8(outPtr++, 4, 45); // -

      l = 0;
      for (; e > 0; l++) {
        Porffor.IR.storeU8(Porffor.IR.ptr(digits) + l, 4, e % radix);
        e = Math.trunc(e / radix);
      }

      digitsPtr = Porffor.IR.ptr(digits) + l;

      endPtr = outPtr + l;
      while (outPtr < endPtr) {
        let digit: i32 = Porffor.IR.loadU8(--digitsPtr, 4);

        if (digit < 10) digit += 48; // 0-9
          else digit += 87; // a-z

        Porffor.IR.storeU8(outPtr++, 4, digit);
      }

      out.length = outPtr - Porffor.IR.ptr(out);

      return out;
    }
  }

  if (i == 0) {
    Porffor.IR.storeU8(Porffor.IR.ptr(digits), 4, 0);
    l = 1;
  } else {
    for (; i > 0; l++) {
      Porffor.IR.storeU8(Porffor.IR.ptr(digits) + l, 4, i % radix);
      i = Math.trunc(i / radix);
    }
  }

  let digitsPtr: i32 = Porffor.IR.ptr(digits) + l;
  let endPtr: i32 = outPtr + l;
  while (outPtr < endPtr) {
    let digit: i32 = Porffor.IR.loadU8(--digitsPtr, 4);

    if (digit < 10) digit += 48; // 0-9
      else digit += 87; // a-z

    Porffor.IR.storeU8(outPtr++, 4, digit);
  }

  let decimal: f64 = n - Math.trunc(n);
  if (decimal > 0) {
    Porffor.IR.storeU8(outPtr++, 4, 46); // .

    decimal += 1;

    // todo: doesn't handle non-10 radix properly
    let decimalDigits: i32 = 16 - l;
    for (let j: i32 = 0; j < decimalDigits; j++) {
      decimal *= radix;
    }

    decimal = Math.round(decimal);

    l = 0;
    let trailing: boolean = true;
    while (decimal > 1) {
      const digit: f64 = decimal % radix;
      decimal = Math.trunc(decimal / radix);

      if (trailing) {
        if (digit == 0) { // skip trailing 0s
          continue;
        }
        trailing = false;
      }

      Porffor.IR.storeU8(Porffor.IR.ptr(digits) + l, 4, digit);
      l++;
    }

    digitsPtr = Porffor.IR.ptr(digits) + l;

    endPtr = outPtr + l;
    while (outPtr < endPtr) {
      let digit: i32 = Porffor.IR.loadU8(--digitsPtr, 4);

      if (digit < 10) digit += 48; // 0-9
        else digit += 87; // a-z

      Porffor.IR.storeU8(outPtr++, 4, digit);
    }
  }

  out.length = outPtr - Porffor.IR.ptr(out);
  return out;
};

export const __Number_prototype_toFixed = function (this: number, fractionDigits: number) {
  let n: number = this;
  fractionDigits = Math.trunc(fractionDigits);
  if (fractionDigits < 0 || fractionDigits > 100) {
    throw new RangeError('toFixed() fractionDigits argument must be between 0 and 100');
  }

  if (!Number.isFinite(n)) {
    if (Number.isNaN(n)) return 'NaN';
    if (n == Infinity) return 'Infinity';
    return '-Infinity';
  }

  const out: bytestring = Porffor.malloc(512);
  let outPtr: i32 = Porffor.IR.ptr(out);

  // if negative value
  if (n < 0) {
    n = -n; // turn value positive for later use
    Porffor.IR.storeU8(outPtr++, 4, 45); // prepend -
  }

  let i: f64 = Math.trunc(n);

  let digits: bytestring = ''; // byte "array"

  let l: i32 = 0;

  if (i == 0) {
    Porffor.IR.storeU8(Porffor.IR.ptr(digits), 4, 0);
    l = 1;
  } else {
    for (; i > 0; l++) {
      Porffor.IR.storeU8(Porffor.IR.ptr(digits) + l, 4, i % 10);
      i = Math.trunc(i / 10);
    }
  }

  let digitsPtr: i32 = Porffor.IR.ptr(digits) + l;
  let endPtr: i32 = outPtr + l;
  while (outPtr < endPtr) {
    let digit: i32 = Porffor.IR.loadU8(--digitsPtr, 4);

    if (digit < 10) digit += 48; // 0-9
      else digit += 87; // a-z

    Porffor.IR.storeU8(outPtr++, 4, digit);
  }

  let decimal: f64 = n - Math.trunc(n);
  if (fractionDigits > 0) {
    Porffor.IR.storeU8(outPtr++, 4, 46); // .

    decimal += 1;

    for (let j: i32 = 0; j < fractionDigits; j++) {
      decimal *= 10;
    }

    decimal = Math.round(decimal);

    l = 0;
    while (decimal > 1) {
      const digit: f64 = decimal % 10;
      decimal = Math.trunc(decimal / 10);

      Porffor.IR.storeU8(Porffor.IR.ptr(digits) + l, 4, digit);
      l++;
    }

    digitsPtr = Porffor.IR.ptr(digits) + l;

    endPtr = outPtr + l;
    while (outPtr < endPtr) {
      let digit: i32 = Porffor.IR.loadU8(--digitsPtr, 4);

      if (digit < 10) digit += 48; // 0-9
        else digit += 87; // a-z

      Porffor.IR.storeU8(outPtr++, 4, digit);
    }
  }

  out.length = outPtr - Porffor.IR.ptr(out);
  return out;
};

export const __Number_prototype_toLocaleString = function (this: number) { return Porffor.callThis(__Number_prototype_toString, this, 10); };

// fractionDigits: number|any for type check
export const __Number_prototype_toExponential = function (this: number, fractionDigits: number|any) {
  let n: number = this;
  if (!Number.isFinite(n)) {
    if (Number.isNaN(n)) return 'NaN';
    if (n == Infinity) return 'Infinity';
    return '-Infinity';
  }

  if (Porffor.type(fractionDigits) != Porffor.TYPES.number) {
    // todo: string to number
    fractionDigits = undefined;
  } else {
    fractionDigits = Math.trunc(fractionDigits);
    if (fractionDigits < 0 || fractionDigits > 100) {
      throw new RangeError('toExponential() fractionDigits argument must be between 0 and 100');
    }
  }

  const out: bytestring = Porffor.malloc(512);
  let outPtr: i32 = Porffor.IR.ptr(out);

  // if negative value
  if (n < 0) {
    n = -n;
    Porffor.IR.storeU8(outPtr++, 4, 45); // prepend -
  }

  let i: f64 = n;

  let digits: bytestring = ''; // byte "array"

  let l: i32 = 0;
  let e: i32 = 0;
  let digitsPtr: i32;
  let endPtr: i32;
  if (n == 0) {
    Porffor.IR.storeU8(outPtr++, 4, 48); // 0

    if (fractionDigits > 0) {
      Porffor.IR.storeU8(outPtr++, 4, 46); // .
      for (let j: i32 = 0; j < fractionDigits; j++) {
        Porffor.IR.storeU8(outPtr++, 4, 48); // 0
      }
    }

    Porffor.IR.storeU8(outPtr++, 4, 101); // e
    Porffor.IR.storeU8(outPtr++, 4, 43); // +
  } else if (n < 1) {
    // small exponential
    if (Porffor.type(fractionDigits) != Porffor.TYPES.number) {
      e = 1;
      while (true) {
        i *= 10;

        const intPart: f64 = Math.round(i);
        if (intPart > 0) {
          if (Math.abs(i - intPart) < 1e-10) {
            i = intPart;
            break;
          }
        } else e++;
      }
    } else {
      e = 1;
      let j: i32 = 0;
      while (j <= fractionDigits) {
        i *= 10;

        const intPart: i32 = Math.trunc(i);
        if (intPart == 0) e++;
          else j++;
      }
    }

    while (i > 0) {
      const digit: f64 = i % 10;
      i = Math.trunc(i / 10);

      Porffor.IR.storeU8(Porffor.IR.ptr(digits) + l, 4, digit);
      l++;
    }

    digitsPtr = Porffor.IR.ptr(digits) + l;
    endPtr = outPtr + l;
    let dotPlace: i32 = outPtr + 1;
    while (outPtr < endPtr) {
      let digit: i32 = Porffor.IR.loadU8(--digitsPtr, 4);

      if (outPtr == dotPlace) {
        Porffor.IR.storeU8(outPtr++, 4, 46); // .
        endPtr++;
      }

      if (digit < 10) digit += 48; // 0-9
        else digit += 87; // a-z

      Porffor.IR.storeU8(outPtr++, 4, digit);
    }

    Porffor.IR.storeU8(outPtr++, 4, 101); // e
    Porffor.IR.storeU8(outPtr++, 4, 45); // -
  } else {
    // large exponential
    e = -1;
    while (i >= 1) {
      i /= 10;
      e++;
    }

    if (Porffor.type(fractionDigits) != Porffor.TYPES.number) {
      while (true) {
        i *= 10;

        const intPart: f64 = Math.round(i);
        if (intPart > 0) {
          if (Math.abs(i - intPart) < 1e-10) {
            i = intPart;
            break;
          }
        } else e++;
      }
    } else {

      // eg: 1.2345 -> 123.45, if fractionDigits = 2
      for (let j: i32 = 0; j <= fractionDigits; j++) {
        i *= 10;
      }
    }

    // eg: 123.45 -> 123
    i = Math.round(i);

    while (i > 0) {
      const digit: f64 = i % 10;
      i = Math.trunc(i / 10);

      Porffor.IR.storeU8(Porffor.IR.ptr(digits) + l, 4, digit);
      l++;
    }

    digitsPtr = Porffor.IR.ptr(digits) + l;
    endPtr = outPtr + l;
    let dotPlace: i32 = outPtr + 1;
    while (outPtr < endPtr) {
      if (outPtr == dotPlace) {
        Porffor.IR.storeU8(outPtr++, 4, 46); // .
        endPtr++;
      }

      let digit: i32 = Porffor.IR.loadU8(--digitsPtr, 4);

      if (digit < 10) digit += 48; // 0-9
        else digit += 87; // a-z

      Porffor.IR.storeU8(outPtr++, 4, digit);
    }

    Porffor.IR.storeU8(outPtr++, 4, 101); // e
    Porffor.IR.storeU8(outPtr++, 4, 43); // +
  }

  if (e == 0) {
    Porffor.IR.storeU8(Porffor.IR.ptr(digits), 4, 0);
    l = 1;
  } else {
    l = 0;
    for (; e > 0; l++) {
      Porffor.IR.storeU8(Porffor.IR.ptr(digits) + l, 4, e % 10);
      e = Math.trunc(e / 10);
    }
  }

  digitsPtr = Porffor.IR.ptr(digits) + l;

  endPtr = outPtr + l;
  while (outPtr < endPtr) {
    let digit: i32 = Porffor.IR.loadU8(--digitsPtr, 4);

    if (digit < 10) digit += 48; // 0-9
      else digit += 87; // a-z

    Porffor.IR.storeU8(outPtr++, 4, digit);
  }

  out.length = outPtr - Porffor.IR.ptr(out);
  return out;
};

// 21.1.3.7 Number.prototype.valueOf ()
// https://tc39.es/ecma262/#sec-number.prototype.valueof
export const __Number_prototype_valueOf = function (this: number) {
  // 1. Return ? ThisNumberValue(this value).
  return this;
};


export const parseInt = (input: any, radix: any): f64 => {
  // todo/perf: optimize this instead of doing a naive algo (https://kholdstare.github.io/technical/2020/05/26/faster-integer-parsing.html)
  // todo/perf: use i32s here once that becomes not annoying

  input = ecma262.ToString(input).trim();

  let defaultRadix: boolean = false;
  radix = ecma262.ToIntegerOrInfinity(radix);
  if (!Number.isFinite(radix)) radix = 0; // infinity/NaN -> default

  if (radix == 0) {
    defaultRadix = true;
    radix = 10;
  }
  if (radix < 2 || radix > 36) return NaN;

  let nMax: i32 = 58;
  if (radix < 10) nMax = 48 + radix;

  let n: f64 = NaN;

  const inputPtr: i32 = Porffor.IR.ptr(input);
  const len: i32 = Porffor.IR.loadI32(inputPtr, 0);
  let i: i32 = inputPtr;

  let negative: boolean = false;

  if (Porffor.type(input) == Porffor.TYPES.bytestring) {
    const endPtr: i32 = i + len;

    // check start of string
    const startChr: i32 = Porffor.IR.loadU8(i, 4);

    // +, ignore
    if (startChr == 43) i++;

    // -, switch to negative
    if (startChr == 45) {
      negative = true;
      i++;
    }

    // 0, potential start of hex
    if ((defaultRadix || radix == 16) && startChr == 48) {
      const second: i32 = Porffor.IR.loadU8(i + 1, 4);
      // 0x or 0X
      if (second == 120 || second == 88) {
        // set radix to 16 and skip leading 2 chars
        i += 2;
        radix = 16;
      }
    }

    while (i < endPtr) {
      const chr: i32 = Porffor.IR.loadU8(i++, 4);

      if (chr >= 48 && chr < nMax) {
        if (Number.isNaN(n)) n = 0;
        n = (n * radix) + chr - 48;
      } else if (radix > 10) {
        if (chr >= 97 && chr < (87 + radix)) {
          if (Number.isNaN(n)) n = 0;
          n = (n * radix) + chr - 87;
        } else if (chr >= 65 && chr < (55 + radix)) {
          if (Number.isNaN(n)) n = 0;
          n = (n * radix) + chr - 55;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    if (negative) return -n;
    return n;
  }

  const endPtr: i32 = i + len * 2;

  // check start of string
  const startChr: i32 = Porffor.IR.loadU16(i, 4);

  // +, ignore
  if (startChr == 43) i += 2;

  // -, switch to negative
  if (startChr == 45) {
    negative = true;
    i += 2;
  }

  // 0, potential start of hex
  if ((defaultRadix || radix == 16) && startChr == 48) {
    const second: i32 = Porffor.IR.loadU16(i + 2, 4);
    // 0x or 0X
    if (second == 120 || second == 88) {
      // set radix to 16 and skip leading 2 chars
      i += 4;
      radix = 16;
    }
  }

  while (i < endPtr) {
    const chr: i32 = Porffor.IR.loadU16(i, 4);
    i += 2;

    if (chr >= 48 && chr < nMax) {
      if (Number.isNaN(n)) n = 0;
      n = (n * radix) + chr - 48;
    } else if (radix > 10) {
      if (chr >= 97 && chr < (87 + radix)) {
        if (Number.isNaN(n)) n = 0;
        n = (n * radix) + chr - 87;
      } else if (chr >= 65 && chr < (55 + radix)) {
        if (Number.isNaN(n)) n = 0;
        n = (n * radix) + chr - 55;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  if (negative) return -n;
  return n;
};

export const __Number_parseInt = (input: any, radix: any): f64 => parseInt(input, radix);

export const parseFloat = (input: any): f64 => {
  input = ecma262.ToString(input).trim();

  let negative: boolean = false;

  let i: i32 = 0;
  const len: i32 = input.length;

  if (len == 0) return NaN;

  const start: i32 = input.charCodeAt(0);

  // +, ignore
  if (start == 43) {
    i++;
  }

  // -, negative
  if (start == 45) {
    i++;
    negative = true;
  }

  // 'Infinity'?
  if (len - i >= 8) {
    if (input.charCodeAt(i) == 73 &&      // I
        input.charCodeAt(i + 1) == 110 && // n
        input.charCodeAt(i + 2) == 102 && // f
        input.charCodeAt(i + 3) == 105 && // i
        input.charCodeAt(i + 4) == 110 && // n
        input.charCodeAt(i + 5) == 105 && // i
        input.charCodeAt(i + 6) == 116 && // t
        input.charCodeAt(i + 7) == 121) { // y
      if (negative) return -Infinity;
      return Infinity;
    }
  }

  const n: f64 = __Porffor_stn_float(input, i, false);

  if (negative) return -n;
  return n;
};

export const __Number_parseFloat = (input: any): f64 => parseFloat(input);
