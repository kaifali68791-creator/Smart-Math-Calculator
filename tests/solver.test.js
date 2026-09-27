/**
 * Part 3A solver UI test (Node, no framework): node tests/solver.test.js
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
function makeEl(tag, attrs) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(), value: '', textContent: '', hidden: false,
    _attrs: Object.assign({}, attrs), _classes: {},
    classList: {
      toggle(n, on) { el._classes[n] = !!on; },
      contains(n) { return !!el._classes[n]; }
    },
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(el._attrs, n) ? el._attrs[n] : null; },
    setAttribute(n, v) { el._attrs[n] = String(v); },
    removeAttribute(n) { delete el._attrs[n]; },
    _handlers: {},
    addEventListener(t, fn) { (el._handlers[t] = el._handlers[t] || []).push(fn); },
    removeEventListener() {},
    click() { (el._handlers.click || []).forEach((fn) => fn({ preventDefault() {} }, el)); },
    focus() { el._focused = true; },
    contains() { return true; }
  };
  return el;
}
const modeDirect = makeEl('button', { 'data-solver-mode': 'direct' });
const modeFull = makeEl('button', { 'data-solver-mode': 'full' });
const question = makeEl('textarea', { 'data-solver-question': '' });
const solveBtn = makeEl('button', { 'data-solver-solve': '' });
const clearBtn = makeEl('button', { 'data-solver-clear': '' });
const result = makeEl('div', { 'data-solver-result': '', 'data-result-kind': 'idle' });
result.hidden = true;
const resultTitle = makeEl('h3', { 'data-solver-result-title': '' });
const resultBody = makeEl('p', { 'data-solver-result-body': '' });
const exampleTexts = ['Solve 2x + 5 = 15', 'What is 25% of 800?', 'Solve x2 - 5x + 6 = 0', 'Find the derivative of x2 + 3x', 'Find the area of a circle with radius 7'];
const examples = exampleTexts.map((t) => {
  const b = makeEl('button', { 'data-solver-example': '', 'data-question': t });
  b.textContent = t;
  return b;
});
const host = makeEl('div', { 'data-solver': '' });
const registry = {
  '[data-solver]': host, '[data-solver-question]': question,
  '[data-solver-mode]': [modeDirect, modeFull], '[data-solver-solve]': solveBtn,
  '[data-solver-clear]': clearBtn, '[data-solver-result]': result,
  '[data-solver-result-title]': resultTitle, '[data-solver-result-body]': resultBody,
  '[data-solver-example]': examples
};
const sandbox = {
  console,
  document: {
    querySelector(sel) { const h = registry[sel]; return Array.isArray(h) ? h[0] : h || null; },
    querySelectorAll(sel) { const h = registry[sel]; return Array.isArray(h) ? h : h ? [h] : []; },
    createElement: (t) => makeEl(t, {}),
    createDocumentFragment: () => ({ appendChild() {} })
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), sandbox, { filename: rel });
}
load('js/ui/dom.js');
sandbox.SMC.dom.qs = (sel) => sandbox.document.querySelector(sel);
sandbox.SMC.dom.qsa = (sel) => Array.prototype.slice.call(sandbox.document.querySelectorAll(sel));
load('js/core/expression-engine.js');
load('js/core/format.js');
load('js/services/math-solver.js');
load('js/ui/solver-view.js');
const SMC = sandbox.SMC;
check('factory exposed', typeof SMC.createSolverView, 'function');
check('local solver factory exposed', typeof SMC.createMathSolver, 'function');
const localSolver = SMC.createMathSolver({ engine: SMC.ExpressionEngine, format: SMC.Format });
const view = SMC.createSolverView({ solver: localSolver });
check('view created', !!view, true);
check('default mode is direct', view.getMode(), 'direct');
check('empty question initially', view.getQuestion(), '');
view.solve();
check('empty solve message', resultBody.textContent, 'Please enter a math question.');
check('result shown after empty solve', result.hidden, false);
check('empty solve is an error result', view.getResult().kind, 'error');
view.setQuestion('Solve 2x + 5 = 15\nsecond line');
check('multiline input kept', question.value.indexOf('second line') !== -1, true);
examples[0].click();
check('example fills textarea', question.value, 'Solve 2x + 5 = 15');
// Selecting an example must not solve on its own, and it must also retire the
// previous result so it cannot be misread as the answer to the new question.
// Asserted on the state itself rather than on a leftover message string.
check('example does not solve by itself', result.hidden, true);
check('example leaves no stale result behind', view.getResult().kind, 'idle');
check('example did not run the solver', resultBody.textContent, '');
// direct mode: answer only, no steps
solveBtn.click();
check('direct mode shows the answer', resultBody.textContent, 'x = 5');
check('direct mode title', resultTitle.textContent, 'Direct Answer');
check('direct mode kind', view.getResult().kind, 'answer');
check('direct mode keeps no steps in the body', resultBody.textContent.indexOf('Step 1'), -1);
// full explanation mode: generated steps
modeFull.click();
check('full mode selected', view.getMode(), 'full');
check('full marked active', modeFull.classList.contains('is-active'), true);
solveBtn.click();
check('full mode title', resultTitle.textContent, 'Full Explanation');
check('full mode starts with the question section', resultBody.textContent.indexOf('Question:') === 0, true);
check('full mode shows the given equation', resultBody.textContent.indexOf('Given:\n2x + 5 = 15') !== -1, true);
check('full mode generated steps', resultBody.textContent.indexOf('2x = 10') !== -1, true);
check('full mode answer line', resultBody.textContent.indexOf('Answer: x = 5') !== -1, true);
// other supported families through the UI
view.setQuestion('What is 25% of 800?');
solveBtn.click();
check('percentage answer', resultBody.textContent.indexOf('Answer: 200') !== -1, true);
view.setQuestion('x^2 - 5x + 6 = 0');
solveBtn.click();
check('quadratic answer', resultBody.textContent.indexOf('Answer: x = 2, 3') !== -1, true);
view.setQuestion('Find the area of a circle with radius 7');
solveBtn.click();
check('geometry answer', resultBody.textContent.indexOf('Answer: A = 49') !== -1, true);
// Full Explanation mode renders the structured geometry sections (Part 3B-3)
check('geometry explanation given section',
  resultBody.textContent.indexOf('Given:\nRadius r = 7') !== -1, true);
check('geometry explanation to find section',
  resultBody.textContent.indexOf('To Find:\nArea of the circle') !== -1, true);
check('geometry explanation concept section',
  resultBody.textContent.indexOf('Concept:') !== -1, true);
check('geometry explanation formula section',
  resultBody.textContent.indexOf('Formula:\nA = \u03C0r\u00B2') !== -1, true);
check('geometry explanation substitution section',
  resultBody.textContent.indexOf('Substitution:\nA = \u03C0 \u00D7 7\u00B2') !== -1, true);
check('geometry explanation calculation section',
  resultBody.textContent.indexOf('Calculation:\nA = 49\u03C0\nA \u2248 153.938040026') !== -1, true);
check('geometry explanation final answer line',
  resultBody.textContent.indexOf('Final Answer: A = 49\u03C0 \u2248 153.938040026') !== -1, true);
view.setQuestion('perimeter of a rectangle with length 10 and width 5');
solveBtn.click();
check('rectangle explanation sections',
  resultBody.textContent.indexOf('Formula:\nP = 2 \u00D7 (length + width)') !== -1, true);
check('rectangle explanation answer line',
  resultBody.textContent.indexOf('Final Answer: P = 30') !== -1, true);
view.setQuestion('area of a triangle with base 10 and height 6');
solveBtn.click();
check('triangle explanation given section',
  resultBody.textContent.indexOf('Given:\nBase = 10\nHeight = 6') !== -1, true);
check('triangle explanation answer line',
  resultBody.textContent.indexOf('Final Answer: A = 30') !== -1, true);
view.setQuestion('area of a square with side 7');
solveBtn.click();
check('square explanation answer line',
  resultBody.textContent.indexOf('Final Answer: A = 49') !== -1, true);
// unsupported questions are honest
view.setQuestion('Find the derivative of x2 + 3x');
solveBtn.click();
check('unsupported title', resultTitle.textContent, 'Not solvable locally yet');
check('unsupported message', resultBody.textContent.indexOf("I can't solve this question locally yet.") === 0, true);
check('unsupported hint', resultBody.textContent.indexOf('later stage') !== -1, true);
check('unsupported result kind', view.getResult().kind, 'unsupported');
// error handling never throws
view.setQuestion('5 / 0');
solveBtn.click();
check('divide by zero is reported', resultBody.textContent, 'Cannot divide by zero');
check('divide by zero result kind', view.getResult().kind, 'error');
// a view without the solver stays usable
const bare = SMC.createSolverView({});
const bareResult = view.getResult();
bare.setQuestion('2 + 2');
bare.solve();
check('missing solver is reported', bare.getResult().message, 'The local solver is not loaded.');
check('missing solver kind', bare.getResult().kind, 'error');
check('second view keeps its own mode', bare.getMode() + '/' + view.getMode(), 'direct/full');
// clear only clears the question
question.value = 'something';
clearBtn.click();
check('clear empties question', question.value, '');
check('clear hides result', result.hidden, true);
const appFiles = ['index.html', 'js/app.js', 'js/ui/solver-view.js', 'js/services/math-solver.js'];
const networkHits = [];
appFiles.forEach((f) => {
  const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  if (/fetch\s*\(|XMLHttpRequest|new\s+WebSocket|\beval\s*\(|new\s+Function/.test(code)) { networkHits.push(f); }
});
check('no network calls or eval in the app sources', networkHits.join(','), '');
const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'js/core/expression-engine.js'), 'utf8');
check('engine untouched by the solver UI', /solver/i.test(engineSrc), false);
console.log('\n============================================================');
console.log(passed + ' checks passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('All solver UI tests passed.');

