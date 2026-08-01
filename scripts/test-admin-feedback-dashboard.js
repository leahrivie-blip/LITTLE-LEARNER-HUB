#!/usr/bin/env node
/**
 * Unified Admin Feedback dashboard + notification deep-links.
 * Run: node scripts/test-admin-feedback-dashboard.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19620 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-admin-feedback-dash-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN = {
  email: "feedback-dash-admin@test.local",
  password: "feedback-dash-pass",
  code: "feedback-dash-code",
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
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    siteContent: {},
    adminSessions: {},
    feedbackItems: [],
    notifications: [],
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
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const adminNotif = fs.readFileSync(path.join(ROOT, "server/admin-notifications.js"), "utf8");
  const commsApi = fs.readFileSync(path.join(ROOT, "server/comms-api.js"), "utf8");

  assert.match(html, /id="feedbackTypeFilter"/);
  assert.match(html, /id="feedbackSearchInput"/);
  assert.match(html, /Private product feedback/);
  assert.match(appJs, /function openAdminFeedbackItem/);
  assert.match(appJs, /function feedbackNotificationTargetId/);
  assert.match(appJs, /function applyAdminLocationDeepLink/);
  assert.match(appJs, /get\("adminPanel"\)\s*===\s*"feedback"/);
  assert.match(appJs, /admin-feedback-stars/);
  assert.match(appJs, /adminFeedbackFocusId/);
  assert.match(appJs, /adminAnalyticsTabs[\s\S]*?"feedback"/);
  assert.match(appJs, /syncAdminFeedbackTypeFilterOptions/);
  assert.match(css, /\.admin-feedback-toolbar/);
  assert.match(css, /\.ticket-card\.is-highlighted/);
  assert.match(serverJs, /adminPanel=feedback/);
  assert.match(serverJs, /adminFocusRef=/);
  assert.match(adminNotif, /adminPanel/);
  assert.match(commsApi, /deepLink:\s*deepLink/);
  console.log("PASS  static admin feedback dashboard markers");
}

async function testApiDeepLinksAndOptionalFields() {
  const child = startServer();
  try {
    await waitForBoot(child);

    const created = await requestJson("POST", "/api/feedback", {
      type: "Lesson Plan Feedback",
      name: "Dash Tester",
      email: "dash-tester@test.local",
      subject: "Lesson plan feedback: Sample (4 stars)",
      message: "Lesson plan: Sample\nStars: 4 / 5\nFeedback: 4 stars",
      lessonId: "lesson-sample",
      sentiment: "rating",
      stars: 4,
      page: "lesson:lesson-sample",
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    assert.equal(created.json.feedback.stars, 4);
    assert.equal(created.json.feedback.lessonId, "lesson-sample");
    const feedbackId = created.json.feedback.id;
    assert.match(String(feedbackId), /^feedback-/);

    const activity = await requestJson("POST", "/api/feedback", {
      type: "Activity Feedback",
      name: "Dash Tester",
      email: "dash-tester@test.local",
      subject: "Activity feedback: Scoop (Helpful)",
      message: "Activity: Scoop\nFeedback: Helpful",
      activityId: "act-scoop",
      lessonId: "lesson-sample",
      sentiment: "helpful",
      page: "activity:act-scoop",
    });
    assert.equal(activity.status, 200, JSON.stringify(activity.json));
    assert.equal(activity.json.feedback.type, "Activity Feedback");
    assert.equal(activity.json.feedback.activityId, "act-scoop");

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
    assert.ok((list.json.feedback || []).some((item) => item.id === feedbackId && item.stars === 4));

    const analytics = await requestJson("GET", `/api/admin/analytics?adminToken=${encodeURIComponent(token)}`);
    assert.equal(analytics.status, 200, JSON.stringify(analytics.json));
    const feedback = analytics.json?.analytics?.feedback || analytics.json?.feedback || [];
    assert.ok(feedback.some((item) => item.id === feedbackId && item.stars === 4));
    assert.ok(feedback.some((item) => item.type === "Activity Feedback" && item.activityId === "act-scoop"));

    const notifs = await requestJson("GET", `/api/admin/notifications?adminToken=${encodeURIComponent(token)}`);
    assert.equal(notifs.status, 200, JSON.stringify(notifs.json));
    const items = notifs.json?.notifications || notifs.json?.items || [];
    const feedbackNotif = items.find((item) => String(item.refId || "") === feedbackId)
      || items.find((item) => String(item.deepLink || "").includes(feedbackId));
    assert.ok(feedbackNotif, "expected admin notification for feedback create");
    assert.match(String(feedbackNotif.deepLink || ""), /adminPanel=feedback/);
    assert.match(String(feedbackNotif.deepLink || ""), /adminFocusRef=/);
    assert.equal(String(feedbackNotif.refId || ""), feedbackId);

    const adminNotifications = require(path.join(ROOT, "server/admin-notifications.js"));
    const link = adminNotifications.adminDeepLink({
      adminPanel: "feedback",
      refId: feedbackId,
      category: "support",
      type: "admin_new_support",
    });
    assert.match(link, /view=admin/);
    assert.match(link, /adminPanel=feedback/);
    assert.match(link, new RegExp(`adminFocusRef=${encodeURIComponent(feedbackId)}`));

    console.log("PASS  API optional fields + feedback deep-links");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

async function main() {
  testStaticMarkers();
  await testApiDeepLinksAndOptionalFields();
  console.log("\nAll admin feedback dashboard tests passed.");
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
