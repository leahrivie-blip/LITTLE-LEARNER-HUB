#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "google-ads-free-signup-conversion.js"),
  "utf8",
);
const SEND_TO = "AW-18405245658/fkIMCOi6xO0cENqFp8hE";

function boot({ consent, gtag } = {}) {
  const session = new Map();
  const window = {
    LLHGoogleConsent: consent === undefined ? undefined : { hasConsent: () => consent },
    gtag,
    sessionStorage: {
      getItem: (key) => session.get(key) || null,
      setItem: (key, value) => session.set(key, value),
    },
  };
  vm.runInNewContext(source, { window });
  return { api: window.LLHGoogleAdsFreeSignupConversion, session };
}

function successfulSignup({ consent = true } = {}) {
  const calls = [];
  const app = boot({ consent, gtag: (...args) => calls.push(args) });
  assert.equal(app.api.markAccountCreated(), true);
  return { ...app, calls };
}

// Firebase and local account-creation success both authorize the same final
// Free-plan completion event; neither dispatches until the final method runs.
for (const method of ["Firebase", "local email/password"]) {
  const app = successfulSignup();
  assert.equal(app.calls.length, 0, `${method}: account creation alone must not dispatch`);
  assert.equal(app.api.emitAfterFreeSignupCompletion(), true, `${method}: final Free completion must dispatch`);
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0][0], "event");
  assert.equal(app.calls[0][1], "conversion");
  assert.equal(app.calls[0][2].send_to, SEND_TO);
}

// Button clicks, page loads, failed requests, and canceled signup never set the
// account-created marker, so the final method cannot emit a conversion.
for (const scenario of ["button click", "page load", "failed signup", "canceled signup"]) {
  const app = boot({ consent: true, gtag: () => { throw new Error("must not run"); } });
  assert.equal(app.api.emitAfterFreeSignupCompletion(), false, `${scenario}: must not dispatch`);
}

for (const consent of [false, null]) {
  const app = successfulSignup({ consent });
  assert.equal(app.api.emitAfterFreeSignupCompletion(), false, `consent ${String(consent)} must block`);
  assert.equal(app.calls.length, 0);
}

{
  const app = boot({ gtag: () => { throw new Error("must not run"); } });
  app.api.markAccountCreated();
  assert.equal(app.api.emitAfterFreeSignupCompletion(), false, "missing consent must block");
}

{
  const app = boot({ consent: true });
  app.api.markAccountCreated();
  assert.doesNotThrow(() => app.api.emitAfterFreeSignupCompletion());
  assert.equal(app.api.emitAfterFreeSignupCompletion(), false, "missing gtag must not mark dispatched");
}

{
  const app = boot({ consent: true, gtag: () => { throw new Error("gtag unavailable"); } });
  app.api.markAccountCreated();
  assert.doesNotThrow(() => app.api.emitAfterFreeSignupCompletion());
  assert.equal(app.api.emitAfterFreeSignupCompletion(), false, "throwing gtag is deduped safely");
}

{
  const app = successfulSignup();
  assert.equal(app.api.emitAfterFreeSignupCompletion(), true);
  assert.equal(app.api.emitAfterFreeSignupCompletion(), false, "duplicate dispatch must be blocked");
  assert.equal(app.calls.length, 1);
}

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.match(
  appJs,
  /createUserWithEmailAndPassword[\s\S]*?markAccountCreated\(\)[\s\S]*?return \{ email: cleanEmail/,
  "Firebase success must mark account creation before returning",
);
assert.match(
  appJs,
  /passwordHash: await localPasswordHash\(password\),[\s\S]*?markAccountCreated\(\)[\s\S]*?return \{ email: cleanEmail/,
  "Local success must mark account creation before returning",
);
assert.match(
  appJs,
  /if \(planChoice === "free"\) \{[\s\S]*?emitAfterFreeSignupCompletion\(\)/,
  "conversion must dispatch only in the completed Free-plan branch",
);

console.log("PASS: guarded Google Ads Free signup conversion");
