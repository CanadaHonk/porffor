#!/usr/bin/env node
import fs from 'node:fs';
import { parseArgs } from '../compiler/prefs.js';
globalThis.version = '0.37.2+c66ebc0c6';

// deno compat
if (typeof process === 'undefined' && typeof Deno !== 'undefined') {
  globalThis.process = await import('node:process');
}

const start = performance.now();

parseArgs(process.argv);

if (Options.compileHints) {
  const v8 = await import('node:v8');
  v8.setFlagsFromString(`--experimental-wasm-compilation-hints`);

  // see also these flags:
  // --experimental-wasm-branch-hinting
  // --experimental-wasm-extended-const
  // --experimental-wasm-inlining (?)
  // --experimental-wasm-js-inlining (?)
  // --experimental-wasm-return-call (on by default)
}

const done = async () => {
  // do nothing for the rest of this file
  await new Promise(res => process.on('beforeExit', res));
  process.exit();
};

switch (Options.command) {
  case 'precompile':
    await import('../compiler/precompile.js');
    await done();
    break;
  case 'profile':
    await import('./profile.js');
    await done();
    break;
  case 'debug':
    await import('./debug.js');
    await done();
    break;
  default:
    if (Options.command && Options.command != "run" && Options.additionalArgs.length > 0) {
      Options.outFile = Options.additionalArgs[0];
    }
    break;
}

let source = Options.evalSource;

if (!Options.file && !source) {
  // run repl if no file given
  await import('./repl.js');
  await done();
}

source ||= fs.readFileSync(Options.file, 'utf8');

const compile = (await import('../compiler/wrap.js')).default;

let runStart;
let ret;
try {
  const out = compile(source, Options.module ? [ 'module' ] : []);
  runStart = performance.now();
  if (Options.runAfterCompile) ret = out.exports.main();

  if (Options.showByteLength) {
    console.log(`\nwasm size: ${out.wasm.byteLength} bytes`);
  }
} catch (e) {
  let out = e;
  if (!Options.debugInfo && Object.getPrototypeOf(e).message != null) out = `${e.constructor.name}${e.message != null ? `: ${e.message}` : ''}`;
  console.error(out);
}

if (Options.showTime) console.log(`${Options.showByteLength ? '' : '\n'}total time: ${(performance.now() - start).toFixed(2)}ms\nexecution time: ${(performance.now() - runStart).toFixed(2)}ms`);

if (Options.printOutput) {
  if (Options.debugInfo && ret?.type != null) {
    ret = ret.js;
  }

  console.log(ret);
}