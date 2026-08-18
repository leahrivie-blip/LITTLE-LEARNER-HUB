#!/usr/bin/env node
/**
 * Pro conversion messaging + AI lesson gate regression.
 * Run: node scripts/test-pro-conversion-messaging.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4390 + Math.floor(Math.random() * 40);
const STORE = path.join(os.tmpdir(), `llh-pro-conversion-${crypto.randomBytes(4).toString("hex")}.json`);
const FREE_USER = "conversion-free@example.com";
const PRO_USER = "conversion-pro@example.com";

function request(method, urlPath, { email = "", body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (email) headers.Authorization = `Bearer test:${email}`;
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${PORT}${urlPath}`, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Server did not become healthy");
}

function assertIncludes(haystack, needle, label) {
  assert.ok(String(haystack || "").includes(needle), `${label}: expected to include "${needle}"`);
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const viewerJs = fs.readFileSync(path.join(ROOT, "scripts/curriculum-lesson-viewer-render.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  assertIncludes(appJs, "Save hours every week with unlimited lesson plans", "value prop");
  assertIncludes(appJs, "This is included in Pro", "value-first upgrade headline");
  assertIncludes(appJs, "Generate custom lesson plans in seconds and save hours of planning every week.", "AI gate message");
  assertIncludes(appJs, "function canGenerateAiLessonPlans()", "AI gate helper");
  assertIncludes(appJs, "function freeLibraryConversionBannerHtml", "dashboard banner helper");
  assertIncludes(appJs, "function freeWelcomeCardHtml", "new Free welcome card helper");
  assertIncludes(indexHtml, "newUserOnboardingModal", "new user onboarding modal");
  assertIncludes(appJs, "function refreshFreePlanUpgradeChrome", "persistent free chrome helper");
  assertIncludes(appJs, "function renderLessonPlanLibraryCountsHtml", "library counts helper");
  assertIncludes(appJs, "function freeUpgradePrimaryButtonLabel", "unified CTA helper");
  assertIncludes(appJs, "function planComparisonTableHtml", "comparison table helper");
  assertIncludes(appJs, "Upgrade to Pro", "paid upgrade CTA");
  assertIncludes(appJs, "7-Day Pro Trial", "trial conversion note");
  assertIncludes(appJs, "freeCalendarPlanningDays = 30", "free calendar horizon");
  assertIncludes(appJs, "freeFavoriteLimit = 20", "free favorites limit");
  assertIncludes(appJs, "freeChildProfileLimit = 5", "free child profile limit");
  assertIncludes(viewerJs, "This is a Pro Lesson Plan.", "locked preview headline");
  assertIncludes(viewerJs, "Complete Monday–Friday lesson plans", "locked preview unlock list");
  assertIncludes(viewerJs, "New lesson plans added every week", "locked preview weekly language");
  assertIncludes(indexHtml, "freePlanBadge", "free plan badge");
  assertIncludes(indexHtml, "freePlanReminderBar", "free plan reminder bar");
  assertIncludes(indexHtml, "sidebarFreeUpgradeCard", "sidebar free upgrade card");

  // Preview lock contract: locked renderer must not emit protected day-plan sections.
  const lockedFn = viewerJs.slice(
    viewerJs.indexOf("function lockedCurriculumLessonPreviewHtml"),
    viewerJs.indexOf("function lockedCurriculumActivityPreviewHtml"),
  );
  ["Weekly Objectives", "dailyPlans", "Teacher Language", "Materials List"].forEach((forbidden) => {
    assert.equal(lockedFn.includes(forbidden), false, `locked preview should not include ${forbidden}`);
  });
  ["Age Group", "Theme", "Learning Domains", "Weekly Overview"].forEach((required) => {
    assertIncludes(lockedFn, required, "locked preview teaser field");
  });

  fs.writeFileSync(STORE, JSON.stringify({
    users: {
      [FREE_USER]: {
        email: FREE_USER,
        plan: "Free",
        subscriptionStatus: "Free Plan",
      },
      [PRO_USER]: {
        email: PRO_USER,
        plan: "Pro",
        subscriptionStatus: "Active",
        stripeSubscriptionStatus: "active",
        internalAccessOverride: true,
      },
    },
  }, null, 2));

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      LLH_STORE_PATH: STORE,
      NODE_ENV: "test",
      ADMIN_EMAIL: "admin@test.local",
      ADMIN_PASSWORD: "test-password",
      ADMIN_ACCESS_CODE: "test-code",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth();

    const freeBlocked = await request("POST", "/api/ai-generate", {
      email: FREE_USER,
      body: {
        email: FREE_USER,
        tool: "lesson",
        age: "Preschool",
        theme: "Garden",
        focus: "science",
      },
    });
    assert.equal(freeBlocked.status, 403, JSON.stringify(freeBlocked.json));
    assert.equal(freeBlocked.json.code, "pro_required");
    assertIncludes(freeBlocked.json.error, "Available with Pro Membership", "free AI lesson 403");

    const proAllowed = await request("POST", "/api/ai-generate", {
      email: PRO_USER,
      body: {
        email: PRO_USER,
        tool: "lesson",
        age: "Preschool",
        theme: "Garden",
        focus: "science",
      },
    });
    // Without OpenAI key this may 503, but must not be a Pro gate 403.
    assert.notEqual(proAllowed.status, 403, JSON.stringify(proAllowed.json));

    const site = await request("GET", "/api/site-content");
    assert.equal(site.status, 200);
    const library = site.json?.curriculumLibrary || site.json?.siteContent?.curriculumLibrary || {};
    const plans = Array.isArray(library.lessonPlans) ? library.lessonPlans : [];
    const freeSample = require("./free-curriculum-sample.js");
    // Store tags can remain Pro; starter IDs must not unlock them.
    plans.filter((p) => p.plan === "Pro" && !freeSample.isCuratedFreeLessonPlan(p)).forEach((plan) => {
      assert.equal(plan.locked, true, `${plan.id} should be locked`);
      assert.equal(plan.dailyPlans, undefined, `${plan.id} must not leak dailyPlans`);
      assert.equal(plan.objectives, undefined, `${plan.id} must not leak objectives`);
      assert.equal(plan.materials, undefined, `${plan.id} must not leak materials`);
      assert.equal(plan.books, undefined, `${plan.id} must not leak books`);
      assert.equal(plan.songs, undefined, `${plan.id} must not leak songs`);
    });

    console.log("✅ Pro conversion messaging + AI lesson gate tests passed.");
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch {}
  }
}

main().catch((error) => {
  console.error("❌", error.message || error);
  process.exitCode = 1;
});
