import type {} from './porffor.d.ts';

export const __Porffor_threads_cross = (x: any): any => {
  const t: i32 = Porffor.type(x);
  if (t == Porffor.TYPES.object) {
    const xo: any = x;
    if (xo.__porf_xfer === 1) return xo.value;
    if (Object.isFrozen(x)) return x;
    throw new TypeError('OwnershipError: mutable object cannot cross agents. Fix: Porffor.threads.transfer(v) to move it, Porffor.threads.share(v) to freeze it, or Porffor.threads.cown(v) to take turns');
  }
  if (t == Porffor.TYPES.array) {
    if (Object.isFrozen(x)) return x;
    throw new TypeError('OwnershipError: mutable array cannot cross agents. Fix: Porffor.threads.transfer(v) to move it, or Porffor.threads.share(v) to freeze it');
  }
  return x;
};

export const __Porffor_threads_transfer = (v: any): any => {
  const t: i32 = Porffor.type(v);
  if (Porffor.fastAnd(t != Porffor.TYPES.object, t != Porffor.TYPES.array)) return v;
  const box: object = __Porffor_object_newShared(2);
  box.__porf_xfer = 1;
  box.value = v;
  return Object.freeze(box);
};

export const __Porffor_threads_share = (v: any): any => {
  const t: i32 = Porffor.type(v);
  if (t == Porffor.TYPES.array) {
    if (Object.isFrozen(v)) return v;
    Object.freeze(v);
    const va: any[] = v;
    for (const x of va) __Porffor_threads_share(x);
    return v;
  }
  if (t == Porffor.TYPES.object) {
    if (Object.isFrozen(v)) return v;
    Object.freeze(v);
    const ks: any[] = Object.keys(v);
    for (const k of ks) __Porffor_threads_share((v as object)[k]);
    return v;
  }
  return v;
};

export const __Porffor_threads_entry = (fn: any, args: any[], promise: any[]): void => {
  let ok: boolean = true;
  let ret: any;
  try {
    ret = Porffor.call(fn, args, undefined, undefined);
    while (Porffor.type(ret) == Porffor.TYPES.promise) {
      const state: i32 = __Porffor_promise_state(ret);
      if (state == 0) {
        Porffor.c`porf_thread_yield();`;
        continue;
      }
      Porffor.c`porf_thread_fence();`;
      ret = __Porffor_promise_result(ret);
      if (state == 2) {
        ok = false;
      }
      break;
    }
  } catch (e) {
    ok = false;
    ret = e;
  }

  if (ok && Porffor.type(ret) == Porffor.TYPES.object) {
    const ro: any = ret;
    if (ro.__porf_xfer == 1) ret = ro.value;
  }

  Porffor.c`porf_thread_fence();`;
  if (ok) __ecma262_FulfillPromise(promise, ret);
    else __ecma262_RejectPromise(promise, ret);
};

export const __Porffor_threads_spawn = (fn: any, ...rest: any[]): any => {
  if (Porffor.type(fn) != Porffor.TYPES.function) throw new TypeError('Porffor.threads.spawn: first argument must be a function');

  // copy out of the (statically allocated, per-site reused) rest array
  const n: i32 = rest.length;
  const args: any[] = Porffor.array.new(8);
  for (let i: i32 = 0; i < n; i++) Porffor.array.fastPush(args, __Porffor_threads_cross(rest[i]));

  const promise: any[] = __Porffor_promise_create();

  let available: i32 = 0;
  Porffor.c`available = (i32)porf_thread_available();`;
  if (available == 0) {
    __Porffor_threads_entry(fn, args, promise);
    return promise as Promise;
  }

  const fnType: i32 = Porffor.type(fn);
  const argsType: i32 = Porffor.type(args);
  const promiseType: i32 = Porffor.TYPES.promise;
  Porffor.c`porf_thread_fence();
porf_thread_spawn(fn.val, fnType, args.val, argsType, promise.val, promiseType);`;
  return promise as Promise;
};

export const __Porffor_threads_cown = (v: any): any => {
  const c: object = {};
  c.__porf_cown = 1;
  let lock: number = 0;
  Porffor.c`lock = porf_thread_lock_new();`;
  c.lock = lock;
  c.value = v;
  return Object.freeze(c);
};

export const __Porffor_threads_when = (...rest: any[]): any => {
  // copy out of the (statically allocated, per-site reused) rest array
  const m: i32 = rest.length;
  const args: any[] = Porffor.array.new(8);
  for (let i: i32 = 0; i < m; i++) Porffor.array.fastPush(args, rest[i]);

  const fn: any = args.pop();
  if (Porffor.type(fn) != Porffor.TYPES.function) throw new TypeError('when: last argument must be a function');

  const n: i32 = args.length;
  if (n == 0) throw new TypeError('when: expected at least one cown');
  for (let i: i32 = 0; i < n; i++) {
    const c: any = args[i];
    if (Porffor.type(c) != Porffor.TYPES.object) throw new TypeError('when: expected cown(s) then a function');
    if (c.__porf_cown != 1) throw new TypeError('when: expected cown(s) then a function');
  }

  args.sort((a: any, b: any) => a.lock - b.lock);
  for (let i: i32 = 0; i < n; i++) {
    const lock: number = args[i].lock;
    let got: i32 = 0;
    Porffor.c`got = porf_thread_try_lock(lock) != 0.0;`;
    while (got == 0) {
      let gen: number = 0;
      Porffor.c`gen = porf_thread_park_prepare(lock);
got = porf_thread_try_lock(lock) != 0.0;`;
      if (got == 0) Porffor.c`porf_thread_park(lock, gen);`;
    }
  }
  Porffor.c`porf_thread_fence();`;

  let ok: boolean = true;
  let ret: any;
  try {
    const interiors: any[] = Porffor.array.new(4);
    for (let i: i32 = 0; i < n; i++) Porffor.array.fastPush(interiors, args[i].value);
    ret = Porffor.call(fn, interiors, undefined, undefined);
  } catch (e) {
    ok = false;
    ret = e;
  }

  Porffor.c`porf_thread_fence();`;
  for (let i: i32 = 0; i < n; i++) {
    const lock: number = args[i].lock;
    Porffor.c`porf_thread_unlock(lock);
porf_thread_wake_one(lock);`;
  }

  if (!ok) throw ret;
  return __Promise_resolve(ret);
};

export const __Porffor_threads_channelSend = function (v: any): any {
  const ch: any = this;
  const vv: any = __Porffor_threads_cross(v);
  const lock: number = ch.lock;
  const items: any[] = ch.items;
  const meta: any[] = ch.meta;
  while (true) {
    let got: i32 = 0;
    Porffor.c`got = porf_thread_try_lock(lock) != 0.0;`;
    while (got == 0) {
      Porffor.c`porf_thread_yield();
got = porf_thread_try_lock(lock) != 0.0;`;
    }
    if (meta[0] == 1) {
      Porffor.c`porf_thread_unlock(lock);`;
      throw new TypeError('Channel is closed: cannot send');
    }
    if (items.length < meta[1]) {
      Porffor.array.fastPush(items, vv);
      Porffor.c`porf_thread_fence();
porf_thread_unlock(lock);
porf_thread_wake_one(lock);`;
      return undefined;
    }
    const key: number = lock + 0.5;
    let gen: number = 0;
    Porffor.c`gen = porf_thread_park_prepare(key);
porf_thread_unlock(lock);
porf_thread_park(key, gen);`;
  }
};

export const __Porffor_threads_channelRecv = function (): any {
  const ch: any = this;
  const lock: number = ch.lock;
  const items: any[] = ch.items;
  const meta: any[] = ch.meta;
  while (true) {
    let got: i32 = 0;
    Porffor.c`got = porf_thread_try_lock(lock) != 0.0;`;
    while (got == 0) {
      Porffor.c`porf_thread_yield();
got = porf_thread_try_lock(lock) != 0.0;`;
    }
    if (items.length > 0) {
      const v: any = items.shift();
      const key: number = lock + 0.5;
      Porffor.c`porf_thread_fence();
porf_thread_unlock(lock);
porf_thread_wake_one(key);`;
      return v;
    }
    if (meta[0] == 1) {
      Porffor.c`porf_thread_unlock(lock);`;
      return undefined;
    }
    let gen: number = 0;
    Porffor.c`gen = porf_thread_park_prepare(lock);
porf_thread_unlock(lock);
porf_thread_park(lock, gen);`;
  }
};

export const __Porffor_threads_channelClose = function (): any {
  const ch: any = this;
  const lock: number = ch.lock;
  const meta: any[] = ch.meta;
  let got: i32 = 0;
  Porffor.c`got = porf_thread_try_lock(lock) != 0.0;`;
  while (got == 0) {
    Porffor.c`porf_thread_yield();
got = porf_thread_try_lock(lock) != 0.0;`;
  }
  meta[0] = 1;
  const key: number = lock + 0.5;
  Porffor.c`porf_thread_fence();
porf_thread_unlock(lock);
porf_thread_wake(lock);
porf_thread_wake(key);`;
  return undefined;
};

export const __Porffor_threads_channelIsClosed = function (): boolean {
  const ch: any = this;
  const meta: any[] = ch.meta;
  return meta[0] == 1;
};

export const __Porffor_threads_Channel = function (capacity: any): any {
  if (!new.target) throw new TypeError("Constructor Porffor.threads.Channel requires 'new'");

  let cap: number = capacity == null ? 1 : Number(capacity);
  if (!(cap >= 1)) cap = 1;

  const meta: any[] = Porffor.array.new(2);
  meta[0] = 0;
  meta[1] = cap;

  const ch: object = {};
  ch.__porf_channel = 1;
  let lock: number = 0;
  Porffor.c`lock = porf_thread_lock_new();`;
  ch.lock = lock;
  ch.items = Porffor.array.new(8);
  ch.meta = meta;
  ch.send = __Porffor_threads_channelSend;
  ch.recv = __Porffor_threads_channelRecv;
  ch.close = __Porffor_threads_channelClose;
  ch.isClosed = __Porffor_threads_channelIsClosed;

  return Object.freeze(ch);
};
