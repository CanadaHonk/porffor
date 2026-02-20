import type {} from './porffor.d.ts';

// 21.1.1.1 Number (value)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-number-constructor-number-value
export const Number = function (value: any): number|NumberObject {
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

// radix: number|any for type check
export const __Number_prototype_toString = (_this: number, radix: number|any) => {
  if (Porffor.type(radix) != Porffor.TYPES.number) {
    // todo: string to number
    radix = 10;
  }

  radix = Math.trunc(radix);
  if (radix < 2 || radix > 36) {
    throw new RangeError('toString() radix argument must be between 2 and 36');
  }

  if (!Number.isFinite(_this)) {
    if (Number.isNaN(_this)) return 'NaN';
    if (_this == Infinity) return 'Infinity';
    return '-Infinity';
  }

  if (_this == 0) {
    return '0';
  }

  let out: bytestring = Porffor.malloc(512);
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  // if negative value
  if (_this < 0) {
    _this = -_this; // turn value positive for later use
    Porffor.wasm.i32.store8(outPtr++, 45, 0, 4); // prepend -
  }

  let i: f64 = Math.trunc(_this);

  let digits: bytestring = ''; // byte "array"

  let l: i32 = 0;
  if (radix == 10) {
    if (i >= 1e21) {
      // large exponential
      let trailing: boolean = true;
      let e: i32 = -1;
      while (i > 0) {
        const digit: f64 = i % radix;
        i = Math.trunc(i / radix);

        e++;
        if (trailing) {
          if (digit == 0) { // skip trailing 0s
            continue;
          }
          trailing = false;
        }

        Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}` + l, digit, 0, 4);
        l++;
      }

      let digitsPtr: i32 = Porffor.wasm`local.get ${digits}` + l;
      let endPtr: i32 = outPtr + l;
      let dotPlace: i32 = outPtr + 1;
      while (outPtr < endPtr) {
        if (outPtr == dotPlace) {
          Porffor.wasm.i32.store8(outPtr++, 46, 0, 4); // .
          endPtr++;
        }

        let digit: i32 = Porffor.wasm.i32.load8_u(--digitsPtr, 0, 4);

        if (digit < 10) digit += 48; // 0-9
          else digit += 87; // a-z

        Porffor.wasm.i32.store8(outPtr++, digit, 0, 4);
      }

      Porffor.wasm.i32.store8(outPtr++, 101, 0, 4); // e
      Porffor.wasm.i32.store8(outPtr++, 43, 0, 4); // +

      l = 0;
      for (; e > 0; l++) {
        Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}` + l, e % radix, 0, 4);
        e = Math.trunc(e / radix);
      }

      digitsPtr = Porffor.wasm`local.get ${digits}` + l;

      endPtr = outPtr + l;
      while (outPtr < endPtr) {
        let digit: i32 = Porffor.wasm.i32.load8_u(--digitsPtr, 0, 4);

        if (digit < 10) digit += 48; // 0-9
          else digit += 87; // a-z

        Porffor.wasm.i32.store8(outPtr++, digit, 0, 4);
      }

      out.length = outPtr - Porffor.wasm`local.get ${out}`;
      return out;
    }

    if (_this < 1e-6) {
      // small exponential
      let decimal: f64 = _this;

      let e: i32 = 1;
      while (true) {
        decimal *= radix;

        const intPart: i32 = Math.trunc(decimal);
        if (intPart > 0) {
          if (decimal - intPart < 1e-10) break;
        } else e++;
      }

      while (decimal > 0) {
        const digit: f64 = decimal % radix;
        decimal = Math.trunc(decimal / radix);

        Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}` + l, digit, 0, 4);
        l++;
      }

      let digitsPtr: i32 = Porffor.wasm`local.get ${digits}` + l;
      let endPtr: i32 = outPtr + l;
      let dotPlace: i32 = outPtr + 1;
      while (outPtr < endPtr) {
        let digit: i32 = Porffor.wasm.i32.load8_u(--digitsPtr, 0, 4);

        if (outPtr == dotPlace) {
          Porffor.wasm.i32.store8(outPtr++, 46, 0, 4); // .
          endPtr++;
        }

        if (digit < 10) digit += 48; // 0-9
          else digit += 87; // a-z

        Porffor.wasm.i32.store8(outPtr++, digit, 0, 4);
      }

      Porffor.wasm.i32.store8(outPtr++, 101, 0, 4); // e
      Porffor.wasm.i32.store8(outPtr++, 45, 0, 4); // -

      l = 0;
      for (; e > 0; l++) {
        Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}` + l, e % radix, 0, 4);
        e = Math.trunc(e / radix);
      }

      digitsPtr = Porffor.wasm`local.get ${digits}` + l;

      endPtr = outPtr + l;
      while (outPtr < endPtr) {
        let digit: i32 = Porffor.wasm.i32.load8_u(--digitsPtr, 0, 4);

        if (digit < 10) digit += 48; // 0-9
          else digit += 87; // a-z

        Porffor.wasm.i32.store8(outPtr++, digit, 0, 4);
      }

      out.length = outPtr - Porffor.wasm`local.get ${out}`;

      return out;
    }
  }

  if (i == 0) {
    Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}`, 0, 0, 4);
    l = 1;
  } else {
    for (; i > 0; l++) {
      Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}` + l, i % radix, 0, 4);
      i = Math.trunc(i / radix);
    }
  }

  let digitsPtr: i32 = Porffor.wasm`local.get ${digits}` + l;
  let endPtr: i32 = outPtr + l;
  while (outPtr < endPtr) {
    let digit: i32 = Porffor.wasm.i32.load8_u(--digitsPtr, 0, 4);

    if (digit < 10) digit += 48; // 0-9
      else digit += 87; // a-z

    Porffor.wasm.i32.store8(outPtr++, digit, 0, 4);
  }

  let decimal: f64 = _this - Math.trunc(_this);
  if (decimal > 0) {
    Porffor.wasm.i32.store8(outPtr++, 46, 0, 4); // .

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

      Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}` + l, digit, 0, 4);
      l++;
    }

    digitsPtr = Porffor.wasm`local.get ${digits}` + l;

    endPtr = outPtr + l;
    while (outPtr < endPtr) {
      let digit: i32 = Porffor.wasm.i32.load8_u(--digitsPtr, 0, 4);

      if (digit < 10) digit += 48; // 0-9
        else digit += 87; // a-z

      Porffor.wasm.i32.store8(outPtr++, digit, 0, 4);
    }
  }

  out.length = outPtr - Porffor.wasm`local.get ${out}`;
  return out;
};

export const __Number_prototype_toFixed = (_this: number, fractionDigits: number) => {
  fractionDigits = Math.trunc(fractionDigits);
  if (fractionDigits < 0 || fractionDigits > 100) {
    throw new RangeError('toFixed() fractionDigits argument must be between 0 and 100');
  }

  if (!Number.isFinite(_this)) {
    if (Number.isNaN(_this)) return 'NaN';
    if (_this == Infinity) return 'Infinity';
    return '-Infinity';
  }

  let out: bytestring = Porffor.malloc(512);
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  // if negative value
  if (_this < 0) {
    _this = -_this; // turn value positive for later use
    Porffor.wasm.i32.store8(outPtr++, 45, 0, 4); // prepend -
  }

  let i: f64 = Math.trunc(_this);

  let digits: bytestring = ''; // byte "array"

  let l: i32 = 0;

  if (i == 0) {
    Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}`, 0, 0, 4);
    l = 1;
  } else {
    for (; i > 0; l++) {
      Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}` + l, i % 10, 0, 4);
      i = Math.trunc(i / 10);
    }
  }

  let digitsPtr: i32 = Porffor.wasm`local.get ${digits}` + l;
  let endPtr: i32 = outPtr + l;
  while (outPtr < endPtr) {
    let digit: i32 = Porffor.wasm.i32.load8_u(--digitsPtr, 0, 4);

    if (digit < 10) digit += 48; // 0-9
      else digit += 87; // a-z

    Porffor.wasm.i32.store8(outPtr++, digit, 0, 4);
  }

  let decimal: f64 = _this - Math.trunc(_this);
  if (fractionDigits > 0) {
    Porffor.wasm.i32.store8(outPtr++, 46, 0, 4); // .

    decimal += 1;

    for (let j: i32 = 0; j < fractionDigits; j++) {
      decimal *= 10;
    }

    decimal = Math.round(decimal);

    l = 0;
    while (decimal > 1) {
      const digit: f64 = decimal % 10;
      decimal = Math.trunc(decimal / 10);

      Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}` + l, digit, 0, 4);
      l++;
    }

    digitsPtr = Porffor.wasm`local.get ${digits}` + l;

    endPtr = outPtr + l;
    while (outPtr < endPtr) {
      let digit: i32 = Porffor.wasm.i32.load8_u(--digitsPtr, 0, 4);

      if (digit < 10) digit += 48; // 0-9
        else digit += 87; // a-z

      Porffor.wasm.i32.store8(outPtr++, digit, 0, 4);
    }
  }

  out.length = outPtr - Porffor.wasm`local.get ${out}`;
  return out;
};

export const __Number_prototype_toLocaleString = (_this: number) => __Number_prototype_toString(_this, 10);

// fractionDigits: number|any for type check
export const __Number_prototype_toExponential = (_this: number, fractionDigits: number|any) => {
  if (!Number.isFinite(_this)) {
    if (Number.isNaN(_this)) return 'NaN';
    if (_this == Infinity) return 'Infinity';
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

  let out: bytestring = Porffor.malloc(512);
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  // if negative value
  if (_this < 0) {
    _this = -_this; // turn value positive for later use
    Porffor.wasm.i32.store8(outPtr++, 45, 0, 4); // prepend -
  }

  let i: f64 = _this;

  let digits: bytestring = ''; // byte "array"

  let l: i32 = 0;
  let e: i32 = 0;
  let digitsPtr: i32;
  let endPtr: i32;
  if (_this == 0) {
    Porffor.wasm.i32.store8(outPtr++, 48, 0, 4); // 0

    if (fractionDigits > 0) {
      Porffor.wasm.i32.store8(outPtr++, 46, 0, 4); // .
      for (let j: i32 = 0; j < fractionDigits; j++) {
        Porffor.wasm.i32.store8(outPtr++, 48, 0, 4); // 0
      }
    }

    Porffor.wasm.i32.store8(outPtr++, 101, 0, 4); // e
    Porffor.wasm.i32.store8(outPtr++, 43, 0, 4); // +
  } else if (_this < 1) {
    // small exponential
    if (Porffor.type(fractionDigits) != Porffor.TYPES.number) {
      e = 1;
      while (true) {
        i *= 10;

        const intPart: i32 = Math.trunc(i);
        if (intPart > 0) {
          if (i - intPart < 1e-10) break;
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

      Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}` + l, digit, 0, 4);
      l++;
    }

    digitsPtr = Porffor.wasm`local.get ${digits}` + l;
    endPtr = outPtr + l;
    let dotPlace: i32 = outPtr + 1;
    while (outPtr < endPtr) {
      let digit: i32 = Porffor.wasm.i32.load8_u(--digitsPtr, 0, 4);

      if (outPtr == dotPlace) {
        Porffor.wasm.i32.store8(outPtr++, 46, 0, 4); // .
        endPtr++;
      }

      if (digit < 10) digit += 48; // 0-9
        else digit += 87; // a-z

      Porffor.wasm.i32.store8(outPtr++, digit, 0, 4);
    }

    Porffor.wasm.i32.store8(outPtr++, 101, 0, 4); // e
    Porffor.wasm.i32.store8(outPtr++, 45, 0, 4); // -
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

        const intPart: i32 = Math.trunc(i);
        if (intPart > 0) {
          if (i - intPart < 1e-10) break;
        } else e++;
      }
    } else {
      // i = _this;
      // if (e >= fractionDigits) {
      //   for (let j: i32 = 0; j < e - fractionDigits; j++) {
      //     i /= 10;
      //   }
      // } else {
      //   for (let j: i32 = 0; j < fractionDigits - e; j++) {
      //     i *= 10;
      //   }
      // }

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

      Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}` + l, digit, 0, 4);
      l++;
    }

    digitsPtr = Porffor.wasm`local.get ${digits}` + l;
    endPtr = outPtr + l;
    let dotPlace: i32 = outPtr + 1;
    while (outPtr < endPtr) {
      if (outPtr == dotPlace) {
        Porffor.wasm.i32.store8(outPtr++, 46, 0, 4); // .
        endPtr++;
      }

      let digit: i32 = Porffor.wasm.i32.load8_u(--digitsPtr, 0, 4);

      if (digit < 10) digit += 48; // 0-9
        else digit += 87; // a-z

      Porffor.wasm.i32.store8(outPtr++, digit, 0, 4);
    }

    Porffor.wasm.i32.store8(outPtr++, 101, 0, 4); // e
    Porffor.wasm.i32.store8(outPtr++, 43, 0, 4); // +
  }

  if (e == 0) {
    Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}`, 0, 0, 4);
    l = 1;
  } else {
    l = 0;
    for (; e > 0; l++) {
      Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}` + l, e % 10, 0, 4);
      e = Math.trunc(e / 10);
    }
  }

  digitsPtr = Porffor.wasm`local.get ${digits}` + l;

  endPtr = outPtr + l;
  while (outPtr < endPtr) {
    let digit: i32 = Porffor.wasm.i32.load8_u(--digitsPtr, 0, 4);

    if (digit < 10) digit += 48; // 0-9
      else digit += 87; // a-z

    Porffor.wasm.i32.store8(outPtr++, digit, 0, 4);
  }

  out.length = outPtr - Porffor.wasm`local.get ${out}`;
  return out;
};

// 21.1.3.7 Number.prototype.valueOf ()
// https://tc39.es/ecma262/#sec-number.prototype.valueof
export const __Number_prototype_valueOf = (_this: number) => {
  // 1. Return ? ThisNumberValue(this value).
  return _this;
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

  const inputPtr: i32 = Porffor.wasm`local.get ${input}`;
  const len: i32 = Porffor.wasm.i32.load(inputPtr, 0, 0);
  let i: i32 = inputPtr;

  let negative: boolean = false;

  if (Porffor.type(input) == Porffor.TYPES.bytestring) {
    const endPtr: i32 = i + len;

    // check start of string
    const startChr: i32 = Porffor.wasm.i32.load8_u(i, 0, 4);

    // +, ignore
    if (startChr == 43) i++;

    // -, switch to negative
    if (startChr == 45) {
      negative = true;
      i++;
    }

    // 0, potential start of hex
    if ((defaultRadix || radix == 16) && startChr == 48) {
      const second: i32 = Porffor.wasm.i32.load8_u(i + 1, 0, 4);
      // 0x or 0X
      if (second == 120 || second == 88) {
        // set radix to 16 and skip leading 2 chars
        i += 2;
        radix = 16;
      }
    }

    while (i < endPtr) {
      const chr: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);

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
  const startChr: i32 = Porffor.wasm.i32.load16_u(i, 0, 4);

  // +, ignore
  if (startChr == 43) i += 2;

  // -, switch to negative
  if (startChr == 45) {
    negative = true;
    i += 2;
  }

  // 0, potential start of hex
  if ((defaultRadix || radix == 16) && startChr == 48) {
    const second: i32 = Porffor.wasm.i32.load16_u(i + 2, 0, 4);
    // 0x or 0X
    if (second == 120 || second == 88) {
      // set radix to 16 and skip leading 2 chars
      i += 4;
      radix = 16;
    }
  }

  while (i < endPtr) {
    const chr: i32 = Porffor.wasm.i32.load16_u(i, 0, 4);
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
  // todo: handle exponents
  input = ecma262.ToString(input).trim();

  let n: f64 = NaN;
  let dec: i32 = 0;
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

  // Check for "Infinity"
  if (len - i >= 8) {
    // Check if remaining string starts with "Infinity"
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

  while (i < len) {
    const chr: i32 = input.charCodeAt(i++);

    if (chr >= 48 && chr <= 57) { // 0-9
      if (Number.isNaN(n)) n = 0;
      if (dec) {
        dec *= 10;
        n += (chr - 48) / dec;
      } else n = (n * 10) + chr - 48;
    } else if (chr == 46) { // .
      if (dec) break;
      dec = 1;
    } else {
      break;
    }
  }

  if (negative) return -n;
  return n;
};

export const __Number_parseFloat = (input: any): f64 => parseFloat(input);

// 19.2.2 isFinite (number)
// https://tc39.es/ecma262/#sec-isfinite-number
export const isFinite = (number: any): boolean => {
  const num: number = ecma262.ToNumber(number);
  return Number.isFinite(num);
};

// 19.2.3 isNaN (number)
// https://tc39.es/ecma262/#sec-isnan-number
export const isNaN = (number: any): boolean => {
  const num: number = ecma262.ToNumber(number);
  return Number.isNaN(num);
};
