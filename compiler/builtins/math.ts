import type {} from './porffor.d.ts';

// todo: use any and Number(x) in all these later
// todo: specify the rest of this file later
// todo/perf: make i32 variants later
// todo/perf: add a compiler pref for accuracy vs perf (epsilion?)

export const __Math_exp = (x: number): number => {
  if (!Number.isFinite(x)) {
    if (x == -Infinity) return 0;
    return x;
  }

  if (x < 0) {
    // exp(-x) = 1 / exp(+x)
    return 1 / Math.exp(-x);
  }

  let k: number = Math.floor(x / Math.LN2);
  const r: number = x - k * Math.LN2;

  // Taylor series via Horner's method
  let term: number = r;
  let sum: number = 1 + r;
  let i: number = 2;

  while (Math.abs(term) > 1e-15) {
    term *= r / i;
    sum += term;
    i++;
  }

  while (k-- > 0) {
    sum *= 2;
  }

  return sum;
};

export const __Math_log2 = (y: number): number => {
  if (y <= 0) return NaN;
  if (!Number.isFinite(y)) return y;

  // approx using log knowledge
  let x: number = y;
  let exponent: number = 0;

  while (x >= 2) {
    x /= 2;
    exponent++;
  }

  while (x < 1) {
    x *= 2;
    exponent--;
  }

  // 1 <= x < 2 -> 0 <= x < 1
  x -= 1;

  // refine with Newton-Raphson method
  let delta: number;
  do {
    const e_x: number = Math.exp(x * Math.LN2);
    delta = (e_x - y) / (e_x * Math.LN2);
    x -= delta;
  } while (Math.abs(delta) > 1e-15);

  return x + exponent;
};

export const __Math_log = (y: number): number => {
  if (y <= 0) {
    if (y == 0) return -Infinity;
    return NaN;
  }
  if (!Number.isFinite(y)) return y;

  // very large numbers
  if (y > 1e308) {
    const n = Math.floor(Math.log2(y));
    return Math.LN2 * n + Math.log(y / (1 << 30) / (1 << (n - 30)));
  }

  let m = 0;
  while (y >= 2) {
    y /= 2;
    m++;
  }
  while (y < 1) {
    y *= 2;
    m--;
  }

  y--;  // 1 <= y < 2 -> 0 <= y < 1

  // more accurate series expansion
  let x = y / (2 + y);
  const x2 = x * x;
  let sum = x;
  let term = x;
  let i = 1;

  while (Math.abs(term) > 1e-15) {
    term *= x2 * (2 * i - 1) / (2 * i + 1);
    sum += term;
    i++;
  }

  return 2 * sum + m * Math.LN2;
};

export const __Math_log10 = (x: number): number => {
  if (x <= 0) {
    if (x == 0) return -Infinity;
    return NaN;
  }
  if (!Number.isFinite(x)) return x;

  return Math.log(x) / Math.LN10;
};

// 21.3.2.26 Math.pow (base, exponent)
// https://tc39.es/ecma262/#sec-math.pow
export const __Math_pow = (base: number, exponent: number): number => {
  // 1. Set base to ? ToNumber(base).
  // 2. Set exponent to ? ToNumber(exponent).
  // todo

  // 3. Return Number::exponentiate(base, exponent).

  // Number::exponentiate (base, exponent)
  // https://tc39.es/ecma262/#sec-numeric-types-number-exponentiate
  // 1. If exponent is NaN, return NaN.
  if (Number.isNaN(exponent)) return NaN;

  // 2. If exponent is either +0𝔽 or -0𝔽, return 1𝔽.
  if (exponent == 0) return 1;

  // opt: use bit shift for base 2
  if (base == 2) {
    if (Porffor.fastAnd(Number.isInteger(exponent), exponent > 0, exponent < 31)) return 2 << (exponent - 1);
  }

  if (!Number.isFinite(base)) {
    // 3. If base is NaN, return NaN.
    if (Number.isNaN(base)) return base;

    // 4. If base is +∞𝔽, then
    if (base == Infinity) {
      // a. If exponent > +0𝔽, return +∞𝔽. Otherwise, return +0𝔽.
      if (exponent > 0) return base;
      return 0;
    }

    // 5. If base is -∞𝔽, then
    const isOdd = Math.abs(exponent) % 2 == 1;

    // a. If exponent > +0𝔽, then
    if (exponent > 0) {
      // i. If exponent is an odd integral Number, return -∞𝔽. Otherwise, return +∞𝔽.
      if (isOdd) return -Infinity;
      return Infinity;
    }

    // b. Else,
    // i. If exponent is an odd integral Number, return -0𝔽. Otherwise, return +0𝔽.
    if (isOdd) return -0;
    return 0;
  }

  if (base == 0) {
    // 6. If base is +0𝔽, then
    if (1 / base == Infinity) {
      // a. If exponent > +0𝔽, return +0𝔽. Otherwise, return +∞𝔽.
      if (exponent > 0) return 0;
      return Infinity;
    }

    // 7. If base is -0𝔽, then
    const isOdd = Math.abs(exponent) % 2 == 1;

    // a. If exponent > +0𝔽, then
    if (exponent > 0) {
      // i. If exponent is an odd integral Number, return -0𝔽. Otherwise, return +0𝔽.
      if (isOdd) return -0;
      return 0;
    }

    // b. Else,
    // i. If exponent is an odd integral Number, return -∞𝔽. Otherwise, return +∞𝔽.
    if (isOdd) return -Infinity;
    return Infinity;
  }

  // 8. Assert: base is finite and is neither +0𝔽 nor -0𝔽.
  // todo

  // 9. If exponent is +∞𝔽, then
  if (exponent == Infinity) {
    const abs = Math.abs(base);

    // a. If abs(ℝ(base)) > 1, return +∞𝔽.
    if (abs > 1) return Infinity;

    // b. If abs(ℝ(base)) = 1, return NaN.
    if (abs == 1) return NaN;

    // c. If abs(ℝ(base)) < 1, return +0𝔽.
    return 0;
  }

  // 10. If exponent is -∞𝔽, then
  if (exponent == -Infinity) {
    const abs = Math.abs(base);

    // a. If abs(ℝ(base)) > 1, return +0𝔽.
    if (abs > 1) return 0;

    // b. If abs(ℝ(base)) = 1, return NaN.
    if (abs == 1) return NaN;

    // c. If abs(ℝ(base)) < 1, return +∞𝔽.
    return Infinity;
  }

  // 11. Assert: exponent is finite and is neither +0𝔽 nor -0𝔽.
  // todo

  // 12. If base < -0𝔽 and exponent is not an integral Number, return NaN.
  if (base < 0) if (!Number.isInteger(exponent)) return NaN;

  // 13. Return an implementation-approximated Number value representing the result of raising ℝ(base) to the ℝ(exponent) power.
  if (base == Math.E) {
    return Math.exp(exponent);
  }

  let currentBase: number = base;
  let currentExponent: number = Math.abs(exponent);

  let result: number = 1;
  while (currentExponent > 0) {
    if (currentExponent >= 1) {
      if (currentExponent & 1) {
        result *= currentBase;
      }

      currentBase *= currentBase;
      currentExponent = Math.trunc(currentExponent / 2);
    } else {
      // Handle fractional part
      result *= Math.exp(currentExponent * Math.log(Math.abs(currentBase)));
      break;
    }
  }

  return exponent < 0 ? 1 / result : result;
};


export const __Math_expm1 = (x: number): number => {
  if (!Number.isFinite(x)) {
    if (x == -Infinity) return -1;
    return x;
  }

  // opt: use exp(x) - 1 for large x
  if (Math.abs(x) > 1e-5) return Math.exp(x) - 1;

  // Taylor series
  let sum: number = x;
  let term: number = x;
  let i: number = 2;

  while (Math.abs(term) > 1e-15) {
    term *= x / i;
    sum += term;
    i++;
  }

  return sum;
};

export const __Math_log1p = (x: number): number => {
  // log1p(0) = 0 (preserve sign)
  if (x == 0) return x;
  if (x == -1) return -Infinity; // log(0) = -inf
  if (x < -1) return NaN; // log of negative is NaN
  if (!Number.isFinite(x)) return x;

  // opt: use exp(x) - 1 for large x
  if (Math.abs(x) > 1e-5) return Math.log(1 + x);

  // Taylor series
  let sum: number = 0;
  let term: number = x;
  let i: number = 2;

  while (Math.abs(term) > 1e-15) {
    term *= -x / i;
    sum += term;
    i++;
  }

  return sum;
};


export const __Math_sqrt = (y: number): number => {
  if (y <= 0) {
    if (y == 0) return y; // sqrt(0) = 0 (preserve sign)
    return NaN;
  }
  if (!Number.isFinite(y)) return y;

  // Babylonian method
  let x: number = y;
  let prev: number;

  do {
    prev = x;
    x = 0.5 * (x + y / x);
  } while (Math.abs(prev - x) > 1e-15);

  return x;
};

export const __Math_cbrt = (y: number): number => {
  if (y == 0) return y; // cbrt(0) = 0 (preserves sign)
  if (!Number.isFinite(y)) return y;

  // Babylonian method
  let x:number = Math.abs(y);

  let prev: number;

  do {
    prev = x;
    x = (2 * x + y / (x * x)) / 3;
  } while (Math.abs(prev - x) > 1e-15);

  return y < 0 ? -x : x;
};


// todo: varargs
export const __Math_hypot = (x: number, y: number): number => {
  // If any argument is ±Infinity, return +Infinity (even if other args are NaN)
  if (x == Infinity || x == -Infinity || y == Infinity || y == -Infinity) return Infinity;
  return Math.sqrt(x * x + y * y);
};

export const __Math_sin = (x: number): number => {
  // sin(0) = 0 (preserve sign)
  if (x == 0) return x;

  // -inf <= x <= inf -> 0 <= x <= 2pi
  const piX2: number = Math.PI * 2;
  x %= piX2;
  if (x < 0) x += piX2;

  const x2: number = x * x;

  return x * (
    1 + x2 * (
      -1.66666666666666307295e-1 + x2 * (
        8.33333333332211858878e-3 + x2 * (
          -1.98412698295895385996e-4 + x2 * (
            2.75573136213857245213e-6 + x2 * (
              -2.50507477628578072866e-8 + x2 * (
                1.58962301576546568060e-10
              )
            )
          )
        )
      )
    )
  );

  // todo: investigate which is better (consider perf and accuracy)
  // const x2 = x * x;
  // const x4 = x2 * x2;
  // const x6 = x4 * x2;
  // const x8 = x4 * x4;
  // const x10 = x6 * x4;
  // const x12 = x6 * x6;
  // const x14 = x12 * x2;

  // return x * (
  //   1 - x2 / 6 + x4 / 120 - x6 / 5040 + x8 / 362880 - x10 / 39916800 + x12 / 6227020800 - x14 / 1307674368000
  // );
};

export const __Math_cos = (x: number): number => {
  if (x == 0) return 1;
  return Math.sin(x + Math.PI / 2);
};
export const __Math_tan = (x: number): number => {
  // tan(0) = 0 (preserve sign)
  if (x == 0) return x;
  return Math.sin(x) / Math.cos(x);
};

export const __Math_sinh = (x: number): number => {
  // sinh(0) = 0 (preserve sign)
  if (x == 0) return x;
  return (Math.exp(x) - Math.exp(-x)) / 2;
};
export const __Math_cosh = (x: number): number => (Math.exp(x) + Math.exp(-x)) / 2;
export const __Math_tanh = (x: number): number => {
  // tanh(0) = 0 (preserve sign)
  if (x == 0) return x;
  if (x == Infinity) return 1;
  if (x == -Infinity) return -1;
  return Math.sinh(x) / Math.cosh(x);
};


export const __Math_asinh = (x: number): number => {
  // asinh(0) = 0 (preserve sign)
  if (x == 0) return x;
  if (!Number.isFinite(x)) return x;
  return Math.log(x + Math.sqrt(x * x + 1));
};
export const __Math_acosh = (x: number): number => {
  if (x < 1) return NaN;
  return Math.log(x + Math.sqrt(x * x - 1));
};
export const __Math_atanh = (x: number): number => {
  // atanh(0) = 0 (preserve sign)
  if (x == 0) return x;
  if (x == 1) return Infinity;
  if (x == -1) return -Infinity;
  if (Math.abs(x) > 1) return NaN;
  return 0.5 * Math.log((1 + x) / (1 - x));
};


export const __Math_asin = (x: number): number => {
  if (x <= -1) {
    if (x == -1) return -Math.PI / 2;
    return NaN;
  }
  if (x >= 1) {
    if (x == 1) return Math.PI / 2;
    return NaN;
  }

  // Taylor series
  let sum: number = x;
  let term: number = x;
  let n: number = 1;

  while (Math.abs(term) > 1e-15) {
    term *= x * x * (2 * n - 1) * (2 * n - 1) / ((2 * n) * (2 * n + 1));
    sum += term / (2 * n + 1);
    n++;
  }

  return sum;
};

export const __Math_acos = (x: number): number => Math.PI / 2 - Math.asin(x);

export const __Math_atan = (x: number): number => {
  if (x == Infinity) return Math.PI / 2;
  if (x == -Infinity) return -Math.PI / 2;
  if (x == 0) return x;

  // atan(x) = π/2 - atan(1/x) for |x| > 1
  if (Math.abs(x) > 1) {
    const sign = x > 0 ? 1 : -1;
    return sign * (Math.PI / 2 - __Math_atan(1 / Math.abs(x)));
  }

  // taylor series for |x| <= 1
  let sum: number = x;
  let term: number = x;
  let n: number = 1;
  const maxIterations: number = 1000;

  while (Math.abs(term) > 1e-15 && n < maxIterations) {
    term *= -x * x * (2 * n - 1) / ((2 * n) * (2 * n + 1));
    sum += term;
    n++;
  }

  return sum;
};

export const __Math_atan2 = (y: number, x: number): number => {
  if (x == 0) {
    if (y > 0) return Math.PI / 2;
    if (y < 0) return -Math.PI / 2;
    if (y == 0) return y;
    return NaN;
  }

  const ratio = y / x;
  if (x > 0) {
    return Math.atan(ratio);
  }

  if (y >= 0) return Math.atan(ratio) + Math.PI;
  return Math.atan(ratio) - Math.PI;
};

export const __Math_sumPrecise = (values: any[]): number => {
  // based on "Fast exact summation using small and large superaccumulators" by Radford M. Neal
  // https://arxiv.org/abs/1505.05571
  // accuracy is top priority, it is fine for this to be slow(er)

  // small superaccumulator uses 67 chunks: (1 << (11 - 5)) + 3
  //   11 is the number of exponent bits in IEEE-754 double precision
  //   5 is the number of low-order exponent bits stored per chunk
  const SMALL_SLOTS: number = 67;
  const SMALL_MIN: number = -970;
  const small: Float64Array = new Float64Array(SMALL_SLOTS);

  // large superaccumulator uses 4096 chunks: 1 << (11 + 1)
  //   11 is the number of exponent bits in IEEE-754 double precision
  const LARGE_SLOTS: number = 4096;
  const LARGE_MIN: number = -1074;
  const large: Float64Array = new Float64Array(LARGE_SLOTS);

  for (const _ of values) {
    if (Porffor.type(_) != Porffor.TYPES.number) throw new TypeError('Math.sumPrecise must have only numbers in values');

    const v: number = _;
    if (v == 0) continue;

    const exp: number = Porffor.number.getExponent(v);

    // check if value fits in small superaccumulator
    if (exp >= SMALL_MIN && exp < SMALL_MIN + SMALL_SLOTS) {
      // map the exponent to an array index (-970 -> 0, -969 -> 1, etc)
      const slot: number = exp - SMALL_MIN;
      let y: number = v;

      // cascade up through slots, similar to carrying digits in decimal
      // but operating in binary and handling floating point carefully
      for (let i: number = slot; i < SMALL_SLOTS - 1; i++) {
        const sum: number = small[i] + y;
        y = sum;

        // a number fits in slot i if its magnitude is less than 2^(i+SMALL_MIN+1)
        const slotLimit: number = Math.pow(2, i + SMALL_MIN + 1);
        if (y >= -slotLimit && y < slotLimit) {
          small[i] = y;
          y = 0;
          break;
        }

        // doesn't fit, clear this slot and continue cascading
        small[i] = 0;
      }

      // if we still have a non-zero value after cascading through small,
      // it needs to go into the large superaccumulator
      if (y != 0) {
        large[Porffor.number.getExponent(y) - LARGE_MIN] += y;
      }
    } else {
      // exponent is outside small superaccumulator range,
      // put it directly in the large superaccumulator
      large[Porffor.number.getExponent(v) - LARGE_MIN] += v;
    }
  }

  // combine results from both superaccumulators,
  // process from highest to lowest to maintain precision
  // todo: handle -0 (see test262 test)
  let sum: number = -0;
  for (let i: number = LARGE_SLOTS - 1; i >= 0; i--) {
    sum += large[i];
  }

  for (let i: number = SMALL_SLOTS - 1; i >= 0; i--) {
    sum += small[i];
  }

  // todo: free large and small

  return sum;
};