import type {} from './porffor.d.ts';

export const BigInt = function (value: number): any {
  let result: BigInt = Porffor.wasm`
    local.get ${value}
    i64.trunc_sat_f64_s
    f64.reinterpret_i64
  `;
  return result;
};

export const __BigInt_prototype_toString = (_this: BigInt, radix: number|any) => {
  let out: bytestring = Porffor.allocateBytes(69); // length + sign + 64 digits
  let outPtr: i32 = Porffor.wasm`local.get ${out}`;

  if (Porffor.rawType(radix) != Porffor.TYPES.number) {
    // todo: string to number
    radix = 10;
  }

  radix |= 0;
  if (radix < 2 || radix > 36) {
    throw new RangeError('toString() radix argument must be between 2 and 36');
  }

  if (Porffor.wasm`
    local.get ${_this}
    i64.reinterpret_f64
    i64.eqz
    f64.convert_i32_s
  `) {
    return out = "0n";
  }

  // if negative value
  if (Porffor.wasm`
    local.get ${_this}
    i64.reinterpret_f64
    i64.const 0
    i64.le_s
    f64.convert_i32_s
  `) {
    Porffor.wasm`
      i64.const 0
      local.get ${_this}
      i64.reinterpret_f64
      i64.sub
      f64.reinterpret_i64
      local.set ${_this}
    `; // turn value positive for later use
    Porffor.wasm.i32.store8(outPtr++, 45, 0, 4); // prepend -
  }
  let offset: i32 = 19;
  while (Porffor.wasm`
    local.get ${_this}
    i64.reinterpret_f64
    i64.const 0
    i64.ne
    f64.convert_i32_s
  `) {
    let digit = Porffor.wasm`
      local.get ${_this}
      i64.reinterpret_f64
      local.get ${radix}
      i64.trunc_sat_f64_u
      i64.rem_s
      i32.wrap_i64
      f64.convert_i32_s
    `;
    offset--;
    Porffor.wasm`
      local.get ${offset}
      i32.trunc_sat_f64_s
      local.get ${outPtr}
      i32.trunc_sat_f64_s
      i32.add
      i32.const 87 ;; char code 'a' - 10
      i32.const 48
      local.get ${digit}
      i32.trunc_sat_f64_s
      i32.const 10
      i32.ge_s
      select
      local.get ${digit}
      i32.trunc_sat_f64_s
      i32.add
      i32.store8 0 4
      local.get ${_this}
      i64.reinterpret_f64
      local.get ${radix}
      i64.trunc_sat_f64_u
      i64.div_s
      f64.reinterpret_i64
      local.set ${_this}
    `;
  }
  Porffor.wasm.memory.copy(outPtr + 4, outPtr + offset + 4, 19 - offset, 0, 0); // move to start
  out.length = outPtr + 19 - offset - Porffor.wasm`local.get ${out}`;
  return out;
};
