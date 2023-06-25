import { Valtype, FuncType, Empty, ExportDesc, Section, Magic, ModuleVersion, Opcodes } from './wasmSpec.js';
import { encodeVector, encodeString } from './encoding.js';

const createSection = (type, data) => [
  type,
  ...encodeVector(data)
];

export default (funcs, globals) => {
  if (process.argv.includes('-funcs')) console.log(funcs);

  const typeSection = createSection(
    Section.type,
    encodeVector([
      [ FuncType, ...encodeVector([Valtype.i32]), Empty ], // print
      ...funcs.map(x => [ FuncType, ...encodeVector(x.params.map(_ => Valtype.i32)), ...encodeVector(x.name !== 'main' ? [Valtype.i32] : []) ])
    ])
  );

  const printFunctionImport = [
    0,
    ...encodeString("p"),
    ExportDesc.func,
    0x00
  ];

  const importSection = createSection(
    Section.import,
    encodeVector([printFunctionImport])
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