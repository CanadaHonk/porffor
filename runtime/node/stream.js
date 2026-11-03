import { Stream } from './internal/streams/legacy.js';
import { Readable } from './internal/streams/readable.js';
import { Writable } from './internal/streams/writable.js';
import { Duplex } from './internal/streams/duplex.js';
import { Transform, PassThrough } from './internal/streams/transform.js';
import { pipeline } from './internal/streams/pipeline.js';
import { destroyer, errorOrDestroy } from './internal/streams/destroy.js';
import { eos, addAbortSignal } from './internal/streams/end-of-stream.js';
import { getDefaultHighWaterMark, isDestroyed, isDisturbed, isErrored, isReadable, isWritable } from './internal/streams/utils.js';
import { newReadableStreamFromStreamReadable, newStreamReadableFromReadableStream } from './internal/webstreams/adapters.js';
import promises, { pipeline as promisesPipeline, finished as promisesFinished } from './stream/promises.js';
import { nextTick } from './internal/loop.js';

// two duplexes, what is written to one is read from the other
class DuplexSide extends Duplex {
  constructor(options) {
    super(options);
    this._other = null;
    this._callback = null;
  }

  _read() {
    const callback = this._callback;
    this._callback = null;
    callback?.();
  }

  _write(chunk, encoding, callback) {
    if (chunk.length === 0) return nextTick(callback);
    this._other.push(chunk);
    this._other._callback = callback;
  }

  _final(callback) {
    this._other.on('end', callback);
    this._other.push(null);
  }
}

const duplexPair = options => {
  const side0 = new DuplexSide(options), side1 = new DuplexSide(options);
  side0._other = side1;
  side1._other = side0;
  return [ side0, side1 ];
};

Readable.fromWeb = newStreamReadableFromReadableStream;
Readable.toWeb = newReadableStreamFromStreamReadable;

Stream.Stream = Stream;
Stream.Readable = Readable;
Stream.Writable = Writable;
Stream.Duplex = Duplex;
Stream.Transform = Transform;
Stream.PassThrough = PassThrough;
Stream.pipeline = pipeline;
Stream.finished = eos;
Stream.destroy = destroyer;
Stream.addAbortSignal = addAbortSignal;
Stream.getDefaultHighWaterMark = getDefaultHighWaterMark;
Stream.isDestroyed = isDestroyed;
Stream.isDisturbed = isDisturbed;
Stream.isErrored = isErrored;
Stream.isReadable = isReadable;
Stream.promises = promises;
Stream.duplexPair = duplexPair;

// defineProperty, not assignment: the shaker drops these with unused targets
const customPromisify = Symbol.for('nodejs.util.promisify.custom');
Object.defineProperty(pipeline, customPromisify, { value: promisesPipeline });
Object.defineProperty(eos, customPromisify, { value: promisesFinished });

export {
  Stream, Readable, Writable, Duplex, Transform, PassThrough, pipeline, eos as finished, destroyer as destroy, addAbortSignal, promises, getDefaultHighWaterMark,
  isDestroyed, isDisturbed, isErrored, isReadable, isWritable, errorOrDestroy, duplexPair
};
export default Stream;
