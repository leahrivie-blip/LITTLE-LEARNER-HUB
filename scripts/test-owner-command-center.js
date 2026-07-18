#!/usr/bin/env node
/**
 * Owner Command Center + Admin UX regression guards.
 * Run: node scripts/test-owner-command-center.js
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
const serverJs = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

test("analytics exposes command-center KPI totals", () => {
  assert.match(serverJs, /usersOnlineNow/);
  assert.match(serverJs, /newSignupsToday/);
  assert.match(serverJs, /revenueThisMonth/);
  assert.match(serverJs, /monthlyRecurringRevenue/);
  assert.match(serverJs, /trialConversionRate/);
  assert.match(serverJs, /draftLessonPlans/);
  assert.match(serverJs, /publishedLessonPlans/);
  assert.match(serverJs, /openBugReports/);
  assert.match(serverJs, /openFeatureRequests/);
});

test("admin session soft-touch keeps unlock warm", () => {
  assert.match(serverJs, /lastValidatedAt/);
  assert.match(serverJs, /Soft-touch the live session/);
  assert.match(appJs, /startAdminSessionHeartbeat/);
  assert.match(appJs, /Admin session validation failed \(network\) — keeping unlock/);
});

test("action center + quick actions + live activity are wired", () => {
  assert.match(appJs, /function buildAdminActionCenterItems\(/);
  assert.match(appJs, /function renderAdminActionCenter\(/);
  assert.match(appJs, /function renderAdminLiveActivityPanel\(/);
  assert.match(appJs, /function renderAdminQuickActionsBar\(/);
  assert.match(appJs, /data-admin-quick="upload-lesson"/);
  assert.match(appJs, /data-admin-quick="publish-drafts"/);
  assert.match(appJs, /data-admin-action=/);
  assert.match(appJs, /setAdminSectionTab\("curriculum-lesson-plans"\)/);
  assert.match(appJs, /setAdminSectionTab\("users"\)/);
});

test("content health dashboard renders QC cards (regression for broken markup)", () => {
  assert.match(appJs, /id="adminOwnerContentHealth"/);
  assert.match(appJs, /Quality Control/);
  assert.match(appJs, /function adminContentQualityIssues\(/);
  assert.doesNotMatch(
    appJs.slice(appJs.indexOf("function renderContentHealthDashboard"), appJs.indexOf("function renderFutureAdminBuildItems")),
    /<\/div>\s*<\/div>\s*\$\{renderFutureAdminBuildItems/,
  );
});

test("lesson editor sticky bar, jump nav, and collapse controls exist", () => {
  assert.match(appJs, /admin-lesson-sticky-bar/);
  assert.match(appJs, /function adminCurriculumLessonJumpNavHtml\(/);
  assert.match(appJs, /data-admin-days-collapse="all"/);
  assert.match(appJs, /data-admin-days-expand="all"/);
  assert.match(css, /\.admin-lesson-sticky-bar/);
  assert.match(css, /\.admin-back-to-top/);
});

test("sandbox preview includes Trial, Director, Teacher", () => {
  assert.match(appJs, /\["Admin", "Free", "Trial", "Pro", "Founding", "Director", "Teacher"\]/);
  assert.match(appJs, /Director \(sandbox\)/);
  assert.match(appJs, /Teacher \(sandbox\)/);
});

test("owner section accordion state persists", () => {
  assert.match(appJs, /llhAdminOwnerSectionsOpen/);
  assert.match(appJs, /function persistAdminOwnerSectionsOpen\(/);
  assert.match(appJs, /function readAdminOwnerSectionsOpen\(/);
});

test("cache bust versions stay aligned", () => {
  const indexCss = indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1];
  const indexJs = indexHtml.match(/app\.js\?v=([^"]+)/)?.[1];
  assert.equal(indexCss, "20260718-owner-command-center");
  assert.equal(indexJs, "20260718-owner-command-center");
  assert.match(sw, /llh-shell-v81-owner-command-center/);
});

if (!process.exitCode) {
  console.log("\nAll owner command center tests passed.");
}
