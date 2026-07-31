#!/usr/bin/env node
/**
 * Real-browser verification of the Founding-vs-Regular-Pro pricing clarity change
 * (PR #336, v2 correction): required copy, the three-way confirmation modal,
 * eligibility gating, sold-out/stale-counter behavior, and responsive layout.
 *
 * Captures screenshots into docs/screenshots/pricing-clarity-v2/ for the record.
 *
 * Run: node scripts/test-founding-vs-pro-confirmation-browser.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const SHOT_DIR = path.join(ROOT, "docs/screenshots/pricing-clarity-v2");
fs.mkdirSync(SHOT_DIR, { recursive: true });

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`PASS  ${name}`))
    .catch((error) => {
      console.error(`FAIL  ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

function requestJson(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "127.0.0.1", port, path: urlPath, method, headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {} },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer(port, storePath, extraEnv = {}) {
  fs.writeFileSync(storePath, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {}, foundingMembers: [] }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      SITE_URL: `http://127.0.0.1:${port}`,
      ADMIN_EMAIL: "pricing-v2-admin@example.com",
      ADMIN_PASSWORD: "pricing-v2-admin-pass",
      ADMIN_ACCESS_CODE: "pricing-v2-admin-code",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      NODE_ENV: "test",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(port, child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson(port, "GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

/** Every page needs this — startCheckout() uses a native window.confirm() before
 * hitting the (unconfigured, in tests) Stripe backend; without an explicit handler
 * Playwright auto-dismisses dialogs, which would make confirm() return false and
 * silently short-circuit checkout before the test panel ever renders. */
async function newPage(browser, viewport) {
  const page = await browser.newPage({ viewport });
  page.on("dialog", async (dialog) => { await dialog.accept(); });
  return page;
}

async function loadHome(page, port) {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof setView === "function" && typeof finishSignupWithPlan === "function", null, { timeout: 30000 });
}

/** Signs up a fresh account and seeds any extra fields directly (avoids fragile
 * multi-step wizard UI navigation — matches the pattern already used by
 * scripts/test-login-logout-session-audit.js for real client-side signup). */
async function signUpAndSeed(page, email, password, accountOverrides = {}) {
  await page.evaluate(async ({ email, password, overrides }) => {
    const result = await signUpWithProvider(email, password, "", "Pricing", "Tester");
    loadAccountState(result.email);
    updateAccount(result.email, { signupAt: new Date().toISOString(), ...overrides });
  }, { email, password, overrides: accountOverrides });
}

async function clickChoicePlanButton(page, choice) {
  await page.evaluate((c) => {
    finishSignupWithPlan(c);
  }, choice);
}

/** Forces the signup wizard into its "plan" step with the modal open and renders the
 * plan chooser — explicit instead of relying on signUpWithProvider's own incidental
 * wizard-state side effects, which differ depending on founding availability. */
async function openSignupPlanStep(page) {
  await page.evaluate(() => {
    currentAuthMode = "signup";
    signupWizardStep = 3;
    document.querySelector("#authModal")?.classList.add("open");
    if (typeof renderSignupWizardStep === "function") renderSignupWizardStep();
    renderSignupPlanChooser();
  });
}

async function main() {
  // ============================================================
  // Scenario A: Founding closed for acquisition — Pro-only, no Founding-vs-Pro modal
  // ============================================================
  {
    const port = 20500 + Math.floor(Math.random() * 200);
    const storePath = path.join(os.tmpdir(), `llh-pricing-v2-${crypto.randomBytes(4).toString("hex")}.json`);
    const child = startServer(port, storePath, { FOUNDING_MEMBER_LIMIT: "50", PUBLIC_FOUNDING_CLAIMED_BASE: "0" });
    let browser;
    try {
      await waitForBoot(port, child);
      browser = await chromium.launch({ headless: true });

      await test("homepage sells Pro; Founding acquisition CTAs are gone even if inventory remains", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await page.waitForSelector("#homePricing .llh-founding-card, #homeFoundingMeter", { timeout: 10000 });
        await page.waitForFunction(() => typeof foundingOpenForAcquisition === "function" && foundingOpenForAcquisition() === false, null, { timeout: 15000 });
        const foundingVisible = await page.locator('[data-checkout-plan="founding"]:visible').count();
        const proVisible = await page.locator('[data-checkout-plan="monthly"]:visible').count();
        assert.equal(foundingVisible, 0);
        assert.ok(proVisible >= 1);
        const pricingText = await page.locator("#homePricing").innerText();
        assert.match(pricingText, /\$19\.99|Pro Monthly|closed for new signups/i);
        assert.doesNotMatch(pricingText, /no meaningful/i);
        await page.screenshot({ path: path.join(SHOT_DIR, "01-homepage-pro-acquisition-desktop.png"), fullPage: true });
        await page.close();
      });

      await test("signup plan chooser features Pro Monthly; no Founding card", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await signUpAndSeed(page, "eligible-signup@example.com", "TestPass123!");
        await openSignupPlanStep(page);
        const wrapper = page.locator("#signupPlanChooser");
        await wrapper.waitFor({ state: "attached", timeout: 10000 });
        const html = await wrapper.innerHTML();
        assert.doesNotMatch(html, /signup-plan-card--founding/);
        assert.match(html, /data-pricing-card="pro-monthly"/);
        assert.doesNotMatch(html, /no meaningful/i);
        await page.screenshot({ path: path.join(SHOT_DIR, "02-signup-plan-chooser-desktop.png"), fullPage: true });
        await page.close();
      });

      await test("choosing Pro does not show Founding-vs-Pro confirmation when acquisition is closed", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await signUpAndSeed(page, "eligible-confirm@example.com", "TestPass123!");
        await openSignupPlanStep(page);
        await clickChoicePlanButton(page, "monthly");
        await page.waitForSelector(".checkout-test-panel", { timeout: 10000 });
        const modalCount = await page.locator("#foundingVsProConfirmModal").count();
        assert.equal(modalCount, 0, "Founding-vs-Pro confirmation must not appear when Founding is closed for acquisition");
        const panelText = await page.locator(".checkout-test-panel").innerText();
        assert.match(panelText, /\$19\.99\/month checkout ready/i);
        await page.screenshot({ path: path.join(SHOT_DIR, "03-pro-checkout-no-confirm-desktop.png") });
        await page.close();
      });

      await test("pricing + upgrade pages feature Pro Monthly as primary", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await signUpAndSeed(page, "pricing-page-view@example.com", "TestPass123!");
        await page.evaluate(() => setView("plans"));
        await page.waitForSelector("#pricingApp .price-card", { timeout: 10000 });
        let html = await page.locator("#pricingApp").innerHTML();
        assert.match(html, /data-pricing-card="pro-monthly"/);
        assert.doesNotMatch(html, /data-pricing-card="founding"/);
        await page.evaluate(() => setView("upgrade"));
        await page.waitForSelector("#upgradeApp .price-card", { timeout: 10000 });
        html = await page.locator("#upgradeApp").innerHTML();
        assert.match(html, /data-pricing-card="pro-monthly"/);
        assert.doesNotMatch(html, /data-pricing-card="founding"/);
        await page.screenshot({ path: path.join(SHOT_DIR, "04-pricing-upgrade-pro-desktop.png"), fullPage: true });
        await page.close();
      });
    } finally {
      if (browser) await browser.close();
      await stopServer(child);
      try { fs.unlinkSync(storePath); } catch { /* ignore */ }
    }
  }

  // ============================================================
  // Scenario B: sold-out Founding — no confirmation should ever appear
  // ============================================================
  {
    const port = 20700 + Math.floor(Math.random() * 200);
    const storePath = path.join(os.tmpdir(), `llh-pricing-v2-soldout-${crypto.randomBytes(4).toString("hex")}.json`);
    const child = startServer(port, storePath, { FOUNDING_MEMBER_LIMIT: "1", PUBLIC_FOUNDING_CLAIMED_BASE: "1" });
    let browser;
    try {
      await waitForBoot(port, child);
      browser = await chromium.launch({ headless: true });

      await test("sold-out: homepage shows the sold-out state, no Founding card, no confirmation when choosing Pro", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await page.waitForFunction(() => {
          const meter = document.querySelector("#homeFoundingMeter");
          const card = document.querySelector("#homePricing .llh-founding-card");
          const meterSoldOut = meter && /filled|\$19\.99|regular Pro/i.test(meter.innerText || "");
          const cardSoldOut = card && (
            card.classList.contains("llh-founding-card--sold-out")
            || /Pro Monthly/i.test(card.innerText || "")
          );
          const foundingCtas = document.querySelectorAll('#homePricing [data-checkout-plan="founding"], #homeHero [data-checkout-plan="founding"], #homeFinalCta [data-checkout-plan="founding"]');
          return Boolean(meterSoldOut || cardSoldOut) && foundingCtas.length === 0;
        }, null, { timeout: 15000 });
        await page.screenshot({ path: path.join(SHOT_DIR, "07-homepage-sold-out-desktop.png"), fullPage: true });
        await signUpAndSeed(page, "soldout-signup@example.com", "TestPass123!");
        await openSignupPlanStep(page);
        await page.waitForSelector("#signupPlanChooser", { timeout: 10000 });
        const html = await page.locator("#signupPlanChooser").innerHTML();
        assert.doesNotMatch(html, /signup-plan-card--founding/, "Founding card must not render when sold out");
        await clickChoicePlanButton(page, "monthly");
        await page.waitForSelector(".checkout-test-panel", { timeout: 10000 });
        const modalCount = await page.locator("#foundingVsProConfirmModal").count();
        assert.equal(modalCount, 0, "no confirmation should ever appear when Founding is sold out");
        await page.screenshot({ path: path.join(SHOT_DIR, "08-signup-sold-out-desktop.png") });
        await page.close();
      });
    } finally {
      if (browser) await browser.close();
      await stopServer(child);
      try { fs.unlinkSync(storePath); } catch { /* ignore */ }
    }
  }

  // ============================================================
  // Scenario C: guard still re-syncs founding status before monthly checkout
  // ============================================================
  {
    await test("checkout guard still awaits syncFoundingStatus before monthly decisions", async () => {
      const serverJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
      assert.match(serverJs, /FOUNDING_CLOSED_FOR_ACQUISITION\s*=\s*true/);
      const guardSrc = serverJs.slice(serverJs.indexOf("async function startCheckoutWithFoundingGuard"), serverJs.indexOf("async function startCheckout(type, trackingContext = \"checkout\")"));
      assert.match(guardSrc, /await syncFoundingStatus\(\{ render: false \}\)/, "the guard must always re-sync from the server before deciding, never trust a cached count alone");
      assert.match(guardSrc, /foundingOpenForAcquisition|shouldConfirmBeforeRegularPro/);
    });
  }

  if (!process.exitCode) {
    console.log(`\nAll Founding-vs-Pro confirmation browser tests passed. Screenshots saved to ${SHOT_DIR}`);
  }
}

main().catch((error) => {
  console.error("FAIL (fatal)", error);
  process.exitCode = 1;
});
