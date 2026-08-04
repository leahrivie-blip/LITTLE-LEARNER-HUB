#!/usr/bin/env node
/**
 * Bounded performance fix regressions.
 * Run: npm run test:perf-bounded-fixes
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const comms = fs.readFileSync(path.join(ROOT, "comms-center.js"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  ok(appJs.includes("let notificationBellLoadPromise"), "notification bell in-flight dedupe present");
  ok(appJs.includes("if (notificationBellLoadPromise) return notificationBellLoadPromise"), "bell coalesces concurrent refresh");
  ok(appJs.includes("librarySearchRemountTimer"), "library search remount debounce present");
  ok(appJs.includes("}, 200);"), "library search debounce delay present");
  ok(appJs.includes('addEventListener("input", renderAdminLegacyUploadsPanel)'), "admin search updates uploads panel only");
  ok(!appJs.includes('addEventListener("input", renderAdminDashboard)'), "admin search no longer remounts full dashboard");
  ok(appJs.includes('form?.dataset?.submitting === "1"'), "feedback submit lock present");
  ok(appJs.includes("delete form.dataset.submitting"), "feedback submit lock clears in finally");
  ok(appJs.includes("window.__LLH_SW_EARLY_REGISTERED"), "SW early-register guard present");
  ok(appJs.includes("navigator.serviceWorker.getRegistration"), "SW skips duplicate register when early-registered");
  ok(comms.includes("myMessagesState.loaded && !options.forceReload"), "messages skips loading flash when loaded");
  ok(comms.includes("silent: myMessagesState.loaded"), "mark-read/open use silent refresh when loaded");
  ok(sw.includes("20260804-trial-length-audit-r1"), "shell cache bumped for perf pass");
  ok(indexHtml.includes("20260804-trial-length-audit-r1"), "index cache bumped for perf pass");

  console.log(`PASS perf bounded fixes (${passed} asserts)`);
}

try {
  main();
} catch (error) {
  console.error("FAIL perf bounded fixes:", error.message || error);
  process.exit(1);
}
