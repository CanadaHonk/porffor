import { underline, bold, log } from './log.js';
import { Valtype, PageSize } from './wasmSpec.js';
import parse from './parse.js';
import codegen from './codegen.js';
import opt from './opt.js';
import assemble from './assemble.js';
import disassemble from './disassemble.js';
import toc from './2c.js';
import * as pgo from './pgo.js';
import cyclone from './cyclone.js';
import './prefs.js';

globalThis.disassemble = disassemble;

const logFuncs = (funcs, globals, exceptions) => {
  console.log('\n' + underline(bold('funcs')));

  let wanted = Prefs.f;
  if (typeof wanted !== 'string') wanted = null;

  for (const f of funcs) {
    if ((wanted && (f.name !== wanted && wanted !== '!')) || (!wanted && f.internal)) continue;
    console.log(disassemble(f.wasm, f.name, f.index, f.locals, f.params, f.returns, funcs, globals, exceptions));
  }

  console.log();
};

const fs = (typeof process?.version !== 'undefined' ? (await import('node:fs')) : undefined);
const execSync = (typeof process?.version !== 'undefined' ? (await import('node:child_process')).execSync : undefined);

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
  progressInterval = setInterval(log, 100);
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

export default (code, module = Prefs.module) => {
  Prefs.module = module;

  globalThis.valtype = Prefs.valtype ?? 'f64';
  globalThis.valtypeBinary = Valtype[valtype];

  const optLevel = parseInt(process.argv.find(x => x.startsWith('-O'))?.[2] ?? 1);

  let target = Prefs.target ?? 'wasm';
  if (Prefs.native) target = 'native';

  let outFile = Prefs.o;
  const logProgress = Prefs.profileCompiler || (outFile && !Prefs.native);

  // use smaller page sizes internally (65536 / 4 = 16384)
  globalThis.pageSize = Prefs.pageSize ?? (PageSize / 4);

  // change some prefs by default for c/native
  if (target !== 'wasm') {
    // Prefs.pgo = Prefs.pgo === false || globalThis.document ? false : true; // enable pgo by default
    Prefs.passiveData = false; // disable using passive Wasm data as unsupported by 2c for now
  }

  // change some prefs by default for -O2
  if (optLevel >= 2) {
    Prefs.cyclone = Prefs.cyclone === false ? false : true; // enable cyclone
  }

  if (Prefs.pgo) pgo.setup();

  if (logProgress) progressStart('parsing...');
  const t0 = performance.now();
  const program = parse(code);
  if (logProgress) progressDone('parsed', t0);

  if (logProgress) progressStart('generating wasm...');
  const t1 = performance.now();
  const { funcs, globals, tags, exceptions, pages, data } = codegen(program);
  if (globalThis.compileCallback) globalThis.compileCallback({ funcs, globals, tags, exceptions, pages, data });

  if (logProgress) progressDone('generated wasm', t1);

  if (Prefs.funcs) logFuncs(funcs, globals, exceptions);

  if (logProgress) progressStart('optimizing...');
  const t2 = performance.now();
  opt(funcs, globals, pages, tags, exceptions);

  if (Prefs.pgo) {
    if (Prefs.pgoLog) {
      const oldSize = assemble(funcs, globals, tags, pages, data, true).byteLength;
      const t = performance.now();

      pgo.run({ funcs, globals, tags, exceptions, pages, data });
      opt(funcs, globals, pages, tags, exceptions);

      console.log(`PGO total time: ${(performance.now() - t).toFixed(2)}ms`);

      const newSize = assemble(funcs, globals, tags, pages, data, true).byteLength;
      console.log(`PGO size diff: ${oldSize - newSize} bytes (${oldSize} -> ${newSize})\n`);
    } else {
      pgo.run({ funcs, globals, tags, exceptions, pages, data });
      opt(funcs, globals, pages, tags, exceptions);
    }
  }

  if (Prefs.cyclone) {
    if (Prefs.cycloneLog) {
      const oldSize = assemble(funcs, globals, tags, pages, data, true).byteLength;
      const t = performance.now();

      for (const x of funcs) {
        const preOps = x.wasm.length;
        cyclone(x, globals);

        if (preOps !== x.wasm.length) console.log(`${x.name}: ${preOps} -> ${x.wasm.length} ops`);
      }
      opt(funcs, globals, pages, tags, exceptions);

      console.log(`cyclone total time: ${(performance.now() - t).toFixed(2)}ms`);

      const newSize = assemble(funcs, globals, tags, pages, data, true).byteLength;
      console.log(`cyclone size diff: ${oldSize - newSize} bytes (${oldSize} -> ${newSize})\n`);
    } else {
      for (const x of funcs) {
        cyclone(x, globals);
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

    const print = (x, depth = []) => {
      for (const [ name, inc ] of x) {
        if (inc.length === 0) continue;
        console.log(name);

        for (let i = 0; i < inc.length; i++) {
          if (inc[i][1].length === 0) continue;
          process.stdout.write(`${depth.join(' ')}${depth.length > 0 ? ' ' : ''}${i != inc.length - 1 ? '├' : '└' } `);

          const newDepth = [...depth];
          newDepth.push(i != inc.length - 1 ? '│' : '');

          print([ inc[i] ], newDepth);
        }
      }
    };
    print(data);
  }

  if (logProgress) progressStart('assembling...');
  const t3 = performance.now();
  const out = { funcs, globals, tags, exceptions, pages, data, times: [ t0, t1, t2, t3 ] };
  if (globalThis.precompile) return out;

  let wasm = out.wasm = assemble(funcs, globals, tags, pages, data);
  if (logProgress) progressDone('assembled', t3);

  if (Prefs.optFuncs || Prefs.f) logFuncs(funcs, globals, exceptions);

  if (Prefs.compileAllocLog) {
    const wasmPages = Math.ceil((pages.size * pageSize) / 65536);
    const bytes = wasmPages * 65536;
    log('alloc', `\x1B[1mallocated ${bytes / 1024}KiB\x1B[0m for ${pages.size} things using ${wasmPages} Wasm page${wasmPages === 1 ? '' : 's'}`);
    console.log([...pages.keys()].map(x => `\x1B[36m - ${x}\x1B[0m`).join('\n') + '\n');
  }

  if (Prefs.wasmOpt) {
    if (logProgress) progressStart('wasm-opt...');

    const t4 = performance.now();
    const newWasm = execSync(`wasm-opt -all -O4 -o -`, {
      stdio: [ 'pipe', 'pipe', 'pipe' ],
      input: wasm,
      encoding: null
    });
    wasm = out.wasm = new Uint8Array(newWasm);

    if (logProgress) progressDone('wasm-opt', t4);
  }

  if (target === 'wasm' && outFile) {
    fs.writeFileSync(outFile, Buffer.from(wasm));

    if (logProgress) {
      const total = performance.now();
      progressClear();
      console.log(`\u001b[2m[${total.toFixed(0)}ms]\u001b[0m \u001b[32mcompiled ${globalThis.file} \u001b[90m->\u001b[0m \u001b[92m${outFile}\u001b[90m (${(fs.statSync(outFile).size / 1000).toFixed(1)}KB)\u001b[0m`);
    }

    if (process.version) process.exit();
  }

  if (target === 'c') {
    if (Prefs.wasm) fs.writeFileSync(Prefs.wasm, Buffer.from(wasm));

    const c = toc(out);
    out.c = c;

    if (outFile) {
      fs.writeFileSync(outFile, c);
    } else {
      console.log(c);
    }

    if (logProgress) {
      const total = performance.now();
      progressClear();
      console.log(`\u001b[2m[${total.toFixed(0)}ms]\u001b[0m \u001b[32mcompiled ${globalThis.file} \u001b[90m->\u001b[0m \u001b[92m${outFile}\u001b[90m (${(fs.statSync(outFile).size / 1000).toFixed(1)}KB)\u001b[0m`);
    }

    if (process.version && !Prefs.lambda) process.exit();
  }

  if (target === 'native') {
    outFile ??= Prefs.native ? './porffor_tmp' : file.split('/').at(-1).split('.')[0];

    const compiler = (Prefs.compiler ?? process.env.CC ?? 'cc').split(' ');
    const cO = Prefs._cO ?? 'O3';

    const args = [
      ...compiler,
      '-xc', '-', // use stdin as c source in
      '-o', outFile ?? (process.platform === 'win32' ? 'out.exe' : 'out'), // set path for output

      // default cc args, always
      '-lm', // link math.h
      '-fno-exceptions', // disable exceptions
      '-fno-ident', '-ffunction-sections', '-fdata-sections', // remove unneeded binary sections
      '-' + cO
    ];

    if (Prefs.clangFast) args.push('-flto=thin', '-march=native', '-ffast-math', '-fno-asynchronous-unwind-tables');

    if (Prefs.s) args.push('-s');

    if (logProgress) progressStart('compiling Wasm to C...');
    const t4 = performance.now();
    const c = toc(out);
    if (logProgress) progressDone('compiled Wasm to C', t4);

    if (logProgress) progressStart(`compiling C to native (using ${compiler})...`);
    const t5 = performance.now();

    // obvious command escape is obvious
    execSync(args.join(' '), {
      stdio: [ 'pipe', 'inherit', 'inherit' ],
      input: c,
      encoding: 'utf8'
    });

    if (logProgress) progressDone(`compiled C to native (using ${compiler})`, t5);

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
      console.log(`\u001b[2m[${total.toFixed(0)}ms]\u001b[0m \u001b[32mcompiled ${globalThis.file} \u001b[90m->\u001b[0m \u001b[92m${outFile}\u001b[90m (${(fs.statSync(outFile).size / 1000).toFixed(1)}KB)\u001b[0m`);
    }

    process.exit();
  }

  return out;
};