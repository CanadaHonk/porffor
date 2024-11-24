import { Bench } from 'tinybench';
import { withCodSpeed } from '@codspeed/tinybench-plugin';

const bench = withCodSpeed(new Bench());

import { readFileSync } from 'node:fs';
import compile from '../compiler/wrap.js';

const files = [ 'richards.js' ];
for (const file of files) {
  let run;
  bench.add(file, () => {
    run();
  }, {
    beforeEach: () => {
      run = compile(readFileSync('bench/' + file, 'utf8')).exports.main;
    }
  });
}

await bench.run();
console.table(bench.table());