#!/usr/bin/env node
/**
 * Cold-start / installed-app curriculum library payload guards.
 * Ensures Pro browse lists stay slim and full content stays on detail endpoints.
 *
 * Run: node scripts/test-curriculum-library-cold-start.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
require("./curriculum-lesson-import-parser.js");
const { parseCurriculumLessonPlanImportV5 } = require("./curriculum-lesson-import-v4.js");

const ROOT = path.join(__dirname, "..");
const SAMPLE = path.join(ROOT, "scripts/curriculum-toddler-pro-batch3-imports/10-toddler-fossil-hunters-pro.txt");
const PORT = 4590 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(os.tmpdir(), `llh-cold-start-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "cold-start@example.com",
  password: "cold-start-pass",
  code: "cold-start-code",
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

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      "pro@cold-start.test": {
        email: "pro@cold-start.test",
        plan: "Pro",
        subscriptionStatus: "active",
        stripeSubscriptionStatus: "active",
      },
    },
    siteContent: {},
    adminSessions: {},
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      ADMIN_NAME: "Cold Start",
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

async function main() {
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  assert.match(appJs, /llhCurriculumLibraryCacheV1/);
  assert.match(appJs, /hydrateCurriculumLibraryFromCache/);
  assert.match(appJs, /Loading lesson plans/);
  assert.match(sw, /isShellAssetRequest/);
  assert.match(sw, /NETWORK_TIMEOUT_MS/);

  const child = startServer();
  try {
    await waitForBoot(child);
    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    assert.equal(login.status, 200, "admin login");
    const token = login.json.token;
    const content = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const expectedUpdatedAt = content.json.siteContent?.updatedAt || "";
    const parsed = parseCurriculumLessonPlanImportV5(fs.readFileSync(SAMPLE, "utf8"));
    assert.equal(parsed.ok, true, parsed.errors?.join("; "));
    const plan = {
      ...parsed.data,
      id: "cur-lp-cold-start-fossil-hunters",
      plan: "Pro",
      status: "published",
      title: "Cold Start Fossil Hunters",
      age: "Toddler",
    };
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt,
      lessonPlan: plan,
    });
    assert.equal(save.status, 200, `save failed ${save.status} ${save.text?.slice(0, 200)}`);

    const proLib = await requestJson("GET", "/api/site-content", null, {
      Authorization: "Bearer test:pro@cold-start.test",
    });
    assert.equal(proLib.status, 200);
    const listed = (proLib.json.siteContent?.curriculumLibrary?.lessonPlans || [])
      .find((item) => item.id === plan.id);
    assert.ok(listed, "pro library lists the plan");
    assert.equal(listed.locked, false, "pro list plan unlocked");
    assert.ok(!listed.dailyPlans, "pro browse list must omit dailyPlans");
    assert.ok(listed.activityCount > 0, "pro browse list keeps activityCount");

    const activities = proLib.json.siteContent?.curriculumLibrary?.activities || [];
    const listedAct = activities.find((item) => item.lessonPlanId === plan.id);
    assert.ok(listedAct, "pro library lists activities");
    assert.ok(!listedAct.steps && !listedAct.materials, "pro browse activities omit how-to fields");

    const detail = await requestJson("GET", `/api/curriculum/lesson-plans/${encodeURIComponent(plan.id)}`, null, {
      Authorization: "Bearer test:pro@cold-start.test",
    });
    assert.equal(detail.status, 200, "pro detail still returns full plan");
    assert.ok(detail.json.lessonPlan?.dailyPlans?.monday?.items?.length, "detail includes dailyPlans");

    console.log("PASS  curriculum library cold-start guards");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
