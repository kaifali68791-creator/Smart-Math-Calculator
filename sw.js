/**
 * Smart Math Calculator - offline app shell service worker.
 * -----------------------------------------------------------------------------
 * The calculator, the scientific keypad, the LOCAL maths solver, the number
 * base converter, the age calculator, the Math Keyboard, the navigation and the
 * five-language system are all plain local files, so caching the app shell is
 * enough to make the whole app work with no network at all.
 *
 * WHAT THIS WORKER DELIBERATELY DOES NOT TOUCH
 *   * The optional AI backend. `/api/...` requests are passed straight through
 *     to the network and are NEVER cached, so an AI answer is never stored and
 *     the existing graceful "AI unavailable" behaviour is preserved.
 *   * The private administration page. `admin.html` is not precached and its
 *     navigations are never answered from the cache, so no private screen and
 *     no credential can be served from (or written to) the cache.
 *   * Cross-origin requests of any kind. Only same-origin GETs are considered.
 *   * Anything but a 200 basic response is never written to a cache.
 *
 * There is no telemetry, no cookie, no credential and no user data here. The
 * only thing stored is the list of static files below.
 *
 * Exposed lifecycle: install -> precache, activate -> drop old caches,
 * fetch -> network-first for navigations, stale-while-revalidate for assets.
 */
'use strict';

/* Bump this when any cached file changes; old caches are deleted on activate. */
var CACHE_VERSION = 'v1';
var CACHE_PREFIX = 'smc-app-';
var CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

/** The app shell: exactly the local files index.html loads. Nothing else. */
var APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './css/base.css',
  './css/calculator.css',
  './css/history.css',
  './css/solver.css',
  './css/username.css',
  './js/config.js',
  './js/core/expression-engine.js',
  './js/core/format.js',
  './js/core/calculator-model.js',
  './js/core/number-base.js',
  './js/core/age-calculator.js',
  './js/services/storage.js',
  './js/services/history-store.js',
  './js/services/settings-store.js',
  './js/services/i18n.js',
  './js/services/math-solver.js',
  './js/services/ai-math-solver.js',
  './js/services/username-service.js',
  './js/ui/dom.js',
  './js/ui/theme.js',
  './js/ui/calculator-view.js',
  './js/ui/calculator-modes.js',
  './js/ui/history-view.js',
  './js/ui/number-base-view.js',
  './js/ui/age-view.js',
  './js/ui/navigation.js',
  './js/ui/math-keyboard.js',
  './js/ui/math-keyboard-view.js',
  './js/ui/solver-view.js',
  './js/ui/username-view.js',
  './js/app.js'
];

/** Offline fallbacks for a navigation, tried in order. */
var SHELL_URLS = ['./index.html', './'];

/**
 * A request is never cached when it touches an API route or the private page.
 * Kept as a list so the rule is easy to read and to test.
 */
var NEVER_CACHE_PATH = ['/api/', '/api/admin/', 'admin.html', 'admin/'];

function isPrivateOrApiPath(pathname) {
  var path = String(pathname || '').toLowerCase();
  for (var i = 0; i < NEVER_CACHE_PATH.length; i += 1) {
    if (path.indexOf(NEVER_CACHE_PATH[i]) !== -1) {
      return true;
    }
  }
  return false;
}

/** Only a plain same-origin 200 response may be written to a cache. */
function isCacheable(response) {
  return !!response && response.ok === true && response.type === 'basic';
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Each file is added on its own so one unavailable file can never abort
      // the whole install; the app shell is still cached and the page still
      // works online.
      return Promise.all(APP_SHELL.map(function (url) {
        return cache.add(url).catch(function () {
          return null;
        });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        // Anything not this exact version is obsolete and is removed.
        return key === CACHE_NAME ? null : caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/** Network first, cached shell second. A real navigation always wins. */
function handleNavigation(request) {
  return fetch(request).then(function (response) {
    if (isCacheable(response)) {
      // Keep the shell fresh for the next offline visit.
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.put(request, copy);
      });
    }
    return response;
  }).catch(function () {
    return caches.match(request, { ignoreSearch: true }).then(function (hit) {
      if (hit) { return hit; }
      return matchAnyShell();
    });
  });
}

/** First cached shell entry that exists, so an offline launch always renders. */
function matchAnyShell() {
  return caches.match(SHELL_URLS[0]).then(function (hit) {
    if (hit) { return hit; }
    return caches.match(SHELL_URLS[1]);
  });
}

/**
 * Stale while revalidate: answer instantly from the cache so the app opens
 * offline, then quietly refresh the entry for the next visit.
 */
function handleAsset(request) {
  return caches.match(request, { ignoreSearch: false }).then(function (cached) {
    var network = fetch(request).then(function (response) {
      if (isCacheable(response)) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          return cache.put(request, copy);
        });
      }
      return response;
    }).catch(function () {
      return cached || Response.error();
    });
    return cached || network;
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;

  // Never touch anything that is not a plain same-origin GET.
  if (!request || request.method !== 'GET') { return; }

  var url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }
  if (url.origin !== self.location.origin) { return; }
  // AI backend, username sync, health and the private page stay on the network.
  if (isPrivateOrApiPath(url.pathname)) { return; }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  event.respondWith(handleAsset(request));
});

// Lets a future update button activate a waiting worker without a reload. No UI
// is added here; nothing calls it until such a control exists.
self.addEventListener('message', function (event) {
  if (event && event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
