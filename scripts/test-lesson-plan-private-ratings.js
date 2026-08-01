#!/usr/bin/env node
/**
 * Private lesson-plan star ratings (extend workspace thumbs).
 * Run: node scripts/test-lesson-plan-private-ratings.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19560 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-lesson-stars-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "lesson-stars-admin@test.local",
  password: "lesson-stars-pass",
  code: "lesson-stars-code",
};

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
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const messagingCss = fs.readFileSync(path.join(ROOT, "styles/llh-messaging.css"), "utf8");

  assert.match(appJs, /data-lesson-star/);
  assert.match(appJs, /Rate this lesson plan/);
  assert.match(appJs, /Private to Leah/);
  assert.match(appJs, /markLessonWorkspaceStarsSelected/);
  assert.match(appJs, /sentiment:\s*"rating"/);
  assert.match(appJs, /payload\.stars\s*=\s*roundedStars/);
  assert.match(appJs, /admin-feedback-stars/);
  assert.match(messagingCss, /\.lesson-workspace-star-rating/);
  assert.match(messagingCss, /\.lesson-workspace-star-btn/);

  // Keep public homepage free of AggregateRating / sticky nav stars.
  assert.doesNotMatch(html, /AggregateRating|aggregateRating/);
  assert.doesNotMatch(html, /llh-nav-rating|lp-review-stars|llh-reviews-stars/);
  assert.doesNotMatch(html, /Rated 5 stars/);
  console.log("PASS  static private lesson rating markers");
}

async function testApiPersistence() {
  const child = startServer();
  try {
    await waitForBoot(child);

    for (const stars of [1, 3, 5]) {
      const created = await requestJson("POST", "/api/feedback", {
        type: "Lesson Plan Feedback",
        name: "Rating Tester",
        email: `rater-${stars}@test.local`,
        subject: `Lesson plan feedback: Sample (${stars} stars)`,
        message: `Lesson plan: Sample\nLesson ID: sample-lesson\nStars: ${stars} / 5\nFeedback: ${stars} stars`,
        lessonId: "sample-lesson",
        sentiment: "rating",
        stars,
        page: "lesson:sample-lesson",
      });
      assert.equal(created.status, 200, JSON.stringify(created.json));
      assert.equal(created.json.feedback.stars, stars);
      assert.equal(created.json.feedback.lessonId, "sample-lesson");
      assert.equal(created.json.feedback.type, "Lesson Plan Feedback");
    }

    const login = await requestJson("POST", "/api/admin/login", {
      email: ADMIN.email,
      password: ADMIN.password,
      code: ADMIN.code,
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const token = login.json.token;
    assert.ok(token);

    const list = await requestJson("GET", `/api/feedback?adminToken=${encodeURIComponent(token)}`);
    assert.equal(list.status, 200, JSON.stringify(list.json));
    const items = list.json.feedback || [];
    assert.ok(items.filter((item) => item.lessonId === "sample-lesson" && item.stars).length >= 3);

    const analytics = await requestJson("GET", `/api/admin/analytics?adminToken=${encodeURIComponent(token)}`);
    assert.equal(analytics.status, 200, JSON.stringify(analytics.json));
    const feedback = analytics.json?.analytics?.feedback || analytics.json?.feedback || [];
    assert.ok(feedback.some((item) => item.stars === 5 && item.lessonId === "sample-lesson"));

    console.log("PASS  API + admin visibility for private lesson stars");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

async function main() {
  testStaticMarkers();
  await testApiPersistence();
  console.log("\nAll lesson-plan private rating tests passed.");
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
