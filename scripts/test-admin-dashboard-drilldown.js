#!/usr/bin/env node
/**
 * Admin Owner Command Center: clickable metrics, drill-down filters, mobile sections.
 * Run: node scripts/test-admin-dashboard-drilldown.js
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

test("metric cards are clickable with data-admin-metric keys", () => {
  assert.match(appJs, /function adminMetric\(label, value, detail = "", metricKey = ""\)/);
  assert.match(appJs, /admin-metric--clickable/);
  assert.match(appJs, /data-admin-metric=/);
  assert.match(appJs, /openAdminOwnerMetricDrilldown/);
  assert.match(appJs, /"total-users"/);
  assert.match(appJs, /"free-users"/);
  assert.match(appJs, /"pro-users"/);
  assert.match(appJs, /"founding-users"/);
  assert.match(appJs, /"billing-canceling"/);
  assert.match(appJs, /"billing-canceled"/);
  assert.match(appJs, /"billing-past-due"/);
  assert.match(appJs, /"active-today"/);
  assert.match(appJs, /"new-users-week"/);
  assert.match(appJs, /"new-founding"/);
});

test("drill-down panel includes search, plan/status filters, and sort", () => {
  assert.match(appJs, /function renderAdminOwnerDrilldownPanel\(/);
  assert.match(appJs, /adminOwnerDrilldownSearch/);
  assert.match(appJs, /adminOwnerDrilldownPlan/);
  assert.match(appJs, /adminOwnerDrilldownStatus/);
  assert.match(appJs, /adminOwnerDrilldownSort/);
  assert.match(appJs, /newest-signup/);
  assert.match(appJs, /oldest-signup/);
  assert.match(appJs, /recent-active/);
  assert.match(appJs, /adminDrilldownUserRow/);
  assert.match(appJs, /Last Active/);
  assert.match(appJs, /adminDrilldownStatusBucket/);
});

test("mobile usability: collapsible sections and jump links", () => {
  assert.match(appJs, /admin-owner-jump/);
  assert.match(appJs, /data-admin-owner-section="inventory"/);
  assert.match(appJs, /data-admin-owner-section="billing"/);
  assert.match(appJs, /data-admin-owner-section="usage"/);
  assert.match(appJs, /admin-owner-collapse/);
  assert.match(css, /\.admin-owner-jump/);
  assert.match(css, /\.admin-owner-collapse/);
  assert.match(css, /\.admin-owner-drilldown/);
  assert.match(css, /\.admin-metric--clickable/);
});

test("activity helpers prefer lastSeenAt and match analytics windows", () => {
  assert.match(appJs, /function adminIsWithinDays\(/);
  assert.match(appJs, /function adminIsSameUtcDay\(/);
  assert.match(appJs, /account\.lastSeenAt \|\| account\.lastLoginAt/);
  assert.match(appJs, /adminUserLastActiveLabel[\s\S]*lastSeenAt \|\| account\.lastLoginAt/);
});

test("cache bust versions stay aligned for drilldown", () => {
  const indexCss = indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1];
  const indexJs = indexHtml.match(/app\.js\?v=([^"]+)/)?.[1];
  assert.equal(indexCss, "20260716-admin-analytics");
  assert.equal(indexJs, "20260716-admin-analytics");
  assert.match(sw, /styles\.css\?v=20260716-admin-analytics/);
  assert.match(sw, /app\.js\?v=20260716-admin-analytics/);
  assert.match(sw, /llh-shell-v53-admin-analytics/);
});

if (!process.exitCode) {
  console.log("\nAll admin dashboard drill-down tests passed.");
}
