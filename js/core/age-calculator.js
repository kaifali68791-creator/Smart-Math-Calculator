/**
 * Smart Math Calculator - Age / DOB Calculator (offline core)
 * -----------------------------------------------------------------------------
 * Calendar-aware age maths with NO network, NO API and NO storage: the date of
 * birth is read once, used in memory and never sent anywhere.
 *
 * Rules
 *   * Years / months / days are CALENDAR aware: a month is never "30 days".
 *     The month length that actually applies (including leap Februaries) is used.
 *   * A future date of birth is rejected with a friendly message.
 *   * A 29 February birthday falls on 28 February in a non-leap year.
 *   * "Total time lived" is measured against the browser's current local date
 *     and time, so the caller can refresh it whenever it wants (no timer here).
 *
 * Exposed API (also usable from Node, see tests/age-calculator.test.js)
 *   ERRORS, MONTH_NAMES, isLeapYear, daysInMonth, isValidDate, parseDate,
 *   toIsoDate, formatDate, calendarAge, daysBetween, nextBirthday, calculate
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SMC = root.SMC || {};
    root.SMC.AgeCalculator = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MONTH_NAMES = Object.freeze([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]);
  const MS = Object.freeze({ SECOND: 1000, MINUTE: 60000, HOUR: 3600000, DAY: 86400000 });
  const MIN_YEAR = 1900;
  const MAX_YEAR = 2200;

  const ERRORS = Object.freeze({
    empty: 'Please enter your date of birth.',
    format: 'Please enter a valid date using the date picker.',
    impossible: 'That date does not exist. Please check the day and month.',
    outOfRange: 'Please enter a year between 1900 and 2200.',
    future: 'The date of birth cannot be in the future. Please enter today or an earlier date.'
  });

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  /** Length of a month (1-12), leap aware. */
  function daysInMonth(year, month) {
    const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return lengths[month - 1] || 0;
  }

  /**
   * Phase 2C: an OPTIONAL i18n lookup, null by default so behaviour and every
   * existing test stay exactly as before. Only words are affected - the calendar
   * maths, leap-year rules and result shape are untouched.
   * @type {?function(string, ...*):string}
   */
  let translator = null;

  /** Registers (or clears, with null) the i18n lookup. */
  function setTranslator(next) {
    const previous = translator;
    translator = typeof next === 'function' ? next : null;
    return previous;
  }

  /** Translates a key, falling back to the shipped English text. */
  function tr(key, fallback) {
    if (!translator) {
      return fallback;
    }
    const value = translator(key);
    return typeof value === 'string' && value !== '' ? value : fallback;
  }

  /** One validation error, translated when i18n is active. */
  function error(key) {
    return tr('age.error.' + key, ERRORS[key]);
  }

  function isValidDate(year, month, day) {
    return (
      Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) &&
      year >= MIN_YEAR && year <= MAX_YEAR &&
      month >= 1 && month <= 12 &&
      day >= 1 && day <= daysInMonth(year, month)
    );
  }

  function pad(value) {
    return (value < 10 ? '0' : '') + value;
  }

  function toIsoDate(year, month, day) {
    return year + '-' + pad(month) + '-' + pad(day);
  }

  /** e.g. 29 February 2028 - readable and locale independent (test friendly). */
  function formatDate(year, month, day) {
    const name = tr('age.month.' + month, MONTH_NAMES[month - 1]);
    return day + ' ' + name + ' ' + year;
  }

  /** Accepts 'YYYY-MM-DD' or { year, month, day }. -> { ok, year, month, day } */
  function parseDate(input) {
    if (input === null || input === undefined || input === '') {
      return { ok: false, error: error('empty') };
    }
    let year;
    let month;
    let day;
    if (typeof input === 'string') {
      const text = input.trim();
      if (!text) {
        return { ok: false, error: error('empty') };
      }
      const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
      if (!match) {
        return { ok: false, error: error('format') };
      }
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    } else if (typeof input === 'object') {
      year = Number(input.year);
      month = Number(input.month);
      day = Number(input.day);
    } else {
      return { ok: false, error: error('format') };
    }
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return { ok: false, error: error('format') };
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { ok: false, error: error('impossible') };
    }
    if (day > daysInMonth(year, month)) {
      return { ok: false, error: error('impossible') };
    }
    if (year < MIN_YEAR || year > MAX_YEAR) {
      return { ok: false, error: error('outOfRange') };
    }
    return { ok: true, year: year, month: month, day: day };
  }

  /** Whole calendar days between two dates (time of day ignored, DST safe). */
  function daysBetween(from, to) {
    const start = Date.UTC(from.year, from.month - 1, from.day);
    const end = Date.UTC(to.year, to.month - 1, to.day);
    return Math.round((end - start) / MS.DAY);
  }

  /** Full years, then remaining months, then remaining days. */
  function calendarAge(dob, today) {
    let years = today.year - dob.year;
    let months = today.month - dob.month;
    let days = today.day - dob.day;
    if (days < 0) {
      months -= 1;
      const previousMonth = today.month === 1 ? 12 : today.month - 1;
      const previousYear = today.month === 1 ? today.year - 1 : today.year;
      days += daysInMonth(previousYear, previousMonth);
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    return { years: years, months: months, days: days };
  }

  /** Next birthday on or after today. 29 Feb falls on 28 Feb in a normal year. */
  function nextBirthday(dob, today) {
    const dayFor = function (year) {
      return dob.month === 2 && dob.day === 29 && !isLeapYear(year) ? 28 : dob.day;
    };
    let candidate = { year: today.year, month: dob.month, day: dayFor(today.year) };
    if (daysBetween(today, candidate) < 0) {
      candidate = { year: today.year + 1, month: dob.month, day: dayFor(today.year + 1) };
    }
    return candidate;
  }

  /**
   * Main entry point. `now` is optional (defaults to the local current date/time).
   * -> { ok: true, dob, age, totals, nextBirthday }
   * -> { ok: false, error }
   */
  function calculate(dobInput, now) {
    const dob = parseDate(dobInput);
    if (!dob.ok) {
      return { ok: false, error: dob.error };
    }
    const reference = now instanceof Date ? now : new Date();
    const today = {
      year: reference.getFullYear(),
      month: reference.getMonth() + 1,
      day: reference.getDate()
    };
    if (daysBetween(dob, today) < 0) {
      return { ok: false, error: error('future') };
    }
    const age = calendarAge(dob, today);
    const born = new Date(dob.year, dob.month - 1, dob.day).getTime();
    const elapsed = Math.max(0, reference.getTime() - born);
    const totalSeconds = Math.floor(elapsed / MS.SECOND);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);
    const birthday = nextBirthday(dob, today);
    const daysRemaining = daysBetween(today, birthday);
    return {
      ok: true,
      dob: dob,
      age: age,
      totals: {
        days: totalDays,
        weeks: Math.floor(totalDays / 7),
        hours: totalHours,
        minutes: totalMinutes,
        seconds: totalSeconds
      },
      nextBirthday: {
        date: toIsoDate(birthday.year, birthday.month, birthday.day),
        text: formatDate(birthday.year, birthday.month, birthday.day),
        years: birthday.year - dob.year,
        daysRemaining: daysRemaining,
        isToday: daysRemaining === 0
      }
    };
  }

  return {
    ERRORS: ERRORS,
    MONTH_NAMES: MONTH_NAMES,
    setTranslator: setTranslator,
    isLeapYear: isLeapYear,
    daysInMonth: daysInMonth,
    isValidDate: isValidDate,
    parseDate: parseDate,
    toIsoDate: toIsoDate,
    formatDate: formatDate,
    daysBetween: daysBetween,
    calendarAge: calendarAge,
    nextBirthday: nextBirthday,
    calculate: calculate
  };
});
