import type {} from './porffor.d.ts';

export function DataView(arg: any, byteOffset: any, length: any): DataView {
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

export function __DataView_prototype_buffer$get() {
  const out: ArrayBuffer = Porffor.wasm.i32.load(this, 0, 4) - Porffor.wasm.i32.load(this, 0, 8);
  return out;
};

export function __DataView_prototype_byteLength$get() {
  return Porffor.wasm.i32.load(this, 0, 0);
};

export function __DataView_prototype_byteOffset$get() {
  return Porffor.wasm.i32.load(this, 0, 8);
};


export function __DataView_prototype_getUint8(byteOffset: number) {
  const len: i32 = Porffor.wasm.i32.load(this, 0, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  Porffor.wasm`
local.get ${this}
i32.to_u
i32.load 0 4
local.get ${byteOffset}
i32.to_u
i32.add
i32.load8_u 0 4
i32.from_u
i32.const 1
return`;
};

export function __DataView_prototype_setUint8(byteOffset: number, value: number) {
  const len: i32 = Porffor.wasm.i32.load(this, 0, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  Porffor.wasm`
local.get ${this}
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

export function __DataView_prototype_getInt8(byteOffset: number) {
  const n: i32 = __DataView_prototype_getUint8.call(this, byteOffset);
  return n & 0x80 ? n ^ -0x100 : n;
};

export function __DataView_prototype_setInt8(byteOffset: number, value: number) {
  return __DataView_prototype_setUint8.call(this, byteOffset, value < 0 ? value | 0x100 : value);
};


export function __DataView_prototype_getUint16(byteOffset: number, littleEndian: any) {
  const len: i32 = Porffor.wasm.i32.load(this, 0, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 1 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  let int: i32 = 0;
  Porffor.wasm`
local.get ${this}
i32.to_u
i32.load 0 4
local.get ${byteOffset}
i32.to_u
i32.add

i32.load16_u 0 4
i32.from_u
local.set ${int}`;

  if (Boolean(littleEndian)) return int;
  return (int >>> 8) | ((int & 0xFF) << 8);
};

export function __DataView_prototype_setUint16(byteOffset: number, value: number, littleEndian: any) {
  const len: i32 = Porffor.wasm.i32.load(this, 0, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 1 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  let int: i32 = 0;
  if (Boolean(littleEndian)) {
    int = value;
  } else {
    int = (value >>> 8) | ((value & 0xFF) << 8);
  }

  Porffor.wasm`
local.get ${this}
i32.to_u
i32.load 0 4
local.get ${byteOffset}
i32.to_u
i32.add

local.get ${int}
i32.to_u
i32.store16 0 4`;

  return undefined;
};

export function __DataView_prototype_getInt16(byteOffset: number, littleEndian: any) {
  const n: i32 = __DataView_prototype_getUint16.call(this, byteOffset, littleEndian);
  return n & 0x8000 ? n ^ -0x10000 : n;
};

export function __DataView_prototype_setInt16(byteOffset: number, value: number, littleEndian: any) {
  return __DataView_prototype_setUint16.call(this, byteOffset, value < 0 ? value | 0x10000 : value, littleEndian);
};


export function __DataView_prototype_getUint32(byteOffset: number, littleEndian: any) {
  const len: i32 = Porffor.wasm.i32.load(this, 0, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 3 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  let int: i32 = 0;
  Porffor.wasm`
local.get ${this}
i32.to_u
i32.load 0 4
local.get ${byteOffset}
i32.to_u
i32.add

i32.load 0 4
i32.from_u
local.set ${int}`;

  if (Boolean(littleEndian)) return int;
  return (int >>> 24) |
    ((int >>> 8) & 0x0000ff00) |
    ((int << 8) & 0x00ff0000) |
    (int << 24);
};

export function __DataView_prototype_setUint32(byteOffset: number, value: number, littleEndian: any) {
  const len: i32 = Porffor.wasm.i32.load(this, 0, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 3 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  let int: i32 = 0;
  if (Boolean(littleEndian)) {
    int = value;
  } else {
    int = (value >>> 24) |
      ((value >>> 8) & 0x0000FF00) |
      ((value << 8) & 0x00FF0000) |
      (value << 24);
  }

  Porffor.wasm`
local.get ${this}
i32.to_u
i32.load 0 4
local.get ${byteOffset}
i32.to_u
i32.add

local.get ${int}
i32.to_u
i32.store 0 4`;

  return undefined;
};

export function __DataView_prototype_getInt32(byteOffset: number, littleEndian: any) {
  const n: i32 = __DataView_prototype_getUint32.call(this, byteOffset, littleEndian);
  return n & 0x80000000 ? n ^ -0x100000000 : n;
};

export function __DataView_prototype_setInt32(byteOffset: number, value: number, littleEndian: any) {
  return __DataView_prototype_setUint32.call(this, byteOffset, value < 0 ? value | 0x100000000 : value, littleEndian);
};

export function __DataView_prototype_getFloat32(byteOffset: number, littleEndian: any) {
  const int: i32 = __DataView_prototype_getUint32.call(this, byteOffset, littleEndian);
  Porffor.wasm`
local.get ${int}
i32.to_u
f32.reinterpret_i32
f64.promote_f32
i32.const 1
return`;
};

export function __DataView_prototype_setFloat32(byteOffset: number, value: number, littleEndian: any) {
  let int: i32 = 0;
  Porffor.wasm`
local.get ${value}
f32.demote_f64
i32.reinterpret_f32
i32.from_u
local.set ${int}`;
  return __DataView_prototype_setUint32.call(this, byteOffset, int, littleEndian);
};