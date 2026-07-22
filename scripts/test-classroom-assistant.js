#!/usr/bin/env node
"use strict";

/**
 * Classroom Assistant focused suite.
 * Fake data only. No email/SMS/push/Stripe/live AI.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const expansionFlags = require("./expansion-feature-flags.js");
const model = require("./classroom-assistant-data-model.js");
const fixtures = require("./classroom-assistant-fixtures.js");
const { EXPANSION_FEATURE_KEYS } = expansionFlags;

const ROOT = path.join(__dirname, "..");
const ADMIN_EMAIL = "classroom-assistant-admin@example.com";
const ADMIN_PASSWORD = "ClassroomAssistant!99";
const ADMIN_CODE = "classroom-assistant-code";
const BASE = "/api/director-center/classroom-assistant";

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
  const storePath = path.join(os.tmpdir(), `llh-ca-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(storePath, JSON.stringify(baseStore(), null, 2));
  const port = 10300 + Math.floor(Math.random() * 500);
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

function unitFixture() {
  const store = {};
  const seeded = fixtures.ensureClassroomAssistantPreview(store, { adminEmail: ADMIN_EMAIL });
  const checked = model.getCheckedInChildren(store, seeded.organizationId, { date: seeded.date });
  const children = model.childrenForOrg(store, seeded.organizationId);
  return { store, seeded, checked, children };
}

async function run() {
  {
    const { seeded, checked, children } = unitFixture();
    const plan = model.parseNaturalNote(
      "Breakfast was at 8:30. Everyone had bananas, apples, and milk. Timmy decided not to eat his breakfast.",
      { organizationId: seeded.organizationId, children, checkedInIds: checked.map((child) => child.id) },
    );
    assert.equal(plan.liveAiUsed, false);
    assert.equal(plan.requiresReview, true);
    assert.equal(plan.meal.mealType, "breakfast");
    assert.ok(plan.meal.foods.includes("bananas"));
    assert.ok(plan.meal.foods.includes("apples"));
    assert.ok(plan.meal.foods.includes("milk"));
    assert.equal(plan.meal.exceptions[0].childName, "Timmy");
    assert.equal(plan.meal.exceptions[0].ate, false);
    pass("unit_parse_breakfast_group_timmy_exception");
  }

  {
    const { seeded, checked, children } = unitFixture();
    const plan = model.parseNaturalNote(
      "Today we went on a walk and looked for butterflies. Everyone loved it. Susan was especially excited to find a yellow butterfly.",
      { organizationId: seeded.organizationId, children, checkedInIds: checked.map((child) => child.id) },
    );
    assert.equal(plan.activity.groupEnjoyed, true);
    assert.ok(/walk/i.test(plan.activity.title));
    assert.equal(plan.activity.highlights[0].childName, "Susan");
    assert.equal(plan.activity.highlights[0].observation, true);
    pass("unit_parse_walk_susan_observation");
  }

  {
    const { seeded, checked, children } = unitFixture();
    const plan = model.parseNaturalNote(
      "Everyone had a great nap except Ava, who slept for only 20 minutes.",
      { organizationId: seeded.organizationId, children, checkedInIds: checked.map((child) => child.id) },
    );
    assert.equal(plan.nap.groupSlept, true);
    assert.equal(plan.nap.exceptions[0].childName, "Ava");
    assert.equal(plan.nap.exceptions[0].durationMinutes, 20);
    pass("unit_parse_nap_ava_exception");
  }

  {
    const { seeded, checked, children } = unitFixture();
    const absentBen = children.find((child) => child.displayName === "Ben");
    const plan = model.parseNaturalNote(
      "Today we painted, played outside, and had pizza for lunch. Everyone enjoyed painting except Jack, who preferred reading books.",
      { organizationId: seeded.organizationId, children, checkedInIds: checked.map((child) => child.id) },
    );
    assert.ok(plan.targets.length >= 5);
    assert.ok(!plan.targets.includes(absentBen.id));
    assert.equal(plan.activity.exceptions[0].childName, "Jack");
    assert.equal(plan.meal.mealType, "lunch");
    pass("unit_checked_in_only_absent_not_targeted");
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
    const seed = await request(ctx.port, "POST", `${BASE}/seed`, { headers, body: { reset: true } });
    assert.equal(seed.status, 200, JSON.stringify(seed.body));
    assert.equal(seed.body.featureMarker, model.FEATURE_MARKER);
    assert.equal(seed.body.liveAiUsed, false);
    assert.ok(seed.body.checkedInChildren.some((child) => child.displayName === "Timmy"));
    pass("seed_dashboard_checked_in");

    const beforeParse = fs.readFileSync(ctx.storePath, "utf8");
    const parsed = await request(ctx.port, "POST", `${BASE}/parse`, {
      headers,
      body: {
        text: "Breakfast was at 8:30. Everyone had bananas, apples, and milk. Timmy decided not to eat his breakfast.",
      },
    });
    assert.equal(parsed.status, 200, JSON.stringify(parsed.body));
    assert.equal(parsed.body.preview, true);
    assert.equal(parsed.body.plan.liveAiUsed, false);
    assert.equal(fs.readFileSync(ctx.storePath, "utf8"), beforeParse);
    pass("parse_preview_does_not_mutate_store");

    const blocked = await request(ctx.port, "POST", `${BASE}/apply`, {
      headers,
      body: { planId: parsed.body.plan.id },
    });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.body.code, "confirm_required");
    pass("apply_without_confirm_rejected");

    const applied = await request(ctx.port, "POST", `${BASE}/apply`, {
      headers,
      body: { planId: parsed.body.plan.id, confirm: true },
    });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.ok(applied.body.created.mealLogIds.length >= 5);
    const storeAfterApply = JSON.parse(fs.readFileSync(ctx.storePath, "utf8"));
    const mealLogs = Object.values(storeAfterApply.classroomAssistant.mealLogs);
    assert.ok(mealLogs.some((row) => row.childName === "Timmy" && row.ate === false));
    assert.ok(!mealLogs.some((row) => row.childName === "Ben"));
    pass("apply_with_confirm_writes_group_and_exception");

    const crossOrg = await request(ctx.port, "GET", `${BASE}/dashboard?organizationId=org_cross_org_denied`, { headers });
    assert.equal(crossOrg.status, 403);
    assert.equal(crossOrg.body.code, "cross_org_denied");
    pass("cross_org_denial");

    const lessonParse = await request(ctx.port, "POST", `${BASE}/admin/lesson-plan/parse`, {
      headers,
      body: {
        text: "Title: Butterfly Week\nAge group: Preschool\nDomains: science, language\nMonday: Walk and look for butterflies\nMaterials: paper, crayons, magnifiers\nObjectives: notice nature, describe colors",
      },
    });
    assert.equal(lessonParse.status, 200, JSON.stringify(lessonParse.body));
    assert.equal(lessonParse.body.draft.requiresReview, true);
    assert.equal(lessonParse.body.draft.liveAiUsed, false);
    const lessonConfirm = await request(ctx.port, "POST", `${BASE}/admin/lesson-plan/confirm`, {
      headers,
      body: { draftId: lessonParse.body.draft.id, confirm: true },
    });
    assert.equal(lessonConfirm.status, 200, JSON.stringify(lessonConfirm.body));
    assert.equal(lessonConfirm.body.draft.requiresReview, false);
    assert.equal(lessonConfirm.body.draft.status, "saved_fake_curriculum");
    pass("lesson_plan_paste_requires_review_confirm_saves");

    const suggestion = await request(ctx.port, "POST", `${BASE}/suggestions/accept`, {
      headers,
      body: { planId: parsed.body.plan.id, suggestion: parsed.body.plan.suggestions[0], confirm: true },
    });
    assert.equal(suggestion.status, 200);
    assert.equal(suggestion.body.action.liveAiUsed, false);
    pass("suggestion_accept_fake_confirmed");

    const phone = await request(ctx.port, "GET", `${BASE}/phone-summary`, { headers });
    assert.equal(phone.status, 200);
    assert.equal(phone.body.phone.featureMarker, model.PHONE_MARKER);
    pass("phone_summary_marker");
  } finally {
    await stopServer(ctx);
  }

  {
    const ui = fs.readFileSync(path.join(ROOT, "classroom-assistant-ui.js"), "utf8");
    assert.ok(ui.includes('data-feature-marker="phase-ca-classroom-assistant"'));
    assert.ok(ui.includes("phase-ca-classroom-assistant-mobile"));
    assert.ok(ui.includes("Computer recommended"));
    pass("phone_computer_markers_in_ui_file");
  }

  console.log(`Classroom Assistant checks passed (${passed}).`);
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
