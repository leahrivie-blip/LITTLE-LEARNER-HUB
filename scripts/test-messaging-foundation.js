#!/usr/bin/env node
/**
 * Messaging Center — Phases 1-4: database foundation, one-to-one admin
 * messaging, user replies, and in-app unread badges.
 * Run: node scripts/test-messaging-foundation.js
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  ROOT, request, waitForHealth, startServer, seedStore, test,
} = require("./lib/messaging-test-harness.js");

const PORT = 4321;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.messaging-foundation-test-${process.pid}.json`);
const ADMIN_EMAIL = "leah@littlelearnerhub.com";
const FREE_USER = "free-parent@example.com";

async function main() {
  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL },
    [FREE_USER]: { email: FREE_USER, plan: "Free", subscriptionStatus: "Free Plan" },
  });
  const { child, getLog } = startServer({ port: PORT, storeFile: STORE });

  try {
    await waitForHealth(BASE);
    let adminToken = "";

    await test("Phase 1: admin login works and messaging routes exist", async () => {
      const login = await request(BASE, "POST", "/api/admin/login", {
        body: { email: ADMIN_EMAIL, password: "test-password", code: "test-code" },
      });
      assert.equal(login.status, 200, JSON.stringify(login.json));
      adminToken = login.json.token;
      assert.ok(adminToken);
    });

    await test("Phase 1: unauthenticated preview/send are rejected", async () => {
      const preview = await request(BASE, "POST", "/api/admin/messages/preview", { body: { audience: "all" } });
      assert.equal(preview.status, 401);
      const send = await request(BASE, "POST", "/api/admin/messages/send", { body: { audience: "private", toEmail: FREE_USER, body: "hi" } });
      assert.equal(send.status, 401);
    });

    await test("Phase 2: admin sends a private message to one user", async () => {
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken, audience: "private", toEmail: FREE_USER,
          subject: "Welcome!", body: "Hi there — welcome to Little Learner Hub.",
        },
      });
      assert.equal(send.status, 200, JSON.stringify(send.json));
      assert.equal(send.json.recipientCount, 1);
      assert.equal(send.json.message.audience, "private");
      assert.equal(send.json.message.senderName, "Leah");
    });

    await test("Phase 2: the user can read the message in their conversation", async () => {
      const convo = await request(BASE, "GET", "/api/messages/conversation", { email: FREE_USER });
      assert.equal(convo.status, 200);
      assert.equal(convo.json.messages.length, 1);
      assert.equal(convo.json.messages[0].body, "Hi there — welcome to Little Learner Hub.");
      assert.equal(convo.json.messages[0].senderType, "admin");
    });

    await test("Phase 4: unread badge shows 1 unread for the user before reading", async () => {
      const notifs = await request(BASE, "GET", "/api/notifications", { email: FREE_USER });
      assert.equal(notifs.status, 200);
      assert.equal(notifs.json.unreadCount, 1);
      assert.equal(notifs.json.notifications[0].type, "message");
    });

    await test("Phase 3: user replies inside the private conversation", async () => {
      const reply = await request(BASE, "POST", "/api/messages/reply", {
        email: FREE_USER, body: { body: "Thank you! Quick question about lesson plans." },
      });
      assert.equal(reply.status, 200, JSON.stringify(reply.json));
      const convo = await request(BASE, "GET", "/api/messages/conversation", { email: FREE_USER });
      assert.equal(convo.json.messages.length, 2);
      assert.equal(convo.json.messages[1].senderType, "user");
    });

    await test("Phase 3: admin conversations list shows the user's unread reply", async () => {
      const conversations = await request(BASE, "GET", `/api/admin/conversations?adminToken=${adminToken}`);
      assert.equal(conversations.status, 200);
      const thread = conversations.json.conversations.find((c) => c.userEmail === FREE_USER);
      assert.ok(thread, "expected a conversation thread for the free user");
      assert.equal(thread.unreadFromUser, 1);
    });

    await test("Phase 4: marking the conversation read clears the unread badge", async () => {
      const markRead = await request(BASE, "POST", "/api/messages/mark-read", {
        email: FREE_USER, body: { conversationEmail: FREE_USER },
      });
      assert.equal(markRead.status, 200);
      assert.ok(markRead.json.updated >= 1);
      const notifs = await request(BASE, "GET", "/api/notifications", { email: FREE_USER });
      assert.equal(notifs.json.unreadCount, 0);
    });

    await test("Phase 1: a second user cannot see the first user's private conversation", async () => {
      const otherUser = "someone-else@example.com";
      const convo = await request(BASE, "GET", "/api/messages/conversation", { email: otherUser });
      assert.equal(convo.status, 200);
      assert.equal(convo.json.messages.length, 0, "another user must never see someone else's private thread");
    });

    if (process.exitCode) {
      console.error("\nBoot log for debugging:\n" + getLog());
    }
  } finally {
    child.kill();
    try { require("node:fs").unlinkSync(STORE); } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
