import { Opcodes, Valtype } from './wasmSpec.js';
import { number } from './encoding.js';
import { log } from './log.js';
import './prefs.js';

export default (funcs, globals, pages, tags, exceptions) => {
  const optLevel = parseInt(process.argv.find(x => x.startsWith('-O'))?.[2] ?? 1);
  if (optLevel === 0) return;

  const tailCall = Prefs.tailCall;
  if (tailCall) log.warning('opt', 'tail call proposal is not widely implemented! (you used --tail-call)');

  let fi = 0;
  for (const f of funcs) {
    const wasm = f.wasm;

    globalThis.progress?.(`${fi++}/${funcs.length}`);

    const lastType = f.locals['#last_type']?.idx;

    let runs = (+Prefs.optWasmRuns) || 2; // todo: how many by default?
    while (runs > 0) {
      runs--;

      for (let i = 0; i < wasm.length; i++) {
        const inst = wasm[i];
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

            wasm.splice(j - 1, 1); // remove end of this block

            if (Prefs.optLog) log('opt', `removed unneeded block in for loop`);
            continue;
          }
        }

        // remove setting last type if it is never gotten
        if (!f.internal && !f.gotLastType && inst[0] === Opcodes.local_set && inst[1] === lastType) {
          // replace this inst with drop
          wasm[i] = [ Opcodes.drop ];
        }

        if (i < 1) continue;
        const lastInst = wasm[i - 1];

        if (lastInst[1] === inst[1] && lastInst[0] === Opcodes.local_set && inst[0] === Opcodes.local_get) {
          // replace set, get -> tee (sets and returns)
          // local.set 0
          // local.get 0
          // -->
          // local.tee 0

          wasm.splice(i, 1); // remove this inst (get)
          wasm[i - 1] = [ Opcodes.local_tee, ...lastInst.slice(1) ]; // replace last inst opcode (set -> tee)

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

          wasm[i - 1] = [ Opcodes.local_set, lastInst[1] ]; // change last op
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

          wasm[i] = [ Opcodes.eqz[0][0] ]; // eq -> eqz
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

        if (inst[0] === Opcodes.i32_trunc_sat_f64_s[0] && inst[1] <= Opcodes.i32_trunc_sat_f64_u[1] && (lastInst[0] === Opcodes.f64_convert_i32_u || lastInst[0] === Opcodes.f64_convert_i32_s)) {
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

        if (lastInst[0] === Opcodes.i32_trunc_sat_f64_s[0] && lastInst[1] <= Opcodes.i32_trunc_sat_f64_u[1] && (inst[0] === Opcodes.f64_convert_i32_u || inst[0] === Opcodes.f64_convert_i32_s)) {
          // remove unneeded f64 -> i32 -> f64
          // i32.trunc_sat_f64_s || i32.trunc_sat_f64_u
          // f64.convert_i32_s || f64.convert_i32_u
          // -->
          // <nothing>

          wasm.splice(i - 1, 2); // remove this inst and last
          i -= 2;
          // if (Prefs.optLog) log('opt', `removed redundant f64 -> i32 -> f64 conversion ops`);
          continue;
        }

        if (lastInst[0] === Opcodes.const && inst[0] === Opcodes.i32_to[0] && (inst[1] === Opcodes.i32_to[1] || inst[1] === Opcodes.i32_to_u[1])) {
          // change const and immediate i32 convert to i32 const
          // f64.const 0
          // i32.trunc_sat_f64_s || i32.trunc_sat_f64_u
          // -->
          // i32.const 0

          wasm[i - 1] = number(lastInst[1], Valtype.i32); // f64.const -> i32.const

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

          wasm[i - 1] = number(lastInst[1], Valtype.f64); // i32.const -> f64.const

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

          wasm[i - 1] = [ Opcodes.return_call, ...lastInst.slice(1) ]; // change last inst return -> return_call

          wasm.splice(i, 1); // remove this inst (return)
          i--;
          if (Prefs.optLog) log('opt', `tail called return, call`);
          continue;
        }

        // if (i === wasm.length - 1 && inst[0] === Opcodes.return) {
        //   // replace final return, end -> end (wasm has implicit return)
        //   // return
        //   // end
        //   // -->
        //   // end

        //   wasm.splice(i, 1); // remove this inst (return)
        //   i--;
        //   // if (Prefs.optLog) log('opt', `removed redundant return at end`);
        //   continue;
        // }

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
};