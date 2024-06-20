import { encodeVector, encodeLocal } from './encoding.js';
import { importedFuncs } from './builtins.js';
import compile from './index.js';
import decompile from './decompile.js';
import { TYPES, TYPE_NAMES } from './types.js';
import { log } from './log.js';
import Prefs from './prefs.js';

const fs = (typeof process?.version !== 'undefined' ? (await import('node:fs')) : undefined);

const bold = x => `\u001b[1m${x}\u001b[0m`;

const checkOOB = (memory, ptr) => ptr >= memory.buffer.byteLength;

let dv;
const read = (ta, memory, ptr, length) => {
  if (ta === Uint8Array) return new Uint8Array(memory.buffer, ptr, length);
  return new ta(memory.buffer.slice(ptr, ptr + length * ta.BYTES_PER_ELEMENT), 0, length);
};

export const readByteStr = (memory, ptr) => {
  const length = read(Uint32Array, memory, ptr, 1)[0];
  return Array.from(read(Uint8Array, memory, ptr + 4, length)).map(x => String.fromCharCode(x)).join('');
};

export const writeByteStr = (memory, ptr, str) => {
  const length = str.length;

  if (dv.memory !== memory) dv = new DataView(memory.buffer);
  dv.setUint32(ptr, length, true);

  const arr = read(Uint8Array, memory, ptr + 4, length);
  for (let i = 0; i < length; i++) {
    arr[i] = str.charCodeAt(i);
  }
};

const porfToJSValue = ({ memory, funcs, pages }, value, type) => {
  switch (type) {
    case TYPES.empty:
    case TYPES.undefined:
      return undefined;

    case TYPES.boolean: return Boolean(value);
    case TYPES.object: {
      if (value === 0 || checkOOB(memory, value)) return null;

      const [ keysPtr, valsPtr ] = read(Uint32Array, memory, value, 2);
      if (checkOOB(memory, keysPtr) || checkOOB(memory, valsPtr)) return null;

      const size = read(Uint32Array, memory, keysPtr, 1);

      const out = {};
      for (let i = 0; i < size; i++) {
        const offset = 4 + (i * 9);

        const kValue = read(Float64Array, memory, keysPtr + offset, 1)[0];
        const kType = read(Uint8Array, memory, keysPtr + offset + 8, 1)[0];
        const k = porfToJSValue({ memory, funcs, pages }, kValue, kType);

        const vValue = read(Float64Array, memory, valsPtr + offset, 1)[0];
        const vType = read(Uint8Array, memory, valsPtr + offset + 8, 1)[0];
        const v = porfToJSValue({ memory, funcs, pages }, vValue, vType);

        out[k] = v;
      }

      return out;
    }

    case TYPES.function: {
      let func;
      if (value < 0) {
        func = importedFuncs[value + importedFuncs.length];
      } else {
        func = funcs.find(x => ((x.originalIndex ?? x.index) - importedFuncs.length) === value);
      }

      if (!func) return function () {};

      // make fake empty func for repl/etc
      return {[func.name]() {}}[func.name];
    }

    case TYPES.string: {
      const length = read(Uint32Array, memory, value, 1)[0];
      return Array.from(read(Uint16Array, memory, value + 4, length)).map(x => String.fromCharCode(x)).join('');
    }

    case TYPES.bytestring: {
      const length = read(Uint32Array, memory, value, 1)[0];
      return Array.from(read(Uint8Array, memory, value + 4, length)).map(x => String.fromCharCode(x)).join('');
    }

    case TYPES.array: {
      const length = read(Uint32Array, memory, value, 1)[0];

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
      const page = pages.get('array: symbol.ts/descStore');
      if (!page) return Symbol();

      const descStore = page.ind * pageSize;
      const offset = descStore + 4 + ((value - 1) * 9);

      const v = read(Float64Array, memory, offset, 1)[0];
      const t = read(Uint8Array, memory, offset + 8, 1)[0];

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
    case TYPES.float64array: {
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

    default: return value;
  }
};

export default (source, flags = [ 'module' ], customImports = {}, print = str => process.stdout.write(str)) => {
  const times = [];

  const t1 = performance.now();
  const { wasm, funcs, globals, tags, exceptions, pages, c } = typeof source === 'object' ? source : compile(source, flags);

  globalThis.porfDebugInfo = { funcs, globals };

  // if (process.argv[1].includes('/runner') && source.includes?.('export ')) flags.push('module');

  // fs.writeFileSync('out.wasm', Buffer.from(wasm));

  times.push(performance.now() - t1);
  if (Prefs.profileCompiler) console.log(bold(`compiled in ${times[0].toFixed(2)}ms`));

  const printDecomp = (middleIndex, func, funcs, globals, exceptions) => {
    console.log(`\x1B[35m\x1B[1mporffor backtrace\u001b[0m`);

    const strParams = func.params.map(v => invValtype[v]);
    const strReturns = func.returns.map(v => invValtype[v]);
    console.log(`\x1B[1m${func.name}\x1B[0m \x1B[90m(${strParams.join(', ')}) -> (${strReturns.join(', ')})\x1B[0m`);

    const surrounding = Prefs.backtraceSurrounding ?? 5;
    let min = middleIndex - surrounding;
    let max = middleIndex + surrounding + 1;
    if (Prefs.backtraceFunc || middleIndex == -1) {
      min = 0;
      max = func.wasm.length;
    }

    const decomp = decompile(func.wasm.slice(min, max), '', 0, func.locals, func.params, func.returns, funcs, globals, exceptions).slice(0, -1).split('\n');

    const noAnsi = s => s.replace(/\u001b\[[0-9]+m/g, '');
    let longest = 0;
    for (let j = 0; j < decomp.length; j++) {
      longest = Math.max(longest, noAnsi(decomp[j]).length);
    }

    if (middleIndex != -1) {
      const middle = Math.floor(decomp.length / 2);
      decomp[middle] = `\x1B[47m\x1B[30m${noAnsi(decomp[middle])}${'\u00a0'.repeat(longest - noAnsi(decomp[middle]).length)}\x1B[0m`;
    }

    if (min != 0) console.log('\x1B[90m...\x1B[0m');
    console.log(decomp.join('\n'));
    if (max > func.wasm.length) console.log('\x1B[90m...\x1B[0m\n');
  }

  const backtrace = (funcInd, blobOffset) => {
    if (funcInd == null || blobOffset == null ||
        Number.isNaN(funcInd) || Number.isNaN(blobOffset)) return false;

    // convert blob offset -> function wasm offset.
    // this is not good code and is somewhat duplicated
    // I just want it to work for debugging, I don't care about perf/yes
    const func = funcs.find(x => x.index === funcInd);
    if (!func) return false;

    const locals = Object.values(func.locals).sort((a, b) => a.idx - b.idx).slice(func.params.length).sort((a, b) => a.idx - b.idx);

    let localDecl = [], typeCount = 0, lastType;
    for (let i = 0; i < locals.length; i++) {
      const local = locals[i];
      if (i !== 0 && local.type !== lastType) {
        localDecl.push(encodeLocal(typeCount, lastType));
        typeCount = 0;
      }

      typeCount++;
      lastType = local.type;
    }

    if (typeCount !== 0) localDecl.push(encodeLocal(typeCount, lastType));

    const toFind = encodeVector(localDecl).concat(func.wasm.flat().filter(x => x != null && x <= 0xff).slice(0, 60));

    let i = 0;
    for (; i < wasm.length; i++) {
      let mismatch = false;
      for (let j = 0; j < toFind.length; j++) {
        if (wasm[i + j] !== toFind[j]) {
          mismatch = true;
          break;
        }
      }

      if (!mismatch) break;
    }

    if (i === wasm.length) {
      printDecomp(-1, func, funcs, globals, exceptions);
      return false;
    }

    const offset = (blobOffset - i) + encodeVector(localDecl).length;

    let cumLen = 0;
    i = 0;
    for (; i < func.wasm.length; i++) {
      cumLen += func.wasm[i].filter(x => x != null && x <= 0xff).length;
      if (cumLen === offset) break;
    }

    if (cumLen !== offset)  {
      printDecomp(-1, func, funcs, globals, exceptions);
      return false;
    }

    i -= 1;

    printDecomp(i, func, funcs, globals, exceptions);

    return true;
  };

  const t2 = performance.now();

  let instance;
  try {
    // let wasmEngine = WebAssembly;
    // if (Prefs.asur) {
    //   log.warning('wrap', 'using our !experimental! asur wasm engine instead of host to run');
    //   wasmEngine = await import('../asur/index.js');
    // }

    // 0, { instance } = await wasmEngine.instantiate(wasm, {
    const module = new WebAssembly.Module(wasm);
    instance = new WebAssembly.Instance(module, {
      '': {
        p: valtype === 'i64' ? i => print(Number(i).toString()) : i => print(i.toString()),
        c: valtype === 'i64' ? i => print(String.fromCharCode(Number(i))) : i => print(String.fromCharCode(i)),
        t: () => performance.now(),
        u: () => performance.timeOrigin,
        y: () => {},
        z: () => {},
        w: (ind, outPtr) => { // readArgv
          let args = process.argv.slice(2);
          args = args.slice(args.findIndex(x => !x.startsWith('-')) + 1);

          const str = args[ind - 1];
          if (!str) return -1;

          writeByteStr(memory, outPtr, str);
          return str.length;
        },
        q: (pathPtr, outPtr) => { // readFile
          try {
            const path = pathPtr === 0 ? 0 : readByteStr(memory, pathPtr);
            const contents = fs.readFileSync(path, 'utf8');
            writeByteStr(memory, outPtr, contents);
            return contents.length;
          } catch {
            return -1;
          }
        },
        b: () => {
          debugger;
        },
        ...customImports
      }
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
  if (Prefs.profileCompiler) console.log(`instantiated in ${times[1].toFixed(2)}ms`);

  const exports = {};
  const rawValues = Prefs.d;

  const exceptTag = instance.exports['0'], memory = instance.exports['$'];
  for (const x in instance.exports) {
    if (x === '0') continue;
    if (x === '$') {
      exports.$ = instance.exports.$;
      continue;
    }

    const name = x === 'm' ? 'main' : x;
    const func = funcs.find(x => x.name === name);

    const exp = instance.exports[x];
    exports[func.name] = exp;

    exports[func.name] = function() {
      try {
        const ret = exp.apply(this, arguments);
        if (ret == null) return undefined;

        if (rawValues) return { value: ret[0], type: ret[1], js: porfToJSValue({ memory, funcs, pages }, ret[0], ret[1]) };

        return porfToJSValue({ memory, funcs, pages }, ret[0], ret[1]);
      } catch (e) {
        if (e.is && e.is(exceptTag)) {
          const exceptionMode = Prefs.exceptionMode ?? 'lut';
          if (exceptionMode === 'lut') {
            const exceptId = e.getArg(exceptTag, 0);
            const exception = exceptions[exceptId];

            const constructorName = exception.constructor;

            // no constructor, just throw message
            if (!constructorName) throw exception.message;

            const constructor = globalThis[constructorName] ?? eval(`class ${constructorName} extends Error { constructor(message) { super(message); this.name = "${constructorName}"; } }; ${constructorName}`);
            throw new constructor(exception.message);
          }

          if (exceptionMode === 'stack') {
            const value = e.getArg(exceptTag, 0);
            const type = e.getArg(exceptTag, 1);

            throw porfToJSValue({ memory, funcs, pages }, value, type);
          }

          if (exceptionMode === 'stackest') {
            const constructorIdx = e.getArg(exceptTag, 0);
            const constructorName = constructorIdx == -1 ? null : funcs.find(x => ((x.originalIndex ?? x.index) - importedFuncs.length) === constructorIdx)?.name;

            const value = e.getArg(exceptTag, 1);
            const type = e.getArg(exceptTag, 2);
            const message = porfToJSValue({ memory, funcs, pages }, value, type);

            // no constructor, just throw message
            if (!constructorName) throw message;

            const constructor = globalThis[constructorName] ?? eval(`class ${constructorName} extends Error { constructor(message) { super(message); this.name = "${constructorName}"; } }; ${constructorName}`);
            throw new constructor(message);
          }

          if (exceptionMode === 'partial') {
            const exceptId = e.getArg(exceptTag, 0);
            const exception = exceptions[exceptId];

            const constructorName = exception.constructor;

            const value = e.getArg(exceptTag, 1);
            const type = e.getArg(exceptTag, 2);
            const message = porfToJSValue({ memory, funcs, pages }, value, type);

            // no constructor, just throw message
            if (!constructorName) throw message;

            const constructor = globalThis[constructorName] ?? eval(`class ${constructorName} extends Error { constructor(message) { super(message); this.name = "${constructorName}"; } }; ${constructorName}`);
            throw new constructor(message);
          }
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

  if (flags.includes('decomp')) {
    return { exports, wasm, times, decomps: funcs.map(x => decompile(x.wasm, x.name, x.index, x.locals, x.params, x.returns, funcs, globals, exceptions)), c };
  }

  return { exports, wasm, times, pages, c };
};