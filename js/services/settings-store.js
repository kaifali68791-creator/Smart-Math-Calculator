/**
 * Smart Math Calculator - Settings store
 * -----------------------------------------------------------------------------
 * Small key/value settings object persisted in localStorage. Part 1 only needs
 * the display theme, but future parts can add their own keys (language,
 * solver mode, offline options, ...) without changing this module:
 *
 *   settings.set('language', 'hi');  // later parts
 *
 * Exposed API: createSettingsStore(storage, defaults)
 *   -> { get, set, all, reset, subscribe }
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SMC = root.SMC || {};
    root.SMC.createSettingsStore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_KEY = 'settings:v1';

  function createSettingsStore(storageService, options) {
    const config = options || {};
    const storageKey = config.key || DEFAULT_KEY;
    const defaultsMap = config.defaults || {};
    const listeners = [];

    function sanitize(value) {
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }

    const stored = sanitize(storageService.get(storageKey, {}));
    let values = Object.assign({}, defaultsMap, stored);

    function persist() {
      storageService.set(storageKey, values);
    }

    function notify() {
      const current = all();
      for (let i = 0; i < listeners.length; i += 1) {
        listeners[i](current);
      }
      return current;
    }

    function all() {
      return Object.assign({}, values);
    }

    function get(name, fallback) {
      if (Object.prototype.hasOwnProperty.call(values, name)) {
        return values[name];
      }
      return fallback !== undefined ? fallback : defaultsMap[name];
    }

    function set(name, value) {
      if (typeof name !== 'string' || name === '') {
        return all();
      }
      values[name] = value;
      persist();
      return notify();
    }

    function reset() {
      values = Object.assign({}, defaultsMap);
      storageService.remove(storageKey);
      return notify();
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return function noop() {};
      }
      listeners.push(listener);
      listener(all());
      return function unsubscribe() {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    }

    return {
      get: get,
      set: set,
      all: all,
      reset: reset,
      subscribe: subscribe
    };
  }

  return createSettingsStore;
});
