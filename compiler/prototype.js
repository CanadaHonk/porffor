import { Opcodes, Blocktype, Valtype, ValtypeSize, PageSize } from "./wasmSpec.js";
import { number } from "./embedding.js";
import { unsignedLEB128 } from "./encoding.js";
import { UNDEFINED } from "./builtins.js";

// todo: do not duplicate this
const TYPES = {
  number: 0xffffffffffff0,
  boolean: 0xffffffffffff1,
  string: 0xffffffffffff2,
  undefined: 0xffffffffffff3,
  object: 0xffffffffffff4,
  function: 0xffffffffffff5,
  symbol: 0xffffffffffff6,
  bigint: 0xffffffffffff7,

  // these are not "typeof" types but tracked internally
  _array: 0xffffffffffff8
};

export const PrototypeFuncs = function() {
  this[TYPES._array] = {
    // lX = local accessor of X ({ get, set }), iX = local index of X, wX = wasm ops of X
    at: (page, lArrayLength, wIndex, iTmp) => [
      ...wIndex,
      [ Opcodes.local_tee, iTmp ],

      // if index < 0: access index + array length
      ...number(0),
      [ Opcodes.lt ],
      [ Opcodes.if, Blocktype.void ],
      [ Opcodes.local_get, iTmp ],
      lArrayLength.get,
      [ Opcodes.add ],
      [ Opcodes.local_set, iTmp ],
      [ Opcodes.end ],

      [ Opcodes.local_get, iTmp ],

      ...(valtype === 'f64' ? [
        ...number(0),
        [ Opcodes.f64_max ]
      ] : [
        ...number(0),
        [ Opcodes.lt ],
        [ Opcodes.if, valtypeBinary ],
        ...number(0),
        [ Opcodes.add ],
        [ Opcodes.local_get, iTmp ],
        [ Opcodes.end ],
      ]),

      Opcodes.i32_to,
      ...number(ValtypeSize[valtype], Valtype.i32),
      [ Opcodes.i32_mul ],

      // read from memory
      [ Opcodes.load, Math.log2(ValtypeSize[valtype]), ...unsignedLEB128(page * PageSize) ]
    ],

    // todo: only for 1 argument
    push: (page, lArrayLength, wNewMember) => [
      // get memory offset of array at last index (length)
      lArrayLength.get,
      Opcodes.i32_to,
      ...number(ValtypeSize[valtype], Valtype.i32),
      [ Opcodes.i32_mul ],

      // generated wasm for new member
      ...wNewMember,

      // store in memory
      [ Opcodes.store, Math.log2(ValtypeSize[valtype]), ...unsignedLEB128(page * PageSize) ],

      // bump array length by 1 and return it
      lArrayLength.get,
      ...number(1),
      [ Opcodes.add ],
      lArrayLength.set,
      lArrayLength.get,
    ],

    pop: (page, lArrayLength) => [
      // if length == 0, noop
      lArrayLength.get,
      ...Opcodes.eqz,
      [ Opcodes.if, Blocktype.void ],
      ...number(UNDEFINED),
      [ Opcodes.return ],
      [ Opcodes.end ],

      // todo: should we store 0/undefined in "removed" element?

      // decrement length by 1
      lArrayLength.get,
      ...number(1),
      [ Opcodes.sub ],
      lArrayLength.set,

      // load last element
      lArrayLength.get,
      Opcodes.i32_to,
      ...number(ValtypeSize[valtype], Valtype.i32),
      [ Opcodes.i32_mul ],

      [ Opcodes.load, Math.log2(ValtypeSize[valtype]), ...unsignedLEB128(page * PageSize) ]
    ],

    shift: (page, lArrayLength) => [
      // if length == 0, noop
      lArrayLength.get,
      ...Opcodes.eqz,
      [ Opcodes.if, Blocktype.void ],
      ...number(UNDEFINED),
      [ Opcodes.return ],
      [ Opcodes.end ],

      // todo: should we store 0/undefined in "removed" element?

      // decrement length by 1
      lArrayLength.get,
      ...number(1),
      [ Opcodes.sub ],
      lArrayLength.set,

      // load first element
      ...number(0, Valtype.i32),
      [ Opcodes.load, Math.log2(ValtypeSize[valtype]), ...unsignedLEB128(page * PageSize) ],

      // offset all elements by -1 ind
      ...number(page * PageSize, Valtype.i32), // dst = base array index
      ...number(page * PageSize + ValtypeSize[valtype], Valtype.i32), // src = base array index + an index
      ...number(PageSize - ValtypeSize[valtype], Valtype.i32), // size = PageSize - an index
      [ ...Opcodes.memory_copy, 0x00, 0x00 ]
    ]
  };

  this[TYPES._array].at.local = true;
  this[TYPES._array].push.noArgRetLength = true;
};