#!/usr/bin/env node
/**
 * Phase 4 — permanent delete disposable fixtures (isolated store only).
 * Run: npm run test:disposable-fixture-delete-phase4
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 6400 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-fixture-delete-phase4-${process.pid}.json`);
const ADMIN = {
  email: "fixture-delete-admin@example.com",
  password: "fixture-delete-pass",
  code: "fixture-delete-code",
};
const FIXTURE_ID = "cur-lp-tk-phase4-disposable";
const REAL_ID = "cur-lp-tk-phase4-real-keep";
const TITLE = "ZZ QA Phase4 Disposable Fixture";

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

function findPlan(curriculum, id) {
  return (curriculum?.lessonPlans || []).find((p) => p.id === id) || null;
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  ok(serverJs.includes("disposable-fixture/permanent-delete"), "delete endpoint registered");
  ok(serverJs.includes("KNOWN_DISPOSABLE_QA_FIXTURE_IDS"), "explicit fixture allowlist present");
  ok(serverJs.includes("isDisposableQaFixturePlan"), "fixture classifier present");
  ok(appJs.includes("data-curriculum-fixture-permanent-delete"), "UI delete control present");
  ok(appJs.includes("permanentlyDeleteDisposableFixture"), "UI delete helper present");

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: { teachingKitEnrichmentEditor: true },
      curriculum: { lessonPlans: [], activities: [], resources: [], updatedAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    },
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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email, password: ADMIN.password, code: ADMIN.code,
    });
    ok(login.status === 200, "admin login");
    const adminToken = login.json.token || login.json.adminToken;
    const auth = { Authorization: `Bearer ${adminToken}` };

    let stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let stamp = stampRes.json.siteContent?.updatedAt;

    async function seed(id, title, { disposable = false, status = "draft" } = {}) {
      const dayItem = (day) => ({
        itemId: `${id}-${day}`,
        id: `${id}-${day}`,
        title: `${day} act`,
        teacherTips: ["t"],
      });
      const res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt: stamp,
        lessonPlan: {
          id,
          title,
          status,
          age: "Preschool",
          theme: "QA",
          plan: "Free",
          weeklyOverview: "seed",
          disposableQaFixture: disposable || undefined,
          dailyPlans: {
            monday: { items: [dayItem("monday")] },
            tuesday: { items: [dayItem("tuesday")] },
            wednesday: { items: [dayItem("wednesday")] },
            thursday: { items: [dayItem("thursday")] },
            friday: { items: [dayItem("friday")] },
          },
        },
      }, auth);
      ok(res.status === 200, `seed ${id}: ${res.status} ${res.json?.error || ""}`);
      stamp = res.json.siteContentUpdatedAt;
      return res;
    }

    await seed(REAL_ID, "Keep Me Real Lesson", { disposable: false, status: "published" });
    await seed(FIXTURE_ID, TITLE, { disposable: true, status: "draft" });

    // Refuse delete while not archived
    let res = await requestJson("POST", "/api/admin/curriculum/disposable-fixture/permanent-delete", {
      adminToken,
      expectedUpdatedAt: stamp,
      planId: FIXTURE_ID,
      confirmTitle: TITLE,
      confirmPhrase: "PERMANENTLY DELETE",
      adminEmail: ADMIN.email,
    }, auth);
    ok(res.status === 409 && res.json?.code === "fixture_not_archived", "requires archived status");

    // Archive fixture
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      lessonPlan: { id: FIXTURE_ID, title: TITLE, status: "archived", disposableQaFixture: true },
    }, auth);
    ok(res.status === 200, "archive fixture");
    stamp = res.json.siteContentUpdatedAt;

    // Refuse real lesson even with matching title confirm tricks
    res = await requestJson("POST", "/api/admin/curriculum/disposable-fixture/permanent-delete", {
      adminToken,
      expectedUpdatedAt: stamp,
      planId: REAL_ID,
      confirmTitle: "Keep Me Real Lesson",
      confirmPhrase: "PERMANENTLY DELETE",
      adminEmail: ADMIN.email,
    }, auth);
    ok(res.status === 403 && res.json?.code === "not_disposable_fixture", "refuses normal curriculum");

    // Wrong title
    res = await requestJson("POST", "/api/admin/curriculum/disposable-fixture/permanent-delete", {
      adminToken,
      expectedUpdatedAt: stamp,
      planId: FIXTURE_ID,
      confirmTitle: "wrong title",
      confirmPhrase: "PERMANENTLY DELETE",
      adminEmail: ADMIN.email,
    }, auth);
    ok(res.status === 400 && res.json?.code === "confirm_title_mismatch", "exact title required");

    stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    stamp = stampRes.json.siteContent?.updatedAt;
    const before = {
      lessons: (stampRes.json.siteContent.curriculum.lessonPlans || []).length,
      activities: (stampRes.json.siteContent.curriculum.activities || []).length,
    };

    res = await requestJson("POST", "/api/admin/curriculum/disposable-fixture/permanent-delete", {
      adminToken,
      expectedUpdatedAt: stamp,
      planId: FIXTURE_ID,
      confirmTitle: TITLE,
      confirmPhrase: "PERMANENTLY DELETE",
      adminEmail: ADMIN.email,
    }, auth);
    ok(res.status === 200, `delete fixture: ${res.status} ${res.json?.error || ""}`);
    ok(res.json.deletedPlanId === FIXTURE_ID, "deleted plan id returned");
    ok(Array.isArray(res.json.deletedActivityIds), "deleted activity ids returned");
    stamp = res.json.siteContentUpdatedAt;
    ok(!findPlan(res.json.curriculum, FIXTURE_ID), "fixture removed");
    ok(Boolean(findPlan(res.json.curriculum, REAL_ID)), "real lesson retained");
    ok(findPlan(res.json.curriculum, REAL_ID)?.title === "Keep Me Real Lesson", "real lesson title unchanged");
    ok(res.json.after.lessonPlans === before.lessons - 1, "lesson count decreased by 1");
    ok(res.json.after.activities === before.activities - (res.json.deletedActivityIds?.length || 0), "activity count matches deleted links");

    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    ok((store.disposableFixtureDeleteAudit || []).length >= 1, "delete audit written before/with delete");
    ok(store.disposableFixtureDeleteAudit[0].lessonPlanId === FIXTURE_ID, "audit references fixture id");

    console.log(`\nPASS ${passed} assertions (disposable-fixture-delete-phase4)`);
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nFAIL", error);
  process.exitCode = 1;
});
