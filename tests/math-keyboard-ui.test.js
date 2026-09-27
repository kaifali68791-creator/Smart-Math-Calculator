/**
 * Math Keyboard UI / integration test (Node, no framework):
 *   node tests/math-keyboard-ui.test.js
 * -----------------------------------------------------------------------------
 * Phase 1 (tests/math-keyboard.test.js) proved the insertion CORE. This file
 * proves the Phase 2 VIEW: the toggle, the panel, the real <button> keys, the
 * open/close behaviour, the aria wiring, the language switch and the fact that
 * nothing leaks into the existing solver behaviour.
 *
 * The harness is a small fake DOM (attribute selectors, real event dispatch,
 * bubbling, a working <textarea> selection) and it loads the ACTUAL project
 * files - js/ui/dom.js, math-keyboard.js, math-keyboard-view.js,
 * solver-view.js and js/services/i18n.js - through vm, so nothing about the
 * implementation is re-implemented or mocked away.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ------------------------------------------------------------------ fake DOM

function attributeSelector(selector) {
  const match = /^\[([A-Za-z0-9_-]+)(?:="([^"]*)")?\]$/.exec(String(selector || '').trim());
  return match ? { name: match[1], value: match[2] } : null;
}
function matches(element, selector) {
  const spec = attributeSelector(selector);
  if (!spec) { return false; }
  if (!Object.prototype.hasOwnProperty.call(element._attrs, spec.name)) { return false; }
  return spec.value === undefined || element._attrs[spec.name] === spec.value;
}
function walk(element, out) {
  for (let i = 0; i < element._children.length; i += 1) {
    const child = element._children[i];
    out.push(child);
    walk(child, out);
  }
  return out;
}

function makeEl(tag, attrs) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    nodeName: String(tag || 'div').toUpperCase(),
    value: '',
    hidden: false,
    className: '',
    focused: 0,
    _attrs: Object.assign({}, attrs || {}),
    _children: [],
    _parent: null,
    _handlers: {},
    selectionStart: null,
    selectionEnd: null
  };
  Object.defineProperty(el, 'textContent', {
    get() { return el._text === undefined ? '' : el._text; },
    set(v) { el._text = String(v); el._children = []; }
  });
  el.classList = {
    toggle(name, on) { if (on) { el.className = (el.className + ' ' + name).trim(); } },
    contains(name) { return el.className.split(/\s+/).indexOf(name) !== -1; }
  };
  el.getAttribute = (n) => (Object.prototype.hasOwnProperty.call(el._attrs, n) ? el._attrs[n] : null);
  el.setAttribute = (n, v) => { el._attrs[n] = String(v); };
  el.removeAttribute = (n) => { delete el._attrs[n]; };
  el.hasAttribute = (n) => Object.prototype.hasOwnProperty.call(el._attrs, n);
  el.addEventListener = (t, fn) => { (el._handlers[t] = el._handlers[t] || []).push(fn); };
  el.removeEventListener = (t, fn) => {
    const list = el._handlers[t] || [];
    const i = list.indexOf(fn);
    if (i !== -1) { list.splice(i, 1); }
  };
  el.dispatchEvent = (event) => {
    let node = el;
    while (node) {
      (node._handlers[event.type] || []).slice().forEach((fn) => fn(event));
      node = node._parent;
    }
    return true;
  };
  el.click = () => el.dispatchEvent({ type: 'click', target: el, preventDefault() {} });
  el.focus = () => { el.focused += 1; };
  el.setSelectionRange = (start, end) => {
    el.selectionStart = start;
    el.selectionEnd = end === undefined ? start : end;
  };
  el.appendChild = (child) => {
    const incoming = child && child.__fragment ? child._children : [child];
    incoming.forEach((node) => { node._parent = el; el._children.push(node); });
    return child;
  };
  el.contains = (other) => other === el || el._children.indexOf(other) !== -1;
  el.querySelectorAll = (selector) => walk(el, []).filter((n) => matches(n, selector));
  el.querySelector = (selector) => el.querySelectorAll(selector)[0] || null;
  return el;
}

// ------------------------------------------------------- the solver + keyboard tree

const docEl = makeEl('body');
const document_ = {
  querySelector: (s) => docEl.querySelector(s),
  querySelectorAll: (s) => docEl.querySelectorAll(s),
  createElement: (t) => makeEl(t, {}),
  createDocumentFragment: () => ({ __fragment: true, _children: [], appendChild(c) { this._children.push(c); return c; } }),
  addEventListener() {},
  documentElement: makeEl('html')
};

const host = makeEl('div', { 'data-solver': '' });
const question = makeEl('textarea', { 'data-solver-question': '' });
const modeDirect = makeEl('button', { 'data-solver-mode': 'direct' });
const modeFull = makeEl('button', { 'data-solver-mode': 'full' });
const solveBtn = makeEl('button', { 'data-solver-solve': '' });
const clearBtn = makeEl('button', { 'data-solver-clear': '' });
const resultEl = makeEl('div', { 'data-solver-result': '', 'data-result-kind': 'idle' });
const resultTitle = makeEl('h3', { 'data-solver-result-title': '' });
const resultBody = makeEl('p', { 'data-solver-result-body': '' });
const resultSource = makeEl('span', { 'data-solver-source': '' });
const examples = [
  'Solve 2x + 5 = 15',
  'What is 25% of 800?',
  'Solve x\u00B2 - 5x + 6 = 0'
].map((text) => {
  const b = makeEl('button', { 'data-solver-example': '', 'data-question': text });
  b.textContent = text;
  return b;
});
const toggle = makeEl('button', {
  'data-math-keyboard-toggle': '',
  type: 'button',
  'aria-expanded': 'false',
  'aria-controls': 'solver-math-keyboard'
});
toggle.textContent = '\u2328 Math Keyboard';
const panel = makeEl('div', {
  'data-math-keyboard-panel': '',
  id: 'solver-math-keyboard',
  role: 'group',
  'aria-label': 'Math keyboard'
});
panel.hidden = true;
const keyHosts = {};
['operators', 'symbols', 'powers', 'functions', 'extra'].forEach((id) => {
  const groupEl = makeEl('div', { 'data-math-keyboard-keys': id });
  keyHosts[id] = groupEl;
  panel.appendChild(groupEl);
});

[modeDirect, modeFull, question, toggle, panel, resultEl, resultTitle, resultBody, resultSource]
  .concat(examples)
  .forEach((el) => host.appendChild(el));
docEl.appendChild(host);
solveBtn._parent = host;
clearBtn._parent = host;
host._children.push(solveBtn, clearBtn);

// ------------------------------------------------------------------ the sandbox

const sandbox = {
  console,
  document: document_,
  Event: function FakeEvent(type, init) { this.type = type; this.bubbles = !!(init && init.bubbles); }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
function load(rel) {
  vm.runInContext(read(rel), sandbox, { filename: rel });
}
load('js/ui/dom.js');
load('js/core/expression-engine.js');
load('js/core/format.js');
load('js/services/math-solver.js');
load('js/services/i18n.js');
load('js/ui/math-keyboard.js');
load('js/ui/math-keyboard-view.js');
load('js/ui/solver-view.js');

const SMC = sandbox.SMC;
const core = SMC.MathKeyboard;

/** A settings stub, so i18n never touches real storage. */
const settings = { _v: {}, get(k, d) { return k in this._v ? this._v[k] : d; }, set(k, v) { this._v[k] = v; } };

/** Builds a fresh keyboard view over a fresh textarea. */
function mount() {
  // Each mount renders into the same markup, so the key containers are emptied
  // first: one view per set of assertions, never a growing pile of buttons.
  // The shared toggle/panel listeners are dropped too - otherwise every earlier
  // view would keep toggling the same element an even number of times.
  Object.keys(keyHosts).forEach((id) => { keyHosts[id].textContent = ''; });
  toggle._handlers = {};
  panel._handlers = {};
  const el = makeEl('textarea', {});
  el.value = '';
  const i18n = SMC.createI18n(settings);
  const view = SMC.createMathKeyboardView({ textarea: el, i18n: i18n, scope: host });
  return { el: el, i18n: i18n, view: view };
}
function caret(el, at) { el.selectionStart = at; el.selectionEnd = at; }
function selectRange(el, start, end) { el.selectionStart = start; el.selectionEnd = end; }
function keyByText(view, text) {
  return view.getKeys().filter((b) => b.getAttribute('data-math-key') === text)[0] || null;
}

check('the insertion core is loaded', typeof core.insertAtCursor, 'function');
check('the keyboard view factory is exposed', typeof SMC.createMathKeyboardView, 'function');
check('the view module published its key list',
  Array.isArray(SMC.MathKeyboardView.KEY_LIST), true);

// ===========================================================================
// 1) the keyboard starts closed
// ===========================================================================
{
  const m = mount();
  check('1: the view found the toggle and the panel', m.view.isReady(), true);
  check('1: the keyboard starts closed', m.view.isOpen(), false);
  check('1: the panel carries the hidden attribute', panel.hidden, true);
  check('1: aria-expanded starts false', toggle.getAttribute('aria-expanded'), 'false');
}

// ===========================================================================
// 2) + 3) the toggle opens and closes it
// ===========================================================================
{
  const m = mount();
  toggle.click();
  check('2: the toggle opens the keyboard', m.view.isOpen(), true);
  check('2: the panel is no longer hidden', panel.hidden, false);
  toggle.click();
  check('3: the same toggle closes the keyboard again', m.view.isOpen(), false);
  check('3: the panel is hidden again', panel.hidden, true);
  // direct API, for completeness
  m.view.open();
  check('3: open() works on its own', m.view.isOpen(), true);
  m.view.close();
  check('3: close() works on its own', m.view.isOpen(), false);
  check('3: toggle() flips it', m.view.toggle(), true);
  m.view.toggle();
}

// ===========================================================================
// 4) aria-expanded follows the real state, in both directions
// ===========================================================================
{
  const m = mount();
  check('4: closed -> aria-expanded="false"', toggle.getAttribute('aria-expanded'), 'false');
  m.view.open();
  check('4: open -> aria-expanded="true"', toggle.getAttribute('aria-expanded'), 'true');
  m.view.close();
  check('4: close -> aria-expanded="false"', toggle.getAttribute('aria-expanded'), 'false');
  toggle.click();
  check('4: click -> aria-expanded="true"', toggle.getAttribute('aria-expanded'), 'true');
  toggle.click();
  check('4: click -> aria-expanded="false"', toggle.getAttribute('aria-expanded'), 'false');
  ok('4: aria-expanded is only ever true or false',
    ['true', 'false'].indexOf(toggle.getAttribute('aria-expanded')) !== -1);
}

// ===========================================================================
// 5) aria-controls points at the real panel
// ===========================================================================
{
  mount();
  const controls = toggle.getAttribute('aria-controls');
  check('5: the toggle declares aria-controls', typeof controls, 'string');
  ok('5: aria-controls matches the panel id', controls === panel.getAttribute('id'),
    controls + ' vs ' + panel.getAttribute('id'));
  check('5: the panel id is solver-math-keyboard', controls, 'solver-math-keyboard');
  check('5: the panel is a labelled group', panel.getAttribute('role'), 'group');
  ok('5: the panel has an accessible label',
    typeof panel.getAttribute('aria-label') === 'string' && panel.getAttribute('aria-label').length > 0);
  const html = read('index.html');
  ok('5: index.html wires the same id and aria-controls',
    /aria-controls="solver-math-keyboard"/.test(html) && /id="solver-math-keyboard"/.test(html));
}

// ===========================================================================
// 6) every key is a real <button type="button"> with an aria-label
// ===========================================================================
{
  const m = mount();
  const buttons = m.view.getKeys();
  ok('6: keys were rendered', buttons.length >= 30, String(buttons.length));
  ok('6: every key is a BUTTON element',
    buttons.every((b) => b.tagName === 'BUTTON'));
  ok('6: every key is type="button" (never submits the solver)',
    buttons.every((b) => b.getAttribute('type') === 'button'));
  ok('6: every key has a non-empty aria-label',
    buttons.every((b) => {
      const label = b.getAttribute('aria-label');
      return typeof label === 'string' && label.trim().length > 0;
    }));
  ok('6: no key is a clickable div',
    read('js/ui/math-keyboard-view.js').indexOf("dom.create('div'") === -1);
  ok('6: the toggle is a real button too', toggle.tagName === 'BUTTON' &&
    toggle.getAttribute('type') === 'button');
  // The rendered set must match the declared key list exactly.
  const declared = m.view.getKeyList().map((k) => k.text);
  const rendered = buttons.map((b) => b.getAttribute('data-math-key'));
  check('6: rendered keys match the declared key list', rendered.join('|'), declared.join('|'));
  ok('6: the buttons landed in the five group containers',
    ['operators', 'symbols', 'powers', 'functions', 'extra'].every((id) => {
      return keyHosts[id]._children.length > 0;
    }));
}

// ===========================================================================
// 7) normal symbol insertion at the real caret
// ===========================================================================
{
  const m = mount();
  m.el.value = '2x';
  caret(m.el, 1);                                     // between "2" and "x"
  keyByText(m.view, '+').click();
  check('7: "2x" + the + key', m.el.value, '2+x');
  check('7: the caret sits immediately after the +', m.el.selectionStart, 2);
  check('7: the selection is collapsed', m.el.selectionEnd, m.el.selectionStart);
  keyByText(m.view, '\u2212').click();                // the true minus sign
  check('7: the second operator is inserted too', m.el.value, '2+\u2212x');
  m.el.value = 'a';
  caret(m.el, 1);
  keyByText(m.view, '^').click();
  check('7: the power operator uses plain insertion', m.el.value, 'a^');
  m.el.value = 'r';
  caret(m.el, 1);
  keyByText(m.view, '\u03C0').click();
  check('7: pi is inserted as plain text', m.el.value, 'r\u03C0');
  m.el.value = '(1';
  caret(m.el, 1);
  keyByText(m.view, ')').click();
  check('7: a bracket is plain text too', m.el.value, '()1');
}

// ===========================================================================
// 8) superscripts APPEND after the selection
// ===========================================================================
{
  const m = mount();
  m.el.value = 'x';
  selectRange(m.el, 0, 1);                            // "x" is selected
  keyByText(m.view, '\u00B2').click();
  check('8: selecting "x" and pressing the 2 key gives x squared', m.el.value, 'x\u00B2');
  check('8: the caret is after the superscript', m.el.selectionStart, 2);
  m.el.value = 'x';
  selectRange(m.el, 0, 1);
  keyByText(m.view, '\u00B3').click();
  check('8: the 3 key appends the same way', m.el.value, 'x\u00B3');
  m.el.value = '12';
  selectRange(m.el, 0, 2);
  keyByText(m.view, '\u00B2').click();
  check('8: a multi-character selection survives', m.el.value, '12\u00B2');
  check('8: the caret follows the whole expression', m.el.selectionStart, 3);
  // With no selection a superscript behaves like plain insertion.
  m.el.value = '3';
  caret(m.el, 1);
  keyByText(m.view, '\u00B2').click();
  check('8: with no selection it just inserts', m.el.value, '3\u00B2');
  check('8: the key is really declared as append mode',
    keyByText(m.view, '\u00B2').getAttribute('data-math-key-mode'), 'append');
}

// ===========================================================================
// 9) the roots WRAP the selection
// ===========================================================================
{
  const m = mount();
  m.el.value = '2 + 8';
  selectRange(m.el, 0, 5);
  keyByText(m.view, '\u221A').click();
  check('9: selecting "2 + 8" and pressing sqrt gives the wrapped expression',
    m.el.value, '\u221A(2 + 8)');
  check('9: the caret is after the wrapped expression', m.el.selectionStart, 8);
  m.el.value = '2 + 8';
  selectRange(m.el, 0, 5);
  keyByText(m.view, '\u221B').click();

// ===========================================================================
// 10) function keys insert exactly their own text
// ===========================================================================
{
  const m = mount();
  const FUNCTIONS = ['sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(', 'sinh(',
    'cosh(', 'tanh(', 'log(', 'ln(', 'sqrt(', 'cbrt(', 'abs('];
  FUNCTIONS.forEach((fn) => {
    ok('10: the ' + fn + ' key exists', !!keyByText(m.view, fn));
  });
  FUNCTIONS.forEach((fn) => {
    m.el.value = '';
    caret(m.el, 0);
    keyByText(m.view, fn).click();
    check('10: the ' + fn + ' key inserts exactly ' + fn, m.el.value, fn);
    check('10: the caret is after ' + fn, m.el.selectionStart, fn.length);
  });
  // "sin(" must not gain an automatic closing bracket.
  m.el.value = '2';
  caret(m.el, 1);
  keyByText(m.view, 'sin(').click();
  check('10: no closing bracket is invented', m.el.value, '2sin(');
  check('10: the caret is right after the open bracket', m.el.selectionStart, 5);
  // The optional extras, which the local solver already supports.
  ['!', '%', 'mod', 'of'].forEach((extra) => {
    ok('10: the optional ' + extra + ' key exists', !!keyByText(m.view, extra));
  });
  m.el.value = '5';
  caret(m.el, 1);
  keyByText(m.view, '!').click();
  check('10: the factorial key inserts a plain !', m.el.value, '5!');
  m.el.value = '25';
  caret(m.el, 2);
  keyByText(m.view, '%').click();
  check('10: the percent key inserts a plain %', m.el.value, '25%');
}

// ===========================================================================
// 11) focus comes back to the textarea after every key
// ===========================================================================
{
  const m = mount();
  m.el.value = '2x';
  caret(m.el, 2);
  m.el.focused = 0;
  keyByText(m.view, '+').click();
  ok('11: the textarea is focused again after a key', m.el.focused > 0);
  check('11: the value was still updated', m.el.value, '2x+');
  // A key press must not park focus on the keyboard panel.
  ok('11: the panel itself is not given focus', !panel.focused);
  m.el.value = '3 + ';
  caret(m.el, 4);
  m.el.focused = 0;
  keyByText(m.view, '\u221A').click();
  ok('11: focus returns after a wrap key too', m.el.focused > 0);
  check('11: and the caret is inside the new brackets', m.el.selectionStart, 6);
}

  check('9: the cube root wraps the same way', m.el.value, '\u221B(2 + 8)');
  // No selection: an empty wrapper with the caret inside it.
  m.el.value = '3 + ';
  caret(m.el, 4);
  keyByText(m.view, '\u221A').click();
  check('9: with no selection an empty pair is made', m.el.value, '3 + \u221A()');

// ===========================================================================
// 12) the existing textarea content is preserved
// ===========================================================================
{
  const m = mount();
  m.el.value = 'Solve 2x + 5 = 15';
  caret(m.el, 19);
  keyByText(m.view, '!').click();
  check('12: a key appends at the end without losing anything',
    m.el.value, 'Solve 2x + 5 = 15!');
  m.el.value = '  Solve 2x  +  3  ';
  caret(m.el, 15);
  keyByText(m.view, '\u00D7').click();
  check('12: leading and trailing spaces are untouched',
    m.el.value, '  Solve 2x  +  \u00D73  ');
  check('12: the caret follows the inserted symbol', m.el.selectionStart, 16);
  // Nothing else in the document may be rewritten.
  const before = resultBody.textContent;
  keyByText(m.view, '+').click();
  check('12: the result area is not touched by a key', resultBody.textContent, before);
  m.el.value = 'a b c';
  keyByText(m.view, '\u00F7').click();   // no selection at all
  check('12: a missing caret falls back to the end', m.el.value, 'a b c\u00F7');
}

// ===========================================================================
// 13) the existing selection is respected, never clobbered blindly
// ===========================================================================
{
  const m = mount();
  // replace mode: the selected range is the thing that gets replaced.
  m.el.value = '2x + 3';
  selectRange(m.el, 5, 6);
  keyByText(m.view, '\u03C0').click();
  check('13: replace mode consumes the selection', m.el.value, '2x + \u03C0');
  check('13: the caret collapses to one point', m.el.selectionStart, m.el.selectionEnd);
  check('13: the caret is after the replacement', m.el.selectionStart, 6);
  // append mode: the selection is kept.
  m.el.value = '2x + 3';
  selectRange(m.el, 5, 6);
  keyByText(m.view, '\u00B2').click();
  check('13: append mode keeps the selected text', m.el.value, '2x + 3\u00B2');
  // wrap mode: the selection becomes the argument.
  m.el.value = '2x + 3';
  selectRange(m.el, 0, 6);
  keyByText(m.view, '\u221A').click();
  check('13: wrap mode keeps the selected text as the argument',
    m.el.value, '\u221A(2x + 3)');
  check('13: the caret is after the wrapper', m.el.selectionStart, 9);
  // A selection that is not at the caret position is still honoured.
  m.el.value = 'HEAD MIDDLE TAIL';
  selectRange(m.el, 5, 11);
  keyByText(m.view, '\u00B2').click();
  check('13: the selection wins over the old caret', m.el.value, 'HEAD MIDDLE\u00B2 TAIL');
  check('13: the caret lands after the appended symbol', m.el.selectionStart, 12);
}

// ===========================================================================
// 14) a key never routes through solverView.setQuestion()
// ===========================================================================
{
  const viewSource = stripComments(read('js/ui/math-keyboard-view.js'));
  ok('14: the keyboard view never mentions setQuestion',
    viewSource.indexOf('setQuestion') === -1);
  const solverSource = stripComments(read('js/ui/solver-view.js'));
  // The only keyboard call site passes the textarea, the i18n service and the
  // scope - and nothing that could replace a keystroke with setQuestion().
  const callSite = solverSource.slice(
    solverSource.indexOf('createMathKeyboardView'));
  ok('14: the call site hands over the textarea, not a setter',
    callSite.indexOf('textarea: questionEl') !== -1);
  ok('14: the call site does not pass setQuestion',
    callSite.slice(0, 200).indexOf('setQuestion') === -1);
  // At runtime the keyboard replays the textarea's own `input` event, which is
  // the stale-result mechanism the solver already had. This uses the REAL
  // solver textarea, i.e. the exact same element the view reads and writes.
  const localSolver = SMC.createMathSolver({
    engine: SMC.ExpressionEngine,
    format: SMC.Format
  });
  const solverView = SMC.createSolverView({ solver: localSolver });
  const kb = solverView.mathKeyboardView;
  ok('14: the solver view built a keyboard', !!kb, true);
  solverView.setQuestion('2 + 3');
  solveBtn.click();
  check('14: solved first', solverView.getResult().kind, 'answer');
  let inputEvents = 0;
  question.addEventListener('input', () => { inputEvents += 1; });
  caret(question, 3);
  keyByText(kb, '+').click();
  check('14: a key replays the existing input event', inputEvents, 1);
  check('14: the old answer is retired by that same event',
    solverView.getResult().kind, 'idle');
  check('14: the question really changed', solverView.getQuestion(), '2 ++ 3');
  check('14: and no solve was triggered', inputEvents, 1);
  check('14: one key press added exactly one character',
    solverView.getQuestion().length, '2 + 3'.length + 1);
}

// ===========================================================================
// 15) a language change relabels the keys with no reload
// ===========================================================================
{
  const m = mount();
  const plus = keyByText(m.view, '+');
  const sqrtKey = keyByText(m.view, '\u221A');
  check('15: English aria-label', plus.getAttribute('aria-label'), 'Insert +');
  m.i18n.setLanguage('hi');
  check('15: Hindi aria-label after a live switch', plus.getAttribute('aria-label'),
    '\u002B \u091C\u094B\u0921\u093C\u0947\u0902');
  check('15: the root key is relabelled too', sqrtKey.getAttribute('aria-label'),
    '\u221A \u091C\u094B\u0921\u093C\u0947\u0902');
  m.i18n.setLanguage('te-Latn');
  check('15: Roman Telugu aria-label', plus.getAttribute('aria-label'), '+ cerchu');
  m.i18n.setLanguage('en');
  check('15: switching back restores English', plus.getAttribute('aria-label'), 'Insert +');
  // The visible chrome comes from the existing data-i18n pass in index.html.
  const html = read('index.html');
  ok('15: the toggle label is translated by the markup pass',
    /data-i18n="keyboard\.toggle"/.test(html));
  ok('15: the panel label is translated by the markup pass',
    /aria-label:keyboard\.aria\.panel/.test(html));
  ok('15: every group heading is translated by the markup pass',
    ['operators', 'symbols', 'powers', 'functions', 'extra'].every(
      (id) => html.indexOf('data-i18n="keyboard.group.' + id + '"') !== -1));
}

  check('9: the caret is inside the brackets', m.el.selectionStart, 6);
  ok('9: the caret is before the closing bracket', m.el.selectionStart < m.el.value.length);
  check('9: the root key is declared as wrap mode',
    keyByText(m.view, '\u221A').getAttribute('data-math-key-mode'), 'wrap');
}


// ===========================================================================
// 16) all five supported languages resolve, and none is an English copy
// ===========================================================================
{
  const KEYS = ['keyboard.toggle', 'keyboard.aria.toggle', 'keyboard.aria.panel',
    'keyboard.hint', 'keyboard.group.operators', 'keyboard.group.symbols',
    'keyboard.group.powers', 'keyboard.group.functions', 'keyboard.group.extra',
    'keyboard.aria.insert'];
  const i18n = SMC.createI18n(settings);
  check('16: exactly five languages are supported', SMC.createI18n.CODES.length, 5);
  check('16: they are the expected five', SMC.createI18n.CODES.join(','),
    'en,hi,hi-Latn,te,te-Latn');
  const seen = {};
  SMC.createI18n.CODES.forEach((code) => {
    i18n.setLanguage(code);
    KEYS.forEach((key) => {
      const value = i18n.t(key);
      ok('16: ' + code + ' has text for "' + key + '"',
        typeof value === 'string' && value.trim().length > 0);
    });
    seen[code] = i18n.t('keyboard.toggle');
    ok('16: ' + code + ' shows the keyboard glyph', seen[code].indexOf('\u2328') === 0, seen[code]);
    ok('16: ' + code + ' keeps the {0} placeholder',
      i18n.t('keyboard.aria.insert').indexOf('{0}') !== -1);
  });
  const distinct = Object.keys(seen).filter((c) => seen[c] !== seen.en);
  check('16: four languages are not the English label', distinct.length, 4);
  i18n.setLanguage('en');
  check('16: English renders "Insert x" from the template',
    i18n.t('keyboard.aria.insert', ['x']), 'Insert x');
  // Every language must have exactly the same key set, as before this phase.
  const englishKeys = Object.keys(SMC.createI18n.DICTIONARY.en).sort().join(',');
  SMC.createI18n.CODES.forEach((code) => {
    check('16: ' + code + ' has the same keys as English',
      Object.keys(SMC.createI18n.DICTIONARY[code]).sort().join(','), englishKeys);
  });
}

// ===========================================================================
// 17) no unsupported relation / calculus / dangerous key slipped in
// ===========================================================================
{
  // The exact list the phase brief forbids, plus the "**" power operator.
  const FORBIDDEN = ['\u2264', '\u2265', '\u2260', '\u2248', '\u00B1', '\u2192',
    '\u221E', '\u222B', '\u2211', '\u03B1', '\u03B2', '\u03B3', '\u03B8',
    '\u0394', '\u207F', 'lim'];
  const m = mount();
  const rendered = m.view.getKeys().map((b) => b.getAttribute('data-math-key'));
  const declared = m.view.getKeyList().map((k) => k.text);
  FORBIDDEN.forEach((symbol) => {
    ok('17: no "' + symbol + '" key is rendered', rendered.indexOf(symbol) === -1);
    ok('17: no "' + symbol + '" key is declared', declared.indexOf(symbol) === -1);
  });
  ok('17: the "**" power operator is not offered', rendered.indexOf('**') === -1);
  // The keyboard's own source (the key definitions) must stay free of all of
  // them, including "lim".
  const viewSource17 = stripComments(read('js/ui/math-keyboard-view.js'));
  FORBIDDEN.forEach((symbol) => {
    ok('17: the keyboard source has no "' + symbol + '"',
      viewSource17.indexOf(symbol) === -1);
  });
  ok('17: the keyboard source has no "**"', viewSource17.indexOf('**') === -1);
  // The WHOLE page is only scanned for the 15 real mathematical characters.
  // "lim" is deliberately NOT scanned there: it is only dangerous as a KEY
  // (the solver cannot evaluate a limit and would return a hard error), and
  // the word "Limitations" is ordinary English prose in the About section.
  const PAGE_SYMBOLS = FORBIDDEN.filter(function (symbol) { return symbol !== 'lim'; });
  const page = read('index.html');
  PAGE_SYMBOLS.forEach((symbol) => {
    ok('17: index.html has no "' + symbol + '"', page.indexOf(symbol) === -1);
  });
  ok('17: index.html has no "**"', page.indexOf('**') === -1);
  // Every key that IS offered must be understood by the local solver, so the
  // keyboard can never hand the student a hard local error.
  const localSolver = SMC.createMathSolver({
    engine: SMC.ExpressionEngine,
    format: SMC.Format
  });
  const SAFE = ['2 + 3', '5 \u2212 3', '6 \u00D7 7', '8 \u00F7 2', '8 / 2', '2 ^ 5',
    '(2 + 3)', '\u03C0 * 2', '\u221A(9)', '\u221B(27)', '3\u00B2', '2\u00B3', '5!',
    '25% of 800', '10 mod 3', 'sin(30)', 'cos(60)', 'tan(45)', 'asin(0.5)',
    'acos(0.5)', 'atan(1)', 'sinh(1)', 'cosh(1)', 'tanh(1)', 'log(100)',
    'sqrt(81)', 'cbrt(27)', 'abs(-5)'];
  SAFE.forEach((sample) => {
    const outcome = localSolver.solveMathQuestion(sample, { detailed: false });
    check('17: the local solver still answers "' + sample + '"',
      outcome && outcome.status, 'success');
  });
  // ln( is the one key whose result depends on the argument: a plain number
  // is answered locally, a symbolic one is reported as honestly unsupported.
  // Neither path may ever be a hard local error.
  ['ln(5)', 'ln(e)'].forEach((sample) => {
    const outcome = localSolver.solveMathQuestion(sample, { detailed: false });
    ok('17: "' + sample + '" is never a hard local error',
      outcome && outcome.status !== 'error', outcome && outcome.status);
  });
}


// ===========================================================================
// 18) no storage, no network, no unsafe DOM in the new code
// ===========================================================================
{
  const BANNED = [
    ['localStorage', 'localStorage'], ['sessionStorage', 'sessionStorage'],
    ['indexedDB', 'IndexedDB'], ['document.cookie', 'cookies'],
    ['fetch(', 'fetch'], ['XMLHttpRequest', 'XMLHttpRequest'],
    ['WebSocket', 'WebSocket'], ['navigator.sendBeacon', 'sendBeacon'],
    ['innerHTML', 'innerHTML'], ['outerHTML', 'outerHTML'],
    ['eval(', 'eval'], ['new Function', 'new Function'],
    ['setQuestion', 'setQuestion'], ['insertAdjacentHTML', 'insertAdjacentHTML']
  ];
  ['js/ui/math-keyboard-view.js', 'js/ui/math-keyboard.js'].forEach((rel) => {
    const code = stripComments(read(rel));
    BANNED.forEach((pair) => {
      ok('18: ' + rel + ' never uses ' + pair[1], code.indexOf(pair[0]) === -1, pair[0]);
    });
  });
  // The keyboard section of the stylesheet is plain flow layout: it can never
  // become a modal, an overlay or a floating sheet over the Solve buttons.
  const css = read('css/solver.css');
  const keyboardCss = css.slice(css.indexOf('.solver__mathkbd'));
  ok('18: the keyboard is not position:fixed',
    keyboardCss.indexOf('position: fixed') === -1);
  ok('18: the keyboard has no z-index overlay', keyboardCss.indexOf('z-index') === -1);
  ok('18: the hidden panel is really hidden in CSS',
    /\.mathkbd\[hidden\]\s*\{\s*display:\s*none/.test(keyboardCss));
  ok('18: the keys meet the 46px touch target minimum',
    /\.mathkbd__key\s*\{[^}]*min-height:\s*(4[6-9]|[5-9][0-9])px/.test(keyboardCss));
  ok('18: the keys have a visible focus state',
    keyboardCss.indexOf('.mathkbd__key:focus-visible') !== -1);
  ok('18: the grid cannot overflow a narrow screen',
    /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(\d+px,\s*1fr\)\)/.test(keyboardCss));
  ok('18: reduced motion is respected',
    /@media \(prefers-reduced-motion: reduce\)/.test(keyboardCss));
  // The open/closed state is deliberately not persisted anywhere.
  const viewSource = stripComments(read('js/ui/math-keyboard-view.js'));
  ok('18: nothing about the open state is stored',
    viewSource.indexOf('storage') === -1 && viewSource.indexOf('persist') === -1);
  ok('18: index.html adds no overlay element',
    read('index.html').indexOf('mathkbd-overlay') === -1);
}


// ===========================================================================
// 19) the existing solver is untouched: examples, solve, clear, modes
// ===========================================================================
{
  const solver19 = SMC.createMathSolver({
    engine: SMC.ExpressionEngine,
    format: SMC.Format
  });
  const view = SMC.createSolverView({ solver: solver19 });
  ok('19: the solver view still creates', !!view, true);
  ok('19: it now exposes the keyboard too', !!view.mathKeyboardView, true);
  check('19: the keyboard reports itself ready', view.mathKeyboardView.isReady(), true);

  examples[0].click();
  check('19: an example still fills the question', view.getQuestion(), 'Solve 2x + 5 = 15');
  solveBtn.click();
  check('19: Solve still answers the example', view.getResult().kind, 'answer');
  check('19: the answer is still correct', view.getResult().answer, 'x = 5');
  modeFull.click();
  check('19: the mode switch still works', view.getMode(), 'full');
  solveBtn.click();
  ok('19: Full Explanation still produces steps', view.getResult().steps.length > 0);
  modeDirect.click();
  check('19: switching back to direct works', view.getMode(), 'direct');
  clearBtn.click();
  check('19: Clear still empties the question', view.getQuestion(), '');
  check('19: Clear still hides the result', view.getResult().kind, 'idle');
  solveBtn.click();
  check('19: the empty-question message is unchanged',
    resultBody.textContent, 'Please enter a math question.');

  // Typing by hand (the `input` event) still retires the previous answer.
  view.setQuestion('2 + 3');
  solveBtn.click();
  check('19: solved again', view.getResult().kind, 'answer');
  question.value = '2 + 4';
  question.dispatchEvent({ type: 'input' });
  check('19: editing the question still retires the old answer',
    view.getResult().kind, 'idle');

  // And the keyboard works against the very same textarea the solver reads.
  const kb = view.mathKeyboardView;
  view.setQuestion('2x');
  caret(question, 1);
  keyByText(kb, '+').click();
  check('19: the keyboard writes into the solver textarea', view.getQuestion(), '2+x');
  check('19: and getQuestion() agrees with the element', question.value, '2+x');
  view.setQuestion('2 + 3');
  solveBtn.click();
  check('19: the solver still works after a keyboard insertion',
    view.getResult().answer, '5');
}


// ===========================================================================
// 19b) no modal, no popup: the markup stays inside the existing solver card
// ===========================================================================
{
  const html = read('index.html');
  const card = html.slice(html.indexOf('class="card solver"'));
  const keyboard = card.slice(card.indexOf('data-math-keyboard-toggle'),
    card.indexOf('data-solver-examples'));
  ok('19b: the keyboard sits between the question box and the action buttons',
    keyboard.length > 0);
  ok('19b: it lives inside the solver card, not in a new page region',
    html.indexOf('data-view-panel="mathkeyboard') === -1);
  ok('19b: both keyboard scripts are loaded',
    /<script src="js\/ui\/math-keyboard\.js"><\/script>/.test(html) &&
    /<script src="js\/ui\/math-keyboard-view\.js"><\/script>/.test(html));
  ok('19b: the keyboard loads before the solver view',
    html.indexOf('math-keyboard-view.js') < html.indexOf('js/ui/solver-view.js'));
  ok('19b: the question box still comes first',
    html.indexOf('data-solver-question') < html.indexOf('data-math-keyboard-toggle'));
  ok('19b: the Solve and Clear buttons still come after the keyboard',
    html.indexOf('data-math-keyboard-toggle') < html.indexOf('data-solver-solve'));
  check('19b: there is still exactly one Solve button',
    (card.match(/data-solver-solve/g) || []).length, 1);
  check('19b: there is still exactly one question textarea',
    (card.match(/data-solver-question/g) || []).length, 1);
  check('19b: the question box is still a plain textarea',
    /<textarea[^>]*data-solver-question/.test(html), true);
  ok('19b: the textarea was not turned into contenteditable',
    html.indexOf('contenteditable') === -1);
  ok('19b: no new stylesheet was needed - the rules live in the solver one',
    html.indexOf('math-keyboard.css') === -1);
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
  console.log('All Math Keyboard UI tests passed.');
}

main();
