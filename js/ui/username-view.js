/**
 * Smart Math Calculator - username view (first-run popup + greeting)
 * -----------------------------------------------------------------------------
 * Two additions only, both built from the existing design tokens and the
 * existing SMC.dom helpers:
 *   1. a small first-run popup that asks for ONE username, and
 *   2. a small "Welcome, <username>" indicator in the existing header.
 *
 * Nothing else in the UI changes: no existing button, label, navigation item,
 * calculator panel, solver panel, converter, age tool or about section is
 * touched, removed or renamed.
 *
 * PRIVACY
 *   The popup has exactly one input and one button. There is no field for an
 *   email, password, phone, date of birth, gender, location or address, and
 *   nothing about the device, browser, history or questions is read or shown.
 *   The popup is a plain div (no <dialog>), it is shown only when no username is
 *   stored, and every update goes through textContent - never innerHTML - so a
 *   username can never become markup.
 *
 * Exposed API: createUsernameView({ service, root? })
 *   -> { init, open, close, isOpen, getUsername }
 */
(function (root) {
  'use strict';

  const SMC = (root.SMC = root.SMC || {});
  const dom = SMC.dom;

  function createUsernameView(options) {
    const config = options || {};
    const service = config.service;
    // Phase 2C: optional i18n. Without it every string below is the original
    // English literal, so behaviour and existing tests are unchanged.
    const i18n = config.i18n || null;
    const t = function (key, fallback, params) {
      if (!i18n) { return fallback; }
      const value = params ? i18n.t(key, params) : i18n.t(key);
      return typeof value === 'string' && value !== '' ? value : fallback;
    };

    const overlay = dom.qs('[data-username-overlay]');
    const form = dom.qs('[data-username-form]');
    const input = dom.qs('[data-username-input]');
    const submit = dom.qs('[data-username-submit]');
    const errorBox = dom.qs('[data-username-error]');
    const greeting = dom.qs('[data-username-greeting]');

    // Without the service (or without the markup) the app simply runs as before.
    if (!service || !overlay || !form || !input || !submit) {
      return null;
    }

    function showError(message) {
      dom.setText(errorBox, message);
      dom.show(errorBox);
    }

    function clearError() {
      dom.setText(errorBox, '');
      dom.hide(errorBox);
    }

    /** Writes the greeting, or hides it when there is no username yet. */
    function renderGreeting() {
      if (!greeting) {
        return;
      }
      const username = service.getUsername();
      if (username === '') {
        dom.setText(greeting, '');
        dom.hide(greeting);
        return;
      }
      dom.setText(greeting, t('username.greeting', 'Welcome, ' + username, [username]));
      dom.show(greeting);
    }

    function isOpen() {
      return overlay.hidden === false;
    }

    function open() {
      clearError();
      dom.show(overlay);
      input.value = '';
      // The field is the only thing the user has to touch, so focus it.
      if (typeof input.focus === 'function') {
        input.focus();
      }
    }

    function close() {
      clearError();
      dom.hide(overlay);
    }

    function submitForm() {
      const outcome = service.setUsername(input.value);
      if (!outcome.ok) {
        // Validation only - the app is never blocked and nothing is sent.
        showError(outcome.message);
        return;
      }
      close();
      renderGreeting();
    }

    dom.on(form, 'submit', function (event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      submitForm();
    });
    // Enter inside the field submits the form; no extra button behaviour needed.
    dom.on(input, 'input', clearError);

    /**
     * Shows the popup on a genuine first run only. When a username is already
     * stored the popup stays hidden and the greeting is rendered instead.
     */
    function init() {
      service.subscribe(function () {
        renderGreeting();
      });
      if (service.needsUsername()) {
        open();
      } else {
        close();
        renderGreeting();
        // A name saved while offline is retried quietly in the background.
        service.sync();
      }
      service.bindConnectivity();
    }

    return {
      init: init,
      open: open,
      close: close,
      isOpen: isOpen,
      renderGreeting: renderGreeting,
      getUsername: service.getUsername
    };
  }

  SMC.createUsernameView = createUsernameView;
})(typeof globalThis !== 'undefined' ? globalThis : this);