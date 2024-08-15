import { Opcodes, Valtype, opcodeSignature } from './wasmSpec.js';
import { number } from './embedding.js';
import { floatToBits32, bitsToFloat32, floatToBits64, bitsToFloat64,
  truncateSaturated, truncateSaturatedUnsigned, truncateSaturatedLong, truncateSaturatedLongUnsigned } from './encoding.js';
import { log } from './log.js';
import {} from './prefs.js';

const constantEvaluators = new Map([
  [ Opcodes.i32_eqz, {
    params: [ Opcodes.i32_const ], result: Valtype.i32,
    fn: (x) => x != 0
  } ],
  [ Opcodes.i32_eq, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x == y
  } ],
  [ Opcodes.i32_ne, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x != y
  } ],
  [ Opcodes.i32_lt_s, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x < y
  } ],
  [ Opcodes.i32_lt_u, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => (x >>> 0) < (y >>> 0)
  } ],
  [ Opcodes.i32_le_s, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x <= y
  } ],
  [ Opcodes.i32_le_u, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => (x >>> 0) <= (y >>> 0)
  } ],
  [ Opcodes.i32_gt_s, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x > y
  } ],
  [ Opcodes.i32_gt_u, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => (x >>> 0) > (y >>> 0)
  } ],
  [ Opcodes.i32_ge_s, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x >= y
  } ],
  [ Opcodes.i32_ge_u, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => (x >>> 0) >= (y >>> 0)
  } ],
  [ Opcodes.i32_clz, {
    params: [ Opcodes.i32_const ], result: Valtype.i32,
    fn: (x) => Math.clz32(x)
  } ],
  [ Opcodes.i32_ctz, {
    params: [ Opcodes.i32_const ], result: Valtype.i32,
    fn: (x) => x == 0 ? 32 : 31 - Math.clz32(x & -x) // via leading digits of smallest set bit
  } ],
  [ Opcodes.i32_popcnt, {
    params: [ Opcodes.i32_const ], result: Valtype.i32,
    fn: (x) => {
      let count = 0;
      while (x != 0) {
        count += x & 1;
        x >>= 1;
      }
      return count;
    }
  } ],
  [ Opcodes.i32_add, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x + y
  } ],
  [ Opcodes.i32_sub, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x + y
  } ],
  [ Opcodes.i32_mul, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => Math.imul(x, y)
  } ],
  [ Opcodes.i32_div_s, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => y != 0 ? x / y : null
  } ],
  [ Opcodes.i32_div_u, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => y != 0 ? (x >>> 0) / (y >>> 0) : null
  } ],
  [ Opcodes.i32_rem_s, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => y != 0 ? x % y : null
  } ],
  [ Opcodes.i32_rem_u, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => y != 0 ? (x >>> 0) % (y >>> 0) : null
  } ],
  [ Opcodes.i32_and, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x & y
  } ],
  [ Opcodes.i32_or, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x | y
  } ],
  [ Opcodes.i32_xor, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x ^ y
  } ],
  [ Opcodes.i32_shl, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x << y
  } ],
  [ Opcodes.i32_shr_s, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x >> y
  } ],
  [ Opcodes.i32_shr_u, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => x >>> y
  } ],
  [ Opcodes.i32_rotl, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => (x << y) | (x >>> 32 - y)
  } ],
  [ Opcodes.i32_rotr, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => (x >>> y) | (x << 32 - y)
  } ],
  [ Opcodes.i64_eqz, {
    params: [ Opcodes.i64_const ], result: Valtype.i32,
    fn: (x) => x != 0n
  } ],
  [ Opcodes.i64_eq, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i32,
    fn: (x, y) => x == y
  } ],
  [ Opcodes.i64_ne, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i32,
    fn: (x, y) => x != y
  } ],
  [ Opcodes.i64_lt_s, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i32,
    fn: (x, y) => x < y
  } ],
  [ Opcodes.i64_lt_u, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i32,
    fn: (x, y) => BigInt.asUintN(64, x) < BigInt.asUintN(64, y)
  } ],
  [ Opcodes.i64_le_s, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i32,
    fn: (x, y) => x <= y
  } ],
  [ Opcodes.i64_le_u, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i32,
    fn: (x, y) => BigInt.asUintN(64, x) <= BigInt.asUintN(64, y)
  } ],
  [ Opcodes.i64_gt_s, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i32,
    fn: (x, y) => x > y
  } ],
  [ Opcodes.i64_gt_u, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i32,
    fn: (x, y) => BigInt.asUintN(64, x) > BigInt.asUintN(64, y)
  } ],
  [ Opcodes.i64_ge_s, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i32,
    fn: (x, y) => x >= y
  } ],
  [ Opcodes.i64_ge_u, {
    params: [ Opcodes.i32_const, Opcodes.i32_const ], result: Valtype.i32,
    fn: (x, y) => BigInt.asUintN(64, x) >= BigInt.asUintN(64, y)
  } ],
  [ Opcodes.i64_clz, {
    params: [ Opcodes.i64_const ], result: Valtype.i64,
    fn: (x) => {
      let count = 0;
      for (let i = 63n; i >= 0n && (i & (1n << i)) == 0n; i--) {
        count++;
      }
      return count;
    }
  } ],
  [ Opcodes.i64_ctz, {
    params: [ Opcodes.i64_const ], result: Valtype.i64,
    fn: (x) => {
      let count = 0;
      for (let i = 0n; i < 64n && (i & (1n << i)) == 0n; i++) {
        count++;
      }
      return count;
    }
  } ],
  [ Opcodes.i64_popcnt, {
    params: [ Opcodes.i64_const ], result: Valtype.i64,
    fn: (x) => {
      let count = 0;
      while (x != 0n) {
        count += (x & 1n) != 0n;
        x >>= 1n;
      }
      return count;
    }
  } ],
  [ Opcodes.i64_add, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => x + y
  } ],
  [ Opcodes.i64_sub, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => x + y
  } ],
  [ Opcodes.i64_mul, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => x * y
  } ],
  [ Opcodes.i64_div_s, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => y != 0n ? x / y : null
  } ],
  [ Opcodes.i64_div_u, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => y != 0n ? BigInt.asUintN(64, x) / BigInt.asUintN(64, y) : null
  } ],
  [ Opcodes.i64_rem_s, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => y != 0n ? x % y : null
  } ],
  [ Opcodes.i64_rem_u, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => y != 0n ? BigInt.asUintN(64, x) % BigInt.asUintN(64, y) : null
  } ],
  [ Opcodes.i64_and, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => x & y
  } ],
  [ Opcodes.i64_or, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => x | y
  } ],
  [ Opcodes.i64_xor, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => x ^ y
  } ],
  [ Opcodes.i64_shl, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => x << (y & 0x3fn)
  } ],
  [ Opcodes.i64_shr_s, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => x >> (y & 0x3fn)
  } ],
  [ Opcodes.i64_shr_u, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => BigInt.asUintN(64, x) >> (y & 0x3fn)
  } ],
  [ Opcodes.i64_rotl, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => (x << (y & 0x3fn)) | (BigInt.asUintN(64, x) >> ((64n - y) & 0x3fn))
  } ],
  [ Opcodes.i64_rotr, {
    params: [ Opcodes.i64_const, Opcodes.i64_const ], result: Valtype.i64,
    fn: (x, y) => (BigInt.asUintN(64, x) >> (y & 0x3fn)) | (x << ((64n - y) & 0x3fn))
  } ],
  [ Opcodes.f64_eq, {
    params: [ Opcodes.f64_const, Opcodes.f64_const ], result: Valtype.i32,
    fn: (x, y) => x == y
  } ],
  [ Opcodes.f64_ne, {
    params: [ Opcodes.f64_const, Opcodes.f64_const ], result: Valtype.i32,
    fn: (x, y) => x != y
  } ],
  [ Opcodes.f64_lt, {
    params: [ Opcodes.f64_const, Opcodes.f64_const ], result: Valtype.i32,
    fn: (x, y) => x < y
  } ],
  [ Opcodes.f64_le, {
    params: [ Opcodes.f64_const, Opcodes.f64_const ], result: Valtype.i32,
    fn: (x, y) => x <= y
  } ],
  [ Opcodes.f64_gt, {
    params: [ Opcodes.f64_const, Opcodes.f64_const ], result: Valtype.i32,
    fn: (x, y) => x > y
  } ],
  [ Opcodes.f64_ge, {
    params: [ Opcodes.f64_const, Opcodes.f64_const ], result: Valtype.i32,
    fn: (x, y) => x >= y
  } ],
  [ Opcodes.f64_abs, {
    params: [ Opcodes.f64_const ], result: Valtype.f64,
    fn: (x) => Math.abs(x)
  } ],
  [ Opcodes.f64_neg, {
    params: [ Opcodes.f64_const ], result: Valtype.f64,
    fn: (x) => -x
  } ],
  [ Opcodes.f64_ceil, {
    params: [ Opcodes.f64_const ], result: Valtype.f64,
    fn: (x) => Math.ceil(x)
  } ],
  [ Opcodes.f64_floor, {
    params: [ Opcodes.f64_const ], result: Valtype.f64,
    fn: (x) => Math.floor(x)
  } ],
  [ Opcodes.f64_trunc, {
    params: [ Opcodes.f64_const ], result: Valtype.f64,
    fn: (x) => Math.trunc(x)
  } ],
  [ Opcodes.f64_nearest, {
    params: [ Opcodes.f64_const ], result: Valtype.f64,
    fn: (x) => Math.abs(x) < 2**52 ? (x + 2**52) - 2**52 : x // rounding by losing precision
  } ],
  [ Opcodes.f64_sqrt, {
    params: [ Opcodes.f64_const ], result: Valtype.f64,
    fn: (x, y) => Math.abs(x) < 2**52 ? (x + 2**52) - 2**52 : x // rounding by losing precision
  } ],
  [ Opcodes.f64_add, {
    params: [ Opcodes.f64_const, Opcodes.f64_const ], result: Valtype.f64,
    fn: (x, y) => x + y
  } ],
  [ Opcodes.f64_sub, {
    params: [ Opcodes.f64_const, Opcodes.f64_const ], result: Valtype.f64,
    fn: (x, y) => x - y
  } ],
  [ Opcodes.f64_mul, {
    params: [ Opcodes.f64_const, Opcodes.f64_const ], result: Valtype.f64,
    fn: (x, y) => x * y
  } ],
  [ Opcodes.f64_div, {
    params: [ Opcodes.f64_const, Opcodes.f64_const ], result: Valtype.f64,
    fn: (x, y) => x / y
  } ],
  [ Opcodes.f64_min, {
    params: [ Opcodes.f64_const, Opcodes.f64_const ], result: Valtype.f64,
    fn: (x, y) => Math.min(x, y)
  } ],
  [ Opcodes.f64_max, {
    params: [ Opcodes.f64_const, Opcodes.f64_const ], result: Valtype.f64,
    fn: (x, y) => Math.max(x, y)
  } ],
  [ Opcodes.f64_copysign, {
    params: [ Opcodes.f64_const, Opcodes.f64_const ], result: Valtype.f64,
    fn: (x, y) => {
      const signbit = (x) => x < 0 || (x == 0 && (1/x) < 0);
      return signbit(x) ^ signbit(y) ? -x : x;
    }
  } ],
  [ Opcodes.i32_wrap_i64, {
    params: [ Opcodes.i64_const ], result: Valtype.i32,
    fn: (x) => Number(BigInt.asIntN(32, x))
  } ],
  [ Opcodes.i64_extend_i32_s, {
    params: [ Opcodes.i32_const ], result: Valtype.i64,
    fn: (x) => BigInt(x)
  } ],
  [ Opcodes.i64_extend_i32_u, {
    params: [ Opcodes.i32_const ], result: Valtype.i64,
    fn: (x) => BigInt(x >>> 0)
  } ],
  [ Opcodes.f32_demote_f64, {
    params: [ Opcodes.i32_const ], result: Valtype.f64,
    fn: (x) => Math.fround(x)
  } ],
  [ Opcodes.f64_convert_i32_s, {
    params: [ Opcodes.i32_const ], result: Valtype.f64,
    fn: (x) => x
  } ],
  [ Opcodes.f64_convert_i32_u, {
    params: [ Opcodes.i32_const ], result: Valtype.f64,
    fn: (x) => x >>> 0
  } ],
  [ Opcodes.f64_convert_i64_s, {
    params: [ Opcodes.i64_const ], result: Valtype.f64,
    fn: (x) => Number(x)
  } ],
  [ Opcodes.f64_convert_i64_u, {
    params: [ Opcodes.i64_const ], result: Valtype.f64,
    fn: (x) => Number(BigInt.asUintN(64, x))
  } ],
  [ Opcodes.f64_promote_f32, {
    params: [ Opcodes.i32_const ], result: Valtype.f64,
    fn: (x) => x
  } ],
  [ Opcodes.i64_reinterpret_f64, {
    params: [ Opcodes.f64_const ], result: Valtype.i64,
    fn: (x) => floatToBits64(x)
  } ],
  [ Opcodes.f64_reinterpret_i64, {
    params: [ Opcodes.i64_const ], result: Valtype.f64,
    fn: (x) => bitsToFloat64(x)
  } ],
  [ Opcodes.i32_trunc_sat_f32_s, {
    params: [ Opcodes.f32_const ], result: Valtype.i32,
    fn: (x) => truncateSaturated(x)
  } ],
  [ Opcodes.i32_trunc_sat_f32_u, {
    params: [ Opcodes.f32_const ], result: Valtype.i32,
    fn: (x) => truncateSaturatedUnsigned(x)
  } ],
  [ Opcodes.i32_trunc_sat_f64_s, {
    params: [ Opcodes.f64_const ], result: Valtype.i32,
    fn: (x) => truncateSaturated(x)
  } ],
  [ Opcodes.i32_trunc_sat_f64_u, {
    params: [ Opcodes.f64_const ], result: Valtype.i32,
    fn: (x) => truncateSaturatedUnsigned(x)
  } ],
  [ Opcodes.i64_trunc_sat_f32_s, {
    params: [ Opcodes.f32_const ], result: Valtype.i64,
    fn: (x) => truncateSaturatedLong(x)
  } ],
  [ Opcodes.i64_trunc_sat_f32_u, {
    params: [ Opcodes.f32_const ], result: Valtype.i64,
    fn: (x) => truncateSaturatedLongUnsigned(x)
  } ],
  [ Opcodes.i64_trunc_sat_f64_s, {
    params: [ Opcodes.f64_const ], result: Valtype.i64,
    fn: (x) => truncateSaturatedLong(x)
  } ],
  [ Opcodes.i64_trunc_sat_f64_u, {
    params: [ Opcodes.f64_const ], result: Valtype.i64,
    fn: (x) => truncateSaturatedLongUnsigned(x)
  } ],
]);

const blockEnd = (wasm, i, depth, includeElse) => {
  while (i < wasm.length) {
    let x = wasm[i][0];
    if (typeof x !== 'number' || x >= 0x20) {
      i++;
      continue;
    }
    if (x === Opcodes.end) {
      depth--;
      if (depth === 0) {
        return i;
      }
      i++;
      continue;
    }
    let sig = opcodeSignature(wasm[i][0]);
    if (!sig) {
      i++;
      continue;
    }
    if ((sig[2] & 16) != 0) {
      depth++;
    } else if (!includeElse && depth === 1 && (sig[2] & 8) != 0) {
      return i;
    }
    i++;
  }
  return i;
};

export default (funcs, globals, pages, tags, exceptions) => {
  const optLevel = parseInt(process.argv.find(x => x.startsWith('-O'))?.[2] ?? 1);
  if (optLevel === 0) return;

  const tailCall = Prefs.tailCall;
  if (tailCall) log.warning('opt', 'tail call proposal is not widely implemented! (you used --tail-call)');

  // todo: this breaks exceptions after due to indexes not being adjusted
  // const tagUse = tags.reduce((acc, x) => { acc[x.idx] = 0; return acc; }, {});
  // const exceptionUse = exceptions.reduce((acc, _, i) => { acc[i] = 0; return acc; }, {});

  // wasm transform pass
  let fi = 0;
  for (const f of funcs) {
    const wasm = f.wasm;

    globalThis.progress?.(`${fi++}/${funcs.length}`);

    const lastType = f.locals['#last_type']?.idx;

    let runs = (+Prefs.optWasmRuns) || 1; // todo: how many by default?
    while (runs > 0) {
      runs--;

      // main pass
      for (let i = 0; i < wasm.length; i++) {
        let inst = wasm[i];
        inst = Array.from(inst);
        wasm[i] = inst;

        if (inst[0] === null) {
          continue;
        }

        // if (inst[0] === Opcodes.throw) {
        //   tagUse[inst[1]]++;

        //   const exceptId = wasm[i - 1].slice(1);
        //   exceptionUse[exceptId]++;
        // }

        if (inst[0] === Opcodes.nop) {
          wasm.splice(i, 1);
          i--;
        }

        if (inst[0] === Opcodes.block || inst[0] === Opcodes.loop) {
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

        no: if (inst[0] <= 0x15) {
          let consumeEverything = opcodeSignature(inst[0]) === null;
          if (!consumeEverything) break no;
          let to = blockEnd(wasm, i + 1, 1, false);
          wasm.splice(i + 1, to - i - 1);
          continue;
        }

        let constEval = constantEvaluators.get(inst[0]);
        tryconst: if (constEval) {
          const plen = constEval.params.length;
          if (i < plen) {
            // console.error('const eval fail', inst, ': insufficient instructions');
            break tryconst;
          }
          for (let j = 0; j < plen; j++) {
            if (wasm[i - plen + j][0] !== constEval.params[j]) {
              // console.error('const eval fail', inst, 'parameter', j, 'is not correct, expected', constEval.params[j], 'found', wasm[i - plen + j]);
              break tryconst;
            }
          }
          let values = [];
          for (let j = 0; j < plen; j++) {
            values.push(wasm[i - plen + j][1]);
          }
          let result = constEval.fn(...values);
          if (result === null) {
            break tryconst;
          }
          // console.log('const eval succeeded:', wasm.slice(i - plen, i + 1), 'to', result);
          wasm.splice(i - plen, plen + 1, ...number(result, constEval.result));
          i -= plen + 1;
          continue;
        }

        // remove setting last type if it is never gotten
        if (!f.internal && !f.gotLastType && inst[0] === Opcodes.local_set && inst[1] === lastType) {
          // replace this inst with drop
          wasm[i] = [ Opcodes.drop ]; // remove this and last inst
          i--;
          continue;
        }

        if (i < 1) continue;
        let lastInst = wasm[i - 1];

        if (inst[0] == Opcodes.drop) {
          // trace back drop
          let toDrop = 1;
          let stackNeeded = 0;
          while (i + 1 < wasm.length && wasm[i + 1][0] === Opcodes.drop) {
            i++;
          }
          let removable = [ i ];
          let minValidIndex = i;
          for (let j = i - 1; j >= 0; j--) {
            let traceInst = wasm[j];
            if (stackNeeded === 0 && traceInst[0] === Opcodes.drop) {
              toDrop++;
              removable.push(j);
              minValidIndex = j;
              continue;
            }
            if (stackNeeded == 0 && traceInst[0] === Opcodes.local_tee) {
              // pass through: 
              stackNeeded = 1;
              removable.push([ j ]);
              toDrop--;
              if (toDrop == 0) {
                // stop
                break;
              }
              continue;
            }
            let sig = opcodeSignature(traceInst[0]);
            if (!sig) {
              // no simple signature
              break;
            }
            let [ inCount, outCount, flags ] = sig;
            if ((flags & ~3) != 0) { // not effect|trap
              // special flags
              break;
            }
            if (Prefs.assumeNoTrap) flags &= ~2; // trap
            if (stackNeeded >= outCount) {
              // all needed for stack, e.g. (1 -> 2, do 3 -> 0, drop 3) => (do 2 -> 0, drop 3)
              stackNeeded += inCount - outCount;
              if (stackNeeded === 0) {
                minValidIndex = j;
              }
              continue;
            }
            if (stackNeeded !== 0) {
              // part of the results are used (e.g. 1 -> 3, do 2 -> 0, drop 1) !! not possible
              break;
            }
            if (outCount > toDrop) {
              // not all results are dropped (e.g. 1 -> 2, drop 1) !! not possible
              break;
            }
            if (outCount !== 0 && flags !== 0) {
              if (outCount === toDrop) {
                // parking would not help
                break;
              }
              // special flags, can't pass through
              // park drops
              removable.push([ j + 1, outCount ]);
              toDrop -= outCount;
              continue;
            }
            // consume
            removable.push(j);
            minValidIndex = j;
            toDrop += inCount - outCount;
            if (toDrop == 0) {
              // stop
              break;
            }
          }
          if (minValidIndex < removable[0] || toDrop === 0) {
            // drop traceback succeeded!
            for (let x of removable) {
              if (typeof x === 'number') {
                wasm.splice(x, 1);
              } else if (x.length === 1) {
                wasm[x[0]][0] = Opcodes.local_set;
                continue;
              } else {
                wasm.splice(x[0], 0, ...Array(x[1]).fill(0).map(x => [ Opcodes.drop ]));
              }
            }
            if (toDrop) {
              wasm.splice(minValidIndex, 0, ...Array(toDrop).fill(0).map(x => [ Opcodes.drop ]));
            }
            i += toDrop - removable.length;
            continue;
          }
        }

        if (inst[0] === Opcodes.local_get && lastInst[0] === Opcodes.local_set && lastInst[1] === inst[1]) {
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

        if ((inst[0] === Opcodes.i32_trunc_sat_f64_s && lastInst[0] === Opcodes.f64_convert_i32_s) || (inst[0] === Opcodes.i32_trunc_sat_f64_u && lastInst[0] === Opcodes.f64_convert_i32_u)) {
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