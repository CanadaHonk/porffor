export default () => {
  let out = `
export const __Atomics_isLockFree = (size: any): boolean => {
  switch (ecma262.ToIntegerOrInfinity(size)) {
    case 1:
    case 2:
    case 4:
    case 8:
      return true;
  }

  return false;
};

export const __Porffor_atomics_validate = (ta: any, waitable: boolean, write: boolean): i32 => {
  const type: i32 = Porffor.type(ta);
  if (waitable) {
    if (Porffor.fastAnd(type != Porffor.TYPES.int32array, type != Porffor.TYPES.bigint64array)) throw new TypeError('Atomics operation requires an Int32Array or BigInt64Array');
  } else {
    if (Porffor.fastOr(type < Porffor.TYPES.uint8array, type > Porffor.TYPES.bigint64array)) throw new TypeError('Atomics operation requires an integer TypedArray');
  }

  return write ? __Porffor_typedArray_validateWrite(ta) : __Porffor_typedArray_validate(ta);
};

export const __Porffor_atomics_index = (ta: any, index: any, waitable: boolean, write: boolean): number => {
  const len: i32 = __Porffor_atomics_validate(ta, waitable, write);
  const i: number = ecma262.ToIndex(index);
  if (i >= len) throw new RangeError('Atomics access index out of bounds');
  return i;
};

export const __Porffor_atomics_revalidate = (ta: any, i: number): void => {
  if (i >= __Porffor_typedArray_validate(ta)) throw new RangeError('Atomics access index out of bounds');
};

export const __Porffor_atomics_value = (ta: any, value: any): any => {
  if (__Porffor_typedArray_isBig(Porffor.type(ta))) return ecma262.ToBigInt(value);
  return ecma262.ToIntegerOrInfinity(value);
};

export const __Porffor_atomics_wrap = (ta: any, value: any): any => {
  switch (Porffor.type(ta)) {
    case Porffor.TYPES.int8array: return ((value | 0) << 24) >> 24;
    case Porffor.TYPES.uint8array: return (value | 0) & 0xff;
    case Porffor.TYPES.int16array: return ((value | 0) << 16) >> 16;
    case Porffor.TYPES.uint16array: return (value | 0) & 0xffff;
    case Porffor.TYPES.int32array: return value | 0;
    case Porffor.TYPES.uint32array: return value >>> 0;
    case Porffor.TYPES.bigint64array: return __BigInt_asIntN(64, value);
    case Porffor.TYPES.biguint64array: return __BigInt_asUintN(64, value);
  }
  return value;
};

export const __Atomics_load = (ta: any, index: any): any => {
  const i: number = __Porffor_atomics_index(ta, index, false, false);
  __Porffor_atomics_revalidate(ta, i);
  return ta[i];
};

export const __Atomics_store = (ta: any, index: any, value: any): any => {
  const i: number = __Porffor_atomics_index(ta, index, false, true);
  let v: any = __Porffor_atomics_value(ta, value);
  if (v === 0) v = 0; // -0 -> +0
  __Porffor_atomics_revalidate(ta, i);
  ta[i] = v;
  return v;
};

export const __Atomics_compareExchange = (ta: any, index: any, expected: any, replacement: any): any => {
  const i: number = __Porffor_atomics_index(ta, index, false, true);
  const e: any = __Porffor_atomics_wrap(ta, __Porffor_atomics_value(ta, expected));
  const r: any = __Porffor_atomics_value(ta, replacement);
  __Porffor_atomics_revalidate(ta, i);

  const old: any = ta[i];
  if (old == e) ta[i] = r;
  return old;
};
`;

  const rmw = (name, op) => {
    out += `
export const __Atomics_${name} = (ta: any, index: any, value: any): any => {
  const i: number = __Porffor_atomics_index(ta, index, false, true);
  const v: any = __Porffor_atomics_wrap(ta, __Porffor_atomics_value(ta, value));
  __Porffor_atomics_revalidate(ta, i);

  const old: any = ta[i];
  ta[i] = ${op};
  return old;
};
`;
  };

  rmw('add', 'old + v');
  rmw('sub', 'old - v');
  rmw('and', 'old & v');
  rmw('or', 'old | v');
  rmw('xor', 'old ^ v');
  rmw('exchange', 'v');

  out += `
export const __Porffor_atomics_waitTimeout = (ta: any, index: any, value: any, timeout: any): number => {
  const i: number = __Porffor_atomics_index(ta, index, true, false);
  const v: any = Porffor.type(ta) == Porffor.TYPES.bigint64array ? ecma262.ToBigInt(value) : (ecma262.ToNumber(value) | 0);
  let t: number = ecma262.ToNumber(timeout);
  if (t != t) t = Infinity;
  if (t < 0) t = 0;

  // nothing else can notify this agent
  if (ta[i] != v) return -1;
  return t;
};

export const __Atomics_wait = (ta: any, index: any, value: any, timeout: any): any => {
  __Porffor_atomics_validate(ta, true, false);
  if (!__Porffor_arraybuffer_isShared(__Porffor_typedArray_buffer(ta))) throw new TypeError('Atomics.wait requires a shared typed array');

  const t: number = __Porffor_atomics_waitTimeout(ta, index, value, timeout);
  if (t < 0) return 'not-equal';
  if (t == Infinity) throw new TypeError('Atomics.wait would block forever');
  return 'timed-out';
};

export const __Atomics_waitAsync = (ta: any, index: any, value: any, timeout: any): object => {
  __Porffor_atomics_validate(ta, true, false);
  if (!__Porffor_arraybuffer_isShared(__Porffor_typedArray_buffer(ta))) throw new TypeError('Atomics.waitAsync requires a shared typed array');

  const t: number = __Porffor_atomics_waitTimeout(ta, index, value, timeout);
  const out: object = {};
  if (t < 0) {
    out.async = false;
    out.value = 'not-equal';
  } else if (t == 0) {
    out.async = false;
    out.value = 'timed-out';
  } else {
    out.async = true;
    out.value = __Porffor_promise_create();
  }

  return out;
};

export const __Atomics_notify = (ta: any, index: any, count: any): number => {
  __Porffor_atomics_index(ta, index, true, false);
  if (Porffor.type(count) != Porffor.TYPES.undefined) ecma262.ToIntegerOrInfinity(count);
  return 0;
};

export const __Atomics_pause = (n: any = undefined): void => {
  if (Porffor.type(n) != Porffor.TYPES.undefined && (Porffor.type(n) != Porffor.TYPES.number || !Number.isInteger(n)))
    throw new TypeError('Atomics.pause argument must be an integral Number');
};
`;

  return out;
};
