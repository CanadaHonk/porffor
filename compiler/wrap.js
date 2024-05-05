import compile from './index.js';
import decompile from './decompile.js';
import { encodeVector, encodeLocal } from './encoding.js';
import Prefs from './prefs.js';
import { log } from './log.js';
import { TYPES } from './types.js';

const bold = x => `\u001b[1m${x}\u001b[0m`;

export default async (source, flags = [ 'module' ], customImports = {}, print = str => process.stdout.write(str)) => {
  const times = [];

  const t1 = performance.now();
  const { wasm, funcs, globals, tags, exceptions, pages, c } = compile(source, flags);

  globalThis.porfDebugInfo = { funcs, globals };

  if (source.includes('export function')) flags.push('module');

  // (await import('node:fs')).writeFileSync('out.wasm', Buffer.from(wasm));

  times.push(performance.now() - t1);
  if (Prefs.profileCompiler) console.log(bold(`compiled in ${times[0].toFixed(2)}ms`));

  const t2 = performance.now();

  let instance;
  try {
    let wasmEngine = WebAssembly;
    if (Prefs.asur) {
      log.warning('wrap', 'using our !experimental! asur wasm engine instead of host to run');
      wasmEngine = await import('../asur/index.js');
    }

    0, { instance } = await wasmEngine.instantiate(wasm, {
      '': {
        p: valtype === 'i64' ? i => print(Number(i).toString()) : i => print(i.toString()),
        c: valtype === 'i64' ? i => print(String.fromCharCode(Number(i))) : i => print(String.fromCharCode(i)),
        t: () => performance.now(),
        y: () => {},
        z: () => {},
        ...customImports
      }
    });
  } catch (e) {
    // only backtrace for runner, not test262/etc
    if (!process.argv[1].includes('/runner')) throw e;

    const funcInd = parseInt(e.message.match(/function #([0-9]+) /)?.[1]);
    const blobOffset = parseInt(e.message.split('@')?.[1]);

    if (!funcInd) throw e;

    // convert blob offset -> function wasm offset.
    // this is not good code and is somewhat duplicated
    // I just want it to work for debugging, I don't care about perf/yes

    const func = funcs.find(x => x.index === funcInd);
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

    const toFind = encodeVector(localDecl).concat(func.wasm.flat().filter(x => x != null && x <= 0xff).slice(0, 40));

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

    if (i === wasm.length) throw e;

    const offset = (blobOffset - i) + encodeVector(localDecl).length;

    let cumLen = 0;
    i = 0;
    for (; i < func.wasm.length; i++) {
      cumLen += func.wasm[i].filter(x => x != null && x <= 0xff).length;
      if (cumLen === offset) break;
    }

    if (cumLen !== offset) throw e;

    i -= 1;

    console.log(`\x1B[35m\x1B[1mporffor backtrace\u001b[0m`);

    console.log('\x1B[4m' + func.name + '\x1B[0m');

    const surrounding = 6;

    const decomp = decompile(func.wasm.slice(i - surrounding, i + surrounding + 1), '', 0, func.locals, func.params, func.returns, funcs, globals, exceptions).slice(0, -1).split('\n');

    const noAnsi = s => s.replace(/\u001b\[[0-9]+m/g, '');
    let longest = 0;
    for (let j = 0; j < decomp.length; j++) {
      longest = Math.max(longest, noAnsi(decomp[j]).length);
    }

    const middle = Math.floor(decomp.length / 2);
    decomp[middle] = `\x1B[47m\x1B[30m${noAnsi(decomp[middle])}${'\u00a0'.repeat(longest - noAnsi(decomp[middle]).length)}\x1B[0m`;

    console.log('\x1B[90m...\x1B[0m');
    console.log(decomp.join('\n'));
    console.log('\x1B[90m...\x1B[0m\n');

    throw e;
  }

  times.push(performance.now() - t2);
  if (Prefs.profileCompiler) console.log(`instantiated in ${times[1].toFixed(2)}ms`);

  const exports = {};

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
        const _ret = exp.apply(this, arguments);

        if (_ret == null) return undefined;

        const [ ret, type ] = _ret;

        // if (ret >= typeBase && ret <= typeBase + 8) return ret > (typeBase + 7) ? 'object' : TYPES[ret];

        switch (type) {
          case TYPES.boolean: return Boolean(ret);
          case TYPES.undefined: return undefined;
          case TYPES.object: return ret === 0 ? null : {};

          case TYPES.string: {
            const pointer = ret;
            const length = new Int32Array(memory.buffer, pointer, 1);

            return Array.from(new Uint16Array(memory.buffer, pointer + 4, length)).map(x => String.fromCharCode(x)).join('');
          }

          case TYPES.function: {
            // wasm func index, including all imports
            const func = funcs.find(x => (x.originalIndex ?? x.index) === ret);
            // if (!func) return ret;
            if (!func) return function () {};

            // make fake empty func for repl/etc
            return {[func.name]() {}}[func.name];
          }

          case TYPES._array: {
            const pointer = ret;
            const length = new Int32Array(memory.buffer, pointer, 1);

            // have to slice because of memory alignment
            const buf = memory.buffer.slice(pointer + 4, pointer + 4 + 8 * length);

            return Array.from(new Float64Array(buf));
          }

          case TYPES._bytestring: {
            const pointer = ret;
            const length = new Int32Array(memory.buffer, pointer, 1);

            return Array.from(new Uint8Array(memory.buffer, pointer + 4, length)).map(x => String.fromCharCode(x)).join('');
          }

          case TYPES._date: {
            // todo
            throw new Error('todo! deserialize date');
          }

          default: return ret;
        }
      } catch (e) {
        if (e.is && e.is(exceptTag)) {
          const exceptId = e.getArg(exceptTag, 0);
          const exception = exceptions[exceptId];

          const constructorName = exception.constructor;

          // no constructor, just throw message
          if (!constructorName) throw exception.message;

          const constructor = globalThis[constructorName] ?? eval(`class ${constructorName} extends Error { constructor(message) { super(message); this.name = "${constructorName}"; } }; ${constructorName}`);
          throw new constructor(exception.message);
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