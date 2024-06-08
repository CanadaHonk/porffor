/// sta.js
function Test262Error() {}

Test262Error.thrower = function (message) {
  throw new Test262Error(message);
};

function $DONOTEVALUATE() {
  throw 'Test262: This statement should not be evaluated.';
}

/// assert.js
function assert(mustBeTrue) {
  if (mustBeTrue === true) {
    return;
  }

  throw new Test262Error('assert failed');
}

assert.throws = function (expectedErrorConstructor, func) {
  if (typeof func !== 'function') {
    throw new Test262Error('isConstructor invoked with a non-function value');
  }

  try {
    func();
  } catch {
    return;
  }

  throw new Test262Error('assert.throws failed');
};

assert._isSameValue = function (a, b) {
  if (a === b) {
    // Handle +/-0 vs. -/+0
    return a !== 0 || 1 / a === 1 / b;
  }

  // Handle NaN vs. NaN
  return a !== a && b !== b;
};

assert.sameValue = function (actual, expected) {
  if (assert._isSameValue(actual, expected)) {
    return;
  }

  throw new Test262Error('assert.sameValue failed');
};

assert.notSameValue = function (actual, unexpected) {
  if (!assert._isSameValue(actual, unexpected)) {
    return;
  }

  throw new Test262Error('assert.notSameValue failed');
};

/// compareArray.js
// hack: this has to be before the actual function decl (which is invalid)
compareArray.isSameValue = function(a, b) {
  if (a === 0 && b === 0) return 1 / a === 1 / b;
  if (a !== a && b !== b) return true;

  return a === b;
};

function compareArray(a, b) {
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
}

assert.compareArray = function (actual, expected) {
  if (compareArray(actual, expected)) return;

  throw new Test262Error('assert.compareArray failed');
};

/// isConstructor.js
function isConstructor(f) {
  if (typeof f !== "function") {
    throw new Test262Error("isConstructor invoked with a non-function value");
  }

  try {
    new f();
  } catch {
    return false;
  }

  return true;
}

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