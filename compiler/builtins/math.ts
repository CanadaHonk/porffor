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

export const __Math_sumPrecise = (values: any): number => {
  // exact summation into non-overlapping partials (Shewchuk), after the proposal polyfill
  // https://github.com/tc39/proposal-math-sum/blob/main/polyfill/polyfill.mjs
  const partials: any[] = Porffor.array.new(4);
  let overflow: number = 0; // in units of 2^1024

  // 0: minus zero, 1: finite, 2: +Infinity, 3: -Infinity, 4: NaN
  let state: i32 = 0;
  for (const v of values) {
    if (Porffor.type(v) != Porffor.TYPES.number) throw new TypeError('Math.sumPrecise must have only numbers in values');

    let x: number = v;
    if (x != x) state = 4;
      else if (x == Infinity) {
        if (state == 3) state = 4;
          else if (state != 4) state = 2;
      } else if (x == -Infinity) {
        if (state == 2) state = 4;
          else if (state != 4) state = 3;
      }
    if (Porffor.fastOr(state >= 2, x == 0 && 1 / x < 0)) continue;
    state = 1;

    let used: i32 = 0;
    for (let i: i32 = 0; i < partials.length; i++) {
      let y: number = partials[i];
      if (Math.abs(x) < Math.abs(y)) {
        const t: number = x;
        x = y;
        y = t;
      }

      let hi: number = x + y;
      let lo: number = y - (hi - x);
      if (Math.abs(hi) == Infinity) {
        let sign: number = 1;
        if (hi < 0) sign = -1;
        overflow += sign;

        x = (x - sign * 2 ** 1023) - sign * 2 ** 1023;
        if (Math.abs(x) < Math.abs(y)) {
          const t: number = x;
          x = y;
          y = t;
        }
        hi = x + y;
        lo = y - (hi - x);
      }

      if (lo != 0) partials[used++] = lo;
      x = hi;
    }

    partials.length = used;
    if (x != 0) Porffor.array.fastPush(partials, x);
  }

  if (state == 0) return -0;
  if (state == 2) return Infinity;
  if (state == 3) return -Infinity;
  if (state == 4) return NaN;

  // exact sum of the partials from the largest, until precision is lost
  let n: i32 = partials.length - 1;
  let hi: number = 0;
  let lo: number = 0;
  if (overflow != 0) {
    let next: number = 0;
    if (n >= 0) next = partials[n];
    n--;
    if (Porffor.fastOr(Math.abs(overflow) > 1, overflow > 0 && next > 0, overflow < 0 && next < 0)) {
      if (overflow > 0) return Infinity;
      return -Infinity;
    }

    // halved so it does not overflow
    hi = overflow * 2 ** 1023 + next / 2;
    lo = (next / 2 - (hi - overflow * 2 ** 1023)) * 2;
    if (Math.abs(2 * hi) == Infinity) {
      // half an ulp below 2^1024 rounds to MAX_VALUE only if the next partial pulls it down
      if (hi > 0) {
        if (hi == 2 ** 1023 && lo == -(2 ** 970) && n >= 0 && partials[n] < 0) return Number.MAX_VALUE;
        return Infinity;
      }
      if (hi == -(2 ** 1023) && lo == 2 ** 970 && n >= 0 && partials[n] > 0) return -Number.MAX_VALUE;
      return -Infinity;
    }

    if (lo != 0) {
      partials[++n] = lo;
      lo = 0;
    }
    hi *= 2;
  }

  while (n >= 0) {
    const x: number = hi;
    const y: number = partials[n--];
    hi = x + y;
    lo = y - (hi - x);
    if (lo != 0) break;
  }

  // a roundoff of exactly half an ulp rounds towards the next partial
  if (n >= 0 && ((lo < 0 && partials[n] < 0) || (lo > 0 && partials[n] > 0))) {
    const y: number = lo * 2;
    const x: number = hi + y;
    if (y == x - hi) hi = x;
  }

  return hi;
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
