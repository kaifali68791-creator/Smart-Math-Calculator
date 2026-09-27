/**
 * Number System Converter tests (Node, no framework):
 *   node tests/number-base.test.js
 * -----------------------------------------------------------------------------
 * 100% offline: the module under test only uses native BigInt radix conversion.
 * No network, no API, no DOM, no eval().
 */
'use strict';
const fs = require('fs');
const path = require('path');

const NumberBase = require(path.join(__dirname, '..', 'js', 'core', 'number-base.js'));

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

function convert(value, from, to) {
  const outcome = NumberBase.convert(value, from, to);
  return outcome.ok ? outcome.result : 'ERROR: ' + outcome.error;
}

section('Required conversions');
check('decimal 10 -> binary', convert('10', 'decimal', 'binary'), '1010');
check('decimal 255 -> hexadecimal (UPPERCASE)', convert('255', 'decimal', 'hexadecimal'), 'FF');
check('binary 1010 -> decimal', convert('1010', 'binary', 'decimal'), '10');
check('binary 11111111 -> hexadecimal', convert('11111111', 'binary', 'hexadecimal'), 'FF');
check('octal 17 -> decimal', convert('17', 'octal', 'decimal'), '15');
check('hexadecimal FF -> decimal', convert('FF', 'hexadecimal', 'decimal'), '255');
check('hexadecimal FF -> binary', convert('FF', 'hexadecimal', 'binary'), '11111111');
check('hexadecimal lowercase ff -> decimal', convert('ff', 'hexadecimal', 'decimal'), '255');
check('hexadecimal 1a -> decimal (letter case)', convert('1a', 'hexadecimal', 'decimal'), '26');

section('Every source system to every other system');
check('decimal -> octal', convert('64', 'decimal', 'octal'), '100');
check('octal -> binary', convert('100', 'octal', 'binary'), '1000000');
check('octal -> hexadecimal', convert('17', 'octal', 'hexadecimal'), 'F');
check('binary -> octal', convert('1010', 'binary', 'octal'), '12');
check('decimal -> decimal (same system)', convert('10', 'decimal', 'decimal'), '10');

section('Edge cases');
check('zero decimal -> binary', convert('0', 'decimal', 'binary'), '0');
check('zero binary -> decimal', convert('0', 'binary', 'decimal'), '0');
check('zero hexadecimal -> binary', convert('0', 'hexadecimal', 'binary'), '0');
check('negative decimal -> binary', convert('-10', 'decimal', 'binary'), '-1010');
check('negative binary -> decimal', convert('-1010', 'binary', 'decimal'), '-10');
check('negative hexadecimal -> decimal', convert('-FF', 'hexadecimal', 'decimal'), '-255');
check('surrounding spaces are ignored', convert('  255  ', 'decimal', 'hexadecimal'), 'FF');
check('explicit plus sign is accepted', convert('+10', 'decimal', 'binary'), '1010');
check('very large value is exact (BigInt)', convert('FFFFFFFFFFFFFFFFFF', 'hexadecimal', 'decimal'),
  '4722366482869645213695');
check('leading zeros are accepted', convert('0011', 'binary', 'decimal'), '3');

section('Friendly validation errors');
check('invalid binary 102 is rejected', NumberBase.convert('102', 'binary', 'decimal').ok, false);
check('  with a beginner-friendly message',
  NumberBase.convert('102', 'binary', 'decimal').error,
  'Invalid binary number. Binary numbers can contain only 0 and 1.');
check('invalid octal 8 is rejected', NumberBase.convert('8', 'octal', 'decimal').ok, false);
check('  octal message', NumberBase.convert('8', 'octal', 'decimal').error,
  'Invalid octal number. Octal numbers can contain only the digits 0 to 7.');
check('invalid decimal 12a is rejected', NumberBase.convert('12a', 'decimal', 'binary').ok, false);
check('  decimal message', NumberBase.convert('12a', 'decimal', 'binary').error,
  'Invalid decimal number. Decimal numbers can contain only the digits 0 to 9.');
check('invalid hexadecimal 12G is rejected', NumberBase.convert('12G', 'hexadecimal', 'decimal').ok, false);
check('  hexadecimal message', NumberBase.convert('12G', 'hexadecimal', 'decimal').error,
  'Invalid hexadecimal number. Hexadecimal numbers can contain 0 to 9 and the letters A to F.');
check('empty input is rejected', NumberBase.convert('', 'decimal', 'binary').error,
  'Please enter a number to convert.');
check('spaces only is rejected', NumberBase.convert('   ', 'decimal', 'binary').error,
  'Please enter a number to convert.');
check('unknown base is rejected', NumberBase.convert('10', 'binary', 'ternary').ok, false);
check('decimal point is not a valid integer', NumberBase.convert('1.5', 'decimal', 'binary').ok, false);
check('parse returns null for invalid input', NumberBase.parse('102', 'binary'), null);
check('parse returns a BigInt for valid input', NumberBase.parse('1010', 'binary'), 10n);
check('validate accepts a valid value', NumberBase.validate('255', 'hexadecimal').ok, true);

section('Helper surface');
check('four supported bases', NumberBase.BASES.join(','), 'decimal,binary,octal,hexadecimal');
check('labels are beginner friendly', NumberBase.label('hexadecimal'), 'Hexadecimal');
check('isValidBase decimal', NumberBase.isValidBase('decimal'), true);
check('isValidBase ternary', NumberBase.isValidBase('ternary'), false);
check('format uses uppercase hex', NumberBase.format(255n, 'hexadecimal'), 'FF');
check('format uses plain binary', NumberBase.format(10n, 'binary'), '1010');

section('Offline / safety scan of the module');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'number-base.js'), 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
ok('no network calls', !/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(code));
ok('no eval or new Function', !/\beval\s*\(|new\s+Function/.test(code));
ok('no key or credential handling', !/API_KEY|Authorization|token/i.test(code));

console.log('\n============================================================');
console.log(passed + ' checks passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('All number system converter tests passed.');
