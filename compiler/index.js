import parse from './parse.js';
import codegen from './codegen.js';
import render from './render.js';
import { hashId } from './modules.js';
import './prefs.js';

const fs = (typeof process?.version !== 'undefined' ? (await import('node:fs')) : undefined);
const { execSync, spawnSync } = (typeof process?.version !== 'undefined' ? (await import('node:child_process')) : {});
const uwebsockets = (typeof process?.version !== 'undefined' ? (await import('./uwebsockets.js')) : undefined);
const ada = (typeof process?.version !== 'undefined' ? (await import('./ada.js')) : undefined);

// Porffor.link libs via pkg-config (static archives when asked), headers-only ones just cflags unless -d keeps unused code
export const linkFlags = libs => {
  const cflags = [], ldflags = [];
  const quiet = { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'ignore' ] };
  for (let spec of libs) {
    const headers = spec.startsWith('headers ');
    if (headers) spec = spec.slice(8);
    // built from source by the native path
    if (spec === 'uws' || spec === 'uws-ssl' || spec === 'ada') continue;
    const [ lib, preferStatic ] = spec.startsWith('static ') ? [ spec.slice(7), true ] : [ spec, false ];
    let flags;
    try {
      flags = execSync(`pkg-config --cflags --libs ${preferStatic ? '--static ' : ''}${lib}`, quiet).trim().split(/\s+/).filter(Boolean);
    } catch {
      flags = [ `-l${lib === 'zlib' ? 'z' : lib.replace(/^lib/, '')}` ];
    }
    if (preferStatic) {
      const dirs = flags.filter(x => x.startsWith('-L')).map(x => x.slice(2));
      flags = flags.map(x => x.startsWith('-l') ? dirs.map(dir => `${dir}/lib${x.slice(2)}.a`).find(archive => fs.existsSync(archive)) ?? x : x);
    }
    for (const x of flags) {
      if (x.startsWith('-I') || x.startsWith('-D')) cflags.push(x);
        else if ((!headers || Prefs.d) && x !== '-lm' && !ldflags.includes(x)) ldflags.push(x);
    }
  }
  return { cflags, ldflags };
};

const formatTime = ms => ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms.toFixed(0)}ms`;
const formatSize = bytes => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)}MB` : `${(bytes / 1000).toFixed(1)}KB`;

const ansi = code => process.stdout.isTTY ? `\u001b[${code}m` : '';

let progressLines = 0, progressInterval;
let spinner = ['-', '\\', '|', '/'], spin = 0;
const progressStart = msg => {
  if (!process.stdout.isTTY) return;

  const log = (extra, after) => {
    const pre = extra ? `${extra}` : spinner[spin++ % 4];
    process.stdout.write(`\r\u001b[2m${' '.repeat(60)}\r${' '.repeat(12 - pre.length)}${pre}  ${msg}${after ?? ''}\u001b[0m`);
  };
  log();

  // selfhosted timers keep the process spinning forever: animate node-hosted only
  if (process.argv0 === 'node') progressInterval = setInterval(log, 100);
};
const progressDone = (msg, start) => {
  clearInterval(progressInterval);

  const timeStr = (performance.now() - start).toFixed(0);
  console.log(`${process.stdout.isTTY ? `\r${' '.repeat(60)}\r` : ''}${ansi(2)}${' '.repeat(10 - timeStr.length)}${timeStr}ms${ansi(0)}  ${ansi(92)}${msg}${ansi(0)}`);
  progressLines++;
};
const progressClear = () => {
  if (!process.stdout.isTTY) return;

  clearInterval(progressInterval);
  process.stdout.write(`\u001b[${progressLines}F\u001b[0J`);
  progressLines = 0;
};
export default (code, module = Prefs.module, opts = {}) => {
  Prefs.module = module;

  let target = Prefs.target ?? 'c';

  let outFile = Prefs.o;
  const logProgress = !Prefs.quiet && (Prefs.profileCompiler || !!outFile);

  globalThis.pageSize = Prefs.pageSize ?? (65536 / 4);

  if (logProgress) progressStart('parsing...');
  const t0 = performance.now();
  const program = parse(code, opts);
  if (logProgress) progressDone('parsed', t0);

  // --parse-only: stop after parsing
  if (Prefs.parseOnly) return;

  if (logProgress) progressStart('generating IR...');
  const t1 = performance.now();
  const cg = codegen(program);

  if (logProgress) progressDone('generated IR', t1);

  if (globalThis.precompile) {
    cg.times = [ t0, t1, performance.now() ];
    return cg;
  }

  // module programs build one cached C unit per source: `c -o foo.c` emits one file, `c -o foo` a dir of units
  const cFileOut = !!outFile && /\.(c|cc|cpp|cxx|h|hpp|mm)$/i.test(outFile);
  const outDir = !!outFile && !cFileOut && (target === 'c' || outFile.endsWith('/') || (fs.existsSync(outFile) && fs.statSync(outFile).isDirectory()));
  const split = !!cg.units && (target === 'native' || outDir);

  if (logProgress) progressStart('rendering C...');
  const t4 = performance.now();
  const cOut = render({ ...cg, prefs: { ...cg.prefs, split } });
  const c = typeof cOut === 'string' ? cOut : cOut.c;
  // stop the render spinner on every target, or the native path's setInterval spins forever
  if (logProgress) progressDone('rendered C', t4);

  if (target === 'c') {
    if (split) {
      fs.mkdirSync(outFile, { recursive: true });
      for (const x of cOut.files) fs.writeFileSync(`${outFile}/${x.name}`, x.c);
      // the uws server shim builds with the units
      if (cg.linkLibs.includes('uws')) fs.copyFileSync(`${import.meta.dirname}/uwebsockets/porf_uws.cpp`, `${outFile}/porf_uws.cpp`);
    } else if (outFile) {
      fs.writeFileSync(outFile, c);
      if (cg.linkLibs.includes('uws')) fs.copyFileSync(`${import.meta.dirname}/uwebsockets/porf_uws.cpp`, outFile.slice(0, outFile.lastIndexOf('/') + 1) + 'porf_uws.cpp');
    } else console.log(c);

    if (logProgress) {
      const total = performance.now();
      progressClear();
      if (!outFile) return;
      const detail = split ? `${cOut.files.length} files` : formatSize(fs.statSync(outFile).size);
      console.log(`${ansi(2)}[${formatTime(total)}]${ansi(0)} ${ansi(32)}compiled ${globalThis.file} ${ansi(90)}->${ansi(0)} ${ansi(92)}${outFile}${ansi(90)} (${detail})${ansi(0)}`);
    }

    return;
  }

  if (target === 'native') {
    outFile ??= file.split('/').at(-1).split('.')[0];
    const native = () => {
      // clang where installed unless given: gcc builds are much slower
      const given = Prefs.compiler ?? process.env.CC ?? Prefs.cxx ?? process.env.CXX;
      const clang = given == null && process.platform !== 'darwin' && [ 'clang', 'clang++' ].every(x => spawnSync(x, [ '--version' ], { stdio: 'ignore' }).status === 0);
      const [ defaultCc, defaultCxx ] = clang ? [ 'clang', 'clang++' ] : [ 'cc', 'c++' ];
      let compiler = (Prefs.compiler ?? process.env.CC ?? defaultCc).split(' ');
      // c++ libs (uws shim, ada) link with c++, tcc objects can't join them
      const usesAda = cg.linkLibs.includes('ada') || cg.linkLibs.includes('headers ada');
      if ((cg.linkLibs.includes('uws') || usesAda) && compiler[0].endsWith('tcc')) compiler = [ defaultCc ];
      let cxx = (Prefs.cxx ?? process.env.CXX ?? defaultCxx).split(' ');
      if (Prefs.musl) compiler = [ 'zig', 'cc', '-target', 'x86_64-linux-musl' ];
      if (Prefs.musl) cxx = [ 'zig', 'c++', '-target', 'x86_64-linux-musl' ];
      const isTinyCC = compiler[0].endsWith('tcc');
      // split builds skip lto by default: it costs seconds at every link for ~1% throughput
      if (!Prefs.d && Prefs.flto == null) Prefs.flto = !Prefs.musl && !isTinyCC && !split;

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
      const libs = linkFlags(cg.linkLibs);
      // headers-only uses too: unused helpers kept at -O0 still reference it, and the archive links only what is used
      const adaLib = usesAda ? ada.adaBuild(cxx.join(' ')) : null;
      if (adaLib) libs.cflags.push(...adaLib.cflags);
      // tcc cannot read static archives, link their dylibs
      if (isTinyCC) libs.ldflags = libs.ldflags.map(x => x.endsWith('.a') ? `-l${x.split('/').at(-1).slice(3, -2)}` : x);
      const compileOnlyArgs = [
        ...libs.cflags,
        '-fno-exceptions',
        '-fno-unwind-tables', '-fno-asynchronous-unwind-tables',
        '-fno-ident', '-ffunction-sections', '-fdata-sections',
        ...darwinReleaseCompileArgs,
        ...compilerArgs,
        `-O${Prefs.O ?? 3}`
      ];

      // content-cached units: only changed ones recompile, all of them when porf.h or flags change
      const compileUnits = (files, cc, cxx) => {
        const entry = globalThis.file[0] === '/' ? globalThis.file : process.cwd() + '/' + globalThis.file;
        const buildDir = `${process.env.HOME}/.cache/porffor/build/${hashId(entry)}`;
        fs.mkdirSync(buildDir, { recursive: true });
        // polyfill units (Temporal, its tz data, Intl) are rarely hot: size over speed
        const job = 'case "$0" in *.cpp) exec ' + cxx + ' "$0" -o "${0%.cpp}.o";; */porf_temporal.c|*/porf_tz.c|*/porf_intl.c) exec ' + cc + ' -Oz "$0" -o "${0%.c}.o";; *) exec ' + cc + ' "$0" -o "${0%.c}.o";; esac';
        const stampFile = `${buildDir}/flags`;
        let stale = !fs.existsSync(stampFile) || fs.readFileSync(stampFile, 'utf8') !== job;
        const changed = [], objects = [];
        for (const { name, c } of files) {
          const path = `${buildDir}/${name}`;
          const same = !stale && fs.existsSync(path) && fs.readFileSync(path, 'utf8') === c;
          if (!same) fs.writeFileSync(path, c);
          if (name.endsWith('.h')) { stale ||= !same; continue; }
          const object = path.replace(/\.c(pp)?$/, '.o');
          objects.push(object);
          if (!same || !fs.existsSync(object)) {
            fs.rmSync(object, { force: true });
            changed.push(path);
          }
        }
        fs.writeFileSync(stampFile, job);

        if (logProgress) progressStart(`compiling ${changed.length}/${objects.length} units (using ${cc.split(' ')[0]})...`);
        const t5 = performance.now();
        if (changed.length > 0) {
          execSync('xargs -0 -P ' + (Prefs.j ?? '$(getconf _NPROCESSORS_ONLN)') + " -n 1 sh -c '" + job + "'", { input: changed.join('\0'), stdio: [ 'pipe', 'inherit', 'inherit' ] });
        }
        if (logProgress) progressDone(`compiled ${changed.length}/${objects.length} units (using ${cc.split(' ')[0]})`, t5);
        return objects;
      };
      const ccUnits = [ ...compiler, '-c', ...compileOnlyArgs ].join(' ');

      // uws shim is c++: compiled with the units, linked with c++
      const uws = cg.linkLibs.includes('uws') ? uwebsockets.uwsBuild(compiler.join(' '), cxx.join(' '), libs.cflags, cg.linkLibs.includes('uws-ssl')) : null;
      const linker = uws || adaLib ? cxx : compiler;
      const cxxUnits = uws ? [ ...cxx, '-c', ...uws.cxxflags, ...compileOnlyArgs ].join(' ') : ccUnits;
      const objects = split ? compileUnits(uws ? [ uws.unit, ...cOut.files ] : cOut.files, ccUnits, cxxUnits) : null;
      const args = [
        ...linker,
        ...(Prefs.musl ? [ '-static' ] : []),
        ...(objects ?? [ '-xc', '-', ...compileOnlyArgs ]),
        '-o', outFile, // set path for output
        ...(uws ? [ uws.archive ] : []),
        ...(adaLib ? [ adaLib.archive ] : []),
        '-lm', // link math.h
        ...libs.ldflags,
        ...(objects ? [ ...compilerArgs, `-O${Prefs.O ?? 3}` ] : []),
        ...(isTinyCC ? [] : linkStripArgs)
      ];

      if (Prefs.s) args.push('-s');

      if (logProgress) progressStart(`${objects ? 'linking' : 'compiling C to'} native (using ${linker[0]})...`);
      const t5 = performance.now();

      execSync(args.join(' '), {
        stdio: [ 'pipe', 'inherit', 'inherit' ],
        input: objects ? '' : c,
        encoding: 'utf8'
      });

      if (logProgress) progressDone(`${objects ? 'linked' : 'compiled C to'} native (using ${linker[0]})`, t5);

      if (logProgress) {
        const total = performance.now();
        progressClear();
        if (!Prefs.run) console.log(`${ansi(2)}[${formatTime(total)}]${ansi(0)} ${ansi(32)}compiled ${globalThis.file} ${ansi(90)}->${ansi(0)} ${ansi(92)}${outFile}${ansi(90)} (${formatSize(fs.statSync(outFile).size)})${ansi(0)}`);
      }
    };

    native();

    return;
  }
};
