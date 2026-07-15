#!/usr/bin/env node
/**
 * Pro lesson preview + membership access audit.
 * Run: node scripts/test-pro-lesson-preview-audit.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
const { lockedCurriculumLessonPreviewHtml } = require("./curriculum-lesson-viewer-render.js");

const ROOT = path.join(__dirname, "..");
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-garden-scientists-v3.txt");
const PORT = 4590 + Math.floor(Math.random() * 180);
const STORE_PATH = path.join(os.tmpdir(), `llh-pro-preview-audit-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "pro-preview-admin@test.local",
  password: "pro-preview-pass",
  code: "pro-preview-code",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { ...(options.headers || {}) };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers },
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

function authHeader(email) {
  return { Authorization: `Bearer test:${email}` };
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {} }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
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
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("Server failed to boot");
}

function writeStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function seedMembershipUsers() {
  const store = readStore();
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  store.users = store.users || {};
  store.users["free@preview.test"] = {
    email: "free@preview.test", plan: "Free", subscriptionStatus: "Free Plan", updatedAt: now,
  };
  store.users["promo-only@preview.test"] = {
    email: "promo-only@preview.test", plan: "Free", subscriptionStatus: "Free Plan",
    promoRedemptions: [{ code: "WELCOME", redeemedAt: now }], updatedAt: now,
  };
  store.users["trial@preview.test"] = {
    email: "trial@preview.test", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Trialing",
    trialStatus: "In Trial", stripeSubscriptionStatus: "trialing", trialEnd: future,
    currentPeriodEnd: future, accessEndsAt: future, monthlyPrice: "$19.99/month", updatedAt: now,
  };
  store.users["founding@preview.test"] = {
    email: "founding@preview.test", plan: "Founding", subscriptionStatus: "Founding Member Subscription Active",
    foundingMemberActive: true, foundingMemberHistorical: true, foundingMember: true,
    stripeSubscriptionStatus: "active", currentPeriodEnd: future, accessEndsAt: future,
    monthlyPrice: "$9.99/month", priceLock: "Lifetime", updatedAt: now,
  };
  store.users["pro-monthly@preview.test"] = {
    email: "pro-monthly@preview.test", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active", currentPeriodEnd: future, accessEndsAt: future,
    monthlyPrice: "$19.99/month", subscriptionCadence: "monthly", updatedAt: now,
  };
  store.users["pro-annual@preview.test"] = {
    email: "pro-annual@preview.test", plan: "Pro", subscriptionStatus: "Pro Annual Subscription Active",
    stripeSubscriptionStatus: "active", currentPeriodEnd: future, accessEndsAt: future,
    monthlyPrice: "$199/year", subscriptionCadence: "annual", updatedAt: now,
  };
  writeStore(store);
}

async function publishProLesson(token) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  assert(parsed.ok, parsed.errors.join(" "));
  const planId = `cur-lp-preview-${crypto.randomBytes(3).toString("hex")}`;
  const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: planId,
      title: "Preview Audit Garden Scientists",
      plan: "Pro",
      status: "published",
      age: "Preschool",
      theme: "Garden Scientists",
    },
  });
  assert(save.status === 200, `pro save failed: ${save.status} ${save.text}`);
  return planId;
}

async function main() {
  console.log("0) Locked preview HTML shows overview only (no premium content)");
  const previewHtml = lockedCurriculumLessonPreviewHtml(
    {
      title: "Farm Week",
      age: "Preschool",
      theme: "Farm",
      _curriculumLessonPlan: {
        age: "Preschool",
        theme: "Farm",
        weeklyOverview: "Children explore farm animals and barn life through play.",
        objectives: "Count animals and practice vocabulary.",
        weeklyMaterials: "Bins, animals, hay",
        vocabularyWords: "barn, hay, animal",
        books: [{ title: "Big Red Barn", author: "Brown" }],
        songs: [{ title: "Old MacDonald" }],
        dailyActivityPreview: {
          monday: [{ title: "Farm Animal Sensory Bin", locked: true }],
          tuesday: [{ title: "Barn Building Challenge", locked: true }],
        },
        activityCount: 2,
        learningDomains: ["Science", "Language"],
      },
    },
    {
      activities: [],
      upgradeCtaHtml: '<button type="button" data-checkout-plan="founding">Upgrade to Pro</button>',
      showFoundingOffer: true,
    },
  );
  assert(/Weekly Overview/.test(previewHtml.html), "preview missing weekly overview");
  assert(/Learning Domains/.test(previewHtml.html), "preview missing learning domains");
  assert(/Pro Lesson Plan/.test(previewHtml.html), "preview missing upgrade card");
  assert(/Founding Member Pricing Still Available/.test(previewHtml.html), "preview missing founding offer");
  assert(/Upgrade to Pro/.test(previewHtml.html), "preview missing upgrade CTA");
  assert(!/Farm Animal Sensory Bin/.test(previewHtml.html), "preview leaked Monday activity name");
  assert(!/Barn Building Challenge/.test(previewHtml.html), "preview leaked Tuesday activity name");
  assert(!/Materials List/.test(previewHtml.html) || /Complete Materials List/.test(previewHtml.html), "preview should not show materials content");
  assert(!/Bins, animals, hay/.test(previewHtml.html), "preview leaked materials content");
  assert(!/Big Red Barn/.test(previewHtml.html), "preview leaked book titles");
  assert(!/Old MacDonald/.test(previewHtml.html), "preview leaked song titles");
  assert(!/Count animals and practice vocabulary/.test(previewHtml.html), "preview leaked objectives");

  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200 && login.json?.token, "admin login failed");
    const planId = await publishProLesson(login.json.token);
    // Re-seed after admin writes so membership users are not wiped by storeCache bootstrap.
    seedMembershipUsers();

    console.log("1) Public Pro DTO exposes overview teaser only (no premium content)");
    const publicContent = await requestJson("GET", "/api/site-content");
    const proPublic = (publicContent.json.siteContent?.curriculumLibrary?.lessonPlans || []).find((item) => item.id === planId);
    assert(proPublic?.locked === true, "pro plan should be locked publicly");
    assert(!proPublic.dailyPlans, "public pro plan must not include full dailyPlans");
    assert(proPublic.weeklyOverview, "public pro plan should expose weeklyOverview");
    assert(proPublic.theme, "public pro plan should expose theme");
    assert(!proPublic.objectives, "public pro plan must not expose objectives");
    assert(!proPublic.weeklyMaterials, "public pro plan must not expose materials");
    assert(!proPublic.vocabularyWords, "public pro plan must not expose vocabulary");
    assert(!(proPublic.books || []).length, "public pro plan must not expose books");
    assert(!(proPublic.songs || []).length, "public pro plan must not expose songs");
    assert(!proPublic.dailyActivityPreview, "public pro plan must not expose dailyActivityPreview");
    assert(!JSON.stringify(proPublic).includes("Invite children to scoop"), "public preview leaked directions");

    console.log("2) Membership detail access matrix");
    const denied = ["free@preview.test", "promo-only@preview.test"];
    for (const email of denied) {
      const detail = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(planId)}`, null, {
        headers: authHeader(email),
      });
      assert(detail.status === 403, `${email} should be denied full Pro detail (got ${detail.status})`);
    }
    const allowed = [
      "trial@preview.test",
      "founding@preview.test",
      "pro-monthly@preview.test",
      "pro-annual@preview.test",
    ];
    for (const email of allowed) {
      const detail = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(planId)}`, null, {
        headers: authHeader(email),
      });
      assert(detail.status === 200, `${email} should receive full Pro detail (got ${detail.status})`);
      assert(detail.json.lessonPlan?.dailyPlans, `${email} missing dailyPlans`);
    }

    let playwright;
    try { playwright = require("playwright"); } catch { playwright = null; }
    if (!playwright) {
      console.log("3) Browser checks skipped (playwright not installed)");
      console.log("\nPro lesson preview audit checks passed.");
      return;
    }

    console.log("3) Free user sees overview-only Pro preview with upgrade card + sticky CTA");
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem("llhUser", "free@preview.test");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "free@preview.test": { email: "free@preview.test", plan: "Free", subscriptionStatus: "Free Plan" },
      }));
      localStorage.setItem("llhPlan", "Free");
    });
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/site-content") && r.status() === 200, { timeout: 30000 }),
      page.reload({ waitUntil: "domcontentloaded" }),
    ]);
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
    await page.fill("#lessonPlanSearch", "Preview Audit Garden Scientists");
    await page.waitForTimeout(400);
    await page.locator("#view-lessons .lesson-plan-card, #view-lessons .resource-card").filter({ hasText: "Preview Audit Garden Scientists" }).first().click({ force: true });
    await page.waitForSelector("#featurePreviewModal.open", { timeout: 10000 });
    const locked = await page.evaluate(() => ({
      workspace: Boolean(document.querySelector("#resourceViewerModal.lesson-workspace-mode.open")),
      body: document.querySelector("#featurePreviewBody")?.innerText || "",
      html: document.querySelector("#featurePreviewBody")?.innerHTML || "",
      stickyVisible: Boolean(document.querySelector("#featurePreviewModal.fp-has-sticky-upgrade [data-fp-sticky-upgrade]:not([hidden])")),
      stickyText: document.querySelector("[data-fp-sticky-upgrade]")?.innerText || "",
    }));
    assert(!locked.workspace, "free user must not open full lesson workspace for Pro plan");
    assert(/Weekly Overview/i.test(locked.body), `locked preview missing weekly overview: ${locked.body.slice(0, 200)}`);
    assert(/Learning Domains|Garden Scientists/i.test(locked.body), `locked preview missing overview metadata: ${locked.body.slice(0, 200)}`);
    assert(/Pro Lesson Plan|Unlock this premium lesson plan/i.test(locked.body), "locked preview missing upgrade card");
    assert(/Upgrade to Pro/i.test(locked.body + locked.stickyText), "locked preview missing Upgrade to Pro CTA");
    assert(locked.stickyVisible, "mobile sticky upgrade bar should be visible");
    assert(!/fp-locked-activity-list/.test(locked.html), "locked preview must not list activity names");
    assert(!/<label>Weekly Objectives|<label>Materials List|<label>Vocabulary|<label>Books|<label>Songs|<label>Daily Activities/i.test(locked.html), "locked preview leaked premium section fields");
    assert(!/Farm Animal|Sensory Bin|Invite children|Planting a Rainbow/i.test(locked.body), "locked preview leaked premium content strings");

    console.log("4) Promo-only account remains Free for Pro content");
    await page.evaluate(() => {
      localStorage.setItem("llhUser", "promo-only@preview.test");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "promo-only@preview.test": {
          email: "promo-only@preview.test",
          plan: "Free",
          subscriptionStatus: "Free Plan",
          promoRedemptions: [{ code: "WELCOME" }],
        },
      }));
      localStorage.setItem("llhPlan", "Free");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    const access = await page.evaluate(() => ({
      plan: typeof effectiveAccessPlan === "function" ? effectiveAccessPlan() : null,
      pro: typeof isProUser === "function" ? isProUser() : null,
    }));
    assert(access.plan === "Free" && access.pro === false, `promo-only should stay Free, got ${JSON.stringify(access)}`);

    console.log("\nPro lesson preview audit checks passed.");
  } finally {
    if (browser) await browser.close();
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
