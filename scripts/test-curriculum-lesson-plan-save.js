#!/usr/bin/env node
/**
 * Regression: curriculum lesson plan save for Phase 2F Infant Soft Sounds import.
 * Covers activity sync, idempotent re-save, 409 retry, and legacy import compatibility.
 * Run: node scripts/test-curriculum-lesson-plan-save.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const PORT = 4530 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, "server/data/launch-store.json");
const IMPORT_PATH = path.join(ROOT, "scripts/curriculum-phase-2f-imports/01-infant-soft-sounds-free.txt");
const LEGACY_IMPORT_PATH = path.join(ROOT, "scripts/curriculum-phase-2f-imports/legacy-backward-compat-sample.txt");
const V3_FULL_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
const ADMIN = {
  email: "lesson-save-test@example.com",
  password: "lesson-save-test-pass",
  code: "lesson-save-test-code",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
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

function waitForHealth(child, timeoutMs = 15000) {
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
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Lesson Save Test",
      NODE_ENV: "test",
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

function parseLessonImport(text) {
  const parsed = parseCurriculumLessonPlanImport(text);
  assert(parsed.ok, parsed.errors.join(" "));
  return parsed.data;
}

async function main() {
  const child = startServer();
  try {
    await waitForHealth(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert(login.status === 200 && login.json?.token, "Login failed");
    const token = login.json.token;

    const legacyParsed = parseCurriculumLessonPlanImport(fs.readFileSync(LEGACY_IMPORT_PATH, "utf8"));
    assert(legacyParsed.ok, `Legacy import should still parse: ${legacyParsed.errors.join(" ")}`);
    assert(legacyParsed.data._activityCount === 8, `Legacy activity count mismatch: ${legacyParsed.data._activityCount}`);
    console.log("0) Legacy ===SECTION=== import format still parses");

    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const touch = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        ...bootstrap.json.siteContent,
        updatedAt: bootstrap.json.siteContent.updatedAt || "",
      },
    });
    assert(touch.status === 200, `Touch failed: ${touch.status}`);
    let expectedUpdatedAt = touch.json.siteContent.updatedAt;
    assert(expectedUpdatedAt, "expectedUpdatedAt missing after touch");

    const parsed = parseLessonImport(fs.readFileSync(IMPORT_PATH, "utf8"));
    assert(parsed.title === "Infant Soft Sounds & Faces", "Unexpected title");
    assert(parsed._activityCount === 8, `Expected 8 activities, parsed ${parsed._activityCount}`);
    const lessonPlanId = `cur-lp-save-test-${crypto.randomBytes(4).toString("hex")}`;
    const lessonPlan = { ...parsed, id: lessonPlanId };

    console.log("1) Empty expectedUpdatedAt returns 409 while server stamp exists");
    const conflict = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: "",
      lessonPlan,
    });
    assert(conflict.status === 409, `Expected 409, got ${conflict.status}`);
    assert(conflict.json.conflict === true, "Conflict flag missing");
    assert(conflict.json.siteContentUpdatedAt, "Conflict payload missing siteContentUpdatedAt");

    console.log("2) Retry with refreshed expectedUpdatedAt saves plan + 8 activities");
    expectedUpdatedAt = conflict.json.siteContentUpdatedAt;
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt,
      lessonPlan,
    });
    assert(save.status === 200, `Save failed: ${save.status} ${save.text}`);
    const activities = (save.json.activities || []).filter((item) => item.status !== "archived");
    assert(activities.length === 8, `Expected 8 activities, got ${activities.length}`);
    assert(save.json.lessonPlan?.id === lessonPlanId, "Lesson id mismatch");
    assert((save.json.lessonPlan.activityIds || []).length === 8, "Lesson activityIds mismatch");
    activities.forEach((activity) => {
      assert(activity.lessonPlanId === lessonPlanId, "Activity missing parent link");
    });
    const firstIds = activities.map((item) => item.id).sort();
    expectedUpdatedAt = save.json.siteContentUpdatedAt;

    console.log("3) Second save keeps the same 8 activity IDs");
    const again = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt,
      lessonPlan: {
        ...save.json.lessonPlan,
        dailyPlans: lessonPlan.dailyPlans,
      },
    });
    assert(again.status === 200, `Re-save failed: ${again.status} ${again.text}`);
    const againActs = (again.json.activities || []).filter((item) => item.status !== "archived");
    assert(againActs.length === 8, `Expected 8 activities on re-save, got ${againActs.length}`);
    const secondIds = againActs.map((item) => item.id).sort();
    assert(JSON.stringify(firstIds) === JSON.stringify(secondIds), "Activity IDs changed on re-save");

    console.log("4) Reload preserves lesson + activities");
    const reload = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    assert(reload.status === 200, "Reload failed");
    const storedPlan = (reload.json.siteContent.curriculum.lessonPlans || []).find((item) => item.id === lessonPlanId);
    const storedActs = (reload.json.siteContent.curriculum.activities || []).filter(
      (item) => item.lessonPlanId === lessonPlanId && item.status !== "archived",
    );
    assert(storedPlan, "Lesson missing after reload");
    assert(storedActs.length === 8, `Expected 8 stored activities, got ${storedActs.length}`);

    console.log("5) v3 import saves 15 activities with objective/description/observation fields");
    const v3Parsed = parseLessonImport(fs.readFileSync(V3_FULL_SAMPLE, "utf8"));
    assert(v3Parsed._activityCount === 15, "v3 activity count");
    const v3LessonId = `cur-lp-v3-save-${crypto.randomBytes(4).toString("hex")}`;
    const v3Plan = { ...v3Parsed, id: v3LessonId };
    delete v3Plan._formatVersion;
    delete v3Plan._activityCount;
    delete v3Plan.dailyPlansCompat;
    delete v3Plan.ageBucket;
    const v3Save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: reload.json.siteContent.updatedAt,
      lessonPlan: v3Plan,
    });
    assert(v3Save.status === 200, `v3 save failed: ${v3Save.status} ${v3Save.text}`);
    const v3Acts = (v3Save.json.activities || []).filter((item) => item.lessonPlanId === v3LessonId && item.status !== "archived");
    assert(v3Acts.length === 15, `Expected 15 v3 activities, got ${v3Acts.length}`);
    v3Acts.forEach((activity) => {
      assert(activity.objective, `${activity.title} missing objective after save`);
      assert(activity.description, `${activity.title} missing description after save`);
      assert(activity.observationOpportunities, `${activity.title} missing observationOpportunities after save`);
    });
    const v3FirstIds = v3Acts.map((item) => item.id).sort();
    const v3Again = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: v3Save.json.siteContentUpdatedAt,
      lessonPlan: { ...v3Save.json.lessonPlan, dailyPlans: v3Plan.dailyPlans },
    });
    assert(v3Again.status === 200, `v3 re-save failed: ${v3Again.status}`);
    const v3AgainActs = (v3Again.json.activities || []).filter((item) => item.lessonPlanId === v3LessonId && item.status !== "archived");
    assert(v3AgainActs.length === 15, "v3 re-save activity count");
    assert(JSON.stringify(v3FirstIds) === JSON.stringify(v3AgainActs.map((item) => item.id).sort()), "v3 activity IDs changed on re-save");

    console.log("\nAll curriculum lesson plan save checks passed.");
  } catch (error) {
    console.error("\nFAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await stopServer(child);
  }
}

main();
