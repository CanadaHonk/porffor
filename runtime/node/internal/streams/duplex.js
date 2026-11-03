import { Stream } from './legacy.js';
import { Readable, ReadableState, readableConstructed } from './readable.js';
import { Writable, WritableState, writableConstructed } from './writable.js';
import { construct } from './destroy.js';
import { addAbortSignal } from './end-of-stream.js';

export function Duplex(options) {
  if (!(this instanceof Duplex)) return new Duplex(options);

  const r = this._readableState = new ReadableState(options, this, true);
  const w = this._writableState = new WritableState(options, this, true);
  this.allowHalfOpen = options?.allowHalfOpen !== false;

  if (options) {
    if (options.readable === false) {
      r.readable = false;
      r.ended = r.endEmitted = true;
    }
    if (options.writable === false) {
      w.writable = false;
      w.ending = w.ended = w.finished = true;
    }

    if (typeof options.read === 'function') this._read = options.read;
    if (typeof options.write === 'function') this._write = options.write;
    if (typeof options.writev === 'function') this._writev = options.writev;
    if (typeof options.destroy === 'function') this._destroy = options.destroy;
    if (typeof options.final === 'function') this._final = options.final;
    if (typeof options.construct === 'function') this._construct = options.construct;
    if (options.signal) addAbortSignal(options.signal, this);
  }

  Stream.call(this, options);
  if (this._construct) {
    construct(this, () => {
      readableConstructed(this);
      writableConstructed(this);
    });
  }
}
Object.setPrototypeOf(Duplex.prototype, Readable.prototype);
Object.setPrototypeOf(Duplex, Readable);

for (const method of Object.keys(Writable.prototype)) Duplex.prototype[method] ||= Writable.prototype[method];
Duplex.prototype.destroy = Writable.prototype.destroy;

const descriptors = {};
for (const name of [ 'writable', 'writableHighWaterMark', 'writableObjectMode', 'writableBuffer', 'writableLength', 'writableFinished', 'writableCorked', 'writableEnded', 'writableNeedDrain' ]) {
  descriptors[name] = Object.getOwnPropertyDescriptor(Writable.prototype, name);
}
descriptors.destroyed = {
  get() { return !!this._readableState?.destroyed && !!this._writableState?.destroyed; },
  set(value) {
    if (this._readableState && this._writableState) this._readableState.destroyed = this._writableState.destroyed = value;
  }
};
Object.defineProperties(Duplex.prototype, descriptors);
