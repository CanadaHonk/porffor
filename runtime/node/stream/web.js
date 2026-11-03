import { ReadableStream, ReadableStreamDefaultReader, ReadableStreamDefaultController, ReadableByteStreamController } from '../internal/webstreams/readablestream.js';
import { WritableStream, WritableStreamDefaultWriter, WritableStreamDefaultController } from '../internal/webstreams/writablestream.js';
import { TransformStream, TransformStreamDefaultController } from '../internal/webstreams/transformstream.js';
import { CompressionStream } from '../internal/webstreams/compression.js';

export {
  ReadableStream, ReadableStreamDefaultReader, ReadableStreamDefaultController, ReadableByteStreamController, WritableStream, WritableStreamDefaultWriter,
  WritableStreamDefaultController, TransformStream, TransformStreamDefaultController, CompressionStream
};

export default {
  ReadableStream, ReadableStreamDefaultReader, ReadableStreamDefaultController, ReadableByteStreamController, WritableStream, WritableStreamDefaultWriter,
  WritableStreamDefaultController, TransformStream, TransformStreamDefaultController, CompressionStream
};
