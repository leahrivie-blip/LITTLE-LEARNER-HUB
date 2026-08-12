#!/usr/bin/env node
/**
 * Eligibility + copy checks for Free / Trial / Pro welcome sequences.
 * Does not send email or start the server.
 * Run: node scripts/test-welcome-sequences-eligibility.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  ensureOnboardingWelcome,
  isEligibleForFreeWelcome,
  isEligibleForTrialWelcome,
  isEligibleForTrialCheckin,
  isEligibleForProWelcome,
  defaultFreeWelcomeSequence,
  defaultTrialWelcomeSequence,
  defaultTrialCheckinSequence,
  defaultProWelcomeSequence,
  buildWelcomePreview,
  createOnboardingWelcome,
  AUTO_DELIVER_ELIGIBLE_AFTER,
  CONTENT_REVISION,
} = require("../server/onboarding-welcome.js");

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`PASS  ${name}`))
    .catch((error) => {
      console.error(`FAIL  ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

const cutoff = AUTO_DELIVER_ELIGIBLE_AFTER;
const beforeCutoff = "2026-07-30T12:00:00.000Z";
const afterCutoff = "2026-08-01T12:00:00.000Z";

async function main() {
await test("free welcome copy matches Teaching Kits start email", () => {
  const seq = defaultFreeWelcomeSequence();
  assert.equal(seq.contentRevision, CONTENT_REVISION);
  assert.equal(seq.inApp.title, "Welcome to Little Learner Hub 💛 Here’s where to start");
  assert.equal(seq.email.subject, "Welcome to Little Learner Hub 💛 Here’s where to start");
  assert.match(seq.inApp.body, /Welcome to Little Learner Hub! 💛/);
  assert.match(seq.inApp.body, /Start with the lesson plans/);
  assert.match(seq.email.body, /\{\{PrimaryCta\}\}/);
  assert.equal(seq.email.primaryCtaLabel, "Explore Lesson Plans");
  assert.equal(seq.email.primaryCtaUrl, "{{LessonsUrl}}");
  assert.equal(seq.email.secondaryCtaLabel, "");
  assert.equal(seq.foundingSection.enabled, false);
});

await test("paid member welcome copy matches Leah's paid welcome", () => {
  const seq = defaultProWelcomeSequence();
  assert.equal(seq.contentRevision, CONTENT_REVISION);
  assert.equal(seq.inApp.title, "You’re officially a Little Learner Hub member 💛");
  assert.equal(seq.email.subject, "You’re officially a Little Learner Hub member 💛");
  assert.match(seq.inApp.body, /thank you for becoming a Little Learner Hub member/i);
  assert.match(seq.inApp.body, /reply to this email/i);
  assert.match(seq.inApp.body, /Creator, Little Learner Hub/);
  assert.equal(seq.email.primaryCtaLabel, "Explore Lesson Plans");
  assert.equal(seq.email.primaryCtaUrl, "{{LessonsUrl}}");
  assert.equal(seq.email.secondaryCtaLabel, "");
});

await test("trial welcome + check-in copy present", () => {
  assert.match(defaultTrialWelcomeSequence().inApp.title, /Pro Trial/);
  assert.match(defaultTrialWelcomeSequence().inApp.body, /Download or print up to 3 premium lesson plans/);
  assert.match(defaultTrialCheckinSequence().inApp.title, /Trial Going/);
  assert.equal(defaultTrialCheckinSequence().delayDays, 3);
});

await test("existing Pros before cutoff never get Pro welcome", () => {
  const store = { onboardingWelcome: { autoDeliverEligibleAfter: cutoff, sequences: {} } };
  ensureOnboardingWelcome(store);
  const recentPro = {
    email: "recent-pro@example.com",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active",
    subscriptionStartedAt: beforeCutoff,
  };
  assert.equal(isEligibleForProWelcome(recentPro, store), false);
});

await test("new Pros after cutoff are eligible once", () => {
  const store = { onboardingWelcome: { autoDeliverEligibleAfter: cutoff, sequences: {} } };
  ensureOnboardingWelcome(store);
  const newPro = {
    email: "new-pro@example.com",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active",
    subscriptionStartedAt: afterCutoff,
  };
  assert.equal(isEligibleForProWelcome(newPro, store), true);
  newPro.onboardingWelcome = { proWelcomeSentAt: afterCutoff };
  assert.equal(isEligibleForProWelcome(newPro, store), false);
});

await test("paid renewal / already stamped → no paid welcome", () => {
  const store = { onboardingWelcome: { autoDeliverEligibleAfter: cutoff, sequences: {} } };
  ensureOnboardingWelcome(store);
  const renewed = {
    email: "renewed@example.com",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active",
    subscriptionStartedAt: afterCutoff,
    onboardingWelcome: { proWelcomeSentAt: afterCutoff },
  };
  assert.equal(isEligibleForProWelcome(renewed, store), false);
});

await test("failed / incomplete paid state → no paid welcome", () => {
  const store = { onboardingWelcome: { autoDeliverEligibleAfter: cutoff, sequences: {} } };
  ensureOnboardingWelcome(store);
  assert.equal(isEligibleForProWelcome({
    email: "incomplete@example.com",
    plan: "Free",
    subscriptionStatus: "Free Plan",
    stripeSubscriptionStatus: "incomplete",
    subscriptionStartedAt: afterCutoff,
  }, store), false);
  assert.equal(isEligibleForProWelcome({
    email: "failed@example.com",
    plan: "Pro",
    subscriptionStatus: "Payment Failed",
    stripeSubscriptionStatus: "unpaid",
    subscriptionStartedAt: afterCutoff,
  }, store), false);
});

await test("trial welcome only for new trials after cutoff", () => {
  const store = { onboardingWelcome: { autoDeliverEligibleAfter: cutoff, sequences: {} } };
  ensureOnboardingWelcome(store);
  const oldTrial = {
    email: "old-trial@example.com",
    plan: "Pro",
    trialStatus: "In Trial",
    stripeSubscriptionStatus: "trialing",
    trialStart: beforeCutoff,
    trialEnd: "2026-08-20T12:00:00.000Z",
    subscriptionStartedAt: beforeCutoff,
  };
  const newTrial = {
    email: "new-trial@example.com",
    plan: "Pro",
    trialStatus: "In Trial",
    stripeSubscriptionStatus: "trialing",
    trialStart: afterCutoff,
    trialEnd: "2026-08-20T12:00:00.000Z",
    subscriptionStartedAt: afterCutoff,
  };
  assert.equal(isEligibleForTrialWelcome(oldTrial, store), false);
  assert.equal(isEligibleForTrialWelcome(newTrial, store), true);
});

await test("trial check-in waits a couple days and skips old trials", () => {
  const store = { onboardingWelcome: { autoDeliverEligibleAfter: cutoff, sequences: {} } };
  ensureOnboardingWelcome(store);
  const now = new Date("2026-08-05T12:00:00.000Z").getTime();
  const dueTrial = {
    email: "due-trial@example.com",
    plan: "Pro",
    trialStatus: "In Trial",
    stripeSubscriptionStatus: "trialing",
    trialStart: afterCutoff,
    trialEnd: "2026-08-20T12:00:00.000Z",
    subscriptionStartedAt: afterCutoff,
  };
  const freshTrial = {
    ...dueTrial,
    email: "fresh-trial@example.com",
    trialStart: "2026-08-04T18:00:00.000Z",
    subscriptionStartedAt: "2026-08-04T18:00:00.000Z",
  };
  assert.equal(isEligibleForTrialCheckin(dueTrial, store, now), true);
  assert.equal(isEligibleForTrialCheckin(freshTrial, store, now), false);
});

await test("free welcome eligible for free; skips paid / already stamped", () => {
  assert.equal(isEligibleForFreeWelcome({
    email: "free@example.com",
    plan: "Free",
    subscriptionStatus: "Free Plan",
  }), true);
  assert.equal(isEligibleForFreeWelcome({
    email: "pro@example.com",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active",
  }), false);
  assert.equal(isEligibleForFreeWelcome({
    email: "stamped@example.com",
    plan: "Free",
    subscriptionStatus: "Free Plan",
    onboardingWelcome: { freeWelcomeSentAt: afterCutoff },
  }), false);
});

await test("free welcome CTA uses canonical LessonsUrl route", () => {
  const store = { onboardingWelcome: { sequences: {} }, users: {} };
  ensureOnboardingWelcome(store);
  const preview = buildWelcomePreview(
    { email: "cta@example.com", firstName: "Sam", plan: "Free" },
    store,
    { SITE_URL: "https://littlelearnershubbyleah.com", htmlEscape: (v) => String(v ?? "") },
    "email",
  );
  assert.equal(preview.subject, "Welcome to Little Learner Hub 💛 Here’s where to start");
  assert.match(preview.html, /Explore Lesson Plans/);
  assert.match(preview.html, /https:\/\/littlelearnershubbyleah\.com\/#lessons/);
  assert.match(preview.text, /Explore Lesson Plans: https:\/\/littlelearnershubbyleah\.com\/#lessons/);
  assert.doesNotMatch(preview.html, /Upgrade to Pro/);
});

await test("paid welcome CTA uses LessonsUrl and no upgrade secondary", () => {
  const store = { onboardingWelcome: { sequences: {} }, users: {} };
  ensureOnboardingWelcome(store);
  const preview = buildWelcomePreview(
    {
      email: "paid-cta@example.com",
      firstName: "Pat",
      plan: "Pro",
      stripeSubscriptionStatus: "active",
      subscriptionStartedAt: afterCutoff,
    },
    store,
    { SITE_URL: "https://littlelearnershubbyleah.com", htmlEscape: (v) => String(v ?? "") },
    "email",
    "pro-welcome",
  );
  assert.equal(preview.subject, "You’re officially a Little Learner Hub member 💛");
  assert.match(preview.html, /Explore Lesson Plans/);
  assert.match(preview.html, /https:\/\/littlelearnershubbyleah\.com\/#lessons/);
  assert.doesNotMatch(preview.html, /Upgrade to Pro/);
});

await test("content revision refreshes stale stored free + paid copy", () => {
  const store = {
    onboardingWelcome: {
      sequences: {
        "free-welcome": {
          contentRevision: "old",
          inApp: { title: "Old title", body: "Old body" },
          email: { subject: "Old subject", body: "Old body" },
        },
        "pro-welcome": {
          contentRevision: "old",
          inApp: { title: "Old pro", body: "Old pro body" },
          email: { subject: "Old pro", body: "Old pro body" },
        },
      },
    },
  };
  const root = ensureOnboardingWelcome(store);
  assert.equal(root.sequences["free-welcome"].contentRevision, CONTENT_REVISION);
  assert.equal(root.sequences["free-welcome"].inApp.title, "Welcome to Little Learner Hub 💛 Here’s where to start");
  assert.match(root.sequences["free-welcome"].inApp.body, /Start with the lesson plans/);
  assert.equal(root.sequences["pro-welcome"].contentRevision, CONTENT_REVISION);
  assert.equal(root.sequences["pro-welcome"].inApp.title, "You’re officially a Little Learner Hub member 💛");
  assert.match(root.sequences["pro-welcome"].inApp.body, /reply to this email/i);
});

await test("welcome emails Reply-To uses SUPPORT_EMAIL_TO (monitored inbox)", () => {
  const moduleJs = fs.readFileSync(path.join(__dirname, "..", "server", "onboarding-welcome.js"), "utf8");
  const indexJs = fs.readFileSync(path.join(__dirname, "..", "server", "index.js"), "utf8");
  assert.match(moduleJs, /replyTo:\s*SUPPORT_EMAIL_TO/);
  assert.match(indexJs, /SUPPORT_EMAIL_TO\s*=\s*normalizeEmail\(process\.env\.SUPPORT_EMAIL_TO/);
  assert.match(indexJs, /SUPPORT_EMAIL_TO/);
  assert.match(indexJs, /createOnboardingWelcome\(\{[\s\S]*SUPPORT_EMAIL_TO/);
});

await test("paid welcome delivers once; renewals / duplicates skipped", async () => {
  const afterCutoff = "2026-08-01T12:00:00.000Z";
  let store = {
    users: {
      "paid@example.com": {
        email: "paid@example.com",
        firstName: "Pat",
        plan: "Pro",
        subscriptionStatus: "Pro Monthly Subscription Active",
        stripeSubscriptionStatus: "active",
        subscriptionStartedAt: afterCutoff,
      },
    },
    messages: [],
    notifications: [],
    onboardingWelcome: { autoDeliverEligibleAfter: cutoff, sequences: {} },
  };
  ensureOnboardingWelcome(store);
  const sends = [];
  const api = createOnboardingWelcome({
    readStore: () => store,
    writeStore: (next) => { store = next; },
    writableStore: () => store,
    sendEmail: async (opts) => {
      sends.push(opts);
      return { sent: true, configured: true, provider: "test", messageId: `msg-${sends.length}` };
    },
    fanOutNotificationsAndPush: async () => ({ created: 1 }),
    ensureMessagingStore: (s) => {
      s.messages = Array.isArray(s.messages) ? s.messages : [];
      s.notifications = Array.isArray(s.notifications) ? s.notifications : [];
      return s;
    },
    messagingRandomId: () => `id-${Date.now()}`,
    messagePreviewText: (body) => String(body || "").slice(0, 80),
    messagingLib: { MESSAGE_KINDS: ["message", "announcement"] },
    foundingSpotsRemaining: () => 0,
    ADMIN_EMAIL: "owner@example.com",
    ADMIN_NAME: "Leah",
    SUPPORT_EMAIL_TO: "little.learners.hub.customer@gmail.com",
    SITE_URL: "https://littlelearnershubbyleah.com",
    htmlEscape: (v) => String(v ?? ""),
  });

  const first = await api.maybeDeliverOnProPurchase("paid@example.com");
  assert.equal(first.ok, true);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].subject, "You’re officially a Little Learner Hub member 💛");
  assert.equal(sends[0].replyTo, "little.learners.hub.customer@gmail.com");
  assert.match(sends[0].text, /reply to this email/i);
  assert.ok(store.users["paid@example.com"].onboardingWelcome.proWelcomeSentAt);

  const duplicate = await api.maybeDeliverOnProPurchase("paid@example.com");
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, "not_eligible");
  assert.equal(sends.length, 1, "duplicate purchase hook must not resend");

  // Free user must not receive paid welcome.
  store.users["free@example.com"] = {
    email: "free@example.com",
    plan: "Free",
    subscriptionStatus: "Free Plan",
    signupAt: afterCutoff,
  };
  const freeAttempt = await api.maybeDeliverOnProPurchase("free@example.com");
  assert.equal(freeAttempt.ok, false);
  assert.equal(freeAttempt.reason, "not_eligible");
  assert.equal(sends.length, 1);
});

if (!process.exitCode) {
  console.log("\nAll welcome sequence eligibility checks passed.");
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
