#!/usr/bin/env node
/** Static markers for Owner Testing Admin invite UX + typing safety. */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
const ui = fs.readFileSync(path.join(ROOT, "scripts/owner-testing-admin-ui.js"), "utf8");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const enrich = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");

assert.match(ui, /Copy Invite Link/);
assert.match(ui, /Email delivery unavailable on testing/);
assert.match(ui, /captureFormDrafts/);
assert.match(ui, /restoreFormDrafts/);
assert.match(ui, /captureDraftsBeforeUnmount/);
assert.match(ui, /ensureDraftListeners/);
assert.match(ui, /formDrafts/);
assert.match(ui, /formControl/);
assert.match(ui, /isTypingInOta/);
assert.match(ui, /state\.lastInvite/);
assert.match(ui, /inviteAccessCardHtml/);
assert.match(ui, /Generate instant temp password login/);
assert.doesNotMatch(ui, /Generate test login now \(temp password — testing only\)/);

assert.match(app, /rememberPendingTesterInvite/);
assert.match(app, /maybeAutoAcceptPendingTesterInvite/);
assert.match(app, /captureDraftsBeforeUnmount/);
assert.match(app, /reuseOta/);
assert.match(app, /Create account &amp; continue|Create account \& continue|Create account/);
assert.match(app, /Finish setting up your testing account/);
assert.match(app, /pendingTesterInvite/);

assert.match(enrich, /still editing|Keep typing/);
assert.match(enrich, /if \(state\.dirty \|\| state\.saveQueued\)/);

console.log("PASS  ota invite + typing markers");
