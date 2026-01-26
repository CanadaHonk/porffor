import { importedFuncs, createImport } from './builtins.js';
import compile from './index.js';
import disassemble from './disassemble.js';
import { TYPES, TYPE_NAMES } from './types.js';
import './prefs.js';

const fs = (typeof process?.version !== 'undefined' ? (await import('node:fs')) : undefined);

let dv;
const read = (ta, memory, ptr, length) => {
  if (ta === Uint8Array) return new Uint8Array(memory.buffer, ptr, length);
  return new ta(memory.buffer.slice(ptr, ptr + length * ta.BYTES_PER_ELEMENT), 0, length);
};

const readByteStr = (memory, ptr) => {
  const length = read(Uint32Array, memory, ptr, 1)[0];
  return Array.from(read(Uint8Array, memory, ptr + 4, length)).map(x => String.fromCharCode(x)).join('');
};

const writeByteStr = (memory, ptr, str) => {
  const length = str.length;

  if (dv?.memory !== memory) dv = new DataView(memory.buffer);
  dv.setUint32(ptr, length, true);

  const arr = read(Uint8Array, memory, ptr + 4, length);
  for (let i = 0; i < length; i++) {
    arr[i] = str.charCodeAt(i);
  }
};

const porfToJSValue = ({ memory, funcs, pages }, value, type, override = undefined) => {
  switch (type) {
    case TYPES.undefined:
      return undefined;

    case TYPES.number: return value;
    case TYPES.numberobject: return new Number(value);

    case TYPES.boolean: return Boolean(value);
    case TYPES.booleanobject: return new Boolean(value);

    case TYPES.object: {
      if (value === 0) return null;

      const size = read(Uint16Array, memory, value, 1)[0];

      const out = {};
      for (let i = 0; i < size; i++) {
        const offset = 8 + (i * 18) + 4;

        const kRaw = read(Uint32Array, memory, value + offset, 1)[0];
        let kType = TYPES.bytestring;
        switch (kRaw >>> 30) {
          case 2:
            kType = TYPES.string;
            break;

          case 3:
            kType = TYPES.symbol;
            break;
        }

        const kValue = kRaw & 0x3fffffff;
        const k = porfToJSValue({ memory, funcs, pages }, kValue, kType);

        const tail = read(Uint16Array, memory, value + offset + 12, 1)[0];

        const vValue = read(Float64Array, memory, value + offset + 4, 1)[0];
        const vType = tail >>> 8;

        // do not recursive call forever for direct circular
        const v = vValue === value && vType === type ? out :
          porfToJSValue({ memory, funcs, pages }, vValue, vType);

        const flags = tail & 0xff;
        const accessor = flags & 0b0001;

        let get, set;
        if (accessor) {
          0, [ get, set ] = read(Uint32Array, memory, value + offset + 4, 2);
        }

        if (Prefs.d) {
          const readMem = (ptr, size) => [...read(Uint8Array, memory, ptr, size)].map(x => x.toString(16).padStart(2, '0')).join(' ');

          console.log(`\x1b[4m\x1b[1m${k}\x1b[0m \x1B[90m(${TYPE_NAMES[kType]}) | ${kValue} (${readMem(value + offset, 4)})\x1B[0m
  value: \x1B[92m${v}\x1B[0m \x1B[90m(${TYPE_NAMES[vType]}) | ${vValue} (${readMem(value + offset + 4, 8)})\x1B[0m
${flags & 0b0001 ? `    get func idx: ${get}
    set func idx: ${set}
` : ''}  flags: 0b\x1B[93m${flags.toString(2).padStart(4, '0')}\x1B[0m\x1B[90m ${readMem(value + offset + 12, 2)}
    accessor: ${!!(flags & 0b0001)}
    configurable: ${!!(flags & 0b0010)}
    enumerable: ${!!(flags & 0b0100)}
    writable: ${!!(flags & 0b1000)}
\x1B[0m`);
        }

        const configurable = flags & 0b0010;
        const enumerable = flags & 0b0100;

        if (accessor) {
          // mock get/set funcs
          Object.defineProperty(out, k, {
            get: () => {},
            set: () => {},
            configurable,
            enumerable,
          });
        } else {
          Object.defineProperty(out, k, {
            value: v,
            configurable,
            enumerable,
          });
        }
      }

      return out;
    }

    case TYPES.function: {
      let func;
      if (value < 0) {
        func = importedFuncs[value + importedFuncs.length];
      } else {
        func = funcs.find(x => x.wrapperFunc?.indirectIndex === value);
      }

      if (!func) return function () {};

      let name = func.name;
      // eg: __String_prototype_toLowerCase -> toLowerCase
      if (name.startsWith('__')) name = name.split('_').pop();

      // anonymous functions
      if (name.startsWith('#')) name = '';

      // make fake empty func for repl/etc
      return {[name]() {}}[name];
    }

    case TYPES.string: {
      const length = read(Uint32Array, memory, value, 1)[0];
      return Array.from(read(Uint16Array, memory, value + 4, length)).map(x => String.fromCharCode(x)).join('');
    }

    case TYPES.bytestring: {
      const length = read(Uint32Array, memory, value, 1)[0];
      return Array.from(read(Uint8Array, memory, value + 4, length)).map(x => String.fromCharCode(x)).join('');
    }

    case TYPES.stringobject: return new String(porfToJSValue({ memory, funcs, pages }, value, TYPES.string));

    case TYPES.array: {
      let length = read(Uint32Array, memory, value, 1)[0];
      if (override) length = override;

      const out = [];
      for (let i = 0; i < length; i++) {
        const offset = value + 4 + (i * 9);

        const v = read(Float64Array, memory, offset, 1)[0];
        const t = read(Uint8Array, memory, offset + 8, 1)[0];

        out.push(porfToJSValue({ memory, funcs, pages }, v, t));
      }

      return out;
    }

    case TYPES.date: {
      const t = read(Float64Array, memory, value, 1)[0];
      return new Date(t);
    }

    case TYPES.symbol: {
      const v = read(Float64Array, memory, value, 1)[0];
      const t = read(Uint8Array, memory, value + 8, 1)[0];

      const desc = porfToJSValue({ memory, funcs, pages }, v, t);
      return Symbol(desc);
    }

    case TYPES.arraybuffer: {
      const length = read(Uint32Array, memory, value, 1)[0];
      if (length === 4294967295) {
        // mock detached
        const buf = new ArrayBuffer(0);
        if (buf.detached != null) buf.transfer();
          else buf.detached = true;
        return buf;
      }
      return memory.buffer.slice(value + 4, value + 4 + length);
    }

    case TYPES.sharedarraybuffer: {
      const length = read(Uint32Array, memory, value, 1)[0];
      const buf = memory.buffer.slice(value + 4, value + 4 + length);
      buf.shared = true;
      return buf;
    }

    case TYPES.dataview: {
      const [ length, ptr, byteOffset ] = read(Uint32Array, memory, value, 3);
      const bufferPtr = ptr - byteOffset;
      const bufferLen = read(Uint32Array, memory, bufferPtr, 1)[0];
      const buffer = memory.buffer.slice(bufferPtr + 4, bufferPtr + 4 + bufferLen);
      return new DataView(buffer, byteOffset, length);
    }

    case TYPES.uint8array:
    case TYPES.int8array:
    case TYPES.uint8clampedarray:
    case TYPES.uint16array:
    case TYPES.int16array:
    case TYPES.uint32array:
    case TYPES.int32array:
    case TYPES.float32array:
    case TYPES.float64array:
    case TYPES.bigint64array:
    case TYPES.biguint64array: {
      const [ length, ptr ] = read(Uint32Array, memory, value, 2);
      return read(globalThis[TYPE_NAMES[type]], memory, ptr + 4, length);
    }

    case TYPES.weakref: {
      const v = read(Float64Array, memory, value, 1)[0];
      const t = read(Uint8Array, memory, value + 8, 1)[0];

      return new WeakRef(porfToJSValue({ memory, funcs, pages }, v, t));
    }

    case TYPES.weakset:
    case TYPES.set: {
      const size = read(Uint32Array, memory, value, 1)[0];

      const out = type === TYPES.weakset ? new WeakSet() : new Set();
      for (let i = 0; i < size; i++) {
        const offset = value + 4 + (i * 9);
        const v = read(Float64Array, memory, offset, 1)[0];
        const t = read(Uint8Array, memory, offset + 8, 1)[0];

        out.add(porfToJSValue({ memory, funcs, pages }, v, t));
      }

      return out;
    }

    case TYPES.weakmap:
    case TYPES.map: {
      const [ keysPtr, valsPtr ] = read(Uint32Array, memory, value, 2);
      const size = read(Uint32Array, memory, keysPtr, 1)[0];

      const out = type === TYPES.weakmap ? new WeakMap() : new Map();
      for (let i = 0; i < size; i++) {
        const offset = 4 + (i * 9);

        const kValue = read(Float64Array, memory, keysPtr + offset, 1)[0];
        const kType = read(Uint8Array, memory, keysPtr + offset + 8, 1)[0];
        const k = porfToJSValue({ memory, funcs, pages }, kValue, kType);

        const vValue = read(Float64Array, memory, valsPtr + offset, 1)[0];
        const vType = read(Uint8Array, memory, valsPtr + offset + 8, 1)[0];
        const v = porfToJSValue({ memory, funcs, pages }, vValue, vType);

        out.set(k, v);
      }

      return out;
    }

    case TYPES.promise: {
      const [ result, _state, fulfillReactions, rejectReactions ] = porfToJSValue({ memory, funcs, pages }, value, TYPES.array, 4);

      const state = ({
        0: 'pending',
        1: 'fulfilled',
        2: 'rejected'
      })[_state];
      const stateColor = ({
        0: '\x1B[93m',
        1: '\x1B[32m',
        2: '\x1B[31m'
      })[_state];

      const out = { state, result };
      Object.defineProperty(out, Symbol.for('nodejs.util.inspect.custom'), {
        value(depth, opts, inspect) {
          return `${opts.colors ? '\x1B[36m' : ''}Promise${opts.colors ? '\x1B[0m' : ''} (state: ${opts.colors ? stateColor : ''}<${state}>${opts.colors ? '\x1B[0m' : ''}, result: ${inspect(result, opts)})`;
        }
      });

      return out;
    }

    case TYPES.error:
    case TYPES.aggregateerror:
    case TYPES.typeerror:
    case TYPES.referenceerror:
    case TYPES.syntaxerror:
    case TYPES.rangeerror:
    case TYPES.evalerror:
    case TYPES.urierror:
    case TYPES.test262error: {
      const message = porfToJSValue({ memory, funcs, pages }, read(Uint32Array, memory, value, 1)[0], read(Uint8Array, memory, value + 4, 1)[0]);
      const name = TYPE_NAMES[type];
      const err = new (globalThis[name] ?? Error)(message);

      err.name = name;
      err.stack = `${name}: ${message}`;
      return err;
    }

    case TYPES.__porffor_generator: {
      const values = porfToJSValue({ memory, funcs, pages }, value, TYPES.array);

      const out = { values };
      Object.defineProperty(out, Symbol.for('nodejs.util.inspect.custom'), {
        value(depth, opts, inspect) {
          return `${opts.colors ? '\x1B[36m' : ''}Generator${opts.colors ? '\x1B[0m' : ''} ()`;
        }
      });

      return out;
    }

    case TYPES.bigint: {
      if (Math.abs(value) < 0x8000000000000) {
        return BigInt(value);
      }
      value -= 0x8000000000000;

      const negative = read(Uint8Array, memory, value, 1)[0] !== 0;
      const len = read(Uint16Array, memory, value + 2, 1)[0];
      const digits = read(Uint32Array, memory, value + 4, len);

      if (Prefs.d) console.log(digits);

      let result = 0n;
      for (let i = 0; i < digits.length; i++) {
        result = result * 0x100000000n + BigInt(digits[i]);
      }
      return negative ? -result : result;
    }

    case TYPES.regexp: {
      const [ pattern ] = read(Uint32Array, memory, value, 1);
      const [ flags ] = read(Uint16Array, memory, value + 4, 1);

      if (Prefs.d) {
        const bc = new Uint8Array(memory.buffer.slice(value + 10));
        let i = 0;
        while (true) {
          const opcode = bc[i++];
          if (opcode === 0x00) break;
          process.stdout.write(`\x1b[90m${`@${i - 1}`.padEnd(6)}\x1b[0m`);

          switch (opcode) {
            case 0x01: {
              const char = bc[i++];
              console.log('\x1b[36msingle\x1b[0m', String.fromCharCode(char));
              break;
            }

            case 0x02:
            case 0x03: {
              const length = bc[i++];
              const negated = opcode === 0x03;
              console.log(`\x1b[31m${negated ? 'negated ' : ''}class\x1b[0m\x1b[2m:\x1b[0m`);
              classLoop: while (true) {
                const itemcode = bc[i++];
                switch (itemcode) {
                  case 0x00: {
                    const from = bc[i + 1];
                    const to = bc[i + 2];
                    console.log('        \x1b[36mrange\x1b[0m', String.fromCharCode(from), '\x1b[2m-\x1b[0m', String.fromCharCode(to));
                    break;
                  }
                  case 0x01: {
                    const char = bc[i + 1];
                    console.log('        \x1b[36mchar\x1b[0m', String.fromCharCode(char));
                    break;
                  }
                  case 0x02: {
                    const id = bc[i + 1];
                    console.log('        \x1b[36mpredef\x1b[0m', id);
                    break;
                  }
                  case 0xff: {
                    break classLoop;
                  }
                }
                i += 3;
              }
              break;
            }

            case 0x04: {
              const id = bc[i++];
              console.log('\x1b[36mpredef\x1b[0m', id);
              break;
            }

            case 0x05:
            case 0x06:
            case 0x07:
            case 0x08:
            case 0x09: {
              console.log(`${({
                0x05: 'start',
                0x06: 'end',
                0x07: 'word boundary',
                0x08: 'non-word boundary',
                0x09: 'dot'
              })[opcode]}`);
              break;
            }

            case 0x0a: {
              const index = bc[i++];
              console.log(`backref ${index}`);
              break;
            }

            case 0x0b: {
              const [ target ] = read(Int16Array, bc, i, 1);
              i += 2;
              console.log('\x1b[93mpositive lookahead\x1b[0m', target, `\x1b[2m(${i + target - 3})\x1b[0m`);
              break;
            }
            case 0x0c: {
              const [ target ] = read(Int16Array, bc, i, 1);
              i += 2;
              console.log('\x1b[93mnegative lookahead\x1b[0m', target, `\x1b[2m(${i + target - 3})\x1b[0m`);
              break;
            }

            case 0x10: {
              console.log('\x1b[92maccept\x1b[0m');
              break;
            }
            case 0x11: {
              console.log('\x1b[91mreject\x1b[0m');
              break;
            }

            case 0x20: {
              const [ target ] = read(Int16Array, bc, i, 1);
              i += 2;
              console.log('\x1b[93mjump\x1b[0m', target, `\x1b[2m(${i + target - 3})\x1b[0m`);
              break;
            }

            case 0x21: {
              const [ branch1, branch2 ] = read(Int16Array, bc, i, 2);
              i += 4;
              console.log('\x1b[93mfork\x1b[0m', branch1, `\x1b[2m(${i + branch1 - 5})\x1b[0m`, branch2, `\x1b[2m(${i + branch2 - 5})\x1b[0m`);
              break;
            }

            case 0x30:
            case 0x31: {
              const index = bc[i++];
              console.log(`\x1b[2m${opcode === 0x30 ? 'start' : 'end'} capture ${index}\x1b[0m`);
              break;
            }
          }
        }
      }

      let flagStr = '';
      if (flags & 0b01000000) flagStr += 'd';
      if (flags & 0b00000001) flagStr += 'g';
      if (flags & 0b00000010) flagStr += 'i';
      if (flags & 0b00000100) flagStr += 'm';
      if (flags & 0b00001000) flagStr += 's';
      if (flags & 0b00010000) flagStr += 'u';
      if (flags & 0b10000000) flagStr += 'v';
      if (flags & 0b00100000) flagStr += 'y';

      return new RegExp(
        porfToJSValue({ memory, funcs, pages }, pattern, TYPES.bytestring),
        flagStr
      );
    }

    default: return value;
  }
};

export { createImport };

/**
 * Compile given JavaScript source code. // todo: more docs here (sorry)
 *
 * @param {string} source - JavaScript source code to compile
 * @param {boolean} module - If the source is a module or not (default: false)
 * @param {(str: string) => void} print - Function to use for printing (used by console.log etc)
 */
export default (source, module = undefined, print = str => process.stdout.write(str)) => {
  createImport('print', 1, 0, i => print(i.toString()));
  createImport('printChar', 1, 0, i => print(String.fromCharCode(i)));
  createImport('time', 0, 1, () => performance.now());
  createImport('timeOrigin', 0, 1, () => performance.timeOrigin);

  const times = [];

  const t1 = performance.now();
  const { wasm, funcs, globals, tags, exceptions, pages, c } = typeof source === 'object' ? source : compile(source, module);

  times.push(performance.now() - t1);
  if (Prefs.profileCompiler && !globalThis.onProgress) console.log(`\u001b[1mcompiled in ${times[0].toFixed(2)}ms\u001b[0m`);

  const printBacktrace = (middleIndex, func, funcs, globals, exceptions) => {
    console.log(`\x1B[35m\x1B[1mporffor backtrace\u001b[0m`);

    const surrounding = Prefs.backtraceSurrounding ?? 10;
    let min = middleIndex - surrounding;
    let max = middleIndex + surrounding + 1;
    if (Prefs.backtraceFunc || middleIndex === -1) {
      min = 0;
      max = func.wasm.length;
    }

    const disasm = disassemble(func.wasm.slice(min, max), func.name, 0, func.locals, func.params, func.returns, funcs, globals, exceptions)
      .slice(0, -1).split('\n').filter(x => !x.startsWith('\x1B[2m;;'));

    const noAnsi = s => s && s.replace(/\u001b\[[0-9]+m/g, '');
    let longest = 0;
    for (let j = 0; j < disasm.length; j++) {
      longest = Math.max(longest, noAnsi(disasm[j])?.length ?? 0);
    }

    if (middleIndex !== -1) {
      const middle = Math.floor(disasm.length / 2);
      disasm[middle] = `\x1B[47m\x1B[30m${noAnsi(disasm[middle])}${'\u00a0'.repeat(longest - noAnsi(disasm[middle]).length)}\x1B[0m`;
    }

    if (min != 0) console.log('\x1B[2m...\x1B[0m');
    console.log(disasm.join('\n'));
    if (max > func.wasm.length) console.log('\x1B[2m...\x1B[0m\n');
  };

  const backtrace = (funcInd, blobOffset) => {
    if (funcInd == null || blobOffset == null ||
        Number.isNaN(funcInd) || Number.isNaN(blobOffset) || Prefs.backtrace === false) return false;

    const func = funcs.find(x => (x.index - importDelta) === funcInd);
    if (!func) return false;

    printBacktrace(-1, func, funcs, globals, exceptions);
    return false;
  };

  const t2 = performance.now();

  let instance;
  try {
    const module = new WebAssembly.Module(wasm);
    instance = new WebAssembly.Instance(module, {
      '': Object.keys(importedFuncs).reduce((acc, y) => {
        const x = importedFuncs[y];
        if (!x.import) return acc;

        acc[x.import] = x.js ?? (() => {});
        return acc;
      }, {})
    });
  } catch (e) {
    if (!Prefs.d) throw e;
    if (!(e instanceof WebAssembly.CompileError)) throw e;

    const funcInd = parseInt(e.message.match(/function #([0-9]+)/)?.[1]);
    const blobOffset = parseInt(e.message.split('@')?.[1]);

    backtrace(funcInd, blobOffset);
    throw e;
  }

  times.push(performance.now() - t2);
  if (Prefs.profileCompiler) {
    if (globalThis.onProgress) globalThis.onProgress('instantiated', times[1]);
      else console.log(`instantiated in ${times[1].toFixed(2)}ms`);
  }

  const exports = {};
  const rawValues = Prefs.d;

  const exceptTag = instance.exports['0'], memory = instance.exports['$'];
  for (const x in instance.exports) {
    if (x === '0') continue;
    if (x === '$') {
      exports.$ = instance.exports.$;
      continue;
    }

    const wasm = instance.exports[x];
    exports[x === 'm' ? 'main' : x] = function() {
      try {
        const ret = wasm.apply(this, arguments);
        if (ret == null) return undefined;

        if (rawValues) return { value: ret[0], type: ret[1], js: porfToJSValue({ memory, funcs, pages }, ret[0], ret[1]) };

        return porfToJSValue({ memory, funcs, pages }, ret[0], ret[1]);
      } catch (e) {
        if (e.is && e.is(exceptTag)) {
          const exceptionMode = Prefs.exceptionMode ?? 'stack';
          if (exceptionMode === 'lut') {
            const exceptId = e.getArg(exceptTag, 0);
            const { constructor, message } = exceptions[exceptId];

            // no constructor, just throw message
            if (!constructor) throw message;

            const err = new Error(message);
            err.name = constructor;
            err.stack = `${constructor}: ${message}`;
            return err;
          }

          const value = e.getArg(exceptTag, 0);
          const type = e.getArg(exceptTag, 1);

          throw porfToJSValue({ memory, funcs, pages }, value, type);
        }

        if (e instanceof WebAssembly.RuntimeError) {
          if (!Prefs.d) throw e;

          const match = e.stack.match(/wasm-function\[([0-9]+)\]:([0-9a-z]+)/) ?? [];
          const funcInd = parseInt(match[1]);
          const blobOffset = parseInt(match[2]);

          backtrace(funcInd, blobOffset);
        }

        throw e;
      }
    };
  }

  if (Prefs.disassemble) {
    return { exports, wasm, times, disasms: funcs.map(x => disassemble(x.wasm, x.name, x.index, x.locals, x.params, x.returns, funcs, globals, exceptions)), c };
  }

  return { exports, wasm, times, pages, c };
};