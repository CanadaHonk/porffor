// // @porf -funsafe-no-unlikely-proto-checks

export const __Number_prototype_toString = (_this: number, radix: number) => {
  // todo: use radix

  let out: bytestring = '';

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
      let d: i32 = i % 10;

      Porffor.wasm.i32.store8(Porffor.wasm`local.get ${digits}` + l, d, 0, 4);

      i = (i / 10) | 0;
    }

    let outPtr: i32 = Porffor.wasm`local.get ${out}`;
    let digitsPtr: i32 = Porffor.wasm`local.get ${digits}` + l;
    const endPtr: i32 = outPtr + l;
    while (outPtr < endPtr) {
      Porffor.wasm.i32.store8(outPtr++, 48 + Porffor.wasm.i32.load8_u(--digitsPtr, 0, 4), 0, 4);
    }

    out.length = l;
  }

  // todo: decimal part

  return out;
};