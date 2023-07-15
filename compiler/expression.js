import { Opcodes } from "./wasmSpec.js";

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

    '==': Opcodes.i32_eq,
    '===': Opcodes.i32_eq,
    '!=': Opcodes.i32_ne,
    '!==': Opcodes.i32_ne,

    '>': Opcodes.i32_gt_s,
    '>=': Opcodes.i32_ge_s,
    '<': Opcodes.i32_lt_s,
    '<=': Opcodes.i32_le_s
  },

  i64: {
    '+': Opcodes.i64_add,
    '-': Opcodes.i64_sub,
    '*': Opcodes.i64_mul,
    '/': Opcodes.i64_div_s,
    '%': Opcodes.i64_rem_s,

    '&': Opcodes.i64_and,
    '|': Opcodes.i64_or,
    '^': Opcodes.i64_xor,
    '<<': Opcodes.i64_shl,
    '>>': Opcodes.i64_shr_s,

    '==': Opcodes.i64_eq,
    '===': Opcodes.i64_eq,
    '!=': Opcodes.i64_ne,
    '!==': Opcodes.i64_ne,

    '>': Opcodes.i64_gt_s,
    '>=': Opcodes.i64_ge_s,
    '<': Opcodes.i64_lt_s,
    '<=': Opcodes.i64_le_s
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
    '<=': Opcodes.f64_le
  }
};