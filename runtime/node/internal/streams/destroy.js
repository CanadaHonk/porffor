import { nextTick } from '../loop.js';
import { abortError, aggregateTwoErrors, errMultipleCallback } from '../errors.js';
import { isDestroyed, isFinished, isRequest, isServerRequest } from './utils.js';

const kDestroy = Symbol('kDestroy');
const kConstruct = Symbol('kConstruct');

const setErrored = (err, w, r) => {
  if (!err) return;
  if (w && !w.errored) w.errored = err;
  if (r && !r.errored) r.errored = err;
};

export function destroy(err, cb) {
  const r = this._readableState;
  const w = this._writableState;

  if (w?.destroyed || r?.destroyed) {
    if (typeof cb === 'function') cb();
    return this;
  }

  // destroyed is set before any callbacks so destroy() is reentrant
  setErrored(err, w, r);
  if (w) w.destroyed = true;
  if (r) r.destroyed = true;

  if (!(w || r).constructed) this.once(kDestroy, er => _destroy(this, aggregateTwoErrors(er, err), cb));
    else _destroy(this, err, cb);
  return this;
}

const _destroy = (self, err, cb) => {
  let called = false;
  const onDestroy = err => {
    if (called) return;
    called = true;

    const r = self._readableState;
    const w = self._writableState;
    setErrored(err, w, r);
    if (w) w.closed = true;
    if (r) r.closed = true;

    if (typeof cb === 'function') cb(err);
    if (err) nextTick(emitErrorCloseNT, self, err);
      else nextTick(emitCloseNT, self);
  };
  try {
    self._destroy(err || null, onDestroy);
  } catch (err) {
    onDestroy(err);
  }
};

const emitErrorCloseNT = (self, err) => {
  emitErrorNT(self, err);
  emitCloseNT(self);
};

const emitCloseNT = self => {
  const r = self._readableState;
  const w = self._writableState;
  if (w) w.closeEmitted = true;
  if (r) r.closeEmitted = true;
  if (w?.emitClose || r?.emitClose) self.emit('close');
};

const emitErrorNT = (self, err) => {
  const r = self._readableState;
  const w = self._writableState;
  if (w?.errorEmitted || r?.errorEmitted) return;
  if (w) w.errorEmitted = true;
  if (r) r.errorEmitted = true;
  self.emit('error', err);
};

export function undestroy() {
  const r = this._readableState;
  const w = this._writableState;

  if (r) {
    r.constructed = true;
    r.closed = false;
    r.closeEmitted = false;
    r.destroyed = false;
    r.errored = null;
    r.errorEmitted = false;
    r.reading = false;
    r.ended = r.readable === false;
    r.endEmitted = r.readable === false;
  }

  if (w) {
    w.constructed = true;
    w.destroyed = false;
    w.closed = false;
    w.closeEmitted = false;
    w.errored = null;
    w.errorEmitted = false;
    w.finalCalled = false;
    w.prefinished = false;
    w.ended = w.writable === false;
    w.ending = w.writable === false;
    w.finished = w.writable === false;
  }
}

export const errorOrDestroy = (stream, err, sync) => {
  const r = stream._readableState;
  const w = stream._writableState;
  if (w?.destroyed || r?.destroyed) return;

  if (r?.autoDestroy || w?.autoDestroy) {
    stream.destroy(err);
  } else if (err) {
    setErrored(err, w, r);
    if (sync) nextTick(emitErrorNT, stream, err);
      else emitErrorNT(stream, err);
  }
};

export const construct = (stream, cb) => {
  const r = stream._readableState;
  const w = stream._writableState;
  if (r) r.constructed = false;
  if (w) w.constructed = false;

  stream.once(kConstruct, cb);
  if (stream.listenerCount(kConstruct) === 1) nextTick(constructNT, stream);
};

const constructNT = stream => {
  let called = false;
  const onConstruct = err => {
    if (called) {
      errorOrDestroy(stream, err ?? errMultipleCallback());
      return;
    }
    called = true;

    const r = stream._readableState;
    const w = stream._writableState;
    if (r) r.constructed = true;
    if (w) w.constructed = true;

    if ((w || r).destroyed) stream.emit(kDestroy, err);
      else if (err) errorOrDestroy(stream, err, true);
      else stream.emit(kConstruct);
  };

  try {
    stream._construct(err => {
      nextTick(onConstruct, err);
    });
  } catch (err) {
    nextTick(onConstruct, err);
  }
};

const emitCloseLegacy = stream => {
  stream.emit('close');
};

const emitErrorCloseLegacy = (stream, err) => {
  stream.emit('error', err);
  nextTick(emitCloseLegacy, stream);
};

// destroys any stream-like, as pipeline and async iteration do
export const destroyer = (stream, err) => {
  if (!stream || isDestroyed(stream)) return;
  if (!err && !isFinished(stream)) err = abortError();

  if (isServerRequest(stream)) {
    stream.socket = null;
    stream.destroy(err);
  } else if (isRequest(stream)) {
    stream.abort();
  } else if (isRequest(stream.req)) {
    stream.req.abort();
  } else if (typeof stream.destroy === 'function') {
    stream.destroy(err);
  } else if (typeof stream.close === 'function') {
    stream.close();
  } else if (err) {
    nextTick(emitErrorCloseLegacy, stream, err);
  } else {
    nextTick(emitCloseLegacy, stream);
  }

  if (!stream.destroyed) stream[Symbol.for('nodejs.stream.destroyed')] = true;
};
