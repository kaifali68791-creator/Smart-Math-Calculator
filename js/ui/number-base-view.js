/**
 * Smart Math Calculator - Number System Converter view
 * -----------------------------------------------------------------------------
 * Thin DOM layer over js/core/number-base.js. COMPLETELY offline: no fetch, no
 * API, no storage, no innerHTML (every update goes through textContent).
 *
 * Exposed API: SMC.createNumberBaseView()
 */
(function (root) {
  'use strict';
  const SMC = (root.SMC = root.SMC || {});
  const dom = SMC.dom;
  const NumberBase = SMC.NumberBase;

  function createNumberBaseView(options) {
    const config = options || {};
    // Phase 2C: optional i18n for the copy button, the result phrase and the copy
    // errors. The conversion maths stays in NumberBase, which translates itself.
    const i18n = config.i18n || null;
    const t = function (key, fallback, params) {
      if (!i18n) { return fallback; }
      const value = params ? i18n.t(key, params) : i18n.t(key);
      return typeof value === 'string' && value !== '' ? value : fallback;
    };
    const fromSelect = dom.qs('[data-base-from]');
    const toSelect = dom.qs('[data-base-to]');
    const input = dom.qs('[data-base-input]');
    const convertButton = dom.qs('[data-base-convert]');
    const copyButton = dom.qs('[data-base-copy]');
    const resultBox = dom.qs('[data-base-result]');
    const resultText = dom.qs('[data-base-result-text]');
    const resultFrom = dom.qs('[data-base-result-from]');
    const resultTo = dom.qs('[data-base-result-to]');
    const errorBox = dom.qs('[data-base-error]');
    const errorText = dom.qs('[data-base-error-text]');

    if (!NumberBase || !fromSelect || !toSelect || !input || !convertButton) {
      return null;
    }

    let lastResult = '';

    function clearError() {
      dom.hide(errorBox);
      dom.setText(errorText, '');
    }

    function showError(message) {
      lastResult = '';
      dom.setText(errorText, message);
      dom.show(errorBox);
      dom.hide(resultBox);
      if (copyButton) {
        dom.setText(copyButton, 'Copy result');
      }
    }

    function showResult(outcome) {
      clearError();
      lastResult = outcome.result;
      dom.setText(resultFrom, t('converter.result.value', NumberBase.label(outcome.from) + ' value', [NumberBase.label(outcome.from)]));
      dom.setText(resultTo, NumberBase.label(outcome.to));
      dom.setText(resultText, outcome.result);
      dom.show(resultBox);
    }

    /** Converts what is currently in the form. Returns the outcome or null. */
    function convert() {
      const outcome = NumberBase.convert(input.value, fromSelect.value, toSelect.value);
      if (!outcome.ok) {
        showError(outcome.error);
        return null;
      }
      showResult(outcome);
      return outcome;
    }

    /** Copies the last result when the browser allows it. Never throws. */
    function copy() {
      if (!lastResult) {
        showError(t('converter.copy.noResult', 'There is no result to copy yet. Convert a number first.'));
        return Promise.resolve(false);
      }
      const clipboard = root.navigator && root.navigator.clipboard;
      if (!clipboard || typeof clipboard.writeText !== 'function') {
        showError(t('converter.copy.unavailable', 'Copying is not available in this browser. Please read the result above.'));
        return Promise.resolve(false);
      }
      return clipboard.writeText(lastResult).then(
        function () {
          if (copyButton) {
            dom.setText(copyButton, t('converter.btn.copied', 'Copied'));
          }
          return true;
        },
        function () {
          showError(t('converter.copy.failed', 'Could not copy automatically. Please read the result above.'));
          return false;
        }
      );
    }

    dom.on(convertButton, 'click', convert);
    dom.on(copyButton, 'click', copy);
    dom.on(input, 'keydown', function (event) {
      if (event && event.key === 'Enter') {
        convert();
      }
    });

    if (config.convertOnStart !== false) {
      convert();
    }

    return {
      convert: convert,
      copy: copy,
      getResult: function () {
        return lastResult;
      }
    };
  }

  SMC.createNumberBaseView = createNumberBaseView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
