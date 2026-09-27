/**
 * Smart Math Calculator - username store (server side)
 * -----------------------------------------------------------------------------
 * The registered-username list for the offline-first username feature. It holds
 * the MINIMUM data the feature needs and nothing else:
 *
 *   { "version": 1, "usernames": ["Kaif", "Rahul"] }
 *
 * Only the username strings are persisted. There is NO email, phone, password,
 * date of birth, location, IP address, user agent, device id, install id,
 * cookie, analytics id, question, calculator entry or AI conversation - and no
 * timestamp, because the array order already records the arrival order.
 *
 * Storage is a single JSON file written with node:fs. The project has no
 * database and no dependencies, and this feature must not introduce an external
 * service, so a file is the smallest safe store. The path is configurable with
 * USERNAMES_FILE and defaults to server/data/usernames.json.
 *
 * KNOWN LIMITATION (by design, not a bug):
 *   The only key is the username itself, so two different people who choose the
 *   same name share one record and are counted once. `total` is therefore the
 *   number of DISTINCT USERNAMES, not distinct people or installations.
 *   Fixing that would need an extra identifier (an install id, a device id or an
 *   IP), which this feature must not collect, so the ambiguity is documented
 *   instead of being hidden.
 *
 * Exposed API:
 *   validateUsername(value) -> { ok: true, username } | { ok: false, code }
 *   createUsernameStore(options) -> { file, list, add, count, exists, MAX_LENGTH }
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Longest accepted username after trimming and whitespace collapsing. */
const MAX_LENGTH = 24;
/** Hard cap so a single file can never grow without bound. */
const MAX_USERNAMES = 10000;
/** Bumped only if the stored shape ever changes. */
const STORAGE_VERSION = 1;
/** Default location, overridable with the USERNAMES_FILE environment variable. */
const DEFAULT_FILE = path.join(__dirname, 'data', 'usernames.json');

const MESSAGES = Object.freeze({
  required: 'Please choose a username.',
  tooLong: 'That username is too long. Please use ' + MAX_LENGTH + ' characters or fewer.',
  invalid: 'Use letters, digits, single spaces, dot, dash or underscore only.'
});

/** Machine codes (never provider or filesystem detail). */
const CODES = Object.freeze({
  required: 'username-required',
  tooLong: 'username-too-long',
  invalid: 'username-invalid'
});

/** Control characters become a space, then every run of spaces collapses to one. */
function normalize(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Letters and digits of any script, plus space, dot, dash and underscore.
 * Everything else (markup, quotes, slashes, backslashes, brackets) is rejected
 * rather than stored, so a username can never be mistaken for markup or a path.
 */
const ALLOWED_CHARACTERS = /^[\p{L}\p{N} ._-]+$/u;

/**
 * Normalizes and validates one username. Never throws.
 * @returns {{ok: true, username: string}|{ok: false, code: string, message: string}}
 */
function validateUsername(value) {
  if (typeof value !== 'string') {
    return { ok: false, code: CODES.required, message: MESSAGES.required };
  }
  const username = normalize(value);
  if (username === '') {
    return { ok: false, code: CODES.required, message: MESSAGES.required };
  }
  if (username.length > MAX_LENGTH) {
    return { ok: false, code: CODES.tooLong, message: MESSAGES.tooLong };
  }
  if (!ALLOWED_CHARACTERS.test(username)) {
    return { ok: false, code: CODES.invalid, message: MESSAGES.invalid };
  }
  return { ok: true, username: username };
}

/** Case-insensitive key, so "Rahul" and "rahul" are one record. */
function keyOf(username) {
  return username.toLowerCase();
}

/**
 * Creates the store. `options.file` is injectable so tests never touch the real
 * data file, and `options.readFile`/`options.writeFile` can be stubbed too.
 */
function createUsernameStore(options) {
  const config = options || {};
  const file = config.file || DEFAULT_FILE;
  const readFile = typeof config.readFile === 'function'
    ? config.readFile
    : function (target) { return fs.readFileSync(target, 'utf8'); };
  const writeFile = typeof config.writeFile === 'function'
    ? config.writeFile
    : function (target, contents) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      // Write to a sibling temp file first, then rename, so a crash mid-write
      // can never leave a half-written list behind.
      const temporary = target + '.tmp';
      fs.writeFileSync(temporary, contents, 'utf8');
      fs.renameSync(temporary, target);
    };

  /** Reads the list defensively: a missing or damaged file is an empty list. */
  function read() {
    let raw = null;
    try {
      raw = readFile(file);
    } catch (error) {
      return [];
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return [];
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.usernames)) {
      return [];
    }
    const seen = Object.create(null);
    const names = [];
    parsed.usernames.forEach(function (candidate) {
      const checked = validateUsername(candidate);
      if (!checked.ok) { return; }
      const key = keyOf(checked.username);
      if (seen[key]) { return; }
      seen[key] = true;
      names.push(checked.username);
    });
    return names.slice(0, MAX_USERNAMES);
  }

  function write(names) {
    writeFile(file, JSON.stringify({ version: STORAGE_VERSION, usernames: names }, null, 2) + '\n');
  }

  return {
    file: file,

    /** @returns {string[]} a copy of the list, in arrival order. */
    list: function () {
      return read();
    },

    /** @returns {number} the number of DISTINCT USERNAMES (see the limitation). */
    count: function () {
      return read().length;
    },

    /** @returns {boolean} true when this username is already registered. */
    exists: function (username) {
      const checked = validateUsername(username);
      if (!checked.ok) { return false; }
      const key = keyOf(checked.username);
      return read().some(function (existing) { return keyOf(existing) === key; });
    },

    /**
     * Registers a username. Idempotent and deterministic: registering an
     * existing username succeeds, changes nothing and reports duplicate:true, so
     * a retried offline sync never inflates the list and never errors.
     *
     * @param {string} value raw username from the request
     * @returns {{ok: boolean, code?: string, message?: string, username?: string,
     *            duplicate?: boolean, total?: number}}
     */
    add: function (value) {
      const checked = validateUsername(value);
      if (!checked.ok) {
        return { ok: false, code: checked.code, message: checked.message };
      }
      const names = read();
      const key = keyOf(checked.username);
      const existing = names.filter(function (name) { return keyOf(name) === key; })[0];
      if (existing !== undefined) {
        return { ok: true, username: existing, duplicate: true, total: names.length };
      }
      if (names.length >= MAX_USERNAMES) {
        return {
          ok: false,
          code: 'list-full',
          message: 'The username list is full. Please try again later.'
        };
      }
      names.push(checked.username);
      write(names);
      return { ok: true, username: checked.username, duplicate: false, total: names.length };
    }
  };
}

module.exports = {
  MAX_LENGTH: MAX_LENGTH,
  MAX_USERNAMES: MAX_USERNAMES,
  STORAGE_VERSION: STORAGE_VERSION,
  DEFAULT_FILE: DEFAULT_FILE,
  MESSAGES: MESSAGES,
  CODES: CODES,
  validateUsername: validateUsername,
  createUsernameStore: createUsernameStore
};