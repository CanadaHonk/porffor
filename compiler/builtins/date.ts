// @porf -funsafe-no-unlikely-proto-checks

// 21.4.1.3 Day (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-day
// 1. Return 𝔽(floor(ℝ(t / msPerDay))).
export const __ecma262_Day = (t: number): number => Math.floor(t / 86400000);

// 21.4.1.4 TimeWithinDay (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-day
// 1. Return 𝔽(ℝ(t) modulo ℝ(msPerDay)).
export const __ecma262_TimeWithinDay = (t: number): number => t % 86400000;

// 21.4.1.5 DaysInYear (y) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-daysinyear
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

// 21.4.1.6 DayFromYear (y) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-dayfromyear
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

// 21.4.1.7 TimeFromYear (y) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-timefromyear
// 1. Return msPerDay × DayFromYear(y).
export const __ecma262_TimeFromYear = (y: number): number => 86400000 * __ecma262_DayFromYear(y);

// 21.4.1.8 YearFromTime (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-yearfromtime
export const __ecma262_YearFromTime = (t: number): number => {
  // 1. Return the largest integral Number y (closest to +∞) such that TimeFromYear(y) ≤ t.

  // guess year with floor(t / (365.2425 * msPerDay)) + 1970)
  const y: number = Math.floor(t / 31556953970);

  // get timestamp from guessed year
  const t2: number = __ecma262_TimeFromYear(y);

  // if timestamp is higher, we guessed too high
  if (t2 > t) return y - 1;

  // if timestamp + days in year is lower, we guessed too low
  if ((t2 + __ecma262_DaysInYear(y) * 86400000) <= t) return y + 1;

  // we guessed correct
  return y;
};

// 21.4.1.9 DayWithinYear (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-daywithinyear
// 1. Return Day(t) - DayFromYear(YearFromTime(t)).
export const  __ecma262_DayWithinYear = (t: number): number => __ecma262_Day(t) - __ecma262_DayFromYear(__ecma262_YearFromTime(t));

// 21.4.1.10 InLeapYear (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-inleapyear
// 1. If DaysInYear(YearFromTime(t)) is 366𝔽, return 1𝔽; else return +0𝔽.
export const __ecma262_InLeapYear = (t: number): number => __ecma262_DaysInYear(__ecma262_YearFromTime(t)) == 366 ? 1 : 0;

// 21.4.1.11 MonthFromTime (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-monthfromtime
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

// 21.4.1.12 DateFromTime (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-datefromtime
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

// 21.4.1.13 WeekDay (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-weekday
// 1. Return 𝔽(ℝ(Day(t) + 4𝔽) modulo 7).
export const __ecma262_WeekDay = (t: number): number => (__ecma262_Day(t) + 4) % 7;

// 21.4.1.14 HourFromTime (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-hourfromtime
// 1. Return 𝔽(floor(ℝ(t / msPerHour)) modulo HoursPerDay).
export const __ecma262_HourFromTime = (t: number): number => Math.floor(t / 3600000) % 24;

// 21.4.1.15 MinFromTime (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-minfromtime
// 1. Return 𝔽(floor(ℝ(t / msPerMinute)) modulo MinutesPerHour).
export const __ecma262_MinFromTime = (t: number): number => Math.floor(t / 60000) % 60;

// 21.4.1.16 SecFromTime (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-secfromtime
// 1. Return 𝔽(floor(ℝ(t / msPerSecond)) modulo SecondsPerMinute).
export const __ecma262_SecFromTime = (t: number): number => Math.floor(t / 1000) % 60;

// 21.4.1.17 msFromTime (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-msfromtime
// 1. Return 𝔽(ℝ(t) modulo ℝ(msPerSecond)).
export const __ecma262_msFromTime = (t: number): number => t % 1000;


// // 21.4.1.21 GetNamedTimeZoneOffsetNanoseconds (timeZoneIdentifier, epochNanoseconds) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-getnamedtimezoneoffsetnanoseconds
// export const __ecma262_GetNamedTimeZoneOffsetNanoseconds = (timeZoneIdentifier: bytestring, epochNanoseconds: number /* BigInt (unused) */): number => {
//   // 1. Assert: timeZoneIdentifier is "UTC".

//   // 2. Return 0.
//   return 0;
// };

// // 21.4.1.23 AvailableNamedTimeZoneIdentifiers () | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-availablenamedtimezoneidentifiers
// export const __ecma262_AvailableNamedTimeZoneIdentifiers = (): bytestring[] => {
//   // 1. If the implementation does not include local political rules for any time zones, then
//   //  a. Return « the Time Zone Identifier Record { [[Identifier]]: "UTC", [[PrimaryIdentifier]]: "UTC" } ».
//   return [ 'UTC' ];
// };

// // 21.4.1.24 SystemTimeZoneIdentifier () | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-systemtimezoneidentifier
// export const __ecma262_SystemTimeZoneIdentifier = (): bytestring => {
//   // 1. If the implementation only supports the UTC time zone, return "UTC".
//   return 'UTC';
// };

// 21.4.1.25 LocalTime (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-localtime
// slightly break spec here by just simplifying the abstraction for if implementation does not include local political rules for any time zones
export const __ecma262_LocalTime = (t: number): number => t;

// 21.4.1.26 UTC (t) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-utc-t
// slightly break spec here by just simplifying the abstraction for if implementation does not include local political rules for any time zones
export const __ecma262_UTC = (t: number): number => {
  // 1. If t is not finite, return NaN.
  if (!Number.isFinite(t)) return NaN;

  return t;
};


// todo: move this somewhere generic?
// 7.1.5 ToIntegerOrInfinity (argument) | https://tc39.es/ecma262/multipage/abstract-operations.html#sec-tointegerorinfinity
export const __ecma262_ToIntegerOrInfinity = (argument: unknown): number => {
  // 1. Let number be ? ToNumber(argument).
  const number: number = Number(argument);

  // 2. If number is one of NaN, +0𝔽, or -0𝔽, return 0.
  if (Number.isNaN(number)) return 0;

  // 3. If number is +∞𝔽, return +∞.
  // 4. If number is -∞𝔽, return -∞.
  // if (!Number.isFinite(number)) return number;

  // 5. Return truncate(ℝ(number)).
  return Math.trunc(number);
};

// 21.4.1.27 MakeTime (hour, min, sec, ms) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-maketime
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

// 21.4.1.28 MakeDay (year, month, date) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-makeday
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
  // our day calculated is already day so Day() div is unneeded
  return day + dt - 1;
};

// 21.4.1.29 MakeDate (day, time) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-makedate
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

// 21.4.1.30 MakeFullYear (year) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-makefullyear
export const __ecma262_MakeFullYear = (year: number): number => {
  // 1. If year is NaN, return NaN.
  if (Number.isNaN(year)) return NaN;

  // 2. Let truncated be ! ToIntegerOrInfinity(year).
  const truncated: number = __ecma262_ToIntegerOrInfinity(year);

  // 3. If truncated is in the inclusive interval from 0 to 99, return 1900𝔽 + 𝔽(truncated).
  if (truncated >= 0 && truncated <= 99) return 1900 + truncated;

  // 4. Return 𝔽(truncated).
  return truncated;
};


// 21.4.1.31 TimeClip (time) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-timeclip
export const __ecma262_TimeClip = (time: number): number => {
  // 1. If time is not finite, return NaN.
  if (!Number.isFinite(time)) return NaN;

  // 2. If abs(ℝ(time)) > 8.64 × 10**15, return NaN.
  if (Math.abs(time) > 8.64e+15) return NaN;

  // 3. Return 𝔽(! ToIntegerOrInfinity(time)).
  return __ecma262_ToIntegerOrInfinity(time);
};


// 21.4.2.1 Date (...values) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date
export const Date = (): bytestring => {
  // 1. If NewTarget is undefined, then
  //   a. Let now be the time value (UTC) identifying the current time.
  //   b. Return ToDateString(now).
  // return Date$constructor().toString();
  return '';
};

// dark wasm magic for a basic allocator, sorry.
export const __Porffor_date_allocate = (): Date => {
  const hack: bytestring = '';

  if (hack.length == 0) {
    hack.length = Porffor.wasm`i32.const 1
memory.grow 0
drop
memory.size 0
i32.const 1
i32.sub
i32.const 65536
i32.mul
i32.from_u`;
  }

  const ptr: number = hack.length;
  hack.length = ptr + 8;

  return ptr;
};

export const __Porffor_date_read = (ptr: Date): number => Porffor.wasm.f64.load(ptr, 0, 0);
export const __Porffor_date_write = (ptr: Date, val: number) => {
  Porffor.wasm.f64.store(ptr, val, 0, 0);
};


export const Date$constructor = (v0: unknown, v1: unknown, v2: unknown, v3: unknown, v4: unknown, v5: unknown, v6: unknown): Date => {
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
    if (valueType == Porffor.TYPES._date) {
      // i. Let tv be value.[[DateValue]].
      tv = __Porffor_date_read(value);
    } else {
      // c. Else,
      // ii. If v is a String, then
      if (valueType == Porffor.TYPES.string || valueType == Porffor.TYPES._bytestring) {
        // 1. Assert: The next step never returns an abrupt completion because v is a String.

        // 2. Let tv be the result of parsing v as a date, in exactly the same manner as for the parse method (21.4.3.2).
        // todo
      } else {
        // iii. Else,
        // 1. Let tv be ? ToNumber(v).
        tv = Number(value);
      }
    }

    // d. Let dv be TimeClip(tv).
    dv = __ecma262_TimeClip(tv);
  } else {
    // 5. Else,
    // a. Assert: numberOfArgs ≥ 2.

    // b. Let y be ? ToNumber(values[0]).
    const y: number = Number(v0);

    // c. Let m be ? ToNumber(values[1]).
    const m: number = Number(v1);

    // d. If numberOfArgs > 2, let dt be ? ToNumber(values[2]); else let dt be 1𝔽.
    let dt: number = 1;
    if (numberOfArgs > 2) dt = Number(v2);

    // e. If numberOfArgs > 3, let h be ? ToNumber(values[3]); else let h be +0𝔽.
    let h: number = 0;
    if (numberOfArgs > 3) h = Number(v3);

    // f. If numberOfArgs > 4, let min be ? ToNumber(values[4]); else let min be +0𝔽.
    let min: number = 0;
    if (numberOfArgs > 4) min = Number(v4);

    // g. If numberOfArgs > 5, let s be ? ToNumber(values[5]); else let s be +0𝔽.
    let s: number = 0;
    if (numberOfArgs > 5) s = Number(v5);

    // h. If numberOfArgs > 6, let milli be ? ToNumber(values[6]); else let milli be +0𝔽.
    let milli: number = 0;
    if (numberOfArgs > 6) milli = Number(v6);

    // i. Let yr be MakeFullYear(y).
    const yr: number = __ecma262_MakeFullYear(y);

    // j. Let finalDate be MakeDate(MakeDay(yr, m, dt), MakeTime(h, min, s, milli)).
    const finalDate: number = __ecma262_MakeDate(__ecma262_MakeDay(yr, m, dt), __ecma262_MakeTime(h, min, s, milli));

    // k. Let dv be TimeClip(UTC(finalDate)).
    dv = __ecma262_TimeClip(__ecma262_UTC(finalDate));
  }

  // 6. Let O be ? OrdinaryCreateFromConstructor(NewTarget, "%Date.prototype%", « [[DateValue]] »).
  const O: Date = __Porffor_date_allocate();

  // 7. Set O.[[DateValue]] to dv.
  __Porffor_date_write(O, dv);

  // 8. Return O.
  return O;
};


// 21.4.3.1 Date.now () | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.now
// This function returns the time value designating the UTC date and time of the occurrence of the call to it.
export const __Date_now = (): number => Math.trunc(performance.timeOrigin + performance.now());

// 21.4.3.2 Date.parse (string) | https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date.parse
// todo

// 21.4.3.4 Date.UTC (year [, month [, date [, hours [, minutes [, seconds [, ms ]]]]]])
export const __Date_UTC = (year: unknown, month: unknown, date: unknown, hours: unknown, minutes: unknown, seconds: unknown, ms: unknown): number => {
  // todo: passing undefined to params should not act like no arg was passed

  // 1. Let y be ? ToNumber(year).
  const y: number = Number(year);

  // 2. If month is present, let m be ? ToNumber(month); else let m be +0𝔽.
  let m: number = 0;
  if (Porffor.rawType(month) != Porffor.TYPES.undefined) m = Number(month);

  // 3. If date is present, let dt be ? ToNumber(date); else let dt be 1𝔽.
  let dt: number = 1;
  if (Porffor.rawType(date) != Porffor.TYPES.undefined) dt = Number(date);

  // 4. If hours is present, let h be ? ToNumber(hours); else let h be +0𝔽.
  let h: number = 0;
  if (Porffor.rawType(hours) != Porffor.TYPES.undefined) h = Number(hours);

  // 5. If minutes is present, let min be ? ToNumber(minutes); else let min be +0𝔽.
  let min: number = 0;
  if (Porffor.rawType(minutes) != Porffor.TYPES.undefined) min = Number(minutes);

  // 6. If seconds is present, let s be ? ToNumber(seconds); else let s be +0𝔽.
  let s: number = 0;
  if (Porffor.rawType(seconds) != Porffor.TYPES.undefined) s = Number(seconds);

  // 7. If ms is present, let milli be ? ToNumber(ms); else let milli be +0𝔽.
  let milli: number = 0;
  if (Porffor.rawType(ms) != Porffor.TYPES.undefined) h = Number(ms);

  // 8. Let yr be MakeFullYear(y).
  const yr: number = __ecma262_MakeFullYear(y);

  // 9. Return TimeClip(MakeDate(MakeDay(yr, m, dt), MakeTime(h, min, s, milli))).
  return __ecma262_TimeClip(__ecma262_MakeDate(__ecma262_MakeDay(yr, m, dt), __ecma262_MakeTime(h, min, s, milli)));
};