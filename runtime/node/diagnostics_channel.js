import { nextTick } from './internal/loop.js';

const getContext = () => __Porffor_promise_getContext();
const setContext = context => __Porffor_promise_setContext(context);

// subscriber and transform errors don't stop the publish, they surface as uncaught exceptions
const reportLater = err => nextTick(() => {
  throw err;
});

const channels = new Map();

class Channel {
  constructor(name) {
    this._subscribers = [];
    this._stores = new Map();
    this.name = name;
    channels.set(name, this);
  }

  get hasSubscribers() {
    return this._subscribers.length > 0 || this._stores.size > 0;
  }

  subscribe(subscription) {
    this._subscribers = [ ...this._subscribers, subscription ];
  }

  unsubscribe(subscription) {
    const index = this._subscribers.indexOf(subscription);
    if (index === -1) return false;
    this._subscribers = this._subscribers.filter((_, i) => i !== index);
    return true;
  }

  bindStore(store, transform) {
    this._stores.set(store, transform);
  }

  unbindStore(store) {
    return this._stores.delete(store);
  }

  publish(data) {
    for (const onMessage of this._subscribers) {
      try {
        onMessage(data, this.name);
      } catch (err) {
        reportLater(err);
      }
    }
  }

  // each bound store enters its (transformed) data, then subscribers see the message
  runStores(data, fn, thisArg, ...args) {
    if (!this.hasSubscribers) return fn.apply(thisArg, args);
    const outer = getContext();
    try {
      for (const [ store, transform ] of this._stores) {
        let value = data;
        if (transform) {
          try {
            value = transform(data);
          } catch (err) {
            reportLater(err);
            continue;
          }
        }
        store.enterWith(value);
      }
      this.publish(data);
      return fn.apply(thisArg, args);
    } finally {
      setContext(outer);
    }
  }
}

export const channel = name => channels.get(name) ?? new Channel(name);

export const subscribe = (name, subscription) => channel(name).subscribe(subscription);
export const unsubscribe = (name, subscription) => channel(name).unsubscribe(subscription);
export const hasSubscribers = name => channels.get(name)?.hasSubscribers ?? false;

const traceEvents = [ 'start', 'end', 'asyncStart', 'asyncEnd', 'error' ];

// fn inside start's stores, publishing error (rethrown) and end around it
const traced = (tracing, context, fn) => tracing.start.runStores(context, () => {
  try {
    return fn();
  } catch (err) {
    context.error = err;
    tracing.error.publish(context);
    throw err;
  } finally {
    tracing.end.publish(context);
  }
});

class TracingChannel {
  // a name, or the channels themselves
  constructor(nameOrChannels) {
    for (const event of traceEvents) this[event] = typeof nameOrChannels === 'string' ? channel(`tracing:${nameOrChannels}:${event}`) : nameOrChannels[event];
  }

  get hasSubscribers() {
    return traceEvents.some(event => this[event].hasSubscribers);
  }

  subscribe(handlers) {
    for (const event of traceEvents) {
      if (handlers[event]) this[event].subscribe(handlers[event]);
    }
  }

  unsubscribe(handlers) {
    let done = true;
    for (const event of traceEvents) {
      if (handlers[event] && !this[event].unsubscribe(handlers[event])) done = false;
    }
    return done;
  }

  traceSync(fn, context = Object.create(null), thisArg, ...args) {
    if (!this.hasSubscribers) return fn.apply(thisArg, args);
    return traced(this, context, () => {
      const result = fn.apply(thisArg, args);
      context.result = result;
      return result;
    });
  }

  tracePromise(fn, context = Object.create(null), thisArg, ...args) {
    if (!this.hasSubscribers) return fn.apply(thisArg, args);
    const { asyncStart, asyncEnd, error } = this;
    const settle = () => asyncStart.runStores(context, () => asyncEnd.publish(context));
    const resolve = result => {
      context.result = result;
      settle();
      return result;
    };
    const reject = err => {
      context.error = err;
      error.publish(context);
      settle();
    };

    return traced(this, context, () => {
      const promise = fn.apply(thisArg, args);
      // a plain promise chains, other thenables are observed and returned as they are
      if (promise instanceof Promise && Object.getPrototypeOf(promise) === Promise.prototype) return promise.then(resolve, err => {
        reject(err);
        throw err;
      });
      if (typeof promise?.then !== 'function') {
        context.result = promise;
        return promise;
      }
      promise.then(resolve, reject);
      return promise;
    });
  }

  traceCallback(fn, position = -1, context = Object.create(null), thisArg, ...args) {
    if (!this.hasSubscribers) return fn.apply(thisArg, args);
    const { asyncStart, asyncEnd, error } = this;
    const callback = args.at(position);
    args.splice(position, 1, function (err, res) {
      if (err) {
        context.error = err;
        error.publish(context);
      } else {
        context.result = res;
      }
      return asyncStart.runStores(context, () => {
        try {
          return callback.apply(this, arguments);
        } finally {
          asyncEnd.publish(context);
        }
      });
    });

    return traced(this, context, () => fn.apply(thisArg, args));
  }
}

export const tracingChannel = nameOrChannels => new TracingChannel(nameOrChannels);

export default { channel, subscribe, unsubscribe, hasSubscribers, tracingChannel };
