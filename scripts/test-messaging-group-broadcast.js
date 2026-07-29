#!/usr/bin/env node
/**
 * Messaging Center — Phase 5: group messaging with recipient-count preview
 * and confirmation, plus notification-safety rules (correct audience
 * segregation using the authoritative access system, no accidental
 * one-click broadcast, drafts never leak or push).
 * Run: node scripts/test-messaging-group-broadcast.js
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  ROOT, request, waitForHealth, startServer, seedStore, test,
} = require("./lib/messaging-test-harness.js");

const PORT = 4322;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.messaging-group-test-${process.pid}.json`);
const ADMIN_EMAIL = "admin@test.local";

async function main() {
  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL },
    "free1@example.com": { email: "free1@example.com", plan: "Free", subscriptionStatus: "Free Plan" },
    "free2@example.com": { email: "free2@example.com", plan: "Free", subscriptionStatus: "Free Plan" },
    "pro1@example.com": {
      email: "pro1@example.com", plan: "Pro", subscriptionStatus: "Pro Monthly Subscription Active", stripeSubscriptionStatus: "active",
    },
    "founding1@example.com": {
      email: "founding1@example.com", plan: "Founding", subscriptionStatus: "Founding Member Subscription Active",
      stripeSubscriptionStatus: "active", foundingMemberActive: true,
    },
    "expired-founding@example.com": {
      // Historical founding flag but no live access — must land in Free, not Founding.
      email: "expired-founding@example.com", plan: "Free", subscriptionStatus: "Subscription Ended",
      stripeSubscriptionStatus: "canceled", foundingMemberHistorical: true, foundingMemberActive: false,
    },
  });
  const { child, getLog } = startServer({ port: PORT, storeFile: STORE });

  try {
    await waitForHealth(BASE);
    const login = await request(BASE, "POST", "/api/admin/login", {
      body: { email: ADMIN_EMAIL, password: "test-password", code: "test-code" },
    });
    const adminToken = login.json.token;

    await test("Phase 5: preview shows exact recipient count for Free audience", async () => {
      const preview = await request(BASE, "POST", "/api/admin/messages/preview", {
        body: { adminToken, audience: "free", body: "Free plan tip of the week" },
      });
      assert.equal(preview.status, 200);
      assert.equal(preview.json.recipientCount, 3, "free1, free2, expired-founding");
      assert.equal(preview.json.requiresConfirmation, true);
      assert.ok(preview.json.messagePreview);
    });

    await test("Phase 5: sending a group message WITHOUT confirm is rejected (no accidental broadcast)", async () => {
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: { adminToken, audience: "all", subject: "Oops", body: "This should require confirmation." },
      });
      assert.equal(send.status, 400);
      assert.match(send.json.error, /confirmation/i);
    });

    await test("Phase 5: sending a private message does NOT require confirm", async () => {
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: { adminToken, audience: "private", toEmail: "pro1@example.com", body: "Hi Pro user!" },
      });
      assert.equal(send.status, 200, JSON.stringify(send.json));
    });

    let foundingBroadcastMessageId = "";
    await test("Phase 5 + Safety: confirmed send to Founding reaches ONLY founding members", async () => {
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken, audience: "founding", confirm: true,
          subject: "Founding perk", body: "Thank you founding members for your early support!",
        },
      });
      assert.equal(send.status, 200, JSON.stringify(send.json));
      assert.equal(send.json.recipientCount, 1);
      foundingBroadcastMessageId = send.json.message.id;

      const foundingInbox = await request(BASE, "GET", "/api/messages/inbox", { email: "founding1@example.com" });
      assert.ok(foundingInbox.json.items.some((i) => i.message?.id === foundingBroadcastMessageId));

      const freeInbox = await request(BASE, "GET", "/api/messages/inbox", { email: "free1@example.com" });
      assert.ok(!freeInbox.json.items.some((i) => i.message?.id === foundingBroadcastMessageId), "Free user must never receive a Founding-only broadcast");

      const expiredFoundingInbox = await request(BASE, "GET", "/api/messages/inbox", { email: "expired-founding@example.com" });
      assert.ok(!expiredFoundingInbox.json.items.some((i) => i.message?.id === foundingBroadcastMessageId), "Expired founding flag must not grant Founding-only access");
    });

    await test("Safety: selected-users send only reaches the exact list", async () => {
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken, audience: "selected", confirm: true,
          selectedEmails: ["free1@example.com", "pro1@example.com"],
          subject: "Just for you two", body: "Beta invite for selected accounts.",
        },
      });
      assert.equal(send.status, 200);
      assert.equal(send.json.recipientCount, 2);

      const free2Inbox = await request(BASE, "GET", "/api/messages/inbox", { email: "free2@example.com" });
      assert.ok(!free2Inbox.json.items.some((i) => i.message?.subject === "Just for you two"));
    });

    await test("Safety: an admin-authenticated request cannot forge selectedEmails to include the admin account", async () => {
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken, audience: "selected", confirm: true,
          selectedEmails: [ADMIN_EMAIL, "free1@example.com"],
          subject: "Selected", body: "Test",
        },
      });
      assert.equal(send.status, 200);
      assert.equal(send.json.recipientCount, 1, "admin email must be excluded from any audience resolution");
    });

    await test("Safety: announcement to everyone reaches all non-admin users", async () => {
      const preview = await request(BASE, "POST", "/api/admin/messages/preview", { body: { adminToken, audience: "all" } });
      assert.equal(preview.json.recipientCount, 5);
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: { adminToken, audience: "all", confirm: true, subject: "New lesson plans added 🎉", body: "Open Little Learner Hub to see what's new." },
      });
      assert.equal(send.status, 200);
      assert.equal(send.json.recipientCount, 5);
    });

    await test("Drafts never appear in a user's inbox and never notify anyone", async () => {
      const draft = await request(BASE, "POST", "/api/admin/messages/draft", {
        body: { adminToken, audience: "all", subject: "DRAFT do not send", body: "Not ready yet." },
      });
      assert.equal(draft.status, 200);
      const drafts = await request(BASE, "GET", `/api/admin/messages/drafts?adminToken=${adminToken}`);
      assert.equal(drafts.json.drafts.length, 1);

      const anyUserInbox = await request(BASE, "GET", "/api/messages/inbox", { email: "free1@example.com" });
      assert.ok(!anyUserInbox.json.items.some((i) => i.message?.subject === "DRAFT do not send"));
      const notifs = await request(BASE, "GET", "/api/notifications", { email: "free1@example.com" });
      assert.ok(!notifs.json.notifications.some((n) => n.title === "DRAFT do not send"));
    });

    await test("Duplicate-submission prevention: identical send fired twice in a row is rejected the 2nd time", async () => {
      const payload = { adminToken, audience: "private", toEmail: "pro1@example.com", body: "Duplicate-check message." };
      const first = await request(BASE, "POST", "/api/admin/messages/send", { body: payload });
      assert.equal(first.status, 200);
      const second = await request(BASE, "POST", "/api/admin/messages/send", { body: payload });
      assert.equal(second.status, 409, "an identical repeat send within seconds should be blocked as a likely duplicate click");
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
