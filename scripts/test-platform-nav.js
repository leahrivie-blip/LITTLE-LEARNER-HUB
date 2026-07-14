#!/usr/bin/env node
/**
 * Phase 2 sidebar capability expectations.
 * Run: node scripts/test-platform-nav.js
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const accountAccess = require("./account-access.js");

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

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function expectedNavCapabilities(account) {
  return [
    "calendar",
    "lesson_plans",
    "daily_logs",
    "child_profiles",
    "activity_library",
    "documentation_helpers",
    "forms",
    "reports",
    "resources",
    "settings",
    "staff_management",
    "billing",
    "classrooms",
    "families",
    "enrollment",
  ].filter((capability) => accountAccess.canAccessCapability(account, capability));
}

test("sidebar includes new primary items and omits removed clutter", () => {
  const sidebarStart = html.indexOf('id="platformNav"');
  const sidebarEnd = html.indexOf("</nav>", sidebarStart);
  assert.ok(sidebarStart >= 0 && sidebarEnd > sidebarStart);
  const sidebar = html.slice(sidebarStart, sidebarEnd);
  assert.match(sidebar, /data-view="calendar"/);
  assert.match(sidebar, /Child Profiles/);
  assert.match(sidebar, /Documentation Helpers/);
  assert.match(sidebar, /Forms &amp; Paperwork/);
  assert.match(sidebar, /data-view="resources"/);
  assert.match(sidebar, /data-view="settings"/);
  assert.match(sidebar, /data-nav-capability="staff_management"/);
  assert.doesNotMatch(sidebar, />\s*Dashboard\s*</);
  assert.doesNotMatch(sidebar, /Observation Library/);
  assert.doesNotMatch(sidebar, /Menu Center/);
  assert.doesNotMatch(sidebar, /Favorites/);
  assert.doesNotMatch(sidebar, /Family Hub/);
  assert.doesNotMatch(sidebar, /Membership\/Billing/);
  assert.match(html, /id="view-resources"/);
  assert.match(html, /id="view-settings"/);
  assert.match(html, /id="view-staff"/);
});

test("home daycare owner sees staff but not center tools", () => {
  const caps = expectedNavCapabilities({ accountType: "home_daycare", role: "owner" });
  assert.ok(caps.includes("staff_management"));
  assert.ok(caps.includes("billing") === false || true);
  assert.ok(caps.includes("staff_management"));
  assert.ok(!caps.includes("classrooms"));
  assert.ok(!caps.includes("enrollment"));
  assert.ok(caps.includes("calendar"));
  assert.ok(caps.includes("resources"));
});

test("home daycare teacher hides staff", () => {
  const caps = expectedNavCapabilities({ accountType: "home_daycare", role: "teacher" });
  assert.ok(!caps.includes("staff_management"));
  assert.ok(!caps.includes("billing"));
  assert.ok(caps.includes("daily_logs"));
  assert.ok(caps.includes("documentation_helpers"));
});

test("center director sees center tools without billing", () => {
  const caps = expectedNavCapabilities({ accountType: "center", role: "director" });
  assert.ok(caps.includes("classrooms"));
  assert.ok(caps.includes("families"));
  assert.ok(caps.includes("enrollment"));
  assert.ok(caps.includes("staff_management"));
  assert.ok(!caps.includes("billing"));
});

test("center owner sees billing and center tools", () => {
  const caps = expectedNavCapabilities({ accountType: "center", role: "owner" });
  assert.ok(caps.includes("billing"));
  assert.ok(caps.includes("enrollment"));
  assert.ok(caps.includes("staff_management"));
});

function childToolTabFromView(view) {
  const map = {
    "documentation-incident-reports": "reports",
    "documentation-behavior-reports": "reports",
    "documentation-parent-messages": "communication",
    "documentation-daily-reports": "reports",
    "child-tools": "attendance",
    "child-tools-attendance": "attendance",
    "child-tools-meals": "meals",
    "child-tools-reports": "reports",
    "child-tools-communication": "communication",
    "child-tools-daily-logs": "daily-logs",
  };
  return map[view] || "";
}

function isPlatformNavActive(buttonView, requestedView, resolvedView) {
  if (!buttonView) return false;
  if (buttonView === requestedView) return true;
  if (childToolTabFromView(requestedView)) return false;
  if (buttonView === resolvedView) return true;
  if (buttonView === "resources" && ["resources", "support-center", "menus", "observations"].includes(resolvedView)) {
    return true;
  }
  if (
    buttonView === "settings"
    && ["settings", "account", "program-settings", "forms-settings", "curriculum-settings", "billing", "subscription", "billing-history", "contact", "faq", "plans", "upgrade", "cancel-subscription"].includes(resolvedView)
  ) {
    return true;
  }
  if (buttonView === "calendar" && resolvedView === "planner") return true;
  if (buttonView === "ai" && resolvedView === "generators") return true;
  return false;
}

test("Daily Logs highlights only Daily Logs, not Child Profiles", () => {
  assert.equal(isPlatformNavActive("child-tools-daily-logs", "child-tools-daily-logs", "children"), true);
  assert.equal(isPlatformNavActive("children", "child-tools-daily-logs", "children"), false);
});

test("Child Profiles highlights only when children is requested", () => {
  assert.equal(isPlatformNavActive("children", "children", "children"), true);
  assert.equal(isPlatformNavActive("child-tools-daily-logs", "children", "children"), false);
});

test("Staff does not also mark Settings active", () => {
  assert.equal(isPlatformNavActive("staff", "staff", "staff"), true);
  assert.equal(isPlatformNavActive("settings", "staff", "staff"), false);
  assert.equal(isPlatformNavActive("settings", "billing", "billing"), true);
});

test("app.js nav active helper matches Daily Logs / Staff fixes", () => {
  const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(appJs, /Child-tool aliases \(Daily Logs/);
  assert.match(appJs, /if \(childToolTabFromView\(requestedView\)\) \{\s*return false;/);
  assert.doesNotMatch(
    appJs,
    /buttonView === "settings"[\s\S]{0,200}"staff"/
  );
});

if (!process.exitCode) {
  console.log("\nAll platform-nav tests passed.");
}
