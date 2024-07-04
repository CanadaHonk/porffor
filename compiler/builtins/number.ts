import type {} from './porffor.d.ts';

export function Number(argument: any): any {
  // todo: actually do prim objects
  new.target; // trick compiler into allowing as constructor

  return ecma262.ToNumeric(argument);
};

// radix: number|any for rawType check
export function __Number_prototype_toString(radix: number|any) {
  let out: bytestring = Porffor.allocate();
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  if (!Number.isFinite(this)) {
    if (Number.isNaN(this)) return out = 'NaN';
    if (this == Infinity) return out = 'Infinity';
    return out = '-Infinity';
  }

  if (Porffor.rawType(radix) != Porffor.TYPES.number) {
    // todo: string to number
    radix = 10;
  }

  radix |= 0;
  if (radix < 2 || radix > 36) {
    throw new RangeError('toString() radix argument must be between 2 and 36');
  }

  if (this == 0) {
    return out = '0';
  }

  // if negative value
  if (this < 0) {
    Porffor.wasm`
    local.get ${this}
    f64.neg
    local.set ${this}`; // turn value positive for later use
    Porffor.wasm.i32.store8(outPtr++, 45, 0, 4); // prepend -
  }

  let i: f64 = Math.trunc(this);

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

    if (this < 1e-6) {
      // small exponential
      let decimal: f64 = this;

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

  let decimal: f64 = this - Math.trunc(this);
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

export function __Number_prototype_toFixed(fractionDigits: number) {
  let out: bytestring = Porffor.allocate();
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  if (!Number.isFinite(this)) {
    if (Number.isNaN(this)) return out = 'NaN';
    if (this == Infinity) return out = 'Infinity';
    return out = '-Infinity';
  }

  fractionDigits |= 0;
  if (fractionDigits < 0 || fractionDigits > 100) {
    throw new RangeError('toFixed() fractionDigits argument must be between 0 and 100');
  }

  // if negative value
  if (this < 0) {
    Porffor.wasm`
    local.get ${this}
    f64.neg
    local.set ${this}`; // turn value positive for later use
    Porffor.wasm.i32.store8(outPtr++, 45, 0, 4); // prepend -
  }

  let i: f64 = Math.trunc(this);

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

  let decimal: f64 = this - Math.trunc(this);
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

export function __Number_prototype_toLocaleString() {
  return __Number_prototype_toString.call(this, 10)
};

// fractionDigits: number|any for rawType check
export function __Number_prototype_toExponential(fractionDigits: number|any) {
  let out: bytestring = Porffor.allocate();
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  if (!Number.isFinite(this)) {
    if (Number.isNaN(this)) return out = 'NaN';
    if (this == Infinity) return out = 'Infinity';
    return out = '-Infinity';
  }

  if (Porffor.rawType(fractionDigits) != Porffor.TYPES.number) {
    // todo: string to number
    fractionDigits = undefined;
  } else {
    fractionDigits |= 0;
    if (fractionDigits < 0 || fractionDigits > 100) {
      throw new RangeError('toExponential() fractionDigits argument must be between 0 and 100');
    }
  }

  // if negative value
  if (this < 0) {
    Porffor.wasm`
    local.get ${this}
    f64.neg
    local.set ${this}`; // turn value positive for later use
    Porffor.wasm.i32.store8(outPtr++, 45, 0, 4); // prepend -
  }

  let i: f64 = this;

  let digits: bytestring = ''; // byte "array"

  let l: i32 = 0;
  let e: i32 = 0;
  let digitsPtr: i32;
  let endPtr: i32;
  if (this == 0) {
    Porffor.wasm.i32.store8(outPtr++, 48, 0, 4); // 0

    if (fractionDigits > 0) {
      Porffor.wasm.i32.store8(outPtr++, 46, 0, 4); // .
      for (let j: i32 = 0; j < fractionDigits; j++) {
        Porffor.wasm.i32.store8(outPtr++, 48, 0, 4); // 0
      }
    }

    Porffor.wasm.i32.store8(outPtr++, 101, 0, 4); // e
    Porffor.wasm.i32.store8(outPtr++, 43, 0, 4); // +
  } else if (this < 1) {
    // small exponential
    if (Porffor.rawType(fractionDigits) != Porffor.TYPES.number) {
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

    if (Porffor.rawType(fractionDigits) != Porffor.TYPES.number) {
      while (true) {
        i *= 10;

        const intPart: i32 = Math.trunc(i);
        if (intPart > 0) {
          if (i - intPart < 1e-10) break;
        } else e++;
      }
    } else {
      // i = this;
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
export function __Number_prototype_valueOf() {
  // 1. Return ? ThisNumberValue(this value).
  return this;
};


export const parseInt = (input: any, radix: any): f64 => {
  // todo/perf: optimize this instead of doing a naive algo (https://kholdstare.github.io/technical/2020/05/26/faster-integer-parsing.html)
  // todo/perf: use i32s here once that becomes not annoying

  input = ecma262.ToString(input).trim();

  let defaultRadix: boolean = false;
  radix = ecma262.ToIntegerOrInfinity(radix);
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

  if (Porffor.rawType(input) == Porffor.TYPES.bytestring) {
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

  let i = 0;
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

  const len: i32 = input.length;
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