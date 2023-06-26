import compile from '../compiler/index.js';
import fs from 'node:fs';

/* if (globalThis.process) {
  const v8 = await import('node:v8');
  v8.setFlagsFromString('--experimental-wasm-gc');
} */

// deno compat
const raw = process.argv.includes('-raw');

const file = process.argv.slice(2).find(x => x[0] !== '-');
if (!file) {
  // run repl if no file given
  await import('./repl.js');

  // do nothing for the rest of this file
  await new Promise(() => {});
}

const source = fs.readFileSync(file, 'utf8');

const underline = x => `\u001b[4m\u001b[1m${x}\u001b[0m`;
const bold = x => `\u001b[1m${x}\u001b[0m`;

if (!raw) console.log(`\n${underline('source')}\n` + source);
if (!raw) console.log(`\n\n${underline('processing')}`);

const t0 = performance.now();
const wasm = compile(source, raw ? [] : [ 'info' ]);
if (!raw) console.log(bold(`compiled in ${(performance.now() - t0).toFixed(2)}ms`));

if (!raw && typeof Deno === 'undefined') fs.writeFileSync('out.wasm', Buffer.from(wasm));

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
    c: i => print(String.fromCharCode(Number(i)))
  }
});
if (!raw) console.log(`instantiated in ${(performance.now() - t1).toFixed(2)}ms\n\n${underline('output')}`);

if (!process.argv.includes('-no-run')) {
  const t2 = performance.now();
  instance.exports.m();

  print('\n');

  if (!raw) console.log(bold(`\n\nexecuted in ${(performance.now() - t2).toFixed(2)}ms`));
}

if (!raw) console.log(bold(`wasm binary is ${wasm.byteLength} bytes`));
if (!raw) console.log(`total: ${(performance.now() - t0).toFixed(2)}ms`);