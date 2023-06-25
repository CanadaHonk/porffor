import fs from 'node:fs';
import compile from '../compiler/index.js';

const run = async source => {
  const wasm = compile(source);

  let out = '';
  const print = str => out += str;

  const { instance } = await WebAssembly.instantiate(wasm, {
    '': {
      p: i => print(i.toString())
    }
  });

  instance.exports.m();

  return out;
};

const t0 = performance.now();

let total = 0, passes = 0;
for (const test of fs.readdirSync('test')) {
  if (test === 'index.js') continue;
  const content = fs.readFileSync('test/' + test, 'utf8');
  const spl = content.split('\n');
  const expect = spl[0].slice(2).trim();
  const code = spl.slice(1).join('\n');

  const out = await run(code);
  const pass = out === expect;

  total++;
  if (pass) passes++;

  console.log(`${pass ? '\u001b[92mPASS' : '\u001b[91mFAIL'} ${test}\u001b[0m`);

  if (!pass) {
    console.log(`  got: ${out}\n  expected: ${expect}\n`);
  }
}

console.log(`\u001b[1m\n${passes}/${total} tests passed (took ${(performance.now() - t0).toFixed(2)}ms)\u001b[0m`);