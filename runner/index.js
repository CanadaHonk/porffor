#!/usr/bin/env node
import fs from 'node:fs';
globalThis.version = '0.50.26';

// deno compat
if (typeof process === 'undefined' && typeof Deno !== 'undefined') {
  globalThis.process = await import('node:process');
}

const start = performance.now();

if (process.argv.includes('--help')) {
  // description + version
  console.log(`\x1B[1m\x1B[35mPorffor\x1B[0m is a JavaScript/TypeScript engine/compiler/runtime. \x1B[90m(${globalThis.version})\x1B[0m`);

  // basic usage
  console.log(`Usage: \x1B[1mporf <command> [...prefs] path/to/script.js [...args]\x1B[0m`);

  // commands
  for (let [ cmd, [ color, post, desc ] ] of Object.entries({
    'Compile': [],
    '': [ 34, 'foo.js', 'Compile and execute a file' ],
    wasm: [ 34, 'foo.js foo.wasm', 'Compile to a Wasm binary' ],
    c: [ 94, 'foo.js foo.c', 'Compile to C source code' ],
    native: [ 94, 'foo.js foo', 'Compile to a native binary' ],

    'Profile': [],
    flamegraph: [ 93, 'foo.js', 'View detailed func-by-func performance' ],
    hotlines: [ 93, 'foo.js', 'View source with line-by-line performance' ],

    'Debug': [],
    debug: [ 33, 'foo.js', 'Debug the source of a file' ],
    dissect: [ 33, 'foo.js', 'Debug the compiled Wasm of a file' ],
  })) {
    if (color == null) {
      // header
      console.log(`\n\x1B[1m\x1B[4m${cmd}\x1B[0m`);
      continue;
    }

    if (cmd.length > 0) post = ' ' + post;

    console.log(`  \x1B[90mporf\x1B[0m \x1B[1m\x1B[${color}m${cmd}\x1B[0m\x1B[2m${post}\x1B[0m ${' '.repeat(30 - cmd.length - post.length)}${desc}`);
  }

  console.log();
  process.exit(0);
}

const done = async () => {
  // do nothing for the rest of this file
  await new Promise(res => process.on('beforeExit', res));
  process.exit();
};

let file = process.argv.slice(2).find(x => x[0] !== '-');
if (['precompile', 'run', 'wasm', 'native', 'c', 'flamegraph', 'hotlines', 'debug', 'dissect'].includes(file)) {
  // remove this arg
  process.argv.splice(process.argv.indexOf(file), 1);

  if (file === 'precompile') {
    await import('../compiler/precompile.js');
    await done();
  }

  if (file === 'flamegraph') {
    await import('./flamegraph.js');
    await done();
  }

  if (file === 'hotlines') {
    await import('./hotlines.js');
    await done();
  }

  if (file === 'debug') {
    await import('./debug.js');
    await done();
  }

  if (['wasm', 'native', 'c'].includes(file)) {
    process.argv.push(`--target=${file}`);
  }

  if (file === 'dissect') {
    process.argv.push('--asur', '--wasm-debug');
  }

  file = process.argv.slice(2).find(x => x[0] !== '-');

  const nonOptOutFile = process.argv.slice(process.argv.indexOf(file) + 1).find(x => x[0] !== '-');
  if (nonOptOutFile) {
    process.argv.push(`-o=${nonOptOutFile}`);
  }
}

let source = '', printOutput = false;
if (process.argv.length >= 4) {
  let evalIndex = process.argv.indexOf('-e');
  if (evalIndex === -1) evalIndex = process.argv.indexOf('--eval');
  if (evalIndex !== -1) {
    source = process.argv[evalIndex + 1];
    if (source) {
      // todo: this isn't entirely right, because shells should do the quoting for us but works well enough, see below as well
      if ((source.startsWith('"') || source.startsWith("'")) && (source.endsWith('"') || source.endsWith("'"))) {
        source = source.slice(1, -1);
      }
      process.argv.splice(evalIndex, 2); // remove flag and value
    }
  }

  let printIndex = process.argv.indexOf('-p');
  if (printIndex === -1) printIndex = process.argv.indexOf('--print');
  if (printIndex !== -1) {
    process.argv.push('--no-opt-unused');
    source = process.argv[printIndex + 1];
    if (source) {
      if ((source.startsWith('"') || source.startsWith("'")) && (source.endsWith('"') || source.endsWith("'"))) {
        source = source.slice(1, -1);
      }
      process.argv.splice(printIndex, 2); // remove flag and value
    }

    printOutput = true;
  }
}

if (file.startsWith('https://')) { // https only :)
  // rce warning, make user confirm (disabled)
  // const rl = (await import('readline')).createInterface({ input: process.stdin, output: process.stdout });
  // const ans = await new Promise(resolve => rl.question(`\u001b[1mAre you sure you want to download this URL:\u001b[0m ${file} (y/n)? `, ans => {
  //   rl.close();
  //   resolve(ans);
  // }));
  // if (ans.toLowerCase()[0] !== 'y') process.exit();

  source = await (await fetch(file)).text();
}

globalThis.file = file;

if (!file && !source) {
  if (process.argv.includes('-v') || process.argv.includes('--version')) {
    // just print version
    console.log(globalThis.version);
    process.exit(0);
  }

  // run repl if no file given
  await import('./repl.js');
  await done();
}

source ||= fs.readFileSync(file, 'utf8');

const compile = (await import('../compiler/wrap.js')).default;

let runStart;
let ret;
try {
  const out = compile(source);
  runStart = performance.now();
  if (!process.argv.includes('--no-run')) ret = out.exports.main();

  if (process.argv.includes('-b')) {
    console.log(`\nwasm size: ${out.wasm.byteLength} bytes`);
  }
} catch (e) {
  let out = e;
  if (!process.argv.includes('-d') && Object.getPrototypeOf(e).message != null) out = `${e.name}${e.message != null ? `: ${e.message}` : ''}`;
  console.error(out);
}

if (process.argv.includes('-t')) console.log(`${process.argv.includes('-b') ? '' : '\n'}total time: ${(performance.now() - start).toFixed(2)}ms\nexecution time: ${(performance.now() - runStart).toFixed(2)}ms`);

if (printOutput) {
  if (process.argv.includes('-d') && ret?.type != null) {
    ret = ret.js;
  }

  console.log(ret);
}