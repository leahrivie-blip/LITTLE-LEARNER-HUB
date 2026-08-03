#!/usr/bin/env node
/**
 * Phase 1 new-user onboarding: welcome → explore → Free starter / Trial explain.
 * Run: npm run test:new-user-onboarding
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
const PORT = 19100 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-nuo-${crypto.randomBytes(4).toString("hex")}.json`);

function startServer() {
  return spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_PROVIDER: "local-json",
      LOCAL_JSON_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
          res.resume();
          res.statusCode === 200 ? resolve() : reject(new Error(`status ${res.statusCode}`));
        });
        req.on("error", reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error("Server boot timeout");
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const nuoJs = fs.readFileSync(path.join(ROOT, "scripts/new-user-onboarding.js"), "utf8");
  const insights = fs.readFileSync(path.join(ROOT, "server/admin-insights.js"), "utf8");

  assert.match(indexHtml, /id="newUserOnboardingModal"/);
  assert.match(indexHtml, /new-user-onboarding\.js\?v=20260803-nuo-onboarding/);
  assert.match(appJs, /beginNewUserOnboardingAfterFreeSignup/);
  assert.match(appJs, /startProTrial\(options = \{\}\)/);
  assert.match(appJs, /fromOnboarding/);
  assert.match(appJs, /handleTrialCheckoutCancel/);
  assert.doesNotMatch(nuoJs, /Limited time|Act now|Last chance/i);
  assert.match(nuoJs, /Continue to Secure Checkout/);
  assert.match(nuoJs, /No charge today/);
  assert.match(nuoJs, /Most Popular/);
  assert.match(nuoJs, /welcome_screen_viewed/);
  assert.match(nuoJs, /free_selected/);
  assert.match(nuoJs, /trial_selected/);
  assert.match(insights, /Biggest Opportunity/);
  assert.match(insights, /onboarding/);
  assert.match(insights, /Conversion Opportunity/);
  assert.doesNotMatch(insights, /Fix drop-off:/);
  // No Stripe/auth/pricing changes in onboarding module
  assert.doesNotMatch(nuoJs, /stripe\.checkout|STRIPE_SECRET|price_/);
  console.log("PASS static onboarding markers");

  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForBoot(child);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof beginNewUserOnboardingAfterFreeSignup === "function", null, { timeout: 30000 });

    await page.evaluate(() => {
      const email = `nuo-${Date.now()}@example.com`;
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Free");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      accounts[email] = {
        email,
        plan: "Free",
        subscriptionStatus: "Free Plan",
        freeLessonAccessMode: "curated",
        signupAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      if (typeof currentUser !== "undefined") window.currentUser = email;
      if (typeof loadAccountState === "function") loadAccountState(email);
      beginNewUserOnboardingAfterFreeSignup();
    });

    await page.waitForSelector("#newUserOnboardingModal.open", { timeout: 10000 });
    const welcomeText = await page.locator("#newUserOnboardingBody").innerText();
    assert.match(welcomeText, /Welcome to Little Learner Hub/i);
    assert.match(welcomeText, /free account is ready/i);

    await page.click('[data-nuo-action="continue"]');
    await page.waitForFunction(() => document.querySelector("[data-nuo-action='choose-free']"), null, { timeout: 5000 });
    const exploreText = await page.locator("#newUserOnboardingBody").innerText();
    assert.match(exploreText, /Continue with Free/i);
    assert.match(exploreText, /Start My Free Trial/i);
    assert.match(exploreText, /Most Popular/i);
    assert.doesNotMatch(exploreText, /Limited time|Act now|Last chance/i);

    // Free path → starter cards, no upgrade push
    await page.click('[data-nuo-action="choose-free"]');
    await page.waitForFunction(() => !document.querySelector("#newUserOnboardingModal.open"), null, { timeout: 5000 });
    await page.waitForSelector("[data-free-starter-explore]", { timeout: 8000 });
    const starter = await page.locator("[data-free-starter-explore]").innerText();
    assert.match(starter, /Let's get you started/i);
    assert.match(starter, /Browse Lesson Plans/i);
    assert.doesNotMatch(starter, /Upgrade to Pro/i);

    const events = await page.evaluate(() => JSON.parse(localStorage.getItem("llhAnalyticsEvents") || "[]"));
    const names = events.map((e) => e.name);
    assert.ok(names.includes("welcome_screen_viewed"), "welcome_screen_viewed tracked");
    assert.ok(names.includes("welcome_continue_pressed"), "welcome_continue_pressed tracked");
    assert.ok(names.includes("free_selected"), "free_selected tracked");

    // Trial explain copy (no Stripe call — stop before checkout)
    await page.evaluate(() => {
      beginNewUserOnboardingAfterFreeSignup();
    });
    await page.waitForSelector("#newUserOnboardingModal.open");
    await page.click('[data-nuo-action="continue"]');
    await page.click('[data-nuo-action="choose-trial"]');
    const trialText = await page.locator("#newUserOnboardingBody").innerText();
    assert.match(trialText, /Continue to Secure Checkout/i);
    assert.match(trialText, /You will not be charged today/i);
    assert.match(trialText, /Secure checkout powered by Stripe/i);

    // Checkout cancel returns to friendly Free message
    await page.evaluate(() => {
      localStorage.setItem("llhPendingCheckout", JSON.stringify({
        type: "monthly",
        amount: "$19.99",
        trialDays: 7,
        fromOnboarding: true,
      }));
      NewUserOnboarding.handleTrialCheckoutCancel();
    });
    await page.waitForFunction(() => document.body.innerText.includes("No problem!"), null, { timeout: 5000 });
    const cancelText = await page.locator("#newUserOnboardingBody").innerText();
    assert.match(cancelText, /Continue Exploring for Free/i);
    const suppressed = await page.evaluate(() => sessionStorage.getItem("llhSuppressTrialPromptSession"));
    assert.equal(suppressed, "1");

    // Mobile viewport smoke
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => beginNewUserOnboardingAfterFreeSignup());
    await page.waitForSelector("#newUserOnboardingModal.open");
    const mobileBox = await page.locator(".nuo-modal-card").boundingBox();
    assert.ok(mobileBox && mobileBox.width > 280, "mobile modal sized");

    console.log("PASS browser onboarding flow");
  } catch (error) {
    console.error(error);
    if (bootLog) console.error(bootLog.slice(-2500));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main();
