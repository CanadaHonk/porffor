import { Valtype, FuncType, ExportDesc, Section, Magic, ModuleVersion, Opcodes, PageSize, Reftype } from './wasmSpec.js';
import { encodeVector, encodeString, encodeLocal, unsignedLEB128, signedLEB128, unsignedLEB128_into, signedLEB128_into, ieee754_binary64_into } from './encoding.js';
import { importedFuncs } from './builtins.js';
import { log } from './log.js';
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

const encodeNames = (funcs) => {
  const encodeSection = (id, section) => [
    id,
    ...unsignedLEB128(section.length),
    ...section
  ];

  const moduleSection = encodeString('js'); // TODO: filename?
  const functionsSection = encodeVector(
    funcs.map((x) => unsignedLEB128(x.index).concat(encodeString(x.name))),
  );
  const localsSection = encodeVector(
    funcs.map((x) =>
      unsignedLEB128(x.index).concat(
        encodeVector(
          Object.entries(x.locals).map(([name, local]) =>
            unsignedLEB128(local.idx).concat(encodeString(name)),
          ),
        ),
      ),
    ),
  );

  return [
    ...encodeSection(0, moduleSection),
    ...encodeSection(1, functionsSection),
    ...encodeSection(2, localsSection),
  ];
}

export default (funcs, globals, tags, pages, data, flags, noTreeshake = false) => {
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

  if (optLevel < 1 || !Prefs.treeshakeWasmImports || noTreeshake) {
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
    // also fix call_indirect types
    const delta = importedFuncs.length - importFuncs.length;
    for (const f of funcs) {
      f.originalIndex = f.index;
      f.index -= delta;

      for (const inst of f.wasm) {
        if ((inst[0] === Opcodes.call || inst[0] === Opcodes.return_call) && inst[1] >= importedFuncs.length) {
          inst[1] -= delta;
        }

        if (inst[0] === Opcodes.call_indirect) {
          const params = [];
          for (let i = 0; i < inst[1]; i++) {
            params.push(valtypeBinary, Valtype.i32);
          }

          if (inst.at(-1) === 'constr') {
            inst.pop();
            params.unshift(Valtype.i32);
          }

          let returns = [ valtypeBinary, Valtype.i32 ];
          if (inst.at(-1) === 'no_type_return') {
            inst.pop();
            returns = [ valtypeBinary ];
          }

          inst[1] = getType(params, returns);
        }
      }
    }
  }
  globalThis.importFuncs = importFuncs;

  if (Prefs.optLog) log('assemble', `treeshake: using ${importFuncs.length}/${importedFuncs.length} imports`);

  const importSection = importFuncs.length === 0 ? [] : createSection(
    Section.import,
    encodeVector(importFuncs.map(x => [ 0, ...encodeString(x.import), ExportDesc.func, getType(typeof x.params === 'object' ? x.params : new Array(x.params).fill(valtypeBinary), new Array(x.returns).fill(valtypeBinary)) ]))
  );

  const funcSection = createSection(
    Section.func,
    encodeVector(funcs.map(x => getType(x.params, x.returns))) // type indexes
  );

  const nameSection = Prefs.d ? customSection('name', encodeNames(funcs)) : [];

  const tableSection = !funcs.table ? [] : createSection(
    Section.table,
    encodeVector([ [ Reftype.funcref, 0x00, ...unsignedLEB128(funcs.length) ] ])
  );

  const elementSection = !funcs.table ? [] : createSection(
    Section.element,
    encodeVector([ [
      0x00,
      Opcodes.i32_const, 0, Opcodes.end,
      ...encodeVector(funcs.map(x => unsignedLEB128(x.index)))
    ] ])
  );

  if (pages.has('func lut') && !data.addedFuncArgcLut) {
    // generate func lut data
    const bytes = [];
    for (let i = 0; i < funcs.length; i++) {
      const argc = Math.floor(funcs[i].params.length / 2);
      bytes.push(argc % 256, (argc / 256 | 0) % 256);

      let flags = 0b00000000; // 8 flag bits
      if (funcs[i].returnType != null) flags |= 0b1;
      if (funcs[i].constr) flags |= 0b10;
      bytes.push(flags);
    }

    data.push({
      offset: pages.get('func lut').ind * pageSize,
      bytes
    });
    data.addedFuncArgcLut = true;
  }

  // const t0 = performance.now();

  // specially optimized assembly for globals as this version is much (>5x) faster than traditional createSection()
  const globalsValues = Object.values(globals);

  let globalSection = [];
  if (globalsValues.length > 0) {
    let data = unsignedLEB128(globalsValues.length);
    for (let i = 0; i < globalsValues.length; i++) {
      const global = globalsValues[i];

      switch (global.type) {
        case Valtype.i32:
          if (i > 0) data.push(Opcodes.end, Valtype.i32, 0x01, Opcodes.i32_const);
            else data.push(Valtype.i32, 0x01, Opcodes.i32_const);

          signedLEB128_into(global.init ?? 0, data);
          break;

        case Valtype.i64:
          if (i > 0) data.push(Opcodes.end, Valtype.i64, 0x01, Opcodes.i64_const);
            else data.push(Valtype.i64, 0x01, Opcodes.i64_const);

          signedLEB128_into(global.init ?? 0, data);
          break;

        case Valtype.f64:
          if (i > 0) data.push(Opcodes.end, Valtype.f64, 0x01, Opcodes.f64_const);
            else data.push(Valtype.f64, 0x01, Opcodes.f64_const);

          ieee754_binary64_into(global.init ?? 0, data);
          break;
      }
    }

    data.push(Opcodes.end);

    globalSection.push(Section.global);

    unsignedLEB128_into(data.length, globalSection);
    globalSection = globalSection.concat(data);
  }

  // if (Prefs.profileCompiler) {
  //   const log = console.log;
  //   console.log = function () {
  //     log.apply(this, arguments);
  //     console.log = log;
  //     console.log(`  a. assembled global section in ${(performance.now() - t0).toFixed(2)}ms\n`);
  //   };
  // }

  const exports = funcs.filter(x => x.export).map((x, i) => [ ...encodeString(x.name === 'main' ? 'm' : x.name), ExportDesc.func, x.index ]);

  if (Prefs.alwaysMemory && pages.size === 0) pages.set('--always-memory', 0);
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
    encodeVector(data.map(x => {
      // type: active
      if (x.offset != null) return [ 0x00, Opcodes.i32_const, ...signedLEB128(x.offset), Opcodes.end, ...encodeVector(x.bytes) ];

      // type: passive
      return [ 0x01, ...encodeVector(x.bytes) ];
    }))
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

  // compilation hints section - unspecd, v8 only
  // https://github.com/WebAssembly/design/issues/1473#issuecomment-1431274746
  const chSection = !compileHints ? [] : customSection(
    'compilationHints',
    // for now just do everything as optimize eager
    encodeVector(funcs.map(_ => chHint(0x02, 0x02, 0x02)))
  );

  return Uint8Array.from([
    ...Magic,
    ...ModuleVersion,
    ...typeSection,
    ...importSection,
    ...funcSection,
    ...chSection,
    ...tableSection,
    ...memorySection,
    ...tagSection,
    ...globalSection,
    ...exportSection,
    ...elementSection,
    ...dataCountSection,
    ...codeSection,
    ...dataSection,
    ...nameSection
  ]);
};