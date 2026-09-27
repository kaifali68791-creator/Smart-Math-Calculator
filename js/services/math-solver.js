/**
 * Smart Math Calculator - Local deterministic math solver (Part 3B-1)
 * -----------------------------------------------------------------------------
 * Turns a natural-language maths question into a structured solution. It is
 * COMPLETELY local, offline and deterministic:
 *
 *   * no network, no fetch/XHR/WebSocket, no API, no AI
 *   * no eval(), no new Function() - arithmetic always goes through the trusted
 *     js/core/expression-engine.js parser
 *   * no hardcoded per-example answers: every answer and every explanation step
 *     is generated from the parsed coefficients / values of the question
 *
 * If the question is outside the implemented surface the solver answers with
 * { status: 'unsupported' } instead of guessing.
 *
 * Supported surface
 *   arithmetic         2 + 3 * 4, (10 + 5) / 3, 25 * 8, 2^5, sqrt(49)
 *   fractions          1/2 + 1/4, 3/4 * 8, 1/2 of 100
 *   percentages        25% of 800, increase 500 by 10%, decrease 800 by 25%
 *   linear equations   2x + 5 = 15, 2*x + 5 = 15, 2 x + 5 = 15, 2X + 5 = 15
 *   quadratics         x^2 - 5x + 6 = 0, x² - 5x + 6 = 0, 2x^2 - 8x = 0
 *   powers / roots     2^5, 3^3, sqrt(81), cube root of 27
 *   trigonometry       sin(30), cos(60), tan(45)  (respects the DEG/RAD setting)
 *   geometry           area/circumference of a circle, area/perimeter of a
 *                      rectangle or square, area of a triangle
 *
 * Result shape (stable interface, a future Part 3B-2 solver can reuse it):
 *   { status:'success', kind, answer, steps:[...], question, expression }
 *   { status:'unsupported', message, hint, question }
 *   { status:'error', code, message, question }
 *
 * Exposed API (browser: SMC.createMathSolver, Node: module.exports)
 *   createMathSolver({ engine, format, getAngleMode }) -> { solveMathQuestion,
 *     STATUS, KINDS, MESSAGES, SUPPORTED_KINDS }
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SMC = root.SMC || {};
    root.SMC.createMathSolver = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATUS = { SUCCESS: 'success', UNSUPPORTED: 'unsupported', ERROR: 'error' };

  const KINDS = {
    ARITHMETIC: 'arithmetic',
    FRACTION: 'fraction',
    PERCENTAGE: 'percentage',
    LINEAR_EQUATION: 'linear-equation',
    QUADRATIC_EQUATION: 'quadratic-equation',
    GEOMETRY: 'geometry'
  };

  const MESSAGES = {
    empty: 'Please enter a math question.',
    tooLong: 'That question is too long for the local solver.',
    unsupported: "I can't solve this question locally yet.",
    unsupportedHint:
      'This type of question will be supported by the advanced solver in a later stage.',
    unsupportedEquation:
      "I can't solve this equation locally yet. The local solver handles equations in one " +
      'variable (x) up to degree 2.',
    malformed: 'This equation is incomplete or malformed.',
    noVariable: 'There is no variable to solve for in this question.',
    invalidExpression: 'Invalid expression.',
    incomplete: 'Expression is incomplete.',
    divideByZero: 'Cannot divide by zero.',
    overflow: 'Result is too large.',
    domain: 'Invalid function input.',
    factorial: 'Invalid factorial.',
    internal: 'The local solver could not handle this question.',
    notConnected: 'The local solver is not connected in this build.'
  };

  const MAX_QUESTION_LENGTH = 240;
  const EPS = 1e-9;
  // ---------------------------------------------------------------------------
  // Question normalisation
  // ---------------------------------------------------------------------------

  /** Normalises notation, punctuation and polite filler words. */
  function normalizeQuestion(raw) {
    let text = String(raw === null || raw === undefined ? '' : raw);
    text = text.replace(/\u00A0/g, ' ').replace(/[\r\n\t]+/g, ' ');
    text = text
      .replace(/[\u2212\u2013\u2014]/g, '-')
      .replace(/\uFF0B/g, '+')
      .replace(/[\u00D7\u22C5\u00B7]/g, '*')
      .replace(/[\u00F7\u2215]/g, '/')
      .replace(/\u221A/g, 'sqrt')
      .replace(/\u221B/g, 'cbrt')
      .replace(/\u03C0/g, 'pi')
      .replace(/\u00B2/g, '^2')
      .replace(/\u00B3/g, '^3')
      .replace(/\u00B9/g, '^1')
      .replace(/\u02C6/g, '^');
    text = text.toLowerCase();
    text = text.replace(/\bcube root of\s*/g, 'cbrt ').replace(/\bsquare root of\s*/g, 'sqrt ');
    text = text.replace(/(\d),(?=\d{3}\b)/g, '$1');
    text = text.replace(/\s+/g, ' ').trim();
    text = text.replace(/\s*:\s*/g, ' : ');
    text = text.replace(/[?.;,:]+$/g, '').trim();
    text = stripFillers(text);
    return text.replace(/^[\s:;]+/, '').trim();
  }

  const FILLER_LEAD =
    /^(?:please|kindly|can you|could you|help me|what is|what's|whats|how much is|how many is|calculate|compute|work out|evaluate|determine|find|solve for x|solve|the value of|value of|the equation|equation|the|me)\s+/;

  /** Removes repeated polite lead-ins ("what is", "solve", "find the", ...). */
  function stripFillers(text) {
    let current = text;
    for (let i = 0; i < 8; i += 1) {
      const next = current.replace(FILLER_LEAD, '');
      if (next === current) {
        break;
      }
      current = next;
    }
    return current;
  }

  /** True when the text still contains letters the grammar does not know. */
  function hasForeignWords(text) {
    const stripped = text
      .replace(/[0-9.]/g, ' ')
      .replace(/[+\-*/^%()!=<>]/g, ' ')
      .replace(
        /\b(?:asin|acos|atan|sinh|cosh|tanh|sin|cos|tan|log|ln|sqrt|cbrt|abs|mod|of|times|pi|e)\b/g,
        ' '
      )
      .replace(/x/g, ' ');
    return /[a-z]/.test(stripped);
  }

  function countOccurrences(text, character) {
    let total = 0;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === character) {
        total += 1;
      }
    }
    return total;
  }

  /** Display form of an expression: "*" -> "×", "^2"/"^3" -> "²"/"³". */
  function toDisplayExpression(text) {
    return String(text)
      .replace(/\*/g, '\u00D7')
      .replace(/\^2\b/g, '\u00B2')
      .replace(/\^3\b/g, '\u00B3')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function localFormatNumber(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return '0';
    }
    if (value === 0) {
      return '0';
    }
    const absolute = Math.abs(value);
    if (absolute >= 1e15 || absolute < 1e-9) {
      return value.toExponential(11);
    }
    const decimals = Math.max(0, 11 - Math.floor(Math.log10(absolute)));
    const text = value.toFixed(Math.min(decimals, 11)).replace(/0+$/, '').replace(/\.$/, '');
    return text === '-0' ? '0' : text;
  }
  // ---------------------------------------------------------------------------
  // Small maths helpers
  // ---------------------------------------------------------------------------

  /** Removes floating point noise and snaps values that are integers. */
  function clean(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return value;
    }
    if (Math.abs(value) < 1e-12) {
      return 0;
    }
    const snapped = Math.round(value);
    if (Math.abs(value - snapped) <= 1e-9 * Math.max(1, Math.abs(value))) {
      return snapped;
    }
    return Number(value.toPrecision(12));
  }

  function isZero(value) {
    return Math.abs(value) <= 1e-9;
  }

  function closeEnough(actual, expected) {
    const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
    return Math.abs(actual - expected) <= 1e-7 * scale;
  }

  function isNearInteger(value) {
    return Number.isFinite(value) && Math.abs(value - Math.round(value)) <= 1e-9;
  }

  /** Result factories - every branch returns one of these three shapes. */
  function success(question, kind, answer, steps, extra) {
    const result = {
      status: STATUS.SUCCESS,
      kind: kind,
      answer: answer,
      steps: Array.isArray(steps) ? steps : [],
      question: question
    };
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        result[key] = extra[key];
      });
    }
    if (result.explanation && typeof result.explanation === 'object' && !result.explanation.question) {
      result.explanation.question = question;
    }
    return result;
  }

  /**
   * Part 3B-3: blank structured explanation. Only filled sections are shown.
   * `structured: true` marks the object as the sectioned shape that
   * js/ui/solver-view.js renders with buildDetailedExplanation().
   */
  function newExplanation() {
    return {
      structured: true,
      question: '',
      given: '',
      find: '',
      concept: '',
      formula: '',
      expression: '',
      substitutions: [],
      calculations: [],
      steps: [],
      verification: [],
      finalAnswer: ''
    };
  }

  /** "2x + 5 = 15" - every line is rebuilt from the parsed coefficients. */
  function linearExplanation(leftText, rightText, left, right, b, constant, value) {
    const e = newExplanation();
    const displayLeft = toDisplayExpression(leftText);
    const displayRight = toDisplayExpression(rightText);
    e.given = displayLeft + ' = ' + displayRight;
    e.find = 'x';
    e.concept = tr('solver.linear.concept',
      'Linear equation in one variable. Undo the operations around x in ' +
      'reverse order: first remove the constant term, then undo the multiplication.');
    const steps = [];
    if (!isZero(right.b)) {
      steps.push({
        title: tr('solver.step.collectX', 'Collect the x terms on one side'),
        lines: [
          tr('solver.bothSides.subtract', 'Subtract {0} from both sides.', [termText(right.b)]),
          termText(b) + signedTerm(left.c) + ' = ' + numberText(clean(right.c))
        ]
      });
    }
    if (!isZero(left.c)) {
      const removing = left.c > 0
        ? tr('solver.bothSides.subtract', 'Subtract {0} from both sides.', [numberText(clean(left.c))])
        : tr('solver.bothSides.add', 'Add {0} to both sides.', [numberText(-clean(left.c))]);
      const sign = left.c > 0 ? ' - ' : ' + ';
      steps.push({
        title: tr('solver.step.removeConstant', 'Remove the constant term'),
        lines: [
          removing,
          termText(b) + ' = ' + numberText(clean(right.c)) + sign + numberText(Math.abs(clean(left.c))),
          termText(b) + ' = ' + numberText(constant)
        ]
      });
    }
    if (b !== 1) {
      steps.push({
        title: tr('solver.step.isolateX', 'Isolate x'),
        lines: [
          tr('solver.bothSides.divide', 'Divide both sides by {0}.', [numberText(b)]),
          'x = ' + numberText(constant) + ' / ' + numberText(b),
          'x = ' + numberText(value)
        ]
      });
    }
    if (!steps.length) {
      steps.push({ title: tr('solver.step.readOff', 'Read off the solution'), lines: [e.given] });
    }
    e.steps = steps;
    const checkLeft = clean(left.b * value + left.c);
    const checkRight = clean(right.b * value + right.c);
    if (closeEnough(checkLeft, checkRight)) {
      e.verification = [
        tr('solver.verify.substituteInto', 'Substitute x = {0} into the original equation:', [numberText(value)]),
        toDisplayExpression(substituteX(leftText, value)) + ' = ' + toDisplayExpression(substituteX(rightText, value)),
        numberText(checkLeft) + ' = ' + numberText(checkRight) + ' ✓'
      ];
    }
    e.finalAnswer = 'x = ' + numberText(value);
    return e;
  }

  /** "x² - 5x + 6 = 0" - coefficients, discriminant and roots from the solver. */
  function quadraticExplanation(a, b, c, discriminant, roots, answerText) {
    const e = newExplanation();
    const minusB = clean(-b);
    const twoA = clean(2 * a);
    e.given = quadraticDisplay(a, b, c) + ' = 0';
    e.find = 'x';
    e.concept = tr('solver.quadratic.concept',
      'Quadratic equation in one variable. Compare with the standard form, ' +
      'then apply the quadratic formula.');
    e.formula = 'x = (-b ± √(b² - 4ac)) / 2a';
    e.substitutions = [
      'Standard form: ax² + bx + c = 0',
      'a = ' + numberText(a) + ', b = ' + numberText(b) + ', c = ' + numberText(c)
    ];
    const discriminantStep = {
      title: tr('solver.step.discriminant', 'Calculate the discriminant'),
      lines: [
        'D = b² - 4ac',
        'D = (' + numberText(b) + ')² - 4(' + numberText(a) + ')(' + numberText(c) + ')',
        'D = ' + numberText(clean(b * b)) + plusMinusExpression(clean(4 * a * c)),
        'D = ' + numberText(discriminant)
      ]
    };
    if (discriminant < 0) {
      e.steps = [
        discriminantStep,
        {
          title: tr('solver.step.interpretDiscriminant', 'Interpret the discriminant'),
          lines: [tr('solver.quadratic.noRealRoots',
            'The discriminant is negative, so the equation has no real roots.')]
        }
      ];
      e.finalAnswer = answerText;
      return e;
    }
    const exactRoot = isNearInteger(Math.sqrt(discriminant));
    const rootText = numberText(clean(Math.sqrt(discriminant)));
    const applyLines = [
      'x = (' + numberText(minusB) + ' ± √' + numberText(discriminant) + ') / ' + numberText(twoA)
    ];
    if (exactRoot) {
      applyLines.push(
        'x = (' + numberText(minusB) + ' ± ' + rootText + ') / ' + numberText(twoA)
      );
    }
    if (roots.length === 2) {
      const relation = exactRoot ? ' = ' : ' ≈ ';
      applyLines.push(
        'x = (' + numberText(minusB) + ' + ' + rootText + ') / ' + numberText(twoA) + relation + numberText(roots[1])
      );
      applyLines.push(
        'x = (' + numberText(minusB) + ' - ' + rootText + ') / ' + numberText(twoA) + relation + numberText(roots[0])
      );
    } else if (roots.length === 1) {
      applyLines.push(
        'x = ' + numberText(minusB) + ' / ' + numberText(twoA) + ' = ' + numberText(roots[0])
      );
    }
    e.steps = [discriminantStep, { title: tr('solver.step.applyQuadratic', 'Apply the quadratic formula'), lines: applyLines }];
    roots.forEach(function (root) {
      const t2 = clean(a * root * root);
      const t1 = clean(b * root);
      const total = clean(t2 + t1 + c);
      if (closeEnough(total, 0)) {
        const termLine = numberText(t2) +
          (t1 < 0 ? ' - ' : ' + ') + numberText(Math.abs(t1)) +
          (c < 0 ? ' - ' : ' + ') + numberText(Math.abs(c));
        e.verification.push(
          tr('solver.verify.substituteIntoExpr', 'Substitute x = {0} into {1}:',
            [numberText(root), quadraticDisplay(a, b, c) + ' = 0']),
          termLine + ' = ' + numberText(total) + ' ✓'
        );
      }
    });
    e.finalAnswer = answerText;
    return e;
  }

  /**
   * Geometry: the real generated steps reused as formula / substitution /
   * calculation. Shared by the circle, rectangle, square and triangle solvers.
   */
  function geometryExplanation(given, find, steps, answer) {
    const e = newExplanation();
    e.given = given;
    e.find = find;
    e.concept = tr('solver.geometry.concept',
      'A direct geometry formula with the measurement given in the question.');
    e.formula = steps[0] || '';
    if (steps.length > 1) { e.substitutions = [steps[1]]; }
    e.calculations = steps.slice(2);
    e.finalAnswer = answer;
    return e;
  }

  /** "25% of 800" / "1/2 of 60" - percentage/fraction of a total. */
  function ofQuestionExplanation(isPercentage, percentText, leftText, base, steps, amount) {
    const e = newExplanation();
    const leftDisplay = toDisplayExpression(leftText);
    const baseText = numberText(base);
    if (isPercentage) {
      e.given = 'Percentage = ' + percentText + '%\nTotal = ' + baseText;
      e.concept = tr('solver.percent.concept', 'Percentage of a total value.');
      e.formula = 'Percentage Value = (Percentage / 100) \u00D7 Total';
      e.substitutions = ['= (' + percentText + ' / 100) \u00D7 ' + baseText];
    } else {
      e.given = 'Fraction = ' + leftDisplay + '\nTotal = ' + baseText;
      e.concept = tr('solver.fraction.concept', 'Fraction of a total value.');
      e.formula = 'Fraction Value = (Numerator / Denominator) \u00D7 Total';
      e.substitutions = ['= ' + leftDisplay + ' \u00D7 ' + baseText];
    }
    e.find = leftDisplay + ' of ' + baseText;
    e.calculations = steps.slice();
    e.finalAnswer = numberText(amount);
    return e;
  }

  /** "increase 500 by 10%" / "decrease 800 by 25%". */
  function changeQuestionExplanation(base, percentText, direction, rate, steps, newValue) {
    const e = newExplanation();
    const sign = direction > 0 ? '+' : '\u2212';
    e.given = 'Base = ' + numberText(base) + '\nPercentage = ' + percentText + '%';
    e.find = (direction > 0
      ? tr('solver.change.increased', 'Increased value')
      : tr('solver.change.decreased', 'Decreased value')) +
      ' ' + tr(direction > 0
        ? 'solver.change.afterIncrease'
        : 'solver.change.afterDecrease',
      direction > 0 ? 'after a {0}% increase' : 'after a {0}% decrease', [percentText]) +
      ' ' + tr(direction > 0 ? 'solver.change.wordIncrease' : 'solver.change.wordDecrease',
        direction > 0 ? 'increase' : 'decrease');
    e.concept = direction > 0
      ? tr('solver.change.conceptIncrease', 'Percent increase of a quantity.')
      : tr('solver.change.conceptDecrease', 'Percent decrease of a quantity.');
    e.formula = 'New Value = Base \u00D7 (1 ' + sign + ' Rate / 100)';
    e.substitutions = ['= ' + numberText(base) + ' \u00D7 (1 ' + sign + ' ' + numberText(rate) + ')'];
    e.calculations = steps.slice();
    e.finalAnswer = numberText(newValue);
    return e;
  }

  function unsupported(question, message, hint) {
    return {
      status: STATUS.UNSUPPORTED,
      message: message || MESSAGES.unsupported,
      hint: hint || MESSAGES.unsupportedHint,
      question: question
    };
  }

  function failure(question, code, message) {
    return {
      status: STATUS.ERROR,
      code: code,
      message: message || MESSAGES[code] || MESSAGES.invalidExpression,
      question: question
    };
  }

  /**
   * PHASE 2D - optional translator for the human-readable explanation text.
   *
   * The solver has always built one structured explanation object. That structure
   * is completely unchanged, and so is every piece of mathematics in it: parsed
   * coefficients, intermediate values, formulas, expressions, roots and the final
   * answer are still built and concatenated exactly as before, from the parsed
   * numbers only.
   *
   * Only the surrounding English prose goes through `tr()`, and every call passes
   * the original English sentence as the fallback, so with no translator (or a
   * missing key) the output is byte-identical to the pre-Phase-2D text.
   *
   * @type {?function(string, Array=):string}
   */
  let translator = null;

  /** Registers (or clears, with null) the i18n lookup. Returns the previous one. */
  function setTranslator(next) {
    const previous = translator;
    translator = typeof next === 'function' ? next : null;
    return previous;
  }

  /**
   * Translates one explanation phrase. `params` fills {0}, {1} ... with values
   * that are always numbers or already-formatted math text produced by this
   * module, never user input.
   */
  function tr(key, fallback, params) {
    if (!translator) {
      return fallback;
    }
    const value = params ? translator(key, params) : translator(key);
    return typeof value === 'string' && value !== '' ? value : fallback;
  }

  // ---------------------------------------------------------------------------
  // Polynomial extraction (works through the existing trusted engine only)
  // ---------------------------------------------------------------------------

  /** Part 3B-3 arithmetic detail: trig mode, roots, powers, fractions, groups. */
  function arithmeticExplanation(text, display, value, steps, angleMode) {
    const e = newExplanation();
    e.expression = display;
    e.calculations = steps.slice();
    e.finalAnswer = numberText(value);

    const trig = /^(sin|cos|tan)\(([^()]*)\)$/.exec(text);
    if (trig) {
      const degree = angleMode !== 'rad';
      const unit = degree ? '\u00B0' : ' radians';
      const notation = trig[1] + '(' + trig[2] + (degree ? '\u00B0' : '') + ')';
      e.expression = '';
      e.given = '\u03B8 = ' + trig[2] + unit;
      e.concept = tr('solver.trig.concept', 'Trigonometric ratio of a numeric angle, evaluated in {0} mode.',
        [tr(degree ? 'solver.trig.wordDegree' : 'solver.trig.wordRadian', degree ? 'degree' : 'radian')]);
      e.formula = trig[1] + '(\u03B8)';
      e.substitutions = [notation];
      e.calculations = [notation + ' = ' + numberText(value)];
      return e;
    }

    const root = /^sqrt\(([^()]*)\)$/.exec(text);
    if (root) {
      const arg = Number(root[1]);
      const rootValue = numberText(value);
      if (Number.isFinite(arg) && closeEnough(value * value, arg)) {
        e.concept = tr('solver.root.concept',
          'Square root: the non-negative number that multiplied by itself gives the argument.');
        e.calculations = [
          display + ' = ' + rootValue,
          rootValue + ' \u00D7 ' + rootValue + ' = ' + numberText(arg)
        ];
      }
      return e;
    }

    const power = /^(\d+)\^(\d+)$/.exec(text);
    if (power) {
      const baseN = Number(power[1]);
      const exponent = Number(power[2]);
      if (Number.isInteger(baseN) && exponent >= 2 && exponent <= 10) {
        let product = 1;
        const factors = [];
        for (let i = 0; i < exponent; i += 1) {
          product *= baseN;
          factors.push(String(baseN));
        }
        if (closeEnough(product, value)) {
          e.concept = tr('solver.power.concept', '{0} is multiplied by itself {1} times.',
            [String(baseN), String(exponent)]);
          e.calculations.push(factors.join(' \u00D7 ') + ' = ' + numberText(value));
        }
      }
      return e;
    }

    const fraction = /^(\d+)\s*\/\s*(\d+)\s*([+-])\s*(\d+)\s*\/\s*(\d+)$/.exec(text);
    if (fraction) {
      const n1 = Number(fraction[1]);
      const d1 = Number(fraction[2]);
      const op = fraction[3];
      const n2 = Number(fraction[4]);
      const d2 = Number(fraction[5]);
      if (d1 > 0 && d2 > 0) {
        const common = lcmOf(d1, d2);
        const a1 = n1 * (common / d1);
        const a2 = Math.abs((op === '+' ? 1 : -1) * n2 * (common / d2));
        const numerator = a1 + (op === '+' ? a2 : -a2);
        if (closeEnough(numerator / common, value)) {
          e.concept = tr('solver.fraction.lcmConcept',
            'Add fractions by converting them to a common denominator (the LCM).');
          e.formula = 'a/b ' + op + ' c/d using LCM(b, d) as the common denominator';
          e.calculations = [
            'LCM of ' + d1 + ' and ' + d2 + ' = ' + common,
            n1 + '/' + d1 + ' = ' + a1 + '/' + common,
            a1 + '/' + common + ' ' + op + ' ' + a2 + '/' + common + ' = ' + numerator + '/' + common,
            numerator + '/' + common + ' = ' + numberText(value)
          ];
          return e;
        }
      }
    }

    const groupSteps = parenStepLines(text, value, angleMode);
    if (groupSteps) { e.calculations = groupSteps; }
    return e;
  }

  /** Real order-of-operations lines: every group is evaluated by the engine. */
  function parenStepLines(text, finalValue, angleMode) {
    let current = text;
    const out = [];
    for (let i = 0; i < 8; i += 1) {
      const group = /\(([^()]+)\)/.exec(current);
      if (!group) { break; }
      const content = group[1];
      if (!/[0-9)]\s*[+\-*\/]\s*[0-9(-]/.test(content)) { return null; }
      const evaluated = evaluateQuiet(content, angleMode);
      if (evaluated === null) { return null; }
      out.push(content + ' = ' + numberText(evaluated));
      current = current.replace(group[0], '(' + numberText(evaluated) + ')');
    }
    if (!out.length) { return null; }
    const finalCheck = evaluateQuiet(current, angleMode);
    if (finalCheck === null || !closeEnough(finalCheck, finalValue)) { return null; }
    const tail = current.replace(/\((\d+(?:\.\d+)?)\)/g, '$1');
    out.push(toDisplayExpression(tail) + ' = ' + numberText(finalValue));
    return out;
  }

  function gcdOf(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
      const t = x % y;
      x = y;
      y = t;
    }
    return x || 1;
  }

  function lcmOf(a, b) {
    return Math.abs(a * b) / gcdOf(a, b);
  }

  function substituteX(text, value) {
    return text.replace(/x/g, '(' + value + ')');
  }

  /**
   * Reads a polynomial of degree <= 2 in x by sampling the expression through
   * the expression engine and verifying the fit at extra sample points. Returns
   * null when the text is not a polynomial of degree <= 2 (so the caller can
   * answer "unsupported" instead of guessing).
   */
  function polynomialOf(text, angleMode) {
    const samples = [1, 2, 3];
    const values = [];

    for (let i = 0; i < samples.length; i += 1) {
      const value = evaluateQuiet(substituteX(text, samples[i]), angleMode);
      if (value === null) {
        return null;
      }
      values.push(value);
    }

    const a = clean((values[2] - 2 * values[1] + values[0]) / 2);
    const b = clean(values[1] - values[0] - 3 * a);
    const c = clean(values[0] - a - b);

    const probes = [4, 5, 0, -2, -3];
    for (let i = 0; i < probes.length; i += 1) {
      const probe = probes[i];
      const actual = evaluateQuiet(substituteX(text, probe), angleMode);
      if (actual === null) {
        continue; // e.g. 1/x is undefined at x = 0
      }
      const expected = a * probe * probe + b * probe + c;
      if (!closeEnough(actual, expected)) {
        return null;
      }
    }

    return { a: a, b: b, c: c };
  }

  // ---------------------------------------------------------------------------
  // Simple linear equations
  // ---------------------------------------------------------------------------

  function termText(coefficient) {
    if (coefficient === 1) {
      return 'x';
    }
    if (coefficient === -1) {
      return '-x';
    }
    return numberText(coefficient) + 'x';
  }

  function signedTerm(value) {
    if (isZero(value)) {
      return '';
    }
    return value > 0 ? ' + ' + numberText(value) : ' - ' + numberText(-value);
  }

  function solveLinearEquation(question, leftText, rightText, left, right) {
    const b = clean(left.b - right.b);
    const constant = clean(right.c - left.c);
    const value = clean(constant / b);
    const steps = [];

    function push(text) {
      if (text && steps.indexOf(text) === -1) {
        steps.push(text);
      }
    }

    push(toDisplayExpression(leftText) + ' = ' + toDisplayExpression(rightText));

    if (!isZero(right.b)) {
      // 2x + 3 = x + 10  ->  x + 3 = 10   (x terms collected first)
      push(termText(b) + signedTerm(left.c) + ' = ' + numberText(clean(right.c)));
    }

    if (!isZero(left.c)) {
      const sign = left.c > 0 ? ' - ' : ' + ';
      push(
        termText(b) + ' = ' + numberText(clean(right.c)) + sign + numberText(Math.abs(clean(left.c)))
      );
    }

    push(termText(b) + ' = ' + numberText(constant));

    if (b !== 1) {
      push('x = ' + numberText(constant) + ' / ' + numberText(b));
    }

    push('x = ' + numberText(value));

    return success(question, KINDS.LINEAR_EQUATION, 'x = ' + numberText(value), steps, {
      expression: toDisplayExpression(leftText) + ' = ' + toDisplayExpression(rightText),
      coefficients: { a: 0, b: b, c: -constant },
      explanation: linearExplanation(leftText, rightText, left, right, b, constant, value)
    });
  }
  // ---------------------------------------------------------------------------
  // Simple quadratic equations (degree 2 polynomials)
  // ---------------------------------------------------------------------------

  function quadraticTermText(coefficient) {
    if (coefficient === 1) {
      return 'x\u00B2';
    }
    if (coefficient === -1) {
      return '-x\u00B2';
    }
    return numberText(coefficient) + 'x\u00B2';
  }

  function signedXTerm(coefficient) {
    if (isZero(coefficient)) {
      return '';
    }
    if (coefficient === 1) {
      return ' + x';
    }
    if (coefficient === -1) {
      return ' - x';
    }
    return coefficient > 0
      ? ' + ' + numberText(coefficient) + 'x'
      : ' - ' + numberText(-coefficient) + 'x';
  }

  /** "x² - 5x + 6" style standard form (only the terms that exist). */
  function quadraticDisplay(a, b, c) {
    return quadraticTermText(a) + signedXTerm(b) + signedTerm(c);
  }

  /** "25 - 24" or "25 + 4" - subtracts the b²-4ac term in display form. */
  function plusMinusExpression(value) {
    return value < 0 ? ' + ' + numberText(-value) : ' - ' + numberText(value);
  }

  function solveQuadraticEquation(question, leftText, rightText, left, right) {
    const a = clean(left.a - right.a);
    const b = clean(left.b - right.b);
    const c = clean(left.c - right.c);
    const steps = [];

    function push(text) {
      if (text && steps.indexOf(text) === -1) {
        steps.push(text);
      }
    }

    push(toDisplayExpression(leftText) + ' = ' + toDisplayExpression(rightText));
    push(quadraticDisplay(a, b, c) + ' = 0');
    push('a = ' + numberText(a) + ', b = ' + numberText(b) + ', c = ' + numberText(c));
    push('x = (-b \u00B1 \u221A(b\u00B2 - 4ac)) / 2a');

    const discriminant = clean(b * b - 4 * a * c);
    const minusB = clean(-b);
    const twoA = clean(2 * a);
    push(
      'x = (' +
        numberText(minusB) +
        ' \u00B1 \u221A(' +
        numberText(clean(b * b)) +
        plusMinusExpression(clean(4 * a * c)) +
        ')) / ' +
        numberText(twoA)
    );

    if (discriminant < 0) {
      push('The discriminant is negative, so the equation has no real roots.');
      return success(question, KINDS.QUADRATIC_EQUATION, 'No real roots', steps, {
        expression: quadraticDisplay(a, b, c) + ' = 0',
        coefficients: { a: a, b: b, c: c },
        discriminant: discriminant,
        roots: [],
        explanation: quadraticExplanation(a, b, c, discriminant, [], 'No real roots')
      });
    }

    const squareRoot = Math.sqrt(discriminant);
    const exact = isNearInteger(squareRoot);
    push(
      '\u221A' +
        numberText(discriminant) +
        (exact ? ' = ' : ' \u2248 ') +
        numberText(clean(squareRoot))
    );

    if (discriminant === 0) {
      const repeated = clean(minusB / twoA);
      push('x = ' + numberText(minusB) + ' / ' + numberText(twoA) + ' = ' + numberText(repeated));
      return success(question, KINDS.QUADRATIC_EQUATION, 'x = ' + numberText(repeated) + ' (repeated root)', steps, {
        expression: quadraticDisplay(a, b, c) + ' = 0',
        coefficients: { a: a, b: b, c: c },
        discriminant: discriminant,
        roots: [repeated],
        explanation: quadraticExplanation(
          a, b, c, discriminant, [repeated],
          'x = ' + numberText(repeated) + ' (repeated root)'
        )
      });
    }

    const rootOne = clean((minusB - squareRoot) / twoA);
    const rootTwo = clean((minusB + squareRoot) / twoA);
    const lower = Math.min(rootOne, rootTwo);
    const higher = Math.max(rootOne, rootTwo);
    const relation = exact ? ' = ' : ' \u2248 ';
    const rootText = numberText(clean(squareRoot));

    push(
      'x = (' + numberText(minusB) + ' + ' + rootText + ') / ' + numberText(twoA) + relation + numberText(higher)
    );
    push(
      'x = (' + numberText(minusB) + ' - ' + rootText + ') / ' + numberText(twoA) + relation + numberText(lower)
    );

    return success(
      question,
      KINDS.QUADRATIC_EQUATION,
      'x = ' + numberText(lower) + ', ' + numberText(higher),
      steps,
      {
        expression: quadraticDisplay(a, b, c) + ' = 0',
        coefficients: { a: a, b: b, c: c },
        discriminant: discriminant,
        roots: [lower, higher],
        explanation: quadraticExplanation(
          a, b, c, discriminant, [lower, higher],
          'x = ' + numberText(lower) + ', ' + numberText(higher)
        )
      }
    );
  }
  // ---------------------------------------------------------------------------
  // Equations in one variable (linear / quadratic)
  // ---------------------------------------------------------------------------

  function trySolveEquation(question, text, angleMode) {
    if (text.indexOf('=') === -1) {
      return null;
    }
    if (countOccurrences(text, '=') !== 1) {
      return unsupported(question, MESSAGES.unsupportedEquation);
    }

    const parts = text.split('=');
    const leftText = parts[0].trim();
    const rightText = parts[1].trim();

    if (!leftText || !rightText) {
      return failure(question, 'malformed', MESSAGES.malformed);
    }
    if (hasForeignWords(leftText) || hasForeignWords(rightText)) {
      return unsupported(question, MESSAGES.unsupportedEquation);
    }
    if (leftText.indexOf('x') === -1 && rightText.indexOf('x') === -1) {
      return unsupported(question, MESSAGES.noVariable, MESSAGES.unsupportedHint);
    }

    const left = polynomialOf(leftText, angleMode);
    const right = polynomialOf(rightText, angleMode);
    if (!left || !right) {
      return unsupported(question, MESSAGES.unsupportedEquation);
    }

    const a = clean(left.a - right.a);
    const b = clean(left.b - right.b);
    const c = clean(left.c - right.c);

    if (!isZero(a)) {
      return solveQuadraticEquation(question, leftText, rightText, left, right);
    }
    if (!isZero(b)) {
      return solveLinearEquation(question, leftText, rightText, left, right);
    }
    if (isZero(c)) {
      return success(
        question,
        KINDS.LINEAR_EQUATION,
        'Any value of x (the two sides are always equal)',
        ['Both sides simplify to the same expression, so every value of x works.']
      );
    }
    return success(question, KINDS.LINEAR_EQUATION, 'No solution', [
      'The x terms cancel out and the remaining numbers are not equal, so there is no solution.'
    ]);
  }

  // ---------------------------------------------------------------------------
  // Percentages and "x of y"
  // ---------------------------------------------------------------------------

  const PERCENTAGE_LEFT = /^(\d+(?:\.\d+)?)\s*(?:%|percent)$/;
  const FRACTION_LEFT = /^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/;
  const OF_QUESTION = /^(.+?)\s+of\s+(.+)$/;
  const INCREASE_QUESTION = /^(?:increase|add)\s+(.+?)\s+by\s+(\d+(?:\.\d+)?)\s*(?:%|percent)?$/;
  const DECREASE_QUESTION = /^(?:decrease|reduce|discount)\s+(.+?)\s+by\s+(\d+(?:\.\d+)?)\s*(?:%|percent)?$/;

  function trySolvePercentage(question, text, angleMode) {
    const increase = INCREASE_QUESTION.exec(text);
    if (increase) {
      return solveChangeQuestion(question, increase[1], increase[2], 1, angleMode);
    }

    const decrease = DECREASE_QUESTION.exec(text);
    if (decrease) {
      return solveChangeQuestion(question, decrease[1], decrease[2], -1, angleMode);
    }

    const ofQuestion = OF_QUESTION.exec(text);
    if (!ofQuestion) {
      return null;
    }

    const leftText = ofQuestion[1].trim();
    const rightText = ofQuestion[2].trim();
    const isPercentage = PERCENTAGE_LEFT.test(leftText);
    const isFraction = FRACTION_LEFT.test(leftText);
    if (!isPercentage && !isFraction) {
      return null;
    }

    const multiplier = evaluateQuiet(leftText, angleMode);
    const base = evaluateQuiet(rightText, angleMode);
    if (multiplier === null || base === null) {
      return null;
    }

    const amount = clean(multiplier * base);
    const percentageMatch = PERCENTAGE_LEFT.exec(leftText);
    const steps = [
      percentageMatch
        ? percentageMatch[1] + ' / 100 = ' + numberText(multiplier)
        : toDisplayExpression(leftText) + ' = ' + numberText(multiplier),
      numberText(multiplier) + ' \u00D7 ' + numberText(base) + ' = ' + numberText(amount)
    ];

    return success(question, isPercentage ? KINDS.PERCENTAGE : KINDS.FRACTION, numberText(amount), steps, {
      expression: toDisplayExpression(leftText) + ' of ' + toDisplayExpression(rightText),
      value: amount,
      explanation: ofQuestionExplanation(
        isPercentage,
        percentageMatch ? percentageMatch[1] : null,
        leftText,
        base,
        steps,
        amount
      )
    });
  }

  /** "increase 500 by 10%" / "decrease 800 by 25%" */
  function solveChangeQuestion(question, baseText, percentText, direction, angleMode) {
    const base = evaluateQuiet(baseText.trim(), angleMode);
    const percent = Number(percentText);
    if (base === null || !Number.isFinite(percent)) {
      return null;
    }

    const rate = clean(percent / 100);
    const factor = clean(1 + direction * rate);
    const result = clean(base * factor);
    const steps = [
      percentText + '% = ' + percentText + ' / 100 = ' + numberText(rate),
      numberText(base) +
        ' \u00D7 (' +
        (direction > 0 ? '1 + ' : '1 - ') +
        numberText(rate) +
        ') = ' +
        numberText(base) +
        ' \u00D7 ' +
        numberText(factor) +
        ' = ' +
        numberText(result)
    ];

    return success(question, KINDS.PERCENTAGE, numberText(result), steps, {
      expression: toDisplayExpression(baseText.trim()),
      value: result,
      explanation: changeQuestionExplanation(base, percentText, direction, rate, steps, result)
    });
  }
  // ---------------------------------------------------------------------------
  // Simple geometry formulas (area / perimeter / circumference)
  // ---------------------------------------------------------------------------

  /** Reads "<label> 7", "<label> = 7", "<label> is 7", "<label> of 7". */
  function findMeasure(text, labels) {
    const pattern = new RegExp(
      '\\b(?:' + labels.join('|') + ')\\b\\s*(?:of|is|=|:)?\\s*(\\d+(?:\\.\\d+)?)',
      'i'
    );
    const match = pattern.exec(text);
    return match ? Number(match[1]) : null;
  }

  function piMultipleText(multiple) {
    return numberText(multiple) + '\u03C0';
  }

  /** Circle "Given" line: the radius when it was supplied, else the diameter. */
  function circleGivenText(radius, diameter) {
    if (diameter === null || diameter === undefined) {
      return 'Radius r = ' + numberText(radius);
    }
    return 'Diameter d = ' + numberText(diameter);
  }

  function trySolveGeometry(question, text) {
    const wantsArea = /\barea\b|\bsurface\b/.test(text);
    const wantsPerimeter = /\bcircumference\b|\bperimeter\b/.test(text);
    if (!wantsArea && !wantsPerimeter) {
      return null;
    }
    if (/\bvolume\b|\bmatrix\b|\bhypotenuse\b|\bdiagonal\b/.test(text)) {
      return null;
    }

    if (/\bcircle\b|\bcircular\b/.test(text)) {
      return solveCircleGeometry(question, text, wantsArea);
    }
    if (/\brectangle\b|\brectangular\b/.test(text)) {
      return solveRectangleGeometry(question, text, wantsArea);
    }
    if (/\bsquare\b/.test(text)) {
      return solveSquareGeometry(question, text, wantsArea);
    }
    if (/\btriangle\b/.test(text)) {
      return solveTriangleGeometry(question, text, wantsArea);
    }
    return null;
  }

  function solveCircleGeometry(question, text, wantsArea) {
    let radius = findMeasure(text, ['radius', 'r']);
    let diameter = null;
    if (radius === null) {
      diameter = findMeasure(text, ['diameter', 'd']);
      if (diameter === null) {
        return null;
      }
      radius = clean(diameter / 2);
    }
    if (!Number.isFinite(radius) || radius < 0) {
      return null;
    }

    if (wantsArea) {
      const square = clean(radius * radius);
      const area = clean(Math.PI * square);
      const steps = [
        'A = \u03C0r\u00B2',
        'A = \u03C0 \u00D7 ' + numberText(radius) + '\u00B2',
        'A = ' + piMultipleText(square),
        'A \u2248 ' + numberText(area)
      ];
      const answer = isNearInteger(square)
        ? 'A = ' + piMultipleText(square) + ' \u2248 ' + numberText(area)
        : 'A \u2248 ' + numberText(area);
      return success(question, KINDS.GEOMETRY, answer, steps, {
        formula: 'A = \u03C0r\u00B2',
        explanation: geometryExplanation(
          circleGivenText(radius, diameter),
          tr('solver.geometry.areaCircle', 'Area of the circle'),
          steps,
          answer
        )
      });
    }

    const diameterValue = clean(2 * radius);
    const circumference = clean(Math.PI * diameterValue);
    const steps = [
      'C = 2\u03C0r',
      'C = 2 \u00D7 \u03C0 \u00D7 ' + numberText(radius),
      'C = ' + piMultipleText(diameterValue),
      'C \u2248 ' + numberText(circumference)
    ];
    const answer = isNearInteger(diameterValue)
      ? 'C = ' + piMultipleText(diameterValue) + ' \u2248 ' + numberText(circumference)
      : 'C \u2248 ' + numberText(circumference);
    return success(question, KINDS.GEOMETRY, answer, steps, {
      formula: 'C = 2\u03C0r',
      explanation: geometryExplanation(
        circleGivenText(radius, diameter),
        tr('solver.geometry.circumferenceCircle', 'Circumference of the circle'),
        steps,
        answer
      )
    });
  }

  function solveRectangleGeometry(question, text, wantsArea) {
    const length = findMeasure(text, ['length', 'l']);
    const width = findMeasure(text, ['width', 'breadth', 'w']);
    if (length === null || width === null) {
      return null;
    }
    const given = 'Length = ' + numberText(length) + '\nWidth = ' + numberText(width);

    if (wantsArea) {
      const area = clean(length * width);
      const steps = [
        'A = length \u00D7 width',
        'A = ' + numberText(length) + ' \u00D7 ' + numberText(width),
        'A = ' + numberText(area)
      ];
      const answer = 'A = ' + numberText(area);
      return success(question, KINDS.GEOMETRY, answer, steps, {
        formula: 'A = length \u00D7 width',
        explanation: geometryExplanation(given, tr('solver.geometry.areaRectangle', 'Area of the rectangle'), steps, answer)
      });
    }

    const perimeter = clean(2 * (length + width));
    const steps = [
      'P = 2 \u00D7 (length + width)',
      'P = 2 \u00D7 (' + numberText(length) + ' + ' + numberText(width) + ')',
      'P = 2 \u00D7 ' + numberText(clean(length + width)),
      'P = ' + numberText(perimeter)
    ];
    const answer = 'P = ' + numberText(perimeter);
    return success(question, KINDS.GEOMETRY, answer, steps, {
      formula: 'P = 2 \u00D7 (length + width)',
      explanation: geometryExplanation(given, tr('solver.geometry.perimeterRectangle', 'Perimeter of the rectangle'), steps, answer)
    });
  }

  function solveSquareGeometry(question, text, wantsArea) {
    const side = findMeasure(text, ['side', 's']);
    if (side === null) {
      return null;
    }
    const given = 'Side = ' + numberText(side);

    if (wantsArea) {
      const area = clean(side * side);
      const steps = ['A = side\u00B2', 'A = ' + numberText(side) + '\u00B2', 'A = ' + numberText(area)];
      const answer = 'A = ' + numberText(area);
      return success(question, KINDS.GEOMETRY, answer, steps, {
        formula: 'A = side\u00B2',
        explanation: geometryExplanation(given, tr('solver.geometry.areaSquare', 'Area of the square'), steps, answer)
      });
    }

    const perimeter = clean(4 * side);
    const steps = [
      'P = 4 \u00D7 side',
      'P = 4 \u00D7 ' + numberText(side),
      'P = ' + numberText(perimeter)
    ];
    const answer = 'P = ' + numberText(perimeter);
    return success(question, KINDS.GEOMETRY, answer, steps, {
      formula: 'P = 4 \u00D7 side',
      explanation: geometryExplanation(given, tr('solver.geometry.perimeterSquare', 'Perimeter of the square'), steps, answer)
    });
  }

  function solveTriangleGeometry(question, text, wantsArea) {
    if (!wantsArea) {
      return null;
    }
    const base = findMeasure(text, ['base', 'b']);
    const height = findMeasure(text, ['height', 'h']);
    if (base === null || height === null) {
      return null;
    }

    const area = clean(0.5 * base * height);
    const steps = [
      'A = 0.5 \u00D7 base \u00D7 height',
      'A = 0.5 \u00D7 ' + numberText(base) + ' \u00D7 ' + numberText(height),
      'A = ' + numberText(area)
    ];
    const answer = 'A = ' + numberText(area);
    return success(question, KINDS.GEOMETRY, answer, steps, {
      formula: 'A = 0.5 \u00D7 base \u00D7 height',
      explanation: geometryExplanation(
        'Base = ' + numberText(base) + '\nHeight = ' + numberText(height),
        tr('solver.geometry.areaTriangle', 'Area of the triangle'),
        steps,
        answer
      )
    });
  }
  // ---------------------------------------------------------------------------
  // Arithmetic, fractions, powers, roots and trigonometry
  // (always through the existing trusted expression engine)
  // ---------------------------------------------------------------------------

  function solveArithmetic(question, text, angleMode) {
    if (hasForeignWords(text) || !/[0-9]/.test(text)) {
      return null;
    }

    const outcome = runtimeEngine().calculate(text, {
      angleMode: angleMode,
      silentIncomplete: false
    });

    if (outcome && outcome.ok) {
      const value = clean(outcome.value);
      const display = toDisplayExpression(text);
      const steps = [display + ' = ' + numberText(value)];
      return success(question, KINDS.ARITHMETIC, numberText(value), steps, {
        expression: display,
        value: value,
        explanation: arithmeticExplanation(text, display, value, steps, angleMode)
      });
    }
    if (!outcome) {
      return null;
    }
    return failure(question, outcome.code, outcome.message);
  }

  // ---------------------------------------------------------------------------
  // Questions the local solver deliberately does not answer yet
  // ---------------------------------------------------------------------------

  const UNSUPPORTED_KEYWORDS =
    /\b(?:derivative|differentiate|differential|integral|integrate|integration|antiderivative|limit|matrix|matrices|determinant|vector|probability|permutation|combination|statistics|variance|standard deviation|simplify|factorise|factorize|expand|prove|proof|graph|plot|volume|hypotenuse|diagonal|simultaneous|elimination)\b/;

  // ---------------------------------------------------------------------------
  // Runtime (engine / formatter / angle unit) - one solver per page
  // ---------------------------------------------------------------------------

  const runtime = { engine: null, format: null, getAngleMode: null };

  function resolveGlobal(name) {
    if (typeof globalThis === 'undefined' || !globalThis.SMC) {
      return null;
    }
    return globalThis.SMC[name] || null;
  }

  function runtimeEngine() {
    return runtime.engine;
  }

  /** Shared number formatting so the solver matches the calculator display. */
  function numberText(value) {
    const format = runtime.format;
    if (format && typeof format.formatNumber === 'function') {
      return format.formatNumber(value);
    }
    return localFormatNumber(value);
  }

  /** Evaluates quietly through the trusted engine; null when it cannot. */
  function evaluateQuiet(text, angleMode) {
    const engine = runtimeEngine();
    if (!engine || typeof engine.evaluate !== 'function') {
      return null;
    }
    try {
      const value = engine.evaluate(text, { angleMode: angleMode === 'rad' ? 'rad' : 'deg' });
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    } catch (error) {
      return null;
    }
  }

  /** The DEG/RAD setting of the calculator, when one is connected. */
  function currentAngleMode() {
    if (typeof runtime.getAngleMode === 'function') {
      try {
        return runtime.getAngleMode() === 'rad' ? 'rad' : 'deg';
      } catch (error) {
        return 'deg';
      }
    }
    return 'deg';
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const SUPPORTED_KINDS = [
    KINDS.ARITHMETIC,
    KINDS.FRACTION,
    KINDS.PERCENTAGE,
    KINDS.LINEAR_EQUATION,
    KINDS.QUADRATIC_EQUATION,
    KINDS.GEOMETRY
  ];

  function solveMathQuestion(question, options) {
    const settings = options || {};
    const raw = typeof question === 'string' ? question : '';

    try {
      const text = normalizeQuestion(raw);

      if (!text) {
        return failure(raw, 'empty', MESSAGES.empty);
      }
      if (text.length > MAX_QUESTION_LENGTH) {
        return unsupported(text, MESSAGES.tooLong);
      }
      if (UNSUPPORTED_KEYWORDS.test(text)) {
        return unsupported(text, MESSAGES.unsupported);
      }
      if (typeof runtime.engine !== 'object' || runtime.engine === null) {
        return failure(text, 'internal', MESSAGES.notConnected);
      }

      const angleMode =
        settings.angleMode === 'rad' || settings.angleMode === 'deg'
          ? settings.angleMode
          : currentAngleMode();

      const solvers = [trySolvePercentage, trySolveGeometry, trySolveEquation];
      for (let i = 0; i < solvers.length; i += 1) {
        const result = solvers[i](text, text, angleMode);
        if (result) {
          return result;
        }
      }

      const arithmetic = solveArithmetic(text, text, angleMode);
      if (arithmetic) {
        return arithmetic;
      }

      return unsupported(text, MESSAGES.unsupported);
    } catch (error) {
      return failure(raw, 'internal', MESSAGES.internal);
    }
  }

  /**
   * @param {{engine?:object, format?:object, getAngleMode?:Function}} [options]
   *        engine      the expression engine (SMC.ExpressionEngine)
   *        format      the number formatter (SMC.Format) - optional
   *        getAngleMode() returns 'deg' | 'rad' (optional, default 'deg')
   * @returns {{solveMathQuestion:Function, STATUS:object, KINDS:object,
   *            MESSAGES:object, SUPPORTED_KINDS:Array<string>}}
   */
  function createMathSolver(options) {
    const config = options || {};
    runtime.engine = config.engine || runtime.engine || resolveGlobal('ExpressionEngine');
    runtime.format = config.format || runtime.format || resolveGlobal('Format');
    if (typeof config.getAngleMode === 'function') {
      runtime.getAngleMode = config.getAngleMode;
    }

    return {
      solveMathQuestion: solveMathQuestion,
      STATUS: STATUS,
      KINDS: KINDS,
      MESSAGES: MESSAGES,
      SUPPORTED_KINDS: SUPPORTED_KINDS.slice(),
      // Phase 2D: same translator as createMathSolver.setTranslator below; the
      // lookup itself is module scoped, so the instance and the factory share it.
      setTranslator: setTranslator
    };
  }

  createMathSolver.STATUS = STATUS;
  createMathSolver.KINDS = KINDS;
  createMathSolver.MESSAGES = MESSAGES;
  createMathSolver.SUPPORTED_KINDS = SUPPORTED_KINDS.slice();
  createMathSolver.normalizeQuestion = normalizeQuestion;
  // Phase 2D: lets js/app.js plug the i18n service into the explanation text.
  createMathSolver.setTranslator = setTranslator;

  return createMathSolver;
});
