import Benchmark from 'benchmark';
import compile from '../compiler/wrap.js';
import { countPrimes, randoms, factorial, recursiveFib, iterativeFib } from './index.js';

const suite = new Benchmark.Suite();

const maxes = [ 10000, 100000, 100, 45, 45 ];
const funcs = [ countPrimes, randoms, factorial, recursiveFib, iterativeFib ];
for (let i = 0; i < funcs.length; i++) {
  const func = funcs[i];
  const max = maxes[i];

  suite.add(`node ${func.name}(${max})`, () => {
    func(max);
  });

  const compiled = (await compile('export ' + func.toString())).exports[func.name];

  suite.add(`porffor(default) ${func.name}(${max})`, () => {
    compiled(max);
  });

  try {
    if (['factorial'].includes(func.name)) throw 'overflow';

    process.argv.push('-valtype=i32');
    const compiledI32 = (await compile('export ' + func.toString())).exports[func.name];
    process.argv.pop();

    suite.add(`porffor(i32) ${func.name}(${max})`, () => {
      compiledI32(max);
    });
  } catch {
    // ignore as some things are unsupported in i32 mode
  }
}

suite
  .on('cycle', (event) => {
    console.log(String(event.target));
  })
  .run();