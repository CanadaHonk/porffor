import { encodeUtf8, decodeUtf8, concatBytes } from './bytes.js';
import { errInvalidArgType } from './errors.js';

const kBytes = Symbol('kBytes');
const kType = Symbol('kType');

export const blobBytes = blob => blob[kBytes];

const validType = type => /[^ -~]/.test(type) ? '' : type.toLowerCase();

const sourceBytes = (source, endings) => {
  if (source instanceof Blob) return source[kBytes];
  if (source instanceof ArrayBuffer || source instanceof SharedArrayBuffer) return new Uint8Array(source.slice(0));
  if (ArrayBuffer.isView(source)) return new Uint8Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
  source = `${source}`;
  return encodeUtf8(endings === 'native' ? source.replace(/\r?\n/g, '\n') : source);
};

const createBlob = (bytes, type) => {
  const blob = Object.create(Blob.prototype);
  blob[kBytes] = bytes;
  blob[kType] = type;
  return blob;
};

const relativeIndex = (index, size) => index < 0 ? Math.max(size + index, 0) : Math.min(index, size);

export class Blob {
  constructor(sources = [], options = undefined) {
    if (sources === null || typeof sources !== 'object') throw errInvalidArgType('sources', 'a sequence', sources);
    this[kBytes] = concatBytes([ ...sources ].map(source => sourceBytes(source, options?.endings)));
    this[kType] = validType(`${options?.type ?? ''}`);
  }

  get type() {
    return this[kType];
  }

  get size() {
    return this[kBytes].length;
  }

  slice(start = 0, end = this[kBytes].length, contentType = '') {
    const size = this[kBytes].length;
    start = relativeIndex(Math.trunc(+start) || 0, size);
    end = relativeIndex(Math.trunc(+end) || 0, size);
    return createBlob(this[kBytes].subarray(start, Math.max(start, end)), validType(`${contentType}`));
  }

  async text() {
    return decodeUtf8(this[kBytes], 0, this[kBytes].length);
  }

  async arrayBuffer() {
    const bytes = this[kBytes];
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  async bytes() {
    return new Uint8Array(this[kBytes]);
  }

  stream() {
    const bytes = this[kBytes];
    return new ReadableStream({
      start(controller) {
        if (bytes.length > 0) controller.enqueue(new Uint8Array(bytes));
        controller.close();
      }
    });
  }

  get [Symbol.toStringTag]() {
    return 'Blob';
  }

  [Symbol.for('nodejs.util.inspect.custom')](depth, options, inspect) {
    return `${this.constructor.name} ${inspect({ size: this.size, type: this.type }, options)}`;
  }
}

export class File extends Blob {
  #name;
  #lastModified;

  constructor(fileBits, fileName, options = undefined) {
    super(fileBits, options);
    this.#name = `${fileName}`;
    this.#lastModified = options?.lastModified === undefined ? Date.now() : Math.trunc(+options.lastModified) || 0;
  }

  get name() {
    return this.#name;
  }

  get lastModified() {
    return this.#lastModified;
  }

  get [Symbol.toStringTag]() {
    return 'File';
  }
}

export const cloneBlob = blob => blob instanceof File
  ? new File([ blob[kBytes] ], blob.name, { type: blob[kType], lastModified: blob.lastModified })
  : createBlob(blob[kBytes], blob[kType]);
