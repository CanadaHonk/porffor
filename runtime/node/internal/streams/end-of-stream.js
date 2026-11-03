import { nextTick } from '../loop.js';
import { addAbortListener } from '../../events.js';
import { abortError, errInvalidArgType, errStreamPrematureClose } from '../errors.js';
import {
  getErrored, isClosed, isNodeStream, isReadable, isReadableFinished, isReadableNodeStream, isWritable, isWritableFinished, isWritableNodeStream,
  willEmitClose as _willEmitClose
} from './utils.js';

const nop = () => {};

export function eos(stream, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else {
    options ??= {};
  }
  if (!isNodeStream(stream)) throw errInvalidArgType('stream', [ 'ReadableStream', 'WritableStream', 'Stream' ], stream);

  const readable = options.readable ?? isReadableNodeStream(stream);
  const writable = options.writable ?? isWritableNodeStream(stream);
  const wState = stream._writableState;
  const rState = stream._readableState;

  let willEmitClose = _willEmitClose(stream) && isReadableNodeStream(stream) === readable && isWritableNodeStream(stream) === writable;
  let writableFinished = isWritableFinished(stream, false);
  let readableFinished = isReadableFinished(stream, false);

  const closeError = () => {
    const errored = getErrored(stream);
    if (errored) return errored;
    if (readable && !readableFinished && isReadableNodeStream(stream, true) && !isReadableFinished(stream, false)) return errStreamPrematureClose();
    if (writable && !writableFinished && !isWritableFinished(stream, false)) return errStreamPrematureClose();
    return null;
  };

  // undefined: still to come, null: done without error
  let result;
  if (isClosed(stream)) {
    result = closeError();
  } else if (wState?.errorEmitted || rState?.errorEmitted) {
    if (!willEmitClose) result = getErrored(stream);
  } else if (!readable && (!willEmitClose || isReadable(stream)) && (writableFinished || isWritable(stream) === false) && !wState?.pendingcb) {
    result = getErrored(stream);
  } else if (!writable && (!willEmitClose || isWritable(stream)) && (readableFinished || isReadable(stream) === false)) {
    result = getErrored(stream);
  } else if (rState && stream.req && stream.aborted) {
    result = getErrored(stream);
  }

  const signal = options.signal;
  if (result === undefined && signal?.aborted) result = abortError(signal.reason);
    else if (result !== undefined && options.error !== false) stream.on('error', nop);
  if (result !== undefined) {
    nextTick(() => result ? callback.call(stream, result) : callback.call(stream));
    return () => {
      callback = nop;
      stream.removeListener('error', nop);
    };
  }

  let done = false, disposable;
  const finish = err => {
    if (done) return;
    done = true;
    disposable?.[Symbol.dispose]();
    if (err) callback.call(stream, err);
      else callback.call(stream);
  };

  const onlegacyfinish = () => {
    if (!stream.writable) onfinish();
  };

  const onfinish = () => {
    writableFinished = true;
    if (stream.destroyed) willEmitClose = false;
    if (willEmitClose && (!stream.readable || readable)) return;
    if (!readable || readableFinished) finish();
  };

  const onend = () => {
    readableFinished = true;
    if (stream.destroyed) willEmitClose = false;
    if (willEmitClose && (!stream.writable || writable)) return;
    if (!writable || writableFinished) finish();
  };

  const onclose = () => {
    finish(closeError());
  };

  if (writable && !wState) {
    stream.on('end', onlegacyfinish);
    stream.on('close', onlegacyfinish);
  }
  if (!willEmitClose && typeof stream.aborted === 'boolean') stream.on('aborted', onclose);
  stream.on('end', onend);
  stream.on('finish', onfinish);
  if (options.error !== false) stream.on('error', finish);
  stream.on('close', onclose);

  const cleanup = () => {
    callback = nop;
    stream.removeListener('aborted', onclose);
    stream.removeListener('end', onlegacyfinish);
    stream.removeListener('close', onlegacyfinish);
    stream.removeListener('finish', onfinish);
    stream.removeListener('end', onend);
    stream.removeListener('error', finish);
    stream.removeListener('close', onclose);
  };

  if (signal) {
    disposable = addAbortListener(signal, () => {
      const cb = callback;
      cleanup();
      cb.call(stream, abortError(signal.reason));
    });
  }

  return cleanup;
}

export const finished = (stream, options) => new Promise((resolve, reject) => {
  eos(stream, options, err => err ? reject(err) : resolve());
});

export const addAbortSignal = (signal, stream) => {
  if (typeof signal !== 'object' || !('aborted' in signal)) throw errInvalidArgType('signal', 'AbortSignal', signal);
  if (!isNodeStream(stream)) throw errInvalidArgType('stream', [ 'ReadableStream', 'WritableStream', 'Stream' ], stream);
  const onAbort = () => {
    stream.destroy(abortError(signal.reason));
  };
  if (signal.aborted) {
    onAbort();
  } else {
    const disposable = addAbortListener(signal, onAbort);
    eos(stream, disposable[Symbol.dispose]);
  }
  return stream;
};
