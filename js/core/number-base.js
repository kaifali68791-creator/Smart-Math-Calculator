/**
 * Smart Math Calculator - Number System Converter (offline core)
 * -----------------------------------------------------------------------------
 * Pure base conversion between decimal, binary, octal and hexadecimal.
 * COMPLETELY offline: no network, no fetch, no API, no eval(), no dependencies.
 * Parsing and formatting use the native BigInt radix conversion, so the result is
 * exact for very large values as well (no floating point rounding).
 *
 * Conventions
 *   * a leading "-" or "+" is accepted and kept
 *   * zero is handled naturally ("0")
 *   * hexadecimal output uses the conventional UPPERCASE form (FF, not ff)
 *   * errors are short, friendly sentences for beginners
 *
 * Exposed API (also usable from Node, see tests/number-base.test.js)
 *   BASES, LABELS, RADIX, ERRORS, MAX_INPUT_LENGTH,
 *   isValidBase, label, validate, parse, format, convert
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SMC = root.SMC || {};
    root.SMC.NumberBase = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** The four supported systems, in a beginner-friendly order. */
  const BASES = Object.freeze(['decimal', 'binary', 'octal', 'hexadecimal']);
  const LABELS = Object.freeze({
    decimal: 'Decimal',
    binary: 'Binary',
    octal: 'Octal',
    hexadecimal: 'Hexadecimal'
  });
  const RADIX = Object.freeze({ decimal: 10, binary: 2, octal: 8, hexadecimal: 16 });
  const MAX_INPUT_LENGTH = 4096;

  /** Only the digits a beginner is taught for each system. */
  const PATTERNS = {
    decimal: /^[0-9]+$/,
    binary: /^[01]+$/,
    octal: /^[0-7]+$/,
    hexadecimal: /^[0-9a-f]+$/i
  };

  const ERRORS = Object.freeze({
    empty: 'Please enter a number to convert.',
    unknownBase: 'Please choose a valid number system.',
    tooLong: 'That number is too long to convert.',
    decimal: 'Invalid decimal number. Decimal numbers can contain only the digits 0 to 9.',
    binary: 'Invalid binary number. Binary numbers can contain only 0 and 1.',
    octal: 'Invalid octal number. Octal numbers can contain only the digits 0 to 7.',
    hexadecimal:
      'Invalid hexadecimal number. Hexadecimal numbers can contain 0 to 9 and the letters A to F.'
  });

  function isValidBase(base) {
    return BASES.indexOf(base) !== -1;
  }

  /**
   * Phase 2C: an OPTIONAL i18n lookup, null by default so the behaviour and
   * every existing test are unchanged. Only the user-facing words are affected;
   * the conversion maths is untouched.
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
  function tr(key, fallback, params) {
    if (!translator) {
      return fallback;
    }
    const value = params ? translator(key, params) : translator(key);
    return typeof value === 'string' && value !== '' ? value : fallback;
  }

  /** The beginner-friendly name of one base, translated when i18n is active. */
  function label(base) {
    return tr('converter.base.' + base, LABELS[base] || 'that number system');
  }

  /** One validation error, translated when i18n is active. */
  function error(key) {
    return tr('converter.error.' + key, ERRORS[key]);
  }

  /** Splits an optional leading sign from the digits. */
  function splitSign(value) {
    const text = String(value === null || value === undefined ? '' : value).trim();
    const first = text.charAt(0);
    if (first === '-' || first === '+') {
      return { negative: first === '-', digits: text.slice(1) };
    }
    return { negative: false, digits: text };
  }

  /** Validates raw input for one base. -> { ok } | { ok: false, error } */
  function validate(value, base) {
    if (!isValidBase(base)) {
      return { ok: false, error: error('unknownBase') };
    }
    const signed = splitSign(value);
    if (!signed.digits) {
      return { ok: false, error: error('empty') };
    }
    if (signed.digits.length > MAX_INPUT_LENGTH) {
      return { ok: false, error: error('tooLong') };
    }
    if (!PATTERNS[base].test(signed.digits)) {
      return { ok: false, error: error(base) };
    }
    return { ok: true, digits: signed.digits, negative: signed.negative };
  }

  /** Validated digits for a base as a BigInt, or null when the input is invalid. */
  function parse(value, base) {
    const checked = validate(value, base);
    if (!checked.ok) {
      return null;
    }
    const prefix = base === 'binary' ? '0b' : base === 'octal' ? '0o' : base === 'hexadecimal' ? '0x' : '';
    const magnitude = BigInt(prefix + checked.digits);
    return checked.negative ? -magnitude : magnitude;
  }

  /** Formats a BigInt in a base; hexadecimal is UPPERCASE, as is conventional. */
  function format(value, base) {
    if (!isValidBase(base)) {
      return '';
    }
    const text = value.toString(RADIX[base]);
    return base === 'hexadecimal' ? text.toUpperCase() : text;
  }

  /**
   * Converts one number.
   * -> { ok: true, from, to, fromValue, result, fromValueText }
   * -> { ok: false, error }
   */
  function convert(value, from, to) {
    if (!isValidBase(from) || !isValidBase(to)) {
      return { ok: false, error: error('unknownBase') };
    }
    const checked = validate(value, from);
    if (!checked.ok) {
      return { ok: false, error: checked.error };
    }
    const prefix = from === 'binary' ? '0b' : from === 'octal' ? '0o' : from === 'hexadecimal' ? '0x' : '';
    const magnitude = BigInt(prefix + checked.digits);
    const parsed = checked.negative ? -magnitude : magnitude;
    return {
      ok: true,
      from: from,
      to: to,
      fromValue: parsed,
      fromValueText: format(parsed, from),
      result: format(parsed, to)
    };
  }

  return {
    BASES: BASES,
    LABELS: LABELS,
    RADIX: RADIX,
    ERRORS: ERRORS,
    MAX_INPUT_LENGTH: MAX_INPUT_LENGTH,
    setTranslator: setTranslator,
    isValidBase: isValidBase,
    label: label,
    validate: validate,
    parse: parse,
    format: format,
    convert: convert
  };
});
