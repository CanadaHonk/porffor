import { Blocktype, Opcodes, Valtype } from "./wasmSpec.js";
import { encodeVector, encodeLocal } from "./encoding.js";

// deno compat
const textEncoder = new TextEncoder();
if (typeof process === 'undefined') globalThis.process = { argv: ['', '', ...Deno.args], stdout: { write: str => Deno.writeAllSync(Deno.stdout, textEncoder.encode(str)) } };

const optLog = process.argv.includes('-opt-log');

export default (funcs, globals) => {
  if (process.argv.includes('-O0')) return;

  if (!process.argv.includes('-O1')) {
    // inline pass (very WIP)
    // get candidates for inlining
    // todo: pick smart in future (if func is used <N times? or?)
    const suitableReturns = wasm => wasm.reduce((acc, x) => acc + (x[0] === Opcodes.return), 0) === 1;
    const candidates = funcs.filter(x => x.name !== 'main' && Object.keys(x.locals).length === x.params.length && (!x.return || suitableReturns(x.wasm))).reverse();
    if (optLog && candidates.length > 0) console.log(`opt: found inline candidates: ${candidates.map(x => x.name).join(', ')} (${candidates.length}/${funcs.length - 1})`);

    for (const c of candidates) {
      const snapshot = { ...funcs }
      let cWasm = c.wasm;

      for (const t of funcs) {
        const tWasm = t.wasm;
        for (let i = 0; i < tWasm.length; i++) {
          const inst = tWasm[i];
          if (inst[0] === Opcodes.call && inst[1] === c.index) {
            if (optLog) console.log(`opt: inlining call for ${c.name} (in ${t.name})`);
            tWasm.splice(i, 1); // remove this call

            // add params as locals and set in reverse order
            const paramIdx = {};
            for (let j = c.params.length - 1; j >= 0; j--) {
              const name = `__porf_inline_${c.name}_param_${j}`;

              if (t.locals[name] === undefined) {
                t.locals[name] = Object.keys(t.locals).length;
              }

              const idx = t.locals[name];
              paramIdx[j] = idx;

              tWasm.splice(i, 0, [ Opcodes.local_set, idx ]);
              i++;
            }

            let iWasm = cWasm.slice();
            // remove final return
            if (iWasm[iWasm.length - 1][0] === Opcodes.return) iWasm = iWasm.slice(0, -1);

            // adjust local operands to go to correct param index
            for (const inst of iWasm) {
              if ((inst[0] === Opcodes.local_get || inst[0] === Opcodes.local_set) && inst[1] < c.params.length) {
                if (optLog) console.log(`opt: replacing local operand in inline wasm. ${inst[1]} -> ${paramIdx[inst[1]]}`);
                inst[1] = paramIdx[inst[1]];
              }
            }

            tWasm.splice(i, 0, ...iWasm);
            i += iWasm.length;
          }
        }

        if (t.index > c.index) t.index--; // adjust index if after removed func
      }

      funcs.splice(funcs.indexOf(c), 1); // remove func from funcs
    }
  }

  if (process.argv.includes('-opt-inline-only')) return;

  // wasm transform pass
  for (const f of funcs) {
    const wasm = f.wasm;

    let depth = 0;
    for (let i = 0; i < wasm.length; i++) {
      const inst = wasm[i];
      if (inst[0] === Opcodes.if || inst[0] === Opcodes.loop || inst[0] === Opcodes.block) depth++;
      if (inst[0] === Opcodes.end) depth--;

      if (i < 1) continue;
      const lastInst = wasm[i - 1];

      if (lastInst[1] === inst[1] && lastInst[0] === Opcodes.local_set && inst[0] === Opcodes.local_get) {
        // replace set, get -> tee (sets and returns)
        // local.set 0
        // local.get 0
        // -->
        // local.tee 0

        lastInst[0] = Opcodes.local_tee; // replace last inst opcode (set -> tee)
        wasm.splice(i, 1); // remove this inst (get)
        // if (optLog) console.log(`opt: consolidated set, get -> tee`);
      }

      if (i === wasm.length - 1 && inst[0] === Opcodes.return) {
        // replace final return, end -> end (wasm has implicit return)
        // return
        // end
        // -->
        // end

        wasm.splice(i, 1); // remove this inst (return)
        // if (optLog) console.log(`opt: removed redundant return at end`);
      }

      if (i < 2) continue;
      const lastLastInst = wasm[i - 2];

      if (lastLastInst[1] === inst[1] && inst[0] === Opcodes.local_get && lastInst[0] === Opcodes.local_tee && lastLastInst[0] === Opcodes.local_set) {
        // local.set x
        // local.tee y
        // local.get x
        // -->
        // <nothing>

        wasm.splice(i - 2, 3); // remove this, last, 2nd last insts
        if (optLog) console.log(`opt: removed redundant inline param local handling`);
      }
    }

    if (process.argv.includes('-O1')) return;

    // remove ununeeded var: check pass
    /* const unneededVar = {};
    const getCount = {};
    for (let i = 0; i < wasm.length; i++) {
      if (i > 2) {
        if (wasm[i] === Opcodes.local_get && wasm[i - 2] === Opcodes.local_set && wasm[i - 1] === wasm[i + 1]) unneededVar[wasm[i + 1]] = (unneededVar[wasm[i + 1]] ?? 0) + 1;
        if (wasm[i] === Opcodes.local_get) getCount[wasm[i + 1]] = (getCount[wasm[i + 1]] ?? 0) + 1;
      }
    }

    // remove unneeded var: remove pass
    const unneeded = Object.keys(unneededVar).filter(x => unneededVar[x] === 1 && getCount[x] === 1).map(x => parseInt(x));
    if (optLog && unneeded.length > 0) console.log(`opt: found unneeded vars:\n${unneeded.map(x => `  idx: ${x} (name: ${Object.keys(f.locals)[x]})`).join('\n')}`);

    for (let i = 0; i < wasm.length; i++) {
      if (wasm[i] === Opcodes.local_get && wasm[i - 2] === Opcodes.local_set && unneeded.includes(wasm[i + 1])) {
        if (optLog) console.log(`opt: removed unneeded var ${wasm[i + 1]}`);
        wasm.splice(i - 2, 4);
        wasm[0] -= 4;
      }
    } */
  }

  // return funcs;
};