#!/usr/bin/env node
/**
 * Smart Math Calculator - admin CLI for the username list
 * -----------------------------------------------------------------------------
 *   node server/admin-usernames.js
 *
 * This is the ADMIN-ONLY way to read the registered usernames. It runs on the
 * machine that owns the data file, so it needs no password and puts no secret
 * anywhere: there is nothing to leak into frontend code, a cookie or a URL.
 *
 * The equivalent HTTP route (GET /api/admin/usernames) is additionally
 * protected by the server-side ADMIN_TOKEN environment variable, compared in
 * constant time. That route is the right choice for a remote admin; this CLI is
 * the right choice for the local machine. Neither is reachable without the
 * filesystem (or the token), and neither is linked from the app UI.
 *
 * It prints:
 *   Total Users: 24
 *   1. Kaif
 *   2. Rahul
 *
 * LIMITATION: `total` counts DISTINCT USERNAMES, not distinct people. The
 * feature collects no install id, device id or IP, so two people who pick the
 * same name are one record. This is documented, not silently "fixed".
 */
'use strict';

const { readConfig } = require('./config');
const { createUsernameStore } = require('./usernames');

function main() {
  const config = readConfig(process.env);
  const store = createUsernameStore(config.usernamesFile ? { file: config.usernamesFile } : {});
  const names = store.list();

  console.log('Total Users: ' + names.length);
  names.forEach(function (name, index) {
    console.log((index + 1) + '. ' + name);
  });
  if (names.length === 0) {
    console.log('(the list is empty - no username has been synced yet)');
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    // Never print a stack trace or a filesystem path to the console output.
    console.error('Could not read the username list.');
    process.exitCode = 1;
  }
}

module.exports = { main: main };