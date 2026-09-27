/**
 * Multilingual foundation tests (Phase 1) - Node, no framework:
 *   node tests/i18n.test.js
 * -----------------------------------------------------------------------------
 * No DOM is needed for most checks (the service is pure data plus a settings
 * store); the DOM pass is verified against a tiny fake document. Nothing here
 * contacts a server or reads a real key.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const createI18n = require(path.join(ROOT, 'js', 'services', 'i18n.js'));
const createSettingsStore = require(path.join(ROOT, 'js', 'services', 'settings-store.js'));

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

/** Memory storage with the same shape as js/services/storage.js. */
function fakeStorage(initial) {
  const values = Object.assign({}, initial || {});
  return {
    get: function (name, fallback) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : fallback;
    },
    set: function (name, value) { values[name] = JSON.parse(JSON.stringify(value)); return true; },
    remove: function (name) { delete values[name]; },
    _values: values
  };
}

function settingsWith(stored) {
  return createSettingsStore(fakeStorage(stored), {
    defaults: { theme: 'system', calculatorMode: 'basic', angleMode: 'deg', language: 'en' }
  });
}

/** A minimal fake element/document for the applyTo() pass. */
function fakeElement(attrs) {
  const attributes = Object.assign({}, attrs || {});
  return {
    textContent: '',
    attrs: attributes,
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    setAttribute: function (name, value) { attributes[name] = value; }
  };
}
function fakeDocument(nodes) {
  return {
    documentElement: fakeElement({ lang: 'en' }),
    querySelectorAll: function (selector) {
      return (nodes || []).filter(function (node) { return node.__selector === selector; });
    }
  };
}

function main() {
  // ------------------------------------------------------- 1) default English
  section('1) English is the default');
  const i18n = createI18n(settingsWith());
  check('default language is en', i18n.getLanguage(), 'en');
  check('DEFAULT_LANGUAGE is en', createI18n.DEFAULT_LANGUAGE, 'en');
  check('the settings key is "language"', createI18n.SETTINGS_KEY, 'language');
  check('t() returns the English text', i18n.t('nav.calculator'), 'Calculator');
  check('t() on the language label', i18n.t('label.language'), 'Language');

  // ------------------------------------------------------ 2) all five codes
  section('2) All five languages are supported');
  check('exactly five languages', createI18n.LANGUAGES.length, 5);
  check('the codes are exactly the agreed set', JSON.stringify(createI18n.CODES),
    JSON.stringify(['en', 'hi', 'hi-Latn', 'te', 'te-Latn']));
  check('English label', createI18n.NAMES.en, 'English');
  check('Hindi label', createI18n.NAMES.hi, 'हिंदी');
  check('Roman Hindi label', createI18n.NAMES['hi-Latn'], 'Roman Hindi');
  check('Telugu label', createI18n.NAMES.te, 'తెలుగు');
  check('Roman Telugu label', createI18n.NAMES['te-Latn'], 'Roman Telugu');
  createI18n.CODES.forEach(function (code) {
    ok(code + ' is accepted by isSupported', i18n.isSupported(code));
    ok(code + ' has a dictionary', !!createI18n.DICTIONARY[code]);
  });

  // -------------------------------------------- 3) invalid values fall back
  section('3) An invalid language safely falls back to English');
  ['fr', 'EN', 'hindi', '', 'de-DE', 'hi-latn', 'zh', 'xx-Latn', 'en-US']
    .forEach(function (bad) {
      const service = createI18n(settingsWith());
      check('isSupported("' + bad + '") is false', service.isSupported(bad), false);
      service.setLanguage(bad);
      check('setLanguage("' + bad + '") keeps English', service.getLanguage(), 'en');
    });
  check('an invalid STORED language falls back to en',
    createI18n(settingsWith({ 'settings:v1': { language: 'klingon' } })).getLanguage(), 'en');
  check('a non-string stored language falls back to en',
    createI18n(settingsWith({ 'settings:v1': { language: 42 } })).getLanguage(), 'en');
  const noSettings = createI18n(null);
  check('the service works without a settings store', noSettings.getLanguage(), 'en');
  check('and can still switch language', noSettings.setLanguage('te'), 'te');

  // ---------------------------------------------- 4) setLanguage / getLanguage
  section('4) setLanguage() changes the language and getLanguage() reports it');
  const service = createI18n(settingsWith());
  check('starts English', service.getLanguage(), 'en');
  check('setLanguage returns the new language', service.setLanguage('hi'), 'hi');
  check('getLanguage agrees', service.getLanguage(), 'hi');
  check('Hindi text is used now', service.t('nav.calculator'), 'कैलकुलेटर');
  service.setLanguage('te-Latn');
  check('Roman Telugu text is used now', service.t('nav.about'), 'Gurinchi');
  service.setLanguage('en');
  check('switching back to English works', service.t('nav.about'), 'About');

  // ---------------------------------------------- 5) settings persistence
  section('5) The language persists through the EXISTING settings store');
  const storage = fakeStorage();
  const settings = createSettingsStore(storage, { defaults: { theme: 'system', language: 'en' } });
  const persisted = createI18n(settings);
  persisted.setLanguage('te');
  check('written under the existing settings key', settings.get('language'), 'te');
  check('stored in the existing smc:settings:v1 blob', storage.get('settings:v1').language, 'te');
  check('no new storage key was introduced',
    JSON.stringify(Object.keys(storage._values)), JSON.stringify(['settings:v1']));
  check('other settings are untouched', settings.get('theme'), 'system');
  const reloaded = createI18n(createSettingsStore(storage, { defaults: { language: 'en' } }));
  check('the choice survives a reload', reloaded.getLanguage(), 'te');
  check('and is used for translation', reloaded.t('label.language'), 'భాష');
  reloaded.setLanguage('hi');
  // Assert on the STORED blob, not on the earlier store instance: that instance
  // holds its own in-memory copy and is deliberately not a live view of storage.
  check('switching after a reload persists again', storage.get('settings:v1').language, 'hi');
  check('the original store still reports its own last written value',
    settings.get('language'), 'te');

  // ------------------------------------------------ 6) subscribers notified
  section('6) Subscribers are notified');
  const notifyService = createI18n(settingsWith());
  const seen = [];
  const unsubscribe = notifyService.subscribe(function (language) { seen.push(language); });
  check('the subscriber is called immediately on subscribe', seen.length, 1);
  check('with the current language', seen[0], 'en');
  notifyService.setLanguage('hi');
  check('a change notifies', seen.length, 2);
  check('with the new language', seen[1], 'hi');
  notifyService.setLanguage('te-Latn');
  check('a third change notifies', seen.length, 3);
  check('with Roman Telugu', seen[2], 'te-Latn');
  notifyService.setLanguage('not-a-language');
  check('an ignored change does NOT notify', seen.length, 3);
  unsubscribe();
  notifyService.setLanguage('en');
  check('after unsubscribe there are no more calls', seen.length, 3);
  const multi = createI18n(settingsWith());
  let a = 0;
  let b = 0;
  multi.subscribe(function () { a += 1; });
  multi.subscribe(function () { b += 1; });
  multi.setLanguage('hi');
  check('first subscriber was notified', a, 2);
  check('second subscriber was notified', b, 2);
  ok('a non-function subscriber is ignored safely', typeof multi.subscribe('nope') === 'function');

  // --------------------------------------------------- 7) safe fallbacks
  section('7) Translation lookup never fails');
  check('a known key resolves', createI18n.DICTIONARY.en['nav.about'], 'About');
  const lookup = createI18n(settingsWith());
  check('an unknown key returns the key itself', lookup.t('no.such.key'), 'no.such.key');
  check('an empty key returns an empty string', lookup.t(''), '');
  check('a null key is safe', lookup.t(null), '');
  check('a number key is safe', lookup.t(7), '');
  check('undefined is safe', lookup.t(undefined), '');
  const keys = Object.keys(createI18n.DICTIONARY.en);
  ok('the Phase 1 key set is not empty', keys.length >= 10);
  createI18n.CODES.forEach(function (code) {
    keys.forEach(function (key) {
      ok(code + ' has "' + key + '"', typeof createI18n.DICTIONARY[code][key] === 'string');
    });
  });

  // ------------------------------- 8) Roman Hindi / Telugu entries are real
  section('8) Roman Hindi, Telugu and Roman Telugu entries exist and differ');
  const romanHindi = createI18n.DICTIONARY['hi-Latn'];
  ok('Roman Hindi has entries', !!romanHindi);
  check('Roman Hindi "about" is Parichay', romanHindi['nav.about'], 'Parichay');
  check('Roman Hindi "age" is Umra', romanHindi['nav.age'], 'Umra');
  check('Roman Hindi "language" is Bhasha', romanHindi['label.language'], 'Bhasha');
  check('Roman Hindi "clear" is Saaf Karein', romanHindi['label.clear'], 'Saaf Karein');
  check('Roman Hindi is written in Latin letters', /^[A-Za-z0-9 ,.'"()/-]+$/.test(romanHindi['nav.about']), true);
  ok('Roman Hindi is not just a copy of English',
    romanHindi['nav.about'] !== createI18n.DICTIONARY.en['nav.about']);

  const telugu = createI18n.DICTIONARY.te;
  ok('Telugu has entries', !!telugu);
  ok('Telugu uses Telugu script', /[ఀ-౿]/.test(telugu['nav.calculator']));
  check('Telugu "language" is భాష', telugu['label.language'], 'భాష');
  check('Telugu "about" is గురించి', telugu['nav.about'], 'గురించి');
  ok('Telugu differs from Hindi', telugu['nav.calculator'] !== createI18n.DICTIONARY.hi['nav.calculator']);

  const romanTelugu = createI18n.DICTIONARY['te-Latn'];
  ok('Roman Telugu has entries', !!romanTelugu);
  check('Roman Telugu "about" is Gurinchi', romanTelugu['nav.about'], 'Gurinchi');
  check('Roman Telugu "age" is Vayassu', romanTelugu['nav.age'], 'Vayassu');
  check('Roman Telugu "copy" is Kapi', romanTelugu['label.copy'], 'Kapi');
  ok('Roman Telugu is not a copy of English',
    romanTelugu['nav.about'] !== createI18n.DICTIONARY.en['nav.about']);
  ok('Roman Telugu is not Telugu script',
    romanTelugu['nav.about'] !== telugu['nav.about']);

  const hindi = createI18n.DICTIONARY.hi;
  ok('Hindi uses Devanagari', /[ऀ-ॿ]/.test(hindi['nav.calculator']));
  check('Hindi "clear" is साफ़ करें', hindi['label.clear'], 'साफ़ करें');

  // --------------------------------------------------- 9) the DOM pass
  section('9) The DOM pass rewrites text and attributes safely');
  const navButton = fakeElement({ 'data-i18n': 'nav.solver' });
  navButton.__selector = '[data-i18n]';
  const option = fakeElement({ 'data-i18n': 'lang.name.te' });
  option.__selector = '[data-i18n]';
  const select = fakeElement({ 'data-i18n-attr': 'aria-label:label.language' });
  select.__selector = '[data-i18n-attr]';
  const doc = fakeDocument([navButton, option, select]);

  const domService = createI18n(settingsWith());
  domService.applyTo(doc);
  check('text is written from the dictionary', navButton.textContent, 'Smart Solver');
  check('the language option keeps its native name', option.textContent, 'తెలుగు');
  check('the aria-label attribute is translated', select.getAttribute('aria-label'), 'Language');
  check('<html lang> is set from the language', doc.documentElement.getAttribute('lang'), 'en');

  domService.setLanguage('hi');
  domService.applyTo(doc);
  check('switching re-renders the text without a reload', navButton.textContent, 'स्मार्ट सॉल्वर');
  check('the attribute is re-rendered too', select.getAttribute('aria-label'), 'भाषा');
  check('<html lang> follows the language', doc.documentElement.getAttribute('lang'), 'hi');

  domService.setLanguage('te-Latn');
  domService.applyTo(doc);
  check('Roman Telugu <html lang> uses the script subtag',
    doc.documentElement.getAttribute('lang'), 'te-Latn');
  check('and the text is Roman Telugu', navButton.textContent, 'Smart Solver');

  // A malformed data-i18n-attr must never throw.
  const broken = fakeElement({ 'data-i18n-attr': 'no-colon-here,,:missingKey,aria-label:' });
  broken.__selector = '[data-i18n-attr]';
  let threw = false;
  try { domService.applyTo(fakeDocument([broken])); } catch (error) { threw = true; }
  check('a malformed attribute list does not throw', threw, false);
  check('an empty page is safe', domService.applyTo(fakeDocument([])), 'te-Latn');

  // ------------------------------------- 10) Phase 1 scope + safety scans
  section('10) Phase 1 scope and safety');
  const code = read('js/services/i18n.js')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  ok('no innerHTML in the service', code.indexOf('innerHTML') === -1);
  ok('no eval', !/\beval\s*\(/.test(code));
  ok('no new Function', !/new\s+Function/.test(code));
  ok('no localStorage in the service (it uses the settings store)',
    code.indexOf('localStorage') === -1);
  ok('no sessionStorage', code.indexOf('sessionStorage') === -1);
  ok('no document.cookie', code.indexOf('document.cookie') === -1);
  ok('no fetch / XHR in the service', !/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(code));
  ok('the service reads no environment variable', code.indexOf('process.env') === -1);
  ok('the service holds no credential', !/(API_KEY|ADMIN_TOKEN)/.test(code));

  // Phase 2C connected the runtime UI; Phase 2D adds the local solver's
  // explanation text. These stay free of i18n forever: the AI provider (its
  // prompt and generated answers), the calculator engine/model, navigation,
  // storage, the server and the admin page.
  ['js/services/ai-math-solver.js', 'js/core/calculator-model.js',
    'js/core/format.js', 'js/ui/navigation.js',
    'js/services/storage.js', 'js/services/settings-store.js',
    'js/services/admin-users-service.js', 'js/ui/admin-users-view.js', 'admin.html',
    'server/solve.js', 'server/provider.js', 'server/config.js', 'server/server.js',
    'server/usernames.js', 'server/admin-usernames.js']
    .forEach(function (rel) {
      ok(rel + ' still contains no i18n wiring', read(rel).indexOf('i18n') === -1);
    });
  // Phase 2D touched these three on purpose.
  ['js/services/math-solver.js', 'js/ui/solver-view.js', 'js/app.js']
    .forEach(function (rel) {
      ok(rel + ' is wired to i18n', read(rel).indexOf('i18n') !== -1);
    });
  // The maths itself must remain untouched.
  ok('the expression engine parses the same way',
    read('js/core/expression-engine.js').indexOf('ROOT_FUNCTIONS') !== -1);

  // The page wiring.
  const html = read('index.html');
  ok('index.html loads the i18n service',
    /<script src="js\/services\/i18n\.js"><\/script>/.test(html));
  ok('the selector exists', html.indexOf('data-language-select') !== -1);
  ok('the selector is a plain <select>',
    /<select[\s\S]{0,200}data-language-select/.test(html));
  ['en', 'hi', 'hi-Latn', 'te', 'te-Latn'].forEach(function (code2) {
    ok('the selector offers ' + code2, html.indexOf('value="' + code2 + '"') !== -1);
  });
  // Count only the options inside the language <select> element, not the
  // unrelated <option> elements the converter and age views also contain.
  const selectBlock = html.slice(html.indexOf('<select'),
    html.indexOf('</select>', html.indexOf('<select')) + '</select>'.length);
  check('the selector has exactly five options',
    (selectBlock.match(/<option/g) || []).length, 5);
  check('the navigation buttons carry data-i18n',
    (html.match(/data-i18n="nav\./g) || []).length, 5);
  check('the navigation still has its five items', (html.match(/data-view-target=/g) || []).length, 5);
  ok('the theme toggle is still present', html.indexOf('data-theme-toggle') !== -1);
  ok('the username greeting is still present', html.indexOf('data-username-greeting') !== -1);
  ok('the username popup is still present', html.indexOf('data-username-overlay') !== -1);
  ok('app.js adds the language default', /language: 'en'/.test(read('js/app.js')));
  ok('app.js still keeps the other defaults',
    /theme: 'system', calculatorMode: 'basic', angleMode: 'deg'/.test(read('js/app.js')));
  ok('admin.html has no language selector', read('admin.html').indexOf('data-language-select') === -1);

  // --------------------------------- 11) Phase 2A: safe interpolation
  section('11) Interpolation: t(key, params) substitutes numbered placeholders');
  const t = createI18n(settingsWith());

  // 1) a single {0}
  check('t(key, ["Kaif"]) replaces {0}', t.t('test.greeting', ['Kaif']), 'Welcome, Kaif');
  check('the single-parameter shorthand also works', t.t('test.greeting', 'Kaif'), 'Welcome, Kaif');

  // 2) multiple placeholders
  check('{0} and {1} both substitute',
    t.t('test.pair', ['Decimal', 'Binary']), 'Decimal converted to Binary');

  // 3) ordering follows the TEMPLATE, not the argument order - the whole point
  check('English order matches the argument order',
    t.t('test.pair', ['one', 'two']), 'one converted to two');
  t.setLanguage('hi');
  const hindiPair = t.t('test.pair', ['Decimal', 'Binary']);
  ok('Hindi uses its own word order, not the English one',
    hindiPair !== 'Decimal converted to Binary' && hindiPair.indexOf('Decimal') === 0, hindiPair);
  ok('both Hindi values are present', hindiPair.indexOf('Binary') !== -1, hindiPair);
  t.setLanguage('te');
  const teluguPair = t.t('test.pair', ['Decimal', 'Binary']);
  ok('Telugu reorders the pair too', teluguPair.indexOf('Decimal') === 0, teluguPair);
  ok('and is not the English string', teluguPair !== 'Decimal converted to Binary');
  t.setLanguage('en');

  // 4) a missing parameter must never throw
  let missingThrew = false;
  try {
    t.t('test.greeting');
    t.t('test.greeting', []);
    t.t('test.greeting', [undefined]);
    t.t('test.greeting', [null]);
    t.t('test.pair', ['only-one']);
  } catch (error) {
    missingThrew = true;
  }
  check('missing parameters never throw', missingThrew, false);
  // Documented behaviour: the placeholder stays visible instead of going blank.
  check('no params leaves the placeholder unchanged', t.t('test.greeting'), 'Welcome, {0}');
  check('an empty array leaves it unchanged', t.t('test.greeting', []), 'Welcome, {0}');
  check('an undefined entry leaves it unchanged',
    t.t('test.greeting', [undefined]), 'Welcome, {0}');
  check('a null entry leaves it unchanged', t.t('test.greeting', [null]), 'Welcome, {0}');
  check('a missing second placeholder is left visible',
    t.t('test.pair', ['only-one']), 'only-one converted to {1}');

  // 5) extra parameters are simply ignored
  check('extra parameters do not break anything',
    t.t('test.greeting', ['Kaif', 'EXTRA', 'MORE']), 'Welcome, Kaif');
  check('extra parameters on a two-placeholder key are ignored',
    t.t('test.pair', ['a', 'b', 'c', 'd', 'e']), 'a converted to b');

  // 6) numeric parameters
  check('an integer parameter works', t.t('test.greeting', [42]), 'Welcome, 42');
  check('zero is kept, not treated as missing', t.t('test.greeting', [0]), 'Welcome, 0');
  check('a decimal parameter works', t.t('test.greeting', [1.5]), 'Welcome, 1.5');
  check('a negative parameter works', t.t('test.greeting', [-7]), 'Welcome, -7');
  check('NaN becomes empty text, not "NaN"', t.t('test.greeting', [NaN]), 'Welcome, ');
  check('Infinity becomes empty text', t.t('test.greeting', [Infinity]), 'Welcome, ');

  // 7) empty-string and boolean parameters
  check('an empty-string parameter is safe', t.t('test.greeting', ['']), 'Welcome, ');
  check('true is inserted', t.t('test.greeting', [true]), 'Welcome, true');
  check('false is inserted', t.t('test.greeting', [false]), 'Welcome, false');

  // 8) parameters are TEXT ONLY - markup is never interpreted
  const xss = t.t('test.greeting', ['<script>alert(1)</script>']);
  check('a script tag stays literal text', xss, 'Welcome, <script>alert(1)</script>');
  ok('and is still just a string', typeof xss === 'string');
  check('an img/onerror payload stays literal text',
    t.t('test.greeting', ['<img src=x onerror=alert(1)>']),
    'Welcome, <img src=x onerror=alert(1)>');
  // A "$&" sequence would be re-expanded if replace() were used carelessly.
  check('a "$&" sequence is not re-expanded', t.t('test.greeting', ['$&']), 'Welcome, $&');
  check('a "$$" sequence is not re-expanded', t.t('test.greeting', ['$$']), 'Welcome, $$');
  check('a "$1" sequence is not re-expanded', t.t('test.greeting', ['$1']), 'Welcome, $1');
  // Non-primitives can never be stringified into the page.
  check('an object parameter becomes empty text',
    t.t('test.greeting', [{ a: 1 }]), 'Welcome, ');
  check('an array parameter becomes empty text', t.t('test.greeting', [[1, 2]]), 'Welcome, ');
  check('a function parameter becomes empty text',
    t.t('test.greeting', [function () { return 1; }]), 'Welcome, ');

  // 9) t(key) with no params is byte-for-byte the Phase 1 behaviour
  check('plain t(key) still returns the English text', t.t('nav.calculator'), 'Calculator');
  check('plain t(key) for another key still works', t.t('nav.solver'), 'Smart Solver');
  check('the language label is unchanged', t.t('label.language'), 'Language');
  check('an unknown key still returns the key', t.t('no.such.key'), 'no.such.key');
  check('an unknown key ignores params', t.t('no.such.key', ['X']), 'no.such.key');
  check('an empty key is still empty', t.t(''), '');
  check('a null key is still empty', t.t(null, ['X']), '');
  check('params on a key without placeholders are harmless',
    t.t('nav.about', ['Kaif']), 'About');
  check('the language names are unchanged', t.t('lang.name.te'), 'తెలుగు');
  check('a language name ignores params', t.t('lang.name.hi', ['X']), 'हिंदी');
  // Only NUMBERED placeholders count.
  check('a value containing braces is inserted literally',
    t.t('test.greeting', ['{1} and {2}']), 'Welcome, {1} and {2}');

  // 10) all five languages resolve the interpolation key
  const expectedGreeting = {
    en: 'Welcome, Kaif',
    hi: 'स्वागत है, Kaif',
    'hi-Latn': 'Svaagat, Kaif',
    te: 'స్వాగతం, Kaif',
    'te-Latn': 'Svagatam, Kaif'
  };
  const distinct = {};
  Object.keys(expectedGreeting).forEach(function (code) {
    const service = createI18n(settingsWith());
    service.setLanguage(code);
    check(code + ' interpolates test.greeting',
      service.t('test.greeting', ['Kaif']), expectedGreeting[code]);
    distinct[service.t('test.greeting', ['Kaif'])] = true;
  });
  ok('the five greetings are not all identical', Object.keys(distinct).length >= 4,
    String(Object.keys(distinct).length));

  // 11) interpolation survives a language switch
  const switcher = createI18n(settingsWith());
  check('English first', switcher.t('test.greeting', ['Kaif']), 'Welcome, Kaif');
  switcher.setLanguage('te');
  check('Telugu after switching', switcher.t('test.greeting', ['Kaif']), 'స్వాగతం, Kaif');
  switcher.setLanguage('en');
  check('back to English', switcher.t('test.greeting', ['Kaif']), 'Welcome, Kaif');
  switcher.setLanguage('fr');
  check('an unsupported language still falls back to English',
    switcher.t('test.greeting', ['Kaif']), 'Welcome, Kaif');

  // 12) interpolation works together with the unchanged fallbacks
  check('a stored language is used for interpolation',
    createI18n(settingsWith({ 'settings:v1': { language: 'te' } }))
      .t('test.greeting', ['Kaif']), 'స్వాగతం, Kaif');
  const noStore = createI18n(null);
  check('no settings store still interpolates in English',
    noStore.t('test.greeting', ['Kaif']), 'Welcome, Kaif');
  noStore.setLanguage('hi-Latn');
  check('and can still switch and interpolate',
    noStore.t('test.greeting', ['Kaif']), 'Svaagat, Kaif');

  // 13) the DOM pass is unchanged and still safe
  const navEl = fakeElement({ 'data-i18n': 'nav.solver' });
  navEl.__selector = '[data-i18n]';
  const interpDoc = fakeDocument([navEl]);
  const interpService = createI18n(settingsWith());
  interpService.applyTo(interpDoc);
  check('applyTo still writes plain text', navEl.textContent, 'Smart Solver');
  interpService.setLanguage('hi');
  interpService.applyTo(interpDoc);
  check('applyTo still re-renders on change', navEl.textContent, 'स्मार्ट सॉल्वर');

  // 14) no dynamic-code or HTML surface was introduced
  const i18nCode = read('js/services/i18n.js')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  ok('still no eval', !/\beval\s*\(/.test(i18nCode));
  ok('still no new Function', !/new\s+Function/.test(i18nCode));
  ok('still no innerHTML', i18nCode.indexOf('innerHTML') === -1);
  ok('no document.write', i18nCode.indexOf('document.write') === -1);
  ok('no insertAdjacentHTML', i18nCode.indexOf('insertAdjacentHTML') === -1);
  ok('no outerHTML assignment', !/outerHTML\s*=/.test(i18nCode));
  ok('interpolation uses a function callback, not a string replacement',
    /replace\(NUMBERED_PLACEHOLDER, function/.test(i18nCode));
  ok('the placeholder pattern only matches digits',
    /NUMBERED_PLACEHOLDER = \/\\\{\(\\d\+\)\\\}\/g/.test(i18nCode));
  ok('no HTML escaping crept in - the result stays plain text',
    i18nCode.indexOf('&lt;') === -1 && i18nCode.indexOf('&amp;') === -1);

  // 15) every Phase 1 key and every Phase 1 API member still exists
  const phase1Keys = ['app.name', 'nav.dashboard', 'nav.calculator', 'nav.solver',
    'nav.converter', 'nav.age', 'nav.about', 'label.language', 'label.copy',
    'label.clear', 'label.settings', 'label.history'];
  createI18n.CODES.forEach(function (code) {
    phase1Keys.forEach(function (key) {
      ok(code + ' still has the Phase 1 key "' + key + '"',
        typeof createI18n.DICTIONARY[code][key] === 'string');
    });
  });
  ['t', 'setLanguage', 'getLanguage', 'isSupported', 'subscribe', 'applyTo', 'applyHtmlLang',
    'LANGUAGES', 'NAMES', 'CODES', 'HTML_LANG', 'DICTIONARY'].forEach(function (member) {
    ok('instance API still exposes ' + member, i18n[member] !== undefined);
  });
  ['LANGUAGES', 'CODES', 'NAMES', 'HTML_LANG', 'DEFAULT_LANGUAGE', 'SETTINGS_KEY', 'DICTIONARY']
    .forEach(function (member) {
      ok('static API still exposes ' + member, createI18n[member] !== undefined);
    });
  check('LANGUAGES is still exactly five', createI18n.LANGUAGES.length, 5);
  check('CODES are unchanged', JSON.stringify(createI18n.CODES),
    JSON.stringify(['en', 'hi', 'hi-Latn', 'te', 'te-Latn']));
  check('HTML_LANG is unchanged', JSON.stringify(createI18n.HTML_LANG),
    JSON.stringify({ en: 'en', hi: 'hi', 'hi-Latn': 'hi-Latn', te: 'te', 'te-Latn': 'te-Latn' }));
  check('DEFAULT_LANGUAGE is still en', createI18n.DEFAULT_LANGUAGE, 'en');
  check('SETTINGS_KEY is still "language"', createI18n.SETTINGS_KEY, 'language');

  // 16) applyHtmlLang behaviour is untouched
  const langDoc = fakeDocument([]);
  createI18n(settingsWith()).applyHtmlLang(langDoc);
  check('<html lang> is en by default', langDoc.documentElement.getAttribute('lang'), 'en');
  const langService = createI18n(settingsWith());
  langService.setLanguage('te-Latn');
  langService.applyHtmlLang(langDoc);
  check('<html lang> still uses the script subtag',
    langDoc.documentElement.getAttribute('lang'), 'te-Latn');

  // ------------------ 12) PHASE 2B: static HTML wiring + key coverage
  const html2b = read('index.html');
  const english = createI18n.DICTIONARY.en;
  const allKeys = Object.keys(english);

  // Every data-i18n / data-i18n-attr reference in index.html must resolve.
  const textKeys = (html2b.match(/data-i18n="([^"]+)"/g) || [])
    .map(function (raw) { return raw.slice(11, -1); });
  const attrKeys = [];
  (html2b.match(/data-i18n-attr="[^"]+"/g) || []).forEach(function (raw) {
    raw.slice(16, -1).split(',').forEach(function (pair) {
      const separator = pair.indexOf(':');
      if (separator !== -1) { attrKeys.push(pair.slice(separator + 1).trim()); }
    });
  });
  const referenced = textKeys.concat(attrKeys);
  check('the page carries many data-i18n references', textKeys.length >= 40, true);
  check('the page carries aria-label / placeholder references', attrKeys.length >= 15, true);
  const missingRefs = [];
  referenced.forEach(function (key) {
    if (key.indexOf('lang.name.') === 0) { return; }
    if (!Object.prototype.hasOwnProperty.call(english, key)) { missingRefs.push(key); }
  });
  check('no referenced key is missing', Array.from(new Set(missingRefs)).join(', '), '');
  // Phase 1 keys that the STATIC markup does not use. `app.name` and
  // `label.copy` are written by JavaScript (Phase 2C, in js/app.js and the
  // converter view); `nav.dashboard` and `label.settings` have no surface yet.
  const reservedForLater = ['app.name', 'nav.dashboard', 'label.copy', 'label.settings'];
  // Phase 2C keys are resolved by JavaScript at runtime, not by index.html, so
  // they are exempt from the "referenced in the markup" rule.
  const DYNAMIC_PREFIXES = ['theme.label.light', 'theme.label.dark',
    'calc.error.', 'history.aria.', 'history.confirm.',
    'history.notice.', 'converter.result.', 'converter.error.', 'converter.copy.',
    'converter.btn.copied', 'age.month.', 'age.error.', 'age.msg.', 'age.unit.',
    'solver.source.', 'solver.title.', 'solver.msg.', 'solver.step.', 'solver.answer.',
    'solver.section.', 'solver.bothSides.', 'solver.linear.', 'solver.quadratic.',
    'solver.geometry.', 'solver.percent.', 'solver.fraction.', 'solver.change.',
    'solver.trig.', 'solver.root.', 'solver.power.', 'solver.verify.',
    // Phase 2 Math Keyboard: one aria-label template ("Insert {0}") is reused
    // by every rendered key button, so it is built by JavaScript at runtime and
    // is not a [data-i18n] reference in index.html. Every other keyboard string
    // (toggle, panel label, hint, group titles) IS in the markup.
    'keyboard.aria.insert',
    'username.greeting', 'username.error.'];
  const isDynamicKey = function (key) {
    return DYNAMIC_PREFIXES.some(function (prefix) { return key.indexOf(prefix) === 0; });
  };
  const unusedKeys = allKeys.filter(function (key) {
    if (key.indexOf('test.') === 0) { return false; }
    if (reservedForLater.indexOf(key) !== -1) { return false; }
    if (isDynamicKey(key)) { return false; }
    return referenced.indexOf(key) === -1;
  });
  check('no unused Phase 2B key (the dictionary matches the markup)',
    Array.from(new Set(unusedKeys)).join(', '), '');
  reservedForLater.forEach(function (key) {
    ok('reserved key "' + key + '" still exists', typeof english[key] === 'string');
  });

  // Every key exists, non-empty, in ALL five languages.
  ok('the static key set is substantial', allKeys.length >= 95, String(allKeys.length));
  createI18n.CODES.forEach(function (code) {
    const dict = createI18n.DICTIONARY[code];
    allKeys.forEach(function (key) {
      ok(code + ' has text for "' + key + '"',
        typeof dict[key] === 'string' && dict[key].trim().length > 0);
    });
    check(code + ' has the same key count as English',
      Object.keys(dict).length, allKeys.length);
  });

  // The non-English languages must really differ, not copy English.
  ['hi', 'te'].forEach(function (code) {
    const same = allKeys.filter(function (key) { return dict2(code)[key] === english[key]; });
    ok(code + ' is not an English copy', same.length < allKeys.length * 0.6,
      same.length + '/' + allKeys.length);
  });
  ['hi-Latn', 'te-Latn'].forEach(function (code) {
    const same = allKeys.filter(function (key) { return dict2(code)[key] === english[key]; });
    ok(code + ' is not an English copy', same.length < allKeys.length * 0.75,
      same.length + '/' + allKeys.length);
  });
  function dict2(code) { return createI18n.DICTIONARY[code]; }
  check('Hindi uses Devanagari', /[ऀ-ॿ]/.test(dict2('hi')['calc.mode.basic']), true);
  check('Telugu uses Telugu script', /[ఀ-౿]/.test(dict2('te')['calc.mode.basic']), true);
  check('Roman Hindi is its own wording', dict2('hi-Latn')['calc.mode.basic'], 'Simple');
  check('Roman Telugu is its own wording', dict2('te-Latn')['calc.mode.basic'], 'Saadharani');

  // Namespace guidance is respected.
  ['app.meta.', 'theme.', 'calc.', 'history.', 'solver.', 'tool.', 'converter.',
    'age.', 'about.', 'footer.', 'username.'].forEach(function (prefix) {
    ok('namespace "' + prefix + '" is used',
      allKeys.filter(function (key) { return key.indexOf(prefix) === 0; }).length > 0);
  });

  // English text preserved exactly as the in-page fallback.
  [['app.meta.title', 'Smart Math Calculator'],
    ['calc.mode.basic', 'Basic'],
    ['calc.mode.scientific', 'Scientific'],
    ['solver.mode.direct', 'Direct Answer'],
    ['solver.mode.full', 'Full Explanation'],
    ['age.title', 'Age Calculator'],
    ['converter.title', 'Number System Converter'],
    ['footer.brand', 'Developed by Kaif'],
    ['username.text', 'Please choose a username']]
    .forEach(function (pair) {
      check('English "' + pair[0] + '" is unchanged', english[pair[0]], pair[1]);
    });
  check('the keyboard hint keeps its symbols', english['calc.hint'].indexOf('0-9') !== -1, true);
  check('DEG/RAD were not given keys', english['calc.mode.deg'], undefined);

  // Structural safety: elements whose children JavaScript owns must NOT have
  // received data-i18n, because applyTo() writes textContent and would delete
  // those children.
  ok('the history title wraps only the word, keeping the count span',
    /<h2 class="history__title">\s*<span data-i18n="label\.history">/.test(html2b));
  ok('the history count span is still present', html2b.indexOf('data-history-count') !== -1);
  ok('the empty-history <strong>=</strong> survives between two spans',
    /data-i18n="history\.empty\.lead">[^<]*<\/span> <strong>=<\/strong> <span data-i18n="history\.empty\.tail"/.test(html2b));
  ok('the converter result-from span is not given data-i18n',
    /<span data-base-result-from>/.test(html2b) &&
    html2b.indexOf('<span data-base-result-from data-i18n') === -1);
  ok('the converter result-to span is not given data-i18n',
    html2b.indexOf('<span data-base-result-to data-i18n') === -1);
  ok('the converter result phrase is wrapped, not replacing the spans',
    html2b.indexOf('data-i18n="converter.result.phrase"') !== -1);
  ok('the age birthday line keeps both dynamic spans',
    /<span data-age-birthday><\/span>/.test(html2b) &&
    /<span data-age-birthday-years><\/span>/.test(html2b));
  ok('the age stat values keep their zero defaults',
    /data-age-years>0</.test(html2b) && /data-age-total-seconds>0</.test(html2b));

  // Only attributes carrying human-readable text may be translated.
  check('no state attribute is translated',
    (html2b.match(/data-i18n-attr="[^"]*"/g) || []).filter(function (raw) {
      return /aria-pressed|aria-current|aria-hidden|aria-selected|aria-expanded/.test(raw);
    }).join(', '), '');
  const targets = {};
  (html2b.match(/data-i18n-attr="[^"]*"/g) || []).forEach(function (raw) {
    raw.slice(16, -1).split(',').forEach(function (p) { targets[p.split(':')[0].trim()] = true; });
  });
  check('only text-bearing attributes are translated',
    Object.keys(targets).sort().join(', '), 'aria-label, content, placeholder');

  // Out-of-scope items must be untouched.
  check('the DEG/RAD buttons have no data-i18n',
    (html2b.match(/data-angle-toggle="deg"[\s\S]{0,240}?data-i18n/g) || []).length, 0);
  check('the example questions stay English solver input',
    html2b.indexOf('data-question="Solve 2x + 5 = 15"') !== -1, true);
  check('the example button labels are not translated',
    html2b.indexOf('data-question="Find the derivative of x&#178; + 3x">Find the derivative') !== -1, true);
  check('the numeric placeholder "10" was not translated', /placeholder="10"/.test(html2b), true);
  check('view panels are unchanged', (html2b.match(/data-view-panel=/g) || []).length, 5);
  check('nav targets are unchanged', (html2b.match(/data-view-target=/g) || []).length, 5);
  check('solver mode hooks are unchanged', (html2b.match(/data-solver-mode=/g) || []).length, 2);
  check('the i18n service is still loaded exactly once',
    (html2b.match(/js\/services\/i18n\.js/g) || []).length, 1);
  check('the username overlay and form are still wired',
    html2b.indexOf('data-username-overlay') !== -1 &&
    html2b.indexOf('data-username-form') !== -1 &&
    html2b.indexOf('data-username-submit') !== -1, true);

  // The admin safety assertion from the admin suite must still hold.
  check('index.html still contains no admin text',
    html2b.toLowerCase().indexOf('admin'), -1);
  check('index.html still never links to admin.html', html2b.indexOf('admin.html'), -1);
  check('no admin key was added to the dictionary',
    allKeys.filter(function (k) { return /admin/i.test(k); }).join(', '), '');

  // Language switching still drives all of this through applyTo().
  const switched = createI18n(settingsWith());
  const navCalc = fakeElement({ 'data-i18n': 'nav.calculator' });
  navCalc.__selector = '[data-i18n]';
  const ph = fakeElement({ 'data-i18n-attr': 'placeholder:solver.placeholder.question' });
  ph.__selector = '[data-i18n-attr]';
  const about = fakeElement({ 'data-i18n': 'about.field.name' });
  about.__selector = '[data-i18n]';
  const page = fakeDocument([navCalc, ph, about]);
  switched.applyTo(page);
  check('nav renders in English first', navCalc.textContent, 'Calculator');
  check('the solver placeholder renders in English first',
    ph.getAttribute('placeholder'), 'Type your math question here...');
  check('the about field renders in English first', about.textContent, 'Name');
  switched.setLanguage('hi');
  switched.applyTo(page);
  check('nav switches to Hindi', navCalc.textContent, 'कैलकुलेटर');
  check('the placeholder switches to Hindi',
    ph.getAttribute('placeholder'), 'अपना गणितीय प्रश्न यहाँ लिखें...');
  check('the about field switches to Hindi', about.textContent, 'नाम');
  switched.setLanguage('te-Latn');
  switched.applyTo(page);
  check('the about field switches to Roman Telugu', about.textContent, 'Peru');
  check('<html lang> still tracks the language', switched.applyHtmlLang(page), 'te-Latn');
  switched.setLanguage('fr');
  switched.applyTo(page);
  check('an unsupported language returns to English', navCalc.textContent, 'Calculator');

  // ------------------ 13) PHASE 2C: dynamic UI actually uses the dictionary
  section('13) Phase 2C: the dynamic UI consumers use translated text');
  const dyn = createI18n(settingsWith());
  // Phase 2C checks run against a non-English language so a missing translation
  // can never pass by accident.
  dyn.setLanguage('hi');
  const req2 = (rel) => require(path.join(ROOT, rel));

  // 13a) the expression engine's error messages
  const engine = req2('js/core/expression-engine.js');
  check('the engine exposes setTranslator', typeof engine.setTranslator, 'function');
  check('without a translator the message is the original English',
    engine.describeError(engine.ERROR_CODES.DIVIDE_BY_ZERO), 'Cannot divide by zero');
  engine.setTranslator(function (key) { return dyn.t(key); });
  check('with a translator it is translated',
    engine.describeError(engine.ERROR_CODES.DIVIDE_BY_ZERO), 'शून्य से भाग नहीं सकते');
  engine.setTranslator(function () { return ''; });
  check('an empty translation never blanks the message',
    engine.describeError(engine.ERROR_CODES.SYNTAX), 'Invalid expression');
  engine.setTranslator(null);
  check('clearing the translator restores English',
    engine.describeError(engine.ERROR_CODES.DIVIDE_BY_ZERO), 'Cannot divide by zero');

  // 13b) the converter's base names and validation errors
  const numberBase = req2('js/core/number-base.js');
  check('NumberBase exposes setTranslator', typeof numberBase.setTranslator, 'function');
  check('the base label is English without a translator',
    numberBase.label('hexadecimal'), 'Hexadecimal');
  check('the binary error is the original English',
    numberBase.convert('102', 'binary', 'decimal').error,
    'Invalid binary number. Binary numbers can contain only 0 and 1.');
  numberBase.setTranslator(function (key, params) { return dyn.t(key, params); });
  check('the base label is translated', numberBase.label('hexadecimal'), 'षोड्घाधारी');
  check('the binary error is translated',
    numberBase.convert('102', 'binary', 'decimal').error,
    createI18n.DICTIONARY.hi['converter.error.binary']);
  check('the conversion RESULT is unchanged maths',
    numberBase.convert('10', 'binary', 'decimal').result, '2');
  check('the empty error is translated too',
    numberBase.convert('', 'binary', 'decimal').error.indexOf('लिखें') !== -1, true);
  numberBase.setTranslator(null);
  check('clearing the converter translator restores English',
    numberBase.label('hexadecimal'), 'Hexadecimal');

  // 13c) the age calculator's month names and errors
  const ageCalc = req2('js/core/age-calculator.js');
  check('AgeCalculator exposes setTranslator', typeof ageCalc.setTranslator, 'function');
  check('the month name is English without a translator',
    ageCalc.formatDate(2000, 3, 5), '5 March 2000');
  ageCalc.setTranslator(function (key, params) { return dyn.t(key, params); });
  check('the month name is translated', ageCalc.formatDate(2000, 3, 5), '5 मार्च 2000');
  check('the impossible-date error is translated',
    ageCalc.parseDate('2000-13-01').error, 'यह तारीख मौजूद नहीं है। कृपया दिन और महीना देख लें।');
  check('the AGE MATHS is unchanged',
    ageCalc.calculate('2000-01-01', new Date(2000, 0, 2)).age.years, 0);
  check('and the totals still add up',
    ageCalc.calculate('2000-01-01', new Date(2000, 0, 2)).totals.days, 1);
  ageCalc.setTranslator(null);
  check('clearing the age translator restores English',
    ageCalc.formatDate(2000, 3, 5), '5 March 2000');

  // 13d) interpolation in the dynamic keys
  check('the greeting interpolates', dyn.t('username.greeting', ['Kaif']), 'स्वागत है, Kaif');
  check('the step prefix interpolates the index', dyn.t('solver.step.prefix', [2]), 'चरण 2: ');
  check('the reuse aria-label interpolates two values',
    dyn.t('history.aria.reuse', ['2+2', '4']), '2+2 का परिणाम 4 दोबारा इस्तेमाल करें');
  check('a missing value leaves the placeholder visible',
    dyn.t('solver.step.prefix', []), 'चरण {0}: ');
  check('the unit keys interpolate', dyn.t('age.unit.days', [5]), '5 दिन');

  // 13e) every dynamic key resolves in all five languages
  const dynamicKeys = allKeys.filter(isDynamicKey);
  ok('there is a substantial dynamic key set', dynamicKeys.length >= 55, String(dynamicKeys.length));
  createI18n.CODES.forEach(function (code) {
    dynamicKeys.forEach(function (key) {
      ok(code + ' has "' + key + '"',
        typeof createI18n.DICTIONARY[code][key] === 'string' &&
        createI18n.DICTIONARY[code][key].trim().length > 0);
    });
  });
  ['hi', 'te'].forEach(function (code) {
    const same = dynamicKeys.filter(function (key) { return dict2(code)[key] === english[key]; });
    ok(code + ' translates the dynamic keys', same.length < dynamicKeys.length * 0.75,
      same.length + '/' + dynamicKeys.length);
  });
  check('Hindi step prefix uses Devanagari', /[ऀ-ॿ]/.test(dict2('hi')['solver.step.prefix']), true);
  check('Telugu answer prefix uses Telugu script',
    /[ఀ-౿]/.test(dict2('te')['solver.answer.prefix']), true);
  check('Roman Telugu greeting is natural', dict2('te-Latn')['username.greeting'], 'Svagatam, {0}');
  check('Roman Hindi greeting is natural', dict2('hi-Latn')['username.greeting'], 'Svaagat, {0}');

  // 13f) the English dynamic values match the literals the code already used
  [['calc.error.DIVIDE_BY_ZERO', 'Cannot divide by zero'],
    ['calc.error.EMPTY', 'Enter a calculation first'],
    ['solver.title.unsupported', 'Not solvable locally yet'],
    ['solver.title.aiError', 'AI solver unavailable'],
    ['solver.source.ai', 'AI Solver'],
    ['solver.msg.empty', 'Please enter a math question.'],
    ['converter.btn.copied', 'Copied'],
    ['username.greeting', 'Welcome, {0}'],
    ['age.msg.birthdayToday', 'Today is your birthday. Happy birthday to you.']]
    .forEach(function (pair) {
      check('English "' + pair[0] + '" matches the original', english[pair[0]], pair[1]);
    });
  check('the month names match the original array',
    english['age.month.1'] === req2('js/core/age-calculator.js').MONTH_NAMES[0], true);
  check('the converter errors match the original map',
    english['converter.error.binary'] === req2('js/core/number-base.js').ERRORS.binary, true);
  check('the age errors match the original map',
    english['age.error.future'] === req2('js/core/age-calculator.js').ERRORS.future, true);

  // 13g) switching language drives the runtime consumers, with no reload
  dyn.setLanguage('te');
  engine.setTranslator(function (key) { return dyn.t(key); });
  check('the engine error follows the switch',
    engine.describeError(engine.ERROR_CODES.SYNTAX), 'గణన సరైనది కాదు');
  numberBase.setTranslator(function (key, params) { return dyn.t(key, params); });
  check('the base label follows the switch', numberBase.label('octal'), 'అక్టల్');
  ageCalc.setTranslator(function (key, params) { return dyn.t(key, params); });
  check('the month name follows the switch', ageCalc.formatDate(2000, 1, 5), '5 జనవరి 2000');
  dyn.setLanguage('en');
  check('switching back restores the original text',
    engine.describeError(engine.ERROR_CODES.SYNTAX), 'Invalid expression');
  check('and the converter too', numberBase.label('octal'), 'Octal');
  check('and the age calculator too', ageCalc.formatDate(2000, 1, 5), '5 January 2000');
  engine.setTranslator(null);
  numberBase.setTranslator(null);
  ageCalc.setTranslator(null);

  // 13h) app.js wires the translators and passes i18n to the views
  const appSrc = read('js/app.js');
  ok('app.js creates i18n before the views',
    appSrc.indexOf('createI18n') < appSrc.indexOf('createSolverView'));
  ok('the engine translator is registered', appSrc.indexOf('ExpressionEngine.setTranslator') !== -1);
  ok('the converter translator is registered', appSrc.indexOf('NumberBase.setTranslator') !== -1);
  ok('the age translator is registered', appSrc.indexOf('AgeCalculator.setTranslator') !== -1);
  ok('the theme label is translated', appSrc.indexOf('theme.label.light') !== -1);
  ok('the app name is translated', appSrc.indexOf("i18n.t('app.name')") !== -1);
  check('app.js still performs no page reload', /location\.reload/.test(appSrc), false);

  // 13i) with no i18n every consumer keeps its original English literal
  check('solver-view keeps its fallback literals',
    /'Question needed'/.test(read('js/ui/solver-view.js')), true);
  check('username-view keeps "Welcome, "',
    /'Welcome, ' \+ username/.test(read('js/ui/username-view.js')), true);
  check('history-view keeps the confirm sentence',
    /'Clear the whole calculation history\?'/.test(read('js/ui/history-view.js')), true);
  check('converter-view keeps "Copied"', /'Copied'/.test(read('js/ui/number-base-view.js')), true);
  check('age-view keeps the old plural sentence', /' to go\.'/.test(read('js/ui/age-view.js')), true);

  // 13j) no innerHTML / eval introduced by the runtime wiring
  ['js/app.js', 'js/ui/solver-view.js', 'js/ui/history-view.js', 'js/ui/number-base-view.js',
    'js/ui/age-view.js', 'js/ui/username-view.js', 'js/services/username-service.js',
    'js/core/expression-engine.js', 'js/core/number-base.js', 'js/core/age-calculator.js',
    'js/services/i18n.js'].forEach(function (rel) {
    const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(rel + ' has no innerHTML', code.indexOf('innerHTML') === -1);
    ok(rel + ' has no eval/Function', !/\beval\s*\(|new\s+Function/.test(code));
  });

  // ------------------ 14) PHASE 2D: local solver explanation language
  section('14) Phase 2D: the local solver explanation follows the language');
  const mathSolverFactory = req2('js/services/math-solver.js');
  const engine2 = req2('js/core/expression-engine.js');
  const format2 = req2('js/core/format.js');
  const LANG_CODES = ['en', 'hi', 'hi-Latn', 'te', 'te-Latn'];

  // The translator is module scoped (the app has one solver), so the helper
  // always re-registers the language right before it solves. That keeps the
  // test independent of the order the cases happen to run in.
  function solverIn(lang) {
    const service = createI18n(settingsWith());
    if (lang) { service.setLanguage(lang); }
    const solver = mathSolverFactory({
      engine: engine2,
      format: format2,
      getAngleMode: function () { return 'deg'; }
    });
    return {
      i18n: service,
      solve: function (question) {
        service.setLanguage(lang || 'en');
        solver.setTranslator(function (key, params) { return service.t(key, params); });
        return solver.solveMathQuestion(question, question);
      }
    };
  }

  // 14a) every Phase 2D key exists in all five languages
  const p2dKeys = allKeys.filter(function (key) {
    return key.indexOf('solver.section.') === 0 || key.indexOf('solver.bothSides.') === 0 ||
      key.indexOf('solver.linear.') === 0 || key.indexOf('solver.quadratic.') === 0 ||
      key.indexOf('solver.geometry.') === 0 || key.indexOf('solver.percent.') === 0 ||
      key.indexOf('solver.fraction.') === 0 || key.indexOf('solver.change.') === 0 ||
      key.indexOf('solver.trig.') === 0 || key.indexOf('solver.root.') === 0 ||
      key.indexOf('solver.power.') === 0 || key.indexOf('solver.verify.') === 0;
  });
  ok('the Phase 2D key set is substantial', p2dKeys.length >= 40, String(p2dKeys.length));
  LANG_CODES.forEach(function (code) {
    p2dKeys.forEach(function (key) {
      ok(code + ' has "' + key + '"',
        typeof createI18n.DICTIONARY[code][key] === 'string' &&
        createI18n.DICTIONARY[code][key].trim().length > 0);
    });
  });
  // No language may silently fall back to English for the solver prose.
  ['hi', 'te', 'hi-Latn', 'te-Latn'].forEach(function (code) {
    const same = p2dKeys.filter(function (key) { return createI18n.DICTIONARY[code][key] === english[key]; });
    ok(code + ' translates the solver prose', same.length <= 6, same.length + '/' + p2dKeys.length);
  });
  check('Hindi uses Devanagari', /[ऀ-ॿ]/.test(dict2('hi')['solver.bothSides.subtract']), true);
  check('Telugu uses Telugu script', /[ఀ-౿]/.test(dict2('te')['solver.bothSides.subtract']), true);
  check('Roman Hindi is Latin script',
    /^[A-Za-z0-9 ,.%(){}']+$/.test(dict2('hi-Latn')['solver.bothSides.subtract']), true);
  check('Roman Telugu is Latin script',
    /^[A-Za-z0-9 ,.%(){}']+$/.test(dict2('te-Latn')['solver.bothSides.subtract']), true);
  check('Roman Hindi has no Devanagari anywhere',
    p2dKeys.every(function (key) { return !/[ऀ-ॿ]/.test(dict2('hi-Latn')[key]); }), true);
  check('Roman Telugu has no Telugu script anywhere',
    p2dKeys.every(function (key) { return !/[ఀ-౿]/.test(dict2('te-Latn')[key]); }), true);
  check('Hindi keeps no Latin-only words in the core sentences',
    p2dKeys.filter(function (key) {
      return key.indexOf('solver.section.') === 0 && /[A-Za-z]{3}/.test(dict2('hi')[key]);
    }).length <= 2, true);
  check('the Roman variants differ from English',
    dict2('hi-Latn')['solver.bothSides.subtract'] !== english['solver.bothSides.subtract'], true);

  // 14b) THE MATHEMATICS IS IDENTICAL IN EVERY LANGUAGE.
  const QUESTIONS = [
    ['2 + 3 * 4', 'arithmetic'],
    ['25% of 800', 'percentage'],
    ['1/2 + 1/4', 'fraction'],
    ['2x + 5 = 15', 'linear'],
    ['x^2 - 5x + 6 = 0', 'quadratic'],
    ['2^5', 'power'],
    ['sqrt(81)', 'root'],
    ['sin(30)', 'trig'],
    ['area of a rectangle with length 5 and width 4', 'geometry']
  ];
  const enRun = solverIn('en');
  const englishResults = {};
  QUESTIONS.forEach(function (pair) {
    englishResults[pair[1]] = enRun.solve(pair[0]);
  });
  // The fields that are PURELY mathematical and must match byte for byte.
  // (e.given may hold a label, and e.find / e.verification[0] legitimately mix a
  // translated sentence with an embedded expression, so they are checked
  // separately by the math-token test below.)
  const mathsOnly = function (e) {
    return JSON.stringify([e && e.given, e && e.formula, e && e.expression,
      e && e.substitutions, e && e.calculations, e && e.finalAnswer]);
  };
  // Every number, operator and mathematical symbol used anywhere in the whole
  // explanation, as a sorted multiset. A translated sentence may legally place
  // the embedded expression first ("x²-5x+6=0 లో x = 2 పెట్టండి"), so order is not
  // compared, but any lost, altered or invented value would show up here.
  const mathTokens = function (e) {
    const text = JSON.stringify([e.given, e.find, e.formula, e.expression,
      e.substitutions, e.calculations, e.verification, e.finalAnswer,
      (e.steps || []).map(function (s) { return [s.title, s.lines]; })]);
    return (text.match(/[0-9]+(?:[.,][0-9]+)*|√|±|²|³|×|÷|\u2212|≈|=|°|π/g) || [])
      .sort().join(' ');
  };
  LANG_CODES.forEach(function (code) {
    const run = solverIn(code);
    QUESTIONS.forEach(function (pair) {
      const got = run.solve(pair[0]);
      const want = englishResults[pair[1]];
      const label = code + ' / ' + pair[1];
      check(label + ': status matches', got.status, want.status);
      check(label + ': kind matches', got.kind, want.kind);
      check(label + ': the ANSWER is identical', got.answer, want.answer);
      check(label + ': the final answer line is identical',
        got.explanation && got.explanation.finalAnswer, want.explanation && want.explanation.finalAnswer);
      check(label + ': the GIVEN expression is identical',
        got.explanation && got.explanation.given, want.explanation && want.explanation.given);
      check(label + ': the FORMULA is identical',
        got.explanation && got.explanation.formula, want.explanation && want.explanation.formula);
      check(label + ': the substitutions are identical',
        JSON.stringify(got.explanation && got.explanation.substitutions),
        JSON.stringify(want.explanation && want.explanation.substitutions));
      check(label + ': the calculations are identical',
        JSON.stringify(got.explanation && got.explanation.calculations),
        JSON.stringify(want.explanation && want.explanation.calculations));
      check(label + ': every pure-maths field is byte-identical',
        mathsOnly(got.explanation), mathsOnly(want.explanation));
      check(label + ': the numeric/symbol tokens are identical',
        mathTokens(got.explanation), mathTokens(want.explanation));
      check(label + ': the step COUNT is identical',
        (got.explanation && got.explanation.steps || []).length,
        (want.explanation && want.explanation.steps || []).length);
      check(label + ': every step keeps its line count',
        JSON.stringify((got.explanation.steps || []).map(function (s) { return s.lines.length; })),
        JSON.stringify((want.explanation.steps || []).map(function (s) { return s.lines.length; })));
    });
  });

  // 14c) the PROSE is translated, and English is byte-for-byte unchanged
  const enLinear = englishResults.linear.explanation;
  check('English concept is unchanged', enLinear.concept,
    'Linear equation in one variable. Undo the operations around x in ' +
    'reverse order: first remove the constant term, then undo the multiplication.');
  // "2x + 5 = 15" has no x on the right, so the first step removes the constant.
  check('English step 1 title is unchanged', enLinear.steps[0].title, 'Remove the constant term');
  check('English both-sides line is unchanged', enLinear.steps[0].lines[0], 'Subtract 5 from both sides.');
  check('English step 2 title is unchanged', enLinear.steps[1].title, 'Isolate x');
  check('English divide line is unchanged', enLinear.steps[1].lines[0], 'Divide both sides by 2.');
  check('English verification is unchanged', enLinear.verification[0],
    'Substitute x = 5 into the original equation:');
  // A question that really does need the "collect the x terms" step.
  const enBoth = enRun.solve('2x + 5 = x + 15').explanation;
  check('English collect-x title is unchanged', enBoth.steps[0].title, 'Collect the x terms on one side');
  check('English collect-x line is unchanged', enBoth.steps[0].lines[0], 'Subtract x from both sides.');
  LANG_CODES.forEach(function (code) {
    if (code === 'en') { return; }
    const e = solverIn(code).solve('2x + 5 = 15').explanation;
    ok(code + ': the concept is not English', e.concept !== enLinear.concept, e.concept);
    ok(code + ': the step title is not English', e.steps[0].title !== enLinear.steps[0].title, e.steps[0].title);
    ok(code + ': the both-sides sentence is not English',
      e.steps[0].lines[0] !== enLinear.steps[0].lines[0], e.steps[0].lines[0]);
    ok(code + ': the value 5 is still in the sentence', e.steps[0].lines[0].indexOf('5') !== -1,
      e.steps[0].lines[0]);
  });
  check('English geometry find is unchanged', englishResults.geometry.explanation.find, 'Area of the rectangle');
  LANG_CODES.forEach(function (code) {
    if (code === 'en') { return; }
    const e = solverIn(code).solve('area of a rectangle with length 5 and width 4').explanation;
    ok(code + ': the geometry shape name is translated',
      e.find !== englishResults.geometry.explanation.find, e.find);
  });

  // 14d) switching language re-renders the SAME question with the SAME maths
  const hiRun = solverIn('hi');
  const enAgain = solverIn('en');
  const first = enAgain.solve('2x + 5 = 15');
  const firstAnswer = first.answer;
  const firstConcept = first.explanation.concept;
  const second = hiRun.solve('2x + 5 = 15');
  ok('the concept changes with the language', second.explanation.concept !== firstConcept);
  check('the ANSWER does not change at all', second.answer, firstAnswer);
  check('the final answer line does not change',
    second.explanation.finalAnswer, first.explanation.finalAnswer);
  const third = enAgain.solve('2x + 5 = 15');
  check('switching back restores the English explanation', third.explanation.concept, firstConcept);
  check('and still the same answer', third.answer, firstAnswer);
  // And through ONE live service, as the app does it.
  const live = createI18n(settingsWith());
  const liveSolver = mathSolverFactory({ engine: engine2, format: format2 });
  liveSolver.setTranslator(function (key, params) { return live.t(key, params); });
  const liveEn = liveSolver.solveMathQuestion('2x + 5 = 15', '2x + 5 = 15');
  const liveEnConcept = liveEn.explanation.concept;
  live.setLanguage('te');
  const liveTe = liveSolver.solveMathQuestion('2x + 5 = 15', '2x + 5 = 15');
  ok('one live service re-renders in the new language',
    liveTe.explanation.concept !== liveEnConcept, liveTe.explanation.concept);
  check('one live service keeps the same answer', liveTe.answer, liveEn.answer);
  live.setLanguage('en');
  check('one live service restores English',
    liveSolver.solveMathQuestion('2x + 5 = 15', '2x + 5 = 15').explanation.concept, liveEnConcept);
  liveSolver.setTranslator(null);

  // 14e) no translator, and an empty translation, both fall back to English
  const bare = mathSolverFactory({ engine: engine2, format: format2 });
  const bareResult = bare.solveMathQuestion('2x + 5 = 15', '2x + 5 = 15');
  check('with NO translator the text is the original English',
    bareResult.explanation.concept, enLinear.concept);
  check('and the answer is still correct', bareResult.answer, 'x = 5');
  const empty = mathSolverFactory({ engine: engine2, format: format2 });
  empty.setTranslator(function () { return ''; });
  const emptyResult = empty.solveMathQuestion('2x + 5 = 15', '2x + 5 = 15');
  check('an empty translation falls back to English', emptyResult.explanation.concept, enLinear.concept);
  check('and the maths is unaffected', emptyResult.answer, 'x = 5');
  empty.setTranslator(null);
  check('clearing the translator restores English',
    empty.solveMathQuestion('2x + 5 = 15', '2x + 5 = 15').explanation.concept, enLinear.concept);

  // 14f) interpolation in the solver prose
  check('both-sides interpolation works', solverIn('hi').i18n.t('solver.bothSides.divide', [2]),
    'दोनों तरफ 2 से भाग दें।');
  check('a missing param keeps the placeholder visible',
    solverIn('hi').i18n.t('solver.bothSides.divide', []), 'दोनों तरफ {0} से भाग दें।');
  check('the interpolate value reaches the solver, not the template',
    solverIn('hi').solve('2x + 5 = 15').explanation.steps[1].lines[0], 'दोनों तरफ 2 से भाग दें।');
  check('the step prefix still interpolates (Phase 2B intact)',
    solverIn('hi').i18n.t('solver.step.prefix', [2]).indexOf('2') !== -1, true);

  // 14g) nothing unsafe introduced, and the solver contract is unchanged
  ['js/services/math-solver.js', 'js/ui/solver-view.js', 'js/app.js'].forEach(function (rel) {
    const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok(rel + ' has no innerHTML', code.indexOf('innerHTML') === -1);
    ok(rel + ' has no eval/Function', !/\beval\s*\(|new\s+Function/.test(code));
  });
  ok('the solver still returns the stable result shape',
    /STATUS: STATUS/.test(read('js/services/math-solver.js')) &&
    /MESSAGES: MESSAGES/.test(read('js/services/math-solver.js')));
  ok('the solver still exposes SUPPORTED_KINDS',
    /SUPPORTED_KINDS: SUPPORTED_KINDS\.slice\(\)/.test(read('js/services/math-solver.js')));
  ok('app.js registers the math-solver translator',
    /MathSolver\.setTranslator/.test(read('js/app.js')));

  console.log('\n============================================================');
  console.log(passed + ' checks passed, ' + failures.length + ' failed');
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
  }
  console.log('All multilingual tests passed.');
}

main();