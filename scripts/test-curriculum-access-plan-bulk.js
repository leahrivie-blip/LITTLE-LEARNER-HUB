#!/usr/bin/env node
/**
 * Focused QA: Owner Admin Set Free / Set Pro bulk access-plan control.
 *
 * Covers:
 * - One Free → Pro, one Pro → Free
 * - Multiple selected lessons
 * - Unauthorized + invalid plan rejection
 * - Partial server failure (missing id kept failed)
 * - Publication status + lesson content unchanged
 * - Free/Pro filter field reflects immediately
 * - Customer linked-resource gating uses updated plan
 * - Legacy + Teaching Kit structures preserved
 * - Client confirm + scroll/filter preserve wiring (source)
 *
 * Run: npm run test:curriculum-access-plan-bulk
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const accessPlanLib = require("../server/curriculum-lesson-access-plan.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4610 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-access-plan-${crypto.randomBytes(4).toString("hex")}.json`);
const OWNER = {
  email: "leahivie@icloud.com",
  password: "access-plan-owner-pass",
  code: "access-plan-owner-code",
};
const STAFF = {
  email: "staff-admin@example.com",
  password: "access-plan-staff-pass",
  code: "access-plan-staff-code",
};

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
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(child, timeoutMs = 20000) {
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

function weekdayShell(title) {
  const mk = (day, name) => ({
    theme: day,
    items: [{
      itemId: `item-${title}-${day}`.toLowerCase().replace(/\s+/g, "-").slice(0, 80),
      title: `${name} activity`,
      objective: "Practice",
      materials: "blocks",
      setup: "set up",
      steps: "do it",
    }],
  });
  return {
    monday: mk("Monday", "Mon"),
    tuesday: mk("Tuesday", "Tue"),
    wednesday: mk("Wednesday", "Wed"),
    thursday: mk("Thursday", "Thu"),
    friday: mk("Friday", "Fri"),
  };
}

function buildLesson({ id, title, plan, teachingKit = false, resourceIds = [] }) {
  const base = {
    id,
    title,
    age: "Preschool",
    theme: "Access Plan QA",
    plan,
    status: "published",
    weeklyOverview: `${title} overview — must not change`,
    objectives: "immutable objectives",
    weeklyMaterials: "crayons",
    vocabularyWords: "access\nplan",
    familyConnection: "Keep family note",
    books: [{ title: "Keep Book", author: "A", whyItFits: "fits" }],
    songs: [{ title: "Keep Song", motions: "clap" }],
    resourceIds,
    dailyPlans: weekdayShell(title),
    disposableQaFixture: true,
    legacyUnknownField: "preserve-me",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
  if (teachingKit) {
    base.teachingKit = {
      completeness: "enriched",
      printableIds: [],
      milestones: [{ id: "m1", label: "kit" }],
    };
    base.enrichmentDraft = {
      updatedAt: "2026-01-03T00:00:00.000Z",
      lastEditedBy: OWNER.email,
      activities: { "item-a": { teacherTips: ["Tip stays"] } },
      week: { weeklyOverview: "Draft overview stays" },
      completionPercent: 42,
      previewReady: false,
    };
    base.enrichmentPublished = { week: { weeklyOverview: "Published enrichment stays" } };
  }
  return base;
}

function writeSeedStore(plans, resources) {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    adminSessions: {},
    siteContent: {
      curriculum: {
        lessonPlans: plans,
        activities: [],
        resources,
        series: [],
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  }, null, 2));
}

function startServer(admin) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: admin.email,
      ADMIN_PASSWORD: admin.password,
      ADMIN_ACCESS_CODE: admin.code,
      ADMIN_EMAILS: admin.email === STAFF.email ? STAFF.email : undefined,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
      LLH_ENFORCE_TK_OWNER_ADMIN: "1",
      LLH_SKIP_STARTUP_CURRICULUM_SEED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", () => {});
  child.stdout.on("data", () => {});
  return child;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function findPlan(store, id) {
  return (store?.siteContent?.curriculum?.lessonPlans || []).find((p) => p.id === id) || null;
}

async function login(creds) {
  const res = await requestJson("POST", "/api/admin/login", creds);
  assert(res.status === 200 && res.json?.token, `Login failed for ${creds.email}: ${res.status} ${res.text}`);
  return res.json.token;
}

async function setAccessPlan(token, { lessonPlanIds, plan, confirm = true, expectedUpdatedAt }) {
  return requestJson(
    "POST",
    "/api/admin/curriculum/lesson-plans/access-plan",
    {
      expectedUpdatedAt,
      lessonPlanIds,
      plan,
      confirm,
    },
    { Authorization: `Bearer ${token}` },
  );
}

function assertContentFrozen(before, after, label) {
  assert(before, `${label}: missing before`);
  assert(after, `${label}: missing after`);
  assert(before.status === after.status, `${label}: status changed`);
  assert(before.weeklyOverview === after.weeklyOverview, `${label}: weeklyOverview changed`);
  assert(before.objectives === after.objectives, `${label}: objectives changed`);
  assert(before.familyConnection === after.familyConnection, `${label}: familyConnection changed`);
  assert(JSON.stringify(before.dailyPlans) === JSON.stringify(after.dailyPlans), `${label}: dailyPlans changed`);
  assert(before.legacyUnknownField === after.legacyUnknownField, `${label}: legacy field dropped`);
  assert(before.id === after.id, `${label}: id changed`);
  if (before.teachingKit) {
    assert(JSON.stringify(before.teachingKit) === JSON.stringify(after.teachingKit), `${label}: teachingKit changed`);
  }
  if (before.enrichmentDraft) {
    assert(JSON.stringify(before.enrichmentDraft) === JSON.stringify(after.enrichmentDraft), `${label}: enrichmentDraft changed`);
  }
  if (before.enrichmentPublished) {
    assert(
      JSON.stringify(before.enrichmentPublished) === JSON.stringify(after.enrichmentPublished),
      `${label}: enrichmentPublished changed`,
    );
  }
}

function testPureModule() {
  console.log("0) Pure access-plan helper validates and patches surgically");
  assert(accessPlanLib.normalizeAccessPlan("Free") === "Free", "normalize Free");
  assert(accessPlanLib.normalizeAccessPlan("Pro") === "Pro", "normalize Pro");
  assert(accessPlanLib.normalizeAccessPlan("premium") === null, "reject premium");
  assert(accessPlanLib.normalizeAccessPlan("free") === null, "reject lowercase free");
  const plans = [
    { id: "a", title: "A", plan: "Free", status: "published", body: "x" },
    { id: "b", title: "B", plan: "Pro", status: "draft", body: "y" },
  ];
  const applied = accessPlanLib.applyAccessPlanToLessonPlans(plans, ["a", "missing"], "Pro", "2026-08-17T00:00:00.000Z");
  assert(applied.nextLessonPlans[0].plan === "Pro", "a became Pro");
  assert(applied.nextLessonPlans[0].body === "x", "body preserved");
  assert(applied.nextLessonPlans[0].status === "published", "status preserved");
  assert(applied.nextLessonPlans[1].plan === "Pro", "b untouched plan");
  assert(applied.failed.some((f) => f.id === "missing"), "missing id failed");
}

function testClientSourceWiring() {
  console.log("0b) Client wires Set Free/Pro, confirmation, and scroll/filter preserve");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert(appJs.includes('data-curriculum-bulk="set-free"'), "Set Free button present");
  assert(appJs.includes('data-curriculum-bulk="set-pro"'), "Set Pro button present");
  assert(appJs.includes("bulkUpdateAdminCurriculumLessonAccessPlan"), "bulk access-plan fn present");
  assert(appJs.includes("accessPlanEndpoint"), "access plan endpoint config");
  assert(appJs.includes("/api/admin/curriculum/lesson-plans/access-plan"), "endpoint path");
  const start = appJs.indexOf("async function bulkUpdateAdminCurriculumLessonAccessPlan");
  assert(start >= 0, "bulk fn start");
  const end = appJs.indexOf("\nfunction renderAdminCurriculumLessonPlanManager", start);
  const fnBody = appJs.slice(start, end > start ? end : start + 4000);
  assert(fnBody.includes("confirmAction"), "requires confirmAction");
  assert(fnBody.includes("Target access level"), "confirm shows target access level");
  assert(fnBody.includes("Exact lesson titles"), "confirm shows exact titles");
  assert(fnBody.includes("captureAdminLessonListViewState"), "captures filters/scroll before refresh");
  assert(fnBody.includes("restoreAdminLessonListViewState"), "restores filters/scroll after refresh");
  assert(fnBody.includes("confirm: true"), "sends confirm:true only after UI confirm");
  assert(fnBody.includes("failedIds") || fnBody.includes("Failed lessons stay selected"), "keeps failed selected");
}

async function main() {
  testPureModule();
  testClientSourceWiring();

  const freeId = `cur-lp-access-free-${crypto.randomBytes(3).toString("hex")}`;
  const proId = `cur-lp-access-pro-${crypto.randomBytes(3).toString("hex")}`;
  const multiA = `cur-lp-access-multi-a-${crypto.randomBytes(3).toString("hex")}`;
  const multiB = `cur-lp-access-multi-b-${crypto.randomBytes(3).toString("hex")}`;
  const resourceId = `cur-res-access-${crypto.randomBytes(3).toString("hex")}`;

  const freeLesson = buildLesson({
    id: freeId,
    title: "QA Free Colors All Around Us",
    plan: "Free",
    teachingKit: true,
    resourceIds: [resourceId],
  });
  const proLesson = buildLesson({
    id: proId,
    title: "QA Pro Farm Animals",
    plan: "Pro",
    teachingKit: false,
  });
  const multiLessonA = buildLesson({
    id: multiA,
    title: "QA Multi Amazing Apples",
    plan: "Free",
  });
  const multiLessonB = buildLesson({
    id: multiB,
    title: "QA Multi Weather Watchers",
    plan: "Free",
  });
  const resource = {
    id: resourceId,
    title: "QA Access Plan Printable",
    status: "published",
    lessonPlanIds: [freeId],
    fileName: "qa.pdf",
    mimeType: "application/pdf",
    fileData: "data:application/pdf;base64,AAA=",
  };

  writeSeedStore([freeLesson, proLesson, multiLessonA, multiLessonB], [resource]);

  const child = startServer(OWNER);
  try {
    await waitForHealth(child);
    const ownerToken = await login(OWNER);
    let stamp = readStore().siteContent.updatedAt;

    console.log("1) Preview without confirm does not mutate");
    const preview = await setAccessPlan(ownerToken, {
      lessonPlanIds: [freeId],
      plan: "Pro",
      confirm: false,
      expectedUpdatedAt: stamp,
    });
    assert(preview.status === 200 && preview.json?.preview === true, "preview response");
    assert(preview.json.selectedCount === 1, "preview count");
    assert(preview.json.titles?.[0] === freeLesson.title, "preview title");
    assert(findPlan(readStore(), freeId).plan === "Free", "preview must not change plan");

    console.log("2) Unauthorized request rejected");
    const noAuth = await setAccessPlan("not-a-token", {
      lessonPlanIds: [freeId],
      plan: "Pro",
      confirm: true,
      expectedUpdatedAt: stamp,
    });
    assert(noAuth.status === 401, `expected 401, got ${noAuth.status}`);

    console.log("3) Invalid plan rejected");
    const badPlan = await setAccessPlan(ownerToken, {
      lessonPlanIds: [freeId],
      plan: "Premium",
      confirm: true,
      expectedUpdatedAt: stamp,
    });
    assert(badPlan.status === 400 && badPlan.json?.code === "invalid_access_plan", "invalid plan");

    console.log("4) One Free lesson → Pro");
    const beforeFree = structuredClone(findPlan(readStore(), freeId));
    const freeToPro = await setAccessPlan(ownerToken, {
      lessonPlanIds: [freeId],
      plan: "Pro",
      confirm: true,
      expectedUpdatedAt: stamp,
    });
    assert(freeToPro.status === 200 && freeToPro.json?.ok === true, `Free→Pro failed: ${freeToPro.text}`);
    assert(freeToPro.json.updatedCount === 1, "Free→Pro updatedCount");
    stamp = freeToPro.json.siteContentUpdatedAt;
    let store = readStore();
    const afterFree = findPlan(store, freeId);
    assert(afterFree.plan === "Pro", "Free→Pro plan field");
    assertContentFrozen(beforeFree, afterFree, "Free→Pro");

    console.log("5) One Pro lesson → Free");
    const beforePro = structuredClone(findPlan(store, proId));
    const proToFree = await setAccessPlan(ownerToken, {
      lessonPlanIds: [proId],
      plan: "Free",
      confirm: true,
      expectedUpdatedAt: stamp,
    });
    assert(proToFree.status === 200 && proToFree.json?.ok === true, `Pro→Free failed: ${proToFree.text}`);
    assert(proToFree.json.updatedCount === 1, "Pro→Free updatedCount");
    stamp = proToFree.json.siteContentUpdatedAt;
    store = readStore();
    const afterPro = findPlan(store, proId);
    assert(afterPro.plan === "Free", "Pro→Free plan field");
    assertContentFrozen(beforePro, afterPro, "Pro→Free");

    console.log("6) Multiple selected lessons");
    const beforeA = structuredClone(findPlan(store, multiA));
    const beforeB = structuredClone(findPlan(store, multiB));
    const multi = await setAccessPlan(ownerToken, {
      lessonPlanIds: [multiA, multiB],
      plan: "Pro",
      confirm: true,
      expectedUpdatedAt: stamp,
    });
    assert(multi.status === 200 && multi.json.updatedCount === 2, `multi failed: ${multi.text}`);
    stamp = multi.json.siteContentUpdatedAt;
    store = readStore();
    assert(findPlan(store, multiA).plan === "Pro", "multi A Pro");
    assert(findPlan(store, multiB).plan === "Pro", "multi B Pro");
    assertContentFrozen(beforeA, findPlan(store, multiA), "multi A");
    assertContentFrozen(beforeB, findPlan(store, multiB), "multi B");

    console.log("7) Free/Pro filter field reflects immediately in admin curriculum payload");
    const adminLib = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(ownerToken)}`);
    const adminPlans = adminLib.json?.siteContent?.curriculum?.lessonPlans || [];
    const filterPro = adminPlans.filter((p) => p.plan === "Pro").map((p) => p.id);
    const filterFree = adminPlans.filter((p) => p.plan === "Free").map((p) => p.id);
    assert(filterPro.includes(freeId), "filter Pro includes former Free");
    assert(filterPro.includes(multiA) && filterPro.includes(multiB), "filter Pro includes multi");
    assert(filterFree.includes(proId), "filter Free includes former Pro");
    assert(!filterFree.includes(freeId), "filter Free excludes updated lesson");

    console.log("8) Customer gating uses updated plan (linked resource requires Pro)");
    const fileRes = await requestJson(
      "GET",
      `/api/curriculum/resources/file?id=${encodeURIComponent(resourceId)}`,
    );
    assert(fileRes.status === 403, `expected Pro gate 403, got ${fileRes.status} ${fileRes.text}`);
    assert(findPlan(readStore(), freeId).plan === "Pro", "store plan remains Pro for gating");

    console.log("9) Partial failure keeps failed ids and does not claim full success");
    const partial = await setAccessPlan(ownerToken, {
      lessonPlanIds: [proId, "missing-access-plan-id"],
      plan: "Pro",
      confirm: true,
      expectedUpdatedAt: stamp,
    });
    assert(
      partial.status === 207 || partial.json?.ok === false || (partial.json?.failed || []).length > 0,
      `partial failure signaled: ${partial.status} ${partial.text}`,
    );
    assert(
      Array.isArray(partial.json?.failed) && partial.json.failed.some((f) => f.id === "missing-access-plan-id"),
      "failed missing id listed",
    );
    assert(partial.json.ok === false || partial.json.failed.length > 0, "must not silently report full success");
    store = readStore();
    assert(findPlan(store, proId).plan === "Pro", "valid id in partial batch still updated");
  } finally {
    await stopServer(child);
  }

  // Separate process: staff admin can unlock but owner gate rejects access-plan writes.
  writeSeedStore([], []);
  const staffChild = startServer(STAFF);
  try {
    await waitForHealth(staffChild);
    console.log("10) Non-owner admin session rejected when owner gate enforced");
    const staffToken = await login(STAFF);
    const denied = await setAccessPlan(staffToken, {
      lessonPlanIds: ["any-id"],
      plan: "Free",
      confirm: true,
      expectedUpdatedAt: readStore().siteContent?.updatedAt || "",
    });
    assert(
      denied.status === 403,
      `non-owner must be 403, got ${denied.status} ${denied.text}`,
    );
    assert(denied.json?.code === "teaching_kit_owner_required", "owner-required code");
    console.log(`PASS curriculum access-plan bulk (${passed} assertions)`);
  } finally {
    await stopServer(staffChild);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
    try { fs.unlinkSync(STORE_PATH.replace(/\.json$/i, ".admin-sessions.json")); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error.message);
  process.exitCode = 1;
  try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
});
