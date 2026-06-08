const assertSameValue = (actual, expected) => {
  if (!Object.is(actual, expected)) throw `Expected ${expected}, got ${actual}`;
};

assertSameValue(-1 >>> 0, 4294967295);
assertSameValue(-1 >>> 1, 2147483647);
assertSameValue(-1 >>> 28, 15);
assertSameValue(-1 >>> 31, 1);
assertSameValue(-2 >>> 0, 4294967294);
assertSameValue(-2 >>> 1, 2147483647);
assertSameValue(-8 >>> 1, 2147483644);
assertSameValue(-256 >>> 4, 268435440);
assertSameValue(-1000000 >>> 3, 536745912);
assertSameValue((0x80000000 | 0) >>> 31, 1);
assertSameValue((0x80000000 | 0) >>> 0, 2147483648);
assertSameValue(123 >>> 0, 123);
assertSameValue(-16 >> 2, -4);
assertSameValue(-1 >> 0, -1);
