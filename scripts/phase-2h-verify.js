#!/usr/bin/env node
/**
 * Phase 2H verification:
 * 1) Confirm empty curriculum counts
 * 2) Save one temp lesson with one activity → sync creates 1 activity
 * 3) Confirm public library adapters see published content
 * 4) Delete temp lesson (archive wipe via curriculum replace) → counts back to 0
 * 5) Confirm legacy generators are gone from app.js
 *
 * Usage: node scripts/phase-2h-verify.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const STORE = path.join(ROOT, "server/data/launch-store.json");
const PORT = 8765 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function readStore() {
  return JSON.parse(fs.readFileSync(STORE, "utf8"));
}

function curriculumCounts(store = readStore()) {
  const cur = store.siteContent?.curriculum || {};
  return {
    lessonPlans: (cur.lessonPlans || []).length,
    activities: (cur.activities || []).length,
    resources: (cur.resources || []).length,
  };
}

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      `${BASE}${urlPath}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let json = null;
          try { json = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
          resolve({ status: res.statusCode, json, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(proc, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (proc.exitCode != null) throw new Error(`Server exited early: ${proc.exitCode}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server health check timed out");
}

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert(!appJs.includes("function buildLessonPlans"), "buildLessonPlans must be removed");
  assert(!appJs.includes("function buildActivityLibrary"), "buildActivityLibrary must be removed");
  assert(!appJs.includes("CURRICULUM_LIBRARY_FALLBACK_TO_LEGACY"), "fallback constant must be removed");
  assert(appJs.includes("New play-based lesson plans are being added."), "lesson empty state missing");
  assert(appJs.includes("Activities will appear automatically when lesson plans are published."), "activity empty state missing");
  assert(/function useCurriculumLibrarySources\(\)\s*\{\s*return true;/.test(appJs), "useCurriculumLibrarySources must always be true");

  const before = curriculumCounts();
  assert(before.lessonPlans === 0 && before.activities === 0 && before.resources === 0,
    `Expected empty curriculum before verify, got ${JSON.stringify(before)}`);

  const env = {
    ...process.env,
    PORT: String(PORT),
    ADMIN_EMAIL: "phase2h@test.local",
    ADMIN_PASSWORD: "phase2h-verify-pass",
    ADMIN_ACCESS_CODE: "phase2h",
  };
  const proc = spawn("node", ["server/index.js"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  let serverLog = "";
  proc.stdout.on("data", (d) => { serverLog += d.toString(); });
  proc.stderr.on("data", (d) => { serverLog += d.toString(); });

  try {
    await waitForHealth(proc);

    const login = await request("POST", "/api/admin/login", {
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
      code: env.ADMIN_ACCESS_CODE,
    });
    assert(login.status === 200 && login.json?.token, `Admin login failed: ${login.status} ${login.raw?.slice(0, 200)}`);
    const adminToken = login.json.token;

    const publicEmpty = await request("GET", "/api/site-content");
    assert(publicEmpty.status === 200, "public site-content failed");
    assert(publicEmpty.json?.siteContent?.playBasedCurriculum === true, "playBasedCurriculum must be true publicly");
    assert(Array.isArray(publicEmpty.json?.siteContent?.curriculumLibrary?.lessonPlans), "curriculumLibrary required");
    assert(publicEmpty.json.siteContent.curriculumLibrary.lessonPlans.length === 0, "public lessons must start empty");
    assert(Object.keys(publicEmpty.json.siteContent.lessonPlans || {}).length === 0, "legacy lessonPlans must be empty publicly");
    assert((publicEmpty.json.siteContent.activities || []).length === 0, "legacy activities must be empty publicly");

    const fullBackup = await request("GET", `/api/admin/curriculum/backup/full?adminToken=${encodeURIComponent(adminToken)}`);
    assert(fullBackup.status === 200 && fullBackup.json?.checksum, "full backup failed");
    assert(fullBackup.json.curriculum?.counts?.curriculumLessonPlans === 0, "backup curriculum count mismatch");

    const now = new Date().toISOString();
    const lessonPlan = {
      id: "cur-lp-phase2h-verify",
      title: "Phase 2H Verify Lesson",
      theme: "Verify",
      age: "Toddler",
      plan: "Free",
      status: "published",
      weeklyOverview: "Temporary verification lesson for Phase 2H.",
      weeklyMaterials: "None",
      learningDomains: ["Language & Literacy"],
      dailyPlans: {
        monday: {
          items: [{
            itemId: "item-phase2h-verify-1",
            activityCategory: "Sensory Play",
            title: "Verify Mirror Play",
            description: "One temporary activity.",
            materials: "Mirror",
            steps: "1. Look\n2. Smile",
            learningGoals: ["Notice faces"],
          }],
        },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      books: [],
      songs: [],
      resourceIds: [],
      createdAt: now,
      updatedAt: now,
    };

    const save = await request("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken,
      lessonPlan,
      expectedUpdatedAt: readStore().siteContent?.updatedAt || "",
    });
    assert(save.status === 200, `Save failed: ${save.status} ${save.raw?.slice(0, 400)}`);
    assert(save.json?.lessonPlan?.id === lessonPlan.id, "saved lesson id mismatch");
    const synced = (save.json.activities || []).filter((a) => a.status !== "archived");
    assert(synced.length === 1, `Expected exactly 1 synced activity, got ${synced.length}`);
    assert(synced[0].lessonPlanId === lessonPlan.id, "activity parent link missing");

    const mid = curriculumCounts();
    assert(mid.lessonPlans === 1 && mid.activities === 1, `After save expected 1/1, got ${JSON.stringify(mid)}`);

    const publicLive = await request("GET", "/api/site-content");
    assert(publicLive.json.siteContent.curriculumLibrary.lessonPlans.length === 1, "published lesson missing from public library");
    assert(publicLive.json.siteContent.curriculumLibrary.activities.length === 1, "published activity missing from public library");

    // Wipe back to empty (also clears legacy CMS fields)
    const wipe = await request("POST", "/api/admin/curriculum/wipe", {
      adminToken,
      confirm: "WIPE_CURRICULUM",
    });
    assert(wipe.status === 200 && wipe.json?.ok, `Wipe failed: ${wipe.status} ${wipe.raw?.slice(0, 300)}`);

    const after = curriculumCounts();
    assert(after.lessonPlans === 0 && after.activities === 0 && after.resources === 0,
      `Expected empty after wipe, got ${JSON.stringify(after)}`);

    const publicFinal = await request("GET", "/api/site-content");
    assert(publicFinal.json.siteContent.curriculumLibrary.lessonPlans.length === 0, "public lessons not empty after wipe");
    assert(publicFinal.json.siteContent.curriculumLibrary.activities.length === 0, "public activities not empty after wipe");

    console.log(JSON.stringify({
      ok: true,
      backupsVerified: Boolean(fullBackup.json.checksum),
      syncCreatedActivities: 1,
      finalCounts: after,
      legacyGeneratorsRemoved: true,
      playBasedAlwaysOn: true,
    }, null, 2));
  } finally {
    proc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    if (proc.exitCode == null) proc.kill("SIGKILL");
  }
}

main().catch((error) => {
  console.error("Phase 2H verify FAILED:", error.message);
  process.exit(1);
});
