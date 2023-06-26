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

  return out;
};