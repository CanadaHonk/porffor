/// sta.js
// define our $262 here too
var $262 = {
  global: globalThis,
  gc() { /* noop */ },
  detachArrayBuffer(buffer) {
    return Porffor.arraybuffer.detach(buffer);
  },
  getGlobal(name) {
    return globalThis[name];
  },
  // todo: setGlobal
  destroy() { /* noop */ },
  agent: {}
};

function Test262Error() {}

Test262Error.thrower = function (message) {
  throw new Test262Error(message);
};

var $DONOTEVALUATE = () => {
  throw 'Test262: This statement should not be evaluated.';
};

/// assert.js
var assert = mustBeTrue => {
  if (mustBeTrue === true) {
    return;
  }

  throw new Test262Error('assert failed');
};

assert.throws = (expectedErrorConstructor, func) => {
  if (typeof func !== 'function') {
    throw new Test262Error('assert.throws invoked with a non-function value');
  }

  try {
    func();
  } catch {
    return;
  }

  throw new Test262Error('assert.throws failed');
};

assert._isSameValue = (a, b) => {
  if (a === b) {
    // Handle +/-0 vs. -/+0
    return a !== 0 || 1 / a === 1 / b;
  }

  // Handle NaN vs. NaN
  return a !== a && b !== b;
};

assert.sameValue = (actual, expected) => {
  if (assert._isSameValue(actual, expected)) {
    return;
  }

  throw new Test262Error('assert.sameValue failed');
};

assert.notSameValue = (actual, unexpected) => {
  if (!assert._isSameValue(actual, unexpected)) {
    return;
  }

  throw new Test262Error('assert.notSameValue failed');
};

/// compareArray.js
// hack: this has to be before the actual function decl (which is invalid)
compareArray.isSameValue = (a, b) => {
  if (a === 0 && b === 0) return 1 / a === 1 / b;
  if (a !== a && b !== b) return true;

  return a === b;
};

var compareArray = (a, b) => {
  // if either are nullish
  if (a == null || b == null) return false;

  // megahack: all arrays from now on will be >0 pointer
  const _hack = '';

  if (b.length !== a.length) {
    return false;
  }

  for (var i = 0; i < a.length; i++) {
    if (!compareArray.isSameValue(b[i], a[i])) {
      return false;
    }
  }

  return true;
};

assert.compareArray = (actual, expected) => {
  if (compareArray(actual, expected)) return;

  throw new Test262Error('assert.compareArray failed');
};

/// isConstructor.js
var isConstructor = f => {
  if (typeof f !== "function") {
    throw new Test262Error("isConstructor invoked with a non-function value");
  }

  try {
    new f();
  } catch {
    return false;
  }

  return true;
};

/// assertRelativeDateMs.js
function assertRelativeDateMs(date, expectedMs) {
  var actualMs = date.valueOf();
  var localOffset = date.getTimezoneOffset() * 60000;

  if (actualMs - localOffset !== expectedMs) {
    throw new Test262Error('assertRelativeDateMs failed');
  }
}

/// decimalToHexString.js
function decimalToHexString(n) {
  var hex = "0123456789ABCDEF";
  n >>>= 0;
  var s = "";
  while (n) {
    s = hex[n & 0xf] + s;
    n >>>= 4;
  }
  return s.padStart(4, '0');
}

function decimalToPercentHexString(n) {
  var hex = "0123456789ABCDEF";
  return "%" + hex[(n >> 4) & 0xf] + hex[n & 0xf];
}

/// tcoHelper.js
var $MAX_ITERATIONS = 100000;

/// dateConstants.js
var date_1899_end = -2208988800001;
var date_1900_start = -2208988800000;
var date_1969_end = -1;
var date_1970_start = 0;
var date_1999_end = 946684799999;
var date_2000_start = 946684800000;
var date_2099_end = 4102444799999;
var date_2100_start = 4102444800000;

var start_of_time = -8.64e15;
var end_of_time = 8.64e15;

/// nans.js
var NaNs = [
  NaN,
  Number.NaN,
  NaN * 0,
  0/0,
  Infinity/Infinity,
  -(0/0)
];

/// testTypedArray.js
// todo: TypedArray
var floatArrayConstructors = [
  Float64Array,
  Float32Array
];

var nonClampedIntArrayConstructors = [
  Int32Array,
  Int16Array,
  Int8Array,
  Uint32Array,
  Uint16Array,
  Uint8Array
];

var intArrayConstructors = [
  Int32Array,
  Int16Array,
  Int8Array,
  Uint32Array,
  Uint16Array,
  Uint8Array,
  Uint8ClampedArray
];

var typedArrayConstructors = [
  Float64Array,
  Float32Array,
  Int32Array,
  Int16Array,
  Int8Array,
  Uint32Array,
  Uint16Array,
  Uint8Array,
  Uint8ClampedArray
];

function testWithTypedArrayConstructors(f, selected) {
  var constructors = selected || typedArrayConstructors;
  for (var i = 0; i < constructors.length; ++i) {
    f(constructors[i]);
  }
}

var nonAtomicsFriendlyTypedArrayConstructors = [
  Float64Array,
  Float32Array,
  Uint8ClampedArray
];

function testWithNonAtomicsFriendlyTypedArrayConstructors(f) {
  testWithTypedArrayConstructors(f, nonAtomicsFriendlyTypedArrayConstructors);
}

function testWithAtomicsFriendlyTypedArrayConstructors(f) {
  testWithTypedArrayConstructors(f, [
    Int32Array,
    Int16Array,
    Int8Array,
    Uint32Array,
    Uint16Array,
    Uint8Array,
  ]);
}

function isFloatTypedArrayConstructor(arg) {
  return floatArrayConstructors.indexOf(arg) !== -1;
}

function floatTypedArrayConstructorPrecision(FA) {
  if (FA === Float32Array) {
    return "single";
  } else if (FA === Float64Array) {
    return "double";
  }
}

/// propertyHelper.js
function isConfigurable(obj, name) {
  if (Object.hasOwn(obj, name)) return Object.getOwnPropertyDescriptor(obj, name).configurable;
  return true;
}

function isEnumerable(obj, name) {
  return Object.hasOwn(obj, name) && Object.getOwnPropertyDescriptor(obj, name).enumerable;
}

function isSameValue(a, b) {
  if (a === 0 && b === 0) return 1 / a === 1 / b;
  if (a !== a && b !== b) return true;

  return a === b;
}

function isWritable(obj, name, verifyProp, value) {
  if (Object.hasOwn(obj, name) && Object.getOwnPropertyDescriptor(obj, name).writable != null) return Object.getOwnPropertyDescriptor(obj, name).writable;
  if (!Object.hasOwn(obj, name) && Object.isExtensible(obj)) return true;

  var unlikelyValue = Array.isArray(obj) && name === "length" ?
    Math.pow(2, 32) - 1 :
    "unlikelyValue";
  var newValue = value || unlikelyValue;
  var hadValue = Object.hasOwn(obj, name);
  var oldValue = obj[name];
  var writeSucceeded;

  try {
    obj[name] = newValue;
  } catch {}

  writeSucceeded = isSameValue(obj[verifyProp || name], newValue);

  if (writeSucceeded) {
    if (hadValue) {
      obj[name] = oldValue;
    } else {
      delete obj[name];
    }
  }

  return writeSucceeded;
}

function verifyProperty(obj, name, desc, options) {
  var originalDesc = Object.getOwnPropertyDescriptor(obj, name);

  if (desc === undefined) {
    if (originalDesc !== undefined) {
      throw new Test262Error('verifyProperty: expected undefined descriptor');
    }

    return true;
  }

  if (!Object.hasOwn(obj, name)) throw new Test262Error('verifyProperty: obj should have own property');

  if (Object.hasOwn(desc, 'value')) {
    const v = desc.value;
    if (!isSameValue(originalDesc.value, v)) throw new Test262Error('verifyProperty: descriptor value mismatch');
    if (!isSameValue(obj[name], v)) throw new Test262Error('verifyProperty: object value mismatch');
  }

  if (Object.hasOwn(desc, 'enumerable')) {
    if (desc.enumerable !== originalDesc.enumerable ||
        desc.enumerable !== isEnumerable(obj, name)) {
      throw new Test262Error('enumerable fail');
    }
  }

  if (Object.hasOwn(desc, 'writable')) {
    if (desc.writable !== originalDesc.writable ||
        desc.writable !== isWritable(obj, name)) {
      throw new Test262Error('writable fail');
    }
  }

  if (Object.hasOwn(desc, 'configurable')) {
    if (desc.configurable !== originalDesc.configurable ||
        desc.configurable !== isConfigurable(obj, name)) {
      throw new Test262Error('configurable fail');
    }
  }

  if (options && options.restore) {
    Object.defineProperty(obj, name, originalDesc);
  }

  return true;
}

function verifyEqualTo(obj, name, value) {
  if (!isSameValue(obj[name], value)) {
    throw new Test262Error('propertyHelper verifyEqualTo failed');
  }
}

function verifyWritable(obj, name, verifyProp, value) {
  if (!verifyProp) {
    if (!Object.getOwnPropertyDescriptor(obj, name).writable)
      throw new Test262Error('propertyHelper verifyWritable failed');
  }

  if (!isWritable(obj, name, verifyProp, value)) {
    throw new Test262Error('propertyHelper verifyWritable failed');
  }
}

function verifyNotWritable(obj, name, verifyProp, value) {
  if (!verifyProp) {
    if (Object.getOwnPropertyDescriptor(obj, name).writable)
      throw new Test262Error('propertyHelper verifyNotWritable failed');
  }

  if (isWritable(obj, name, verifyProp)) {
    throw new Test262Error('propertyHelper verifyNotWritable failed');
  }
}

function verifyEnumerable(obj, name) {
  if (!isEnumerable(obj, name)) {
    throw new Test262Error('propertyHelper verifyEnumerable failed');
  }
}

function verifyNotEnumerable(obj, name) {
  if (isEnumerable(obj, name)) {
    throw new Test262Error('propertyHelper verifyNotEnumerable failed');
  }
}

function verifyConfigurable(obj, name) {
  if (!isConfigurable(obj, name)) {
    throw new Test262Error('propertyHelper verifyConfigurable failed');
  }
}

function verifyNotConfigurable(obj, name) {
  if (isConfigurable(obj, name)) {
    throw new Test262Error('propertyHelper verifyNotConfigurable failed');
  }
}

/// promiseHelper.js
function checkSequence(arr) {
  arr.forEach((x, i) => {
    if (x !== (i + 1)) {
      throw new Test262Error('promiseHelper checkSequence failed');
    }
  });

  return true;
}
// todo: checkSettledPromises

/// detachArrayBuffer.js
function $DETACHBUFFER(buffer) {
  Porffor.arraybuffer.detach(buffer)
}

/// fnGlobalObject.js
var __globalObject = globalThis;
function fnGlobalObject() {
  return __globalObject;
}

/// doneprintHandle.js
function $DONE(error) {
  if (error) {
    Porffor.printStatic('Test262:AsyncTestFailure:Error: unknown');
  } else {
    Porffor.printStatic('Test262:AsyncTestComplete');
  }
}