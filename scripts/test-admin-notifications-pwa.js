#!/usr/bin/env node
/**
 * Admin notifications + PWA/persist contract checks.
 * Run: node scripts/test-admin-notifications-pwa.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { spawn } = require("child_process");
const crypto = require("crypto");
const adminNotifications = require("../server/admin-notifications.js");

const ROOT = path.join(__dirname, "..");
const PORT = 19850 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-admin-notif-${crypto.randomBytes(4).toString("hex")}.json`);
const ADMIN_EMAIL = "owner-alerts@test.local";
const ADMIN_PASSWORD = "OwnerAlerts!234";
const ADMIN_CODE = "ALERTS";

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

async function request(method, urlPath, body, token) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = {};
        try { json = JSON.parse(text); } catch { /* ignore */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {},
    notifications: [],
    messages: [],
    pushSubscriptions: [],
    notificationPreferences: {},
    supportTickets: [],
    foundingMembers: [],
  }, null, 2));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
      DATABASE_PROVIDER: "local-json",
      LLH_STORE_PATH: STORE_PATH,
      EMAIL_AUTOMATIONS_ENABLED: "false",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => { output += d; });
  child.stderr.on("data", (d) => { output += d; });
  child.__output = () => output;
  return child;
}

async function waitForBoot(child) {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await request("GET", "/api/health");
      if (res.status === 200) return;
    } catch { /* retry */ }
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.__output()}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not boot");
}

const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const manifest = fs.readFileSync(path.join(ROOT, "site.webmanifest"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");

test("manifest includes Admin shortcut and install metadata", () => {
  const json = JSON.parse(manifest);
  assert.equal(json.name, "Little Learner Hub");
  assert.ok(Array.isArray(json.shortcuts));
  assert.ok(json.shortcuts.some((s) => /admin/i.test(s.url)));
  assert.ok(json.shortcuts.some((s) => /messages/i.test(s.url)));
  assert.equal(json.display, "standalone");
});

test("install UX covers iPhone/iPad/Android/Desktop and guests", () => {
  assert.match(appJs, /iPhone/);
  assert.match(appJs, /iPad/);
  assert.match(appJs, /Desktop \(Chrome \/ Edge\)/);
  assert.match(appJs, /function shouldShowInstallPromptCard/);
  assert.doesNotMatch(
    appJs.slice(appJs.indexOf("function shouldShowInstallPromptCard"), appJs.indexOf("function shouldShowInstallPromptCard") + 350),
    /if \(!currentUser/,
  );
  assert.match(indexHtml, /apple-touch-startup-image/);
  assert.match(indexHtml, /keepSignedInInput/);
  assert.match(indexHtml, /adminNotificationCenter/);
  assert.match(indexHtml, /adminNavBadge/);
});

test("persistent login prefers localStorage for member session tokens", () => {
  assert.match(appJs, /LLH_MEMBER_PERSIST_FLAG/);
  assert.match(appJs, /memberWantsPersistentSession/);
  assert.match(appJs, /browserLocalPersistence/);
  assert.match(appJs, /browserSessionPersistence/);
  assert.match(indexHtml, /Keep me signed in on this device/);
  assert.match(appJs, /Trust this device/);
  assert.match(appJs, /localStorage\.setItem\(LLH_MEMBER_SESSION_KEY/);
});

test("admin notification helpers dedupe and categorize", () => {
  const store = { notifications: [], __adminEmail: ADMIN_EMAIL };
  assert.equal(adminNotifications.inferCategory("admin_new_signup"), "signup");
  assert.equal(adminNotifications.inferCategory("admin_payment_failed"), "billing");
  assert.equal(adminNotifications.inferCategory("admin_new_message"), "messaging");
  assert.match(adminNotifications.adminDeepLink({ category: "billing" }), /view=admin/);
  store.notifications.push({
    id: "n1",
    email: ADMIN_EMAIL,
    type: "admin_new_signup",
    refId: "signup:a@test.com",
    createdAt: new Date().toISOString(),
  });
  assert.equal(
    adminNotifications.isDuplicateAdminAlert(store, { type: "admin_new_signup", refId: "signup:a@test.com" }),
    true,
  );
});

test("cache bust versions aligned for admin-notif-pwa", () => {
  assert.match(indexHtml, /app\.js\?v=20260722-full-int/);
  assert.match(sw, /llh-shell-v109-full-int/);
  assert.match(sw, /app\.js\?v=20260722-full-int/);
});

async function integration() {
  const child = startServer();
  try {
    await waitForBoot(child);
    const login = await request("POST", "/api/admin/login", {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      code: ADMIN_CODE,
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const token = login.json.token;
    assert.ok(token);

    const signup = await request("POST", "/api/account/profile", {
      email: "new-provider@example.com",
      firstName: "New",
      lastName: "Provider",
      accountType: "home_daycare",
      role: "owner",
      signup: true,
    });
    assert.equal(signup.status, 200, signup.text);

    // Allow async alert write
    await new Promise((r) => setTimeout(r, 300));

    const list = await request("GET", `/api/admin/notifications?adminToken=${encodeURIComponent(token)}`);
    assert.equal(list.status, 200, list.text);
    assert.ok(list.json.unreadCount >= 1, "signup should create admin notification");
    assert.ok((list.json.notifications || []).some((n) => n.type === "admin_new_signup"));

    const mark = await request("POST", "/api/admin/notifications/mark-read", {
      adminToken: token,
      all: true,
    });
    assert.equal(mark.status, 200);
    assert.equal(mark.json.unreadCount, 0);

    // Member message should create exactly one admin notification (no duplicate pair)
    const msg = await request("POST", "/api/messages/reply", {
      body: "Hello Leah, I have a question.",
    }, "test:new-provider@example.com");
    assert.equal(msg.status, 200, msg.text);
    await new Promise((r) => setTimeout(r, 200));
    const afterMsg = await request("GET", `/api/admin/notifications?adminToken=${encodeURIComponent(token)}`);
    assert.equal(afterMsg.status, 200);
    const messageNotifs = (afterMsg.json.notifications || []).filter((n) =>
      n.type === "admin_new_message" || n.type === "admin_message_reply" || n.type === "message");
    assert.equal(messageNotifs.length, 1, `expected one admin message alert, got ${messageNotifs.length}`);

    const list2 = await request("GET", `/api/admin/notifications?adminToken=${encodeURIComponent(token)}&category=signup`);
    assert.equal(list2.status, 200);
    assert.ok((list2.json.notifications || []).every((n) => n.category === "signup"));

    console.log("PASS  admin notifications API signup + mark-read + filter + single message alert");
  } finally {
    child.kill("SIGTERM");
  }
}

(async () => {
  if (process.exitCode) return;
  try {
    await integration();
  } catch (error) {
    console.error("FAIL  integration", error);
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log("\nAll admin notifications / PWA contract tests passed.");
})();
