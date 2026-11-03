import { Timeout, Immediate, startTimer, cancelTimer, startImmediate, cancelImmediate } from '../internal/loop.js';
import { abortError } from '../internal/errors.js';

// settles from a timer or immediate, rejecting if the signal aborts first
const schedule = (start, cancel, make, { signal, ref = true } = {}) => {
  if (signal?.aborted) return Promise.reject(abortError(signal.reason));
  const { promise, resolve, reject } = Promise.withResolvers();
  const handle = make(resolve);
  if (!ref) handle.unref();
  start(handle);
  if (!signal) return promise;
  const abort = () => {
    cancel(handle);
    reject(abortError(signal.reason));
  };
  signal.addEventListener('abort', abort);
  return promise.finally(() => signal.removeEventListener('abort', abort));
};

export const setTimeout = (after, value, options) => schedule(startTimer, cancelTimer, resolve => new Timeout(resolve, after, [ value ], false), options);

export const setImmediate = (value, options) => schedule(startImmediate, cancelImmediate, resolve => new Immediate(resolve, [ value ]), options);

export default { setTimeout, setImmediate };
