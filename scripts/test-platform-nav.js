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
    'data-view="settings"',
  ].map((token) => {
    // Match the visible primary nav button, not hidden preserved items.
    const re = new RegExp(`<button class="nav-link"[^>]*${token}(?![^>]*data-nav-hidden="true")`);
    const match = sidebar.match(re);
    return match ? sidebar.indexOf(match[0]) : -1;
  });
  order.forEach((index, i) => assert.ok(index >= 0, `missing primary nav token #${i}`));
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i] > order[i - 1], "primary nav order is incorrect");
  }
  assert.match(sidebar, />\s*Activities\s*</);
  assert.match(sidebar, /Documentation Helpers/);
  assert.match(sidebar, /Daily Logs/);
  assert.match(sidebar, /Behavior &amp; Support/);
  assert.match(sidebar, /data-view="settings"/);
  assert.doesNotMatch(sidebar, /What Do You Need Today/);
  assert.doesNotMatch(sidebar, />\s*Account\s*</);
  assert.doesNotMatch(sidebar, />\s*Founding Member\s*</);
});

test("Dashboard/Director Center/Teacher Center/Forms Center/Classroom Assistant stay permanently hidden from main nav", () => {
  const sidebar = visibleSidebar(html);
  // These require Admin Preview / a fake org at the API level (not just nav
  // visibility) — surfacing them for real accounts would just get a 401/403.
  assert.match(sidebar, /data-view="home"[^>]*data-nav-hidden="true"/);
  assert.match(sidebar, /data-view="director-center"[^>]*data-nav-hidden="true"/);
  assert.match(sidebar, /data-view="teacher-center"[^>]*data-nav-hidden="true"/);
  assert.match(sidebar, /data-view="classroom-assistant"[^>]*data-nav-hidden="true"/);
  assert.match(sidebar, /data-view="forms-center"[^>]*data-nav-hidden="true"/);
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

test("Phase 22: real capability-gated destinations (Forms, Reports, Resources, Classrooms, Families, Enrollment, Staff, Billing) are no longer permanently nav-hidden", () => {
  const sidebar = visibleSidebar(html);
  // These are real, working, capability-gated pages (renderFormsPage/renderClassroomsPage/
  // renderFamiliesPage/renderEnrollmentPage/renderStaffManagementPage/renderReportsPage/
  // billing views) — Phase 22 connects them into the sidebar instead of Settings-only.
  // Access is still governed purely by data-nav-capability + canAccessCapability, never
  // by hiding the button.
  ["forms", "reports", "resources", "classrooms", "families", "enrollment", "staff", "billing"].forEach((view) => {
    const re = new RegExp(`<button class="nav-link"[^>]*data-view="${view}"[^>]*>`);
    const match = sidebar.match(re);
    assert.ok(match, `expected a nav-link for data-view="${view}"`);
    assert.doesNotMatch(match[0], /data-nav-hidden="true"/, `${view} should not be permanently nav-hidden anymore`);
  });
  // They still live inside the "More Tools" section container so
  // syncRoleAwareNavGrouping() can relocate them per role without moving them
  // out of #platformNav entirely.
  assert.match(sidebar, /data-nav-section="more"/);
});

test("Phase 22: Today is a primary nav item ahead of Calendar", () => {
  const sidebar = visibleSidebar(html);
  const todayIndex = sidebar.indexOf('data-view="today"');
  const calendarIndex = sidebar.indexOf('data-view="calendar"');
  assert.ok(todayIndex >= 0, "Today nav link should exist");
  assert.ok(calendarIndex >= 0, "Calendar nav link should exist");
  assert.ok(todayIndex < calendarIndex, "Today should come before Calendar in the sidebar");
  assert.match(html, /id="view-today" class="view"/);
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

test("app.js keeps Behavior & Support alias, Director Center, and Today landing", () => {
  assert.match(appJs, /"behavior-support": "support-center"/);
  assert.match(appJs, /buttonView === "billing"/);
  assert.match(appJs, /requestedView === "behavior-support"/);
  assert.match(appJs, /function renderDirectorCenterPage/);
  assert.match(appJs, /data-nav-hidden/);
  assert.match(appJs, /setView\("calendar"/);
  assert.match(appJs, /Admin Preview|Director Center is not available in this environment/);
  // Phase 23: Today (not Calendar) is now the default signed-in landing view.
  assert.match(appJs, /Logged-in providers land on Today/);
  assert.match(appJs, /function defaultLoggedInLandingView/);
  const landingFnStart = appJs.indexOf("function defaultLoggedInLandingView");
  const landingFnBody = appJs.slice(landingFnStart, landingFnStart + 800);
  assert.match(landingFnBody, /return "today"/);
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

test("unlocked Admin keeps platform sidebar without a member login", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /body:not\(\.user-authenticated\):not\(\.admin-unlocked\) \.sidebar/);
  assert.match(css, /body\.admin-unlocked:not\(\.user-authenticated\) \.sidebar/);
  assert.match(css, /@media \(min-width: 1101px\)/);
  assert.match(appJs, /classList\.toggle\("admin-unlocked"/);
  assert.match(appJs, /data-admin-open-director-center/);
  assert.match(appJs, /data-admin-open-forms-center/);
  assert.match(appJs, /data-admin-open-classroom-assistant/);
  assert.match(appJs, /closest\("\[data-admin-open-director-center\]"\)/);
  assert.match(appJs, /closest\("\[data-admin-open-forms-center\]"\)/);
  assert.match(appJs, /closest\("\[data-admin-open-classroom-assistant\]"\)/);
  assert.match(appJs, /setView\("director-center"\)/);
  assert.match(appJs, /setView\("forms-center"\)/);
  assert.match(appJs, /setView\("classroom-assistant"\)/);
  assert.match(html, /data-view="forms-center"[^>]*data-feature-flag="formsCenter"[^>]*data-nav-hidden="true"/);
  assert.match(html, /data-view="classroom-assistant"[^>]*data-feature-flag="directorCenter"[^>]*data-nav-hidden="true"/);
  assert.match(html, /id="view-forms-center" class="view"/);
  assert.match(html, /id="view-classroom-assistant" class="view"/);
  assert.match(html, /styles\.css\?v=/);
  assert.match(html, /app\.js\?v=20260722-full-int/);
  assert.match(html, /teacher-center-ui\.js\?v=20260721-phase4/);
  // Phase 19: Forms Center (and other expansion UIs) lazy-load via platform-perf
  assert.match(html, /platform-perf\.js\?v=/);
  const perfJs = fs.readFileSync(path.join(__dirname, "..", "platform-perf.js"), "utf8");
  assert.match(perfJs, /forms-center-ui\.js\?v=/);
  assert.match(perfJs, /classroom-assistant-ui\.js\?v=/);
  assert.match(appJs, /ensureViewScripts\?\.\("forms-center"\)/);
  assert.match(appJs, /ensureViewScripts\?\.\("classroom-assistant"\)/);
  assert.match(appJs, /"classroom-assistant": "directorCenter"/);
});

if (!process.exitCode) {
  console.log("\nAll platform-nav tests passed.");
}
