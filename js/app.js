/**
 * Smart Math Calculator - application bootstrap
 * -----------------------------------------------------------------------------
 * Wires the modules together. Everything is local: no login, no database, no
 * API calls. Future parts can attach new modules to SMC.app / SMC without
 * touching this wiring (see README.md "Extension points").
 *
 * Load order (index.html): core -> services -> ui -> app
 */
(function (root) {
  'use strict';

  const SMC = (root.SMC = root.SMC || {});
  const dom = SMC.dom;

  const APP_NAME = 'Smart Math Calculator';
  const APP_VERSION = '1.4.0';
  const SETTINGS_DEFAULTS = { theme: 'system', calculatorMode: 'basic', angleMode: 'deg', language: 'en' };
  const HISTORY_LIMIT = 100;
  const THEME_KEYS = { system: 'theme.label.auto', light: 'theme.label.light', dark: 'theme.label.dark' };
  const THEME_NAMES = { system: 'Auto', light: 'Light', dark: 'Dark' };

  function wireThemeToggle(theme, i18n) {
    const button = dom.qs('[data-theme-toggle]');
    const label = dom.qs('[data-theme-label]');

    theme.subscribe(function (state) {
      const fallback = THEME_NAMES[state.preference] || THEME_NAMES.system;
      // Phase 2C: the theme label is rewritten here, so it follows the language.
      const key = THEME_KEYS[state.preference] || THEME_KEYS.system;
      dom.setText(label, i18n ? i18n.t(key) : fallback);
    });

    dom.on(button, 'click', function () {
      theme.cycle();
    });
  }

  function wireAppInfo(i18n) {
    // Phase 2C: the brand name is rewritten here, so it follows the language too.
    dom.setText(dom.qs('[data-app-name]'), i18n ? i18n.t('app.name') : APP_NAME);
    dom.setText(dom.qs('[data-app-version]'), 'v' + APP_VERSION);
  }

  /**
   * Phase 1 language wiring. The service is created from the existing settings
   * store, so the choice is persisted in smc:settings:v1 exactly like the theme
   * and the calculator mode. Switching language never reloads the page: the
   * service persists the value, notifies subscribers, and the dictionary pass
   * rewrites the [data-i18n] / [data-i18n-attr] elements in place.
   */
  function wireLanguageSelector(i18n) {
    const select = dom.qs('[data-language-select]');

    function reflect(language) {
      i18n.applyTo(document);
      if (select && select.value !== language) {
        select.value = language;
      }
    }

    // subscribe() fires immediately with the current language, so the saved
    // choice is applied on boot without any extra call.
    i18n.subscribe(reflect);

    dom.on(select, 'change', function () {
      // An unsupported value is ignored by setLanguage, so the UI cannot end up
      // in a state the dictionary does not know.
      i18n.setLanguage(select ? select.value : '');
    });
  }

  function boot() {
    const storage = SMC.createStorage();
    const settings = SMC.createSettingsStore(storage, { defaults: SETTINGS_DEFAULTS });
    const history = SMC.createHistoryStore(storage, { maxEntries: HISTORY_LIMIT });

    // Phase 1: the language service. Created BEFORE the views so every view can
    // receive it. English is the default, and it persists through `settings`.
    const i18n =
      typeof SMC.createI18n === 'function' ? SMC.createI18n(settings) : null;
    // Phase 2C: hand the same lookup to the modules that generate text at
    // runtime. The maths itself is never affected - only the words.
    if (i18n) {
      if (SMC.ExpressionEngine && typeof SMC.ExpressionEngine.setTranslator === 'function') {
        SMC.ExpressionEngine.setTranslator(function (key) { return i18n.t(key); });
      }
      if (SMC.NumberBase && typeof SMC.NumberBase.setTranslator === 'function') {
        SMC.NumberBase.setTranslator(function (key, params) { return i18n.t(key, params); });
      }
      if (SMC.AgeCalculator && typeof SMC.AgeCalculator.setTranslator === 'function') {
        SMC.AgeCalculator.setTranslator(function (key, params) { return i18n.t(key, params); });
      }
      // Phase 2D: the local solver's explanation text.
      if (SMC.MathSolver && typeof SMC.MathSolver.setTranslator === 'function') {
        SMC.MathSolver.setTranslator(function (key, params) { return i18n.t(key, params); });
      }
    }

    // The mode controls are created after the model but the getter is only
    // called when the user presses a key, so this is safe.
    let modeControls = null;
    const model = SMC.CalculatorModel.createCalculatorModel({
      engine: SMC.ExpressionEngine,
      format: SMC.Format,
      history: history,
      getAngleMode: function () {
        return modeControls ? modeControls.getAngleMode() : 'deg';
      }
    });

    const theme = SMC.createThemeController(settings);
    const navigation = SMC.createNavigation();

    const calculatorView = SMC.createCalculatorView({ model: model });

    const historyView = SMC.createHistoryView({
      history: history,
      format: SMC.Format,
      storage: storage,
      i18n: i18n,
      onSelect: function (entry) {
        model.loadHistoryEntry(entry);
      }
    });

    modeControls = SMC.createCalculatorModeControls({ settings: settings });

    // Part 3B-1: the local deterministic solver. It only uses the trusted
    // expression engine and the DEG/RAD setting - no network, no AI.
    const mathSolver =
      typeof SMC.createMathSolver === 'function'
        ? SMC.createMathSolver({
            engine: SMC.ExpressionEngine,
            format: SMC.Format,
            getAngleMode: function () {
              return modeControls ? modeControls.getAngleMode() : 'deg';
            }
          })
        : null;

    // Part 3B-2: optional AI fallback provider. It only ever receives a
    // backend endpoint URL (window.SMC_CONFIG.aiEndpoint) - never an API key.
    // Without a configured endpoint it never touches the network.
    // Phase 2E: getLanguage is a callback, so the AI reads the CURRENTLY selected
    // language on every request. Changing the language in the selector therefore
    // takes effect on the next question, with no rebuild and no page reload, and
    // no second language store is created - this is the same i18n service.
    const aiSolver =
      typeof SMC.createAIMathSolver === 'function'
        ? SMC.createAIMathSolver({
          getLanguage: function () { return i18n ? i18n.getLanguage() : 'en'; }
        })
        : null;

    // Part 3A Smart Solver UI, connected to the local solver (stage 1) and the
    // optional AI provider (stage 2). Kept separate from the calculator so
    // switching views never resets calculator state.
    const solverView =
      typeof SMC.createSolverView === 'function'
        ? SMC.createSolverView({ solver: mathSolver, aiSolver: aiSolver, i18n: i18n })
        : null;

    // Two extra offline tools. They follow the same view pattern, use the same
    // design tokens and never touch the network or any storage.
    const numberBaseView =
      typeof SMC.createNumberBaseView === 'function'
        ? SMC.createNumberBaseView({ i18n: i18n })
        : null;

    const ageView =
      typeof SMC.createAgeView === 'function'
        ? SMC.createAgeView({ i18n: i18n })
        : null;

    // Offline-first username: a local service plus a small first-run popup. It
    // only ever collects the username, never blocks the app, and the sync call
    // lives inside the service (this file performs no network request itself).
    const usernameService =
      typeof SMC.createUsernameService === 'function'
        ? SMC.createUsernameService(storage, {
          endpoint: root.SMC_CONFIG && root.SMC_CONFIG.usernameEndpoint
            ? root.SMC_CONFIG.usernameEndpoint
            : '',
          i18n: i18n
        })
        : null;

    const usernameView =
      usernameService && typeof SMC.createUsernameView === 'function'
        ? SMC.createUsernameView({ service: usernameService, i18n: i18n })
        : null;

    if (usernameView) {
      usernameView.init();
    }

    // The DEG/RAD switch re-evaluates the live preview instantly.
    let previousAngleMode = modeControls.getAngleMode();
    modeControls.subscribe(function (modes) {
      if (modes.angleMode !== previousAngleMode) {
        previousAngleMode = modes.angleMode;
        model.refresh();
      }
    });

    wireThemeToggle(theme, i18n);
    wireAppInfo(i18n);

    // Phase 1: the language selector. The service itself was created at the top
    // of boot() so every view could receive it. The selector is wired here, and
    // the dictionary pass runs last so it is never undone by the app-name pass.
    if (i18n) {
      wireLanguageSelector(i18n);
    }

    // Shared access point for debugging and for later parts (solver, i18n, ...).
    SMC.app = {
      name: APP_NAME,
      version: APP_VERSION,
      storage: storage,
      settings: settings,
      history: history,
      model: model,
      theme: theme,
      navigation: navigation,
      calculatorView: calculatorView,
      historyView: historyView,
      modeControls: modeControls,
      mathSolver: mathSolver,
      aiSolver: aiSolver,
      solverView: solverView,
      numberBaseView: numberBaseView,
      ageView: ageView,
      i18n: i18n,
      usernameService: usernameService,
      usernameView: usernameView
    };
  }

  /**
   * Offline / installable app shell.
   * Registers sw.js, which caches only the local static files. It is
   * deliberately fire-and-forget: the app never waits for it, a browser without
   * support simply skips it, and any failure is swallowed so the calculator can
   * never be blocked by it. No UI is added - the browser's own install
   * affordance is used. Nothing here performs a request of its own; the worker
   * leaves every /api/ route to the network.
   */
  function registerServiceWorker() {
    try {
      if (typeof navigator === 'undefined' || !navigator.serviceWorker) { return; }
      navigator.serviceWorker.register('sw.js').catch(function () {
        // Offline caching is an enhancement, never a requirement.
      });
    } catch (error) {
      // Ignore: the app is fully usable without a service worker.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  registerServiceWorker();
})(typeof globalThis !== 'undefined' ? globalThis : this);
