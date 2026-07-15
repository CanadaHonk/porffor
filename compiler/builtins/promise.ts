// @porf --closures
import type {} from './porffor.d.ts';

const pendingRejections: any[] = [];

export const __ecma262_IsPromise = (x: any): boolean => {
  return Porffor.type(x) == Porffor.TYPES.promise;
};

export const __Porffor_promise_state = (promise: any): i32 => {
  return Porffor.IR.loadU8(promise, 32);
};

export const __Porffor_promise_result = (promise: any): any => {
  return Porffor.IR.loadJv(promise, 0);
};

export const __Porffor_promise_isHandled = (promise: any): boolean => {
  return Porffor.IR.loadU8(promise, 34) != 0;
};

export const __Porffor_promise_setHandled = (promise: any): void => {
  Porffor.IR.storeU8(promise, 34, 1);
};

export const __Porffor_promise_setPayload = (promise: any, payload: any): void => {
  Porffor.IR.storeJv(promise, 24, payload);
  Porffor.IR.gcBarrier(promise, Porffor.TYPES.promise);
};

export const __Porffor_promise_payload = (promise: any): any => {
  return Porffor.IR.loadJv(promise, 24);
};

export const __Porffor_promise_newReaction = (handler: any, promise: any, kind: i32): i32 => {
  const out: i32 = Porffor.malloc(40);
  Porffor.IR.storeJv(out, 0, handler);
  Porffor.IR.storeJv(out, 8, promise);
  Porffor.IR.storeJv(out, 16, undefined);
  Porffor.IR.storeI32(out, 24, 0);
  Porffor.IR.storeI32(out, 28, 0);
  Porffor.IR.storeU8(out, 32, kind);
  Porffor.IR.storeU8(out, 33, 0);
  Porffor.c`porf_gc_barrier((u32)out, PORF_GC_KIND_PROMISE_REACTION);`;
  return out;
};

export const __Porffor_promise_reactionSetPayload = (reaction: i32, payload: i32): void => {
  Porffor.IR.storeI32(reaction, 28, payload);
};

export const __Porffor_promise_reactionPayload = (reaction: i32): i32 => {
  return Porffor.IR.loadI32(reaction, 28);
};

export const __Porffor_promise_reactionKind = (reaction: i32): i32 => {
  return Porffor.IR.loadU8(reaction, 32);
};

export const __Porffor_promise_reactionHandler = (reaction: i32): any => {
  return Porffor.IR.loadJv(reaction, 0);
};

export const __Porffor_promise_reactionPromise = (reaction: i32): any => {
  return Porffor.IR.loadJv(reaction, 8);
};

export const __Porffor_promise_reactionValue = (reaction: i32): any => {
  return Porffor.IR.loadJv(reaction, 16);
};

export const __Porffor_promise_enqueueReaction = (reaction: i32, argument: any): void => {
  Porffor.IR.storeJv(reaction, 16, argument);
  Porffor.c`porf_gc_barrier((u32)reaction, PORF_GC_KIND_PROMISE_REACTION);
porf_promise_enqueue_job((u32)reaction);`;
};

export const __Porffor_promise_dequeueReaction = (): i32 => {
  let reaction: i32 = 0;
  Porffor.c`reaction = (i32)porf_promise_dequeue_job();`;
  return reaction;
};

export const __Porffor_promise_appendFulfillReaction = (promise: any, reaction: i32): void => {
  const tail: i32 = Porffor.IR.loadI32(promise, 12);
  if (tail == 0) {
    Porffor.IR.storeI32(promise, 8, reaction);
  } else {
    Porffor.IR.storeI32(tail, 24, reaction);
    Porffor.c`porf_gc_barrier((u32)tail, PORF_GC_KIND_PROMISE_REACTION);`;
  }

  Porffor.IR.storeI32(promise, 12, reaction);
  Porffor.IR.gcBarrier(promise, Porffor.TYPES.promise);
};

export const __Porffor_promise_appendRejectReaction = (promise: any, reaction: i32): void => {
  const tail: i32 = Porffor.IR.loadI32(promise, 20);
  if (tail == 0) {
    Porffor.IR.storeI32(promise, 16, reaction);
  } else {
    Porffor.IR.storeI32(tail, 24, reaction);
    Porffor.c`porf_gc_barrier((u32)tail, PORF_GC_KIND_PROMISE_REACTION);`;
  }

  Porffor.IR.storeI32(promise, 20, reaction);
  Porffor.IR.gcBarrier(promise, Porffor.TYPES.promise);
};

export const __ecma262_TriggerPromiseReactions = (reactions: i32, argument: any): void => {
  let reaction: i32 = reactions;
  while (reaction != 0) {
    const next: i32 = Porffor.IR.loadI32(reaction, 24);
    Porffor.IR.storeI32(reaction, 24, 0);
    __Porffor_promise_enqueueReaction(reaction, argument);
    reaction = next;
  }
};

export const __ecma262_FulfillPromise = (promise: any, value: any): void => {
  if (__Porffor_promise_state(promise) != 0) return;

  const reactions: i32 = Porffor.IR.loadI32(promise, 8);
  Porffor.IR.storeJv(promise, 0, value);
  Porffor.IR.storeI32(promise, 8, 0);
  Porffor.IR.storeI32(promise, 12, 0);
  Porffor.IR.storeI32(promise, 16, 0);
  Porffor.IR.storeI32(promise, 20, 0);
  Porffor.IR.storeU8(promise, 32, 1);
  Porffor.IR.gcBarrier(promise, Porffor.TYPES.promise);

  __ecma262_TriggerPromiseReactions(reactions, value);
};

export const __ecma262_RejectPromise = (promise: any, reason: any): void => {
  if (__Porffor_promise_state(promise) != 0) return;

  const reactions: i32 = Porffor.IR.loadI32(promise, 16);
  Porffor.IR.storeJv(promise, 0, reason);
  Porffor.IR.storeI32(promise, 8, 0);
  Porffor.IR.storeI32(promise, 12, 0);
  Porffor.IR.storeI32(promise, 16, 0);
  Porffor.IR.storeI32(promise, 20, 0);
  Porffor.IR.storeU8(promise, 32, 2);
  Porffor.IR.gcBarrier(promise, Porffor.TYPES.promise);

  if (!__Porffor_promise_isHandled(promise)) Porffor.array.fastPush(pendingRejections, promise);

  __ecma262_TriggerPromiseReactions(reactions, reason);
};

export const __Porffor_then = (promise: any, fulfillReaction: i32, rejectReaction: i32): void => {
  const state: i32 = __Porffor_promise_state(promise);
  __Porffor_promise_setHandled(promise);

  if (state == 0) {
    __Porffor_promise_appendFulfillReaction(promise, fulfillReaction);
    __Porffor_promise_appendRejectReaction(promise, rejectReaction);
  } else if (state == 1) {
    __Porffor_promise_enqueueReaction(fulfillReaction, __Porffor_promise_result(promise));
  } else {
    __Porffor_promise_enqueueReaction(rejectReaction, __Porffor_promise_result(promise));
  }
};

export const __Porffor_promise_resolve = (value: any, promise: any): void => {
  if (value == promise) {
    __ecma262_RejectPromise(promise, new TypeError('Chaining cycle detected: cannot resolve promise with itself'));
    return;
  }

  if (__ecma262_IsPromise(value)) {
    const fulfillReaction: i32 = __Porffor_promise_newReaction(undefined, promise, 0);
    const rejectReaction: i32 = __Porffor_promise_newReaction(undefined, promise, 1);

    __Porffor_then(value, fulfillReaction, rejectReaction);
    return;
  }

  if (Porffor.type(value) == Porffor.TYPES.object) {
    // cheap prototype-chain probe for 'then' before the expensive Get below, does not invoke getters
    const thenHash: i32 = __Porffor_object_hash('then');
    let probe: any = value;
    while (Porffor.type(probe) == Porffor.TYPES.object) {
      if (Porffor.object.lookup(probe, 'then', thenHash) != 0) break;
      probe = __Porffor_object_getPrototype(probe);
    }
    if (Porffor.type(probe) != Porffor.TYPES.object) {
      __ecma262_FulfillPromise(promise, value);
      return;
    }

    let then: any;
    try {
      then = (value as object).then;
    } catch (e) {
      __ecma262_RejectPromise(promise, e);
      return;
    }

    if (Porffor.type(then) == Porffor.TYPES.function) {
      const reaction: i32 = __Porffor_promise_newReaction(then, promise, 0);
      __Porffor_promise_reactionSetPayload(reaction, 1);
      __Porffor_promise_enqueueReaction(reaction, value);
      return;
    }
  }

  __ecma262_FulfillPromise(promise, value);
};

export const __Porffor_promise_reject = (reason: any, promise: any): void => {
  __ecma262_RejectPromise(promise, reason);
};

export const __Porffor_promise_create = (): Promise => {
  const obj: Promise = Porffor.malloc(40);
  Porffor.IR.storeJv(obj, 0, undefined);
  Porffor.IR.storeI32(obj, 8, 0);
  Porffor.IR.storeI32(obj, 12, 0);
  Porffor.IR.storeI32(obj, 16, 0);
  Porffor.IR.storeI32(obj, 20, 0);
  Porffor.IR.storeJv(obj, 24, undefined);
  Porffor.IR.storeU8(obj, 32, 0);
  Porffor.IR.storeU8(obj, 34, 0);
  return obj;
};

export const __Porffor_promise_aggSettle = (kind: i32, agg: any, index: i32, value: any): void => {
  if (__Porffor_promise_state(agg) != 0) return;

  if (Porffor.fastOr(kind == 7, kind == 9)) {
    __ecma262_FulfillPromise(agg, value);
    return;
  }
  if (Porffor.fastOr(kind == 4, kind == 10)) {
    __ecma262_RejectPromise(agg, value);
    return;
  }

  const st: any[] = __Porffor_promise_payload(agg);
  const results: any[] = st[1];

  let stored: any = value;
  if (Porffor.fastOr(kind == 5, kind == 6)) {
    const o: object = {};
    if (kind == 5) {
      o.status = 'fulfilled';
      o.value = value;
    } else {
      o.status = 'rejected';
      o.reason = value;
    }
    stored = o;
  }
  results[index] = stored;

  if ((st[0] = st[0] - 1) == 0) {
    if (kind == 8) __ecma262_RejectPromise(agg, new AggregateError(results, 'All promises were rejected'));
    else __ecma262_FulfillPromise(agg, results);
  }
};

export const __Porffor_promise_runOne = (reaction: i32): void => {
  const kind: i32 = __Porffor_promise_reactionKind(reaction);

  if (kind == 11) {
    Porffor.c`porf_promise_run_coro_reaction((u32)reaction);`;
    return;
  }

  if (kind == 12) {
    Porffor.c`porf_native_fetch_run_response_reaction((u32)reaction);`;
    return;
  }

  const handler: any = __Porffor_promise_reactionHandler(reaction);
  const outPromise: any = __Porffor_promise_reactionPromise(reaction);
  const value: any = __Porffor_promise_reactionValue(reaction);
  const payload: i32 = __Porffor_promise_reactionPayload(reaction);

  if (kind >= 3) {
    __Porffor_promise_aggSettle(kind, outPromise, payload, value);
    return;
  }

  if (Porffor.fastAnd(kind == 0, payload == 1)) {
    const resolvers: any[] = __Porffor_promise_createResolvingFunctions(outPromise);
    try {
      Porffor.call(handler, resolvers, value, undefined);
    } catch (e) {
      const reject: any = resolvers[1];
      reject(e);
    }
    return;
  }

  if (kind == 2) {
    if (Porffor.type(handler) == Porffor.TYPES.function) {
      try {
        handler();
      } catch (e) {
        if (outPromise) __ecma262_RejectPromise(outPromise, e);
        return;
      }
    }
    if (outPromise) {
      if (payload == 1) __ecma262_RejectPromise(outPromise, value);
      else __Porffor_promise_resolve(value, outPromise);
    }
    return;
  }

  if (Porffor.type(handler) != Porffor.TYPES.function) {
    if (outPromise) {
      if (kind == 0) __Porffor_promise_resolve(value, outPromise);
      else __ecma262_RejectPromise(outPromise, value);
    }
    return;
  }

  let outValue: any;
  try {
    outValue = handler(value);
  } catch (e) {
    if (outPromise) __ecma262_RejectPromise(outPromise, e);
    return;
  }

  if (outPromise) __Porffor_promise_resolve(outValue, outPromise);
};

export const __Porffor_promise_runJobs = (): void => {
  while (true) {
    const reaction: i32 = __Porffor_promise_dequeueReaction();
    if (reaction == 0) break;

    __Porffor_promise_runOne(reaction);
  }

  while (pendingRejections.length > 0) {
    const p: any = pendingRejections.pop();
    if (Porffor.fastAnd(!__Porffor_promise_isHandled(p), __Porffor_promise_state(p) == 2)) {
      throw __Porffor_promise_result(p);
    }
  }
};

export const __Porffor_promise_createResolvingFunctions = (promise: any): any[] => {
  let alreadyResolved: boolean = false;

  const resolve = (value: any): void => {
    if (alreadyResolved) return;
    alreadyResolved = true;
    __Porffor_promise_resolve(value, promise);
  };

  const reject = (reason: any): void => {
    if (alreadyResolved) return;
    alreadyResolved = true;
    __Porffor_promise_reject(reason, promise);
  };

  const out: any[] = Porffor.array.new(2);
  out[0] = resolve;
  out[1] = reject;
  return out;
};

export const Promise = function (executor: any): Promise {
  if (!new.target) throw new TypeError("Constructor Promise requires 'new'");
  if (Porffor.type(executor) != Porffor.TYPES.function) throw new TypeError('Promise executor is not a function');

  const obj: Promise = __Porffor_promise_create();
  const resolvers: any[] = __Porffor_promise_createResolvingFunctions(obj);

  try {
    executor(resolvers[0], resolvers[1]);
  } catch (e) {
    const reject: any = resolvers[1];
    reject(e);
  }

  return obj;
};

export const __Promise_withResolvers = (): object => {
  const obj: Promise = __Porffor_promise_create();
  const resolvers: any[] = __Porffor_promise_createResolvingFunctions(obj);

  const out: object = Porffor.object.new(3);
  out.promise = obj;
  out.resolve = resolvers[0];
  out.reject = resolvers[1];

  return out;
};

export const __Promise_resolve = (value: any): Promise => {
  if (__ecma262_IsPromise(value)) return value;

  const obj: Promise = __Porffor_promise_create();
  __Porffor_promise_resolve(value, obj);
  return obj;
};

export const __Promise_reject = (reason: any): Promise => {
  const obj: Promise = __Porffor_promise_create();
  __Porffor_promise_reject(reason, obj);
  return obj;
};

export const __Promise_prototype_then = function (this: any, onFulfilled: any, onRejected: any) {
  if (!__ecma262_IsPromise(this)) throw new TypeError('Promise.prototype.then called on non-Promise');

  if (Porffor.type(onFulfilled) != Porffor.TYPES.function) onFulfilled = undefined;
  if (Porffor.type(onRejected) != Porffor.TYPES.function) onRejected = undefined;

  const outPromise: Promise = __Porffor_promise_create();

  const fulfillReaction: i32 = __Porffor_promise_newReaction(onFulfilled, outPromise, 0);
  const rejectReaction: i32 = __Porffor_promise_newReaction(onRejected, outPromise, 1);

  __Porffor_then(this, fulfillReaction, rejectReaction);

  return outPromise;
};

export const __Promise_prototype_catch = function (this: any, onRejected: any) {
  return Porffor.callThis(__Promise_prototype_then, this, undefined, onRejected);
};

export const __Promise_prototype_finally = function (this: any, onFinally: any) {
  if (!__ecma262_IsPromise(this)) throw new TypeError('Promise.prototype.finally called on non-Promise');

  if (Porffor.type(onFinally) != Porffor.TYPES.function) onFinally = undefined;

  const outPromise: Promise = __Porffor_promise_create();
  const fulfillFinally: i32 = __Porffor_promise_newReaction(onFinally, outPromise, 2);
  const rejectFinally: i32 = __Porffor_promise_newReaction(onFinally, outPromise, 2);
  __Porffor_promise_reactionSetPayload(rejectFinally, 1);

  __Porffor_then(this, fulfillFinally, rejectFinally);

  return outPromise;
};

export const __Porffor_promise_combinate = (inputs: any, okKind: i32, errKind: i32): Promise => {
  const agg: Promise = __Porffor_promise_create();

  const st: any[] = Porffor.array.new(2);
  st[0] = 0;
  const results: any[] = Porffor.array.new(4);
  st[1] = results;
  __Porffor_promise_setPayload(agg, st);

  let count: i32 = 0;
  for (const x of inputs) {
    const p: any = __Promise_resolve(x);

    const okReaction: i32 = __Porffor_promise_newReaction(undefined, agg, okKind);
    __Porffor_promise_reactionSetPayload(okReaction, count);
    const errReaction: i32 = __Porffor_promise_newReaction(undefined, agg, errKind);
    __Porffor_promise_reactionSetPayload(errReaction, count);

    results[count] = undefined;
    count++;

    __Porffor_then(p, okReaction, errReaction);
  }

  st[0] = count;

  if (count == 0) {
    if (Porffor.fastOr(okKind == 3, okKind == 5)) __ecma262_FulfillPromise(agg, results);
    else if (okKind == 7) __ecma262_RejectPromise(agg, new AggregateError(results, 'All promises were rejected'));
  }

  return agg;
};

export const __Promise_all = (promises: any): Promise => {
  return __Porffor_promise_combinate(promises, 3, 4);
};

export const __Promise_allSettled = (promises: any): Promise => {
  return __Porffor_promise_combinate(promises, 5, 6);
};

export const __Promise_any = (promises: any): Promise => {
  return __Porffor_promise_combinate(promises, 7, 8);
};

export const __Promise_race = (promises: any): Promise => {
  return __Porffor_promise_combinate(promises, 9, 10);
};

export const __Promise_try = (cb: any, ...args: any[]): Promise => {
  const obj: Promise = __Porffor_promise_create();
  try {
    __Porffor_promise_resolve(cb(...args), obj);
  } catch (e) {
    __Porffor_promise_reject(e, obj);
  }
  return obj;
};

export const __Promise_prototype_toString = function (this: any) { return '[object Promise]'; };
export const __Promise_prototype_toLocaleString = function (this: any) { return Porffor.callThis(__Promise_prototype_toString, this); };

export const __Porffor_promise_awaitSync = (value: any): any => {
  if (Porffor.type(value) != Porffor.TYPES.promise) return value;

  __Porffor_promise_setHandled(value);

  let state: i32 = __Porffor_promise_state(value);
  if (state == 0) {
    while (__Porffor_promise_state(value) == 0) {
      const reaction: i32 = __Porffor_promise_dequeueReaction();
      if (reaction == 0) throw new TypeError('Deadlock: awaited pending promise with no pending jobs');
      __Porffor_promise_runOne(reaction);
    }
    state = __Porffor_promise_state(value);
  }

  const result: any = __Porffor_promise_result(value);
  if (state == 1) return result;
  throw result;
};
