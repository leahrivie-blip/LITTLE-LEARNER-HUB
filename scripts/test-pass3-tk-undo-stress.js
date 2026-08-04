#!/usr/bin/env node
/**
 * Pass 3 — disposable Teaching Kit undo-discard + draft stress (isolated store only).
 * NEVER uses real production curriculum.
 * Run: npm run test:pass3-tk-undo-stress
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 6100 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-undo-stress-${process.pid}.json`);
const ADMIN = {
  email: "tk-undo-stress-admin@example.com",
  password: "tk-undo-stress-pass",
  code: "tk-undo-stress-code",
};
const FIXTURE_ID = "cur-lp-tk-pass3-undo-stress";

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
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  ok(editorJs.includes("data-enrich-undo-discard"), "editor Undo Discard control present");
  ok(serverJs.includes("enrichmentDraftUndo"), "server undo stash field present");
  ok(serverJs.includes("restoreDiscardedDraft"), "server restoreDiscardedDraft path present");
  ok(serverJs.includes("delete next.enrichmentDraftUndo"), "undo stash stripped from public mapper");

  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: {
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
        teachingKitEnrichmentEditor: true,
      },
      curriculum: {
        lessonPlans: [],
        activities: [],
        resources: [],
        updatedAt: new Date().toISOString(),
      },
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
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    ok(login.status === 200, "admin login");
    const adminToken = login.json.token || login.json.adminToken;
    const auth = { Authorization: `Bearer ${adminToken}` };

    // Seed disposable fixture plan + activity.
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
          teachingKitQualityReview: true,
        },
      },
    }, auth);
    ok(res.status === 200, `flags enabled: ${res.status}`);
    stamp = res.json.siteContent?.updatedAt || res.json.siteContentUpdatedAt || stamp;

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      lessonPlan: {
        id: FIXTURE_ID,
        title: "QA Pass3 Undo Stress Fixture (do not publish to customers)",
        status: "draft",
        ageGroup: "Preschool",
        age: "Preschool",
        theme: "QA Isolation Sorting",
        plan: "Free",
        weeklyOverview: "Disposable QA week for undo/stress.",
        dailyPlans: {
          monday: {
            items: [{
              itemId: "qa-act-1",
              id: "qa-act-1",
              title: "QA Sort Blocks",
              activityCategory: "Cognitive",
              teacherTips: ["published tip"],
            }],
          },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
      },
    }, auth);
    ok(res.status === 200, `seed fixture: ${res.status} ${res.json?.error || ""}`);
    stamp = res.json.siteContentUpdatedAt;

    const tipA = `stress tip A ${Date.now().toString(36)}`;
    const tipB = `stress tip B ${Date.now().toString(36)}`;

    // Rapid successive draft saves — last write wins, no data loss of last tip.
    for (let i = 0; i < 5; i += 1) {
      const tip = i === 4 ? tipA : `rapid-${i}-${tipA}`;
      res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt: stamp,
        saveMode: "enrichment_draft",
        lessonPlan: {
          id: FIXTURE_ID,
          enrichmentDraft: {
            activities: { "qa-act-1": { teacherTips: [tip], materials: [`mat-${i}`] } },
            week: { familyConnection: `family-${i}` },
            completionPercent: 40 + i,
          },
        },
      }, auth);
      ok(res.status === 200, `rapid save ${i + 1}: ${res.status}`);
      stamp = res.json.siteContentUpdatedAt;
    }
    let plan = findPlan(res.json.curriculum, FIXTURE_ID);
    ok(plan?.enrichmentDraft?.activities?.["qa-act-1"]?.teacherTips?.[0] === tipA, "last rapid save tip retained");
    ok(plan?.enrichmentDraft?.week?.familyConnection === "family-4", "last rapid save week retained");
    const draftUpdatedAt = plan?.enrichmentDraft?.updatedAt || "";
    ok(Boolean(draftUpdatedAt), "draft timestamp present after rapid saves");

    // Reload via admin site-content — exact tip survives.
    res = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    plan = findPlan(res.json.siteContent?.curriculum || {}, FIXTURE_ID);
    ok(plan?.enrichmentDraft?.activities?.["qa-act-1"]?.teacherTips?.[0] === tipA, "reload retains tip after rapid saves");
    stamp = res.json.siteContent?.updatedAt;

    // Second edit wave + save + reload.
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: FIXTURE_ID,
        enrichmentDraft: {
          activities: {
            "qa-act-1": { teacherTips: [tipB], materials: ["cups"], steps: ["sort", "count"] },
          },
          week: { familyConnection: "Ask families about sorting at home", circleTimePrompt: "Who sorted today?" },
          completionPercent: 72,
        },
      },
    }, auth);
    ok(res.status === 200, `second wave save: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_ID);
    ok(plan?.enrichmentDraft?.activities?.["qa-act-1"]?.teacherTips?.[0] === tipB, "second wave tip saved");
    ok(plan?.enrichmentDraft?.week?.circleTimePrompt === "Who sorted today?", "second wave week field saved");

    // Discard → undo stash present → undo restores exact tipB.
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      allowEmptyDraftOverwrite: true,
      lessonPlan: {
        id: FIXTURE_ID,
        enrichmentDraft: { activities: {}, week: {}, completionPercent: 0, previewReady: false },
      },
    }, auth);
    ok(res.status === 200, `discard: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_ID);
    ok(!plan?.enrichmentDraft?.activities?.["qa-act-1"]?.teacherTips?.length, "draft cleared after discard");
    ok(plan?.enrichmentDraftUndo?.draft?.activities?.["qa-act-1"]?.teacherTips?.[0] === tipB, "undo stash holds discarded tip");
    ok(((plan?.dailyPlans?.monday?.items || [])[0]?.teacherTips || [])[0] === "published tip", "published tip intact after discard");

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      restoreDiscardedDraft: true,
      lessonPlan: { id: FIXTURE_ID },
    }, auth);
    ok(res.status === 200, `undo discard: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_ID);
    ok(plan?.enrichmentDraft?.activities?.["qa-act-1"]?.teacherTips?.[0] === tipB, "undo restored tipB exactly");
    ok(plan?.enrichmentDraft?.week?.familyConnection === "Ask families about sorting at home", "undo restored week family");
    ok(!plan?.enrichmentDraftUndo?.draft, "undo stash cleared after restore");

    // Publish fixture (owner override allowed for disposable QA only), confirm TK flags stay off.
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "publish_enrichment",
      publishedBy: "qa-pass3-undo-stress",
      lessonPlan: {
        id: FIXTURE_ID,
        enrichmentDraft: plan.enrichmentDraft,
      },
    }, auth);
    if (res.status === 409 && res.json?.code === "quality_review_blocked") {
      res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt: stamp,
        saveMode: "publish_enrichment",
        publishedBy: "qa-pass3-undo-stress",
        ownerPublishOverride: {
          confirmed: true,
          reason: "QA disposable Pass3 undo/stress publish only.",
        },
        lessonPlan: {
          id: FIXTURE_ID,
          enrichmentDraft: plan.enrichmentDraft,
        },
      }, auth);
    }
    ok(res.status === 200 && res.json?.ok, `publish fixture: ${res.status} ${res.json?.code || res.json?.error || ""}`);
    stamp = res.json.siteContentUpdatedAt || stamp;
    plan = findPlan(res.json.curriculum || {}, FIXTURE_ID) || plan;
    const publishedTip = ((plan?.dailyPlans?.monday?.items || [])[0]?.teacherTips || [])[0] || "";
    ok(String(publishedTip).includes(tipB), `published tip includes tipB (got "${publishedTip}")`);
    ok((plan.enrichmentPublishHistory || []).length >= 1, "publish history retained");

    const flagsRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    const flags = flagsRes.json.siteContent?.featureFlags || {};
    ok(flags.teachingKitViewer === false, "teachingKitViewer off");
    ok(flags.teachingKitPrintCenter === false, "teachingKitPrintCenter off");
    ok(flags.teachingKitAttachments === false, "teachingKitAttachments off");

    const publicTk = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(FIXTURE_ID)}/teaching-kit`);
    ok(
      publicTk.status === 404
        || publicTk.json?.code === "teaching_kit_disabled"
        || publicTk.json?.error
        || publicTk.json?.featureFlags?.teachingKitViewer !== true,
      `customer TK still disabled (${publicTk.status})`,
    );
    ok(!JSON.stringify(publicTk.json || {}).includes("enrichmentDraftUndo"), "customer payload has no undo stash");

    // Cleanup fixture
    const curriculum = flagsRes.json.siteContent?.curriculum || {};
    const cleaned = (curriculum.lessonPlans || []).filter((p) => p.id !== FIXTURE_ID);
    const cleanActs = (curriculum.activities || []).filter((a) => a.lessonPlanId !== FIXTURE_ID);
    const clean = await requestJson("POST", "/api/admin/site-content", {
      adminToken,
      expectedUpdatedAt: flagsRes.json.siteContent?.updatedAt,
      siteContent: {
        ...flagsRes.json.siteContent,
        curriculum: { ...curriculum, lessonPlans: cleaned, activities: cleanActs },
      },
    }, auth);
    ok(clean.status === 200, `cleanup: ${clean.status}`);

    console.log(`PASS pass3 tk undo/stress (${passed} asserts)`);
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL pass3 tk undo/stress:", error.message || error);
  process.exit(1);
});
