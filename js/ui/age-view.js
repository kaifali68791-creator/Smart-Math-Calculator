/**
 * Smart Math Calculator - Age / DOB Calculator view
 * -----------------------------------------------------------------------------
 * Thin DOM layer over js/core/age-calculator.js. COMPLETELY offline: the date of
 * birth is read in the browser, used in memory and never sent or stored. There
 * is no interval/timer: the totals are refreshed when the user presses a button.
 *
 * Exposed API: SMC.createAgeView()
 */
(function (root) {
  'use strict';
  const SMC = (root.SMC = root.SMC || {});
  const dom = SMC.dom;
  const AgeCalculator = SMC.AgeCalculator;

  function createAgeView(options) {
    const config = options || {};
    // Phase 2C: optional i18n. Number grouping follows the selected language's
    // locale, and the birthday sentences are translated. The age maths itself is
    // computed by AgeCalculator, which translates its own month names and errors.
    const i18n = config.i18n || null;
    const t = function (key, fallback, params) {
      if (!i18n) { return fallback; }
      const value = params ? i18n.t(key, params) : i18n.t(key);
      return typeof value === 'string' && value !== '' ? value : fallback;
    };
    const locale = function () {
      if (!i18n || typeof i18n.getLanguage !== 'function') {
        return 'en-US';
      }
      const code = i18n.getLanguage();
      if (code === 'hi' || code === 'hi-Latn') { return 'en-IN'; }
      if (code === 'te' || code === 'te-Latn') { return 'en-IN'; }
      return 'en-US';
    };
    /** "1 year" / "2 years" - the plural rule is now the dictionary's. */
    function plural(count, oneKey, manyKey, fallback) {
      return count === 1
        ? t(oneKey, fallback.replace(/s$/, ''), [count])
        : t(manyKey, fallback, [count]);
    }
    const input = dom.qs('[data-age-dob]');
    const calculateButton = dom.qs('[data-age-calculate]');
    const refreshButton = dom.qs('[data-age-refresh]');
    const resultBox = dom.qs('[data-age-result]');
    const errorBox = dom.qs('[data-age-error]');
    const errorText = dom.qs('[data-age-error-text]');

    if (!AgeCalculator || !input || !calculateButton) {
      return null;
    }

    const fields = {
      years: dom.qs('[data-age-years]'),
      months: dom.qs('[data-age-months]'),
      days: dom.qs('[data-age-days]'),
      totalDays: dom.qs('[data-age-total-days]'),
      totalWeeks: dom.qs('[data-age-total-weeks]'),
      totalHours: dom.qs('[data-age-total-hours]'),
      totalMinutes: dom.qs('[data-age-total-minutes]'),
      totalSeconds: dom.qs('[data-age-total-seconds]'),
      birthday: dom.qs('[data-age-birthday]'),
      birthdayDays: dom.qs('[data-age-birthday-days]'),
      birthdayYears: dom.qs('[data-age-birthday-years]')
    };

    function showError(message) {
      dom.setText(errorText, message);
      dom.show(errorBox);
      dom.hide(resultBox);
    }

    function render(outcome) {
      const digits = locale();
      dom.hide(errorBox);
      dom.setText(errorText, '');
      dom.setText(fields.years, String(outcome.age.years));
      dom.setText(fields.months, String(outcome.age.months));
      dom.setText(fields.days, String(outcome.age.days));
      dom.setText(fields.totalDays, outcome.totals.days.toLocaleString(digits));
      dom.setText(fields.totalWeeks, outcome.totals.weeks.toLocaleString(digits));
      dom.setText(fields.totalHours, outcome.totals.hours.toLocaleString(digits));
      dom.setText(fields.totalMinutes, outcome.totals.minutes.toLocaleString(digits));
      dom.setText(fields.totalSeconds, outcome.totals.seconds.toLocaleString(digits));
      dom.setText(fields.birthday, outcome.nextBirthday.text);
      dom.setText(fields.birthdayYears, plural(
        outcome.nextBirthday.years, 'age.unit.year', 'age.unit.years', outcome.nextBirthday.years + ' years'
      ));
      dom.setText(
        fields.birthdayDays,
        outcome.nextBirthday.isToday
          ? t('age.msg.birthdayToday', 'Today is your birthday. Happy birthday to you.')
          : t('age.msg.daysToGo',
            plural(outcome.nextBirthday.daysRemaining, 'age.unit.day', 'age.unit.days',
              outcome.nextBirthday.daysRemaining + ' days') + ' to go.',
            [outcome.nextBirthday.daysRemaining])
      );
      dom.show(resultBox);
    }

    /** Calculates (or refreshes) the age. Returns the outcome or null. */
    function calculate() {
      const now = config.now instanceof Date ? config.now : undefined;
      const outcome = AgeCalculator.calculate(input.value, now);
      if (!outcome.ok) {
        showError(outcome.error);
        return null;
      }
      render(outcome);
      return outcome;
    }

    dom.on(calculateButton, 'click', calculate);
    dom.on(refreshButton, 'click', calculate);
    dom.on(input, 'change', calculate);

    return {
      calculate: calculate,
      calculateFrom: function (dobValue) {
        input.value = dobValue;
        return calculate();
      }
    };
  }

  SMC.createAgeView = createAgeView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
