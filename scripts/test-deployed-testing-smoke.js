#!/usr/bin/env node
/**
 * Deployed testing-site smoke test (NOT localhost).
 *
 * Default target: https://little-learner-hub-testing.onrender.com
 *
 * Verifies the deployed build: health, build-version, production locks,
 * Admin → Owner Testing Home, Testing Lab (not Calendar), Add External
 * Tester wizard, disposable fake tester login, Provider/Parent nav,
 * Daily Care, Testing Feedback, no boot timeout, no console errors.
 *
 * Uses a disposable smoke-test organization that can be reset.
 * Never uses real accounts or real childcare data.
 *
 * Env:
 *   LLH_TESTING_SMOKE_URL          default https://little-learner-hub-testing.onrender.com
 *   LLH_TESTING_SMOKE_ADMIN_EMAIL
 *   LLH_TESTING_SMOKE_ADMIN_PASSWORD
 *   LLH_TESTING_SMOKE_ADMIN_CODE
 *   LLH_TESTING_SMOKE_EXPECTED_SHA optional — if set, must match /api/build-version
 *   LLH_TESTING_SMOKE_SKIP=1       exit 0 without running (local CI without secrets)
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

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS  ${name}`);
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

async function main() {
  if (process.env.LLH_TESTING_SMOKE_SKIP === "1") {
    console.log("SKIP  deployed testing smoke (LLH_TESTING_SMOKE_SKIP=1)");
    return;
  }
  if (!ADMIN.email || !ADMIN.password || !ADMIN.code) {
    console.error("Missing LLH_TESTING_SMOKE_ADMIN_EMAIL / PASSWORD / CODE — refuse to run against a live host without disposable Admin credentials.");
    process.exitCode = 1;
    return;
  }

  console.log(`Deployed testing smoke → ${BASE}`);

  // --- API checks ---
  const health = await fetchJson("/api/health");
  assert.equal(health.status, 200, "/api/health must succeed");
  assert.equal(health.json?.ok, true, "/api/health.ok");
  pass("/api/health succeeds");

  const build = await fetchJson("/api/build-version");
  assert.equal(build.status, 200, "/api/build-version must succeed");
  assert.ok(build.json?.gitSha, "/api/build-version must return gitSha");
  if (EXPECTED_SHA) {
    assert.equal(String(build.json.gitSha).slice(0, EXPECTED_SHA.length), EXPECTED_SHA.slice(0, EXPECTED_SHA.length), "deployed commit must match expected SHA");
  }
  pass(`/api/build-version returns commit (${String(build.json.gitSha).slice(0, 12)})`);

  const host = new URL(BASE).hostname.toLowerCase();
  assert.match(host, /testing|onrender\.com|localhost/, "smoke target must be a testing hostname, never production brand domain alone");
  assert.notEqual(host, "littlelearnershubbyleah.com", "must not target live production hostname");
  pass(`testing hostname is correct (${host})`);

  // Database readiness via Admin unlock + status (after browser login we also check UI).
  const login = await fetchJson("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ADMIN),
  });
  assert.equal(login.status, 200, "Admin login API must succeed with smoke credentials");
  const adminToken = login.json?.token || "";
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
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedCritical = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err?.message || err)));
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

  // Signed-out Admin page
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

  // Testing Lab (not Calendar)
  await page.click('[data-view="testing-lab"][data-testing-lab-nav], [data-view="testing-lab"]');
  await page.waitForTimeout(2000);
  const afterLab = await page.evaluate(() => document.querySelector(".active-view")?.id);
  assert.equal(afterLab, "view-testing-lab", "Testing Lab must open instead of Calendar");
  assert.notEqual(afterLab, "view-calendar", "must not bounce to Calendar");
  pass("Testing Lab opens instead of Calendar");

  // Add External Tester wizard via Owner Testing Home deep link
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

  // Sign out admin session identity for member login (Admin unlock may remain on device — that's OK)
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

  // Daily Care — provider side after switching back if needed
  await page.click("[data-sandbox-switch-role]");
  await page.waitForTimeout(400);
  const providerOption = page.locator('[data-sandbox-role-option="home_daycare"], [data-sandbox-role-option="owner"], [data-sandbox-role-option="provider"]').first();
  if (await providerOption.count()) {
    await providerOption.click();
    await page.waitForTimeout(1000);
  }
  const dailyCareNav = page.locator('[data-view="daily-care"], [data-view="daily-logs"], [data-pilot-nav="daily-care"]').first();
  if (await dailyCareNav.count()) {
    await dailyCareNav.click({ force: true });
    await page.waitForTimeout(1200);
  } else {
    await page.evaluate(() => { if (typeof setView === "function") setView("daily-care"); });
    await page.waitForTimeout(1200);
  }
  const dailyActive = await page.evaluate(() => document.querySelector(".active-view")?.id || "");
  assert.match(dailyActive, /daily|care|log/i, "Daily Care must open");
  pass("Daily Care opens");

  // Testing Feedback
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

  // Record smoke result for Admin Health Center (best-effort).
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
      deployedCommit: build.json.gitSha,
      testerEmailDomain: "example.invalid",
      at: new Date().toISOString(),
    }),
  }).catch(() => {});

  await browser.close();
  console.log(`\nDeployed testing smoke passed (${passed} checks) against ${BASE}`);
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
