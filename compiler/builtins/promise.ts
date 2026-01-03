import type {} from './porffor.d.ts';

export const __ecma262_NewPromiseReactionJob = (reaction: any[], argument: any): any[] => {
  const job: any[] = Porffor.malloc(32);
  job[0] = reaction;
  job[1] = argument;

  return job;
};

const jobQueue: any[] = [];
export const __ecma262_HostEnqueuePromiseJob = (job: any[]): void => {
  Porffor.array.fastPush(jobQueue, job);
};

// 27.2.1.8 TriggerPromiseReactions (reactions, argument)
// https://tc39.es/ecma262/#sec-triggerpromisereactions
export const __ecma262_TriggerPromiseReactions = (reactions: any[], argument: any): void => {
  // 1. For each element reaction of reactions, do
  for (const reaction of reactions) {
    // a. Let job be NewPromiseReactionJob(reaction, argument).
    // b. Perform HostEnqueuePromiseJob(job.[[Job]], job.[[Realm]]).
    __ecma262_HostEnqueuePromiseJob(__ecma262_NewPromiseReactionJob(reaction, argument));
  }

  // 2. Return unused.
};


// 27.2.1.6 IsPromise (x)
// https://tc39.es/ecma262/#sec-ispromise
export const __ecma262_IsPromise = (x: any): boolean => {
  // custom impl
  return Porffor.type(x) == Porffor.TYPES.promise;
};

// 27.2.1.4 FulfillPromise (promise, value)
// https://tc39.es/ecma262/#sec-fulfillpromise
export const __ecma262_FulfillPromise = (promise: any[], value: any): void => {
  // 1. Assert: The value of promise.[[PromiseState]] is pending.
  if (promise[1] != 0) return;

  // 2. Let reactions be promise.[[PromiseFulfillReactions]].
  const reactions: any[] = promise[2]; // fulfillReactions

  // 3. Set promise.[[PromiseResult]] to value.
  promise[0] = value;

  // 4. Set promise.[[PromiseFulfillReactions]] to undefined.
  promise[2] = undefined;

  // 5. Set promise.[[PromiseRejectReactions]] to undefined.
  promise[3] = undefined;

  // 6. Set promise.[[PromiseState]] to fulfilled.
  promise[1] = 1;

  // 7. Perform TriggerPromiseReactions(reactions, value).
  __ecma262_TriggerPromiseReactions(reactions, value);

  // 8. Return unused.
};

// 27.2.1.7 RejectPromise (promise, reason)
// https://tc39.es/ecma262/#sec-rejectpromise
export const __ecma262_RejectPromise = (promise: any[], reason: any): void => {
  // 1. Assert: The value of promise.[[PromiseState]] is pending.
  if (promise[1] != 0) return;

  // 2. Let reactions be promise.[[PromiseRejectReactions]].
  const reactions: any[] = promise[3]; // rejectReactions

  // 3. Set promise.[[PromiseResult]] to reason.
  promise[0] = reason;

  // 4. Set promise.[[PromiseFulfillReactions]] to undefined.
  promise[2] = undefined;

  // 5. Set promise.[[PromiseRejectReactions]] to undefined.
  promise[3] = undefined;

  // 6. Set promise.[[PromiseState]] to rejected.
  promise[1] = 2;

  // 7. If promise.[[PromiseIsHandled]] is false, perform HostPromiseRejectionTracker(promise, "reject").
  // unimplemented

  // 8. Perform TriggerPromiseReactions(reactions, reason).
  __ecma262_TriggerPromiseReactions(reactions, reason);

  // 9. Return unused.
};


export const __Porffor_promise_noop = (x: any): any => x;

export const __Porffor_promise_newReaction = (handler: Function, promise: any, flags: i32): any[] => {
  // enum ReactionType { then = 0, finally = 1 }
  const out: any[] = Porffor.malloc(32);
  out[0] = handler;
  out[1] = promise;
  out[2] = flags;

  return out;
};

export const __Porffor_then = (promise: any[], fulfillReaction: any[], rejectReaction: any[]): void => {
  const state: i32 = promise[1];

  // 27.2.5.4.1 PerformPromiseThen (promise, onFulfilled, onRejected [, resultCapability])
  // https://tc39.es/ecma262/#sec-performpromisethen

  // 9. If promise.[[PromiseState]] is pending, then
  if (state == 0) { // pending
    // a. Append fulfillReaction to promise.[[PromiseFulfillReactions]].
    const fulfillReactions: any[] = promise[2];
    Porffor.array.fastPush(fulfillReactions, fulfillReaction);

    // b. Append rejectReaction to promise.[[PromiseRejectReactions]].
    const rejectReactions: any[] = promise[3];
    Porffor.array.fastPush(rejectReactions, rejectReaction);
  } else if (state == 1) { // fulfilled
    // 10. Else if promise.[[PromiseState]] is fulfilled, then
    // a. Let value be promise.[[PromiseResult]].
    const value: any = promise[0];

    // b. Let fulfillJob be NewPromiseReactionJob(fulfillReaction, value).
    // c. Perform HostEnqueuePromiseJob(fulfillJob.[[Job]], fulfillJob.[[Realm]]).
    __ecma262_HostEnqueuePromiseJob(__ecma262_NewPromiseReactionJob(fulfillReaction, value));
  } else { // rejected
    // 11. Else,
    // a. Assert: The value of promise.[[PromiseState]] is rejected.
    // todo

    // b. Let reason be promise.[[PromiseResult]].
    const reason: any = promise[0];

    // c. If promise.[[PromiseIsHandled]] is false, perform HostPromiseRejectionTracker(promise, "handle").
    // unimplemented

    // d. Let rejectJob be NewPromiseReactionJob(rejectReaction, reason).
    // e. Perform HostEnqueuePromiseJob(rejectJob.[[Job]], rejectJob.[[Realm]]).
    __ecma262_HostEnqueuePromiseJob(__ecma262_NewPromiseReactionJob(rejectReaction, reason));
  }
};

export const __Porffor_promise_resolve = (value: any, promise: any): void => {
  // if value is own promise, reject with typeerror
  if (value === promise) throw new TypeError('cannot resolve promise with itself');

  if (__ecma262_IsPromise(value)) {
    const fulfillReaction: any[] = __Porffor_promise_newReaction(__Porffor_promise_noop, promise, 0);
    const rejectReaction: any[] = __Porffor_promise_newReaction(__Porffor_promise_noop, promise, 2);

    __Porffor_then(value, fulfillReaction, rejectReaction);
  } else {
    __ecma262_FulfillPromise(promise, value);
  }
};

export const __Porffor_promise_reject = (reason: any, promise: any): void => {
  __ecma262_RejectPromise(promise, reason);
};

export const __Porffor_promise_create = (): any[] => {
  // Promise [ result, state, fulfillReactions, rejectReactions ]
  const obj: any[] = Porffor.malloc(64);

  // result = undefined
  obj[0] = undefined;

  // enum PromiseState { pending = 0, fulfilled = 1, rejected = 2 }
  // state = .pending
  obj[1] = 0;

  // fulfillReactions = []
  const fulfillReactions: any[] = Porffor.malloc(512);
  obj[2] = fulfillReactions;

  // rejectReactions = []
  const rejectReactions: any[] = Porffor.malloc(512);
  obj[3] = rejectReactions;

  return obj;
};

export const __Porffor_promise_runNext = (func: Function): void => {
  const reaction: any[] = __Porffor_promise_newReaction(func, undefined, 1);
  __ecma262_HostEnqueuePromiseJob(__ecma262_NewPromiseReactionJob(reaction, undefined));
};

export const __Porffor_promise_runJobs = (): void => {
  while (true) {
    let x: any = jobQueue.shift();
    if (x == null) break;

    const reaction: any[] = x[0];
    const handler: Function = reaction[0];
    const outPromise: any = reaction[1];
    const flags: i32 = reaction[2];

    const value: any = x[1];

    // todo: handle thrown errors in handler?
    let outValue: any;
    if (flags & 0b01) { // finally reaction
      handler();
      outValue = value;
    } else { // then reaction
      outValue = handler(value);
    }

    if (outPromise) if (flags & 0b10) {
      // reject reaction
      __Porffor_promise_reject(outValue, outPromise);
    } else {
      // resolve reaction
      __Porffor_promise_resolve(outValue, outPromise);
    }
  }
};

// hack: cannot share scope so use a global
let activePromise: any;
export const __Porffor_promise_resolveActive = (value: any): void => __Porffor_promise_resolve(value, activePromise);
export const __Porffor_promise_rejectActive = (reason: any): void => __Porffor_promise_reject(reason, activePromise);

export const Promise = function (executor: any): Promise {
  if (!new.target) throw new TypeError("Constructor Promise requires 'new'");
  if (Porffor.type(executor) != Porffor.TYPES.function) throw new TypeError('Promise executor is not a function');

  const obj: any[] = __Porffor_promise_create();
  activePromise = obj;

  try {
    executor(__Porffor_promise_resolveActive, __Porffor_promise_rejectActive);
  } catch (e) {
    // executor threw, reject promise
    __ecma262_RejectPromise(obj, e);
  }

  return obj as Promise;
};

export const __Promise_withResolvers = (): object => {
  const obj: any[] = __Porffor_promise_create();
  activePromise = obj;

  const out: object = Porffor.malloc();
  out.promise = obj as Promise;

  out.resolve = __Porffor_promise_resolveActive;
  out.reject = __Porffor_promise_rejectActive;

  return out;
};

export const __Promise_resolve = (value: any): Promise => {
  const obj: any[] = __Porffor_promise_create();

  __Porffor_promise_resolve(value, obj);

  return obj as Promise;
};

export const __Promise_reject = (reason: any): Promise => {
  const obj: any[] = __Porffor_promise_create();

  __Porffor_promise_reject(reason, obj);

  return obj as Promise;
};


// 27.2.5.4 Promise.prototype.then (onFulfilled, onRejected)
// https://tc39.es/ecma262/#sec-promise.prototype.then
export const __Promise_prototype_then = (_this: any, onFulfilled: any, onRejected: any) => {
  // 1. Let promise be the this value.
  // 2. If IsPromise(promise) is false, throw a TypeError exception.
  if (!__ecma262_IsPromise(_this)) throw new TypeError('Promise.prototype.then called on non-Promise');

  if (Porffor.type(onFulfilled) != Porffor.TYPES.function) onFulfilled = __Porffor_promise_noop;
  if (Porffor.type(onRejected) != Porffor.TYPES.function) onRejected = __Porffor_promise_noop;

  const outPromise: any[] = __Porffor_promise_create();

  const fulfillReaction: any[] = __Porffor_promise_newReaction(onFulfilled, outPromise, 0);
  const rejectReaction: any[] = __Porffor_promise_newReaction(onRejected, outPromise, 2);

  __Porffor_then(_this, fulfillReaction, rejectReaction);

  return outPromise as Promise;
};

// 27.2.5.1 Promise.prototype.catch (onRejected)
// https://tc39.es/ecma262/#sec-promise.prototype.catch
export const __Promise_prototype_catch = (_this: any, onRejected: any) => {
  // 1. Let promise be the this value.
  // 2. Return ? Invoke(promise, "then", « undefined, onRejected »).
  return __Promise_prototype_then(_this, undefined, onRejected);
};

export const __Promise_prototype_finally = (_this: any, onFinally: any) => {
  // custom impl based on then but also not (sorry)
  if (!__ecma262_IsPromise(_this)) throw new TypeError('Promise.prototype.then called on non-Promise');

  if (Porffor.type(onFinally) != Porffor.TYPES.function) onFinally = __Porffor_promise_noop;

  const promise: any[] = _this;
  const state: i32 = promise[1];

  const outPromise: any[] = __Porffor_promise_create();

  const finallyReaction: any[] = __Porffor_promise_newReaction(onFinally, outPromise, 1);

  if (state == 0) { // pending
    const fulfillReactions: any[] = promise[2];
    Porffor.array.fastPush(fulfillReactions, finallyReaction);

    const rejectReactions: any[] = promise[3];
    Porffor.array.fastPush(rejectReactions, finallyReaction);
  } else { // fulfilled or rejected
    const value: any = promise[0];
    __ecma262_HostEnqueuePromiseJob(__ecma262_NewPromiseReactionJob(finallyReaction, value));
  }

  return outPromise as Promise;
};


// commentary: its as 🦐shrimple🦐 as this
// hack: cannot share scope so use a global
//    ^ multiple Promise.all(-like)s are glitchy because of this

let _allPromises, _allRes, _allRej, _allOut, _allLen;
export const __Promise_all = (promises: any): Promise => {
  _allPromises = promises;

  return new Promise((res, rej) => {
    _allRes = res, _allRej = rej;

    const arr: any[] = Porffor.malloc();
    _allOut = arr;
    _allLen = 0;

    for (const x of _allPromises) {
      _allLen++;
      if (__ecma262_IsPromise(x)) {
        x.then(r => {
          if (Porffor.array.fastPush(_allOut, r) == _allLen) _allRes(_allOut);
        }, r => {
          _allRej(r);
        });
      } else {
        Porffor.array.fastPush(_allOut, x);
      }
    }

    if (_allLen == 0) {
      // empty iterable: immediately resolve
      _allRes(_allOut);
    } else if (_allOut.length == _allLen) {
      // given only non-promises, resolve next
      __Porffor_promise_runNext(() => {
        _allRes(_allOut);
      });
    }
  });
};

// commentary: i heard you liked hacks, so i added hacks to your hacks
export const __Promise_allSettled = (promises: any): Promise => {
  _allPromises = promises;

  return new Promise((res, rej) => {
    _allRes = res, _allRej = rej;

    const arr: any[] = Porffor.malloc();
    _allOut = arr;
    _allLen = 0;

    for (const x of _allPromises) {
      _allLen++;
      if (__ecma262_IsPromise(x)) {
        x.then(r => {
          const o: object = {};
          o.status = 'fulfilled';
          o.value = r;
          if (Porffor.array.fastPush(_allOut, o) == _allLen) _allRes(_allOut);
        }, r => {
          const o: object = {};
          o.status = 'rejected';
          o.reason = r;
          if (Porffor.array.fastPush(_allOut, o) == _allLen) _allRes(_allOut);
        });
      } else {
        const o: object = {};
        o.status = 'fulfilled';
        o.value = x;
        Porffor.array.fastPush(_allOut, o);
      }
    }

    if (_allLen == 0) {
      // empty iterable: immediately resolve
      _allRes(_allOut);
    } else if (_allOut.length == _allLen) {
      // given only non-promises, resolve next
      __Porffor_promise_runNext(() => {
        _allRes(_allOut);
      });
    }
  });
};

export const __Promise_any = (promises: any): Promise => {
  _allPromises = promises;

  return new Promise((res, rej) => {
    _allRes = res, _allRej = rej;

    const arr: any[] = Porffor.malloc();
    _allOut = arr; // list of rejections
    _allLen = 0;

    for (const x of _allPromises) {
      _allLen++;
      if (__ecma262_IsPromise(x)) {
        x.then(r => {
          _allRes(r);
        }, r => {
          if (Porffor.array.fastPush(_allOut, r) == _allLen) _allRes(new AggregateError(_allRes));
        });
      } else {
        return _allRes(x);
      }
    }

    if (_allLen == 0) {
      // empty iterable: immediately reject
      _allRej(new AggregateError(_allRes));
    }
  });
};

export const __Promise_race = (promises: any): Promise => {
  _allPromises = promises;

  return new Promise((res, rej) => {
    _allRes = res, _allRej = rej;

    for (const x of _allPromises) {
      if (__ecma262_IsPromise(x)) {
        x.then(r => {
          _allRes(r);
        }, r => {
          _allRej(r);
        });
      } else {
        return _allRes(x);
      }
    }
  });
};

// export const __Promise_try = function (cb: any, ...args: any[]) { return new this(res => res(cb(...args))) };
export const __Promise_try = async (cb: any, ...args: any[]) => cb(...args);

export const __Promise_prototype_toString = (_this: any) => '[object Promise]';
export const __Promise_prototype_toLocaleString = (_this: any) => __Promise_prototype_toString(_this);


export const __Porffor_promise_await = (value: any): any => {
  if (Porffor.type(value) != Porffor.TYPES.promise) return value;

  // hack: peek value instead of awaiting
  const state: i32 = (value as any[])[1];

  // pending
  if (state == 0) return value;

  const result: any = (value as any[])[0];

  // fulfilled
  if (state == 1) return result;

  // rejected
  throw result;
};