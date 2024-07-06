import type {} from './porffor.d.ts';

export const __ecma262_NewPromiseReactionJob = (reaction: any[], argument: any): any[] => {
  const job: any[] = Porffor.allocateBytes(22); // 2 length
  job[0] = reaction;
  job[1] = argument;

  return job;
};

const jobQueue: any[] = new Array(0);
export const __ecma262_HostEnqueuePromiseJob = (job: any[]): void => {
  Porffor.fastPush(jobQueue, job);
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

let activePromise: any;
export const __Porffor_promise_resolve = (value: any): any => {
  // todo: if value is own promise, reject with typeerror

  if (__ecma262_IsPromise(value)) {
    printStatic('todo res');
    // todo
  } else {
    __ecma262_FulfillPromise(activePromise, value);
  }

  return undefined;
};

export const __Porffor_promise_reject = (reason: any): any => {
  if (__ecma262_IsPromise(reason)) {
    printStatic('todo rej');
    // todo
  } else {
    __ecma262_RejectPromise(activePromise, reason);
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

export const __Porffor_promise_runJobs = () => {
  while (true) {
    let x: any = jobQueue.shift();
    if (x == null) break;

    const reaction: any[] = x[0];
    const handler: Function = reaction[0];
    const outPromise: any[] = reaction[1];

    const value: any = x[1];

    // todo: handle thrown errors in handler?
    const outValue: any = handler(value);

    // todo: should this be resolve or fulfill?
    __ecma262_FulfillPromise(outPromise, outValue);
  }
};


export const Promise = function (executor: any): Promise {
  if (!new.target) throw new TypeError("Constructor Promise requires 'new'");
  if (Porffor.rawType(executor) != Porffor.TYPES.function) throw new TypeError('Promise executor is not a function');

  const obj: any[] = __Porffor_promise_create();

  activePromise = obj;
  executor(__Porffor_promise_resolve, __Porffor_promise_reject);

  const pro: Promise = obj;
  return pro;
};


export const __Promise_prototype_then = (_this: any, onFulfilled: any, onRejected: any) => {
  // 27.2.5.4 Promise.prototype.then (onFulfilled, onRejected)
  // https://tc39.es/ecma262/#sec-promise.prototype.then

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

  const fulfillReaction: any[] = Porffor.allocateBytes(22); // 2 length
  fulfillReaction[0] = onFulfilled;
  fulfillReaction[1] = outPromise;

  const rejectReaction: any[] = Porffor.allocateBytes(22); // 2 length
  rejectReaction[0] = onRejected;
  rejectReaction[1] = outPromise;

  // 9. If promise.[[PromiseState]] is pending, then
  if (state == 0) { // pending
    // a. Append fulfillReaction to promise.[[PromiseFulfillReactions]].
    const fulfillReactions: any[] = promise[2];
    Porffor.fastPush(fulfillReactions, fulfillReaction);

    // b. Append rejectReaction to promise.[[PromiseRejectReactions]].
    const rejectReactions: any[] = promise[3];
    Porffor.fastPush(rejectReactions, rejectReaction);
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

export const __Promise_prototype_toString = (_this: any) => {
  const str: bytestring = '[object Promise]';
  return str;
};

export const __Promise_prototype_toLocaleString = (_this: any) => __Promise_prototype_toString(_this);