#!/usr/bin/env node
/**
 * Phase D gap check: public curriculum DTO includes persisted premium fields.
 * Run: npm run test:curriculum-gap
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");
const PORT = 4570 + Math.floor(Math.random() * 200);
const STORE_PATH = path.join(ROOT, "server/data/launch-store.json");
const ADMIN = {
  email: "curriculum-gap-test@example.com",
  password: "curriculum-gap-test-pass",
  code: "curriculum-gap-test-code",
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
        headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
      },
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

async function main() {
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
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const started = Date.now();
    while (Date.now() - started < 15000) {
      try {
        const health = await requestJson("GET", "/api/health");
        if (health.status === 200 && health.json?.ok) break;
      } catch { /* retry */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const login = await requestJson("POST", "/api/admin/login", ADMIN);
    const token = login.json.token;
    const bootstrap = await requestJson("GET", `/api/admin/site-content?adminToken=${encodeURIComponent(token)}`);
    const touch = await requestJson("POST", "/api/admin/site-content", {
      adminToken: token,
      siteContent: { ...bootstrap.json.siteContent, updatedAt: bootstrap.json.siteContent.updatedAt || "" },
    });
    const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V2_SAMPLE, "utf8"));
    assert(parsed.ok, parsed.errors.join(" "));
    const planId = `cur-lp-gap-${crypto.randomBytes(3).toString("hex")}`;
    const save = await requestJson("POST", "/api/admin/curriculum/lesson-plans", {
      adminToken: token,
      expectedUpdatedAt: touch.json.siteContent.updatedAt,
      lessonPlan: { ...parsed.data, id: planId, status: "published", plan: "Free" },
    });
    assert(save.status === 200, `save failed: ${save.status}`);

    const publicLib = await requestJson("GET", "/api/site-content");
    const plan = (publicLib.json.siteContent?.curriculumLibrary?.lessonPlans || []).find((item) => item.id === planId);
    assert(plan, "published free plan in public library");
    const monday = plan.dailyPlans.monday;
    assert(Array.isArray(monday.books), "daily books array present");
    assert(Array.isArray(monday.circleTime), "circle time array present");
    assert(monday.items[0].teacherLanguage.includes("damp"), "premium activity field in public free DTO");
    assert(!monday.items[0].importKey, "public free DTO omits importKey");
    assert(!monday.items[0].sourceKey, "public free DTO omits sourceKey");
    const activity = (publicLib.json.siteContent?.curriculumLibrary?.activities || []).find((item) => item.lessonPlanId === planId);
    assert(activity?.teacherLanguage?.includes("damp"), "activity library premium field in public free DTO");
    assert(!activity?.sourceKey, "public activity DTO omits sourceKey");
    assert(!activity?.itemId, "public activity DTO omits itemId");

    console.log("Curriculum public DTO gap checks passed.");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}

main();
