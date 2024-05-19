let offset = 0, input;

const read = () => input[offset++];

const signedLEB128 = () => {
  let result = 0, shift = 0;

  while (true) {
    const byte = read();
    result |= (byte & 0x7f) << shift;

    shift += 7;

    if ((0x80 & byte) == 0) { // final byte
      if (shift < 32 && (byte & 0x40) != 0) {
        return result | (-1 << shift);
      }

      return result;
    }
  }
};

const unsignedLEB128 = () => {
  let result = 0, shift = 0;

  while (true) {
    const byte = read();
    result |= (byte & 0x7f) << shift;

    shift += 7;

    if ((0x80 & byte) == 0) { // final byte
      return result;
    }
  }
};

const ieee754 = () => new Float64Array(new Uint8Array([ read(), read(), read(), read(), read(), read(), read(), read() ]).buffer)[0];

const string = () => {
  let out = '';

  const len = unsignedLEB128();
  for (let i = 0; i < len; i++) {
    out += String.fromCharCode(read());
  }

  return out;
};

const wasmToBC = (code, { types, funcs, imports }) => {
  const _input = input;
  const _offset = offset;

  input = code;
  offset = 0;

  const top = { body: [] };

  let parents = [ top ];
  let parent = top;

  let depth = 0;

  read: while (offset < input.length) {
    let opcode = read();
    // console.log(invOpcodes[opcode], depth, invOpcodes[parent.opcode]);

    if (opcode === 0xfc) { // multibyte op
      opcode = (opcode << 8) + read();
    }

    switch (opcode) {
      case 0x01: { // nop
        break;
      }

      case 0x02: // block
      case 0x03: // loop
      case 0x04: { // if
        const ret = read();
        const obj = { opcode, returns: ret, doesReturn: ret !== 0x40, body: [] };
        parent.body.push(obj);

        parent = obj;
        parents.push(obj);

        depth++;

        break;
      }

      case 0x05: { // else
        const obj = [];
        parent.else = obj;
        parent = { body: obj }; // mock parent obj for else branch

        break;
      }

      case 0x0b: { // end
        parents.pop();
        parent = parents[parents.length - 1];

        depth--;

        // if (depth === -1) break read;

        break;
      }

      case 0x0c: // br
      case 0x0d: { // br_if
        parent.body.push({ opcode, goto: read() });
        break;
      }

      case 0x10: { // call
        const func = read(); // unsignedLEB128();
        const obj = { opcode, func };

        if (func < imports.length) {
          const mod = imports[func].module;
          const name = imports[func].name;

          obj.import = { mod, name };

          const type = types[imports[func].typeIdx];
          obj.type = type;

          obj.paramCount = type.params.length;
          obj.returnCount = type.returns.length;

          parent.body.push(obj);
          break;
        }

        const type = types[funcs[func - imports.length]];
        obj.type = type;

        obj.paramCount = type.params.length;
        obj.returnCount = type.returns.length;

        parent.body.push(obj);
        break;
      }

      case 0x20: // local.get
      case 0x21: // local.set
      case 0x22: // local.tee
      case 0x23: // global.get
      case 0x24: { // global.set
        parent.body.push({ opcode, idx: read() });
        break;
      }

      case 0x41: { // i32.const
        parent.body.push({ opcode, val: signedLEB128() });
        break;
      }
      case 0x42: { // i64.const
        parent.body.push({ opcode, val: signedLEB128() });
        break;
      }
      case 0x44: { // f64.const
        parent.body.push({ opcode, val: ieee754() });
        break;
      }

      default: {
        parent.body.push({ opcode });
        break;
      }
    }
  }

  input = _input;
  offset = _offset;

  if (parents.length > 1) {
    // console.log(parents);
    // console.log(stringifyOp({ types, funcs, imports }, top));
    throw new Error('wasmToBC failed');
  }

  return top;
};

const parse = (binary) => {
  offset = 0;
  input = binary;

  if (
    read() != 0x00 ||
    read() != 0x61 ||
    read() != 0x73 ||
    read() != 0x6d
  ) throw new Error('invalid magic');

  if (
    read() != 0x01 ||
    read() != 0x00 ||
    read() != 0x00 ||
    read() != 0x00
  ) throw new Error('invalid version');

  let types = [],
    imports = [],
    funcs = [],
    memories = [],
    tags = [],
    exports = [],
    globals = [],
    codes = [],
    datas = [];

  const len = input.length;
  while (offset < len) {
    const section = read();
    const bytes = unsignedLEB128();

    if (section === 1) { // type
      const typesLength = unsignedLEB128();
      types = new Array(typesLength);

      for (let i = 0; i < typesLength; i++) {
        const type = read();

        const paramsLength = unsignedLEB128();
        const params = new Array(paramsLength);
        for (let j = 0; j < paramsLength; j++) params[j] = read();

        const returnsLength = unsignedLEB128();
        const returns = new Array(returnsLength);
        for (let j = 0; j < returnsLength; j++) returns[j] = read();

        types[i] = { type, params, returns };
      }

      continue;
    }

    if (section === 2) { // import
      const importsLength = unsignedLEB128();
      imports = new Array(importsLength);

      for (let i = 0; i < importsLength; i++) {
        const module = string();
        const name = string();

        const type = read();

        const typeIdx = unsignedLEB128();

        imports[i] = { module, name, type, typeIdx };
      }

      continue;
    }

    if (section === 3) { // func
      const funcsLength = unsignedLEB128();
      funcs = new Array(funcsLength);

      for (let i = 0; i < funcsLength; i++) {
        funcs[i] = unsignedLEB128();
      }

      continue;
    }

    if (section === 5) { // memory
      const memoriesLength = unsignedLEB128();
      memories = new Array(memoriesLength);

      for (let i = 0; i < memoriesLength; i++) {
        const flag = read();

        let min = null, max = null;
        switch (flag) {
          case 0x00:
            min = unsignedLEB128();
            break;

          case 0x01:
            min = unsignedLEB128();
            max = unsignedLEB128();
            break;
        }

        memories[i] = { min, max };
      }
    }

    if (section === 13) { // tag
      const tagsLength = unsignedLEB128();
      tags = new Array(tagsLength);

      for (let i = 0; i < tagsLength; i++) {
        const attr = read();
        const type = unsignedLEB128();

        tags[i] = { attr, type };
      }
    }

    if (section === 6) { // global
      const globalsLength = unsignedLEB128();
      globals = new Array(globalsLength);

      for (let i = 0; i < globalsLength; i++) {
        const valtype = read();
        const mutable = read() === 0x01;

        let init = [];
        while (true) {
          const byte = read();
          init.push(byte);

          if (byte === 0x0b) break; // end
        }

        const bc = wasmToBC(init, { types, funcs, imports });

        globals[i] = { valtype, mutable, init, bc };
        if (globalThis.porfDebugInfo) {
          for (const x in globalThis.porfDebugInfo.globals) {
            if (globalThis.porfDebugInfo.globals[x].idx === i) globals[i].porfGlobalName = x;
          }
        }
      }

      continue;
    }

    if (section === 7) { // export
      const exportsLength = unsignedLEB128();
      exports = new Array(exportsLength);

      for (let i = 0; i < exportsLength; i++) {
        const name = string();

        const type = read();

        const index = unsignedLEB128();

        exports[i] = { name, type, index };
      }

      continue;
    }

    if (section === 10) { // code
      const codesLength = unsignedLEB128();
      codes = new Array(codesLength);

      for (let i = 0; i < codesLength; i++) {
        const size = unsignedLEB128();
        const end = offset + size;

        const locals = types[funcs[i]].params.slice();

        const localsLength = unsignedLEB128();
        for (let j = 0; j < localsLength; j++) {
          const count = unsignedLEB128();
          const type = read();

          for (let k = 0; k < count; k++) locals.push(type);
        }

        const bytesLeft = end - offset;
        const wasm = new Array(bytesLeft);
        for (let j = 0; j < bytesLeft; j++) wasm[j] = read();

        const bc = wasmToBC(wasm, { types, funcs, imports });
        bc.codeIdx = i;
        bc.wasmType = types[funcs[i]];
        if (globalThis.porfDebugInfo) bc.porfFunc = globalThis.porfDebugInfo.funcs[i];

        codes[i] = { locals, wasm, bc };
      }

      continue;
    }

    if (section === 11) { // data
      const datasLength = unsignedLEB128();
      datas = new Array(datasLength);

      for (let i = 0; i < datasLength; i++) {
        const mode = read();

        let offset = 0;
        switch (mode) {
          case 0:
            let init = [];
            while (true) {
              const byte = read();
              init.push(byte);

              if (byte === 0x0b) break; // end
            }

            offset = runExpr(init);

            break;

          default:
            throw new Error('todo');
        }

        const bytesLength = unsignedLEB128();
        const bytes = new Array(bytesLength);

        for (let j = 0; j < bytesLength; j++) bytes[j] = read();

        datas[i] = { offset, bytes };
      }
    }

    if (section === 12) { // data count
      datas.dataCount = unsignedLEB128();
    }
  }

  return { types, imports, funcs, memories, tags, globals, exports, codes, datas };
};

const inv = (obj, keyMap = x => x) => Object.keys(obj).reduce((acc, x) => {
  const k = keyMap(obj[x]);
  if (acc[k] == null) acc[k] = x;
  return acc;
}, {});

// const { Opcodes, Valtype } = (await import('../compiler/wasmSpec.js'));
// const invOpcodes = inv(Opcodes, x => {
//   if (typeof x === 'number') return x;
//   return (x[0] << 8) + x[1];
// });
// const invValtype = inv(Valtype);

let times = {};
let amounts = {};

const vm = ({ types, imports, funcs, globals, exports, codes }, importImpls, startFunc) => {
  const run = (bc, locals = []) => {
    let stack = [];

    let parents = [ bc ];
    let parent = bc;

    parent.pc = 0;

    while (true) {
      // const start = performance.now();
      const op = parent.body[parent.pc++];
      // if (bc.name === '__console_log') console.log(invOpcodes[op?.opcode], invOpcodes[parent?.opcode], parent.pc - 1, parent.body.length - 1, parents.length - 1);
      if (!op) {
        // presume end of op body
        parents.pop();
        parent = parents[parents.length - 1];

        if (!parent) {
          // presume end of func
          return stack;
        }

        continue;
      }

      const br = n => {
        const ind = parents.length - n - 1;
        const target = parents[ind];

        // console.log(n, parents.map(x => invOpcodes[x.opcode]), target);
        if (target.opcode === 0x03) { // loop
          parents = parents.slice(0, ind + 1);
          parent = parents[parents.length - 1];
          parent.pc = 0;
        } else {
          parents = parents.slice(0, ind);
          parent = parents[parents.length - 1];
        }
      };

      switch (op.opcode) {
        case 0x00: { // unreachable
          throw new Error('unreachable');
        }

        case 0x01: { // nop
          break;
        }

        case 0x02: { // block
          parents.push(op);
          parent = op;
          parent.pc = 0;

          break;
        }

        case 0x03: { // loop
          parents.push(op);
          parent = op;
          parent.pc = 0;

          break;
        }

        case 0x04: { // if
          const cond = stack.pop();
          if (cond) { // true cond
            parent = op;
            parents.push(op);
            parent.pc = 0;
          } else if (op.else) { // false cond, else branch exists
            parent = { body: op.else }; // mock parent for else branch
            parents.push(op);
            parent.pc = 0;
          } else { // false cond, no else branch
            // do nothing to just skip this op
          }

          break;
        }

        case 0x0c: { // br
          br(op.goto);
          break;
        }

        case 0x0d: { // br_if
          if (stack.pop()) br(op.goto);
          break;
        }

        case 0x0f: { // return
          return stack;
        }

        case 0x10: { // call
          const paramCount = op.paramCount;

          if (op.import) {
            const params = new Array(paramCount);

            if (paramCount === 0) {}
              else if (paramCount === 1) params[0] = stack.pop();
              else if (paramCount === 2) { params[1] = stack.pop(); params[0] = stack.pop(); }
              else for (let i = paramCount - 1; i >= 0; i--) params[i] = stack.pop();

            const ret = importImpls[op.import.mod][op.import.name](...params);

            if (type.returns.length > 0) stack.push(ret);

            break;
          }

          const code = codes[op.func - imports.length];

          // console.log(bc.name, '->', code.bc.name);

          const callBC = code.bc;
          const locals = new Array(code.locals.length).fill(0);

          if (paramCount === 0) {}
            else if (paramCount === 1) locals[0] = stack.pop();
            else if (paramCount === 2) { locals[1] = stack.pop(); locals[0] = stack.pop(); }
            else for (let i = paramCount - 1; i >= 0; i--) locals[i] = stack.pop();

          const outStack = run(callBC, locals);
          stack.push(...outStack);

          // console.log(bc.name, '<-', code.bc.name);

          break;
        }

        case 0x1a: { // drop
          stack.pop();
          break;
        }

        case 0x20: { // local.get
          stack.push(locals[op.idx]);
          break;
        }

        case 0x21: { // local.set
          locals[op.idx] = stack.pop();
          break;
        }

        case 0x22: { // local.tee
          stack.push(locals[op.idx] = stack.pop());
          break;
        }

        case 0x23: { // global.get
          // lazily evaluate global init exprs
          const idx = op.idx;
          if (globals[idx].value == null) {
            globals[idx].value = run(globals[idx].bc, [], false)[0];
          }

          stack.push(globals[idx].value);
          break;
        }

        case 0x24: { // global.set
          globals[op.idx].value = stack.pop();
          break;
        }

        case 0x41: { // i32.const
          stack.push(op.val);
          break;
        }
        case 0x42: { // i64.const
          stack.push(op.val);
          break;
        }
        case 0x44: { // f64.const
          stack.push(op.val);
          break;
        }

        case 0x45: { // i32_eqz
          stack.push(stack.pop() === 0);
          break;
        }
        case 0x46: { // i32_eq
          stack.push(stack.pop() === stack.pop());
          break;
        }
        case 0x47: { // i32_ne
          stack.push(stack.pop() !== stack.pop());
          break;
        }
        case 0x48: { // i32.lt_s
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a < b);
          break;
        }
        case 0x4c: { // i32.le_s
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a <= b);
          break;
        }
        case 0x4a: { // i32.gt_s
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a > b);
          break;
        }
        case 0x4e: { // i32_ge_s
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a >= b);
          break;
        }

        case 0x6a: { // i32_add
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a + b);
          break;
        }
        case 0x6b: { // i32_sub
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a - b);
          break;
        }
        case 0x6c: { // i32_mul
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a * b);
          break;
        }
        case 0x6d: { // i32_div_s
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a / b);
          break;
        }
        case 0x6f: { // i32_rem_s
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a % b);
          break;
        }

        case 0x71: { // i32_and
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a & b);
          break;
        }
        case 0x72: { // i32_or
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a | b);
          break;
        }
        case 0x73: { // i32_xor
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a ^ b);
          break;
        }
        case 0x74: { // i32_shl
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a << b);
          break;
        }
        case 0x75: { // i32_shr_s
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a >> b);
          break;
        }
        case 0x76: { // i32_shr_u
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a >>> b);
          break;
        }

        // case 0x50: { // i64_eqz
        //   break;
        // }
        // case 0x51: { // i64_eq
        //   break;
        // }
        // case 0x52: { // i64_ne
        //   break;
        // }

        // case 0x53: { // i64_lt_s
        //   break;
        // }
        // case 0x57: { // i64_le_s
        //   break;
        // }
        // case 0x55: { // i64_gt_s
        //   break;
        // }
        // case 0x59: { // i64_ge_s
        //   break;
        // }

        // case 0x7c: { // i64_add
        //   break;
        // }
        // case 0x7d: { // i64_sub
        //   break;
        // }
        // case 0x7e: { // i64_mul
        //   break;
        // }
        // case 0x7f: { // i64_div_s
        //   break;
        // }
        // case 0x81: { // i64_rem_s
        //   break;
        // }

        // case 0x83: { // i64_and
        //   break;
        // }
        // case 0x84: { // i64_or
        //   break;
        // }
        // case 0x85: { // i64_xor
        //   break;
        // }
        // case 0x86: { // i64_shl
        //   break;
        // }
        // case 0x87: { // i64_shr_s
        //   break;
        // }
        // case 0x88: { // i64_shr_u
        //   break;
        // }

        case 0x61: { // f64_eq
          stack.push(stack.pop() === stack.pop());
          break;
        }
        case 0x62: { // f64_ne
          stack.push(stack.pop() !== stack.pop());
          break;
        }

        case 0x63: { // f64_lt
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a < b);
          break;
        }
        case 0x65: { // f64_le
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a <= b);
          break;
        }
        case 0x64: { // f64_gt
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a > b);
          break;
        }
        case 0x66: { // f64_ge
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a >= b);
          break;
        }

        case 0x99: { // f64_abs
          stack.push(Math.abs(stack.pop()));
          break;
        }
        case 0x9a: { // f64_neg
          stack.push(stack.pop() * -1);
          break;
        }

        case 0x9b: { // f64_ceil
          stack.push(Math.ceil(stack.pop()));
          break;
        }
        case 0x9c: { // f64_floor
          stack.push(Math.floor(stack.pop()));
          break;
        }
        case 0x9d: { // f64_trunc
          stack.push(stack.pop() | 0);
          break;
        }
        case 0x9e: { // f64_nearest
          stack.push(Math.round(stack.pop()));
          break;
        }

        case 0x9f: { // f64_sqrt
          stack.push(Math.sqrt(stack.pop()));
          break;
        }
        case 0xa0: { // f64_add
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a + b);
          break;
        }
        case 0xa1: { // f64_sub
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a - b);
          break;
        }
        case 0xa2: { // f64_mul
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a * b);
          break;
        }
        case 0xa3: { // f64_div
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a / b);
          break;
        }
        case 0xa4: { // f64_min
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a > b ? b : a);
          break;
        }
        case 0xa5: { // f64_max
          const b = stack.pop();
          const a = stack.pop();
          stack.push(a > b ? a : b);
          break;
        }

        case 0xa7: { // i32_wrap_i64
          break;
        }
        case 0xac: { // i64_extend_i32_s
          break;
        }
        case 0xad: { // i64_extend_i32_u
          break;
        }

        case 0xb6: { // f32_demote_f64
          break;
        }
        case 0xbb: { // f64_promote_f32
          break;
        }

        case 0xb7: { // f64_convert_i32_s
          break;
        }
        case 0xb8: { // f64_convert_i32_u
          break;
        }
        case 0xb9: { // f64_convert_i64_s
          break;
        }
        case 0xba: { // f64_convert_i64_u
          break;
        }

        case 0xfc02: { // i32_trunc_sat_f64_s
          break;
        }

        case 0xfc03: { // i32_trunc_sat_f64_u
          break;
        }

        default: {
          console.log(activeFunc, offset, input.length, parents.length - 1);
          throw new Error(`unimplemented op: 0x${op.opcode?.toString(16)}`);
        }
      }

      // const t = performance.now() - start;
      // times[invOpcodes[op.opcode]] = (times[invOpcodes[op.opcode]] ?? 0) + t;
      // amounts[invOpcodes[op.opcode]] = (amounts[invOpcodes[op.opcode]] ?? 0) + 1;
    }
  };

  const type = types[funcs[startFunc - imports.length]];
  const code = codes[startFunc - imports.length];

  return (...args) => {
    const locals = new Array(code.locals.length).fill(0);

    for (let i = 0; i < type.params.length; i++) locals[i] = args[i];

    return run(code.bc, locals);

    // times = {};
    // const ret = run(code.bc, args);
    // console.log('\n\n' + Object.keys(times).map(x => `${x}: ${((times[x] * 1000) / amounts[x]).toFixed(5)}s/op avg`).join('\n'));
    // return ret;
  };
};

const runExpr = wasm => vm({
  types: [ { params: [] } ],
  imports: [],
  funcs: [ 0 ],
  globals: [],
  exports: [],
  codes: [ { wasm, bc: wasmToBC(wasm, {}) } ]
}, {}, 0)();

const stringifyOp = ({ types, funcs, codes, imports, globals }, op, porfFunc = op.porfFunc, depth = 0) => {
  const noHighlight = x => [...x].join('​');

  let str = ' '.repeat(depth * 2) + (op.opcode ?
    invOpcodes[op.opcode].replace('_', '.').replace('return.', 'return_').replace('call.', 'call_').replace('br.', 'br_').replace('catch.', 'catch_') :
    ((op.porfFunc?.name ? `${noHighlight(op.porfFunc.name)} ` : '') + (op.wasmType?.params ? `(${op.wasmType.params.map(x => invValtype[x]).join(', ')}) -> (${op.wasmType.returns.map(x => invValtype[x]).join(', ')})` : ''))
  );

  // if (op.returns && op.returns !== 0x40) str += ` ${invValtype[op.returns]}`;
  if (op.goto != null) str += ` ${op.goto}`;
  if (op.func != null) str += ` ${op.func}`;
  if (op.idx != null) str += ` ${op.idx}`;
  if (op.val != null) str += ` ${op.val}`;

  if (porfFunc) {
    if (!porfFunc.invLocals) porfFunc.invLocals = inv(porfFunc.locals, x => x.idx);

    if (op.func != null) {
      str += ` \x1b[90m${op.func >= imports.length ? `${noHighlight(codes[op.func - imports.length].bc.porfFunc.name)}` : `${({ p: 'print', c: 'printChar', t: 'time', u: 'timeOrigin', y: 'profile1', z: 'profile2' })[imports[op.func].name]}`}`;
      const type = types[op.func >= imports.length ? funcs[op.func - imports.length] : imports[op.func].typeIdx];
      str += ` (${type.params.map(x => noHighlight(invValtype[x])).join(', ')}) -> (${type.returns.map(x => noHighlight(invValtype[x])).join(', ')})`;
      str += '\x1b[0m';
    }

    if (op.opcode >= 0x20 && op.opcode <= 0x22) str += ` \x1b[90m${noHighlight(porfFunc.invLocals[op.idx] ?? '')}\x1b[0m`;
    if (op.opcode >= 0x23 && op.opcode <= 0x24) str += ` \x1b[90m${noHighlight(globals[op.idx].porfGlobalName ?? '')}\x1b[0m`;
  }

  if (op.body) {
    str += ':\n';
    for (const x of op.body) {
      str += stringifyOp({ types, funcs, codes, imports, globals }, x, porfFunc, depth + 1) + '\n';
    }

    if (op.else) {
      str += ' '.repeat(depth * 2) + 'else:\n';
      for (const x of op.else) {
        str += stringifyOp({ types, funcs, codes, imports, globals }, x, porfFunc, depth + 1) + '\n';
      }
    }

    str = str.slice(0, -1);
    // str += ' '.repeat(depth * 2) + 'end';
  }

  const highlightAsm = asm => asm
    .replace(/(local|global|memory)\.[^\s]*/g, _ => `\x1B[31m${_}\x1B[0m`)
    .replace(/(i(8|16|32|64)x[0-9]+|v128)(\.[^\s]*)?/g, _ => `\x1B[34m${_}\x1B[0m`)
    .replace(/(i32|i64|f32|f64|drop)(\.[^\s]*)?/g, _ => `\x1B[36m${_}\x1B[0m`)
    .replace(/(return_call|call|br_if|br|return|rethrow|throw)/g, _ => `\x1B[35m${_}\x1B[0m`)
    .replace(/(block|loop|if|end|else|try|catch_all|catch|delegate):?/g, _ => `\x1B[95m${_}\x1B[0m`)
    .replace(/unreachable/g, _ => `\x1B[91m${_}\x1B[0m`)
    .replace(/ \-?[0-9\.]+/g, _ => ` \x1B[93m${_.slice(1)}\x1B[0m`)
    .replace(/ ;;.*$/gm, _ => `\x1B[90m${_.replaceAll(/\x1B\[[0-9]+m/g, '')}\x1B[0m`);

  return highlightAsm(str);
};

let Byg, invOpcodes, invValtype;

// setup a debug variant by self modifying code to avoid overhead when not debugging
let _wasmDebugVm;
const wasmDebugVm = (async () => {
  if (_wasmDebugVm) return _wasmDebugVm;

  // imports only for debug
  const { Opcodes, Valtype } = (await import('../compiler/wasmSpec.js'));
  invOpcodes = inv(Opcodes, x => {
    if (typeof x === 'number') return x;
    return (x[0] << 8) + x[1];
  });
  invValtype = inv(Valtype);

  Byg = (await import('../byg/index.js')).default;


  let str = vm.toString();

  // add to start of vm()
  // make lines
  str = `({ types, imports, funcs, globals, exports, codes }, importImpls, startFunc) => {
let paused = true;
let stepIn = false, stepOut = false;
const lines = codes.map(x => stringifyOp({ types, funcs, codes, imports, globals }, x.bc)).join('\\n\\n').split('\\n');
const funcLines = new Array(codes.length);
let j = 0;
for (let i = 0; i < lines.length; i++) {
  const x = lines[i];
  if (x[0] !== ' ' && x !== '\\x1B[95mend\\x1B[0m' && x !== '') funcLines[j++] = i;
}

let callStack = [];
const byg = Byg({
  lines,
  pause: () => { paused = true; },
  breakpoint: (line, breakpoint) => {
    // it's (not) very effishient
    const funcOffset = funcLines.slice().reverse().find(x => line > x);
    const func = funcLines.indexOf(funcOffset);
    const totalOpIdx = line - funcOffset;

    let op = 0;
    const iter = bc => {
      for (const x of bc) {
        op++;
        if (op === totalOpIdx) {
          op = x;
          return true;
        }

        if (x.body) {
          if (iter(x.body)) return true;
        }

        if (x.else) {
          op++;
          if (iter(x.else)) return true;
        }
      }
    };
    iter(codes[func].bc.body);

    op.breakpoint = breakpoint;
  }
});
` + str.slice(str.indexOf('=>') + 4);

  // add to start of run()
  str = str.replace('const run = (bc, locals = []) => {', `const run = (bc, locals = []) => {
if (bc.porfFunc) callStack.push(bc.porfFunc.name);
let lastDebugLocals = null, lastDebugGlobals = null;
`);

  // add to start of returns
  str = str.replaceAll('return stack;', `if (bc.porfFunc) callStack.pop();
return stack;`);

  // add to vm loop
  str = str.replace('const op = parent.body[parent.pc++];', `const op = parent.body[parent.pc++];
if (op && op.breakpoint) paused = true;
if (bc.porfFunc && paused && op) {
  stepIn = false; stepOut = false;

  const currentFunc = bc.codeIdx;

  let currentLine = 0;
  const addBodyLines = x => {
    currentLine += x.length;
    for (const y of x) {
      if (y.body) addBodyLines(y.body);
      if (y.else) addBodyLines(y.else);
    }
  };

  for (let i = 0; i < parents.length; i++) {
    const x = parents[i];
    currentLine += x.pc;

    for (let j = 0; j < x.pc - 1; j++) {
      if (x.body[j].body) addBodyLines(x.body[j].body);
      if (x.body[j].else) addBodyLines(x.body[j].else);
    }
  }

  let localsChanged = new Array(locals.length);
  if (lastDebugLocals) {
    localsChanged = locals.map((x, i) => x !== lastDebugLocals[i]);
  }

  let globalsChanged = new Array(globals.length);
  if (lastDebugGlobals) {
    globalsChanged = globals.map((x, i) => x.value !== lastDebugGlobals[i]);
  }

  const longestLocal = Math.max(0, ...Object.values(bc.porfFunc.invLocals).map((x, i) => \`\${x} (\${i})\`.length));
  const localsWidth = longestLocal + 2 + 8 + 1;

  const longestGlobal = Math.max(0, ...globals.map((x, i) => \`\${x.porfGlobalName} (\${i})\`.length));
  const globalsWidth = longestGlobal + 2 + 8 + 1;

  const width = Math.max(localsWidth, globalsWidth);

  // const longestStack = Math.max(5, ...stack.map(x => (+x).toString().length));
  // const stackWidth = longestStack + 2;

  switch (byg(
    paused,
    funcLines[currentFunc] + currentLine,
    '\x1b[1masur debugger\x1b[22m: ' + callStack.join(' -> ') + (parents.length > 1 ? \` | \${parents.slice(1).map(x => invOpcodes[x.opcode]).join(' -> ')}\` : ''),
    [
      {
        x: termWidth - 1 - width - 6,
        y: () => termHeight - Math.max(1, locals.length) - 1 - 4 - 3 - Math.max(1, stack.length) - (globals.length > 0 ? (globals.length + 4) : 0),
        width,
        height: Math.max(1, stack.length),
        title: 'stack',
        content: stack.map((x, i) => {
          const str = (+x).toString();
          return \`\\x1b[93m\${' '.repeat((width - str.length) / 2 | 0)}\${str}\`;
        })
      },
      {
        x: termWidth - 1 - width - 6,
        // x: termWidth / 3 | 0,
        y: () => termHeight - Math.max(1, locals.length) - 1 - 4 - (globals.length > 0 ? (globals.length + 4) : 0),
        // y: ({ currentLinePos }) => currentLinePos + locals.length + 4 > termHeight ? currentLinePos - locals.length - 2 : currentLinePos + 1,
        width,
        height: Math.max(1, locals.length),
        title: 'locals',
        content: locals.map((x, i) => {
          const changed = localsChanged[i];
          const valueLen = changed ? \`\${lastDebugLocals[i]} -> \${x}\`.length : x.toString().length;
          if (changed) x = \`\\x1b[30m\${lastDebugLocals[i]}\\x1b[90m -> \\x1b[31m\${x}\`;
          return \`\${changed ? '\\x1b[107m\\x1b[30m' : '\\x1b[100m\\x1b[37m\\x1b[1m'}\${bc.porfFunc.invLocals[i]}\${changed ? '\\x1b[90m' : '\\x1b[22m'} (\${i}) \${' '.repeat((width - 2 - 8 - 1 - \`\${bc.porfFunc.invLocals[i]} (\${i})\`.length) + 2 + (8 - valueLen))}\${changed ? '' : '\\x1b[93m'}\${x}\`;
        })
      },
      ...(globals.length > 0 ? [{
        x: termWidth - 1 - width - 6,
        // x: termWidth / 3 | 0,
        y: () => termHeight - globals.length - 1 - 4,
        width,
        height: globals.length,
        title: 'globals',
        content: globals.map((x, i) => {
          if (x.value == null) {
            x.value = run(x.bc, [], false)[0];
          }

          const changed = globalsChanged[i];
          const valueLen = changed ? \`\${lastDebugGlobals[i]} -> \${x.value}\`.length : x.value.toString().length;
          let display = x.value;
          if (changed) display = \`\\x1b[30m\${lastDebugGlobals[i]}\\x1b[90m -> \\x1b[31m\${x.value}\`;
          return \`\${changed ? '\\x1b[107m\\x1b[30m' : '\\x1b[100m\\x1b[37m\\x1b[1m'}\${x.porfGlobalName}\${changed ? '\\x1b[90m' : '\\x1b[22m'} (\${i}) \${' '.repeat((width - 2 - 8 - 1 - \`\${x.porfGlobalName} (\${i})\`.length) + 2 + (8 - valueLen))}\${changed ? '' : '\\x1b[93m'}\${display}\`;
        })
      }] : [])
    ]
  )) {
    case 'resume': {
      paused = false;
      break;
    }

    case 'stepOver': {
      break;
    }

    case 'stepIn': {
      stepIn = true;
      // paused = false;
      break;
    }

    case 'stepOut': {
      stepOut = true;
      paused = false;
      break;
    }
  }

  lastDebugLocals = locals.slice();
  lastDebugGlobals = globals.map(x => x.value).slice();
}`);

  str = str.replace('const outStack = run(callBC, locals);', `
const _paused = paused;
if (!stepIn) paused = false;
  else paused = true;

const outStack = run(callBC, locals);

paused = _paused;`);

  // (await import('fs')).writeFileSync('t.js', str);
  return _wasmDebugVm = eval(str);
});

export const instantiate = async (binary, importImpls) => {
  const _vm = process?.argv?.includes('--wasm-debug') ? await wasmDebugVm() : vm;

  const parsed = parse(binary);
  const exports = {};
  for (const { name, type, index } of parsed.exports) {
    if (type === 0x00) exports[name] = _vm(parsed, importImpls, index);
  }

  // console.log(parsed);

  return {
    instance: {
      exports
    }
  };
};