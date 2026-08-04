#!/usr/bin/env node
/**
 * Phase 1 — Free Onboarding & First Impression.
 * Run: npm run test:free-onboarding-first-impression
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
const PORT = 19200 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-free-fi-${crypto.randomBytes(4).toString("hex")}.json`);

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
  const gfJs = fs.readFileSync(path.join(ROOT, "scripts/free-plan-grandfathering.js"), "utf8");

  assert.match(appJs, /Your Included Free Plans/);
  assert.match(appJs, /function applyDefaultFreeLibraryFilters/);
  assert.match(appJs, /function shouldDefaultFreeLibraryFilters/);
  assert.match(appJs, /authoritativeLessonPlanAccessLabel[\s\S]*return "Free"/);
  assert.doesNotMatch(appJs.slice(appJs.indexOf("function authoritativeLessonPlanAccessLabel"), appJs.indexOf("function authoritativeLessonPlanAccessLabel") + 800), /return "Free Sample"/);
  assert.match(nuoJs, /freeChosenAtSignup/);
  assert.match(nuoJs, /renderFreeReady|nuo-free-ready|free-ready/);
  assert.match(nuoJs, /Browse my Free plans/);
  assert.doesNotMatch(nuoJs, /Start your Pro Trial/);
  assert.doesNotMatch(nuoJs, /Most Popular/);
  assert.doesNotMatch(gfJs, /Founding or Pro access/);
  assert.match(gfJs, /require Pro access/);
  assert.match(indexHtml, /new-user-onboarding\.js\?v=20260804-free-ux-phase2-r1/);
  assert.match(indexHtml, /id="demoAccountButton"[^>]*hidden/);
  assert.match(indexHtml, /id="familyHubSettingsCard"[^>]*hidden/);
  // Curriculum Planner may show a Legacy tag in testing nav; Free onboarding itself must not.
  assert.doesNotMatch(indexHtml, /Firebase Auth is connected/);
  assert.doesNotMatch(nuoJs, /nav-legacy-tag">Legacy/);
  console.log("PASS static Phase 1 markers");

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
      const email = `free-fi-${Date.now()}@example.com`;
      localStorage.setItem("llhUser", email);
      localStorage.setItem("llhPlan", "Free");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      accounts[email] = {
        email,
        plan: "Free",
        subscriptionStatus: "Free Plan",
        freeLessonAccessMode: "curated",
        selectedPlanAtSignup: "Free",
        signupAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      if (typeof loadAccountState === "function") loadAccountState(email);
      beginNewUserOnboardingAfterFreeSignup();
    });

    await page.waitForSelector("#newUserOnboardingModal.open", { timeout: 10000 });
    const welcome = await page.locator("#newUserOnboardingBody").innerText();
    assert.match(welcome, /Welcome to Little Learner Hub/i);
    assert.match(welcome, /no pressure to upgrade/i);
    assert.doesNotMatch(welcome, /Founding Member/i);

    await page.click('[data-nuo-action="continue"]');
    await page.waitForSelector("[data-nuo-action='choose-free']");
    const freeReady = await page.locator("#newUserOnboardingBody").innerText();
    assert.match(freeReady, /Here's what's included with Free|Browse my Free plans/i);
    assert.doesNotMatch(freeReady, /Continue with Free[\s\S]*Continue with Free/i);
    assert.doesNotMatch(freeReady, /Most Popular|Founding Member/i);
    // One Free confirmation CTA — not a Free vs Trial dual chooser.
    const freeCtas = await page.locator("[data-nuo-action='choose-free']").count();
    assert.equal(freeCtas, 1);
    assert.equal(await page.locator(".nuo-card--free").count(), 0, "skip explore Free card after signup Free");

    await page.click('[data-nuo-action="choose-free"]');
    await page.waitForFunction(() => !document.querySelector("#newUserOnboardingModal.open"), null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector(".active-view")?.id === "view-lessons", null, { timeout: 8000 });
    await page.waitForTimeout(600);

    const lessons = await page.evaluate(() => {
      const root = document.querySelector("#view-lessons");
      const text = root?.innerText || "";
      const planFilter = typeof lessonLibraryPlanFilter !== "undefined" ? lessonLibraryPlanFilter : null;
      return {
        text,
        planFilter,
        hasIncludedHeading: /Your Included Free Plans/i.test(text),
        hasUnlockHeading: /Unlock the Complete Library/i.test(text),
        hasFounding: /Founding Member/i.test(text),
        starterExplore: Boolean(root?.querySelector("[data-free-starter-explore]")),
        gettingStarted: Boolean(root?.querySelector("[data-getting-started-checklist]")),
        gettingStartedText: root?.querySelector("[data-getting-started-checklist]")?.innerText || "",
        freeSampleLabel: /\bFree Sample\b/i.test(text),
        policyDupes: (text.match(/10 complete starter lesson plans across Infant/gi) || []).length,
      };
    });
    assert.equal(lessons.planFilter, "Free", "new Free user defaults Access filter to Free");
    assert.equal(lessons.hasIncludedHeading, true);
    assert.equal(lessons.hasUnlockHeading, false, "no stacked unlock heading on first impression");
    assert.equal(lessons.hasFounding, false);
    assert.equal(lessons.freeSampleLabel, false);
    assert.ok(lessons.starterExplore || lessons.gettingStarted, "helpful starter surface present");
    assert.doesNotMatch(lessons.gettingStartedText, /Start your Pro Trial/i);
    assert.ok(lessons.policyDupes <= 1, "Free policy copy not duplicated");
    console.log("PASS Free lessons first impression");

    await page.evaluate(() => {
      if (typeof setView === "function") setView("activities", { applyFreeLibraryDefaults: true });
    });
    await page.waitForFunction(() => document.querySelector(".active-view")?.id === "view-activities", null, { timeout: 8000 });
    await page.waitForTimeout(400);
    const activities = await page.evaluate(() => ({
      filter: typeof activityLibraryPlanFilter !== "undefined" ? activityLibraryPlanFilter : null,
      hasFreeHeading: /Your Included Free Activities|Free/i.test(document.querySelector("#view-activities")?.innerText || ""),
    }));
    assert.equal(activities.filter, "Free", "new Free user defaults activity Access filter to Free");
    console.log("PASS Free activities default filter");

    await page.evaluate(() => {
      if (typeof setView === "function") setView("settings");
      if (typeof renderSettingsHubPage === "function") renderSettingsHubPage();
    });
    await page.waitForSelector("#view-settings.active-view");
    await page.waitForTimeout(300);
    const settings = await page.evaluate(() => {
      const text = document.querySelector("#view-settings")?.innerText || "";
      return {
        text,
        foundingUpgrade: /Founding Member/i.test(text),
        comingSoon: /Coming Soon/i.test(text),
        duplicateSupport: (text.match(/Message Support|Help & Support/gi) || []).length,
        hasComparePlans: /Compare Plans/i.test(text),
        hasUpgradeFounding: /Upgrade from Free to Founding/i.test(text),
      };
    });
    assert.equal(settings.foundingUpgrade, false, "Settings Free chrome avoids Founding Member");
    assert.equal(settings.comingSoon, false, "Settings hides Coming Soon options for Free");
    assert.equal(settings.hasUpgradeFounding, false);
    assert.equal(settings.hasComparePlans, true);
    console.log("PASS Settings Free cleanup");

    await page.evaluate(() => {
      if (typeof setView === "function") setView("account");
      if (typeof renderAccountPage === "function") renderAccountPage();
    });
    await page.waitForSelector("#view-account.active-view");
    const account = await page.evaluate(() => {
      const text = document.querySelector("#view-account")?.innerText || "";
      const demo = document.querySelector("#demoAccountButton");
      return {
        text,
        demoHidden: !demo || demo.hidden || demo.style.display === "none",
        firebase: /Firebase/i.test(text),
        localDemo: /Local demo authentication/i.test(text),
      };
    });
    assert.equal(account.demoHidden, true);
    assert.equal(account.firebase, false);
    assert.equal(account.localDemo, false);
    console.log("PASS Account page scrubbed of internal wording");

    // Mobile free-ready
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => beginNewUserOnboardingAfterFreeSignup());
    await page.waitForSelector("#newUserOnboardingModal.open");
    await page.click('[data-nuo-action="continue"]');
    await page.waitForSelector(".nuo-free-ready, [data-nuo-action='choose-free']");
    const mobileReady = await page.locator("#newUserOnboardingBody").innerText();
    assert.match(mobileReady, /Browse my Free plans|included with Free/i);
    assert.doesNotMatch(mobileReady, /Founding Member|Most Popular/i);
    console.log("PASS mobile free-ready");

    console.log("\nAll Phase 1 Free onboarding first-impression tests passed.");
  } catch (error) {
    console.error(error);
    if (bootLog) console.error(bootLog.slice(-2000));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
  }
}

main();
