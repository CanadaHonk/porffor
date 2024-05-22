// havoc: wasm rewrite library (it wreaks havoc upon wasm bytecode hence "havoc")
import { Opcodes, Valtype } from './wasmSpec.js';

export const localsToConsts = (func, targets, consts, { localKeys }) => {
  const { wasm, locals } = func;

  // update locals object
  localKeys ??= Object.keys(locals).sort((a, b) => a.idx - b.idx);
  for (const x of targets) {
    delete locals[localKeys[x]];
  }

  const idxLut = {};
  for (const x in locals) {
    let i = locals[x].idx;
    const o = i;
    for (let j = 0; j < targets.length; j++) {
      if (o > targets[j]) i--;
    }

    locals[x].idx = i;
    idxLut[o] = i;
  }

  // update wasm
  for (let i = 0; i < wasm.length; i++) {
    const op = wasm[i];
    const opcode = op[0];
    const idx = op[1];

    if (opcode >= 0x20 && opcode <= 0x22) { // local.* op
      if (targets.includes(idx)) {
        if (opcode === Opcodes.local_get || opcode === Opcodes.local_tee) {
          // get/tee -> const
          const c = consts[targets.indexOf(idx)];
          wasm.splice(i, 1, c);
          continue;
        }

        // set -> drop
        wasm.splice(i, 1, [ Opcodes.drop ]);
        continue;
      }

      // adjust index to compensate for removed
      wasm[i] = [ opcode, idxLut[idx] ];
    }
  }
};

export const f64ToI32s = (func, targets) => {
  const { wasm, locals } = func;

  // update locals object
  for (const x in locals) {
    let i = locals[x].idx;
    if (targets.includes(i)) {
      locals[x].type = Valtype.i32;
    }
  }

  // update wasm
  for (let i = 0; i < wasm.length; i++) {
    const op = wasm[i];
    const opcode = op[0];
    const idx = op[1];

    if (opcode >= 0x20 && opcode <= 0x22 && targets.includes(idx)) { // local.* op
      if (opcode === Opcodes.local_get) {
        // add i32 -> f64 after
        wasm.splice(i + 1, 0, Opcodes.i32_from);
        continue;
      }

      if (opcode === Opcodes.local_set) {
        // add f64 -> i32 before
        wasm.splice(i, 0, Opcodes.i32_to);
        i++;
        continue;
      }

      if (opcode === Opcodes.local_tee) {
        // add f64 -> i32 before
        wasm.splice(i, 0, Opcodes.i32_to);
        i++;

        // add i32 -> f64 after
        wasm.splice(i + 1, 0, Opcodes.i32_from);
        continue;
      }
    }
  }
};