import { Opcodes } from './wasmSpec.js';
import { TYPES } from './types.js';

import process from 'node:process';
globalThis.process = process;

import fs from 'node:fs';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
globalThis.precompileCompilerPath = __dirname;
globalThis.precompile = true;

const argv = process.argv.slice();

const compile = async (file, _funcs) => {
  let source = fs.readFileSync(file, 'utf8');
  let first = source.slice(0, source.indexOf('\n'));

  if (first.startsWith('export default')) {
    source = await (await import(file)).default();
    first = source.slice(0, source.indexOf('\n'));
  }

  let args = ['--bytestring', '--todo-time=compile', '--truthy=no_nan_negative', '--no-treeshake-wasm-imports', '--no-rm-unused-types', '--scoped-page-names', '--funsafe-no-unlikely-proto-checks', '--fast-length', '--parse-types', '--opt-types'];
  if (first.startsWith('// @porf')) {
    args = first.slice('// @porf '.length).split(' ').concat(args);
  }
  process.argv = argv.concat(args);

  const porfCompile = (await import(`./index.js?_=${Date.now()}`)).default;

  let { funcs, globals, data, exceptions } = porfCompile(source, ['module', 'typed']);

  const allocated = new Set();

  const invGlobals = Object.keys(globals).reduce((acc, y) => {
    acc[globals[y].idx] = { ...globals[y], name: y };
    return acc;
  }, {});

  const main = funcs.find(x => x.name === 'main');
  const exports = funcs.filter(x => x.export && x.name !== 'main');
  for (const x of exports) {
    if (x.data) {
      x.data = x.data.map(x => data[x]);
      for (const y in x.data) {
        if (x.data[y].offset != null) x.data[y].offset -= x.data[0].offset;
      }
    }

    if (x.exceptions) {
      x.exceptions = x.exceptions.map(x => {
        const obj = exceptions[x];
        if (obj) obj.exceptId = x;
        return obj;
      }).filter(x => x);
    }

    const rewriteWasm = (x, wasm, rewriteLocals = false) => {
      const locals = Object.keys(x.locals).reduce((acc, y) => {
        acc[x.locals[y].idx] = { ...x.locals[y], name: y };
        return acc;
      }, {});

      for (let i = 0; i < wasm.length; i++) {
        const y = wasm[i];
        const n = wasm[i + 1];
        if (y[0] === Opcodes.call) {
          const f = funcs.find(x => x.index === y[1]);
          if (!f) continue;

          y[1] = f.name;
        }

        if (y[0] === Opcodes.global_get || y[0] === Opcodes.global_set) {
          const global = invGlobals[y[1]];
          y.splice(0, 10, 'global', y[0], global.name, global.type);

          if (!x.globalInits) {
            if (!main.rewrittenGlobalInits) {
              for (const z in main.globalInits) {
                rewriteWasm(main, main.globalInits[z], true);
              }

              main.rewrittenGlobalInits = true;
            }

            x.globalInits = main.globalInits;
          }
        }

        if (rewriteLocals && typeof y[1] === 'number' && (y[0] === Opcodes.local_get || y[0] === Opcodes.local_set || y[0] === Opcodes.local_tee)) {
          const local = locals[y[1]];
          y.splice(1, 10, 'local', local.name, local.type);
        }

        if (y[0] === Opcodes.const && (n[0] === Opcodes.local_set || n[0] === Opcodes.local_tee)) {
          const l = locals[n[1]];
          if (!l) continue;
          if (![TYPES.string, TYPES.array, TYPES.bytestring].includes(l.metadata?.type)) continue;
          if (!x.pages) continue;

          const pageName = [...x.pages.keys()].find(z => z.endsWith(l.name));
          if (!pageName || allocated.has(pageName)) continue;
          allocated.add(pageName);

          y.splice(0, 10, 'alloc', pageName, x.pages.get(pageName).type, valtypeBinary);
        }

        if (y[0] === Opcodes.const && n[0] === Opcodes.global_set) {
          const l = invGlobals[n[1]];
          if (!l) continue;
          if (![TYPES.string, TYPES.array, TYPES.bytestring].includes(l.metadata?.type)) continue;
          if (!x.pages) continue;

          const pageName = [...x.pages.keys()].find(z => z.endsWith(l.name));
          if (!pageName || allocated.has(pageName)) continue;
          allocated.add(pageName);

          y.splice(0, 10, 'alloc', pageName, x.pages.get(pageName).type, valtypeBinary);
        }


        if (y[0] === Opcodes.i32_const && n[0] === Opcodes.throw) {
          const id = y[1];
          y.splice(0, 10, 'throw', exceptions[id].constructor, exceptions[id].message);

          // remove throw inst
          wasm.splice(i + 1, 1);
        }
      }
    };

    rewriteWasm(x, x.wasm);
  }

  _funcs.push(...exports);
};

const precompile = async () => {
  if (globalThis._porf_loadParser) await globalThis._porf_loadParser('@babel/parser');

  const dir = join(__dirname, 'builtins');

  const t = performance.now();

  let funcs = [];
  let fileCount = 0;
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.d.ts')) continue;
    fileCount++;

    globalThis.precompile = file;

    const t = performance.now();

    try {
      await compile(join(dir, file), funcs);
    } catch (e) {
      console.log(`\r${' '.repeat(100)}\r${' '.repeat(12)}${file}`);
      throw e;
    }

    process.stdout.write(`\r${' '.repeat(100)}\r\u001b[90m${`[${(performance.now() - t).toFixed(2)}ms]`.padEnd(16, ' ')}\u001b[0m\u001b[92m${file}\u001b[0m`);
  }

  console.log(`\r${' '.repeat(100)}\r\u001b[90m${`[${(performance.now() - t).toFixed(2)}ms]`.padEnd(16, ' ')}\u001b[0m\u001b[92mcompiled ${fileCount} files (${funcs.length} funcs)\u001b[0m`);

  return `// autogenerated by compiler/precompile.js
import { number } from './embedding.js';

export const BuiltinFuncs = function() {
${funcs.map(x => {
  const rewriteWasm = wasm => {
    const str = JSON.stringify(wasm.filter(x => x.length && x[0] != null))
      .replace(/\["alloc","(.*?)","(.*?)",(.*?)\]/g, (_, reason, type, valtype) => `...number(allocPage(scope, '${reason}', '${type}') * pageSize, ${valtype})`)
      .replace(/\["global",(.*?),"(.*?)",(.*?)\]/g, (_, opcode, name, valtype) => `...glbl(${opcode}, '${name}', ${valtype})`)
      .replace(/\"local","(.*?)",(.*?)\]/g, (_, name, valtype) => `loc('${name}', ${valtype})]`)
      .replace(/\[16,"(.*?)"]/g, (_, name) => `[16, ...builtin('${name}')]`)
      .replace(/\["throw","(.*?)","(.*?)"\]/g, (_, constructor, message) => `...internalThrow(scope, '${constructor}', \`${message}\`)`);

    return `(scope, {${`${str.includes('allocPage(') ? 'allocPage,' : ''}${str.includes('glbl(') ? 'glbl,' : ''}${str.includes('loc(') ? 'loc,' : ''}${str.includes('builtin(') ? 'builtin,' : ''}${str.includes('internalThrow(') ? 'internalThrow,' : ''}`.slice(0, -1)}}) => ` + str;
  };

  return `  this.${x.name} = {
    wasm: ${rewriteWasm(x.wasm)},
    params: ${JSON.stringify(x.params)}, typedParams: 1,
    returns: ${JSON.stringify(x.returns)}, ${x.returnType != null ? `returnType: ${JSON.stringify(x.returnType)}` : 'typedReturns: 1'},
    locals: ${JSON.stringify(Object.values(x.locals).slice(x.params.length).map(x => x.type))}, localNames: ${JSON.stringify(Object.keys(x.locals))},
${x.globalInits ? `    globalInits: {${Object.keys(x.globalInits).map(y => `${y}: ${rewriteWasm(x.globalInits[y])}`).join(',')}},\n` : ''}${x.data && x.data.length > 0 ? `    data: [${x.data.map(x => `[${x.offset ?? 'null'},[${x.bytes.join(',')}]]`).join(',')}],` : ''}
${x.table ? `    table: 1,` : ''}${x.constr ? `    constr: 1,` : ''}${x.hasRestArgument ? `    hasRestArgument: 1,` : ''}
  };`.replaceAll('\n\n', '\n').replaceAll('\n\n', '\n').replaceAll('\n\n', '\n');
}).join('\n')}
};`;
};

fs.writeFileSync(join(__dirname, 'generated_builtins.js'), await precompile());