import compile from './index.js';
import decompile from './decompile.js';
// import fs from 'node:fs';

const bold = x => `\u001b[1m${x}\u001b[0m`;

const PageSize = 65536;
const typeBase = 0xffffffffffff0;
const TYPES = {
  [typeBase]: 'number',
  [typeBase + 1]: 'boolean',
  [typeBase + 2]: 'string',
  [typeBase + 3]: 'undefined',
  [typeBase + 4]: 'object',
  [typeBase + 5]: 'function',
  [typeBase + 6]: 'symbol',
  [typeBase + 7]: 'bigint',

  // internal
  [typeBase + 8]: '_array'
};

export default async (source, flags = [ 'module' ], customImports = {}, print = str => process.stdout.write(str)) => {
  const times = [];

  const t1 = performance.now();
  const { wasm, funcs, globals, tags, exceptions } = compile(source, flags);

  if (source.includes('export function')) flags.push('module');

  // fs.writeFileSync('out.wasm', Buffer.from(wasm));

  times.push(performance.now() - t1);
  if (flags.includes('info')) console.log(bold(`compiled in ${times[0].toFixed(2)}ms`));

  const t2 = performance.now();
  const { instance } = await WebAssembly.instantiate(wasm, {
    '': {
      p: valtype === 'i64' ? i => print(Number(i).toString()) : i => print(i.toString()),
      c: valtype === 'i64' ? i => print(String.fromCharCode(Number(i))) : i => print(String.fromCharCode(i)),
      a: c => { if (!Number(c)) throw new Error(`assert failed`); },
      t: _ => performance.now(),
      ...customImports
    }
  });

  times.push(performance.now() - t2);
  if (flags.includes('info')) console.log(`instantiated in ${times[1].toFixed(2)}ms`);

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
        const ret = exp.apply(this, arguments);

        if (ret >= typeBase && ret <= typeBase + 8) return ret > (typeBase + 7) ? 'object' : TYPES[ret];

        switch (TYPES[func.returnType]) {
          case 'boolean': return Boolean(ret);
          case 'undefined': return undefined;
          case 'object': return ret === 0 ? null : {};

          case '_array': {
            const [ page, length ] = ret;

            return Array.from(new Float64Array(memory.buffer, page * PageSize, length));
          }

          case 'string': {
            const [ page, length ] = ret;

            return Array.from(new Uint16Array(memory.buffer, page * PageSize, length)).map(x => String.fromCharCode(x)).join('');
          }

          default: return ret;
        }
      } catch (e) {
        if (e.is && e.is(exceptTag)) {
          const exceptId = e.getArg(exceptTag, 0);
          const exception = exceptions[exceptId];

          const constructorName = exception.constructor ?? 'Error';
          const constructor = globalThis[constructorName] ?? eval(`class ${constructorName} extends Error { constructor(message) { super(message); this.name = "${constructorName}"; } }; ${constructorName}`);

          throw new constructor(exception.message);
        }

        throw e;
      }
    };
  }

  if (flags.includes('decomp')) {
    return { exports, wasm, times, decomps: funcs.map(x => decompile(x.wasm, x.name, x.index, x.locals, x.params, x.returns, funcs, globals, exceptions)) };
  }

  return { exports, wasm, times };
};