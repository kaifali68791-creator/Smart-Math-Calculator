/**
 * Smart Math Calculator - Storage service
 * -----------------------------------------------------------------------------
 * Thin, defensive wrapper around window.localStorage.
 *
 * Everything the app persists goes through this module, so later parts can
 * swap or extend the storage layer (offline sync, cloud backup, ...) in one
 * place without touching the features. When localStorage is unavailable
 * (private mode, blocked cookies, some file:// setups) an in-memory fallback is
 * used so the calculator keeps working - it just will not survive a reload.
 *
 * Exposed API: createStorage(scope?) -> { get, set, remove, clearAll, isPersistent, key }
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SMC = root.SMC || {};
    root.SMC.createStorage = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEY_PREFIX = 'smc:';

  /** Detects a usable localStorage implementation. */
  function detectLocalStorage(scopeObject) {
    if (!scopeObject || !scopeObject.localStorage) {
      return null;
    }
    try {
      const probeKey = KEY_PREFIX + '__probe__';
      scopeObject.localStorage.setItem(probeKey, '1');
      scopeObject.localStorage.removeItem(probeKey);
      return scopeObject.localStorage;
    } catch (error) {
      return null;
    }
  }

  /**
   * @param {object} [scopeObject] injectable for tests (defaults to globalThis)
   */
  function createStorage(scopeObject) {
    const host = scopeObject || (typeof globalThis !== 'undefined' ? globalThis : null);
    const localStore = detectLocalStorage(host);
    const memory = {};

    function readRaw(key) {
      if (localStore) {
        try {
          return localStore.getItem(key);
        } catch (error) {
          return null;
        }
      }
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    }

    function writeRaw(key, rawValue) {
      if (localStore) {
        try {
          localStore.setItem(key, rawValue);
          return true;
        } catch (error) {
          return false;
        }
      }
      memory[key] = rawValue;
      return true;
    }

    function removeRaw(key) {
      if (localStore) {
        try {
          localStore.removeItem(key);
        } catch (error) {
          /* ignore - nothing else we can do */
        }
        return;
      }
      delete memory[key];
    }

    return {
      /** true when values actually survive a reload of the browser. */
      isPersistent: !!localStore,

      /** Adds the app namespace to a key, e.g. "history:v1" -> "smc:history:v1" */
      key: function (name) {
        return KEY_PREFIX + name;
      },

      get: function (name, fallback) {
        const raw = readRaw(KEY_PREFIX + name);
        if (raw === null || raw === undefined) {
          return fallback;
        }
        try {
          const parsed = JSON.parse(raw);
          return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (error) {
          return fallback;
        }
      },

      set: function (name, value) {
        try {
          return writeRaw(KEY_PREFIX + name, JSON.stringify(value));
        } catch (error) {
          return false;
        }
      },

      remove: function (name) {
        removeRaw(KEY_PREFIX + name);
      },

      /** Removes every key owned by this app (never touches other apps data). */
      clearAll: function () {
        if (localStore) {
          const owned = [];
          for (let i = 0; i < localStore.length; i += 1) {
            const stored = localStore.key(i);
            if (stored && stored.indexOf(KEY_PREFIX) === 0) {
              owned.push(stored);
            }
          }
          owned.forEach((stored) => removeRaw(stored));
          return;
        }
        Object.keys(memory).forEach((stored) => {
          delete memory[stored];
        });
      }
    };
  }

  return createStorage;
});
