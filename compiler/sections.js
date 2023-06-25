import { Valtype, FuncType, Empty, ExportDesc, Section, Magic, ModuleVersion, Opcodes } from './wasmSpec.js';
import { encodeVector, encodeString } from './encoding.js';

const createSection = (type, data) => [
  type,
  ...encodeVector(data)
];

const importFuncs = ['p', 'c'];

export default (funcs, globals, flags) => {
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