import type {} from './porffor.d.ts';

export const __Math_hypot = (...args: any[]): number => {
  const len: i32 = args.length;
  let out: number = 0;

  for (let i: i32 = 0; i < len; i++) {
    const n: number = ecma262.ToNumber(args[i]);
    Porffor.c`out = hypot(out, n);`;
  }

  return out;
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
      // put it directly into the large superaccumulator
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

  return sum;
};

export const __Math_max = (...args: any[]): number => {
  let max: number = -Infinity;
  let sawNaN: boolean = false;
  const len: i32 = args.length;

  for (let i: i32 = 0; i < len; i++) {
    const n: number = __ecma262_ToNumber(args[i]);
    if (Number.isNaN(n)) {
      sawNaN = true;
      continue;
    }

    if (n > max) {
      max = n;
      continue;
    }

    if (n == 0 && max == 0 && 1 / n > 1 / max) {
      max = n;
    }
  }

  if (sawNaN) return NaN;
  return max;
};

export const __Math_min = (...args: any[]): number => {
  let min: number = Infinity;
  let sawNaN: boolean = false;
  const len: i32 = args.length;

  for (let i: i32 = 0; i < len; i++) {
    const n: number = __ecma262_ToNumber(args[i]);
    if (Number.isNaN(n)) {
      sawNaN = true;
      continue;
    }

    if (n < min) {
      min = n;
      continue;
    }

    if (n == 0 && min == 0 && 1 / n < 1 / min) {
      min = n;
    }
  }

  if (sawNaN) return NaN;
  return min;
};
