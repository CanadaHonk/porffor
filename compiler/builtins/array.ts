import type {} from './porffor.d.ts';

export const __Array_isArray = (x: unknown): boolean =>
  // Porffor.wasm`local.get ${x+1}` == Porffor.TYPES.array;
  Porffor.rawType(x) == Porffor.TYPES.array;


export const __Array_prototype_slice = (_this: any[], start: number, end: number) => {
  const len: i32 = _this.length;
  if (Porffor.rawType(end) == Porffor.TYPES.undefined) end = len;

  start |= 0;
  end |= 0;

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
    Porffor.wasm.i32.store8(outPtr + 8, Porffor.wasm.i32.load8_u(thisPtr + 8, 0, 4), 0, 4);

    thisPtr += 9;
    outPtr += 9;
  }

  out.length = end - start;
  return out;
};

// @porf-typed-array
export const __Array_prototype_fill = (_this: any[], value: any, start: any, end: any) => {
  const len: i32 = _this.length;

  if (Porffor.rawType(start) == Porffor.TYPES.undefined) start = 0;
  if (Porffor.rawType(end) == Porffor.TYPES.undefined) end = len;

  start |= 0;
  end |= 0;

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
export const __Array_prototype_indexOf = (_this: any[], searchElement: any, position: number) => {
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
      else position |= 0;
  } else position = 0;

  for (let i: i32 = position; i < len; i++) {
    if (_this[i] === searchElement) return i;
  }

  return -1;
};

// @porf-typed-array
export const __Array_prototype_lastIndexOf = (_this: any[], searchElement: any, position: number) => {
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
      else position |= 0;
  } else position = 0;

  for (let i: i32 = len - 1; i >= position; i--) {
    if (_this[i] === searchElement) return i;
  }

  return -1;
};

// @porf-typed-array
export const __Array_prototype_includes = (_this: any[], searchElement: any, position: number) => {
  const len: i32 = _this.length;
  if (position > 0) {
    if (position > len) position = len;
      else position |= 0;
  } else position = 0;

  for (let i: i32 = position; i < len; i++) {
    if (_this[i] === searchElement) return true;
  }

  return false;
};

// @porf-typed-array
export const __Array_prototype_with = (_this: any[], index: number, value: any) => {
  const len: i32 = _this.length;
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
export const __Array_prototype_toReversed = (_this: any[]) => {
  const len: i32 = _this.length;

  let start: i32 = 0;
  let end: i32 = len - 1;

  let out: any[] = Porffor.allocate();
  out.length = len;

  while (start < end) {
    out[start] = _this[end];
    out[end--] = _this[start++];
  }

  return out;
};

// @porf-typed-array
export const __Array_prototype_valueOf = (_this: any[]) => {
  return _this;
};


// @porf-typed-array
export const __Array_prototype_forEach = (_this: any[], callbackFn: any) => {
  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    callbackFn(_this[i], i++, _this);
  }
};

// @porf-typed-array
export const __Array_prototype_filter = (_this: any[], callbackFn: any) => {
  const out: any[] = Porffor.allocate();

  const len: i32 = _this.length;
  let i: i32 = 0;
  let j: i32 = 0;
  while (i < len) {
    const el: any = _this[i];
    if (Boolean(callbackFn(el, i++, _this))) out[j++] = el;
  }

  out.length = j;
  return out;
};

// @porf-typed-array
export const __Array_prototype_map = (_this: any[], callbackFn: any) => {
  const len: i32 = _this.length;
  const out: any[] = Porffor.allocate();
  out.length = len;

  let i: i32 = 0;
  while (i < len) {
    out[i] = callbackFn(_this[i], i++, _this);
  }

  return out;
};

// @porf-typed-array
export const __Array_prototype_find = (_this: any[], callbackFn: any) => {
  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    const el: any = _this[i];
    if (Boolean(callbackFn(el, i++, _this))) return el;
  }
};

// @porf-typed-array
export const __Array_prototype_findLast = (_this: any[], callbackFn: any) => {
  let i: i32 = _this.length;
  while (i > 0) {
    const el: any = _this[--i];
    if (Boolean(callbackFn(el, i, _this))) return el;
  }
};

// @porf-typed-array
export const __Array_prototype_findIndex = (_this: any[], callbackFn: any) => {
  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    if (Boolean(callbackFn(_this[i], i++, _this))) return i;
  }
};

// @porf-typed-array
export const __Array_prototype_findLastIndex = (_this: any[], callbackFn: any) => {
  let i: i32 = _this.length;
  while (i > 0) {
    if (Boolean(callbackFn(_this[--i], i, _this))) return i;
  }
};

// @porf-typed-array
export const __Array_prototype_every = (_this: any[], callbackFn: any) => {
  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    if (!Boolean(callbackFn(_this[i], i++, _this))) return false;
  }

  return true;
};

// @porf-typed-array
export const __Array_prototype_some = (_this: any[], callbackFn: any) => {
  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    if (Boolean(callbackFn(_this[i], i++, _this))) return true;
  }

  return false;
};

// @porf-typed-array
export const __Array_prototype_reduce = (_this: any[], callbackFn: any, initialValue: any) => {
  let acc: any = initialValue ?? _this[0];

  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    acc = callbackFn(acc, _this[i], i++, _this);
  }

  return acc;
};

// @porf-typed-array
export const __Array_prototype_reduceRight = (_this: any[], callbackFn: any, initialValue: any) => {
  const len: i32 = _this.length;
  let acc: any = initialValue ?? _this[len - 1];

  let i: i32 = len;
  while (i > 0) {
    acc = callbackFn(acc, _this[--i], i, _this);
  }

  return acc;
};

// @porf-typed-array
export const __Array_prototype_sort = (_this: any[], callbackFn: any) => {
  // todo: default callbackFn

  // insertion sort, i guess
  const len: i32 = _this.length;
  for (let i: i32 = 0; i < len; i++) {
    const x: any = _this[i];
    let j: i32 = i;
    while (j > 0) {
      const y: any = _this[j - 1];

      // 23.1.3.30.2 CompareArrayElements (x, y, comparefn)
      // https://tc39.es/ecma262/#sec-comparearrayelements
      const xt: i32 = Porffor.rawType(x);
      const yt: i32 = Porffor.rawType(y);
      let v: number;

      // 1. If x and y are both undefined, return +0𝔽.
      if (xt == Porffor.TYPES.undefined && yt == Porffor.TYPES.undefined) v = 0;
        // 2. If x is undefined, return 1𝔽.
        else if (xt == Porffor.TYPES.undefined) v = 1;
        // 3. If y is undefined, return -1𝔽.
        else if (yt == Porffor.TYPES.undefined) v = -1;
        else {
          // 4. If comparefn is not undefined, then
          // a. Let v be ? ToNumber(? Call(comparefn, undefined, « x, y »)).
          v = callbackFn(x, y);

          // b. If v is NaN, return +0𝔽.
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

  let out: bytestring = Porffor.bs``;
  out.length = 0;

  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    if (i > 0) Porffor.bytestring.appendChar(out, 44);

    const element: any = _this[i++];
    const type: i32 = Porffor.rawType(element);
    if (element != 0 || Porffor.fastAnd(
      type != Porffor.TYPES.undefined, // undefined
      type != Porffor.TYPES.object // null
    )) {
      Porffor.bytestring.appendStr(out, ecma262.ToString(element));
    }
  }

  return out;
};

// @porf-typed-array
export const __Array_prototype_join = (_this: any[], _separator: any) => {
  // todo: this is bytestring only!
  // todo/perf: optimize single char separators
  // todo/perf: optimize default separator (?)

  let separator: bytestring = ',';
  if (Porffor.rawType(_separator) != Porffor.TYPES.undefined)
    separator = ecma262.ToString(_separator);

  let out: bytestring = Porffor.bs``;
  out.length = 0;

  const len: i32 = _this.length;
  let i: i32 = 0;
  while (i < len) {
    if (i > 0) Porffor.bytestring.appendStr(out, separator);

    const element: any = _this[i++];
    const type: i32 = Porffor.rawType(element);
    if (element != 0 || Porffor.fastAnd(
      type != Porffor.TYPES.undefined, // undefined
      type != Porffor.TYPES.object // null
    )) {
      Porffor.bytestring.appendStr(out, ecma262.ToString(element));
    }
  }

  return out;
};