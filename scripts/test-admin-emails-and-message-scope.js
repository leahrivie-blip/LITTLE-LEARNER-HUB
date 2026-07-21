#!/usr/bin/env node
/**
 * Multi-admin owner aliases + member message/notification isolation.
 * Run: node scripts/test-admin-emails-and-message-scope.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const PORT = 19740 + Math.floor(Math.random() * 40);
const STORE_PATH = path.join(os.tmpdir(), `llh-admin-msg-scope-${crypto.randomBytes(4).toString("hex")}.json`);
const PRIMARY_ADMIN = "owner-primary@test.local";
const ICLOUD_ADMIN = "leahivie@icloud.com";
const FREE_USER = "member-free@example.com";
const OTHER_USER = "member-other@example.com";
const ADMIN_PASSWORD = "owner-pass";
const ADMIN_CODE = "owner-code";

function request(method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: urlPath,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
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

function memberHeaders(email) {
  return {
    Authorization: `Bearer test:${email}`,
    "X-LLH-User-Email": email,
  };
}

function startServer() {
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    users: {
      [FREE_USER]: { email: FREE_USER, plan: "Free", subscriptionStatus: "Free Plan" },
      [OTHER_USER]: { email: OTHER_USER, plan: "Free", subscriptionStatus: "Free Plan" },
      [ICLOUD_ADMIN]: {
        email: ICLOUD_ADMIN,
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        stripeSubscriptionStatus: "active",
      },
    },
    messages: [],
    notifications: [],
    siteContent: {},
    adminSessions: {},
  }, null, 2));
  return spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SITE_URL: `http://127.0.0.1:${PORT}`,
      ADMIN_EMAIL: PRIMARY_ADMIN,
      ADMIN_PASSWORD,
      ADMIN_ACCESS_CODE: ADMIN_CODE,
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
      const res = await request("GET", "/api/health");
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

function staticChecks() {
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const messagingCss = fs.readFileSync(path.join(ROOT, "styles/llh-messaging.css"), "utf8");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  assert.match(messagingCss, /position:\s*fixed/, "mobile notification panel should use fixed positioning");
  assert.match(messagingCss, /calc\(100vw - 24px\)/, "mobile panel width should use calc(100vw - 24px)");
  assert.match(messagingCss, /overflow-wrap:\s*anywhere/, "notification text should wrap safely");
  assert.match(indexHtml, /notificationBellCloseBtn/, "mobile close button required");
  assert.match(appJs, /positionNotificationBellPanel/, "panel positioning helper required");
  assert.match(appJs, /leahivie@icloud\.com/, "owner account aliases must include iCloud login");
  assert.match(serverJs, /DEFAULT_ADMIN_EMAIL_ALIASES/, "server must define admin email aliases");
  assert.match(serverJs, /isAdminOnlyNotificationType/, "member APIs must filter admin-only notification types");
  assert.match(indexHtml, /llh-messaging\.css\?v=20260721-homescreen-sw/);
  assert.match(indexHtml, /app\.js\?v=20260721-homescreen-sw/);
  console.log("PASS static multi-admin + mobile notification markers");
}

async function main() {
  staticChecks();
  const child = startServer();
  try {
    await waitForBoot(child);

    const primaryLogin = await request("POST", "/api/admin/login", {
      body: { email: PRIMARY_ADMIN, password: ADMIN_PASSWORD, code: ADMIN_CODE },
    });
    assert.equal(primaryLogin.status, 200, "primary admin login failed");
    const token = primaryLogin.json.token;

    const icloudLogin = await request("POST", "/api/admin/login", {
      body: { email: ICLOUD_ADMIN, password: ADMIN_PASSWORD, code: ADMIN_CODE },
    });
    assert.equal(icloudLogin.status, 200, "iCloud admin alias login failed");
    assert.equal(icloudLogin.json.email, ICLOUD_ADMIN);

    const send = await request("POST", "/api/admin/messages/send", {
      body: {
        adminToken: token,
        audience: "private",
        toEmail: FREE_USER,
        body: "Hello Free member — private only.",
        kind: "message",
      },
    });
    assert.equal(send.status, 200, JSON.stringify(send.json));

    const freeConvo = await request("GET", "/api/messages/conversation", { headers: memberHeaders(FREE_USER) });
    assert.ok(freeConvo.json.messages.some((m) => /private only/i.test(m.body)), "Free user should see own private message");

    const otherConvo = await request("GET", "/api/messages/conversation", { headers: memberHeaders(OTHER_USER) });
    assert.equal(otherConvo.json.messages.length, 0, "Other user must not see Free user's private thread");

    const freeNotifs = await request("GET", "/api/notifications", { headers: memberHeaders(FREE_USER) });
    assert.ok((freeNotifs.json.unreadCount || 0) >= 1, "Free user should receive own notification");
    assert.ok(
      !(freeNotifs.json.notifications || []).some((n) => String(n.type || "").startsWith("admin_")),
      "Regular members must never see admin_* notifications",
    );

    const otherNotifs = await request("GET", "/api/notifications", { headers: memberHeaders(OTHER_USER) });
    assert.equal(otherNotifs.json.unreadCount || 0, 0, "Other user should have no notifications from private send");

    const signup = await request("POST", "/api/account/profile", {
      body: {
        email: "brand-new-provider@example.com",
        firstName: "Brand",
        lastName: "New",
        accountType: "home_daycare",
        role: "owner",
        signup: true,
      },
      headers: memberHeaders("brand-new-provider@example.com"),
    });
    assert.ok([200, 201].includes(signup.status), `signup profile failed: ${signup.status} ${signup.text}`);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    const adminAlertEmails = new Set(
      (store.notifications || [])
        .filter((n) => String(n.type || "").startsWith("admin_"))
        .map((n) => n.email),
    );
    assert.ok(adminAlertEmails.has(PRIMARY_ADMIN), "primary admin must receive owner alerts");
    assert.ok(adminAlertEmails.has(ICLOUD_ADMIN), "iCloud admin alias must receive owner alerts");

    const freeSeesAdminAlert = await request("GET", "/api/notifications", { headers: memberHeaders(FREE_USER) });
    assert.ok(
      !(freeSeesAdminAlert.json.notifications || []).some((n) => String(n.type || "").startsWith("admin_")),
      "Free member must not see admin signup alerts",
    );

    const icloudUser = store.users?.[ICLOUD_ADMIN];
    assert.equal(icloudUser?.plan, "Pro", "iCloud admin account can keep Pro for membership testing");

    const previewAll = await request("POST", "/api/admin/messages/preview", {
      body: { adminToken: token, audience: "all", body: "preview only" },
    });
    assert.equal(previewAll.status, 200);
    assert.ok(!String(previewAll.json.sampleRecipients || []).includes(ICLOUD_ADMIN), "admin aliases excluded from all-audience");
    assert.ok(!String(previewAll.json.sampleRecipients || []).includes(PRIMARY_ADMIN), "primary admin excluded from all-audience");

    console.log("PASS iCloud admin alias login");
    console.log("PASS private messages stay scoped to the intended member");
    console.log("PASS regular users never receive admin_* notifications");
    console.log("PASS admin audience resolution excludes owner aliases");
    console.log("\nAll admin email + message scope checks passed.");
  } finally {
    await stopServer(child);
    try { fs.unlinkSync(STORE_PATH); } catch { /* ignore */ }
  }
}

main().catch((error) => {
  console.error("FAIL:", error.message || error);
  process.exitCode = 1;
});
