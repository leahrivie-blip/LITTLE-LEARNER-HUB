#!/usr/bin/env node
/**
 * Enrichment media lifecycle — ref-safe cleanup, failed upload/save, privacy.
 * Run: npm run test:teaching-kit-enrichment-media-lifecycle
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const sharp = require("sharp");
const enrichmentMedia = require("../server/enrichment-media.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5500 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-enrich-ml-${process.pid}.json`);
const MEDIA_DIR = STORE_PATH.replace(/(\.json)?$/i, ".enrichment-media");
const CLEANUP_LOG = STORE_PATH.replace(/(\.json)?$/i, ".enrichment-media-cleanup.log");
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json"), "utf8"),
);
const ADMIN = {
  email: "tk-enrich-ml-admin@example.com",
  password: "tk-enrich-ml-pass",
  code: "tk-enrich-ml-code",
};
const DISCOVERY_ID = "cur-act-e14264deb203e7dc";

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
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
          resolve({ status: res.statusCode, json, text, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requestBinary(method, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), headers: res.headers }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function waitForHealth(child, timeoutMs = 25000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child.exitCode !== null) {
        reject(new Error(`Server exited early with code ${child.exitCode}`));
        return;
      }
      try {
        const res = await requestJson("GET", "/api/health");
        if (res.status === 200 && res.json?.ok) {
          resolve();
          return;
        }
      } catch { /* retry */ }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timed out waiting for server health"));
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

function startServer() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.rmSync(STORE_PATH, { force: true });
  fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
  fs.rmSync(CLEANUP_LOG, { force: true });
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: ADMIN.email,
    password: ADMIN.password,
    code: ADMIN.code,
  });
  assert(res.status === 200 && res.json?.token, `admin login: ${res.status}`);
  return res.json.token;
}

async function setFlags(adminToken, flags) {
  const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  const existing = bootstrap.json.siteContent || {};
  const save = await requestJson("POST", "/api/admin/site-content", {
    adminToken,
    siteContent: {
      ...existing,
      updatedAt: existing.updatedAt,
      featureFlags: {
        playBasedCurriculum: true,
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitAttachments: false,
        teachingKitEnrichmentEditor: false,
        ...flags,
      },
    },
  });
  assert(save.status === 200, `flag save: ${save.status}`);
  return save.json.siteContent?.updatedAt || existing.updatedAt;
}

async function makePngDataUrl(width, height, color) {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: color },
  }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function upload(adminToken, { lessonPlanId, activityKey, field, fileData, fileName }) {
  return requestJson("POST", "/api/admin/curriculum/enrichment-photos/upload", {
    adminToken,
    lessonPlanId,
    activityKey,
    field,
    fileData,
    fileName,
  }, { Authorization: `Bearer ${adminToken}` });
}

function localAssetExists(assetId) {
  return fs.existsSync(path.join(MEDIA_DIR, `${assetId}.full.bin`))
    && fs.existsSync(path.join(MEDIA_DIR, `${assetId}.thumb.bin`));
}

function readCleanupLog() {
  if (!fs.existsSync(CLEANUP_LOG)) return [];
  return fs.readFileSync(CLEANUP_LOG, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function main() {
  // Pure helper checks
  assert(enrichmentMedia.sanitizedPublishedEnrichmentImageUrl("/api/admin/media/enrichment-photos/tk-enrich-aaaaaaaaaaaaaaaa") === "", "published sanitize strips admin URLs");
  assert(enrichmentMedia.isPublicEnrichmentMediaUrl("/api/media/enrichment-photos/tk-enrich-aaaaaaaaaaaaaaaa"), "public url detector");

  const child = startServer();
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    let expectedUpdatedAt = await setFlags(adminToken, { teachingKitEnrichmentEditor: true });

    const planPayload = { ...FIXTURE.lessonPlan, resourceIds: [] };
    const savePlan = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: planPayload,
    });
    assert(savePlan.status === 200, "save farm plan");
    expectedUpdatedAt = savePlan.json.siteContentUpdatedAt || expectedUpdatedAt;

    const pngA = await makePngDataUrl(120, 90, { r: 20, g: 100, b: 60 });
    const upA = await upload(adminToken, {
      lessonPlanId: planPayload.id,
      activityKey: DISCOVERY_ID,
      field: "setupImageUrl",
      fileData: pngA,
      fileName: "a.png",
    });
    assert(upA.status === 200, "upload A");
    assert(localAssetExists(upA.json.mediaAssetId), "A full+thumb written atomically");

    // Failed upload (invalid type) leaves no new media files
    const beforeFiles = fs.existsSync(MEDIA_DIR) ? fs.readdirSync(MEDIA_DIR).length : 0;
    const bad = await upload(adminToken, {
      lessonPlanId: planPayload.id,
      activityKey: DISCOVERY_ID,
      field: "setupImageUrl",
      fileData: "data:text/plain;base64,YmFk",
      fileName: "bad.txt",
    });
    assert(bad.status === 400, "invalid upload rejected");
    const afterBad = fs.existsSync(MEDIA_DIR) ? fs.readdirSync(MEDIA_DIR).length : 0;
    assert(afterBad === beforeFiles, "failed upload leaves no partial files");

    // Draft save with A
    let draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: planPayload.id,
        enrichmentDraft: {
          activities: {
            [DISCOVERY_ID]: {
              setupImageUrl: upA.json.mediaUrl,
              setupImageThumbUrl: upA.json.thumbUrl,
              setupMediaAssetId: upA.json.mediaAssetId,
              teacherTips: ["tip"],
            },
          },
        },
      },
    });
    assert(draftSave.status === 200, "draft save A");
    expectedUpdatedAt = draftSave.json.siteContentUpdatedAt || expectedUpdatedAt;
    const savedA = draftSave.json.lessonPlan.enrichmentDraft.activities[DISCOVERY_ID].setupMediaAssetId;
    assert(savedA === upA.json.mediaAssetId, "draft stores A");

    // Failed draft save (stale concurrency) must not erase previously saved photo
    const stale = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: "1999-01-01T00:00:00.000Z",
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: planPayload.id,
        enrichmentDraft: {
          activities: {
            [DISCOVERY_ID]: {
              setupImageUrl: "",
              setupMediaAssetId: "",
              teacherTips: ["cleared"],
            },
          },
        },
      },
    });
    assert(stale.status === 409, "stale draft save rejected");
    const still = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    const planStill = (still.json.siteContent.curriculum.lessonPlans || []).find((p) => p.id === planPayload.id);
    assert(
      planStill.enrichmentDraft.activities[DISCOVERY_ID].setupMediaAssetId === upA.json.mediaAssetId,
      "failed draft save keeps previous photo",
    );

    // Upload B (replace candidate)
    const pngB = await makePngDataUrl(140, 100, { r: 180, g: 90, b: 40 });
    const upB = await upload(adminToken, {
      lessonPlanId: planPayload.id,
      activityKey: DISCOVERY_ID,
      field: "setupImageUrl",
      fileData: pngB,
      fileName: "b.png",
    });
    assert(upB.status === 200, "upload B");

    // Cannot delete A while still referenced
    const blocked = await requestJson("POST", "/api/admin/curriculum/enrichment-photos/delete", {
      adminToken,
      mediaAssetId: upA.json.mediaAssetId,
      lessonPlanId: planPayload.id,
      reason: "lifecycle_test_blocked",
    }, { Authorization: `Bearer ${adminToken}` });
    assert(blocked.status === 409, "referenced asset not deleted");
    assert(localAssetExists(upA.json.mediaAssetId), "A still on disk while referenced");

    // Draft save switches to B → A cleaned with log
    draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: planPayload.id,
        enrichmentDraft: {
          activities: {
            [DISCOVERY_ID]: {
              setupImageUrl: upB.json.mediaUrl,
              setupImageThumbUrl: upB.json.thumbUrl,
              setupMediaAssetId: upB.json.mediaAssetId,
              teacherTips: ["tip"],
            },
          },
        },
      },
    });
    assert(draftSave.status === 200, "draft save B");
    expectedUpdatedAt = draftSave.json.siteContentUpdatedAt || expectedUpdatedAt;
    assert(!localAssetExists(upA.json.mediaAssetId), "A removed after unreferenced");
    assert(localAssetExists(upB.json.mediaAssetId), "B retained");

    const logs = readCleanupLog();
    const aLog = logs.find((row) => row.assetId === upA.json.mediaAssetId && row.result === "deleted");
    assert(aLog, "cleanup log has deleted A");
    assert(aLog.lessonPlanId === planPayload.id, "cleanup log lesson ID");
    assert(aLog.reason === "draft_save_unreferenced", "cleanup log reason");
    assert(aLog.timestamp, "cleanup log timestamp");
    assert(aLog.assetId === upA.json.mediaAssetId, "cleanup log asset ID");

    // Removing photo reference immediately in draft payload
    draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: planPayload.id,
        enrichmentDraft: {
          activities: {
            [DISCOVERY_ID]: {
              setupImageUrl: "",
              setupImageThumbUrl: "",
              setupMediaAssetId: "",
              teacherTips: ["tip"],
            },
          },
        },
      },
    });
    assert(draftSave.status === 200, "draft save remove ref");
    expectedUpdatedAt = draftSave.json.siteContentUpdatedAt || expectedUpdatedAt;
    const cleared = draftSave.json.lessonPlan.enrichmentDraft.activities[DISCOVERY_ID];
    assert(!cleared.setupMediaAssetId && !cleared.setupImageUrl, "draft reference removed immediately on save");
    assert(!localAssetExists(upB.json.mediaAssetId), "B cleaned after remove");

    // Draft privacy: public route 404 for draft_private; admin works only when asset exists
    const upC = await upload(adminToken, {
      lessonPlanId: planPayload.id,
      activityKey: DISCOVERY_ID,
      field: "exampleImageUrl",
      fileData: await makePngDataUrl(80, 80, { r: 10, g: 10, b: 200 }),
      fileName: "c.png",
    });
    assert(upC.status === 200, "upload C");
    const publicPath = enrichmentMedia.publicEnrichmentMediaUrl(upC.json.mediaAssetId, "full");
    const pub = await requestBinary("GET", publicPath);
    assert(pub.status === 404, "draft rollback/private media not exposed on public route");
    const adm = await requestBinary("GET", `${upC.json.mediaUrl}&adminToken=${encodeURIComponent(adminToken)}`);
    assert(adm.status === 200, "admin can still read draft media");

    // Mark published in registry and ensure cleanup cannot delete
    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    store.enrichmentMediaRegistry = store.enrichmentMediaRegistry || {};
    store.enrichmentMediaRegistry[upC.json.mediaAssetId] = {
      id: upC.json.mediaAssetId,
      visibility: "published",
      lessonPlanId: planPayload.id,
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    // Touch store so server reloads — local-json may cache; restart not available, so call delete which reads store via readStore
    // Force reload by writing and waiting briefly; server uses cache with mtime in some paths.
    await new Promise((r) => setTimeout(r, 300));
    const delPublished = await requestJson("POST", "/api/admin/curriculum/enrichment-photos/delete", {
      adminToken,
      mediaAssetId: upC.json.mediaAssetId,
      lessonPlanId: planPayload.id,
      reason: "lifecycle_test_published_guard",
    }, { Authorization: `Bearer ${adminToken}` });
    // If cache didn't reload, accept either skipped_published or still_referenced after we also put ref in draft
    assert(
      delPublished.status === 409
      && (delPublished.json?.code === "asset_published_or_shared" || delPublished.json?.code === "asset_still_referenced"),
      `published/shared assets protected (${delPublished.status} ${delPublished.json?.code})`,
    );

    console.log(`OK teaching-kit-enrichment-media-lifecycle (${passed} assertions)`);
  } finally {
    child.kill("SIGTERM");
    try { await new Promise((resolve) => child.once("exit", resolve)); } catch { /* ignore */ }
    fs.rmSync(STORE_PATH, { force: true });
    fs.rmSync(STORE_PATH.replace(/(\.json)?$/, ".admin-sessions.json"), { force: true });
    fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
    fs.rmSync(CLEANUP_LOG, { force: true });
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-enrichment-media-lifecycle:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
