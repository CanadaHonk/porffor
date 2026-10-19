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

  if (Porffor.type(value) == Porffor.TYPES.object) {
    // cheap prototype-chain probe for 'then' before the expensive Get below, does not invoke getters
    const thenHash: i32 = __Porffor_object_hash('then');
    let probe: any = value;
    let lastProbe: any = probe;
    while (Porffor.type(probe) == Porffor.TYPES.object) {
      if (Porffor.object.lookup(probe, 'then', thenHash) != 0) break;
      probe = __Porffor_object_getPrototype(probe);
      if (Porffor.IR.ptr(probe) == Porffor.IR.ptr(lastProbe)) break;
      lastProbe = probe;
    }
    if (Porffor.type(probe) != Porffor.TYPES.object) {
      __ecma262_FulfillPromise(promise, value);
      return;
    }
  } else if (!__ecma262_IsPromise(value)) {
    __ecma262_FulfillPromise(promise, value);
    return;
  }

  let then: any;
  try {
    then = Porffor.object.get(value, 'then');
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

  if (__Porffor_promise_reactionPayload(reaction) == 1) {
    const resolvers: any[] = __Porffor_promise_createResolvingFunctions(outPromise);
    try {
      Porffor.call(handler, resolvers, value, undefined);
    } catch (e) {
      const reject: any = resolvers[1];
      reject(e);
    }
    return;
  }

  let outValue: any = value;
  let ok: boolean = kind == 0;
  if (Porffor.type(handler) == Porffor.TYPES.function) {
    try {
      outValue = handler(value);
      ok = true;
    } catch (e) {
      outValue = e;
      ok = false;
    }
  }

  if (Porffor.IR.loadU8(reaction, 33) == 1) {
    // a custom capability [ promise, resolve, reject ]
    const settle: any = outPromise[ok ? 1 : 2];
    settle(outValue);
  } else if (ok) {
    __Porffor_promise_resolve(outValue, outPromise);
  } else {
    __ecma262_RejectPromise(outPromise, outValue);
  }
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
      Porffor.c`
#ifndef PORF_IGNORE_UNHANDLED_REJECTIONS`;
      throw __Porffor_promise_result(p);
      Porffor.c`
#endif`;
    }
  }
};

export const __Porffor_promise_createResolvingFunctions = (promise: any): any[] => {
  let alreadyResolved: boolean = false;

  // anonymous: resolving functions have an empty name
  const out: any[] = Porffor.array.new(2);
  out[0] = (value: any): void => {
    if (alreadyResolved) return;
    alreadyResolved = true;
    __Porffor_promise_resolve(value, promise);
  };

  out[1] = (reason: any): void => {
    if (alreadyResolved) return;
    alreadyResolved = true;
    __Porffor_promise_reject(reason, promise);
  };

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

export const __Porffor_promise_newCapability = (C: any): any[] => {
  if (C === Promise) {
    const obj: Promise = __Porffor_promise_create();
    const resolvers: any[] = __Porffor_promise_createResolvingFunctions(obj);
    const out: any[] = Porffor.array.new(3);
    out[0] = obj;
    out[1] = resolvers[0];
    out[2] = resolvers[1];
    return out;
  }

  if (!__ecma262_IsConstructor(C)) throw new TypeError('Promise capability constructor is not a constructor');

  const out: any[] = Porffor.array.new(3);
  out[1] = undefined;
  out[2] = undefined;
  const executor: any = __Porffor_promise_capabilityExecutor(out);
  const args: any[] = Porffor.array.new(1);
  args[0] = executor;
  out[0] = Porffor.call(C, args, null, C);

  if (Porffor.type(out[1]) != Porffor.TYPES.function) throw new TypeError('Promise resolve function is not callable');
  if (Porffor.type(out[2]) != Porffor.TYPES.function) throw new TypeError('Promise reject function is not callable');
  return out;
};

export const __Porffor_promise_capabilityExecutor = (cap: any[]): any => {
  return (resolve: any, reject: any): void => {
    if (cap[1] !== undefined) throw new TypeError('Promise capability resolve already set');
    if (cap[2] !== undefined) throw new TypeError('Promise capability reject already set');
    cap[1] = resolve;
    cap[2] = reject;
  };
};

export const __Porffor_promise_speciesConstructor = (O: any): any => {
  const C: any = O.constructor;
  if (C === undefined) return Promise;
  if (!Porffor.object.isObject(C)) throw new TypeError('Promise constructor is not an object');
  const S: any = C[Symbol.species];
  if (S == null) return Promise;
  if (__ecma262_IsConstructor(S)) return S;
  throw new TypeError('Promise species is not a constructor');
};

export const __Porffor_promise_resolveWith = (C: any, x: any): any => {
  if (__ecma262_IsPromise(x)) {
    if (x.constructor === C) return x;
  }

  const cap: any[] = __Porffor_promise_newCapability(C);
  const resolve: any = cap[1];
  resolve(x);
  return cap[0];
};

export const __Promise_withResolvers = function (this: any): object {
  const cap: any[] = __Porffor_promise_newCapability(this);

  const out: object = Porffor.object.new(3);
  out.promise = cap[0];
  out.resolve = cap[1];
  out.reject = cap[2];

  return out;
};

export const __Promise_resolve = function (this: any, value: any): any {
  if (!Porffor.object.isObject(this)) throw new TypeError('Promise.resolve called on non-object');
  return __Porffor_promise_resolveWith(this, value);
};

export const __Promise_reject = function (this: any, reason: any): any {
  const cap: any[] = __Porffor_promise_newCapability(this);
  const reject: any = cap[2];
  reject(reason);
  return cap[0];
};

export const __Promise_Symbol_species$get = function (this: any): any {
  return this;
};

export const __Promise_prototype_then = function (this: any, onFulfilled: any, onRejected: any) {
  if (!__ecma262_IsPromise(this)) throw new TypeError('Promise.prototype.then called on non-Promise');

  if (Porffor.type(onFulfilled) != Porffor.TYPES.function) onFulfilled = undefined;
  if (Porffor.type(onRejected) != Porffor.TYPES.function) onRejected = undefined;

  const C: any = __Porffor_promise_speciesConstructor(this);
  let out: any;
  let flags: i32 = 0;
  if (C === Promise) {
    out = __Porffor_promise_create();
  } else {
    out = __Porffor_promise_newCapability(C);
    flags = 1;
  }

  const fulfillReaction: i32 = __Porffor_promise_newReaction(onFulfilled, out, 0);
  const rejectReaction: i32 = __Porffor_promise_newReaction(onRejected, out, 1);
  Porffor.IR.storeU8(fulfillReaction, 33, flags);
  Porffor.IR.storeU8(rejectReaction, 33, flags);

  __Porffor_then(this, fulfillReaction, rejectReaction);

  if (flags == 1) return out[0];
  return out;
};

// Invoke(promise, "then", ...): an observable lookup, so a replaced then is used
export const __Porffor_promise_invokeThen = (promise: any, onFulfilled: any, onRejected: any): any => {
  const then: any = Porffor.object.get(promise, 'then');
  if (Porffor.type(then) != Porffor.TYPES.function) throw new TypeError('then is not a function');
  return Porffor.call(then, [ onFulfilled, onRejected ], promise, null);
};

export const __Promise_prototype_catch = function (this: any, onRejected: any) {
  return __Porffor_promise_invokeThen(this, undefined, onRejected);
};

export const __Porffor_promise_thenFinally = (C: any, onFinally: any): any => {
  return (value: any): any => {
    const result: any = onFinally();
    const p: any = __Porffor_promise_resolveWith(C, result);
    return Porffor.call(Porffor.object.get(p, 'then'), [ (): any => value ], p, null);
  };
};

export const __Porffor_promise_catchFinally = (C: any, onFinally: any): any => {
  return (reason: any): any => {
    const result: any = onFinally();
    const p: any = __Porffor_promise_resolveWith(C, result);
    return Porffor.call(Porffor.object.get(p, 'then'), [ (): any => {
      throw reason;
    } ], p, null);
  };
};

export const __Promise_prototype_finally = function (this: any, onFinally: any) {
  if (!Porffor.object.isObject(this)) throw new TypeError('Promise.prototype.finally called on non-object');

  const C: any = __Porffor_promise_speciesConstructor(this);
  if (Porffor.type(onFinally) != Porffor.TYPES.function) return __Porffor_promise_invokeThen(this, onFinally, onFinally);

  return __Porffor_promise_invokeThen(this, __Porffor_promise_thenFinally(C, onFinally), __Porffor_promise_catchFinally(C, onFinally));
};

export const __Porffor_promise_getResolve = (C: any): any => {
  const resolve: any = C.resolve;
  if (Porffor.type(resolve) != Porffor.TYPES.function) throw new TypeError('Promise resolve is not callable');
  return resolve;
};

// st: [ remaining, values, resolve or reject, keys (keyed only) ]
export const __Porffor_promise_settleCombinator = (st: any[], kind: i32): void => {
  if ((st[0] = st[0] - 1) != 0) return;

  let values: any = st[1];
  if (kind == 3) {
    const error: any = new AggregateError(Porffor.array.new(0));
    __Object_defineProperty(error, 'errors', { configurable: true, enumerable: false, writable: true, value: values });
    values = error;
  } else if (st[3] !== undefined) {
    const keys: any[] = st[3];
    const out: object = Porffor.object.new(4);
    __Porffor_object_setPrototype(out, null);
    for (let i: i32 = 0; i < keys.length; i++) out[keys[i]] = values[i];
    values = out;
  }

  const settle: any = st[2];
  settle(values);
};

// kind: 0 all (fulfil), 1 allSettled fulfilled, 2 allSettled rejected, 3 any (reject)
export const __Porffor_promise_combinatorElement = (st: any[], index: any, kind: any, alreadyCalled: any[]): any => {
  return (x: any): void => {
    if (alreadyCalled[0]) return;
    alreadyCalled[0] = true;

    let value: any = x;
    if (Porffor.fastOr(kind == 1, kind == 2)) {
      const o: object = {};
      o.status = kind == 1 ? 'fulfilled' : 'rejected';
      o[kind == 1 ? 'value' : 'reason'] = x;
      value = o;
    }

    const values: any[] = st[1];
    values[index] = value;
    __Porffor_promise_settleCombinator(st, kind);
  };
};

// variant: 0 all, 1 allSettled, 2 any, 3 race
export const __Porffor_promise_combinate = (C: any, cap: any[], promiseResolve: any, x: any, st: any[], index: i32, variant: i32): void => {
  const nextPromise: any = promiseResolve.call(C, x);
  if (variant == 3) {
    nextPromise.then(cap[1], cap[2]);
    return;
  }

  const values: any[] = st[1];
  values[index] = undefined;
  st[0] = st[0] + 1;

  // shared by an element's fulfil and reject functions
  const alreadyCalled: any[] = Porffor.array.new(1);
  alreadyCalled[0] = false;
  if (variant == 0) {
    nextPromise.then(__Porffor_promise_combinatorElement(st, index, 0, alreadyCalled), cap[2]);
  } else if (variant == 1) {
    nextPromise.then(__Porffor_promise_combinatorElement(st, index, 1, alreadyCalled), __Porffor_promise_combinatorElement(st, index, 2, alreadyCalled));
  } else {
    nextPromise.then(cap[1], __Porffor_promise_combinatorElement(st, index, 3, alreadyCalled));
  }
};

export const __Porffor_promise_combinator = (C: any, promises: any, variant: i32, keyed: boolean): any => {
  const cap: any[] = __Porffor_promise_newCapability(C);

  const st: any[] = Porffor.array.new(4);
  st[0] = 1;
  st[1] = Porffor.array.new(4);
  st[2] = variant == 2 ? cap[2] : cap[1];
  st[3] = undefined;

  try {
    const promiseResolve: any = __Porffor_promise_getResolve(C);

    let index: i32 = 0;
    if (keyed) {
      if (!Porffor.object.isObject(promises)) throw new TypeError('Promise combinator argument is not an object');

      const keys: any[] = Porffor.array.new(4);
      st[3] = keys;
      const allKeys: any[] = __Reflect_ownKeys(promises);
      for (let i: i32 = 0; i < allKeys.length; i++) {
        const key: any = allKeys[i];
        const desc: any = __Reflect_getOwnPropertyDescriptor(promises, key);
        if (desc === undefined) continue;
        if (!desc.enumerable) continue;

        const value: any = promises[key];
        keys[index] = key;
        __Porffor_promise_combinate(C, cap, promiseResolve, value, st, index, variant);
        index++;
      }
    } else {
      for (const x of promises) {
        __Porffor_promise_combinate(C, cap, promiseResolve, x, st, index, variant);
        index++;
      }
    }

    if (variant != 3) __Porffor_promise_settleCombinator(st, variant == 2 ? 3 : 0);
  } catch (e) {
    const reject: any = cap[2];
    reject(e);
  }

  return cap[0];
};

export const __Promise_all = function (this: any, promises: any): any {
  return __Porffor_promise_combinator(this, promises, 0, false);
};

export const __Promise_allSettled = function (this: any, promises: any): any {
  return __Porffor_promise_combinator(this, promises, 1, false);
};

export const __Promise_any = function (this: any, promises: any): any {
  return __Porffor_promise_combinator(this, promises, 2, false);
};

export const __Promise_race = function (this: any, promises: any): any {
  return __Porffor_promise_combinator(this, promises, 3, false);
};

export const __Promise_allKeyed = function (this: any, promises: any): any {
  return __Porffor_promise_combinator(this, promises, 0, true);
};

export const __Promise_allSettledKeyed = function (this: any, promises: any): any {
  return __Porffor_promise_combinator(this, promises, 1, true);
};

export const __Promise_try = function (this: any, callback: any, ...args: any[]): any {
  if (!Porffor.object.isObject(this)) throw new TypeError('Promise.try called on non-object');
  const cap: any[] = __Porffor_promise_newCapability(this);
  try {
    const resolve: any = cap[1];
    resolve(callback(...args));
  } catch (e) {
    const reject: any = cap[2];
    reject(e);
  }
  return cap[0];
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
