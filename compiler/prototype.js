import { Opcodes, Valtype, ValtypeSize, PageSize } from "./wasmSpec.js";
import { number } from "./embedding.js";
import { unsignedLEB128 } from "./encoding.js";

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
    // lX = local index of X ({ get, set }), wX = wasm ops of X
    // todo: these are only for 1 argument

    push: (arrayNumber, lArrayLength, wNewMember) => [
      // get memory offset of array at last index (length)
      lArrayLength.get,
      Opcodes.i32_to,
      ...number(ValtypeSize[valtype], Valtype.i32),
      [ Opcodes.i32_mul ],

      // generated wasm for new member
      ...wNewMember,

      // store in memory
      [ Opcodes.store, Math.log2(ValtypeSize[valtype]), ...unsignedLEB128((arrayNumber + 1) * PageSize) ],

      // bump array length by 1 and return it
      lArrayLength.get,
      ...number(1),
      [ Opcodes.add ],
      lArrayLength.set,
      lArrayLength.get,
    ]
  };

  this[TYPES._array].push.noArgRetLength = true;
};