#!/usr/bin/env node
/**
 * Phase 3 — Teaching Kit recovery controls (disposable fixtures only).
 * Run: npm run test:tk-recovery-controls-phase3
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 6300 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-recovery-phase3-${process.pid}.json`);
const ADMIN = {
  email: "tk-recovery-phase3-admin@example.com",
  password: "tk-recovery-phase3-pass",
  code: "tk-recovery-phase3-code",
};
const FIXTURE_ID = "cur-lp-tk-recovery-phase3-fixture";

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
  const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  ok(editorJs.includes("data-enrich-recovery-toolbar"), "always-visible recovery toolbar present");
  ok(editorJs.includes("Version History"), "Version History control present");
  ok(editorJs.includes("Compare Draft vs Published"), "Compare draft vs published present");
  ok(editorJs.includes("Compare Published vs Previous Version"), "Compare published vs previous present");
  ok(editorJs.includes("Rollback Last Publish"), "Rollback control present");
  ok(editorJs.includes("Discard Draft"), "Discard Draft control present");
  ok(editorJs.includes("Undo Discard"), "Undo Discard control present");
  ok(editorJs.includes("Providers keep the current published kit"), "rollback confirm explains draft-only restore");

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: {
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
        teachingKitEnrichmentEditor: true,
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
    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email, password: ADMIN.password, code: ADMIN.code,
    });
    ok(login.status === 200, "admin login");
    const adminToken = login.json.token || login.json.adminToken;
    const auth = { Authorization: `Bearer ${adminToken}` };

    let stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let stamp = stampRes.json.siteContent?.updatedAt;
    let res = await requestJson("POST", "/api/admin/site-content", {
      adminToken,
      expectedUpdatedAt: stamp,
      siteContent: {
        ...stampRes.json.siteContent,
        featureFlags: {
          ...(stampRes.json.siteContent.featureFlags || {}),
          teachingKitViewer: false,
          teachingKitPrintCenter: false,
          teachingKitAttachments: false,
          teachingKitEnrichmentEditor: true,
        },
      },
    }, auth);
    ok(res.status === 200, "flags set");
    stamp = res.json.siteContent?.updatedAt || stamp;

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      lessonPlan: {
        id: FIXTURE_ID,
        title: "ZZ QA Phase3 Recovery Fixture (disposable)",
        status: "draft",
        ageGroup: "Preschool",
        theme: "QA Isolation",
        plan: "Free",
        weeklyOverview: "Disposable recovery fixture",
        familyConnection: "family-published-base",
        dailyPlans: {
          monday: { items: [{ itemId: `${FIXTURE_ID}-act-1`, id: `${FIXTURE_ID}-act-1`, title: "QA Sort", teacherTips: ["pub tip"] }] },
          tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] },
        },
        disposableQaFixture: true,
      },
    }, auth);
    ok(res.status === 200, `seed fixture: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;

    const tip1 = `v1-${Date.now().toString(36)}`;
    const tip2 = `v2-${Date.now().toString(36)}`;

    // Draft version 1
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken, expectedUpdatedAt: stamp, saveMode: "enrichment_draft", adminEmail: ADMIN.email,
      lessonPlan: {
        id: FIXTURE_ID,
        enrichmentDraft: {
          activities: { [`${FIXTURE_ID}-act-1`]: { teacherTips: [tip1] } },
          week: { familyConnection: "family draft v1" },
          completionPercent: 40,
        },
      },
    }, auth);
    ok(res.status === 200, "save draft v1");
    stamp = res.json.siteContentUpdatedAt;
    let plan = findPlan(res.json.curriculum, FIXTURE_ID);
    ok(plan.enrichmentDraft?.activities?.[`${FIXTURE_ID}-act-1`]?.teacherTips?.[0] === tip1, "reload tip v1");

    // Draft version 2
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken, expectedUpdatedAt: stamp, saveMode: "enrichment_draft", adminEmail: ADMIN.email,
      lessonPlan: {
        id: FIXTURE_ID,
        enrichmentDraft: {
          activities: { [`${FIXTURE_ID}-act-1`]: { teacherTips: [tip2] } },
          week: { familyConnection: "family draft v2" },
          completionPercent: 55,
        },
      },
    }, auth);
    ok(res.status === 200, "save draft v2");
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_ID);
    ok((plan.enrichmentPublishHistory || []).some((e) => e.kind === "draft"), "history has draft backup");
    ok(plan.enrichmentDraft?.activities?.[`${FIXTURE_ID}-act-1`]?.teacherTips?.[0] === tip2, "current tip v2");

    // Publish fixture
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken, expectedUpdatedAt: stamp, saveMode: "publish_enrichment", publishedBy: ADMIN.email,
      lessonPlan: { id: FIXTURE_ID, enrichmentDraft: plan.enrichmentDraft },
    }, auth);
    ok(res.status === 200, `publish fixture: ${res.status} ${res.json?.error || ""}`);
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_ID);
    const publishedFamily = plan.familyConnection;
    ok(String(publishedFamily || "").includes("family draft v2") || (plan.dailyPlans?.monday?.items || []).some((i) => (i.teacherTips || []).includes(tip2)),
      "publish applied tip2");

    // Another draft then discard
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken, expectedUpdatedAt: stamp, saveMode: "enrichment_draft", adminEmail: ADMIN.email,
      lessonPlan: {
        id: FIXTURE_ID,
        enrichmentDraft: {
          activities: { [`${FIXTURE_ID}-act-1`]: { teacherTips: ["discard-me"] } },
          week: { familyConnection: "discard me family" },
          completionPercent: 60,
        },
      },
    }, auth);
    ok(res.status === 200, "post-publish draft");
    stamp = res.json.siteContentUpdatedAt;

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken, expectedUpdatedAt: stamp, saveMode: "enrichment_draft", adminEmail: ADMIN.email,
      allowEmptyDraftOverwrite: true,
      lessonPlan: { id: FIXTURE_ID, enrichmentDraft: { activities: {}, week: {} } },
    }, auth);
    ok(res.status === 200, `discard draft: ${res.status} ${res.json?.error || ""}`);
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_ID);
    ok(plan.familyConnection === publishedFamily, "published content remains after discard");
    ok(plan.enrichmentDraftUndo?.draft, "undo stash present after discard");

    // Rollback last publish → into draft, published unchanged
    res = await requestJson("POST", "/api/admin/curriculum/enrichment-rollback", {
      adminToken, expectedUpdatedAt: stamp, planId: FIXTURE_ID, publishedBy: ADMIN.email,
    }, auth);
    ok(res.status === 200, `rollback: ${res.status} ${res.json?.error || ""}`);
    ok(res.json.restoredIntoDraft === true || res.json.restoredDraft === true, "rollback restored into draft");
    ok(res.json.customerVisibleUnchanged === true, "customer visible unchanged");
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_ID);
    ok(plan.familyConnection === publishedFamily, "published family unchanged after rollback");
    ok(Boolean(plan.enrichmentDraft), "draft present after rollback");

    // Customer cannot view fixture teaching kit
    const publicTk = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(FIXTURE_ID)}/teaching-kit`);
    ok(
      publicTk.status === 404
      && (publicTk.json?.code === "teaching_kit_disabled" || /not available|not found/i.test(String(publicTk.json?.error || ""))),
      "customers cannot view fixture teaching kit",
    );

    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    ok(store.siteContent?.featureFlags?.teachingKitViewer !== true, "viewer flag off");
    ok(store.siteContent?.featureFlags?.teachingKitPrintCenter !== true, "print flag off");
    ok(store.siteContent?.featureFlags?.teachingKitAttachments !== true, "attachments flag off");
    const plans = store.siteContent?.curriculum?.lessonPlans || [];
    ok(plans.some((p) => p.id === FIXTURE_ID), "disposable fixture present in store");
    const audit = Array.isArray(store.enrichmentEditorAudit) ? store.enrichmentEditorAudit : [];
    ok(audit.length > 0, "recovery audit entries written");
    ok(audit.every((e) => !e.lessonPlanId || e.lessonPlanId === FIXTURE_ID), "audit actions scoped to disposable fixture only");

    console.log(`\nPASS ${passed} assertions (tk-recovery-controls-phase3)`);
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("\nFAIL", error);
  process.exitCode = 1;
});
