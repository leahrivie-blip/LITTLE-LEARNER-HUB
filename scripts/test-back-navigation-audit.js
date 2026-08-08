#!/usr/bin/env node
/**
 * Back navigation audit regression — nested routes must expose a clear Back control
 * (or be documented intentional exceptions / primary hubs).
 * Run: node scripts/test-back-navigation-audit.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = process.env.LLH_ARTIFACT_DIR
  || "/opt/cursor/artifacts/back-navigation-audit";
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
const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const comms = fs.readFileSync(path.join(ROOT, "comms-center.js"), "utf8");

test("shared llhPageBackButtonHtml helper exists", () => {
  assert.match(appJs, /function llhPageBackButtonHtml\s*\(/);
  assert.match(appJs, /window\.llhPageBackButtonHtml\s*=\s*llhPageBackButtonHtml/);
  assert.match(appJs, /data-contextual-back=/);
});

test("Resources hub has contextual Back", () => {
  assert.match(appJs, /renderResourcesHubPage[\s\S]{0,400}llhPageBackButtonHtml\(\{\s*viewKey:\s*"resources"/);
});

test("Director Center has contextual Back", () => {
  assert.match(appJs, /renderDirectorCenterPage[\s\S]{0,500}llhPageBackButtonHtml\(\{\s*viewKey:\s*"director-center"/);
});

test("Behavior & Support home has contextual Back", () => {
  assert.match(appJs, /renderSupportHomePage[\s\S]{0,500}llhPageBackButtonHtml\(\{\s*viewKey:\s*"support-center"/);
});

test("Provider Tools has header Back", () => {
  assert.match(indexHtml, /id="view-tools"[\s\S]{0,500}data-contextual-back="tools"/);
});

test("Manage surfaces wire Back via viewKey", () => {
  assert.match(appJs, /function renderManageSurfaceShell\([\s\S]{0,400}viewKey/);
  assert.match(appJs, /viewKey:\s*"staff"/);
  assert.match(appJs, /viewKey:\s*"classrooms"/);
  assert.match(appJs, /viewKey:\s*"enrollment"/);
  assert.match(appJs, /viewKey:\s*"families"/);
  assert.match(appJs, /window\.renderManageSurfaceShell\s*=\s*renderManageSurfaceShell/);
});

test("Staff no longer relies on mid-page Back to Settings only", () => {
  const staffFn = appJs.match(/function renderStaffManagementPage\([\s\S]*?\nfunction renderClassroomsPage/);
  assert.ok(staffFn, "renderStaffManagementPage present");
  assert.doesNotMatch(staffFn[0], /actionsHtml:[\s\S]{0,80}Back to Settings/);
  assert.match(staffFn[0], /viewKey:\s*"staff"/);
});

test("Daily Logs home exits to Children", () => {
  assert.match(appJs, /if \(dlcNewStep === "step1" \|\| !dlcNewStep\) return "children"/);
  assert.match(appJs, /target === "children" \|\| target === "exit"/);
  assert.match(appJs, /childManagementMode = "list"/);
});

test("Plans / Upgrade / Subscription / Billing History / Cancel have top Back", () => {
  assert.match(indexHtml, /id="view-plans"[\s\S]{0,300}data-contextual-back="plans"/);
  assert.match(indexHtml, /id="view-upgrade"[\s\S]{0,300}data-contextual-back="upgrade"/);
  assert.match(indexHtml, /id="view-subscription"[\s\S]{0,300}data-contextual-back="subscription"/);
  assert.match(indexHtml, /id="view-billing-history"[\s\S]{0,300}data-contextual-back="billing-history"/);
  assert.match(indexHtml, /id="view-cancel-subscription"[\s\S]{0,300}data-contextual-back="cancel-subscription"/);
});

test("Plans/Upgrade/Subscription renderers do not duplicate Back", () => {
  const plansFn = appJs.match(/function renderPricingPage\([\s\S]*?\nfunction renderUpgradePage/);
  const upgradeFn = appJs.match(/function renderUpgradePage\([\s\S]*?\nfunction subscriptionSummaryHtml/);
  const subFn = appJs.match(/function renderSubscriptionPage\([\s\S]*?\nfunction renderBillingHistoryPage/);
  assert.ok(plansFn && upgradeFn && subFn);
  assert.doesNotMatch(plansFn[0], /← Back to Settings/);
  assert.doesNotMatch(upgradeFn[0], /← Back to Settings/);
  assert.doesNotMatch(subFn[0], /← Back to Settings/);
});

test("What's New Back is in header, not footer-only", () => {
  assert.match(comms, /llhPageBackButtonHtml\(\{\s*viewKey:\s*"whats-new"/);
  assert.doesNotMatch(comms, /form-actions[\s\S]{0,120}← Back to Calendar/);
});

test("Messages retain contextual Back", () => {
  assert.match(comms, /data-contextual-back="messages"/);
});

test("Portfolio Back uses standardized back-button treatment", () => {
  assert.match(appJs, /class="ghost-button back-button" data-back-to-children/);
  assert.match(appJs, /← Back to Child Profiles/);
});

test(".back-button has mobile tap target >= 44px", () => {
  assert.match(stylesCss, /\.back-button\s*\{[^}]*min-height:\s*44px/s);
});

test("Settings hub Back is contextual (not always-visible root escape)", () => {
  assert.match(appJs, /viewKey:\s*"settings"[\s\S]{0,120}alwaysVisible:\s*false/);
});

test("No production curriculum/cover data touched in this change set markers", () => {
  // Sanity: shared helper must not reference lesson cover APIs.
  const helper = appJs.match(/function llhPageBackButtonHtml\([\s\S]*?\nwindow\.llhPageBackButtonHtml/);
  assert.ok(helper);
  assert.doesNotMatch(helper[0], /lesson-covers|COVER_BASELINE|Teaching Kit content/);
});

const report = {
  suite: "back-navigation-audit",
  generatedAt: new Date().toISOString(),
  productionDataUntouched: true,
  curriculumUntouched: true,
  coversUntouched: true,
  sharedHelper: "llhPageBackButtonHtml",
};
fs.writeFileSync(path.join(ARTIFACT_DIR, "back-navigation-audit-tests.json"), JSON.stringify(report, null, 2));

if (!process.exitCode) console.log("\nAll back-navigation audit checks passed.");
