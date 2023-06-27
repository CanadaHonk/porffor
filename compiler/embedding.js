import { Opcodes } from "./wasmSpec.js";
import { signedLEB128 } from "./encoding.js";

export const number = n => [ [ Opcodes.const, ...signedLEB128(n) ] ];