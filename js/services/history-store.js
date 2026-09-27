/**
 * Smart Math Calculator - History store
 * -----------------------------------------------------------------------------
 * Local, dependency free calculator history. Entries are kept newest first and
 * persisted through the storage service (localStorage with a memory fallback).
 * No database, no network: everything stays in the browser.
 *
 * Stored shape (smc:history:v1):
 *   [{ id, expression, result, resultText, timestamp, angleMode? }, ...]
 *
 * Exposed API: createHistoryStore(storage, options)
 *   -> { MAX_ENTRIES, list, add, remove, clear, count, subscribe }
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SMC = root.SMC || {};
    root.SMC.createHistoryStore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_KEY = 'history:v1';
  const DEFAULT_MAX_ENTRIES = 100;

  /**
   * @param {{get:Function, set:Function, remove:Function}} storage
   * @param {{key?:string, maxEntries?:number}} [options]
   */
  function createHistoryStore(storageService, settings) {
    const config = settings || {};
    const storageKey = config.key || DEFAULT_KEY;
    const maxEntries = Math.max(1, config.maxEntries || DEFAULT_MAX_ENTRIES);
    const listeners = [];

    function isValidEntry(entry) {
      return (
        !!entry &&
        typeof entry.expression === 'string' &&
        entry.expression !== '' &&
        typeof entry.result === 'number' &&
        Number.isFinite(entry.result)
      );
    }

    function load() {
      const stored = storageService.get(storageKey, []);
      if (!Array.isArray(stored)) {
        return [];
      }
      return stored.filter(isValidEntry).slice(0, maxEntries);
    }

    let entries = load();

    function persist() {
      storageService.set(storageKey, entries);
    }

    function notify() {
      const current = list();
      for (let i = 0; i < listeners.length; i += 1) {
        listeners[i](current);
      }
      return current;
    }

    function createId() {
      return 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function list() {
      return entries.map((entry) => ({
        id: entry.id,
        expression: entry.expression,
        result: entry.result,
        resultText: entry.resultText,
        timestamp: entry.timestamp,
        angleMode: entry.angleMode
      }));
    }

    /**
     * Adds a calculation to the top of the history.
     * @param {{expression:string, result:number, resultText?:string}} entry
     */
    function add(entry) {
      if (!isValidEntry(entry)) {
        return null;
      }
      const stored = {
        id: createId(),
        expression: entry.expression,
        result: entry.result,
        resultText: typeof entry.resultText === 'string' ? entry.resultText : String(entry.result),
        timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
        angleMode: entry.angleMode === 'deg' || entry.angleMode === 'rad' ? entry.angleMode : undefined
      };
      entries.unshift(stored);
      if (entries.length > maxEntries) {
        entries = entries.slice(0, maxEntries);
      }
      persist();
      notify();
      return stored;
    }

    function remove(id) {
      const before = entries.length;
      entries = entries.filter((entry) => entry.id !== id);
      if (entries.length !== before) {
        persist();
        notify();
      }
      return entries.length;
    }

    function clear() {
      entries = [];
      storageService.remove(storageKey);
      notify();
      return entries;
    }

    function count() {
      return entries.length;
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return function noop() {};
      }
      listeners.push(listener);
      listener(list());
      return function unsubscribe() {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    }

    return {
      MAX_ENTRIES: maxEntries,
      list: list,
      add: add,
      remove: remove,
      clear: clear,
      count: count,
      subscribe: subscribe
    };
  }

  return createHistoryStore;
});
