/**
 * Smart Math Calculator - Part 3B-1 local solver tests (Node, no framework).
 * Run with:  node tests/math-solver.test.js
 */
'use strict';

const path = require('path');

const createMathSolver = require(path.join(__dirname, '..', 'js', 'services', 'math-solver.js'));
const engine = require(path.join(__dirname, '..', 'js', 'core', 'expression-engine.js'));
const format = require(path.join(__dirname, '..', 'js', 'core', 'format.js'));

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (Object.is(actual, expected)) {
    passed += 1;
  } else {
    failures.push(name + ' -> expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function section(title) {
  console.log('\n' + title);
}

let angleMode = 'deg';
const solver = createMathSolver({
  engine: engine,
  format: format,
  getAngleMode: function () {
    return angleMode;
  }
});

function solve(question, options) {
  return solver.solveMathQuestion(question, options);
}

function answerOf(question, options) {
  const result = solve(question, options);
  return result.status === 'success' ? result.answer : '<' + result.status + '> ' + (result.message || '');
}

function stepsOf(question) {
  const result = solve(question);
  return result.status === 'success' && Array.isArray(result.steps) ? result.steps : [];
}

/** The Part 3B-3 structured explanation rendered by the Full Explanation mode. */
function explanationOf(question) {
  const result = solve(question);
  return result.status === 'success' && result.explanation ? result.explanation : {};
}

/** Every section the UI can render must be present and non-empty. */
function explanationSections(explanation) {
  return [
    explanation.structured === true,
    !!(explanation.given && explanation.find && explanation.concept && explanation.formula),
    Array.isArray(explanation.substitutions) && explanation.substitutions.length > 0,
    Array.isArray(explanation.calculations) && explanation.calculations.length > 0,
    !!explanation.finalAnswer
  ].join(',');
}

// ---------------------------------------------------------------------------
section('API shape');
check('factory exposed', typeof createMathSolver, 'function');
check('solveMathQuestion exposed', typeof solver.solveMathQuestion, 'function');
check('kinds exposed', solver.KINDS.LINEAR_EQUATION, 'linear-equation');
check('status values', solver.STATUS.SUCCESS + '/' + solver.STATUS.UNSUPPORTED + '/' + solver.STATUS.ERROR, 'success/unsupported/error');
check('supported kinds listed', solver.SUPPORTED_KINDS.length, 6);
check('empty question is an error', solve('   ').status, 'error');
check('empty question message', solve('').message, 'Please enter a math question.');
check('very long question is unsupported', solve(new Array(400).join('2 + ')).status, 'unsupported');
check('structured success has steps', Array.isArray(solve('2 + 2').steps), true);
check('success carries the kind', solve('2 + 2').kind, 'arithmetic');

// ---------------------------------------------------------------------------
section('Arithmetic');
check('2 + 3 * 4', answerOf('2 + 3 * 4'), '14');
check('(10 + 5) / 3', answerOf('(10 + 5) / 3'), '5');
check('25 * 8', answerOf('25 * 8'), '200');
check('100 - 35', answerOf('100 - 35'), '65');
check('2 + 3 * 4 steps', stepsOf('2 + 3 * 4')[0], '2 + 3 \u00D7 4 = 14');
check('reused engine: percent arithmetic', answerOf('500 + 10%'), '550');
check('engine is used for arithmetic (no second parser)', answerOf('2(3 + 4)'), '14');
check('divide by zero is an error', solve('5 / 0').status, 'error');
check('divide by zero message', solve('5 / 0').message, 'Cannot divide by zero');
check('incomplete expression is an error', solve('2 +').status, 'error');
check('incomplete expression message', solve('2 +').message, 'Expression is incomplete');
check('invalid expression is an error', solve('2 ** 3').status, 'error');
check('unmatched bracket is an error', solve('(2 + 3))').status, 'error');
check('sqrt of a negative number is reported', solve('sqrt(-4)').status, 'error');
// ---------------------------------------------------------------------------
section('Powers, roots and trigonometry');
check('2^5', answerOf('2^5'), '32');
check('3^3', answerOf('3^3'), '27');
check('sqrt(49)', answerOf('sqrt(49)'), '7');
check('sqrt(81)', answerOf('sqrt(81)'), '9');
check('cube root of 27', answerOf('cube root of 27'), '3');
check('sin(30) in DEG', answerOf('sin(30)'), '0.5');
check('cos(60) in DEG', answerOf('cos(60)'), '0.5');
check('tan(45) in DEG', answerOf('tan(45)'), '1');
angleMode = 'rad';
check('sin(30) in RAD differs', answerOf('sin(30)'), '-0.988031624093');
angleMode = 'deg';
check('explicit angleMode option is honoured', answerOf('sin(30)', { angleMode: 'rad' }), '-0.988031624093');

// ---------------------------------------------------------------------------
section('Fractions');
check('1/2 + 1/4', answerOf('1/2 + 1/4'), '0.75');
check('3/4 * 8', answerOf('3/4 * 8'), '6');
check('1/2 of 100', answerOf('1/2 of 100'), '50');
check('1/2 of 100 is a fraction result', solve('1/2 of 100').kind, 'fraction');
check('1/2 of 100 steps', stepsOf('1/2 of 100').join(' | '), '1/2 = 0.5 | 0.5 \u00D7 100 = 50');

// ---------------------------------------------------------------------------
section('Percentages');
check('25% of 800', answerOf('25% of 800'), '200');
check('What is 25% of 800?', answerOf('What is 25% of 800?'), '200');
check('10% of 500', answerOf('10% of 500'), '50');
check('15% of 2000', answerOf('15% of 2000'), '300');
check('percentage kind', solve('25% of 800').kind, 'percentage');
check('25% of 800 steps', stepsOf('25% of 800').join(' | '), '25 / 100 = 0.25 | 0.25 \u00D7 800 = 200');
check('increase 500 by 10%', answerOf('Increase 500 by 10%'), '550');
check('decrease 800 by 25%', answerOf('Decrease 800 by 25%'), '600');
check('increase steps', stepsOf('increase 500 by 10%')[0], '10% = 10 / 100 = 0.1');
check('ambiguous percentage question is unsupported', solve('what percentage of something is 25%').status, 'unsupported');

// ---------------------------------------------------------------------------
section('Linear equations');
check('2x + 5 = 15', answerOf('2x + 5 = 15'), 'x = 5');
check('3x - 7 = 11', answerOf('3x - 7 = 11'), 'x = 6');
check('5x = 25', answerOf('5x = 25'), 'x = 5');
check('x + 8 = 20', answerOf('x + 8 = 20'), 'x = 12');
check('2x + 3 = x + 10', answerOf('2x + 3 = x + 10'), 'x = 7');
check('2*x + 5 = 15', answerOf('2*x + 5 = 15'), 'x = 5');
check('2 x + 5 = 15', answerOf('2 x + 5 = 15'), 'x = 5');
check('2X + 5 = 15', answerOf('2X + 5 = 15'), 'x = 5');
check('Solve 2x + 5 = 15', answerOf('Solve 2x + 5 = 15'), 'x = 5');
check('Solve for x: 2x + 5 = 15', answerOf('Solve for x: 2x + 5 = 15'), 'x = 5');
check('fraction coefficient: 1/2 of x = 5', answerOf('1/2 of x = 5'), 'x = 10');
check('unicode minus: 3x - 7 = 11', answerOf('3x \u2212 7 = 11'), 'x = 6');
check('kind is linear-equation', solve('2x + 5 = 15').kind, 'linear-equation');
check('linear steps are generated', stepsOf('2x + 5 = 15').join(' | '), '2x + 5 = 15 | 2x = 15 - 5 | 2x = 10 | x = 10 / 2 | x = 5');
check('linear steps for x + 8 = 20', stepsOf('x + 8 = 20').join(' | '), 'x + 8 = 20 | x = 20 - 8 | x = 12');
check('linear steps for 2x + 3 = x + 10', stepsOf('2x + 3 = x + 10').join(' | '), '2x + 3 = x + 10 | x + 3 = 10 | x = 10 - 3 | x = 7');
check('identical sides', solve('x = x').answer, 'Any value of x (the two sides are always equal)');
check('contradiction', solve('x + 1 = x + 2').answer, 'No solution');
check('two variables are unsupported', solve('x + y = 5').status, 'unsupported');
check('other variable letter is unsupported', solve('2y + 5 = 15').status, 'unsupported');
check('two equations are unsupported', solve('2x = 4 and 3x = 9').status, 'unsupported');
check('no variable is unsupported', solve('2 + 3 = 5').status, 'unsupported');
// ---------------------------------------------------------------------------
section('Quadratic equations');
check('x^2 - 5x + 6 = 0', answerOf('x^2 - 5x + 6 = 0'), 'x = 2, 3');
check('x\u00B2 - 5x + 6 = 0 (superscript)', answerOf('x\u00B2 - 5x + 6 = 0'), 'x = 2, 3');
check('Solve x\u00B2 - 5x + 6 = 0', answerOf('Solve x\u00B2 - 5x + 6 = 0'), 'x = 2, 3');
check('x^2 + 5x + 6 = 0', answerOf('x^2 + 5x + 6 = 0'), 'x = -3, -2');
check('repeated root x^2 - 4x + 4 = 0', answerOf('x^2 - 4x + 4 = 0'), 'x = 2 (repeated root)');
check('repeated root x^2 + 2x + 1 = 0', answerOf('x^2 + 2x + 1 = 0'), 'x = -1 (repeated root)');
check('no real roots x^2 + 1 = 0', answerOf('x^2 + 1 = 0'), 'No real roots');
check('no real roots x^2 + x + 1 = 0', answerOf('x^2 + x + 1 = 0'), 'No real roots');
check('2x^2 - 8x = 0', answerOf('2x^2 - 8x = 0'), 'x = 0, 4');
check('x^2 = 9', answerOf('x^2 = 9'), 'x = -3, 3');
check('irrational roots x^2 - 2 = 0', answerOf('x^2 - 2 = 0'), 'x = -1.41421356237, 1.41421356237');
check('kind is quadratic-equation', solve('x^2 - 5x + 6 = 0').kind, 'quadratic-equation');
check('quadratic steps are generated', stepsOf('x^2 - 5x + 6 = 0').join(' | '),
  'x\u00B2 - 5x + 6 = 0 | a = 1, b = -5, c = 6 | x = (-b \u00B1 \u221A(b\u00B2 - 4ac)) / 2a | x = (5 \u00B1 \u221A(25 - 24)) / 2 | \u221A1 = 1 | x = (5 + 1) / 2 = 3 | x = (5 - 1) / 2 = 2');
check('quadratic coefficients are reported', JSON.stringify(solve('x^2 - 5x + 6 = 0').coefficients), '{"a":1,"b":-5,"c":6}');
check('discriminant is reported', solve('x^2 - 5x + 6 = 0').discriminant, 1);
check('roots are reported ascending', solve('x^2 - 5x + 6 = 0').roots.join(','), '2,3');
check('degree 3 is unsupported', solve('x^3 - 8 = 0').status, 'unsupported');
check('degree 4 is unsupported', solve('x^4 - 1 = 0').status, 'unsupported');
check('cubic message mentions degree 2', solve('x^3 - 8 = 0').message.indexOf('degree 2') !== -1, true);

// ---------------------------------------------------------------------------
section('Geometry');
check('area of a circle with radius 7', answerOf('Find the area of a circle with radius 7'), 'A = 49\u03C0 \u2248 153.938040026');
check('circle area kind', solve('area of a circle with radius 7').kind, 'geometry');
check('circle area steps', stepsOf('area of a circle with radius 7').join(' | '),
  'A = \u03C0r\u00B2 | A = \u03C0 \u00D7 7\u00B2 | A = 49\u03C0 | A \u2248 153.938040026');
check('circumference of a circle with radius 7', answerOf('circumference of a circle with radius 7'), 'C = 14\u03C0 \u2248 43.9822971503');
check('circle area from the diameter', answerOf('area of a circle with diameter 10'), 'A = 25\u03C0 \u2248 78.5398163397');
check('area of a rectangle', answerOf('area of a rectangle with length 10 and width 5'), 'A = 50');
check('rectangle perimeter', answerOf('perimeter of a rectangle with length 10 and width 5'), 'P = 30');
check('area of a triangle', answerOf('area of a triangle with base 10 and height 6'), 'A = 30');
check('area of a square', answerOf('area of a square with side 7'), 'A = 49');
check('square perimeter', answerOf('perimeter of a square with side 7'), 'P = 28');
check('circle without a measurement is unsupported', solve('area of a circle').status, 'unsupported');
check('volume is unsupported', solve('volume of a sphere with radius 3').status, 'unsupported');

// ---------------------------------------------------------------------------
section('Structured geometry explanations (Full Explanation mode)');

// Every geometry family answers with the sectioned explanation shape, so only
// the sections listed here are ever rendered - never invented text.
const geometryQuestions = [
  'area of a circle with radius 7',
  'area of a circle with diameter 10',
  'circumference of a circle with radius 7',
  'area of a rectangle with length 10 and width 5',
  'perimeter of a rectangle with length 10 and width 5',
  'area of a square with side 7',
  'perimeter of a square with side 7',
  'area of a triangle with base 10 and height 6'
];
geometryQuestions.forEach(function (question) {
  check('all explanation sections present: ' + question,
    explanationSections(explanationOf(question)), 'true,true,true,true,true');
});

const circleExplanation = explanationOf('area of a circle with radius 7');
check('circle explanation is structured', circleExplanation.structured, true);
check('circle explanation carries the question', circleExplanation.question, 'area of a circle with radius 7');
check('circle explanation given', circleExplanation.given, 'Radius r = 7');
check('circle explanation to find', circleExplanation.find, 'Area of the circle');
check('circle explanation concept', circleExplanation.concept,
  'A direct geometry formula with the measurement given in the question.');
check('circle explanation formula', circleExplanation.formula, 'A = \u03C0r\u00B2');
check('circle explanation substitution', circleExplanation.substitutions.join(' | '), 'A = \u03C0 \u00D7 7\u00B2');
check('circle explanation calculation', circleExplanation.calculations.join(' | '),
  'A = 49\u03C0 | A \u2248 153.938040026');
check('circle explanation final answer', circleExplanation.finalAnswer, 'A = 49\u03C0 \u2248 153.938040026');
check('circle explanation final answer matches the answer', circleExplanation.finalAnswer,
  solve('area of a circle with radius 7').answer);

const diameterExplanation = explanationOf('area of a circle with diameter 10');
check('diameter explanation given', diameterExplanation.given, 'Diameter d = 10');
check('diameter explanation substitution', diameterExplanation.substitutions.join(' | '), 'A = \u03C0 \u00D7 5\u00B2');
check('diameter explanation final answer', diameterExplanation.finalAnswer, 'A = 25\u03C0 \u2248 78.5398163397');

const circumferenceExplanation = explanationOf('circumference of a circle with radius 7');
check('circumference explanation to find', circumferenceExplanation.find, 'Circumference of the circle');
check('circumference explanation formula', circumferenceExplanation.formula, 'C = 2\u03C0r');
check('circumference explanation substitution', circumferenceExplanation.substitutions.join(' | '),
  'C = 2 \u00D7 \u03C0 \u00D7 7');
check('circumference explanation calculation', circumferenceExplanation.calculations.join(' | '),
  'C = 14\u03C0 | C \u2248 43.9822971503');
check('circumference explanation final answer', circumferenceExplanation.finalAnswer,
  'C = 14\u03C0 \u2248 43.9822971503');

const rectangleAreaExplanation = explanationOf('area of a rectangle with length 10 and width 5');
check('rectangle area explanation given', rectangleAreaExplanation.given, 'Length = 10\nWidth = 5');
check('rectangle area explanation to find', rectangleAreaExplanation.find, 'Area of the rectangle');
check('rectangle area explanation formula', rectangleAreaExplanation.formula, 'A = length \u00D7 width');
check('rectangle area explanation substitution', rectangleAreaExplanation.substitutions.join(' | '),
  'A = 10 \u00D7 5');
check('rectangle area explanation calculation', rectangleAreaExplanation.calculations.join(' | '), 'A = 50');
check('rectangle area explanation final answer', rectangleAreaExplanation.finalAnswer, 'A = 50');

const rectanglePerimeterExplanation = explanationOf('perimeter of a rectangle with length 10 and width 5');
check('rectangle perimeter explanation to find', rectanglePerimeterExplanation.find,
  'Perimeter of the rectangle');
check('rectangle perimeter explanation formula', rectanglePerimeterExplanation.formula,
  'P = 2 \u00D7 (length + width)');
check('rectangle perimeter explanation substitution',
  rectanglePerimeterExplanation.substitutions.join(' | '), 'P = 2 \u00D7 (10 + 5)');
check('rectangle perimeter explanation calculation',
  rectanglePerimeterExplanation.calculations.join(' | '), 'P = 2 \u00D7 15 | P = 30');
check('rectangle perimeter explanation final answer', rectanglePerimeterExplanation.finalAnswer, 'P = 30');

const squareAreaExplanation = explanationOf('area of a square with side 7');
check('square area explanation given', squareAreaExplanation.given, 'Side = 7');
check('square area explanation to find', squareAreaExplanation.find, 'Area of the square');
check('square area explanation formula', squareAreaExplanation.formula, 'A = side\u00B2');
check('square area explanation substitution', squareAreaExplanation.substitutions.join(' | '), 'A = 7\u00B2');
check('square area explanation final answer', squareAreaExplanation.finalAnswer, 'A = 49');

const squarePerimeterExplanation = explanationOf('perimeter of a square with side 7');
check('square perimeter explanation to find', squarePerimeterExplanation.find, 'Perimeter of the square');
check('square perimeter explanation formula', squarePerimeterExplanation.formula, 'P = 4 \u00D7 side');
check('square perimeter explanation substitution', squarePerimeterExplanation.substitutions.join(' | '),
  'P = 4 \u00D7 7');
check('square perimeter explanation final answer', squarePerimeterExplanation.finalAnswer, 'P = 28');

const triangleExplanation = explanationOf('area of a triangle with base 10 and height 6');
check('triangle explanation given', triangleExplanation.given, 'Base = 10\nHeight = 6');
check('triangle explanation to find', triangleExplanation.find, 'Area of the triangle');
check('triangle explanation formula', triangleExplanation.formula, 'A = 0.5 \u00D7 base \u00D7 height');
check('triangle explanation substitution', triangleExplanation.substitutions.join(' | '),
  'A = 0.5 \u00D7 10 \u00D7 6');
check('triangle explanation calculation', triangleExplanation.calculations.join(' | '), 'A = 30');
check('triangle explanation final answer', triangleExplanation.finalAnswer, 'A = 30');

check('linear equations keep their structured explanation',
  explanationOf('2x + 5 = 15').structured, true);
check('percentages keep their structured explanation',
  explanationOf('25% of 800').structured, true);

// ---------------------------------------------------------------------------
section('Unsupported questions are never guessed');
check('symbolic derivative', solve('Find the derivative of x\u00B2 + 3x').status, 'unsupported');
check('symbolic derivative message', solve('Find the derivative of x\u00B2 + 3x').message, "I can't solve this question locally yet.");
check('integral', solve('integrate x^2 dx').status, 'unsupported');
check('word problem', solve('Ali has 3 times as many marbles as Sam. How many does each have?').status, 'unsupported');
check('matrices', solve('determinant of the matrix 1 2 3 4').status, 'unsupported');
check('statistics', solve('mean of 1 2 3 4').status, 'unsupported');
check('plain greeting', solve('hello there').status, 'unsupported');
check('unsupported carries a hint', solve('hello there').hint.length > 0, true);
check('unsupported has no answer or steps', solve('hello there').answer, undefined);

// ---------------------------------------------------------------------------
section('No network / no eval in the solver module');
const solverSource = require('fs').readFileSync(
  path.join(__dirname, '..', 'js', 'services', 'math-solver.js'),
  'utf8'
);
/** Comments are removed so the scan only looks at executable code. */
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const solverCode = codeOnly(solverSource);
check('no fetch(', /fetch\s*\(/.test(solverCode), false);
check('no XMLHttpRequest', /XMLHttpRequest/.test(solverCode), false);
check('no WebSocket', /WebSocket/.test(solverCode), false);
check('no eval(', /\beval\s*\(/.test(solverCode), false);
check('no new Function', /new\s+Function/.test(solverCode), false);
check('no hardcoded example answers', solverCode.indexOf('x = 5'), -1);
check('no hardcoded answer table', /answer\s*:\s*['"]x = /.test(solverCode), false);
check('the trusted engine is used for arithmetic', /engine.*\.evaluate|\.calculate\(/m.test(solverCode), true);

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
console.log('All Part 3B-1 local solver tests passed.');
