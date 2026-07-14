#!/usr/bin/env node
/**
 * Child Profile redesign slice 1 markers.
 * Run: node scripts/test-child-profile-redesign.js
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
const stylesCss = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("view shell supports child mode and hides list title in profile", () => {
  assert.match(indexHtml, /id="view-children"[^>]*data-child-mode="list"/);
  assert.match(indexHtml, /children-list-title/);
  assert.match(appJs, /function syncChildrenViewShell/);
  assert.match(appJs, /view\.dataset\.childMode/);
  assert.match(stylesCss, /#view-children:not\(\[data-child-mode="list"\]\) > \.children-list-title/);
});

test("identity header is classroom-first with primary actions", () => {
  assert.match(appJs, /profile-identity-hero/);
  assert.match(appJs, /function childProfileClassroomLabel/);
  assert.match(appJs, /data-quick-add-observation="\$\{child\.id\}"/);
  assert.match(appJs, /Open Daily Log/);
  assert.match(appJs, /data-switch-profile-child/);
  assert.doesNotMatch(appJs, /Child Workspace/);
});

test("five-tab IA with legacy normalization", () => {
  const tabsFn = appJs.match(/function renderChildProfileTabs\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(tabsFn, /\["overview", "Overview"\]/);
  assert.match(tabsFn, /\["observations", "Observations"\]/);
  assert.match(tabsFn, /\["goals", "Goals"\]/);
  assert.match(tabsFn, /\["reports", "Reports & Photos"\]/);
  assert.match(tabsFn, /\["records", "Records"\]/);
  assert.doesNotMatch(tabsFn, /\["documents", "Documents & Forms"\]/);
  assert.doesNotMatch(tabsFn, /\["timeline", "Timeline"\]/);
  assert.doesNotMatch(tabsFn, /\["photos", "Photos"\]/);
  assert.match(appJs, /function normalizeChildProfileTab/);
  assert.match(appJs, /function renderChildReportsPhotosTab/);
  assert.match(appJs, /function renderChildRecordsTab/);
});

test("overview uses dashboard cards and links to Daily Logs", () => {
  assert.match(appJs, /overview-dashboard-grid/);
  assert.match(appJs, /overview-dash-card/);
  assert.match(appJs, /Daily log \$\{completion\.percent\}% complete/);
  assert.match(appJs, /data-view="child-tools-daily-logs"/);
  assert.doesNotMatch(appJs, /Latest Activity[\s\S]{0,80}nextActivity/);
});

test("AI quick entry is demoted below tabs and collapsed", () => {
  const profileFn = appJs.match(/function renderSimpleChildProfile[\s\S]*?^function renderChildProfileTabs/m)?.[0] || "";
  assert.match(profileFn, /renderChildProfileTabs\(\)/);
  assert.match(profileFn, /renderChildProfileTabContent/);
  assert.match(profileFn, /renderChildAiQuickEntry/);
  const tabsIndex = profileFn.indexOf("renderChildProfileTabs");
  const aiIndex = profileFn.indexOf("renderChildAiQuickEntry");
  assert.ok(tabsIndex > -1 && aiIndex > tabsIndex, "AI quick entry should render after tabs");
  assert.match(appJs, /child-quick-entry-collapsed/);
  assert.match(appJs, /<details class="section-block child-quick-entry/);
});

test("shared empty-state helper exists", () => {
  assert.match(appJs, /function renderProfileEmptyState/);
  assert.match(stylesCss, /\.profile-empty-state/);
});

if (!process.exitCode) {
  console.log("\nAll child profile redesign tests passed.");
}
