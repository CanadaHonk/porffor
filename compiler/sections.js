import { Valtype, FuncType, Empty, ExportDesc, Section, Magic, ModuleVersion, Opcodes } from './wasmSpec.js';
import { encodeVector, encodeString, encodeLocal } from './encoding.js';

const createSection = (type, data) => [
  type,
  ...encodeVector(data)
];

const allImportFuncs = [ 'p', 'c', 'a' ];
const optLog = process.argv.includes('-opt-log');

export default (funcs, globals, flags) => {
  const types = [], typeCache = {};

  const optLevel = process.argv.includes('-O0') ? 0 : (process.argv.includes('-O1') ? 1 : 2);

  const getType = (params, returns) => {
    const hash = `${params}_${returns ? 1 : 0}`;
    if (optLog) console.log(`opt sections: getType (${params}, ${returns}) -> ${hash}. cached: ${typeCache[hash]}`);
    if (optLevel >= 2 && typeCache[hash] !== undefined) return typeCache[hash];

    const type = [ FuncType, ...encodeVector(new Array(params).fill(Valtype[valtype])), ...encodeVector(returns ? [Valtype[valtype]] : []) ];
    const idx = types.length;

    types.push(type);
    return typeCache[hash] = idx;
  };

  let importFuncs = [];

  if (optLevel < 2) {
    importFuncs = allImportFuncs;
  } else {
    // tree shake imports
    for (const f of funcs) {
      for (const inst of f.wasm) {
        if (inst[0] === Opcodes.call && inst[1] < allImportFuncs.length) {
          const idx = inst[1];
          const func = allImportFuncs[idx];
          if (!importFuncs.includes(func)) importFuncs.push(func);

          inst[1] = importFuncs.indexOf(func);
          // if (optLog) console.log(`treeshake: rewrote call for ${func} (${idx} -> ${importFuncs.indexOf(func)})`);
        }
      }
    }

    // fix call indexes for non-imports
    const delta = allImportFuncs.length - importFuncs.length;
    for (const f of funcs) {
      f.index -= delta;

      for (const inst of f.wasm) {
        if (inst[0] === Opcodes.call && inst[1] >= allImportFuncs.length) {
          inst[1] -= delta;
        }
      }
    }
  }

  if (optLog) console.log(`treeshake: using ${importFuncs.length}/${allImportFuncs.length} imports`);

  const importSection = createSection(
    Section.import,
    encodeVector(importFuncs.map((x, i) => [ 0, ...encodeString(x), ExportDesc.func, getType(1, false) ]))
  );

  const funcSection = createSection(
    Section.func,
    encodeVector(funcs.map(x => getType(x.params.length, x.return))) // type indexes
  );

  const globalSection = Object.keys(globals).length === 0 ? [] : createSection(
    Section.global,
    encodeVector(Object.keys(globals).map(_ => [ Valtype[valtype], 0x01, Opcodes.const, 0x00, Opcodes.end ]))
  );

  const exportSection = createSection(
    Section.export,
    encodeVector(funcs.filter(x => x.name === 'main').map((x, i) => [ ...encodeString('m'), ExportDesc.func, x.index ]))
  );

  const codeSection = createSection(
    Section.code,
    encodeVector(funcs.map(x => {
      const maxLocal = x.locals.length === 0 ? -1 : Math.max(...Object.values(x.locals));
      const localCount = (maxLocal + 1) - x.params.length;
      const localDecl = localCount > 0 ? [encodeLocal(localCount, Valtype[valtype])] : [];
      return encodeVector([ ...encodeVector(localDecl), ...x.wasm.flat().filter(x => x !== null), Opcodes.end ]);
    }))
  );

  const typeSection = createSection(
    Section.type,
    encodeVector(types)
  );

  if (process.argv.includes('-sections')) console.log({
    typeSection: typeSection.map(x => x.toString(16)),
    importSection: importSection.map(x => x.toString(16)),
    funcSection: funcSection.map(x => x.toString(16)),
    globalSection: globalSection.map(x => x.toString(16)),
    exportSection: exportSection.map(x => x.toString(16)),
    codeSection: codeSection.map(x => x.toString(16))
  });

  return Uint8Array.from([
    ...Magic,
    ...ModuleVersion,
    ...typeSection,
    ...importSection,
    ...funcSection,
    ...globalSection,
    ...exportSection,
    ...codeSection
  ]);
};