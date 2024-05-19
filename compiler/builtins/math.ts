// todo: use any and Number(x) in all these later
// todo/perf: make i32 variants later
// todo/perf: add a compiler pref for accuracy vs perf (epsilion?)

export const __Math_exp = (x: number): number => {
  if (!Number.isFinite(x)) {
    if (x == -Infinity) return 0;
    return x;
  }

  const k: number = Math.floor(x / Math.LN2);
  const r: number = x - k * Math.LN2;

  // Horner's method
  let term: number = r;
  let sum: number = 1 + r;
  let i: number = 2;

  while (Math.abs(term) > 1e-15) {
    term *= r / i;
    sum += term;
    i++;
  }

  return sum * (1 << k);
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

  // guess using log knowledge
  let x: number = y > 1 ? Math.log2(y) : 0;

  // refine with Newton-Raphson method
  let delta: number;
  do {
    const e_x: number = Math.exp(x);
    delta = (e_x - y) / e_x;
    x -= delta;
  } while (Math.abs(delta) > 1e-15);

  return x;
};

export const __Math_log10 = (x: number): number => {
  if (x <= 0) {
    if (x == 0) return -Infinity;
    return NaN;
  }
  if (!Number.isFinite(x)) return x;

  return Math.log(x) / Math.LN10;
};

// todo: hangs with Math.pow(1e-15, NaN)
export const __Math_pow = (base: number, exponent: number): number => Math.exp(exponent * Math.log(base));


export const __Math_expm1 = (x: number): number => {
  if (!Number.isFinite(x)) {
    if (x == -Infinity) return -1;
    return x;
  }

  // use exp(x) - 1 for large x (perf)
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
  if (x == -1) return -Infinity; // log(0) = -inf
  if (!Number.isFinite(x)) return x;

  // use exp(x) - 1 for large x (perf)
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
    if (y == 0) return 0;
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
  if (y == 0) return 0; // cbrt(0) = 0

  // Babylonian method
  let x = Math.abs(y);

  let prev: number;

  do {
    prev = x;
    x = (2 * x + y / (x * x)) / 3;
  } while (Math.abs(prev - x) > 1e-15);

  return y < 0 ? -x : x;
};


// todo: varargs
export const __Math_hypot = (x: number, y: number): number => Math.sqrt(x * x + y * y);

export const __Math_sin = (x: number): number => {
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

export const __Math_cos = (x: number): number => Math.sin(x - Math.PI / 2);
export const __Math_tan = (x: number): number => Math.sin(x) / Math.cos(x);

export const __Math_sinh = (x: number): number => (Math.exp(x) - Math.exp(-x)) / 2;
export const __Math_cosh = (x: number): number => (Math.exp(x) + Math.exp(-x)) / 2;
export const __Math_tanh = (x: number): number => Math.sinh(x) / Math.cosh(x);


export const __Math_asinh = (x: number): number => Math.log(x + Math.sqrt(x * x + 1));
export const __Math_acosh = (x: number): number => {
  if (x < 1) return NaN;
  return Math.log(x + Math.sqrt(x * x - 1));
};
export const __Math_atanh = (x: number): number => {
  if (Math.abs(x) >= 1) return NaN;
  return 0.5 * Math.log((1 + x) / (1 - x));
};


export const __Math_asin = (x: number): number => {
  if (x <= -1) return -Math.PI / 2;
  if (x >= 1) return Math.PI / 2;

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
  if (x == Infinity) return Math.PI / 2
  if (x == -Infinity) return -Math.PI / 2;

  // Taylor series
  let sum: number = x;
  let term: number = x;
  let n: number = 1;

  while (Math.abs(term) > 1e-15) {
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

    return NaN;
  }

  const ratio = y / x;
  if (x > 0) {
    return Math.atan(ratio);
  }

  if (y >= 0) return Math.atan(ratio) + Math.PI;
  return Math.atan(ratio) - Math.PI;
};