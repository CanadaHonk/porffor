import { Buffer } from '../../buffer.js';
import { Readable, Writable, finished } from '../../stream.js';
import { nextTick } from '../loop.js';
import { errOutOfRange } from '../errors.js';
import * as binding from './binding.js';
import { getOptions, getValidatedPath } from './utils.js';

const kBusy = Symbol('kBusy');
const kIoDone = Symbol('kIoDone');

// takes options.fd or opens the path, before any read or write
function construct(cb) {
  if (typeof this.fd === 'number') return cb();
  // an open() of a subclass (like graceful-fs's) reports by emitting 'open' or 'error'
  if (typeof this.open === 'function') {
    const emit = this.emit;
    this.emit = function (event, ...args) {
      if (event === 'open' || event === 'error') this.emit = emit;
      if (event === 'error') return cb(args[0]);
      if (event === 'open') cb();
      emit.call(this, event, ...args);
    };
    return this.open();
  }
  binding.open(this.path, this.flags, this.mode, (err, fd) => {
    if (err) return cb(err);
    this.fd = fd;
    cb();
    this.emit('open', fd);
    this.emit('ready');
  });
}

// closes the fd once a read or write in flight is done with it
function destroy(err, cb) {
  const close = ioErr => {
    if (typeof this.fd !== 'number') return cb(err || ioErr);
    binding.close(this.fd, closeErr => cb(closeErr || err || ioErr));
    this.fd = null;
  };
  if (this[kBusy]) this.once(kIoDone, close);
    else close();
}

const setup = (stream, path, options, flags) => {
  stream.fd = options.fd ?? null;
  if (stream.fd === null) stream.path = getValidatedPath(path);
  stream.flags = options.flags ?? flags;
  stream.mode = options.mode ?? 0o666;
  stream.start = options.start;
  stream.pos = options.start;
  stream[kBusy] = false;
  options.autoDestroy = options.autoClose ?? true;
};

const pending = {
  get() {
    return this.fd === null;
  },
  configurable: true
};

const autoClose = state => ({
  get() {
    return this[state].autoDestroy;
  },
  set(value) {
    this[state].autoDestroy = value;
  }
});

export function ReadStream(path, options) {
  if (!(this instanceof ReadStream)) return new ReadStream(path, options);
  options = { highWaterMark: 64 * 1024, ...getOptions(options) };
  setup(this, path, options, 'r');
  this.end = options.end ?? Infinity;
  if (this.start > this.end) throw errOutOfRange('start', `<= "end" (here: ${this.end})`, this.start);
  this.bytesRead = 0;
  Readable.call(this, options);
}
Object.setPrototypeOf(ReadStream.prototype, Readable.prototype);
Object.setPrototypeOf(ReadStream, Readable);

ReadStream.prototype._construct = construct;
ReadStream.prototype._destroy = destroy;

ReadStream.prototype._read = function (n) {
  n = Math.min(this.end - (this.pos ?? this.bytesRead) + 1, n);
  if (n <= 0) return this.push(null);
  const buffer = Buffer.allocUnsafeSlow(n);
  this[kBusy] = true;
  binding.read(this.fd, buffer, 0, n, this.pos, (err, bytesRead) => {
    this[kBusy] = false;
    if (this.destroyed) return this.emit(kIoDone, err);
    if (err) return this.destroy(err);
    if (bytesRead === 0) return this.push(null);
    if (this.pos !== undefined) this.pos += bytesRead;
    this.bytesRead += bytesRead;
    this.push(bytesRead === n ? buffer : buffer.subarray(0, bytesRead));
  });
};

ReadStream.prototype.close = function (cb) {
  if (typeof cb === 'function') finished(this, cb);
  this.destroy();
};

Object.defineProperty(ReadStream.prototype, 'pending', pending);
Object.defineProperty(ReadStream.prototype, 'autoClose', autoClose('_readableState'));

export function WriteStream(path, options) {
  if (!(this instanceof WriteStream)) return new WriteStream(path, options);
  options = { ...getOptions(options), decodeStrings: true };
  setup(this, path, options, 'w');
  this.bytesWritten = 0;
  Writable.call(this, options);
  if (options.encoding) this.setDefaultEncoding(options.encoding);
}
Object.setPrototypeOf(WriteStream.prototype, Writable.prototype);
Object.setPrototypeOf(WriteStream, Writable);

WriteStream.prototype._construct = construct;
WriteStream.prototype._destroy = destroy;

WriteStream.prototype._write = function (data, encoding, cb) {
  const pos = this.pos;
  if (pos !== undefined) this.pos += data.length;
  this[kBusy] = true;
  // short writes continue from where they stopped
  const writeFrom = offset => binding.write(this.fd, data, offset, data.length - offset, pos === undefined ? null : pos + offset, (err, written) => {
    if (!err) this.bytesWritten += written;
    if (!err && !this.destroyed && written > 0 && offset + written < data.length) return writeFrom(offset + written);
    this[kBusy] = false;
    cb(err);
    if (this.destroyed) this.emit(kIoDone, err);
  });
  writeFrom(0);
};

WriteStream.prototype.close = function (cb) {
  if (cb) {
    if (this.closed) return nextTick(cb);
    this.on('close', cb);
  }
  if (!this.autoClose) this.on('finish', this.destroy);
  this.end();
};

Object.defineProperty(WriteStream.prototype, 'pending', pending);
Object.defineProperty(WriteStream.prototype, 'autoClose', autoClose('_writableState'));
