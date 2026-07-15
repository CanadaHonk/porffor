import type {} from './porffor.d.ts';

const __Porffor_dataview_reinterpretTemp: i32 = Porffor.malloc(8);

export const DataView = function (arg: any, byteOffset: any, length: any): DataView {
  if (!new.target) throw new TypeError("Constructor DataView requires 'new'");

  if (Porffor.fastAnd(
    Porffor.type(arg) != Porffor.TYPES.arraybuffer,
    Porffor.type(arg) != Porffor.TYPES.sharedarraybuffer
  )) throw new TypeError('First argument to DataView constructor must be an ArrayBuffer');
  if ((arg as ArrayBuffer).detached) throw new TypeError('Constructed DataView with a detached ArrayBuffer');

  const bufferLen: i32 = Porffor.IR.loadI32(Porffor.IR.ptr(arg), 0);

  let offsetF: number = 0;
  if (Porffor.type(byteOffset) != Porffor.TYPES.undefined) offsetF = Math.trunc(byteOffset);
  if (offsetF < 0) throw new RangeError('Invalid DataView byte offset (negative)');
  if (offsetF > bufferLen) throw new RangeError('Invalid DataView byte offset (out of bounds of the buffer)');
  const offset: i32 = offsetF;

  let lenF: number = 0;
  if (Porffor.type(length) == Porffor.TYPES.undefined) {
    lenF = bufferLen - offset;
  } else {
    lenF = Math.trunc(length);
    if (lenF < 0) throw new RangeError('Invalid DataView length (negative)');
    if (lenF > 4294967295) throw new RangeError('Invalid DataView length (over 32 bit address space)');
    if (offset + lenF > bufferLen) throw new RangeError('Invalid DataView length (out of bounds of the buffer)');
  }
  const len: i32 = lenF;

  const out: DataView = Porffor.malloc(12);
  Porffor.IR.storeI32(out, 4, Porffor.IR.ptr(arg) + offset);
  Porffor.IR.storeI32(out, 8, offset);
  Porffor.IR.storeI32(out, 0, len);
  return out;
};

export const __DataView_prototype_buffer$get = function (this: DataView) {
  return (Porffor.IR.loadI32(this, 4) - Porffor.IR.loadI32(this, 8)) as ArrayBuffer;
};

export const __DataView_prototype_byteLength$get = function (this: DataView) {
  return Porffor.IR.loadI32(this, 0);
};

export const __DataView_prototype_byteOffset$get = function (this: DataView) {
  return Porffor.IR.loadI32(this, 8);
};


export const __DataView_prototype_getUint8 = function (this: DataView, byteOffset: number) {
  if (Porffor.callThis(__DataView_prototype_buffer$get, this).detached) throw new TypeError('Cannot operate on a detached ArrayBuffer');

  const len: i32 = Porffor.IR.loadI32(this, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  return Porffor.IR.loadU8(Porffor.IR.loadI32(this, 4) + byteOffset, 4);
};

export const __DataView_prototype_setUint8 = function (this: DataView, byteOffset: number, value: number) {
  if (Porffor.callThis(__DataView_prototype_buffer$get, this).detached) throw new TypeError('Cannot operate on a detached ArrayBuffer');

  const len: i32 = Porffor.IR.loadI32(this, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  Porffor.IR.storeU8(Porffor.IR.loadI32(this, 4) + byteOffset, 4, value);

  return undefined;
};

export const __DataView_prototype_getInt8 = function (this: DataView, byteOffset: number) {
  const n: i32 = Porffor.callThis(__DataView_prototype_getUint8, this, byteOffset);
  return n & 0x80 ? n ^ -0x100 : n;
};

export const __DataView_prototype_setInt8 = function (this: DataView, byteOffset: number, value: number) {
  return Porffor.callThis(__DataView_prototype_setUint8, this, byteOffset, value < 0 ? value | 0x100 : value);
};


export const __DataView_prototype_getUint16 = function (this: DataView, byteOffset: number, littleEndian: any) {
  if (Porffor.callThis(__DataView_prototype_buffer$get, this).detached) throw new TypeError('Cannot operate on a detached ArrayBuffer');

  const len: i32 = Porffor.IR.loadI32(this, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 1 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  let int: i32 = Porffor.IR.loadU16(Porffor.IR.loadI32(this, 4) + byteOffset, 4);

  if (!!littleEndian) return int;
  return (int >>> 8) | ((int & 0xFF) << 8);
};

export const __DataView_prototype_setUint16 = function (this: DataView, byteOffset: number, value: number, littleEndian: any) {
  if (Porffor.callThis(__DataView_prototype_buffer$get, this).detached) throw new TypeError('Cannot operate on a detached ArrayBuffer');

  const len: i32 = Porffor.IR.loadI32(this, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 1 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  let int: i32 = 0;
  if (!!littleEndian) {
    int = value >>> 0;
  } else {
    int = (value >>> 8) | ((value & 0xFF) << 8);
  }

  Porffor.IR.storeU16(Porffor.IR.loadI32(this, 4) + byteOffset, 4, int);

  return undefined;
};

export const __DataView_prototype_getInt16 = function (this: DataView, byteOffset: number, littleEndian: any) {
  const n: i32 = Porffor.callThis(__DataView_prototype_getUint16, this, byteOffset, littleEndian);
  return n & 0x8000 ? n ^ -0x10000 : n;
};

export const __DataView_prototype_setInt16 = function (this: DataView, byteOffset: number, value: number, littleEndian: any) {
  return Porffor.callThis(__DataView_prototype_setUint16, this, byteOffset, value < 0 ? value | 0x10000 : value, littleEndian);
};


export const __DataView_prototype_getUint32 = function (this: DataView, byteOffset: number, littleEndian: any) {
  if (Porffor.callThis(__DataView_prototype_buffer$get, this).detached) throw new TypeError('Cannot operate on a detached ArrayBuffer');

  const len: i32 = Porffor.IR.loadI32(this, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 3 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  let int: i32 = Porffor.IR.loadI32(Porffor.IR.loadI32(this, 4) + byteOffset, 4);

  if (!!littleEndian) return int >>> 0;
  return ((int >>> 24) |
    ((int >>> 8) & 0x0000ff00) |
    ((int << 8) & 0x00ff0000) |
    (int << 24)) >>> 0;
};

export const __DataView_prototype_setUint32 = function (this: DataView, byteOffset: number, value: number, littleEndian: any) {
  if (Porffor.callThis(__DataView_prototype_buffer$get, this).detached) throw new TypeError('Cannot operate on a detached ArrayBuffer');

  const len: i32 = Porffor.IR.loadI32(this, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 3 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  let int: i32 = 0;
  if (!!littleEndian) {
    int = value >>> 0;
  } else {
    int = (value >>> 24) |
      ((value >>> 8) & 0x0000FF00) |
      ((value << 8) & 0x00FF0000) |
      (value << 24);
  }

  Porffor.IR.storeI32(Porffor.IR.loadI32(this, 4) + byteOffset, 4, int);

  return undefined;
};

export const __DataView_prototype_getInt32 = function (this: DataView, byteOffset: number, littleEndian: any) {
  const n: i32 = Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset, littleEndian);
  return n & 0x80000000 ? n ^ -0x100000000 : n;
};

export const __DataView_prototype_setInt32 = function (this: DataView, byteOffset: number, value: number, littleEndian: any) {
  return Porffor.callThis(__DataView_prototype_setUint32, this, byteOffset, value >>> 0, littleEndian);
};

// export const __DataView_prototype_getBigUint64 = function (this: DataView, byteOffset: number, littleEndian: any) {
//   const lo: i32 = Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset + (!!littleEndian ? 0 : 4), littleEndian);
//   const hi: i32 = Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset + (!!littleEndian ? 4 : 0), littleEndian);
//   let out: bigint = 0n;
//   raw i64 combine:
// local.get ${hi}
// i32.to_u
// i64.extend_i32_u
// i64.const 32
// i64.shl
// local.get ${lo}
// i32.to_u
// i64.extend_i32_u
// i64.or
// call __Porffor_bigint_fromU64
// local.set ${out}
// i32.const 0`;
//   return out;
// };

// export const __DataView_prototype_getBigInt64 = function (this: DataView, byteOffset: number, littleEndian: any) {
//   const lo: i32 = Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset + (!!littleEndian ? 0 : 4), littleEndian);
//   const hi: i32 = Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset + (!!littleEndian ? 4 : 0), littleEndian);
//   let out: bigint = 0n;
//   raw i64 combine:
// local.get ${hi}
// i32.to_u
// i64.extend_i32_u
// i64.const 32
// i64.shl
// local.get ${lo}
// i32.to_u
// i64.extend_i32_u
// i64.or
// call __Porffor_bigint_fromS64
// local.set ${out}
// i32.const 0`;
//   return out;
// };

// export const __DataView_prototype_setBigUint64 = function (this: DataView, byteOffset: number, value: any, littleEndian: any) {
//   value = ecma262.ToBigInt(value);
//   value = BigInt.asUintN(64, value);
//   const lo: i32 = Number(value & 0xffffffffn);
//   const hi: i32 = Number(value >> 32n);
//   Porffor.callThis(__DataView_prototype_setUint32, this, byteOffset + (!!littleEndian ? 0 : 4), lo, littleEndian);
//   return Porffor.callThis(__DataView_prototype_setUint32, this, byteOffset + (!!littleEndian ? 4 : 0), hi, littleEndian);
// };

// export const __DataView_prototype_setBigInt64 = function (this: DataView, byteOffset: number, value: any, littleEndian: any) {
//   value = ecma262.ToBigInt(value);
//   value = BigInt.asUintN(64, value);
//   const lo: i32 = Number(value & 0xffffffffn);
//   const hi: i32 = Number(value >> 32n);
//   Porffor.callThis(__DataView_prototype_setUint32, this, byteOffset + (!!littleEndian ? 0 : 4), lo, littleEndian);
//   return Porffor.callThis(__DataView_prototype_setUint32, this, byteOffset + (!!littleEndian ? 4 : 0), hi, littleEndian);
// };

export const __DataView_prototype_getFloat32 = function (this: DataView, byteOffset: number, littleEndian: any) {
  let int: i32 = Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset, littleEndian);
  if (int >= 2147483648) int -= 4294967296;
  return Porffor.IR.bitsToF32(int);
};

export const __DataView_prototype_setFloat32 = function (this: DataView, byteOffset: number, value: number, littleEndian: any) {
  let int: i32 = Porffor.IR.f32ToBits(value);
  return Porffor.callThis(__DataView_prototype_setUint32, this, byteOffset, int, littleEndian);
};

export const __DataView_prototype_getFloat64 = function (this: DataView, byteOffset: number, littleEndian: any) {
  if (Porffor.callThis(__DataView_prototype_buffer$get, this).detached) throw new TypeError('Cannot operate on a detached ArrayBuffer');

  const len: i32 = Porffor.IR.loadI32(this, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 7 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  let lo: i32 = Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset + (!!littleEndian ? 0 : 4), littleEndian);
  let hi: i32 = Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset + (!!littleEndian ? 4 : 0), littleEndian);
  Porffor.IR.storeI32(__Porffor_dataview_reinterpretTemp, 0, lo);
  Porffor.IR.storeI32(__Porffor_dataview_reinterpretTemp, 4, hi);
  return Porffor.IR.loadF64(__Porffor_dataview_reinterpretTemp, 0);
};

export const __DataView_prototype_setFloat64 = function (this: DataView, byteOffset: number, value: number, littleEndian: any) {
  if (Porffor.callThis(__DataView_prototype_buffer$get, this).detached) throw new TypeError('Cannot operate on a detached ArrayBuffer');

  const len: i32 = Porffor.IR.loadI32(this, 0);
  if (Porffor.fastOr(byteOffset < 0, byteOffset + 7 >= len)) throw new RangeError('Byte offset is out of bounds of the DataView');

  Porffor.IR.storeF64(__Porffor_dataview_reinterpretTemp, 0, value);
  let lo: i32 = Porffor.IR.loadI32(__Porffor_dataview_reinterpretTemp, 0);
  let hi: i32 = Porffor.IR.loadI32(__Porffor_dataview_reinterpretTemp, 4);
  Porffor.callThis(__DataView_prototype_setUint32, this, byteOffset + (!!littleEndian ? 0 : 4), lo, littleEndian);
  return Porffor.callThis(__DataView_prototype_setUint32, this, byteOffset + (!!littleEndian ? 4 : 0), hi, littleEndian);
};
