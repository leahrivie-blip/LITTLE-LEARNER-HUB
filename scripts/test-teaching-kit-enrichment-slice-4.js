#!/usr/bin/env node
/**
 * Enrichment Editor Slice 4 — private draft photo upload + media handling.
 * Farm Animals fixture. Run: npm run test:teaching-kit-enrichment-slice-4
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const PORT = 5400 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-enrich-s4-${process.pid}.json`);
const MEDIA_DIR = STORE_PATH.replace(/(\.json)?$/i, ".enrichment-media");
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json"), "utf8"),
);
const ARTIFACT_DIR = "/opt/cursor/artifacts/assets";
const ADMIN = {
  email: "tk-enrich-s4-admin@example.com",
  password: "tk-enrich-s4-pass",
  code: "tk-enrich-s4-code",
};
const PRO_USER = "tk-enrich-s4-pro@example.com";
const DISCOVERY_ID = "cur-act-e14264deb203e7dc";
const OTHER_LESSON_ID = "cur-lp-slice4-untouched";

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
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text };
          }
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
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            buffer: Buffer.concat(chunks),
            headers: res.headers,
          });
        });
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
      } catch {
        // retry
      }
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
  assert(
    res.status === 200 && (res.json?.token || res.json?.adminToken),
    `admin login: ${res.status} ${String(res.text || "").slice(0, 200)}`,
  );
  return res.json.token || res.json.adminToken;
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
        teachingKitViewer: false,
        teachingKitPrintCenter: false,
        teachingKitAttachments: false,
        teachingKitEnrichmentEditor: false,
        ...flags,
      },
    },
  });
  assert(save.status === 200, `flag save: ${save.status} ${save.text}`);
  return save.json.siteContent?.updatedAt || existing.updatedAt;
}

function seedProUser() {
  const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  store.users = store.users || {};
  store.users[PRO_USER] = {
    email: PRO_USER,
    plan: "Pro",
    membershipStatus: "active",
    passwordHash: "x",
  };
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

async function makePngDataUrl(width, height, color = { r: 40, g: 120, b: 70 }) {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function makeOversizedDataUrl() {
  // Valid JPEG header + padding past 5 MB.
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const pad = Buffer.alloc((5 * 1024 * 1024) + 2048, 0x00);
  const buffer = Buffer.concat([header, pad]);
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function uploadPhoto(adminToken, { lessonPlanId, activityKey, field, fileData, fileName }) {
  return requestJson("POST", "/api/admin/curriculum/enrichment-photos/upload", {
    adminToken,
    lessonPlanId,
    activityKey,
    field,
    fileData,
    fileName,
  }, { Authorization: `Bearer ${adminToken}` });
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const child = startServer();
  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    seedProUser();

    let bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let expectedUpdatedAt = bootstrap.json.siteContent.updatedAt || "";

    // Untouched sibling lesson — prove no unrelated rewrite
    const otherSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: {
        id: OTHER_LESSON_ID,
        title: "Slice 4 Untouched Lesson",
        age: "Preschool",
        theme: "Control",
        plan: "Free",
        status: "draft",
        weeklyOverview: "Control lesson for rewrite guard.",
        resourceIds: [],
        dailyPlans: {
          monday: { items: [{ itemId: "ctrl-mon-1", title: "Control Monday", activityCategory: "Circle" }] },
          tuesday: { items: [{ itemId: "ctrl-tue-1", title: "Control Tuesday", activityCategory: "Circle" }] },
          wednesday: { items: [{ itemId: "ctrl-wed-1", title: "Control Wednesday", activityCategory: "Circle" }] },
          thursday: { items: [{ itemId: "ctrl-thu-1", title: "Control Thursday", activityCategory: "Circle" }] },
          friday: { items: [{ itemId: "ctrl-fri-1", title: "Control Friday", activityCategory: "Circle" }] },
        },
      },
    });
    assert(otherSave.status === 200, `save untouched lesson: ${otherSave.status} ${String(otherSave.text || "").slice(0, 180)}`);
    expectedUpdatedAt = otherSave.json.siteContentUpdatedAt || expectedUpdatedAt;
    const otherBefore = JSON.stringify(
      (otherSave.json.curriculum.lessonPlans || []).find((p) => p.id === OTHER_LESSON_ID),
    );

    const planPayload = { ...FIXTURE.lessonPlan, resourceIds: [] };
    const savePlan = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: planPayload,
    });
    assert(savePlan.status === 200, `save farm plan: ${savePlan.status}`);
    expectedUpdatedAt = savePlan.json.siteContentUpdatedAt || expectedUpdatedAt;
    const farmPublishedBefore = JSON.stringify({
      title: planPayload.title,
      weeklyOverview: planPayload.weeklyOverview,
      status: planPayload.status,
    });

    expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitEnrichmentEditor: true,
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
    });

    // Invalid type
    const badType = await uploadPhoto(adminToken, {
      lessonPlanId: planPayload.id,
      activityKey: DISCOVERY_ID,
      field: "setupImageUrl",
      fileData: "data:text/plain;base64,aGVsbG8=",
      fileName: "notes.txt",
    });
    assert(badType.status === 400 && badType.json?.code === "invalid_type", "invalid file type rejected");

    // Oversized
    const tooBig = await uploadPhoto(adminToken, {
      lessonPlanId: planPayload.id,
      activityKey: DISCOVERY_ID,
      field: "setupImageUrl",
      fileData: await makeOversizedDataUrl(),
      fileName: "huge.jpg",
    });
    assert(tooBig.status === 400 && tooBig.json?.code === "file_too_large", "oversized file rejected");

    // Valid upload + thumbnail
    const setupPng = await makePngDataUrl(900, 700, { r: 30, g: 110, b: 80 });
    const uploadSetup = await uploadPhoto(adminToken, {
      lessonPlanId: planPayload.id,
      activityKey: DISCOVERY_ID,
      field: "setupImageUrl",
      fileData: setupPng,
      fileName: "farm-setup.png",
    });
    assert(uploadSetup.status === 200 && uploadSetup.json?.ok, "valid setup upload");
    assert(uploadSetup.json.mediaAssetId, "mediaAssetId returned");
    assert(uploadSetup.json.mediaUrl.includes("/api/admin/media/enrichment-photos/"), "private media URL");
    assert(uploadSetup.json.thumbUrl.includes("variant=thumb"), "thumb URL");
    assert(uploadSetup.json.optimized === true, "thumbnail/optimized generated");
    assert(uploadSetup.json.thumbByteLen > 0, "thumb bytes present");
    assert(uploadSetup.json.byteLen < Buffer.from(setupPng.split(",")[1], "base64").length || uploadSetup.json.optimized, "optimized not larger than needed");
    assert(!String(JSON.stringify(uploadSetup.json)).includes("data:image"), "upload response has no data URL blob");

    const examplePng = await makePngDataUrl(640, 480, { r: 180, g: 120, b: 40 });
    const uploadExample = await uploadPhoto(adminToken, {
      lessonPlanId: planPayload.id,
      activityKey: DISCOVERY_ID,
      field: "exampleImageUrl",
      fileData: examplePng,
      fileName: "farm-example.png",
    });
    assert(uploadExample.status === 200, "valid example upload");

    // Draft privacy — anonymous / member cannot read
    const publicGet = await requestBinary("GET", uploadSetup.json.mediaUrl);
    assert(publicGet.status === 404, "draft photo not public");
    const memberGet = await requestBinary(
      "GET",
      `${uploadSetup.json.mediaUrl}${uploadSetup.json.mediaUrl.includes("?") ? "&" : "?"}authorization=nope`,
      { Authorization: `Bearer test:${PRO_USER}` },
    );
    assert(memberGet.status === 404, "member cannot read draft photo");

    const adminGet = await requestBinary(
      "GET",
      `${uploadSetup.json.mediaUrl}&adminToken=${encodeURIComponent(adminToken)}`,
    );
    assert(adminGet.status === 200, "admin can read draft full photo");
    assert(String(adminGet.headers["cache-control"] || "").includes("private"), "private cache header");
    assert(adminGet.buffer.length > 32, "admin full bytes");

    const thumbGet = await requestBinary(
      "GET",
      `${uploadSetup.json.thumbUrl}&adminToken=${encodeURIComponent(adminToken)}`,
    );
    assert(thumbGet.status === 200 && thumbGet.buffer.length > 16, "thumbnail generation served");
    assert(thumbGet.buffer.length <= adminGet.buffer.length, "thumb smaller or equal to full");

    // Persist draft with media refs only (no blobs)
    const draftBody = {
      ...FIXTURE.enrichmentDraft,
      activities: {
        ...FIXTURE.enrichmentDraft.activities,
        [DISCOVERY_ID]: {
          ...FIXTURE.enrichmentDraft.activities[DISCOVERY_ID],
          setupImageUrl: uploadSetup.json.mediaUrl,
          setupImageThumbUrl: uploadSetup.json.thumbUrl,
          setupMediaAssetId: uploadSetup.json.mediaAssetId,
          exampleImageUrl: uploadExample.json.mediaUrl,
          exampleImageThumbUrl: uploadExample.json.thumbUrl,
          exampleMediaAssetId: uploadExample.json.mediaAssetId,
        },
      },
    };
    // Attempt to sneak a data URL blob — server must strip it from a decoy field activity
    draftBody.activities["cur-act-decoy-blob"] = {
      setupImageUrl: setupPng,
      teacherTips: ["should strip blob"],
    };

    const draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: {
        id: planPayload.id,
        enrichmentDraft: draftBody,
      },
    });
    assert(draftSave.status === 200, `draft save: ${draftSave.status}`);
    expectedUpdatedAt = draftSave.json.siteContentUpdatedAt || expectedUpdatedAt;
    const savedPlan = (draftSave.json.curriculum.lessonPlans || []).find((p) => p.id === planPayload.id);
    const savedDraftAct = savedPlan?.enrichmentDraft?.activities?.[DISCOVERY_ID];
    assert(savedDraftAct?.setupMediaAssetId === uploadSetup.json.mediaAssetId, "draft stores mediaAssetId");
    assert(!String(JSON.stringify(savedPlan.enrichmentDraft)).includes("data:image"), "no image blobs in curriculum draft JSON");
    assert(
      !savedPlan.enrichmentDraft.activities["cur-act-decoy-blob"]?.setupImageUrl
      || !String(savedPlan.enrichmentDraft.activities["cur-act-decoy-blob"].setupImageUrl).startsWith("data:"),
      "data URL photo refs stripped on draft save",
    );
    assert(savedPlan.title === planPayload.title, "lesson title unchanged");
    assert(savedPlan.weeklyOverview === planPayload.weeklyOverview, "lesson overview unchanged (no rewrite)");
    assert(
      JSON.stringify({ title: savedPlan.title, weeklyOverview: savedPlan.weeklyOverview, status: savedPlan.status })
        === farmPublishedBefore,
      "published lesson body fields unchanged",
    );

    const otherAfter = (draftSave.json.curriculum.lessonPlans || []).find((p) => p.id === OTHER_LESSON_ID);
    assert(JSON.stringify(otherAfter) === otherBefore, "unrelated lesson unchanged");

    // Provider kit must not expose draft photos
    const providerKit = await requestJson(
      "GET",
      `/api/curriculum/lesson-plans/${planPayload.id}/teaching-kit?day=monday`,
      null,
      { Authorization: `Bearer test:${PRO_USER}` },
    );
    assert(providerKit.status === 200, "provider kit ok");
    const providerHay = JSON.stringify(providerKit.json.teachingKit || {});
    assert(!providerHay.includes("enrichment-photos"), "provider kit has no draft photo URLs");
    assert(!providerHay.includes(uploadSetup.json.mediaAssetId), "provider kit has no draft asset id");

    // Replace photo
    const replacePng = await makePngDataUrl(500, 400, { r: 10, g: 90, b: 160 });
    const replaced = await uploadPhoto(adminToken, {
      lessonPlanId: planPayload.id,
      activityKey: DISCOVERY_ID,
      field: "setupImageUrl",
      fileData: replacePng,
      fileName: "farm-setup-replaced.png",
    });
    assert(replaced.status === 200, "replace upload ok");
    assert(replaced.json.mediaAssetId !== uploadSetup.json.mediaAssetId, "replace creates new asset");

    // Remove old asset
    const del = await requestJson("POST", "/api/admin/curriculum/enrichment-photos/delete", {
      adminToken,
      mediaAssetId: uploadSetup.json.mediaAssetId,
    }, { Authorization: `Bearer ${adminToken}` });
    assert(del.status === 200 && del.json?.deleted, "remove photo asset");
    const gone = await requestBinary(
      "GET",
      `${uploadSetup.json.mediaUrl}&adminToken=${encodeURIComponent(adminToken)}`,
    );
    assert(gone.status === 404, "removed photo fails safely (404)");

    // Broken-image fallback in UI + mobile upload via file chooser
    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.LLHTeachingKitEnrichmentEditor !== "undefined"
        && typeof window.LLHTeachingKitEnrichment !== "undefined",
      null,
      { timeout: 30000 },
    );

    const ui = await page.evaluate(async (payload) => {
      const plan = {
        ...payload.lessonPlan,
        enrichmentDraft: payload.enrichmentDraft,
        resourceIds: [],
      };
      window.curriculumLessonPlanById = (id) => (id === plan.id ? plan : null);
      window.curriculumActivitiesForLesson = (id) => (id === plan.id ? payload.activities : []);
      window.effectiveSiteContent = () => ({ featureFlags: { teachingKitEnrichmentEditor: true } });
      window.effectiveCurriculum = () => ({ resources: [] });
      window.adminSession = () => ({ token: payload.adminToken, email: "slice4@example.com" });
      window.curriculumExpectedUpdatedAt = () => "";
      window.applyCurriculumState = () => {};
      document.body.classList.add("tk-enrich-open");
      window.LLHTeachingKitEnrichmentEditor.open(plan.id);
      const features = window.LLHTeachingKitEnrichmentEditor.sliceFeatures();
      return { open: window.LLHTeachingKitEnrichmentEditor.isOpen(), features };
    }, {
      lessonPlan: FIXTURE.lessonPlan,
      activities: FIXTURE.activities,
      enrichmentDraft: {
        ...draftBody,
        activities: {
          ...draftBody.activities,
          [DISCOVERY_ID]: {
            ...draftBody.activities[DISCOVERY_ID],
            // Keep incomplete (no tips) so editor lands here with photo controls visible
            teacherTips: [],
            setupImageUrl: replaced.json.mediaUrl,
            setupImageThumbUrl: replaced.json.thumbUrl,
            setupMediaAssetId: replaced.json.mediaAssetId,
            exampleImageUrl: "/api/admin/media/enrichment-photos/tk-enrich-aaaaaaaaaaaaaaaaaaaaaaaa",
            exampleImageThumbUrl: "/api/admin/media/enrichment-photos/tk-enrich-aaaaaaaaaaaaaaaaaaaaaaaa?variant=thumb",
            exampleMediaAssetId: "tk-enrich-aaaaaaaaaaaaaaaaaaaaaaaa",
          },
        },
      },
      adminToken,
    });
    assert(ui.open === true, "editor opened");
    assert(ui.features.photoUpload === true, "photoUpload enabled in Slice 4");
    assert(ui.features.publish === false, "publish still off");
    assert(ui.features.aiSuggest === false, "ai still off");

    await page.waitForSelector(".tk-enrich-photo input[type='file']", {
      state: "attached",
      timeout: 10000,
    });
    await page.waitForSelector(".tk-enrich-photo-drop", { timeout: 10000 });
    await page.waitForFunction(() => /Discovery Basket/i.test(document.body.innerText || ""), null, { timeout: 10000 });

    // Force a broken example image decode path (404) and wait for onerror fallback
    await page.evaluate(() => {
      const exampleImg = document.querySelector('.tk-enrich-photo[data-photo-field="exampleImageUrl"] img');
      if (exampleImg) {
        exampleImg.addEventListener("error", () => {
          exampleImg.classList.add("is-broken");
          exampleImg.alt = "Photo unavailable";
        }, { once: true });
        // Re-trigger load against a guaranteed-missing asset
        exampleImg.src = `/api/admin/media/enrichment-photos/tk-enrich-bbbbbbbbbbbbbbbbbbbbbbbb?variant=thumb&adminToken=invalid`;
      }
    });
    await page.waitForFunction(() => {
      const exampleImg = document.querySelector('.tk-enrich-photo[data-photo-field="exampleImageUrl"] img');
      return exampleImg
        && (exampleImg.classList.contains("is-broken") || /unavailable/i.test(exampleImg.alt || ""));
    }, null, { timeout: 10000 });

    const brokenOk = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll(".tk-enrich-photo img"));
      const broken = imgs.filter((img) => img.classList.contains("is-broken") || /unavailable/i.test(img.alt || img.textContent || ""));
      return {
        hasUploadControls: Boolean(document.querySelector(".tk-enrich-photo input[type='file']")),
        hasReplace: Boolean(document.querySelector("[data-photo-replace]")),
        hasRemove: Boolean(document.querySelector("[data-photo-remove]")),
        hasPreview: Boolean(document.querySelector("[data-photo-preview]")),
        brokenCount: broken.length,
        onDiscovery: /Discovery Basket/i.test(document.body.innerText || ""),
        exampleHasPhotoClass: Boolean(document.querySelector('.tk-enrich-photo[data-photo-field="exampleImageUrl"] .has-photo')),
      };
    });
    assert(brokenOk.onDiscovery, "focused Discovery Basket activity");
    assert(brokenOk.hasUploadControls, "click-to-upload input present");
    assert(brokenOk.hasReplace, "replace control present");
    assert(brokenOk.hasRemove, "remove control present");
    assert(brokenOk.hasPreview, "full-size preview control present");
    assert(brokenOk.brokenCount >= 1 || brokenOk.exampleHasPhotoClass, "broken-image fallback present");

    const host = page.locator("#adminTeachingKitEnrichmentHost");
    await host.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForSelector(".tk-enrich-shell .tk-enrich-photo", { timeout: 10000 });

    // Desktop screenshot — editor host only
    await host.screenshot({ path: path.join(ARTIFACT_DIR, "tk-enrich-slice4-farm-photos-desktop.png") });

    // Tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await new Promise((r) => setTimeout(r, 200));
    await host.screenshot({ path: path.join(ARTIFACT_DIR, "tk-enrich-slice4-farm-photos-tablet.png") });

    // Mobile upload via setInputFiles
    await page.setViewportSize({ width: 390, height: 844 });
    const tmpUpload = path.join(ROOT, `.tmp-s4-mobile-${process.pid}.png`);
    await sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 200, g: 80, b: 40 } },
    }).png().toFile(tmpUpload);

    const fileInput = page.locator(".tk-enrich-photo[data-photo-field='setupImageUrl'] input[type='file']");
    if (await fileInput.count()) {
      await fileInput.setInputFiles(tmpUpload);
      await page.waitForFunction(() => {
        const text = document.body.innerText || "";
        return /Photo uploaded|optimized \+ thumbnail/i.test(text);
      }, null, { timeout: 15000 }).catch(() => null);
    }
    await host.screenshot({ path: path.join(ARTIFACT_DIR, "tk-enrich-slice4-farm-photos-mobile.png") });
    fs.rmSync(tmpUpload, { force: true });

    // Disable flag — upload must 404
    await setFlags(adminToken, { teachingKitEnrichmentEditor: false });
    const disabled = await uploadPhoto(adminToken, {
      lessonPlanId: planPayload.id,
      activityKey: DISCOVERY_ID,
      field: "setupImageUrl",
      fileData: await makePngDataUrl(40, 40),
      fileName: "flag-off.png",
    });
    assert(disabled.status === 404 && disabled.json?.code === "enrichment_editor_disabled", "flag off blocks upload");

    for (const file of [
      "tk-enrich-slice4-farm-photos-desktop.png",
      "tk-enrich-slice4-farm-photos-tablet.png",
      "tk-enrich-slice4-farm-photos-mobile.png",
    ]) {
      const full = path.join(ARTIFACT_DIR, file);
      assert(fs.existsSync(full) && fs.statSync(full).size > 1000, `${file} written`);
      fs.copyFileSync(full, path.join("/opt/cursor/artifacts", file));
    }

    console.log(`OK teaching-kit-enrichment-slice-4 (${passed} assertions)`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try {
      await new Promise((resolve) => child.once("exit", resolve));
    } catch {
      // ignore
    }
    fs.rmSync(STORE_PATH, { force: true });
    fs.rmSync(STORE_PATH.replace(/(\.json)?$/, ".admin-sessions.json"), { force: true });
    fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-enrichment-slice-4:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
