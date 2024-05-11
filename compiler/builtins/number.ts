// @porf --funsafe-no-unlikely-proto-checks

// radix: number|any for rawType check
export const __Number_prototype_toString = (_this: number, radix: number|any) => {
  let out: bytestring = '';
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  if (!Number.isFinite(_this)) {
    if (Number.isNaN(_this)) out = 'NaN';
      else if (_this == Infinity) out = 'Infinity';
      else out = '-Infinity';

    return out;
  }

  if (Porffor.rawType(radix) != Porffor.TYPES.number) {
    // todo: string to number
    radix = 10;
  }

  radix |= 0;
  if (radix < 2 || radix > 36) {
    // todo: throw RangeError: toString() radix argument must be between 2 and 36
    return out;
  }

  if (_this == 0) {
    out = '0';
    return out;
  }

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
  let out: bytestring = '';
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  if (!Number.isFinite(_this)) {
    if (Number.isNaN(_this)) out = 'NaN';
      else if (_this == Infinity) out = 'Infinity';
      else out = '-Infinity';

    return out;
  }

  fractionDigits |= 0;
  if (fractionDigits < 0 || fractionDigits > 100) {
    // todo: throw RangeError: toFixed() digits argument must be between 0 and 100
    return out;
  }

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

// fractionDigits: number|any for rawType check
export const __Number_prototype_toExponential = (_this: number, fractionDigits: number|any) => {
  let out: bytestring = '';
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  if (!Number.isFinite(_this)) {
    if (Number.isNaN(_this)) out = 'NaN';
      else if (_this == Infinity) out = 'Infinity';
      else out = '-Infinity';

    return out;
  }

  if (Porffor.rawType(fractionDigits) != Porffor.TYPES.number) {
    // todo: string to number
    fractionDigits = undefined;
  } else {
    fractionDigits |= 0;
    if (fractionDigits < 0 || fractionDigits > 100) {
      // todo: throw RangeError: toExponential() digits argument must be between 0 and 100
      return out;
    }
  }

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