#!/usr/bin/env node
/**
 * Private activity 👍/👎 feedback.
 * Run: node scripts/test-activity-private-thumbs.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19580 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-activity-thumbs-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "activity-thumbs-admin@test.local",
  password: "activity-thumbs-pass",
  code: "activity-thumbs-code",
};

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
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const messagingCss = fs.readFileSync(path.join(ROOT, "styles/llh-messaging.css"), "utf8");

  assert.match(appJs, /activityViewerFeedbackHtml/);
  assert.match(appJs, /submitActivityFeedback/);
  assert.match(appJs, /data-activity-feedback/);
  assert.match(appJs, /Was this activity helpful\?/);
  assert.match(appJs, /Private to Leah/);
  assert.match(appJs, /type:\s*"Activity Feedback"/);
  assert.match(appJs, /trackEvent\("activity_feedback"/);
  assert.match(appJs, /\$\{body\}\$\{activityViewerFeedbackHtml\(resource\)\}/);
  assert.match(html, /value="Activity Feedback"/);
  assert.match(serverJs, /"Activity Feedback"/);
  assert.match(messagingCss, /\.activity-viewer-feedback/);

  assert.doesNotMatch(html, /AggregateRating|aggregateRating/);
  assert.doesNotMatch(html, /llh-nav-rating|lp-review-stars|llh-reviews-stars/);
  assert.doesNotMatch(appJs, /activityViewerFeedbackHtml[\s\S]{0,800}AggregateRating/);
  console.log("PASS  static activity private thumbs markers");
}

async function testApiAndAdmin() {
  const child = startServer();
  try {
    await waitForBoot(child);

    const helpful = await requestJson("POST", "/api/feedback", {
      type: "Activity Feedback",
      name: "Activity Tester",
      email: "activity-helpful@test.local",
      subject: "Activity feedback: Texture Scoop (Helpful)",
      message: "Activity: Texture Scoop\nActivity ID: act-texture\nFeedback: Helpful\nMarked as helpful.",
      activityId: "act-texture",
      lessonId: "lesson-colors",
      sentiment: "helpful",
      page: "activity:act-texture",
    });
    assert.equal(helpful.status, 200, JSON.stringify(helpful.json));
    assert.equal(helpful.json.feedback.type, "Activity Feedback");
    assert.equal(helpful.json.feedback.activityId, "act-texture");
    assert.equal(helpful.json.feedback.lessonId, "lesson-colors");
    assert.equal(helpful.json.feedback.sentiment, "helpful");

    const needsWork = await requestJson("POST", "/api/feedback", {
      type: "Activity Feedback",
      name: "Activity Tester",
      email: "activity-needs@test.local",
      subject: "Activity feedback: Texture Scoop (Needs Improvement)",
      message: "Activity: Texture Scoop\nActivity ID: act-texture\nFeedback: Needs Improvement",
      activityId: "act-texture",
      lessonId: "lesson-colors",
      sentiment: "needs-improvement",
      page: "activity:act-texture",
    });
    assert.equal(needsWork.status, 200, JSON.stringify(needsWork.json));
    assert.equal(needsWork.json.feedback.sentiment, "needs-improvement");

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
    assert.ok(items.some((item) => item.type === "Activity Feedback" && item.activityId === "act-texture" && item.sentiment === "helpful"));
    assert.ok(items.some((item) => item.type === "Activity Feedback" && item.sentiment === "needs-improvement"));

    const analytics = await requestJson("GET", `/api/admin/analytics?adminToken=${encodeURIComponent(token)}`);
    assert.equal(analytics.status, 200, JSON.stringify(analytics.json));
    const feedback = analytics.json?.analytics?.feedback || analytics.json?.feedback || [];
    assert.ok(feedback.some((item) => item.type === "Activity Feedback" && item.activityId === "act-texture"));

    console.log("PASS  API + admin visibility for activity thumbs");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

async function main() {
  testStaticMarkers();
  await testApiAndAdmin();
  console.log("\nAll activity private thumbs tests passed.");
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
