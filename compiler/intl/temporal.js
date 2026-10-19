import { calendarData, tzData } from './temporal-data.js';

export default String.raw`
const T$slots = new WeakMap();
// shared with the intl polyfill when both are included
var $IntlHooks$;
const T$B_INSTANT = 1, T$B_ZDT = 2, T$B_DATE = 3, T$B_DATETIME = 4, T$B_TIME = 5, T$B_YM = 6, T$B_MD = 7, T$B_DURATION = 8;

const T$get = (o, brand, name) => {
  const s = (typeof o === 'object' && o !== null) ? T$slots.get(o) : undefined;
  if (s === undefined || s.brand !== brand) throw new TypeError(name + ': invalid receiver');
  return s;
};
const T$slotsOf = o => (typeof o === 'object' && o !== null) ? T$slots.get(o) : undefined;
const T$isObject = x => (typeof x === 'object' && x !== null) || typeof x === 'function';

const T$toNumber = x => {
  if (typeof x === 'number') return x;
  if (x === undefined) return NaN;
  if (typeof x === 'symbol' || typeof x === 'bigint') throw new TypeError('cannot convert to number');
  if (T$isObject(x)) x = T$toPrimitive(x, 'number');
  if (typeof x === 'symbol' || typeof x === 'bigint') throw new TypeError('cannot convert to number');
  return Number(x);
};
const T$toString = x => {
  if (typeof x === 'string') return x;
  if (typeof x === 'symbol') throw new TypeError('cannot convert symbol to string');
  if (T$isObject(x)) x = T$toPrimitive(x, 'string');
  if (typeof x === 'symbol') throw new TypeError('cannot convert symbol to string');
  return String(x);
};
const T$toPrimitive = (x, hint) => {
  if (!T$isObject(x)) return x;
  const exotic = x[Symbol.toPrimitive];
  if (exotic !== undefined && exotic !== null) {
    if (typeof exotic !== 'function') throw new TypeError('@@toPrimitive is not callable');
    const r = exotic.call(x, hint);
    if (T$isObject(r)) throw new TypeError('cannot convert object to primitive');
    return r;
  }
  const order = hint === 'string' ? [ 'toString', 'valueOf' ] : [ 'valueOf', 'toString' ];
  for (let i = 0; i < 2; i++) {
    const f = x[order[i]];
    if (typeof f === 'function') {
      const r = f.call(x);
      if (!T$isObject(r)) return r;
    }
  }
  throw new TypeError('cannot convert object to primitive');
};
const T$toIntegerWithTruncation = x => {
  const n = T$toNumber(x);
  if (n !== n || n === Infinity || n === -Infinity) throw new RangeError('value must be finite');
  return Math.trunc(n) + 0;
};
const T$toPositiveIntegerWithTruncation = x => {
  const n = T$toIntegerWithTruncation(x);
  if (n <= 0) throw new RangeError('value must be positive');
  return n;
};
const T$toIntegerIfIntegral = x => {
  const n = T$toNumber(x);
  if (n !== n || n === Infinity || n === -Infinity || Math.trunc(n) !== n) throw new RangeError('value must be an integer');
  return n + 0;
};
const T$toBigIntEpoch = x => {
  let p = T$isObject(x) ? T$toPrimitive(x, 'number') : x;
  if (typeof p === 'boolean') p = p ? 1n : 0n;
  else if (typeof p === 'string') p = BigInt(p);
  else if (typeof p !== 'bigint') throw new TypeError('cannot convert to BigInt');
  return T$bigintToTd(p);
};

// td: { sec, ns } with integer sec and 0 <= ns < 1e9
const T$td = (sec, ns) => {
  if (ns < 0 || ns >= 1e9) {
    const r = T$fmod(ns, 1e9);
    sec += (ns - r) / 1e9;
    ns = r;
  }
  return { sec: sec + 0, ns: ns + 0 };
};
const T$TD_ZERO = { sec: 0, ns: 0 };
const T$tdAdd = (a, b) => {
  // carry folded into the smaller operand first so the only rounding is in the final sum
  let ns = a.ns + b.ns, c = 0;
  if (ns >= 1e9) {
    ns -= 1e9;
    c = 1;
  }
  return { sec: a.sec + (b.sec + c), ns };
};
const T$tdNeg = a => a.ns === 0 ? { sec: 0 - a.sec, ns: 0 } : { sec: -a.sec - 1, ns: 1e9 - a.ns };
const T$tdSub = (a, b) => T$tdAdd(a, T$tdNeg(b));
const T$tdSign = a => a.sec < 0 ? -1 : (a.sec === 0 && a.ns === 0 ? 0 : 1);
const T$tdCmp = (a, b) => {
  if (a.sec !== b.sec) return a.sec < b.sec ? -1 : 1;
  if (a.ns !== b.ns) return a.ns < b.ns ? -1 : 1;
  return 0;
};
const T$tdAbs = a => T$tdSign(a) < 0 ? T$tdNeg(a) : a;
const T$fmod = (x, d) => {
  const r = x % d;
  return r < 0 ? r + d : r + 0;
};
// unitNs <= 1e9, x may exceed 2^53
const T$numToTd = (x, unitNs) => {
  let e = 0;
  while (x >= 9007199254740992 || x <= -9007199254740992) {
    x /= 2;
    e++;
    if (e > 80) return { sec: x * Math.pow(2, e) * unitNs / 1e9, ns: 0 };
  }
  const per = 1e9 / unitNs;
  const r = T$fmod(x, per);
  let t = T$td((x - r) / per, r * unitNs);
  while (e-- > 0) t = T$tdAdd(t, t);
  return t;
};
const T$tdFromComponents = (h, mi, s, ms, us, ns) => {
  // sub-second parts are combined before adding to the large part to avoid rounding near 2^53
  const sub = T$tdAdd(T$tdAdd(T$numToTd(ms, 1e6), T$numToTd(us, 1e3)), T$numToTd(ns, 1));
  return { sec: h * 3600 + mi * 60 + s + sub.sec, ns: sub.ns };
};
const T$tdAddDays = (td, days) => T$td(td.sec + days * 86400, td.ns);
const T$MAX_TD_SEC = 9007199254740992;
const T$tdValid = td => td.sec < T$MAX_TD_SEC && (td.sec > -T$MAX_TD_SEC || (td.sec === -T$MAX_TD_SEC && td.ns > 0));
const T$tdCheck = td => {
  if (!T$tdValid(td)) throw new RangeError('time duration out of range');
  return td;
};
const T$pad = (n, len) => {
  let s = String(n);
  while (s.length < len) s = '0' + s;
  return s;
};
// exact decimal so Number() rounds correctly
const T$tdToDecimal = (td, unitNs) => {
  let neg = false;
  if (T$tdSign(td) < 0) {
    neg = true;
    td = T$tdNeg(td);
  }
  let intStr, rem, den;
  if (unitNs >= 1e9) {
    const k = unitNs / 1e9;
    const q = Math.floor(td.sec / k);
    intStr = String(q);
    rem = (td.sec - q * k) * 1e9 + td.ns;
    den = unitNs;
  } else {
    const per = 1e9 / unitNs;
    const nq = Math.floor(td.ns / unitNs);
    if (td.sec === 0) intStr = String(nq);
    else intStr = String(td.sec) + T$pad(nq, String(per).length - 1);
    rem = td.ns - nq * unitNs;
    den = unitNs;
  }
  let frac = '';
  for (let i = 0; i < 24 && rem !== 0; i++) {
    rem *= 10;
    const dgt = Math.floor(rem / den);
    frac += String(dgt);
    rem -= dgt * den;
  }
  return (neg ? '-' : '') + intStr + (frac.length > 0 ? '.' + frac : '');
};
const T$tdTotal = (td, unitNs) => Number(T$tdToDecimal(td, unitNs)) + 0;
const T$tdTruncDiv = (td, unitNs) => {
  const s = T$tdToDecimal(td, unitNs);
  const dot = s.indexOf('.');
  return Number(dot < 0 ? s : s.slice(0, dot)) + 0;
};
// inc is whole seconds or divides 2 days
const T$tdModInc = (td, inc) => {
  if (inc.ns === 0) {
    const k = inc.sec;
    return { sec: T$fmod(td.sec, k), ns: td.ns };
  }
  const incN = inc.sec * 1e9 + inc.ns;
  const r = T$fmod(T$fmod(td.sec, 172800) * 1e9 + td.ns, incN);
  return T$td(0, r);
};
const T$tdIsEvenMultiple = (td, inc) => {
  const r2 = T$tdModInc(td, T$tdAdd(inc, inc));
  return T$tdCmp(r2, inc) < 0;
};
const T$unsignedRoundingMode = (mode, negative) => {
  switch (mode) {
    case 'ceil': return negative ? 'zero' : 'infinity';
    case 'floor': return negative ? 'infinity' : 'zero';
    case 'expand': return 'infinity';
    case 'trunc': return 'zero';
    case 'halfCeil': return negative ? 'half-zero' : 'half-infinity';
    case 'halfFloor': return negative ? 'half-infinity' : 'half-zero';
    case 'halfExpand': return 'half-infinity';
    case 'halfTrunc': return 'half-zero';
    case 'halfEven': return 'half-even';
  }
};
const T$applyUnsignedRounding = (umode, cmpHalf, r1Even) => {
  if (umode === 'zero') return false;
  if (umode === 'infinity') return true;
  if (cmpHalf < 0) return false;
  if (cmpHalf > 0) return true;
  if (umode === 'half-zero') return false;
  if (umode === 'half-infinity') return true;
  return !r1Even;
};
const T$tdRoundToIncrement = (td, inc, mode, asIfPositive) => {
  const r = T$tdModInc(td, inc);
  if (T$tdSign(r) === 0) return td;
  const lower = T$tdSub(td, r);
  const upper = T$tdAdd(lower, inc);
  const negative = !asIfPositive && T$tdSign(td) < 0;
  const umode = T$unsignedRoundingMode(mode, negative);
  // for negative td, r1 is upper (closer to zero)
  const twoR = T$tdAdd(r, r);
  let cmpHalf = T$tdCmp(twoR, inc);
  const lowerEven = T$tdIsEvenMultiple(td, inc);
  let away;
  if (!negative) away = T$applyUnsignedRounding(umode, cmpHalf, lowerEven);
  else away = T$applyUnsignedRounding(umode, -cmpHalf, !lowerEven);
  if (!negative) return away ? upper : lower;
  return away ? lower : upper;
};
// exact for integer x with |x| < 2^53
const T$roundNumberToIncrement = (x, inc, mode) => {
  const r = T$fmod(x, inc);
  if (r === 0) return x;
  const lower = x - r, upper = lower + inc;
  const negative = x < 0;
  const umode = T$unsignedRoundingMode(mode, negative);
  const cmpHalf = 2 * r < inc ? -1 : (2 * r > inc ? 1 : 0);
  const lowerEven = T$fmod(lower / inc, 2) === 0;
  let away;
  if (!negative) away = T$applyUnsignedRounding(umode, cmpHalf, lowerEven);
  else away = T$applyUnsignedRounding(umode, -cmpHalf, !lowerEven);
  if (!negative) return (away ? upper : lower) + 0;
  return (away ? lower : upper) + 0;
};

const T$bigintToTd = b => {
  let s = String(b);
  let neg = false;
  if (s[0] === '-') {
    neg = true;
    s = s.slice(1);
  }
  let sec = 0, ns = 0;
  if (s.length <= 9) ns = Number(s);
  else {
    sec = Number(s.slice(0, s.length - 9));
    ns = Number(s.slice(s.length - 9));
  }
  const td = { sec, ns };
  return neg ? T$tdNeg(td) : td;
};
const T$tdToBigInt = td => {
  let neg = false;
  if (T$tdSign(td) < 0) {
    neg = true;
    td = T$tdNeg(td);
  }
  const s = td.sec === 0 ? String(td.ns) : String(td.sec) + T$pad(td.ns, 9);
  return BigInt((neg ? '-' : '') + s);
};

const T$NS_MAX_SEC = 8640000000000; // 1e8 days in seconds
const T$isValidEpochNs = en => (en.sec < T$NS_MAX_SEC || (en.sec === T$NS_MAX_SEC && en.ns === 0)) && en.sec >= -T$NS_MAX_SEC;
const T$checkEpochNs = en => {
  if (!T$isValidEpochNs(en)) throw new RangeError('epoch nanoseconds out of range');
  return en;
};

const T$isLeapYear = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const T$daysInMonth = (y, m) => {
  if (m === 2) return T$isLeapYear(y) ? 29 : 28;
  if (m === 4 || m === 6 || m === 9 || m === 11) return 30;
  return 31;
};
const T$isValidISODate = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= T$daysInMonth(y, m);
// d may be outside the month
const T$epochDays = (y, m, d) => {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = m > 2 ? m - 3 : m + 9;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
};
const T$epochDaysToDate = z => {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (m <= 2 ? 1 : 0) + 0, month: m, day: d };
};
const T$isoDate = (year, month, day) => ({ year, month, day });
const T$balanceISOYearMonth = (y, m) => {
  const m0 = m - 1;
  return { year: y + Math.floor(m0 / 12), month: T$fmod(m0, 12) + 1 };
};
const T$addDaysToISODate = (date, days) => T$epochDaysToDate(T$epochDays(date.year, date.month, date.day) + days);
const T$compareISODate = (a, b) => {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
};
const T$regulateISODate = (y, m, d, overflow) => {
  if (overflow === 'constrain') {
    m = m < 1 ? 1 : (m > 12 ? 12 : m);
    const dim = T$daysInMonth(y, m);
    d = d < 1 ? 1 : (d > dim ? dim : d);
  } else if (!T$isValidISODate(y, m, d)) throw new RangeError('invalid ISO date');
  return T$isoDate(y, m, d);
};
const T$dayOfWeek = date => {
  // 1 = monday
  const d = T$fmod(T$epochDays(date.year, date.month, date.day) + 3, 7);
  return d + 1;
};
const T$dayOfYear = date => T$epochDays(date.year, date.month, date.day) - T$epochDays(date.year, 1, 1) + 1;
const T$weekOfYear = date => {
  const doy = T$dayOfYear(date);
  const dow = T$dayOfWeek(date);
  let week = Math.floor((doy - dow + 10) / 7);
  let year = date.year;
  if (week < 1) {
    year--;
    week = T$weeksInYear(year);
  } else if (week > T$weeksInYear(year)) {
    week = 1;
    year++;
  }
  return { week, year };
};
const T$weeksInYear = y => {
  const jan1 = T$dayOfWeek(T$isoDate(y, 1, 1));
  if (jan1 === 4 || (jan1 === 3 && T$isLeapYear(y))) return 53;
  return 52;
};

const T$time = (h, mi, s, ms, us, ns) => ({ hour: h, minute: mi, second: s, millisecond: ms, microsecond: us, nanosecond: ns });
const T$MIDNIGHT = T$time(0, 0, 0, 0, 0, 0);
const T$isValidTime = (h, mi, s, ms, us, ns) => h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59 && ms >= 0 && ms <= 999 && us >= 0 && us <= 999 && ns >= 0 && ns <= 999;
const T$clamp = (x, lo, hi) => x < lo ? lo : (x > hi ? hi : x);
const T$regulateTime = (h, mi, s, ms, us, ns, overflow) => {
  if (overflow === 'constrain') {
    return T$time(T$clamp(h, 0, 23), T$clamp(mi, 0, 59), T$clamp(s, 0, 59), T$clamp(ms, 0, 999), T$clamp(us, 0, 999), T$clamp(ns, 0, 999));
  }
  if (!T$isValidTime(h, mi, s, ms, us, ns)) throw new RangeError('invalid time');
  return T$time(h, mi, s, ms, us, ns);
};
const T$timeToTd = t => T$td(t.hour * 3600 + t.minute * 60 + t.second, t.millisecond * 1000000 + t.microsecond * 1000 + t.nanosecond);
const T$tdToTimeOfDay = td => {
  const days = Math.floor(td.sec / 86400);
  let sec = td.sec - days * 86400;
  const h = Math.floor(sec / 3600);
  sec -= h * 3600;
  const mi = Math.floor(sec / 60);
  sec -= mi * 60;
  const ns = td.ns;
  const ms = Math.floor(ns / 1000000);
  const us = Math.floor((ns - ms * 1000000) / 1000);
  const t = T$time(h, mi, sec, ms, us, ns - ms * 1000000 - us * 1000);
  t.days = days;
  return t;
};
const T$addTime = (time, td) => T$tdToTimeOfDay(T$tdAdd(T$timeToTd(time), td));
const T$balanceTime = (h, mi, s, ms, us, ns) => T$tdToTimeOfDay(T$tdFromComponents(h, mi, s, ms, us, ns));
const T$compareTime = (a, b) => T$tdCmp(T$timeToTd(a), T$timeToTd(b));
const T$differenceTime = (a, b) => T$tdSub(T$timeToTd(b), T$timeToTd(a));
const T$dateTime = (date, time) => ({ date, time });
const T$compareISODateTime = (a, b) => {
  const c = T$compareISODate(a.date, b.date);
  if (c !== 0) return c;
  return T$compareTime(a.time, b.time);
};
const T$utcEpochNs = dt => {
  const days = T$epochDays(dt.date.year, dt.date.month, dt.date.day);
  const t = dt.time;
  return T$td(days * 86400 + t.hour * 3600 + t.minute * 60 + t.second, t.millisecond * 1000000 + t.microsecond * 1000 + t.nanosecond);
};
const T$epochNsToDateTime = en => {
  const t = T$tdToTimeOfDay(en);
  const date = T$epochDaysToDate(t.days);
  return T$dateTime(date, T$time(t.hour, t.minute, t.second, t.millisecond, t.microsecond, t.nanosecond));
};
const T$balanceISODateTimeWithOffset = (dt, offsetNs) => T$epochNsToDateTime(T$tdAdd(T$utcEpochNs(dt), T$td(0, offsetNs)));
const T$checkISODaysRange = date => {
  if (Math.abs(T$epochDays(date.year, date.month, date.day)) > 100000000) throw new RangeError('date out of range');
};
const T$isoDateTimeWithinLimits = dt => {
  // fast path away from the edges
  if (dt.date.year > -271821 && dt.date.year < 275760) return true;
  if (Math.abs(T$epochDays(dt.date.year, dt.date.month, dt.date.day)) > 100000001) return false;
  const en = T$utcEpochNs(dt);
  if (en.sec < -T$NS_MAX_SEC - 86400 || (en.sec === -T$NS_MAX_SEC - 86400 && en.ns === 0)) return false;
  if (en.sec >= T$NS_MAX_SEC + 86400) return false;
  return true;
};
const T$isoDateWithinLimits = date => T$isoDateTimeWithinLimits(T$dateTime(date, T$time(12, 0, 0, 0, 0, 0)));
const T$isoYearMonthWithinLimits = date => {
  if (date.year < -271821 || date.year > 275760) return false;
  if (date.year === -271821 && date.month < 4) return false;
  if (date.year === 275760 && date.month > 9) return false;
  return true;
};

const T$isDigit = c => c >= 48 && c <= 57;
const T$isAlpha = c => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const T$nDigits = (s, i, n) => {
  if (i + n > s.length) return -1;
  let v = 0;
  for (let k = 0; k < n; k++) {
    const c = s.charCodeAt(i + k);
    if (!T$isDigit(c)) return -1;
    v = v * 10 + c - 48;
  }
  return v;
};
// parsers return null on failure and only advance st.i on success
const T$pDateYear = st => {
  const s = st.s, c = s.charCodeAt(st.i);
  if (c === 43 || c === 45) {
    const v = T$nDigits(s, st.i + 1, 6);
    if (v < 0) return null;
    if (c === 45 && v === 0) return null;
    st.i += 7;
    return c === 45 ? -v : v;
  }
  const v = T$nDigits(s, st.i, 4);
  if (v < 0) return null;
  st.i += 4;
  return v;
};
const T$pMonth = st => {
  const v = T$nDigits(st.s, st.i, 2);
  if (v < 1 || v > 12) return null;
  st.i += 2;
  return v;
};
const T$pDay = st => {
  const v = T$nDigits(st.s, st.i, 2);
  if (v < 1 || v > 31) return null;
  st.i += 2;
  return v;
};
const T$pDate = st => {
  const start = st.i;
  const y = T$pDateYear(st);
  if (y === null) return null;
  let ext = false;
  if (st.s.charCodeAt(st.i) === 45) {
    ext = true;
    st.i++;
  }
  const m = T$pMonth(st);
  if (m === null) {
    st.i = start;
    return null;
  }
  if (ext) {
    if (st.s.charCodeAt(st.i) !== 45) {
      st.i = start;
      return null;
    }
    st.i++;
  }
  const d = T$pDay(st);
  if (d === null) {
    st.i = start;
    return null;
  }
  return { year: y, month: m, day: d };
};
const T$pFraction = st => {
  const c = st.s.charCodeAt(st.i);
  if (c !== 46 && c !== 44) return -1;
  let j = st.i + 1, v = 0, n = 0;
  while (j < st.s.length && T$isDigit(st.s.charCodeAt(j))) {
    v = v * 10 + st.s.charCodeAt(j) - 48;
    n++;
    j++;
  }
  if (n === 0 || n > 9) return null;
  for (let k = n; k < 9; k++) v *= 10;
  st.i = j;
  return v;
};
const T$pHourMinuteSecond = (st, maxSec, allowSubMinute) => {
  const s = st.s, start = st.i;
  const h = T$nDigits(s, st.i, 2);
  if (h < 0 || h > 23) return null;
  st.i += 2;
  const r = { h, mi: 0, sec: 0, frac: 0, subMinute: false };
  const sep = s.charCodeAt(st.i) === 58 ? 1 : 0;
  if (sep === 0 && T$nDigits(s, st.i, 2) < 0) return r;
  r.mi = T$nDigits(s, st.i + sep, 2);
  if (r.mi < 0 || r.mi > 59) {
    st.i = start;
    return null;
  }
  st.i += 2 + sep;
  if (sep === 1 ? s.charCodeAt(st.i) !== 58 : T$nDigits(s, st.i, 2) < 0) return r;
  r.sec = T$nDigits(s, st.i + sep, 2);
  if (!allowSubMinute || r.sec < 0 || r.sec > maxSec) {
    st.i = start;
    return null;
  }
  st.i += 2 + sep;
  r.subMinute = true;
  const f = T$pFraction(st);
  if (f === null) {
    st.i = start;
    return null;
  }
  if (f >= 0) r.frac = f;
  return r;
};
const T$pTime = st => {
  const r = T$pHourMinuteSecond(st, 60, true);
  if (r === null) return null;
  return T$time(r.h, r.mi, r.sec === 60 ? 59 : r.sec, Math.floor(r.frac / 1000000), Math.floor(r.frac / 1000) % 1000, r.frac % 1000);
};
const T$pOffset = (st, allowSubMinute) => {
  const s = st.s, start = st.i, c = s.charCodeAt(st.i);
  if (c !== 43 && c !== 45) return null;
  const sign = c === 45 ? -1 : 1;
  st.i++;
  const r = T$pHourMinuteSecond(st, 59, allowSubMinute);
  if (r === null) {
    st.i = start;
    return null;
  }
  return { str: s.slice(start, st.i), ns: sign * (((r.h * 60 + r.mi) * 60 + r.sec) * 1e9 + r.frac), subMinute: r.subMinute, minutes: sign * (r.h * 60 + r.mi) };
};
const T$isTZChar = (c, leading) => {
  if (T$isAlpha(c) || c === 46 || c === 95) return true;
  if (leading) return false;
  return T$isDigit(c) || c === 45 || c === 43;
};
const T$isValidIANAName = s => {
  if (s.length === 0) return false;
  const parts = s.split('/');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.length === 0 || p === '.' || p === '..') return false;
    if (!T$isTZChar(p.charCodeAt(0), true)) return false;
    for (let j = 1; j < p.length; j++) if (!T$isTZChar(p.charCodeAt(j), false)) return false;
  }
  return true;
};
const T$parseTimeZoneIdentifier = id => {
  const st = { s: id, i: 0 };
  const off = T$pOffset(st, false);
  if (off !== null) {
    if (st.i !== id.length) return null;
    return { name: undefined, offsetMinutes: off.minutes };
  }
  if (!T$isValidIANAName(id)) return null;
  return { name: id, offsetMinutes: undefined };
};
const T$isAnnotationKey = k => {
  if (k.length === 0) return false;
  for (let i = 0; i < k.length; i++) {
    const c = k.charCodeAt(i);
    const lower = (c >= 97 && c <= 122) || c === 95;
    if (i === 0 ? !lower : !(lower || T$isDigit(c) || c === 45)) return false;
  }
  return true;
};
const T$isAnnotationValue = v => {
  const parts = v.split('-');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.length === 0) return false;
    for (let j = 0; j < p.length; j++) {
      const c = p.charCodeAt(j);
      if (!T$isAlpha(c) && !T$isDigit(c)) return false;
    }
  }
  return true;
};
const T$pAnnotations = st => {
  const s = st.s;
  let tz, calendar, calendarCritical = false, first = true, sawCalendarTwiceCritical = false, criticalUnknown = false;
  const out = { tz: undefined, calendar: undefined, error: false };
  while (s.charCodeAt(st.i) === 91) {
    const close = s.indexOf(']', st.i);
    if (close < 0) return null;
    let content = s.slice(st.i + 1, close);
    let critical = false;
    if (content.charCodeAt(0) === 33) {
      critical = true;
      content = content.slice(1);
    }
    const eq = content.indexOf('=');
    if (eq < 0) {
      if (!first) return null;
      if (T$parseTimeZoneIdentifier(content) === null) return null;
      tz = content;
    } else {
      const key = content.slice(0, eq), value = content.slice(eq + 1);
      if (!T$isAnnotationKey(key) || !T$isAnnotationValue(value)) return null;
      if (key === 'u-ca') {
        if (calendar === undefined) {
          calendar = value;
          calendarCritical = critical;
        } else if (critical || calendarCritical) sawCalendarTwiceCritical = true;
      } else if (critical) criticalUnknown = true;
    }
    first = false;
    st.i = close + 1;
  }
  out.tz = tz;
  out.calendar = calendar;
  out.error = sawCalendarTwiceCritical || criticalUnknown;
  return out;
};
const T$parseFail = () => {
  throw new RangeError('invalid ISO 8601 string');
};
const T$tryDateTime = s => {
  const st = { s, i: 0 };
  const date = T$pDate(st);
  if (date === null) return null;
  let time, z = false, offset;
  const c = s.charCodeAt(st.i);
  if (c === 84 || c === 116 || c === 32) {
    st.i++;
    time = T$pTime(st);
    if (time === null) return null;
    const oc = s.charCodeAt(st.i);
    if (oc === 90 || oc === 122) {
      z = true;
      st.i++;
    } else {
      const off = T$pOffset(st, true);
      if (off !== null) offset = off;
    }
  }
  const ann = T$pAnnotations(st);
  if (ann === null || st.i !== s.length) return null;
  return { year: date.year, month: date.month, day: date.day, time, z, offset, tz: ann.tz, calendar: ann.calendar, annError: ann.error, form: 'datetime' };
};
const T$tryYearMonth = s => {
  const st = { s, i: 0 };
  const y = T$pDateYear(st);
  if (y === null) return null;
  if (s.charCodeAt(st.i) === 45) st.i++;
  const m = T$pMonth(st);
  if (m === null) return null;
  const ann = T$pAnnotations(st);
  if (ann === null || st.i !== s.length) return null;
  return { year: y, month: m, day: undefined, time: undefined, z: false, offset: undefined, tz: ann.tz, calendar: ann.calendar, annError: ann.error, form: 'yearmonth' };
};
const T$tryMonthDay = s => {
  const st = { s, i: 0 };
  if (s.charCodeAt(0) === 45 && s.charCodeAt(1) === 45) st.i = 2;
  const m = T$pMonth(st);
  if (m === null) return null;
  if (s.charCodeAt(st.i) === 45) st.i++;
  const d = T$pDay(st);
  if (d === null) return null;
  const ann = T$pAnnotations(st);
  if (ann === null || st.i !== s.length) return null;
  return { year: undefined, month: m, day: d, time: undefined, z: false, offset: undefined, tz: ann.tz, calendar: ann.calendar, annError: ann.error, form: 'monthday' };
};
const T$tryTime = s => {
  const st = { s, i: 0 };
  const c = s.charCodeAt(0);
  let designator = false;
  if (c === 84 || c === 116) {
    designator = true;
    st.i = 1;
  }
  const time = T$pTime(st);
  if (time === null) return null;
  let offset;
  const oc = s.charCodeAt(st.i);
  if (oc === 90 || oc === 122) return null;
  const off = T$pOffset(st, true);
  if (off !== null) offset = off;
  const endOfTime = st.i;
  const ann = T$pAnnotations(st);
  if (ann === null || st.i !== s.length) return null;
  if (!designator) {
    // ambiguity with month-day / year-month forms
    const core = s.slice(0, endOfTime);
    const md = T$tryMonthDay(core);
    if ((md !== null && T$isValidISODate(1972, md.month, md.day)) || T$tryYearMonth(core) !== null) return null;
  }
  return { year: undefined, month: undefined, day: undefined, time, z: false, offset, tz: ann.tz, calendar: ann.calendar, annError: ann.error, form: 'time' };
};
const T$parseISODateTime = (s, goal) => {
  let r = null;
  const dt = T$tryDateTime(s);
  if (dt !== null) {
    let ok;
    if (goal === 'instant') ok = dt.time !== undefined && (dt.z || dt.offset !== undefined);
    else if (goal === 'zoned') ok = dt.tz !== undefined;
    else if (goal === 'relative' || goal === 'any') ok = !dt.z || dt.tz !== undefined || goal === 'any';
    else if (goal === 'time') ok = dt.time !== undefined && !dt.z;
    else ok = !dt.z;
    if (ok) r = dt;
  }
  if (r === null) {
    if (goal === 'yearmonth' || goal === 'any') r = T$tryYearMonth(s);
    if (r === null && (goal === 'monthday' || goal === 'any')) r = T$tryMonthDay(s);
    if (r === null && (goal === 'time' || goal === 'any')) r = T$tryTime(s);
  }
  if (r === null || r.annError) T$parseFail();
  if (r.form === 'datetime' && !T$isValidISODate(r.year, r.month, r.day)) T$parseFail();
  if (r.form === 'monthday' && !T$isValidISODate(1972, r.month, r.day)) T$parseFail();
  if ((r.form === 'yearmonth' || r.form === 'monthday') && r.calendar !== undefined && T$asciiLower(r.calendar) !== 'iso8601') T$parseFail();
  return r;
};
const T$asciiLower = s => {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += (c >= 65 && c <= 90) ? String.fromCharCode(c + 32) : s[i];
  }
  return out;
};
const T$parseDateTimeUTCOffset = str => {
  const st = { s: str, i: 0 };
  const off = T$pOffset(st, true);
  if (off === null || st.i !== str.length) throw new RangeError('invalid offset string');
  return off.ns;
};

const T$parseDurationString = s => {
  let i = 0;
  let sign = 1;
  const c0 = s.charCodeAt(0);
  if (c0 === 43) i++;
  else if (c0 === 45) {
    sign = -1;
    i++;
  }
  const p = s.charCodeAt(i);
  if (p !== 80 && p !== 112) throw new RangeError('invalid duration string');
  i++;
  const vals = [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ]; // y mo w d h mi s ms us ns
  let inTime = false, any = false, lastOrder = -1, sawFraction = false, timeAny = false;
  let fracNs = 0, fracUnit = -1;
  while (i < s.length) {
    const ch = s.charCodeAt(i);
    if (ch === 84 || ch === 116) {
      if (inTime) throw new RangeError('invalid duration string');
      inTime = true;
      i++;
      if (i >= s.length) throw new RangeError('invalid duration string');
      continue;
    }
    if (sawFraction) throw new RangeError('invalid duration string');
    let j = i;
    while (j < s.length && T$isDigit(s.charCodeAt(j))) j++;
    if (j === i) throw new RangeError('invalid duration string');
    const intStr = s.slice(i, j);
    let fracDigits = '';
    if (s.charCodeAt(j) === 46 || s.charCodeAt(j) === 44) {
      let k = j + 1;
      while (k < s.length && T$isDigit(s.charCodeAt(k))) k++;
      fracDigits = s.slice(j + 1, k);
      if (fracDigits.length === 0 || fracDigits.length > 9) throw new RangeError('invalid duration string');
      j = k;
    }
    const u = s.charCodeAt(j) | 32;
    let order;
    if (!inTime) {
      if (u === 121) order = 0;
      else if (u === 109) order = 1;
      else if (u === 119) order = 2;
      else if (u === 100) order = 3;
      else throw new RangeError('invalid duration string');
      if (fracDigits.length > 0) throw new RangeError('invalid duration string');
    } else {
      if (u === 104) order = 4;
      else if (u === 109) order = 5;
      else if (u === 115) order = 6;
      else throw new RangeError('invalid duration string');
      timeAny = true;
    }
    if (order <= lastOrder) throw new RangeError('invalid duration string');
    lastOrder = order;
    vals[order] = Number(intStr);
    if (fracDigits.length > 0) {
      sawFraction = true;
      let f = Number(fracDigits);
      for (let k = fracDigits.length; k < 9; k++) f *= 10;
      fracUnit = order;
      fracNs = order === 4 ? f * 3600 : (order === 5 ? f * 60 : f);
    }
    any = true;
    i = j + 1;
  }
  if (!any || (inTime && !timeAny)) throw new RangeError('invalid duration string');
  if (fracUnit >= 0) {
    let rest = fracNs;
    if (fracUnit === 4) {
      vals[5] = Math.floor(rest / 60000000000);
      rest -= vals[5] * 60000000000;
    }
    if (fracUnit <= 5) {
      vals[6] = Math.floor(rest / 1000000000);
      rest -= vals[6] * 1000000000;
    }
    vals[7] = Math.floor(rest / 1000000);
    rest -= vals[7] * 1000000;
    vals[8] = Math.floor(rest / 1000);
    vals[9] = rest - vals[8] * 1000;
  }
  for (let k = 0; k < 10; k++) vals[k] = vals[k] * sign + 0;
  return vals;
};

const T$CALENDARS = [ 'iso8601', 'buddhist', 'chinese', 'coptic', 'dangi', 'ethioaa', 'ethiopic', 'gregory', 'hebrew', 'indian', 'islamic-civil', 'islamic-tbla', 'islamic-umalqura', 'japanese', 'persian', 'roc' ];
const T$canonicalizeCalendar = id => {
  const lower = T$asciiLower(id);
  const alias = T$CAL_ALIASES[lower];
  if (alias !== undefined) return alias;
  if (T$CALENDARS.indexOf(lower) < 0) throw new RangeError('unsupported calendar: ' + id);
  return lower;
};
const T$CAL_ALIASES = { islamicc: 'islamic-civil', 'ethiopic-amete-alem': 'ethioaa' };
const T$parseTemporalCalendarString = s => {
  let r = null;
  try {
    r = T$parseISODateTime(s, 'any');
  } catch (e) {
    r = null;
  }
  if (r !== null) return r.calendar === undefined ? 'iso8601' : r.calendar;
  if (!T$isAnnotationValue(s)) throw new RangeError('invalid calendar: ' + s);
  return s;
};
const T$toTemporalCalendarIdentifier = x => {
  if (T$isObject(x)) {
    const sl = T$slotsOf(x);
    if (sl !== undefined && sl.calendar !== undefined) return sl.calendar;
  }
  if (typeof x !== 'string') throw new TypeError('calendar must be a string');
  return T$canonicalizeCalendar(T$parseTemporalCalendarString(x));
};
const T$getCalendarWithISODefault = item => {
  const sl = T$slotsOf(item);
  if (sl !== undefined && sl.calendar !== undefined) return sl.calendar;
  const c = item.calendar;
  if (c === undefined) return 'iso8601';
  return T$toTemporalCalendarIdentifier(c);
};

const T$formatOffsetMinutes = minutes => {
  const sign = minutes < 0 ? '-' : '+';
  const a = Math.abs(minutes);
  return sign + T$pad(Math.floor(a / 60), 2) + ':' + T$pad(a % 60, 2);
};
const T$parseTemporalTimeZoneString = s => {
  const id = T$parseTimeZoneIdentifier(s);
  if (id !== null) return id;
  const r = T$parseISODateTime(s, 'any');
  if (r.tz !== undefined) return T$parseTimeZoneIdentifier(r.tz);
  if (r.z) return { name: 'UTC', offsetMinutes: undefined };
  if (r.offset !== undefined) {
    if (r.offset.subMinute) throw new RangeError('sub-minute offset not allowed as time zone');
    return { name: undefined, offsetMinutes: r.offset.minutes };
  }
  throw new RangeError('invalid time zone: ' + s);
};
const T$toTemporalTimeZoneIdentifier = x => {
  if (T$isObject(x)) {
    const sl = T$slotsOf(x);
    if (sl !== undefined && sl.brand === T$B_ZDT) return sl.timeZone;
  }
  if (typeof x !== 'string') throw new TypeError('time zone must be a string');
  const r = T$parseTemporalTimeZoneString(x);
  if (r.offsetMinutes !== undefined) return T$formatOffsetMinutes(r.offsetMinutes);
  const named = T$tzLookup(T$asciiLower(r.name));
  if (named === undefined) throw new RangeError('unknown time zone: ' + x);
  return named;
};
const T$isOffsetTimeZone = tz => {
  const c = tz.charCodeAt(0);
  return c === 43 || c === 45;
};
const T$offsetTimeZoneNs = tz => {
  const sign = tz.charCodeAt(0) === 45 ? -1 : 1;
  return sign * (Number(tz.slice(1, 3)) * 3600 + Number(tz.slice(4, 6)) * 60) * 1e9;
};
const T$timeZoneEquals = (a, b) => {
  if (a === b) return true;
  const ao = T$isOffsetTimeZone(a), bo = T$isOffsetTimeZone(b);
  if (ao || bo) return ao && bo && T$offsetTimeZoneNs(a) === T$offsetTimeZoneNs(b);
  return T$tzPrimary(a) === T$tzPrimary(b);
};
const T$isUTCZone = tz => T$tzPrimary(tz) === 'UTC';
const T$getOffsetNs = (tz, en) => {
  if (T$isOffsetTimeZone(tz)) return T$offsetTimeZoneNs(tz);
  if (T$isUTCZone(tz)) return 0;
  return T$tzOffsetSec(T$tzZone(tz), en.sec) * 1e9;
};
const T$getISODateTimeFor = (tz, en) => T$epochNsToDateTime(T$tdAdd(en, T$td(0, T$getOffsetNs(tz, en))));
const T$getPossibleEpochNs = (tz, dt) => {
  let out;
  if (T$isOffsetTimeZone(tz) || T$isUTCZone(tz)) {
    const off = T$isOffsetTimeZone(tz) ? T$offsetTimeZoneNs(tz) : 0;
    const bal = T$balanceISODateTimeWithOffset(dt, -off);
    T$checkISODaysRange(bal.date);
    out = [ T$utcEpochNs(bal) ];
  } else out = T$tzPossible(tz, dt);
  for (let i = 0; i < out.length; i++) T$checkEpochNs(out[i]);
  return out;
};
const T$disambiguate = (possible, tz, dt, disambiguation) => {
  const n = possible.length;
  if (n === 1) return possible[0];
  if (n !== 0) {
    if (disambiguation === 'earlier' || disambiguation === 'compatible') return possible[0];
    if (disambiguation === 'later') return possible[n - 1];
    throw new RangeError('ambiguous local time');
  }
  if (disambiguation === 'reject') throw new RangeError('local time does not exist');
  const en = T$utcEpochNs(dt);
  const dayBefore = T$tdAdd(en, { sec: -86400, ns: 0 });
  T$checkEpochNs(dayBefore);
  const offsetBefore = T$getOffsetNs(tz, dayBefore);
  const dayAfter = T$tdAdd(en, { sec: 86400, ns: 0 });
  T$checkEpochNs(dayAfter);
  const offsetAfter = T$getOffsetNs(tz, dayAfter);
  const nanoseconds = offsetAfter - offsetBefore;
  const earlier = disambiguation === 'earlier';
  const t = T$addTime(dt.time, T$td(0, earlier ? -nanoseconds : nanoseconds));
  const p = T$getPossibleEpochNs(tz, T$dateTime(T$addDaysToISODate(dt.date, t.days), T$stripDays(t)));
  return earlier ? p[0] : p[p.length - 1];
};
const T$getEpochNsFor = (tz, dt, disambiguation) => T$disambiguate(T$getPossibleEpochNs(tz, dt), tz, dt, disambiguation);
const T$getStartOfDay = (tz, date) => {
  const dt = T$dateTime(date, T$MIDNIGHT);
  const p = T$getPossibleEpochNs(tz, dt);
  if (p.length > 0) return p[0];
  const en = T$utcEpochNs(dt);
  const dayBefore = T$tdAdd(en, { sec: -86400, ns: 0 });
  return T$tzTransition(tz, dayBefore, 1);
};

const T$padISOYear = y => {
  if (y >= 0 && y <= 9999) return T$pad(y, 4);
  return (y < 0 ? '-' : '+') + T$pad(Math.abs(y), 6);
};
const T$formatFractionalSeconds = (subNs, precision) => {
  if (precision === 'auto') {
    if (subNs === 0) return '';
    let f = T$pad(subNs, 9);
    let e = f.length;
    while (e > 0 && f.charCodeAt(e - 1) === 48) e--;
    return '.' + f.slice(0, e);
  }
  if (precision === 0) return '';
  return '.' + T$pad(subNs, 9).slice(0, precision);
};
const T$formatTimeString = (t, precision) => {
  let out = T$pad(t.hour, 2) + ':' + T$pad(t.minute, 2);
  if (precision === 'minute') return out;
  out += ':' + T$pad(t.second, 2);
  return out + T$formatFractionalSeconds(t.millisecond * 1000000 + t.microsecond * 1000 + t.nanosecond, precision);
};
const T$formatDate = d => T$padISOYear(d.year) + '-' + T$pad(d.month, 2) + '-' + T$pad(d.day, 2);
const T$formatCalendarAnnotation = (id, show) => {
  if (show === 'never') return '';
  if (show === 'auto' && id === 'iso8601') return '';
  return '[' + (show === 'critical' ? '!' : '') + 'u-ca=' + id + ']';
};
const T$formatUTCOffsetNs = ns => {
  const sign = ns < 0 ? '-' : '+';
  const a = Math.abs(ns);
  const h = Math.floor(a / 3600e9);
  const mi = Math.floor(a / 60e9) % 60;
  const sec = Math.floor(a / 1e9) % 60;
  const sub = a % 1e9;
  let out = sign + T$pad(h, 2) + ':' + T$pad(mi, 2);
  if (sec !== 0 || sub !== 0) out += ':' + T$pad(sec, 2) + T$formatFractionalSeconds(sub, 'auto');
  return out;
};
const T$formatDateTimeUTCOffsetRounded = ns => {
  const r = T$roundNumberToIncrement(ns, 60e9, 'halfExpand');
  return T$formatOffsetMinutes(r / 60e9);
};
const T$isoDateTimeToString = (dt, calendar, precision, showCalendar) => T$formatDate(dt.date) + 'T' + T$formatTimeString(dt.time, precision) + T$formatCalendarAnnotation(calendar, showCalendar);

const T$getOptionsObject = options => {
  if (options === undefined) return Object.create(null);
  if (T$isObject(options)) return options;
  throw new TypeError('options must be an object');
};
const T$getOption = (options, prop, values, fallback) => {
  let v = options[prop];
  if (v === undefined) {
    if (fallback === T$REQUIRED) throw new RangeError(prop + ' is required');
    return fallback;
  }
  v = T$toString(v);
  if (values !== undefined && values.indexOf(v) < 0) throw new RangeError('invalid value for ' + prop + ': ' + v);
  return v;
};
const T$REQUIRED = {};
const T$getOverflowOption = options => T$getOption(options, 'overflow', [ 'constrain', 'reject' ], 'constrain');
const T$getDisambiguationOption = options => T$getOption(options, 'disambiguation', [ 'compatible', 'earlier', 'later', 'reject' ], 'compatible');
const T$getOffsetOption = (options, fallback) => T$getOption(options, 'offset', [ 'prefer', 'use', 'ignore', 'reject' ], fallback);
const T$getShowCalendarOption = options => T$getOption(options, 'calendarName', [ 'auto', 'always', 'never', 'critical' ], 'auto');
const T$getShowTimeZoneOption = options => T$getOption(options, 'timeZoneName', [ 'auto', 'never', 'critical' ], 'auto');
const T$getShowOffsetOption = options => T$getOption(options, 'offset', [ 'auto', 'never' ], 'auto');
const T$ROUNDING_MODES = [ 'ceil', 'floor', 'expand', 'trunc', 'halfCeil', 'halfFloor', 'halfExpand', 'halfTrunc', 'halfEven' ];
const T$getRoundingModeOption = (options, fallback) => T$getOption(options, 'roundingMode', T$ROUNDING_MODES, fallback);
const T$getRoundingIncrementOption = options => {
  const v = options.roundingIncrement;
  if (v === undefined) return 1;
  const n = T$toIntegerWithTruncation(v);
  if (n < 1 || n > 1000000000) throw new RangeError('roundingIncrement out of range');
  return n;
};
const T$getFractionalSecondDigitsOption = options => {
  const v = options.fractionalSecondDigits;
  if (v === undefined) return 'auto';
  if (typeof v !== 'number') {
    if (T$toString(v) !== 'auto') throw new RangeError('invalid fractionalSecondDigits');
    return 'auto';
  }
  if (v !== v || v === Infinity || v === -Infinity) throw new RangeError('invalid fractionalSecondDigits');
  const d = Math.floor(v);
  if (d < 0 || d > 9) throw new RangeError('fractionalSecondDigits out of range');
  return d;
};
const T$UNITS = [ 'year', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ];
const T$UNITS_PLURAL = [ 'years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds' ];
const T$UNIT_NS = [ 0, 0, 604800e9, 86400e9, 3600e9, 60e9, 1e9, 1e6, 1e3, 1 ];
const T$unitIndex = u => T$UNITS.indexOf(u);
const T$unitNs = u => T$UNIT_NS[T$UNITS.indexOf(u)];
const T$unitTd = (u, increment) => {
  const n = T$unitNs(u);
  if (n >= 1e9) return { sec: n / 1e9 * increment, ns: 0 };
  return T$td(0, n * increment);
};
const T$getUnitOption = (options, key, fallback) => {
  let v = options[key];
  if (v === undefined) {
    if (fallback === T$REQUIRED) throw new RangeError(key + ' is required');
    return fallback;
  }
  v = T$toString(v);
  if (v === 'auto') return v;
  let i = T$UNITS.indexOf(v);
  if (i < 0) i = T$UNITS_PLURAL.indexOf(v);
  if (i < 0) throw new RangeError('invalid unit for ' + key + ': ' + v);
  return T$UNITS[i];
};
const T$isDateUnit = u => u === 'year' || u === 'month' || u === 'week' || u === 'day';
const T$isCalendarUnit = u => u === 'year' || u === 'month' || u === 'week';
const T$validateUnit = (value, group, extra) => {
  if (value === undefined) return;
  if (extra !== undefined && extra.indexOf(value) >= 0) return;
  if (value === 'auto') throw new RangeError('auto is not allowed');
  if (group === 'date' && !T$isDateUnit(value)) throw new RangeError('time unit not allowed: ' + value);
  if (group === 'time' && T$isDateUnit(value)) throw new RangeError('date unit not allowed: ' + value);
};
const T$largerUnit = (a, b) => T$unitIndex(a) <= T$unitIndex(b) ? a : b;
const T$maxRoundingIncrement = u => {
  if (u === 'hour') return 24;
  if (u === 'minute' || u === 'second') return 60;
  if (u === 'millisecond' || u === 'microsecond' || u === 'nanosecond') return 1000;
  return undefined;
};
const T$validateRoundingIncrement = (inc, dividend, inclusive) => {
  const max = inclusive ? dividend : dividend - 1;
  if (inc > max) throw new RangeError('roundingIncrement out of range');
  if (dividend % inc !== 0) throw new RangeError('roundingIncrement does not divide');
};
const T$negateRoundingMode = m => {
  if (m === 'ceil') return 'floor';
  if (m === 'floor') return 'ceil';
  if (m === 'halfCeil') return 'halfFloor';
  if (m === 'halfFloor') return 'halfCeil';
  return m;
};
const T$getDifferenceSettings = (op, options, group, disallowed, fallbackSmallest, smallestLargestDefault) => {
  let largestUnit = T$getUnitOption(options, 'largestUnit', undefined);
  const roundingIncrement = T$getRoundingIncrementOption(options);
  let roundingMode = T$getRoundingModeOption(options, 'trunc');
  let smallestUnit = T$getUnitOption(options, 'smallestUnit', undefined);
  T$validateUnit(largestUnit, group, [ 'auto' ]);
  if (largestUnit === undefined) largestUnit = 'auto';
  if (disallowed.indexOf(largestUnit) >= 0) throw new RangeError('largestUnit not allowed');
  T$validateUnit(smallestUnit, group);
  if (smallestUnit === undefined) smallestUnit = fallbackSmallest;
  if (disallowed.indexOf(smallestUnit) >= 0) throw new RangeError('smallestUnit not allowed');
  const defaultLargest = T$largerUnit(smallestLargestDefault, smallestUnit);
  if (largestUnit === 'auto') largestUnit = defaultLargest;
  if (T$largerUnit(largestUnit, smallestUnit) !== largestUnit) throw new RangeError('largestUnit must be larger than smallestUnit');
  const max = T$maxRoundingIncrement(smallestUnit);
  if (max !== undefined) T$validateRoundingIncrement(roundingIncrement, max, false);
  if (op === 'since') roundingMode = T$negateRoundingMode(roundingMode);
  return { largestUnit, roundingIncrement, roundingMode, smallestUnit };
};
const T$toSecondsStringPrecision = (smallestUnit, digits) => {
  T$validateUnit(smallestUnit, 'time');
  if (smallestUnit === 'hour') throw new RangeError('smallestUnit must not be hour');
  if (smallestUnit === 'minute') return { precision: 'minute', unit: 'minute', increment: 1 };
  if (smallestUnit === 'second') return { precision: 0, unit: 'second', increment: 1 };
  if (smallestUnit === 'millisecond') return { precision: 3, unit: 'millisecond', increment: 1 };
  if (smallestUnit === 'microsecond') return { precision: 6, unit: 'microsecond', increment: 1 };
  if (smallestUnit === 'nanosecond') return { precision: 9, unit: 'nanosecond', increment: 1 };
  if (digits === 'auto') return { precision: 'auto', unit: 'nanosecond', increment: 1 };
  if (digits === 0) return { precision: 0, unit: 'second', increment: 1 };
  if (digits <= 3) return { precision: digits, unit: 'millisecond', increment: Math.pow(10, 3 - digits) };
  if (digits <= 6) return { precision: digits, unit: 'microsecond', increment: Math.pow(10, 6 - digits) };
  return { precision: digits, unit: 'nanosecond', increment: Math.pow(10, 9 - digits) };
};

const T$FIELD_ORDER = [ 'day', 'era', 'eraYear', 'hour', 'microsecond', 'millisecond', 'minute', 'month', 'monthCode', 'nanosecond', 'offset', 'second', 'timeZone', 'year' ];
const T$FIELD_KIND = { day: 1, era: 2, eraYear: 0, hour: 0, microsecond: 0, millisecond: 0, minute: 0, month: 1, monthCode: 3, nanosecond: 0, offset: 4, second: 0, timeZone: 5, year: 0 };
const T$TIME_FIELDS = [ 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ];
const T$toMonthCode = v => {
  const p = T$toPrimitive(v, 'string');
  if (typeof p !== 'string') throw new TypeError('monthCode must be a string');
  const len = p.length;
  if (len !== 3 && len !== 4) throw new RangeError('invalid monthCode');
  if (p.charCodeAt(0) !== 77 || !T$isDigit(p.charCodeAt(1)) || !T$isDigit(p.charCodeAt(2))) throw new RangeError('invalid monthCode');
  if (len === 4 && p.charCodeAt(3) !== 76) throw new RangeError('invalid monthCode');
  if (p.charCodeAt(1) === 48 && p.charCodeAt(2) === 48 && len === 3) throw new RangeError('invalid monthCode');
  return p;
};
const T$toOffsetString = v => {
  const p = T$toPrimitive(v, 'string');
  if (typeof p !== 'string') throw new TypeError('offset must be a string');
  T$parseDateTimeUTCOffset(p);
  return p;
};
const T$convertField = (kind, v) => {
  switch (kind) {
    case 0: return T$toIntegerWithTruncation(v);
    case 1: return T$toPositiveIntegerWithTruncation(v);
    case 2: {
      const p = T$toPrimitive(v, 'string');
      if (typeof p !== 'string') throw new TypeError('era must be a string');
      return p;
    }
    case 3: return T$toMonthCode(v);
    case 4: return T$toOffsetString(v);
    case 5: return T$toTemporalTimeZoneIdentifier(v);
  }
};
const T$prepareCalendarFields = (calendar, obj, calendarNames, nonCalendarNames, required) => {
  const names = calendarNames.concat(nonCalendarNames);
  if (T$calendarUsesEras(calendar) && calendarNames.indexOf('year') >= 0) names.push('era', 'eraYear');
  const result = {};
  let any = false;
  for (let i = 0; i < T$FIELD_ORDER.length; i++) {
    const name = T$FIELD_ORDER[i];
    if (names.indexOf(name) < 0) continue;
    const v = obj[name];
    if (v !== undefined) {
      any = true;
      result[name] = T$convertField(T$FIELD_KIND[name], v);
    } else if (required !== 'partial') {
      if (required.indexOf(name) >= 0) throw new TypeError('missing required property ' + name);
      if (T$TIME_FIELDS.indexOf(name) >= 0) result[name] = 0;
    }
  }
  if (required === 'partial' && !any) throw new TypeError('no properties present');
  return result;
};
const T$toTemporalTimeRecord = (obj, partial) => {
  const r = {};
  let any = false;
  const order = [ 'hour', 'microsecond', 'millisecond', 'minute', 'nanosecond', 'second' ];
  for (let i = 0; i < 6; i++) {
    const v = obj[order[i]];
    if (v !== undefined) {
      any = true;
      r[order[i]] = T$toIntegerWithTruncation(v);
    }
  }
  if (!any) throw new TypeError('no time properties present');
  if (!partial) for (let i = 0; i < 6; i++) if (r[order[i]] === undefined) r[order[i]] = 0;
  return r;
};
const T$rejectTemporalLikeObject = obj => {
  const sl = T$slotsOf(obj);
  if (sl !== undefined && sl.brand !== T$B_DURATION && sl.brand !== T$B_INSTANT) throw new TypeError('Temporal object not allowed');
  if (obj.calendar !== undefined) throw new TypeError('calendar property not allowed');
  if (obj.timeZone !== undefined) throw new TypeError('timeZone property not allowed');
};
const T$calendarMergeFields = (calendar, fields, additional) => {
  const merged = {};
  const ignore = T$calendarFieldKeysToIgnore(calendar, additional);
  for (let i = 0; i < T$FIELD_ORDER.length; i++) {
    const k = T$FIELD_ORDER[i];
    if (fields[k] !== undefined && ignore.indexOf(k) < 0) merged[k] = fields[k];
    if (additional[k] !== undefined) merged[k] = additional[k];
  }
  return merged;
};
const T$calendarFieldKeysToIgnore = (calendar, additional) => {
  const out = [];
  if (calendar === 'iso8601') {
    if (additional.month !== undefined) out.push('monthCode');
    if (additional.monthCode !== undefined) out.push('month');
    return out;
  }
  return T$nonISOFieldKeysToIgnore(calendar, additional);
};
const T$parseMonthCode = mc => ({ month: Number(mc.slice(1, 3)), leap: mc.length === 4 });
const T$monthCodeFor = (month, leap) => 'M' + T$pad(month, 2) + (leap ? 'L' : '');
const T$calendarResolveFields = (calendar, fields, type) => {
  if (calendar !== 'iso8601') return T$nonISOResolveFields(calendar, fields, type);
  if ((type === 'date' || type === 'year-month') && fields.year === undefined) throw new TypeError('year is required');
  if ((type === 'date' || type === 'month-day') && fields.day === undefined) throw new TypeError('day is required');
  const month = fields.month, mc = fields.monthCode;
  if (mc === undefined) {
    if (month === undefined) throw new TypeError('month or monthCode is required');
    return;
  }
  const p = T$parseMonthCode(mc);
  if (p.leap || p.month < 1 || p.month > 12) throw new RangeError('invalid monthCode for calendar');
  if (month !== undefined && month !== p.month) throw new RangeError('month and monthCode do not agree');
  fields.month = p.month;
};
const T$calendarDateFromFields = (calendar, fields, overflow) => {
  T$calendarResolveFields(calendar, fields, 'date');
  const result = T$calendarDateToISO(calendar, fields, overflow);
  if (!T$isoDateWithinLimits(result)) throw new RangeError('date out of range');
  return result;
};
const T$calendarDateToISO = (calendar, fields, overflow) => {
  if (calendar === 'iso8601') return T$regulateISODate(fields.year, fields.month, fields.day, overflow);
  return T$nonISODateToISO(calendar, fields, overflow);
};
const T$calendarYearMonthFromFields = (calendar, fields, overflow) => {
  T$calendarResolveFields(calendar, fields, 'year-month');
  fields.day = 1;
  const result = T$calendarDateToISO(calendar, fields, overflow);
  if (!T$isoYearMonthWithinLimits(result)) throw new RangeError('year-month out of range');
  return result;
};
const T$calendarMonthDayFromFields = (calendar, fields, overflow) => {
  T$calendarResolveFields(calendar, fields, 'month-day');
  const result = T$calendarMonthDayToISOReferenceDate(calendar, fields, overflow);
  if (!T$isoDateWithinLimits(result)) throw new RangeError('date out of range');
  return result;
};
const T$calendarMonthDayToISOReferenceDate = (calendar, fields, overflow) => {
  if (calendar === 'iso8601') {
    const y = fields.year === undefined ? 1972 : fields.year;
    const r = T$regulateISODate(y, fields.month, fields.day, overflow);
    return T$isoDate(1972, r.month, r.day);
  }
  return T$nonISOMonthDayToISO(calendar, fields, overflow);
};
const T$calendarISOToDate = (calendar, date) => {
  if (calendar !== 'iso8601') return T$nonISOToDate(calendar, date);
  const w = T$weekOfYear(date);
  return {
    era: undefined, eraYear: undefined, year: date.year, month: date.month, monthCode: T$monthCodeFor(date.month, false), day: date.day,
    dayOfWeek: T$dayOfWeek(date), dayOfYear: T$dayOfYear(date), weekOfYear: w.week, yearOfWeek: w.year, daysInWeek: 7,
    daysInMonth: T$daysInMonth(date.year, date.month), daysInYear: T$isLeapYear(date.year) ? 366 : 365, monthsInYear: 12, inLeapYear: T$isLeapYear(date.year)
  };
};
const T$isoDateToFields = (calendar, date, type) => {
  const cd = T$calendarISOToDate(calendar, date);
  const f = {};
  f.monthCode = cd.monthCode;
  if (type !== 'month-day') f.year = cd.year;
  if (type !== 'year-month') f.day = cd.day;
  return f;
};
const T$calendarUsesEras = calendar => calendar !== 'iso8601' && T$nonISOUsesEras(calendar);
const T$dateDuration = (y, mo, w, d) => {
  const r = { years: y, months: mo, weeks: w, days: d };
  if (!T$isValidDuration(y, mo, w, d, 0, 0, 0, 0, 0, 0)) throw new RangeError('duration out of range');
  return r;
};
const T$ZERO_DATE_DURATION = { years: 0, months: 0, weeks: 0, days: 0 };
const T$dateDurationSign = d => {
  if (d.years !== 0) return d.years > 0 ? 1 : -1;
  if (d.months !== 0) return d.months > 0 ? 1 : -1;
  if (d.weeks !== 0) return d.weeks > 0 ? 1 : -1;
  if (d.days !== 0) return d.days > 0 ? 1 : -1;
  return 0;
};
const T$adjustDateDuration = (d, days, weeks, months) => T$dateDuration(d.years, months === undefined ? d.months : months, weeks === undefined ? d.weeks : weeks, days);
const T$calendarDateAdd = (calendar, date, duration, overflow) => {
  let result;
  if (calendar === 'iso8601') {
    const ym = T$balanceISOYearMonth(date.year + duration.years, date.month + duration.months);
    const r = T$regulateISODate(ym.year, ym.month, date.day, overflow);
    result = T$addDaysToISODate(r, duration.days + 7 * duration.weeks);
  } else result = T$nonISODateAdd(calendar, date, duration, overflow);
  if (!T$isoDateWithinLimits(result)) throw new RangeError('date out of range');
  return result;
};
const T$isoDateSurpasses = (sign, y1, m1, d1, two) => {
  if (y1 !== two.year) return sign * (y1 - two.year) > 0;
  if (m1 !== two.month) return sign * (m1 - two.month) > 0;
  if (d1 !== two.day) return sign * (d1 - two.day) > 0;
  return false;
};
const T$calendarDateUntil = (calendar, one, two, largestUnit) => {
  if (calendar !== 'iso8601') return T$nonISODateUntil(calendar, one, two, largestUnit);
  const sign = -T$compareISODate(one, two);
  if (sign === 0) return T$ZERO_DATE_DURATION;
  let years = 0, months = 0;
  if (largestUnit === 'year' || largestUnit === 'month') {
    let candidateYears = two.year - one.year;
    if (candidateYears !== 0) candidateYears -= sign;
    while (!T$isoDateSurpasses(sign, one.year + candidateYears, one.month, one.day, two)) {
      years = candidateYears;
      candidateYears += sign;
    }
    let candidateMonths = sign;
    let inter = T$balanceISOYearMonth(one.year + years, one.month + candidateMonths);
    while (!T$isoDateSurpasses(sign, inter.year, inter.month, one.day, two)) {
      months = candidateMonths;
      candidateMonths += sign;
      inter = T$balanceISOYearMonth(inter.year, inter.month + sign);
    }
    if (largestUnit === 'month') {
      months += years * 12;
      years = 0;
    }
  }
  const ym = T$balanceISOYearMonth(one.year + years, one.month + months);
  const constrained = T$regulateISODate(ym.year, ym.month, one.day, 'constrain');
  let days = T$epochDays(two.year, two.month, two.day) - T$epochDays(constrained.year, constrained.month, constrained.day);
  let weeks = 0;
  if (largestUnit === 'week') {
    weeks = Math.trunc(days / 7) + 0;
    days = days - weeks * 7 + 0;
  }
  return T$dateDuration(years, months, weeks, days);
};

// 2: invalid (non-finite or mixed signs)
const T$signStep = (sign, v) => {
  if (sign === 2 || v !== v || v === Infinity || v === -Infinity) return 2;
  if (v < 0) return sign > 0 ? 2 : -1;
  if (v > 0) return sign < 0 ? 2 : 1;
  return sign;
};
const T$isValidDuration = (y, mo, w, d, h, mi, s, ms, us, ns) => {
  let sign = T$signStep(T$signStep(T$signStep(T$signStep(T$signStep(0, y), mo), w), d), h);
  sign = T$signStep(T$signStep(T$signStep(T$signStep(T$signStep(sign, mi), s), ms), us), ns);
  if (sign === 2) return false;
  if (Math.abs(y) >= 4294967296 || Math.abs(mo) >= 4294967296 || Math.abs(w) >= 4294967296) return false;
  const ad = Math.abs(d), ah = Math.abs(h), ami = Math.abs(mi), as = Math.abs(s);
  if (ad * 86400 >= T$MAX_TD_SEC || ah * 3600 >= T$MAX_TD_SEC || ami * 60 >= T$MAX_TD_SEC || as >= T$MAX_TD_SEC) return false;
  if (h === 0 && mi === 0 && s === 0 && ms === 0 && us === 0 && ns === 0) return true;
  if (Math.abs(ms) / 1000 >= T$MAX_TD_SEC || Math.abs(us) / 1000000 >= T$MAX_TD_SEC || Math.abs(ns) / 1e9 >= T$MAX_TD_SEC) return false;
  const td = T$tdFromComponents(ah + ad * 24, ami, as, Math.abs(ms), Math.abs(us), Math.abs(ns));
  return td.sec < T$MAX_TD_SEC;
};
const T$durationSign = r => {
  const f = [ r.years, r.months, r.weeks, r.days, r.hours, r.minutes, r.seconds, r.milliseconds, r.microseconds, r.nanoseconds ];
  for (let i = 0; i < 10; i++) if (f[i] !== 0) return f[i] > 0 ? 1 : -1;
  return 0;
};
const T$defaultLargestUnit = r => {
  const f = [ r.years, r.months, r.weeks, r.days, r.hours, r.minutes, r.seconds, r.milliseconds, r.microseconds, r.nanoseconds ];
  for (let i = 0; i < 10; i++) if (f[i] !== 0) return T$UNITS[i];
  return 'nanosecond';
};
const T$toInternalDuration = r => ({ date: { years: r.years, months: r.months, weeks: r.weeks, days: r.days }, time: T$tdFromComponents(r.hours, r.minutes, r.seconds, r.milliseconds, r.microseconds, r.nanoseconds) });
const T$toInternalDurationWith24HourDays = r => {
  const td = T$tdAddDays(T$tdFromComponents(r.hours, r.minutes, r.seconds, r.milliseconds, r.microseconds, r.nanoseconds), r.days);
  return { date: { years: r.years, months: r.months, weeks: r.weeks, days: 0 }, time: td };
};
const T$toDateDurationWithoutTime = r => {
  const i = T$toInternalDurationWith24HourDays(r);
  const days = T$tdTruncDiv(i.time, 86400e9);
  return T$dateDuration(i.date.years, i.date.months, i.date.weeks, days);
};
const T$internalDurationSign = d => {
  const s = T$dateDurationSign(d.date);
  if (s !== 0) return s;
  return T$tdSign(d.time);
};
const T$temporalDurationFromInternal = (internal, largestUnit) => {
  let days = 0, hours = 0, minutes = 0, seconds = 0, ms = 0, us = 0, ns = 0;
  const td = internal.time;
  const sign = T$tdSign(td);
  const a = T$tdAbs(td);
  const li = T$unitIndex(largestUnit);
  if (li <= 6) {
    let sec = a.sec;
    ms = Math.floor(a.ns / 1000000);
    us = Math.floor(a.ns / 1000) % 1000;
    ns = a.ns % 1000;
    if (li <= 5) {
      minutes = Math.floor(sec / 60);
      sec -= minutes * 60;
      if (li <= 4) {
        hours = Math.floor(minutes / 60);
        minutes -= hours * 60;
        if (li <= 3) {
          days = Math.floor(hours / 24);
          hours -= days * 24;
        }
      }
    }
    seconds = sec;
  } else if (li === 7) {
    ms = T$tdTruncDiv(a, 1e6);
    us = Math.floor(a.ns / 1000) % 1000;
    ns = a.ns % 1000;
  } else if (li === 8) {
    us = T$tdTruncDiv(a, 1e3);
    ns = a.ns % 1000;
  } else {
    ns = T$tdTruncDiv(a, 1);
  }
  return T$createDurationRecord(internal.date.years, internal.date.months, internal.date.weeks, internal.date.days + days * sign,
    hours * sign, minutes * sign, seconds * sign, ms * sign, us * sign, ns * sign);
};
const T$createDurationRecord = (y, mo, w, d, h, mi, s, ms, us, ns) => {
  if (!T$isValidDuration(y, mo, w, d, h, mi, s, ms, us, ns)) throw new RangeError('duration out of range');
  return { years: y + 0, months: mo + 0, weeks: w + 0, days: d + 0, hours: h + 0, minutes: mi + 0, seconds: s + 0, milliseconds: ms + 0, microseconds: us + 0, nanoseconds: ns + 0 };
};
const T$ZERO_DURATION = T$createDurationRecord(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
const T$roundTimeDuration = (td, increment, unit, mode) => T$tdCheck(T$tdRoundToIncrement(td, T$unitTd(unit, increment), mode, false));

const T$differenceISODateTime = (dt1, dt2, calendar, largestUnit) => {
  let timeDuration = T$differenceTime(dt1.time, dt2.time);
  const timeSign = T$tdSign(timeDuration);
  const dateSign = T$compareISODate(dt1.date, dt2.date);
  let adjustedDate = dt2.date;
  if (timeSign === dateSign) {
    adjustedDate = T$addDaysToISODate(adjustedDate, timeSign);
    timeDuration = T$tdAddDays(timeDuration, -timeSign);
  }
  const dateLargestUnit = T$largerUnit('day', largestUnit);
  const dateDifference = T$calendarDateUntil(calendar, dt1.date, adjustedDate, dateLargestUnit);
  let days = dateDifference.days;
  if (largestUnit !== dateLargestUnit) {
    timeDuration = T$tdAddDays(timeDuration, days);
    days = 0;
  }
  return { date: T$adjustDateDuration(dateDifference, days), time: timeDuration };
};
const T$differencePlainDateTimeWithRounding = (dt1, dt2, calendar, largestUnit, increment, smallestUnit, mode) => {
  if (T$compareISODateTime(dt1, dt2) === 0) return { date: T$ZERO_DATE_DURATION, time: T$TD_ZERO };
  if (!T$isoDateTimeWithinLimits(dt1) || !T$isoDateTimeWithinLimits(dt2)) throw new RangeError('date-time out of range');
  const diff = T$differenceISODateTime(dt1, dt2, calendar, largestUnit);
  if (smallestUnit === 'nanosecond' && increment === 1) return diff;
  const dest = T$utcEpochNs(dt2);
  return T$roundRelativeDuration(diff, T$utcEpochNs(dt1), dest, dt1, undefined, calendar, largestUnit, increment, smallestUnit, mode);
};
const T$differencePlainDateTimeWithTotal = (dt1, dt2, calendar, unit) => {
  if (T$compareISODateTime(dt1, dt2) === 0) return 0;
  if (!T$isoDateTimeWithinLimits(dt1) || !T$isoDateTimeWithinLimits(dt2)) throw new RangeError('date-time out of range');
  const diff = T$differenceISODateTime(dt1, dt2, calendar, unit);
  if (unit === 'nanosecond') return T$tdTotal(diff.time, 1);
  const dest = T$utcEpochNs(dt2);
  return T$totalRelativeDuration(diff, T$utcEpochNs(dt1), dest, dt1, undefined, calendar, unit);
};
const T$differenceInstant = (ns1, ns2, increment, smallestUnit, mode) => {
  const td = T$roundTimeDuration(T$tdSub(ns2, ns1), increment, smallestUnit, mode);
  return { date: T$ZERO_DATE_DURATION, time: td };
};
const T$differenceZonedDateTime = (ns1, ns2, tz, calendar, largestUnit) => {
  if (T$tdCmp(ns1, ns2) === 0) return { date: T$ZERO_DATE_DURATION, time: T$TD_ZERO };
  const start = T$getISODateTimeFor(tz, ns1);
  const end = T$getISODateTimeFor(tz, ns2);
  if (T$compareISODate(start.date, end.date) === 0) return { date: T$ZERO_DATE_DURATION, time: T$tdSub(ns2, ns1) };
  const sign = T$tdCmp(ns2, ns1) < 0 ? -1 : 1;
  const maxDayCorrection = sign === 1 ? 2 : 1;
  let dayCorrection = 0;
  let timeDuration = T$differenceTime(start.time, end.time);
  if (T$tdSign(timeDuration) === -sign) dayCorrection++;
  let success = false, intermediateDate;
  while (dayCorrection <= maxDayCorrection && !success) {
    intermediateDate = T$addDaysToISODate(end.date, -dayCorrection * sign);
    const intermediateNs = T$getEpochNsFor(tz, T$dateTime(intermediateDate, start.time), 'compatible');
    timeDuration = T$tdSub(ns2, intermediateNs);
    if (sign !== -T$tdSign(timeDuration)) success = true;
    dayCorrection++;
  }
  const dateLargestUnit = T$largerUnit(largestUnit, 'day');
  const dateDifference = T$calendarDateUntil(calendar, start.date, intermediateDate, dateLargestUnit);
  return { date: dateDifference, time: timeDuration };
};
const T$differenceZonedDateTimeWithRounding = (ns1, ns2, tz, calendar, largestUnit, increment, smallestUnit, mode) => {
  if (!T$isDateUnit(largestUnit)) return T$differenceInstant(ns1, ns2, increment, smallestUnit, mode);
  const diff = T$differenceZonedDateTime(ns1, ns2, tz, calendar, largestUnit);
  if (smallestUnit === 'nanosecond' && increment === 1) return diff;
  const dt = T$getISODateTimeFor(tz, ns1);
  return T$roundRelativeDuration(diff, ns1, ns2, dt, tz, calendar, largestUnit, increment, smallestUnit, mode);
};
const T$differenceZonedDateTimeWithTotal = (ns1, ns2, tz, calendar, unit) => {
  if (!T$isDateUnit(unit)) return T$tdTotal(T$tdSub(ns2, ns1), T$unitNs(unit));
  const diff = T$differenceZonedDateTime(ns1, ns2, tz, calendar, unit);
  const dt = T$getISODateTimeFor(tz, ns1);
  return T$totalRelativeDuration(diff, ns1, ns2, dt, tz, calendar, unit);
};
const T$epochNsForDateTime = (tz, dt) => {
  if (tz === undefined) return T$utcEpochNs(dt);
  return T$getEpochNsFor(tz, dt, 'compatible');
};
const T$dateDurationWithUnit = (dd, unit, v) => {
  if (unit === 'year') return T$dateDuration(v, 0, 0, 0);
  if (unit === 'month') return T$adjustDateDuration(dd, 0, 0, v);
  if (unit === 'week') return T$adjustDateDuration(dd, 0, v);
  return T$adjustDateDuration(dd, v);
};
const T$computeNudgeWindow = (sign, duration, originEpochNs, dt, tz, calendar, increment, unit, shift) => {
  const dd = duration.date;
  let value = dd.days;
  if (unit === 'year') value = dd.years;
  else if (unit === 'month') value = dd.months;
  else if (unit === 'week') {
    const weeksStart = T$calendarDateAdd(calendar, dt.date, T$adjustDateDuration(dd, 0, 0), 'constrain');
    const weeksEnd = T$addDaysToISODate(weeksStart, dd.days);
    value = dd.weeks + T$calendarDateUntil(calendar, weeksStart, weeksEnd, 'week').weeks;
  }
  const r1 = T$roundNumberToIncrement(value, increment, 'trunc') + (shift ? increment * sign : 0);
  const r2 = r1 + increment * sign;
  const startDuration = T$dateDurationWithUnit(dd, unit, r1);
  const endDuration = T$dateDurationWithUnit(dd, unit, r2);
  const start = T$calendarDateAdd(calendar, dt.date, startDuration, 'constrain');
  const end = T$calendarDateAdd(calendar, dt.date, endDuration, 'constrain');
  const startDateTime = T$dateTime(start, dt.time);
  const endDateTime = T$dateTime(end, dt.time);
  // a zero start offset is the origin itself (it may be the second of two equal wall-clock times)
  const startEpochNs = T$dateDurationSign(startDuration) === 0 ? originEpochNs : T$epochNsForDateTime(tz, startDateTime);
  const endEpochNs = T$epochNsForDateTime(tz, endDateTime);
  return { r1, r2, startDuration, endDuration, startEpochNs, endEpochNs };
};
const T$inWindow = (sign, w, dest) => {
  if (sign === 1) return T$tdCmp(w.startEpochNs, dest) <= 0 && T$tdCmp(dest, w.endEpochNs) <= 0;
  return T$tdCmp(w.endEpochNs, dest) <= 0 && T$tdCmp(dest, w.startEpochNs) <= 0;
};
const T$nudgeToCalendarUnit = (sign, duration, originEpochNs, destEpochNs, dt, tz, calendar, increment, unit, mode) => {
  let didExpand = false;
  let w = T$computeNudgeWindow(sign, duration, originEpochNs, dt, tz, calendar, increment, unit, false);
  if (!T$inWindow(sign, w, destEpochNs)) {
    w = T$computeNudgeWindow(sign, duration, originEpochNs, dt, tz, calendar, increment, unit, true);
    if (!T$inWindow(sign, w, destEpochNs)) throw new RangeError('rounding out of range');
    didExpand = true;
  }
  const r1 = w.r1, startEpochNs = w.startEpochNs, endEpochNs = w.endEpochNs;
  const num = T$tdSub(destEpochNs, startEpochNs);
  const den = T$tdSub(endEpochNs, startEpochNs);
  const total = T$exactTotal(r1, num, den, increment, sign);
  let roundedUp;
  const cmpEnd = T$tdCmp(T$tdAbs(num), T$tdAbs(den));
  if (cmpEnd === 0) roundedUp = true;
  else if (T$tdSign(num) === 0) roundedUp = false;
  else {
    const umode = T$unsignedRoundingMode(mode, sign < 0);
    const twice = T$tdAbs(T$tdAdd(num, num));
    const cmpHalf = T$tdCmp(twice, T$tdAbs(den));
    const r1Even = T$fmod(Math.abs(r1) / increment, 2) === 0;
    roundedUp = T$applyUnsignedRounding(umode, cmpHalf, r1Even);
  }
  let resultDuration, nudgedEpochNs;
  if (roundedUp) {
    didExpand = true;
    resultDuration = w.endDuration;
    nudgedEpochNs = endEpochNs;
  } else {
    resultDuration = w.startDuration;
    nudgedEpochNs = startEpochNs;
  }
  return { nudge: { duration: { date: resultDuration, time: T$TD_ZERO }, nudgedEpochNs, didExpand }, total };
};
const T$tdMulSmall = (a, k) => T$td(a.sec * k, a.ns * k);
// |num| <= |den|
const T$exactTotal = (r1, num, den, increment, sign) => {
  let n = T$tdMulSmall(T$tdAbs(num), increment);
  const d = T$tdAbs(den);
  let q = Math.floor(T$tdRatio(n, d));
  let r = T$tdSub(n, T$tdMulSmall(d, q));
  while (T$tdSign(r) < 0) {
    q--;
    r = T$tdAdd(r, d);
  }
  while (T$tdCmp(r, d) >= 0) {
    q++;
    r = T$tdSub(r, d);
  }
  let frac = '';
  for (let i = 0; i < 22 && T$tdSign(r) !== 0; i++) {
    r = T$tdMulSmall(r, 10);
    let digit = 0;
    while (T$tdCmp(r, d) >= 0) {
      r = T$tdSub(r, d);
      digit++;
    }
    frac += String(digit);
  }
  const whole = Math.abs(r1) + q;
  const str = (sign < 0 && (whole !== 0 || frac !== '') ? '-' : '') + String(whole) + (frac !== '' ? '.' + frac : '');
  return Number(str) + 0;
};
const T$tdRatio = (num, den) => {
  if (num.ns === 0 && den.ns === 0) return num.sec / den.sec;
  return Number(T$tdToDecimal(num, 1)) / Number(T$tdToDecimal(den, 1));
};
const T$nudgeToZonedTime = (sign, duration, dt, tz, calendar, increment, unit, mode) => {
  const start = T$calendarDateAdd(calendar, dt.date, duration.date, 'constrain');
  const startDateTime = T$dateTime(start, dt.time);
  const endDate = T$addDaysToISODate(start, sign);
  const endDateTime = T$dateTime(endDate, dt.time);
  const startEpochNs = T$getEpochNsFor(tz, startDateTime, 'compatible');
  const endEpochNs = T$getEpochNsFor(tz, endDateTime, 'compatible');
  const daySpan = T$tdSub(endEpochNs, startEpochNs);
  const incTd = T$unitTd(unit, increment);
  let rounded = T$tdCheck(T$tdRoundToIncrement(duration.time, incTd, mode, false));
  const beyondDaySpan = T$tdSub(rounded, daySpan);
  let didRoundBeyondDay, dayDelta, nudgedEpochNs;
  if (T$tdSign(beyondDaySpan) !== -sign) {
    didRoundBeyondDay = true;
    dayDelta = sign;
    rounded = T$tdCheck(T$tdRoundToIncrement(beyondDaySpan, incTd, mode, false));
    nudgedEpochNs = T$tdAdd(endEpochNs, rounded);
  } else {
    didRoundBeyondDay = false;
    dayDelta = 0;
    nudgedEpochNs = T$tdAdd(startEpochNs, rounded);
  }
  const dateDuration = T$adjustDateDuration(duration.date, duration.date.days + dayDelta);
  return { duration: { date: dateDuration, time: rounded }, nudgedEpochNs, didExpand: didRoundBeyondDay };
};
const T$nudgeToDayOrTime = (duration, destEpochNs, largestUnit, increment, smallestUnit, mode) => {
  const timeDuration = T$tdCheck(T$tdAddDays(duration.time, duration.date.days));
  const rounded = T$tdCheck(T$tdRoundToIncrement(timeDuration, T$unitTd(smallestUnit, increment), mode, false));
  const diffTime = T$tdSub(rounded, timeDuration);
  const wholeDays = T$tdTruncDiv(timeDuration, 86400e9);
  const roundedWholeDays = T$tdTruncDiv(rounded, 86400e9);
  const dayDelta = roundedWholeDays - wholeDays;
  const dayDeltaSign = dayDelta < 0 ? -1 : (dayDelta > 0 ? 1 : 0);
  const didExpandDays = dayDeltaSign === T$tdSign(timeDuration);
  const nudgedEpochNs = T$tdAdd(destEpochNs, diffTime);
  let days = 0, remainder = rounded;
  if (T$isDateUnit(largestUnit)) {
    days = roundedWholeDays;
    remainder = T$tdAddDays(rounded, -roundedWholeDays);
  }
  const dateDuration = T$adjustDateDuration(duration.date, days);
  return { duration: { date: dateDuration, time: remainder }, nudgedEpochNs, didExpand: didExpandDays };
};
const T$bubbleRelativeDuration = (sign, duration, nudgedEpochNs, dt, tz, calendar, largestUnit, smallestUnit) => {
  if (smallestUnit === largestUnit) return duration;
  const largestIndex = T$unitIndex(largestUnit);
  const smallestIndex = T$unitIndex(smallestUnit);
  let unitIndex = smallestIndex - 1;
  let done = false;
  while (unitIndex >= largestIndex && !done) {
    const unit = T$UNITS[unitIndex];
    if (unit !== 'week' || largestUnit === 'week') {
      let endDuration;
      const dd = duration.date;
      if (unit === 'year') endDuration = T$dateDuration(dd.years + sign, 0, 0, 0);
      else if (unit === 'month') endDuration = T$adjustDateDuration(dd, 0, 0, dd.months + sign);
      else endDuration = T$adjustDateDuration(dd, 0, dd.weeks + sign);
      const end = T$calendarDateAdd(calendar, dt.date, endDuration, 'constrain');
      const endDateTime = T$dateTime(end, dt.time);
      const endEpochNs = T$epochNsForDateTime(tz, endDateTime);
      const beyondEnd = T$tdSub(nudgedEpochNs, endEpochNs);
      const beyondEndSign = T$tdSign(beyondEnd);
      if (beyondEndSign !== -sign) duration = { date: endDuration, time: T$TD_ZERO };
      else done = true;
    }
    unitIndex--;
  }
  return duration;
};
const T$roundRelativeDuration = (duration, originEpochNs, destEpochNs, dt, tz, calendar, largestUnit, increment, smallestUnit, mode) => {
  let irregular = T$isCalendarUnit(smallestUnit);
  if (tz !== undefined && smallestUnit === 'day') irregular = true;
  const sign = T$internalDurationSign(duration) < 0 ? -1 : 1;
  let nudge;
  if (irregular) nudge = T$nudgeToCalendarUnit(sign, duration, originEpochNs, destEpochNs, dt, tz, calendar, increment, smallestUnit, mode).nudge;
  else if (tz !== undefined) nudge = T$nudgeToZonedTime(sign, duration, dt, tz, calendar, increment, smallestUnit, mode);
  else nudge = T$nudgeToDayOrTime(duration, destEpochNs, largestUnit, increment, smallestUnit, mode);
  duration = nudge.duration;
  if (nudge.didExpand && smallestUnit !== 'week') {
    const startUnit = T$largerUnit(smallestUnit, 'day');
    duration = T$bubbleRelativeDuration(sign, duration, nudge.nudgedEpochNs, dt, tz, calendar, largestUnit, startUnit);
  }
  return duration;
};
const T$totalRelativeDuration = (duration, originEpochNs, destEpochNs, dt, tz, calendar, unit) => {
  if (T$isCalendarUnit(unit) || (tz !== undefined && unit === 'day')) {
    const sign = T$internalDurationSign(duration) < 0 ? -1 : 1;
    return T$nudgeToCalendarUnit(sign, duration, originEpochNs, destEpochNs, dt, tz, calendar, 1, unit, 'trunc').total;
  }
  const td = T$tdAddDays(duration.time, duration.date.days);
  return T$tdTotal(td, T$unitNs(unit));
};

const T$addInstant = (en, td) => T$checkEpochNs(T$tdAdd(en, td));
const T$addZonedDateTime = (en, tz, calendar, duration, overflow) => {
  if (T$dateDurationSign(duration.date) === 0) return T$addInstant(en, duration.time);
  const dt = T$getISODateTimeFor(tz, en);
  const addedDate = T$calendarDateAdd(calendar, dt.date, duration.date, overflow);
  const inter = T$dateTime(addedDate, dt.time);
  if (!T$isoDateTimeWithinLimits(inter)) throw new RangeError('date-time out of range');
  const interNs = T$getEpochNsFor(tz, inter, 'compatible');
  return T$addInstant(interNs, duration.time);
};
const T$roundTime = (t, increment, unit, mode) => {
  let quantity;
  if (unit === 'day' || unit === 'hour') quantity = ((((t.hour * 60 + t.minute) * 60 + t.second) * 1000 + t.millisecond) * 1000 + t.microsecond) * 1000 + t.nanosecond;
  else if (unit === 'minute') quantity = (((t.minute * 60 + t.second) * 1000 + t.millisecond) * 1000 + t.microsecond) * 1000 + t.nanosecond;
  else if (unit === 'second') quantity = ((t.second * 1000 + t.millisecond) * 1000 + t.microsecond) * 1000 + t.nanosecond;
  else if (unit === 'millisecond') quantity = (t.millisecond * 1000 + t.microsecond) * 1000 + t.nanosecond;
  else if (unit === 'microsecond') quantity = t.microsecond * 1000 + t.nanosecond;
  else quantity = t.nanosecond;
  const unitLength = T$unitNs(unit);
  const result = T$roundNumberToIncrement(quantity, increment * unitLength, mode) / unitLength;
  let r;
  if (unit === 'day') {
    r = T$time(0, 0, 0, 0, 0, 0);
    r.days = result;
    return r;
  }
  if (unit === 'hour') return T$balanceTime(result, 0, 0, 0, 0, 0);
  if (unit === 'minute') return T$balanceTime(t.hour, result, 0, 0, 0, 0);
  if (unit === 'second') return T$balanceTime(t.hour, t.minute, result, 0, 0, 0);
  if (unit === 'millisecond') return T$balanceTime(t.hour, t.minute, t.second, result, 0, 0);
  if (unit === 'microsecond') return T$balanceTime(t.hour, t.minute, t.second, t.millisecond, result, 0);
  return T$balanceTime(t.hour, t.minute, t.second, t.millisecond, t.microsecond, result);
};
const T$stripDays = t => T$time(t.hour, t.minute, t.second, t.millisecond, t.microsecond, t.nanosecond);
const T$roundISODateTime = (dt, increment, unit, mode) => {
  const rt = T$roundTime(dt.time, increment, unit, mode);
  const date = T$addDaysToISODate(dt.date, rt.days);
  return T$dateTime(date, T$stripDays(rt));
};
const T$roundTemporalInstant = (en, increment, unit, mode) => T$tdRoundToIncrement(en, T$unitTd(unit, increment), mode, true);

const T$interpretTemporalDateTimeFields = (calendar, fields, overflow) => {
  const date = T$calendarDateFromFields(calendar, fields, overflow);
  const time = T$regulateTime(fields.hour, fields.minute, fields.second, fields.millisecond, fields.microsecond, fields.nanosecond, overflow);
  return T$dateTime(date, time);
};
const T$interpretISODateTimeOffset = (date, time, offsetBehaviour, offsetNs, tz, disambiguation, offsetOption, matchBehaviour) => {
  if (time === undefined) return T$getStartOfDay(tz, date);
  const dt = T$dateTime(date, time);
  if (offsetBehaviour === 'wall' || (offsetBehaviour === 'option' && offsetOption === 'ignore')) return T$getEpochNsFor(tz, dt, disambiguation);
  if (offsetBehaviour === 'exact' || (offsetBehaviour === 'option' && offsetOption === 'use')) {
    const bal = T$balanceISODateTimeWithOffset(dt, -offsetNs);
    T$checkISODaysRange(bal.date);
    return T$checkEpochNs(T$utcEpochNs(bal));
  }
  T$checkISODaysRange(date);
  const utc = T$utcEpochNs(dt);
  const possible = T$getPossibleEpochNs(tz, dt);
  for (let i = 0; i < possible.length; i++) {
    const candidate = possible[i];
    const diff = T$tdSub(utc, candidate);
    const candidateOffset = diff.sec * 1e9 + diff.ns;
    if (candidateOffset === offsetNs) return candidate;
    if (matchBehaviour === 'match-minutes') {
      if (T$roundNumberToIncrement(candidateOffset, 60e9, 'halfExpand') === offsetNs) return candidate;
    }
  }
  if (offsetOption === 'reject') throw new RangeError('offset does not match time zone');
  return T$disambiguate(possible, tz, dt, disambiguation);
};
const T$toTemporalInstant = item => {
  if (T$isObject(item)) {
    const sl = T$slotsOf(item);
    if (sl !== undefined && (sl.brand === T$B_INSTANT || sl.brand === T$B_ZDT)) return T$createInstant(sl.epochNs);
    item = T$toPrimitive(item, 'string');
  }
  if (typeof item !== 'string') throw new TypeError('cannot convert to Temporal.Instant');
  const r = T$parseISODateTime(item, 'instant');
  const offsetNs = r.z ? 0 : r.offset.ns;
  const bal = T$balanceISODateTimeWithOffset(T$dateTime(T$isoDate(r.year, r.month, r.day), r.time), -offsetNs);
  T$checkISODaysRange(bal.date);
  return T$createInstant(T$checkEpochNs(T$utcEpochNs(bal)));
};
const T$toTemporalDate = (item, options) => {
  if (T$isObject(item)) {
    const sl = T$slotsOf(item);
    if (sl !== undefined && (sl.brand === T$B_DATE || sl.brand === T$B_ZDT || sl.brand === T$B_DATETIME)) {
      T$getOverflowOption(T$getOptionsObject(options));
      return T$createPlainDate(T$slotDateTime(sl).date, sl.calendar);
    }
    const calendar = T$getCalendarWithISODefault(item);
    const fields = T$prepareCalendarFields(calendar, item, [ 'year', 'month', 'monthCode', 'day' ], [], []);
    const overflow = T$getOverflowOption(T$getOptionsObject(options));
    return T$createPlainDate(T$calendarDateFromFields(calendar, fields, overflow), calendar);
  }
  if (typeof item !== 'string') throw new TypeError('cannot convert to Temporal.PlainDate');
  const r = T$parseISODateTime(item, 'datetime');
  const calendar = T$canonicalizeCalendar(r.calendar === undefined ? 'iso8601' : r.calendar);
  T$getOverflowOption(T$getOptionsObject(options));
  return T$createPlainDate(T$isoDate(r.year, r.month, r.day), calendar);
};
const T$toTemporalDateTime = (item, options) => {
  if (T$isObject(item)) {
    const sl = T$slotsOf(item);
    if (sl !== undefined && (sl.brand === T$B_DATETIME || sl.brand === T$B_ZDT || sl.brand === T$B_DATE)) {
      T$getOverflowOption(T$getOptionsObject(options));
      return T$createPlainDateTime(sl.brand === T$B_DATE ? T$dateTime(sl.date, T$MIDNIGHT) : T$slotDateTime(sl), sl.calendar);
    }
    const calendar = T$getCalendarWithISODefault(item);
    const fields = T$prepareCalendarFields(calendar, item, [ 'year', 'month', 'monthCode', 'day' ], T$TIME_FIELDS, []);
    const overflow = T$getOverflowOption(T$getOptionsObject(options));
    return T$createPlainDateTime(T$interpretTemporalDateTimeFields(calendar, fields, overflow), calendar);
  }
  if (typeof item !== 'string') throw new TypeError('cannot convert to Temporal.PlainDateTime');
  const r = T$parseISODateTime(item, 'datetime');
  const calendar = T$canonicalizeCalendar(r.calendar === undefined ? 'iso8601' : r.calendar);
  T$getOverflowOption(T$getOptionsObject(options));
  return T$createPlainDateTime(T$dateTime(T$isoDate(r.year, r.month, r.day), r.time === undefined ? T$MIDNIGHT : r.time), calendar);
};
const T$toTemporalTime = (item, options) => {
  let time;
  if (T$isObject(item)) {
    const sl = T$slotsOf(item);
    if (sl !== undefined && (sl.brand === T$B_TIME || sl.brand === T$B_DATETIME || sl.brand === T$B_ZDT)) {
      T$getOverflowOption(T$getOptionsObject(options));
      return T$createPlainTime(T$slotDateTime(sl).time);
    }
    const r = T$toTemporalTimeRecord(item, false);
    const overflow = T$getOverflowOption(T$getOptionsObject(options));
    time = T$regulateTime(r.hour, r.minute, r.second, r.millisecond, r.microsecond, r.nanosecond, overflow);
  } else {
    if (typeof item !== 'string') throw new TypeError('cannot convert to Temporal.PlainTime');
    const r = T$parseISODateTime(item, 'time');
    T$getOverflowOption(T$getOptionsObject(options));
    time = r.time;
  }
  return T$createPlainTime(time);
};
const T$toTimeRecordOrMidnight = item => {
  if (item === undefined) return T$MIDNIGHT;
  return T$get(T$toTemporalTime(item), T$B_TIME, 'time').time;
};
const T$toTemporalYearMonth = (item, options) => {
  if (T$isObject(item)) {
    const sl = T$slotsOf(item);
    if (sl !== undefined && sl.brand === T$B_YM) {
      T$getOverflowOption(T$getOptionsObject(options));
      return T$createPlainYearMonth(sl.date, sl.calendar);
    }
    const calendar = T$getCalendarWithISODefault(item);
    const fields = T$prepareCalendarFields(calendar, item, [ 'year', 'month', 'monthCode' ], [], []);
    const overflow = T$getOverflowOption(T$getOptionsObject(options));
    return T$createPlainYearMonth(T$calendarYearMonthFromFields(calendar, fields, overflow), calendar);
  }
  if (typeof item !== 'string') throw new TypeError('cannot convert to Temporal.PlainYearMonth');
  const r = T$parseISODateTime(item, 'yearmonth');
  const calendar = T$canonicalizeCalendar(r.calendar === undefined ? 'iso8601' : r.calendar);
  T$getOverflowOption(T$getOptionsObject(options));
  const date = T$isoDate(r.year, r.month, r.day === undefined ? 1 : r.day);
  if (!T$isoYearMonthWithinLimits(date)) throw new RangeError('year-month out of range');
  const fields = T$isoDateToFields(calendar, date, 'year-month');
  return T$createPlainYearMonth(T$calendarYearMonthFromFields(calendar, fields, 'constrain'), calendar);
};
const T$toTemporalMonthDay = (item, options) => {
  if (T$isObject(item)) {
    const sl = T$slotsOf(item);
    if (sl !== undefined && sl.brand === T$B_MD) {
      T$getOverflowOption(T$getOptionsObject(options));
      return T$createPlainMonthDay(sl.date, sl.calendar);
    }
    const calendar = T$getCalendarWithISODefault(item);
    const fields = T$prepareCalendarFields(calendar, item, [ 'year', 'month', 'monthCode', 'day' ], [], []);
    const overflow = T$getOverflowOption(T$getOptionsObject(options));
    return T$createPlainMonthDay(T$calendarMonthDayFromFields(calendar, fields, overflow), calendar);
  }
  if (typeof item !== 'string') throw new TypeError('cannot convert to Temporal.PlainMonthDay');
  const r = T$parseISODateTime(item, 'monthday');
  const calendar = T$canonicalizeCalendar(r.calendar === undefined ? 'iso8601' : r.calendar);
  T$getOverflowOption(T$getOptionsObject(options));
  if (calendar === 'iso8601') return T$createPlainMonthDay(T$isoDate(1972, r.month, r.day), calendar);
  const date = T$isoDate(r.year, r.month, r.day);
  if (!T$isoDateWithinLimits(date)) throw new RangeError('date out of range');
  const fields = T$isoDateToFields(calendar, date, 'month-day');
  return T$createPlainMonthDay(T$calendarMonthDayFromFields(calendar, fields, 'constrain'), calendar);
};
const T$zonedRecordFromFields = (item, required) => {
  const calendar = T$getCalendarWithISODefault(item);
  const fields = T$prepareCalendarFields(calendar, item, [ 'year', 'month', 'monthCode', 'day' ], T$TIME_FIELDS.concat([ 'offset', 'timeZone' ]), required);
  return { calendar, fields, dt: undefined, tz: fields.timeZone, offsetString: fields.offset, offsetBehaviour: fields.offset === undefined ? 'wall' : 'option', matchBehaviour: 'match-exactly' };
};
const T$zonedRecordFromString = (s, goal) => {
  const r = T$parseISODateTime(s, goal);
  const p = { calendar: undefined, fields: undefined, dt: T$dateTime(T$isoDate(r.year, r.month, r.day), r.time), tz: undefined, offsetString: r.offset === undefined ? undefined : r.offset.str, offsetBehaviour: 'option', matchBehaviour: 'match-exactly' };
  if (r.tz !== undefined) {
    p.tz = T$toTemporalTimeZoneIdentifier(r.tz);
    if (r.z) p.offsetBehaviour = 'exact';
    else if (p.offsetString === undefined) p.offsetBehaviour = 'wall';
    // an offset with seconds must match exactly
    if (r.offset === undefined || !r.offset.subMinute) p.matchBehaviour = 'match-minutes';
  }
  p.calendar = T$canonicalizeCalendar(r.calendar === undefined ? 'iso8601' : r.calendar);
  return p;
};
const T$zonedRecordEpochNs = (p, disambiguation, offsetOption) => {
  const offsetNs = p.offsetBehaviour === 'option' ? T$parseDateTimeUTCOffset(p.offsetString) : 0;
  return T$interpretISODateTimeOffset(p.dt.date, p.dt.time, p.offsetBehaviour, offsetNs, p.tz, disambiguation, offsetOption, p.matchBehaviour);
};
const T$toTemporalZonedDateTime = (item, options) => {
  let p;
  if (T$isObject(item)) {
    const sl = T$slotsOf(item);
    if (sl !== undefined && sl.brand === T$B_ZDT) {
      const o = T$getOptionsObject(options);
      T$getDisambiguationOption(o);
      T$getOffsetOption(o, 'reject');
      T$getOverflowOption(o);
      return T$createZonedDateTime(sl.epochNs, sl.timeZone, sl.calendar);
    }
    p = T$zonedRecordFromFields(item, [ 'timeZone' ]);
  } else {
    if (typeof item !== 'string') throw new TypeError('cannot convert to Temporal.ZonedDateTime');
    p = T$zonedRecordFromString(item, 'zoned');
  }
  const o = T$getOptionsObject(options);
  const disambiguation = T$getDisambiguationOption(o);
  const offsetOption = T$getOffsetOption(o, 'reject');
  const overflow = T$getOverflowOption(o);
  if (p.fields !== undefined) p.dt = T$interpretTemporalDateTimeFields(p.calendar, p.fields, overflow);
  return T$createZonedDateTime(T$zonedRecordEpochNs(p, disambiguation, offsetOption), p.tz, p.calendar);
};
const T$toTemporalDuration = item => {
  if (T$isObject(item)) {
    const sl = T$slotsOf(item);
    if (sl !== undefined && sl.brand === T$B_DURATION) return T$createDuration(sl.d);
    return T$createDuration(T$toPartialDuration(item, null));
  }
  if (typeof item !== 'string') throw new TypeError('cannot convert to Temporal.Duration');
  const v = T$parseDurationString(item);
  return T$createDuration(T$createDurationRecord(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9]));
};
const T$toDurationRecord = (item, negate) => {
  const d = T$get(T$toTemporalDuration(item), T$B_DURATION, 'duration').d;
  return negate ? T$negateDurationRecord(d) : d;
};
const T$DURATION_FIELDS_SORTED = [ 'days', 'hours', 'microseconds', 'milliseconds', 'minutes', 'months', 'nanoseconds', 'seconds', 'weeks', 'years' ];
const T$toPartialDuration = (item, base) => {
  if (!T$isObject(item)) throw new TypeError('duration-like must be an object');
  const r = {};
  let any = false;
  for (let i = 0; i < 10; i++) {
    const k = T$DURATION_FIELDS_SORTED[i];
    const v = item[k];
    if (v !== undefined) {
      any = true;
      r[k] = T$toIntegerIfIntegral(v);
    }
  }
  if (!any) throw new TypeError('no duration properties present');
  const src = base === null ? T$ZERO_DURATION : base;
  const f = [ 'years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds' ];
  const vals = [];
  for (let i = 0; i < 10; i++) vals.push(r[f[i]] !== undefined ? r[f[i]] : src[f[i]]);
  return T$createDurationRecord(vals[0], vals[1], vals[2], vals[3], vals[4], vals[5], vals[6], vals[7], vals[8], vals[9]);
};
const T$getRelativeTo = options => {
  const value = options.relativeTo;
  if (value === undefined) return { plain: undefined, zoned: undefined };
  let p;
  if (T$isObject(value)) {
    const sl = T$slotsOf(value);
    if (sl !== undefined) {
      if (sl.brand === T$B_ZDT) return { plain: undefined, zoned: value };
      if (sl.brand === T$B_DATE) return { plain: value, zoned: undefined };
      if (sl.brand === T$B_DATETIME) return { plain: T$createPlainDate(sl.dateTime.date, sl.calendar), zoned: undefined };
    }
    p = T$zonedRecordFromFields(value, []);
    p.dt = T$interpretTemporalDateTimeFields(p.calendar, p.fields, 'constrain');
  } else {
    if (typeof value !== 'string') throw new TypeError('invalid relativeTo');
    p = T$zonedRecordFromString(value, 'relative');
  }
  if (p.tz === undefined) return { plain: T$createPlainDate(p.dt.date, p.calendar), zoned: undefined };
  return { plain: undefined, zoned: T$createZonedDateTime(T$zonedRecordEpochNs(p, 'compatible', 'reject'), p.tz, p.calendar) };
};

const T$calKind = cal => {
  switch (cal) {
    case 'gregory': case 'japanese': case 'roc': case 'buddhist': return 1;
    case 'coptic': case 'ethiopic': case 'ethioaa': return 2;
    case 'indian': return 3;
    case 'persian': return 4;
    case 'islamic-civil': case 'islamic-tbla': return 5;
    case 'islamic-umalqura': return 6;
    case 'hebrew': return 7;
    case 'chinese': case 'dangi': return 8;
  }
  return 0;
};
const T$gregOffset = cal => {
  if (cal === 'roc') return -1911;
  if (cal === 'buddhist') return 543;
  return 0;
};
const T$copticEpoch = cal => cal === 'coptic' ? -615558 : -716367;
const T$copticYearOffset = cal => cal === 'ethioaa' ? 5500 : 0;
const T$ISLAMIC_CIVIL_EPOCH = -492148;
const T$HEBREW_EPOCH = -2092590;
const T$PERSIAN_EPOCH = -492268;

const T$B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const T$b64At = (s, i) => T$B64.indexOf(s[i]);
let T$UQ = null, T$CH = {};
const T$umalqura = () => {
  if (T$UQ !== null) return T$UQ;
  const starts = [], bits = [];
  let st = T$UQ_START;
  for (let i = 0; i < T$UQ_DATA.length / 2; i++) {
    const b = T$b64At(T$UQ_DATA, i * 2) * 64 + T$b64At(T$UQ_DATA, i * 2 + 1);
    starts.push(st);
    bits.push(b);
    for (let m = 0; m < 12; m++) st += (b >> m) & 1 ? 30 : 29;
  }
  starts.push(st);
  T$UQ = { starts, bits };
  return T$UQ;
};
const T$chineseTable = cal => {
  let t = T$CH[cal];
  if (t !== undefined) return t;
  const data = cal === 'chinese' ? T$CHINESE_DATA : T$DANGI_DATA;
  const starts = [], leaps = [], bits = [];
  let st = cal === 'chinese' ? T$CHINESE_START : T$DANGI_START;
  for (let i = 0; i < data.length / 3; i++) {
    const v = T$b64At(data, i * 3) * 4096 + T$b64At(data, i * 3 + 1) * 64 + T$b64At(data, i * 3 + 2);
    const leap = v >> 13, b = v & 8191;
    starts.push(st);
    leaps.push(leap);
    bits.push(b);
    const n = leap === 0 ? 12 : 13;
    for (let m = 0; m < n; m++) st += (b >> m) & 1 ? 30 : 29;
  }
  starts.push(st);
  t = { starts, leaps, bits, y0: 1900 };
  T$CH[cal] = t;
  return t;
};
// cached, callers must not mutate it
const T$CHY = new Map();
const T$chYearInfo = (cal, y) => {
  const key = cal + y;
  let r = T$CHY.get(key);
  if (r === undefined) {
    r = T$chYearInfoUncached(cal, y);
    T$CHY.set(key, r);
  }
  return r;
};
const T$chYearInfoUncached = (cal, y) => {
  const t = T$chineseTable(cal);
  const i = y - t.y0;
  if (i >= 0 && i < t.leaps.length) {
    const n = t.leaps[i] === 0 ? 12 : 13, lens = [];
    for (let m = 0; m < n; m++) lens.push((t.bits[i] >> m) & 1 ? 30 : 29);
    return { start: t.starts[i], months: n, leap: t.leaps[i], lens };
  }
  // outside the data: mean solar terms and lunations (as icu4x)
  const offset = i < 0 ? 27940000 : (cal === 'chinese' ? 28800000 : 32400000);
  return T$chSimpleYear(offset, y);
};
const T$DAY_MS = 86400000;
const T$MEAN_YEAR_MS = 31556952000, T$MEAN_TERM_MS = 2629746000, T$MEAN_SYNODIC_MS = 2551442876;
// moments as ms since epoch day 0 (local)
const T$periodicOnOrBefore = (ed, base, period) => {
  const diff = ed * T$DAY_MS - base;
  const n = Math.floor((diff + T$DAY_MS - 1) / period);
  return base + n * period;
};
const T$msDay = ms => Math.floor(ms / T$DAY_MS);
const T$chSimpleYear = (offset, y) => {
  // 1999-12-22T07:44 solstice, 2000-01-06T18:14 new moon (utc)
  const solstice = 10947 * T$DAY_MS + 27840000 + offset;
  const newMoon0 = 10962 * T$DAY_MS + 65640000 + offset;
  let major = T$periodicOnOrBefore(T$epochDays(y - 1, 12, 31), solstice, T$MEAN_YEAR_MS);
  let newMoon = T$periodicOnOrBefore(T$msDay(major), newMoon0, T$MEAN_SYNODIC_MS);
  let next = newMoon + T$MEAN_SYNODIC_MS;
  let term = -2, hadLeap = false;
  while (term < 0 || (T$msDay(next) <= T$msDay(major) && !hadLeap)) {
    if (T$msDay(next) <= T$msDay(major) && !hadLeap) hadLeap = true;
    else {
      term++;
      major += T$MEAN_TERM_MS;
    }
    newMoon = next;
    next += T$MEAN_SYNODIC_MS;
  }
  const start = T$msDay(newMoon);
  const lens = [];
  let leap = 0;
  while (term < 12 || (T$msDay(next) <= T$msDay(major) && !hadLeap)) {
    lens.push(T$msDay(next) - T$msDay(newMoon));
    if (T$msDay(next) <= T$msDay(major) && !hadLeap) {
      hadLeap = true;
      leap = term + 1;
    } else {
      term++;
      major += T$MEAN_TERM_MS;
    }
    newMoon = next;
    next += T$MEAN_SYNODIC_MS;
  }
  return { start, months: lens.length, leap, lens };
};
const T$chYearOf = (cal, ed) => {
  const t = T$chineseTable(cal);
  const n = t.leaps.length;
  if (ed >= t.starts[0] && ed < t.starts[n]) {
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (t.starts[mid] <= ed) lo = mid;
      else hi = mid - 1;
    }
    return t.y0 + lo;
  }
  let y = T$epochDaysToDate(ed).year;
  while (T$chYearInfo(cal, y).start > ed) y--;
  while (T$chYearInfo(cal, y + 1).start <= ed) y++;
  return y;
};
const T$hebElapsed = y => {
  const m = Math.floor((235 * y - 234) / 19);
  const parts = 12084 + 13753 * m;
  let d = 29 * m + Math.floor(parts / 25920);
  if (T$fmod(3 * (d + 1), 7) < 3) d++;
  return d;
};
const T$HEB_NY = new Map();
const T$hebNewYear = y => {
  const cached = T$HEB_NY.get(y);
  if (cached !== undefined) return cached;
  const ny0 = T$hebElapsed(y - 1), ny1 = T$hebElapsed(y), ny2 = T$hebElapsed(y + 1);
  let c = 0;
  if (ny2 - ny1 === 356) c = 2;
  else if (ny1 - ny0 === 382) c = 1;
  const r = T$HEBREW_EPOCH + ny1 + c;
  T$HEB_NY.set(y, r);
  return r;
};
const T$hebLeap = y => T$fmod(7 * y + 1, 19) < 7;
const T$hebMonthLens = y => {
  const len = T$hebNewYear(y + 1) - T$hebNewYear(y);
  const heshvan = len % 10 === 5 ? 30 : 29, kislev = len % 10 === 3 ? 29 : 30;
  if (T$hebLeap(y)) return [ 30, heshvan, kislev, 29, 30, 30, 29, 30, 29, 30, 29, 30, 29 ];
  return [ 30, heshvan, kislev, 29, 30, 29, 30, 29, 30, 29, 30, 29 ];
};
const T$islamicToDays = (epoch, y, m, d) => d + 29 * (m - 1) + Math.floor((6 * m - 1) / 11) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + epoch - 1;
const T$islamicEpoch = cal => cal === 'islamic-tbla' ? T$ISLAMIC_CIVIL_EPOCH - 1 : T$ISLAMIC_CIVIL_EPOCH;
// years where the 33-year rule wrongly gives a leap year (astronomical corrections, 1178-3000 AP)
const T$PERSIAN_NON_LEAP = [ 1502, 1601, 1634, 1667, 1700, 1733, 1766, 1799, 1832, 1865, 1898, 1931, 1964, 1997, 2030, 2059, 2063, 2096, 2129, 2158, 2162, 2191, 2195, 2224, 2228, 2257, 2261, 2290, 2294, 2323, 2327, 2356, 2360, 2389, 2393, 2422, 2426, 2455, 2459, 2488, 2492, 2521, 2525, 2554, 2558, 2587, 2591, 2620, 2624, 2653, 2657, 2686, 2690, 2719, 2723, 2748, 2752, 2756, 2781, 2785, 2789, 2818, 2822, 2847, 2851, 2855, 2880, 2884, 2888, 2913, 2917, 2921, 2946, 2950, 2954, 2979, 2983, 2987 ];
const T$persianNewYear = y => {
  let d = T$PERSIAN_EPOCH + 365 * (y - 1) + Math.floor((8 * y + 21) / 33);
  if (y > 1502 && y <= 2988 && T$PERSIAN_NON_LEAP.indexOf(y - 1) >= 0) d--;
  return d;
};
const T$indianStart = y => {
  const g = y + 78;
  return T$epochDays(g, 3, T$isLeapYear(g) ? 21 : 22);
};

// month is ordinal
const T$calMonthsInYear = (cal, y) => {
  const k = T$calKind(cal);
  if (k === 2) return 13;
  if (k === 7) return T$hebLeap(y) ? 13 : 12;
  if (k === 8) return T$chYearInfo(cal, y).months;
  return 12;
};
const T$calDaysInMonth = (cal, y, m) => {
  switch (T$calKind(cal)) {
    case 1: return T$daysInMonth(y - T$gregOffset(cal), m);
    case 2: {
      if (m <= 12) return 30;
      return T$fmod(y - T$copticYearOffset(cal), 4) === 3 ? 6 : 5;
    }
    case 3: return m === 1 ? (T$isLeapYear(y + 78) ? 31 : 30) : (m <= 6 ? 31 : 30);
    case 4: return m <= 6 ? 31 : (m <= 11 ? 30 : (T$persianNewYear(y + 1) - T$persianNewYear(y) === 366 ? 30 : 29));
    case 6: {
      if (y >= 1300 && y <= 1600) return (T$umalqura().bits[y - 1300] >> (m - 1)) & 1 ? 30 : 29;
    }
    case 5: {
      if (m === 12) return T$fmod(14 + 11 * y, 30) < 11 ? 30 : 29;
      return m % 2 === 1 ? 30 : 29;
    }
    case 7: return T$hebMonthLens(y)[m - 1];
    case 8: return T$chYearInfo(cal, y).lens[m - 1];
  }
};
const T$calToDays = (cal, y, m, d) => {
  switch (T$calKind(cal)) {
    case 1: return T$epochDays(y - T$gregOffset(cal), m, d);
    case 2: {
      const yy = y - T$copticYearOffset(cal);
      return T$copticEpoch(cal) - 1 + 365 * (yy - 1) + Math.floor(yy / 4) + 30 * (m - 1) + d;
    }
    case 3: {
      let off = 0;
      if (m >= 2) off = (T$isLeapYear(y + 78) ? 31 : 30) + 31 * (Math.min(m, 7) - 2) + 30 * Math.max(0, m - 7);
      return T$indianStart(y) + off + d - 1;
    }
    case 4: return T$persianNewYear(y) + (m <= 7 ? 31 * (m - 1) : 186 + 30 * (m - 7)) + d - 1;
    case 6: {
      if (y >= 1300 && y <= 1600) {
        const uq = T$umalqura();
        let ed = uq.starts[y - 1300];
        for (let k = 1; k < m; k++) ed += (uq.bits[y - 1300] >> (k - 1)) & 1 ? 30 : 29;
        return ed + d - 1;
      }
      return T$islamicToDays(T$ISLAMIC_CIVIL_EPOCH, y, m, d);
    }
    case 5: return T$islamicToDays(T$islamicEpoch(cal), y, m, d);
    case 7: {
      const lens = T$hebMonthLens(y);
      let ed = T$hebNewYear(y);
      for (let k = 1; k < m; k++) ed += lens[k - 1];
      return ed + d - 1;
    }
    case 8: {
      const info = T$chYearInfo(cal, y);
      let ed = info.start;
      for (let k = 1; k < m; k++) ed += info.lens[k - 1];
      return ed + d - 1;
    }
  }
};
const T$calFromDays = (cal, ed) => {
  let y, m, d;
  switch (T$calKind(cal)) {
    case 1: {
      const iso = T$epochDaysToDate(ed);
      return { year: iso.year + T$gregOffset(cal), month: iso.month, day: iso.day };
    }
    case 2: {
      const epoch = T$copticEpoch(cal), off = T$copticYearOffset(cal);
      const yy = Math.floor((4 * (ed - epoch) + 1463) / 1461);
      y = yy + off;
      m = Math.floor((ed - T$calToDays(cal, y, 1, 1)) / 30) + 1;
      d = ed + 1 - T$calToDays(cal, y, m, 1);
      return { year: y, month: m, day: d };
    }
    case 3: {
      y = T$epochDaysToDate(ed).year - 78;
      if (ed < T$indianStart(y)) y--;
      break;
    }
    case 4: {
      y = 1 + Math.floor((33 * (ed - T$PERSIAN_EPOCH) + 3) / 12053);
      while (T$persianNewYear(y) > ed) y--;
      while (T$persianNewYear(y + 1) <= ed) y++;
      break;
    }
    case 6: {
      const uq = T$umalqura();
      if (ed >= uq.starts[0] && ed < uq.starts[uq.starts.length - 1]) {
        y = 1300 + Math.floor((ed - uq.starts[0]) / 354.367);
        while (y > 1300 && uq.starts[y - 1300] > ed) y--;
        while (y < 1600 && uq.starts[y + 1 - 1300] <= ed) y++;
        break;
      }
    }
    case 5: {
      const epoch = T$calKind(cal) === 5 ? T$islamicEpoch(cal) : T$ISLAMIC_CIVIL_EPOCH;
      y = Math.floor((30 * (ed - epoch) + 10646) / 10631);
      const prior = ed - T$islamicToDays(epoch, y, 1, 1);
      m = Math.floor((11 * prior + 330) / 325);
      d = ed - T$islamicToDays(epoch, y, m, 1) + 1;
      return { year: y, month: m, day: d };
    }
    case 7: {
      y = Math.floor((ed - T$HEBREW_EPOCH) / 365.2468) + 1;
      while (T$hebNewYear(y) > ed) y--;
      while (T$hebNewYear(y + 1) <= ed) y++;
      break;
    }
    case 8:
      y = T$chYearOf(cal, ed);
      break;
  }
  let rest = ed - T$calToDays(cal, y, 1, 1);
  m = 1;
  const n = T$calMonthsInYear(cal, y);
  while (m < n) {
    const dim = T$calDaysInMonth(cal, y, m);
    if (rest < dim) break;
    rest -= dim;
    m++;
  }
  return { year: y, month: m, day: rest + 1 };
};
const T$calMonthCode = (cal, y, m) => {
  const k = T$calKind(cal);
  if (k === 7 && T$hebLeap(y)) {
    if (m < 6) return T$monthCodeFor(m, false);
    if (m === 6) return 'M05L';
    return T$monthCodeFor(m - 1, false);
  }
  if (k === 8) {
    const leap = T$chYearInfo(cal, y).leap;
    if (leap === 0 || m < leap) return T$monthCodeFor(m, false);
    if (m === leap) return T$monthCodeFor(m - 1, true);
    return T$monthCodeFor(m - 1, false);
  }
  return T$monthCodeFor(m, false);
};
const T$calMonthOrdinal = (cal, y, code) => {
  const p = T$parseMonthCode(code);
  const k = T$calKind(cal);
  if (k === 7) {
    const leapYear = T$hebLeap(y);
    if (p.leap) return leapYear ? 6 : 0;
    return leapYear && p.month >= 6 ? p.month + 1 : p.month;
  }
  if (k === 8) {
    const leap = T$chYearInfo(cal, y).leap;
    if (p.leap) return leap !== 0 && leap - 1 === p.month ? leap : 0;
    return leap !== 0 && p.month >= leap ? p.month + 1 : p.month;
  }
  return p.month;
};
const T$calValidMonthCode = (cal, code) => {
  const p = T$parseMonthCode(code);
  const k = T$calKind(cal);
  if (p.month < 1) return false;
  if (k === 2) return !p.leap && p.month <= 13;
  if (k === 7) return p.month <= 12 && (!p.leap || p.month === 5);
  if (k === 8) return p.month <= 12;
  return !p.leap && p.month <= 12;
};
const T$constrainMonthCode = (cal, code) => {
  const p = T$parseMonthCode(code);
  if (!p.leap) return code;
  if (T$calKind(cal) === 7) return 'M06';
  return T$monthCodeFor(p.month, false);
};
const T$nonISOUsesEras = cal => T$calKind(cal) !== 8;
const T$calEra = (cal, y, isoDate) => {
  switch (cal) {
    case 'gregory': return y > 0 ? [ 'ce', y ] : [ 'bce', 1 - y ];
    case 'japanese': {
      const c = T$compareISODate;
      if (c(isoDate, T$isoDate(2019, 5, 1)) >= 0) return [ 'reiwa', y - 2018 ];
      if (c(isoDate, T$isoDate(1989, 1, 8)) >= 0) return [ 'heisei', y - 1988 ];
      if (c(isoDate, T$isoDate(1926, 12, 25)) >= 0) return [ 'showa', y - 1925 ];
      if (c(isoDate, T$isoDate(1912, 7, 30)) >= 0) return [ 'taisho', y - 1911 ];
      if (c(isoDate, T$isoDate(1873, 1, 1)) >= 0) return [ 'meiji', y - 1867 ];
      return y > 0 ? [ 'ce', y ] : [ 'bce', 1 - y ];
    }
    case 'roc': return y > 0 ? [ 'roc', y ] : [ 'broc', 1 - y ];
    case 'buddhist': return [ 'be', y ];
    case 'coptic': return [ 'am', y ];
    case 'ethioaa': return [ 'aa', y ];
    case 'ethiopic': return y > 0 ? [ 'am', y ] : [ 'aa', y + 5500 ];
    case 'hebrew': return [ 'am', y ];
    case 'indian': return [ 'shaka', y ];
    case 'persian': return [ 'ap', y ];
  }
  return y > 0 ? [ 'ah', y ] : [ 'bh', 1 - y ];
};
const T$calYearFromEra = (cal, era, eraYear) => {
  switch (cal) {
    case 'gregory': case 'japanese':
      if (era === 'ce' || era === 'ad') return eraYear;
      if (era === 'bce' || era === 'bc') return 1 - eraYear;
      if (cal === 'japanese') {
        if (era === 'reiwa') return eraYear + 2018;
        if (era === 'heisei') return eraYear + 1988;
        if (era === 'showa') return eraYear + 1925;
        if (era === 'taisho') return eraYear + 1911;
        if (era === 'meiji') return eraYear + 1867;
      }
      return undefined;
    case 'roc':
      if (era === 'roc') return eraYear;
      if (era === 'broc') return 1 - eraYear;
      return undefined;
    case 'buddhist': return era === 'be' ? eraYear : undefined;
    case 'coptic': return era === 'am' ? eraYear : undefined;
    case 'ethioaa': return era === 'aa' ? eraYear : undefined;
    case 'ethiopic':
      if (era === 'am') return eraYear;
      if (era === 'aa') return eraYear - 5500;
      return undefined;
    case 'hebrew': return era === 'am' ? eraYear : undefined;
    case 'indian': return era === 'shaka' ? eraYear : undefined;
    case 'persian': return era === 'ap' ? eraYear : undefined;
  }
  if (era === 'ah') return eraYear;
  if (era === 'bh') return 1 - eraYear;
  return undefined;
};
const T$calInLeapYear = (cal, y) => {
  const k = T$calKind(cal);
  if (k === 7 || k === 8) return T$calMonthsInYear(cal, y) === 13;
  const days = T$calToDays(cal, y + 1, 1, 1) - T$calToDays(cal, y, 1, 1);
  if (k === 5 || k === 6) return days === 355;
  return days === 366;
};
const T$nonISOToDate = (cal, date) => {
  const ed = T$epochDays(date.year, date.month, date.day);
  const c = T$calFromDays(cal, ed);
  const era = T$nonISOUsesEras(cal) ? T$calEra(cal, c.year, date) : undefined;
  const yearStart = T$calToDays(cal, c.year, 1, 1);
  return {
    era: era === undefined ? undefined : era[0], eraYear: era === undefined ? undefined : era[1],
    year: c.year, month: c.month, monthCode: T$calMonthCode(cal, c.year, c.month), day: c.day,
    dayOfWeek: T$dayOfWeek(date), dayOfYear: ed - yearStart + 1, weekOfYear: undefined, yearOfWeek: undefined, daysInWeek: 7,
    daysInMonth: T$calDaysInMonth(cal, c.year, c.month), daysInYear: T$calToDays(cal, c.year + 1, 1, 1) - yearStart,
    monthsInYear: T$calMonthsInYear(cal, c.year), inLeapYear: T$calInLeapYear(cal, c.year)
  };
};
const T$CAL_YEAR_LIMIT = 1000000;
const T$checkCalYear = y => {
  if (y > T$CAL_YEAR_LIMIT || y < -T$CAL_YEAR_LIMIT) throw new RangeError('date out of range');
};
const T$nonISOResolveFields = (cal, fields, type) => {
  const eras = T$nonISOUsesEras(cal);
  if (eras && (fields.era === undefined) !== (fields.eraYear === undefined)) throw new TypeError('era and eraYear must be given together');
  const hasYear = fields.year !== undefined || (eras && fields.era !== undefined && fields.eraYear !== undefined);
  const needYear = type === 'date' || type === 'year-month' || (type === 'month-day' && fields.month !== undefined);
  if (needYear && !hasYear) throw new TypeError('year is required');
  if ((type === 'date' || type === 'month-day') && fields.day === undefined) throw new TypeError('day is required');
  if (fields.month === undefined && fields.monthCode === undefined) throw new TypeError('month or monthCode is required');
  if (eras && fields.era !== undefined) {
    const y = T$calYearFromEra(cal, fields.era, fields.eraYear);
    if (y === undefined) throw new RangeError('invalid era for calendar: ' + fields.era);
    if (fields.year !== undefined && fields.year !== y) throw new RangeError('year and era/eraYear do not agree');
    fields.year = y;
  }
  if (fields.monthCode !== undefined) {
    if (!T$calValidMonthCode(cal, fields.monthCode)) throw new RangeError('invalid monthCode for calendar: ' + fields.monthCode);
    if (fields.month !== undefined && fields.year !== undefined) {
      T$checkCalYear(fields.year);
      const ord = T$calMonthOrdinal(cal, fields.year, fields.monthCode);
      if (ord !== 0 && ord !== fields.month) throw new RangeError('month and monthCode do not agree');
    }
  }
};
const T$nonISODateToISO = (cal, fields, overflow) => {
  const y = fields.year;
  T$checkCalYear(y);
  let m;
  if (fields.monthCode !== undefined) {
    m = T$calMonthOrdinal(cal, y, fields.monthCode);
    if (m === 0) {
      if (overflow === 'reject') throw new RangeError('month does not exist in year');
      m = T$calMonthOrdinal(cal, y, T$constrainMonthCode(cal, fields.monthCode));
    }
    if (fields.month !== undefined && fields.month !== m) throw new RangeError('month and monthCode do not agree');
  } else {
    m = fields.month;
    const n = T$calMonthsInYear(cal, y);
    if (m > n) {
      if (overflow === 'reject') throw new RangeError('month out of range');
      m = n;
    }
  }
  let d = fields.day;
  const dim = T$calDaysInMonth(cal, y, m);
  if (d > dim) {
    if (overflow === 'reject') throw new RangeError('day out of range');
    d = dim;
  }
  return T$epochDaysToDate(T$calToDays(cal, y, m, d));
};
const T$calBalanceYearMonth = (cal, y, m) => {
  const k = T$calKind(cal);
  if (k !== 7 && k !== 8) {
    const n = T$calMonthsInYear(cal, y);
    return { year: y + Math.floor((m - 1) / n), month: T$fmod(m - 1, n) + 1 };
  }
  if (m > 40 || m < -40) {
    // jump by whole 19-year cycles (235 months) first
    const cycles = Math.trunc((m - 1) / 235);
    m -= cycles * 235;
    y += cycles * 19;
  }
  while (m < 1) {
    y--;
    m += T$calMonthsInYear(cal, y);
  }
  while (m > T$calMonthsInYear(cal, y)) {
    m -= T$calMonthsInYear(cal, y);
    y++;
  }
  return { year: y, month: m };
};
const T$nonISODateAdd = (cal, date, duration, overflow) => {
  const parts = T$calFromDays(cal, T$epochDays(date.year, date.month, date.day));
  const code = T$calMonthCode(cal, parts.year, parts.month);
  const y0 = parts.year + duration.years;
  T$checkCalYear(y0);
  let m0 = T$calMonthOrdinal(cal, y0, code);
  if (m0 === 0) {
    if (overflow === 'reject') throw new RangeError('month does not exist in year');
    m0 = T$calMonthOrdinal(cal, y0, T$constrainMonthCode(cal, code));
  }
  const ym = T$calBalanceYearMonth(cal, y0, m0 + duration.months);
  T$checkCalYear(ym.year);
  let day = parts.day;
  const dim = T$calDaysInMonth(cal, ym.year, ym.month);
  if (day > dim) {
    if (overflow === 'reject') throw new RangeError('day out of range');
    day = dim;
  }
  const ed = T$calToDays(cal, ym.year, ym.month, day) + 7 * duration.weeks + duration.days;
  return T$epochDaysToDate(ed);
};
const T$compareSurpasses = (sign, year, monthOrCode, isCode, day, target) => {
  if (year !== target.year) return sign * (year - target.year) > 0;
  if (isCode) {
    if (monthOrCode !== target.monthCode) return sign > 0 ? monthOrCode > target.monthCode : monthOrCode < target.monthCode;
  } else if (monthOrCode !== target.month) return sign * (monthOrCode - target.month) > 0;
  if (day !== target.day) return sign * (day - target.day) > 0;
  return false;
};
const T$nonISOSurpasses = (cal, sign, p1, code1, p2, years, months) => {
  const y0 = p1.year + years;
  if (T$compareSurpasses(sign, y0, code1, true, p1.day, p2)) return true;
  let m0 = T$calMonthOrdinal(cal, y0, code1);
  if (m0 === 0) m0 = T$calMonthOrdinal(cal, y0, T$constrainMonthCode(cal, code1));
  const ym = T$calBalanceYearMonth(cal, y0, m0 + months);
  return T$compareSurpasses(sign, ym.year, ym.month, false, p1.day, p2);
};
const T$nonISODateUntil = (cal, one, two, largestUnit) => {
  const sign = -T$compareISODate(one, two);
  if (sign === 0) return T$ZERO_DATE_DURATION;
  const ed1 = T$epochDays(one.year, one.month, one.day), ed2 = T$epochDays(two.year, two.month, two.day);
  const p1 = T$calFromDays(cal, ed1), p2 = T$calFromDays(cal, ed2);
  const code1 = T$calMonthCode(cal, p1.year, p1.month);
  p2.monthCode = T$calMonthCode(cal, p2.year, p2.month);
  let years = 0, months = 0;
  if (largestUnit === 'year') {
    let candidate = p2.year - p1.year;
    if (candidate !== 0) candidate -= sign;
    if (T$nonISOSurpasses(cal, sign, p1, code1, p2, candidate, 0)) candidate = 0;
    else years = candidate;
    candidate = years + sign;
    while (!T$nonISOSurpasses(cal, sign, p1, code1, p2, candidate, 0)) {
      years = candidate;
      candidate += sign;
    }
  }
  if (largestUnit === 'year' || largestUnit === 'month') {
    let candidate = sign;
    if (largestUnit === 'month') {
      // estimate from the day difference to avoid stepping month by month over long spans
      const est = Math.trunc((ed2 - ed1) / 29.6) - 2 * sign;
      if (est * sign > 0 && !T$nonISOSurpasses(cal, sign, p1, code1, p2, 0, est)) {
        months = est;
        candidate = est + sign;
      }
    }
    while (!T$nonISOSurpasses(cal, sign, p1, code1, p2, years, candidate)) {
      months = candidate;
      candidate += sign;
    }
  }
  const y0 = p1.year + years;
  let m0 = T$calMonthOrdinal(cal, y0, code1);
  if (m0 === 0) m0 = T$calMonthOrdinal(cal, y0, T$constrainMonthCode(cal, code1));
  const ym = T$calBalanceYearMonth(cal, y0, m0 + months);
  const day = Math.min(p1.day, T$calDaysInMonth(cal, ym.year, ym.month));
  let days = ed2 - T$calToDays(cal, ym.year, ym.month, day);
  let weeks = 0;
  if (largestUnit === 'week') {
    weeks = Math.trunc(days / 7) + 0;
    days = days - weeks * 7 + 0;
  }
  return T$dateDuration(years, months, weeks, days);
};
const T$nonISOFieldKeysToIgnore = (cal, additional) => {
  const out = [];
  const eras = T$nonISOUsesEras(cal);
  if (additional.month !== undefined || additional.monthCode !== undefined) out.push('month', 'monthCode');
  if (additional.year !== undefined || (eras && (additional.era !== undefined || additional.eraYear !== undefined))) {
    out.push('year');
    if (eras) out.push('era', 'eraYear');
  }
  if (cal === 'japanese' && (additional.day !== undefined || additional.month !== undefined || additional.monthCode !== undefined)) out.push('era', 'eraYear');
  return out;
};
// ecma-402 reference years, 0 if the leap month needs constraining
const T$chReferenceYear = (cal, code, day) => {
  const p = T$parseMonthCode(code), m = p.month, big = day > 29;
  if (!p.leap) {
    if (m === 1) return big ? 1970 : 1972;
    if (m === 3 && big) return cal === 'chinese' ? 1966 : 1968;
    if ((m === 4 || m === 6 || m === 8) && big) return m === 4 ? 1970 : 1971;
    if (m === 11) return big ? 1969 : (day > 26 ? 1971 : 1972);
    if (m === 12) return 1971;
    return 1972;
  }
  const table = [ 0, 0, 1947, 1966, 1963, 1971, 1960, 1968, 1957, 2014, 1984, 2033, 0 ];
  const table30 = [ 0, 0, 0, 1955, 1944, 1952, 1941, 1938, 0, 0, 0, 0, 0 ];
  return big ? table30[m] : table[m];
};
const T$nonISOMonthDayToISO = (cal, fields, overflow) => {
  let code, day;
  if (fields.year !== undefined) {
    const iso = T$nonISODateToISO(cal, fields, overflow);
    if (!T$isoDateWithinLimits(iso)) throw new RangeError('date out of range');
    const c = T$calFromDays(cal, T$epochDays(iso.year, iso.month, iso.day));
    code = T$calMonthCode(cal, c.year, c.month);
    day = c.day;
  } else {
    code = fields.monthCode;
    day = fields.day;
  }
  if (T$calKind(cal) === 8) {
    if (day > 30) {
      if (overflow === 'reject') throw new RangeError('day out of range');
      day = 30;
    }
    let y = T$chReferenceYear(cal, code, day);
    if (y === 0) {
      if (overflow === 'reject') throw new RangeError('month-day does not exist');
      code = T$constrainMonthCode(cal, code);
      y = T$chReferenceYear(cal, code, day);
    }
    return T$epochDaysToDate(T$calToDays(cal, y, T$calMonthOrdinal(cal, y, code), day));
  }
  const endEd = T$epochDays(1972, 12, 31);
  const startYear = T$calFromDays(cal, endEd).year;
  let best = undefined, maxDay = 0;
  for (let pass = 0; pass < 2 && best === undefined; pass++) {
    for (let i = 0; i < 300; i++) {
      const y = pass === 0 ? startYear - i : startYear + 1 + i;
      const m = T$calMonthOrdinal(cal, y, code);
      if (m === 0) continue;
      const dim = T$calDaysInMonth(cal, y, m);
      if (dim > maxDay) maxDay = dim;
      if (dim < day) continue;
      const ed = T$calToDays(cal, y, m, day);
      if (pass === 0 && ed > endEd) continue;
      best = ed;
      break;
    }
  }
  if (best === undefined) {
    if (overflow === 'reject' || maxDay === 0) throw new RangeError('month-day does not exist');
    const f = { monthCode: code, day: maxDay };
    return T$nonISOMonthDayToISO(cal, f, overflow);
  }
  return T$epochDaysToDate(best);
};

// posix sign: positive means west of utc
const T$posixOffset = (s, st) => {
  let sign = 1;
  if (s[st.i] === '+') st.i++;
  else if (s[st.i] === '-') {
    sign = -1;
    st.i++;
  }
  let parts = [ 0, 0, 0 ], k = 0, cur = '';
  while (st.i < s.length) {
    const c = s[st.i];
    if (c >= '0' && c <= '9') cur += c;
    else if (c === ':') {
      parts[k++] = Number(cur);
      cur = '';
    } else break;
    st.i++;
  }
  parts[k] = Number(cur);
  return sign * (parts[0] * 3600 + parts[1] * 60 + parts[2]);
};
const T$posixName = (s, st) => {
  if (s[st.i] === '<') {
    st.i = s.indexOf('>', st.i) + 1;
    return;
  }
  while (st.i < s.length && ((s[st.i] >= 'A' && s[st.i] <= 'Z') || (s[st.i] >= 'a' && s[st.i] <= 'z'))) st.i++;
};
const T$posixDate = (s, st) => {
  let r;
  if (s[st.i] === 'M') {
    st.i++;
    const p = [];
    let cur = '';
    while (st.i < s.length && s[st.i] !== ',' && s[st.i] !== '/') {
      if (s[st.i] === '.') {
        p.push(Number(cur));
        cur = '';
      } else cur += s[st.i];
      st.i++;
    }
    p.push(Number(cur));
    r = { type: 0, m: p[0], w: p[1], d: p[2] };
  } else if (s[st.i] === 'J') {
    st.i++;
    let cur = '';
    while (st.i < s.length && s[st.i] >= '0' && s[st.i] <= '9') cur += s[st.i++];
    r = { type: 1, n: Number(cur) };
  } else {
    let cur = '';
    while (st.i < s.length && s[st.i] >= '0' && s[st.i] <= '9') cur += s[st.i++];
    r = { type: 2, n: Number(cur) };
  }
  r.time = 7200;
  if (s[st.i] === '/') {
    st.i++;
    // time may be negative or exceed 24h; the sign here is not inverted
    r.time = T$posixOffset(s, st);
  }
  return r;
};
const T$posixParse = s => {
  if (s === '') return null;
  const st = { i: 0 };
  T$posixName(s, st);
  const std = 0 - T$posixOffset(s, st);
  if (st.i >= s.length) return { std, dst: undefined };
  T$posixName(s, st);
  let dst = std + 3600;
  if (st.i < s.length && s[st.i] !== ',') dst = 0 - T$posixOffset(s, st);
  if (s[st.i] !== ',') return { std, dst: undefined };
  st.i++;
  const start = T$posixDate(s, st);
  st.i++;
  const end = T$posixDate(s, st);
  return { std, dst, start, end };
};
const T$posixDay = (y, r) => {
  if (r.type === 0) {
    const first = T$epochDays(y, r.m, 1);
    const dowFirst = T$fmod(first + 4, 7); // 0 = sunday
    let day = first + T$fmod(r.d - dowFirst, 7) + (r.w - 1) * 7;
    if (r.w === 5) {
      const dim = T$daysInMonth(y, r.m);
      while (day - first >= dim) day -= 7;
    }
    return day;
  }
  if (r.type === 1) {
    // 1..365, feb 29 never counted
    let n = r.n;
    if (T$isLeapYear(y) && n >= 60) n++;
    return T$epochDays(y, 1, 1) + n - 1;
  }
  return T$epochDays(y, 1, 1) + r.n;
};
const T$posixYear = (rule, y) => {
  const s = T$posixDay(y, rule.start) * 86400 + rule.start.time - rule.std;
  const e = T$posixDay(y, rule.end) * 86400 + rule.end.time - rule.dst;
  return [ s, e ];
};
const T$posixOffsetAt = (rule, sec) => {
  if (rule.dst === undefined) return rule.std;
  const y = T$epochDaysToDate(Math.floor((sec + rule.std) / 86400)).year;
  const t = T$posixYear(rule, y);
  if (t[0] < t[1]) return sec >= t[0] && sec < t[1] ? rule.dst : rule.std;
  return sec >= t[1] && sec < t[0] ? rule.std : rule.dst;
};
const T$posixTransition = (rule, sec, dir) => {
  if (rule.dst === undefined) return null;
  const y = T$epochDaysToDate(Math.floor(sec / 86400)).year;
  let best = null;
  for (let k = -1; k <= 1; k++) {
    const t = T$posixYear(rule, y + k);
    for (let j = 0; j < 2; j++) {
      const v = t[j];
      if (dir > 0 ? v > sec && (best === null || v < best) : v < sec && (best === null || v > best)) best = v;
    }
  }
  return best;
};

let T$TZ_INDEX = null, T$TZ_CACHE = null, T$TZ_PARTS = null;
const T$tzIndex = () => {
  if (T$TZ_INDEX !== null) return T$TZ_INDEX;
  const idx = new Map();
  const entries = T$TZ_NAMES.split(';');
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const colon = e.indexOf(':');
    const data = Number(e.slice(0, colon));
    const ids = e.slice(colon + 1).split(',');
    for (let j = 0; j < ids.length; j++) idx.set(T$asciiLower(ids[j]), { id: ids[j], cls: 'c' + i, data });
  }
  const utc = T$TZ_UTC.split(',');
  for (let j = 0; j < utc.length; j++) idx.set(T$asciiLower(utc[j]), { id: utc[j], cls: 'UTC', data: -1 });
  T$TZ_INDEX = idx;
  T$TZ_CACHE = new Map();
  T$TZ_PARTS = T$TZ_DATA.split(';');
  return idx;
};
const T$tzLookup = lower => {
  const r = T$tzIndex().get(lower);
  return r === undefined ? undefined : r.id;
};
const T$tzPrimary = id => {
  const r = T$tzIndex().get(T$asciiLower(id));
  return r === undefined ? id : r.cls;
};
const T$tzZone = tz => {
  const r = T$tzIndex().get(T$asciiLower(tz));
  if (r.data < 0) return null;
  let z = T$TZ_CACHE.get(r.data);
  if (z !== undefined) return z;
  let p = 0;
  const s = T$TZ_PARTS[r.data];
  const read = () => {
    let v = 0, mul = 1;
    for (;;) {
      const d = T$B64.indexOf(s[p++]);
      v += (d & 31) * mul;
      mul *= 32;
      if (d < 32) break;
    }
    return v % 2 === 0 ? v / 2 : -(v + 1) / 2;
  };
  const nOffs = read();
  const offsTable = [];
  for (let i = 0; i < nOffs; i++) offsTable.push(read());
  const n = read();
  const trans = [], offs = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const v = read();
    let d;
    if (v % 2 === 0) d = v / 2 * 60;
    else d = v > 0 ? (v - 1) / 2 : (v + 1) / 2;
    t += d;
    trans.push(t);
    offs.push(offsTable[T$B64.indexOf(s[p++])]);
  }
  z = { trans, offs, initial: offsTable[0], rule: T$posixParse(s.slice(s.indexOf('|') + 1)) };
  T$TZ_CACHE.set(r.data, z);
  return z;
};
const T$tzOffsetSec = (z, sec) => {
  const tr = z.trans, n = tr.length;
  if (n === 0 || sec >= tr[n - 1]) {
    if (z.rule !== null) return T$posixOffsetAt(z.rule, sec);
    return n === 0 ? z.initial : z.offs[n - 1];
  }
  if (sec < tr[0]) return z.initial;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tr[mid] <= sec) lo = mid;
    else hi = mid - 1;
  }
  return z.offs[lo];
};
const T$tzPossible = (tz, dt) => {
  const z = T$tzZone(tz);
  const local = T$utcEpochNs(dt);
  const before = T$tzOffsetSec(z, local.sec - 86400), after = T$tzOffsetSec(z, local.sec + 86400);
  const out = [];
  const cands = before === after ? [ before ] : [ before, after ];
  for (let i = 0; i < cands.length; i++) {
    const e = { sec: local.sec - cands[i], ns: local.ns };
    if (T$tzOffsetSec(z, e.sec) === cands[i]) out.push(e);
  }
  if (out.length === 2 && T$tdCmp(out[0], out[1]) > 0) out.reverse();
  return out;
};
const T$tzTransition = (tz, en, dir) => {
  const z = T$tzZone(tz);
  const tr = z.trans, n = tr.length;
  // transition times are integer seconds
  let result = null;
  if (dir > 0) {
    // t > en <=> t > sec
    const sec = en.sec;
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tr[mid] > sec) hi = mid;
      else lo = mid + 1;
    }
    if (lo < n) result = tr[lo];
    else if (z.rule !== null) {
      const from = n > 0 && tr[n - 1] > sec ? tr[n - 1] : sec;
      result = T$posixTransition(z.rule, from, 1);
    }
  } else {
    // t < en <=> t <= sec
    const sec = en.ns > 0 ? en.sec : en.sec - 1;
    if (z.rule !== null && (n === 0 || sec >= tr[n - 1])) {
      const t = T$posixTransition(z.rule, sec + 1, -1);
      if (t !== null && (n === 0 || t > tr[n - 1])) result = t;
    }
    if (result === null) {
      let lo = -1, hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (tr[mid] <= sec) lo = mid;
        else hi = mid - 1;
      }
      if (lo >= 0) result = tr[lo];
    }
  }
  if (result === null) return null;
  const td = { sec: result, ns: 0 };
  if (!T$isValidEpochNs(td)) return null;
  return td;
};

${calendarData}
${tzData}

let T$P_INSTANT, T$P_ZDT, T$P_DATE, T$P_DATETIME, T$P_TIME, T$P_YM, T$P_MD, T$P_DURATION;
const T$init = (obj, rec) => {
  T$slots.set(obj, rec);
  return obj;
};
const T$createInstant = (en, obj) => {
  T$checkEpochNs(en);
  return T$init(obj === undefined ? Object.create(T$P_INSTANT) : obj, { brand: T$B_INSTANT, epochNs: en });
};
const T$createZonedDateTime = (en, tz, calendar, obj) => {
  T$checkEpochNs(en);
  return T$init(obj === undefined ? Object.create(T$P_ZDT) : obj, { brand: T$B_ZDT, epochNs: en, timeZone: tz, calendar });
};
const T$createPlainDate = (date, calendar, obj) => {
  if (!T$isoDateWithinLimits(date)) throw new RangeError('date out of range');
  return T$init(obj === undefined ? Object.create(T$P_DATE) : obj, { brand: T$B_DATE, date, calendar });
};
const T$createPlainDateTime = (dt, calendar, obj) => {
  if (!T$isoDateTimeWithinLimits(dt)) throw new RangeError('date-time out of range');
  return T$init(obj === undefined ? Object.create(T$P_DATETIME) : obj, { brand: T$B_DATETIME, dateTime: dt, calendar });
};
const T$createPlainTime = (t, obj) => T$init(obj === undefined ? Object.create(T$P_TIME) : obj, { brand: T$B_TIME, time: T$stripDays(t) });
const T$createPlainYearMonth = (date, calendar, obj) => {
  if (!T$isoYearMonthWithinLimits(date)) throw new RangeError('year-month out of range');
  return T$init(obj === undefined ? Object.create(T$P_YM) : obj, { brand: T$B_YM, date, calendar });
};
const T$createPlainMonthDay = (date, calendar, obj) => {
  if (!T$isoDateWithinLimits(date)) throw new RangeError('month-day out of range');
  return T$init(obj === undefined ? Object.create(T$P_MD) : obj, { brand: T$B_MD, date, calendar });
};
const T$createDuration = (d, obj) => T$init(obj === undefined ? Object.create(T$P_DURATION) : obj, { brand: T$B_DURATION, d });
const T$negateDurationRecord = d => T$createDurationRecord(-d.years, -d.months, -d.weeks, -d.days, -d.hours, -d.minutes, -d.seconds, -d.milliseconds, -d.microseconds, -d.nanoseconds);
const T$createDifferenceDuration = (op, r) => T$createDuration(op === 'since' ? T$negateDurationRecord(r) : r);
const T$checkCalendarArg = calendar => {
  if (calendar === undefined) return 'iso8601';
  if (typeof calendar !== 'string') throw new TypeError('calendar must be a string');
  return T$canonicalizeCalendar(calendar);
};
const T$roundToOptions = roundTo => {
  if (roundTo === undefined) throw new TypeError('options parameter is required');
  if (typeof roundTo === 'string') {
    const o = Object.create(null);
    o.smallestUnit = roundTo;
    return o;
  }
  return T$getOptionsObject(roundTo);
};

const T$temporalDurationToString = (d, precision) => {
  const sign = T$durationSign(d);
  let datePart = '';
  if (d.years !== 0) datePart += String(Math.abs(d.years)) + 'Y';
  if (d.months !== 0) datePart += String(Math.abs(d.months)) + 'M';
  if (d.weeks !== 0) datePart += String(Math.abs(d.weeks)) + 'W';
  if (d.days !== 0) datePart += String(Math.abs(d.days)) + 'D';
  let timePart = '';
  if (d.hours !== 0) timePart += String(Math.abs(d.hours)) + 'H';
  if (d.minutes !== 0) timePart += String(Math.abs(d.minutes)) + 'M';
  const zeroMinutesAndHigher = d.years === 0 && d.months === 0 && d.weeks === 0 && d.days === 0 && d.hours === 0 && d.minutes === 0;
  const secondsDuration = T$tdAbs(T$tdFromComponents(0, 0, d.seconds, d.milliseconds, d.microseconds, d.nanoseconds));
  if (T$tdSign(secondsDuration) !== 0 || zeroMinutesAndHigher || precision !== 'auto') {
    timePart += String(secondsDuration.sec) + T$formatFractionalSeconds(secondsDuration.ns, precision) + 'S';
  }
  let result = (sign < 0 ? '-' : '') + 'P' + datePart;
  if (timePart !== '') result += 'T' + timePart;
  return result;
};
const T$temporalInstantToString = (en, tz, precision) => {
  const outTz = tz === undefined ? 'UTC' : tz;
  const offsetNs = T$getOffsetNs(outTz, en);
  const dt = T$getISODateTimeFor(outTz, en);
  const s = T$isoDateTimeToString(dt, 'iso8601', precision, 'never');
  return s + (tz === undefined ? 'Z' : T$formatDateTimeUTCOffsetRounded(offsetNs));
};
const T$temporalZonedDateTimeToString = (sl, precision, showCalendar, showTimeZone, showOffset, increment, unit, mode) => {
  const ns = T$roundTemporalInstant(sl.epochNs, increment === undefined ? 1 : increment, unit === undefined ? 'nanosecond' : unit, mode === undefined ? 'trunc' : mode);
  const offsetNs = T$getOffsetNs(sl.timeZone, ns);
  const dt = T$getISODateTimeFor(sl.timeZone, ns);
  let s = T$isoDateTimeToString(dt, 'iso8601', precision, 'never');
  if (showOffset !== 'never') s += T$formatDateTimeUTCOffsetRounded(offsetNs);
  if (showTimeZone !== 'never') s += '[' + (showTimeZone === 'critical' ? '!' : '') + sl.timeZone + ']';
  return s + T$formatCalendarAnnotation(sl.calendar, showCalendar);
};
const T$temporalDateToString = (sl, showCalendar) => T$formatDate(sl.date) + T$formatCalendarAnnotation(sl.calendar, showCalendar);
const T$temporalYearMonthToString = (sl, showCalendar) => {
  let s = T$padISOYear(sl.date.year) + '-' + T$pad(sl.date.month, 2);
  if (showCalendar === 'always' || showCalendar === 'critical' || sl.calendar !== 'iso8601') s += '-' + T$pad(sl.date.day, 2);
  return s + T$formatCalendarAnnotation(sl.calendar, showCalendar);
};
const T$temporalMonthDayToString = (sl, showCalendar) => {
  let s = T$pad(sl.date.month, 2) + '-' + T$pad(sl.date.day, 2);
  if (showCalendar === 'always' || showCalendar === 'critical' || sl.calendar !== 'iso8601') s = T$padISOYear(sl.date.year) + '-' + s;
  return s + T$formatCalendarAnnotation(sl.calendar, showCalendar);
};

const T$calField = (sl, date, field) => {
  const c = sl.calDate;
  if (c === undefined || c.iso.year !== date.year || c.iso.month !== date.month || c.iso.day !== date.day) {
    sl.calDate = { iso: T$isoDate(date.year, date.month, date.day), rec: T$calendarISOToDate(sl.calendar, date) };
    return sl.calDate.rec[field];
  }
  return c.rec[field];
};
const T$zdtDateTime = s => T$getISODateTimeFor(s.timeZone, s.epochNs);
const T$slotDateTime = s => {
  if (s.brand === T$B_ZDT) return T$zdtDateTime(s);
  return s.brand === T$B_DATETIME ? s.dateTime : s;
};
const T$defineGetters = (cls, brand, keys, time) => {
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const get = (time ? {
      [k]() {
        return T$slotDateTime(T$get(this, brand, k)).time[k];
      }
    } : {
      [k]() {
        const s = T$get(this, brand, k);
        return T$calField(s, T$slotDateTime(s).date, k);
      }
    })[k];
    Object.defineProperty(get, 'name', { value: 'get ' + k });
    Object.defineProperty(cls.prototype, k, { get, configurable: true });
  }
};

const T$plainRelativeTarget = (p, d) => {
  const internal = T$toInternalDurationWith24HourDays(d);
  const targetTime = T$addTime(T$MIDNIGHT, internal.time);
  const targetDate = T$calendarDateAdd(p.calendar, p.date, T$adjustDateDuration(internal.date, targetTime.days), 'constrain');
  return T$dateTime(targetDate, T$stripDays(targetTime));
};
const T$dateDurationDays = (dateDuration, plainSlots) => {
  const ymw = T$adjustDateDuration(dateDuration, 0);
  if (T$dateDurationSign(ymw) === 0) return dateDuration.days;
  const later = T$calendarDateAdd(plainSlots.calendar, plainSlots.date, ymw, 'constrain');
  const e1 = T$epochDays(plainSlots.date.year, plainSlots.date.month, plainSlots.date.day);
  const e2 = T$epochDays(later.year, later.month, later.day);
  return dateDuration.days + (e2 - e1);
};
const T$addDurations = (op, d, other) => {
  const o = T$toDurationRecord(other, op === 'subtract');
  const lu = T$largerUnit(T$defaultLargestUnit(d), T$defaultLargestUnit(o));
  if (T$isCalendarUnit(lu)) throw new RangeError('cannot add durations with calendar units without relativeTo');
  const d1 = T$toInternalDurationWith24HourDays(d), d2 = T$toInternalDurationWith24HourDays(o);
  const td = T$tdCheck(T$tdAdd(d1.time, d2.time));
  return T$createDuration(T$temporalDurationFromInternal({ date: T$ZERO_DATE_DURATION, time: td }, lu));
};
const T$Duration = class Duration {
  constructor(years = undefined, months = undefined, weeks = undefined, days = undefined, hours = undefined, minutes = undefined, seconds = undefined, milliseconds = undefined, microseconds = undefined, nanoseconds = undefined) {
    if (new.target === undefined) throw new TypeError('Constructor requires new');
    const y = years === undefined ? 0 : T$toIntegerIfIntegral(years);
    const mo = months === undefined ? 0 : T$toIntegerIfIntegral(months);
    const w = weeks === undefined ? 0 : T$toIntegerIfIntegral(weeks);
    const d = days === undefined ? 0 : T$toIntegerIfIntegral(days);
    const h = hours === undefined ? 0 : T$toIntegerIfIntegral(hours);
    const mi = minutes === undefined ? 0 : T$toIntegerIfIntegral(minutes);
    const s = seconds === undefined ? 0 : T$toIntegerIfIntegral(seconds);
    const ms = milliseconds === undefined ? 0 : T$toIntegerIfIntegral(milliseconds);
    const us = microseconds === undefined ? 0 : T$toIntegerIfIntegral(microseconds);
    const ns = nanoseconds === undefined ? 0 : T$toIntegerIfIntegral(nanoseconds);
    T$createDuration(T$createDurationRecord(y, mo, w, d, h, mi, s, ms, us, ns), this);
  }
  static from(item) { return T$toTemporalDuration(item); }
  static compare(one, two, options = undefined) {
    const a = T$toDurationRecord(one);
    const b = T$toDurationRecord(two);
    const rel = T$getRelativeTo(T$getOptionsObject(options));
    if (a.years === b.years && a.months === b.months && a.weeks === b.weeks && a.days === b.days && a.hours === b.hours && a.minutes === b.minutes &&
      a.seconds === b.seconds && a.milliseconds === b.milliseconds && a.microseconds === b.microseconds && a.nanoseconds === b.nanoseconds) return 0;
    const lu1 = T$defaultLargestUnit(a), lu2 = T$defaultLargestUnit(b);
    const d1 = T$toInternalDuration(a), d2 = T$toInternalDuration(b);
    if (rel.zoned !== undefined && (T$isDateUnit(lu1) || T$isDateUnit(lu2))) {
      const z = T$get(rel.zoned, T$B_ZDT, 'compare');
      const after1 = T$addZonedDateTime(z.epochNs, z.timeZone, z.calendar, d1, 'constrain');
      const after2 = T$addZonedDateTime(z.epochNs, z.timeZone, z.calendar, d2, 'constrain');
      return T$tdCmp(after1, after2);
    }
    let days1, days2;
    if (T$isCalendarUnit(lu1) || T$isCalendarUnit(lu2)) {
      if (rel.plain === undefined) throw new RangeError('relativeTo is required for calendar units');
      const p = T$get(rel.plain, T$B_DATE, 'compare');
      days1 = T$dateDurationDays(d1.date, p);
      days2 = T$dateDurationDays(d2.date, p);
    } else {
      days1 = a.days;
      days2 = b.days;
    }
    return T$tdCmp(T$tdCheck(T$tdAddDays(d1.time, days1)), T$tdCheck(T$tdAddDays(d2.time, days2)));
  }
  get years() { return T$get(this, T$B_DURATION, 'years').d.years; }
  get months() { return T$get(this, T$B_DURATION, 'months').d.months; }
  get weeks() { return T$get(this, T$B_DURATION, 'weeks').d.weeks; }
  get days() { return T$get(this, T$B_DURATION, 'days').d.days; }
  get hours() { return T$get(this, T$B_DURATION, 'hours').d.hours; }
  get minutes() { return T$get(this, T$B_DURATION, 'minutes').d.minutes; }
  get seconds() { return T$get(this, T$B_DURATION, 'seconds').d.seconds; }
  get milliseconds() { return T$get(this, T$B_DURATION, 'milliseconds').d.milliseconds; }
  get microseconds() { return T$get(this, T$B_DURATION, 'microseconds').d.microseconds; }
  get nanoseconds() { return T$get(this, T$B_DURATION, 'nanoseconds').d.nanoseconds; }
  get sign() { return T$durationSign(T$get(this, T$B_DURATION, 'sign').d); }
  get blank() { return T$durationSign(T$get(this, T$B_DURATION, 'blank').d) === 0; }
  with(temporalDurationLike) {
    const d = T$get(this, T$B_DURATION, 'with').d;
    return T$createDuration(T$toPartialDuration(temporalDurationLike, d));
  }
  negated() { return T$createDuration(T$negateDurationRecord(T$get(this, T$B_DURATION, 'negated').d)); }
  abs() {
    const d = T$get(this, T$B_DURATION, 'abs').d;
    return T$createDuration(T$createDurationRecord(Math.abs(d.years), Math.abs(d.months), Math.abs(d.weeks), Math.abs(d.days), Math.abs(d.hours), Math.abs(d.minutes), Math.abs(d.seconds), Math.abs(d.milliseconds), Math.abs(d.microseconds), Math.abs(d.nanoseconds)));
  }
  add(other) { return T$addDurations('add', T$get(this, T$B_DURATION, 'add').d, other); }
  subtract(other) { return T$addDurations('subtract', T$get(this, T$B_DURATION, 'subtract').d, other); }
  round(roundTo) {
    const d = T$get(this, T$B_DURATION, 'round').d;
    roundTo = T$roundToOptions(roundTo);
    let smallestUnitPresent = true, largestUnitPresent = true;
    let largestUnit = T$getUnitOption(roundTo, 'largestUnit', undefined);
    const rel = T$getRelativeTo(roundTo);
    const roundingIncrement = T$getRoundingIncrementOption(roundTo);
    const roundingMode = T$getRoundingModeOption(roundTo, 'halfExpand');
    let smallestUnit = T$getUnitOption(roundTo, 'smallestUnit', undefined);
    T$validateUnit(smallestUnit, 'datetime');
    if (smallestUnit === undefined) {
      smallestUnitPresent = false;
      smallestUnit = 'nanosecond';
    }
    const existingLargestUnit = T$defaultLargestUnit(d);
    const defaultLargestUnit = T$largerUnit(existingLargestUnit, smallestUnit);
    if (largestUnit === undefined) {
      largestUnitPresent = false;
      largestUnit = defaultLargestUnit;
    } else if (largestUnit === 'auto') largestUnit = defaultLargestUnit;
    if (!smallestUnitPresent && !largestUnitPresent) throw new RangeError('smallestUnit or largestUnit is required');
    if (T$largerUnit(largestUnit, smallestUnit) !== largestUnit) throw new RangeError('largestUnit must be larger than smallestUnit');
    const max = T$maxRoundingIncrement(smallestUnit);
    if (max !== undefined) T$validateRoundingIncrement(roundingIncrement, max, false);
    if (roundingIncrement > 1 && largestUnit !== smallestUnit && T$isDateUnit(smallestUnit)) throw new RangeError('roundingIncrement not allowed with calendar units');
    if (rel.zoned !== undefined) {
      const z = T$get(rel.zoned, T$B_ZDT, 'round');
      const target = T$addZonedDateTime(z.epochNs, z.timeZone, z.calendar, T$toInternalDuration(d), 'constrain');
      const rr = T$differenceZonedDateTimeWithRounding(z.epochNs, target, z.timeZone, z.calendar, largestUnit, roundingIncrement, smallestUnit, roundingMode);
      return T$createDuration(T$temporalDurationFromInternal(rr, T$isDateUnit(largestUnit) ? 'hour' : largestUnit));
    }
    if (rel.plain !== undefined) {
      const p = T$get(rel.plain, T$B_DATE, 'round');
      const rr = T$differencePlainDateTimeWithRounding(T$dateTime(p.date, T$MIDNIGHT), T$plainRelativeTarget(p, d), p.calendar, largestUnit, roundingIncrement, smallestUnit, roundingMode);
      return T$createDuration(T$temporalDurationFromInternal(rr, largestUnit));
    }
    if (T$isCalendarUnit(existingLargestUnit) || T$isCalendarUnit(largestUnit)) throw new RangeError('relativeTo is required for calendar units');
    let internal = T$toInternalDurationWith24HourDays(d);
    if (smallestUnit === 'day') {
      const rounded = T$tdCheck(T$tdRoundToIncrement(internal.time, { sec: 86400 * roundingIncrement, ns: 0 }, roundingMode, false));
      const days = T$tdTruncDiv(rounded, 86400e9);
      internal = { date: T$dateDuration(0, 0, 0, days), time: T$TD_ZERO };
    } else {
      internal = { date: T$ZERO_DATE_DURATION, time: T$roundTimeDuration(internal.time, roundingIncrement, smallestUnit, roundingMode) };
    }
    return T$createDuration(T$temporalDurationFromInternal(internal, largestUnit));
  }
  total(totalOf) {
    const d = T$get(this, T$B_DURATION, 'total').d;
    if (totalOf === undefined) throw new TypeError('options parameter is required');
    if (typeof totalOf === 'string') {
      const o = Object.create(null);
      o.unit = totalOf;
      totalOf = o;
    } else totalOf = T$getOptionsObject(totalOf);
    const rel = T$getRelativeTo(totalOf);
    const unit = T$getUnitOption(totalOf, 'unit', T$REQUIRED);
    T$validateUnit(unit, 'datetime');
    if (rel.zoned !== undefined) {
      const z = T$get(rel.zoned, T$B_ZDT, 'total');
      const target = T$addZonedDateTime(z.epochNs, z.timeZone, z.calendar, T$toInternalDuration(d), 'constrain');
      return T$differenceZonedDateTimeWithTotal(z.epochNs, target, z.timeZone, z.calendar, unit);
    }
    if (rel.plain !== undefined) {
      const p = T$get(rel.plain, T$B_DATE, 'total');
      return T$differencePlainDateTimeWithTotal(T$dateTime(p.date, T$MIDNIGHT), T$plainRelativeTarget(p, d), p.calendar, unit);
    }
    const largestUnit = T$defaultLargestUnit(d);
    if (T$isCalendarUnit(largestUnit) || T$isCalendarUnit(unit)) throw new RangeError('relativeTo is required for calendar units');
    const internal = T$toInternalDurationWith24HourDays(d);
    return T$tdTotal(internal.time, T$unitNs(unit));
  }
  toString(options = undefined) {
    const d = T$get(this, T$B_DURATION, 'toString').d;
    const o = T$getOptionsObject(options);
    const digits = T$getFractionalSecondDigitsOption(o);
    const roundingMode = T$getRoundingModeOption(o, 'trunc');
    const smallestUnit = T$getUnitOption(o, 'smallestUnit', undefined);
    if (smallestUnit === 'hour' || smallestUnit === 'minute') throw new RangeError('smallestUnit must be second or smaller');
    const precision = T$toSecondsStringPrecision(smallestUnit, digits);
    if (precision.unit === 'nanosecond' && precision.increment === 1) return T$temporalDurationToString(d, precision.precision);
    const largestUnit = T$defaultLargestUnit(d);
    let internal = T$toInternalDuration(d);
    const td = T$roundTimeDuration(internal.time, precision.increment, precision.unit, roundingMode);
    internal = { date: internal.date, time: td };
    const rounded = T$temporalDurationFromInternal(internal, T$largerUnit(largestUnit, 'second'));
    return T$temporalDurationToString(rounded, precision.precision);
  }
  toJSON() { return T$temporalDurationToString(T$get(this, T$B_DURATION, 'toJSON').d, 'auto'); }
  toLocaleString(locales = undefined, options = undefined) {
    if ($IntlHooks$ !== undefined) {
      T$get(this, T$B_DURATION, 'toLocaleString');
      return $IntlHooks$.temporal(this, 'Duration', locales, options);
    }
    return T$temporalDurationToString(T$get(this, T$B_DURATION, 'toLocaleString').d, 'auto');
  }
  valueOf() { throw new TypeError('Temporal.Duration cannot be converted to a primitive'); }
};

const T$addToInstant = (op, sl, durationLike) => {
  const d = T$toDurationRecord(durationLike, op === 'subtract');
  if (T$isDateUnit(T$defaultLargestUnit(d))) throw new RangeError('Instant arithmetic does not support date units');
  const internal = T$toInternalDurationWith24HourDays(d);
  return T$createInstant(T$addInstant(sl.epochNs, internal.time));
};
const T$differenceInstantOp = (op, sl, other, options) => {
  const o = T$get(T$toTemporalInstant(other), T$B_INSTANT, op);
  const settings = T$getDifferenceSettings(op, T$getOptionsObject(options), 'time', [], 'nanosecond', 'second');
  const internal = T$differenceInstant(sl.epochNs, o.epochNs, settings.roundingIncrement, settings.smallestUnit, settings.roundingMode);
  return T$createDifferenceDuration(op, T$temporalDurationFromInternal(internal, settings.largestUnit));
};
const T$Instant = class Instant {
  constructor(epochNanoseconds) {
    if (new.target === undefined) throw new TypeError('Constructor requires new');
    const en = T$toBigIntEpoch(epochNanoseconds);
    if (!T$isValidEpochNs(en)) throw new RangeError('epoch nanoseconds out of range');
    T$createInstant(en, this);
  }
  static from(item) { return T$toTemporalInstant(item); }
  static fromEpochMilliseconds(epochMilliseconds) {
    const n = T$toNumber(epochMilliseconds);
    if (n !== n || n === Infinity || n === -Infinity || Math.trunc(n) !== n) throw new RangeError('epochMilliseconds must be an integer');
    if (Math.abs(n) > 8.64e15) throw new RangeError('epoch milliseconds out of range');
    const ms = T$fmod(n, 1000);
    return T$createInstant(T$td((n - ms) / 1000, ms * 1000000));
  }
  static fromEpochNanoseconds(epochNanoseconds) {
    const en = T$toBigIntEpoch(epochNanoseconds);
    return T$createInstant(en);
  }
  static compare(one, two) {
    const a = T$get(T$toTemporalInstant(one), T$B_INSTANT, 'compare');
    const b = T$get(T$toTemporalInstant(two), T$B_INSTANT, 'compare');
    return T$tdCmp(a.epochNs, b.epochNs);
  }
  get epochMilliseconds() {
    const en = T$get(this, T$B_INSTANT, 'epochMilliseconds').epochNs;
    return en.sec * 1000 + Math.floor(en.ns / 1000000);
  }
  get epochNanoseconds() { return T$tdToBigInt(T$get(this, T$B_INSTANT, 'epochNanoseconds').epochNs); }
  add(temporalDurationLike) { return T$addToInstant('add', T$get(this, T$B_INSTANT, 'add'), temporalDurationLike); }
  subtract(temporalDurationLike) { return T$addToInstant('subtract', T$get(this, T$B_INSTANT, 'subtract'), temporalDurationLike); }
  until(other, options = undefined) { return T$differenceInstantOp('until', T$get(this, T$B_INSTANT, 'until'), other, options); }
  since(other, options = undefined) { return T$differenceInstantOp('since', T$get(this, T$B_INSTANT, 'since'), other, options); }
  round(roundTo) {
    const sl = T$get(this, T$B_INSTANT, 'round');
    roundTo = T$roundToOptions(roundTo);
    const roundingIncrement = T$getRoundingIncrementOption(roundTo);
    const roundingMode = T$getRoundingModeOption(roundTo, 'halfExpand');
    const smallestUnit = T$getUnitOption(roundTo, 'smallestUnit', T$REQUIRED);
    T$validateUnit(smallestUnit, 'time');
    const max = 86400e9 / T$unitNs(smallestUnit);
    T$validateRoundingIncrement(roundingIncrement, max, true);
    return T$createInstant(T$roundTemporalInstant(sl.epochNs, roundingIncrement, smallestUnit, roundingMode));
  }
  equals(other) {
    const sl = T$get(this, T$B_INSTANT, 'equals');
    const o = T$get(T$toTemporalInstant(other), T$B_INSTANT, 'equals');
    return T$tdCmp(sl.epochNs, o.epochNs) === 0;
  }
  toString(options = undefined) {
    const sl = T$get(this, T$B_INSTANT, 'toString');
    const o = T$getOptionsObject(options);
    const digits = T$getFractionalSecondDigitsOption(o);
    const roundingMode = T$getRoundingModeOption(o, 'trunc');
    const smallestUnit = T$getUnitOption(o, 'smallestUnit', undefined);
    let tz = o.timeZone;
    const precision = T$toSecondsStringPrecision(smallestUnit, digits);
    if (tz !== undefined) tz = T$toTemporalTimeZoneIdentifier(tz);
    const ns = T$checkEpochNs(T$roundTemporalInstant(sl.epochNs, precision.increment, precision.unit, roundingMode));
    return T$temporalInstantToString(ns, tz, precision.precision);
  }
  toJSON() { return T$temporalInstantToString(T$get(this, T$B_INSTANT, 'toJSON').epochNs, undefined, 'auto'); }
  toLocaleString(locales = undefined, options = undefined) {
    if ($IntlHooks$ !== undefined) {
      T$get(this, T$B_INSTANT, 'toLocaleString');
      return $IntlHooks$.temporal(this, 'Instant', locales, options);
    }
    return T$temporalInstantToString(T$get(this, T$B_INSTANT, 'toLocaleString').epochNs, undefined, 'auto');
  }
  valueOf() { throw new TypeError('Temporal.Instant cannot be converted to a primitive'); }
  toZonedDateTimeISO(timeZone) {
    const sl = T$get(this, T$B_INSTANT, 'toZonedDateTimeISO');
    const tz = T$toTemporalTimeZoneIdentifier(timeZone);
    return T$createZonedDateTime(sl.epochNs, tz, 'iso8601');
  }
};

const T$addToDate = (op, s, durationLike, options) => {
  const d = T$toDurationRecord(durationLike, op === 'subtract');
  const dateDuration = T$toDateDurationWithoutTime(d);
  const overflow = T$getOverflowOption(T$getOptionsObject(options));
  return T$createPlainDate(T$calendarDateAdd(s.calendar, s.date, dateDuration, overflow), s.calendar);
};
const T$differenceDateOp = (op, s, other, options) => {
  const o = T$get(T$toTemporalDate(other), T$B_DATE, op);
  if (s.calendar !== o.calendar) throw new RangeError('calendars do not match');
  const settings = T$getDifferenceSettings(op, T$getOptionsObject(options), 'date', [], 'day', 'day');
  if (T$compareISODate(s.date, o.date) === 0) return T$createDuration(T$ZERO_DURATION);
  const dateDifference = T$calendarDateUntil(s.calendar, s.date, o.date, settings.largestUnit);
  let duration = { date: dateDifference, time: T$TD_ZERO };
  if (!(settings.smallestUnit === 'day' && settings.roundingIncrement === 1)) {
    const start = T$dateTime(s.date, T$MIDNIGHT);
    const dest = T$utcEpochNs(T$dateTime(o.date, T$MIDNIGHT));
    duration = T$roundRelativeDuration(duration, T$utcEpochNs(start), dest, start, undefined, s.calendar, settings.largestUnit, settings.roundingIncrement, settings.smallestUnit, settings.roundingMode);
  }
  return T$createDifferenceDuration(op, T$temporalDurationFromInternal(duration, 'day'));
};
const T$PlainDate = class PlainDate {
  constructor(isoYear, isoMonth, isoDay, calendar = undefined) {
    if (new.target === undefined) throw new TypeError('Constructor requires new');
    const y = T$toIntegerWithTruncation(isoYear);
    const m = T$toIntegerWithTruncation(isoMonth);
    const d = T$toIntegerWithTruncation(isoDay);
    const cal = T$checkCalendarArg(calendar);
    if (!T$isValidISODate(y, m, d)) throw new RangeError('invalid date');
    T$createPlainDate(T$isoDate(y, m, d), cal, this);
  }
  static from(item, options = undefined) { return T$toTemporalDate(item, options); }
  static compare(one, two) {
    const a = T$get(T$toTemporalDate(one), T$B_DATE, 'compare');
    const b = T$get(T$toTemporalDate(two), T$B_DATE, 'compare');
    return T$compareISODate(a.date, b.date);
  }
  get calendarId() { return T$get(this, T$B_DATE, 'calendarId').calendar; }
  toPlainYearMonth() {
    const s = T$get(this, T$B_DATE, 'toPlainYearMonth');
    const fields = T$isoDateToFields(s.calendar, s.date, 'date');
    return T$createPlainYearMonth(T$calendarYearMonthFromFields(s.calendar, fields, 'constrain'), s.calendar);
  }
  toPlainMonthDay() {
    const s = T$get(this, T$B_DATE, 'toPlainMonthDay');
    const fields = T$isoDateToFields(s.calendar, s.date, 'date');
    return T$createPlainMonthDay(T$calendarMonthDayFromFields(s.calendar, fields, 'constrain'), s.calendar);
  }
  add(temporalDurationLike, options = undefined) { return T$addToDate('add', T$get(this, T$B_DATE, 'add'), temporalDurationLike, options); }
  subtract(temporalDurationLike, options = undefined) { return T$addToDate('subtract', T$get(this, T$B_DATE, 'subtract'), temporalDurationLike, options); }
  with(temporalDateLike, options = undefined) {
    const s = T$get(this, T$B_DATE, 'with');
    if (!T$isObject(temporalDateLike)) throw new TypeError('argument must be an object');
    T$rejectTemporalLikeObject(temporalDateLike);
    let fields = T$isoDateToFields(s.calendar, s.date, 'date');
    const partial = T$prepareCalendarFields(s.calendar, temporalDateLike, [ 'year', 'month', 'monthCode', 'day' ], [], 'partial');
    fields = T$calendarMergeFields(s.calendar, fields, partial);
    const overflow = T$getOverflowOption(T$getOptionsObject(options));
    return T$createPlainDate(T$calendarDateFromFields(s.calendar, fields, overflow), s.calendar);
  }
  withCalendar(calendarLike) {
    const s = T$get(this, T$B_DATE, 'withCalendar');
    return T$createPlainDate(s.date, T$toTemporalCalendarIdentifier(calendarLike));
  }
  until(other, options = undefined) { return T$differenceDateOp('until', T$get(this, T$B_DATE, 'until'), other, options); }
  since(other, options = undefined) { return T$differenceDateOp('since', T$get(this, T$B_DATE, 'since'), other, options); }
  equals(other) {
    const s = T$get(this, T$B_DATE, 'equals');
    const o = T$get(T$toTemporalDate(other), T$B_DATE, 'equals');
    return T$compareISODate(s.date, o.date) === 0 && s.calendar === o.calendar;
  }
  toPlainDateTime(temporalTime = undefined) {
    const s = T$get(this, T$B_DATE, 'toPlainDateTime');
    const t = T$toTimeRecordOrMidnight(temporalTime);
    return T$createPlainDateTime(T$dateTime(s.date, t), s.calendar);
  }
  toZonedDateTime(item) {
    const s = T$get(this, T$B_DATE, 'toZonedDateTime');
    let tz, temporalTime;
    if (T$isObject(item)) {
      const tzLike = item.timeZone;
      if (tzLike === undefined) tz = T$toTemporalTimeZoneIdentifier(item);
      else {
        tz = T$toTemporalTimeZoneIdentifier(tzLike);
        temporalTime = item.plainTime;
      }
    } else tz = T$toTemporalTimeZoneIdentifier(item);
    let en;
    if (temporalTime === undefined) en = T$getStartOfDay(tz, s.date);
    else {
      const t = T$get(T$toTemporalTime(temporalTime), T$B_TIME, 'toZonedDateTime').time;
      const dt = T$dateTime(s.date, t);
      if (!T$isoDateTimeWithinLimits(dt)) throw new RangeError('date-time out of range');
      en = T$getEpochNsFor(tz, dt, 'compatible');
    }
    return T$createZonedDateTime(en, tz, s.calendar);
  }
  toString(options = undefined) {
    const s = T$get(this, T$B_DATE, 'toString');
    const show = T$getShowCalendarOption(T$getOptionsObject(options));
    return T$temporalDateToString(s, show);
  }
  toLocaleString(locales = undefined, options = undefined) {
    if ($IntlHooks$ !== undefined) {
      T$get(this, T$B_DATE, 'toLocaleString');
      return $IntlHooks$.temporal(this, 'PlainDate', locales, options);
    }
    return T$temporalDateToString(T$get(this, T$B_DATE, 'toLocaleString'), 'auto');
  }
  toJSON() { return T$temporalDateToString(T$get(this, T$B_DATE, 'toJSON'), 'auto'); }
  valueOf() { throw new TypeError('Temporal.PlainDate cannot be converted to a primitive'); }
};

const T$addToDateTime = (op, s, durationLike, options) => {
  const d = T$toDurationRecord(durationLike, op === 'subtract');
  const overflow = T$getOverflowOption(T$getOptionsObject(options));
  const internal = T$toInternalDurationWith24HourDays(d);
  const timeResult = T$addTime(s.dateTime.time, internal.time);
  const dateDuration = T$adjustDateDuration(internal.date, timeResult.days);
  const addedDate = T$calendarDateAdd(s.calendar, s.dateTime.date, dateDuration, overflow);
  return T$createPlainDateTime(T$dateTime(addedDate, T$stripDays(timeResult)), s.calendar);
};
const T$differenceDateTimeOp = (op, s, other, options) => {
  const o = T$get(T$toTemporalDateTime(other), T$B_DATETIME, op);
  if (s.calendar !== o.calendar) throw new RangeError('calendars do not match');
  const settings = T$getDifferenceSettings(op, T$getOptionsObject(options), 'datetime', [], 'nanosecond', 'day');
  if (T$compareISODateTime(s.dateTime, o.dateTime) === 0) return T$createDuration(T$ZERO_DURATION);
  const internal = T$differencePlainDateTimeWithRounding(s.dateTime, o.dateTime, s.calendar, settings.largestUnit, settings.roundingIncrement, settings.smallestUnit, settings.roundingMode);
  return T$createDifferenceDuration(op, T$temporalDurationFromInternal(internal, settings.largestUnit));
};
const T$PlainDateTime = class PlainDateTime {
  constructor(isoYear, isoMonth, isoDay, hour = undefined, minute = undefined, second = undefined, millisecond = undefined, microsecond = undefined, nanosecond = undefined, calendar = undefined) {
    if (new.target === undefined) throw new TypeError('Constructor requires new');
    const y = T$toIntegerWithTruncation(isoYear);
    const mo = T$toIntegerWithTruncation(isoMonth);
    const d = T$toIntegerWithTruncation(isoDay);
    const h = hour === undefined ? 0 : T$toIntegerWithTruncation(hour);
    const mi = minute === undefined ? 0 : T$toIntegerWithTruncation(minute);
    const s = second === undefined ? 0 : T$toIntegerWithTruncation(second);
    const ms = millisecond === undefined ? 0 : T$toIntegerWithTruncation(millisecond);
    const us = microsecond === undefined ? 0 : T$toIntegerWithTruncation(microsecond);
    const ns = nanosecond === undefined ? 0 : T$toIntegerWithTruncation(nanosecond);
    const cal = T$checkCalendarArg(calendar);
    if (!T$isValidISODate(y, mo, d)) throw new RangeError('invalid date');
    if (!T$isValidTime(h, mi, s, ms, us, ns)) throw new RangeError('invalid time');
    T$createPlainDateTime(T$dateTime(T$isoDate(y, mo, d), T$time(h, mi, s, ms, us, ns)), cal, this);
  }
  static from(item, options = undefined) { return T$toTemporalDateTime(item, options); }
  static compare(one, two) {
    const a = T$get(T$toTemporalDateTime(one), T$B_DATETIME, 'compare');
    const b = T$get(T$toTemporalDateTime(two), T$B_DATETIME, 'compare');
    return T$compareISODateTime(a.dateTime, b.dateTime);
  }
  get calendarId() { return T$get(this, T$B_DATETIME, 'calendarId').calendar; }
  with(temporalDateTimeLike, options = undefined) {
    const s = T$get(this, T$B_DATETIME, 'with');
    if (!T$isObject(temporalDateTimeLike)) throw new TypeError('argument must be an object');
    T$rejectTemporalLikeObject(temporalDateTimeLike);
    let fields = T$isoDateToFields(s.calendar, s.dateTime.date, 'date');
    const t = s.dateTime.time;
    fields.hour = t.hour;
    fields.minute = t.minute;
    fields.second = t.second;
    fields.millisecond = t.millisecond;
    fields.microsecond = t.microsecond;
    fields.nanosecond = t.nanosecond;
    const partial = T$prepareCalendarFields(s.calendar, temporalDateTimeLike, [ 'year', 'month', 'monthCode', 'day' ], T$TIME_FIELDS, 'partial');
    fields = T$calendarMergeFields(s.calendar, fields, partial);
    const overflow = T$getOverflowOption(T$getOptionsObject(options));
    return T$createPlainDateTime(T$interpretTemporalDateTimeFields(s.calendar, fields, overflow), s.calendar);
  }
  withPlainTime(plainTimeLike = undefined) {
    const s = T$get(this, T$B_DATETIME, 'withPlainTime');
    const t = T$toTimeRecordOrMidnight(plainTimeLike);
    return T$createPlainDateTime(T$dateTime(s.dateTime.date, t), s.calendar);
  }
  withCalendar(calendarLike) {
    const s = T$get(this, T$B_DATETIME, 'withCalendar');
    return T$createPlainDateTime(s.dateTime, T$toTemporalCalendarIdentifier(calendarLike));
  }
  add(temporalDurationLike, options = undefined) { return T$addToDateTime('add', T$get(this, T$B_DATETIME, 'add'), temporalDurationLike, options); }
  subtract(temporalDurationLike, options = undefined) { return T$addToDateTime('subtract', T$get(this, T$B_DATETIME, 'subtract'), temporalDurationLike, options); }
  until(other, options = undefined) { return T$differenceDateTimeOp('until', T$get(this, T$B_DATETIME, 'until'), other, options); }
  since(other, options = undefined) { return T$differenceDateTimeOp('since', T$get(this, T$B_DATETIME, 'since'), other, options); }
  round(roundTo) {
    const s = T$get(this, T$B_DATETIME, 'round');
    roundTo = T$roundToOptions(roundTo);
    const roundingIncrement = T$getRoundingIncrementOption(roundTo);
    const roundingMode = T$getRoundingModeOption(roundTo, 'halfExpand');
    const smallestUnit = T$getUnitOption(roundTo, 'smallestUnit', T$REQUIRED);
    T$validateUnit(smallestUnit, 'time', [ 'day' ]);
    if (smallestUnit === 'day') T$validateRoundingIncrement(roundingIncrement, 1, true);
    else T$validateRoundingIncrement(roundingIncrement, T$maxRoundingIncrement(smallestUnit), false);
    if (smallestUnit === 'nanosecond' && roundingIncrement === 1) return T$createPlainDateTime(s.dateTime, s.calendar);
    return T$createPlainDateTime(T$roundISODateTime(s.dateTime, roundingIncrement, smallestUnit, roundingMode), s.calendar);
  }
  equals(other) {
    const s = T$get(this, T$B_DATETIME, 'equals');
    const o = T$get(T$toTemporalDateTime(other), T$B_DATETIME, 'equals');
    return T$compareISODateTime(s.dateTime, o.dateTime) === 0 && s.calendar === o.calendar;
  }
  toString(options = undefined) {
    const s = T$get(this, T$B_DATETIME, 'toString');
    const o = T$getOptionsObject(options);
    const showCalendar = T$getShowCalendarOption(o);
    const digits = T$getFractionalSecondDigitsOption(o);
    const roundingMode = T$getRoundingModeOption(o, 'trunc');
    const smallestUnit = T$getUnitOption(o, 'smallestUnit', undefined);
    const precision = T$toSecondsStringPrecision(smallestUnit, digits);
    const result = T$roundISODateTime(s.dateTime, precision.increment, precision.unit, roundingMode);
    if (!T$isoDateTimeWithinLimits(result)) throw new RangeError('date-time out of range');
    return T$isoDateTimeToString(result, s.calendar, precision.precision, showCalendar);
  }
  toLocaleString(locales = undefined, options = undefined) {
    if ($IntlHooks$ !== undefined) {
      T$get(this, T$B_DATETIME, 'toLocaleString');
      return $IntlHooks$.temporal(this, 'PlainDateTime', locales, options);
    }
    const s = T$get(this, T$B_DATETIME, 'toLocaleString');
    return T$isoDateTimeToString(s.dateTime, s.calendar, 'auto', 'auto');
  }
  toJSON() {
    const s = T$get(this, T$B_DATETIME, 'toJSON');
    return T$isoDateTimeToString(s.dateTime, s.calendar, 'auto', 'auto');
  }
  valueOf() { throw new TypeError('Temporal.PlainDateTime cannot be converted to a primitive'); }
  toZonedDateTime(temporalTimeZoneLike, options = undefined) {
    const s = T$get(this, T$B_DATETIME, 'toZonedDateTime');
    const tz = T$toTemporalTimeZoneIdentifier(temporalTimeZoneLike);
    const disambiguation = T$getDisambiguationOption(T$getOptionsObject(options));
    return T$createZonedDateTime(T$getEpochNsFor(tz, s.dateTime, disambiguation), tz, s.calendar);
  }
  toPlainDate() {
    const s = T$get(this, T$B_DATETIME, 'toPlainDate');
    return T$createPlainDate(s.dateTime.date, s.calendar);
  }
  toPlainTime() { return T$createPlainTime(T$get(this, T$B_DATETIME, 'toPlainTime').dateTime.time); }
};

const T$addToTime = (op, s, durationLike) => {
  const d = T$toDurationRecord(durationLike, op === 'subtract');
  const internal = T$toInternalDuration(d);
  return T$createPlainTime(T$addTime(s.time, internal.time));
};
const T$differenceTimeOp = (op, s, other, options) => {
  const o = T$get(T$toTemporalTime(other), T$B_TIME, op);
  const settings = T$getDifferenceSettings(op, T$getOptionsObject(options), 'time', [], 'nanosecond', 'hour');
  let td = T$differenceTime(s.time, o.time);
  td = T$roundTimeDuration(td, settings.roundingIncrement, settings.smallestUnit, settings.roundingMode);
  return T$createDifferenceDuration(op, T$temporalDurationFromInternal({ date: T$ZERO_DATE_DURATION, time: td }, settings.largestUnit));
};
const T$PlainTime = class PlainTime {
  constructor(hour = undefined, minute = undefined, second = undefined, millisecond = undefined, microsecond = undefined, nanosecond = undefined) {
    if (new.target === undefined) throw new TypeError('Constructor requires new');
    const h = hour === undefined ? 0 : T$toIntegerWithTruncation(hour);
    const mi = minute === undefined ? 0 : T$toIntegerWithTruncation(minute);
    const s = second === undefined ? 0 : T$toIntegerWithTruncation(second);
    const ms = millisecond === undefined ? 0 : T$toIntegerWithTruncation(millisecond);
    const us = microsecond === undefined ? 0 : T$toIntegerWithTruncation(microsecond);
    const ns = nanosecond === undefined ? 0 : T$toIntegerWithTruncation(nanosecond);
    if (!T$isValidTime(h, mi, s, ms, us, ns)) throw new RangeError('invalid time');
    T$createPlainTime(T$time(h, mi, s, ms, us, ns), this);
  }
  static from(item, options = undefined) { return T$toTemporalTime(item, options); }
  static compare(one, two) {
    const a = T$get(T$toTemporalTime(one), T$B_TIME, 'compare');
    const b = T$get(T$toTemporalTime(two), T$B_TIME, 'compare');
    return T$compareTime(a.time, b.time);
  }
  add(temporalDurationLike) { return T$addToTime('add', T$get(this, T$B_TIME, 'add'), temporalDurationLike); }
  subtract(temporalDurationLike) { return T$addToTime('subtract', T$get(this, T$B_TIME, 'subtract'), temporalDurationLike); }
  with(temporalTimeLike, options = undefined) {
    const s = T$get(this, T$B_TIME, 'with');
    if (!T$isObject(temporalTimeLike)) throw new TypeError('argument must be an object');
    T$rejectTemporalLikeObject(temporalTimeLike);
    const p = T$toTemporalTimeRecord(temporalTimeLike, true);
    const t = s.time;
    const h = p.hour === undefined ? t.hour : p.hour;
    const mi = p.minute === undefined ? t.minute : p.minute;
    const sec = p.second === undefined ? t.second : p.second;
    const ms = p.millisecond === undefined ? t.millisecond : p.millisecond;
    const us = p.microsecond === undefined ? t.microsecond : p.microsecond;
    const ns = p.nanosecond === undefined ? t.nanosecond : p.nanosecond;
    const overflow = T$getOverflowOption(T$getOptionsObject(options));
    return T$createPlainTime(T$regulateTime(h, mi, sec, ms, us, ns, overflow));
  }
  until(other, options = undefined) { return T$differenceTimeOp('until', T$get(this, T$B_TIME, 'until'), other, options); }
  since(other, options = undefined) { return T$differenceTimeOp('since', T$get(this, T$B_TIME, 'since'), other, options); }
  round(roundTo) {
    const s = T$get(this, T$B_TIME, 'round');
    roundTo = T$roundToOptions(roundTo);
    const roundingIncrement = T$getRoundingIncrementOption(roundTo);
    const roundingMode = T$getRoundingModeOption(roundTo, 'halfExpand');
    const smallestUnit = T$getUnitOption(roundTo, 'smallestUnit', T$REQUIRED);
    T$validateUnit(smallestUnit, 'time');
    T$validateRoundingIncrement(roundingIncrement, T$maxRoundingIncrement(smallestUnit), false);
    return T$createPlainTime(T$roundTime(s.time, roundingIncrement, smallestUnit, roundingMode));
  }
  equals(other) {
    const s = T$get(this, T$B_TIME, 'equals');
    const o = T$get(T$toTemporalTime(other), T$B_TIME, 'equals');
    return T$compareTime(s.time, o.time) === 0;
  }
  toString(options = undefined) {
    const s = T$get(this, T$B_TIME, 'toString');
    const o = T$getOptionsObject(options);
    const digits = T$getFractionalSecondDigitsOption(o);
    const roundingMode = T$getRoundingModeOption(o, 'trunc');
    const smallestUnit = T$getUnitOption(o, 'smallestUnit', undefined);
    const precision = T$toSecondsStringPrecision(smallestUnit, digits);
    return T$formatTimeString(T$roundTime(s.time, precision.increment, precision.unit, roundingMode), precision.precision);
  }
  toLocaleString(locales = undefined, options = undefined) {
    if ($IntlHooks$ !== undefined) {
      T$get(this, T$B_TIME, 'toLocaleString');
      return $IntlHooks$.temporal(this, 'PlainTime', locales, options);
    }
    return T$formatTimeString(T$get(this, T$B_TIME, 'toLocaleString').time, 'auto');
  }
  toJSON() { return T$formatTimeString(T$get(this, T$B_TIME, 'toJSON').time, 'auto'); }
  valueOf() { throw new TypeError('Temporal.PlainTime cannot be converted to a primitive'); }
};

const T$addToYearMonth = (op, s, durationLike, options) => {
  const d = T$toDurationRecord(durationLike, op === 'subtract');
  const overflow = T$getOverflowOption(T$getOptionsObject(options));
  if (d.weeks !== 0 || d.days !== 0 || d.hours !== 0 || d.minutes !== 0 || d.seconds !== 0 || d.milliseconds !== 0 || d.microseconds !== 0 || d.nanoseconds !== 0) throw new RangeError('only years and months can be added to a PlainYearMonth');
  const fields = T$isoDateToFields(s.calendar, s.date, 'year-month');
  fields.day = 1;
  const intermediate = T$calendarDateFromFields(s.calendar, fields, 'constrain');
  const addedDate = T$calendarDateAdd(s.calendar, intermediate, T$dateDuration(d.years, d.months, 0, 0), overflow);
  const addedFields = T$isoDateToFields(s.calendar, addedDate, 'year-month');
  return T$createPlainYearMonth(T$calendarYearMonthFromFields(s.calendar, addedFields, overflow), s.calendar);
};
const T$differenceYearMonthOp = (op, s, other, options) => {
  const o = T$get(T$toTemporalYearMonth(other), T$B_YM, op);
  if (s.calendar !== o.calendar) throw new RangeError('calendars do not match');
  const settings = T$getDifferenceSettings(op, T$getOptionsObject(options), 'date', [ 'week', 'day' ], 'month', 'year');
  if (T$compareISODate(s.date, o.date) === 0) return T$createDuration(T$ZERO_DURATION);
  const thisFields = T$isoDateToFields(s.calendar, s.date, 'year-month');
  thisFields.day = 1;
  const thisDate = T$calendarDateFromFields(s.calendar, thisFields, 'constrain');
  const otherFields = T$isoDateToFields(s.calendar, o.date, 'year-month');
  otherFields.day = 1;
  const otherDate = T$calendarDateFromFields(s.calendar, otherFields, 'constrain');
  const dateDifference = T$calendarDateUntil(s.calendar, thisDate, otherDate, settings.largestUnit);
  let duration = { date: T$adjustDateDuration(dateDifference, 0, 0), time: T$TD_ZERO };
  if (settings.smallestUnit !== 'month' || settings.roundingIncrement !== 1) {
    const start = T$dateTime(thisDate, T$MIDNIGHT);
    const dest = T$utcEpochNs(T$dateTime(otherDate, T$MIDNIGHT));
    duration = T$roundRelativeDuration(duration, T$utcEpochNs(start), dest, start, undefined, s.calendar, settings.largestUnit, settings.roundingIncrement, settings.smallestUnit, settings.roundingMode);
  }
  return T$createDifferenceDuration(op, T$temporalDurationFromInternal(duration, 'day'));
};
const T$PlainYearMonth = class PlainYearMonth {
  constructor(isoYear, isoMonth, calendar = undefined, referenceISODay = undefined) {
    if (new.target === undefined) throw new TypeError('Constructor requires new');
    const y = T$toIntegerWithTruncation(isoYear);
    const m = T$toIntegerWithTruncation(isoMonth);
    const cal = T$checkCalendarArg(calendar);
    const ref = referenceISODay === undefined ? 1 : T$toIntegerWithTruncation(referenceISODay);
    if (!T$isValidISODate(y, m, ref)) throw new RangeError('invalid date');
    T$createPlainYearMonth(T$isoDate(y, m, ref), cal, this);
  }
  static from(item, options = undefined) { return T$toTemporalYearMonth(item, options); }
  static compare(one, two) {
    const a = T$get(T$toTemporalYearMonth(one), T$B_YM, 'compare');
    const b = T$get(T$toTemporalYearMonth(two), T$B_YM, 'compare');
    return T$compareISODate(a.date, b.date);
  }
  get calendarId() { return T$get(this, T$B_YM, 'calendarId').calendar; }
  with(temporalYearMonthLike, options = undefined) {
    const s = T$get(this, T$B_YM, 'with');
    if (!T$isObject(temporalYearMonthLike)) throw new TypeError('argument must be an object');
    T$rejectTemporalLikeObject(temporalYearMonthLike);
    let fields = T$isoDateToFields(s.calendar, s.date, 'year-month');
    const partial = T$prepareCalendarFields(s.calendar, temporalYearMonthLike, [ 'year', 'month', 'monthCode' ], [], 'partial');
    fields = T$calendarMergeFields(s.calendar, fields, partial);
    const overflow = T$getOverflowOption(T$getOptionsObject(options));
    return T$createPlainYearMonth(T$calendarYearMonthFromFields(s.calendar, fields, overflow), s.calendar);
  }
  add(temporalDurationLike, options = undefined) { return T$addToYearMonth('add', T$get(this, T$B_YM, 'add'), temporalDurationLike, options); }
  subtract(temporalDurationLike, options = undefined) { return T$addToYearMonth('subtract', T$get(this, T$B_YM, 'subtract'), temporalDurationLike, options); }
  until(other, options = undefined) { return T$differenceYearMonthOp('until', T$get(this, T$B_YM, 'until'), other, options); }
  since(other, options = undefined) { return T$differenceYearMonthOp('since', T$get(this, T$B_YM, 'since'), other, options); }
  equals(other) {
    const s = T$get(this, T$B_YM, 'equals');
    const o = T$get(T$toTemporalYearMonth(other), T$B_YM, 'equals');
    return T$compareISODate(s.date, o.date) === 0 && s.calendar === o.calendar;
  }
  toString(options = undefined) {
    const s = T$get(this, T$B_YM, 'toString');
    return T$temporalYearMonthToString(s, T$getShowCalendarOption(T$getOptionsObject(options)));
  }
  toLocaleString(locales = undefined, options = undefined) {
    if ($IntlHooks$ !== undefined) {
      T$get(this, T$B_YM, 'toLocaleString');
      return $IntlHooks$.temporal(this, 'PlainYearMonth', locales, options);
    }
    return T$temporalYearMonthToString(T$get(this, T$B_YM, 'toLocaleString'), 'auto');
  }
  toJSON() { return T$temporalYearMonthToString(T$get(this, T$B_YM, 'toJSON'), 'auto'); }
  valueOf() { throw new TypeError('Temporal.PlainYearMonth cannot be converted to a primitive'); }
  toPlainDate(item) {
    const s = T$get(this, T$B_YM, 'toPlainDate');
    if (!T$isObject(item)) throw new TypeError('argument must be an object');
    const fields = T$isoDateToFields(s.calendar, s.date, 'year-month');
    const input = T$prepareCalendarFields(s.calendar, item, [ 'day' ], [], []);
    const merged = T$calendarMergeFields(s.calendar, fields, input);
    return T$createPlainDate(T$calendarDateFromFields(s.calendar, merged, 'constrain'), s.calendar);
  }
};

const T$PlainMonthDay = class PlainMonthDay {
  constructor(isoMonth, isoDay, calendar = undefined, referenceISOYear = undefined) {
    if (new.target === undefined) throw new TypeError('Constructor requires new');
    const m = T$toIntegerWithTruncation(isoMonth);
    const d = T$toIntegerWithTruncation(isoDay);
    const cal = T$checkCalendarArg(calendar);
    const y = referenceISOYear === undefined ? 1972 : T$toIntegerWithTruncation(referenceISOYear);
    if (!T$isValidISODate(y, m, d)) throw new RangeError('invalid date');
    T$createPlainMonthDay(T$isoDate(y, m, d), cal, this);
  }
  static from(item, options = undefined) { return T$toTemporalMonthDay(item, options); }
  get calendarId() { return T$get(this, T$B_MD, 'calendarId').calendar; }
  with(temporalMonthDayLike, options = undefined) {
    const s = T$get(this, T$B_MD, 'with');
    if (!T$isObject(temporalMonthDayLike)) throw new TypeError('argument must be an object');
    T$rejectTemporalLikeObject(temporalMonthDayLike);
    let fields = T$isoDateToFields(s.calendar, s.date, 'month-day');
    const partial = T$prepareCalendarFields(s.calendar, temporalMonthDayLike, [ 'year', 'month', 'monthCode', 'day' ], [], 'partial');
    fields = T$calendarMergeFields(s.calendar, fields, partial);
    const overflow = T$getOverflowOption(T$getOptionsObject(options));
    return T$createPlainMonthDay(T$calendarMonthDayFromFields(s.calendar, fields, overflow), s.calendar);
  }
  equals(other) {
    const s = T$get(this, T$B_MD, 'equals');
    const o = T$get(T$toTemporalMonthDay(other), T$B_MD, 'equals');
    return T$compareISODate(s.date, o.date) === 0 && s.calendar === o.calendar;
  }
  toString(options = undefined) {
    const s = T$get(this, T$B_MD, 'toString');
    return T$temporalMonthDayToString(s, T$getShowCalendarOption(T$getOptionsObject(options)));
  }
  toLocaleString(locales = undefined, options = undefined) {
    if ($IntlHooks$ !== undefined) {
      T$get(this, T$B_MD, 'toLocaleString');
      return $IntlHooks$.temporal(this, 'PlainMonthDay', locales, options);
    }
    return T$temporalMonthDayToString(T$get(this, T$B_MD, 'toLocaleString'), 'auto');
  }
  toJSON() { return T$temporalMonthDayToString(T$get(this, T$B_MD, 'toJSON'), 'auto'); }
  valueOf() { throw new TypeError('Temporal.PlainMonthDay cannot be converted to a primitive'); }
  toPlainDate(item) {
    const s = T$get(this, T$B_MD, 'toPlainDate');
    if (!T$isObject(item)) throw new TypeError('argument must be an object');
    const fields = T$isoDateToFields(s.calendar, s.date, 'month-day');
    const input = T$prepareCalendarFields(s.calendar, item, [ 'year' ], [], []);
    const merged = T$calendarMergeFields(s.calendar, fields, input);
    return T$createPlainDate(T$calendarDateFromFields(s.calendar, merged, 'constrain'), s.calendar);
  }
};

const T$addToZoned = (op, s, durationLike, options) => {
  const d = T$toDurationRecord(durationLike, op === 'subtract');
  const overflow = T$getOverflowOption(T$getOptionsObject(options));
  const internal = T$toInternalDuration(d);
  return T$createZonedDateTime(T$addZonedDateTime(s.epochNs, s.timeZone, s.calendar, internal, overflow), s.timeZone, s.calendar);
};
const T$differenceZonedOp = (op, s, other, options) => {
  const o = T$get(T$toTemporalZonedDateTime(other), T$B_ZDT, op);
  if (s.calendar !== o.calendar) throw new RangeError('calendars do not match');
  const settings = T$getDifferenceSettings(op, T$getOptionsObject(options), 'datetime', [], 'nanosecond', 'hour');
  if (!T$isDateUnit(settings.largestUnit)) {
    const internal = T$differenceInstant(s.epochNs, o.epochNs, settings.roundingIncrement, settings.smallestUnit, settings.roundingMode);
    return T$createDifferenceDuration(op, T$temporalDurationFromInternal(internal, settings.largestUnit));
  }
  if (!T$timeZoneEquals(s.timeZone, o.timeZone)) throw new RangeError('time zones do not match');
  if (T$tdCmp(s.epochNs, o.epochNs) === 0) return T$createDuration(T$ZERO_DURATION);
  const internal = T$differenceZonedDateTimeWithRounding(s.epochNs, o.epochNs, s.timeZone, s.calendar, settings.largestUnit, settings.roundingIncrement, settings.smallestUnit, settings.roundingMode);
  return T$createDifferenceDuration(op, T$temporalDurationFromInternal(internal, 'hour'));
};
const T$ZonedDateTime = class ZonedDateTime {
  constructor(epochNanoseconds, timeZone, calendar = undefined) {
    if (new.target === undefined) throw new TypeError('Constructor requires new');
    const en = T$toBigIntEpoch(epochNanoseconds);
    if (!T$isValidEpochNs(en)) throw new RangeError('epoch nanoseconds out of range');
    if (typeof timeZone !== 'string') throw new TypeError('time zone must be a string');
    const p = T$parseTimeZoneIdentifier(timeZone);
    if (p === null) throw new RangeError('invalid time zone: ' + timeZone);
    let tz;
    if (p.offsetMinutes !== undefined) tz = T$formatOffsetMinutes(p.offsetMinutes);
    else {
      tz = T$tzLookup(T$asciiLower(p.name));
      if (tz === undefined) throw new RangeError('unknown time zone: ' + timeZone);
    }
    const cal = T$checkCalendarArg(calendar);
    T$createZonedDateTime(en, tz, cal, this);
  }
  static from(item, options = undefined) { return T$toTemporalZonedDateTime(item, options); }
  static compare(one, two) {
    const a = T$get(T$toTemporalZonedDateTime(one), T$B_ZDT, 'compare');
    const b = T$get(T$toTemporalZonedDateTime(two), T$B_ZDT, 'compare');
    return T$tdCmp(a.epochNs, b.epochNs);
  }
  get calendarId() { return T$get(this, T$B_ZDT, 'calendarId').calendar; }
  get timeZoneId() { return T$get(this, T$B_ZDT, 'timeZoneId').timeZone; }
  get epochMilliseconds() {
    const en = T$get(this, T$B_ZDT, 'epochMilliseconds').epochNs;
    return en.sec * 1000 + Math.floor(en.ns / 1000000);
  }
  get epochNanoseconds() { return T$tdToBigInt(T$get(this, T$B_ZDT, 'epochNanoseconds').epochNs); }
  get hoursInDay() {
    const s = T$get(this, T$B_ZDT, 'hoursInDay');
    const today = T$zdtDateTime(s).date;
    const tomorrow = T$addDaysToISODate(today, 1);
    const todayNs = T$getStartOfDay(s.timeZone, today);
    const tomorrowNs = T$getStartOfDay(s.timeZone, tomorrow);
    return T$tdTotal(T$tdSub(tomorrowNs, todayNs), 3600e9);
  }
  get offsetNanoseconds() {
    const s = T$get(this, T$B_ZDT, 'offsetNanoseconds');
    return T$getOffsetNs(s.timeZone, s.epochNs);
  }
  get offset() {
    const s = T$get(this, T$B_ZDT, 'offset');
    return T$formatUTCOffsetNs(T$getOffsetNs(s.timeZone, s.epochNs));
  }
  with(temporalZonedDateTimeLike, options = undefined) {
    const s = T$get(this, T$B_ZDT, 'with');
    if (!T$isObject(temporalZonedDateTimeLike)) throw new TypeError('argument must be an object');
    T$rejectTemporalLikeObject(temporalZonedDateTimeLike);
    const offsetNs = T$getOffsetNs(s.timeZone, s.epochNs);
    const dt = T$getISODateTimeFor(s.timeZone, s.epochNs);
    let fields = T$isoDateToFields(s.calendar, dt.date, 'date');
    const t = dt.time;
    fields.hour = t.hour;
    fields.minute = t.minute;
    fields.second = t.second;
    fields.millisecond = t.millisecond;
    fields.microsecond = t.microsecond;
    fields.nanosecond = t.nanosecond;
    fields.offset = T$formatUTCOffsetNs(offsetNs);
    const partial = T$prepareCalendarFields(s.calendar, temporalZonedDateTimeLike, [ 'year', 'month', 'monthCode', 'day' ], T$TIME_FIELDS.concat([ 'offset' ]), 'partial');
    fields = T$calendarMergeFields(s.calendar, fields, partial);
    const o = T$getOptionsObject(options);
    const disambiguation = T$getDisambiguationOption(o);
    const offset = T$getOffsetOption(o, 'prefer');
    const overflow = T$getOverflowOption(o);
    const r = T$interpretTemporalDateTimeFields(s.calendar, fields, overflow);
    const newOffsetNs = T$parseDateTimeUTCOffset(fields.offset);
    const en = T$interpretISODateTimeOffset(r.date, r.time, 'option', newOffsetNs, s.timeZone, disambiguation, offset, 'match-exactly');
    return T$createZonedDateTime(en, s.timeZone, s.calendar);
  }
  withPlainTime(plainTimeLike = undefined) {
    const s = T$get(this, T$B_ZDT, 'withPlainTime');
    const dt = T$zdtDateTime(s);
    let en;
    if (plainTimeLike === undefined) en = T$getStartOfDay(s.timeZone, dt.date);
    else {
      const t = T$get(T$toTemporalTime(plainTimeLike), T$B_TIME, 'withPlainTime').time;
      en = T$getEpochNsFor(s.timeZone, T$dateTime(dt.date, t), 'compatible');
    }
    return T$createZonedDateTime(en, s.timeZone, s.calendar);
  }
  withTimeZone(timeZoneLike) {
    const s = T$get(this, T$B_ZDT, 'withTimeZone');
    return T$createZonedDateTime(s.epochNs, T$toTemporalTimeZoneIdentifier(timeZoneLike), s.calendar);
  }
  withCalendar(calendarLike) {
    const s = T$get(this, T$B_ZDT, 'withCalendar');
    return T$createZonedDateTime(s.epochNs, s.timeZone, T$toTemporalCalendarIdentifier(calendarLike));
  }
  add(temporalDurationLike, options = undefined) { return T$addToZoned('add', T$get(this, T$B_ZDT, 'add'), temporalDurationLike, options); }
  subtract(temporalDurationLike, options = undefined) { return T$addToZoned('subtract', T$get(this, T$B_ZDT, 'subtract'), temporalDurationLike, options); }
  until(other, options = undefined) { return T$differenceZonedOp('until', T$get(this, T$B_ZDT, 'until'), other, options); }
  since(other, options = undefined) { return T$differenceZonedOp('since', T$get(this, T$B_ZDT, 'since'), other, options); }
  round(roundTo) {
    const s = T$get(this, T$B_ZDT, 'round');
    roundTo = T$roundToOptions(roundTo);
    const roundingIncrement = T$getRoundingIncrementOption(roundTo);
    const roundingMode = T$getRoundingModeOption(roundTo, 'halfExpand');
    const smallestUnit = T$getUnitOption(roundTo, 'smallestUnit', T$REQUIRED);
    T$validateUnit(smallestUnit, 'time', [ 'day' ]);
    if (smallestUnit === 'day') T$validateRoundingIncrement(roundingIncrement, 1, true);
    else T$validateRoundingIncrement(roundingIncrement, T$maxRoundingIncrement(smallestUnit), false);
    if (smallestUnit === 'nanosecond' && roundingIncrement === 1) return T$createZonedDateTime(s.epochNs, s.timeZone, s.calendar);
    const dt = T$zdtDateTime(s);
    let en;
    if (smallestUnit === 'day') {
      const dateStart = dt.date;
      const dateEnd = T$addDaysToISODate(dateStart, 1);
      const startNs = T$getStartOfDay(s.timeZone, dateStart);
      const endNs = T$getStartOfDay(s.timeZone, dateEnd);
      const dayLength = T$tdSub(endNs, startNs);
      const progress = T$tdSub(s.epochNs, startNs);
      const len = dayLength.sec * 1e9 + dayLength.ns;
      // the wall-clock date may continue past the next day's start when midnight occurs twice
      const prog = Math.min(progress.sec * 1e9 + progress.ns, len - 1);
      const rounded = T$roundNumberToIncrement(prog, len, roundingMode);
      en = T$tdAdd(startNs, T$td(0, rounded));
    } else {
      const r = T$roundISODateTime(dt, roundingIncrement, smallestUnit, roundingMode);
      const offsetNs = T$getOffsetNs(s.timeZone, s.epochNs);
      en = T$interpretISODateTimeOffset(r.date, r.time, 'option', offsetNs, s.timeZone, 'compatible', 'prefer', 'match-exactly');
    }
    return T$createZonedDateTime(en, s.timeZone, s.calendar);
  }
  equals(other) {
    const s = T$get(this, T$B_ZDT, 'equals');
    const o = T$get(T$toTemporalZonedDateTime(other), T$B_ZDT, 'equals');
    return T$tdCmp(s.epochNs, o.epochNs) === 0 && T$timeZoneEquals(s.timeZone, o.timeZone) && s.calendar === o.calendar;
  }
  toString(options = undefined) {
    const s = T$get(this, T$B_ZDT, 'toString');
    const o = T$getOptionsObject(options);
    const showCalendar = T$getShowCalendarOption(o);
    const digits = T$getFractionalSecondDigitsOption(o);
    const showOffset = T$getShowOffsetOption(o);
    const roundingMode = T$getRoundingModeOption(o, 'trunc');
    const smallestUnit = T$getUnitOption(o, 'smallestUnit', undefined);
    const showTimeZone = T$getShowTimeZoneOption(o);
    const precision = T$toSecondsStringPrecision(smallestUnit, digits);
    return T$temporalZonedDateTimeToString(s, precision.precision, showCalendar, showTimeZone, showOffset, precision.increment, precision.unit, roundingMode);
  }
  toLocaleString(locales = undefined, options = undefined) {
    if ($IntlHooks$ !== undefined) {
      T$get(this, T$B_ZDT, 'toLocaleString');
      return $IntlHooks$.temporal(this, 'ZonedDateTime', locales, options);
    }
    return T$temporalZonedDateTimeToString(T$get(this, T$B_ZDT, 'toLocaleString'), 'auto', 'auto', 'auto', 'auto');
  }
  toJSON() { return T$temporalZonedDateTimeToString(T$get(this, T$B_ZDT, 'toJSON'), 'auto', 'auto', 'auto', 'auto'); }
  valueOf() { throw new TypeError('Temporal.ZonedDateTime cannot be converted to a primitive'); }
  startOfDay() {
    const s = T$get(this, T$B_ZDT, 'startOfDay');
    return T$createZonedDateTime(T$getStartOfDay(s.timeZone, T$zdtDateTime(s).date), s.timeZone, s.calendar);
  }
  getTimeZoneTransition(directionParam) {
    const s = T$get(this, T$B_ZDT, 'getTimeZoneTransition');
    if (directionParam === undefined) throw new TypeError('direction is required');
    let o;
    if (typeof directionParam === 'string') {
      o = Object.create(null);
      o.direction = directionParam;
    } else o = T$getOptionsObject(directionParam);
    const direction = T$getOption(o, 'direction', [ 'next', 'previous' ], T$REQUIRED);
    if (T$isOffsetTimeZone(s.timeZone) || T$isUTCZone(s.timeZone)) return null;
    const t = T$tzTransition(s.timeZone, s.epochNs, direction === 'next' ? 1 : -1);
    if (t === null) return null;
    return T$createZonedDateTime(t, s.timeZone, s.calendar);
  }
  toInstant() { return T$createInstant(T$get(this, T$B_ZDT, 'toInstant').epochNs); }
  toPlainDate() {
    const s = T$get(this, T$B_ZDT, 'toPlainDate');
    return T$createPlainDate(T$zdtDateTime(s).date, s.calendar);
  }
  toPlainTime() { return T$createPlainTime(T$zdtDateTime(T$get(this, T$B_ZDT, 'toPlainTime')).time); }
  toPlainDateTime() {
    const s = T$get(this, T$B_ZDT, 'toPlainDateTime');
    return T$createPlainDateTime(T$zdtDateTime(s), s.calendar);
  }
};

const T$systemEpochNs = () => {
  const ms = Date.now();
  const r = T$fmod(ms, 1000);
  return T$td((ms - r) / 1000, r * 1000000);
};
const T$systemTimeZone = () => 'UTC';
const T$nowDateTime = tzLike => {
  const tz = tzLike === undefined ? T$systemTimeZone() : T$toTemporalTimeZoneIdentifier(tzLike);
  return T$getISODateTimeFor(tz, T$systemEpochNs());
};
const T$Now = {
  instant() { return T$createInstant(T$systemEpochNs()); },
  timeZoneId() { return T$systemTimeZone(); },
  zonedDateTimeISO(temporalTimeZoneLike = undefined) {
    const tz = temporalTimeZoneLike === undefined ? T$systemTimeZone() : T$toTemporalTimeZoneIdentifier(temporalTimeZoneLike);
    return T$createZonedDateTime(T$systemEpochNs(), tz, 'iso8601');
  },
  plainDateTimeISO(temporalTimeZoneLike = undefined) { return T$createPlainDateTime(T$nowDateTime(temporalTimeZoneLike), 'iso8601'); },
  plainDateISO(temporalTimeZoneLike = undefined) { return T$createPlainDate(T$nowDateTime(temporalTimeZoneLike).date, 'iso8601'); },
  plainTimeISO(temporalTimeZoneLike = undefined) { return T$createPlainTime(T$nowDateTime(temporalTimeZoneLike).time); }
};

T$P_INSTANT = T$Instant.prototype;
T$P_ZDT = T$ZonedDateTime.prototype;
T$P_DATE = T$PlainDate.prototype;
T$P_DATETIME = T$PlainDateTime.prototype;
T$P_TIME = T$PlainTime.prototype;
T$P_YM = T$PlainYearMonth.prototype;
T$P_MD = T$PlainMonthDay.prototype;
T$P_DURATION = T$Duration.prototype;
const T$defineTag = (obj, tag) => {
  Object.defineProperty(obj, Symbol.toStringTag, { value: tag, writable: false, enumerable: false, configurable: true });
};
const T$defineHidden = (obj, key, value) => {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: false, configurable: true });
};
var Temporal = {};
T$defineHidden(Temporal, 'Duration', T$Duration);
T$defineHidden(Temporal, 'Instant', T$Instant);
T$defineHidden(Temporal, 'Now', T$Now);
T$defineHidden(Temporal, 'PlainDate', T$PlainDate);
T$defineHidden(Temporal, 'PlainDateTime', T$PlainDateTime);
T$defineHidden(Temporal, 'PlainMonthDay', T$PlainMonthDay);
T$defineHidden(Temporal, 'PlainTime', T$PlainTime);
T$defineHidden(Temporal, 'PlainYearMonth', T$PlainYearMonth);
T$defineHidden(Temporal, 'ZonedDateTime', T$ZonedDateTime);
T$defineTag(Temporal, 'Temporal');
const T$KIND_NAMES = [ '', 'Instant', 'ZonedDateTime', 'PlainDate', 'PlainDateTime', 'PlainTime', 'PlainYearMonth', 'PlainMonthDay', 'Duration' ];
if ($IntlHooks$ !== undefined) $IntlHooks$.temporalKind = x => {
  const sl = T$slotsOf(x);
  return sl === undefined ? '' : T$KIND_NAMES[sl.brand];
};
T$defineHidden(globalThis, 'Temporal', Temporal);
T$defineTag(T$Now, 'Temporal.Now');
{
  const nowKeys = [ 'instant', 'timeZoneId', 'zonedDateTimeISO', 'plainDateTimeISO', 'plainDateISO', 'plainTimeISO' ];
  for (let i = 0; i < nowKeys.length; i++) T$defineHidden(T$Now, nowKeys[i], T$Now[nowKeys[i]]);
  const dateKeys = [ 'era', 'eraYear', 'year', 'month', 'monthCode', 'day', 'dayOfWeek', 'dayOfYear', 'weekOfYear', 'yearOfWeek', 'daysInWeek', 'daysInMonth', 'daysInYear', 'monthsInYear', 'inLeapYear' ];
  T$defineGetters(T$PlainDate, T$B_DATE, dateKeys, false);
  T$defineGetters(T$PlainDateTime, T$B_DATETIME, dateKeys, false);
  T$defineGetters(T$PlainDateTime, T$B_DATETIME, T$TIME_FIELDS, true);
  T$defineGetters(T$PlainTime, T$B_TIME, T$TIME_FIELDS, true);
  T$defineGetters(T$PlainYearMonth, T$B_YM, [ 'era', 'eraYear', 'year', 'month', 'monthCode', 'daysInYear', 'daysInMonth', 'monthsInYear', 'inLeapYear' ], false);
  T$defineGetters(T$PlainMonthDay, T$B_MD, [ 'monthCode', 'day' ], false);
  T$defineGetters(T$ZonedDateTime, T$B_ZDT, dateKeys, false);
  T$defineGetters(T$ZonedDateTime, T$B_ZDT, T$TIME_FIELDS, true);
  const classes = [ T$Duration, T$Instant, T$PlainDate, T$PlainDateTime, T$PlainMonthDay, T$PlainTime, T$PlainYearMonth, T$ZonedDateTime ];
  const tags = [ 'Duration', 'Instant', 'PlainDate', 'PlainDateTime', 'PlainMonthDay', 'PlainTime', 'PlainYearMonth', 'ZonedDateTime' ];
  for (let i = 0; i < classes.length; i++) {
    T$defineTag(classes[i].prototype, 'Temporal.' + tags[i]);
    Object.defineProperty(classes[i], 'prototype', { writable: false, enumerable: false, configurable: false });
  }
}
`;
