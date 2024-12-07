import { Opcodes, Valtype } from './wasmSpec.js';
import { signedLEB128, ieee754_binary64, signedLEB128_into } from './encoding.js';

export const number = (n, valtype = valtypeBinary) => {
  if (valtype === Valtype.f64) return [ Opcodes.f64_const, n ];

  const out = [ valtype === Valtype.i32 ? Opcodes.i32_const : Opcodes.i64_const ];
  signedLEB128_into(n, out);

  return out;
};