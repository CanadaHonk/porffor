import { Blocktype, Opcodes, Valtype, PageSize, ValtypeSize } from '../compiler/wasmSpec.js';
import { number } from '../compiler/embedding.js';
import { signedLEB128, unsignedLEB128 } from '../compiler/encoding.js';
import parse from './parse.js';

// local indexes
const BasePointer = 0; // base string pointer
const IterPointer = 1; // this iteration base pointer
const EndPointer = 2; // pointer for the end
const Counter = 3; // what char we are running on
const Pointer = 4; // next char BYTE pointer
const Length = 5;
const Tmp = 6;

let exprLastGet = false;
const generate = (node, negated = false, get = true, func = 'test') => {
  let out = [];
  switch (node.type) {
    case 'Expression':
      exprLastGet = false;
      out = [
        // set length local
        [ Opcodes.local_get, BasePointer ],
        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
        [ Opcodes.local_set, Length ],

        // set iter pointer local as base + sizeof i32 initially
        [ Opcodes.local_get, BasePointer ],
        ...number(ValtypeSize.i32, Valtype.i32),
        [ Opcodes.i32_add ],
        [ Opcodes.local_set, IterPointer ],

        [ Opcodes.loop, Blocktype.void ],

        // reset pointer as iter pointer
        [ Opcodes.local_get, IterPointer ],
        [ Opcodes.local_set, Pointer ],

        [ Opcodes.block, Blocktype.void ],

        // generate checks
        ...node.body.flatMap((x, i) => {
          exprLastGet = x.type !== 'Group' && i === (node.body.length - 1);
          return generate(x, negated);
        }),

        // reached end without branching out, successful match
        ...({
          test: number(1, Valtype.i32),
          search: [
            [ Opcodes.local_get, Counter ]
          ]
        })[func],
        [ Opcodes.return ],

        [ Opcodes.end ],

        // increment iter pointer by sizeof i16
        [ Opcodes.local_get, IterPointer ],
        ...number(ValtypeSize.i16, Valtype.i32),
        [ Opcodes.i32_add ],
        [ Opcodes.local_set, IterPointer ],

        // increment counter by 1, check if eq length, if not loop
        [ Opcodes.local_get, Counter ],
        ...number(1, Valtype.i32),
        [ Opcodes.i32_add ],
        [ Opcodes.local_tee, Counter ],

        [ Opcodes.local_get, Length ],
        [ Opcodes.i32_ne ],

        [ Opcodes.br_if, 0 ],
        [ Opcodes.end ],

        // no match, return 0
        ...number(({
          test: 0,
          search: -1
        })[func], Valtype.i32)
      ];

      if (globalThis.regexLog) {
        const underline = x => `\u001b[4m\u001b[1m${x}\u001b[0m`;
        console.log(`\n${underline('ast')}`);
        console.log(node);
        console.log(`\n${underline('wasm bytecode')}\n` + decompile(out) + '\n');
      }

      break;

    case 'Character':
      out = generateChar(node, node.negated ^ negated, get);
      break;

    case 'Set':
      out = generateSet(node, node.negated, get);
      break;

    case 'Group':
      out = generateGroup(node, negated, get);
      break;

    case 'Range':
      out = generateRange(node, negated, get);
      break;
  }

  return out;
};

const getNextChar = () => [
  // get char from pointer
  [ Opcodes.local_get, Pointer ],
  [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ...unsignedLEB128(0) ],

  ...(exprLastGet ? [] : [
    // pointer += sizeof i16
    [ Opcodes.local_get, Pointer ],
    ...number(ValtypeSize.i16, Valtype.i32),
    [ Opcodes.i32_add ],
    [ Opcodes.local_set, Pointer ]
  ])
];

const checkFailure = () => [
  // surely we do not need to do this for every single mismatch, right?
  /* [ Opcodes.if, Blocktype.void ],
  ...number(0, Valtype.i32),
  [ Opcodes.return ],
  [ Opcodes.end ], */

  [ Opcodes.br_if, 0 ]
];

const generateChar = (node, negated, get) => {
  return [
    ...(get ? getNextChar() : []),
    ...number(node.char.charCodeAt(0), Valtype.i32),
    negated ? [ Opcodes.i32_eq ] : [ Opcodes.i32_ne ],
    ...(get ? checkFailure(): [])
  ];
};

const generateSet = (node, negated, get) => {
  // for a single char we do not need a tmp, it is like just
  const singleChar = node.body.length === 1 && node.body[0].type === 'Character';

  let out = [
    ...(get ? getNextChar() : []),
    ...(singleChar ? [] : [ [ Opcodes.local_set, Tmp ] ]),
  ];

  for (const x of node.body) {
    out = [
      ...out,
      ...(singleChar ? [] : [ [ Opcodes.local_get, Tmp ] ]),
      ...generate(x, negated, false)
    ];
  }

  out = out.concat(new Array(node.body.length - 1).fill(negated ? [ Opcodes.i32_or ] : [ Opcodes.i32_and ]));

  return [
    ...out,
    ...checkFailure()
  ];
};

const generateRange = (node, negated, get) => {
  return [
    ...(get ? getNextChar() : []),
    ...(get ? [ [ Opcodes.local_tee, Tmp ] ] : []),

    ...number(node.from.charCodeAt(0), Valtype.i32),
    // negated ? [ Opcodes.i32_lt_s ] : [ Opcodes.i32_ge_s ],
    negated ? [ Opcodes.i32_ge_s ] : [ Opcodes.i32_lt_s ],

    [ Opcodes.local_get, Tmp ],
    ...number(node.to.charCodeAt(0), Valtype.i32),
    // negated ? [ Opcodes.i32_gt_s ] : [ Opcodes.i32_le_s ],
    negated ? [ Opcodes.i32_le_s ] : [ Opcodes.i32_gt_s ],

    negated ? [ Opcodes.i32_and ] : [ Opcodes.i32_or ],
    ...(get ? checkFailure(): [])
  ];
};

const generateGroup = (node, negated, get) => {

};

export const test = (regex, index = 0, name = 'regex_test_' + regex) => outputFunc(generate(parse(regex), false, true, 'test'), name, index);
export const search = (regex, index = 0, name = 'regex_search_' + regex) => outputFunc(generate(parse(regex), false, true, 'search'), name, index);

const outputFunc = (wasm, name, index) => ({
  name,
  index,
  wasm,

  export: true,
  params: [ Valtype.i32 ],
  returns: [ Valtype.i32 ],
  returnType: 0xffffffffffff1, // boolean - todo: do not hardcode this
  locals: {
    basePointer: { idx: 0, type: Valtype.i32 },
    iterPointer: { idx: 1, type: Valtype.i32 },
    endPointer: { idx: 2, type: Valtype.i32 },
    counter: { idx: 3, type: Valtype.i32 },
    pointer: { idx: 4, type: Valtype.i32 },
    length: { idx: 5, type: Valtype.i32 },
    tmp: { idx: 6, type: Valtype.i32 },
  }
});