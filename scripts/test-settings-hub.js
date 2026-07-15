#!/usr/bin/env node
/**
 * Settings hub structure checks (Phase 5).
 * Run: node scripts/test-settings-hub.js
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
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("settings hub includes required section groups", () => {
  assert.match(appJs, /function renderSettingsHubPage/);
  assert.match(appJs, /Account & Membership/);
  assert.match(appJs, /Account Actions/);
  assert.match(appJs, /data-settings-sign-out/);
  assert.match(appJs, /Staff & Permissions/);
  assert.match(appJs, /Forms Settings/);
  assert.match(appJs, /Curriculum Settings/);
  assert.match(appJs, /Billing managed by owner/);
});

test("forms and curriculum settings pages exist", () => {
  assert.match(appJs, /function renderFormsSettingsPage/);
  assert.match(appJs, /function renderCurriculumSettingsPage/);
  assert.match(html, /id="view-forms-settings"/);
  assert.match(html, /id="view-curriculum-settings"/);
  assert.match(html, /id="accountNotifications"/);
  assert.match(html, /name="hoursOpen"/);
});

test("account and program settings navigate back to settings hub", () => {
  assert.match(html, /data-view="settings"[^>]*>← Back to Settings/);
  assert.match(appJs, /canAccessPlatformFeature\("billing"\)/);
});

if (!process.exitCode) {
  console.log("\nAll settings-hub tests passed.");
}
