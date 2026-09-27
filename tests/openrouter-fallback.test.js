/**
 * OpenRouter PRIMARY / Gemini BACKUP fallback tests (Node, no framework):
 *   node tests/openrouter-fallback.test.js
 * -----------------------------------------------------------------------------
 * Everything is mocked - no test contacts Gemini or OpenRouter. Locks the
 * intended AI flow of the existing backend in BOTH provider orders:
 *   1. AI_PROVIDER=openrouter: OpenRouter is PRIMARY, Gemini is the BACKUP.
 *   2. AI_PROVIDER=gemini:     Gemini is PRIMARY, OpenRouter is the BACKUP.
 * In both orders:
 *   * primary success    -> the backup is never called,
 *   * primary failure    -> EXACTLY ONE sequential backup attempt, same prompt,
 *   * backup success     -> the existing {answer, steps} contract,
 *   * both fail          -> the existing safe fallback is preserved,
 *   * API keys never appear in responses or logs (outbound headers only).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const configModule = require(path.join(__dirname, '..', 'server', 'config.js'));
const providerModule = require(path.join(__dirname, '..', 'server', 'provider.js'));
const solveModule = require(path.join(__dirname, '..', 'server', 'solve.js'));

const readConfig = configModule.readConfig;
const describeConfig = configModule.describeConfig;
const createProvider = providerModule.createProvider;
const createSolveHandler = solveModule.createSolveHandler;
const MESSAGES = solveModule.MESSAGES;

let passed = 0;
const failures = [];
function check(name, actual, expected) {
  if (Object.is(actual, expected)) { passed += 1; }
  else { failures.push(name + ' -> expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)); }
}
function ok(name, condition, detail) {
  if (condition) { passed += 1; }
  else { failures.push(name + (detail ? ' -> ' + detail : '')); }
}
function section(title) { console.log('\n' + title); }

/** Built at runtime so no key-like literal exists anywhere in this file. */
const GEMINI_KEY = ['unit', 'test', 'gemini', 'key', '000'].join('-');
const BACKUP_KEY = ['unit', 'test', 'openrouter', 'key', '111'].join('-');
const BACKUP_MODEL = ['free', 'test', 'model'].join('/');
const LESSON = JSON.stringify({ answer: '4', steps: ['2 + 2 adds two to two'] });

function geminiWithBackup(overrides) {
  return Object.assign(readConfig({
    AI_PROVIDER: 'gemini',
    AI_PROVIDER_API_KEY: GEMINI_KEY,
    AI_REQUEST_TIMEOUT_MS: '2000',
    OPENROUTER_API_KEY: BACKUP_KEY,
    OPENROUTER_MODEL: BACKUP_MODEL
  }), overrides || {});
}
function geminiOnly(overrides) {
  return Object.assign(readConfig({
    AI_PROVIDER: 'gemini',
    AI_PROVIDER_API_KEY: GEMINI_KEY,
    AI_REQUEST_TIMEOUT_MS: '2000'
  }), overrides || {});
}
/** OpenRouter PRIMARY with a Gemini BACKUP (AI_PROVIDER=openrouter). */
function openRouterWithBackup(overrides) {
  return Object.assign(readConfig({
    AI_PROVIDER: 'openrouter',
    OPENROUTER_API_KEY: BACKUP_KEY,
    OPENROUTER_MODEL: BACKUP_MODEL,
    AI_PROVIDER_API_KEY: GEMINI_KEY,
    AI_PROVIDER_MODEL: 'gemini-3.6-flash',
    AI_REQUEST_TIMEOUT_MS: '2000'
  }), overrides || {});
}
/** OpenRouter PRIMARY with no Gemini key: the honest 503 must stay. */
function openRouterOnly(overrides) {
  return Object.assign(readConfig({
    AI_PROVIDER: 'openrouter',
    OPENROUTER_API_KEY: BACKUP_KEY,
    OPENROUTER_MODEL: BACKUP_MODEL,
    AI_REQUEST_TIMEOUT_MS: '2000'
  }), overrides || {});
}
function geminiResponse(text) {
  return { candidates: [{ content: { parts: [{ text: text }], role: 'model' } }] };
}
function openRouterResponse(text) {
  return { choices: [{ message: { role: 'assistant', content: text } }] };
}
function reply(data, status) {
  const code = status || 200;
  return {
    ok: code >= 200 && code < 300,
    status: code,
    json: function () { return Promise.resolve(data); }
  };
}
function brokenJson() {
  return { ok: true, status: 200, json: function () { return Promise.reject(new Error('garbage')); } };
}

/**
 * fetch stub routed by provider URL. Every call is recorded with its phase so
 * the tests can assert order (sequential, primary first) and exact call counts.
 */
function makeFetch(handlers, events) {
  return function fetchImpl(url, init) {
    const target = String(url).indexOf('openrouter.ai') !== -1 ? 'openrouter'
      : String(url).indexOf('generativelanguage.googleapis.com') !== -1 ? 'gemini'
        : 'other';
    events.push({ phase: 'start', target: target, url: String(url), init: init });
    let pending;
    try {
      pending = handlers[target](init, { url: String(url) });
    } catch (error) {
      pending = Promise.reject(error);
    }
    return Promise.resolve(pending).then(function (response) {
      events.push({ phase: 'end', target: target });
      return response;
    }, function (error) {
      events.push({ phase: 'end', target: target });
      throw error;
    });
  };
}
function count(events, target) {
  return events.filter(function (e) { return e.target === target && e.phase === 'start'; }).length;
}
function timeline(events) {
  return events.map(function (e) { return e.target + ':' + e.phase; }).join(' ');
}

/** Runs one full handler call: validate -> provider chain -> normalize. */
async function run(config, handlers, body) {
  const events = [];
  const logs = [];
  const provider = createProvider(config, { fetchImpl: makeFetch(handlers, events) });
  const handler = createSolveHandler({
    config: config,
    provider: provider,
    logger: function (event, fields) { logs.push({ event: event, fields: fields }); }
  });
  const result = await handler.handle(body || { question: 'What is 2 + 2?', mode: 'direct' });
  return { result: result, events: events, logs: logs, provider: provider };
}

async function main() {
  // 1) Gemini success must never touch OpenRouter
  section('Gemini success -> OpenRouter is never called');
  let out = await run(geminiWithBackup(), {
    gemini: function () { return Promise.resolve(reply(geminiResponse(LESSON))); },
    openrouter: function () { throw new Error('backup must not be called'); }
  });
  check('status 200', out.result.status, 200);
  check('contract keys stay ["answer","steps"]',
    JSON.stringify(Object.keys(out.result.payload).sort()), '["answer","steps"]');
  check('answer comes from Gemini', out.result.payload.answer, '4');
  check('OpenRouter call count = 0', count(out.events, 'openrouter'), 0);
  check('Gemini call count = 1 (no retry)', count(out.events, 'gemini'), 1);

  // 2) Gemini rate-limited -> exactly ONE sequential OpenRouter attempt
  section('Gemini 429 -> exactly ONE OpenRouter attempt with the same prompt');
  out = await run(geminiWithBackup(), {
    gemini: function () { return Promise.resolve(reply({}, 429)); },
    openrouter: function (init, meta) {
      const sent = JSON.parse(init.body);
      ok('backup uses the chat completions endpoint',
        meta.url.indexOf('/api/v1/chat/completions') !== -1, meta.url);
      check('backup model comes from env config', sent.model, BACKUP_MODEL);
      check('backup receives a system message', sent.messages[0].role, 'system');
      check('outbound Bearer credential header',
        init.headers.Authorization === 'Bearer ' + BACKUP_KEY, true);
      ok('Gemini key never travels to the backup',
        init.body.indexOf(GEMINI_KEY) === -1, 'gemini key leaked into backup body');
      return Promise.resolve(reply(openRouterResponse(LESSON)));
    }
  });
  check('calls are sequential: Gemini fully finished first', timeline(out.events),
    'gemini:start gemini:end openrouter:start openrouter:end');
  check('exactly one attempt per provider',
    count(out.events, 'gemini') + count(out.events, 'openrouter'), 2);
  const geminiSent = JSON.parse(out.events[0].init.body);
  const backupSent = JSON.parse(out.events[2].init.body);
  check('identical system prompt goes to both providers',
    backupSent.messages[0].content, geminiSent.systemInstruction.parts[0].text);
  check('identical user prompt goes to both providers',
    backupSent.messages[1].content, geminiSent.contents[0].parts[0].text);
  check('status 200 via the backup', out.result.status, 200);
  check('answer from the backup', out.result.payload.answer, '4');
  check('steps preserved through the contract', out.result.payload.steps.length, 1);
  ok('no backup key in the response', JSON.stringify(out.result).indexOf(BACKUP_KEY) === -1);
  ok('no backup key in the logs', JSON.stringify(out.logs).indexOf(BACKUP_KEY) === -1);
  ok('no Gemini key in the logs', JSON.stringify(out.logs).indexOf(GEMINI_KEY) === -1);
  ok('no Gemini key in the backup outbound body',
    out.events[2].init.body.indexOf(GEMINI_KEY) === -1);

  // 3) Gemini timeout -> one backup attempt
  section('Gemini timeout -> one OpenRouter attempt');
  out = await run(geminiWithBackup({ requestTimeoutMs: 250 }), {
    gemini: function () { return new Promise(function () { /* never settles */ }); },
    openrouter: function () { return Promise.resolve(reply(openRouterResponse(LESSON))); }
  });
  check('timeout falls back to the backup', out.result.status, 200);
  check('one Gemini attempt (gave up, no retry)', count(out.events, 'gemini'), 1);
  check('one OpenRouter attempt', count(out.events, 'openrouter'), 1);

  // 4) auth failure and malformed reply are recoverable too
  section('Gemini auth failure / malformed reply -> backup succeeds');
  out = await run(geminiWithBackup(), {
    gemini: function () { return Promise.resolve(reply({}, 401)); },
    openrouter: function () { return Promise.resolve(reply(openRouterResponse(LESSON))); }
  });
  check('auth failure falls back to the backup', out.result.status, 200);
  out = await run(geminiWithBackup(), {
    gemini: function () { return Promise.resolve(brokenJson()); },
    openrouter: function () { return Promise.resolve(reply(openRouterResponse(LESSON))); }
  });
  check('malformed reply falls back to the backup', out.result.status, 200);
  check('still only one backup attempt', count(out.events, 'openrouter'), 1);

  // 5) both fail -> the existing safe fallback is preserved
  section('Both providers fail -> safe fallback preserved');
  out = await run(geminiWithBackup(), {
    gemini: function () { return Promise.resolve(reply({}, 429)); },
    openrouter: function () { return Promise.resolve(reply({}, 500)); }
  });
  check('primary status preserved', out.result.status, 429);
  check('primary machine code preserved', out.result.payload.code, 'provider-rate-limit');
  check('safe message preserved', out.result.payload.error, MESSAGES.unavailable);
  check('backup was tried exactly once (no retry)', count(out.events, 'openrouter'), 1);
  ok('no backup key in the failure payload', JSON.stringify(out.result).indexOf(BACKUP_KEY) === -1);
  ok('no backup key in the logs', JSON.stringify(out.logs).indexOf(BACKUP_KEY) === -1);
  ok('no Gemini key in the logs', JSON.stringify(out.logs).indexOf(GEMINI_KEY) === -1);

  // 6) Gemini not configured -> the honest 503 stays, no backup call
  section('Gemini not configured -> NO OpenRouter call (503 preserved)');
  out = await run(readConfig({ AI_PROVIDER: 'gemini', OPENROUTER_API_KEY: BACKUP_KEY }), {
    gemini: function () { throw new Error('primary must not be called'); },
    openrouter: function () { throw new Error('backup must not be called'); }
  });
  check('status 503', out.result.status, 503);
  check('code not-configured', out.result.payload.code, 'not-configured');
  check('safe message unchanged', out.result.payload.error, MESSAGES.unavailable);
  check('OpenRouter call count = 0', count(out.events, 'openrouter'), 0);

  // 7) no backup key -> Gemini-only behaviour is byte-for-byte unchanged
  section('No OPENROUTER_API_KEY -> Gemini-only behaviour unchanged');
  out = await run(geminiOnly(), {
    gemini: function () { return Promise.resolve(reply({}, 429)); },
    openrouter: function () { throw new Error('backup must not be called'); }
  });
  check('status 429 passes through', out.result.status, 429);
  check('OpenRouter call count = 0', count(out.events, 'openrouter'), 0);
  check('adapter stays plain gemini', out.provider.name, 'gemini');

  // 8) configuration: env-driven backup, Gemini settings preserved
  section('Configuration (env-driven backup, Gemini preserved)');
  const chained = createProvider(geminiWithBackup(), {
    fetchImpl: function () { return Promise.reject(new Error('unused')); }
  });
  check('chain adapter is named for both providers', chained.name, 'gemini+openrouter');

  const noKey = readConfig({});
  check('backup is absent without OPENROUTER_API_KEY', noKey.backup, null);
  check('describe reports no backup key', describeConfig(noKey).hasBackupKey, false);

  const withKey = geminiWithBackup();
  check('backup provider id', withKey.backup.provider, 'openrouter');
  check('backup model from env', withKey.backup.model, BACKUP_MODEL);
  check('backup endpoint', withKey.backup.providerUrl, configModule.OPENROUTER_URL);
  check('backup response path', withKey.backup.responsePath, 'choices.0.message.content');
  check('describe reports the backup key as a boolean only',
    describeConfig(withKey).hasBackupKey, true);
  ok('describe never contains the backup key',
    JSON.stringify(describeConfig(withKey)).indexOf(BACKUP_KEY) === -1);
  ok('describe never contains the Gemini key',
    JSON.stringify(describeConfig(withKey)).indexOf(GEMINI_KEY) === -1);

  const defaultModel = readConfig({ OPENROUTER_API_KEY: BACKUP_KEY });
  check('default backup model is the :free default',
    defaultModel.backup.model, configModule.OPENROUTER_DEFAULT_MODEL);

  const preserved = readConfig({
    AI_PROVIDER: 'gemini',
    AI_PROVIDER_API_KEY: GEMINI_KEY,
    AI_PROVIDER_MODEL: 'gemini-3.6-flash',
    OPENROUTER_API_KEY: BACKUP_KEY
  });
  check('Gemini provider selection preserved', preserved.provider, 'gemini');
  check('Gemini primary model preserved', preserved.model, 'gemini-3.6-flash');
  check('Gemini primary endpoint preserved',
    preserved.providerUrl.indexOf('generativelanguage.googleapis.com') !== -1, true);
  check('Gemini primary key preserved', preserved.apiKey, GEMINI_KEY);
  check('Gemini response path preserved',
    preserved.responsePath, 'candidates.0.content.parts.0.text');

  // 9) reversed order: OpenRouter PRIMARY, Gemini BACKUP
  section('OpenRouter success -> Gemini is NEVER called (OpenRouter is PRIMARY)');
  out = await run(openRouterWithBackup(), {
    openrouter: function () { return Promise.resolve(reply(openRouterResponse(LESSON))); },
    gemini: function () { throw new Error('backup must not be called'); }
  });
  check('status 200', out.result.status, 200);
  check('contract keys stay ["answer","steps"]',
    JSON.stringify(Object.keys(out.result.payload).sort()), '["answer","steps"]');
  check('answer comes from OpenRouter', out.result.payload.answer, '4');
  check('Gemini call count = 0', count(out.events, 'gemini'), 0);
  check('OpenRouter call count = 1 (no retry)', count(out.events, 'openrouter'), 1);
  check('adapter is the OpenRouter-first chain', out.provider.name, 'openrouter+gemini');

  section('OpenRouter 429 -> exactly ONE sequential Gemini attempt, same prompt');
  out = await run(openRouterWithBackup(), {
    openrouter: function () { return Promise.resolve(reply({}, 429)); },
    gemini: function (init, meta) {
      const sent = JSON.parse(init.body);
      ok('backup uses the Gemini generateContent endpoint',
        meta.url.indexOf('/models/') !== -1 && meta.url.indexOf(':generateContent') !== -1, meta.url);
      check('outbound Gemini credential header', init.headers['x-goog-api-key'], GEMINI_KEY);
      ok('OpenRouter key never travels to the backup',
        init.body.indexOf(BACKUP_KEY) === -1, 'openrouter key leaked into backup body');
      return Promise.resolve(reply(geminiResponse(LESSON)));
    }
  });
  check('calls are sequential: OpenRouter fully finished first', timeline(out.events),
    'openrouter:start openrouter:end gemini:start gemini:end');
  check('exactly one attempt per provider',
    count(out.events, 'gemini') + count(out.events, 'openrouter'), 2);
  const orSent = JSON.parse(out.events[0].init.body);
  const orGeminiSent = JSON.parse(out.events[2].init.body);
  check('identical system prompt goes to both providers',
    orGeminiSent.systemInstruction.parts[0].text, orSent.messages[0].content);
  check('primary OpenRouter model from env', orSent.model, BACKUP_MODEL);
  check('fallback returns the {answer, steps} contract', out.result.payload.answer, '4');

  section('OpenRouter auth failure / timeout -> one Gemini attempt');
  out = await run(openRouterWithBackup(), {
    openrouter: function () { return Promise.resolve(reply({}, 401)); },
    gemini: function () { return Promise.resolve(reply(geminiResponse(LESSON))); }
  });
  check('auth failure falls back to Gemini', out.result.status, 200);
  out = await run(openRouterWithBackup({ requestTimeoutMs: 250 }), {
    openrouter: function () { return new Promise(function () { /* never settles */ }); },
    gemini: function () { return Promise.resolve(reply(geminiResponse(LESSON))); }
  });
  check('timeout falls back to Gemini', out.result.status, 200);
  check('one OpenRouter attempt (no retry)', count(out.events, 'openrouter'), 1);
  check('one Gemini attempt', count(out.events, 'gemini'), 1);

  section('Both providers fail (OpenRouter primary) -> safe fallback preserved');
  out = await run(openRouterWithBackup(), {
    openrouter: function () { return Promise.resolve(reply({}, 429)); },
    gemini: function () { return Promise.resolve(reply({}, 500)); }
  });
  check('primary status preserved', out.result.status, 429);
  check('primary machine code preserved', out.result.payload.code, 'provider-rate-limit');
  check('safe message preserved', out.result.payload.error, MESSAGES.unavailable);
  check('Gemini was tried exactly once (no retry)', count(out.events, 'gemini'), 1);
  ok('no OpenRouter key in the failure payload', JSON.stringify(out.result).indexOf(BACKUP_KEY) === -1);
  ok('no Gemini key in the failure payload', JSON.stringify(out.result).indexOf(GEMINI_KEY) === -1);

  section('Gemini key missing -> NO Gemini call, OpenRouter-only chain');
  out = await run(openRouterOnly(), {
    openrouter: function () { return Promise.resolve(reply(openRouterResponse(LESSON))); },
    gemini: function () { throw new Error('backup must not be called'); }
  });
  check('status 200 with the OpenRouter-only adapter', out.result.status, 200);
  check('adapter stays plain openrouter', out.provider.name, 'openrouter');
  check('no backup config without AI_PROVIDER_API_KEY', openRouterOnly().backup, null);

  section('OpenRouter not configured -> honest 503, no Gemini call');
  out = await run(readConfig({ AI_PROVIDER: 'openrouter', AI_PROVIDER_API_KEY: GEMINI_KEY }), {
    openrouter: function () { throw new Error('primary must not be called'); },
    gemini: function () { throw new Error('backup must not be called'); }
  });
  check('status 503', out.result.status, 503);
  check('code not-configured', out.result.payload.code, 'not-configured');
  check('safe message unchanged', out.result.payload.error, MESSAGES.unavailable);

  section('Configuration (OpenRouter primary from env, Gemini as backup)');
  const orConfig = openRouterWithBackup();
  check('provider is openrouter', orConfig.provider, 'openrouter');
  check('primary model from OPENROUTER_MODEL', orConfig.model, BACKUP_MODEL);
  check('primary endpoint', orConfig.providerUrl, configModule.OPENROUTER_URL);
  check('primary response path', orConfig.responsePath, 'choices.0.message.content');
  check('primary secret is the OpenRouter key', orConfig.apiKey, BACKUP_KEY);
  check('backup provider id', orConfig.backup.provider, 'gemini');
  check('Gemini backup model from env', orConfig.backup.model, 'gemini-3.6-flash');
  check('Gemini backup endpoint is derived from the model',
    orConfig.backup.providerUrl.indexOf('generativelanguage.googleapis.com') !== -1, true);
  check('Gemini backup response path', orConfig.backup.responsePath, 'candidates.0.content.parts.0.text');
  check('Gemini backup secret is AI_PROVIDER_API_KEY', orConfig.backup.apiKey, GEMINI_KEY);
  check('default OpenRouter model is the :free default',
    readConfig({ OPENROUTER_API_KEY: BACKUP_KEY, AI_PROVIDER: 'openrouter' }).model,
    configModule.OPENROUTER_DEFAULT_MODEL);
  ok('describe never contains the OpenRouter key',
    JSON.stringify(describeConfig(orConfig)).indexOf(BACKUP_KEY) === -1);
  ok('describe never contains the Gemini key',
    JSON.stringify(describeConfig(orConfig)).indexOf(GEMINI_KEY) === -1);

  // 10) security scan: the touched sources hold no key material, the frontend
  //    never learned about any of this
  section('Security: no key material in the touched sources');
  const read = function (rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); };
  const scanFiles = ['server/config.js', 'server/provider.js', 'server/solve.js',
    'server/.env.example', 'tests/openrouter-fallback.test.js'];
  const hits = [];
  scanFiles.forEach(function (rel) {
    const src = read(rel);
    if (/sk-[A-Za-z0-9]{16,}/.test(src)) { hits.push(rel + ' (key literal)'); }
    if (/API_KEY\s*=\s*['"][^'"\s]{8,}/.test(src)) { hits.push(rel + ' (key assignment)'); }
  });
  check('no key literal in the touched sources', hits.join(', '), '');
  check('frontend never mentions the backup provider',
    read('js/services/ai-math-solver.js').toLowerCase().indexOf('openrouter'), -1);
  check('solve handler (prompt/contract) untouched by provider choice',
    typeof solveModule.normalizeAIResult, 'function');
}

(async function () {
  try {
    await main();
  } catch (error) {
    failures.push('EXCEPTION -> ' + (error && error.stack ? error.stack : String(error)));
  }
  console.log('\n============================================================');
  console.log(passed + ' checks passed, ' + failures.length + ' failed');
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
  }
  console.log('All OpenRouter fallback tests passed.');
})();
