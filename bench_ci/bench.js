import Benchmark from 'benchmark';
import compile from '../compiler/wrap.js';
import { countPrimes, randoms } from './index.js';

const suite = new Benchmark.Suite();

const funcs = [ countPrimes, randoms ];
const max = 10000;
for (const x of funcs) {
  suite.add(`node ${x.name}(${max})`, () => {
    x(max);
  });

  const compiled = (await compile('export ' + x.toString())).exports[x.name];

  suite.add(`porffor(default) ${x.name}(${max})`, () => {
    compiled(max);
  });

  process.argv.push('-valtype=i32');
  const compiledI32 = (await compile('export ' + x.toString())).exports[x.name];
  process.argv.pop();

  suite.add(`porffor(i32) ${x.name}(${max})`, () => {
    compiledI32(max);
  });
}

suite
  .on('cycle', (event) => {
    console.log(String(event.target));
  })
  .run();