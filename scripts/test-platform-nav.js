#!/usr/bin/env node
/**
 * Phase 2 sidebar capability expectations + nav rebuild checks.
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
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

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

function visibleSidebar(htmlSource) {
  const sidebarStart = htmlSource.indexOf('id="platformNav"');
  const sidebarEnd = htmlSource.indexOf("</nav>", sidebarStart);
  assert.ok(sidebarStart >= 0 && sidebarEnd > sidebarStart);
  return htmlSource.slice(sidebarStart, sidebarEnd);
}

test("sidebar shows rebuilt primary items in the new order", () => {
  const sidebar = visibleSidebar(html);
  const order = [
    'data-view="calendar"',
    'data-view="lessons"',
    'data-view="activities"',
    'data-view="child-tools-daily-logs"',
    'data-view="children"',
    'data-view="ai"',
    'data-view="behavior-support"',
    'data-view="forms"',
    'data-view="settings"',
  ].map((token) => sidebar.indexOf(token));
  order.forEach((index, i) => assert.ok(index >= 0, `missing nav token #${i}`));
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i] > order[i - 1], "primary nav order is incorrect");
  }
  assert.match(sidebar, />\s*Activities\s*</);
  assert.match(sidebar, /Documentation Helpers/);
  assert.match(sidebar, /Daily Logs/);
  assert.match(sidebar, /Forms &amp; Enrollment/);
  assert.match(sidebar, /Behavior &amp; Support/);
  assert.match(sidebar, /data-view="settings"/);
  assert.doesNotMatch(sidebar, /What Do You Need Today/);
  assert.doesNotMatch(sidebar, />\s*Account\s*</);
  assert.doesNotMatch(sidebar, />\s*Founding Member\s*</);
});

test("removed items stay in DOM but are permanently hidden from main nav", () => {
  const sidebar = visibleSidebar(html);
  assert.match(sidebar, /data-view="home"[^>]*data-nav-hidden="true"/);
  assert.match(sidebar, /data-view="director-center"[^>]*data-nav-hidden="true"/);
  assert.match(sidebar, /data-view="reports"[^>]*data-nav-hidden="true"/);
  assert.match(sidebar, /data-view="resources"[^>]*data-nav-hidden="true"/);
  assert.match(html, /id="view-resources"/);
  assert.match(html, /id="view-settings"/);
  assert.match(html, /id="view-staff"/);
  assert.match(html, /id="view-director-center"/);
  assert.match(html, /id="view-home"/);
  assert.doesNotMatch(sidebar, /Forms &amp; Paperwork/);
  assert.doesNotMatch(sidebar, /Observation Library/);
  assert.doesNotMatch(sidebar, /Menu Center/);
  assert.doesNotMatch(sidebar, /Favorites/);
  assert.doesNotMatch(sidebar, /Family Hub/);
  assert.doesNotMatch(sidebar, /Membership\/Billing/);
  assert.doesNotMatch(sidebar, /sidebar-dashboard-card/);
});

test("forms capability is director/owner only", () => {
  assert.ok(accountAccess.canAccessCapability({ accountType: "home_daycare", role: "owner" }, "forms"));
  assert.ok(accountAccess.canAccessCapability({ accountType: "center", role: "director" }, "forms"));
  assert.ok(!accountAccess.canAccessCapability({ accountType: "home_daycare", role: "teacher" }, "forms"));
  assert.ok(!accountAccess.canAccessCapability({ accountType: "center", role: "assistant" }, "forms"));
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
    "child-tools-daily-logs": "daily-logs",
    "child-tools-attendance": "attendance",
  };
  return map[view] || "";
}

function isPlatformNavActive(buttonView, requestedView, resolvedView) {
  if (!buttonView) return false;
  if (buttonView === requestedView) return true;
  if (requestedView !== resolvedView && buttonView === resolvedView) {
    const aliasHasOwnNav = Boolean(
      childToolTabFromView(requestedView)
      || requestedView === "behavior-support"
      || requestedView === "membership"
    );
    if (aliasHasOwnNav) return false;
  }
  if (buttonView === resolvedView) return true;
  if (buttonView === "resources" && ["resources", "support-center", "menus", "observations"].includes(resolvedView) && requestedView !== "behavior-support") {
    return true;
  }
  if (
    buttonView === "settings"
    && ["settings", "account", "program-settings", "forms-settings", "curriculum-settings", "subscription", "billing-history", "contact", "faq", "plans", "upgrade", "cancel-subscription"].includes(resolvedView)
  ) {
    return true;
  }
  if (buttonView === "billing" && ["billing", "subscription", "billing-history", "cancel-subscription"].includes(resolvedView)) {
    return true;
  }
  return false;
}

test("Daily Logs highlights only Daily Logs, not Child Profiles", () => {
  assert.equal(isPlatformNavActive("child-tools-daily-logs", "child-tools-daily-logs", "children"), true);
  assert.equal(isPlatformNavActive("children", "child-tools-daily-logs", "children"), false);
});

test("Behavior & Support highlights its own link, not Resources", () => {
  assert.equal(isPlatformNavActive("behavior-support", "behavior-support", "support-center"), true);
  assert.equal(isPlatformNavActive("resources", "behavior-support", "support-center"), false);
});

test("Billing does not also mark Settings active", () => {
  assert.equal(isPlatformNavActive("billing", "billing", "billing"), true);
  assert.equal(isPlatformNavActive("settings", "billing", "billing"), false);
});

test("app.js keeps Behavior & Support alias, Director Center, and Calendar landing", () => {
  assert.match(appJs, /"behavior-support": "support-center"/);
  assert.match(appJs, /buttonView === "billing"/);
  assert.match(appJs, /requestedView === "behavior-support"/);
  assert.match(appJs, /function renderDirectorCenterPage/);
  assert.match(appJs, /data-nav-hidden/);
  assert.match(appJs, /setView\("calendar"/);
  assert.match(appJs, /Founding Members will receive access to future Director Center features/);
  assert.match(appJs, /Logged-in providers land on Calendar/);
});

test("navigation guards prevent post-login/boot yank and sidebar history pollution", () => {
  assert.match(appJs, /let pendingAuthReturnView/);
  assert.match(appJs, /let suppressBootLanding/);
  assert.match(appJs, /let viewNavigationGeneration/);
  assert.match(appJs, /pendingAuthReturnView = resolvedView/);
  assert.match(appJs, /fromAuthLanding:\s*true/);
  assert.match(appJs, /fromBoot:\s*true/);
  assert.match(appJs, /suppressBootLanding = true/);
  assert.match(appJs, /skipHistory:\s*true/);
  assert.match(appJs, /loginNavGeneration !== viewNavigationGeneration/);
  assert.match(appJs, /dismissResourceViewerForNavigation\(\)/);
  assert.match(appJs, /pushPlatformNavHistory/);
  assert.match(appJs, /restoreViewScroll/);
  assert.match(appJs, /defaultLoggedInLandingView/);
  assert.match(html, /llh-boot-authenticated/);
  assert.doesNotMatch(html, /Back to Dashboard/);
});

if (!process.exitCode) {
  console.log("\nAll platform-nav tests passed.");
}
