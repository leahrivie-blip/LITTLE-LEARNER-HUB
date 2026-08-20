#!/usr/bin/env node
/**
 * Lesson-ID collision protection: Master Paste replace must not overwrite a
 * different lesson identity, create-new must mint a new ID, and archived
 * originals can be restored onto an independent lesson.
 * Disposable local store only. Does not publish or touch production.
 * Run: npm run test:master-paste-lesson-identity-guard
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const {
  parseFullLessonStructurePaste,
  buildCanonicalLessonPlan,
  masterPasteReplaceIdentityConflict,
  buildMasterPasteReplaceComparison,
} = require("./curriculum-lesson-structure-paste.js");
const restoreIndependentLesson = require("../server/curriculum-restore-independent-lesson.js");
const { allocateSafeTestPort } = require("./test-helpers/safe-test-port.js");

const ROOT = path.join(__dirname, "..");
const PORT = allocateSafeTestPort(20880, 80);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE_PATH = path.join(os.tmpdir(), `llh-identity-guard-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "identity-guard-pass",
  code: "identity-guard-code",
};
const LESSON_A_ID = "cur-lp-identity-community-helpers";
const LESSON_A_RESOURCE = "cur-res-identity-ch-pack";
const PHOTO_MEDIA = "tk-enrich-identity-photo-cafe";
const CH_TITLE = "Community Helpers: Our Busy Little Town";
const CH_AGE = "Preschool 3–4 Years";
const CC_TITLE = "Construction Crew";
const CC_AGE = "Toddler 12–24 Months";

function chPaste() {
  return `Lesson title:
${CH_TITLE}

Age band:
${CH_AGE}

Weekly overview:
Children will explore helpers in a busy little town.

Monday:
Build Our Little Town
Whose Tool Is It
`;
}

function ccPaste() {
  return `Lesson title:
${CC_TITLE}

Age band:
${CC_AGE}

Weekly overview:
Toddlers explore trucks, blocks, and building play.

Monday:
Construction Truck Track Painting
Carry the Builder Blocks
`;
}

function requestJson(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = payload
      ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
      : {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers, timeout: 45000 },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const COLLISION_ID = "cur-lp-identity-collision-source";
const RESTORE_PACK = "cur-res-restore-ch-pack";
const ARCHIVED_BUILD = {
  id: "cur-act-restore-build",
  lessonPlanId: COLLISION_ID,
  itemId: "item-restore-build",
  title: "Build Our Little Town",
  dayOfWeek: "monday",
  status: "archived",
  description: "Build a miniature town.",
  sourceKey: `${COLLISION_ID}:item-restore-build`,
};
const LIVE_TRUCK = {
  id: "cur-act-restore-truck",
  lessonPlanId: COLLISION_ID,
  itemId: "item-restore-truck",
  title: "Construction Truck Track Painting",
  dayOfWeek: "monday",
  status: "published",
  description: "Toddler truck painting.",
  sourceKey: `${COLLISION_ID}:item-restore-truck`,
};

function writeEmptyStore() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {
      featureFlags: { teachingKitEnrichmentEditor: true },
      curriculum: {
        lessonPlans: [{
          id: COLLISION_ID,
          title: CC_TITLE,
          age: CC_AGE,
          status: "published",
          plan: "Free",
          resourceIds: [],
          dailyPlans: {
            monday: { items: [{ title: LIVE_TRUCK.title, itemId: LIVE_TRUCK.itemId, sourceKey: LIVE_TRUCK.sourceKey }] },
          },
          enrichmentDraft: {
            activities: {
              [ARCHIVED_BUILD.id]: {
                setupImageUrl: "/media/build.jpg",
                setupMediaAssetId: "tk-enrich-restore-build",
              },
            },
          },
          enrichmentPublishHistory: [{
            versionId: "epaste-restore-http",
            kind: "paste_replace",
            snapshot: {
              title: CH_TITLE,
              age: CH_AGE,
              weeklyOverview: "Helpers week.",
              dailyPlans: {
                monday: { items: [{ title: ARCHIVED_BUILD.title, itemId: ARCHIVED_BUILD.itemId, sourceKey: ARCHIVED_BUILD.sourceKey }] },
              },
              activities: [{
                id: ARCHIVED_BUILD.id,
                itemId: ARCHIVED_BUILD.itemId,
                title: ARCHIVED_BUILD.title,
                dayOfWeek: "monday",
                status: "published",
              }],
              enrichmentDraft: { activities: {} },
            },
          }],
          updatedAt: "2026-08-20T14:02:34.025Z",
        }],
        activities: [ARCHIVED_BUILD, LIVE_TRUCK],
        resources: [{
          id: LESSON_A_RESOURCE,
          title: "Community Helpers: Our Busy Little Town Printable Pack",
          resourceCategory: "Printables",
          status: "draft",
          lessonPlanIds: [],
          pageCount: 24,
        }, {
          id: RESTORE_PACK,
          title: "Community Helpers: Our Busy Little Town Printable Pack",
          status: "draft",
          lessonPlanIds: [],
          pageCount: 24,
        }],
        series: [],
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    adminSessions: {},
  }, null, 2));
}

function startServer() {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: BASE,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      ADMIN_EMAIL: OWNER.email,
      ADMIN_PASSWORD: OWNER.password,
      ADMIN_ACCESS_CODE: OWNER.code,
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Server exited early");
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200 && res.json?.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("Server did not boot");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function login() {
  const res = await requestJson("POST", "/api/admin/login", {
    email: OWNER.email,
    password: OWNER.password,
    code: OWNER.code,
  });
  assert.equal(res.status, 200, res.text);
  assert.ok(res.json.token);
  return res.json.token;
}

function lessonById(payload, id) {
  return (payload.curriculum?.lessonPlans || payload.siteContent?.curriculum?.lessonPlans || [])
    .find((item) => item && item.id === id) || null;
}

function activitiesFor(payload, lessonId, { archived = false } = {}) {
  return (payload.curriculum?.activities || payload.siteContent?.curriculum?.activities || [])
    .filter((item) => item && item.lessonPlanId === lessonId && (archived ? item.status === "archived" : item.status !== "archived"));
}

function assertUnitIdentityHelpers() {
  const same = masterPasteReplaceIdentityConflict(
    { id: LESSON_A_ID, title: CH_TITLE, age: CH_AGE },
    { title: CH_TITLE, age: CH_AGE },
    [],
  );
  assert.equal(same, null, "same title may replace the selected lesson");

  const weatherStyle = masterPasteReplaceIdentityConflict(
    { id: LESSON_A_ID, title: "Original Weather Lesson", age: "Toddler 12–24 Months" },
    { title: "Weather Watchers", age: CH_AGE },
    [],
  );
  assert.equal(weatherStyle, null, "selected lesson may take a new unique title");

  const conflict = masterPasteReplaceIdentityConflict(
    { id: LESSON_A_ID, title: CH_TITLE, age: CH_AGE },
    { title: CC_TITLE, age: CC_AGE },
    [{ id: "cur-lp-toddler-construction-crew", title: CC_TITLE, age: "Toddler" }],
  );
  assert.ok(conflict);
  assert.equal(conflict.code, "lesson_identity_conflict");

  const parsed = parseFullLessonStructurePaste(ccPaste());
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  const comparison = buildMasterPasteReplaceComparison(
    { id: LESSON_A_ID, title: CH_TITLE, age: CH_AGE, activities: [] },
    parsed,
    null,
    [{ id: "cur-lp-toddler-construction-crew", title: CC_TITLE, age: "Toddler" }],
  );
  assert.equal(comparison.ok, false);
  assert.equal(comparison.code, "lesson_identity_conflict");
  console.log("PASS  unit identity helpers reject Construction Crew over Community Helpers");
}

function assertUnitRestoreHelper() {
  const cafeId = "cur-act-identity-cafe";
  const buildId = "cur-act-identity-build";
  const ccActId = "cur-act-identity-truck";
  const now = "2026-08-20T15:00:00.000Z";
  const snapshotActivities = [
    {
      id: buildId,
      itemId: "item-identity-build",
      title: "Build Our Little Town",
      dayOfWeek: "monday",
      status: "published",
      description: "Build a miniature town.",
    },
    {
      id: cafeId,
      itemId: "item-identity-cafe",
      title: "Little Community Café",
      dayOfWeek: "friday",
      status: "published",
      description: "Pretend cafe play.",
    },
  ];
  const curriculum = {
    lessonPlans: [{
      id: LESSON_A_ID,
      title: CC_TITLE,
      age: CC_AGE,
      status: "published",
      plan: "Free",
      resourceIds: ["cur-res-old-pack"],
      enrichmentDraft: {
        activities: {
          [cafeId]: {
            exampleImageUrl: "/media/cafe.jpg",
            exampleMediaAssetId: PHOTO_MEDIA,
          },
        },
      },
      enrichmentPublishHistory: [{
        versionId: "epaste-identity-test",
        kind: "paste_replace",
        snapshot: {
          title: CH_TITLE,
          age: CH_AGE,
          weeklyOverview: "Helpers week.",
          dailyPlans: {
            monday: { items: [{ title: "Build Our Little Town", itemId: "item-identity-build", sourceKey: `${LESSON_A_ID}:item-identity-build` }] },
            friday: { items: [{ title: "Little Community Café", itemId: "item-identity-cafe", sourceKey: `${LESSON_A_ID}:item-identity-cafe` }] },
          },
          activities: snapshotActivities,
          enrichmentDraft: { activities: {} },
        },
      }],
    }],
    activities: [
      {
        id: ccActId,
        lessonPlanId: LESSON_A_ID,
        itemId: "item-identity-truck",
        title: "Construction Truck Track Painting",
        dayOfWeek: "monday",
        status: "published",
        description: "Toddler truck painting.",
      },
      {
        id: buildId,
        lessonPlanId: LESSON_A_ID,
        itemId: "item-identity-build",
        title: "Build Our Little Town",
        dayOfWeek: "monday",
        status: "archived",
        description: "Build a miniature town.",
      },
      {
        id: cafeId,
        lessonPlanId: LESSON_A_ID,
        itemId: "item-identity-cafe",
        title: "Little Community Café",
        dayOfWeek: "friday",
        status: "archived",
        description: "Pretend cafe play.",
      },
    ],
    resources: [{
      id: LESSON_A_RESOURCE,
      title: "Community Helpers pack",
      status: "draft",
      lessonPlanIds: [],
      pageCount: 24,
    }, {
      id: "cur-res-old-pack",
      title: "Old pack",
      status: "published",
      lessonPlanIds: [LESSON_A_ID],
    }],
  };

  const restored = restoreIndependentLesson.restoreIndependentLessonFromPasteReplaceSnapshot({
    curriculum,
    sourceLessonId: LESSON_A_ID,
    historyVersionId: "epaste-identity-test",
    expectedSnapshotTitle: CH_TITLE,
    expectedSnapshotAge: CH_AGE,
    newLessonId: "cur-lp-preschool-community-helpers-busy-little-town",
    linkResourceIds: [LESSON_A_RESOURCE],
    verifiedPhotoMaps: [
      {
        activityId: cafeId,
        activityTitle: "Little Community Café",
        field: "exampleImageUrl",
        mediaAssetId: PHOTO_MEDIA,
      },
      {
        activityId: buildId,
        activityTitle: "Build Our Little Town",
        field: "setupImageUrl",
        mediaAssetId: "tk-enrich-missing",
      },
    ],
    now,
  });
  assert.equal(restored.ok, true, restored.error);
  assert.equal(restored.newLessonId, "cur-lp-preschool-community-helpers-busy-little-town");
  assert.notEqual(restored.newLessonId, LESSON_A_ID);
  assert.equal(restored.recoveredActivityCount, 2);
  assert.equal(restored.autoPublished, false);
  assert.equal(restored.curriculum.lessonPlans[0].status, "draft");
  assert.equal(restored.curriculum.lessonPlans[0].age, CH_AGE);
  assert.equal(restored.curriculum.lessonPlans[0].title, CH_TITLE);
  assert.deepEqual(restored.touchedLessonPlanIds, [restored.newLessonId]);
  assert.ok(!restored.touchedLessonPlanIds.includes(LESSON_A_ID));
  assert.equal(restored.photosRestored.length, 1);
  assert.equal(restored.photosRestored[0].activityId, cafeId);
  assert.equal(restored.photosUnlinked.length, 1);
  assert.equal(restored.photosUnlinked[0].activityId, buildId);
  assert.equal(restored.curriculum.resources[0].lessonPlanIds.includes(LESSON_A_ID), false);
  assert.ok(restored.curriculum.resources[0].lessonPlanIds.includes(restored.newLessonId));
  restored.curriculum.activities.forEach((act) => {
    assert.equal(act.lessonPlanId, restored.newLessonId);
    assert.equal(act.status, "draft");
  });
  const ccStill = curriculum.activities.find((item) => item.id === ccActId);
  assert.equal(ccStill.lessonPlanId, LESSON_A_ID);
  assert.equal(ccStill.status, "published");
  assert.equal(curriculum.lessonPlans[0].title, CC_TITLE);
  console.log("PASS  unit restore rehomes archived CH activities onto a new ID");
}

async function main() {
  assertUnitIdentityHelpers();
  assertUnitRestoreHelper();

  writeEmptyStore();
  const child = startServer();
  try {
    await waitForBoot(child);
    const token = await login();
    let site = await requestJson("GET", "/api/admin/site-content", null, token);
    assert.equal(site.status, 200, site.text);
    let expectedUpdatedAt = site.json.siteContent.updatedAt;

    const chParsed = parseFullLessonStructurePaste(chPaste());
    assert.equal(chParsed.ok, true, chParsed.errors.join("; "));
    const chPlan = buildCanonicalLessonPlan(chParsed, { id: LESSON_A_ID, lastEditedBy: OWNER.email });
    const createdA = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt,
      lessonPlan: {
        ...chPlan,
        id: LESSON_A_ID,
        status: "draft",
        plan: "Free",
        resourceIds: [LESSON_A_RESOURCE],
        disposableQaFixture: true,
      },
    }, token);
    assert.equal(createdA.status, 200, createdA.text);
    expectedUpdatedAt = createdA.json.siteContentUpdatedAt;
    const linked = await requestJson("POST", "/api/admin/curriculum/resources/link", {
      expectedUpdatedAt,
      resourceId: LESSON_A_RESOURCE,
      lessonPlanId: LESSON_A_ID,
    }, token);
    assert.equal(linked.status, 200, linked.text);
    expectedUpdatedAt = linked.json.siteContentUpdatedAt;

    const beforeA = lessonById(createdA.json, LESSON_A_ID);
    const beforeActs = activitiesFor(createdA.json, LESSON_A_ID);
    assert.equal(beforeA.title, CH_TITLE);
    assert.equal(beforeA.age, CH_AGE);
    assert.equal(beforeActs.length, 2);
    const beforeActIds = beforeActs.map((item) => item.id).sort();
    const beforeResourceIds = (linked.json.lessonPlan.resourceIds || beforeA.resourceIds || []).slice();

    const ccParsed = parseFullLessonStructurePaste(ccPaste());
    assert.equal(ccParsed.ok, true, ccParsed.errors.join("; "));
    const ccPlan = buildCanonicalLessonPlan(ccParsed, { id: LESSON_A_ID, lastEditedBy: OWNER.email });
    const replaceAttempt = await requestJson("POST", "/api/admin/curriculum/lesson-plans/replace-from-master-paste", {
      expectedUpdatedAt,
      saveMode: "replace_from_master_paste",
      confirmReplaceExistingLesson: true,
      lessonPlan: {
        ...ccPlan,
        id: LESSON_A_ID,
        disposableQaFixture: true,
      },
    }, token);
    assert.equal(replaceAttempt.status, 409, replaceAttempt.text);
    assert.equal(replaceAttempt.json.code, "lesson_identity_conflict");

    site = await requestJson("GET", "/api/admin/site-content", null, token);
    const afterFailedReplace = lessonById(site.json, LESSON_A_ID);
    assert.equal(afterFailedReplace.id, LESSON_A_ID);
    assert.equal(afterFailedReplace.title, CH_TITLE);
    assert.equal(afterFailedReplace.age, CH_AGE);
    const afterFailedActs = activitiesFor(site.json, LESSON_A_ID);
    assert.deepEqual(afterFailedActs.map((item) => item.id).sort(), beforeActIds);
    assert.ok((afterFailedReplace.resourceIds || []).includes(LESSON_A_RESOURCE));
    console.log("PASS  replace Construction Crew onto Community Helpers fails closed");

    const createStolenId = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      expectedUpdatedAt: site.json.siteContent.updatedAt,
      createNewLesson: true,
      lessonPlan: {
        ...ccPlan,
        id: LESSON_A_ID,
        status: "draft",
        plan: "Free",
        disposableQaFixture: true,
      },
    }, token);
    assert.equal(createStolenId.status, 200, createStolenId.text);
    const lessonB = createStolenId.json.lessonPlan;
    assert.ok(lessonB.id);
    assert.notEqual(lessonB.id, LESSON_A_ID);
    assert.equal(lessonB.title, CC_TITLE);
    assert.equal(lessonB.age, CC_AGE);
    expectedUpdatedAt = createStolenId.json.siteContentUpdatedAt;

    const afterCreate = await requestJson("GET", "/api/admin/site-content", null, token);
    const stillA = lessonById(afterCreate.json, LESSON_A_ID);
    assert.equal(stillA.title, CH_TITLE);
    assert.equal(stillA.id, LESSON_A_ID);
    const stillAActs = activitiesFor(afterCreate.json, LESSON_A_ID);
    assert.deepEqual(stillAActs.map((item) => item.id).sort(), beforeActIds);
    stillAActs.forEach((act) => assert.equal(act.lessonPlanId, LESSON_A_ID));
    const bActs = activitiesFor(afterCreate.json, lessonB.id);
    assert.equal(bActs.length, 2);
    bActs.forEach((act) => {
      assert.equal(act.lessonPlanId, lessonB.id);
      assert.ok(!beforeActIds.includes(act.id));
    });
    const pack = (afterCreate.json.siteContent.curriculum.resources || []).find((item) => item.id === LESSON_A_RESOURCE);
    assert.ok(pack.lessonPlanIds.includes(LESSON_A_ID));
    assert.equal(pack.lessonPlanIds.includes(lessonB.id), false);
    assert.ok((stillA.resourceIds || beforeResourceIds).includes(LESSON_A_RESOURCE));
    console.log("PASS  create-new Construction Crew mints a different ID and leaves Community Helpers intact");

    expectedUpdatedAt = afterCreate.json.siteContent.updatedAt;
    const restoredHttp = await requestJson("POST", "/api/admin/curriculum/lesson-plans/restore-independent-from-history", {
      expectedUpdatedAt,
      confirmRestoreIndependent: true,
      sourceLessonId: COLLISION_ID,
      historyVersionId: "epaste-restore-http",
      expectedSnapshotTitle: CH_TITLE,
      expectedSnapshotAge: CH_AGE,
      newLessonId: "cur-lp-preschool-community-helpers-busy-little-town",
      linkResourceIds: [RESTORE_PACK],
      verifiedPhotoMaps: [{
        activityId: ARCHIVED_BUILD.id,
        activityTitle: "Build Our Little Town",
        field: "setupImageUrl",
        mediaAssetId: "tk-enrich-restore-build",
      }],
    }, token);
    assert.equal(restoredHttp.status, 200, restoredHttp.text);
    assert.equal(restoredHttp.json.autoPublished, false);
    assert.equal(restoredHttp.json.sourceLessonUnchanged, true);
    assert.equal(restoredHttp.json.newLessonId, "cur-lp-preschool-community-helpers-busy-little-town");
    assert.notEqual(restoredHttp.json.newLessonId, COLLISION_ID);
    const restoredLesson = restoredHttp.json.lessonPlan;
    assert.equal(restoredLesson.title, CH_TITLE);
    assert.equal(restoredLesson.age, CH_AGE);
    assert.equal(restoredLesson.status, "draft");
    assert.equal(restoredHttp.json.recoveredActivityCount, 1);
    const sourceAfter = lessonById(restoredHttp.json, COLLISION_ID);
    assert.equal(sourceAfter.title, CC_TITLE);
    assert.equal(sourceAfter.age, CC_AGE);
    const moved = activitiesFor(restoredHttp.json, restoredHttp.json.newLessonId);
    assert.equal(moved.length, 1);
    assert.equal(moved[0].id, ARCHIVED_BUILD.id);
    assert.equal(moved[0].title, "Build Our Little Town");
    const sourceLive = activitiesFor(restoredHttp.json, COLLISION_ID);
    assert.equal(sourceLive.length, 1);
    assert.equal(sourceLive[0].id, LIVE_TRUCK.id);
    const restoredPack = (restoredHttp.json.curriculum.resources || []).find((item) => item.id === RESTORE_PACK);
    assert.deepEqual(restoredPack.lessonPlanIds, [restoredHttp.json.newLessonId]);
    assert.equal(restoredHttp.json.photosRestored.length, 1);
    console.log("PASS  independent restore rehomes archived originals without touching Construction Crew");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
