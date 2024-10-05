import { Blocktype, Opcodes, Valtype, ValtypeSize } from '../compiler/wasmSpec.js';
import { number } from '../compiler/embedding.js';
import parse from './parse.js';
import '../compiler/prefs.js';
import { TYPES } from '../compiler/types.js';

// local indexes
const BasePointer = 0; // base string pointer
const Counter = 2; // what char we are running on
const Pointer = 3; // next char pointer
const Length = 4;
const Tmp = 5;
const QuantifierTmp = 6; // the temporary variable used for quanitifers

const doesSucceedZero = node => {
  for (const n of node.body) {
    if (n.type === 'Group') {
      if (!doesSucceedZero(n)) return false;
    }

    if (!n.quantifier || n.quantifier[0] > 0) {
      return false;
    }
  }

  return true;
}

const generate = (node, negated = false, get = true, stringSize = 2, func = 'test') => {
  let out = [];
  switch (node.type) {
    case 'Expression':
      let succeedsZero = doesSucceedZero(node);

      out = [
        // set length local
        [ Opcodes.local_get, BasePointer ],
        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
        [ Opcodes.local_tee, Length ],

        ...number(0, Valtype.i32),
        [ Opcodes.i32_eq ],
        [ Opcodes.if, Blocktype.void ],
          ...number(succeedsZero ? 1 : 0, Valtype.i32),
          [ Opcodes.return ],
        [ Opcodes.end ],

        // pointer = base + sizeof i32
        [ Opcodes.local_get, BasePointer ],
        ...number(ValtypeSize.i32, Valtype.i32),
        [ Opcodes.i32_add ],
        [ Opcodes.local_set, Pointer ],

        [ Opcodes.loop, Blocktype.void ],
          [ Opcodes.block, Blocktype.void ],
            // generate checks
            ...node.body.flatMap(x => generate(x, negated, true, stringSize, func)),

            // reached end without branching out, successful match
            ...({
              test: number(1, Valtype.i32),
              search: [
                [ Opcodes.local_get, Counter ]
              ]
            })[func],
            [ Opcodes.return ],
          [ Opcodes.end ],

          // counter++, if length > counter, loop
          [ Opcodes.local_get, Length ],

          [ Opcodes.local_get, Counter ],
          ...number(1, Valtype.i32),
          [ Opcodes.i32_add ],
          [ Opcodes.local_tee, Counter ],

          [ Opcodes.i32_gt_s ],

          [ Opcodes.br_if, 0 ],
        [ Opcodes.end ],

        // no match
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

  ...(peek ? [] : [
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
  const [ min, max ] = node.quantifier;
  return [
    // initalize our temp value (number of matched characters)
    ...number(0, Valtype.i32),
    [Opcodes.local_set, QuantifierTmp],

    // if len - counter == 0, if min == 0, succeed, else fail
    [ Opcodes.local_get, Length ],
    [ Opcodes.local_get, Counter ],
    [ Opcodes.i32_sub ],
    ...number(0, Valtype.i32),
    [ Opcodes.i32_eq ],
    ...(min == 0 ? [
      [ Opcodes.if, Blocktype.void ],
    ] : [
      [ Opcodes.br_if, 0 ],
    ]),

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

    ...(min == 0 ? [ [ Opcodes.end ] ] : []),
  ];
}

const generateChar = (node, negated, get, stringSize) => {
  const hasQuantifier = !!node.quantifier;
  const out = [
    ...(get ? getNextChar(stringSize, hasQuantifier) : []),
    ...number(node.char.charCodeAt(0), Valtype.i32),
    negated ? [ Opcodes.i32_eq ] : [ Opcodes.i32_ne ],
  ];

  if (node.quantifier) {
    return wrapQuantifier(node, out, get, stringSize);
  }

  return [
    ...out,
    ...(get ? checkFailure(): []),
  ];
};

const generateSet = (node, negated, get, stringSize) => {
  // for a single char we do not need a tmp, it is like just
  const singleChar = node.body.length === 1 && node.body[0].type === 'Character';
  if (singleChar) return generateChar(node.body[0], negated, get, stringSize)

  const hasQuantifier = !!node.quantifier;

  const out = [
    ...(get ? getNextChar(stringSize, hasQuantifier) : []),
    [ Opcodes.local_set, Tmp ],
  ];

  for (const x of node.body) {
    out.push(
      [ Opcodes.local_get, Tmp ],
      ...generate(x, negated, false, stringSize)
    );
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
    ...checkFailure(),
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
    [ Opcodes.local_get, 1 ],
    ...number(TYPES.string, Valtype.i32),
    [ Opcodes.i32_eq ],
    [ Opcodes.if, Valtype.i32 ],
    // string
    ...generate(parsed, false, true, 2, func),
    [ Opcodes.else ],
    // bytestring
    ...generate(parsed, false, true, 1, func),
    [ Opcodes.end ]
  ], name, index, types[func]);
};

export const test = (regex, index = 0, name = 'regex_test_' + regex) => wrapFunc(regex, 'test', name, index);
export const search = (regex, index = 0, name = 'regex_search_' + regex) => wrapFunc(regex, 'search', name, index);

export const types = {
  test: TYPES.boolean,
  search: TYPES.number
};

const outputFunc = (wasm, name, index, returnType) => ({
  name,
  index,
  wasm,
  returnType,

  export: true,
  params: [ Valtype.i32, Valtype.i32 ],
  returns: [ Valtype.i32 ],
  locals: {
    basePointer: { idx: 0, type: Valtype.i32 },
    inputType: { idx: 1, type: Valtype.i32 },
    counter: { idx: 2, type: Valtype.i32 },
    pointer: { idx: 3, type: Valtype.i32 },
    length: { idx: 4, type: Valtype.i32 },
    tmp: { idx: 5, type: Valtype.i32 },
    quantifierTmp: { idx: 6, type: Valtype.i32 },
  }
});