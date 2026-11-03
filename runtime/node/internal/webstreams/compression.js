import { createBrotliCompress, createDeflate, createDeflateRaw, createGzip } from '../../zlib.js';
import { errInvalidArgValue } from '../errors.js';
import { TransformStream } from './transformstream.js';

const formats = { __proto__: null, deflate: createDeflate, 'deflate-raw': createDeflateRaw, gzip: createGzip, brotli: createBrotliCompress };

export class CompressionStream {
  #pair;

  constructor(format) {
    if (!formats[format]) throw errInvalidArgValue('format', format);
    const zlib = formats[format]();
    this.#pair = new TransformStream({
      start(controller) {
        zlib.on('data', chunk => controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
        zlib.on('error', e => controller.error(e));
      },
      transform(chunk) {
        return new Promise((resolve, reject) => zlib.write(ArrayBuffer.isView(chunk) ? chunk : new Uint8Array(chunk), e => e ? reject(e) : resolve()));
      },
      flush() {
        return new Promise((resolve, reject) => zlib.once('error', reject).once('end', resolve).end());
      },
      cancel(reason) {
        zlib.destroy(reason);
      }
    });
  }

  get readable() {
    return this.#pair.readable;
  }

  get writable() {
    return this.#pair.writable;
  }
}
