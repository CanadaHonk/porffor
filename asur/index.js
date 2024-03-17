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
    exports = [],
    globals = [],
    codes = [];

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

        globals[i] = { valtype, mutable, init };
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

        const locals = [];

        const localsLength = unsignedLEB128();
        for (let j = 0; j < localsLength; j++) {
          const count = unsignedLEB128();
          const type = read();

          for (let k = 0; k < count; k++) locals.push(type);
        }

        const bytesLeft = end - offset;
        const wasm = new Array(bytesLeft);
        for (let j = 0; j < bytesLeft; j++) wasm[j] = read();

        codes[i] = { locals, wasm };
      }

      continue;
    }

    if (section === 11) { // data

    }
  }

  return { types, imports, funcs, globals, exports, codes };
};

const inv = (obj, keyMap = x => x) => Object.keys(obj).reduce((acc, x) => { acc[keyMap(obj[x])] = x; return acc; }, {});
const Opcodes = (await import('../compiler/wasmSpec.js')).Opcodes;
const invOpcodes = inv(Opcodes, x => {
  if (typeof x === 'number') return x;
  return (x[0] << 8) + x[1];
});

const vm = ({ types, imports, funcs, globals, exports, codes }, importImpls, startFunc) => {
  const constCache = {};
  const skipCache = {};

  const run = (activeFunc, params = [], setup = true) => {
    let locals = [];
    if (setup) {
      const activeCode = codes[activeFunc - imports.length];

      input = activeCode.wasm; // active code
      offset = 0; // PC

      locals = new Array(activeCode.locals.length).fill(0);

      for (let i = 0; i < params.length; i++) locals[i] = params[i];
    }

    if (!constCache[activeFunc]) constCache[activeFunc] = {};
    if (!skipCache[activeFunc]) skipCache[activeFunc] = {};

    let stack = [];

    let depth = 0;

    let skipStart = 0;
    let skipUntilEnd = 0;
    let skipUntilElse = 0;
    let loopStarts = [];
    let rets = [];

    while (true) {
      let opcode = read();

      const skip = skipUntilEnd !== 0 || skipUntilElse !== 0;

      if (opcode === 0xfc) { // multibyte op
        opcode = (opcode << 8) + read();
      }

      // console.log((skip ? '\x1B[90m' : '') + ' '.repeat(depth * 2) + invOpcodes[opcode] + '\x1B[0m', stack, depth);

      const blockStart = (loop) => {
        const returns = read();
        rets.push(returns !== 0x40);

        loopStarts.push(loop ? offset : null);

        depth++;
      };

      const skipEnd = until => {
        if (skipCache[activeFunc][offset]) {
          offset = skipCache[activeFunc][offset];
        } else {
          skipUntilEnd = until;
          skipStart = offset;
        }
      };

      const skipElse = until => {
        skipUntilElse = until;

        if (skipCache[activeFunc][offset]) {
          offset = skipCache[activeFunc][offset];
        } else {
          skipStart = offset;
        }
      };

      const br = n => {
        const ind = depth - n - 1;

        // depth -= n;
        if (loopStarts[ind]) {
          depth -= n;

          if (n === 0) {

          } else if (n === 1) {
            loopStarts.pop();
            rets.pop();
          } else {
            // loopStarts.splice(loopStarts.length - n - 1, n);
            // rets.splice(rets.length - n - 1, n);
            loopStarts = loopStarts.slice(0, depth);
            rets = rets.slice(0, depth);
          }

          // // loopStarts.splice(loopStarts.length - n - 1, n);
          // // rets.splice(rets.length - n - 1, n);
          // loopStarts = loopStarts.slice(0, depth);
          // rets = rets.slice(0, depth);

          offset = loopStarts[ind];
        } else skipEnd(depth);

        // if (rets[ind]) stack
      };

      switch (opcode) {
        case 0x00: { // unreachable
          if (skip) break;
          throw new Error('unreachable');
        }

        case 0x01: { // nop
          break;
        }

        case 0x02: { // block
          blockStart(false);
          break;
        }

        case 0x03: { // loop
          blockStart(true);
          break;
        }

        case 0x04: { // if
          blockStart(false);
          if (skip) break;

          const cond = stack.pop();
          if (cond) {

          } else skipElse(depth); // skip to else

          break;
        }

        case 0x05: { // else
          if (skipUntilElse === depth) { // were skipping to else, stop skip
            skipUntilElse = 0;

            if (!skipCache[activeFunc][skipStart]) {
              // skipCache[activeFunc][skipStart] = offset - 1;
            }
          } else { // were running consequent, skip else
            if (!skip) skipEnd(depth);
          }

          break;
        }

        case 0x0b: { // end
          if (depth === 0) return stack;

          // were skipping to here, stop skip
          if (skipUntilElse === depth || skipUntilEnd === depth) {
            skipUntilElse = 0;
            skipUntilEnd = 0;

            if (!skipCache[activeFunc][skipStart]) {
              // skipCache[activeFunc][skipStart] = offset - 1;
            }
          }

          depth--;

          rets.pop();
          loopStarts.pop();

          break;
        }

        case 0x0c: { // br
          if (skip) {
            read();
            break;
          }

          br(read());
          break;
        }

        case 0x0d: { // br_if
          if (skip) {
            read();
            break;
          }

          const n = read();

          if (stack.pop()) br(n);

          break;
        }

        case 0x0f: { // return
          if (skip) break;

          return stack;
        }

        case 0x10: { // call
          if (skip) {
            read();
            break;
          }

          // const func = unsignedLEB128();
          const func = read();

          if (func < imports.length) {
            const mod = imports[func].module;
            const name = imports[func].name;

            const type = types[imports[func].typeIdx];

            const paramCount = type.params.length;

            const params = new Array(paramCount);
            for (let i = 0; i < paramCount; i++) params[i] = stack.pop();

            const ret = importImpls[mod][name](...params);

            if (type.returns.length > 0) stack.push(ret);

            break;
          }

          const type = types[funcs[func - imports.length]];
          const paramCount = type.params.length;

          const params = new Array(paramCount);

          if (paramCount === 0) {}
            else if (paramCount === 1) params[0] = stack.pop();
            else if (paramCount === 2) { params[1] = stack.pop(); params[0] = stack.pop(); }
            else for (let i = paramCount - 1; i >= 0; i--) params[i] = stack.pop();

          // for (let i = paramCount - 1; i >= 0; i--) params[i] = stack.pop();

          const _input = input;
          const _offset = offset;

          const outStack = run(func, params);
          stack.push(...outStack);
          // while (outStack.length > 0) stack.push(outStack.pop());
          // stack = stack.concat(outStack);

          input = _input;
          offset = _offset;

          break;
        }

        case 0x1a: { // drop
          if (skip) break;

          stack.pop();
          break;
        }

        case 0x20: { // local.get
          if (skip) {
            read();
            break;
          }

          // stack.push(locals[unsignedLEB128()]);
          // stack.push(locals[input[offset++]]);
          stack.push(locals[read()]);
          break;
        }

        case 0x21: { // local.set
          if (skip) {
            read();
            break;
          }

          // locals[unsignedLEB128()] = stack.pop();
          locals[read()] = stack.pop();
          break;
        }

        case 0x22: { // local.tee
          if (skip) {
            read();
            break;
          }

          // stack.push(locals[unsignedLEB128()] = stack.pop());
          stack.push(locals[read()] = stack.pop());
          break;
        }

        case 0x23: { // global.get
          if (skip) {
            read();
            break;
          }

          const ind = read();
          if (globals[ind].value == null) {
            const _input = input;
            const _offset = offset;

            input = globals[ind].init;
            offset = 0;

            globals[ind].value = run(null, [], false)[0];

            input = _input;
            offset = _offset;
          }

          // stack.push(globals[unsignedLEB128()]);
          stack.push(globals[ind].value);
          break;
        }

        case 0x24: { // global.set
          if (skip) {
            read();
            break;
          }

          // globals[unsignedLEB128()] = stack.pop();
          globals[read()].value = stack.pop();
          break;
        }

        case 0x41: { // i32.const
          if (skip) {
            signedLEB128();
            break;
          }

          stack.push(signedLEB128());
          break;
        }
        case 0x42: { // i64.const
          if (skip) {
            signedLEB128();
            break;
          }

          stack.push(signedLEB128());
          break;
        }
        case 0x44: { // f64.const
          if (skip) {
            offset += 8;
            break;
          }

          if (constCache[activeFunc][offset] != null) {
            stack.push(constCache[activeFunc][offset]);
            offset += 8;
            break;
          }

          const val = ieee754();
          constCache[activeFunc][offset - 8] = val;
          stack.push(val);
          break;
        }

        case 0x45: { // i32_eqz
          if (skip) break;

          stack.push(stack.pop() === 0);
          break;
        }
        case 0x46: { // i32_eq
          if (skip) break;

          stack.push(stack.pop() === stack.pop());
          break;
        }
        case 0x47: { // i32_ne
          if (skip) break;

          stack.push(stack.pop() !== stack.pop());
          break;
        }
        case 0x48: { // i32.lt_s
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a < b);
          break;
        }
        case 0x4c: { // i32.le_s
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a <= b);
          break;
        }
        case 0x4a: { // i32.gt_s
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a > b);
          break;
        }
        case 0x4e: { // i32_ge_s
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a >= b);
          break;
        }

        case 0x6a: { // i32_add
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a + b);
          break;
        }
        case 0x6b: { // i32_sub
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a - b);
          break;
        }
        case 0x6c: { // i32_mul
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a * b);
          break;
        }
        case 0x6d: { // i32_div_s
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a / b);
          break;
        }
        case 0x6f: { // i32_rem_s
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a % b);
          break;
        }

        case 0x71: { // i32_and
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a & b);
          break;
        }
        case 0x72: { // i32_or
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a | b);
          break;
        }
        case 0x73: { // i32_xor
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a ^ b);
          break;
        }
        case 0x74: { // i32_shl
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a << b);
          break;
        }
        case 0x75: { // i32_shr_s
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a >> b);
          break;
        }
        case 0x76: { // i32_shr_u
          if (skip) break;

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
          if (skip) break;

          stack.push(stack.pop() === stack.pop());
          break;
        }
        case 0x62: { // f64_ne
          if (skip) break;

          stack.push(stack.pop() !== stack.pop());
          break;
        }

        case 0x63: { // f64_lt
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a < b);
          break;
        }
        case 0x65: { // f64_le
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a <= b);
          break;
        }
        case 0x64: { // f64_gt
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a > b);
          break;
        }
        case 0x66: { // f64_ge
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a >= b);
          break;
        }

        case 0x99: { // f64_abs
          if (skip) break;

          stack.push(Math.abs(stack.pop()));
          break;
        }
        case 0x9a: { // f64_neg
          if (skip) break;

          stack.push(stack.pop() * -1);
          break;
        }

        case 0x9b: { // f64_ceil
          if (skip) break;

          stack.push(Math.ceil(stack.pop()));
          break;
        }
        case 0x9c: { // f64_floor
          if (skip) break;

          stack.push(Math.floor(stack.pop()));
          break;
        }
        case 0x9d: { // f64_trunc
          if (skip) break;

          stack.push(stack.pop() | 0);
          break;
        }
        case 0x9e: { // f64_nearest
          if (skip) break;

          stack.push(Math.round(stack.pop()));
          break;
        }

        case 0x9f: { // f64_sqrt
          if (skip) break;

          stack.push(Math.sqrt(stack.pop()));
          break;
        }
        case 0xa0: { // f64_add
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a + b);
          break;
        }
        case 0xa1: { // f64_sub
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a - b);
          break;
        }
        case 0xa2: { // f64_mul
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a * b);
          break;
        }
        case 0xa3: { // f64_div
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a / b);
          break;
        }
        case 0xa4: { // f64_min
          if (skip) break;

          const b = stack.pop();
          const a = stack.pop();
          stack.push(a > b ? b : a);
          break;
        }
        case 0xa5: { // f64_max
          if (skip) break;

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
          console.log(activeFunc, offset, input.length, depth);
          throw new Error(`unimplemented op: 0x${opcode?.toString(16)}`);
        }
      }
    }
  };

  return (...args) => run(startFunc, args);
};

export const instantiate = async (binary, importImpls) => {
  const parsed = parse(binary);
  const exports = {};
  for (const { name, type, index } of parsed.exports) {
    if (type === 0x00) exports[name] = vm(parsed, importImpls, index);
  }

  return {
    instance: {
      exports
    }
  };
};