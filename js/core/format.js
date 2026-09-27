/**
 * Smart Math Calculator - Number formatting helpers
 * -----------------------------------------------------------------------------
 * Keeps the display readable and removes floating point noise:
 *   0.1 + 0.2            -> 0.3            (not 0.30000000000000004)
 *   1 / 3                -> 0.333333333333 (12 significant digits)
 *   1000000              -> 1,000,000
 *   12345678901234567890 -> 1.23456789e+19
 *
 * Exposed API: SIGNIFICANT_DIGITS, roundValue, toExpressionLiteral,
 *              formatNumber, formatTimestamp
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SMC = root.SMC || {};
    root.SMC.Format = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SIGNIFICANT_DIGITS = 12;
  const EXPONENT_UPPER_BOUND = 1e15;
  const EXPONENT_LOWER_BOUND = 1e-9;

  /** Rounds away floating point representation noise. */
  function roundValue(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
      return value;
    }
    const rounded = Number(value.toPrecision(SIGNIFICANT_DIGITS));
    return rounded === 0 ? 0 : rounded;
  }

  function trimTrailingZeros(text) {
    if (text.indexOf('.') === -1) {
      return text;
    }
    return text.replace(/0+$/, '').replace(/\.$/, '');
  }

  function trimExponential(text) {
    const match = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?)(\d+)$/.exec(text);
    if (!match) {
      return text;
    }
    const sign = match[1];
    const integer = match[2];
    const fraction = (match[3] || '').replace(/0+$/, '');
    const exponentSign = match[4] === '-' ? '-' : '+';
    const exponent = match[5].replace(/^0+(?=\d)/, '');
    return sign + integer + (fraction ? '.' + fraction : '') + 'e' + exponentSign + exponent;
  }

  function usesExponentialNotation(value) {
    const absolute = Math.abs(value);
    return absolute >= EXPONENT_UPPER_BOUND || (absolute !== 0 && absolute < EXPONENT_LOWER_BOUND);
  }

  /** Plain (non grouped) decimal string - safe to parse again by the engine. */
  function toExpressionLiteral(value) {
    const number = roundValue(value);
    if (typeof number !== 'number' || !Number.isFinite(number)) {
      return '0';
    }
    if (number === 0) {
      return '0';
    }
    if (usesExponentialNotation(number)) {
      return trimExponential(number.toExponential(SIGNIFICANT_DIGITS - 1));
    }
    const absolute = Math.abs(number);
    if (absolute >= 1) {
      const decimals = Math.max(0, SIGNIFICANT_DIGITS - 1 - Math.floor(Math.log10(absolute)));
      return trimTrailingZeros(number.toFixed(decimals));
    }
    return trimTrailingZeros(number.toFixed(SIGNIFICANT_DIGITS));
  }

  function addThousandsSeparators(integerText) {
    return integerText.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** Display string for a result (grouped, no floating point noise). */
  function formatNumber(value) {
    const rounded = roundValue(value);
    if (typeof rounded !== 'number' || Number.isNaN(rounded)) {
      return '0';
    }
    if (!Number.isFinite(rounded)) {
      return String(rounded);
    }
    if (usesExponentialNotation(rounded)) {
      return trimExponential(rounded.toExponential(SIGNIFICANT_DIGITS - 1));
    }
    const plain = toExpressionLiteral(rounded);
    if (plain.indexOf('e') !== -1) {
      return plain;
    }
    const negative = plain.charAt(0) === '-';
    const unsigned = negative ? plain.slice(1) : plain;
    const parts = unsigned.split('.');
    const grouped = addThousandsSeparators(parts[0]) + (parts.length > 1 ? '.' + parts[1] : '');
    return (negative ? '-' : '') + grouped;
  }

  /** Short human readable timestamp used by the history list. */
  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (sameDay) {
      return time;
    }
    const day = date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
    return day + ', ' + time;
  }

  return {
    SIGNIFICANT_DIGITS: SIGNIFICANT_DIGITS,
    roundValue: roundValue,
    toExpressionLiteral: toExpressionLiteral,
    formatNumber: formatNumber,
    formatTimestamp: formatTimestamp
  };
});
