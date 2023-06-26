import fs from 'node:fs';

// deno compat
const textEncoder = new TextEncoder();
if (typeof process === 'undefined') globalThis.process = { argv: ['', '', ...Deno.args], stdout: { write: str => Deno.writeAllSync(Deno.stdout, textEncoder.encode(str)) } };

let totalOutput = 0;
const run = async source => {
  const times = [];

  const compile = (await import('../compiler/index.js')).default;
  const t0 = performance.now();
  const wasm = compile(source);
  times.push(performance.now() - t0);

  // fs.writeFileSync('out.wasm', Buffer.from(wasm));

  totalOutput += wasm.byteLength;

  let out = '';
  const print = str => out += str;

  const { instance } = await WebAssembly.instantiate(wasm, {
    '': {
      p: i => print(Number(i).toString()),
      c: i => print(String.fromCharCode(Number(i)))
    }
  });

  const t1 = performance.now();
  instance.exports.m();
  times.push(performance.now() - t1);

  return [ out, times, wasm ];
};

const perform = async (test, args) => {
  process.argv = process.argv.slice(0, 2).concat(args);
  const content = fs.readFileSync('test/' + test, 'utf8');
  const spl = content.split('\n');
  const expect = spl[0].slice(2).trim().replaceAll('\\n', '\n');
  const code = spl.slice(1).join('\n');

  const t1 = performance.now();
  let [ out, times, wasm ] = await run(code);
  out = out.trim();
  const time = performance.now() - t1;
  const pass = out === expect;

  total++;
  if (pass) passes++;

  console.log(`${pass ? '\u001b[92mPASS' : '\u001b[91mFAIL'} ${test}\u001b[0m ${args.join(' ')} ${' '.repeat(40 - test.length - args.join(' ').length)}\u001b[90m${time.toFixed(2)}ms (compile: ${times[0].toFixed(2)}ms, exec: ${times[1].toFixed(2)}ms)${' '.repeat(10)}${wasm.byteLength}b\u001b[0m`);

  if (!pass) {
    console.log(`expected: ${expect}\n     got: ${out}\n`);
  }

  return pass;
};

const t0 = performance.now();

let total = 0, passes = 0;
for (const test of fs.readdirSync('test')) {
  if (test === 'index.js') continue;
  await perform(test, []);
  await perform(test, [ '-valtype=i64' ]);
  // await perform(test, [ '-valtype=f64' ]);
  await perform(test, [ '-O0' ]);
  // await perform(test, [ '-O1' ]);
  // await perform(test, [ '-O2' ]);
}

console.log(`\u001b[1m\n${passes}/${total} tests passed (took ${(performance.now() - t0).toFixed(2)}ms)\u001b[0m`);
console.log(`total wasm binary output: ${totalOutput} bytes`);