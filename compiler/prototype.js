import { Opcodes, Blocktype, Valtype, ValtypeSize } from './wasmSpec.js';
import { number } from './encoding.js';
import { UNDEFINED } from './builtins.js';
import { TYPES } from './types.js';
import './prefs.js';

// todo: turn these into built-ins once arrays and these become less hacky

export const PrototypeFuncs = function() {
  const noUnlikelyChecks = Prefs.funsafeNoUnlikelyProtoChecks;

  let zeroChecks;
  if (Prefs.zeroChecks) zeroChecks = Prefs.zeroChecks.split(',').reduce((acc, x) => { acc[x.toLowerCase()] = true; return acc; }, {});
    else zeroChecks = {};

  this[TYPES.array] = {
    pop: ({ pointer, length, iTmp, unusedValue, setType }) => [
      // if length == 0, noop
      ...length.getCachedI32(),
      [ Opcodes.i32_eqz ],
      [ Opcodes.if, Blocktype.void ],
        ...(unusedValue() ? [] : [
          number(UNDEFINED),
          ...setType(TYPES.undefined)
        ]),
        [ Opcodes.br, 1 ],
      [ Opcodes.end ],

      // todo: should we store 0/undefined in "removed" element?

      // decrement length by 1
      ...length.setI32([
        ...length.getCachedI32(),
        number(1, Valtype.i32),
        [ Opcodes.i32_sub ],

        ...(unusedValue() ? [] : [
          ...length.setCachedI32(),
          ...length.getCachedI32(),
        ])
      ]),

      // load last element
      ...(unusedValue() ? [] : [
        ...length.getCachedI32(),
        number(ValtypeSize[valtype] + 1, Valtype.i32),
        [ Opcodes.i32_mul ],

        ...pointer,
        [ Opcodes.i32_add ],
        [ Opcodes.local_set, iTmp ],

        [ Opcodes.local_get, iTmp ],
        [ Opcodes.load, 0, ValtypeSize.i32 ],

        [ Opcodes.local_get, iTmp ],
        [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 + ValtypeSize[valtype] ],
        ...setType()
      ])
    ],

    shift: ({ pointer, length, setType }) => [
      // if length == 0, noop
      ...length.getCachedI32(),
      [ Opcodes.i32_eqz ],
      [ Opcodes.if, Blocktype.void ],
        number(UNDEFINED),
        ...setType(TYPES.undefined),
        [ Opcodes.br, 1 ],
      [ Opcodes.end ],

      // todo: should we store 0/undefined in "removed" element?

      // decrement length by 1
      ...length.setI32([
        ...length.getCachedI32(),
        number(1, Valtype.i32),
        [ Opcodes.i32_sub ],

        ...length.setCachedI32(),
        ...length.getCachedI32(),
      ]),

      // load first element
      // todo/perf: unusedValue opt
      ...pointer,
      [ Opcodes.load, 0, ValtypeSize.i32 ],

      ...pointer,
      [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 + ValtypeSize[valtype] ],
      ...setType(),

      // offset page by -1 ind
      // number(pointer + ValtypeSize.i32, Valtype.i32), // dst = base array index + length size
      // number(pointer + ValtypeSize.i32 + ValtypeSize[valtype], Valtype.i32), // src = base array index + length size + an index
      // number(pageSize - ValtypeSize.i32 - ValtypeSize[valtype], Valtype.i32), // size = PageSize - length size - an index
      // [ ...Opcodes.memory_copy, 0x00, 0x00 ]

      // offset all elements by -1 ind

      // dst = base array index + length size
      number(ValtypeSize.i32, Valtype.i32),
      ...pointer,
      [ Opcodes.i32_add ],

      // src = base array index + length size + an index
      number(ValtypeSize.i32 + ValtypeSize[valtype] + 1, Valtype.i32),
      ...pointer,
      [ Opcodes.i32_add ],

      // size = new length * sizeof element
      ...length.getCachedI32(),
      number(ValtypeSize[valtype] + 1, Valtype.i32),
      [ Opcodes.i32_mul ],
      [ ...Opcodes.memory_copy, 0x00, 0x00 ]

      // move pointer + sizeof element
      // ...pointer.get(),
      // number(ValtypeSize[valtype], Valtype.i32),
      // [ Opcodes.i32_add ],
      // ...pointer.set(),

      // // write length - 1 in new address
      // ...length.setI32([
      //   ...length.getCachedI32(),
      //   number(1, Valtype.i32),
      //   [ Opcodes.i32_sub ]
      // ]),
    ]
  };

  this[TYPES.array].pop.local = Valtype.i32;

  this[TYPES.string] = {
    at: ({ pointer, length, arg, iTmp, iTmp2, alloc, setType }) => [
      // setup out string and use pointer for store
      ...alloc(8),
      [ Opcodes.local_tee, iTmp2 ],

      // out.length = 1
      [ Opcodes.local_get, iTmp2 ],
      number(1, Valtype.i32),
      [ Opcodes.i32_store, 0, 0 ],

      ...arg,
      Opcodes.i32_to_u,
      [ Opcodes.local_tee, iTmp ],

      // if index < 0: access index + array length
      number(0, Valtype.i32),
      [ Opcodes.i32_lt_s ],
      [ Opcodes.if, Blocktype.void ],
        [ Opcodes.local_get, iTmp ],
        ...length.getCachedI32(),
        [ Opcodes.i32_add ],
        [ Opcodes.local_set, iTmp ],
      [ Opcodes.end ],

      // if still < 0 or >= length: return undefined
      [ Opcodes.local_get, iTmp ],
      number(0, Valtype.i32),
      [ Opcodes.i32_lt_s ],

      [ Opcodes.local_get, iTmp ],
      ...length.getCachedI32(),
      [ Opcodes.i32_ge_s ],
      [ Opcodes.i32_or ],

      [ Opcodes.if, Blocktype.void ],
        number(UNDEFINED),
        ...setType(TYPES.undefined),
        [ Opcodes.br, 1 ],
      [ Opcodes.end ],

      [ Opcodes.local_get, iTmp ],
      number(ValtypeSize.i16, Valtype.i32),
      [ Opcodes.i32_mul ],

      ...pointer,
      [ Opcodes.i32_add ],

      // load current string ind {arg}
      [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],

      // store to new string ind 0
      [ Opcodes.i32_store16, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],

      // return new string (pointer)
      [ Opcodes.local_get, iTmp2 ],
      Opcodes.i32_from_u,

      ...setType(TYPES.string)
    ],

    // todo: out of bounds properly
    charAt: ({ pointer, arg, iTmp, alloc, setType }) => [
      // setup out string and use as pointer for store
      ...alloc(8),
      [ Opcodes.local_tee, iTmp ],

      // out.length = 1
      [ Opcodes.local_get, iTmp ],
      number(1, Valtype.i32),
      [ Opcodes.i32_store, 0, 0 ],

      ...arg,
      Opcodes.i32_to,

      number(ValtypeSize.i16, Valtype.i32),
      [ Opcodes.i32_mul ],

      ...pointer,
      [ Opcodes.i32_add ],

      // load current string ind {arg}
      [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],

      // store to new string ind 0
      [ Opcodes.i32_store16, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],

      // return new string (page)
      [ Opcodes.local_get, iTmp ],
      Opcodes.i32_from_u,

      ...setType(TYPES.string)
    ],

    charCodeAt: ({ pointer, length, arg, iTmp, setType }) => [
      ...setType(TYPES.number),

      ...arg,
      Opcodes.i32_to,

      ...(zeroChecks.charcodeat ? [] : [
        [ Opcodes.local_set, iTmp ],

        // index < 0
        ...(noUnlikelyChecks ? [] : [
          [ Opcodes.local_get, iTmp ],
          number(0, Valtype.i32),
          [ Opcodes.i32_lt_s ],
        ]),

        // index >= length
        [ Opcodes.local_get, iTmp ],
        ...length.getCachedI32(),
        [ Opcodes.i32_ge_s ],

        ...(noUnlikelyChecks ? [] : [ [ Opcodes.i32_or ] ]),
        [ Opcodes.if, Blocktype.void ],
          number(valtype === 'i32' ? -1 : NaN),
          [ Opcodes.br, 1 ],
        [ Opcodes.end ],

        [ Opcodes.local_get, iTmp ],
      ]),

      number(ValtypeSize.i16, Valtype.i32),
      [ Opcodes.i32_mul ],

      ...pointer,
      [ Opcodes.i32_add ],

      // load current string ind {arg}
      [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],
      Opcodes.i32_from_u
    ]
  };

  this[TYPES.string].at.local = Valtype.i32;
  this[TYPES.string].at.local2 = Valtype.i32;
  this[TYPES.string].charAt.local = Valtype.i32;
  this[TYPES.string].charCodeAt.local = Valtype.i32;

  this[TYPES.bytestring] = {
    at: ({ pointer, length, arg, iTmp, iTmp2, alloc, setType }) => [
      // setup out string and use pointer for store
      ...alloc(8),
      [ Opcodes.local_tee, iTmp2 ],

      // out.length = 1
      [ Opcodes.local_get, iTmp2 ],
      number(1, Valtype.i32),
      [ Opcodes.i32_store, 0, 0 ],

      ...arg,
      Opcodes.i32_to_u,
      [ Opcodes.local_tee, iTmp ],

      // if index < 0: access index + array length
      number(0, Valtype.i32),
      [ Opcodes.i32_lt_s ],
      [ Opcodes.if, Blocktype.void ],
        [ Opcodes.local_get, iTmp ],
        ...length.getCachedI32(),
        [ Opcodes.i32_add ],
        [ Opcodes.local_set, iTmp ],
      [ Opcodes.end ],

      // if still < 0 or >= length: return undefined
      [ Opcodes.local_get, iTmp ],
      number(0, Valtype.i32),
      [ Opcodes.i32_lt_s ],

      [ Opcodes.local_get, iTmp ],
      ...length.getCachedI32(),
      [ Opcodes.i32_ge_s ],
      [ Opcodes.i32_or ],

      [ Opcodes.if, Blocktype.void ],
        number(UNDEFINED),
        ...setType(TYPES.undefined),
        [ Opcodes.br, 1 ],
      [ Opcodes.end ],

      [ Opcodes.local_get, iTmp ],

      ...pointer,
      [ Opcodes.i32_add ],

      // load current string ind {arg}
      [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 ],

      // store to new string ind 0
      [ Opcodes.i32_store8, 0, ValtypeSize.i32 ],

      // return new string (pointer)
      [ Opcodes.local_get, iTmp2 ],
      Opcodes.i32_from_u,

      ...setType(TYPES.bytestring)
    ],

    // todo: out of bounds properly
    charAt: ({ pointer, arg, iTmp, alloc, setType }) => [
      // setup out string and use as pointer for store
      ...alloc(8),
      [ Opcodes.local_tee, iTmp ],

      // out.length = 1
      [ Opcodes.local_get, iTmp ],
      number(1, Valtype.i32),
      [ Opcodes.i32_store, 0, 0 ],

      ...arg,
      Opcodes.i32_to,

      ...pointer,
      [ Opcodes.i32_add ],

      // load current string ind {arg}
      [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 ],

      // store to new string ind 0
      [ Opcodes.i32_store8, 0, ValtypeSize.i32 ],

      // return new string (page)
      [ Opcodes.local_get, iTmp ],
      Opcodes.i32_from_u,

      ...setType(TYPES.bytestring)
    ],

    charCodeAt: ({ pointer, length, arg, iTmp, setType }) => [
      ...setType(TYPES.number),

      ...arg,
      Opcodes.i32_to,

      ...(zeroChecks.charcodeat ? [] : [
        [ Opcodes.local_set, iTmp ],

        // index < 0
        ...(noUnlikelyChecks ? [] : [
          [ Opcodes.local_get, iTmp ],
          number(0, Valtype.i32),
          [ Opcodes.i32_lt_s ],
        ]),

        // index >= length
        [ Opcodes.local_get, iTmp ],
        ...length.getCachedI32(),
        [ Opcodes.i32_ge_s ],

        ...(noUnlikelyChecks ? [] : [ [ Opcodes.i32_or ] ]),
        [ Opcodes.if, Blocktype.void ],
          number(valtype === 'i32' ? -1 : NaN),
          [ Opcodes.br, 1 ],
        [ Opcodes.end ],

        [ Opcodes.local_get, iTmp ],
      ]),

      ...pointer,
      [ Opcodes.i32_add ],

      // load current string ind {arg}
      [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 ],
      Opcodes.i32_from_u
    ]
  };

  this[TYPES.bytestring].at.local = Valtype.i32;
  this[TYPES.bytestring].at.local2 = Valtype.i32;
  this[TYPES.bytestring].charAt.local = Valtype.i32;
  this[TYPES.bytestring].charCodeAt.local = Valtype.i32;
};