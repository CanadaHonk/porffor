import type {} from './porffor.d.ts';

// todo: support non-bytestring properly
// todo: support constructor/string objects properly
export const String = function (value: any): bytestring {
  if (!new.target && Porffor.rawType(value) == Porffor.TYPES.symbol) return __Symbol_prototype_toString(value);
  return __ecma262_ToString(value);
};

export const __String_prototype_concat = (_this: string, arg: any) => {
  // todo: convert left and right to strings if not
  // todo: optimize by looking up names in arrays and using that if exists?
  // todo: optimize this if using literals/known lengths?
  let out: string = Porffor.s``;
  // todo: currently toString doesn't support non bytestrings properly, so this line goes unused
  // let other: bytestring = __ecma262_ToString(arg);

  Porffor.wasm`
  local leftLength i32
  local leftPtr i32
  local rightLength i32
  local rightPtr i32
  local outPtr i32

  local.get ${_this}
  i32.to_u
  local.set leftPtr
  
  local.get ${arg}
  i32.to_u
  local.set rightPtr

  local.get ${out}
  i32.to_u
  local.set outPtr

  ;; calculate length
  local.get outPtr

  local.get leftPtr
  i32.load 0 0 
  local.tee leftLength
  local.get rightPtr

  i32.load 0 0 
  local.tee rightLength
  i32.add
  ;; store out length
  i32.store 0 0
  ;; copy left
  ;; dst = out pointer + length size
  local.get outPtr
  i32.const 4 
  i32.add
  ;; src = left pointer + length size
  local.get leftPtr
  i32.const 4 
  i32.add
  
  local.get leftLength
  i32.const 
  i32.mul
  memory_copy 0 0

  ;; copy right
  ;; dst = out pointer + length size + left length * sizeof valtype
  local.get outPtr
  i32.const 4 
  i32.add
  local.get leftLength
  i32.const 2
  i32.mul
  i32.add
  ;; src = right pointer + length size
  local.get rightPtr
  i32.const 4 
  i32.add
  ;; size = right length * sizeof valtype
  local.get rightLength
  i32.const 2
  i32.mul
  memory_copy 0 0
  `;

  return out;
};

export const __ByteString_prototype_concat = (_this: bytestring, arg: any) => {
  // todo: convert left and right to strings if not
  // todo: optimize by looking up names in arrays and using that if exists?
  // todo: optimize this if using literals/known lengths?
  let out: bytestring = Porffor.bs``;
  let other: bytestring = __ecma262_ToString(arg);
  Porffor.wasm`
  local leftLength i32
  local leftPtr i32
  local rightLength i32
  local rightPtr i32
  local outPtr i32

  local.get ${_this}
  i32.to_u
  local.set leftPtr
  
  local.get ${other}
  i32.to_u
  local.set rightPtr

  local.get ${out}
  i32.to_u
  local.set outPtr

  ;; calculate length
  local.get outPtr

  local.get leftPtr
  i32.load 0 0 
  local.tee leftLength
  local.get rightPtr

  i32.load 0 0 
  local.tee rightLength
  i32.add
  ;; store out length
  i32.store 0 0
  ;; copy left
  ;; dst = out pointer + length size
  local.get outPtr
  i32.const 4 
  i32.add
  ;; src = left pointer + length size
  local.get leftPtr
  i32.const 4 
  i32.add
  
  local.get leftLength
  ;; i32.const 1
  ;; i32.mul
  memory_copy 0 0

  ;; copy right
  ;; dst = out pointer + length size + left length * sizeof valtype
  local.get outPtr
  i32.const 4 
  i32.add
  local.get leftLength
  ;; i32.const 1
  ;; i32.mul
  i32.add
  ;; src = right pointer + length size
  local.get rightPtr
  i32.const 4 
  i32.add
  ;; size = right length * sizeof valtype
  local.get rightLength
  ;; i32.const 1
  ;; i32.mul
  memory_copy 0 0
  `;
  return out;
};

