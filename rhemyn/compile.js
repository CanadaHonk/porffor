import { Blocktype, Opcodes, Valtype, ValtypeSize } from '../compiler/wasmSpec.js';
import { number } from '../compiler/embedding.js';
import parse from './parse.js';
import Prefs from '../compiler/prefs.js';
import { TYPES } from '../compiler/types.js';

// local indexes
const BasePointer = 0; // base string pointer
const IterPointer = 1; // this iteration base pointer
const EndPointer = 2; // pointer for the end
const Counter = 3; // what char we are running on
const Pointer = 4; // next char BYTE pointer
const Length = 5;
const Tmp = 6;
const QuantifierTmp = 7; // the temporary variable used for quanitifers

let exprLastGet = false;
const generate = (node, negated = false, get = true, stringSize = 2, func = 'test') => {
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
              return generate(x, negated, true, stringSize, func);
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

          // increment iter pointer by string size
          [ Opcodes.local_get, IterPointer ],
          ...number(stringSize, Valtype.i32),
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

      if (Prefs.regexLog) {
        const underline = x => `\u001b[4m\u001b[1m${x}\u001b[0m`;
        console.log(`\n${underline('ast')}`);
        console.log(node);
        console.log(`\n${underline('wasm bytecode')}\n` + decompile(out) + '\n');
      }

      break;

    case 'Character':
      out = generateChar(node, node.negated ^ negated, get, stringSize);
      break;

    case 'Set':
      out = generateSet(node, node.negated, get, stringSize);
      break;

    case 'Group':
      out = generateGroup(node, negated, get, stringSize);
      break;

    case 'Range':
      out = generateRange(node, negated, get, stringSize);
      break;
  }

  return out;
};

const getNextChar = (stringSize, peek = false) => [
  // get char from pointer
  [ Opcodes.local_get, Pointer ],
  [ stringSize == 2 ? Opcodes.i32_load16_u : Opcodes.i32_load8_u, 0, 0 ],

  ...((exprLastGet && !peek) ? [] : [
    // pointer += string size
    [ Opcodes.local_get, Pointer ],
    ...number(stringSize, Valtype.i32),
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

const wrapQuantifier = (node, method, get, stringSize) => {
  const [min, max] = node.quantifier;
  return [
    // initalize our temp value (number of matched characters)
    ...number(0, Valtype.i32),
    [Opcodes.local_set, QuantifierTmp],

    // start loop
    [Opcodes.loop, Blocktype.void],
      [ Opcodes.block, Blocktype.void ],
        // if counter + tmp == length, break 
        [ Opcodes.local_get, Counter ],
        [ Opcodes.local_get, QuantifierTmp ],
        [ Opcodes.i32_add ],
        [ Opcodes.local_get, Length ],
        [ Opcodes.i32_eq ],
        [ Opcodes.br_if, 0 ], 

        // if doesn't match, break
        ...method,
        [Opcodes.br_if, 0 ],
        ...(get ? [
          // pointer += stringSize
          [ Opcodes.local_get, Pointer ],
          ...number(stringSize, Valtype.i32),
          [ Opcodes.i32_add ],
          [ Opcodes.local_set, Pointer ]
        ] : []),

        // if maximum was reached, break 
        ...(max ? [
          [ Opcodes.local_get, QuantifierTmp ],
          ...number(max, Valtype.i32),
          [ Opcodes.i32_eq ],
          [ Opcodes.br_if, 0 ]
        ] : []),

        [ Opcodes.local_get, QuantifierTmp ],
        ...number(1, Valtype.i32),
        [ Opcodes.i32_add ],
        [ Opcodes.local_set, QuantifierTmp ],
        [ Opcodes.br, 1 ],
      [ Opcodes.end ],
    [ Opcodes.end ],

    // if less than minimum, fail
    [Opcodes.local_get, QuantifierTmp],
    ...number(min, Valtype.i32),
    [Opcodes.i32_lt_s],
    ...(get ? checkFailure(): []),

    // counter += tmp - 1
    [ Opcodes.local_get, QuantifierTmp ],
    ...number(1, Valtype.i32),
    [ Opcodes.i32_sub ],
    [ Opcodes.local_get, Counter ],
    [ Opcodes.i32_add ],
    [ Opcodes.local_set, Counter ]
  ]
}

const generateChar = (node, negated, get, stringSize) => {
  const out = [
    ...(get ? getNextChar(stringSize, true) : []),
    ...number(node.char.charCodeAt(0), Valtype.i32),
    negated ? [ Opcodes.i32_eq ] : [ Opcodes.i32_ne ],
  ]
  
  if (node.quantifier) {
    return wrapQuantifier(node, out, get, stringSize);
  }

  return [
    ...out,
    ...(get ? checkFailure(): [])
  ];
};

const generateSet = (node, negated, get, stringSize) => {
  // for a single char we do not need a tmp, it is like just
  const singleChar = node.body.length === 1 && node.body[0].type === 'Character';
  if (singleChar) return generateChar(node.body[0], negated, get, stringSize)

  const hasQuantifier = !!node.quantifier

  const out = [
    ...(get ? getNextChar(stringSize, hasQuantifier) : []),
    [ Opcodes.local_set, Tmp ],
  ];

  for (const x of node.body) {
    out.push(
      [ Opcodes.local_get, Tmp ],
      ...generate(x, negated, false, stringSize)
    )
  }

  if (node.body.length > 0) {
    for (let i = 0; i < node.body.length - 1; i++) {
      out.push(negated ? [ Opcodes.i32_or ] : [ Opcodes.i32_and ])
    }
  };

  if (hasQuantifier) {
    return wrapQuantifier(node, out, get, stringSize);
  }

  return [
    ...out,
    ...checkFailure()
  ];
};

const generateRange = (node, negated, get, stringSize) => {
  return [
    ...(get ? getNextChar(stringSize) : []),
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
  // todo
  return [];
};

const wrapFunc = (regex, func, name, index) => {
  const parsed = parse(regex);

  return outputFunc([
    [ Opcodes.local_get, IterPointer ],
    ...number(TYPES.string, Valtype.i32),
    [ Opcodes.i32_eq ],
    [ Opcodes.if, Valtype.i32 ],
    // string
    ...generate(parsed, false, true, 2, func),
    [ Opcodes.else ],
    // bytestring
    ...generate(parsed, false, true, 1, func),
    [ Opcodes.end ]
  ], name, index);
};

export const test = (regex, index = 0, name = 'regex_test_' + regex) => wrapFunc(regex, 'test', name, index);
export const search = (regex, index = 0, name = 'regex_search_' + regex) => wrapFunc(regex, 'search', name, index);

const outputFunc = (wasm, name, index) => ({
  name,
  index,
  wasm,

  export: true,
  params: [ Valtype.i32, Valtype.i32 ],
  returns: [ Valtype.i32 ],
  returnType: TYPES.boolean,
  locals: {
    basePointer: { idx: 0, type: Valtype.i32 },
    iterPointer: { idx: 1, type: Valtype.i32 },
    endPointer: { idx: 2, type: Valtype.i32 },
    counter: { idx: 3, type: Valtype.i32 },
    pointer: { idx: 4, type: Valtype.i32 },
    length: { idx: 5, type: Valtype.i32 },
    tmp: { idx: 6, type: Valtype.i32 },
    quantifierTmp: { idx: 7, type: Valtype.i32 },
  }
});