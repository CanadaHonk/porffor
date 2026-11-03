import { nextTick } from './internal/loop.js';
import { errInvalidArgType, errOutOfRange, errUnhandledError, abortError, inspect } from './internal/errors.js';

const kCapture = Symbol('kCapture');
// _events given by a subclass before init keeps its keys (streams declare theirs up front)
const kShapeMode = Symbol('shapeMode');
const kRejection = Symbol.for('nodejs.rejection');
export const errorMonitor = Symbol('events.errorMonitor');
export const captureRejectionSymbol = kRejection;

const checkListener = listener => {
  if (typeof listener !== 'function') throw errInvalidArgType('listener', 'Function', listener);
};

const checkMaxListeners = n => {
  if (typeof n !== 'number' || n < 0 || n !== n) throw errOutOfRange('n', 'a non-negative number', n);
};

let defaultMaxListeners = 10;

// a plain function so pre-class code can EventEmitter.call(this)
export function EventEmitter(opts) {
  EventEmitter.init.call(this, opts);
}

EventEmitter.init = function (opts) {
  if (this._events === undefined || this._events === Object.getPrototypeOf(this)._events) {
    this._events = Object.create(null);
    this._eventsCount = 0;
    this[kShapeMode] = false;
  } else {
    this[kShapeMode] = true;
  }
  this._maxListeners = this._maxListeners || undefined;
  this[kCapture] = opts?.captureRejections ?? EventEmitter.prototype[kCapture];
};

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._eventsCount = 0;
EventEmitter.prototype._maxListeners = undefined;
EventEmitter.prototype[kCapture] = false;

const addListener = (target, type, listener, prepend) => {
  checkListener(listener);
  let events = target._events, existing;
  if (events === undefined) {
    events = target._events = Object.create(null);
    target._eventsCount = 0;
  } else {
    if (events.newListener !== undefined) {
      target.emit('newListener', type, listener.listener ?? listener);
      events = target._events;
    }
    existing = events[type];
  }

  if (existing === undefined) {
    events[type] = listener;
    target._eventsCount++;
    return target;
  }
  if (typeof existing === 'function') existing = events[type] = prepend ? [ listener, existing ] : [ existing, listener ];
    else if (prepend) existing.unshift(listener);
    else existing.push(listener);

  const max = getMaxListeners(target);
  if (max > 0 && existing.length > max && !existing.warned) {
    existing.warned = true;
    const name = target.constructor?.name || 'EventEmitter';
    const warning = new Error(`Possible EventEmitter memory leak detected. ${existing.length} ${String(type)} listeners added to [${name}]. MaxListeners is ${max}. Use emitter.setMaxListeners() to increase limit`);
    warning.name = 'MaxListenersExceededWarning';
    warning.emitter = target;
    warning.type = type;
    warning.count = existing.length;
    // process imports events, so it is only reached through the global
    globalThis.process?.emitWarning(warning);
  }
  return target;
};

const onceWrap = (target, type, listener) => {
  let fired = false;
  const wrapped = function (...args) {
    if (fired) return;
    target.removeListener(type, wrapped);
    fired = true;
    return listener.apply(target, args);
  };
  wrapped.listener = listener;
  return wrapped;
};

EventEmitter.prototype.setMaxListeners = function (n) {
  checkMaxListeners(n);
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.getMaxListeners = function () {
  return getMaxListeners(this);
};

// a listener returning a rejected promise goes to Symbol.for('nodejs.rejection') or 'error' when capturing
const addCatch = (emitter, promise, type, args) => {
  if (!emitter[kCapture] || typeof promise.then !== 'function') return;
  promise.then(undefined, err => nextTick(() => {
    if (typeof emitter[kRejection] === 'function') return emitter[kRejection](err, type, ...args);
    emitter[kCapture] = false;
    try {
      emitter.emit('error', err);
    } finally {
      emitter[kCapture] = true;
    }
  }));
};

EventEmitter.prototype.emit = function (type, ...args) {
  let doError = type === 'error';
  const events = this._events;
  if (events !== undefined) {
    if (doError && events[errorMonitor] !== undefined) this.emit(errorMonitor, ...args);
    doError = doError && events.error === undefined;
  } else if (!doError) {
    return false;
  }

  if (doError) {
    const er = args[0];
    if (er instanceof Error) throw er;
    const err = errUnhandledError(inspect(er));
    err.context = er;
    throw err;
  }

  const handler = events[type];
  if (handler === undefined) return false;
  if (typeof handler === 'function') {
    const result = handler.apply(this, args);
    if (result != null) addCatch(this, result, type, args);
  } else {
    const listeners = handler.slice();
    for (let i = 0; i < listeners.length; i++) {
      const result = listeners[i].apply(this, args);
      if (result != null) addCatch(this, result, type, args);
    }
  }
  return true;
};

EventEmitter.prototype.addListener = function (type, listener) {
  return addListener(this, type, listener, false);
};
EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener = function (type, listener) {
  return addListener(this, type, listener, true);
};

EventEmitter.prototype.once = function (type, listener) {
  checkListener(listener);
  this.on(type, onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener = function (type, listener) {
  checkListener(listener);
  this.prependListener(type, onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.removeListener = function (type, listener) {
  checkListener(listener);
  const events = this._events;
  if (events === undefined) return this;
  const list = events[type];
  if (list === undefined) return this;

  if (list === listener || list.listener === listener) {
    if (this[kShapeMode]) {
      this._eventsCount--;
      events[type] = undefined;
    } else if (--this._eventsCount === 0) {
      this._events = Object.create(null);
    } else {
      delete events[type];
      if (events.removeListener) this.emit('removeListener', type, list.listener || listener);
    }
  } else if (typeof list !== 'function') {
    let position = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] === listener || list[i].listener === listener) {
        position = i;
        break;
      }
    }
    if (position < 0) return this;
    list.splice(position, 1);
    if (list.length === 1) events[type] = list[0];
    if (events.removeListener !== undefined) this.emit('removeListener', type, listener);
  }
  return this;
};
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners = function (type) {
  const events = this._events;
  if (events === undefined) return this;

  if (events.removeListener === undefined) {
    if (arguments.length === 0) {
      this._events = Object.create(null);
      this._eventsCount = 0;
    } else if (events[type] !== undefined) {
      if (--this._eventsCount === 0) this._events = Object.create(null);
        else delete events[type];
    }
    this[kShapeMode] = false;
    return this;
  }

  if (arguments.length === 0) {
    for (const key of Reflect.ownKeys(events)) {
      if (key !== 'removeListener') this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = Object.create(null);
    this._eventsCount = 0;
    this[kShapeMode] = false;
    return this;
  }

  const listeners = events[type];
  if (typeof listeners === 'function') {
    this.removeListener(type, listeners);
  } else if (listeners !== undefined) {
    for (let i = listeners.length - 1; i >= 0; i--) this.removeListener(type, listeners[i]);
  }
  return this;
};

EventEmitter.prototype.listeners = function (type) {
  const list = this._events?.[type];
  if (list === undefined) return [];
  if (typeof list === 'function') return [ list.listener || list ];
  return list.map(x => x.listener || x);
};

EventEmitter.prototype.rawListeners = function (type) {
  const list = this._events?.[type];
  if (list === undefined) return [];
  return typeof list === 'function' ? [ list ] : list.slice();
};

EventEmitter.prototype.eventNames = function () {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events).filter(key => this._events[key] !== undefined) : [];
};

EventEmitter.prototype.listenerCount = function (type, listener) {
  const list = this._events?.[type];
  if (list === undefined) return 0;
  if (typeof list === 'function') return listener == null || listener === list || listener === list.listener ? 1 : 0;
  if (listener == null) return list.length;
  let matching = 0;
  for (const x of list) {
    if (x === listener || x.listener === listener) matching++;
  }
  return matching;
};

// the deprecated static form
export const listenerCount = (emitter, type) => typeof emitter.listenerCount === 'function' ? emitter.listenerCount(type) : EventEmitter.prototype.listenerCount.call(emitter, type);

// event targets keep theirs in _maxListeners too
export const getMaxListeners = target => target._maxListeners ?? defaultMaxListeners;

export const setMaxListeners = (n = defaultMaxListeners, ...targets) => {
  checkMaxListeners(n);
  if (targets.length === 0) defaultMaxListeners = n;
  for (const target of targets) target._maxListeners = n;
};

const listen = (target, name, listener, flags) => {
  if (typeof target.on === 'function') {
    if (flags?.once) target.once(name, listener);
      else target.on(name, listener);
  } else {
    target.addEventListener(name, listener, flags);
  }
};

const unlisten = (target, name, listener) => {
  if (typeof target.removeListener === 'function') target.removeListener(name, listener);
    else target.removeEventListener(name, listener);
};

export const once = async (emitter, name, options = {}) => {
  const signal = options?.signal;
  if (signal?.aborted) throw abortError(signal.reason);
  return new Promise((resolve, reject) => {
    const onError = err => {
      unlisten(emitter, name, resolver);
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    };
    const resolver = (...args) => {
      if (typeof emitter.removeListener === 'function') emitter.removeListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      resolve(args);
    };
    const onAbort = () => {
      unlisten(emitter, name, resolver);
      unlisten(emitter, 'error', onError);
      reject(abortError(signal.reason));
    };
    listen(emitter, name, resolver, { once: true });
    if (name !== 'error' && typeof emitter.once === 'function') emitter.once('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
};

// async iterator over emitted events, ending on the close events or an abort, throwing on 'error'
export const on = (emitter, event, options = {}) => {
  const signal = options?.signal;
  if (signal?.aborted) throw abortError(signal.reason);
  const closeEvents = options?.close ?? [];

  const unconsumed = [], waiting = [];
  let error = null, finished = false;

  const listeners = [];
  const add = (name, fn) => {
    listen(emitter, name, fn);
    listeners.push([ name, fn ]);
  };
  const cleanup = () => {
    for (const [ name, fn ] of listeners) unlisten(emitter, name, fn);
    signal?.removeEventListener('abort', onAbort);
  };
  const closeHandler = () => {
    cleanup();
    finished = true;
    while (waiting.length > 0) waiting.shift().resolve({ value: undefined, done: true });
  };
  const errorHandler = err => {
    if (waiting.length > 0) waiting.shift().reject(err);
      else error = err;
    closeHandler();
  };
  const onAbort = () => errorHandler(abortError(signal.reason));

  add(event, (...args) => {
    if (waiting.length > 0) waiting.shift().resolve({ value: args, done: false });
      else unconsumed.push(args);
  });
  if (event !== 'error' && typeof emitter.on === 'function') add('error', errorHandler);
  for (const name of closeEvents) add(name, closeHandler);
  signal?.addEventListener('abort', onAbort, { once: true });

  return {
    next() {
      if (unconsumed.length > 0) return Promise.resolve({ value: unconsumed.shift(), done: false });
      if (error) {
        const err = error;
        error = null;
        return Promise.reject(err);
      }
      if (finished) return Promise.resolve({ value: undefined, done: true });
      return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
    },
    return() {
      closeHandler();
      return Promise.resolve({ value: undefined, done: true });
    },
    throw(err) {
      errorHandler(err);
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
};

// the dispose removes the listener before it runs
export const addAbortListener = (signal, listener) => {
  let removed = false;
  const remove = () => {
    removed = true;
    signal.removeEventListener('abort', listener);
  };
  if (signal.aborted) nextTick(() => removed || listener());
    else signal.addEventListener('abort', listener, { once: true });
  return { [Symbol.dispose]: remove };
};

Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
  enumerable: true,
  get: () => defaultMaxListeners,
  set: n => {
    checkMaxListeners(n);
    defaultMaxListeners = n;
  }
});

Object.defineProperty(EventEmitter, 'captureRejections', {
  enumerable: true,
  get: () => EventEmitter.prototype[kCapture],
  set: value => {
    EventEmitter.prototype[kCapture] = value;
  }
});

EventEmitter.EventEmitter = EventEmitter;
EventEmitter.captureRejectionSymbol = kRejection;
EventEmitter.errorMonitor = errorMonitor;
EventEmitter.once = once;
EventEmitter.on = on;
EventEmitter.getMaxListeners = getMaxListeners;
EventEmitter.setMaxListeners = setMaxListeners;
EventEmitter.listenerCount = listenerCount;

export default EventEmitter;
