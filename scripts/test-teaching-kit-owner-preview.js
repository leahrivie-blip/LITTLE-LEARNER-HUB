#!/usr/bin/env node
/**
 * Teaching Kit Owner Preview — Viewer / Print / Attachments for
 * leahivie@icloud.com only while store customer flags stay false.
 * Run: npm run test:teaching-kit-owner-preview
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const teachingKit = require("./teaching-kit.js");

const ROOT = path.join(__dirname, "..");
const PORT = 7050 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-owner-preview-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/tk-owner-preview";
const OWNER_EMAIL = "leahivie@icloud.com";
const OTHER_ADMIN_EMAIL = "other-admin@example.com";
const ADMIN = {
  email: OWNER_EMAIL,
  password: "tk-owner-preview-pass",
  code: "tk-owner-preview-code",
};
const FIXTURE_ID = "cur-lp-tk-owner-preview-farm";

const OTHER_ACCOUNTS = [
  { label: "Pro member", headers: { Authorization: "Bearer test:pro-member@example.com", "x-llh-user-email": "pro-member@example.com" } },
  { label: "Free member", headers: { Authorization: "Bearer test:free-member@example.com", "x-llh-user-email": "free-member@example.com" } },
  { label: "Founding member", headers: { Authorization: "Bearer test:founding@example.com", "x-llh-user-email": "founding@example.com" } },
  { label: "Center Owner", headers: { Authorization: "Bearer test:center-owner@example.com", "x-llh-user-email": "center-owner@example.com" } },
  { label: "Director", headers: { Authorization: "Bearer test:director@example.com", "x-llh-user-email": "director@example.com" } },
  { label: "Teacher", headers: { Authorization: "Bearer test:teacher@example.com", "x-llh-user-email": "teacher@example.com" } },
  { label: "Assistant", headers: { Authorization: "Bearer test:assistant@example.com", "x-llh-user-email": "assistant@example.com" } },
  { label: "Owner alias (blocked)", headers: { Authorization: "Bearer test:leahrivie@icloud.com", "x-llh-user-email": "leahrivie@icloud.com" } },
];

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(child, timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode != null) throw new Error(`Server exited early: ${child.exitCode}`);
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("health timeout");
}

function mkDay(day, title) {
  return {
    items: [{
      itemId: `${FIXTURE_ID}-${day}-1`,
      id: `${FIXTURE_ID}-${day}-1`,
      title,
      description: `${title} description`,
      setup: `Set up ${title}`,
      steps: `1) Start ${title}\n2) Finish`,
      teacherTips: [`Tip for ${title}`],
      materials: "Cups\nCards",
      vocabulary: "farm, animal",
    }],
  };
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  ok(teachingKit.TEACHING_KIT_OWNER_PREVIEW_EMAIL === OWNER_EMAIL, "owner preview email constant");
  ok(teachingKit.isTeachingKitOwnerPreviewEmail(OWNER_EMAIL) === true, "owner email allowed");
  ok(teachingKit.isTeachingKitOwnerPreviewEmail("leahrivie@icloud.com") === false, "owner alias blocked");
  ok(teachingKit.isTeachingKitOwnerPreviewEmail("other-admin@example.com") === false, "other admin blocked");
  const off = teachingKit.defaultTeachingKitFeatureFlags();
  ok(teachingKit.isTeachingKitApiEnabled(off) === false, "API disabled when flags off");
  ok(teachingKit.isTeachingKitApiEnabledForRequest(off, { ownerPreview: true }) === true, "API enabled for owner preview");
  ok(teachingKit.isOwnerOnlyTeachingKitPreview(off, { ownerPreview: true }) === true, "owner-only preview detected");
  const elevated = teachingKit.effectiveCustomerTeachingKitFlags(off, { ownerPreview: true });
  ok(elevated.teachingKitViewer && elevated.teachingKitPrintCenter && elevated.teachingKitAttachments, "owner elevates all three flags");

  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  ok(appJs.includes("isOwnerTeachingKitPreviewActive"), "client owner preview helper");
  ok(appJs.includes("TEACHING_KIT_OWNER_PREVIEW_EMAIL"), "client owner email constant");
  ok(appJs.includes("teaching-kit-owner-preview"), "owner preview body class");
  const viewerJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-viewer.js"), "utf8");
  ok(viewerJs.includes("data-tk-owner-preview-banner"), "owner preview banner in viewer");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  ok(serverJs.includes("resolveTeachingKitCallerEmail"), "server caller email resolver");
  ok(serverJs.includes("ownerPreview: true"), "server echoes ownerPreview");

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: {
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
      },
      curriculum: { lessonPlans: [], activities: [], resources: [], updatedAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    },
    adminSessions: {},
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      HOME_DAYCARE_HUB_TESTING: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth(child);

    const ownerLogin = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    ok(ownerLogin.status === 200, "owner admin login");
    const ownerToken = ownerLogin.json.token;

    // Other admin login (same password/code via ADMIN_EMAILS aliases is not used —
    // create a second token by logging in as owner then we simulate other admin via
    // a separate server env would be heavy; instead verify non-owner identity headers
    // and a forged admin session path via member identity precedence.)
    let stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    let stamp = stampRes.json.siteContent?.updatedAt;

    let res = await requestJson("POST", "/api/admin/site-content", {
      adminToken: ownerToken,
      expectedUpdatedAt: stamp,
      siteContent: {
        ...stampRes.json.siteContent,
        featureFlags: {
          ...(stampRes.json.siteContent.featureFlags || {}),
          teachingKitViewer: false,
          teachingKitPrintCenter: false,
          teachingKitAttachments: false,
        },
      },
    }, { Authorization: `Bearer ${ownerToken}` });
    ok(res.status === 200, "customer TK flags forced off");
    stamp = res.json.siteContent?.updatedAt || res.json.siteContentUpdatedAt || stamp;

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: ownerToken,
      expectedUpdatedAt: stamp,
      lessonPlan: {
        id: FIXTURE_ID,
        title: "ZZ Owner Preview Farm Kit",
        status: "published",
        ageGroup: "Preschool",
        theme: "Farm",
        plan: "Pro",
        weeklyOverview: "A preschool farm week for owner Teaching Kit preview.",
        objectives: ["Name farm animals", "Practice gentle care"],
        weeklyMaterials: ["Farm figures", "Bins"],
        familyConnection: "Ask about milk or eggs at home.",
        books: [{ title: "Big Red Barn", author: "Margaret Wise Brown" }],
        songs: [{ title: "Old MacDonald Had a Farm" }],
        dailyPlans: {
          monday: mkDay("monday", "Farm Animal Discovery"),
          tuesday: mkDay("tuesday", "Muddy Pig Sensory"),
          wednesday: mkDay("wednesday", "Old MacDonald Sing Along"),
          thursday: mkDay("thursday", "Market Stand Count"),
          friday: mkDay("friday", "Farm Celebration Circle"),
        },
        disposableQaFixture: true,
      },
    }, { Authorization: `Bearer ${ownerToken}` });
    ok(res.status === 200, `seed fixture: ${res.status} ${res.json?.error || ""}`);

    const anon = await requestJson("GET", `/api/curriculum/lesson-plans/${FIXTURE_ID}/teaching-kit`);
    ok(anon.status === 404 && anon.json?.code === "teaching_kit_disabled", "anonymous blocked");

    for (const account of OTHER_ACCOUNTS) {
      const blocked = await requestJson(
        "GET",
        `/api/curriculum/lesson-plans/${FIXTURE_ID}/teaching-kit`,
        null,
        account.headers,
      );
      ok(
        blocked.status === 404 && blocked.json?.code === "teaching_kit_disabled",
        `${account.label} blocked while flags off`,
      );
    }

    // Non-owner admin token must not unlock TK: login as OTHER_ADMIN is not possible
    // with this server's ADMIN_EMAIL. Simulate by sending owner admin token PLUS a
    // non-owner member identity — member identity must win and stay blocked.
    const sharedBrowser = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${FIXTURE_ID}/teaching-kit?adminToken=${encodeURIComponent(ownerToken)}`,
      null,
      {
        Authorization: `Bearer test:pro-shared@example.com`,
        "x-llh-user-email": "pro-shared@example.com",
      },
    );
    ok(
      sharedBrowser.status === 404 && sharedBrowser.json?.code === "teaching_kit_disabled",
      "signed-in non-owner wins over owner admin token (shared browser)",
    );

    // Owner member identity unlocks
    const ownerMember = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${FIXTURE_ID}/teaching-kit`,
      null,
      {
        Authorization: `Bearer test:${OWNER_EMAIL}`,
        "x-llh-user-email": OWNER_EMAIL,
      },
    );
    ok(ownerMember.status === 200, `owner member kit: ${ownerMember.status}`);
    ok(ownerMember.json?.featureFlags?.teachingKitViewer === true, "owner response viewer true");
    ok(ownerMember.json?.featureFlags?.teachingKitPrintCenter === true, "owner response print true");
    ok(ownerMember.json?.featureFlags?.teachingKitAttachments === true, "owner response attachments true");
    ok(ownerMember.json?.featureFlags?.ownerPreview === true, "ownerPreview marker set");
    ok(ownerMember.json?.teachingKit?.locked === false, "owner kit unlocked");
    ok(Boolean(ownerMember.json?.teachingKit?.companion), "owner kit has companion");

    // Owner admin session (no member identity) unlocks
    const ownerAdmin = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${FIXTURE_ID}/teaching-kit`,
      null,
      { Authorization: `Bearer ${ownerToken}` },
    );
    ok(ownerAdmin.status === 200 && ownerAdmin.json?.featureFlags?.ownerPreview === true, "owner admin session kit ok");

    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    ok(store.siteContent?.featureFlags?.teachingKitViewer !== true, "store viewer still false");
    ok(store.siteContent?.featureFlags?.teachingKitPrintCenter !== true, "store print still false");
    ok(store.siteContent?.featureFlags?.teachingKitAttachments !== true, "store attachments still false");

    const publicSc = await requestJson("GET", "/api/site-content");
    ok(!publicSc.json?.siteContent?.featureFlags, "public site-content omits featureFlags");

    const browser = await chromium.launch({ headless: true });
    try {
      const viewports = [
        { name: "desktop", width: 1440, height: 1000 },
        { name: "tablet", width: 768, height: 1024 },
        { name: "mobile", width: 390, height: 844 },
      ];
      for (const vp of viewports) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForFunction(() => typeof window.LLHTeachingKitViewer !== "undefined", null, { timeout: 30000 });
        await page.evaluate(async (payload) => {
          window.currentUser = payload.ownerEmail;
          localStorage.setItem("llhAdminUnlocked", "true");
          localStorage.setItem("llhAdminPreviewMode", "Admin");
          localStorage.setItem("llhAdminSession", JSON.stringify({
            token: payload.ownerToken,
            email: payload.ownerEmail,
            unlockedAt: new Date().toISOString(),
          }));
          window.effectiveSiteContent = () => ({
            featureFlags: {
              teachingKitViewer: false,
              teachingKitPrintCenter: false,
              teachingKitAttachments: false,
            },
          });
          const kitRes = await window.fetchTeachingKitForPlan(payload.planId, { day: "monday" });
          window.__tkOwnerPreviewFetch = kitRes;
          let body = document.querySelector("#resourceViewerBody");
          if (!body) {
            body = document.createElement("div");
            body.id = "resourceViewerBody";
            document.body.appendChild(body);
          }
          body.innerHTML = `<div data-lesson-workspace class="lesson-workspace"></div>`;
          const enhanced = await window.LLHTeachingKitViewer.enhanceLessonWorkspace({
            body,
            teachingKit: kitRes.teachingKit,
            featureFlags: kitRes.featureFlags,
            chrome: {
              title: "ZZ Owner Preview Farm Kit",
              age: "Preschool",
              planLabel: "Pro",
              theme: "Farm",
              backLabel: "Back",
              ownerPreview: kitRes.featureFlags?.ownerPreview === true,
            },
          });
          window.__tkOwnerPreviewEnhanced = enhanced;
        }, { ownerToken, ownerEmail: OWNER_EMAIL, planId: FIXTURE_ID });

        const fetchOk = await page.evaluate(() => window.__tkOwnerPreviewFetch?.ok === true
          && window.__tkOwnerPreviewFetch?.featureFlags?.ownerPreview === true);
        ok(fetchOk, `${vp.name}: owner fetchTeachingKitForPlan ok`);
        ok(await page.evaluate(() => window.__tkOwnerPreviewEnhanced?.enhanced === true), `${vp.name}: viewer enhanced`);
        await page.waitForSelector("[data-teaching-kit-workspace][data-tk-owner-preview='1']", { timeout: 5000 });
        ok(await page.locator("[data-tk-owner-preview-banner]").count() === 1, `${vp.name}: owner preview banner`);
        ok(await page.locator(".tk-ops-tab[data-tk-goto='build']").count() === 1, `${vp.name}: Build/Print nav`);
        await page.locator(".tk-ops-tab[data-tk-goto='build']").click({ force: true });
        await page.waitForSelector("[data-tk-panel='build']", { timeout: 5000 });
        ok(await page.locator("[data-tk-print-binder]:not([disabled])").count() === 1, `${vp.name}: Print enabled`);
        await page.locator(".tk-ops-tab[data-tk-goto='binder']").click({ force: true });
        await page.waitForSelector("[data-tk-panel='binder']", { timeout: 5000 });
        await page.locator(".tk-ops-tab[data-tk-goto='today']").click({ force: true });
        await page.waitForSelector("[data-tk-panel='today']", { timeout: 5000 });
        await page.locator(".tk-ops-tab[data-tk-goto='setup']").click({ force: true });
        await page.waitForSelector("[data-tk-panel='setup']", { timeout: 5000 });
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, `owner-preview-${vp.name}.png`),
          fullPage: true,
        });
        await page.close();
      }

      // Signed-in owner member + Admin unlock must still authorize (admin token
      // attached even when currentUser is the owner — production ignores local identity headers).
      const ownerMemberPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await ownerMemberPage.addInitScript((email) => {
        localStorage.setItem("llhUser", email);
      }, OWNER_EMAIL);
      await ownerMemberPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await ownerMemberPage.waitForFunction(() => typeof window.fetchTeachingKitForPlan === "function", null, { timeout: 30000 });
      const ownerMemberClient = await ownerMemberPage.evaluate(async (payload) => {
        localStorage.setItem("llhAdminUnlocked", "true");
        localStorage.setItem("llhAdminPreviewMode", "Admin");
        localStorage.setItem("llhAdminSession", JSON.stringify({
          token: payload.ownerToken,
          email: payload.ownerEmail,
          unlockedAt: new Date().toISOString(),
        }));
        const signedIn = String(typeof currentUser !== "undefined" ? currentUser : "").trim().toLowerCase();
        const preview = window.isOwnerTeachingKitPreviewActive();
        const flags = window.effectiveTeachingKitCustomerFlags();
        const session = typeof adminSession === "function" ? adminSession() : null;
        const seen = [];
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input, init = {}) => {
          const url = String(typeof input === "string" ? input : input?.url || "");
          const headers = init.headers || {};
          const auth = headers.Authorization || headers.authorization || "";
          if (url.includes("/teaching-kit")) {
            seen.push({
              url,
              hasAdminQuery: /[?&]adminToken=/.test(url),
              authPrefix: String(auth).slice(0, 24),
            });
          }
          const res = await originalFetch(input, init);
          if (url.includes("/teaching-kit")) {
            seen[seen.length - 1].status = res.status;
          }
          return res;
        };
        const kitRes = await window.fetchTeachingKitForPlan(payload.planId, { day: "monday" });
        window.fetch = originalFetch;
        return {
          signedIn,
          preview,
          flags,
          sessionEmail: String(session?.email || "").toLowerCase(),
          hasToken: Boolean(session?.token),
          kitRes: {
            ok: kitRes.ok,
            reason: kitRes.reason,
            status: kitRes.status,
            ownerPreview: kitRes.featureFlags?.ownerPreview,
            print: kitRes.featureFlags?.teachingKitPrintCenter,
          },
          seen,
        };
      }, { ownerToken, ownerEmail: OWNER_EMAIL, planId: FIXTURE_ID });
      ok(ownerMemberClient.signedIn === OWNER_EMAIL, "owner member currentUser is owner email");
      ok(ownerMemberClient.preview === true, "owner member + admin unlock activates preview");
      ok(ownerMemberClient.flags?.teachingKitViewer === true, "owner member client flags elevate viewer");
      if (!(ownerMemberClient.kitRes?.ok === true && ownerMemberClient.kitRes?.ownerPreview === true)) {
        console.error("owner member kit debug:", JSON.stringify(ownerMemberClient, null, 2));
      }
      ok(ownerMemberClient.kitRes?.ok === true && ownerMemberClient.kitRes?.ownerPreview === true,
        "owner member + admin unlock kit fetch ok");
      ok(ownerMemberClient.kitRes?.print === true, "owner member + admin unlock print flag elevated");
      ok(
        ownerMemberClient.seen.some((row) => row.hasAdminQuery || /Bearer admin_/i.test(row.authPrefix)),
        "owner member + admin unlock attaches admin token",
      );
      await ownerMemberPage.close();

      // Pro client session cannot elevate
      const customerPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await customerPage.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await customerPage.waitForFunction(() => typeof window.fetchTeachingKitForPlan === "function", null, { timeout: 30000 });
      const customerResult = await customerPage.evaluate(async (planId) => {
        window.currentUser = "pro-member@example.com";
        localStorage.removeItem("llhAdminUnlocked");
        localStorage.removeItem("llhAdminSession");
        window.effectiveSiteContent = () => ({
          featureFlags: {
            teachingKitViewer: false,
            teachingKitPrintCenter: false,
            teachingKitAttachments: false,
          },
        });
        return window.fetchTeachingKitForPlan(planId, { day: "monday" });
      }, FIXTURE_ID);
      ok(customerResult.ok === false && customerResult.reason === "flag_off", "Pro client fetch blocked");

      // Other admin unlock (non-owner session email) blocked on client
      const otherAdminResult = await customerPage.evaluate(async (payload) => {
        window.currentUser = "";
        localStorage.setItem("llhAdminUnlocked", "true");
        localStorage.setItem("llhAdminSession", JSON.stringify({
          token: "fake-other-admin-token",
          email: payload.otherAdmin,
        }));
        window.effectiveSiteContent = () => ({
          featureFlags: {
            teachingKitViewer: false,
            teachingKitPrintCenter: false,
            teachingKitAttachments: false,
          },
        });
        return {
          active: window.isOwnerTeachingKitPreviewActive(),
          fetch: await window.fetchTeachingKitForPlan(payload.planId, { day: "monday" }),
        };
      }, { otherAdmin: OTHER_ADMIN_EMAIL, planId: FIXTURE_ID });
      ok(otherAdminResult.active === false, "other admin unlock is not owner preview");
      ok(otherAdminResult.fetch.ok === false, "other admin client fetch blocked");
      await customerPage.close();
    } finally {
      await browser.close();
    }

    const anonAfter = await requestJson("GET", `/api/curriculum/lesson-plans/${FIXTURE_ID}/teaching-kit`);
    ok(anonAfter.status === 404 && anonAfter.json?.code === "teaching_kit_disabled", "customer still blocked after owner preview");

    console.log(`\nPASS ${passed} assertions (teaching-kit-owner-preview)`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nFAIL", error);
  process.exitCode = 1;
});
