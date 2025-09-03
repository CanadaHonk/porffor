import { Blocktype, Opcodes, Valtype } from './wasmSpec.js';
import { read_unsignedLEB128 } from './encoding.js';
import { importedFuncs } from './builtins.js';

const inv = (obj, keyMap = x => x) => Object.keys(obj).reduce((acc, x) => { acc[keyMap(obj[x])] = x; return acc; }, {});
const invOpcodes = inv(Opcodes);
const invValtype = inv(Valtype);
globalThis.invOpcodes = invOpcodes;
globalThis.invValtype = invValtype;

export default (wasm, name = '', ind = 0, locals = {}, params = [], returns = [], funcs = [], globals = {}, exceptions = []) => {
  const invLocals = inv(locals, x => x.idx);
  const invGlobals = inv(globals, x => x.idx);

  const makeSignature = (params, returns, locals) => {
    if (locals) {
      const localNames = inv(locals, x => x.idx);
      return `(${params.map((x, i) => `${localNames[i]}(${i}): ${invValtype[x]}`).join(', ')}) -> (${returns.map(x => invValtype[x]).join(', ')})`;
    }

    return `(${params.map((x, i) => invValtype[x]).join(', ')}) -> (${returns.map(x => invValtype[x]).join(', ')})`;
  };

  let out = '', depth = 0;
  if (name) out += `${name}(${ind}) ${makeSignature(params, returns, locals)}\n`;

  const justLocals = Object.values(locals).sort((a, b) => a.idx - b.idx).slice(params.length);
  if (name) for (const x of justLocals) {
    out += `;; local ${invLocals[x.idx]}(${x.idx}): ${invValtype[x.type]}\n`
  }

  let i = -1, lastInst;
  let byte = 0;
  for (let inst of wasm) {
    i++;
    if (inst[0] === null) continue;

    if (inst[0] === 0xfd) { // simd inst prefix
      if (inst[1] >= 128) inst = [ [ inst[0], inst[1], inst[2] ], ...inst.slice(3) ];
        else inst = [ [ inst[0], inst[1] ], ...inst.slice(2) ];
    } else if (inst[0] > 0xf0) { // other multi-byte insts
      inst = [ [ inst[0], inst[1] ], ...inst.slice(2) ];
    }

    if (depth > 0 && (inst[0] === Opcodes.end || inst[0] === Opcodes.else || inst[0] === Opcodes.catch_all || inst[0] === Opcodes.catch)) depth--;

    out += ' '.repeat(Math.max(0, depth * 2));

    let opStr = invOpcodes[inst[0]];
    if (!opStr) {
      console.log(`disasm: unknown op ${inst[0]?.toString?.(16)} @${i}`);
      // console.log(`prior: ${invOpcodes[wasm[i - 1][0]]}`);
      out += `;; unknown op ${inst[0]?.toString?.(16)}\n`;
      continue;
    }

    // out += '0x' + byte.toString(10).padStart(2, '0');
    byte += inst.length;

    out += opStr.replace('_', '.').replace('return.', 'return_').replace('call.', 'call_').replace('br.', 'br_').replace('catch.', 'catch_');

    const comments = [];
    inst = inst.filter(x => {
      if (typeof x === 'string') {
        comments.push(x);
        return false;
      }

      return true;
    })

    if (inst[0] === Opcodes.if || inst[0] === Opcodes.loop || inst[0] === Opcodes.block || inst[0] === Opcodes.else || inst[0] === Opcodes.try || inst[0] === Opcodes.catch_all || inst[0] === Opcodes.catch) depth++;

    if (inst[0] === Opcodes.f64_const) {
      out += ` ${inst[1]}`;
    } else if (inst[0] === Opcodes.i32_const || inst[0] === Opcodes.i64_const) {
      out += ` ${inst[1]}`;
    } else if (inst[0] === Opcodes.i32_load || inst[0] === Opcodes.i64_load || inst[0] === Opcodes.f64_load || inst[0] === Opcodes.i32_store || inst[0] === Opcodes.i64_store || inst[0] === Opcodes.f64_store || inst[0] === Opcodes.i32_store16 || inst[0] === Opcodes.i32_load16_u) {
      out += ` ${inst[1]} ${read_unsignedLEB128(inst.slice(2))}`;
    } else for (const operand of inst.slice(1)) {
      if (inst[0] === Opcodes.if || inst[0] === Opcodes.loop || inst[0] === Opcodes.block || inst[0] === Opcodes.try) {
        if (operand === Blocktype.void) continue;
        out += ` ${invValtype[operand]}`;
      } else {
        out += ` ${operand}`;
      }
    }

    if (comments.length > 0) out += ` ;; ${comments.join(' ')}`;

    if (inst[0] === Opcodes.if || inst[0] === Opcodes.loop || inst[0] === Opcodes.block || inst[0] === Opcodes.else || inst[0] === Opcodes.try || inst[0] === Opcodes.catch_all || inst[0] === Opcodes.catch) {
      out += ` ;; label @${depth}`;
    }

    if (inst[0] === Opcodes.br || inst[0] === Opcodes.br_if) {
      out += ` ;; goto @${depth - inst[1]}`;
    }

    if (inst[0] === Opcodes.call || inst[0] === Opcodes.return_call) {
      const idx = inst[1];
      const callFunc = funcs.find(x => x.index === idx);
      if (callFunc) out += ` ;; $${callFunc.name} ${makeSignature(callFunc.params, callFunc.returns)}`;
      if (idx < importedFuncs.length) {
        const importFunc = importedFuncs[idx];
        out += ` ;; import ${importFunc.name} ${makeSignature(importFunc.params, importFunc.returns)}`;
      }
    }

    if (inst[0] === Opcodes.local_get || inst[0] === Opcodes.local_set || inst[0] === Opcodes.local_tee) {
      const name = invLocals[inst[1]];
      const type = invValtype[locals[name]?.type];
      if (name) out += ` ;; $${name}${type !== valtype ? ` (${type})` : ''}`;
        else out += ` ;; unknown local`
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
  }

  return highlightAsm(out);
};

export const highlightAsm = asm => asm
  .replace(/(local|global|memory)\.[^\s]*/g, _ => `\x1B[31m${_}\x1B[0m`)
  .replace(/(i(8|16|32|64)x[0-9]+|v128)(\.[^\s]*)?/g, _ => `\x1B[34m${_}\x1B[0m`)
  .replace(/(i32|i64|f32|f64|drop)(\.[^\s]*)?/g, _ => `\x1B[36m${_}\x1B[0m`)
  .replace(/(return_call|call_indirect|call|br_if|br|return|rethrow|throw)/g, _ => `\x1B[35m${_}\x1B[0m`)
  .replace(/(block|loop|if|end|else|try|catch_all|catch|delegate)/g, _ => `\x1B[95m${_}\x1B[0m`)
  .replace(/unreachable/g, _ => `\x1B[91m${_}\x1B[0m`)
  .replace(/ \-?[0-9\.]+/g, _ => ` \x1B[33m${_.slice(1)}\x1B[0m`)
  .replace(/;;.*$/gm, _ => `\x1B[2m${_.replaceAll(/\x1B\[[0-9]+m/g, '')}\x1B[0m`);