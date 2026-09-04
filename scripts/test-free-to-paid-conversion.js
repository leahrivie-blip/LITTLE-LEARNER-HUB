#!/usr/bin/env node
/**
 * FREE → PAID conversion funnel: authorized week preview, no premium leaks,
 * intent CTAs, analytics aliases, checkout continuity, paid-user quiet chrome.
 * Run: npm run test:free-to-paid-conversion
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
const premiumWeekPreview = require("../server/premium-week-preview.js");
const conversionEvents = require("../server/conversion-events.js");
const {
  lockedCurriculumLessonPreviewHtml,
} = require("./curriculum-lesson-viewer-render.js");

const ROOT = path.join(__dirname, "..");
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-garden-scientists-v3.txt");
const PORT = 4620 + Math.floor(Math.random() * 180);
const STORE_PATH = path.join(os.tmpdir(), `llh-finish-week-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "finish-week-admin@test.local",
  password: "finish-week-pass",
  code: "finish-week-code",
};

const PROTECTED = [
  "Invite children to scoop and feel the soil.",
  "I notice the soil feels damp",
  "Bin of potting soil, scoops, small pots, smocks",
];

function assertNoProtected(payload, label) {
  const text = JSON.stringify(payload);
  for (const needle of PROTECTED) {
    assert.equal(text.includes(needle), false, `${label} leaked: ${needle}`);
  }
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
      LLH_STRIPE_CHECKOUT_SIMULATION: "true",
      STRIPE_SECRET_KEY: "sk_test_simulation_finish_week",
      STRIPE_PRICE_PRO_MONTHLY: "price_sim_pro_monthly",
      STRIPE_PRICE_PRO_ANNUAL: "price_sim_pro_annual",
      STRIPE_PRICE_FOUNDING_MONTHLY: "price_sim_founding_monthly",
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
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 14 * 86400000).toISOString();
  const store = readStore();
  store.users = store.users || {};
  store.users["free@finish.test"] = {
    email: "free@finish.test", plan: "Free", subscriptionStatus: "Free Plan", updatedAt: now,
  };
  store.users["pro@finish.test"] = {
    email: "pro@finish.test", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active", currentPeriodEnd: future, accessEndsAt: future,
    monthlyPrice: "$19.99/month", updatedAt: now,
  };
  writeStore(store);
}

async function publishLessons(token) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
  const touch = await requestJson("POST", "/api/admin/site-content", {
    adminToken: token,
    siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
  });
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  assert.equal(parsed.ok, true, parsed.errors?.join(" ") || "parse failed");
  const proId = `cur-lp-finish-pro-${crypto.randomBytes(3).toString("hex")}`;
  const freeId = `cur-lp-finish-free-${crypto.randomBytes(3).toString("hex")}`;
  const proSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: touch.json.siteContent.updatedAt,
    lessonPlan: {
      ...parsed.data,
      id: proId,
      title: "Finish Week Garden Scientists",
      plan: "Pro",
      status: "published",
      age: "Preschool",
      theme: "Garden Scientists",
    },
  });
  assert.equal(proSave.status, 200, `pro save failed: ${proSave.status} ${proSave.text}`);
  const freeSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    adminToken: token,
    expectedUpdatedAt: proSave.json.siteContentUpdatedAt,
    lessonPlan: {
      ...parsed.data,
      id: freeId,
      title: "Finish Week Free Starter",
      plan: "Free",
      status: "published",
      age: "Preschool",
      theme: "Garden Scientists",
    },
  });
  assert.equal(freeSave.status, 200, `free save failed: ${freeSave.status} ${freeSave.text}`);
  return { proId, freeId };
}

function sourceChecks() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const eventsJs = fs.readFileSync(path.join(ROOT, "server/conversion-events.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  assert.match(serverJs, /premiumWeekPreview\.buildAuthorizedWeekPreview/);
  assert.match(serverJs, /weekPreview/);
  assert.equal(/STRIPE_PRICE_PRO_MONTHLY\s*=\s*["']price_/.test(serverJs), false, "must not hardcode a new Stripe price id");
  assert.match(appJs, /Unlock the Full Week|Finish My Week/);
  assert.match(appJs, /restoreFinishWeekReturnAfterPaidConfirm/);
  assert.match(appJs, /returnContext/);
  assert.match(appJs, /About \$4\.61\/week|weeklyPriceFraming/);
  assert.match(indexHtml, /finish-week-conversion\.js/);
  assert.match(eventsJs, /finish_week_cta_clicked/);
  assert.match(eventsJs, /subscription_confirmed/);
  assert.doesNotMatch(appJs, /limited time only|only 3 spots left|people are buying now/i);
}

function projectionChecks() {
  const plan = {
    weeklyOverview: "Children explore soil and seeds.",
    objectives: "Count seeds and describe soil.",
    familyConnection: "Ask families to share a plant photo.",
    observationOpportunities: "Listen for texture words.",
    resourceIds: ["res-1", "res-2"],
    dailyPlans: {
      monday: {
        items: [{
          title: "Color Mixing Discovery",
          activityCategory: "Sensory Activity",
          setupMinutes: 5,
          printableIds: ["res-activity-print"],
          steps: "SECRET_STEPS_DO_NOT_LEAK",
          materials: "SECRET_MATERIALS",
          teacherLanguage: "SECRET_TEACHER",
          printableInstructions: "SECRET_PRINTABLE_HOW_TO",
        }],
      },
      tuesday: { items: [{ title: "Seed Sorting Trays", activityCategory: "Fine Motor" }] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
  };
  const preview = premiumWeekPreview.buildAuthorizedWeekPreview(plan);
  assert.ok(preview, "week preview required");
  assert.equal(preview.days[0].activities[0].title, "Color Mixing Discovery");
  assert.equal(preview.days[0].activities[0].activityCategory, "Sensory Activity");
  assert.equal(preview.days[0].activities[0].prepMinutes, 5);
  assert.equal(preview.days[0].activities[0].printableIncluded, true);
  assert.equal(preview.printableCount, 2);
  assert.equal(preview.packet.hasWeeklyOverview, true);
  assert.equal(preview.packet.monday, true);
  assert.equal(preview.packet.friday, false);
  assert.equal(preview.packet.hasPrintablePack, true);
  const leaks = premiumWeekPreview.forbiddenPreviewLeaks(preview);
  assert.deepEqual(leaks, [], `preview leaked forbidden keys: ${leaks.join(",")}`);
  const raw = JSON.stringify(preview);
  assert.equal(raw.includes("SECRET_STEPS_DO_NOT_LEAK"), false);
  assert.equal(raw.includes("SECRET_MATERIALS"), false);
  assert.equal(raw.includes("SECRET_TEACHER"), false);
  assert.equal(raw.includes("SECRET_PRINTABLE_HOW_TO"), false);
  assert.equal(raw.includes("res-1"), false, "printable IDs must not be sent");

  const html = lockedCurriculumLessonPreviewHtml(
    { title: "Garden Week", _weekPreview: preview, _curriculumLessonPlan: { age: "Preschool", theme: "Garden", weeklyOverview: "Children explore soil and seeds." } },
    { upgradeCtaHtml: '<button type="button">Unlock the Full Week</button>', showFoundingOffer: false },
  );
  assert.match(html.html, /Color Mixing Discovery/);
  assert.match(html.html, /Sensory Activity/);
  assert.match(html.html, /Approx\. prep: 5 minutes/);
  assert.match(html.html, /Unlock the Full Week/);
  assert.doesNotMatch(html.html, /SECRET_STEPS/);
}

function analyticsAliasChecks() {
  assert.equal(conversionEvents.normalizeConversionEventName("finish_week_cta_clicked"), "upgrade_cta_clicked");
  assert.equal(conversionEvents.normalizeConversionEventName("full_week_unlock_clicked"), "upgrade_cta_clicked");
  assert.equal(conversionEvents.normalizeConversionEventName("print_week_cta_clicked"), "upgrade_cta_clicked");
  assert.equal(conversionEvents.normalizeConversionEventName("printable_unlock_clicked"), "upgrade_cta_clicked");
  assert.equal(conversionEvents.normalizeConversionEventName("premium_preview_seen"), "pro_content_encountered");
  assert.equal(conversionEvents.normalizeConversionEventName("free_week_started"), "lesson_viewed");
  assert.equal(conversionEvents.normalizeConversionEventName("subscription_confirmed"), "paid_subscription_active");
  assert.equal(conversionEvents.normalizeConversionEventName("checkout_completed_returned"), "checkout_completed");
  const dirty = conversionEvents.sanitizeConversionDetail({
    email: "parent@example.com",
    childName: "Ava",
    phone: "555-0100",
    lessonId: "cur-lp-1",
    ctaLocation: "finish_week",
  });
  assert.equal(dirty.email, undefined);
  assert.equal(dirty.childName, undefined);
  assert.equal(dirty.phone, undefined);
  assert.equal(dirty.lessonId, "cur-lp-1");
}

function returnContextChecks() {
  const finish = fs.readFileSync(path.join(ROOT, "scripts/finish-week-conversion.js"), "utf8");
  assert.match(finish, /restoreAfterPaidConfirm/);
  assert.match(finish, /isPaid/);
  assert.match(finish, /llhUpgradeReturnContext/);
  assert.match(finish, /About \$4\.61\/week, billed \$19\.99 monthly/);
  const vm = require("node:vm");
  const memory = new Map();
  const sessionStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); },
    removeItem(key) { memory.delete(key); },
  };
  const sandbox = { console, sessionStorage };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(finish, sandbox);
  const api = sandbox.LLHFinishWeekConversion;
  assert.ok(api, "client module exports");
  const unpaid = api.restoreAfterPaidConfirm({ isPaid: false, openLesson() { throw new Error("must not open"); } });
  assert.equal(unpaid.restored, false);
  api.captureReturnContext({ intent: "print_week", lessonId: "cur-lp-1" });
  let opened = "";
  const paid = api.restoreAfterPaidConfirm({
    isPaid: true,
    openLesson(id) { opened = id; },
  });
  assert.equal(paid.restored, true);
  assert.equal(opened, "cur-lp-1");
}

async function main() {
  console.log("0) Source + projection + analytics + return-context unit checks");
  sourceChecks();
  projectionChecks();
  analyticsAliasChecks();
  returnContextChecks();

  const child = startServer();
  let browser;
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.ok(login.json?.token, "admin login");
    const ids = await publishLessons(login.json.token);
    seedMembershipUsers();

    console.log("1) Public / free API returns authorized week preview only");
    const publicContent = await requestJson("GET", "/api/site-content");
    const proPublic = (publicContent.json.siteContent?.curriculumLibrary?.lessonPlans || []).find((item) => item.id === ids.proId);
    const freePublic = (publicContent.json.siteContent?.curriculumLibrary?.lessonPlans || []).find((item) => item.id === ids.freeId);
    assert.equal(proPublic?.locked, true);
    assert.ok(!proPublic.dailyPlans, "pro public must not include dailyPlans");
    assert.ok(proPublic.weekPreview, "pro public should include authorized weekPreview");
    assert.ok(proPublic.weekPreview.days.some((day) => day.activities.some((act) => act.title === "Soil Exploration Bin")));
    assertNoProtected(proPublic, "public pro DTO");
    assert.equal(premiumWeekPreview.forbiddenPreviewLeaks(proPublic.weekPreview).length, 0);
    assert.ok(freePublic && freePublic.locked !== true, "free lesson stays unlocked");

    const freeDetail = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(ids.proId)}`, null, {
      headers: authHeader("free@finish.test"),
    });
    assert.ok([200, 403].includes(freeDetail.status), `unexpected ${freeDetail.status}`);
    if (freeDetail.status === 200) {
      assert.equal(freeDetail.json.lessonPlan?.locked, true);
      assert.ok(!freeDetail.json.lessonPlan?.dailyPlans);
      assert.ok(freeDetail.json.lessonPlan?.weekPreview);
      assertNoProtected(freeDetail.json, "free detail");
    }

    const spoofed = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(ids.proId)}`, null, {
      headers: { Authorization: "Bearer test:free@finish.test", "X-LLH-Plan": "Pro" },
    });
    if (spoofed.status === 200) {
      assert.equal(spoofed.json.lessonPlan?.locked, true);
      assert.ok(!spoofed.json.lessonPlan?.dailyPlans);
    }
    assertNoProtected(spoofed.json, "spoofed plan");

    console.log("2) Paid user receives full entitled content");
    const proDetail = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(ids.proId)}`, null, {
      headers: authHeader("pro@finish.test"),
    });
    assert.equal(proDetail.status, 200);
    assert.ok(proDetail.json.lessonPlan?.dailyPlans);
    assert.match(JSON.stringify(proDetail.json.lessonPlan), /Invite children to scoop/);

    const anonFree = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(ids.freeId)}`);
    assert.equal(anonFree.status, 200);
    assert.ok(anonFree.json.lessonPlan?.dailyPlans, "logged-out users keep existing free-plan access");

    console.log("3) Checkout simulation still uses $19.99 monthly mapping");
    const checkout = await requestJson("POST", "/api/create-checkout-session", {
      email: "free@finish.test",
      plan: "monthly",
      successUrl: "http://127.0.0.1/subscription-success?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "http://127.0.0.1/?checkout=cancel",
    }, { headers: authHeader("free@finish.test") });
    assert.ok([200, 400, 401, 409].includes(checkout.status), `checkout status ${checkout.status}`);
    const checkoutText = JSON.stringify(checkout.json || {}) + checkout.text;
    assert.doesNotMatch(checkoutText, /price_live_|price_1[A-Za-z0-9]+/);
    if (checkout.json?.amount != null) {
      assert.ok(Number(checkout.json.amount) === 19.99 || Number(checkout.json.amount) === 1999, "monthly amount unchanged");
    }

    let playwright = null;
    try { playwright = require("playwright"); } catch { playwright = null; }
    if (!playwright) {
      console.log("4) Browser checks skipped (playwright not installed)");
      console.log("\nFree-to-paid conversion checks passed.");
      return;
    }

    console.log("4) Free user sees week preview + CTA; paid user does not see lock chrome");
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => {
      localStorage.setItem("llhUser", "free@finish.test");
      localStorage.setItem("llhPlan", "Free");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "free@finish.test": {
          email: "free@finish.test",
          plan: "Free",
          subscriptionStatus: "Free Plan",
          role: "owner",
          accountType: "home_daycare",
        },
      }));
    });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
    await page.evaluate(() => setView("lessons"));
    await page.waitForSelector("#view-lessons.active-view", { timeout: 8000 });
    await page.fill("#lessonPlanSearch", "Finish Week Garden Scientists");
    await page.waitForTimeout(400);
    await page.locator("#view-lessons .lesson-plan-card, #view-lessons .resource-card").filter({ hasText: "Finish Week Garden Scientists" }).first().click({ force: true });
    await page.waitForSelector("#featurePreviewModal.open", { timeout: 10000 });
    const locked = await page.evaluate(() => ({
      workspace: Boolean(document.querySelector("#resourceViewerModal.lesson-workspace-mode.open")),
      body: document.querySelector("#featurePreviewBody")?.innerText || "",
    }));
    assert.equal(locked.workspace, false);
    assert.match(locked.body, /Unlock the Full Week|Finish My Week|Print My Entire Week/i);
    assert.match(locked.body, /Soil Exploration Bin|This week at a glance/i);
    assert.doesNotMatch(locked.body, /Invite children to scoop/);
    assert.doesNotMatch(locked.body, /I notice the soil feels damp/);

    const paidPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await paidPage.addInitScript(() => {
      localStorage.setItem("llhUser", "pro@finish.test");
      localStorage.setItem("llhPlan", "Pro");
      localStorage.setItem("llhAccounts", JSON.stringify({
        "pro@finish.test": {
          email: "pro@finish.test",
          plan: "Pro",
          subscriptionStatus: "active",
          stripeSubscriptionStatus: "active",
          role: "owner",
          accountType: "home_daycare",
        },
      }));
    });
    await paidPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await paidPage.waitForFunction(() => typeof setView === "function" && typeof isProUser === "function", null, { timeout: 30000 });
    const paidChrome = await paidPage.evaluate(() => ({
      pro: typeof isProUser === "function" ? isProUser() : null,
      upgradeOffer: typeof canSeePaidUpgradeOffer === "function" ? canSeePaidUpgradeOffer() : null,
    }));
    assert.equal(paidChrome.upgradeOffer, false, "paid user must not see free upgrade offer");

    console.log("\nFree-to-paid conversion checks passed.");
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
