#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import '../compiler/prefs.js';
globalThis.version = 'alpha 1 (ba4813d 2026-07-15)';

const DEFAULT_EXPORT_PATTERN = /^\s*export\s+(?:default\b|\{[^}]*\bdefault\b[^}]*\})/m;
const MODULE_SYNTAX_PATTERN = /^\s*(?:export|import)\s/m;

// deno compat
if (typeof process === 'undefined' && typeof Deno !== 'undefined') {
  globalThis.process = await import('node:process');
}

const start = performance.now();

const ansi = code => process.stdout.isTTY ? `\x1B[${code}m` : '';

const help = () => {
  // description + version
  console.log(`${ansi('1;38;2;156;96;224')}Porffor${ansi(0)} is a JavaScript/TypeScript engine/compiler/runtime. ${ansi(2)}(${globalThis.version})${ansi(0)}`);

  // basic usage
  console.log(`Usage: ${ansi(1)}porf [command] [...prefs] path/to/script.js [...args]${ansi(0)}`);

  // commands
  console.log(`\n${ansi(1)}${ansi(4)}Commands${ansi(0)}`);
  for (let [ cmd, color, post, desc ] of [
    [ '', 34, '', 'Start a REPL' ],
    [ '', 34, 'foo.js', 'Run a script' ],
    [ 'c', 94, 'foo.js -o foo.c', 'Compile to C source code' ],
    [ 'native', 94, 'foo.js -o foo', 'Compile to a native binary' ],
  ]) {
    if (cmd.length > 0) post = ' ' + post;

    console.log(`  ${ansi(2)}porf${ansi(0)} ${ansi(1)}${ansi(color)}${cmd}${ansi(0)}${post} ${' '.repeat(30 - cmd.length - post.length)}${desc}`);
  }

  // flags
  console.log(`\n${ansi(1)}${ansi(4)}Flags${ansi(0)}`);
  for (let [ flag, desc ] of Object.entries({
    'On': `Optimization level, use -O(0|${ansi(1)}1${ansi(0)}|2|3)`,
    t: 'Force parsing input as TypeScript',
    d: 'Debug mode (include names and debug logs)',
    module: 'Parse input as a module',
    safe: 'Safe mode (error on unsafe Porffor features)'
  })) {
    flag = '-' + flag;
    if (flag.length > 3) flag = '-' + flag;

    console.log(`  ${ansi(1)}${flag}${ansi(0)}${' '.repeat(36 - flag.length)}${desc}`);
  }

  // niche flags
  if (process.argv.includes('all')) {
    for (let [ flag, desc ] of Object.entries({
      'fast-length': 'Non-compliant optimization to make .length faster',
      'profile-compiler': 'Log general compiler performance (on by default when compiling to a file)',
      'jN': 'Parallel C compile jobs for module builds (default: CPU count)',
    })) {
      flag = '-' + flag;
      if (flag.length > 3) flag = '-' + flag;

      console.log(`  ${ansi(1)}${flag}${ansi(0)}${' '.repeat(36 - flag.length)}${desc}`);
    }
  } else {
    console.log(`  ${ansi(90)}(To view all flags use --help all)${ansi(0)}`);
  }

  console.log();
  process.exit(0);
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  help();
}

const looksLikeModule = (filename, source) => MODULE_SYNTAX_PATTERN.test(source) || /\.(mjs|mts)$/i.test(filename ?? '');

entrypoint: {
  const args = process.argv.slice(2);
  const nonFlagArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o') {
      Prefs.o = args[++i];
      continue;
    }
    if (args[i] === '-e' || args[i] === '-p') {
      i++;
      continue;
    }
    if (args[i][0] !== '-') nonFlagArgs.push(args[i]);
  }

  let inputFile = globalThis.file = nonFlagArgs[0];
  let command;
  let runAfterCompile = false;
  let runStatus;
  let tmpRunDir;
  if (inputFile === 'help') help();

  if (['native', 'c'].includes(inputFile)) {
    command = inputFile;
    inputFile = globalThis.file = nonFlagArgs[1];
  }

  if (!command && inputFile && !Prefs.e && !Prefs.p) {
    command = 'native';
    Prefs.target = 'native';
    if (Prefs.o == null) {
      tmpRunDir = fs.mkdtempSync('/tmp/porffor-run-');
      Prefs.o = `${tmpRunDir}/out`;
      Prefs.quiet = !process.stdout.isTTY;
      Prefs.run = true;
      runAfterCompile = true;
    }
  }

  if (command) {
    if (['native', 'c'].includes(command)) Prefs.target = command;
  }

  let source = '';
  let sourceProvided = false;
  if (Prefs.e || Prefs.p) {
    const expr = process.argv[(Prefs.e ? process.argv.indexOf('-e') : process.argv.indexOf('-p')) + 1];
    source = expr;
    sourceProvided = true;
    Prefs.optUnused = false;
    command = 'native';
    Prefs.target = 'native';
    tmpRunDir = fs.mkdtempSync('/tmp/porffor-run-');
    inputFile = globalThis.file = `${tmpRunDir}/input.js`;
    Prefs.o = `${tmpRunDir}/out`;
    Prefs.quiet = true;
    runAfterCompile = true;
  }

  if (!inputFile && !source) {
    if (process.argv.includes('-v') || process.argv.includes('--version')) {
      // just print version
      console.log(globalThis.version);
      process.exit(0);
    }

    // run repl if no file given
    await import('./repl.js');
    break entrypoint;
  }

  if (sourceProvided) fs.writeFileSync(inputFile, source);
    else source = fs.readFileSync(inputFile, 'utf8');

  try {
    if ((Prefs.target === 'c' || Prefs.target === 'native') && DEFAULT_EXPORT_PATTERN.test(source) && source.includes('fetch')) {
      (await import('./native-fetch.js')).default(inputFile);
    } else {
      (await import('../compiler/index.js')).default(source, Prefs.module ?? looksLikeModule(inputFile, source));
    }

    if (runAfterCompile) {
      try {
        execFileSync(Prefs.o, [], { stdio: 'inherit' });
      } catch (e) {
        if (e?.status == null && e?.signal == null) throw e;
        runStatus = e.status ?? 1;
      }
    }
  } finally {
    if (tmpRunDir) fs.rmSync(tmpRunDir, { recursive: true, force: true });
  }

  if (runStatus != null) process.exit(runStatus);
}
