/**
 * Smart Math Calculator - private admin user-management service
 * -----------------------------------------------------------------------------
 * Talks to the EXISTING backend route GET /api/admin/usernames. No second API is
 * created and the server-side ADMIN_TOKEN check is the only thing that grants
 * access: hiding this page grants nothing, and a wrong token is rejected by the
 * server, not by any code in this file.
 *
 * TOKEN HANDLING - the whole point of this module
 *   The token is typed by the admin at runtime and is kept in ONE JavaScript
 *   closure variable for the lifetime of this page. It is deliberately:
 *     * never hardcoded - there is no token literal anywhere in this file,
 *     * never written to localStorage, sessionStorage, cookies or IndexedDB,
 *     * never written to any file, and never included in a URL,
 *     * never logged to the console, and
 *     * sent in exactly one place: the Authorization header of the admin GET.
 *   `logout()` overwrites the variable with an empty string, so the token is
 *   gone from memory as soon as the admin logs out.
 *
 * Exposed API: createAdminUsersService({ endpoint, fetchImpl })
 *   -> { signIn, signOut, isSignedIn, load, getState }
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SMC = root.SMC || {};
    root.SMC.createAdminUsersService = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** The one and only message a failed sign-in may show. */
  const INVALID_MESSAGE = 'Invalid admin token.';

  const CODES = Object.freeze({
    ok: 'ok',
    invalid: 'invalid',
    network: 'network',
    notConfigured: 'not-configured'
  });

  function createAdminUsersService(options) {
    const config = options || {};
    const endpoint = typeof config.endpoint === 'string' ? config.endpoint.trim() : '';
    const fetchImpl = typeof config.fetchImpl === 'function'
      ? config.fetchImpl
      : (typeof fetch === 'function' ? fetch : null);

    /**
     * The admin token. Memory only - never persisted anywhere.
     * @type {string}
     */
    let token = '';
    let signedIn = false;
    let inFlight = null;

    // Never expose the token itself through the public API.
    function isSignedIn() {
      return signedIn;
    }

    function signOut() {
      // Overwrite rather than just resetting the flag, so the value does not
      // linger in the closure after logout.
      token = '';
      signedIn = false;
      inFlight = null;
    }

    /**
     * Stores the token in memory and verifies it against the server.
     * @param {string} value typed by the admin
     * @returns {Promise<{ok:boolean, code:string, message?:string,
     *                    total?:number, usernames?:string[]}>}
     */
    function load(value) {
      if (typeof value === 'string') {
        // Trimmed so a stray space cannot cause a confusing rejection.
        token = value.trim();
      }
      if (token === '') {
        signOut();
        return Promise.resolve({ ok: false, code: CODES.invalid, message: INVALID_MESSAGE });
      }
      if (!endpoint || typeof fetchImpl !== 'function') {
        return Promise.resolve({ ok: false, code: CODES.notConfigured, message: INVALID_MESSAGE });
      }
      if (inFlight) {
        return inFlight;
      }

      inFlight = Promise.resolve()
        .then(function () {
          return fetchImpl(endpoint, {
            method: 'GET',
            // The ONLY place the token is ever sent.
            headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
            credentials: 'omit'
          });
        })
        .then(function (response) {
          // A rejected token answers 404 (the route does not confirm itself), and
          // any other non-2xx is treated the same way: one safe message, no
          // server detail, no usernames, nothing logged.
          if (!response || response.ok !== true) {
            signOut();
            return { ok: false, code: CODES.invalid, message: INVALID_MESSAGE };
          }
          return response.json().then(function (data) {
            const list = data && Array.isArray(data.usernames) ? data.usernames : [];
            // Defensive: only plain strings are ever accepted for display.
            const usernames = list.filter(function (name) { return typeof name === 'string'; });
            const total = typeof data.total === 'number' ? data.total : usernames.length;
            signedIn = true;
            return { ok: true, code: CODES.ok, total: total, usernames: usernames };
          }, function () {
            signOut();
            return { ok: false, code: CODES.invalid, message: INVALID_MESSAGE };
          });
        }, function () {
          // A network error must not reveal anything, and must not look like a
          // wrong token being stored either.
          return { ok: false, code: CODES.network, message: INVALID_MESSAGE };
        })
        .then(function (outcome) {
          inFlight = null;
          return outcome;
        });
      return inFlight;
    }

    /** Current dashboard data, if any. Never contains the token. */
    function getState() {
      return { signedIn: signedIn, hasToken: token !== '' };
    }

    return {
      MESSAGES: { invalid: INVALID_MESSAGE },
      CODES: CODES,
      signIn: load,
      refresh: load,
      signOut: signOut,
      isSignedIn: isSignedIn,
      load: load,
      getState: getState
    };
  }

  createAdminUsersService.MESSAGES = { invalid: 'Invalid admin token.' };
  createAdminUsersService.CODES = CODES;

  return createAdminUsersService;
});