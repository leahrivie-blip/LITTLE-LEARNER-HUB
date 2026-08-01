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
const ADMIN_EMAIL = "admin@test.local";
const FREE_USER = "free-parent@example.com";

async function main() {
  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL },
    [FREE_USER]: {
      email: FREE_USER,
      firstName: "Free",
      lastName: "Parent",
      plan: "Free",
      subscriptionStatus: "Free Plan",
      accountType: "home_daycare",
      signupAt: "2026-01-15T12:00:00.000Z",
      lastSeenAt: "2026-07-10T12:00:00.000Z",
    },
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

    await test("User can initiate a conversation without a prior admin message", async () => {
      const starter = "starter-user@example.com";
      const reply = await request(BASE, "POST", "/api/messages/reply", {
        email: starter,
        body: { body: "Hi Leah — I have a question about lesson plans." },
      });
      assert.equal(reply.status, 200, JSON.stringify(reply.json));
      assert.equal(reply.json.message.senderType, "user");
      assert.equal(reply.json.message.audience, "private");
      const convo = await request(BASE, "GET", "/api/messages/conversation", { email: starter });
      assert.equal(convo.json.messages.length, 1);
      assert.equal(convo.json.messages[0].body, "Hi Leah — I have a question about lesson plans.");
      const conversations = await request(BASE, "GET", `/api/admin/conversations?adminToken=${adminToken}`);
      const thread = conversations.json.conversations.find((c) => c.userEmail === starter);
      assert.ok(thread, "admin should see the user-started conversation");
    });

    await test("Admin conversation endpoint returns user profile context", async () => {
      const detail = await request(
        BASE,
        "GET",
        `/api/admin/messages/conversation?adminToken=${adminToken}&userEmail=${encodeURIComponent(FREE_USER)}`,
      );
      assert.equal(detail.status, 200, JSON.stringify(detail.json));
      assert.ok(detail.json.user, "expected user profile payload");
      assert.equal(detail.json.user.email, FREE_USER);
      assert.match(detail.json.user.name, /Free Parent|free-parent/i);
      assert.equal(detail.json.user.plan, "Free");
      assert.ok(detail.json.user.accountType);
      assert.ok(detail.json.user.signupAt);
      assert.ok(detail.json.user.lastActiveAt);
      assert.ok(Array.isArray(detail.json.messages));
    });

    await test("Feature update broadcasts create feature_update notifications", async () => {
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken,
          audience: "all",
          kind: "feature_update",
          subject: "New Daily Logs Update Available",
          body: "We've added new lesson plans and activities this week!",
          confirm: true,
        },
      });
      assert.equal(send.status, 200, JSON.stringify(send.json));
      const notifs = await request(BASE, "GET", "/api/notifications", { email: FREE_USER });
      assert.ok(
        notifs.json.notifications.some((n) => n.type === "feature_update"),
        "expected a feature_update notification in the bell",
      );
    });

    await test("Lesson plan feedback is accepted into the support inbox", async () => {
      const feedback = await request(BASE, "POST", "/api/feedback", {
        body: {
          type: "Lesson Plan Feedback",
          name: "Free Parent",
          email: FREE_USER,
          subject: "Lesson plan feedback: Colors Everywhere (Helpful)",
          message: "Lesson plan: Colors Everywhere\nFeedback: Helpful\nMarked as helpful.",
        },
      });
      assert.equal(feedback.status, 200, JSON.stringify(feedback.json));
      assert.equal(feedback.json.feedback.type, "Lesson Plan Feedback");
      const ticket = await request(BASE, "POST", "/api/support-ticket", {
        body: {
          kind: "Lesson Plan Feedback",
          topic: "Needs Improvement",
          name: "Free Parent",
          email: FREE_USER,
          message: "Lesson plan: Colors Everywhere\nFeedback: Needs Improvement\nThe circle time felt long.",
        },
      });
      assert.equal(ticket.status, 200, JSON.stringify(ticket.json));
      assert.equal(ticket.json.ticket.kind, "Lesson Plan Feedback");
    });

    await test("Private lesson plan star ratings persist for admin review", async () => {
      const rated = await request(BASE, "POST", "/api/feedback", {
        body: {
          type: "Lesson Plan Feedback",
          name: "Free Parent",
          email: FREE_USER,
          subject: "Lesson plan feedback: Colors Everywhere (4 stars)",
          message: "Lesson plan: Colors Everywhere\nLesson ID: lesson-colors\nStars: 4 / 5\nFeedback: 4 stars",
          lessonId: "lesson-colors",
          sentiment: "rating",
          stars: 4,
          page: "lesson:lesson-colors",
        },
      });
      assert.equal(rated.status, 200, JSON.stringify(rated.json));
      assert.equal(rated.json.feedback.type, "Lesson Plan Feedback");
      assert.equal(rated.json.feedback.stars, 4);
      assert.equal(rated.json.feedback.lessonId, "lesson-colors");
      assert.equal(rated.json.feedback.sentiment, "rating");

      const invalid = await request(BASE, "POST", "/api/feedback", {
        body: {
          type: "Lesson Plan Feedback",
          name: "Free Parent",
          email: FREE_USER,
          subject: "bad stars",
          message: "ignore invalid stars",
          stars: 9,
          lessonId: "lesson-colors",
          sentiment: "rating",
        },
      });
      assert.equal(invalid.status, 200, JSON.stringify(invalid.json));
      assert.equal(invalid.json.feedback.stars, null);

      const list = await request(BASE, "GET", `/api/feedback?adminToken=${encodeURIComponent(adminToken)}`);
      assert.equal(list.status, 200, JSON.stringify(list.json));
      const items = list.json.feedback || [];
      assert.ok(items.some((item) => item.stars === 4 && item.lessonId === "lesson-colors"));
    });

    await test("Activity feedback thumbs persist for admin review", async () => {
      const feedback = await request(BASE, "POST", "/api/feedback", {
        body: {
          type: "Activity Feedback",
          name: "Free Parent",
          email: FREE_USER,
          subject: "Activity feedback: Texture Scoop (Helpful)",
          message: "Activity: Texture Scoop\nActivity ID: act-texture\nFeedback: Helpful\nMarked as helpful.",
          activityId: "act-texture",
          lessonId: "lesson-colors",
          sentiment: "helpful",
          page: "activity:act-texture",
        },
      });
      assert.equal(feedback.status, 200, JSON.stringify(feedback.json));
      assert.equal(feedback.json.feedback.type, "Activity Feedback");
      assert.equal(feedback.json.feedback.activityId, "act-texture");
      assert.equal(feedback.json.feedback.sentiment, "helpful");

      const ticket = await request(BASE, "POST", "/api/support-ticket", {
        body: {
          kind: "Activity Feedback",
          topic: "Needs Improvement",
          name: "Free Parent",
          email: FREE_USER,
          message: "Activity: Texture Scoop\nFeedback: Needs Improvement\nToo many setup steps.",
        },
      });
      assert.equal(ticket.status, 200, JSON.stringify(ticket.json));
      assert.equal(ticket.json.ticket.kind, "Activity Feedback");

      const list = await request(BASE, "GET", `/api/feedback?adminToken=${encodeURIComponent(adminToken)}`);
      assert.equal(list.status, 200, JSON.stringify(list.json));
      assert.ok((list.json.feedback || []).some((item) => item.type === "Activity Feedback" && item.activityId === "act-texture"));
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
