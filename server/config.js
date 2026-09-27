/**
 * Smart Math Calculator - AI backend configuration (Part 4A)
 * -----------------------------------------------------------------------------
 * Reads the backend configuration from the SERVER environment only. The one
 * secret (AI_PROVIDER_API_KEY) is never written to disk by this project, never
 * logged, never returned to the browser and never accepted from a request.
 *
 * Provider selection is deliberately provider-agnostic:
 *   AI_PROVIDER=none     (default) -> stage 2 stays honestly unavailable (503)
 *   AI_PROVIDER=generic  -> POST the chat-style JSON body built in provider.js
 *                           to AI_PROVIDER_URL using AI_PROVIDER_API_KEY
 *   AI_PROVIDER=gemini   -> POST the Gemini generateContent JSON body built in
 *                           provider.js to
 *                           https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
 *                           using AI_PROVIDER_API_KEY (x-goog-api-key header)
 *   AI_PROVIDER=openrouter -> PRIMARY OpenRouter Chat Completions POST built with
 *                           the generic adapter, using OPENROUTER_API_KEY and
 *                           OPENROUTER_MODEL; Gemini becomes the BACKUP (see
 *                           createFallbackProvider)
 *
 * No SDK, no dependency, no vendor lock-in: any provider that accepts a
 * chat-style JSON request and returns the model text at AI_PROVIDER_RESPONSE_PATH
 * works without code changes. Gemini uses its own adapter because its request
 * shape and auth header differ (see provider.js).
 */
'use strict';

/** Defaults - every value can be overridden with an environment variable. */
const DEFAULTS = Object.freeze({
  host: '127.0.0.1',
  port: 8787,
  provider: 'none',
  providerUrl: '',
  model: '',
  authHeader: 'Authorization',
  authScheme: 'Bearer',
  responsePath: 'choices.0.message.content',
  // 'full' mode asks the model for a complete lesson, which takes longer to
  // generate than a one-line answer; 30s keeps slow providers usable while
  // AI_REQUEST_TIMEOUT_MS can still raise it up to the 60s clamp.
  requestTimeoutMs: 30000,
  maxQuestionLength: 2000,
  allowedOrigin: '',
  maxBodyBytes: 8192
});

/** Supported adapters. 'none' keeps the AI fallback honestly unavailable. */
const PROVIDERS = Object.freeze(['none', 'generic', 'gemini', 'openrouter']);

/**
 * Gemini endpoint base. Public endpoint, not a secret.
 * Full URL: GEMINI_BASE_URL + '/models/' + <model> + ':generateContent'.
 */
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
/** Default Gemini model (stable, verified 2026-09-26). Overridable via AI_PROVIDER_MODEL. */
const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash';
/** Gemini response path for the model text (no override needed for Gemini). */
const GEMINI_RESPONSE_PATH = 'candidates.0.content.parts.0.text';

/**
 * OpenRouter BACKUP (never primary): Chat Completions endpoint. Public
 * endpoint, not a secret. Full URL: OPENROUTER_URL.
 */
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Backup model. Environment configurable via OPENROUTER_MODEL, not hard-coded elsewhere. */
const OPENROUTER_DEFAULT_MODEL = 'qwen/qwen3.8-27b:free';
/** Backup credential: a separate server-side environment variable. */
const OPENROUTER_SECRET_ENV = 'OPENROUTER_API_KEY';
/** OpenRouter is OpenAI-compatible: the model text sits at choices.0.message.content. */
const OPENROUTER_RESPONSE_PATH = 'choices.0.message.content';

/** A server-side environment variable, nothing else. */
const SECRET_ENV = 'AI_PROVIDER_API_KEY';

/**
 * ADMIN_TOKEN - server-side only, read from the environment and never sent to the
 * browser. It is the ONLY thing that unlocks the username list. While it is
 * empty the admin route answers 404, so the list is unreachable by default
 * rather than protected by a guessable default. Compared in constant time.
 */
const ADMIN_SECRET_ENV = 'ADMIN_TOKEN';
/** Where the username list is stored (a file, because there is no database). */
const USERNAMES_FILE_ENV = 'USERNAMES_FILE';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(text(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

/** AI_PROVIDER_EXTRA_JSON: extra body fields for a specific provider. */
function readExtraBody(value, warnings) {
  const raw = text(value);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    warnings.push('AI_PROVIDER_EXTRA_JSON must be a JSON object -> ignored');
  } catch (error) {
    warnings.push('AI_PROVIDER_EXTRA_JSON is not valid JSON -> ignored');
  }
  return null;
}

/**
 * Builds the immutable configuration object for the server. `env` is normally
 * process.env, but the tests inject their own object.
 */
function readConfig(env) {
  const source = env || {};
  const warnings = [];

  const requestedProvider = text(source.AI_PROVIDER).toLowerCase();
  let provider = DEFAULTS.provider;
  if (requestedProvider) {
    if (PROVIDERS.indexOf(requestedProvider) === -1) {
      warnings.push('AI_PROVIDER "' + requestedProvider + '" is not supported -> using "none"');
    } else {
      provider = requestedProvider;
    }
  }

  const providerUrl = text(source.AI_PROVIDER_URL);
  const providerApiKey = text(source[SECRET_ENV]);
  // The primary secret. Starts as AI_PROVIDER_API_KEY (Gemini/generic) and is
  // replaced by the OpenRouter key only when OpenRouter is the primary.
  let apiKey = providerApiKey;

  // Gemini: endpoint is derived from the model, so AI_PROVIDER_URL is optional.
  // An explicit AI_PROVIDER_URL still wins (custom endpoint / emulator).
  let model = text(source.AI_PROVIDER_MODEL);
  let resolvedUrl = providerUrl;
  let responsePath = text(source.AI_PROVIDER_RESPONSE_PATH) || DEFAULTS.responsePath;
  if (provider === 'gemini') {
    if (!model) {
      model = GEMINI_DEFAULT_MODEL;
    }
    if (!resolvedUrl) {
      resolvedUrl = GEMINI_BASE_URL + '/models/' + model + ':generateContent';
    }
    responsePath = GEMINI_RESPONSE_PATH;
  }
  if (provider === 'openrouter') {
    // OpenRouter is OpenAI-compatible chat-style JSON, so the primary fields are
    // exactly the generic-adapter fields. Credentials and model stay env-owned.
    model = text(source.OPENROUTER_MODEL) || OPENROUTER_DEFAULT_MODEL;
    resolvedUrl = text(source.OPENROUTER_URL) || OPENROUTER_URL;
    responsePath = OPENROUTER_RESPONSE_PATH;
    apiKey = text(source[OPENROUTER_SECRET_ENV]);
  }

  const requestTimeoutMs = integer(
    source.AI_REQUEST_TIMEOUT_MS,
    DEFAULTS.requestTimeoutMs,
    1000,
    60000
  );

  // BACKUP - exactly one provider, never chosen by AI_PROVIDER, and present
  // only when its own key is set, so the chain stays disabled unless it is
  // explicitly configured. The primary settings above are not touched by this.
  // With AI_PROVIDER=openrouter the roles swap: Gemini is the backup.
  const backupApiKey = text(source[OPENROUTER_SECRET_ENV]);
  const geminiModel = text(source.AI_PROVIDER_MODEL) || GEMINI_DEFAULT_MODEL;
  const openrouter = backupApiKey
    ? {
        provider: 'openrouter',
        providerUrl: text(source.OPENROUTER_URL) || OPENROUTER_URL,
        apiKey: backupApiKey,
        model: text(source.OPENROUTER_MODEL) || OPENROUTER_DEFAULT_MODEL,
        authHeader: DEFAULTS.authHeader,
        authScheme: DEFAULTS.authScheme,
        responsePath: OPENROUTER_RESPONSE_PATH,
        extraBody: null,
        requestTimeoutMs: requestTimeoutMs
      }
    : null;
  const gemini = providerApiKey
    ? {
        provider: 'gemini',
        providerUrl: text(source.AI_PROVIDER_URL) || (GEMINI_BASE_URL + '/models/' + geminiModel + ':generateContent'),
        apiKey: providerApiKey,
        model: geminiModel,
        // No auth header fields: the Gemini adapter always sends x-goog-api-key.
        responsePath: GEMINI_RESPONSE_PATH,
        extraBody: null,
        requestTimeoutMs: requestTimeoutMs
      }
    : null;
  // Exactly one backup: OpenRouter backs up Gemini, Gemini backs up OpenRouter.
  const backup = provider === 'openrouter' ? gemini : openrouter;

  const authScheme =
    source.AI_PROVIDER_AUTH_SCHEME === undefined
      ? DEFAULTS.authScheme
      : text(source.AI_PROVIDER_AUTH_SCHEME);

  return {
    host: text(source.HOST) || DEFAULTS.host,
    port: integer(source.PORT, DEFAULTS.port, 1, 65535),
    provider: provider,
    providerUrl: resolvedUrl,
    // The primary secret. Read from the environment, never from a request body.
    apiKey: apiKey,
    // The single BACKUP config (or null) - server-side only, never in a response.
    backup: backup,
    model: model,
    authHeader: text(source.AI_PROVIDER_AUTH_HEADER) || DEFAULTS.authHeader,
    authScheme: authScheme,
    responsePath: responsePath,
    extraBody: readExtraBody(source.AI_PROVIDER_EXTRA_JSON, warnings),
    requestTimeoutMs: requestTimeoutMs,
    maxQuestionLength: integer(
      source.AI_MAX_QUESTION_LENGTH,
      DEFAULTS.maxQuestionLength,
      50,
      4000
    ),
    allowedOrigin: text(source.AI_ALLOWED_ORIGIN),
    maxBodyBytes: DEFAULTS.maxBodyBytes,
    // Admin credential for the username list ONLY: server-side, never returned
    // in a response and never present in the frontend. Empty = list disabled.
    adminToken: text(source[ADMIN_SECRET_ENV]),
    // File that holds the username list. Empty = the store's own default path.
    usernamesFile: text(source[USERNAMES_FILE_ENV]),
    // True only when a provider adapter has everything it needs.
    isConfigured: provider !== 'none' && !!resolvedUrl && !!apiKey,
    warnings: warnings
  };
}

/** Hostname of the provider URL - never the query string, never the key. */
function providerHost(providerUrl) {
  if (!providerUrl) {
    return '';
  }
  try {
    return new URL(providerUrl).host;
  } catch (error) {
    return '<unparseable-url>';
  }
}

/**
 * Safe summary for logs and /api/health style introspection. Returns booleans
 * and non-secret values only: the API key itself is never included.
 */
function describeConfig(config) {
  const current = config || {};
  return {
    host: current.host,
    port: current.port,
    provider: current.provider,
    providerHost: providerHost(current.providerUrl),
    model: current.model || '',
    hasApiKey: !!current.apiKey,
    hasBackupKey: !!(current.backup && current.backup.apiKey),
    requestTimeoutMs: current.requestTimeoutMs,
    maxQuestionLength: current.maxQuestionLength,
    allowedOrigin: current.allowedOrigin || '<same-origin only>',
    // A boolean only - the token itself is never part of any summary.
    hasAdminToken: !!current.adminToken
  };
}

module.exports = {
  DEFAULTS: DEFAULTS,
  PROVIDERS: PROVIDERS,
  SECRET_ENV: SECRET_ENV,
  ADMIN_SECRET_ENV: ADMIN_SECRET_ENV,
  USERNAMES_FILE_ENV: USERNAMES_FILE_ENV,
  GEMINI_BASE_URL: GEMINI_BASE_URL,
  GEMINI_DEFAULT_MODEL: GEMINI_DEFAULT_MODEL,
  GEMINI_RESPONSE_PATH: GEMINI_RESPONSE_PATH,
  OPENROUTER_URL: OPENROUTER_URL,
  OPENROUTER_DEFAULT_MODEL: OPENROUTER_DEFAULT_MODEL,
  OPENROUTER_SECRET_ENV: OPENROUTER_SECRET_ENV,
  OPENROUTER_RESPONSE_PATH: OPENROUTER_RESPONSE_PATH,
  readConfig: readConfig,
  describeConfig: describeConfig,
  providerHost: providerHost
};
