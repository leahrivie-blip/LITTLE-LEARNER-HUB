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
  assert.match(appJs, /Account Actions/);
  assert.match(appJs, /data-settings-sign-out/);
  assert.match(appJs, /Staff and Permissions/);
  assert.match(appJs, /Forms and Records/);
  assert.match(appJs, /Planning Preferences/);
  assert.match(appJs, /Billing managed by owner/);
});

test("Phase 22: Settings is reorganized into the specified groups with search", () => {
  [
    "My Account",
    "Billing and Subscription",
    "Program",
    "Staff and Permissions",
    "Children and Families",
    "Planning Preferences",
    "Forms and Records",
    "Communication and Notifications",
    "Privacy and Security",
    "Integrations",
  ].forEach((title) => {
    assert.match(appJs, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing settings group "${title}"`);
  });
  assert.match(appJs, /function bindSettingsHubSearch/);
  assert.match(appJs, /id="settingsHubSearchInput"/);
  assert.match(appJs, /data-settings-search-text/);
  assert.match(appJs, /Cancel Subscription/);
  assert.match(appJs, /settings-hub-tag-owner/);
  assert.match(appJs, /settings-hub-tag-computer/);
  // Testing & Advanced Tools is admin-only, gated behind hasAdminFullAccess().
  assert.match(appJs, /isAdmin\s*\?\s*\[\{\s*\n\s*title: "Testing and Advanced Tools"/);
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
