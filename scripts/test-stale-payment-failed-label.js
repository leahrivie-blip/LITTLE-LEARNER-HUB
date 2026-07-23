#!/usr/bin/env node
/**
 * Regression test for the stale "Payment Failed" admin-dashboard label bug.
 *
 * Background: invoice.payment_failed sets subscriptionStatus/stripeSubscriptionStatus
 * to a failed/unpaid signal and correctly revokes Pro access. But those fields are only
 * ever updated by inbound Stripe webhooks — there is no polling reconciliation. If Stripe
 * never sends a follow-up event (e.g. it leaves the subscription "unpaid" indefinitely
 * instead of canceling it, or a later webhook is missed), the "Payment Failed" label can
 * persist forever even though the account has been Free/no-access for weeks.
 *
 * This test verifies:
 *   1. A FRESH payment failure still shows "Payment Failed" (label unchanged).
 *   2. A STALE payment failure (old lastFailedPaymentAt, no pending retry, no recovery)
 *      now displays as "Subscription Ended" instead — a pure label fix.
 *   3. Access (membershipHasProAccess) is false in both cases — this fix never grants
 *      or revokes access, only changes what label is shown.
 *   4. Ambiguous records with no lastFailedPaymentAt timestamp are NEVER treated as
 *      stale (conservative default — keep showing the alert rather than guess).
 *   5. The read-only audit script (scripts/audit-billing-access-enforcement.js) flags
 *      the stale case with `stale_payment_failed_label` and does not flag the fresh or
 *      ambiguous cases.
 *
 * Run: node scripts/test-stale-payment-failed-label.js
 */
"use strict";

const membership = require("./membership-access.js");
const { auditMembershipUsers } = require("./audit-billing-access-enforcement.js");

let failures = 0;
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL: ${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

const NOW = Date.parse("2026-07-23T00:00:00.000Z");
const days = (n) => n * 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

// 1) Fresh failure: failed 2 days ago, Stripe still scheduled to retry in 3 days.
const freshFailedUser = {
  email: "fresh-failed@example.com",
  plan: "Free",
  subscriptionStatus: "Payment Failed — Access Locked",
  stripeSubscriptionStatus: "unpaid",
  stripeSubscriptionId: "sub_fresh",
  lastFailedPaymentAt: iso(NOW - days(2)),
  nextPaymentRetryAt: iso(NOW + days(3)),
};

// 2) Stale failure: failed 40 days ago, no more retries scheduled, never recovered.
// This is the exact pattern reported for the two "inactive ~4 weeks" users.
const staleFailedUser = {
  email: "stale-failed@example.com",
  plan: "Free",
  subscriptionStatus: "Payment Failed — Access Locked",
  stripeSubscriptionStatus: "unpaid",
  stripeSubscriptionId: "sub_stale",
  previousPlan: "Pro",
  lastFailedPaymentAt: iso(NOW - days(40)),
  nextPaymentRetryAt: "",
};

// 3) Ambiguous: unpaid signal but no lastFailedPaymentAt timestamp at all (e.g. older
// data, manual import). Must NOT be treated as stale — conservative default.
const ambiguousUnpaidUser = {
  email: "ambiguous-unpaid@example.com",
  plan: "Free",
  subscriptionStatus: "Payment Failed — Access Locked",
  stripeSubscriptionStatus: "unpaid",
  stripeSubscriptionId: "sub_ambiguous",
};

// 4) Recovered after failure: failed 40 days ago but paid successfully since, and the
// live status fields were updated accordingly — should already read as Active, not
// via the staleness path at all.
const recoveredUser = {
  email: "recovered@example.com",
  plan: "Pro",
  subscriptionStatus: "Pro Monthly Subscription Active",
  stripeSubscriptionStatus: "active",
  stripeSubscriptionId: "sub_recovered",
  lastFailedPaymentAt: iso(NOW - days(40)),
  lastSuccessfulPaymentAt: iso(NOW - days(10)),
  currentPeriodEnd: iso(NOW + days(20)),
};

console.log("--- Direct membership-access.js checks ---");

assertEqual(membership.membershipPaymentFailureIsStale(freshFailedUser, NOW), false, "fresh failure is not stale");
assertEqual(membership.membershipPaymentFailureIsStale(staleFailedUser, NOW), true, "40-day-old failure with no pending retry is stale");
assertEqual(membership.membershipPaymentFailureIsStale(ambiguousUnpaidUser, NOW), false, "missing lastFailedPaymentAt is never treated as stale");
assertEqual(membership.membershipPaymentFailureIsStale(recoveredUser, NOW), false, "recovered account is not stale (status is Active already)");

assertEqual(membership.membershipStatusDisplay(freshFailedUser, NOW), "Payment Failed", "fresh failure still shows Payment Failed");
assertEqual(membership.membershipStatusDisplay(staleFailedUser, NOW), "Subscription Ended", "stale failure now shows Subscription Ended, not Payment Failed");
assertEqual(membership.membershipStatusDisplay(ambiguousUnpaidUser, NOW), "Payment Failed", "ambiguous unpaid (no timestamp) still shows Payment Failed");

assertEqual(membership.membershipHasProAccess(freshFailedUser, NOW), false, "fresh failure has no Pro access");
assertEqual(membership.membershipHasProAccess(staleFailedUser, NOW), false, "stale failure STILL has no Pro access (this fix never grants access)");
assertEqual(membership.membershipHasProAccess(ambiguousUnpaidUser, NOW), false, "ambiguous unpaid has no Pro access");

assertEqual(membership.membershipBillingStatusKey(freshFailedUser, NOW), "payment_failed", "fresh failure billing key is payment_failed");
assertEqual(membership.membershipBillingStatusKey(staleFailedUser, NOW), "ended", "stale failure billing key becomes ended (Free/Ended bucket, not an alert)");

const staleProductStatus = membership.membershipProductStatus(staleFailedUser, NOW);
assertEqual(staleProductStatus.key, "inactive", "stale failure product-status key is inactive, not payment_failed");
assertEqual(staleProductStatus.banner, "access_lost", "stale failure banner is access_lost, not payment_failed (no more 'update payment' nag)");
assertEqual(staleProductStatus.hasProAccess, false, "stale failure product-status still reports no Pro access");

console.log("\n--- Read-only audit script (scripts/audit-billing-access-enforcement.js) ---");

const report = auditMembershipUsers(
  [freshFailedUser, staleFailedUser, ambiguousUnpaidUser, recoveredUser],
  { nowMs: NOW, source: "in-memory-test-fixture" },
);

assertEqual(report.readOnly, true, "audit report self-reports as read-only");

const mismatchCodesByEmail = {};
for (const m of report.mismatches) {
  mismatchCodesByEmail[m.email] = mismatchCodesByEmail[m.email] || [];
  mismatchCodesByEmail[m.email].push(m.code);
}

assertEqual(
  (mismatchCodesByEmail["stale-failed@example.com"] || []).includes("stale_payment_failed_label"),
  true,
  "audit flags the stale user with stale_payment_failed_label",
);
assertEqual(
  (mismatchCodesByEmail["fresh-failed@example.com"] || []).includes("stale_payment_failed_label"),
  false,
  "audit does NOT flag the fresh failure",
);
assertEqual(
  (mismatchCodesByEmail["ambiguous-unpaid@example.com"] || []).includes("stale_payment_failed_label"),
  false,
  "audit does NOT flag the ambiguous (no-timestamp) unpaid user",
);
assertEqual(
  (mismatchCodesByEmail["recovered@example.com"] || []).includes("stale_payment_failed_label"),
  false,
  "audit does NOT flag the recovered user",
);

const staleRow = report.users.find((u) => u.email === "stale-failed@example.com");
assertEqual(staleRow.classification, "Canceled Free", "stale failure now classifies as Canceled Free (matches Subscription Ended / Free access), not Past Due");
const freshRow = report.users.find((u) => u.email === "fresh-failed@example.com");
assertEqual(freshRow.classification, "Past Due", "fresh failure still classifies as Past Due");

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
