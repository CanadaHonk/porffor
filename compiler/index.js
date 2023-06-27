import parse from './parse.js';
import codeGen from './codeGen.js';
import opt from './opt.js';
import produceSections from './sections.js';
import decompile from './decompile.js';

globalThis.decompile = decompile;

const underline = x => `\u001b[4m${x}\u001b[0m`;
const bold = x => `\u001b[1m${x}\u001b[0m`;

const logFuncs = funcs => {
  console.log('\n' + underline(bold('funcs')));

  for (const f of funcs) {
    console.log(underline(f.name));

    console.log(`params: ${f.params.join(', ')}`);
    console.log(`returns: ${f.return}`);
    console.log(`locals: ${Object.keys(f.locals).join(', ')}`);
    console.log(`index: ${f.index}`);
    console.log();
    console.log(decompile(f.wasm));
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

  if (flags.includes('return')) funcs.find(x => x.name === 'main').return = true;

  if (process.argv.includes('-funcs')) logFuncs(funcs);

  const t2 = performance.now();
  // console.log(funcs);
  opt(funcs, globals);
  // console.log(funcs);
  if (flags.includes('info')) console.log(`3. optimized code in ${(performance.now() - t2).toFixed(2)}ms`);

  if (process.argv.includes('-opt-funcs')) logFuncs(funcs);

  const t3 = performance.now();
  const sections = produceSections(funcs, globals, flags);
  if (flags.includes('info')) console.log(`4. produced sections in ${(performance.now() - t3).toFixed(2)}ms`);

  return sections;
};