/// sta.js
// define our $262 here too
// var $262 = {
//   global: globalThis,
//   gc() { /* noop */ },
//   detachArrayBuffer(buffer) {
//     return Porffor.arraybuffer.detach(buffer);
//   },
//   getGlobal(name) {
//     return globalThis[name];
//   },
//   // todo: setGlobal
//   destroy() { /* noop */ },
//   agent: {}
// };

// function Test262Error(message) {
//   this.message = message;
//   this.name = 'Test262Error';
// }

// var __Test262Error_thrower = message => {
//   throw new Test262Error(message);
// };

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
assert; // idk why exactly but this fixes many tests by forcing indirect ref

var __assert_throws = (expectedErrorConstructor, func) => {
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

var __assert__isSameValue = (a, b) => {
  if (a === b) {
    // Handle +/-0 vs. -/+0
    return a !== 0 || 1 / a === 1 / b;
  }

  // Handle NaN vs. NaN
  return a !== a && b !== b;
};

var __assert_sameValue = (actual, expected) => {
  if (assert._isSameValue(actual, expected)) {
    return;
  }

  throw new Test262Error('assert.sameValue failed');
};

var __assert_notSameValue = (actual, unexpected) => {
  if (!assert._isSameValue(actual, unexpected)) {
    return;
  }

  throw new Test262Error('assert.notSameValue failed');
};

/// compareArray.js
// hack: this has to be before the actual function decl (which is invalid)
var __compareArray_isSameValue = (a, b) => {
  if (a === 0 && b === 0) return 1 / a === 1 / b;
  if (a !== a && b !== b) return true;

  return a === b;
};

var compareArray = (a, b) => {
  // if either are nullish
  if (a == null || b == null) return false;

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

var __assert_compareArray = (actual, expected) => {
  if (compareArray(actual, expected)) return;

  throw new Test262Error('assert.compareArray failed');
};

/// isConstructor.js
var isConstructor = f => {
  if (typeof f !== "function") {
    throw new Test262Error("isConstructor invoked with a non-function value");
  }

  return ecma262.IsConstructor(f);
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
// hack: we do not actually have an underlying TypedArray so just use Int8Array
var TypedArray = Int8Array;

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

var __values, __expected, __fn, __ta, __taName;
function testTypedArrayConversions(byteConversionValues, fn) {
  __values = byteConversionValues.values;
  __expected = byteConversionValues.expected;
  __fn = fn;

  testWithTypedArrayConstructors(function(TA) {
    __ta = TA;
    __taName = TA.name.slice(0, -5);

    return __values.forEach(function(value, index) {
      var exp = __expected[__taName][index];
      var initial = 0;
      if (exp === 0) {
        initial = 1;
      }
      __fn(__ta, value, exp, initial);
    });
  });
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

/// testBigIntTypedArray.js
// hack: we do not actually have an underlying TypedArray so just use Int8Array
var TypedArray = Int8Array;

function testWithBigIntTypedArrayConstructors(f, selected) {
  const constructors = selected || [
    BigInt64Array,
    BigUint64Array
  ];

  for (let i = 0; i < constructors.length; i++) {
    f(constructors[i]);
  }
}

/// resizableArrayBufferUtils.js
const builtinCtors = [
  Uint8Array,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
  Uint8ClampedArray,
  BigUint64Array,
  BigInt64Array
];

const floatCtors = [
  Float32Array,
  Float64Array
];

const ctors = builtinCtors;

function CreateResizableArrayBuffer(byteLength, maxByteLength) {
  return new ArrayBuffer(byteLength, { maxByteLength });
}

function Convert(item) {
  if (typeof item == 'bigint') {
    return Number(item);
  }

  return item;
}

function ToNumbers(array) {
  let result = [];
  for (let i = 0; i < array.length; i++) {
    let item = array[i];
    result.push(Convert(item));
  }
  return result;
}

function MayNeedBigInt(ta, n) {
  assert.sameValue(typeof n, 'number');
  if (ta instanceof BigInt64Array || ta instanceof BigUint64Array) {
    return BigInt(n);
  }
  return n;
}

function CreateRabForTest(ctor) {
  const rab = CreateResizableArrayBuffer(4 * ctor.BYTES_PER_ELEMENT, 8 * ctor.BYTES_PER_ELEMENT);
  // Write some data into the array.
  const taWrite = new ctor(rab);
  for (let i = 0; i < 4; ++i) {
    taWrite[i] = MayNeedBigInt(taWrite, 2 * i);
  }
  return rab;
}

function CollectValuesAndResize(n, values, rab, resizeAfter, resizeTo) {
  if (typeof n == 'bigint') {
    values.push(Number(n));
  } else {
    values.push(n);
  }
  if (values.length == resizeAfter) {
    rab.resize(resizeTo);
  }
  return true;
}

function TestIterationAndResize(iterable, expected, rab, resizeAfter, newByteLength) {
  let values = [];
  let resized = false;
  var arrayValues = false;

  for (let value of iterable) {
    if (Array.isArray(value)) {
      arrayValues = true;
      values.push([
        value[0],
        Number(value[1])
      ]);
    } else {
      values.push(Number(value));
    }

    if (!resized && values.length == resizeAfter) {
      rab.resize(newByteLength);
      resized = true;
    }
  }

  if (!arrayValues) {
      assert.compareArray([].concat(values), expected, "TestIterationAndResize: list of iterated values");
  } else {
    for (let i = 0; i < expected.length; i++) {
      assert.compareArray(values[i], expected[i], "TestIterationAndResize: list of iterated lists of values");
    }
  }

  assert(resized, "TestIterationAndResize: resize condition should have been hit");
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
    // if (!isSameValue(obj[name], v)) throw new Test262Error('verifyProperty: object value mismatch');
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
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (x !== (i + 1)) {
      throw new Test262Error('promiseHelper checkSequence failed');
    }
  }

  return true;
}

function checkSettledPromises(settleds, expected) {
  assert.sameValue(Array.isArray(settleds), true);
  assert.sameValue(settleds.length, expected.length);

  for (let i = 0; i < settleds.length; i++) {
    const settled = settleds[i];
    const expected = expected[i];

    assert.sameValue(Object.hasOwn(settled, 'status'), true);
    assert.sameValue(settled.status, expected.status);

    if (settled.status === 'fulfilled') {
      assert.sameValue(Object.hasOwn(settled, 'value'), true);
      assert.sameValue(Object.hasOwn(settled, 'reason'), false);
      assert.sameValue(settled.value, expected.value);
    } else {
      assert.sameValue(settled.status, 'rejected');
      assert.sameValue(Object.hasOwn(settled, 'value'), false);
      assert.sameValue(Object.hasOwn(settled, 'reason'), true);
      assert.sameValue(settled.reason, expected.reason);
    }
  }
}

/// detachArrayBuffer.js
function $DETACHBUFFER(buffer) {
  Porffor.arraybuffer.detach(buffer)
}

/// fnGlobalObject.js
function fnGlobalObject() {
  return globalThis;
}

/// doneprintHandle.js
function $DONE(error) {
  if (error) {
    Porffor.printStatic('Test262:AsyncTestFailure:Error: unknown');
  } else {
    Porffor.printStatic('Test262:AsyncTestComplete');
  }
}

/// byteConversionValues.js
var byteConversionValues = {
  values: [
    127,         // 2 ** 7 - 1
    128,         // 2 ** 7
    32767,       // 2 ** 15 - 1
    32768,       // 2 ** 15
    2147483647,  // 2 ** 31 - 1
    2147483648,  // 2 ** 31
    255,         // 2 ** 8 - 1
    256,         // 2 ** 8
    65535,       // 2 ** 16 - 1
    65536,       // 2 ** 16
    4294967295,  // 2 ** 32 - 1
    4294967296,  // 2 ** 32
    9007199254740991, // 2 ** 53 - 1
    9007199254740992, // 2 ** 53
    1.1,
    0.1,
    0.5,
    0.50000001,
    0.6,
    0.7,
    undefined,
    -1,
    -0,
    -0.1,
    -1.1,
    NaN,
    -127,        // - ( 2 ** 7 - 1 )
    -128,        // - ( 2 ** 7 )
    -32767,      // - ( 2 ** 15 - 1 )
    -32768,      // - ( 2 ** 15 )
    -2147483647, // - ( 2 ** 31 - 1 )
    -2147483648, // - ( 2 ** 31 )
    -255,        // - ( 2 ** 8 - 1 )
    -256,        // - ( 2 ** 8 )
    -65535,      // - ( 2 ** 16 - 1 )
    -65536,      // - ( 2 ** 16 )
    -4294967295, // - ( 2 ** 32 - 1 )
    -4294967296, // - ( 2 ** 32 )
    Infinity,
    -Infinity,
    0,
    2049,                         // an integer which rounds down under ties-to-even when cast to float16
    2051,                         // an integer which rounds up under ties-to-even when cast to float16
    0.00006103515625,             // smallest normal float16
    0.00006097555160522461,       // largest subnormal float16
    5.960464477539063e-8,         // smallest float16
    2.9802322387695312e-8,        // largest double which rounds to 0 when cast to float16
    2.980232238769532e-8,         // smallest double which does not round to 0 when cast to float16
    8.940696716308594e-8,         // a double which rounds up to a subnormal under ties-to-even when cast to float16
    1.4901161193847656e-7,        // a double which rounds down to a subnormal under ties-to-even when cast to float16
    1.490116119384766e-7,         // the next double above the one on the previous line one
    65504,                        // max finite float16
    65520,                        // smallest double which rounds to infinity when cast to float16
    65519.99999999999,            // largest double which does not round to infinity when cast to float16
    0.000061005353927612305,      // smallest double which rounds to a non-subnormal when cast to float16
    0.0000610053539276123         // largest double which rounds to a subnormal when cast to float16
  ],

  expected: {
    Int8: [
      127,  // 127
      -128, // 128
      -1,   // 32767
      0,    // 32768
      -1,   // 2147483647
      0,    // 2147483648
      -1,   // 255
      0,    // 256
      -1,   // 65535
      0,    // 65536
      -1,   // 4294967295
      0,    // 4294967296
      -1,   // 9007199254740991
      0,    // 9007199254740992
      1,    // 1.1
      0,    // 0.1
      0,    // 0.5
      0,    // 0.50000001,
      0,    // 0.6
      0,    // 0.7
      0,    // undefined
      -1,   // -1
      0,    // -0
      0,    // -0.1
      -1,   // -1.1
      0,    // NaN
      -127, // -127
      -128, // -128
      1,    // -32767
      0,    // -32768
      1,    // -2147483647
      0,    // -2147483648
      1,    // -255
      0,    // -256
      1,    // -65535
      0,    // -65536
      1,    // -4294967295
      0,    // -4294967296
      0,    // Infinity
      0,    // -Infinity
      0,    // 0
      1,    // 2049
      3,    // 2051
      0,    // 0.00006103515625
      0,    // 0.00006097555160522461
      0,    // 5.960464477539063e-8
      0,    // 2.9802322387695312e-8
      0,    // 2.980232238769532e-8
      0,    // 8.940696716308594e-8
      0,    // 1.4901161193847656e-7
      0,    // 1.490116119384766e-7
      -32,  // 65504
      -16,  // 65520
      -17,  // 65519.99999999999
      0,    // 0.000061005353927612305
      0     // 0.0000610053539276123
    ],
    Uint8: [
      127, // 127
      128, // 128
      255, // 32767
      0,   // 32768
      255, // 2147483647
      0,   // 2147483648
      255, // 255
      0,   // 256
      255, // 65535
      0,   // 65536
      255, // 4294967295
      0,   // 4294967296
      255, // 9007199254740991
      0,   // 9007199254740992
      1,   // 1.1
      0,   // 0.1
      0,   // 0.5
      0,   // 0.50000001,
      0,   // 0.6
      0,   // 0.7
      0,   // undefined
      255, // -1
      0,   // -0
      0,   // -0.1
      255, // -1.1
      0,   // NaN
      129, // -127
      128, // -128
      1,   // -32767
      0,   // -32768
      1,   // -2147483647
      0,   // -2147483648
      1,   // -255
      0,   // -256
      1,   // -65535
      0,   // -65536
      1,   // -4294967295
      0,   // -4294967296
      0,   // Infinity
      0,   // -Infinity
      0,   // 0
      1,   // 2049
      3,   // 2051
      0,   // 0.00006103515625
      0,   // 0.00006097555160522461
      0,   // 5.960464477539063e-8
      0,   // 2.9802322387695312e-8
      0,   // 2.980232238769532e-8
      0,   // 8.940696716308594e-8
      0,   // 1.4901161193847656e-7
      0,   // 1.490116119384766e-7
      224, // 65504
      240, // 65520
      239, // 65519.99999999999
      0,   // 0.000061005353927612305
      0    // 0.0000610053539276123
    ],
    Uint8Clamped: [
      127, // 127
      128, // 128
      255, // 32767
      255, // 32768
      255, // 2147483647
      255, // 2147483648
      255, // 255
      255, // 256
      255, // 65535
      255, // 65536
      255, // 4294967295
      255, // 4294967296
      255, // 9007199254740991
      255, // 9007199254740992
      1,   // 1.1,
      0,   // 0.1
      0,   // 0.5
      1,   // 0.50000001,
      1,   // 0.6
      1,   // 0.7
      0,   // undefined
      0,   // -1
      0,   // -0
      0,   // -0.1
      0,   // -1.1
      0,   // NaN
      0,   // -127
      0,   // -128
      0,   // -32767
      0,   // -32768
      0,   // -2147483647
      0,   // -2147483648
      0,   // -255
      0,   // -256
      0,   // -65535
      0,   // -65536
      0,   // -4294967295
      0,   // -4294967296
      255, // Infinity
      0,   // -Infinity
      0,   // 0
      255, // 2049
      255, // 2051
      0,   // 0.00006103515625
      0,   // 0.00006097555160522461
      0,   // 5.960464477539063e-8
      0,   // 2.9802322387695312e-8
      0,   // 2.980232238769532e-8
      0,   // 8.940696716308594e-8
      0,   // 1.4901161193847656e-7
      0,   // 1.490116119384766e-7
      255, // 65504
      255, // 65520
      255, // 65519.99999999999
      0,   // 0.000061005353927612305
      0    // 0.0000610053539276123
    ],
    Int16: [
      127,    // 127
      128,    // 128
      32767,  // 32767
      -32768, // 32768
      -1,     // 2147483647
      0,      // 2147483648
      255,    // 255
      256,    // 256
      -1,     // 65535
      0,      // 65536
      -1,     // 4294967295
      0,      // 4294967296
      -1,     // 9007199254740991
      0,      // 9007199254740992
      1,      // 1.1
      0,      // 0.1
      0,      // 0.5
      0,      // 0.50000001,
      0,      // 0.6
      0,      // 0.7
      0,      // undefined
      -1,     // -1
      0,      // -0
      0,      // -0.1
      -1,     // -1.1
      0,      // NaN
      -127,   // -127
      -128,   // -128
      -32767, // -32767
      -32768, // -32768
      1,      // -2147483647
      0,      // -2147483648
      -255,   // -255
      -256,   // -256
      1,      // -65535
      0,      // -65536
      1,      // -4294967295
      0,      // -4294967296
      0,      // Infinity
      0,      // -Infinity
      0,      // 0
      2049,   // 2049
      2051,   // 2051
      0,      // 0.00006103515625
      0,      // 0.00006097555160522461
      0,      // 5.960464477539063e-8
      0,      // 2.9802322387695312e-8
      0,      // 2.980232238769532e-8
      0,      // 8.940696716308594e-8
      0,      // 1.4901161193847656e-7
      0,      // 1.490116119384766e-7
      -32,    // 65504
      -16,    // 65520
      -17,    // 65519.99999999999
      0,      // 0.000061005353927612305
      0       // 0.0000610053539276123
    ],
    Uint16: [
      127,   // 127
      128,   // 128
      32767, // 32767
      32768, // 32768
      65535, // 2147483647
      0,     // 2147483648
      255,   // 255
      256,   // 256
      65535, // 65535
      0,     // 65536
      65535, // 4294967295
      0,     // 4294967296
      65535, // 9007199254740991
      0,     // 9007199254740992
      1,     // 1.1
      0,     // 0.1
      0,     // 0.5
      0,     // 0.50000001,
      0,     // 0.6
      0,     // 0.7
      0,     // undefined
      65535, // -1
      0,     // -0
      0,     // -0.1
      65535, // -1.1
      0,     // NaN
      65409, // -127
      65408, // -128
      32769, // -32767
      32768, // -32768
      1,     // -2147483647
      0,     // -2147483648
      65281, // -255
      65280, // -256
      1,     // -65535
      0,     // -65536
      1,     // -4294967295
      0,     // -4294967296
      0,     // Infinity
      0,     // -Infinity
      0,     // 0
      2049,  // 2049
      2051,  // 2051
      0,     // 0.00006103515625
      0,     // 0.00006097555160522461
      0,     // 5.960464477539063e-8
      0,     // 2.9802322387695312e-8
      0,     // 2.980232238769532e-8
      0,     // 8.940696716308594e-8
      0,     // 1.4901161193847656e-7
      0,     // 1.490116119384766e-7
      65504, // 65504
      65520, // 65520
      65519, // 65519.99999999999
      0,     // 0.000061005353927612305
      0      // 0.0000610053539276123
    ],
    Int32: [
      127,         // 127
      128,         // 128
      32767,       // 32767
      32768,       // 32768
      2147483647,  // 2147483647
      -2147483648, // 2147483648
      255,         // 255
      256,         // 256
      65535,       // 65535
      65536,       // 65536
      -1,          // 4294967295
      0,           // 4294967296
      -1,          // 9007199254740991
      0,           // 9007199254740992
      1,           // 1.1
      0,           // 0.1
      0,           // 0.5
      0,           // 0.50000001,
      0,           // 0.6
      0,           // 0.7
      0,           // undefined
      -1,          // -1
      0,           // -0
      0,           // -0.1
      -1,          // -1.1
      0,           // NaN
      -127,        // -127
      -128,        // -128
      -32767,      // -32767
      -32768,      // -32768
      -2147483647, // -2147483647
      -2147483648, // -2147483648
      -255,        // -255
      -256,        // -256
      -65535,      // -65535
      -65536,      // -65536
      1,           // -4294967295
      0,           // -4294967296
      0,           // Infinity
      0,           // -Infinity
      0,           // 0
      2049,        // 2049
      2051,        // 2051
      0,           // 0.00006103515625
      0,           // 0.00006097555160522461
      0,           // 5.960464477539063e-8
      0,           // 2.9802322387695312e-8
      0,           // 2.980232238769532e-8
      0,           // 8.940696716308594e-8
      0,           // 1.4901161193847656e-7
      0,           // 1.490116119384766e-7
      65504,       // 65504
      65520,       // 65520
      65519,       // 65519.99999999999
      0,           // 0.000061005353927612305
      0            // 0.0000610053539276123
    ],
    Uint32: [
      127,        // 127
      128,        // 128
      32767,      // 32767
      32768,      // 32768
      2147483647, // 2147483647
      2147483648, // 2147483648
      255,        // 255
      256,        // 256
      65535,      // 65535
      65536,      // 65536
      4294967295, // 4294967295
      0,          // 4294967296
      4294967295, // 9007199254740991
      0,          // 9007199254740992
      1,          // 1.1
      0,          // 0.1
      0,          // 0.5
      0,          // 0.50000001,
      0,          // 0.6
      0,          // 0.7
      0,          // undefined
      4294967295, // -1
      0,          // -0
      0,          // -0.1
      4294967295, // -1.1
      0,          // NaN
      4294967169, // -127
      4294967168, // -128
      4294934529, // -32767
      4294934528, // -32768
      2147483649, // -2147483647
      2147483648, // -2147483648
      4294967041, // -255
      4294967040, // -256
      4294901761, // -65535
      4294901760, // -65536
      1,          // -4294967295
      0,          // -4294967296
      0,          // Infinity
      0,          // -Infinity
      0,          // 0
      2049,       // 2049
      2051,       // 2051
      0,          // 0.00006103515625
      0,          // 0.00006097555160522461
      0,          // 5.960464477539063e-8
      0,          // 2.9802322387695312e-8
      0,          // 2.980232238769532e-8
      0,          // 8.940696716308594e-8
      0,          // 1.4901161193847656e-7
      0,          // 1.490116119384766e-7
      65504,      // 65504
      65520,      // 65520
      65519,      // 65519.99999999999
      0,          // 0.000061005353927612305
      0           // 0.0000610053539276123
    ],
    Float16: [
      127,                    // 127
      128,                    // 128
      32768,                  // 32767
      32768,                  // 32768
      Infinity,               // 2147483647
      Infinity,               // 2147483648
      255,                    // 255
      256,                    // 256
      Infinity,               // 65535
      Infinity,               // 65536
      Infinity,               // 4294967295
      Infinity,               // 4294967296
      Infinity,               // 9007199254740991
      Infinity,               // 9007199254740992
      1.099609375,            // 1.1
      0.0999755859375,        // 0.1
      0.5,                    // 0.5
      0.5,                    // 0.50000001,
      0.60009765625,          // 0.6
      0.7001953125,           // 0.7
      NaN,                    // undefined
      -1,                     // -1
      -0,                     // -0
      -0.0999755859375,       // -0.1
      -1.099609375,           // -1.1
      NaN,                    // NaN
      -127,                   // -127
      -128,                   // -128
      -32768,                 // -32767
      -32768,                 // -32768
      -Infinity,              // -2147483647
      -Infinity,              // -2147483648
      -255,                   // -255
      -256,                   // -256
      -Infinity,              // -65535
      -Infinity,              // -65536
      -Infinity,              // -4294967295
      -Infinity,              // -4294967296
      Infinity,               // Infinity
      -Infinity,              // -Infinity
      0,                      // 0
      2048,                   // 2049
      2052,                   // 2051
      0.00006103515625,       // 0.00006103515625
      0.00006097555160522461, // 0.00006097555160522461
      5.960464477539063e-8,   // 5.960464477539063e-8
      0,                      // 2.9802322387695312e-8
      5.960464477539063e-8,   // 2.980232238769532e-8
      1.1920928955078125e-7,  // 8.940696716308594e-8
      1.1920928955078125e-7,  // 1.4901161193847656e-7
      1.7881393432617188e-7,  // 1.490116119384766e-7
      65504,                  // 65504
      Infinity,               // 65520
      65504,                  // 65519.99999999999
      0.00006103515625,       // 0.000061005353927612305
      0.00006097555160522461  // 0.0000610053539276123
    ],
    Float32: [
      127,                     // 127
      128,                     // 128
      32767,                   // 32767
      32768,                   // 32768
      2147483648,              // 2147483647
      2147483648,              // 2147483648
      255,                     // 255
      256,                     // 256
      65535,                   // 65535
      65536,                   // 65536
      4294967296,              // 4294967295
      4294967296,              // 4294967296
      9007199254740992,        // 9007199254740991
      9007199254740992,        // 9007199254740992
      1.100000023841858,       // 1.1
      0.10000000149011612,     // 0.1
      0.5,                     // 0.5
      0.5,                     // 0.50000001,
      0.6000000238418579,      // 0.6
      0.699999988079071,       // 0.7
      NaN,                     // undefined
      -1,                      // -1
      -0,                      // -0
      -0.10000000149011612,    // -0.1
      -1.100000023841858,      // -1.1
      NaN,                     // NaN
      -127,                    // -127
      -128,                    // -128
      -32767,                  // -32767
      -32768,                  // -32768
      -2147483648,             // -2147483647
      -2147483648,             // -2147483648
      -255,                    // -255
      -256,                    // -256
      -65535,                  // -65535
      -65536,                  // -65536
      -4294967296,             // -4294967295
      -4294967296,             // -4294967296
      Infinity,                // Infinity
      -Infinity,               // -Infinity
      0,                       // 0
      2049,                    // 2049
      2051,                    // 2051
      0.00006103515625,        // 0.00006103515625
      0.00006097555160522461,  // 0.00006097555160522461
      5.960464477539063e-8,    // 5.960464477539063e-8
      2.9802322387695312e-8,   // 2.9802322387695312e-8
      2.9802322387695312e-8,   // 2.980232238769532e-8
      8.940696716308594e-8,    // 8.940696716308594e-8
      1.4901161193847656e-7,   // 1.4901161193847656e-7
      1.4901161193847656e-7,   // 1.490116119384766e-7
      65504,                   // 65504
      65520,                   // 65520
      65520,                   // 65519.99999999999
      0.000061005353927612305, // 0.000061005353927612305
      0.000061005353927612305  // 0.0000610053539276123
    ],
    Float64: [
      127,         // 127
      128,         // 128
      32767,       // 32767
      32768,       // 32768
      2147483647,  // 2147483647
      2147483648,  // 2147483648
      255,         // 255
      256,         // 256
      65535,       // 65535
      65536,       // 65536
      4294967295,  // 4294967295
      4294967296,  // 4294967296
      9007199254740991, // 9007199254740991
      9007199254740992, // 9007199254740992
      1.1,         // 1.1
      0.1,         // 0.1
      0.5,         // 0.5
      0.50000001,  // 0.50000001,
      0.6,         // 0.6
      0.7,         // 0.7
      NaN,         // undefined
      -1,          // -1
      -0,          // -0
      -0.1,        // -0.1
      -1.1,        // -1.1
      NaN,         // NaN
      -127,        // -127
      -128,        // -128
      -32767,      // -32767
      -32768,      // -32768
      -2147483647, // -2147483647
      -2147483648, // -2147483648
      -255,        // -255
      -256,        // -256
      -65535,      // -65535
      -65536,      // -65536
      -4294967295, // -4294967295
      -4294967296, // -4294967296
      Infinity,    // Infinity
      -Infinity,   // -Infinity
      0,           // 0
      2049,                    // 2049
      2051,                    // 2051
      0.00006103515625,        // 0.00006103515625
      0.00006097555160522461,  // 0.00006097555160522461
      5.960464477539063e-8,    // 5.960464477539063e-8
      2.9802322387695312e-8,   // 2.9802322387695312e-8
      2.980232238769532e-8,    // 2.980232238769532e-8
      8.940696716308594e-8,    // 8.940696716308594e-8
      1.4901161193847656e-7,   // 1.4901161193847656e-7
      1.490116119384766e-7,    // 1.490116119384766e-7
      65504,                   // 65504
      65520,                   // 65520
      65519.99999999999,       // 65519.99999999999
      0.000061005353927612305, // 0.000061005353927612305
      0.0000610053539276123    // 0.0000610053539276123
    ]
  }
};

/// deepEqual.js
var EQUAL = 1;
var NOT_EQUAL = -1;
var UNKNOWN = 0;

function setCache(cache, left, right, result) {
  var otherCache;

  otherCache = cache.get(left);
  if (!otherCache) cache.set(left, otherCache = new Map());
  otherCache.set(right, result);

  otherCache = cache.get(right);
  if (!otherCache) cache.set(right, otherCache = new Map());
  otherCache.set(left, result);
}

function getCache(cache, left, right) {
  var otherCache;
  var result;

  otherCache = cache.get(left);
  result = otherCache && otherCache.get(right);
  if (result) return result;

  otherCache = cache.get(right);
  result = otherCache && otherCache.get(left);
  if (result) return result;

  return UNKNOWN;
}

function cacheComparison(a, b, compare, cache) {
  var result = compare(a, b, cache);
  if (cache && (result === EQUAL || result === NOT_EQUAL)) {
    setCache(cache, a, b, result);
  }
  return result;
}

function isBoxed(value) {
  return value instanceof String
    || value instanceof Number
    || value instanceof Boolean
    || value instanceof Symbol;
}

function fail() {
  return NOT_EQUAL;
}

function compareIf(a, b, test, compare, cache) {
  return !test(a)
    ? !test(b) ? UNKNOWN : NOT_EQUAL
    : !test(b) ? NOT_EQUAL : cacheComparison(a, b, compare, cache);
}

function compareEquality(a, b, cache) {
  return compareIf(a, b, isOptional, compareOptionality)
    || compareIf(a, b, isPrimitiveEquatable, comparePrimitiveEquality)
    || compareIf(a, b, isObjectEquatable, compareObjectEquality, cache)
    || NOT_EQUAL;
}

function tryCompareStrictEquality(a, b) {
  return a === b ? EQUAL : UNKNOWN;
}

function tryCompareTypeOfEquality(a, b) {
  return typeof a !== typeof b ? NOT_EQUAL : UNKNOWN;
}

function tryCompareToStringTagEquality(a, b) {
  var aTag = Symbol.toStringTag in a ? a[Symbol.toStringTag] : undefined;
  var bTag = Symbol.toStringTag in b ? b[Symbol.toStringTag] : undefined;
  return aTag !== bTag ? NOT_EQUAL : UNKNOWN;
}

function isOptional(value) {
  return value === undefined
    || value === null;
}

function compareOptionality(a, b) {
  return tryCompareStrictEquality(a, b)
    || NOT_EQUAL;
}

function isPrimitiveEquatable(value) {
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'symbol':
      return true;
    default:
      return isBoxed(value);
  }
}

function comparePrimitiveEquality(a, b) {
  if (isBoxed(a)) a = a.valueOf();
  if (isBoxed(b)) b = b.valueOf();

  return tryCompareStrictEquality(a, b)
    || tryCompareTypeOfEquality(a, b)
    || compareIf(a, b, isNaNEquatable, compareNaNEquality)
    || NOT_EQUAL;
}

function isNaNEquatable(value) {
  return typeof value === 'number';
}

function compareNaNEquality(a, b) {
  return isNaN(a) && isNaN(b) ? EQUAL : NOT_EQUAL;
}

function isObjectEquatable(value) {
  return typeof value === 'object';
}

function compareObjectEquality(a, b, cache) {
  if (!cache) cache = new Map();

  return getCache(cache, a, b)
    || setCache(cache, a, b, EQUAL) // consider equal for now
    || cacheComparison(a, b, tryCompareStrictEquality, cache)
    || cacheComparison(a, b, tryCompareToStringTagEquality, cache)
    || compareIf(a, b, isValueOfEquatable, compareValueOfEquality)
    || compareIf(a, b, isToStringEquatable, compareToStringEquality)
    || compareIf(a, b, isArrayLikeEquatable, compareArrayLikeEquality, cache)
    || compareIf(a, b, isStructurallyEquatable, compareStructuralEquality, cache)
    || compareIf(a, b, isIterableEquatable, compareIterableEquality, cache)
    || cacheComparison(a, b, fail, cache);
}

function isValueOfEquatable(value) {
  return value instanceof Date;
}

function compareValueOfEquality(a, b) {
  return compareIf(a.valueOf(), b.valueOf(), isPrimitiveEquatable, comparePrimitiveEquality)
    || NOT_EQUAL;
}

function isToStringEquatable(value) {
  return value instanceof RegExp;
}

function compareToStringEquality(a, b) {
  return compareIf(a.toString(), b.toString(), isPrimitiveEquatable, comparePrimitiveEquality)
    || NOT_EQUAL;
}

function isArrayLikeEquatable(value) {
  return Array.isArray(value)
    || value instanceof Uint8Array
    || value instanceof Uint8ClampedArray
    || value instanceof Uint16Array
    || value instanceof Uint32Array
    || value instanceof Int8Array
    || value instanceof Int16Array
    || value instanceof Int32Array
    || value instanceof Float32Array
    || value instanceof Float64Array;
}

function compareArrayLikeEquality(a, b, cache) {
  if (a.length !== b.length) return NOT_EQUAL;
  for (var i = 0; i < a.length; i++) {
    if (compareEquality(a[i], b[i], cache) === NOT_EQUAL) {
      return NOT_EQUAL;
    }
  }
  return EQUAL;
}

function isStructurallyEquatable(value) {
  return !(value instanceof Promise // only comparable by reference
    || value instanceof WeakMap // only comparable by reference
    || value instanceof WeakSet // only comparable by reference
    || value instanceof Map // comparable via @@iterator
    || value instanceof Set); // comparable via @@iterator
}

function compareStructuralEquality(a, b, cache) {
  var aKeys = [];
  for (var key in a) aKeys.push(key);

  var bKeys = [];
  for (var key in b) bKeys.push(key);

  if (aKeys.length !== bKeys.length) {
    return NOT_EQUAL;
  }

  aKeys.sort();
  bKeys.sort();

  for (var i = 0; i < aKeys.length; i++) {
    var aKey = aKeys[i];
    var bKey = bKeys[i];
    if (compareEquality(aKey, bKey, cache) === NOT_EQUAL) {
      return NOT_EQUAL;
    }
    if (compareEquality(a[aKey], b[bKey], cache) === NOT_EQUAL) {
      return NOT_EQUAL;
    }
  }

  return EQUAL;
}

// hack: do iterables via for..of
function isIterableEquatable(value) {
  try {
    for (const _ of value) { break; }
    return true;
  } catch {
    return false;
  }
}

function compareIterableEquality(a, b, cache) {
  let aValues = [];
  for (const x of a) aValues.push(x);

  let bValues = [];
  for (const x of b) bValues.push(x);

  return compareArrayLikeEquality(aValues, bValues, cache);
}

var __assert_deepEqual__compare = (a, b) => {
  return compareEquality(a, b) === EQUAL;
};

var __assert_deepEqual = (actual, expected) => {
  if (!assert.deepEqual._compare(actual, expected)) {
    throw new Test262Error('assert.deepEqual failed');
  }
};

/// asyncHelpers.js
const asyncTest = testFunc => {
  if (typeof testFunc !== "function") {
    $DONE(new Test262Error("asyncTest called with non-function argument"));
    return;
  }

  try {
    testFunc().then(() => {
      $DONE();
    }, error => {
      $DONE(error);
    });
  } catch (syncError) {
    $DONE(syncError);
  }
};

var __assert_throwsAsync = (expectedErrorConstructor, func) => {
  if (typeof func !== 'function') {
    throw new Test262Error('assert.throwsAsync invoked with a non-function value');
  }

  let res;
  try {
    res = func();
  } catch {
    throw new Test262Error('assert.throwsAsync failed: function threw synchronously');
  }

  if (res === null || typeof res !== 'object' || typeof res.then !== 'function') {
    throw new Test262Error('assert.throwsAsync failed: result was not a thenable');
  }

  return res.then(
    () => {
      throw new Test262Error('assert.throwsAsync failed: no exception was thrown');
    },
    thrown => {
      // if (thrown === null || typeof thrown !== 'object') {
      //   throw new Test262Error('assert.throwsAsync failed: thrown value was not an object');
      // }
      // if (thrown.constructor !== expectedErrorConstructor) {
      //   throw new Test262Error('assert.throwsAsync failed: wrong error constructor');
      // }
    }
  );
};

/// nativeFunctionMatcher.js
// todo: throw and make looser
const validateNativeFunctionSource = source => {
  if (source.startsWith('function ') && source.endsWith('() { [native code] }')) return;
  throw new Test262Error('validateNativeFunctionSource failed');
};

const assertToStringOrNativeFunction = function(fn, expected) {
  const actual = fn.toString();
  try {
    assert.sameValue(actual, expected);
  } catch {
    assertNativeFunction(fn, expected);
  }
};

const assertNativeFunction = function(fn, special) {
  const actual = fn.toString();
  try {
    validateNativeFunctionSource(actual);
  } catch {
    throw new Test262Error('assertNativeFunction failed');
  }
};

/// compareIterator.js
var __assert_compareIterator = (iter, validators) => {
  var i, result;
  for (i = 0; i < validators.length; i++) {
    result = iter.next();
    assert(!result.done);
    validators[i](result.value);
  }

  result = iter.next();
  assert(result.done);
  assert.sameValue(result.value, undefined);
};

/// regExpUtils.js
function buildString(args) {
  const loneCodePoints = args.loneCodePoints;
  const ranges = args.ranges;
  let result = String.fromCodePoint(...loneCodePoints);
  for (let i = 0; i < ranges.length; i++) {
    let range = ranges[i];
    let start = range[0];
    let end = range[1];
    for (let codePoint = start; codePoint <= end; codePoint++) {
      result += String.fromCodePoint(codePoint);
    }
  }
  return result;
}

// function printCodePoint(codePoint) {
//   const hex = codePoint
//     .toString(16)
//     .toUpperCase()
//     .padStart(6, "0");
//   return `U+${hex}`;
// }

// function printStringCodePoints(string) {
//   const buf = [];
//   for (let symbol of string) {
//     let formatted = printCodePoint(symbol.codePointAt(0));
//     buf.push(formatted);
//   }
//   return buf.join(' ');
// }

function testPropertyEscapes(regExp, string, expression) {
  if (!regExp.test(string)) {
    for (let symbol of string) {
      // let formatted = printCodePoint(symbol.codePointAt(0));
      assert(
        regExp.test(symbol),
        // `\`${ expression }\` should match ${ formatted } (\`${ symbol }\`)`
      );
    }
  }
}

function testPropertyOfStrings(args) {
  // Use member expressions rather than destructuring `args` for improved
  // compatibility with engines that only implement assignment patterns
  // partially or not at all.
  const regExp = args.regExp;
  const expression = args.expression;
  const matchStrings = args.matchStrings;
  const nonMatchStrings = args.nonMatchStrings;
  const allStrings = matchStrings.join('');
  if (!regExp.test(allStrings)) {
    for (let string of matchStrings) {
      assert(
        regExp.test(string),
        // `\`${ expression }\` should match ${ string } (${ printStringCodePoints(string) })`
      );
    }
  }

  if (!nonMatchStrings) return;

  const allNonMatchStrings = nonMatchStrings.join('');
  if (regExp.test(allNonMatchStrings)) {
    for (let string of nonMatchStrings) {
      assert(
        !regExp.test(string),
        // `\`${ expression }\` should not match ${ string } (${ printStringCodePoints(string) })`
      );
    }
  }
}

// The exact same logic can be used to test extended character classes
// as enabled through the RegExp `v` flag. This is useful to test not
// just standalone properties of strings, but also string literals, and
// set operations.
const testExtendedCharacterClass = testPropertyOfStrings;

// Returns a function that validates a RegExp match result.
//
// Example:
//
//    var validate = matchValidator(['b'], 1, 'abc');
//    validate(/b/.exec('abc'));
//
function matchValidator(expectedEntries, expectedIndex, expectedInput) {
  return function(match) {
    assert.compareArray(match, expectedEntries, 'Match entries');
    assert.sameValue(match.index, expectedIndex, 'Match index');
    assert.sameValue(match.input, expectedInput, 'Match input');
  }
}

/// sm/non262.js
function print() {}
function printBugNumber() {}
function inSection() {}
function printStatus() {}
function writeHeaderToLog() {}

function assertThrownErrorContains(f) {
  try {
    f();
  } catch {
    return;
  }

  throw new Test262Error("Expected error no exception thrown");
}

function assertThrowsInstanceOfWithMessageCheck(f, ctor) {
  try {
    f();
  } catch (exc) {
    if (exc instanceof ctor) return;
  }

  throw new Error('assertThrowsInstanceOfWithMessageCheck failed');
};

function assertEq(a, b) {
  assert.sameValue(a, b);
}
function reportCompare(a, b) {
  assert.sameValue(a, b);
}

function reportMatch(expectedRegExp, actual) {
  assert.sameValue(typeof actual, "string");
  assert.notSameValue(expectedRegExp.exec(actual), null);
}

function createExternalArrayBuffer(size) {
  return new ArrayBuffer(size);
}

function enableGeckoProfilingWithSlowAssertions() {}
function enableGeckoProfiling() {}
function disableGeckoProfiling() {}

/// sm/non262-shell.js
function deepEqual(a, b) {
  if (typeof a != typeof b)
    return false;

  if (typeof a == 'object') {
    var props = {};
    for (var prop in a) {
      if (!deepEqual(a[prop], b[prop]))
        return false;
      props[prop] = true;
    }

    for (var prop in b)
      if (!props[prop])
        return false;

    return a.length == b.length;
  }

  if (a === b) {
    return a !== 0 || 1/a === 1/b;
  }

  return a !== a && b !== b;
}

function assertThrowsValue(f, val) {
  var fullmsg;
  try {
    f();
  } catch (exc) {
    if ((exc === val) === (val === val) && (val !== 0 || 1 / exc === 1 / val))
      return;
  }

  throw new Error('assertThrowsValue failed');
};

function assertThrowsInstanceOf(f, ctor) {
  assertThrowsInstanceOfWithMessageCheck(f, ctor);
};

function assertThrowsInstanceOfWithMessage(f, ctor) {
  assertThrowsInstanceOfWithMessageCheck(f, ctor);
}

function assertThrowsInstanceOfWithMessageContains(f, ctor) {
  assertThrowsInstanceOfWithMessageCheck(f, ctor);
}