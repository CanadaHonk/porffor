// // @porf -funsafe-no-unlikely-proto-checks

// radix: number|any for rawType check
export const __Number_prototype_toString = (_this: number, radix: number|any) => {
  // todo: use exponential notation if >=1e21 (?)

  if (Porffor.rawType(radix) != Porffor.TYPES.number) {
    // todo: string to number
    radix = 10;
  }

  let out: bytestring = '';

  if (radix < 2 || radix > 36) {
    // todo: throw RangeError: toString() radix argument must be between 2 and 36
    return out;
  }

  if (!Number.isFinite(_this)) {
    if (Number.isNaN(_this)) out = 'NaN';
      else if (_this == Infinity) out = 'Infinity';
      else out = '-Infinity';

    return out;
  }

  let i: i32 = Math.abs(_this | 0);

  if (i == 0) {
    out = '0';
  } else {
    let digits: bytestring = ''; // byte "array"

    let l: i32 = 0;
    for (; i > 0; l++) {
      Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}` + l, i % radix, 0, 4);

      i = (i / radix) | 0;
    }

    let outPtr: i32 = Porffor.wasm`local.get ${out}`;
    let digitsPtr: i32 = Porffor.wasm`local.get ${digits}` + l;
    const endPtr: i32 = outPtr + l;
    while (outPtr < endPtr) {
      let digit: i32 = Porffor.wasm.i32.load8_u(--digitsPtr, 0, 4);

      if (digit < 10) digit += 48; // 0-9
        else digit += 87; // a-z

      Porffor.wasm.i32.store8(outPtr++, digit, 0, 4);
    }

    out.length = l;
  }

  // todo: decimal part

  return out;
};