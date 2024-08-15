import { Valtype, FuncType, ExportDesc, Section, Magic, ModuleVersion, Opcodes, PageSize, Reftype } from './wasmSpec.js';
import { encoder } from './encoding.js';
import { importedFuncs } from './builtins.js';
import { log } from './log.js';
import {} from './prefs.js';

const chHint = (topTier, baselineTier, strategy) => {
  // 1 byte of 4 2 bit components: spare, top tier, baseline tier, compilation strategy
  // tiers: 0x00 = default, 0x01 = baseline (liftoff), 0x02 = optimized (turbofan)
  // strategy: 0x00 = default, 0x01 = lazy, 0x02 = eager, 0x03 = lazy baseline, eager top tier
  return (strategy | (baselineTier << 2) | (topTier << 4));
};

const encodeNames = (e, funcs) => {
  const moduleSection = e => e.writeString('js'); // TODO: filename?
  const functionsSection = e => e.writeVector(funcs, (e, x) => {
    e.writeUnsignedLEB128(x.asmIndex);
    e.writeString(x.name);
  });
  const localsSection = e => e.writeVector(funcs, (e, x) => {
    e.writeUnsignedLEB128(x.asmIndex);
    e.writeVector(Object.entries(x.locals), (e, [name, local]) => {
      e.writeUnsignedLEB128(local.idx);
      e.writeString(name);
    });
  });

  e.write(0);
  e.writeSection(moduleSection);
  e.write(1);
  e.writeSection(functionsSection);
  e.write(2);
  e.writeSection(localsSection);
};

export default (funcs, globals, tags, pages, data, flags, noTreeshake = false) => {
  encoder.length.value = 0;
  let e = encoder;

  const types = [], typeCache = {};

  const optLevel = parseInt(process.argv.find(x => x.startsWith('-O'))?.[2] ?? 1);

  const compileHints = Prefs.compileHints;
  if (compileHints) log.warning('assemble', 'compile hints is V8 only w/ experimental arg! (you used -compile-hints)');

  const getType = (params, returns) => {
    const hash = `${params.join(',')}_${returns.join(',')}`;
    if (Prefs.optLog) log('assemble', `getType(${JSON.stringify(params)}, ${JSON.stringify(returns)}) -> ${hash} | cache: ${typeCache[hash]}`);
    if (typeCache[hash] !== undefined) return typeCache[hash];

    const type = [ params, returns ];
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
  if (optLevel < 1 || !Prefs.treeshakeWasmImports || noTreeshake) {
    importFuncs = importedFuncs;
  } else {
    let imports = new Map();

    // tree shake imports
    for (const f of funcs) {
      for (const inst of f.wasm) {
        if ((inst[0] === Opcodes.call /* || inst[0] === Opcodes.return_call */) && inst[1] < importedFuncs.length) {
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

  for (let x of funcs) {
    x.asmIndex = x.index - importDelta;
  }

  time('treeshake import funcs');

  if (Prefs.optLog) log('assemble', `treeshake: using ${importFuncs.length}/${importedFuncs.length} imports`);

  let importSection;
  if (importFuncs.length !== 0) {
    importSection = e.writeSectionToBuffer(Section.import, e => e.writeVector(importFuncs, (e, x) => {
      e.writeString('');
      e.writeString(x.import);
      e.write(ExportDesc.func);
      e.writeUnsignedLEB128(getType(
        Array.isArray(x.params) ? x.params : new Array(x.params).fill(valtypeBinary),
        Array.isArray(x.returns) ? x.returns : new Array(x.returns).fill(valtypeBinary)
      ));
    }));
    time('import section');
  }

  const funcSection = e.writeSectionToBuffer(Section.func, e => e.writeVector(funcs, (e, x) => {
    e.writeUnsignedLEB128(getType(x.params, x.returns)); // type indices
  }));
  time('func section');

  let nameSection;
  if (Prefs.d) {
    nameSection = e.writeSectionToBuffer(Section.custom, e => {
      e.writeString('name');
      encodeNames(e, funcs);
    });
    time('name section');
  }

  let tableSection, elementSection;
  if (funcs.table) {
    tableSection = e.writeSectionToBuffer(Section.table, e => e.writeVector([0], e => {
      e.write(Reftype.funcref);
      e.write(0x00);
      e.writeUnsignedLEB128(funcs.length);
    }));
    time('table section');

    elementSection = e.writeSectionToBuffer(Section.element, e => e.writeVector([0], e => {
      e.write(0x00);
      e.write(Opcodes.i32_const);
      e.write(0);
      e.write(Opcodes.end);
      e.writeVector(funcs, (e, x) => e.writeUnsignedLEB128(x.asmIndex));
    }));
    time('element section');
  }

  if (pages.has('func lut')) {
    const offset = pages.get('func lut').ind * pageSize;
    if (data.addedFuncArgcLut) {
      // remove existing data
      data = data.filter(x => x.page !== 'func lut');
    }

    // generate func lut data
    const bytes = [];
    for (let i = 0; i < funcs.length; i++) {
      const func = funcs[i];
      let name = func.name;

      // real argc
      let argc = func.params.length;
      if (func.constr) argc -= 4;
      if (!func.internal || func.typedParams) argc = Math.floor(argc / 2);

      bytes.push(argc % 256, (argc / 256 | 0) % 256);

      // userland exposed .length
      let length = func.jsLength ?? argc;
      // remove _this from internal prototype funcs
      if (func.internal && name.includes('_prototype_')) length--;

      bytes.push(length % 256, (length / 256 | 0) % 256);

      let flags = 0b00000000; // 8 flag bits
      if (func.returnType != null) flags |= 0b01;
      if (func.constr) flags |= 0b10;
      bytes.push(flags);

      if (name.startsWith('#')) name = '';

      // eg: __String_prototype_toLowerCase -> toLowerCase
      if (name.startsWith('__')) name = name.split('_').pop();

      bytes.push(...new Uint8Array(new Int32Array([ name.length ]).buffer));

      for (let i = 0; i < (64 - 5 - 4); i++) {
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

  const globalsValues = Object.values(globals);

  let globalSection;
  if (globalsValues.length > 0) {
    globalSection = e.writeSectionToBuffer(Section.global, e => {
      e.writeVector(globalsValues, (e, global) => {
        switch (global.type) {
          case Valtype.i32:
            e.writeData([ Valtype.i32, 0x01, Opcodes.i32_const ]);
            e.writeSignedLEB128(global.init ?? 0);
            break;

          case Valtype.i64:
            e.writeData(Valtype.i64, 0x01, Opcodes.i64_const);
            e.writeSignedLEB128(global.init ?? 0);
            break;

          case Valtype.f64:
            e.writeData([ Valtype.f64, 0x01, Opcodes.f64_const ]);
            e.writeDouble(global.init ?? 0);
            break;
        }
        e.write(Opcodes.end);
      });
    });
    time('global section');
  }

  if (Prefs.alwaysMemory && pages.size === 0) pages.set('--always-memory', 0);

  const usesMemory = pages.size > 0;
  let memorySection;
  if (usesMemory) {
    memorySection = e.writeSectionToBuffer(Section.memory, e => e.writeVector([0], e => {
      e.write(0x00);
      e.writeUnsignedLEB128(Math.ceil((pages.size * pageSize) / PageSize));
    }));
    time('memory section');
  }

  let tagSection;
  if (tags.length > 0) {
    tagSection = e.writeSectionToBuffer(Section.tag, e => {
      e.writeVector(tags, (e, x) => {
        e.write(0x00);
        e.writeUnsignedLEB128(getType(x.params, x.results));
      });
    });
    time('tag section');
  }

  const exportSection = e.writeSectionToBuffer(Section.export, e => {
    let exportFuncs = funcs.filter(x => x.export);
    let exportCount = exportFuncs.length;
    if (usesMemory) {
      exportCount++;
    }
    if (tagSection) {
      exportCount++;
    }
    e.writeUnsignedLEB128(exportCount);
    for (let x of exportFuncs) {
      e.writeString(x.name === 'main' ? 'm' : x.name);
      e.write(ExportDesc.func);
      e.writeUnsignedLEB128(x.asmIndex);
    }

    // export memory if used
    if (usesMemory) {
      e.writeString('$');
      e.write(ExportDesc.mem);
      e.write(0x00);
    }

    // export first tag if used
    if (tagSection) {
      e.writeString('0');
      e.write(ExportDesc.tag);
      e.write(0x00);
    }
  });
  time('export section');

  const codeSection = e.writeSectionToBuffer(Section.code, e => e.writeVector(funcs, (e, x) => {
    e.writeSection(e => {
      // time(x.name);
      let oldPtr = e.length.value;

      const locals = Object.values(x.locals).sort((a, b) => a.idx - b.idx).slice(x.params.length);
      // time('  locals gen');

      let localDecl = [], typeCount = 0, lastType;
      for (let i = 0; i < locals.length; i++) {
        const local = locals[i];
        if (i !== 0 && local.type !== lastType) {
          localDecl.push([ typeCount, lastType ]);
          typeCount = 0;
        }

        typeCount++;
        lastType = local.type;
      }

      if (typeCount !== 0) localDecl.push([ typeCount, lastType ]);
      // time('  localDecl gen');
      e.writeUnsignedLEB128(localDecl.length);
      for (let i = 0; i < localDecl.length; i++) {
        e.writeUnsignedLEB128(localDecl[i][0]);
        e.write(localDecl[i][1]);
      }

      const makeDebugInformation = Prefs.d;
      let offsetTable = [];
      for (let i = 0; i < x.wasm.length; i++) {
        if (makeDebugInformation) offsetTable.push(e.length.value - oldPtr);
        let o = x.wasm[i];
        let op = o[0];
        if (typeof op !== 'number') {
          if (op === null) {
            continue;
          }
          e.writeData(op);
          let op2 = op[1] | 0;
          if (op[0] === 0xfc) {
            switch (op2) {
              case /* Opcodes.memory_init[1] */ 0x08:
                e.writeUnsignedLEB128(o[1]); // <dataidx>
                e.write(0x00); // <memoryidx> = 0
                break;
              case /* Opcodes.data_drop[1] */ 0x09:
                e.writeUnsignedLEB128(o[1]); // <dataidx>
                break;
              case /* Opcodes.memory_copy[1] */ 0x0a:
                e.write(0x00); // <memoryidx> = 0
                e.write(0x00); // <memoryidx> = 0
                break;
              case /* Opcodes.memory_fill[1] */ 0x0b:
                e.write(0x00); // <memoryidx> = 0
                break;
            }
          } else if (op[0] == 0xfd) {
            if (op2 <= /* Opcodes.v128_store[1] */ 0x0b) {
              e.writeUnsignedLEB128(o[1]); // align
              e.writeUnsignedLEB128(o[2]); // offset
            } else if (op2 == /* Opcodes.v128_const[1] */ 0x0c) {
              e.writeI32x4(o[1], o[2], o[3], o[4]);
            } else if (op2 == /* Opcodes.i8x16_shuffle[1] */ 0x0d) {
              e.writeData(o[1]); // <laneidx> * 16
            } else if (op2 <= /* Opcodes.f64x2_replace_lane[1] */ 0x22) {
              if (op2 >= /* Opcodes.i8x16_extract_lane_s */ 0x15) {
                e.write(o[3]); // <laneidx>
              }
            } else if (op2 <= /* Opcodes.v128_store64_lane[1] */ 0x5b) {
              if (op2 >= /* Opcodes.v128_load8_lane */ 0x54) {
                e.writeUnsignedLEB128(o[1]); // align
                e.writeUnsignedLEB128(o[2]); // offset
                e.write(o[3]); // <laneidx>
              }
            } else if (op2 <= /* Opcodes.v128_load64_zero[1] */ 0x5d) {
              e.writeUnsignedLEB128(o[1]); // align
              e.writeUnsignedLEB128(o[2]); // offset
            }
          }
          continue;
        } else {
          e.write(op);
        }

        switch (op) {
          // <localidx>
          case /* Opcodes.local_get */ 0x20:
          case /* Opcodes.local_set */ 0x21:
          case /* Opcodes.local_tee */ 0x22:
          // <globalidx>
          case /* Opcodes.global_get */ 0x23:
          case /* Opcodes.global_set */ 0x24:
          // <labelidx>
          case /* Opcodes.br */ 0x0c:
          case /* Opcodes.br_if */ 0x0d:
          // <tagidx>
          case /* Opcodes.throw */ 0x08:
            e.writeUnsignedLEB128(o[1]);
            break;
          // <funcidx>
          case /* Opcodes.call */ 0x10:
          case /* Opcodes.return_call */ 0x12:
            if (o[1] >= importedFuncs.length) {
              e.writeUnsignedLEB128(o[1] - importDelta);
            } else {
              e.writeUnsignedLEB128(o[1]);
            }
            break;
          case /* Opcodes.i32_const */ 0x41:
            e.writeSignedLEB128(o[1]);
            break;
          case /* Opcodes.i64_const */ 0x42:
            e.writeLongSignedLEB128(o[1]);
            break;
          case /* Opcodes.f32_const */ 0x43:
            e.writeFloat(o[1]);
            break;
          case /* Opcodes.f64_const */ 0x44:
            e.writeDouble(o[1]);
            break;
          case /* Opcodes.block */ 0x02:
          case /* Opcodes.loop */ 0x03:
          case /* Opcodes.if */ 0x04:
          case /* Opcodes.try */ 0x06:
            if (Array.isArray(o[1])) {
              e.writeSignedLEB128(getType(o[1][0], o[1][1])); // supposed to be s33
            } else {
              e.write(o[1]);
            }
            break;
          case /* Opcodes.br_table */ 0x0e:
            let a = o[1];
            e.writeUnsignedLEB128(a.length);
            for (let i = 0; i < a.length; i++) {
              e.writeUnsignedLEB128(a[i]);
            }
            e.writeUnsignedLEB128(o[2]);
            break;
          case /* Opcodes.call_indirect */ 0x11:
            const params = [];
            for (let i = 0; i < o[1]; i++) {
              params.push(valtypeBinary, Valtype.i32);
            }

            let returns = [ valtypeBinary, Valtype.i32 ];
            if (o.at(-1) === 'no_type_return') {
              returns = [ valtypeBinary ];
            }

            e.writeUnsignedLEB128(getType(params, returns));
            e.writeUnsignedLEB128(o[2]); // <tableidx>
            break;
          case /* Opcodes.memory_size */ 0x3f:
          case /* Opcodes.memory_grow */ 0x40:
            e.write(0x00); // <memoryidx> = 0
            break;
          default:
            if (op >= /* Opcodes.i32_load */ 0x28 && op <= /* Opcodes.i64_store32 */ 0x3e) {
              e.writeUnsignedLEB128(o[1]); // align
              e.writeUnsignedLEB128(o[2]); // offset
            }
        }
      }

      if (makeDebugInformation) {
        offsetTable.push(e.length.value - oldPtr);
        x.offsetTable = offsetTable;
      }

      e.write(Opcodes.end);
    });
  }));
  time('code section');

  const typeSection = e.writeSectionToBuffer(Section.type, e => e.writeVector(types, (e, x) => {
    e.write(FuncType);
    e.writeUnsignedLEB128(x[0].length);
    e.writeData(x[0]);
    e.writeUnsignedLEB128(x[1].length);
    e.writeData(x[1]);
  }));
  time('type section');

  let dataSection;
  if (data.length > 0) {
    dataSection = e.writeSectionToBuffer(Section.data, e => e.writeVector(data, (e, x) => {
      if (Prefs.d && x.bytes.length > PageSize) log.warning('assemble', `data (${x.page}) has more bytes than Wasm page size! (${x.bytes.length})`);

      if (x.page != null) {
        // type: active
        let offset = pages.get(x.page).ind * pageSize;
        if (offset === 0) offset = 16;
        e.write(0x00);
        e.write(Opcodes.i32_const);
        e.writeSignedLEB128(offset);
        e.write(Opcodes.end);
      } else {
        // type: passive
        e.write(0x01);
      }
      e.writeUnsignedLEB128(x.bytes.length);
      e.writeData(x.bytes);
    }));
    time('data section');
  }

  let dataCountSection;
  if (data.length > 0) {
    dataCountSection = e.writeSectionToBuffer(Section.data_count, e => e.writeUnsignedLEB128(data.length));
    time('datacount section');
  }

  if (Prefs.sections) {
    const dump = section => section ? Array.from(section).map(x => x.toString(16)) : [];
    console.log({
      typeSection: dump(typeSection),
      importSection: dump(importSection),
      funcSection: dump(funcSection),
      globalSection: dump(globalSection),
      exportSection: dump(exportSection),
      codeSection: dump(codeSection),
      dataSection: dump(dataSection),
    });
  }

  // compilation hints section - unspecd, v8 only
  // https://github.com/WebAssembly/design/issues/1473#issuecomment-1431274746
  let chSection;
  if (compileHints) {
    chSection = e.writeSection(Section.custom, e => {
      e.writeString('compilationHints');
      e.writeVector(func, (e, _) => e.write(chHint(0x02, 0x02, 0x02)));
    });
  }

  e.writeData(Magic);
  e.writeData(ModuleVersion);
  e.writeSectionFromBuffer(typeSection);
  e.writeSectionFromBuffer(importSection);
  e.writeSectionFromBuffer(funcSection);
  e.writeSectionFromBuffer(chSection);
  e.writeSectionFromBuffer(tableSection);
  e.writeSectionFromBuffer(memorySection);
  e.writeSectionFromBuffer(tagSection);
  e.writeSectionFromBuffer(globalSection);
  e.writeSectionFromBuffer(exportSection);
  e.writeSectionFromBuffer(elementSection);
  e.writeSectionFromBuffer(dataCountSection);
  e.writeSectionFromBuffer(codeSection);
  e.writeSectionFromBuffer(dataSection);
  e.writeSectionFromBuffer(nameSection);
  return new Uint8Array(e.memory.buffer, 0, e.length.value).slice(0);
};