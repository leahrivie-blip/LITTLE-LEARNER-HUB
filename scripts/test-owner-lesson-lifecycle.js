#!/usr/bin/env node
/**
 * Owner Admin lesson lifecycle: delete persistence, publish persistence, Free/Pro.
 * Run: npm run test:owner-lesson-lifecycle
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const {
  isLessonPlanIdTombstoned,
  normalizedDeletedLessonPlanIds,
} = require("./curriculum-deleted-lesson-tombstones.js");
const { preschoolPlansMissing } = require("./curriculum-preschool-import-targets.js");
const { mergeSeedImportPreservingOwnerAccess } = require("../server/curriculum-lesson-access-plan.js");
const { ensurePreschoolCurriculumSeeded } = require("../server/curriculum-preschool-seed.js");

const ROOT = path.join(__dirname, "..");
const PORT = 20810 + Math.floor(Math.random() * 80);
const BASE = `http://127.0.0.1:${PORT}`;
const STORE_PATH = path.join(os.tmpdir(), `llh-owner-lesson-lifecycle-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "leahivie@icloud.com",
  password: "owner-lesson-lifecycle-pass",
  code: "owner-lesson-lifecycle-code",
};

const KEEP_ID = "cur-lp-lifecycle-keep";
const DRAFT_ID = "cur-lp-lifecycle-draft";
const DELETE_ID = "cur-lp-lifecycle-delete";
const ACCESS_ID = "cur-lp-lifecycle-access";

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
      objective: "Practice a skill",
      description: "Children explore the activity with teacher support.",
    });
  }
  return plans;
}

function lessonPayload(id, title, overrides = {}) {
  return {
    id,
    title,
    age: "Preschool",
    status: "draft",
    plan: "Free",
    weeklyOverview: `${title} overview`,
    dailyPlans: dailyItems(id.slice(-6), 5),
    ...overrides,
  };
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

async function setAccessPlan(token, lessonPlanId, plan, expectedUpdatedAt) {
  return requestJson("POST", "/api/admin/curriculum/lesson-plans/access-plan", {
    expectedUpdatedAt,
    lessonPlanIds: [lessonPlanId],
    plan,
    confirm: true,
  }, token);
}

async function publicLibrary() {
  const res = await requestJson("GET", "/api/site-content");
  assert.equal(res.status, 200, res.text);
  return res.json.siteContent?.curriculumLibrary || { lessonPlans: [], activities: [] };
}

function assertStaticContract() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const enrichJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  const accessJs = fs.readFileSync(path.join(ROOT, "server/curriculum-lesson-access-plan.js"), "utf8");
  assert.match(appJs, /publish_not_persisted/);
  assert.match(appJs, /function setAdminCurriculumLessonAccessPlan/);
  assert.match(appJs, /admin-access-plan-badge/);
  assert.match(appJs, /keepPublic \? \{\} : \{ forceStatus: "draft" \}/);
  assert.match(enrichJs, /data-enrich-access-plan/);
  assert.match(enrichJs, /Save the current draft before publishing/);
  assert.match(accessJs, /mergeSeedImportPreservingOwnerAccess/);
  console.log("PASS  static contract: publish verify + Free/Pro UI + seed preserve");
}

function assertSeedPreserveHelper() {
  const existing = { id: "x", plan: "Pro", status: "draft", title: "Owner edited" };
  const parsed = { id: "x", plan: "Free", status: "published", title: "Import title", weeklyOverview: "from file" };
  const merged = mergeSeedImportPreservingOwnerAccess(parsed, existing);
  assert.equal(merged.plan, "Pro");
  assert.equal(merged.status, "draft");
  assert.equal(merged.weeklyOverview, "from file");
  const fresh = mergeSeedImportPreservingOwnerAccess(parsed, null);
  assert.equal(fresh.plan, "Free");
  assert.equal(fresh.status, "published");
  console.log("PASS  unit: seed repair preserves owner Free/Pro + status");
}

async function runLifecycle() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
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
  }, null, 2));

  const child = spawnServer();
  try {
    await waitForBoot(child);
    const token = await adminLogin();
    let { stamp } = await siteStamp(token);

    const keep = await saveLesson(token, lessonPayload(KEEP_ID, "Lifecycle Keep", {
      status: "published",
      plan: "Free",
    }), stamp);
    assert.equal(keep.status, 200, keep.text);
    stamp = keep.json.siteContentUpdatedAt;

    // --- Publish persistence ---
    const draft = await saveLesson(token, lessonPayload(DRAFT_ID, "Lifecycle Publish Me", {
      status: "draft",
      plan: "Pro",
    }), stamp);
    assert.equal(draft.status, 200, draft.text);
    stamp = draft.json.siteContentUpdatedAt;
    assert.equal(findPlan(draft.json.curriculum, DRAFT_ID).status, "draft");
    assert.equal(findPlan(draft.json.curriculum, DRAFT_ID).plan, "Pro");

    const published = await saveLesson(token, {
      ...findPlan((await siteStamp(token)).curriculum, DRAFT_ID),
      status: "published",
    }, stamp);
    assert.equal(published.status, 200, published.text);
    assert.equal(published.json.lessonPlan.status, "published");
    assert.equal(published.json.lessonPlan.plan, "Pro", "publish must not reset Free/Pro");
    stamp = published.json.siteContentUpdatedAt;

    const afterPublish = await siteStamp(token);
    assert.equal(findPlan(afterPublish.curriculum, DRAFT_ID).status, "published");
    assert.equal(findPlan(afterPublish.curriculum, DRAFT_ID).plan, "Pro");
    stamp = afterPublish.stamp;

    const library = await publicLibrary();
    assert.ok(
      (library.lessonPlans || []).some((item) => item && item.id === DRAFT_ID),
      "provider-facing library must include published lesson",
    );
    console.log("PASS  publish persists + provider library sees it + Free/Pro unchanged");

    // Content update must keep Pro + published
    const contentUpdate = await saveLesson(token, {
      ...findPlan((await siteStamp(token)).curriculum, DRAFT_ID),
      weeklyOverview: "Updated overview after publish",
      status: "published",
      plan: "Pro",
    }, stamp);
    assert.equal(contentUpdate.status, 200, contentUpdate.text);
    assert.equal(contentUpdate.json.lessonPlan.status, "published");
    assert.equal(contentUpdate.json.lessonPlan.plan, "Pro");
    assert.match(contentUpdate.json.lessonPlan.weeklyOverview, /Updated overview/);
    stamp = contentUpdate.json.siteContentUpdatedAt;
    console.log("PASS  content update preserves published + Pro");

    // --- Free/Pro persistence ---
    const accessCreate = await saveLesson(token, lessonPayload(ACCESS_ID, "Lifecycle Access", {
      status: "draft",
      plan: "Free",
    }), stamp);
    assert.equal(accessCreate.status, 200, accessCreate.text);
    stamp = accessCreate.json.siteContentUpdatedAt;

    const toPro = await setAccessPlan(token, ACCESS_ID, "Pro", stamp);
    assert.ok(toPro.status === 200 || toPro.status === 207, toPro.text);
    assert.equal(findPlan(toPro.json.curriculum, ACCESS_ID).plan, "Pro");
    assert.equal(findPlan(toPro.json.curriculum, ACCESS_ID).status, "draft", "access plan must not publish");
    stamp = toPro.json.siteContentUpdatedAt;

    const reloadPro = await siteStamp(token);
    assert.equal(findPlan(reloadPro.curriculum, ACCESS_ID).plan, "Pro");
    stamp = reloadPro.stamp;

    const toFree = await setAccessPlan(token, ACCESS_ID, "Free", stamp);
    assert.ok(toFree.status === 200 || toFree.status === 207, toFree.text);
    assert.equal(findPlan(toFree.json.curriculum, ACCESS_ID).plan, "Free");
    stamp = toFree.json.siteContentUpdatedAt;

    const reloadFree = await siteStamp(token);
    assert.equal(findPlan(reloadFree.curriculum, ACCESS_ID).plan, "Free");
    stamp = reloadFree.stamp;

    const publishAccess = await saveLesson(token, {
      ...findPlan(reloadFree.curriculum, ACCESS_ID),
      status: "published",
      plan: "Free",
    }, stamp);
    assert.equal(publishAccess.status, 200, publishAccess.text);
    assert.equal(publishAccess.json.lessonPlan.plan, "Free");
    stamp = publishAccess.json.siteContentUpdatedAt;

    const setProWhilePublished = await setAccessPlan(token, ACCESS_ID, "Pro", stamp);
    assert.ok(setProWhilePublished.status === 200 || setProWhilePublished.status === 207, setProWhilePublished.text);
    assert.equal(findPlan(setProWhilePublished.json.curriculum, ACCESS_ID).plan, "Pro");
    assert.equal(findPlan(setProWhilePublished.json.curriculum, ACCESS_ID).status, "published");
    stamp = setProWhilePublished.json.siteContentUpdatedAt;
    console.log("PASS  Free/Pro persists across reload + publish + stays independent of status");

    // Visibility: admin site-content includes plan for UI badges
    const visibility = await siteStamp(token);
    assert.ok(["Free", "Pro"].includes(findPlan(visibility.curriculum, ACCESS_ID).plan));
    assert.ok(["Free", "Pro"].includes(findPlan(visibility.curriculum, DRAFT_ID).plan));
    stamp = visibility.stamp;
    console.log("PASS  admin responses include access-plan field for UI");

    // --- Delete persistence ---
    const doomed = await saveLesson(token, lessonPayload(DELETE_ID, "Lifecycle Delete Me", {
      status: "published",
      plan: "Free",
    }), stamp);
    assert.equal(doomed.status, 200, doomed.text);
    stamp = doomed.json.siteContentUpdatedAt;

    const deleted = await deleteLesson(token, DELETE_ID, "Lifecycle Delete Me", stamp);
    assert.equal(deleted.status, 200, deleted.text);
    assert.ok(!findPlan(deleted.json.curriculum, DELETE_ID));
    assert.ok((deleted.json.curriculum.deletedLessonPlanIds || []).includes(DELETE_ID));
    assert.ok(findPlan(deleted.json.curriculum, KEEP_ID));
    assert.ok(findPlan(deleted.json.curriculum, DRAFT_ID));
    stamp = deleted.json.siteContentUpdatedAt;

    const afterDelete = await siteStamp(token);
    assert.ok(!findPlan(afterDelete.curriculum, DELETE_ID));
    assert.ok(isLessonPlanIdTombstoned(afterDelete.curriculum, DELETE_ID));
    console.log("PASS  delete persists with tombstone; unrelated lessons intact");

    // Independence: changing Free/Pro does not publish; publishing does not change Free/Pro (already checked)
    assert.equal(findPlan(afterDelete.curriculum, ACCESS_ID).status, "published");
    assert.equal(findPlan(afterDelete.curriculum, ACCESS_ID).plan, "Pro");
  } finally {
    await stopServer(child);
  }

  // Hydration must not resurrect deleted lesson
  const storeSnapshot = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  assert.ok(isLessonPlanIdTombstoned(storeSnapshot.siteContent.curriculum, DELETE_ID));
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
          ...curriculum,
          deletedLessonPlanIds: normalizedDeletedLessonPlanIds(curriculum.deletedLessonPlanIds),
          updatedAt: stamp,
        },
        updatedAt: stamp,
      };
      return { stamp, wipeBlocked: false };
    },
    syncCurriculumActivitiesForLessonPlan: (curriculum, planInput) => ({
      ...curriculum,
      lessonPlans: [
        ...(curriculum.lessonPlans || []).filter((item) => item.id !== planInput.id),
        planInput,
      ],
      deletedLessonPlanIds: normalizedDeletedLessonPlanIds(curriculum.deletedLessonPlanIds),
    }),
    assertCurriculumIntegrityOrError: () => null,
    defaultSiteContentStore: () => ({ curriculum: { lessonPlans: [], deletedLessonPlanIds: [] } }),
    defaultCurriculumStore: () => ({ lessonPlans: [], deletedLessonPlanIds: [] }),
  };
  // Only assert tombstone skip — do not seed the entire preschool catalog here.
  assert.equal(
    preschoolPlansMissing({
      lessonPlans: [],
      deletedLessonPlanIds: [DELETE_ID],
    }).some((t) => t.stableId === DELETE_ID),
    false,
  );
  await ensurePreschoolCurriculumSeeded(deps);
  const disk = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")).siteContent.curriculum;
  assert.ok(!findPlan(disk, DELETE_ID), "seed resurrected deleted lifecycle lesson");
  assert.ok(findPlan(disk, KEEP_ID), "unrelated keep lesson damaged by seed");
  console.log("PASS  hydration/seed does not restore deleted lesson");

  // Restart persistence
  const child2 = spawnServer();
  try {
    await waitForBoot(child2);
    const token = await adminLogin();
    const restarted = await siteStamp(token);
    assert.ok(!findPlan(restarted.curriculum, DELETE_ID));
    assert.equal(findPlan(restarted.curriculum, DRAFT_ID).status, "published");
    assert.equal(findPlan(restarted.curriculum, DRAFT_ID).plan, "Pro");
    assert.equal(findPlan(restarted.curriculum, ACCESS_ID).plan, "Pro");
    assert.ok(findPlan(restarted.curriculum, KEEP_ID));

    const reuse = await saveLesson(token, lessonPayload(DELETE_ID, "Reuse Deleted", { status: "draft" }), restarted.stamp);
    assert.equal(reuse.status, 409);
    assert.equal(reuse.json?.code, "lesson_id_tombstoned");
    console.log("PASS  restart keeps publish/access/delete; deleted id reuse blocked");
  } finally {
    await stopServer(child2);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

async function main() {
  assertStaticContract();
  assertSeedPreserveHelper();
  await runLifecycle();
  console.log("\nAll owner lesson lifecycle tests passed.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("\nFAIL", error);
    process.exitCode = 1;
  });
}
