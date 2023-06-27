import { Opcodes, Valtype } from "./wasmSpec.js";
import { number } from "./embedding.js";

// deno compat
const textEncoder = new TextEncoder();
if (typeof process === 'undefined') globalThis.process = { argv: ['', '', ...Deno.args], stdout: { write: str => Deno.writeAllSync(Deno.stdout, textEncoder.encode(str)) } };

const optLog = process.argv.includes('-opt-log');

const performWasmOp = (op, a, b) => {
  switch (op) {
    case Opcodes.add: return a + b;
    case Opcodes.sub: return a - b;
    case Opcodes.mul: return a * b;
  }
};

export default (funcs, globals) => {
  const optLevel = process.argv.includes('-O0') ? 0 : (process.argv.includes('-O1') ? 1 : (process.argv.includes('-O2') ? 2 : 3));
  if (optLevel === 0) return;

  if (optLevel >= 2) {
    // inline pass (very WIP)
    // get candidates for inlining
    // todo: pick smart in future (if func is used <N times? or?)
    const suitableReturns = wasm => wasm.reduce((acc, x) => acc + (x[0] === Opcodes.return), 0) === 1;
    const candidates = funcs.filter(x => x.name !== 'main' && Object.keys(x.locals).length === x.params.length && (!x.return || suitableReturns(x.wasm))).reverse();
    if (optLog) {
      console.log(`opt: found inline candidates: ${candidates.map(x => x.name).join(', ')} (${candidates.length}/${funcs.length - 1})`);

      let reasons = {};
      for (const f of funcs) {
        reasons[f.name] = [];

        if (f.name === 'main') reasons[f.name].push('main');
        if (Object.keys(f.locals).length !== f.params.length) reasons[f.name].push('cannot inline funcs with locals yet');
        if (f.return && !suitableReturns(f.wasm)) reasons[f.name].push('cannot inline funcs with multiple returns yet');
      }

      console.log(`     reasons not:\n${Object.keys(reasons).filter(x => reasons[x].length > 0).map(x => `       ${x}: ${reasons[x].join(', ')}`).join('\n')}\n`)
    }

    for (const c of candidates) {
      let cWasm = c.wasm;

      for (const t of funcs) {
        const tWasm = t.wasm;
        if (t.name === c.name) continue; // skip self

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
                if (optLog) console.log(`opt: replacing local operand in inlined wasm (${inst[1]} -> ${paramIdx[inst[1]]})`);
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

    let getCount = {};
    for (const x in f.locals) getCount[f.locals[x]] = 0;

    // main pass
    for (let i = 0; i < wasm.length; i++) {
      let inst = wasm[i];
      if (inst[0] === Opcodes.if || inst[0] === Opcodes.loop || inst[0] === Opcodes.block) depth++;
      if (inst[0] === Opcodes.end) depth--;

      if (inst[0] === Opcodes.local_get || inst[0] === Opcodes.local_tee) getCount[inst[1]]++;

      if (i < 1) continue;
      let lastInst = wasm[i - 1];

      if (lastInst[1] === inst[1] && lastInst[0] === Opcodes.local_set && inst[0] === Opcodes.local_get) {
        // replace set, get -> tee (sets and returns)
        // local.set 0
        // local.get 0
        // -->
        // local.tee 0

        lastInst[0] = Opcodes.local_tee; // replace last inst opcode (set -> tee)
        wasm.splice(i, 1); // remove this inst (get)
        i--;
        inst = wasm[i];
        // if (optLog) console.log(`opt: consolidated set, get -> tee`);
      }

      if (inst[0] === Opcodes.eq && lastInst[0] === Opcodes.const && lastInst[1] === 0) {
        // replace const 0, eq -> eqz
        // i32.const 0
        // i32.eq
        // -->
        // i32.eqz

        inst[0] = Opcodes.eqz; // eq -> eqz
        wasm.splice(i - 1, 1); // remove const 0
        i--;
        lastInst = wasm[i - 1];
      }

      if (i === wasm.length - 1 && inst[0] === Opcodes.return) {
        // replace final return, end -> end (wasm has implicit return)
        // return
        // end
        // -->
        // end

        wasm.splice(i, 1); // remove this inst (return)
        i--;
        inst = wasm[i];
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
        i -= 3;
        if (optLog) console.log(`opt: removed redundant inline param local handling`);
      }
    }

    if (optLevel < 2) return;

    // remove unneeded var: remove pass
    // locals only got once. we don't need to worry about sets/else as these are only candidates and we will check for matching set + get insts in wasm
    const unneededCandidates = Object.keys(getCount).filter(x => getCount[x] === 1).map(x => parseInt(x));
    if (optLog && unneededCandidates.length > 0) console.log(`opt: found unneeded locals candidates: ${unneededCandidates.join(', ')} (${unneededCandidates.length}/${Object.keys(getCount).length})`);

    if (unneededCandidates.length > 0) for (let i = 0; i < wasm.length; i++) {
      if (i < 1) continue;

      const inst = wasm[i];
      const lastInst = wasm[i - 1];

      if (lastInst[1] === inst[1] && lastInst[0] === Opcodes.local_set && inst[0] === Opcodes.local_get && unneededCandidates.includes(inst[1])) {
        wasm.splice(i - 1, 2); // remove insts
        i -= 2;
        delete f.locals[Object.keys(f.locals)[inst[1]]]; // remove from locals
        if (optLog) console.log(`opt: removed redundant local (getset ${inst[1]})`);
      }

      if (inst[0] === Opcodes.local_tee && unneededCandidates.includes(inst[1])) {
        wasm.splice(i, 1); // remove inst
        i--;
        delete f.locals[Object.keys(f.locals)[inst[1]]]; // remove from locals
        if (optLog) console.log(`opt: removed redundant local (tee ${inst[1]})`);
      }
    }

    getCount = {};
    for (const x in f.locals) getCount[f.locals[x]] = 0;

    // final pass
    for (let i = 0; i < wasm.length; i++) {
      const inst = wasm[i];
      if (inst[0] === Opcodes.local_get || inst[0] === Opcodes.local_tee) getCount[inst[1]]++;

      if (i < 2) continue;
      const lastInst = wasm[i - 1];
      const lastLastInst = wasm[i - 2];

      // todo: add more math ops
      if (optLevel >= 3 && (inst[0] === Opcodes.add || inst[0] === Opcodes.sub || inst[0] === Opcodes.mul) && lastLastInst[0] === Opcodes.const && lastInst[0] === Opcodes.const) {
        // inline const math ops
        // i32.const a
        // i32.const b
        // i32.add
        // -->
        // i32.const a + b

        // does not work with leb encoded
        if (lastInst.length > 2 || lastLastInst.length > 2) continue;

        wasm.splice(i - 2, 2); // remove consts
        i -= 2;

        let a = lastLastInst[1];
        let b = lastInst[1];
        console.log('a', a, b);

        inst[1] = performWasmOp(inst[0], a, b);
        inst[0] = Opcodes.const;
      }
    }

    // remove unused locals (cleanup)
    for (const x in getCount) {
      if (getCount[x] === 0) {
        const name = Object.keys(f.locals)[Object.values(f.locals).indexOf(parseInt(x))];
        if (optLog) console.log(`opt: removed internal local ${x} (${name})`);
        delete f.locals[name];
      }
    }
  }

  // return funcs;
};