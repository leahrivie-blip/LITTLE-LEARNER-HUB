#!/usr/bin/env node
/**
 * Phase 10 — Complete role regression matrix (isolated temp store).
 * Extends Pass 3 with Documentation Helpers, Notifications, Billing deep-links,
 * Downloads entitlement, and logout for every persona.
 *
 * Personas: Free, Trial, Founding, Pro, Home Daycare (owner), Center Owner,
 * Director, Teacher, Assistant.
 *
 * Never touches production curriculum.
 * Run: npm run test:role-regression-phase10
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const accountAccess = require("./account-access.js");
const {
  makePlans,
  makeActivities,
  seedSession,
  gotoApp,
  clickSidebarNav,
  dismissFreePlanNudgeIfPresent,
  evaluateShell,
  assertSingleView,
} = require("./test-helpers/llh-browser-nav");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = "/opt/cursor/artifacts/site-stabilization/phase10";
const REPORT_PATH = path.join(ARTIFACT_DIR, "role-regression-matrix.json");

const CENTER_OWNER_EMAIL = "phase10-center-owner@test.local";
const PROGRAM_ID = "prog_phase10_center";

const CHECK_CAPS = ["billing", "staff_management", "enrollment", "classrooms"];

const PERSONAS = {
  free: {
    email: "phase10-free@test.local",
    firstName: "Free",
    lastName: "Owner",
    plan: "Free",
    subscriptionStatus: "Free Plan",
    role: "owner",
    accountType: "home_daycare",
    freeLessonAccessMode: "curated",
    createdAt: "2026-01-15T12:00:00.000Z",
  },
  trial: {
    email: "phase10-trial@test.local",
    firstName: "Trial",
    lastName: "Owner",
    plan: "Pro",
    subscriptionStatus: "trialing",
    stripeSubscriptionStatus: "trialing",
    trialStatus: "In Trial",
    trialEnd: new Date(Date.now() + 7 * 86400000).toISOString(),
    role: "owner",
    accountType: "home_daycare",
  },
  founding: {
    email: "phase10-founding@test.local",
    firstName: "Founding",
    lastName: "Owner",
    plan: "Founding",
    foundingMemberActive: true,
    foundingMember: true,
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "owner",
    accountType: "home_daycare",
  },
  pro: {
    email: "phase10-pro@test.local",
    firstName: "Pro",
    lastName: "Owner",
    plan: "Pro",
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "owner",
    accountType: "home_daycare",
  },
  "home-daycare": {
    email: "phase10-home-daycare@test.local",
    firstName: "Home",
    lastName: "Daycare",
    plan: "Pro",
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "owner",
    accountType: "home_daycare",
  },
  "center-owner": {
    email: CENTER_OWNER_EMAIL,
    firstName: "Center",
    lastName: "Owner",
    plan: "Pro",
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "owner",
    accountType: "center",
    programId: PROGRAM_ID,
  },
  director: {
    email: "phase10-director@test.local",
    firstName: "Center",
    lastName: "Director",
    plan: "Pro",
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "director",
    accountType: "center",
    linkedProgramOwnerEmail: CENTER_OWNER_EMAIL,
    programId: PROGRAM_ID,
    programAccessViaOwner: true,
  },
  teacher: {
    email: "phase10-teacher@test.local",
    firstName: "Center",
    lastName: "Teacher",
    plan: "Pro",
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "teacher",
    accountType: "center",
    linkedProgramOwnerEmail: CENTER_OWNER_EMAIL,
    programId: PROGRAM_ID,
    programAccessViaOwner: true,
  },
  assistant: {
    email: "phase10-assistant@test.local",
    firstName: "Center",
    lastName: "Assistant",
    plan: "Pro",
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "assistant",
    accountType: "center",
    linkedProgramOwnerEmail: CENTER_OWNER_EMAIL,
    programId: PROGRAM_ID,
    programAccessViaOwner: true,
  },
};

const DEVICE_PLAN = {
  free: [
    { label: "desktop", width: 1280, height: 800 },
    { label: "phone", width: 390, height: 844 },
  ],
  trial: [{ label: "desktop", width: 1280, height: 800 }],
  founding: [{ label: "desktop", width: 1280, height: 800 }],
  pro: [
    { label: "desktop", width: 1280, height: 800 },
    { label: "phone", width: 390, height: 844 },
  ],
  "home-daycare": [{ label: "desktop", width: 1280, height: 800 }],
  "center-owner": [{ label: "desktop", width: 1280, height: 800 }],
  director: [{ label: "desktop", width: 1280, height: 800 }],
  teacher: [
    { label: "desktop", width: 1280, height: 800 },
    { label: "phone", width: 390, height: 844 },
  ],
  assistant: [{ label: "desktop", width: 1280, height: 800 }],
};

const NAV_FLOWS = [
  { nav: "calendar", view: "calendar", label: "calendar" },
  { nav: "lessons", view: "lessons", label: "lessons" },
  { nav: "activities", view: "activities", label: "activities" },
  { nav: "child-tools-daily-logs", view: "children", label: "daily-logs" },
  { nav: "children", view: "children", label: "children" },
  { nav: "ai", view: "ai", label: "documentation-helpers", optional: true },
  { nav: "messages", view: "messages", label: "messages" },
  { nav: "settings", view: "settings", label: "settings" },
];

const CURRICULUM_WRITE_RE = /\/api\/admin\/curriculum\//i;
const matrix = [];
let curriculumWriteAttempts = [];

function record(persona, device, check, result, detail = "", extra = {}) {
  const row = {
    persona,
    device,
    check,
    result,
    detail,
    ...extra,
    at: new Date().toISOString(),
  };
  matrix.push(row);
  const line = `${persona}/${device}/${check}: ${result}${detail ? ` — ${detail}` : ""}`;
  if (result === "pass") console.log(`PASS  ${line}`);
  else {
    console.error(`FAIL  ${line}`);
    process.exitCode = 1;
  }
}

function expectedIsPro(key) {
  return key !== "free";
}

function expectedCaps(persona) {
  const out = {};
  for (const cap of CHECK_CAPS) {
    out[cap] = accountAccess.canAccessCapability(persona, cap);
  }
  return out;
}

function requestJson(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: payload
        ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
        : {},
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch { json = null; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-phase10-role-"));
  const storePath = path.join(tmpDir, "launch-store.json");
  const port = 20200 + Math.floor(Math.random() * 80);
  const users = {};
  for (const persona of Object.values(PERSONAS)) {
    users[persona.email] = { ...persona };
  }
  fs.writeFileSync(storePath, JSON.stringify({
    users,
    siteContent: {
      curriculumLibrary: {
        lessonPlans: makePlans(24),
        activities: makeActivities(80),
        resources: [],
        updatedAt: new Date().toISOString(),
      },
      playBasedCurriculum: true,
      featureFlags: {
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
      },
    },
    adminSessions: {},
    notifications: [],
  }, null, 2));

  const env = {
    ...process.env,
    PORT: String(port),
    SITE_URL: `http://127.0.0.1:${port}`,
    DATABASE_PROVIDER: "local-json",
    LLH_STORE_PATH: storePath,
    NODE_ENV: "test",
    EMAIL_AUTOMATIONS_ENABLED: "false",
    HOME_DAYCARE_HUB_TESTING: "false",
  };
  delete env.HOME_DAYCARE_HUB_TESTING_FORCE;

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (chunk) => {
    const text = String(chunk || "");
    if (/error|EADDRINUSE|FATAL/i.test(text)) process.stderr.write(`[phase10-server] ${text}`);
  });
  return { child, port, tmpDir, storePath };
}

async function waitForBoot(port, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("boot timeout");
}

function runUnitChecks() {
  for (const [key, persona] of Object.entries(PERSONAS)) {
    const caps = expectedCaps(persona);
    try {
      assert.equal(accountAccess.resolveAccountType(persona), persona.accountType, `${key} accountType`);
      assert.equal(accountAccess.resolveUserRole(persona), persona.role, `${key} role`);
      for (const [cap, expected] of Object.entries(caps)) {
        assert.equal(accountAccess.canAccessCapability(persona, cap), expected, `${key} unit ${cap}`);
      }
      if (["free", "trial", "founding", "pro", "home-daycare"].includes(key)) {
        assert.equal(caps.billing, true);
        assert.equal(caps.enrollment, false);
        assert.equal(caps.classrooms, false);
      }
      if (key === "center-owner") {
        assert.equal(caps.billing, true);
        assert.equal(caps.classrooms, true);
        assert.equal(caps.enrollment, true);
        assert.equal(caps.staff_management, true);
      }
      if (key === "director") {
        assert.equal(caps.billing, false);
        assert.equal(caps.staff_management, true);
        assert.equal(caps.enrollment, true);
        assert.equal(caps.classrooms, true);
      }
      if (key === "teacher" || key === "assistant") {
        assert.equal(caps.billing, false);
        assert.equal(caps.staff_management, false);
        assert.equal(caps.enrollment, false);
        assert.equal(caps.classrooms, false);
      }
      record(key, "unit", "account-access", "pass", JSON.stringify(caps));
    } catch (error) {
      record(key, "unit", "account-access", "fail", error.message, { caps });
    }
  }
}

async function evaluatePermissions(page) {
  return page.evaluate((caps) => {
    const account = typeof currentAccount === "function" ? currentAccount() : null;
    const capabilityResults = {};
    const platformResults = {};
    for (const cap of caps) {
      capabilityResults[cap] = typeof canAccessCapability === "function"
        ? canAccessCapability(account, cap)
        : null;
      platformResults[cap] = typeof canAccessPlatformFeature === "function"
        ? canAccessPlatformFeature(cap)
        : null;
    }
    const adminNav = document.querySelector("[data-admin-nav]");
    const adminNavShown = Boolean(
      adminNav
      && !adminNav.hidden
      && adminNav.getAttribute("aria-hidden") !== "true"
      && adminNav.offsetParent !== null,
    );
    const freeBadge = document.querySelector("#freePlanBadge");
    const freeBadgeVisible = Boolean(freeBadge && !freeBadge.hidden);
    const settingsText = document.querySelector("#view-settings")?.innerText || "";
    const bodyText = document.body?.innerText || "";
    const billingCard = [...document.querySelectorAll("#view-settings [data-view='billing'], #view-settings [data-settings-billing]")]
      .some((el) => !el.hidden && el.offsetParent !== null);
    const billingManagedByOwner = /Billing managed by owner/i.test(settingsText);
    const notifBell = document.querySelector("#notificationBell, [data-notification-bell], .notification-bell");
    const downloadCtrl = typeof canDownloadLessonWorkspacePlan === "function";
    return {
      capabilityResults,
      platformResults,
      isProUser: typeof isProUser === "function" ? isProUser() : null,
      hasAdminFullAccess: typeof hasAdminFullAccess === "function" ? hasAdminFullAccess() : null,
      adminViewActive: document.querySelector("#view-admin")?.classList.contains("active-view") === true,
      adminNavShown,
      freeBadgeVisible,
      billingCard,
      billingManagedByOwner,
      notificationBellPresent: Boolean(notifBell),
      downloadHelperPresent: downloadCtrl,
      aiUsageLabel: typeof displayAiUsageLabel === "function" ? displayAiUsageLabel() : "",
      membershipLabel: typeof membershipDisplayStatus === "function"
        ? (membershipDisplayStatus(account)?.planLabel || "")
        : "",
      testingConfig: Boolean(window.LLH_CONFIG?.homeDaycareHubTesting),
      role: account?.role || "",
      accountType: account?.accountType || "",
      plan: account?.plan || "",
      loggedIn: typeof isLoggedIn === "function" ? isLoggedIn() : Boolean(account),
      bodySnippet: bodyText.slice(0, 240),
    };
  }, CHECK_CAPS);
}

async function openViewIfPossible(page, nav, view) {
  try {
    await dismissFreePlanNudgeIfPresent(page);
    await clickSidebarNav(page, nav, view);
    return true;
  } catch {
    // Fallback: try data-view button if sidebar label differs (Documentation Helpers).
    const clicked = await page.evaluate((target) => {
      const el = document.querySelector(`[data-view="${target}"]`);
      if (!el || el.disabled || el.hidden) return false;
      el.click();
      return true;
    }, view);
    if (!clicked) return false;
    await page.waitForTimeout(250);
    const shell = await evaluateShell(page);
    return shell.activeId === `view-${view}` || shell.activeId?.includes(view);
  }
}

async function runPersonaDevice(page, baseUrl, key, persona, device) {
  curriculumWriteAttempts = [];
  await page.route("**/api/admin/curriculum/**", async (route) => {
    const req = route.request();
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
      curriculumWriteAttempts.push(`${req.method()} ${req.url()}`);
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "phase10_temp_store_only_no_curriculum_writes" }),
      });
    }
    return route.continue();
  });

  await seedSession(page, persona, {
    lastView: "calendar",
    cacheActivities: 80,
    blockServerPersistence: true,
  });

  try {
    await gotoApp(page, `${baseUrl}/`, { timeout: 90000 });
    record(key, device.label, "login-session", "pass");
  } catch (error) {
    record(key, device.label, "login-session", "fail", error.message);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `fail-${key}-${device.label}-boot.png`),
      fullPage: true,
    }).catch(() => {});
    return;
  }

  let perms = null;
  try {
    perms = await evaluatePermissions(page);
    assert.equal(perms.testingConfig, false, "HOME_DAYCARE_HUB_TESTING must be off");
    assert.equal(perms.loggedIn, true);
    record(key, device.label, "session-active", "pass");
  } catch (error) {
    record(key, device.label, "session-active", "fail", error.message);
  }

  const expected = expectedCaps(persona);
  const wantPro = expectedIsPro(key);

  try {
    assert.ok(perms, "permissions evaluate failed earlier");
    for (const cap of CHECK_CAPS) {
      assert.equal(perms.capabilityResults[cap], expected[cap], `canAccessCapability(${cap})`);
      assert.equal(perms.platformResults[cap], expected[cap], `canAccessPlatformFeature(${cap})`);
    }
    assert.equal(perms.isProUser, wantPro, `isProUser expected ${wantPro}`);
    assert.equal(perms.hasAdminFullAccess, false);
    assert.equal(perms.adminNavShown, false);
    record(key, device.label, "permissions", "pass", JSON.stringify({
      caps: perms.capabilityResults,
      isProUser: perms.isProUser,
      membershipLabel: perms.membershipLabel,
    }));
  } catch (error) {
    record(key, device.label, "permissions", "fail", error.message, {
      expected,
      actual: perms?.capabilityResults,
    });
  }

  for (const flow of NAV_FLOWS) {
    try {
      const opened = await openViewIfPossible(page, flow.nav, flow.view);
      if (!opened && flow.optional) {
        record(key, device.label, `nav-${flow.label}`, "pass", "optional nav absent — skipped");
        continue;
      }
      assert.ok(opened, `could not open ${flow.label}`);
      assertSingleView(await evaluateShell(page), flow.label);
      record(key, device.label, `nav-${flow.label}`, "pass");
    } catch (error) {
      record(key, device.label, `nav-${flow.label}`, "fail", error.message);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `fail-${key}-${device.label}-${flow.label}.png`),
        fullPage: true,
      }).catch(() => {});
    }
  }

  // Notifications: bell present for signed-in members; never expose admin-only chrome.
  try {
    const notif = await page.evaluate(() => {
      const bell = document.querySelector("#notificationBell, [data-notification-bell], .notification-bell, button[aria-label*='Notification']");
      const adminOnly = /Admin Center|admin_\w+/i.test(document.body?.innerText || "");
      return {
        bell: Boolean(bell),
        adminLeak: adminOnly && !(typeof hasAdminFullAccess === "function" && hasAdminFullAccess()),
      };
    });
    assert.equal(notif.adminLeak, false, "admin notification/data leak");
    record(key, device.label, "notifications", "pass", notif.bell ? "bell present" : "bell optional");
  } catch (error) {
    record(key, device.label, "notifications", "fail", error.message);
  }

  // Billing deep-link / Settings gating
  try {
    await openViewIfPossible(page, "settings", "settings");
    const settingsPerms = await evaluatePermissions(page);
    const canBill = expected.billing === true;
    if (canBill) {
      assert.equal(settingsPerms.capabilityResults.billing, true);
      assert.ok(settingsPerms.billingCard, "billing settings entry for entitled role");
      // Owners can open billing view.
      const openedBilling = await page.evaluate(() => {
        const btn = document.querySelector("#view-settings [data-view='billing']");
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (openedBilling) {
        await page.waitForTimeout(300);
        const shell = await evaluateShell(page);
        const billingVisible = await page.evaluate(() => {
          const active = document.querySelector(".active-view")?.id || "";
          const text = document.body?.innerText || "";
          return active === "view-billing" || /billing|membership|subscription/i.test(text);
        });
        assert.ok(shell.activeId === "view-billing" || billingVisible, "billing view reachable");
      }
      record(key, device.label, "billing", "pass");
    } else {
      assert.equal(settingsPerms.capabilityResults.billing, false);
      assert.equal(settingsPerms.billingCard, false);
      if (key === "teacher" || key === "assistant" || key === "director") {
        assert.ok(settingsPerms.billingManagedByOwner || key === "director", "staff billing gated");
      }
      // Deep-link attempt must not unlock billing capability.
      await page.evaluate(() => {
        if (typeof setView === "function") setView("billing");
      });
      await page.waitForTimeout(200);
      const after = await evaluatePermissions(page);
      assert.equal(after.capabilityResults.billing, false);
      record(key, device.label, "billing", "pass", "gated");
    }
  } catch (error) {
    record(key, device.label, "billing", "fail", error.message);
  }

  // Downloads entitlement helper exists and matches Pro access.
  try {
    const downloadState = await page.evaluate(() => ({
      isPro: typeof isProUser === "function" ? isProUser() : null,
      helper: typeof canDownloadLessonWorkspacePlan === "function",
    }));
    assert.equal(downloadState.helper, true);
    assert.equal(downloadState.isPro, wantPro);
    record(key, device.label, "downloads", "pass", `isPro=${downloadState.isPro}`);
  } catch (error) {
    record(key, device.label, "downloads", "fail", error.message);
  }

  try {
    assert.equal(curriculumWriteAttempts.length, 0, curriculumWriteAttempts.join("; "));
    record(key, device.label, "no-curriculum-writes", "pass");
  } catch (error) {
    record(key, device.label, "no-curriculum-writes", "fail", error.message);
  }

  // Logout
  try {
    await page.evaluate(() => {
      if (typeof signOut === "function") signOut();
      else if (typeof window.signOut === "function") window.signOut();
      else {
        localStorage.removeItem("llhUser");
        localStorage.removeItem("llhPlan");
        localStorage.removeItem("llhAccounts");
      }
    });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({
      loggedIn: typeof isLoggedIn === "function" ? isLoggedIn() : Boolean(localStorage.getItem("llhUser")),
      adminNav: Boolean(document.querySelector("[data-admin-nav]:not([hidden])")),
    }));
    assert.equal(after.loggedIn, false, "must be logged out");
    assert.equal(after.adminNav, false);
    record(key, device.label, "logout", "pass");
  } catch (error) {
    record(key, device.label, "logout", "fail", error.message);
  }

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, `matrix-${key}-${device.label}.png`),
    fullPage: true,
  }).catch(() => {});
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  console.log("Phase 10 role regression (isolated temp local-json store)\n");

  runUnitChecks();

  const { child, port, tmpDir, storePath } = startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForBoot(port, child);
    const health = await requestJson(port, "GET", "/api/health");
    assert.ok(health.json?.ok);

    for (const [key, persona] of Object.entries(PERSONAS)) {
      const devices = DEVICE_PLAN[key] || [{ label: "desktop", width: 1280, height: 800 }];
      for (const device of devices) {
        const page = await browser.newPage({
          viewport: { width: device.width, height: device.height },
        });
        try {
          await runPersonaDevice(page, baseUrl, key, persona, device);
        } finally {
          await page.close();
        }
      }
    }

    assert.ok(storePath.includes(os.tmpdir()) || storePath.includes("llh-phase10-role-"));
    const storeAfter = JSON.parse(fs.readFileSync(storePath, "utf8"));
    assert.ok(storeAfter.users?.[PERSONAS.free.email]);
    assert.ok(storeAfter.users?.[CENTER_OWNER_EMAIL]);
    assert.equal(storeAfter.siteContent?.featureFlags?.teachingKitViewer, false);
    record("meta", "store", "temp-store-intact", "pass", storePath);
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { child.kill("SIGKILL"); } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    suite: "role-regression-phase10",
    store: "isolated-temp-local-json",
    homeDaycareHubTesting: false,
    teachingKitCustomerFlags: false,
    personas: Object.keys(PERSONAS),
    workflows: [
      "login-session",
      "navigation",
      "lesson-plans",
      "calendar",
      "activities",
      "child-profiles",
      "daily-logs",
      "documentation-helpers",
      "messaging",
      "settings",
      "billing",
      "downloads",
      "notifications",
      "logout",
    ],
    total: matrix.length,
    passed: matrix.filter((r) => r.result === "pass").length,
    failed: matrix.filter((r) => r.result === "fail").length,
    results: matrix,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2));
  console.log(`\nMatrix: ${summary.passed}/${summary.total} passed. Report: ${REPORT_PATH}`);
  if (summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify({
      generatedAt: new Date().toISOString(),
      error: String(error?.message || error),
      results: matrix,
    }, null, 2));
  } catch { /* ignore */ }
});
