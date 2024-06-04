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
  let out: string = Porffor.allocate();
  // todo: currently toString doesn't support non bytestrings properly, so this line goes unused
  // let other: bytestring = __ecma262_ToString(arg);

  const leftPtr: number = Porffor.wasm`local.get ${_this}`
  const rightPtr: number = Porffor.wasm`local.get ${arg}`
  const outPtr: number = Porffor.wasm`local.get ${out}`

  const leftLength: i32 = _this.length;
  const rightLength: i32 = arg.length;

  if (leftLength == 0) return arg;
  if (rightLength == 0) return _this;

  out.length = leftLength + rightLength;

  Porffor.wasm.memory.copy(outPtr + 4, leftPtr + 4, leftLength * 2);
  Porffor.wasm.memory.copy(outPtr + 4 + leftLength * 2, rightPtr + 4, rightLength * 2);

  return out;
};

export const __ByteString_prototype_concat = (_this: bytestring, arg: any) => {
  // todo: optimize by looking up names in arrays and using that if exists?
  // todo: optimize this if using literals/known lengths?
  let out: bytestring = Porffor.allocate();
  const other: bytestring = __ecma262_ToString(arg);

  const leftPtr: number = Porffor.wasm`local.get ${_this}`
  const rightPtr: number = Porffor.wasm`local.get ${other}`
  const outPtr: number = Porffor.wasm`local.get ${out}`

  const leftLength: i32 = _this.length;
  const rightLength: i32 = other.length;

  if (leftLength == 0) return other;
  if (rightLength == 0) return _this;

  out.length = leftLength + rightLength;

  Porffor.wasm.memory.copy(outPtr + 4, leftPtr + 4, leftLength);
  Porffor.wasm.memory.copy(outPtr + 4 + leftLength, rightPtr + 4, rightLength);
  return out;
};

