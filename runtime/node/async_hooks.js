// async context: a Map of AsyncLocalStorage -> store, carried through promise jobs, timers, ticks and i/o
const getContext = () => __Porffor_promise_getContext();
const setContext = context => __Porffor_promise_setContext(context);

const withContext = (context, fn, thisArg, args) => {
  const outer = getContext();
  setContext(context);
  try {
    return fn.apply(thisArg, args);
  } finally {
    setContext(outer);
  }
};

const withEntry = (key, value) => {
  const next = new Map(getContext());
  if (value === undefined) next.delete(key);
    else next.set(key, value);
  return next;
};

export class AsyncLocalStorage {
  getStore() {
    return getContext()?.get(this);
  }

  run(store, callback, ...args) {
    return withContext(withEntry(this, store), callback, undefined, args);
  }

  exit(callback, ...args) {
    return withContext(withEntry(this, undefined), callback, undefined, args);
  }

  enterWith(store) {
    setContext(withEntry(this, store));
  }

  static snapshot() {
    const context = getContext();
    return (fn, ...args) => withContext(context, fn, undefined, args);
  }

  static bind(fn) {
    const context = getContext();
    return function (...args) {
      return withContext(context, fn, this, args);
    };
  }
}

// hooks see the resources made through AsyncResource
const hooks = new Set();
const emitHook = (name, ...args) => {
  for (const hook of [ ...hooks ]) hook.callbacks[name]?.(...args);
};

export const createHook = callbacks => ({
  callbacks,
  enable() {
    hooks.add(this);
    return this;
  },
  disable() {
    hooks.delete(this);
    return this;
  }
});

// async ids: 1 is the top level, the others are AsyncResources
let nextAsyncId = 1, currentAsyncId = 1;

export class AsyncResource {
  constructor(type) {
    this._asyncId = ++nextAsyncId;
    this._context = getContext();
    emitHook('init', this._asyncId, type, currentAsyncId, this);
  }

  runInAsyncScope(fn, thisArg, ...args) {
    const outer = currentAsyncId;
    currentAsyncId = this._asyncId;
    emitHook('before', this._asyncId);
    try {
      return withContext(this._context, fn, thisArg, args);
    } finally {
      emitHook('after', this._asyncId);
      currentAsyncId = outer;
    }
  }

  bind(fn, thisArg) {
    const resource = this;
    return function (...args) {
      return resource.runInAsyncScope(fn, thisArg === undefined ? this : thisArg, ...args);
    };
  }

  emitDestroy() {
    emitHook('destroy', this._asyncId);
    return this;
  }

  asyncId() {
    return this._asyncId;
  }

  static bind(fn, type, thisArg) {
    return new AsyncResource(type || fn.name || 'bound-anonymous-fn').bind(fn, thisArg);
  }
}

// no async ids are tracked: these are node's values for the top level
export const executionAsyncId = () => 1;
export const triggerAsyncId = () => 0;

export default { AsyncLocalStorage, AsyncResource, createHook, executionAsyncId, triggerAsyncId };
