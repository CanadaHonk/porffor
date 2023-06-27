import compile from '../compiler/index.js';
import fs from 'node:fs';

let csv = `phase,time\n`;

csv += `node,${performance.now()}\n`;

const t0 = performance.now();
const file = process.argv.slice(2).find(x => x[0] !== '-');
const source = fs.readFileSync(file, 'utf8');
csv += `read,${performance.now() - t0}\n`;

console.log = x => {
  if (x.includes(' in ')) {
    csv += [ 'parse', 'codegen', 'opt', 'sections' ][parseInt(x[0]) - 1] + ',' + x.split(' in ')[1].slice(0, -2) + '\n';
  }
};

const wasm = compile(source, [ 'info' ]);

let cache = '';
const print = str => {
  cache += str;

  if (str === '\n') {
    process.stdout.write(cache);
    cache = '';
  }
};

const t1 = performance.now();
const { instance } = await WebAssembly.instantiate(wasm, {
  '': {
    p: i => print(Number(i).toString()),
    c: i => print(String.fromCharCode(Number(i))),
    a: c => { if (!Number(c)) throw new Error(`assert failed`); }
  }
});
csv += `inst,${performance.now() - t1}\n`;

const t2 = performance.now();
instance.exports.m();
print('\n');

csv += `exec,${performance.now() - t2}`;

fs.writeFileSync(`profile.csv`, csv);