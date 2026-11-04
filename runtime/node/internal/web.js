import { reportUncaught } from './loop.js';
import { DOMException, isDOMException } from './domexception.js';
import { Blob, cloneBlob } from './blob.js';
import { validateFunction } from './validators.js';

export const global = globalThis;

export const queueMicrotask = callback => {
  validateFunction(callback, 'callback');
  Promise.resolve().then(() => {
    try {
      callback();
    } catch (err) {
      reportUncaught(err);
    }
  });
};

const uncloneable = value => new DOMException(`${typeof value === 'function' || typeof value === 'symbol' ? String(value) : Object.prototype.toString.call(value)} could not be cloned.`, 'DataCloneError');

const errorConstructors = [ EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError ];
const kClone = Symbol.for('porffor.clone');

const clone = (value, seen, transferred) => {
  if (typeof value === 'function' || typeof value === 'symbol') throw uncloneable(value);
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return seen.get(value);
  const keep = out => {
    seen.set(value, out);
    return out;
  };
  const inner = x => clone(x, seen, transferred);

  if (value instanceof ArrayBuffer) return keep(transferred.get(value) ?? value.slice(0));
  if (value instanceof SharedArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    const buffer = inner(value.buffer);
    return keep(value instanceof DataView ? new DataView(buffer, value.byteOffset, value.byteLength) : new value.constructor(buffer, value.byteOffset, value.length));
  }
  if (value instanceof Date) return keep(new Date(value.getTime()));
  if (value instanceof RegExp) return keep(new RegExp(value.source, value.flags));
  if (value instanceof Boolean || value instanceof Number || value instanceof String || value instanceof BigInt) return keep(Object(value.valueOf()));
  if (typeof value[kClone] === 'function') return keep(value[kClone]());
  if (value instanceof Blob) return keep(cloneBlob(value));
  if (isDOMException(value) || Error.isError(value)) {
    const out = keep(isDOMException(value) ? new DOMException(value.message, value.name) : new (errorConstructors.find(C => C.name === value.name) ?? Error)(value.message));
    Object.defineProperty(out, 'stack', { value: value.stack, configurable: true, writable: true });
    if ('cause' in value) Object.defineProperty(out, 'cause', { value: inner(value.cause), configurable: true, writable: true });
    return out;
  }
  if (value instanceof Map) {
    const out = keep(new Map());
    for (const [ k, v ] of value) out.set(inner(k), inner(v));
    return out;
  }
  if (value instanceof Set) {
    const out = keep(new Set());
    for (const v of value) out.add(inner(v));
    return out;
  }

  const tag = Object.prototype.toString.call(value);
  if (!Array.isArray(value) && tag !== '[object Object]' && tag !== '[object Arguments]' && !(Symbol.toStringTag in value)) throw uncloneable(value);
  if (value instanceof WeakMap || value instanceof WeakSet || value instanceof Promise || value instanceof WeakRef) throw uncloneable(value);
  const out = keep(Array.isArray(value) ? new Array(value.length) : {});
  for (const k of Object.keys(value)) Object.defineProperty(out, k, { value: inner(value[k]), writable: true, enumerable: true, configurable: true });
  return out;
};

// transferred buffers move to the clone, detaching the originals
export const structuredClone = (value, options) => {
  const transferred = new Map();
  for (const item of options?.transfer ?? []) {
    if (!(item instanceof ArrayBuffer)) throw new DOMException('Value not transferable', 'DataCloneError');
    transferred.set(item, item.slice(0));
  }
  const out = clone(value, new Map(), transferred);
  for (const item of transferred.keys()) item.transfer();
  return out;
};

// V8's CallSite with no location: porffor keeps no stack frames
const unknownSite = {
  getThis: () => undefined, getTypeName: () => null, getFunction: () => undefined, getFunctionName: () => null, getMethodName: () => null,
  getFileName: () => undefined, getScriptNameOrSourceURL: () => undefined, getLineNumber: () => null, getColumnNumber: () => null,
  getEvalOrigin: () => undefined, isToplevel: () => true, isEval: () => false, isNative: () => false, isConstructor: () => false,
  isAsync: () => false, isPromiseAll: () => false, toString: () => '<anonymous>'
};

Error.stackTraceLimit ??= 10;

// V8's Error.captureStackTrace, or Error.prepareStackTrace over locationless call sites
export const captureStackTrace = target => {
  let stack;
  if (typeof Error.prepareStackTrace === 'function') stack = Error.prepareStackTrace(target, Array.from({ length: Math.max(0, Error.stackTraceLimit) || 0 }, () => unknownSite));
  else {
    const frames = (new Error().stack ?? '').split('\n').slice(2).join('\n');
    stack = String(target) + (frames ? '\n' + frames : '');
  }
  // like v8: own and non-enumerable
  Object.defineProperty(target, 'stack', { value: stack, writable: true, configurable: true });
};
