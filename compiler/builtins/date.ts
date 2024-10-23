import type {} from './porffor.d.ts';

// 21.4.1.3 Day (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-day
// 1. Return 𝔽(floor(ℝ(t / msPerDay))).
export const __ecma262_Day = (t: number): number => Math.floor(t / 86400000);

// 21.4.1.4 TimeWithinDay (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-day
// 1. Return 𝔽(ℝ(t) modulo ℝ(msPerDay)).
export const __ecma262_TimeWithinDay = (t: number): number => t % 86400000;

// 21.4.1.5 DaysInYear (y)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-daysinyear
export const __ecma262_DaysInYear = (y: number): number => {
  // 1. Let ry be ℝ(y).

  // 2. If (ry modulo 400) = 0, return 366𝔽.
  if (y % 400 == 0) return 366;

  // 3. If (ry modulo 100) = 0, return 365𝔽.
  if (y % 100 == 0) return 365;

  // 4. If (ry modulo 4) = 0, return 366𝔽.
  if (y % 4 == 0) return 366;

  // 5. Return 365𝔽.
  return 365;
};

// 21.4.1.6 DayFromYear (y)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-dayfromyear
export const __ecma262_DayFromYear = (y: number): number => {
  // 1. Let ry be ℝ(y).
  // 2. NOTE: In the following steps, numYears1, numYears4, numYears100, and numYears400
  //    represent the number of years divisible by 1, 4, 100, and 400, respectively,
  //    that occur between the epoch and the start of year y.
  //    The number is negative if y is before the epoch.

  // 3. Let numYears1 be (ry - 1970).
  const numYears1: number = y - 1970;

  // 4. Let numYears4 be floor((ry - 1969) / 4).
  const numYears4: number = Math.floor((y - 1969) / 4);

  // 5. Let numYears100 be floor((ry - 1901) / 100).
  const numYears100: number = Math.floor((y - 1901) / 100);

  // 6. Let numYears400 be floor((ry - 1601) / 400).
  const numYears400: number = Math.floor((y - 1601) / 400);

  // 7. Return 𝔽(365 × numYears1 + numYears4 - numYears100 + numYears400).
  return 365 * numYears1 + numYears4 - numYears100 + numYears400;
};

// 21.4.1.7 TimeFromYear (y)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-timefromyear
// 1. Return msPerDay × DayFromYear(y).
export const __ecma262_TimeFromYear = (y: number): number => 86400000 * __ecma262_DayFromYear(y);

// 21.4.1.8 YearFromTime (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-yearfromtime
export const __ecma262_YearFromTime = (t: number): number => {
  // 1. Return the largest integral Number y (closest to +∞) such that TimeFromYear(y) ≤ t.

  // guess year with floor(t / (365.2425 * msPerDay)) + 1970
  const y: number = Math.floor(t / 31556952000) + 1970;

  // get timestamp for guessed year
  const t2: number = __ecma262_TimeFromYear(y);

  // if timestamp is higher, we guessed too high
  if (t2 > t) return y - 1;

  // if timestamp + days in year is lower, we guessed too low
  if ((t2 + __ecma262_DaysInYear(y) * 86400000) <= t) return y + 1;

  // we guessed correct
  return y;
};

// 21.4.1.9 DayWithinYear (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-daywithinyear
// 1. Return Day(t) - DayFromYear(YearFromTime(t)).
export const  __ecma262_DayWithinYear = (t: number): number => __ecma262_Day(t) - __ecma262_DayFromYear(__ecma262_YearFromTime(t));

// 21.4.1.10 InLeapYear (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-inleapyear
// 1. If DaysInYear(YearFromTime(t)) is 366𝔽, return 1𝔽; else return +0𝔽.
export const __ecma262_InLeapYear = (t: number): number => __ecma262_DaysInYear(__ecma262_YearFromTime(t)) == 366 ? 1 : 0;

// 21.4.1.11 MonthFromTime (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-monthfromtime
export const __ecma262_MonthFromTime = (t: number): number => {
  // 1. Let inLeapYear be InLeapYear(t).
  const inLeapYear: number = __ecma262_InLeapYear(t);

  // 2. Let dayWithinYear be DayWithinYear(t).
  const dayWithinYear: number = __ecma262_DayWithinYear(t);

  // 3. If dayWithinYear < 31𝔽, return +0𝔽.
  if (dayWithinYear < 31) return 0;

  // 4. If dayWithinYear < 59𝔽 + inLeapYear, return 1𝔽.
  if (dayWithinYear < 59 + inLeapYear) return 1;

  // 5. If dayWithinYear < 90𝔽 + inLeapYear, return 2𝔽.
  if (dayWithinYear < 90 + inLeapYear) return 2;

  // 6. If dayWithinYear < 120𝔽 + inLeapYear, return 3𝔽.
  if (dayWithinYear < 120 + inLeapYear) return 3;

  // 7. If dayWithinYear < 151𝔽 + inLeapYear, return 4𝔽.
  if (dayWithinYear < 151 + inLeapYear) return 4;

  // 8. If dayWithinYear < 181𝔽 + inLeapYear, return 5𝔽.
  if (dayWithinYear < 181 + inLeapYear) return 5;

  // 9. If dayWithinYear < 212𝔽 + inLeapYear, return 6𝔽.
  if (dayWithinYear < 212 + inLeapYear) return 6;

  // 10. If dayWithinYear < 243𝔽 + inLeapYear, return 7𝔽.
  if (dayWithinYear < 243 + inLeapYear) return 7;

  // 11. If dayWithinYear < 273𝔽 + inLeapYear, return 8𝔽.
  if (dayWithinYear < 273 + inLeapYear) return 8;

  // 12. If dayWithinYear < 304𝔽 + inLeapYear, return 9𝔽.
  if (dayWithinYear < 304 + inLeapYear) return 9;

  // 13. If dayWithinYear < 334𝔽 + inLeapYear, return 10𝔽.
  if (dayWithinYear < 334 + inLeapYear) return 10;

  // 14. Assert: dayWithinYear < 365𝔽 + inLeapYear.

  // 15. Return 11𝔽.
  return 11;
};

// 21.4.1.12 DateFromTime (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-datefromtime
export const __ecma262_DateFromTime = (t: number): number => {
  // 1. Let inLeapYear be InLeapYear(t).
  const inLeapYear: number = __ecma262_InLeapYear(t);

  // 2. Let dayWithinYear be DayWithinYear(t).
  const dayWithinYear: number = __ecma262_DayWithinYear(t);

  // 3. Let month be MonthFromTime(t).
  const month = __ecma262_MonthFromTime(t);

  // 4. If month is +0𝔽, return dayWithinYear + 1𝔽.
  if (month == 0) return dayWithinYear + 1;

  // 5. If month is 1𝔽, return dayWithinYear - 30𝔽.
  if (month == 1) return dayWithinYear - 30;

  // 6. If month is 2𝔽, return dayWithinYear - 58𝔽 - inLeapYear.
  if (month == 2) return dayWithinYear - 58 - inLeapYear;

  // 7. If month is 3𝔽, return dayWithinYear - 89𝔽 - inLeapYear.
  if (month == 3) return dayWithinYear - 89 - inLeapYear;

  // 8. If month is 4𝔽, return dayWithinYear - 119𝔽 - inLeapYear.
  if (month == 4) return dayWithinYear - 119 - inLeapYear;

  // 9. If month is 5𝔽, return dayWithinYear - 150𝔽 - inLeapYear.
  if (month == 5) return dayWithinYear - 150 - inLeapYear;

  // 10. If month is 6𝔽, return dayWithinYear - 180𝔽 - inLeapYear.
  if (month == 6) return dayWithinYear - 180 - inLeapYear;

  // 11. If month is 7𝔽, return dayWithinYear - 211𝔽 - inLeapYear.
  if (month == 7) return dayWithinYear - 211 - inLeapYear;

  // 12. If month is 8𝔽, return dayWithinYear - 242𝔽 - inLeapYear.
  if (month == 8) return dayWithinYear - 242 - inLeapYear;

  // 13. If month is 9𝔽, return dayWithinYear - 272𝔽 - inLeapYear.
  if (month == 9) return dayWithinYear - 272 - inLeapYear;

  // 14. If month is 10𝔽, return dayWithinYear - 303𝔽 - inLeapYear.
  if (month == 10) return dayWithinYear - 303 - inLeapYear;

  // 15. Assert: month is 11𝔽.

  // 16. Return dayWithinYear - 333𝔽 - inLeapYear.
  return dayWithinYear - 333 - inLeapYear;
};

// 21.4.1.13 WeekDay (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-weekday
// 1. Return 𝔽(ℝ(Day(t) + 4𝔽) modulo 7).
export const __ecma262_WeekDay = (t: number): number => (__ecma262_Day(t) + 4) % 7;

// 21.4.1.14 HourFromTime (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-hourfromtime
// 1. Return 𝔽(floor(ℝ(t / msPerHour)) modulo HoursPerDay).
export const __ecma262_HourFromTime = (t: number): number => Math.floor(t / 3600000) % 24;

// 21.4.1.15 MinFromTime (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-minfromtime
// 1. Return 𝔽(floor(ℝ(t / msPerMinute)) modulo MinutesPerHour).
export const __ecma262_MinFromTime = (t: number): number => Math.floor(t / 60000) % 60;

// 21.4.1.16 SecFromTime (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-secfromtime
// 1. Return 𝔽(floor(ℝ(t / msPerSecond)) modulo SecondsPerMinute).
export const __ecma262_SecFromTime = (t: number): number => Math.floor(t / 1000) % 60;

// 21.4.1.17 msFromTime (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-msfromtime
// 1. Return 𝔽(ℝ(t) modulo ℝ(msPerSecond)).
export const __ecma262_msFromTime = (t: number): number => t % 1000;


// // 21.4.1.21 GetNamedTimeZoneOffsetNanoseconds (timeZoneIdentifier, epochNanoseconds)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-getnamedtimezoneoffsetnanoseconds
// export const __ecma262_GetNamedTimeZoneOffsetNanoseconds = (timeZoneIdentifier: bytestring, epochNanoseconds: number /* BigInt (unused) */): number => {
//   // 1. Assert: timeZoneIdentifier is "UTC".

//   // 2. Return 0.
//   return 0;
// };

// // 21.4.1.23 AvailableNamedTimeZoneIdentifiers ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-availablenamedtimezoneidentifiers
// export const __ecma262_AvailableNamedTimeZoneIdentifiers = (): bytestring[] => {
//   // 1. If the implementation does not include local political rules for any time zones, then
//   //  a. Return « the Time Zone Identifier Record { [[Identifier]]: "UTC", [[PrimaryIdentifier]]: "UTC" } ».
//   return [ 'UTC' ];
// };

// // 21.4.1.24 SystemTimeZoneIdentifier ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-systemtimezoneidentifier
// export const __ecma262_SystemTimeZoneIdentifier = (): bytestring => {
//   // 1. If the implementation only supports the UTC time zone, return "UTC".
//   return 'UTC';
// };

// 21.4.1.25 LocalTime (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-localtime
// slightly break spec here by just simplifying the abstraction for if implementation does not include local political rules for any time zones
export const __ecma262_LocalTime = (t: number): number => t;

// 21.4.1.26 UTC (t)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-utc-t
// slightly break spec here by just simplifying the abstraction for if implementation does not include local political rules for any time zones
export const __ecma262_UTC = (t: number): number => {
  // 1. If t is not finite, return NaN.
  if (!Number.isFinite(t)) return NaN;

  return t;
};

// 21.4.1.27 MakeTime (hour, min, sec, ms)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-maketime
export const __ecma262_MakeTime = (hour: number, min: number, sec: number, ms: number): number => {
  // 1. If hour is not finite, min is not finite, sec is not finite, or ms is not finite, return NaN.
  if (Porffor.fastOr(!Number.isFinite(hour), !Number.isFinite(min), !Number.isFinite(sec), !Number.isFinite(ms))) return NaN;

  // 2. Let h be 𝔽(! ToIntegerOrInfinity(hour)).
  const h: number = __ecma262_ToIntegerOrInfinity(hour);
  // 3. Let m be 𝔽(! ToIntegerOrInfinity(min)).
  const m: number = __ecma262_ToIntegerOrInfinity(min);
  // 4. Let s be 𝔽(! ToIntegerOrInfinity(sec)).
  const s: number = __ecma262_ToIntegerOrInfinity(sec);
  // 5. Let milli be 𝔽(! ToIntegerOrInfinity(ms)).
  const milli: number = __ecma262_ToIntegerOrInfinity(ms);

  // 6. Return ((h × msPerHour + m × msPerMinute) + s × msPerSecond) + milli.
  return ((h * 3600000 + m * 60000) + s * 1000) + milli;
};

// 21.4.1.28 MakeDay (year, month, date)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-makeday
export const __ecma262_MakeDay = (year: number, month: number, date: number): number => {
  // 1. If year is not finite, month is not finite, or date is not finite, return NaN.
  if (Porffor.fastOr(!Number.isFinite(year), !Number.isFinite(month), !Number.isFinite(date))) return NaN;

  // 2. Let y be 𝔽(! ToIntegerOrInfinity(year)).
  const y: number = __ecma262_ToIntegerOrInfinity(year);
  // 3. Let m be 𝔽(! ToIntegerOrInfinity(month)).
  const m: number = __ecma262_ToIntegerOrInfinity(month);
  // 4. Let dt be 𝔽(! ToIntegerOrInfinity(date)).
  const dt: number = __ecma262_ToIntegerOrInfinity(date);

  // 5. Let ym be y + 𝔽(floor(ℝ(m) / 12)).
  let ym: number = y + Math.floor(m / 12);

  // 6. If ym is not finite, return NaN.
  if (!Number.isFinite(ym)) return NaN;

  // 7. Let mn be 𝔽(ℝ(m) modulo 12).
  const mn: number = m % 12;

  // 8. Find a finite time value t such that YearFromTime(t) is ym, MonthFromTime(t) is mn, and DateFromTime(t) is 1𝔽; but if this is not possible (because some argument is out of range), return NaN.

  // https://howardhinnant.github.io/date_algorithms.html#days_from_civil
  if (mn <= 1) ym -= 1;

  const era: number = Math.trunc((ym >= 0 ? ym : (ym - 399)) / 400);
  const yoe: number = ym - era * 400;
  const doy: number = Math.trunc((153 * (mn + (mn > 1 ? -2 : 10)) + 2) / 5);
  const doe: number = yoe * 365 + Math.trunc(yoe / 4) - Math.trunc(yoe / 100) + doy;
  const day: number = era * 146097 + doe - 719468;

  // 9. Return Day(t) + dt - 1𝔽.
  // day = Day(t) (our day calculated is already as day)
  return day + dt - 1;
};

// 21.4.1.29 MakeDate (day, time)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-makedate
export const __ecma262_MakeDate = (day: number, time: number): number => {
  // 1. If day is not finite or time is not finite, return NaN.
  if (Porffor.fastOr(!Number.isFinite(day), !Number.isFinite(time))) return NaN;

  // 2. Let tv be day × msPerDay + time.
  const tv: number = day * 86400000 + time;

  // 3. If tv is not finite, return NaN.
  if (!Number.isFinite(tv)) return NaN;

  // 4. Return tv.
  return tv;
};

// 21.4.1.30 MakeFullYear (year)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-makefullyear
export const __ecma262_MakeFullYear = (year: number): number => {
  // 1. If year is NaN, return NaN.
  if (Number.isNaN(year)) return NaN;

  // 2. Let truncated be ! ToIntegerOrInfinity(year).
  const truncated: number = __ecma262_ToIntegerOrInfinity(year);

  // 3. If truncated is in the inclusive interval from 0 to 99, return 1900𝔽 + 𝔽(truncated).
  if (Porffor.fastAnd(truncated >= 0, truncated <= 99)) return 1900 + truncated;

  // 4. Return 𝔽(truncated).
  return truncated;
};


// 21.4.1.31 TimeClip (time)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-timeclip
export const __ecma262_TimeClip = (time: number): number => {
  // 1. If time is not finite, return NaN.
  if (!Number.isFinite(time)) return NaN;

  // 2. If abs(ℝ(time)) > 8.64 × 10**15, return NaN.
  if (Math.abs(time) > 8.64e+15) return NaN;

  // 3. Return 𝔽(! ToIntegerOrInfinity(time)).
  return __ecma262_ToIntegerOrInfinity(time);
};


// 21.4.3.1 Date.now ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.now
// This function returns the time value designating the UTC date and time of the occurrence of the call to it.
export const __Date_now = (): number => Math.trunc(performance.timeOrigin + performance.now());

// 21.4.3.4 Date.UTC (year [, month [, date [, hours [, minutes [, seconds [, ms ]]]]]])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.utc
export const __Date_UTC = (year: unknown, month: unknown, date: unknown, hours: unknown, minutes: unknown, seconds: unknown, ms: unknown): number => {
  // todo: passing undefined to params should not act like no arg was passed

  // 1. Let y be ? ToNumber(year).
  const y: number = ecma262.ToNumber(year);

  // 2. If month is present, let m be ? ToNumber(month); else let m be +0𝔽.
  let m: number = 0;
  if (Porffor.rawType(month) != Porffor.TYPES.undefined) m = ecma262.ToNumber(month);

  // 3. If date is present, let dt be ? ToNumber(date); else let dt be 1𝔽.
  let dt: number = 1;
  if (Porffor.rawType(date) != Porffor.TYPES.undefined) dt = ecma262.ToNumber(date);

  // 4. If hours is present, let h be ? ToNumber(hours); else let h be +0𝔽.
  let h: number = 0;
  if (Porffor.rawType(hours) != Porffor.TYPES.undefined) h = ecma262.ToNumber(hours);

  // 5. If minutes is present, let min be ? ToNumber(minutes); else let min be +0𝔽.
  let min: number = 0;
  if (Porffor.rawType(minutes) != Porffor.TYPES.undefined) min = ecma262.ToNumber(minutes);

  // 6. If seconds is present, let s be ? ToNumber(seconds); else let s be +0𝔽.
  let s: number = 0;
  if (Porffor.rawType(seconds) != Porffor.TYPES.undefined) s = ecma262.ToNumber(seconds);

  // 7. If ms is present, let milli be ? ToNumber(ms); else let milli be +0𝔽.
  let milli: number = 0;
  if (Porffor.rawType(ms) != Porffor.TYPES.undefined) h = ecma262.ToNumber(ms);

  // 8. Let yr be MakeFullYear(y).
  const yr: number = __ecma262_MakeFullYear(y);

  // 9. Return TimeClip(MakeDate(MakeDay(yr, m, dt), MakeTime(h, min, s, milli))).
  return __ecma262_TimeClip(__ecma262_MakeDate(__ecma262_MakeDay(yr, m, dt), __ecma262_MakeTime(h, min, s, milli)));
};


export const __ecma262_WeekDayName = (tv: number): bytestring => {
  // Name of the entry in Table 62 with the Number WeekDay(tv).
  // Table 62: Names of days of the week
  // Number 	Name
  // +0𝔽 "Sun"
  // 1𝔽 	"Mon"
  // 2𝔽 	"Tue"
  // 3𝔽 	"Wed"
  // 4𝔽 	"Thu"
  // 5𝔽 	"Fri"
  // 6𝔽 	"Sat"

  const weekday: number = __ecma262_WeekDay(tv);

  const lut: bytestring = 'SunMonTueWedThuFriSat';

  let out: bytestring = Porffor.allocateBytes(7);
  out.length = 3;

  let outPtr: number = Porffor.wasm`local.get ${out}`;
  let lutPtr: number = Porffor.wasm`local.get ${lut}` + (weekday * 3);

  Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(lutPtr++, 0, 4), 0, 4);
  Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(lutPtr++, 0, 4), 0, 4);
  Porffor.wasm.i32.store8(outPtr, Porffor.wasm.i32.load8_u(lutPtr, 0, 4), 0, 4);

  return out;
};

export const __ecma262_MonthName = (tv: number): bytestring => {
  // Name of the entry in Table 63 with the Number MonthFromTime(tv).
  // Table 63: Names of months of the year
  // Number 	Name
  // +0𝔽 "Jan"
  // 1𝔽 	"Feb"
  // 2𝔽 	"Mar"
  // 3𝔽 	"Apr"
  // 4𝔽 	"May"
  // 5𝔽 	"Jun"
  // 6𝔽 	"Jul"
  // 7𝔽 	"Aug"
  // 8𝔽 	"Sep"
  // 9𝔽  "Oct"
  // 10𝔽 "Nov"
  // 11𝔽 "Dec"

  const month: number = __ecma262_MonthFromTime(tv);

  const lut: bytestring = 'JanFebMarAprMayJunJulAugSepOctNovDec';

  let out: bytestring = Porffor.allocateBytes(7);
  out.length = 3;

  let outPtr: number = Porffor.wasm`local.get ${out}`;
  let lutPtr: number = Porffor.wasm`local.get ${lut}` + (month * 3);

  Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(lutPtr++, 0, 4), 0, 4);
  Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(lutPtr++, 0, 4), 0, 4);
  Porffor.wasm.i32.store8(outPtr, Porffor.wasm.i32.load8_u(lutPtr, 0, 4), 0, 4);

  return out;
};

export const __ecma262_ParseMonthName = (ptr: number): number => {
  const a: i32 = Porffor.wasm.i32.load8_u(ptr, 0, 4);

  if (a == 74) { // J
    const b: i32 = Porffor.wasm.i32.load8_u(ptr, 0, 5);

    if (b == 97) return 0; // a - Jan
    if (b == 117) { // u
      const c: i32 = Porffor.wasm.i32.load8_u(ptr, 0, 6);
      if (c == 110) return 5; // n - Jun
      if (c == 108) return 6; // l - Jul
    }
  }

  if (a == 77) { // M
    const b: i32 = Porffor.wasm.i32.load8_u(ptr, 0, 5);
    if (b == 97) { // a
      const c: i32 = Porffor.wasm.i32.load8_u(ptr, 0, 6);
      if (c == 114) return 2; // r - Mar
      if (c == 121) return 4; // y - May
    }
  }

  if (a == 65) { // A
    const b: i32 = Porffor.wasm.i32.load8_u(ptr, 0, 5);
    if (b == 112) return 3; // p - Apr
    if (b == 117) return 7; // u - Aug
  }

  if (a == 70) return 1; // F - Feb
  if (a == 83) return 8; // S - Sep
  if (a == 79) return 9; // O - Oct
  if (a == 78) return 10; // N - Nov
  if (a == 68) return 11; // D - Dec

  return -1;
};


// DTSF parser
export const __ecma262_ParseDTSF = (string: bytestring): number => {
  // formats we need to support:
  // > new Date().toISOString()
  // '2024-05-12T02:44:01.529Z'

  let y: number = 0;
  let m: number = 0;
  let dt: number = 1;
  let h: number = 0;
  let min: number = 0;
  let s: number = 0;
  let milli: number = 0;
  let tzHour: number = 0;
  let tzMin: number = 0;

  let n: number = 0;
  let nInd: number = 0;
  let z: boolean = false;

  const len: i32 = string.length;
  const endPtr: i32 = Porffor.wasm`local.get ${string}` + len;
  let ptr: i32 = Porffor.wasm`local.get ${string}`;

  while (ptr <= endPtr) { // <= to include extra null byte to set last n
    const chr: i32 = Porffor.wasm.i32.load8_u(ptr++, 0, 4);
    if (Porffor.fastAnd(chr >= 48, chr <= 57)) { // 0-9
      n *= 10;
      n += chr - 48;
      continue;
    }

    if (chr == 45) { // -
      if (Porffor.fastOr(ptr == Porffor.wasm`local.get ${string}`, nInd == 7)) n = -n;
    }

    if (n > 0) {
      if (nInd == 0) y = n;
        else if (nInd == 1) m = n - 1;
        else if (nInd == 2) dt = n;
        else if (nInd == 3) h = n;
        else if (nInd == 4) min = n;
        else if (nInd == 5) s = n;
        else if (nInd == 6) milli = n;
        else if (nInd == 7) tzHour = n;
        else if (nInd == 8) tzMin = n;

      n = 0;
      nInd++;
    }

    if (chr == 90) { // Z
      if (ptr == len) z = true;
    }
  }

  h += tzHour;
  min += tzMin;

  return __ecma262_TimeClip(__ecma262_MakeDate(__ecma262_MakeDay(y, m, dt), __ecma262_MakeTime(h, min, s, milli)));

  // we do not support local time yet so useless check
  // let t: number = __ecma262_TimeClip(__ecma262_MakeDate(__ecma262_MakeDay(y, m, dt), __ecma262_MakeTime(h, min, s, milli)));

  // "When the time zone offset is absent, date-only forms are interpreted as a UTC time
  // and date-time forms are interpreted as local time.
  // This is due to a historical spec error that was not consistent with ISO 8601
  // but could not be changed due to web compatibility." :))
  // if (Porffor.fastAnd(
  //   nInd > 3, // not date-only
  //   z == false, // not utc (ending with Z)
  //   nInd < 8, // no time zone offset
  // )) {
  //   t = __ecma262_UTC(t);
  // }

  // return t;
};

// RFC 7231 or Date.prototype.toString() parser
export const __ecma262_ParseRFC7231OrToString = (string: bytestring): number => {
  // formats we need to support:
  // > new Date().toUTCString()
  // 'Sun, 12 May 2024 02:44:10 GMT'
  // > new Date().toString()
  // 'Sun May 12 2024 02:44:13 GMT+0000 (UTC)'

  // skip week day
  let ptr: i32 = Porffor.wasm`local.get ${string}` + 4;

  // skip potential ' '
  if (Porffor.wasm.i32.load8_u(ptr, 0, 4) == 32) ptr++;

  let dt: number = 0;
  let m: number = -1;

  // check if date now via numerical
  let chr: i32 = Porffor.wasm.i32.load8_u(ptr, 0, 4);
  if (Porffor.fastAnd(chr >= 48, chr <= 57)) { // 0-9
    // date, month name
    while (true) { // use >0 check instead of !=' ' to handle malformed
      chr = Porffor.wasm.i32.load8_u(ptr++, 0, 4);
      if (chr < 48) break;

      dt *= 10;
      dt += chr - 48;
    }

    m = __ecma262_ParseMonthName(ptr);
    ptr += 3;
  } else {
    // month name, date
    m = __ecma262_ParseMonthName(ptr);
    ptr += 4;

    while (true) { // use >0 check instead of !=' ' to handle malformed
      chr = Porffor.wasm.i32.load8_u(ptr++, 0, 4);
      if (chr < 48) break;

      dt *= 10;
      dt += chr - 48;
    }
  }

  // check we parsed month and date correctly
  if (Porffor.fastOr(m == -1, dt == 0, dt > 31)) {
    return NaN;
  }

  let y: number = 0;
  let h: number = 0;
  let min: number = 0;
  let s: number = 0;
  let tz: number = 0;

  let n: number = 0;
  let nInd: number = 0;

  const len: i32 = string.length;
  const endPtr: i32 = Porffor.wasm`local.get ${string}` + len;

  while (ptr <= endPtr) { // <= to include extra null byte to set last n
    const chr: i32 = Porffor.wasm.i32.load8_u(ptr++, 0, 4);
    if (Porffor.fastAnd(chr >= 48, chr <= 57)) { // 0-9
      n *= 10;
      n += chr - 48;
      continue;
    }

    if (chr == 45) { // -
      if (nInd == 4) n = -n;
    }

    if (n > 0) {
      if (nInd == 0) y = n;
        else if (nInd == 1) h = n;
        else if (nInd == 2) min = n;
        else if (nInd == 3) s = n;
        else if (nInd == 4) tz = n;

      n = 0;
      nInd++;
    }
  }

  return __ecma262_TimeClip(__ecma262_MakeDate(__ecma262_MakeDay(y, m, dt), __ecma262_MakeTime(h, min, s, 0)));
};

// 21.4.3.2 Date.parse (string)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.parse
export const __Date_parse = (string: bytestring): number => {
  // formats we need to support:
  // > new Date().toISOString()
  // '2024-05-12T02:44:01.529Z'
  // > new Date().toUTCString()
  // 'Sun, 12 May 2024 02:44:10 GMT'
  // > new Date().toString()
  // 'Sun May 12 2024 02:44:13 GMT+0000 (UTC)'

  // if first char is numerical, use DTSF parser
  const chr: i32 = Porffor.wasm.i32.load8_u(string, 0, 4);;
  if (Porffor.fastAnd(chr >= 48, chr <= 57)) { // 0-9
    return __ecma262_ParseDTSF(string);
  }

  // else, use RFC 7231 or Date.prototype.toString() parser
  return __ecma262_ParseRFC7231OrToString(string);
};


export const __Porffor_date_read = (ptr: Date): number => Porffor.wasm.f64.load(ptr, 0, 0);
export const __Porffor_date_write = (ptr: Date, val: number) => {
  Porffor.wasm.f64.store(ptr, val, 0, 0);
};


// 21.4.4 Properties of the Date Prototype Object
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-properties-of-the-date-prototype-object

// 21.4.4.2 Date.prototype.getDate ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getdate
export const __Date_prototype_getDate = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return DateFromTime(LocalTime(t)).
  return __ecma262_DateFromTime(__ecma262_LocalTime(t));
};

// 21.4.4.3 Date.prototype.getDay ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getday
export const __Date_prototype_getDay = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return WeekDay(LocalTime(t)).
  return __ecma262_WeekDay(__ecma262_LocalTime(t));
};

// 21.4.4.4 Date.prototype.getFullYear ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getfullyear
export const __Date_prototype_getFullYear = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return YearFromTime(LocalTime(t)).
  return __ecma262_YearFromTime(__ecma262_LocalTime(t));
};

// 21.4.4.5 Date.prototype.getHours ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.gethours
export const __Date_prototype_getHours = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return HourFromTime(LocalTime(t)).
  return __ecma262_HourFromTime(__ecma262_LocalTime(t));
};

// 21.4.4.6 Date.prototype.getMilliseconds ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getmilliseconds
export const __Date_prototype_getMilliseconds = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return msFromTime(LocalTime(t)).
  return __ecma262_msFromTime(__ecma262_LocalTime(t));
};

// 21.4.4.7 Date.prototype.getMinutes ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getminutes
export const __Date_prototype_getMinutes = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return MinFromTime(LocalTime(t)).
  return __ecma262_MinFromTime(__ecma262_LocalTime(t));
};

// 21.4.4.8 Date.prototype.getMonth ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getmonth
export const __Date_prototype_getMonth = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return MonthFromTime(LocalTime(t)).
  return __ecma262_MonthFromTime(__ecma262_LocalTime(t));
};

// 21.4.4.9 Date.prototype.getSeconds ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getseconds
export const __Date_prototype_getSeconds = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return SecFromTime(LocalTime(t)).
  return __ecma262_SecFromTime(__ecma262_LocalTime(t));
};

// 21.4.4.10 Date.prototype.getTime ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.gettime
export const __Date_prototype_getTime = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Return dateObject.[[DateValue]].
  return __Porffor_date_read(_this);
};

// 21.4.4.11 Date.prototype.getTimezoneOffset ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.gettimezoneoffset
export const __Date_prototype_getTimezoneOffset = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return (t - LocalTime(t)) / msPerMinute.
  return (t - __ecma262_LocalTime(t)) / 60000;
};

// 21.4.4.12 Date.prototype.getUTCDate ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getutcdate
export const __Date_prototype_getUTCDate = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return DateFromTime(t).
  return __ecma262_DateFromTime(t);
};

// 21.4.4.13 Date.prototype.getUTCDay ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getutcday
export const __Date_prototype_getUTCDay = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return WeekDay(t).
  return __ecma262_WeekDay(t);
};

// 21.4.4.14 Date.prototype.getUTCFullYear ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getutcfullyear
export const __Date_prototype_getUTCFullYear = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return YearFromTime(t).
  return __ecma262_YearFromTime(t);
};

// 21.4.4.15 Date.prototype.getUTCHours ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getutchours
export const __Date_prototype_getUTCHours = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return HourFromTime(t).
  return __ecma262_HourFromTime(t);
};

// 21.4.4.16 Date.prototype.getUTCMilliseconds ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getutcmilliseconds
export const __Date_prototype_getUTCMilliseconds = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return msFromTime(t).
  return __ecma262_msFromTime(t);
};

// 21.4.4.17 Date.prototype.getUTCMinutes ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getutcminutes
export const __Date_prototype_getUTCMinutes = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return MinFromTime(t).
  return __ecma262_MinFromTime(t);
};

// 21.4.4.18 Date.prototype.getUTCMonth ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getutcmonth
export const __Date_prototype_getUTCMonth = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return MonthFromTime(t).
  return __ecma262_MonthFromTime(t);
};

// 21.4.4.19 Date.prototype.getUTCSeconds ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.getutcseconds
export const __Date_prototype_getUTCSeconds = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. Return SecFromTime(t).
  return __ecma262_SecFromTime(t);
};


// 21.4.4.20 Date.prototype.setDate (date)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.setdate
export const __Date_prototype_setDate = (_this: Date, date: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  let t: number = __Porffor_date_read(_this);

  // 4. Let dt be ? ToNumber(date).
  const dt: number = ecma262.ToNumber(date);

  // 5. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 6. Set t to LocalTime(t).
  t = __ecma262_LocalTime(t);

  // 7. Let newDate be MakeDate(MakeDay(YearFromTime(t), MonthFromTime(t), dt), TimeWithinDay(t)).
  const newDate: number = __ecma262_MakeDate(__ecma262_MakeDay(__ecma262_YearFromTime(t), __ecma262_MonthFromTime(t), dt), __ecma262_TimeWithinDay(t));

  // 8. Let u be TimeClip(UTC(newDate)).
  const u: number = __ecma262_TimeClip(__ecma262_UTC(newDate));

  // 9. Set dateObject.[[DateValue]] to u.
  __Porffor_date_write(_this, u);

  // 10. Return u.
  return u;
};

// 21.4.4.21 Date.prototype.setFullYear (year [, month [, date ]])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.setfullyear
export const __Date_prototype_setFullYear = (_this: Date, year: any, month: any, date: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  let t: number = __Porffor_date_read(_this);

  // 4. Let y be ? ToNumber(year).
  const y: number = ecma262.ToNumber(year);

  // 5. If t is NaN, set t to +0𝔽; otherwise, set t to LocalTime(t).
  if (Number.isNaN(t)) t = 0;
    else t = __ecma262_LocalTime(t);

  // 6. If month is not present, let m be MonthFromTime(t); otherwise, let m be ? ToNumber(month).
  let m: number;
  if (Porffor.rawType(month) == Porffor.TYPES.undefined) m = __ecma262_MonthFromTime(t);
    else m = ecma262.ToNumber(month);

  // 7. If date is not present, let dt be DateFromTime(t); otherwise, let dt be ? ToNumber(date).
  let dt: number;
  if (Porffor.rawType(date) == Porffor.TYPES.undefined) dt = __ecma262_DateFromTime(t);
    else dt = ecma262.ToNumber(date);

  // 8. Let newDate be MakeDate(MakeDay(y, m, dt), TimeWithinDay(t)).
  const newDate: number = __ecma262_MakeDate(__ecma262_MakeDay(y, m, dt), __ecma262_TimeWithinDay(t));

  // 9. Let u be TimeClip(UTC(newDate)).
  const u: number = __ecma262_TimeClip(__ecma262_UTC(newDate));

  // 10. Set dateObject.[[DateValue]] to u.
  __Porffor_date_write(_this, u);

  // 11. Return u.
  return u;
};

// 21.4.4.22 Date.prototype.setHours (hour [, min [, sec [, ms ]]])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.sethours
export const __Date_prototype_setHours = (_this: Date, hour: any, min: any, sec: any, ms: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  let t: number = __Porffor_date_read(_this);

  // 4. Let h be ? ToNumber(hour).
  const h: number = ecma262.ToNumber(hour);

  // we reorder the spec steps in this func for easier arg handling

  // 8. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 9. Set t to LocalTime(t).
  t = __ecma262_LocalTime(t);

  // 5. If min is present, let m be ? ToNumber(min).
  let m: number;
  if (Porffor.rawType(min) != Porffor.TYPES.undefined) m = ecma262.ToNumber(min);
    // 10. If min is not present, let m be MinFromTime(t).
    else m = __ecma262_MinFromTime(t);

  // 6. If sec is present, let s be ? ToNumber(sec).
  let s: number;
  if (Porffor.rawType(sec) != Porffor.TYPES.undefined) s = ecma262.ToNumber(sec);
    // 11. If sec is not present, let s be SecFromTime(t).
    else s = __ecma262_SecFromTime(t);

  // 7. If ms is present, let milli be ? ToNumber(ms).
  let milli: number;
  if (Porffor.rawType(ms) != Porffor.TYPES.undefined) milli = ecma262.ToNumber(ms);
    // 12. If ms is not present, let milli be msFromTime(t).
    else milli = __ecma262_msFromTime(t);

  // 13. Let date be MakeDate(Day(t), MakeTime(h, m, s, milli)).
  const date: number = __ecma262_MakeDate(__ecma262_Day(t), __ecma262_MakeTime(h, m, s, milli));

  // 14. Let u be TimeClip(UTC(date)).
  const u: number = __ecma262_TimeClip(__ecma262_UTC(date));

  // 15. Set dateObject.[[DateValue]] to u.
  __Porffor_date_write(_this, u);

  // 16. Return u.
  return u;
};

// 21.4.4.23 Date.prototype.setMilliseconds (ms)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.setmilliseconds
export const __Date_prototype_setMilliseconds = (_this: Date, ms: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  let t: number = __Porffor_date_read(_this);

  // ignore old-style spec setting arg instead of having let
  // 4. Set ms to ? ToNumber(ms).
  const milli: number = ecma262.ToNumber(ms);

  // 5. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 6. Set t to LocalTime(t).
  t = __ecma262_LocalTime(t);

  // 7. Let time be MakeTime(HourFromTime(t), MinFromTime(t), SecFromTime(t), ms).
  const time: number = __ecma262_MakeTime(__ecma262_HourFromTime(t), __ecma262_MinFromTime(t), __ecma262_SecFromTime(t), milli);

  // 8. Let u be TimeClip(UTC(MakeDate(Day(t), time))).
  const u: number = __ecma262_TimeClip(__ecma262_UTC(__ecma262_MakeDate(__ecma262_Day(t), time)));

  // 9. Set dateObject.[[DateValue]] to u.
  __Porffor_date_write(_this, u);

  // 10. Return u.
  return u;
};

// 21.4.4.24 Date.prototype.setMinutes (min [, sec [, ms ]])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.setminutes
export const __Date_prototype_setMinutes = (_this: Date, min: any, sec: any, ms: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  let t: number = __Porffor_date_read(_this);

  // 4. Let m be ? ToNumber(min).
  const m: number = ecma262.ToNumber(min);

  // we reorder the spec steps in this func for easier arg handling

  // 7. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 8. Set t to LocalTime(t).
  t = __ecma262_LocalTime(t);

  // 5. If sec is present, let s be ? ToNumber(sec).
  let s: number;
  if (Porffor.rawType(sec) != Porffor.TYPES.undefined) s = ecma262.ToNumber(sec);
    // 9. If sec is not present, let s be SecFromTime(t).
    else s = __ecma262_SecFromTime(t);

  // 6. If ms is present, let milli be ? ToNumber(ms).
  let milli: number;
  if (Porffor.rawType(ms) != Porffor.TYPES.undefined) milli = ecma262.ToNumber(ms);
    // 10. If ms is not present, let milli be msFromTime(t).
    else milli = __ecma262_msFromTime(t);

  // 11. Let date be MakeDate(Day(t), MakeTime(HourFromTime(t), m, s, milli)).
  const date: number = __ecma262_MakeDate(__ecma262_Day(t), __ecma262_MakeTime(__ecma262_HourFromTime(t), m, s, milli));

  // 12. Let u be TimeClip(UTC(date)).
  const u: number = __ecma262_TimeClip(__ecma262_UTC(date));

  // 13. Set dateObject.[[DateValue]] to u.
  __Porffor_date_write(_this, u);

  // 14. Return u.
  return u;
};

// 21.4.4.25 Date.prototype.setMonth (month [, date ])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.setmonth
export const __Date_prototype_setMonth = (_this: Date, month: any, date: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  let t: number = __Porffor_date_read(_this);

  // 4. Let m be ? ToNumber(month).
  const m: number = ecma262.ToNumber(month);

  // we reorder the spec steps in this func for easier arg handling

  // 6. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 7. Set t to LocalTime(t).
  t = __ecma262_LocalTime(t);

  // 5. If date is present, let dt be ? ToNumber(date).
  let dt: number;
  if (Porffor.rawType(date) != Porffor.TYPES.undefined) dt = ecma262.ToNumber(date);
  // 8. If date is not present, let dt be DateFromTime(t).
    else dt = __ecma262_DateFromTime(t);

  // 9. Let newDate be MakeDate(MakeDay(YearFromTime(t), m, dt), TimeWithinDay(t)).
  const newDate: number = __ecma262_MakeDate(__ecma262_MakeDay(__ecma262_YearFromTime(t), m, dt), __ecma262_TimeWithinDay(t));

  // 10. Let u be TimeClip(UTC(newDate)).
  const u: number = __ecma262_TimeClip(__ecma262_UTC(newDate));

  // 11. Set dateObject.[[DateValue]] to u.
  __Porffor_date_write(_this, u);

  // 12. Return u.
  return u;
};

// 21.4.4.26 Date.prototype.setSeconds (sec [, ms ])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.setseconds
export const __Date_prototype_setSeconds = (_this: Date, sec: any, ms: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  let t: number = __Porffor_date_read(_this);

  // 4. Let s be ? ToNumber(sec).
  const s: number = ecma262.ToNumber(sec);

  // we reorder the spec steps in this func for easier arg handling

  // 6. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 7. Set t to LocalTime(t).
  t = __ecma262_LocalTime(t);

  // 5. If ms is present, let milli be ? ToNumber(ms).
  let milli: number;
  if (Porffor.rawType(ms) != Porffor.TYPES.undefined) milli = ecma262.ToNumber(ms);
    // 8. If ms is not present, let milli be msFromTime(t).
    else milli = __ecma262_msFromTime(t);

  // 9. Let date be MakeDate(Day(t), MakeTime(HourFromTime(t), MinFromTime(t), s, milli)).
  const date: number = __ecma262_MakeDate(__ecma262_Day(t), __ecma262_MakeTime(__ecma262_HourFromTime(t), __ecma262_MinFromTime(t), s, milli));

  // 10. Let u be TimeClip(UTC(date)).
  const u: number = __ecma262_TimeClip(__ecma262_UTC(date));

  // 11. Set dateObject.[[DateValue]] to u.
  __Porffor_date_write(_this, u);

  // 12. Return u.
  return u;
};


// 21.4.4.27 Date.prototype.setTime (time)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.settime
export const __Date_prototype_setTime = (_this: Date, time: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be ? ToNumber(time).
  const t: number = ecma262.ToNumber(time);

  // 4. Let v be TimeClip(t).
  const v: number = __ecma262_TimeClip(t);

  // 5. Set dateObject.[[DateValue]] to v
  __Porffor_date_write(_this, v);

  // 6. Return v.
  return v;
};

// 21.4.4.28 Date.prototype.setUTCDate (date)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.setutcdate
export const __Date_prototype_setUTCDate = (_this: Date, date: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  const t: number = __Porffor_date_read(_this);

  // 4. Let dt be ? ToNumber(date).
  const dt: number = ecma262.ToNumber(date);

  // 5. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 6. Let newDate be MakeDate(MakeDay(YearFromTime(t), MonthFromTime(t), dt), TimeWithinDay(t)).
  const newDate: number = __ecma262_MakeDate(__ecma262_MakeDay(__ecma262_YearFromTime(t), __ecma262_MonthFromTime(t), dt), __ecma262_TimeWithinDay(t));

  // 7. Let v be TimeClip(newDate).
  const v: number = __ecma262_TimeClip(newDate);

  // 8. Set dateObject.[[DateValue]] to v.
  __Porffor_date_write(_this, v);

  // 9. Return v.
  return v;
};

// 21.4.4.29 Date.prototype.setUTCFullYear (year [, month [, date ]])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.setutcfullyear
export const __Date_prototype_setUTCFullYear = (_this: Date, year: any, month: any, date: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  let t: number = __Porffor_date_read(_this);

  // 4. If t is NaN, set t to +0𝔽.
  if (Number.isNaN(t)) t = 0;

  // 5. Let y be ? ToNumber(year).
  const y: number = ecma262.ToNumber(year);

  // 6. If month is not present, let m be MonthFromTime(t); otherwise, let m be ? ToNumber(month).
  let m: number;
  if (Porffor.rawType(month) == Porffor.TYPES.undefined) m = __ecma262_MonthFromTime(t);
    else m = ecma262.ToNumber(month);

  // 7. If date is not present, let dt be DateFromTime(t); otherwise, let dt be ? ToNumber(date).
  let dt: number;
  if (Porffor.rawType(date) == Porffor.TYPES.undefined) dt = __ecma262_DateFromTime(t);
    else dt = ecma262.ToNumber(date);

  // 8. Let newDate be MakeDate(MakeDay(y, m, dt), TimeWithinDay(t)).
  const newDate: number = __ecma262_MakeDate(__ecma262_MakeDay(y, m, dt), __ecma262_TimeWithinDay(t));

  // 9. Let v be TimeClip(newDate).
  const v: number = __ecma262_TimeClip(newDate);

  // 10. Set dateObject.[[DateValue]] to v.
  __Porffor_date_write(_this, v);

  // 11. Return v.
  return v;
};

// 21.4.4.30 Date.prototype.setUTCHours (hour [, min [, sec [, ms ]]])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.setutchours
export const __Date_prototype_setUTCHours = (_this: Date, hour: any, min: any, sec: any, ms: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  let t: number = __Porffor_date_read(_this);

  // 4. Let h be ? ToNumber(hour).
  const h: number = ecma262.ToNumber(hour);

  // we reorder the spec steps in this func for easier arg handling

  // 8. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. If min is present, let m be ? ToNumber(min).
  let m: number;
  if (Porffor.rawType(min) != Porffor.TYPES.undefined) m = ecma262.ToNumber(min);
    // 9. If min is not present, let m be MinFromTime(t).
    else m = __ecma262_MinFromTime(t);

  // 6. If sec is present, let s be ? ToNumber(sec).
  let s: number;
  if (Porffor.rawType(sec) != Porffor.TYPES.undefined) s = ecma262.ToNumber(sec);
    // 10. If sec is not present, let s be SecFromTime(t).
    else s = __ecma262_SecFromTime(t);

  // 7. If ms is present, let milli be ? ToNumber(ms).
  let milli: number;
  if (Porffor.rawType(ms) != Porffor.TYPES.undefined) milli = ecma262.ToNumber(ms);
    // 11. If ms is not present, let milli be msFromTime(t).
    else milli = __ecma262_msFromTime(t);

  // 12. Let date be MakeDate(Day(t), MakeTime(h, m, s, milli)).
  const date: number = __ecma262_MakeDate(__ecma262_Day(t), __ecma262_MakeTime(h, m, s, milli));

  // 13. Let v be TimeClip(date).
  const v: number = __ecma262_TimeClip(date);

  // 14. Set dateObject.[[DateValue]] to v.
  __Porffor_date_write(_this, v);

  // 15. Return v.
  return v;
};

// 21.4.4.31 Date.prototype.setUTCMilliseconds (ms)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.setutcmilliseconds
export const __Date_prototype_setUTCMilliseconds = (_this: Date, ms: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  let t: number = __Porffor_date_read(_this);

  // ignore old-style spec setting arg instead of having let
  // 4. Set ms to ? ToNumber(ms).
  const milli: number = ecma262.ToNumber(ms);

  // 5. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 6. Let time be MakeTime(HourFromTime(t), MinFromTime(t), SecFromTime(t), ms).
  const time: number = __ecma262_MakeTime(__ecma262_HourFromTime(t), __ecma262_MinFromTime(t), __ecma262_SecFromTime(t), milli);

  // 7. Let v be TimeClip(MakeDate(Day(t), time)).
  const v: number = __ecma262_TimeClip(__ecma262_MakeDate(__ecma262_Day(t), time));

  // 8. Set dateObject.[[DateValue]] to v.
  __Porffor_date_write(_this, v);

  // 10. Return v.
  return v;
};

// 21.4.4.32 Date.prototype.setUTCMinutes (min [, sec [, ms ]])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.setutcminutes
export const __Date_prototype_setUTCMinutes = (_this: Date, min: any, sec: any, ms: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  let t: number = __Porffor_date_read(_this);

  // 4. Let m be ? ToNumber(min).
  const m: number = ecma262.ToNumber(min);

  // we reorder the spec steps in this func for easier arg handling

  // 7. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. If sec is present, let s be ? ToNumber(sec).
  let s: number;
  if (Porffor.rawType(sec) != Porffor.TYPES.undefined) s = ecma262.ToNumber(sec);
    // 8. If sec is not present, let s be SecFromTime(t).
    else s = __ecma262_SecFromTime(t);

  // 6. If ms is present, let milli be ? ToNumber(ms).
  let milli: number;
  if (Porffor.rawType(ms) != Porffor.TYPES.undefined) milli = ecma262.ToNumber(ms);
    // 9. If ms is not present, let milli be msFromTime(t).
    else milli = __ecma262_msFromTime(t);

  // 10. Let date be MakeDate(Day(t), MakeTime(HourFromTime(t), m, s, milli)).
  const date: number = __ecma262_MakeDate(__ecma262_Day(t), __ecma262_MakeTime(__ecma262_HourFromTime(t), m, s, milli));

  // 11. Let v be TimeClip(date).
  const v: number = __ecma262_TimeClip(date);

  // 12. Set dateObject.[[DateValue]] to v.
  __Porffor_date_write(_this, v);

  // 13. Return v.
  return v;
};

// 21.4.4.33 Date.prototype.setUTCMonth (month [, date ])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.setutcmonth
export const __Date_prototype_setUTCMonth = (_this: Date, month: any, date: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  let t: number = __Porffor_date_read(_this);

  // 4. Let m be ? ToNumber(month).
  const m: number = ecma262.ToNumber(month);

  // we reorder the spec steps in this func for easier arg handling

  // 6. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. If date is present, let dt be ? ToNumber(date).
  let dt: number;
  if (Porffor.rawType(date) != Porffor.TYPES.undefined) dt = ecma262.ToNumber(date);
  // 7. If date is not present, let dt be DateFromTime(t).
    else dt = __ecma262_DateFromTime(t);

  // 8. Let newDate be MakeDate(MakeDay(YearFromTime(t), m, dt), TimeWithinDay(t)).
  const newDate: number = __ecma262_MakeDate(__ecma262_MakeDay(__ecma262_YearFromTime(t), m, dt), __ecma262_TimeWithinDay(t));

  // 9. Let v be TimeClip(newDate).
  const v: number = __ecma262_TimeClip(newDate);

  // 10. Set dateObject.[[DateValue]] to v.
  __Porffor_date_write(_this, v);

  // 11. Return v.
  return v;
};

// 21.4.4.34 Date.prototype.setUTCSeconds (sec [, ms ])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.setutcseconds
export const __Date_prototype_setUTCSeconds = (_this: Date, sec: any, ms: any) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let t be dateObject.[[DateValue]].
  let t: number = __Porffor_date_read(_this);

  // 4. Let s be ? ToNumber(sec).
  const s: number = ecma262.ToNumber(sec);

  // we reorder the spec steps in this func for easier arg handling

  // 6. If t is NaN, return NaN.
  if (Number.isNaN(t)) return NaN;

  // 5. If ms is present, let milli be ? ToNumber(ms).
  let milli: number;
  if (Porffor.rawType(ms) != Porffor.TYPES.undefined) milli = ecma262.ToNumber(ms);
    // 7. If ms is not present, let milli be msFromTime(t).
    else milli = __ecma262_msFromTime(t);

  // 8. Let date be MakeDate(Day(t), MakeTime(HourFromTime(t), MinFromTime(t), s, milli)).
  const date: number = __ecma262_MakeDate(__ecma262_Day(t), __ecma262_MakeTime(__ecma262_HourFromTime(t), __ecma262_MinFromTime(t), s, milli));

  // 9. Let v be TimeClip(date).
  const v: number = __ecma262_TimeClip(date);

  // 10. Set dateObject.[[DateValue]] to v.
  __Porffor_date_write(_this, v);

  // 11. Return v.
  return v;
};


// 21.4.1.32 Date Time String Format
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date-time-string-format
// The format is as follows: YYYY-MM-DDTHH:mm:ss.sssZ
// YYYY 	is the year in the proleptic Gregorian calendar as four decimal digits from 0000 to 9999, or as an expanded year of "+" or "-" followed by six decimal digits.
// - 	"-" (hyphen) appears literally twice in the string.
// MM 	is the month of the year as two decimal digits from 01 (January) to 12 (December).
// DD 	is the day of the month as two decimal digits from 01 to 31.
// T 	"T" appears literally in the string, to indicate the beginning of the time element.
// HH 	is the number of complete hours that have passed since midnight as two decimal digits from 00 to 24.
// : 	":" (colon) appears literally twice in the string.
// mm 	is the number of complete minutes since the start of the hour as two decimal digits from 00 to 59.
// ss 	is the number of complete seconds since the start of the minute as two decimal digits from 00 to 59.
// . 	"." (dot) appears literally in the string.
// sss 	is the number of complete milliseconds since the start of the second as three decimal digits.
// Z 	is the UTC offset representation specified as "Z" (for UTC with no offset) or as either "+" or "-" followed by a time expression HH:mm (a subset of the time zone offset string format for indicating local time ahead of or behind UTC, respectively)

// fast appending string
export const __Porffor_bytestring_appendStr = (str: bytestring, appendage: bytestring): i32 => {
  const strLen: i32 = str.length;
  const appendageLen: i32 = appendage.length;
  let strPtr: i32 = Porffor.wasm`local.get ${str}` + strLen;
  let appendagePtr: i32 = Porffor.wasm`local.get ${appendage}`;
  let endPtr: i32 = appendagePtr + appendageLen;

  while (appendagePtr < endPtr) {
    Porffor.wasm.i32.store8(strPtr++, Porffor.wasm.i32.load8_u(appendagePtr++, 0, 4), 0, 4);
  }

  str.length = strLen + appendageLen;
  return 1;
};

// fast appending single character
export const __Porffor_bytestring_appendChar = (str: bytestring, char: i32): i32 => {
  const len: i32 = str.length;
  Porffor.wasm.i32.store8(Porffor.wasm`local.get ${str}` + len, char, 0, 4);
  str.length = len + 1;
  return 1;
};

export const __Porffor_bytestring_append2Char = (str: bytestring, char1: i32, char2: i32): i32 => {
  const len: i32 = str.length;
  Porffor.wasm.i32.store8(Porffor.wasm`local.get ${str}` + len, char1, 0, 4);
  Porffor.wasm.i32.store8(Porffor.wasm`local.get ${str}` + len + 1, char2, 0, 4);
  str.length = len + 2;
  return 1;
};


// fast appending padded number
export const __Porffor_bytestring_appendPadNum = (str: bytestring, num: number, len: number): i32 => {
  let numStr: bytestring = Number.prototype.toFixed(num, 0);

  let strPtr: i32 = Porffor.wasm`local.get ${str}` + str.length;

  let numStrLen: i32 = numStr.length;
  const strPtrEnd: i32 = strPtr + (len - numStrLen);
  while (strPtr < strPtrEnd) {
    Porffor.wasm.i32.store8(strPtr++, 48, 0, 4);
  }

  let numPtr: i32 = Porffor.wasm`local.get ${numStr}`;
  const numPtrEnd: i32 = numPtr + numStrLen;
  while (numPtr < numPtrEnd) {
    Porffor.wasm.i32.store8(strPtr++, Porffor.wasm.i32.load8_u(numPtr++, 0, 4), 0, 4);
  }

  str.length = strPtr - Porffor.wasm`local.get ${str}`;

  return 1;
};

// Timestamp to UTC DTSF
export const __ecma262_ToUTCDTSF = (t: number): bytestring => {
  const year: number = __ecma262_YearFromTime(t);

  let out: bytestring = Porffor.allocateBytes(31);
  out.length = 0;

  if (Porffor.fastOr(year < 0, year >= 10000)) {
    // extended year format
    // sign
    __Porffor_bytestring_appendChar(out, year > 0 ? 43 : 45);

    // 6 digit year
    __Porffor_bytestring_appendPadNum(out, year, 6);
  } else {
    // 4 digit year
    __Porffor_bytestring_appendPadNum(out, year, 4);
  }
  __Porffor_bytestring_appendChar(out, 45); // -

  // 2 digit month (01-12)
  __Porffor_bytestring_appendPadNum(out, __ecma262_MonthFromTime(t) + 1, 2);
  __Porffor_bytestring_appendChar(out, 45); // -

  // 2 digit day of the month
  __Porffor_bytestring_appendPadNum(out, __ecma262_DateFromTime(t), 2);
  __Porffor_bytestring_appendChar(out, 84); // T

  // 2 digit hour
  __Porffor_bytestring_appendPadNum(out, __ecma262_HourFromTime(t), 2);
  __Porffor_bytestring_appendChar(out, 58); // :

  // 2 digit minute
  __Porffor_bytestring_appendPadNum(out, __ecma262_MinFromTime(t), 2);
  __Porffor_bytestring_appendChar(out, 58); // :

  // 2 digit second
  __Porffor_bytestring_appendPadNum(out, __ecma262_SecFromTime(t), 2);
  __Porffor_bytestring_appendChar(out, 46); // .

  // 3 digit millisecond
  __Porffor_bytestring_appendPadNum(out, __ecma262_msFromTime(t), 3);
  __Porffor_bytestring_appendChar(out, 90); // Z

  return out;
};

// 21.4.4.36 Date.prototype.toISOString ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.toisostring
export const __Date_prototype_toISOString = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let tv be dateObject.[[DateValue]].
  const tv: number = __Porffor_date_read(_this);

  // 4. If tv is NaN, throw a RangeError exception.
  if (Number.isNaN(tv)) {
    throw new RangeError('Invalid time value');
  }

  // 5. Assert: tv is an integral Number.

  // 6. If tv corresponds with a year that cannot be represented in the Date Time String Format, throw a RangeError exception.
  // todo

  // 7. Return a String representation of tv in the Date Time String Format on the UTC time scale, including all format elements and the UTC offset representation "Z".
  return __ecma262_ToUTCDTSF(tv);
};

// 21.4.4.37 Date.prototype.toJSON (key)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.tojson
export const __Date_prototype_toJSON = (_this: Date, key: any) => {
  // 1. Let O be ? ToObject(this value).
  // 2. Let tv be ? ToPrimitive(O, number).
  // todo: use generic ecma262.ToNumber() once it supports Date
  const tv: number = __Porffor_date_read(_this);

  // 3. If tv is a Number and tv is not finite, return null.
  if (!Number.isFinite(tv)) return null;

  // 4. Return ? Invoke(O, "toISOString").
  return __Date_prototype_toISOString(_this);
};


// 21.4.4.41.1 TimeString (tv)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-timestring
export const __ecma262_TimeString = (tv: number): bytestring => {
  // we do not follow spec exactly by using number vars and appending at the end

  // 1. Let hour be ToZeroPaddedDecimalString(ℝ(HourFromTime(tv)), 2).
  const hour: number = __ecma262_HourFromTime(tv);

  // 2. Let minute be ToZeroPaddedDecimalString(ℝ(MinFromTime(tv)), 2).
  const minute: number = __ecma262_MinFromTime(tv);

  // 3. Let second be ToZeroPaddedDecimalString(ℝ(SecFromTime(tv)), 2).
  const second: number = __ecma262_SecFromTime(tv);

  // 4. Return the string-concatenation of hour, ":", minute, ":", second, the code unit 0x0020 (SPACE), and "GMT".
  let out: bytestring = Porffor.allocateBytes(16);
  out.length = 0;

  __Porffor_bytestring_appendPadNum(out, hour, 2);
  __Porffor_bytestring_appendChar(out, 58); // ':'

  __Porffor_bytestring_appendPadNum(out, minute, 2);
  __Porffor_bytestring_appendChar(out, 58); // ':'

  __Porffor_bytestring_appendPadNum(out, second, 2);

  __Porffor_bytestring_appendChar(out, 32); // ' '
  __Porffor_bytestring_appendChar(out, 71); // 'G'
  __Porffor_bytestring_appendChar(out, 77); // 'M'
  __Porffor_bytestring_appendChar(out, 84); // 'T'

  return out;
};

// 21.4.4.41.2 DateString (tv)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-datestring
export const __ecma262_DateString = (tv: number): bytestring => {
  // we do not follow spec exactly by using number vars and appending at the end

  // 1. Let weekday be the Name of the entry in Table 62 with the Number WeekDay(tv).
  const weekday: bytestring = __ecma262_WeekDayName(tv);

  // 2. Let month be the Name of the entry in Table 63 with the Number MonthFromTime(tv).
  const month: bytestring = __ecma262_MonthName(tv);

  // 3. Let day be ToZeroPaddedDecimalString(ℝ(DateFromTime(tv)), 2).
  const day: number = __ecma262_DateFromTime(tv);

  // 4. Let yv be YearFromTime(tv).
  const yv: number = __ecma262_YearFromTime(tv);

  // 5. If yv is +0𝔽 or yv > +0𝔽, let yearSign be the empty String; otherwise, let yearSign be "-".
  // 6. Let paddedYear be ToZeroPaddedDecimalString(abs(ℝ(yv)), 4).
  // 7. Return the string-concatenation of weekday, the code unit 0x0020 (SPACE), month, the code unit 0x0020 (SPACE), day, the code unit 0x0020 (SPACE), yearSign, and paddedYear.
  let out: bytestring = Porffor.allocateBytes(20);
  out.length = 0;

  // weekday
  __Porffor_bytestring_appendStr(out, weekday);
  __Porffor_bytestring_appendChar(out, 32); // ' '

  // month
  __Porffor_bytestring_appendStr(out, month);
  __Porffor_bytestring_appendChar(out, 32); // ' '

  // day
  __Porffor_bytestring_appendPadNum(out, day, 2);
  __Porffor_bytestring_appendChar(out, 32); // ' '

  // year
  if (yv < 0) __Porffor_bytestring_appendChar(out, 45); // sign
  __Porffor_bytestring_appendPadNum(out, yv, 4);

  return out;
};

// 21.4.4.41.3 TimeZoneString (tv)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-timezonestring
export const __ecma262_TimeZoneString = (tv: number) => {
  // todo: time zone support
  return '+0000 (UTC)';
};

// 21.4.4.41.4 ToDateString (tv)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-todatestring
export const __ecma262_ToDateString = (tv: number) => {
  let out: bytestring = Porffor.allocateBytes(44);
  out.length = 0;

  // 1. If tv is NaN, return "Invalid Date".
  if (Number.isNaN(tv)) return out = 'Invalid Date';

  // 2. Let t be LocalTime(tv).
  const t: number = __ecma262_LocalTime(tv);

  // 3. Return the string-concatenation of DateString(t), the code unit 0x0020 (SPACE), TimeString(t), and TimeZoneString(tv).
  __Porffor_bytestring_appendStr(out, __ecma262_DateString(t));
  __Porffor_bytestring_appendChar(out, 32);

  __Porffor_bytestring_appendStr(out, __ecma262_TimeString(t));

  __Porffor_bytestring_appendStr(out, __ecma262_TimeZoneString(tv));

  return out;
};

// 21.4.4.41 Date.prototype.toString ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.tostring
export const __Date_prototype_toString = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let tv be dateObject.[[DateValue]].
  const tv: number = __Porffor_date_read(_this);

  // 4. Return ToDateString(tv).
  return __ecma262_ToDateString(tv);
};

// 21.4.4.42 Date.prototype.toTimeString ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.totimestring
export const __Date_prototype_toTimeString = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let tv be dateObject.[[DateValue]].
  const tv: number = __Porffor_date_read(_this);

  // 4. If tv is NaN, return "Invalid Date".
  let out: bytestring = Porffor.allocateBytes(27);
  out.length = 0;

  if (Number.isNaN(tv)) return out = 'Invalid Date';

  // 5. Let t be LocalTime(tv).
  const t: number = __ecma262_LocalTime(tv);

  // 6. Return the string-concatenation of TimeString(t) and TimeZoneString(tv).
  __Porffor_bytestring_appendStr(out, __ecma262_TimeString(t));
  __Porffor_bytestring_appendStr(out, __ecma262_TimeZoneString(tv));

  return out;
};


// 21.4.4.35 Date.prototype.toDateString ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.todatestring
export const __Date_prototype_toDateString = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let tv be dateObject.[[DateValue]].
  const tv: number = __Porffor_date_read(_this);

  // 4. If tv is NaN, return "Invalid Date".
  let out: bytestring = Porffor.allocateBytes(20);
  out.length = 0;

  if (Number.isNaN(tv)) return out = 'Invalid Date';

  // 5. Let t be LocalTime(tv).
  const t: number = __ecma262_LocalTime(tv);

  // 6. Return DateString(t).
  out = __ecma262_DateString(t);
  return out;
};

// 21.4.4.43 Date.prototype.toUTCString ()
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.toutcstring
export const __Date_prototype_toUTCString = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Let tv be dateObject.[[DateValue]].
  const tv: number = __Porffor_date_read(_this);

  // 4. If tv is NaN, return "Invalid Date".
  let out: bytestring = Porffor.allocateBytes(34);
  out.length = 0;

  if (Number.isNaN(tv)) {
    out = 'Invalid Date';
    return out;
  }

  // 5. Let weekday be the Name of the entry in Table 62 with the Number WeekDay(tv).
  const weekday: bytestring = __ecma262_WeekDayName(tv);

  // 6. Let month be the Name of the entry in Table 63 with the Number MonthFromTime(tv).
  const month: bytestring = __ecma262_MonthName(tv);

  // 7. Let day be ToZeroPaddedDecimalString(ℝ(DateFromTime(tv)), 2).
  const day: number = __ecma262_DateFromTime(tv);

  // 8. Let yv be YearFromTime(tv).
  const yv: number = __ecma262_YearFromTime(tv);

  // 9. If yv is +0𝔽 or yv > +0𝔽, let yearSign be the empty String; otherwise, let yearSign be "-".
  // 10. Let paddedYear be ToZeroPaddedDecimalString(abs(ℝ(yv)), 4).
  // 11. Return the string-concatenation of weekday, ",", the code unit 0x0020 (SPACE), day, the code unit 0x0020 (SPACE), month, the code unit 0x0020 (SPACE), yearSign, paddedYear, the code unit 0x0020 (SPACE), and TimeString(tv).
  // weekday
  __Porffor_bytestring_appendStr(out, weekday);
  __Porffor_bytestring_appendChar(out, 44); // ','
  __Porffor_bytestring_appendChar(out, 32); // ' '

  // day
  __Porffor_bytestring_appendPadNum(out, day, 2);
  __Porffor_bytestring_appendChar(out, 32); // ' '

  // month
  __Porffor_bytestring_appendStr(out, month);
  __Porffor_bytestring_appendChar(out, 32); // ' '

  // year
  if (yv < 0) __Porffor_bytestring_appendChar(out, 45); // sign
  __Porffor_bytestring_appendPadNum(out, yv, 4);

  __Porffor_bytestring_appendChar(out, 32); // ' '
  __Porffor_bytestring_appendStr(out, __ecma262_TimeString(tv));

  return out;
};

// 21.4.4.38 Date.prototype.toLocaleDateString ([ reserved1 [, reserved2 ]])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.tolocaledatestring
export const __Date_prototype_toLocaleDateString = (_this: Date, reserved1: any, reserved2: any) => {
  return __Date_prototype_toDateString(_this);
};

// 21.4.4.39 Date.prototype.toLocaleString ([ reserved1 [, reserved2 ]])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.tolocalestring
export const __Date_prototype_toLocaleString = (_this: Date, reserved1: any, reserved2: any) => {
  return __Date_prototype_toString(_this);
};

// 21.4.4.40 Date.prototype.toLocaleTimeString ([ reserved1 [, reserved2 ]])
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.prototype.tolocaletimestring
export const __Date_prototype_toLocaleTimeString = (_this: Date, reserved1: any, reserved2: any) => {
  return __Date_prototype_toTimeString(_this);
};

// 21.4.4.44 Date.prototype.valueOf ()
// https://tc39.es/ecma262/#sec-date.prototype.valueof
export const __Date_prototype_valueOf = (_this: Date) => {
  // 1. Let dateObject be the this value.
  // 2. Perform ? RequireInternalSlot(dateObject, [[DateValue]]).
  // 3. Return dateObject.[[DateValue]].
  return __Porffor_date_read(_this);
};

// 21.4.2.1 Date (...values)
// https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date
export const Date = function (v0: unknown, v1: unknown, v2: unknown, v3: unknown, v4: unknown, v5: unknown, v6: unknown): bytestring|Date {
  // 1. If NewTarget is undefined, then
  if (!new.target) {
    // a. Let now be the time value (UTC) identifying the current time.
    // b. Return ToDateString(now).
    return __ecma262_ToDateString(__Date_now());
  }

  // todo: passing undefined to params should not act like no arg was passed

  // 2. Let numberOfArgs be the number of elements in values.
  // sorry.
  const numberOfArgs: i32 =
    (Porffor.rawType(v0) != Porffor.TYPES.undefined) +
    (Porffor.rawType(v1) != Porffor.TYPES.undefined) +
    (Porffor.rawType(v2) != Porffor.TYPES.undefined) +
    (Porffor.rawType(v3) != Porffor.TYPES.undefined) +
    (Porffor.rawType(v4) != Porffor.TYPES.undefined) +
    (Porffor.rawType(v5) != Porffor.TYPES.undefined) +
    (Porffor.rawType(v6) != Porffor.TYPES.undefined);

  let dv: number = 0;

  // 3. If numberOfArgs = 0, then
  if (numberOfArgs == 0) {
    // a. Let dv be the time value (UTC) identifying the current time.
    dv = __Date_now();
  } else if (numberOfArgs == 1) {
    // 4. Else if numberOfArgs = 1, the n
    // a. Let value be values[0].
    const value: any = v0;

    const valueType: i32 = Porffor.rawType(v0);

    let tv: number = 0;

    // b. If value is an Object and value has a [[DateValue]] internal slot, then
    if (valueType == Porffor.TYPES.date) {
      // i. Let tv be value.[[DateValue]].
      tv = __Porffor_date_read(value);
    } else {
      // c. Else,
      // ii. If v is a String, then
      if (Porffor.fastOr(valueType == Porffor.TYPES.string, valueType == Porffor.TYPES.bytestring)) {
        // 1. Assert: The next step never returns an abrupt completion because v is a String.

        // 2. Let tv be the result of parsing v as a date, in exactly the same manner as for the parse method (21.4.3.2).
        tv = __Date_parse(value);
      } else {
        // iii. Else,
        // 1. Let tv be ? ToNumber(v).
        tv = ecma262.ToNumber(value);
      }
    }

    // d. Let dv be TimeClip(tv).
    dv = __ecma262_TimeClip(tv);
  } else {
    // 5. Else,
    // a. Assert: numberOfArgs ≥ 2.

    // b. Let y be ? ToNumber(values[0]).
    const y: number = ecma262.ToNumber(v0);

    // c. Let m be ? ToNumber(values[1]).
    const m: number = ecma262.ToNumber(v1);

    // d. If numberOfArgs > 2, let dt be ? ToNumber(values[2]); else let dt be 1𝔽.
    let dt: number = 1;
    if (numberOfArgs > 2) dt = ecma262.ToNumber(v2);

    // e. If numberOfArgs > 3, let h be ? ToNumber(values[3]); else let h be +0𝔽.
    let h: number = 0;
    if (numberOfArgs > 3) h = ecma262.ToNumber(v3);

    // f. If numberOfArgs > 4, let min be ? ToNumber(values[4]); else let min be +0𝔽.
    let min: number = 0;
    if (numberOfArgs > 4) min = ecma262.ToNumber(v4);

    // g. If numberOfArgs > 5, let s be ? ToNumber(values[5]); else let s be +0𝔽.
    let s: number = 0;
    if (numberOfArgs > 5) s = ecma262.ToNumber(v5);

    // h. If numberOfArgs > 6, let milli be ? ToNumber(values[6]); else let milli be +0𝔽.
    let milli: number = 0;
    if (numberOfArgs > 6) milli = ecma262.ToNumber(v6);

    // i. Let yr be MakeFullYear(y).
    const yr: number = __ecma262_MakeFullYear(y);

    // j. Let finalDate be MakeDate(MakeDay(yr, m, dt), MakeTime(h, min, s, milli)).
    const finalDate: number = __ecma262_MakeDate(__ecma262_MakeDay(yr, m, dt), __ecma262_MakeTime(h, min, s, milli));

    // k. Let dv be TimeClip(UTC(finalDate)).
    dv = __ecma262_TimeClip(__ecma262_UTC(finalDate));
  }

  // 6. Let O be ? OrdinaryCreateFromConstructor(NewTarget, "%Date.prototype%", « [[DateValue]] »).
  const O: Date = Porffor.allocateBytes(8);

  // 7. Set O.[[DateValue]] to dv.
  __Porffor_date_write(O, dv);

  // 8. Return O.
  return O;
};