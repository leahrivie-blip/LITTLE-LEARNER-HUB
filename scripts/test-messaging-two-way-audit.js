#!/usr/bin/env node
/**
 * Full two-way messaging audit:
 * admin → user delivery, user open/reply, admin unread, admin reply,
 * persistence across store reload, isolation, inbox submissions, list auth.
 *
 * Run: node scripts/test-messaging-two-way-audit.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT, request, waitForHealth, startServer, seedStore, test,
} = require("./lib/messaging-test-harness.js");

const PORT = 4337;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.messaging-two-way-audit-${process.pid}.json`);
const ADMIN_EMAIL = "leah@littlelearnerhub.com";
const USER_A = "audit-user-a@example.com";
const USER_B = "audit-user-b@example.com";

async function main() {
  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL },
    [USER_A]: {
      email: USER_A,
      firstName: "Audit",
      lastName: "Alpha",
      plan: "Free",
      subscriptionStatus: "Free Plan",
      accountType: "home_daycare",
      signupAt: "2026-03-01T12:00:00.000Z",
      lastSeenAt: "2026-07-16T12:00:00.000Z",
      businessName: "Alpha Daycare",
    },
    [USER_B]: {
      email: USER_B,
      firstName: "Audit",
      lastName: "Beta",
      plan: "Free",
      subscriptionStatus: "Free Plan",
    },
  });

  let { child, getLog } = startServer({ port: PORT, storeFile: STORE });
  let adminToken = "";

  try {
    await waitForHealth(BASE);

    await test("Admin authenticates", async () => {
      const login = await request(BASE, "POST", "/api/admin/login", {
        body: { email: ADMIN_EMAIL, password: "test-password", code: "test-code" },
      });
      assert.equal(login.status, 200, JSON.stringify(login.json));
      adminToken = login.json.token;
    });

    await test("1. Admin sends a private message to User A only", async () => {
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken,
          audience: "private",
          toEmail: USER_A,
          subject: "Audit hello",
          body: "Hello Audit Alpha — this is a private check-in.",
        },
      });
      assert.equal(send.status, 200, JSON.stringify(send.json));
      assert.equal(send.json.recipientCount, 1);
      assert.equal(send.json.message.conversationEmail, USER_A);
      assert.equal(send.json.message.senderType, "admin");
    });

    await test("2. User A receives notification + can open the conversation", async () => {
      const notifs = await request(BASE, "GET", "/api/notifications", { email: USER_A });
      assert.equal(notifs.status, 200);
      assert.equal(notifs.json.unreadCount, 1);
      assert.equal(notifs.json.notifications[0].type, "message");
      assert.equal(normalize(notifs.json.notifications[0].conversationEmail), USER_A);

      const convo = await request(BASE, "GET", "/api/messages/conversation", { email: USER_A });
      assert.equal(convo.json.messages.length, 1);
      assert.match(convo.json.messages[0].body, /private check-in/);
      assert.equal(convo.json.messages[0].senderType, "admin");
      assert.ok(convo.json.messages[0].createdAt || convo.json.messages[0].sentAt);
    });

    await test("3. User B never sees User A's private message or notification", async () => {
      const convo = await request(BASE, "GET", "/api/messages/conversation", { email: USER_B });
      assert.equal(convo.json.messages.length, 0);
      const notifs = await request(BASE, "GET", "/api/notifications", { email: USER_B });
      assert.equal(notifs.json.unreadCount || 0, 0);
    });

    await test("4. User A replies; admin conversations show unreadFromUser = 1", async () => {
      const reply = await request(BASE, "POST", "/api/messages/reply", {
        email: USER_A,
        body: { body: "Thanks Leah — quick reply from the audit user." },
      });
      assert.equal(reply.status, 200, JSON.stringify(reply.json));
      assert.equal(reply.json.message.senderType, "user");
      assert.equal(reply.json.message.conversationEmail, USER_A);

      const conversations = await request(BASE, "GET", `/api/admin/conversations?adminToken=${adminToken}`);
      assert.equal(conversations.status, 200);
      const thread = conversations.json.conversations.find((c) => c.userEmail === USER_A);
      assert.ok(thread, "admin must see User A conversation");
      assert.equal(thread.unreadFromUser, 1, "alias fan-out must not inflate unread badge");
      assert.match(thread.lastMessagePreview || "", /quick reply/);
    });

    await test("5. Admin inbox lists the unread DM once (alias-safe)", async () => {
      const inbox = await request(BASE, "GET", `/api/admin/inbox?adminToken=${adminToken}`);
      assert.equal(inbox.status, 200, JSON.stringify(inbox.json));
      const dmItems = (inbox.json.items || []).filter((i) => i.kind === "message" && i.email === USER_A);
      assert.equal(dmItems.length, 1);
      assert.equal(dmItems[0].unreadCount, 1);
    });

    await test("6. Admin opens thread + replies; User A gets a new unread", async () => {
      const open = await request(
        BASE,
        "GET",
        `/api/admin/messages/conversation?adminToken=${adminToken}&userEmail=${encodeURIComponent(USER_A)}`,
      );
      assert.equal(open.status, 200);
      assert.equal(open.json.messages.length, 2);
      assert.equal(open.json.user.email, USER_A);

      // Opening the thread marks admin unread as read.
      const afterOpen = await request(BASE, "GET", `/api/admin/conversations?adminToken=${adminToken}`);
      const thread = afterOpen.json.conversations.find((c) => c.userEmail === USER_A);
      assert.equal(thread.unreadFromUser, 0);

      await request(BASE, "POST", "/api/messages/mark-read", {
        email: USER_A,
        body: { conversationEmail: USER_A },
      });

      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken,
          audience: "private",
          toEmail: USER_A,
          body: "Got it — happy to help with lesson plans anytime.",
        },
      });
      assert.equal(send.status, 200);

      const notifs = await request(BASE, "GET", "/api/notifications", { email: USER_A });
      assert.ok(notifs.json.unreadCount >= 1);
      const convo = await request(BASE, "GET", "/api/messages/conversation", { email: USER_A });
      assert.equal(convo.json.messages.length, 3);
      assert.equal(convo.json.messages.at(-1).senderType, "admin");
    });

    await test("7. Support / bug / feature submissions appear in Admin Inbox and are replyable", async () => {
      const ticket = await request(BASE, "POST", "/api/support-ticket", {
        body: {
          kind: "Support Request",
          topic: "Billing question",
          name: "Audit Alpha",
          email: USER_A,
          message: "Can I change my plan mid-month?",
        },
      });
      assert.equal(ticket.status, 200);

      const bug = await request(BASE, "POST", "/api/feedback", {
        body: {
          type: "Bug",
          name: "Audit Alpha",
          email: USER_A,
          subject: "Messages cut off on phone",
          message: "On a small screen the reply box was hard to use.",
        },
      });
      assert.equal(bug.status, 200);

      const feature = await request(BASE, "POST", "/api/feature-request", {
        body: {
          title: "Schedule reminder texts",
          description: "Optional SMS reminders for parent pickup times.",
          category: "Scheduling",
          name: "Audit Alpha",
          email: USER_A,
        },
      }).catch(() => null);

      // Feature board endpoint name may vary — also accept feedback Feature Request.
      if (!feature || feature.status >= 400) {
        const featureFb = await request(BASE, "POST", "/api/feedback", {
          body: {
            type: "Feature Request",
            name: "Audit Alpha",
            email: USER_A,
            subject: "Schedule reminder texts",
            message: "Optional SMS reminders for parent pickup times.",
          },
        });
        assert.equal(featureFb.status, 200);
      }

      const inbox = await request(BASE, "GET", `/api/admin/inbox?adminToken=${adminToken}`);
      assert.equal(inbox.status, 200);
      const kinds = new Set((inbox.json.items || []).map((i) => i.kind));
      assert.ok(kinds.has("support"), "support request must appear in admin inbox");
      assert.ok(kinds.has("feedback") || kinds.has("bug"), "bug/feedback must appear in admin inbox");
      assert.ok(
        (inbox.json.items || []).some((i) => i.kind === "feature" || /Feature/i.test(i.kindLabel || i.title || "")),
        "feature request must appear in admin inbox",
      );

      const supportItem = (inbox.json.items || []).find((i) => i.kind === "support" && i.email === USER_A);
      assert.ok(supportItem);
      // Reply path: open conversation for that user (same as Admin Inbox "Reply / Message").
      const convo = await request(
        BASE,
        "GET",
        `/api/admin/messages/conversation?adminToken=${adminToken}&userEmail=${encodeURIComponent(supportItem.email)}`,
      );
      assert.equal(convo.status, 200);
      assert.ok(Array.isArray(convo.json.messages));
    });

    await test("8. Selected-audience broadcast only reaches chosen users", async () => {
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken,
          audience: "selected",
          selectedEmails: [USER_A],
          subject: "Selected only",
          body: "Only Audit Alpha should see this selected send.",
          confirm: true,
        },
      });
      assert.equal(send.status, 200, JSON.stringify(send.json));
      assert.equal(send.json.recipientCount, 1);

      const aNotifs = await request(BASE, "GET", "/api/notifications", { email: USER_A });
      assert.ok((aNotifs.json.notifications || []).some((n) => /Only Audit Alpha/i.test(n.preview || n.body || n.title || "")));

      const bNotifs = await request(BASE, "GET", "/api/notifications", { email: USER_B });
      assert.ok(!(bNotifs.json.notifications || []).some((n) => /Only Audit Alpha/i.test(n.preview || n.body || n.title || "")));
    });

    await test("9. List endpoints reject spoofed ?email= without auth", async () => {
      const tickets = await request(BASE, "GET", `/api/support-tickets?email=${encodeURIComponent(USER_A)}`);
      assert.equal(tickets.status, 401);

      const bugs = await request(BASE, "GET", `/api/bug-reports?email=${encodeURIComponent(USER_A)}`);
      assert.equal(bugs.status, 401);

      const feedback = await request(BASE, "GET", `/api/feedback?email=${encodeURIComponent(USER_A)}`);
      assert.equal(feedback.status, 401);

      const authed = await request(BASE, "GET", "/api/support-tickets", { email: USER_A });
      assert.equal(authed.status, 200);
      assert.ok((authed.json.tickets || []).every((t) => normalize(t.email) === USER_A || normalize(t.createdBy) === USER_A));
    });

    await test("10. Full conversation persists after server restart (store file)", async () => {
      const before = await request(BASE, "GET", "/api/messages/conversation", { email: USER_A });
      const beforeCount = before.json.messages.length;
      assert.ok(beforeCount >= 3);

      child.kill();
      await new Promise((r) => setTimeout(r, 400));
      ({ child, getLog } = startServer({ port: PORT, storeFile: STORE }));
      await waitForHealth(BASE);

      const login2 = await request(BASE, "POST", "/api/admin/login", {
        body: { email: ADMIN_EMAIL, password: "test-password", code: "test-code" },
      });
      adminToken = login2.json.token;

      const afterUser = await request(BASE, "GET", "/api/messages/conversation", { email: USER_A });
      assert.equal(afterUser.json.messages.length, beforeCount, "user thread must survive restart");

      const afterAdmin = await request(
        BASE,
        "GET",
        `/api/admin/messages/conversation?adminToken=${adminToken}&userEmail=${encodeURIComponent(USER_A)}`,
      );
      assert.equal(afterAdmin.json.messages.length, beforeCount, "admin thread must survive restart");
      assert.ok(afterAdmin.json.messages.some((m) => m.senderType === "user"));
      assert.ok(afterAdmin.json.messages.some((m) => m.senderType === "admin"));
    });

    await test("Static: mobile messaging CSS keeps composer readable", async () => {
      const css = fs.readFileSync(path.join(ROOT, "styles/llh-messaging.css"), "utf8");
      assert.match(css, /messages-reply-form[\s\S]*flex-direction:\s*column/);
      assert.match(css, /font-size:\s*16px/);
      assert.match(css, /safe-area-inset-bottom/);
    });

    if (process.exitCode) {
      console.error("\nBoot log for debugging:\n" + getLog());
    } else {
      console.log("\n✅ Two-way messaging audit PASSED.");
    }
  } finally {
    try { child.kill(); } catch {}
    try { fs.unlinkSync(STORE); } catch {}
  }
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
