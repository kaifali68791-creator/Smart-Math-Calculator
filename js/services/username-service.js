/**
 * Smart Math Calculator - username service (offline first)
 * -----------------------------------------------------------------------------
 * Collects ONE thing: a username. Never an email, password, phone, date of
 * birth, location, GPS, IP, device id, user agent, browser info, calculator
 * history, solver history or AI conversation - none of it is read, stored or
 * sent, and the request body below is built here and nowhere else.
 *
 * OFFLINE FIRST
 *   The username is written to the existing local storage service first, so the
 *   app works with no network at all and the name survives a refresh, a browser
 *   restart and an internet loss. Synchronizing is a background nicety, never a
 *   requirement: setUsername() always succeeds locally and reports `pending`
 *   instead of failing.
 *
 * SYNC
 *   When a sync endpoint is configured AND the browser reports being online, the
 *   one-name payload { username } is POSTed once. Success clears the pending
 *   flag. Any failure (offline, network error, non-2xx, timeout) leaves the flag
 *   set and returns quietly - the app is never blocked and never shows an error
 *   for it. sync() is safe to call repeatedly: overlapping calls share one
 *   in-flight request, and the online/focus events respect a cooldown, so the
 *   server is never spammed.
 *
 * Exposed API: createUsernameService({ storage, endpoint, fetchImpl, isOffline })
 *   -> { getUsername, setUsername, hasUsername, isPending, needsUsername,
 *        sync, subscribe, MESSAGES, CODES, MAX_LENGTH }
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SMC = root.SMC || {};
    root.SMC.createUsernameService = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'username:v1';
  /** Kept identical to server/usernames.js MAX_LENGTH so the two agree. */
  const MAX_LENGTH = 24;
  const SYNC_TIMEOUT_MS = 8000;
  /** Minimum gap between two sync attempts, so nothing ever spams the server. */
  const SYNC_COOLDOWN_MS = 15000;

  const MESSAGES = Object.freeze({
    required: 'Please choose a username.',
    tooLong: 'That username is too long. Please use ' + MAX_LENGTH + ' characters or fewer.',
    invalid: 'Use letters, digits, single spaces, dot, dash or underscore only.'
  });

  const CODES = Object.freeze({
    required: 'username-required',
    tooLong: 'username-too-long',
    invalid: 'username-invalid',
    pending: 'pending',
    synced: 'synced'
  });

  /** Control characters become a space, then every run of spaces collapses to one. */
  function normalize(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Letters and digits of any script, plus space, dot, dash, underscore. */
  const ALLOWED_CHARACTERS = /^[\p{L}\p{N} ._-]+$/u;

  function validate(value) {
    const username = normalize(value);
    if (username === '') {
      return { ok: false, code: CODES.required, message: MESSAGES.required };
    }
    if (username.length > MAX_LENGTH) {
      return { ok: false, code: CODES.tooLong, message: MESSAGES.tooLong };
    }
    if (!ALLOWED_CHARACTERS.test(username)) {
      return { ok: false, code: CODES.invalid, message: MESSAGES.invalid };
    }
    return { ok: true, username: username };
  }

  /**
   * @param {{get:Function, set:Function, remove:Function}} storage
   * @param {{endpoint?:string, fetchImpl?:Function, isOffline?:Function,
   *          window?:object, now?:Function}} [options]
   */
  function createUsernameService(storageService, options) {
    const config = options || {};
    // Phase 2C: optional i18n used ONLY for the three validation messages the
    // popup shows. Storage keys, sync behaviour and the request body are
    // untouched, and without i18n the original English messages are returned.
    const i18n = config.i18n || null;
    const message = function (key, fallback) {
      if (!i18n) { return fallback; }
      const value = i18n.t(key);
      return typeof value === 'string' && value !== '' ? value : fallback;
    };
    const host = config.window || (typeof globalThis !== 'undefined' ? globalThis : null);
    const endpoint = typeof config.endpoint === 'string' ? config.endpoint.trim() : '';
    const fetchImpl = typeof config.fetchImpl === 'function'
      ? config.fetchImpl
      : (typeof fetch === 'function' ? fetch : null);
    const now = typeof config.now === 'function' ? config.now : function () { return Date.now(); };
    // Offline detection is injectable so tests never depend on the real browser.
    const isOffline = typeof config.isOffline === 'function'
      ? config.isOffline
      : function () {
        return !!(host && host.navigator && host.navigator.onLine === false);
      };
    const listeners = [];
    let inFlight = null;
    let lastAttemptAt = 0;
    let timer = null;

    // Stored shape (smc:username:v1): { username, pending }
    function read() {
      const stored = storageService.get(STORAGE_KEY, null);
      if (!stored || typeof stored !== 'object' || typeof stored.username !== 'string') {
        return { username: '', pending: false };
      }
      return { username: stored.username, pending: stored.pending === true };
    }

    let state = read();

    function persist() {
      storageService.set(STORAGE_KEY, { username: state.username, pending: state.pending });
    }

    function notify() {
      for (let i = 0; i < listeners.length; i += 1) {
        listeners[i](getUsername(), state.pending);
      }
    }

    function getUsername() {
      return state.username;
    }

    function hasUsername() {
      return state.username !== '';
    }

    function needsUsername() {
      return state.username === '';
    }

    function isPending() {
      return state.pending;
    }

    function isConfigured() {
      return !!endpoint && typeof fetchImpl === 'function';
    }

    /**
     * Saves the username LOCALLY first, always. A sync is attempted afterwards
     * but never blocks or fails the save.
     * @returns {{ok:boolean, code?:string, message?:string, username?:string,
     *            pending?:boolean}}
     */
    function setUsername(value) {
      const checked = validate(value);
      if (!checked.ok) {
        // The message the popup shows is translated; the code is not, so the
        // service contract and every existing test stay identical.
        checked.message = message('username.error.' + checked.code, checked.message);
        return { ok: false, code: checked.code, message: checked.message };
      }
      const changed = checked.username !== state.username;
      state = { username: checked.username, pending: true };
      persist();
      notify();
      if (changed) {
        lastAttemptAt = 0;
      }
      sync();
      return { ok: true, username: state.username, pending: state.pending };
    }

    function clear() {
      state = { username: '', pending: false };
      storageService.remove(STORAGE_KEY);
      notify();
    }

    /**
     * POSTs ONLY { username } to the configured endpoint. Never rejects.
     * Resolves { ok, code } where code is 'synced' | 'pending' |
     * 'not-configured' | 'offline' | 'error'.
     */
    function sync() {
      if (inFlight) {
        return inFlight;
      }
      if (!hasUsername() || !state.pending) {
        return Promise.resolve({ ok: true, code: CODES.synced });
      }
      if (!isConfigured()) {
        // No endpoint (or no fetch): stay pending, silently.
        return Promise.resolve({ ok: false, code: 'not-configured' });
      }
      if (isOffline()) {
        return Promise.resolve({ ok: false, code: 'offline' });
      }
      if (lastAttemptAt !== 0 && now() - lastAttemptAt < SYNC_COOLDOWN_MS) {
        return Promise.resolve({ ok: false, code: CODES.pending });
      }
      lastAttemptAt = now();

      // The one and only payload. Nothing else is ever attached to it.
      const payload = JSON.stringify({ username: state.username });

      inFlight = new Promise(function (resolve) {
        let settled = false;

        function settle(outcome) {
          if (settled) {
            return;
          }
          settled = true;
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
          inFlight = null;
          if (outcome.ok && state.username) {
            state = { username: state.username, pending: false };
            persist();
            notify();
          }
          resolve(outcome);
        }

        const init = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: payload
        };
        if (typeof AbortController === 'function') {
          const controller = new AbortController();
          init.signal = controller.signal;
          timer = setTimeout(function () {
            try { controller.abort(); } catch (error) { /* ignore */ }
            settle({ ok: false, code: 'error' });
          }, SYNC_TIMEOUT_MS);
        }

        Promise.resolve()
          .then(function () { return fetchImpl(endpoint, init); })
          .then(function (response) {
            // Only the HTTP status is needed. The body is not parsed: it can
            // contain nothing but the caller's own username and the new total.
            if (!response || response.ok !== true) {
              settle({ ok: false, code: 'error' });
              return;
            }
            settle({ ok: true, code: CODES.synced });
          }, function () {
            settle({ ok: false, code: 'error' });
          });
      });
      return inFlight;
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return function noop() {};
      }
      listeners.push(listener);
      listener(getUsername(), state.pending);
      return function unsubscribe() {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    }

    /** Retries a pending sync when the browser says it is back online. */
    function bindConnectivity() {
      if (!host || typeof host.addEventListener !== 'function') {
        return;
      }
      ['online', 'focus'].forEach(function (type) {
        host.addEventListener(type, function () {
          if (state.pending) {
            lastAttemptAt = 0;
            sync();
          }
        });
      });
    }

    // A pending name from a previous offline session retries on the next load.
    if (state.pending) {
      lastAttemptAt = 0;
    }

    return {
      MAX_LENGTH: MAX_LENGTH,
      MESSAGES: MESSAGES,
      CODES: CODES,
      getUsername: getUsername,
      setUsername: setUsername,
      clear: clear,
      hasUsername: hasUsername,
      needsUsername: needsUsername,
      isPending: isPending,
      isConfigured: isConfigured,
      validate: validate,
      sync: sync,
      subscribe: subscribe,
      bindConnectivity: bindConnectivity
    };
  }

  createUsernameService.MAX_LENGTH = MAX_LENGTH;
  createUsernameService.MESSAGES = MESSAGES;
  createUsernameService.CODES = CODES;

  return createUsernameService;
});