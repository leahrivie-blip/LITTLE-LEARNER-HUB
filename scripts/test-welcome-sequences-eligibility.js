#!/usr/bin/env node
/**
 * Eligibility + copy checks for Free / Trial / Pro welcome sequences.
 * Does not send email or start the server.
 * Run: node scripts/test-welcome-sequences-eligibility.js
 */
const assert = require("node:assert/strict");
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
  AUTO_DELIVER_ELIGIBLE_AFTER,
  CONTENT_REVISION,
} = require("../server/onboarding-welcome.js");

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

const cutoff = AUTO_DELIVER_ELIGIBLE_AFTER;
const beforeCutoff = "2026-07-30T12:00:00.000Z";
const afterCutoff = "2026-08-01T12:00:00.000Z";

test("free welcome copy matches Leah's Free Member message", () => {
  const seq = defaultFreeWelcomeSequence();
  assert.equal(seq.contentRevision, CONTENT_REVISION);
  assert.equal(seq.inApp.title, "Welcome to Little Learner Hub! 💜");
  assert.match(seq.inApp.body, /As a Free Member/);
  assert.match(seq.inApp.body, /Send me a message anytime through Little Learner Hub/);
  assert.equal(seq.foundingSection.enabled, false);
});

test("trial welcome + check-in + pro welcome copy present", () => {
  assert.match(defaultTrialWelcomeSequence().inApp.title, /Pro Trial/);
  assert.match(defaultTrialWelcomeSequence().inApp.body, /Download or print up to 3 premium lesson plans/);
  assert.match(defaultTrialCheckinSequence().inApp.title, /Trial Going/);
  assert.equal(defaultTrialCheckinSequence().delayDays, 3);
  assert.match(defaultProWelcomeSequence().inApp.title, /Pro Member/);
  assert.match(defaultProWelcomeSequence().inApp.body, /Welcome to Pro!/);
});

test("existing Pros before cutoff never get Pro welcome", () => {
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

test("new Pros after cutoff are eligible once", () => {
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

test("trial welcome only for new trials after cutoff", () => {
  const store = { onboardingWelcome: { autoDeliverEligibleAfter: cutoff, sequences: {} } };
  ensureOnboardingWelcome(store);
  const oldTrial = {
    email: "old-trial@example.com",
    plan: "Pro",
    trialStatus: "In Trial",
    stripeSubscriptionStatus: "trialing",
    trialStart: beforeCutoff,
    trialEnd: "2026-08-06T12:00:00.000Z",
    subscriptionStartedAt: beforeCutoff,
  };
  const newTrial = {
    email: "new-trial@example.com",
    plan: "Pro",
    trialStatus: "In Trial",
    stripeSubscriptionStatus: "trialing",
    trialStart: afterCutoff,
    trialEnd: "2026-08-08T12:00:00.000Z",
    subscriptionStartedAt: afterCutoff,
  };
  assert.equal(isEligibleForTrialWelcome(oldTrial, store), false);
  assert.equal(isEligibleForTrialWelcome(newTrial, store), true);
});

test("trial check-in waits a couple days and skips old trials", () => {
  const store = { onboardingWelcome: { autoDeliverEligibleAfter: cutoff, sequences: {} } };
  ensureOnboardingWelcome(store);
  const now = new Date("2026-08-05T12:00:00.000Z").getTime();
  const dueTrial = {
    email: "due-trial@example.com",
    plan: "Pro",
    trialStatus: "In Trial",
    stripeSubscriptionStatus: "trialing",
    trialStart: afterCutoff,
    trialEnd: "2026-08-08T12:00:00.000Z",
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

test("free welcome still skips trial/pro", () => {
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
});

test("content revision refreshes stale stored free copy", () => {
  const store = {
    onboardingWelcome: {
      sequences: {
        "free-welcome": {
          contentRevision: "old",
          inApp: { title: "Old title", body: "Old body" },
          email: { subject: "Old subject", body: "Old body" },
        },
      },
    },
  };
  const root = ensureOnboardingWelcome(store);
  assert.equal(root.sequences["free-welcome"].contentRevision, CONTENT_REVISION);
  assert.equal(root.sequences["free-welcome"].inApp.title, "Welcome to Little Learner Hub! 💜");
  assert.match(root.sequences["free-welcome"].inApp.body, /As a Free Member/);
});

if (!process.exitCode) {
  console.log("\nAll welcome sequence eligibility checks passed.");
}
