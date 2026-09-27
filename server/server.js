/**
 * Smart Math Calculator - minimal secure AI backend (Part 4A)
 * -----------------------------------------------------------------------------
 * A dependency-free Node server (node:http only) for the existing browser AI
 * fallback. It does exactly three things:
 *
 *   POST /api/solve    validate -> provider (server-side key) -> normalize
 *   GET  /api/health   { status: 'ok', aiConfigured: <bool> }   (no secrets)
 *   OPTIONS /api/solve CORS preflight (AI_ALLOWED_ORIGIN, or this machine's
 *                      own http://127.0.0.1:* / file:// pages by default)
 *
 * Security posture:
 *   * No framework, no SDK, no dependency, no `eval`, no `new Function`.
 *   * The provider key lives only in process.env.AI_PROVIDER_API_KEY and is used
 *     only for the outbound provider request.
 *   * Request bodies are size-capped, JSON-validated and never echoed back.
 *   * Responses are JSON with nosniff/no-store; errors carry a safe message and
 *     a machine code only - never a stack trace, path or provider detail.
 *   * CORS is off by default (same-origin only).
 *
 * Run:  node server/server.js        (see server/.env.example and server/README.md)
 */
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { readConfig, describeConfig } = require('./config');
const { createProvider } = require('./provider');
const { createSolveHandler } = require('./solve');
const { createUsernameStore } = require('./usernames');

const SOLVE_PATH = '/api/solve';
const HEALTH_PATH = '/api/health';
/* Offline-first username feature. Registration is open; the full list is not. */
const USERNAME_PATH = '/api/username';
const USERNAMES_ADMIN_PATH = '/api/admin/usernames';

/**
 * Request headers and methods a browser page is allowed to use on a route.
 * The AI route keeps the original, unchanged defaults. Only the private admin
 * route widens them, because it is a GET that must present its bearer token:
 * `Authorization` there does not weaken that check at all, which still compares
 * the token server-side in constant time. Origins are restricted exactly as
 * before in both cases (same origin, this machine's loopback pages, or the
 * explicitly configured AI_ALLOWED_ORIGIN).
 */
const DEFAULT_CORS_METHODS = 'POST, OPTIONS';
const DEFAULT_CORS_HEADERS = 'Content-Type, Accept';
const ADMIN_CORS_METHODS = 'GET, HEAD, OPTIONS';
const ADMIN_CORS_HEADERS = 'Content-Type, Accept, Authorization';

function defaultLogger(event, fields) {
  let extra = '';
  if (fields && typeof fields === 'object') {
    try {
      extra = ' ' + JSON.stringify(fields);
    } catch (error) {
      extra = '';
    }
  }
  console.log('[ai-backend] ' + event + extra);
}

function sendJson(res, status, payload, extraHeaders) {
  if (res.writableEnded) {
    return;
  }
  const body = JSON.stringify(payload === undefined ? {} : payload);
  const headers = Object.assign(
    {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    },
    extraHeaders || {}
  );
  res.writeHead(status, headers);
  res.end(body);
}

/**
 * True for origins that are this same machine and are therefore allowed to read
 * the endpoint when AI_ALLOWED_ORIGIN is not set:
 *   * any http://127.0.0.1:<port> or http://localhost:<port> dev page
 *   * 'null' - a page opened straight from disk (file://), the README's Option A
 * With AI_ALLOWED_ORIGIN set, only that origin is accepted (unchanged).
 * Responses never contain credentials, so no origin gains access to the key.
 */
function isLocalDevOrigin(origin) {
  if (origin === 'null') {
    return true;
  }
  return /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(String(origin || ''));
}

/**
 * Adds CORS headers only for the explicitly configured origin. Without
 * AI_ALLOWED_ORIGIN the endpoint accepts same-origin calls, local dev pages on
 * this machine and directly-opened (file://) pages; any other origin is blocked
 * by the browser.
 */
function corsHeaders(config, req, cors) {
  const rules = cors || {};
  const methods = rules.methods || DEFAULT_CORS_METHODS;
  const allowHeaders = rules.headers || DEFAULT_CORS_HEADERS;
  const origin = req && req.headers ? req.headers.origin : undefined;
  if (!config.allowedOrigin) {
    if (!origin || !isLocalDevOrigin(origin)) {
      return {};
    }
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': allowHeaders,
      'Access-Control-Max-Age': '600',
      Vary: 'Origin'
    };
  }
  if (config.allowedOrigin !== '*' && origin && origin !== config.allowedOrigin) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': config.allowedOrigin === '*' ? '*' : config.allowedOrigin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Max-Age': '600',
    Vary: 'Origin'
  };
}

/** CORS rules for the private admin route (a GET carrying a bearer token). */
const ADMIN_CORS = Object.freeze({ methods: ADMIN_CORS_METHODS, headers: ADMIN_CORS_HEADERS });

/**
 * Reads the request body with a hard size cap. Oversized bodies are drained
 * (never buffered) and reported as 413 once the stream ends, so the response
 * is always delivered cleanly.
 */
function readBody(req, maxBytes, callback) {
  let size = 0;
  let tooLarge = false;
  const chunks = [];
  req.on('data', function (chunk) {
    if (tooLarge) {
      return;
    }
    size += chunk.length;
    if (size > maxBytes) {
      tooLarge = true;
      chunks.length = 0;
      req.resume();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', function () {
    if (tooLarge) {
      callback({ tooLarge: true });
      return;
    }
    callback({ body: Buffer.concat(chunks).toString('utf8') });
  });
  req.on('error', function () {
    callback({ failed: true });
  });
}


/**
 * Admin check for the username list. Constant-time comparison so the token
 * cannot be discovered by timing, and a 404 (not a 401) when no token is
 * configured, so the route is simply absent instead of answering to guesses.
 * The token is read from the server environment only - it is never in the
 * frontend, never in a response and never logged.
 */
function isAdminRequest(config, req) {
  const expected = config.adminToken;
  if (!expected) {
    return false;
  }
  const header = String((req.headers && req.headers.authorization) || '');
  const match = /^Bearer\s+(.*)$/i.exec(header.trim());
  if (!match) {
    return false;
  }
  const given = Buffer.from(match[1], 'utf8');
  const target = Buffer.from(expected, 'utf8');
  if (given.length !== target.length) {
    return false;
  }
  return crypto.timingSafeEqual(given, target);
}

/** Creates the HTTP server. `provider` and `logger` are injectable for tests. */
function createServer(options) {
  const config = options.config;
  const provider = options.provider || createProvider(config, {});
  const logger = typeof options.logger === 'function' ? options.logger : defaultLogger;
  const solveHandler = createSolveHandler({ config: config, provider: provider, logger: logger });
  // Injectable so tests use a temp file and never touch the real data file.
  const usernameStore = options.usernameStore || createUsernameStore(
    config.usernamesFile ? { file: config.usernamesFile } : {}
  );

  const server = http.createServer(function (req, res) {
    const started = Date.now();
    const method = (req.method || 'GET').toUpperCase();
    const path = String(req.url || '/').split('?')[0];

    function finish(status, payload, cors) {
      sendJson(res, status, payload, corsHeaders(config, req, cors));
      logger('request', { method: method, path: path, status: status, ms: Date.now() - started });
    }

    if (path === HEALTH_PATH) {
      if (method !== 'GET' && method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return finish(405, { error: 'Method not allowed.', code: 'method-not-allowed' });
      }
      return finish(200, { status: 'ok', aiConfigured: provider.isConfigured() });
    }

    // ---- offline-first username feature -----------------------------------
    // POST /api/username          register/sync ONE username (public, no list)
    // GET  /api/admin/usernames   the full list (server-side ADMIN_TOKEN only)
    if (path === USERNAMES_ADMIN_PATH) {
      // Preflight for the private admin page: answer it before the auth check
      // so the browser can send the Authorization header on the real request.
      if (method === 'OPTIONS') {
        res.writeHead(204, corsHeaders(config, req, ADMIN_CORS));
        return res.end();
      }
      if (method !== 'GET' && method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD, OPTIONS');
        return finish(405, { error: 'Method not allowed.', code: 'method-not-allowed' }, ADMIN_CORS);
      }
      // No token configured -> the route does not exist at all. Nothing about
      // the list, the count or the storage is revealed.
      if (!config.adminToken || !isAdminRequest(config, req)) {
        return finish(404, { error: 'Not found.', code: 'not-found' }, ADMIN_CORS);
      }
      const names = usernameStore.list();
      return finish(200, { total: names.length, usernames: names }, ADMIN_CORS);
    }

    if (path === USERNAME_PATH) {
      if (method === 'OPTIONS') {
        res.writeHead(204, corsHeaders(config, req));
        return res.end();
      }
      if (method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return finish(405, { error: 'Method not allowed.', code: 'method-not-allowed' });
      }
      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      if (contentType.indexOf('application/json') !== 0) {
        return finish(415, { error: 'Send the request as application/json.', code: 'unsupported-media-type' });
      }
      // Same hard body cap the AI endpoint uses, so a malformed or huge request
      // is dropped before it is ever parsed.
      return readBody(req, config.maxBodyBytes, function (read) {
        if (read.tooLarge) {
          return finish(413, { error: 'Request body is too large.', code: 'body-too-large' });
        }
        if (read.failed) {
          return finish(400, { error: 'Could not read the request body.', code: 'invalid-body' });
        }
        let parsed = null;
        try {
          parsed = JSON.parse(read.body);
        } catch (error) {
          return finish(400, { error: 'Request body must be valid JSON.', code: 'invalid-json' });
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return finish(400, { error: 'Invalid request.', code: 'invalid-body' });
        }
        // ONLY the username is read. Any other field (history, device, location,
        // email, ...) is ignored outright and never stored or logged.
        const result = usernameStore.add(parsed.username);
        if (!result.ok) {
          const status = result.code === 'list-full' ? 503 : 400;
          return finish(status, { error: result.message, code: result.code });
        }
        // The reply echoes ONLY the caller's own username and whether it was
        // already known. It deliberately does NOT include the list or even the
        // running total, so a normal user cannot learn anything about the others.
        return finish(200, {
          username: result.username,
          duplicate: result.duplicate
        });
      });
    }

    if (path !== SOLVE_PATH) {
      return finish(404, { error: 'Not found.', code: 'not-found' });
    }

    if (method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(config, req));
      return res.end();
    }
    if (method !== 'POST') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return finish(405, { error: 'Method not allowed.', code: 'method-not-allowed' });
    }

    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (contentType.indexOf('application/json') !== 0) {
      return finish(415, { error: 'Send the request as application/json.', code: 'unsupported-media-type' });
    }

    readBody(req, config.maxBodyBytes, function (read) {
      if (read.tooLarge) {
        return finish(413, { error: 'Request body is too large.', code: 'body-too-large' });
      }
      if (read.failed) {
        return finish(400, { error: 'Could not read the request body.', code: 'invalid-body' });
      }
      let parsed = null;
      try {
        parsed = JSON.parse(read.body);
      } catch (error) {
        return finish(400, { error: 'Request body must be valid JSON.', code: 'invalid-json' });
      }
      // The handler validates everything and never throws.
      Promise.resolve(solveHandler.handle(parsed)).then(
        function (result) { finish(result.status, result.payload); },
        function (error) {
          logger('internal-error', { message: error && error.message ? String(error.message) : 'unknown' });
          finish(500, { error: 'Internal error.', code: 'internal' });
        }
      );
    });
  });

  server.on('clientError', function (error, socket) {
    if (socket && !socket.writableEnded) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    }
  });
  // Keep a stalled client from holding a connection forever.
  server.headersTimeout = 10000;
  server.requestTimeout = 20000;

  return server;
}

/** Starts the server (used by `node server/server.js`). Resolves with it. */
function startServer(config, deps) {
  const options = deps || {};
  const logger = typeof options.logger === 'function' ? options.logger : defaultLogger;
  const provider = options.provider || createProvider(config, options);
  const server = createServer({ config: config, provider: provider, logger: logger });

  return new Promise(function (resolve, reject) {
    server.once('error', reject);
    server.listen(config.port, config.host, function () {
      const summary = describeConfig(config);
      summary.url = 'http://' + config.host + ':' + server.address().port + SOLVE_PATH;
      summary.aiConfigured = provider.isConfigured();
      logger('listening', summary);
      config.warnings.forEach(function (warning) { logger('config-warning', { message: warning }); });
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer(readConfig(process.env), {}).catch(function (error) {
    defaultLogger('startup-failed', {
      message: error && error.message ? String(error.message) : 'unknown'
    });
    process.exitCode = 1;
  });
}

module.exports = {
  createServer: createServer,
  startServer: startServer,
  readBody: readBody,
  defaultLogger: defaultLogger,
  isAdminRequest: isAdminRequest,
  SOLVE_PATH: SOLVE_PATH,
  HEALTH_PATH: HEALTH_PATH,
  USERNAME_PATH: USERNAME_PATH,
  USERNAMES_ADMIN_PATH: USERNAMES_ADMIN_PATH
};
