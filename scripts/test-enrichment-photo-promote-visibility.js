#!/usr/bin/env node
/**
 * Promote-visibility for existing enrichment photos (no regenerate / no re-attach).
 * Run: npm run test:enrichment-photo-promote-visibility
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const sharp = require("sharp");
const enrichmentMedia = require("../server/enrichment-media.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5600 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-promote-vis-${process.pid}.json`);
const MEDIA_DIR = STORE_PATH.replace(/(\.json)?$/i, ".enrichment-media");
const ADMIN = {
  email: "promote-vis-admin@example.com",
  password: "promote-vis-pass",
  code: "promote-vis-code",
};
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json"), "utf8"),
);
const ACTIVITY_ID = "cur-act-e14264deb203e7dc";

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
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requestBinary(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
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
  fs.rmSync(STORE_PATH, { force: true });
  fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
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

async function makePngDataUrl() {
  const buffer = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 40, g: 120, b: 80 } },
  }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function main() {
  const child = startServer();
  try {
    await waitForHealth(child);

    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert(login.status === 200 && login.json?.token, "admin login");
    const adminToken = login.json.token;

    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    const existing = bootstrap.json.siteContent || {};
    const flagSave = await requestJson("POST", "/api/admin/site-content", {
      adminToken,
      siteContent: {
        ...existing,
        updatedAt: existing.updatedAt,
        featureFlags: {
          ...(existing.featureFlags || {}),
          playBasedCurriculum: true,
          teachingKitViewer: true,
          teachingKitPrintCenter: true,
          teachingKitEnrichmentEditor: true,
        },
      },
    });
    assert(flagSave.status === 200, "enable enrichment editor");
    const expectedUpdatedAt = flagSave.json.siteContent?.updatedAt || existing.updatedAt;

    const planPayload = { ...FIXTURE.lessonPlan, status: "draft", plan: "Free", resourceIds: [] };
    const savePlan = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: planPayload,
    }, { Authorization: `Bearer ${adminToken}` });
    assert(savePlan.status === 200, `save plan: ${savePlan.status}`);
    const lessonPlanId = savePlan.json.lessonPlan?.id || planPayload.id;

    const upload = await requestJson("POST", "/api/admin/curriculum/enrichment-photos/upload", {
      adminToken,
      lessonPlanId,
      activityKey: ACTIVITY_ID,
      field: "setupImageUrl",
      fileData: await makePngDataUrl(),
      fileName: "pilot.png",
    }, { Authorization: `Bearer ${adminToken}` });
    assert(upload.status === 200 && upload.json?.mediaAssetId, `upload: ${upload.status}`);
    const mediaAssetId = upload.json.mediaAssetId;
    assert(enrichmentMedia.isEnrichmentMediaAssetId(mediaAssetId), "valid media asset id");

    const publicPath = enrichmentMedia.publicEnrichmentMediaUrl(mediaAssetId, "full");
    const beforePublic = await requestBinary("GET", publicPath);
    assert(beforePublic.status === 404, "A: public URL 404 while draft_private");

    const adminPath = enrichmentMedia.enrichmentMediaUrl(mediaAssetId, "full");
    const beforeAdmin = await requestBinary("GET", `${adminPath}&adminToken=${encodeURIComponent(adminToken)}`);
    assert(beforeAdmin.status === 200, "admin media readable before promote");

    const promote = await requestJson("POST", "/api/admin/curriculum/enrichment-photos/promote-visibility", {
      adminToken,
      lessonPlanId,
      mediaAssetIds: [mediaAssetId],
    }, { Authorization: `Bearer ${adminToken}` });
    assert(promote.status === 200 && promote.json?.ok === true, `promote: ${promote.status}`);
    assert(promote.json.contentUnchanged === true, "content unchanged flag");
    assert(promote.json.assetsCreated === 0, "no assets created");
    assert(promote.json.imageGeneration === false, "no image generation");
    assert(promote.json.lessonStatus === "draft", "lesson remains draft");
    assert(promote.json.accessPlan === "Free", "Free access unchanged");
    assert(
      promote.json.after?.[0]?.mediaAssetId === mediaAssetId
      && promote.json.after?.[0]?.visibility === "published",
      "same media id promoted to published",
    );

    const afterPublic = await requestBinary("GET", publicPath);
    assert(afterPublic.status === 200 && afterPublic.buffer.length > 0, "C: public URL 200 after promote");

    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const registryIds = Object.keys(store.enrichmentMediaRegistry || {});
    assert(registryIds.filter((id) => id === mediaAssetId).length === 1, "E/F: single registry entry, no duplicate");
    assert(registryIds.length === 1, "F: no extra assets registered");

    const planAfter = (store.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === lessonPlanId);
    assert(planAfter?.status === "draft", "I: draft unchanged in store");
    assert((planAfter?.plan === "Pro" ? "Pro" : "Free") === "Free", "I: Free unchanged in store");

    console.log(`OK enrichment-photo-promote-visibility (${passed} assertions)`);
  } finally {
    child.kill("SIGTERM");
    try { await new Promise((resolve) => child.once("exit", resolve)); } catch { /* ignore */ }
    fs.rmSync(STORE_PATH, { force: true });
    fs.rmSync(STORE_PATH.replace(/(\.json)?$/, ".admin-sessions.json"), { force: true });
    fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("FAIL enrichment-photo-promote-visibility:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
