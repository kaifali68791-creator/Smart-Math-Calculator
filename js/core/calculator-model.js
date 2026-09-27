/**
 * Smart Math Calculator - Calculator model (view independent)
 * -----------------------------------------------------------------------------
 * Holds the input state, decides what every key press means and prepares the
 * display strings for the UI. It contains no DOM code, so the UI layer
 * (js/ui/calculator-view.js) only renders the snapshots it emits and the whole
 * model can be unit tested from Node (tests/engine.test.js).
 *
 * Key behaviour
 *   digits / "."   build the current number
 *   + - × ÷        replace a trailing operator, or continue from a result
 *   ^  mod         power and remainder, same operator rules as above
 *   %              percent of a number, or of the running value (500 + 10%)
 *   of             percentage syntax: 10% of 500 -> 50
 *   ( )            brackets, closed automatically when "=" is pressed
 *   function       sin( / cos( / √( ... - wraps a lone value: 25 -> √(25)
 *   constant       π, e (spaced after a value so "2 × e" stays parseable)
 *   postfix        x², x³, 1/x and x! append to the value on screen
 *   sign (+/−)     toggles the sign of the value being typed
 *   EXP            inserts "× 10^" for scientific notation
 *   =              evaluates, stores one history entry, keeps the result
 *   ⌫              removes the last character (or clears a result / error)
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SMC = root.SMC || {};
    root.SMC.CalculatorModel = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const OP_CHARS = '+\u2212\u00D7\u00F7^'; // + − × ÷ ^
  const MAX_NUMBER_DIGITS = 15;
  const MAX_EXPRESSION_LENGTH = 200;

  /** Operators the keypad can append ("mod" and "^" are Part 2 additions). */
  const OPERATOR_TOKENS = ['+', '\u2212', '\u00D7', '\u00F7', '^', 'mod'];

  /** Matches an operator (plus its trailing spaces) at the end of an expression. */
  const TRAILING_OPERATOR_PATTERN = /(?:\+|\u2212|\u00D7|\u00F7|\^|mod)\s*$/;

  /** True when the expression ends with a complete value. */
  const VALUE_END_PATTERN = /(?:[0-9)%.!]|\u03C0|e)$/;

  /** Postfix operators the x²/x³/1/x/x! keys may append. */
  const POSTFIX_TOKENS = ['^2', '^3', '^(\u22121)', '!'];

  const PI = '\u03C0';

  /**
   * Creates a calculator model instance.
   * @param {{engine:object, format:object, history?:object, getAngleMode?:Function}} options
   *        getAngleMode() returns 'deg' | 'rad'. It is read on every evaluation,
   *        so switching DEG/RAD takes effect immediately without a rebuild.
   */
  function createCalculatorModel(options) {
    const engine = options.engine;
    const format = options.format;
    const history = options.history || null;
    const getAngleMode =
      typeof options.getAngleMode === 'function'
        ? options.getAngleMode
        : function () {
            return engine.ANGLE_MODES ? engine.ANGLE_MODES.DEG : 'deg';
          };

    const state = {
      expression: '',
      result: null,
      status: 'input', // 'input' | 'result' | 'error'
      error: null,
      preview: null,
      liveError: null
    };

    const listeners = [];

    // -- helpers -----------------------------------------------------------

    function trimmedExpression() {
      return state.expression.replace(/\s+$/, '');
    }

    function trailingNumber() {
      const match = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.exec(state.expression);
      return match ? match[0] : null;
    }

    /** The operator token at the end of an expression ('' when there is none). */
    function trailingOperatorOf(expression) {
      const match = TRAILING_OPERATOR_PATTERN.exec(expression);
      return match ? match[0].replace(/\s+$/, '') : '';
    }

    /** How an operator is written when appended: "2^5" keeps ^ tight. */
    function operatorWithSpacing(operator) {
      return operator === '^' ? '^' : ' ' + operator + ' ';
    }

    /** True when `text` ends with one of the spaced operators (+ − × ÷ mod). */
    function endsWithSpacedOperator(text) {
      return /(?:\+|\u2212|\u00D7|\u00F7|mod)$/i.test(text.replace(/\s+$/, ''));
    }

    /** True when the minus at `index` is unary (−5) and not subtraction (5 − 5). */
    function isUnaryMinusBefore(expression, index) {
      if (expression.charAt(index) !== '\u2212') {
        return false;
      }
      const before = expression.slice(0, index).replace(/\s+$/, '');
      if (before === '') {
        return true;
      }
      const last = before.charAt(before.length - 1);
      if (last === '(') {
        return true;
      }
      if (OP_CHARS.indexOf(last) !== -1) {
        return true;
      }
      return /mod$/i.test(before);
    }

    function bracketBalance(expression) {
      let balance = 0;
      for (let i = 0; i < expression.length; i += 1) {
        if (expression.charAt(i) === '(') {
          balance += 1;
        } else if (expression.charAt(i) === ')') {
          balance -= 1;
        }
      }
      return balance;
    }

    /** Appends missing closing brackets when it is clearly safe to do so. */
    function closeOpenBrackets(expression) {
      const missing = bracketBalance(expression);
      if (missing <= 0) {
        return expression;
      }
      const last = expression.charAt(expression.length - 1);
      if (
        last === ')' ||
        last === '%' ||
        last === '!' ||
        last === PI ||
        last === 'e' ||
        /[0-9.]/.test(last)
      ) {
        return expression + ')'.repeat(missing);
      }
      return expression;
    }

    /**
     * Tries the auto-closed expression first, then falls back to the raw one.
     * @returns {{ok:true, value:number, expression:string}
     *          |{ok:false, failure:{code:string,message:string,incomplete:boolean}}}
     */
    function evaluateCandidate(expression, silentIncomplete) {
      const closed = closeOpenBrackets(expression);
      const candidates = closed === expression ? [expression] : [closed, expression];
      let firstFailure = null;

      for (let i = 0; i < candidates.length; i += 1) {
        const outcome = engine.calculate(candidates[i], {
          silentIncomplete: silentIncomplete,
          angleMode: getAngleMode()
        });
        if (outcome.ok) {
          return { ok: true, value: outcome.value, expression: candidates[i] };
        }
        if (!firstFailure) {
          firstFailure = outcome;
        }
      }

      return { ok: false, failure: firstFailure };
    }

    function updatePreview() {
      state.preview = null;
      state.liveError = null;
      if (state.status !== 'input' || trimmedExpression() === '') {
        return;
      }
      const attempt = evaluateCandidate(state.expression, true);
      if (attempt.ok) {
        state.preview = format.roundValue(attempt.value);
      } else if (!attempt.failure.incomplete) {
        state.liveError = attempt.failure.message;
      }
    }

    /** Switches back to typing mode, keeping the value that is on screen. */
    function prepareExtendedInput() {
      if (state.status === 'result' && state.result !== null) {
        state.expression = format.toExpressionLiteral(state.result);
      }
      state.status = 'input';
      state.error = null;
    }

    function canAppend() {
      return state.expression.length < MAX_EXPRESSION_LENGTH;
    }

    function startFreshInput() {
      state.expression = '';
      state.result = null;
      state.error = null;
      state.status = 'input';
      state.preview = null;
      state.liveError = null;
    }

    // -- rendering snapshot -------------------------------------------------

    function snapshot() {
      const view = {
        status: state.status,
        expression: state.expression,
        result: state.result,
        primaryText: '0',
        primaryKind: 'expression',
        secondaryText: '',
        secondaryKind: 'none'
      };

      if (state.status === 'error') {
        view.primaryText = state.error || engine.describeError(engine.ERROR_CODES.SYNTAX);
        view.primaryKind = 'error';
        view.secondaryText = state.expression;
        view.secondaryKind = state.expression ? 'expression' : 'none';
      } else if (state.status === 'result') {
        view.primaryText = format.formatNumber(state.result);
        view.primaryKind = 'result';
        view.secondaryText = state.expression ? state.expression + ' =' : '';
        view.secondaryKind = view.secondaryText ? 'expression' : 'none';
      } else {
        view.primaryText = state.expression ? state.expression : '0';
        view.primaryKind = 'expression';
        if (state.liveError) {
          view.secondaryText = state.liveError;
          view.secondaryKind = 'error';
        } else if (typeof state.preview === 'number') {
          view.secondaryText = '= ' + format.formatNumber(state.preview);
          view.secondaryKind = 'preview';
        }
      }

      return view;
    }

    function emit() {
      const current = snapshot();
      for (let i = 0; i < listeners.length; i += 1) {
        listeners[i](current);
      }
      return current;
    }

    function afterInput() {
      updatePreview();
      return emit();
    }

    // -- input actions ------------------------------------------------------

    function inputDigit(digit) {
      if (!/^[0-9]$/.test(digit) || !canAppend()) {
        return;
      }
      if (state.status !== 'input') {
        startFreshInput();
      }

      let expression = trimmedExpression();
      if (/\sof$/.test(expression)) {
        expression += ' ';
      }

      const trailing = trailingNumber();
      if (trailing === '0') {
        expression = expression.slice(0, -1); // "0" + "5" becomes "5", not "05"
      } else if (trailing) {
        if (trailing.replace(/[^0-9]/g, '').length >= MAX_NUMBER_DIGITS) {
          return;
        }
      } else if (expression !== '') {
        const operator = trailingOperatorOf(expression);
        if (operator && operator !== '^') {
          expression += ' '; // "25 ×" + "5" -> "25 × 5", while "2^" + "5" -> "2^5"
        }
      }

      state.expression = expression + digit;
      afterInput();
    }

    function inputDecimal() {
      if (!canAppend()) {
        return;
      }
      if (state.status !== 'input') {
        startFreshInput();
      }

      const expression = trimmedExpression();
      if (/\sof$/.test(expression)) {
        return; // "10% of ." makes no sense
      }

      const trailing = trailingNumber();
      if (trailing) {
        if (trailing.indexOf('.') !== -1) {
          return; // the current number already has a decimal point
        }
        state.expression = expression + '.';
      } else if (expression === '') {
        state.expression = '0.';
      } else {
        const operator = trailingOperatorOf(expression);
        if (!operator) {
          return; // ends with "(" or something that cannot take a decimal point
        }
        state.expression = expression + (operator === '^' ? '0.' : ' 0.');
      }

      afterInput();
    }

    function inputOperator(operator) {
      if (OPERATOR_TOKENS.indexOf(operator) === -1) {
        return;
      }
      if (state.status !== 'input') {
        prepareExtendedInput();
      }
      if (!canAppend()) {
        return;
      }

      const expression = trimmedExpression();
      if (expression === '') {
        if (operator === '\u2212') {
          state.expression = '\u2212 ';
          afterInput();
        }
        return;
      }
      if (/\sof$/.test(expression)) {
        return; // wait for the number after "of"
      }

      const trailing = trailingOperatorOf(expression);

      if (trailing) {
        if (operator === '\u2212' && (trailing === '\u00D7' || trailing === '\u00F7' || trailing === '^')) {
          // allow 5 × −3 and 2^−3
          state.expression = expression + (trailing === '^' ? '\u2212' : ' \u2212 ');
        } else {
          state.expression = expression.replace(TRAILING_OPERATOR_PATTERN, operatorWithSpacing(operator));
        }
      } else if (expression.charAt(expression.length - 1) === '(') {
        if (operator !== '\u2212') {
          return;
        }
        state.expression = expression + '\u2212 ';
      } else if (VALUE_END_PATTERN.test(expression)) {
        state.expression = expression + operatorWithSpacing(operator);
      } else {
        return;
      }

      afterInput();
    }




    function inputPercent() {
      if (!canAppend()) {
        return;
      }
      if (state.status !== 'input') {
        prepareExtendedInput();
      }
      const expression = trimmedExpression();
      if (expression === '' || /\sof$/.test(expression)) {
        return;
      }
      if (VALUE_END_PATTERN.test(expression)) {
        state.expression = expression + '%';
        afterInput();
      }
    }

    function inputOf() {
      if (!canAppend()) {
        return;
      }
      if (state.status !== 'input') {
        prepareExtendedInput();
      }
      const expression = trimmedExpression();
      if (expression === '' || /\sof$/.test(expression)) {
        return;
      }
      if (VALUE_END_PATTERN.test(expression)) {
        state.expression = expression + ' of ';
        afterInput();
      }
    }

    function inputOpenBracket() {
      if (!canAppend()) {
        return;
      }
      if (state.status !== 'input') {
        startFreshInput();
      }
      state.expression = trimmedExpression() + '(';
      afterInput();
    }

    function inputCloseBracket() {
      if (!canAppend() || state.status !== 'input') {
        return;
      }
      const expression = trimmedExpression();
      if (bracketBalance(expression) <= 0) {
        return;
      }
      if (VALUE_END_PATTERN.test(expression)) {
        state.expression = expression + ')';
        afterInput();
      }
    }

    // -- scientific input (Part 2) ------------------------------------------

    /** True when the whole expression is one plain value: 25, 3.5, π, e. */
    function isSingleValue(expression) {
      return /^(?:\d+\.?\d*|\.\d+)$/.test(expression) || expression === PI || expression === 'e';
    }

    /**
     * Functions: appends "sin(" / "√(" / "abs(" ... A lone value on screen is
     * wrapped instead, so "25" + √ becomes "√(25)".
     */
    function inputFunction(display) {
      if (typeof display !== 'string' || display === '' || !canAppend()) {
        return;
      }
      if (state.status === 'result' && state.result !== null) {
        state.expression = display + format.toExpressionLiteral(state.result) + ')';
        state.status = 'input';
        state.error = null;
        afterInput();
        return;
      }
      if (state.status !== 'input') {
        startFreshInput();
      }
      if (!canAppend()) {
        return;
      }

      const expression = trimmedExpression();
      if (expression === '') {
        state.expression = display;
      } else if (isSingleValue(expression)) {
        state.expression = display + expression + ')';
      } else if (VALUE_END_PATTERN.test(expression)) {
        state.expression = expression + ' \u00D7 ' + display;
      } else if (trailingOperatorOf(expression)) {
        state.expression = expression + ' ' + display;
      } else if (expression.charAt(expression.length - 1) === '(') {
        state.expression = expression + display;
      } else {
        return;
      }
      afterInput();
    }

    /** π and e. "2" + e becomes "2 × e" (a plain "2e" would be an exponent). */
    function inputConstant(symbol) {
      if (symbol !== PI && symbol !== 'e') {
        return;
      }
      if (state.status !== 'input') {
        prepareExtendedInput();
      }
      if (!canAppend()) {
        return;
      }

      const expression = trimmedExpression();
      if (expression === '') {
        state.expression = symbol;
      } else if (VALUE_END_PATTERN.test(expression)) {
        state.expression = expression + ' \u00D7 ' + symbol;
      } else if (trailingOperatorOf(expression)) {
        state.expression = expression + ' ' + symbol;
      } else if (expression.charAt(expression.length - 1) === '(') {
        state.expression = expression + symbol;
      } else {
        return;
      }
      afterInput();
    }

    /** x², x³, 1/x and x! append a safe postfix operator to the last value. */
    function inputPostfix(token) {
      if (POSTFIX_TOKENS.indexOf(token) === -1 || !canAppend()) {
        return;
      }
      if (state.status !== 'input') {
        prepareExtendedInput();
      }
      const expression = trimmedExpression();
      if (expression === '' || /\sof$/.test(expression) || !VALUE_END_PATTERN.test(expression)) {
        return; // nothing on screen to apply the postfix operator to
      }
      state.expression = expression + token;
      afterInput();
    }

    /** +/− toggles the sign of the value being typed (or wraps a finished one). */
    function changeSign() {
      if (state.status !== 'input') {
        prepareExtendedInput();
      }
      if (!canAppend()) {
        return;
      }

      const expression = trimmedExpression();
      if (expression === '') {
        state.expression = '\u2212 ';
        afterInput();
        return;
      }

      const number = trailingNumber();
      if (number) {
        const valueStart = expression.length - number.length;
        const head = expression.slice(0, valueStart);
        const headTrimmed = head.replace(/\s+$/, '');
        const minusIndex = headTrimmed.length - 1;

        if (headTrimmed !== '' && isUnaryMinusBefore(headTrimmed, minusIndex)) {
          // remove the unary minus: "25 × −4" -> "25 × 4", "−5" -> "5"
          const withoutMinus = headTrimmed.slice(0, minusIndex);
          let result;
          if (/\s$/.test(head)) {
            result = head + expression.slice(valueStart);
          } else if (endsWithSpacedOperator(withoutMinus)) {
            result = withoutMinus.replace(/\s+$/, '') + ' ' + expression.slice(valueStart);
          } else {
            result = withoutMinus + expression.slice(valueStart);
          }
          state.expression = result;
          afterInput();
          return;
        }

        // insert a minus in front of the number, keeping the operator spacing
        let minus = '\u2212';
        if (headTrimmed !== '' && endsWithSpacedOperator(headTrimmed) && !/\s$/.test(head)) {
          minus = ' \u2212';
        }
        state.expression = expression.slice(0, valueStart) + minus + expression.slice(valueStart);
        afterInput();
        return;
      }

      if (VALUE_END_PATTERN.test(expression)) {
        // a finished value that is not a plain number: sin(30) -> (−sin(30))
        state.expression = '(\u2212' + expression + ')';
        afterInput();
        return;
      }
      if (trailingOperatorOf(expression) || expression.charAt(expression.length - 1) === '(') {
        const operator = trailingOperatorOf(expression);
        state.expression = expression + (operator === '^' ? '\u2212' : '\u2212 ');
        afterInput();
      }
    }

    /** EXP inserts "× 10^" so 2 EXP 5 evaluates as 2 × 10^5. */
    function inputScientific() {
      if (!canAppend()) {
        return;
      }
      if (state.status !== 'input') {
        prepareExtendedInput();
      }

      const expression = trimmedExpression();
      if (expression === '') {
        state.expression = '10^';
      } else if (VALUE_END_PATTERN.test(expression)) {
        state.expression = expression + ' \u00D7 10^';
      } else if (trailingOperatorOf(expression)) {
        state.expression = expression + ' 10^';
      } else if (expression.charAt(expression.length - 1) === '(') {
        state.expression = expression + '10^';
      } else {
        return;
      }
      afterInput();
    }

    function backspace() {
      if (state.status !== 'input') {
        // a result or an error is cleared as a whole - type a digit to start over
        startFreshInput();
        return emit();
      }
      const expression = trimmedExpression();
      if (expression === '') {
        startFreshInput();
        return emit();
      }
      if (/\sof$/.test(expression)) {
        state.expression = expression.slice(0, -3); // removes " of"
      } else if (trailingOperatorOf(expression)) {
        state.expression = expression.replace(TRAILING_OPERATOR_PATTERN, '');
      } else {
        state.expression = expression.slice(0, -1);
      }
      updatePreview();
      return emit();
    }

    function clearAll() {
      startFreshInput();
      return emit();
    }

    function evaluateExpression() {
      const wasResult = state.status === 'result';
      if (state.status === 'error') {
        // keep the expression so the user can fix it, but reset the error state
        state.status = 'input';
        state.error = null;
      }
      if (trimmedExpression() === '') {
        return emit();
      }

      const attempt = evaluateCandidate(state.expression, false);
      if (attempt.ok) {
        const value = format.roundValue(attempt.value);
        state.expression = attempt.expression;
        state.result = value;
        state.status = 'result';
        state.error = null;
        state.preview = null;
        state.liveError = null;
        if (history && !wasResult) {
          // pressing "=" again must not add the same calculation twice
          history.add({
            expression: state.expression,
            result: value,
            resultText: format.formatNumber(value),
            angleMode: getAngleMode()
          });
        }
      } else {
        state.status = 'error';
        state.error = attempt.failure.message;
        state.preview = null;
        state.liveError = null;
      }

      return emit();
    }

    /** Restores an entry from the history list so it can be reused. */
    function loadHistoryEntry(entry) {
      if (!entry) {
        return emit();
      }
      if (typeof entry.result !== 'number' || !Number.isFinite(entry.result)) {
        return emit();
      }
      state.expression = typeof entry.expression === 'string' ? entry.expression : '';
      state.result = entry.result;
      state.status = 'result';
      state.error = null;
      state.preview = null;
      state.liveError = null;
      return emit();
    }

    // -- public API ---------------------------------------------------------

    function getSnapshot() {
      return snapshot();
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return function noop() {};
      }
      listeners.push(listener);
      listener(snapshot());
      return function unsubscribe() {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    }

    /**
     * Called by the UI when the DEG/RAD switch changes. Re-evaluates the live
     * preview so "sin(30)" instantly shows the value for the new unit.
     */
    function refresh() {
      updatePreview();
      return emit();
    }

    const actions = {
      digit: inputDigit,
      decimal: inputDecimal,
      operator: inputOperator,
      percent: inputPercent,
      'of': inputOf,
      'open-bracket': inputOpenBracket,
      'close-bracket': inputCloseBracket,
      'function': inputFunction,
      constant: inputConstant,
      postfix: inputPostfix,
      sign: changeSign,
      scientific: inputScientific,
      backspace: backspace,
      clear: clearAll,
      equals: evaluateExpression
    };

    /**
     * Single entry point used by the UI buttons and the keyboard handler.
     * @param {string} action  one of the keys of "actions"
     * @param {string} [payload] digit value, operator or function display text
     */
    function press(action, payload) {
      const handler = actions[action];
      if (!handler) {
        return emit();
      }
      return handler(payload);
    }

    return {
      getSnapshot: getSnapshot,
      subscribe: subscribe,
      press: press,
      refresh: refresh,
      inputDigit: inputDigit,
      inputDecimal: inputDecimal,
      inputOperator: inputOperator,
      inputPercent: inputPercent,
      inputOf: inputOf,
      inputOpenBracket: inputOpenBracket,
      inputCloseBracket: inputCloseBracket,
      inputFunction: inputFunction,
      inputConstant: inputConstant,
      inputPostfix: inputPostfix,
      changeSign: changeSign,
      inputScientific: inputScientific,
      backspace: backspace,
      clearAll: clearAll,
      evaluateExpression: evaluateExpression,
      loadHistoryEntry: loadHistoryEntry
    };
  }

  return {
    createCalculatorModel: createCalculatorModel,
    MAX_NUMBER_DIGITS: MAX_NUMBER_DIGITS,
    MAX_EXPRESSION_LENGTH: MAX_EXPRESSION_LENGTH
  };
});

