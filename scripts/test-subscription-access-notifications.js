#!/usr/bin/env node
/**
 * Subscription access status + billing lifecycle email unit tests.
 * Run: npm run test:subscription-access-notifications
 */
const assert = require("assert");
const membership = require("./membership-access.js");
const billingEmail = require("../server/billing-lifecycle-email.js");

function testProductStatusExclusive() {
  const now = Date.parse("2026-07-17T12:00:00.000Z");
  const cases = [
    {
      name: "active founding",
      user: {
        plan: "Founding",
        foundingMemberActive: true,
        stripeSubscriptionStatus: "active",
        subscriptionStatus: "Founding Member Subscription Active",
      },
      expectKey: "active_founding",
      expectAdmin: "founding",
      expectAccess: true,
      expectBanner: null,
    },
    {
      name: "active pro",
      user: {
        plan: "Pro",
        stripeSubscriptionStatus: "active",
        subscriptionStatus: "Pro Monthly Subscription Active",
        subscriptionCadence: "monthly",
      },
      expectKey: "active_pro",
      expectAdmin: "active",
      expectAccess: true,
      expectBanner: null,
    },
    {
      name: "trial",
      user: {
        plan: "Pro",
        stripeSubscriptionStatus: "trialing",
        subscriptionStatus: "Pro Monthly Subscription Trialing",
        trialStatus: "In Trial",
        trialEnd: "2026-07-20T12:00:00.000Z",
        accessEndsAt: "2026-07-20T12:00:00.000Z",
      },
      expectKey: "trial",
      expectAdmin: "trial",
      expectAccess: true,
      expectBanner: null,
    },
    {
      // Confirmed mapping: past_due/unpaid are never canceled/ended — both display the
      // same neutral "Billing Review Required" label/key, never "Past Due"/"Payment Failed".
      name: "past due",
      user: {
        plan: "Free",
        stripeSubscriptionStatus: "past_due",
        subscriptionStatus: "Billing Review Required — Access Locked",
        previousPlan: "Pro",
        stripeSubscriptionId: "sub_123",
      },
      expectKey: "payment_failed",
      expectAdmin: "payment_failed",
      expectAccess: false,
      expectBanner: "billing_review_required",
    },
    {
      name: "payment failed unpaid",
      user: {
        plan: "Free",
        stripeSubscriptionStatus: "unpaid",
        subscriptionStatus: "Billing Review Required — Access Locked",
        previousPlan: "Pro",
        stripeSubscriptionId: "sub_456",
      },
      expectKey: "payment_failed",
      expectAdmin: "payment_failed",
      expectAccess: false,
      expectBanner: "billing_review_required",
    },
    {
      name: "inactive canceled",
      user: {
        plan: "Free",
        stripeSubscriptionStatus: "canceled",
        subscriptionStatus: "Subscription Ended",
        subscriptionStartedAt: "2026-01-01T00:00:00.000Z",
        previousPlan: "Pro",
      },
      expectKey: "inactive",
      expectAdmin: "canceled",
      expectAccess: false,
      expectBanner: "access_lost",
    },
    {
      name: "free never subscribed",
      user: {
        plan: "Free",
        subscriptionStatus: "Free Plan",
      },
      expectKey: "free",
      expectAdmin: "free",
      expectAccess: false,
      expectBanner: null,
    },
  ];

  cases.forEach((entry) => {
    const status = membership.membershipProductStatus(entry.user, now);
    assert.strictEqual(status.key, entry.expectKey, `${entry.name} key`);
    assert.strictEqual(status.adminKey, entry.expectAdmin, `${entry.name} adminKey`);
    assert.strictEqual(status.hasProAccess, entry.expectAccess, `${entry.name} access`);
    assert.strictEqual(status.banner, entry.expectBanner, `${entry.name} banner`);
    assert.ok(status.label, `${entry.name} label`);
    assert.ok(status.emoji, `${entry.name} emoji`);
  });

  // Trial label includes remaining days.
  const trial = membership.membershipProductStatus(cases.find((c) => c.name === "trial").user, now);
  assert.match(trial.label, /Trial \(3 Days Remaining\)/);

  console.log("✓ product status labels are mutually exclusive");
}

function testAdminBucketsExclusive() {
  const now = Date.parse("2026-07-17T12:00:00.000Z");
  const users = [
    { plan: "Founding", foundingMemberActive: true, stripeSubscriptionStatus: "active", subscriptionStatus: "Founding Member Subscription Active" },
    { plan: "Pro", stripeSubscriptionStatus: "active", subscriptionStatus: "Pro Monthly Subscription Active" },
    { plan: "Pro", stripeSubscriptionStatus: "trialing", trialStatus: "In Trial", trialEnd: "2026-07-20T12:00:00.000Z", accessEndsAt: "2026-07-20T12:00:00.000Z", subscriptionStatus: "Trialing" },
    // Confirmed mapping: past_due/unpaid are never canceled/ended, and both bucket as the
    // same "payment_failed" (fresh billing-review) admin key — never a separate "past_due"
    // bucket, never "ended"/"canceled".
    { plan: "Free", stripeSubscriptionStatus: "past_due", subscriptionStatus: "Billing Review Required — Access Locked", stripeSubscriptionId: "sub_a" },
    { plan: "Free", stripeSubscriptionStatus: "unpaid", subscriptionStatus: "Billing Review Required — Access Locked", stripeSubscriptionId: "sub_b" },
    { plan: "Free", stripeSubscriptionStatus: "canceled", subscriptionStatus: "Subscription Ended", subscriptionStartedAt: "2026-01-01T00:00:00.000Z" },
    { plan: "Free", subscriptionStatus: "Free Plan" },
  ];
  const buckets = membership.membershipAdminAuditBuckets(users, now);
  assert.strictEqual(buckets.founding, 1);
  assert.strictEqual(buckets.active, 1);
  assert.strictEqual(buckets.trial, 1);
  assert.strictEqual(buckets.past_due, 0, "past_due bucket key is retained for backward compatibility but never populated any more");
  assert.strictEqual(buckets.payment_failed, 2, "both past_due and unpaid signals land in the unified payment_failed (Billing Review Required) bucket");
  assert.strictEqual(buckets.canceled, 1);
  assert.strictEqual(buckets.free, 1);
  const total = Object.values(buckets).reduce((sum, n) => sum + n, 0);
  assert.strictEqual(total, users.length, "every user counted exactly once");
  console.log("✓ admin audit buckets are mutually exclusive");
}

function testAccessLockedForFailures() {
  assert.strictEqual(membership.membershipHasProAccess({
    plan: "Free",
    stripeSubscriptionStatus: "past_due",
    subscriptionStatus: "Billing Review Required — Access Locked",
  }), false);
  assert.strictEqual(membership.membershipHasProAccess({
    plan: "Free",
    stripeSubscriptionStatus: "unpaid",
    subscriptionStatus: "Billing Review Required — Access Locked",
  }), false);
  // Confirmed mapping: unpaid/past_due never imply "ended" — membershipStatusDisplay must
  // show the neutral Billing Review Required label, never Subscription Ended, for either.
  assert.strictEqual(
    membership.membershipStatusDisplay({ plan: "Free", stripeSubscriptionStatus: "unpaid", subscriptionStatus: "Billing Review Required — Access Locked" }),
    "Billing Review Required",
  );
  assert.strictEqual(
    membership.membershipStatusDisplay({ plan: "Free", stripeSubscriptionStatus: "past_due", subscriptionStatus: "Billing Review Required — Access Locked" }),
    "Billing Review Required",
  );
  console.log("✓ payment failures lock Pro access without deleting identity, and unpaid/past_due never display as ended/canceled");
}

async function testLifecycleEmails() {
  const payment = billingEmail.paymentFailedEmailContent({ firstName: "Leah" });
  assert.match(payment.subject, /Payment Issue/i);
  assert.match(payment.text, /unable to process/i);
  assert.match(payment.text, /Update Billing/i);

  const expired = billingEmail.accessExpiredEmailContent({ firstName: "Leah" });
  assert.match(expired.subject, /Subscription Is Inactive/i);
  assert.match(expired.text, /Free Plan/i);
  assert.match(expired.text, /Reactivate/i);

  let sent = 0;
  const fakeSend = async () => { sent += 1; };
  const first = await billingEmail.sendPaymentFailedUserEmail({
    user: {},
    email: "test@example.com",
    sendEmail: fakeSend,
  });
  assert.strictEqual(first.sent, true);
  const second = await billingEmail.sendPaymentFailedUserEmail({
    user: { lastPaymentFailedEmailAt: new Date().toISOString() },
    email: "test@example.com",
    sendEmail: fakeSend,
  });
  assert.strictEqual(second.sent, false);
  assert.strictEqual(second.skipped, "recently_sent");

  const accessOnce = await billingEmail.sendAccessExpiredUserEmail({
    user: {},
    email: "test@example.com",
    sendEmail: fakeSend,
  });
  assert.strictEqual(accessOnce.sent, true);
  const accessTwice = await billingEmail.sendAccessExpiredUserEmail({
    user: { lastAccessExpiredEmailAt: new Date().toISOString() },
    email: "test@example.com",
    sendEmail: fakeSend,
  });
  assert.strictEqual(accessTwice.sent, false);
  console.log("✓ billing lifecycle emails are idempotent and correctly worded");
}

async function main() {
  testProductStatusExclusive();
  testAdminBucketsExclusive();
  testAccessLockedForFailures();
  await testLifecycleEmails();
  console.log("\nSubscription access notification checks passed.");
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
