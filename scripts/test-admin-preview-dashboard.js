#!/usr/bin/env node
/**
 * Admin preview simulator + Owner Command Center analytics hardening.
 * Run: node scripts/test-admin-preview-dashboard.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const root = path.join(__dirname, "..");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

test("setAdminPreviewMode applies full platform refresh", () => {
  assert.match(appJs, /function setAdminPreviewMode\(/);
  assert.match(appJs, /function applyAdminPreviewToPlatform\(/);
  assert.match(appJs, /function refreshAdminPreviewBadge\(/);
  assert.match(appJs, /llh:admin-preview-changed/);
  assert.match(appJs, /setAdminPreviewMode\(adminPreviewButton\.dataset\.adminPreview/);
});

test("preview-aware plan labels and Return to Admin UX exist", () => {
  assert.match(appJs, /function previewAwarePlanLabel\(/);
  assert.match(appJs, /function previewAwarePriceLabel\(/);
  assert.match(appJs, /data-admin-return-admin/);
  assert.match(appJs, /Return to Admin/);
  assert.match(appJs, /Previewing as \$\{mode\}/);
  assert.match(css, /\.admin-preview-badge/);
  assert.match(css, /admin-preview-simulating/);
});

test("preview click no longer only re-renders admin + one category", () => {
  assert.doesNotMatch(
    appJs,
    /localStorage\.setItem\("llhAdminPreviewMode", adminPreviewButton\.dataset\.adminPreview\);\s*updateAuthButtons\(\);\s*updatePlanLabel\(\);\s*renderAdminDashboard\(\);/,
  );
  assert.match(appJs, /dismissResourceViewerForNavigation/);
  assert.match(appJs, /renderGeneratorWorkspace/);
  assert.match(appJs, /renderMainCalendar/);
});

test("analytics load has timeout, abort, retry, and no duplicate listener", () => {
  assert.match(appJs, /ADMIN_ANALYTICS_TIMEOUT_MS/);
  assert.match(appJs, /adminAnalyticsAbortController/);
  assert.match(appJs, /AbortController/);
  assert.match(appJs, /LOCAL_ADMIN_TOKENS/);
  assert.match(appJs, /data-admin-analytics-state="error"/);
  assert.match(appJs, /Tap Retry/);
  assert.doesNotMatch(
    appJs,
    /target\.querySelector\("#adminRefreshAnalyticsButton"\)\?\.addEventListener\("click"/,
  );
});

test("cache bust versions stay aligned", () => {
  const indexCss = indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1];
  const indexJs = indexHtml.match(/app\.js\?v=([^"]+)/)?.[1];
  assert.equal(indexCss, "20260714-admin-preview-fix");
  assert.equal(indexJs, "20260714-admin-preview-fix");
  assert.match(sw, /styles\.css\?v=20260714-admin-preview-fix/);
  assert.match(sw, /app\.js\?v=20260714-admin-preview-fix/);
  assert.match(sw, /llh-shell-v28-admin-preview-fix/);
});

if (!process.exitCode) {
  console.log("\nAll admin preview / dashboard tests passed.");
}
