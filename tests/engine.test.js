/**
 * Smart Math Calculator - unit tests for the core logic and the local services.
 * Runs with Node (no test framework, no dependencies):
 *
 *     node tests/engine.test.js
 *
 * Exits with code 1 when something fails, so it can be used in CI later.
 */
'use strict';

const path = require('path');

const engine = require(path.join(__dirname, '..', 'js', 'core', 'expression-engine.js'));
const format = require(path.join(__dirname, '..', 'js', 'core', 'format.js'));
const createCalculatorModel = require(path.join(__dirname, '..', 'js', 'core', 'calculator-model.js'))
  .createCalculatorModel;
const createStorage = require(path.join(__dirname, '..', 'js', 'services', 'storage.js'));
const createHistoryStore = require(path.join(__dirname, '..', 'js', 'services', 'history-store.js'));
const createSettingsStore = require(path.join(__dirname, '..', 'js', 'services', 'settings-store.js'));

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (Object.is(actual, expected)) {
    passed += 1;
  } else {
    failures.push(name + ' -> expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function checkClose(name, actual, expected) {
  if (typeof actual === 'number' && Math.abs(actual - expected) < 1e-9) {
    passed += 1;
  } else {
    failures.push(name + ' -> expected ' + expected + ' (+-1e-9), got ' + actual);
  }
}

function checkTruthy(name, actual) {
  if (actual) {
    passed += 1;
  } else {
    failures.push(name + ' -> expected a truthy value, got ' + JSON.stringify(actual));
  }
}

function section(title) {
  console.log('\n' + title);
}

function calculate(source) {
  return engine.calculate(source, { silentIncomplete: false });
}

/** Small in-memory storage double used by the store tests. */
function createMemoryStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    get: function (key, fallback) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
    },
    set: function (key, value) {
      data[key] = value;
      return true;
    },
    remove: function (key) {
      delete data[key];
    },
    isPersistent: true,
    raw: data
  };
}

// ---------------------------------------------------------------------------
section('Engine - basic arithmetic');
check('2 + 3', engine.evaluate('2 + 3'), 5);
check('10 x 5', engine.evaluate('10 \u00D7 5'), 50);
check('100 / 4', engine.evaluate('100 \u00F7 4'), 25);
check('25 - 7', engine.evaluate('25 - 7'), 18);
check('2.5 x 4', engine.evaluate('2.5 \u00D7 4'), 10);
check('0.5 + 0.25', engine.evaluate('0.5 + 0.25'), 0.75);
check('.5 x 4', engine.evaluate('.5 \u00D7 4'), 2);
check('negative result', engine.evaluate('5 - 12'), -7);
check('unary minus', engine.evaluate('-5 + 10'), 5);
check('multiply by negative', engine.evaluate('5 \u00D7 -3'), -15);
check('negative decimal', engine.evaluate('-2.5 + 0.5'), -2);
check('trailing decimal point', engine.evaluate('2 + 5.'), 7);
check('scientific literal', engine.evaluate('1e3 + 1'), 1001);
check('999 x 999', engine.evaluate('999 \u00D7 999'), 998001);

// ---------------------------------------------------------------------------
section('Engine - precedence, brackets and implicit multiplication');
check('2 + 3 x 4', engine.evaluate('2 + 3 \u00D7 4'), 14);
check('(2 + 3) x 4', engine.evaluate('(2 + 3) \u00D7 4'), 20);
check('(2 + 3)4 implicit', engine.evaluate('(2 + 3)4'), 20);
check('8 / (2 + 2)', engine.evaluate('8 \u00F7 (2 + 2)'), 2);
check('((1 + 2)) x 3', engine.evaluate('((1 + 2)) \u00D7 3'), 9);
check('1 + 2 x (3 + 4)', engine.evaluate('1 + 2 \u00D7 (3 + 4)'), 15);
check('2(3 + 4)', engine.evaluate('2(3 + 4)'), 14);
check('(1+1)(2+2)', engine.evaluate('(1+1)(2+2)'), 8);
check('division chain', engine.evaluate('1000 \u00F7 4 \u00F7 5'), 50);

// ---------------------------------------------------------------------------
section('Engine - percentage');
check('50%', engine.evaluate('50%'), 0.5);
check('5%%', engine.evaluate('5%%'), 0.0005);
check('10% of 500', engine.evaluate('10% of 500'), 50);
check('25% of 200', engine.evaluate('25% of 200'), 50);
check('500 + 10%', engine.evaluate('500 + 10%'), 550);
check('500 - 10%', engine.evaluate('500 - 10%'), 450);
check('200 / 10%', engine.evaluate('200 \u00F7 10%'), 2000);
check('8 x 25%', engine.evaluate('8 \u00D7 25%'), 2);
check('100 - 25% - 10%', engine.evaluate('100 - 25% - 10%'), 67.5);
check('(10%) of 500', engine.evaluate('(10%) of 500'), 50);

// ---------------------------------------------------------------------------
section('Engine - error handling');
check('divide by zero code', calculate('5 \u00F7 0').code, engine.ERROR_CODES.DIVIDE_BY_ZERO);
check('divide by zero message', calculate('5 \u00F7 0').message, 'Cannot divide by zero');
check('zero by zero', calculate('0 \u00F7 0').code, engine.ERROR_CODES.DIVIDE_BY_ZERO);
check('empty expression', calculate('').code, engine.ERROR_CODES.EMPTY);
check('trailing operator', calculate('2 +').code, engine.ERROR_CODES.INCOMPLETE);
check('unclosed bracket', calculate('(2 + 3').code, engine.ERROR_CODES.INCOMPLETE);
check('bare close bracket', calculate(')').code, engine.ERROR_CODES.SYNTAX);
check('double operator', calculate('2 \u00D7 \u00D7 3').code, engine.ERROR_CODES.SYNTAX);
check('unknown word', calculate('2 hello 3').code, engine.ERROR_CODES.SYNTAX);
check('overflow literal', calculate('1e309').code, engine.ERROR_CODES.OVERFLOW);
check('overflow result', calculate('9e307 \u00D7 9e307').code, engine.ERROR_CODES.OVERFLOW);
check('too long expression', calculate('1+'.repeat(400) + '1').code, engine.ERROR_CODES.TOO_COMPLEX);
check('deep nesting', engine.calculate('('.repeat(140) + '1' + ')'.repeat(140)).code, engine.ERROR_CODES.TOO_COMPLEX);
check('no eval on unexpected input', engine.calculate('2; window.hack = 1').ok, false);
check('incomplete is silent for the UI', engine.calculate('2 +').incomplete, true);
check('error result is never ok', engine.calculate('5 \u00F7 0').ok, false);
checkTruthy('every error has a message', engine.describeError(engine.ERROR_CODES.TOO_COMPLEX).length > 0);

// ---------------------------------------------------------------------------
section('Format');
check('float noise removed', format.formatNumber(0.1 + 0.2), '0.3');
check('12 significant digits', format.formatNumber(1 / 3), '0.333333333333');
check('thousands grouping', format.formatNumber(1000000), '1,000,000');
check('grouping with decimals', format.formatNumber(1234567.5), '1,234,567.5');
check('negative grouping', format.formatNumber(-12345.25), '-12,345.25');
check('small value', format.formatNumber(1e-7), '0.0000001');
check('very small value', format.formatNumber(1e-12), '1e-12');
check('very large value', format.formatNumber(1e21), '1e+21');
check('zero', format.formatNumber(0), '0');
check('expression literal is plain', format.toExpressionLiteral(1234567.5), '1234567.5');
checkClose('roundValue', format.roundValue(0.30000000000000004), 0.3);
checkTruthy('timestamp formatting', format.formatTimestamp(Date.now()).length > 0);

// ---------------------------------------------------------------------------
section('Calculator model - key sequences');

function createModel(history) {
  return createCalculatorModel({ engine: engine, format: format, history: history || null });
}

function pressMany(model, sequence) {
  sequence.forEach(function (step) {
    model.press(step[0], step[1]);
  });
  return model.getSnapshot();
}

function snapshotAfter(sequence) {
  return pressMany(createModel(), sequence);
}

check('2 + 3 preview', snapshotAfter([['digit', '2'], ['operator', '+'], ['digit', '3']]).secondaryText, '= 5');
check(
  '2 + 3 = result',
  snapshotAfter([['digit', '2'], ['operator', '+'], ['digit', '3'], ['equals']]).primaryText,
  '5'
);
check(
  '10 x 5 = 50',
  snapshotAfter([['digit', '1'], ['digit', '0'], ['operator', '\u00D7'], ['digit', '5'], ['equals']]).primaryText,
  '50'
);
check(
  '100 / 4 = 25',
  snapshotAfter([
    ['digit', '1'], ['digit', '0'], ['digit', '0'], ['operator', '\u00F7'], ['digit', '4'], ['equals']
  ]).primaryText,
  '25'
);
check(
  '25 - 7 = 18',
  snapshotAfter([['digit', '2'], ['digit', '5'], ['operator', '\u2212'], ['digit', '7'], ['equals']]).primaryText,
  '18'
);
check(
  '2.5 x 4 = 10',
  snapshotAfter([
    ['digit', '2'], ['decimal'], ['digit', '5'], ['operator', '\u00D7'], ['digit', '4'], ['equals']
  ]).primaryText,
  '10'
);
check(
  'percent of: 10% of 500',
  snapshotAfter([
    ['digit', '1'], ['digit', '0'], ['percent'], ['of'],
    ['digit', '5'], ['digit', '0'], ['digit', '0'], ['equals']
  ]).primaryText,
  '50'
);
check(
  'percent add: 500 + 10%',
  snapshotAfter([
    ['digit', '5'], ['digit', '0'], ['digit', '0'], ['operator', '+'],
    ['digit', '1'], ['digit', '0'], ['percent'], ['equals']
  ]).primaryText,
  '550'
);
check(
  'brackets: 2 x (3 + 4 then =',
  snapshotAfter([
    ['digit', '2'], ['operator', '\u00D7'], ['open-bracket'],
    ['digit', '3'], ['operator', '+'], ['digit', '4'], ['equals']
  ]).primaryText,
  '14'
);
check('clear resets the display', snapshotAfter([['digit', '9'], ['clear']]).primaryText, '0');
check('backspace removes a digit', snapshotAfter([['digit', '1'], ['digit', '2'], ['backspace']]).primaryText, '1');
check('backspace after a result clears it', snapshotAfter([['digit', '7'], ['equals'], ['backspace']]).primaryText, '0');
check(
  'division by zero becomes an error state',
  snapshotAfter([['digit', '5'], ['operator', '\u00F7'], ['digit', '0'], ['equals']]).primaryKind,
  'error'
);
check(
  'a digit after an error starts a new calculation',
  snapshotAfter([['digit', '5'], ['operator', '\u00F7'], ['digit', '0'], ['equals'], ['digit', '7']]).primaryText,
  '7'
);
check(
  'an operator continues from the result',
  snapshotAfter([
    ['digit', '2'], ['digit', '5'], ['operator', '\u00D7'], ['digit', '4'], ['equals'],
    ['operator', '+'], ['digit', '1'], ['digit', '0'], ['equals']
  ]).primaryText,
  '110'
);
check(
  'a trailing operator is replaced, not doubled',
  snapshotAfter([['digit', '5'], ['operator', '+'], ['operator', '\u00D7'], ['digit', '2'], ['equals']]).primaryText,
  '10'
);
check('leading zeros collapse', snapshotAfter([['digit', '0'], ['digit', '0'], ['digit', '7']]).primaryText, '7');
check(
  'only one decimal point per number',
  snapshotAfter([['digit', '3'], ['decimal'], ['decimal'], ['digit', '5']]).primaryText,
  '3.5'
);
check('decimal on an empty display', snapshotAfter([['decimal'], ['digit', '5']]).primaryText, '0.5');
check(
  'closing bracket only when a bracket is open',
  snapshotAfter([['close-bracket'], ['digit', '4']]).primaryText,
  '4'
);
check('equals with no input keeps 0', snapshotAfter([['equals']]).primaryText, '0');
check(
  'result line keeps the expression',
  snapshotAfter([['digit', '5'], ['digit', '0'], ['operator', '+'], ['digit', '2'], ['digit', '0'], ['equals']])
    .secondaryText,
  '50 + 20 ='
);

// ---------------------------------------------------------------------------
section('Calculator model - history integration');
(function testHistoryIntegration() {
  const storage = createMemoryStorage();
  const history = createHistoryStore(storage, { maxEntries: 5 });
  const model = createModel(history);

  pressMany(model, [['digit', '2'], ['digit', '5'], ['operator', '\u00D7'], ['digit', '4'], ['equals']]);
  pressMany(model, [['digit', '5'], ['digit', '0'], ['operator', '+'], ['digit', '2'], ['digit', '0'], ['equals']]);

  check('two entries stored', history.count(), 2);
  check('newest entry first', history.list()[0].expression, '50 + 20');
  check('entry result', history.list()[0].result, 70);
  check('entry result text', history.list()[0].resultText, '70');
  check('older entry kept', history.list()[1].expression, '25 \u00D7 4');
  checkTruthy('entry id', typeof history.list()[0].id === 'string' && history.list()[0].id.length > 2);
  checkTruthy('entry timestamp', history.list()[0].timestamp > 0);

  model.loadHistoryEntry(history.list()[1]);
  check('reused entry shows its result', model.getSnapshot().primaryText, '100');
  model.press('operator', '+');
  model.press('digit', '5');
  model.press('equals');
  check('continues from a reused entry', model.getSnapshot().primaryText, '105');

  model.press('equals');
  check('repeated equals does not duplicate history', history.count(), 3);

  history.remove(history.list()[2].id);
  check('single entry removed', history.count(), 2);
  history.clear();
  check('history cleared', history.count(), 0);
})();

(function testHistoryLimitAndValidity() {
  const storage = createMemoryStorage();
  const history = createHistoryStore(storage, { maxEntries: 3 });
  for (let i = 1; i <= 5; i += 1) {
    history.add({ expression: i + ' + 0', result: i });
  }
  check('history is capped', history.count(), 3);
  check('newest kept', history.list()[0].expression, '5 + 0');
  history.add({ expression: 'bad', result: Number.NaN });
  history.add({ expression: '', result: 4 });
  check('invalid entries ignored', history.count(), 3);
})();

// ---------------------------------------------------------------------------
section('Storage service');
(function testStorageFallback() {
  const storage = createStorage({});
  check('memory fallback is not persistent', storage.isPersistent, false);
  storage.set('demo', { a: 1 });
  check('memory fallback round trip', storage.get('demo', null).a, 1);
  check('missing key returns fallback', storage.get('nope', 'fallback'), 'fallback');
  storage.remove('demo');
  check('removed key returns fallback', storage.get('demo', 'gone'), 'gone');
})();

(function testStorageLocalStorage() {
  const store = {};
  const fakeLocalStorage = {
    length: 0,
    key: function (index) {
      return Object.keys(store)[index] || null;
    },
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem: function (key, value) {
      store[key] = String(value);
      this.length = Object.keys(store).length;
    },
    removeItem: function (key) {
      delete store[key];
      this.length = Object.keys(store).length;
    }
  };
  const scope = { localStorage: fakeLocalStorage };
  const storage = createStorage(scope);

  check('localStorage detected', storage.isPersistent, true);
  storage.set('values', [1, 2, 3]);
  check('namespaced key', Object.keys(store)[0], 'smc:values');

  // a second instance (simulating a page reload) reads the same data
  const reopened = createStorage(scope);
  check('survives a reload', reopened.get('values', []).length, 3);

  fakeLocalStorage.setItem('smc:broken', '{not json');
  check('broken json falls back', reopened.get('broken', 'safe'), 'safe');

  reopened.clearAll();
  check('clearAll removes app keys only', Object.keys(store).length, 0);
})();

(function testBrokenLocalStorage() {
  const scope = {
    localStorage: {
      getItem: function () {
        throw new Error('blocked');
      },
      setItem: function () {
        throw new Error('blocked');
      },
      removeItem: function () {
        throw new Error('blocked');
      }
    }
  };
  const storage = createStorage(scope);
  check('blocked localStorage falls back', storage.isPersistent, false);
  check('can still write in memory', storage.set('x', 1), true);
  check('can still read in memory', storage.get('x', 0), 1);
})();

// ---------------------------------------------------------------------------
section('Settings store');
(function testSettings() {
  const storage = createMemoryStorage();
  const settings = createSettingsStore(storage, { defaults: { theme: 'system' } });
  check('default value', settings.get('theme'), 'system');
  check('missing key fallback', settings.get('language', 'en'), 'en');
  settings.set('theme', 'dark');
  check('value written', settings.get('theme'), 'dark');

  const reopened = createSettingsStore(storage, { defaults: { theme: 'system' } });
  check('settings survive a reload', reopened.get('theme'), 'dark');

  reopened.set('language', 'hi');
  check('future keys supported', reopened.get('language'), 'hi');
  reopened.reset();
  check('reset restores defaults', reopened.get('theme'), 'system');
  check('reset clears unknown keys', reopened.get('language'), undefined);
  check('all() returns a copy', Object.keys(reopened.all()).length, 1);
})();

// ---------------------------------------------------------------------------
section('Part 2 engine - scientific functions (DEG is the default)');

function calc(source, options) {
  return engine.calculate(source, Object.assign({ silentIncomplete: false }, options || {}));
}

function valueOf(source, options) {
  return calc(source, options).value;
}

checkClose('sin(30) in DEG', valueOf('sin(30)'), 0.5);
check('sin(30) displays as 0.5', format.formatNumber(valueOf('sin(30)')), '0.5');
checkClose('cos(60) in DEG', valueOf('cos(60)'), 0.5);
check('cos(60) displays as 0.5', format.formatNumber(valueOf('cos(60)')), '0.5');
checkClose('tan(45) in DEG', valueOf('tan(45)'), 1);
check('tan(45) displays as 1', format.formatNumber(valueOf('tan(45)')), '1');
checkClose('sin(90) in DEG', valueOf('sin(90)'), 1);
checkClose('cos(0) in DEG', valueOf('cos(0)'), 1);
checkClose('sin(0)', valueOf('sin(0)'), 0);
checkClose('asin(0.5) in DEG', valueOf('asin(0.5)'), 30);
checkClose('acos(0.5) in DEG', valueOf('acos(0.5)'), 60);
checkClose('atan(1) in DEG', valueOf('atan(1)'), 45);
checkClose('sinh(1)', valueOf('sinh(1)'), Math.sinh(1));
checkClose('cosh(1)', valueOf('cosh(1)'), Math.cosh(1));
checkClose('tanh(1)', valueOf('tanh(1)'), Math.tanh(1));
checkClose('sqrt(25)', valueOf('sqrt(25)'), 5);
checkClose('√(25) symbol', valueOf('\u221A(25)'), 5);
checkClose('√25 without brackets', valueOf('\u221A25'), 5);
checkClose('cbrt(27)', valueOf('cbrt(27)'), 3);
checkClose('∛27 symbol', valueOf('\u221B27'), 3);
checkClose('cbrt of a negative number', valueOf('cbrt(-8)'), -2);
checkClose('log(100)', valueOf('log(100)'), 2);
checkClose('log(1000)', valueOf('log(1000)'), 3);
checkClose('ln(e)', valueOf('ln(e)'), 1);
checkClose('ln(1)', valueOf('ln(1)'), 0);
checkClose('abs(-7)', valueOf('abs(-7)'), 7);
checkClose('abs(3 - 10)', valueOf('abs(3 - 10)'), 7);
checkClose('sqrt(16) + 5', valueOf('sqrt(16) + 5'), 9);
checkClose('2 × sqrt(9)', valueOf('2 \u00D7 sqrt(9)'), 6);

section('Part 2 engine - RAD mode');
checkClose('sin(π/2) in RAD', valueOf('sin(\u03C0 \u00F7 2)', { angleMode: 'rad' }), 1);
checkClose('cos(π) in RAD', valueOf('cos(\u03C0)', { angleMode: 'rad' }), -1);
checkClose('tan(π/4) in RAD', valueOf('tan(\u03C0 \u00F7 4)', { angleMode: 'rad' }), 1);
checkClose('asin(1) in RAD', valueOf('asin(1)', { angleMode: 'rad' }), Math.PI / 2);
checkClose('atan(1) in RAD', valueOf('atan(1)', { angleMode: 'rad' }), Math.PI / 4);
check('sin(1) differs between DEG and RAD', valueOf('sin(1)') !== valueOf('sin(1)', { angleMode: 'rad' }), true);
check('unknown angle mode falls back to DEG', engine.normalizeAngleMode('nonsense'), 'deg');
check('angle mode is normalised', engine.normalizeAngleMode('rad'), 'rad');

section('Part 2 engine - power, factorial, constants, modulo');
checkClose('2^5', valueOf('2^5'), 32);
checkClose('3^3', valueOf('3^3'), 27);
checkClose('2^3^2 is right associative', valueOf('2^3^2'), 512);
checkClose('2^-3', valueOf('2^-3'), 0.125);
checkClose('-2^2 negates the power', valueOf('-2^2'), -4);
checkClose('(-2)^2', valueOf('(-2)^2'), 4);
checkClose('2^0.5', valueOf('2^0.5'), Math.SQRT2);
checkClose('9^(1 ÷ 2)', valueOf('9^(1 \u00F7 2)'), 3);
checkClose('0!', valueOf('0!'), 1);
checkClose('1!', valueOf('1!'), 1);
checkClose('5!', valueOf('5!'), 120);
checkClose('10!', valueOf('10!'), 3628800);
checkClose('5! + 1', valueOf('5! + 1'), 121);
checkClose('3! × 2', valueOf('3! \u00D7 2'), 12);
checkClose('(√25)! applies to the root result', valueOf('\u221A25!'), 120);
checkClose('2^5!', valueOf('2^5!'), Math.pow(2, 120));
checkTruthy('170! is finite but huge', Number.isFinite(valueOf('170!')) && valueOf('170!') > 1e306);
checkClose('π', valueOf('\u03C0'), Math.PI);
checkClose('pi word', valueOf('pi'), Math.PI);
checkClose('e', valueOf('e'), Math.E);
checkClose('π × 2', valueOf('\u03C0 \u00D7 2'), Math.PI * 2);
check('π × 2 display', format.formatNumber(valueOf('\u03C0 \u00D7 2')), '6.28318530718');
checkClose('2π implicit multiplication', valueOf('2\u03C0'), Math.PI * 2);
checkClose('2sin(30) implicit multiplication', valueOf('2sin(30)'), 1);
checkClose('10 mod 3', valueOf('10 mod 3'), 1);
checkClose('17 mod 5', valueOf('17 mod 5'), 2);
checkClose('× before mod', valueOf('2 \u00D7 5 mod 3'), 1);
checkClose('scientific notation input', valueOf('1e3 + 1'), 1001);
checkClose('EXP style input', valueOf('2 \u00D7 10^5'), 200000);

section('Part 2 engine - scientific error handling');
check('sqrt(-1)', calc('sqrt(-1)').code, engine.ERROR_CODES.DOMAIN);
check('sqrt(-1) message', calc('sqrt(-1)').message, 'Invalid function input');
check('asin(2)', calc('asin(2)').code, engine.ERROR_CODES.DOMAIN);
check('acos(-3)', calc('acos(-3)').code, engine.ERROR_CODES.DOMAIN);
check('log(0)', calc('log(0)').code, engine.ERROR_CODES.DOMAIN);
check('log(-5)', calc('log(-5)').code, engine.ERROR_CODES.DOMAIN);
check('ln(0)', calc('ln(0)').code, engine.ERROR_CODES.DOMAIN);
check('tan(90) in DEG is undefined', calc('tan(90)').code, engine.ERROR_CODES.DOMAIN);
check('tan(90) in RAD is defined', calc('tan(90)', { angleMode: 'rad' }).ok, true);
check('(-8)^0.5 has no real result', calc('(-8)^0.5').code, engine.ERROR_CODES.DOMAIN);
check('0^-1', calc('0^-1').code, engine.ERROR_CODES.DIVIDE_BY_ZERO);
check('10 mod 0', calc('10 mod 0').code, engine.ERROR_CODES.DIVIDE_BY_ZERO);
check('(-2)!', calc('(-2)!').code, engine.ERROR_CODES.FACTORIAL);
check('5.5!', calc('5.5!').code, engine.ERROR_CODES.FACTORIAL);
check('(-2)! message', calc('(-2)!').message, 'Invalid factorial');
check('171! is too large', calc('171!').code, engine.ERROR_CODES.OVERFLOW);
check('1000! is too large', calc('1000!').code, engine.ERROR_CODES.OVERFLOW);
check('9^9999 is too large', calc('9^9999').code, engine.ERROR_CODES.OVERFLOW);
check('factorial of a huge value never crashes', calc('9999999999!').code, engine.ERROR_CODES.OVERFLOW);
check('5!! stays finite', Number.isFinite(calc('5!!').value), true);
check('170!! overflows safely', calc('170!!').code, engine.ERROR_CODES.OVERFLOW);
check('sin( has no closing bracket', calc('sin(').code, engine.ERROR_CODES.INCOMPLETE);
check('sin alone is incomplete', calc('sin').code, engine.ERROR_CODES.INCOMPLETE);
check('sinn(5) is unknown', calc('sinn(5)').code, engine.ERROR_CODES.SYNTAX);
check('sqrt without argument', calc('sqrt').code, engine.ERROR_CODES.INCOMPLETE);
check('unknown function in a longer expression', calc('1 + foo(2)').code, engine.ERROR_CODES.SYNTAX);
checkTruthy('engine lists the functions', engine.FUNCTION_NAMES.indexOf('sin') !== -1);
checkTruthy('engine lists atan', engine.FUNCTION_NAMES.indexOf('atan') !== -1);
checkTruthy('engine lists the constants', engine.CONSTANT_NAMES.indexOf('\u03C0') !== -1);
check('engine factorial limit', engine.MAX_FACTORIAL, 170);
check('engine angle modes', engine.ANGLE_MODES.RAD, 'rad');

section('Part 2 calculator model - scientific input');
(function testScientificModel() {
  let angleMode = 'deg';
  const storage = createMemoryStorage();
  const history = createHistoryStore(storage, { maxEntries: 20 });
  const model = createCalculatorModel({
    engine: engine,
    format: format,
    history: history,
    getAngleMode: function () {
      return angleMode;
    }
  });
  const snap = function () {
    return model.getSnapshot();
  };
  const type = function (sequence) {
    sequence.forEach(function (step) {
      model.press(step[0], step[1]);
    });
    return snap();
  };

  // function insertion: √ then 25 then =
  type([['function', '\u221A(']]);
  check('√ key opens a bracket', snap().primaryText, '\u221A(');
  type([['digit', '2'], ['digit', '5']]);
  check('√(25 stays editable', snap().primaryText, '\u221A(25');
  model.press('equals');
  check('√(25) = 5', snap().primaryText, '5');
  check('closing brackets were added for the function', snap().expression, '\u221A(25)');
  check('history stores √(25)', history.list()[0].expression, '\u221A(25)');

  // sin(30) in DEG
  model.press('clear');
  type([['function', 'sin('], ['digit', '3'], ['digit', '0'], ['close-bracket']]);
  check('sin(30) preview in DEG', snap().secondaryText, '= 0.5');
  model.press('equals');
  check('sin(30) = 0.5', snap().primaryText, '0.5');
  check('history entry keeps the angle mode', history.list()[0].angleMode, 'deg');

  // a lone value is wrapped by a function key
  model.press('clear');
  type([['digit', '2'], ['digit', '5'], ['function', '\u221A(']]);
  check('25 + √ wraps into √(25)', snap().primaryText, '\u221A(25)');
  check('wrapped value previews instantly', snap().secondaryText, '= 5');

  // postfix keys
  model.press('clear');
  type([['digit', '5'], ['postfix', '!']]);
  check('x! appends the factorial', snap().primaryText, '5!');
  model.press('equals');
  check('5! = 120', snap().primaryText, '120');

  model.press('clear');
  type([['digit', '2'], ['digit', '5'], ['postfix', '^2'], ['equals']]);
  check('25^2 = 625', snap().primaryText, '625');

  model.press('clear');
  type([['digit', '2'], ['digit', '5'], ['postfix', '^(\u22121)'], ['equals']]);
  check('1/x on 25 shows 0.04', snap().primaryText, '0.04');

  // power and modulo operators
  model.press('clear');
  type([['digit', '2'], ['operator', '^'], ['digit', '5'], ['equals']]);
  check('2^5 = 32', snap().primaryText, '32');

  model.press('clear');
  type([['digit', '1'], ['digit', '0'], ['operator', 'mod'], ['digit', '3'], ['equals']]);
  check('10 mod 3 = 1', snap().primaryText, '1');

  // constants
  model.press('clear');
  type([['constant', '\u03C0'], ['operator', '\u00D7'], ['digit', '2'], ['equals']]);
  check('π × 2 display', snap().primaryText, '6.28318530718');

  model.press('clear');
  type([['digit', '2'], ['constant', 'e'], ['equals']]);
  check('2 × e = 5.436563656918', snap().primaryText, '5.43656365692');

  // EXP (scientific notation)
  model.press('clear');
  type([['digit', '2'], ['scientific'], ['digit', '5'], ['equals']]);
  check('2 EXP 5 = 200,000', snap().primaryText, '200,000');

  // sign change
  model.press('clear');
  type([['digit', '2'], ['digit', '5'], ['sign']]);
  check('sign change makes −25', snap().primaryText, '\u221225');
  model.press('equals');
  check('−25 evaluates', snap().primaryText, '-25');

  model.press('clear');
  type([['digit', '2'], ['digit', '5'], ['operator', '\u00D7'], ['digit', '4'], ['sign']]);
  check('sign inside a product', snap().primaryText, '25 \u00D7 \u22124');
  model.press('sign');
  check('sign toggles back', snap().primaryText, '25 \u00D7 4');

  model.press('clear');
  type([['digit', '2'], ['digit', '5'], ['operator', '\u2212'], ['digit', '7'], ['sign']]);
  check('sign after subtraction', snap().primaryText, '25 \u2212 \u22127');
  model.press('equals');
  check('25 − (−7) = 32', snap().primaryText, '32');

  // backspace interacts with the new operators
  model.press('clear');
  type([['digit', '2'], ['operator', '^'], ['digit', '5'], ['backspace']]);
  check('backspace keeps the power operator', snap().primaryText, '2^');
  model.press('clear');
  type([['digit', '1'], ['digit', '0'], ['operator', 'mod'], ['digit', '3'], ['backspace']]);
  check('backspace keeps the mod operator', snap().primaryText, '10 mod ');

  // RAD mode + refresh
  model.press('clear');
  type([['function', 'sin('], ['digit', '3'], ['digit', '0']]);
  check('sin(30 preview in DEG', snap().secondaryText, '= 0.5');
  angleMode = 'rad';
  model.refresh();
  check('refresh recomputes the preview in RAD', snap().secondaryText, '= -0.988031624093');
  model.press('clear');
  type([
    ['function', 'sin('], ['constant', '\u03C0'], ['operator', '\u00F7'], ['digit', '2'], ['close-bracket']
  ]);
  check('sin(π ÷ 2) is shown while typing', snap().primaryText, 'sin(\u03C0 \u00F7 2)');
  // "=" auto-closes the bracket: sin(π ÷ 2)
  model.press('equals');
  check('sin(π ÷ 2) in RAD = 1', snap().primaryText, '1');

  // postfix / functions are rejected when there is nothing to work with
  model.press('clear');
  model.press('postfix', '!');
  check('x! on an empty display is ignored', snap().primaryText, '0');
  model.press('function', 'sin(');
  check('function key still works after a rejected postfix', snap().primaryText, 'sin(');
})();

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(60));
console.log(passed + ' checks passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(function (failure) {
    console.log('  - ' + failure);
  });
  process.exit(1);
}
console.log('All core, service and model tests passed.');

