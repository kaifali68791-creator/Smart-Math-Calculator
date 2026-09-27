/**
 * Smart Math Calculator - tiny DOM helpers
 * -----------------------------------------------------------------------------
 * Keeps the view modules short and consistent. No framework, no dependencies.
 *
 * Exposed API: SMC.dom.{ qs, qsa, on, delegate, setText, setClass, create, show, hide }
 */
(function (root) {
  'use strict';

  const SMC = (root.SMC = root.SMC || {});

  function qs(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function qsa(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function on(target, type, handler, options) {
    if (!target) {
      return function noop() {};
    }
    target.addEventListener(type, handler, options);
    return function off() {
      target.removeEventListener(type, handler, options);
    };
  }

  /** Event delegation: runs the handler when the event comes from `selector`. */
  function delegate(container, selector, type, handler) {
    return on(container, type, function (event) {
      const target = event.target && event.target.closest ? event.target.closest(selector) : null;
      if (target && container.contains(target)) {
        handler(event, target);
      }
    });
  }

  function setText(element, text) {
    if (element && element.textContent !== text) {
      element.textContent = text;
    }
  }

  function setClass(element, className, enabled) {
    if (!element) {
      return;
    }
    element.classList.toggle(className, !!enabled);
  }

  function show(element) {
    if (element) {
      element.hidden = false;
    }
  }

  function hide(element) {
    if (element) {
      element.hidden = true;
    }
  }

  /**
   * create('button', { class: 'key', text: '7', attrs: { 'data-value': '7' } })
   */
  function create(tagName, options) {
    const config = options || {};
    const element = document.createElement(tagName);
    if (config.class) {
      element.className = config.class;
    }
    if (config.text !== undefined) {
      element.textContent = config.text;
    }
    if (config.html !== undefined) {
      element.innerHTML = config.html;
    }
    const attrs = config.attrs || {};
    Object.keys(attrs).forEach(function (name) {
      if (attrs[name] !== undefined && attrs[name] !== null) {
        element.setAttribute(name, attrs[name]);
      }
    });
    return element;
  }

  SMC.dom = {
    qs: qs,
    qsa: qsa,
    on: on,
    delegate: delegate,
    setText: setText,
    setClass: setClass,
    show: show,
    hide: hide,
    create: create
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
