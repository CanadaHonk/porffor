import compile from '../compiler/wrap.js';
import fs from 'node:fs';

/* if (globalThis.process) {
  const v8 = await import('node:v8');
  v8.setFlagsFromString('--experimental-wasm-gc');
} */

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

let cache = '';
const print = str => {
  cache += str;

  if (str === '\n') {
    process.stdout.write(cache);
    cache = '';
  }
};

const t0 = performance.now();
const { wasm, exports } = await compile(source, raw ? [] : [ 'info' ], {}, print);

if (!raw && typeof Deno === 'undefined') fs.writeFileSync('out.wasm', Buffer.from(wasm));

if (!process.argv.includes('-no-run')) {
  console.log(`\n\n${underline('output')}`);
  const t2 = performance.now();

  exports.main();
  print('\n');

  if (!raw) console.log(bold(`\n\nexecuted in ${(performance.now() - t2).toFixed(2)}ms`));
}

if (!raw) console.log(bold(`wasm binary is ${wasm.byteLength} bytes`));
if (!raw) console.log(`total: ${(performance.now() - t0).toFixed(2)}ms`);