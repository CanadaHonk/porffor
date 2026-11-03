// node's Event, EventTarget and AbortController
import { nextTick } from './loop.js';
import { setTimeout } from '../timers.js';
import { DOMException } from './domexception.js';
import { errEventRecursion, errIllegalConstructor } from './errors.js';

const kDispatch = Symbol('kDispatch');
const inspectCustom = Symbol.for('nodejs.util.inspect.custom');

// listener errors are rethrown outside the dispatch
const reportLater = err => nextTick(() => {
  throw err;
});

export class Event {
  #type;
  #cancelable;
  #bubbles;
  #composed;
  #defaultPrevented = false;
  #timeStamp = performance.now();
  #target = null;
  #dispatching = false;
  #stopped = false;
  #passive = false;

  constructor(type, options = undefined) {
    this.#type = `${type}`;
    this.#cancelable = !!options?.cancelable;
    this.#bubbles = !!options?.bubbles;
    this.#composed = !!options?.composed;
  }

  get type() {
    return this.#type;
  }

  get target() {
    return this.#target;
  }

  get currentTarget() {
    return this.#dispatching ? this.#target : null;
  }

  get cancelable() {
    return this.#cancelable;
  }

  get defaultPrevented() {
    return this.#cancelable && this.#defaultPrevented;
  }

  get bubbles() {
    return this.#bubbles;
  }

  get composed() {
    return this.#composed;
  }

  get timeStamp() {
    return this.#timeStamp;
  }

  get eventPhase() {
    return this.#dispatching ? 2 : 0;
  }

  composedPath() {
    return this.#dispatching ? [ this.#target ] : [];
  }

  preventDefault() {
    if (!this.#passive) this.#defaultPrevented = true;
  }

  stopPropagation() {}

  stopImmediatePropagation() {
    this.#stopped = true;
  }

  get [Symbol.toStringTag]() {
    return 'Event';
  }

  [kDispatch](target, listeners) {
    if (this.#dispatching) throw errEventRecursion(this.#type);
    this.#target = target;
    this.#dispatching = true;
    for (const handler of listeners.slice()) {
      if (handler.removed || this.#stopped) continue;
      if (handler.once) target.removeEventListener(this.#type, handler.listener, handler);
      this.#passive = handler.passive;
      try {
        const result = typeof handler.listener === 'function' ? handler.listener.call(target, this) : handler.listener.handleEvent?.(this);
        if (typeof result?.then === 'function') result.then(undefined, reportLater);
      } catch (err) {
        reportLater(err);
      }
      this.#passive = false;
    }
    this.#dispatching = false;
    return !this.defaultPrevented;
  }
}

export class CustomEvent extends Event {
  #detail;

  constructor(type, options = undefined) {
    super(type, options);
    this.#detail = options?.detail ?? null;
  }

  get detail() {
    return this.#detail;
  }
}

export class MessageEvent extends Event {
  #data;
  #origin;
  #lastEventId;
  #source;
  #ports;

  constructor(type, options = undefined) {
    super(type, options);
    this.#data = options?.data ?? null;
    this.#origin = `${options?.origin ?? ''}`;
    this.#lastEventId = `${options?.lastEventId ?? ''}`;
    this.#source = options?.source ?? null;
    this.#ports = [ ...(options?.ports ?? []) ];
  }

  get data() {
    return this.#data;
  }

  get origin() {
    return this.#origin;
  }

  get lastEventId() {
    return this.#lastEventId;
  }

  get source() {
    return this.#source;
  }

  get ports() {
    return this.#ports;
  }
}

export class EventTarget {
  #listeners = new Map();

  addEventListener(type, listener, options = undefined) {
    if (listener == null) return;
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    const signal = options?.signal;
    if (signal?.aborted) return;

    type = `${type}`;
    let list = this.#listeners.get(type);
    if (list === undefined) this.#listeners.set(type, list = []);
    if (list.some(x => x.listener === listener && x.capture === capture)) return;
    list.push({ listener, capture, once: !!options?.once, passive: !!options?.passive, removed: false });
    signal?.addEventListener('abort', () => this.removeEventListener(type, listener, capture), { once: true });
  }

  removeEventListener(type, listener, options = undefined) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    const list = this.#listeners.get(`${type}`);
    const i = list?.findIndex(x => x.listener === listener && x.capture === capture) ?? -1;
    if (i === -1) return;
    list[i].removed = true;
    list.splice(i, 1);
  }

  dispatchEvent(event) {
    return event[kDispatch](this, this.#listeners.get(event.type) ?? []);
  }

  get [Symbol.toStringTag]() {
    return 'EventTarget';
  }
}

const kConstruct = Symbol('kConstruct');
let abortSignal;

export class AbortSignal extends EventTarget {
  #aborted = false;
  #reason = undefined;
  #onabort = null;
  // AbortSignal.any's: the signals it follows, and per signal the composites following it
  #sources;
  #dependants;

  constructor(key) {
    if (key !== kConstruct) throw errIllegalConstructor();
    super();
  }

  static {
    abortSignal = (signal, reason) => signal.#abort(reason);
  }

  get aborted() {
    return this.#aborted;
  }

  get reason() {
    return this.#reason;
  }

  throwIfAborted() {
    if (this.#aborted) throw this.#reason;
  }

  get onabort() {
    return this.#onabort;
  }

  set onabort(handler) {
    if (this.#onabort !== null) this.removeEventListener('abort', this.#onabort);
    this.#onabort = typeof handler === 'function' ? handler : null;
    if (this.#onabort !== null) this.addEventListener('abort', this.#onabort);
  }

  // dependants are all aborted before any of the abort events run
  #abort(reason) {
    if (this.#aborted) return;
    const dependants = [ ...(this.#dependants ?? []) ].filter(signal => !signal.#aborted);
    for (const signal of [ this, ...dependants ]) {
      signal.#aborted = true;
      signal.#reason = reason;
    }
    this.#dependants = undefined;
    for (const signal of [ this, ...dependants ]) signal.dispatchEvent(new Event('abort'));
  }

  static abort(reason = new DOMException('This operation was aborted', 'AbortError')) {
    const signal = new AbortSignal(kConstruct);
    signal.#aborted = true;
    signal.#reason = reason;
    return signal;
  }

  static timeout(delay) {
    const signal = new AbortSignal(kConstruct);
    setTimeout(() => signal.#abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), delay).unref();
    return signal;
  }

  static any(signals) {
    const result = new AbortSignal(kConstruct);
    result.#sources = new Set();
    for (const signal of signals) {
      if (signal.#aborted) {
        result.#aborted = true;
        result.#reason = signal.#reason;
        return result;
      }
      // composites follow their sources directly
      for (const source of signal.#sources ?? [ signal ]) {
        result.#sources.add(source);
        (source.#dependants ??= new Set()).add(result);
      }
    }
    return result;
  }

  get [Symbol.toStringTag]() {
    return 'AbortSignal';
  }

  [inspectCustom](depth, options, inspect) {
    return `AbortSignal ${inspect({ aborted: this.#aborted }, options)}`;
  }
}

export class AbortController {
  #signal = new AbortSignal(kConstruct);

  get signal() {
    return this.#signal;
  }

  abort(reason = new DOMException('This operation was aborted', 'AbortError')) {
    abortSignal(this.#signal, reason);
  }

  get [Symbol.toStringTag]() {
    return 'AbortController';
  }

  [inspectCustom](depth, options, inspect) {
    return `AbortController ${inspect({ signal: this.#signal }, options)}`;
  }
}
