#!/usr/bin/env node
/**
 * Deployed testing-site smoke test (NOT localhost).
 *
 * Default target: https://little-learner-hub-testing.onrender.com
 *
 * Verifies the deployed build: health, build-version (pinned commit),
 * production locks, Admin → Owner Testing Home, Testing Lab (not Calendar),
 * Add External Tester wizard, disposable fake tester login, Provider/Parent
 * nav, Daily Care, Testing Feedback, no boot timeout, no console errors.
 *
 * Uses a disposable smoke-test organization that is reset after the run.
 * Never uses real accounts or real childcare data.
 * Never calls Stripe, email, SMS, or OpenAI.
 *
 * Env:
 *   LLH_TESTING_SMOKE_URL            default https://little-learner-hub-testing.onrender.com
 *   LLH_TESTING_SMOKE_ADMIN_EMAIL    required
 *   LLH_TESTING_SMOKE_ADMIN_PASSWORD required
 *   LLH_TESTING_SMOKE_ADMIN_CODE     required
 *   LLH_TESTING_SMOKE_EXPECTED_SHA   required — must match /api/build-version (refuse any other build)
 *   LLH_TESTING_SMOKE_SKIP=1         exit 0 without running (local CI without secrets)
 */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE = String(process.env.LLH_TESTING_SMOKE_URL || "https://little-learner-hub-testing.onrender.com").replace(/\/$/, "");
const ADMIN = {
  email: process.env.LLH_TESTING_SMOKE_ADMIN_EMAIL || "",
  password: process.env.LLH_TESTING_SMOKE_ADMIN_PASSWORD || "",
  code: process.env.LLH_TESTING_SMOKE_ADMIN_CODE || "",
};
const EXPECTED_SHA = String(process.env.LLH_TESTING_SMOKE_EXPECTED_SHA || "").trim();

const PRODUCTION_HOST_BLOCKLIST = [
  "littlelearnershubbyleah.com",
  "www.littlelearnershubbyleah.com",
  "little-learner-hub.onrender.com",
];

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function assertTestingHost(urlString) {
  let host = "";
  try {
    host = new URL(urlString).hostname.toLowerCase();
  } catch {
    throw new Error(`Invalid LLH_TESTING_SMOKE_URL: ${urlString}`);
  }
  if (PRODUCTION_HOST_BLOCKLIST.includes(host)) {
    throw new Error(`Refusing production host "${host}" — deployed smoke may only target the testing site.`);
  }
  if (/^littlelearnershub/i.test(host) && !/testing/i.test(host)) {
    throw new Error(`Refusing non-testing brand host "${host}".`);
  }
  if (!/testing|localhost|127\.0\.0\.1|onrender\.com/i.test(host)) {
    throw new Error(`Refusing unrecognized host "${host}" — expected a testing hostname.`);
  }
  return host;
}

async function fetchJson(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, text };
}

async function resetDisposableOrg(adminToken, organizationId) {
  if (!organizationId || !adminToken) return;
  await fetchJson("/api/external-tester/reset-fake-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ organizationId, confirm: true }),
  });
}

async function main() {
  if (process.env.LLH_TESTING_SMOKE_SKIP === "1") {
    console.log("SKIP  deployed testing smoke (LLH_TESTING_SMOKE_SKIP=1)");
    return;
  }

  // Refuse production / unknown hosts BEFORE touching credentials or the network.
  let host;
  try {
    host = assertTestingHost(BASE);
  } catch (err) {
    console.error(String(err.message || err));
    process.exitCode = 1;
    return;
  }

  if (!ADMIN.email || !ADMIN.password || !ADMIN.code) {
    console.error("Missing LLH_TESTING_SMOKE_ADMIN_EMAIL / PASSWORD / CODE — refuse to run against a live host without disposable Admin credentials.");
    process.exitCode = 1;
    return;
  }

  if (!EXPECTED_SHA) {
    console.error("Missing LLH_TESTING_SMOKE_EXPECTED_SHA — refuse to accept any deployed build. Pin the exact testing commit SHA.");
    process.exitCode = 1;
    return;
  }

  console.log(`Deployed testing smoke → ${BASE}`);
  console.log(`Expected deployed commit: ${EXPECTED_SHA.slice(0, 12)}…`);

  let adminToken = "";
  let organizationId = "";
  let browser;

  try {
    // --- API checks ---
    const health = await fetchJson("/api/health");
    assert.equal(health.status, 200, "/api/health must succeed");
    assert.equal(health.json?.ok, true, "/api/health.ok");
    pass("/api/health succeeds");

    const build = await fetchJson("/api/build-version");
    assert.equal(build.status, 200, "/api/build-version must succeed");
    assert.ok(build.json?.gitSha, "/api/build-version must return gitSha");
    const deployedSha = String(build.json.gitSha || "");
    assert.equal(
      deployedSha.slice(0, EXPECTED_SHA.length),
      EXPECTED_SHA.slice(0, EXPECTED_SHA.length),
      `deployed commit must match expected SHA (got ${deployedSha.slice(0, 12)}, expected ${EXPECTED_SHA.slice(0, 12)})`,
    );
    pass(`/api/build-version matches expected commit (${deployedSha.slice(0, 12)})`);
    pass(`testing hostname is correct (${host})`);

    const login = await fetchJson("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ADMIN),
    });
    assert.equal(login.status, 200, "Admin login API must succeed with smoke credentials");
    adminToken = login.json?.token || "";
    assert.ok(adminToken, "Admin token required");
    pass("Platform Admin API login works");

    const status = await fetchJson("/api/testing-lab/status", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(status.status, 200, "testing-lab status must succeed");
    assert.equal(status.json?.databaseConnected, true, "database must be ready");
    assert.equal(status.json?.liveProduction, false, "production locks must remain active (liveProduction=false)");
    assert.equal(status.json?.stripeEnabled, false, "Stripe must stay disabled on testing");
    assert.equal(status.json?.emailSmsEnabled, false, "Email/SMS must stay disabled on testing");
    assert.equal(status.json?.aiEnabled, false, "AI must stay disabled on testing");
    pass("Database ready + production locks active (Stripe/email/SMS/AI disabled)");

    // --- Browser checks ---
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage();
    const consoleErrors = [];
    const failedCritical = [];
    const forbiddenExternal = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err?.message || err)));
    page.on("request", (req) => {
      const url = req.url();
      if (/api\.stripe\.com|checkout\.stripe\.com|api\.openai\.com|api\.resend\.com|api\.twilio\.com|hooks\.stripe/i.test(url)) {
        forbiddenExternal.push(url);
      }
    });
    page.on("requestfailed", (req) => {
      const url = req.url();
      if (/\/api\//.test(url) && !/favicon|fonts\.google/.test(url)) {
        failedCritical.push(`${req.failure()?.errorText || "failed"} ${url}`);
      }
    });
    page.on("response", (res) => {
      if (res.status() >= 500 && /\/api\//.test(res.url())) failedCritical.push(`HTTP ${res.status()} ${res.url()}`);
    });

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 60000 });

    await page.evaluate(() => setView("admin"));
    await page.waitForSelector("#adminUnlockForm", { timeout: 20000 });
    const signedOutText = await page.locator("#adminLockPanel").textContent();
    assert.match(signedOutText, /Little Learner Hub Admin/i, "normal Admin login page must open");
    assert.equal(await page.evaluate(() => document.body.classList.contains("signed-out-admin-view")), true, "signed-out admin chrome must hide marketing/role nav");
    pass("Normal Admin login page opens (signed-out admin view)");

    await page.fill("#adminUnlockForm [name='adminEmail']", ADMIN.email);
    await page.fill("#adminUnlockForm [name='adminPassword']", ADMIN.password);
    await page.fill("#adminUnlockForm [name='adminCode']", ADMIN.code);
    await page.click("#adminUnlockForm button[type='submit']");
    await page.waitForTimeout(2000);
    await page.waitForSelector("#view-owner-testing-home.active-view, #view-admin.active-view", { timeout: 30000 });
    const landing = await page.evaluate(() => document.querySelector(".active-view")?.id);
    assert.equal(landing, "view-owner-testing-home", "Platform Admin must reach Owner Testing Home");
    pass("Platform Admin reaches Owner Testing Home");

    await page.click('[data-view="testing-lab"][data-testing-lab-nav], [data-view="testing-lab"]');
    await page.waitForTimeout(2000);
    const afterLab = await page.evaluate(() => document.querySelector(".active-view")?.id);
    assert.equal(afterLab, "view-testing-lab", "Testing Lab must open instead of Calendar");
    assert.notEqual(afterLab, "view-calendar", "must not bounce to Calendar");
    pass("Testing Lab opens instead of Calendar");

    await page.evaluate(() => setView("owner-testing-home"));
    await page.waitForTimeout(800);
    await page.click('[data-oth-panel="accounts"]');
    await page.waitForTimeout(1500);
    const wizardVisible = await page.locator("[data-tl-pilot-create]").isVisible().catch(() => false);
    assert.equal(wizardVisible, true, "Add External Tester wizard must open");
    pass("Add External Tester wizard opens");

    const stamp = Date.now().toString(36);
    const testerEmail = `smoke.deployed.${stamp}@example.invalid`;
    await page.fill("[data-tl-pilot-create] input[name='testerName']", "Deployed Smoke Tester");
    await page.fill("[data-tl-pilot-create] input[name='email']", testerEmail);
    await page.click("[data-tl-pilot-create] button[type='submit']");
    await page.waitForTimeout(1500);
    const testerPassword = (await page.locator("[data-tl-pilot-password]").textContent()).trim();
    assert.ok(testerPassword && testerPassword.length > 4, "wizard must issue temporary password");

    // Capture disposable org id for cleanup (Admin API list / create response on page).
    organizationId = await page.evaluate(() => {
      const el = document.querySelector("[data-tl-pilot-org-id], [data-created-org-id]");
      return (el && (el.getAttribute("data-tl-pilot-org-id") || el.getAttribute("data-created-org-id") || el.textContent || "")).trim();
    }).catch(() => "");

    if (!organizationId) {
      // Fallback: create a disposable pilot via Admin API so we always have an org to reset.
      const wizard = await fetchJson("/api/external-tester/create-pilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          testerName: "Deployed Smoke API Org",
          email: `smoke.api.${stamp}@example.invalid`,
          childCount: 1,
        }),
      });
      organizationId = wizard.json?.organizationId || "";
    }
    assert.ok(organizationId, "disposable fake organization id required for cleanup");
    pass(`Disposable fake organization created (${organizationId.slice(0, 12)}…)`);

    await page.evaluate(() => { if (typeof signOut === "function") signOut(); });
    await page.waitForTimeout(500);
    await page.evaluate(() => openAuthModal("login"));
    await page.waitForTimeout(400);
    await page.fill("#emailInput", testerEmail);
    await page.fill("#passwordInput", testerPassword);
    await page.click("#authSubmitButton");
    await page.waitForTimeout(2000);
    assert.equal(await page.evaluate(() => currentUser), testerEmail, "disposable fake tester must sign in");
    await page.waitForSelector("#pilotProviderNav", { timeout: 20000 });
    pass("Disposable fake tester signs in; Home Daycare Provider navigation appears");

    await page.click("[data-sandbox-switch-role]");
    await page.waitForTimeout(400);
    await page.click('[data-sandbox-role-option="parent_guardian"]');
    await page.waitForTimeout(400);
    if (await page.locator("[data-sandbox-guardian-option]").count()) {
      await page.locator("[data-sandbox-guardian-option]").first().click();
    }
    await page.waitForTimeout(1200);
    await page.waitForSelector("#pilotParentNav", { timeout: 15000 });
    pass("Parent role switch works");

    await page.click("[data-sandbox-switch-role]");
    await page.waitForTimeout(400);
    const providerOption = page.locator('[data-sandbox-role-option="home_daycare"], [data-sandbox-role-option="owner"], [data-sandbox-role-option="solo_provider"], [data-sandbox-role-option="provider"]').first();
    if (await providerOption.count()) {
      await providerOption.click();
      await page.waitForTimeout(1000);
    }
    const dailyCareNav = page.locator('#pilotProviderNav [data-view="child-tools-daily-logs"], [data-view="child-tools-daily-logs"], [data-view="daily-care"]').first();
    if (await dailyCareNav.count()) {
      await dailyCareNav.click({ force: true });
      await page.waitForTimeout(1200);
    } else {
      await page.evaluate(() => { if (typeof setView === "function") setView("child-tools-daily-logs"); });
      await page.waitForTimeout(1200);
    }
    const dailyActive = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
    assert.match(dailyActive, /daily|care|log|children/i, "Daily Care / Daily Logs must open");
    const hasFastGrid = await page.locator(".fdlc-classroom-grid").count();
    assert.ok(hasFastGrid > 0, "Home Daycare Provider Daily Logs must use the approved Fast Daily Logs redesign");
    pass("Daily Care / Fast Daily Logs redesign opens from Provider nav");

    await page.click("[data-tf-toggle], [data-pilot-open-feedback]").catch(async () => {
      await page.evaluate(() => document.querySelector("[data-tf-toggle]")?.click());
    });
    await page.waitForTimeout(800);
    const feedbackOpen = await page.locator("[data-tf-panel]:not([hidden]), .testing-feedback-panel:not([hidden])").count();
    assert.ok(feedbackOpen > 0 || await page.locator("[data-tf-new-form]").count(), "Testing Feedback must open");
    pass("Testing Feedback opens");

    const bootTimeoutLogs = consoleErrors.filter((msg) => /App boot timed out|continuing with local UI/i.test(msg));
    assert.equal(bootTimeoutLogs.length, 0, `no app-boot timeout allowed: ${bootTimeoutLogs.join(" | ")}`);
    pass("No app-boot timeout");

    const actionableConsole = consoleErrors.filter((msg) =>
      !/favicon|manifest|Failed to load resource.*(404|favicon)|net::ERR_/i.test(msg)
      && !/ResizeObserver/i.test(msg));
    assert.deepEqual(actionableConsole, [], `no console errors: ${JSON.stringify(actionableConsole)}`);
    pass("No console errors");

    assert.deepEqual(failedCritical, [], `no failed critical network requests: ${JSON.stringify(failedCritical)}`);
    pass("No failed critical network requests");

    assert.deepEqual(forbiddenExternal, [], `must never call Stripe/email/SMS/OpenAI: ${JSON.stringify(forbiddenExternal)}`);
    pass("Never called Stripe, email, SMS, or OpenAI");

    await fetchJson("/api/testing-lab/smoke-result", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        ok: true,
        passed,
        targetHost: host,
        deployedCommit: deployedSha,
        expectedCommit: EXPECTED_SHA,
        organizationId,
        testerEmailDomain: "example.invalid",
        at: new Date().toISOString(),
      }),
    }).catch(() => {});

    console.log(`\nDeployed testing smoke passed (${passed} checks) against ${BASE}`);
  } catch (error) {
    console.error("FAIL", error);
    process.exitCode = 1;
    try {
      if (adminToken) {
        const failureMessage = String(error?.message || error || "Deployed smoke test failed").slice(0, 240);
        await fetchJson("/api/testing-lab/smoke-result", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            ok: false,
            passed,
            targetHost: (() => { try { return new URL(BASE).hostname; } catch { return ""; } })(),
            deployedCommit: EXPECTED_SHA,
            message: failureMessage,
            failures: [{
              errorType: "deployed_smoke_failure",
              message: failureMessage,
              page: "deployed-smoke",
              role: "admin",
              device: "computer",
            }],
            testerEmailDomain: "example.invalid",
            at: new Date().toISOString(),
          }),
        });
        await fetchJson("/api/auto-bugs/from-smoke", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            ok: false,
            message: failureMessage,
            deployedCommit: EXPECTED_SHA,
            targetHost: (() => { try { return new URL(BASE).hostname; } catch { return ""; } })(),
            failures: [{
              errorType: "deployed_smoke_failure",
              message: failureMessage,
              page: "deployed-smoke",
              role: "admin",
              device: "computer",
            }],
          }),
        });
      }
    } catch { /* best-effort bug record on smoke failure */ }
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    if (adminToken && organizationId) {
      try {
        await resetDisposableOrg(adminToken, organizationId);
        console.log(`RESET disposable organization ${organizationId.slice(0, 12)}…`);
      } catch (resetErr) {
        console.error("WARN  could not reset disposable organization:", resetErr?.message || resetErr);
      }
    }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
