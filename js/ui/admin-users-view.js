/**
 * Smart Math Calculator - private admin user-management view
 * -----------------------------------------------------------------------------
 * The DOM layer for the admin page (admin.html). It is a STANDALONE page: it is
 * not a [data-view-panel], it is not reachable from the normal navigation, and
 * nothing in index.html links to it. The normal application is untouched.
 *
 * SAFETY
 *   * Every username is written with textContent - never innerHTML - so a name
 *     can never become markup.
 *   * The token is read from the input on submit and handed straight to the
 *     service; this file never stores it, echoes it or logs it, and the input is
 *     cleared as soon as the attempt finishes.
 *   * Hiding this page is NOT the security mechanism. The server's existing
 *     ADMIN_TOKEN check is: a wrong token simply returns the safe message and
 *     no usernames.
 *
 * Exposed API: createAdminUsersView({ service }) -> { init, showLogin, showPanel }
 */
(function (root) {
  'use strict';

  const SMC = (root.SMC = root.SMC || {});
  const dom = SMC.dom;

  function createAdminUsersView(options) {
    const config = options || {};
    const service = config.service;

    const loginPanel = dom.qs('[data-admin-login]');
    const tokenForm = dom.qs('[data-admin-token-form]');
    const tokenInput = dom.qs('[data-admin-token]');
    const loginButton = dom.qs('[data-admin-login-submit]');
    const loginError = dom.qs('[data-admin-login-error]');

    const dashboard = dom.qs('[data-admin-dashboard]');
    const totalBox = dom.qs('[data-admin-total]');
    const listBox = dom.qs('[data-admin-usernames]');
    const listEmpty = dom.qs('[data-admin-empty]');
    const refreshButton = dom.qs('[data-admin-refresh]');
    const logoutButton = dom.qs('[data-admin-logout]');
    const panelError = dom.qs('[data-admin-error]');

    if (!service || !loginPanel || !tokenForm || !tokenInput || !dashboard) {
      return null;
    }

    function clearNode(element) {
      while (element && element.firstChild) {
        element.removeChild(element.firstChild);
      }
    }

    function showError(element, message) {
      dom.setText(element, message);
      dom.show(element);
    }

    function clearError(element) {
      dom.setText(element, '');
      dom.hide(element);
    }

    /** Draws the total and the numbered list. Usernames go in as text only. */
    function render(outcome) {
      const usernames = outcome.usernames || [];
      dom.setText(totalBox, 'Total Users: ' + (typeof outcome.total === 'number' ? outcome.total : usernames.length));
      clearNode(listBox);
      usernames.forEach(function (name, index) {
        const item = dom.create('li', { class: 'admin__item' });
        // textContent only: a username can never be parsed as markup.
        dom.setText(item, (index + 1) + '. ' + name);
        listBox.appendChild(item);
      });
      if (usernames.length === 0) {
        dom.show(listEmpty);
      } else {
        dom.hide(listEmpty);
      }
    }

    /** Wipes every trace of the previous session from the page. */
    function resetPanel() {
      dom.setText(totalBox, '');
      clearNode(listBox);
      clearError(panelError);
      dom.hide(listEmpty);
    }

    function showLogin() {
      resetPanel();
      dom.hide(dashboard);
      dom.show(loginPanel);
      tokenInput.value = '';
      if (typeof tokenInput.focus === 'function') {
        tokenInput.focus();
      }
    }

    function showPanel() {
      dom.hide(loginPanel);
      dom.show(dashboard);
    }

    /** Signs in with whatever is currently typed in the field. */
    function submitToken() {
      clearError(loginError);
      const typed = tokenInput.value;
      // Clear the field immediately: the value now lives only in the service.
      tokenInput.value = '';
      service.signIn(typed).then(function (outcome) {
        if (!outcome.ok) {
          // One safe message for every failure. No detail, no logging.
          showError(loginError, outcome.message || 'Invalid admin token.');
          showLogin();
          return;
        }
        clearError(loginError);
        render(outcome);
        showPanel();
      });
    }

    function refresh() {
      clearError(panelError);
      service.refresh().then(function (outcome) {
        if (!outcome.ok) {
          // The token stopped working (or the network did): drop back to login
          // and clear the list rather than showing stale data.
          showError(loginError, outcome.message || 'Invalid admin token.');
          showLogin();
          return;
        }
        render(outcome);
      });
    }

    function logout() {
      service.signOut();
      showLogin();
    }

    dom.on(tokenForm, 'submit', function (event) {
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      submitToken();
    });
    dom.on(tokenInput, 'input', function () {
      clearError(loginError);
    });
    dom.on(refreshButton, 'click', refresh);
    dom.on(logoutButton, 'click', logout);
    // A busy state that never leaks the token, only improves the feel.
    dom.on(loginButton, 'click', function () {
      clearError(loginError);
    });

    function init() {
      // Always start at the login panel: no session, no stored token.
      showLogin();
    }

    return {
      init: init,
      showLogin: showLogin,
      showPanel: showPanel,
      render: render,
      logout: logout
    };
  }

  SMC.createAdminUsersView = createAdminUsersView;
})(typeof globalThis !== 'undefined' ? globalThis : this);