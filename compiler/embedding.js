import { Opcodes, Valtype } from './wasmSpec.js';
import { signedLEB128, ieee754_binary64 } from './encoding.js';

export const number = (n, valtype = valtypeBinary) => {
  switch (valtype) {
    case Valtype.i32: return [ [ Opcodes.i32_const, ...signedLEB128(n) ] ];
    case Valtype.i64: return [ [ Opcodes.i64_const, ...signedLEB128(n) ] ];
    case Valtype.f64: return [ [ Opcodes.f64_const, n ] ];
  }
};

export const typedNumber = (n, type) => number(n).concat(number(type, Valtype.i32));

export const i32x4 = (a, b, c, d) => [ [
  ...Opcodes.v128_const,
  ...new Uint8Array(new Int32Array([ a, b, c, d ]).buffer)
] ];