import parse from './parse.js';
import codeGen from './codeGen.js';
import opt from './opt.js';
import produceSections from './sections.js';

export default (code, flags = [ 'module' ]) => {
  const t0 = performance.now();
  const program = parse(code, flags);
  console.log(`1. parsed in ${(performance.now() - t0).toFixed(2)}ms`);

  const t1 = performance.now();
  const { funcs, globals } = codeGen(program);
  console.log(`2. generated code in ${(performance.now() - t1).toFixed(2)}ms`);

  const t2 = performance.now();
  for (const f of funcs) {
    f.wasm = opt(f.wasm);
  }
  console.log(`3. optimized code in ${(performance.now() - t2).toFixed(2)}ms`);

  const t3 = performance.now();
  const sections = produceSections(funcs, globals, flags);
  console.log(`4. produced sections in ${(performance.now() - t3).toFixed(2)}ms`);

  return sections;
};