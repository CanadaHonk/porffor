import type {} from './porffor.d.ts';

export const Array = function (...args: any[]): any[] {
  const argsLen: number = args.length;
  if (argsLen == 0) {
    // 0 args, new 0 length array
    const out: any[] = Porffor.allocate();
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

      const out: any[] = Porffor.allocate();
      out.length = arg;
      return out;
    }

    // not number, leave to fallthrough as same as >1
  }

  // >1 arg, just return args array
  return args;
};

export const __Array_isArray = (x: unknown): boolean =>
  Porffor.type(x) == Porffor.TYPES.array;

export const __Array_from = (arg: any, mapFn: any): any[] => {
  if (arg == null) throw new TypeError('Argument cannot be nullish');

  let out: any[] = Porffor.allocate();

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
        out[i] = mapFn(x, i);
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

  if (Porffor.type(arg) == Porffor.TYPES.object) {
    let len: i32 = ecma262.ToIntegerOrInfinity((arg as object)['length']);
    if (len > 4294967295) throw new RangeError('Invalid array length');
    if (len < 0) len = 0;

    for (let i: i32 = 0; i < len; i++) {
      out[i] = (arg as object)[i];
    }

    out.length = len;
    return out;
  }

  return out;
};

// 23.1.3.1 Array.prototype.at (index)
// https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.at
export const __Array_prototype_at = (_this: any[], index: any) => {
  // 1. Let O be ? ToObject(this value).
  // 2. Let len be ? LengthOfArrayLike(O).
  const len: i32 = _this.length;

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
  return _this[index];
};

export const __Array_prototype_push = (_this: any[], ...items: any[]) => {
  let len: i32 = _this.length;
  const itemsLen: i32 = items.length;

  for (let i: i32 = 0; i < itemsLen; i++) {
    _this[i + len] = items[i];
  }

  return _this.length = len + itemsLen;
};

export const __Array_prototype_pop = (_this: any[]) => {
  const len: i32 = _this.length;
  if (len == 0) return undefined;

  const lastIndex: i32 = len - 1;
  const element: any = _this[lastIndex];
  _this.length = lastIndex;

  return element;
};

export const __Array_prototype_shift = (_this: any[]) => {
  const len: i32 = _this.length;
  if (len == 0) return undefined;

  const element: any = _this[0];
  _this.length = len - 1;

  // shift all elements left by 1 using memory.copy
  Porffor.wasm`;; ptr = ptr(_this) + 4
local #shift_ptr i32
local.get ${_this}
i32.to_u
i32.const 4
i32.add
local.set #shift_ptr

;; dst = ptr (start of array)
local.get #shift_ptr

;; src = ptr + 9 (second element)
local.get #shift_ptr
i32.const 9
i32.add

;; size = (len - 1) * 9
local.get ${len}
i32.to_u
i32.const 1
i32.sub
i32.const 9
i32.mul

memory.copy 0 0`;

  return element;
};

export const __Array_prototype_unshift = (_this: any[], ...items: any[]) => {
  let len: i32 = _this.length;
  const itemsLen: i32 = items.length;

  // use memory.copy to move existing elements right
  Porffor.wasm`;; ptr = ptr(_this) + 4
local #splice_ptr i32
local.get ${_this}
i32.to_u
i32.const 4
i32.add
local.set #splice_ptr

;; dst = ptr + itemsLen * 9
local.get #splice_ptr
local.get ${itemsLen}
i32.to_u
i32.const 9
i32.mul
i32.add

;; src = ptr
local.get #splice_ptr

;; size = len * 9
local.get ${len}
i32.to_u
i32.const 9
i32.mul

memory.copy 0 0`;

  // write to now empty elements
  for (let i: i32 = 0; i < itemsLen; i++) {
    _this[i] = items[i];
  }

  return _this.length = len + itemsLen;
};

export const __Array_prototype_slice = (_this: any[], _start: any, _end: any) => {
  const len: i32 = _this.length;
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

  let out: any[] = Porffor.allocate();

  if (start > end) return out;

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}`;

  const thisPtrEnd: i32 = thisPtr + end * 9;

  thisPtr += start * 9;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.f64.store(outPtr, Porffor.wasm.f64.load(thisPtr, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(outPtr, Porffor.wasm.i32.load8_u(thisPtr, 0, 12), 0, 12);

    thisPtr += 9;
    outPtr += 9;
  }

  out.length = end - start;
  return out;
};

export const __Array_prototype_splice = (_this: any[], _start: any, _deleteCount: any, ...items: any[]) => {
  const len: i32 = _this.length;

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

  // read values to be deleted into out
  let out: any[] = Porffor.allocate();
  out.length = deleteCount;

  let outPtr: i32 = Porffor.wasm`local.get ${out}`;
  let thisPtr: i32 = Porffor.wasm`local.get ${_this}` + start * 9;
  let thisPtrEnd: i32 = thisPtr + deleteCount * 9;

  while (thisPtr < thisPtrEnd) {
    Porffor.wasm.f64.store(outPtr, Porffor.wasm.f64.load(thisPtr, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(outPtr, Porffor.wasm.i32.load8_u(thisPtr, 0, 12), 0, 12);

    thisPtr += 9;
    outPtr += 9;
  }

  // update this length
  const itemsLen: i32 = items.length;
  _this.length = len - deleteCount + itemsLen;

  // remove deleted values via memory.copy shifting values in mem
  Porffor.wasm`;; ptr = ptr(_this) + 4 + (start * 9)
local #splice_ptr i32
local.get ${_this}
i32.to_u
i32.const 4
i32.add
local.get ${start}
i32.to_u
i32.const 9
i32.mul
i32.add
local.set #splice_ptr

;; dst = ptr + itemsLen * 9
local.get #splice_ptr
local.get ${itemsLen}
i32.to_u
i32.const 9
i32.mul
i32.add

;; src = ptr + deleteCount * 9
local.get #splice_ptr
local.get ${deleteCount}
i32.to_u
i32.const 9
i32.mul
i32.add

;; size = (len - start - deleteCount) * 9
local.get ${len}
i32.to_u
local.get ${start}
i32.to_u
local.get ${deleteCount}
i32.to_u
i32.sub
i32.sub
i32.const 9
i32.mul

memory.copy 0 0`;

  if (itemsLen > 0) {
    let itemsPtr: i32 = Porffor.wasm`local.get ${items}`;
    thisPtr = Porffor.wasm`local.get ${_this}` + start * 9;
    thisPtrEnd = thisPtr + itemsLen * 9;

    while (thisPtr < thisPtrEnd) {
      Porffor.wasm.f64.store(thisPtr, Porffor.wasm.f64.load(itemsPtr, 0, 4), 0, 4);
      Porffor.wasm.i32.store8(thisPtr, Porffor.wasm.i32.load8_u(itemsPtr, 0, 12), 0, 12);

      thisPtr += 9;
      itemsPtr += 9;
    }
  }

  return out;
};

// @porf-typed-array
export const __Array_prototype_fill = (_this: any[], value: any, _start: any, _end: any) => {
  const len: i32 = _this.length;

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
    _this[i] = value;
  }

  return _this;
};

// @porf-typed-array
export const __Array_prototype_indexOf = (_this: any[], searchElement: any, _position: any) => {
  const len: i32 = _this.length;
  let position: i32 = ecma262.ToIntegerOrInfinity(_position);
  if (position >= 0) {
    if (position > len) position = len;
  } else {
    position = len + position;
    if (position < 0) position = 0;
  }

  for (let i: i32 = position; i < len; i++) {
    if (_this[i] === searchElement) return i;
  }

  return -1;
};

// @porf-typed-array
export const __Array_prototype_lastIndexOf = (_this: any[], searchElement: any, _position: any) => {
  const len: i32 = _this.length;
  let position: i32 = _position == null ? len - 1 : ecma262.ToIntegerOrInfinity(_position);
  if (position >= 0) {
    if (position > len - 1) position = len - 1;
  } else {
    position = len + position;
  }

  for (let i: i32 = position; i >= 0; i--) {
    if (_this[i] === searchElement) return i;
  }

  return -1;
};

// @porf-typed-array
export const __Array_prototype_includes = (_this: any[], searchElement: any, _position: any) => {
  const len: i32 = _this.length;
  let position: i32 = ecma262.ToIntegerOrInfinity(_position);
  if (position >= 0) {
    if (position > len) position = len;
  } else {
    position = len + position;
    if (position < 0) position = 0;
  }

  for (let i: i32 = position; i < len; i++) {
    if (_this[i] === searchElement) return true;
  }

  return false;
};

// @porf-typed-array
export const __Array_prototype_with = (_this: any[], _index: any, value: any) => {
  const len: i32 = _this.length;

  let index: i32 = ecma262.ToIntegerOrInfinity(_index);
  if (index < 0) {
    index = len + index;
    if (index < 0) {
      throw new RangeError('Invalid index');
    }
  }

  if (index > len) {
    throw new RangeError('Invalid index');
  }

  let out: any[] = Porffor.allocate();
  Porffor.clone(_this, out);

  out[index] = value;

  return out;
};

// @porf-typed-array
export const __Array_prototype_copyWithin = (_this: any[], _target: any, _start: any, _end: any) => {
  const len: i32 = _this.length;

  let target: i32 = ecma262.ToIntegerOrInfinity(_target);
  if (target < 0) {
    target = len + target;
    if (target < 0) target = 0;
  }
  if (target > len) target = len;

  let start: i32 = ecma262.ToIntegerOrInfinity(_start);
  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }
  if (start > len) start = len;

  let end: i32;
  if (Porffor.type(_end) == Porffor.TYPES.undefined) {
    end = len;
  } else {
    end = ecma262.ToIntegerOrInfinity(_end);
    if (end < 0) {
      end = len + end;
      if (end < 0) end = 0;
    }
    if (end > len) end = len;
  }

  while (start < end) {
    _this[target++] = _this[start++];
  }

  return _this;
};

// @porf-typed-array
export const __Array_prototype_concat = (_this: any[], ...vals: any[]) => {
  // todo/perf: rewrite to use memory.copy (via some Porffor.array.append thing?)
  let out: any[] = Porffor.allocate();
  Porffor.clone(_this, out);

  let len: i32 = _this.length;

  for (const x of vals) {
    if (Porffor.type(x) & 0b01000000) { // value is iterable
      // todo: for..of is broken here because ??
      const l: i32 = x.length;
      for (let i: i32 = 0; i < l; i++) {
        out[len++] = x[i];
      }
    } else {
      out[len++] = x;
    }
  }

  out.length = len;
  return out;
};

// @porf-typed-array
export const __Array_prototype_reverse = (_this: any[]) => {
  const len: i32 = _this.length;

  let start: i32 = 0;
  let end: i32 = len - 1;

  while (start < end) {
    const tmp: i32 = _this[start];
    _this[start++] = _this[end];
    _this[end--] = tmp;
  }

  return _this;
};


// @porf-typed-array
export const __Array_prototype_forEach = (_this: any[], callbackFn: any, thisArg: any) => {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    callbackFn.call(thisArg, _this[i], i++, _this);
  }
};

// @porf-typed-array
export const __Array_prototype_filter = (_this: any[], callbackFn: any, thisArg: any) => {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const out: any[] = Porffor.allocate();

  const len: i32 = _this.length;
  let i: i32 = 0;
  let j: i32 = 0;
  while (i < len) {
    const el: any = _this[i];
    if (!!callbackFn.call(thisArg, el, i++, _this)) out[j++] = el;
  }

  out.length = j;
  return out;
};

// @porf-typed-array
export const __Array_prototype_map = (_this: any[], callbackFn: any, thisArg: any) => {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = _this.length;
  const out: any[] = Porffor.allocate();
  out.length = len;

  let i: i32 = 0;
  while (i < len) {
    out[i] = callbackFn.call(thisArg, _this[i], i++, _this);
  }

  return out;
};

export const __Array_prototype_flatMap = (_this: any[], callbackFn: any, thisArg: any) => {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = _this.length;
  const out: any[] = Porffor.allocate();

  let i: i32 = 0, j: i32 = 0;
  while (i < len) {
    let x: any = callbackFn.call(thisArg, _this[i], i++, _this);
    if (Porffor.type(x) == Porffor.TYPES.array) {
      for (const y of x) out[j++] = y;
    } else out[j++] = x;
  }

  out.length = j;
  return out;
};

// @porf-typed-array
export const __Array_prototype_find = (_this: any[], callbackFn: any, thisArg: any) => {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    const el: any = _this[i];
    if (!!callbackFn.call(thisArg, el, i++, _this)) return el;
  }
};

// @porf-typed-array
export const __Array_prototype_findLast = (_this: any[], callbackFn: any, thisArg: any) => {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  let i: i32 = _this.length;
  while (i > 0) {
    const el: any = _this[--i];
    if (!!callbackFn.call(thisArg, el, i, _this)) return el;
  }
};

// @porf-typed-array
export const __Array_prototype_findIndex = (_this: any[], callbackFn: any, thisArg: any) => {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    if (!!callbackFn.call(thisArg, _this[i], i, _this)) return i;
    i++;
  }
};

// @porf-typed-array
export const __Array_prototype_findLastIndex = (_this: any[], callbackFn: any, thisArg: any) => {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  let i: i32 = _this.length;
  while (i > 0) {
    if (!!callbackFn.call(thisArg, _this[--i], i, _this)) return i;
  }
};

// @porf-typed-array
export const __Array_prototype_every = (_this: any[], callbackFn: any, thisArg: any) => {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    if (!!callbackFn.call(thisArg, _this[i], i++, _this)) {}
      else return false;
  }

  return true;
};

// @porf-typed-array
export const __Array_prototype_some = (_this: any[], callbackFn: any, thisArg: any) => {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    if (!!callbackFn.call(thisArg, _this[i], i++, _this)) return true;
  }

  return false;
};

// @porf-typed-array
export const __Array_prototype_reduce = (_this: any[], callbackFn: any, initialValue: any) => {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = _this.length;
  let acc: any = initialValue;
  let i: i32 = 0;
  if (acc === undefined) {
    if (len == 0) throw new TypeError('Reduce of empty array with no initial value');
    acc = _this[i++];
  }

  while (i < len) {
    acc = callbackFn(acc, _this[i], i++, _this);
  }

  return acc;
};

// @porf-typed-array
export const __Array_prototype_reduceRight = (_this: any[], callbackFn: any, initialValue: any) => {
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');
  const len: i32 = _this.length;
  let acc: any = initialValue;
  let i: i32 = len;
  if (acc === undefined) {
    if (len == 0) throw new TypeError('Reduce of empty array with no initial value');
    acc = _this[--i];
  }

  while (i > 0) {
    acc = callbackFn(acc, _this[--i], i, _this);
  }

  return acc;
};

// string less than <
export const __Porffor_strlt = (a: string|bytestring, b: string|bytestring) => {
  const maxLength: i32 = Math.max(a.length, b.length);
  for (let i: i32 = 0; i < maxLength; i++) {
    const ac: i32 = a.charCodeAt(i);
    const bc: i32 = b.charCodeAt(i);

    if (ac < bc) return true;
  }

  return false;
};

// @porf-typed-array
export const __Array_prototype_sort = (_this: any[], callbackFn: any) => {
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

  // insertion sort, i guess
  const len: i32 = _this.length;
  for (let i: i32 = 0; i < len; i++) {
    const x: any = _this[i];
    let j: i32 = i;
    while (j > 0) {
      const y: any = _this[j - 1];

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
      _this[j--] = y;
    }

    _this[j] = x;
  }

  return _this;
};

// @porf-typed-array
export const __Array_prototype_toString = (_this: any[]) => {
  // todo: this is bytestring only!

  let out: bytestring = Porffor.allocate();
  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    if (i > 0) Porffor.bytestring.appendChar(out, 44);

    const element: any = _this[i++];
    if (element != 0 || Porffor.fastAnd(
      Porffor.type(element) != Porffor.TYPES.undefined, // undefined
      Porffor.type(element) != Porffor.TYPES.object // null
    )) {
      Porffor.bytestring.appendStr(out, ecma262.ToString(element));
    }
  }

  return out;
};

// @porf-typed-array
export const __Array_prototype_toLocaleString = (_this: any[]) => __Array_prototype_toString(_this);

// @porf-typed-array
export const __Array_prototype_join = (_this: any[], _separator: any) => {
  // todo: this is bytestring only!
  // todo/perf: optimize single char separators
  // todo/perf: optimize default separator (?)

  let separator: bytestring = ',';
  if (Porffor.type(_separator) != Porffor.TYPES.undefined)
    separator = ecma262.ToString(_separator);

  let out: bytestring = Porffor.allocate();
  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    if (i > 0) Porffor.bytestring.appendStr(out, separator);

    const element: any = _this[i++];
    if (element != 0 || Porffor.fastAnd(
      Porffor.type(element) != Porffor.TYPES.undefined, // undefined
      Porffor.type(element) != Porffor.TYPES.object // null
    )) {
      Porffor.bytestring.appendStr(out, ecma262.ToString(element));
    }
  }

  return out;
};

// @porf-typed-array
export const __Array_prototype_valueOf = (_this: any[]) => {
  return _this;
};

// @porf-typed-array
export const __Array_prototype_toReversed = (_this: any[]) => {
  const len: i32 = _this.length;

  let start: i32 = 0;
  let end: i32 = len - 1;

  let out: any[] = Porffor.allocate();
  out.length = len;

  while (true) {
    out[start] = _this[end];
    if (start >= end) {
      break;
    }
    out[end--] = _this[start++];
  }

  return out;
};

// @porf-typed-array
export const __Array_prototype_toSorted = (_this: any[], callbackFn: any) => {
  // todo/perf: could be rewritten to be its own instead of cloning and using normal sort()

  let out: any[] = Porffor.allocate();
  Porffor.clone(_this, out);

  return __Array_prototype_sort(out, callbackFn);
};

export const __Array_prototype_toSpliced = (_this: any[], _start: any, _deleteCount: any, ...items: any[]) => {
  let out: any[] = Porffor.allocate();
  Porffor.clone(_this, out);

  const len: i32 = _this.length;

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

  // update this length
  const itemsLen: i32 = items.length;
  out.length = len - deleteCount + itemsLen;

  // remove deleted values via memory.copy shifting values in mem
  Porffor.wasm`;; ptr = ptr(_this) + 4 + (start * 9)
local #splice_ptr i32
local.get ${out}
i32.to_u
i32.const 4
i32.add
local.get ${start}
i32.to_u
i32.const 9
i32.mul
i32.add
local.set #splice_ptr

;; dst = ptr + itemsLen * 9
local.get #splice_ptr
local.get ${itemsLen}
i32.to_u
i32.const 9
i32.mul
i32.add

;; src = ptr + deleteCount * 9
local.get #splice_ptr
local.get ${deleteCount}
i32.to_u
i32.const 9
i32.mul
i32.add

;; size = (len - start - deleteCount) * 9
local.get ${len}
i32.to_u
local.get ${start}
i32.to_u
local.get ${deleteCount}
i32.to_u
i32.sub
i32.sub
i32.const 9
i32.mul

memory.copy 0 0`;

  if (itemsLen > 0) {
    let itemsPtr: i32 = Porffor.wasm`local.get ${items}`;
    let outPtr: i32 = Porffor.wasm`local.get ${out}` + start * 9;
    let outPtrEnd: i32 = outPtr + itemsLen * 9;

    while (outPtr < outPtrEnd) {
      Porffor.wasm.f64.store(outPtr, Porffor.wasm.f64.load(itemsPtr, 0, 4), 0, 4);
      Porffor.wasm.i32.store8(outPtr, Porffor.wasm.i32.load8_u(itemsPtr, 0, 12), 0, 12);

      outPtr += 9;
      itemsPtr += 9;
    }
  }

  return out;
};


export const __Array_prototype_flat = (_this: any[], _depth: any) => {
  if (Porffor.type(_depth) == Porffor.TYPES.undefined) _depth = 1;
  let depth: i32 = ecma262.ToIntegerOrInfinity(_depth);

  let out: any[] = Porffor.allocate();
  if (depth <= 0) {
    Porffor.clone(_this, out);
    return out;
  }

  const len: i32 = _this.length;
  let i: i32 = 0, j: i32 = 0;
  while (i < len) {
    let x: any = _this[i++];
    if (Porffor.type(x) == Porffor.TYPES.array) {
      if (depth > 1) x = __Array_prototype_flat(x, depth - 1);
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

export const __Porffor_array_fastIndexOf = (arr: any[], el: number): i32 => {
  const len: i32 = arr.length;
  for (let i: i32 = 0; i < len; i++) {
    if (arr[i] == el) return i;
  }

  return -1;
};

// functional to arr.splice(i, 1)
export const __Porffor_array_fastRemove = (arr: any[], i: i32, len: i32): void => {
  arr.length = len - 1;

  // offset all elements after by -1 ind
  Porffor.wasm`
local offset i32
local.get ${i}
i32.to_u
i32.const 9
i32.mul
local.get ${arr}
i32.to_u
i32.add
i32.const 4
i32.add
local.set offset

;; dst = offset (this element)
local.get offset

;; src = offset + 9 (this element + 1 element)
local.get offset
i32.const 9
i32.add

;; size = (size - i - 1) * 9
local.get ${len}
local.get ${i}
f64.sub
i32.to_u
i32.const 1
i32.sub
i32.const 9
i32.mul

memory.copy 0 0`;
};