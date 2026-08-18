#!/usr/bin/env node
/**
 * Admin messaging inbox redesign — welcome separation, unread pin, email prefs, mark read.
 * Run: npm run test:admin-messaging-inbox
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { chromium } = require("playwright");
const {
  ROOT, waitForHealth, startServer, seedStore,
} = require("./lib/messaging-test-harness.js");
const { unlockAdminInBrowser } = require("./lib/admin-browser-unlock.js");
const inbox = require("../server/admin-messaging-inbox.js");

const ARTIFACT_DIR = "/opt/cursor/artifacts/admin-messaging-inbox";
const ADMIN_EMAIL = "admin@test.local";
const USER_A = "inbox-user-a@example.com";
const USER_B = "inbox-user-b@example.com";

let failures = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

function adminApi(base, method, urlPath, { token, body = null } = {}) {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${urlPath}`, { method, headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  await test("unit — welcome classification helpers", () => {
    const store = {
      messages: [
        {
          id: "w1", audience: "private", conversationEmail: USER_A, senderType: "admin",
          channel: "onboarding_welcome", onboardingSequenceId: "free-welcome", body: "Welcome!", createdAt: "2026-07-01T00:00:00.000Z",
        },
        {
          id: "u1", audience: "private", conversationEmail: USER_B, senderType: "user",
          body: "Hello Leah", createdAt: "2026-07-02T00:00:00.000Z",
        },
        {
          id: "w2", audience: "private", conversationEmail: USER_B, senderType: "admin",
          channel: "onboarding_welcome", onboardingSequenceId: "free-welcome", body: "Welcome!", createdAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    };
    assert.equal(inbox.classifyConversation(store, USER_A).isWelcomeOnly, true);
    assert.equal(inbox.classifyConversation(store, USER_A).hasUserReply, false);
    assert.equal(inbox.classifyConversation(store, USER_B).isWelcomeOnly, false);
    assert.equal(inbox.classifyConversation(store, USER_B).hasUserReply, true);
  });

  await test("unit — email dedupe ledger", () => {
    const store = {};
    inbox.ensureAdminMessagingSettings(store);
    assert.equal(store.adminMessagingSettings.emailOnMemberMessage, true);
    assert.equal(inbox.alreadyEmailedMemberMessage(store, "msg-1"), false);
    inbox.recordMemberMessageEmail(store, "msg-1");
    assert.equal(inbox.alreadyEmailedMemberMessage(store, "msg-1"), true);
  });

  await test("unit — mark unread creates notification when missing", () => {
    const store = {
      messages: [
        {
          id: "u1", audience: "private", conversationEmail: USER_B, senderType: "user",
          body: "Need help", createdAt: "2026-07-02T00:00:00.000Z",
        },
      ],
      notifications: [],
    };
    const changed = inbox.setConversationNotificationsRead(store, {
      userEmail: USER_B,
      adminEmails: [ADMIN_EMAIL],
      read: false,
      createUnreadIfMissing: true,
      isAdminConversationUnreadNotification: (n) => !n.read && n.conversationEmail,
    });
    assert.ok(changed >= 1);
    assert.equal(store.notifications[0].read, false);
    assert.equal(store.notifications[0].conversationEmail, USER_B);
  });

  await test("static UI guards", () => {
    const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    assert.match(app, /Inbox/);
    assert.match(app, /Welcome Sent/);
    assert.match(app, /data-admin-mark-unread/);
    assert.match(app, /markRead=0/);
    assert.match(app, /adminMessageEmailAlertsToggle/);
    assert.match(app, /messages-automations/);
    const css = fs.readFileSync(path.join(ROOT, "styles/llh-messaging.css"), "utf8");
    assert.match(css, /\.admin-conversation-item\.is-unread/);
    assert.match(css, /\.admin-new-messages-count/);
  });

  const PORT = await freePort();
  const BASE = `http://127.0.0.1:${PORT}`;
  const STORE = path.join(ROOT, "server", `.admin-messaging-inbox-${process.pid}.json`);
  const now = new Date().toISOString();

  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL, plan: "Founding" },
    [USER_A]: { email: USER_A, firstName: "Ada", lastName: "Welcome", plan: "Free" },
    [USER_B]: { email: USER_B, firstName: "Bea", lastName: "Replies", plan: "Pro" },
  });
  const raw = JSON.parse(fs.readFileSync(STORE, "utf8"));
  raw.messages = [
    {
      id: "msg-welcome-a", kind: "message", audience: "private", senderType: "admin",
      senderEmail: ADMIN_EMAIL, senderName: "Leah", conversationEmail: USER_A, toEmail: USER_A,
      subject: "Welcome", body: "Welcome to Little Learner Hub!", createdAt: now, sentAt: now,
      status: "sent", deliverVia: "in_app", channel: "onboarding_welcome", onboardingSequenceId: "free-welcome",
    },
    {
      id: "msg-welcome-b", kind: "message", audience: "private", senderType: "admin",
      senderEmail: ADMIN_EMAIL, senderName: "Leah", conversationEmail: USER_B, toEmail: USER_B,
      subject: "Welcome", body: "Welcome Bea!", createdAt: "2026-07-28T10:00:00.000Z", sentAt: "2026-07-28T10:00:00.000Z",
      status: "sent", deliverVia: "in_app", channel: "onboarding_welcome", onboardingSequenceId: "free-welcome",
    },
    {
      id: "msg-user-b", kind: "message", audience: "private", senderType: "user",
      senderEmail: USER_B, senderName: "Bea", conversationEmail: USER_B, toEmail: "",
      subject: "", body: "Thanks Leah — I have a question about lesson plans.", createdAt: "2026-07-29T12:00:00.000Z", sentAt: "2026-07-29T12:00:00.000Z",
      status: "sent",
    },
  ];
  raw.notifications = [
    {
      id: "n-unread-b", email: ADMIN_EMAIL, type: "admin_message_reply", category: "messaging",
      title: "Reply from Bea", preview: "Thanks Leah", messageId: "msg-user-b", refId: "msg-user-b",
      conversationEmail: USER_B, createdAt: "2026-07-29T12:00:00.000Z", read: false,
    },
  ];
  fs.writeFileSync(STORE, JSON.stringify(raw, null, 2));

  const { child: server, getLog } = startServer({
    port: PORT,
    storeFile: STORE,
    extraEnv: {
      ADMIN_EMAIL,
      ADMIN_PASSWORD: "test-password",
      ADMIN_ACCESS_CODE: "test-code",
      DATABASE_PROVIDER: "local-json",
      PRODUCTION_DATABASE_URL: "",
    },
  });

  let token = "";
  try {
    await waitForHealth(BASE);
    const seeded = JSON.parse(fs.readFileSync(STORE, "utf8"));
    assert.ok((seeded.messages || []).length >= 3, `seed wiped before tests: ${getLog().slice(-500)}`);

    const login = await adminApi(BASE, "POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: "test-password", code: "test-code" },
    });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    token = login.json.token;
    assert.ok(token);

    await test("API — welcome-only excluded from New Messages bucket", async () => {
      const neu = await adminApi(BASE, "GET", "/api/admin/conversations?bucket=new", { token });
      assert.equal(neu.status, 200, JSON.stringify(neu.json));
      const emails = (neu.json.conversations || []).map((c) => c.userEmail);
      assert.ok(emails.includes(USER_B), `expected ${USER_B} in ${JSON.stringify(emails)}`);
      assert.ok(!emails.includes(USER_A), `welcome-only ${USER_A} leaked into new: ${JSON.stringify(emails)}`);
      assert.ok(Number(neu.json.summary?.unreadConversations || 0) >= 1);
    });

    await test("API — welcome bucket lists automation-only threads", async () => {
      const wel = await adminApi(BASE, "GET", "/api/admin/conversations?bucket=welcome", { token });
      assert.equal(wel.status, 200);
      const emails = (wel.json.conversations || []).map((c) => c.userEmail);
      assert.ok(emails.includes(USER_A));
      assert.ok(!emails.includes(USER_B));
    });

    await test("API — unread pinned before read; mark read/unread", async () => {
      const list = await adminApi(BASE, "GET", "/api/admin/conversations?bucket=new", { token });
      assert.ok(list.json.conversations?.length, JSON.stringify(list.json));
      assert.ok(Number(list.json.conversations[0].unreadFromUser) > 0);
      const open = await adminApi(BASE, "GET", `/api/admin/messages/conversation?userEmail=${encodeURIComponent(USER_B)}`, { token });
      assert.equal(open.status, 200);
      assert.ok((open.json.messages || []).some((m) => m.isAutomation));
      assert.ok((open.json.messages || []).some((m) => m.senderType === "user"));
      const afterOpen = await adminApi(BASE, "GET", "/api/admin/conversations?bucket=new", { token });
      const row = (afterOpen.json.conversations || []).find((c) => c.userEmail === USER_B);
      assert.equal(Number(row?.unreadFromUser || 0), 0);
      const unread = await adminApi(BASE, "POST", "/api/admin/messages/mark-unread", { token, body: { userEmail: USER_B } });
      assert.equal(unread.status, 200);
      const again = await adminApi(BASE, "GET", "/api/admin/conversations?bucket=unread", { token });
      assert.ok((again.json.conversations || []).some((c) => c.userEmail === USER_B && c.unreadFromUser > 0));
    });

    await test("API — live poll markRead=0 does not clear unread", async () => {
      await adminApi(BASE, "POST", "/api/admin/messages/mark-unread", { token, body: { userEmail: USER_B } });
      const poll = await adminApi(BASE, "GET", `/api/admin/messages/conversation?userEmail=${encodeURIComponent(USER_B)}&markRead=0`, { token });
      assert.equal(poll.status, 200);
      const list = await adminApi(BASE, "GET", "/api/admin/conversations?bucket=unread", { token });
      assert.ok((list.json.conversations || []).some((c) => c.userEmail === USER_B && c.unreadFromUser > 0));
    });

    await test("API — email setting toggle", async () => {
      const off = await adminApi(BASE, "POST", "/api/admin/messaging-settings", { token, body: { emailOnMemberMessage: false } });
      assert.equal(off.status, 200);
      assert.equal(off.json.emailOnMemberMessage, false);
      const get = await adminApi(BASE, "GET", "/api/admin/messaging-settings", { token });
      assert.equal(get.json.emailOnMemberMessage, false);
      await adminApi(BASE, "POST", "/api/admin/messaging-settings", { token, body: { emailOnMemberMessage: true } });
    });

    await test("API — member reply creates admin notification and stays in new bucket", async () => {
      const reply = await fetch(`${BASE}/api/messages/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer test:${USER_A}`,
          "x-llh-user-email": USER_A,
        },
        body: JSON.stringify({ body: "Hi Leah, I just signed up and need help." }),
      });
      const replyJson = await reply.json().catch(() => ({}));
      assert.ok(reply.ok, JSON.stringify(replyJson));
      const neu = await adminApi(BASE, "GET", "/api/admin/conversations?bucket=new", { token });
      assert.ok((neu.json.conversations || []).some((c) => c.userEmail === USER_A && c.unreadFromUser > 0));
      const wel = await adminApi(BASE, "GET", "/api/admin/conversations?bucket=welcome", { token });
      assert.ok(!(wel.json.conversations || []).some((c) => c.userEmail === USER_A));
    });

    for (const device of ["desktop", "mobile"]) {
      await test(`UI ${device} — New Messages list + unread styles`, async () => {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
          viewport: device === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 },
          isMobile: device === "mobile",
          hasTouch: device === "mobile",
        });
        const page = await context.newPage();
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await unlockAdminInBrowser(page, BASE, { openMessages: true });
        await page.waitForSelector(".admin-new-messages-hero", { timeout: 20000 });
        await page.waitForSelector(".admin-conversation-item.is-unread, .admin-conversation-item", { timeout: 20000 });
        const hasHero = await page.locator(".admin-new-messages-count").count();
        assert.ok(hasHero > 0);
        const unreadItems = await page.locator(".admin-conversation-item.is-unread").count();
        assert.ok(unreadItems > 0, "expected at least one unread conversation highlighted");
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `${device}-new-messages.png`), fullPage: true });
        await page.evaluate(() => {
          if (typeof window.setAdminSectionTab === "function") window.setAdminSectionTab("messages-automations");
        });
        await page.waitForSelector(".admin-new-messages-hero", { timeout: 15000 });
        const welcomeTitle = await page.locator(".admin-new-messages-hero h3").textContent();
        assert.match(String(welcomeTitle || ""), /Welcome Sent/i);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `${device}-welcome-sent.png`), fullPage: true });
        // Open a conversation — list should remain
        await page.evaluate(() => {
          if (typeof window.setAdminSectionTab === "function") window.setAdminSectionTab("messages-conversations");
        });
        await page.waitForSelector(".admin-conversation-item", { timeout: 15000 });
        await page.locator(".admin-conversation-item").first().click();
        await page.waitForSelector("#adminConversationThread .messages-thread, #adminConversationThread .admin-conversation-actions", { timeout: 15000 });
        const listStillThere = await page.locator(".admin-conversations-list").count();
        assert.ok(listStillThere > 0);
        const markButtons = await page.locator("[data-admin-mark-read], [data-admin-mark-unread]").count();
        assert.ok(markButtons >= 2);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `${device}-conversation-open.png`), fullPage: true });
        await browser.close();
      });
    }
  } finally {
    try { server.kill("SIGKILL"); } catch {}
    try { fs.unlinkSync(STORE); } catch {}
    try { fs.unlinkSync(`${STORE.replace(/\.json$/, "")}.admin-sessions.json`); } catch {}
    try { fs.unlinkSync(STORE.replace(/\.json$/, ".admin-sessions.json")); } catch {}
  }

  if (failures) {
    console.error(`\n${failures} admin messaging inbox test(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll admin messaging inbox tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
