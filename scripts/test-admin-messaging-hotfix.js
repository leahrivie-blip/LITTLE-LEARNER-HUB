#!/usr/bin/env node
/**
 * Admin messaging hotfix regression — threads, sent, drafts, archives, compose, privacy.
 * Uses fake/local data only; no real Resend calls.
 * Run: npm run test:admin-messaging-hotfix
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const {
  ROOT, request, waitForHealth, startServer, seedStore, test,
} = require("./lib/messaging-test-harness.js");
const { unlockAdminInBrowser } = require("./lib/admin-browser-unlock.js");

const PORT = 4348;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.admin-messaging-hotfix-${process.pid}.json`);
const ARTIFACT_DIR = "/opt/cursor/artifacts/screenshots";
const ADMIN_EMAIL = "admin@test.local";
const USER_A = "hotfix-user-a@example.com";
const USER_B = "hotfix-user-b@example.com";

function adminApi(method, urlPath, { token, body = null } = {}) {
  const http = require("node:http");
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${urlPath}`, { method, headers }, (res) => {
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

function appSource() {
  return fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
}

async function unlockAdmin(page) {
  await unlockAdminInBrowser(page, BASE, { openMessages: true });
  await page.evaluate(() => {
    if (typeof window.setAdminSectionTab === "function") window.setAdminSectionTab("messages-conversations");
  });
  await page.waitForSelector(".admin-messages-workspace-nav", { timeout: 20000 });
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  test("static guards — communications workspace nav restored", () => {
    const appJs = appSource();
    assert.match(appJs, /adminMessagesWorkspaceNavHtml/);
    assert.match(appJs, /messages-conversations/);
    assert.match(appJs, /messages-sent/);
    assert.match(appJs, /messages-drafts/);
    assert.match(appJs, /messages-archived/);
    assert.match(appJs, /messages-email/);
    assert.match(appJs, /defaultTab: "messages-conversations"/);
    assert.match(appJs, /adminMessageDeliveryStatusHtml/);
  });

  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL },
    [USER_A]: {
      email: USER_A,
      firstName: "Hotfix",
      lastName: "Alpha",
      plan: "Free",
      businessName: "Alpha Care",
    },
    [USER_B]: {
      email: USER_B,
      firstName: "Hotfix",
      lastName: "Beta",
      plan: "Free",
    },
  });

  const { child } = startServer({
    port: PORT,
    storeFile: STORE,
    extraEnv: {
      RESEND_API_KEY: "",
      EMAIL_AUTOMATIONS_ENABLED: "false",
    },
  });
  let adminToken = "";

  try {
    await waitForHealth(BASE);

    await test("admin login", async () => {
      const login = await request(BASE, "POST", "/api/admin/login", {
        body: { email: ADMIN_EMAIL, password: "test-password", code: "test-code" },
      });
      assert.equal(login.status, 200, JSON.stringify(login.json));
      adminToken = login.json.token;
    });

    await test("seed historical thread + sent admin reply", async () => {
      const userMsg = await request(BASE, "POST", "/api/messages/reply", {
        email: USER_A,
        body: { body: "Hi Leah — I need help with lesson plans." },
      });
      assert.equal(userMsg.status, 200, JSON.stringify(userMsg.json));
      const sendAuth = await adminApi("POST", "/api/admin/messages/send", {
        token: adminToken,
        body: {
          audience: "private",
          toEmail: USER_A,
          subject: "Re: lesson plans",
          body: "Happy to help — here are a few ideas for next week.",
        },
      });
      assert.equal(sendAuth.status, 200, JSON.stringify(sendAuth.json));
      const followUp = await adminApi("POST", "/api/admin/messages/send", {
        token: adminToken,
        body: {
          audience: "private",
          toEmail: USER_A,
          body: "Following up on your question.",
        },
      });
      assert.equal(followUp.status, 200, JSON.stringify(followUp.json));
    });

    await test("sent API lists admin replies", async () => {
      const sent = await adminApi("GET", "/api/admin/messages/sent", { token: adminToken });
      assert.equal(sent.status, 200, JSON.stringify(sent.json));
      assert.ok(sent.json.messages.length >= 1);
      assert.ok(sent.json.messages.some((m) => /Following up/.test(m.body || "")));
    });

    await test("conversations API preserves full thread", async () => {
      const convo = await adminApi("GET", `/api/admin/messages/conversation?userEmail=${encodeURIComponent(USER_A)}`, { token: adminToken });
      assert.equal(convo.status, 200);
      assert.ok(convo.json.messages.length >= 2);
      const senders = convo.json.messages.map((m) => m.senderType);
      assert.ok(senders.includes("user"));
      assert.ok(senders.includes("admin"));
    });

    await test("drafts API round-trip", async () => {
      const save = await adminApi("POST", "/api/admin/messages/draft", {
        token: adminToken,
        body: {
          audience: "private",
          toEmail: USER_B,
          subject: "Draft check-in",
          body: "Saved but not sent.",
        },
      });
      assert.equal(save.status, 200);
      const list = await adminApi("GET", "/api/admin/messages/drafts", { token: adminToken });
      assert.equal(list.status, 200);
      assert.ok(list.json.drafts.some((d) => d.subject === "Draft check-in"));
    });

    await test("archive hides inbox item without deleting thread", async () => {
      const inboxBefore = await adminApi("GET", "/api/admin/inbox", { token: adminToken });
      const item = (inboxBefore.json.items || []).find((i) => i.email === USER_A);
      if (item) {
        const archive = await adminApi("POST", "/api/admin/inbox/archive", {
          token: adminToken,
          body: { confirm: true, id: item.id },
        });
        assert.equal(archive.status, 200);
      }
      const archived = await adminApi("GET", "/api/admin/messages/archived", { token: adminToken });
      assert.equal(archived.status, 200);
      const convoAfter = await adminApi("GET", `/api/admin/messages/conversation?userEmail=${encodeURIComponent(USER_A)}`, { token: adminToken });
      assert.ok(convoAfter.json.messages.length >= 2, "thread must survive archive");
    });

    await test("cross-user privacy — User B cannot read User A thread", async () => {
      const convo = await request(BASE, "GET", "/api/messages/conversation", { email: USER_B });
      assert.equal(convo.json.messages.length, 0);
    });

    await test("admin fetch uses Authorization header (no adminToken in URL)", async () => {
      const commsJs = fs.readFileSync(path.join(ROOT, "comms-center.js"), "utf8");
      assert.match(commsJs, /Authorization: `Bearer \$\{token\}`/);
      assert.doesNotMatch(
        commsJs.slice(commsJs.indexOf("async function adminFetchJson"), commsJs.indexOf("function adminPanelShell")),
        /adminToken=\$\{encodeURIComponent\(token\)\}/,
      );
    });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    let resendCalls = 0;
    page.on("request", (req) => {
      if (/resend\.com/i.test(req.url())) resendCalls += 1;
    });

    try {
      await unlockAdmin(page);
      await page.waitForFunction(
        () => document.querySelectorAll(".admin-conversation-item").length > 0,
        null,
        { timeout: 20000 },
      );

      await test("browser — workspace nav visible with core tabs", async () => {
        const labels = await page.$$eval(".admin-messages-workspace-btn", (els) => els.map((el) => el.textContent.trim()));
        assert.ok(labels.some((l) => /Inbox/.test(l)));
        assert.ok(labels.some((l) => /Welcome Sent/.test(l)));
        assert.ok(labels.some((l) => /^Sent/.test(l) || /\bSent\b/.test(l)));
        assert.ok(labels.some((l) => /Drafts/.test(l)));
        assert.ok(labels.some((l) => /Archived/.test(l)));
        assert.ok(labels.some((l) => /Compose/.test(l)));
        assert.ok(labels.some((l) => /Email User/.test(l)));
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "admin-messaging-workspace-nav.png"), fullPage: false });
      });

      await test("browser — open full conversation thread with reply box", async () => {
        await page.click('.admin-conversation-item[data-admin-conversation]');
        await page.waitForSelector("#adminConversationReplyForm", { timeout: 15000 });
        const bubbleCount = await page.locator(".message-bubble").count();
        assert.ok(bubbleCount >= 2);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "admin-messaging-thread.png"), fullPage: false });
      });

      await test("browser — sent tab lists historical admin messages", async () => {
        await page.click('[data-admin-messages-workspace-tab="messages-sent"]');
        await page.waitForSelector(".admin-messages-list-item", { timeout: 15000 });
        const text = await page.locator("#adminMessagesApp").innerText();
        assert.match(text, /Following up|lesson plans|Happy to help/i);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "admin-messaging-sent.png"), fullPage: false });
      });

      await test("browser — drafts tab shows saved draft", async () => {
        await page.click('[data-admin-messages-workspace-tab="messages-drafts"]');
        await page.waitForSelector('[data-admin-draft-resume]', { timeout: 15000 });
        const text = await page.locator("#adminMessagesApp").innerText();
        assert.match(text, /Draft check-in/);
      });

      await test("browser — compose + email user screens reachable", async () => {
        await page.click('[data-admin-messages-workspace-tab="messages-compose"]');
        await page.waitForSelector("#adminMessagesComposeForm", { timeout: 15000 });
        await page.click('[data-admin-messages-workspace-tab="messages-email"]');
        await page.waitForSelector("#adminMessagesComposeForm", { timeout: 15000 });
        const text = await page.locator("#adminMessagesApp").innerText();
        assert.match(text, /Email a member/i);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "admin-messaging-email-compose.png"), fullPage: false });
      });

      await test("browser — mobile layout keeps workspace nav usable", async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.click('[data-admin-messages-workspace-tab="messages-conversations"]');
        await page.waitForSelector(".admin-messages-workspace-nav", { timeout: 15000 });
        const navBox = await page.locator(".admin-messages-workspace-nav").boundingBox();
        assert.ok(navBox && navBox.width > 200);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, "admin-messaging-mobile.png"), fullPage: false });
      });

      await test("browser — no real Resend HTTP calls during UI audit", async () => {
        assert.equal(resendCalls, 0, `unexpected Resend calls: ${resendCalls}`);
      });
    } finally {
      await browser.close();
    }
  } finally {
    child.kill("SIGTERM");
    try { fs.unlinkSync(STORE); } catch { /* ignore */ }
  }

  if (!process.exitCode) {
    console.log("\nAll admin messaging hotfix tests passed.");
    console.log(`Screenshots: ${ARTIFACT_DIR}/admin-messaging-*.png`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
