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
assert.match(source, /Teaching Kit feature flags/);
assert.match(source, /Customer Teaching Kit access/);
assert.match(source, /Owner \/ Admin authoring tools/);
assert.match(source, /data-tk-flags-save/);
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
  effectiveSiteContent: () => ({
    featureFlags: {
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitAttachments: false,
      teachingKitEnrichmentEditor: true,
      teachingKitAuthoring: true,
      teachingKitCurriculumDirector: true,
      teachingKitQualityReview: true,
    },
  }),
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
  querySelector(sel) {
    if (String(sel).includes("data-tk-flags-save")) {
      return { addEventListener: (type, fn) => listeners.push({ type, fn, sel }), disabled: false };
    }
    if (String(sel).includes("data-tk-flags-message")) {
      return { textContent: "" };
    }
    if (String(sel).includes("data-tk-flag=")) {
      return { checked: false };
    }
    return null;
  },
};
api.renderAdminSettingsLanding(target);
const html = String(target.innerHTML || "");
assert.match(html, /Admin shortcuts/i);
assert.match(html, /Open Media Library/);
assert.match(html, /Open Alerts/);
assert.match(html, /data-admin-lock/);
assert.match(html, /Lock Admin/);
assert.match(html, /Teaching Kit feature flags/i);
assert.match(html, /Customer Teaching Kit access/i);
assert.match(html, /Owner \/ Admin authoring tools/i);
assert.match(html, /data-tk-flags-save/);
assert.match(html, /data-tk-flag="teachingKitEnrichmentEditor"/);
assert.match(html, /data-tk-flag="teachingKitViewer"/);
assert.doesNotMatch(html, /Device trust/i);
assert.doesNotMatch(html, /Workspace preferences/i);
assert.match(html, /not available on this page yet/i);
assert.ok(html.includes("aria-label"), "accessible labels present");

console.log("PASS admin-settings-honesty-phase9");
