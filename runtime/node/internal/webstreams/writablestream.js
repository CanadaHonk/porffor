import { errInvalidState } from '../errors.js';
import { kState, highWaterMarkOf, pending, rejected } from './readablestream.js';

const kReady = Symbol('kReady');
const kClosed = Symbol('kClosed');

export class WritableStream {
  constructor(sink = {}, strategy = {}) {
    const s = this[kState] = {
      state: 'writable', error: undefined, writer: null, queue: [], queueSize: 0, started: false, inFlight: false,
      closeRequest: null, pendingAbort: null, backpressure: false,
      hwm: highWaterMarkOf(strategy, 1), size: strategy?.size ?? (() => 1),
      sink, controller: null
    };
    s.controller = new WritableStreamDefaultController(s);
    updateBackpressure(s);
    Promise.resolve(sink.start?.(s.controller)).then(() => {
      s.started = true;
      advance(s);
    }, e => {
      s.started = true;
      fail(s, e);
    });
  }

  get locked() {
    return this[kState].writer !== null;
  }

  abort(reason) {
    if (this.locked) return Promise.reject(errInvalidState('WritableStream is locked', TypeError));
    return abortStream(this[kState], reason);
  }

  close() {
    if (this.locked) return Promise.reject(errInvalidState('WritableStream is locked', TypeError));
    return closeStream(this[kState]);
  }

  getWriter() {
    return new WritableStreamDefaultWriter(this);
  }
}

export class WritableStreamDefaultWriter {
  constructor(stream) {
    const s = stream[kState];
    if (s.writer) throw errInvalidState('WritableStream is locked', TypeError);
    s.writer = this;
    this[kState] = s;
    this[kReady] = s.state === 'writable' || s.state === 'closed' ? pending() : rejected(s.error);
    this[kClosed] = s.state === 'errored' ? rejected(s.error) : pending();
    if (s.state === 'closed' || (s.state === 'writable' && !s.backpressure)) this[kReady].resolve();
    if (s.state === 'closed') this[kClosed].resolve();
  }

  get closed() {
    return this[kClosed].promise;
  }

  get ready() {
    return this[kReady].promise;
  }

  get desiredSize() {
    const s = this[kState];
    if (!s) throw errInvalidState('Writer released', TypeError);
    return s.state === 'errored' || s.state === 'erroring' ? null : s.state === 'closed' ? 0 : s.hwm - s.queueSize;
  }

  abort(reason) {
    if (!this[kState]) return Promise.reject(errInvalidState('Writer released', TypeError));
    return abortStream(this[kState], reason);
  }

  close() {
    if (!this[kState]) return Promise.reject(errInvalidState('Writer released', TypeError));
    return closeStream(this[kState]);
  }

  write(chunk) {
    const s = this[kState];
    if (!s) return Promise.reject(errInvalidState('Writer released', TypeError));
    if (s.state === 'errored' || s.state === 'erroring') return Promise.reject(s.error);
    if (s.state === 'closed' || s.closeRequest) return Promise.reject(errInvalidState('WritableStream is closed', TypeError));
    let size;
    try {
      size = s.size(chunk);
    } catch (e) {
      startErroring(s, e);
      return Promise.reject(e);
    }
    return new Promise((resolve, reject) => {
      s.queue.push({ chunk, size, resolve, reject });
      s.queueSize += size;
      updateBackpressure(s);
      advance(s);
    });
  }

  releaseLock() {
    const s = this[kState];
    if (!s) return;
    const error = errInvalidState('Writer released', TypeError);
    this[kReady] = rejected(error);
    this[kClosed] = rejected(error);
    s.writer = null;
    this[kState] = null;
  }
}

export class WritableStreamDefaultController {
  constructor(s) {
    this[kState] = s;
  }

  error(e) {
    if (this[kState].state === 'writable') startErroring(this[kState], e);
  }
}

const updateBackpressure = s => {
  const backpressure = s.hwm - s.queueSize <= 0;
  if (backpressure === s.backpressure || s.state !== 'writable' || s.closeRequest) return;
  s.backpressure = backpressure;
  if (!s.writer) return;
  if (backpressure) s.writer[kReady] = pending();
    else s.writer[kReady].resolve();
};

// runs the next queued write or the close, one sink call at a time
const advance = s => {
  if (!s.started || s.inFlight) return;
  if (s.state === 'erroring') return finishErroring(s);
  if (s.state !== 'writable') return;

  if (s.queue.length === 0) {
    if (!s.closeRequest) return;
    s.inFlight = true;
    new Promise(resolve => resolve(s.sink.close?.())).then(() => {
      s.inFlight = false;
      s.state = 'closed';
      s.closeRequest.resolve();
      s.writer?.[kClosed].resolve();
      if (s.pendingAbort) s.pendingAbort.resolve();
    }, e => {
      s.inFlight = false;
      s.closeRequest.reject(e);
      fail(s, e);
    });
    return;
  }

  const write = s.queue[0];
  s.inFlight = true;
  new Promise(resolve => resolve(s.sink.write?.(write.chunk, s.controller))).then(() => {
    s.inFlight = false;
    s.queue.shift();
    s.queueSize -= write.size;
    write.resolve();
    updateBackpressure(s);
    advance(s);
  }, e => {
    s.inFlight = false;
    write.reject(e);
    s.queue.shift();
    fail(s, e);
  });
};

const fail = (s, e) => {
  if (s.state === 'writable') startErroring(s, e);
  finishErroring(s);
};

const startErroring = (s, reason) => {
  s.state = 'erroring';
  s.error = reason;
  // a ready still pending rejects in place
  if (s.writer && s.backpressure && !s.closeRequest) s.writer[kReady].reject(reason);
    else if (s.writer) s.writer[kReady] = rejected(reason);
  if (s.started && !s.inFlight) finishErroring(s);
};

const finishErroring = s => {
  if (s.state !== 'erroring') return;
  s.state = 'errored';
  for (const write of s.queue) write.reject(s.error);
  s.queue = [];
  s.queueSize = 0;
  s.closeRequest?.reject(s.error);
  s.writer?.[kClosed].reject(s.error);

  const abort = s.pendingAbort;
  if (!abort) return;
  new Promise(resolve => resolve(s.sink.abort?.(abort.reason))).then(() => abort.resolve(), abort.reject);
};

const abortStream = (s, reason) => {
  if (s.state === 'closed' || s.state === 'errored') return Promise.resolve();
  if (s.pendingAbort) return s.pendingAbort.promise;
  s.pendingAbort = Promise.withResolvers();
  s.pendingAbort.reason = reason;
  if (s.state === 'writable') startErroring(s, reason);
  return s.pendingAbort.promise;
};

const closeStream = s => {
  if (s.state === 'closed' || s.closeRequest) return Promise.reject(errInvalidState('WritableStream is closed', TypeError));
  if (s.state !== 'writable') return Promise.reject(s.error);
  s.closeRequest = pending();
  if (s.backpressure) s.writer?.[kReady].resolve();
  advance(s);
  return s.closeRequest.promise;
};
