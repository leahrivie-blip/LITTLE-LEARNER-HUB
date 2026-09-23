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
  const classList = {
    _set: new Set(),
    add(name) { this._set.add(name); },
    remove(name) { this._set.delete(name); },
    contains(name) { return this._set.has(name); },
  };
  const document = {
    getElementById: (id) => nodes.get(id) || null,
    createElement: () => ({
      dataset: {},
      style: { setProperty() {}, removeProperty() {} },
      getBoundingClientRect: () => ({ height: 120, width: 320, top: 0, left: 0, bottom: 120, right: 320 }),
      setAttribute() {},
      addEventListener(_n, fn) { this.click = fn; },
      remove() { nodes.delete(this.id); },
    }),
    body: {
      classList,
      style: { setProperty() {}, removeProperty() {} },
      appendChild(node) { nodes.set(node.id, node); },
    },
  };
  const window = {
    location: { pathname: path },
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    gtag: (...args) => calls.push(args),
    requestAnimationFrame: (fn) => fn(),
    addEventListener() {},
    removeEventListener() {},
  };
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
