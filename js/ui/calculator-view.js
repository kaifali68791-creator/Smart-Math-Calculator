/**
 * Smart Math Calculator - calculator view (display + keypad + keyboard)
 * -----------------------------------------------------------------------------
 * Renders the model snapshots and forwards every user interaction straight to
 * the calculator model. Everything happens locally in the browser - no network
 * request is ever made from this file, which is why the keys react instantly.
 *
 * Exposed API: SMC.createCalculatorView({ model, scope }) -> { render }
 */
(function (root) {
  'use strict';

  const SMC = (root.SMC = root.SMC || {});
  const dom = SMC.dom;

  /** Keypad layout - 4 columns, read left to right, top to bottom. */
  const KEYPAD = [
    { label: 'C', action: 'clear', variant: 'function', aria: 'Clear everything' },
    { label: '\u232B', action: 'backspace', variant: 'function', aria: 'Delete last character' },
    { label: '(', action: 'open-bracket', variant: 'function', aria: 'Open bracket' },
    { label: ')', action: 'close-bracket', variant: 'function', aria: 'Close bracket' },

    { label: '%', action: 'percent', variant: 'function', aria: 'Percent' },
    { label: 'of', action: 'of', variant: 'function', aria: 'of, a percentage of a value' },
    { label: '\u00F7', action: 'operator', value: '\u00F7', variant: 'operator', aria: 'Divide' },
    { label: '\u00D7', action: 'operator', value: '\u00D7', variant: 'operator', aria: 'Multiply' },

    { label: '7', action: 'digit', value: '7' },
    { label: '8', action: 'digit', value: '8' },
    { label: '9', action: 'digit', value: '9' },
    { label: '\u2212', action: 'operator', value: '\u2212', variant: 'operator', aria: 'Subtract' },

    { label: '4', action: 'digit', value: '4' },
    { label: '5', action: 'digit', value: '5' },
    { label: '6', action: 'digit', value: '6' },
    { label: '+', action: 'operator', value: '+', variant: 'operator', aria: 'Add' },

    { label: '1', action: 'digit', value: '1' },
    { label: '2', action: 'digit', value: '2' },
    { label: '3', action: 'digit', value: '3' },
    { label: '=', action: 'equals', variant: 'equals', span: 'rows', aria: 'Equals' },

    { label: '0', action: 'digit', value: '0', span: 'cols' },
    { label: '.', action: 'decimal', aria: 'Decimal point' }
  ];

  /**
   * Scientific keypad (Part 2) - 5 columns, hidden in Basic mode and shown
   * above the normal keys in Scientific mode.
   */
  const SCIENTIFIC_KEYPAD = [
    { label: 'sin', action: 'function', value: 'sin(', variant: 'sci', aria: 'sine' },
    { label: 'cos', action: 'function', value: 'cos(', variant: 'sci', aria: 'cosine' },
    { label: 'tan', action: 'function', value: 'tan(', variant: 'sci', aria: 'tangent' },
    { label: '\u03C0', action: 'constant', value: '\u03C0', variant: 'sci', aria: 'pi' },
    { label: 'e', action: 'constant', value: 'e', variant: 'sci', aria: "Euler's number" },

    {
      label: 'sin\u207B\u00B9',
      action: 'function',
      value: 'asin(',
      variant: 'sci',
      aria: 'inverse sine, result in the selected angle unit'
    },
    {
      label: 'cos\u207B\u00B9',
      action: 'function',
      value: 'acos(',
      variant: 'sci',
      aria: 'inverse cosine, result in the selected angle unit'
    },
    {
      label: 'tan\u207B\u00B9',
      action: 'function',
      value: 'atan(',
      variant: 'sci',
      aria: 'inverse tangent, result in the selected angle unit'
    },
    { label: 'ln', action: 'function', value: 'ln(', variant: 'sci', aria: 'natural logarithm' },
    { label: 'log', action: 'function', value: 'log(', variant: 'sci', aria: 'logarithm base 10' },

    { label: 'sinh', action: 'function', value: 'sinh(', variant: 'sci', aria: 'hyperbolic sine' },
    { label: 'cosh', action: 'function', value: 'cosh(', variant: 'sci', aria: 'hyperbolic cosine' },
    { label: 'tanh', action: 'function', value: 'tanh(', variant: 'sci', aria: 'hyperbolic tangent' },
    { label: '\u221A', action: 'function', value: '\u221A(', variant: 'sci', aria: 'square root' },
    { label: '\u221B', action: 'function', value: '\u221B(', variant: 'sci', aria: 'cube root' },

    { label: 'x\u00B2', action: 'postfix', value: '^2', variant: 'sci', aria: 'square' },
    { label: 'x\u00B3', action: 'postfix', value: '^3', variant: 'sci', aria: 'cube' },
    { label: 'x\u02B8', action: 'operator', value: '^', variant: 'sci', aria: 'power, x to the y' },
    {
      label: '1/x',
      action: 'postfix',
      value: '^(\u22121)',
      variant: 'sci',
      aria: 'reciprocal, one divided by x'
    },
    { label: 'x!', action: 'postfix', value: '!', variant: 'sci', aria: 'factorial' },

    { label: '|x|', action: 'function', value: 'abs(', variant: 'sci', aria: 'absolute value' },
    { label: 'mod', action: 'operator', value: 'mod', variant: 'sci', aria: 'modulo, remainder' },
    {
      label: 'EXP',
      action: 'scientific',
      variant: 'sci',
      aria: 'scientific notation, times ten to the power'
    },
    { label: '\u00B1', action: 'sign', variant: 'sci', span: 'cols', aria: 'change sign' }
  ];

  /** Physical keyboard mapping (desktop / laptop convenience). */
  const KEYBOARD_MAP = {
    '0': { action: 'digit', value: '0' },
    '1': { action: 'digit', value: '1' },
    '2': { action: 'digit', value: '2' },
    '3': { action: 'digit', value: '3' },
    '4': { action: 'digit', value: '4' },
    '5': { action: 'digit', value: '5' },
    '6': { action: 'digit', value: '6' },
    '7': { action: 'digit', value: '7' },
    '8': { action: 'digit', value: '8' },
    '9': { action: 'digit', value: '9' },
    '.': { action: 'decimal' },
    ',': { action: 'decimal' },
    '+': { action: 'operator', value: '+' },
    '-': { action: 'operator', value: '\u2212' },
    '\u2212': { action: 'operator', value: '\u2212' },
    '*': { action: 'operator', value: '\u00D7' },
    'x': { action: 'operator', value: '\u00D7' },
    '\u00D7': { action: 'operator', value: '\u00D7' },
    '/': { action: 'operator', value: '\u00F7' },
    '\u00F7': { action: 'operator', value: '\u00F7' },
    '%': { action: 'percent' },
    '(': { action: 'open-bracket' },
    ')': { action: 'close-bracket' },
    '^': { action: 'operator', value: '^' },
    '!': { action: 'postfix', value: '!' },
    '=': { action: 'equals' },
    Enter: { action: 'equals' },
    Backspace: { action: 'backspace' },
    Delete: { action: 'backspace' },
    Escape: { action: 'clear' },
    c: { action: 'clear' },
    C: { action: 'clear' }
  };

  const LONG_TEXT_RULES = [
    { minLength: 15, className: 'is-medium' },
    { minLength: 20, className: 'is-small' },
    { minLength: 28, className: 'is-tiny' }
  ];


  function createCalculatorView(options) {
    const config = options || {};
    const model = config.model;
    const scope = config.scope || document;

    const keypadEl = dom.qs('[data-keypad]', scope);
    const sciKeypadEl = dom.qs('[data-keypad-sci]', scope);
    const displayEl = dom.qs('[data-display]', scope);
    const mainEl = dom.qs('[data-display-main]', scope);
    const subEl = dom.qs('[data-display-sub]', scope);

    if (!model || !keypadEl || !displayEl || !mainEl || !subEl) {
      return null;
    }

    // -- keypad -------------------------------------------------------------

    function createKey(key) {
      const classes = ['key'];
      classes.push('key--' + (key.variant || 'number'));
      if (key.span === 'cols') {
        classes.push('key--span-cols');
      }
      if (key.span === 'rows') {
        classes.push('key--span-rows');
      }

      return dom.create('button', {
        class: classes.join(' '),
        text: key.label,
        attrs: {
          type: 'button',
          'data-action': key.action,
          'data-value': key.value,
          'aria-label': key.aria || key.label,
          tabindex: '-1'
        }
      });
    }

    function renderKeypad() {
      const fragment = document.createDocumentFragment();
      KEYPAD.forEach(function (key) {
        fragment.appendChild(createKey(key));
      });
      keypadEl.textContent = '';
      keypadEl.appendChild(fragment);
    }

    /** Renders the Part 2 scientific keys (skipped when the fixture has none). */
    function renderScientificKeypad() {
      if (!sciKeypadEl) {
        return;
      }
      const fragment = document.createDocumentFragment();
      SCIENTIFIC_KEYPAD.forEach(function (key) {
        fragment.appendChild(createKey(key));
      });
      sciKeypadEl.textContent = '';
      sciKeypadEl.appendChild(fragment);
    }

    // -- display ------------------------------------------------------------

    /**
     * Inverse-trig DISPLAY names.
     *
     * The calculator model and the expression engine work on one and the same
     * string: a key press inserts "atan(" and the engine tokenizes exactly that
     * text. The tokenizer only knows the ASCII function names, so "tan⁻¹(1)"
     * is a SYNTAX error - verified, not assumed. The internal names must
     * therefore stay exactly as they are.
     *
     * This map is applied ONLY to the text written into the display, so the
     * user reads standard textbook notation while the model, the parser, the
     * live preview, the DEG/RAD handling and the stored history all keep
     * working on the unchanged internal names.
     *
     * The closing parenthesis is part of each entry so a bare function name
     * elsewhere in the text is never rewritten.
     */
    const DISPLAY_NAMES = [
      ['asin(', 'sin\u207B\u00B9('],
      ['acos(', 'cos\u207B\u00B9('],
      ['atan(', 'tan\u207B\u00B9(']
    ];

    /** Rewrites internal function names into readable notation. Text only. */
    function toDisplayText(text) {
      if (typeof text !== 'string' || text === '') {
        return text;
      }
      let readable = text;
      for (let i = 0; i < DISPLAY_NAMES.length; i += 1) {
        readable = readable.split(DISPLAY_NAMES[i][0]).join(DISPLAY_NAMES[i][1]);
      }
      return readable;
    }

    function updateTextSize(text) {
      LONG_TEXT_RULES.forEach(function (rule) {
        dom.setClass(mainEl, rule.className, text.length >= rule.minLength);
      });
    }

    function render(snapshot) {
      const primary = toDisplayText(snapshot.primaryText);
      dom.setText(mainEl, primary);
      dom.setText(subEl, toDisplayText(snapshot.secondaryText));

      dom.setClass(displayEl, 'is-error', snapshot.primaryKind === 'error');
      dom.setClass(displayEl, 'is-result', snapshot.primaryKind === 'result');
      dom.setClass(subEl, 'is-error', snapshot.secondaryKind === 'error');
      dom.setClass(subEl, 'is-preview', snapshot.secondaryKind === 'preview');

      updateTextSize(primary);

      // keep the end of a long expression visible (no animation, no delay)
      mainEl.scrollLeft = mainEl.scrollWidth;
      subEl.scrollLeft = subEl.scrollWidth;
    }

    // -- interaction --------------------------------------------------------

    function dispatch(action, value) {
      model.press(action, value);
    }

    function bindKeypad(container) {
      dom.delegate(container || keypadEl, '[data-action]', 'click', function (event, button) {
        event.preventDefault();
        dispatch(button.getAttribute('data-action'), button.getAttribute('data-value') || undefined);
      });
    }

    function isEditableTarget(target) {
      if (!target || !target.tagName) {
        return false;
      }
      const tag = target.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable === true;
    }

    function bindKeyboard() {
      dom.on(document, 'keydown', function (event) {
        if (event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) {
          return;
        }
        const binding = KEYBOARD_MAP[event.key];
        if (!binding) {
          return;
        }
        event.preventDefault();
        dispatch(binding.action, binding.value);
      });
    }

    renderKeypad();
    renderScientificKeypad();
    bindKeypad(keypadEl);
    if (sciKeypadEl) {
      bindKeypad(sciKeypadEl);
    }
    bindKeyboard();
    model.subscribe(render); // renders the current snapshot right away

    return {
      render: render,
      renderKeypad: renderKeypad,
      renderScientificKeypad: renderScientificKeypad,
      keys: KEYPAD.slice(),
      scientificKeys: SCIENTIFIC_KEYPAD.slice()
    };
  }

  SMC.createCalculatorView = createCalculatorView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
