import { Timeout, Immediate, startTimer, cancelTimer, startImmediate, cancelImmediate } from './internal/loop.js';
import { validateFunction } from './internal/validators.js';
import promises from './timers/promises.js';

export function setTimeout(callback, after, ...args) {
  validateFunction(callback, 'callback');
  return startTimer(new Timeout(callback, after, args, false));
}

export function setInterval(callback, repeat, ...args) {
  validateFunction(callback, 'callback');
  return startTimer(new Timeout(callback, repeat, args, true));
}

export function setImmediate(callback, ...args) {
  validateFunction(callback, 'callback');
  return startImmediate(new Immediate(callback, args));
}

export function clearTimeout(timer) {
  cancelTimer(timer);
}

export function clearInterval(timer) {
  cancelTimer(timer);
}

export function clearImmediate(immediate) {
  cancelImmediate(immediate);
}

const promisify = Symbol.for('nodejs.util.promisify.custom');
setTimeout[promisify] = promises.setTimeout;
setImmediate[promisify] = promises.setImmediate;

export default { setTimeout, clearTimeout, setImmediate, clearImmediate, setInterval, clearInterval };
