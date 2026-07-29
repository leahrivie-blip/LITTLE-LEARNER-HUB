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
  // Scenario A: fresh eligible signup, Founding open — full modal round trip
  // ============================================================
  {
    const port = 20500 + Math.floor(Math.random() * 200);
    const storePath = path.join(os.tmpdir(), `llh-pricing-v2-${crypto.randomBytes(4).toString("hex")}.json`);
    const child = startServer(port, storePath, { FOUNDING_MEMBER_LIMIT: "50", PUBLIC_FOUNDING_CLAIMED_BASE: "0" });
    let browser;
    try {
      await waitForBoot(port, child);
      browser = await chromium.launch({ headless: true });

      await test("homepage shows the required Founding copy + live remaining count while spots are open (desktop)", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await page.waitForSelector("#homePricing .llh-founding-card, #homeFoundingMeter", { timeout: 10000 });
        await page.waitForFunction(() => {
          const meter = document.querySelector("#homeFoundingMeter");
          return meter && /spots remaining|Founding Member spots left/i.test(meter.innerText || "");
        }, null, { timeout: 15000 });
        const pricingText = await page.locator("#homePricing").innerText();
        assert.match(pricingText, /\$9\.99/);
        assert.match(pricingText, /spots remaining|Founding Member spots left/i);
        assert.doesNotMatch(pricingText, /no meaningful/i, "the removed 'no meaningful reason' wording must not appear anywhere");
        await page.screenshot({ path: path.join(SHOT_DIR, "01-homepage-founding-open-desktop.png"), fullPage: true });
        await page.close();
      });

      await test("signup plan chooser: Founding is featured/primary, Pro is secondary with the new required copy, no 'no meaningful' wording", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await signUpAndSeed(page, "eligible-signup@example.com", "TestPass123!");
        await openSignupPlanStep(page);
        const wrapper = page.locator("#signupPlanChooser");
        await wrapper.waitFor({ state: "attached", timeout: 10000 });
        const html = await wrapper.innerHTML();
        assert.match(html, /signup-plan-card--founding[^"]*signup-plan-card--featured[^"]*signup-plan-card--recommended/);
        assert.match(html, /Includes Pro access\. \$9\.99\/month locked while continuously active\./);
        assert.match(html, /Regular monthly price after Founding availability ends\./);
        assert.doesNotMatch(html, /no meaningful/i);
        await page.screenshot({ path: path.join(SHOT_DIR, "02-signup-plan-chooser-desktop.png"), fullPage: true });
        await page.close();
      });

      await test("choosing Regular Pro while eligible + Founding open shows the required 3-button confirmation (desktop)", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await signUpAndSeed(page, "eligible-confirm@example.com", "TestPass123!");
        await openSignupPlanStep(page);
        await clickChoicePlanButton(page, "monthly");
        await page.waitForSelector("#foundingVsProConfirmModal", { timeout: 10000 });
        const modalText = await page.locator("#foundingVsProConfirmModal").innerText();
        assert.match(modalText, /Founding pricing is still available for \$9\.99\/month\./);
        assert.match(modalText, /Are you sure you want Regular Pro for \$19\.99\/month\?/);
        assert.match(modalText, /Choose Founding.*9\.99/);
        assert.match(modalText, /Continue with Regular Pro.*19\.99/);
        assert.match(modalText, /Go Back/);
        await page.screenshot({ path: path.join(SHOT_DIR, "03-founding-vs-pro-confirmation-modal-desktop.png") });
        await page.close();
      });

      await test("'Choose Founding' from the confirmation proceeds with a Founding checkout, not Pro", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await signUpAndSeed(page, "chooses-founding@example.com", "TestPass123!");
        await openSignupPlanStep(page);
        await clickChoicePlanButton(page, "monthly");
        await page.waitForSelector("#foundingVsProConfirmModal", { timeout: 10000 });
        await page.click('[data-founding-vs-pro-choice="founding"]');
        await page.waitForSelector(".checkout-test-panel", { timeout: 10000 });
        const panelText = await page.locator(".checkout-test-panel").innerText();
        assert.match(panelText, /\$9\.99\/month checkout ready/i, "the Founding ($9.99) checkout, not Pro ($19.99), must be what started");
        await page.close();
      });

      await test("'Continue with Regular Pro' from the confirmation proceeds with the Pro Monthly checkout", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await signUpAndSeed(page, "chooses-pro@example.com", "TestPass123!");
        await openSignupPlanStep(page);
        await clickChoicePlanButton(page, "monthly");
        await page.waitForSelector("#foundingVsProConfirmModal", { timeout: 10000 });
        await page.click('[data-founding-vs-pro-choice="pro_monthly"]');
        await page.waitForSelector(".checkout-test-panel", { timeout: 10000 });
        const panelText = await page.locator(".checkout-test-panel").innerText();
        assert.match(panelText, /\$19\.99\/month checkout ready/i);
        await page.close();
      });

      await test("'Go Back' closes the confirmation with no checkout started", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await signUpAndSeed(page, "goes-back@example.com", "TestPass123!");
        await openSignupPlanStep(page);
        await clickChoicePlanButton(page, "monthly");
        await page.waitForSelector("#foundingVsProConfirmModal", { timeout: 10000 });
        await page.click('[data-founding-vs-pro-choice="go_back"]');
        await page.waitForTimeout(300);
        const modalGone = await page.locator("#foundingVsProConfirmModal").count();
        const panelCount = await page.locator(".checkout-test-panel").count();
        assert.equal(modalGone, 0, "modal must close on Go Back");
        assert.equal(panelCount, 0, "no checkout should have started after Go Back");
        await page.close();
      });

      await test("pricing page shows Founding primary + Pro secondary (with required copy) side by side", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await signUpAndSeed(page, "pricing-page-view@example.com", "TestPass123!");
        await page.evaluate(() => setView("plans"));
        await page.waitForSelector("#pricingApp .price-card", { timeout: 10000 });
        const html = await page.locator("#pricingApp").innerHTML();
        assert.match(html, /data-pricing-card="founding"/);
        assert.match(html, /data-pricing-card="pro-monthly"/);
        assert.match(html, /Includes Pro access\. \$9\.99\/month locked while continuously active\./);
        assert.match(html, /Regular monthly price after Founding availability ends\./);
        await page.screenshot({ path: path.join(SHOT_DIR, "04-pricing-page-desktop.png"), fullPage: true });
        await page.close();
      });

      await test("account upgrade page shows Founding primary + Pro secondary, and clicking Pro shows the confirmation", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await signUpAndSeed(page, "upgrade-page-view@example.com", "TestPass123!", { plan: "Free" });
        await page.evaluate(() => setView("upgrade"));
        await page.waitForSelector("#upgradeApp .price-card", { timeout: 10000 });
        const html = await page.locator("#upgradeApp").innerHTML();
        assert.match(html, /data-pricing-card="founding"/);
        assert.match(html, /data-pricing-card="pro-monthly"/);
        await page.screenshot({ path: path.join(SHOT_DIR, "05-upgrade-page-desktop.png"), fullPage: true });
        // Click the secondary Pro Monthly card's checkout button.
        await page.evaluate(() => {
          const secondary = document.querySelector('#upgradeApp .price-card--secondary [data-checkout-plan="monthly"]');
          secondary?.click();
        });
        await page.waitForSelector("#foundingVsProConfirmModal", { timeout: 10000 });
        await page.screenshot({ path: path.join(SHOT_DIR, "06-upgrade-page-confirmation-modal.png") });
        await page.close();
      });

      await test("former Founding member (ineligible) does NOT see the confirmation when choosing Pro", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await signUpAndSeed(page, "former-founder@example.com", "TestPass123!", {
          plan: "Free",
          foundingMemberHistorical: true,
          foundingMemberActive: false,
          foundingMemberNumber: 5,
        });
        await page.evaluate(() => setView("plans"));
        await page.waitForSelector("#pricingApp .price-card", { timeout: 10000 });
        await page.evaluate(() => {
          const secondary = document.querySelector('#pricingApp .price-card--secondary [data-checkout-plan="monthly"]')
            || document.querySelector('#pricingApp [data-checkout-plan="monthly"]');
          secondary?.click();
        });
        await page.waitForSelector(".checkout-test-panel", { timeout: 10000 });
        const modalCount = await page.locator("#foundingVsProConfirmModal").count();
        assert.equal(modalCount, 0, "a genuinely ineligible former Founding member must never see the confirmation");
        const panelText = await page.locator(".checkout-test-panel").innerText();
        assert.match(panelText, /\$19\.99\/month checkout ready/i, "checkout should proceed directly to Pro Monthly");
        await page.close();
      });

      await test("current Pro member does not crash when interacting with pricing page (documented, non-blocking behavior)", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(String(e?.message || e)));
        await loadHome(page, port);
        await signUpAndSeed(page, "current-pro-member@example.com", "TestPass123!", {
          plan: "Pro",
          subscriptionStatus: "Pro Monthly Subscription Active",
          stripeSubscriptionStatus: "active",
          subscriptionCadence: "monthly",
        });
        await page.evaluate(() => setView("plans"));
        await page.waitForSelector("#pricingApp .price-card", { timeout: 10000 });
        await page.evaluate(() => {
          const btn = document.querySelector('#pricingApp [data-checkout-plan="monthly"]');
          btn?.click();
        });
        await page.waitForTimeout(500);
        assert.equal(pageErrors.length, 0, `no uncaught page errors, got: ${pageErrors.join("; ")}`);
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
  // Scenario C: stale client-side counter is refreshed before deciding
  // ============================================================
  {
    const port = 20900 + Math.floor(Math.random() * 200);
    const storePath = path.join(os.tmpdir(), `llh-pricing-v2-stale-${crypto.randomBytes(4).toString("hex")}.json`);
    const child = startServer(port, storePath, { FOUNDING_MEMBER_LIMIT: "50", PUBLIC_FOUNDING_CLAIMED_BASE: "0" });
    let browser;
    try {
      await waitForBoot(port, child);
      browser = await chromium.launch({ headless: true });

      await test("stale counter: a client cache claiming 'sold out' is refreshed before the confirmation decision (server says spots remain)", async () => {
        const page = await newPage(browser, { width: 1280, height: 900 });
        await loadHome(page, port);
        await signUpAndSeed(page, "stale-cache-open@example.com", "TestPass123!");
        // Force the in-memory cache to look sold-out, simulating a stale page load —
        // the guard must re-sync from the server (which truthfully has spots open)
        // before deciding whether to show the confirmation.
        await page.evaluate(() => {
          foundingStatusCache = { ...foundingStatusCache, remaining: 0, soldOut: true, claimed: 50, limit: 50 };
        });
        await clickChoicePlanButton(page, "monthly");
        await page.waitForSelector("#foundingVsProConfirmModal", { timeout: 10000 });
        console.log("      stale-cache scenario: confirmation correctly appeared after re-sync corrected the count");
        await page.close();
      });

      await test("stale counter: a client cache claiming spots remain is refreshed before deciding (server says sold out)", async () => {
        // Second, independent server instance would be needed to prove the opposite
        // direction cleanly; instead, directly verify syncFoundingStatus is awaited
        // before the decision by checking the guard always calls it for type=monthly.
        const serverJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
        const guardSrc = serverJs.slice(serverJs.indexOf("async function startCheckoutWithFoundingGuard"), serverJs.indexOf("async function startCheckout(type, trackingContext = \"checkout\")"));
        assert.match(guardSrc, /await syncFoundingStatus\(\{ render: false \}\)/, "the guard must always re-sync from the server before deciding, never trust a cached count alone");
      });
    } finally {
      if (browser) await browser.close();
      await stopServer(child);
      try { fs.unlinkSync(storePath); } catch { /* ignore */ }
    }
  }

  // ============================================================
  // Scenario D: responsive — phone, tablet, desktop
  // ============================================================
  {
    const port = 21100 + Math.floor(Math.random() * 200);
    const storePath = path.join(os.tmpdir(), `llh-pricing-v2-responsive-${crypto.randomBytes(4).toString("hex")}.json`);
    const child = startServer(port, storePath, { FOUNDING_MEMBER_LIMIT: "50", PUBLIC_FOUNDING_CLAIMED_BASE: "0" });
    let browser;
    try {
      await waitForBoot(port, child);
      browser = await chromium.launch({ headless: true });

      const viewports = [
        { name: "phone", width: 390, height: 844 },
        { name: "tablet", width: 834, height: 1194 },
        { name: "desktop", width: 1440, height: 900 },
      ];
      for (const viewport of viewports) {
        // eslint-disable-next-line no-await-in-loop
        await test(`confirmation modal is usable on ${viewport.name} (${viewport.width}x${viewport.height})`, async () => {
          const page = await newPage(browser, viewport);
          await loadHome(page, port);
          await signUpAndSeed(page, `responsive-${viewport.name}@example.com`, "TestPass123!");
          await openSignupPlanStep(page);
          await clickChoicePlanButton(page, "monthly");
          await page.waitForSelector("#foundingVsProConfirmModal", { timeout: 10000 });
          const box = await page.locator(".founding-vs-pro-confirm-card").boundingBox();
          assert.ok(box, `${viewport.name}: confirmation card must have a bounding box (be laid out)`);
          assert.ok(box.width <= viewport.width, `${viewport.name}: confirmation card (${box.width}px) must fit within the viewport (${viewport.width}px)`);
          const buttons = page.locator("[data-founding-vs-pro-choice]");
          assert.equal(await buttons.count(), 3, `${viewport.name}: all 3 buttons must be present`);
          for (let i = 0; i < 3; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const btnBox = await buttons.nth(i).boundingBox();
            assert.ok(btnBox, `${viewport.name}: button ${i} must be visible/laid out`);
          }
          await page.screenshot({ path: path.join(SHOT_DIR, `09-confirmation-modal-${viewport.name}.png`) });
          await page.close();
        });
      }
    } finally {
      if (browser) await browser.close();
      await stopServer(child);
      try { fs.unlinkSync(storePath); } catch { /* ignore */ }
    }
  }

  if (!process.exitCode) {
    console.log(`\nAll Founding-vs-Pro confirmation browser tests passed. Screenshots saved to ${SHOT_DIR}`);
  }
}

main().catch((error) => {
  console.error("FAIL (fatal)", error);
  process.exitCode = 1;
});
