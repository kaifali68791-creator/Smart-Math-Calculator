/**
 * Smart Math Calculator - Math Keyboard view (Phase 2)
 * -----------------------------------------------------------------------------
 * The visible Math Keyboard that belongs to the Smart Solver question box.
 * It renders real <button type="button"> keys, opens and closes on one toggle,
 * and does nothing but hand text to the Phase 1 insertion core
 * (js/ui/math-keyboard.js -> SMC.MathKeyboard).
 *
 * DESIGN RULES
 *   * The insertion core is NOT re-implemented here. Every key press calls
 *     SMC.MathKeyboard.insertAtCursor(textarea, key.text, key.mode).
 *   * It never calls solverView.setQuestion(). setQuestion() retires the
 *     displayed result, which a single keystroke must not do. Instead the
 *     keyboard dispatches the textarea's own `input` event, which is the
 *     EXISTING stale-result mechanism js/ui/solver-view.js already listens
 *     to. Same behaviour, no new invalidation path.
 *   * The open/closed state is never stored. No localStorage, no
 *     sessionStorage, no cookies, no IndexedDB, no network. A reload always
 *     starts closed.
 *   * No innerHTML, no eval, no new Function. Every node is created with
 *     SMC.dom.create, and every label is written as textContent or as an
 *     attribute value.
 *
 * KEY SAFETY
 *   Every key below was verified against js/services/math-solver.js, which
 *   normalises the Unicode forms it understands. `^n` is deliberately NOT
 *   offered: the local solver returns a hard ERROR for the U+207F character
 *   (not "unsupported"), so it would never reach the AI fallback. The
 *   user can type `^n` instead, which is handled safely.
 *
 * Exposed API (browser: SMC.createMathKeyboardView):
 *   isOpen, open, close, toggle, applyLanguage, render, getKeys, getKeyList,
 *   press, isReady, destroy
 */
(function (root) {
  'use strict';
  const SMC = (root.SMC = root.SMC || {});
  const dom = SMC.dom;

  const TOGGLE_SELECTOR = '[data-math-keyboard-toggle]';
  const PANEL_SELECTOR = '[data-math-keyboard-panel]';
  const KEYS_SELECTOR = '[data-math-keyboard-keys]';

  const TOGGLE_FALLBACK = '⌨ Math Keyboard';
  const INSERT_FALLBACK = 'Insert {0}';
  const PANEL_FALLBACK = 'Math keyboard';

  /**
   * The key set, grouped. `mode` is handed straight to the Phase 1 helper.
   *   replace -> plain insertion (operators, brackets, pi, functions, extras)
   *   append  -> postfix power, keeps the selected text ("3" + 2^ key = "3²")
   *   wrap    -> wraps the selection, or opens an empty pair with the caret
   *              inside it ("3 + " + √ key = "3 + √()|")
   * There is no `^n` key: see the note at the top of this file.
   */
  const GROUPS = [
    {
      id: 'operators',
      keys: [
        { text: '+', mode: 'replace' },
        { text: '−', mode: 'replace' },
        { text: '×', mode: 'replace' },
        { text: '÷', mode: 'replace' },
        { text: '/', mode: 'replace' },
        { text: '^', mode: 'replace' },
        { text: '(', mode: 'replace' },
        { text: ')', mode: 'replace' }
      ]
    },
    {
      id: 'symbols',
      keys: [
        { text: 'π', mode: 'replace' },
        { text: '√', mode: 'wrap' },
        { text: '∛', mode: 'wrap' }
      ]
    },
    {
      id: 'powers',
      keys: [
        { text: '²', mode: 'append' },
        { text: '³', mode: 'append' }
      ]
    },
    {
      id: 'functions',
      keys: [
        { text: 'sin(', mode: 'replace' },
        { text: 'cos(', mode: 'replace' },
        { text: 'tan(', mode: 'replace' },
        { text: 'asin(', mode: 'replace' },
        { text: 'acos(', mode: 'replace' },
        { text: 'atan(', mode: 'replace' },
        { text: 'sinh(', mode: 'replace' },
        { text: 'cosh(', mode: 'replace' },
        { text: 'tanh(', mode: 'replace' },
        { text: 'log(', mode: 'replace' },
        { text: 'ln(', mode: 'replace' },
        { text: 'sqrt(', mode: 'replace' },
        { text: 'cbrt(', mode: 'replace' },
        { text: 'abs(', mode: 'replace' }
      ]
    },
    {
      id: 'extra',
      keys: [
        { text: '!', mode: 'replace' },
        { text: '%', mode: 'replace' },
        { text: 'mod', mode: 'replace' },
        { text: 'of', mode: 'replace' }
      ]
    }
  ];

  /** Flat list of every key, in render order. Handy for tests and for counts. */
  const KEY_LIST = GROUPS.reduce(function (all, group) {
    return all.concat(group.keys);
  }, []);


  function createMathKeyboardView(options) {
    const config = options || {};
    const scope = config.scope || null;
    // The Phase 1 insertion core. It is injected or read from SMC, never copied.
    const keyboard = config.keyboard || SMC.MathKeyboard || null;
    const i18n = config.i18n || null;
    const textarea = config.textarea || null;
    const t = function (key, fallback, params) {
      if (!i18n || typeof i18n.t !== 'function') { return fallback; }
      const value = params ? i18n.t(key, params) : i18n.t(key);
      return typeof value === 'string' && value !== '' ? value : fallback;
    };

    const toggleEl = config.toggle || dom.qs(TOGGLE_SELECTOR, scope);
    const panelEl = config.panel || dom.qs(PANEL_SELECTOR, scope);
    const hostByGroup = {};
    if (panelEl) {
      dom.qsa(KEYS_SELECTOR, panelEl).forEach(function (host) {
        const id = host.getAttribute('data-math-keyboard-keys');
        if (id) { hostByGroup[id] = host; }
      });
    }
    const buttons = [];
    let unsubscribe = null;

    /** "Insert ×" in the current language; symbols themselves stay untranslated. */
    function ariaFor(key) {
      const text = key && key.text !== undefined ? key.text : '';
      return t('keyboard.aria.insert', INSERT_FALLBACK, [text]);
    }

    /**
     * Replays the textarea's own `input` event so the EXISTING stale-result
     * invalidation in js/ui/solver-view.js runs. Writing `.value` directly
     * does not fire `input` on its own, so without this an old answer would
     * stay on screen under a question the student has already changed.
     * setQuestion() is deliberately NOT used: it would also re-notify
     * subscribers and blur the "one keystroke, one insertion" contract.
     */
    function notifyInput() {
      if (!textarea || typeof textarea.dispatchEvent !== 'function') { return false; }
      let event = null;
      if (typeof root.Event === 'function') {
        try { event = new root.Event('input', { bubbles: true }); } catch (error) { event = null; }
      }
      if (!event && typeof root.CustomEvent === 'function') {
        try { event = new root.CustomEvent('input'); } catch (error) { event = null; }
      }
      try {
        textarea.dispatchEvent(event || { type: 'input' });
        return true;
      } catch (error) {
        return false;
      }
    }

    /** Sends one key to the Phase 1 core and keeps the caret in the textarea. */
    function press(key) {
      if (!textarea || !keyboard) { return null; }
      const result = keyboard.insertAtCursor(textarea, key.text, key.mode);
      notifyInput();
      return result;
    }

    function buildKey(key) {
      const button = dom.create('button', {
        class: 'mathkbd__key',
        text: key.text,
        attrs: {
          type: 'button',
          'data-math-key': key.text,
          'data-math-key-mode': key.mode,
          'aria-label': ariaFor(key)
        }
      });
      dom.on(button, 'click', function (event) {
        // type="button" already keeps the solver form from submitting, and
        // preventDefault keeps the browser from scrolling the panel.
        if (event && typeof event.preventDefault === 'function') { event.preventDefault(); }
        press(key);
      });
      buttons.push(button);
      return button;
    }

    /** Builds every key button once. Safe to call again after a language change. */
    function render() {
      if (!panelEl) { return buttons.slice(); }
      GROUPS.forEach(function (group) {
        const host = hostByGroup[group.id];
        if (!host) { return; }
        if (typeof document === 'undefined' || !document.createDocumentFragment) {
          group.keys.forEach(function (key) { host.appendChild(buildKey(key)); });
          return;
        }
        const fragment = document.createDocumentFragment();
        group.keys.forEach(function (key) { fragment.appendChild(buildKey(key)); });
        host.textContent = '';
        host.appendChild(fragment);
      });
      return buttons.slice();
    }


    /** Rewrites only the aria-labels, so a language switch needs no reload. */
    function applyLanguage() {
      buttons.forEach(function (button, index) {
        const key = KEY_LIST[index];
        if (key && typeof button.setAttribute === 'function') {
          button.setAttribute('aria-label', ariaFor(key));
        }
      });
      return buttons.length;
    }

    function isOpen() { return !!(panelEl && !panelEl.hidden); }
    function setOpen(open) {
      const next = !!open;
      if (panelEl) { panelEl.hidden = !next; }
      if (toggleEl) { toggleEl.setAttribute('aria-expanded', next ? 'true' : 'false'); }
      return next;
    }
    function open() { return setOpen(true); }
    function close() { return setOpen(false); }
    function toggle() { return setOpen(!isOpen()); }

    // The toggle never moves focus, so opening the keyboard cannot steal the
    // caret away from the question box.
    dom.on(toggleEl, 'click', function (event) {
      if (event && typeof event.preventDefault === 'function') { event.preventDefault(); }
      toggle();
    });
    // Keep the caret in the textarea on touch devices: without this, tapping a
    // key focuses the button and the next insertion would land nowhere useful.
    ['mousedown', 'touchstart'].forEach(function (type) {
      dom.on(panelEl, type, function (event) {
        if (event && typeof event.preventDefault === 'function') { event.preventDefault(); }
      });
    });

    setOpen(false);
    render();
    applyLanguage();
    if (i18n && typeof i18n.subscribe === 'function') {
      // subscribe() fires immediately, so the initial language is applied here.
      unsubscribe = i18n.subscribe(function () { applyLanguage(); });
    }

    return {
      isOpen: isOpen,
      open: open,
      close: close,
      toggle: toggle,
      render: render,
      applyLanguage: applyLanguage,
      press: press,
      getKeys: function () { return buttons.slice(); },
      getKeyList: function () { return KEY_LIST.slice(); },
      getGroups: function () { return GROUPS.map(function (g) { return g.id; }); },
      isReady: function () { return !!(toggleEl && panelEl && textarea && keyboard); },
      destroy: function () {
        if (typeof unsubscribe === 'function') { unsubscribe(); }
        unsubscribe = null;
      }
    };
  }

  SMC.createMathKeyboardView = createMathKeyboardView;
  SMC.MathKeyboardView = {
    GROUPS: GROUPS,
    KEY_LIST: KEY_LIST,
    TOGGLE_SELECTOR: TOGGLE_SELECTOR,
    PANEL_SELECTOR: PANEL_SELECTOR,
    KEYS_SELECTOR: KEYS_SELECTOR
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);