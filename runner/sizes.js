import compile from '../compiler/index.js';
import fs from 'node:fs';

// deno compat
const textEncoder = new TextEncoder();
if (typeof process === 'undefined') globalThis.process = { argv: ['', '', ...Deno.args], stdout: { write: str => Deno.writeAllSync(Deno.stdout, textEncoder.encode(str)) } };

let csv = `file,porffor i32 -O0,porffor i32 -O1,porffor i32 -O2,porffor i32 -O3,porffor i64 -O0,porffor i64 -O1,porffor i64 -O2,porffor i64 -O3,porffor f64 -O0, porffor f64 -O1, porffor f64 -O2, porffor f64 -O3\n`;
const perform = async (file, args) => {
  process.argv = process.argv.slice(0, 2).concat(args);
  const source = fs.readFileSync(file, 'utf8');

  const { wasm } = compile(source, []);
  const size = wasm.byteLength;

  const label = `${file} ${args.join(' ')}`;
  csv += `${size},`;
  console.log(label, ' '.repeat(40 - label.length), `${size}b`);
};

const argsValtypes = [ '--valtype=i32', '--valtype=f64' ];
const argsOptlevels = [ '-O0', '-O1', '-O2', '-O3' ];

for (const file of [ 'bench/prime_basic.js', 'bench/fib_iter.js', 'test/math_1.js', 'test/math_3.js', 'test/while_1.js', 'test/for_2.js', 'test/unary_3.js', 'test/updateexp_1.js', 'test/eq_3.js', 'test/empty.js' ]) {
  const niceFile = file.split('/')[1].slice(0, -3);
  csv += `${niceFile},`;

  for (const x of argsValtypes) {
    for (const y of argsOptlevels) {
      await perform(file, [ x, y ]);
    }
  }

  csv = csv.slice(0, -1) + '\n';
}

fs.writeFileSync('sizes.csv', csv);
console.log(csv);