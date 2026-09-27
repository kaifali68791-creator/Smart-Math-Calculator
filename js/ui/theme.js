/**
 * Smart Math Calculator - theme controller
 * -----------------------------------------------------------------------------
 * Applies the stored theme preference ("system" | "light" | "dark") to the
 * <html data-theme="..."> attribute. The resolved light/dark value is what the
 * CSS uses, so the system preference keeps working live.
 *
 * Exposed API: SMC.createThemeController(settings) -> { subscribe, cycle, set,
 *               getPreference, getResolved }
 */
(function (root) {
  'use strict';

  const SMC = (root.SMC = root.SMC || {});
  const PREFERENCES = ['system', 'light', 'dark'];

  function normalize(preference) {
    return PREFERENCES.indexOf(preference) === -1 ? 'system' : preference;
  }

  function createThemeController(settings) {
    const media = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null;
    const listeners = [];
    let preference = normalize(settings ? settings.get('theme', 'system') : 'system');

    function getResolved() {
      if (preference === 'system') {
        return media && media.matches ? 'dark' : 'light';
      }
      return preference;
    }

    function notify() {
      const state = { preference: preference, resolved: getResolved() };
      for (let i = 0; i < listeners.length; i += 1) {
        listeners[i](state);
      }
      return state;
    }

    function apply() {
      document.documentElement.setAttribute('data-theme', getResolved());
      return notify();
    }

    function set(nextPreference) {
      preference = normalize(nextPreference);
      if (settings) {
        settings.set('theme', preference);
      }
      return apply();
    }

    function cycle() {
      const next = PREFERENCES[(PREFERENCES.indexOf(preference) + 1) % PREFERENCES.length];
      return set(next);
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return function noop() {};
      }
      listeners.push(listener);
      listener({ preference: preference, resolved: getResolved() });
      return function unsubscribe() {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    }

    if (media) {
      const onSystemChange = function () {
        if (preference === 'system') {
          apply();
        }
      };
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', onSystemChange);
      } else if (typeof media.addListener === 'function') {
        media.addListener(onSystemChange);
      }
    }

    apply();

    return {
      subscribe: subscribe,
      cycle: cycle,
      set: set,
      getPreference: function () {
        return preference;
      },
      getResolved: getResolved,
      preferences: PREFERENCES.slice()
    };
  }

  SMC.createThemeController = createThemeController;
})(typeof globalThis !== 'undefined' ? globalThis : this);
