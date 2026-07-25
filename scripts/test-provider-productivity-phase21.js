#!/usr/bin/env node
"use strict";

/**
 * Phase 21 Provider Productivity focused suite.
 * Fake data only. No email/SMS/push/Stripe/live AI.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const model = require("./provider-productivity-data-model.js");
const fixtures = require("./provider-productivity-fixtures.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "phase21-admin@example.com";
const ADMIN_PASSWORD = "Phase21Productivity!99";
const ADMIN_CODE = "phase21-provider-code";
const BASE = "/api/director-center/productivity";

let passed = 0;
function pass(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

function request(port, method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await request(port, "GET", "/api/health");
        if (res.status === 200) return resolve();
      } catch { /* retry */ }
      if (Date.now() - started > timeoutMs) return reject(new Error("Server health timeout"));
      setTimeout(tick, 150);
    };
    tick();
  });
}

function baseStore() {
  return {
    siteContent: {
      featureFlags: {
        [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: true,
        [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: true,
      },
    },
  };
}

async function startServer({ env = {} } = {}) {
  const storePath = path.join(os.tmpdir(), `llh-pp-phase21-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(baseStore(), null, 2));
  const port = 9800 + Math.floor(Math.random() * 400);
  const child = spawn("node", ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: storePath,
      SITE_URL: env.SITE_URL || "http://127.0.0.1",
      ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FORMS_CENTER_ADMIN_PREVIEW: "true",
      ALLOW_FAMILY_HUB_TESTING_PREVIEW: "true",
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      OPENAI_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      DISABLE_OUTBOUND_EMAIL: "true",
      DISABLE_STRIPE_CHECKOUT: "true",
      DISABLE_AI_CALLS: "true",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  try {
    await waitForHealth(port);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error.message}\n${stderr}`);
  }
  return { port, child, storePath };
}

async function stopServer(ctx) {
  if (!ctx?.child) return;
  ctx.child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    ctx.child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function adminLogin(port) {
  const res = await request(port, "POST", "/api/admin/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, code: ADMIN_CODE },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function run() {
  {
    const store = {};
    const seeded = fixtures.ensurePhase21Preview(store, {
      adminEmail: "owner@real.test",
      programStyle: "home_daycare",
    });
    assert.ok(seeded.organizationId.startsWith("org_"));
    const pp = model.ensureProductivityStore(store);
    const preference = model.getOrgPreference(store, seeded.organizationId);
    assert.equal(preference.planningPreference, model.PLANNING_PREFERENCES.CHILD_LED_PLAY_BASED);
    assert.ok(Object.values(pp.suggestions).some((row) => row.liveAiUsed === false && row.reviewed === false));
    assert.ok(Object.values(pp.notificationPrefs).every((row) => row.outboundEmail === false && row.outboundSms === false && row.outboundPush === false));
    assert.ok(Object.values(store.staffMemberships || {}).every((row) => !row.userEmail || row.userEmail.endsWith("@example.invalid")));
    pass("fixtures_seed_fake_child_led");
  }

  {
    const prod = await startServer({
      env: { SITE_URL: "https://littlelearnershubbyleah.com", ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW: "true" },
    });
    try {
      const token = await adminLogin(prod.port);
      const res = await request(prod.port, "GET", `${BASE}/dashboard`, { headers: auth(token) });
      assert.equal(res.status, 403);
      assert.ok(["production_preview_rejected", "feature_unavailable"].includes(res.body.code), JSON.stringify(res.body));
      pass("production_rejection");
    } finally {
      await stopServer(prod);
    }
  }

  const ctx = await startServer();
  try {
    const token = await adminLogin(ctx.port);
    const headers = auth(token);

    const seed = await request(ctx.port, "POST", `${BASE}/seed`, {
      headers,
      body: { reset: true, programStyle: "center" },
    });
    assert.equal(seed.status, 200, JSON.stringify(seed.body));
    assert.equal(seed.body.phase, 21);
    assert.equal(seed.body.featureMarker, model.FEATURE_MARKER);
    assert.equal(seed.body.noLiveAi, true);
    assert.equal(seed.body.noExternalServices, true);
    assert.equal(seed.body.preference.planningPreference, model.PLANNING_PREFERENCES.MIXED_FLEXIBLE);
    pass("seed_dashboard");

    const dashboard = await request(ctx.port, "GET", `${BASE}/dashboard`, { headers });
    assert.equal(dashboard.status, 200);
    assert.ok(dashboard.body.phone.featureMarker.includes("phase21-child-led-mobile"));
    assert.equal(dashboard.body.lessonPlansOptional, true);
    assert.ok((dashboard.body.activities || []).length >= 3);
    pass("dashboard_phone_and_optional_lessons");

    const prefs = await request(ctx.port, "PATCH", `${BASE}/preferences`, {
      headers,
      body: { planningPreference: model.PLANNING_PREFERENCES.CHILD_LED_PLAY_BASED, programStyle: "home_daycare" },
    });
    assert.equal(prefs.status, 200);
    assert.equal(prefs.body.preference.planningPreference, model.PLANNING_PREFERENCES.CHILD_LED_PLAY_BASED);
    pass("preferences_patch");

    const setup = await request(ctx.port, "POST", `${BASE}/setup`, {
      headers,
      body: { completeStepId: "children_guardians", finishLater: true },
    });
    assert.equal(setup.status, 200);
    assert.ok(setup.body.setup.completedStepIds.includes("children_guardians"));
    assert.equal(setup.body.setup.status, "saved_for_later");
    pass("setup_save_later");

    const interest = await request(ctx.port, "POST", `${BASE}/interests`, {
      headers,
      body: { note: "Children are lining up pine cones.", theme: "outdoor_exploration", nextStep: "Bring baskets outside." },
    });
    assert.equal(interest.status, 201, JSON.stringify(interest.body));
    const suggestions = await request(ctx.port, "POST", `${BASE}/interests/${interest.body.interest.id}/suggestions`, { headers, body: {} });
    assert.equal(suggestions.status, 201);
    assert.equal(suggestions.body.liveAiUsed, false);
    const suggestion = suggestions.body.suggestions[0];
    const saveBlocked = await request(ctx.port, "POST", `${BASE}/suggestions/${suggestion.id}/save`, { headers, body: {} });
    assert.equal(saveBlocked.status, 400);
    const reviewBlocked = await request(ctx.port, "POST", `${BASE}/suggestions/${suggestion.id}/review`, { headers, body: { confirm: false, reviewed: true } });
    assert.equal(reviewBlocked.status, 400);
    const reviewed = await request(ctx.port, "POST", `${BASE}/suggestions/${suggestion.id}/review`, { headers, body: { confirm: true, reviewed: true } });
    assert.equal(reviewed.status, 200);
    const saved = await request(ctx.port, "POST", `${BASE}/suggestions/${suggestion.id}/save`, { headers, body: {} });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.suggestion.saved, true);
    pass("child_led_review_before_save");

    const plan = await request(ctx.port, "POST", `${BASE}/plan-entries`, {
      headers,
      body: { suggestionId: suggestion.id, target: "today", initiationMode: "child_initiated" },
    });
    assert.equal(plan.status, 201);
    assert.equal(plan.body.planEntry.target, "today");
    const happened = await request(ctx.port, "POST", `${BASE}/what-happened`, {
      headers,
      body: { planEntryId: plan.body.planEntry.id, note: "Children filled baskets and compared sizes." },
    });
    assert.equal(happened.status, 201);
    assert.equal(happened.body.whatHappened.formalLessonPlanRequired, false);
    pass("plan_entry_and_what_happened");

    const activities = await request(ctx.port, "GET", `${BASE}/activities?q=mud&indoorOutdoor=outdoor`, { headers });
    assert.equal(activities.status, 200);
    assert.ok(activities.body.activities.some((row) => /mud/i.test(row.title)));
    const activityId = activities.body.activities[0].id;
    const favorite = await request(ctx.port, "POST", `${BASE}/activities/${activityId}/favorite`, { headers, body: {} });
    assert.equal(favorite.status, 200);
    assert.equal(favorite.body.favorited, true);
    const duplicate = await request(ctx.port, "POST", `${BASE}/activities/${activityId}/duplicate`, { headers, body: {} });
    assert.equal(duplicate.status, 201);
    pass("activities_favorite_duplicate");

    const teacherSearch = await request(ctx.port, "GET", `${BASE}/search?q=preview&role=teacher`, { headers });
    assert.equal(teacherSearch.status, 200);
    assert.ok(!(teacherSearch.body.groups || []).some((group) => group.type === "invoices"));
    const guardianSearch = await request(ctx.port, "GET", `${BASE}/search?q=preview&role=guardian`, { headers });
    assert.equal(guardianSearch.status, 200);
    assert.ok(!(guardianSearch.body.groups || []).some((group) => group.type === "invoices" || group.type === "staff"));
    pass("search_role_boundaries");

    const notif = await request(ctx.port, "PATCH", `${BASE}/notification-prefs`, {
      headers,
      body: { outboundEmail: true, outboundSms: true, outboundPush: true, categories: { billing: true } },
    });
    assert.equal(notif.status, 200);
    assert.equal(notif.body.notificationPrefs.outboundEmail, false);
    assert.equal(notif.body.notificationPrefs.outboundSms, false);
    assert.equal(notif.body.notificationPrefs.outboundPush, false);
    pass("notification_prefs_outbound_off");

    const bulkBlocked = await request(ctx.port, "POST", `${BASE}/bulk-assign`, { headers, body: { activityIds: [activityId] } });
    assert.equal(bulkBlocked.status, 400);
    const bulk = await request(ctx.port, "POST", `${BASE}/bulk-assign`, { headers, body: { confirm: true, activityIds: [activityId] } });
    assert.equal(bulk.status, 200);
    assert.equal(bulk.body.fakeOnly, true);
    pass("bulk_assign_confirm_required");

    const scanBlocked = await request(ctx.port, "POST", `${BASE}/scan`, { headers, body: { fileName: "real.jpg", base64: "abc" } });
    assert.equal(scanBlocked.status, 400);
    const scan = await request(ctx.port, "POST", `${BASE}/scan`, { headers, body: { fileName: "fake-observation.jpg" } });
    assert.equal(scan.status, 201);
    assert.equal(scan.body.scan.fakeOnly, true);
    pass("scan_fake_only");

    const orgId = seed.body.organization.id;
    const crossOrg = await request(ctx.port, "GET", `${BASE}/dashboard?organizationId=org_cross_org_denied`, { headers });
    assert.equal(crossOrg.status, 403);
    assert.equal(crossOrg.body.code, "cross_org_denied");
    const sameOrg = await request(ctx.port, "GET", `${BASE}/dashboard?organizationId=${encodeURIComponent(orgId)}`, { headers });
    assert.equal(sameOrg.status, 200);
    pass("cross_org_denial");

    const undo = await request(ctx.port, "POST", `${BASE}/undo`, { headers, body: {} });
    assert.equal(undo.status, 200);
    assert.equal(typeof undo.body.undone, "boolean");
    pass("undo");
  } finally {
    await stopServer(ctx);
  }

  console.log(`Provider Productivity Phase 21 checks passed (${passed}).`);
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
