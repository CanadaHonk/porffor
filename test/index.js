import fs from 'node:fs';
import compile from '../compiler/wrap.js';

// deno compat
const textEncoder = new TextEncoder();
if (typeof process === 'undefined') globalThis.process = { argv: ['', '', ...Deno.args], stdout: { write: str => Deno.writeAllSync(Deno.stdout, textEncoder.encode(str)) } };

let totalOutput = 0;
const run = async source => {
  let out = '', assertFailed = false;
  const print = str => out += str;

  const { exports, wasm, times } = await compile(source, [ 'module' ], {
    p: i => print(Number(i).toString()),
    c: i => print(String.fromCharCode(Number(i)))
  });

  totalOutput += wasm.byteLength;

  const t1 = performance.now();
  exports.main();
  times.push(performance.now() - t1);

  return [ out, assertFailed, times, wasm ];
};

const argv = process.argv.slice();
const perform = async (test, args) => {
  process.argv = argv.concat(args);
  const content = fs.readFileSync('test/' + test, 'utf8');
  const spl = content.split('\n');
  const expect = JSON.parse(spl[0].slice(2)).replaceAll('\\n', '\n');
  const code = spl.slice(1).join('\n');

  process.stdout.write(`\u001b[90m.... ${test}\u001b[0m ${args.join(' ')}\u001b[0m`);

  total++;

  const t1 = performance.now();
  let out, assertFailed, times, wasm;
  try {
    0, [ out, assertFailed, times, wasm ] = await run(code);
  } catch (e) {
    out = e.message ? `${e.constructor.name}: ${e.message}` : e;
    if (expect !== out) {
      process.stdout.write(`\r${' '.repeat(90)}\r`);
      console.log(`\u001b[91mFAIL ${test}\u001b[0m ${args.join(' ')}`);
      console.log(`  an error was thrown: ${e}\n`);
      return false;
    }
  }

  const time = performance.now() - t1;
  const pass = !assertFailed && out === expect;

  if (pass) passes++;

  process.stdout.write(`\r${' '.repeat(90)}\r`);
  console.log(`${pass ? '\u001b[92mPASS' : '\u001b[91mFAIL'} ${test}\u001b[0m ${args.join(' ')} ${' '.repeat(40 - test.length - args.join(' ').length)}\u001b[90m${time.toFixed(2)}ms ${times ? `(compile: ${times[0].toFixed(2)}ms, exec: ${times[1].toFixed(2)}ms)` : ''}${' '.repeat(10)}${wasm ? `${wasm.byteLength}b\u001b[0m` : ''}`);

  if (!pass) {
    if (out !== expect) console.log(`  expected: ${JSON.stringify(expect)}\n       got: ${JSON.stringify(out)}`);
    if (assertFailed) console.log(`  an assert failed`);
    console.log();
  }

  return pass;
};

const valtypeOpt = process.argv.find(x => x.startsWith('--valtype='));
const optOpt = process.argv.find(x => x.startsWith('-O'));

const t0 = performance.now();

// const argsValtypes = [ '-valtype=i32', '-valtype=i64', '-valtype=f64' ];
// const argsOptlevels = [ '-O0', '-O1', '-O2', '-O3' ];

const argsValtypes = [ '--valtype=f64' ];
const argsOptlevels = [ '-O1' ];

let total = 0, passes = 0;
for (const test of fs.readdirSync('test')) {
  if (test === 'index.js') continue;

  for (const x of argsValtypes) {
    if (test.startsWith('int_') && x.endsWith('f64')) continue;
    if (test.startsWith('float_') && !x.endsWith('f64')) continue;

    for (const y of argsOptlevels) {
      if ((!valtypeOpt || valtypeOpt === x) && (!optOpt || optOpt === y)) await perform(test, [ x, y ]);
    }
  }
}

console.log(`\u001b[1m\n${passes}/${total} tests passed (took ${(performance.now() - t0).toFixed(2)}ms)\u001b[0m`);
console.log(`total wasm binary output: ${totalOutput} bytes`);