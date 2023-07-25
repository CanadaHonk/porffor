/// sta.js
function $DONOTEVALUATE() {
  throw "Test262: This statement should not be evaluated.";
}

/// assert.js
function assert(mustBeTrue) {
  if (mustBeTrue === true) {
    return;
  }

  throw new Test262Error('assert failed');
}

assert._isSameValue = function (a, b) {
  if (a === b) {
    // Handle +/-0 vs. -/+0
    return a !== 0 || 1 / a === 1 / b;
  }

  // Handle NaN vs. NaN
  return a !== a && b !== b;

  // return a === b;
};

assert.sameValue = function (actual, expected) {
  /* try {
    if (assert._isSameValue(actual, expected)) {
      return;
    }
  } catch (error) {
    throw new Test262Error('_isSameValue operation threw');
  } */

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