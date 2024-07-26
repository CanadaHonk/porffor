import type {} from './porffor.d.ts';

export const __ecma262_NewPromiseReactionJob = (reaction: any[], argument: any): any[] => {
  const job: any[] = Porffor.allocateBytes(22); // 2 length
  job[0] = reaction;
  job[1] = argument;

  return job;
};

const jobQueue: any[] = new Array(0);
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
  return Porffor.rawType(x) == Porffor.TYPES.promise;
};

// 27.2.1.4 FulfillPromise (promise, value)
// https://tc39.es/ecma262/#sec-fulfillpromise
export const __ecma262_FulfillPromise = (promise: any[], value: any): void => {
  // 1. Assert: The value of promise.[[PromiseState]] is pending.
  // todo

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
  // todo

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


export const __Porffor_promise_noop = () => {};

export const __Porffor_promise_resolve = (promise: any, value: any): any => {
  // todo: if value is own promise, reject with typeerror

  if (__ecma262_IsPromise(value)) {
    // todo
  } else {
    __ecma262_FulfillPromise(promise, value);
  }

  return undefined;
};

export const __Porffor_promise_reject = (promise: any, reason: any): any => {
  if (__ecma262_IsPromise(reason)) {
    // todo
  } else {
    __ecma262_RejectPromise(promise, reason);
  }

  return undefined;
};

export const __Porffor_promise_create = (): any[] => {
  // Promise [ result, state, fulfillReactions, rejectReactions ]
  const obj: any[] = Porffor.allocateBytes(40); // 4 length

  // result = undefined
  obj[0] = undefined;

  // enum PromiseState { pending = 0, fulfilled = 1, rejected = 2 }
  // state = .pending
  obj[1] = 0;

  // fulfillReactions = []
  const fulfillReactions: any[] = Porffor.allocateBytes(256); // max length: 28
  obj[2] = fulfillReactions;

  // rejectReactions = []
  const rejectReactions: any[] = Porffor.allocateBytes(256); // max length: 28
  obj[3] = rejectReactions;

  return obj;
};

export const __Porffor_promise_newReaction = (handler: Function, promise: any, type: i32): any[] => {
  // enum ReactionType { then = 0, finally = 1 }
  const out: any[] = Porffor.allocateBytes(31); // 3 length
  out[0] = handler;
  out[1] = promise;
  out[2] = type;

  return out;
};

export const __Porffor_promise_runNext = (func: Function) => {
  const reaction = __Porffor_promise_newReaction(func, undefined, 1);
  __ecma262_HostEnqueuePromiseJob(__ecma262_NewPromiseReactionJob(reaction, undefined));
};

export const __Porffor_promise_runJobs = () => {
  while (true) {
    let x: any = jobQueue.shift();
    if (x == null) break;

    const reaction: any[] = x[0];
    const handler: Function = reaction[0];
    const outPromise: any = reaction[1];
    const type: i32 = reaction[2];

    const value: any = x[1];

    // todo: handle thrown errors in handler?
    let outValue: any;
    if (type == 0) { // 0: then reaction
      outValue = handler(value);
    } else { // 1: finally reaction
      handler();
      outValue = value;
    }

    // todo: should this be resolve or fulfill?
    if (outPromise) __ecma262_FulfillPromise(outPromise, outValue);
  }
};

// hack: cannot share scope so use a global
let activePromise: any;
export const __Porffor_promise_resolveActive = (value: any) => __Porffor_promise_resolve(activePromise, value);
export const __Porffor_promise_rejectActive = (reason: any) => __Porffor_promise_reject(activePromise, reason);

export const Promise = function (executor: any): void {
  if (!new.target) throw new TypeError("Constructor Promise requires 'new'");
  if (Porffor.rawType(executor) != Porffor.TYPES.function) throw new TypeError('Promise executor is not a function');

  const obj: any[] = __Porffor_promise_create();

  activePromise = obj;
  executor(__Porffor_promise_resolveActive, __Porffor_promise_rejectActive);

  const pro: Promise = obj;
  return pro;
};

export const __Promise_resolve = (value: any): Promise => {
  const obj: any[] = __Porffor_promise_create();

  __Porffor_promise_resolve(obj, value);

  const pro: Promise = obj;
  return pro;
};

export const __Promise_reject = (reason: any): Promise => {
  const obj: any[] = __Porffor_promise_create();

  __Porffor_promise_reject(obj, reason);

  const pro: Promise = obj;
  return pro;
};


// 27.2.5.4 Promise.prototype.then (onFulfilled, onRejected)
// https://tc39.es/ecma262/#sec-promise.prototype.then
export const __Promise_prototype_then = (_this: any, onFulfilled: any, onRejected: any) => {
  // 1. Let promise be the this value.
  // 2. If IsPromise(promise) is false, throw a TypeError exception.
  if (!__ecma262_IsPromise(_this)) throw new TypeError('Promise.prototype.then called on non-Promise');

  // 27.2.5.4.1 PerformPromiseThen (promise, onFulfilled, onRejected [, resultCapability])
  // https://tc39.es/ecma262/#sec-performpromisethen

  if (Porffor.rawType(onFulfilled) != Porffor.TYPES.function) onFulfilled = __Porffor_promise_noop;
  if (Porffor.rawType(onRejected) != Porffor.TYPES.function) onRejected = __Porffor_promise_noop;

  const promise: any[] = _this;
  const state: i32 = promise[1];

  const outPromise: any[] = __Porffor_promise_create();

  const fulfillReaction: any[] = __Porffor_promise_newReaction(onFulfilled, outPromise, 0);
  const rejectReaction: any[] = __Porffor_promise_newReaction(onRejected, outPromise, 0);

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

  const pro: Promise = outPromise;
  return pro;
};

// 27.2.5.1 Promise.prototype.catch (onRejected)
// https://tc39.es/ecma262/#sec-promise.prototype.catch
export const __Promise_prototype_catch = (_this: any, onRejected: any): Promise => {
  // 1. Let promise be the this value.
  // 2. Return ? Invoke(promise, "then", « undefined, onRejected »).
  return __Promise_prototype_then(_this, undefined, onRejected);
};

export const __Promise_prototype_finally = (_this: any, onFinally: any): Promise => {
  // custom impl based on then but also not (sorry)
  if (!__ecma262_IsPromise(_this)) throw new TypeError('Promise.prototype.then called on non-Promise');

  if (Porffor.rawType(onFinally) != Porffor.TYPES.function) onFinally = __Porffor_promise_noop;

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

  const pro: Promise = outPromise;
  return pro;
};


// commentary: its as 🦐shrimple🦐 as this
// hack: cannot share scope so use a global
//    ^ multiple Promise.all(-like)s are glitchy because of this

let _allPromises, _allRes, _allRej, _allOut, _allLen;
export const __Promise_all = (promises: any): Promise => {
  _allPromises = promises;

  return new Promise((res, rej) => {
    _allRes = res, _allRej = rej;

    const arr: any[] = Porffor.allocate();
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

    const arr: any[] = Porffor.allocate();
    _allOut = arr;
    _allLen = 0;

    for (const x of _allPromises) {
      _allLen++;
      if (__ecma262_IsPromise(x)) {
        x.then(r => {
          // Porffor.print(r);
          const o = {};
          let status: bytestring = '';
          status = 'fulfilled';
          o.status = status;

          o.value = r;
          if (Porffor.array.fastPush(_allOut, o) == _allLen) _allRes(_allOut);
        }, r => {
          const o = {};
          let status: bytestring = '';
          status = 'rejected';
          o.status = status;

          o.reason = r;
          if (Porffor.array.fastPush(_allOut, o) == _allLen) _allRes(_allOut);
        });
      } else {
        const o = {};
        let status: bytestring = '';
        status = 'fulfilled';
        o.status = status;

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


export const __Promise_prototype_toString = (_this: any) => {
  const str: bytestring = '[object Promise]';
  return str;
};

export const __Promise_prototype_toLocaleString = (_this: any) => __Promise_prototype_toString(_this);


export const __Porffor_promise_await = (value: any) => {
  if (Porffor.rawType(value) != Porffor.TYPES.promise) return value;

  // hack: peek value instead of awaiting
  const promise: any[] = value;

  const state: i32 = promise[1];

  // pending
  if (state == 0) return value;

  const result: any = promise[0];

  // fulfilled
  if (state == 1) return result;

  // rejected
  // todo: throw result instead of fixed error here
  throw Error('Uncaught await promise rejection');
};