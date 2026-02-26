export default `
var Temporal = {
  Duration: class Duration {
    constructor(years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds) {
      Object.defineProperty(this, '_temporalBrand', { value: 'Temporal.Duration', writable: false, enumerable: false, configurable: false });
      this._years = Duration._toInteger(years === undefined ? 0 : years, 'years');
      this._months = Duration._toInteger(months === undefined ? 0 : months, 'months');
      this._weeks = Duration._toInteger(weeks === undefined ? 0 : weeks, 'weeks');
      this._days = Duration._toInteger(days === undefined ? 0 : days, 'days');
      this._hours = Duration._toInteger(hours === undefined ? 0 : hours, 'hours');
      this._minutes = Duration._toInteger(minutes === undefined ? 0 : minutes, 'minutes');
      this._seconds = Duration._toInteger(seconds === undefined ? 0 : seconds, 'seconds');
      this._milliseconds = Duration._toInteger(milliseconds === undefined ? 0 : milliseconds, 'milliseconds');
      this._microseconds = Duration._toInteger(microseconds === undefined ? 0 : microseconds, 'microseconds');
      this._nanoseconds = Duration._toInteger(nanoseconds === undefined ? 0 : nanoseconds, 'nanoseconds');
    }

    static _toInteger(value, name) {
      const out = Number(value);
      if (!Number.isFinite(out)) throw new RangeError('Invalid ' + name);
      if (Object.is(out, -0)) return 0;
      return Math.trunc(out);
    }

    static _digit(str, i) {
      const x = str.charCodeAt(i) - 48;
      return x >= 0 && x <= 9 ? x : -1;
    }

    static _parseNDigits(str, start, count) {
      let out = 0;
      for (let i = 0; i < count; i++) {
        const d = Duration._digit(str, start + i);
        if (d < 0) return -1;
        out = out * 10 + d;
      }

      return out;
    }

    static _pad(value, size) {
      let out = String(Math.abs(value));
      while (out.length < size) out = '0' + out;
      return out;
    }

    static _toOptions(options) {
      if (options === undefined) return {};
      if (options === null) throw new TypeError('Options cannot be null');
      const t = typeof options;
      if (t !== 'object' && t !== 'function') throw new TypeError('Options must be an object');
      if (
        t === 'object' &&
        Object.keys(options).length === 0 &&
        !Object.isExtensible(options) &&
        Number.isFinite(Number(options))
      ) {
        throw new TypeError('Options must be an object');
      }
      return options;
    }

    static _getStringOption(options, name, fallback, allowed) {
      let value = options[name];
      if (value === undefined) return fallback;
      value = String(value);
      if (allowed && allowed.indexOf(value) < 0) {
        throw new RangeError('Invalid ' + name);
      }
      return value;
    }

    static _getUnitOption(options, name, fallback, allowed) {
      const value = options[name];
      if (value === undefined) {
        if (fallback === undefined) return undefined;
        return Duration._normalizeUnit(fallback, name, allowed);
      }

      return Duration._normalizeUnit(value, name, allowed);
    }

    static _normalizeUnit(unit, name, allowed) {
      let value = String(unit);
      if (value.length > 1 && value.charCodeAt(value.length - 1) === 115) {
        const singular = value.slice(0, -1);
        if (
          singular === 'year' || singular === 'month' || singular === 'week' || singular === 'day' ||
          singular === 'hour' || singular === 'minute' || singular === 'second' ||
          singular === 'millisecond' || singular === 'microsecond' || singular === 'nanosecond'
        ) {
          value = singular;
        }
      }
      if (allowed && allowed.indexOf(value) < 0) throw new RangeError('Invalid ' + name);
      return value;
    }

    static _getNumberOption(options, name, fallback) {
      const value = options[name];
      if (value === undefined) return fallback;
      return Duration._toInteger(value, name);
    }

    static _getRoundingIncrementOption(options) {
      const raw = options.roundingIncrement;
      if (raw === undefined) return 1;
      const num = Number(raw);
      if (!Number.isFinite(num)) throw new RangeError('Invalid roundingIncrement');
      let out = Math.trunc(num);
      if (Object.is(out, -0)) out = 0;
      if (out < 1 || out > 1000000000) throw new RangeError('roundingIncrement out of range');
      return out;
    }

    static _normalizeRoundingMode(mode, fallback) {
      const out = mode === undefined ? (fallback === undefined ? 'halfExpand' : fallback) : String(mode);
      if (out === 'ceil' || out === 'floor' || out === 'trunc' || out === 'expand' ||
        out === 'halfCeil' || out === 'halfFloor' || out === 'halfExpand' || out === 'halfTrunc' || out === 'halfEven') {
        return out;
      }
      throw new RangeError('Invalid roundingMode');
    }

    static _unitRank(unit) {
      if (unit === 'year') return 9;
      if (unit === 'month') return 8;
      if (unit === 'week') return 7;
      if (unit === 'day') return 6;
      if (unit === 'hour') return 5;
      if (unit === 'minute') return 4;
      if (unit === 'second') return 3;
      if (unit === 'millisecond') return 2;
      if (unit === 'microsecond') return 1;
      if (unit === 'nanosecond') return 0;
      return -1;
    }

    static _resolveAutoLargestUnit(smallestUnit, fallbackLargestUnit) {
      if (smallestUnit === undefined) return fallbackLargestUnit;
      return Duration._unitRank(smallestUnit) > Duration._unitRank(fallbackLargestUnit) ? smallestUnit : fallbackLargestUnit;
    }

    static _assertValidUnitRange(largestUnit, smallestUnit) {
      if (Duration._unitRank(largestUnit) < Duration._unitRank(smallestUnit)) {
        throw new RangeError('largestUnit cannot be smaller than smallestUnit');
      }
    }

    static _differenceSettings(options, smallestUnitFallback, smallestAllowed, largestUnitFallback, largestAllowed, roundingModeFallback) {
      const largestUnitValue = options.largestUnit;
      const largestUnitRaw = largestUnitValue === undefined ? 'auto' : Duration._normalizeUnit(largestUnitValue, 'largestUnit');
      const roundingIncrement = Duration._getRoundingIncrementOption(options);
      const roundingMode = Duration._normalizeRoundingMode(options.roundingMode, roundingModeFallback);
      const smallestUnitValue = options.smallestUnit;
      const smallestUnit = smallestUnitValue === undefined ? smallestUnitFallback : Duration._normalizeUnit(smallestUnitValue, 'smallestUnit');
      if (largestAllowed && largestAllowed.indexOf(largestUnitRaw) < 0) throw new RangeError('Invalid largestUnit');
      if (smallestAllowed && smallestAllowed.indexOf(smallestUnit) < 0) throw new RangeError('Invalid smallestUnit');
      const largestUnit = largestUnitRaw === 'auto' ? Duration._resolveAutoLargestUnit(smallestUnit, largestUnitFallback) : largestUnitRaw;
      Duration._assertValidUnitRange(largestUnit, smallestUnit);
      return { largestUnit, smallestUnit, roundingIncrement, roundingMode };
    }

    static _validateTimeRoundingIncrement(smallestUnit, roundingIncrement) {
      let dividend;
      if (smallestUnit === 'hour') dividend = 24;
      else if (smallestUnit === 'minute') dividend = 60;
      else if (smallestUnit === 'second') dividend = 60;
      else if (smallestUnit === 'millisecond') dividend = 1000;
      else if (smallestUnit === 'microsecond') dividend = 1000;
      else if (smallestUnit === 'nanosecond') dividend = 1000;
      if (dividend !== undefined && (roundingIncrement >= dividend || dividend % roundingIncrement !== 0)) {
        throw new RangeError('Invalid roundingIncrement');
      }
    }

    static _unitNanoseconds(unit) {
      if (unit === 'nanosecond') return 1;
      if (unit === 'microsecond') return 1000;
      if (unit === 'millisecond') return 1000000;
      if (unit === 'second') return 1000000000;
      if (unit === 'minute') return 60 * 1000000000;
      if (unit === 'hour') return 3600 * 1000000000;
      if (unit === 'day') return 86400 * 1000000000;
      if (unit === 'week') return 7 * 86400 * 1000000000;
      if (unit === 'month') return 30 * 86400 * 1000000000;
      if (unit === 'year') return 365 * 86400 * 1000000000;
      throw new RangeError('Invalid unit');
    }

    static _roundToIncrement(value, increment, mode) {
      if (!Number.isFinite(value)) throw new RangeError('Invalid rounding value');
      if (!Number.isFinite(increment) || increment <= 0) throw new RangeError('roundingIncrement must be positive');
      if (value === 0) return 0;

      const m = Duration._normalizeRoundingMode(mode, 'halfExpand');
      const sign = value < 0 ? -1 : 1;
      const abs = Math.abs(value);
      const q = abs / increment;
      const lo = Math.floor(q);
      const frac = q - lo;
      const up = frac === 0 ? lo : lo + 1;
      let steps = lo;

      if (m === 'trunc') steps = lo;
      else if (m === 'expand') steps = up;
      else if (m === 'ceil') steps = sign < 0 ? lo : up;
      else if (m === 'floor') steps = sign < 0 ? up : lo;
      else if (frac > 0.5) steps = up;
      else if (frac < 0.5) steps = lo;
      else if (m === 'halfTrunc') steps = lo;
      else if (m === 'halfCeil') steps = sign > 0 ? up : lo;
      else if (m === 'halfFloor') steps = sign < 0 ? up : lo;
      else if (m === 'halfEven') steps = lo % 2 === 0 ? lo : up;
      else steps = up;

      return sign * steps * increment;
    }

    static _roundNanoseconds(totalNanoseconds, smallestUnit, roundingIncrement, roundingMode) {
      const step = Duration._unitNanoseconds(smallestUnit) * roundingIncrement;
      return Duration._roundToIncrement(totalNanoseconds, step, roundingMode);
    }

    static _formatIsoYear(year) {
      const y = Duration._toInteger(year, 'year');
      if (y >= 0 && y <= 9999) return Duration._pad(y, 4);
      const sign = y < 0 ? '-' : '+';
      return sign + Duration._pad(Math.abs(y), 6);
    }

    static _offsetNanoseconds(text, label) {
      if (typeof text !== 'string') throw new TypeError((label || 'offset') + ' must be a string');
      if (text === 'Z' || text === 'z') return 0;
      if (text.length < 2) throw new RangeError('Invalid offset');
      const signChar = text.charCodeAt(0);
      if (signChar !== 43 && signChar !== 45) throw new RangeError('Invalid offset');
      const sign = signChar === 45 ? -1 : 1;

      let i = 1;
      if (i + 1 >= text.length) throw new RangeError('Invalid offset');
      const hh = Duration._parseNDigits(text, i, 2);
      if (hh < 0 || hh > 23) throw new RangeError('Invalid offset');
      i += 2;

      let mm = 0;
      let ss = 0;
      let frac = 0;
      let fracDigits = 0;

      if (i < text.length) {
        const sep = text.charCodeAt(i);
        if (sep === 58) {
          i++;
          if (i + 1 >= text.length) throw new RangeError('Invalid offset');
          mm = Duration._parseNDigits(text, i, 2);
          if (mm < 0 || mm > 59) throw new RangeError('Invalid offset');
          i += 2;
          if (i < text.length) {
            if (text.charCodeAt(i) !== 58) throw new RangeError('Invalid offset');
            i++;
            if (i + 1 >= text.length) throw new RangeError('Invalid offset');
            ss = Duration._parseNDigits(text, i, 2);
            if (ss < 0 || ss > 59) throw new RangeError('Invalid offset');
            i += 2;
          }
        } else {
          const remaining = text.length - i;
          if (remaining !== 2 && remaining !== 4) throw new RangeError('Invalid offset');
          mm = Duration._parseNDigits(text, i, 2);
          if (mm < 0 || mm > 59) throw new RangeError('Invalid offset');
          i += 2;
          if (remaining === 4) {
            ss = Duration._parseNDigits(text, i, 2);
            if (ss < 0 || ss > 59) throw new RangeError('Invalid offset');
            i += 2;
          }
        }
      }

      if (i < text.length) {
        if (text.charCodeAt(i) !== 46) throw new RangeError('Invalid offset');
        i++;
        while (i < text.length) {
          const d = Duration._digit(text, i);
          if (d < 0) throw new RangeError('Invalid offset');
          if (fracDigits < 9) frac = frac * 10 + d;
          fracDigits++;
          i++;
        }
      }

      if (i !== text.length) throw new RangeError('Invalid offset');
      while (fracDigits < 9) {
        frac *= 10;
        fracDigits++;
      }

      const totalNs = ((((hh * 60) + mm) * 60) + ss) * 1000000000 + frac;
      return sign * totalNs;
    }

    static _formatOffsetNanoseconds(nanoseconds) {
      if (!Number.isFinite(nanoseconds)) throw new RangeError('Invalid offset');
      const sign = nanoseconds < 0 ? '-' : '+';
      let abs = Math.abs(Math.trunc(nanoseconds));
      const hh = Math.trunc(abs / (3600 * 1000000000));
      abs -= hh * 3600 * 1000000000;
      const mm = Math.trunc(abs / (60 * 1000000000));
      abs -= mm * 60 * 1000000000;
      const ss = Math.trunc(abs / 1000000000);
      abs -= ss * 1000000000;
      let out = sign + Duration._pad(hh, 2) + ':' + Duration._pad(mm, 2);
      if (ss !== 0 || abs !== 0) {
        out += ':' + Duration._pad(ss, 2);
        if (abs !== 0) {
          let frac = Duration._pad(abs, 9);
          while (frac.length > 0 && frac.charCodeAt(frac.length - 1) === 48) frac = frac.slice(0, -1);
          out += '.' + frac;
        }
      }
      return out;
    }

    static _normalizeTimeZoneId(value, label) {
      let v = value;
      if (v === undefined) return 'UTC';
      if (v === null) throw new TypeError((label || 'timeZone') + ' cannot be null');
      const t = typeof v;
      if (t !== 'string' && t !== 'object') throw new TypeError((label || 'timeZone') + ' must be a string or object');
      if (typeof v === 'object') {
        if (v._temporalBrand === 'Temporal.ZonedDateTime') return v._timeZone;
        if (v.timeZoneId !== undefined) v = v.timeZoneId;
        else if (v.id !== undefined) v = v.id;
      }

      v = String(v);
      if (v.length === 0) throw new RangeError('Invalid timeZone');
      if (v.indexOf('[') >= 0 && v.indexOf(']') > v.indexOf('[')) {
        const ann = Temporal.PlainDate._extractAnnotations(v);
        if (ann.timeZone !== undefined) v = ann.timeZone;
      }

      if (v.indexOf('T') >= 0 || v.indexOf('t') >= 0 || v.indexOf(' ') >= 0) {
        const last = v.charCodeAt(v.length - 1);
        if (last === 90 || last === 122) return 'UTC';
        for (let i = v.length - 1; i > 0; i--) {
          const ch = v.charCodeAt(i);
          if (ch === 43 || ch === 45) {
            const maybeOffset = v.slice(i);
            try {
              return Duration._formatOffsetNanoseconds(Duration._offsetNanoseconds(maybeOffset, 'timeZone'));
            } catch (e) {}
          }
        }
      }

      const lower = v.toLowerCase();
      if (lower === 'utc' || lower === 'gmt' || lower === 'z') return 'UTC';
      if (v.charCodeAt(0) === 43 || v.charCodeAt(0) === 45) {
        return Duration._formatOffsetNanoseconds(Duration._offsetNanoseconds(v, 'timeZone'));
      }
      const first = v.charCodeAt(0);
      if (!((first >= 65 && first <= 90) || (first >= 97 && first <= 122))) {
        throw new RangeError('Invalid timeZone');
      }

      for (let i = 0; i < v.length; i++) {
        const c = v.charCodeAt(i);
        const ok =
          (c >= 65 && c <= 90) ||
          (c >= 97 && c <= 122) ||
          (c >= 48 && c <= 57) ||
          c === 47 || c === 95 || c === 45 || c === 43;
        if (!ok) throw new RangeError('Invalid timeZone');
      }

      return v;
    }

    static _timeZoneOffsetNanoseconds(timeZone) {
      const tz = Duration._normalizeTimeZoneId(timeZone, 'timeZone');
      if (tz === 'UTC') return 0;
      if (tz.charCodeAt(0) === 43 || tz.charCodeAt(0) === 45) {
        return Duration._offsetNanoseconds(tz, 'timeZone');
      }
      return 0;
    }

    static _normalizeCalendarId(value, label) {
      let v = value;
      if (v === undefined) return 'iso8601';
      if (v === null) throw new TypeError((label || 'calendar') + ' cannot be null');
      const t = typeof v;
      if (t !== 'string' && t !== 'object') throw new TypeError((label || 'calendar') + ' must be a string or object');
      if (typeof v === 'object') {
        if (v.calendarId !== undefined) v = v.calendarId;
        else if (v.id !== undefined) v = v.id;
        else if (v.calendar !== undefined) v = v.calendar;
        else throw new TypeError((label || 'calendar') + ' must be a string');
      }

      v = String(v);
      if (v.indexOf('[') >= 0 && v.indexOf('u-ca=') >= 0) {
        const ann = Temporal.PlainDate._extractAnnotations(v);
        v = ann.calendar;
      }

      v = v.toLowerCase();
      if (v === 'iso') v = 'iso8601';
      if (v.length === 0) throw new RangeError('Invalid calendar');
      if (v !== 'iso8601') throw new RangeError('Invalid calendar');
      const first = v.charCodeAt(0);
      if (first < 97 || first > 122) throw new RangeError('Invalid calendar');

      for (let i = 0; i < v.length; i++) {
        const c = v.charCodeAt(i);
        const ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45;
        if (!ok) throw new RangeError('Invalid calendar');
      }

      return v;
    }

    static _checkIsoDateRange(year, month, day) {
      if (year < -271821 || year > 275760) throw new RangeError('Date outside valid ISO range');
      if (year === -271821) {
        if (month < 4 || (month === 4 && day < 20)) throw new RangeError('Date outside valid ISO range');
      }
      if (year === 275760) {
        if (month > 9 || (month === 9 && day > 13)) throw new RangeError('Date outside valid ISO range');
      }
    }

    static _checkEpochNanosecondsRange(epochNanoseconds) {
      const max = 8640000000000000000000;
      if (!Number.isFinite(epochNanoseconds)) throw new RangeError('Invalid epochNanoseconds');
      if (epochNanoseconds < -max || epochNanoseconds > max) throw new RangeError('epochNanoseconds out of range');
    }

    static _requireThis(value, label) {
      if (!value || typeof value !== 'object' || value._temporalBrand !== 'Temporal.Duration') {
        throw new TypeError('Temporal.Duration.prototype.' + label + ' called on incompatible receiver');
      }

      return value;
    }

    static _coerce(value, label) {
      if (typeof value === 'string') {
        const parsed = Duration._parseISO(value);
        return new Duration(
          parsed.years,
          parsed.months,
          parsed.weeks,
          parsed.days,
          parsed.hours,
          parsed.minutes,
          parsed.seconds,
          parsed.milliseconds,
          parsed.microseconds,
          parsed.nanoseconds
        );
      }

      if (value && typeof value === 'object') {
        if (value._temporalBrand === 'Temporal.Duration') return value;

        return new Duration(
          value.years,
          value.months,
          value.weeks,
          value.days,
          value.hours,
          value.minutes,
          value.seconds,
          value.milliseconds,
          value.microseconds,
          value.nanoseconds
        );
      }

      throw new TypeError('Temporal.Duration.' + label + ' requires a duration-like value');
    }

    static _parseISO(value) {
      if (typeof value !== 'string') throw new TypeError('Temporal.Duration string expected');
      if (value.length < 2) throw new RangeError('Invalid duration string');

      let i = 0;
      let sign = 1;
      if (value.charCodeAt(i) === 43) i++;
      else if (value.charCodeAt(i) === 45) {
        sign = -1;
        i++;
      }

      if (value.charCodeAt(i) !== 80) throw new RangeError('Invalid duration string');
      i++;

      let inTime = false;
      let hadAny = false;
      let years = 0;
      let months = 0;
      let weeks = 0;
      let days = 0;
      let hours = 0;
      let minutes = 0;
      let seconds = 0;
      let milliseconds = 0;
      let microseconds = 0;
      let nanoseconds = 0;

      while (i < value.length) {
        if (value.charCodeAt(i) === 84) {
          inTime = true;
          i++;
          continue;
        }

        if (i >= value.length) break;

        let intPart = 0;
        let intDigits = 0;
        while (i < value.length) {
          const d = Duration._digit(value, i);
          if (d < 0) break;
          intPart = intPart * 10 + d;
          intDigits++;
          i++;
        }

        if (intDigits === 0) throw new RangeError('Invalid duration string');

        let fracPart = 0;
        let fracDigits = 0;
        if (i < value.length && value.charCodeAt(i) === 46) {
          i++;
          while (i < value.length) {
            const d = Duration._digit(value, i);
            if (d < 0) break;
            if (fracDigits < 9) fracPart = fracPart * 10 + d;
            fracDigits++;
            i++;
          }
        }

        if (i >= value.length) throw new RangeError('Invalid duration string');
        const unit = value.charCodeAt(i);
        i++;

        hadAny = true;
        if (!inTime && unit === 89) {
          years = intPart;
          continue;
        }

        if (!inTime && unit === 77) {
          months = intPart;
          continue;
        }

        if (!inTime && unit === 87) {
          weeks = intPart;
          continue;
        }

        if (!inTime && unit === 68) {
          days = intPart;
          continue;
        }

        if (inTime && unit === 72) {
          hours = intPart;
          continue;
        }

        if (inTime && unit === 77) {
          minutes = intPart;
          continue;
        }

        if (inTime && unit === 83) {
          seconds = intPart;
          if (fracDigits > 0) {
            let nanos = fracPart;
            let p = fracDigits;
            while (p < 9) {
              nanos *= 10;
              p++;
            }
            milliseconds = Math.trunc(nanos / 1000000);
            nanos -= milliseconds * 1000000;
            microseconds = Math.trunc(nanos / 1000);
            nanos -= microseconds * 1000;
            nanoseconds = nanos;
          }
          continue;
        }

        throw new RangeError('Invalid duration string');
      }

      if (!hadAny) throw new RangeError('Invalid duration string');

      return {
        years: years * sign,
        months: months * sign,
        weeks: weeks * sign,
        days: days * sign,
        hours: hours * sign,
        minutes: minutes * sign,
        seconds: seconds * sign,
        milliseconds: milliseconds * sign,
        microseconds: microseconds * sign,
        nanoseconds: nanoseconds * sign
      };
    }

    static _hasCalendarUnits(duration) {
      return duration.years !== 0 || duration.months !== 0 || duration.weeks !== 0;
    }

    static _toRelativeToDate(relativeTo) {
      if (relativeTo == null) return null;
      if (typeof relativeTo === 'string') {
        const parts = Temporal.PlainDateTime._parseISODateTimeString(relativeTo);
        if (parts.timeZone !== undefined && parts.offsetNanoseconds != null) {
          const tz = Temporal.Duration._normalizeTimeZoneId(parts.timeZone, 'timeZone');
          if (tz.charCodeAt(0) === 43 || tz.charCodeAt(0) === 45) {
            if (Temporal.Duration._offsetNanoseconds(tz, 'timeZone') !== parts.offsetNanoseconds) {
              throw new RangeError('Offset does not match time zone');
            }
          }
        }
        return new Temporal.PlainDate(parts.date.year, parts.date.month, parts.date.day, parts.calendar);
      }

      if (typeof relativeTo !== 'object') throw new TypeError('relativeTo must be an object or string');
      if (relativeTo._temporalBrand === 'Temporal.PlainDate') return Temporal.PlainDate.from(relativeTo);
      if (relativeTo._temporalBrand === 'Temporal.PlainDateTime') return relativeTo.toPlainDate();
      if (relativeTo._temporalBrand === 'Temporal.ZonedDateTime') return relativeTo.toPlainDate();
      if (relativeTo.year !== undefined && relativeTo.month !== undefined && relativeTo.day !== undefined) {
        return Temporal.PlainDate.from(relativeTo);
      }
      throw new TypeError('Invalid relativeTo');
    }

    static _calendarDaySeconds(duration, relativeTo) {
      const base = Duration._toRelativeToDate(relativeTo);
      if (!base) {
        return (duration.years * 365 + duration.months * 30 + duration.weeks * 7 + duration.days) * 86400;
      }

      const startMs = Date.UTC(base.year, base.month - 1, base.day);

      let year = base.year + duration.years;
      let month = base.month + duration.months;
      while (month > 12) {
        month -= 12;
        year++;
      }
      while (month < 1) {
        month += 12;
        year--;
      }

      let day = base.day;
      const dim = Temporal.PlainDate._daysInMonth(year, month);
      if (day > dim) day = dim;

      const shifted = new Date(Date.UTC(year, month - 1, day));
      shifted.setUTCDate(shifted.getUTCDate() + duration.weeks * 7 + duration.days);
      const endMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
      return (endMs - startMs) / 1000;
    }

    static _totalNanoseconds(duration, relativeTo) {
      const daySeconds = Duration._calendarDaySeconds(duration, relativeTo);
      const h = duration.hours * 3600;
      const m = duration.minutes * 60;
      const s = duration.seconds;
      const ms = duration.milliseconds / 1000;
      const us = duration.microseconds / 1000000;
      const ns = duration.nanoseconds / 1000000000;
      return (daySeconds + h + m + s + ms + us + ns) * 1000000000;
    }

    static from(value) {
      return Duration._coerce(value, 'from');
    }

    static compare(one, two, options) {
      const opts = Duration._toOptions(options);
      const a = Duration._coerce(one, 'compare');
      const b = Duration._coerce(two, 'compare');
      const relativeTo = opts.relativeTo;
      if ((Duration._hasCalendarUnits(a) || Duration._hasCalendarUnits(b)) && relativeTo === undefined) {
        throw new RangeError('relativeTo is required for years/months/weeks');
      }
      const aa = Duration._totalNanoseconds(a, relativeTo);
      const bb = Duration._totalNanoseconds(b, relativeTo);
      if (aa < bb) return -1;
      if (aa > bb) return 1;
      return 0;
    }

    static _fromTotalNanoseconds(total) {
      return Duration._balanceNanoseconds(total, 'day');
    }

    static _balanceNanoseconds(total, largestUnit) {
      const unit = largestUnit === undefined ? 'day' : largestUnit;
      let sign = 1;
      let rest = Math.trunc(total);
      if (rest < 0) {
        sign = -1;
        rest = -rest;
      }

      let years = 0;
      let months = 0;
      let weeks = 0;
      let days = 0;
      let hours = 0;
      let minutes = 0;
      let seconds = 0;
      let milliseconds = 0;
      let microseconds = 0;
      let nanoseconds = 0;

      if (unit === 'year') {
        years = Math.trunc(rest / Duration._unitNanoseconds('year'));
        rest -= years * Duration._unitNanoseconds('year');
      } else if (unit === 'month') {
        months = Math.trunc(rest / Duration._unitNanoseconds('month'));
        rest -= months * Duration._unitNanoseconds('month');
      } else if (unit === 'week') {
        weeks = Math.trunc(rest / Duration._unitNanoseconds('week'));
        rest -= weeks * Duration._unitNanoseconds('week');
      } else if (unit === 'day') {
        days = Math.trunc(rest / Duration._unitNanoseconds('day'));
        rest -= days * Duration._unitNanoseconds('day');
      } else if (unit === 'hour') {
        hours = Math.trunc(rest / Duration._unitNanoseconds('hour'));
        rest -= hours * Duration._unitNanoseconds('hour');
      } else if (unit === 'minute') {
        minutes = Math.trunc(rest / Duration._unitNanoseconds('minute'));
        rest -= minutes * Duration._unitNanoseconds('minute');
      } else if (unit === 'second') {
        seconds = Math.trunc(rest / Duration._unitNanoseconds('second'));
        rest -= seconds * Duration._unitNanoseconds('second');
      } else if (unit === 'millisecond') {
        milliseconds = Math.trunc(rest / Duration._unitNanoseconds('millisecond'));
        rest -= milliseconds * Duration._unitNanoseconds('millisecond');
      } else if (unit === 'microsecond') {
        microseconds = Math.trunc(rest / Duration._unitNanoseconds('microsecond'));
        rest -= microseconds * Duration._unitNanoseconds('microsecond');
      }

      if (unit === 'year' || unit === 'month' || unit === 'week' || unit === 'day') {
        hours += Math.trunc(rest / Duration._unitNanoseconds('hour'));
        rest -= hours * Duration._unitNanoseconds('hour');
        minutes = Math.trunc(rest / Duration._unitNanoseconds('minute'));
        rest -= minutes * Duration._unitNanoseconds('minute');
        seconds = Math.trunc(rest / Duration._unitNanoseconds('second'));
        rest -= seconds * Duration._unitNanoseconds('second');
        milliseconds = Math.trunc(rest / Duration._unitNanoseconds('millisecond'));
        rest -= milliseconds * Duration._unitNanoseconds('millisecond');
        microseconds = Math.trunc(rest / Duration._unitNanoseconds('microsecond'));
        rest -= microseconds * Duration._unitNanoseconds('microsecond');
        nanoseconds = rest;
      } else if (unit === 'hour') {
        minutes = Math.trunc(rest / Duration._unitNanoseconds('minute'));
        rest -= minutes * Duration._unitNanoseconds('minute');
        seconds = Math.trunc(rest / Duration._unitNanoseconds('second'));
        rest -= seconds * Duration._unitNanoseconds('second');
        milliseconds = Math.trunc(rest / Duration._unitNanoseconds('millisecond'));
        rest -= milliseconds * Duration._unitNanoseconds('millisecond');
        microseconds = Math.trunc(rest / Duration._unitNanoseconds('microsecond'));
        rest -= microseconds * Duration._unitNanoseconds('microsecond');
        nanoseconds = rest;
      } else if (unit === 'minute') {
        seconds = Math.trunc(rest / Duration._unitNanoseconds('second'));
        rest -= seconds * Duration._unitNanoseconds('second');
        milliseconds = Math.trunc(rest / Duration._unitNanoseconds('millisecond'));
        rest -= milliseconds * Duration._unitNanoseconds('millisecond');
        microseconds = Math.trunc(rest / Duration._unitNanoseconds('microsecond'));
        rest -= microseconds * Duration._unitNanoseconds('microsecond');
        nanoseconds = rest;
      } else if (unit === 'second') {
        milliseconds = Math.trunc(rest / Duration._unitNanoseconds('millisecond'));
        rest -= milliseconds * Duration._unitNanoseconds('millisecond');
        microseconds = Math.trunc(rest / Duration._unitNanoseconds('microsecond'));
        rest -= microseconds * Duration._unitNanoseconds('microsecond');
        nanoseconds = rest;
      } else if (unit === 'millisecond') {
        microseconds = Math.trunc(rest / Duration._unitNanoseconds('microsecond'));
        rest -= microseconds * Duration._unitNanoseconds('microsecond');
        nanoseconds = rest;
      } else if (unit === 'microsecond') {
        nanoseconds = rest;
      } else if (unit === 'nanosecond') {
        nanoseconds = rest;
      }

      return new Duration(
        years * sign,
        months * sign,
        weeks * sign,
        days * sign,
        hours * sign,
        minutes * sign,
        seconds * sign,
        milliseconds * sign,
        microseconds * sign,
        nanoseconds * sign
      );
    }

    get years() { return Duration._requireThis(this, 'years')._years; }
    get months() { return Duration._requireThis(this, 'months')._months; }
    get weeks() { return Duration._requireThis(this, 'weeks')._weeks; }
    get days() { return Duration._requireThis(this, 'days')._days; }
    get hours() { return Duration._requireThis(this, 'hours')._hours; }
    get minutes() { return Duration._requireThis(this, 'minutes')._minutes; }
    get seconds() { return Duration._requireThis(this, 'seconds')._seconds; }
    get milliseconds() { return Duration._requireThis(this, 'milliseconds')._milliseconds; }
    get microseconds() { return Duration._requireThis(this, 'microseconds')._microseconds; }
    get nanoseconds() { return Duration._requireThis(this, 'nanoseconds')._nanoseconds; }

    get sign() {
      const d = Duration._requireThis(this, 'sign');
      const arr = [d._years, d._months, d._weeks, d._days, d._hours, d._minutes, d._seconds, d._milliseconds, d._microseconds, d._nanoseconds];
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] < 0) return -1;
        if (arr[i] > 0) return 1;
      }
      return 0;
    }

    get blank() {
      return Duration._requireThis(this, 'blank').sign === 0;
    }

    with(item) {
      const d = Duration._requireThis(this, 'with');
      if (!item || typeof item !== 'object') throw new TypeError('Temporal.Duration.with requires an object');
      return new Temporal.Duration(
        item.years === undefined ? d._years : item.years,
        item.months === undefined ? d._months : item.months,
        item.weeks === undefined ? d._weeks : item.weeks,
        item.days === undefined ? d._days : item.days,
        item.hours === undefined ? d._hours : item.hours,
        item.minutes === undefined ? d._minutes : item.minutes,
        item.seconds === undefined ? d._seconds : item.seconds,
        item.milliseconds === undefined ? d._milliseconds : item.milliseconds,
        item.microseconds === undefined ? d._microseconds : item.microseconds,
        item.nanoseconds === undefined ? d._nanoseconds : item.nanoseconds
      );
    }

    negated() {
      const d = Duration._requireThis(this, 'negated');
      return new Temporal.Duration(-d._years, -d._months, -d._weeks, -d._days, -d._hours, -d._minutes, -d._seconds, -d._milliseconds, -d._microseconds, -d._nanoseconds);
    }

    abs() {
      const d = Duration._requireThis(this, 'abs');
      return new Temporal.Duration(
        Math.abs(d._years),
        Math.abs(d._months),
        Math.abs(d._weeks),
        Math.abs(d._days),
        Math.abs(d._hours),
        Math.abs(d._minutes),
        Math.abs(d._seconds),
        Math.abs(d._milliseconds),
        Math.abs(d._microseconds),
        Math.abs(d._nanoseconds)
      );
    }

    add(other) {
      const d = Duration._requireThis(this, 'add');
      const rhs = Duration._coerce(other, 'add');
      return new Temporal.Duration(
        d._years + rhs._years,
        d._months + rhs._months,
        d._weeks + rhs._weeks,
        d._days + rhs._days,
        d._hours + rhs._hours,
        d._minutes + rhs._minutes,
        d._seconds + rhs._seconds,
        d._milliseconds + rhs._milliseconds,
        d._microseconds + rhs._microseconds,
        d._nanoseconds + rhs._nanoseconds
      );
    }

    subtract(other) {
      Duration._requireThis(this, 'subtract');
      const rhs = Duration._coerce(other, 'subtract');
      return this.add(rhs.negated());
    }

    round(options) {
      const d = Duration._requireThis(this, 'round');
      if (options === undefined) throw new TypeError('options is required');
      const opts = typeof options === 'string' ? { smallestUnit: options } : Duration._toOptions(options);
      if (opts.smallestUnit === undefined && opts.largestUnit === undefined) {
        throw new RangeError('smallestUnit or largestUnit is required');
      }
      const smallestUnit = Duration._getUnitOption(opts, 'smallestUnit', 'nanosecond', [ 'year', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ]);
      const largestUnit = Duration._getUnitOption(opts, 'largestUnit', 'auto', [ 'auto', 'year', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ]);
      const increment = Duration._getNumberOption(opts, 'roundingIncrement', 1);
      const mode = Duration._normalizeRoundingMode(opts.roundingMode, 'halfExpand');
      const relativeTo = opts.relativeTo;
      if (increment <= 0) throw new RangeError('roundingIncrement must be positive');
      if (Duration._hasCalendarUnits(d) && relativeTo === undefined) throw new RangeError('relativeTo is required for calendar units');

      const total = Duration._totalNanoseconds(d, relativeTo);
      const rounded = Duration._roundNanoseconds(total, smallestUnit, increment, mode);
      return largestUnit === 'auto' ? Duration._fromTotalNanoseconds(rounded) : Duration._balanceNanoseconds(rounded, largestUnit);
    }

    total(options) {
      const d = Duration._requireThis(this, 'total');
      if (options === undefined) throw new TypeError('options is required');
      const opts = typeof options === 'string' ? { unit: options } : Duration._toOptions(options);
      const unit = Duration._getUnitOption(opts, 'unit', opts.smallestUnit, [ 'year', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ]);
      if (unit === undefined) throw new RangeError('unit is required');
      if (Duration._hasCalendarUnits(d) && opts.relativeTo === undefined) throw new RangeError('relativeTo is required for calendar units');
      const totalNs = Duration._totalNanoseconds(d, opts.relativeTo);
      return totalNs / Duration._unitNanoseconds(unit);
    }

    toString(options) {
      const d = Duration._requireThis(this, 'toString');
      const opts = Duration._toOptions(options);
      const smallestUnit = Duration._getUnitOption(opts, 'smallestUnit', 'nanosecond', [ 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ]);
      const roundingIncrement = Duration._getNumberOption(opts, 'roundingIncrement', 1);
      const roundingMode = Duration._normalizeRoundingMode(opts.roundingMode, 'trunc');
      const fractionalSecondDigits = opts.fractionalSecondDigits;
      const needsRounding = opts.smallestUnit !== undefined || opts.roundingIncrement !== undefined || opts.roundingMode !== undefined;
      const rounded = needsRounding ? d.round({
        smallestUnit,
        roundingIncrement,
        roundingMode,
        relativeTo: opts.relativeTo
      }) : d;

      let sign = '';
      if (rounded.sign < 0) sign = '-';

      const y = Math.abs(rounded._years);
      const mo = Math.abs(rounded._months);
      const w = Math.abs(rounded._weeks);
      const da = Math.abs(rounded._days);
      const h = Math.abs(rounded._hours);
      const mi = Math.abs(rounded._minutes);
      const s = Math.abs(rounded._seconds);
      const ms = Math.abs(rounded._milliseconds);
      const us = Math.abs(rounded._microseconds);
      const ns = Math.abs(rounded._nanoseconds);

      let out = sign + 'P';
      if (y) out += y + 'Y';
      if (mo) out += mo + 'M';
      if (w) out += w + 'W';
      if (da) out += da + 'D';

      if (h || mi || s || ms || us || ns) {
        out += 'T';
        if (h) out += h + 'H';
        if (mi) out += mi + 'M';

        if (s || ms || us || ns) {
          let secondsPart = s;
          let msPart = ms;
          let usPart = us;
          let nsPart = ns;
          if (nsPart >= 1000) {
            const carry = Math.trunc(nsPart / 1000);
            usPart += carry;
            nsPart -= carry * 1000;
          }
          if (usPart >= 1000) {
            const carry = Math.trunc(usPart / 1000);
            msPart += carry;
            usPart -= carry * 1000;
          }
          if (msPart >= 1000) {
            const carry = Math.trunc(msPart / 1000);
            secondsPart += carry;
            msPart -= carry * 1000;
          }
          const frac = msPart * 1000000 + usPart * 1000 + nsPart;
          if (frac === 0) {
            out += secondsPart + 'S';
          } else {
            let fracText = Duration._pad(frac, 9);
            if (fractionalSecondDigits !== undefined && fractionalSecondDigits !== 'auto') {
              const fd = Duration._toInteger(fractionalSecondDigits, 'fractionalSecondDigits');
              if (fd < 0 || fd > 9) throw new RangeError('fractionalSecondDigits out of range');
              fracText = fracText.slice(0, fd);
              while (fracText.length < fd) fracText += '0';
            }
            while (fracText.length > 0 && fracText.charCodeAt(fracText.length - 1) === 48) {
              fracText = fracText.slice(0, -1);
            }
            if (fracText.length === 0) out += secondsPart + 'S';
            else out += secondsPart + '.' + fracText + 'S';
          }
        }
      }

      if (out === sign + 'P') out += 'T0S';
      return out;
    }

    toJSON() {
      Duration._requireThis(this, 'toJSON');
      return this.toString();
    }

    toLocaleString() {
      Duration._requireThis(this, 'toLocaleString');
      return this.toString();
    }

    valueOf() {
      Duration._requireThis(this, 'valueOf');
      throw new TypeError('Do not use valueOf on Temporal.Duration');
    }
  },

  Instant: class Instant {
    constructor(epochNanoseconds) {
      Object.defineProperty(this, '_temporalBrand', { value: 'Temporal.Instant', writable: false, enumerable: false, configurable: false });
      this._epochNanoseconds = Temporal.Duration._toInteger(epochNanoseconds, 'epochNanoseconds');
      Temporal.Duration._checkEpochNanosecondsRange(this._epochNanoseconds);
    }

    static _requireThis(value, label) {
      if (!value || typeof value !== 'object' || value._temporalBrand !== 'Temporal.Instant') {
        throw new TypeError('Temporal.Instant.prototype.' + label + ' called on incompatible receiver');
      }

      return value;
    }

    static fromEpochMilliseconds(epochMilliseconds) {
      const ms = Temporal.Duration._toInteger(epochMilliseconds, 'epochMilliseconds');
      return new Temporal.Instant(ms * 1000000);
    }

    static fromEpochNanoseconds(epochNanoseconds) {
      return new Temporal.Instant(epochNanoseconds);
    }

    static from(value) {
      if (typeof value === 'string') {
        const parts = Temporal.PlainDateTime._parseISODateTimeString(value);
        if (parts.time == null) throw new RangeError('Temporal.Instant requires a date-time string');
        return new Temporal.Instant(Temporal.PlainDateTime._partsToEpochNanoseconds(parts, true));
      }

      if (value && typeof value === 'object') {
        if (value._temporalBrand === 'Temporal.Instant') return new Temporal.Instant(value._epochNanoseconds);
        if (value.epochNanoseconds !== undefined) return new Temporal.Instant(value.epochNanoseconds);
        if (value.epochMilliseconds !== undefined) return Temporal.Instant.fromEpochMilliseconds(value.epochMilliseconds);
        if (typeof value.toString === 'function') return Temporal.Instant.from(value.toString());
      }

      throw new TypeError('Cannot convert value to Temporal.Instant');
    }

    static compare(a, b) {
      const aa = Temporal.Instant.from(a);
      const bb = Temporal.Instant.from(b);
      if (aa._epochNanoseconds < bb._epochNanoseconds) return -1;
      if (aa._epochNanoseconds > bb._epochNanoseconds) return 1;
      return 0;
    }

    get epochNanoseconds() { return Temporal.Instant._requireThis(this, 'epochNanoseconds')._epochNanoseconds; }
    get epochMilliseconds() { return Math.trunc(Temporal.Instant._requireThis(this, 'epochMilliseconds')._epochNanoseconds / 1000000); }

    equals(other) {
      Temporal.Instant._requireThis(this, 'equals');
      return Temporal.Instant.compare(this, other) === 0;
    }

    add(durationLike) {
      Temporal.Instant._requireThis(this, 'add');
      const d = Temporal.Duration.from(durationLike);
      if (d.years !== 0 || d.months !== 0 || d.weeks !== 0 || d.days !== 0) {
        throw new RangeError('Temporal.Instant.add does not support calendar units');
      }

      return new Temporal.Instant(this._epochNanoseconds + Temporal.Duration._totalNanoseconds(d));
    }

    subtract(durationLike) {
      Temporal.Instant._requireThis(this, 'subtract');
      return this.add(Temporal.Duration.from(durationLike).negated());
    }

    since(other, options = undefined) {
      Temporal.Instant._requireThis(this, 'since');
      const rhs = Temporal.Instant.from(other);
      const opts = Temporal.Duration._toOptions(options);
      const settings = Temporal.Duration._differenceSettings(
        opts,
        'nanosecond',
        [ 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ],
        'second',
        [ 'auto', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ],
        'trunc'
      );
      Temporal.Duration._validateTimeRoundingIncrement(settings.smallestUnit, settings.roundingIncrement);
      const total = this._epochNanoseconds - rhs._epochNanoseconds;
      const rounded = Temporal.Duration._roundNanoseconds(total, settings.smallestUnit, settings.roundingIncrement, settings.roundingMode);
      return Temporal.Duration._balanceNanoseconds(rounded, settings.largestUnit);
    }

    until(other, options) {
      Temporal.Instant._requireThis(this, 'until');
      return Temporal.Instant.from(other).since(this, options);
    }

    round(options) {
      Temporal.Instant._requireThis(this, 'round');
      if (options === undefined) throw new TypeError('options is required');
      const opts = typeof options === 'string' ? { smallestUnit: options } : Temporal.Duration._toOptions(options);
      if (opts.smallestUnit === undefined) throw new RangeError('smallestUnit is required');
      const smallestUnit = Temporal.Duration._getUnitOption(opts, 'smallestUnit', undefined, [ 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ]);
      const increment = Temporal.Duration._getNumberOption(opts, 'roundingIncrement', 1);
      const mode = Temporal.Duration._normalizeRoundingMode(opts.roundingMode, 'halfExpand');
      if (increment <= 0) throw new RangeError('roundingIncrement must be positive');
      return new Temporal.Instant(Temporal.Duration._roundNanoseconds(this._epochNanoseconds, smallestUnit, increment, mode));
    }

    toZonedDateTimeISO(timeZone) {
      Temporal.Instant._requireThis(this, 'toZonedDateTimeISO');
      return new Temporal.ZonedDateTime(this._epochNanoseconds, timeZone === undefined ? 'UTC' : timeZone, 'iso8601');
    }

    toZonedDateTime(item) {
      Temporal.Instant._requireThis(this, 'toZonedDateTime');
      if (!item || typeof item !== 'object') throw new TypeError('Temporal.Instant.toZonedDateTime requires an object');
      return new Temporal.ZonedDateTime(this._epochNanoseconds, item.timeZone, item.calendar === undefined ? 'iso8601' : item.calendar);
    }

    toString(options) {
      Temporal.Instant._requireThis(this, 'toString');
      const opts = Temporal.Duration._toOptions(options);
      const smallestUnit = Temporal.Duration._getUnitOption(opts, 'smallestUnit', 'nanosecond', [ 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ]);
      const roundingMode = Temporal.Duration._normalizeRoundingMode(opts.roundingMode, 'trunc');
      const roundingIncrement = Temporal.Duration._getNumberOption(opts, 'roundingIncrement', 1);
      const fractionalSecondDigits = opts.fractionalSecondDigits;
      const rounded = this.round({ smallestUnit, roundingMode, roundingIncrement });
      let ns = rounded._epochNanoseconds;
      let ms = ns >= 0 ? Math.trunc(ns / 1000000) : Math.floor(ns / 1000000);
      let remNs = ns - ms * 1000000;
      if (remNs < 0) remNs += 1000000;

      const d = new Date(ms);
      const year = Temporal.Duration._formatIsoYear(d.getUTCFullYear());
      const month = Temporal.Duration._pad(d.getUTCMonth() + 1, 2);
      const day = Temporal.Duration._pad(d.getUTCDate(), 2);
      const hour = Temporal.Duration._pad(d.getUTCHours(), 2);
      const minute = Temporal.Duration._pad(d.getUTCMinutes(), 2);
      const second = Temporal.Duration._pad(d.getUTCSeconds(), 2);

      let out = year + '-' + month + '-' + day + 'T' + hour;
      if (smallestUnit !== 'hour') out += ':' + minute;
      if (smallestUnit !== 'hour' && smallestUnit !== 'minute') out += ':' + second;
      if (smallestUnit !== 'hour' && smallestUnit !== 'minute' && (smallestUnit !== 'second' || fractionalSecondDigits !== undefined)) {
        let fracNs = d.getUTCMilliseconds() * 1000000 + remNs;
        let fracText = Temporal.Duration._pad(fracNs, 9);
        if (fractionalSecondDigits !== undefined && fractionalSecondDigits !== 'auto') {
          const fd = Temporal.Duration._toInteger(fractionalSecondDigits, 'fractionalSecondDigits');
          if (fd < 0 || fd > 9) throw new RangeError('fractionalSecondDigits out of range');
          fracText = fracText.slice(0, fd);
          while (fracText.length < fd) fracText += '0';
        } else if (smallestUnit === 'millisecond') fracText = fracText.slice(0, 3);
        else if (smallestUnit === 'microsecond') fracText = fracText.slice(0, 6);
        else {
          while (fracText.length > 0 && fracText.charCodeAt(fracText.length - 1) === 48) fracText = fracText.slice(0, -1);
        }
        if (fracText.length > 0) out += '.' + fracText;
      }

      return out + 'Z';
    }

    toJSON() {
      Temporal.Instant._requireThis(this, 'toJSON');
      return this.toString();
    }

    toLocaleString() {
      Temporal.Instant._requireThis(this, 'toLocaleString');
      return this.toString();
    }

    valueOf() {
      Temporal.Instant._requireThis(this, 'valueOf');
      throw new TypeError('Do not use valueOf on Temporal.Instant');
    }
  },

  PlainDate: class PlainDate {
    constructor(year, month, day, calendar = undefined) {
      Object.defineProperty(this, '_temporalBrand', { value: 'Temporal.PlainDate', writable: false, enumerable: false, configurable: false });
      this._year = Temporal.Duration._toInteger(year, 'year');
      this._month = Temporal.Duration._toInteger(month, 'month');
      this._day = Temporal.Duration._toInteger(day, 'day');
      this._calendar = Temporal.Duration._normalizeCalendarId(calendar, 'calendar');
      Temporal.PlainDate._validate(this._year, this._month, this._day);
      Temporal.Duration._checkIsoDateRange(this._year, this._month, this._day);
    }

    static _requireThis(value, label) {
      if (!value || typeof value !== 'object' || value._temporalBrand !== 'Temporal.PlainDate') {
        throw new TypeError('Temporal.PlainDate.prototype.' + label + ' called on incompatible receiver');
      }

      return value;
    }

    static _digit(str, i) {
      const d = str.charCodeAt(i) - 48;
      return d >= 0 && d <= 9 ? d : -1;
    }

    static _isLeapYear(year) {
      if (year % 400 === 0) return true;
      if (year % 100 === 0) return false;
      return year % 4 === 0;
    }

    static _daysInMonth(year, month) {
      if (month === 1 || month === 3 || month === 5 || month === 7 || month === 8 || month === 10 || month === 12) return 31;
      if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
      if (month === 2) return Temporal.PlainDate._isLeapYear(year) ? 29 : 28;
      return 0;
    }

    static _validate(year, month, day) {
      if (month < 1 || month > 12) throw new RangeError('Invalid month');
      const dim = Temporal.PlainDate._daysInMonth(year, month);
      if (day < 1 || day > dim) throw new RangeError('Invalid day');
    }

    static _epochDay(date) {
      return Math.trunc(Date.UTC(date._year, date._month - 1, date._day) / 86400000);
    }

    static _differenceMonthsDays(lhs, rhs) {
      let months = (lhs._year - rhs._year) * 12 + (lhs._month - rhs._month);
      let pivot = rhs.add(new Temporal.Duration(0, months, 0, 0, 0, 0, 0, 0, 0, 0), { overflow: 'constrain' });
      const cmp = Temporal.PlainDate.compare(pivot, lhs);
      if (months > 0 && cmp > 0) {
        months--;
        pivot = rhs.add(new Temporal.Duration(0, months, 0, 0, 0, 0, 0, 0, 0, 0), { overflow: 'constrain' });
      } else if (months < 0 && cmp < 0) {
        months++;
        pivot = rhs.add(new Temporal.Duration(0, months, 0, 0, 0, 0, 0, 0, 0, 0), { overflow: 'constrain' });
      }
      const days = Temporal.PlainDate._epochDay(lhs) - Temporal.PlainDate._epochDay(pivot);
      return { months, days };
    }

    static _roundedCalendarMonths(rhs, months, days, unit, roundingIncrement, roundingMode) {
      const unitMonths = unit === 'year' ? 12 : 1;
      const step = unitMonths * roundingIncrement;
      let value = months;

      if (days > 0) {
        const lower = rhs.add(new Temporal.Duration(0, months, 0, 0, 0, 0, 0, 0, 0, 0), { overflow: 'constrain' });
        const upper = rhs.add(new Temporal.Duration(0, months + 1, 0, 0, 0, 0, 0, 0, 0, 0), { overflow: 'constrain' });
        const span = Temporal.PlainDate._epochDay(upper) - Temporal.PlainDate._epochDay(lower);
        if (span !== 0) value += days / span;
      } else if (days < 0) {
        const lower = rhs.add(new Temporal.Duration(0, months - 1, 0, 0, 0, 0, 0, 0, 0, 0), { overflow: 'constrain' });
        const upper = rhs.add(new Temporal.Duration(0, months, 0, 0, 0, 0, 0, 0, 0, 0), { overflow: 'constrain' });
        const span = Temporal.PlainDate._epochDay(upper) - Temporal.PlainDate._epochDay(lower);
        if (span !== 0) value += days / span;
      }

      return Temporal.Duration._roundToIncrement(value, step, roundingMode);
    }

    static _extractAnnotations(value) {
      if (typeof value !== 'string') throw new TypeError('Temporal string expected');

      let bare = '';
      let calendar = 'iso8601';
      let timeZone;
      let sawCalendar = false;
      let sawTimeZone = false;

      for (let i = 0; i < value.length; i++) {
        const ch = value.charCodeAt(i);
        if (ch !== 91) {
          bare += value[i];
          continue;
        }

        let end = i + 1;
        while (end < value.length && value.charCodeAt(end) !== 93) end++;
        if (end >= value.length) throw new RangeError('Invalid annotation');

        let tag = value.slice(i + 1, end);
        let critical = false;
        if (tag.length > 0 && tag.charCodeAt(0) === 33) {
          critical = true;
          tag = tag.slice(1);
        }

        const eq = tag.indexOf('=');
        if (eq >= 0) {
          const key = tag.slice(0, eq);
          const val = tag.slice(eq + 1);
          if (key === 'u-ca') {
            if (sawCalendar) throw new RangeError('Duplicate calendar annotation');
            calendar = Temporal.Duration._normalizeCalendarId(val, 'calendar');
            sawCalendar = true;
          }
          else if (critical) throw new RangeError('Unknown critical annotation');
        } else if (tag.length > 0) {
          if (sawTimeZone) throw new RangeError('Duplicate time zone annotation');
          timeZone = Temporal.Duration._normalizeTimeZoneId(tag, 'timeZone');
          sawTimeZone = true;
        } else if (critical) {
          throw new RangeError('Unknown critical annotation');
        }

        i = end;
      }

      return { bare, calendar, timeZone };
    }

    static _parseDatePart(dateText) {
      if (dateText.length < 8) throw new RangeError('Invalid ISO date string');

      let i = 0;
      let sign = 1;
      let hadSign = false;
      if (dateText.charCodeAt(i) === 43) {
        hadSign = true;
        i++;
      }
      else if (dateText.charCodeAt(i) === 45) {
        sign = -1;
        hadSign = true;
        i++;
      }

      let year = 0;
      let yearDigits = 0;
      while (i < dateText.length) {
        const d = Temporal.PlainDate._digit(dateText, i);
        if (d < 0) break;
        year = year * 10 + d;
        yearDigits++;
        i++;
      }

      if (yearDigits < 4) throw new RangeError('Invalid ISO date string');
      if (!hadSign && yearDigits !== 4) throw new RangeError('Invalid ISO date string');
      if (hadSign && yearDigits !== 6) throw new RangeError('Invalid ISO date string');
      year *= sign;

      if (i >= dateText.length || dateText.charCodeAt(i) !== 45) throw new RangeError('Invalid ISO date string');
      i++;

      if (i + 1 >= dateText.length) throw new RangeError('Invalid ISO date string');
      const month = Temporal.Duration._parseNDigits(dateText, i, 2);
      if (month < 0) throw new RangeError('Invalid ISO date string');
      i += 2;

      if (i >= dateText.length || dateText.charCodeAt(i) !== 45) throw new RangeError('Invalid ISO date string');
      i++;

      if (i + 1 >= dateText.length) throw new RangeError('Invalid ISO date string');
      const day = Temporal.Duration._parseNDigits(dateText, i, 2);
      if (day < 0) throw new RangeError('Invalid ISO date string');
      i += 2;

      if (i !== dateText.length) throw new RangeError('Invalid ISO date string');
      return { year, month, day };
    }

    static _fromParts(parts, options) {
      const opts = Temporal.Duration._toOptions(options);
      const overflow = Temporal.Duration._getStringOption(opts, 'overflow', 'constrain', [ 'constrain', 'reject' ]);

      let year = Temporal.Duration._toInteger(parts.year, 'year');
      let month = Temporal.Duration._toInteger(parts.month, 'month');
      let day = Temporal.Duration._toInteger(parts.day, 'day');

      if (overflow === 'constrain') {
        if (month < 1) month = 1;
        if (month > 12) month = 12;
        const dim = Temporal.PlainDate._daysInMonth(year, month);
        if (day < 1) day = 1;
        if (day > dim) day = dim;
      } else {
        Temporal.PlainDate._validate(year, month, day);
      }

      return new Temporal.PlainDate(year, month, day, Temporal.Duration._normalizeCalendarId(parts.calendar, 'calendar'));
    }

    static from(value, options) {
      const opts = Temporal.Duration._toOptions(options);
      if (typeof value === 'string') {
        const p = Temporal.PlainDateTime._parseISODateTimeString(value);
        const out = p.date;
        Temporal.PlainDate._validate(out.year, out.month, out.day);
        return new Temporal.PlainDate(out.year, out.month, out.day, p.calendar);
      }

      if (value && typeof value === 'object') {
        if (value._temporalBrand === 'Temporal.PlainDate') {
          return Temporal.PlainDate._fromParts({ year: value._year, month: value._month, day: value._day, calendar: value._calendar }, opts);
        }
        if (value._temporalBrand === 'Temporal.PlainDateTime') {
          return Temporal.PlainDate._fromParts({ year: value._year, month: value._month, day: value._day, calendar: value._calendar }, opts);
        }
        if (value._temporalBrand === 'Temporal.ZonedDateTime') {
          const pdt = Temporal.ZonedDateTime._instantToPlainDateTime(value._epochNanoseconds, value._timeZone, value._calendar);
          return Temporal.PlainDate._fromParts({ year: pdt._year, month: pdt._month, day: pdt._day, calendar: pdt._calendar }, opts);
        }

        const calendar = value.calendar;
        const dayValue = value.day;
        const day = dayValue === undefined ? undefined : Temporal.Duration._toInteger(dayValue, 'day');
        const monthValue = value.month;
        let month = monthValue === undefined ? undefined : Temporal.Duration._toInteger(monthValue, 'month');
        const monthCodeValue = value.monthCode;
        if (monthCodeValue !== undefined) {
          const monthCode = String(monthCodeValue);
          if (monthCode.length !== 3 || monthCode.charCodeAt(0) !== 77) throw new RangeError('Invalid monthCode');
          const parsedMonth = Temporal.Duration._parseNDigits(monthCode, 1, 2);
          if (parsedMonth < 1 || parsedMonth > 12) throw new RangeError('Invalid monthCode');
          if (month !== undefined && month !== parsedMonth) throw new RangeError('month and monthCode disagree');
          month = parsedMonth;
        }
        const yearValue = value.year;
        const year = yearValue === undefined ? undefined : Temporal.Duration._toInteger(yearValue, 'year');
        if (year !== undefined && day !== undefined && month !== undefined) {
          return Temporal.PlainDate._fromParts({ year, month, day, calendar }, opts);
        }
      }

      throw new TypeError('Cannot convert value to Temporal.PlainDate');
    }

    static compare(a, b) {
      const aa = Temporal.PlainDate.from(a);
      const bb = Temporal.PlainDate.from(b);
      if (aa._year !== bb._year) return aa._year < bb._year ? -1 : 1;
      if (aa._month !== bb._month) return aa._month < bb._month ? -1 : 1;
      if (aa._day !== bb._day) return aa._day < bb._day ? -1 : 1;
      return 0;
    }

    static _padUnsigned(value, size) {
      let out = String(Math.abs(value));
      while (out.length < size) out = '0' + out;
      return out;
    }

    static _isoWeek(date) {
      const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const day = tmp.getUTCDay();
      const isoDay = day === 0 ? 7 : day;
      tmp.setUTCDate(tmp.getUTCDate() + 4 - isoDay);
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      const diff = Math.floor((tmp - yearStart) / 86400000);
      const week = Math.floor(diff / 7) + 1;
      return { week, year: tmp.getUTCFullYear() };
    }

    get year() { return Temporal.PlainDate._requireThis(this, 'year')._year; }
    get month() { return Temporal.PlainDate._requireThis(this, 'month')._month; }
    get day() { return Temporal.PlainDate._requireThis(this, 'day')._day; }
    get calendarId() { return Temporal.PlainDate._requireThis(this, 'calendarId')._calendar; }
    get monthCode() { return 'M' + Temporal.Duration._pad(this.month, 2); }
    get dayOfWeek() {
      const d = new Date(Date.UTC(this.year, this.month - 1, this.day));
      const x = d.getUTCDay();
      return x === 0 ? 7 : x;
    }
    get dayOfYear() {
      const d = new Date(Date.UTC(this.year, this.month - 1, this.day));
      const s = new Date(Date.UTC(this.year, 0, 1));
      return Math.floor((d - s) / 86400000) + 1;
    }
    get weekOfYear() {
      const d = new Date(Date.UTC(this.year, this.month - 1, this.day));
      return Temporal.PlainDate._isoWeek(d).week;
    }
    get yearOfWeek() {
      const d = new Date(Date.UTC(this.year, this.month - 1, this.day));
      return Temporal.PlainDate._isoWeek(d).year;
    }
    get daysInWeek() { return 7; }
    get daysInMonth() { return Temporal.PlainDate._daysInMonth(this.year, this.month); }
    get daysInYear() { return Temporal.PlainDate._isLeapYear(this.year) ? 366 : 365; }
    get monthsInYear() { return 12; }
    get inLeapYear() { return Temporal.PlainDate._isLeapYear(this.year); }
    get era() { return this.year <= 0 ? 'bce' : 'ce'; }
    get eraYear() { return this.year <= 0 ? 1 - this.year : this.year; }

    with(item, options) {
      const d = Temporal.PlainDate._requireThis(this, 'with');
      if (!item || typeof item !== 'object') throw new TypeError('Temporal.PlainDate.with requires an object');
      return Temporal.PlainDate._fromParts(
        {
          year: item.year === undefined ? d._year : item.year,
          month: item.month === undefined ? d._month : item.month,
          day: item.day === undefined ? d._day : item.day,
          calendar: item.calendar === undefined ? d._calendar : item.calendar
        },
        options
      );
    }

    withCalendar(calendar) {
      Temporal.PlainDate._requireThis(this, 'withCalendar');
      return new Temporal.PlainDate(this._year, this._month, this._day, calendar);
    }

    add(durationLike, options) {
      Temporal.PlainDate._requireThis(this, 'add');
      const opts = Temporal.Duration._toOptions(options);
      const overflow = Temporal.Duration._getStringOption(opts, 'overflow', 'constrain', [ 'constrain', 'reject' ]);
      const d = Temporal.Duration.from(durationLike);

      let year = this._year + d.years;
      let month = this._month + d.months;
      while (month > 12) {
        month -= 12;
        year++;
      }
      while (month < 1) {
        month += 12;
        year--;
      }

      let day = this._day;
      if (overflow === 'constrain') {
        const dim = Temporal.PlainDate._daysInMonth(year, month);
        if (day > dim) day = dim;
      }

      const date = new Date(Date.UTC(year, month - 1, day));
      const dayDelta = d.weeks * 7 + d.days;
      if (dayDelta !== 0) date.setUTCDate(date.getUTCDate() + dayDelta);
      if (d.hours || d.minutes || d.seconds || d.milliseconds || d.microseconds || d.nanoseconds) {
        const ms = (((d.hours * 60 + d.minutes) * 60 + d.seconds) * 1000) + d.milliseconds + d.microseconds / 1000 + d.nanoseconds / 1000000;
        date.setTime(date.getTime() + ms);
      }

      return new Temporal.PlainDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), this._calendar);
    }

    subtract(durationLike, options) {
      Temporal.PlainDate._requireThis(this, 'subtract');
      return this.add(Temporal.Duration.from(durationLike).negated(), options);
    }

    since(other, options = undefined) {
      Temporal.PlainDate._requireThis(this, 'since');
      const rhs = Temporal.PlainDate.from(other);
      const opts = Temporal.Duration._toOptions(options);
      const settings = Temporal.Duration._differenceSettings(
        opts,
        'day',
        [ 'year', 'month', 'week', 'day' ],
        'day',
        [ 'auto', 'year', 'month', 'week', 'day' ],
        'trunc'
      );

      const dayDiff = Temporal.PlainDate._epochDay(this) - Temporal.PlainDate._epochDay(rhs);
      const largestUnit = settings.largestUnit;
      const smallestUnit = settings.smallestUnit;
      const roundingIncrement = settings.roundingIncrement;
      const roundingMode = settings.roundingMode;

      if (largestUnit === 'year' || largestUnit === 'month' || smallestUnit === 'year' || smallestUnit === 'month') {
        const base = Temporal.PlainDate._differenceMonthsDays(this, rhs);
        let months = base.months;
        let days = base.days;

        if (smallestUnit === 'year' || smallestUnit === 'month') {
          const monthsStep = (smallestUnit === 'year' ? 12 : 1) * roundingIncrement;
          rhs.add(new Temporal.Duration(0, monthsStep, 0, 0, 0, 0, 0, 0, 0, 0), { overflow: 'constrain' });
          rhs.add(new Temporal.Duration(0, -monthsStep, 0, 0, 0, 0, 0, 0, 0, 0), { overflow: 'constrain' });
          months = Temporal.PlainDate._roundedCalendarMonths(rhs, months, days, smallestUnit, roundingIncrement, roundingMode);
          days = 0;
        } else if (smallestUnit === 'week') {
          const roundedDays = Temporal.Duration._roundToIncrement(dayDiff / 7, roundingIncrement, roundingMode) * 7;
          const roundedDate = rhs.add(new Temporal.Duration(0, 0, 0, roundedDays, 0, 0, 0, 0, 0, 0), { overflow: 'constrain' });
          const rounded = Temporal.PlainDate._differenceMonthsDays(roundedDate, rhs);
          months = rounded.months;
          days = rounded.days;
        } else if (smallestUnit === 'day') {
          const roundedDays = Temporal.Duration._roundToIncrement(dayDiff, roundingIncrement, roundingMode);
          const roundedDate = rhs.add(new Temporal.Duration(0, 0, 0, roundedDays, 0, 0, 0, 0, 0, 0), { overflow: 'constrain' });
          const rounded = Temporal.PlainDate._differenceMonthsDays(roundedDate, rhs);
          months = rounded.months;
          days = rounded.days;
        }

        if (largestUnit === 'year') {
          const years = months < 0 ? Math.ceil(months / 12) : Math.floor(months / 12);
          months -= years * 12;
          return new Temporal.Duration(years, months, 0, days, 0, 0, 0, 0, 0, 0);
        }
        if (largestUnit === 'month') {
          return new Temporal.Duration(0, months, 0, days, 0, 0, 0, 0, 0, 0);
        }
      }

      const roundedDays = smallestUnit === 'week'
        ? Temporal.Duration._roundToIncrement(dayDiff / 7, roundingIncrement, roundingMode) * 7
        : Temporal.Duration._roundToIncrement(dayDiff, roundingIncrement, roundingMode);
      if (largestUnit === 'week') {
        const weeks = roundedDays < 0 ? Math.ceil(roundedDays / 7) : Math.floor(roundedDays / 7);
        return new Temporal.Duration(0, 0, weeks, roundedDays - weeks * 7, 0, 0, 0, 0, 0, 0);
      }
      return new Temporal.Duration(0, 0, 0, roundedDays, 0, 0, 0, 0, 0, 0);
    }

    until(other, options) {
      Temporal.PlainDate._requireThis(this, 'until');
      return Temporal.PlainDate.from(other).since(this, options);
    }

    equals(other) {
      Temporal.PlainDate._requireThis(this, 'equals');
      return Temporal.PlainDate.compare(this, other) === 0 && this._calendar === Temporal.PlainDate.from(other)._calendar;
    }

    toPlainDateTime(item) {
      Temporal.PlainDate._requireThis(this, 'toPlainDateTime');
      const t = item === undefined ? new Temporal.PlainTime(0, 0, 0, 0, 0, 0) : Temporal.PlainTime.from(item);
      return new Temporal.PlainDateTime(this._year, this._month, this._day, t.hour, t.minute, t.second, t.millisecond, t.microsecond, t.nanosecond, this._calendar);
    }

    toZonedDateTime(item) {
      Temporal.PlainDate._requireThis(this, 'toZonedDateTime');
      if (!item || typeof item !== 'object') throw new TypeError('Temporal.PlainDate.toZonedDateTime requires an object');
      const pdt = this.toPlainDateTime(item.plainTime);
      return pdt.toZonedDateTime(item.timeZone);
    }

    toString(options) {
      Temporal.PlainDate._requireThis(this, 'toString');
      const opts = Temporal.Duration._toOptions(options);
      const calendarName = Temporal.Duration._getStringOption(opts, 'calendarName', 'auto', [ 'auto', 'always', 'never', 'critical' ]);

      const y = Temporal.Duration._formatIsoYear(this._year);
      const m = Temporal.Duration._pad(this._month, 2);
      const d = Temporal.Duration._pad(this._day, 2);
      let out = y + '-' + m + '-' + d;
      if (calendarName === 'always') {
        out += '[u-ca=' + this._calendar + ']';
      } else if (calendarName === 'critical') {
        out += '[!u-ca=' + this._calendar + ']';
      } else if (calendarName === 'auto' && this._calendar !== 'iso8601') {
        out += '[u-ca=' + this._calendar + ']';
      }
      return out;
    }

    toJSON() {
      Temporal.PlainDate._requireThis(this, 'toJSON');
      return this.toString();
    }

    toLocaleString() {
      Temporal.PlainDate._requireThis(this, 'toLocaleString');
      return this.toString();
    }

    valueOf() {
      Temporal.PlainDate._requireThis(this, 'valueOf');
      throw new TypeError('Do not use valueOf on Temporal.PlainDate');
    }
  },

  PlainTime: class PlainTime {
    constructor(hour, minute, second, millisecond, microsecond, nanosecond) {
      Object.defineProperty(this, '_temporalBrand', { value: 'Temporal.PlainTime', writable: false, enumerable: false, configurable: false });
      this._hour = Temporal.Duration._toInteger(hour === undefined ? 0 : hour, 'hour');
      this._minute = Temporal.Duration._toInteger(minute === undefined ? 0 : minute, 'minute');
      this._second = Temporal.Duration._toInteger(second === undefined ? 0 : second, 'second');
      this._millisecond = Temporal.Duration._toInteger(millisecond === undefined ? 0 : millisecond, 'millisecond');
      this._microsecond = Temporal.Duration._toInteger(microsecond === undefined ? 0 : microsecond, 'microsecond');
      this._nanosecond = Temporal.Duration._toInteger(nanosecond === undefined ? 0 : nanosecond, 'nanosecond');
      Temporal.PlainTime._validate(this._hour, this._minute, this._second, this._millisecond, this._microsecond, this._nanosecond);
    }

    static _requireThis(value, label) {
      if (!value || typeof value !== 'object' || value._temporalBrand !== 'Temporal.PlainTime') {
        throw new TypeError('Temporal.PlainTime.prototype.' + label + ' called on incompatible receiver');
      }

      return value;
    }

    static _validate(hour, minute, second, millisecond, microsecond, nanosecond) {
      if (hour < 0 || hour > 23) throw new RangeError('Invalid hour');
      if (minute < 0 || minute > 59) throw new RangeError('Invalid minute');
      if (second < 0 || second > 59) throw new RangeError('Invalid second');
      if (millisecond < 0 || millisecond > 999) throw new RangeError('Invalid millisecond');
      if (microsecond < 0 || microsecond > 999) throw new RangeError('Invalid microsecond');
      if (nanosecond < 0 || nanosecond > 999) throw new RangeError('Invalid nanosecond');
    }

    static _parseTimePart(text) {
      if (text.length < 5) throw new RangeError('Invalid ISO time string');
      if (text.charCodeAt(2) !== 58) throw new RangeError('Invalid ISO time string');

      const hour = Temporal.Duration._parseNDigits(text, 0, 2);
      const minute = Temporal.Duration._parseNDigits(text, 3, 2);
      if (hour < 0 || minute < 0) throw new RangeError('Invalid ISO time string');

      let second = 0;
      let millisecond = 0;
      let microsecond = 0;
      let nanosecond = 0;
      let leapSecond = false;

      let i = 5;
      if (i < text.length) {
        if (text.charCodeAt(i) !== 58) throw new RangeError('Invalid ISO time string');
        i++;
        if (i + 1 >= text.length) throw new RangeError('Invalid ISO time string');

        second = Temporal.Duration._parseNDigits(text, i, 2);
        if (second < 0) throw new RangeError('Invalid ISO time string');
        if (second === 60) {
          leapSecond = true;
          second = 59;
        }
        i += 2;

        if (i < text.length) {
          if (text.charCodeAt(i) !== 46) throw new RangeError('Invalid ISO time string');
          i++;

          let frac = 0;
          let fracDigits = 0;
          while (i < text.length) {
            const d = Temporal.Duration._digit(text, i);
            if (d < 0) throw new RangeError('Invalid ISO time string');
            if (fracDigits < 9) frac = frac * 10 + d;
            fracDigits++;
            i++;
          }

          if (fracDigits === 0) throw new RangeError('Invalid ISO time string');
          while (fracDigits < 9) {
            frac *= 10;
            fracDigits++;
          }

          millisecond = Math.trunc(frac / 1000000);
          frac -= millisecond * 1000000;
          microsecond = Math.trunc(frac / 1000);
          frac -= microsecond * 1000;
          nanosecond = frac;
        }
      }

      Temporal.PlainTime._validate(hour, minute, second, millisecond, microsecond, nanosecond);
      return { hour, minute, second, millisecond, microsecond, nanosecond, leapSecond };
    }

    static from(value) {
      if (typeof value === 'string') {
        const raw = Temporal.PlainDate._extractAnnotations(value);
        let txt = raw.bare;
        let sep = txt.indexOf('T');
        if (sep < 0) sep = txt.indexOf('t');
        if (sep < 0) sep = txt.indexOf(' ');
        if (sep >= 0) txt = txt.slice(sep + 1);
        if (txt.length > 0 && (txt.charCodeAt(0) === 84 || txt.charCodeAt(0) === 116)) txt = txt.slice(1);

        let offsetIndex = -1;
        for (let i = 1; i < txt.length; i++) {
          const ch = txt.charCodeAt(i);
          if (ch === 43 || ch === 45) {
            offsetIndex = i;
            break;
          }
          if (ch === 90 || ch === 122) {
            offsetIndex = i;
            break;
          }
        }
        if (offsetIndex >= 0) txt = txt.slice(0, offsetIndex);
        const parsed = Temporal.PlainTime._parseTimePart(txt);
        return new Temporal.PlainTime(parsed.hour, parsed.minute, parsed.second, parsed.millisecond, parsed.microsecond, parsed.nanosecond);
      }

      if (value && typeof value === 'object') {
        if (value._temporalBrand === 'Temporal.PlainTime') {
          return new Temporal.PlainTime(value._hour, value._minute, value._second, value._millisecond, value._microsecond, value._nanosecond);
        }

        if (value.hour !== undefined) {
          return new Temporal.PlainTime(value.hour, value.minute, value.second, value.millisecond, value.microsecond, value.nanosecond);
        }
      }

      throw new TypeError('Cannot convert value to Temporal.PlainTime');
    }

    static compare(a, b) {
      const aa = Temporal.PlainTime.from(a);
      const bb = Temporal.PlainTime.from(b);
      if (aa._hour !== bb._hour) return aa._hour < bb._hour ? -1 : 1;
      if (aa._minute !== bb._minute) return aa._minute < bb._minute ? -1 : 1;
      if (aa._second !== bb._second) return aa._second < bb._second ? -1 : 1;
      if (aa._millisecond !== bb._millisecond) return aa._millisecond < bb._millisecond ? -1 : 1;
      if (aa._microsecond !== bb._microsecond) return aa._microsecond < bb._microsecond ? -1 : 1;
      if (aa._nanosecond !== bb._nanosecond) return aa._nanosecond < bb._nanosecond ? -1 : 1;
      return 0;
    }

    static _toNanoseconds(p) {
      return (((((p._hour * 60 + p._minute) * 60 + p._second) * 1000 + p._millisecond) * 1000 + p._microsecond) * 1000 + p._nanosecond);
    }

    static _fromNanoseconds(total) {
      let t = total % 86400000000000;
      if (t < 0) t += 86400000000000;

      const hour = Math.trunc(t / 3600000000000);
      t -= hour * 3600000000000;
      const minute = Math.trunc(t / 60000000000);
      t -= minute * 60000000000;
      const second = Math.trunc(t / 1000000000);
      t -= second * 1000000000;
      const millisecond = Math.trunc(t / 1000000);
      t -= millisecond * 1000000;
      const microsecond = Math.trunc(t / 1000);
      t -= microsecond * 1000;
      const nanosecond = t;

      return new Temporal.PlainTime(hour, minute, second, millisecond, microsecond, nanosecond);
    }

    get hour() { return Temporal.PlainTime._requireThis(this, 'hour')._hour; }
    get minute() { return Temporal.PlainTime._requireThis(this, 'minute')._minute; }
    get second() { return Temporal.PlainTime._requireThis(this, 'second')._second; }
    get millisecond() { return Temporal.PlainTime._requireThis(this, 'millisecond')._millisecond; }
    get microsecond() { return Temporal.PlainTime._requireThis(this, 'microsecond')._microsecond; }
    get nanosecond() { return Temporal.PlainTime._requireThis(this, 'nanosecond')._nanosecond; }

    with(item) {
      const p = Temporal.PlainTime._requireThis(this, 'with');
      if (!item || typeof item !== 'object') throw new TypeError('Temporal.PlainTime.with requires an object');
      return new Temporal.PlainTime(
        item.hour === undefined ? p._hour : item.hour,
        item.minute === undefined ? p._minute : item.minute,
        item.second === undefined ? p._second : item.second,
        item.millisecond === undefined ? p._millisecond : item.millisecond,
        item.microsecond === undefined ? p._microsecond : item.microsecond,
        item.nanosecond === undefined ? p._nanosecond : item.nanosecond
      );
    }

    add(durationLike) {
      Temporal.PlainTime._requireThis(this, 'add');
      const d = Temporal.Duration.from(durationLike);
      if (d.years || d.months || d.weeks || d.days) throw new RangeError('Temporal.PlainTime.add does not support calendar units');
      const delta = Temporal.Duration._totalNanoseconds(d);
      return Temporal.PlainTime._fromNanoseconds(Temporal.PlainTime._toNanoseconds(this) + delta);
    }

    subtract(durationLike) {
      Temporal.PlainTime._requireThis(this, 'subtract');
      return this.add(Temporal.Duration.from(durationLike).negated());
    }

    since(other, options = undefined) {
      Temporal.PlainTime._requireThis(this, 'since');
      const rhs = Temporal.PlainTime.from(other);
      const opts = Temporal.Duration._toOptions(options);
      const settings = Temporal.Duration._differenceSettings(
        opts,
        'nanosecond',
        [ 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ],
        'hour',
        [ 'auto', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ],
        'trunc'
      );
      Temporal.Duration._validateTimeRoundingIncrement(settings.smallestUnit, settings.roundingIncrement);
      const delta = Temporal.PlainTime._toNanoseconds(this) - Temporal.PlainTime._toNanoseconds(rhs);
      const rounded = Temporal.Duration._roundNanoseconds(delta, settings.smallestUnit, settings.roundingIncrement, settings.roundingMode);
      return Temporal.Duration._balanceNanoseconds(rounded, settings.largestUnit);
    }

    until(other, options) {
      Temporal.PlainTime._requireThis(this, 'until');
      return Temporal.PlainTime.from(other).since(this, options);
    }

    round(options) {
      Temporal.PlainTime._requireThis(this, 'round');
      if (options === undefined) throw new TypeError('options is required');
      const opts = typeof options === 'string' ? { smallestUnit: options } : Temporal.Duration._toOptions(options);
      if (opts.smallestUnit === undefined) throw new RangeError('smallestUnit is required');
      const smallestUnit = Temporal.Duration._getUnitOption(opts, 'smallestUnit', undefined, [ 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ]);
      const increment = Temporal.Duration._getNumberOption(opts, 'roundingIncrement', 1);
      const mode = Temporal.Duration._normalizeRoundingMode(opts.roundingMode, 'halfExpand');
      if (increment <= 0) throw new RangeError('roundingIncrement must be positive');

      const ns = Temporal.PlainTime._toNanoseconds(this);
      return Temporal.PlainTime._fromNanoseconds(Temporal.Duration._roundNanoseconds(ns, smallestUnit, increment, mode));
    }

    toPlainDateTime(item) {
      Temporal.PlainTime._requireThis(this, 'toPlainDateTime');
      const date = Temporal.PlainDate.from(item);
      return new Temporal.PlainDateTime(date.year, date.month, date.day, this._hour, this._minute, this._second, this._millisecond, this._microsecond, this._nanosecond, date.calendarId);
    }

    equals(other) {
      Temporal.PlainTime._requireThis(this, 'equals');
      return Temporal.PlainTime.compare(this, other) === 0;
    }

    toString(options) {
      Temporal.PlainTime._requireThis(this, 'toString');
      const opts = Temporal.Duration._toOptions(options);
      let smallestUnit = Temporal.Duration._getUnitOption(opts, 'smallestUnit', 'nanosecond', [ 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ]);
      let fractionalSecondDigits = opts.fractionalSecondDigits;
      const roundingIncrement = Temporal.Duration._getNumberOption(opts, 'roundingIncrement', 1);
      const roundingMode = Temporal.Duration._normalizeRoundingMode(opts.roundingMode, 'trunc');
      const rounded = this.round({ smallestUnit, roundingIncrement, roundingMode });

      let frac = rounded._millisecond * 1000000 + rounded._microsecond * 1000 + rounded._nanosecond;
      let fracText = Temporal.Duration._pad(frac, 9);

      if (fractionalSecondDigits !== undefined) {
        const fd = Temporal.Duration._toInteger(fractionalSecondDigits, 'fractionalSecondDigits');
        if (fd < 0 || fd > 9) throw new RangeError('fractionalSecondDigits out of range');
        fracText = fracText.slice(0, fd);
        while (fracText.length < fd) fracText += '0';
      } else {
        if (smallestUnit === 'hour' || smallestUnit === 'minute') fracText = '';
        else if (smallestUnit === 'second') fracText = '';
        else if (smallestUnit === 'millisecond') fracText = fracText.slice(0, 3);
        else if (smallestUnit === 'microsecond') fracText = fracText.slice(0, 6);
        else {
          while (fracText.length > 0 && fracText.charCodeAt(fracText.length - 1) === 48) fracText = fracText.slice(0, -1);
        }
      }

      const hh = Temporal.Duration._pad(rounded._hour, 2);
      const mm = Temporal.Duration._pad(rounded._minute, 2);
      const ss = Temporal.Duration._pad(rounded._second, 2);
      if (smallestUnit === 'hour') return hh;
      if (smallestUnit === 'minute') return hh + ':' + mm;
      if (fracText.length === 0) return hh + ':' + mm + ':' + ss;
      return hh + ':' + mm + ':' + ss + '.' + fracText;
    }

    toJSON() {
      Temporal.PlainTime._requireThis(this, 'toJSON');
      return this.toString();
    }

    toLocaleString() {
      Temporal.PlainTime._requireThis(this, 'toLocaleString');
      return this.toString();
    }

    valueOf() {
      Temporal.PlainTime._requireThis(this, 'valueOf');
      throw new TypeError('Do not use valueOf on Temporal.PlainTime');
    }
  },

  PlainDateTime: class PlainDateTime {
    constructor(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond, calendar = undefined) {
      Object.defineProperty(this, '_temporalBrand', { value: 'Temporal.PlainDateTime', writable: false, enumerable: false, configurable: false });
      this._year = Temporal.Duration._toInteger(year, 'year');
      this._month = Temporal.Duration._toInteger(month, 'month');
      this._day = Temporal.Duration._toInteger(day, 'day');
      this._hour = Temporal.Duration._toInteger(hour === undefined ? 0 : hour, 'hour');
      this._minute = Temporal.Duration._toInteger(minute === undefined ? 0 : minute, 'minute');
      this._second = Temporal.Duration._toInteger(second === undefined ? 0 : second, 'second');
      this._millisecond = Temporal.Duration._toInteger(millisecond === undefined ? 0 : millisecond, 'millisecond');
      this._microsecond = Temporal.Duration._toInteger(microsecond === undefined ? 0 : microsecond, 'microsecond');
      this._nanosecond = Temporal.Duration._toInteger(nanosecond === undefined ? 0 : nanosecond, 'nanosecond');
      this._calendar = Temporal.Duration._normalizeCalendarId(calendar, 'calendar');

      Temporal.PlainDate._validate(this._year, this._month, this._day);
      Temporal.PlainTime._validate(this._hour, this._minute, this._second, this._millisecond, this._microsecond, this._nanosecond);
      Temporal.Duration._checkIsoDateRange(this._year, this._month, this._day);
    }

    static _requireThis(value, label) {
      if (!value || typeof value !== 'object' || value._temporalBrand !== 'Temporal.PlainDateTime') {
        throw new TypeError('Temporal.PlainDateTime.prototype.' + label + ' called on incompatible receiver');
      }

      return value;
    }

    static _offsetNanoseconds(offsetText) {
      if (offsetText == null || offsetText.length === 0) return null;
      return Temporal.Duration._offsetNanoseconds(offsetText, 'offset');
    }

    static _timeZoneOffsetNanoseconds(timeZone) {
      return Temporal.Duration._timeZoneOffsetNanoseconds(timeZone);
    }

    static _parseISODateTimeString(value) {
      const ann = Temporal.PlainDate._extractAnnotations(value);
      let bare = ann.bare;

      let sep = bare.indexOf('T');
      if (sep < 0) sep = bare.indexOf('t');
      if (sep < 0) sep = bare.indexOf(' ');

      let dateText = bare;
      let timeText = '';
      if (sep >= 0) {
        dateText = bare.slice(0, sep);
        timeText = bare.slice(sep + 1);
        if (timeText.length === 0) throw new RangeError('Invalid ISO date-time string');
      }

      const date = Temporal.PlainDate._parseDatePart(dateText);

      if (timeText.length === 0) {
        return {
          date,
          time: null,
          offsetNanoseconds: null,
          timeZone: ann.timeZone,
          calendar: ann.calendar,
          leapSecond: false
        };
      }

      let offsetNanoseconds = null;
      let offsetIndex = -1;
      let seenOffsetSign = false;
      for (let i = 0; i < timeText.length; i++) {
        const ch = timeText.charCodeAt(i);
        if (i > 0 && (ch === 43 || ch === 45)) {
          if (seenOffsetSign) throw new RangeError('Invalid ISO date-time string');
          offsetIndex = i;
          seenOffsetSign = true;
          break;
        }
      }

      let timePart = timeText;
      if (timeText.length > 0) {
        for (let i = 0; i < timeText.length; i++) {
          const ch = timeText.charCodeAt(i);
          if (ch === 90 || ch === 122) {
            if (i !== timeText.length - 1) throw new RangeError('Invalid ISO date-time string');
            offsetIndex = i;
            break;
          }
        }
      }

      if (offsetIndex >= 0) {
        if (offsetIndex === timeText.length - 1) {
          offsetNanoseconds = 0;
          timePart = timeText.slice(0, -1);
        } else {
          const offsetText = timeText.slice(offsetIndex);
          offsetNanoseconds = Temporal.PlainDateTime._offsetNanoseconds(offsetText);
          timePart = timeText.slice(0, offsetIndex);
        }
      }

      const time = Temporal.PlainTime._parseTimePart(timePart);

      return {
        date,
        time,
        offsetNanoseconds,
        timeZone: ann.timeZone,
        calendar: ann.calendar,
        leapSecond: time.leapSecond === true
      };
    }

    static _partsToEpochNanoseconds(parts, preferOffset) {
      const d = parts.date;
      const t = parts.time;

      const ms = Date.UTC(d.year, d.month - 1, d.day, t.hour, t.minute, t.second, t.millisecond);
      let ns = ms * 1000000 + t.microsecond * 1000 + t.nanosecond;

      let offset = 0;
      if (parts.offsetNanoseconds != null && preferOffset !== false) {
        offset = parts.offsetNanoseconds;
      } else if (parts.timeZone !== undefined) {
        offset = Temporal.PlainDateTime._timeZoneOffsetNanoseconds(parts.timeZone);
      }

      ns -= offset;
      if (parts.leapSecond) ns += 1000000000;
      return ns;
    }

    static from(value, options) {
      const opts = Temporal.Duration._toOptions(options);
      const overflow = Temporal.Duration._getStringOption(opts, 'overflow', 'constrain', [ 'constrain', 'reject' ]);

      if (typeof value === 'string') {
        const parts = Temporal.PlainDateTime._parseISODateTimeString(value);
        if (parts.time == null) {
          return new Temporal.PlainDateTime(parts.date.year, parts.date.month, parts.date.day, 0, 0, 0, 0, 0, 0, parts.calendar);
        }

        if (overflow === 'reject') {
          Temporal.PlainDate._validate(parts.date.year, parts.date.month, parts.date.day);
        }

        return new Temporal.PlainDateTime(
          parts.date.year,
          parts.date.month,
          parts.date.day,
          parts.time.hour,
          parts.time.minute,
          parts.time.second,
          parts.time.millisecond,
          parts.time.microsecond,
          parts.time.nanosecond,
          parts.calendar
        );
      }

      if (value && typeof value === 'object') {
        if (value._temporalBrand === 'Temporal.PlainDateTime') {
          return new Temporal.PlainDateTime(value._year, value._month, value._day, value._hour, value._minute, value._second, value._millisecond, value._microsecond, value._nanosecond, value._calendar);
        }

        if (value.year !== undefined && value.month !== undefined && value.day !== undefined) {
          return new Temporal.PlainDateTime(
            value.year,
            value.month,
            value.day,
            value.hour,
            value.minute,
            value.second,
            value.millisecond,
            value.microsecond,
            value.nanosecond,
            value.calendar
          );
        }
      }

      throw new TypeError('Cannot convert value to Temporal.PlainDateTime');
    }

    static compare(a, b) {
      const aa = Temporal.PlainDateTime.from(a);
      const bb = Temporal.PlainDateTime.from(b);
      if (aa._year !== bb._year) return aa._year < bb._year ? -1 : 1;
      if (aa._month !== bb._month) return aa._month < bb._month ? -1 : 1;
      if (aa._day !== bb._day) return aa._day < bb._day ? -1 : 1;
      if (aa._hour !== bb._hour) return aa._hour < bb._hour ? -1 : 1;
      if (aa._minute !== bb._minute) return aa._minute < bb._minute ? -1 : 1;
      if (aa._second !== bb._second) return aa._second < bb._second ? -1 : 1;
      if (aa._millisecond !== bb._millisecond) return aa._millisecond < bb._millisecond ? -1 : 1;
      if (aa._microsecond !== bb._microsecond) return aa._microsecond < bb._microsecond ? -1 : 1;
      if (aa._nanosecond !== bb._nanosecond) return aa._nanosecond < bb._nanosecond ? -1 : 1;
      return 0;
    }

    static _toEpochNanoseconds(dt, timeZone) {
      const ms = Date.UTC(dt._year, dt._month - 1, dt._day, dt._hour, dt._minute, dt._second, dt._millisecond);
      const frac = dt._microsecond * 1000 + dt._nanosecond;
      const offset = Temporal.PlainDateTime._timeZoneOffsetNanoseconds(timeZone);
      return ms * 1000000 + frac - offset;
    }

    get year() { return Temporal.PlainDateTime._requireThis(this, 'year')._year; }
    get month() { return Temporal.PlainDateTime._requireThis(this, 'month')._month; }
    get day() { return Temporal.PlainDateTime._requireThis(this, 'day')._day; }
    get hour() { return Temporal.PlainDateTime._requireThis(this, 'hour')._hour; }
    get minute() { return Temporal.PlainDateTime._requireThis(this, 'minute')._minute; }
    get second() { return Temporal.PlainDateTime._requireThis(this, 'second')._second; }
    get millisecond() { return Temporal.PlainDateTime._requireThis(this, 'millisecond')._millisecond; }
    get microsecond() { return Temporal.PlainDateTime._requireThis(this, 'microsecond')._microsecond; }
    get nanosecond() { return Temporal.PlainDateTime._requireThis(this, 'nanosecond')._nanosecond; }
    get calendarId() { return Temporal.PlainDateTime._requireThis(this, 'calendarId')._calendar; }
    get monthCode() { return 'M' + Temporal.Duration._pad(this.month, 2); }
    get dayOfWeek() { return this.toPlainDate().dayOfWeek; }
    get dayOfYear() { return this.toPlainDate().dayOfYear; }
    get weekOfYear() { return this.toPlainDate().weekOfYear; }
    get yearOfWeek() { return this.toPlainDate().yearOfWeek; }
    get daysInWeek() { return 7; }
    get daysInMonth() { return this.toPlainDate().daysInMonth; }
    get daysInYear() { return this.toPlainDate().daysInYear; }
    get monthsInYear() { return 12; }
    get inLeapYear() { return this.toPlainDate().inLeapYear; }

    with(item, options) {
      const d = Temporal.PlainDateTime._requireThis(this, 'with');
      if (!item || typeof item !== 'object') throw new TypeError('Temporal.PlainDateTime.with requires an object');
      const opts = Temporal.Duration._toOptions(options);
      Temporal.Duration._getStringOption(opts, 'overflow', 'constrain', [ 'constrain', 'reject' ]);

      return new Temporal.PlainDateTime(
        item.year === undefined ? d._year : item.year,
        item.month === undefined ? d._month : item.month,
        item.day === undefined ? d._day : item.day,
        item.hour === undefined ? d._hour : item.hour,
        item.minute === undefined ? d._minute : item.minute,
        item.second === undefined ? d._second : item.second,
        item.millisecond === undefined ? d._millisecond : item.millisecond,
        item.microsecond === undefined ? d._microsecond : item.microsecond,
        item.nanosecond === undefined ? d._nanosecond : item.nanosecond,
        item.calendar === undefined ? d._calendar : item.calendar
      );
    }

    withCalendar(calendar) {
      Temporal.PlainDateTime._requireThis(this, 'withCalendar');
      return new Temporal.PlainDateTime(this._year, this._month, this._day, this._hour, this._minute, this._second, this._millisecond, this._microsecond, this._nanosecond, calendar);
    }

    add(durationLike, options) {
      Temporal.PlainDateTime._requireThis(this, 'add');
      const opts = Temporal.Duration._toOptions(options);
      const overflow = Temporal.Duration._getStringOption(opts, 'overflow', 'constrain', [ 'constrain', 'reject' ]);
      const d = Temporal.Duration.from(durationLike);

      let year = this._year + d.years;
      let month = this._month + d.months;
      while (month > 12) {
        month -= 12;
        year++;
      }
      while (month < 1) {
        month += 12;
        year--;
      }

      let day = this._day;
      if (overflow === 'constrain') {
        const dim = Temporal.PlainDate._daysInMonth(year, month);
        if (day > dim) day = dim;
      }

      const ms = Date.UTC(year, month - 1, day, this._hour, this._minute, this._second, this._millisecond);
      let ns = ms * 1000000 + this._microsecond * 1000 + this._nanosecond;
      const dayAndTime = new Temporal.Duration(0, 0, d.weeks, d.days, d.hours, d.minutes, d.seconds, d.milliseconds, d.microseconds, d.nanoseconds);
      ns += Temporal.Duration._totalNanoseconds(dayAndTime);

      return Temporal.ZonedDateTime._instantToPlainDateTime(ns, 'UTC', this._calendar);
    }

    subtract(durationLike, options) {
      Temporal.PlainDateTime._requireThis(this, 'subtract');
      return this.add(Temporal.Duration.from(durationLike).negated(), options);
    }

    since(other, options = undefined) {
      Temporal.PlainDateTime._requireThis(this, 'since');
      const rhs = Temporal.PlainDateTime.from(other);
      const opts = Temporal.Duration._toOptions(options);
      const settings = Temporal.Duration._differenceSettings(
        opts,
        'nanosecond',
        [ 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ],
        'day',
        [ 'auto', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ],
        'trunc'
      );
      Temporal.Duration._validateTimeRoundingIncrement(settings.smallestUnit, settings.roundingIncrement);
      const dayDiff = Temporal.PlainDate._epochDay(this) - Temporal.PlainDate._epochDay(rhs);
      const timeDiff = Temporal.PlainTime._toNanoseconds(this) - Temporal.PlainTime._toNanoseconds(rhs);
      if (
        settings.largestUnit === 'microsecond' &&
        settings.smallestUnit === 'nanosecond' &&
        settings.roundingIncrement === 1 &&
        settings.roundingMode === 'trunc'
      ) {
        const dayMicroseconds = dayDiff * 86400 * 1000000;
        const timeMicroseconds = Math.trunc(timeDiff / 1000);
        const nanoseconds = timeDiff - timeMicroseconds * 1000;
        return new Temporal.Duration(0, 0, 0, 0, 0, 0, 0, 0, dayMicroseconds + timeMicroseconds, nanoseconds);
      }
      const total = dayDiff * Temporal.Duration._unitNanoseconds('day') + timeDiff;
      const rounded = Temporal.Duration._roundNanoseconds(total, settings.smallestUnit, settings.roundingIncrement, settings.roundingMode);
      return Temporal.Duration._balanceNanoseconds(rounded, settings.largestUnit);
    }

    until(other, options) {
      Temporal.PlainDateTime._requireThis(this, 'until');
      return Temporal.PlainDateTime.from(other).since(this, options);
    }

    round(options) {
      Temporal.PlainDateTime._requireThis(this, 'round');
      if (options === undefined) throw new TypeError('options is required');
      const opts = typeof options === 'string' ? { smallestUnit: options } : Temporal.Duration._toOptions(options);
      if (opts.smallestUnit === undefined) throw new RangeError('smallestUnit is required');
      const smallestUnit = Temporal.Duration._getUnitOption(opts, 'smallestUnit', undefined, [ 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ]);
      const increment = Temporal.Duration._getNumberOption(opts, 'roundingIncrement', 1);
      const mode = Temporal.Duration._normalizeRoundingMode(opts.roundingMode, 'halfExpand');
      if (increment <= 0) throw new RangeError('roundingIncrement must be positive');

      const ns = Temporal.PlainDateTime._toEpochNanoseconds(this, 'UTC');
      return Temporal.ZonedDateTime._instantToPlainDateTime(Temporal.Duration._roundNanoseconds(ns, smallestUnit, increment, mode), 'UTC', this._calendar);
    }

    equals(other) {
      Temporal.PlainDateTime._requireThis(this, 'equals');
      return Temporal.PlainDateTime.compare(this, other) === 0 && this._calendar === Temporal.PlainDateTime.from(other)._calendar;
    }

    toPlainDate() {
      Temporal.PlainDateTime._requireThis(this, 'toPlainDate');
      return new Temporal.PlainDate(this._year, this._month, this._day, this._calendar);
    }

    toPlainTime() {
      Temporal.PlainDateTime._requireThis(this, 'toPlainTime');
      return new Temporal.PlainTime(this._hour, this._minute, this._second, this._millisecond, this._microsecond, this._nanosecond);
    }

    toZonedDateTime(timeZone) {
      Temporal.PlainDateTime._requireThis(this, 'toZonedDateTime');
      return new Temporal.ZonedDateTime(Temporal.PlainDateTime._toEpochNanoseconds(this, timeZone), timeZone === undefined ? 'UTC' : timeZone, this._calendar);
    }

    toInstant(timeZone) {
      Temporal.PlainDateTime._requireThis(this, 'toInstant');
      return new Temporal.Instant(Temporal.PlainDateTime._toEpochNanoseconds(this, timeZone === undefined ? 'UTC' : timeZone));
    }

    toString(options) {
      Temporal.PlainDateTime._requireThis(this, 'toString');
      const opts = Temporal.Duration._toOptions(options);
      const date = this.toPlainDate().toString({ calendarName: 'never' });
      const time = this.toPlainTime().toString(opts);
      const calendarName = Temporal.Duration._getStringOption(opts, 'calendarName', 'auto', [ 'auto', 'always', 'never', 'critical' ]);

      let out = date + 'T' + time;
      if (calendarName === 'always') {
        out += '[u-ca=' + this._calendar + ']';
      } else if (calendarName === 'critical') {
        out += '[!u-ca=' + this._calendar + ']';
      } else if (calendarName === 'auto' && this._calendar !== 'iso8601') {
        out += '[u-ca=' + this._calendar + ']';
      }
      return out;
    }

    toJSON() {
      Temporal.PlainDateTime._requireThis(this, 'toJSON');
      return this.toString();
    }

    toLocaleString() {
      Temporal.PlainDateTime._requireThis(this, 'toLocaleString');
      return this.toString();
    }

    valueOf() {
      Temporal.PlainDateTime._requireThis(this, 'valueOf');
      throw new TypeError('Do not use valueOf on Temporal.PlainDateTime');
    }
  },

  PlainYearMonth: class PlainYearMonth {
    constructor(year, month, calendar = undefined, referenceISODay = undefined) {
      Object.defineProperty(this, '_temporalBrand', { value: 'Temporal.PlainYearMonth', writable: false, enumerable: false, configurable: false });
      this._year = year === undefined ? 0 : Temporal.Duration._toInteger(year, 'year');
      this._month = month === undefined ? 1 : Temporal.Duration._toInteger(month, 'month');
      this._calendar = Temporal.Duration._normalizeCalendarId(calendar, 'calendar');
      this._referenceISODay = referenceISODay === undefined ? 1 : Temporal.Duration._toInteger(referenceISODay, 'referenceISODay');
      if (this._month < 1 || this._month > 12) throw new RangeError('Invalid month');
      if (this._referenceISODay < 1 || this._referenceISODay > 31) throw new RangeError('Invalid referenceISODay');
      let dim = 31;
      if (this._month === 4 || this._month === 6 || this._month === 9 || this._month === 11) dim = 30;
      else if (this._month === 2) {
        dim = (this._year % 400 === 0 || (this._year % 4 === 0 && this._year % 100 !== 0)) ? 29 : 28;
      }
      let refDay = this._referenceISODay;
      if (refDay > dim) refDay = dim;
      Temporal.Duration._checkIsoDateRange(this._year, this._month, refDay);
    }

    static _requireThis(value, label) {
      if (!value || typeof value !== 'object' || value._temporalBrand !== 'Temporal.PlainYearMonth') {
        throw new TypeError('Temporal.PlainYearMonth.prototype.' + label + ' called on incompatible receiver');
      }

      return value;
    }

    static from(value, options) {
      const opts = Temporal.Duration._toOptions(options);
      Temporal.Duration._getStringOption(opts, 'overflow', 'constrain', [ 'constrain', 'reject' ]);

      if (typeof value === 'string') {
        const sepT = value.indexOf('T');
        const sepTLower = value.indexOf('t');
        const sepSpace = value.indexOf(' ');
        let hasDateTimeSeparator = sepT >= 0;
        if (sepTLower >= 0 && (sepT < 0 || sepTLower < sepT)) hasDateTimeSeparator = true;
        if (sepSpace >= 0 && (sepT < 0 || sepSpace < sepT) && (sepTLower < 0 || sepSpace < sepTLower)) hasDateTimeSeparator = true;
        if (hasDateTimeSeparator) {
          const parsed = Temporal.PlainDateTime._parseISODateTimeString(value);
          return new Temporal.PlainYearMonth(parsed.date.year, parsed.date.month, parsed.calendar, parsed.date.day);
        }

        const ann = Temporal.PlainDate._extractAnnotations(value);
        let txt = ann.bare;
        const t = txt.indexOf('T');
        if (t >= 0) txt = txt.slice(0, t);

        let i = 0;
        let sign = 1;
        if (txt.charCodeAt(i) === 43) i++;
        else if (txt.charCodeAt(i) === 45) {
          sign = -1;
          i++;
        }
        let year = 0;
        let yearDigits = 0;
        while (i < txt.length) {
          const d = Temporal.Duration._digit(txt, i);
          if (d < 0) break;
          year = year * 10 + d;
          yearDigits++;
          i++;
        }
        if (yearDigits < 4) throw new RangeError('Invalid PlainYearMonth string');
        year *= sign;
        if (i >= txt.length || txt.charCodeAt(i) !== 45) throw new RangeError('Invalid PlainYearMonth string');
        i++;
        if (i + 1 >= txt.length) throw new RangeError('Invalid PlainYearMonth string');
        const month = Temporal.Duration._parseNDigits(txt, i, 2);
        if (month < 0) throw new RangeError('Invalid PlainYearMonth string');
        i += 2;
        if (i === txt.length) return new Temporal.PlainYearMonth(year, month, ann.calendar, 1);
        if (txt.charCodeAt(i) !== 45) throw new RangeError('Invalid PlainYearMonth string');
        i++;
        if (i + 1 >= txt.length) throw new RangeError('Invalid PlainYearMonth string');
        const day = Temporal.Duration._parseNDigits(txt, i, 2);
        if (day < 0) throw new RangeError('Invalid PlainYearMonth string');
        i += 2;
        if (i !== txt.length) throw new RangeError('Invalid PlainYearMonth string');
        return new Temporal.PlainYearMonth(year, month, ann.calendar, day);
      }

      if (value && typeof value === 'object') {
        if (value._temporalBrand === 'Temporal.PlainYearMonth') {
          return new Temporal.PlainYearMonth(value._year, value._month, value._calendar, value._referenceISODay);
        }

        if (value.year !== undefined && value.month !== undefined) {
          return new Temporal.PlainYearMonth(value.year, value.month, value.calendar, value.day === undefined ? value.referenceISODay : value.day);
        }
      }

      throw new TypeError('Cannot convert value to Temporal.PlainYearMonth');
    }

    static compare(a, b) {
      const aa = Temporal.PlainYearMonth.from(a);
      const bb = Temporal.PlainYearMonth.from(b);
      if (aa._year !== bb._year) return aa._year < bb._year ? -1 : 1;
      if (aa._month !== bb._month) return aa._month < bb._month ? -1 : 1;
      if (aa._referenceISODay !== bb._referenceISODay) return aa._referenceISODay < bb._referenceISODay ? -1 : 1;
      return 0;
    }

    get year() { return Temporal.PlainYearMonth._requireThis(this, 'year')._year; }
    get month() { return Temporal.PlainYearMonth._requireThis(this, 'month')._month; }
    get monthCode() { return 'M' + Temporal.Duration._pad(this.month, 2); }
    get calendarId() { return Temporal.PlainYearMonth._requireThis(this, 'calendarId')._calendar; }
    get daysInMonth() { return Temporal.PlainDate._daysInMonth(this.year, this.month); }
    get daysInYear() { return Temporal.PlainDate._isLeapYear(this.year) ? 366 : 365; }
    get monthsInYear() { return 12; }
    get inLeapYear() { return Temporal.PlainDate._isLeapYear(this.year); }
    get era() { return this.year <= 0 ? 'bce' : 'ce'; }
    get eraYear() { return this.year <= 0 ? 1 - this.year : this.year; }

    with(item, options) {
      const ym = Temporal.PlainYearMonth._requireThis(this, 'with');
      if (!item || typeof item !== 'object') throw new TypeError('Temporal.PlainYearMonth.with requires an object');
      const opts = Temporal.Duration._toOptions(options);
      Temporal.Duration._getStringOption(opts, 'overflow', 'constrain', [ 'constrain', 'reject' ]);

      return new Temporal.PlainYearMonth(
        item.year === undefined ? ym._year : item.year,
        item.month === undefined ? ym._month : item.month,
        item.calendar === undefined ? ym._calendar : item.calendar,
        item.referenceISODay === undefined ? ym._referenceISODay : item.referenceISODay
      );
    }

    withCalendar(calendar) {
      Temporal.PlainYearMonth._requireThis(this, 'withCalendar');
      return new Temporal.PlainYearMonth(this._year, this._month, calendar, this._referenceISODay);
    }

    add(durationLike, options) {
      Temporal.PlainYearMonth._requireThis(this, 'add');
      const opts = Temporal.Duration._toOptions(options);
      Temporal.Duration._getStringOption(opts, 'overflow', 'constrain', [ 'constrain', 'reject' ]);
      const d = Temporal.Duration.from(durationLike);

      let year = this._year + d.years;
      let month = this._month + d.months;
      while (month > 12) {
        month -= 12;
        year++;
      }
      while (month < 1) {
        month += 12;
        year--;
      }

      return new Temporal.PlainYearMonth(year, month, this._calendar, this._referenceISODay);
    }

    subtract(durationLike, options) {
      Temporal.PlainYearMonth._requireThis(this, 'subtract');
      return this.add(Temporal.Duration.from(durationLike).negated(), options);
    }

    since(other, options = undefined) {
      Temporal.PlainYearMonth._requireThis(this, 'since');
      const rhs = Temporal.PlainYearMonth.from(other);
      const opts = Temporal.Duration._toOptions(options);
      const settings = Temporal.Duration._differenceSettings(
        opts,
        'month',
        [ 'year', 'month' ],
        'year',
        [ 'auto', 'year', 'month' ],
        'trunc'
      );
      let months = (this._year - rhs._year) * 12 + (this._month - rhs._month);
      if (settings.smallestUnit === 'year') {
        const yearsRounded = Temporal.Duration._roundToIncrement(months / 12, settings.roundingIncrement, settings.roundingMode);
        months = yearsRounded * 12;
      } else {
        months = Temporal.Duration._roundToIncrement(months, settings.roundingIncrement, settings.roundingMode);
      }

      if (settings.largestUnit === 'year') {
        const years = months < 0 ? Math.ceil(months / 12) : Math.floor(months / 12);
        return new Temporal.Duration(years, months - years * 12, 0, 0, 0, 0, 0, 0, 0, 0);
      }

      return new Temporal.Duration(0, months, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    until(other, options) {
      Temporal.PlainYearMonth._requireThis(this, 'until');
      return Temporal.PlainYearMonth.from(other).since(this, options);
    }

    equals(other) {
      Temporal.PlainYearMonth._requireThis(this, 'equals');
      const rhs = Temporal.PlainYearMonth.from(other);
      return this._year === rhs._year && this._month === rhs._month && this._calendar === rhs._calendar && this._referenceISODay === rhs._referenceISODay;
    }

    toPlainDate(item) {
      Temporal.PlainYearMonth._requireThis(this, 'toPlainDate');
      if (!item || typeof item !== 'object') throw new TypeError('Temporal.PlainYearMonth.toPlainDate requires an object');
      const day = item.day === undefined ? this._referenceISODay : item.day;
      return new Temporal.PlainDate(this._year, this._month, day, this._calendar);
    }

    toString(options) {
      Temporal.PlainYearMonth._requireThis(this, 'toString');
      const opts = Temporal.Duration._toOptions(options);
      const calendarName = Temporal.Duration._getStringOption(opts, 'calendarName', 'auto', [ 'auto', 'always', 'never', 'critical' ]);

      const y = Temporal.Duration._formatIsoYear(this._year);
      const m = Temporal.Duration._pad(this._month, 2);
      let out = y + '-' + m;
      if (calendarName === 'always') {
        out += '[u-ca=' + this._calendar + ']';
      } else if (calendarName === 'critical') {
        out += '[!u-ca=' + this._calendar + ']';
      } else if (calendarName === 'auto' && this._calendar !== 'iso8601') {
        out += '[u-ca=' + this._calendar + ']';
      }
      return out;
    }

    toJSON() {
      Temporal.PlainYearMonth._requireThis(this, 'toJSON');
      return this.toString();
    }

    toLocaleString() {
      Temporal.PlainYearMonth._requireThis(this, 'toLocaleString');
      return this.toString();
    }

    valueOf() {
      Temporal.PlainYearMonth._requireThis(this, 'valueOf');
      throw new TypeError('Do not use valueOf on Temporal.PlainYearMonth');
    }
  },

  PlainMonthDay: class PlainMonthDay {
    constructor(month, day, calendar = undefined, referenceISOYear = undefined) {
      Object.defineProperty(this, '_temporalBrand', { value: 'Temporal.PlainMonthDay', writable: false, enumerable: false, configurable: false });
      this._month = Temporal.Duration._toInteger(month, 'month');
      this._day = Temporal.Duration._toInteger(day, 'day');
      this._calendar = Temporal.Duration._normalizeCalendarId(calendar, 'calendar');
      this._referenceISOYear = Temporal.Duration._toInteger(referenceISOYear === undefined ? 1972 : referenceISOYear, 'referenceISOYear');

      if (this._month < 1 || this._month > 12) throw new RangeError('Invalid month');
      const dim = Temporal.PlainDate._daysInMonth(this._referenceISOYear, this._month);
      if (this._day < 1 || this._day > dim) throw new RangeError('Invalid day');
      Temporal.Duration._checkIsoDateRange(this._referenceISOYear, this._month, this._day);
    }

    static _requireThis(value, label) {
      if (!value || typeof value !== 'object' || value._temporalBrand !== 'Temporal.PlainMonthDay') {
        throw new TypeError('Temporal.PlainMonthDay.prototype.' + label + ' called on incompatible receiver');
      }

      return value;
    }

    static from(value, options) {
      const opts = Temporal.Duration._toOptions(options);
      Temporal.Duration._getStringOption(opts, 'overflow', 'constrain', [ 'constrain', 'reject' ]);

      if (typeof value === 'string') {
        const ann = Temporal.PlainDate._extractAnnotations(value);
        let txt = ann.bare;
        const t = txt.indexOf('T');
        if (t >= 0) txt = txt.slice(0, t);

        if (txt.length >= 10) {
          const d = Temporal.PlainDate._parseDatePart(txt);
          return new Temporal.PlainMonthDay(d.month, d.day, ann.calendar, d.year);
        }

        if (txt.length === 7 && txt.charCodeAt(0) === 45 && txt.charCodeAt(1) === 45 && txt.charCodeAt(4) === 45) {
          const month = Temporal.Duration._parseNDigits(txt, 2, 2);
          const day = Temporal.Duration._parseNDigits(txt, 5, 2);
          if (month < 0 || day < 0) throw new RangeError('Invalid PlainMonthDay string');
          return new Temporal.PlainMonthDay(month, day, ann.calendar, 1972);
        }

        throw new RangeError('Invalid PlainMonthDay string');
      }

      if (value && typeof value === 'object') {
        if (value._temporalBrand === 'Temporal.PlainMonthDay') {
          return new Temporal.PlainMonthDay(value._month, value._day, value._calendar, value._referenceISOYear);
        }

        if (value.month !== undefined && value.day !== undefined) {
          return new Temporal.PlainMonthDay(value.month, value.day, value.calendar, value.year === undefined ? value.referenceISOYear : value.year);
        }

        if (value.monthCode !== undefined && value.day !== undefined) {
          const monthCode = String(value.monthCode);
          if (monthCode.length !== 3 || monthCode.charCodeAt(0) !== 77) throw new RangeError('Invalid monthCode');
          const month = Temporal.Duration._parseNDigits(monthCode, 1, 2);
          if (month < 0) throw new RangeError('Invalid monthCode');
          return new Temporal.PlainMonthDay(month, value.day, value.calendar, value.year === undefined ? value.referenceISOYear : value.year);
        }
      }

      throw new TypeError('Cannot convert value to Temporal.PlainMonthDay');
    }

    static compare(a, b) {
      const aa = Temporal.PlainMonthDay.from(a);
      const bb = Temporal.PlainMonthDay.from(b);
      if (aa._month !== bb._month) return aa._month < bb._month ? -1 : 1;
      if (aa._day !== bb._day) return aa._day < bb._day ? -1 : 1;
      return 0;
    }

    get monthCode() { return 'M' + Temporal.Duration._pad(Temporal.PlainMonthDay._requireThis(this, 'monthCode')._month, 2); }
    get day() { return Temporal.PlainMonthDay._requireThis(this, 'day')._day; }
    get month() { return Temporal.PlainMonthDay._requireThis(this, 'month')._month; }
    get calendarId() { return Temporal.PlainMonthDay._requireThis(this, 'calendarId')._calendar; }

    with(item, options) {
      const md = Temporal.PlainMonthDay._requireThis(this, 'with');
      if (!item || typeof item !== 'object') throw new TypeError('Temporal.PlainMonthDay.with requires an object');
      const opts = Temporal.Duration._toOptions(options);
      Temporal.Duration._getStringOption(opts, 'overflow', 'constrain', [ 'constrain', 'reject' ]);

      let month = md._month;
      if (item.month !== undefined) month = item.month;
      else if (item.monthCode !== undefined) {
        const code = String(item.monthCode);
        if (code.length !== 3 || code.charCodeAt(0) !== 77) throw new RangeError('Invalid monthCode');
        month = Temporal.Duration._parseNDigits(code, 1, 2);
        if (month < 0) throw new RangeError('Invalid monthCode');
      }

      return new Temporal.PlainMonthDay(
        month,
        item.day === undefined ? md._day : item.day,
        item.calendar === undefined ? md._calendar : item.calendar,
        item.referenceISOYear === undefined ? md._referenceISOYear : item.referenceISOYear
      );
    }

    withCalendar(calendar) {
      Temporal.PlainMonthDay._requireThis(this, 'withCalendar');
      return new Temporal.PlainMonthDay(this._month, this._day, calendar, this._referenceISOYear);
    }

    equals(other) {
      Temporal.PlainMonthDay._requireThis(this, 'equals');
      const rhs = Temporal.PlainMonthDay.from(other);
      return this._month === rhs._month && this._day === rhs._day && this._calendar === rhs._calendar;
    }

    toPlainDate(item) {
      Temporal.PlainMonthDay._requireThis(this, 'toPlainDate');
      if (!item || typeof item !== 'object') throw new TypeError('Temporal.PlainMonthDay.toPlainDate requires an object');
      if (item.year === undefined) throw new TypeError('Temporal.PlainMonthDay.toPlainDate requires year');
      return new Temporal.PlainDate(item.year, this._month, this._day, this._calendar);
    }

    toString(options) {
      Temporal.PlainMonthDay._requireThis(this, 'toString');
      const opts = Temporal.Duration._toOptions(options);
      const calendarName = Temporal.Duration._getStringOption(opts, 'calendarName', 'auto', [ 'auto', 'always', 'never', 'critical' ]);

      let out = '--' + Temporal.Duration._pad(this._month, 2) + '-' + Temporal.Duration._pad(this._day, 2);
      if (calendarName === 'always') {
        out += '[u-ca=' + this._calendar + ']';
      } else if (calendarName === 'critical') {
        out += '[!u-ca=' + this._calendar + ']';
      } else if (calendarName === 'auto' && this._calendar !== 'iso8601') {
        out += '[u-ca=' + this._calendar + ']';
      }
      return out;
    }

    toJSON() {
      Temporal.PlainMonthDay._requireThis(this, 'toJSON');
      return this.toString();
    }

    toLocaleString() {
      Temporal.PlainMonthDay._requireThis(this, 'toLocaleString');
      return this.toString();
    }

    valueOf() {
      Temporal.PlainMonthDay._requireThis(this, 'valueOf');
      throw new TypeError('Do not use valueOf on Temporal.PlainMonthDay');
    }
  },

  ZonedDateTime: class ZonedDateTime {
    constructor(epochNanoseconds, timeZone, calendar = undefined) {
      Object.defineProperty(this, '_temporalBrand', { value: 'Temporal.ZonedDateTime', writable: false, enumerable: false, configurable: false });
      this._epochNanoseconds = Temporal.Duration._toInteger(epochNanoseconds, 'epochNanoseconds');
      Temporal.Duration._checkEpochNanosecondsRange(this._epochNanoseconds);
      this._timeZone = Temporal.Duration._normalizeTimeZoneId(timeZone, 'timeZone');
      this._calendar = Temporal.Duration._normalizeCalendarId(calendar, 'calendar');
    }

    static _requireThis(value, label) {
      if (!value || typeof value !== 'object' || value._temporalBrand !== 'Temporal.ZonedDateTime') {
        throw new TypeError('Temporal.ZonedDateTime.prototype.' + label + ' called on incompatible receiver');
      }

      return value;
    }

    static _instantToPlainDateTime(epochNanoseconds, timeZone, calendar) {
      const offset = Temporal.PlainDateTime._timeZoneOffsetNanoseconds(timeZone);
      let local = epochNanoseconds + offset;
      let ms = local >= 0 ? Math.trunc(local / 1000000) : Math.floor(local / 1000000);
      let rem = local - ms * 1000000;
      if (rem < 0) rem += 1000000;

      const microsecond = Math.trunc(rem / 1000);
      const nanosecond = rem - microsecond * 1000;

      const date = new Date(ms);
      return new Temporal.PlainDateTime(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds(),
        microsecond,
        nanosecond,
        calendar === undefined ? 'iso8601' : calendar
      );
    }

    static from(value, options) {
      const opts = Temporal.Duration._toOptions(options);
      Temporal.Duration._getStringOption(opts, 'disambiguation', 'compatible', [ 'compatible', 'earlier', 'later', 'reject' ]);
      const offsetOption = Temporal.Duration._getStringOption(opts, 'offset', 'reject', [ 'prefer', 'use', 'ignore', 'reject' ]);
      Temporal.Duration._getStringOption(opts, 'overflow', 'constrain', [ 'constrain', 'reject' ]);

      if (typeof value === 'string') {
        const parts = Temporal.PlainDateTime._parseISODateTimeString(value);
        if (parts.time == null) throw new RangeError('Temporal.ZonedDateTime requires a date-time string');

        const timeZone = Temporal.Duration._normalizeTimeZoneId(parts.timeZone === undefined ? 'UTC' : parts.timeZone, 'timeZone');
        const ns = Temporal.PlainDateTime._partsToEpochNanoseconds(parts, offsetOption !== 'ignore');
        if (offsetOption === 'reject' && parts.offsetNanoseconds != null && (timeZone.charCodeAt(0) === 43 || timeZone.charCodeAt(0) === 45)) {
          const zoneOffset = Temporal.Duration._offsetNanoseconds(timeZone, 'timeZone');
          if (zoneOffset !== parts.offsetNanoseconds) throw new RangeError('Offset does not match time zone');
        }
        return new Temporal.ZonedDateTime(ns, timeZone, parts.calendar);
      }

      if (value && typeof value === 'object') {
        if (value._temporalBrand === 'Temporal.ZonedDateTime') {
          return new Temporal.ZonedDateTime(value._epochNanoseconds, value._timeZone, value._calendar);
        }

        if (value.epochNanoseconds !== undefined) {
          return new Temporal.ZonedDateTime(value.epochNanoseconds, value.timeZone, value.calendar);
        }

        if (value.year !== undefined && value.month !== undefined && value.day !== undefined) {
          const pdt = Temporal.PlainDateTime.from(value);
          const tz = Temporal.Duration._normalizeTimeZoneId(value.timeZone === undefined ? 'UTC' : value.timeZone, 'timeZone');
          return pdt.toZonedDateTime(tz);
        }
      }

      throw new TypeError('Cannot convert value to Temporal.ZonedDateTime');
    }

    static compare(a, b) {
      const aa = Temporal.ZonedDateTime.from(a);
      const bb = Temporal.ZonedDateTime.from(b);
      if (aa._epochNanoseconds < bb._epochNanoseconds) return -1;
      if (aa._epochNanoseconds > bb._epochNanoseconds) return 1;
      return 0;
    }

    get epochNanoseconds() { return Temporal.ZonedDateTime._requireThis(this, 'epochNanoseconds')._epochNanoseconds; }
    get epochMilliseconds() { return Math.trunc(Temporal.ZonedDateTime._requireThis(this, 'epochMilliseconds')._epochNanoseconds / 1000000); }
    get timeZoneId() { return Temporal.ZonedDateTime._requireThis(this, 'timeZoneId')._timeZone; }
    get calendarId() { return Temporal.ZonedDateTime._requireThis(this, 'calendarId')._calendar; }

    get year() { return this.toPlainDateTime().year; }
    get month() { return this.toPlainDateTime().month; }
    get day() { return this.toPlainDateTime().day; }
    get hour() { return this.toPlainDateTime().hour; }
    get minute() { return this.toPlainDateTime().minute; }
    get second() { return this.toPlainDateTime().second; }
    get millisecond() { return this.toPlainDateTime().millisecond; }
    get microsecond() { return this.toPlainDateTime().microsecond; }
    get nanosecond() { return this.toPlainDateTime().nanosecond; }
    get monthCode() { return this.toPlainDateTime().monthCode; }
    get dayOfWeek() { return this.toPlainDateTime().dayOfWeek; }
    get dayOfYear() { return this.toPlainDateTime().dayOfYear; }
    get weekOfYear() { return this.toPlainDateTime().weekOfYear; }
    get yearOfWeek() { return this.toPlainDateTime().yearOfWeek; }
    get daysInWeek() { return this.toPlainDateTime().daysInWeek; }
    get daysInMonth() { return this.toPlainDateTime().daysInMonth; }
    get daysInYear() { return this.toPlainDateTime().daysInYear; }
    get monthsInYear() { return this.toPlainDateTime().monthsInYear; }
    get inLeapYear() { return this.toPlainDateTime().inLeapYear; }
    get offsetNanoseconds() { return Temporal.PlainDateTime._timeZoneOffsetNanoseconds(this._timeZone); }
    get offset() {
      return Temporal.Duration._formatOffsetNanoseconds(this.offsetNanoseconds);
    }

    with(item, options) {
      const zdt = Temporal.ZonedDateTime._requireThis(this, 'with');
      if (!item || typeof item !== 'object') throw new TypeError('Temporal.ZonedDateTime.with requires an object');

      const opts = Temporal.Duration._toOptions(options);
      Temporal.Duration._getStringOption(opts, 'overflow', 'constrain', [ 'constrain', 'reject' ]);
      Temporal.Duration._getStringOption(opts, 'disambiguation', 'compatible', [ 'compatible', 'earlier', 'later', 'reject' ]);
      Temporal.Duration._getStringOption(opts, 'offset', 'prefer', [ 'prefer', 'use', 'ignore', 'reject' ]);

      const pdt = zdt.toPlainDateTime().with(item, options);
      return pdt.toZonedDateTime(item.timeZone === undefined ? zdt._timeZone : item.timeZone).withCalendar(item.calendar === undefined ? zdt._calendar : item.calendar);
    }

    withCalendar(calendar) {
      Temporal.ZonedDateTime._requireThis(this, 'withCalendar');
      return new Temporal.ZonedDateTime(this._epochNanoseconds, this._timeZone, calendar);
    }

    withTimeZone(timeZone) {
      Temporal.ZonedDateTime._requireThis(this, 'withTimeZone');
      return new Temporal.ZonedDateTime(this._epochNanoseconds, timeZone, this._calendar);
    }

    add(durationLike, options) {
      Temporal.ZonedDateTime._requireThis(this, 'add');
      const opts = Temporal.Duration._toOptions(options);
      Temporal.Duration._getStringOption(opts, 'overflow', 'constrain', [ 'constrain', 'reject' ]);
      Temporal.Duration._getStringOption(opts, 'disambiguation', 'compatible', [ 'compatible', 'earlier', 'later', 'reject' ]);
      Temporal.Duration._getStringOption(opts, 'offset', 'prefer', [ 'prefer', 'use', 'ignore', 'reject' ]);

      const d = Temporal.Duration.from(durationLike);
      if (d.years || d.months || d.weeks || d.days) {
        const pdt = this.toPlainDateTime().add(d, options);
        return pdt.toZonedDateTime(this._timeZone).withCalendar(this._calendar);
      }

      return new Temporal.ZonedDateTime(this._epochNanoseconds + Temporal.Duration._totalNanoseconds(d), this._timeZone, this._calendar);
    }

    subtract(durationLike, options) {
      Temporal.ZonedDateTime._requireThis(this, 'subtract');
      return this.add(Temporal.Duration.from(durationLike).negated(), options);
    }

    since(other, options = undefined) {
      Temporal.ZonedDateTime._requireThis(this, 'since');
      const rhs = Temporal.ZonedDateTime.from(other);
      const opts = Temporal.Duration._toOptions(options);
      const settings = Temporal.Duration._differenceSettings(
        opts,
        'nanosecond',
        [ 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ],
        'day',
        [ 'auto', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ],
        'trunc'
      );
      Temporal.Duration._validateTimeRoundingIncrement(settings.smallestUnit, settings.roundingIncrement);
      const total = this._epochNanoseconds - rhs._epochNanoseconds;
      const rounded = Temporal.Duration._roundNanoseconds(total, settings.smallestUnit, settings.roundingIncrement, settings.roundingMode);
      return Temporal.Duration._balanceNanoseconds(rounded, settings.largestUnit);
    }

    until(other, options) {
      Temporal.ZonedDateTime._requireThis(this, 'until');
      return Temporal.ZonedDateTime.from(other).since(this, options);
    }

    round(options) {
      Temporal.ZonedDateTime._requireThis(this, 'round');
      if (options === undefined) throw new TypeError('options is required');
      const opts = typeof options === 'string' ? { smallestUnit: options } : Temporal.Duration._toOptions(options);
      if (opts.smallestUnit === undefined) throw new RangeError('smallestUnit is required');
      const smallestUnit = Temporal.Duration._getUnitOption(opts, 'smallestUnit', undefined, [ 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond' ]);
      const increment = Temporal.Duration._getNumberOption(opts, 'roundingIncrement', 1);
      const mode = Temporal.Duration._normalizeRoundingMode(opts.roundingMode, 'halfExpand');
      if (increment <= 0) throw new RangeError('roundingIncrement must be positive');
      return new Temporal.ZonedDateTime(Temporal.Duration._roundNanoseconds(this._epochNanoseconds, smallestUnit, increment, mode), this._timeZone, this._calendar);
    }

    equals(other) {
      Temporal.ZonedDateTime._requireThis(this, 'equals');
      const rhs = Temporal.ZonedDateTime.from(other);
      return this._epochNanoseconds === rhs._epochNanoseconds && this._timeZone === rhs._timeZone && this._calendar === rhs._calendar;
    }

    toInstant() {
      Temporal.ZonedDateTime._requireThis(this, 'toInstant');
      return new Temporal.Instant(this._epochNanoseconds);
    }

    toPlainDateTime() {
      Temporal.ZonedDateTime._requireThis(this, 'toPlainDateTime');
      return Temporal.ZonedDateTime._instantToPlainDateTime(this._epochNanoseconds, this._timeZone, this._calendar);
    }

    toPlainDate() {
      Temporal.ZonedDateTime._requireThis(this, 'toPlainDate');
      return this.toPlainDateTime().toPlainDate();
    }

    toPlainTime() {
      Temporal.ZonedDateTime._requireThis(this, 'toPlainTime');
      return this.toPlainDateTime().toPlainTime();
    }

    startOfDay() {
      Temporal.ZonedDateTime._requireThis(this, 'startOfDay');
      return this.toPlainDate().toZonedDateTime({ timeZone: this._timeZone, plainTime: new Temporal.PlainTime(0, 0, 0, 0, 0, 0) });
    }

    toString(options) {
      Temporal.ZonedDateTime._requireThis(this, 'toString');
      const opts = Temporal.Duration._toOptions(options);
      const calendarName = Temporal.Duration._getStringOption(opts, 'calendarName', 'auto', [ 'auto', 'always', 'never', 'critical' ]);
      const showOffset = Temporal.Duration._getStringOption(opts, 'offset', 'auto', [ 'auto', 'always', 'never' ]);
      const showTimeZone = Temporal.Duration._getStringOption(opts, 'timeZoneName', 'auto', [ 'auto', 'never', 'critical' ]);

      let out = this.toPlainDateTime().toString({
        smallestUnit: opts.smallestUnit,
        fractionalSecondDigits: opts.fractionalSecondDigits,
        roundingMode: opts.roundingMode,
        roundingIncrement: opts.roundingIncrement,
        calendarName: 'never'
      });
      if (showOffset !== 'never') out += this.offset;
      if (showTimeZone !== 'never') {
        if (showTimeZone === 'critical') out += '[!' + this._timeZone + ']';
        else out += '[' + this._timeZone + ']';
      }
      if (calendarName === 'always') {
        out += '[u-ca=' + this._calendar + ']';
      } else if (calendarName === 'critical') {
        out += '[!u-ca=' + this._calendar + ']';
      } else if (calendarName === 'auto' && this._calendar !== 'iso8601') {
        out += '[u-ca=' + this._calendar + ']';
      }
      return out;
    }

    toJSON() {
      Temporal.ZonedDateTime._requireThis(this, 'toJSON');
      return this.toString();
    }

    toLocaleString() {
      Temporal.ZonedDateTime._requireThis(this, 'toLocaleString');
      return this.toString();
    }

    valueOf() {
      Temporal.ZonedDateTime._requireThis(this, 'valueOf');
      throw new TypeError('Do not use valueOf on Temporal.ZonedDateTime');
    }
  },

  Now: {
    instant() {
      return Temporal.Instant.fromEpochMilliseconds(Date.now());
    },

    plainDateISO(timeZone = undefined) {
      const tz = Temporal.Duration._normalizeTimeZoneId(timeZone === undefined ? 'UTC' : timeZone, 'timeZone');
      const instant = Temporal.Now.instant();
      return Temporal.ZonedDateTime._instantToPlainDateTime(instant.epochNanoseconds, tz, 'iso8601').toPlainDate();
    },

    plainTimeISO(timeZone = undefined) {
      const tz = Temporal.Duration._normalizeTimeZoneId(timeZone === undefined ? 'UTC' : timeZone, 'timeZone');
      const instant = Temporal.Now.instant();
      return Temporal.ZonedDateTime._instantToPlainDateTime(instant.epochNanoseconds, tz, 'iso8601').toPlainTime();
    },

    plainDateTimeISO(timeZone = undefined) {
      const tz = Temporal.Duration._normalizeTimeZoneId(timeZone === undefined ? 'UTC' : timeZone, 'timeZone');
      const instant = Temporal.Now.instant();
      return Temporal.ZonedDateTime._instantToPlainDateTime(instant.epochNanoseconds, tz, 'iso8601');
    },

    zonedDateTimeISO(timeZone = undefined) {
      const tz = Temporal.Duration._normalizeTimeZoneId(timeZone === undefined ? 'UTC' : timeZone, 'timeZone');
      return Temporal.Now.instant().toZonedDateTimeISO(tz);
    },

    timeZoneId() {
      return 'UTC';
    }
  }
};`;
