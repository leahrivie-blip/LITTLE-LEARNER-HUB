#!/usr/bin/env node
/**
 * Free vs Pro conversion: curated Free sample, customization lock, printing free,
 * upgrade prompts, and marketing consistency.
 * Run: node scripts/test-free-pro-conversion.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const freeSample = require("./free-curriculum-sample.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19980 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-free-pro-${crypto.randomBytes(4).toString("hex")}.json`);

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");

test("free starter library is exactly 10 plans (3/3/4)", () => {
  assert.equal(freeSample.DEFAULT_FREE_STARTER_LESSON_IDS.length, 10);
  assert.equal(freeSample.PERMANENT_FREE_LESSON_IDS.length, 10);
  assert.deepEqual(freeSample.REQUIRED_DISTRIBUTION, { Infant: 3, Toddler: 3, Preschool: 4 });
  assert.equal(freeSample.activeSeasonalIds().length, 0);
  assert.ok(freeSample.isCuratedFreeLessonPlan({
    id: "cur-lp-preschool-community-helpers",
    title: "Community Helpers",
    age: "Preschool",
  }));
  assert.ok(freeSample.isCuratedFreeLessonPlan({
    id: "cur-lp-toddler-construction-crew",
    title: "Construction Crew",
    age: "Toddler",
  }));
  assert.equal(freeSample.isCuratedFreeLessonPlan({
    id: "cur-lp-preschool-letters-and-sounds",
    title: "Letters & Sounds",
    age: "Preschool",
  }), false);
  assert.match(freeSample.MARKETING.freeCore, /10 complete starter lesson plans/);
  assert.match(freeSample.MARKETING.recommendationSummary, /exactly 10 complete starter/i);
});

test("client and server gate on curated free sample", () => {
  assert.match(appJs, /isCuratedFreeCurriculumPlan/);
  assert.match(appJs, /canCustomizeLessonPlans/);
  assert.match(appJs, /showLessonCustomizationUpgrade/);
  assert.match(appJs, /freeCalendarPlanningDays\s*=\s*30/);
  assert.match(appJs, /freeFavoriteLimit\s*=\s*20/);
  assert.match(appJs, /freeChildProfileLimit\s*=\s*5/);
  assert.match(appJs, /isWeekWithinFreeCalendarPlanningWindow/);
  assert.match(appJs, /freeWelcomeCardHtml/);
  assert.match(appJs, /freeUpgradeBenefitLines/);
  assert.match(appJs, /upgrade_prompt_shown/);
  assert.match(appJs, /upgrade_prompt_click/);
  assert.match(serverJs, /freeCurriculumSample\.isCuratedFreeLessonPlan/);
  assert.match(indexHtml, /free-curriculum-sample\.js/);
  assert.doesNotMatch(indexHtml, /30 Total Free Lesson Plans/);
  assert.doesNotMatch(appJs, /30 Total Free Lesson Plans/);
});

test("printing stays available; customization is locked for Free", () => {
  assert.match(appJs, /Make This Lesson Plan Your Own/);
  assert.match(appJs, /Customize any lesson plan to fit your classroom/);
  assert.match(appJs, /if \(!canCustomizeLessonPlans\(\)\) \{\s*showLessonCustomizationUpgrade/);
  // Print paths should not call showLessonCustomizationUpgrade
  const printIdx = appJs.indexOf("function printActiveResource");
  if (printIdx > -1) {
    const slice = appJs.slice(printIdx, printIdx + 800);
    assert.doesNotMatch(slice, /showLessonCustomizationUpgrade/);
  }
});

test("homepage and FAQ marketing match Free starter library", () => {
  assert.match(indexHtml, /10 complete starter lesson plans across Infant, Toddler and Preschool/i);
  assert.match(indexHtml, /Print and download your 10 Free starter plans/i);
  assert.match(indexHtml, /Customize, save, and reuse your own lesson plans/i);
  assert.match(indexHtml, /About 30 days of calendar planning/);
  assert.match(indexHtml, /Up to 20 favorites/);
  assert.match(indexHtml, /5 Child Profiles/);
  assert.match(indexHtml, /up to 3 premium curriculum prints or downloads/i);
  assert.match(appJs, /Welcome to Little Learner Hub/);
  assert.match(appJs, /Ready to save hours every week\?/);
  assert.match(appJs, /MEMBERSHIP_COPY/);
  assert.match(appJs, /confirmTrialCurriculumExport/);
});

test("cache bust versions aligned", () => {
  assert.equal(indexHtml.match(/styles\.css\?v=([^"]+)/)?.[1], "20260730-signup-verify");
  assert.equal(indexHtml.match(/app\.js\?v=([^"]+)/)?.[1], "20260730-signup-verify");
  assert.match(sw, /llh-shell-v126-signup-verify/);
  assert.match(sw, /free-curriculum-sample\.js\?v=20260730-cover-refresh/);
  assert.match(sw, /trial-curriculum-exports\.js\?v=20260730-cover-refresh/);
  assert.match(sw, /free-plan-grandfathering\.js\?v=20260730-cover-refresh/);
});

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
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

function startServer(seedPlans) {
  const store = {
    users: {},
    siteContent: {},
    adminSessions: {},
    curriculumLibrary: {
      lessonPlans: seedPlans,
      activities: [],
    },
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      EMAIL_AUTOMATIONS_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 160; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      const site = await requestJson("GET", "/api/site-content");
      if (res.status === 200 && res.json?.ok && site.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("boot timeout");
}

async function browserMain() {
  if (process.exitCode) return;
  const seedPlans = [
    {
      id: "cur-lp-preschool-community-helpers",
      title: "Community Helpers",
      age: "Preschool",
      theme: "Community Helpers",
      plan: "Free",
      status: "published",
      weeklyOverview: "A week of helpers.",
      learningDomains: ["Social Emotional"],
      dailyPlans: {},
      updatedAt: new Date().toISOString(),
    },
    {
      id: "cur-lp-preschool-letters-and-sounds",
      title: "Letters & Sounds",
      age: "Preschool",
      theme: "Literacy",
      plan: "Free",
      status: "published",
      weeklyOverview: "Should be locked for Free users even if tagged Free.",
      learningDomains: ["Language & Literacy"],
      dailyPlans: {},
      updatedAt: new Date().toISOString(),
    },
    {
      id: "cur-lp-toddler-construction-crew",
      title: "Construction Crew",
      age: "Toddler",
      theme: "Construction",
      plan: "Pro",
      status: "published",
      weeklyOverview: "Curated free showcase despite Pro tag.",
      learningDomains: ["Physical Development"],
      dailyPlans: {},
      updatedAt: new Date().toISOString(),
    },
  ];

  const child = startServer(seedPlans);
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForBoot(child);

    // Unit-level DTO helpers are covered by free-curriculum-sample + server require above.
    assert.equal(freeSample.effectivePlanTier({
      id: "cur-lp-preschool-letters-and-sounds",
      title: "Letters & Sounds",
      age: "Preschool",
      plan: "Free",
    }), "Pro");
    assert.equal(freeSample.effectivePlanTier({
      id: "cur-lp-toddler-construction-crew",
      title: "Construction Crew",
      age: "Toddler",
      plan: "Pro",
    }), "Free");
    console.log("PASS  effectivePlanTier curated override");

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });

    // Seed curriculum into client local store shape via evaluate after login path.
    await page.evaluate(() => {
      localStorage.setItem("llhUser", "free-convert@example.com");
      localStorage.setItem("llhPlan", "Free");
      const accounts = {
        "free-convert@example.com": {
          email: "free-convert@example.com",
          fullName: "Free Converter",
          plan: "Free",
          password: "TestPass123!",
          // Explicit curated mode — new Free users after grandfathering cutoff.
          freeLessonAccessMode: "curated",
          createdAt: "2026-07-19T12:00:00.000Z",
          signupAt: "2026-07-19T12:00:00.000Z",
        },
      };
      localStorage.setItem("llhAccounts", JSON.stringify(accounts));
    });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1200);

    const access = await page.evaluate(() => {
      const api = window.LLHFreeCurriculumSample;
      const curated = api.isCuratedFreeLessonPlan({
        id: "cur-lp-preschool-community-helpers",
        title: "Community Helpers",
        age: "Preschool",
      });
      const notCurated = api.isCuratedFreeLessonPlan({
        id: "cur-lp-preschool-letters-and-sounds",
        title: "Letters & Sounds",
        age: "Preschool",
      });
      const canCustomize = typeof canCustomizeLessonPlans === "function" ? canCustomizeLessonPlans() : null;
      return { curated, notCurated, canCustomize, hasApi: Boolean(api) };
    });
    assert.equal(access.hasApi, true);
    assert.equal(access.curated, true);
    assert.equal(access.notCurated, false);
    assert.equal(access.canCustomize, false);
    console.log("PASS  browser curated free + customization lock helpers");

    // Homepage messaging visible
    const homeCopy = await page.evaluate(() => document.body.innerText);
    assert.match(homeCopy, /10 complete starter lesson plans|Free Plan/i);
    assert.doesNotMatch(homeCopy, /30 Total Free Lesson Plans/);
    console.log("PASS  homepage Free messaging");

    // Customization upgrade modal
    await page.evaluate(() => {
      if (typeof showLessonCustomizationUpgrade === "function") showLessonCustomizationUpgrade("demo");
    });
    await page.waitForSelector("#proModal.open", { timeout: 5000 });
    const modalText = await page.evaluate(() => document.querySelector("#proModal")?.innerText || "");
    assert.match(modalText, /Make This Lesson Plan Your Own/i);
    assert.match(modalText, /Upgrade to Pro/i);
    assert.match(modalText, /Maybe Later/i);
    console.log("PASS  customization upgrade modal");

    await page.close();
    console.log("\nAll free-pro conversion tests passed.");
  } catch (error) {
    console.error(error);
    if (bootLog) console.error(bootLog.slice(-2000));
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    child.kill("SIGTERM");
  }
}

async function main() {
  if (!process.exitCode) await browserMain();
}

main();
