// @porf --funsafe-no-unlikely-proto-checks --valtype=i32

// todo: trimLeft, trimRight
export const __String_prototype_trimLeft = (_this: string) => {
  return __String_prototype_trimStart(_this);
};

export const ___bytestring_prototype_trimLeft = (_this: string) => {
  return ___bytestring_prototype_trimStart(_this);
};


export const __String_prototype_trimRight = (_this: string) => {
  return __String_prototype_trimEnd(_this);
};

export const ___bytestring_prototype_trimEnd = (_this: string) => {
  return ___bytestring_prototype_trimRight(_this);
};