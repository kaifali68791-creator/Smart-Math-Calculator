/**
 * Smart Math Calculator - provider-agnostic AI adapter (Part 4A)
 * -----------------------------------------------------------------------------
 * The browser never talks to an AI provider and never holds a key. This module
 * runs on the server, adds the provider credential from the environment and
 * returns the RAW model text (still untrusted) to server/solve.js.
 *
 * Adapters:
 *   'none'    (default) - not configured; every request reports 503
 *   'generic'           - chat-style JSON POST to AI_PROVIDER_URL
 *   'gemini'            - Google Gemini generateContent REST (x-goog-api-key);
 *                         endpoint derived from the model, text at
 *                         candidates.0.content.parts.0.text
 *
 * PRIMARY + BACKUP: the provider order is env-driven through AI_PROVIDER.
 *   AI_PROVIDER=openrouter -> OpenRouter is the PRIMARY and Gemini the BACKUP.
 *   AI_PROVIDER=gemini     -> Gemini is the PRIMARY and OpenRouter the BACKUP.
 * After a recoverable primary failure (bad auth, provider error, malformed
 * reply, rate limit or timeout) the backup is tried EXACTLY ONCE with the
 * same prompt. The two calls are sequential, never parallel and never
 * retried; when the backup fails too, the original primary error is returned
 * so the existing safe fallback behaviour is preserved.
 *
 * The generic adapter needs no SDK and no vendor package: the request shape is
 * `{ ...AI_PROVIDER_EXTRA_JSON, model?, messages: [{system},{user}] }` and the
 * model text is read from AI_PROVIDER_RESPONSE_PATH (dotted path, numeric
 * segments allowed, e.g. `choices.0.message.content`).
 *
 * The Gemini adapter needs no SDK either: it POSTs
 * `{ ...AI_PROVIDER_EXTRA_JSON, systemInstruction: {parts:[{text}]},
 *    contents: [{role:'user', parts:[{text}]}] }` and reads the model text at
 * `candidates.0.content.parts.0.text`. The API key travels in the
 * `x-goog-api-key` header (the documented REST credential mechanism), and a
 * 400 with reason API_KEY_INVALID is classified as an auth failure.
 *
 * Security notes:
 *   * The key is added here, server-side only, as an outbound request header.
 *   * Nothing from the request body can override the system prompt or the URL.
 *   * Errors are classified, never forwarded verbatim to the browser.
 *
 * Testability: `fetchImpl` (and optionally AbortControllerImpl) can be injected,
 * so tests never contact a real provider.
 */
'use strict';

/** Result of a provider call that could not produce usable text. */
function providerError(status, code) {
  return { ok: false, status: status, code: code };
}

/** Reads a dotted path (`choices.0.message.content`) from a parsed JSON value. */
function readPath(source, path) {
  const parts = String(path || '').split('.').filter(function (part) { return !!part; });
  let current = source;
  for (let i = 0; i < parts.length; i += 1) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[parts[i]];
  }
  return current;
}

/** `Authorization: Bearer <key>` by default; the scheme can be blanked. */
function authHeaderValue(config) {
  const scheme = typeof config.authScheme === 'string' ? config.authScheme.trim() : '';
  return scheme ? scheme + ' ' + config.apiKey : config.apiKey;
}

/**
 * Builds the outbound body. AI_PROVIDER_EXTRA_JSON is applied first, then the
 * configured model and finally the server-built messages, so a provider-specific
 * extra field can never replace the mathematics prompt.
 */
function buildProviderBody(config, system, user) {
  const body = {};
  if (config.extraBody && typeof config.extraBody === 'object') {
    Object.keys(config.extraBody).forEach(function (key) {
      body[key] = config.extraBody[key];
    });
  }
  if (config.model) {
    body.model = config.model;
  }
  body.messages = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
  return body;
}

/** Google Gemini REST credential header (documented; replaces Authorization). */
const GEMINI_AUTH_HEADER = 'x-goog-api-key';

/** True when an error payload means "the key is wrong", whatever its wrapper. */
function geminiBodySaysBadKey(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const seen = [];
  const queue = [data];
  while (queue.length > 0) {
    const current = queue.shift();
    if (typeof current === 'string') {
      if (/api[_-]?key[_-]?invalid/i.test(current)) {
        return true;
      }
      continue;
    }
    if (!current || typeof current !== 'object' || seen.indexOf(current) !== -1) {
      continue;
    }
    seen.push(current);
    const values = Array.isArray(current)
      ? current
      : Object.keys(current).map(function (key) { return current[key]; });
    for (let i = 0; i < values.length; i += 1) {
      queue.push(values[i]);
    }
  }
  return false;
}

/**
 * Builds the Gemini outbound body. AI_PROVIDER_EXTRA_JSON is applied first,
 * then the server-built systemInstruction and contents, so a provider-specific
 * extra field can never replace the mathematics prompt.
 */
function buildGeminiBody(config, system, user) {
  const body = {};
  if (config.extraBody && typeof config.extraBody === 'object') {
    Object.keys(config.extraBody).forEach(function (key) {
      body[key] = config.extraBody[key];
    });
  }
  body.systemInstruction = { parts: [{ text: system }] };
  body.contents = [{ role: 'user', parts: [{ text: user }] }];
  return body;
}

/** Used when no provider is configured: honest 503, no network, no fake answer. */
function createUnavailableProvider() {
  return {
    name: 'none',
    isConfigured: function () { return false; },
    solve: function () {
      return Promise.resolve(providerError(503, 'not-configured'));
    }
  };
}

function createGenericProvider(config, deps) {
  const fetchImpl = deps.fetchImpl;
  const AbortControllerImpl = deps.AbortControllerImpl;
  const timeoutMs = config.requestTimeoutMs;

  function isConfigured() {
    return !!config.providerUrl && !!config.apiKey && typeof fetchImpl === 'function';
  }

  /** POSTs the prompts and returns the raw model text (or a classified error). */
  async function solve(request) {
    const payload = buildProviderBody(config, request.system, request.user);
    let timer = null;
    let controller = null;
    try {
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
      // The credential is attached here and only here - outbound, server-side.
      headers[config.authHeader] = authHeaderValue(config);
      const init = { method: 'POST', headers: headers, body: JSON.stringify(payload) };
      if (typeof AbortControllerImpl === 'function') {
        controller = new AbortControllerImpl();
        init.signal = controller.signal;
      }
      const timeoutPromise = new Promise(function (_, rejectOnTimeout) {
        timer = setTimeout(function () {
          if (controller) {
            try { controller.abort(); } catch (error) { /* ignore */ }
          }
          const timeoutError = new Error('AI provider timed out');
          timeoutError.smcTimeout = true;
          rejectOnTimeout(timeoutError);
        }, timeoutMs);
      });

      const response = await Promise.race([fetchImpl(config.providerUrl, init), timeoutPromise]);
      const status = response && typeof response.status === 'number' ? response.status : 0;
      const ok = !!(response && (response.ok === true || (status >= 200 && status < 300)));
      if (!ok) {
        if (status === 401 || status === 403) { return providerError(502, 'provider-auth'); }
        if (status === 429) { return providerError(429, 'provider-rate-limit'); }
        return providerError(502, 'provider-error');
      }

      let data = null;
      try {
        if (!response || typeof response.json !== 'function') {
          return providerError(502, 'provider-malformed');
        }
        data = await response.json();
      } catch (error) {
        return providerError(502, 'provider-malformed');
      }

      const text = readPath(data, config.responsePath);
      if (typeof text !== 'string' || !text.trim()) {
        return providerError(502, 'provider-malformed');
      }
      return { ok: true, text: text, providerStatus: status };
    } catch (error) {
      if (error && error.smcTimeout) { return providerError(504, 'provider-timeout'); }
      return providerError(502, 'provider-error');
    } finally {
      if (timer !== null) { clearTimeout(timer); }
    }
  }

  return { name: 'generic', isConfigured: isConfigured, solve: solve };
}

/**
 * Google Gemini adapter: generateContent REST, `x-goog-api-key` credential,
 * model text at candidates.0.content.parts.0.text. Error mapping matches the
 * generic adapter except that a 400 carrying API_KEY_INVALID (Google reports
 * bad REST keys as 400, verified 2026-09-26) is also a safe 502 provider-auth.
 */
function createGeminiProvider(config, deps) {
  const fetchImpl = deps.fetchImpl;
  const AbortControllerImpl = deps.AbortControllerImpl;
  const timeoutMs = config.requestTimeoutMs;

  function isConfigured() {
    return !!config.providerUrl && !!config.apiKey && typeof fetchImpl === 'function';
  }

  /** POSTs the prompts and returns the raw model text (or a classified error). */
  async function solve(request) {
    const payload = buildGeminiBody(config, request.system, request.user);
    let timer = null;
    let controller = null;
    try {
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
      // The credential is attached here and only here - outbound, server-side.
      headers[GEMINI_AUTH_HEADER] = config.apiKey;
      const init = { method: 'POST', headers: headers, body: JSON.stringify(payload) };
      if (typeof AbortControllerImpl === 'function') {
        controller = new AbortControllerImpl();
        init.signal = controller.signal;
      }
      const timeoutPromise = new Promise(function (_, rejectOnTimeout) {
        timer = setTimeout(function () {
          if (controller) {
            try { controller.abort(); } catch (error) { /* ignore */ }
          }
          const timeoutError = new Error('AI provider timed out');
          timeoutError.smcTimeout = true;
          rejectOnTimeout(timeoutError);
        }, timeoutMs);
      });

      const response = await Promise.race([fetchImpl(config.providerUrl, init), timeoutPromise]);
      const status = response && typeof response.status === 'number' ? response.status : 0;
      const ok = !!(response && (response.ok === true || (status >= 200 && status < 300)));

      let data = null;
      try {
        if (!response || typeof response.json !== 'function') {
          return providerError(502, 'provider-malformed');
        }
        data = await response.json();
      } catch (error) {
        if (!ok) {
          return providerError(status === 429 ? 429 : 502,
            status === 429 ? 'provider-rate-limit' : 'provider-error');
        }
        return providerError(502, 'provider-malformed');
      }

      if (!ok) {
        if (status === 401 || status === 403) { return providerError(502, 'provider-auth'); }
        if (status === 429) { return providerError(429, 'provider-rate-limit'); }
        // Google reports an invalid REST key as HTTP 400 API_KEY_INVALID.
        if (status === 400 && geminiBodySaysBadKey(data)) {
          return providerError(502, 'provider-auth');
        }
        return providerError(502, 'provider-error');
      }

      const text = readPath(data, config.responsePath);
      if (typeof text !== 'string' || !text.trim()) {
        return providerError(502, 'provider-malformed');
      }
      return { ok: true, text: text, providerStatus: status };
    } catch (error) {
      if (error && error.smcTimeout) { return providerError(504, 'provider-timeout'); }
      return providerError(502, 'provider-error');
    } finally {
      if (timer !== null) { clearTimeout(timer); }
    }
  }

  return { name: 'gemini', isConfigured: isConfigured, solve: solve };
}

/**
 * OpenRouter BACKUP adapter. OpenRouter's Chat Completions API is chat-style
 * and OpenAI-compatible, so the proven generic adapter is reused exactly as
 * it is (Bearer Authorization header, model in the body, model text at
 * choices.0.message.content, same timeout and error classification). Only the
 * adapter name differs so logs can tell the two providers apart.
 */
function createOpenRouterProvider(config, deps) {
  const adapter = createGenericProvider(config, deps);
  return { name: 'openrouter', isConfigured: adapter.isConfigured, solve: adapter.solve };
}

/**
 * Primary + backup chain: ONE primary attempt, then at most ONE backup
 * attempt after a recoverable primary failure, strictly sequential.
 *   * primary success    -> returned immediately, the backup is never called,
 *   * recoverable failure-> the backup is tried once with the SAME request
 *                           (identical system/user prompt),
 *   * backup success     -> its result is returned through the same contract,
 *   * backup failure     -> the ORIGINAL primary error is returned, so the
 *                           status/code/message the app already emits is kept,
 *   * 'not-configured'   -> never triggers a backup (stays an honest 503).
 */
const BACKUP_TRIGGER_CODES = [
  'provider-auth',
  'provider-error',
  'provider-malformed',
  'provider-rate-limit',
  'provider-timeout'
];

function createFallbackProvider(primary, backup) {
  function isConfigured() {
    return primary.isConfigured();
  }

  async function solve(request) {
    let primaryResult = null;
    try {
      primaryResult = await primary.solve(request);
    } catch (error) {
      primaryResult = providerError(502, 'provider-error');
    }
    if (primaryResult && primaryResult.ok === true) {
      return primaryResult;
    }
    const primaryCode = (primaryResult && primaryResult.code) || 'provider-error';
    if (BACKUP_TRIGGER_CODES.indexOf(primaryCode) === -1) {
      return primaryResult || providerError(502, 'provider-error');
    }
    let backupResult = null;
    try {
      backupResult = await backup.solve(request);
    } catch (error) {
      backupResult = providerError(502, 'provider-error');
    }
    if (backupResult && backupResult.ok === true) {
      return backupResult;
    }
    return primaryResult;
  }

  return { name: primary.name + '+' + backup.name, isConfigured: isConfigured, solve: solve };
}

/**
 * Creates the provider adapter for a configuration. `deps.fetchImpl` is optional
 * (tests inject a stub; production uses the global fetch of Node 18+).
 */
function createProvider(config, deps) {
  const options = deps || {};
  const fetchImpl =
    typeof options.fetchImpl === 'function'
      ? options.fetchImpl
      : typeof fetch === 'function'
        ? function () { return fetch.apply(null, arguments); }
        : null;
  const AbortControllerImpl =
    typeof options.AbortControllerImpl === 'function'
      ? options.AbortControllerImpl
      : typeof AbortController === 'function'
        ? AbortController
        : null;

  if (config && config.provider === 'generic') {
    return createGenericProvider(config, {
      fetchImpl: fetchImpl,
      AbortControllerImpl: AbortControllerImpl
    });
  }
  if (config && config.provider === 'openrouter') {
    // OpenRouter is the PRIMARY here. It is OpenAI-compatible chat-style JSON,
    // so the proven generic adapter is reused exactly as it is; only the adapter
    // name differs so logs can tell the providers apart.
    const primary = createOpenRouterProvider(config, {
      fetchImpl: fetchImpl,
      AbortControllerImpl: AbortControllerImpl
    });
    // Attach the Gemini BACKUP ONLY when both sides are ready. Otherwise the
    // OpenRouter-only behaviour stays exactly as it is.
    if (config.backup) {
      const backup = createGeminiProvider(config.backup, {
        fetchImpl: fetchImpl,
        AbortControllerImpl: AbortControllerImpl
      });
      if (primary.isConfigured() && backup.isConfigured()) {
        return createFallbackProvider(primary, backup);
      }
    }
    return primary;
  }
  if (config && config.provider === 'gemini') {
    const primary = createGeminiProvider(config, {
      fetchImpl: fetchImpl,
      AbortControllerImpl: AbortControllerImpl
    });
    // Attach the OpenRouter backup ONLY when both sides are ready. Otherwise
    // the Gemini-only behaviour stays exactly as it was.
    if (config.backup) {
      const backup = createOpenRouterProvider(config.backup, {
        fetchImpl: fetchImpl,
        AbortControllerImpl: AbortControllerImpl
      });
      if (primary.isConfigured() && backup.isConfigured()) {
        return createFallbackProvider(primary, backup);
      }
    }
    return primary;
  }
  return createUnavailableProvider();
}

module.exports = {
  createProvider: createProvider,
  createGenericProvider: createGenericProvider,
  createGeminiProvider: createGeminiProvider,
  createOpenRouterProvider: createOpenRouterProvider,
  createFallbackProvider: createFallbackProvider,
  createUnavailableProvider: createUnavailableProvider,
  buildProviderBody: buildProviderBody,
  buildGeminiBody: buildGeminiBody,
  geminiBodySaysBadKey: geminiBodySaysBadKey,
  GEMINI_AUTH_HEADER: GEMINI_AUTH_HEADER,
  readPath: readPath,
  authHeaderValue: authHeaderValue
};
