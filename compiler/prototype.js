import { Opcodes, Blocktype, Valtype, ValtypeSize, PageSize } from "./wasmSpec.js";
import { number } from "./embedding.js";
import { unsignedLEB128 } from "./encoding.js";
import { UNDEFINED } from "./builtins.js";

// todo: do not duplicate this
const TYPES = {
  number: 0x00,
  boolean: 0x01,
  string: 0x02,
  undefined: 0x03,
  object: 0x04,
  function: 0x05,
  symbol: 0x06,
  bigint: 0x07,

  // these are not "typeof" types but tracked internally
  _array: 0x10,
  _regexp: 0x11,
  _bytestring: 0x12
};

// todo: turn these into built-ins once arrays and these become less hacky

export const PrototypeFuncs = function() {
  const noUnlikelyChecks = process.argv.includes('-funsafe-no-unlikely-proto-checks');
  let zeroChecks = process.argv.find(x => x.startsWith('-funsafe-zero-proto-checks='));
  if (zeroChecks) zeroChecks = zeroChecks.split('=')[1].split(',').reduce((acc, x) => { acc[x.toLowerCase()] = true; return acc; }, {});
    else zeroChecks = {};

  this[TYPES._array] = {
    // lX = local accessor of X ({ get, set }), iX = local index of X, wX = wasm ops of X
    at: (pointer, length, wIndex, iTmp) => [
      ...wIndex,
      Opcodes.i32_to,
      [ Opcodes.local_tee, iTmp ],

      // if index < 0: access index + array length
      ...number(0, Valtype.i32),
      [ Opcodes.i32_lt_s ],
      [ Opcodes.if, Blocktype.void ],
      [ Opcodes.local_get, iTmp ],
      ...length.getCachedI32(),
      [ Opcodes.i32_add ],
      [ Opcodes.local_set, iTmp ],
      [ Opcodes.end ],

      // if still < 0 or >= length: return undefined
      [ Opcodes.local_get, iTmp ],
      ...number(0, Valtype.i32),
      [ Opcodes.i32_lt_s ],

      [ Opcodes.local_get, iTmp ],
      ...length.getCachedI32(),
      [ Opcodes.i32_ge_s ],
      [ Opcodes.i32_or ],

      [ Opcodes.if, Blocktype.void ],
      ...number(UNDEFINED),
      [ Opcodes.br, 1 ],
      [ Opcodes.end ],

      [ Opcodes.local_get, iTmp ],
      ...number(ValtypeSize[valtype], Valtype.i32),
      [ Opcodes.i32_mul ],

      ...pointer,
      [ Opcodes.i32_add ],

      // read from memory
      [ Opcodes.load, Math.log2(ValtypeSize[valtype]) - 1, ...unsignedLEB128(ValtypeSize.i32) ]
    ],

    // todo: only for 1 argument
    push: (pointer, length, wNewMember, _1, _2, _3, unusedValue) => [
      // get memory offset of array at last index (length)
      ...length.getCachedI32(),
      ...number(ValtypeSize[valtype], Valtype.i32),
      [ Opcodes.i32_mul ],

      ...pointer,
      [ Opcodes.i32_add ],

      // generated wasm for new member
      ...wNewMember,

      // store in memory
      [ Opcodes.store, Math.log2(ValtypeSize[valtype]) - 1, ...unsignedLEB128(ValtypeSize.i32) ],

      // bump array length by 1 and return it
      ...length.setI32([
        ...length.getCachedI32(),
        ...number(1, Valtype.i32),
        [ Opcodes.i32_add ],

        ...(unusedValue() ? [] : [
          ...length.setCachedI32(),
          ...length.getCachedI32(),
        ])
      ]),

      ...(unusedValue() ? [] : [
        ...length.getCachedI32(),
        Opcodes.i32_from_u
      ])

      // ...length.get()
    ],

    pop: (pointer, length, _1, _2, _3, _4, unusedValue) => [
      // if length == 0, noop
      ...length.getCachedI32(),
      [ Opcodes.i32_eqz ],
      [ Opcodes.if, Blocktype.void ],
      ...(unusedValue() ? [] : [
        ...number(UNDEFINED),
      ]),
      [ Opcodes.br, 1 ],
      [ Opcodes.end ],

      // todo: should we store 0/undefined in "removed" element?

      // decrement length by 1
      ...length.setI32([
        ...length.getCachedI32(),
        ...number(1, Valtype.i32),
        [ Opcodes.i32_sub ],

        ...(unusedValue() ? [] : [
          ...length.setCachedI32(),
          ...length.getCachedI32(),
        ])
      ]),

      // load last element
      ...(unusedValue() ? [] : [
        ...length.getCachedI32(),
        ...number(ValtypeSize[valtype], Valtype.i32),
        [ Opcodes.i32_mul ],

        ...pointer,
        [ Opcodes.i32_add ],

        [ Opcodes.load, Math.log2(ValtypeSize[valtype]) - 1, ...unsignedLEB128(ValtypeSize.i32) ]
      ])
    ],

    shift: (pointer, length) => [
      // if length == 0, noop
      ...length.getCachedI32(),
      Opcodes.i32_eqz,
      [ Opcodes.if, Blocktype.void ],
      ...number(UNDEFINED),
      [ Opcodes.br, 1 ],
      [ Opcodes.end ],

      // todo: should we store 0/undefined in "removed" element?

      // decrement length by 1
      ...length.setI32([
        ...length.getCachedI32(),
        ...number(1, Valtype.i32),
        [ Opcodes.i32_sub ],

        ...length.setCachedI32(),
        ...length.getCachedI32(),
      ]),

      // load first element
      ...pointer,
      [ Opcodes.load, Math.log2(ValtypeSize[valtype]) - 1, ...unsignedLEB128(ValtypeSize.i32) ],

      // offset page by -1 ind
      // ...number(pointer + ValtypeSize.i32, Valtype.i32), // dst = base array index + length size
      // ...number(pointer + ValtypeSize.i32 + ValtypeSize[valtype], Valtype.i32), // src = base array index + length size + an index
      // ...number(pageSize - ValtypeSize.i32 - ValtypeSize[valtype], Valtype.i32), // size = PageSize - length size - an index
      // [ ...Opcodes.memory_copy, 0x00, 0x00 ]

      // offset all elements by -1 ind

      // dst = base array index + length size
      ...number(ValtypeSize.i32, Valtype.i32),
      ...pointer,
      [ Opcodes.i32_add ],

      // src = base array index + length size + an index
      ...number(ValtypeSize.i32 + ValtypeSize[valtype], Valtype.i32),
      ...pointer,
      [ Opcodes.i32_add ],

      // size = new length * sizeof element
      ...length.getCachedI32(),
      ...number(ValtypeSize[valtype], Valtype.i32),
      [ Opcodes.i32_mul ],
      [ ...Opcodes.memory_copy, 0x00, 0x00 ]

      // move pointer + sizeof element
      // ...pointer.get(),
      // ...number(ValtypeSize[valtype], Valtype.i32),
      // [ Opcodes.i32_add ],
      // ...pointer.set(),

      // // write length - 1 in new address
      // ...length.setI32([
      //   ...length.getCachedI32(),
      //   ...number(1, Valtype.i32),
      //   [ Opcodes.i32_sub ]
      // ]),
    ],

    fill: (pointer, length, wElement, iTmp) => [
      ...wElement,
      [ Opcodes.local_set, iTmp ],

      // use cached length i32 as pointer
      ...length.getCachedI32(),

      // length - 1 for indexes
      ...number(1, Valtype.i32),
      [ Opcodes.i32_sub ],

      // * sizeof value
      ...number(ValtypeSize[valtype], Valtype.i32),
      [ Opcodes.i32_mul ],

      ...length.setCachedI32(),

      ...(noUnlikelyChecks ? [] : [
        ...length.getCachedI32(),
        ...number(0, Valtype.i32),
        [ Opcodes.i32_lt_s ],
        [ Opcodes.if, Blocktype.void ],
        ...pointer,
        Opcodes.i32_from_u,
        [ Opcodes.br, 1 ],
        [ Opcodes.end ]
      ]),

      [ Opcodes.loop, Blocktype.void ],

      // set element using pointer
      ...length.getCachedI32(),
      ...pointer,
      [ Opcodes.i32_add ],

      [ Opcodes.local_get, iTmp ],
      [ Opcodes.store, Math.log2(ValtypeSize[valtype]) - 1, ...unsignedLEB128( ValtypeSize.i32) ],

      // pointer - sizeof value
      ...length.getCachedI32(),
      ...number(ValtypeSize[valtype], Valtype.i32),
      [ Opcodes.i32_sub ],

      ...length.setCachedI32(),

      // if pointer >= 0, loop
      ...length.getCachedI32(),
      ...number(0, Valtype.i32),
      [ Opcodes.i32_ge_s ],
      [ Opcodes.br_if, 0 ],

      [ Opcodes.end ],

      // return this array
      ...pointer,
      Opcodes.i32_from_u,
    ]
  };

  this[TYPES._array].at.local = Valtype.i32;
  this[TYPES._array].push.noArgRetLength = true;
  this[TYPES._array].fill.local = valtypeBinary;
  this[TYPES._array].fill.returnType = TYPES._array;

  this[TYPES.string] = {
    at: (pointer, length, wIndex, iTmp, _, arrayShell) => {
      const [ newOut, newPointer ] = arrayShell(1, 'i16');

      return [
        // setup new/out array
        ...newOut,
        [ Opcodes.drop ],

        ...number(0, Valtype.i32), // base 0 for store later

        ...wIndex,
        Opcodes.i32_to_u,
        [ Opcodes.local_tee, iTmp ],

        // if index < 0: access index + array length
        ...number(0, Valtype.i32),
        [ Opcodes.i32_lt_s ],
        [ Opcodes.if, Blocktype.void ],
        [ Opcodes.local_get, iTmp ],
        ...length.getCachedI32(),
        [ Opcodes.i32_add ],
        [ Opcodes.local_set, iTmp ],
        [ Opcodes.end ],

        // if still < 0 or >= length: return undefined
        [ Opcodes.local_get, iTmp ],
        ...number(0, Valtype.i32),
        [ Opcodes.i32_lt_s ],

        [ Opcodes.local_get, iTmp ],
        ...length.getCachedI32(),
        [ Opcodes.i32_ge_s ],
        [ Opcodes.i32_or ],

        [ Opcodes.if, Blocktype.void ],
        ...number(UNDEFINED),
        [ Opcodes.br, 1 ],
        [ Opcodes.end ],

        [ Opcodes.local_get, iTmp ],
        ...number(ValtypeSize.i16, Valtype.i32),
        [ Opcodes.i32_mul ],

        ...pointer,
        [ Opcodes.i32_add ],

        // load current string ind {arg}
        [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ...unsignedLEB128(ValtypeSize.i32) ],

        // store to new string ind 0
        [ Opcodes.i32_store16, Math.log2(ValtypeSize.i16) - 1, ...unsignedLEB128(newPointer + ValtypeSize.i32) ],

        // return new string (pointer)
        ...number(newPointer)
      ];
    },

    // todo: out of bounds properly
    charAt: (pointer, length, wIndex, _1, _2, arrayShell) => {
      const [ newOut, newPointer ] = arrayShell(1, 'i16');

      return [
        // setup new/out array
        ...newOut,
        [ Opcodes.drop ],

        ...number(0, Valtype.i32), // base 0 for store later

        ...wIndex,

        Opcodes.i32_to,
        ...number(ValtypeSize.i16, Valtype.i32),
        [ Opcodes.i32_mul ],

        ...pointer,
        [ Opcodes.i32_add ],

        // load current string ind {arg}
        [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ...unsignedLEB128(ValtypeSize.i32) ],

        // store to new string ind 0
        [ Opcodes.i32_store16, Math.log2(ValtypeSize.i16) - 1, ...unsignedLEB128(newPointer + ValtypeSize.i32) ],

        // return new string (page)
        ...number(newPointer)
      ];
    },

    charCodeAt: (pointer, length, wIndex, iTmp) => {
      return [
        ...wIndex,
        Opcodes.i32_to,

        ...(zeroChecks.charcodeat ? [] : [
          [ Opcodes.local_set, iTmp ],

          // index < 0
          ...(noUnlikelyChecks ? [] : [
            [ Opcodes.local_get, iTmp ],
            ...number(0, Valtype.i32),
            [ Opcodes.i32_lt_s ],
          ]),

          // index >= length
          [ Opcodes.local_get, iTmp ],
          ...length.getCachedI32(),
          [ Opcodes.i32_ge_s ],

          ...(noUnlikelyChecks ? [] : [ [ Opcodes.i32_or ] ]),
          [ Opcodes.if, Blocktype.void ],
          ...number(NaN),
          [ Opcodes.br, 1 ],
          [ Opcodes.end ],

          [ Opcodes.local_get, iTmp ],
        ]),

        ...number(ValtypeSize.i16, Valtype.i32),
        [ Opcodes.i32_mul ],

        ...pointer,
        [ Opcodes.i32_add ],

        // load current string ind {arg}
        [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ...unsignedLEB128(ValtypeSize.i32) ],
        Opcodes.i32_from_u
      ];
    },

    isWellFormed: (pointer, length, wIndex, iTmp, iTmp2) => {
      return [
        // note: we cannot presume it begins as 0 in case it was used previously
        ...pointer,
        [ Opcodes.local_set, iTmp ],

        // use cached length as end pointer
        ...length.getCachedI32(),
        ...number(ValtypeSize.i16, Valtype.i32),
        [ Opcodes.i32_mul ],
        ...pointer,
        [ Opcodes.i32_add ],
        ...length.setCachedI32(),

        [ Opcodes.loop, Blocktype.void ],

        [ Opcodes.block, Blocktype.void ],

        [ Opcodes.local_get, iTmp ],
        [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ...unsignedLEB128(ValtypeSize.i32) ],
        [ Opcodes.local_set, iTmp2 ],

        // if not surrogate, continue
        [ Opcodes.local_get, iTmp2 ],
        ...number(0xF800, Valtype.i32),
        [ Opcodes.i32_and ],
        ...number(0xD800, Valtype.i32),
        [ Opcodes.i32_ne ],
        [ Opcodes.br_if, 0 ],

        // if not leading surrogate, return false
        [ Opcodes.local_get, iTmp2 ],
        ...number(0xDC00, Valtype.i32),
        [ Opcodes.i32_ge_s ],
        [ Opcodes.if, Blocktype.void ],
        ...number(0),
        [ Opcodes.br, 3 ],
        [ Opcodes.end ],

        // if not followed by trailing surrogate, return false
        [ Opcodes.local_get, iTmp ],
        [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ...unsignedLEB128(ValtypeSize.i32 + ValtypeSize.i16) ],
        ...number(0xFC00, Valtype.i32),
        [ Opcodes.i32_and ],
        ...number(0xDC00, Valtype.i32),
        [ Opcodes.i32_ne ],
        [ Opcodes.if, Blocktype.void ],
        ...number(0),
        [ Opcodes.br, 3 ],
        [ Opcodes.end ],

        // bump index again since gone through two valid chars
        [ Opcodes.local_get, iTmp ],
        ...number(ValtypeSize.i16, Valtype.i32),
        [ Opcodes.i32_add ],
        [ Opcodes.local_set, iTmp ],

        [ Opcodes.end ],

        // bump pointer and loop if not at the end
        [ Opcodes.local_get, iTmp ],
        ...number(ValtypeSize.i16, Valtype.i32),
        [ Opcodes.i32_add ],
        [ Opcodes.local_tee, iTmp ],

        ...length.getCachedI32(), // end pointer
        [ Opcodes.i32_ne ],
        [ Opcodes.br_if, 0 ],

        [ Opcodes.end ],

        // return true
        ...number(1)
      ]
    }
  };

  this[TYPES.string].at.local = Valtype.i32;
  this[TYPES.string].at.returnType = TYPES.string;
  this[TYPES.string].charAt.returnType = TYPES.string;
  this[TYPES.string].charCodeAt.local = Valtype.i32;
  this[TYPES.string].charCodeAt.noPointerCache = zeroChecks.charcodeat;

  this[TYPES.string].isWellFormed.local = Valtype.i32;
  this[TYPES.string].isWellFormed.local2 = Valtype.i32;
  this[TYPES.string].isWellFormed.returnType = TYPES.boolean;

  if (process.argv.includes('-bytestring')) {
    this[TYPES._bytestring] = {
      at: (pointer, length, wIndex, iTmp, _, arrayShell) => {
        const [ newOut, newPointer ] = arrayShell(1, 'i16');

        return [
          // setup new/out array
          ...newOut,
          [ Opcodes.drop ],

          ...number(0, Valtype.i32), // base 0 for store later

          ...wIndex,
          Opcodes.i32_to_u,
          [ Opcodes.local_tee, iTmp ],

          // if index < 0: access index + array length
          ...number(0, Valtype.i32),
          [ Opcodes.i32_lt_s ],
          [ Opcodes.if, Blocktype.void ],
          [ Opcodes.local_get, iTmp ],
          ...length.getCachedI32(),
          [ Opcodes.i32_add ],
          [ Opcodes.local_set, iTmp ],
          [ Opcodes.end ],

          // if still < 0 or >= length: return undefined
          [ Opcodes.local_get, iTmp ],
          ...number(0, Valtype.i32),
          [ Opcodes.i32_lt_s ],

          [ Opcodes.local_get, iTmp ],
          ...length.getCachedI32(),
          [ Opcodes.i32_ge_s ],
          [ Opcodes.i32_or ],

          [ Opcodes.if, Blocktype.void ],
          ...number(UNDEFINED),
          [ Opcodes.br, 1 ],
          [ Opcodes.end ],

          [ Opcodes.local_get, iTmp ],

          ...pointer,
          [ Opcodes.i32_add ],

          // load current string ind {arg}
          [ Opcodes.i32_load8_u, 0, ...unsignedLEB128(ValtypeSize.i32) ],

          // store to new string ind 0
          [ Opcodes.i32_store8, 0, ...unsignedLEB128(newPointer + ValtypeSize.i32) ],

          // return new string (pointer)
          ...number(newPointer)
        ];
      },

      // todo: out of bounds properly
      charAt: (pointer, length, wIndex, _1, _2, arrayShell) => {
        const [ newOut, newPointer ] = arrayShell(1, 'i16');

        return [
          // setup new/out array
          ...newOut,
          [ Opcodes.drop ],

          ...number(0, Valtype.i32), // base 0 for store later

          ...wIndex,

          Opcodes.i32_to,

          ...pointer,
          [ Opcodes.i32_add ],

          // load current string ind {arg}
          [ Opcodes.i32_load8_u, 0, ...unsignedLEB128(ValtypeSize.i32) ],

          // store to new string ind 0
          [ Opcodes.i32_store8, 0, ...unsignedLEB128(newPointer + ValtypeSize.i32) ],

          // return new string (page)
          ...number(newPointer)
        ];
      },

      charCodeAt: (pointer, length, wIndex, iTmp) => {
        return [
          ...wIndex,
          Opcodes.i32_to,

          ...(zeroChecks.charcodeat ? [] : [
            [ Opcodes.local_set, iTmp ],

            // index < 0
            ...(noUnlikelyChecks ? [] : [
              [ Opcodes.local_get, iTmp ],
              ...number(0, Valtype.i32),
              [ Opcodes.i32_lt_s ],
            ]),

            // index >= length
            [ Opcodes.local_get, iTmp ],
            ...length.getCachedI32(),
            [ Opcodes.i32_ge_s ],

            ...(noUnlikelyChecks ? [] : [ [ Opcodes.i32_or ] ]),
            [ Opcodes.if, Blocktype.void ],
            ...number(NaN),
            [ Opcodes.br, 1 ],
            [ Opcodes.end ],

            [ Opcodes.local_get, iTmp ],
          ]),

          ...pointer,
          [ Opcodes.i32_add ],

          // load current string ind {arg}
          [ Opcodes.i32_load8_u, 0, ...unsignedLEB128(ValtypeSize.i32) ],
          Opcodes.i32_from_u
        ];
      },

      isWellFormed: () => {
        return [
          // we know it must be true as it is a bytestring lol
          ...number(1)
        ]
      }
    };

    this[TYPES._bytestring].at.local = Valtype.i32;
    this[TYPES._bytestring].at.returnType = TYPES._bytestring;
    this[TYPES._bytestring].charAt.returnType = TYPES._bytestring;
    this[TYPES._bytestring].charCodeAt.local = Valtype.i32;
    this[TYPES._bytestring].charCodeAt.noPointerCache = zeroChecks.charcodeat;

    this[TYPES._bytestring].isWellFormed.local = Valtype.i32;
    this[TYPES._bytestring].isWellFormed.local2 = Valtype.i32;
    this[TYPES._bytestring].isWellFormed.returnType = TYPES.boolean;
  }
};