import { Bench } from 'tinybench';
import { withCodSpeed } from '@codspeed/tinybench-plugin';

const bench = withCodSpeed(new Bench());

import { readFileSync } from 'node:fs';
import compile from '../compiler/wrap.js';

const argv = process.argv.slice();

const files = [ 'richards.js' ];
const prefVariants = [ '', '-O0', '--no-coctc' ];
for (const file of files) {
  for (const prefs of prefVariants) {
    let run;
    bench.add((file + ' ' + prefs).trim(), () => {
      run();
    }, {
      beforeEach: () => {
        // fresh compile for each run
        process.argv = (argv.join(' ') + ' ' + prefs).trim().split(' ');
        globalThis.argvChanged();

        run = compile(readFileSync('bench/' + file, 'utf8')).exports.main;
      }
    });
  }
}

await bench.run();
console.table(bench.table());