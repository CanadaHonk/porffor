import { Blocktype, Opcodes, Valtype } from "./wasmSpec.js";

const inv = obj => Object.keys(obj).reduce((acc, x) => { acc[obj[x]] = x; return acc; }, {});
const invOpcodes = inv(Opcodes);
const invValtype = inv(Valtype);

export default wasm => {
  let out = '', depth = 0;
  for (const inst of wasm) {
    if (inst[0] === null) continue;

    if (inst[0] === Opcodes.end) depth--;

    const opStr = invOpcodes[inst[0]];
    if (!opStr) console.log(`decomp: unknown op ${inst[0].toString(16)}`)
    out += ' '.repeat(depth * 2) + opStr.replace('_', '.');

    if (inst[0] === Opcodes.if || inst[0] === Opcodes.loop || inst[0] === Opcodes.block) depth++;

    for (const operand of inst.slice(1)) {
      if (inst[0] === Opcodes.if || inst[0] === Opcodes.loop || inst[0] === Opcodes.block) {
        if (operand === Blocktype.void) continue;
        out += ` ${invValtype[operand]}`;
      } else {
        out += ` ${operand}`;
      }
    }

    out += '\n';
  }

  return highlightAsm(out);
};

export const highlightAsm = asm =>
  asm
    .replace(/local\.[^\s]*/g, _ => `\x1B[31m${_}\x1B[0m`)
    .replace(/(i32|i64|f32|f64)\.[^\s]*/g, _ => `\x1B[36m${_}\x1B[0m`)
    .replace(/(call|br_if|br|if|return)/g, _ => `\x1B[35m${_}\x1B[0m`)
    .replace(/(block|loop|if|end)/g, _ => `\x1B[95m${_}\x1B[0m`)
    .replace(/ [0-9\-]+/g, _ => ` \x1B[33m${_.slice(1)}\x1B[0m`)