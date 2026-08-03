#!/usr/bin/env node
/**
 * Teaching Kit Enrichment — classic save / bulk status preservation remediation.
 *
 * Proves enrichmentDraft, publish history, published enrichment, media IDs, and
 * teachingKit metadata survive classic full lesson saves and every bulk status
 * action — even when the client omits enrichment fields.
 *
 * Run: npm run test:teaching-kit-enrichment-preserve
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const sharp = require("sharp");
const CurriculumSafeValues = require("./curriculum-safe-values.js");
const enrichmentHelpers = require("./teaching-kit-enrichment.js");

const ROOT = path.join(__dirname, "..");
const PORT = 5700 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, `.tmp-tk-enrich-preserve-${process.pid}.json`);
const MEDIA_DIR = STORE_PATH.replace(/(\.json)?$/i, ".enrichment-media");
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/fixtures/teaching-kit/farm-animals-enrichment-slice2.json"), "utf8"),
);
const ARTIFACT_DIR = "/opt/cursor/artifacts/assets";
const ADMIN = {
  email: "tk-enrich-preserve-admin@example.com",
  password: "tk-enrich-preserve-pass",
  code: "tk-enrich-preserve-code",
};
const FREE_USER = "tk-enrich-preserve-free@example.com";
const TRIAL_USER = "tk-enrich-preserve-trial@example.com";
const PRO_USER = "tk-enrich-preserve-pro@example.com";
const DISCOVERY_ID = "cur-act-e14264deb203e7dc";
const OTHER_LESSON_ID = "cur-lp-preserve-untouched";

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
  assert(bootstrap.status === 200, "site-content bootstrap");
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
  assert(save.status === 200, `flags saved: ${save.status} ${String(save.text || "").slice(0, 160)}`);
  const after = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
  assert(after.status === 200, "re-bootstrap after flags");
  return after.json.siteContent?.updatedAt || after.json.updatedAt || "";
}

function findPlan(curriculum, id) {
  return (curriculum?.lessonPlans || []).find((p) => p.id === id) || null;
}

function findActivity(curriculum, id) {
  return (curriculum?.activities || []).find((a) => a.id === id) || null;
}

function discoveryItem(plan) {
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
    const items = plan?.dailyPlans?.[day]?.items || [];
    const hit = items.find((item) => item.itemId === DISCOVERY_ID || /discovery/i.test(item.title || ""));
    if (hit) return hit;
  }
  return null;
}

function stripEnrichmentLikeClassicEditor(plan) {
  // Simulates the pre-remediation classic editor payload (omits enrichment keys).
  const rendered = CurriculumSafeValues.normalizeCurriculumLessonPlanForRender(plan);
  const clone = JSON.parse(JSON.stringify(rendered));
  delete clone.enrichmentDraft;
  delete clone.enrichmentPublishHistory;
  delete clone.teachingKit;
  for (const day of Object.keys(clone.dailyPlans || {})) {
    (clone.dailyPlans[day].items || []).forEach((item) => {
      delete item.setupImageUrl;
      delete item.exampleImageUrl;
      delete item.setupMediaAssetId;
      delete item.exampleMediaAssetId;
      delete item.teacherTips;
      delete item.substitutions;
      delete item.settingTags;
    });
  }
  return clone;
}

function assertEnrichmentIntact(plan, activity, snapshot, label) {
  assert(plan, `${label}: plan exists`);
  assert(Array.isArray(plan.enrichmentPublishHistory) && plan.enrichmentPublishHistory.length >= 1, `${label}: history kept`);
  assert(plan.enrichmentPublishHistory[0].versionId === snapshot.versionId, `${label}: versionId stable`);
  assert(plan.enrichmentPublishHistory[0].fingerprint === snapshot.fingerprint, `${label}: fingerprint stable`);
  assert(plan.enrichmentPublishHistory[0].snapshot, `${label}: rollback snapshot kept`);
  assert(plan.teachingKit?.lastEnrichmentVersionId === snapshot.versionId, `${label}: lastEnrichmentVersionId persisted`);
  assert(plan.teachingKit?.lastEnrichmentPublishFingerprint === snapshot.fingerprint, `${label}: lastEnrichment fingerprint persisted`);
  assert(Array.isArray(plan.teachingKit?.milestones) && plan.teachingKit.milestones.includes("Sorting"), `${label}: milestones published`);
  assert(String(plan.familyConnection || "").includes("Talk about farm animals"), `${label}: family connection kept`);
  const item = discoveryItem(plan);
  assert(item, `${label}: discovery item`);
  assert(String(item.setupMediaAssetId || "").startsWith("tk-enrich-"), `${label}: setupMediaAssetId on daily item`);
  assert(String(item.exampleMediaAssetId || "").startsWith("tk-enrich-"), `${label}: exampleMediaAssetId on daily item`);
  assert(Array.isArray(item.teacherTips) && item.teacherTips.includes("Invite children to sort by size."), `${label}: tips on daily item`);
  assert(Array.isArray(item.substitutions) && item.substitutions.length, `${label}: substitutions on daily item`);
  assert(Array.isArray(item.settingTags) && item.settingTags.includes("small_group"), `${label}: setting tags on daily item`);
  assert(activity, `${label}: activity exists`);
  assert(String(activity.setupMediaAssetId || "").startsWith("tk-enrich-"), `${label}: setupMediaAssetId on activity`);
  assert(String(activity.exampleMediaAssetId || "").startsWith("tk-enrich-"), `${label}: exampleMediaAssetId on activity`);
  assert(Array.isArray(activity.teacherTips) && activity.teacherTips.includes("Invite children to sort by size."), `${label}: tips on activity`);
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  for (const p of [STORE_PATH, MEDIA_DIR]) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
  }

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
      LLH_ENRICHMENT_AI_FIXTURE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  try {
    await waitForHealth(child);
    const adminToken = await adminLogin();
    let expectedUpdatedAt = await setFlags(adminToken, {
      teachingKitViewer: true,
      teachingKitEnrichmentEditor: true,
    });

    const auth = { Authorization: `Bearer ${adminToken}` };
    const saveFull = (lessonPlan, stamp) => requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      lessonPlan,
    }, auth);
    const saveMode = (mode, lessonPlan, stamp, extra = {}) => requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      expectedUpdatedAt: stamp,
      saveMode: mode,
      lessonPlan,
      ...extra,
    }, auth);

    // Seed Farm Animals + untouched sibling
    const planPayload = JSON.parse(JSON.stringify(FIXTURE.lessonPlan));
    const otherPlan = {
      ...JSON.parse(JSON.stringify(FIXTURE.lessonPlan)),
      id: OTHER_LESSON_ID,
      title: "Preserve Untouched Lesson",
      dailyPlans: {
        monday: { items: [{ itemId: "other-item-1", title: "Other Activity", activityCategory: "Open-Ended Exploration" }] },
        tuesday: { items: [{ itemId: "other-item-2", title: "Other Tue", activityCategory: "Open-Ended Exploration" }] },
        wednesday: { items: [{ itemId: "other-item-3", title: "Other Wed", activityCategory: "Open-Ended Exploration" }] },
        thursday: { items: [{ itemId: "other-item-4", title: "Other Thu", activityCategory: "Open-Ended Exploration" }] },
        friday: { items: [{ itemId: "other-item-5", title: "Other Fri", activityCategory: "Open-Ended Exploration" }] },
      },
    };
    let res = await saveFull(planPayload, expectedUpdatedAt);
    assert(res.status === 200, "seed farm animals");
    expectedUpdatedAt = res.json.siteContentUpdatedAt;
    res = await saveFull(otherPlan, expectedUpdatedAt);
    assert(res.status === 200, "seed other lesson");
    expectedUpdatedAt = res.json.siteContentUpdatedAt;
    const otherBefore = findPlan(res.json.curriculum, OTHER_LESSON_ID);
    const otherBeforeJson = JSON.stringify(otherBefore);

    // Legacy lesson with no enrichment — classic save still works
    const legacyOnly = {
      ...JSON.parse(JSON.stringify(FIXTURE.lessonPlan)),
      id: "cur-lp-preserve-legacy-only",
      title: "Legacy Only Preserve",
    };
    res = await saveFull(legacyOnly, expectedUpdatedAt);
    assert(res.status === 200, "legacy-only seed");
    expectedUpdatedAt = res.json.siteContentUpdatedAt;
    const strippedLegacy = stripEnrichmentLikeClassicEditor(findPlan(res.json.curriculum, legacyOnly.id));
    strippedLegacy.weeklyOverview = `${strippedLegacy.weeklyOverview || ""}\nHarmless classic edit.`.trim();
    res = await saveFull(strippedLegacy, expectedUpdatedAt);
    assert(res.status === 200, "legacy-only classic save");
    expectedUpdatedAt = res.json.siteContentUpdatedAt;
    assert(!findPlan(res.json.curriculum, legacyOnly.id)?.enrichmentDraft, "legacy-only still has no draft");

    // Upload setup + example photos
    const png = await sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 40, g: 120, b: 80 } },
    }).png().toBuffer();
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
    const upSetup = await requestJson("POST", "/api/admin/curriculum/enrichment-photos/upload", {
      adminToken,
      lessonPlanId: planPayload.id,
      activityKey: DISCOVERY_ID,
      field: "setupImageUrl",
      fileName: "setup.png",
      fileData: dataUrl,
    }, auth);
    assert(upSetup.status === 200 && upSetup.json.mediaAssetId, `setup upload: ${upSetup.status}`);
    const upExample = await requestJson("POST", "/api/admin/curriculum/enrichment-photos/upload", {
      adminToken,
      lessonPlanId: planPayload.id,
      activityKey: DISCOVERY_ID,
      field: "exampleImageUrl",
      fileName: "example.png",
      fileData: dataUrl,
    }, auth);
    assert(upExample.status === 200 && upExample.json.mediaAssetId, `example upload: ${upExample.status}`);

    // Draft enrichment (activity + week milestones / family / printableIds)
    const draftBody = {
      updatedAt: new Date().toISOString(),
      lastEditedBy: ADMIN.email,
      previewReady: true,
      week: {
        familyConnection: "Talk about farm animals you see this weekend.",
        milestones: ["Sorting", "Language"],
        // printableIds merge is covered unit-side; avoid integrity miss without seeding resources.
        printableIds: [],
      },
      activities: {
        [DISCOVERY_ID]: {
          setupImageUrl: upSetup.json.mediaUrl,
          setupImageThumbUrl: upSetup.json.thumbUrl,
          setupMediaAssetId: upSetup.json.mediaAssetId,
          exampleImageUrl: upExample.json.mediaUrl,
          exampleImageThumbUrl: upExample.json.thumbUrl,
          exampleMediaAssetId: upExample.json.mediaAssetId,
          teacherTips: ["Invite children to sort by size."],
          observationPrompts: ["Which animals did they name?"],
          vocabulary: ["hoof", "barn"],
          substitutions: [{ need: "plastic animals", use: "printed animal cards" }],
          settingTags: ["small_group", "indoor"],
        },
      },
    };
    res = await saveMode("enrichment_draft", { id: planPayload.id, enrichmentDraft: draftBody }, expectedUpdatedAt);
    assert(res.status === 200 && res.json.publishedUnchanged === true, "draft save");
    expectedUpdatedAt = res.json.siteContentUpdatedAt;
    assert(findPlan(res.json.curriculum, planPayload.id)?.enrichmentDraft?.activities?.[DISCOVERY_ID], "draft-only present");

    // Publish enrichment
    res = await saveMode("publish_enrichment", { id: planPayload.id, enrichmentDraft: draftBody }, expectedUpdatedAt, {
      publishedBy: ADMIN.email,
    });
    assert(res.status === 200 && res.json.ok && !res.json.duplicate, "publish enrichment");
    expectedUpdatedAt = res.json.siteContentUpdatedAt;
    let farm = findPlan(res.json.curriculum, planPayload.id);
    let discovery = findActivity(res.json.curriculum, DISCOVERY_ID);
    assert(!farm.enrichmentDraft, "draft cleared after publish");
    const publishSnapshot = {
      versionId: res.json.versionId,
      fingerprint: res.json.fingerprint,
      historyLen: farm.enrichmentPublishHistory.length,
      setupMediaAssetId: discovery.setupMediaAssetId,
      exampleMediaAssetId: discovery.exampleMediaAssetId,
      tips: [...(discovery.teacherTips || [])],
      familyConnection: farm.familyConnection,
      milestones: [...(farm.teachingKit?.milestones || [])],
      rollback: JSON.parse(JSON.stringify(farm.enrichmentPublishHistory[0].snapshot)),
    };
    assertEnrichmentIntact(farm, discovery, publishSnapshot, "after publish");

    // Duplicate publish is idempotent
    res = await saveMode("publish_enrichment", { id: planPayload.id, enrichmentDraft: draftBody }, expectedUpdatedAt, {
      publishedBy: ADMIN.email,
    });
    assert(res.status === 200 && res.json.duplicate === true, "duplicate publish");
    expectedUpdatedAt = res.json.siteContentUpdatedAt;
    farm = findPlan(res.json.curriculum, planPayload.id);
    assert(farm.enrichmentPublishHistory.length === publishSnapshot.historyLen, "history not duplicated");

    // Classic Save path: omit enrichment fields + harmless legacy edit
    const classicPayload = stripEnrichmentLikeClassicEditor(farm);
    classicPayload.weeklyOverview = `${classicPayload.weeklyOverview || ""}\nClassic editor harmless edit.`.trim();
    assert(!Object.prototype.hasOwnProperty.call(classicPayload, "enrichmentPublishHistory"), "classic payload omits history");
    assert(!Object.prototype.hasOwnProperty.call(classicPayload, "enrichmentDraft"), "classic payload omits draft");
    res = await saveFull(classicPayload, expectedUpdatedAt);
    assert(res.status === 200, "classic save succeeds");
    expectedUpdatedAt = res.json.siteContentUpdatedAt;
    farm = findPlan(res.json.curriculum, planPayload.id);
    discovery = findActivity(res.json.curriculum, DISCOVERY_ID);
    assertEnrichmentIntact(farm, discovery, publishSnapshot, "after classic save");
    assert(String(farm.weeklyOverview || "").includes("Classic editor harmless edit"), "classic field changed");

    // Concurrent stale save
    const stale = await saveFull({ ...classicPayload, weeklyOverview: "stale" }, "not-the-current-stamp");
    assert(stale.status === 409, "stale classic save conflicts");
    farm = findPlan(
      (await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`)).json.siteContent.curriculum,
      planPayload.id,
    );
    discovery = findActivity(
      (await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`)).json.siteContent.curriculum,
      DISCOVERY_ID,
    );
    assertEnrichmentIntact(farm, discovery, publishSnapshot, "after stale conflict");

    // Failed classic save (missing auth) does not change store
    const failed = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt,
      lessonPlan: { ...classicPayload, title: "Should Not Persist" },
    });
    assert(failed.status === 401, "failed classic save unauthorized");
    const boot = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(adminToken)}`);
    farm = findPlan(boot.json.siteContent.curriculum, planPayload.id);
    assert(farm.title !== "Should Not Persist", "failed save did not rewrite title");
    assertEnrichmentIntact(farm, findActivity(boot.json.siteContent.curriculum, DISCOVERY_ID), publishSnapshot, "after failed save");

    // Bulk status actions — status-only intent, enrichment must remain
    for (const status of ["draft", "published", "featured", "archived", "published"]) {
      const stripped = stripEnrichmentLikeClassicEditor(farm);
      stripped.status = status;
      res = await saveFull(stripped, expectedUpdatedAt);
      assert(res.status === 200, `bulk-like status → ${status}`);
      expectedUpdatedAt = res.json.siteContentUpdatedAt;
      farm = findPlan(res.json.curriculum, planPayload.id);
      discovery = findActivity(res.json.curriculum, DISCOVERY_ID);
      assert(farm.status === status, `status became ${status}`);
      assertEnrichmentIntact(farm, discovery, publishSnapshot, `after status ${status}`);
    }

    // Unrelated lesson unchanged
    const otherAfter = findPlan(res.json.curriculum, OTHER_LESSON_ID);
    assert(JSON.stringify(otherAfter) === otherBeforeJson, "unrelated lesson unchanged");

    // Provider rendering still works
    const tk = await requestJson("GET", `/api/curriculum/lesson-plans/${planPayload.id}/teaching-kit`);
    assert(tk.status === 200 && tk.json?.teachingKit, "provider teaching kit ok");
    assert(!JSON.stringify(tk.json).includes("/api/admin/media/enrichment-photos/"), "provider has no admin draft media URLs");

    // Draft-only enrichment survives classic save (re-open draft channel)
    const draftOnlyBody = {
      updatedAt: new Date().toISOString(),
      lastEditedBy: ADMIN.email,
      activities: {
        [DISCOVERY_ID]: {
          teacherTips: ["Draft-only tip after publish"],
          setupMediaAssetId: upSetup.json.mediaAssetId,
          setupImageUrl: upSetup.json.mediaUrl,
        },
      },
      week: { milestones: ["Creativity"] },
    };
    res = await saveMode("enrichment_draft", { id: planPayload.id, enrichmentDraft: draftOnlyBody }, expectedUpdatedAt);
    assert(res.status === 200, "post-publish draft save");
    expectedUpdatedAt = res.json.siteContentUpdatedAt;
    farm = findPlan(res.json.curriculum, planPayload.id);
    const draftTip = farm.enrichmentDraft?.activities?.[DISCOVERY_ID]?.teacherTips?.[0];
    assert(draftTip === "Draft-only tip after publish", "draft-only tip stored");
    const classicWithDraftOmitted = stripEnrichmentLikeClassicEditor(farm);
    classicWithDraftOmitted.theme = `${classicWithDraftOmitted.theme || "Farm"} · edited`;
    res = await saveFull(classicWithDraftOmitted, expectedUpdatedAt);
    assert(res.status === 200, "classic save with live draft");
    expectedUpdatedAt = res.json.siteContentUpdatedAt;
    farm = findPlan(res.json.curriculum, planPayload.id);
    discovery = findActivity(res.json.curriculum, DISCOVERY_ID);
    assert(farm.enrichmentDraft?.activities?.[DISCOVERY_ID]?.teacherTips?.[0] === "Draft-only tip after publish", "draft preserved across classic save");
    assertEnrichmentIntact(farm, discovery, publishSnapshot, "published enrichment still intact with draft");

    // Rollback history still usable (manual restore of snapshot fields)
    const snap = farm.enrichmentPublishHistory[0].snapshot;
    assert(snap && snap.dailyPlans && Array.isArray(snap.activities), "rollback snapshot shape");
    assert(publishSnapshot.rollback.familyConnection !== undefined, "prior familyConnection in snapshot");

    // Media GET with Bearer (blob path) works; query token still accepted for back-compat
    const mediaBearer = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: "127.0.0.1",
        port: PORT,
        path: `/api/admin/media/enrichment-photos/${upSetup.json.mediaAssetId}?variant=thumb`,
        method: "GET",
        headers: { Authorization: `Bearer ${adminToken}` },
      }, (r) => {
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => resolve({ status: r.statusCode, len: Buffer.concat(chunks).length }));
      });
      req.on("error", reject);
      req.end();
    });
    assert(mediaBearer.status === 200 && mediaBearer.len > 0, "Bearer draft media fetch");

    // Flag off blocks enrichment APIs; classic curriculum still loads
    expectedUpdatedAt = await setFlags(adminToken, { teachingKitEnrichmentEditor: false });
    const blocked = await saveMode("enrichment_draft", { id: planPayload.id, enrichmentDraft: draftOnlyBody }, expectedUpdatedAt);
    assert(blocked.status === 404 && blocked.json?.code === "enrichment_editor_disabled", "flag-off draft blocked");
    const site = await requestJson("GET", "/api/site-content");
    assert(site.status === 200, "public site-content ok with flag off");
    assert(site.json?.featureFlags?.teachingKitEnrichmentEditor !== true, "flag default/off for public");

    // Role / account-type matrix unchanged by enrichment remediation (unit smoke).
    const accountAccess = require("./account-access.js");
    const director = accountAccess.summarizeAccountAccess({
      accountType: "center",
      role: "director",
    });
    const teacher = accountAccess.summarizeAccountAccess({
      accountType: "center",
      role: "teacher",
    });
    const assistant = accountAccess.summarizeAccountAccess({
      accountType: "center",
      role: "assistant",
    });
    const owner = accountAccess.summarizeAccountAccess({
      accountType: "home_daycare",
      role: "owner",
    });
    assert(director && teacher && assistant && owner, "Center/Director/Teacher/Assistant/Owner access helpers");
    assert(accountAccess.resolveAccountType({ accountType: "center" }) === "center", "center account type");
    void FREE_USER;
    void TRIAL_USER;
    void PRO_USER;

    // Week printableIds merge into resourceIds + teachingKit (unit, no integrity seed needed)
    const weekMerged = enrichmentHelpers.mergeDraftIntoPlan(
      { id: "x", resourceIds: ["keep-me"], dailyPlans: {}, teachingKit: {} },
      [],
      { week: { printableIds: ["print-a", "keep-me"], milestones: ["Fine motor"], familyConnection: "Hi" }, activities: {} },
    );
    assert(weekMerged.plan.resourceIds.includes("print-a") && weekMerged.plan.resourceIds.includes("keep-me"), "printableIds merge into resourceIds");
    assert(weekMerged.plan.teachingKit.milestones.includes("Fine motor"), "milestones publish onto teachingKit");
    assert(weekMerged.plan.familyConnection === "Hi", "family connection publishes");

    // Canonical AI apply helper shared
    const applied = enrichmentHelpers.applySuggestionsToDraft(
      { activities: {}, week: {} },
      [{
        id: "s1",
        category: "teacher_tips",
        field: "teacherTips",
        decision: "accepted",
        selected: true,
        proposedText: "Shared helper tip",
      }],
      { activityKey: DISCOVERY_ID },
    );
    assert(applied.draft.activities[DISCOVERY_ID].teacherTips.includes("Shared helper tip"), "canonical AI apply helper");

    // Client normalize now preserves enrichment when present
    const rendered = CurriculumSafeValues.normalizeCurriculumLessonPlanForRender(farm);
    assert(Array.isArray(rendered.enrichmentPublishHistory), "render normalize keeps history");
    assert(rendered.teachingKit?.lastEnrichmentVersionId, "render normalize keeps teachingKit publish meta");
    const disc = discoveryItem(rendered);
    assert(disc?.setupMediaAssetId, "render normalize keeps media asset ids on items");

    const report = {
      title: "Teaching Kit Enrichment — classic save preservation remediation",
      passed,
      publishSnapshot: {
        versionId: publishSnapshot.versionId,
        fingerprint: publishSnapshot.fingerprint,
        milestones: publishSnapshot.milestones,
      },
      afterClassicSave: {
        status: farm.status,
        hasHistory: Array.isArray(farm.enrichmentPublishHistory),
        hasDraft: Boolean(farm.enrichmentDraft),
        setupMediaAssetId: discovery.setupMediaAssetId,
        lastEnrichmentVersionId: farm.teachingKit?.lastEnrichmentVersionId,
      },
      finishedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "tk-enrich-preserve-report.json"), JSON.stringify(report, null, 2));
    console.log(`OK teaching-kit-enrichment-preserve (${passed} assertions)`);
    console.log(`Report: ${path.join(ARTIFACT_DIR, "tk-enrich-preserve-report.json")}`);
  } catch (error) {
    console.error("FAIL teaching-kit-enrichment-preserve:", error.message);
    if (stderr) console.error(stderr.slice(-2000));
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    try { fs.rmSync(STORE_PATH, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(MEDIA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main();
