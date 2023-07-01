import parse from './parse.js';
import codeGen from './codeGen.js';
import opt from './opt.js';
import produceSections from './sections.js';
import decompile from './decompile.js';
import { Valtype } from './wasmSpec.js';

globalThis.decompile = decompile;

const underline = x => `\u001b[4m${x}\u001b[0m`;
const bold = x => `\u001b[1m${x}\u001b[0m`;

const logFuncs = funcs => {
  console.log('\n' + underline(bold('funcs')));

  for (const f of funcs) {
    console.log(`${underline(f.name)} (${f.index})`);

    console.log(`params: ${f.params.map((_, i) => Object.keys(f.locals)[i]).join(', ')}`);
    console.log(`returns: ${f.returns.length > 0 ? true : false}`);
    console.log(`locals: ${Object.keys(f.locals).sort((a, b) => f.locals[a].idx - f.locals[b].idx).map(x => `${x} (${f.locals[x].idx})`).join(', ')}`);
    console.log();
    console.log(decompile(f.wasm, f.name, f.locals, f.params, f.returns));
  }

  console.log();
};

export default (code, flags = [ 'module' ]) => {
  const t0 = performance.now();
  const program = parse(code, flags);
  if (flags.includes('info')) console.log(`1. parsed in ${(performance.now() - t0).toFixed(2)}ms`);

  const t1 = performance.now();
  const { funcs, globals } = codeGen(program);
  if (flags.includes('info')) console.log(`2. generated code in ${(performance.now() - t1).toFixed(2)}ms`);

  if (flags.includes('return')) funcs.find(x => x.name === 'main').returns = [ Valtype.i32 ];

  if (process.argv.includes('-funcs')) logFuncs(funcs);

  const t2 = performance.now();
  opt(funcs, globals);
  if (flags.includes('info')) console.log(`3. optimized code in ${(performance.now() - t2).toFixed(2)}ms`);

  if (process.argv.includes('-opt-funcs')) logFuncs(funcs);

  const t3 = performance.now();
  const sections = produceSections(funcs, globals, flags);
  if (flags.includes('info')) console.log(`4. produced sections in ${(performance.now() - t3).toFixed(2)}ms`);

  return sections;
};