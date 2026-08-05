#!/usr/bin/env node
/**
 * Delayed reference-safe enrichment media cleanup + objectives ownership (disposable only).
 *
 * Proves:
 * - Draft save / replace / discard enqueue candidates; never hard-delete immediately
 * - Grace-period processing reloads authoritative store before delete
 * - Concurrent re-reference cancels candidates
 * - Dry-run deletes nothing
 * - Full outer-library / reusable / history / undo / published ref graph
 * - Legacy objectives stay legacy-owned until explicit edit / accepted suggestion
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
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port.js");

const ROOT = path.join(__dirname, "..");
const PORT = allocateSafeTestPort(6100, 400);
const STORE_PATH = path.join(ROOT, `.tmp-tk-ref-safe-${process.pid}.json`);
const MEDIA_DIR = enrichmentMedia.localMediaDirFromStorePath(STORE_PATH);
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
  return fs.existsSync(path.join(MEDIA_DIR, `${assetId}.full.bin`));
}

async function makePngDataUrl(w, h, { r, g, b }) {
  const sharp = require("sharp");
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r, g, b } },
  }).png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function testUnitRefGraphLocations() {
  const mk = (n) => `tk-enrich-${String(n).padStart(32, "0")}`;
  const ids = {
    draft: mk(1),
    published: mk(2),
    history: mk(3),
    undo: mk(4),
    cover: mk(5),
    setup: mk(6),
    finished: mk(7),
    toolkit: mk(8),
    printable: mk(9),
    book: mk(10),
    song: mk(11),
    attachment: mk(12),
    resource: mk(13),
    reusable: mk(14),
    sharedAct: mk(15),
    calendar: mk(16),
    otherLesson: mk(17),
  };
  const store = {
    siteContent: {
      curriculum: {
        lessonPlans: [{
          id: "lp-a",
          coverImageUrl: `/api/media/enrichment-photos/${ids.cover}`,
          setupImageUrl: `/api/admin/media/enrichment-photos/${ids.setup}`,
          exampleImageUrl: `/api/admin/media/enrichment-photos/${ids.finished}`,
          books: [{ title: "B", mediaAssetId: ids.book }],
          songs: [{ title: "S", mediaAssetId: ids.song }],
          attachments: [{ mediaAssetId: ids.attachment }],
          enrichmentDraft: {
            activities: {
              a1: { setupMediaAssetId: ids.draft, exampleMediaAssetId: ids.finished },
            },
            week: {
              teacherToolkit: { cards: [{ mediaAssetId: ids.toolkit }] },
              printableIdeas: [{ mediaAssetId: ids.printable }],
            },
          },
          enrichmentDraftUndo: { draft: { activities: { a1: { setupMediaAssetId: ids.undo } } } },
          enrichmentPublishHistory: [{
            versionId: "v1",
            snapshot: { enrichmentDraft: { activities: { a1: { setupMediaAssetId: ids.history } } } },
          }],
          dailyPlans: { monday: { items: [{ setupMediaAssetId: ids.published }] } },
        }, {
          id: "lp-b",
          enrichmentDraft: { activities: { b1: { setupMediaAssetId: ids.otherLesson } } },
        }],
        activities: [{
          id: "act-shared",
          lessonPlanId: "lp-a",
          setupMediaAssetId: ids.sharedAct,
        }],
        resources: [{ id: "res-1", mediaAssetId: ids.resource }],
      },
      printables: [{ id: "p1", mediaAssetId: ids.printable }],
      teachingKitAssistant: {
        reusableLibrary: { items: [{ id: "ru-1", mediaAssetId: ids.reusable }] },
      },
      calendarExports: [{ mediaAssetId: ids.calendar }],
    },
  };
  const refs = enrichmentMedia.collectStoreEnrichmentMediaRefs(store);
  Object.entries(ids).forEach(([name, id]) => {
    ok(refs.has(id), `ref graph protects ${name}`);
  });
}

function testUnitDelayedCleanupConcurrency() {
  const orphan = `tk-enrich-${"a".repeat(32)}`;
  const working = { siteContent: { curriculum: { lessonPlans: [], activities: [], resources: [] } } };
  enrichmentMedia.enqueueCleanupCandidate(working, {
    assetId: orphan,
    lessonPlanId: "lp-a",
    sourceOperation: "draft_save",
    reason: "unit_orphan",
    now: new Date(Date.now() - 1000).toISOString(),
  });
  // Concurrent request re-references the asset in authoritative store.
  const authoritative = {
    siteContent: {
      curriculum: {
        lessonPlans: [{
          id: "lp-b",
          enrichmentDraft: { activities: { x: { setupMediaAssetId: orphan } } },
        }],
        activities: [],
        resources: [],
      },
    },
  };
  return enrichmentMedia.processCleanupCandidates({
    workingStore: working,
    authoritativeStore: authoritative,
    now: new Date(),
    mode: "execute",
    graceMs: 0,
    deleteAssetFn: async () => { throw new Error("must not delete"); },
  }).then((result) => {
    const log = result.logs.find((row) => row.assetId === orphan);
    ok(log && String(log.result).startsWith("candidate_canceled"), "concurrent reference cancels candidate");
    ok(working.enrichmentMediaCleanupCandidates[orphan].status === "canceled", "candidate status canceled");
  });
}

function testUnitDryRunNoDelete() {
  const orphan = `tk-enrich-${"b".repeat(32)}`;
  let deleted = false;
  const store = { siteContent: { curriculum: { lessonPlans: [], activities: [], resources: [] } } };
  enrichmentMedia.enqueueCleanupCandidate(store, {
    assetId: orphan,
    sourceOperation: "unit",
    reason: "dry_run",
    now: new Date(Date.now() - 1000).toISOString(),
  });
  return enrichmentMedia.processCleanupCandidates({
    workingStore: store,
    authoritativeStore: store,
    now: new Date(),
    mode: "dry-run",
    graceMs: 0,
    deleteAssetFn: async () => { deleted = true; },
  }).then((result) => {
    ok(result.mode === "dry-run", "process mode dry-run");
    ok(result.logs.some((row) => row.result === "dry_run_would_delete"), "dry-run would delete reported");
    ok(!deleted, "dry-run performs no filesystem delete");
    ok(store.enrichmentMediaCleanupCandidates[orphan].status === "pending", "dry-run leaves candidate retryable");
  });
}

function testObjectivesOwnership() {
  const legacy = "Children develop self-awareness by naming body parts and sharing favorite things with peers.";
  const disposable = {
    id: "cur-lp-disposable-all-about-me-style",
    title: "All About Me Disposable QA",
    theme: "All About Me",
    age: "Preschool",
    status: "published",
    plan: "Free",
    objectives: legacy,
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
  const result = production.upgradeOneLesson(disposable, { dryRun: false, activityBatchSize: 5 });
  ok(disposable.objectives === legacy, "legacy objectives unchanged by production upgrade");
  ok(!result.enrichmentDraft?.week?.fieldOwnership?.objectives, "upgrade does not claim objectives ownership");
  const coverage = production.kitSectionCoverage(disposable, result.enrichmentDraft);
  ok(coverage.learningObjectives === true, "section covered via legacy read-time fallback");
  ok(coverage.objectivesOwnership.draftOwned === false, "objectives remain legacy-owned");
  ok(coverage.objectivesOwnership.effective === legacy, "effective objectives are legacy text");
  ok(production.effectiveObjectives(disposable, result.enrichmentDraft) === legacy, "effectiveObjectives helper");

  const owned = production.markObjectivesDraftOwned({
    ...(result.enrichmentDraft || { week: {}, activities: {} }),
    week: {
      ...(result.enrichmentDraft?.week || {}),
      objectives: "Explicit disposable draft objectives after edit.",
    },
  });
  ok(owned.week.fieldOwnership.objectives === true, "explicit mark sets ownership");
  ok(
    production.effectiveObjectives(disposable, owned) === "Explicit disposable draft objectives after edit.",
    "owned draft value wins after explicit edit",
  );
}

async function main() {
  testUnitRefGraphLocations();
  await testUnitDelayedCleanupConcurrency();
  await testUnitDryRunNoDelete();
  testObjectivesOwnership();

  try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
  try { fs.rmSync(MEDIA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }

  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      // Opt-in execute only for this disposable suite; production default remains dry-run.
      ENRICHMENT_MEDIA_CLEANUP_MODE: "execute",
      ENRICHMENT_MEDIA_CLEANUP_GRACE_MS: "0",
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
    ok(flagSave.status === 200, "enable enrichment editor");
    let stamp = flagSave.json.siteContent?.updatedAt || existing.updatedAt;

    function disposableWeek(prefix, title, category) {
      const dailyPlans = {};
      ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day, index) => {
        dailyPlans[day] = {
          items: [{ itemId: `${prefix}-${index + 1}`, title: `${title} ${day}`, activityCategory: category }],
        };
      });
      return dailyPlans;
    }

    for (const lessonPlan of [{
      id: "cur-lp-tk-ref-safe-a",
      title: "Ref Safe A",
      theme: "Disposable Ref Safe A",
      age: "Preschool",
      status: "published",
      plan: "Pro",
      resourceIds: [],
      dailyPlans: disposableWeek("act-a", "Sort", "Fine Motor"),
    }, {
      id: "cur-lp-tk-ref-safe-b",
      title: "Ref Safe B",
      theme: "Disposable Ref Safe B",
      age: "Preschool",
      status: "published",
      plan: "Pro",
      resourceIds: [],
      dailyPlans: disposableWeek("act-b", "Paint", "Art"),
    }]) {
      const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
        adminToken,
        expectedUpdatedAt: stamp,
        lessonPlan,
      }, auth);
      ok(save.status === 200, `seed ${lessonPlan.id}`);
      stamp = save.json.siteContentUpdatedAt || stamp;
    }

    async function upload(planId, activityKey, fileName, color) {
      return requestJson("POST", "/api/admin/curriculum/enrichment-photos/upload", {
        adminToken,
        lessonPlanId: planId,
        activityKey,
        field: "setupImageUrl",
        fileData: await makePngDataUrl(64, 48, color),
        fileName,
      }, auth);
    }

    async function processCleanup({ dryRun = false, ignoreGrace = true } = {}) {
      return requestJson("POST", "/api/admin/curriculum/enrichment-photos/cleanup-process", {
        adminToken,
        dryRun,
        ignoreGrace,
      }, auth);
    }

    // Orphan → enqueue → process execute deletes
    const orphan = await upload("cur-lp-tk-ref-safe-a", "act-a-1", "orphan.png", { r: 10, g: 20, b: 30 });
    ok(orphan.status === 200, "orphan upload");
    const delOrphan = await requestJson("POST", "/api/admin/curriculum/enrichment-photos/delete", {
      adminToken,
      mediaAssetId: orphan.json.mediaAssetId,
      lessonPlanId: "cur-lp-tk-ref-safe-a",
      reason: "ref_safe_orphan",
      processNow: true,
      ignoreGrace: true,
    }, auth);
    ok(delOrphan.status === 200, `orphan enqueue/process ${delOrphan.status}`);
    ok(!localAssetExists(orphan.json.mediaAssetId), "genuine orphan deleted after delayed process");

    // Dry-run process deletes nothing
    const dryTarget = await upload("cur-lp-tk-ref-safe-a", "act-a-1", "dry.png", { r: 1, g: 2, b: 3 });
    ok(dryTarget.status === 200, "dry-run target upload");
    await requestJson("POST", "/api/admin/curriculum/enrichment-photos/delete", {
      adminToken,
      mediaAssetId: dryTarget.json.mediaAssetId,
      lessonPlanId: "cur-lp-tk-ref-safe-a",
      reason: "dry_run_candidate",
    }, auth);
    const dryProcess = await processCleanup({ dryRun: true, ignoreGrace: true });
    ok(dryProcess.status === 200 && dryProcess.json.mode === "dry-run", "cleanup-process dry-run mode");
    ok(localAssetExists(dryTarget.json.mediaAssetId), "dry-run left file on disk");
    // Finish deleting dry target for cleanliness
    await processCleanup({ dryRun: false, ignoreGrace: true });
    ok(!localAssetExists(dryTarget.json.mediaAssetId), "execute process removes dry-run candidate");

    // Other lesson reference blocks delete
    const shared = await upload("cur-lp-tk-ref-safe-b", "act-b-1", "shared.png", { r: 200, g: 20, b: 20 });
    let save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: "cur-lp-tk-ref-safe-b",
        enrichmentDraft: {
          activities: {
            "act-b-1": {
              setupImageUrl: shared.json.mediaUrl,
              setupMediaAssetId: shared.json.mediaAssetId,
              teacherTips: ["keep"],
            },
          },
        },
      },
    }, auth);
    ok(save.status === 200, "attach shared to B");
    stamp = save.json.siteContentUpdatedAt || stamp;
    const delShared = await requestJson("POST", "/api/admin/curriculum/enrichment-photos/delete", {
      adminToken,
      mediaAssetId: shared.json.mediaAssetId,
      lessonPlanId: "cur-lp-tk-ref-safe-a",
      reason: "ref_safe_other_lesson",
      processNow: true,
      ignoreGrace: true,
    }, auth);
    ok(delShared.status === 409, "other-lesson draft reference blocks enqueue/delete");
    ok(localAssetExists(shared.json.mediaAssetId), "shared asset retained");

    // Replace → enqueue only; history keeps prior asset; process cancels
    const first = await upload("cur-lp-tk-ref-safe-a", "act-a-1", "first.png", { r: 20, g: 200, b: 20 });
    save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: "cur-lp-tk-ref-safe-a",
        enrichmentDraft: {
          activities: {
            "act-a-1": {
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
    const second = await upload("cur-lp-tk-ref-safe-a", "act-a-1", "second.png", { r: 20, g: 20, b: 200 });
    save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: "cur-lp-tk-ref-safe-a",
        enrichmentDraft: {
          activities: {
            "act-a-1": {
              setupImageUrl: second.json.mediaUrl,
              setupMediaAssetId: second.json.mediaAssetId,
              teacherTips: ["v2"],
            },
          },
        },
      },
    }, auth);
    ok(save.status === 200, "draft v2 replace");
    stamp = save.json.siteContentUpdatedAt || stamp;
    const firstLog = (save.json.mediaCleanup || []).find((row) => row.assetId === first.json.mediaAssetId);
    ok(firstLog && firstLog.result === "candidate_enqueued", "replace enqueues candidate (no immediate delete)");
    ok(localAssetExists(first.json.mediaAssetId), "prior asset still on disk after replace save");
    const afterReplace = await processCleanup({ dryRun: false, ignoreGrace: true });
    ok(afterReplace.status === 200, "process after replace");
    const cancelOrSkip = (afterReplace.json.logs || []).find((row) => row.assetId === first.json.mediaAssetId);
    ok(
      cancelOrSkip && (
        String(cancelOrSkip.result).startsWith("candidate_canceled")
        || cancelOrSkip.result === "waiting_grace_period"
      ),
      `history reference cancels/protects first asset (got ${cancelOrSkip?.result})`,
    );
    ok(localAssetExists(first.json.mediaAssetId), "history-referenced asset survives process");

    // Stale-store simulation: enqueue on empty working view, authoritative still refs → cancel
    const raceId = second.json.mediaAssetId;
    const staleWorking = {
      siteContent: { curriculum: { lessonPlans: [], activities: [], resources: [] } },
      enrichmentMediaCleanupCandidates: {},
    };
    enrichmentMedia.enqueueCleanupCandidate(staleWorking, {
      assetId: raceId,
      lessonPlanId: "cur-lp-tk-ref-safe-a",
      sourceOperation: "stale_worker",
      reason: "stale_memory",
      now: new Date(Date.now() - 5000).toISOString(),
    });
    const freshBoot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    const authoritative = { siteContent: freshBoot.json.siteContent };
    const staleResult = await enrichmentMedia.processCleanupCandidates({
      workingStore: staleWorking,
      authoritativeStore: authoritative,
      now: new Date(),
      mode: "execute",
      graceMs: 0,
      deleteAssetFn: async () => { throw new Error("stale worker must not delete"); },
    });
    ok(
      staleResult.logs.some((row) => row.assetId === raceId && String(row.result).startsWith("candidate_canceled")),
      "stale worker refreshes refs from authoritative store and cancels",
    );
    ok(localAssetExists(raceId), "asset survives stale-worker attempt");

    // Unauthorized process blocked
    const unauth = await requestJson("POST", "/api/admin/curriculum/enrichment-photos/cleanup-process", {
      dryRun: true,
    });
    ok(unauth.status === 401 || unauth.status === 403 || unauth.status === 404, `owner auth required (${unauth.status})`);

    console.log(`OK teaching-kit-media-ref-safe-cleanup (${passed} assertions)`);
  } finally {
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(MEDIA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-media-ref-safe-cleanup:", error.message || error);
  process.exitCode = 1;
});
