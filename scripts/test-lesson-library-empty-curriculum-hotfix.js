#!/usr/bin/env node
/**
 * Hotfix regression: empty/malformed curriculum must not wipe populated lesson plans
 * via admin site-content saves, and the public library must expose Retry empty states.
 *
 * Run: node scripts/test-lesson-library-empty-curriculum-hotfix.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4720 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-empty-hotfix-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-empty-hotfix@example.com",
  password: "lesson-empty-hotfix-pass",
  code: "lesson-empty-hotfix-code",
};

function requestJson(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method, headers: reqHeaders, timeout: 30000 },
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

function samplePlan(id, title, age = "Preschool") {
  return {
    id,
    title,
    age,
    theme: "Hotfix Theme",
    plan: "Free",
    status: "published",
    weeklyOverview: "A published free sample plan for empty-library hotfix coverage.",
    learningDomains: ["Approaches to Learning"],
    weeklyMaterials: "Blocks",
    activityIds: [],
    resourceIds: [],
    dailyPlans: {
      monday: { theme: "Day 1", items: [] },
      tuesday: { theme: "Day 2", items: [] },
      wednesday: { theme: "Day 3", items: [] },
      thursday: { theme: "Day 4", items: [] },
      friday: { theme: "Day 5", items: [] },
    },
    updatedAt: "2026-07-22T12:00:00.000Z",
    publishedAt: "2026-07-22T12:00:00.000Z",
  };
}

function startServer(initialStore) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(initialStore, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Lesson Empty Hotfix",
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await requestJson("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error("server exited");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("boot timeout");
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 3000);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

function assertStaticGuards() {
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

  assert.match(serverJs, /shouldPreserveExistingCurriculum/);
  assert.match(serverJs, /confirmCurriculumReplace/);
  assert.match(serverJs, /curriculumLessonPlans/);
  assert.match(serverJs, /curriculum_wipe_blocked_site_content_save/);
  assert.match(appJs, /data-retry-curriculum-library/);
  assert.match(appJs, /retryPublicCurriculumLibraryLoad/);
  assert.match(appJs, /curriculumLibraryLoadFailed/);
  assert.match(appJs, /delete siteContentPayload\.curriculum/);
  assert.match(appJs, /Skipping malformed curriculum lesson plan/);
  assert.match(sw, /llh-shell-v109-lesson-empty-hotfix/);
  assert.match(indexHtml, /app\.js\?v=20260722-lesson-empty-hotfix/);
  console.log("PASS  static hotfix markers");
}

async function main() {
  assertStaticGuards();

  const seededPlans = [
    samplePlan("cur-lp-hotfix-colors", "Hotfix Colors Everywhere", "Preschool"),
    samplePlan("cur-lp-hotfix-infants", "Hotfix Infant Explore", "Infant"),
    samplePlan("cur-lp-hotfix-toddlers", "Hotfix Toddler Friends", "Toddler"),
    samplePlan("cur-lp-hotfix-featured", "Hotfix Featured Week", "Preschool"),
    samplePlan("cur-lp-hotfix-free-two", "Hotfix Free Two", "Toddler"),
  ];
  seededPlans[3].status = "featured";

  const child = startServer({
    users: {},
    siteContent: {
      updatedAt: "2026-07-22T10:00:00.000Z",
      curriculum: {
        lessonPlans: seededPlans,
        activities: [],
        resources: [],
        series: [],
        updatedAt: "2026-07-22T10:00:00.000Z",
      },
    },
    adminSessions: {},
  });

  try {
    await waitForBoot(child);

    const beforePublic = await requestJson("GET", "/api/site-content");
    assert.equal(beforePublic.status, 200, "public site-content should load");
    const beforeCount = (beforePublic.json.siteContent?.curriculumLibrary?.lessonPlans || []).length;
    // Startup seeders may add packaged plans on top of the seeded fixture.
    assert.ok(beforeCount >= 5, `expected seeded/public plans before wipe attempt, got ${beforeCount}`);
    const beforeIds = new Set(
      (beforePublic.json.siteContent?.curriculumLibrary?.lessonPlans || []).map((plan) => plan.id),
    );
    assert.ok(beforeIds.has("cur-lp-hotfix-featured"), "fixture featured plan must be present before wipe attempt");

    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(login.status, 200, "admin login");
    const token = login.json.token;

    // Reproduce the live failure mode: admin site-content save with empty curriculum
    // (as if drafted from a public hydrate / emptyCurriculum fill).
    const wipeAttempt = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        updatedAt: beforePublic.json.siteContent?.updatedAt || "2026-07-22T10:00:00.000Z",
        homepage: { heroHeadline: "Hotfix headline only" },
        curriculum: {
          lessonPlans: [],
          activities: [],
          resources: [],
          series: [],
          updatedAt: "",
        },
      },
    });
    assert.equal(wipeAttempt.status, 200, `site-content save should succeed while preserving curriculum (${wipeAttempt.text?.slice(0, 200)})`);
    const savedCount = (wipeAttempt.json.siteContent?.curriculum?.lessonPlans || []).length;
    assert.ok(savedCount >= beforeCount, `server must preserve existing curriculum lesson plans (before=${beforeCount}, after=${savedCount})`);
    assert.ok(savedCount > 0, "curriculum must not be empty after wipe attempt");

    const afterPublic = await requestJson("GET", "/api/site-content");
    assert.equal(afterPublic.status, 200);
    const afterCount = (afterPublic.json.siteContent?.curriculumLibrary?.lessonPlans || []).length;
    assert.equal(afterCount, beforeCount, `public library count must stay stable after empty curriculum save (before=${beforeCount}, after=${afterCount})`);
    assert.ok(
      (afterPublic.json.siteContent?.curriculumLibrary?.lessonPlans || []).some((plan) => plan.id === "cur-lp-hotfix-featured"),
      "featured plan must remain publicly listed",
    );

    // Omitting curriculum entirely must also keep existing plans.
    const omitSave = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: {
        updatedAt: wipeAttempt.json.siteContent.updatedAt,
        announcement: { text: "Hotfix announcement", visible: false },
      },
    });
    assert.equal(omitSave.status, 200);
    assert.equal((omitSave.json.siteContent?.curriculum?.lessonPlans || []).length, savedCount);

    // Explicit replace remains available for intentional rebuilds.
    const replace = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      confirmCurriculumReplace: "REPLACE_CURRICULUM",
      siteContent: {
        updatedAt: omitSave.json.siteContent.updatedAt,
        curriculum: {
          lessonPlans: [samplePlan("cur-lp-hotfix-replaced", "Replaced Only Plan")],
          activities: [],
          resources: [],
          series: [],
          updatedAt: "2026-07-22T12:30:00.000Z",
        },
      },
    });
    assert.equal(replace.status, 200);
    assert.equal((replace.json.siteContent?.curriculum?.lessonPlans || []).length, 1);
    assert.equal(replace.json.siteContent.curriculum.lessonPlans[0].id, "cur-lp-hotfix-replaced");

    const replacedPublic = await requestJson("GET", "/api/site-content");
    assert.equal((replacedPublic.json.siteContent?.curriculumLibrary?.lessonPlans || []).length, 1);

    console.log("PASS  curriculum wipe protection via site-content save");
    console.log("PASS  public library empty-wipe regression");
    console.log("\nAll lesson-library empty curriculum hotfix tests passed.");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
