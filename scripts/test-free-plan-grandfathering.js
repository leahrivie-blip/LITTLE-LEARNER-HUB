#!/usr/bin/env node
/**
 * Free-plan grandfathering: existing Free users keep legacy access; new Free get curated.
 * Run: node scripts/test-free-plan-grandfathering.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const grandfathering = require("./free-plan-grandfathering.js");
const freeSample = require("./free-curriculum-sample.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20010 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-free-gf-${crypto.randomBytes(4).toString("hex")}.json`);
const CUTOFF = "2026-07-18T00:00:00.000Z";

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
const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");

test("config helpers classify legacy vs curated by date and overrides", () => {
  assert.equal(grandfathering.hasLegacyFreeLessonAccess({
    plan: "Free",
    createdAt: "2026-01-01T00:00:00.000Z",
  }, { curatedCutoffAt: CUTOFF }), true);
  assert.equal(grandfathering.hasLegacyFreeLessonAccess({
    plan: "Free",
    createdAt: "2026-07-19T00:00:00.000Z",
  }, { curatedCutoffAt: CUTOFF }), false);
  assert.equal(grandfathering.hasLegacyFreeLessonAccess({
    plan: "Free",
  }, { curatedCutoffAt: CUTOFF, missingDateMeansLegacy: true }), true);
  assert.equal(grandfathering.resolveFreeLessonAccessMode({
    plan: "Free",
    freeLessonAccessMode: "legacy",
    createdAt: "2026-07-19T00:00:00.000Z",
  }, { curatedCutoffAt: CUTOFF }), "legacy");
  assert.equal(grandfathering.resolveFreeLessonAccessMode({
    plan: "Free",
    freeLessonAccessMode: "curated",
    createdAt: "2026-01-01T00:00:00.000Z",
  }, { curatedCutoffAt: CUTOFF }), "curated");
  assert.equal(grandfathering.modeForNewSignup({
    curatedCutoffAt: "2000-01-01T00:00:00.000Z",
  }), "curated");
});

test("client/server wire grandfathering helpers", () => {
  assert.match(appJs, /hasLegacyFreeLessonAccess/);
  assert.match(appJs, /isFreeAccessibleCurriculumPlan/);
  assert.match(appJs, /freeLessonAccessMode/);
  assert.match(appJs, /Early supporter Free access|earlySupporter/);
  assert.match(serverJs, /freePlanGrandfathering/);
  assert.match(serverJs, /userMayUnlockFreeCurriculumPlan/);
  assert.match(indexHtml, /free-plan-grandfathering\.js/);
  assert.match(appJs, /X-LLH-User-Email/);
});

function requestJson(method, urlPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
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

function startServer() {
  const store = {
    users: {
      "legacy-free@example.com": {
        email: "legacy-free@example.com",
        plan: "Free",
        subscriptionStatus: "Free Plan",
        createdAt: "2026-01-10T00:00:00.000Z",
        signupAt: "2026-01-10T00:00:00.000Z",
        freeLessonAccessMode: "legacy",
      },
      "new-free@example.com": {
        email: "new-free@example.com",
        plan: "Free",
        subscriptionStatus: "Free Plan",
        createdAt: "2026-07-19T12:00:00.000Z",
        signupAt: "2026-07-19T12:00:00.000Z",
        freeLessonAccessMode: "curated",
      },
      "pro-user@example.com": {
        email: "pro-user@example.com",
        plan: "Pro",
        subscriptionStatus: "Active",
        stripeSubscriptionStatus: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    },
    siteContent: {
      freePlanAccess: {
        enabled: true,
        curatedCutoffAt: CUTOFF,
        missingDateMeansLegacy: true,
      },
      curriculum: {
        lessonPlans: [
          {
            id: "cur-lp-preschool-community-helpers",
            title: "Community Helpers",
            age: "Preschool",
            theme: "Community Helpers",
            plan: "Free",
            status: "published",
            weeklyOverview: "Helpers week",
            learningDomains: ["Social Emotional"],
            dailyPlans: { monday: { items: [{ title: "Circle" }] } },
            updatedAt: new Date().toISOString(),
          },
          {
            id: "cur-lp-preschool-letters-and-sounds",
            title: "Letters & Sounds",
            age: "Preschool",
            theme: "Literacy",
            plan: "Free",
            status: "published",
            weeklyOverview: "Legacy free plan content",
            learningDomains: ["Language & Literacy"],
            dailyPlans: { monday: { items: [{ title: "ABC" }] } },
            updatedAt: new Date().toISOString(),
          },
          {
            id: "cur-lp-preschool-space-adventure",
            title: "Space Adventure",
            age: "Preschool",
            theme: "Space",
            plan: "Pro",
            status: "published",
            weeklyOverview: "Pro only",
            learningDomains: ["Science"],
            dailyPlans: { monday: { items: [{ title: "Rockets" }] } },
            updatedAt: new Date().toISOString(),
          },
        ],
        activities: [],
        resources: [],
        updatedAt: new Date().toISOString(),
      },
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
      FREE_PLAN_CURATED_CUTOFF_AT: CUTOFF,
      FREE_PLAN_GRANDFATHERING_ENABLED: "true",
      EMAIL_AUTOMATIONS_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("boot timeout");
}

function planById(library, id) {
  return (library?.lessonPlans || []).find((plan) => plan.id === id) || null;
}

async function browserMain() {
  if (process.exitCode) return;
  const child = startServer();
  let bootLog = "";
  child.stdout.on("data", (d) => { bootLog += d.toString(); });
  child.stderr.on("data", (d) => { bootLog += d.toString(); });
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForBoot(child);

    const guest = await requestJson("GET", "/api/site-content");
    assert.equal(guest.status, 200);
    const guestLetters = planById(guest.json.siteContent.curriculumLibrary, "cur-lp-preschool-letters-and-sounds");
    const guestHelpers = planById(guest.json.siteContent.curriculumLibrary, "cur-lp-preschool-community-helpers");
    assert.ok(guestHelpers);
    assert.equal(guestHelpers.locked, false);
    assert.ok(guestLetters);
    assert.equal(guestLetters.locked, true, "guests/new Free should see non-curated Free as locked preview");
    console.log("PASS  guest/public library is curated");

    const legacyLib = await requestJson("GET", "/api/site-content", {
      headers: { "X-LLH-User-Email": "legacy-free@example.com" },
    });
    const legacyLetters = planById(legacyLib.json.siteContent.curriculumLibrary, "cur-lp-preschool-letters-and-sounds");
    assert.ok(legacyLetters);
    assert.equal(legacyLetters.locked, false, "grandfathered Free keeps Letters & Sounds");
    assert.ok(legacyLetters.dailyPlans, "grandfathered Free gets full Free content");
    console.log("PASS  legacy Free library unlocks store Free plans");

    const newLib = await requestJson("GET", "/api/site-content", {
      headers: { "X-LLH-User-Email": "new-free@example.com" },
    });
    const newLetters = planById(newLib.json.siteContent.curriculumLibrary, "cur-lp-preschool-letters-and-sounds");
    assert.ok(newLetters);
    assert.equal(newLetters.locked, true, "new Free still curated-limited");
    console.log("PASS  new Free library stays curated");

    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });

    const clientModes = await page.evaluate((cutoff) => {
      const api = window.LLHFreePlanGrandfathering;
      return {
        legacy: api.hasLegacyFreeLessonAccess({ plan: "Free", createdAt: "2026-02-01T00:00:00.000Z" }, { curatedCutoffAt: cutoff }),
        curated: api.hasLegacyFreeLessonAccess({ plan: "Free", createdAt: "2026-07-19T00:00:00.000Z" }, { curatedCutoffAt: cutoff }),
        proUnaffected: api.resolveFreeLessonAccessMode({ plan: "Pro", createdAt: "2026-01-01T00:00:00.000Z" }, { curatedCutoffAt: cutoff }),
      };
    }, CUTOFF);
    assert.equal(clientModes.legacy, true);
    assert.equal(clientModes.curated, false);
    console.log("PASS  browser grandfathering helpers");

    // Customize remains available for legacy Free; locked for curated Free.
    await page.evaluate(() => {
      localStorage.setItem("llhUser", "legacy-free@example.com");
      localStorage.setItem("llhPlan", "Free");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "legacy-free@example.com": {
          email: "legacy-free@example.com",
          plan: "Free",
          createdAt: "2026-01-10T00:00:00.000Z",
          freeLessonAccessMode: "legacy",
        },
      }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    const legacyCustom = await page.evaluate(() => ({
      legacy: hasLegacyFreeLessonAccess(),
      canCustomize: canCustomizeLessonPlans(),
    }));
    assert.equal(legacyCustom.legacy, true);
    assert.equal(legacyCustom.canCustomize, true);
    console.log("PASS  legacy Free keeps customization");

    await page.evaluate(() => {
      localStorage.setItem("llhUser", "new-free@example.com");
      localStorage.setItem("llhPlan", "Free");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "new-free@example.com": {
          email: "new-free@example.com",
          plan: "Free",
          createdAt: "2026-07-19T12:00:00.000Z",
          freeLessonAccessMode: "curated",
        },
      }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    const newCustom = await page.evaluate(() => ({
      legacy: hasLegacyFreeLessonAccess(),
      canCustomize: canCustomizeLessonPlans(),
      lettersAccess: isFreeAccessibleCurriculumPlan({
        id: "cur-lp-preschool-letters-and-sounds",
        title: "Letters & Sounds",
        age: "Preschool",
        plan: "Free",
      }),
      helpersAccess: isFreeAccessibleCurriculumPlan({
        id: "cur-lp-preschool-community-helpers",
        title: "Community Helpers",
        age: "Preschool",
        plan: "Free",
      }),
    }));
    assert.equal(newCustom.legacy, false);
    assert.equal(newCustom.canCustomize, false);
    assert.equal(newCustom.lettersAccess, false);
    assert.equal(newCustom.helpersAccess, true);
    console.log("PASS  new Free uses curated access + customization lock");

    // Pro unaffected
    await page.evaluate(() => {
      localStorage.setItem("llhUser", "pro-user@example.com");
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "pro-user@example.com": {
          email: "pro-user@example.com",
          plan: "Pro",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    const proState = await page.evaluate(() => ({
      isPro: isProUser(),
      legacy: hasLegacyFreeLessonAccess(),
      canCustomize: canCustomizeLessonPlans(),
    }));
    assert.equal(proState.isPro, true);
    assert.equal(proState.legacy, false);
    assert.equal(proState.canCustomize, true);
    console.log("PASS  Pro users unaffected");

    assert.ok(freeSample.isCuratedFreeLessonPlan({
      id: "cur-lp-preschool-community-helpers",
      title: "Community Helpers",
      age: "Preschool",
    }));
    console.log("\nAll free-plan grandfathering tests passed.");
  } catch (error) {
    console.error(error);
    if (bootLog) console.error(bootLog.slice(-2500));
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
