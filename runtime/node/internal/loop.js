// the node event loop: timers, immediates and nextTick in js, i/o through a backend (libuv) when one is linked
import { errInvalidArgType } from './errors.js';

const getContext = () => __Porffor_promise_getContext();
const setContext = context => __Porffor_promise_setContext(context);

let backend = null;
export const setBackend = b => {
  backend = b;
};

// c run(arg) on the threadpool then callback(status) on the loop, false without a backend so callers work inline
export const queueWork = (run, arg, callback) => backend !== null && backend.queueWork(run, arg, callback);

// errors no callback caught go to process's 'uncaughtException' handling, else end the program
let uncaughtHandler = null;
export const setUncaughtHandler = handler => {
  uncaughtHandler = handler;
};

export const reportUncaught = err => {
  if (!uncaughtHandler || !uncaughtHandler(err)) throw err;
};

// callbacks run so far: an await idling on the loop made progress if this moved
let invoked = 0;

export const invoke = (callback, thisArg, args, context) => {
  invoked++;
  const outer = getContext();
  setContext(context);
  try {
    Reflect.apply(callback, thisArg, args);
  } catch (err) {
    reportUncaught(err);
    setContext(outer);
    return false;
  }
  setContext(outer);
  return true;
};

let ticks = [], tickHead = 0;
export const nextTick = (callback, ...args) => {
  if (typeof callback !== 'function') throw errInvalidArgType('callback', 'Function', callback);
  ticks.push({ callback, args, context: getContext() });
};

// nextTicks, then promise jobs, until both are empty
export const drain = () => {
  for (;;) {
    while (tickHead < ticks.length) {
      const tick = ticks[tickHead++];
      invoke(tick.callback, undefined, tick.args, tick.context);
    }
    ticks = [];
    tickHead = 0;
    __Porffor_promise_runReactions();
    if (ticks.length > 0) continue;
    __Porffor_promise_runJobs();
    if (ticks.length === 0) return;
  }
};

// timers: a binary heap of [ at, seq, timer ] entries, cancelled lazily
const heap = [];
let seq = 0, refTimers = 0, deadEntries = 0;

const before = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

const swap = (i, j) => {
  const x = heap[i];
  heap[i] = heap[j];
  heap[j] = x;
};

const heapPush = entry => {
  heap.push(entry);
  for (let i = heap.length - 1; i > 0;) {
    const parent = (i - 1) >> 1;
    if (!before(heap[i], heap[parent])) break;
    swap(i, parent);
    i = parent;
  }
};

const heapPop = () => {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length === 0) return top;
  heap[0] = last;
  for (let i = 0;;) {
    const l = i * 2 + 1, r = l + 1;
    let min = i;
    if (l < heap.length && before(heap[l], heap[min])) min = l;
    if (r < heap.length && before(heap[r], heap[min])) min = r;
    if (min === i) break;
    swap(i, min);
    i = min;
  }
  return top;
};

const live = entry => entry[2]._entry === entry;

// a timer refreshed since its entry was queued goes back in at its new due time
const peekTimer = () => {
  for (;;) {
    while (heap.length > 0 && !live(heap[0])) {
      heapPop();
      deadEntries--;
    }
    if (heap.length === 0 || heap[0][0] === heap[0][2]._at) return heap[0];
    const timer = heapPop()[2];
    heapPush(timer._entry = [ timer._at, timer._seq, timer ]);
  }
};

// cleared timers leave their entries behind until they are most of the heap
const dropEntry = timer => {
  timer._entry = null;
  if (++deadEntries < 1024 || deadEntries * 2 < heap.length) return;
  let n = 0;
  for (const entry of heap) if (live(entry)) heap[n++] = entry;
  heap.length = n;
  heap.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  deadEntries = 0;
};

// timers whose id was taken, for clearTimeout(id)
const timersById = new Map();

// fields follow node's Timeout (_idleTimeout -1 once cleared), durations outside [1, 2^31 - 1] become 1
export class Timeout {
  constructor(callback, after, args, repeat) {
    after *= 1;
    if (!(after >= 1 && after <= 2147483647)) after = 1;
    this._idleTimeout = after;
    this._onTimeout = callback;
    this._timerArgs = args;
    this._repeat = repeat ? after : null;
    this._destroyed = false;
    this._context = getContext();
    this._active = false;
    this._ref = true;
    this._at = 0;
    this._seq = 0;
    this._entry = null;
    this._id = ++seq;
    this._hasPrimitive = false;
  }

  _schedule(at) {
    if (!this._active) {
      this._active = true;
      if (this._ref) refTimers++;
    }
    this._destroyed = false;
    this._at = at;
    this._seq = ++seq;
    if (this._entry !== null && this._entry[0] <= at) return this;
    if (this._entry !== null) dropEntry(this);
    heapPush(this._entry = [ at, this._seq, this ]);
    return this;
  }

  _cancel() {
    if (!this._active) return;
    this._active = false;
    if (this._ref) refTimers--;
    if (this._entry !== null) dropEntry(this);
  }

  ref() {
    if (!this._ref && this._active) refTimers++;
    this._ref = true;
    return this;
  }

  unref() {
    if (this._ref && this._active) refTimers--;
    this._ref = false;
    return this;
  }

  hasRef() {
    return this._ref;
  }

  // also re-arms a timer that already fired, unless it was cleared
  refresh() {
    if (this._idleTimeout !== -1) startTimer(this);
    return this;
  }

  close() {
    cancelTimer(this);
    return this;
  }

  [Symbol.toPrimitive]() {
    if (!this._hasPrimitive) {
      this._hasPrimitive = true;
      timersById.set(this._id, this);
    }
    return this._id;
  }
}

export const startTimer = timer => timer._schedule(performance.now() + Math.trunc(timer._idleTimeout));

const unenroll = timer => {
  if (timer._destroyed) return;
  timer._destroyed = true;
  if (timer._hasPrimitive) timersById.delete(timer._id);
  timer._cancel();
  timer._idleTimeout = -1;
};

export const cancelTimer = timer => {
  if (typeof timer === 'number' || typeof timer === 'string') timer = timersById.get(Number(timer));
  if (!(timer instanceof Timeout)) return;
  timer._onTimeout = null;
  unenroll(timer);
};

// an interval reschedules after its callback, so the callback can clear or refresh it
const runTimers = () => {
  const now = performance.now();
  for (let entry = peekTimer(); entry && entry[0] <= now; entry = peekTimer()) {
    heapPop();
    const timer = entry[2];
    timer._entry = null;
    timer._cancel();
    if (timer._onTimeout) {
      invoke(timer._onTimeout, timer, timer._timerArgs, timer._context);
      if (timer._repeat && timer._idleTimeout !== -1) timer._schedule(now + Math.trunc(timer._repeat));
    }
    if (!timer._active && !timer._destroyed) {
      timer._destroyed = true;
      if (timer._hasPrimitive) timersById.delete(timer._id);
    }
    drain();
  }
};

let immediates = [], refImmediates = 0;

export class Immediate {
  constructor(callback, args) {
    this._onImmediate = callback;
    this._argv = args;
    this._destroyed = false;
    this._context = getContext();
    this._ref = true;
    refImmediates++;
  }

  ref() {
    if (!this._ref && !this._destroyed) refImmediates++;
    this._ref = true;
    return this;
  }

  unref() {
    if (this._ref && !this._destroyed) refImmediates--;
    this._ref = false;
    return this;
  }

  hasRef() {
    return this._ref;
  }
}

export const startImmediate = immediate => {
  immediates.push(immediate);
  return immediate;
};

const destroyImmediate = immediate => {
  immediate._destroyed = true;
  if (immediate._ref) refImmediates--;
};

export const cancelImmediate = immediate => {
  if (!(immediate instanceof Immediate) || immediate._destroyed) return;
  destroyImmediate(immediate);
  immediate._onImmediate = null;
};

// immediates queued while these run wait for the next turn
const runImmediates = () => {
  const queue = immediates;
  immediates = [];
  for (const immediate of queue) {
    if (immediate._destroyed) continue;
    destroyImmediate(immediate);
    if (invoke(immediate._onImmediate, immediate, immediate._argv, immediate._context)) drain();
  }
  drain();
};

const sleep = ms => {
  Porffor.c`porf_idle_sleep(porf_jv_val(ms));`;
};

export const activeResources = () => [ ...heap.filter(live).map(() => 'Timeout'), ...immediates.filter(x => !x._destroyed).map(() => 'Immediate') ];

// other things keeping the process alive while they wait (message ports)
let refHandles = 0;
export const refLoop = delta => {
  refHandles += delta;
};

const alive = () => refTimers > 0 || refImmediates > 0 || refHandles > 0 || (backend !== null && backend.alive());

// one turn of timers, i/o (waiting until the next timer at most) and immediates, false once nothing is alive
const step = () => {
  const before = invoked;
  runTimers();
  if (!alive()) return false;

  // timers that ran may have settled a top-level await, so no waiting
  const next = peekTimer();
  const timeout = immediates.length > 0 || invoked !== before ? 0 : next ? Math.max(0, next[0] - performance.now()) : -1;
  // only message ports alive: nothing can wake the loop, so it sleeps for good
  if (timeout < 0 && (backend === null || !backend.alive())) sleep(1e9);
    else if (backend) backend.poll(timeout);
    else if (timeout > 0) sleep(timeout);
  drain();

  runImmediates();
  return true;
};

const beforeExitHooks = [], exitHooks = [];
// the loop ran dry ('beforeExit'): work these schedule turns it again
export const onBeforeExit = hook => {
  beforeExitHooks.push(hook);
};
export const onExit = hook => {
  exitHooks.push(hook);
};

// runs once main finishes
export const run = () => {
  drain();
  do {
    while (step());
    for (const hook of beforeExitHooks) hook();
    drain();
  } while (alive());
  for (const hook of exitHooks) hook();
};

Object.defineProperty(globalThis, '__porffor_node_loop', { value: run, configurable: true });
// a top-level await on something the loop settles keeps turning it
__Porffor_promise_setIdleHook(() => {
  const before = invoked;
  drain();
  // ticks that ran may have settled the await, so don't block in the backend first
  if (invoked !== before) return true;
  // the last timer can settle the await and leave nothing alive, it still ran
  return step() || invoked !== before;
});
