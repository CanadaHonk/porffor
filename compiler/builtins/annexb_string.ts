// @porf --valtype=i32
import type {} from './porffor.d.ts';

export const __String_prototype_trimLeft = (_this: string) => {
  return __String_prototype_trimStart(_this);
};

export const __ByteString_prototype_trimLeft = (_this: bytestring) => {
  return __ByteString_prototype_trimStart(_this);
};


export const __String_prototype_trimRight = (_this: string) => {
  return __String_prototype_trimEnd(_this);
};

export const __ByteString_prototype_trimRight = (_this: bytestring) => {
  return __ByteString_prototype_trimEnd(_this);
};