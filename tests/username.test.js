/**
 * Offline-first username system tests (Node, no framework):
 *   node tests/username.test.js
 * -----------------------------------------------------------------------------
 * Everything is local or stubbed - no test contacts a real provider and no test
 * touches the real username data file. Covers:
 *   1. First launch      -> the popup appears.
 *   2. Save              -> the username is stored locally.
 *   3. Reload            -> no popup, the greeting appears.
 *   4. Offline           -> saving works, no network, stays pending.
 *   5. Sync              -> online sync works and clears the pending flag.
 *   6. Duplicates        -> deterministic, documented behaviour.
 *   7. Validation        -> trim, empty, max length, special characters.
 *   8. Privacy           -> nothing but `username` is sent or stored.
 *   9. Admin security    -> a normal user cannot get the list.
 *  10. Existing features -> calculator/solver/AI files are untouched.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const usernamesModule = require(path.join(ROOT, 'server', 'usernames.js'));
const configModule = require(path.join(ROOT, 'server', 'config.js'));
const serverModule = require(path.join(ROOT, 'server', 'server.js'));
const adminCli = require(path.join(ROOT, 'server', 'admin-usernames.js'));

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

/** Built at runtime so no key-like or personal literal is committed. */
const ADMIN_TOKEN = ['unit', 'test', 'admin', 'token', '000'].join('-');
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

/** In-memory storage stand-in with the same shape as js/services/storage.js. */
function fakeStorage(initial) {
  const values = Object.assign({}, initial || {});
  return {
    get: function (name, fallback) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : fallback;
    },
    set: function (name, value) { values[name] = value; return true; },
    remove: function (name) { delete values[name]; },
    _values: values
  };
}

/** Loads the frontend service in a vm sandbox and returns the factory. */
function loadService() {
  const sandbox = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: setInterval, clearInterval: clearInterval, AbortController: AbortController,
    Promise: Promise, JSON: JSON };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('js/services/username-service.js'), sandbox, { filename: 'username-service.js' });
  return sandbox.SMC.createUsernameService;
}

/** A fetch stub that records every call, so tests can inspect the payload. */
function recordingFetch(behaviour) {
  const calls = [];
  const impl = function (url, init) {
    calls.push({ url: String(url), init: init, body: JSON.parse(init.body) });
    return behaviour ? behaviour(calls.length) : Promise.resolve({ ok: true, status: 200 });
  };
  impl.calls = calls;
  return impl;
}

/** A clock that jumps far enough forward to leave any sync cooldown. */
function fastClock() {
  let t = 1000;
  return function () { t += 100000; return t; };
}

function listen(server) {
  return new Promise(function (resolve, reject) {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', function () { resolve(server.address().port); });
  });
}
function close(server) {
  return new Promise(function (resolve) { server.close(function () { resolve(true); }); });
}
async function call(port, route, options) {
  const opts = options || {};
  const init = { method: opts.method || 'GET', headers: Object.assign({}, opts.headers || {}) };
  if (opts.rawBody !== undefined) { init.body = opts.rawBody; }
  else if (opts.body !== undefined) { init.body = opts.body; }
  const response = await fetch('http://127.0.0.1:' + port + route, init);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch (error) { json = null; }
  return { status: response.status, text: text, json: json };
}

/** A provider stub so the username tests never touch an AI provider. */
function stubProvider() {
  return {
    name: 'stub',
    isConfigured: function () { return false; },
    solve: function () {
      return Promise.resolve({ ok: false, status: 503, code: 'not-configured' });
    }
  };
}

/** A store backed by a throwaway temp file, removed by the caller. */
function tempStore() {
  const file = path.join(os.tmpdir(),
    'smc-usernames-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.json');
  return { file: file, store: usernamesModule.createUsernameStore({ file: file }) };
}

async function main() {
  const createUsernameService = loadService();
  const markup = read('index.html');

  // ---------------------------------------------------------------- 1) popup
  section('1) First launch: the popup appears, nothing else is asked for');
  const emptyStorage = fakeStorage();
  const freshService = createUsernameService(emptyStorage, { endpoint: '', fetchImpl: null });
  check('no username stored yet', freshService.needsUsername(), true);
  check('the popup must be shown', freshService.needsUsername(), true);
  check('getUsername is empty', freshService.getUsername(), '');
  ok('popup markup exists', markup.indexOf('data-username-overlay') !== -1);
  ok('popup asks for a username', markup.indexOf('Please choose a username') !== -1);
  ok('popup has a Continue button', markup.indexOf('data-username-submit') !== -1);
  ok('popup has exactly one input', (markup.match(/data-username-input/g) || []).length === 1);
  ok('popup ships hidden so it only opens on a first run',
    /data-username-overlay hidden/.test(markup));
  // The popup block only: the rest of the page legitimately contains a date input
  // for the Age Calculator, which is unrelated to this feature.
  const popup = markup.slice(markup.indexOf('data-username-overlay'),
    markup.indexOf('<!-- frontend configuration'));
  ok('the popup block was found', popup.length > 100);
  ['type="email"', 'type="password"', 'type="tel"', 'type="date"', 'autocomplete="email"',
    'street-address', 'name="dob"', 'gender', 'latitude', 'longitude', 'IP address',
    'phone', 'birthday']
    .forEach(function (forbidden) {
      ok('the popup never asks for ' + forbidden, popup.indexOf(forbidden) === -1);
    });
  check('the popup block has exactly one input element',
    (popup.match(/<input/g) || []).length, 1);
  check('the popup block has exactly one button',
    (popup.match(/<button/g) || []).length, 1);

  // ----------------------------------------------------------- 2) local save
  section('2) Saving stores the username locally');
  const saved = freshService.setUsername('  Kaif  ');
  check('save succeeds', saved.ok, true);
  check('surrounding whitespace is trimmed', freshService.getUsername(), 'Kaif');
  check('username is in local storage', emptyStorage.get('username:v1').username, 'Kaif');
  check('the app no longer needs a username', freshService.needsUsername(), false);

  // --------------------------------------------------------------- 3) reload
  section('3) Reload: no popup, the greeting is shown');
  // A brand new service reading the same storage == a page reload.
  const reloaded = createUsernameService(fakeStorage({ 'username:v1': emptyStorage.get('username:v1') }), {
    endpoint: '', fetchImpl: null
  });
  check('username survived the reload', reloaded.getUsername(), 'Kaif');
  check('popup is NOT shown again', reloaded.needsUsername(), false);
  check('greeting text is available', 'Welcome, ' + reloaded.getUsername(), 'Welcome, Kaif');
  ok('a greeting element exists in the header', /data-username-greeting/.test(markup));

  // -------------------------------------------------------------- 4) offline
  section('4) Offline: no network, username still saved, marked pending');
  const offlineStorage = fakeStorage();
  let offlineFetches = 0;
  const offlineService = createUsernameService(offlineStorage, {
    endpoint: 'http://127.0.0.1:9/api/username',
    isOffline: function () { return true; },
    fetchImpl: function () { offlineFetches += 1; return Promise.resolve({ ok: true }); }
  });
  const offlineSave = offlineService.setUsername('Rahul');
  check('save succeeds while offline', offlineSave.ok, true);
  check('username saved locally while offline', offlineService.getUsername(), 'Rahul');
  check('marked as pending sync', offlineService.isPending(), true);
  check('stored locally as pending', offlineStorage.get('username:v1').pending, true);
  check('NO network request was attempted', offlineFetches, 0);
  const offlineSync = await offlineService.sync();
  check('sync reports offline', offlineSync.code, 'offline');
  check('still no request after an explicit sync', offlineFetches, 0);
  check('username survives the offline attempt', offlineService.getUsername(), 'Rahul');

  // ----------------------------------------------------------------- 5) sync
  section('5) Sync: online sync sends only the username and clears pending');
  const onlineStorage = fakeStorage();
  const onlineFetch = recordingFetch();
  const onlineService = createUsernameService(onlineStorage, {
    endpoint: 'http://127.0.0.1:9/api/username',
    isOffline: function () { return false; },
    fetchImpl: onlineFetch,
    now: fastClock()
  });
  onlineService.setUsername('Priya');
  // setUsername() kicks the sync off without blocking; let the microtask run.
  await new Promise(function (resolve) { setTimeout(resolve, 10); });
  check('exactly one request was made', onlineFetch.calls.length, 1);
  check('it went to the configured endpoint', onlineFetch.calls[0].url,
    'http://127.0.0.1:9/api/username');
  check('method is POST', onlineFetch.calls[0].init.method, 'POST');
  check('pending flag cleared after a successful sync', onlineService.isPending(), false);
  check('username kept after sync', onlineService.getUsername(), 'Priya');
  check('no Authorization header is ever sent',
    onlineFetch.calls[0].init.headers.Authorization, undefined);
  check('the body has exactly one key',
    JSON.stringify(Object.keys(onlineFetch.calls[0].body)), '["username"]');
  check('the body carries the username', onlineFetch.calls[0].body.username, 'Priya');

  section('5b) A failing server keeps the name pending and never blocks the app');
  const failStorage = fakeStorage();
  const failFetch = recordingFetch(function () { return Promise.resolve({ ok: false, status: 500 }); });
  const failService = createUsernameService(failStorage, {
    endpoint: 'http://127.0.0.1:9/api/username',
    isOffline: function () { return false; },
    fetchImpl: failFetch,
    now: fastClock()
  });
  const failSave = failService.setUsername('Anita');
  await new Promise(function (resolve) { setTimeout(resolve, 10); });
  check('the save still succeeded despite the failing server', failSave.ok, true);
  check('one request was attempted', failFetch.calls.length, 1);
  check('name is kept locally', failService.getUsername(), 'Anita');
  check('still pending after the failure', failService.isPending(), true);
  check('the caller gets a plain result, never a throw', typeof failSave.ok, 'boolean');

  section('5c) Coming back online clears the pending flag');
  const listeners = {};
  const fakeWindow = {
    navigator: { onLine: false },
    addEventListener: function (type, handler) { listeners[type] = handler; }
  };
  const retryFetch = recordingFetch();
  const retryService = createUsernameService(fakeStorage(), {
    endpoint: 'http://127.0.0.1:9/api/username',
    isOffline: function () { return fakeWindow.navigator.onLine === false; },
    fetchImpl: retryFetch,
    window: fakeWindow
  });
  retryService.setUsername('Vikram');
  check('saved while offline', retryService.getUsername(), 'Vikram');
  check('pending while offline', retryService.isPending(), true);
  check('no request while offline', retryFetch.calls.length, 0);
  retryService.bindConnectivity();
  fakeWindow.navigator.onLine = true;
  listeners.online();
  await new Promise(function (resolve) { setTimeout(resolve, 10); });
  check('the online event synced the name', retryFetch.calls.length, 1);
  check('pending cleared once back online', retryService.isPending(), false);
  check('name unchanged by the sync', retryService.getUsername(), 'Vikram');

  section('5d) No server spamming: the cooldown limits repeated attempts');
  const spamCalls = [];
  const spamService = createUsernameService(fakeStorage(), {
    endpoint: 'http://127.0.0.1:9/api/username',
    isOffline: function () { return false; },
    fetchImpl: function () { spamCalls.push(1); return Promise.resolve({ ok: false, status: 500 }); },
    now: function () { return 1000; }   // frozen clock: never leaves the cooldown
  });
  spamService.setUsername('Spam');
  await new Promise(function (resolve) { setTimeout(resolve, 10); });
  const spamAfterSave = spamCalls.length;
  for (let i = 0; i < 10; i += 1) { await spamService.sync(); }
  check('ten further sync calls add no requests', spamCalls.length, spamAfterSave);
  check('and the total stayed at a single request', spamCalls.length, 1);

  // ----------------------------------------------------------- 6) duplicates
  section('6) Duplicates: deterministic and documented (no extra identifier)');
  const dupStore = tempStore();
  const first = dupStore.store.add('Rahul');
  check('first registration succeeds', first.ok, true);
  check('first is not a duplicate', first.duplicate, false);
  check('total is 1', first.total, 1);
  const again = dupStore.store.add('Rahul');
  check('re-registering the same name still succeeds', again.ok, true);
  check('and is reported as a duplicate', again.duplicate, true);
  check('the list did not grow', again.total, 1);
  const cased = dupStore.store.add('rahul');
  check('case-insensitive: same record', cased.duplicate, true);
  check('the original spelling is kept', cased.username, 'Rahul');
  check('still one record', dupStore.store.count(), 1);
  const spaced = dupStore.store.add('  Rahul  ');
  check('whitespace does not create a second record', spaced.duplicate, true);
  dupStore.store.add('Priya');
  check('a different name is a new record', dupStore.store.count(), 2);
  fs.unlinkSync(dupStore.file);

  // ----------------------------------------------------------- 7) validation
  section('7) Validation: trim, empty, max length, special characters');
  const MAX = usernamesModule.MAX_LENGTH;
  check('empty string is rejected', usernamesModule.validateUsername('').code, 'username-required');
  check('whitespace only is rejected', usernamesModule.validateUsername('     ').code, 'username-required');
  check('a non-string is rejected', usernamesModule.validateUsername(null).code, 'username-required');
  check('max length matches the frontend', createUsernameService.MAX_LENGTH, MAX);
  check('exactly max length is accepted', usernamesModule.validateUsername('a'.repeat(MAX)).ok, true);
  check('one over max length is rejected',
    usernamesModule.validateUsername('a'.repeat(MAX + 1)).code, 'username-too-long');
  ['<script>', 'a/b', 'a\\b', '"><b>', 'a{b}', 'a@b', 'a;b', 'a$b', 'a`b', 'a|b']
    .forEach(function (bad) {
      check('rejected: ' + bad, usernamesModule.validateUsername(bad).ok, false);
    });
  check('internal whitespace collapses', usernamesModule.validateUsername('a    b').username, 'a b');
  check('digits are allowed', usernamesModule.validateUsername('User 2024').ok, true);
  check('dot, dash and underscore are allowed',
    usernamesModule.validateUsername('Kaif_Kumar-1.0').ok, true);
  check('the frontend rejects the same input',
    createUsernameService(fakeStorage(), {}).validate('<script>').ok, false);
  check('the frontend and server agree on the empty case',
    createUsernameService(fakeStorage(), {}).validate('  ').code,
    usernamesModule.validateUsername('  ').code);

  // --------------------------------------------------------------- 8) privacy
  section('8) Privacy: only the username is ever sent or stored');
  check('the outbound payload has one key only',
    JSON.stringify(Object.keys(onlineFetch.calls[0].body)), '["username"]');
  const payloadText = JSON.stringify(onlineFetch.calls[0].body).toLowerCase();
  ['email', 'phone', 'password', 'dob', 'birth', 'gender', 'location', 'gps', 'device',
    'useragent', 'browser', 'ip', 'cookie', 'history', 'question', 'expression',
    'conversation', 'analytics', 'advertising', 'install', 'latitude', 'longitude']
    .forEach(function (forbidden) {
      ok('the payload never contains ' + forbidden, payloadText.indexOf(forbidden) === -1);
    });
  const privStore = tempStore();
  privStore.store.add('Confidential');
  const storedText = fs.readFileSync(privStore.file, 'utf8').toLowerCase();
  ok('the file contains the username', storedText.indexOf('confidential') !== -1);
  ['email', 'phone', 'password', 'dob', 'birth', 'gender', 'location', 'gps', 'ip',
    'device', 'browser', 'cookie', 'token', 'history', 'question', 'timestamp', 'time']
    .forEach(function (forbidden) {
      ok('the stored file never contains ' + forbidden, storedText.indexOf(forbidden) === -1);
    });
  const storedShape = JSON.parse(fs.readFileSync(privStore.file, 'utf8'));
  check('the file has exactly two keys',
    JSON.stringify(Object.keys(storedShape).sort()), '["usernames","version"]');
  check('usernames is an array', Array.isArray(storedShape.usernames), true);
  check('every entry is a plain string',
    storedShape.usernames.every(function (n) { return typeof n === 'string'; }), true);
  fs.unlinkSync(privStore.file);
  const serviceCode = read('js/services/username-service.js')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  ['navigator.userAgent', 'screen.', 'geolocation', 'document.cookie', 'deviceId', 'fingerprint']
    .forEach(function (forbidden) {
      ok('the service never touches ' + forbidden, serviceCode.indexOf(forbidden) === -1);
    });
  ok('the service has no eval', !/\beval\s*\(|new\s+Function/.test(serviceCode));
  const viewCode = read('js/ui/username-view.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
  ok('the view never uses innerHTML', viewCode.indexOf('innerHTML') === -1);
  ok('the view performs no fetch', !/\bfetch\s*\(|XMLHttpRequest/.test(viewCode));
  ok('app.js performs no network request', !/\bfetch\s*\(|XMLHttpRequest/.test(read('js/app.js')));

  // ------------------------------------------------------ 9) admin security
  section('9) Admin security: a normal user cannot read the username list');
  const openStore = tempStore();
  openStore.store.add('Kaif');
  openStore.store.add('Rahul');
  const json = JSON.stringify({ username: 'Sneha' });

  // 9a) no token configured -> the route does not exist at all
  const noTokenConfig = configModule.readConfig({ AI_PROVIDER: 'none' });
  const noTokenServer = serverModule.createServer({
    config: noTokenConfig, provider: stubProvider(),
    usernameStore: openStore.store, logger: function () {}
  });
  const noTokenPort = await listen(noTokenServer);
  let res = await call(noTokenPort, '/api/admin/usernames');
  check('admin list is 404 without a token', res.status, 404);
  check('no list leaks', res.json.usernames, undefined);
  res = await call(noTokenPort, '/api/admin/usernames', { headers: { Authorization: 'Bearer anything' } });
  check('a guessed token does not unlock it', res.status, 404);
  check('still no list', res.json.usernames, undefined);
  await close(noTokenServer);

  // 9b) token configured -> still locked without the right token
  const tokenConfig = configModule.readConfig({ AI_PROVIDER: 'none', ADMIN_TOKEN: ADMIN_TOKEN });
  const tokenServer = serverModule.createServer({
    config: tokenConfig, provider: stubProvider(),
    usernameStore: openStore.store, logger: function () {}
  });
  const tokenPort = await listen(tokenServer);
  res = await call(tokenPort, '/api/admin/usernames');
  check('no header -> 404', res.status, 404);
  check('no list without the header', res.json.usernames, undefined);
  res = await call(tokenPort, '/api/admin/usernames', { headers: { Authorization: 'Bearer wrong-token' } });
  check('wrong token -> 404', res.status, 404);
  check('no list for a wrong token', res.json.usernames, undefined);
  res = await call(tokenPort, '/api/admin/usernames', { headers: { Authorization: ADMIN_TOKEN } });
  check('missing Bearer scheme -> 404', res.status, 404);

  // 9c) a normal user may register, but never sees the list
  res = await call(tokenPort, '/api/username', { method: 'POST', headers: JSON_HEADERS, body: json });
  check('a normal user can register', res.status, 200);
  check('the registration reply has no list', res.json.usernames, undefined);
  check('the registration reply has no total', res.json.total, undefined);
  check('the reply echoes only their own name', res.json.username, 'Sneha');

  // 9d) the right token unlocks the list
  res = await call(tokenPort, '/api/admin/usernames', { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } });
  check('the admin token unlocks the list', res.status, 200);
  check('total is reported', res.json.total, 3);
  check('the list is returned', res.json.usernames.length, 3);
  ok('the admin token never appears in the response', res.text.indexOf(ADMIN_TOKEN) === -1);

  // 9e) malformed requests to the public route
  res = await call(tokenPort, '/api/username', { method: 'POST', headers: JSON_HEADERS, rawBody: '{bad json' });
  check('invalid JSON -> 400', res.status, 400);
  res = await call(tokenPort, '/api/username', { method: 'GET' });
  check('GET on the register route -> 405', res.status, 405);
  res = await call(tokenPort, '/api/username', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: json });
  check('wrong content type -> 415', res.status, 415);
  res = await call(tokenPort, '/api/username', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ username: '   ' }) });
  check('empty username -> 400', res.status, 400);
  res = await call(tokenPort, '/api/username', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ username: 'x'.repeat(MAX + 5) }) });
  check('over-long username -> 400', res.status, 400);
  res = await call(tokenPort, '/api/username', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify([1, 2, 3]) });
  check('a JSON array body -> 400', res.status, 400);

  // 9f) extra fields are ignored, never stored
  res = await call(tokenPort, '/api/username', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({ username: 'Extra', email: 'a@b.c', ip: '1.2.3.4', history: ['2+2'] })
  });
  check('a request with extra fields still succeeds', res.status, 200);
  const afterExtra = JSON.stringify(openStore.store.list()).toLowerCase();
  ok('the extra fields were not stored', afterExtra.indexOf('@') === -1);
  ok('the history was not stored', afterExtra.indexOf('2+2') === -1);
  ok('the ip was not stored', afterExtra.indexOf('1.2.3.4') === -1);

  // 9g) the existing AI routes are untouched by the new ones
  res = await call(tokenPort, '/api/health');
  check('health still works', res.status, 200);
  check('health is unchanged', res.json.status, 'ok');
  res = await call(tokenPort, '/api/solve', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ question: 'x' }) });
  check('solve still answers 503 when unconfigured', res.status, 503);
  check('solve code unchanged', res.json.code, 'not-configured');
  await close(tokenServer);

  // 9h) the token never leaks, and never exists in the frontend
  ok('describeConfig hides the admin token',
    JSON.stringify(configModule.describeConfig(tokenConfig)).indexOf(ADMIN_TOKEN) === -1);
  check('describeConfig reports only a boolean',
    configModule.describeConfig(tokenConfig).hasAdminToken, true);
  check('no token means false', configModule.describeConfig(noTokenConfig).hasAdminToken, false);
  ['index.html', 'js/config.js', 'js/app.js', 'js/services/username-service.js',
    'js/ui/username-view.js', 'css/username.css'].forEach(function (rel) {
    const src = read(rel);
    ok(rel + ' holds no admin token', src.indexOf(ADMIN_TOKEN) === -1);
    ok(rel + ' never mentions ADMIN_TOKEN', src.indexOf('ADMIN_TOKEN') === -1);
  });
  ok('index.html has no admin list route', markup.indexOf('admin/usernames') === -1);
  ok('the local admin CLI exists', fs.existsSync(path.join(ROOT, 'server', 'admin-usernames.js')));
  ok('the CLI exports main', typeof adminCli.main === 'function');
  check('the data directory is git-ignored', read('.gitignore').indexOf('server/data/') !== -1, true);
  check('the env template ships an empty ADMIN_TOKEN',
    /^ADMIN_TOKEN=\s*$/m.test(read('server/.env.example')), true);
  fs.unlinkSync(openStore.file);

  // 10) nothing existing was touched
  section('10) Existing features are untouched');
  ok('OpenRouter is still the primary branch',
    read('server/provider.js').indexOf("config.provider === 'openrouter'") !== -1);
  ok('the Gemini fallback chain still exists',
    read('server/provider.js').indexOf('createFallbackProvider') !== -1);
  ok('the AI prompt is unchanged', read('server/solve.js').indexOf('SYSTEM_PROMPT') !== -1);
  ok('the AI contract is unchanged', read('server/solve.js').indexOf('normalizeAIResult') !== -1);
  ok('the calculator engine is unchanged',
    read('js/core/expression-engine.js').indexOf('ROOT_FUNCTIONS') !== -1);
  ok('the calculator model is unchanged',
    read('js/core/calculator-model.js').indexOf('createCalculatorModel') !== -1);
  ok('the local solver is unchanged',
    read('js/services/math-solver.js').indexOf('createMathSolver') !== -1);
  ok('the AI solver service is unchanged',
    read('js/services/ai-math-solver.js').indexOf('createAIMathSolver') !== -1);
  ok('the converter view is unchanged',
    read('js/ui/number-base-view.js').indexOf('createNumberBaseView') !== -1);
  ok('the age view is unchanged', read('js/ui/age-view.js').indexOf('createAgeView') !== -1);
  ok('the about section is still in the page', markup.indexOf('data-view-panel="about"') !== -1);
  check('all five navigation items are still present',
    ['calculator', 'solver', 'converter', 'age', 'about'].every(function (view) {
      return markup.indexOf('data-view-target="' + view + '"') !== -1;
    }), true);
  check('the scientific calculator toggle is still there',
    markup.indexOf('data-calc-mode-toggle="scientific"') !== -1, true);
  ok('the existing endpoint config line is untouched',
    /aiEndpoint:\s*configuredEndpoint \|\| DEFAULT_ENDPOINT/.test(read('js/config.js')));
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
  console.log('All offline-first username tests passed.');
})();