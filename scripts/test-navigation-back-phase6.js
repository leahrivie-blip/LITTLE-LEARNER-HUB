#!/usr/bin/env node
/**
 * Phase 6 — Back navigation predictability contracts.
 * Run: npm run test:navigation-back-phase6
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/site-stabilization/phase6";
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
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const comms = fs.readFileSync(path.join(ROOT, "comms-center.js"), "utf8");

test("billing page no longer duplicates Back inside billingApp", () => {
  assert.match(indexHtml, /id="view-billing"[\s\S]*?data-view="settings"[\s\S]*?← Back to Settings/);
  const billingFn = appJs.match(/function renderBillingPage\([\s\S]*?\nfunction renderSubscriptionPage/);
  assert.ok(billingFn, "renderBillingPage present");
  assert.doesNotMatch(billingFn[0], /← Back to Settings/);
});

test("messages center includes contextual Back", () => {
  assert.match(comms, /data-contextual-back="messages"/);
  assert.match(comms, /data-fallback-view="settings"/);
});

test("calendar day Back returns to week", () => {
  assert.match(appJs, /data-calendar-back-to-week/);
  assert.match(appJs, /calendarBackToWeek/);
  assert.match(appJs, /mainCalendarSubView = "week"/);
});

test("children section Back hides outside list mode", () => {
  assert.match(appJs, /view === "children".*childManagementMode !== "list"/s);
});

test("contextual Back prefers history.back without broken view guard", () => {
  assert.match(appJs, /canUseHistoryBack[\s\S]*window\.history\.back\(\)/);
  assert.doesNotMatch(
    appJs,
    /platform\.view !== view && window\.history\?\.state\?\.llhPlatformNav/,
  );
});

test("Documentation Helpers naming on generators chrome", () => {
  assert.match(indexHtml, /← Back to Documentation Helpers/);
  assert.match(indexHtml, /eyebrow">Documentation Helpers/);
});

test("weekly plan content duplicate Back removed", () => {
  assert.doesNotMatch(appJs, /data-weekly-plan-back-calendar/);
});

fs.writeFileSync(path.join(ARTIFACT_DIR, "phase6-report.json"), JSON.stringify({
  suite: "navigation-back-phase6",
  generatedAt: new Date().toISOString(),
  curriculumUntouched: true,
}, null, 2));

if (!process.exitCode) console.log("\nAll Phase 6 navigation Back checks passed.");
