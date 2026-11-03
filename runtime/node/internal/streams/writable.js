import { Buffer } from '../../buffer.js';
import { nextTick } from '../loop.js';
import { Stream } from './legacy.js';
import { construct, destroy, errorOrDestroy, undestroy } from './destroy.js';
import { addAbortSignal } from './end-of-stream.js';
import { getHighWaterMark } from './utils.js';
import {
  errInvalidArgType, errMethodNotImplemented, errMultipleCallback, errStreamAlreadyFinished, errStreamCannotPipe, errStreamDestroyed, errStreamNullValues,
  errStreamWriteAfterEnd, errUnknownEncoding
} from '../errors.js';

const nop = () => {};

export function WritableState(options, stream, isDuplex) {
  this.objectMode = !!(options?.objectMode || isDuplex && options?.writableObjectMode);
  this.highWaterMark = getHighWaterMark(options, this.objectMode, isDuplex && 'writableHighWaterMark');
  this.decodeStrings = options?.decodeStrings !== false;
  this.defaultEncoding = options?.defaultEncoding || 'utf8';

  this.length = 0;
  this.corked = 0;
  this.writing = false;
  this.sync = true;
  this.onwrite = er => onwrite(stream, er);
  this.writecb = nop;
  this.writelen = 0;
  this.expectWriteCb = false;
  this.afterWriteTickInfo = null;
  this.afterWritePending = false;
  this.pendingcb = 0;

  // writes waiting while one is in flight or corked, before bufferedIndex done
  this.buffered = [];
  this.bufferedIndex = 0;
  this.bufferProcessing = false;
  this.allBuffers = true;
  this.allNoop = true;

  this.needDrain = false;
  this.ending = false;
  this.ended = false;
  this.finalCalled = false;
  this.prefinished = false;
  this.finished = false;
  this.onFinished = [];

  this.constructed = true;
  this.destroyed = false;
  this.errored = null;
  this.errorEmitted = false;
  this.closed = false;
  this.closeEmitted = false;
  this.emitClose = options?.emitClose !== false;
  this.autoDestroy = options?.autoDestroy !== false;
}

const resetBuffer = state => {
  state.buffered = [];
  state.bufferedIndex = 0;
  state.allBuffers = true;
  state.allNoop = true;
};

export function Writable(options) {
  if (!(this instanceof Writable)) return new Writable(options);

  this._writableState = new WritableState(options, this, false);
  if (options) {
    if (typeof options.write === 'function') this._write = options.write;
    if (typeof options.writev === 'function') this._writev = options.writev;
    if (typeof options.destroy === 'function') this._destroy = options.destroy;
    if (typeof options.final === 'function') this._final = options.final;
    if (typeof options.construct === 'function') this._construct = options.construct;
    if (options.signal) addAbortSignal(options.signal, this);
  }

  Stream.call(this, options);
  if (this._construct) construct(this, () => writableConstructed(this));
}
Object.setPrototypeOf(Writable.prototype, Stream.prototype);
Object.setPrototypeOf(Writable, Stream);
Writable.WritableState = WritableState;

// duplexes are writables too
Object.defineProperty(Writable, Symbol.hasInstance, {
  value: function (instance) {
    if (Function.prototype[Symbol.hasInstance].call(this, instance)) return true;
    return this === Writable && instance?._writableState instanceof WritableState;
  }
});

export const writableConstructed = stream => {
  const state = stream._writableState;
  if (!state.writing) clearBuffer(stream, state);
  if (state.ending) finishMaybe(stream, state);
};

Writable.prototype.pipe = function () {
  errorOrDestroy(this, errStreamCannotPipe());
};

// returns the error, or whether more can be written
const _write = (stream, chunk, encoding, cb) => {
  const state = stream._writableState;
  if (typeof cb !== 'function') cb = nop;
  if (chunk === null) throw errStreamNullValues();

  if (!state.objectMode) {
    if (!encoding) encoding = state.defaultEncoding;
      else if (encoding !== 'buffer' && !Buffer.isEncoding(encoding)) throw errUnknownEncoding(encoding);

    if (typeof chunk === 'string') {
      if (state.decodeStrings) {
        chunk = Buffer.from(chunk, encoding);
        encoding = 'buffer';
      }
    } else if (chunk instanceof Buffer) {
      encoding = 'buffer';
    } else if (ArrayBuffer.isView(chunk)) {
      chunk = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      encoding = 'buffer';
    } else {
      throw errInvalidArgType('chunk', [ 'string', 'Buffer', 'TypedArray', 'DataView' ], chunk);
    }
  }

  let err;
  if (state.ending) err = errStreamWriteAfterEnd();
    else if (state.destroyed) err = errStreamDestroyed('write');
  if (err) {
    nextTick(cb, err);
    errorOrDestroy(stream, err, true);
    return err;
  }

  state.pendingcb++;
  state.length += state.objectMode ? 1 : chunk.length;

  if (state.writing || state.corked || state.errored || !state.constructed) {
    state.buffered.push({ chunk, encoding, callback: cb });
    if (encoding !== 'buffer') state.allBuffers = false;
    if (cb !== nop) state.allNoop = false;
  } else {
    doWrite(stream, state, false, state.objectMode ? 1 : chunk.length, chunk, encoding, cb);
  }

  const ret = state.length < state.highWaterMark || state.length === 0;
  if (!ret) state.needDrain = true;
  return ret && !state.destroyed && !state.errored;
};

Writable.prototype.write = function (chunk, encoding, cb) {
  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }
  return _write(this, chunk, encoding, cb) === true;
};

Writable.prototype.cork = function () {
  this._writableState.corked++;
};

Writable.prototype.uncork = function () {
  const state = this._writableState;
  if (state.corked) {
    state.corked--;
    if (!state.writing) clearBuffer(this, state);
  }
};

const doWrite = (stream, state, writev, len, chunk, encoding, cb) => {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  state.expectWriteCb = true;
  if (state.destroyed) state.onwrite(errStreamDestroyed('write'));
    else if (writev) stream._writev(chunk, state.onwrite);
    else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
};

const onwriteError = (stream, state, er, cb) => {
  --state.pendingcb;
  cb(er);
  errorBuffer(state);
  errorOrDestroy(stream, er);
};

const onwrite = (stream, er) => {
  const state = stream._writableState;
  if (!state.expectWriteCb) {
    errorOrDestroy(stream, errMultipleCallback());
    return;
  }

  const sync = state.sync;
  const cb = state.writecb;
  state.writecb = nop;
  state.writing = false;
  state.expectWriteCb = false;
  state.length -= state.writelen;
  state.writelen = 0;

  if (er) {
    state.errored ??= er;
    if (stream._readableState && !stream._readableState.errored) stream._readableState.errored = er;
    if (sync) nextTick(onwriteError, stream, state, er, cb);
      else onwriteError(stream, state, er, cb);
    return;
  }

  if (state.buffered.length > state.bufferedIndex) clearBuffer(stream, state);

  if (!sync) {
    afterWrite(stream, state, 1, cb);
  } else if (cb !== nop) {
    // sync writes sharing a callback get it called once per write, in one tick
    if (state.afterWriteTickInfo?.cb === cb) {
      state.afterWriteTickInfo.count++;
    } else {
      state.afterWriteTickInfo = { count: 1, cb, stream, state };
      state.afterWritePending = true;
      nextTick(afterWriteTick, state.afterWriteTickInfo);
    }
  } else if (!state.afterWritePending && ((state.needDrain && state.length === 0) || state.objectMode)) {
    // node tests the objectMode bit here (an operator precedence slip), kept for identical timing
    state.afterWritePending = true;
    nextTick(afterWrite, stream, state, 1, cb);
  } else {
    state.pendingcb--;
    if (state.ending) finishMaybe(stream, state, true);
  }
};

const afterWriteTick = ({ stream, state, count, cb }) => {
  state.afterWriteTickInfo = null;
  afterWrite(stream, state, count, cb);
};

const afterWrite = (stream, state, count, cb) => {
  state.afterWritePending = false;
  if (state.needDrain && state.length === 0 && !state.ending && !state.destroyed) {
    state.needDrain = false;
    stream.emit('drain');
  }

  while (count-- > 0) {
    state.pendingcb--;
    cb(null);
  }

  if (state.destroyed) errorBuffer(state);
  if (state.ending) finishMaybe(stream, state, true);
};

const errorBuffer = state => {
  if (state.writing) return;
  for (let n = state.bufferedIndex; n < state.buffered.length; ++n) {
    const { chunk, callback } = state.buffered[n];
    state.length -= state.objectMode ? 1 : chunk.length;
    callback(state.errored ?? errStreamDestroyed('write'));
  }
  callFinishedCallbacks(state, state.errored ?? errStreamDestroyed('end'));
  resetBuffer(state);
};

const clearBuffer = (stream, state) => {
  if (state.corked || state.bufferProcessing || state.destroyed || !state.constructed) return;

  const { buffered, bufferedIndex } = state;
  const bufferedLength = buffered.length - bufferedIndex;
  if (!bufferedLength) return;

  let i = bufferedIndex;
  state.bufferProcessing = true;
  if (bufferedLength > 1 && stream._writev) {
    state.pendingcb -= bufferedLength - 1;
    const callback = state.allNoop ? nop : err => {
      for (let n = i; n < buffered.length; ++n) buffered[n].callback(err);
    };
    const chunks = state.allNoop && i === 0 ? buffered : buffered.slice(i);
    chunks.allBuffers = state.allBuffers;
    doWrite(stream, state, true, state.length, chunks, '', callback);
    resetBuffer(state);
  } else {
    do {
      const { chunk, encoding, callback } = buffered[i];
      buffered[i++] = null;
      doWrite(stream, state, false, state.objectMode ? 1 : chunk.length, chunk, encoding, callback);
    } while (i < buffered.length && !state.writing);

    if (i === buffered.length) {
      resetBuffer(state);
    } else if (i > 256 && i * 2 >= buffered.length) {
      buffered.splice(0, i);
      state.bufferedIndex = 0;
    } else {
      state.bufferedIndex = i;
    }
  }
  state.bufferProcessing = false;
};

Writable.prototype._write = function (chunk, encoding, cb) {
  if (!this._writev) throw errMethodNotImplemented('_write()');
  this._writev([ { chunk, encoding } ], cb);
};

Writable.prototype._writev = null;

Writable.prototype.end = function (chunk, encoding, cb) {
  const state = this._writableState;
  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  let err;
  if (chunk != null) {
    const ret = _write(this, chunk, encoding);
    if (ret instanceof Error) err = ret;
  }

  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // a failed write is reported on its own, end() then changes nothing
  if (err) {
  } else if (!state.errored && !state.ending) {
    state.ending = true;
    finishMaybe(this, state, true);
    state.ended = true;
  } else if (state.finished) {
    err = errStreamAlreadyFinished('end');
  } else if (state.destroyed) {
    err = errStreamDestroyed('end');
  }

  if (typeof cb === 'function') {
    if (err || state.errored || state.finished) nextTick(cb, err || state.errored);
      else state.onFinished.push(cb);
  }
  return this;
};

const needFinish = state => state.ending && !state.destroyed && state.constructed && state.length === 0 && !state.errored &&
  state.buffered.length === 0 && !state.finished && !state.writing && !state.errorEmitted && !state.closeEmitted;

const onFinish = (stream, state, err) => {
  if (state.prefinished) {
    errorOrDestroy(stream, err ?? errMultipleCallback());
    return;
  }
  state.pendingcb--;
  if (err) {
    callFinishedCallbacks(state, err);
    errorOrDestroy(stream, err, state.sync);
  } else if (needFinish(state)) {
    state.prefinished = true;
    stream.emit('prefinish');
    state.pendingcb++;
    nextTick(finish, stream, state);
  }
};

const prefinish = (stream, state) => {
  if (state.prefinished || state.finalCalled) return;

  state.finalCalled = true;
  if (typeof stream._final === 'function' && !state.destroyed) {
    state.sync = true;
    state.pendingcb++;
    try {
      stream._final(err => onFinish(stream, state, err));
    } catch (err) {
      onFinish(stream, state, err);
    }
    state.sync = false;
  } else {
    state.prefinished = true;
    stream.emit('prefinish');
  }
};

const finishMaybe = (stream, state, sync) => {
  if (!needFinish(state)) return;
  prefinish(stream, state);
  if (state.pendingcb !== 0) return;

  if (sync) {
    state.pendingcb++;
    nextTick(() => {
      if (needFinish(state)) finish(stream, state);
        else state.pendingcb--;
    });
  } else if (needFinish(state)) {
    state.pendingcb++;
    finish(stream, state);
  }
};

const finish = (stream, state) => {
  state.pendingcb--;
  state.finished = true;
  callFinishedCallbacks(state, null);
  stream.emit('finish');

  if (state.autoDestroy) {
    const r = stream._readableState;
    if (!r || (r.autoDestroy && (r.endEmitted || r.readable === false))) stream.destroy();
  }
};

const callFinishedCallbacks = (state, err) => {
  const callbacks = state.onFinished;
  if (callbacks.length === 0) return;
  state.onFinished = [];
  for (let i = 0; i < callbacks.length; i++) callbacks[i](err);
};

Object.defineProperties(Writable.prototype, {
  closed: {
    get() { return this._writableState ? this._writableState.closed : false; }
  },
  destroyed: {
    get() { return this._writableState ? this._writableState.destroyed : false; },
    set(value) {
      if (this._writableState) this._writableState.destroyed = value;
    }
  },
  writable: {
    get() {
      const w = this._writableState;
      return !!w && w.writable !== false && !w.destroyed && !w.errored && !w.ending && !w.ended;
    },
    set(value) {
      if (this._writableState) this._writableState.writable = !!value;
    }
  },
  writableFinished: {
    get() { return this._writableState ? this._writableState.finished : false; }
  },
  writableObjectMode: {
    get() { return this._writableState ? this._writableState.objectMode : false; }
  },
  writableBuffer: {
    get() { return this._writableState?.buffered.slice(this._writableState.bufferedIndex); }
  },
  writableEnded: {
    get() { return this._writableState ? this._writableState.ending : false; }
  },
  writableNeedDrain: {
    get() {
      const w = this._writableState;
      return !!w && !w.destroyed && !w.ending && w.needDrain;
    }
  },
  writableHighWaterMark: {
    get() { return this._writableState?.highWaterMark; }
  },
  writableCorked: {
    get() { return this._writableState ? this._writableState.corked : 0; }
  },
  writableLength: {
    get() { return this._writableState?.length; }
  },
  errored: {
    get() { return this._writableState ? this._writableState.errored : null; }
  }
});

Writable.prototype.destroy = function (err, cb) {
  const state = this._writableState;
  if (!state.destroyed && (state.buffered.length > state.bufferedIndex || state.onFinished.length)) nextTick(errorBuffer, state);
  destroy.call(this, err, cb);
  return this;
};

Writable.prototype._undestroy = undestroy;
Writable.prototype._destroy = function (err, cb) {
  cb(err);
};
