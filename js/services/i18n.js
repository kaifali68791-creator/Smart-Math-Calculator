/**
 * Smart Math Calculator - i18n service (Phase 1 foundation + Phase 2A interpolation)
 * -----------------------------------------------------------------------------
 * A small, dependency-free translation foundation. It follows the same UMD /
 * SMC.* pattern and DI style as the other services, so it can be loaded in the
 * browser and required directly in Node tests.
 *
 * WHAT PHASE 1 COVERS (deliberately small)
 *   Only a handful of clearly visible application chrome strings: the Dashboard,
 *   Calculator, Smart Solver, History and About labels, plus Language, Copy,
 *   Clear and Settings. Everything else stays in English for now and is
 *   translated in later, separately reviewed phases. The calculator, the
 *   scientific keypad, the local solver, the AI solver, the converter, the age
 *   calculator and the backend are all untouched by this file.
 *
 * INTERPOLATION (Phase 2A)
 *   t(key, params) substitutes NUMBERED placeholders such as {0} and {1}:
 *     t('test.greeting', ['Kaif'])      -> "Welcome, Kaif"
 *     t('test.pair', ['Decimal','Binary']) -> "Decimal converted to Binary"
 *   Numbered placeholders are what makes a sentence translatable: a language is
 *   free to put the values in a different order, which plain concatenation
 *   ('a' + x + 'b') can never express. t(key) with no params is unchanged and is
 *   still the normal call, so every Phase 1 call site keeps working.
 *
 *   Rules, in order of importance:
 *     * TEXT ONLY. A parameter is never evaluated, parsed or rendered. The
 *       result is a plain string; the caller must still write it into the DOM
 *       with textContent / setAttribute, exactly as before.
 *     * Only {0}, {1}, {2} ... are recognised. {{0}} and {name} are not.
 *     * A placeholder with no matching parameter is LEFT UNCHANGED, so a
 *       missing value is visible instead of silently blank. It never throws.
 *     * Extra parameters beyond the last placeholder are ignored.
 *     * Only string, finite number and boolean parameters are inserted. Anything
 *       else (object, array, function, symbol, NaN, Infinity) becomes an empty
 *       string, so no object can ever be stringified into the page.
 *
 * STORAGE
 *   The chosen language is persisted through the EXISTING settings store
 *   (settings.get / settings.set, key 'language', localStorage
 *   `smc:settings:v1`). No new storage mechanism, no new key, no cookies.
 *
 * SAFETY
 *   * No innerHTML, no eval, no new Function. The DOM pass only ever writes
 *     textContent or an attribute value.
 *   * A missing key falls back to English, and a missing translation falls back
 *     to the English text, so the UI can never end up blank.
 *   * An invalid stored language falls back to 'en' instead of throwing.
 *
 * Exposed API: createI18n(settings) -> {
 *   t(key, params?), setLanguage, getLanguage, isSupported, subscribe, applyTo,
 *   applyHtmlLang, LANGUAGES, NAMES, CODES, HTML_LANG, DICTIONARY
 * }
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SMC = root.SMC || {};
    root.SMC.createI18n = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SETTINGS_KEY = 'language';
  const DEFAULT_LANGUAGE = 'en';

  /**
   * The five supported options, in the order the selector shows them.
   * `native` is written in the language itself; `code` is the value stored in
   * the settings store and written to <html lang>.
   */
  const LANGUAGES = Object.freeze([
    Object.freeze({ code: 'en', native: 'English' }),
    Object.freeze({ code: 'hi', native: 'हिंदी' }),
    Object.freeze({ code: 'hi-Latn', native: 'Roman Hindi' }),
    Object.freeze({ code: 'te', native: 'తెలుగు' }),
    Object.freeze({ code: 'te-Latn', native: 'Roman Telugu' })
  ]);

  const CODES = LANGUAGES.map(function (language) { return language.code; });

  /** The native label for a code, used by the selector and the dictionary. */
  const NAMES = LANGUAGES.reduce(function (map, language) {
    map[language.code] = language.native;
    return map;
  }, Object.create(null));

  /**
   * The value written to <html lang>. The Roman-script variants use a BCP 47
   * script subtag so a screen reader picks the right pronunciation.
   */
  const HTML_LANG = Object.freeze({
    en: 'en',
    hi: 'hi',
    'hi-Latn': 'hi-Latn',
    te: 'te',
    'te-Latn': 'te-Latn'
  });

  /**
   * Phase 1 dictionary. English is the fallback for every key, so a key that is
   * missing from another language still shows readable text.
   * Roman Hindi and Roman Telugu are natural Roman-script renderings, not
   * English copies.
   */
  const DICTIONARY = {
    en: {
      'app.name': 'Smart Math Calculator',
      'nav.dashboard': 'Dashboard',
      'nav.calculator': 'Calculator',
      'nav.solver': 'Smart Solver',
      'nav.converter': 'Converter',
      'nav.age': 'Age',
      'nav.about': 'About',
      'label.language': 'Language',
      'label.copy': 'Copy',
      'label.clear': 'Clear',
      'label.settings': 'Settings',
      'label.history': 'History',
      // Phase 2A interpolation examples. Real production keys arrive in later
      // phases; these exist to prove {0}/{1} substitution in all five
      // languages. Note the Hindi and Telugu word orders differ from English.
      'test.greeting': 'Welcome, {0}',
      'test.pair': '{0} converted to {1}'
    },
    hi: {
      'app.name': 'स्मार्ट मैथ कैलकुलेटर',
      'nav.dashboard': 'डैशबोर्ड',
      'nav.calculator': 'कैलकुलेटर',
      'nav.solver': 'स्मार्ट सॉल्वर',
      'nav.converter': 'कन्वर्टर',
      'nav.age': 'उम्र',
      'nav.about': 'परिचय',
      'label.language': 'भाषा',
      'label.copy': 'कॉपी',
      'label.clear': 'साफ़ करें',
      'label.settings': 'सेटिंग्स',
      'label.history': 'इतिहास',
      'test.greeting': 'स्वागत है, {0}',
      'test.pair': '{0} को {1} में बदला गया'
    },
    // Roman Hindi: the same words written the way they are spoken.
    'hi-Latn': {
      'app.name': 'Smart Math Calculator',
      'nav.dashboard': 'Dashboard',
      'nav.calculator': 'Calculator',
      'nav.solver': 'Smart Solver',
      'nav.converter': 'Converter',
      'nav.age': 'Umra',
      'nav.about': 'Parichay',
      'label.language': 'Bhasha',
      'label.copy': 'Copy',
      'label.clear': 'Saaf Karein',
      'label.settings': 'Settings',
      'label.history': 'Itihas',
      'test.greeting': 'Svaagat, {0}',
      'test.pair': '{0} ko {1} mein badla gaya'
    },
    te: {
      'app.name': 'స్మార్ట్ మ్యాథ్ కాలిక్యులేటర్',
      'nav.dashboard': 'డాష్‌బోర్డ్',
      'nav.calculator': 'కాలిక్యులేటర్',
      'nav.solver': 'స్మార్ట్ సాల్వర్',
      'nav.converter': 'కన్వర్టర్',
      'nav.age': 'వయస్సు',
      'nav.about': 'గురించి',
      'label.language': 'భాష',
      'label.copy': 'కాపీ',
      'label.clear': 'క్లియర్ చేయండి',
      'label.settings': 'సెట్టింగ్‌లు',
      'label.history': 'చరిత్ర',
      'test.greeting': 'స్వాగతం, {0}',
      'test.pair': '{0} నుండి {1}కు మార్చబడింది'
    },
    // Roman Telugu: the same words transliterated into Latin letters.
    'te-Latn': {
      'app.name': 'Smart Math Calculator',
      'nav.dashboard': 'Dashboard',
      'nav.calculator': 'Calculator',
      'nav.solver': 'Smart Solver',
      'nav.converter': 'Converter',
      'nav.age': 'Vayassu',
      'nav.about': 'Gurinchi',
      'label.language': 'Bhasha',
      'label.copy': 'Kapi',
      'label.clear': 'Clear Cheyandi',
      'label.settings': 'Settings',
      'label.history': 'Charitra',
      'test.greeting': 'Svagatam, {0}',
      'test.pair': '{0} nundi {1}ku marchabedindi'
    }
  };

  /**
   * Native names of the five languages. These are the same in every language
   * (a language names itself the same way), so they are shared rather than
   * duplicated per dictionary, but they are still resolved through t() so the
   * markup can use one uniform data-i18n mechanism.
   */
  function languageNames(language) {
    return {
      'lang.name.en': NAMES.en,
      'lang.name.hi': NAMES.hi,
      'lang.name.hi-Latn': NAMES['hi-Latn'],
      'lang.name.te': NAMES.te,
      'lang.name.te-Latn': NAMES['te-Latn']
    };
  }

  /** True only for one of the five supported codes. */
  function isSupported(language) {
    return typeof language === 'string' && CODES.indexOf(language) !== -1;
  }

  /**
   * Matches ONLY a numbered placeholder: {0} {1} {12} ... and nothing else.
   * A doubled brace ({{0}}) or a named brace ({name}) is deliberately not a
   * placeholder. The capture group is digits only, so the pattern can never be
   * used to inject anything: it matches literal text and nothing else.
   */
  const NUMBERED_PLACEHOLDER = /\{(\d+)\}/g;

  /**
   * Turns one parameter into safe plain text.
   * Only strings, finite numbers and booleans are accepted. Objects, arrays,
   * functions, symbols, NaN and Infinity become an empty string, so a caller can
   * never stringify a whole object graph into the page by accident. There is no
   * HTML escaping here on purpose: the result is a plain string, and the DOM
   * layer already writes it with textContent / setAttribute, which is the real
   * protection against markup. Escaping as well would show stray entities.
   */
  function toPlainText(value) {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number') {
      return isFinite(value) ? String(value) : '';
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    return '';
  }

  /**
   * Substitutes numbered placeholders in a template.
   * @param {string} template the raw dictionary text
   * @param {Array} params values, indexed from 0
   * @returns {string} plain text, never a throw
   */
  function interpolate(template, params) {
    if (typeof template !== 'string' || template.indexOf('{') === -1) {
      return template;
    }
    if (!Array.isArray(params)) {
      // A single non-array value is treated as the first parameter, so
      // t(key, 'Kaif') is a convenient shorthand for t(key, ['Kaif']).
      if (params === null || params === undefined) {
        return template;
      }
      return interpolate(template, [params]);
    }
    // String.prototype.replace with a FUNCTION callback. The replacement is
    // returned as a literal string, so "$&"-style sequences inside a parameter
    // are never re-expanded, and nothing is ever evaluated.
    return template.replace(NUMBERED_PLACEHOLDER, function (placeholder, digits) {
      const index = Number(digits);
      if (!Number.isFinite(index) || index < 0) {
        return placeholder;
      }
      if (index >= params.length) {
        // No such parameter: leave the placeholder visible. It never throws and
        // the reader can see that a value is missing.
        return placeholder;
      }
      const value = params[index];
      if (value === undefined || value === null) {
        return placeholder;
      }
      return toPlainText(value);
    });
  }

  function createI18n(settings) {
    const listeners = [];

    function normalize(language) {
      return isSupported(language) ? language : DEFAULT_LANGUAGE;
    }

    // The stored preference wins; anything invalid silently becomes English.
    let current = normalize(
      settings ? settings.get(SETTINGS_KEY, DEFAULT_LANGUAGE) : DEFAULT_LANGUAGE
    );

    function getLanguage() {
      return current;
    }

    /**
     * Looks a key up in the current language, then in English, then the shared
     * language names, then returns the key itself, so the UI degrades visibly
     * instead of going blank.
     *
     * Phase 2A: an optional second argument supplies values for numbered
     * placeholders. t(key) is byte-for-byte the old behaviour, and passing
     * params to a key that has no placeholders is harmless.
     *
     * @param {string} key
     * @param {Array|string|number} [params]
     * @returns {string}
     */
    function t(key, params) {
      const name = typeof key === 'string' ? key : '';
      if (name === '') {
        return '';
      }
      // Resolve the template first, with the unchanged Phase 1 fallback chain.
      const active = DICTIONARY[current] || DICTIONARY[DEFAULT_LANGUAGE];
      if (Object.prototype.hasOwnProperty.call(active, name)) {
        return interpolate(active[name], params);
      }
      const fallback = DICTIONARY[DEFAULT_LANGUAGE];
      if (Object.prototype.hasOwnProperty.call(fallback, name)) {
        return interpolate(fallback[name], params);
      }
      // The language names are shared across every dictionary.
      const names = languageNames(current);
      if (Object.prototype.hasOwnProperty.call(names, name)) {
        return names[name];
      }
      // Unknown key: return the key itself. No interpolation is attempted, so a
      // key name that happens to contain braces is returned exactly as before.
      return name;
    }

    function notify() {
      for (let i = 0; i < listeners.length; i += 1) {
        listeners[i](current);
      }
      return current;
    }

    /**
     * Switches language, persists it through the existing settings store and
     * notifies subscribers. An unsupported value is ignored entirely so the
     * current language can never be broken.
     * @returns {string} the language now in effect
     */
    function setLanguage(language) {
      if (!isSupported(language)) {
        return current;
      }
      current = language;
      if (settings) {
        settings.set(SETTINGS_KEY, language);
      }
      notify();
      return current;
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return function noop() {};
      }
      listeners.push(listener);
      listener(current);
      return function unsubscribe() {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    }

    /** Keeps <html lang> honest for screen readers and browser translation. */
    function applyHtmlLang(doc) {
      const target = doc || (typeof document !== 'undefined' ? document : null);
      if (!target || !target.documentElement) {
        return current;
      }
      target.documentElement.setAttribute('lang', HTML_LANG[current] || current);
      return current;
    }

    /**
     * Applies the dictionary to the page.
     *   [data-i18n]      -> textContent
     *   [data-i18n-attr] -> "placeholder:nav.calculator, aria-label:label.clear"
     * Attributes are written with setAttribute, so nothing is ever parsed as
     * markup and innerHTML is never used.
     */
    function applyTo(scope) {
      const target = scope || (typeof document !== 'undefined' ? document : null);
      if (!target || typeof target.querySelectorAll !== 'function') {
        return current;
      }
      applyHtmlLang(target);

      const texts = Array.prototype.slice.call(target.querySelectorAll('[data-i18n]'));
      texts.forEach(function (element) {
        element.textContent = t(element.getAttribute('data-i18n'));
      });

      const attributes = Array.prototype.slice.call(target.querySelectorAll('[data-i18n-attr]'));
      attributes.forEach(function (element) {
        const list = element.getAttribute('data-i18n-attr') || '';
        list.split(',').forEach(function (part) {
          const trimmed = part.trim();
          if (trimmed === '') {
            return;
          }
          const separator = trimmed.indexOf(':');
          if (separator === -1) {
            return;
          }
          const attribute = trimmed.slice(0, separator).trim();
          const key = trimmed.slice(separator + 1).trim();
          if (attribute === '' || key === '') {
            return;
          }
          element.setAttribute(attribute, t(key));
        });
      });
      return current;
    }

    return {
      LANGUAGES: LANGUAGES,
      NAMES: NAMES,
      CODES: CODES,
      HTML_LANG: HTML_LANG,
      DICTIONARY: DICTIONARY,
      DEFAULT_LANGUAGE: DEFAULT_LANGUAGE,
      SETTINGS_KEY: SETTINGS_KEY,
      t: t,
      setLanguage: setLanguage,
      getLanguage: getLanguage,
      isSupported: isSupported,
      subscribe: subscribe,
      applyTo: applyTo,
      applyHtmlLang: applyHtmlLang
    };
  }

  /**
   * PHASE 2B - static user-facing text from index.html.
   * Kept in its own block and merged into DICTIONARY below, so the Phase 1
   * dictionary above stays exactly as it was. English is authoritative: every
   * value here is the existing English text from the page, unchanged.
   *
   * Only STATIC markup text lives here. Strings that JavaScript writes later
   * (calculator errors, keypad aria labels, solver titles, converter results,
   * age messages, the username greeting) are Phase 2C and are NOT here.
   *
   * Keys already provided by Phase 1 are reused rather than duplicated:
   * nav.calculator / nav.solver / nav.converter / nav.age / nav.about,
   * label.history and label.clear.
   */
  const STATIC_UI = {
    en: {
      'app.meta.title': 'Smart Math Calculator',
      'app.meta.description': 'A fast, mobile friendly calculator that runs completely in your browser. Percentages, brackets and local history included.',
      'nav.aria.sections': 'Sections',
      'theme.label.auto': 'Auto',
      'theme.aria.toggle': 'Change colour theme',
      'calc.aria.keypad': 'Calculator keypad',
      'calc.aria.mode': 'Calculator mode',
      'calc.mode.basic': 'Basic',
      'calc.mode.scientific': 'Scientific',
      'calc.aria.angle': 'Angle unit for trigonometry',
      'calc.aria.display': 'Calculator display',
      'calc.aria.scientific': 'Scientific functions',
      'calc.aria.keys': 'Calculator keys',
      'calc.hint': 'Keyboard: 0-9 · + − × ÷ · % · ^ · ! · ( ) · Enter = equals · Backspace · Esc = clear',
      'history.aria.panel': 'Calculation history',
      // Split around the <strong>=</strong> so that element is preserved.
      'history.empty.lead': 'No calculations yet. Press',
      'history.empty.tail': 'and the calculation shows up here.',
      'solver.badge': 'Local first · optional AI fallback',
      'solver.title': 'Smart Math Solver',
      'solver.desc': 'Enter any mathematics question and choose how you want the solution.',
      'solver.note': 'Supported questions are answered on this device: arithmetic, percentages and fractions, simple linear and quadratic equations, powers, roots, basic trigonometry and simple area/circumference questions. Anything else falls back to the optional AI solver when a backend endpoint is configured, and is reported honestly as not supported otherwise.',
      'solver.aria.mode': 'Solution mode',
      'solver.mode.direct': 'Direct Answer',
      'solver.mode.full': 'Full Explanation',
      'solver.mode.hint': 'Direct Answer shows only the final answer. Full Explanation shows the steps the solver used.',
      'solver.label.question': 'Your math question',
      'solver.placeholder.question': 'Type your math question here...',
      'solver.btn.solve': 'Solve Question',
      'solver.examples.title': 'Try an example',
      'solver.examples.hint': 'Selecting an example only fills the question box. Choose a mode and press Solve Question.',
      'solver.offline': 'Calculator and supported solver questions stay on this device - no account, no server. The AI fallback runs only for unsupported questions and only when a backend endpoint is configured.',
      'tool.badge.offline': 'Works offline',
      'converter.title': 'Number System Converter',
      'converter.desc': 'Convert a number between decimal, binary, octal and hexadecimal. Everything happens in this browser - nothing is sent anywhere.',
      'converter.label.from': 'From',
      'converter.label.to': 'To',
      'converter.label.number': 'Number',
      'converter.aria.from': 'Select the number system you are converting from.',
      'converter.aria.to': 'Select the number system you want to convert to.',
      'converter.aria.number': 'Enter your number.',
      'converter.hint': 'Binary uses only 0 and 1. Octal uses 0 to 7. Decimal uses 0 to 9. Hexadecimal uses 0 to 9 and the letters A to F.',
      'converter.base.decimal': 'Decimal',
      'converter.base.binary': 'Binary',
      'converter.base.octal': 'Octal',
      'converter.base.hexadecimal': 'Hexadecimal',
      'converter.btn.convert': 'Convert',
      'converter.btn.copy': 'Copy result',
      'converter.result.phrase': 'converted to',
      'age.title': 'Age Calculator',
      'age.desc': 'Enter your date of birth to see how old you are. Your date is read in this browser only - it is never sent or stored anywhere.',
      'age.label.dob': 'Date of birth',
      'age.aria.dob': 'Enter your date of birth.',
      'age.hint': 'Leap years and different month lengths are handled for you.',
      'age.btn.calculate': 'Calculate age',
      'age.btn.refresh': 'Refresh totals',
      'age.result.title': 'Your age',
      'age.stat.years': 'Years',
      'age.stat.months': 'Months',
      'age.stat.days': 'Days',
      'age.total.title': 'Total time lived',
      'age.total.days': 'Total days',
      'age.total.weeks': 'Total weeks',
      'age.total.hours': 'Total hours',
      'age.total.minutes': 'Total minutes',
      'age.total.seconds': 'Total seconds',
      'age.birthday.title': 'Next birthday',
      'age.birthday.turning': 'turning',
      'about.title': 'About the Developer',
      'about.badge': 'Developer',
      'about.field.name': 'Name',
      'about.field.college': 'College',
      'about.field.branch': 'Branch',
      'about.field.year': 'Year',
      'about.field.roll': 'Roll No.',
      'about.subtitle': 'Why I Built Smart Math Calculator',
      'about.story.1': 'I am from North India and currently studying in South India, where my classroom environment is different from the language environment I grew up with. In my mathematics classes, Telugu and English are commonly used together. I am more comfortable understanding Hindi and English, so sometimes the difference in language and pronunciation can make a particular mathematical concept or problem harder for me to follow. My mathematics teacher explains the concepts very well, and I still understand most of the lessons even though the language and the pronunciation are not the ones I am used to.',
      'about.story.2': 'Even so, there are moments when a particular problem or idea does not click, usually because of the way the explanation is phrased. In those moments I usually ask an AI tool to explain the same question to me more clearly, step by step, in a way I can follow.',
      'about.story.3': 'That is when the idea came to me: why not build my own application that can help me understand mathematics clearly, and can also be useful to other students? That idea became Smart Math Calculator.',
      'about.story.4': 'The app is not meant to only produce an answer. It is meant to help you understand the solution, through clear step-by-step explanations written in a way that is easy to follow.',
      'about.story.5': 'I also want the app to support multiple languages, so that students from different language backgrounds can use it comfortably, including English, Hindi or Roman Hindi, and Telugu or Roman Telugu.',
      'about.advantages.title': 'Key Advantages',
      'about.advantages.1': 'Local first: many supported calculations are done right in your browser, without sending your question anywhere.',
      'about.advantages.2': 'Step-by-step explanations: for supported problems the Smart Math Solver can show the question, the given values, the formula, the substitution, the working, a check of the answer and the final answer.',
      'about.advantages.3': 'Optional AI fallback: if a question is outside what the local solver can do, the app can use the AI solver, but only when an AI backend has been set up and is available. Not every question is sent to the AI.',
      'about.advantages.4': 'Five languages: English, Hindi, Roman Hindi, Telugu and Roman Telugu, so students from different language backgrounds can read the interface and follow the explanations more easily.',
      'about.advantages.5': 'Math Keyboard: a small keyboard under the question box with the symbols and functions you use most, such as π, √, ∛, ², ³, +, −, ×, ÷, sin(, cos(, tan( and other supported functions. Tapping a key puts it at the cursor, and it only offers what this app can actually handle.',
      'about.advantages.6': 'Two extra tools: a Number System Converter for decimal, binary, octal and hexadecimal, and an Age / date-of-birth Calculator.',
      'about.advantages.7': 'Stays on your device: supported local calculations run in your browser, and your calculation history is saved only on this device.',
      'about.limitations.title': 'Limitations',
      'about.limitations.1': 'The local math solver does not understand every possible problem. Today it focuses on arithmetic, percentages, fractions, simple linear equations, simple quadratic equations, powers, roots, basic trigonometry, and simple area and circumference questions. It is not a complete advanced maths engine.',
      'about.limitations.2': 'AI help is optional, and it is not unlimited. It works only when an AI backend has been set up for this app, and whether it works at a given moment depends on that service being available. AI requests can also fail, or be turned away by the rate limits or usage quotas of the provider. This app does not promise any fixed number of free AI questions.',
      'about.limitations.3': 'Supported local calculations work in your browser. Only the optional AI part needs the configured AI service to be reachable, so it depends on a network connection. Everything else keeps working without it.',
      'about.limitations.4': 'If a question is outside the topics the local solver supports, and the AI part is not available, the app will honestly say the question is not supported instead of guessing. AI is not a promise that every unsupported question can be answered.',
      'footer.brand': 'Developed by Kaif',
      'footer.note': 'Calculations run in your browser - no account. History is saved on this device only.',
      'username.title': 'Welcome!',
      'username.text': 'Please choose a username',
      'username.label': 'Username',
      'username.placeholder': 'Type a name',
      'username.note': 'Saved on this device. Only the username is ever sent, and only when you are online.'
    },
    hi: {
      'app.meta.title': 'स्मार्ट मैथ कैलकुलेटर',
      'app.meta.description': 'तेज़, मोबाइल के अनुकूल कैलकुलेटर जो पूरी तरह आपके ब्राउज़र में चलता है। प्रतिशत, कोष्ठक और स्थानीय इतिहास भी शामिल।',
      'nav.aria.sections': 'भाग',
      'theme.label.auto': 'स्वतः',
      'theme.aria.toggle': 'रंग थीम बदलें',
      'calc.aria.keypad': 'कैलकुलेटर कीपैड',
      'calc.aria.mode': 'कैलकुलेटर मोड',
      'calc.mode.basic': 'सामान्य',
      'calc.mode.scientific': 'वैज्ञानिक',
      'calc.aria.angle': 'त्रिकोणमिति के लिए कोण इकाई',
      'calc.aria.display': 'कैलकुलेटर डिस्प्ले',
      'calc.aria.scientific': 'वैज्ञानिक फलन',
      'calc.aria.keys': 'कैलकुलेटर कुंजियाँ',
      'calc.hint': 'कीबोर्ड: 0-9 · + − × ÷ · % · ^ · ! · ( ) · Enter = बराबर · Backspace · Esc = साफ़ करें',
      'history.aria.panel': 'गणना का इतिहास',
      'history.empty.lead': 'अभी कोई गणना नहीं। दबाएँ',
      'history.empty.tail': 'और गणना यहाँ दिखाई देगी।',
      'solver.badge': 'पहले ऑफ़लाइन · वैकल्पिक AI सहायक',
      'solver.title': 'स्मार्ट मैथ सॉल्वर',
      'solver.desc': 'कोई भी गणितीय प्रश्न लिखें और चुनें कि आपको हल किस रूप में चाहिए।',
      'solver.note': 'समर्थित प्रश्न इसी डिवाइस पर हल होते हैं: अंकगणित, प्रतिशत और भिन्न, सरल रैखीय तथा द्विघात समीकरण, घात, वर्गमूल, त्रिकोणमिति के आधारभूत सूत्र तथा सरल क्षेत्रफल व परिधि संबंधी प्रश्न। बाकी प्रश्नों के लिए, जब बैकएंड सेटअप हो, वैकल्पिक AI सॉल्वर का उपयोग होता है; अन्यथा ईमानदार रूप से "समर्थित नहीं" बताया जाता है।',
      'solver.aria.mode': 'हल का तरीका',
      'solver.mode.direct': 'सीधा उत्तर',
      'solver.mode.full': 'पूरा चरण-दर-चरण',
      'solver.mode.hint': 'सीधा उत्तर केवल अंतिम उत्तर दिखाता है। पूरा चरण-दर-चरण वह दिखाता है जो सॉल्वर ने किया।',
      'solver.label.question': 'आपका गणितीय प्रश्न',
      'solver.placeholder.question': 'अपना गणितीय प्रश्न यहाँ लिखें...',
      'solver.btn.solve': 'प्रश्न हल करें',
      'solver.examples.title': 'कोई उदाहरण आज़माएँ',
      'solver.examples.hint': 'उदाहरण चुनने से केवल प्रश्न वाला खाना भर जाता है। तरीका चुनें और "प्रश्न हल करें" दबाएँ।',
      'solver.offline': 'कैलकुलेटर और समर्थित सॉल्वर प्रश्न इसी डिवाइस पर रहते हैं - न खाता, न सर्वर। AI सहायक केवल असमर्थित प्रश्नों के लिए और केवल तब चलता है जब बैकएंड सेटअप हो।',
      'tool.badge.offline': 'ऑफ़लाइन चलता है',
      'converter.title': 'नंबर सिस्टम कन्वर्टर',
      'converter.desc': 'दशमलव, द्विआधारी, अष्टाधारी और षोड्घाधारी के बीच किसी संख्या का रूप बदलें। सब कुछ इसी ब्राउज़र में होता है - कुछ भी कहीं नहीं भेजा जाता।',
      'converter.label.from': 'से',
      'converter.label.to': 'तक',
      'converter.label.number': 'संख्या',
      'converter.aria.from': 'वह नंबर सिस्टम चुनें जिससे आप बदलना चाहते हैं।',
      'converter.aria.to': 'वह नंबर सिस्टम चुनें जिसमें आप बदलना चाहते हैं।',
      'converter.aria.number': 'अपनी संख्या लिखें।',
      'converter.hint': 'द्विआधारी में केवल 0 और 1। अष्टाधारी में 0 से 7। दशमलव में 0 से 9। षोड्घाधारी में 0 से 9 तथा अक्षर A से F।',
      'converter.base.decimal': 'दशमलव',
      'converter.base.binary': 'द्विआधारी',
      'converter.base.octal': 'अष्टाधारी',
      'converter.base.hexadecimal': 'षोड्घाधारी',
      'converter.btn.convert': 'बदलें',
      'converter.btn.copy': 'परिणाम कॉपी करें',
      'converter.result.phrase': 'बदलकर',
      'age.title': 'उम्र कैलकुलेटर',
      'age.desc': 'अपनी आयु जानने के लिए जन्म तिथि दर्ज करें। आपकी तिथि केवल इसी ब्राउज़र में पढ़ी जाती है - वह कहीं नहीं भेजी या सहेजी जाती।',
      'age.label.dob': 'जन्म तिथि',
      'age.aria.dob': 'अपनी जन्म तिथि दर्ज करें।',
      'age.hint': 'लीप वर्ष और अलग-अलग महीनों की लंबाई आपके लिए स्वतः संभाली जाती है।',
      'age.btn.calculate': 'उम्र निकालें',
      'age.btn.refresh': 'आंकड़े फिर से देखें',
      'age.result.title': 'आपकी उम्र',
      'age.stat.years': 'वर्ष',
      'age.stat.months': 'महीने',
      'age.stat.days': 'दिन',
      'age.total.title': 'कुल जीवन बीता',
      'age.total.days': 'कुल दिन',
      'age.total.weeks': 'कुल सप्ताह',
      'age.total.hours': 'कुल घंटे',
      'age.total.minutes': 'कुल मिनट',
      'age.total.seconds': 'कुल सेकंड',
      'age.birthday.title': 'अगला जन्मदिन',
      'age.birthday.turning': 'वर्ष के',
      'about.title': 'डेवलपर के बारे में',
      'about.badge': 'डेवलपर',
      'about.field.name': 'नाम',
      'about.field.college': 'कॉलेज',
      'about.field.branch': 'ब्रांच',
      'about.field.year': 'वर्ष',
      'about.field.roll': 'रोल नंबर',
      'about.subtitle': 'मैंने स्मार्ट मैथ कैलकुलेटर क्यों बनाया',
      'about.story.1': 'मैं उत्तर भारत से हूँ और अभी दक्षिण भारत में पढ़ रहा हूँ, जहाँ मेरी कक्षा का माहौल उस भाषा-माहौल से अलग है जिसमें मैंने बचपन बिताया। मेरी गणित की कक्षाओं में तेलुगु और अंग्रेज़ी साथ-साथ बोली जाती हैं। मुझे हिंदी और अंग्रेज़ी समझने में ज़्यादा आराम मिलता है, इसलिए कभी-कभी भाषा और उच्चारण के फ़र्क़ से कोई गणितीय विचार या प्रश्न मुझे समझने में मुश्किल हो जाती है। मेरे गणित शिक्षक बहुत अच्छे समझाते हैं, और भाषा व उच्चारण मेरे परिचित से अलग होने के बावजूद मैं अधिकांश पाठ समझ लेता हूँ।',
      'about.story.2': 'फिर भी कभी-कभी कोई प्रश्न या विचार बात समझ में नहीं आता, आमतौर पर इसलिए कि व्याख्या किस तरह कही गई है। ऐसे समय में मैं आमतौर पर किसी AI टूल से वही प्रश्न मुझे तोड़-तोड़कर, अपने समझने जैसी भाषा में, समझवाने को कहता हूँ।',
      'about.story.3': 'तभी मेरे मन में यह विचार आया: क्यों न अपना ही ऐप बनाऊँ जो गणित को साफ़-साफ़ समझने में मदद करे और दूसरे छात्रों के लिए भी काम आए? यही विचार स्मार्ट मैथ कैलकुलेटर बना।',
      'about.story.4': 'इस ऐप का मक़सद सिर्फ़ उत्तर न देना नहीं है। इसका मक़सद है कि आप हल को समझें - आसान भाषा में लिखे गए स्पष्ट चरण-दर-चरण व्याख्या के ज़रिए।',
      'about.story.5': 'मैं यह भी चाहता हूँ कि ऐप कई भाषाओं को सहारा दे, ताकि अलग-अलग भाषा-पृष्ठभूमि के छात्र इसे आराम से चला सकें - अंग्रेज़ी, हिंदी या रोमन हिंदी, और तेलुगु या रोमन तेलुगु।',
      'about.advantages.title': 'मुख्य फ़ायदे',
      'about.advantages.1': 'पहले आपके ब्राउज़र में: कई समर्थित गणनाएँ सीधे आपके ब्राउज़र में हो जाती हैं, बिना आपका सवाल कहीं भेजे।',
      'about.advantages.2': 'चरण-दर-चरण समझाना: समर्थित प्रश्नों के लिए स्मार्ट मैथ सॉल्वर प्रश्न, दी गई जानकारी, सूत्र, स्थानापन, गणना, जाँच और अंतिम उत्तर — पूरा हल दिखा सकता है।',
      'about.advantages.3': 'वैकल्पिक AI सहायता: अगर सवाल स्थानीय सॉल्वर की सीमा से बाहर है, तो ऐप AI सॉल्वर का उपयोग कर सकता है — पर तभी, जब AI बैकएंड सेटअप हो और उपलब्ध हो। हर सवाल AI पर नहीं जाता।',
      'about.advantages.4': 'पाँच भाषाएँ: अंग्रेज़ी, हिंदी, रोमन हिंदी, तेलुगु और रोमन तेलुगु, ताकि अलग-अलग भाषा पृष्ठभूमि के विद्यार्थी आसानी से पढ़ और समझ सकें।',
      'about.advantages.5': 'गणित कीबोर्ड: प्रश्न वाले खाने के नीचे एक छोटा कीबोर्ड, जिसमें सबसे ज़्यादा इस्तेमाल होने वाले चिह्न और फलन हैं — π, √, ∛, ², ³, +, −, ×, ÷, sin(, cos(, tan( और दूसरे समर्थित फलन। बटन दबाते ही वह कर्सर की जगह पर लग जाता है, और यहाँ सिर्फ़ वही चिह्न दिए गए हैं जिन्हें ऐप सच में समझ सकता है।',
      'about.advantages.6': 'दो और औज़ार: Number System Converter (decimal, binary, octal, hexadecimal) और उम्र / जन्मतिथि कैलकुलेटर।',
      'about.advantages.7': 'आपके ही डिवाइस पर: समर्थित स्थानीय गणनाएँ आपके ब्राउज़र में चलती हैं, और गणना का इतिहास सिर्फ़ इसी डिवाइस पर सहेजा जाता है।',
      'about.limitations.title': 'सीमाएँ',
      'about.limitations.1': 'स्थानीय गणित सॉल्वर हर संभव प्रश्न नहीं समझ सकता। अभी यह इन्हीं पर ध्यान देता है: अंकगणित, प्रतिशत, भिन्न, सरल रैखिक समीकरण, सरल द्विघात समीकरण, घात, मूल, त्रिकोणमिति के आधारभूत सूत्र, और सरल क्षेत्रफल व परिधि संबंधी प्रश्न। यह पूरा उन्नत गणित का इंजन नहीं है।',
      'about.limitations.2': 'AI सहायता वैकल्पिक है, और असीमित नहीं है। यह तभी काम करती है जब इस ऐप के लिए AI बैकएंड सेटअप हो, और किसी समय काम करेगी या नहीं यह उस सेवा पर निर्भर है। AI के अनुरोध विफल भी हो सकते हैं, या सेवा देने वाले की rate limit या usage quota के कारण रुक सकते हैं। यह ऐप किसी तय संख्या में मुफ़्त AI सवालों का वादा नहीं करता।',
      'about.limitations.3': 'समर्थित स्थानीय गणनाएँ आपके ब्राउज़र में चलती हैं। केवल वैकल्पिक AI हिस्से के लिए सेटअप किया गया AI सर्विस तक पहुँचना ज़रूरी है, इसलिए उसके लिए नेटवर्क कनेक्शन चाहिए। बाकी सब उसके बिना भी चलता रहता है।',
      'about.limitations.4': 'अगर सवाल उस विषयों में है जो स्थानीय सॉल्वर समझता है उससे बाहर, और AI उपलब्ध नहीं है, तो ऐप अंदाज़ा लगाने के बजाय ईमानदारी से बता देगा कि यह प्रश्न समर्थित नहीं है। AI यह वादा नहीं करता कि हर असमर्थित प्रश्न का उत्तर मिल जाएगा।',
      'footer.brand': 'काइफ़ द्वारा विकसित',
      'footer.note': 'गणनाएँ आपके ब्राउज़र में चलती हैं - कोई खाता नहीं। इतिहास सिर्फ़ इसी डिवाइस पर सहेजा जाता है।',
      'username.title': 'स्वागत है!',
      'username.text': 'कृपया एक यूज़रनाम चुनें',
      'username.label': 'यूज़रनाम',
      'username.placeholder': 'नाम लिखें',
      'username.note': 'इसी डिवाइस पर सहेजा जाता है। केवल यूज़रनाम ही भेजा जाता है, और वह भी केवल ऑनलाइन होने पर।'
    },
    // Roman Hindi: the same Hindi written the way it is actually spoken, using
    // simple everyday words rather than a word-for-word transliteration.
    'hi-Latn': {
      'app.meta.title': 'Smart Math Calculator',
      'app.meta.description': 'Ek tez aur phone ke liye suit kala calculator jo poora tarah aapke browser mein chalta hai. Percent, brackets aur local history bhi shaamil.',
      'nav.aria.sections': 'Hisse',
      'theme.label.auto': 'Automatic',
      'theme.aria.toggle': 'Rang badlein',
      'calc.aria.keypad': 'Calculator ki keypad',
      'calc.aria.mode': 'Calculator ka mode',
      'calc.mode.basic': 'Simple',
      'calc.mode.scientific': 'Scientific',
      'calc.aria.angle': 'Trigonometry ka angle',
      'calc.aria.display': 'Calculator ka display',
      'calc.aria.scientific': 'Scientific functions',
      'calc.aria.keys': 'Calculator ki buttons',
      'calc.hint': 'Keyboard: 0-9 · + − × ÷ · % · ^ · ! · ( ) · Enter = jawab · Backspace · Esc = saaf karein',
      'history.aria.panel': 'Ganana ka itihas',
      'history.empty.lead': 'Abhi koi ganana nahi. Dabayaein',
      'history.empty.tail': 'aur ganana yahin dikhegi.',
      'solver.badge': 'Pehle offline · khaas AI madad',
      'solver.title': 'Smart Math Solver',
      'solver.desc': 'Koi bhi ganit ka sawaal likhein aur chunein ki aapko jawab kis roop mein chahiye.',
      'solver.note': 'Samarthit sawaal isi device par hi hal hote hain: ganana, percent aur bhag, aasan linear aur quadratic samikaaran, power, jad, trigonometry ke aasan sutra aur aashtap-phal ke aasan sawaal. Baaki sawaalon ke liye, jab backend set up ho, khaas AI solver ka istemal hota hai; warna imaandari se "samarthit nahi" bata diya jaata hai.',
      'solver.aria.mode': 'Jawab ka tareeka',
      'solver.mode.direct': 'Seedha Jawab',
      'solver.mode.full': 'Poora Charan',
      'solver.mode.hint': 'Seedha jawab sirf aakhri jawab dikhata hai. Poora charan woh dikhata hai jo solver ne kiya.',
      'solver.label.question': 'Aapka ganit ka sawaal',
      'solver.placeholder.question': 'Apna ganit ka sawaal yahin likhein...',
      'solver.btn.solve': 'Sawaal hal karein',
      'solver.examples.title': 'Koi misaal try karein',
      'solver.examples.hint': 'Misaal chunne se sirf sawaal ka khaana bhar jaata hai. Tareeka chunein aur "Sawaal hal karein" dabayein.',
      'solver.offline': 'Calculator aur samarthit solver sawaal isi device par rehte hain - na koi account, na koi server. AI madad sirf asamarthit sawaalon ke liye chalti hai, aur tabhi jab backend set up ho.',
      'tool.badge.offline': 'Offline chalta hai',
      'converter.title': 'Number System Converter',
      'converter.desc': 'Kisi sankhya ko decimal, binary, octal aur hexadecimal ke beech badlein. Sab kuch isi browser mein hota hai - kuch bhi kahin nahi bheja jaata.',
      'converter.label.from': 'Se',
      'converter.label.to': 'Tak',
      'converter.label.number': 'Sankhya',
      'converter.aria.from': 'Wo number system chunein jisse aap badalna chahte hain.',
      'converter.aria.to': 'Wo number system chunein jisme aap badalna chahte hain.',
      'converter.aria.number': 'Apni sankhya likhein.',
      'converter.hint': 'Binary mein sirf 0 aur 1. Octal mein 0 se 7. Decimal mein 0 se 9. Hexadecimal mein 0 se 9 aur akshar A se F.',
      'converter.base.decimal': 'Decimal',
      'converter.base.binary': 'Binary',
      'converter.base.octal': 'Octal',
      'converter.base.hexadecimal': 'Hexadecimal',
      'converter.btn.convert': 'Badlein',
      'converter.btn.copy': 'Nateeja copy karein',
      'converter.result.phrase': 'badal kar',
      'age.title': 'Age Calculator',
      'age.desc': 'Apni umar jaanne ke liye janm tithi daalein. Aapki tithi sirf isi browser mein padhi jaati hai - wah kahin nahi bheji ya sauchi jaati.',
      'age.label.dob': 'Janm tithi',
      'age.aria.dob': 'Apni janm tithi daalein.',
      'age.hint': 'Leap saal aur alag-alag mahine ki lambai aapke liye apne aap sambhal li jaati hai.',
      'age.btn.calculate': 'Umar nikalein',
      'age.btn.refresh': 'Aankde dobara dekhein',
      'age.result.title': 'Aapki umar',
      'age.stat.years': 'Saal',
      'age.stat.months': 'Mahine',
      'age.stat.days': 'Din',
      'age.total.title': 'Poori zindagi ka hisaab',
      'age.total.days': 'Kul din',
      'age.total.weeks': 'Kul hafte',
      'age.total.hours': 'Kul ghante',
      'age.total.minutes': 'Kul minute',
      'age.total.seconds': 'Kul second',
      'age.birthday.title': 'Agla janm din',
      'age.birthday.turning': 'saal ke',
      'about.title': 'Developer ke baare mein',
      'about.badge': 'Developer',
      'about.field.name': 'Naam',
      'about.field.college': 'College',
      'about.field.branch': 'Branch',
      'about.field.year': 'Saal',
      'about.field.roll': 'Roll number',
      'about.subtitle': 'Maine Smart Math Calculator kyun banaya',
      'about.story.1': 'Main uttar Bharat se hoon aur abhi dakshin Bharat mein padh raha hoon, jahan meri class ka mahol us bhasha-mahol se alag hai jismein maine bachpan bitaya. Meri ganit ki classes mein Telugu aur English saath-saath boli jaati hain. Mujhe Hindi aur English samajhne mein zyada aaram milta hai, isliye kabhi-kabhi bhasha aur uchcharan ke fark se koi ganit vichar ya sawaal samajhne mein mushkil ho jaati hai. Mere ganit shikshak bahut acche samjhaate hain, aur bhasha va uchcharan mere parichay se alag hone ke bawajood main zyada tar padh samajh leta hoon.',
      'about.story.2': 'Phir bhi kabhi-kabhi koi sawaal ya vichar baat samajh mein nahi aata, aam taur par isliye ki vyakya kis tarah kahi gayi hai. Aise samay mein main aam taur par kisi AI tool se wahi sawaal mujhe tod-tod kar, apne samajhne jaisi bhasha mein, samjhwane ko kehta hoon.',
      'about.story.3': 'Tabhi mere mann mein yeh vichar aaya: kyun na apna hi app banau jo ganit ko saaf-saaf samajhne mein madad kare aur doosre chatron ke liye bhi kaam aaye? Yahi vichar Smart Math Calculator bana.',
      'about.story.4': 'Is app ka maqsad sirf jawab dena nahi hai. Iska maqsad hai ki aap hal ko samjhein - aasan bhasha mein likhe gaye saaf charan-dar-charan vyakya ke zariye.',
      'about.story.5': 'Main yeh bhi chahta hoon ki app kai bhashaon ko sahara de, taaki alag-alag bhasha-purabhumi ke chatron use aaram se chala sakein - English, Hindi ya Roman Hindi, aur Telugu ya Roman Telugu.',
      'about.advantages.title': 'Main fayde',
      'about.advantages.1': 'Pehle aapke browser mein: kai samarthit gananaein seedhi aapke browser mein ho jaati hain, aapka sawaal kahin bheje bina.',
      'about.advantages.2': 'Charan-dar-charan samjhana: samarthit sawaalon ke liye Smart Math Solver sawaal, di gayi jaankari, sutra, sthaanapan, ganana, jaanch aur aakhri jawab tak poora hal dikha sakta hai.',
      'about.advantages.3': 'Khaas AI madad: agar sawaal local solver ki seema se bahar hai, to app AI solver ka istemal kar sakti hai, lekin sirf tab jab AI backend set up ho aur available ho. Har sawaal AI par nahi jaata.',
      'about.advantages.4': 'Paanch bhashayein: English, Hindi, Roman Hindi, Telugu aur Roman Telugu, taaki alag-alag bhasha pichhithbhumi ke vidyarthi aasaani se padh aur samajh sakein.',
      'about.advantages.5': 'Ganit keyboard: sawaal wale khaane ke neeche ek chhota keyboard, jisme sabse zyada istemal hone wale chinh aur function hain — π, √, ∛, ², ³, +, −, ×, ÷, sin(, cos(, tan( aur doosre samarthit function. Button dabate hi woh cursor ki jagah lag jaata hai, aur yahan sirf wahi chinh diye gaye hain jinhe app sach mein samajh sakta hai.',
      'about.advantages.6': 'Do aur saadhan: Number System Converter (decimal, binary, octal, hexadecimal) aur umar / janmitthi calculator.',
      'about.advantages.7': 'Aapke hi device par: samarthit local gananaein aapke browser mein chalti hain, aur ganana ka itihas sirf isi device par saucha jaata hai.',
      'about.limitations.title': 'Seemaayein',
      'about.limitations.1': 'Local ganit solver har sambhav sawaal nahi samajh sakta. Abhi yeh inhi par dhyan deta hai: ganana, percent, bhag, aasan linear samikaaran, aasan quadratic samikaaran, power, jad, trigonometry ke aasan sutra, aur aashtap-phal va paridhi ke aasan sawaal. Yeh poora unnat ganit ka engine nahi hai.',
      'about.limitations.2': 'AI madad khaas hai, aur anant nahi hai. Yeh tabhi kaam karti hai jab is app ke liye AI backend set up ho, aur kisi samay kaam karegi ya nahi yeh us service par depend karta hai. AI ke requests fail bhi ho sakte hain, ya service dene wale ki rate limit ya usage quota ki wajah se ruk sakte hain. Yeh app kisi tay sankhya mein muft AI sawaalon ka waada nahi karta.',
      'about.limitations.3': 'Samarthit local gananaein aapke browser mein chalti hain. Sirf khaas AI hisse ke liye set up ki gayi AI service tak pahunchna zaroori hai, isliye uske liye network chahiye. Baaki sab uske bina bhi chalta rehta hai.',
      'about.limitations.4': 'Agar sawaal un topics se bahar hai jo local solver samajhta hai, aur AI available nahi hai, to app andaaza lagane ke bajaye imaandari se bata degi ki yeh sawaal samarthit nahi hai. AI yeh waada nahi karta ki har asamarthit sawaal ka jawab mil jayega.',
      'footer.brand': 'Kaif dwara banaya gaya',
      'footer.note': 'Gananaein aapke browser mein chalti hain - koi account nahi. Itihas sirf isi device par saucha jaata hai.',
      'username.title': 'Swaagat hai!',
      'username.text': 'Kripya ek username chunein',
      'username.label': 'Username',
      'username.placeholder': 'Naam likhein',
      'username.note': 'Isi device par saucha jaata hai. Sirf username hi bheja jaata hai, aur woh bhi sirf tab jab aap online hon.'
    },
    // Telugu
    te: {
      'app.meta.title': 'స్మార్ట్ మ్యాథ్ కాలిక్యులేటర్',
      'app.meta.description': 'వేగంగా, మొబైల్‌కు అనుకూలమైన కాలిక్యులేటర్, ఇది మీ బ్రౌజర్‌లోనే పూర్తిగా పనిచేస్తుంది. శాతాలు, కుండికీలు మరియు లోకల్ చరిత్ర కూడా ఉన్నాయి.',
      'nav.aria.sections': 'విభాగాలు',
      'theme.label.auto': 'స్వయంచాలక',
      'theme.aria.toggle': 'రంగు మార్చండి',
      'calc.aria.keypad': 'కాలిక్యులేటర్ కీప్యాడ్',
      'calc.aria.mode': 'కాలిక్యులేటర్ మోడ్',
      'calc.mode.basic': 'సాధారణం',
      'calc.mode.scientific': 'శాస్త్రీయం',
      'calc.aria.angle': 'త్రికోనమితి కోసం కోణం',
      'calc.aria.display': 'కాలిక్యులేటర్ చూపింది',
      'calc.aria.scientific': 'శాస్త్రీయ కార్యాలు',
      'calc.aria.keys': 'కాలిక్యులేటర్ బటన్లు',
      'calc.hint': 'కీబోర్డ్: 0-9 · + − × ÷ · % · ^ · ! · ( ) · Enter = సమానం · Backspace · Esc = తుడిచండి',
      'history.aria.panel': 'గణన చరిత్ర',
      'history.empty.lead': 'ఇంకా ఏ గణనలు లేవు. నొక్కండి',
      'history.empty.tail': 'అప్పుడు గణన ఇక్కడ కనిపిస్తుంది.',
      'solver.badge': 'ముందు ఆఫ్‌లైన్ · ఐచ్ఛిక AI సహాయం',
      'solver.title': 'స్మార్ట్ మ్యాథ్ సాల్వర్',
      'solver.desc': 'ఏదైనా గణిత ప్రశ్న రాయండి, మీకు సమాధానం ఏ రూపంలో కావాలో ఎంచుకోండి.',
      'solver.note': 'మద్దతు ఉన్న ప్రశ్నలు ఈ పరికరంలోనే పరిష్కరించబడతాయి: గణన, శాతాలు మరియు భిన్నాలు, సులభ రేఖీయ మరియు ద్విఘాత సమీకరణాలు, ఘాతాలు, వర్గమూలాలు, త్రికోనమితి ప్రాథమిక సూత్రాలు మరియు సులభ విస్తీర్ణం-చుట్టుకొలత ప్రశ్నలు. మిగిలిన ప్రశ్నలకు, బ్యాకెండ్ సెట్ అప్ ఉన్నప్పుడు, ఐచ్ఛిక AI సాల్వర్ ఉపయోగపడుతుంది; లేకపోతే నిజాయితీగా "మద్దతు లేదు" అని చెబుతుంది.',
      'solver.aria.mode': 'సమాధానం రూపం',
      'solver.mode.direct': 'సరళమైన సమాధానం',
      'solver.mode.full': 'పూర్తి వివరణ',
      'solver.mode.hint': 'సరళమైన సమాధానం చివరి సమాధానాన్ని మాత్రమే చూపిస్తుంది. పూర్తి వివరణ సాల్వర్ చేసిన దహళలను చూపిస్తుంది.',
      'solver.label.question': 'మీ గణిత ప్రశ్న',
      'solver.placeholder.question': 'మీ గణిత ప్రశ్నను ఇక్కడ రాయండి...',
      'solver.btn.solve': 'ప్రశ్న పరిష్కరించు',
      'solver.examples.title': 'ఒక ఉదాహరణ ప్రయత్నించండి',
      'solver.examples.hint': 'ఉదాహరణను ఎంచుకుంటే ప్రశ్న బాక్స్ మాత్రమే నిండుతుంది. రూపాన్ని ఎంచుకుని "ప్రశ్న పరిష్కరించు" నొక్కండి.',
      'solver.offline': 'కాలిక్యులేటర్ మరియు మద్దతు ఉన్న సాల్వర్ ప్రశ్నలు ఈ పరికరంలోనే ఉంటాయి - ఖాతా లేదు, సర్వర్ లేదు. AI సహాయం మద్దతు లేని ప్రశ్నలకు మాత్రమే, బ్యాకెండ్ సెట్ అప్ ఉన్నప్పుడు మాత్రమే పనిచేస్తుంది.',
      'tool.badge.offline': 'ఆఫ్‌లైన్ పనిచేస్తుంది',
      'converter.title': 'నంబర్ సిస్టమ్ కన్వర్టర్',
      'converter.desc': 'ఒక సంఖ్యను దశాంశ, బైనరీ, అక్టల్ మరియు హెక్సాడెసిమల్ మధ్య మార్చండి. అంతాం ఈ బ్రౌజర్‌లోనే జరుగుతుంది - ఎక్కడకీ పంపబడదు.',
      'converter.label.from': 'నుండి',
      'converter.label.to': 'కు',
      'converter.label.number': 'సంఖ్య',
      'converter.aria.from': 'మీరు మార్చాలనుకుంటున్న నంబర్ సిస్టమ్‌ను ఎంచుకోండి.',
      'converter.aria.to': 'మీరు మార్చాలనుకుంటున్న నంబర్ సిస్టమ్‌ను ఎంచుకోండి.',
      'converter.aria.number': 'మీ సంఖ్యను నమోదు చేయండి.',
      'converter.hint': 'బైనరీలో 0 మరియు 1 మాత్రమే. అక్టల్‌లో 0 నుండి 7. దశాంశంలో 0 నుండి 9. హెక్సాడెసిమల్‌లో 0 నుండి 9 మరియు A నుండి F అక్షరాలు.',
      'converter.base.decimal': 'దశాంశం',
      'converter.base.binary': 'బైనరీ',
      'converter.base.octal': 'అక్టల్',
      'converter.base.hexadecimal': 'హెక్సాడెసిమల్',
      'converter.btn.convert': 'మార్చండి',
      'converter.btn.copy': 'ఫలితాన్ని కాపీ చేయండి',
      'converter.result.phrase': 'గా మార్చబడింది',
      'age.title': 'వయస్సు కాలిక్యులేటర్',
      'age.desc': 'మీ వయస్సు తెలుసుకోవడానికి పుట్టుదిన తేదీని నమోదు చేయండి. మీ తేదీ ఈ బ్రౌజర్‌లోనే చదవబడుతుంది - ఎక్కడకీ పంపబడదు లేదా భద్రపరచబడదు.',
      'age.label.dob': 'పుట్టుదిన తేదీ',
      'age.aria.dob': 'మీ పుట్టుదిన తేదీని నమోదు చేయండి.',
      'age.hint': 'లీప్ సంవత్సరాలు, వేర్వేరు నెల పొడవులు మీకోసం మీరే ఆపోమేటిక్‌గా పరిష్కరించబడతాయి.',
      'age.btn.calculate': 'వయస్సు లెక్కించు',
      'age.btn.refresh': 'లెక్కలను మళ్లీ చూడు',
      'age.result.title': 'మీ వయస్సు',
      'age.stat.years': 'సంవత్సరాలు',
      'age.stat.months': 'నెల',
      'age.stat.days': 'రోజులు',
      'age.total.title': 'మొత్తం జీవిత కాలం',
      'age.total.days': 'మొత్తం రోజులు',
      'age.total.weeks': 'మొత్తం వారాలు',
      'age.total.hours': 'మొత్తం గంటలు',
      'age.total.minutes': 'మొత్తం నిమిషాలు',
      'age.total.seconds': 'మొత్తం సెకన్లు',
      'age.birthday.title': 'తదుపరి పుట్టుదిన',
      'age.birthday.turning': 'సంవత్సరాల పుట్టుకు',
      'about.title': 'డెవలపర్ గురించి',
      'about.badge': 'డెవలపర్',
      'about.field.name': 'పేరు',
      'about.field.college': 'కాలేజీ',
      'about.field.branch': 'బ్రాంచ్',
      'about.field.year': 'సంవత్సరం',
      'about.field.roll': 'రోల్ నంబర్',
      'about.subtitle': 'నేను స్మార్ట్ మ్యాథ్ కాలిక్యులేటర్‌ను ఎందుకు కట్టాను',
      'about.story.1': 'నేను ఉత్తర భారతదేశం నుండిను, ప్రస్తుతం దక్షిణ భారతదేశంలో చదువుతున్నాను, అక్కడ నా తరగతి వాతావరణం నేను పెరిగిన భాషా వాతావరణానికి భిన్నంగా ఉంది. నా గణిత తరగతుల్లో తెలుగు, ఇంగ్లీష్ కలిపి మాట్లాడతారు. నాకు హిందీ, ఇంగ్లీష్ అర్థం చేసుకోవడం సులభంగా ఉంటుంది, అందుకే కొన్నివేళ్లు భాష, ఉచ్చారణ తేడాల వల్ల ఏదైనా గణిత భావన లేదా ప్రశ్న నాకు అర్థం కావడం కష్టమవుతుంది. నా గణిత ఉపాధ్యాయుడు చాలా బాగా వివరిస్తారు, భాష, ఉచ్చారణ నాకు అలవాటైనవి కాకపోయినా చాలా వరకు పాఠాలు అర్థమవుతాయి.',
      'about.story.2': 'అయితే కొన్నివేళ్లు ఏదైనా ప్రశ్న లేదా భావన అర్థం కాదు, సాధారణంగా వివరణ ఎలా చెప్పబడిందనే దాని బట్టి. ఇలాంటి సమయాల్లో నేను సాధారణంగా ఏదైనా AI టూల్‌ను అడిగి అదే ప్రశ్నను నాకు అర్థమయ్యేలా దశలవారీగా వివరించమంటాను.',
      'about.story.3': 'అప్పుడే నా మనసులో ఆలోచన వచ్చింది: గణితాన్ని స్పష్టంగా అర్థం చేసుకోవడంలో సహాయపడే, మరియు ఇతర విద్యార్థులకు కూడా ఉపయోగపడే, నా స్వంత యాప్‌ను ఎందుకు కట్టకుంటా? ఆ ఆలోచనే స్మార్ట్ మ్యాథ్ కాలిక్యులేటర్‌ను సృష్టించింది.',
      'about.story.4': 'ఈ యాప్ యొక్క లక్ష్యం కేవలం సమాధానం ఇవ్వడమే కాదు. సులభమైన భాషలో రాసిన స్పష్టమైన దశలవారీ వివరణల ద్వారా మీరు పరిష్కారాన్ని అర్థం చేసుకోవడమే దీని లక్ష్యం.',
      'about.story.5': 'వేర్వేరు భాషా ప్రశ్నబద్ధమైన విద్యార్థులు ఇది సౌకర్యంగా ఉపయోగించగల్గడం కోసం, యాప్ బహుళ భాషలకు మద్దతు ఇవ్వాలని నేను కోరుతున్నాను - ఇంగ్లీష్, హిందీ లేదా రోమన్ హిందీ, మరియు తెలుగు లేదా రోమన్ తెలుగు.',
      'about.advantages.title': 'ముఖ్య లాభాలు',
      'about.advantages.1': 'ముందు మీ బ్రౌజర్‌లోనే: చాలా మద్దత్పడే గణనలు మీ బ్రౌజర్‌లోనే జరుగుతాయి, మీ ప్రశ్న ఎక్కడకు పంపకుండా.',
      'about.advantages.2': 'దశలవారీ వివరణ: మద్దత్పడే ప్రశ్నలకు స్మార్ట్ మ్యాథ్ సాల్వర్ ప్రశ్న, ఇవ్వబడిన వివరాలు, సూత్రం, ప్రతిక్షేపణ, గణన, సరైనదో ధృవీకరణ మరియు చివరి సమాధానం వరకు మొత్తం పరిష్కారం చూపించగలదు.',
      'about.advantages.3': 'ఐచ్ఛిక AI సహాయం: ప్రశ్న స్థానిక సాల్వర్ చేయగలిసిన దాని బయటకు వచ్చినట్లయితే, AI బ్యాక్‌ఎండ్ సెట్ అప్ అయి అందుబాటులో ఉన్నప్పుడు మాత్రమే యాప్ AI సాల్వర్‌ను ఉపయోగించగలదు. ప్రతి ప్రశ్న AI వద్దకు వెళ్లదు.',
      'about.advantages.4': 'ఐదు భాషలు: ఇంగ్లీష్, హిందీ, రోమన్ హిందీ, తెలుగు మరియు రోమన్ తెలుగు — వేర్వేరు భాషా ప్రశ్నబద్ధమైన విద్యార్థులు సులభంగా చదివి అర్థం చేసుకోవడానికి ఇది సహాయపడుతుంది.',
      'about.advantages.5': 'గణిత కీబోర్డ్: ప్రశ్న ఖానీ కింద ఒక చిన్న కీబోర్డ్, అందులో ఎక్కువగా ఉపయోగించే చిహ్నాలు, ఫంక్షన్లు ఉన్నాయి — π, √, ∛, ², ³, +, −, ×, ÷, sin(, cos(, tan( మరియు ఇతర మద్దత్పడే ఫంక్షన్లు. బటన్ నొక్కితే అది కర్సర్ చోటేే కనిపిస్తుంది, మరియు ఇక్కడ యాప్ నిజంగా నిర్వహించగలిగే చిహ్నాలే ఇవ్వబడ్డాయి.',
      'about.advantages.6': 'మరో రెండు సాధనాలు: Number System Converter (decimal, binary, octal, hexadecimal) మరియు వయస్సు / పుట్టుదిన తేదీ కాలిక్యులేటర్.',
      'about.advantages.7': 'మీ పరికరంలోనే: మద్దత్పడే స్థానిక గణనలు మీ బ్రౌజర్‌లోనే జరుగుతాయి, గణన చరిత్ర ఈ పరికరంలోనే భద్రపరచబడుతుంది.',
      'about.limitations.title': 'పరిమితులు',
      'about.limitations.1': 'స్థానిక గణిత సాల్వర్ ప్రతి సంభావ్య ప్రశ్నను అర్థం చేసుకోలేదు. ఇప్పటికీ ఇది ఈ వాటిపైనే దృష్టి పెడుతుంది: గణన, శాతం, భిన్నం, సరళ రేఖీయ సమీకరణాలు, సరళ ద్విఘాత సమీకరణాలు, ఘాతాలు, వర్గమూలాలు, త్రికోణమితి ఆధారబద్ధ సూత్రాలు, మరియు సరళ విస్తీర్ణం, పరిధి ప్రశ్నలు. ఇది పూర్తి ఉన్నత గణిత ఇంజిన్ కాదు.',
      'about.limitations.2': 'AI సహాయం ఐచ్ఛికమే, అనంతమే కాదు. ఈ యాప్ కోసం AI బ్యాక్‌ఎండ్ సెట్ అప్ అయినప్పుడు మాత్రమే అది పనిచేస్తుంది; ఏ సమయంలో పనిచేస్తుందో అనేది ఆ సేవ ఆధారంగా ఉంటుంది. AI అభ్యర్థనలు విఫలమవ్చును, లేదా సేవ ఇచ్చేవారి rate limit లేదా usage quota కారణంగా తిరస్కరించబడవచ్చు. ఈ యాప్ నిర్దిష్ట సంఖ్యలో ఉచిత AI ప్రశ్నలకు హామీ ఇవ్వదు.',
      'about.limitations.3': 'మద్దత్పడే స్థానిక గణనలు మీ బ్రౌజర్‌లోనే జరుగుతాయి. ఐచ్ఛిక AI భాగానికి మాత్రమే సెట్ అప్ చేసిన AI సేవ చేరుకోవడం అవసరం, కాబట్టి దీనికి నెట్‌వర్క్ కనెక్షన్ కావాలి. మిగిలినదంతా దాని లేకుండానూ పనిచేస్తుంది.',
      'about.limitations.4': 'ప్రశ్న స్థానిక సాల్వర్ అర్థం చేసుకునే అంశాల బయటకు వచ్చినట్లయితే, AI అందుబాటులో లేకపోతే, యాప్ ఊహించకుండనే ఆ ప్రశ్న మద్దత్పడదని స్పష్టంగా చెబుతుంది. AI ప్రతి అమద్దతు ప్రశ్నకు సమాధానం వస్తుందని హామీ ఇవ్వదు.',
      'footer.brand': 'కైఫ్ ద్వారా అభివృద్ధి చేయబడింది',
      'footer.note': 'గణనలు మీ బ్రౌజర్‌లోనే జరుగుతాయి - ఖాతా లేదు. చరిత్ర ఈ పరికరంలోనే భద్రపరచబడుతుంది.',
      'username.title': 'స్వాగతం!',
      'username.text': 'దయచేసి యూజర్‌నేమ్ ఎంచుకోండి',
      'username.label': 'యూజర్‌నేమ్',
      'username.placeholder': 'పేరు రాయండి',
      'username.note': 'ఈ పరికరంలోనే భద్రపరచబడుతుంది. యూజర్‌నేమ్ మాత్రమే పంపబడుతుంది, అదీ మీరు ఆన్‌లైన్‌లో ఉన్నప్పుడు మాత్రమే.'
    },
    // Roman Telugu: the same Telugu in Latin letters, using simple everyday
    // words rather than a strict transliteration.
    'te-Latn': {
      'app.meta.title': 'Smart Math Calculator',
      'app.meta.description': 'Veganaga, mobile ki sahata calculator jo poora tarah aapke browser mein chale. Percent, brackets aur local history bhi shaamil.',
      'nav.aria.sections': 'Vibhaagalu',
      'theme.label.auto': 'Swayamchaalak',
      'theme.aria.toggle': 'Rangu marchandi',
      'calc.aria.keypad': 'Calculator keypad',
      'calc.aria.mode': 'Calculator moda',
      'calc.mode.basic': 'Saadharani',
      'calc.mode.scientific': 'Shaastriya',
      'calc.aria.angle': 'Trigonometry ka konam',
      'calc.aria.display': 'Calculator chupindu',
      'calc.aria.scientific': 'Shaastriya kaaryalu',
      'calc.aria.keys': 'Calculator buttonlu',
      'calc.hint': 'Keyboard: 0-9 · + − × ÷ · % · ^ · ! · ( ) · Enter = samanyam · Backspace · Esc = tuchimandi',
      'history.aria.panel': 'Gana charitra',
      'history.empty.lead': 'Inka emi gana ledu. Nokkandi',
      'history.empty.tail': 'appaidi gana ikkada kanipistundi.',
      'solver.badge': 'Mundu offline · ichhika AI sahayam',
      'solver.title': 'Smart Math Solver',
      'solver.desc': 'Emienaa ganita prashnam raayandi, meeugu samadhanam ela roopalo kavali nuvvu decide chesavaru.',
      'solver.note': 'Samarthita prashnalu ee parisharam lo parisarasanabhavanti: gana, shatalu, bhinnalu, sulabha rekhiya aur dwighata samikeranalulu, ghataalu, vargamulalu, trigonometry prathama sutralu aur sulabha vistirnam-chuttukolata prashnalu. Migilina prashnalaku, backend set up unna, ichhika AI solver prayogayetadi; leda naajayitigaa "samarthidu ledu" ani chebutundi.',
      'solver.aria.mode': 'Samadhanam roopam',
      'solver.mode.direct': 'Sarala Samadhanam',
      'solver.mode.full': 'Poorna Vivaranam',
      'solver.mode.hint': 'Sarala samadhanam chestari samadhanam matrame chupistundi. Poorna vivaranam solver chesina das steps chupistundi.',
      'solver.label.question': 'Mee ganita prashnam',
      'solver.placeholder.question': 'Mee ganita prashnam ikkada raayandi...',
      'solver.btn.solve': 'Prashnam parisarimparandi',
      'solver.examples.title': 'Oka udaaharanam prayatninchandi',
      'solver.examples.hint': 'Udaaharanam enchiyogyanu prashna boxu matrame nindu telusundi. Roopam enchi prashnam parisarimparam nokkandi.',
      'solver.offline': 'Calculator aur samarthita solver prashnalu ee parisharam lo nundi untayi - koi account ledu, koi server ledu. AI sahayam samarthidu leni prashnalaku matte, backend set up unna matte pana chestundi.',
      'tool.badge.offline': 'Offline chestundi',
      'converter.title': 'Number System Converter',
      'converter.desc': 'Oka sankhyanu dasam, binary, octal aur hexadecimal ki madhya marchandi. Mitayi ee browser lo jarugundi - emi kahiniki pepadavu.',
      'converter.label.from': 'Nundi',
      'converter.label.to': 'ku',
      'converter.label.number': 'Sankhya',
      'converter.aria.from': 'Meeru marchalanukuntunna number system ni enchiyandi.',
      'converter.aria.to': 'Meeru marchalanukuntunna number system ni enchiyandi.',
      'converter.aria.number': 'Mee sankyani nambundi.',
      'converter.hint': 'Binary lo 0, 1 matrame. Octal lo 0 nundi 7. Dasam lo 0 nundi 9. Hexadecimal lo 0 nundi 9, A nundi F aksharalu.',
      'converter.base.decimal': 'Dasam',
      'converter.base.binary': 'Binary',
      'converter.base.octal': 'Octal',
      'converter.base.hexadecimal': 'Hexadecimal',
      'converter.btn.convert': 'Marchandi',
      'converter.btn.copy': 'Phalithanni kaapi chestandi',
      'converter.result.phrase': 'gaa marchabadindi',
      'age.title': 'Vayassu Calculator',
      'age.desc': 'Mee vayassu telusukovadaniki puttudina teedi ni nambundi. Mee teedi ee browser lo nunchadavabadi - kahiniki pepadavu leda bhadraparachabadu.',
      'age.label.dob': 'Puttudina teedi',
      'age.aria.dob': 'Mee puttudina teedi ni nambundi.',
      'age.hint': 'Leap samvarsaralu, ververu nela podavulu meekosam meeru aapomaetikaga parisarasanabhavanti.',
      'age.btn.calculate': 'Vayassu lekkinchi',
      'age.btn.refresh': 'Lekkalanu malli choodu',
      'age.result.title': 'Mee vayassu',
      'age.stat.years': 'Samvarsaralu',
      'age.stat.months': 'Nela',
      'age.stat.days': 'Rojulu',
      'age.total.title': 'Mottam jeevitha kaalam',
      'age.total.days': 'Mottam rojulu',
      'age.total.weeks': 'Mottam vaaralu',
      'age.total.hours': 'Mottam gantalu',
      'age.total.minutes': 'Mottam nimishalu',
      'age.total.seconds': 'Mottam sekanlu',
      'age.birthday.title': 'Tadupari puttudina',
      'age.birthday.turning': 'samvarsarala puttuku',
      'about.title': 'Developer gurinchi',
      'about.badge': 'Developer',
      'about.field.name': 'Peru',
      'about.field.college': 'Kalaji',
      'about.field.branch': 'Branch',
      'about.field.year': 'Samvarsaram',
      'about.field.roll': 'Roll number',
      'about.subtitle': 'Nenu Smart Math Calculator ni enduku kattanu',
      'about.story.1': 'Nenu uttara Bharata nundi ni, prasthunam dakshina Bharata lo padutunnanu. Akkada naa taragati vaataavarapanam nenu perigina basha vaataavarapaniki bhinnamgaundi. Naa ganita taragatullo Telugu, English kalipi maatlaadutayi. Naaku Hindi, English artham chesukovadanam sulabhamgaundi, anduke konnivellu basha, uchcharana tedaala vaalna emiina ganita bhavana leda prashnana naaku artham kaavadanam kashtamavutundi. Naa ganita upaadyaayudu chaala baaga vivaristayi, basha, uchcharanam naaku alavataani kaakpoyinaa chaala varaku paathaalu arthamavutayi.',
      'about.story.2': 'Aithe konnivellu emiina prashnam leda bhavana artham kaadu, saadharani gaalani vivarana ela cheppabindanni vaatlo. Ilalanti samayaalo naaku saadharani gaalani emiina AI tool ni adigi, adee prashnana naaku arthamayyeelaa dashalaavaariga vivarimparamenu istham.',
      'about.story.3': 'Appude naa manasulo alochana vachindi: ganitam spashtamga artham chesukovadaniki sahayapedda, vere vidyarthaluku kooda upayogapedda, naa swanta yapp nu enduku kattakunta? Aa alochane Smart Math Calculator ni srishthinchindi.',
      'about.story.4': 'Ee yappa yokyam kaivalam samadhanam ivedamanu kaadu. Sulabhamaina bhashalo rasina spashtaina dashalaavaari vivaranala dwara meeru parishikaaram artham chesukovadanu deeni yokyam.',
      'about.story.5': 'Verevere basha prashnabdhammaina vidyarthalu idi souryamga upayoginchagaligadaniki, yapp bahula bhashalaku mattati ivvaalanu nenu korutunnanu - English, Hindi leda Roman Hindi, Telugu leda Roman Telugu.',
      'about.advantages.title': 'Mukhya labhamulu',
      'about.advantages.1': 'Mundu mee broojar lone: chala middatpade gananalu mee broojar lone jarugutayi, mee prashna ekkadiki pempakunda.',
      'about.advantages.2': 'Dashalavaari vivaranam: middatpade prashnalaku smart math solver prashna, ivvabadina viraalu, sutram, pratikshepanam, ganana, verifikachanam mariyu chivari samadhanam varaku mottam parisikaram choopinagaladu.',
      'about.advantages.3': 'Aichchikika AI sahayyam: prashna sthanika solver cheyagaligina daani bayataku vachina talenti, AI backend set abaia anubandhulo unna ppudu matrame yapp AI solver ni upayoginchagaladu. Prathi prashna AI vaddaku velledu.',
      'about.advantages.4': 'Aidu bhashalu: English, Hindi, Roman Hindi, Telugu mariyu Roman Telugu — veru veru bhasha prashnabdhamaina vidyarthulu sulabhamga chadivi artham chesukovadaniki idi sahayapadutundi.',
      'about.advantages.5': 'Ganita keybord: prashna khaani kinda oka chinna keybord, andulo ekkuvaga upayoginche chihnalu, phanakshanlu unnayi — π, √, ∛, ², ³, +, −, ×, ÷, sin(, cos(, tan( mariyu itara middatpade phanakshanlu. Buttana nokkithe adi karsar chotee kanipistundi, mariyu ikkada yapp nijaga nirvahinchagilige chihnalee ivvabadi.',
      'about.advantages.6': 'Maro rendu saadhanalu: Number System Converter (decimal, binary, octal, hexadecimal) mariyu vayasu / puttudina tehadi kaalakyulatesar.',
      'about.advantages.7': 'Mee parisharam lone: middatpade sthanika gananalu mee broojar lone jarugutayi, ganana charitra ee parisharam lone bhadraparachabadi.',
      'about.limitations.title': 'Parimitalu',
      'about.limitations.1': 'Sthanika ganita solver prathi sambhriya prashnanu artham chesukoledu. Ippitiki idi ee vaatiponi dhristi pedutundi: ganana, shatam, bhinnam, sarala rekhiya samikeranalu, sarala dvighata samikeranalu, ghatalu, vargamulalu, trikonamiti aadharabdha sutralu, mariyu sarala vistirnam, paridhi prashnalu. Idi poorna unnataganitha injan kaadu.',
      'about.limitations.2': 'AI sahayyam aichchikame, anantame kaadu. Ee yapp kosam AI backend set abaia nundi matrame adi panichesetundi; ek samayanlo panichesetundo kaadu aanedi aa seva aadharamga untundi. AI abhyarthalanu viphalama vachunu, lewa seva ivecharivari rate limit leda usage quota kaaranam tiruskarinchabachu. Ee yapp nirdishtha sankhyalo oosina AI prashnalaku haami ivvadu.',
      'about.limitations.3': 'Middatpade sthanika gananalu mee broojar lone jarugutayi. Aichchikika AI bhagaaniki matrame set aba chesina AI seva cheerukovadanam avasaram, kaabatti deeniki network konekshon kaali. Migiledantaa daanilekundanu panichesetundi.',
      'about.limitations.4': 'Prashna sthanika solver artham chesukovarine amshaalu bayataku vachina talenti, AI anubandhulo lekapotene, yapp oochanakaraledu aa prashna middatpadadani sparshTanga chebutundi. AI prathi amadattha prashnaku samadhanam vasthundi anni haami ivvadu.',
      'footer.brand': 'Kaif dwara abhi vridhi cheyabadi',
      'footer.note': 'Ganalalu mee browser lo nundi jarugutayi - koi account ledu. Charitra ee parisharam lo nundi bhadraparachabadi.',
      'username.title': 'Svagatam!',
      'username.text': 'Dayachesi username enchiyandi',
      'username.label': 'Username',
      'username.placeholder': 'Peru raayandi',
      'username.note': 'Ee parisharam lo nundi bhadraparachabadi. Username matrame pepadabadi, mee aanonline lo unappa matrame.'
    }
  };

  // Merge the static block into DICTIONARY so t() and DICTIONARY expose one set.
  Object.keys(STATIC_UI).forEach(function (code) {
    const source = STATIC_UI[code];
    const target = DICTIONARY[code];
    Object.keys(source).forEach(function (key) {
      target[key] = source[key];
    });
  });

  // __STATIC_MERGE__
  /**
   * PHASE 2C - text that JavaScript writes into the page at runtime.
   * The English values are the EXACT literals the code already uses, so a
   * missing translator produces byte-identical output to before this phase.
   *
   * Deliberately NOT here: local solver explanation prose, AI output, the AI
   * prompt and any mathematical reasoning. Those are Phase 2D / 2E.
   */
  const DYNAMIC_UI = {
    en: {
      'theme.label.light': 'Light',
      'theme.label.dark': 'Dark',
      'calc.error.EMPTY': 'Enter a calculation first',
      'calc.error.INCOMPLETE': 'Expression is incomplete',
      'calc.error.SYNTAX': 'Invalid expression',
      'calc.error.DIVIDE_BY_ZERO': 'Cannot divide by zero',
      'calc.error.OVERFLOW': 'Result is too large',
      'calc.error.TOO_COMPLEX': 'Expression is too long',
      'calc.error.DOMAIN': 'Invalid function input',
      'calc.error.FACTORIAL': 'Invalid factorial',
      'history.aria.reuse': 'Reuse {0} equals {1}',
      'history.aria.remove': 'Remove {0} from history',
      'history.aria.angle': 'calculated in {0} mode',
      'history.confirm.clear': 'Clear the whole calculation history?',
      'history.notice.storage': 'This browser blocks local storage, so the history is kept only until you close the tab.',
      'converter.result.value': '{0} value',
      'converter.error.empty': 'Please enter a number to convert.',
      'converter.error.unknownBase': 'Please choose a valid number system.',
      'converter.error.tooLong': 'That number is too long to convert.',
      'converter.error.decimal': 'Invalid decimal number. Decimal numbers can contain only the digits 0 to 9.',
      'converter.error.binary': 'Invalid binary number. Binary numbers can contain only 0 and 1.',
      'converter.error.octal': 'Invalid octal number. Octal numbers can contain only the digits 0 to 7.',
      'converter.error.hexadecimal': 'Invalid hexadecimal number. Hexadecimal numbers can contain 0 to 9 and the letters A to F.',
      'converter.btn.copied': 'Copied',
      'converter.copy.noResult': 'There is no result to copy yet. Convert a number first.',
      'converter.copy.unavailable': 'Copying is not available in this browser. Please read the result above.',
      'converter.copy.failed': 'Could not copy automatically. Please read the result above.',
      'age.month.1': 'January',
      'age.month.2': 'February',
      'age.month.3': 'March',
      'age.month.4': 'April',
      'age.month.5': 'May',
      'age.month.6': 'June',
      'age.month.7': 'July',
      'age.month.8': 'August',
      'age.month.9': 'September',
      'age.month.10': 'October',
      'age.month.11': 'November',
      'age.month.12': 'December',
      'age.error.empty': 'Please enter your date of birth.',
      'age.error.format': 'Please enter a valid date using the date picker.',
      'age.error.impossible': 'That date does not exist. Please check the day and month.',
      'age.error.outOfRange': 'Please enter a year between 1900 and 2200.',
      'age.error.future': 'The date of birth cannot be in the future. Please enter today or an earlier date.',
      'age.msg.birthdayToday': 'Today is your birthday. Happy birthday to you.',
      'age.msg.daysToGo': '{0} to go.',
      'age.unit.year': '{0} year',
      'age.unit.years': '{0} years',
      'age.unit.day': '{0} day',
      'age.unit.days': '{0} days',
      'solver.source.local': 'Local Solver',
      'solver.source.ai': 'AI Solver',
      'solver.title.unsupported': 'Not solvable locally yet',
      'solver.title.error': 'Cannot solve',
      'solver.title.aiError': 'AI solver unavailable',
      'solver.title.loading': 'AI is solving...',
      'solver.title.questionNeeded': 'Question needed',
      'solver.msg.notLoaded': 'The local solver is not loaded.',
      'solver.msg.invalid': 'The local solver could not handle this question.',
      'solver.msg.loading': 'The question was sent to the AI solver. The calculator stays fully usable while you wait.',
      'solver.msg.aiUnavailable': 'AI solver is currently unavailable. You can still use the local calculator and supported offline solver.',
      'solver.msg.empty': 'Please enter a math question.',
      'solver.step.prefix': 'Step {0}: ',
      'solver.answer.prefix': 'Answer: ',
      'username.greeting': 'Welcome, {0}',
      'username.error.required': 'Please choose a username.',
      'username.error.tooLong': 'That username is too long. Please use 24 characters or fewer.',
      'username.error.invalid': 'Use letters, digits, single spaces, dot, dash or underscore only.',
      // ---- Phase 2D: local math solver explanation text ---------------------
      'solver.section.question': 'Question',
      'solver.section.given': 'Given',
      'solver.section.toFind': 'To Find',
      'solver.section.concept': 'Concept',
      'solver.section.formula': 'Formula',
      'solver.section.expression': 'Expression',
      'solver.section.substitution': 'Substitution',
      'solver.section.calculation': 'Calculation',
      'solver.section.verification': 'Verification',
      'solver.section.finalAnswer': 'Final Answer',
      'solver.bothSides.subtract': 'Subtract {0} from both sides.',
      'solver.bothSides.add': 'Add {0} to both sides.',
      'solver.bothSides.divide': 'Divide both sides by {0}.',
      'solver.step.collectX': 'Collect the x terms on one side',
      'solver.step.removeConstant': 'Remove the constant term',
      'solver.step.isolateX': 'Isolate x',
      'solver.step.readOff': 'Read off the solution',
      'solver.step.discriminant': 'Calculate the discriminant',
      'solver.step.interpretDiscriminant': 'Interpret the discriminant',
      'solver.step.applyQuadratic': 'Apply the quadratic formula',
      'solver.linear.concept': 'Linear equation in one variable. Undo the operations around x in reverse order: first remove the constant term, then undo the multiplication.',
      'solver.quadratic.concept': 'Quadratic equation in one variable. Compare with the standard form, then apply the quadratic formula.',
      'solver.quadratic.noRealRoots': 'The discriminant is negative, so the equation has no real roots.',
      'solver.geometry.concept': 'A direct geometry formula with the measurement given in the question.',
      'solver.percent.concept': 'Percentage of a total value.',
      'solver.fraction.concept': 'Fraction of a total value.',
      'solver.change.conceptIncrease': 'Percent increase of a quantity.',
      'solver.change.conceptDecrease': 'Percent decrease of a quantity.',
      'solver.trig.concept': 'Trigonometric ratio of a numeric angle, evaluated in {0} mode.',
      'solver.trig.wordDegree': 'degree',
      'solver.trig.wordRadian': 'radian',
      'solver.root.concept': 'Square root: the non-negative number that multiplied by itself gives the argument.',
      'solver.power.concept': '{0} is multiplied by itself {1} times.',
      'solver.fraction.lcmConcept': 'Add fractions by converting them to a common denominator (the LCM).',
      'solver.verify.substituteInto': 'Substitute x = {0} into the original equation:',
      'solver.verify.substituteIntoExpr': 'Substitute x = {0} into {1}:',
      'solver.geometry.areaCircle': 'Area of the circle',
      'solver.geometry.circumferenceCircle': 'Circumference of the circle',
      'solver.geometry.areaRectangle': 'Area of the rectangle',
      'solver.geometry.perimeterRectangle': 'Perimeter of the rectangle',
      'solver.geometry.areaSquare': 'Area of the square',
      'solver.geometry.perimeterSquare': 'Perimeter of the square',
      'solver.geometry.areaTriangle': 'Area of the triangle',
      'solver.change.increased': 'Increased value',
      'solver.change.decreased': 'Decreased value',
      'solver.change.afterIncrease': 'after a {0}% increase',
      'solver.change.afterDecrease': 'after a {0}% decrease',
      'solver.change.wordIncrease': 'increase',
      'solver.change.wordDecrease': 'decrease'
    },
    hi: {
      'theme.label.light': 'हल्का',
      'theme.label.dark': 'गहरा',
      'calc.error.EMPTY': 'पहले कोई गणना लिखें',
      'calc.error.INCOMPLETE': 'गणना अधूरी है',
      'calc.error.SYNTAX': 'गणना सही नहीं है',
      'calc.error.DIVIDE_BY_ZERO': 'शून्य से भाग नहीं सकते',
      'calc.error.OVERFLOW': 'परिणाम बहुत बड़ा है',
      'calc.error.TOO_COMPLEX': 'गणना बहुत लंबी है',
      'calc.error.DOMAIN': 'यह फलन यहाँ नहीं चल सकता',
      'calc.error.FACTORIAL': 'फैक्टोरियल सही नहीं है',
      'history.aria.reuse': '{0} का परिणाम {1} दोबारा इस्तेमाल करें',
      'history.aria.remove': '{0} को इतिहास से हटाएँ',
      'history.aria.angle': '{0} मोड में गणना की गई',
      'history.confirm.clear': 'पूरा गणना इतिहास मिटा दें?',
      'history.notice.storage': 'यह ब्राउज़र लोकल स्टोरेज नहीं चालू कर पा रहा, इसलिए इतिहास सिर्फ़ टैब बंद करने तक रहेगा।',
      'converter.result.value': '{0} का मान',
      'converter.error.empty': 'कृपया बदलने के लिए कोई संख्या लिखें।',
      'converter.error.unknownBase': 'कृपया सही नंबर सिस्टम चुनें।',
      'converter.error.tooLong': 'यह संख्या बदलने के लिए बहुत लंबी है।',
      'converter.error.decimal': 'दशमलव संख्या सही नहीं है। दशमलव में केवल 0 से 9 तक के अंक होते हैं।',
      'converter.error.binary': 'द्विआधारी संख्या सही नहीं है। द्विआधारी में केवल 0 और 1 होते हैं।',
      'converter.error.octal': 'अष्टाधारी संख्या सही नहीं है। अष्टाधारी में केवल 0 से 7 तक के अंक होते हैं।',
      'converter.error.hexadecimal': 'षोड्घाधारी संख्या सही नहीं है। इसमें 0 से 9 तक के अंक और A से F तक के अक्षर होते हैं।',
      'converter.btn.copied': 'कॉपी हो गया',
      'converter.copy.noResult': 'अभी कॉपी करने के लिए कुछ नहीं है। पहले कोई संख्या बदलें।',
      'converter.copy.unavailable': 'इस ब्राउज़र में कॉपी करना नहीं चलता। कृपया ऊपर का परिणाम पढ़ लें।',
      'converter.copy.failed': 'अपने आप कॉपी नहीं हो सका। कृपया ऊपर का परिणाम पढ़ लें।',
      'age.month.1': 'जनवरी',
      'age.month.2': 'फ़रवरी',
      'age.month.3': 'मार्च',
      'age.month.4': 'अप्रैल',
      'age.month.5': 'मई',
      'age.month.6': 'जून',
      'age.month.7': 'जुलाई',
      'age.month.8': 'अगस्त',
      'age.month.9': 'सितंबर',
      'age.month.10': 'अक्टूबर',
      'age.month.11': 'नवंबर',
      'age.month.12': 'दिसंबर',
      'age.error.empty': 'कृपया अपनी जन्म तिथि दर्ज करें।',
      'age.error.format': 'कृपया तारीख चुनने वाले बॉक्स से सही तारीख दर्ज करें।',
      'age.error.impossible': 'यह तारीख मौजूद नहीं है। कृपया दिन और महीना देख लें।',
      'age.error.outOfRange': 'कृपया 1900 से 2200 के बीच का साल दर्ज करें।',
      'age.error.future': 'जन्म तिथि भविष्य में नहीं हो सकती। कृपया आज या उससे पहले की तारीख दर्ज करें।',
      'age.msg.birthdayToday': 'आज आपका जन्मदिन है। जन्मदिन मुबारक!',
      'age.msg.daysToGo': 'बस {0} दिन बाकी।',
      'age.unit.year': '{0} वर्ष',
      'age.unit.years': '{0} वर्ष',
      'age.unit.day': '{0} दिन',
      'age.unit.days': '{0} दिन',
      'solver.source.local': 'लोकल सॉल्वर',
      'solver.source.ai': 'AI सॉल्वर',
      'solver.title.unsupported': 'अभी यहाँ हल नहीं हो सकता',
      'solver.title.error': 'हल नहीं हो सका',
      'solver.title.aiError': 'AI सॉल्वर उपलब्ध नहीं',
      'solver.title.loading': 'AI हल कर रहा है...',
      'solver.title.questionNeeded': 'प्रश्न चाहिए',
      'solver.msg.notLoaded': 'लोकल सॉल्वर लोड नहीं हुआ।',
      'solver.msg.invalid': 'लोकल सॉल्वर यह प्रश्न नहीं हल कर पाया।',
      'solver.msg.loading': 'आपका प्रश्न AI सॉल्वर को भेज दिया गया है। इंतज़ार के दौरान कैलकुलेटर आपकी तरह से काम करता रहेगा।',
      'solver.msg.aiUnavailable': 'AI सॉल्वर अभी उपलब्ध नहीं है। आप लोकल कैलकुलेटर और ऑफ़लाइन सॉल्वर इस्तेमाल कर सकते हैं।',
      'solver.msg.empty': 'कृपया एक गणितीय प्रश्न लिखें।',
      'solver.step.prefix': 'चरण {0}: ',
      'solver.answer.prefix': 'उत्तर: ',
      'username.greeting': 'स्वागत है, {0}',
      'username.error.required': 'कृपया एक यूज़रनाम चुनें।',
      'username.error.tooLong': 'यह यूज़रनाम बहुत लंबा है। कृपया 24 अक्षर या उससे कम रखें।',
      'username.error.invalid': 'सिर्फ़ अक्षर, अंक, एक-एक स्पेस, डॉट, डैश या अंडरस्कोर इस्तेमाल करें।',
      // ---- Phase 2D: local math solver explanation text (simple Hindi) -------
      'solver.section.question': 'प्रश्न',
      'solver.section.given': 'दिया गया',
      'solver.section.toFind': 'क्या निकालना है',
      'solver.section.concept': 'बात',
      'solver.section.formula': 'सूत्र',
      'solver.section.expression': 'व्यंजक',
      'solver.section.substitution': 'मान रखने पर',
      'solver.section.calculation': 'गणना',
      'solver.section.verification': 'जाँच',
      'solver.section.finalAnswer': 'अंतिम उत्तर',
      'solver.bothSides.subtract': 'दोनों तरफ से {0} घटाएँ।',
      'solver.bothSides.add': 'दोनों तरफ {0} जोड़ें।',
      'solver.bothSides.divide': 'दोनों तरफ {0} से भाग दें।',
      'solver.step.collectX': 'x वाले पदों को एक तरफ लाएँ',
      'solver.step.removeConstant': 'बिना x वाला पद हटाएँ',
      'solver.step.isolateX': 'x को अलग करें',
      'solver.step.readOff': 'उत्तर पढ़ लें',
      'solver.step.discriminant': 'डिस्क्रिमिनेंट निकालें',
      'solver.step.interpretDiscriminant': 'डिस्क्रिमिनेंट समझें',
      'solver.step.applyQuadratic': 'द्विघात सूत्र लगाएँ',
      'solver.linear.concept': 'एक चर वाला रैखिक समीकरण। x के आसपास की क्रियाओं को उलटे क्रम में हटाएँ: पहले बिना x वाला पद हटाएँ, फिर गुणा को हटाएँ।',
      'solver.quadratic.concept': 'एक चर वाला द्विघात समीकरण। पहले इसे सामान्य रूप से मिलाएँ, फिर द्विघात सूत्र लगाएँ।',
      'solver.quadratic.noRealRoots': 'डिस्क्रिमिनेंट ऋणात्मक है, इसलिए इस समीकरण के कोई असली मूल नहीं हैं।',
      'solver.geometry.concept': 'सीधा ज्यामिति सूत्र, जिसकी नाप प्रश्न में दी गई है।',
      'solver.percent.concept': 'कुल मान का प्रतिशत।',
      'solver.fraction.concept': 'कुल मान का भिन्न।',
      'solver.change.conceptIncrease': 'किसी मान को प्रतिशत बढ़ाना।',
      'solver.change.conceptDecrease': 'किसी मान को प्रतिशत घटाना।',
      'solver.trig.concept': 'कोण की त्रिकोणमितीय निष्पत्ति, {0} मोड में निकाली गई।',
      'solver.trig.wordDegree': 'डिग्री',
      'solver.trig.wordRadian': 'रेडियन',
      'solver.root.concept': 'वर्गमूल: वह नॉन-नेगेटिव संख्या जिसे खुद से गुणा करने पर वही संख्या मिले।',
      'solver.power.concept': '{0} को खुद से {1} बार गुणा किया गया।',
      'solver.fraction.lcmConcept': 'भिन्नों को जोड़ने के लिए उन्हें एक ही हर (LCM) में बदल लें।',
      'solver.verify.substituteInto': 'मूल समीकरण में x = {0} रखकर जाँचें:',
      'solver.verify.substituteIntoExpr': '{1} में x = {0} रखें:',
      'solver.geometry.areaCircle': 'वृत्त का क्षेत्रफल',
      'solver.geometry.circumferenceCircle': 'वृत्त की परिधि',
      'solver.geometry.areaRectangle': 'आयत का क्षेत्रफल',
      'solver.geometry.perimeterRectangle': 'आयत का परिमाप',
      'solver.geometry.areaSquare': 'वर्ग का क्षेत्रफल',
      'solver.geometry.perimeterSquare': 'वर्ग का परिमाप',
      'solver.geometry.areaTriangle': 'त्रिभुज का क्षेत्रफल',
      'solver.change.increased': 'बढ़ा हुआ मान',
      'solver.change.decreased': 'घटाया हुआ मान',
      'solver.change.afterIncrease': '{0}% बढ़ाने के बाद',
      'solver.change.afterDecrease': '{0}% घटाने के बाद',
      'solver.change.wordIncrease': 'बढ़ाने',
      'solver.change.wordDecrease': 'घटाने'
    },
    // Roman Hindi: simple everyday Hindi written in English letters.
    'hi-Latn': {
      'theme.label.light': 'Halka',
      'theme.label.dark': 'Gehra',
      'calc.error.EMPTY': 'Pehle koi ganana likhein',
      'calc.error.INCOMPLETE': 'Ganana adhuri hai',
      'calc.error.SYNTAX': 'Ganana sahi nahi hai',
      'calc.error.DIVIDE_BY_ZERO': 'Zero se divide nahi kar sakte',
      'calc.error.OVERFLOW': 'Nateeja bahut bada hai',
      'calc.error.TOO_COMPLEX': 'Ganana bahut lambi hai',
      'calc.error.DOMAIN': 'Yeh function yahan nahi chal sakta',
      'calc.error.FACTORIAL': 'Factorial sahi nahi hai',
      'history.aria.reuse': '{0} ka jawab {1} dobara istemal karein',
      'history.aria.remove': '{0} ko itihas se hataayein',
      'history.aria.angle': '{0} mode mein ganana hui',
      'history.confirm.clear': 'Poora ganana itihas mita dein?',
      'history.notice.storage': 'Yeh browser local storage on nahi kar pa raha, isliye itihas sirf tab band karne tak rahega.',
      'converter.result.value': '{0} ka maan',
      'converter.error.empty': 'Kripya badalne ke liye koi sankhya likhein.',
      'converter.error.unknownBase': 'Kripya sahi number system chunein.',
      'converter.error.tooLong': 'Yeh sankhya badalne ke liye bahut lambi hai.',
      'converter.error.decimal': 'Dasam sankhya sahi nahi hai. Dasam mein sirf 0 se 9 tak ke ank hote hain.',
      'converter.error.binary': 'Binary sankhya sahi nahi hai. Binary mein sirf 0 aur 1 hote hain.',
      'converter.error.octal': 'Octal sankhya sahi nahi hai. Octal mein sirf 0 se 7 tak ke ank hote hain.',
      'converter.error.hexadecimal': 'Hexadecimal sankhya sahi nahi hai. Isme 0 se 9 tak ke ank aur A se F tak ke akshar hote hain.',
      'converter.btn.copied': 'Copy ho gaya',
      'converter.copy.noResult': 'Abhi copy karne ke liye kuch nahi hai. Pehle koi sankhya badlein.',
      'converter.copy.unavailable': 'Is browser mein copy karna nahi chalta. Kripya upar ka nateeja padh lein.',
      'converter.copy.failed': 'Apne aap copy nahi ho saka. Kripya upar ka nateeja padh lein.',
      'age.month.1': 'January',
      'age.month.2': 'February',
      'age.month.3': 'March',
      'age.month.4': 'April',
      'age.month.5': 'May',
      'age.month.6': 'June',
      'age.month.7': 'July',
      'age.month.8': 'August',
      'age.month.9': 'September',
      'age.month.10': 'October',
      'age.month.11': 'November',
      'age.month.12': 'December',
      'age.error.empty': 'Kripya apni janm tithi daalein.',
      'age.error.format': 'Kripya date picker se sahi teedhi daalein.',
      'age.error.impossible': 'Yeh teedhi maujood nahi hai. Kripya din aur mahina dekh lein.',
      'age.error.outOfRange': 'Kripya 1900 se 2200 ke beech ka saal daalein.',
      'age.error.future': 'Janm tithi bhavishya mein nahi ho sakti. Kripya aaj ya usse pehle ki teedhi daalein.',
      'age.msg.birthdayToday': 'Aaj aapka janm din hai. Janm din mubarak!',
      'age.msg.daysToGo': 'Bas {0} din bache hain.',
      'age.unit.year': '{0} saal',
      'age.unit.years': '{0} saal',
      'age.unit.day': '{0} din',
      'age.unit.days': '{0} din',
      'solver.source.local': 'Local Solver',
      'solver.source.ai': 'AI Solver',
      'solver.title.unsupported': 'Abhi yahan hal nahi ho sakta',
      'solver.title.error': 'Hal nahi ho saka',
      'solver.title.aiError': 'AI Solver upyog nahi hai',
      'solver.title.loading': 'AI hal kar raha hai...',
      'solver.title.questionNeeded': 'Sawaal chahiye',
      'solver.msg.notLoaded': 'Local Solver load nahi hua.',
      'solver.msg.invalid': 'Local Solver yeh sawaal hal nahi kar paya.',
      'solver.msg.loading': 'Aapka sawaal AI Solver ko bhej diya gaya hai. Intezaar ke dauran calculator aapki tarah kaam karta rahega.',
      'solver.msg.aiUnavailable': 'AI Solver abhi upyog nahi hai. Aap local calculator aur offline solver istemal kar sakte hain.',
      'solver.msg.empty': 'Kripya ek ganit ka sawaal likhein.',
      'solver.step.prefix': 'Charan {0}: ',
      'solver.answer.prefix': 'Jawab: ',
      'username.greeting': 'Svaagat, {0}',
      'username.error.required': 'Kripya ek username chunein.',
      'username.error.tooLong': 'Yeh username bahut lamba hai. Kripya 24 akshar ya usse kam rakhein.',
      'username.error.invalid': 'Sirf akshar, sankhya, ek-ek space, dot, dash ya underscore istemal karein.',
      // ---- Phase 2D: local solver explanation (Roman Hindi) -----------------
      'solver.section.question': 'Sawaal',
      'solver.section.given': 'Diya gaya',
      'solver.section.toFind': 'Kya nikalna hai',
      'solver.section.concept': 'Baat',
      'solver.section.formula': 'Formula',
      'solver.section.expression': 'Expression',
      'solver.section.substitution': 'Value rakhne par',
      'solver.section.calculation': 'Ganana',
      'solver.section.verification': 'Jaanch',
      'solver.section.finalAnswer': 'Aakhri jawab',
      'solver.bothSides.subtract': 'Dono taraf se {0} ghataayein.',
      'solver.bothSides.add': 'Dono taraf {0} jodein.',
      'solver.bothSides.divide': 'Dono taraf {0} se bhag dein.',
      'solver.step.collectX': 'x wale terms ko ek taraf laayein',
      'solver.step.removeConstant': 'Bina x wala term hataayein',
      'solver.step.isolateX': 'x ko alag karein',
      'solver.step.readOff': 'Jawab padh lein',
      'solver.step.discriminant': 'Discriminant nikaalein',
      'solver.step.interpretDiscriminant': 'Discriminant samjhein',
      'solver.step.applyQuadratic': 'Quadratic formula lagaiyein',
      'solver.linear.concept': 'Ek variable wala linear equation. x ke aas-paas ki operations ulta order mein hataayein: pehle bina x wala term hataayein, phir gunaai hataayein.',
      'solver.quadratic.concept': 'Ek variable wala quadratic equation. Pehle ise standard roop se milaiye, phir quadratic formula lagaiyein.',
      'solver.quadratic.noRealRoots': 'Discriminant negative hai, isliye is equation ke koi asli root nahi hain.',
      'solver.geometry.concept': 'Seedha geometry formula, jiska measurement sawaal mein diya gaya hai.',
      'solver.percent.concept': 'Kul maan ka percent.',
      'solver.fraction.concept': 'Kul maan ka bhag.',
      'solver.change.conceptIncrease': 'Kisi maan ko percent badhana.',
      'solver.change.conceptDecrease': 'Kisi maan ko percent kam karna.',
      'solver.trig.concept': 'Kone ki trigonometric value, {0} mode mein nikaali gayi.',
      'solver.trig.wordDegree': 'degree',
      'solver.trig.wordRadian': 'radian',
      'solver.root.concept': 'Square root: woh non-negative sankhya jise khud se guna karne par wahi sankhya mile.',
      'solver.power.concept': '{0} ko khud se {1} baar gunaaya gaya.',
      'solver.fraction.lcmConcept': 'Bhag jodne ke liye unhe ek hi har (LCM) mein badal lein.',
      'solver.verify.substituteInto': 'Mool samikaaran mein x = {0} rakhkar jaanchein:',
      'solver.verify.substituteIntoExpr': '{1} mein x = {0} rakhein:',
      'solver.geometry.areaCircle': 'Circle ka kshetrafal',
      'solver.geometry.circumferenceCircle': 'Circle ki paridhi',
      'solver.geometry.areaRectangle': 'Aayat ka kshetrafal',
      'solver.geometry.perimeterRectangle': 'Aayat ka parimap',
      'solver.geometry.areaSquare': 'Varg ka kshetrafal',
      'solver.geometry.perimeterSquare': 'Varg ka parimap',
      'solver.geometry.areaTriangle': 'Tribhuj ka kshetrafal',
      'solver.change.increased': 'Badha hua maan',
      'solver.change.decreased': 'Ghata hua maan',
      'solver.change.afterIncrease': '{0}% badhane ke baad',
      'solver.change.afterDecrease': '{0}% ghatane ke baad',
      'solver.change.wordIncrease': 'badhana',
      'solver.change.wordDecrease': 'ghatana'
    },
    // Telugu: simple, everyday student-friendly Telugu.
    te: {
      'theme.label.light': 'లేష్టు',
      'theme.label.dark': 'గాఢం',
      'calc.error.EMPTY': 'ముందు ఒక గణన రాయండి',
      'calc.error.INCOMPLETE': 'గణన అసంపూర్ణంగా ఉంది',
      'calc.error.SYNTAX': 'గణన సరైనది కాదు',
      'calc.error.DIVIDE_BY_ZERO': 'సున్నా ద్వారా భాగించలేం',
      'calc.error.OVERFLOW': 'ఫలితం చాలా పెద్దది',
      'calc.error.TOO_COMPLEX': 'గణన చాలా పొడవైనది',
      'calc.error.DOMAIN': 'ఈ కార్యం ఇక్కడ పనిచేదు',
      'calc.error.FACTORIAL': 'ఫ్యాక్టోరియల్ సరైనది కాదు',
      'history.aria.reuse': '{0} ఫలితం {1} మళ్లీ వాడండి',
      'history.aria.remove': '{0}ను చరిత్ర నుండి తీసివేయండి',
      'history.aria.angle': '{0} మోడ్‌లో లెక్కించారు',
      'history.confirm.clear': 'మొత్తం గణన చరిత్రను తొలగించాలా?',
      'history.notice.storage': 'ఈ బ్రౌజర్‌లో లోకల్ స్టోరేజ్ పనిచేయడం లేదు, కాబట్టి చరిత్ర ట్యాబ్ మూసే వరకు మాత్రమే ఉంటుంది.',
      'converter.result.value': '{0} విలువ',
      'converter.error.empty': 'మార్చడానికి ఒక సంఖ్యను రాయండి.',
      'converter.error.unknownBase': 'సరైన నంబర్ సిస్టమ్‌ను ఎంచుకోండి.',
      'converter.error.tooLong': 'ఈ సంఖ్య మార్చడానికి చాలా పొడవైనది.',
      'converter.error.decimal': 'దశాంశ సంఖ్య సరైనది కాదు. దశాంశంలో 0 నుండి 9 వరకు అంకెలు మాత్రమే ఉంటాయి.',
      'converter.error.binary': 'బైనరీ సంఖ్య సరైనది కాదు. బైనరీలో 0, 1 మాత్రమే ఉంటాయి.',
      'converter.error.octal': 'అక్టల్ సంఖ్య సరైనది కాదు. అక్టల్‌లో 0 నుండి 7 వరకు అంకెలు మాత్రమే ఉంటాయి.',
      'converter.error.hexadecimal': 'హెక్సాడెసిమల్ సంఖ్య సరైనది కాదు. ఇందులో 0 నుండి 9 వరకు అంకెలు, A నుండి F వరకు అక్షరాలు ఉంటాయి.',
      'converter.btn.copied': 'కాపీ అయింది',
      'converter.copy.noResult': 'ఇంకా కాపీ చేయడానికి ఏమీ లేదు. ముందు ఒక సంఖ్యను మార్చండి.',
      'converter.copy.unavailable': 'ఈ బ్రౌజర్‌లో కాపీ పనిచేయదు. దయచేసి పైన ఉన్న ఫలితాన్ని చదవండి.',
      'converter.copy.failed': 'తనంతటిగా కాపీ కాలేదు. దయచేసి పైన ఉన్న ఫలితాన్ని చదవండి.',
      'age.month.1': 'జనవరి',
      'age.month.2': 'ఫిబ్రవరి',
      'age.month.3': 'మార్చి',
      'age.month.4': 'ఏప్రిల్',
      'age.month.5': 'మే',
      'age.month.6': 'జూన్',
      'age.month.7': 'జూలై',
      'age.month.8': 'ఆగస్టు',
      'age.month.9': 'సెప్టెంబర్',
      'age.month.10': 'అక్టోబర్',
      'age.month.11': 'నవంబర్',
      'age.month.12': 'డిసెంబర్',
      'age.error.empty': 'దయచేసి మీ పుట్టుదిన తేదీని నమోదు చేయండి.',
      'age.error.format': 'దయచేసి తేదీ పికర్ ద్వారా సరైన తేదీని నమోదు చేయండి.',
      'age.error.impossible': 'ఆ తేదీ ఉనికాదు. దయచేసి రోజు, నెల సరిచూసుకోండి.',
      'age.error.outOfRange': 'దయచేసి 1900 నుండి 2200 మధ్య సంవత్సరాన్ని నమోదు చేయండి.',
      'age.error.future': 'పుట్టుదిన తేదీ భవిష్యత్‌లో ఉండదు. దయచేసి ఈ రోజు లేదా దానికి ముందు తేదీ నమోదు చేయండి.',
      'age.msg.birthdayToday': 'ఈ రోజే మీ పుట్టుదిన. జన్మదిన శుభాకాంక్షలు!',
      'age.msg.daysToGo': 'ఇంకో {0} రోజులు.',
      'age.unit.year': '{0} సంవత్సరాలు',
      'age.unit.years': '{0} సంవత్సరాలు',
      'age.unit.day': '{0} రోజు',
      'age.unit.days': '{0} రోజులు',
      'solver.source.local': 'లోకల్ సాల్వర్',
      'solver.source.ai': 'AI సాల్వర్',
      'solver.title.unsupported': 'ఇక్కడ ఇంకా పరిష్కరించలేం',
      'solver.title.error': 'పరిష్కరించలేకపోయాము',
      'solver.title.aiError': 'AI సాల్వర్ అందుబాటులో లేదు',
      'solver.title.loading': 'AI పరిష్కరిస్తోంది...',
      'solver.title.questionNeeded': 'ప్రశ్న అవసరం',
      'solver.msg.notLoaded': 'లోకల్ సాల్వర్ లోడ్ కాలేదు.',
      'solver.msg.invalid': 'లోకల్ సాల్వర్ ఈ ప్రశ్నను పరిష్కరించలేకపోయింది.',
      'solver.msg.loading': 'మీ ప్రశ్న AI సాల్వర్‌కు పంపబడింది. వేచుకుంటున్నప్పుడు కాలిక్యులేటర్ మీలాగే పనిచేస్తుంది.',
      'solver.msg.aiUnavailable': 'AI సాల్వర్ ఇప్పుడు అందుబాటులో లేదు. మీరు లోకల్ కాలిక్యులేటర్, ఆఫ్‌లైన్ సాల్వర్ వాడుకోవచ్చు.',
      'solver.msg.empty': 'దయచేసి ఒక గణిత ప్రశ్న రాయండి.',
      'solver.step.prefix': 'దశ {0}: ',
      'solver.answer.prefix': 'సమాధానం: ',
      'username.greeting': 'స్వాగతం, {0}',
      'username.error.required': 'దయచేసి యూజర్‌నేమ్ ఎంచుకోండి.',
      'username.error.tooLong': 'ఈ యూజర్‌నేమ్ చాలా పొడవైనది. దయచేసి 24 అక్షరాలు లేదా అంతకంటే తక్కువ ఉంచండి.',
      'username.error.invalid': 'అక్షరాలు, అంకెలు, ఒక్కొక్క space, dot, dash లేదా underscore మాత్రమే వాడండి.',
      // ---- Phase 2D: local solver explanation (simple Telugu) ---------------
      'solver.section.question': 'ప్రశ్న',
      'solver.section.given': 'ఇవి ఇవ్వబడ్డాయి',
      'solver.section.toFind': 'ఏమి కనుగొనాలి',
      'solver.section.concept': 'భావం',
      'solver.section.formula': 'సూత్రం',
      'solver.section.expression': 'వ్యంజకం',
      'solver.section.substitution': 'విలువ పెట్టినప్పుడు',
      'solver.section.calculation': 'లెక్క',
      'solver.section.verification': 'తనిఖీ',
      'solver.section.finalAnswer': 'చివరి సమాధానం',
      'solver.bothSides.subtract': 'రెండు వైపుల నుండి {0} తీసివేయండి.',
      'solver.bothSides.add': 'రెండు వైపులకు {0} కలుపండి.',
      'solver.bothSides.divide': 'రెండు వైపులను {0} తో భాగించండి.',
      'solver.step.collectX': 'x ఉన్న పదాలను ఒక వైపుకు తీసుకురండి',
      'solver.step.removeConstant': 'x లేని పదాన్ని తీసివేయండి',
      'solver.step.isolateX': 'x ను దేనిలోకి వేరు చేయండి',
      'solver.step.readOff': 'సమాధానం చదివేయండి',
      'solver.step.discriminant': 'Discriminant ను కనుగొనండి',
      'solver.step.interpretDiscriminant': 'Discriminant అర్థం చేసుకోండి',
      'solver.step.applyQuadratic': 'Quadratic formula వాడండి',
      'solver.linear.concept': 'ఒక variable ఉన్న linear equation. x దగ్గరి చర్యలను విరుద్ధ క్రమంలో తీసివేయండి: ముందు x లేని పదాన్ని తీసివేసి, తర్వాత గుణకారాన్ని తీసివేయండి.',
      'solver.quadratic.concept': 'ఒక variable ఉన్న quadratic equation. ముందు దానిని సాధారణ రూపంతో సరిపోల్చి, తర్వాత quadratic formula వాడండి.',
      'solver.quadratic.noRealRoots': 'Discriminant ఋణాత్మకంగా ఉంది, కాబట్టి ఈ equation కు నిజమైన మూలాలు లేవు.',
      'solver.geometry.concept': 'ప్రశ్నలో కొలుసులు ఇవ్వబడిన ప్రత్యక్ష geometry formula.',
      'solver.percent.concept': 'మొత్తం విలువలో శాతం.',
      'solver.fraction.concept': 'మొత్తం విలువలో భిన్నం.',
      'solver.change.conceptIncrease': 'ఒక విలువను శాతాన్ని పెంచడం.',
      'solver.change.conceptDecrease': 'ఒక విలువను శాతాన్ని తగ్గించడం.',
      'solver.trig.concept': 'కోణం యొక్క త్రికోనమితి విలువ, {0} మోడ్‌లో లెక్కించబడింది.',
      'solver.trig.wordDegree': 'డిగ్రీ',
      'solver.trig.wordRadian': 'రేడియన్',
      'solver.root.concept': 'Square root: తనను తాను గుణిస్తే అదే సంఖ్య వచ్చే negative కాని సంఖ్య.',
      'solver.power.concept': '{0} ను తనను తాను {1} సార్లు గుణించారు.',
      'solver.fraction.lcmConcept': 'భిన్నాలను కలపడానికి వాటిని ఒకే హారం (LCM) లోకి మార్చండి.',
      'solver.verify.substituteInto': 'మూల equation లో x = {0} పెట్టి తనిఖీ చేయండి:',
      'solver.verify.substituteIntoExpr': '{1} లో x = {0} పెట్టండి:',
      'solver.geometry.areaCircle': 'వృత్త చిత్రఫలం',
      'solver.geometry.circumferenceCircle': 'వృత్త పరిధి',
      'solver.geometry.areaRectangle': 'దీర్ఘచతురస్త చిత్రఫలం',
      'solver.geometry.perimeterRectangle': 'దీర్ఘచతురస్త చుట్టుకొలత',
      'solver.geometry.areaSquare': 'చతురస్రం చిత్రఫలం',
      'solver.geometry.perimeterSquare': 'చతురస్రం చుట్టుకొలత',
      'solver.geometry.areaTriangle': 'త్రిభుజ చిత్రఫలం',
      'solver.change.increased': 'పెరిగిన విలువ',
      'solver.change.decreased': 'తగ్గిన విలువ',
      'solver.change.afterIncrease': '{0}% పెంచిన తర్వాత',
      'solver.change.afterDecrease': '{0}% తగ్గించిన తర్వాత',
      'solver.change.wordIncrease': 'పెంచడం',
      'solver.change.wordDecrease': 'తగ్గించడం'
    },
    // Roman Telugu: the same Telugu in English letters, simple everyday words.
    'te-Latn': {
      'theme.label.light': 'Lethu',
      'theme.label.dark': 'Gaadha',
      'calc.error.EMPTY': 'Mundu oka gana raayandi',
      'calc.error.INCOMPLETE': 'Gana asampurnamga undi',
      'calc.error.SYNTAX': 'Gana sarainadi kaadu',
      'calc.error.DIVIDE_BY_ZERO': 'Sunna dwara bhaginchaleru',
      'calc.error.OVERFLOW': 'Phalitham chaala peddadi',
      'calc.error.TOO_COMPLEX': 'Gana chaala podavainadi',
      'calc.error.DOMAIN': 'Ee kaaryam ikkada panichedu',
      'calc.error.FACTORIAL': 'Factorial sarainadi kaadu',
      'history.aria.reuse': '{0} phalitham {1} malli vaadandi',
      'history.aria.remove': '{0}nu charitra nundi teesiveyandi',
      'history.aria.angle': '{0} mood lo lekkincharaaru',
      'history.confirm.clear': 'Mottam gana charitranu tolaginchaala?',
      'history.notice.storage': 'Ee browser lo local storage panichedadu, kabatti charitra tab muse puttu matrame untundi.',
      'converter.result.value': '{0} viluva',
      'converter.error.empty': 'Marchadaniki oka sankhyanu raayandi.',
      'converter.error.unknownBase': 'Saraina number system ni enchiyandi.',
      'converter.error.tooLong': 'Ee sankhya marchadaniki chaala podavainadi.',
      'converter.error.decimal': 'Dasam sankhya sarainadi kaadu. Dasam lo 0 nundi 9 varaku ankenalu matrame untaayi.',
      'converter.error.binary': 'Binary sankhya sarainadi kaadu. Binary lo 0, 1 matrame untaayi.',
      'converter.error.octal': 'Octal sankhya sarainadi kaadu. Octal lo 0 nundi 7 varaku ankenalu matrame untaayi.',
      'converter.error.hexadecimal': 'Hexadecimal sankhya sarainadi kaadu. Idilo 0 nundi 9 varaku ankenalu, A nundi F varaku aksharalu untaayi.',
      'converter.btn.copied': 'Kapi ayindi',
      'converter.copy.noResult': 'Inka kaapi chedadaniki emi ledu. Mundu oka sankhyanu marchandi.',
      'converter.copy.unavailable': 'Ee browser lo kaapi panichedu. Dayachesi paina unna phalithanni chadavandi.',
      'converter.copy.failed': 'Tanantaga kaapi kaaledu. Dayachesi paina unna phalithanni chadavandi.',
      'age.month.1': 'January',
      'age.month.2': 'February',
      'age.month.3': 'March',
      'age.month.4': 'April',
      'age.month.5': 'May',
      'age.month.6': 'June',
      'age.month.7': 'July',
      'age.month.8': 'August',
      'age.month.9': 'September',
      'age.month.10': 'October',
      'age.month.11': 'November',
      'age.month.12': 'December',
      'age.error.empty': 'Dayachesi mee puttudina teedini nambundi.',
      'age.error.format': 'Dayachesi teedhi picker dwara saraina teedhi nambundi.',
      'age.error.impossible': 'Aa teedhi unikadu. Dayachesi roju, nela sarichusukonandi.',
      'age.error.outOfRange': 'Dayachesi 1900 nundi 2200 madhya samvarsarani nambundi.',
      'age.error.future': 'Puttudina teedhi bhavishyata lo undadu. Dayachesi ee roju leda daniki mundu teedhi nambundi.',
      'age.msg.birthdayToday': 'Ee roje mee puttudina. Janmadina shubhakaankshalu!',
      'age.msg.daysToGo': 'Inko {0} rojulu.',
      'age.unit.year': '{0} samvarsaralu',
      'age.unit.years': '{0} samvarsaralu',
      'age.unit.day': '{0} roju',
      'age.unit.days': '{0} rojulu',
      'solver.source.local': 'Local Solver',
      'solver.source.ai': 'AI Solver',
      'solver.title.unsupported': 'Ikkada inka parisarinchaleru',
      'solver.title.error': 'Parisarinchalekapoyam',
      'solver.title.aiError': 'AI Solver andubatulo ledu',
      'solver.title.loading': 'AI parisaristundi...',
      'solver.title.questionNeeded': 'Prashnam avasaram',
      'solver.msg.notLoaded': 'Local Solver load kaaledu.',
      'solver.msg.invalid': 'Local Solver ee prashnam parisarinchalekapoyandi.',
      'solver.msg.loading': 'Mee prashnam AI Solver ku pepabadi. Vechukuntunnappooru calculator meelaaga panichestundi.',
      'solver.msg.aiUnavailable': 'AI Solver ippatu andubatulo ledu. Meeru local calculator, offline solver vaadukochu.',
      'solver.msg.empty': 'Dayachesi oka ganita prashnam raayandi.',
      'solver.step.prefix': 'Dasha {0}: ',
      'solver.answer.prefix': 'Samadhanam: ',
      'username.greeting': 'Svagatam, {0}',
      'username.error.required': 'Dayachesi username enchiyandi.',
      'username.error.tooLong': 'Ee username chaala podavainadi. Dayachesi 24 aksharalu leda ante takuva unchandi.',
      'username.error.invalid': 'Aksharalu, ankenalu, okkokk space, dot, dash leda underscore matrame vaadandi.',
      // ---- Phase 2D: local solver explanation (Roman Telugu) ---------------
      'solver.section.question': 'Prashnam',
      'solver.section.given': 'Ivi ivvabadi',
      'solver.section.toFind': 'Emi kanugonali',
      'solver.section.concept': 'Bhaavam',
      'solver.section.formula': 'Sootram',
      'solver.section.expression': 'Vyangakam',
      'solver.section.substitution': 'Viluva petta',
      'solver.section.calculation': 'Lekka',
      'solver.section.verification': 'Tanikhi',
      'solver.section.finalAnswer': 'Chivari samadhanam',
      'solver.bothSides.subtract': 'Rendu vaipulundi {0} teesiveyandi.',
      'solver.bothSides.add': 'Rendu vaipulaku {0} kalupandi.',
      'solver.bothSides.divide': 'Rendu vaipulani {0} tho bhaginchandi.',
      'solver.step.collectX': 'x unna padalanu oka vaipuku teesukurandi',
      'solver.step.removeConstant': 'x lena padanni teesiveyandi',
      'solver.step.isolateX': 'x ni vere gaani chesu konnandi',
      'solver.step.readOff': 'Samadhanam chadiveyandi',
      'solver.step.discriminant': 'Discriminant ni kanugonandi',
      'solver.step.interpretDiscriminant': 'Discriminant artham chesukondandi',
      'solver.step.applyQuadratic': 'Quadratic formula vaadandi',
      'solver.linear.concept': 'Oka variable unna linear equation. x daggarile charyalanu viruddha kramalo teesiveyandi: mundu x lena padanni teesivesi, tarvata gundakaranni teesiveyandi.',
      'solver.quadratic.concept': 'Oka variable unna quadratic equation. Mundu daanini sadharana rooptho saripolchi, tarvata quadratic formula vaadandi.',
      'solver.quadratic.noRealRoots': 'Discriminant runatmakangaundi, kabatti ee equation ku nijamaina moolalu levu.',
      'solver.geometry.concept': 'Prashnlo kolusula ivvabadina pratyakshak geometry formula.',
      'solver.percent.concept': 'Mottam viluvalo shatam.',
      'solver.fraction.concept': 'Mottam viluvalo bhinnam.',
      'solver.change.conceptIncrease': 'Oka viluvani shatani penchadam.',
      'solver.change.conceptDecrease': 'Oka viluvani shatani tagginchadam.',
      'solver.trig.concept': 'Konam yooka trigonometric viluva, {0} mood lo lekkincabindi.',
      'solver.trig.wordDegree': 'degree',
      'solver.trig.wordRadian': 'radian',
      'solver.root.concept': 'Square root: tananu tananu guinisite adeyi sankhya vachche negative kaani sankhya.',
      'solver.power.concept': '{0} ni tananu tananu {1} saarlu guNacharu.',
      'solver.fraction.lcmConcept': 'Bhinnalanu kalapadaniki vaatini oke haaram (LCM) loki marchandi.',
      'solver.verify.substituteInto': 'Mula equation lo x = {0} peti tanikhi cheyandi:',
      'solver.verify.substituteIntoExpr': '{1} lo x = {0} pettandi:',
      'solver.geometry.areaCircle': 'Vrutta chitraphalam',
      'solver.geometry.circumferenceCircle': 'Vrutta paridhi',
      'solver.geometry.areaRectangle': 'Dirighachaturashta chitraphalam',
      'solver.geometry.perimeterRectangle': 'Dirighachaturashta chuttukolata',
      'solver.geometry.areaSquare': 'Chathurasram chitraphalam',
      'solver.geometry.perimeterSquare': 'Chathurasram chuttukolata',
      'solver.geometry.areaTriangle': 'Tribhuja chitraphalam',
      'solver.change.increased': 'Perigina viluva',
      'solver.change.decreased': 'Taggina viluva',
      'solver.change.afterIncrease': '{0}% penchina tarvata',
      'solver.change.afterDecrease': '{0}% tagginchina tarvata',
      'solver.change.wordIncrease': 'penchadam',
      'solver.change.wordDecrease': 'tagginchadam'
    }
  };

  // Merge the dynamic block too, so t() and DICTIONARY expose one flat set.
  Object.keys(DYNAMIC_UI).forEach(function (code) {
    const source = DYNAMIC_UI[code];
    const target = DICTIONARY[code];
    Object.keys(source).forEach(function (key) {
      target[key] = source[key];
    });
  });
  /**
   * PHASE 2 (Math Keyboard) - the toggle, the panel and its group headings.
   *
   * Every one of these strings is written by the EXISTING [data-i18n] /
   * [data-i18n-attr] pass in index.html, so switching language updates the
   * keyboard chrome with no reload and no new dictionary. Only
   * `keyboard.aria.insert` is built by JavaScript at runtime, because it is
   * one template reused by every key.
   *
   * The mathematical characters themselves (pi, sqrt, superscripts, sin( ...)
   * and so on) are deliberately NOT translated: they are syntax, not words.
   * Only the words around them are.
   */
  const MATH_KEYBOARD_UI = {
    en: {
      'keyboard.toggle': '\u2328 Math Keyboard',
      'keyboard.aria.toggle': 'Show or hide the math keyboard',
      'keyboard.aria.panel': 'Math keyboard',
      'keyboard.hint': 'Tap a key to put it where the cursor is. Your text is never changed in any other way.',
      'keyboard.group.operators': 'Operators and brackets',
      'keyboard.group.symbols': 'Symbols',
      'keyboard.group.powers': 'Powers',
      'keyboard.group.functions': 'Functions',
      'keyboard.group.extra': 'More',
      'keyboard.aria.insert': 'Insert {0}'
    },
    hi: {
      'keyboard.toggle': '\u2328 गणित कीबोर्ड',
      'keyboard.aria.toggle': 'गणित कीबोर्ड दिखाएँ या छिपाएँ',
      'keyboard.aria.panel': 'गणित कीबोर्ड',
      'keyboard.hint': 'जिस जगह कर्सर है, वहीं दबाया गया अक्षर आ जाएगा। आपके लिखे हुए पाठ को इसके अलावा कुछ नहीं बदलता।',
      'keyboard.group.operators': 'चिह्न और कोष्ठक',
      'keyboard.group.symbols': 'प्रतीक',
      'keyboard.group.powers': 'घात',
      'keyboard.group.functions': 'फलन',
      'keyboard.group.extra': 'और भी',
      'keyboard.aria.insert': '{0} जोड़ें'
    },
    'hi-Latn': {
      'keyboard.toggle': '\u2328 Ganit keyboard',
      'keyboard.aria.toggle': 'Ganit keyboard dikhayein ya chhupayein',
      'keyboard.aria.panel': 'Ganit keyboard',
      'keyboard.hint': 'Jahan cursor hai, wahan dabaya gaya akshar aa jayega. Aapka likha hua text iske alawa kuch nahi badalta.',
      'keyboard.group.operators': 'Operator aur bracket',
      'keyboard.group.symbols': 'Symbol',
      'keyboard.group.powers': 'Power',
      'keyboard.group.functions': 'Function',
      'keyboard.group.extra': 'Aur bhi',
      'keyboard.aria.insert': '{0} jodein'
    },
    te: {
      'keyboard.toggle': '\u2328 గణిత కీబోర్డ్',
      'keyboard.aria.toggle': 'గణిత కీబోర్డ్ చూపించు లేదా దాచు',
      'keyboard.aria.panel': 'గణిత కీబోర్డ్',
      'keyboard.hint': 'కర్సర్ ఉన్న చోటే నొక్కిన అక్షరం చేరుతుంది. మీరు రాసిన పాఠ్యం దీనికి వెలుపు ఏమీ మారదు.',
      'keyboard.group.operators': 'ఆపరేటర్లు, కొంసలు',
      'keyboard.group.symbols': 'గుణ్యాలు',
      'keyboard.group.powers': 'ఘాతాలు',
      'keyboard.group.functions': 'ఫంక్షన్లు',
      'keyboard.group.extra': 'మరిన్ని',
      'keyboard.aria.insert': '{0} చేర్చు'
    },
    'te-Latn': {
      'keyboard.toggle': '\u2328 Ganita keybord',
      'keyboard.aria.toggle': 'Ganita keybord choopinchi leda daachu',
      'keyboard.aria.panel': 'Ganita keybord',
      'keyboard.hint': 'Karsar unna chote nokkina aksharam cherutundi. Meeru rasina paṭyam deeniki velu emi maaradu.',
      'keyboard.group.operators': 'Operatarlu, konsalu',
      'keyboard.group.symbols': 'Gunyalu',
      'keyboard.group.powers': 'Ghatalu',
      'keyboard.group.functions': 'Phanakshanlu',
      'keyboard.group.extra': 'Marininna',
      'keyboard.aria.insert': '{0} cerchu'
    }
  };

  // Merge the Math Keyboard block the same way, so t() and DICTIONARY still
  // expose exactly one flat set and the "every language has every key" test
  // keeps holding.
  Object.keys(MATH_KEYBOARD_UI).forEach(function (code) {
    const source = MATH_KEYBOARD_UI[code];
    const target = DICTIONARY[code];
    Object.keys(source).forEach(function (key) {
      target[key] = source[key];
    });
  });

  createI18n.LANGUAGES = LANGUAGES;
  createI18n.CODES = CODES;
  createI18n.NAMES = NAMES;
  createI18n.HTML_LANG = HTML_LANG;
  createI18n.DEFAULT_LANGUAGE = DEFAULT_LANGUAGE;
  createI18n.SETTINGS_KEY = SETTINGS_KEY;
  createI18n.DICTIONARY = DICTIONARY;

  return createI18n;
});