#!/usr/bin/env node
/**
 * Phase 1 new-user onboarding refinements.
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
  assert.match(indexHtml, /new-user-onboarding\.js\?v=20260804-free-onboarding-r1/);
  assert.match(appJs, /beginNewUserOnboardingAfterFreeSignup/);
  assert.match(appJs, /featured-this-week|resolveFeaturedThisWeekLessons/);
  assert.match(appJs, /onboardingRecommendations/);
  assert.match(appJs, /renderLessonLibraryOnboardingHtml/);
  assert.match(nuoJs, /We're glad you're here|We're excited you're here/);
  assert.match(nuoJs, /Continue to Secure Checkout/);
  assert.match(nuoJs, /You will not be charged today/);
  assert.match(nuoJs, /Card required to start/);
  assert.match(nuoJs, /trial_checkout_opened/);
  assert.match(nuoJs, /trial_checkout_cancelled/);
  assert.match(nuoJs, /getContentRecommendations/);
  assert.match(nuoJs, /goToLessonPlans|setView\("lessons"/);
  assert.match(nuoJs, /Browse Free Lesson Plans|Browse ready-to-use lesson plans|Browse my Free plans/);
  assert.match(nuoJs, /Getting Started|free-ready|freeChosenAtSignup/);
  assert.doesNotMatch(nuoJs, /Limited time|Act now|Last chance/i);
  assert.match(insights, /Biggest Opportunity/);
  assert.match(insights, /Conversion Opportunity|onboarding/);
  assert.doesNotMatch(insights, /Fix drop-off:/);
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
      if (typeof loadAccountState === "function") loadAccountState(email);
      beginNewUserOnboardingAfterFreeSignup();
    });

    await page.waitForSelector("#newUserOnboardingModal.open", { timeout: 10000 });
    const welcomeText = await page.locator("#newUserOnboardingBody").innerText();
    assert.match(welcomeText, /Welcome to Little Learner Hub!/i);
    assert.match(welcomeText, /We're glad you're here|We're excited you're here/i);
    assert.match(welcomeText, /spend less time planning and more time teaching/i);
    assert.match(welcomeText, /no pressure to upgrade/i);

    await page.click('[data-nuo-action="continue"]');
    // After Free signup, skip Free vs Trial dual chooser — show helpful Free overview once.
    await page.waitForSelector("[data-nuo-action='choose-free']");
    const freeReadyText = await page.locator("#newUserOnboardingBody").innerText();
    assert.match(freeReadyText, /included with Free|Browse my Free plans/i);
    assert.doesNotMatch(freeReadyText, /Most Popular/i);
    assert.equal(await page.locator(".nuo-card--free").count(), 0);

    // Free path lands on Lesson Plans with rich starter cards + getting started
    await page.click('[data-nuo-action="choose-free"]');
    await page.waitForFunction(() => !document.querySelector("#newUserOnboardingModal.open"), null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector(".active-view")?.id === "view-lessons", null, { timeout: 8000 });
    await page.waitForSelector("[data-free-starter-explore], [data-getting-started-checklist]", { timeout: 8000 });
    const lessonsText = await page.locator("#view-lessons").innerText();
    assert.match(lessonsText, /Browse Free Lesson Plans|Getting Started|Your Included Free Plans|Featured This Week/i);
    assert.doesNotMatch(await page.locator("[data-free-starter-explore]").innerText().catch(() => ""), /Upgrade to Pro/i);

    const events = await page.evaluate(() => JSON.parse(localStorage.getItem("llhAnalyticsEvents") || "[]"));
    const names = events.map((e) => e.name);
    assert.ok(names.includes("welcome_screen_viewed"), "welcome_screen_viewed tracked");
    assert.ok(names.includes("welcome_continue_pressed"), "welcome_continue_pressed tracked");
    assert.ok(names.includes("free_selected"), "free_selected tracked");

    // Optional Pro trial from free-ready (secondary CTA) — checkout path unchanged.
    await page.evaluate(() => {
      beginNewUserOnboardingAfterFreeSignup();
    });
    await page.waitForSelector("#newUserOnboardingModal.open");
    await page.click('[data-nuo-action="continue"]');
    const trialCardText = await page.locator("#newUserOnboardingBody").innerText();
    assert.match(trialCardText, /Start a 7-day Pro trial instead|Continue to Secure Checkout/i);

    await page.evaluate(() => {
      window.__llhStartProTrialCalls = 0;
      window.startProTrial = async function stubStartProTrial(options = {}) {
        window.__llhStartProTrialCalls += 1;
        window.__llhLastStartProTrialOptions = options;
        NewUserOnboarding.getState();
        // Mimic pending checkout without navigating to Stripe.
        localStorage.setItem("llhPendingCheckout", JSON.stringify({
          type: "monthly",
          amount: "$19.99",
          trialDays: 7,
          fromOnboarding: Boolean(options.fromOnboarding),
        }));
      };
    });
    await page.click('[data-nuo-action="choose-trial"]');
    await page.waitForFunction(() => window.__llhStartProTrialCalls >= 1, null, { timeout: 5000 });
    const opened = await page.evaluate(() => ({
      calls: window.__llhStartProTrialCalls,
      opts: window.__llhLastStartProTrialOptions,
      names: JSON.parse(localStorage.getItem("llhAnalyticsEvents") || "[]").map((e) => e.name),
    }));
    assert.equal(opened.opts.fromOnboarding, true);
    assert.ok(opened.names.includes("trial_selected"), "trial_selected tracked");
    assert.ok(opened.names.includes("trial_checkout_opened"), "trial_checkout_opened tracked");

    await page.evaluate(() => {
      NewUserOnboarding.handleTrialCheckoutCancel();
    });
    await page.waitForFunction(() => document.body.innerText.includes("No problem!"), null, { timeout: 5000 });
    const cancelEvents = await page.evaluate(() => JSON.parse(localStorage.getItem("llhAnalyticsEvents") || "[]").map((e) => e.name));
    assert.ok(cancelEvents.includes("trial_checkout_cancelled"), "trial_checkout_cancelled tracked");

    // Returning users: dismissed getting started stays dismissed
    await page.evaluate(() => {
      localStorage.setItem("llhGettingStartedDismissed", "1");
      localStorage.setItem("llhFreeStarterCardsDismissed", "1");
      localStorage.setItem("llhFreeLibraryFilterTouched", "1");
      NewUserOnboarding.closeModal();
      // Simulate a returning Free user who chose Browse All.
      if (typeof lessonLibraryPlanFilter !== "undefined") lessonLibraryPlanFilter = "All";
      if (typeof setView === "function") setView("lessons");
      if (typeof renderCategoryPage === "function") renderCategoryPage("lessons");
    });
    await page.waitForTimeout(300);
    const returning = await page.evaluate(() => ({
      gettingStarted: Boolean(document.querySelector("[data-getting-started-checklist]")),
      starter: Boolean(document.querySelector("[data-free-starter-explore]")),
      featured: Boolean(document.querySelector(".featured-this-week")),
      freePrimary: /Your Included Free Plans/i.test(document.querySelector("#view-lessons")?.innerText || ""),
    }));
    assert.equal(returning.gettingStarted, false, "returning/dismissed users do not see getting started");
    assert.equal(returning.starter, false, "dismissed starter does not return");
    assert.ok(returning.featured || returning.freePrimary, "library browse content still shows");

    // Mobile viewport
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
