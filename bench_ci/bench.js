import Benchmark from 'benchmark';
import compile from '../compiler/wrap.js';
import { countPrimes, randoms } from './index.js';

const suite = new Benchmark.Suite();

const funcs = [ countPrimes, randoms ];
const max = 10000;
for (const x of funcs) {
  const compiled = (await compile('export ' + x.toString())).exports[x.name];

  suite.add(`node ${x.name}(${max})`, () => {
    x(max);
  });

  suite.add(`porffor ${x.name}(${max})`, () => {
    compiled(max);
  });
}

suite
  .on('cycle', (event) => {
    console.log(String(event.target));
  })
  .run();