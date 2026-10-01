// @porf --closures
import type {} from './porffor.d.ts';

// generators are fiber-stack coroutines (runtime in render.js): yield/await suspend, the
// generator value is the coroutine handle. C owns only the mechanism (Porffor.coroutine.*),
// the iterator protocol and { value, done } results live here.

export const __Porffor_Generator_step = (gen: __Porffor_Generator, value: any, mode: i32): any => {
  const done: boolean = Porffor.coroutine.resume(gen, value, mode);
  if (Porffor.coroutine.raw(gen)) return Porffor.coroutine.value(gen);

  const result: object = {};
  result.value = Porffor.coroutine.value(gen);
  result.done = done;
  return result;
};

export const __Porffor_Generator_prototype_next = function (this: __Porffor_Generator, value: any): any {
  return __Porffor_Generator_step(this, value, 0);
};

export const __Porffor_Generator_prototype_return = function (this: __Porffor_Generator, value: any): any {
  return __Porffor_Generator_step(this, value, 2);
};

export const __Porffor_Generator_prototype_throw = function (this: __Porffor_Generator, value: any): any {
  return __Porffor_Generator_step(this, value, 1);
};


// [ iterator, next method or index, done, kind (0 in place, 1 sync, 2 async), prev, depth ]
export const __Porffor_iterator_new = (iter: any, next: any, kind: i32): any[] => {
  const rec: any[] = Porffor.array.new(6);
  rec[0] = iter;
  rec[1] = next;
  rec[2] = false;
  rec[3] = kind;
  return rec;
};

export const __Porffor_iterator_inPlace = (t: i32): boolean => Porffor.fastOr(t == Porffor.TYPES.array, t == Porffor.TYPES.set, t == Porffor.TYPES.map,
  t == Porffor.TYPES.string, t == Porffor.TYPES.bytestring, t == Porffor.TYPES.__porffor_generator,
  Porffor.fastAnd(t >= Porffor.TYPES.uint8clampedarray, t <= Porffor.TYPES.float64array));

export const __Porffor_iterator_get = (obj: any): any[] => {
  let iter: any = obj;
  if (!__Porffor_iterator_inPlace(Porffor.type(obj))) {
    const method: any = obj[Symbol.iterator];
    if (Porffor.type(method) != Porffor.TYPES.function) throw new TypeError('Object is not iterable');
    iter = method.call(obj);
    if (!Porffor.object.isObject(iter)) throw new TypeError('Iterator is not an object');

    // builtin iterators are arrays
    const next: any = iter.next;
    if (Porffor.fastOr(Porffor.type(next) == Porffor.TYPES.function, !__Porffor_iterator_inPlace(Porffor.type(iter)))) return __Porffor_iterator_new(iter, next, 1);
  }

  return __Porffor_iterator_new(iter, 0, 0);
};

export const __Porffor_iterator_getAsync = (obj: any): any[] => {
  if (Porffor.type(obj) == Porffor.TYPES.__porffor_asyncgenerator) return __Porffor_iterator_new(obj, 0, 2);

  const method: any = obj[Symbol.asyncIterator];
  if (Porffor.fastOr(method === undefined, method === null)) return __Porffor_iterator_get(obj);
  if (Porffor.type(method) != Porffor.TYPES.function) throw new TypeError('Object is not async iterable');
  const iter: any = method.call(obj);
  if (!Porffor.object.isObject(iter)) throw new TypeError('Iterator is not an object');
  if (Porffor.type(iter) == Porffor.TYPES.__porffor_asyncgenerator) return __Porffor_iterator_new(iter, 0, 2);
  return __Porffor_iterator_new(iter, iter.next, 2);
};

// the record stays done if next() or its result throws
export const __Porffor_iterator_next = (rec: any[]): any => {
  rec[2] = true;
  const next: any = rec[1];
  const res: any = next.call(rec[0]);
  if (!Porffor.object.isObject(res)) throw new TypeError('Iterator result is not an object');
  rec[2] = !!res.done;
  return res;
};

export const __Porffor_iterator_step = (rec: any[]): any => {
  if (rec[2]) return undefined;

  const iter: any = rec[0];
  if (rec[3] != 0) {
    const res: any = __Porffor_iterator_next(rec);
    if (rec[2]) return undefined;

    rec[2] = true;
    const value: any = res.value;
    rec[2] = false;
    return value;
  }

  const t: i32 = Porffor.type(iter);
  if (t == Porffor.TYPES.__porffor_generator) {
    rec[2] = true;
    if (Porffor.coroutine.resume(iter, undefined, 0 as i32)) return undefined;
    rec[2] = false;
    return __Porffor_Generator_value(iter);
  }

  let i: i32 = rec[1];
  if (Porffor.fastOr(t == Porffor.TYPES.set, t == Porffor.TYPES.map)) {
    const keys: any[] = Porffor.IR.loadI32(iter, 0);
    const entries: i32 = Porffor.IR.loadI32(keys, 4);
    while (i < keys.length && Porffor.IR.loadU64(entries + i * 8, 0) == -1) i++;
    if (i >= keys.length) {
      rec[2] = true;
      return undefined;
    }

    rec[1] = i + 1;
    if (t == Porffor.TYPES.set) return keys[i];

    const vals: any[] = Porffor.IR.loadI32(iter, 4);
    const entry: any[] = Porffor.array.new(2);
    entry[0] = keys[i];
    entry[1] = vals[i];
    return entry;
  }

  if (i >= iter.length) {
    rec[2] = true;
    return undefined;
  }

  rec[1] = i + 1;
  return iter[i];
};

// unwraps results passed through by yield*
export const __Porffor_Generator_value = (gen: any): any => {
  const value: any = Porffor.coroutine.value(gen);
  if (Porffor.coroutine.raw(gen)) return value.value;
  return value;
};

export const __Porffor_iterator_skip = (rec: any[]): void => {
  if (rec[3] == 0) __Porffor_iterator_step(rec);
    else if (!rec[2]) __Porffor_iterator_next(rec);
};

export const __Porffor_iterator_rest = (rec: any[]): any[] => {
  const arr: any[] = Porffor.array.new(4);
  while (true) {
    const value: any = __Porffor_iterator_step(rec);
    if (rec[2]) return arr;
    Porffor.array.fastPush(arr, value);
  }
};

export const __Porffor_iterator_close = (rec: any[]): void => {
  if (rec[2]) return;
  rec[2] = true;

  const iter: any = rec[0];
  const t: i32 = Porffor.type(iter);
  if (Porffor.fastOr(t == Porffor.TYPES.__porffor_generator, t == Porffor.TYPES.__porffor_asyncgenerator)) {
    Porffor.coroutine.resume(iter, undefined, 2 as i32);
    return;
  }
  if (rec[3] == 0) return;

  const ret: any = iter.return;
  if (Porffor.fastOr(ret === undefined, ret === null)) return;
  if (Porffor.type(ret) != Porffor.TYPES.function) throw new TypeError('Iterator return is not a function');
  const res: any = ret.call(iter);

  // async ones are only closed by throws, which cannot await
  if (rec[3] == 2) {
    if (Porffor.type(res) == Porffor.TYPES.promise) __Porffor_promise_setHandled(res);
    return;
  }
  if (!Porffor.object.isObject(res)) throw new TypeError('Iterator result is not an object');
};

export const __Porffor_iterator_closeAsync = async (rec: any[]) => {
  if (rec[3] != 2) return __Porffor_iterator_close(rec);
  if (rec[2]) return;
  rec[2] = true;

  const iter: any = rec[0];
  if (Porffor.type(iter) == Porffor.TYPES.__porffor_asyncgenerator) {
    await __Porffor_AsyncGenerator_step(iter, undefined, 2);
    return;
  }

  const ret: any = iter.return;
  if (Porffor.fastOr(ret === undefined, ret === null)) return;
  if (Porffor.type(ret) != Porffor.TYPES.function) throw new TypeError('Iterator return is not a function');
  if (!Porffor.object.isObject(await ret.call(iter))) throw new TypeError('Iterator result is not an object');
};

export const __Porffor_iterator_nextAsync = (rec: any[]): any => {
  rec[2] = true;
  const iter: any = rec[0];
  if (Porffor.type(iter) == Porffor.TYPES.__porffor_asyncgenerator) return __Porffor_AsyncGenerator_step(iter, undefined, 0);

  const next: any = rec[1];
  return next.call(iter);
};

export const __Porffor_iterator_stepAsync = (rec: any[], res: any): any => {
  if (!Porffor.object.isObject(res)) throw new TypeError('Iterator result is not an object');
  if (res.done) return undefined;

  const value: any = res.value;
  rec[2] = false;
  return value;
};

// unfinished results are passed through raw
export const __Porffor_iterator_resume = (rec: any[], value: any, mode: i32): any => {
  const iter: any = rec[0];
  if (Porffor.type(iter) == Porffor.TYPES.__porffor_generator) {
    rec[2] = Porffor.coroutine.resume(iter, value, mode);
    Porffor.coroutine.setRaw(Porffor.coroutine.raw(iter));
    return Porffor.coroutine.value(iter);
  }
  if (Porffor.fastAnd(mode == 0, rec[3] == 0)) return __Porffor_iterator_step(rec);

  const res: any = __Porffor_iterator_call(rec, value, mode);
  if (!Porffor.object.isObject(res)) throw new TypeError('Iterator result is not an object');
  if (res.done) {
    rec[2] = true;
    return res.value;
  }

  Porffor.coroutine.setRaw(1 as i32);
  return res;
};

export const __Porffor_iterator_call = (rec: any[], value: any, mode: i32): any => {
  const iter: any = rec[0];
  const t: i32 = Porffor.type(iter);
  if (t == Porffor.TYPES.__porffor_generator) return __Porffor_Generator_step(iter, value, mode);
  if (t == Porffor.TYPES.__porffor_asyncgenerator) return __Porffor_AsyncGenerator_step(iter, value, mode);

  if (rec[3] != 0) {
    const method: any = mode == 0 ? rec[1] : (mode == 1 ? iter.throw : iter.return);
    if (Porffor.fastOr(mode == 0, Porffor.fastAnd(method !== undefined, method !== null))) return method.call(iter, value);
  }

  if (mode == 1) {
    __Porffor_iterator_close(rec);
    throw new TypeError('Iterator does not have a throw method');
  }

  const res: object = {};
  if (mode == 0) {
    res.value = __Porffor_iterator_step(rec);
    res.done = rec[2];
  } else {
    res.value = value;
    res.done = true;
  }
  return res;
};

export const __Porffor_iterator_complete = (rec: any[], res: any): any => {
  if (!Porffor.object.isObject(res)) throw new TypeError('Iterator result is not an object');
  rec[2] = !!res.done;
  return res.value;
};


// async generators: same protocol but every step is async - next/return/throw return
// promises and the produced value is itself awaited

export const __Porffor_AsyncGenerator_step = (gen: __Porffor_AsyncGenerator, value: any, mode: i32): Promise => {
  const promise: Promise = __Porffor_promise_create();
  __Porffor_AsyncGenerator_run(gen, value, mode, promise);
  return promise;
};

// resume until the body yields or finishes, following its awaits
export const __Porffor_AsyncGenerator_run = (gen: __Porffor_AsyncGenerator, value: any, mode: i32, promise: Promise): void => {
  try {
    const done: boolean = Porffor.coroutine.resume(gen, value, mode);
    const yielded: any = Porffor.coroutine.value(gen);
    if (Porffor.coroutine.awaiting(gen)) {
      Porffor.callThis(__Promise_prototype_then, yielded,
        (v: any): void => __Porffor_AsyncGenerator_run(gen, v, 0, promise),
        (e: any): void => __Porffor_AsyncGenerator_run(gen, e, 1, promise));
    } else if (Porffor.type(yielded) == Porffor.TYPES.promise) {
      // the yielded value is itself awaited: settle with { value: awaited, done }
      Porffor.callThis(__Promise_prototype_then, yielded,
        (v: any): void => {
          const result: object = {};
          result.value = v;
          result.done = done;
          __Porffor_promise_resolve(result, promise);
        },
        (e: any): void => {
          Porffor.coroutine.resume(gen, undefined, 2 as i32);
          __Porffor_promise_reject(e, promise);
        });
    } else {
      const result: object = {};
      result.value = yielded;
      result.done = done;
      __Porffor_promise_resolve(result, promise);
    }
  } catch (e) {
    __Porffor_promise_reject(e, promise);
  }
};

export const __Porffor_AsyncGenerator_prototype_next = function (this: __Porffor_AsyncGenerator, value: any) {
  return __Porffor_AsyncGenerator_step(this, value, 0);
};

export const __Porffor_AsyncGenerator_prototype_return = function (this: __Porffor_AsyncGenerator, value: any) {
  return __Porffor_AsyncGenerator_step(this, value, 2);
};

export const __Porffor_AsyncGenerator_prototype_throw = function (this: __Porffor_AsyncGenerator, value: any) {
  return __Porffor_AsyncGenerator_step(this, value, 1);
};

// an async generator is its own async iterator (handled in codegen)
