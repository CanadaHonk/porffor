import { Valtype, FuncType, Empty, ExportDesc, Section, Magic, ModuleVersion, Opcodes, PageSize } from './wasmSpec.js';
import { encodeVector, encodeString, encodeLocal, unsignedLEB128, signedLEB128 } from './encoding.js';
import { number } from './embedding.js';
import { importedFuncs } from './builtins.js';
import { log } from "./log.js";
import Prefs from './prefs.js';

const createSection = (type, data) => [
  type,
  ...encodeVector(data)
];

const customSection = (name, data) => [
  Section.custom,
  ...encodeVector([...encodeString(name), ...data])
];

const chHint = (topTier, baselineTier, strategy) => {
  // 1 byte of 4 2 bit components: spare, top tier, baseline tier, compilation strategy
  // tiers: 0x00 = default, 0x01 = baseline (liftoff), 0x02 = optimized (turbofan)
  // strategy: 0x00 = default, 0x01 = lazy, 0x02 = eager, 0x03 = lazy baseline, eager top tier
  return (strategy | (baselineTier << 2) | (topTier << 4));
};

export default (funcs, globals, tags, pages, data, flags) => {
  const types = [], typeCache = {};

  const optLevel = parseInt(process.argv.find(x => x.startsWith('-O'))?.[2] ?? 1);

  const compileHints = Prefs.compileHints;
  if (compileHints) log.warning('assemble', 'compile hints is V8 only w/ experimental arg! (you used -compile-hints)');

  const getType = (params, returns) => {
    const hash = `${params.join(',')}_${returns.join(',')}`;
    if (Prefs.optLog) log('assemble', `getType(${JSON.stringify(params)}, ${JSON.stringify(returns)}) -> ${hash} | cache: ${typeCache[hash]}`);
    if (optLevel >= 1 && typeCache[hash] !== undefined) return typeCache[hash];

    const type = [ FuncType, ...encodeVector(params), ...encodeVector(returns) ];
    const idx = types.length;

    types.push(type);

    return typeCache[hash] = idx;
  };

  let importFuncs = [];

  if (optLevel < 1) {
    importFuncs = importedFuncs;
  } else {
    let imports = new Map();

    // tree shake imports
    for (const f of funcs) {
      for (const inst of f.wasm) {
        if ((inst[0] === Opcodes.call || inst[0] === Opcodes.return_call) && inst[1] < importedFuncs.length) {
          const idx = inst[1];
          const func = importedFuncs[idx];

          if (!imports.has(func.name)) imports.set(func.name, { ...func, idx: imports.size });
          inst[1] = imports.get(func.name).idx;
        }
      }
    }

    importFuncs = [...imports.values()];

    // fix call indexes for non-imports
    const delta = importedFuncs.length - importFuncs.length;
    for (const f of funcs) {
      f.originalIndex = f.index;
      f.index -= delta;

      for (const inst of f.wasm) {
        if ((inst[0] === Opcodes.call || inst[0] === Opcodes.return_call) && inst[1] >= importedFuncs.length) {
          inst[1] -= delta;
        }
      }
    }
  }
  globalThis.importFuncs = importFuncs;

  if (Prefs.optLog) log('assemble', `treeshake: using ${importFuncs.length}/${importedFuncs.length} imports`);

  const importSection = importFuncs.length === 0 ? [] : createSection(
    Section.import,
    encodeVector(importFuncs.map(x => [ 0, ...encodeString(x.import), ExportDesc.func, getType(new Array(x.params).fill(valtypeBinary), new Array(x.returns).fill(valtypeBinary)) ]))
  );

  const funcSection = createSection(
    Section.func,
    encodeVector(funcs.map(x => getType(x.params, x.returns))) // type indexes
  );

  // compilation hints section - unspecd, v8 only
  // https://github.com/WebAssembly/design/issues/1473#issuecomment-1431274746
  const chSection = !compileHints ? [] : customSection(
    'compilationHints',
    // for now just do everything as optimize eager
    encodeVector(funcs.map(_ => chHint(0x02, 0x02, 0x02)))
  );

  const globalSection = Object.keys(globals).length === 0 ? [] : createSection(
    Section.global,
    encodeVector(Object.keys(globals).map(x => [ globals[x].type, 0x01, ...number(globals[x].init ?? 0, globals[x].type).flat(), Opcodes.end ]))
  );

  const exports = funcs.filter(x => x.export).map((x, i) => [ ...encodeString(x.name === 'main' ? 'm' : x.name), ExportDesc.func, x.index ]);

  if (Prefs.alwaysMemory && pages.size === 0) pages.set('-always-memory', 0);
  if (optLevel === 0) pages.set('O0 precaution', 0);

  const usesMemory = pages.size > 0;
  const memorySection = !usesMemory ? [] : createSection(
    Section.memory,
    encodeVector([ [ 0x00, ...unsignedLEB128(Math.ceil((pages.size * pageSize) / PageSize)) ] ])
  );

  // export memory if used
  if (usesMemory) exports.unshift([ ...encodeString('$'), ExportDesc.mem, 0x00 ]);

  const tagSection = tags.length === 0 ? [] : createSection(
    Section.tag,
    encodeVector(tags.map(x => [ 0x00, getType(x.params, x.results) ]))
  );

  // export first tag if used
  if (tags.length !== 0) exports.unshift([ ...encodeString('0'), ExportDesc.tag, 0x00 ]);

  const exportSection = createSection(
    Section.export,
    encodeVector(exports)
  );

  const codeSection = createSection(
    Section.code,
    encodeVector(funcs.map(x => {
      const locals = Object.values(x.locals).sort((a, b) => a.idx - b.idx).slice(x.params.length).sort((a, b) => a.idx - b.idx);

      let localDecl = [], typeCount = 0, lastType;
      for (let i = 0; i < locals.length; i++) {
        const local = locals[i];
        if (i !== 0 && local.type !== lastType) {
          localDecl.push(encodeLocal(typeCount, lastType));
          typeCount = 0;
        }

        typeCount++;
        lastType = local.type;
      }

      if (typeCount !== 0) localDecl.push(encodeLocal(typeCount, lastType));

      return encodeVector([ ...encodeVector(localDecl), ...x.wasm.flat().filter(x => x != null && x <= 0xff), Opcodes.end ]);
    }))
  );

  const typeSection = createSection(
    Section.type,
    encodeVector(types)
  );

  const dataSection = data.length === 0 ? [] : createSection(
    Section.data,
    encodeVector(data.map(x => [ 0x00, Opcodes.i32_const, ...signedLEB128(x.offset), Opcodes.end, ...encodeVector(x.bytes) ]))
  );

  const dataCountSection = data.length === 0 ? [] : createSection(
    Section.data_count,
    unsignedLEB128(data.length)
  );

  if (Prefs.sections) console.log({
    typeSection: typeSection.map(x => x.toString(16)),
    importSection: importSection.map(x => x.toString(16)),
    funcSection: funcSection.map(x => x.toString(16)),
    globalSection: globalSection.map(x => x.toString(16)),
    exportSection: exportSection.map(x => x.toString(16)),
    codeSection: codeSection.map(x => x.toString(16)),
    dataSection: dataSection.map(x => x.toString(16)),
  });

  return Uint8Array.from([
    ...Magic,
    ...ModuleVersion,
    ...typeSection,
    ...importSection,
    ...funcSection,
    ...chSection,
    ...memorySection,
    ...tagSection,
    ...globalSection,
    ...exportSection,
    ...dataCountSection,
    ...codeSection,
    ...dataSection
  ]);
};