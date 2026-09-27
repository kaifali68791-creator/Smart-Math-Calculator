/**
 * Smart Math Calculator - optional frontend configuration (Part 4A)
 * -----------------------------------------------------------------------------
 * NON-SECRET configuration only. This file must NEVER contain an API key, token,
 * password or any other credential: the AI provider key lives on the backend
 * (see server/) and is read there from the environment variable
 * AI_PROVIDER_API_KEY.
 *
 * The only value here is the URL of your own AI backend. It enables the optional
 * AI fallback (Part 3B-2) for questions the local solver reports as
 * "unsupported":
 *
 *   window.SMC_CONFIG = { aiEndpoint: 'http://127.0.0.1:8787/api/solve' };
 *
 * DEFAULT: the bundled local backend (server/server.js) on this machine, so the
 * Smart Solver's AI fallback works out of the box when the backend is running.
 * A URL is not a secret - but never paste a provider key next to it.
 *
 * Point it somewhere else (or set '' to disable the fallback and stay purely
 * offline) by defining window.SMC_CONFIG BEFORE this file loads, or by editing
 * the value below. Loaded in index.html BEFORE js/app.js so app.js sees the
 * value when it calls SMC.createAIMathSolver({}).
 */
(function (root) {
  'use strict';

  var existing = root.SMC_CONFIG;
  var configuredEndpoint =
    existing && typeof existing.aiEndpoint === 'string' ? existing.aiEndpoint.trim() : '';

  // Bundled local backend URL (URL only - NEVER a key). Set to '' to keep the
  // app purely offline: unsupported questions then show the honest local state.
  var DEFAULT_ENDPOINT = 'http://127.0.0.1:8787/api/solve';

  // The endpoint actually in use, exactly as aiEndpoint resolves it below. The
  // derived endpoints MUST be built from this, not from `configuredEndpoint`:
  // when no one pre-sets window.SMC_CONFIG, configuredEndpoint is empty while
  // aiEndpoint still falls back to DEFAULT_ENDPOINT. Deriving from the empty
  // value produced '' here, so the admin page (and username sync) had no URL at
  // all and failed before any request was ever sent.
  var resolvedEndpoint = configuredEndpoint || DEFAULT_ENDPOINT;

  // Username sync endpoint (Part 5, URL only - NEVER a key). It lives here, and
  // only here, for the same reason as the AI endpoint: a URL is not a secret but
  // a credential must never appear in frontend code. Derive it from the AI
  // endpoint's origin so both features follow the same backend automatically,
  // and set it to '' to keep the app purely offline (the username then simply
  // stays on this device and is never sent anywhere).
  function defaultUsernameEndpoint() {
    if (!resolvedEndpoint) {
      return '';
    }
    var origin = resolvedEndpoint.replace(/\/api\/solve\/?$/, '');
    return origin ? origin + '/api/username' : '';
  }

  var usernameEndpoint = existing && typeof existing.usernameEndpoint === 'string'
    ? existing.usernameEndpoint.trim()
    : '';

  // Admin page endpoint (URL only - NEVER a token). The admin credential itself
  // is NEVER read here, never stored in this file and never placed in the page:
  // the admin types it at runtime and it lives only in JavaScript memory. Only
  // the URL of the existing admin route is configured, derived from the same
  // origin so it follows the same backend automatically.
  var adminEndpoint = existing && typeof existing.adminUsernamesEndpoint === 'string'
    ? existing.adminUsernamesEndpoint.trim()
    : '';

  function defaultAdminEndpoint() {
    if (!resolvedEndpoint) {
      return '';
    }
    var origin = resolvedEndpoint.replace(/\/api\/solve\/?$/, '');
    return origin ? origin + '/api/admin/usernames' : '';
  }

  root.SMC_CONFIG = {
    // Backend endpoint URL only - NEVER a key. Examples:
    //   'http://127.0.0.1:8787/api/solve'  (server/server.js on this machine)
    //   'https://<your-backend-host>/api/solve'
    //   ''                                 (AI fallback disabled, offline only)
    aiEndpoint: configuredEndpoint || DEFAULT_ENDPOINT,
    // Where the chosen username is synced (URL only - NEVER a key). Only the
    // username is ever sent there, and only when the browser is online.
    usernameEndpoint: usernameEndpoint || defaultUsernameEndpoint(),
    // URL of the EXISTING admin route, used only by the private admin.html.
    // This is a path, not a credential: the token is typed at runtime and never
    // appears in this file, in the page, or in any storage.
    adminUsernamesEndpoint: adminEndpoint || defaultAdminEndpoint()
  };

  // Convenience flag for debugging; the solver view calls aiEndpoint itself.
  root.SMC_CONFIG.hasAIEndpoint = root.SMC_CONFIG.aiEndpoint.length > 0;
  root.SMC_CONFIG.hasUsernameEndpoint = root.SMC_CONFIG.usernameEndpoint.length > 0;
})(typeof globalThis !== 'undefined' ? globalThis : this);
