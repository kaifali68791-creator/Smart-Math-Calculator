/**
 * Math Keyboard insertion core test (Node, no framework):
 *   node tests/math-keyboard.test.js
 * -----------------------------------------------------------------------------
 * The helper is pure text + cursor manipulation, so these tests drive it with a
 * minimal textarea stub that behaves like a real one for the properties that
 * matter here: `value`, `selectionStart`, `selectionEnd`, `setSelectionRange()`
 * and `focus()`.
 *
 * The stub deliberately mirrors the real browser quirk that a PROGRAMMATIC value
 * write leaves selectionStart/selectionEnd null (what happens after an example
 * button or setQuestion()), so the fallback path is covered too.
 *
 * Nothing here touches the network, the parser, the solver or any storage.
 */
'use strict';

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

const keyboard = require('../js/ui/math-keyboard.js');

/** A textarea stub: writable value, live selection, focus tracking. */
function makeTextarea(value) {
  return {
    tagName: 'TEXTAREA',
    value: value === undefined ? '' : value,
    selectionStart: null,
    selectionEnd: null,
    focused: false,
    focusCalls: 0,
    focus: function () { this.focused = true; this.focusCalls += 1; },
    setSelectionRange: function (start, end) {
      this.selectionStart = start;
      this.selectionEnd = end === undefined ? start : end;
    }
  };
}

/** Puts the caret at one offset (collapsed selection). */
function caretAt(el, position) { el.selectionStart = position; el.selectionEnd = position; }
/** Selects the range [start, end). */
function selectRange(el, start, end) { el.selectionStart = start; el.selectionEnd = end; }

const SQRT = '\u221A';   // √
const CBRT = '\u221B';   // ∛
const PI = '\u03C0';     // π
const SUP2 = '\u00B2';   // ²
const SUP3 = '\u00B3';   // ³
const MINUS = '\u2212';  // −
const TIMES = '\u00D7';  // ×
const DIVIDE = '\u00F7'; // ÷
const SUPN = '\u207F';   // ⁿ

// ---------------------------------------------------------------------------
// 1) the module surface
// ---------------------------------------------------------------------------
check('insertAtCursor is a function', typeof keyboard.insertAtCursor, 'function');
check('deleteAtCursor is a function', typeof keyboard.deleteAtCursor, 'function');
check('readSelection is a function', typeof keyboard.readSelection, 'function');
check('the supported modes are exactly replace/append/wrap',
  JSON.stringify(keyboard.MODES), JSON.stringify(['replace', 'append', 'wrap']));
check('the default mode is replace', keyboard.DEFAULT_MODE, 'replace');
check('an unknown mode falls back to replace', keyboard.normalizeMode('nope'), 'replace');
check('an undefined mode falls back to replace', keyboard.normalizeMode(undefined), 'replace');
check('append is recognised', keyboard.normalizeMode('append'), 'append');
check('wrap is recognised', keyboard.normalizeMode('wrap'), 'wrap');

// ---------------------------------------------------------------------------
// 2) CASE 1 - insertion in the middle, at the caret
// ---------------------------------------------------------------------------
{
  const el = makeTextarea('Solve 2x + 3');
  caretAt(el, 11);                                    // just after "+ "
  const r = keyboard.insertAtCursor(el, SQRT, 'replace');
  check('CASE 1: value', el.value, 'Solve 2x + ' + SQRT + '3');
  check('CASE 1: caret sits right after the inserted symbol', el.selectionStart, 12);
  check('CASE 1: the selection is collapsed', el.selectionEnd, el.selectionStart);
  check('CASE 1: the reported value matches the element', r.value, el.value);
  check('CASE 1: the reported caret matches the element', r.start, el.selectionStart);
  check('CASE 1: the mode is echoed', r.mode, 'replace');
}
// ---------------------------------------------------------------------------
// 3) CASE 2 - cursor at the beginning
// ---------------------------------------------------------------------------
{
  const el = makeTextarea('2x + 3');
  caretAt(el, 0);
  keyboard.insertAtCursor(el, SQRT, 'replace');
  check('CASE 2: value', el.value, SQRT + '2x + 3');
  check('CASE 2: caret after the inserted symbol', el.selectionStart, 1);
}
// ---------------------------------------------------------------------------
// 4) CASE 3 - cursor at the end, postfix superscript
// ---------------------------------------------------------------------------
{
  const el = makeTextarea('2x + 3');
  caretAt(el, 6);
  keyboard.insertAtCursor(el, SUP2, 'replace');
  check('CASE 3: value', el.value, '2x + 3' + SUP2);
  check('CASE 3: caret at the very end', el.selectionStart, 7);
}
// ---------------------------------------------------------------------------
// 5) CASE 4a + CASE 6 - replace mode over a selection
// ---------------------------------------------------------------------------
{
  const el = makeTextarea('2x + 3');
  selectRange(el, 5, 6);                              // "3"
  keyboard.insertAtCursor(el, SQRT, 'replace');
  check('CASE 4a: the selection is replaced', el.value, '2x + ' + SQRT);
  check('CASE 4a: caret after the replacement', el.selectionStart, 6);
  check('CASE 4a: selection collapsed', el.selectionEnd, el.selectionStart);
}
{
  const el = makeTextarea('2x + 3');
  selectRange(el, 5, 6);
  const r = keyboard.insertAtCursor(el, 'sin(', 'replace');   // CASE 6
  check('CASE 6: multi-character replacement', el.value, '2x + sin(');
  check('CASE 6: caret after "sin("', el.selectionStart, 9);
  check('CASE 6: the inserted text is reported whole', r.inserted, 'sin(');
}
// ---------------------------------------------------------------------------
// 6) CASE 4b - append-after-selection (postfix power on a selection)
// ---------------------------------------------------------------------------
{
  const el = makeTextarea('2x + 3');
  selectRange(el, 5, 6);
  const r = keyboard.insertAtCursor(el, SUP2, 'append');
  check('CASE 4b: the selected text survives', el.value, '2x + 3' + SUP2);
  check('CASE 4b: caret after the kept text plus the postfix', el.selectionStart, 7);
  check('CASE 4b: selection collapsed', el.selectionEnd, el.selectionStart);
  check('CASE 4b: the reported postfix is just the symbol', r.inserted, SUP2);
  check('CASE 4b: the mode is echoed', r.mode, 'append');
}
{   // append with NO selection must behave like replace
  const el = makeTextarea('2x + 3');
  caretAt(el, 2);
  keyboard.insertAtCursor(el, SUP2, 'append');
  check('append with no selection inserts at the caret', el.value, '2x' + SUP2 + ' + 3');
  check('append with no selection leaves the caret after it', el.selectionStart, 3);
}
// ---------------------------------------------------------------------------
// 7) CASE 4c / 5 - wrap
// ---------------------------------------------------------------------------
{
  const el = makeTextarea('2x + 3');
  selectRange(el, 5, 6);
  const r = keyboard.insertAtCursor(el, SQRT, 'wrap');
  check('wrap: the selection becomes the inside of the wrapper',
    el.value, '2x + ' + SQRT + '(3)');
  check('wrap: the caret is after the whole wrapped expression', el.selectionStart, 9);
  check('wrap: selection collapsed', el.selectionEnd, el.selectionStart);
  check('wrap: the inserted text is the full wrapped expression', r.inserted, SQRT + '(3)');
}
{
  const el = makeTextarea('2x + 3');
  caretAt(el, 5);                                    // after "+ "
  keyboard.insertAtCursor(el, SQRT, 'wrap');
  check('CASE 5: an empty wrapper is created', el.value, '2x + ' + SQRT + '()3');
  check('CASE 5: the caret sits INSIDE the brackets', el.selectionStart, 7);
  ok('CASE 5: the caret is before the closing bracket', el.selectionStart < el.value.length);
}
{   // a wrapper that already opens a bracket must not get a second one
  const el = makeTextarea('2x + ');
  caretAt(el, 5);
  keyboard.insertAtCursor(el, 'sin(', 'wrap');
  check('wrap: "sin(" does not become "sin(("', el.value, '2x + sin()');
  check('wrap: the caret is inside "sin(|)"', el.selectionStart, 9);
}
{   // wrapping a multi-character selection
  const el = makeTextarea('sqrt 2 + 8 rest');
  selectRange(el, 5, 10);                             // "2 + 8"
  keyboard.insertAtCursor(el, SQRT, 'wrap');
  check('wrap: a multi-character selection is wrapped whole',
    el.value, 'sqrt ' + SQRT + '(2 + 8) rest');
  check('wrap: caret after the wrapped expression', el.selectionStart, 13);
}

// ---------------------------------------------------------------------------
// 8) Unicode symbols, multi-character text, and empty/odd inputs
// ---------------------------------------------------------------------------
{
  const symbols = [SQRT, CBRT, PI, SUP2, SUP3, MINUS, TIMES, DIVIDE, SUPN];
  symbols.forEach(function (symbol) {
    const el = makeTextarea('');
    keyboard.insertAtCursor(el, symbol, 'replace');
    check('unicode "' + symbol + '" inserts into an empty box', el.value, symbol);
    check('unicode "' + symbol + '" caret follows it', el.selectionStart, symbol.length);
  });
}
{   // multi-character text and a run of symbols
  const el = makeTextarea('a');
  caretAt(el, 1);
  keyboard.insertAtCursor(el, SQRT + PI + SUP2, 'replace');
  check('multi-character insertion', el.value, 'a' + SQRT + PI + SUP2);
  check('multi-character caret', el.selectionStart, 1 + SQRT.length + PI.length + SUP2.length);
}
{   // an astral-plane character must survive insertion intact
  const el = makeTextarea('x');
  caretAt(el, 1);
  keyboard.insertAtCursor(el, '\u{1D4B8}', 'replace');
  check('an astral symbol is inserted whole', el.value, 'x\u{1D4B8}');
  check('the caret is after both UTF-16 units', el.selectionStart, 3);
}
{   // a caret that would split a surrogate pair is snapped to the boundary
  const el = makeTextarea('a\u{1D4B8}b');
  caretAt(el, 2);                                    // between the two halves
  keyboard.insertAtCursor(el, SQRT, 'replace');
  ok('a mid-surrogate caret does not split the pair',
    el.value.indexOf('\u{1D4B8}') !== -1, el.value);
  check('the pair is kept contiguous and the symbol is inserted before it',
    el.value, 'a' + SQRT + '\u{1D4B8}b');
}
{   // empty textarea
  const el = makeTextarea('');
  keyboard.insertAtCursor(el, SQRT, 'replace');
  check('empty box accepts a symbol', el.value, SQRT);
  check('empty box caret', el.selectionStart, 1);
}
{   // null / undefined text
  const el = makeTextarea('ab');
  caretAt(el, 1);
  keyboard.insertAtCursor(el, null, 'replace');
  check('null text is treated as empty', el.value, 'ab');
  check('null text leaves the caret put', el.selectionStart, 1);
}
{   // null textarea must not throw
  let threw = false;
  let r = null;
  try { r = keyboard.insertAtCursor(null, SQRT, 'replace'); } catch (error) { threw = true; }
  check('a null textarea does not throw', threw, false);
  check('a null textarea returns an empty result', r.value, '');
}

// ---------------------------------------------------------------------------
// 9) null / missing / out-of-range selection falls back to the end of the value
// ---------------------------------------------------------------------------
{
  const el = makeTextarea('2x + 3');
  el.selectionStart = null;
  el.selectionEnd = null;                            // what a programmatic write leaves
  check('readSelection falls back to the end', keyboard.readSelection(el).start, 6);
  keyboard.insertAtCursor(el, SUP2, 'replace');
  check('a null caret inserts at the end', el.value, '2x + 3' + SUP2);
}
{
  const el = makeTextarea('2x + 3');
  el.selectionStart = undefined;
  el.selectionEnd = undefined;
  keyboard.insertAtCursor(el, '!', 'replace');
  check('an undefined caret inserts at the end', el.value, '2x + 3!');
}
{
  const el = makeTextarea('2x + 3');
  el.selectionStart = 99;                            // out of range
  el.selectionEnd = 99;
  keyboard.insertAtCursor(el, '?', 'replace');
  check('an out-of-range caret is clamped to the end', el.value, '2x + 3?');
  check('the clamped caret is inside the value', el.selectionStart, 7);
}
{
  const el = makeTextarea('2x + 3');
  selectRange(el, 6, 2);                             // reversed selection
  const read = keyboard.readSelection(el);
  check('a reversed selection is normalised', read.start, 2);
  check('a reversed selection end is normalised', read.end, 6);
}
{   // an element with no setSelectionRange still gets a caret
  const el = makeTextarea('ab');
  el.setSelectionRange = undefined;
  caretAt(el, 1);
  keyboard.insertAtCursor(el, 'X', 'replace');
  check('falls back to assigning selectionStart', el.selectionStart, 2);
  check('falls back to assigning selectionEnd', el.selectionEnd, 2);
}
// ---------------------------------------------------------------------------
// 10) surrounding text and spaces are preserved exactly
// ---------------------------------------------------------------------------
{
  const el = makeTextarea('  Solve  2x  +  3  ');
  caretAt(el, 16);
  keyboard.insertAtCursor(el, SQRT, 'replace');
  check('leading, inner and trailing spaces survive', el.value, '  Solve  2x  +  ' + SQRT + '3  ');
  check('the caret lands in the right place', el.selectionStart, 17);
}
{
  const el = makeTextarea('Solve 2x + 3');
  keyboard.insertAtCursor(el, ' ', 'replace');        // no selection at all
  check('a missing selection behaves as a caret at the end', el.value, 'Solve 2x + 3 ');
}
{   // text before AND after the caret both survive
  const el = makeTextarea('HEAD|TAIL');
  caretAt(el, 4);
  keyboard.insertAtCursor(el, SQRT, 'replace');
  check('text before the caret is untouched', el.value, 'HEAD' + SQRT + '|TAIL');
  check('the caret is after the inserted text', el.selectionStart, 5);
  check('text after the caret is untouched', el.value.slice(5), '|TAIL');
}
// ---------------------------------------------------------------------------
// 11) focus
// ---------------------------------------------------------------------------
{
  const el = makeTextarea('2x + 3');
  caretAt(el, 6);
  keyboard.insertAtCursor(el, SUP2, 'replace');
  ok('focus is restored after an insert', el.focused === true);
  ok('focus was requested before and after the write', el.focusCalls >= 2, String(el.focusCalls));
}
{
  const el = makeTextarea('2x + 3');
  el.focused = false;
  selectRange(el, 5, 6);
  keyboard.insertAtCursor(el, SUP2, 'append');
  ok('focus is restored after a postfix append', el.focused === true);
}
{
  const el = makeTextarea('2x + 3');
  el.focused = false;
  selectRange(el, 5, 6);
  keyboard.insertAtCursor(el, SQRT, 'wrap');
  ok('focus is restored after a wrap', el.focused === true);
}
{   // an element whose focus() throws must not break the insertion
  const el = makeTextarea('ab');
  caretAt(el, 1);
  el.focus = function () { throw new Error('no focus'); };
  let threw = false;
  try { keyboard.insertAtCursor(el, 'X', 'replace'); } catch (error) { threw = true; }
  check('a throwing focus() does not break the insert', threw, false);
  check('the value is still correct', el.value, 'aXb');
}
// ---------------------------------------------------------------------------
// 12) backspace helper (small, pure, no UI)
// ---------------------------------------------------------------------------
{
  const el = makeTextarea('2x + 3');
  caretAt(el, 6);
  keyboard.deleteAtCursor(el);
  check('backspace removes the character before the caret', el.value, '2x + ');
  check('backspace leaves the caret before the gap', el.selectionStart, 5);
}
{
  const el = makeTextarea('2x + 3');
  selectRange(el, 4, 6);                             // " 3"
  const r = keyboard.deleteAtCursor(el);
  check('backspace deletes a selection whole', el.value, '2x +');
  check('backspace reports what it removed', r.removed, ' 3');
  check('backspace puts the caret where the selection began', el.selectionStart, 4);
}
{
  const el = makeTextarea('ab');
  caretAt(el, 0);
  keyboard.deleteAtCursor(el);
  check('backspace at the start changes nothing', el.value, 'ab');
  check('backspace at the start keeps the caret at 0', el.selectionStart, 0);
}
{
  const el = makeTextarea('a\u{1D4B8}b');
  caretAt(el, 3);                                    // after the astral character
  keyboard.deleteAtCursor(el);
  check('backspace removes a whole surrogate pair', el.value, 'ab');
  ok('no lone surrogate is left behind',
    el.value.charCodeAt(1) < 0xD800 || el.value.charCodeAt(1) > 0xDFFF);
}
{
  const el = makeTextarea('e\u0301x');               // "e" + combining acute
  caretAt(el, 2);
  keyboard.deleteAtCursor(el);
  check('backspace removes a base letter with its combining mark', el.value, 'x');
}
{
  const el = makeTextarea('a + bcdef + z');
  selectRange(el, 4, 10);
  keyboard.insertAtCursor(el, 'X', 'replace');
  check('a multi-character selection is removed exactly', el.value, 'a + X+ z');
  check('the caret is after the replacement', el.selectionStart, 5);
}

// ---------------------------------------------------------------------------
// 13) the helper is standalone: no solver, parser, AI, backend or storage
// ---------------------------------------------------------------------------
{
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'ui', 'math-keyboard.js'), 'utf8');
  // strip comments, so documentation that merely NAMES a dependency is ignored
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  [
    ['setQuestion(', 'solver-view.setQuestion'],
    ['localStorage', 'localStorage'],
    ['sessionStorage', 'sessionStorage'],
    ['MathSolver', 'the local math solver'],
    ['ai-math-solver', 'the AI solver'],
    ['expression-engine', 'the expression engine'],
    ['require(', 'require()'],
    ['innerHTML', 'innerHTML'],
    ['eval(', 'eval()'],
    ['new Function', 'new Function']
  ].forEach(function (pair) {
    ok('the insertion core does not use ' + pair[1], code.indexOf(pair[0]) === -1, pair[0]);
  });
  ok('the module needs no network call', !/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(code));
  // it must not depend on the DOM either: the stub above is a plain object
  ok('the module does not read document', code.indexOf('document') === -1);
  ok('the module does not require window', !/\bwindow\./.test(code));
  // loadable both as a plain CommonJS module and in a browser
  ok('it is a UMD module', /typeof module === 'object' && module\.exports/.test(source));
  ok('it exposes itself as SMC.MathKeyboard in the browser',
    /root\.SMC\.MathKeyboard = mathKeyboard/.test(source));
}

// ---------------------------------------------------------------------------
function main() {
  console.log('\n============================================================');
  console.log(passed + ' checks passed, ' + failures.length + ' failed');
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
  }
  console.log('All Math Keyboard insertion-core tests passed.');
}

main();