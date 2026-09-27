/**
 * Smart Math Calculator - navigation between views
 * -----------------------------------------------------------------------------
 * Generic view switcher used by the "Calculator" and "Smart Solver" tabs.
 * Views are plain <section data-view-panel="name"> elements and the triggers are
 * <button data-view-target="name">. Adding a new section later (Settings,
 * Statistics, Admin, ...) only needs those two attributes in the HTML - no
 * JavaScript changes.
 *
 * Exposed API: SMC.createNavigation(options) -> { activate, getActive, subscribe }
 */
(function (root) {
  'use strict';

  const SMC = (root.SMC = root.SMC || {});
  const dom = SMC.dom;

  function createNavigation(options) {
    const config = options || {};
    const scope = config.scope || document;
    const buttons = dom.qsa('[data-view-target]', scope);
    const panels = dom.qsa('[data-view-panel]', scope);
    const listeners = [];

    if (!panels.length) {
      return null;
    }

    const available = panels.map(function (panel) {
      return panel.getAttribute('data-view-panel');
    });

    const initialPanel = panels.filter(function (panel) {
      return !panel.hidden;
    })[0];
    let active = initialPanel ? initialPanel.getAttribute('data-view-panel') : available[0];

    function isAvailable(name) {
      return available.indexOf(name) !== -1;
    }

    function activate(name) {
      if (!isAvailable(name)) {
        return active;
      }
      active = name;

      panels.forEach(function (panel) {
        const isActive = panel.getAttribute('data-view-panel') === name;
        panel.hidden = !isActive;
        dom.setClass(panel, 'is-active', isActive);
      });

      buttons.forEach(function (button) {
        const isActive = button.getAttribute('data-view-target') === name;
        dom.setClass(button, 'is-active', isActive);
        if (isActive) {
          button.setAttribute('aria-current', 'true');
        } else {
          button.removeAttribute('aria-current');
        }
      });

      for (let i = 0; i < listeners.length; i += 1) {
        listeners[i](name);
      }
      return active;
    }

    buttons.forEach(function (button) {
      dom.on(button, 'click', function () {
        activate(button.getAttribute('data-view-target'));
      });
    });

    activate(active);

    return {
      activate: activate,
      getActive: function () {
        return active;
      },
      subscribe: function (listener) {
        if (typeof listener === 'function') {
          listeners.push(listener);
        }
        return function unsubscribe() {
          const index = listeners.indexOf(listener);
          if (index !== -1) {
            listeners.splice(index, 1);
          }
        };
      }
    };
  }

  SMC.createNavigation = createNavigation;
})(typeof globalThis !== 'undefined' ? globalThis : this);
