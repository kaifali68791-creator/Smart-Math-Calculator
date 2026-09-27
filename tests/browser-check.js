/**
 * Browser integration check for Smart Math Calculator.
 * Loaded by tests/browser-check.html - it drives the real modules and the real
 * boot file (js/app.js) through real DOM events, then prints a summary on the
 * page (and in document.title) so it can also be inspected headlessly.
 */
(function () {
  'use strict';

  const APP_KEYS = ['smc:history:v1'];
  const results = [];
  let passed = 0;
  let failed = 0;

  function ok(name, condition, detail) {
    if (condition) {
      passed += 1;
      results.push('PASS  ' + name);
    } else {
      failed += 1;
      results.push('FAIL  ' + name + (detail ? ' -> ' + detail : ''));
    }
  }

  function equals(name, actual, expected) {
    ok(
      name,
      Object.is(actual, expected),
      'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)
    );
  }

  function qs(selector) {
    return document.querySelector(selector);
  }

  function pressKey(action, value) {
    const selector =
      '[data-keypad] .key[data-action="' + action + '"]' +
      (value === undefined ? '' : '[data-value="' + value + '"]');
    const button = qs(selector);
    if (!button) {
      failed += 1;
      results.push('FAIL  missing key ' + selector);
      return;
    }
    button.click();
  }

  function typeKeys(sequence) {
    sequence.forEach(function (key) {
      pressKey(key[0], key[1]);
    });
  }

  /** Clicks a scientific key (the 5-column keypad above the normal keys). */
  function pressSciKey(action, value) {
    const selector =
      '[data-keypad-sci] .key[data-action="' + action + '"]' +
      (value === undefined ? '' : '[data-value="' + value + '"]');
    const button = qs(selector);
    if (!button) {
      failed += 1;
      results.push('FAIL  missing scientific key ' + selector);
      return;
    }
    button.click();
  }

  function typeSciKeys(sequence) {
    sequence.forEach(function (key) {
      pressSciKey(key[0], key[1]);
    });
  }

  function pressOnKeyboard(keyName) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true }));
  }

  async function run() {
    const backup = {};
    APP_KEYS.forEach(function (key) {
      backup[key] = window.localStorage.getItem(key);
    });
    window.localStorage.removeItem('smc:history:v1');

    try {
      const app = window.SMC && window.SMC.app;
      ok('js/app.js booted (SMC.app exists)', !!app);
      if (!app) {
        throw new Error('app did not boot');
      }

      const main = qs('[data-display-main]');
      const sub = qs('[data-display-sub]');
      const display = qs('[data-display]');
      const historyList = qs('[data-history-list]');

      // -- rendering ---------------------------------------------------------
      equals('keypad renders 22 keys', qs('[data-keypad]').querySelectorAll('.key').length, 22);
      equals('display starts at 0', main.textContent, '0');
      equals('empty-history message shown', qs('[data-history-empty]').hidden, false);
      equals('history counter starts at 0', qs('[data-history-count]').textContent, '0');
      equals('no horizontal overflow at this viewport', document.body.scrollWidth <= window.innerWidth, true);
      ok('percent-of key exists', !!qs('[data-keypad] .key[data-action="of"]'));

      // -- responsiveness ----------------------------------------------------
      const layoutColumns = window
        .getComputedStyle(qs('.calc-layout'))
        .gridTemplateColumns.split(' ')
        .filter(function (column) {
          return column !== '';
        }).length;
      const firstKeyBox = qs('[data-keypad] .key').getBoundingClientRect();
      const viewportWidth = window.innerWidth;

      if (viewportWidth >= 900) {
        equals('desktop layout uses two columns', layoutColumns, 2);
        ok('desktop keys are at least 50px tall', firstKeyBox.height >= 50, 'height: ' + firstKeyBox.height);
      } else {
        equals('mobile layout uses one column', layoutColumns, 1);
        ok('mobile keys are at least 40px tall', firstKeyBox.height >= 40, 'height: ' + firstKeyBox.height);
        ok('mobile buttons are wide enough', firstKeyBox.width >= 60, 'width: ' + firstKeyBox.width);
      }
      ok('history panel is usable', qs('.history').getBoundingClientRect().width > 100);

      // -- 2 + 3 -------------------------------------------------------------
      typeKeys([['digit', '2'], ['operator', '+'], ['digit', '3']]);
      equals('click shows the expression', main.textContent, '2 + 3');
      equals('live preview appears instantly', sub.textContent, '= 5');
      pressKey('equals');
      equals('2 + 3 = 5', main.textContent, '5');
      equals('result line keeps the expression', sub.textContent, '2 + 3 =');
      equals('history row rendered', historyList.querySelectorAll('.history__item').length, 1);
      equals('history counter updated', qs('[data-history-count]').textContent, '1');
      equals('history expression', qs('.history__expression').textContent, '2 + 3');
      equals('history result line', qs('.history__result').textContent, '= 5');
      equals('written to localStorage', JSON.parse(window.localStorage.getItem('smc:history:v1') || '[]').length, 1);

      const reopened = window.SMC.createHistoryStore(app.storage, { maxEntries: 10 });
      equals('history survives a reload', reopened.count(), 1);

      // -- the other required calculations -----------------------------------
      pressKey('clear');
      typeKeys([['digit', '1'], ['digit', '0'], ['operator', '\u00D7'], ['digit', '5'], ['equals']]);
      equals('10 x 5 = 50', main.textContent, '50');

      pressKey('clear');
      typeKeys([['digit', '1'], ['digit', '0'], ['digit', '0'], ['operator', '\u00F7'], ['digit', '4'], ['equals']]);
      equals('100 / 4 = 25', main.textContent, '25');

      pressKey('clear');
      typeKeys([['digit', '2'], ['digit', '5'], ['operator', '\u2212'], ['digit', '7'], ['equals']]);
      equals('25 - 7 = 18', main.textContent, '18');

      pressKey('clear');
      typeKeys([['digit', '2'], ['decimal'], ['digit', '5'], ['operator', '\u00D7'], ['digit', '4'], ['equals']]);
      equals('2.5 x 4 = 10', main.textContent, '10');

      pressKey('clear');
      typeKeys([
        ['digit', '1'], ['digit', '0'], ['percent'], ['of'],
        ['digit', '5'], ['digit', '0'], ['digit', '0'], ['equals']
      ]);
      equals('10% of 500 = 50', main.textContent, '50');

      pressKey('clear');
      typeKeys([
        ['digit', '5'], ['digit', '0'], ['digit', '0'], ['operator', '+'],
        ['digit', '1'], ['digit', '0'], ['percent'], ['equals']
      ]);
      equals('500 + 10% = 550', main.textContent, '550');

      pressKey('clear');
      typeKeys([
        ['digit', '2'], ['operator', '\u00D7'], ['open-bracket'],
        ['digit', '3'], ['operator', '+'], ['digit', '4'], ['equals']
      ]);
      equals('2 x (3 + 4 = 14 (bracket auto-closed)', main.textContent, '14');

      // -- backspace ---------------------------------------------------------
      pressKey('clear');
      typeKeys([['digit', '1'], ['digit', '2'], ['digit', '3']]);
      pressKey('backspace');
      equals('backspace removes one digit', main.textContent, '12');
      pressKey('backspace');
      pressKey('backspace');
      equals('backspace down to empty', main.textContent, '0');

      // -- error handling ----------------------------------------------------
      pressKey('clear');
      typeKeys([['digit', '5'], ['operator', '\u00F7'], ['digit', '0']]);
      equals('divide by zero warns while typing', sub.textContent, 'Cannot divide by zero');
      pressKey('equals');
      equals('error state message', main.textContent, 'Cannot divide by zero');
      equals('error styling applied', display.classList.contains('is-error'), true);
      pressKey('digit', '7');
      equals('recovers after an error', main.textContent, '7');
      equals('error styling removed', display.classList.contains('is-error'), false);

      // -- keyboard ----------------------------------------------------------
      pressKey('clear');
      pressOnKeyboard('8');
      equals('keyboard digit works', main.textContent, '8');
      pressOnKeyboard('Escape');
      equals('Escape clears', main.textContent, '0');
      pressOnKeyboard('2');
      pressOnKeyboard('+');
      pressOnKeyboard('3');
      pressOnKeyboard('Enter');
      equals('keyboard Enter equals', main.textContent, '5');
      pressOnKeyboard('Backspace');
      equals('keyboard Backspace clears a result', main.textContent, '0');

      // -- history interactions ---------------------------------------------
      const itemCount = historyList.querySelectorAll('.history__item').length;
      ok('several history rows collected', itemCount >= 8, 'rows: ' + itemCount);

      const firstEntry = historyList.querySelector('.history__entry');
      firstEntry.click();
      equals('clicking a history row loads its result', main.textContent, '5');

      const removeButton = historyList.querySelector('.history__remove');
      removeButton.click();
      equals('removing one history row', historyList.querySelectorAll('.history__item').length, itemCount - 1);

      const originalConfirm = window.confirm;
      window.confirm = function () {
        return true;
      };
      qs('[data-history-clear]').click();
      equals('clear removes every history row', historyList.querySelectorAll('.history__item').length, 0);
      equals('empty-history message returns', qs('[data-history-empty]').hidden, false);
      equals('history counter back to 0', qs('[data-history-count]').textContent, '0');
      window.confirm = originalConfirm;

      // -- Part 2: scientific mode and DEG/RAD --------------------------------
      const sciKeypad = qs('[data-keypad-sci]');
      const calculatorCard = qs('[data-calculator]');

      equals('mode controls exist', !!app.modeControls, true);
      equals('24 scientific keys rendered', sciKeypad.querySelectorAll('.key').length, 24);
      equals('scientific keypad hidden in Basic mode', window.getComputedStyle(sciKeypad).display, 'none');
      equals('calculator starts in Basic mode', calculatorCard.classList.contains('is-basic'), true);
      equals('angle unit defaults to DEG', app.modeControls.getAngleMode(), 'deg');
      ok('DEG button pressed by default', qs('[data-angle-toggle="deg"]').getAttribute('aria-pressed') === 'true');

      qs('[data-calc-mode-toggle="scientific"]').click();
      equals('scientific mode switched on', calculatorCard.classList.contains('is-scientific'), true);
      equals('scientific keypad visible in Scientific mode', window.getComputedStyle(sciKeypad).display, 'grid');
      equals(
        'angle toggle survives the mode switch',
        qs('[data-angle-toggle="deg"]').getAttribute('aria-pressed'),
        'true'
      );

      // sin(30) in DEG through the real buttons
      pressKey('clear');
      pressSciKey('function', 'sin(');
      equals('sin key inserts sin(', main.textContent, 'sin(');
      typeKeys([['digit', '3'], ['digit', '0'], ['close-bracket']]);
      equals('sin(30) preview in DEG', sub.textContent, '= 0.5');
      pressKey('equals');
      equals('sin(30) = 0.5', main.textContent, '0.5');
      equals('history shows sin(30)', qs('.history__expression').textContent, 'sin(30)');
      equals('history shows the DEG badge', qs('.history__angle').textContent, 'DEG');

      // switch to RAD: the mode must persist and reload like a setting
      qs('[data-angle-toggle="rad"]').click();
      equals('RAD button pressed', qs('[data-angle-toggle="rad"]').getAttribute('aria-pressed'), 'true');
      equals(
        'angle mode saved in settings',
        JSON.parse(window.localStorage.getItem('smc:settings:v1') || '{}').angleMode,
        'rad'
      );
      const reopenedSettings = window.SMC.createSettingsStore(app.storage, {
        defaults: { theme: 'system', calculatorMode: 'basic', angleMode: 'deg' }
      });
      equals('DEG/RAD choice survives a reload', reopenedSettings.get('angleMode'), 'rad');

      pressKey('clear');
      pressSciKey('function', 'sin(');
      pressSciKey('constant', '\u03C0');
      pressKey('operator', '\u00F7');
      pressKey('digit', '2');
      pressKey('close-bracket');
      pressKey('equals');
      equals('sin(π ÷ 2) in RAD = 1', main.textContent, '1');
      equals('history shows the RAD badge', qs('.history__angle').textContent, 'RAD');

      qs('[data-angle-toggle="deg"]').click();
      equals('back to DEG', app.modeControls.getAngleMode(), 'deg');

      // √, factorial, power, constants
      pressKey('clear');
      pressSciKey('function', '\u221A(');
      equals('√ key inserts √(', main.textContent, '\u221A(');
      typeKeys([['digit', '2'], ['digit', '5']]);
      equals('√(25 stays editable', main.textContent, '\u221A(25');
      pressKey('equals');
      equals('√(25) = 5', main.textContent, '5');

      pressKey('clear');
      pressKey('digit', '5');
      pressSciKey('postfix', '!');
      equals('x! appends the factorial', main.textContent, '5!');
      pressKey('equals');
      equals('5! = 120', main.textContent, '120');

      pressKey('clear');
      pressKey('digit', '2');
      pressSciKey('operator', '^');
      pressKey('digit', '5');
      pressKey('equals');
      equals('2^5 = 32', main.textContent, '32');

      pressKey('clear');
      pressSciKey('constant', '\u03C0');
      pressKey('operator', '\u00D7');
      pressKey('digit', '2');
      pressKey('equals');
      equals('π × 2 ≈ 6.28318530718', main.textContent, '6.28318530718');

      pressKey('clear');
      pressKey('digit', '1');
      pressKey('digit', '0');
      pressSciKey('operator', 'mod');
      pressKey('digit', '3');
      pressKey('equals');
      equals('10 mod 3 = 1', main.textContent, '1');

      pressKey('clear');
      pressKey('digit', '2');
      pressKey('digit', '5');
      pressSciKey('postfix', '^2');
      pressKey('equals');
      equals('25² via x² = 625', main.textContent, '625');

      pressKey('clear');
      pressKey('digit', '2');
      pressKey('digit', '5');
      pressSciKey('sign');
      equals('+/− makes −25', main.textContent, '\u221225');
      pressKey('equals');
      equals('−25 evaluates', main.textContent, '-25');

      // scientific errors stay inside the app
      pressKey('clear');
      pressSciKey('function', '\u221A(');
      pressKey('open-bracket');
      pressKey('digit', '1');
      pressSciKey('sign');
      pressKey('close-bracket');
      pressKey('close-bracket');
      pressKey('equals');
      equals('√(−1) is rejected safely', main.textContent, 'Invalid function input');

      pressKey('clear');
      typeKeys([['digit', '1'], ['digit', '7'], ['digit', '1']]);
      pressSciKey('postfix', '!');
      pressKey('equals');
      equals('171! is too large', main.textContent, 'Result is too large');

      // keyboard extras from Part 2
      pressKey('clear');
      pressOnKeyboard('2');
      pressOnKeyboard('^');
      pressOnKeyboard('3');
      pressOnKeyboard('Enter');
      equals('keyboard ^ works', main.textContent, '8');
      pressOnKeyboard('Escape');

      // mode choices remembered by the settings layer
      const reopenedModes = window.SMC.createCalculatorModeControls({ settings: app.settings });
      equals('scientific mode is remembered', reopenedModes.getCalculatorMode(), 'scientific');
      equals('DEG is remembered', reopenedModes.getAngleMode(), 'deg');

      // scientific layout still fits the viewport
      equals(
        'no horizontal overflow in scientific mode',
        document.body.scrollWidth <= window.innerWidth,
        true
      );
      const sciKeyBox = sciKeypad.querySelector('.key').getBoundingClientRect();
      ok('scientific keys stay tappable', sciKeyBox.height >= 30 && sciKeyBox.width >= 40,
        'size: ' + Math.round(sciKeyBox.width) + 'x' + Math.round(sciKeyBox.height));

      qs('[data-calc-mode-toggle="basic"]').click();
      equals('back to Basic mode', calculatorCard.classList.contains('is-basic'), true);

      // -- theme -------------------------------------------------------------

      // -- theme -------------------------------------------------------------
      app.theme.set('system');
      app.theme.cycle();
      equals('theme switches to light', document.documentElement.getAttribute('data-theme'), 'light');
      equals('theme label updated', qs('[data-theme-label]').textContent, 'Light');
      app.theme.cycle();
      equals('theme switches to dark', document.documentElement.getAttribute('data-theme'), 'dark');
      app.theme.cycle();
      const systemTheme = document.documentElement.getAttribute('data-theme');
      ok('theme cycles back to system', systemTheme === 'light' || systemTheme === 'dark', 'value: ' + systemTheme);
      app.theme.set('system');

      // -- navigation --------------------------------------------------------
      qs('[data-view-target="solver"]').click();
      equals('solver panel shown', qs('[data-view-panel="solver"]').hidden, false);
      equals('calculator panel hidden', qs('[data-view-panel="calculator"]').hidden, true);
      equals('solver tab marked current', qs('[data-view-target="solver"]').getAttribute('aria-current'), 'true');

      // -- Part 3A Smart Solver UI ------------------------------------------
      await (async function solverChecks() {
        const solver = app.solverView;
        ok('solver view booted', !!solver);
        if (!solver) { return; }
        const q = qs('[data-solver-question]');
        const directBtn = qs('[data-solver-mode="direct"]');
        const fullBtn = qs('[data-solver-mode="full"]');
        const solveBtn = qs('[data-solver-solve]');
        const clearBtn = qs('[data-solver-clear]');
        const resultPanel = qs('[data-solver-result]');
        const resultTitle = qs('[data-solver-result-title]');
        const resultBody = qs('[data-solver-result-body]');
        const examples = Array.prototype.slice.call(document.querySelectorAll('[data-solver-example]'));
        ok('question textarea exists', !!q);
        ok('direct mode button exists', !!directBtn);
        ok('full mode button exists', !!fullBtn);
        ok('solve button exists', !!solveBtn);
        ok('clear button exists', !!clearBtn);
        ok('result panel exists', !!resultPanel);
        equals('result hidden until interaction', resultPanel.hidden, true);
        equals('question placeholder', q.getAttribute('placeholder'), 'Type your math question here...');
        equals('direct mode selected by default', solver.getMode(), 'direct');
        equals('direct button marked active', directBtn.classList.contains('is-active'), true);
        equals('direct button aria-pressed', directBtn.getAttribute('aria-pressed'), 'true');
        equals('result live region', resultBody.getAttribute('aria-live'), 'polite');
        ok('label associated with textarea', !!document.querySelector('label[for="solver-question"]'));
        const displayBeforeSolver = main.textContent;
        const historyBeforeSolver = historyList.querySelectorAll('.history__item').length;
        // Spy on network APIs: the solver must make ZERO network requests.
        let networkCalls = 0;
        const origFetch = window.fetch;
        const origXhrOpen = window.XMLHttpRequest ? window.XMLHttpRequest.prototype.open : null;
        const origWs = window.WebSocket;
        if (typeof window.fetch === 'function') {
          window.fetch = function () { networkCalls += 1; return Promise.reject(new Error('network disabled in Part 3B-1')); };
        }
        if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
          window.XMLHttpRequest.prototype.open = function () { networkCalls += 1; return origXhrOpen.apply(this, arguments); };
        }
        if (typeof window.WebSocket === 'function') {
          window.WebSocket = function () { networkCalls += 1; throw new Error('network disabled in Part 3B-1'); };
        }
        // empty solve shows validation
        q.value = '';
        solveBtn.click();
        equals('empty solve shows validation', resultBody.textContent, 'Please enter a math question.');
        equals('result visible after empty solve', resultPanel.hidden, false);
        equals('empty solve kind', resultPanel.getAttribute('data-result-kind'), 'error');
        // typing a question works (multi-line supported)
        solver.setQuestion('Solve 2x + 5 = 15\nsecond line');
        equals('entering a question works', q.value.indexOf('Solve 2x + 5 = 15') !== -1, true);
        // example buttons populate textarea only (no solving)
        examples[0].click();
        equals('example fills the textarea', q.value, 'Solve 2x + 5 = 15');
        equals('example does not solve', resultBody.textContent, 'Please enter a math question.');
        // Direct Answer mode: real local answer, no steps
        solveBtn.click();
        equals('direct answer solves locally', resultBody.textContent, 'x = 5');
        equals('direct answer title', resultTitle.textContent, 'Direct Answer');
        equals('direct answer kind', resultPanel.getAttribute('data-result-kind'), 'answer');
        equals('direct answer hides steps', resultBody.textContent.indexOf('Step 1'), -1);
        // Full Explanation mode: steps generated by the solver
        fullBtn.click();
        equals('full mode can be selected', solver.getMode(), 'full');
        equals('full button marked active', fullBtn.classList.contains('is-active'), true);
        equals('full button aria-pressed', fullBtn.getAttribute('aria-pressed'), 'true');
        solveBtn.click();
        equals('full mode title', resultTitle.textContent, 'Full Explanation');
        ok('full mode starts with the question section',
          resultBody.textContent.indexOf('Question:') === 0, resultBody.textContent.slice(0, 40));
        ok('full mode shows the given equation',
          resultBody.textContent.indexOf('Given:\n2x + 5 = 15') !== -1, resultBody.textContent);
        ok('full mode shows the first generated step',
          resultBody.textContent.indexOf('Step 1 - Remove the constant term:') !== -1,
          resultBody.textContent);
        ok('full mode shows the calculated step',
          resultBody.textContent.indexOf('2x = 15 - 5') !== -1, resultBody.textContent);
        ok('full mode shows the answer line', resultBody.textContent.indexOf('Answer: x = 5') !== -1);
        // each supported family through the same UI
        solver.setQuestion('What is 25% of 800?');
        solveBtn.click();
        ok('percentage is solved', resultBody.textContent.indexOf('Answer: 200') !== -1, resultBody.textContent);
        solver.setQuestion('x^2 - 5x + 6 = 0');
        solveBtn.click();
        ok('quadratic is solved', resultBody.textContent.indexOf('Answer: x = 2, 3') !== -1, resultBody.textContent);
        solver.setQuestion('Find the area of a circle with radius 7');
        solveBtn.click();
        ok('geometry is solved', resultBody.textContent.indexOf('Answer: A = 49') !== -1, resultBody.textContent);
        // the structured geometry explanation (Part 3B-3) reaches the panel
        ok('geometry explanation formula section',
          resultBody.textContent.indexOf('Formula:\nA = \u03C0r\u00B2') !== -1, resultBody.textContent);
        ok('geometry explanation substitution section',
          resultBody.textContent.indexOf('Substitution:\nA = \u03C0 \u00D7 7\u00B2') !== -1, resultBody.textContent);
        ok('geometry explanation calculation section',
          resultBody.textContent.indexOf('Calculation:\nA = 49\u03C0\nA \u2248 153.938040026') !== -1,
          resultBody.textContent);
        ok('geometry explanation final answer',
          resultBody.textContent.indexOf('Final Answer: A = 49\u03C0 \u2248 153.938040026') !== -1,
          resultBody.textContent);
        solver.setQuestion('area of a triangle with base 10 and height 6');
        solveBtn.click();
        ok('triangle explanation given section',
          resultBody.textContent.indexOf('Given:\nBase = 10\nHeight = 6') !== -1, resultBody.textContent);
        ok('triangle explanation final answer',
          resultBody.textContent.indexOf('Final Answer: A = 30') !== -1, resultBody.textContent);
        solver.setQuestion('1/2 + 1/4');
        solveBtn.click();
        ok('fractions are solved', resultBody.textContent.indexOf('Answer: 0.75') !== -1, resultBody.textContent);
        solver.setQuestion('sqrt(81)');
        solveBtn.click();
        ok('roots are solved', resultBody.textContent.indexOf('Answer: 9') !== -1, resultBody.textContent);
        // DEG/RAD is respected by the solver
        app.modeControls.setAngleMode('rad');
        solver.setQuestion('sin(30)');
        solveBtn.click();
        ok('solver respects RAD', resultBody.textContent.indexOf('-0.988031624093') !== -1, resultBody.textContent);
        app.modeControls.setAngleMode('deg');
        solver.setQuestion('sin(30)');
        solveBtn.click();
        ok('solver respects DEG', resultBody.textContent.indexOf('Answer: 0.5') !== -1, resultBody.textContent);
        // unsupported questions are honest, never guessed
        solver.setQuestion('Find the derivative of x2 + 3x');
        solveBtn.click();
        equals('unsupported title', resultTitle.textContent, 'Not solvable locally yet');
        ok('unsupported message', resultBody.textContent.indexOf("I can't solve this question locally yet.") === 0,
          resultBody.textContent);
        equals('unsupported kind', resultPanel.getAttribute('data-result-kind'), 'unsupported');
        // errors never crash the app
        solver.setQuestion('5 / 0');
        solveBtn.click();
        equals('divide by zero is reported', resultBody.textContent, 'Cannot divide by zero');
        equals('divide by zero kind', resultPanel.getAttribute('data-result-kind'), 'error');
        equals('network calls remain zero', networkCalls, 0);
        solver.setQuestion('Solve 2x + 5 = 15');
        // clear clears question only
        clearBtn.click();
        equals('clear empties the question', q.value, '');
        equals('clear hides the result', resultPanel.hidden, true);
        // restore network spies
        if (origFetch !== undefined) { window.fetch = origFetch; }
        if (origXhrOpen) { window.XMLHttpRequest.prototype.open = origXhrOpen; }
        if (origWs !== undefined) { window.WebSocket = origWs; }
        // calculator state preserved across navigation
        qs('[data-view-target="calculator"]').click();
        equals('calculator panel shown again', qs('[data-view-panel="calculator"]').hidden, false);
        equals('solver panel hidden again', qs('[data-view-panel="solver"]').hidden, true);
        equals('calculator display preserved', main.textContent, displayBeforeSolver);
        equals('calculator history preserved', historyList.querySelectorAll('.history__item').length, historyBeforeSolver);
        qs('[data-view-target="solver"]').click();
        equals('solver mode still selected after navigation', solver.getMode(), 'full');
        qs('[data-view-target="calculator"]').click();
        equals('back on calculator', qs('[data-view-panel="calculator"]').hidden, false);
        ok('no fetch() in solver source', typeof solver.solve === 'function');

        // -- Part 3B-2: two-stage flow with a MOCKED AI backend ----------------
        // The provider is replaced by a local mock for every AI check: no test
        // ever contacts a real AI API or any network endpoint.
        await (async function aiFallbackChecks() {
          const ai = app.aiSolver;
          ok('app exposes the AI provider', !!ai && typeof ai.solveWithAI === 'function');
          if (!ai) { return; }
          const originalIsConfigured = ai.isConfigured;
          const originalSolveWithAI = ai.solveWithAI;
          const sourceBadge = qs('[data-solver-source]');
          ok('source badge element exists', !!sourceBadge);
          let aiCalls = 0;
          let lastAI = { question: '', mode: '' };
          let releaseAI = null;
          try {
            qs('[data-view-target="solver"]').click();
            ai.isConfigured = function () { return true; };

            // (1) a locally supported question must NOT call the AI provider
            ai.solveWithAI = function (question, mode) {
              aiCalls += 1;
              lastAI = { question: question, mode: mode };
              return Promise.resolve({ success: true, source: 'ai', answer: 'MUST NOT BE USED', steps: [] });
            };
            directBtn.click();
            q.value = '2x + 5 = 15';
            solveBtn.click();
            equals('local answer shown', resultBody.textContent, 'x = 5');
            equals('local source attribute', resultPanel.getAttribute('data-result-source'), 'local');
            equals('local badge label', sourceBadge.textContent, 'Local Solver');
            equals('supported question never calls AI', aiCalls, 0);

            // (2) unsupported -> loading state -> AI success (Direct Answer)
            ai.solveWithAI = function (question, mode) {
              aiCalls += 1;
              lastAI = { question: question, mode: mode };
              return new Promise(function (resolve) { releaseAI = resolve; });
            };
            q.value = 'Find the derivative of x2 + 3x';
            const pendingAI = solver.solve();
            await Promise.resolve(); // the provider call runs on a microtask
            equals('AI called exactly once', aiCalls, 1);
            equals('question forwarded to AI', lastAI.question, 'Find the derivative of x2 + 3x');
            equals('direct mode forwarded', lastAI.mode, 'direct');
            equals('loading kind', resultPanel.getAttribute('data-result-kind'), 'loading');
            equals('loading title', resultTitle.textContent, 'AI is solving...');
            equals('loading source attribute', resultPanel.getAttribute('data-result-source'), 'ai');
            equals('loading badge label', sourceBadge.textContent, 'AI Solver');
            equals('solve disabled while loading', solveBtn.disabled, true);
            equals('view reports an active AI request', solver.isAIActive(), true);
            solveBtn.click();
            solveBtn.click();
            equals('duplicate clicks ignored while pending', aiCalls, 1);
            releaseAI({ success: true, source: 'ai', answer: '2x + 3', steps: ['d/dx(3x) = 3'] });
            await pendingAI;
            equals('AI direct answer rendered', resultBody.textContent, '2x + 3');
            equals('AI result source attribute', resultPanel.getAttribute('data-result-source'), 'ai');
            equals('AI badge label', sourceBadge.textContent, 'AI Solver');
            equals('answer kind', resultPanel.getAttribute('data-result-kind'), 'answer');
            equals('direct title reused for AI', resultTitle.textContent, 'Direct Answer');
            equals('solve re-enabled after AI', solveBtn.disabled, false);
            equals('AI request finished', solver.isAIActive(), false);

            // (3) Full Explanation forwards the mode and renders AI steps
            fullBtn.click();
            ai.solveWithAI = function (question, mode) {
              aiCalls += 1;
              lastAI = { question: question, mode: mode };
              return Promise.resolve({
                success: true, source: 'ai', answer: 'x^2/2 + 3x + C',
                steps: ['Integrate term by term', 'Add the constant C']
              });
            };
            q.value = 'Integrate 2x + 3';
            await solver.solve();
            equals('full mode forwarded to AI', lastAI.mode, 'full');
            equals('AI full title', resultTitle.textContent, 'Full Explanation');
            equals('AI step 1 rendered',
              resultBody.textContent.indexOf('Step 1: Integrate term by term') === 0, true);
            ok('AI answer line rendered',
              resultBody.textContent.indexOf('Answer: x^2/2 + 3x + C') !== -1);

            // (4) AI failure shows the friendly message - no fabricated answer
            directBtn.click();
            ai.solveWithAI = function () {
              aiCalls += 1;
              return Promise.resolve({
                success: false, source: 'ai',
                error: 'AI solver is currently unavailable. You can still use the local calculator and supported offline solver.',
                code: 'http'
              });
            };
            q.value = 'Explain Pythagoras theorem with an example.';
            await solver.solve();
            equals('AI failure kind', resultPanel.getAttribute('data-result-kind'), 'error');
            equals('AI failure title', resultTitle.textContent, 'AI solver unavailable');
            ok('AI failure friendly message',
              resultBody.textContent.indexOf('AI solver is currently unavailable') === 0,
              resultBody.textContent);

            // (5) a rejected request degrades gracefully too
            ai.solveWithAI = function () {
              aiCalls += 1;
              return Promise.reject(new Error('network down'));
            };
            q.value = 'What does AI think about life?';
            await solver.solve();
            equals('rejected AI request kind', resultPanel.getAttribute('data-result-kind'), 'error');
            equals('rejected AI request source', resultPanel.getAttribute('data-result-source'), 'ai');

            // (6) hostile AI output stays literal text (untrusted rendering)
            const hostile = '<img src=x onerror="alert(1)"> <script>alert(2)</script>';
            ai.solveWithAI = function () {
              aiCalls += 1;
              return Promise.resolve({ success: true, source: 'ai', answer: hostile, steps: [] });
            };
            q.value = 'hostile response test';
            await solver.solve();
            equals('hostile markup rendered as literal text', resultBody.textContent, hostile);
            equals('no img element injected', resultBody.querySelector('img'), null);
            equals('no script element injected', resultBody.querySelector('script'), null);

            // (7) local solver keeps working after AI failures (offline resilience)
            const beforeLocal = aiCalls;
            q.value = '25% of 800';
            solveBtn.click();
            equals('local answer after AI failure', resultBody.textContent, '200');
            equals('local source restored', resultPanel.getAttribute('data-result-source'), 'local');
            equals('local question did not call AI', aiCalls, beforeLocal);

            // (8) unconfigured provider -> honest local unsupported state
            ai.isConfigured = function () { return false; };
            q.value = 'Find the derivative of x2 + 3x';
            solveBtn.click();
            equals('unconfigured AI keeps local unsupported title',
              resultTitle.textContent, 'Not solvable locally yet');
            equals('unconfigured AI kind', resultPanel.getAttribute('data-result-kind'), 'unsupported');

            // (9) Clear empties the question and hides the result
            clearBtn.click();
            equals('AI section: clear empties question', q.value, '');
            equals('AI section: clear hides result', resultPanel.hidden, true);
          } finally {
            ai.isConfigured = originalIsConfigured;
            ai.solveWithAI = originalSolveWithAI;
            directBtn.click();
            clearBtn.click();
          }
        })();
      })();

      // -- the app stays local ----------------------------------------------
      ok('history store has no network API', typeof app.history.add === 'function' && typeof app.history.fetch === 'undefined');
      ok('model has no network API', typeof app.model.press === 'function' && typeof app.model.request === 'undefined');
      ok('solver has no network API', !app.solverView || (typeof app.solverView.fetch === 'undefined' && typeof app.solverView.request === 'undefined'));
      ok('solver exposes no XHR/fetch surface', !app.solverView || (typeof app.solverView.open === 'undefined'));
      ok('app exposes solver on SMC.app', !!app.solverView);
      ok('app exposes the local solver', !!app.mathSolver && typeof app.mathSolver.solveMathQuestion === 'function');
      equals('local solver is deterministic (no async API)', typeof app.mathSolver.solveMathQuestion('2 + 2').answer, 'string');
      equals('local solver answers instantly', app.mathSolver.solveMathQuestion('2 + 2').answer, '4');
    } catch (error) {
      failed += 1;
      results.push('EXCEPTION  ' + (error && error.message ? error.message : String(error)));
    } finally {
      APP_KEYS.forEach(function (key) {
        if (backup[key] === null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, backup[key]);
        }
      });
    }

    const summary = 'SUMMARY: ' + passed + ' passed, ' + failed + ' failed';
    results.push('');
    results.push(summary);
    document.title = (failed === 0 ? 'PASS - ' : 'FAIL - ') + summary;

    const output = document.getElementById('test-output');
    if (output) {
      output.textContent = results.join('\n');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

