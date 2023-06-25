import compile from '../compiler/index.js';
import fs from 'node:fs';

/* if (globalThis.process) {
  const v8 = await import('node:v8');
  v8.setFlagsFromString('--experimental-wasm-gc');
} */

if (process.argv.includes('-raw')) {
  console.log = () => {};
}

const source = fs.readFileSync(process.argv.slice(2).filter(x => x[0] !== '-')[0], 'utf8');

const underline = x => `\u001b[4m\u001b[1m${x}\u001b[0m`;
const bold = x => `\u001b[1m${x}\u001b[0m`;

console.log(`\n${underline('source')}\n` + source);
console.log(`\n\n${underline('processing')}`);

const t0 = performance.now();
const wasm = compile(source);
console.log(bold(`compiled in ${(performance.now() - t0).toFixed(2)}ms`));

fs.writeFileSync('out.wasm', Buffer.from(wasm));

const print = str => process.stdout.write(str);

const t1 = performance.now();
const { instance } = await WebAssembly.instantiate(wasm, {
  '': {
    p: i => print(i.toString())
  }
});
console.log(`instantiated in ${(performance.now() - t1).toFixed(2)}ms\n\n${underline('output')}`);

const t2 = performance.now();
instance.exports.m();

console.log(bold(`\n\nexecuted in ${(performance.now() - t2).toFixed(2)}ms`));
console.log(bold(`wasm binary is ${wasm.byteLength} bytes`));
// console.log(`total: ${(performance.now() - t0).toFixed(2)}ms`);