// @porf --closures
import type {} from './porffor.d.ts';

// generators are fiber-stack coroutines (runtime in render.js): yield/await suspend, the
// generator value is the coroutine handle. C owns only the mechanism (Porffor.coroutine.*),
// the iterator protocol and { value, done } results live here.

export const __Porffor_Generator_step = (gen: __Porffor_Generator, value: any, mode: i32): object => {
  const done: boolean = Porffor.coroutine.resume(gen, value, mode);
  const result: object = {};
  result.value = Porffor.coroutine.value(gen);
  result.done = done;
  return result;
};

export const __Porffor_Generator_prototype_next = function (this: __Porffor_Generator, value: any): object {
  return __Porffor_Generator_step(this, value, 0);
};

export const __Porffor_Generator_prototype_return = function (this: __Porffor_Generator, value: any): object {
  return __Porffor_Generator_step(this, value, 2);
};

export const __Porffor_Generator_prototype_throw = function (this: __Porffor_Generator, value: any): object {
  return __Porffor_Generator_step(this, value, 1);
};


// async generators: same protocol but every step is async - next/return/throw return
// promises and the produced value is itself awaited

export const __Porffor_AsyncGenerator_step = (gen: __Porffor_AsyncGenerator, value: any, mode: i32): Promise => {
  const promise: Promise = __Porffor_promise_create();
  try {
    const done: boolean = Porffor.coroutine.resume(gen, value, mode);
    const yielded: any = Porffor.coroutine.value(gen);
    if (Porffor.type(yielded) == Porffor.TYPES.promise) {
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
  return promise;
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
