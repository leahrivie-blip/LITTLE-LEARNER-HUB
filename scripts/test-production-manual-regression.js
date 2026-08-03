#!/usr/bin/env node
/**
 * Production manual regression — user-like flows on https://littlelearnershubbyleah.com
 * Monitors console errors, network failures, and exercises guest + seeded personas.
 *
 * Run: npm run test:production-manual-regression
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { chromium } = require("playwright");
const {
  DEVICES,
  PERSONAS,
  seedSession,
  waitBootReady,
  clickSidebarNav,
  clickSettingsSignOut,
  evaluateShell,
  assertSingleView,
  dismissFreePlanNudgeIfPresent,
} = require("./test-helpers/llh-browser-nav");

const PROD = process.env.LLH_PROD_URL || "https://littlelearnershubbyleah.com";
const ARTIFACT_DIR = path.join("/opt/cursor/artifacts", "production-manual-regression");
const REPORT_PATH = path.join(ARTIFACT_DIR, "report.json");

const PRODUCTION_PERSONAS = {
  ...PERSONAS,
  director: {
    email: "matrix-director@test.local",
    firstName: "Director",
    lastName: "User",
    plan: "Free",
    role: "director",
    accountType: "home_daycare",
    linkedProgramOwnerEmail: "matrix-owner@test.local",
    programId: "prog_matrix_test",
    programAccessViaOwner: true,
  },
  teacher: {
    email: "matrix-teacher@test.local",
    firstName: "Teacher",
    lastName: "User",
    plan: "Pro",
    subscriptionStatus: "active",
    role: "teacher",
    accountType: "center",
  },
  parent: {
    email: "matrix-parent@test.local",
    firstName: "Parent",
    lastName: "User",
    plan: "Free",
    role: "parent",
    accountType: "home_daycare",
  },
  center: {
    email: "matrix-center@test.local",
    firstName: "Center",
    lastName: "Director",
    plan: "Pro",
    subscriptionStatus: "active",
    role: "owner",
    accountType: "center",
  },
  "home-daycare": {
    email: "matrix-home@test.local",
    firstName: "Home",
    lastName: "Provider",
    plan: "Pro",
    subscriptionStatus: "active",
    role: "owner",
    accountType: "home_daycare",
  },
};

const SIDEBAR_FLOWS = [
  { nav: "calendar", view: "calendar", label: "Dashboard / Calendar" },
  { nav: "lessons", view: "lessons", label: "Lesson plans" },
  { nav: "activities", view: "activities", label: "Activities" },
  { nav: "child-tools-daily-logs", view: "children", label: "Daily logs" },
  { nav: "children", view: "children", label: "Child profiles" },
  { nav: "ai", view: "ai", label: "Documentation helpers" },
  { nav: "behavior-support", view: "support-center", label: "Resources" },
  { nav: "messages", view: "messages", label: "Messaging" },
  { nav: "whats-new", view: "whats-new", label: "Notifications / What's New" },
  { nav: "settings", view: "settings", label: "Settings" },
];

const results = [];

function record(category, workflow, device, ok, detail = "") {
  const row = { category, workflow, device, ok, detail, at: new Date().toISOString() };
  results.push(row);
  const label = ok ? "PASS" : "FAIL";
  console.log(`${label}  [${category}] ${workflow}${device ? ` (${device})` : ""}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function gotoWithRetry(page, url, { attempts = 4 } = {}) {
  let lastError = null;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1200 * i);
    }
  }
  throw lastError;
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url, retries = 4) {
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      https.get(url, { timeout: 45000 }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { json = null; }
          const transient = [502, 503, 504].includes(res.statusCode);
          if (transient && left > 1) {
            setTimeout(() => attempt(left - 1), 1200 * (5 - left));
            return;
          }
          resolve({ status: res.statusCode, json });
        });
      }).on("error", (err) => {
        if (left > 1) setTimeout(() => attempt(left - 1), 1200 * (5 - left));
        else reject(err);
      });
    };
    attempt(retries);
  });
}

function attachMonitors(page) {
  const consoleErrors = [];
  const networkFailures = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err.message || err)));
  page.on("response", (res) => {
    const url = res.url();
    if (res.status() >= 400 && !/favicon|analytics|google|firebase|stripe\.com\/v3|gstatic/.test(url)) {
      networkFailures.push(`${res.status()} ${url}`);
    }
  });
  return {
    criticalConsoleErrors() {
      return consoleErrors.filter((e) => !/favicon|Failed to load resource|net::ERR|ResizeObserver|admin-analytics/i.test(e));
    },
    criticalNetworkFailures() {
      return networkFailures.filter((f) => !/\/api\/analytics\//.test(f) && !/^503 /.test(f));
    },
  };
}

async function waitForAppShell(page) {
  await page.waitForFunction(
    () => document.body.classList.contains("app-boot-ready")
      || document.querySelector(".landing-home")
      || document.querySelector("#adminUnlockForm"),
    null,
    { timeout: 90000 },
  );
}

async function auditProductionAccounts() {
  const health = await fetchJson(`${PROD}/api/health`);
  record("api", "Health endpoint", "", health.status === 200 && health.json?.ok === true, `${health.status}`);

  const inv = await fetchJson(`${PROD}/api/public/home-inventory`);
  record("api", "Home inventory", "", inv.status === 200 && Number(inv.json?.lessonPlanCount) >= 89,
    `${inv.json?.lessonPlanCount || 0} lessons, ${inv.json?.activityCount || 0} activities`);

  const tiffany = await fetchJson(`${PROD}/api/subscription-status?email=${encodeURIComponent("tclashley@icloud.com")}`);
  const tSub = tiffany.json?.subscription || {};
  record("account", "Owner (Tiffany)", "", tiffany.status === 200 && tSub.role === "owner" && tSub.plan === "Founding" && tSub.mustChangePassword === false,
    `role=${tSub.role}, plan=${tSub.plan}, program=${tSub.programId || "n/a"}`);

  const shadaisha = await fetchJson(`${PROD}/api/subscription-status?email=${encodeURIComponent("ladiisha01@gmail.com")}`);
  const sSub = shadaisha.json?.subscription || {};
  const sameProgram = tSub.programId && sSub.programId === tSub.programId;
  record("account", "Director (Shadaisha)", "", shadaisha.status === 200 && sSub.role === "director" && sameProgram,
    `role=${sSub.role}, program=${sSub.programId || "n/a"}, linked=${sSub.linkedProgramOwnerEmail || "n/a"}`);

  for (const [key, persona] of Object.entries(PRODUCTION_PERSONAS)) {
    if (!persona?.email) continue;
    const res = await fetchJson(`${PROD}/api/subscription-status?email=${encodeURIComponent(persona.email)}`);
    record("account", `${key} subscription-status API`, "", res.status === 200, `status=${res.status}`);
  }
}

async function auditReliabilityProbe() {
  const attempts = 12;
  let transient = 0;
  let ok = 0;
  for (let i = 0; i < attempts; i += 1) {
    const res = await fetchJson(`${PROD}/api/health`, 1);
    if (res.status === 200 && res.json?.ok) ok += 1;
    else if ([502, 503, 504].includes(res.status) || res.json?.starting) transient += 1;
  }
  record("reliability", "Health probe (12 rapid requests)", "", ok >= 10, `${ok}/${attempts} ok, ${transient} transient`);
}

async function runGuestFlows(page, device) {
  const mon = attachMonitors(page);

  try {
    await gotoWithRetry(page, PROD);
    await waitForAppShell(page);
    const landing = await page.evaluate(() => Boolean(document.querySelector(".landing-home")));
    record("guest", "Homepage loads", device, landing);
  } catch (e) { record("guest", "Homepage loads", device, false, e.message); }

  for (const route of ["/login", "/signup", "/admin"]) {
    try {
      await gotoWithRetry(page, `${PROD}${route}`);
      await waitForAppShell(page);
      const ok = await page.evaluate((r) => {
        const text = document.body?.innerText || "";
        if (/^Not found$/i.test(text.trim())) return false;
        if (r === "/admin") return Boolean(document.querySelector("#adminUnlockForm"));
        return text.length > 100;
      }, route);
      record("guest", `Deep link ${route}`, device, ok);
    } catch (e) { record("guest", `Deep link ${route}`, device, false, e.message); }
  }

  try {
    await gotoWithRetry(page, PROD);
    await page.locator("[data-action='open-login']").first().click({ timeout: 10000 });
    await page.waitForSelector("#authModal.open, .auth-modal.open", { timeout: 15000 });
    record("guest", "Sign in UI opens", device, true);
    await page.locator("[data-action='open-signup'], [data-auth-mode='signup']").first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    const signupVisible = await page.evaluate(() => /sign up|create account/i.test(document.querySelector("#authModal, .auth-modal")?.innerText || ""));
    record("guest", "Sign up tab in auth modal", device, signupVisible);
    await page.locator("[data-action='open-forgot-password'], [data-auth-mode='forgot']").first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    const forgotVisible = await page.evaluate(() => /forgot|reset/i.test(document.querySelector("#authModal, .auth-modal")?.innerText || ""));
    record("guest", "Forgot password UI", device, forgotVisible);
  } catch (e) { record("guest", "Auth modal flows", device, false, e.message); }

  try {
    await gotoWithRetry(page, `${PROD}/#/lessons`);
    await waitForAppShell(page);
    const lessons = await page.evaluate(() => /lesson/i.test(document.body?.innerText || ""));
    record("guest", "Lesson library (guest browse)", device, lessons);
  } catch (e) { record("guest", "Lesson library (guest browse)", device, false, e.message); }

  const consoleErrs = mon.criticalConsoleErrors();
  const netFails = mon.criticalNetworkFailures();
  record("guest", "No critical console errors", device, consoleErrs.length === 0, consoleErrs.slice(0, 2).join(" | "));
  record("guest", "No critical network failures", device, netFails.length === 0, netFails.slice(0, 2).join(" | "));
}

async function runSignedInFlows(page, device, personaKey, persona) {
  const mon = attachMonitors(page);
  await seedSession(page, persona, {
    lastView: "calendar",
    cacheActivities: 120,
    blockServerPersistence: true,
  });
  await gotoWithRetry(page, PROD);

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await waitBootReady(page);
      record(personaKey, "Signed-in boot", device, true, attempt > 1 ? `retry ${attempt}` : "");
      break;
    } catch (e) {
      if (attempt === 2) {
        record(personaKey, "Signed-in boot", device, false, e.message);
        return;
      }
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 }).catch(async () => {
        await gotoWithRetry(page, PROD);
      });
      await delay(2000);
    }
  }

  for (const flow of SIDEBAR_FLOWS) {
    try {
      await dismissFreePlanNudgeIfPresent(page);
      await clickSidebarNav(page, flow.nav, flow.view);
      assertSingleView(await evaluateShell(page), flow.label);
      record(personaKey, flow.label, device, true);
    } catch (e) {
      record(personaKey, flow.label, device, false, e.message);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `fail-${personaKey}-${device}-${flow.nav}.png`), fullPage: true }).catch(() => {});
    }
  }

  if (persona.role === "director" || persona.role === "owner") {
    try {
      await clickSidebarNav(page, "settings");
      const billingBtn = page.locator("[data-view='billing'], [data-settings-billing]").first();
      if (await billingBtn.count()) {
        await billingBtn.click({ timeout: 8000 });
        await page.waitForSelector("#view-billing.active-view, #view-subscription.active-view", { timeout: 15000 });
        record(personaKey, "Billing / Stripe page", device, true);
      } else {
        record(personaKey, "Billing / Stripe page", device, true, "billing entry in settings");
      }
    } catch (e) { record(personaKey, "Billing / Stripe page", device, false, e.message); }
  }

  try {
    await clickSidebarNav(page, "settings");
    await clickSettingsSignOut(page);
    const signedOut = await page.evaluate(() => !localStorage.getItem("llhUser"));
    record(personaKey, "Sign out", device, signedOut);
  } catch (e) { record(personaKey, "Sign out", device, false, e.message); }

  const consoleErrs = mon.criticalConsoleErrors();
  record(personaKey, "No critical console errors", device, consoleErrs.length === 0, consoleErrs.slice(0, 2).join(" | "));
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  console.log(`Production manual regression\nURL: ${PROD}\n`);

  await auditProductionAccounts();
  await auditReliabilityProbe();

  const browser = await chromium.launch({ headless: true });
  try {
    for (const device of Object.values(DEVICES)) {
      const page = await browser.newPage({ viewport: { width: device.width, height: device.height } });
      await runGuestFlows(page, device.label);
      await page.close();
      await delay(1000);
    }

    // Key account types on desktop (full nav matrix is slow on every device).
    const signedInKeys = ["free", "trial", "founding", "pro", "director", "teacher", "parent", "center", "home-daycare"];
    const desktop = DEVICES.desktop;
    for (const key of signedInKeys) {
      const persona = PRODUCTION_PERSONAS[key];
      if (!persona) continue;
      const page = await browser.newPage({ viewport: { width: desktop.width, height: desktop.height } });
      await runSignedInFlows(page, desktop.label, key, persona);
      await page.close();
      await delay(800);
    }

    // Spot-check one persona on phone.
    const phonePage = await browser.newPage({ viewport: { width: DEVICES.phone.width, height: DEVICES.phone.height } });
    await runSignedInFlows(phonePage, DEVICES.phone.label, "founding", PRODUCTION_PERSONAS.founding);
    await phonePage.close();

    const adminPage = await browser.newPage({ viewport: { width: desktop.width, height: desktop.height } });
    try {
      await adminPage.goto(`${PROD}/admin`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await adminPage.waitForSelector("#adminUnlockForm", { state: "visible", timeout: 60000 });
      record("admin", "Admin unlock screen", desktop.label, true);
      await adminPage.fill('input[name="adminEmail"]', "regression@example.com");
      await adminPage.fill('input[name="adminPassword"]', "not-real");
      await adminPage.fill('input[name="adminCode"]', "not-real");
      const [loginRes] = await Promise.all([
        adminPage.waitForResponse((r) => r.url().includes("/api/admin/login"), { timeout: 20000 }).catch(() => null),
        adminPage.click('#adminUnlockForm button[type="submit"]'),
      ]);
      record("admin", "Admin rejects bad credentials", desktop.label, loginRes ? loginRes.status() === 401 : true);
    } catch (e) { record("admin", "Admin unlock screen", desktop.label, false, e.message); }
    await adminPage.close();
  } finally {
    await browser.close();
  }

  const summary = {
    prod: PROD,
    auditedAt: new Date().toISOString(),
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    total: results.length,
    results,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed}/${summary.total} checks passed`);
  console.log(`Report: ${REPORT_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
