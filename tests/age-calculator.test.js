/**
 * Age / DOB Calculator tests (Node, no framework):
 *   node tests/age-calculator.test.js
 * -----------------------------------------------------------------------------
 * 100% offline and deterministic: every case injects a fixed "now" so the
 * calendar maths (leap years, month lengths, month/year boundaries) is exact.
 * The module never stores or sends the date of birth.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const Age = require(path.join(__dirname, '..', 'js', 'core', 'age-calculator.js'));

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

/** "22y 6m 11d" for compact, readable assertions. */
function ageOf(dob, now) {
  const outcome = Age.calculate(dob, now);
  if (!outcome.ok) { return 'ERROR: ' + outcome.error; }
  return outcome.age.years + 'y ' + outcome.age.months + 'm ' + outcome.age.days + 'd';
}

const NOW = new Date(2026, 8, 26);          // 26 September 2026
const NOW_TEXT = '26 September 2026';

section('Normal birthday');
check('a normal birthday (15 March 2004)', ageOf('2004-03-15', NOW), '22y 6m 11d');
check('the same DOB as an object works too',
  ageOf({ year: 2004, month: 3, day: 15 }, NOW), '22y 6m 11d');

section("Today's date as the date of birth");
const today = Age.calculate('2026-09-26', NOW);
check('today is accepted', today.ok, true);
check('age is zero', ageOf('2026-09-26', NOW), '0y 0m 0d');
check('next birthday is today', today.nextBirthday.isToday, true);
check('0 days remaining', today.nextBirthday.daysRemaining, 0);
check('next birthday text', today.nextBirthday.text, NOW_TEXT);
check('turning 0 years', today.nextBirthday.years, 0);
check('total days lived is 0 (born at local midnight)', today.totals.days, 0);

section('Future date of birth is rejected');
const future = Age.calculate('2027-01-01', NOW);
check('a future DOB is rejected', future.ok, false);
check('with a friendly message', future.error,
  'The date of birth cannot be in the future. Please enter today or an earlier date.');
check('tomorrow is rejected', Age.calculate('2026-09-27', NOW).ok, false);
check('a DOB later today is still accepted (date only)', Age.calculate('2026-09-26', NOW).ok, true);

section('Leap day birthday (29 February)');
check('29 Feb 2004 in September 2026', ageOf('2004-02-29', NOW), '22y 6m 28d');
check('29 Feb 2004 on 28 Feb 2024', ageOf('2004-02-29', new Date(2024, 1, 28)), '19y 11m 30d');
const leapNext = Age.calculate('2004-02-29', new Date(2025, 2, 1));
check('a passed 28 Feb moves to the next NON-leap year',
  leapNext.nextBirthday.date, '2026-02-28');
check('and it reads "28 February 2026"', leapNext.nextBirthday.text, '28 February 2026');
check('29 Feb 2004 in 2026 (non-leap) is 28 February',
  Age.calculate('2004-02-29', new Date(2026, 0, 15)).nextBirthday.date, '2026-02-28');
const leapToday = Age.calculate('2004-02-29', new Date(2028, 1, 29));
check('in a leap year it is 29 February', leapToday.nextBirthday.date, '2028-02-29');
check('and it is today', leapToday.nextBirthday.isToday, true);
check('leap year rules: 2024', Age.isLeapYear(2024), true);
check('leap year rules: 2023', Age.isLeapYear(2023), false);
check('leap year rules: 1900 (century)', Age.isLeapYear(1900), false);
check('leap year rules: 2000 (400s)', Age.isLeapYear(2000), true);
check('February 2024 has 29 days', Age.daysInMonth(2024, 2), 29);
check('February 2023 has 28 days', Age.daysInMonth(2023, 2), 28);

section('Month boundary crossing');
check('31 Jan 2000 in September 2026', ageOf('2000-01-31', NOW), '26y 7m 26d');
check('30 Apr in May keeps the real month length', ageOf('2024-04-30', new Date(2024, 4, 1)), '0y 0m 1d');
check('a month is never treated as 30 days', ageOf('2024-02-15', new Date(2024, 3, 15)), '0y 2m 0d');

section('Year boundary crossing');
check('31 Dec 2005 on 1 Jan 2026', ageOf('2005-12-31', new Date(2026, 0, 1)), '20y 0m 1d');
check('1 Jan 2006 on 31 Dec 2026', ageOf('2006-01-01', new Date(2026, 11, 31)), '20y 11m 30d');
const yearEnd = Age.calculate('2005-12-31', new Date(2026, 0, 1));
check('next birthday rolls into the same year', yearEnd.nextBirthday.date, '2026-12-31');
check('364 days to go', yearEnd.nextBirthday.daysRemaining, 364);
check('turning 21', yearEnd.nextBirthday.years, 21);
const nextYear = Age.calculate('1990-06-15', new Date(2026, 6, 16));
check('after the birthday it is the NEXT year', nextYear.nextBirthday.date, '2027-06-15');
check('364 days to go in a normal year', Age.calculate('2005-12-31', new Date(2026, 0, 1)).nextBirthday.daysRemaining, 364);
check('334 days to go from mid July', nextYear.nextBirthday.daysRemaining, 334);

section('Total time lived');
const noon = Age.calculate('2000-01-01', new Date(2000, 0, 1, 12, 0, 0));
check('12 hours after birth', noon.totals.hours, 12);
check('720 minutes', noon.totals.minutes, 720);
check('43200 seconds', noon.totals.seconds, 43200);
const week = Age.calculate('2000-01-01', new Date(2000, 0, 8, 0, 0, 0));
check('7 days', week.totals.days, 7);
check('1 whole week', week.totals.weeks, 1);
check('168 hours', week.totals.hours, 168);

section('Validation');
check('empty input', Age.calculate('', NOW).error, 'Please enter your date of birth.');
check('null input', Age.calculate(null, NOW).error, 'Please enter your date of birth.');
check('broken format', Age.calculate('15/03/2004', NOW).error,
  'Please enter a valid date using the date picker.');
check('31 February is impossible', Age.calculate('2023-02-31', NOW).error,
  'That date does not exist. Please check the day and month.');
check('29 February 2023 is impossible', Age.calculate('2023-02-29', NOW).error,
  'That date does not exist. Please check the day and month.');
check('29 February 2024 is valid', Age.calculate('2024-02-29', NOW).ok, true);
check('month 13 is impossible', Age.calculate('2024-13-01', NOW).error,
  'That date does not exist. Please check the day and month.');
check('day 0 is impossible', Age.calculate('2024-01-00', NOW).error,
  'That date does not exist. Please check the day and month.');
check('a year before 1900 is rejected', Age.calculate('1899-12-31', NOW).ok, false);
check('calculate() without "now" uses the real current date',
  Age.calculate('2000-01-01').ok, true);

section('Helpers');
check('toIsoDate pads', Age.toIsoDate(2026, 3, 7), '2026-03-07');
check('formatDate is readable', Age.formatDate(2026, 3, 7), '7 March 2026');
check('daysBetween counts whole days',
  Age.daysBetween({ year: 2026, month: 9, day: 1 }, { year: 2026, month: 9, day: 11 }), 10);
check('daysBetween across a year',
  Age.daysBetween({ year: 2025, month: 12, day: 31 }, { year: 2026, month: 1, day: 1 }), 1);
check('isValidDate 2024-02-29', Age.isValidDate(2024, 2, 29), true);
check('isValidDate 2023-02-29', Age.isValidDate(2023, 2, 29), false);

section('Offline / privacy scan of the module');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'age-calculator.js'), 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
ok('no network calls', !/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(code));
ok('the DOB is never stored', !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(code));
ok('no eval or new Function', !/\beval\s*\(|new\s+Function/.test(code));

console.log('\n============================================================');
console.log(passed + ' checks passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('All age calculator tests passed.');
