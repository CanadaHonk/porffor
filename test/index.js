import fs from 'node:fs';
import compile from '../compiler/index.js';

let totalOutput = 0;
const run = async source => {
  const times = [];

  const t0 = performance.now();
  const wasm = compile(source);
  times.push(performance.now() - t0);

  totalOutput += wasm.byteLength;

  let out = '';
  const print = str => out += str;

  const { instance } = await WebAssembly.instantiate(wasm, {
    '': {
      p: i => print(i.toString())
    }
  });

  const t1 = performance.now();
  instance.exports.m();
  times.push(performance.now() - t1);

  return [ out, times, wasm ];
};

const t0 = performance.now();

let total = 0, passes = 0;
for (const test of fs.readdirSync('test')) {
  if (test === 'index.js') continue;
  const content = fs.readFileSync('test/' + test, 'utf8');
  const spl = content.split('\n');
  const expect = spl[0].slice(2).trim();
  const code = spl.slice(1).join('\n');

  const t1 = performance.now();
  const [ out, times, wasm ] = await run(code);
  const time = performance.now() - t1;
  const pass = out === expect;

  total++;
  if (pass) passes++;

  console.log(`${pass ? '\u001b[92mPASS' : '\u001b[91mFAIL'} ${test}\u001b[0m ${' '.repeat(30 - test.length)}\u001b[90m${time.toFixed(2)}ms (compile: ${times[0].toFixed(2)}ms, exec: ${times[1].toFixed(2)}ms)${' '.repeat(10)}${wasm.byteLength}b\u001b[0m`);

  if (!pass) {
    console.log(`expected: ${expect}\n  got: ${out}\n`);
  }
}

console.log(`\u001b[1m\n${passes}/${total} tests passed (took ${(performance.now() - t0).toFixed(2)}ms)\u001b[0m`);
console.log(`total wasm binary output: ${totalOutput} bytes`);