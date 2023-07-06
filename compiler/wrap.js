import compile from './index.js';
import decompile from './decompile.js';

const bold = x => `\u001b[1m${x}\u001b[0m`;

export default async (source, flags = [], customImports = {}, print = str => process.stdout.write(str)) => {
  const times = [];

  const t1 = performance.now();
  const { wasm, funcs, globals, tags, exceptions } = compile(source, flags.concat([ 'metadata' ]));

  times.push(performance.now() - t1);
  if (flags.includes('info')) console.log(bold(`compiled in ${times[0].toFixed(2)}ms`));

  const t2 = performance.now();
  const { instance } = await WebAssembly.instantiate(wasm, {
    '': {
      p: i => valtype === 'i64' ? print(Number(i).toString()) : print(i.toString()),
      c: i => valtype === 'i64' ? print(String.fromCharCode(Number(i))) : print(String.fromCharCode(i)),
      a: c => { if (!Number(c)) throw new Error(`assert failed`); },
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
          if (e.is(exceptTag)) {
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
    return { exports, wasm, times, decomps: funcs.map(x => decompile(x.wasm, x.name, x.index, x.locals, x.params, x.returns, funcs, exceptions)) };
  }

  return { exports, wasm, times };
};