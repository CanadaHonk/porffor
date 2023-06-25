import { Valtype, FuncType, Empty, ExportDesc, Section, Magic, ModuleVersion, Opcodes } from './wasmSpec.js';
import { encodeVector, encodeString } from './encoding.js';

const createSection = (type, data) => [
  type,
  ...encodeVector(data)
];

const allImportFuncs = ['p', 'c'];
const optLog = process.argv.includes('-opt-log');

export default (funcs, globals, flags) => {
  let importFuncs = [];

  if (process.argv.includes('-O0') || process.argv.includes('-O1')) {
    importFuncs = allImportFuncs;
  } else {
    // tree shake imports
    for (const f of funcs) {
      const wasm = f.innerWasm;
      for (let i = 0; i < wasm.length; i++) {
        if (wasm[i] === Opcodes.call && wasm[i + 1] < allImportFuncs.length) {
          const idx = wasm[i + 1];
          const func = allImportFuncs[idx];
          if (!importFuncs.includes(func)) importFuncs.push(func);

          wasm[i + 1] = importFuncs.indexOf(func);
          // if (optLog) console.log(`treeshake: rewrote call for ${func} (${idx} -> ${importFuncs.indexOf(func)})`);
        }
      }
    }

    // fix func indexes
    for (const f of funcs) {
      f.index -= (allImportFuncs.length - importFuncs.length);
    }
  }

  if (optLog) console.log(`treeshake: using ${importFuncs.length}/${allImportFuncs.length} imports`);

  const typeSection = createSection(
    Section.type,
    encodeVector([
      ...importFuncs.map(_ => [ FuncType, ...encodeVector([Valtype.i32]), Empty ]),
      ...funcs.map(x => [ FuncType, ...encodeVector(x.params.map(_ => Valtype.i32)), ...encodeVector(x.return && (x.name !== 'main' || flags.includes('return')) ? [Valtype.i32] : []) ])
    ])
  );

  const importSection = createSection(
    Section.import,
    encodeVector(importFuncs.map(x => [ 0, ...encodeString(x), ExportDesc.func, 0 ]))
  );

  const funcSection = createSection(
    Section.func,
    encodeVector(funcs.map(x => x.index)) // type indexes
  );

  const globalSection = Object.keys(globals).length === 0 ? [] : createSection(
    Section.global,
    encodeVector(Object.keys(globals).map(_ => [ Valtype.i32, 0x01, Opcodes.i32_const, 0x00, Opcodes.end ]))
  );

  const exportSection = createSection(
    Section.export,
    encodeVector(funcs.filter(x => x.name === 'main').map((x, i) => [ ...encodeString('m'), ExportDesc.func, x.index ]))
  );

  const codeSection = createSection(
    Section.code,
    encodeVector(funcs.map(x => x.wasm))
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