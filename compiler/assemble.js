import { Valtype, FuncType, ExportDesc, Section, Magic, Opcodes, PageSize, Reftype } from './wasmSpec.js';
import { encodeVector, encodeString, encodeLocal, unsignedLEB128, signedLEB128, unsignedLEB128_into, signedLEB128_into, ieee754_binary64, ieee754_binary64_into } from './encoding.js';
import { importedFuncs } from './builtins.js';
import { log } from './log.js';
import './prefs.js';

const createSection = (type, data) => [
  type,
  ...encodeVector(data)
];

const customSection = (name, data) => createSection(
  Section.custom,
  [ ...encodeString(name), ...data ]
);

const encodeNames = funcs => {
  const encodeSection = (id, section) => [
    id,
    ...unsignedLEB128(section.length),
    ...section
  ];

  const moduleSection = encodeString('js'); // TODO: filename?
  const functionsSection = encodeVector(
    funcs.map(x => unsignedLEB128(x.asmIndex).concat(encodeString(x.name))),
  );
  const localsSection = encodeVector(
    funcs.map(x => unsignedLEB128(x.asmIndex).concat(encodeVector(
      Object.entries(x.locals).map(([name, local]) =>
        unsignedLEB128(local.idx).concat(encodeString(name))
      )
    )))
  );

  return [
    ...encodeSection(0, moduleSection),
    ...encodeSection(1, functionsSection),
    ...encodeSection(2, localsSection),
  ];
};

export default (funcs, globals, tags, pages, data, noTreeshake = false) => {
  const types = [], typeCache = {};

  const getType = (params, returns) => {
    const hash = `${params.join(',')}_${returns.join(',')}`;
    if (Prefs.optLog) log('assemble', `getType(${JSON.stringify(params)}, ${JSON.stringify(returns)}) -> ${hash} | cache: ${typeCache[hash]}`);
    if (typeCache[hash] !== undefined) return typeCache[hash];

    const type = [ FuncType, ...encodeVector(params), ...encodeVector(returns) ];
    const idx = types.length;

    types.push(type);

    return typeCache[hash] = idx;
  };

  let t = performance.now();
  const time = msg => {
    if (!Prefs.profileAssemble) return;

    console.log(`${' '.repeat(50)}\r[${(performance.now() - t).toFixed(2)}ms] ${msg}`);
    t = performance.now();
  };

  let importFuncs = [], importDelta = 0;
  if (!Prefs.treeshakeWasmImports || noTreeshake) {
    importFuncs = importedFuncs;
  } else {
    let imports = new Map();

    // tree shake imports
    for (const f of funcs) {
      if (f.usesImports) for (const inst of f.wasm) {
        if (inst[0] === Opcodes.call && inst[1] < importedFuncs.length) {
          const idx = inst[1];
          const func = importedFuncs[idx];

          if (!imports.has(func.name)) imports.set(func.name, { ...func, idx: imports.size });
          inst[1] = imports.get(func.name).idx;
        }
      }
    }

    importFuncs = globalThis.importFuncs = [...imports.values()];
    importDelta = importedFuncs.length - importFuncs.length;
  }

  for (const f of funcs) {
    f.asmIndex = f.index - importDelta;
  }

  if (Prefs.optLog) log('assemble', `treeshake: using ${importFuncs.length}/${importedFuncs.length} imports`);

  const importSection = importFuncs.length === 0 ? [] : createSection(
    Section.import,
    encodeVector(importFuncs.map(x => [ 0, ...encodeString(x.import), ExportDesc.func, getType(typeof x.params === 'object' ? x.params : new Array(x.params).fill(valtypeBinary), new Array(x.returns).fill(valtypeBinary)) ]))
  );
  time('import section');

  const funcSection = createSection(
    Section.func,
    encodeVector(funcs.map(x => getType(x.params, x.returns))) // type indexes
  );
  time('func section');

  const nameSection = Prefs.d ? customSection('name', encodeNames(funcs)) : [];

  const indirectFuncs = funcs.filter(x => x.indirect);
  const tableSection = !funcs.table ? [] : createSection(
    Section.table,
    encodeVector([ [ Reftype.funcref, 0x00, ...unsignedLEB128(indirectFuncs.length) ] ])
  );
  time('table section');

  const elementSection = !funcs.table ? [] : createSection(
    Section.element,
    encodeVector([ [
      0x00,
      Opcodes.i32_const, 0, Opcodes.end,
      ...encodeVector(indirectFuncs.map(x => unsignedLEB128(x.asmIndex)))
    ] ])
  );
  time('element section');

  if (pages.has('func lut')) {
    if (data.addedFuncArgcLut) {
      // remove existing data
      data = data.filter(x => x.page !== 'func lut');
    }

    // generate func lut data
    const bytes = [];
    for (let i = 0; i < indirectFuncs.length; i++) {
      const func = indirectFuncs[i].wrapperOf;
      let name = func.name;

      // userland exposed .length
      let length = func.jsLength;
      if (length == null) {
        length = func.params.length;
        if (func.constr) length -= 4;
        if (!func.internal || func.typedParams) length = Math.floor(length / 2);

        // remove _this from internal prototype funcs
        if (func.internal && name.includes('_prototype_')) length--;
      }

      bytes.push(length % 256, (length / 256 | 0) % 256);

      let flags = 0b00000000; // 8 flag bits
      if (func.returnType != null) flags |= 0b01;
      if (func.constr) flags |= 0b10;
      bytes.push(flags);

      if (name.startsWith('#')) name = '';

      // eg: __String_prototype_toLowerCase -> toLowerCase
      if (name.startsWith('__')) name = name.split('_').pop();

      bytes.push(...new Uint8Array(new Int32Array([ Math.min(name.length, 48 - 5 - 4) ]).buffer));

      for (let i = 0; i < (48 - 3 - 4); i++) {
        const c = name.charCodeAt(i);
        bytes.push((c || 0) % 256);
      }
    }

    data.push({
      page: 'func lut',
      bytes
    });
    data.addedFuncArgcLut = true;
  }
  time('func lut');

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
  time('global section');

  if (Prefs.alwaysMemory && pages.size === 0) pages.set('--always-memory', 0);

  const usesMemory = pages.size > 0;
  const memorySection = !usesMemory ? [] : createSection(
    Section.memory,
    encodeVector([ [ 0x00, ...unsignedLEB128(Math.ceil((pages.size * pageSize) / PageSize)) ] ])
  );
  time('memory section');

  const exports = funcs.filter(x => x.export).map((x, i) => [ ...encodeString(x.name === '#main' ? 'm' : x.name), ExportDesc.func, ...unsignedLEB128(x.asmIndex) ]);

  // export memory if used
  if (usesMemory) exports.unshift([ ...encodeString('$'), ExportDesc.mem, 0x00 ]);
  time('gen exports');

  const tagSection = tags.length === 0 ? [] : createSection(
    Section.tag,
    encodeVector(tags.map(x => [ 0x00, getType(x.params, x.results) ]))
  );

  // export first tag if used
  if (tags.length !== 0) exports.unshift([ ...encodeString('0'), ExportDesc.tag, 0x00 ]);
  time('tag section');

  const exportSection = createSection(
    Section.export,
    encodeVector(exports)
  );
  time('export section');

  let codeSection = [];
  for (let i = 0; i < funcs.length; i++) {
    const x = funcs[i];
    // time(x.name);
    const locals = Object.values(x.locals).sort((a, b) => a.idx - b.idx);
    // time('  locals gen');

    const paramCount = x.params.length;
    let localDecl = [], typeCount = 0, lastType, declCount = 0;
    for (let i = paramCount; i <= locals.length; i++) {
      const local = locals[i];
      if (i !== paramCount && local?.type !== lastType) {
        unsignedLEB128_into(typeCount, localDecl);
        localDecl.push(lastType);
        typeCount = 0;
        declCount++;
      }

      typeCount++;
      lastType = local?.type;
    }

    // time('  localDecl gen');

    const makeAssembled = Prefs.d;
    let wasm = [], wasmNonFlat = [];
    for (let i = 0; i < x.wasm.length; i++) {
      let o = x.wasm[i];

      // encode local/global ops as unsigned leb128 from raw number
      if (
        (o[0] >= Opcodes.local_get && o[0] <= Opcodes.global_set) &&
        o[1] > 127
      ) {
        const n = o[1];
        o = [ o[0] ];
        unsignedLEB128_into(n, o);
      }

      // encode f64.const ops as ieee754 from raw number
      if (o[0] === Opcodes.f64_const) {
        const n = o[1];
        o = ieee754_binary64(n);
        if (o.length === 8) o.unshift(Opcodes.f64_const);
      }

      // encode call ops as unsigned leb128 from raw number
      if ((o[0] === Opcodes.call /* || o[0] === Opcodes.return_call */) && o[1] >= importedFuncs.length) {
        const n = o[1] - importDelta;
        o = [ Opcodes.call ];
        unsignedLEB128_into(n, o);
      }

      // encode call indirect ops as types from info
      if (o[0] === Opcodes.call_indirect) {
        o = [...o];
        const params = [];
        for (let i = 0; i < o[1]; i++) {
          params.push(valtypeBinary, Valtype.i32);
        }

        let returns = [ valtypeBinary, Valtype.i32 ];
        if (o.at(-1) === 'no_type_return') {
          o.pop();
          returns = [ valtypeBinary ];
        }

        o[1] = getType(params, returns);
      }

      for (let j = 0; j < o.length; j++) {
        const x = o[j];
        if (x == null || !(x <= 0xff)) continue;
        wasm.push(x);
      }

      if (makeAssembled) wasmNonFlat.push(o);
    }
    // time('  wasm transform');

    if (makeAssembled) {
      x.assembled = { localDecl, wasm, wasmNonFlat };
    }

    let out = unsignedLEB128(declCount)
      .concat(localDecl, wasm, Opcodes.end);

    codeSection.push(
      ...unsignedLEB128(out.length),
      ...out
    );

    // time('  finish');
  }

  codeSection.unshift(...unsignedLEB128(funcs.length, codeSection));
  codeSection.unshift(Section.code, ...unsignedLEB128(codeSection.length));
  time('code section');

  const typeSection = createSection(
    Section.type,
    encodeVector(types)
  );
  time('type section');

  let dataSection = [];
  if (data.length > 0) {
    for (let i = 0; i < data.length; i++) {
      const x = data[i];
      if (Prefs.d && x.bytes.length > PageSize) log.warning('assemble', `data (${x.page}) has more bytes than Wasm page size! (${x.bytes.length})`);

      if (x.page != null) {
        // type: active
        let offset = pages.allocs.get(x.page) ?? (pages.get(x.page) * pageSize);
        if (offset === 0) offset = 16;
        dataSection.push(0x00, Opcodes.i32_const, ...signedLEB128(offset), Opcodes.end);
      } else {
        // type: passive
        dataSection.push(0x01);
      }

      dataSection.push(
        ...unsignedLEB128(x.bytes.length),
        ...x.bytes
      );
    }

    dataSection.unshift(...unsignedLEB128(data.length, dataSection));
    dataSection.unshift(Section.data, ...unsignedLEB128(dataSection.length));
  }

  const dataCountSection = data.length === 0 ? [] : createSection(
    Section.data_count,
    unsignedLEB128(data.length)
  );
  time('data section');

  return Uint8Array.from([
    ...Magic,
    ...typeSection,
    ...importSection,
    ...funcSection,
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