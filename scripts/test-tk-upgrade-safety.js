#!/usr/bin/env node
/**
 * Teaching Kit upgrade-safety protections (isolated store only).
 * NEVER uses real production curriculum.
 * Run: npm run test:tk-upgrade-safety
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 6200 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-upgrade-safety-${process.pid}.json`);
const ADMIN = {
  email: "tk-upgrade-safety-admin@example.com",
  password: "tk-upgrade-safety-pass",
  code: "tk-upgrade-safety-code",
};
const FIXTURE_A = "cur-lp-tk-upgrade-safety-a";
const FIXTURE_B = "cur-lp-tk-upgrade-safety-b";

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

function readStoreFile() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

async function main() {
  const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const freezeDoc = fs.readFileSync(path.join(ROOT, "docs/teaching-kit/ARCHITECTURE_FREEZE.md"), "utf8");

  ok(freezeDoc.includes("Do not redesign"), "architecture freeze doc present");
  ok(serverJs.includes("ENRICHMENT_HISTORY_LIMIT = 250"), "history limit raised for upgrade campaigns");
  ok(serverJs.includes("appendEnrichmentEditorAudit"), "enrichment editor audit helper present");
  ok(serverJs.includes('kind: "draft"'), "draft history kind written on save");
  ok(editorJs.includes("Another admin updated curriculum"), "editor concurrent-edit warning present");
  ok(editorJs.includes("data-enrich-history-diff"), "exact change diff control present");
  ok(editorJs.includes("expectedUpdatedAt"), "editor passes concurrency stamp on restore paths");
  ok(editorJs.includes("Restore This Draft"), "draft snapshot restore control present");

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
    ok(res.status === 200, `flags set: ${res.status}`);
    stamp = res.json.siteContent?.updatedAt || res.json.siteContentUpdatedAt || stamp;

    async function seedPlan(id, title, tip) {
      const seed = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt: stamp,
        lessonPlan: {
          id,
          title,
          status: "draft",
          ageGroup: "Preschool",
          age: "Preschool",
          theme: "QA Isolation Sorting",
          plan: "Free",
          weeklyOverview: "Disposable QA week for upgrade safety.",
          familyConnection: `family-base-${id}`,
          dailyPlans: {
            monday: {
              items: [{
                itemId: `${id}-act-1`,
                id: `${id}-act-1`,
                title: "QA Sort Blocks",
                activityCategory: "Cognitive",
                teacherTips: [tip],
              }],
            },
            tuesday: { items: [] },
            wednesday: { items: [] },
            thursday: { items: [] },
            friday: { items: [] },
          },
        },
      }, auth);
      ok(seed.status === 200, `seed ${id}: ${seed.status} ${seed.json?.error || ""}`);
      stamp = seed.json.siteContentUpdatedAt || stamp;
      return seed;
    }

    await seedPlan(FIXTURE_A, "QA Upgrade Safety Fixture A", "published tip A");
    await seedPlan(FIXTURE_B, "QA Upgrade Safety Fixture B", "published tip B");

    // --- Draft saves create version history ---
    const tip1 = `draft-tip-1-${Date.now().toString(36)}`;
    const tip2 = `draft-tip-2-${Date.now().toString(36)}`;
    const tip3 = `draft-tip-3-${Date.now().toString(36)}`;

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      adminEmail: ADMIN.email,
      lessonPlan: {
        id: FIXTURE_A,
        enrichmentDraft: {
          activities: { [`${FIXTURE_A}-act-1`]: { teacherTips: [tip1], materials: ["cups"] } },
          week: { familyConnection: "Family draft 1" },
          completionPercent: 40,
        },
      },
    }, auth);
    ok(res.status === 200, `draft save 1: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    let planA = findPlan(res.json.curriculum, FIXTURE_A);
    ok(planA?.enrichmentDraft?.activities?.[`${FIXTURE_A}-act-1`]?.teacherTips?.[0] === tip1, "draft 1 tip saved");
    ok((planA?.enrichmentPublishHistory || []).length === 0, "first draft save has no prior draft to snapshot");

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      adminEmail: ADMIN.email,
      lessonPlan: {
        id: FIXTURE_A,
        enrichmentDraft: {
          activities: { [`${FIXTURE_A}-act-1`]: { teacherTips: [tip2], materials: ["bowls"] } },
          week: { familyConnection: "Family draft 2" },
          completionPercent: 50,
        },
      },
    }, auth);
    ok(res.status === 200, `draft save 2: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    planA = findPlan(res.json.curriculum, FIXTURE_A);
    const hist = planA?.enrichmentPublishHistory || [];
    ok(hist.length >= 1, "automatic draft history created before second save");
    ok(hist[0].kind === "draft", "history entry kind is draft");
    ok(hist[0].snapshot?.enrichmentDraft?.activities?.[`${FIXTURE_A}-act-1`]?.teacherTips?.[0] === tip1, "draft history snapshot holds previous tip");
    ok(planA.enrichmentDraft?.activities?.[`${FIXTURE_A}-act-1`]?.teacherTips?.[0] === tip2, "current draft is tip2");

    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      adminEmail: ADMIN.email,
      lessonPlan: {
        id: FIXTURE_A,
        enrichmentDraft: {
          activities: { [`${FIXTURE_A}-act-1`]: { teacherTips: [tip3], materials: ["plates"] } },
          week: { familyConnection: "Family draft 3" },
          completionPercent: 60,
        },
      },
    }, auth);
    ok(res.status === 200, `draft save 3: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;
    planA = findPlan(res.json.curriculum, FIXTURE_A);
    ok((planA.enrichmentPublishHistory || []).length >= 2, "multiple draft versions retained");
    const draftVersionId = planA.enrichmentPublishHistory.find((e) => e.kind === "draft"
      && e.snapshot?.enrichmentDraft?.activities?.[`${FIXTURE_A}-act-1`]?.teacherTips?.[0] === tip1)?.versionId;
    ok(Boolean(draftVersionId), "can locate tip1 draft version for restore");

    // --- Restore draft snapshot ---
    res = await requestJson("POST", "/api/admin/curriculum/enrichment-rollback", {
      adminToken,
      expectedUpdatedAt: stamp,
      planId: FIXTURE_A,
      versionId: draftVersionId,
      publishedBy: ADMIN.email,
    }, auth);
    ok(res.status === 200, `restore draft: ${res.status} ${res.json?.error || ""}`);
    ok(res.json.restoredDraft === true, "restore marked as draft restore");
    stamp = res.json.siteContentUpdatedAt;
    planA = findPlan(res.json.curriculum, FIXTURE_A);
    ok(planA.enrichmentDraft?.activities?.[`${FIXTURE_A}-act-1`]?.teacherTips?.[0] === tip1, "draft restore recovered tip1");
    ok(planA.enrichmentPublishHistory?.[0]?.kind === "rollback", "rollback checkpoint prepended");
    ok(planA.enrichmentPublishHistory?.[0]?.rollbackOf === draftVersionId, "rollbackOf points at restored version");

    // Sibling lesson untouched after draft restore on A
    let planB = findPlan(res.json.curriculum, FIXTURE_B);
    ok(planB?.familyConnection === `family-base-${FIXTURE_B}`, "sibling lesson unaffected by restore on A");
    ok(!planB?.enrichmentDraft || !Object.keys(planB.enrichmentDraft?.activities || {}).length, "sibling has no draft contamination");

    // --- Concurrency: stale expectedUpdatedAt on rollback ---
    res = await requestJson("POST", "/api/admin/curriculum/enrichment-rollback", {
      adminToken,
      expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
      planId: FIXTURE_A,
      versionId: draftVersionId,
      publishedBy: ADMIN.email,
    }, auth);
    ok(res.status === 409, "stale expectedUpdatedAt rejected on restore");
    ok(res.json.conflict === true || Boolean(res.json.curriculum), "conflict payload returned");

    // --- Publish backup + restore publish ---
    // Re-save a draft then publish
    stampRes = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    stamp = stampRes.json.siteContent?.updatedAt;
    const publishTip = `publish-tip-${Date.now().toString(36)}`;
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      adminEmail: ADMIN.email,
      lessonPlan: {
        id: FIXTURE_A,
        enrichmentDraft: {
          activities: { [`${FIXTURE_A}-act-1`]: { teacherTips: [publishTip] } },
          week: { familyConnection: "Family after publish draft" },
          completionPercent: 70,
          lastEditedBy: ADMIN.email,
        },
      },
    }, auth);
    ok(res.status === 200, `pre-publish draft: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;

    const familyBeforePublish = findPlan(res.json.curriculum, FIXTURE_A)?.familyConnection;
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "publish_enrichment",
      publishedBy: ADMIN.email,
      lessonPlan: {
        id: FIXTURE_A,
        enrichmentDraft: findPlan(res.json.curriculum, FIXTURE_A).enrichmentDraft,
      },
    }, auth);
    ok(res.status === 200, `publish enrichment: ${res.status} ${res.json?.error || ""}`);
    ok(res.json.priorVersionAvailable === true || Boolean(res.json.versionId), "publish returns version metadata");
    stamp = res.json.siteContentUpdatedAt;
    planA = findPlan(res.json.curriculum, FIXTURE_A);
    const publishHist = (planA.enrichmentPublishHistory || []).filter((e) => e.kind === "publish");
    ok(publishHist.length >= 1, "automatic publish backup retained");
    ok(publishHist[0].snapshot?.familyConnection === familyBeforePublish
      || publishHist.some((e) => e.snapshot?.familyConnection === familyBeforePublish),
    "publish backup snapshot holds prior family connection");
    ok(String(planA.familyConnection || "").includes("Family after publish")
      || (planA.dailyPlans?.monday?.items || []).some((item) => (item.teacherTips || []).includes(publishTip)),
    "publish applied enrichment to lesson A");

    const publishVersionId = publishHist[0].versionId;
    const familyInBackup = publishHist[0].snapshot?.familyConnection;

    // Change again then restore publish backup
    res = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      adminEmail: ADMIN.email,
      lessonPlan: {
        id: FIXTURE_A,
        enrichmentDraft: {
          activities: { [`${FIXTURE_A}-act-1`]: { teacherTips: ["post-publish draft tip"] } },
          week: { familyConnection: "Should clear on publish restore" },
          completionPercent: 80,
          lastEditedBy: ADMIN.email,
        },
      },
    }, auth);
    ok(res.status === 200, `post-publish draft: ${res.status}`);
    stamp = res.json.siteContentUpdatedAt;

    res = await requestJson("POST", "/api/admin/curriculum/enrichment-rollback", {
      adminToken,
      expectedUpdatedAt: stamp,
      planId: FIXTURE_A,
      versionId: publishVersionId,
      publishedBy: ADMIN.email,
    }, auth);
    ok(res.status === 200, `restore publish: ${res.status} ${res.json?.error || ""}`);
    ok(res.json.restoredDraft !== true, "publish restore is not draft-only");
    stamp = res.json.siteContentUpdatedAt;
    planA = findPlan(res.json.curriculum, FIXTURE_A);
    ok(planA.familyConnection === familyInBackup, "publish restore recovered family from backup");
    ok(!planA.enrichmentDraft || !enrichmentDraftHasContent(planA.enrichmentDraft), "publish restore cleared draft");

    planB = findPlan(res.json.curriculum, FIXTURE_B);
    ok(planB?.familyConnection === `family-base-${FIXTURE_B}`, "sibling still untouched after publish restore");
    const tipB = (planB?.dailyPlans?.monday?.items || [])[0]?.teacherTips?.[0];
    ok(tipB === "published tip B", "sibling published tip unchanged");

    // --- Audit log ---
    const store = readStoreFile();
    const audit = Array.isArray(store.enrichmentEditorAudit) ? store.enrichmentEditorAudit : [];
    ok(audit.length >= 4, `audit trail has entries (${audit.length})`);
    const actions = new Set(audit.map((e) => e.action));
    ok(actions.has("save_draft"), "audit includes save_draft");
    ok(actions.has("publish"), "audit includes publish");
    ok(actions.has("restore_draft"), "audit includes restore_draft");
    ok(actions.has("restore_publish"), "audit includes restore_publish");
    ok(audit.every((e) => e.createdAt && e.adminEmail), "audit entries have timestamp and user");
    ok(audit.every((e) => !e.lessonPlanId || e.lessonPlanId === FIXTURE_A || e.lessonPlanId === FIXTURE_B),
      "audit lesson ids stay within fixtures");

    // Customer flags remain off in store
    ok(store.siteContent?.featureFlags?.teachingKitViewer !== true, "customer viewer flag still off");
    ok(store.siteContent?.featureFlags?.teachingKitPrintCenter !== true, "print center flag still off");
    ok(store.siteContent?.featureFlags?.teachingKitAttachments !== true, "attachments flag still off");

    console.log(`\nPASS ${passed} assertions (tk-upgrade-safety)`);
  } finally {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

function enrichmentDraftHasContent(draft) {
  if (!draft || typeof draft !== "object") return false;
  const acts = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
  if (Object.keys(acts).length) return true;
  const week = draft.week && typeof draft.week === "object" ? draft.week : {};
  return Object.values(week).some((v) => String(v || "").trim());
}

main().catch((error) => {
  console.error("\nFAIL", error);
  process.exitCode = 1;
});
