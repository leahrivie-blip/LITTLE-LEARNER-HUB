#!/usr/bin/env node
/**
 * Pass 3 — full account permission matrix on an isolated temp local-json store.
 * Never touches production curriculum.
 *
 * Run: npm run test:pass3-permission-matrix
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
const ARTIFACT_DIR = "/opt/cursor/artifacts/overnight-stabilization/pass3";
const REPORT_PATH = path.join(ARTIFACT_DIR, "permission-matrix.json");

const CENTER_OWNER_EMAIL = "pass3-center-owner@test.local";
const PROGRAM_ID = "prog_pass3_center";

const CHECK_CAPS = ["billing", "staff_management", "enrollment", "classrooms"];

const PERSONAS = {
  free: {
    email: "pass3-free@test.local",
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
    email: "pass3-trial@test.local",
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
  pro: {
    email: "pass3-pro@test.local",
    firstName: "Pro",
    lastName: "Owner",
    plan: "Pro",
    subscriptionStatus: "active",
    stripeSubscriptionStatus: "active",
    role: "owner",
    accountType: "home_daycare",
  },
  founding: {
    email: "pass3-founding@test.local",
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
    email: "pass3-director@test.local",
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
    email: "pass3-teacher@test.local",
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
    email: "pass3-assistant@test.local",
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

/** Desktop 1280 for all; phone 390 for free + pro + teacher at minimum. */
const DEVICE_PLAN = {
  free: [
    { label: "desktop", width: 1280, height: 800 },
    { label: "phone", width: 390, height: 844 },
  ],
  trial: [{ label: "desktop", width: 1280, height: 800 }],
  pro: [
    { label: "desktop", width: 1280, height: 800 },
    { label: "phone", width: 390, height: 844 },
  ],
  founding: [{ label: "desktop", width: 1280, height: 800 }],
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llh-pass3-perm-"));
  const storePath = path.join(tmpDir, "launch-store.json");
  const port = 20100 + Math.floor(Math.random() * 80);
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
    },
    adminSessions: {},
  }, null, 2));

  const env = {
    ...process.env,
    PORT: String(port),
    SITE_URL: `http://127.0.0.1:${port}`,
    DATABASE_PROVIDER: "local-json",
    LLH_STORE_PATH: storePath,
    NODE_ENV: "test",
    EMAIL_AUTOMATIONS_ENABLED: "false",
    // Critical: Testing Pro must NOT grant everyone Pro.
    HOME_DAYCARE_HUB_TESTING: "false",
  };
  delete env.HOME_DAYCARE_HUB_TESTING_FORCE;
  // Ensure unset/false wins even if parent shell had it true.
  env.HOME_DAYCARE_HUB_TESTING = "false";

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
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
      assert.equal(
        accountAccess.resolveAccountType(persona),
        persona.accountType,
        `${key} accountType`,
      );
      assert.equal(
        accountAccess.resolveUserRole(persona),
        persona.role,
        `${key} role`,
      );
      for (const [cap, expected] of Object.entries(caps)) {
        assert.equal(
          accountAccess.canAccessCapability(persona, cap),
          expected,
          `${key} unit ${cap}`,
        );
      }
      // Persona-specific matrix expectations from the Pass 3 brief.
      if (key === "free" || key === "trial" || key === "pro" || key === "founding") {
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
    const upgradeChrome = Boolean(
      document.body.classList.contains("user-free-upgrade")
      || freeBadgeVisible
      || /Upgrade to Pro|Compare Plans|Free Plan/i.test(bodyText),
    );
    return {
      capabilityResults,
      platformResults,
      isProUser: typeof isProUser === "function" ? isProUser() : null,
      hasAdminFullAccess: typeof hasAdminFullAccess === "function" ? hasAdminFullAccess() : null,
      adminViewActive: document.querySelector("#view-admin")?.classList.contains("active-view") === true,
      adminNavShown,
      freeBadgeVisible,
      freeAccessLabels: /Free Plan|curated|What's included with Free|Membership & Billing/i.test(bodyText),
      billingCard,
      billingManagedByOwner,
      upgradeChrome,
      testingConfig: Boolean(window.LLH_CONFIG?.homeDaycareHubTesting),
      role: account?.role || "",
      accountType: account?.accountType || "",
      plan: account?.plan || "",
      programAccessViaOwner: Boolean(account?.programAccessViaOwner),
    };
  }, CHECK_CAPS);
}

async function runPersonaDevice(page, baseUrl, key, persona, device) {
  curriculumWriteAttempts = [];
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (CURRICULUM_WRITE_RE.test(url) && !["GET", "HEAD", "OPTIONS"].includes(req.method())) {
      curriculumWriteAttempts.push(`${req.method()} ${url}`);
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "pass3_temp_store_only_no_curriculum_writes" }),
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
    record(key, device.label, "boot", "pass");
  } catch (error) {
    record(key, device.label, "boot", "fail", error.message);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `fail-${key}-${device.label}-boot.png`),
      fullPage: true,
    }).catch(() => {});
    return;
  }

  try {
    const shell = await evaluateShell(page);
    assert.ok(shell.bootReady);
    assertSingleView(shell, `${key}-boot`);
    record(key, device.label, "single-view", "pass", shell.activeId);
  } catch (error) {
    record(key, device.label, "single-view", "fail", error.message);
  }

  let perms = null;
  try {
    perms = await evaluatePermissions(page);
    assert.equal(perms.testingConfig, false, "HOME_DAYCARE_HUB_TESTING must be off");
    record(key, device.label, "testing-pro-off", "pass");
  } catch (error) {
    record(key, device.label, "testing-pro-off", "fail", error.message);
  }

  const expected = expectedCaps(persona);
  const wantPro = expectedIsPro(key);

  try {
    assert.ok(perms, "permissions evaluate failed earlier");
    for (const cap of CHECK_CAPS) {
      assert.equal(perms.capabilityResults[cap], expected[cap], `canAccessCapability(${cap})`);
      assert.equal(perms.platformResults[cap], expected[cap], `canAccessPlatformFeature(${cap})`);
    }
    record(key, device.label, "capabilities", "pass", JSON.stringify(perms.capabilityResults));
  } catch (error) {
    record(key, device.label, "capabilities", "fail", error.message, {
      expected,
      actual: perms?.capabilityResults,
      platform: perms?.platformResults,
    });
  }

  try {
    assert.ok(perms, "permissions evaluate failed earlier");
    assert.equal(perms.isProUser, wantPro, `isProUser expected ${wantPro}`);
    record(key, device.label, "isProUser", "pass", String(perms.isProUser));
  } catch (error) {
    record(key, device.label, "isProUser", "fail", error.message);
  }

  try {
    assert.ok(perms, "permissions evaluate failed earlier");
    assert.equal(perms.hasAdminFullAccess, false);
    assert.equal(perms.adminViewActive, false);
    assert.equal(perms.adminNavShown, false);
    record(key, device.label, "admin-hidden", "pass");
  } catch (error) {
    record(key, device.label, "admin-hidden", "fail", error.message, {
      hasAdminFullAccess: perms?.hasAdminFullAccess,
      adminViewActive: perms?.adminViewActive,
      adminNavShown: perms?.adminNavShown,
    });
  }

  // Free-specific chrome / upgrade prompts without admin tools.
  if (key === "free") {
    try {
      assert.ok(perms.freeBadgeVisible || perms.freeAccessLabels, "Free Plan badge or free labels");
      assert.equal(perms.hasAdminFullAccess, false);
      assert.equal(perms.adminNavShown, false);
      assert.ok(perms.upgradeChrome, "upgrade prompts should exist for Free owner");
      record(key, device.label, "free-chrome", "pass");
    } catch (error) {
      record(key, device.label, "free-chrome", "fail", error.message);
    }
  }

  for (const flow of NAV_FLOWS) {
    try {
      await dismissFreePlanNudgeIfPresent(page);
      // Teachers/assistants must not have Settings in primary nav (capability + role guard).
      if ((key === "teacher" || key === "assistant") && flow.nav === "settings") {
        const settingsNav = await page.evaluate(() => {
          const nodes = [...document.querySelectorAll('.sidebar .nav-link[data-view="settings"]')];
          return nodes.map((node) => ({
            visible: !node.hidden
              && node.getAttribute("aria-hidden") !== "true"
              && node.offsetParent !== null,
            work: node.hasAttribute("data-work-nav"),
            legacy: node.hasAttribute("data-legacy-settings-nav"),
          }));
        });
        assert.ok(settingsNav.every((n) => !n.visible), "teacher/assistant must not show Settings nav");
        record(key, device.label, `nav-${flow.label}`, "pass", "settings nav correctly hidden");
        continue;
      }
      await clickSidebarNav(page, flow.nav, flow.view);
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

  // Settings / billing access — role-specific expected paths.
  try {
    if (key === "teacher" || key === "assistant") {
      // Intended model: no Settings hub access. Prove denial + Account-only personal path.
      const denial = await page.evaluate(() => {
        const before = document.querySelector(".active-view")?.id || "";
        if (typeof setView === "function") setView("settings");
        const afterSettings = document.querySelector(".active-view")?.id || "";
        if (typeof setView === "function") setView("billing");
        const afterBilling = document.querySelector(".active-view")?.id || "";
        if (typeof setView === "function") setView("program-settings");
        const afterProgram = document.querySelector(".active-view")?.id || "";
        if (typeof setView === "function") setView("staff");
        const afterStaff = document.querySelector(".active-view")?.id || "";
        if (typeof setView === "function") setView("account", { skipAccessRedirect: false });
        if (typeof renderAccountPage === "function") renderAccountPage();
        const afterAccount = document.querySelector(".active-view")?.id || "";
        const upgradeBtn = document.querySelector("#accountUpgradeButton");
        const upgradeVisible = Boolean(
          upgradeBtn
          && !upgradeBtn.hidden
          && upgradeBtn.style.display !== "none"
          && upgradeBtn.offsetParent !== null,
        );
        const accountText = document.querySelector("#view-account")?.innerText || "";
        return {
          before,
          afterSettings,
          afterBilling,
          afterProgram,
          afterStaff,
          afterAccount,
          canOpenSettings: typeof canOpenViewForCurrentAccess === "function" ? canOpenViewForCurrentAccess("settings") : null,
          canOpenBilling: typeof canOpenViewForCurrentAccess === "function" ? canOpenViewForCurrentAccess("billing") : null,
          canOpenProgramSettings: typeof canOpenViewForCurrentAccess === "function" ? canOpenViewForCurrentAccess("program-settings") : null,
          canOpenStaff: typeof canOpenViewForCurrentAccess === "function" ? canOpenViewForCurrentAccess("staff") : null,
          canSettingsCap: typeof canAccessCapability === "function" ? canAccessCapability(currentAccount(), "settings") : null,
          canBillingCap: typeof canAccessCapability === "function" ? canAccessCapability(currentAccount(), "billing") : null,
          upgradeVisible,
          accountManagedCopy: /managed by the program owner/i.test(accountText),
          accountOpen: afterAccount === "view-account",
          renderThrew: false,
        };
      });
      assert.equal(denial.canSettingsCap, false, "settings capability denied");
      assert.equal(denial.canBillingCap, false, "billing capability denied");
      assert.equal(denial.canOpenSettings, false);
      assert.equal(denial.canOpenBilling, false);
      assert.equal(denial.canOpenProgramSettings, false, "program-settings deep link denied");
      assert.equal(denial.canOpenStaff, false);
      assert.notEqual(denial.afterSettings, "view-settings", "settings deep link must not stay on Settings");
      assert.notEqual(denial.afterBilling, "view-billing", "billing deep link must not open Billing");
      assert.notEqual(denial.afterProgram, "view-program-settings", "program-settings deep link must not open");
      assert.notEqual(denial.afterStaff, "view-staff", "staff deep link must not open");
      assert.equal(denial.accountOpen, true, "Account remains available for personal profile");
      assert.equal(denial.upgradeVisible, false, "Account must not show Upgrade/Manage Billing CTA");
      assert.equal(denial.accountManagedCopy, true, "Account explains billing is owner-managed");
      // Capture role Settings/Account denial evidence for the report.
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `settings-denied-${key}-${device.label}.png`),
        fullPage: true,
      }).catch(() => {});
      record(key, device.label, "settings-billing-gated", "pass", "settings/billing/program admin denied; Account only");
    } else {
      await clickSidebarNav(page, "settings", "settings");
      const settingsPerms = await evaluatePermissions(page);
      if (key === "director") {
        assert.equal(settingsPerms.capabilityResults.billing, false);
        assert.equal(settingsPerms.capabilityResults.staff_management, true);
        assert.equal(settingsPerms.capabilityResults.enrollment, true);
        assert.equal(settingsPerms.billingCard, false);
        record(key, device.label, "settings-billing-gated", "pass");
      } else if (key === "center-owner") {
        assert.equal(settingsPerms.capabilityResults.billing, true);
        assert.equal(settingsPerms.capabilityResults.classrooms, true);
        assert.ok(settingsPerms.billingCard, "center owner billing settings row");
        record(key, device.label, "settings-billing-owner", "pass");
      } else if (key === "free") {
        // Free owners can open Membership & Billing (not a paid portal incorrectly required).
        assert.equal(settingsPerms.capabilityResults.billing, true);
        assert.ok(settingsPerms.billingCard, "free owner membership/billing entry");
        const portalOnly = await page.evaluate(() => {
          const text = document.querySelector("#view-settings")?.innerText || "";
          return /Customer Portal|Manage billing in Stripe|Open billing portal/i.test(text)
            && !/Membership & Billing|Compare Plans|what's included with Free/i.test(text);
        });
        assert.equal(portalOnly, false, "Free must not be forced into billing portal as required");
        record(key, device.label, "settings-billing-free", "pass");
      } else {
        assert.equal(settingsPerms.capabilityResults.billing, true);
        record(key, device.label, "settings-billing-owner", "pass");
      }
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `settings-${key}-${device.label}.png`),
        fullPage: true,
      }).catch(() => {});
    }
  } catch (error) {
    record(key, device.label, "settings-billing", "fail", error.message);
  }

  try {
    assert.equal(curriculumWriteAttempts.length, 0, `curriculum writes: ${curriculumWriteAttempts.join("; ")}`);
    record(key, device.label, "no-curriculum-writes", "pass");
  } catch (error) {
    record(key, device.label, "no-curriculum-writes", "fail", error.message, {
      attempts: curriculumWriteAttempts.slice(),
    });
  }

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, `matrix-${key}-${device.label}.png`),
    fullPage: true,
  }).catch(() => {});
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  console.log("Pass 3 permission matrix (isolated temp local-json store)\n");

  runUnitChecks();

  const { child, port, tmpDir, storePath } = startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForBoot(port, child);

    // Confirm testing fence is off via config endpoint / health path.
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

    // Store must still be the temp path — never production.
    assert.ok(storePath.includes(os.tmpdir()) || storePath.includes("llh-pass3-perm-"));
    const storeAfter = JSON.parse(fs.readFileSync(storePath, "utf8"));
    assert.ok(storeAfter.users?.[PERSONAS.free.email]);
    assert.ok(storeAfter.users?.[CENTER_OWNER_EMAIL]);
    record("meta", "store", "temp-store-intact", "pass", storePath);
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { child.kill("SIGKILL"); } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    suite: "pass3-permission-matrix",
    store: "isolated-temp-local-json",
    homeDaycareHubTesting: false,
    personas: Object.keys(PERSONAS),
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
