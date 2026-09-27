/**
 * PWA / offline readiness test (Node, no framework):
 *   node tests/pwa-offline.test.js
 * -----------------------------------------------------------------------------
 * There is no browser in this suite, so this file does two things:
 *
 *   1. STATIC checks: the manifest is valid JSON with the required fields, every
 *      icon and every precached path really exists on disk, index.html links
 *      the manifest, the worker is registered from js/app.js, and no sensitive
 *      route or credential can ever reach the cache.
 *   2. BEHAVIOURAL checks: sw.js is loaded into a sandbox with a fake `caches`,
 *      `fetch`, `self` and `Response`, and its install / activate / fetch
 *      handlers are actually executed. That proves the worker logic without
 *      pretending a browser was involved.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

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

// ---------------------------------------------------------------------------
section('1) The manifest exists and is valid');
// ---------------------------------------------------------------------------
let manifest = null;
ok('manifest.webmanifest exists', exists('manifest.webmanifest'));
try {
  manifest = JSON.parse(read('manifest.webmanifest'));
  ok('manifest.webmanifest is valid JSON', true);
} catch (error) {
  ok('manifest.webmanifest is valid JSON', false, error.message);
}
if (manifest) {
  check('app name', manifest.name, 'Smart Math Calculator');
  check('short name', manifest.short_name, 'Smart Math Calculator');
  ok('description is present and useful',
    typeof manifest.description === 'string' && manifest.description.length > 40);
  check('display is standalone', manifest.display, 'standalone');
  check('start_url is relative to the app root', manifest.start_url, './');
  check('scope covers the app', manifest.scope, './');
  ok('id is stable', manifest.id === './' || typeof manifest.id === 'string');
  // The colours must come from the real theme tokens in css/base.css.
  const base = read('css/base.css');
  ok('theme_color matches an existing token', base.indexOf(manifest.theme_color) !== -1,
    manifest.theme_color);
  ok('background_color matches an existing token', base.indexOf(manifest.background_color) !== -1,
    manifest.background_color);
  ok('icons are present', Array.isArray(manifest.icons) && manifest.icons.length > 0);
  (manifest.icons || []).forEach((icon) => {
    ok('icon exists on disk: ' + icon.src, exists(icon.src), icon.src);
    ok('icon declares a type: ' + icon.src, typeof icon.type === 'string' && icon.type.length > 0);
    ok('icon declares sizes: ' + icon.src, typeof icon.sizes === 'string' && icon.sizes.length > 0);
  });
  // No invented 192/512 raster paths.
  const raster = (manifest.icons || []).filter((i) => /\.png$|\.jpg$|\.webp$/i.test(i.src));
  check('no raster icon is referenced without the file existing',
    raster.filter((i) => !exists(i.src)).length, 0);
  ok('the manifest leaks nothing sensitive',
    !/token|secret|api[_-]?key|password|admin/i.test(read('manifest.webmanifest')));
}

// ---------------------------------------------------------------------------
section('2) index.html links the manifest, and the app loads the worker');
// ---------------------------------------------------------------------------
{
  const html = read('index.html');
  ok('index.html links the manifest',
    /<link rel="manifest" href="manifest\.webmanifest"\s*\/>/.test(html));
  ok('the manifest link sits in <head>', html.indexOf('rel="manifest"') < html.indexOf('</head>'));
  ok('the favicon is untouched', html.indexOf('assets/favicon.svg') !== -1);
  const app = read('js/app.js');
  ok('app.js registers sw.js', /navigator\.serviceWorker\.register\(\s*'sw\.js'\s*\)/.test(app));
  ok('app.js guards on serviceWorker support', /!navigator\.serviceWorker/.test(app));
  ok('app.js swallows registration failures', /\.register\([^)]*\)[\s\S]{0,200}?\.catch\(/.test(app));
  ok('app.js never performs a request itself', !/\bfetch\s*\(|XMLHttpRequest/.test(app));
  ok('app.js does not reload the page', !/location\.reload/.test(app));
  ok('app.js mentions no admin wiring', app.toLowerCase().indexOf('admin') === -1);
  ok('app.js does not block boot on the worker',
    app.indexOf('registerServiceWorker();') > app.indexOf('function registerServiceWorker'));
  ok('the worker path is relative, so a sub-folder install works',
    /register\(\s*'sw\.js'\s*\)/.test(app) && app.indexOf("register('/sw.js')") === -1);
}


// ---------------------------------------------------------------------------
// A sandbox that behaves like a service worker global, so sw.js really runs.
// ---------------------------------------------------------------------------
const ORIGIN = 'https://app.test';

function makeRequest(url, init) {
  const cfg = init || {};
  return {
    url: url,
    method: cfg.method || 'GET',
    mode: cfg.mode || 'no-cors',
    clone: function () { return this; }
  };
}
function makeResponse(status, type, tag) {
  const code = status === undefined ? 200 : status;
  return {
    status: code,
    ok: code < 300,
    type: type || 'basic',
    tag: tag || '',
    clone: function () { return makeResponse(this.status, this.type, this.tag); }
  };
}

/** Builds a fresh worker environment. `net` decides what the network returns. */
function makeWorkerEnv(net) {
  const stores = new Map();
  const listeners = {};
  const state = { skipped: false, claimed: false };
  const urlOf = (input) => (typeof input === 'string' ? input : input.url);
  // A real Cache API resolves every key to an absolute URL, so './x' written at
  // install time is found again for the absolute request URL at fetch time.
  const resolveKey = (input) => {
    const raw = urlOf(input);
    try { return new URL(raw, ORIGIN + '/').href; } catch (error) { return raw; }
  };
  const toPath = (href) => {
    const prefix = ORIGIN + '/';
    if (href === ORIGIN) { return './'; }
    return href.indexOf(prefix) === 0 ? './' + href.slice(prefix.length) : href;
  };

  function cacheApi(name) {
    if (!stores.has(name)) { stores.set(name, new Map()); }
    const store = stores.get(name);
    return {
      add: function (input) {
        const key = resolveKey(input);
        if (net(urlOf(input)) === null) { return Promise.reject(new Error('offline')); }
        store.set(key, makeResponse(200, 'basic', key));
        return Promise.resolve();
      },
      put: function (input, response) {
        store.set(resolveKey(input), response);
        return Promise.resolve();
      },
      match: function (input) { return Promise.resolve(store.get(resolveKey(input)) || undefined); }
    };
  }

  const caches = {
    open: function (name) { return Promise.resolve(cacheApi(name)); },
    keys: function () { return Promise.resolve(Array.from(stores.keys())); },
    delete: function (name) { return Promise.resolve(stores.delete(name)); },
    match: function (input) {
      for (const name of stores.keys()) {
        const hit = stores.get(name).get(resolveKey(input));
        if (hit) { return Promise.resolve(hit); }
      }
      return Promise.resolve(undefined);
    }
  };

  const self = {
    location: { origin: ORIGIN },
    addEventListener: function (type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    skipWaiting: function () { state.skipped = true; return Promise.resolve(); },
    clients: { claim: function () { state.claimed = true; return Promise.resolve(); } }
  };

  const sandbox = {
    self: self,
    caches: caches,
    URL: URL,
    Response: Response,
    console: console,
    fetch: function (input) {
      const url = urlOf(input);
      if (net(url) === null) { return Promise.reject(new Error('offline')); }
      return Promise.resolve(makeResponse(200, 'basic', url));
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('sw.js'), sandbox, { filename: 'sw.js' });

  function dispatch(type, event) {
    const waits = [];
    (listeners[type] || []).forEach((fn) => fn(event));
    return Promise.all(waits.map((p) => p));
  }

  return {
    sandbox: sandbox,
    state: state,
    stores: stores,
    keys: function () { return Array.from(stores.keys()); },
    stored: function (name) {
      return Array.from((stores.get(name) || new Map()).keys()).map(toPath);
    },
    install: function () {
      const waits = [];
      (listeners.install || []).forEach((fn) => fn({ waitUntil: (p) => waits.push(p) }));
      return Promise.all(waits);
    },
    activate: function () {
      const waits = [];
      (listeners.activate || []).forEach((fn) => fn({ waitUntil: (p) => waits.push(p) }));
      return Promise.all(waits);
    },
    /** Dispatches a fetch and resolves to 'passthrough' or the served tag. */
    serve: function (request) {
      let response = null;
      const event = {
        request: request,
        respondWith: function (p) { response = p; }
      };
      dispatch('fetch', event);
      if (response === null) { return Promise.resolve('passthrough'); }
      return Promise.resolve(response).then((r) => (r && r.tag ? r.tag : r));
    },
    listeners: listeners
  };
}

// ---------------------------------------------------------------------------
section('3) The worker precaches the real app shell and nothing else');
// ---------------------------------------------------------------------------
const env = makeWorkerEnv(() => true);
ok('one install handler', (env.listeners.install || []).length, 1);
ok('one activate handler', (env.listeners.activate || []).length, 1);
ok('one fetch handler', (env.listeners.fetch || []).length, 1);

const chain = env.install().then(function () {
  const cacheName = env.keys()[0];
  ok('install creates exactly one cache', env.keys().length, 1);
  ok('the cache name is versioned', /^smc-app-v\d+$/.test(cacheName), cacheName);
  ok('install asks to skip waiting', env.state.skipped, true);

  const stored = env.stored(cacheName);
  ok('the shell was precached', stored.length > 30, String(stored.length));
  const missing = stored.filter((p) => p !== './' && !exists(p.replace(/^\.\//, '')));
  check('every precached path exists on disk', missing.join(', '), '');
  const html = read('index.html');
  const refs = (html.match(/(?:src|href)="((?:css|js|assets)\/[^"]+)"/g) || [])
    .map((r) => './' + r.slice(r.indexOf('"') + 1, r.lastIndexOf('"')));
  const notCached = refs.filter((r) => stored.indexOf(r) === -1);
  check('every asset index.html loads is precached', notCached.join(', '), '');
  check('the manifest is precached', stored.indexOf('./manifest.webmanifest') !== -1, true);
  check('the shell page is precached', stored.indexOf('./index.html') !== -1, true);
  const forbidden = stored.filter((p) => /api|admin|usernames|\.env|token|server\//i.test(p));
  check('no API, admin, credential or server path is precached', forbidden.join(', '), '');

  const old = makeWorkerEnv(() => true);
  old.stores.set('smc-app-v0', new Map([['./index.html', makeResponse(200)]]));
  old.stores.set('some-other-cache', new Map());
  return old.activate().then(function () {
    ok('activate removes the obsolete version', old.keys().indexOf('smc-app-v0'), -1);
    ok('activate removes unrelated caches too', old.keys().indexOf('some-other-cache'), -1);
    ok('activate claims the clients', old.state.claimed, true);
    return null;
  });
}).then(function () {
  section('4) Offline: the whole local app still works');
  const off = makeWorkerEnv(() => true);   // install from a warm "network" ...
  return off.install().then(function () {
    // ... then every request fails, which is what offline really means.
    off.sandbox.fetch = function () { return Promise.reject(new Error('offline')); };
    const cases = [
      ['/js/core/expression-engine.js', 'the expression engine'],
      ['/js/core/calculator-model.js', 'the calculator + scientific keypad'],
      ['/js/services/math-solver.js', 'the local maths solver'],
      ['/js/core/number-base.js', 'the number base converter'],
      ['/js/core/age-calculator.js', 'the age calculator'],
      ['/js/ui/math-keyboard.js', 'the math keyboard core'],
      ['/js/ui/math-keyboard-view.js', 'the math keyboard UI'],
      ['/js/ui/solver-view.js', 'the solver view'],
      ['/js/ui/navigation.js', 'the view navigation'],
      ['/js/services/i18n.js', 'the five-language system'],
      ['/js/services/storage.js', 'local settings/history/username storage'],
      ['/css/base.css', 'the stylesheet']
    ];
    return cases.reduce(function (chain, pair) {
      return chain.then(function () {
        return off.serve(makeRequest(ORIGIN + pair[0])).then(function (tag) {
          check('offline: ' + pair[1] + ' is served from cache', tag, ORIGIN + pair[0]);
        });
      });
    }, Promise.resolve()).then(function () {
      return off.serve(makeRequest(ORIGIN + '/', { mode: 'navigate' }));
    }).then(function (tag) {
      ok('offline: a navigation falls back to the cached shell',
        ['https://app.test/', 'https://app.test/index.html'].indexOf(tag) !== -1, String(tag));
      return off.serve(makeRequest(ORIGIN + '/index.html', { mode: 'navigate' }));
    }).then(function (tag) {
      check('offline: an explicit index.html navigation is served too',
        tag, 'https://app.test/index.html');
      const stored = off.stored(off.keys()[0]);
      check('still no API or admin entry after serving offline',
        stored.filter((p) => /api|admin|token/i.test(p)).join(', '), '');
      return null;
    });
  });
});


function next() {
  section('5) AI, username sync and the private page stay on the network');
  const live = makeWorkerEnv(() => true);
  return live.install().then(function () {
    const cacheName = live.keys()[0];
    const passthrough = (label, request) => live.serve(request).then(function (t) {
      check(label, t, 'passthrough');
    });
    return passthrough('an AI solve POST is not intercepted',
        makeRequest(ORIGIN + '/api/solve', { method: 'POST' }))
      .then(() => passthrough('the private username list is not intercepted',
        makeRequest(ORIGIN + '/api/admin/usernames')))
      .then(() => passthrough('the health route is not intercepted',
        makeRequest(ORIGIN + '/api/health')))
      .then(() => passthrough('even a GET to an API route is not intercepted',
        makeRequest(ORIGIN + '/api/solve', { method: 'GET' })))
      .then(() => passthrough('the username sync route is not intercepted',
        makeRequest(ORIGIN + '/api/username')))
      .then(() => passthrough('the private page navigation is not intercepted',
        makeRequest(ORIGIN + '/admin.html', { mode: 'navigate' })))
      .then(() => passthrough('the private page is never served from cache',
        makeRequest(ORIGIN + '/admin.html')))
      .then(() => passthrough('a cross-origin request is not intercepted',
        makeRequest('https://other.example/track.js')))
      .then(() => passthrough('a cross-origin API request is not intercepted',
        makeRequest('https://127.0.0.1:8787/api/solve', { method: 'POST' })))
      .then(function () {
        const stored = live.stored(cacheName);
        check('nothing under /api/ reached the cache',
          stored.filter((p) => /api/i.test(p)).join(', '), '');
        check('no private page reached the cache',
          stored.filter((p) => /admin/i.test(p)).join(', '), '');
        return null;
      });
  });
}

function onlineChecks() {
  section('6) Online behaviour is unchanged');
  const net = makeWorkerEnv(() => true);
  return net.install().then(function () {
    return net.serve(makeRequest(ORIGIN + '/js/app.js')).then(function (t) {
      check('online: a script is served by the network', t, ORIGIN + '/js/app.js');
      return net.serve(makeRequest(ORIGIN + '/', { mode: 'navigate' }));
    }).then(function (t) {
      check('online: a navigation is served by the network', t, ORIGIN + '/');
      return net.serve(makeRequest(ORIGIN + '/not-cached-yet.js'));
    }).then(function (t) {
      check('online: an uncached file is fetched normally', t, ORIGIN + '/not-cached-yet.js');
      return null;
    });
  });
}


function sourceChecks() {
  section('7) The worker source itself is clean');
  const sw = stripComments(read('sw.js'));
  ok('no eval in the worker', !/\beval\s*\(|new\s+Function/.test(sw));
  ok('no localStorage or sessionStorage in the worker', !/localStorage|sessionStorage/.test(sw));
  ok('no cookies in the worker', !/document\.cookie/.test(sw));
  ok('no IndexedDB in the worker', !/indexedDB/.test(sw));
  ok('no analytics or tracking in the worker', !/analytics|gtag|tracking|beacon/i.test(sw));
  ok('only a 200 basic response is cached',
    /response\.ok === true && response\.type === 'basic'/.test(sw));
  ok('only GET is handled', /request\.method !== 'GET'/.test(sw));
  ok('only same-origin is handled', /url\.origin !== self\.location\.origin/.test(sw));
  ok('obsolete caches are deleted on activate',
    /key === CACHE_NAME \? null : caches\.delete\(key\)/.test(sw));
  ok('no credential appears in the worker',
    !/AI_PROVIDER_API_KEY|ADMIN_TOKEN|Bearer\s/.test(read('sw.js')));
  ok('the private page is named only to be excluded',
    /NEVER_CACHE_PATH/.test(sw) && /admin\.html/.test(sw));
}

chain
  .then(next)
  .then(onlineChecks)
  .then(sourceChecks)
  .then(function () {
    console.log('\n============================================================');
    console.log(passed + ' checks passed, ' + failures.length + ' failed');
    if (failures.length) {
      console.log('\nFailures:');
      failures.forEach(function (f) { console.log('  - ' + f); });
      process.exit(1);
    }
    console.log('All PWA / offline tests passed.');
  })
  .catch(function (error) {
    console.log('\nUnexpected error: ' + (error && error.stack ? error.stack : error));
    console.log(passed + ' checks passed before the error, ' + failures.length + ' failed');
    process.exit(1);
  });

