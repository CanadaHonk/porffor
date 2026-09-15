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
  const offset: number = Porffor.type(byteOffset) == Porffor.TYPES.undefined ? 0 : ecma262.ToIndex(byteOffset);
  if (offset > bufferLen) throw new RangeError('Invalid DataView byte offset');

  const len: number = Porffor.type(length) == Porffor.TYPES.undefined ? bufferLen - offset : ecma262.ToIndex(length);
  if (offset + len > bufferLen) throw new RangeError('Invalid DataView length');

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

export const __Porffor_dataview_ptr = function (this: DataView, byteOffset: number, size: i32): i32 {
  if (Porffor.callThis(__DataView_prototype_buffer$get, this).detached) throw new TypeError('Cannot operate on a detached ArrayBuffer');
  if (byteOffset + size > Porffor.IR.loadI32(this, 0)) throw new RangeError('Byte offset is out of bounds of the DataView');
  return Porffor.IR.loadI32(this, 4) + byteOffset;
};

export const __Porffor_dataview_swap16 = (value: i32): i32 => (value >>> 8) | ((value & 0xff) << 8);

export const __Porffor_dataview_swap32 = (value: i32): i32 => (value >>> 24) |
  ((value >>> 8) & 0x0000ff00) |
  ((value << 8) & 0x00ff0000) |
  (value << 24);

export const __DataView_prototype_getUint8 = function (this: DataView, byteOffset: any) {
  return Porffor.IR.loadU8(Porffor.callThis(__Porffor_dataview_ptr, this, ecma262.ToIndex(byteOffset), 1), 4);
};

export const __DataView_prototype_setUint8 = function (this: DataView, byteOffset: any, value: any) {
  byteOffset = ecma262.ToIndex(byteOffset);
  value = ecma262.ToNumber(value);
  Porffor.IR.storeU8(Porffor.callThis(__Porffor_dataview_ptr, this, byteOffset, 1), 4, value | 0);
  return undefined;
};

export const __DataView_prototype_getInt8 = function (this: DataView, byteOffset: any) {
  return Porffor.IR.loadI8(Porffor.callThis(__Porffor_dataview_ptr, this, ecma262.ToIndex(byteOffset), 1), 4);
};

export const __DataView_prototype_setInt8 = function (this: DataView, byteOffset: any, value: any) {
  return Porffor.callThis(__DataView_prototype_setUint8, this, byteOffset, value);
};

export const __DataView_prototype_getUint16 = function (this: DataView, byteOffset: any, littleEndian: any = false) {
  let value: i32 = Porffor.IR.loadU16(Porffor.callThis(__Porffor_dataview_ptr, this, ecma262.ToIndex(byteOffset), 2), 4);
  return !!littleEndian ? value : __Porffor_dataview_swap16(value);
};

export const __DataView_prototype_setUint16 = function (this: DataView, byteOffset: any, value: any, littleEndian: any = false) {
  byteOffset = ecma262.ToIndex(byteOffset);
  value = (ecma262.ToNumber(value) | 0) & 0xffff;
  Porffor.IR.storeU16(Porffor.callThis(__Porffor_dataview_ptr, this, byteOffset, 2), 4, !!littleEndian ? value : __Porffor_dataview_swap16(value));
  return undefined;
};

export const __DataView_prototype_getInt16 = function (this: DataView, byteOffset: any, littleEndian: any = false) {
  const value: i32 = Porffor.callThis(__DataView_prototype_getUint16, this, byteOffset, littleEndian);
  Porffor.IR.storeU16(__Porffor_dataview_reinterpretTemp, 0, value);
  return Porffor.IR.loadI16(__Porffor_dataview_reinterpretTemp, 0);
};

export const __DataView_prototype_setInt16 = function (this: DataView, byteOffset: any, value: any, littleEndian: any = false) {
  return Porffor.callThis(__DataView_prototype_setUint16, this, byteOffset, value, littleEndian);
};

export const __DataView_prototype_getUint32 = function (this: DataView, byteOffset: any, littleEndian: any = false) {
  let value: i32 = Porffor.IR.loadI32(Porffor.callThis(__Porffor_dataview_ptr, this, ecma262.ToIndex(byteOffset), 4), 4);
  return (!!littleEndian ? value : __Porffor_dataview_swap32(value)) >>> 0;
};

export const __DataView_prototype_setUint32 = function (this: DataView, byteOffset: any, value: any, littleEndian: any = false) {
  byteOffset = ecma262.ToIndex(byteOffset);
  value = ecma262.ToNumber(value) | 0;
  Porffor.IR.storeI32(Porffor.callThis(__Porffor_dataview_ptr, this, byteOffset, 4), 4, !!littleEndian ? value : __Porffor_dataview_swap32(value));
  return undefined;
};

export const __DataView_prototype_getInt32 = function (this: DataView, byteOffset: any, littleEndian: any = false) {
  return Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset, littleEndian) | 0;
};

export const __DataView_prototype_setInt32 = function (this: DataView, byteOffset: any, value: any, littleEndian: any = false) {
  return Porffor.callThis(__DataView_prototype_setUint32, this, byteOffset, value, littleEndian);
};

export const __DataView_prototype_getBigUint64 = function (this: DataView, byteOffset: any, littleEndian: any = false) {
  byteOffset = ecma262.ToIndex(byteOffset);
  const lo: number = Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset + (!!littleEndian ? 0 : 4), littleEndian);
  const hi: number = Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset + (!!littleEndian ? 4 : 0), littleEndian);
  Porffor.IR.storeI32(__Porffor_dataview_reinterpretTemp, 0, lo | 0);
  Porffor.IR.storeI32(__Porffor_dataview_reinterpretTemp, 4, hi | 0);
  return __Porffor_bigint_fromU64(Porffor.IR.loadI64(__Porffor_dataview_reinterpretTemp, 0));
};

export const __DataView_prototype_getBigInt64 = function (this: DataView, byteOffset: any, littleEndian: any = false) {
  byteOffset = ecma262.ToIndex(byteOffset);
  const lo: number = Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset + (!!littleEndian ? 0 : 4), littleEndian);
  const hi: number = Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset + (!!littleEndian ? 4 : 0), littleEndian);
  Porffor.IR.storeI32(__Porffor_dataview_reinterpretTemp, 0, lo | 0);
  Porffor.IR.storeI32(__Porffor_dataview_reinterpretTemp, 4, hi | 0);
  return __Porffor_bigint_fromS64(Porffor.IR.loadI64(__Porffor_dataview_reinterpretTemp, 0));
};

export const __DataView_prototype_setBigUint64 = function (this: DataView, byteOffset: any, value: any, littleEndian: any = false) {
  byteOffset = ecma262.ToIndex(byteOffset);
  value = ecma262.ToBigInt(value);
  Porffor.IR.storeI64(__Porffor_dataview_reinterpretTemp, 0, __Porffor_bigint_toI64(value));
  const lo: i32 = Porffor.IR.loadI32(__Porffor_dataview_reinterpretTemp, 0);
  const hi: i32 = Porffor.IR.loadI32(__Porffor_dataview_reinterpretTemp, 4);
  Porffor.callThis(__DataView_prototype_setUint32, this, byteOffset + (!!littleEndian ? 0 : 4), lo, littleEndian);
  return Porffor.callThis(__DataView_prototype_setUint32, this, byteOffset + (!!littleEndian ? 4 : 0), hi, littleEndian);
};

export const __DataView_prototype_setBigInt64 = function (this: DataView, byteOffset: any, value: any, littleEndian: any = false) {
  return Porffor.callThis(__DataView_prototype_setBigUint64, this, byteOffset, value, littleEndian);
};

export const __DataView_prototype_getFloat32 = function (this: DataView, byteOffset: any, littleEndian: any = false) {
  const value: number = Porffor.callThis(__DataView_prototype_getUint32, this, byteOffset, littleEndian);
  return Porffor.IR.bitsToF32(value | 0);
};

export const __DataView_prototype_setFloat32 = function (this: DataView, byteOffset: any, value: any, littleEndian: any = false) {
  byteOffset = ecma262.ToIndex(byteOffset);
  value = ecma262.ToNumber(value);
  const bits: i32 = Porffor.IR.f32ToBits(value);
  Porffor.IR.storeI32(Porffor.callThis(__Porffor_dataview_ptr, this, byteOffset, 4), 4, !!littleEndian ? bits : __Porffor_dataview_swap32(bits));
  return undefined;
};

export const __DataView_prototype_getFloat64 = function (this: DataView, byteOffset: any, littleEndian: any = false) {
  byteOffset = ecma262.ToIndex(byteOffset);
  const ptr: i32 = Porffor.callThis(__Porffor_dataview_ptr, this, byteOffset, 8);
  const lo: i32 = Porffor.IR.loadI32(ptr, 4);
  const hi: i32 = Porffor.IR.loadI32(ptr, 8);
  Porffor.IR.storeI32(__Porffor_dataview_reinterpretTemp, 0, !!littleEndian ? lo : __Porffor_dataview_swap32(hi));
  Porffor.IR.storeI32(__Porffor_dataview_reinterpretTemp, 4, !!littleEndian ? hi : __Porffor_dataview_swap32(lo));
  return Porffor.IR.loadF64(__Porffor_dataview_reinterpretTemp, 0);
};

export const __DataView_prototype_setFloat64 = function (this: DataView, byteOffset: any, value: any, littleEndian: any = false) {
  byteOffset = ecma262.ToIndex(byteOffset);
  value = ecma262.ToNumber(value);
  Porffor.IR.storeF64(__Porffor_dataview_reinterpretTemp, 0, value);
  const ptr: i32 = Porffor.callThis(__Porffor_dataview_ptr, this, byteOffset, 8);
  const lo: i32 = Porffor.IR.loadI32(__Porffor_dataview_reinterpretTemp, 0);
  const hi: i32 = Porffor.IR.loadI32(__Porffor_dataview_reinterpretTemp, 4);
  Porffor.IR.storeI32(ptr, 4, !!littleEndian ? lo : __Porffor_dataview_swap32(hi));
  Porffor.IR.storeI32(ptr, 8, !!littleEndian ? hi : __Porffor_dataview_swap32(lo));
  return undefined;
};
