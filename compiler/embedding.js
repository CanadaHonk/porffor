import { Opcodes, Valtype } from './wasmSpec.js';

export const number = (n, valtype = valtypeBinary) => {
  switch (valtype) {
    case Valtype.i32: return [ [ Opcodes.i32_const, n | 0 ] ];
    case Valtype.i64: return [ [ Opcodes.i64_const, BigInt.asIntN(64, BigInt(n)) ] ];
    case Valtype.f64: return [ [ Opcodes.f64_const, Number(n) ] ];
  }
};
