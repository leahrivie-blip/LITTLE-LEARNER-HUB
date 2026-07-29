#!/usr/bin/env node
/**
 * Final production-style smoke test for Member Messaging Center.
 *
 * Uses separate Admin (Leah) and Free test accounts against a local throwaway
 * store + fake push provider. Never sends real bulk/production broadcasts.
 *
 * Run: node scripts/test-messaging-final-smoke.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT, request, waitForHealth, startServer, seedStore, test, poll,
  startFakePushProvider, fakeSubscription,
} = require("./lib/messaging-test-harness.js");

const PORT = 4331;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE = path.join(ROOT, "server", `.messaging-final-smoke-${process.pid}.json`);
const ADMIN_EMAIL = "admin@test.local";
const FREE_USER = "free-smoke@example.com";
const OTHER_FREE = "other-free@example.com";
const PRO_USER = "pro-smoke@example.com";

function countBy(list, pred) {
  return (list || []).filter(pred).length;
}

async function main() {
  const provider = await startFakePushProvider();
  seedStore(STORE, {
    [ADMIN_EMAIL]: { email: ADMIN_EMAIL },
    [FREE_USER]: {
      email: FREE_USER,
      firstName: "Free",
      lastName: "Smoke",
      plan: "Free",
      subscriptionStatus: "Free Plan",
      accountType: "home_daycare",
      signupAt: "2026-02-01T12:00:00.000Z",
      lastSeenAt: "2026-07-15T18:00:00.000Z",
      businessName: "Sunshine Home Daycare",
    },
    [OTHER_FREE]: { email: OTHER_FREE, firstName: "Other", lastName: "Free", plan: "Free" },
    [PRO_USER]: {
      email: PRO_USER,
      plan: "Pro",
      subscriptionStatus: "Pro Monthly Subscription Active",
      stripeSubscriptionStatus: "active",
    },
  });

  let { child, getLog } = startServer({ port: PORT, storeFile: STORE });
  let adminToken = "";
  let playwrightPass = false;

  try {
    await waitForHealth(BASE);

    await test("Admin and Free accounts authenticate separately", async () => {
      const login = await request(BASE, "POST", "/api/admin/login", {
        body: { email: ADMIN_EMAIL, password: "test-password", code: "test-code" },
      });
      assert.equal(login.status, 200, JSON.stringify(login.json));
      adminToken = login.json.token;
      assert.ok(adminToken);

      const freeConvo = await request(BASE, "GET", "/api/messages/conversation", { email: FREE_USER });
      assert.equal(freeConvo.status, 200);
      assert.equal(freeConvo.json.messages.length, 0, "Free user starts with an empty thread");
    });

    await test("1. Free user starts Message Support conversation with no prior admin message", async () => {
      const reply = await request(BASE, "POST", "/api/messages/reply", {
        email: FREE_USER,
        body: { body: "Hi Leah — I need help with my Free plan lesson library." },
      });
      assert.equal(reply.status, 200, JSON.stringify(reply.json));
      assert.equal(reply.json.message.senderType, "user");
      assert.equal(reply.json.message.audience, "private");
      assert.equal(reply.json.message.conversationEmail, FREE_USER);

      const convo = await request(BASE, "GET", "/api/messages/conversation", { email: FREE_USER });
      assert.equal(convo.json.messages.length, 1);
      assert.match(convo.json.messages[0].body, /Free plan lesson library/);
    });

    await test("2. Leah sees the thread in Admin → Messages with profile + unread badge", async () => {
      const list = await request(BASE, "GET", `/api/admin/conversations?adminToken=${adminToken}`);
      assert.equal(list.status, 200);
      const thread = list.json.conversations.find((c) => c.userEmail === FREE_USER);
      assert.ok(thread, "conversation must appear for Free user");
      assert.ok(thread.unreadFromUser >= 1, "unread badge from user must be present");

      const detail = await request(
        BASE,
        "GET",
        `/api/admin/messages/conversation?adminToken=${adminToken}&userEmail=${encodeURIComponent(FREE_USER)}`,
      );
      assert.equal(detail.status, 200);
      assert.equal(detail.json.user.email, FREE_USER);
      assert.match(detail.json.user.name, /Free Smoke/);
      assert.equal(detail.json.user.plan, "Free");
      assert.ok(detail.json.user.accountType, "account type required");
      assert.ok(detail.json.user.signupAt, "signup date required");
      assert.ok(detail.json.user.lastActiveAt, "last active required");
      assert.equal(detail.json.user.businessName, "Sunshine Home Daycare");
      assert.equal(detail.json.messages.length, 1);
    });

    await test("3. Leah replies → Free user gets in-app notification", async () => {
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken,
          audience: "private",
          toEmail: FREE_USER,
          subject: "Re: lesson library",
          body: "Happy to help! Which age group are you planning for?",
        },
      });
      assert.equal(send.status, 200, JSON.stringify(send.json));

      const notifs = await request(BASE, "GET", "/api/notifications", { email: FREE_USER });
      assert.equal(notifs.status, 200);
      assert.ok(notifs.json.unreadCount >= 1);
      assert.ok(notifs.json.notifications.some((n) => n.type === "message" && !n.read));

      const convo = await request(BASE, "GET", "/api/messages/conversation", { email: FREE_USER });
      assert.equal(convo.json.messages.length, 2);
      assert.equal(convo.json.messages[1].senderType, "admin");
    });

    let freeDeviceSub = null;
    await test("4. Installed app + notifications enabled → push is triggered on Leah reply", async () => {
      // Simulate Home Screen install + explicit push opt-in for the Free user.
      const allow = await request(BASE, "POST", "/api/notification-preferences", {
        email: FREE_USER,
        body: { decision: "granted" },
      });
      assert.equal(allow.json.preference.pushEnabled, true);

      freeDeviceSub = fakeSubscription({
        providerPort: provider.port,
        statusCode: 201,
        deviceId: "free-smoke-device-1",
      });
      const subscribe = await request(BASE, "POST", "/api/push/subscribe", {
        email: FREE_USER,
        body: { subscription: freeDeviceSub, userAgent: "Mozilla/5.0 (iPhone) Safari — LLH PWA" },
      });
      assert.equal(subscribe.status, 200);
      assert.equal(subscribe.json.deviceCount, 1);

      const beforeLog = await request(BASE, "GET", `/api/admin/push/log?adminToken=${adminToken}`);
      const beforeSent = countBy(beforeLog.json.log, (e) => e.result === "sent" && e.email === FREE_USER);

      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken,
          audience: "private",
          toEmail: FREE_USER,
          body: "Also — new toddler lesson plans are in the library.",
        },
      });
      assert.equal(send.status, 200);

      await poll(async () => {
        const log = await request(BASE, "GET", `/api/admin/push/log?adminToken=${adminToken}`);
        const sent = countBy(log.json.log, (e) => e.result === "sent" && e.email === FREE_USER);
        return sent > beforeSent ? sent : false;
      });
    });

    await test("5. User replies again — same conversation thread is preserved", async () => {
      const reply = await request(BASE, "POST", "/api/messages/reply", {
        email: FREE_USER,
        body: { body: "Toddler 2s — thank you!" },
      });
      assert.equal(reply.status, 200);

      const convo = await request(BASE, "GET", "/api/messages/conversation", { email: FREE_USER });
      assert.ok(convo.json.messages.length >= 3);
      const emails = new Set(convo.json.messages.map((m) => m.conversationEmail || FREE_USER));
      assert.equal(emails.size, 1, "all messages must stay in one thread");
      assert.ok(convo.json.messages.every((m) => m.audience === "private"));
      assert.equal(convo.json.messages.at(-1).body, "Toddler 2s — thank you!");
      assert.equal(convo.json.messages.at(-1).senderType, "user");

      const detail = await request(
        BASE,
        "GET",
        `/api/admin/messages/conversation?adminToken=${adminToken}&userEmail=${encodeURIComponent(FREE_USER)}`,
      );
      assert.equal(detail.json.messages.length, convo.json.messages.length);
    });

    await test("6. Bug, feature request, and lesson Needs Improvement reach correct areas without duplicates", async () => {
      const feedbackBefore = await request(BASE, "GET", `/api/feedback?adminToken=${adminToken}`);
      const ticketsBefore = await request(BASE, "GET", `/api/support-tickets?adminToken=${adminToken}`);
      const fb0 = feedbackBefore.json.feedback?.length || feedbackBefore.json.items?.length || 0;
      const tk0 = ticketsBefore.json.tickets?.length || 0;

      const bug = await request(BASE, "POST", "/api/feedback", {
        body: {
          type: "Bug",
          name: "Free Smoke",
          email: FREE_USER,
          subject: "Calendar week fails to load",
          message: "Tapping this week shows a blank panel.",
        },
      });
      assert.equal(bug.status, 200);
      assert.equal(bug.json.feedback.type, "Bug");

      const feature = await request(BASE, "POST", "/api/feedback", {
        body: {
          type: "Feature Request",
          name: "Free Smoke",
          email: FREE_USER,
          subject: "Print all activities at once",
          message: "Would love a one-click print for the full week.",
        },
      });
      assert.equal(feature.status, 200);
      assert.equal(feature.json.feedback.type, "Feature Request");

      // Lesson Needs Improvement: feedback + one support ticket (support inbox).
      const lessonFb = await request(BASE, "POST", "/api/feedback", {
        body: {
          type: "Lesson Plan Feedback",
          name: "Free Smoke",
          email: FREE_USER,
          subject: "Lesson plan feedback: Colors Everywhere (Needs Improvement)",
          message: "Lesson plan: Colors Everywhere\nLesson ID: preschool-colors\nFeedback: Needs Improvement\nCircle time felt too long.",
        },
      });
      assert.equal(lessonFb.status, 200);
      assert.equal(lessonFb.json.feedback.type, "Lesson Plan Feedback");

      const lessonTicket = await request(BASE, "POST", "/api/support-ticket", {
        body: {
          kind: "Lesson Plan Feedback",
          topic: "Needs Improvement",
          name: "Free Smoke",
          email: FREE_USER,
          message: "Lesson plan: Colors Everywhere\nLesson ID: preschool-colors\nFeedback: Needs Improvement\nCircle time felt too long.",
        },
      });
      assert.equal(lessonTicket.status, 200);
      assert.equal(lessonTicket.json.ticket.kind, "Lesson Plan Feedback");

      const feedbackAfter = await request(BASE, "GET", `/api/feedback?adminToken=${adminToken}`);
      const ticketsAfter = await request(BASE, "GET", `/api/support-tickets?adminToken=${adminToken}`);
      const feedbackItems = feedbackAfter.json.feedback || feedbackAfter.json.items || [];
      const tickets = ticketsAfter.json.tickets || [];

      assert.equal(countBy(feedbackItems, (i) => i.type === "Bug" && i.email === FREE_USER), 1);
      assert.equal(countBy(feedbackItems, (i) => i.type === "Feature Request" && i.email === FREE_USER), 1);
      assert.equal(countBy(feedbackItems, (i) => i.type === "Lesson Plan Feedback" && i.email === FREE_USER), 1);
      assert.equal(countBy(tickets, (t) => t.kind === "Lesson Plan Feedback" && t.email === FREE_USER), 1);

      // Bug/feature must not spawn support tickets; lesson creates exactly one.
      assert.equal(
        countBy(tickets, (t) => t.email === FREE_USER && /Calendar week|Print all activities/i.test(t.message || "")),
        0,
        "bug/feature feedback must not create support tickets",
      );
      assert.equal(feedbackItems.length, fb0 + 3);
      assert.equal(tickets.length, tk0 + 1);
    });

    await test("7. Private check-in template message to one Free test user", async () => {
      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken,
          audience: "private",
          toEmail: FREE_USER,
          subject: "Just checking in",
          body: "Hi! Just checking in to see how you're enjoying Little Learner Hub. We'd love your feedback.",
          kind: "message",
        },
      });
      assert.equal(send.status, 200);
      assert.equal(send.json.recipientCount, 1);

      const convo = await request(BASE, "GET", "/api/messages/conversation", { email: FREE_USER });
      assert.ok(convo.json.messages.some((m) => /checking in/i.test(m.body)));
    });

    await test("8. Preview Free-user group message — confirm count, do NOT broadcast", async () => {
      const preview = await request(BASE, "POST", "/api/admin/messages/preview", {
        body: {
          adminToken,
          audience: "free",
          body: "SMOKE TEST ONLY — do not send this to production users.",
        },
      });
      assert.equal(preview.status, 200, JSON.stringify(preview.json));
      assert.equal(preview.json.recipientCount, 2, "exactly the two Free smoke users");
      assert.match(String(preview.json.audienceLabel || ""), /free/i);

      // Explicitly refuse to send without confirm, and do not confirm.
      const blocked = await request(BASE, "POST", "/api/admin/messages/send", {
        body: {
          adminToken,
          audience: "free",
          body: "SMOKE TEST ONLY — do not send this to production users.",
          confirm: false,
        },
      });
      assert.equal(blocked.status, 400, "group send without confirm must be rejected");

      const otherConvo = await request(BASE, "GET", "/api/messages/conversation", { email: OTHER_FREE });
      assert.equal(otherConvo.json.messages.length, 0, "no broadcast reached the other Free user");

      const otherNotifs = await request(BASE, "GET", "/api/notifications", { email: OTHER_FREE });
      assert.equal(otherNotifs.json.unreadCount || 0, 0);
    });

    await test("9. Regular users cannot access admin conversations, other users, or admin tools", async () => {
      const adminList = await request(BASE, "GET", `/api/admin/conversations?adminToken=not-a-real-token`);
      assert.equal(adminList.status, 401);

      const adminConvo = await request(
        BASE,
        "GET",
        `/api/admin/messages/conversation?adminToken=fake&userEmail=${encodeURIComponent(FREE_USER)}`,
      );
      assert.equal(adminConvo.status, 401);

      const preview = await request(BASE, "POST", "/api/admin/messages/preview", {
        email: FREE_USER,
        body: { audience: "all", body: "should fail" },
      });
      assert.equal(preview.status, 401);

      const send = await request(BASE, "POST", "/api/admin/messages/send", {
        email: FREE_USER,
        body: { audience: "private", toEmail: OTHER_FREE, body: "should fail" },
      });
      assert.equal(send.status, 401);

      const otherThread = await request(BASE, "GET", "/api/messages/conversation", { email: OTHER_FREE });
      assert.equal(otherThread.json.messages.length, 0);

      // Free user must not see Pro user's private thread even if they guess.
      await request(BASE, "POST", "/api/admin/messages/send", {
        body: { adminToken, audience: "private", toEmail: PRO_USER, body: "Pro-only hello" },
      });
      const freeSeesPro = await request(BASE, "GET", "/api/messages/conversation", { email: FREE_USER });
      assert.ok(!freeSeesPro.json.messages.some((m) => /Pro-only hello/.test(m.body)));

      const proSeesOwn = await request(BASE, "GET", "/api/messages/conversation", { email: PRO_USER });
      assert.ok(proSeesOwn.json.messages.some((m) => /Pro-only hello/.test(m.body)));

      const pushSubs = await request(BASE, "GET", `/api/admin/push/subscriptions?adminToken=`);
      assert.equal(pushSubs.status, 401);
    });

    await test("10. Persistence after refresh simulation + logout/login + redeploy (server restart)", async () => {
      const beforeConvo = await request(BASE, "GET", "/api/messages/conversation", { email: FREE_USER });
      const beforeNotifs = await request(BASE, "GET", "/api/notifications", { email: FREE_USER });
      const beforePrefs = await request(BASE, "GET", "/api/notification-preferences", { email: FREE_USER });
      const beforeSubs = await request(BASE, "GET", `/api/admin/push/subscriptions?adminToken=${adminToken}`);
      const beforeMsgCount = beforeConvo.json.messages.length;
      const beforeUnread = beforeNotifs.json.unreadCount;
      const beforePushEnabled = beforePrefs.json.preference.pushEnabled;
      const beforeDevices = beforeSubs.json.byUser.find((u) => u.email === FREE_USER)?.devices.length || 0;
      assert.ok(beforeMsgCount >= 3);
      assert.equal(beforePushEnabled, true);
      assert.ok(beforeDevices >= 1);

      // "Refresh" — re-fetch with same session identity.
      const refreshConvo = await request(BASE, "GET", "/api/messages/conversation", { email: FREE_USER });
      assert.equal(refreshConvo.json.messages.length, beforeMsgCount);

      // "Logout/login" — revoke device then re-subscribe; conversation must remain.
      assert.ok(freeDeviceSub, "expected a subscribed Free-user device from earlier step");
      await request(BASE, "POST", "/api/push/unsubscribe", {
        email: FREE_USER,
        body: { endpoint: freeDeviceSub.endpoint },
      });
      const afterLogoutSubs = await request(BASE, "GET", `/api/admin/push/subscriptions?adminToken=${adminToken}`);
      const afterLogoutDevices = afterLogoutSubs.json.byUser.find((u) => u.email === FREE_USER)?.devices.length || 0;
      assert.equal(afterLogoutDevices, 0);

      const stillThere = await request(BASE, "GET", "/api/messages/conversation", { email: FREE_USER });
      assert.equal(stillThere.json.messages.length, beforeMsgCount);

      const reloginPref = await request(BASE, "POST", "/api/notification-preferences", {
        email: FREE_USER,
        body: { decision: "granted" },
      });
      assert.equal(reloginPref.json.preference.pushEnabled, true);
      freeDeviceSub = fakeSubscription({
        providerPort: provider.port,
        statusCode: 201,
        deviceId: "free-smoke-device-1",
      });
      await request(BASE, "POST", "/api/push/subscribe", {
        email: FREE_USER,
        body: {
          subscription: freeDeviceSub,
          userAgent: "Mozilla/5.0 (iPhone) Safari — LLH PWA",
        },
      });

      // Redeploy simulation: restart server against the same store file.
      child.kill();
      await new Promise((r) => setTimeout(r, 400));
      ({ child, getLog } = startServer({ port: PORT, storeFile: STORE }));
      await waitForHealth(BASE);

      const login2 = await request(BASE, "POST", "/api/admin/login", {
        body: { email: ADMIN_EMAIL, password: "test-password", code: "test-code" },
      });
      adminToken = login2.json.token;

      const afterConvo = await request(BASE, "GET", "/api/messages/conversation", { email: FREE_USER });
      const afterNotifs = await request(BASE, "GET", "/api/notifications", { email: FREE_USER });
      const afterPrefs = await request(BASE, "GET", "/api/notification-preferences", { email: FREE_USER });
      const afterSubs = await request(BASE, "GET", `/api/admin/push/subscriptions?adminToken=${adminToken}`);
      assert.equal(afterConvo.json.messages.length, beforeMsgCount, "messages survive redeploy");
      assert.equal(afterNotifs.json.unreadCount, beforeUnread, "unread counts survive redeploy");
      assert.equal(afterPrefs.json.preference.pushEnabled, true, "notification prefs survive redeploy");
      assert.ok(
        (afterSubs.json.byUser.find((u) => u.email === FREE_USER)?.devices.length || 0) >= 1,
        "push subscription survives redeploy",
      );
    });

    // Browser UI: Free user can click Message Support and start a conversation.
    await test("UI: Free user Message Support button opens Messages and can send first message", async () => {
      let playwright;
      try {
        playwright = require("playwright");
      } catch {
        console.log("SKIP  Playwright not available for UI Message Support click");
        return;
      }

      const browser = await playwright.chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.addInitScript((email) => {
          localStorage.setItem("llhUser", email);
        }, OTHER_FREE);
        await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => typeof setView === "function", null, { timeout: 30000 });
        await page.waitForTimeout(600);

        await page.waitForFunction(() => {
          const btn = document.querySelector("#messageSupportBtn");
          return btn && !btn.hidden;
        }, null, { timeout: 15000 });
        await page.click("#messageSupportBtn");
        await page.waitForFunction(() => {
          const input = document.querySelector("#messagesReplyInput");
          return Boolean(input);
        }, null, { timeout: 15000 });

        const emptyCopy = await page.textContent(".messages-empty-start, .messages-conversation");
        assert.ok(/Message Support|Leah|message/i.test(emptyCopy || ""), "empty conversation should invite messaging Leah");

        await page.fill("#messagesReplyInput", "Starting from Message Support with no prior admin message.");
        await page.click("#messagesReplyForm button[type='submit']");
        await page.waitForFunction(() => {
          const bubbles = document.querySelectorAll(".message-bubble");
          return bubbles.length >= 1;
        }, null, { timeout: 15000 });

        const bodyText = await page.textContent(".message-bubble-body");
        assert.match(bodyText || "", /Starting from Message Support/);
        playwrightPass = true;
      } finally {
        await browser.close();
      }
    });

    if (process.exitCode) {
      console.error("\nBoot log for debugging:\n" + getLog());
    } else {
      console.log("\n✅ Final production-style smoke test PASSED (no real bulk broadcasts sent).");
      if (playwrightPass) console.log("✅ UI Message Support path verified in Playwright.");
    }
  } finally {
    try { child.kill(); } catch {}
    try { provider.server.close(); } catch {}
    try { fs.unlinkSync(STORE); } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
