import type {} from './porffor.d.ts';

const __Porffor_dataview_reinterpretTemp: i32 = Porffor.malloc(8);

// dataview layout: byteLength (i32, -1 if length-tracking), ptr (i32, buffer + 4 + byteOffset), byteOffset (i32)
export const DataView = function (arg: any, byteOffset: any, length: any): DataView {
  if (!new.target) throw new TypeError("Constructor DataView requires 'new'");

  if (Porffor.fastAnd(
    Porffor.type(arg) != Porffor.TYPES.arraybuffer,
    Porffor.type(arg) != Porffor.TYPES.sharedarraybuffer
  )) throw new TypeError('First argument to DataView constructor must be an ArrayBuffer');

  const offset: number = ecma262.ToIndex(byteOffset);
  const bufferPtr: i32 = Porffor.IR.ptr(arg);
  let bufferLen: i32 = Porffor.IR.loadI32(bufferPtr, 0);
  if (bufferLen < 0) throw new TypeError('Constructed DataView with a detached ArrayBuffer');
  if (offset > bufferLen) throw new RangeError('Invalid DataView byte offset');

  const lengthUndefined: boolean = Porffor.type(length) == Porffor.TYPES.undefined;
  let len: number = -1;
  if (lengthUndefined) {
    if (__Porffor_arraybuffer_maxByteLength(bufferPtr) < 0) len = bufferLen - offset;
  } else {
    len = ecma262.ToIndex(length);
    if (offset + len > bufferLen) throw new RangeError('Invalid DataView length');
  }

  // conversions above could have detached or resized the buffer
  bufferLen = Porffor.IR.loadI32(bufferPtr, 0);
  if (bufferLen < 0) throw new TypeError('Constructed DataView with a detached ArrayBuffer');
  if (offset > bufferLen) throw new RangeError('Invalid DataView byte offset');
  if (Porffor.fastAnd(!lengthUndefined, offset + len > bufferLen)) throw new RangeError('Invalid DataView length');

  const out: DataView = Porffor.malloc(12);
  Porffor.IR.storeI32(out, 4, bufferPtr + 4 + offset);
  Porffor.IR.storeI32(out, 8, offset);
  Porffor.IR.storeI32(out, 0, len);
  return out;
};

export const __DataView_prototype_buffer$get = function (this: DataView): any {
  const buffer: i32 = Porffor.IR.loadI32(this, 4) - Porffor.IR.loadI32(this, 8) - 4;
  if (__Porffor_arraybuffer_isShared(buffer)) return buffer as SharedArrayBuffer;
  return buffer as ArrayBuffer;
};

// GetViewByteLength, -1 if out of bounds or detached
export const __Porffor_dataview_lengthOrOOB = (view: DataView): i32 => {
  const offset: i32 = Porffor.IR.loadI32(view, 8);
  const bufferLen: i32 = Porffor.IR.loadI32(Porffor.IR.loadI32(view, 4) - offset - 4, 0);
  if (bufferLen < 0) return -1;

  const len: i32 = Porffor.IR.loadI32(view, 0);
  if (len < 0) {
    if (offset > bufferLen) return -1;
    return bufferLen - offset;
  }

  if (offset + len > bufferLen) return -1;
  return len;
};

export const __DataView_prototype_byteLength$get = function (this: DataView) {
  const len: i32 = __Porffor_dataview_lengthOrOOB(this);
  if (len < 0) throw new TypeError('DataView is out of bounds');
  return len;
};

export const __DataView_prototype_byteOffset$get = function (this: DataView) {
  if (__Porffor_dataview_lengthOrOOB(this) < 0) throw new TypeError('DataView is out of bounds');
  return Porffor.IR.loadI32(this, 8);
};

export const __Porffor_dataview_ptr = function (this: DataView, byteOffset: number, size: i32): i32 {
  const len: i32 = __Porffor_dataview_lengthOrOOB(this);
  if (len < 0) throw new TypeError('DataView is out of bounds');
  if (byteOffset + size > len) throw new RangeError('Byte offset is out of bounds of the DataView');
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
