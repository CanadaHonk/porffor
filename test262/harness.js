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

/// temporalHelpers.js
const ASCII_IDENTIFIER = /^[$_a-zA-Z][$_a-zA-Z0-9]*$/u;

function formatPropertyName(propertyKey, objectName = "") {
  switch (typeof propertyKey) {
    case "symbol":
      if (Symbol.keyFor(propertyKey) !== undefined) {
        return `${objectName}[Symbol.for('${Symbol.keyFor(propertyKey)}')]`;
      } else if (propertyKey.description.startsWith('Symbol.')) {
        return `${objectName}[${propertyKey.description}]`;
      } else {
        return `${objectName}[Symbol('${propertyKey.description}')]`
      }
    case "string":
      if (propertyKey !== String(Number(propertyKey))) {
        if (ASCII_IDENTIFIER.test(propertyKey)) {
          return objectName ? `${objectName}.${propertyKey}` : propertyKey;
        }
        return `${objectName}['${propertyKey.replace(/'/g, "\\'")}']`
      }
      // fall through
    default:
      // integer or string integer-index
      return `${objectName}[${propertyKey}]`;
  }
}

const SKIP_SYMBOL = Symbol("Skip");

var TemporalHelpers = {
  /*
   * Codes and maximum lengths of months in the ISO 8601 calendar.
   */
  ISOMonths: [
    { month: 1, monthCode: "M01", daysInMonth: 31 },
    { month: 2, monthCode: "M02", daysInMonth: 29 },
    { month: 3, monthCode: "M03", daysInMonth: 31 },
    { month: 4, monthCode: "M04", daysInMonth: 30 },
    { month: 5, monthCode: "M05", daysInMonth: 31 },
    { month: 6, monthCode: "M06", daysInMonth: 30 },
    { month: 7, monthCode: "M07", daysInMonth: 31 },
    { month: 8, monthCode: "M08", daysInMonth: 31 },
    { month: 9, monthCode: "M09", daysInMonth: 30 },
    { month: 10, monthCode: "M10", daysInMonth: 31 },
    { month: 11, monthCode: "M11", daysInMonth: 30 },
    { month: 12, monthCode: "M12", daysInMonth: 31 }
  ],

  /*
   * List of known calendar eras and their possible aliases.
   *
   * https://tc39.es/proposal-intl-era-monthcode/#table-eras
   */
  CalendarEras: {
    buddhist: [
      { era: "buddhist", aliases: ["be"] },
    ],
    chinese: [
      { era: "chinese" },
    ],
    coptic: [
      { era: "coptic" },
      { era: "coptic-inverse" },
    ],
    dangi: [
      { era: "dangi" },
    ],
    ethiopic: [
      { era: "ethiopic", aliases: ["incar"] },
      { era: "ethioaa", aliases: ["ethiopic-amete-alem", "mundi"] },
    ],
    ethioaa: [
      { era: "ethioaa", aliases: ["ethiopic-amete-alem", "mundi"] },
    ],
    gregory: [
      { era: "gregory", aliases: ["ce", "ad"] },
      { era: "gregory-inverse", aliases: ["bc", "bce"] },
    ],
    hebrew: [
      { era: "hebrew", aliases: ["am"] },
    ],
    indian: [
      { era: "indian", aliases: ["saka"] },
    ],
    islamic: [
      { era: "islamic", aliases: ["ah"] },
    ],
    "islamic-civil": [
      { era: "islamic-civil", aliases: ["islamicc", "ah"] },
    ],
    "islamic-rgsa": [
      { era: "islamic-rgsa", aliases: ["ah"] },
    ],
    "islamic-tbla": [
      { era: "islamic-tbla", aliases: ["ah"] },
    ],
    "islamic-umalqura": [
      { era: "islamic-umalqura", aliases: ["ah"] },
    ],
    japanese: [
      { era: "heisei" },
      { era: "japanese", aliases: ["gregory", "ad", "ce"] },
      { era: "japanese-inverse", aliases: ["gregory-inverse", "bc", "bce"] },
      { era: "meiji" },
      { era: "reiwa" },
      { era: "showa" },
      { era: "taisho" },
    ],
    persian: [
      { era: "persian", aliases: ["ap"] },
    ],
    roc: [
      { era: "roc", aliases: ["minguo"] },
      { era: "roc-inverse", aliases: ["before-roc"] },
    ],
  },

  /*
   * Return the canonical era code.
   */
  canonicalizeCalendarEra(calendarId, eraName) {
    assert.sameValue(typeof calendarId, "string", "calendar must be string in canonicalizeCalendarEra");

    if (calendarId === "iso8601") {
      assert.sameValue(eraName, undefined);
      return undefined;
    }
    assert(Object.prototype.hasOwnProperty.call(TemporalHelpers.CalendarEras, calendarId));

    if (eraName === undefined) {
      return undefined;
    }
    assert.sameValue(typeof eraName, "string", "eraName must be string or undefined in canonicalizeCalendarEra");

    for (let {era, aliases = []} of TemporalHelpers.CalendarEras[calendarId]) {
      if (era === eraName || aliases.includes(eraName)) {
        return era;
      }
    }
    throw new Test262Error(`Unsupported era name: ${eraName}`);
  },

  /*
   * assertDuration(duration, years, ...,  nanoseconds[, description]):
   *
   * Shorthand for asserting that each field of a Temporal.Duration is equal to
   * an expected value.
   */
  assertDuration(duration, years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds, description = "") {
    const prefix = description ? `${description}: ` : "";
    assert(duration instanceof Temporal.Duration, `${prefix}instanceof`);
    assert.sameValue(duration.years, years, `${prefix}years result:`);
    assert.sameValue(duration.months, months, `${prefix}months result:`);
    assert.sameValue(duration.weeks, weeks, `${prefix}weeks result:`);
    assert.sameValue(duration.days, days, `${prefix}days result:`);
    assert.sameValue(duration.hours, hours, `${prefix}hours result:`);
    assert.sameValue(duration.minutes, minutes, `${prefix}minutes result:`);
    assert.sameValue(duration.seconds, seconds, `${prefix}seconds result:`);
    assert.sameValue(duration.milliseconds, milliseconds, `${prefix}milliseconds result:`);
    assert.sameValue(duration.microseconds, microseconds, `${prefix}microseconds result:`);
    assert.sameValue(duration.nanoseconds, nanoseconds, `${prefix}nanoseconds result`);
  },

  /*
   * assertDateDuration(duration, years, months, weeks, days, [, description]):
   *
   * Shorthand for asserting that each date field of a Temporal.Duration is
   * equal to an expected value.
   */
  assertDateDuration(duration, years, months, weeks, days, description = "") {
    const prefix = description ? `${description}: ` : "";
    assert(duration instanceof Temporal.Duration, `${prefix}instanceof`);
    assert.sameValue(duration.years, years, `${prefix}years result:`);
    assert.sameValue(duration.months, months, `${prefix}months result:`);
    assert.sameValue(duration.weeks, weeks, `${prefix}weeks result:`);
    assert.sameValue(duration.days, days, `${prefix}days result:`);
    assert.sameValue(duration.hours, 0, `${prefix}hours result should be zero:`);
    assert.sameValue(duration.minutes, 0, `${prefix}minutes result should be zero:`);
    assert.sameValue(duration.seconds, 0, `${prefix}seconds result should be zero:`);
    assert.sameValue(duration.milliseconds, 0, `${prefix}milliseconds result should be zero:`);
    assert.sameValue(duration.microseconds, 0, `${prefix}microseconds result should be zero:`);
    assert.sameValue(duration.nanoseconds, 0, `${prefix}nanoseconds result should be zero:`);
  },

  /*
   * assertDurationsEqual(actual, expected[, description]):
   *
   * Shorthand for asserting that each field of a Temporal.Duration is equal to
   * the corresponding field in another Temporal.Duration.
   */
  assertDurationsEqual(actual, expected, description = "") {
    const prefix = description ? `${description}: ` : "";
    assert(expected instanceof Temporal.Duration, `${prefix}expected value should be a Temporal.Duration`);
    TemporalHelpers.assertDuration(actual, expected.years, expected.months, expected.weeks, expected.days, expected.hours, expected.minutes, expected.seconds, expected.milliseconds, expected.microseconds, expected.nanoseconds, description);
  },

  /*
   * assertInstantsEqual(actual, expected[, description]):
   *
   * Shorthand for asserting that two Temporal.Instants are of the correct type
   * and equal according to their equals() methods.
   */
  assertInstantsEqual(actual, expected, description = "") {
    const prefix = description ? `${description}: ` : "";
    assert(expected instanceof Temporal.Instant, `${prefix}expected value should be a Temporal.Instant`);
    assert(actual instanceof Temporal.Instant, `${prefix}instanceof`);
    assert(actual.equals(expected), `${prefix}equals method`);
  },

  /*
   * assertPlainDate(date, year, ..., nanosecond[, description[, era, eraYear]]):
   *
   * Shorthand for asserting that each field of a Temporal.PlainDate is equal to
   * an expected value. (Except the `calendar` property, since callers may want
   * to assert either object equality with an object they put in there, or the
   * value of date.calendarId.)
   */
  assertPlainDate(date, year, month, monthCode, day, description = "", era = undefined, eraYear = undefined) {
    const prefix = description ? `${description}: ` : "";
    assert(date instanceof Temporal.PlainDate, `${prefix}instanceof`);
    assert.sameValue(
      TemporalHelpers.canonicalizeCalendarEra(date.calendarId, date.era),
      TemporalHelpers.canonicalizeCalendarEra(date.calendarId, era),
      `${prefix}era result:`
    );
    assert.sameValue(date.eraYear, eraYear, `${prefix}eraYear result:`);
    assert.sameValue(date.year, year, `${prefix}year result:`);
    assert.sameValue(date.month, month, `${prefix}month result:`);
    assert.sameValue(date.monthCode, monthCode, `${prefix}monthCode result:`);
    assert.sameValue(date.day, day, `${prefix}day result:`);
  },

  /*
   * assertPlainDateTime(datetime, year, ..., nanosecond[, description[, era, eraYear]]):
   *
   * Shorthand for asserting that each field of a Temporal.PlainDateTime is
   * equal to an expected value. (Except the `calendar` property, since callers
   * may want to assert either object equality with an object they put in there,
   * or the value of datetime.calendarId.)
   */
  assertPlainDateTime(datetime, year, month, monthCode, day, hour, minute, second, millisecond, microsecond, nanosecond, description = "", era = undefined, eraYear = undefined) {
    const prefix = description ? `${description}: ` : "";
    assert(datetime instanceof Temporal.PlainDateTime, `${prefix}instanceof`);
    assert.sameValue(
      TemporalHelpers.canonicalizeCalendarEra(datetime.calendarId, datetime.era),
      TemporalHelpers.canonicalizeCalendarEra(datetime.calendarId, era),
      `${prefix}era result:`
    );
    assert.sameValue(datetime.eraYear, eraYear, `${prefix}eraYear result:`);
    assert.sameValue(datetime.year, year, `${prefix}year result:`);
    assert.sameValue(datetime.month, month, `${prefix}month result:`);
    assert.sameValue(datetime.monthCode, monthCode, `${prefix}monthCode result:`);
    assert.sameValue(datetime.day, day, `${prefix}day result:`);
    assert.sameValue(datetime.hour, hour, `${prefix}hour result:`);
    assert.sameValue(datetime.minute, minute, `${prefix}minute result:`);
    assert.sameValue(datetime.second, second, `${prefix}second result:`);
    assert.sameValue(datetime.millisecond, millisecond, `${prefix}millisecond result:`);
    assert.sameValue(datetime.microsecond, microsecond, `${prefix}microsecond result:`);
    assert.sameValue(datetime.nanosecond, nanosecond, `${prefix}nanosecond result:`);
  },

  /*
   * assertPlainDateTimesEqual(actual, expected[, description]):
   *
   * Shorthand for asserting that two Temporal.PlainDateTimes are of the correct
   * type, equal according to their equals() methods, and additionally that
   * their calendar internal slots are the same value.
   */
  assertPlainDateTimesEqual(actual, expected, description = "") {
    const prefix = description ? `${description}: ` : "";
    assert(expected instanceof Temporal.PlainDateTime, `${prefix}expected value should be a Temporal.PlainDateTime`);
    assert(actual instanceof Temporal.PlainDateTime, `${prefix}instanceof`);
    assert(actual.equals(expected), `${prefix}equals method`);
    assert.sameValue(
      actual.calendarId,
      expected.calendarId,
      `${prefix}calendar same value:`
    );
  },

  /*
   * assertPlainMonthDay(monthDay, monthCode, day[, description [, referenceISOYear]]):
   *
   * Shorthand for asserting that each field of a Temporal.PlainMonthDay is
   * equal to an expected value. (Except the `calendar` property, since callers
   * may want to assert either object equality with an object they put in there,
   * or the value of monthDay.calendarId().)
   */
  assertPlainMonthDay(monthDay, monthCode, day, description = "", referenceISOYear = 1972) {
    const prefix = description ? `${description}: ` : "";
    assert(monthDay instanceof Temporal.PlainMonthDay, `${prefix}instanceof`);
    assert.sameValue(monthDay.monthCode, monthCode, `${prefix}monthCode result:`);
    assert.sameValue(monthDay.day, day, `${prefix}day result:`);
    const isoYear = Number(monthDay.toString({ calendarName: "always" }).split("-")[0]);
    assert.sameValue(isoYear, referenceISOYear, `${prefix}referenceISOYear result:`);
  },

  /*
   * assertPlainTime(time, hour, ..., nanosecond[, description]):
   *
   * Shorthand for asserting that each field of a Temporal.PlainTime is equal to
   * an expected value.
   */
  assertPlainTime(time, hour, minute, second, millisecond, microsecond, nanosecond, description = "") {
    const prefix = description ? `${description}: ` : "";
    assert(time instanceof Temporal.PlainTime, `${prefix}instanceof`);
    assert.sameValue(time.hour, hour, `${prefix}hour result:`);
    assert.sameValue(time.minute, minute, `${prefix}minute result:`);
    assert.sameValue(time.second, second, `${prefix}second result:`);
    assert.sameValue(time.millisecond, millisecond, `${prefix}millisecond result:`);
    assert.sameValue(time.microsecond, microsecond, `${prefix}microsecond result:`);
    assert.sameValue(time.nanosecond, nanosecond, `${prefix}nanosecond result:`);
  },

  /*
   * assertPlainTimesEqual(actual, expected[, description]):
   *
   * Shorthand for asserting that two Temporal.PlainTimes are of the correct
   * type and equal according to their equals() methods.
   */
  assertPlainTimesEqual(actual, expected, description = "") {
    const prefix = description ? `${description}: ` : "";
    assert(expected instanceof Temporal.PlainTime, `${prefix}expected value should be a Temporal.PlainTime`);
    assert(actual instanceof Temporal.PlainTime, `${prefix}instanceof`);
    assert(actual.equals(expected), `${prefix}equals method`);
  },

  /*
   * assertPlainYearMonth(yearMonth, year, month, monthCode[, description[, era, eraYear, referenceISODay]]):
   *
   * Shorthand for asserting that each field of a Temporal.PlainYearMonth is
   * equal to an expected value. (Except the `calendar` property, since callers
   * may want to assert either object equality with an object they put in there,
   * or the value of yearMonth.calendarId.)
   */
  assertPlainYearMonth(yearMonth, year, month, monthCode, description = "", era = undefined, eraYear = undefined, referenceISODay = 1) {
    const prefix = description ? `${description}: ` : "";
    assert(yearMonth instanceof Temporal.PlainYearMonth, `${prefix}instanceof`);
    assert.sameValue(
      TemporalHelpers.canonicalizeCalendarEra(yearMonth.calendarId, yearMonth.era),
      TemporalHelpers.canonicalizeCalendarEra(yearMonth.calendarId, era),
      `${prefix}era result:`
    );
    assert.sameValue(yearMonth.eraYear, eraYear, `${prefix}eraYear result:`);
    assert.sameValue(yearMonth.year, year, `${prefix}year result:`);
    assert.sameValue(yearMonth.month, month, `${prefix}month result:`);
    assert.sameValue(yearMonth.monthCode, monthCode, `${prefix}monthCode result:`);
    const isoDay = Number(yearMonth.toString({ calendarName: "always" }).slice(1).split('-')[2].slice(0, 2));
    assert.sameValue(isoDay, referenceISODay, `${prefix}referenceISODay result:`);
  },

  /*
   * assertZonedDateTimesEqual(actual, expected[, description]):
   *
   * Shorthand for asserting that two Temporal.ZonedDateTimes are of the correct
   * type, equal according to their equals() methods, and additionally that
   * their time zones and calendar internal slots are the same value.
   */
  assertZonedDateTimesEqual(actual, expected, description = "") {
    const prefix = description ? `${description}: ` : "";
    assert(expected instanceof Temporal.ZonedDateTime, `${prefix}expected value should be a Temporal.ZonedDateTime`);
    assert(actual instanceof Temporal.ZonedDateTime, `${prefix}instanceof`);
    assert(actual.equals(expected), `${prefix}equals method`);
    assert.sameValue(actual.timeZone, expected.timeZone, `${prefix}time zone same value:`);
    assert.sameValue(
      actual.calendarId,
      expected.calendarId,
      `${prefix}calendar same value:`
    );
  },

  /*
   * assertUnreachable(description):
   *
   * Helper for asserting that code is not executed.
   */
  assertUnreachable(description) {
    let message = "This code should not be executed";
    if (description) {
      message = `${message}: ${description}`;
    }
    throw new Test262Error(message);
  },

  /*
   * checkPlainDateTimeConversionFastPath(func):
   *
   * ToTemporalDate and ToTemporalTime should both, if given a
   * Temporal.PlainDateTime instance, convert to the desired type by reading the
   * PlainDateTime's internal slots, rather than calling any getters.
   *
   * func(datetime) is the actual operation to test, that must
   * internally call the abstract operation ToTemporalDate or ToTemporalTime.
   * It is passed a Temporal.PlainDateTime instance.
   */
  checkPlainDateTimeConversionFastPath(func, message = "checkPlainDateTimeConversionFastPath") {
    const actual = [];
    const expected = [];

    const calendar = "iso8601";
    const datetime = new Temporal.PlainDateTime(2000, 5, 2, 12, 34, 56, 987, 654, 321, calendar);
    const prototypeDescrs = Object.getOwnPropertyDescriptors(Temporal.PlainDateTime.prototype);
    const propertyList = ["year", "month", "monthCode", "day", "hour", "minute", "second", "millisecond", "microsecond", "nanosecond"];
    for (let i = 0; i < propertyList.length; i++) {
      const property = propertyList[i];
      Object.defineProperty(datetime, property, {
        get() {
          actual.push(`get ${formatPropertyName(property)}`);
          const value = prototypeDescrs[property].get.call(this);
          return {
            toString() {
              actual.push(`toString ${formatPropertyName(property)}`);
              return value.toString();
            },
            valueOf() {
              actual.push(`valueOf ${formatPropertyName(property)}`);
              return value;
            },
          };
        },
      });
    }
    Object.defineProperty(datetime, "calendar", {
      get() {
        actual.push("get calendar");
        return calendar;
      },
    });

    func(datetime);
    assert.compareArray(actual, expected, `${message}: property getters not called`);
  },

  /*
   * Check that an options bag that accepts units written in the singular form,
   * also accepts the same units written in the plural form.
   * func(unit) should call the method with the appropriate options bag
   * containing unit as a value. This will be called twice for each element of
   * validSingularUnits, once with singular and once with plural, and the
   * results of each pair should be the same (whether a Temporal object or a
   * primitive value.)
   */
  checkPluralUnitsAccepted(func, validSingularUnits) {
    const plurals = {
      year: 'years',
      month: 'months',
      week: 'weeks',
      day: 'days',
      hour: 'hours',
      minute: 'minutes',
      second: 'seconds',
      millisecond: 'milliseconds',
      microsecond: 'microseconds',
      nanosecond: 'nanoseconds',
    };

    for (let i = 0; i < validSingularUnits.length; i++) {
      const unit = validSingularUnits[i];
      const singularValue = func(unit);
      const pluralValue = func(plurals[unit]);
      const desc = `Plural ${plurals[unit]} produces the same result as singular ${unit}`;
      if (singularValue instanceof Temporal.Duration) {
        TemporalHelpers.assertDurationsEqual(pluralValue, singularValue, desc);
      } else if (singularValue instanceof Temporal.Instant) {
        TemporalHelpers.assertInstantsEqual(pluralValue, singularValue, desc);
      } else if (singularValue instanceof Temporal.PlainDateTime) {
        TemporalHelpers.assertPlainDateTimesEqual(pluralValue, singularValue, desc);
      } else if (singularValue instanceof Temporal.PlainTime) {
        TemporalHelpers.assertPlainTimesEqual(pluralValue, singularValue, desc);
      } else if (singularValue instanceof Temporal.ZonedDateTime) {
        TemporalHelpers.assertZonedDateTimesEqual(pluralValue, singularValue, desc);
      } else {
        assert.sameValue(pluralValue, singularValue);
      }
    }
  },

  /*
   * checkRoundingIncrementOptionWrongType(checkFunc, assertTrueResultFunc, assertObjectResultFunc):
   *
   * Checks the type handling of the roundingIncrement option.
   * checkFunc(roundingIncrement) is a function which takes the value of
   * roundingIncrement to test, and calls the method under test with it,
   * returning the result. assertTrueResultFunc(result, description) should
   * assert that result is the expected result with roundingIncrement: true, and
   * assertObjectResultFunc(result, description) should assert that result is
   * the expected result with roundingIncrement being an object with a valueOf()
   * method.
   */
  checkRoundingIncrementOptionWrongType(checkFunc, assertTrueResultFunc, assertObjectResultFunc) {
    // null converts to 0, which is out of range
    assert.throws(RangeError, () => checkFunc(null), "null");
    // Booleans convert to either 0 or 1, and 1 is allowed
    const trueResult = checkFunc(true);
    assertTrueResultFunc(trueResult, "true");
    assert.throws(RangeError, () => checkFunc(false), "false");
    // Symbols and BigInts cannot convert to numbers
    assert.throws(TypeError, () => checkFunc(Symbol()), "symbol");
    assert.throws(TypeError, () => checkFunc(2n), "bigint");

    // Objects prefer their valueOf() methods when converting to a number
    assert.throws(RangeError, () => checkFunc({}), "plain object");

    const expected = [
      "get roundingIncrement.valueOf",
      "call roundingIncrement.valueOf",
    ];
    const actual = [];
    const observer = TemporalHelpers.toPrimitiveObserver(actual, 2, "roundingIncrement");
    const objectResult = checkFunc(observer);
    assertObjectResultFunc(objectResult, "object with valueOf");
    assert.compareArray(actual, expected, "order of operations");
  },

  /*
   * checkStringOptionWrongType(propertyName, value, checkFunc, assertFunc):
   *
   * Checks the type handling of a string option, of which there are several in
   * Temporal.
   * propertyName is the name of the option, and value is the value that
   * assertFunc should expect it to have.
   * checkFunc(value) is a function which takes the value of the option to test,
   * and calls the method under test with it, returning the result.
   * assertFunc(result, description) should assert that result is the expected
   * result with the option value being an object with a toString() method
   * which returns the given value.
   */
  checkStringOptionWrongType(propertyName, value, checkFunc, assertFunc) {
    // null converts to the string "null", which is an invalid string value
    assert.throws(RangeError, () => checkFunc(null), "null");
    // Booleans convert to the strings "true" or "false", which are invalid
    assert.throws(RangeError, () => checkFunc(true), "true");
    assert.throws(RangeError, () => checkFunc(false), "false");
    // Symbols cannot convert to strings
    assert.throws(TypeError, () => checkFunc(Symbol()), "symbol");
    // Numbers convert to strings which are invalid
    assert.throws(RangeError, () => checkFunc(2), "number");
    // BigInts convert to strings which are invalid
    assert.throws(RangeError, () => checkFunc(2n), "bigint");

    // Objects prefer their toString() methods when converting to a string
    assert.throws(RangeError, () => checkFunc({}), "plain object");

    const expected = [
      `get ${propertyName}.toString`,
      `call ${propertyName}.toString`,
    ];
    const actual = [];
    const observer = TemporalHelpers.toPrimitiveObserver(actual, value, propertyName);
    const result = checkFunc(observer);
    assertFunc(result, "object with toString");
    assert.compareArray(actual, expected, "order of operations");
  },

  /*
   * checkSubclassingIgnored(construct, constructArgs, method, methodArgs,
   *   resultAssertions):
   *
   * Methods of Temporal classes that return a new instance of the same class,
   * must not take the constructor of a subclass into account, nor the @@species
   * property. This helper runs tests to ensure this.
   *
   * construct(...constructArgs) must yield a valid instance of the Temporal
   * class. instance[method](...methodArgs) is the method call under test, which
   * must also yield a valid instance of the same Temporal class, not a
   * subclass. See below for the individual tests that this runs.
   * resultAssertions() is a function that performs additional assertions on the
   * instance returned by the method under test.
   */
  checkSubclassingIgnored(...args) {
    this.checkSubclassConstructorNotObject(...args);
    this.checkSubclassConstructorUndefined(...args);
    this.checkSubclassConstructorThrows(...args);
    this.checkSubclassConstructorNotCalled(...args);
    this.checkSubclassSpeciesInvalidResult(...args);
    this.checkSubclassSpeciesNotAConstructor(...args);
    this.checkSubclassSpeciesNull(...args);
    this.checkSubclassSpeciesUndefined(...args);
    this.checkSubclassSpeciesThrows(...args);
  },

  /*
   * Checks that replacing the 'constructor' property of the instance with
   * various primitive values does not affect the returned new instance.
   */
  checkSubclassConstructorNotObject(construct, constructArgs, method, methodArgs, resultAssertions) {
    function check(value, description) {
      const instance = new construct(...constructArgs);
      instance.constructor = value;
      const result = instance[method](...methodArgs);
      assert.sameValue(Object.getPrototypeOf(result), construct.prototype, description);
      resultAssertions(result);
    }

    check(null, "null");
    check(true, "true");
    check("test", "string");
    check(Symbol(), "Symbol");
    check(7, "number");
    check(7n, "bigint");
  },

  /*
   * Checks that replacing the 'constructor' property of the subclass with
   * undefined does not affect the returned new instance.
   */
  checkSubclassConstructorUndefined(construct, constructArgs, method, methodArgs, resultAssertions) {
    let called = 0;

    class MySubclass extends construct {
      constructor() {
        ++called;
        super(...constructArgs);
      }
    }

    const instance = new MySubclass();
    assert.sameValue(called, 1);

    MySubclass.prototype.constructor = undefined;

    const result = instance[method](...methodArgs);
    assert.sameValue(called, 1);
    assert.sameValue(Object.getPrototypeOf(result), construct.prototype);
    resultAssertions(result);
  },

  /*
   * Checks that making the 'constructor' property of the instance throw when
   * called does not affect the returned new instance.
   */
  checkSubclassConstructorThrows(construct, constructArgs, method, methodArgs, resultAssertions) {
    function CustomError() {}
    const instance = new construct(...constructArgs);
    Object.defineProperty(instance, "constructor", {
      get() {
        throw new CustomError();
      }
    });
    const result = instance[method](...methodArgs);
    assert.sameValue(Object.getPrototypeOf(result), construct.prototype);
    resultAssertions(result);
  },

  /*
   * Checks that when subclassing, the subclass constructor is not called by
   * the method under test.
   */
  checkSubclassConstructorNotCalled(construct, constructArgs, method, methodArgs, resultAssertions) {
    let called = 0;

    class MySubclass extends construct {
      constructor() {
        ++called;
        super(...constructArgs);
      }
    }

    const instance = new MySubclass();
    assert.sameValue(called, 1);

    const result = instance[method](...methodArgs);
    assert.sameValue(called, 1);
    assert.sameValue(Object.getPrototypeOf(result), construct.prototype);
    resultAssertions(result);
  },

  /*
   * Check that the constructor's @@species property is ignored when it's a
   * constructor that returns a non-object value.
   */
  checkSubclassSpeciesInvalidResult(construct, constructArgs, method, methodArgs, resultAssertions) {
    function check(value, description) {
      const instance = new construct(...constructArgs);
      instance.constructor = {
        [Symbol.species]: function() {
          return value;
        },
      };
      const result = instance[method](...methodArgs);
      assert.sameValue(Object.getPrototypeOf(result), construct.prototype, description);
      resultAssertions(result);
    }

    check(undefined, "undefined");
    check(null, "null");
    check(true, "true");
    check("test", "string");
    check(Symbol(), "Symbol");
    check(7, "number");
    check(7n, "bigint");
    check({}, "plain object");
  },

  /*
   * Check that the constructor's @@species property is ignored when it's not a
   * constructor.
   */
  checkSubclassSpeciesNotAConstructor(construct, constructArgs, method, methodArgs, resultAssertions) {
    function check(value, description) {
      const instance = new construct(...constructArgs);
      instance.constructor = {
        [Symbol.species]: value,
      };
      const result = instance[method](...methodArgs);
      assert.sameValue(Object.getPrototypeOf(result), construct.prototype, description);
      resultAssertions(result);
    }

    check(true, "true");
    check("test", "string");
    check(Symbol(), "Symbol");
    check(7, "number");
    check(7n, "bigint");
    check({}, "plain object");
  },

  /*
   * Check that the constructor's @@species property is ignored when it's null.
   */
  checkSubclassSpeciesNull(construct, constructArgs, method, methodArgs, resultAssertions) {
    let called = 0;

    class MySubclass extends construct {
      constructor() {
        ++called;
        super(...constructArgs);
      }
    }

    const instance = new MySubclass();
    assert.sameValue(called, 1);

    MySubclass.prototype.constructor = {
      [Symbol.species]: null,
    };

    const result = instance[method](...methodArgs);
    assert.sameValue(called, 1);
    assert.sameValue(Object.getPrototypeOf(result), construct.prototype);
    resultAssertions(result);
  },

  /*
   * Check that the constructor's @@species property is ignored when it's
   * undefined.
   */
  checkSubclassSpeciesUndefined(construct, constructArgs, method, methodArgs, resultAssertions) {
    let called = 0;

    class MySubclass extends construct {
      constructor() {
        ++called;
        super(...constructArgs);
      }
    }

    const instance = new MySubclass();
    assert.sameValue(called, 1);

    MySubclass.prototype.constructor = {
      [Symbol.species]: undefined,
    };

    const result = instance[method](...methodArgs);
    assert.sameValue(called, 1);
    assert.sameValue(Object.getPrototypeOf(result), construct.prototype);
    resultAssertions(result);
  },

  /*
   * Check that the constructor's @@species property is ignored when it throws,
   * i.e. it is not called at all.
   */
  checkSubclassSpeciesThrows(construct, constructArgs, method, methodArgs, resultAssertions) {
    function CustomError() {}

    const instance = new construct(...constructArgs);
    instance.constructor = {
      get [Symbol.species]() {
        throw new CustomError();
      },
    };

    const result = instance[method](...methodArgs);
    assert.sameValue(Object.getPrototypeOf(result), construct.prototype);
  },

  /*
   * checkSubclassingIgnoredStatic(construct, method, methodArgs, resultAssertions):
   *
   * Static methods of Temporal classes that return a new instance of the class,
   * must not use the this-value as a constructor. This helper runs tests to
   * ensure this.
   *
   * construct[method](...methodArgs) is the static method call under test, and
   * must yield a valid instance of the Temporal class, not a subclass. See
   * below for the individual tests that this runs.
   * resultAssertions() is a function that performs additional assertions on the
   * instance returned by the method under test.
   */
  checkSubclassingIgnoredStatic(...args) {
    this.checkStaticInvalidReceiver(...args);
    this.checkStaticReceiverNotCalled(...args);
    this.checkThisValueNotCalled(...args);
  },

  /*
   * Check that calling the static method with a receiver that's not callable,
   * still calls the intrinsic constructor.
   */
  checkStaticInvalidReceiver(construct, method, methodArgs, resultAssertions) {
    function check(value, description) {
      const result = construct[method].apply(value, methodArgs);
      assert.sameValue(Object.getPrototypeOf(result), construct.prototype);
      resultAssertions(result);
    }

    check(undefined, "undefined");
    check(null, "null");
    check(true, "true");
    check("test", "string");
    check(Symbol(), "symbol");
    check(7, "number");
    check(7n, "bigint");
    check({}, "Non-callable object");
  },

  /*
   * Check that calling the static method with a receiver that returns a value
   * that's not callable, still calls the intrinsic constructor.
   */
  checkStaticReceiverNotCalled(construct, method, methodArgs, resultAssertions) {
    function check(value, description) {
      const receiver = function () {
        return value;
      };
      const result = construct[method].apply(receiver, methodArgs);
      assert.sameValue(Object.getPrototypeOf(result), construct.prototype);
      resultAssertions(result);
    }

    check(undefined, "undefined");
    check(null, "null");
    check(true, "true");
    check("test", "string");
    check(Symbol(), "symbol");
    check(7, "number");
    check(7n, "bigint");
    check({}, "Non-callable object");
  },

  /*
   * Check that the receiver isn't called.
   */
  checkThisValueNotCalled(construct, method, methodArgs, resultAssertions) {
    let called = false;

    class MySubclass extends construct {
      constructor(...args) {
        called = true;
        super(...args);
      }
    }

    const result = MySubclass[method](...methodArgs);
    assert.sameValue(called, false);
    assert.sameValue(Object.getPrototypeOf(result), construct.prototype);
    resultAssertions(result);
  },

  /*
   * Check that any calendar-carrying Temporal object has its [[Calendar]]
   * internal slot read by ToTemporalCalendar, and does not fetch the calendar
   * by calling getters.
   */
  checkToTemporalCalendarFastPath(func) {
    const plainDate = new Temporal.PlainDate(2000, 5, 2, "iso8601");
    const plainDateTime = new Temporal.PlainDateTime(2000, 5, 2, 12, 34, 56, 987, 654, 321, "iso8601");
    const plainMonthDay = new Temporal.PlainMonthDay(5, 2, "iso8601");
    const plainYearMonth = new Temporal.PlainYearMonth(2000, 5, "iso8601");
    const zonedDateTime = new Temporal.ZonedDateTime(1_000_000_000_000_000_000n, "UTC", "iso8601");

    const temporalObjects = [plainDate, plainDateTime, plainMonthDay, plainYearMonth, zonedDateTime];
    for (let i = 0; i < temporalObjects.length; i++) {
      const temporalObject = temporalObjects[i];
      const actual = [];
      const expected = [];

      Object.defineProperty(temporalObject, "calendar", {
        get() {
          actual.push("get calendar");
          return calendar;
        },
      });

      func(temporalObject);
      assert.compareArray(actual, expected, "calendar getter not called");
    }
  },

  checkToTemporalInstantFastPath(func) {
    const actual = [];
    const expected = [];

    const datetime = new Temporal.ZonedDateTime(1_000_000_000_987_654_321n, "UTC");
    Object.defineProperty(datetime, 'toString', {
      get() {
        actual.push("get toString");
        return function (options) {
          actual.push("call toString");
          return Temporal.ZonedDateTime.prototype.toString.call(this, options);
        };
      },
    });

    func(datetime);
    assert.compareArray(actual, expected, "toString not called");
  },

  checkToTemporalPlainDateTimeFastPath(func) {
    const actual = [];
    const expected = [];

    const date = new Temporal.PlainDate(2000, 5, 2, "iso8601");
    const prototypeDescrs = Object.getOwnPropertyDescriptors(Temporal.PlainDate.prototype);
    const dateProperties = ["year", "month", "monthCode", "day"];
    for (let i = 0; i < dateProperties.length; i++) {
      const property = dateProperties[i];
      Object.defineProperty(date, property, {
        get() {
          actual.push(`get ${formatPropertyName(property)}`);
          const value = prototypeDescrs[property].get.call(this);
          return TemporalHelpers.toPrimitiveObserver(actual, value, property);
        },
      });
    }
    const timeProperties = ["hour", "minute", "second", "millisecond", "microsecond", "nanosecond"];
    for (let i = 0; i < timeProperties.length; i++) {
      const property = timeProperties[i];
      Object.defineProperty(date, property, {
        get() {
          actual.push(`get ${formatPropertyName(property)}`);
          return undefined;
        },
      });
    }
    Object.defineProperty(date, "calendar", {
      get() {
        actual.push("get calendar");
        return "iso8601";
      },
    });

    func(date);
    assert.compareArray(actual, expected, "property getters not called");
  },

  /*
   * observeProperty(calls, object, propertyName, value):
   *
   * Defines an own property @object.@propertyName with value @value, that
   * will log any calls to its accessors to the array @calls.
   */
  observeProperty(calls, object, propertyName, value, objectName = "") {
    Object.defineProperty(object, propertyName, {
      get() {
        calls.push(`get ${formatPropertyName(propertyName, objectName)}`);
        return value;
      },
      set(v) {
        calls.push(`set ${formatPropertyName(propertyName, objectName)}`);
      }
    });
  },

  /*
   * observeMethod(calls, object, propertyName, value):
   *
   * Defines an own property @object.@propertyName with value @value, that
   * will log any calls of @value to the array @calls.
   */
  observeMethod(calls, object, propertyName, objectName = "") {
    const method = object[propertyName];
    object[propertyName] = function () {
      calls.push(`call ${formatPropertyName(propertyName, objectName)}`);
      return method.apply(object, arguments);
    };
  },

  /*
   * Used for substituteMethod to indicate default behavior instead of a
   * substituted value
   */
  SUBSTITUTE_SKIP: SKIP_SYMBOL,

  /*
   * substituteMethod(object, propertyName, values):
   *
   * Defines an own property @object.@propertyName that will, for each
   * subsequent call to the method previously defined as
   * @object.@propertyName:
   *  - Call the method, if no more values remain
   *  - Call the method, if the value in @values for the corresponding call
   *    is SUBSTITUTE_SKIP
   *  - Otherwise, return the corresponding value in @value
   */
  substituteMethod(object, propertyName, values) {
    let calls = 0;
    const method = object[propertyName];
    object[propertyName] = function () {
      if (calls >= values.length) {
        return method.apply(object, arguments);
      } else if (values[calls] === SKIP_SYMBOL) {
        calls++;
        return method.apply(object, arguments);
      } else {
        return values[calls++];
      }
    };
  },

  /*
   * propertyBagObserver():
   * Returns an object that behaves like the given propertyBag but tracks Get
   * and Has operations on any of its properties, by appending messages to an
   * array. If the value of a property in propertyBag is a primitive, the value
   * of the returned object's property will additionally be a
   * TemporalHelpers.toPrimitiveObserver that will track calls to its toString
   * and valueOf methods in the same array. This is for the purpose of testing
   * order of operations that are observable from user code. objectName is used
   * in the log.
   * If skipToPrimitive is given, it must be an array of property keys. Those
   * properties will not have a TemporalHelpers.toPrimitiveObserver returned,
   * and instead just be returned directly.
   */
  propertyBagObserver(calls, propertyBag, objectName, skipToPrimitive) {
    return new Proxy(propertyBag, {
      ownKeys(target) {
        calls.push(`ownKeys ${objectName}`);
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, key) {
        calls.push(`getOwnPropertyDescriptor ${formatPropertyName(key, objectName)}`);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      get(target, key, receiver) {
        calls.push(`get ${formatPropertyName(key, objectName)}`);
        const result = Reflect.get(target, key, receiver);
        if (result === undefined) {
          return undefined;
        }
        if ((result !== null && typeof result === "object") || typeof result === "function") {
          return result;
        }
        if (skipToPrimitive && skipToPrimitive.indexOf(key) >= 0) {
          return result;
        }
        return TemporalHelpers.toPrimitiveObserver(calls, result, `${formatPropertyName(key, objectName)}`);
      },
      has(target, key) {
        calls.push(`has ${formatPropertyName(key, objectName)}`);
        return Reflect.has(target, key);
      },
    });
  },

  /*
   * Returns an object that will append logs of any Gets or Calls of its valueOf
   * or toString properties to the array calls. Both valueOf and toString will
   * return the actual primitiveValue. propertyName is used in the log.
   */
  toPrimitiveObserver(calls, primitiveValue, propertyName) {
    return {
      get valueOf() {
        calls.push(`get ${propertyName}.valueOf`);
        return function () {
          calls.push(`call ${propertyName}.valueOf`);
          return primitiveValue;
        };
      },
      get toString() {
        calls.push(`get ${propertyName}.toString`);
        return function () {
          calls.push(`call ${propertyName}.toString`);
          if (primitiveValue === undefined) return undefined;
          return primitiveValue.toString();
        };
      },
    };
  },

  /*
   * An object containing further methods that return arrays of ISO strings, for
   * testing parsers.
   */
  ISO: {
    /*
     * PlainMonthDay strings that are not valid.
     */
    plainMonthDayStringsInvalid() {
      return [
        "11-18junk",
        "11-18[u-ca=gregory]",
        "11-18[u-ca=hebrew]",
        "11-18[U-CA=iso8601]",
        "11-18[u-CA=iso8601]",
        "11-18[FOO=bar]",
        "-999999-01-01[u-ca=gregory]",
        "-999999-01-01[u-ca=chinese]",
        "+999999-01-01[u-ca=gregory]",
        "+999999-01-01[u-ca=chinese]",
      ];
    },

    /*
     * PlainMonthDay strings that are valid and that should produce October 1st.
     */
    plainMonthDayStringsValid() {
      return [
        "10-01",
        "1001",
        "1965-10-01",
        "1976-10-01T152330.1+00:00",
        "19761001T15:23:30.1+00:00",
        "1976-10-01T15:23:30.1+0000",
        "1976-10-01T152330.1+0000",
        "19761001T15:23:30.1+0000",
        "19761001T152330.1+00:00",
        "19761001T152330.1+0000",
        "+001976-10-01T152330.1+00:00",
        "+0019761001T15:23:30.1+00:00",
        "+001976-10-01T15:23:30.1+0000",
        "+001976-10-01T152330.1+0000",
        "+0019761001T15:23:30.1+0000",
        "+0019761001T152330.1+00:00",
        "+0019761001T152330.1+0000",
        "1976-10-01T15:23:00",
        "1976-10-01T15:23",
        "1976-10-01T15",
        "1976-10-01",
        "--10-01",
        "--1001",
        "-999999-10-01",
        "-999999-10-01[u-ca=iso8601]",
        "+999999-10-01",
        "+999999-10-01[u-ca=iso8601]",
      ];
    },

    /*
     * PlainTime strings that may be mistaken for PlainMonthDay or
     * PlainYearMonth strings, and so require a time designator.
     */
    plainTimeStringsAmbiguous() {
      const ambiguousStrings = [
        "2021-12",  // ambiguity between YYYY-MM and HHMM-UU
        "2021-12[-12:00]",  // ditto, TZ does not disambiguate
        "1214",     // ambiguity between MMDD and HHMM
        "0229",     //   ditto, including MMDD that doesn't occur every year
        "1130",     //   ditto, including DD that doesn't occur in every month
        "12-14",    // ambiguity between MM-DD and HH-UU
        "12-14[-14:00]",  // ditto, TZ does not disambiguate
        "202112",   // ambiguity between YYYYMM and HHMMSS
        "202112[UTC]",  // ditto, TZ does not disambiguate
      ];
      // Adding a calendar annotation to one of these strings must not cause
      // disambiguation in favour of time.
      const stringsWithCalendar = ambiguousStrings.map((s) => s + '[u-ca=iso8601]');
      return ambiguousStrings.concat(stringsWithCalendar);
    },

    /*
     * PlainTime strings that are of similar form to PlainMonthDay and
     * PlainYearMonth strings, but are not ambiguous due to components that
     * aren't valid as months or days.
     */
    plainTimeStringsUnambiguous() {
      return [
        "2021-13",          // 13 is not a month
        "202113",           //   ditto
        "2021-13[-13:00]",  //   ditto
        "202113[-13:00]",   //   ditto
        "0000-00",          // 0 is not a month
        "000000",           //   ditto
        "0000-00[UTC]",     //   ditto
        "000000[UTC]",      //   ditto
        "1314",             // 13 is not a month
        "13-14",            //   ditto
        "1232",             // 32 is not a day
        "0230",             // 30 is not a day in February
        "0631",             // 31 is not a day in June
        "0000",             // 0 is neither a month nor a day
        "00-00",            //   ditto
      ];
    },

    /*
     * PlainYearMonth-like strings that are not valid.
     */
    plainYearMonthStringsInvalid() {
      return [
        "2020-13",
        "1976-11[u-ca=gregory]",
        "1976-11[u-ca=hebrew]",
        "1976-11[U-CA=iso8601]",
        "1976-11[u-CA=iso8601]",
        "1976-11[FOO=bar]",
        "+999999-01",
        "-999999-01",
      ];
    },

    /*
     * PlainYearMonth-like strings that are valid and should produce November
     * 1976 in the ISO 8601 calendar.
     */
    plainYearMonthStringsValid() {
      return [
        "1976-11",
        "1976-11-10",
        "1976-11-01T09:00:00+00:00",
        "1976-11-01T00:00:00+05:00",
        "197611",
        "+00197611",
        "1976-11-18T15:23:30.1-02:00",
        "1976-11-18T152330.1+00:00",
        "19761118T15:23:30.1+00:00",
        "1976-11-18T15:23:30.1+0000",
        "1976-11-18T152330.1+0000",
        "19761118T15:23:30.1+0000",
        "19761118T152330.1+00:00",
        "19761118T152330.1+0000",
        "+001976-11-18T152330.1+00:00",
        "+0019761118T15:23:30.1+00:00",
        "+001976-11-18T15:23:30.1+0000",
        "+001976-11-18T152330.1+0000",
        "+0019761118T15:23:30.1+0000",
        "+0019761118T152330.1+00:00",
        "+0019761118T152330.1+0000",
        "1976-11-18T15:23",
        "1976-11-18T15",
        "1976-11-18",
      ];
    },

    /*
     * PlainYearMonth-like strings that are valid and should produce November of
     * the ISO year -9999.
     */
    plainYearMonthStringsValidNegativeYear() {
      return [
        "-009999-11",
      ];
    },
  }
};
