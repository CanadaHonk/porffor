import { Buffer } from '../../buffer.js';
import { StringDecoder } from '../../string_decoder.js';
import process from '../../process.js';
import { nextTick } from '../loop.js';
import { Stream } from './legacy.js';
import { eos, addAbortSignal } from './end-of-stream.js';
import { construct, destroy, destroyer, errorOrDestroy, undestroy } from './destroy.js';
import { getHighWaterMark } from './utils.js';
import {
  aggregateTwoErrors, errInvalidArgType, errMethodNotImplemented, errStreamNullValues, errStreamPushAfterEof, errStreamUnshiftAfterEnd
} from '../errors.js';

export function ReadableState(options, stream, isDuplex) {
  this.objectMode = !!(options?.objectMode || isDuplex && options?.readableObjectMode);
  this.highWaterMark = getHighWaterMark(options, this.objectMode, isDuplex && 'readableHighWaterMark');

  // chunks before bufferIndex are already read
  this.buffer = [];
  this.bufferIndex = 0;
  this.length = 0;
  this.pipes = [];
  this.awaitDrainWriters = null;
  this.multiAwaitDrain = false;

  // null until something consumes the stream
  this.flowing = null;
  this.paused = null;
  this.ended = false;
  this.endEmitted = false;
  this.endScheduled = false;
  this.eofReadablePending = false;
  this.reading = false;
  this.readingMore = false;
  this.sync = true;
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.dataListening = false;
  this.resumeScheduled = false;
  this.dataEmitted = false;

  this.constructed = true;
  this.destroyed = false;
  this.errored = null;
  this.errorEmitted = false;
  this.closed = false;
  this.closeEmitted = false;
  this.emitClose = options?.emitClose !== false;
  this.autoDestroy = options?.autoDestroy !== false;

  this.defaultEncoding = options?.defaultEncoding || 'utf8';
  this.decoder = null;
  this.encoding = null;
  if (options?.encoding) {
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

export function Readable(options) {
  if (!(this instanceof Readable)) return new Readable(options);

  this._readableState = new ReadableState(options, this, false);
  if (options) {
    if (typeof options.read === 'function') this._read = options.read;
    if (typeof options.destroy === 'function') this._destroy = options.destroy;
    if (typeof options.construct === 'function') this._construct = options.construct;
    if (options.signal) addAbortSignal(options.signal, this);
  }

  Stream.call(this, options);
  if (this._construct) construct(this, () => readableConstructed(this));
}
Object.setPrototypeOf(Readable.prototype, Stream.prototype);
Object.setPrototypeOf(Readable, Stream);
Readable.ReadableState = ReadableState;

export const readableConstructed = stream => {
  const state = stream._readableState;
  if (state.needReadable) maybeReadMore(stream, state);
};

Readable.prototype.destroy = destroy;
Readable.prototype._undestroy = undestroy;
Readable.prototype._destroy = function (err, cb) {
  cb(err);
};

Readable.prototype._read = function () {
  throw errMethodNotImplemented('_read()');
};

Readable.prototype.push = function (chunk, encoding) {
  return readableAddChunk(this, chunk, encoding, false);
};

Readable.prototype.unshift = function (chunk, encoding) {
  return readableAddChunk(this, chunk, encoding, true);
};

const readableAddChunk = (stream, chunk, encoding, addToFront) => {
  const state = stream._readableState;
  if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
    return false;
  }

  if (!state.objectMode) {
    if (typeof chunk === 'string') {
      encoding ||= state.defaultEncoding;
      if (state.encoding !== encoding) {
        if (addToFront && state.encoding) {
          chunk = Buffer.from(chunk, encoding).toString(state.encoding);
        } else {
          chunk = Buffer.from(chunk, encoding);
          encoding = '';
        }
      }
    } else if (chunk instanceof Buffer) {
      encoding = '';
    } else if (ArrayBuffer.isView(chunk)) {
      chunk = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      encoding = '';
    } else if (chunk !== undefined) {
      errorOrDestroy(stream, errInvalidArgType('chunk', [ 'string', 'Buffer', 'TypedArray', 'DataView' ], chunk));
      return false;
    }

    if (!chunk || chunk.length === 0) {
      if (!addToFront) {
        state.reading = false;
        maybeReadMore(stream, state);
      }
      return canPushMore(state);
    }
  }

  if (addToFront) {
    if (state.endEmitted) {
      errorOrDestroy(stream, errStreamUnshiftAfterEnd());
      return false;
    }
    if (state.destroyed || state.errored) return false;
    addChunk(stream, state, chunk, true);
    return canPushMore(state);
  }

  if (state.ended) {
    errorOrDestroy(stream, errStreamPushAfterEof());
    return false;
  }
  if (state.destroyed || state.errored) return false;

  state.reading = false;
  if (state.decoder && !encoding) {
    chunk = state.decoder.write(chunk);
    if (!state.objectMode && chunk.length === 0) {
      maybeReadMore(stream, state);
      return canPushMore(state);
    }
  }
  addChunk(stream, state, chunk, false);
  return canPushMore(state);
};

const canPushMore = state => !state.ended && (state.length < state.highWaterMark || state.length === 0);

const addChunk = (stream, state, chunk, addToFront) => {
  if (state.flowing && !state.sync && state.dataListening && state.length === 0) {
    if (state.multiAwaitDrain) state.awaitDrainWriters.clear();
      else state.awaitDrainWriters = null;
    state.dataEmitted = true;
    stream.emit('data', chunk);
  } else {
    state.length += state.objectMode ? 1 : chunk.length;
    if (!addToFront) state.buffer.push(chunk);
      else if (state.bufferIndex > 0) state.buffer[--state.bufferIndex] = chunk;
      else state.buffer.unshift(chunk);
    if (state.needReadable) emitReadable(stream);
  }
  maybeReadMore(stream, state);
};

Readable.prototype.isPaused = function () {
  const state = this._readableState;
  return state.paused === true || state.flowing === false;
};

Readable.prototype.setEncoding = function (enc) {
  const state = this._readableState;
  const decoder = new StringDecoder(enc);
  state.decoder = decoder;
  state.encoding = decoder.encoding;

  let content = '';
  for (let i = state.bufferIndex; i < state.buffer.length; i++) content += decoder.write(state.buffer[i]);
  if (state.ended) content += decoder.end();
  state.buffer = content === '' ? [] : [ content ];
  state.bufferIndex = 0;
  state.length = content.length;
  return this;
};

const computeNewHighWaterMark = n => 2 ** Math.ceil(Math.log2(n));

const howMuchToRead = (n, state) => {
  if (n <= 0 || (state.length === 0 && state.ended)) return 0;
  if (state.objectMode) return 1;
  if (Number.isNaN(n)) {
    // one chunk at a time, unless decoded text is asked for
    if (state.length && (state.flowing || !state.decoder)) return state.buffer[state.bufferIndex].length;
    return state.length;
  }
  if (n <= state.length) return n;
  return state.ended ? state.length : 0;
};

Readable.prototype.read = function (n) {
  if (n === undefined) n = NaN;
    else if (!Number.isInteger(n)) n = Number.parseInt(n, 10);
  const state = this._readableState;
  const nOrig = n;

  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
  if (n !== 0) state.emittedReadable = state.eofReadablePending = false;

  if (n === 0 && state.needReadable && ((state.highWaterMark !== 0 ? state.length >= state.highWaterMark : state.length > 0) || state.ended)) {
    if (state.length === 0 && state.ended) endReadable(this);
      else emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);
  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable(this);
    return null;
  }

  // chunks are taken after _read, which may push synchronously
  if (!state.ended && !state.reading && !state.destroyed && !state.errored && state.constructed &&
    (state.needReadable || state.length === 0 || state.length - n < state.highWaterMark)) {
    state.reading = true;
    state.sync = true;
    if (state.length === 0) state.needReadable = true;
    try {
      this._read(state.highWaterMark);
    } catch (err) {
      errorOrDestroy(this, err);
    }
    state.sync = false;
    if (!state.reading) n = howMuchToRead(nOrig, state);
  }

  const ret = n > 0 ? fromList(n, state) : null;
  if (ret === null) {
    if (state.length <= state.highWaterMark) state.needReadable = true;
    n = 0;
  } else {
    state.length -= n;
    if (state.multiAwaitDrain) state.awaitDrainWriters.clear();
      else state.awaitDrainWriters = null;
  }

  if (state.length === 0) {
    if (!state.ended) state.needReadable = true;
    if (nOrig !== n && state.ended) endReadable(this);
  }

  if (ret !== null && !state.errorEmitted && !state.closeEmitted) {
    state.dataEmitted = true;
    this.emit('data', ret);
  }
  return ret;
};

const onEofChunk = (stream, state) => {
  if (state.ended) return;
  if (state.decoder) {
    const chunk = state.decoder.end();
    if (chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  if (state.sync) {
    // unobserved: a later 'readable' listener gets this
    if (state.flowing || state.needReadable || stream.listenerCount('readable') > 0) emitReadable(stream);
      else state.eofReadablePending = true;
  } else {
    state.needReadable = false;
    state.emittedReadable = true;
    emitReadable_(stream);
  }
};

const emitReadable = stream => {
  const state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    state.emittedReadable = true;
    nextTick(emitReadable_, stream);
  }
};

const emitReadable_ = stream => {
  const state = stream._readableState;
  if (!state.destroyed && !state.errored && (state.length || state.ended)) {
    stream.emit('readable');
    state.emittedReadable = false;
  }
  if (!state.flowing && !state.ended && state.length <= state.highWaterMark) state.needReadable = true;
  flow(stream);
};

const maybeReadMore = (stream, state) => {
  if (!state.readingMore && !state.reading && state.constructed) {
    state.readingMore = true;
    nextTick(maybeReadMore_, stream, state);
  }
};

const maybeReadMore_ = (stream, state) => {
  while (!state.reading && !state.ended && (state.length < state.highWaterMark || (state.flowing && state.length === 0))) {
    const len = state.length;
    stream.read(0);
    if (len === state.length) break;
  }
  state.readingMore = false;
};

Readable.prototype.pipe = function (dest, pipeOpts) {
  const src = this;
  const state = this._readableState;

  if (state.pipes.length === 1 && !state.multiAwaitDrain) {
    state.multiAwaitDrain = true;
    state.awaitDrainWriters = new Set(state.awaitDrainWriters ? [ state.awaitDrainWriters ] : []);
  }
  state.pipes.push(dest);

  const doEnd = pipeOpts?.end !== false && dest !== process.stdout && dest !== process.stderr;
  const endFn = doEnd ? onend : unpipe;
  if (state.endEmitted) nextTick(endFn);
    else src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable, unpipeInfo) {
    if (readable === src && unpipeInfo?.hasUnpiped === false) {
      unpipeInfo.hasUnpiped = true;
      cleanup();
    }
  }

  function onend() {
    dest.end();
  }

  let ondrain;
  let cleanedUp = false;
  function cleanup() {
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    if (ondrain) dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', unpipe);
    src.removeListener('data', ondata);
    cleanedUp = true;

    // a source waiting on this dest's 'drain' would never flow again
    if (ondrain && state.awaitDrainWriters) ondrain();
  }

  function pause() {
    // an unpipe during dest.write() could leave the source paused for good
    if (!cleanedUp) {
      if (state.pipes.length === 1 && state.pipes[0] === dest) {
        state.awaitDrainWriters = dest;
        state.multiAwaitDrain = false;
      } else if (state.pipes.length > 1 && state.pipes.includes(dest)) {
        state.awaitDrainWriters.add(dest);
      }
      src.pause();
    }
    if (!ondrain) {
      ondrain = pipeOnDrain(src, dest);
      dest.on('drain', ondrain);
    }
  }

  src.on('data', ondata);
  function ondata(chunk) {
    try {
      if (dest.write(chunk) === false) pause();
    } catch (error) {
      dest.destroy(error);
    }
  }

  function onerror(er) {
    unpipe();
    dest.removeListener('error', onerror);
    if (dest.listenerCount('error') === 0) {
      const s = dest._writableState || dest._readableState;
      if (s && !s.errorEmitted) errorOrDestroy(dest, er);
        else dest.emit('error', er);
    }
  }
  dest.prependListener('error', onerror);

  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    src.unpipe(dest);
  }

  dest.emit('pipe', src);

  if (dest.writableNeedDrain === true) pause();
    else if (!state.flowing) src.resume();
  return dest;
};

const pipeOnDrain = (src, dest) => () => {
  const state = src._readableState;
  if (state.awaitDrainWriters === dest) state.awaitDrainWriters = null;
    else if (state.multiAwaitDrain) state.awaitDrainWriters.delete(dest);
  if ((!state.awaitDrainWriters || state.awaitDrainWriters.size === 0) && state.dataListening) src.resume();
};

Readable.prototype.unpipe = function (dest) {
  const state = this._readableState;
  if (state.pipes.length === 0) return this;

  if (!dest) {
    const dests = state.pipes;
    state.pipes = [];
    this.pause();
    for (let i = 0; i < dests.length; i++) dests[i].emit('unpipe', this, { hasUnpiped: false });
    return this;
  }

  const index = state.pipes.indexOf(dest);
  if (index === -1) return this;
  state.pipes.splice(index, 1);
  if (state.pipes.length === 0) this.pause();
  dest.emit('unpipe', this, { hasUnpiped: false });
  return this;
};

Readable.prototype.on = function (ev, fn) {
  const res = Stream.prototype.on.call(this, ev, fn);
  const state = this._readableState;

  if (ev === 'data') {
    state.dataListening = true;
    if (this.listenerCount('readable') > 0) state.readableListening = true;
    if (state.flowing !== false) this.resume();
  } else if (ev === 'readable' && !state.endEmitted && !state.readableListening) {
    state.readableListening = state.needReadable = true;
    state.flowing = false;
    state.emittedReadable = false;
    if (state.length || state.eofReadablePending) {
      state.eofReadablePending = false;
      emitReadable(this);
    }
    if (!state.length && !state.reading) nextTick(nReadingNextTick, this);
  }
  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

Readable.prototype.removeListener = function (ev, fn) {
  const res = Stream.prototype.removeListener.call(this, ev, fn);
  if (ev === 'readable') nextTick(updateReadableListening, this);
    else if (ev === 'data' && this.listenerCount('data') === 0) this._readableState.dataListening = false;
  return res;
};
Readable.prototype.off = Readable.prototype.removeListener;

Readable.prototype.removeAllListeners = function (ev) {
  const res = Stream.prototype.removeAllListeners.apply(this, arguments);
  if (ev === 'readable' || ev === undefined) nextTick(updateReadableListening, this);
  return res;
};

const updateReadableListening = self => {
  const state = self._readableState;
  state.readableListening = self.listenerCount('readable') > 0;
  if (state.resumeScheduled && state.paused === false) state.flowing = true;
    else if (state.dataListening) self.resume();
    else if (!state.readableListening) state.flowing = null;
};

const nReadingNextTick = self => {
  self.read(0);
};

Readable.prototype.resume = function () {
  const state = this._readableState;
  if (state.destroyed) return this;
  if (!state.flowing) {
    // readable listeners keep the stream in paused mode
    state.flowing = !state.readableListening;
    if (!state.resumeScheduled) {
      state.resumeScheduled = true;
      nextTick(resume_, this, state);
    }
  }
  state.paused = false;
  return this;
};

const resume_ = (stream, state) => {
  if (!state.reading) stream.read(0);
  state.resumeScheduled = false;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading) stream.read(0);
};

Readable.prototype.pause = function () {
  const state = this._readableState;
  if (state.destroyed) return this;
  if (state.flowing !== false) {
    state.flowing = false;
    this.emit('pause');
  }
  state.paused = true;
  return this;
};

const flow = stream => {
  const state = stream._readableState;
  while (state.flowing && stream.read() !== null);
};

const AsyncIteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf(async function* () {}).prototype);

Readable.prototype[Symbol.asyncIterator] = function () {
  const stream = this;
  // undefined: running, null: ended cleanly
  let error;
  let started = false, completed = false, cleanup;
  let wakeup = null, waiting = null;

  const wake = () => {
    if (wakeup) {
      const resolve = wakeup;
      wakeup = null;
      resolve();
    }
  };

  const finish = () => {
    completed = true;
    if (!started) return;
    if (error === undefined || stream._readableState.autoDestroy) {
      destroyer(stream, null);
    } else {
      stream.off('readable', wake);
      cleanup();
    }
  };

  const fail = err => {
    error = aggregateTwoErrors(error, err);
    finish();
    throw error;
  };

  const step = () => {
    if (completed) return { done: true, value: undefined };
    if (!started) {
      started = true;
      stream.on('readable', wake);
      cleanup = eos(stream, { writable: false }, err => {
        error = err ? aggregateTwoErrors(error, err) : null;
        wake();
      });
    }

    const value = stream.destroyed ? null : stream.read();
    if (value !== null) {
      if (typeof value?.then === 'function') return value.then(value => ({ done: false, value }), fail);
      return { done: false, value };
    }
    if (error === undefined) {
      waiting = new Promise(resolve => {
        wakeup = resolve;
      }).then(() => {
        waiting = null;
        return step();
      });
      return waiting;
    }
    const err = error;
    finish();
    if (err) throw err;
    return { done: true, value: undefined };
  };

  const iterator = {
    __proto__: AsyncIteratorPrototype,
    next() {
      // calls made while one waits run after it
      if (waiting) return waiting.then(() => iterator.next(), () => iterator.next());
      try {
        return Promise.resolve(step());
      } catch (err) {
        return Promise.reject(err);
      }
    },
    return(value) {
      if (waiting) return waiting.then(() => iterator.return(value), () => iterator.return(value));
      if (!completed) finish();
      return Promise.resolve({ done: true, value });
    }
  };
  return iterator;
};

Object.defineProperties(Readable.prototype, {
  readable: {
    get() {
      const r = this._readableState;
      return !!r && r.readable !== false && !r.destroyed && !r.errorEmitted && !r.endEmitted;
    },
    set(value) {
      if (this._readableState) this._readableState.readable = !!value;
    }
  },
  readableDidRead: {
    get() { return this._readableState.dataEmitted; }
  },
  readableAborted: {
    get() {
      const r = this._readableState;
      return r.readable !== false && (r.destroyed || !!r.errored) && !r.endEmitted;
    }
  },
  readableHighWaterMark: {
    get() { return this._readableState.highWaterMark; }
  },
  readableFlowing: {
    get() { return this._readableState.flowing; },
    set(value) {
      if (this._readableState) this._readableState.flowing = value;
    }
  },
  readableLength: {
    get() { return this._readableState.length; }
  },
  readableObjectMode: {
    get() { return this._readableState ? this._readableState.objectMode : false; }
  },
  readableEncoding: {
    get() { return this._readableState ? this._readableState.encoding : null; }
  },
  readableEnded: {
    get() { return this._readableState ? this._readableState.endEmitted : false; }
  },
  errored: {
    get() { return this._readableState ? this._readableState.errored : null; }
  },
  closed: {
    get() { return this._readableState ? this._readableState.closed : false; }
  },
  destroyed: {
    get() { return this._readableState ? this._readableState.destroyed : false; },
    set(value) {
      if (this._readableState) this._readableState.destroyed = value;
    }
  }
});

const fromList = (n, state) => {
  if (state.length === 0) return null;

  const buf = state.buffer;
  const len = buf.length;
  let idx = state.bufferIndex;
  let ret;

  if (state.objectMode || n === buf[idx].length || (n >= state.length && len - idx === 1)) {
    ret = buf[idx];
    buf[idx++] = null;
  } else if (n < buf[idx].length) {
    ret = buf[idx].slice(0, n);
    buf[idx] = buf[idx].slice(n);
  } else {
    const total = Math.min(n, state.length);
    const parts = [];
    for (let left = total; left > 0;) {
      const chunk = buf[idx];
      if (left >= chunk.length) {
        parts.push(chunk);
        left -= chunk.length;
        buf[idx++] = null;
      } else {
        parts.push(chunk.slice(0, left));
        buf[idx] = chunk.slice(left);
        left = 0;
      }
    }
    ret = state.decoder ? parts.join('') : Buffer.concat(parts, total);
  }

  if (idx === len) {
    state.buffer = [];
    state.bufferIndex = 0;
  } else if (idx > 1024) {
    buf.splice(0, idx);
    state.bufferIndex = 0;
  } else {
    state.bufferIndex = idx;
  }
  return ret;
};

const endReadable = stream => {
  const state = stream._readableState;
  if (!state.endEmitted && !state.endScheduled) {
    state.ended = true;
    state.endScheduled = true;
    nextTick(endReadableNT, state, stream);
  }
};

const endReadableNT = (state, stream) => {
  // endReadable() may schedule again after an unshift, or once undestroyed
  state.endScheduled = false;
  if (state.errored || state.closeEmitted || state.endEmitted || state.length !== 0) return;

  state.endEmitted = true;
  stream.emit('end');

  if (stream.writable && stream.allowHalfOpen === false) {
    nextTick(endWritableNT, stream);
  } else if (state.autoDestroy) {
    const w = stream._writableState;
    if (!w || (w.autoDestroy && (w.finished || w.writable === false))) stream.destroy();
  }
};

const endWritableNT = stream => {
  if (stream.writable && !stream.writableEnded && !stream.destroyed) stream.end();
};

Readable.from = (iterable, opts) => {
  if (typeof iterable === 'string' || iterable instanceof Buffer) {
    return new Readable({
      objectMode: true,
      ...opts,
      read() {
        this.push(iterable);
        this.push(null);
      }
    });
  }

  let iterator, isAsync;
  if (typeof iterable?.[Symbol.asyncIterator] === 'function') {
    isAsync = true;
    iterator = iterable[Symbol.asyncIterator]();
  } else if (typeof iterable?.[Symbol.iterator] === 'function') {
    isAsync = false;
    iterator = iterable[Symbol.iterator]();
  } else {
    throw errInvalidArgType('iterable', [ 'Iterable' ], iterable);
  }

  let reading = false;
  // runs synchronously for sync iterators until a value is a promise
  const next = async () => {
    for (;;) {
      try {
        const { value, done } = isAsync ? await iterator.next() : iterator.next();
        if (done) {
          readable.push(null);
          return;
        }
        const chunk = !isAsync && typeof value?.then === 'function' ? await value : value;
        if (chunk === null) {
          reading = false;
          throw errStreamNullValues();
        }
        if (readable.push(chunk)) continue;
        reading = false;
      } catch (err) {
        readable.destroy(err);
      }
      return;
    }
  };

  const close = async error => {
    if (error != null && typeof iterator.throw === 'function') {
      const { value, done } = await iterator.throw(error);
      await value;
      if (done) return;
    }
    if (typeof iterator.return === 'function') await (await iterator.return()).value;
  };

  const readable = new Readable({
    objectMode: true,
    highWaterMark: 1,
    ...opts,
    read() {
      if (!reading) {
        reading = true;
        next();
      }
    },
    destroy(error, cb) {
      close(error).then(() => nextTick(cb, error), closeError => nextTick(cb, aggregateTwoErrors(error, closeError)));
    }
  });
  return readable;
};
