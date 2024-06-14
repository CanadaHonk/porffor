#!/usr/bin/env node
import fs from 'node:fs';
globalThis.version = '0.19.1+d33e35f0b';

// deno compat
if (typeof process === 'undefined' && typeof Deno !== 'undefined') {
  globalThis.process = await import('node:process');
}

const start = performance.now();

if (process.argv.includes('--compile-hints')) {
  const v8 = await import('node:v8');
  v8.setFlagsFromString(`--experimental-wasm-compilation-hints`);

  // see also these flags:
  // --experimental-wasm-branch-hinting
  // --experimental-wasm-extended-const
  // --experimental-wasm-inlining (?)
  // --experimental-wasm-js-inlining (?)
  // --experimental-wasm-return-call (on by default)
}

if (process.argv.includes('--help')) {
  // description + version
  console.log(`\x1B[1m\x1B[35mPorffor\x1B[0m is a JavaScript engine/runtime/compiler. \x1B[90m(${globalThis.version})\x1B[0m`);

  // basic usage
  console.log(`Usage: \x1B[1mporf [command] path/to/script.js [...prefs] [...args]\x1B[0m`);

  // commands
  console.log(`\n\x1B[1mCommands:\x1B[0m`);
  for (const [ cmd, [ color, desc ] ] of Object.entries({
    run: [ 34, 'Run a JS file' ],
    wasm: [ 34, 'Compile a JS file to a Wasm binary\n' ],
    c: [ 31, 'Compile a JS file to C source code' ],
    native: [ 31, 'Compile a JS file to a native binary\n' ],
    profile: [ 33, 'Profile a JS file' ],
    debug: [ 33, 'Debug a JS file' ],
    'debug-wasm': [ 33, 'Debug the compiled Wasm of a JS file' ]
  })) {
    console.log(`  \x1B[1m\x1B[${color}m${cmd}\x1B[0m${' '.repeat(20 - cmd.length - (desc.startsWith('🧪') ? 3 : 0))}${desc}`);
  }

  // console.log();

  // // options
  // console.log(`\n\u001b[4mCommands\x1B[0m`);
  // for (const [ cmd, [ color, desc ] ] of Object.entries({
  //   run: [ 34, 'Run a JS file' ],
  //   wasm: [ 34, 'Compile a JS file to a Wasm binary\n' ],
  //   c: [ 31, 'Compile a JS file to C source code' ],
  //   native: [ 31, 'Compile a JS file to a native binary\n' ],
  //   profile: [ 33, 'Profile a JS file' ],
  //   debug: [ 33, 'Debug a JS file' ],
  //   'debug-wasm': [ 33, 'Debug the compiled Wasm of a JS file' ]
  // })) {
  //   console.log(`  \x1B[1m\x1B[${color}m${cmd}\x1B[0m${' '.repeat(20 - cmd.length - (desc.startsWith('🧪') ? 3 : 0))}${desc}`);
  // }

  console.log();
  process.exit(0);
}

let file = process.argv.slice(2).find(x => x[0] !== '-');
if (['precompile', 'run', 'wasm', 'native', 'c', 'profile', 'debug', 'debug-wasm'].includes(file)) {
  // remove this arg
  process.argv.splice(process.argv.indexOf(file), 1);

  if (file === 'precompile') {
    await import('../compiler/precompile.js');
    await new Promise(() => {}); // do nothing for the rest of this file
  }

  if (file === 'profile') {
    await import('./profile.js');
    await new Promise(() => {}); // do nothing for the rest of this file
  }

  if (file === 'debug') {
    await import('./debug.js');
    await new Promise(() => {}); // do nothing for the rest of this file
  }

  if (['wasm', 'native', 'c'].includes(file)) {
    process.argv.push(`--target=${file}`);
  }

  if (file === 'debug-wasm') {
    process.argv.push('--asur', '--wasm-debug');
  }

  file = process.argv.slice(2).find(x => x[0] !== '-');

  const nonOptOutFile = process.argv.slice(process.argv.indexOf(file) + 1).find(x => x[0] !== '-');
  if (nonOptOutFile) {
    process.argv.push(`-o=${nonOptOutFile}`);
  }
}

globalThis.file = file;

if (!file) {
  if (process.argv.includes('-v') || process.argv.includes('--version')) {
    // just print version
    console.log(globalThis.version);
    process.exit(0);
  }

  // run repl if no file given
  await import('./repl.js');
  await new Promise(() => {}); // do nothing for the rest of this file
}

const source = fs.readFileSync(file, 'utf8');

const compile = (await import('../compiler/wrap.js')).default;

let cache = '';
const print = str => {
  /* cache += str;

  if (str === '\n') {
    process.stdout.write(cache);
    cache = '';
  } */

  process.stdout.write(str);
};

let runStart;
try {
  if (process.argv.includes('-b')) {
    const { wasm, exports } = compile(source, process.argv.includes('--module') ? [ 'module' ] : [], {}, print);

    runStart = performance.now();
    if (!process.argv.includes('--no-run')) exports.main();

    console.log(`\n\nwasm size: ${wasm.byteLength} bytes`);
  } else {
    const { exports } = compile(source, process.argv.includes('--module') ? [ 'module' ] : [], {}, print);

    runStart = performance.now();
    if (!process.argv.includes('--no-run')) exports.main();
  }
  // if (cache) process.stdout.write(cache);
} catch (e) {
  // if (cache) process.stdout.write(cache);
  let out = e;
  if (!process.argv.includes('-i') && Object.getPrototypeOf(e).message != null) out = `${e.constructor.name}${e.message != null ? `: ${e.message}` : ''}`;
  console.error(out);
}

if (process.argv.includes('-t')) console.log(`${process.argv.includes('-b') ? '' : '\n\n'}total time: ${(performance.now() - start).toFixed(2)}ms\nexecution time: ${(performance.now() - runStart).toFixed(2)}ms`);