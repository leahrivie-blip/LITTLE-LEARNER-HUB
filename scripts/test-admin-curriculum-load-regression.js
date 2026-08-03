#!/usr/bin/env node
/**
 * Regression: admin curriculum must not be wiped when public site-content refreshes.
 * Run: npm run test:admin-curriculum-load-regression
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PORT = 4760 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-admin-curriculum-load-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "admin-curriculum-load@example.com",
  password: "admin-curriculum-load-pass",
  code: "admin-curriculum-load-code",
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

function samplePlan(id, title) {
  return {
    id,
    title,
    age: "Preschool",
    theme: "Admin Load Regression",
    plan: "Free",
    status: "published",
    weeklyOverview: "Regression fixture plan.",
    learningDomains: ["Approaches to Learning"],
    weeklyMaterials: "Blocks",
    activityIds: [],
    resourceIds: [],
    dailyPlans: {
      monday: { theme: "Day 1", items: [{ itemId: `${id}-mon`, title: "Circle time", activityCategory: "Circle Time" }] },
      tuesday: { theme: "Day 2", items: [{ itemId: `${id}-tue`, title: "Sensory play", activityCategory: "Sensory" }] },
      wednesday: { theme: "Day 3", items: [{ itemId: `${id}-wed`, title: "Art", activityCategory: "Art" }] },
      thursday: { theme: "Day 4", items: [{ itemId: `${id}-thu`, title: "STEM", activityCategory: "STEM" }] },
      friday: { theme: "Day 5", items: [{ itemId: `${id}-fri`, title: "Outdoor", activityCategory: "Outdoor Play" }] },
    },
    updatedAt: "2026-08-03T12:00:00.000Z",
    publishedAt: "2026-08-03T12:00:00.000Z",
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
      ADMIN_NAME: "Admin Curriculum Load Regression",
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
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.match(appJs, /function mergeIncomingPublicSiteContent\(/);
  assert.match(appJs, /siteContentState = mergeIncomingPublicSiteContent\(incoming\)/);
  assert.match(appJs, /fetchWithWakeRetry\([\s\S]*adminEndpoint/);
  assert.match(appJs, /!isAdminUnlocked\(\)\) \{[\s\S]*refreshPublicCurriculumLibrary/);
  assert.match(appJs, /adminCurriculumLoadMismatch/);
  assert.match(appJs, /data-retry-admin-curriculum/);
  console.log("PASS  static admin curriculum load guards");
}

function simulatePublicMergePreservesCurriculum() {
  const appJsPath = path.join(ROOT, "app.js");
  const appJs = fs.readFileSync(appJsPath, "utf8");
  const fnMatch = appJs.match(/function mergeIncomingPublicSiteContent\(incoming\) \{[\s\S]*?\n\}/);
  assert.ok(fnMatch, "mergeIncomingPublicSiteContent must exist");
  const emptySiteContent = () => ({ lessonPlans: {}, activities: [], forms: [], printables: [], menus: [], observations: [] });
  const emptyCurriculumLibrary = () => ({ lessonPlans: [], activities: [], resources: [], series: [], updatedAt: "" });
  let siteContentState = {
    curriculum: {
      lessonPlans: [samplePlan("cur-lp-merge-test", "Merge Test Plan")],
      activities: [],
      resources: [],
      series: [],
      updatedAt: "2026-08-03T12:00:00.000Z",
    },
  };
  const mergeIncomingPublicSiteContent = new Function(
    "incoming",
    "siteContentState",
    "emptySiteContent",
    "emptyCurriculumLibrary",
    `${fnMatch[0]}\nreturn mergeIncomingPublicSiteContent(incoming);`,
  );
  const merged = mergeIncomingPublicSiteContent(
    {
      homepage: { heroHeadline: "Updated headline" },
      curriculumLibrary: {
        lessonPlans: [samplePlan("cur-lp-public-only", "Public Library Plan")],
        activities: [],
        resources: [],
        series: [],
        updatedAt: "2026-08-03T12:01:00.000Z",
      },
    },
    siteContentState,
    emptySiteContent,
    emptyCurriculumLibrary,
  );
  assert.equal(merged.homepage.heroHeadline, "Updated headline");
  assert.equal(merged.curriculumLibrary.lessonPlans.length, 1);
  assert.equal(merged.curriculum.lessonPlans.length, 1);
  assert.equal(merged.curriculum.lessonPlans[0].id, "cur-lp-merge-test");
  console.log("PASS  mergeIncomingPublicSiteContent preserves admin curriculum");
}

async function main() {
  assertStaticGuards();
  simulatePublicMergePreservesCurriculum();

  const fixturePlan = samplePlan("cur-lp-admin-load-regression", "Admin Load Regression Plan");
  const child = startServer({
    users: {},
    siteContent: {
      updatedAt: "2026-08-03T10:00:00.000Z",
      curriculum: {
        lessonPlans: [fixturePlan],
        activities: [],
        resources: [],
        series: [],
        updatedAt: "2026-08-03T10:00:00.000Z",
      },
    },
    adminSessions: {},
  });

  try {
    await waitForBoot(child);

    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(login.status, 200, "admin login");
    const token = login.json.token;

    const adminContent = await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
      Authorization: `Bearer ${token}`,
    });
    assert.equal(adminContent.status, 200, "admin site-content");
    const adminPlans = adminContent.json.siteContent?.curriculum?.lessonPlans || [];
    assert.ok(adminPlans.some((plan) => plan.id === fixturePlan.id), "admin endpoint returns seeded plan");

    const publicContent = await requestJson("GET", `/api/site-content?t=${Date.now()}`);
    assert.equal(publicContent.status, 200, "public site-content");
    assert.equal(publicContent.json.siteContent?.curriculum, undefined, "public payload omits curriculum");
    const publicCount = (publicContent.json.siteContent?.curriculumLibrary?.lessonPlans || []).length;
    assert.ok(publicCount >= 1, "public library still exposes published plans");

    const adminAgain = await requestJson("GET", `/api/admin/site-content?t=${Date.now()}`, null, {
      Authorization: `Bearer ${token}`,
    });
    const adminAgainCount = (adminAgain.json.siteContent?.curriculum?.lessonPlans || []).length;
    assert.ok(adminAgainCount >= adminPlans.length, "server-side curriculum count unchanged after public read");

    console.log("PASS  admin and public curriculum endpoints stay consistent");
    console.log("\nAll admin curriculum load regression tests passed.");
  } finally {
    await stopServer(child);
    fs.rmSync(STORE_PATH, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
