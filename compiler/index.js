import { underline, bold, log } from './log.js';
import { Valtype, PageSize } from './wasmSpec.js';
import parse from './parse.js';
import codegen from './codegen.js';
import opt from './opt.js';
import assemble from './assemble.js';
import decompile from './decompile.js';
import toc from './2c.js';
import * as pgo from './pgo.js';
import cyclone from './cyclone.js';
import {} from './prefs.js';
import * as Diagram from './diagram.js';

globalThis.decompile = decompile;

const logFuncs = (funcs, globals, exceptions) => {
  console.log('\n' + underline(bold('funcs')));

  for (const f of funcs) {
    if (f.internal) continue;
    console.log(decompile(f.wasm, f.name, f.index, f.locals, f.params, f.returns, funcs, globals, exceptions));
  }

  console.log();
};

const fs = (typeof process?.version !== 'undefined' ? (await import('node:fs')) : undefined);
const execSync = (typeof process?.version !== 'undefined' ? (await import('node:child_process')).execSync : undefined);

let progressLines = 0, progressInterval;
let spinner = ['-', '\\', '|', '/'], spin = 0;
const progressStart = msg => {
  const log = (extra, after) => {
    const pre = extra ? `${extra}` : spinner[spin++ % 4];
    process.stdout.write(`\r\u001b[90m${' '.repeat(10 - pre.length)}${pre}  ${msg}${after ?? ''}\u001b[0m`);
  };
  log();

  globalThis.progress = log;
  progressInterval = setInterval(log, 100);
};
const progressDone = (msg, start) => {
  clearInterval(progressInterval);

  const timeStr = (performance.now() - start).toFixed(2);
  console.log(`\r${' '.repeat(50)}\r\u001b[90m${' '.repeat(8 - timeStr.length)}${timeStr}ms\u001b[0m  \u001b[92m${msg}\u001b[0m`);
  progressLines++;
};
const progressClear = () => {
  process.stdout.write(`\u001b[${progressLines}F\u001b[0J`);
  progressLines = 0;
};

export default (code, flags) => {
  let target = Prefs.target ?? 'wasm';
  if (Prefs.native) target = 'native';

  const logProgress = Prefs.profileCompiler || (target === 'native' && !Prefs.native && globalThis.file);

  let outFile = Prefs.o;

  globalThis.valtype = Prefs.valtype ?? 'f64';
  globalThis.valtypeBinary = Valtype[valtype];

  globalThis.pageSize = (parseInt(Prefs.valtype) * 1024) || PageSize;

  // change some prefs by default for c/native
  if (target !== 'wasm') {
    Prefs.pgo = Prefs.pgo === false ? false : true;
    Prefs.passiveData = false;
  }

  if (Prefs.pgo) pgo.setup();

  if (logProgress) progressStart('parsing...');
  const t0 = performance.now();
  const program = parse(code, flags);
  if (logProgress) progressDone('parsed', t0);

  if (logProgress) progressStart('generating wasm...');
  const t1 = performance.now();
  const { funcs, globals, tags, exceptions, pages, data } = codegen(program);
  if (logProgress) progressDone('generated wasm', t1);

  if (Prefs.funcs) logFuncs(funcs, globals, exceptions);

  if (logProgress) progressStart('optimizing...');
  const t2 = performance.now();
  opt(funcs, globals, pages, tags, exceptions);

  if (Prefs.pgo) {
    if (Prefs.pgoLog) {
      const oldSize = assemble(funcs, globals, tags, pages, data, flags, true).byteLength;
      const t = performance.now();

      pgo.run({ funcs, globals, tags, exceptions, pages, data });
      opt(funcs, globals, pages, tags, exceptions);

      console.log(`PGO total time: ${(performance.now() - t).toFixed(2)}ms`);

      const newSize = assemble(funcs, globals, tags, pages, data, flags, true).byteLength;
      console.log(`PGO size diff: ${oldSize - newSize} bytes (${oldSize} -> ${newSize})\n`);
    } else {
      pgo.run({ funcs, globals, tags, exceptions, pages, data });
      opt(funcs, globals, pages, tags, exceptions);
    }
  }

  if (Prefs.cyclone) {
    if (Prefs.cycloneLog) {
      const oldSize = assemble(funcs, globals, tags, pages, data, flags, true).byteLength;
      const t = performance.now();

      for (const x of funcs) {
        const preOps = x.wasm.length;
        cyclone(x.wasm);

        console.log(`${x.name}: ${preOps} -> ${x.wasm.length} ops`);
      }
      opt(funcs, globals, pages, tags, exceptions);

      console.log(`cyclone total time: ${(performance.now() - t).toFixed(2)}ms`);

      const newSize = assemble(funcs, globals, tags, pages, data, flags, true).byteLength;
      console.log(`cyclone size diff: ${oldSize - newSize} bytes (${oldSize} -> ${newSize})\n`);
    } else {
      for (const x of funcs) {
        cyclone(x.wasm);
      }
    }
  }

  if (logProgress) progressDone('optimized', t2);

  if (Prefs.builtinTree) {
    let data = funcs.filter(x => x.includes);
    if (typeof Prefs.builtinTree === 'string') data = data.filter(x => x.includes.has(Prefs.builtinTree));

    const funcsByName = funcs.reduce((acc, x) => { acc[x.name] = x; return acc; }, {});

    const done = new Set();
    for (let i = 0; i < data.length; i++) {
      const run = x => {
        const out = [ x.name, [] ];
        if (x.includes && !done.has(x.name)) {
          done.add(x.name);
          for (const y of x.includes) {
            out[1].push(run(funcsByName[y], done));
          }
        }

        return out;
      };
      data[i] = run(data[i]);
    }

    const url = Diagram.url(Diagram.tree(data));
    console.log(`built-in tree: ${url}`);
  }

  if (logProgress) progressStart('assembling...');
  const t3 = performance.now();
  const out = { funcs, globals, tags, exceptions, pages, data, times: [ t0, t1, t2, t3 ] };
  if (globalThis.precompile) return out;

  const wasm = out.wasm = assemble(funcs, globals, tags, pages, data, flags);
  if (logProgress) progressDone('assembled', t3);

  if (Prefs.optFuncs) logFuncs(funcs, globals, exceptions);

  if (Prefs.compileAllocLog) {
    const wasmPages = Math.ceil((pages.size * pageSize) / 65536);
    const bytes = wasmPages * 65536;
    log('alloc', `\x1B[1mallocated ${bytes / 1024}KiB\x1B[0m for ${pages.size} things using ${wasmPages} Wasm page${wasmPages === 1 ? '' : 's'}`);
    console.log([...pages.keys()].map(x => `\x1B[36m - ${x}\x1B[0m`).join('\n') + '\n');
  }

  if (target === 'wasm' && outFile) {
    fs.writeFileSync(outFile, Buffer.from(wasm));

    if (process.version) process.exit();
  }

  if (target === 'c') {
    const c = toc(out);
    out.c = c;

    if (outFile) {
      fs.writeFileSync(outFile, c);
    } else {
      console.log(c);
    }

    if (process.version) process.exit();
  }

  if (target === 'native') {
    outFile ??= Prefs.native ? './porffor_tmp' : file.split('/').at(-1).split('.').at(0, -1).join('.');

    let compiler = Prefs.compiler ?? 'clang';
    const cO = Prefs._cO ?? 'Ofast';

    if (compiler === 'zig') compiler = [ 'zig', 'cc' ];
      else compiler = [ compiler ];

    const tmpfile = 'porffor_tmp.c';
    const args = [ ...compiler, tmpfile, '-o', outFile ?? (process.platform === 'win32' ? 'out.exe' : 'out'), '-' + cO ];
    if (!Prefs.compiler) args.push('-flto=thin', '-march=native', '-s', '-ffast-math', '-fno-exceptions', '-fno-ident', '-fno-asynchronous-unwind-tables', '-ffunction-sections', '-fdata-sections', '-Wl,--gc-sections');

    if (logProgress) progressStart('compiling Wasm to C...');
    const t4 = performance.now();
    const c = toc(out);
    if (logProgress) progressDone('compiled Wasm to C', t4);

    if (logProgress) progressStart(`compiling C to native (using ${compiler})...`);
    const t5 = performance.now();

    fs.writeFileSync(tmpfile, c);

    // obvious command escape is obvious
    execSync(args.join(' '), { stdio: 'inherit' });

    fs.unlinkSync(tmpfile);

    if (logProgress) progressStart(`compiled C to native (using ${compiler})`, t5);

    if (process.version) {
      if (Prefs.native) {
        const cleanup = () => {
          try {
            fs.unlinkSync(outFile);
          } catch {}
        };

        process.on('exit', cleanup);
        process.on('beforeExit', cleanup);
        process.on('SIGINT', () => {
          cleanup();
          process.exit();
        });

        const runArgs = process.argv.slice(2).filter(x => !x.startsWith('-'));
        try {
          execSync([ outFile, ...runArgs.slice(1) ].join(' '), { stdio: 'inherit' });
        } catch {}
      }

      if (logProgress) {
        const total = performance.now();
        progressClear();
        console.log(`\u001b[90m[${total.toFixed(2)}ms]\u001b[0m \u001b[92mcompiled ${globalThis.file} -> ${outFile}\u001b[0m`);
      }

      process.exit();
    }
  }

  return out;
};