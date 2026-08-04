#!/usr/bin/env node
/**
 * Phase 7 — Toast / cookie / download confirmation contracts.
 * Run: npm run test:toasts-phase7
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/site-stabilization/phase7";
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

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

const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

test("single toast helpers and body class", () => {
  assert.match(appJs, /function hideActionFeedback/);
  assert.match(appJs, /function showActionFeedback\(message, action = null, options = \{\}\)/);
  assert.match(appJs, /has-action-toast/);
  assert.match(appJs, /One toast at a time/);
});

test("download confirmation uses short toast after busy clears", () => {
  assert.match(appJs, /queueMicrotask\(\(\) => showActionFeedback\("Download started\."/);
  assert.match(appJs, /ttlMs: 3200/);
});

test("cookie notice cannot cover action toast", () => {
  assert.match(css, /\.after-action-prompt\s*\{[\s\S]*z-index:\s*13050/);
  assert.match(css, /body\.has-action-toast \.llh-meta-cookie-notice/);
  assert.match(css, /body\.has-meta-cookie-notice \.after-action-prompt\.visible/);
});

test("install card deferred while cookie/toast visible", () => {
  assert.match(appJs, /contains\("has-meta-cookie-notice"\)\) return false/);
  assert.match(appJs, /contains\("has-action-toast"\)\) return false/);
});

fs.writeFileSync(path.join(ARTIFACT_DIR, "phase7-report.json"), JSON.stringify({
  suite: "toasts-phase7",
  generatedAt: new Date().toISOString(),
  curriculumUntouched: true,
}, null, 2));

if (!process.exitCode) console.log("\nAll Phase 7 toast/notification checks passed.");
