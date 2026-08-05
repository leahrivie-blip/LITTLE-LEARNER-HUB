#!/usr/bin/env node
/**
 * Reference-safe enrichment media cleanup regressions (disposable fixtures only).
 *
 * Proves:
 * - Assets referenced by draft history / undo / another lesson / published fields are kept
 * - Genuinely unreferenced disposable assets are deleted
 * - Legacy All About Me–style themes draft-own learningObjectives via backfill
 *   without mutating published plan.objectives text
 *
 * Run: npm run test:teaching-kit-media-ref-safe-cleanup
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const enrichmentMedia = require("../server/enrichment-media.js");
const production = require("./teaching-kit-curriculum-production.js");

const ROOT = path.join(__dirname, "..");
const PORT = 6100 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-ref-safe-${process.pid}.json`);
const ADMIN = {
  email: "tk-ref-safe-admin@example.com",
  password: "tk-ref-safe-pass",
  code: "tk-ref-safe-code",
};

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

function waitForHealth(child, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child.exitCode !== null) return reject(new Error(`server exited ${child.exitCode}`));
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200 && res.json?.ok) return resolve();
      } catch { /* retry */ }
      if (Date.now() - started > timeoutMs) return reject(new Error("health timeout"));
      setTimeout(tick, 150);
    };
    tick();
  });
}

function localAssetExists(assetId) {
  try {
    return Boolean(enrichmentMedia.readLocalEnrichmentAsset(
      enrichmentMedia.localMediaDirFromStorePath(STORE_PATH),
      assetId,
      "full",
    ));
  } catch {
    return false;
  }
}

async function makePngDataUrl(w, h, { r, g, b }) {
  // Minimal 1x1 PNG via sharp if available; otherwise a tiny fixed PNG.
  try {
    const sharp = require("sharp");
    const buf = await sharp({
      create: { width: w, height: h, channels: 3, background: { r, g, b } },
    }).png().toBuffer();
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    const tiny = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    return `data:image/png;base64,${tiny.toString("base64")}`;
  }
}

function testUnitRefCollection() {
  const ids = {
    draft: "tk-enrich-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    undo: "tk-enrich-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    history: "tk-enrich-cccccccccccccccccccccccccccccccc",
    published: "tk-enrich-dddddddddddddddddddddddddddddddd",
    other: "tk-enrich-eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  };
  const curriculum = {
    lessonPlans: [{
      id: "lp-a",
      enrichmentDraft: { activities: { x: { setupMediaAssetId: ids.draft } } },
      enrichmentDraftUndo: { enrichmentDraft: { activities: { x: { setupMediaAssetId: ids.undo } } } },
      enrichmentPublishHistory: [{
        versionId: "v1",
        kind: "draft",
        snapshot: { enrichmentDraft: { activities: { x: { setupMediaAssetId: ids.history } } } },
      }],
      dailyPlans: { monday: { items: [{ setupMediaAssetId: ids.published }] } },
    }, {
      id: "lp-b",
      enrichmentDraft: { activities: { y: { setupMediaAssetId: ids.other } } },
    }],
    activities: [],
  };
  const refs = enrichmentMedia.collectCurriculumEnrichmentMediaRefs(curriculum);
  ok(refs.has(ids.draft), "live draft refs collected");
  ok(refs.has(ids.undo), "undo stash refs collected");
  ok(refs.has(ids.history), "history refs collected");
  ok(refs.has(ids.published), "published dailyPlans refs collected");
  ok(refs.has(ids.other), "other lesson draft refs collected");
  const sourcesUndo = (refs.get(ids.undo) || []).map((h) => h.source);
  ok(sourcesUndo.includes("enrichmentDraftUndo"), "undo source labeled");
}

function testLegacyObjectivesBackfill() {
  const disposable = {
    id: "cur-lp-disposable-all-about-me-style",
    title: "All About Me Disposable QA",
    theme: "All About Me",
    age: "Preschool",
    status: "published",
    plan: "Free",
    objectives: "Children develop self-awareness by naming body parts and sharing favorite things with peers.",
    weeklyOverview: "",
    weeklyMaterials: "mirrors, name cards, crayons",
    familyConnection: "Ask families what children love about themselves.",
    dailyPlans: {
      monday: { items: [{ itemId: "aam-1", title: "Name Song", activityCategory: "Music and Movement" }] },
      tuesday: { items: [{ itemId: "aam-2", title: "Mirror Faces", activityCategory: "Art" }] },
      wednesday: { items: [{ itemId: "aam-3", title: "Body Trace", activityCategory: "Gross Motor" }] },
      thursday: { items: [{ itemId: "aam-4", title: "Feelings Chart", activityCategory: "Social-Emotional" }] },
      friday: { items: [{ itemId: "aam-5", title: "Family Share", activityCategory: "Language" }] },
    },
  };
  const legacyObjectives = disposable.objectives;
  const result = production.upgradeOneLesson(disposable, {
    dryRun: false,
    activityBatchSize: 5,
  });
  ok(result.autoPublished === false, "upgrade never auto-publishes");
  ok(result.enrichmentDraft && typeof result.enrichmentDraft === "object", "enrichment draft returned");
  const coverage = production.kitSectionCoverage(disposable, result.enrichmentDraft);
  ok(coverage.draftOwned.learningObjectives === true, "draft owns learningObjectives after backfill");
  ok(
    String(result.enrichmentDraft?.week?.objectives || "").includes("self-awareness")
      || String(result.enrichmentDraft?.week?.objectives || "").length > 20,
    "draft week.objectives populated",
  );
  ok(disposable.objectives === legacyObjectives, "published plan.objectives text unchanged");
}

async function main() {
  testUnitRefCollection();
  testLegacyObjectivesBackfill();

  try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      LOCAL_JSON_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      LLH_ENFORCE_TK_OWNER_ADMIN: "0",
      NODE_ENV: "test",
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
    ok(login.status === 200 && login.json?.token, `admin login (${login.status})`);
    const adminToken = login.json.token;
    const auth = { Authorization: `Bearer ${adminToken}` };

    let bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    ok(bootstrap.status === 200 && bootstrap.json?.siteContent, "site-content bootstrap");
    const existing = bootstrap.json.siteContent;
    const flagSave = await requestJson("POST", "/api/admin/site-content", {
      adminToken,
      siteContent: {
        ...existing,
        updatedAt: existing.updatedAt,
        featureFlags: {
          ...(existing.featureFlags || {}),
          teachingKitEnrichmentEditor: true,
        },
      },
    }, auth);
    ok(flagSave.status === 200, `enable enrichment editor flag (${flagSave.status})`);
    let stamp = flagSave.json.siteContent?.updatedAt || existing.updatedAt;

    function disposableWeek(prefix, title, category) {
      const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
      const dailyPlans = {};
      days.forEach((day, index) => {
        dailyPlans[day] = {
          items: [{
            itemId: `${prefix}-${index + 1}`,
            title: `${title} ${day}`,
            activityCategory: category,
          }],
        };
      });
      return dailyPlans;
    }
    const planA = {
      id: "cur-lp-tk-ref-safe-a",
      title: "Ref Safe A",
      theme: "Disposable Ref Safe A",
      age: "Preschool",
      status: "published",
      plan: "Pro",
      resourceIds: [],
      dailyPlans: disposableWeek("act-a", "Sort", "Fine Motor"),
    };
    const planB = {
      id: "cur-lp-tk-ref-safe-b",
      title: "Ref Safe B",
      theme: "Disposable Ref Safe B",
      age: "Preschool",
      status: "published",
      plan: "Pro",
      resourceIds: [],
      dailyPlans: disposableWeek("act-b", "Paint", "Art"),
    };
    for (const lessonPlan of [planA, planB]) {
      const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt: stamp,
        lessonPlan,
      }, auth);
      ok(save.status === 200, `seed ${lessonPlan.id} (${save.status})`);
      stamp = save.json.siteContentUpdatedAt || stamp;
    }

    async function upload(planId, activityKey, fileName, color) {
      const fileData = await makePngDataUrl(64, 48, color);
      return requestJson("POST", "/api/admin/curriculum/enrichment-photos/upload", {
        adminToken,
        lessonPlanId: planId,
        activityKey,
        field: "setupImageUrl",
        fileData,
        fileName,
      }, auth);
    }

    const keyA = "act-a-1";
    const keyB = "act-b-1";

    // Orphan upload never attached to any draft → delete succeeds.
    const orphan = await upload(planA.id, keyA, "orphan.png", { r: 10, g: 20, b: 30 });
    ok(orphan.status === 200, `orphan upload (${orphan.status})`);
    ok(localAssetExists(orphan.json.mediaAssetId), "orphan on disk");
    const delOrphan = await requestJson("POST", "/api/admin/curriculum/enrichment-photos/delete", {
      adminToken,
      mediaAssetId: orphan.json.mediaAssetId,
      lessonPlanId: planA.id,
      reason: "ref_safe_orphan",
    }, auth);
    ok(delOrphan.status === 200, `orphan delete status ${delOrphan.status}`);
    ok(!localAssetExists(orphan.json.mediaAssetId), "genuinely unreferenced orphan deleted");

    // Shared across lessons: asset on B must block delete from A's cleanup.
    const shared = await upload(planB.id, keyB, "shared.png", { r: 200, g: 20, b: 20 });
    ok(shared.status === 200, `shared upload (${shared.status})`);
    let save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: planB.id,
        enrichmentDraft: {
          activities: {
            [keyB]: {
              setupImageUrl: shared.json.mediaUrl,
              setupMediaAssetId: shared.json.mediaAssetId,
              teacherTips: ["keep"],
            },
          },
        },
      },
    }, auth);
    ok(save.status === 200, "attach shared to lesson B");
    stamp = save.json.siteContentUpdatedAt || stamp;
    const delShared = await requestJson("POST", "/api/admin/curriculum/enrichment-photos/delete", {
      adminToken,
      mediaAssetId: shared.json.mediaAssetId,
      lessonPlanId: planA.id,
      reason: "ref_safe_other_lesson",
    }, auth);
    ok(delShared.status === 409, "other-lesson draft reference blocks delete");
    ok(localAssetExists(shared.json.mediaAssetId), "shared asset retained");

    // History reference: replace on A keeps prior asset.
    const first = await upload(planA.id, keyA, "first.png", { r: 20, g: 200, b: 20 });
    ok(first.status === 200, "first upload");
    save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: planA.id,
        enrichmentDraft: {
          activities: {
            [keyA]: {
              setupImageUrl: first.json.mediaUrl,
              setupMediaAssetId: first.json.mediaAssetId,
              teacherTips: ["v1"],
            },
          },
        },
      },
    }, auth);
    ok(save.status === 200, "draft v1");
    stamp = save.json.siteContentUpdatedAt || stamp;
    const second = await upload(planA.id, keyA, "second.png", { r: 20, g: 20, b: 200 });
    ok(second.status === 200, "second upload");
    save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: planA.id,
        enrichmentDraft: {
          activities: {
            [keyA]: {
              setupImageUrl: second.json.mediaUrl,
              setupMediaAssetId: second.json.mediaAssetId,
              teacherTips: ["v2"],
            },
          },
        },
      },
    }, auth);
    ok(save.status === 200, "draft v2 replace");
    const firstLog = (save.json.mediaCleanup || []).find((row) => row.assetId === first.json.mediaAssetId);
    ok(firstLog && String(firstLog.result).startsWith("skipped_still_referenced"), "history blocks first asset delete");
    ok(localAssetExists(first.json.mediaAssetId), "version-referenced asset retained on disk");

    console.log(`OK teaching-kit-media-ref-safe-cleanup (${passed} assertions)`);
  } finally {
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-media-ref-safe-cleanup:", error.message || error);
  process.exitCode = 1;
});
