import { Opcodes, Valtype } from "./wasmSpec.js";
import { signedLEB128, ieee754_binary64 } from "./encoding.js";

export const number = (n, valtype = valtypeBinary) => {
  switch (valtype) {
    case Valtype.i32: return [ [ Opcodes.i32_const, ...signedLEB128(n) ] ];
    case Valtype.i64: return [ [ Opcodes.i64_const, ...signedLEB128(n) ] ];
    case Valtype.f64: return [ [ Opcodes.f64_const, ...ieee754_binary64(n) ] ];
  }
};

const enforceTwoBytes = arr => [ arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0, arr[3] ?? 0 ];
export const i32x4 = (a, b, c, d) => [ [
  ...Opcodes.v128_const,
  ...enforceTwoBytes(signedLEB128(a)),
  ...enforceTwoBytes(signedLEB128(b)),
  ...enforceTwoBytes(signedLEB128(c)),
  ...enforceTwoBytes(signedLEB128(d))
] ];