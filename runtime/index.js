#!/usr/bin/env -S node --experimental-import-text --disable-warning=ExperimentalWarning
import fs from 'node:fs';
import { isatty } from 'node:tty';
import { spawnSync } from 'node:child_process';
import runtimeImports, { globals as runtimeGlobals } from './node/sources.js';
import { hashId, isEsmSource } from '../compiler/modules.js';
import parseSource from '../compiler/parser/index.js';
import '../compiler/prefs.js';
globalThis.version = 'alpha 1 (ba4813d 2026-07-15)';

// deno compat
if (typeof process === 'undefined' && typeof Deno !== 'undefined') {
  globalThis.process = await import('node:process');
}

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
    safe: 'Safe mode (error on unsafe Porffor features)'
  })) {
    flag = '-' + flag;
    if (flag.length > 3) flag = '-' + flag;

    console.log(`  ${ansi(1)}${flag}${ansi(0)}${' '.repeat(36 - flag.length)}${desc}`);
  }

  // niche flags
  if (process.argv.includes('all')) {
    for (let [ flag, desc ] of Object.entries({
      'profile-compiler': 'Log general compiler performance (on by default when compiling to a file)',
      module: 'Parse input as a module (detected like node otherwise)',
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

const compile = async (source, module, opts) => (await import('../compiler/index.js')).default(source, module, { runtimeImports, runtimeGlobals, ...opts });

// node style: porf [...options] [script.js | -e code | -p code | -] [...args]
const VALUE_OPTIONS = [ '-e', '--eval', '-p', '--print', '-pe', '-r', '--require', '--import', '--input-type', '-C', '--conditions', '--loader', '--experimental-loader', '--env-file', '--title', '--disable-warning', '--redirect-warnings', '--test-reporter', '--test-reporter-destination', '--watch-path', '--inspect-port' ];

const execArgv = [], prefArgs = [], preload = [], conditions = [];
let evalSource = null, print = false, check = false, inputType = null;
const readOptions = (list, record) => {
  let i = 0;
  for (; i < list.length && list[i][0] === '-' && list[i] !== '-'; i++) {
    const arg = list[i];
    if (arg === '--') return i + 1;
    const eq = arg.indexOf('=');
    const name = arg.startsWith('--') && eq > 0 ? arg.slice(0, eq) : arg;
    let value = name !== arg ? arg.slice(eq + 1) : undefined;
    if (record) execArgv.push(arg);
    if (value === undefined && VALUE_OPTIONS.includes(name)) {
      value = list[++i];
      if (record) execArgv.push(value);
    }
    prefArgs.push(name !== arg && !VALUE_OPTIONS.includes(name) ? arg : name);

    switch (name) {
      case '-C': case '--conditions':
        conditions.push(value);
        break;
      case '-p': case '--print': case '-pe':
        print = true;
      case '-e': case '--eval':
        evalSource = value;
        break;
      case '-r': case '--require': case '--import':
        preload.push(value);
        break;
      case '--input-type':
        inputType = value;
        break;
      case '-c': case '--check':
        check = true;
        break;
    }
  }
  return i;
};

const args = process.argv.slice(2);
readOptions((process.env.NODE_OPTIONS ?? '').split(/\s+/).filter(Boolean), false);
const scriptAt = readOptions(args, true);
if (conditions.length > 0) prefArgs.push(`--conditions=${conditions.join(',')}`);
const options = args.slice(0, scriptAt);
if (args[scriptAt] === 'help' || options.includes('--help') || options.includes('-h')) help();
if (options.includes('-v') || options.includes('--version')) {
  console.log(globalThis.version);
  process.exit(0);
}

// porf foo.js -o foo builds like porf native foo.js -o foo
if (args[scriptAt] === 'c' || args[scriptAt] === 'native' || options.includes('-o') || args[scriptAt + 1] === '-o') {
  // porf c|native [...prefs] file: every flag is a pref
  const nonFlagArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o') {
      Prefs.o = args[++i];
      continue;
    }
    if (args[i][0] !== '-') nonFlagArgs.push(args[i]);
  }

  const command = [ 'c', 'native' ].includes(nonFlagArgs[0]) ? nonFlagArgs.shift() : 'native';
  const file = globalThis.file = nonFlagArgs[0];
  Prefs.target = command;
  const source = fs.readFileSync(file, 'utf8');
  await compile(source, Prefs.module ?? isEsmSource(fs.realpathSync(file), source));
  process.exit(0);
}

process.argv = [ process.argv[0], process.argv[1], ...prefArgs ];
globalThis.argvChanged();
delete Prefs.p;
if (inputType) Prefs.module = inputType === 'module';

const cwd = process.cwd();
let entry, source, rest;
if (evalSource != null) {
  entry = `${cwd}/[eval]`;
  source = evalSource;
  rest = args.slice(scriptAt);
} else if (args[scriptAt] === '-' || (args[scriptAt] == null && !isatty(0))) {
  entry = `${cwd}/[stdin]`;
  source = fs.readFileSync(0, 'utf8');
  rest = args.slice(scriptAt);
} else if (args[scriptAt] == null) {
  await import('./repl.js');
  process.exit(0);
} else {
  const path = `${args[scriptAt][0] === '/' ? '' : cwd + '/'}${args[scriptAt]}`;
  entry = [ path, path + '.js', path + '/index.js' ].find(x => fs.statSync(x, { throwIfNoEntry: false })?.isFile());
  if (!entry) {
    console.error(`Error: Cannot find module '${path}'\n    at Module._resolveFilename (node:internal/modules/cjs/loader) {\n  code: 'MODULE_NOT_FOUND',\n  requireStack: []\n}`);
    process.exit(1);
  }
  entry = fs.realpathSync(entry);
  source = fs.readFileSync(entry, 'utf8');
  rest = args.slice(scriptAt + 1);
}

const module = Prefs.module ?? isEsmSource(entry, source);
if (print) {
  const body = parseSource(source, { module }).body;
  const last = body.at(-1);
  if (last?.type === 'ExpressionStatement') source = `${source.slice(0, last.start)}process.stdout.write(require('node:util').format((${source.slice(last.expression.start, last.expression.end)})) + '\\n');${source.slice(last.end)}`;
}
// preloads join the entry's first line, keeping its line numbers
const preloadPath = x => x[0] === '.' ? `${cwd}/${x}` : x;
source = preload.map(x => module ? `import ${JSON.stringify(preloadPath(x))};` : `require(${JSON.stringify(preloadPath(x))});`).join('') + source;

// node style location then error, the parser appends the position to its messages
const syntaxError = e => {
  const at = / \((\d+):\d+\)$/.exec(e.message);
  console.error(`${entry.endsWith(']') ? entry.slice(entry.lastIndexOf('/') + 1) : entry}:${at?.[1] ?? 1}\n\n${e.name}: ${at ? e.message.slice(0, at.index) : e.message}`);
  process.exit(1);
};

if (check) {
  try {
    parseSource(source, { module, topReturn: !module });
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    syntaxError(e);
  }
  process.exit(0);
}

// binary cached with the entry's units, eval code keyed by its content
globalThis.file = evalSource != null ? `${entry}-${hashId(source)}` : entry;
const buildDir = `${process.env.HOME}/.cache/porffor/build/${hashId(globalThis.file)}`;
fs.mkdirSync(buildDir, { recursive: true });
const bin = `${buildDir}/run`;
Object.assign(Prefs, { target: 'native', o: `${bin}.${process.pid}`, quiet: !isatty(1), run: true });

// concurrent runs of one entry share its build dir
const lock = `${buildDir}/lock`;
for (;;) {
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
    break;
  } catch {}
  // a lock whose owner died is stale, an empty one is still being written unless it is old
  try {
    const pid = +fs.readFileSync(lock, 'utf8');
    if (pid > 0) process.kill(pid, 0);
      else if (Date.now() - fs.statSync(lock).mtimeMs > 1000) fs.rmSync(lock, { force: true });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  } catch {
    fs.rmSync(lock, { force: true });
  }
}

try {
  const started = Date.now();
  await compile(source, module, { file: entry });

  // a split build with no unit rebuilt keeps the last binary: macos vets every new executable on its first run
  const mtime = x => fs.statSync(`${buildDir}/${x}`).mtimeMs;
  const relinked = !fs.existsSync(bin) || !fs.existsSync(`${buildDir}/flags`) || mtime('flags') < started || fs.readdirSync(buildDir).some(x => x.endsWith('.o') && mtime(x) >= mtime('run'));
  if (relinked) fs.renameSync(Prefs.o, bin);
    else fs.rmSync(Prefs.o);
} catch (e) {
  fs.rmSync(Prefs.o, { force: true });
  if (!(e instanceof SyntaxError)) throw e;
  fs.rmSync(lock, { force: true });
  syntaxError(e);
} finally {
  fs.rmSync(lock, { force: true });
}

// the program replaces this process, its argv node's: options, then the script, then its arguments
const argv = [ bin, ...execArgv, entry, ...rest ];
if (process.execve) process.execve(bin, argv, process.env);
const run = spawnSync(bin, argv.slice(1), { stdio: 'inherit', argv0: argv[0] });
if (run.signal) process.kill(process.pid, run.signal);
process.exit(run.status ?? 1);
