import { errInvalidArgValue } from '../errors.js';

// shared with readable-stream and web streams
const kIsDestroyed = Symbol.for('nodejs.stream.destroyed');
const kIsErrored = Symbol.for('nodejs.stream.errored');
const kIsReadable = Symbol.for('nodejs.stream.readable');
const kIsDisturbed = Symbol.for('nodejs.stream.disturbed');

export const getDefaultHighWaterMark = objectMode => objectMode ? 16 : 64 * 1024;

export const getHighWaterMark = (options, objectMode, duplexKey) => {
  const hwm = options?.highWaterMark ?? (duplexKey ? options?.[duplexKey] : null);
  if (hwm == null) return getDefaultHighWaterMark(objectMode);
  if (!Number.isInteger(hwm) || hwm < 0) throw errInvalidArgValue(duplexKey ? `options.${duplexKey}` : 'options.highWaterMark', hwm);
  return hwm;
};

export const isReadableNodeStream = (obj, strict = false) => !!(obj && typeof obj.pipe === 'function' && typeof obj.on === 'function' &&
  (!strict || (typeof obj.pause === 'function' && typeof obj.resume === 'function')) &&
  (!obj._writableState || (obj._readableState && obj._readableState.readable !== false)));

export const isWritableNodeStream = obj => !!(obj && typeof obj.write === 'function' && typeof obj.on === 'function' &&
  (!obj._readableState || obj._writableState?.writable !== false));

export const isNodeStream = obj => !!(obj && (obj._readableState || obj._writableState ||
  (typeof obj.on === 'function' && (typeof obj.write === 'function' || typeof obj.pipe === 'function'))));

export const isWritableStream = obj => !!(obj && !isNodeStream(obj) && typeof obj.getWriter === 'function' && typeof obj.abort === 'function');
export const isTransformStream = obj => !!(obj && !isNodeStream(obj) && typeof obj.readable === 'object' && typeof obj.writable === 'object');

export const isIterable = (obj, isAsync) => obj != null && (isAsync !== false && typeof obj[Symbol.asyncIterator] === 'function' ||
  isAsync !== true && typeof obj[Symbol.iterator] === 'function');

export const isDestroyed = stream => {
  if (!isNodeStream(stream)) return null;
  const state = stream._writableState || stream._readableState;
  return !!(stream.destroyed || stream[kIsDestroyed] || state?.destroyed);
};

const isWritableEnded = stream => {
  if (stream.writableEnded === true) return true;
  const state = stream._writableState;
  return state?.errored ? false : state?.ended ?? null;
};

export const isWritableFinished = (stream, strict) => {
  if (!isWritableNodeStream(stream)) return null;
  if (stream.writableFinished === true) return true;
  const state = stream._writableState;
  if (state?.errored) return false;
  if (typeof state?.finished !== 'boolean') return null;
  return state.finished || (strict === false && state.ended && state.length === 0);
};

export const isReadableFinished = (stream, strict) => {
  if (!isReadableNodeStream(stream)) return null;
  const state = stream._readableState;
  if (state?.errored) return false;
  if (typeof state?.endEmitted !== 'boolean') return null;
  return state.endEmitted || (strict === false && state.ended && state.length === 0);
};

export const isReadable = stream => {
  if (stream?.[kIsReadable] != null) return stream[kIsReadable];
  if (typeof stream?.readable !== 'boolean') return null;
  if (isDestroyed(stream)) return false;
  return isReadableNodeStream(stream) && stream.readable && !isReadableFinished(stream);
};

export const isWritable = stream => {
  if (typeof stream?.writable !== 'boolean') return null;
  if (isDestroyed(stream)) return false;
  return isWritableNodeStream(stream) && stream.writable && !isWritableEnded(stream);
};

export const isFinished = stream => isDestroyed(stream) || !isReadable(stream) && !isWritable(stream);

export const getErrored = stream => stream.writableErrored || stream._writableState?.errored || stream.readableErrored || stream._readableState?.errored || null;

const isOutgoingMessage = stream => typeof stream._closed === 'boolean' && typeof stream._defaultKeepAlive === 'boolean' && typeof stream._removedContLen === 'boolean';

export const isClosed = stream => {
  if (typeof stream.closed === 'boolean') return stream.closed;
  const w = stream._writableState, r = stream._readableState;
  if (typeof w?.closed === 'boolean' || typeof r?.closed === 'boolean') return w?.closed || r?.closed;
  if (isOutgoingMessage(stream)) return stream._closed;
  return null;
};

export const isRequest = stream => stream?.setHeader && typeof stream.abort === 'function';

export const isServerRequest = stream => typeof stream._consuming === 'boolean' && typeof stream._dumped === 'boolean' && stream.req?.upgradeOrConnect === undefined;

export const willEmitClose = stream => {
  const state = stream._writableState || stream._readableState;
  return state ? !!(state.autoDestroy && state.emitClose && !state.closed) : typeof stream._sent100 === 'boolean' && isOutgoingMessage(stream);
};

export const isDisturbed = stream => !!(stream && (stream[kIsDisturbed] ?? (stream.readableDidRead || stream.readableAborted)));

export const isErrored = stream => !!(stream && (stream[kIsErrored] ?? stream.readableErrored ?? stream.writableErrored ??
  stream._readableState?.errorEmitted ?? stream._writableState?.errorEmitted ?? stream._readableState?.errored ?? stream._writableState?.errored));
