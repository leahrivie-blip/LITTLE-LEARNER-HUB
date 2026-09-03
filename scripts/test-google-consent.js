#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("scripts/google-consent.js", "utf8");
const storage = new Map([["gclid", "x"], ["llhAttribution", "x"]]);
const calls = [];
function boot(path = "/") {
  const nodes = new Map();
  const document = {
    getElementById: (id) => nodes.get(id) || null,
    createElement: () => ({ dataset: {}, addEventListener(_n, fn) { this.click = fn; }, remove() { nodes.delete(this.id); } }),
    body: { appendChild(node) { nodes.set(node.id, node); } },
  };
  const window = { location: { pathname: path }, localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) }, gtag: (...args) => calls.push(args) };
  vm.runInNewContext(source, { window, document });
  return { window, document };
}
let app = boot();
assert.ok(app.document.getElementById("llhGoogleConsentBanner"));
app.window.LLHGoogleConsent.update(true);
assert.equal(app.window.LLHGoogleConsent.hasConsent(), true);
app = boot("/privacy-settings");
assert.ok(app.document.getElementById("llhGoogleConsentBanner"));
app.window.LLHGoogleConsent.update(false);
assert.equal(app.window.LLHGoogleConsent.hasConsent(), false);
assert.ok(calls.some((c) => c[0] === "consent" && c[2].ad_storage === "denied"));
console.log("PASS: Google consent persistence and settings controls");
