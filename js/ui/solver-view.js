/**
 * Smart Math Calculator - Smart Solver view (Part 3A UI + Part 3B-1 local solver
 * + Part 3B-2 AI fallback)
 * -----------------------------------------------------------------------------
 * Two-stage solving flow:
 *
 *   question -> Stage 1: local deterministic solver (js/services/math-solver.js)
 *                 supported   -> render local answer        (source: 'local')
 *                 unsupported -> Stage 2: optional AI provider
 *                                (js/services/ai-math-solver.js, only when an
 *                                endpoint is configured)
 *                                "AI is solving..." -> AI answer (source: 'ai')
 *
 * This file performs no maths itself and never touches the network directly:
 * the optional AI fallback goes through the injected aiSolver provider, so the
 * calculator / scientific calculator stay fast and local. All result text is
 * rendered via textContent - AI output is untrusted plain text, never HTML.
 *
 * Result kinds: 'idle' | 'loading' | 'answer' | 'unsupported' | 'error'
 *
 * Exposed API: SMC.createSolverView({ solver, aiSolver, getAngleMode, scope }) ->
 *   { getMode, setMode, getQuestion, setQuestion, solve, clear, isAIActive,
 *     getResult, getSnapshot, subscribe }
 */
(function (root) {
  'use strict';
  const SMC = (root.SMC = root.SMC || {});
  const dom = SMC.dom;
  const MODES = ['direct', 'full'];
  const DEFAULT_MODE = 'direct';
  const EMPTY_MESSAGE = 'Please enter a math question.';
  const UNAVAILABLE_MESSAGE = 'The local solver is not loaded.';
  const INVALID_RESULT_MESSAGE = 'The local solver could not handle this question.';
  const MODE_TITLES = { direct: 'Direct Answer', full: 'Full Explanation' };
  const UNSUPPORTED_TITLE = 'Not solvable locally yet';
  const ERROR_TITLE = 'Cannot solve';
  // Part 3B-2: AI fallback states. The message is deliberately friendly and
  // points back to everything that keeps working offline.
  const SOURCE_LOCAL = 'local';
  const SOURCE_AI = 'ai';
  const SOURCE_LABELS = { local: 'Local Solver', ai: 'AI Solver' };
  const LOADING_TITLE = 'AI is solving...';
  const LOADING_MESSAGE =
    'The question was sent to the AI solver. The calculator stays fully usable while you wait.';
  const AI_ERROR_TITLE = 'AI solver unavailable';
  const AI_UNAVAILABLE_MESSAGE =
    'AI solver is currently unavailable. You can still use the local calculator and supported offline solver.';
  /** Builds the "Step n: ..." listing plus the answer line. */
  function buildExplanation(outcome, labels) {
    const prefix = (labels && labels.step) || function (n) { return 'Step ' + n + ': '; };
    const answerLabel = (labels && labels.answer) || function () { return 'Answer: '; };
    const steps = Array.isArray(outcome.steps) ? outcome.steps : [];
    const lines = [];
    steps.forEach(function (step, index) {
      lines.push(prefix(index + 1) + step);
    });
    if (outcome.answer) {
      if (lines.length) { lines.push(''); }
      lines.push(answerLabel() + outcome.answer);
    }
    return lines.join('\n');
  }
  /**
   * Part 3B-4: the AI is asked to label each part of a full explanation
   * ("Concept: ...", "Formula: ...", "Common mistake: ..."). When every step
   * carries such a label, rendering them as titled sections reads far better
   * than "Step 4: Concept: ...". Replies whose steps are plain (older or
   * simpler providers) keep the numbered "Step n:" layout below.
   */
  // Phase 2D/2E formatting: a section title may be written in ANY language
  // (Hindi, Roman Hindi, Telugu, Roman Telugu), and its body may span several
  // lines so equations can sit on their own lines. The title is whatever comes
  // before the FIRST colon on the first line, so "Given: ..." and
  // "दिया गया: ..." both work. A step with no colon at all still returns null
  // and keeps the existing numbered "Step n:" layout.
  const LABELLED_STEP = /^([^\n:]{1,60}):\s*([\s\S]+)$/;
  function splitLabelledStep(step) {
    const match = LABELLED_STEP.exec(String(step).trim());
    if (!match) { return null; }
    const text = String(match[2] || '').trim();
    if (!text) { return null; }
    return { title: match[1].trim(), text: text };
  }
  function buildAIExplanation(outcome, labels) {
    const prefix = (labels && labels.step) || function (n) { return 'Step ' + n + ': '; };
    const answerLabel = (labels && labels.answer) || function () { return 'Answer: '; };
    const steps = Array.isArray(outcome.steps) ? outcome.steps : [];
    if (steps.length < 3) { return buildExplanation(outcome, labels); }
    const parts = [];
    for (let i = 0; i < steps.length; i += 1) {
      const part = splitLabelledStep(steps[i]);
      if (!part) { return buildExplanation(outcome); }
      parts.push(part);
    }
    const lines = [];
    parts.forEach(function (part) {
      if (lines.length) { lines.push(''); }
      lines.push(part.title + ':');
      lines.push(part.text);
    });
    if (outcome.answer) {
      lines.push('');
      lines.push(answerLabel() + outcome.answer);
    }
    return lines.join('\n');
  }
  /** Part 3B-3: renders the structured explanation as plain labeled sections. */
  function buildDetailedExplanation(outcome, labels) {
    const stepPrefix2 = (labels && labels.step) || function (n) { return 'Step ' + n; };
    // Phase 2D: the section HEADINGS are translated. Every VALUE below them
    // (the given expression, the formula, each step line, the final answer) is
    // produced by the solver and is inserted as plain text, never translated.
    const label = (labels && labels.section) || function (key, fallback) { return fallback; };
    const e = (outcome && outcome.explanation) || {};
    const lines = [];
    function blank() { if (lines.length) { lines.push(''); } }
    function section(title, value) {
      if (value === undefined || value === null) { return; }
      const text = String(value);
      if (!text) { return; }
      blank();
      lines.push(title + ':');
      lines.push(text);
    }
    function listSection(title, items) {
      if (!Array.isArray(items) || !items.length) { return; }
      blank();
      lines.push(title + ':');
      items.forEach(function (item) { lines.push(String(item)); });
    }
    if (outcome && outcome.question) {
      lines.push(label('solver.section.question', 'Question') + ':');
      lines.push(String(outcome.question));
    }
    section(label('solver.section.given', 'Given'), e.given);
    section(label('solver.section.toFind', 'To Find'), e.find);
    section(label('solver.section.concept', 'Concept'), e.concept);
    section(label('solver.section.formula', 'Formula'), e.formula);
    section(label('solver.section.expression', 'Expression'), e.expression);
    listSection(label('solver.section.substitution', 'Substitution'), e.substitutions);
    listSection(label('solver.section.calculation', 'Calculation'), e.calculations);
    if (Array.isArray(e.steps)) {
      e.steps.forEach(function (step, index) {
        if (!step) { return; }
        const title = step.title
          ? stepPrefix2(index + 1) + ' - ' + step.title
          : stepPrefix2(index + 1);
        const stepLines = Array.isArray(step.lines) ? step.lines : [step];
        blank();
        lines.push(title + ':');
        stepLines.forEach(function (line) { lines.push(String(line)); });
      });
    }
    listSection(label('solver.section.verification', 'Verification'), e.verification);
    blank();
    lines.push(label('solver.section.finalAnswer', 'Final Answer') + ': ' +
      (e.finalAnswer || (outcome && outcome.answer) || ''));
    return lines.join('\n');
  }
  function normalizeMode(value) {
    return MODES.indexOf(value) === -1 ? DEFAULT_MODE : value;
  }
  function createSolverView(options) {
    const config = options || {};
    const scope = config.scope || document;
    // Phase 2C: optional i18n. It translates the surrounding UI chrome ONLY -
    // titles, source badges, the "Step n:"/"Answer:" labels and the status
    // messages. The mathematical explanation text itself, local solver prose and
    // any AI answer are passed through untouched (Phase 2D / 2E).
    const i18n = config.i18n || null;
    const t = function (key, fallback, params) {
      if (!i18n) { return fallback; }
      const value = params ? i18n.t(key, params) : i18n.t(key);
      return typeof value === 'string' && value !== '' ? value : fallback;
    };
    const TITLE = {
      unsupported: function () { return t('solver.title.unsupported', UNSUPPORTED_TITLE); },
      error: function () { return t('solver.title.error', ERROR_TITLE); },
      aiError: function () { return t('solver.title.aiError', AI_ERROR_TITLE); },
      loading: function () { return t('solver.title.loading', LOADING_TITLE); },
      questionNeeded: function () { return t('solver.title.questionNeeded', 'Question needed'); },
      direct: function () { return t('solver.mode.direct', MODE_TITLES.direct); },
      full: function () { return t('solver.mode.full', MODE_TITLES.full); }
    };
    const MSG = {
      empty: function () { return t('solver.msg.empty', EMPTY_MESSAGE); },
      notLoaded: function () { return t('solver.msg.notLoaded', UNAVAILABLE_MESSAGE); },
      invalid: function () { return t('solver.msg.invalid', INVALID_RESULT_MESSAGE); },
      loading: function () { return t('solver.msg.loading', LOADING_MESSAGE); },
      aiUnavailable: function () { return t('solver.msg.aiUnavailable', AI_UNAVAILABLE_MESSAGE); }
    };
    const SOURCE_TEXT = {
      local: function () { return t('solver.source.local', SOURCE_LABELS.local); },
      ai: function () { return t('solver.source.ai', SOURCE_LABELS.ai); }
    };
    const stepPrefix = function (index) {
      return t('solver.step.prefix', 'Step ' + index + ': ', [index]);
    };
    const answerPrefix = function () {
      return t('solver.answer.prefix', 'Answer: ');
    };
    // Phase 2D: the detailed-explanation section headings.
    const sectionLabel = function (key, fallback) {
      return t(key, fallback);
    };
    const host = dom.qs('[data-solver]', scope);
    if (!host) { return null; }
    const solver = config.solver || null;
    const aiSolver = config.aiSolver || null;
    const getAngleMode = typeof config.getAngleMode === 'function' ? config.getAngleMode : null;
    const questionEl = dom.qs('[data-solver-question]', host);
    const modeButtons = dom.qsa('[data-solver-mode]', host);
    const solveButton = dom.qs('[data-solver-solve]', host);
    const clearButton = dom.qs('[data-solver-clear]', host);
    const resultEl = dom.qs('[data-solver-result]', host);
    const resultTitleEl = dom.qs('[data-solver-result-title]', host);
    const resultBodyEl = dom.qs('[data-solver-result-body]', host);
    const resultSourceEl = dom.qs('[data-solver-source]', host);
    const exampleButtons = dom.qsa('[data-solver-example]', host);
    // Math Keyboard (Phase 2). It is OPTIONAL: when js/ui/math-keyboard-view.js
    // is not loaded, or the markup has no toggle/panel, createMathKeyboardView
    // simply reports isReady() === false and the solver is unaffected. The view
    // writes the textarea only through the Phase 1 insertion core, so it never
    // routes a keystroke through setQuestion().
    const mathKeyboardView = typeof SMC.createMathKeyboardView === 'function'
      ? SMC.createMathKeyboardView({ textarea: questionEl, i18n: i18n, scope: host })
      : null;
    let mode = DEFAULT_MODE;
    let result = { kind: 'idle', title: '', message: '', answer: '', steps: [], solverKind: '', source: '' };
    const listeners = [];
    // One monotonic counter is the whole stale-response mechanism. `activeRequest`
    // is the request that currently owns the screen; every other in-flight
    // request is superseded and its response is silently ignored. This replaces
    // the old `aiPending` promise slot plus the global `aiDiscard` flag, which
    // together let an older response paint over a newer question and let a
    // discarded request permanently block the next legitimate one.
    let requestSeq = 0;
    let activeRequest = null;   // { token, question, mode, promise } | null
    function getSnapshot() {
      return {
        mode: mode,
        question: questionEl ? questionEl.value : '',
        resultKind: result.kind,
        resultTitle: result.title,
        resultMessage: result.message,
        resultSource: result.source
      };
    }
    function notify() {
      const snapshot = getSnapshot();
      for (let i = 0; i < listeners.length; i += 1) { listeners[i](snapshot); }
      return snapshot;
    }
    function reflectModes() {
      modeButtons.forEach(function (button) {
        const isActive = button.getAttribute('data-solver-mode') === mode;
        dom.setClass(button, 'is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }
    function showResult(kind, title, message, details) {
      const extra = details || {};
      const source = extra.source || '';
      result = {
        kind: kind,
        title: title,
        message: message,
        answer: extra.answer || '',
        steps: extra.steps || [],
        solverKind: extra.solverKind || '',
        source: source
      };
      if (resultEl) {
        dom.show(resultEl);
        resultEl.setAttribute('data-result-kind', kind);
        resultEl.setAttribute('data-result-source', source);
        dom.setClass(resultEl, 'solver__result--error', kind === 'error');
        dom.setClass(resultEl, 'solver__result--unsupported', kind === 'unsupported');
        dom.setClass(resultEl, 'solver__result--loading', kind === 'loading');
        dom.setClass(resultEl, 'solver__result--info', kind === 'answer');
      }
      // Subtle "Local Solver" / "AI Solver" provenance badge (plain text only).
      if (resultSourceEl) {
        const label = (SOURCE_TEXT[source] || function () { return ''; })();
        if (label) {
          dom.setText(resultSourceEl, label);
          dom.show(resultSourceEl);
        } else {
          dom.setText(resultSourceEl, '');
          dom.hide(resultSourceEl);
        }
      }
      if (resultTitleEl) { dom.setText(resultTitleEl, title); }
      if (resultBodyEl) { dom.setText(resultBodyEl, message); }
      return notify();
    }
    function hideResult() {
      result = { kind: 'idle', title: '', message: '', answer: '', steps: [], solverKind: '', source: '' };
      if (resultEl) {
        dom.hide(resultEl);
        resultEl.setAttribute('data-result-kind', 'idle');
        resultEl.removeAttribute('data-result-source');
        dom.setClass(resultEl, 'solver__result--loading', false);
      }
      if (resultSourceEl) { dom.setText(resultSourceEl, ''); dom.hide(resultSourceEl); }
      if (resultTitleEl) { dom.setText(resultTitleEl, ''); }
      if (resultBodyEl) { dom.setText(resultBodyEl, ''); }
      return notify();
    }
    function setMode(nextMode) {
      mode = normalizeMode(nextMode);
      reflectModes();
      return notify();
    }
    function getQuestion() { return questionEl ? questionEl.value : ''; }
    function setQuestion(text) {
      if (questionEl) { questionEl.value = typeof text === 'string' ? text : ''; }
      // The displayed result now belongs to a different question (this also covers
      // the example buttons, which set the text programmatically and so do not
      // fire an `input` event).
      invalidateStaleResult();
      return notify();
    }
    /** Renders one solver outcome (success / unsupported / error) from STAGE 1. */
    function renderOutcome(outcome) {
      if (!outcome || typeof outcome !== 'object') {
        return showResult('error', TITLE.error(), MSG.invalid(), { source: 'local' });
      }

      if (outcome.status === 'success') {
        const steps = Array.isArray(outcome.steps) ? outcome.steps : [];
        if (mode === 'full') {
          const body = outcome.explanation && typeof outcome.explanation === 'object'
            ? buildDetailedExplanation(outcome, { step: stepPrefix, answer: answerPrefix, section: sectionLabel })
            : buildExplanation(outcome, { step: stepPrefix, answer: answerPrefix });
          return showResult('answer', TITLE.full(), body, {
            answer: outcome.answer || '',
            steps: steps,
            solverKind: outcome.kind || '',
            source: 'local'
          });
        }
        return showResult('answer', TITLE.direct(), String(outcome.answer || ''), {
          answer: outcome.answer || '',
          steps: steps,
          solverKind: outcome.kind || '',
          source: 'local'
        });
      }

      if (outcome.status === 'unsupported') {
        const message = outcome.hint
          ? String(outcome.message || '') + '\n' + outcome.hint
          : String(outcome.message || '');
        return showResult('unsupported', TITLE.unsupported(), message, { source: 'local' });
      }

      return showResult('error', TITLE.error(), outcome.message || MSG.invalid(), {
        source: 'local'
      });
    }

    /** The AI stage only runs when a provider is injected AND configured. */
    function aiAvailable() {
      if (!aiSolver || typeof aiSolver.solveWithAI !== 'function') { return false; }
      if (typeof aiSolver.isConfigured === 'function' && !aiSolver.isConfigured()) { return false; }
      return true;
    }
    function setSolveBusy(busy) {
      if (solveButton) { solveButton.disabled = !!busy; }
    }
    /** True when `token` is no longer the request that owns the screen. */
    function isStale(token) {
      return !activeRequest || activeRequest.token !== token;
    }
    /**
     * The question text changed, so whatever is on screen - and anything still in
     * flight - belongs to an older question. Invalidate both at once, otherwise
     * the previous answer stays visible and looks like the answer to the new
     * question. Deliberately does NOT touch the textarea, the mode, or start a
     * new request; the user still has to press Solve.
     */
    function invalidateStaleResult() {
      if (activeRequest) {
        activeRequest = null;
        setSolveBusy(false);
      }
      if (result.kind !== 'idle') { hideResult(); }
    }
    /** Renders an outcome coming from the AI provider (always source 'ai'). */
    function renderAIOutcome(res, requestMode) {
      if (res && res.success) {
        const answer = String(res.answer || '');
        const steps = Array.isArray(res.steps) ? res.steps : [];
        const details = { answer: answer, steps: steps, solverKind: 'ai', source: 'ai' };
        if (requestMode === 'full') {
          return showResult('answer', TITLE.full(),
            buildAIExplanation({ answer: answer, steps: steps }, { step: stepPrefix, answer: answerPrefix }), details);
        }
        return showResult('answer', TITLE.direct(), answer, details);
      }
      const message = res && res.error ? String(res.error) : MSG.aiUnavailable();
      return showResult('error', TITLE.aiError(), message, { source: 'ai' });
    }
    /** STAGE 2: async AI request with loading state and duplicate protection. */
    function requestAI(questionText, requestMode) {
      // A genuinely identical concurrent request reuses the same promise, which
      // is what de-duplicates a double click. A DIFFERENT question starts its own
      // request and supersedes the previous one.
      if (activeRequest && activeRequest.question === questionText &&
          activeRequest.mode === requestMode) {
        return activeRequest.promise;
      }
      requestSeq += 1;
      const token = requestSeq;
      setSolveBusy(true);
      showResult('loading', TITLE.loading(), MSG.loading(), { source: 'ai' });
      const settle = function (snapshot) {
        if (activeRequest && activeRequest.token === token) {
          activeRequest = null;
          setSolveBusy(false);
        }
        return snapshot;
      };
      const pending = Promise.resolve()
        .then(function () { return aiSolver.solveWithAI(questionText, requestMode); })
        .then(
          function (res) {
            // A superseded, edited-away or cleared response is silently ignored:
            // it must never overwrite the newer question's result, and it must
            // not re-enable a newer request that is still running.
            if (isStale(token)) { return getSnapshot(); }
            return settle(renderAIOutcome(res, requestMode));
          },
          function () {
            if (isStale(token)) { return getSnapshot(); }
            return settle(showResult('error', TITLE.aiError(), MSG.aiUnavailable(), { source: 'ai' }));
          }
        );
      activeRequest = { token: token, question: questionText, mode: requestMode, promise: pending };
      return pending;
    }

    function solve() {
      const question = getQuestion().trim();
      if (!question) {
        return showResult('error', TITLE.questionNeeded(), MSG.empty(), { source: '' });
      }
      if (!solver || typeof solver.solveMathQuestion !== 'function') {
        return showResult('error', TITLE.error(), MSG.notLoaded(), { source: '' });
      }

      const solveOptions = {};
      if (getAngleMode) {
        const angleMode = getAngleMode();
        if (angleMode === 'deg' || angleMode === 'rad') {
          solveOptions.angleMode = angleMode;
        }
      }

      let outcome = null;
      try {
        outcome = solver.solveMathQuestion(question, solveOptions);
      } catch (error) {
        outcome = null;
      }

      // Stage 1 handled it (answer or a hard local error like 5 / 0) -> stay
      // local. Only an honest "unsupported" may reach the AI fallback.
      if (outcome && outcome.status === 'unsupported' && aiAvailable()) {
        return requestAI(question, mode);
      }
      return renderOutcome(outcome);
    }
    function clear() {
      // Invalidate ONLY the request that is actually in flight, then release the
      // busy state, so the next legitimate solve starts cleanly instead of being
      // blocked by a permanently discarded request.
      invalidateStaleResult();
      setQuestion('');
      hideResult();
      if (questionEl && typeof questionEl.focus === 'function') {
        try { questionEl.focus(); } catch (error) { /* ignore */ }
      }
      return getSnapshot();
    }
    function subscribe(listener) {
      if (typeof listener !== 'function') { return function noop() {}; }
      listeners.push(listener);
      listener(getSnapshot());
      return function unsubscribe() {
        const index = listeners.indexOf(listener);
        if (index !== -1) { listeners.splice(index, 1); }
      };
    }
    modeButtons.forEach(function (button) {
      dom.on(button, 'click', function () { setMode(button.getAttribute('data-solver-mode')); });
    });
    dom.on(solveButton, 'click', function () { solve(); });
    dom.on(clearButton, 'click', function () { clear(); });
    // Editing the question must immediately retire the previous answer, otherwise
    // it stays on screen and reads as the answer to the new question.
    dom.on(questionEl, 'input', function () { invalidateStaleResult(); });
    exampleButtons.forEach(function (button) {
      dom.on(button, 'click', function () {
        const text = button.getAttribute('data-question') || button.textContent || '';
        setQuestion(String(text).trim());
        if (questionEl && typeof questionEl.focus === 'function') {
          try { questionEl.focus(); } catch (error) { /* ignore */ }
        }
      });
    });
    reflectModes();
    if (resultEl && result.kind === 'idle') { dom.hide(resultEl); }
    return {
      getMode: function () { return mode; },
      setMode: setMode,
      getQuestion: getQuestion,
      setQuestion: setQuestion,
      solve: solve,
      clear: clear,
      isAIActive: function () { return !!activeRequest; },
      getResult: function () {
        return {
          kind: result.kind,
          title: result.title,
          message: result.message,
          answer: result.answer,
          steps: result.steps.slice(),
          solverKind: result.solverKind,
          source: result.source
        };
      },
      getSnapshot: getSnapshot,
      subscribe: subscribe,
      // Phase 2: the Math Keyboard that belongs to this question box. It is
      // null when the keyboard module or its markup is absent.
      mathKeyboardView: mathKeyboardView,
      EMPTY_MESSAGE: EMPTY_MESSAGE,
      UNAVAILABLE_MESSAGE: UNAVAILABLE_MESSAGE
    };
  }
  SMC.createSolverView = createSolverView;
  SMC.SolverView = {
    MODES: MODES.slice(),
    DEFAULT_MODE: DEFAULT_MODE,
    EMPTY_MESSAGE: EMPTY_MESSAGE,
    UNAVAILABLE_MESSAGE: UNAVAILABLE_MESSAGE,
    UNSUPPORTED_TITLE: UNSUPPORTED_TITLE,
    ERROR_TITLE: ERROR_TITLE,
    LOADING_TITLE: LOADING_TITLE,
    AI_ERROR_TITLE: AI_ERROR_TITLE,
    AI_UNAVAILABLE_MESSAGE: AI_UNAVAILABLE_MESSAGE
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
