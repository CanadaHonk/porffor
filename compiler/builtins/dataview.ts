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
i32.store8 0 4
i32.const 0
i32.from
i32.const 3
return`;
};