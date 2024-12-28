import { Opcodes, Valtype } from './wasmSpec.js';
import { read_signedLEB128, read_unsignedLEB128 } from './encoding.js';
import { TYPES } from './types.js';
import { log } from './log.js';

import process from 'node:process';
globalThis.process = process;

import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
globalThis.precompileCompilerPath = __dirname;
globalThis.precompile = true;

globalThis.valtypeOverrides = {
  returns: {
    __Porffor_object_get: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_getExplicit: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_readValue: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_set: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_setStrict: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_packAccessor: [ Valtype.f64, Valtype.i32 ]
  },
  params: {
    __Porffor_object_set: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32 ],
    __Porffor_object_setStrict: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32 ],
    __Porffor_object_expr_init: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32 ],
    __Porffor_object_expr_initWithFlags: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32, Valtype.i32, Valtype.i32 ],
    __Porffor_object_class_value: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32 ],
    __Porffor_object_class_method: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32 ],
    __Porffor_object_define: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32, Valtype.i32, Valtype.i32 ],
  }
};

const argv = process.argv.slice();

const timing = {};
const compile = async (file, _funcs) => {
  let source = fs.readFileSync(file, 'utf8');
  let first = source.slice(0, source.indexOf('\n'));

  if (first.startsWith('export default')) {
    source = await (await import('file://' + file)).default();
    first = source.slice(0, source.indexOf('\n'));
  }

  let args = ['--module', '--todo-time=compile', '--truthy=no_nan_negative', '--no-rm-unused-types', '--scoped-page-names', '--funsafe-no-unlikely-proto-checks', '--zero-checks=charCodeAt', '--fast-length', '--parse-types', '--opt-types', '--no-passive-data', '--active-data', '--no-treeshake-wasm-imports', '--no-coctc'];
  if (first.startsWith('// @porf')) {
    args = first.slice('// @porf '.length).split(' ').concat(args);
  }
  process.argv = argv.concat(args);
  globalThis.argvChanged?.();

  const porfCompile = (await import(`./index.js?_=${Date.now()}`)).default;

  let { funcs, globals, data, exceptions, times } = porfCompile(source);

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

  const main = funcs.find(x => x.name === '#main');
  const exports = funcs.filter(x => x.export && x.name !== '#main');
  for (const x of exports) {
    const body = globalThis.funcBodies[x.name];
    const bodyHasTopLevelThrow = body?.body && body.body.some(x => x.type === 'ThrowStatement');

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

    const rewriteWasm = (x, wasm, rewriteLocals = false) => {
      const locals = Object.keys(x.locals).reduce((acc, y) => {
        acc[x.locals[y].idx] = { ...x.locals[y], name: y };
        return acc;
      }, {});

      let depth = 0;
      for (let i = 0; i < wasm.length; i++) {
        const y = wasm[i];
        const n = wasm[i + 1];

        if (y[0] === Opcodes.block || y[0] === Opcodes.loop || y[0] === Opcodes.if || y[0] === Opcodes.try) depth++;
        if (y[0] === Opcodes.end) depth--;

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

        const alloc = l => {
          if (!l) return;
          if (![TYPES.array].includes(l.metadata?.type)) return;
          if (!x.pages) return;

          const pageName = [...x.pages.keys()].find(z => z.endsWith(l.name));
          if (!pageName || allocated.has(pageName)) return;
          allocated.add(pageName);

          y.splice(0, 10, 'alloc', pageName, valtypeBinary);
        };

        if (y[0] === Opcodes.const &&(n[0] === Opcodes.local_set || n[0] === Opcodes.local_tee)) {
          alloc(locals[n[1]]);
        }

        if (y[0] === Opcodes.const && n[0] === Opcodes.global_set) {
          alloc(invGlobals[n[1]]);
        }

        if (n[0] === Opcodes.throw) {
          if (!bodyHasTopLevelThrow && depth === 0) log.warning('codegen', `top-level throw in ${x.name}`);

          x.usesTag = true;
          if (y[0] === Opcodes.i32_const && n[1] === 0) {
            const id = read_signedLEB128(y.slice(1));
            y.splice(0, 10, 'throw', exceptions[id].constructor, exceptions[id].message);

            // remove throw inst
            wasm.splice(i + 1, 1);
          } else {
            n[1]--;
          }
        }

        if (n[0] === Opcodes.catch) {
          x.usesTag = true;
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
  for (const file of fs.readdirSync(dir).toSorted()) {
    if (file.endsWith('.d.ts')) continue;
    fileCount++;

    globalThis.precompile = file;
    const t = performance.now();

    try {
      await compile(join(dir, file), funcs);
    } catch (e) {
      console.log(`\r${' '.repeat(80)}\r${' '.repeat(12)}${file}\r`);
      throw e;
    }

    process.stdout.write(`\r${' '.repeat(80)}\r\u001b[2m${`[${(performance.now() - t).toFixed(2)}ms]`.padEnd(12, ' ')}\u001b[0m\u001b[92m${file}\u001b[0m\r`);
  }

  const total = performance.now() - t;
  console.log(`\r${' '.repeat(80)}\r\u001b[2m${`[${total.toFixed(2)}ms]`.padEnd(12, ' ')}\u001b[0m\u001b[92mcompiled ${fileCount} files/${funcs.length} funcs\u001b[0m \u001b[90m(${['parse', 'codegen', 'opt'].map(x => `${x}: ${((timing[x] / total) * 100).toFixed(0)}%`).join(', ')})\u001b[0m`);

  const comptimeFlagChecks = {
    hasFunc: x => `hasFunc('${x}')`
  };

  return `// autogenerated by compiler/precompile.js
import { number } from './embedding.js';

export const BuiltinFuncs = function() {
${funcs.map(x => {
  const rewriteWasm = wasm => {
    const str = JSON.stringify(wasm.filter(x => x.length && (x[0] != null || typeof x[1] === 'string')), (k, v) => {
      if (Number.isNaN(v) || v === Infinity || v === -Infinity) return v.toString();
      return v;
    })
      .replace(/\["alloc","(.*?)",(.*?)\]/g, (_, reason, valtype) => `number(allocPage(_,'${reason}'),${valtype})`)
      .replace(/\["global",(.*?),"(.*?)",(.*?)\]/g, (_, opcode, name, valtype) => `...glbl(${opcode},'${name}',${valtype})`)
      .replace(/\"local","(.*?)",(.*?)\]/g, (_, name, valtype) => `loc('${name}',${valtype})]`)
      .replace(/\[16,"(.*?)"]/g, (_, name) => `[16,builtin('${name}')]`)
      .replace(/\[(68|65),"funcref","(.*?)"]/g, (_1, op, name) => op === '65' ? `...i32ify(funcRef('${name}'))` : `...funcRef('${name}')`)
      .replace(/\[(68|65),"str","(.*?)",(.*?)]/g, (_1, op, str, forceBytestring) => op === '65' ? `...i32ify(makeString(_,${JSON.stringify(str)},${forceBytestring ? 1 : 0}))` : `...makeString(_,${JSON.stringify(str)},${forceBytestring ? 1 : 0})`)
      .replace(/\["throw","(.*?)","(.*?)"\]/g, (_, constructor, message) => `...internalThrow(_,'${constructor}',\`${message}\`)`)
      .replace(/\["get object","(.*?)"\]/g, (_, objName) => `...generateIdent(_,{name:'${objName}'})`)
      .replace(/\[null,"typeswitch case start",\[(.*?)\]\],/g, (_, types) => `...t([${types}],()=>[`)
      .replaceAll(',[null,"typeswitch case end"]', '])')
      .replace(/\[null,"comptime_flag","(.*?)",(\{.*?\}),"#",(\{.*?\})\]/g, (_, flag, ast, prefs) => {
        ast = JSON.parse(ast.replaceAll('\n', '\\n'));
        ast = JSON.stringify(ast, (k, v) => {
          if (k === 'loc' || k === 'start' || k === 'end') return undefined;
          return v;
        });

        const [ id, extra ] = flag.split('.');
        return `[null,()=>{if(${comptimeFlagChecks[id](extra)}){const r=()=>{valtype=Prefs.valtype??'f64';valtypeBinary=Valtype[valtype];const valtypeInd=['i32','i64','f64'].indexOf(valtype);Opcodes.i32_to=[[],[Opcodes.i32_wrap_i64],Opcodes.i32_trunc_sat_f64_s][valtypeInd];Opcodes.i32_to_u=[[],[Opcodes.i32_wrap_i64],Opcodes.i32_trunc_sat_f64_u][valtypeInd];Opcodes.i32_from=[[],[Opcodes.i64_extend_i32_s],[Opcodes.f64_convert_i32_s]][valtypeInd];Opcodes.i32_from_u=[[],[Opcodes.i64_extend_i32_u],[ Opcodes.f64_convert_i32_u]][valtypeInd]};const a=Prefs;Prefs=${prefs};r();const b=generate(_,${ast});Prefs=a;r();return b;}return []}]`;
      });

    return `(_,{${str.includes('hasFunc(') ? 'hasFunc,' : ''}${str.includes('Valtype[') ? 'Valtype,' : ''}${str.includes('i32ify') ? 'i32ify,' : ''}${str.includes('Opcodes.') ? 'Opcodes,' : ''}${str.includes('...t(') ? 't,' : ''}${`${str.includes('allocPage(') ? 'allocPage,' : ''}${str.includes('makeString(') ? 'makeString,' : ''}${str.includes('glbl(') ? 'glbl,' : ''}${str.includes('loc(') ? 'loc,' : ''}${str.includes('builtin(') ? 'builtin,' : ''}${str.includes('funcRef(') ? 'funcRef,' : ''}${str.includes('internalThrow(') ? 'internalThrow,' : ''}${str.includes('generateIdent(') ? 'generateIdent,' : ''}${str.includes('generate(') ? 'generate,' : ''}`.slice(0, -1)}})=>`.replace('_,{}', '') + str;
  };

  const locals = Object.entries(x.locals).sort((a,b) => a[1].idx - b[1].idx)

  // todo: check for other identifier unsafe characters
  const name = x.name.includes('#') ? `['${x.name}']` : `.${x.name}`;

  const usedTypes = [...(x.usedTypes ?? [])].filter(x => ![ TYPES.empty, TYPES.undefined, TYPES.number, TYPES.boolean, TYPES.function ].includes(x));

  return `this${name} = {
wasm:${rewriteWasm(x.wasm)},
params:${JSON.stringify(x.params)},typedParams:1,returns:${JSON.stringify(x.returns)},${x.returnType != null ? `returnType:${JSON.stringify(x.returnType)}` : 'typedReturns:1'},
locals:${JSON.stringify(locals.slice(x.params.length).map(x => x[1].type))},localNames:${JSON.stringify(locals.map(x => x[0]))},
${usedTypes.length > 0 ? `usedTypes:${JSON.stringify(usedTypes)},` : ''}
${x.globalInits ? `globalInits:{${Object.keys(x.globalInits).map(y => `${y}:${rewriteWasm(x.globalInits[y])}`).join(',')}},` : ''}${x.data && Object.keys(x.data).length > 0 ? `data:${JSON.stringify(x.data)},` : ''}
${x.table ? `table:1,` : ''}${x.constr ? `constr:1,` : ''}${x.hasRestArgument ? `hasRestArgument:1,` : ''}${x.usesTag ? `usesTag:1,` : ''}${x.usesImports ? `usesImports:1,` : ''}
}`.replaceAll('\n\n', '\n').replaceAll('\n\n', '\n').replaceAll('\n\n', '\n');
}).join('\n')}
}`;
};

fs.writeFileSync(join(__dirname, 'builtins_precompiled.js'), await precompile());