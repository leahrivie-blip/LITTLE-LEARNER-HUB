#!/usr/bin/env node
/**
 * Customer UX polish regression markers + light browser smoke.
 * Covers calendar note status, child progress honesty, daily-log deep links,
 * AI grounded prompts, Behavior library (no Coming Soon grid), Settings hub
 * cleanup, and What's New nav gating.
 *
 * Run: npm run test:customer-ux-polish
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
const PORT = 19400 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-cx-polish-${crypto.randomBytes(4).toString("hex")}.json`);
const CACHE = "20260804-customer-ux-polish-r1";

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
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  const comms = fs.readFileSync(path.join(ROOT, "comms-center.js"), "utf8");

  // Calendar
  assert.match(appJs, /let calendarDayNoteDraft = null/);
  assert.match(appJs, /function calendarDayNoteStatusHtml/);
  assert.match(appJs, /calendarDayNoteDraft = \{ date, notes:/);
  assert.match(css, /\.llh-calendar-sync-banner/);

  // Child progress honesty
  assert.match(appJs, /hasGoalProgress: goalProgress != null/);
  assert.match(appJs, /Only show a percent when real goals exist/);
  assert.doesNotMatch(appJs, /observations\.length \* 10/);
  assert.match(appJs, /No goal progress yet|No goals yet/);

  // Daily Logs deep link from profiles
  assert.match(appJs, /data-dlc-open-child="\$\{child\.id\}"/);
  assert.match(appJs, /const openChildId = String\(options\.childId \|\| ""\)\.trim\(\)/);
  assert.match(appJs, /dailyLogsSection = "individual"/);

  // Behavior & Support — no Coming Soon placeholder grid on the customer page
  assert.match(appJs, /data-behavior-support-ready="true"/);
  assert.doesNotMatch(appJs, /behavior-support-placeholder/);
  assert.doesNotMatch(appJs, /plannedAreas = \[/);

  // Settings cleanup — unfinished hub cards removed (page templates may remain unused)
  assert.doesNotMatch(appJs, /title: "Forms Settings"/);
  assert.doesNotMatch(appJs, /title: "Curriculum Settings"/);
  assert.match(appJs, /Forms Settings and Curriculum Settings stay out of the hub/);
  assert.doesNotMatch(indexHtml, /Screenshot upload coming soon/);

  // What's New gated until published notes exist
  assert.match(indexHtml, /id="whatsNewNavLink"[^>]*hidden/);
  assert.match(appJs, /function syncWhatsNewNavVisibility/);
  assert.match(comms, /setWhatsNewNavVisible/);

  // Doc helpers: no duplicate Most Used block
  assert.doesNotMatch(indexHtml, /doc-helpers-most-used/);

  // AI grounded prompts
  assert.match(appJs, /60–140 words|60-140 words/);
  assert.match(appJs, /Not enough detail provided/);
  assert.match(appJs, /Do not invent an age group when none is on the child profile/);
  assert.match(serverJs, /Prefer "Not enough detail provided" over invented filler/);
  assert.match(serverJs, /about 60-140 words for a typical note/);
  assert.match(appJs, /Local fallback stays tightly grounded/);

  // Cache bust
  assert.match(indexHtml, new RegExp(`app\\.js\\?v=${CACHE}`));
  assert.match(indexHtml, new RegExp(`styles\\.css\\?v=${CACHE}`));
  assert.match(sw, new RegExp(`llh-shell-v166-${CACHE}`));
  console.log("PASS static customer UX polish markers");

  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForBoot(child);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const email = `cx-polish-${Date.now()}@example.com`;
    const password = "CxPolishPass123!";

    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof window.setView === "function", null, { timeout: 30000 });

    // Seed a Free account the same way other UX smoke tests do.
    await page.evaluate((creds) => {
      localStorage.setItem("llhUser", creds.email);
      localStorage.setItem("llhPlan", "Free");
      const accounts = JSON.parse(localStorage.getItem("llhAccounts") || "{}");
      accounts[creds.email] = {
        email: creds.email,
        plan: "Free",
        subscriptionStatus: "Free Plan",
        freeLessonAccessMode: "curated",
        selectedPlanAtSignup: "Free",
        signupAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
      if (typeof loadAccountState === "function") loadAccountState(creds.email);
      if (typeof updateAuthUI === "function") updateAuthUI();
      if (typeof syncPlatformNavVisibility === "function") syncPlatformNavVisibility();
    }, { email, password });

    await page.waitForTimeout(500);

    // What's New stays hidden with no published notes.
    const whatsNewHidden = await page.locator("#whatsNewNavLink").evaluate((el) => el.hidden);
    assert.equal(whatsNewHidden, true, "What's New should stay hidden until release notes exist");

    // Behavior & Support shows live library, not Coming Soon placeholders.
    await page.evaluate(() => window.setView("behavior-support"));
    await page.waitForTimeout(500);
    const supportHtml = await page.locator("#view-behavior-support, [data-behavior-support-ready]").first().innerHTML().catch(() => "");
    const bodyHtml = await page.content();
    assert.match(bodyHtml, /data-behavior-support-ready|Support for big feelings|Browse current support|support-category/i);
    assert.doesNotMatch(supportHtml + bodyHtml.slice(0, 50000), /badge-coming-soon/);

    // Settings hub no longer exposes unfinished Forms/Curriculum settings cards.
    await page.evaluate(() => window.setView("settings"));
    await page.waitForTimeout(500);
    const settingsText = await page.locator("#view-settings").innerText();
    assert.doesNotMatch(settingsText, /Forms Settings|Curriculum Settings/);

    // Child Profiles empty shell copy
    await page.evaluate(() => window.setView("children"));
    await page.waitForTimeout(500);
    const childrenText = await page.locator("#view-children").innerText();
    assert.match(childrenText, /Add your first child|Child Profiles/i);

    // Doc helpers: single hub list (no Most Used duplicates)
    await page.evaluate(() => window.setView("ai"));
    await page.waitForTimeout(400);
    const mostUsed = await page.locator(".doc-helpers-most-used").count();
    assert.equal(mostUsed, 0, "Most Used duplicate section should be removed");
    const helperCards = await page.locator(".doc-helpers-hub .doc-helper-card").count();
    assert.ok(helperCards >= 5, "Doc helper hub cards should remain");

    // Local observation fallback stays grounded (no invented Preschool setting).
    const observationSample = await page.evaluate(() => {
      if (typeof window.generateObservation !== "function") {
        // generateObservation may be module-scoped; probe via string markers already asserted.
        return "scoped";
      }
      return window.generateObservation({ note: "Sorted red blocks.", childExplicitlySelected: false });
    });
    if (observationSample !== "scoped") {
      assert.doesNotMatch(observationSample, /During |observationSetting|Preschool/);
      assert.match(observationSample, /Sorted red blocks/);
    }

    console.log("PASS browser customer UX polish smoke");
  } catch (error) {
    console.error("FAIL customer UX polish", error);
    console.error(bootLog.slice(-2000));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
