import { errInvalidArgType, errInvalidArgValue, errInvalidState } from '../errors.js';

export const kState = Symbol('kState');
const nop = () => {};

export const rejected = error => {
  const promise = Promise.reject(error);
  promise.catch(nop);
  return { promise };
};

export const pending = () => {
  const record = Promise.withResolvers();
  record.promise.catch(nop);
  return record;
};

export const highWaterMarkOf = (strategy, fallback) => {
  const hwm = strategy?.highWaterMark ?? fallback;
  if (Number.isNaN(+hwm) || hwm < 0) throw errInvalidArgValue('strategy.highWaterMark', hwm, 'is invalid', RangeError);
  return +hwm;
};

export class ReadableStream {
  constructor(source = {}, strategy = {}) {
    const bytes = source.type === 'bytes';
    if (!bytes && source.type !== undefined) throw errInvalidArgValue('source.type', source.type);
    const s = this[kState] = {
      state: 'readable', error: undefined, disturbed: false, reader: null, requests: [],
      queue: [], sizes: [], head: 0, queueSize: 0, closeRequested: false, started: false, pulling: false, pullAgain: false,
      hwm: highWaterMarkOf(strategy, bytes ? 0 : 1),
      size: bytes ? chunk => chunk.byteLength : strategy?.size ?? (() => 1),
      source, controller: null
    };
    s.controller = bytes ? new ReadableByteStreamController(s) : new ReadableStreamDefaultController(s);
    Promise.resolve(source.start?.(s.controller)).then(() => {
      s.started = true;
      callPull(s);
    }, e => errorStream(s, e));
  }

  get [Symbol.for('nodejs.stream.disturbed')]() {
    return this[kState].disturbed;
  }

  get [Symbol.for('nodejs.stream.errored')]() {
    return this[kState].state === 'errored';
  }

  get [Symbol.for('nodejs.stream.readable')]() {
    return this[kState].state === 'readable';
  }

  get locked() {
    return this[kState].reader !== null;
  }

  cancel(reason) {
    if (this.locked) return Promise.reject(errInvalidState('ReadableStream is locked', TypeError));
    return cancelStream(this[kState], reason);
  }

  getReader(options) {
    if (options?.mode !== undefined) throw errInvalidArgValue('options.mode', options.mode);
    return new ReadableStreamDefaultReader(this);
  }

  pipeThrough(transform, options) {
    this.pipeTo(transform.writable, options).catch(nop);
    return transform.readable;
  }

  pipeTo(dest, { preventClose = false, preventAbort = false, preventCancel = false, signal } = {}) {
    if (this.locked || dest.locked) return Promise.reject(errInvalidState('ReadableStream is locked', TypeError));
    const source = this[kState], reader = this.getReader(), writer = dest.getWriter();
    source.disturbed = true;

    return new Promise((resolve, reject) => {
      let shuttingDown = false, lastWrite = Promise.resolve();

      // action runs once, then both locks are released and the pipe settles
      const shutdown = (action, error, errored = false) => {
        if (shuttingDown) return;
        shuttingDown = true;
        signal?.removeEventListener('abort', abort);
        new Promise(r => r(action?.())).then(() => errored, e => {
          error = e;
          return true;
        }).then(failed => {
          writer.releaseLock();
          reader.releaseLock();
          if (failed) reject(error);
            else resolve();
        });
      };

      const abort = () => {
        const reason = signal.reason;
        shutdown(() => Promise.all([
          !preventAbort && dest[kState].state === 'writable' ? writer.abort(reason) : undefined,
          !preventCancel && source.state === 'readable' ? reader.cancel(reason) : undefined
        ]), reason, true);
      };
      if (signal) {
        if (signal.aborted) return abort();
        signal.addEventListener('abort', abort);
      }

      const pump = () => {
        if (shuttingDown) return;
        if (dest[kState].state === 'closed' || dest[kState].closeRequest) {
          const error = errInvalidState('Destination WritableStream is closed', TypeError);
          return shutdown(preventCancel ? null : () => reader.cancel(error), error, true);
        }
        writer.ready.then(() => shuttingDown ? { done: true } : reader.read()).then(({ value, done }) => {
          if (shuttingDown) return;
          if (done) return shutdown(() => lastWrite.then(() => preventClose ? undefined : writer.close()));
          lastWrite = writer.write(value);
          lastWrite.catch(nop);
          pump();
        }, nop);
      };

      reader.closed.catch(e => shutdown(preventAbort ? null : () => writer.abort(e), e, true));
      writer.closed.catch(e => shutdown(preventCancel ? null : () => reader.cancel(e), e, true));
      pump();
    });
  }

  tee() {
    const reader = this.getReader();
    const reasons = [];
    let reading = false, canceled = 0;
    const { promise: canceledAll, resolve: resolveCanceled } = Promise.withResolvers();

    const pull = () => {
      if (reading) return;
      reading = true;
      reader.read().then(({ value, done }) => {
        reading = false;
        for (const branch of branches) {
          const s = branch[kState];
          if (s.state !== 'readable' || s.closeRequested) continue;
          if (done) s.controller.close();
            else s.controller.enqueue(value);
        }
        if (done) resolveCanceled();
      }, nop);
    };
    const cancel = i => reason => {
      reasons[i] = reason;
      if (++canceled === 2) resolveCanceled(reader.cancel(reasons));
      return canceledAll;
    };
    const branches = [ new ReadableStream({ pull, cancel: cancel(0) }), new ReadableStream({ pull, cancel: cancel(1) }) ];
    reader.closed.catch(e => {
      for (const branch of branches) errorStream(branch[kState], e);
      resolveCanceled();
    });
    return branches;
  }

  values({ preventCancel = false } = {}) {
    const reader = this.getReader();
    let finished = false;
    const finish = () => {
      finished = true;
      reader.releaseLock();
    };
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next() {
        if (finished) return Promise.resolve({ done: true, value: undefined });
        return reader.read().then(result => {
          if (result.done) finish();
          return result;
        }, e => {
          finish();
          throw e;
        });
      },
      async return(value) {
        if (!finished) {
          const canceled = preventCancel ? undefined : reader.cancel(value);
          finish();
          await canceled;
        }
        return { done: true, value };
      }
    };
  }
}
ReadableStream.prototype[Symbol.asyncIterator] = ReadableStream.prototype.values;

export class ReadableStreamDefaultReader {
  #closed;

  constructor(stream) {
    const s = stream[kState];
    if (s.reader) throw errInvalidState('ReadableStream is locked', TypeError);
    s.reader = this;
    this[kState] = s;
    this.#closed = s.readerClosed = pending();
    if (s.state === 'closed') this.#closed.resolve();
      else if (s.state === 'errored') this.#closed.reject(s.error);
  }

  get closed() {
    return this.#closed.promise;
  }

  read() {
    const s = this[kState];
    if (!s) return Promise.reject(errInvalidState('Reader released', TypeError));
    s.disturbed = true;
    if (s.state === 'errored') return Promise.reject(s.error);
    if (s.queue.length > 0) {
      const value = s.queue[s.head];
      s.queueSize -= s.sizes[s.head++];
      // read chunks are dropped once they are half the queue, so a drained queue is empty
      if (s.head * 2 >= s.queue.length) {
        s.queue.splice(0, s.head);
        s.sizes.splice(0, s.head);
        s.head = 0;
      }
      if (s.closeRequested && s.queue.length === 0) closeStream(s);
        else callPull(s);
      return Promise.resolve({ value, done: false });
    }
    if (s.state === 'closed') return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve, reject) => {
      s.requests.push({ resolve, reject });
      callPull(s);
    });
  }

  cancel(reason) {
    if (!this[kState]) return Promise.reject(errInvalidState('Reader released', TypeError));
    return cancelStream(this[kState], reason);
  }

  releaseLock() {
    const s = this[kState];
    if (!s) return;
    const error = errInvalidState('Reader released', TypeError);
    for (const request of s.requests.splice(0)) request.reject(error);
    if (s.state === 'readable') this.#closed.reject(error);
      else this.#closed = rejected(error);
    s.reader = null;
    this[kState] = null;
  }
}

export class ReadableStreamDefaultController {
  constructor(s) {
    this[kState] = s;
  }

  get desiredSize() {
    const s = this[kState];
    return s.state === 'errored' ? null : s.state === 'closed' ? 0 : s.hwm - s.queueSize;
  }

  enqueue(chunk) {
    const s = this[kState];
    if (s.closeRequested || s.state !== 'readable') throw errInvalidState('Controller is already closed', TypeError);
    if (s.requests.length > 0) {
      s.requests.shift().resolve({ value: chunk, done: false });
    } else {
      let size;
      try {
        size = s.size(chunk);
      } catch (e) {
        errorStream(s, e);
        throw e;
      }
      s.queue.push(chunk);
      s.sizes.push(size);
      s.queueSize += size;
    }
    callPull(s);
  }

  close() {
    const s = this[kState];
    if (s.closeRequested || s.state !== 'readable') throw errInvalidState('Controller is already closed', TypeError);
    s.closeRequested = true;
    if (s.queue.length === 0) closeStream(s);
  }

  error(e) {
    errorStream(this[kState], e);
  }
}

export class ReadableByteStreamController extends ReadableStreamDefaultController {
  get byobRequest() {
    return null;
  }

  enqueue(chunk) {
    if (!ArrayBuffer.isView(chunk)) throw errInvalidArgType('chunk', [ 'Buffer', 'TypedArray', 'DataView' ], chunk);
    super.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  }
}

const callPull = s => {
  if (!s.started || s.state !== 'readable' || s.closeRequested) return;
  if (s.requests.length === 0 && s.hwm - s.queueSize <= 0) return;
  if (s.pulling) {
    s.pullAgain = true;
    return;
  }
  s.pulling = true;
  new Promise(resolve => resolve(s.source.pull?.(s.controller))).then(() => {
    s.pulling = false;
    if (s.pullAgain) {
      s.pullAgain = false;
      callPull(s);
    }
  }, e => errorStream(s, e));
};

const closeStream = s => {
  s.state = 'closed';
  for (const request of s.requests.splice(0)) request.resolve({ value: undefined, done: true });
  if (s.reader) s.readerClosed.resolve();
};

const errorStream = (s, e) => {
  if (s.state !== 'readable') return;
  s.state = 'errored';
  s.error = e;
  s.queue = [];
  s.sizes = [];
  s.head = 0;
  s.queueSize = 0;
  for (const request of s.requests.splice(0)) request.reject(e);
  if (s.reader) s.readerClosed.reject(e);
};

const cancelStream = (s, reason) => {
  s.disturbed = true;
  if (s.state === 'closed') return Promise.resolve();
  if (s.state === 'errored') return Promise.reject(s.error);
  s.queue = [];
  s.sizes = [];
  s.head = 0;
  s.queueSize = 0;
  closeStream(s);
  return new Promise(resolve => resolve(s.source.cancel?.(reason))).then(nop);
};

// whether the stream wants more chunks, by pending reads or room in the queue
export const readableWantsMore = controller => {
  const s = controller[kState];
  return s.requests.length > 0 || s.hwm - s.queueSize > 0;
};
