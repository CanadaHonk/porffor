import { Opcodes, Valtype } from './wasmSpec.js';
import { TYPES } from './types.js';

const f64ifyBitwise = op => (_1, _2, { left, right }) => [
  ...left,
  Opcodes.i32_trunc_sat_f64_s,
  ...right,
  Opcodes.i32_trunc_sat_f64_s,
  [ op ],
  [ Opcodes.f64_convert_i32_s ]
];

export const operatorOpcode = {
  i32: {
    '+': Opcodes.i32_add,
    '-': Opcodes.i32_sub,
    '*': Opcodes.i32_mul,
    '/': Opcodes.i32_div_s,
    '%': Opcodes.i32_rem_s,

    '&': Opcodes.i32_and,
    '|': Opcodes.i32_or,
    '^': Opcodes.i32_xor,
    '<<': Opcodes.i32_shl,
    '>>': Opcodes.i32_shr_s,
    '>>>': Opcodes.i32_shr_u,

    '==': Opcodes.i32_eq,
    '===': Opcodes.i32_eq,
    '!=': Opcodes.i32_ne,
    '!==': Opcodes.i32_ne,

    '>': Opcodes.i32_gt_s,
    '>=': Opcodes.i32_ge_s,
    '<': Opcodes.i32_lt_s,
    '<=': Opcodes.i32_le_s,

    '**': (_, { builtin }, { left, right }) => [
      ...left,
      [ Opcodes.f64_convert_i32_s ],
      [ Opcodes.i32_const, TYPES.number ],
      ...right,
      [ Opcodes.f64_convert_i32_s ],
      [ Opcodes.i32_const, TYPES.number ],
      [ Opcodes.call, builtin('__Math_pow') ]
    ]
  },

  f64: {
    '+': Opcodes.f64_add,
    '-': Opcodes.f64_sub,
    '*': Opcodes.f64_mul,
    '/': Opcodes.f64_div,

    '==': Opcodes.f64_eq,
    '===': Opcodes.f64_eq,
    '!=': Opcodes.f64_ne,
    '!==': Opcodes.f64_ne,

    '>': Opcodes.f64_gt,
    '>=': Opcodes.f64_ge,
    '<': Opcodes.f64_lt,
    '<=': Opcodes.f64_le,

    '**': (_, { builtin }, { left, right }) => [
      ...left,
      [ Opcodes.i32_const, TYPES.number ],
      ...right,
      [ Opcodes.i32_const, TYPES.number ],
      [ Opcodes.call, builtin('__Math_pow') ]
    ],

    '%': (_, { builtin, loc }, { left, right }) => [
      // a - truncf(a / b) * b
      ...left,
      [ Opcodes.local_tee, loc('#math_a', Valtype.f64) ],
      ...right,
      [ Opcodes.local_tee, loc('#math_b', Valtype.f64) ],

      [ Opcodes.local_get, loc('#math_a', Valtype.f64) ],
      [ Opcodes.local_get, loc('#math_b', Valtype.f64) ],
      [ Opcodes.f64_div ],
      [ Opcodes.f64_trunc ],

      [ Opcodes.f64_mul ],
      [ Opcodes.f64_sub ]
    ],

    // add bitwise ops by converting operands to i32 first
    '&': f64ifyBitwise(Opcodes.i32_and),
    '|': f64ifyBitwise(Opcodes.i32_or),
    '^': f64ifyBitwise(Opcodes.i32_xor),
    '<<': f64ifyBitwise(Opcodes.i32_shl),
    '>>': f64ifyBitwise(Opcodes.i32_shr_s),
    '>>>': f64ifyBitwise(Opcodes.i32_shr_u)
  }
};