export default async () => {
  // typedarray layout: length (i32, -1 if dynamic), dataPtr (i32, buffer + 4 + byteOffset), byteOffset (i32), fixed length (i32, -1 if length-tracking)

  const ctors = [ 'Uint8Clamped', 'Uint8', 'Int8', 'Uint16', 'Int16', 'Uint32', 'Int32', 'BigUint64', 'BigInt64', 'Float32', 'Float64' ];

  let out = `
export const __Porffor_typedArray_bpe = (t: i32): i32 => {
  if (t <= Porffor.TYPES.int8array) return 1;
  if (t <= Porffor.TYPES.int16array) return 2;
  if (t <= Porffor.TYPES.int32array) return 4;
  if (t == Porffor.TYPES.float32array) return 4;
  return 8;
};

export const __Porffor_typedArray_isBig = (t: i32): boolean =>
  Porffor.fastOr(t == Porffor.TYPES.biguint64array, t == Porffor.TYPES.bigint64array);

export const __Porffor_typedArray_buffer = (ta: any): i32 =>
  Porffor.IR.loadI32(ta, 4) - Porffor.IR.loadI32(ta, 8) - 4;

export const __Porffor_typedArray_detached = (ta: any): boolean =>
  Porffor.IR.loadI32(__Porffor_typedArray_buffer(ta), 0) < 0;

export const __Porffor_typedArray_lengthOrOOB = (ta: any): i32 => {
  const len: i32 = Porffor.IR.loadI32(ta, 0);
  const offset: i32 = Porffor.IR.loadI32(ta, 8);
  const bufferLen: i32 = Porffor.IR.loadI32(Porffor.IR.loadI32(ta, 4) - offset - 4, 0);
  if (bufferLen < 0) return -1;
  if (len >= 0) return len;

  const bpe: i32 = __Porffor_typedArray_bpe(Porffor.type(ta));
  const fixed: i32 = Porffor.IR.loadI32(ta, 12);
  if (fixed < 0) {
    if (offset > bufferLen) return -1;
    return Math.floor((bufferLen - offset) / bpe);
  }

  if (offset + fixed * bpe > bufferLen) return -1;
  return fixed;
};

export const __Porffor_typedArray_length = (ta: any): i32 => {
  const len: i32 = __Porffor_typedArray_lengthOrOOB(ta);
  return len < 0 ? 0 : len;
};

export const __Porffor_typedArray_check = (ta: any): void => {
  const t: i32 = Porffor.type(ta);
  if (Porffor.fastOr(t < Porffor.TYPES.uint8clampedarray, t > Porffor.TYPES.float64array))
    throw new TypeError('this is not a typed array');
};

export const __Porffor_typedArray_validate = (ta: any): i32 => {
  __Porffor_typedArray_check(ta);
  const len: i32 = __Porffor_typedArray_lengthOrOOB(ta);
  if (len < 0) throw new TypeError('Typed array is detached or out of bounds');
  return len;
};

export const __Porffor_typedArray_numericKey = (key: any): any => {
  if ((Porffor.type(key) | 0b10000000) != Porffor.TYPES.bytestring) return undefined;
  if ((key as bytestring).length == 0) return undefined;

  // canonical numeric strings start with a digit, - or I(nfinity)/N(aN)
  const c: i32 = key.charCodeAt(0);
  if (Porffor.fastAnd(Porffor.fastOr(c < 48, c > 57), c != 45, c != 73, c != 78)) return undefined;

  // -0 is never a valid index, like NaN
  if (key == '-0') return NaN;
  const n: number = ecma262.ToNumber(key);
  if (ecma262.ToString(n) == key) return n;
  return undefined;
};

export const __Porffor_typedArray_validIndex = (ta: any, n: number): boolean => {
  if (!Number.isInteger(n)) return false;
  return Porffor.fastAnd(n >= 0, n < __Porffor_typedArray_length(ta));
};

export const __Porffor_typedArray_setIndex = (ta: any, n: number, value: any): any => {
  ta[n] = value;
  return value;
};

export const __Porffor_typedArray_defineIndex = (ta: any, n: number, desc: any): boolean => {
  if (!__Porffor_typedArray_validIndex(ta, n)) return false;
  if (Porffor.fastAnd(__Porffor_object_in(desc, 'configurable'), !desc.configurable)) return false;
  if (Porffor.fastAnd(__Porffor_object_in(desc, 'enumerable'), !desc.enumerable)) return false;
  if (Porffor.fastOr(__Porffor_object_in(desc, 'get'), __Porffor_object_in(desc, 'set'))) return false;
  if (Porffor.fastAnd(__Porffor_object_in(desc, 'writable'), !desc.writable)) return false;
  if (__Porffor_object_in(desc, 'value')) ta[n] = desc.value;
  return true;
};

export const __Porffor_typedArray_immutable = (ta: any): boolean =>
  __Porffor_arraybuffer_isImmutable(__Porffor_typedArray_buffer(ta));

export const __Porffor_typedArray_validateWrite = (ta: any): i32 => {
  __Porffor_typedArray_check(ta);
  if (__Porffor_typedArray_immutable(ta)) throw new TypeError('Cannot write to an immutable ArrayBuffer');
  return __Porffor_typedArray_validate(ta);
};

export const __Porffor_typedArray_writeLength = (ta: any): i32 => {
  if (__Porffor_typedArray_immutable(ta)) return 0;
  return __Porffor_typedArray_length(ta);
};

export const __Porffor_typedArray_coerce = (t: i32, value: any): any => {
  if (Porffor.comptime.flag\`hasType.bigint64array\`) {
    if (t == Porffor.TYPES.bigint64array) return ecma262.ToBigInt(value);
  }
  if (Porffor.comptime.flag\`hasType.biguint64array\`) {
    if (t == Porffor.TYPES.biguint64array) return ecma262.ToBigInt(value);
  }

  return ecma262.ToNumber(value);
};

export const __Porffor_typedArray_relIndex = (value: any, len: i32): i32 => {
  const rel: number = ecma262.ToIntegerOrInfinity(value);
  if (rel < 0) {
    const k: number = len + rel;
    return k < 0 ? 0 : k;
  }

  return rel > len ? len : rel;
};

export const __Porffor_typedArray_compare = (x: any, y: any): number => {
  if (x < y) return -1;
  if (x > y) return 1;
  if (x !== x) return y !== y ? 0 : 1;
  if (y !== y) return -1;
  if (Porffor.fastAnd(Porffor.type(x) == Porffor.TYPES.number, x == 0, y == 0)) {
    const xNeg: boolean = 1 / x < 0;
    const yNeg: boolean = 1 / y < 0;
    if (Porffor.fastAnd(xNeg, !yNeg)) return -1;
    if (Porffor.fastAnd(!xNeg, yNeg)) return 1;
  }

  return 0;
};

export const __Porffor_typedArray_init = (ta: any, arg: any, byteOffset: any, length: any): void => {
  Porffor.IR.storeI32(ta, 0, 0);
  Porffor.IR.storeI32(ta, 4, 0);
  Porffor.IR.storeI32(ta, 8, 0);
  Porffor.IR.storeI32(ta, 12, 0);

  const t: i32 = Porffor.type(ta);
  const bpe: i32 = __Porffor_typedArray_bpe(t);
  const argType: i32 = Porffor.type(arg);

  if (Porffor.fastOr(
    argType == Porffor.TYPES.arraybuffer,
    argType == Porffor.TYPES.sharedarraybuffer
  )) {
    const offsetNum: number = ecma262.ToIndex(byteOffset);
    if (offsetNum % bpe != 0) throw new RangeError('Start offset of typed array should be a multiple of BYTES_PER_ELEMENT');

    let newLength: number = 0;
    const lengthGiven: boolean = Porffor.type(length) != Porffor.TYPES.undefined;
    if (lengthGiven) newLength = ecma262.ToIndex(length);

    const bufferPtr: i32 = Porffor.IR.ptr(arg);
    const bufferLen: i32 = Porffor.IR.loadI32(bufferPtr, 0);
    if (bufferLen < 0) throw new TypeError('Cannot construct typed array with a detached ArrayBuffer');

    const resizable: boolean = __Porffor_arraybuffer_maxByteLength(bufferPtr) >= 0;
    const dynamic: boolean = Porffor.fastOr(resizable, __Porffor_arraybuffer_isImmutable(bufferPtr));
    if (Porffor.fastAnd(!lengthGiven, resizable)) {
      if (offsetNum > bufferLen) throw new RangeError('Start offset is outside the bounds of the buffer');
      Porffor.IR.storeI32(ta, 0, -1);
      Porffor.IR.storeI32(ta, 12, -1);
    } else {
      let newByteLength: number = 0;
      if (lengthGiven) {
        newByteLength = newLength * bpe;
        if (offsetNum + newByteLength > bufferLen) throw new RangeError('Invalid typed array length');
      } else {
        if (bufferLen % bpe != 0) throw new RangeError('Byte length of typed array should be a multiple of BYTES_PER_ELEMENT');
        newByteLength = bufferLen - offsetNum;
        if (newByteLength < 0) throw new RangeError('Start offset is outside the bounds of the buffer');
      }

      // views on resizable buffers can go out of bounds so are always dynamic
      Porffor.IR.storeI32(ta, 0, dynamic ? -1 : newByteLength / bpe);
      Porffor.IR.storeI32(ta, 12, newByteLength / bpe);
    }

    const offset: i32 = offsetNum;
    Porffor.IR.storeI32(ta, 4, bufferPtr + 4 + offset);
    Porffor.IR.storeI32(ta, 8, offset);
    Porffor.IR.gcBarrier(ta, t);
    return;
  }

  let len: i32 = 0;
  let src: any = undefined;
  const srcIsTA: boolean = Porffor.fastAnd(argType >= Porffor.TYPES.uint8clampedarray, argType <= Porffor.TYPES.float64array);
  if (srcIsTA) {
    len = __Porffor_typedArray_validate(arg);
    if (__Porffor_typedArray_isBig(t) != __Porffor_typedArray_isBig(argType)) throw new TypeError('Cannot mix BigInt and other types');
    src = arg;
  } else if (argType == Porffor.TYPES.number || !Porffor.object.isObject(arg)) {
    let n: number = 0;
    if (argType == Porffor.TYPES.number && arg >= 0) n = Math.trunc(arg);
      else n = ecma262.ToIndex(arg);
    if (n * bpe > 2147483643) throw new RangeError('Invalid typed array length');
    len = n;
  } else {
    if (argType == Porffor.TYPES.array) src = arg;
      else src = __Array_from(arg, undefined, undefined);
    len = (src as any[]).length;
  }

  if (len > 2147483643 / bpe) throw new RangeError('Invalid typed array length');
  const byteLength: i32 = len * bpe;

  const bufferPtr: i32 = __Porffor_arraybuffer_alloc(byteLength, -1, false);

  Porffor.IR.storeI32(ta, 0, len);
  Porffor.IR.storeI32(ta, 4, bufferPtr + 4);
  Porffor.IR.storeI32(ta, 12, len);
  // malloc can promote ta and the raw store has no barrier
  Porffor.IR.gcBarrier(ta, t);

  if (srcIsTA) {
    if (argType == t) {
      Porffor.IR.copy(bufferPtr + 8, Porffor.IR.loadI32(arg, 4) + 4, byteLength);
    } else {
      for (let i: i32 = 0; i < len; i++) ta[i] = src[i];
    }
  } else if (Porffor.type(src) != Porffor.TYPES.undefined) {
    const big: boolean = __Porffor_typedArray_isBig(t);
    for (let i: i32 = 0; i < len; i++) {
      const v: any = (src as any[])[i];
      ta[i] = Porffor.fastAnd(Porffor.type(v) == Porffor.TYPES.number, !big) ? v : __Porffor_typedArray_coerce(t, v);
    }
  }
};

export const __Porffor_typedArray_construct = (t: i32, a: any, b: any, c: any): any => {`;

  for (const x of ctors) {
    const name = `${x}Array`;
    out += `
  if (Porffor.comptime.flag\`hasType.${name.toLowerCase()}\`) {
    if (t == Porffor.TYPES.${name.toLowerCase()}) return new ${name}(a, b, c);
  }`;
  }

  out += `
  throw new TypeError('Invalid typed array type');
};

export const __Porffor_typedArray_speciesCreate = (exemplar: any, a: any, b: any, c: any): any => {
  const t: i32 = Porffor.type(exemplar);
  const C: any = exemplar.constructor;
  let S: any = undefined;
  if (C !== undefined) {
    if (!Porffor.object.isObject(C)) throw new TypeError('Typed array constructor is not an object');
    S = C[Symbol.species];
  }
  if (S == null) return __Porffor_typedArray_construct(t, a, b, c);
  if (!ecma262.IsConstructor(S)) throw new TypeError('Typed array species is not a constructor');

  const isLength: boolean = Porffor.type(a) == Porffor.TYPES.number;
  let result: any;
  if (isLength) result = Porffor.call(S, [ a ], null, S);
    else if (Porffor.type(c) == Porffor.TYPES.undefined) result = Porffor.call(S, [ a, b ], null, S);
    else result = Porffor.call(S, [ a, b, c ], null, S);
  const len: i32 = isLength ? __Porffor_typedArray_validateWrite(result) : __Porffor_typedArray_validate(result);
  if (isLength && len < a) throw new TypeError('Species constructor returned a too small typed array');
  if (__Porffor_typedArray_isBig(Porffor.type(result)) != __Porffor_typedArray_isBig(t)) throw new TypeError('Cannot mix BigInt and other types');
  return result;
};

// 23.2.1.1 %TypedArray% ()
// https://tc39.es/ecma262/#sec-%typedarray%
export const TypedArray = function () {
  throw new TypeError('Abstract class TypedArray not directly constructable');
};

// 23.2.2.1 %TypedArray%.from (source [, mapfn [, thisArg]])
// https://tc39.es/ecma262/#sec-%typedarray%.from
export const __TypedArray_from = function (this: any, source: any, mapFn: any = undefined, thisArg: any = undefined) {
  const C: any = this;
  if (!ecma262.IsConstructor(C)) throw new TypeError('TypedArray.from called on non-constructor');

  const mapping: boolean = Porffor.type(mapFn) != Porffor.TYPES.undefined;
  if (mapping) if (Porffor.type(mapFn) != Porffor.TYPES.function) throw new TypeError('TypedArray.from mapFn is not a function');

  const values: any[] = __Array_from(source, undefined, undefined);
  const len: i32 = values.length;

  const target: any = Porffor.call(C, [ len ], null, C);
  if (__Porffor_typedArray_validateWrite(target) < len) throw new TypeError('Constructed typed array is too small');

  const t: i32 = Porffor.type(target);
  const big: boolean = __Porffor_typedArray_isBig(t);
  for (let k: i32 = 0; k < len; k++) {
    let v: any = values[k];
    if (mapping) v = Porffor.callThis(mapFn, thisArg, v, k);
    target[k] = Porffor.fastAnd(Porffor.type(v) == Porffor.TYPES.number, !big) ? v : __Porffor_typedArray_coerce(t, v);
  }

  return target;
};

export const __TypedArray_Symbol_species$get = function (this: any): any {
  return this;
};

// 23.2.2.2 %TypedArray%.of (...items)
// https://tc39.es/ecma262/#sec-%typedarray%.of
export const __TypedArray_of = function (this: any, ...items: any[]) {
  const C: any = this;
  if (!ecma262.IsConstructor(C)) throw new TypeError('TypedArray.of called on non-constructor');

  const len: i32 = items.length;
  const target: any = Porffor.call(C, [ len ], null, C);
  if (__Porffor_typedArray_validateWrite(target) < len) throw new TypeError('Constructed typed array is too small');

  const t: i32 = Porffor.type(target);
  const big: boolean = __Porffor_typedArray_isBig(t);
  for (let k: i32 = 0; k < len; k++) {
    const v: any = items[k];
    target[k] = Porffor.fastAnd(Porffor.type(v) == Porffor.TYPES.number, !big) ? v : __Porffor_typedArray_coerce(t, v);
  }

  return target;
};

export const __TypedArray_prototype_buffer$get = function (this: any): ArrayBuffer|SharedArrayBuffer {
  __Porffor_typedArray_check(this);
  const buffer: i32 = __Porffor_typedArray_buffer(this);
  if (__Porffor_arraybuffer_isShared(buffer)) return buffer as SharedArrayBuffer;
  return buffer as ArrayBuffer;
};

export const __TypedArray_prototype_byteLength$get = function (this: any) {
  __Porffor_typedArray_check(this);
  return __Porffor_typedArray_length(this) * __Porffor_typedArray_bpe(Porffor.type(this));
};

export const __TypedArray_prototype_byteOffset$get = function (this: any) {
  __Porffor_typedArray_check(this);
  if (__Porffor_typedArray_lengthOrOOB(this) < 0) return 0;
  return Porffor.IR.loadI32(this, 8);
};

export const __TypedArray_prototype_length$get = function (this: any) {
  __Porffor_typedArray_check(this);
  return __Porffor_typedArray_length(this);
};

export const __TypedArray_prototype_Symbol_toStringTag$get = function (this: any): any {
  const t: i32 = Porffor.type(this);
  if (Porffor.fastOr(t < Porffor.TYPES.uint8clampedarray, t > Porffor.TYPES.float64array)) return undefined;
  return Porffor.typeName(t);
};

export const __TypedArray_prototype_at = function (this: any, index: any) {
  const len: i32 = __Porffor_typedArray_validate(this);
  const rel: number = ecma262.ToIntegerOrInfinity(index);
  const k: number = rel >= 0 ? rel : len + rel;
  if (Porffor.fastOr(k < 0, k >= len)) return undefined;
  if (__Porffor_typedArray_detached(this)) return undefined;

  const i: i32 = k;
  return this[i];
};

export const __TypedArray_prototype_copyWithin = function (this: any, target: any, start: any, end: any = undefined) {
  const len: i32 = __Porffor_typedArray_validateWrite(this);
  const to: i32 = __Porffor_typedArray_relIndex(target, len);
  const from: i32 = __Porffor_typedArray_relIndex(start, len);
  const final: i32 = Porffor.type(end) == Porffor.TYPES.undefined ? len : __Porffor_typedArray_relIndex(end, len);

  let count: i32 = final > from ? final - from : 0;
  if (count > len - to) count = len - to;
  if (count > 0) {
    // coercions could have shrunk this
    const newLen: i32 = __Porffor_typedArray_validate(this);
    if (count > newLen - from) count = newLen - from;
    if (count > newLen - to) count = newLen - to;

    if (count > 0) {
      const bpe: i32 = __Porffor_typedArray_bpe(Porffor.type(this));
      const data: i32 = Porffor.IR.loadI32(this, 4) + 4;
      Porffor.IR.copy(data + to * bpe, data + from * bpe, count * bpe);
    }
  }

  return this;
};

export const __TypedArray_prototype_entries = function (this: any) {
  __Porffor_typedArray_validate(this);
  return __Porffor_ArrayIterator_new(this, 3);
};

export const __TypedArray_prototype_every = function (this: any, callbackFn: any, thisArg: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  for (let k: i32 = 0; k < len; k++) {
    if (!Porffor.callThis(callbackFn, thisArg, this[k], k, this)) return false;
  }

  return true;
};

export const __TypedArray_prototype_fill = function (this: any, value: any, start: any = undefined, end: any = undefined) {
  const len: i32 = __Porffor_typedArray_validateWrite(this);
  const v: any = __Porffor_typedArray_coerce(Porffor.type(this), value);
  const k: i32 = __Porffor_typedArray_relIndex(start, len);
  let final: i32 = Porffor.type(end) == Porffor.TYPES.undefined ? len : __Porffor_typedArray_relIndex(end, len);

  // coercions could have shrunk this
  const newLen: i32 = __Porffor_typedArray_validate(this);
  if (final > newLen) final = newLen;

  for (let i: i32 = k; i < final; i++) this[i] = v;
  return this;
};

export const __TypedArray_prototype_filter = function (this: any, callbackFn: any, thisArg: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  const kept: any[] = Porffor.array.new(4);
  let captured: i32 = 0;
  for (let k: i32 = 0; k < len; k++) {
    const kValue: any = this[k];
    if (!!Porffor.callThis(callbackFn, thisArg, kValue, k, this)) kept[captured++] = kValue;
  }

  const A: any = __Porffor_typedArray_speciesCreate(this, captured, undefined, undefined);
  for (let n: i32 = 0; n < captured; n++) A[n] = kept[n];
  return A;
};

export const __TypedArray_prototype_find = function (this: any, callbackFn: any, thisArg: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  for (let k: i32 = 0; k < len; k++) {
    const kValue: any = this[k];
    if (!!Porffor.callThis(callbackFn, thisArg, kValue, k, this)) return kValue;
  }
};

export const __TypedArray_prototype_findIndex = function (this: any, callbackFn: any, thisArg: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  for (let k: i32 = 0; k < len; k++) {
    if (!!Porffor.callThis(callbackFn, thisArg, this[k], k, this)) return k;
  }

  return -1;
};

export const __TypedArray_prototype_findLast = function (this: any, callbackFn: any, thisArg: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  let k: i32 = len;
  while (k > 0) {
    const kValue: any = this[--k];
    if (!!Porffor.callThis(callbackFn, thisArg, kValue, k, this)) return kValue;
  }
};

export const __TypedArray_prototype_findLastIndex = function (this: any, callbackFn: any, thisArg: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  let k: i32 = len;
  while (k > 0) {
    if (!!Porffor.callThis(callbackFn, thisArg, this[--k], k, this)) return k;
  }

  return -1;
};

export const __TypedArray_prototype_forEach = function (this: any, callbackFn: any, thisArg: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  for (let k: i32 = 0; k < len; k++) Porffor.callThis(callbackFn, thisArg, this[k], k, this);
};

export const __TypedArray_prototype_includes = function (this: any, searchElement: any, fromIndex: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (len == 0) return false;

  const n: number = ecma262.ToIntegerOrInfinity(fromIndex);
  if (n >= len) return false;

  let k: i32 = 0;
  if (n >= 0) k = n;
    else if (len + n > 0) k = len + n;

  // a detached buffer reads as undefined
  if (__Porffor_typedArray_detached(this)) return searchElement === undefined;

  for (; k < len; k++) {
    if (__ecma262_SameValueZero(this[k], searchElement)) return true;
  }

  return false;
};

export const __TypedArray_prototype_indexOf = function (this: any, searchElement: any, fromIndex: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (len == 0) return -1;

  const n: number = ecma262.ToIntegerOrInfinity(fromIndex);
  if (n >= len) return -1;

  let k: i32 = 0;
  if (n >= 0) k = n;
    else if (len + n > 0) k = len + n;

  if (__Porffor_typedArray_detached(this)) return -1;

  for (; k < len; k++) {
    if (this[k] === searchElement) return k;
  }

  return -1;
};

export const __TypedArray_prototype_join = function (this: any, separator: any) {
  const len: i32 = __Porffor_typedArray_validate(this);
  let sep: any = ',';
  if (Porffor.type(separator) != Porffor.TYPES.undefined) sep = ecma262.ToString(separator);

  const out: any[] = Porffor.array.new(len);
  out.length = len;
  if (!__Porffor_typedArray_detached(this)) {
    for (let k: i32 = 0; k < len; k++) out[k] = this[k];
  }

  return Porffor.callThis(__Array_prototype_join, out, sep);
};

export const __TypedArray_prototype_keys = function (this: any) {
  __Porffor_typedArray_validate(this);
  return __Porffor_ArrayIterator_new(this, 1);
};

export const __TypedArray_prototype_lastIndexOf = function (this: any, _argc: i32, searchElement: any, fromIndex: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (len == 0) return -1;

  let n: number = len - 1;
  if (_argc > 1) n = ecma262.ToIntegerOrInfinity(fromIndex);
  if (len + n < 0) return -1;

  let k: i32 = len - 1;
  if (n < 0) k = len + n;
    else if (n < len - 1) k = n;

  if (__Porffor_typedArray_detached(this)) return -1;

  for (; k >= 0; k--) {
    if (this[k] === searchElement) return k;
  }

  return -1;
};

export const __TypedArray_prototype_map = function (this: any, callbackFn: any, thisArg: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  const t: i32 = Porffor.type(this);
  const A: any = __Porffor_typedArray_speciesCreate(this, len, undefined, undefined);
  const big: boolean = __Porffor_typedArray_isBig(t);
  for (let k: i32 = 0; k < len; k++) {
    const v: any = Porffor.callThis(callbackFn, thisArg, this[k], k, this);
    A[k] = Porffor.fastAnd(Porffor.type(v) == Porffor.TYPES.number, !big) ? v : __Porffor_typedArray_coerce(t, v);
  }

  return A;
};

export const __TypedArray_prototype_reduce = function (this: any, _argc: i32, callbackFn: any, initialValue: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  let k: i32 = 0;
  let acc: any = initialValue;
  if (_argc < 2) {
    if (len == 0) throw new TypeError('Reduce of empty array with no initial value');
    acc = this[0];
    k = 1;
  }

  for (; k < len; k++) acc = callbackFn(acc, this[k], k, this);
  return acc;
};

export const __TypedArray_prototype_reduceRight = function (this: any, _argc: i32, callbackFn: any, initialValue: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  let k: i32 = len;
  let acc: any = initialValue;
  if (_argc < 2) {
    if (len == 0) throw new TypeError('Reduce of empty array with no initial value');
    acc = this[--k];
  }

  while (k > 0) acc = callbackFn(acc, this[--k], k, this);
  return acc;
};

export const __TypedArray_prototype_reverse = function (this: any) {
  const len: i32 = __Porffor_typedArray_validateWrite(this);

  let lower: i32 = 0;
  let upper: i32 = len;
  while (lower < --upper) {
    const tmp: any = this[lower];
    this[lower++] = this[upper];
    this[upper] = tmp;
  }

  return this;
};

export const __TypedArray_prototype_set = function (this: any, source: any, offset: any = undefined) {
  __Porffor_typedArray_check(this);
  if (__Porffor_typedArray_immutable(this)) throw new TypeError('Cannot write to an immutable ArrayBuffer');
  const targetOffsetNum: number = ecma262.ToIntegerOrInfinity(offset);
  if (targetOffsetNum < 0) throw new RangeError('Offset is out of bounds');

  const targetLength: i32 = __Porffor_typedArray_validate(this);
  const t: i32 = Porffor.type(this);
  const srcType: i32 = Porffor.type(source);

  if (Porffor.fastAnd(srcType >= Porffor.TYPES.uint8clampedarray, srcType <= Porffor.TYPES.float64array)) {
    const srcLength: i32 = __Porffor_typedArray_validate(source);
    if (targetOffsetNum + srcLength > targetLength) throw new RangeError('Source is too large');
    if (__Porffor_typedArray_isBig(t) != __Porffor_typedArray_isBig(srcType)) throw new TypeError('Cannot mix BigInt and other types');

    const targetOffset: i32 = targetOffsetNum;
    if (srcType == t) {
      const bpe: i32 = __Porffor_typedArray_bpe(t);
      Porffor.IR.copy(Porffor.IR.loadI32(this, 4) + 4 + targetOffset * bpe, Porffor.IR.loadI32(source, 4) + 4, srcLength * bpe);
      return;
    }

    // copy first if both share a buffer
    let src: any = source;
    if (Porffor.IR.loadI32(this, 4) - Porffor.IR.loadI32(this, 8) == Porffor.IR.loadI32(source, 4) - Porffor.IR.loadI32(source, 8)) {
      const copy: any[] = Porffor.array.new(srcLength);
      copy.length = srcLength;
      for (let k: i32 = 0; k < srcLength; k++) copy[k] = source[k];
      src = copy;
    }

    for (let k: i32 = 0; k < srcLength; k++) this[targetOffset + k] = src[k];
    return;
  }

  if (source == null) throw new TypeError('Cannot convert undefined or null to object');

  let srcLength: number = 0;
  if (srcType == Porffor.TYPES.array) srcLength = (source as any[]).length;
    else if (srcType == Porffor.TYPES.string) srcLength = (source as string).length;
    else if (srcType == Porffor.TYPES.bytestring) srcLength = (source as bytestring).length;
    else if (Porffor.object.isObject(source)) {
      srcLength = ecma262.ToIntegerOrInfinity(source['length']);
      if (srcLength < 0) srcLength = 0;
    }

  if (targetOffsetNum + srcLength > targetLength) throw new RangeError('Source is too large');

  const targetOffset: i32 = targetOffsetNum;
  const len: i32 = srcLength;
  const big: boolean = __Porffor_typedArray_isBig(t);
  for (let k: i32 = 0; k < len; k++) {
    const v: any = source[k];
    this[targetOffset + k] = Porffor.fastAnd(Porffor.type(v) == Porffor.TYPES.number, !big) ? v : __Porffor_typedArray_coerce(t, v);
  }
};

export const __TypedArray_prototype_slice = function (this: any, start: any, end: any) {
  const len: i32 = __Porffor_typedArray_validate(this);
  const k: i32 = __Porffor_typedArray_relIndex(start, len);
  const final: i32 = Porffor.type(end) == Porffor.TYPES.undefined ? len : __Porffor_typedArray_relIndex(end, len);

  let count: i32 = final > k ? final - k : 0;

  const t: i32 = Porffor.type(this);
  const A: any = __Porffor_typedArray_speciesCreate(this, count, undefined, undefined);
  if (count > 0) {
    // coercions could have shrunk this
    const newLen: i32 = __Porffor_typedArray_validate(this);
    if (count > newLen - k) count = newLen - k;

    if (count > 0) {
      if (Porffor.type(A) == t) {
        const bpe: i32 = __Porffor_typedArray_bpe(t);
        const dst: i32 = Porffor.IR.loadI32(A, 4) + 4;
        const src: i32 = Porffor.IR.loadI32(this, 4) + 4 + k * bpe;
        const bytes: i32 = count * bpe;
        if (__Porffor_typedArray_buffer(A) == __Porffor_typedArray_buffer(this)) {
          // a species result can share this buffer: copy bytewise forwards like the spec
          for (let i: i32 = 0; i < bytes; i++) Porffor.IR.storeU8(dst + i, 0, Porffor.IR.loadU8(src + i, 0));
        } else {
          Porffor.IR.copy(dst, src, bytes);
        }
      } else {
        for (let n: i32 = 0; n < count; n++) A[n] = this[k + n];
      }
    }
  }

  return A;
};

export const __TypedArray_prototype_some = function (this: any, callbackFn: any, thisArg: any = undefined) {
  const len: i32 = __Porffor_typedArray_validate(this);
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  for (let k: i32 = 0; k < len; k++) {
    if (!!Porffor.callThis(callbackFn, thisArg, this[k], k, this)) return true;
  }

  return false;
};

export const __TypedArray_prototype_sort = function (this: any, comparefn: any) {
  if (Porffor.type(comparefn) != Porffor.TYPES.undefined) {
    if (Porffor.type(comparefn) != Porffor.TYPES.function) throw new TypeError('Comparator must be a function');
  } else {
    comparefn = __Porffor_typedArray_compare;
  }

  const len: i32 = __Porffor_typedArray_validateWrite(this);

  const items: any[] = Porffor.array.new(len);
  items.length = len;
  for (let k: i32 = 0; k < len; k++) items[k] = this[k];

  __Porffor_array_mergeSort(items, len, comparefn);

  for (let k: i32 = 0; k < len; k++) this[k] = items[k];
  return this;
};

export const __TypedArray_prototype_subarray = function (this: any, start: any, end: any) {
  __Porffor_typedArray_check(this);

  const t: i32 = Porffor.type(this);
  const srcLength: i32 = __Porffor_typedArray_length(this);
  const beginIndex: i32 = __Porffor_typedArray_relIndex(start, srcLength);
  const endIndex: i32 = Porffor.type(end) == Porffor.TYPES.undefined ? srcLength : __Porffor_typedArray_relIndex(end, srcLength);

  const newLength: i32 = endIndex > beginIndex ? endIndex - beginIndex : 0;

  const buffer: any = Porffor.callThis(__TypedArray_prototype_buffer$get, this);
  const beginByteOffset: i32 = Porffor.IR.loadI32(this, 8) + beginIndex * __Porffor_typedArray_bpe(t);

  const tracking: boolean = Porffor.fastAnd(Porffor.type(end) == Porffor.TYPES.undefined, Porffor.IR.loadI32(this, 0) < 0, Porffor.IR.loadI32(this, 12) < 0);
  return __Porffor_typedArray_speciesCreate(this, buffer, beginByteOffset, tracking ? undefined : newLength);
};

export const __TypedArray_prototype_toLocaleString = function (this: any) {
  const len: i32 = __Porffor_typedArray_validate(this);

  const out: any[] = Porffor.array.new(len);
  out.length = len;
  for (let k: i32 = 0; k < len; k++) {
    // elements read undefined if the buffer shrank meanwhile
    const element: any = this[k];
    if (element != null) {
      // Invoke(element, "toLocaleString") so overridden prototype methods are called
      const key: bytestring = 'toLocaleString';
      const fn: any = element[key];
      if (Porffor.type(fn) != Porffor.TYPES.function) throw new TypeError('toLocaleString is not a function');
      out[k] = ecma262.ToString(fn.call(element));
    }
  }

  return Porffor.callThis(__Array_prototype_join, out, ',');
};

export const __TypedArray_prototype_toReversed = function (this: any) {
  const len: i32 = __Porffor_typedArray_validate(this);
  const A: any = __Porffor_typedArray_construct(Porffor.type(this), len, undefined, undefined);
  for (let k: i32 = 0; k < len; k++) A[k] = this[len - 1 - k];

  return A;
};

export const __TypedArray_prototype_toSorted = function (this: any, comparefn: any) {
  if (Porffor.type(comparefn) != Porffor.TYPES.undefined) {
    if (Porffor.type(comparefn) != Porffor.TYPES.function) throw new TypeError('Comparator must be a function');
  }

  const len: i32 = __Porffor_typedArray_validate(this);
  const t: i32 = Porffor.type(this);
  const A: any = __Porffor_typedArray_construct(t, len, undefined, undefined);
  Porffor.IR.copy(Porffor.IR.loadI32(A, 4) + 4, Porffor.IR.loadI32(this, 4) + 4, len * __Porffor_typedArray_bpe(t));

  return Porffor.callThis(__TypedArray_prototype_sort, A, comparefn);
};

export const __TypedArray_prototype_toString = function (this: any) {
  return Porffor.callThis(__TypedArray_prototype_join, this, undefined);
};

export const __TypedArray_prototype_values = function (this: any) {
  __Porffor_typedArray_validate(this);
  return __Porffor_ArrayIterator_new(this, 0);
};

export const __TypedArray_prototype_Symbol_iterator = function (this: any) {
  __Porffor_typedArray_validate(this);
  return __Porffor_ArrayIterator_new(this, 0);
};

export const __TypedArray_prototype_with = function (this: any, index: any, value: any) {
  const len: i32 = __Porffor_typedArray_validate(this);
  const rel: number = ecma262.ToIntegerOrInfinity(index);
  const actualIndex: number = rel >= 0 ? rel : len + rel;

  const t: i32 = Porffor.type(this);
  const v: any = __Porffor_typedArray_coerce(t, value);
  // the coercion could have shrunk this
  const newLen: i32 = __Porffor_typedArray_length(this);
  if (Porffor.fastOr(actualIndex < 0, actualIndex >= newLen)) throw new RangeError('Invalid typed array index');

  const A: any = __Porffor_typedArray_construct(t, len, undefined, undefined);
  if (newLen >= len) {
    Porffor.IR.copy(Porffor.IR.loadI32(A, 4) + 4, Porffor.IR.loadI32(this, 4) + 4, len * __Porffor_typedArray_bpe(t));
  } else {
    // elements past the new length read as undefined
    for (let k: i32 = 0; k < len; k++) A[k] = __Porffor_typedArray_coerce(t, this[k]);
  }

  const i: i32 = actualIndex;
  A[i] = v;
  return A;
};
`;

  for (const x of ctors) {
    const name = `${x}Array`;
    out += `
export const ${name} = function (arg: any, byteOffset: any, length: any): ${name} {
  if (!new.target) throw new TypeError("Constructor ${name} requires 'new'");

  const out: ${name} = Porffor.malloc(16);
  __Porffor_typedArray_init(out, arg, byteOffset, length);
  return out;
};
`;
  }

  return out;
};
