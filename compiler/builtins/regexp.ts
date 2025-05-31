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

// todo: reimplement following spec, this shouldn't use default parameters because `RegExp.length == 2`
export const RegExp = function (patternStr: any = '', flagsStr: any = ''): RegExp {
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

// 22.2.6.4 get RegExp.prototype.flags
// https://tc39.es/ecma262/multipage/text-processing.html#sec-get-regexp.prototype.flags
export const __RegExp_prototype_flags$get = (_this: RegExp) => {
  // 1. Let R be the this value.
  // 2. If R is not an Object, throw a TypeError exception.
  if (!Porffor.object.isObject(_this)) throw new TypeError('This is a non-object');
  let flags: i32 = Porffor.wasm.i32.load(_this, 0, 8);
  // 3. Let codeUnits be a new empty List.
  let result: bytestring = Porffor.allocateBytes(4 + 8);
  // 4. Let hasIndices be ToBoolean(? Get(R, "hasIndices")).
  // 5. If hasIndices is true, append the code unit 0x0064 (LATIN SMALL LETTER D) to codeUnits.
  if (flags & 0b01000000) Porffor.bytestring.appendChar(result, 0x64);
  // 6. Let global be ToBoolean(? Get(R, "global")).
  // 7. If global is true, append the code unit 0x0067 (LATIN SMALL LETTER G) to codeUnits.
  if (flags & 0b00000001) Porffor.bytestring.appendChar(result, 0x67);
  // 8. Let ignoreCase be ToBoolean(? Get(R, "ignoreCase")).
  // 9. If ignoreCase is true, append the code unit 0x0069 (LATIN SMALL LETTER I) to codeUnits.
  if (flags & 0b00000010) Porffor.bytestring.appendChar(result, 0x69);
  // 10. Let multiline be ToBoolean(? Get(R, "multiline")).
  // 11. If multiline is true, append the code unit 0x006D (LATIN SMALL LETTER M) to codeUnits.
  if (flags & 0b00000100) Porffor.bytestring.appendChar(result, 0x6d);
  // 12. Let dotAll be ToBoolean(? Get(R, "dotAll")).
  // 13. If dotAll is true, append the code unit 0x0073 (LATIN SMALL LETTER S) to codeUnits.
  if (flags & 0b00001000) Porffor.bytestring.appendChar(result, 0x73);
  // 14. Let unicode be ToBoolean(? Get(R, "unicode")).
  // 15. If unicode is true, append the code unit 0x0075 (LATIN SMALL LETTER U) to codeUnits.
  if (flags & 0b00010000) Porffor.bytestring.appendChar(result, 0x75);
  // 16. Let unicodeSets be ToBoolean(? Get(R, "unicodeSets")).
  // 17. If unicodeSets is true, append the code unit 0x0076 (LATIN SMALL LETTER V) to codeUnits.
  if (flags & 0b10000000) Porffor.bytestring.appendChar(result, 0x76);
  // 18. Let sticky be ToBoolean(? Get(R, "sticky")).
  // 19. If sticky is true, append the code unit 0x0079 (LATIN SMALL LETTER Y) to codeUnits.
  if (flags & 0b00100000) Porffor.bytestring.appendChar(result, 0x79);
  // 20. Return the String value whose code units are the elements of the List codeUnits. If codeUnits has no elements, the empty String is returned.
  return result;
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