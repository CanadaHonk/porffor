import compile from './index.js';
import decompile from './decompile.js';
// import fs from 'node:fs';

const bold = x => `\u001b[1m${x}\u001b[0m`;

export default async (source, flags = [ 'module' ], customImports = {}, print = str => process.stdout.write(str)) => {
  const times = [];

  const t1 = performance.now();
  const { wasm, funcs, globals, tags, exceptions } = compile(source, flags);

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

  const exceptTag = instance.exports['0'];
  for (const x in instance.exports) {
    if (x === '0') continue;

    const name = x === 'm' ? 'main' : x;
    const func = funcs.find(x => x.name === name);

    const exp = instance.exports[x];
    exports[func.name] = exp;

    if (func.throws) {
      exports[func.name] = function() {
        try {
          return exp.apply(this, arguments);
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
  }

  if (flags.includes('decomp')) {
    return { exports, wasm, times, decomps: funcs.map(x => decompile(x.wasm, x.name, x.index, x.locals, x.params, x.returns, funcs, globals, exceptions)) };
  }

  return { exports, wasm, times };
};