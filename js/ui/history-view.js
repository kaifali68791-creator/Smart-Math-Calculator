/**
 * Smart Math Calculator - history view
 * -----------------------------------------------------------------------------
 * Renders the locally stored calculation history and forwards user actions
 * (reuse an entry / remove an entry / clear everything) to the history store.
 * Nothing here talks to a server.
 *
 * Exposed API: SMC.createHistoryView({ history, format, storage, onSelect, scope })
 */
(function (root) {
  'use strict';

  const SMC = (root.SMC = root.SMC || {});
  const dom = SMC.dom;

  function createHistoryView(options) {
    const config = options || {};
    const history = config.history;
    const format = config.format;
    const storage = config.storage;
    const scope = config.scope || document;
    const onSelect = typeof config.onSelect === 'function' ? config.onSelect : function noop() {};
    // Phase 2C: optional i18n for the per-row aria-labels, the clear confirmation
    // and the storage notice. Without it the original English text is used.
    const i18n = config.i18n || null;
    const t = function (key, fallback, params) {
      if (!i18n) { return fallback; }
      const value = params ? i18n.t(key, params) : i18n.t(key);
      return typeof value === 'string' && value !== '' ? value : fallback;
    };

    const listEl = dom.qs('[data-history-list]', scope);
    const countEl = dom.qs('[data-history-count]', scope);
    const emptyEl = dom.qs('[data-history-empty]', scope);
    const noticeEl = dom.qs('[data-history-notice]', scope);
    const clearButton = dom.qs('[data-history-clear]', scope);

    if (!history || !listEl) {
      return null;
    }

    let entries = [];

    function resultTextOf(entry) {
      return typeof entry.resultText === 'string' && entry.resultText !== ''
        ? entry.resultText
        : format.formatNumber(entry.result);
    }

    function createItem(entry) {
      const item = dom.create('li', { class: 'history__item' });

      const select = dom.create('button', {
        class: 'history__entry',
        attrs: {
          type: 'button',
          'data-history-select': entry.id,
          'aria-label': t('history.aria.reuse', 'Reuse ' + entry.expression + ' equals ' + resultTextOf(entry),
            [entry.expression, resultTextOf(entry)])
        }
      });
      select.appendChild(dom.create('span', { class: 'history__expression', text: entry.expression }));
      select.appendChild(dom.create('span', { class: 'history__result', text: '= ' + resultTextOf(entry) }));

      if (entry.angleMode === 'deg' || entry.angleMode === 'rad') {
        select.appendChild(
          dom.create('span', {
            class: 'history__angle',
            text: entry.angleMode.toUpperCase(),
            attrs: { 'aria-label': t('history.aria.angle', 'calculated in ' + entry.angleMode.toUpperCase() + ' mode', [entry.angleMode.toUpperCase()]) }
          })
        );
      }

      const time = dom.create('span', {
        class: 'history__time',
        text: format.formatTimestamp(entry.timestamp)
      });

      const remove = dom.create('button', {
        class: 'history__remove',
        text: '\u00D7',
        attrs: {
          type: 'button',
          'data-history-remove': entry.id,
          'aria-label': t('history.aria.remove', 'Remove ' + entry.expression + ' from history', [entry.expression])
        }
      });

      item.appendChild(select);
      item.appendChild(time);
      item.appendChild(remove);
      return item;
    }

    function render(nextEntries) {
      entries = nextEntries || [];
      dom.setText(countEl, String(entries.length));
      listEl.textContent = '';

      if (!entries.length) {
        dom.show(emptyEl);
        return;
      }

      dom.hide(emptyEl);
      const fragment = document.createDocumentFragment();
      entries.forEach(function (entry) {
        fragment.appendChild(createItem(entry));
      });
      listEl.appendChild(fragment);
    }

    function findEntry(id) {
      return entries.filter(function (entry) {
        return entry.id === id;
      })[0];
    }

    dom.delegate(listEl, '[data-history-select]', 'click', function (event, button) {
      event.preventDefault();
      const entry = findEntry(button.getAttribute('data-history-select'));
      if (entry) {
        onSelect(entry);
      }
    });

    dom.delegate(listEl, '[data-history-remove]', 'click', function (event, button) {
      event.preventDefault();
      history.remove(button.getAttribute('data-history-remove'));
    });

    dom.on(clearButton, 'click', function () {
      if (history.count() === 0) {
        return;
      }
      const confirmed = !root.confirm || root.confirm(
        t('history.confirm.clear', 'Clear the whole calculation history?')
      );
      if (confirmed) {
        history.clear();
      }
    });

    if (storage && !storage.isPersistent && noticeEl) {
      dom.setText(noticeEl, t('history.notice.storage', 'This browser blocks local storage, so the history is kept only until you close the tab.'));
      dom.show(noticeEl);
    } else {
      dom.hide(noticeEl);
    }

    history.subscribe(render);

    return {
      render: render,
      getEntries: function () {
        return entries.slice();
      }
    };
  }

  SMC.createHistoryView = createHistoryView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
