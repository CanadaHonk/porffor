import { Opcodes, Valtype } from './wasmSpec.js';
import { TYPES, TYPE_NAMES } from './types.js';
import { createImport, importedFuncs } from './builtins.js';
import { log } from './log.js';

createImport('print', 1, 0);
createImport('printChar', 1, 0);
createImport('time', 0, 1);
createImport('timeOrigin', 0, 1);

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
    __Porffor_object_get_withHash: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_readValue: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_set: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_set_withHash: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_setStrict: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_setStrict_withHash: [ Valtype.f64, Valtype.i32 ],
    __Porffor_object_packAccessor: [ Valtype.f64 ]
  },
  params: {
    __Porffor_object_set: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32 ],
    __Porffor_object_set_withHash: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32, Valtype.i32, Valtype.i32 ],
    __Porffor_object_setStrict: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32 ],
    __Porffor_object_setStrict_withHash: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32, Valtype.i32, Valtype.i32 ],
    __Porffor_object_expr_init: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32 ],
    __Porffor_object_fastAdd: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32, Valtype.i32, Valtype.i32 ],
    __Porffor_object_class_value: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32 ],
    __Porffor_object_class_method: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32 ],
    __Porffor_object_define: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.f64, Valtype.i32, Valtype.i32, Valtype.i32 ],
    __Porffor_object_underlying: [ Valtype.f64, Valtype.i32 ]
  }
};

const argv = process.argv.slice();

const timing = {};
let defaultPrefs = null;
const compile = async (file, _funcs) => {
  let source = fs.readFileSync(file, 'utf8');
  let first = source.slice(0, source.indexOf('\n'));

  if (first.startsWith('export default')) {
    source = await (await import('file://' + file)).default({ TYPES, TYPE_NAMES });
    first = source.slice(0, source.indexOf('\n'));
  }

  let args = ['--module', '--truthy=no_nan_negative', '--no-rm-unused-types', '--fast-length', '--parse-types', '--opt-types', '--no-passive-data', '--active-data', '--no-treeshake-wasm-imports', '--no-coctc', '--no-closures', '--never-fallback-builtin-proto', '--unroll-threshold=0'];
  if (!defaultPrefs) {
    process.argv = argv.concat(args);
    globalThis.argvChanged?.();
    defaultPrefs = globalThis.Prefs;
  }

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

    if (x.name === '_eval') x.name = 'eval';
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
          if (!f) {
            if (idx < importedFuncs.length) {
              wasm[i] = [ Opcodes.call, importedFuncs[idx].name ];
            }

            continue;
          }

          wasm[i] = [ Opcodes.call, f.name ];
        }

        if (y[0] === Opcodes.global_get || y[0] === Opcodes.global_set) {
          const global = invGlobals[y[1]];
          wasm[i] = [ 'global', y[0], global.name, global.type ];

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
          wasm[i] = [ y[0], 'local', local.name, local.type ];
        }

        if (!n) continue;

        const alloc = l => {
          if (!l) return;
          if (![TYPES.array].includes(l.metadata?.type)) return;
          if (!x.pages) return;

          const pageName = [...x.pages.keys()].find(z => z.endsWith(l.name));
          if (!pageName || allocated.has(pageName)) return;
          allocated.add(pageName);

          wasm[i] = [ 'alloc', pageName, valtypeBinary ];
        };

        if (y[0] === Opcodes.const &&(n[0] === Opcodes.local_set || n[0] === Opcodes.local_tee)) {
          alloc(locals[n[1]]);
        }

        if (y[0] === Opcodes.const && n[0] === Opcodes.global_set) {
          alloc(invGlobals[n[1]]);
        }

        if (n[0] === Opcodes.throw) {
          x.usesTag = true;
          let id;
          if (y[0] === Opcodes.i32_const && n[1] === 0) {
            id = y[1];
            wasm[i] = [ 'throw', exceptions[id].constructor, exceptions[id].message ];

            // remove throw inst
            wasm.splice(i + 1, 1);
          } else {
            n[1]--;
          }

          if (!bodyHasTopLevelThrow && depth === 0) log.warning('codegen', `top-level throw in ${x.name} (${exceptions[id].constructor}: ${exceptions[id].message})`);
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
  console.log(`\r${' '.repeat(80)}\r\u001b[2m${`[${total.toFixed(2)}ms]`.padEnd(12, ' ')}\u001b[0m\u001b[92mcompiled ${funcs.length} funcs from ${fileCount} files\u001b[0m \u001b[90m(${['parse', 'codegen', 'opt'].map(x => `${x}: ${((timing[x] / total) * 100).toFixed(0)}%`).join(', ')})\u001b[0m`);

  const comptimeFlagChecks = {
    hasFunc: x => `hasFunc('${x}')`,
    hasType: x => `usedTypes.has(${TYPES[x]})`
  };

  return `// autogenerated by compiler/precompile.js
import { number } from './encoding.js';

const defaultPrefs = ${JSON.stringify(defaultPrefs)};
const resetGlobals = (Valtype,Opcodes)=>{valtype=Prefs.valtype??'f64';valtypeBinary=Valtype[valtype];Opcodes.const=valtypeBinary===Valtype.i32?Opcodes.i32_const:Opcodes.f64_const;Opcodes.eq=valtypeBinary===Valtype.i32?Opcodes.i32_eq:Opcodes.f64_eq;Opcodes.eqz=valtypeBinary===Valtype.i32?[[Opcodes.i32_eqz]]:[number(0),[Opcodes.f64_eq]];Opcodes.mul=valtypeBinary===Valtype.i32?Opcodes.i32_mul:Opcodes.f64_mul;Opcodes.add=valtypeBinary===Valtype.i32?Opcodes.i32_add:Opcodes.f64_add;Opcodes.sub=valtypeBinary===Valtype.i32?Opcodes.i32_sub:Opcodes.f64_sub;Opcodes.i32_to=valtypeBinary===Valtype.i32?[]:Opcodes.i32_trunc_sat_f64_s;Opcodes.i32_to_u=valtypeBinary===Valtype.i32?[]:Opcodes.i32_trunc_sat_f64_u;Opcodes.i32_from=valtypeBinary===Valtype.i32?[]:[Opcodes.f64_convert_i32_s];Opcodes.i32_from_u=valtypeBinary===Valtype.i32?[]:[Opcodes.f64_convert_i32_u];Opcodes.load=valtypeBinary===Valtype.i32?Opcodes.i32_load:Opcodes.f64_load;Opcodes.store=valtypeBinary===Valtype.i32?Opcodes.i32_store:Opcodes.f64_store;};

export const BuiltinFuncs = x => {
${funcs.map(x => {
  const rewriteWasm = wasm => {
    const str = JSON.stringify(wasm.filter(x => x.length && (x[0] != null || typeof x[1] === 'string')), (k, v) => {
      if (Number.isNaN(v) || v === Infinity || v === -Infinity) return v.toString();
      if (Object.is(v, -0)) return '-0';
      return v;
    })
      .replace(/\["alloc","(.*?)",(.*?)\]/g, (_, reason, valtype) => `[${+valtype === Valtype.i32 ? Opcodes.i32_const : Opcodes.f64_const},allocPage(_,'${reason}')]`)
      .replace(/\["global",(.*?),"(.*?)",(.*?)\]/g, (_, opcode, name, valtype) => `...glbl(${opcode},'${name}',${valtype})`)
      .replace(/\"local","(.*?)",(.*?)\]/g, (_, name, valtype) => `loc('${name}',${valtype})]`)
      .replace(/\[16,"(.*?)"]/g, (_, name) => `[16,builtin('${name}')]`)
      .replace(/\["funcref",(.*?),"(.*?)"]/g, (_1, op, name) => op === '65' ? `...i32ify(funcRef('${name}'))` : `...funcRef('${name}')`)
      .replace(/\["str",(.*?),"(.*?)",(.*?)]/g, (_1, op, str, bytestring) => op === '65' ? `...i32ify(makeString(_,"${str}",${bytestring === 'true' ? 1 : 0}))` : `...makeString(_,"${str}",${bytestring === 'true' ? 1 : 0})`)
      .replace(/\["throw","(.*?)","(.*?)"\]/g, (_, constructor, message) => `...internalThrow(_,'${constructor}',\`${message}\`)`)
      .replace(/\["get object","(.*?)"\]/g, (_, objName) => `...generateIdent(_,{name:'${objName}'})`)
      .replace(/\[null,"typeswitch case start",\[(.*?)\]\],/g, (_, types) => `...t([${types}],()=>[`)
      .replaceAll(',[null,"typeswitch case end"]', '])')
      .replace(/\[null,"comptime_flag","(.*?)",(\{.*?\}),"#",(\{.*?\}),"#",(\{.*?\})\]/g, (_, flag, passAst, failAst, prefs) => {
        const processAst = ast => JSON.stringify(
          JSON.parse(ast.replaceAll('\n', '\\n')),
          (k, v) => {
            if (k === 'loc' || k === 'start' || k === 'end') return undefined;
            return v;
          }
        );
        passAst = processAst(passAst);
        failAst = processAst(failAst);

        // ignore default prefs in prefs for better diff and size
        prefs = JSON.parse(prefs);
        const diffPrefs = Object.keys(prefs).reduce((acc, x) => { if (prefs[x] !== defaultPrefs[x]) acc[x] = prefs[x]; return acc; }, {});

        const [ id, extra ] = flag.split('.');
        return `[null,()=>{const a=Prefs;Prefs={...defaultPrefs,${JSON.stringify(diffPrefs).slice(1, -1)}};resetGlobals(Valtype,Opcodes);const b=generate(_,${comptimeFlagChecks[id](extra)}?${passAst}:${failAst});if(b.at(-1)[0]>=0x41&&b.at(-1)[0]<=0x44)b.pop();Prefs=a;resetGlobals(Valtype,Opcodes);return b;}]`;
      })
      .replaceAll('"-0"', '-0');

    return `(_,{${str.includes('usedTypes.') ? 'usedTypes,' : ''}${str.includes('hasFunc(') ? 'hasFunc,' : ''}${str.includes('Valtype') ? 'Valtype,' : ''}${str.includes('i32ify') ? 'i32ify,' : ''}${str.includes('Opcodes') ? 'Opcodes,' : ''}${str.includes('...t(') ? 't,' : ''}${`${str.includes('allocPage(') ? 'allocPage,' : ''}${str.includes('makeString(') ? 'makeString,' : ''}${str.includes('glbl(') ? 'glbl,' : ''}${str.includes('loc(') ? 'loc,' : ''}${str.includes('builtin(') ? 'builtin,' : ''}${str.includes('funcRef(') ? 'funcRef,' : ''}${str.includes('internalThrow(') ? 'internalThrow,' : ''}${str.includes('generateIdent(') ? 'generateIdent,' : ''}${str.includes('generate(') ? 'generate,' : ''}`.slice(0, -1)}})=>`.replace('_,{}', '') + `eval(${JSON.stringify(str)})`;
  };

  const locals = Object.entries(x.locals).sort((a,b) => a[1].idx - b[1].idx)

  // todo: check for other identifier unsafe characters
  const name = x.name.includes('#') ? `['${x.name}']` : `.${x.name}`;

  const returnTypes = [...(x.returnTypes ?? [])].filter(x => ![ TYPES.undefined, TYPES.number, TYPES.boolean, TYPES.function ].includes(x));
  return `x${name}={
wasm:${rewriteWasm(x.wasm)},
params:${JSON.stringify(x.params)},typedParams:1,returns:${JSON.stringify(x.returns)},${x.returnType != null ? `returnType:${JSON.stringify(x.returnType)},` : ''}${returnTypes.length > 0 ? `returnTypes:${JSON.stringify(returnTypes)},` : ''}jsLength:${x.jsLength},
locals:${JSON.stringify(locals.slice(x.params.length).map(x => x[1].type))},localNames:${JSON.stringify(locals.map(x => x[0]))},
${x.globalInits ? `globalInits:{${Object.keys(x.globalInits).map(y => `${y}:${rewriteWasm(x.globalInits[y])}`).join(',')}},` : ''}${x.data && Object.keys(x.data).length > 0 ? `data:${JSON.stringify(x.data)},` : ''}
${x.table ? `table:1,` : ''}${x.constr ? `constr:1,` : ''}${x.hasRestArgument ? `hasRestArgument:1,` : ''}${x.usesTag ? `usesTag:1,` : ''}${x.usesImports ? `usesImports:1,` : ''}
}`.replaceAll('\n\n', '\n').replaceAll('\n\n', '\n').replaceAll('\n\n', '\n').replaceAll(',\n}', '\n}');
}).join('\n')}
}`;
};

fs.writeFileSync(join(__dirname, 'builtins_precompiled.js'), await precompile());