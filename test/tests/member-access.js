const assertSameValue = (actual, expected) => {
  if (!Object.is(actual, expected)) throw `Expected ${expected}, got ${actual}`;
};

const o = { a: 1 };
assertSameValue(o.a, 1);
assertSameValue(o['a'], 1);

class C { constructor() { this.x = 2; } }
const c = new C();
assertSameValue(c.x, 2);
assertSameValue(c['x'], 2);
