import type {} from './porffor.d.ts';

export const DataView = function (arg: any, byteOffset: any, length: any): DataView {
  if (!new.target) throw new TypeError("Constructor DataView requires 'new'");

  const out: DataView = Porffor.allocateBytes(12);
  const outPtr: i32 = Porffor.wasm`local.get ${out}`;

  let len: i32 = 0;
  let bufferPtr: i32;

  const type: i32 = Porffor.rawType(arg);
  if (Porffor.fastOr(
    type == Porffor.TYPES.arraybuffer,
    type == Porffor.TYPES.sharedarraybuffer
  )) {
    bufferPtr = Porffor.wasm`local.get ${arg}`;

    if (arg.detached) throw new TypeError('Constructed DataView with a detached ArrayBuffer');

    let offset: i32 = 0;
    if (Porffor.rawType(byteOffset) != Porffor.TYPES.undefined) offset = Math.trunc(byteOffset);
    if (offset < 0) throw new RangeError('Invalid DataView byte offset (negative)');

    Porffor.wasm.i32.store(outPtr, offset, 0, 8);
    Porffor.wasm.i32.store(outPtr, bufferPtr + offset, 0, 4);

    if (Porffor.rawType(length) == Porffor.TYPES.undefined) {
      const bufferLen: i32 = Porffor.wasm.i32.load(bufferPtr, 0, 0);
      len = bufferLen - byteOffset;
    } else len = Math.trunc(length);
  } else {
    throw new TypeError('First argument to DataView constructor must be an ArrayBuffer');
  }

  if (len < 0) throw new RangeError('Invalid DataView length (negative)');
  if (len > 4294967295) throw new RangeError('Invalid DataView length (over 32 bit address space)');

  Porffor.wasm.i32.store(outPtr, len, 0, 0);
  return out;
};

export const __DataView_prototype_buffer$get = (_this: DataView) => {
  const out: ArrayBuffer = Porffor.wasm.i32.load(_this, 0, 4) - Porffor.wasm.i32.load(_this, 0, 8);
  return out;
};

export const __DataView_prototype_byteLength$get = (_this: DataView) => {
  return Porffor.wasm.i32.load(_this, 0, 0);
};

export const __DataView_prototype_byteOffset$get = (_this: DataView) => {
  return Porffor.wasm.i32.load(_this, 0, 8);
};


export const __DataView_prototype_getUint8 = (_this: DataView, byteOffset: number) => {
  const len: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  Porffor.wasm`
local.get ${_this}
i32.to_u
i32.load 0 4
local.get ${byteOffset}
i32.to_u
i32.add
i32.load8_u 0 4
i32.from_u
i32.const 0
return`;
};

export const __DataView_prototype_setUint8 = (_this: DataView, byteOffset: number, value: number) => {
  const len: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  Porffor.wasm`
local.get ${_this}
i32.to_u
i32.load 0 4
local.get ${byteOffset}
i32.to_u
i32.add
local.get ${value}
i32.to_u
i32.store8 0 4`;

  return undefined;
};

export const __DataView_prototype_getInt8 = (_this: DataView, byteOffset: number) => {
  const n: i32 = __DataView_prototype_getUint8(_this, byteOffset);
  return n & 0x80 ? n ^ -0x100 : n;
};

export const __DataView_prototype_setInt8 = (_this: DataView, byteOffset: number, value: number) => {
  return __DataView_prototype_setUint8(_this, byteOffset, value < 0 ? value | 0x100 : value);
};


export const __DataView_prototype_getUint16 = (_this: DataView, byteOffset: number, littleEndian: any) => {
  const len: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 1 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  let byte1: i32 = 0, byte2: i32 = 0;
  Porffor.wasm`local ptr i32
local.get ${_this}
i32.to_u
i32.load 0 4
local.get ${byteOffset}
i32.to_u
i32.add
local.set ptr

local.get ptr
i32.load8_u 0 4
i32.from_u
local.set ${byte1}
local.get ptr
i32.load8_u 0 5
i32.from_u
local.set ${byte2}`;

  if (Boolean(littleEndian)) return byte1 | (byte2 << 8);
  return (byte1 << 8) | byte2;
};

export const __DataView_prototype_setUint16 = (_this: DataView, byteOffset: number, value: number, littleEndian: any) => {
  const len: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 1 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  let byte1: i32 = 0, byte2: i32 = 0;
  if (littleEndian) {
    byte1 = value & 0xff;
    byte2 = (value >>> 8) & 0xff;
  } else {
    byte1 = (value >>> 8) & 0xff;
    byte2 = value & 0xff;
  }

  Porffor.wasm`local ptr i32
local.get ${_this}
i32.to_u
i32.load 0 4
local.get ${byteOffset}
i32.to_u
i32.add
local.set ptr

local.get ptr
local.get ${byte1}
i32.to_u
i32.store8 0 4
local.get ptr
local.get ${byte2}
i32.to_u
i32.store8 0 5`;

  return undefined;
};

export const __DataView_prototype_getInt16 = (_this: DataView, byteOffset: number, littleEndian: any) => {
  const n: i32 = __DataView_prototype_getUint16(_this, byteOffset, littleEndian);
  return n & 0x8000 ? n ^ -0x10000 : n;
};

export const __DataView_prototype_setInt16 = (_this: DataView, byteOffset: number, value: number, littleEndian: any) => {
  return __DataView_prototype_setUint16(_this, byteOffset, value < 0 ? value | 0x10000 : value, littleEndian);
};


export const __DataView_prototype_getUint32 = (_this: DataView, byteOffset: number, littleEndian: any) => {
  const len: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 3 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  let byte1: i32 = 0, byte2: i32 = 0, byte3: i32 = 0, byte4: i32 = 0;
  Porffor.wasm`local ptr i32
local.get ${_this}
i32.to_u
i32.load 0 4
local.get ${byteOffset}
i32.to_u
i32.add
local.set ptr

local.get ptr
i32.load8_u 0 4
i32.from_u
local.set ${byte1}
local.get ptr
i32.load8_u 0 5
i32.from_u
local.set ${byte2}
local.get ptr
i32.load8_u 0 6
i32.from_u
local.set ${byte3}
local.get ptr
i32.load8_u 0 7
i32.from_u
local.set ${byte4}`;

  if (Boolean(littleEndian)) return byte1 | (byte2 << 8) | (byte3 << 16) | (byte4 << 24);
  return (byte1 << 24) | (byte2 << 16) | (byte3 << 8) | byte4;
};

export const __DataView_prototype_setUint32 = (_this: DataView, byteOffset: number, value: number, littleEndian: any) => {
  const len: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 3 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  let byte1: i32 = 0, byte2: i32 = 0, byte3: i32 = 0, byte4: i32 = 0;
  if (littleEndian) {
    byte1 = value & 0xff;
    byte2 = (value >>> 8) & 0xff;
    byte3 = (value >>> 16) & 0xff;
    byte4 = (value >>> 24) & 0xff;
  } else {
    byte1 = (value >>> 24) & 0xff;
    byte2 = (value >>> 16) & 0xff;
    byte3 = (value >>> 8) & 0xff;
    byte4 = value & 0xff;
  }

  Porffor.wasm`local ptr i32
local.get ${_this}
i32.to_u
i32.load 0 4
local.get ${byteOffset}
i32.to_u
i32.add
local.set ptr

local.get ptr
local.get ${byte1}
i32.to_u
i32.store8 0 4
local.get ptr
local.get ${byte2}
i32.to_u
i32.store8 0 5
local.get ptr
local.get ${byte3}
i32.to_u
i32.store8 0 6
local.get ptr
local.get ${byte4}
i32.to_u
i32.store8 0 7`;

  return undefined;
};

export const __DataView_prototype_getInt32 = (_this: DataView, byteOffset: number, littleEndian: any) => {
  const n: i32 = __DataView_prototype_getUint32(_this, byteOffset, littleEndian);
  return n & 0x80000000 ? n ^ -0x100000000 : n;
};

export const __DataView_prototype_setInt32 = (_this: DataView, byteOffset: number, value: number, littleEndian: any) => {
  return __DataView_prototype_setUint32(_this, byteOffset, value < 0 ? value | 0x100000000 : value, littleEndian);
};