import { Opcodes, Valtype } from './wasmSpec.js';
import { signedLEB128, ieee754_binary64, signedLEB128_into } from './encoding.js';

export const number = (n, valtype = valtypeBinary) => {
  if (valtype === Valtype.f64) return [ Opcodes.f64_const, n ];

  const out = [ valtype === Valtype.i32 ? Opcodes.i32_const : Opcodes.i64_const ];
  signedLEB128_into(n, out);

  return out;
};

export const enforceOneByte = arr => [ arr[0] ?? 0 ];
export const enforceTwoBytes = arr => [ arr[0] ?? 0, arr[1] ?? 0 ];
export const enforceFourBytes = arr => [ arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0, arr[3] ?? 0 ];
export const enforceEightBytes = arr => [ arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0, arr[3] ?? 0, arr[4] ?? 0, arr[5] ?? 0, arr[6] ?? 0, arr[7] ?? 0 ];

export const i32x4 = (a, b, c, d) => [ [
  ...Opcodes.v128_const,
  ...enforceFourBytes(signedLEB128(a)),
  ...enforceFourBytes(signedLEB128(b)),
  ...enforceFourBytes(signedLEB128(c)),
  ...enforceFourBytes(signedLEB128(d))
] ];