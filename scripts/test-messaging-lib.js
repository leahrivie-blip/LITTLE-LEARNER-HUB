#!/usr/bin/env node
/**
 * Unit tests for server/messaging-lib.js — audience targeting must use the
 * authoritative membership-access rules, not display labels, and must never
 * leak admin-only or other-account messages into the wrong group.
 * Run: node scripts/test-messaging-lib.js
 */
const assert = require("node:assert/strict");
const membershipAccess = require("../scripts/membership-access.js");
const { createMessagingCenter, pushCopyForNotification } = require("../server/messaging-lib.js");

const messaging = createMessagingCenter({ membershipAccess });
const ADMIN_EMAIL = "leah@littlelearnerhub.com";

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

function makeStore() {
  return {
    users: {
      "free@example.com": { email: "free@example.com", plan: "Free", subscriptionStatus: "Free Plan" },
      "pro@example.com": {
        email: "pro@example.com",
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        stripeSubscriptionStatus: "active",
      },
      "founding@example.com": {
        email: "founding@example.com",
        plan: "Founding",
        subscriptionStatus: "Founding Member Subscription Active",
        stripeSubscriptionStatus: "active",
        foundingMemberActive: true,
      },
      "expired-founding@example.com": {
        // Historical founding flags set, but subscription is gone -> must be Free, not Founding.
        email: "expired-founding@example.com",
        plan: "Free",
        subscriptionStatus: "Subscription Ended",
        stripeSubscriptionStatus: "canceled",
        foundingMemberHistorical: true,
        foundingMemberActive: false,
      },
      "trial@example.com": {
        email: "trial@example.com",
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Trialing",
        stripeSubscriptionStatus: "trialing",
        trialEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      "past-due@example.com": {
        email: "past-due@example.com",
        plan: "Pro",
        subscriptionStatus: "Past Due",
        stripeSubscriptionStatus: "past_due",
      },
      "teacher@example.com": {
        // Staff account under a Pro owner — must inherit Pro, not be Free
        // just because the staff record itself has no billing fields.
        email: "teacher@example.com",
        role: "teacher",
        linkedProgramOwnerEmail: "pro@example.com",
        programAccessViaOwner: true,
      },
      [ADMIN_EMAIL]: { email: ADMIN_EMAIL, plan: "Free" },
    },
  };
}

test("accessGroupForUser classifies Free/Pro/Founding by authoritative access, not label", () => {
  const store = makeStore();
  assert.equal(messaging.accessGroupForUser(store, store.users["free@example.com"]), "free");
  assert.equal(messaging.accessGroupForUser(store, store.users["pro@example.com"]), "pro");
  assert.equal(messaging.accessGroupForUser(store, store.users["founding@example.com"]), "founding");
});

test("accessGroupForUser demotes expired/historical founding flags to free", () => {
  const store = makeStore();
  assert.equal(messaging.accessGroupForUser(store, store.users["expired-founding@example.com"]), "free");
});

test("accessGroupForUser treats active trial as pro-tier for targeting", () => {
  const store = makeStore();
  assert.equal(messaging.accessGroupForUser(store, store.users["trial@example.com"]), "pro");
});

test("accessGroupForUser demotes past_due (lost access) to free", () => {
  const store = makeStore();
  assert.equal(messaging.accessGroupForUser(store, store.users["past-due@example.com"]), "free");
});

test("accessGroupForUser resolves staff via linked program owner, not own record", () => {
  const store = makeStore();
  assert.equal(messaging.accessGroupForUser(store, store.users["teacher@example.com"]), "pro");
});

test("resolveAudienceRecipients: private returns exactly the one recipient", () => {
  const store = makeStore();
  const recipients = messaging.resolveAudienceRecipients(store, {
    audience: "private", toEmail: "pro@example.com", adminEmail: ADMIN_EMAIL,
  });
  assert.deepEqual(recipients, ["pro@example.com"]);
});

test("resolveAudienceRecipients: free/pro/founding never cross-contaminate", () => {
  const store = makeStore();
  const free = messaging.resolveAudienceRecipients(store, { audience: "free", adminEmail: ADMIN_EMAIL });
  const pro = messaging.resolveAudienceRecipients(store, { audience: "pro", adminEmail: ADMIN_EMAIL });
  const founding = messaging.resolveAudienceRecipients(store, { audience: "founding", adminEmail: ADMIN_EMAIL });
  assert.ok(free.includes("free@example.com"));
  assert.ok(free.includes("expired-founding@example.com"));
  assert.ok(free.includes("past-due@example.com"));
  assert.ok(!free.includes("pro@example.com"));
  assert.ok(!free.includes("founding@example.com"));

  assert.ok(pro.includes("pro@example.com"));
  assert.ok(pro.includes("trial@example.com"));
  assert.ok(pro.includes("teacher@example.com"));
  assert.ok(!pro.includes("founding@example.com"));
  assert.ok(!pro.includes("free@example.com"));

  assert.deepEqual(founding, ["founding@example.com"]);
});

test("resolveAudienceRecipients: all excludes the admin account", () => {
  const store = makeStore();
  const all = messaging.resolveAudienceRecipients(store, { audience: "all", adminEmail: ADMIN_EMAIL });
  assert.ok(!all.includes(ADMIN_EMAIL));
  assert.ok(all.includes("free@example.com"));
  assert.ok(all.includes("founding@example.com"));
});

test("resolveAudienceRecipients: selected only includes real users and excludes admin", () => {
  const store = makeStore();
  const selected = messaging.resolveAudienceRecipients(store, {
    audience: "selected",
    selectedEmails: ["free@example.com", "not-a-real-user@example.com", ADMIN_EMAIL],
    adminEmail: ADMIN_EMAIL,
  });
  assert.deepEqual(selected, ["free@example.com"]);
});

test("pushCopyForNotification never includes private message body text", () => {
  const copy = pushCopyForNotification({ type: "message", senderName: "Leah" });
  assert.equal(copy.body, "Leah sent you a new message.");
  assert.ok(!copy.body.includes("secret"));
});

test("pushCopyForNotification announcement/support copy matches product spec", () => {
  const announcement = pushCopyForNotification({ type: "announcement", title: "New lesson plans added 🎉" });
  assert.equal(announcement.title, "New lesson plans added 🎉");
  assert.equal(announcement.body, "Open Little Learner Hub to see what's new.");

  const support = pushCopyForNotification({ type: "support_reply" });
  assert.equal(support.body, "Your support request has an update.");
});

if (process.exitCode) {
  console.error("\nOne or more messaging-lib tests failed.");
} else {
  console.log("\nAll messaging-lib tests passed.");
}
