// cyclone: wasm partial constant evaluator (it is fast and dangerous hence "cyclone")
import { number } from './encoding.js';
import { Opcodes, Valtype } from './wasmSpec.js';
import './prefs.js';

const f64ToI32Op = {
  [Opcodes.f64_eq]: Opcodes.i32_eq,
  [Opcodes.f64_ne]: Opcodes.i32_ne,
  [Opcodes.f64_lt]: Opcodes.i32_lt_s,
  [Opcodes.f64_le]: Opcodes.i32_le_s,
  [Opcodes.f64_gt]: Opcodes.i32_gt_s,
  [Opcodes.f64_ge]: Opcodes.i32_ge_s,
  [Opcodes.f64_add]: Opcodes.i32_add,
  [Opcodes.f64_sub]: Opcodes.i32_sub,
  [Opcodes.f64_mul]: Opcodes.i32_mul,
  [Opcodes.f64_div]: Opcodes.i32_div_s,
};

// const inv = (obj, keyMap = x => x) => Object.keys(obj).reduce((acc, x) => { acc[keyMap(obj[x])] = x; return acc; }, {});
// const invOpcodes = inv(Opcodes);

export default ({ name, wasm, locals: _locals, params }, _globals) => {
  let locals = Object.values(_locals);
  // const localNames = Object.keys(_locals);
  const localValtypes = locals.map(x => x.type);
  const localNeeded = new Array(locals.length).fill(0);

  let globals = Object.values(_globals);
  const globalValtypes = globals.map(x => x.type);
  // const globalNeeded = new Array(globals.length).fill(0);

  // every pass does the same initial low level things
  // each subsequent pass does it again and does more high-level things
  const passes = [
    0, // initial (simplify/reduce, mark locals)
    1 // local deletion
  ];

  while (passes.length > 0) {
    const pass = passes.shift();

    let stack = []; // "stack"
    const empty = () => {
      stack = [];
    };

    const reset = () => {
      locals = new Array(locals.length).fill(false);
      globals = new Array(globals.length).fill(false);
      empty();
    };

    reset();

    for (let i = 0; i < wasm.length; i++) {
      let op = wasm[i];
      if (!op) continue;

      op = [ ...op ];
      wasm[i] = op;

      let opcode = op[0];
      if (opcode === 0xfc) { // multibyte op
        opcode = (opcode << 8) + op[1];
      }

      const push = val => {
        stack.push({ val, op });
      };

      const peek = () => stack[stack.length - 1]?.val;
      const popWithoutRemove = () => stack.pop().val;

      const pop = () => {
        const popped = stack.pop();

        // remove the op
        wasm.splice(wasm.indexOf(popped.op), 1);
        i--;

        return popped.val;
      };
      const pop2 = () => [ pop(), pop() ];

      const bool = v => v ? 1 : 0;

      const replaceOp = newOp => op.splice(0, op.length, ...newOp);
      const replaceVal = (val, valtype) => replaceOp(number(val, valtype));

      // debugging
      // if (Prefs.f === name) console.log(invOpcodes[opcode], stack);
      switch (opcode) {
        case Opcodes.if: {
          if (stack.length < 1) { reset(); break; }
          const cond = bool(pop());

          // find else split and end
          let j = i + 1;
          let depth = 0, elseStart = 0;
          for (; j < wasm.length; j++) {
            const op = wasm[j][0];
            if (op === Opcodes.if || op === Opcodes.block || op === Opcodes.loop || op === Opcodes.try) depth++;
            if (op === Opcodes.else && depth === 0) elseStart = j;
            if (op === Opcodes.end) {
              depth--;
              if (depth < 0) break;
            }
            if (op === Opcodes.br || op === Opcodes.br_if) wasm[j][1] -= 1;
          }

          if (cond) {
            // remove else if it exists, or just remove end
            if (elseStart) wasm.splice(elseStart, j - elseStart + 1);
              else wasm.splice(j, 1);
          } else {
            // remove truthy conseq and keep else if it exists, or just remove entire thing
            if (elseStart) {
              wasm.splice(j, 1); // remove end
              wasm.splice(i + 1, elseStart - i + 1); // remove truthy conseq
            } else wasm.splice(i + 1, j - i + 0); // no else, remove entire if
          }

          // remove this if op
          wasm.splice(i, 1);
          i--;

          break;
        }

        case Opcodes.i32_const: {
          const n = op[1];
          push(n);
          break;
        }
        case Opcodes.f64_const: {
          const n = op[1];
          push(n);
          break;
        }

        case Opcodes.i32_eqz: {
          if (stack.length < 1) { empty(); break; };
          const v = bool(pop() === 0);

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_eq: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = bool(a === b);

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_ne: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = bool(a !== b);

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_lt_s: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = bool(a < b);

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_le_s: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = bool(a <= b);

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_gt_s: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = bool(a > b);

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_ge_s: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = bool(a >= b);

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }

        case Opcodes.i32_add: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a + b;

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_sub: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a - b;

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_mul: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a * b;

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_div_s: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a / b;

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_rem_s: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a % b; // not rem but good enough

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }

        case Opcodes.i32_and: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a & b;

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_or: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a | b;

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_xor: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a ^ b;

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_shl: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a << b;

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_shr_s: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a >> b;

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.i32_shr_u: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a >>> b;

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }

        case Opcodes.f64_eq: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = bool(a === b);

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.f64_ne: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = bool(a !== b);

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.f64_lt: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = bool(a < b);

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.f64_le: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = bool(a <= b);

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.f64_gt: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = bool(a > b);

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }
        case Opcodes.f64_ge: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = bool(a >= b);

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }

        case Opcodes.f64_abs: {
          if (stack.length < 1) { empty(); break; };
          const v = Math.abs(pop());

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }
        case Opcodes.f64_neg: {
          if (stack.length < 1) { empty(); break; };
          const v = -pop();

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }

        case Opcodes.f64_ceil: {
          if (stack.length < 1) { empty(); break; };
          const v = Math.ceil(pop());

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }
        case Opcodes.f64_floor: {
          if (stack.length < 1) { empty(); break; };
          const v = Math.floor(pop());

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }
        case Opcodes.f64_trunc: {
          if (stack.length < 1) { empty(); break; };
          const v = Math.trunc(pop());

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }
        case Opcodes.f64_nearest: {
          if (stack.length < 1) { empty(); break; };
          const v = Math.round(pop());

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }

        case Opcodes.f64_sqrt: {
          if (stack.length < 1) { empty(); break; };
          const v = Math.sqrt(pop());

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }

        case Opcodes.f64_add: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a + b;

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }
        case Opcodes.f64_sub: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a - b;

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }
        case Opcodes.f64_mul: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a * b;

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }
        case Opcodes.f64_div: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = a / b;

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }

        case Opcodes.f64_min: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = Math.min(a, b);

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }
        case Opcodes.f64_max: {
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = Math.max(a, b);

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }

        case Opcodes.f64_copysign: { // todo: check behavior
          if (stack.length < 2) { empty(); break; };
          const [ b, a ] = pop2();
          const v = Math.abs(a) * (b > 0 ? 1 : -1);

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }

        case Opcodes.f64_convert_i32_s:
        case Opcodes.f64_convert_i32_u: {
          if (stack.length < 1) { empty(); break; };
          const v = pop();

          replaceVal(v, Valtype.f64);
          push(v);
          break;
        }

        case 0xfc02: // i32.trunc_sat_f64_s
        case 0xfc03: { // i32.trunc_sat_f64_u
          if (stack.length < 1) { empty(); break; }
          const v = pop();

          replaceVal(v, Valtype.i32);
          push(v);
          break;
        }

        case Opcodes.drop: {
          if (stack.length < 1) { empty(); break; }
          pop();
          break;
        }

        case Opcodes.local_get: {
          const x = locals[op[1]];
          if (x === false) {
            localNeeded[op[1]] |= 0b01;
            empty();
          } else {
            replaceVal(x, localValtypes[op[1]]);
            push(x);
          }
          break;
        }

        case Opcodes.local_set: {
          if (pass === 1) {
            if (localNeeded[op[1]] === 0) {
              // todo: breaks some bad assembler local code
              // delete _locals[localNames[op[1]]];

              pop();
              wasm.splice(i, 1);
              i--;
              break;
            }
          }

          if (stack.length < 1) {
            localNeeded[op[1]] |= 0b10;
            locals[op[1]] = false;
            empty();
            break;
          }

          const x = popWithoutRemove();
          locals[op[1]] = x;
          break;
        }

        case Opcodes.local_tee: {
          if (pass === 1) {
            if (localNeeded[op[1]] === 0) {
              // todo: breaks some bad assembler local code
              // delete _locals[localNames[op[1]]];

              pop();
              wasm.splice(i, 1);
              i--;
              break;
            }
          }

          if (stack.length < 1) {
            localNeeded[op[1]] |= 0b10;
            locals[op[1]] = false;
            empty();
            break;
          }

          const x = pop();
          locals[op[1]] = x;
          replaceVal(x, localValtypes[op[1]]);
          push(x);
          break;
        }

        case Opcodes.global_get: {
          const x = globals[op[1]];
          if (x === false) {
            empty();
          } else {
            replaceVal(x, globalValtypes[op[1]]);
            push(x);
          }
          break;
        }

        case Opcodes.global_set: {
          if (stack.length < 1) {
            globals[op[1]] = false;
            empty();
            break;
          }

          const x = peek();
          globals[op[1]] = x;
          break;
        }

        case Opcodes.block:
        case Opcodes.loop:
        case Opcodes.try:
        case Opcodes.else:
        case Opcodes.catch:
        case Opcodes.end: {
          reset();
          break;
        }

        default: {
          empty();
          break;
        }
      }

      // this does, eg:
      // local.get 7 ;; $i (i32)
      // f64.convert_i32_s
      // f64.const 1
      // f64.add
      // i32.trunc_sat_f64_s <--
      // local.set 7 ;; $i (i32)
      // ->
      // local.get 7 ;; $i (i32)
      // i32.const 1
      // i32.add
      // local.set 7 ;; $i (i32)
      // if (i >= 2 &&
      //   ((opcode >= 0xa0 && opcode <= 0xa3) || // main f64 math op
      //   (opcode >= 0x61 && opcode <= 0x66)) // main f64 eq op
      // ) {
      //   const o2 = wasm[i - 1][0];
      //   if (o2 === Opcodes.f64_const) { // f64.const
      //     const o3 = wasm[i - 2][0];
      //     if (o3 === Opcodes.f64_convert_i32_s || o3 === Opcodes.f64_convert_i32_u) {
      //       // remove now unneeded i32 -> f64 convert
      //       wasm.splice(i - 2, 1);
      //       i--;

      //       // convert f64.const -> i32.const
      //       const n = wasm[i - 1][1];
      //       wasm.splice(i - 1, 1, number(n, Valtype.i32));

      //       // convert math op from f64 to i32
      //       wasm[i][0] = f64ToI32Op[wasm[i][0]];

      //       const nextOp = wasm[i + 1];
      //       if (nextOp && opcode >= 0xa0 && opcode <= 0xa3) {
      //         if (nextOp[0] === 0xfc && (nextOp[1] === 0x02 || nextOp[1] === 0x03)) {
      //           // remove optional unneeded f64 -> i32 convert after
      //           wasm.splice(i + 1, 1);
      //         } else {
      //           // add now needed i32 -> f64 convert after
      //           wasm.splice(i + 1, Opcodes.i32_trunc_sat_f64_s);
      //         }
      //       }
      //     }
      //   }
      // }

      // if ((opcode === 0xfc02 || opcode === 0xfc03) && i >= 3) { // i32.trunc_sat_f64_s/u
      //   const o2 = wasm[i - 1][0];
      //   if (
      //     (o2 >= 0xa0 && o2 <= 0xa3) || // main f64 math op
      //     (o2 >= 0x61 && o2 <= 0x66) // main f64 eq op
      //   ) {
      //     const o3 = wasm[i - 2][0];
      //     if (o3 === Opcodes.f64_const) { // f64.const
      //       const o4 = wasm[i - 3][0];
      //       if (o4 === Opcodes.f64_convert_i32_s || o4 === Opcodes.f64_convert_i32_u) {
      //         // remove now unneeded i32 -> f64 convert
      //         wasm.splice(i - 3, 1);
      //         i--;
      //       } else {
      //         // add now needed f64 -> i32 convert prior
      //         wasm.splice(i - 2, 0, Opcodes.i32_trunc_sat_f64_s);
      //         i++;
      //       }

      //       // convert f64.const -> i32.const
      //       const n = wasm[i - 2][1];
      //       wasm.splice(i - 2, 1, number(n, Valtype.i32));

      //       // convert math op from f64 to i32
      //       wasm[i - 1][0] = f64ToI32Op[wasm[i - 1][0]];

      //       // remove this now unneeded f64 -> i32 convert
      //       wasm.splice(i, 1);
      //     }
      //   }
      // }
    }
  }
};