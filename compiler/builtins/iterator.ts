import type {} from './porffor.d.ts';

// https://tc39.es/ecma262/#sec-iterator-objects
// iterator records are generator.ts's [ iterator, next, done, kind ] arrays, always kind 1 here

export const Iterator = function (): any {
  if (Porffor.fastOr(new.target === undefined, new.target === Iterator)) throw new TypeError('Iterator is an abstract class');
  if (Porffor.object.isObject(this)) return this;

  const obj: object = {};
  let proto: any = new.target.prototype;
  if (!Porffor.object.isObject(proto)) proto = __Iterator_prototype;
  Porffor.object.setPrototype(obj, proto);
  return obj;
};

// GetIteratorDirect
export const __Porffor_iterator_direct = (obj: any): any[] => {
  if (!Porffor.object.isObject(obj)) throw new TypeError('Iterator is not an object');
  return __Porffor_iterator_new(obj, obj.next, 1);
};

// GetIteratorFlattenable
export const __Porffor_iterator_flattenable = (obj: any, allowStrings: boolean): any[] => {
  if (!Porffor.object.isObject(obj)) {
    const t: i32 = Porffor.type(obj);
    if (Porffor.fastOr(!allowStrings, Porffor.fastAnd(t != Porffor.TYPES.string, t != Porffor.TYPES.bytestring))) throw new TypeError('Value is not an iterable object');
  }

  let iter: any = obj;
  const method: any = obj[Symbol.iterator];
  if (Porffor.fastAnd(method !== undefined, method !== null)) {
    if (Porffor.type(method) != Porffor.TYPES.function) throw new TypeError('Symbol.iterator is not a function');
    iter = method.call(obj);
  }

  return __Porffor_iterator_direct(iter);
};

// IteratorClose with a throw completion, the caller rethrows
export const __Porffor_iterator_closeThrow = (rec: any[]): void => {
  try {
    __Porffor_iterator_close(rec);
  } catch (e) {}
};

// an argument check failing before GetIteratorDirect still closes the underlying iterator
export const __Porffor_iterator_closeObject = (obj: any): void => {
  __Porffor_iterator_closeThrow(__Porffor_iterator_new(obj, undefined, 1));
};

export const __Porffor_iterator_result = (value: any, done: boolean): object => {
  const out: object = {};
  out.value = value;
  out.done = done;
  return out;
};

// SetterThatIgnoresPrototypeProperties
export const __Porffor_iterator_setIgnoringProto = (obj: any, home: any, key: any, value: any): void => {
  if (!Porffor.object.isObject(obj)) throw new TypeError('Setter called on non-object');
  if (obj === home) throw new TypeError('Cannot assign to read only property');

  if (!__Object_hasOwn(obj, key)) {
    const desc: object = {};
    desc.value = value;
    desc.writable = true;
    desc.enumerable = true;
    desc.configurable = true;
    __Object_defineProperty(obj, key, desc);
  } else {
    obj[key] = value;
  }
};

export const __Iterator_prototype_Symbol_iterator = function (this: any): any {
  return this;
};

export const __Iterator_prototype_Symbol_toStringTag$get = function (this: any): any {
  return 'Iterator';
};

export const __Iterator_prototype_Symbol_toStringTag$set = function (this: any, value: any): void {
  __Porffor_iterator_setIgnoringProto(this, __Iterator_prototype, Symbol.toStringTag, value);
};

export const __Iterator_prototype_constructor$get = function (this: any): any {
  return Iterator;
};

export const __Iterator_prototype_constructor$set = function (this: any, value: any): void {
  __Porffor_iterator_setIgnoringProto(this, __Iterator_prototype, 'constructor', value);
};

export const __Iterator_prototype_Symbol_dispose = function (this: any): void {
  const ret: any = this.return;
  if (Porffor.fastAnd(ret !== undefined, ret !== null)) {
    if (Porffor.type(ret) != Porffor.TYPES.function) throw new TypeError('Iterator return is not a function');
    ret.call(this);
  }
};


// %IteratorHelperPrototype%: [ state (0 start, 1 yield, 2 running, 3 done), step (one func per kind), iterated, fn, counter or remaining, inner, extra ]
export const __Porffor_IteratorHelper_new = (step: any, rec: any, fn: any, counter: any): __Porffor_IteratorHelper => {
  const h: any[] = Porffor.array.new(7);
  h[0] = 0;
  h[1] = step;
  h[2] = rec;
  h[3] = fn;
  h[4] = counter;
  h[5] = undefined;
  h[6] = undefined;
  return Porffor.as(h, Porffor.TYPES.__porffor_iteratorhelper);
};

// IteratorCloseAll: closes in reverse, the first error wins (done records are skipped)
export const __Porffor_iterator_closeAll = (iters: any[], hasError: boolean, error: any): void => {
  for (let i: i32 = iters.length - 1; i >= 0; i--) {
    try {
      __Porffor_iterator_close(iters[i]);
    } catch (e) {
      if (!hasError) {
        hasError = true;
        error = e;
      }
    }
  }

  if (hasError) throw error;
};

export const __Porffor_IteratorHelper_map = (h: any[]): any => {
  const rec: any[] = h[2];
  const value: any = __Porffor_iterator_step(rec);
  if (rec[2]) {
    h[0] = 3;
    return undefined;
  }

  const fn: any = h[3];
  let mapped: any;
  try {
    mapped = fn(value, h[4]);
  } catch (e) {
    __Porffor_iterator_closeThrow(rec);
    throw e;
  }
  h[4] = h[4] + 1;
  return mapped;
};

export const __Porffor_IteratorHelper_filter = (h: any[]): any => {
  const rec: any[] = h[2];
  const fn: any = h[3];
  while (true) {
    const value: any = __Porffor_iterator_step(rec);
    if (rec[2]) {
      h[0] = 3;
      return undefined;
    }

    let selected: any;
    try {
      selected = fn(value, h[4]);
    } catch (e) {
      __Porffor_iterator_closeThrow(rec);
      throw e;
    }
    h[4] = h[4] + 1;
    if (selected) return value;
  }
};

export const __Porffor_IteratorHelper_take = (h: any[]): any => {
  const rec: any[] = h[2];
  const remaining: number = h[4];
  if (remaining == 0) {
    h[0] = 3;
    __Porffor_iterator_close(rec);
    return undefined;
  }
  if (remaining != Infinity) h[4] = remaining - 1;

  const value: any = __Porffor_iterator_step(rec);
  if (rec[2]) h[0] = 3;
  return value;
};

export const __Porffor_IteratorHelper_drop = (h: any[]): any => {
  const rec: any[] = h[2];
  while (h[4] > 0) {
    if (h[4] != Infinity) h[4] = h[4] - 1;
    __Porffor_iterator_next(rec);
    if (rec[2]) {
      h[0] = 3;
      return undefined;
    }
  }

  const value: any = __Porffor_iterator_step(rec);
  if (rec[2]) h[0] = 3;
  return value;
};

export const __Porffor_IteratorHelper_flatMap = (h: any[]): any => {
  const rec: any[] = h[2];
  const fn: any = h[3];
  while (true) {
    const inner: any = h[5];
    if (inner !== undefined) {
      let value: any;
      try {
        value = __Porffor_iterator_step(inner);
      } catch (e) {
        __Porffor_iterator_closeThrow(rec);
        throw e;
      }
      if (!inner[2]) return value;
      h[5] = undefined;
    }

    const value: any = __Porffor_iterator_step(rec);
    if (rec[2]) {
      h[0] = 3;
      return undefined;
    }

    try {
      h[5] = __Porffor_iterator_flattenable(fn(value, h[4]), false);
    } catch (e) {
      __Porffor_iterator_closeThrow(rec);
      throw e;
    }
    h[4] = h[4] + 1;
  }
};

// fn: [ method, iterable, ... ], counter: next index
export const __Porffor_IteratorHelper_concat = (h: any[]): any => {
  const list: any[] = h[3];
  while (true) {
    const inner: any = h[5];
    if (inner !== undefined) {
      const value: any = __Porffor_iterator_step(inner);
      if (!inner[2]) return value;
      h[5] = undefined;
    }

    const i: i32 = h[4];
    if (i >= list.length) {
      h[0] = 3;
      return undefined;
    }
    h[4] = i + 2;

    const method: any = list[i];
    const iter: any = method.call(list[i + 1]);
    if (!Porffor.object.isObject(iter)) throw new TypeError('Iterator is not an object');
    h[5] = __Porffor_iterator_direct(iter);
  }
};

export const __Porffor_IteratorHelper_record = (helper: any): any[] => {
  if (Porffor.type(helper) != Porffor.TYPES.__porffor_iteratorhelper) throw new TypeError('Iterator helper method called on incompatible receiver');
  const h: any[] = Porffor.as(helper, Porffor.TYPES.array);
  if (h[0] == 2) throw new TypeError('Iterator helper is already running');
  return h;
};

export const __Porffor_IteratorHelper_prototype_next = function (this: any): object {
  const h: any[] = __Porffor_IteratorHelper_record(this);
  if (h[0] == 3) return __Porffor_iterator_result(undefined, true);

  h[0] = 2;
  const step: any = h[1];
  let value: any;
  try {
    value = step(h);
  } catch (e) {
    h[0] = 3;
    throw e;
  }

  if (h[0] == 3) return __Porffor_iterator_result(undefined, true);
  h[0] = 1;
  return __Porffor_iterator_result(value, false);
};

// closes inner (flatMap, concat) then iterated, zip closes all of inner (a list, extra set)
export const __Porffor_IteratorHelper_prototype_return = function (this: any): object {
  const h: any[] = __Porffor_IteratorHelper_record(this);
  const state: i32 = h[0];
  if (state != 3) {
    h[0] = state == 0 ? 3 : 2;
    const rec: any = h[2];
    const inner: any = h[5];
    try {
      if (h[6] !== undefined) {
        __Porffor_iterator_closeAll(inner, false, undefined);
      } else {
        if (inner !== undefined) {
          try {
            __Porffor_iterator_close(inner);
          } catch (e) {
            if (rec !== undefined) __Porffor_iterator_closeThrow(rec);
            throw e;
          }
        }
        if (rec !== undefined) __Porffor_iterator_close(rec);
      }
    } catch (e) {
      h[0] = 3;
      throw e;
    }
    h[0] = 3;
  }

  return __Porffor_iterator_result(undefined, true);
};


// argument checks close the receiver before GetIteratorDirect
export const __Porffor_iterator_checkCallable = (obj: any, fn: any): void => {
  if (!Porffor.object.isObject(obj)) throw new TypeError('Iterator helper called on non-object');
  if (Porffor.type(fn) != Porffor.TYPES.function) {
    __Porffor_iterator_closeObject(obj);
    throw new TypeError('Iterator helper argument is not a function');
  }
};

export const __Porffor_iterator_limit = (obj: any, limit: any): number => {
  if (!Porffor.object.isObject(obj)) throw new TypeError('Iterator helper called on non-object');

  let num: number;
  try {
    num = ecma262.ToNumber(limit);
  } catch (e) {
    __Porffor_iterator_closeObject(obj);
    throw e;
  }

  const int: number = ecma262.ToIntegerOrInfinity(num);
  if (Porffor.fastOr(num != num, int < 0)) {
    __Porffor_iterator_closeObject(obj);
    throw new RangeError('Iterator limit must be a non-negative number');
  }

  return int;
};

export const __Iterator_prototype_map = function (this: any, mapper: any): any {
  __Porffor_iterator_checkCallable(this, mapper);
  return __Porffor_IteratorHelper_new(__Porffor_IteratorHelper_map, __Porffor_iterator_direct(this), mapper, 0);
};

export const __Iterator_prototype_filter = function (this: any, predicate: any): any {
  __Porffor_iterator_checkCallable(this, predicate);
  return __Porffor_IteratorHelper_new(__Porffor_IteratorHelper_filter, __Porffor_iterator_direct(this), predicate, 0);
};

export const __Iterator_prototype_take = function (this: any, limit: any): any {
  const remaining: number = __Porffor_iterator_limit(this, limit);
  return __Porffor_IteratorHelper_new(__Porffor_IteratorHelper_take, __Porffor_iterator_direct(this), undefined, remaining);
};

export const __Iterator_prototype_drop = function (this: any, limit: any): any {
  const remaining: number = __Porffor_iterator_limit(this, limit);
  return __Porffor_IteratorHelper_new(__Porffor_IteratorHelper_drop, __Porffor_iterator_direct(this), undefined, remaining);
};

export const __Iterator_prototype_flatMap = function (this: any, mapper: any): any {
  __Porffor_iterator_checkCallable(this, mapper);
  return __Porffor_IteratorHelper_new(__Porffor_IteratorHelper_flatMap, __Porffor_iterator_direct(this), mapper, 0);
};


export const __Iterator_prototype_reduce = function (this: any, reducer: any, ...initial: any[]): any {
  __Porffor_iterator_checkCallable(this, reducer);
  const rec: any[] = __Porffor_iterator_direct(this);

  let acc: any;
  let counter: number = 0;
  if (initial.length == 0) {
    acc = __Porffor_iterator_step(rec);
    if (rec[2]) throw new TypeError('Reduce of empty iterator with no initial value');
    counter = 1;
  } else {
    acc = initial[0];
  }

  while (true) {
    const value: any = __Porffor_iterator_step(rec);
    if (rec[2]) return acc;

    try {
      acc = reducer(acc, value, counter);
    } catch (e) {
      __Porffor_iterator_closeThrow(rec);
      throw e;
    }
    counter++;
  }
};

export const __Iterator_prototype_toArray = function (this: any): any[] {
  if (!Porffor.object.isObject(this)) throw new TypeError('Iterator helper called on non-object');
  const rec: any[] = __Porffor_iterator_direct(this);
  const out: any[] = Porffor.array.new(4);
  while (true) {
    const value: any = __Porffor_iterator_step(rec);
    if (rec[2]) return out;
    Porffor.array.fastPush(out, value);
  }
};

export const __Iterator_prototype_forEach = function (this: any, fn: any): void {
  __Porffor_iterator_checkCallable(this, fn);
  const rec: any[] = __Porffor_iterator_direct(this);

  let counter: number = 0;
  while (true) {
    const value: any = __Porffor_iterator_step(rec);
    if (rec[2]) return;

    try {
      fn(value, counter);
    } catch (e) {
      __Porffor_iterator_closeThrow(rec);
      throw e;
    }
    counter++;
  }
};

// mode: 0 some, 1 every, 2 find
export const __Porffor_iterator_search = (obj: any, predicate: any, mode: i32): any => {
  __Porffor_iterator_checkCallable(obj, predicate);
  const rec: any[] = __Porffor_iterator_direct(obj);

  let counter: number = 0;
  while (true) {
    const value: any = __Porffor_iterator_step(rec);
    if (rec[2]) return mode == 1 ? true : (mode == 0 ? false : undefined);

    let result: boolean;
    try {
      result = !!predicate(value, counter);
    } catch (e) {
      __Porffor_iterator_closeThrow(rec);
      throw e;
    }

    if (result != (mode == 1)) {
      __Porffor_iterator_close(rec);
      return mode == 2 ? value : result;
    }
    counter++;
  }
};

export const __Iterator_prototype_some = function (this: any, predicate: any): boolean {
  return __Porffor_iterator_search(this, predicate, 0);
};

export const __Iterator_prototype_every = function (this: any, predicate: any): boolean {
  return __Porffor_iterator_search(this, predicate, 1);
};

export const __Iterator_prototype_find = function (this: any, predicate: any): any {
  return __Porffor_iterator_search(this, predicate, 2);
};


// %WrapForValidIteratorPrototype%: [ iterator, next ]
export const __Iterator_from = (obj: any): any => {
  const rec: any[] = __Porffor_iterator_flattenable(obj, true);
  const iter: any = rec[0];

  // OrdinaryHasInstance(%Iterator%, iter)
  let proto: any = Porffor.object.getPrototypeWithHidden(iter, Porffor.type(iter));
  while (proto != null) {
    if (proto === __Iterator_prototype) return iter;
    proto = Porffor.object.getPrototypeWithHidden(proto, Porffor.type(proto));
  }

  return __Porffor_WrapForValidIterator_new(iter, rec[1]);
};

export const __Porffor_WrapForValidIterator_new = (iter: any, next: any): __Porffor_WrapForValidIterator => {
  const wrapper: any[] = Porffor.array.new(2);
  wrapper[0] = iter;
  wrapper[1] = next;
  return Porffor.as(wrapper, Porffor.TYPES.__porffor_wrapforvaliditerator);
};

export const __Porffor_WrapForValidIterator_record = (wrapper: any): any[] => {
  if (Porffor.type(wrapper) != Porffor.TYPES.__porffor_wrapforvaliditerator) throw new TypeError('Iterator wrapper method called on incompatible receiver');
  return Porffor.as(wrapper, Porffor.TYPES.array);
};

export const __Porffor_WrapForValidIterator_prototype_next = function (this: any): any {
  const w: any[] = __Porffor_WrapForValidIterator_record(this);
  const next: any = w[1];
  return next.call(w[0]);
};

export const __Porffor_WrapForValidIterator_prototype_return = function (this: any): any {
  const w: any[] = __Porffor_WrapForValidIterator_record(this);
  const iter: any = w[0];
  const ret: any = iter.return;
  if (Porffor.fastOr(ret === undefined, ret === null)) return __Porffor_iterator_result(undefined, true);
  if (Porffor.type(ret) != Porffor.TYPES.function) throw new TypeError('Iterator return is not a function');
  return ret.call(iter);
};


// builtin iterators step their source in place: [ source, index, done, 0, prev, depth, kind (0 iteration values, 1 keys, 2 values, 3 entries) ]
export const __Porffor_iterator_inPlaceRecord = (iter: any, kind: i32): any[] => {
  const rec: any[] = Porffor.array.new(7);
  rec[0] = iter;
  rec[1] = 0;
  rec[2] = false;
  rec[3] = 0;
  rec[4] = undefined;
  rec[5] = undefined;
  rec[6] = kind;
  return rec;
};

export const __Porffor_ArrayIterator_new = (iter: any, kind: i32): __Porffor_ArrayIterator => Porffor.as(__Porffor_iterator_inPlaceRecord(iter, kind), Porffor.TYPES.__porffor_arrayiterator);
export const __Porffor_MapIterator_new = (iter: any, kind: i32): __Porffor_MapIterator => Porffor.as(__Porffor_iterator_inPlaceRecord(iter, kind), Porffor.TYPES.__porffor_mapiterator);
export const __Porffor_SetIterator_new = (iter: any, kind: i32): __Porffor_SetIterator => Porffor.as(__Porffor_iterator_inPlaceRecord(iter, kind), Porffor.TYPES.__porffor_setiterator);
export const __Porffor_StringIterator_new = (iter: any): __Porffor_StringIterator => Porffor.as(__Porffor_iterator_inPlaceRecord(iter, 0), Porffor.TYPES.__porffor_stringiterator);

export const __Porffor_iterator_inPlaceNext = (iter: any, type: i32): object => {
  if (Porffor.type(iter) != type) throw new TypeError('Iterator next called on incompatible receiver');
  const rec: any[] = Porffor.as(iter, Porffor.TYPES.array);
  const src: any = rec[0];
  const kind: i32 = rec[6];

  let value: any = undefined;
  const t: i32 = Porffor.type(src);
  if (__Porffor_iterator_inPlace(t)) {
    if (Porffor.fastAnd(t >= Porffor.TYPES.uint8clampedarray, t <= Porffor.TYPES.float64array, !rec[2]))
      if (__Porffor_typedArray_detached(src)) throw new TypeError('Typed array is detached');
    value = __Porffor_iterator_step(rec);
  } else if (!rec[2]) {
    // array-like: LengthOfArrayLike is read every step
    let len: number = ecma262.ToIntegerOrInfinity(__Porffor_object_get(src, 'length'));
    if (len > 9007199254740991) len = 9007199254740991;
    const index: number = rec[1];
    if (index >= len) {
      rec[2] = true;
    } else {
      rec[1] = index + 1;
      if (kind != 1) value = src[index];
    }
  }

  if (Porffor.fastAnd(kind != 0, !rec[2])) {
    if (Porffor.type(src) == Porffor.TYPES.map) {
      value = value[kind - 1];
    } else {
      const key: any = Porffor.type(src) == Porffor.TYPES.set ? value : rec[1] - 1;
      if (kind == 1) {
        value = key;
      } else {
        const entry: any[] = Porffor.array.new(2);
        entry[0] = key;
        entry[1] = value;
        value = entry;
      }
    }
  }

  return __Porffor_iterator_result(value, rec[2]);
};

export const __Porffor_ArrayIterator_prototype_next = function (this: any): object {
  return __Porffor_iterator_inPlaceNext(this, Porffor.TYPES.__porffor_arrayiterator);
};

export const __Porffor_MapIterator_prototype_next = function (this: any): object {
  return __Porffor_iterator_inPlaceNext(this, Porffor.TYPES.__porffor_mapiterator);
};

export const __Porffor_SetIterator_prototype_next = function (this: any): object {
  return __Porffor_iterator_inPlaceNext(this, Porffor.TYPES.__porffor_setiterator);
};

export const __Porffor_StringIterator_prototype_next = function (this: any): object {
  return __Porffor_iterator_inPlaceNext(this, Porffor.TYPES.__porffor_stringiterator);
};


// https://tc39.es/proposal-iterator-sequencing/
export const __Iterator_concat = (...items: any[]): any => {
  const list: any[] = Porffor.array.new(items.length * 2);
  for (let i: i32 = 0; i < items.length; i++) {
    const item: any = items[i];
    if (!Porffor.object.isObject(item)) throw new TypeError('Iterator.concat argument is not an object');
    const method: any = item[Symbol.iterator];
    if (Porffor.type(method) != Porffor.TYPES.function) throw new TypeError('Iterator.concat argument is not iterable');
    Porffor.array.fastPush(list, method);
    Porffor.array.fastPush(list, item);
  }

  return __Porffor_IteratorHelper_new(__Porffor_IteratorHelper_concat, undefined, list, 0);
};


// https://tc39.es/proposal-joint-iteration/
// GetIterator(obj, sync)
export const __Porffor_iterator_getSync = (obj: any): any[] => {
  const method: any = obj[Symbol.iterator];
  if (Porffor.type(method) != Porffor.TYPES.function) throw new TypeError('Object is not iterable');
  const iter: any = method.call(obj);
  return __Porffor_iterator_direct(iter);
};

// mode: 0 shortest, 1 longest, 2 strict
export const __Porffor_iterator_zipMode = (options: any): i32 => {
  if (options === undefined) return 0;
  if (!Porffor.object.isObject(options)) throw new TypeError('Iterator zip options is not an object');

  const mode: any = options.mode;
  if (Porffor.fastOr(mode === undefined, mode === 'shortest')) return 0;
  if (mode === 'longest') return 1;
  if (mode === 'strict') return 2;
  throw new TypeError('Iterator zip mode is invalid');
};

export const __Porffor_iterator_zipPadding = (options: any, mode: i32): any => {
  if (mode != 1) return undefined;
  const padding: any = options.padding;
  if (Porffor.fastAnd(padding !== undefined, !Porffor.object.isObject(padding))) throw new TypeError('Iterator zip padding is not an object');
  return padding;
};

export const __Porffor_IteratorHelper_zipNew = (iters: any[], mode: i32, padding: any[], keys: any): any => {
  const open: any[] = Porffor.array.new(iters.length);
  for (let i: i32 = 0; i < iters.length; i++) Porffor.array.fastPush(open, iters[i]);

  const extra: any[] = Porffor.array.new(2);
  extra[0] = padding;
  extra[1] = keys;

  const h: any = __Porffor_IteratorHelper_new(__Porffor_IteratorHelper_zip, undefined, iters, mode);
  const rec: any[] = Porffor.as(h, Porffor.TYPES.array);
  rec[5] = open;
  rec[6] = extra;
  return h;
};

export const __Iterator_zip = (iterables: any, options: any = undefined): any => {
  if (!Porffor.object.isObject(iterables)) throw new TypeError('Iterator.zip argument is not an object');
  const mode: i32 = __Porffor_iterator_zipMode(options);
  const paddingOption: any = __Porffor_iterator_zipPadding(options, mode);

  const iters: any[] = Porffor.array.new(4);
  const input: any[] = __Porffor_iterator_getSync(iterables);
  while (true) {
    let next: any;
    try {
      next = __Porffor_iterator_step(input);
    } catch (e) {
      __Porffor_iterator_closeAll(iters, true, e);
    }
    if (input[2]) break;

    try {
      Porffor.array.fastPush(iters, __Porffor_iterator_flattenable(next, false));
    } catch (e) {
      const all: any[] = Porffor.array.new(iters.length + 1);
      Porffor.array.fastPush(all, input);
      for (let i: i32 = 0; i < iters.length; i++) Porffor.array.fastPush(all, iters[i]);
      __Porffor_iterator_closeAll(all, true, e);
    }
  }

  const count: i32 = iters.length;
  const padding: any[] = Porffor.array.new(count);
  if (mode == 1) {
    if (paddingOption === undefined) {
      for (let i: i32 = 0; i < count; i++) Porffor.array.fastPush(padding, undefined);
    } else {
      let paddingIter: any[];
      try {
        paddingIter = __Porffor_iterator_getSync(paddingOption);
      } catch (e) {
        __Porffor_iterator_closeAll(iters, true, e);
      }

      for (let i: i32 = 0; i < count; i++) {
        let value: any = undefined;
        if (!paddingIter[2]) {
          try {
            value = __Porffor_iterator_step(paddingIter);
          } catch (e) {
            __Porffor_iterator_closeAll(iters, true, e);
          }
        }
        Porffor.array.fastPush(padding, value);
      }

      try {
        __Porffor_iterator_close(paddingIter);
      } catch (e) {
        __Porffor_iterator_closeAll(iters, true, e);
      }
    }
  }

  return __Porffor_IteratorHelper_zipNew(iters, mode, padding, undefined);
};

export const __Iterator_zipKeyed = (iterables: any, options: any = undefined): any => {
  if (!Porffor.object.isObject(iterables)) throw new TypeError('Iterator.zipKeyed argument is not an object');
  const mode: i32 = __Porffor_iterator_zipMode(options);
  const paddingOption: any = __Porffor_iterator_zipPadding(options, mode);

  const iters: any[] = Porffor.array.new(4);
  const keys: any[] = Porffor.array.new(4);
  const allKeys: any[] = __Reflect_ownKeys(iterables);
  for (let i: i32 = 0; i < allKeys.length; i++) {
    const key: any = allKeys[i];
    try {
      const desc: any = __Object_getOwnPropertyDescriptor(iterables, key);
      if (desc !== undefined) if (desc.enumerable) {
        const value: any = iterables[key];
        if (value !== undefined) {
          Porffor.array.fastPush(iters, __Porffor_iterator_flattenable(value, false));
          Porffor.array.fastPush(keys, key);
        }
      }
    } catch (e) {
      __Porffor_iterator_closeAll(iters, true, e);
    }
  }

  const count: i32 = iters.length;
  const padding: any[] = Porffor.array.new(count);
  if (mode == 1) {
    for (let i: i32 = 0; i < count; i++) {
      let value: any = undefined;
      if (paddingOption !== undefined) {
        try {
          value = paddingOption[keys[i]];
        } catch (e) {
          __Porffor_iterator_closeAll(iters, true, e);
        }
      }
      Porffor.array.fastPush(padding, value);
    }
  }

  return __Porffor_IteratorHelper_zipNew(iters, mode, padding, keys);
};

// IteratorZip closure step
export const __Porffor_IteratorHelper_zip = (h: any[]): any => {
  const iters: any[] = h[3];
  const mode: i32 = h[4];
  const open: any[] = h[5];
  const extra: any[] = h[6];
  const padding: any[] = extra[0];
  const keys: any = extra[1];

  const count: i32 = iters.length;
  if (count == 0) {
    h[0] = 3;
    return undefined;
  }

  const results: any[] = Porffor.array.new(count);
  for (let i: i32 = 0; i < count; i++) {
    const rec: any = iters[i];
    let result: any;
    if (rec === null) {
      result = padding[i];
    } else {
      try {
        result = __Porffor_iterator_step(rec);
      } catch (e) {
        __Porffor_iterator_closeAll(open, true, e);
      }

      if (rec[2]) {
        if (mode == 0) {
          h[0] = 3;
          __Porffor_iterator_closeAll(open, false, undefined);
          return undefined;
        }

        if (mode == 2) {
          if (i != 0) __Porffor_iterator_closeAll(open, true, new TypeError('Iterators passed to Iterator.zip in strict mode have different lengths'));
          for (let k: i32 = 1; k < count; k++) {
            const other: any[] = iters[k];
            try {
              __Porffor_iterator_next(other);
            } catch (e) {
              __Porffor_iterator_closeAll(open, true, e);
            }
            if (!other[2]) __Porffor_iterator_closeAll(open, true, new TypeError('Iterators passed to Iterator.zip in strict mode have different lengths'));
          }

          h[0] = 3;
          return undefined;
        }

        // longest: done once all are
        let anyOpen: boolean = false;
        for (let k: i32 = 0; k < open.length; k++) {
          const other: any[] = open[k];
          if (!other[2]) anyOpen = true;
        }
        if (!anyOpen) {
          h[0] = 3;
          return undefined;
        }

        iters[i] = null;
        result = padding[i];
      }
    }

    Porffor.array.fastPush(results, result);
  }

  if (keys === undefined) return results;

  const obj: object = {};
  Porffor.object.setPrototype(obj, null);
  for (let i: i32 = 0; i < count; i++) Porffor.object.expr.init(obj, keys[i], results[i]);
  return obj;
};
