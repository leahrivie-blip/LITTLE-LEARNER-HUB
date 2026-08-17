#!/usr/bin/env node
/**
 * Homepage "Help Shape Little Learner Hub" private feedback.
 * Run: node scripts/test-homepage-shape-feedback.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19520 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-shape-feedback-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "shape-feedback-admin@test.local",
  password: "shape-feedback-pass",
  code: "shape-feedback-code",
};

const CATEGORIES = [
  "New Feature",
  "Lesson Plan Request",
  "Activity Request",
  "Bug Report",
  "General Feedback",
];

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
  fs.writeFileSync(STORE_PATH, JSON.stringify({ users: {}, siteContent: {}, adminSessions: {}, feedbackItems: [] }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      ADMIN_ACCESS_CODE: ADMIN.code,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      NODE_ENV: "test",
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
    await new Promise((resolve) => setTimeout(resolve, 100));
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

function testStaticMarkers() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const homeCss = fs.readFileSync(path.join(ROOT, "styles/llh-homepage.css"), "utf8");

  assert.match(html, /id="ideaRequestModal"/);
  assert.match(appJs, /submitHomeShapeFeedbackForm/);
  for (const category of CATEGORIES) {
    assert.match(appJs + html, new RegExp(category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const reviewsIdx = html.indexOf('id="homeReviews"');
  const pricingIdx = html.indexOf('id="homePricing"');
  assert.ok(reviewsIdx > -1 && pricingIdx > reviewsIdx, "pricing must follow reviews");

  assert.doesNotMatch(html, /lp-review-stars|llh-reviews-stars|★★★★★|⭐⭐⭐⭐⭐/);
  assert.doesNotMatch(html, /AggregateRating|aggregateRating/);

  assert.match(appJs, /submitHomeShapeFeedbackForm/);
  assert.match(appJs, /source:\s*"homepage_shape"/);
  assert.match(appJs, /bindHomeShapeFeedbackForm/);
  assert.match(homeCss, /\.llh-shape-feedback-form/);
  console.log("PASS  static homepage shape-feedback markers");
}

async function testApiAndAdmin() {
  const child = startServer();
  try {
    await waitForBoot(child);

    for (const type of CATEGORIES) {
      const created = await requestJson("POST", "/api/feedback", {
        type,
        name: "Shape Tester",
        email: type === "General Feedback" ? "" : `shape-${type.toLowerCase().replace(/\s+/g, "-")}@test.local`,
        subject: type,
        message: `Homepage shape feedback for ${type}`,
        page: "#homeShapeFeedback",
        sourceUrl: `http://127.0.0.1:${PORT}/#homeShapeFeedback`,
      });
      assert.equal(created.status, 200, JSON.stringify(created.json));
      assert.equal(created.json?.feedback?.type, type, `type should persist as ${type}`);
      assert.match(String(created.json?.feedback?.page || ""), /homeShapeFeedback/);
    }

    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const token = login.json?.token;
    assert.ok(token, "admin token required");

    const list = await requestJson("GET", `/api/feedback?adminToken=${encodeURIComponent(token)}`);
    assert.equal(list.status, 200, JSON.stringify(list.json));
    const items = list.json?.feedback || [];
    for (const type of CATEGORIES) {
      assert.ok(
        items.some((item) => item.type === type && /homeShapeFeedback/.test(String(item.page || item.sourceUrl || ""))),
        `admin feedback list missing ${type}`,
      );
    }

    const analytics = await requestJson("GET", `/api/admin/analytics?adminToken=${encodeURIComponent(token)}`);
    assert.equal(analytics.status, 200, JSON.stringify(analytics.json));
    const feedback = analytics.json?.analytics?.feedback || analytics.json?.feedback || [];
    assert.ok(feedback.length >= CATEGORIES.length, "admin analytics should include shape feedback");
    for (const type of CATEGORIES) {
      assert.ok(feedback.some((item) => item.type === type), `analytics missing ${type}`);
    }

    console.log("PASS  API create + admin visibility for homepage shape feedback");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

async function main() {
  testStaticMarkers();
  await testApiAndAdmin();
  console.log("\nAll homepage shape-feedback tests passed.");
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
