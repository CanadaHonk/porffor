import type {} from './porffor.d.ts';

export const Array = function (...args: any[]): any[] {
  const argsLen: number = args.length;
  if (argsLen == 0) {
    // no args: empty array
    const out: any[] = Porffor.array.new(4);
    return out;
  }

  if (argsLen == 1) {
    // 1 arg, length (number) or first element (non-number)
    const arg: any = args[0];
    if (Porffor.type(arg) == Porffor.TYPES.number) {
      // number so use as length
      const n: number = args[0];
      if (Porffor.fastOr(
        n < 0, // negative
        n > 4294967295, // over 2**32 - 1
        !Number.isInteger(n) // non-integer/non-finite
      )) throw new RangeError('Invalid array length');

      const out: any[] = Porffor.array.new(n);
      out.length = n;
      return out;
    }

    // not number, leave to fallthrough as same as >1
  }

  // >1 arg, just return args array
  return args;
};

export const __Array_isArray = (x: unknown): boolean =>
  Porffor.type(x) == Porffor.TYPES.array;

export const __Array_from = (arg: any, mapFn: any, thisArg: any = undefined): any[] => {
  if (arg == null) throw new TypeError('Argument cannot be nullish');

  const out: any[] = Porffor.array.new(4);
  if (Porffor.fastOr(
    Porffor.type(arg) == Porffor.TYPES.array,
    (Porffor.type(arg) | 0b10000000) == Porffor.TYPES.bytestring,
    Porffor.type(arg) == Porffor.TYPES.set,
    Porffor.fastAnd(Porffor.type(arg) >= Porffor.TYPES.uint8clampedarray, Porffor.type(arg) <= Porffor.TYPES.float64array)
  )) {
    let i: i32 = 0;
    if (Porffor.type(mapFn) != Porffor.TYPES.undefined) {
      if (Porffor.type(mapFn) != Porffor.TYPES.function) throw new TypeError('Called Array.from with a non-function mapFn');

      for (const x of arg) {
        out[i] = mapFn.call(thisArg, x, i);
        i++;
      }
    } else {
      for (const x of arg) {
        out[i++] = x;
      }
    }

    out.length = i;
    return out;
  }

  if (__Porffor_object_isObject(arg)) {
    const obj: object = Porffor.type(arg) == Porffor.TYPES.object ? arg : __Porffor_object_underlying(arg);
    // check before i32 truncation: huge lengths saturate to exactly 2147483647
    const lenRaw: number = ecma262.ToIntegerOrInfinity(obj['length']);
    if (lenRaw > 2147483647) throw new RangeError('Invalid array length');
    let len: i32 = lenRaw;
    if (len < 0) len = 0;

    if (Porffor.type(mapFn) != Porffor.TYPES.undefined) {
      if (Porffor.type(mapFn) != Porffor.TYPES.function) throw new TypeError('Called Array.from with a non-function mapFn');

      for (let i: i32 = 0; i < len; i++) {
        out[i] = mapFn.call(thisArg, obj[i], i);
      }
    } else {
      for (let i: i32 = 0; i < len; i++) {
        out[i] = obj[i];
      }
    }

    out.length = len;
    return out;
  }

  return out;
};

// 23.1.2.2 Array.fromAsync (items [, mapper [, thisArg]])
// https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.fromasync
export const __Array_fromAsync = async function (items: any, mapper: any = undefined, thisArg: any = undefined) {
  if (items == null) throw new TypeError('Argument cannot be nullish');

  const out: any[] = Porffor.array.new(4);
  const mapping: boolean = Porffor.type(mapper) != Porffor.TYPES.undefined;
  if (mapping && Porffor.type(mapper) != Porffor.TYPES.function) throw new TypeError('Called Array.fromAsync with a non-function mapper');

  if (Porffor.fastOr(
    Porffor.type(items) == Porffor.TYPES.array,
    (Porffor.type(items) | 0b10000000) == Porffor.TYPES.bytestring,
    Porffor.type(items) == Porffor.TYPES.set,
    Porffor.type(items) == Porffor.TYPES.map,
    Porffor.type(items) == Porffor.TYPES.__porffor_generator,
    Porffor.type(items) == Porffor.TYPES.__porffor_asyncgenerator,
    Porffor.fastAnd(Porffor.type(items) >= Porffor.TYPES.uint8clampedarray, Porffor.type(items) <= Porffor.TYPES.float64array)
  )) {
    let i: i32 = 0;
    if (mapping) {
      for await (const x of items) {
        out[i] = await mapper.call(thisArg, x, i);
        i++;
      }
    } else {
      for await (const x of items) {
        out[i++] = x;
      }
    }

    out.length = i;
    return out;
  }

  if (__Porffor_object_isObject(items)) {
    const obj: object = Porffor.type(items) == Porffor.TYPES.object ? items : __Porffor_object_underlying(items);
    const lenRaw: number = ecma262.ToIntegerOrInfinity(obj['length']);
    if (lenRaw > 2147483647) throw new RangeError('Invalid array length');
    let len: i32 = lenRaw;
    if (len < 0) len = 0;

    if (mapping) {
      for (let i: i32 = 0; i < len; i++) {
        out[i] = await mapper.call(thisArg, await obj[i], i);
      }
    } else {
      for (let i: i32 = 0; i < len; i++) {
        out[i] = await obj[i];
      }
    }

    out.length = len;
    return out;
  }

  return out;
};

// 23.1.3.1 Array.prototype.at (index)
// https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.at
export const __Array_prototype_at = function (this: any[], index: any) {
  // 1. Let O be ? ToObject(this value).
  // 2. Let len be ? LengthOfArrayLike(O).
  const len: i32 = this.length;

  // 3. Let relativeIndex be ? ToIntegerOrInfinity(index).
  index = ecma262.ToIntegerOrInfinity(index);

  // 4. If relativeIndex ≥ 0, then
  //        a. Let k be relativeIndex.
  // 5. Else,
  //        a. Let k be len + relativeIndex.
  if (index < 0) index = len + index;

  // 6. If k < 0 or k ≥ len, return undefined.
  if (Porffor.fastOr(index < 0, index >= len)) return undefined;

  // 7. Return ? Get(O, ! ToString(𝔽(k))).
  return this[index];
};

export const __Array_prototype_push = function (this: any[], ...items: any[]) {
  let len: i32 = this.length;
  const itemsLen: i32 = items.length;
  const newLen: i32 = len + itemsLen;
  this.length = newLen;

  for (let i: i32 = 0; i < itemsLen; i++) {
    this[i + len] = items[i];
  }

  return newLen;
};

export const __Porffor_array_spread = (arr: any[], src: any) => {
  let len: i32 = arr.length;

  switch (Porffor.type(src)) {
    case Porffor.TYPES.set:
      return __Porffor_array_spread(arr, Porffor.callThis(__Set_prototype_values, src));

    case Porffor.TYPES.map:
      return __Porffor_array_spread(arr, Porffor.callThis(__Map_prototype_entries, src));

    case Porffor.TYPES.__porffor_generator:
      while (!Porffor.coroutine.resume(src, undefined, 0 as i32)) {
        arr[len] = Porffor.coroutine.value(src);
        len++;
      }

      return len;

    case Porffor.TYPES.__porffor_asyncgenerator:
      throw new TypeError('Cannot spread async generator');
  }

  const srcLen: i32 = src.length;
  const newLen: i32 = len + srcLen;
  arr.length = newLen;

  for (let i: i32 = 0; i < srcLen; i++) {
    arr[i + len] = src[i];
  }

  return newLen;
};

export const __Array_prototype_pop = function (this: any[]) {
  const len: i32 = this.length;
  if (len == 0) return undefined;

  const lastIndex: i32 = len - 1;
  const element: any = this[lastIndex];
  __Porffor_array_setLength(this, lastIndex);

  return element;
};

export const __Array_prototype_shift = function (this: any[]) {
  const len: i32 = this.length;
  if (len == 0) return undefined;

  const element: any = this[0];
  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  for (let i: i32 = 1; i < len; i++) {
    if (Porffor.fastOr(!isArray, __Porffor_array_has(this, i))) this[i - 1] = this[i];
      else __Porffor_array_delete(this, i - 1);
  }
  __Porffor_array_setLength(this, len - 1);

  return element;
};

export const __Array_prototype_unshift = function (this: any[], ...items: any[]) {
  let len: i32 = this.length;
  const itemsLen: i32 = items.length;
  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;

  let i: i32 = len;
  while (i > 0) {
    i--;
    if (Porffor.fastOr(!isArray, __Porffor_array_has(this, i))) this[i + itemsLen] = this[i];
      else __Porffor_array_delete(this, i + itemsLen);
  }

  for (let i: i32 = 0; i < itemsLen; i++) {
    this[i] = items[i];
  }

  const newLen: i32 = len + itemsLen;
  __Porffor_array_setLength(this, newLen);
  return newLen;
};

export const __Array_prototype_slice = function (this: any[], _start: any, _end: any) {
  const len: i32 = this.length;
  if (Porffor.type(_end) == Porffor.TYPES.undefined) _end = len;

  let start: i32 = ecma262.ToIntegerOrInfinity(_start);
  let end: i32 = ecma262.ToIntegerOrInfinity(_end);

  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }
  if (start > len) start = len;
  if (end < 0) {
    end = len + end;
    if (end < 0) end = 0;
  }
  if (end > len) end = len;

  if (len == 0) {
    const out: any[] = Porffor.array.new(6);
    return out;
  }

  const out: any[] = Porffor.array.new(4);

  if (start > end) return out;

  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  let j: i32 = 0;
  for (let i: i32 = start; i < end; i++) {
    if (Porffor.fastOr(!isArray, __Porffor_array_has(this, i))) out[j] = this[i];
    j++;
  }

  out.length = end - start;
  return out;
};

export const __Array_prototype_splice = function (this: any[], _start: any, _deleteCount: any, ...items: any[]) {
  const len: i32 = this.length;

  let start: i32 = ecma262.ToIntegerOrInfinity(_start);
  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }
  if (start > len) start = len;

  if (Porffor.type(_deleteCount) == Porffor.TYPES.undefined) _deleteCount = len - start;
  let deleteCount: i32 = ecma262.ToIntegerOrInfinity(_deleteCount);

  if (deleteCount < 0) deleteCount = 0;
  if (deleteCount > len - start) deleteCount = len - start;

  let outCapacity: i32 = deleteCount;
  if (outCapacity < 4) outCapacity = 4;

  const out: any[] = Porffor.array.new(outCapacity);

  const itemsLen: i32 = items.length;
  const newLen: i32 = len - deleteCount + itemsLen;
  const tailLen: i32 = len - start - deleteCount;
  const entries: i32 = __Porffor_array_ensure(this, newLen);

  if (deleteCount > 0) {
    const outEntries: i32 = Porffor.IR.loadI32(out, 4);
    Porffor.IR.copy(outEntries, entries + start * 8, deleteCount * 8);
  }
  out.length = deleteCount;

  if (itemsLen < deleteCount) {
    Porffor.IR.copy(entries + (start + itemsLen) * 8, entries + (start + deleteCount) * 8, tailLen * 8);
  } else if (itemsLen > deleteCount) {
    Porffor.IR.copy(entries + (start + itemsLen) * 8, entries + (start + deleteCount) * 8, tailLen * 8);
  }

  if (itemsLen > 0) {
    const itemsEntries: i32 = __Porffor_array_ensure(items, 0);
    Porffor.IR.copy(entries + start * 8, itemsEntries, itemsLen * 8);
    Porffor.IR.gcBarrier(this, Porffor.TYPES.array);
  }

  __Porffor_array_setLength(this, newLen);

  return out;
};

// @porf-typed-array
export const __Array_prototype_fill = function (this: any[], value: any, _start: any, _end: any) {
  const len: i32 = this.length;

  if (Porffor.type(_start) == Porffor.TYPES.undefined) _start = 0;
  if (Porffor.type(_end) == Porffor.TYPES.undefined) _end = len;

  let start: i32 = ecma262.ToIntegerOrInfinity(_start);
  let end: i32 = ecma262.ToIntegerOrInfinity(_end);

  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }
  if (start > len) start = len;
  if (end < 0) {
    end = len + end;
    if (end < 0) end = 0;
  }
  if (end > len) end = len;

  for (let i: i32 = start; i < end; i++) {
    this[i] = value;
  }

  return this;
};

// @porf-typed-array
export const __Array_prototype_indexOf = function (this: any[], searchElement: any, _position: any) {
  const len: i32 = this.length;
  if (len == 0) return -1;

  let position: i32 = ecma262.ToIntegerOrInfinity(_position);
  if (position >= 0) {
    if (position > len) position = len;
  } else {
    position = len + position;
    if (position < 0) position = 0;
  }

  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  for (let i: i32 = position; i < len; i++) {
    if (Porffor.fastAnd(isArray, !__Porffor_array_has(this, i))) continue;
    if (this[i] === searchElement) return i;
  }

  return -1;
};

// @porf-typed-array
export const __Array_prototype_lastIndexOf = function (this: any[], searchElement: any, _position: any) {
  const len: i32 = this.length;
  if (len == 0) return -1;

  let position: i32 = _position == null ? len - 1 : ecma262.ToIntegerOrInfinity(_position);
  if (position >= 0) {
    if (position > len - 1) position = len - 1;
  } else {
    position = len + position;
  }

  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  for (let i: i32 = position; i >= 0; i--) {
    if (Porffor.fastAnd(isArray, !__Porffor_array_has(this, i))) continue;
    if (this[i] === searchElement) return i;
  }

  return -1;
};

// @porf-typed-array
export const __Array_prototype_includes = function (this: any[], searchElement: any, _position: any) {
  const len: i32 = this.length;
  if (len == 0) return false;

  let position: i32 = ecma262.ToIntegerOrInfinity(_position);
  if (position >= 0) {
    if (position > len) position = len;
  } else {
    position = len + position;
    if (position < 0) position = 0;
  }

  for (let i: i32 = position; i < len; i++) {
    if (__ecma262_SameValueZero(this[i], searchElement)) return true;
  }

  return false;
};

// @porf-typed-array
export const __Array_prototype_with = function (this: any[], _index: any, value: any) {
  const len: i32 = this.length;

  let index: i32 = ecma262.ToIntegerOrInfinity(_index);
  if (index < 0) {
    index = len + index;
    if (index < 0) {
      throw new RangeError('Invalid index');
    }
  }

  if (index >= len) {
    throw new RangeError('Invalid index');
  }

  const out: any[] = Porffor.array.new(len);

  out.length = len;
  for (let i: i32 = 0; i < len; i++) out[i] = this[i];

  out[index] = value;

  return out;
};

// @porf-typed-array
export const __Array_prototype_copyWithin = function (this: any[], _target: any, _start: any, _end: any) {
  const len: i32 = this.length;

  let targetNum: number = ecma262.ToIntegerOrInfinity(_target);
  if (targetNum < 0) {
    targetNum = len + targetNum;
    if (targetNum < 0) targetNum = 0;
  }
  if (targetNum > len) targetNum = len;
  let target: i32 = targetNum;

  let startNum: number = ecma262.ToIntegerOrInfinity(_start);
  if (startNum < 0) {
    startNum = len + startNum;
    if (startNum < 0) startNum = 0;
  }
  if (startNum > len) startNum = len;
  let start: i32 = startNum;

  let end: i32;
  if (Porffor.type(_end) == Porffor.TYPES.undefined) {
    end = len;
  } else {
    let endNum: number = ecma262.ToIntegerOrInfinity(_end);
    if (endNum < 0) {
      endNum = len + endNum;
      if (endNum < 0) endNum = 0;
    }
    if (endNum > len) endNum = len;
    end = endNum;
  }

  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  let count: i32 = 0;
  if (end > start) count = end - start;
  const targetRoom: i32 = len - target;
  if (count > targetRoom) count = targetRoom;
  if (count <= 0) return this;
  let direction: i32 = 1;
  if (Porffor.fastAnd(start < target, target < start + count)) {
    direction = -1;
    start += count - 1;
    target += count - 1;
  }

  while (count > 0) {
    if (Porffor.fastOr(!isArray, __Porffor_array_has(this, start))) this[target] = this[start];
      else __Porffor_array_delete(this, target);
    start += direction;
    target += direction;
    count--;
  }

  return this;
};

// @porf-typed-array
export const __Array_prototype_concat = function (this: any[], ...vals: any[]) {
  let len: i32 = this.length;
  const out: any[] = Porffor.array.new(len);

  out.length = len;
  for (let i: i32 = 0; i < len; i++) {
    if (Porffor.type(this) != Porffor.TYPES.array || __Porffor_array_has(this, i)) out[i] = this[i];
  }

  for (const x of vals) {
    if (Porffor.type(x) == Porffor.TYPES.array) {
      // todo: for..of is broken here because ??
      const l: i32 = x.length;
      for (let i: i32 = 0; i < l; i++) {
        if (__Porffor_array_has(x, i)) out[len] = x[i];
        len++;
      }
    } else {
      out[len++] = x;
    }
  }

  out.length = len;
  return out;
};

// @porf-typed-array
export const __Array_prototype_reverse = function (this: any[]) {
  const len: i32 = this.length;

  let start: i32 = 0;
  let end: i32 = len;
  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;

  while (start < end) {
    end--;
    if (start >= end) break;
    if (isArray) {
      const startHas: boolean = __Porffor_array_has(this, start);
      const endHas: boolean = __Porffor_array_has(this, end);
      if (startHas) {
        const tmp: any = this[start];
        if (endHas) this[start] = this[end];
          else __Porffor_array_delete(this, start);
        this[end] = tmp;
      } else if (endHas) {
        this[start] = this[end];
        __Porffor_array_delete(this, end);
      }
    } else {
      const tmp: any = this[start];
      this[start] = this[end];
      this[end] = tmp;
    }
    start++;
  }

  return this;
};


// @porf-typed-array
export const __Array_prototype_forEach = function (this: any[], callbackFn: any, thisArg: any) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = this.length;
  let i: i32 = 0;
  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  while (i < len) {
    if (Porffor.fastAnd(isArray, !__Porffor_array_has(this, i))) {
      i++;
      continue;
    }
    callbackFn.call(thisArg, this[i], i++, this);
  }
};

// @porf-typed-array
export const __Array_prototype_filter = function (this: any[], callbackFn: any, thisArg: any) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = this.length;
  if (len == 0) {
    const out: any[] = Porffor.array.new(6);
    return out;
  }

  const out: any[] = Porffor.array.new(4);
  let i: i32 = 0;
  let j: i32 = 0;
  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  while (i < len) {
    if (Porffor.fastAnd(isArray, !__Porffor_array_has(this, i))) {
      i++;
      continue;
    }
    const el: any = this[i];
    if (!!callbackFn.call(thisArg, el, i++, this)) out[j++] = el;
  }

  out.length = j;
  return out;
};

// @porf-typed-array
export const __Array_prototype_map = function (this: any[], callbackFn: any, thisArg: any) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = this.length;
  if (len == 0) {
    const out: any[] = Porffor.array.new(6);
    return out;
  }

  const out: any[] = Porffor.array.new(4);
  out.length = len;

  let i: i32 = 0;
  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  while (i < len) {
    if (Porffor.fastAnd(isArray, !__Porffor_array_has(this, i))) {
      i++;
      continue;
    }
    out[i] = callbackFn.call(thisArg, this[i], i++, this);
  }

  return out;
};

export const __Array_prototype_flatMap = function (this: any[], callbackFn: any, thisArg: any) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = this.length;
  if (len == 0) {
    const out: any[] = Porffor.array.new(6);
    return out;
  }

  const out: any[] = Porffor.array.new(4);

  let i: i32 = 0, j: i32 = 0;
  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  while (i < len) {
    if (Porffor.fastAnd(isArray, !__Porffor_array_has(this, i))) {
      i++;
      continue;
    }
    let x: any = callbackFn.call(thisArg, this[i], i++, this);
    if (Porffor.type(x) == Porffor.TYPES.array) {
      for (const y of x) out[j++] = y;
    } else out[j++] = x;
  }

  out.length = j;
  return out;
};

// @porf-typed-array
export const __Array_prototype_find = function (this: any[], callbackFn: any, thisArg: any) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = this.length;
  let i: i32 = 0;
  while (i < len) {
    const el: any = this[i];
    if (!!callbackFn.call(thisArg, el, i++, this)) return el;
  }
};

// @porf-typed-array
export const __Array_prototype_findLast = function (this: any[], callbackFn: any, thisArg: any) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  let i: i32 = this.length;
  while (i > 0) {
    const el: any = this[--i];
    if (!!callbackFn.call(thisArg, el, i, this)) return el;
  }
};

// @porf-typed-array
export const __Array_prototype_findIndex = function (this: any[], callbackFn: any, thisArg: any) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = this.length;
  let i: i32 = 0;
  while (i < len) {
    if (!!callbackFn.call(thisArg, this[i], i, this)) return i;
    i++;
  }
  return -1;
};

// @porf-typed-array
export const __Array_prototype_findLastIndex = function (this: any[], callbackFn: any, thisArg: any) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  let i: i32 = this.length;
  while (i > 0) {
    if (!!callbackFn.call(thisArg, this[--i], i, this)) return i;
  }
  return -1;
};

// @porf-typed-array
export const __Array_prototype_every = function (this: any[], callbackFn: any, thisArg: any) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = this.length;
  let i: i32 = 0;
  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  while (i < len) {
    if (Porffor.fastAnd(isArray, !__Porffor_array_has(this, i))) {
      i++;
      continue;
    }
    if (!!callbackFn.call(thisArg, this[i], i++, this)) {}
      else return false;
  }

  return true;
};

// @porf-typed-array
export const __Array_prototype_some = function (this: any[], callbackFn: any, thisArg: any) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = this.length;
  let i: i32 = 0;
  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  while (i < len) {
    if (Porffor.fastAnd(isArray, !__Porffor_array_has(this, i))) {
      i++;
      continue;
    }
    if (!!callbackFn.call(thisArg, this[i], i++, this)) return true;
  }

  return false;
};

// @porf-typed-array
export const __Array_prototype_reduce = function (this: any[], callbackFn: any, initialValue: any) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = this.length;
  let acc: any = initialValue;
  let i: i32 = 0;
  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  if (acc === undefined) {
    while (Porffor.fastAnd(i < len, isArray, !__Porffor_array_has(this, i))) i++;
    if (i == len) throw new TypeError('Reduce of empty array with no initial value');
    acc = this[i++];
  }

  while (i < len) {
    if (Porffor.fastAnd(isArray, !__Porffor_array_has(this, i))) {
      i++;
      continue;
    }
    acc = callbackFn(acc, this[i], i++, this);
  }

  return acc;
};

// @porf-typed-array
export const __Array_prototype_reduceRight = function (this: any[], callbackFn: any, initialValue: any) {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = this.length;
  let acc: any = initialValue;
  let i: i32 = len;
  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  if (acc === undefined) {
    while (Porffor.fastAnd(i > 0, isArray, !__Porffor_array_has(this, i - 1))) i--;
    if (i == 0) throw new TypeError('Reduce of empty array with no initial value');
    acc = this[--i];
  }

  while (i > 0) {
    if (Porffor.fastAnd(isArray, !__Porffor_array_has(this, i - 1))) {
      i--;
      continue;
    }
    acc = callbackFn(acc, this[--i], i, this);
  }

  return acc;
};

// a < b for strings
export const __Porffor_strlt = (a: string|bytestring, b: string|bytestring) => {
  const aLen: i32 = a.length;
  const bLen: i32 = b.length;
  const len: i32 = aLen < bLen ? aLen : bLen;
  for (let i: i32 = 0; i < len; i++) {
    const ac: i32 = a.charCodeAt(i);
    const bc: i32 = b.charCodeAt(i);

    if (ac < bc) return true;
    if (ac > bc) return false;
  }

  return aLen < bLen;
};

// @porf-typed-array
export const __Array_prototype_sort = function (this: any[], callbackFn: any) {
  if (callbackFn === undefined) {
    // default callbackFn, convert to strings and sort by char code
    callbackFn = (x: any, y: any) => {
      // 23.1.3.30.2 CompareArrayElements (x, y, comparefn)
      // https://tc39.es/ecma262/#sec-comparearrayelements
      // 5. Let xString be ? ToString(x).
      const xString: any = ecma262.ToString(x);

      // 6. Let yString be ? ToString(y).
      const yString: any = ecma262.ToString(y);

      // 7. Let xSmaller be ! IsLessThan(xString, yString, true).
      // 8. If xSmaller is true, return -1𝔽.
      if (__Porffor_strlt(xString, yString)) return -1;

      // 9. Let ySmaller be ! IsLessThan(yString, xString, true).
      // 10. If ySmaller is true, return 1𝔽.
      if (__Porffor_strlt(yString, xString)) return 1;

      // 11. Return +0𝔽.
      return 0;
    };
  }

  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  let len: i32 = this.length;
  if (Porffor.type(this) == Porffor.TYPES.array) {
    let presentLen: i32 = 0;
    for (let i: i32 = 0; i < len; i++) {
      if (!__Porffor_array_has(this, i)) continue;
      this[presentLen++] = this[i];
    }
    for (let i: i32 = presentLen; i < len; i++) __Porffor_array_delete(this, i);
    len = presentLen;
  }

  // bottom-up merge sort: stable, O(n log n). insertion sort below handles the short
  // arrays, where the auxiliary buffer costs more than the quadratic loop saves
  if (len > 24) {
    const buf: any[] = Porffor.array.new(len);
    buf.length = len;

    let width: i32 = 1;
    while (width < len) {
      let lo: i32 = 0;
      while (lo < len) {
        let mid: i32 = lo + width;
        if (mid > len) mid = len;
        let hi: i32 = mid + width;
        if (hi > len) hi = len;

        let a: i32 = lo;
        let b: i32 = mid;
        let k: i32 = lo;
        while (a < mid && b < hi) {
          const x: any = this[a];
          const y: any = this[b];

          // 23.1.3.30.2 CompareArrayElements (x, y, comparefn)
          // https://tc39.es/ecma262/#sec-comparearrayelements
          let v: number;
          if (Porffor.type(x) == Porffor.TYPES.undefined && Porffor.type(y) == Porffor.TYPES.undefined) v = 0;
            else if (Porffor.type(x) == Porffor.TYPES.undefined) v = 1;
            else if (Porffor.type(y) == Porffor.TYPES.undefined) v = -1;
            else v = callbackFn(x, y);

          // take the left run unless it compares strictly greater, so equal elements keep
          // their original order (NaN falls here too, matching the spec's coercion to +0)
          if (v > 0) {
            buf[k++] = y;
            b++;
          } else {
            buf[k++] = x;
            a++;
          }
        }
        while (a < mid) buf[k++] = this[a++];
        while (b < hi) buf[k++] = this[b++];

        lo = hi;
      }

      for (let i: i32 = 0; i < len; i++) this[i] = buf[i];
      width *= 2;
    }

    return this;
  }

  for (let i: i32 = 0; i < len; i++) {
    const x: any = this[i];
    let j: i32 = i;
    while (j > 0) {
      const y: any = this[j - 1];

      // 23.1.3.30.2 CompareArrayElements (x, y, comparefn)
      // https://tc39.es/ecma262/#sec-comparearrayelements
      let v: number;

      // 1. If x and y are both undefined, return +0𝔽.
      if (Porffor.type(x) == Porffor.TYPES.undefined && Porffor.type(y) == Porffor.TYPES.undefined) v = 0;
        // 2. If x is undefined, return 1𝔽.
        else if (Porffor.type(x) == Porffor.TYPES.undefined) v = 1;
        // 3. If y is undefined, return -1𝔽.
        else if (Porffor.type(y) == Porffor.TYPES.undefined) v = -1;
        else {
          // 4. If comparefn is not undefined, then
          // a. Let v be ? ToNumber(? Call(comparefn, undefined, « x, y »)).
          // perf: ToNumber unneeded as we just check >= 0
          v = callbackFn(x, y);

          // b. If v is NaN, return +0𝔽.
          // perf: unneeded as we just check >= 0
          // if (Number.isNaN(v)) v = 0;

          // c. Return v.
        }

      if (v >= 0) break;
      this[j--] = y;
    }

    this[j] = x;
  }

  return this;
};

// @porf-typed-array
export const __Array_prototype_toString = function (this: any[]) {
  // todo: this is bytestring only!

  const len: i32 = this.length;
  if (len == 0) return '';

  const parts: any[] = Porffor.array.new(len);
  const partLens: i32 = Porffor.malloc(len * 4);

  let outLen: i32 = 0;
  if (len > 1) outLen = len - 1;

  let i: i32 = 0;
  while (i < len) {
    const element: any = this[i++];
    let partLen: i32 = 0;
    if (element != 0 || Porffor.fastAnd(
      Porffor.type(element) != Porffor.TYPES.undefined, // undefined
      Porffor.type(element) != Porffor.TYPES.object // null
    )) {
      const part: bytestring = ecma262.ToString(element);
      parts[i - 1] = part;
      partLen = part.length;
      outLen += partLen;
    }

    Porffor.IR.storeI32(partLens + (i - 1) * 4, 0, partLen);
  }

  const out: bytestring = Porffor.malloc(outLen + 6);
  Porffor.IR.storeI32(out, 0, outLen);

  let outPtr: i32 = Porffor.IR.ptr(out);
  i = 0;
  while (i < len) {
    if (i > 0) Porffor.IR.storeU8(outPtr++, 4, 44);

    const part: bytestring = parts[i];
    const partLen: i32 = Porffor.IR.loadI32(partLens + i * 4, 0);
    i++;
    if (partLen != 0) {
      Porffor.IR.copy(outPtr + 4, Porffor.IR.ptr(part) + 4, partLen);
      outPtr += partLen;
    }
  }

  return out;
};

// @porf-typed-array
export const __Array_prototype_toLocaleString = function (this: any[]) { return Porffor.callThis(__Array_prototype_toString, this); };

// @porf-typed-array
export const __Array_prototype_join = function (this: any[], _separator: any) {
  let separator: any = ',';
  if (Porffor.type(_separator) != Porffor.TYPES.undefined)
    separator = ecma262.ToString(_separator);

  const len: i32 = this.length;
  if (len == 0) return '';

  const separatorLen: i32 = separator.length;
  let outLen: i32 = len > 1 ? separatorLen * (len - 1) : 0;
  let bytesOnly: boolean = Porffor.type(separator) == Porffor.TYPES.bytestring;
  const parts: any[] = Porffor.array.new(len);
  const partLens: i32 = Porffor.malloc(len * 4);

  let i: i32 = 0;
  while (i < len) {
    const element: any = this[i++];
    const elementType: i32 = Porffor.type(element);
    let partLen: i32 = 0;
    if (Porffor.fastAnd(elementType != Porffor.TYPES.undefined, Porffor.fastOr(
      elementType != Porffor.TYPES.object,
      Porffor.IR.ptr(element) != 0
    ))) {
      const part: any = ecma262.ToString(element);
      parts[i - 1] = part;
      partLen = part.length;
      outLen += partLen;
      if (Porffor.type(part) != Porffor.TYPES.bytestring) bytesOnly = false;
    }

    Porffor.IR.storeI32(partLens + (i - 1) * 4, 0, partLen);
  }

  if (bytesOnly) {
    const out: bytestring = Porffor.malloc(outLen + 6);
    Porffor.IR.storeI32(out, 0, outLen);

    let outPtr: i32 = Porffor.IR.ptr(out);
    i = 0;
    while (i < len) {
      if (i > 0) {
        Porffor.IR.copy(outPtr + 4, Porffor.IR.ptr(separator) + 4, separatorLen);
        outPtr += separatorLen;
      }

      const part: bytestring = parts[i];
      const partLen: i32 = Porffor.IR.loadI32(partLens + i * 4, 0);
      i++;
      if (partLen != 0) {
        Porffor.IR.copy(outPtr + 4, Porffor.IR.ptr(part) + 4, partLen);
        outPtr += partLen;
      }
    }

    return out;
  }

  const out: string = Porffor.malloc(outLen * 2 + 6);
  Porffor.IR.storeI32(out, 0, outLen);

  let outPtr: i32 = Porffor.IR.ptr(out);
  i = 0;
  while (i < len) {
    if (i > 0) {
      if (Porffor.type(separator) == Porffor.TYPES.bytestring) {
        for (let j: i32 = 0; j < separatorLen; j++)
          Porffor.IR.storeU16(outPtr + j * 2, 4, Porffor.IR.loadU8(Porffor.IR.ptr(separator) + j, 4));
      } else {
        Porffor.IR.copy(outPtr + 4, Porffor.IR.ptr(separator) + 4, separatorLen * 2);
      }
      outPtr += separatorLen * 2;
    }

    const part: any = parts[i];
    const partLen: i32 = Porffor.IR.loadI32(partLens + i * 4, 0);
    i++;
    if (partLen != 0) {
      if (Porffor.type(part) == Porffor.TYPES.bytestring) {
        for (let j: i32 = 0; j < partLen; j++)
          Porffor.IR.storeU16(outPtr + j * 2, 4, Porffor.IR.loadU8(Porffor.IR.ptr(part) + j, 4));
      } else {
        Porffor.IR.copy(outPtr + 4, Porffor.IR.ptr(part) + 4, partLen * 2);
      }
      outPtr += partLen * 2;
    }
  }

  return out;
};

// @porf-typed-array
export const __Array_prototype_valueOf = function (this: any[]) {
  return this;
};

// @porf-typed-array
export const __Array_prototype_toReversed = function (this: any[]) {
  const len: i32 = this.length;
  if (len == 0) {
    const out: any[] = Porffor.array.new(6);
    return out;
  }

  let start: i32 = 0;
  let end: i32 = len - 1;

  const out: any[] = Porffor.array.new(4);
  out.length = len;

  while (true) {
    out[start] = this[end];
    if (start >= end) {
      break;
    }
    out[end--] = this[start++];
  }

  return out;
};

// @porf-typed-array
export const __Array_prototype_toSorted = function (this: any[], callbackFn: any) {
  // todo/perf: could be rewritten to be its own instead of cloning and using normal sort()
  if (Porffor.type(callbackFn) != Porffor.TYPES.undefined) {
    if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  }

  const len: i32 = this.length;
  if (len == 0) {
    const out: any[] = Porffor.array.new(6);
    return out;
  }

  const out: any[] = Porffor.array.new(len);
  out.length = len;
  for (let i: i32 = 0; i < len; i++) out[i] = this[i];

  return Porffor.callThis(__Array_prototype_sort, out, callbackFn);
};

export const __Array_prototype_toSpliced = function (this: any[], _start: any, _deleteCount: any, ...items: any[]) {
  const len: i32 = this.length;

  let start: i32 = ecma262.ToIntegerOrInfinity(_start);
  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }
  if (start > len) start = len;

  if (Porffor.type(_deleteCount) == Porffor.TYPES.undefined) _deleteCount = len - start;
  let deleteCount: i32 = ecma262.ToIntegerOrInfinity(_deleteCount);

  if (deleteCount < 0) deleteCount = 0;
  if (deleteCount > len - start) deleteCount = len - start;

  const itemsLen: i32 = items.length;
  const outLen: i32 = len - deleteCount + itemsLen;
  const out: any[] = Porffor.array.new(outLen);
  out.length = outLen;

  let i: i32 = 0;
  while (i < start) {
    out[i] = this[i];
    i++;
  }

  let j: i32 = 0;
  while (j < itemsLen) {
    out[start + j] = items[j];
    j++;
  }

  i = start + deleteCount;
  j = start + itemsLen;
  while (i < len) out[j++] = this[i++];

  return out;
};


export const __Array_prototype_flat = function (this: any[], _depth: any) {
  if (Porffor.type(_depth) == Porffor.TYPES.undefined) _depth = 1;
  let depth: i32 = ecma262.ToIntegerOrInfinity(_depth);

  if (this.length == 0) {
    const out: any[] = Porffor.array.new(6);
    return out;
  }

  const len: i32 = this.length;
  const out: any[] = Porffor.array.new(len);
  if (depth <= 0) {
    out.length = len;
    const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
    for (let i: i32 = 0; i < len; i++) {
      if (Porffor.fastOr(!isArray, __Porffor_array_has(this, i))) out[i] = this[i];
    }
    return out;
  }

  let i: i32 = 0, j: i32 = 0;
  const isArray: boolean = Porffor.type(this) == Porffor.TYPES.array;
  while (i < len) {
    if (Porffor.fastAnd(isArray, !__Porffor_array_has(this, i))) {
      i++;
      continue;
    }
    let x: any = this[i++];
    if (Porffor.type(x) == Porffor.TYPES.array) {
      if (depth > 1) x = Porffor.callThis(__Array_prototype_flat, x, depth - 1);
      for (const y of x) out[j++] = y;
    } else out[j++] = x;
  }

  out.length = j;

  return out;
};


export const __Porffor_array_fastPush = (arr: any[], el: any): i32 => {
  let len: i32 = arr.length;
  arr[len] = el;
  arr.length = ++len;
  return len;
};
