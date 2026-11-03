// node's deep equality: loose compares with ==, strict with Object.is and prototypes
import * as types from '../util/types.js';

const isEnumerable = (obj, key) => Object.prototype.propertyIsEnumerable.call(obj, key);
const isIndex = key => /^(0|[1-9][0-9]*)$/.test(key) && +key < 2 ** 32 - 1;
const isPrimitive = x => x === null || (typeof x !== 'object' && typeof x !== 'function');

const ownKeys = (obj, strict, skipIndices) => {
  const keys = skipIndices ? Object.keys(obj).filter(key => !isIndex(key)) : Object.keys(obj);
  if (strict) for (const key of Object.getOwnPropertySymbols(obj)) if (isEnumerable(obj, key)) keys.push(key);
  return keys;
};

const sameBytes = (a, b) => {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};
const viewBytes = view => new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

const innerDeepEqual = (a, b, strict, memos) => {
  if (a === b) return a !== 0 || Object.is(a, b) || !strict;
  if (strict) {
    if (typeof a === 'number') return a !== a && b !== b;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  } else {
    if (a === null || typeof a !== 'object') return (b === null || typeof b !== 'object') && (a == b || (a !== a && b !== b));
    if (b === null || typeof b !== 'object') return false;
  }
  return objectEqual(a, b, strict, memos);
};

const objectEqual = (a, b, strict, memos) => {
  if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (Object.prototype.toString.call(a) !== Object.prototype.toString.call(b)) return false;

  const indexed = Array.isArray(a) || ArrayBuffer.isView(a);
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
  } else if (types.isDate(a)) {
    if (a.getTime() !== b.getTime()) return false;
  } else if (types.isRegExp(a)) {
    if (a.source !== b.source || a.flags !== b.flags || a.lastIndex !== b.lastIndex) return false;
  } else if (ArrayBuffer.isView(a)) {
    if (a[Symbol.toStringTag] !== b[Symbol.toStringTag] || a.byteLength !== b.byteLength) return false;
    // loose float arrays compare by value: 0 equals -0, NaN equals nothing
    if (!strict && (a instanceof Float32Array || a instanceof Float64Array)) {
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }
    } else if (!sameBytes(viewBytes(a), viewBytes(b))) {
      return false;
    }
  } else if (types.isAnyArrayBuffer(a)) {
    if (!sameBytes(new Uint8Array(a), new Uint8Array(b))) return false;
  } else if (types.isNativeError(a)) {
    // the stack differs between otherwise equal errors, so it isn't compared
    if (a.message !== b.message || a.name !== b.name) return false;
  } else if (types.isBoxedPrimitive(a)) {
    if (!Object.is(a.valueOf(), b.valueOf())) return false;
  } else if (types.isWeakMap(a) || types.isWeakSet(a) || types.isPromise(a)) {
    // their contents can't be observed
    return false;
  }

  const keys = ownKeys(b, strict, indexed);
  if (keys.length !== ownKeys(a, strict, indexed).length) return false;
  for (const key of keys) {
    if (!isEnumerable(a, key)) return false;
  }
  const iterate = Array.isArray(a) ? arrayEquiv : types.isSet(a) ? setEquiv : types.isMap(a) ? mapEquiv : types.isNativeError(a) ? errorEquiv : null;
  if (iterate === null && keys.length === 0) return true;
  if ((iterate === setEquiv || iterate === mapEquiv) && a.size !== b.size) return false;

  // cycles: a pair already on the stack is equal if both sides recur at the same depth
  if (memos === undefined) {
    memos = { a: new Map(), b: new Map(), position: 0 };
  } else {
    const memoA = memos.a.get(a), memoB = memos.b.get(b);
    if (memoA !== undefined && memoB !== undefined) return memoA === memoB;
    memos.position++;
  }
  memos.a.set(a, memos.position);
  memos.b.set(b, memos.position);
  const result = keys.every(key => innerDeepEqual(a[key], b[key], strict, memos)) && (iterate === null || iterate(a, b, strict, memos));
  memos.a.delete(a);
  memos.b.delete(b);
  return result;
};

const arrayEquiv = (a, b, strict, memos) => {
  for (let i = 0; i < a.length; i++) {
    if (Object.hasOwn(a, i) !== Object.hasOwn(b, i) || !innerDeepEqual(a[i], b[i], strict, memos)) return false;
  }
  return true;
};

const errorEquiv = (a, b, strict, memos) => [ 'cause', 'errors' ].every(key => Object.hasOwn(a, key) === Object.hasOwn(b, key) && innerDeepEqual(a[key], b[key], strict, memos));

// takes a deep equal match for each unmatched entry of a out of b's unmatched ones
const matchRest = (rest, others, equal) => {
  for (const entry of rest) {
    const i = others.findIndex(other => equal(entry, other));
    if (i === -1) return false;
    others.splice(i, 1);
  }
  return true;
};

const setEquiv = (a, b, strict, memos) => {
  const rest = [];
  for (const val of a) {
    if (isPrimitive(val) && b.has(val)) continue;
    if (strict && isPrimitive(val)) return false;
    rest.push(val);
  }
  if (rest.length === 0) return true;
  const others = [ ...b ].filter(val => !isPrimitive(val) || !a.has(val));
  return matchRest(rest, others, (x, y) => innerDeepEqual(x, y, strict, memos));
};

const mapEquiv = (a, b, strict, memos) => {
  const rest = [];
  for (const [ key, val ] of a) {
    if (isPrimitive(key) && b.has(key)) {
      if (!innerDeepEqual(val, b.get(key), strict, memos)) return false;
      continue;
    }
    if (strict && isPrimitive(key)) return false;
    rest.push([ key, val ]);
  }
  if (rest.length === 0) return true;
  const others = [ ...b ].filter(([ key ]) => !isPrimitive(key) || !a.has(key));
  return matchRest(rest, others, (x, y) => innerDeepEqual(x[0], y[0], strict, memos) && innerDeepEqual(x[1], y[1], strict, memos));
};

export const deepEqual = (a, b, strict) => innerDeepEqual(a, b, strict);
