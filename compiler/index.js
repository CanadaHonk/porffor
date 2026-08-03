import { underline, bold } from './log.js';
import parse from './parse.js';
import codegen from './codegen.js';
import render from './render.js';
import './prefs.js';

const logFuncs = (funcs, globals) => {
  console.log('\n' + underline(bold('funcs')));

  let wanted = Prefs.f;
  if (typeof wanted !== 'string') wanted = null;

  for (const f of funcs) {
    if (!f) continue;
    if ((wanted && (f.name !== wanted && wanted !== '!')) || (!wanted && f.internal)) continue;
    console.log(`${f.name}(${f.params.map(x => `${x.name}:${x.type}`).join(', ')}) -> ${f.retType}`);
    console.log(JSON.stringify(f.body, null, 2));
  }

  console.log();
};

const fs = (typeof process?.version !== 'undefined' ? (await import('node:fs')) : undefined);
const { execSync, spawn } = (typeof process?.version !== 'undefined' ? (await import('node:child_process')) : {});
const uwebsockets = (typeof process?.version !== 'undefined' ? (await import('./uwebsockets.js')) : undefined);

const formatTime = ms => ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms.toFixed(0)}ms`;
const formatSize = bytes => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)}MB` : `${(bytes / 1000).toFixed(1)}KB`;

let progressLines = 0, progressInterval;
let spinner = ['-', '\\', '|', '/'], spin = 0;
const progressStart = msg => {
  if (globalThis.onProgress) return;
  if (!process.stdout.isTTY) return;

  const log = (extra, after) => {
    const pre = extra ? `${extra}` : spinner[spin++ % 4];
    process.stdout.write(`\r\u001b[2m${' '.repeat(60)}\r${' '.repeat(12 - pre.length)}${pre}  ${msg}${after ?? ''}\u001b[0m`);
  };
  log();

  globalThis.progress = log;
  // selfhosted timers keep the process spinning forever: animate node-hosted only
  if (process.argv0 === 'node') progressInterval = setInterval(log, 100);
};
const progressDone = (msg, start) => {
  if (globalThis.onProgress) return globalThis.onProgress(msg, performance.now() - start);

  clearInterval(progressInterval);

  const timeStr = (performance.now() - start).toFixed(0);
  console.log(`${process.stdout.isTTY ? `\r${' '.repeat(60)}\r` : ''}\u001b[2m${' '.repeat(10 - timeStr.length)}${timeStr}ms\u001b[0m  \u001b[92m${msg}\u001b[0m`);
  progressLines++;
};
const progressClear = () => {
  if (globalThis.onProgress) return;
  if (!process.stdout.isTTY) return;

  clearInterval(progressInterval);
  process.stdout.write(`\u001b[${progressLines}F\u001b[0J`);
  progressLines = 0;
};
export default (code, module = Prefs.module, run = false) => {
  Prefs.module = module;

  const optPref = process.argv.find(x => x.startsWith('-O'))?.[2] ?? Prefs.O;

  let target = Prefs.target ?? 'c';

  let outFile = Prefs.o;
  const logProgress = !Prefs.quiet && (Prefs.profileCompiler || !!outFile);

  globalThis.pageSize = Prefs.pageSize ?? (65536 / 4);

  if (logProgress) progressStart('parsing...');
  const t0 = performance.now();
  const program = parse(code);
  if (logProgress) progressDone('parsed', t0);

  // --parse-only: stop after parsing
  if (Prefs.parseOnly) return { program };

  if (logProgress) progressStart('generating IR...');
  const t1 = performance.now();
  const cg = codegen(program);
  if (globalThis.compileCallback) globalThis.compileCallback(cg);
  cg.times = [ t0, t1, performance.now() ];

  if (logProgress) progressDone('generated IR', t1);

  if (Prefs.f) logFuncs(cg.funcs, cg.globals);
  if (globalThis.precompile) return cg;

  if (logProgress) progressStart('rendering C...');
  const t4 = performance.now();
  const cOut = render(cg);
  const c = typeof cOut === 'string' ? cOut : cOut.c;
  // stop the render spinner on every target, or the native path's setInterval spins forever
  if (logProgress) progressDone('rendered C', t4);

  if (target === 'c') {
    if (Prefs.nativeFetch) {
      if (!outFile) throw new Error('native fetch C output requires an output directory');
      uwebsockets.writeNativeFetchPackage(outFile, cOut);
    } else if (outFile) fs.writeFileSync(outFile, c);
    else console.log(c);

    if (logProgress) {
      const total = performance.now();
      progressClear();
      if (!outFile) return cg;
      const detail = Prefs.nativeFetch ? 'C bundle' : formatSize(fs.statSync(outFile).size);
      console.log(`\u001b[2m[${formatTime(total)}]\u001b[0m \u001b[32mcompiled ${globalThis.file} \u001b[90m->\u001b[0m \u001b[92m${outFile}\u001b[90m (${detail})\u001b[0m`);
    }

    return cg;
  }

  if (target === 'native') {
    outFile ??= file.split('/').at(-1).split('.')[0];

    let compiler = (Prefs.compiler ?? process.env.CC ?? 'cc').split(' ');
    let cxx = (Prefs.cxx ?? process.env.CXX ?? 'c++').split(' ');
    if (Prefs.musl) compiler = [ 'zig', 'cc', '-target', 'x86_64-linux-musl' ];
    if (Prefs.musl) cxx = [ 'zig', 'c++', '-target', 'x86_64-linux-musl' ];
    const isTinyCC = compiler[0].endsWith('tcc');
    if (!Prefs.d && Prefs.flto == null) Prefs.flto = !Prefs.musl && !isTinyCC;

    const compilerArgPrefs = [ 'march', 'flto' ];
    const compilerArgs = isTinyCC && process.platform === 'darwin' ?
      [ '-D_XOPEN_SOURCE=600', '-D_DARWIN_C_SOURCE' ] : [];
    for (const x of compilerArgPrefs) {
      const value = Prefs[x];
      if (value == null || value === false) continue;
      compilerArgs.push(value === true ? `-${x}` : `-${x}=${value}`);
    }
    const linkStripArgs = process.platform === 'darwin' ?
      [ '-Wl,-stack_size,0x4000000', ...(Prefs.d ? [] : [ '-Wl,-dead_strip', '-Wl,-dead_strip_dylibs', '-Wl,-x' ]) ] :
      [ '-Wl,--gc-sections' ];
    const darwinReleaseCompileArgs = process.platform === 'darwin' && !Prefs.d ? [ '-fvisibility=hidden' ] : [];

    const compileNativeFetch = () => {
      const tempDir = fs.mkdtempSync('/tmp/porffor-uws-native-');
      const objectFile = `${tempDir}/porffor.o`;
      const shimFile = `${tempDir}/server.cpp`;

      try {
        if (logProgress) progressStart(`compiling native fetch code (using ${compiler[0]})...`);
        let t5 = performance.now();

        execSync([
          ...compiler,
          '-xc', '-', '-c',
          '-o', objectFile,
          '-fno-exceptions',
          '-fno-unwind-tables', '-fno-asynchronous-unwind-tables',
          '-fno-ident', '-ffunction-sections', '-fdata-sections',
          ...darwinReleaseCompileArgs,
          ...compilerArgs,
          `-O${optPref ?? 3}`
        ].join(' '), {
          stdio: [ 'pipe', 'inherit', 'inherit' ],
          input: c,
          encoding: 'utf8'
        });

        if (logProgress) progressDone(`compiled native fetch code (using ${compiler[0]})`, t5);

        if (logProgress) progressStart(`linking native fetch server (using ${cxx[0]})...`);
        t5 = performance.now();

        const uwsDir = uwebsockets.ensureUWebSockets();
        const uSocketsArchive = uwebsockets.ensureUSocketsBuilt(uwsDir);
        fs.writeFileSync(shimFile, uwebsockets.makeUWebSocketsShimSource());

        const linkArgs = [
          ...cxx,
          ...(Prefs.musl ? [ '-static' ] : []),
          '-std=c++20',
          '-o', outFile ?? (process.platform === 'win32' ? 'out.exe' : 'out'),
          '-DUWS_NO_ZLIB',
          '-DUWS_HTTPRESPONSE_NO_WRITEMARK',
          '-I', `${uwsDir}/src`,
          '-I', `${uwsDir}/uSockets/src`,
          '-pthread',
          '-fno-exceptions',
          '-fno-rtti',
          '-fno-unwind-tables', '-fno-asynchronous-unwind-tables',
          '-fno-ident', '-ffunction-sections', '-fdata-sections',
          ...darwinReleaseCompileArgs,
          ...linkStripArgs,
          ...compilerArgs,
          `-O${optPref ?? 3}`,
          shimFile,
          objectFile,
          uSocketsArchive,
          '-lm'
        ];
        if (Prefs.s) linkArgs.push('-s');

        execSync(linkArgs.join(' '), { stdio: 'inherit' });

        if (logProgress) progressDone(`linked native fetch server (using ${cxx[0]})`, t5);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    };

    if (Prefs.nativeFetch) {
      compileNativeFetch();
    } else {
      const args = [
        ...compiler,
        ...(Prefs.musl ? [ '-static' ] : []),
        '-xc', '-', // use stdin as c source in
        '-o', outFile ?? (process.platform === 'win32' ? 'out.exe' : 'out'), // set path for output

        // default cc args, always
        '-lm', // link math.h
        '-fno-exceptions', // disable exceptions
        '-fno-unwind-tables', '-fno-asynchronous-unwind-tables',
        '-fno-ident', '-ffunction-sections', '-fdata-sections', // remove unneeded binary sections
        ...(cOut.threads ? [ '-pthread' ] : []),
        ...darwinReleaseCompileArgs,
        ...(isTinyCC ? [] : linkStripArgs),
        ...compilerArgs,
        `-O${optPref ?? 3}`
      ];

      if (Prefs.s) args.push('-s');

      if (logProgress) progressStart(`compiling C to native (using ${compiler})...`);
      const t5 = performance.now();

      execSync(args.join(' '), {
        stdio: [ 'pipe', 'inherit', 'inherit' ],
        input: c,
        encoding: 'utf8'
      });

      if (logProgress) progressDone(`compiled C to native (using ${compiler})`, t5);
    }

    if (logProgress) {
      const total = performance.now();
      progressClear();
      console.log(`\u001b[2m[${formatTime(total)}]\u001b[0m \u001b[32mcompiled ${globalThis.file} \u001b[90m->\u001b[0m \u001b[92m${outFile}\u001b[90m (${formatSize(fs.statSync(outFile).size)})\u001b[0m`);
    }

    return cg;
  }

  return cg;
};
