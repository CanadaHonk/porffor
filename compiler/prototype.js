import { Opcodes, Blocktype, Valtype, ValtypeSize } from './wasmSpec.js';
import { number } from './encoding.js';
import { UNDEFINED } from './builtins.js';
import { TYPES } from './types.js';
import './prefs.js';

export const PrototypeFuncs = function() {
  const noUnlikelyChecks = Prefs.funsafeNoUnlikelyProtoChecks;

  let zeroChecks;
  if (Prefs.zeroChecks) zeroChecks = Prefs.zeroChecks.split(',').reduce((acc, x) => { acc[x.toLowerCase()] = true; return acc; }, {});
    else zeroChecks = {};

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