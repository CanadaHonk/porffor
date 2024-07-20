import { Opcodes, Valtype } from './wasmSpec.js';
import { number } from './embedding.js';
import { read_signedLEB128, read_ieee754_binary64 } from './encoding.js';
import { log } from './log.js';
import {} from './prefs.js';

const forceRemoveTypes = new Set(Prefs.forceRemoveTypes?.split?.(','));
const hasType = (funcs, pages, type) => {
  if (forceRemoveTypes.has(type)) return false;

  switch (type) {
    case 'Array':
      return pages.hasArray;
    case 'String':
      return pages.hasString;
    case 'ByteString':
      return pages.hasByteString;

    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
    case 'WeakRef':
    case 'Date':
    case 'Uint8Array':
    case 'Int8Array':
    case 'Uint8ClampedArray':
    case 'Uint16Array':
    case 'Int16Array':
    case 'Uint32Array':
    case 'Int32Array':
    case 'Float32Array':
    case 'Float64Array':
      return funcs.some(x => x.name === type);

    default:
      return true;
  }
}

export default (funcs, globals, pages, tags, exceptions) => {
  const optLevel = parseInt(process.argv.find(x => x.startsWith('-O'))?.[2] ?? 1);
  if (optLevel === 0) return;

  const tailCall = Prefs.tailCall;
  if (tailCall) log.warning('opt', 'tail call proposal is not widely implemented! (you used -tail-call)');

  if (optLevel >= 2 && !Prefs.optNoInline) {
    // inline pass (very WIP)
    // get candidates for inlining
    // todo: pick smart in future (if func is used <N times? or?)
    const callsSelf = f => f.wasm.some(x => x[0] === Opcodes.call && x[1] === f.index);
    const suitableReturns = wasm => wasm.reduce((acc, x) => acc + (x[0] === Opcodes.return), 0) <= 1;
    const candidates = funcs.filter(x => x.name !== 'main' && Object.keys(x.locals).length === x.params.length && (x.returns.length === 0 || suitableReturns(x.wasm)) && !callsSelf(x) && !x.throws).reverse();
    if (Prefs.optLog) {
      log('opt', `found inline candidates: ${candidates.map(x => x.name).join(', ')} (${candidates.length}/${funcs.length - 1})`);

      let reasons = {};
      for (const f of funcs) {
        if (f.name === 'main') continue;
        reasons[f.name] = [];

        if (f.name === 'main') reasons[f.name].push('main');
        if (Object.keys(f.locals).length !== f.params.length) reasons[f.name].push('cannot inline funcs with locals yet');
        if (f.returns.length !== 0 && !suitableReturns(f.wasm)) reasons[f.name].push('cannot inline funcs with multiple returns yet');
        if (callsSelf(f)) reasons[f.name].push('cannot inline func calling itself');
        if (f.throws) reasons[f.name].push('will not inline funcs throwing yet');
      }

      if (Object.values(reasons).some(x => x.length > 0)) console.log(`     reasons not:\n${Object.keys(reasons).filter(x => reasons[x].length > 0).map(x => `       ${x}: ${reasons[x].join(', ')}`).join('\n')}\n`)
    }

    for (const c of candidates) {
      const cWasm = c.wasm;

      for (const t of funcs) {
        const tWasm = t.wasm;
        if (t.name === c.name) continue; // skip self

        for (let i = 0; i < tWasm.length; i++) {
          const inst = tWasm[i];
          if (inst[0] === Opcodes.call && inst[1] === c.index) {
            if (Prefs.optLog) log('opt', `inlining call for ${c.name} (in ${t.name})`);
            tWasm.splice(i, 1); // remove this call

            // add params as locals and set in reverse order
            const paramIdx = {};
            let localIdx = Math.max(-1, ...Object.values(t.locals).map(x => x.idx)) + 1;
            for (let j = c.params.length - 1; j >= 0; j--) {
              const name = `__porf_inline_${c.name}_param_${j}`;

              if (t.locals[name] === undefined) {
                t.locals[name] = { idx: localIdx++, type: c.params[j] };
              }

              const idx = t.locals[name].idx;
              paramIdx[j] = idx;

              tWasm.splice(i, 0, [ Opcodes.local_set, idx ]);
              i++;
            }

            let iWasm = cWasm.slice().map(x => x.slice()); // deep clone arr (depth 2)
            // remove final return
            if (iWasm.length !== 0 && iWasm[iWasm.length - 1][0] === Opcodes.return) iWasm = iWasm.slice(0, -1);

            // adjust local operands to go to correct param index
            for (const inst of iWasm) {
              if ((inst[0] === Opcodes.local_get || inst[0] === Opcodes.local_set) && inst[1] < c.params.length) {
                if (Prefs.optLog) log('opt', `replacing local operand in inlined wasm (${inst[1]} -> ${paramIdx[inst[1]]})`);
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

  if (Prefs.optInlineOnly) return;

  // todo: this breaks exceptions after due to indexes not being adjusted
  // const tagUse = tags.reduce((acc, x) => { acc[x.idx] = 0; return acc; }, {});
  // const exceptionUse = exceptions.reduce((acc, _, i) => { acc[i] = 0; return acc; }, {});

  // wasm transform pass
  for (const f of funcs) {
    const wasm = f.wasm;

    const lastType = f.locals['#last_type']?.idx;

    let runs = (+Prefs.optWasmRuns) || 2; // todo: how many by default?
    while (runs > 0) {
      runs--;

      // main pass
      for (let i = 0; i < wasm.length; i++) {
        let inst = wasm[i];
        inst = [ ...inst ];
        wasm[i] = inst;

        // if (inst[0] === Opcodes.throw) {
        //   tagUse[inst[1]]++;

        //   const exceptId = read_signedLEB128(wasm[i - 1].slice(1));
        //   exceptionUse[exceptId]++;
        // }

        if (inst[0] === Opcodes.block) {
          // remove unneeded blocks (no brs inside)
          // block
          //   ...
          // end
          // -->
          // ...

          let hasBranch = false, j = i, depth = 0;
          for (; j < wasm.length; j++) {
            const op = wasm[j][0];
            if (op === Opcodes.if || op === Opcodes.block || op === Opcodes.loop || op === Opcodes.try) depth++;
            if (op === Opcodes.end) {
              depth--;
              if (depth <= 0) break;
            }
            if (op === Opcodes.br || op === Opcodes.br_if || op === Opcodes.br_table) {
              hasBranch = true;
              break;
            }
          }

          if (!hasBranch) {
            wasm.splice(i, 1); // remove this inst (block)
            if (i > 0) i--;
            inst = wasm[i];

            wasm.splice(j - 1, 1); // remove end of this block

            if (Prefs.optLog) log('opt', `removed unneeded block in for loop`);
          }
        }

        if (inst[inst.length - 1] === 'string_only' && !pages.hasAnyString && Prefs.rmUnusedTypes) {
          // remove this inst
          wasm.splice(i, 1);
          if (i > 0) i--;
          inst = wasm[i];
        }

        if (inst[inst.length - 1] === 'string_only|start' && !pages.hasAnyString && Prefs.rmUnusedTypes) {
          let j = i;
          for (; j < wasm.length; j++) {
            const op = wasm[j];
            if (op[op.length - 1] === 'string_only|end') break;
          }

          // remove section
          wasm.splice(i, 1 + j - i);

          if (i > 0) i--;
          inst = wasm[i];
        }

        if (inst[0] === Opcodes.if && typeof inst[2] === 'string' && Prefs.rmUnusedTypes) {
          // remove unneeded typeswitch checks

          const types = inst[2].split('|')[1].split(',');
          let missing = true;
          for (const type of types) {
            if (hasType(funcs, pages, type)) {
              missing = false;
              break;
            }
          }

          if (missing) {
            let j = i, depth = 0;
            for (; j < wasm.length; j++) {
              const op = wasm[j][0];
              if (op === Opcodes.if || op === Opcodes.block || op === Opcodes.loop || op === Opcodes.try) depth++;
              if (op === Opcodes.end) {
                depth--;
                if (depth <= 0) break;
              }
            }

            const offset = 3 + 4 * (types.length - 1);
            wasm.splice(i - offset, j - (i - offset) + 1); // remove cond and this if
            i -= 1 + offset;
            inst = wasm[i];

            if (Prefs.optLog) log('opt', `removed unneeded typeswitch check (${types})`);
          }
        }

        if (inst[0] === Opcodes.end && inst[1] === 'TYPESWITCH_end' && Prefs.rmUnusedTypes) {
          // remove unneeded entire typeswitch

          let j = i - 1, depth = -1, checks = 0;
          for (; j > 0; j--) {
            const op = wasm[j][0];
            if (op === Opcodes.if || op === Opcodes.block || op === Opcodes.loop || op === Opcodes.try) {
              depth++;
              if (depth === 0) break;
            }
            if (op === Opcodes.end) depth--;
            if (wasm[j][2]?.startsWith?.('TYPESWITCH')) checks++;
          }

          if (checks === 0) {
            // todo: review indexes below
            wasm.splice(j - 1, 2, [ Opcodes.drop ]); // remove typeswitch start
            wasm.splice(i - 1, 1); // remove this inst

            if (Prefs.optLog) log('opt', 'removed unneeded entire typeswitch');

            if (i > 0) i--;
            continue;
          }
        }

        // remove setting last type if it is never gotten
        if (!f.internal && !f.gotLastType && inst[0] === Opcodes.local_set && inst[1] === lastType) {
          // replace this inst with drop
          wasm.splice(i, 1, [ Opcodes.drop ]); // remove this and last inst
          if (i > 0) i--;
        }

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
          // if (Prefs.optLog) log('opt', `consolidated set, get -> tee`);
          continue;
        }

        if ((lastInst[0] === Opcodes.local_get || lastInst[0] === Opcodes.global_get) && inst[0] === Opcodes.drop) {
          // replace get, drop -> nothing
          // local.get 0
          // drop
          // -->
          //

          wasm.splice(i - 1, 2); // remove this inst and last
          i -= 2;
          continue;
        }

        if (lastInst[0] === Opcodes.local_tee && inst[0] === Opcodes.drop) {
          // replace tee, drop -> set
          // local.tee 0
          // drop
          // -->
          // local.set 0

          lastInst[0] = Opcodes.local_set; // change last op

          wasm.splice(i, 1); // remove this inst
          i--;
          continue;
        }

        if ((lastInst[0] === Opcodes.i32_const || lastInst[0] === Opcodes.i64_const || lastInst[0] === Opcodes.f64_const) && inst[0] === Opcodes.drop) {
          // replace const, drop -> <nothing>
          // i32.const 0
          // drop
          // -->
          // <nothing>

          wasm.splice(i - 1, 2); // remove these inst
          i -= 2;
          continue;
        }

        if (inst[0] === Opcodes.eq && lastInst[0] === Opcodes.const && lastInst[1] === 0 && valtype !== 'f64') {
          // replace const 0, eq -> eqz
          // i32.const 0
          // i32.eq
          // -->
          // i32.eqz

          inst[0] = Opcodes.eqz[0][0]; // eq -> eqz
          wasm.splice(i - 1, 1); // remove const 0
          i--;
          continue;
        }

        if (inst[0] === Opcodes.i32_wrap_i64 && (lastInst[0] === Opcodes.i64_extend_i32_s || lastInst[0] === Opcodes.i64_extend_i32_u)) {
          // remove unneeded i32 -> i64 -> i32
          // i64.extend_i32_s
          // i32.wrap_i64
          // -->
          // <nothing>

          wasm.splice(i - 1, 2); // remove this inst and last
          i -= 2;
          // if (Prefs.optLog) log('opt', `removed redundant i32 -> i64 -> i32 conversion ops`);
          continue;
        }

        if (inst[0] === Opcodes.i32_trunc_sat_f64_s[0] && (lastInst[0] === Opcodes.f64_convert_i32_u || lastInst[0] === Opcodes.f64_convert_i32_s)) {
          // remove unneeded i32 -> f64 -> i32
          // f64.convert_i32_s || f64.convert_i32_u
          // i32.trunc_sat_f64_s || i32.trunc_sat_f64_u
          // -->
          // <nothing>

          wasm.splice(i - 1, 2); // remove this inst and last
          i -= 2;
          // if (Prefs.optLog) log('opt', `removed redundant i32 -> f64 -> i32 conversion ops`);
          continue;
        }

        if (lastInst[0] === Opcodes.const && inst[0] === Opcodes.i32_to[0] && (inst[1] === Opcodes.i32_to[1] || inst[1] === Opcodes.i32_to_u[1])) {
          // change const and immediate i32 convert to i32 const
          // f64.const 0
          // i32.trunc_sat_f64_s || i32.trunc_sat_f64_u
          // -->
          // i32.const 0

          wasm[i - 1] = number(valtype === 'f64' ? lastInst[1] : read_signedLEB128(lastInst.slice(1)), Valtype.i32)[0]; // f64.const -> i32.const

          wasm.splice(i, 1); // remove this inst
          i--;
          if (Prefs.optLog) log('opt', `converted const -> i32 convert into i32 const`);
          continue;
        }

        if (lastInst[0] === Opcodes.i32_const && (inst[0] === Opcodes.i32_from[0] || inst[0] === Opcodes.i32_from_u[0]) && (typeof lastInst[1] !== 'string')) {
          // change i32 const and immediate convert to const (opposite way of previous)
          // i32.const 0
          // f64.convert_i32_s || f64.convert_i32_u
          // -->
          // f64.const 0

          wasm[i - 1] = number(read_signedLEB128(lastInst.slice(1)))[0]; // i32.const -> f64.const

          wasm.splice(i, 1); // remove this inst
          i--;
          if (Prefs.optLog) log('opt', `converted i32 const -> convert into const`);
          continue;
        }

        if (tailCall && lastInst[0] === Opcodes.call && inst[0] === Opcodes.return) {
          // replace call, return with tail calls (return_call)
          // call X
          // return
          // -->
          // return_call X

          lastInst[0] = Opcodes.return_call; // change last inst return -> return_call

          wasm.splice(i, 1); // remove this inst (return)
          i--;
          if (Prefs.optLog) log('opt', `tail called return, call`);
          continue;
        }

        if (false && i === wasm.length - 1 && inst[0] === Opcodes.return) {
          // replace final return, end -> end (wasm has implicit return)
          // return
          // end
          // -->
          // end

          wasm.splice(i, 1); // remove this inst (return)
          i--;
          // if (Prefs.optLog) log('opt', `removed redundant return at end`);
          continue;
        }

        // remove unneeded before get with update exprs (n++, etc) when value is unused
        if (i < wasm.length - 4 && lastInst[1] === inst[1] && lastInst[0] === Opcodes.local_get && inst[0] === Opcodes.local_get && wasm[i + 1][0] === Opcodes.const && [Opcodes.add, Opcodes.sub].includes(wasm[i + 2][0]) && wasm[i + 3][0] === Opcodes.local_set && wasm[i + 3][1] === inst[1] && (wasm[i + 4][0] === Opcodes.drop || wasm[i + 4][0] === Opcodes.br)) {
          // local.get 1
          // local.get 1
          // -->
          // local.get 1

          // remove drop at the end as well
          if (wasm[i + 4][0] === Opcodes.drop) wasm.splice(i + 4, 1);

          wasm.splice(i, 1); // remove this inst (second get)
          i--;
          continue;
        }
      }
    }
  }

  // for (const x in tagUse) {
  //   if (tagUse[x] === 0) {
  //     const el = tags.find(y => y.idx === x);
  //     tags.splice(tags.indexOf(el), 1);
  //   }
  // }

  // for (const x of Object.keys(exceptionUse).sort((a, b) => b - a)) {
  //   if (exceptionUse[x] === 0) {
  //     exceptions.splice(+x, 1);
  //   }
  // }

  // return funcs;
};