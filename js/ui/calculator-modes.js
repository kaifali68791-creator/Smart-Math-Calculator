/**
 * Smart Math Calculator - calculator mode controls (Part 2)
 * -----------------------------------------------------------------------------
 * Keeps two small switches in sync with the settings store:
 *
 *   calculator mode  Basic | Scientific   (stored as "calculatorMode")
 *   angle unit       DEG   | RAD          (stored as "angleMode", default DEG)
 *
 * The switches are plain buttons in the HTML:
 *   <button data-calc-mode-toggle="basic">, <button data-angle-toggle="rad">, ...
 * The controller mirrors the state with is-active / aria-pressed and flips an
 * is-scientific class on [data-calculator], which is all the CSS needs to show
 * or hide the scientific keypad.
 *
 * Exposed API: SMC.createCalculatorModeControls({ settings, scope })
 *   -> { getCalculatorMode, setCalculatorMode, getAngleMode, setAngleMode,
 *        subscribe }
 */
(function (root) {
  'use strict';

  const SMC = (root.SMC = root.SMC || {});
  const dom = SMC.dom;

  const CALCULATOR_MODES = ['basic', 'scientific'];
  const ANGLE_MODES = ['deg', 'rad'];

  function normalize(list, value, fallback) {
    return list.indexOf(value) === -1 ? fallback : value;
  }

  function reflectButtons(scope, attribute, activeValue) {
    dom.qsa('[' + attribute + ']', scope).forEach(function (button) {
      const isActive = button.getAttribute(attribute) === activeValue;
      dom.setClass(button, 'is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function createCalculatorModeControls(options) {
    const config = options || {};
    const settings = config.settings || null;
    const scope = config.scope || document;
    const host = dom.qs('[data-calculator]', scope);
    const listeners = [];

    let calculatorMode = normalize(
      CALCULATOR_MODES,
      settings ? settings.get('calculatorMode', 'basic') : 'basic',
      'basic'
    );
    let angleMode = normalize(
      ANGLE_MODES,
      settings ? settings.get('angleMode', 'deg') : 'deg',
      'deg'
    );

    function currentState() {
      return { calculatorMode: calculatorMode, angleMode: angleMode };
    }

    function notify() {
      const state = currentState();
      for (let i = 0; i < listeners.length; i += 1) {
        listeners[i](state);
      }
      return state;
    }

    function reflect() {
      if (host) {
        dom.setClass(host, 'is-scientific', calculatorMode === 'scientific');
        dom.setClass(host, 'is-basic', calculatorMode === 'basic');
        host.setAttribute('data-angle-mode', angleMode);
      }
      reflectButtons(scope, 'data-calc-mode-toggle', calculatorMode);
      reflectButtons(scope, 'data-angle-toggle', angleMode);
      return notify();
    }

    function setCalculatorMode(mode) {
      calculatorMode = normalize(CALCULATOR_MODES, mode, 'basic');
      if (settings) {
        settings.set('calculatorMode', calculatorMode);
      }
      return reflect();
    }

    function setAngleMode(mode) {
      angleMode = normalize(ANGLE_MODES, mode, 'deg');
      if (settings) {
        settings.set('angleMode', angleMode);
      }
      return reflect();
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return function noop() {};
      }
      listeners.push(listener);
      listener(currentState());
      return function unsubscribe() {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    }

    dom.qsa('[data-calc-mode-toggle]', scope).forEach(function (button) {
      dom.on(button, 'click', function () {
        setCalculatorMode(button.getAttribute('data-calc-mode-toggle'));
      });
    });

    dom.qsa('[data-angle-toggle]', scope).forEach(function (button) {
      dom.on(button, 'click', function () {
        setAngleMode(button.getAttribute('data-angle-toggle'));
      });
    });

    reflect();

    return {
      getCalculatorMode: function () {
        return calculatorMode;
      },
      setCalculatorMode: setCalculatorMode,
      getAngleMode: function () {
        return angleMode;
      },
      setAngleMode: setAngleMode,
      subscribe: subscribe
    };
  }

  SMC.createCalculatorModeControls = createCalculatorModeControls;
})(typeof globalThis !== 'undefined' ? globalThis : this);
