import { Opcodes } from "./wasmSpec.js";

export const operatorOpcode = {
  '+': Opcodes.i32_add,
  '-': Opcodes.i32_sub,
  '*': Opcodes.i32_mul,
  '/': Opcodes.i32_div_s,

  '==': Opcodes.i32_eq,
  '===': Opcodes.i32_eq,
  '!=': Opcodes.i32_ne,
  '!==': Opcodes.i32_ne
};