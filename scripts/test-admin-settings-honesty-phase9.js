#!/usr/bin/env node
/**
 * Phase 9 — Admin Settings honesty (no promised-but-absent controls).
 * Run: npm run test:admin-settings-honesty-phase9
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "admin-workspace.js"), "utf8");

assert.match(source, /Admin shortcuts/);
assert.match(source, /data-admin-lock/);
assert.match(source, /Open Media Library/);
assert.match(source, /Open Alerts/);
assert.doesNotMatch(source, /Device trust, lock admin, and workspace preferences/);
assert.doesNotMatch(source, /Admin preferences and device trust/);

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const sandbox = {
  console,
  escapeHtml,
  adminSession: () => null,
  adminNotificationState: { unreadCount: 0 },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  document: {
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
  },
  window: {},
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(source, sandbox, { filename: "admin-workspace.js" });
const api = sandbox.window.AdminWorkspace;
assert.ok(api && typeof api.renderAdminSettingsLanding === "function", "settings landing export");

const listeners = [];
const target = {
  innerHTML: "",
  querySelectorAll(sel) {
    if (String(sel).includes("data-admin-landing-tab")) {
      return [{ addEventListener: (type, fn) => listeners.push({ type, fn }) }];
    }
    return [];
  },
  querySelector() { return null; },
};
api.renderAdminSettingsLanding(target);
const html = String(target.innerHTML || "");
assert.match(html, /Admin shortcuts/i);
assert.match(html, /Open Media Library/);
assert.match(html, /Open Alerts/);
assert.match(html, /data-admin-lock/);
assert.match(html, /Lock Admin/);
assert.doesNotMatch(html, /Device trust/i);
assert.doesNotMatch(html, /Workspace preferences/i);
assert.match(html, /not available on this page yet/i);
assert.ok(html.includes("aria-label"), "accessible labels present");

console.log("PASS admin-settings-honesty-phase9");
