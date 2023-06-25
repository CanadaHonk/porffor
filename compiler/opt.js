import { Opcodes, Valtype } from "./wasmSpec.js";
import { encodeVector, encodeLocal } from "./encoding.js";

const optLog = process.argv.includes('-opt-log');

export default (funcs, globals) => {
  if (process.argv.includes('-O0')) return;

  if (!process.argv.includes('-O1')) {
    // inline pass (very WIP)
    // get candidates for inlining
    // todo: pick smart in future (if func is used <N times? or?)
    const candidates = funcs.filter(x => x.name !== 'main' && Object.keys(x.locals).length === x.params.length).reverse();
    if (optLog && candidates.length > 0) console.log(`opt: found inline candidates: ${candidates.map(x => x.name).join(', ')} (${candidates.length}/${funcs.length - 1})`);

    for (const c of candidates) {
      let cWasm = c.innerWasm;

      for (const t of funcs) {
        const tWasm = t.innerWasm;
        for (let i = 0; i < tWasm.length; i++) {
          if (tWasm[i] === Opcodes.call && tWasm[i + 1] === c.index) {
            if (optLog && candidates.length > 0) console.log(`opt: inlining call for ${c.name} (in ${t.name})`)
            tWasm.splice(i, 2); // remove call

            // TODO: add locals of candidate in target

            // add params as locals and set in reverse order
            const paramIdx = {};
            for (let j = c.params.length - 1; j >= 0; j--) {
              const name = `__porf_inline_${c.name}_param_${j}`;
              const idx = Object.keys(t.locals).length;
              t.locals[name] = idx;
              paramIdx[j] = idx;

              tWasm.splice(i, 0, Opcodes.local_set, idx);
              i += 2;
            }

            let iWasm = cWasm.slice(0, -1); // remove return
            for (let j = 0; j < iWasm.length; j++) {
              if (iWasm[j] === Opcodes.local_get || iWasm[j] === Opcodes.local_set) {
                iWasm[j + 1] = paramIdx[iWasm[j + 1]];
              }
            }

            tWasm.splice(i, 0, ...iWasm);
            i += iWasm.length;
          }
        }

        // remake func wasm from new inner wasm and locals
        const localCount = Object.keys(t.locals).length - t.params.length;
        const localDecl = localCount > 0 ? [encodeLocal(localCount, Valtype.i32)] : [];
        t.innerWasm = tWasm;
        t.wasm = encodeVector([ ...encodeVector(localDecl), ...tWasm, Opcodes.end ]);

        if (t.index > c.index) t.index--; // adjust index if after removed func
      }

      funcs.splice(funcs.indexOf(c), 1); // remove func from funcs
    }
  }

  // wasm transform pass
  for (const f of funcs) {
    const wasm = f.wasm;

    // main pass
    for (let i = 0; i < wasm.length; i++) {
      if (i > 2) {
        if (wasm[i] === wasm[i - 2]) {
          if (wasm[i - 1] === Opcodes.local_get && wasm[i - 3] === Opcodes.local_set) {
            // local.set 0
            // local.get 0
            // -->
            // local.tee 0

            wasm[i - 3] = Opcodes.local_tee;
            wasm.splice(i - 1, 2);
            wasm[0] -= 2;
            // if (optLog) console.log(`opt: consolidated set, get -> tee`);
          }
        }

        if (wasm[i] === Opcodes.end && wasm[i - 1] === Opcodes.return) {
          // return
          // end
          // -->
          // end

          wasm.splice(i - 1, 1);
          wasm[0]--;
          // if (optLog) console.log(`opt: removed redundant return at end`);
        }
      }

      if (i > 4) {
        if (wasm[i] === wasm[i - 4]) {
          if (wasm[i - 1] === Opcodes.local_get && wasm[i - 3] === Opcodes.local_tee && wasm[i - 5] === Opcodes.local_set) {
            // local.set x
            // local.tee y
            // local.get x
            // -->
            // <nothing>
            wasm.splice(i - 5, 6);
            wasm[0] -= 6;
            if (optLog) console.log(`opt: removed redundant inline param local handling`);
          }
        }
      }
    }

    if (process.argv.includes('-O1')) return;

    // remove ununeeded var: check pass
    const unneededVar = {};
    const getCount = {};
    for (let i = 0; i < wasm.length; i++) {
      if (i > 2) {
        if (wasm[i] === Opcodes.local_get && wasm[i - 2] === Opcodes.local_set && wasm[i - 1] === wasm[i + 1]) unneededVar[wasm[i + 1]] = (unneededVar[wasm[i + 1]] ?? 0) + 1;
        if (wasm[i] === Opcodes.local_get) getCount[wasm[i + 1]] = (getCount[wasm[i + 1]] ?? 0) + 1;
      }
    }

    // remove unneded var: remove pass
    const unneeded = Object.keys(unneededVar).filter(x => unneededVar[x] === 1 && getCount[x] === 1).map(x => parseInt(x));
    if (optLog && unneeded.length > 0) console.log(`opt: found unneeded vars:\n${unneeded.map(x => `  idx: ${x} (name: ${Object.keys(f.locals)[x]})`).join('\n')}`);

    for (let i = 0; i < wasm.length; i++) {
      if (wasm[i] === Opcodes.local_get && wasm[i - 2] === Opcodes.local_set && unneeded.includes(wasm[i + 1])) {
        if (optLog) console.log(`opt: removed unneeded var ${wasm[i + 1]}`);
        wasm.splice(i - 2, 4);
        wasm[0] -= 4;
      }
    }
  }

  // return funcs;
};