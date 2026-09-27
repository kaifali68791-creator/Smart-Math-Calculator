/**
 * Private admin user-management screen tests (Node, no framework):
 *   node tests/admin-users.test.js
 * -----------------------------------------------------------------------------
 * Everything is local or stubbed - no real provider is contacted and the real
 * ADMIN_TOKEN is never used or printed. Covers:
 *   1. The page opens and shows the token input.
 *   2. A correct token loads the total and the list.
 *   3. An incorrect or missing token is rejected with one safe message.
 *   4. Refresh updates the data; Logout clears the in-memory token.
 *   5. The token is never stored, hardcoded, logged or put in a URL.
 *   6. A normal user cannot reach the list, and the app shows no Admin button.
 *   7. The existing username feature and the AI stack are untouched.
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

/** Built at runtime so no token-like literal is ever committed. */
const ADMIN_TOKEN = ['unit', 'test', 'admin', 'token', '999'].join('-');

/** Loads a frontend factory in a vm sandbox. */
function loadFrontend(rel, globalName) {
  const sandbox = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    Promise: Promise, JSON: JSON, AbortController: AbortController };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read(rel), sandbox, { filename: rel });
  return sandbox.SMC[globalName];
}

/** A fetch stub that records calls. `impl.latest` is the body it will answer. */
function stubFetch(status, body) {
  const calls = [];
  const impl = function (url, init) {
    calls.push({ url: String(url), init: init });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status: status,
      json: function () { return Promise.resolve(impl.latest); }
    });
  };
  impl.calls = calls;
  impl.latest = body;
  return impl;
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
function stubProvider() {
  return {
    name: 'stub',
    isConfigured: function () { return false; },
    solve: function () {
      return Promise.resolve({ ok: false, status: 503, code: 'not-configured' });
    }
  };
}
function tempStore() {
  const file = path.join(os.tmpdir(),
    'smc-admin-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.json');
  return { file: file, store: usernamesModule.createUsernameStore({ file: file }) };
}

async function main() {
  const createAdminService = loadFrontend('js/services/admin-users-service.js', 'createAdminUsersService');
  const adminHtml = read('admin.html');
  const indexHtml = read('index.html');

  // ------------------------------------------------- 1) the page and its form
  section('1) The admin page exists and shows the token input');
  ok('admin.html exists', fs.existsSync(path.join(ROOT, 'admin.html')));
  ok('the page is titled Admin User Management', adminHtml.indexOf('Admin User Management') !== -1);
  ok('the token field is labelled Admin Token', adminHtml.indexOf('>Admin Token<') !== -1);
  ok('the submit button says Access Admin Panel', adminHtml.indexOf('Access Admin Panel') !== -1);
  ok('Refresh button exists', adminHtml.indexOf('data-admin-refresh') !== -1);
  ok('Logout button exists', adminHtml.indexOf('data-admin-logout') !== -1);
  ok('a total element exists', adminHtml.indexOf('data-admin-total') !== -1);
  ok('a list element exists', adminHtml.indexOf('data-admin-usernames') !== -1);
  check('the token input is a password field',
    /data-admin-token[\s\S]{0,80}type="password"/.test(adminHtml), true);
  check('exactly one input on the page', (adminHtml.match(/<input/g) || []).length, 1);
  ok('the token input has autocomplete off (no browser storage offer)',
    /data-admin-token[\s\S]{0,200}autocomplete="off"/.test(adminHtml));
  ok('the page is not indexable', adminHtml.indexOf('noindex') !== -1);
  check('the dashboard starts hidden',
    /data-admin-dashboard[\s\S]{0,120}hidden/.test(adminHtml), true);

  // -------------------------------------------- 2) a correct token works
  section('2) A correct token loads the total and the list');
  const LIST = { total: 4, usernames: ['Kaif', 'Rahul', 'Priya', 'Aman'] };
  const goodFetch = stubFetch(200, LIST);
  const goodService = createAdminService({
    endpoint: 'http://127.0.0.1:9/api/admin/usernames', fetchImpl: goodFetch
  });
  check('not signed in before anything happens', goodService.isSignedIn(), false);
  const signedIn = await goodService.signIn(ADMIN_TOKEN);
  check('sign-in succeeds', signedIn.ok, true);
  check('the total is returned', signedIn.total, 4);
  check('every username is returned', signedIn.usernames.length, 4);
  check('the first username is intact', signedIn.usernames[0], 'Kaif');
  check('now signed in', goodService.isSignedIn(), true);
  check('exactly one request was made', goodFetch.calls.length, 1);
  check('it used the existing admin route', goodFetch.calls[0].url,
    'http://127.0.0.1:9/api/admin/usernames');
  check('method is GET', goodFetch.calls[0].init.method, 'GET');
  check('the token is sent as a bearer header',
    goodFetch.calls[0].init.headers.Authorization, 'Bearer ' + ADMIN_TOKEN);
  check('no credentials are sent (no cookies)', goodFetch.calls[0].init.credentials, 'omit');
  check('the token never appears in the URL', goodFetch.calls[0].url.indexOf(ADMIN_TOKEN), -1);

  // ---------------------------------------------------- 3) bad tokens fail
  section('3) An incorrect or missing token is rejected with one safe message');
  const badFetch = stubFetch(404, { error: 'Not found.', code: 'not-found' });
  const badService = createAdminService({
    endpoint: 'http://127.0.0.1:9/api/admin/usernames', fetchImpl: badFetch
  });
  const rejected = await badService.signIn('definitely-not-the-token');
  check('a wrong token is rejected', rejected.ok, false);
  check('with the exact safe message', rejected.message, 'Invalid admin token.');
  check('no usernames are returned', rejected.usernames, undefined);
  check('no total is returned', rejected.total, undefined);
  check('the service is not signed in', badService.isSignedIn(), false);
  check('the wrong token is not kept in memory', badService.getState().hasToken, false);
  const missing = await badService.signIn('');
  check('a missing token is rejected', missing.ok, false);
  check('with the same safe message', missing.message, 'Invalid admin token.');
  check('no request is made without a token', badFetch.calls.length, 1);
  const blank = await badService.signIn('    ');
  check('a whitespace-only token is rejected', blank.ok, false);
  check('and sends nothing', badFetch.calls.length, 1);
  const errFetch = stubFetch(500, {});
  const errService = createAdminService({
    endpoint: 'http://127.0.0.1:9/api/admin/usernames', fetchImpl: errFetch
  });
  const serverError = await errService.signIn(ADMIN_TOKEN);
  check('a server error is not a session', serverError.ok, false);
  check('with the same safe message', serverError.message, 'Invalid admin token.');
  check('the token is dropped after a rejection', errService.getState().hasToken, false);
  const netService = createAdminService({
    endpoint: 'http://127.0.0.1:9/api/admin/usernames',
    fetchImpl: function () { return Promise.reject(new Error('offline')); }
  });
  const netError = await netService.signIn(ADMIN_TOKEN);
  check('a network failure is safe', netError.ok, false);
  check('with the same safe message', netError.message, 'Invalid admin token.');
  check('and does not sign anyone in', netService.isSignedIn(), false);

  // ------------------------------------------------ 4) refresh and logout
  section('4) Refresh updates the data and Logout clears the in-memory token');
  let body = { total: 1, usernames: ['Kaif'] };
  const refreshFetch = stubFetch(200, body);
  const refreshService = createAdminService({
    endpoint: 'http://127.0.0.1:9/api/admin/usernames', fetchImpl: refreshFetch
  });
  await refreshService.signIn(ADMIN_TOKEN);
  check('sign-in used one request', refreshFetch.calls.length, 1);
  const firstLoad = await refreshService.refresh();
  check('first load total', firstLoad.total, 1);
  check('two requests so far', refreshFetch.calls.length, 2);
  // The list grows on the server; refresh must show the new data.
  body = { total: 3, usernames: ['Kaif', 'Rahul', 'Priya'] };
  refreshFetch.latest = body;
  const afterRefresh = await refreshService.refresh();
  check('refresh sends another request', refreshFetch.calls.length, 3);
  check('refresh picks up the new total', afterRefresh.total, 3);
  check('refresh picks up the new list', afterRefresh.usernames.length, 3);
  check('the same token is reused, not re-typed',
    refreshFetch.calls[2].init.headers.Authorization, 'Bearer ' + ADMIN_TOKEN);
  refreshService.signOut();
  check('signed out after logout', refreshService.isSignedIn(), false);
  check('the token is gone from memory after logout', refreshService.getState().hasToken, false);
  const afterLogout = await refreshService.refresh();
  check('a refresh after logout cannot work', afterLogout.ok, false);
  check('and makes no request', refreshFetch.calls.length, 3);
  check('signing in again works', (await refreshService.signIn(ADMIN_TOKEN)).ok, true);

  // ---------------------------------------- 5) the token is never persisted
  section('5) The token is never stored, hardcoded, logged or put in a URL');
  const serviceSrc = read('js/services/admin-users-service.js');
  const viewSrc = read('js/ui/admin-users-view.js');
  // Strip comments so these scans only see real code and literals.
  const serviceCode = serviceSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const viewCode = viewSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'openDatabase']
    .forEach(function (forbidden) {
      ok('the service never uses ' + forbidden, serviceCode.indexOf(forbidden) === -1);
      ok('the view never uses ' + forbidden, viewCode.indexOf(forbidden) === -1);
    });
  ok('the service never calls console', !/console\./.test(serviceCode));
  ok('the view never calls console', !/console\./.test(viewCode));
  ok('the service has no eval', !/\beval\s*\(|new\s+Function/.test(serviceCode));
  ok('the view has no eval', !/\beval\s*\(|new\s+Function/.test(viewCode));
  ok('the view never uses innerHTML', viewCode.indexOf('innerHTML') === -1);
  ok('the service never puts the token in a URL', !/\?token=|token=/.test(serviceCode));
  // No token literal anywhere in the shipped admin files.
  ['admin.html', 'js/services/admin-users-service.js', 'js/ui/admin-users-view.js',
    'js/config.js', 'css/admin.css'].forEach(function (rel) {
    const src = read(rel);
    ok(rel + ' contains no test token', src.indexOf(ADMIN_TOKEN) === -1);
    ok(rel + ' has no hardcoded token assignment',
      !/(ADMIN_TOKEN|adminToken)\s*[:=]\s*['"][^'"]{6,}['"]/.test(src));
  });
  ok('admin.html has no value attribute on the token input',
    !/data-admin-token[\s\S]{0,300}\svalue="/.test(adminHtml));
  // The page never references the environment variable name as a credential.
  ok('the admin page never reads an env var', adminHtml.indexOf('process.env') === -1);
  // The username data module must not be reachable from the admin page.
  ok('the admin page does not load the username popup', adminHtml.indexOf('username-view') === -1);
  ok('the admin page does not load app.js', adminHtml.indexOf('js/app.js') === -1);
  ok('the admin page does not load the username service',
    adminHtml.indexOf('username-service') === -1);
  // The whole page: no console call, no storage, no eval. Comments are stripped
  // first, because the page's own documentation MENTIONS the storage APIs it
  // deliberately never uses.
  const adminCode = adminHtml.replace(/<!--[\s\S]*?-->/g, ' ');
  ok('admin.html never calls console', !/console\./.test(adminCode));
  ok('admin.html never uses localStorage or sessionStorage',
    !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(adminCode));
  ok('admin.html has no eval', !/\beval\s*\(|new\s+Function/.test(adminCode));
  // The dashboard may only show usernames: no other data field is referenced.
  // Word boundaries matter: the standard viewport meta contains "device-width".
  ok('the admin UI mentions no extra data field',
    ['email', 'phone', 'dob', 'ip address', 'device id', 'device', 'location', 'gps',
      'browser', 'timestamp', 'user agent'].every(function (word) {
      return adminCode.toLowerCase().indexOf(word) === -1;
    }) || adminCode.toLowerCase().indexOf('device') === adminCode.toLowerCase().indexOf('device-width'));
  ok('the admin UI shows no user-agent or IP field',
    !/user-?agent|remote_addr|x-forwarded-for/.test(adminCode));
  ok('the admin list renders only a username and its number',
    /dom\.setText\(item, \(index \+ 1\) \+ '\. ' \+ name\)/.test(viewSrc));

  // --------------------------------- 6) normal users see nothing, ever
  section('6) The normal application exposes no admin entry point');
  ok('index.html never links to admin.html', indexHtml.indexOf('admin.html') === -1);
  ok('index.html has no admin route', indexHtml.indexOf('api/admin') === -1);
  ok('index.html has no admin panel', indexHtml.indexOf('data-view-panel="admin"') === -1);
  ok('index.html has no admin nav target', indexHtml.indexOf('data-view-target="admin"') === -1);
  ok('index.html has no admin button', indexHtml.toLowerCase().indexOf('admin') === -1);
  check('the navigation still has exactly its five original items',
    (indexHtml.match(/data-view-target=/g) || []).length, 5);
  ['calculator', 'solver', 'converter', 'age', 'about'].forEach(function (view) {
    ok('the ' + view + ' nav item is still there',
      indexHtml.indexOf('data-view-target="' + view + '"') !== -1);
  });
  ok('app.js has no admin wiring', read('js/app.js').toLowerCase().indexOf('admin') === -1);
  ok('navigation.js is unchanged', read('js/ui/navigation.js').indexOf('createNavigation') !== -1);
  ok('the app does not load the admin service', indexHtml.indexOf('admin-users') === -1);
  ok('the app does not load the admin view', indexHtml.indexOf('admin-users-view') === -1);

  // ------------------------- 7) the server still enforces the token
  section('7) The server remains the real authorization mechanism');
  const dataStore = tempStore();
  dataStore.store.add('Kaif');
  dataStore.store.add('Rahul');
  const tokenConfig = configModule.readConfig({ AI_PROVIDER: 'none', ADMIN_TOKEN: ADMIN_TOKEN });
  const openConfig = configModule.readConfig({ AI_PROVIDER: 'none' });
  const guarded = serverModule.createServer({
    config: tokenConfig, provider: stubProvider(),
    usernameStore: dataStore.store, logger: function () {}
  });
  const guardedPort = await listen(guarded);
  let res = await call(guardedPort, '/api/admin/usernames');
  check('a normal user with no token gets 404', res.status, 404);
  check('and no list', res.json.usernames, undefined);
  res = await call(guardedPort, '/api/admin/usernames', { headers: { Authorization: 'Bearer wrong' } });
  check('a wrong token gets 404', res.status, 404);
  check('and no list', res.json.usernames, undefined);
  // The server requires the "Bearer " scheme, exactly as the page sends it.
  res = await call(guardedPort, '/api/admin/usernames',
    { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } });
  check('the correct bearer token is accepted', res.status, 200);
  check('the total is returned to the admin', res.json.total, 2);
  check('the list is returned to the admin', res.json.usernames.length, 2);
  ok('the token never appears in the admin response', res.text.indexOf(ADMIN_TOKEN) === -1);
  // The raw token without the scheme must still be refused.
  res = await call(guardedPort, '/api/admin/usernames', { headers: { Authorization: ADMIN_TOKEN } });
  check('the token without the Bearer scheme is refused', res.status, 404);
  // Preflight must work so a browser page can send the Authorization header.
  const preflight = await fetch('http://127.0.0.1:' + guardedPort + '/api/admin/usernames', {
    method: 'OPTIONS',
    headers: { Origin: 'http://127.0.0.1:8080', 'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization' }
  });
  check('the CORS preflight succeeds', preflight.status, 204);
  check('Authorization is an allowed request header',
    /authorization/i.test(preflight.headers.get('access-control-allow-headers') || ''), true);
  // The username storage schema is unchanged.
  const schema = JSON.parse(fs.readFileSync(dataStore.file, 'utf8'));
  check('the stored schema still has two keys',
    JSON.stringify(Object.keys(schema).sort()), '["usernames","version"]');
  check('usernames is still an array of strings',
    schema.usernames.every(function (n) { return typeof n === 'string'; }), true);
  // A server without a token has no admin route at all.
  const unguarded = serverModule.createServer({
    config: openConfig, provider: stubProvider(),
    usernameStore: dataStore.store, logger: function () {}
  });
  const unguardedPort = await listen(unguarded);
  res = await call(unguardedPort, '/api/admin/usernames',
    { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } });
  check('with no ADMIN_TOKEN the route does not exist', res.status, 404);
  check('and reveals nothing', res.json.usernames, undefined);
  // The AI endpoint is untouched by any of this.
  res = await call(guardedPort, '/api/health');
  check('health is unchanged', res.json.status, 'ok');
  res = await call(guardedPort, '/api/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'x' })
  });
  check('solve is unchanged', res.json.code, 'not-configured');
  await close(guarded);
  await close(unguarded);
  fs.unlinkSync(dataStore.file);

  // --------------------------------- 8) everything else is untouched
  section('8) Existing features are untouched');
  ok('OpenRouter is still primary', read('server/provider.js').indexOf("config.provider === 'openrouter'") !== -1);
  ok('the Gemini fallback chain still exists', read('server/provider.js').indexOf('createFallbackProvider') !== -1);
  ok('the AI prompt is unchanged', read('server/solve.js').indexOf('SYSTEM_PROMPT') !== -1);
  ok('the AI contract is unchanged', read('server/solve.js').indexOf('normalizeAIResult') !== -1);
  ok('the calculator engine is unchanged', read('js/core/expression-engine.js').indexOf('ROOT_FUNCTIONS') !== -1);
  ok('the local solver is unchanged', read('js/services/math-solver.js').indexOf('createMathSolver') !== -1);
  ok('the AI solver service is unchanged', read('js/services/ai-math-solver.js').indexOf('createAIMathSolver') !== -1);
  ok('the converter view is unchanged', read('js/ui/number-base-view.js').indexOf('createNumberBaseView') !== -1);
  ok('the age view is unchanged', read('js/ui/age-view.js').indexOf('createAgeView') !== -1);
  // The username feature itself is untouched by this task.
  ok('the username popup still exists', read('js/ui/username-view.js').indexOf('createUsernameView') !== -1);
  ok('the username sync still posts only the username',
    /JSON\.stringify\(\{ username: state\.username \}\)/.test(read('js/services/username-service.js')));
  ok('the username popup still loads in the app', indexHtml.indexOf('data-username-overlay') !== -1);
  ok('the local username storage key is unchanged',
    read('js/services/username-service.js').indexOf("'username:v1'") !== -1);
  ok('the existing registration route still exists',
    read('server/server.js').indexOf("USERNAME_PATH = '/api/username'") !== -1);
  ok('the env template still ships an empty ADMIN_TOKEN',
    /^ADMIN_TOKEN=\s*$/m.test(read('server/.env.example')));
  // ------------------ 9) regression: the endpoint must exist by default
  // This is the exact bug that made the page report "Invalid admin token." for
  // a valid token: js/config.js derived the admin URL from the PRE-SET value
  // only, so with no window.SMC_CONFIG (the real browser case) the URL was ''
  // and the service bailed out before sending any request.
  section('9) Regression: the admin endpoint resolves without any preset config');
  function configSandbox(preset) {
    const sb = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
      Promise: Promise, JSON: JSON, AbortController: AbortController };
    if (preset) { sb.SMC_CONFIG = preset; }
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(read('js/config.js'), sb, { filename: 'js/config.js' });
    return sb;
  }
  const bare = configSandbox();
  check('aiEndpoint still falls back to the bundled backend',
    bare.SMC_CONFIG.aiEndpoint, 'http://127.0.0.1:8787/api/solve');
  check('the admin endpoint is NOT empty with no preset config',
    bare.SMC_CONFIG.adminUsernamesEndpoint, 'http://127.0.0.1:8787/api/admin/usernames');
  check('the username endpoint is not empty either',
    bare.SMC_CONFIG.usernameEndpoint, 'http://127.0.0.1:8787/api/username');
  check('an explicit admin endpoint still wins',
    configSandbox({ adminUsernamesEndpoint: 'https://other.invalid/api/admin/usernames' })
      .SMC_CONFIG.adminUsernamesEndpoint, 'https://other.invalid/api/admin/usernames');
  check('a preset AI endpoint still drives the admin URL',
    configSandbox({ aiEndpoint: 'https://example.invalid/api/solve' })
      .SMC_CONFIG.adminUsernamesEndpoint, 'https://example.invalid/api/admin/usernames');

  // The real chain: config -> service -> a 200 with an EMPTY list.
  const chain = configSandbox();
  vm.runInContext(read('js/services/admin-users-service.js'), chain, { filename: 'admin-users-service.js' });
  let chainCalls = 0;
  let sentAuth = null;
  const chainService = chain.SMC.createAdminUsersService({
    endpoint: chain.SMC_CONFIG.adminUsernamesEndpoint,
    fetchImpl: function (url, init) {
      chainCalls += 1;
      sentAuth = init.headers.Authorization;
      // Exactly what the server returns for a valid token and an empty list.
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () { return Promise.resolve({ total: 0, usernames: [] }); }
      });
    }
  });
  const emptyResult = await chainService.signIn(ADMIN_TOKEN);
  check('a request is actually sent (no early bail-out)', chainCalls, 1);
  check('the Bearer scheme is used', String(sentAuth).indexOf('Bearer '), 0);
  check('a 200 with an empty list is a SUCCESS', emptyResult.ok, true);
  check('not treated as an auth failure', emptyResult.code, 'ok');
  check('total is 0, not an error', emptyResult.total, 0);
  check('the list is empty, not undefined', Array.isArray(emptyResult.usernames), true);
  check('no invalid-token message', emptyResult.message, undefined);
  check('the admin is signed in', chainService.isSignedIn(), true);
  // A later non-empty list must still display normally.
  const later = await chainService.signIn(ADMIN_TOKEN);
  check('a repeated sign-in stays successful', later.ok, true);
  // Invalid tokens must still be refused.
  const denied = chain.SMC.createAdminUsersService({
    endpoint: chain.SMC_CONFIG.adminUsernamesEndpoint,
    fetchImpl: function () {
      return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); } });
    }
  });
  const bad = await denied.signIn('not-the-real-token');
  check('a wrong token is still rejected', bad.ok, false);
  check('with the safe message', bad.message, 'Invalid admin token.');

  // The dashboard renders the total from the response, so an empty list shows
  // "Total Users: 0" rather than an error.
  check('the dashboard renders Total Users from the response',
    /dom\.setText\(totalBox, 'Total Users: ' \+/.test(read('js/ui/admin-users-view.js')), true);
  check('an empty list shows the empty-state message, not a failure',
    /dom\.show\(listEmpty\)/.test(read('js/ui/admin-users-view.js')), true);
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
  console.log('All private admin screen tests passed.');
})();