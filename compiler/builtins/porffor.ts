// dark wasm magic for dealing with memory, sorry.
export const __Porffor_allocatePage = (): number => {
  Porffor.wasm`
i32.const 1
memory.grow 0
i32.const 65536
i32.mul
i32.from_u
i32.const 0
return`;
};

export const __Porffor_bytestring_spliceString = (str: bytestring, offset: number, appendage: bytestring) => {
  const appendageLen: i32 = appendage.length;
  const strPtr: i32 = Porffor.wasm`local.get ${str}`;
  const appendagePtr: i32 = Porffor.wasm`local.get ${appendage}`;
  Porffor.wasm.memory.copy(strPtr + 4 + offset, appendagePtr + 4, appendageLen);
};

export const __Porffor_string_spliceString = (str: string, offset: number, appendage: string) => {
  const appendageLen: i32 = appendage.length;
  const strPtr: i32 = Porffor.wasm`local.get ${str}`;
  const appendagePtr: i32 = Porffor.wasm`local.get ${appendage}`;
  Porffor.wasm.memory.copy(strPtr + 4 + offset * 2, appendagePtr + 4, appendageLen * 2);
};

// fast appending string
export const __Porffor_bytestring_appendStr = (str: bytestring, appendage: bytestring): i32 => {
  const strLen: i32 = str.length;
  const appendageLen: i32 = appendage.length;
  let strPtr: i32 = Porffor.wasm`local.get ${str}` + strLen;
  let appendagePtr: i32 = Porffor.wasm`local.get ${appendage}`;
  let endPtr: i32 = appendagePtr + appendageLen;

  while (appendagePtr < endPtr) {
    Porffor.wasm.i32.store8(strPtr++, Porffor.wasm.i32.load8_u(appendagePtr++, 0, 4), 0, 4);
  }

  str.length = strLen + appendageLen;
  return 1;
};

// fast appending single character
export const __Porffor_bytestring_appendChar = (str: bytestring, char: i32): i32 => {
  const len: i32 = str.length;
  Porffor.wasm.i32.store8(Porffor.wasm`local.get ${str}` + len, char, 0, 4);
  str.length = len + 1;
  return 1;
};

// fast appending padded number
export const __Porffor_bytestring_appendPadNum = (str: bytestring, num: number, len: number): i32 => {
  let numStr: bytestring = Number.prototype.toFixed(num, 0);

  let strPtr: i32 = Porffor.wasm`local.get ${str}` + str.length;

  let numStrLen: i32 = numStr.length;
  const strPtrEnd: i32 = strPtr + (len - numStrLen);
  while (strPtr < strPtrEnd) {
    Porffor.wasm.i32.store8(strPtr++, 48, 0, 4);
  }

  let numPtr: i32 = Porffor.wasm`local.get ${numStr}`;
  const numPtrEnd: i32 = numPtr + numStrLen;
  while (numPtr < numPtrEnd) {
    Porffor.wasm.i32.store8(strPtr++, Porffor.wasm.i32.load8_u(numPtr++, 0, 4), 0, 4);
  }

  str.length = strPtr - Porffor.wasm`local.get ${str}`;

  return 1;
};