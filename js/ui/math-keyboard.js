/**
 * Smart Math Calculator - Math Keyboard insertion core (Phase 1)
 * -----------------------------------------------------------------------------
 * A small, reusable, cursor-aware text-insertion helper for a <textarea>.
 * This is deliberately ONLY the insertion core: there is no UI here, no key
 * buttons, no categories, no CSS and no i18n. Those belong to later phases.
 *
 * The future Math Keyboard will point this at the Smart Solver question box
 * (`textarea[data-solver-question]`) and get correct insertion at the caret for
 * free.
 *
 * DESIGN RULES
 *   * Text only. This module never parses, never evaluates and never looks at
 *     mathematical meaning. It only moves a string and a cursor.
 *   * It never calls js/ui/solver-view.js setQuestion(). setQuestion()
 *     invalidates a displayed solver result, so a keyboard must not use it.
 *     This module writes `value`, the selection and focus, and nothing else.
 *   * It does not touch localStorage, sessionStorage, the parser, the local
 *     solver, the AI solver or the backend.
 *   * Cursor positions are the textarea's native UTF-16 offsets, which is what
 *     selectionStart/selectionEnd already use. The helper never assumes a
 *     character is one UTF-16 code unit: an insertion point that would split a
 *     surrogate pair is snapped to the pair boundary, and backspace removes a
 *     whole logical character.
 *
 * Exposed API (browser: SMC.MathKeyboard, Node: module.exports)
 *   insertAtCursor(textarea, text, mode)   -> { value, start, end, inserted, mode }
 *   deleteAtCursor(textarea)               -> { value, start, end, removed }
 *   readSelection(textarea)                -> { start, end, length }
 *   normalizeMode(mode)                    -> 'replace' | 'append' | 'wrap'
 *   MODES, DEFAULT_MODE
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.SMC = root.SMC || {};
    root.SMC.createMathKeyboard = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const MODES = Object.freeze(['replace', 'append', 'wrap']);
  const DEFAULT_MODE = 'replace';

  /** Combining marks and variation selectors that belong to the previous letter. */
  function isCombining(code) {
    return (code >= 0x0300 && code <= 0x036F) ||   // combining diacritics
      (code >= 0x20D0 && code <= 0x20FF) ||         // combining marks for symbols
      (code >= 0xFE00 && code <= 0xFE0F) ||         // variation selectors
      (code >= 0x1AB0 && code <= 0x1AFF) ||
      (code >= 0x1DC0 && code <= 0x1DFF);
  }
  function isHighSurrogate(code) { return code >= 0xD800 && code <= 0xDBFF; }
  function isLowSurrogate(code) { return code >= 0xDC00 && code <= 0xDFFF; }

  function normalizeMode(value) {
    return MODES.indexOf(value) === -1 ? DEFAULT_MODE : value;
  }

  function currentValue(textarea) {
    if (!textarea) { return ''; }
    const value = textarea.value;
    return value === null || value === undefined ? '' : String(value);
  }

  /**
   * Reads the caret/selection safely. After a programmatic write (an example
   * button, setQuestion) the browser reports selectionStart/selectionEnd as
   * null, so every missing or out-of-range number falls back to the end of the
   * value instead of producing NaN.
   */
  function readSelection(textarea) {
    const value = currentValue(textarea);
    const length = value.length;
    let start = textarea ? textarea.selectionStart : null;
    let end = textarea ? textarea.selectionEnd : null;
    if (typeof start !== 'number' || !isFinite(start) || start < 0) { start = length; }
    if (typeof end !== 'number' || !isFinite(end) || end < 0) { end = start; }
    start = Math.min(start, length);
    end = Math.min(end, length);
    if (end < start) { const swap = start; start = end; end = swap; }
    return { start: start, end: end, length: length };
  }

  /**
   * Never leave the caret between the two halves of a surrogate pair: inserting
   * there would split one character into two broken halves. Snapping down keeps
   * the pair intact and puts the new text before it.
   */
  function snapToCharacterBoundary(value, position) {
    if (position <= 0 || position >= value.length) { return position; }
    if (isHighSurrogate(value.charCodeAt(position - 1)) &&
        isLowSurrogate(value.charCodeAt(position))) {
      return position - 1;
    }
    return position;
  }

  function focusTextarea(textarea) {
    if (textarea && typeof textarea.focus === 'function') {
      try { textarea.focus(); } catch (error) { /* focus is best effort only */ }
    }
  }

  function setCaret(textarea, position) {
    const value = currentValue(textarea);
    const safe = Math.max(0, Math.min(position, value.length));
    if (typeof textarea.setSelectionRange === 'function') {
      textarea.setSelectionRange(safe, safe);
    } else {
      textarea.selectionStart = safe;
      textarea.selectionEnd = safe;
    }
    return safe;
  }

  /**
   * Inserts `text` at the caret using the requested mode.
   *
   *   replace  caret: insert at the caret. selection: replace it.
   *             "2x + [3]" + "sqrt" -> "2x + sqrt"
   *   append   selection: keep it and append after it (postfix powers).
   *             "2x + [3]" + "2" -> "2x + 32"
   *   wrap     selection: becomes the inside of the wrapper.
   *             "2x + [3]" + "\u221A" -> "2x + \u221A(3)"
   *             no selection: an empty pair, caret placed inside.
   *             "2x + " + "\u221A" -> "2x + \u221A()"
   *
   * The caret ends up immediately after the inserted text, after the kept
   * selection for append, and after the whole wrapped expression for wrap.
   * Focus is always restored, and nothing outside the textarea is touched.
   */
  function insertAtCursor(textarea, text, mode) {
    if (!textarea) {
      return { value: '', start: 0, end: 0, inserted: '', mode: DEFAULT_MODE };
    }
    const chosen = normalizeMode(mode);
    const piece = text === null || text === undefined ? '' : String(text);
    // Focusing first means the browser reports a real caret even if the user had
    // clicked away; writing value below can blur it, so it is focused again at
    // the end.
    focusTextarea(textarea);
    const value = currentValue(textarea);
    const selection = readSelection(textarea);
    const start = snapToCharacterBoundary(value, selection.start);
    const end = snapToCharacterBoundary(value, selection.end);
    const head = value.slice(0, start);
    const tail = value.slice(end);
    const hasSelection = end > start;

    let inserted = piece;
    let caret;
    let nextValue;

    if (chosen === 'wrap') {
      // A wrapper that already opens its own bracket must not gain a second one.
      const opens = piece.slice(-1) === '(';
      const openText = opens ? piece : piece + '(';
      const closeText = ')';
      if (hasSelection) {
        // The selected text becomes the inside of the wrapper, and the caret
        // belongs after the complete wrapped expression.
        inserted = openText + value.slice(start, end) + closeText;
        caret = start + inserted.length;
      } else {
        // Empty wrapper: put the caret between the brackets.
        inserted = openText + closeText;
        caret = start + openText.length;
      }
      nextValue = head + inserted + tail;
    } else if (chosen === 'append' && hasSelection) {
      // Postfix behaviour: the selected text survives and the symbol follows it.
      nextValue = head + value.slice(start, end) + piece + tail;
      caret = end + piece.length;
    } else {
      // replace, and append with no selection (there is nothing to keep).
      nextValue = head + piece + tail;
      caret = start + piece.length;
    }

    textarea.value = nextValue;
    const caretAt = setCaret(textarea, caret);
    focusTextarea(textarea);
    return {
      value: nextValue,
      start: caretAt,
      end: caretAt,
      inserted: inserted,
      mode: chosen
    };
  }

  /**
   * Deletes backwards at the caret. A selection is removed whole; otherwise one
   * logical character is removed, which means a surrogate pair (an emoji or a
   * rare symbol) goes together and any trailing combining marks go with their
   * base letter.
   */
  function deleteAtCursor(textarea) {
    if (!textarea) { return { value: '', start: 0, end: 0, removed: '' }; }
    focusTextarea(textarea);
    const value = currentValue(textarea);
    const selection = readSelection(textarea);
    const start = snapToCharacterBoundary(value, selection.start);
    const end = snapToCharacterBoundary(value, selection.end);

    let from = start;
    let to = end;
    if (from === to) {
      if (from === 0) { return { value: value, start: 0, end: 0, removed: '' }; }
      let index = from;
      // Step over a surrogate pair so one character is removed, not one half.
      if (index > 1 && isLowSurrogate(value.charCodeAt(index - 1)) &&
          isHighSurrogate(value.charCodeAt(index - 2))) {
        index -= 2;
      } else {
        index -= 1;
      }
      // Then take any combining marks or variation selectors that belong to it.
      while (index > 0 && isCombining(value.charCodeAt(index))) { index -= 1; }
      from = index;
      to = start;
    }
    const removed = value.slice(from, to);
    const nextValue = value.slice(0, from) + value.slice(to);
    textarea.value = nextValue;
    const caretAt = setCaret(textarea, from);
    focusTextarea(textarea);
    return { value: nextValue, start: caretAt, end: caretAt, removed: removed };
  }

  const mathKeyboard = {
    MODES: MODES,
    DEFAULT_MODE: DEFAULT_MODE,
    normalizeMode: normalizeMode,
    readSelection: readSelection,
    insertAtCursor: insertAtCursor,
    deleteAtCursor: deleteAtCursor
  };

  if (root && root.SMC) {
    root.SMC.MathKeyboard = mathKeyboard;
  }

  return mathKeyboard;
});