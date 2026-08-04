#!/usr/bin/env node
/**
 * Teaching Kit Enrichment — editor navigation + recovery (isolated fixtures only).
 *
 * Proves:
 * 1) Editor chrome exposes Back to List, Close, Cancel, Recovery
 * 2) Escape closes overlays then the editor (source markers)
 * 3) Discard Draft clears fixture enrichment draft via allowEmptyDraftOverwrite
 * 4) Publish → Rollback Last Publish restores prior published snapshot on fixture
 * 5) Version restore by versionId works on fixture
 * 6) Customer Teaching Kit flags remain off
 *
 * NEVER touches production curriculum.
 *
 * Run: npm run test:teaching-kit-editor-nav-recovery
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 5900 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-nav-recovery-${process.pid}.json`);
const ADMIN = {
  email: "tk-nav-recovery-admin@example.com",
  password: "tk-nav-recovery-pass",
  code: "tk-nav-recovery-code",
};
const FIXTURE_PLAN_ID = "cur-lp-tk-nav-recovery-fixture";

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
}

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
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
  throw new Error("Timed out waiting for server health");
}

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  ok(res.status === 200 && (res.json?.token || res.json?.adminToken), "admin login");
  return res.json.token || res.json.adminToken;
}

async function setFlags(adminToken, flags) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  ok(bootstrap.status === 200, "site-content bootstrap");
  const existing = bootstrap.json.siteContent || {};
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken,
    expectedUpdatedAt: existing.updatedAt,
    siteContent: {
      ...existing,
      updatedAt: existing.updatedAt,
      featureFlags: {
        ...(existing.featureFlags || {}),
        ...flags,
      },
    },
  }, { Authorization: `Bearer ${adminToken}` });
  ok(save.status === 200, `flags saved: ${save.status}`);
  const after = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  return after.json.siteContent?.updatedAt || after.json.updatedAt || "";
}

function findPlan(curriculum, id) {
  return (curriculum?.lessonPlans || []).find((p) => p.id === id) || null;
}

function fixturePlan() {
  return {
    id: FIXTURE_PLAN_ID,
    title: "QA Nav Recovery Fixture (do not publish to customers)",
    status: "draft",
    ageGroup: "Preschool",
    theme: "QA Isolation",
    familyConnection: "Published family note for QA compare.",
    dailyPlans: {
      monday: {
        items: [{
          itemId: "qa-nav-act-1",
          title: "QA Nav Sorting",
          activityCategory: "Cognitive",
          teacherTips: ["Published tip before upgrade (QA)."],
        }],
      },
      tuesday: { items: [{ itemId: "qa-nav-act-2", title: "QA Nav Circles", activityCategory: "Art" }] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
  };
}

async function main() {
  try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }

  const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");

  ok(editorJs.includes('data-enrich-back-to-list'), "Back to List control present");
  ok(editorJs.includes('data-enrich-close'), "Close control present");
  ok(editorJs.includes('data-enrich-cancel'), "Cancel control present");
  ok(editorJs.includes('data-enrich-recovery'), "Recovery control present");
  ok(editorJs.includes("function renderRecoveryModal"), "recovery modal renderer present");
  ok(editorJs.includes("abandonUnsaved"), "Cancel abandon path present");
  ok(editorJs.includes("onBeforeUnload"), "beforeunload guard present");
  ok(editorJs.includes("state.recoveryOpen"), "recovery state present");
  ok(editorJs.includes("data-enrich-compare-toggle"), "compare toggle present");
  ok(editorJs.includes("data-enrich-discard-draft"), "discard draft control present");
  ok(editorJs.includes("data-enrich-restore-version"), "restore version control present");
  ok(editorJs.includes("allowEmptyDraftOverwrite"), "discard uses allowEmptyDraftOverwrite");
  ok(/Escape[\s\S]*void close\(\)/.test(editorJs) || editorJs.includes("void close();\n        return;"),
    "Escape can leave editor after overlays");
  ok(stylesCss.includes("tk-enrich-publish-actions"), "sticky publish/recovery actions CSS");
  ok(stylesCss.includes("left: min(16.5rem, 28vw)"), "editor leaves admin sidebar room");
  ok(serverJs.includes("Explicit discard: empty incoming"), "server empty discard path");
  console.log("PASS static nav/recovery markers");

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      NODE_ENV: "test",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    let stamp = await setFlags(adminToken, {
      teachingKitViewer: false,
      teachingKitPrintCenter: false,
      teachingKitAttachments: false,
      teachingKitEnrichmentEditor: true,
    });
    const auth = { Authorization: `Bearer ${adminToken}` };

    const seed = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      lessonPlan: fixturePlan(),
    }, auth);
    ok(seed.status === 200, `seed fixture: ${seed.status}`);
    stamp = seed.json.siteContentUpdatedAt;

    const tip1 = "QA draft tip for nav recovery fixture — first publish.";
    let res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: FIXTURE_PLAN_ID,
        enrichmentDraft: {
          activities: { "qa-nav-act-1": { teacherTips: [tip1] } },
          week: { familyConnection: "QA family draft A" },
        },
      },
    }, auth);
    ok(res.status === 200, `draft save A: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "publish_enrichment",
      publishedBy: "qa-nav-recovery",
      lessonPlan: {
        id: FIXTURE_PLAN_ID,
        enrichmentDraft: {
          activities: { "qa-nav-act-1": { teacherTips: [tip1] } },
          week: { familyConnection: "QA family draft A" },
        },
      },
    }, auth);
    ok(res.status === 200 && res.json?.ok, `publish A: ${res.status} ${res.json?.code || ""}`);
    stamp = res.json.siteContentUpdatedAt;
    let plan = findPlan(res.json.curriculum, FIXTURE_PLAN_ID);
    const versionA = plan?.teachingKit?.lastEnrichmentVersionId
      || plan?.enrichmentPublishHistory?.[0]?.versionId
      || "";
    ok(versionA, "publish A created version id");
    ok(!plan?.enrichmentDraft || !Object.keys(plan.enrichmentDraft.activities || {}).length,
      "draft cleared after publish A");
    ok((plan?.dailyPlans?.monday?.items || [])[0]?.teacherTips?.[0] === tip1, "publish A merged tip1");

    const tip2 = "QA draft tip for nav recovery fixture — second publish.";
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: FIXTURE_PLAN_ID,
        enrichmentDraft: {
          activities: { "qa-nav-act-1": { teacherTips: [tip2] } },
          week: { familyConnection: "QA family draft B" },
        },
      },
    }, auth);
    ok(res.status === 200, `draft save B: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "publish_enrichment",
      publishedBy: "qa-nav-recovery",
      lessonPlan: {
        id: FIXTURE_PLAN_ID,
        enrichmentDraft: {
          activities: { "qa-nav-act-1": { teacherTips: [tip2] } },
          week: { familyConnection: "QA family draft B" },
        },
      },
    }, auth);
    ok(res.status === 200 && res.json?.ok, `publish B: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_PLAN_ID);
    ok((plan.enrichmentPublishHistory || []).length >= 1, "publish history retained");
    ok((plan?.dailyPlans?.monday?.items || [])[0]?.teacherTips?.[0] === tip2, "publish B merged tip2");

    // Discard a new draft (not publish)
    const tipDiscard = "QA tip that must be discarded.";
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: FIXTURE_PLAN_ID,
        enrichmentDraft: {
          activities: { "qa-nav-act-1": { teacherTips: [tipDiscard] } },
          week: { familyConnection: "QA discard me" },
        },
      },
    }, auth);
    ok(res.status === 200, `draft before discard: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_PLAN_ID);
    ok(plan?.enrichmentDraft?.activities?.["qa-nav-act-1"]?.teacherTips?.[0] === tipDiscard, "discard target tip present");

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      allowEmptyDraftOverwrite: true,
      lessonPlan: {
        id: FIXTURE_PLAN_ID,
        enrichmentDraft: { activities: {}, week: {}, completionPercent: 0, previewReady: false },
      },
    }, auth);
    ok(res.status === 200, `discard draft: ${res.status} ${res.json?.code || ""}`);
    stamp = res.json.siteContentUpdatedAt;
    plan = findPlan(res.json.curriculum, FIXTURE_PLAN_ID);
    const discardedActs = Object.keys(plan?.enrichmentDraft?.activities || {});
    const discardedFamily = plan?.enrichmentDraft?.week?.familyConnection || "";
    ok(discardedActs.length === 0, `draft activities cleared after discard (got ${discardedActs.join(",")})`);
    ok(!discardedFamily, `draft family cleared after discard (got "${discardedFamily}")`);
    ok((plan?.dailyPlans?.monday?.items || [])[0]?.teacherTips?.[0] === tip2, "discard left published tip2 intact");

    // Rollback last publish on fixture → restores tip1 snapshot taken before publish B
    res = await requestJson("POST", "/api/admin/curriculum/enrichment-rollback", {
      planId: FIXTURE_PLAN_ID,
      publishedBy: "qa-nav-recovery",
    }, auth);
    ok(res.status === 200 && res.json?.ok, `rollback last: ${res.status} ${res.json?.error || ""}`);
    stamp = res.json.siteContentUpdatedAt || stamp;
    plan = findPlan(res.json.curriculum, FIXTURE_PLAN_ID);
    const tipAfterRollback = (plan?.dailyPlans?.monday?.items || [])[0]?.teacherTips?.[0] || "";
    ok(tipAfterRollback === tip1, `rollback restored tip1 (got "${tipAfterRollback}")`);

    // Restore specific version if history still has snapshots
    const history = plan?.enrichmentPublishHistory || [];
    const restoreTarget = history.find((entry) => entry.versionId && entry.snapshot) || null;
    if (restoreTarget) {
      res = await requestJson("POST", "/api/admin/curriculum/enrichment-rollback", {
        planId: FIXTURE_PLAN_ID,
        versionId: restoreTarget.versionId,
        publishedBy: "qa-nav-recovery",
      }, auth);
      ok(res.status === 200 && res.json?.ok, `restore version ${restoreTarget.versionId}: ${res.status}`);
      ok(res.json.restoredFromVersionId === restoreTarget.versionId
        || res.json.restoredFromVersionId,
        "restore reports version id");
    } else {
      ok(false, "expected history entry for version restore");
    }

    // Customer flags still off
    const flagsRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    const flags = flagsRes.json.siteContent?.featureFlags || {};
    ok(flags.teachingKitViewer === false, "teachingKitViewer off");
    ok(flags.teachingKitPrintCenter === false, "teachingKitPrintCenter off");
    ok(flags.teachingKitAttachments === false, "teachingKitAttachments off");

    // Cleanup fixture from temp store
    const cleanupStamp = flagsRes.json.siteContent?.updatedAt || stamp;
    const curriculum = flagsRes.json.siteContent?.curriculum || {};
    const cleanedPlans = (curriculum.lessonPlans || []).filter((p) => p.id !== FIXTURE_PLAN_ID);
    const clean = await requestJson("POST", "/api/admin/site-content", {
      adminToken,
      expectedUpdatedAt: cleanupStamp,
      siteContent: {
        ...flagsRes.json.siteContent,
        curriculum: { ...curriculum, lessonPlans: cleanedPlans },
      },
    }, auth);
    ok(clean.status === 200, `cleanup fixture: ${clean.status}`);

    console.log(`PASS teaching-kit editor nav/recovery (${passed} assertions)`);
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
    if (stderr && /error/i.test(stderr)) {
      console.error(stderr.slice(-2000));
    }
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit editor nav/recovery:", error.message || error);
  process.exit(1);
});
