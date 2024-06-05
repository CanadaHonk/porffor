import type {} from './porffor.d.ts';

// todo: support non-bytestring properly
export const String = function (value: any) {
  const str: bytestring = ecma262.ToString(value);
  // todo: support constructor/string objects properly
  if (new.target) return str;
  return str;
};

export const __String_prototype_concat = (_this: string, arg: any) => {
  // todo: convert left and right to strings if not
  // todo: optimize by looking up names in arrays and using that if exists?
  // todo: optimize this if using literals/known lengths?

  // todo: currently toString doesn't support non bytestrings properly, so this line goes unused
  // let other: bytestring = __ecma262_ToString(arg);
  
  const leftPtr: number = Porffor.wasm`local.get ${_this}`;
  const rightPtr: number = Porffor.wasm`local.get ${arg}`;
  const leftLength: i32 = _this.length;
  const rightLength: i32 = arg.length;
  if (leftLength == 0) return arg;
  if (rightLength == 0) return _this;

  const outLen: i32 = leftLength + rightLength;
  let out = Porffor.allocateBytes<bytestring>(4 + outLen * 2);
  out.length = outLen;
  const outPtr: number = Porffor.wasm`local.get ${out}`;

  Porffor.wasm.memory.copy(outPtr + 4, leftPtr + 4, leftLength * 2);
  Porffor.wasm.memory.copy(outPtr + 4 + leftLength * 2, rightPtr + 4, rightLength * 2);

  return out;
};

export const __ByteString_prototype_concat = (_this: bytestring, arg: any) => {
  // todo: optimize by looking up names in arrays and using that if exists?
  // todo: optimize this if using literals/known lengths?
  const left: bytestring = ecma262.ToString(_this);
  const right: bytestring = ecma262.ToString(arg);
  
  const leftPtr: number = Porffor.wasm`local.get ${left}`;
  const rightPtr: number = Porffor.wasm`local.get ${right}`;
  const leftLength: i32 = left.length;
  const rightLength: i32 = right.length;
  if (leftLength == 0) return right;
  if (rightLength == 0) return left;

  const outLen: i32 = leftLength + rightLength;
  let out = Porffor.allocateBytes<bytestring>(4 + outLen);
  out.length = outLen;
  const outPtr: number = Porffor.wasm`local.get ${out}`;

  Porffor.wasm.memory.copy(outPtr + 4, leftPtr + 4, leftLength);
  Porffor.wasm.memory.copy(outPtr + 4 + leftLength, rightPtr + 4, rightLength);
  return out;
};

