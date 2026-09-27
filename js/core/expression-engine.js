/**
 * Smart Math Calculator - Expression Engine
 * -----------------------------------------------------------------------------
 * Safe arithmetic + scientific engine: tokenizer -> recursive descent parser ->
 * evaluator. It NEVER uses eval() or new Function(); only the grammar below is
 * accepted, everything else is reported as a typed error.
 *
 * Supported syntax
 *   numbers      12   3.5   .5   1.2e3 (scientific notation)
 *   operators    +  -  *  /           (also accepts × ÷ − – — as the same jobs)
 *                ^  (power, right associative)    2^5 -> 32, 2^-3 -> 0.125
 *                mod (remainder)                  10 mod 3 -> 1
 *   brackets     ( )
 *   percent      50%           -> 0.5
 *                10% of 500    -> 50
 *                500 + 10%     -> 550    (percentage of the running value)
 *                500 - 10%     -> 450
 *                8 × 25%       -> 2
 *   factorial    5!            -> 120, 0! -> 1   (0..170, integers only)
 *   constants    pi, π, e
 *   functions    sin cos tan       (angle unit aware, DEG by default)
 *                asin acos atan    (result in the selected angle unit)
 *                sinh cosh tanh
 *                log (base 10)  ln (natural, base e)
 *                sqrt, √, cbrt, ∛, abs
 *   implicit ×   2(3+4)        -> 14
 *                2π             -> 6.283185307179586
 *                2sin(30)       -> 1            (in DEG)
 *
 * Angle handling: pass { angleMode: 'deg' | 'rad' } to evaluate()/calculate().
 * The default is 'deg'. Only sin/cos/tan and asin/acos/atan are affected.
 *
 * Exposed API (also usable from Node, see tests/engine.test.js)
 *   ERROR_CODES, EngineError, describeError, isIncompleteCode,
 *   tokenize, parse, evaluate, calculate, ANGLE_MODES, MAX_FACTORIAL,
 *   FUNCTION_NAMES, CONSTANT_NAMES
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SMC = root.SMC || {};
    root.SMC.ExpressionEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Error codes returned/thrown by the engine. */
  const ERROR_CODES = {
    EMPTY: 'EMPTY',
    INCOMPLETE: 'INCOMPLETE',
    SYNTAX: 'SYNTAX',
    DIVIDE_BY_ZERO: 'DIVIDE_BY_ZERO',
    OVERFLOW: 'OVERFLOW',
    TOO_COMPLEX: 'TOO_COMPLEX',
    DOMAIN: 'DOMAIN',
    FACTORIAL: 'FACTORIAL'
  };

  /** Friendly, user facing message for every error code. */
  const ERROR_MESSAGES = {
    EMPTY: 'Enter a calculation first',
    INCOMPLETE: 'Expression is incomplete',
    SYNTAX: 'Invalid expression',
    DIVIDE_BY_ZERO: 'Cannot divide by zero',
    OVERFLOW: 'Result is too large',
    TOO_COMPLEX: 'Expression is too long',
    DOMAIN: 'Invalid function input',
    FACTORIAL: 'Invalid factorial'
  };

  /** Codes that only mean "the user is still typing". */
  const INCOMPLETE_CODES = [ERROR_CODES.EMPTY, ERROR_CODES.INCOMPLETE];

  /**
   * Phase 2C: an OPTIONAL translator supplied by js/app.js so the user-facing
   * error text follows the selected language. It is null by default, which keeps
   * the behaviour - and every existing test - exactly as before.
   * @type {?function(string):string}
   */
  let translator = null;

  /** Registers (or clears, with null) the i18n lookup. Returns the previous one. */
  function setTranslator(next) {
    const previous = translator;
    translator = typeof next === 'function' ? next : null;
    return previous;
  }

  const MAX_EXPRESSION_LENGTH = 400;
  const MAX_DEPTH = 120;

  /** Angle units accepted by the engine. */
  const ANGLE_MODES = { DEG: 'deg', RAD: 'rad' };

  /** Factorial is only defined for integers 0..170 (171! overflows a double). */
  const MAX_FACTORIAL = 170;

  /** Constants available in expressions. */
  const CONSTANTS = {
    pi: Math.PI,
    '\u03C0': Math.PI, // π
    e: Math.E
  };

  const CONSTANT_NAMES = ['pi', '\u03C0', 'e'];

  /** Input characters accepted as operators, mapped to canonical operators. */
  const OPERATOR_ALIASES = {
    '+': '+',
    '\uFF0B': '+',
    '-': '-',
    '\u2212': '-', // −
    '\u2013': '-', // –
    '\u2014': '-', // —
    '*': '*',
    '\u00D7': '*', // ×
    '\u22C5': '*', // ⋅
    '\u00B7': '*', // ·
    '/': '/',
    '\u00F7': '/', // ÷
    '\u2215': '/', // ∕
    '^': '^' // power
  };

  /** Words accepted as operators (percentage syntax, remainder, ...). */
  const WORD_ALIASES = {
    of: '*',
    times: '*',
    mod: 'mod'
  };

  /** Single characters that behave like a function or a constant. */
  const SYMBOLS = {
    '\u03C0': { type: 'constant', name: '\u03C0' }, // π
    '\u221A': { type: 'function', name: 'sqrt' }, // √
    '\u221B': { type: 'function', name: 'cbrt' } // ∛
  };

  /**
   * Scientific functions.
   *   angle: 'in'  -> the argument is an angle in the selected unit
   *          'out' -> the result is an angle in the selected unit
   * domain: optional check on the argument, returns false when undefined
   */
  const FUNCTIONS = {
    sin: { angle: 'in', apply: Math.sin },
    cos: { angle: 'in', apply: Math.cos },
    tan: {
      angle: 'in',
      apply: function (radians, value) {
        const cosine = Math.cos(radians);
        if (Math.abs(cosine) < 1e-12) {
          return NaN; // tan(90°) and friends are undefined, not "huge"
        }
        return Math.tan(radians);
      }
    },
    asin: {
      angle: 'out',
      domain: function (value) {
        return value >= -1 && value <= 1;
      },
      apply: Math.asin
    },
    acos: {
      angle: 'out',
      domain: function (value) {
        return value >= -1 && value <= 1;
      },
      apply: Math.acos
    },
    atan: { angle: 'out', apply: Math.atan },
    sinh: { apply: Math.sinh },
    cosh: { apply: Math.cosh },
    tanh: { apply: Math.tanh },
    log: {
      domain: function (value) {
        return value > 0;
      },
      apply: Math.log10
    },
    ln: {
      domain: function (value) {
        return value > 0;
      },
      apply: Math.log
    },
    sqrt: {
      domain: function (value) {
        return value >= 0;
      },
      apply: Math.sqrt
    },
    cbrt: { apply: Math.cbrt },
    abs: { apply: Math.abs }
  };

  const FUNCTION_NAMES = Object.keys(FUNCTIONS);

  /** Root symbols can be used without brackets: √25 -> 5 */
  const ROOT_FUNCTIONS = ['sqrt', 'cbrt'];

  /** Converts a user angle into radians for Math.sin/cos/tan. */
  function angleToRadians(value, angleMode) {
    return angleMode === ANGLE_MODES.RAD ? value : (value * Math.PI) / 180;
  }

  /** Converts a Math.asin/acos/atan result back into the selected unit. */
  function radiansToAngle(value, angleMode) {
    return angleMode === ANGLE_MODES.RAD ? value : (value * 180) / Math.PI;
  }

  function normalizeAngleMode(angleMode) {
    return angleMode === ANGLE_MODES.RAD ? ANGLE_MODES.RAD : ANGLE_MODES.DEG;
  }

  /** Typed error used for every failure inside the engine. */
  class EngineError extends Error {
    constructor(code, index, message) {
      super(message || ERROR_MESSAGES[code] || ERROR_MESSAGES[ERROR_CODES.SYNTAX]);
      this.name = 'EngineError';
      this.code = code;
      this.index = typeof index === 'number' ? index : -1;
    }
  }

  function describeError(code) {
    const fallback = ERROR_MESSAGES[code] || ERROR_MESSAGES[ERROR_CODES.SYNTAX];
    if (!translator) {
      return fallback;
    }
    const translated = translator('calc.error.' + (code || ERROR_CODES.SYNTAX));
    // A missing or empty translation must never blank the message.
    return typeof translated === 'string' && translated !== '' ? translated : fallback;
  }

  function isIncompleteCode(code) {
    return INCOMPLETE_CODES.indexOf(code) !== -1;
  }

  function fail(code, index) {
    throw new EngineError(code, index);
  }

  // ---------------------------------------------------------------------------
  // Tokenizer
  // ---------------------------------------------------------------------------

  function isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  function isLetter(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  }

  function isSpace(ch) {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\u00A0';
  }

  /**
   * Splits an expression into a flat token list.
   * @param {string} source
   * @returns {Array<{type:string, value:(number|string), index:number}>}
   */
  function tokenize(source) {
    const text = source === null || source === undefined ? '' : String(source);
    if (text.length > MAX_EXPRESSION_LENGTH) {
      fail(ERROR_CODES.TOO_COMPLEX, 0);
    }

    const tokens = [];
    let i = 0;

    while (i < text.length) {
      const ch = text[i];

      if (isSpace(ch)) {
        i += 1;
        continue;
      }

      if (isDigit(ch) || ch === '.') {
        const start = i;
        let seenDot = false;
        let literal = '';

        while (i < text.length) {
          const c = text[i];
          if (isDigit(c)) {
            literal += c;
            i += 1;
          } else if (c === '.' && !seenDot) {
            seenDot = true;
            literal += c;
            i += 1;
          } else {
            break;
          }
        }

        if (i < text.length && (text[i] === 'e' || text[i] === 'E')) {
          const exponent = /^[eE][+-]?\d+/.exec(text.slice(i));
          if (!exponent) {
            fail(ERROR_CODES.INCOMPLETE, i);
          }
          literal += exponent[0];
          i += exponent[0].length;
        }

        const cleaned = literal.replace(/\.$/, '');
        if (cleaned === '' || cleaned === '.') {
          fail(ERROR_CODES.INCOMPLETE, start);
        }
        const value = Number(literal);
        if (!Number.isFinite(value)) {
          fail(ERROR_CODES.OVERFLOW, start);
        }
        tokens.push({ type: 'number', value: value, index: start });
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(OPERATOR_ALIASES, ch)) {
        tokens.push({ type: 'op', value: OPERATOR_ALIASES[ch], index: i });
        i += 1;
        continue;
      }

      if (ch === '%') {
        tokens.push({ type: 'percent', value: '%', index: i });
        i += 1;
        continue;
      }

      if (ch === '(') {
        tokens.push({ type: 'lparen', value: '(', index: i });
        i += 1;
        continue;
      }

      if (ch === ')') {
        tokens.push({ type: 'rparen', value: ')', index: i });
        i += 1;
        continue;
      }

      if (ch === '!') {
        tokens.push({ type: 'factorial', value: '!', index: i });
        i += 1;
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(SYMBOLS, ch)) {
        const symbol = SYMBOLS[ch];
        if (symbol.type === 'constant') {
          tokens.push({ type: 'constant', name: symbol.name, value: CONSTANTS[symbol.name], index: i });
        } else {
          tokens.push({ type: 'function', name: symbol.name, index: i });
        }
        i += 1;
        continue;
      }

      if (isLetter(ch)) {
        const start = i;
        let word = '';
        while (i < text.length && isLetter(text[i])) {
          word += text[i];
          i += 1;
        }
        const lower = word.toLowerCase();

        if (Object.prototype.hasOwnProperty.call(WORD_ALIASES, lower)) {
          tokens.push({ type: 'op', value: WORD_ALIASES[lower], index: start, word: lower });
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(CONSTANTS, lower)) {
          tokens.push({ type: 'constant', name: lower, value: CONSTANTS[lower], index: start });
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(FUNCTIONS, lower)) {
          tokens.push({ type: 'function', name: lower, index: start });
          continue;
        }
        fail(ERROR_CODES.SYNTAX, start);
      }

      fail(ERROR_CODES.SYNTAX, i);
    }

    return tokens;
  }

  // ---------------------------------------------------------------------------
  // Parser (builds an AST, does not calculate anything)
  // ---------------------------------------------------------------------------

  function binary(op, left, right, index, implicit) {
    return { type: 'binary', op: op, left: left, right: right, index: index, implicit: !!implicit };
  }

  /**
   * Parses a token list into an AST.
   * @param {Array} tokens produced by tokenize()
   * @returns {object} AST root node
   */
  function parse(tokens) {
    if (!tokens || tokens.length === 0) {
      fail(ERROR_CODES.EMPTY, 0);
    }

    let pos = 0;

    function peek() {
      return pos < tokens.length ? tokens[pos] : null;
    }

    function atEnd() {
      return pos >= tokens.length;
    }

    function advance() {
      const token = tokens[pos];
      pos += 1;
      return token;
    }

    // expression := term (('+' | '-') term)*
    function parseExpression() {
      let node = parseTerm();
      while (!atEnd()) {
        const token = peek();
        if (token.type === 'op' && (token.value === '+' || token.value === '-')) {
          advance();
          node = binary(token.value, node, parseTerm(), token.index);
          continue;
        }
        break;
      }
      return node;
    }

    // term := unary ((('*' | '/' | 'mod') unary) | implicit-multiplication)*
    function parseTerm() {
      let node = parseUnary();
      while (!atEnd()) {
        const token = peek();
        if (
          token.type === 'op' &&
          (token.value === '*' || token.value === '/' || token.value === 'mod')
        ) {
          advance();
          node = binary(token.value, node, parseUnary(), token.index);
          continue;
        }
        if (
          token.type === 'lparen' ||
          token.type === 'number' ||
          token.type === 'constant' ||
          token.type === 'function'
        ) {
          // Implicit multiplication: 2(3+4), 2π, 2sin(30)
          node = binary('*', node, parseUnary(), token.index, true);
          continue;
        }
        break;
      }
      return node;
    }

    // unary := ('+' | '-') unary | power
    function parseUnary() {
      const token = peek();
      if (token && token.type === 'op' && (token.value === '-' || token.value === '+')) {
        advance();
        if (atEnd()) {
          fail(ERROR_CODES.INCOMPLETE, token.index);
        }
        return { type: 'unary', op: token.value, arg: parseUnary(), index: token.index };
      }
      return parsePower();
    }

    // power := postfix ('^' unary)?   - right associative, so 2^3^2 = 512
    function parsePower() {
      const base = parsePostfix();
      if (!atEnd()) {
        const token = peek();
        if (token.type === 'op' && token.value === '^') {
          advance();
          if (atEnd()) {
            fail(ERROR_CODES.INCOMPLETE, token.index);
          }
          return binary('^', base, parseUnary(), token.index);
        }
      }
      return base;
    }

    // postfix := primary ('%' | '!')*
    function parsePostfix() {
      let node = parsePrimary();
      while (!atEnd()) {
        const token = peek();
        if (token.type === 'percent') {
          advance();
          node = { type: 'percent', arg: node, index: token.index };
          continue;
        }
        if (token.type === 'factorial') {
          advance();
          node = { type: 'factorial', arg: node, index: token.index };
          continue;
        }
        break;
      }
      return node;
    }

    // group := '(' expression ')'
    function parseGroup() {
      const open = advance(); // consume "("
      const inner = parseExpression();
      if (atEnd()) {
        fail(ERROR_CODES.INCOMPLETE, open.index);
      }
      const closing = advance();
      if (closing.type !== 'rparen') {
        fail(ERROR_CODES.SYNTAX, closing.index);
      }
      return { type: 'group', arg: inner, index: open.index };
    }

    /**
     * call := function '(' expression ')'
     *       | root-symbol primary        (so √25 works like √(25))
     */
    function parseCall(token) {
      if (atEnd()) {
        fail(ERROR_CODES.INCOMPLETE, token.index);
      }
      const next = peek();
      if (next.type === 'lparen') {
        return { type: 'call', name: token.name, arg: parseGroup(), index: token.index };
      }
      if (ROOT_FUNCTIONS.indexOf(token.name) !== -1) {
        return { type: 'call', name: token.name, arg: parsePrimary(), index: token.index };
      }
      fail(ERROR_CODES.INCOMPLETE, next.index);
      return null;
    }

    // primary := number | constant | function call | '(' expression ')'
    function parsePrimary() {
      if (atEnd()) {
        fail(ERROR_CODES.INCOMPLETE, tokens.length);
      }
      const token = advance();
      if (token.type === 'number' || token.type === 'constant') {
        return { type: 'number', value: token.value, index: token.index };
      }
      if (token.type === 'function') {
        return parseCall(token);
      }
      if (token.type === 'lparen') {
        pos -= 1; // parseGroup() consumes the bracket itself
        return parseGroup();
      }
      fail(ERROR_CODES.SYNTAX, token.index);
      return null;
    }

    const ast = parseExpression();
    if (!atEnd()) {
      fail(ERROR_CODES.SYNTAX, peek().index);
    }
    return ast;
  }

  // ---------------------------------------------------------------------------
  // Evaluator
  // ---------------------------------------------------------------------------

  /** True when a node is a percentage at the top level (groups are unwrapped). */
  function isPercentNode(node) {
    let current = node;
    while (current && current.type === 'group') {
      current = current.arg;
    }
    return !!current && current.type === 'percent';
  }

  /** Factorial with strict, safe limits (integers 0..170). */
  function factorial(value, index) {
    if (!Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
      fail(ERROR_CODES.FACTORIAL, index);
    }
    if (value > MAX_FACTORIAL) {
      fail(ERROR_CODES.OVERFLOW, index);
    }
    let result = 1;
    for (let i = 2; i <= value; i += 1) {
      result *= i;
    }
    return result;
  }

  /** Applies a scientific function, honouring the selected angle unit. */
  function callFunction(name, value, context, index) {
    const definition = FUNCTIONS[name];
    if (!definition) {
      fail(ERROR_CODES.SYNTAX, index);
    }
    if (typeof definition.domain === 'function' && !definition.domain(value)) {
      fail(ERROR_CODES.DOMAIN, index);
    }

    const radians = definition.angle === 'in' ? angleToRadians(value, context.angleMode) : value;
    let result = definition.apply(radians, value);

    if (definition.angle === 'out') {
      result = radiansToAngle(result, context.angleMode);
    }
    if (typeof result !== 'number' || Number.isNaN(result)) {
      fail(ERROR_CODES.DOMAIN, index);
    }
    return result;
  }

  function evaluateNode(node, depth, context) {
    if (!node) {
      fail(ERROR_CODES.SYNTAX, -1);
    }
    if (depth > MAX_DEPTH) {
      fail(ERROR_CODES.TOO_COMPLEX, node.index);
    }

    switch (node.type) {
      case 'number':
        return node.value;

      case 'group':
        return evaluateNode(node.arg, depth + 1, context);

      case 'unary': {
        const value = evaluateNode(node.arg, depth + 1, context);
        return node.op === '-' ? -value : value;
      }

      case 'percent':
        // "50%" always means 0.5 in value position.
        return evaluateNode(node.arg, depth + 1, context) / 100;

      case 'factorial':
        return factorial(evaluateNode(node.arg, depth + 1, context), node.index);

      case 'call':
        return callFunction(node.name, evaluateNode(node.arg, depth + 1, context), context, node.index);

      case 'binary': {
        const left = evaluateNode(node.left, depth + 1, context);
        const right = evaluateNode(node.right, depth + 1, context);

        if (node.op === '+' || node.op === '-') {
          if (isPercentNode(node.right)) {
            // Calculator style percentage: 500 + 10% -> 550, 500 - 10% -> 450
            const delta = left * right;
            return node.op === '+' ? left + delta : left - delta;
          }
          return node.op === '+' ? left + right : left - right;
        }

        if (node.op === '*') {
          return left * right;
        }

        if (node.op === 'mod') {
          if (right === 0) {
            fail(ERROR_CODES.DIVIDE_BY_ZERO, node.index);
          }
          return left % right;
        }

        if (node.op === '^') {
          if (left === 0 && right < 0) {
            fail(ERROR_CODES.DIVIDE_BY_ZERO, node.index);
          }
          const power = Math.pow(left, right);
          if (Number.isNaN(power)) {
            // e.g. (-8)^0.5 has no real result
            fail(ERROR_CODES.DOMAIN, node.index);
          }
          return power;
        }

        if (right === 0) {
          fail(ERROR_CODES.DIVIDE_BY_ZERO, node.index);
        }
        return left / right;
      }

      default:
        fail(ERROR_CODES.SYNTAX, node.index);
        return 0;
    }
  }

  function assertUsableResult(value, index) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      fail(ERROR_CODES.SYNTAX, index);
    }
    if (!Number.isFinite(value)) {
      fail(ERROR_CODES.OVERFLOW, index);
    }
    return value;
  }

  /** Evaluates an expression string and returns a number (throws EngineError). */
  function evaluate(source, options) {
    const settings = options || {};
    const context = { angleMode: normalizeAngleMode(settings.angleMode) };
    const ast = parse(tokenize(source));
    return assertUsableResult(evaluateNode(ast, 0, context), ast.index);
  }

  /**
   * Safe wrapper used by the UI - never throws.
   * @param {string} source
   * @param {{silentIncomplete?:boolean, angleMode?:'deg'|'rad'}} [options]
   *        silentIncomplete (default true) hides "still typing" errors
   *        (empty input, trailing operator, ...).
   *        angleMode (default 'deg') selects the unit used by sin/cos/tan and
   *        asin/acos/atan.
   * @returns {{ok:true, value:number}
   *          |{ok:false, incomplete:boolean, code:string, message:string}}
   */
  function calculate(source, options) {
    const settings = options || {};
    const silentIncomplete = settings.silentIncomplete !== false;
    try {
      return { ok: true, value: evaluate(source, settings) };
    } catch (error) {
      const code = error && error.code ? error.code : ERROR_CODES.SYNTAX;
      const incomplete = isIncompleteCode(code);
      if (incomplete && silentIncomplete) {
        return { ok: false, incomplete: true, code: code, message: describeError(code) };
      }
      return { ok: false, incomplete: incomplete, code: code, message: describeError(code) };
    }
  }

  return {
    ERROR_CODES: ERROR_CODES,
    EngineError: EngineError,
    setTranslator: setTranslator,
    MAX_EXPRESSION_LENGTH: MAX_EXPRESSION_LENGTH,
    MAX_FACTORIAL: MAX_FACTORIAL,
    ANGLE_MODES: ANGLE_MODES,
    FUNCTION_NAMES: FUNCTION_NAMES.slice(),
    CONSTANT_NAMES: CONSTANT_NAMES.slice(),
    describeError: describeError,
    isIncompleteCode: isIncompleteCode,
    normalizeAngleMode: normalizeAngleMode,
    tokenize: tokenize,
    parse: parse,
    evaluate: evaluate,
    calculate: calculate
  };
});
