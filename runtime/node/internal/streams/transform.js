import { nextTick } from '../loop.js';
import { errMethodNotImplemented } from '../errors.js';
import { Duplex } from './duplex.js';
import { getHighWaterMark } from './utils.js';

const kCallback = Symbol('kCallback');

export function Transform(options) {
  if (!(this instanceof Transform)) return new Transform(options);

  // a 0 readable hwm would stall writes, so the writable side buffers instead
  if (options && getHighWaterMark(options, false, 'readableHighWaterMark') === 0) {
    options = { ...options, highWaterMark: null, readableHighWaterMark: 0, writableHighWaterMark: options.writableHighWaterMark || 0 };
  }

  Duplex.call(this, options);
  this._readableState.sync = false;
  this[kCallback] = null;

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform;
    if (typeof options.flush === 'function') this._flush = options.flush;
  }
  this.on('prefinish', prefinish);
}
Object.setPrototypeOf(Transform.prototype, Duplex.prototype);
Object.setPrototypeOf(Transform, Duplex);

function final(cb) {
  if (typeof this._flush === 'function' && !this.destroyed) {
    this._flush((er, data) => {
      if (er) {
        if (cb) cb(er);
          else this.destroy(er);
        return;
      }
      if (data != null) this.push(data);
      this.push(null);
      if (cb) cb();
    });
  } else {
    this.push(null);
    if (cb) cb();
  }
}

function prefinish() {
  if (this._final !== final) final.call(this);
}

Transform.prototype._final = final;

Transform.prototype._transform = function () {
  throw errMethodNotImplemented('_transform()');
};

Transform.prototype._write = function (chunk, encoding, callback) {
  const r = this._readableState;
  const length = r.length;

  this._transform(chunk, encoding, (err, val) => {
    if (err) {
      callback(err);
      return;
    }
    if (val != null) this.push(val);

    if (r.ended) nextTick(callback);
      else if (this._writableState.ended || length === r.length || r.length < r.highWaterMark) callback();
      else this[kCallback] = callback;
  });
};

Transform.prototype._read = function () {
  const callback = this[kCallback];
  if (callback) {
    this[kCallback] = null;
    callback();
  }
};

export function PassThrough(options) {
  if (!(this instanceof PassThrough)) return new PassThrough(options);
  Transform.call(this, options);
}
Object.setPrototypeOf(PassThrough.prototype, Transform.prototype);
Object.setPrototypeOf(PassThrough, Transform);

PassThrough.prototype._transform = function (chunk, encoding, cb) {
  cb(null, chunk);
};
