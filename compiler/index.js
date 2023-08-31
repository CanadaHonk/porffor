import parse from './parse.js';
import codeGen from './codeGen.js';
import opt from './opt.js';
import produceSections from './sections.js';
import decompile from './decompile.js';
import { BuiltinPreludes } from './builtins.js';
import toc from './2c.js';


globalThis.decompile = decompile;

const rgb = (r, g, b, x) => `\x1b[38;2;${r};${g};${b}m${x}\u001b[0m`;
const underline = x => `\u001b[4m${x}\u001b[0m`;
const bold = x => `\u001b[1m${x}\u001b[0m`;

const areaColors = {
  codegen: [ 20, 80, 250 ],
  opt: [ 250, 20, 80 ],
  sections: [ 20, 250, 80 ],
  alloc: [ 250, 250, 20 ],
  '2c': [ 20, 250, 250 ]
};

globalThis.log = (area, ...args) => console.log(`\u001b[90m[\u001b[0m${rgb(...areaColors[area], area)}\u001b[90m]\u001b[0m`, ...args);

const logFuncs = (funcs, globals, exceptions) => {
  console.log('\n' + underline(bold('funcs')));

  for (const f of funcs) {
    console.log(`${underline(f.name)} (${f.index})`);

    console.log(`params: ${f.params.map((_, i) => Object.keys(f.locals)[Object.values(f.locals).indexOf(Object.values(f.locals).find(x => x.idx === i))]).join(', ')}`);
    console.log(`returns: ${f.returns.length > 0 ? true : false}`);
    console.log(`locals: ${Object.keys(f.locals).sort((a, b) => f.locals[a].idx - f.locals[b].idx).map(x => `${x} (${f.locals[x].idx})`).join(', ')}`);
    console.log();
    console.log(decompile(f.wasm, f.name, f.index, f.locals, f.params, f.returns, funcs, globals, exceptions));
  }

  console.log();
};

const getArg = name => process.argv.find(x => x.startsWith(`-${name}=`))?.slice(name.length + 2);

const writeFileSync = (typeof process !== 'undefined' ? (await import('node:fs')).writeFileSync : undefined);
const execSync = (typeof process !== 'undefined' ? (await import('node:child_process')).execSync : undefined);

export default (code, flags) => {
  globalThis.optLog = process.argv.includes('-opt-log');
  globalThis.codeLog = process.argv.includes('-code-log');
  globalThis.allocLog = process.argv.includes('-alloc-log');
  globalThis.regexLog = process.argv.includes('-regex-log');

  for (const x in BuiltinPreludes) {
    if (code.indexOf(x + '(') !== -1) code = BuiltinPreludes[x] + code;
  }

  const t0 = performance.now();
  const program = parse(code, flags);
  if (flags.includes('info')) console.log(`1. parsed in ${(performance.now() - t0).toFixed(2)}ms`);

  const t1 = performance.now();
  const { funcs, globals, tags, exceptions, pages } = codeGen(program);
  if (flags.includes('info')) console.log(`2. generated code in ${(performance.now() - t1).toFixed(2)}ms`);

  if (process.argv.includes('-funcs')) logFuncs(funcs, globals, exceptions);

  const t2 = performance.now();
  opt(funcs, globals);
  if (flags.includes('info')) console.log(`3. optimized code in ${(performance.now() - t2).toFixed(2)}ms`);

  if (process.argv.includes('-opt-funcs')) logFuncs(funcs, globals, exceptions);

  const t3 = performance.now();
  const sections = produceSections(funcs, globals, tags, pages, flags);
  if (flags.includes('info')) console.log(`4. produced sections in ${(performance.now() - t3).toFixed(2)}ms`);

  if (allocLog) {
    const wasmPages = Math.ceil((pages.size * pageSize) / 65536);
    const bytes = wasmPages * 65536;
    log('alloc', `\x1B[1mallocated ${bytes / 1024}KiB\x1B[0m for ${pages.size} things using ${wasmPages} Wasm page${wasmPages === 1 ? '' : 's'}`);
    // console.log([...pages.keys()].map(x => `\x1B[36m - ${x}\x1B[0m`).join('\n'));
  }

  const out = { wasm: sections, funcs, globals, tags, exceptions, pages };

  const target = getArg('target') ?? getArg('t') ?? 'wasm';
  const outFile = getArg('o');

  if (target === 'c') {
    const c = toc(out);

    if (outFile) {
      writeFileSync(outFile, c);
    } else {
      console.log(c);
    }

    process.exit();
  }

  if (target === 'native') {
    const compiler = getArg('compiler') ?? 'clang';
    const cO = getArg('cO') ?? 'Ofast';

    const tmpfile = 'tmp.c';
    const args = [ compiler, tmpfile, '-o', outFile ?? (process.platform === 'win32' ? 'out.exe' : 'out'), '-' + cO, '-march=native' ];

    const c = toc(out);
    writeFileSync(tmpfile, c);

    // obvious command escape is obvious
    execSync(args.join(' '), { stdio: 'inherit' });

    process.exit();
  }

  return out;
};