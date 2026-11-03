import { EventEmitter } from '../../events.js';

export function Stream(opts) {
  EventEmitter.call(this, opts);
}
Object.setPrototypeOf(Stream.prototype, EventEmitter.prototype);
Object.setPrototypeOf(Stream, EventEmitter);

Stream.prototype.pipe = function (dest, options) {
  const source = this;

  function ondata(chunk) {
    if (dest.writable && dest.write(chunk) === false && source.pause) source.pause();
  }
  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) source.resume();
  }
  dest.on('drain', ondrain);

  if (!dest._isStdio && options?.end !== false) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  let didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;
    dest.end();
  }

  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;
    if (typeof dest.destroy === 'function') dest.destroy();
  }

  function onerror(er) {
    cleanup();
    if (this.listenerCount('error') === 0) this.emit('error', er);
  }
  source.prependListener('error', onerror);
  dest.prependListener('error', onerror);

  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);
    source.removeListener('end', onend);
    source.removeListener('close', onclose);
    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);
    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);
    dest.removeListener('close', cleanup);
  }
  source.on('end', cleanup);
  source.on('close', cleanup);
  dest.on('close', cleanup);

  dest.emit('pipe', source);
  return dest;
};
