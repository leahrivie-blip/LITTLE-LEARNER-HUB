#!/usr/bin/env node
/**
 * Enrichment Editor Slice 5 — controlled publish (atomic, versioned, private→public photos).
 * Farm Animals fixture. Run: npm run test:teaching-kit-enrichment-slice-5
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const sharp = require("sharp");
const enrichmentMedia = require("../server/enrichment-media.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5600 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-enrich-s5-${process.pid}.json`);
const MEDIA_DIR = STORE_PATH.replace(/(\.json)?$/i, ".enrichment-media");
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json"), "utf8"),
);
const ARTIFACT_DIR = "/opt/cursor/artifacts/assets";
const ADMIN = {
  email: "tk-enrich-s5-admin@example.com",
  password: "tk-enrich-s5-pass",
  code: "tk-enrich-s5-code",
};
const FREE_USER = "tk-enrich-s5-free@example.com";
const TRIAL_USER = "tk-enrich-s5-trial@example.com";
const PRO_USER = "tk-enrich-s5-pro@example.com";
const DISCOVERY_ID = "cur-act-e14264deb203e7dc";
const OTHER_LESSON_ID = "cur-lp-slice5-untouched";

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
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({
          status: res.statusCode,
          buffer: Buffer.concat(chunks),
          headers: res.headers,
        }));
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
        /* retry */
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

function readTempStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function writeTempStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function seedAccessUsers() {
  const store = readTempStore();
  store.users = store.users || {};
  const now = new Date().toISOString();
  store.users[FREE_USER] = {
    email: FREE_USER,
    plan: "Free",
    membershipStatus: "active",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  store.users[TRIAL_USER] = {
    email: TRIAL_USER,
    plan: "Pro",
    membershipStatus: "trialing",
    stripeSubscriptionStatus: "trialing",
    trialStatus: "In Trial",
    trialStart: now,
    trialEnd: new Date(Date.now() + 7 * 86400000).toISOString(),
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  store.users[PRO_USER] = {
    email: PRO_USER,
    plan: "Pro",
    membershipStatus: "active",
    stripeSubscriptionStatus: "active",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  writeTempStore(store);
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
        teachingKitViewer: true,
        teachingKitPrintCenter: true,
        teachingKitAttachments: false,
        teachingKitEnrichmentEditor: false,
        ...flags,
      },
    },
  });
  assert(save.status === 200, `flag save: ${save.status} ${save.text}`);
  return save.json.siteContent?.updatedAt || existing.updatedAt;
}

async function makePngDataUrl(width, height, color) {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: color },
  }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString("base64")}`;
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

async function teachingKitAccess(email, planId) {
  return requestJson(
    "GET",
    `/api/curriculum/lesson-plans/${planId}/teaching-kit?day=monday`,
    null,
    { Authorization: `Bearer test:${email}` },
  );
}

function tipHaystack(kit) {
  return JSON.stringify(kit || {});
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const child = startServer();
  let browser;
  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    seedAccessUsers();

    let bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    let expectedUpdatedAt = bootstrap.json.siteContent.updatedAt || "";

    // Untouched sibling lesson
    const otherSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      lessonPlan: {
        id: OTHER_LESSON_ID,
        title: "Slice 5 Untouched Lesson",
        age: "Preschool",
        theme: "Control",
        plan: "Free",
        status: "published",
        weeklyOverview: "Control lesson for unrelated-change guard.",
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
    assert(otherSave.status === 200, `save untouched lesson: ${otherSave.status}`);
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

    // Capture baseline published body (legacy available for rollback)
    const baselineTitle = planPayload.title;
    const baselineOverview = planPayload.weeklyOverview;
    const mondayItemBefore = planPayload.dailyPlans?.monday?.items?.find(
      (item) => item.itemId === "item-preschool-farm-animals-monday-1",
    );
    const baselineSetupImage = mondayItemBefore?.setupImageUrl || "";

    expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitEnrichmentEditor: true,
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
    });

    // Flag-off still blocks publish (restart not needed — re-disable via site content)
    let offAt = await setFlags(adminToken, { teachingKitEnrichmentEditor: false });
    const publishFlagOff = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: offAt,
      saveMode: "publish_enrichment",
      lessonPlan: { id: planPayload.id, enrichmentDraft: { activities: { [DISCOVERY_ID]: { teacherTips: ["x"] } } } },
    });
    assert(
      publishFlagOff.status === 404 && publishFlagOff.json?.code === "enrichment_editor_disabled",
      "flag off blocks publish",
    );
    expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitEnrichmentEditor: true,
      teachingKitViewer: true,
      teachingKitPrintCenter: true,
    });

    // Upload private draft photo
    const setupPng = await makePngDataUrl(640, 480, { r: 40, g: 120, b: 70 });
    const uploadSetup = await uploadPhoto(adminToken, {
      lessonPlanId: planPayload.id,
      activityKey: DISCOVERY_ID,
      field: "setupImageUrl",
      fileData: setupPng,
      fileName: "farm-publish-setup.png",
    });
    assert(uploadSetup.status === 200 && uploadSetup.json?.mediaAssetId, "upload draft photo");
    assert(uploadSetup.json.mediaUrl.includes("/api/admin/media/enrichment-photos/"), "private admin URL");

    const draftBody = {
      ...FIXTURE.enrichmentDraft,
      lastEditedBy: ADMIN.email,
      updatedAt: new Date().toISOString(),
      activities: {
        ...FIXTURE.enrichmentDraft.activities,
        [DISCOVERY_ID]: {
          ...FIXTURE.enrichmentDraft.activities[DISCOVERY_ID],
          setupImageUrl: uploadSetup.json.mediaUrl,
          setupImageThumbUrl: uploadSetup.json.thumbUrl,
          setupMediaAssetId: uploadSetup.json.mediaAssetId,
          teacherTips: [
            "Set the discovery basket at child height before circle.",
            "Slice 5 publish tip — name one animal as each child chooses.",
          ],
        },
      },
    };

    const draftSave = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "enrichment_draft",
      lessonPlan: { id: planPayload.id, enrichmentDraft: draftBody },
    });
    assert(draftSave.status === 200, `draft save: ${draftSave.status}`);
    expectedUpdatedAt = draftSave.json.siteContentUpdatedAt || expectedUpdatedAt;
    assert(draftSave.json.publishedUnchanged === true, "draft save does not publish");

    // Draft remains private before publish
    const publicPhotoBefore = await requestBinary(
      "GET",
      enrichmentMedia.publicEnrichmentMediaUrl(uploadSetup.json.mediaAssetId, "full"),
    );
    assert(publicPhotoBefore.status === 404, "draft photo not public before publish");
    const adminPhotoBefore = await requestBinary(
      "GET",
      `${uploadSetup.json.mediaUrl}&adminToken=${encodeURIComponent(adminToken)}`,
    );
    assert(adminPhotoBefore.status === 200, "admin can read draft photo before publish");

    const curriculumBefore = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    const farmBefore = (curriculumBefore.json.siteContent.curriculum.lessonPlans || [])
      .find((p) => p.id === planPayload.id);
    assert(farmBefore.title === baselineTitle, "published title unchanged until publish");
    assert(farmBefore.weeklyOverview === baselineOverview, "published overview unchanged until publish");
    const farmHayBefore = JSON.stringify(farmBefore);
    assert(!farmHayBefore.includes("/api/media/enrichment-photos/"), "no public enrichment URLs pre-publish");
    // enrichmentDraft may contain admin URLs — strip from a published-body projection
    const publishedProjection = { ...farmBefore };
    delete publishedProjection.enrichmentDraft;
    assert(
      !JSON.stringify(publishedProjection).includes("/api/admin/media/enrichment-photos/"),
      "private draft URLs not on published lesson body fields",
    );

    // Access tiers before publish
    const accessBefore = {};
    for (const [tier, email] of [["free", FREE_USER], ["trial", TRIAL_USER], ["pro", PRO_USER]]) {
      const kit = await teachingKitAccess(email, planPayload.id);
      assert(kit.status === 200, `${tier} teaching kit before publish`);
      accessBefore[tier] = {
        locked: kit.json.teachingKit?.locked === true,
        access: kit.json.teachingKit?.access || "",
        hasDraftTip: tipHaystack(kit.json.teachingKit).includes("Slice 5 publish tip"),
        hasPrivateUrl: tipHaystack(kit.json.teachingKit).includes("/api/admin/media/enrichment-photos/"),
      };
      assert(accessBefore[tier].hasDraftTip === false, `${tier}: draft tip private before publish`);
      assert(accessBefore[tier].hasPrivateUrl === false, `${tier}: no private draft URLs before publish`);
    }

    // UI: confirmation summary (explicit admin action)
    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.LLHTeachingKitEnrichmentEditor !== "undefined"
        && typeof window.LLHTeachingKitEnrichment !== "undefined",
      null,
      { timeout: 30000 },
    );

    await page.evaluate(async (payload) => {
      const plan = {
        ...payload.lessonPlan,
        enrichmentDraft: payload.enrichmentDraft,
        resourceIds: [],
      };
      window.curriculumLessonPlanById = (id) => (id === plan.id ? plan : null);
      window.curriculumActivitiesForLesson = (id) => (id === plan.id ? payload.activities : []);
      window.effectiveSiteContent = () => ({ featureFlags: { teachingKitEnrichmentEditor: true } });
      window.effectiveCurriculum = () => ({ resources: [] });
      window.adminSession = () => ({ token: payload.adminToken, email: payload.adminEmail });
      window.curriculumExpectedUpdatedAt = () => payload.expectedUpdatedAt;
      window.applyCurriculumState = (curriculum, opts) => {
        window.__lastCurriculum = curriculum;
        window.__lastSiteStamp = opts?.siteContentUpdatedAt || "";
      };
      window.LLHTeachingKitEnrichmentEditor.open(plan.id);
    }, {
      lessonPlan: farmBefore,
      activities: FIXTURE.activities,
      enrichmentDraft: draftBody,
      adminToken,
      adminEmail: ADMIN.email,
      expectedUpdatedAt,
    });

    await page.waitForSelector(".tk-enrich-shell", { timeout: 10000 });
    const features = await page.evaluate(() => window.LLHTeachingKitEnrichmentEditor.sliceFeatures());
    assert(features.publish === true, "publish enabled in Slice 5");
    assert(features.aiSuggest === false, "AI still off");
    assert(features.photoUpload === true, "photos remain available");

    await page.click("[data-enrich-publish]");
    await page.waitForSelector("[data-publish-modal]", { timeout: 5000 });
    const summaryText = await page.locator(".tk-enrich-publish-summary").innerText();
    assert(/Farm Animals/i.test(await page.locator("[data-publish-modal]").innerText()), "confirmation names lesson");
    assert(/photo|tip|linked activit/i.test(summaryText), "confirmation lists change impact");
    assert(/rollback|prior published|snapshot/i.test(summaryText), "confirmation mentions prior version");
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-enrich-slice5-publish-confirm-farm-animals.png"),
      fullPage: true,
    });
    await page.click("[data-publish-cancel]");
    await page.waitForSelector("[data-publish-modal]", { state: "detached", timeout: 5000 }).catch(() => {});

    // Successful publish (API)
    const publish1 = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "publish_enrichment",
      publishedBy: ADMIN.email,
      lessonPlan: { id: planPayload.id, enrichmentDraft: draftBody },
    });
    assert(publish1.status === 200 && publish1.json?.ok === true, `publish: ${publish1.status} ${publish1.text}`);
    assert(publish1.json.duplicate !== true, "first publish is not a duplicate");
    assert(publish1.json.versionId, "version id returned");
    assert(publish1.json.priorVersionAvailable === true, "prior version preserved");
    assert(publish1.json.publishSummary, "publish summary returned");
    assert(
      Number(publish1.json.publishSummary.linkedActivitiesAffected) >= 1,
      "linked activity impact in summary",
    );
    expectedUpdatedAt = publish1.json.siteContentUpdatedAt || expectedUpdatedAt;

    const farmAfter = (publish1.json.curriculum.lessonPlans || []).find((p) => p.id === planPayload.id);
    assert(!farmAfter.enrichmentDraft, "draft cleared after successful publish");
    assert(Array.isArray(farmAfter.enrichmentPublishHistory) && farmAfter.enrichmentPublishHistory.length >= 1, "history retained");
    assert(farmAfter.enrichmentPublishHistory[0].snapshot, "prior published snapshot available");
    assert(
      farmAfter.enrichmentPublishHistory[0].snapshot.dailyPlans?.monday,
      "legacy dailyPlans retained in snapshot for rollback",
    );

    // Photos become visible only after publish
    const publicPhotoAfter = await requestBinary(
      "GET",
      enrichmentMedia.publicEnrichmentMediaUrl(uploadSetup.json.mediaAssetId, "full"),
    );
    assert(publicPhotoAfter.status === 200, "photo provider-visible after publish");
    assert(publicPhotoAfter.buffer.length > 32, "published photo has bytes");

    const mondayAfter = farmAfter.dailyPlans?.monday?.items?.find(
      (item) => item.itemId === "item-preschool-farm-animals-monday-1"
        || /Discovery Basket/i.test(item.title || ""),
    );
    assert(mondayAfter, "discovery item present after publish");
    assert(
      String(mondayAfter.setupImageUrl || "").includes("/api/media/enrichment-photos/"),
      "published item uses public media URL",
    );
    assert(
      !String(mondayAfter.setupImageUrl || "").includes("/api/admin/media/"),
      "published item never exposes admin draft URL",
    );
    assert(
      Array.isArray(mondayAfter.teacherTips)
        && mondayAfter.teacherTips.some((t) => /Slice 5 publish tip/i.test(t)),
      "tips merged into published lesson",
    );

    // Unrelated lesson unchanged
    const otherAfter = (publish1.json.curriculum.lessonPlans || []).find((p) => p.id === OTHER_LESSON_ID);
    assert(JSON.stringify(otherAfter) === otherBefore, "unrelated lesson unchanged");

    // Only this lesson published — control lesson history absent
    assert(!otherAfter.enrichmentPublishHistory, "unrelated lesson has no publish history");

    // Access tiers unchanged after publish (Free / Trial / Pro)
    for (const [tier, email] of [["free", FREE_USER], ["trial", TRIAL_USER], ["pro", PRO_USER]]) {
      const kit = await teachingKitAccess(email, planPayload.id);
      assert(kit.status === 200, `${tier} teaching kit after publish`);
      const locked = kit.json.teachingKit?.locked === true;
      const access = kit.json.teachingKit?.access || "";
      assert(locked === accessBefore[tier].locked, `${tier}: locked status unchanged`);
      assert(access === accessBefore[tier].access, `${tier}: access label unchanged`);
      const hay = tipHaystack(kit.json.teachingKit);
      assert(hay.includes("Slice 5 publish tip"), `${tier}: published tip now visible`);
      assert(!hay.includes("/api/admin/media/enrichment-photos/"), `${tier}: no private draft URLs after publish`);
      assert(
        hay.includes("/api/media/enrichment-photos/") || hay.includes(uploadSetup.json.mediaAssetId),
        `${tier}: public photo reference present after publish`,
      );
    }

    // Previous published version remains available (baseline fields in snapshot)
    const snap = farmAfter.enrichmentPublishHistory[0].snapshot;
    const snapMonday = snap.dailyPlans?.monday?.items?.find(
      (item) => item.itemId === "item-preschool-farm-animals-monday-1"
        || /Discovery Basket/i.test(item.title || ""),
    );
    assert(snapMonday, "snapshot has discovery item");
    assert(
      (snapMonday.setupImageUrl || "") === baselineSetupImage,
      "snapshot preserves prior published photo field",
    );

    const historyLen = farmAfter.enrichmentPublishHistory.length;

    // Duplicate publish requests do not create duplicate versions
    const publishDup = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt,
      saveMode: "publish_enrichment",
      publishedBy: ADMIN.email,
      lessonPlan: { id: planPayload.id, enrichmentDraft: draftBody },
    });
    assert(publishDup.status === 200, `dup publish: ${publishDup.status}`);
    assert(publishDup.json.duplicate === true, "duplicate publish short-circuits");
    const farmDup = (publishDup.json.curriculum.lessonPlans || []).find((p) => p.id === planPayload.id)
      || (await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`))
        .json.siteContent.curriculum.lessonPlans.find((p) => p.id === planPayload.id);
    // When duplicate, response may return existingPlan from before re-read — check store
    const afterDupStore = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    expectedUpdatedAt = afterDupStore.json.siteContent.updatedAt || expectedUpdatedAt;
    const farmDupLive = (afterDupStore.json.siteContent.curriculum.lessonPlans || [])
      .find((p) => p.id === planPayload.id);
    assert(
      (farmDupLive.enrichmentPublishHistory || []).length === historyLen,
      "no duplicate version rows",
    );
    void farmDup;

    // Failed publish leaves published lesson intact (stale concurrency)
    const titleBeforeFail = farmDupLive.teachingKit?.lastEnrichmentVersionId;
    const tipsBeforeFail = JSON.stringify(
      farmDupLive.dailyPlans?.monday?.items?.find((i) => /Discovery Basket/i.test(i.title || ""))?.teacherTips || [],
    );
    const failPublish = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: "1999-01-01T00:00:00.000Z",
      saveMode: "publish_enrichment",
      lessonPlan: {
        id: planPayload.id,
        enrichmentDraft: {
          ...draftBody,
          activities: {
            ...draftBody.activities,
            [DISCOVERY_ID]: {
              ...draftBody.activities[DISCOVERY_ID],
              teacherTips: ["THIS MUST NOT PUBLISH ON CONFLICT"],
            },
          },
        },
      },
    });
    assert(failPublish.status === 409, "stale publish rejected");
    const afterFail = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    const farmFail = (afterFail.json.siteContent.curriculum.lessonPlans || [])
      .find((p) => p.id === planPayload.id);
    assert(
      farmFail.teachingKit?.lastEnrichmentVersionId === titleBeforeFail,
      "failed publish does not create a new version",
    );
    const tipsAfterFail = JSON.stringify(
      farmFail.dailyPlans?.monday?.items?.find((i) => /Discovery Basket/i.test(i.title || ""))?.teacherTips || [],
    );
    assert(tipsAfterFail === tipsBeforeFail, "failed publish leaves published tips intact");
    assert(
      !tipsAfterFail.includes("THIS MUST NOT PUBLISH ON CONFLICT"),
      "failed publish did not partially apply",
    );

    // Missing plan publish fails without touching Farm Animals
    const missing = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: afterFail.json.siteContent.updatedAt,
      saveMode: "publish_enrichment",
      lessonPlan: {
        id: "cur-lp-does-not-exist-slice5",
        enrichmentDraft: { activities: { x: { teacherTips: ["nope"] } } },
      },
    });
    assert(missing.status === 404, "missing plan publish fails");

    // UI publish path for a second enrichment change
    const secondDraft = {
      activities: {
        [DISCOVERY_ID]: {
          teacherTips: ["Second publish pass for Farm Animals Slice 5 UI."],
          settingTags: ["small_group", "indoor"],
        },
      },
      week: {},
      updatedAt: new Date().toISOString(),
      lastEditedBy: ADMIN.email,
    };
    // Refresh editor plan from live curriculum
    await page.evaluate(async (payload) => {
      const plan = payload.plan;
      window.curriculumLessonPlanById = (id) => (id === plan.id ? plan : null);
      window.curriculumExpectedUpdatedAt = () => payload.expectedUpdatedAt;
      let publishCalls = 0;
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (url, opts) => {
        if (String(url).includes("/api/admin/curriculum/lesson-plans") && opts?.method === "POST") {
          publishCalls += 1;
        }
        return originalFetch(url, opts);
      };
      window.__publishCalls = () => publishCalls;
      window.LLHTeachingKitEnrichmentEditor.open(plan.id);
      // Seed draft in editor state via activity tip edit simulation: set draft directly through open's plan
    }, {
      plan: { ...farmFail, enrichmentDraft: secondDraft },
      expectedUpdatedAt: afterFail.json.siteContent.updatedAt,
    });
    await page.waitForSelector(".tk-enrich-shell");
    await page.click("[data-enrich-publish]");
    await page.waitForSelector("[data-publish-modal]");
    await page.click("[data-publish-confirm]");
    await page.waitForFunction(() => {
      const status = document.querySelector(".tk-enrich-status");
      return status && /published|already published/i.test(status.textContent || "");
    }, { timeout: 20000 });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "tk-enrich-slice5-publish-success-farm-animals.png"),
      fullPage: true,
    });

    console.log(`OK teaching-kit-enrichment-slice-5 (${passed} assertions)`);
    console.log(`Artifacts: ${ARTIFACT_DIR}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill("SIGTERM");
    try {
      await new Promise((resolve) => child.once("exit", resolve));
    } catch {
      /* ignore */
    }
    fs.rmSync(STORE_PATH, { force: true });
    fs.rmSync(STORE_PATH.replace(/(\.json)?$/, ".admin-sessions.json"), { force: true });
    fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
    fs.rmSync(STORE_PATH.replace(/(\.json)?$/i, ".enrichment-media-cleanup.log"), { force: true });
  }
}

main().catch((error) => {
  console.error("FAIL teaching-kit-enrichment-slice-5:", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
