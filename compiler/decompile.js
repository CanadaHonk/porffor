import { Blocktype, Opcodes, Valtype } from "./wasmSpec.js";
import { read_ieee754_binary64, read_signedLEB128, read_unsignedLEB128 } from "./encoding.js";

const inv = (obj, keyMap = x => x) => Object.keys(obj).reduce((acc, x) => { acc[keyMap(obj[x])] = x; return acc; }, {});
const invOpcodes = inv(Opcodes);
const invValtype = inv(Valtype);

export default (wasm, name = '', ind = 0, locals = {}, params = [], returns = [], funcs = [], globals = {}, exceptions = []) => {
  const invLocals = inv(locals, x => x.idx);
  const invGlobals = inv(globals, x => x.idx);

  const makeSignature = (params, returns) => `(${params.map(x => invValtype[x]).join(', ')}) -> (${returns.map(x => invValtype[x]).join(', ')})`;

  let out = '', depth = name ? 1 : 0;
  if (name) out += `${makeSignature(params, returns)} ;; $${name} (${ind})\n`;

  const justLocals = Object.values(locals).sort((a, b) => a.idx - b.idx).slice(params.length);
  if (justLocals.length > 0) out += `  local ${justLocals.map(x => invValtype[x.type]).join(' ')}\n`;

  let i = 0, lastInst;
  for (let inst of wasm.concat(name ? [ [ Opcodes.end ] ] : [])) {
    if (inst[0] === null) continue;

    if (inst[0] === 0xfd) { // simd inst prefix
      if (inst[1] >= 128) inst = [ [ inst[0], inst[1], inst[2] ], ...inst.slice(3) ];
        else inst = [ [ inst[0], inst[1] ], ...inst.slice(2) ];
    }

    if (inst[0] === 0xfc) { // misc inst prefix
      inst = [ [ inst[0], inst[1] ], ...inst.slice(2) ];
    }

    if (inst[0] === Opcodes.end || inst[0] === Opcodes.else || inst[0] === Opcodes.catch_all) depth--;

    const opStr = invOpcodes[inst[0]];
    if (!opStr) console.log(`decomp: unknown op ${inst[0].toString(16)}`)
    out += /* ' '.repeat(3 - i.toString().length) + i + ' ' + */ ' '.repeat(Math.max(0, depth * 2)) + opStr.replace('_', '.').replace('return.', 'return_').replace('call.', 'call_').replace('br.', 'br_');

    if (inst[0] === Opcodes.if || inst[0] === Opcodes.loop || inst[0] === Opcodes.block || inst[0] === Opcodes.else || inst[0] === Opcodes.try || inst[0] === Opcodes.catch_all) depth++;

    if (inst[0] === Opcodes.f64_const) {
      out += ` ${read_ieee754_binary64(inst.slice(1))}`;
    } else if (inst[0] === Opcodes.i32_const || inst[0] === Opcodes.i64_const) {
      out += ` ${read_signedLEB128(inst.slice(1))}`;
    } else if (inst[0] === Opcodes.i32_load || inst[0] === Opcodes.i64_load || inst[0] === Opcodes.f64_load || inst[0] === Opcodes.i32_store || inst[0] === Opcodes.i64_store || inst[0] === Opcodes.f64_store || inst[0] === Opcodes.i32_store16 || inst[0] === Opcodes.i32_load16_u) {
      out += ` ${inst[1]} ${read_unsignedLEB128(inst.slice(2))}`;
    } else for (const operand of inst.slice(1)) {
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

    if (inst[0] === Opcodes.call || inst[0] === Opcodes.return_call) {
      const callFunc = funcs.find(x => x.index === inst[1]);
      if (callFunc) out += ` ;; $${callFunc.name} ${makeSignature(callFunc.params, callFunc.returns)}`;
    }

    if (inst[0] === Opcodes.local_get || inst[0] === Opcodes.local_set || inst[0] === Opcodes.local_tee) {
      const name = invLocals[inst[1]];
      const type = invValtype[locals[name]?.type];
      if (name) out += ` ;; $${name}${type !== valtype ? ` (${type})` : ''}`;
    }

    if (inst[0] === Opcodes.global_get || inst[0] === Opcodes.global_set) {
      const name = invGlobals[inst[1]];
      const type = invValtype[globals[name]?.type];
      if (name) out += ` ;; $${name}${type !== valtype ? ` (${type})` : ''}`;
    }

    if (inst[0] === Opcodes.throw && lastInst && exceptions) {
      const exception = exceptions[lastInst[1]];
      if (exception) out += ` ;; ${exception.constructor ? `${exception.constructor}('${exception.message}')` : `'${exception.message}'`}`;
    }

    out += '\n';
    lastInst = inst;
    i++;
  }

  return highlightAsm(out);
};

export const highlightAsm = asm =>
  asm
    .replace(/(local|global|memory)\.[^\s]*/g, _ => `\x1B[31m${_}\x1B[0m`)
    .replace(/(i(8|16|32|64)x[0-9]+|v128)(\.[^\s]*)?/g, _ => `\x1B[34m${_}\x1B[0m`)
    .replace(/[^m](i32|i64|f32|f64)(\.[^\s]*)?/g, _ => `${_[0]}\x1B[36m${_.slice(1)}\x1B[0m`)
    .replace(/(return_call|call|br_if|br|return|throw|rethrow)/g, _ => `\x1B[35m${_}\x1B[0m`)
    .replace(/(block|loop|if|end|else|try|catch|catch_all|delegate)/g, _ => `\x1B[95m${_}\x1B[0m`)
    .replace(/ \-?[0-9\.]+/g, _ => ` \x1B[33m${_.slice(1)}\x1B[0m`)
    .replace(/ ;;.*$/gm, _ => `\x1B[90m${_.replaceAll(/\x1B\[[0-9]+m/g, '')}\x1B[0m`);