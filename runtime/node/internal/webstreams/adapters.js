import { Buffer } from '../../buffer.js';
import { Readable, finished } from '../../stream.js';
import { abortError } from '../errors.js';
import { ReadableStream } from './readablestream.js';

export const newReadableStreamFromStreamReadable = streamReadable => {
  const objectMode = streamReadable.readableObjectMode;
  let controller, done = false;
  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    pull() {
      streamReadable.resume();
    },
    cancel(reason) {
      done = true;
      streamReadable.destroy(reason);
    }
  }, { highWaterMark: streamReadable.readableHighWaterMark, size: objectMode ? undefined : chunk => chunk.length });

  finished(streamReadable, { writable: false }, error => {
    if (done) return;
    done = true;
    if (error?.code === 'ERR_STREAM_PREMATURE_CLOSE') error = abortError(error);
    if (error) controller.error(error);
      else controller.close();
  });

  streamReadable.pause();
  streamReadable.on('data', chunk => {
    if (done) return;
    if (!objectMode && Buffer.isBuffer(chunk)) chunk = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    controller.enqueue(chunk);
    if (controller.desiredSize <= 0) streamReadable.pause();
  });
  return stream;
};

export const newStreamReadableFromReadableStream = (readableStream, { highWaterMark, encoding, objectMode = false, signal } = {}) => {
  const reader = readableStream.getReader();
  let closed = false;
  const readable = new Readable({
    highWaterMark, encoding, objectMode, signal,
    read() {
      reader.read().then(({ value, done }) => readable.push(done ? null : value), e => readable.destroy(e));
    },
    destroy(error, callback) {
      if (closed) return callback(error);
      reader.cancel(error).then(() => callback(error), callback);
    }
  });
  reader.closed.then(() => {
    closed = true;
  }, e => {
    closed = true;
    readable.destroy(e);
  });
  return readable;
};
