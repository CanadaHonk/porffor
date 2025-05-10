import type {} from './porffor.d.ts';

// regex memory structure:
//  source string ptr (u32)
//  flags string ptr (u32)
//  flags (u16):
//   g, global - 0b00000001
//   i, ignore case - 0b00000010
//   m, multiline - 0b00000100
//   s, dotall - 0b00001000
//   u, unicode - 0b00010000
//   y, sticky - 0b00100000
//   d, has indices - 0b01000000
//   v, unicode sets - 0b10000000
//  bytecode length (u16)
//  bytecode ...

export const __Porffor_regex_construct = (patternStr: bytestring, flagsStr: bytestring): RegExp => {
  const ptr: i32 = Porffor.allocate();
  Porffor.wasm.i32.store(ptr, patternStr, 0, 0);
  Porffor.wasm.i32.store(ptr, flagsStr, 0, 4);

  // parse flags
  let flags: i32 = 0;
  let flagsPtr: i32 = flagsStr;
  const flagsEndPtr: i32 = flagsPtr + flagsStr.length;
  while (flagsPtr < flagsEndPtr) {
    const char: i32 = Porffor.wasm.i32.load8_u(flagsPtr, 0, 4);
    flagsPtr = flagsPtr + 1;

    if (char == 103) { // g
      flags |= 0b00000001;
      continue;
    }
    if (char == 105) { // i
      flags |= 0b00000010;
      continue;
    }
    if (char == 109) { // m
      flags |= 0b00000100;
      continue;
    }
    if (char == 115) { // s
      flags |= 0b00001000;
      continue;
    }
    if (char == 117) { // u
      if (flags & 0b10000000) throw new SyntaxError('Conflicting regular expression unicode flags');
      flags |= 0b00010000;
      continue;
    }
    if (char == 121) { // y
      flags |= 0b00100000;
      continue;
    }
    if (char == 100) { // d
      flags |= 0b01000000;
      continue;
    }
    if (char == 118) { // v
      if (flags & 0b00010000) throw new SyntaxError('Conflicting regular expression unicode flags');
      flags |= 0b10000000;
      continue;
    }

    throw new SyntaxError('Invalid regular expression flag');
  }

  Porffor.wasm.i32.store16(ptr, flags, 0, 8);

  return ptr;
};


export const RegExp = function (patternStr: any, flagsStr: any = ''): RegExp {
  if (Porffor.fastOr(
    Porffor.type(patternStr) != Porffor.TYPES.bytestring,
    Porffor.type(flagsStr) != Porffor.TYPES.bytestring
  )) {
    throw new TypeError('Invalid regular expression');
  }

  return __Porffor_regex_construct(patternStr, flagsStr);
};

export const __RegExp_prototype_source$get = (_this: RegExp) => {
  return Porffor.wasm.i32.load(_this, 0, 0) as bytestring;
};

export const __RegExp_prototype_flags$get = (_this: RegExp) => {
  return Porffor.wasm.i32.load(_this, 0, 4) as bytestring;
};

export const __RegExp_prototype_global$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load(_this, 0, 8) & 0b00000001) as boolean;
};

export const __RegExp_prototype_ignoreCase$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load(_this, 0, 8) & 0b00000010) as boolean;
};

export const __RegExp_prototype_multiline$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load(_this, 0, 8) & 0b00000100) as boolean;
};

export const __RegExp_prototype_dotAll$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load(_this, 0, 8) & 0b00001000) as boolean;
};

export const __RegExp_prototype_unicode$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load(_this, 0, 8) & 0b00010000) as boolean;
};

export const __RegExp_prototype_sticky$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load(_this, 0, 8) & 0b00100000) as boolean;
};

export const __RegExp_prototype_hasIndices$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load(_this, 0, 8) & 0b01000000) as boolean;
};

export const __RegExp_prototype_unicodeSets$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load(_this, 0, 8) & 0b10000000) as boolean;
};

export const __RegExp_prototype_toString = (_this: RegExp) => {
  return '/' + _this.source + '/' + _this.flags;
};