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

for (const test of fs.readdirSync('test')) {
  const content = fs.readFileSync('test/' + test, 'utf8');
  const spl = content.split('\n');
  const expect = spl[0].slice(2).trim();
  const code = spl.slice(1).join('\n');

  const out = await run(code);
  const pass = out === expect;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${test}`);
}