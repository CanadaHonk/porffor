import { Opcodes, Valtype } from './wasmSpec.js';
import { read_signedLEB128, read_unsignedLEB128 } from './encoding.js';
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

const timing = {};
const compile = async (file, _funcs) => {
  let source = fs.readFileSync(file, 'utf8');
  let first = source.slice(0, source.indexOf('\n'));

  if (first.startsWith('export default')) {
    source = await (await import("file://" + file)).default();
    first = source.slice(0, source.indexOf('\n'));
  }

  let args = ['--bytestring', '--todo-time=compile', '--truthy=no_nan_negative', '--no-rm-unused-types', '--scoped-page-names', '--funsafe-no-unlikely-proto-checks', '--fast-length', '--parse-types', '--opt-types', '--no-passive-data', '--active-data'];
  if (first.startsWith('// @porf')) {
    args = first.slice('// @porf '.length).split(' ').concat(args);
  }
  process.argv = argv.concat(args);
  globalThis.argvChanged?.();

  const porfCompile = (await import(`./index.js?_=${Date.now()}`)).default;

  let { funcs, globals, data, exceptions, times } = porfCompile(source, ['module', 'typed']);

  timing.parse ??= 0;
  timing.parse += times[1] - times[0];
  timing.codegen ??= 0;
  timing.codegen += times[2] - times[1];
  timing.opt ??= 0;
  timing.opt += times[3] - times[2];

  const allocated = new Set();

  const invGlobals = Object.keys(globals).reduce((acc, y) => {
    acc[globals[y].idx] = { ...globals[y], name: y };
    return acc;
  }, {});

  const returnOverrides = {
    __Porffor_object_get: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_set: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_setStrict: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_packAccessor: [ Valtype.f64, Valtype.i32 ]
  };

  const paramOverrides = {
    __Porffor_object_set: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32 ],
    __Porffor_object_setStrict: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32 ],
    __Porffor_object_expr_init: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32 ],
    __Porffor_object_expr_initWithFlags: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32, Valtype.i32, Valtype.i32 ],
    __Porffor_object_define: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32, Valtype.i32, Valtype.i32 ],
  };

  const main = funcs.find(x => x.name === 'main');
  const exports = funcs.filter(x => x.export && x.name !== 'main');
  for (const x of exports) {
    if (x.data) {
      x.data = x.data.reduce((acc, x) => { acc[data[x].page] = data[x].bytes; return acc; }, {});
    }

    if (x.exceptions) {
      x.exceptions = x.exceptions.map(x => {
        const obj = exceptions[x];
        if (obj) obj.exceptId = x;
        return obj;
      }).filter(x => x);
    }

    if (returnOverrides[x.name]) x.returns = returnOverrides[x.name];
    if (paramOverrides[x.name]) x.params = paramOverrides[x.name];

    const rewriteWasm = (x, wasm, rewriteLocals = false) => {
      const locals = Object.keys(x.locals).reduce((acc, y) => {
        acc[x.locals[y].idx] = { ...x.locals[y], name: y };
        return acc;
      }, {});

      for (let i = 0; i < wasm.length; i++) {
        const y = wasm[i];
        const n = wasm[i + 1];
        if (y[0] === Opcodes.call) {
          const idx = y[1];
          const f = funcs.find(x => x.index === idx);
          if (!f) continue;

          y.splice(1, 10, f.name);
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

        if (!n) continue;

        if (y[0] === Opcodes.const &&(n[0] === Opcodes.local_set || n[0] === Opcodes.local_tee)) {
          const l = locals[n[1]];
          if (!l) continue;
          if (!['#member_prop'].includes(l.name) && ![TYPES.string, TYPES.array, TYPES.bytestring].includes(l.metadata?.type)) continue;
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
          const id = read_signedLEB128(y.slice(1));
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

    process.stdout.write(`\r${' '.repeat(100)}\r\u001b[90m${`[${(performance.now() - t).toFixed(2)}ms]`.padEnd(12, ' ')}\u001b[0m\u001b[92m${file}\u001b[0m`);
  }

  const total = performance.now() - t;
  console.log(`\r${' '.repeat(100)}\r\u001b[90m${`[${total.toFixed(2)}ms]`.padEnd(12, ' ')}\u001b[0m\u001b[92mcompiled ${fileCount} files (${funcs.length} funcs)\u001b[0m \u001b[90m(${['parse', 'codegen', 'opt'].map(x => `${x}: ${((timing[x] / total) * 100).toFixed(0)}%`).join(', ')})\u001b[0m`);

  return `// autogenerated by compiler/precompile.js
import { number } from './embedding.js';

export const BuiltinFuncs = function() {
${funcs.map(x => {
  const rewriteWasm = wasm => {
    const str = JSON.stringify(wasm.filter(x => x.length && x[0] != null), (k, v) => {
        if (Number.isNaN(v) || v === Infinity || v === -Infinity) return v.toString();
        return v;
      })
      .replace(/\["alloc","(.*?)","(.*?)",(.*?)\]/g, (_, reason, type, valtype) => `...number(allocPage(_,'${reason}','${type}'),${valtype})`)
      .replace(/\["global",(.*?),"(.*?)",(.*?)\]/g, (_, opcode, name, valtype) => `...glbl(${opcode},'${name}',${valtype})`)
      .replace(/\"local","(.*?)",(.*?)\]/g, (_, name, valtype) => `loc('${name}',${valtype})]`)
      .replace(/\[16,"(.*?)"]/g, (_, name) => `[16,builtin('${name}')]`)
      .replace(/\[68,"funcref","(.*?)"]/g, (_, name) => `...funcRef('${name}')`)
      .replace(/\["throw","(.*?)","(.*?)"\]/g, (_, constructor, message) => `...internalThrow(_,'${constructor}',\`${message}\`)`)
      .replace(/\["get object","(.*?)"\]/g, (_, objName) => `...generateIdent(_,{name:'${objName}'})`);

    return `(_,{${`${str.includes('allocPage(') ? 'allocPage,' : ''}${str.includes('glbl(') ? 'glbl,' : ''}${str.includes('loc(') ? 'loc,' : ''}${str.includes('builtin(') ? 'builtin,' : ''}${str.includes('funcRef(') ? 'funcRef,' : ''}${str.includes('internalThrow(') ? 'internalThrow,' : ''}${str.includes('generateIdent(') ? 'generateIdent,' : ''}`.slice(0, -1)}})=>`.replace('_,{}', '') + str;
  };

  const locals = Object.entries(x.locals).sort((a,b) => a[1].idx - b[1].idx)

  // todo: check for other identifier unsafe characters
  const name = x.name.includes('#') ? `['${x.name}']` : `.${x.name}`;

  return `this${name} = {
wasm:${rewriteWasm(x.wasm)},
params:${JSON.stringify(x.params)},typedParams:1,returns:${JSON.stringify(x.returns)},${x.returnType != null ? `returnType:${JSON.stringify(x.returnType)}` : 'typedReturns:1'},
locals:${JSON.stringify(locals.slice(x.params.length).map(x => x[1].type))},localNames:${JSON.stringify(locals.map(x => x[0]))},
${x.globalInits ? `globalInits:{${Object.keys(x.globalInits).map(y => `${y}:${rewriteWasm(x.globalInits[y])}`).join(',')}},` : ''}${x.data && Object.keys(x.data).length > 0 ? `data:${JSON.stringify(x.data)},` : ''}
${x.table ? `table:1,` : ''}${x.constr ? `constr:1,` : ''}${x.hasRestArgument ? `hasRestArgument:1,` : ''}
};`.replaceAll('\n\n', '\n').replaceAll('\n\n', '\n').replaceAll('\n\n', '\n');
}).join('\n')}
};`;
};

fs.writeFileSync(join(__dirname, 'builtins_precompiled.js'), await precompile());