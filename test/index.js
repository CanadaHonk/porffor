import fs from 'node:fs';
import compile from '../compiler/index.js';

// deno compat
const textEncoder = new TextEncoder();
if (typeof process === 'undefined') globalThis.process = { argv: ['', '', ...Deno.args], stdout: { write: str => Deno.writeAllSync(Deno.stdout, textEncoder.encode(str)) } };

let totalOutput = 0;
const run = async source => {
  const times = [];

  // const compile = (await import('../compiler/index.js')).default;
  const t0 = performance.now();
  const wasm = compile(source);
  times.push(performance.now() - t0);

  // fs.writeFileSync('out.wasm', Buffer.from(wasm));

  totalOutput += wasm.byteLength;

  let out = '', assertFailed = false;
  const print = str => out += str;

  const { instance } = await WebAssembly.instantiate(wasm, {
    '': {
      p: i => print(Number(i).toString()),
      c: i => print(String.fromCharCode(Number(i))),
      a: c => { if (!Number(c)) assertFailed = true; }
    }
  });

  const t1 = performance.now();
  instance.exports.m();
  times.push(performance.now() - t1);

  return [ out, assertFailed, times, wasm ];
};

const perform = async (test, args) => {
  process.argv = process.argv.slice(0, 2).concat(args);
  const content = fs.readFileSync('test/' + test, 'utf8');
  const spl = content.split('\n');
  const expect = JSON.parse(spl[0].slice(2)).replaceAll('\\n', '\n');
  const code = spl.slice(1).join('\n');

  // process.stdout.write(`\u001b[90m.... ${test}\u001b[0m ${args.join(' ')}\u001b[0m`);

  total++;

  const t1 = performance.now();
  let out, assertFailed, times, wasm;
  try {
    0, [ out, assertFailed, times, wasm ] = await run(code);
  } catch (e) {
    console.log(`\u001b[91mFAIL ${test}\u001b[0m ${args.join(' ')}`);
    console.log(`  an error was thrown: ${e}\n`);
    return false;
  }

  const time = performance.now() - t1;
  const pass = !assertFailed && out === expect;

  if (pass) passes++;

  process.stdout.write(`\r${' '.repeat(90)}\r`);
  console.log(`${pass ? '\u001b[92mPASS' : '\u001b[91mFAIL'} ${test}\u001b[0m ${args.join(' ')} ${' '.repeat(40 - test.length - args.join(' ').length)}\u001b[90m${time.toFixed(2)}ms (compile: ${times[0].toFixed(2)}ms, exec: ${times[1].toFixed(2)}ms)${' '.repeat(10)}${wasm.byteLength}b\u001b[0m`);

  if (!pass) {
    if (out !== expect) console.log(`  expected: ${JSON.stringify(expect)}\n       got: ${JSON.stringify(out)}`);
    if (assertFailed) console.log(`  an assert failed`);
    console.log();
  }

  return pass;
};

const t0 = performance.now();

const argsValtypes = [ '-valtype=i64' ];
const argsOptlevels = [ '-O0', '-O1', '-O2' ];

let total = 0, passes = 0;
for (const test of fs.readdirSync('test')) {
  if (test === 'index.js') continue;
  await perform(test, []);

  for (const x of argsOptlevels) {
    await perform(test, [ x ]);
  }

  for (const x of argsValtypes) {
    await perform(test, [ x ]);

    for (const y of argsOptlevels) {
      await perform(test, [ x, y ]);
    }
  }
}

console.log(`\u001b[1m\n${passes}/${total} tests passed (took ${(performance.now() - t0).toFixed(2)}ms)\u001b[0m`);
console.log(`total wasm binary output: ${totalOutput} bytes`);