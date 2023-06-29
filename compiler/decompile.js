import { Blocktype, Opcodes, Valtype } from "./wasmSpec.js";

const inv = (obj, keyMap = x => x) => Object.keys(obj).reduce((acc, x) => { acc[keyMap(obj[x])] = x; return acc; }, {});
const invOpcodes = inv(Opcodes);
const invValtype = inv(Valtype);

export default (wasm, name = '', locals = {}, params = [], returns = []) => {
  const invLocals = inv(locals, x => x.idx);

  let out = '', depth = 1;
  out += `(${params.map(x => invValtype[x]).join(', ')}) -> (${returns.map(x => invValtype[x]).join(', ')}) ;; ${name}\n`;
  out += `  local ${Object.values(locals).map(x => invValtype[x.type]).join(' ')}\n`;

  for (const inst of wasm.concat([ [ Opcodes.end ] ])) {
    if (inst[0] === null) continue;

    if (inst[0] === Opcodes.end || inst[0] === Opcodes.else) depth--;

    const opStr = invOpcodes[inst[0]];
    if (!opStr) console.log(`decomp: unknown op ${inst[0].toString(16)}`)
    out += ' '.repeat(depth * 2) + opStr.replace('_', '.');

    if (inst[0] === Opcodes.if || inst[0] === Opcodes.loop || inst[0] === Opcodes.block || inst[0] === Opcodes.else) depth++;

    for (const operand of inst.slice(1)) {
      if (inst[0] === Opcodes.if || inst[0] === Opcodes.loop || inst[0] === Opcodes.block) {
        if (operand === Blocktype.void) continue;
        out += ` ${invValtype[operand]}`;
      } else {
        out += ` ${operand}`;
      }
    }

    if (inst[0] === Opcodes.if || inst[0] === Opcodes.loop || inst[0] === Opcodes.block || inst[0] === Opcodes.else) {
      out += ` ;; label @${depth}`;
    }

    if (inst[0] === Opcodes.br) {
      out += ` ;; goto @${depth - inst[1]}`;
    }

    if (inst[0] === Opcodes.local_get || inst[0] === Opcodes.local_set || inst[0] === Opcodes.local_tee) {
      out += ` ;; ${invLocals[inst[1]]}`;
    }

    out += '\n';
  }

  return highlightAsm(out);
};

export const highlightAsm = asm =>
  asm
    .replace(/local\.[^\s]*/g, _ => `\x1B[31m${_}\x1B[0m`)
    .replace(/(i32|i64|f32|f64)(\.[^\s]*)?/g, _ => `\x1B[36m${_}\x1B[0m`)
    .replace(/(call|br_if|br|return)/g, _ => `\x1B[35m${_}\x1B[0m`)
    .replace(/(block|loop|if|end|else)/g, _ => `\x1B[95m${_}\x1B[0m`)
    .replace(/ [0-9]+/g, _ => ` \x1B[33m${_.slice(1)}\x1B[0m`)
    .replace(/ ;;.*$/gm, _ => `\u001b[90m${_}\x1B[0m`);