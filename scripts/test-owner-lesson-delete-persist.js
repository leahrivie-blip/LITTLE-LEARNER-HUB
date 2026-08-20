#!/usr/bin/env node
/**
 * Regression: Owner Admin lesson delete must stay deleted after seed/hydration.
 *
 * Failure mode this catches:
 * 1) Owner deletes a seeded stable-id lesson via /api/admin/curriculum/lesson-plans/delete
 * 2) Startup ensure*CurriculumSeeded / *PlansMissing treats the missing id as "need to seed"
 * 3) Lesson is recreated from import source files
 *
 * Run: npm run test:owner-lesson-delete-persist
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const {
  normalizedDeletedLessonPlanIds,
  isLessonPlanIdTombstoned,
  recordDeletedLessonPlanId,
  seedTargetsMissing,
} = require("./curriculum-deleted-lesson-tombstones.js");
const {
  PRESCHOOL_IMPORT_TARGETS,
  PRESCHOOL_PRO_IMPORT_TARGETS,
  preschoolPlansMissing,
  readPreschoolImportTarget,
} = require("./curriculum-preschool-import-targets.js");
const { ensurePreschoolCurriculumSeeded } = require("../server/curriculum-preschool-seed.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20710 + Math.floor(Math.random() * 80);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-lesson-delete-persist-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "leahivie@icloud.com",
  password: "owner-lesson-delete-persist-pass",
  code: "owner-lesson-delete-persist-code",
};

const SEED_TARGET = PRESCHOOL_PRO_IMPORT_TARGETS.find(
  (item) => item.stableId === "cur-lp-preschool-space-adventure",
);
assert.ok(SEED_TARGET, "expected Space Adventure preschool seed target");
const DELETE_ID = SEED_TARGET.stableId;
const KEEP_ID = "cur-lp-owner-delete-persist-keep";
const NEW_TITLE_ID = "cur-lp-owner-delete-persist-new-title";

function requestJson(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = payload
      ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
      : {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers, timeout: 60000 },
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

function emptyStorePayload() {
  return {
    users: {},
    siteContent: {
      featureFlags: { teachingKitEnrichmentEditor: true },
      curriculum: {
        lessonPlans: [],
        activities: [],
        resources: [],
        series: [],
        deletedLessonPlanIds: [],
      },
      updatedAt: "",
    },
    adminSessions: {},
  };
}

function spawnServer() {
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: BASE,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 100; i += 1) {
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

function findPlan(curriculum, id) {
  return (curriculum?.lessonPlans || []).find((item) => item.id === id) || null;
}

function dailyItems(prefix, count) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const plans = {};
  days.forEach((day) => { plans[day] = { items: [] }; });
  for (let i = 0; i < count; i += 1) {
    const day = days[i % days.length];
    plans[day].items.push({
      itemId: `${prefix}-${day}-${i}`,
      title: `${prefix} ${day} ${i + 1}`,
    });
  }
  return plans;
}

function stubPreschoolSiblingPlans(exceptId) {
  return PRESCHOOL_IMPORT_TARGETS
    .filter((target) => target.stableId !== exceptId)
    .map((target) => ({
      id: target.stableId,
      title: `Stub ${target.stableId}`,
      age: "Preschool",
      status: "published",
      plan: target.plan || "Pro",
      weeklyOverview: "Sibling stub so ensure only targets the deleted id.",
      dailyPlans: dailyItems(`stub-${target.stableId}`, 5),
    }));
}

async function adminLogin() {
  const res = await requestJson("POST", "/api/admin/login", ADMIN);
  assert.equal(res.status, 200, res.text);
  return res.json.token;
}

async function siteStamp(token) {
  const res = await requestJson("GET", "/api/admin/site-content", null, token);
  assert.equal(res.status, 200, res.text);
  return { stamp: res.json.siteContent?.updatedAt || "", curriculum: res.json.siteContent?.curriculum || {} };
}

async function saveLesson(token, lessonPlan, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/lesson-plans", {
    expectedUpdatedAt,
    lessonPlan,
  }, token);
}

async function deleteLesson(token, lessonPlanId, confirmTitle, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/lesson-plans/delete", {
    lessonPlanId,
    confirmTitle,
    expectedUpdatedAt,
  }, token);
}

function loadStoreCurriculum() {
  const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  return store.siteContent?.curriculum || {};
}

function ensureSiblingStubsOnDisk() {
  const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  const curriculum = store.siteContent.curriculum || {};
  const existingIds = new Set((curriculum.lessonPlans || []).map((plan) => plan.id));
  const stubs = stubPreschoolSiblingPlans(DELETE_ID).filter((plan) => !existingIds.has(plan.id));
  if (!stubs.length) return;
  curriculum.lessonPlans = [...(curriculum.lessonPlans || []), ...stubs];
  store.siteContent.curriculum = curriculum;
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function runUnitTombstoneHelpers() {
  const id = "cur-lp-unit-tombstone";
  assert.deepEqual(normalizedDeletedLessonPlanIds(null), []);
  assert.deepEqual(normalizedDeletedLessonPlanIds([id, id, ""]), [id]);
  let curriculum = { lessonPlans: [], deletedLessonPlanIds: [] };
  assert.equal(isLessonPlanIdTombstoned(curriculum, id), false);
  curriculum = recordDeletedLessonPlanId(curriculum, id);
  assert.equal(isLessonPlanIdTombstoned(curriculum, id), true);
  assert.deepEqual(curriculum.deletedLessonPlanIds, [id]);

  const missingWithoutTombstone = seedTargetsMissing(
    { lessonPlans: [] },
    [{ stableId: DELETE_ID }],
  );
  assert.equal(missingWithoutTombstone.length, 1);

  const missingWithTombstone = seedTargetsMissing(
    { lessonPlans: [], deletedLessonPlanIds: [DELETE_ID] },
    [{ stableId: DELETE_ID }],
  );
  assert.equal(missingWithTombstone.length, 0);

  assert.equal(
    preschoolPlansMissing({ lessonPlans: [], deletedLessonPlanIds: [DELETE_ID] })
      .some((t) => t.stableId === DELETE_ID),
    false,
  );
  assert.equal(
    preschoolPlansMissing({ lessonPlans: [] })
      .some((t) => t.stableId === DELETE_ID),
    true,
  );
  console.log("PASS  unit: tombstone helpers + preschoolPlansMissing respect deletes");
}

async function runEnsureAgainstStore(label) {
  ensureSiblingStubsOnDisk();
  const storeSnapshot = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  const deps = {
    readStore: () => storeSnapshot,
    writeStoreAsync: async (store) => {
      fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
      Object.assign(storeSnapshot, store);
    },
    writeSiteCurriculum: (store, curriculum, { updatedAt } = {}) => {
      const stamp = updatedAt || new Date().toISOString();
      store.siteContent = {
        ...(store.siteContent || {}),
        curriculum: {
          lessonPlans: curriculum.lessonPlans || [],
          activities: curriculum.activities || [],
          resources: curriculum.resources || [],
          series: curriculum.series || [],
          deletedLessonPlanIds: normalizedDeletedLessonPlanIds(curriculum.deletedLessonPlanIds),
          updatedAt: stamp,
        },
        updatedAt: stamp,
      };
      return { stamp, wipeBlocked: false };
    },
    syncCurriculumActivitiesForLessonPlan: (curriculum, planInput) => {
      const plans = (curriculum.lessonPlans || []).filter((item) => item.id !== planInput.id);
      return {
        ...curriculum,
        lessonPlans: [...plans, planInput],
        activities: (curriculum.activities || []).filter((act) => act.lessonPlanId !== planInput.id),
        deletedLessonPlanIds: normalizedDeletedLessonPlanIds(curriculum.deletedLessonPlanIds),
        updatedAt: new Date().toISOString(),
      };
    },
    assertCurriculumIntegrityOrError: () => null,
    defaultSiteContentStore: () => ({
      curriculum: {
        lessonPlans: [],
        activities: [],
        resources: [],
        series: [],
        deletedLessonPlanIds: [],
      },
    }),
    defaultCurriculumStore: () => ({
      lessonPlans: [],
      activities: [],
      resources: [],
      series: [],
      deletedLessonPlanIds: [],
    }),
  };

  const beforeMissing = preschoolPlansMissing(storeSnapshot.siteContent.curriculum);
  assert.equal(
    beforeMissing.some((t) => t.stableId === DELETE_ID),
    false,
    `${label}: tombstoned id still reported missing before ensure`,
  );

  const result = await ensurePreschoolCurriculumSeeded(deps);
  const curriculum = loadStoreCurriculum();
  assert.ok(!findPlan(curriculum, DELETE_ID), `${label}: seed resurrected deleted lesson ${DELETE_ID}`);
  assert.ok(isLessonPlanIdTombstoned(curriculum, DELETE_ID), `${label}: tombstone missing after seed pass`);
  assert.ok(findPlan(curriculum, KEEP_ID), `${label}: unrelated keep lesson was damaged`);
  assert.equal(result.seeded, 0, `${label}: expected seeded=0, got ${result.seeded}`);
  console.log(`PASS  ${label}: ensurePreschoolCurriculumSeeded did not recreate deleted lesson`);
  return curriculum;
}

async function runServerRegression() {
  fs.writeFileSync(STORE_PATH, JSON.stringify(emptyStorePayload(), null, 2));
  const child = spawnServer();
  let stamp = "";
  let seedSourceTitle = "Space Adventure";
  try {
    await waitForBoot(child);
    const token = await adminLogin();
    ({ stamp } = await siteStamp(token));

    const seedSource = readPreschoolImportTarget(SEED_TARGET);
    seedSourceTitle = seedSource.title || seedSourceTitle;
    const seeded = await saveLesson(token, {
      id: DELETE_ID,
      title: seedSourceTitle,
      age: "Preschool",
      status: "published",
      plan: "Pro",
      weeklyOverview: seedSource.weeklyOverview || "Seeded space week.",
      dailyPlans: seedSource.dailyPlans || dailyItems("space", 10),
    }, stamp);
    assert.equal(seeded.status, 200, seeded.text);
    stamp = seeded.json.siteContentUpdatedAt;

    const keep = await saveLesson(token, {
      id: KEEP_ID,
      title: "Keep Persist Lesson",
      age: "Toddler",
      status: "published",
      plan: "Free",
      weeklyOverview: "Must remain intact.",
      dailyPlans: dailyItems("keep", 5),
    }, stamp);
    assert.equal(keep.status, 200, keep.text);
    stamp = keep.json.siteContentUpdatedAt;

    const before = await siteStamp(token);
    assert.ok(findPlan(before.curriculum, DELETE_ID), "seeded lesson present before delete");
    assert.ok(findPlan(before.curriculum, KEEP_ID), "keep lesson present before delete");
    stamp = before.stamp;

    const deleted = await deleteLesson(token, DELETE_ID, seedSourceTitle, stamp);
    assert.equal(deleted.status, 200, deleted.text);
    assert.equal(deleted.json.deletedPlanId, DELETE_ID);
    assert.ok(!findPlan(deleted.json.curriculum, DELETE_ID), "delete response still lists lesson");
    assert.ok(findPlan(deleted.json.curriculum, KEEP_ID), "delete damaged unrelated lesson");
    assert.ok(
      (deleted.json.curriculum.deletedLessonPlanIds || []).includes(DELETE_ID),
      "delete did not persist tombstone in response curriculum",
    );
    stamp = deleted.json.siteContentUpdatedAt;
    console.log("PASS  Owner Admin delete persists tombstone in source of truth");

    const reloaded = await siteStamp(token);
    assert.ok(!findPlan(reloaded.curriculum, DELETE_ID), "refresh restored deleted lesson");
    assert.ok(
      (reloaded.curriculum.deletedLessonPlanIds || []).includes(DELETE_ID),
      "tombstone missing after admin reload",
    );
    assert.ok(findPlan(reloaded.curriculum, KEEP_ID));
    console.log("PASS  admin reload keeps deletion + tombstone");
  } finally {
    await stopServer(child);
  }

  await runEnsureAgainstStore("post-delete seed ensure");
  await runEnsureAgainstStore("after persistence reload seed ensure");

  const childRestart = spawnServer();
  try {
    await waitForBoot(childRestart);
    const token = await adminLogin();
    const afterRestart = await siteStamp(token);
    assert.ok(!findPlan(afterRestart.curriculum, DELETE_ID), "server restart restored deleted lesson");
    assert.ok(
      (afterRestart.curriculum.deletedLessonPlanIds || []).includes(DELETE_ID),
      "tombstone lost across restart",
    );
    assert.ok(findPlan(afterRestart.curriculum, KEEP_ID), "unrelated lesson missing after restart");
    console.log("PASS  server restart keeps deletion");
    stamp = afterRestart.stamp;
  } finally {
    await stopServer(childRestart);
  }

  await runEnsureAgainstStore("final seed ensure after restart proof");

  const childFinal = spawnServer();
  try {
    await waitForBoot(childFinal);
    const token = await adminLogin();
    ({ stamp } = await siteStamp(token));

    const reuse = await saveLesson(token, {
      id: DELETE_ID,
      title: "Attempt Reuse Deleted Id",
      age: "Preschool",
      status: "draft",
      plan: "Free",
      weeklyOverview: "Must be rejected.",
      dailyPlans: dailyItems("reuse", 2),
    }, stamp);
    assert.equal(reuse.status, 409, reuse.text);
    assert.equal(reuse.json?.code, "lesson_id_tombstoned");
    console.log("PASS  deleted lesson id cannot be silently reused");

    const afterReuse = await siteStamp(token);
    assert.ok(!findPlan(afterReuse.curriculum, DELETE_ID), "rejected reuse still wrote the lesson");
    stamp = afterReuse.stamp;

    const fresh = await saveLesson(token, {
      id: NEW_TITLE_ID,
      title: seedSourceTitle,
      age: "Preschool",
      status: "draft",
      plan: "Free",
      weeklyOverview: "New record with same title is allowed.",
      dailyPlans: dailyItems("new", 2),
    }, stamp);
    assert.equal(fresh.status, 200, fresh.text);
    assert.ok(findPlan(fresh.json.curriculum, NEW_TITLE_ID));
    assert.ok(!findPlan(fresh.json.curriculum, DELETE_ID));
    assert.ok(findPlan(fresh.json.curriculum, KEEP_ID));
    console.log("PASS  new lesson with same title creates a new valid id");
  } finally {
    await stopServer(childFinal);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

function assertStaticContract() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const tombstoneJs = fs.readFileSync(path.join(ROOT, "scripts/curriculum-deleted-lesson-tombstones.js"), "utf8");
  assert.match(serverJs, /curriculum-deleted-lesson-tombstones/);
  assert.match(serverJs, /deletedLessonPlanIds/);
  assert.match(serverJs, /recordDeletedLessonPlanId/);
  assert.match(serverJs, /lesson_id_tombstoned/);
  assert.match(tombstoneJs, /function seedTargetsMissing/);
  assert.match(
    fs.readFileSync(path.join(ROOT, "scripts/curriculum-preschool-import-targets.js"), "utf8"),
    /seedTargetsMissing/,
  );
  console.log("PASS  static contract: tombstone wired into delete + normalize + seed");
}

async function main() {
  assertStaticContract();
  runUnitTombstoneHelpers();
  await runServerRegression();
  console.log("\nAll owner lesson-delete persistence tests passed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("\nFAIL", error);
    process.exitCode = 1;
  });
}
