import { inspect, format } from './internal/inspect.js';
import { deepEqual as isDeepEqual } from './internal/deep-equal.js';
import { codedError, errInvalidArgType, errInvalidArgValue } from './internal/errors.js';

const kReadableOperator = {
  deepStrictEqual: 'Expected values to be strictly deep-equal:',
  strictEqual: 'Expected values to be strictly equal:',
  strictEqualObject: 'Expected "actual" to be reference-equal to "expected":',
  deepEqual: 'Expected values to be loosely deep-equal:',
  notStrictEqual: 'Expected "actual" to be strictly unequal to:',
  notStrictEqualObject: 'Expected "actual" not to be reference-equal to "expected":',
  notDeepStrictEqual: 'Expected "actual" not to be strictly deep-equal to:',
  notDeepEqual: 'Expected "actual" not to be loosely deep-equal to:',
  notIdentical: 'Values have same structure but are not reference-equal:'
};

const inspectValue = value => inspect(value, { compact: false, customInspect: false, depth: 1000, maxArrayLength: Infinity, showHidden: false });

const isObjectLike = x => (typeof x === 'object' && x !== null) || typeof x === 'function';

// lines only in actual get +, only in expected -, by longest common subsequence between the common ends
const diffLines = (actual, expected, ignoreCommas) => {
  const same = (a, b) => a === b || (ignoreCommas && (`${a},` === b || a === `${b},`));
  const common = (a, b) => `\n  ${a.endsWith(',') ? a : b}`;
  let start = 0, endA = actual.length, endE = expected.length;
  while (start < endA && start < endE && same(actual[start], expected[start])) start++;
  while (endA > start && endE > start && same(actual[endA - 1], expected[endE - 1])) {
    endA--;
    endE--;
  }

  // too big a middle is just all of actual then all of expected
  const n = endA - start, m = endE - start;
  const lcs = n * m <= 1e6 ? Array.from({ length: n + 1 }, () => new Int32Array(m + 1)) : null;
  if (lcs !== null) {
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) lcs[i][j] = same(actual[start + i], expected[start + j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  let out = '';
  for (let k = 0; k < start; k++) out += common(actual[k], expected[k]);
  let i = start, j = start;
  while (i < endA || j < endE) {
    if (i < endA && j < endE && same(actual[i], expected[j])) {
      out += common(actual[i++], expected[j++]);
    } else if (j === endE || (i < endA && (lcs === null || lcs[i - start + 1][j - start] >= lcs[i - start][j - start + 1]))) {
      out += `\n+ ${actual[i++]}`;
    } else {
      out += `\n- ${expected[j++]}`;
    }
  }
  for (; i < actual.length; i++, j++) out += common(actual[i], expected[j]);
  return out;
};

const createErrDiff = (actual, expected, operator) => {
  if (operator === 'strictEqual' && isObjectLike(actual) && isObjectLike(expected)) operator = 'strictEqualObject';
  const inspectedActual = inspectValue(actual), inspectedExpected = inspectValue(expected);
  const actualLines = inspectedActual.split('\n'), expectedLines = inspectedExpected.split('\n');

  let message;
  if (actualLines.length === 1 && expectedLines.length === 1 && (!isObjectLike(actual) || !isObjectLike(expected))) {
    let length = inspectedActual.length + inspectedExpected.length;
    if (typeof actual === 'string') length -= 2;
    if (typeof expected === 'string') length -= 2;
    if (length <= 12 && (actual !== 0 || expected !== 0)) return `${kReadableOperator[operator]}\n\n${inspectedActual} !== ${inspectedExpected}\n`;

    message = `\n+ ${inspectedActual}\n- ${inspectedExpected}`;
    // a caret under the first difference of short strings, unless it's obvious
    let diffAt = 0;
    while (diffAt < inspectedActual.length && inspectedActual[diffAt] === inspectedExpected[diffAt]) diffAt++;
    if (typeof actual === 'string' && typeof expected === 'string' && inspectedActual.length + inspectedExpected.length <= 80 && diffAt >= 3) message += `\n${' '.repeat(diffAt + 2)}^`;
  } else if (inspectedActual === inspectedExpected) {
    return `${kReadableOperator.notIdentical}\n\n${inspectedActual}\n`;
  } else {
    message = diffLines(actualLines, expectedLines, isObjectLike(actual));
  }
  return `${kReadableOperator[operator]}\n+ actual - expected\n${message}\n`;
};

export class AssertionError extends Error {
  constructor({ message, actual, expected, operator }) {
    if (message != null) {
      super(String(message));
    } else if (operator === 'deepStrictEqual' || operator === 'strictEqual') {
      super(createErrDiff(actual, expected, operator));
    } else if (operator === 'notStrictEqual' || operator === 'notDeepStrictEqual') {
      const base = operator === 'notStrictEqual' && isObjectLike(actual) ? kReadableOperator.notStrictEqualObject : kReadableOperator[operator];
      const inspected = inspectValue(actual);
      super(inspected.includes('\n') ? `${base}\n\n${inspected}\n` : `${base}${inspected.length > 5 ? '\n\n' : ' '}${inspected}`);
    } else if (operator === 'notDeepEqual') {
      super(`${kReadableOperator.notDeepEqual}\n\n${inspectValue(actual)}`);
    } else if (operator === 'deepEqual') {
      super(`${kReadableOperator.deepEqual}\n\n${inspectValue(actual)}\n\nshould loosely deep-equal\n\n${inspectValue(expected)}`);
    } else {
      super(`${inspectValue(actual)} ${operator} ${inspectValue(expected)}`);
    }
    this.generatedMessage = message == null;
    this.code = 'ERR_ASSERTION';
    this.actual = actual;
    this.expected = expected;
    this.operator = operator;
  }

  toString() {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}
Object.defineProperty(AssertionError.prototype, 'name', { value: 'AssertionError', writable: true, configurable: true });

// a message is a string (printf-style with more arguments) or an error to throw
const innerFail = (actual, expected, operator, args) => {
  const message = typeof args[0] === 'string' && args.length > 1 ? format(...args) : args[0];
  if (message instanceof Error) throw message;
  throw new AssertionError({ actual, expected, operator, message });
};

const throwFailure = (actual, expected, operator, message, generatedMessage) => {
  const err = new AssertionError({ actual, expected, operator, message });
  err.generatedMessage = generatedMessage;
  throw err;
};

const innerOk = (argLen, value, message) => {
  if (value) return;
  if (message instanceof Error) throw message;
  // node quotes the call's source here, which a compiled program doesn't have
  throwFailure(value, true, '==', message ?? (argLen === 0 ? 'No value argument passed to `assert.ok()`' : 'The expression evaluated to a falsy value'), message == null);
};

export function ok(...args) {
  innerOk(args.length, ...args);
}

export function fail(message) {
  if (message instanceof Error) throw message;
  throwFailure(undefined, undefined, 'fail', message ?? 'Failed', message == null);
}

export function equal(actual, expected, ...message) {
  if (actual != expected && (actual === actual || expected === expected)) innerFail(actual, expected, '==', message);
}

export function notEqual(actual, expected, ...message) {
  if (actual == expected || (actual !== actual && expected !== expected)) innerFail(actual, expected, '!=', message);
}

export function deepEqual(actual, expected, ...message) {
  if (!isDeepEqual(actual, expected, false)) innerFail(actual, expected, 'deepEqual', message);
}

export function deepStrictEqual(actual, expected, ...message) {
  if (!isDeepEqual(actual, expected, true)) innerFail(actual, expected, 'deepStrictEqual', message);
}

export function notDeepEqual(actual, expected, ...message) {
  if (isDeepEqual(actual, expected, false)) innerFail(actual, expected, 'notDeepEqual', message);
}

export function notDeepStrictEqual(actual, expected, ...message) {
  if (isDeepEqual(actual, expected, true)) innerFail(actual, expected, 'notDeepStrictEqual', message);
}

export function strictEqual(actual, expected, ...message) {
  if (!Object.is(actual, expected)) innerFail(actual, expected, 'strictEqual', message);
}

export function notStrictEqual(actual, expected, ...message) {
  if (Object.is(actual, expected)) innerFail(actual, expected, 'notStrictEqual', message);
}

// a stand-in that inspects as the compared keys only
class Comparison {
  constructor(obj, keys, actual) {
    for (const key of keys) {
      if (!(key in obj)) continue;
      this[key] = actual !== undefined && typeof actual[key] === 'string' && obj[key] instanceof RegExp && obj[key].test(actual[key]) ? actual[key] : obj[key];
    }
  }
}

// expected is a regexp, an error class, a validation function or an object of properties
const expectedException = (actual, expected, message) => {
  if (expected instanceof RegExp) {
    if (!expected.test(String(actual))) throwFailure(actual, expected, 'throws', message ?? `The input did not match the regular expression ${inspect(expected)}. Input:\n\n${inspect(String(actual))}\n`, !message);
  } else if (typeof expected !== 'function') {
    const keys = Object.keys(expected);
    if (expected instanceof Error) keys.push('name', 'message');
      else if (keys.length === 0) throw errInvalidArgValue('error', expected, 'may not be an empty object');
    for (const key of keys) {
      if (typeof actual?.[key] === 'string' && expected[key] instanceof RegExp && expected[key].test(actual[key])) continue;
      if (isObjectLike(actual) && key in actual && isDeepEqual(actual[key], expected[key], true)) continue;
      if (message) throwFailure(actual, expected, 'throws', message, false);
      const err = new AssertionError({ actual: new Comparison(actual, keys), expected: new Comparison(expected, keys, actual), operator: 'deepStrictEqual' });
      Object.assign(err, { actual, expected, operator: 'throws' });
      throw err;
    }
  } else if (expected.prototype !== undefined && actual instanceof expected) {
    return;
  } else if (Error.isPrototypeOf(expected) || expected === Error) {
    if (!message) {
      message = `The error is expected to be an instance of "${expected.name}". Received `;
      if (actual instanceof Error) {
        const name = actual.constructor?.name || actual.name;
        message += expected.name === name ? 'an error with identical name but a different prototype.' : `"${name}"`;
        if (actual.message) message += `\n\nError message:\n\n${actual.message}`;
      } else {
        message += `"${inspect(actual, { depth: -1 })}"`;
      }
      throwFailure(actual, expected, 'throws', message, true);
    }
    throwFailure(actual, expected, 'throws', message, false);
  } else {
    const result = expected.call({}, actual);
    if (result !== true) throwFailure(actual, expected, 'throws', message ?? `The ${expected.name ? `"${expected.name}" ` : ''}validation function is expected to return "true". Received ${inspect(result)}`, !message);
  }
};

const NO_EXCEPTION = {};
const getActual = fn => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return NO_EXCEPTION;
};

// a promise, or a function returning one
const getRejection = async promiseFn => {
  let promise = promiseFn;
  if (typeof promiseFn === 'function') {
    promise = promiseFn();
    if (typeof promise?.then !== 'function') throw codedError(TypeError, 'ERR_INVALID_RETURN_VALUE', `Expected instance of Promise to be returned from the "promiseFn" function but got ${promise === null ? 'null' : typeof promise === 'object' ? `an instance of ${promise.constructor?.name ?? 'Object'}` : `type ${typeof promise} (${inspect(promise)})`}.`);
  } else if (typeof promiseFn?.then !== 'function') {
    throw errInvalidArgType('promiseFn', [ 'Function', 'Promise' ], promiseFn);
  }
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return NO_EXCEPTION;
};

export async function rejects(promiseFn, error, message) {
  if (typeof error === 'string') {
    message = error;
    error = undefined;
  }
  const actual = await getRejection(promiseFn);
  if (actual === NO_EXCEPTION) {
    const details = `${error?.name ? ` (${error.name})` : ''}${message ? `: ${message}` : '.'}`;
    throwFailure(undefined, error, 'rejects', `Missing expected rejection${details}`, false);
  }
  if (error) expectedException(actual, error, message);
}

export async function doesNotReject(promiseFn, message) {
  const actual = await getRejection(promiseFn);
  if (actual === NO_EXCEPTION) return;
  throwFailure(actual, undefined, 'doesNotReject', `Got unwanted rejection${typeof message === 'string' ? `: ${message}` : '.'}\nActual message: "${actual?.message}"`, false);
}

export function throws(fn, error, message) {
  if (typeof error === 'string') {
    message = error;
    error = undefined;
  } else if (error != null && typeof error !== 'object' && typeof error !== 'function') {
    throw errInvalidArgType('error', [ 'Object', 'Error', 'Function', 'RegExp' ], error);
  }

  const actual = getActual(fn);
  if (actual === NO_EXCEPTION) {
    const details = `${error?.name ? ` (${error.name})` : ''}${message ? `: ${message}` : '.'}`;
    throwFailure(undefined, error, 'throws', `Missing expected exception${details}`, false);
  }
  if (error) expectedException(actual, error, message);
}

export function doesNotThrow(fn, message) {
  const actual = getActual(fn);
  if (actual === NO_EXCEPTION) return;
  throwFailure(actual, undefined, 'doesNotThrow', `Got unwanted exception${typeof message === 'string' ? `: ${message}` : '.'}\nActual message: "${actual?.message}"`, false);
}

const internalMatch = (string, regexp, message, operator, expectation) => {
  if (typeof string === 'string' && regexp.test(string) === (operator === 'match')) return;
  if (message.length > 0) innerFail(string, regexp, operator, message);
  throwFailure(string, regexp, operator, typeof string !== 'string' ? `The "string" argument must be of type string. Received type ${typeof string} (${inspect(string)})`
    : `The input ${expectation} the regular expression ${inspect(regexp)}. Input:\n\n${inspect(string)}\n`, true);
};

export function match(string, regexp, ...message) {
  internalMatch(string, regexp, message, 'match', 'did not match');
}

export function doesNotMatch(string, regexp, ...message) {
  internalMatch(string, regexp, message, 'doesNotMatch', 'was expected to not match');
}

export function ifError(err) {
  if (err === null || err === undefined) return;
  const message = typeof err === 'object' && typeof err.message === 'string' ? err.message.length === 0 && err.constructor ? err.constructor.name : err.message : inspect(err);
  throw new AssertionError({ actual: err, expected: null, operator: 'ifError', message: `ifError got unwanted exception: ${message}` });
}

const methods = { ok, fail, equal, notEqual, deepEqual, deepStrictEqual, notDeepEqual, notDeepStrictEqual, strictEqual, notStrictEqual, throws, doesNotThrow, rejects, doesNotReject, match, doesNotMatch, ifError, AssertionError };

const assert = (...args) => innerOk(args.length, ...args);
Object.assign(assert, methods);

// strict mode swaps the loose comparisons for their strict versions
export const strict = (...args) => innerOk(args.length, ...args);
Object.assign(strict, methods, { equal: strictEqual, notEqual: notStrictEqual, deepEqual: deepStrictEqual, notDeepEqual: notDeepStrictEqual });
assert.strict = strict;
strict.strict = strict;

export default assert;
