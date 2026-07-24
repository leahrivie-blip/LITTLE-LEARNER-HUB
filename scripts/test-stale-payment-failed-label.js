#!/usr/bin/env node
/**
 * Regression test for the "Payment Failed" admin-dashboard label investigation.
 *
 * Background: invoice.payment_failed sets subscriptionStatus/stripeSubscriptionStatus to
 * a failed/unpaid signal and correctly revokes Pro access. But those fields are only ever
 * updated by inbound Stripe webhooks — there is no polling reconciliation. If Stripe never
 * sends a follow-up event (e.g. it leaves the subscription "unpaid" indefinitely instead
 * of canceling it, or a later webhook is missed), the "Payment Failed" label can persist
 * forever even though the account has been Free/no-access for weeks.
 *
 * IMPORTANT POLICY UNDER TEST: elapsed time alone is NEVER proof that a subscription was
 * canceled or ended. This suite verifies the app never auto-labels a stale failure as
 * "Subscription Ended"/"canceled" — it only flags it as PAYMENT_FAILURE_NEEDS_REVIEW_LABEL
 * for a human to verify against Stripe. Only a verified Stripe event (a real webhook, e.g.
 * customer.subscription.deleted / updated to "canceled") may ever produce "Subscription
 * Ended". Access is never affected by any of this — it stays denied for any failed/unpaid
 * signal regardless of staleness, exactly as before.
 *
 * Scenarios covered:
 *   1. Fresh payment failure (open unpaid invoice, retry still scheduled) — label unchanged.
 *   2. Open unpaid invoice explicitly mid-retry-window — same as (1), named explicitly.
 *   3. Historical/stale payment failure (40 days old, no retry scheduled) — new neutral
 *      "needs review" label, NEVER "Subscription Ended".
 *   4. A REAL canceled subscription (set by an actual customer.subscription.deleted-style
 *      webhook, not by elapsed time) — legitimately shows "Subscription Ended", and the
 *      staleness helper must never touch this path.
 *   5. Successful recovery after a past failure — reads as Active, unaffected by history.
 *   6. Missing lastFailedPaymentAt timestamp (ambiguous data) — never treated as stale;
 *      keeps showing "Payment Failed" rather than guessing.
 *   7. The read-only audit script flags only the stale case with `stale_payment_failed_label`.
 *   8. The read-only Stripe reconciliation comparison function (server/index.js) is
 *      exercised indirectly via its pure building blocks in scripts/membership-access.js
 *      (membershipBillingReviewSnapshot) to confirm the four signals stay separate fields.
 *   9. THE LEADING ROOT-CAUSE CANDIDATE for "Free account showing Payment Failed": a
 *      *verified* Stripe webhook (customer.subscription.updated/deleted reporting status
 *      "unpaid") already concluded subscriptionStatus="Subscription Ended"/"Trial Ended"
 *      (via stripeSubscriptionToMembershipUpdates — the exact function live webhooks and
 *      the Stripe backfill/recovery tool both call). That conclusion is correct and
 *      requires no elapsed time. But stripeSubscriptionStatus is left as the raw "unpaid"
 *      echo from that same event, and — before this fix — the display layer treated that
 *      raw echo as an independent, unconditional "Payment Failed" trigger, resurrecting an
 *      alert for an account that was already correctly downgraded. Verifies the fix, that
 *      access is unaffected, and that the audit script flags this exact pattern.
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
const NEEDS_REVIEW = membership.PAYMENT_FAILURE_NEEDS_REVIEW_LABEL;

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

// 2) Open unpaid invoice, explicitly mid-retry-window (Stripe is actively retrying today).
const openUnpaidInvoiceUser = {
  email: "open-invoice@example.com",
  plan: "Free",
  subscriptionStatus: "Payment Failed — Access Locked",
  stripeSubscriptionStatus: "unpaid",
  stripeSubscriptionId: "sub_open_invoice",
  lastFailedPaymentAt: iso(NOW - days(6)),
  nextPaymentRetryAt: iso(NOW + days(1)),
};

// 3) Historical/stale failure: failed 40 days ago, no more retries scheduled, never
// recovered. This is the exact pattern reported for the two "inactive ~4 weeks" users.
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

// 4) A REAL cancellation, as produced by an actual customer.subscription.deleted (or
// updated-to-canceled) webhook via stripeSubscriptionToMembershipUpdates — i.e. driven by
// a verified Stripe event, not by elapsed time. This must read as "Subscription Ended"
// and must NOT be touched by the staleness/needs-review logic at all.
const reallyCanceledUser = {
  email: "really-canceled@example.com",
  plan: "Free",
  subscriptionStatus: "Subscription Ended",
  stripeSubscriptionStatus: "canceled",
  stripeSubscriptionId: "sub_canceled",
  stripeCustomerId: "cus_canceled",
  subscriptionStartedAt: iso(NOW - days(120)),
  subscriptionEndedAt: iso(NOW - days(50)),
  previousPlan: "Pro",
};

// 5) Recovered after a failure: failed 40 days ago but paid successfully since, and the
// live status fields were updated accordingly — should already read as Active, not via
// the staleness path at all.
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

// 6) Ambiguous: unpaid signal but no lastFailedPaymentAt timestamp at all (e.g. older
// data, manual import). Must NOT be treated as stale — conservative default.
const ambiguousUnpaidUser = {
  email: "ambiguous-unpaid@example.com",
  plan: "Free",
  subscriptionStatus: "Payment Failed — Access Locked",
  stripeSubscriptionStatus: "unpaid",
  stripeSubscriptionId: "sub_ambiguous",
};

console.log("--- 1) Fresh failure (open unpaid invoice, retry pending) ---");
assertEqual(membership.membershipPaymentFailureIsStale(freshFailedUser, NOW), false, "fresh failure is not stale");
assertEqual(membership.membershipStatusDisplay(freshFailedUser, NOW), NEEDS_REVIEW, "fresh failure shows the neutral Billing Review Required label (never Payment Failed)");
assertEqual(membership.membershipHasProAccess(freshFailedUser, NOW), false, "fresh failure has no Pro access");
assertEqual(membership.membershipBillingStatusKey(freshFailedUser, NOW), "payment_failed", "fresh failure billing key is payment_failed");

console.log("\n--- 2) Open unpaid invoice mid-retry-window ---");
assertEqual(membership.membershipPaymentFailureIsStale(openUnpaidInvoiceUser, NOW), false, "open unpaid invoice (retry tomorrow) is not stale");
assertEqual(membership.membershipStatusDisplay(openUnpaidInvoiceUser, NOW), NEEDS_REVIEW, "open unpaid invoice shows the neutral Billing Review Required label (never Payment Failed)");
assertEqual(membership.membershipHasProAccess(openUnpaidInvoiceUser, NOW), false, "open unpaid invoice has no Pro access");

console.log("\n--- 3) Historical/stale failure — must NEVER become Subscription Ended ---");
assertEqual(membership.membershipPaymentFailureIsStale(staleFailedUser, NOW), true, "40-day-old failure with no pending retry is stale");
assertEqual(membership.membershipStatusDisplay(staleFailedUser, NOW), NEEDS_REVIEW, "stale failure shows the neutral needs-review label");
assertEqual(membership.membershipStatusDisplay(staleFailedUser, NOW) !== "Subscription Ended", true, "stale failure is NEVER labeled Subscription Ended");
assertEqual(membership.membershipBillingStatusKey(staleFailedUser, NOW), "needs_billing_review", "stale failure billing key is needs_billing_review (not ended/canceled)");
assertEqual(membership.membershipHasProAccess(staleFailedUser, NOW), false, "stale failure STILL has no Pro access (this never grants access)");
assertEqual(membership.membershipCurrentAccessKey(staleFailedUser, NOW), "past_due", "stale failure current-access key is still past_due (unpaid/past_due always bucket there, fresh or historical)");

const staleProductStatus = membership.membershipProductStatus(staleFailedUser, NOW);
assertEqual(staleProductStatus.key, "needs_billing_review", "stale failure product-status key is needs_billing_review");
assertEqual(staleProductStatus.label, NEEDS_REVIEW, "stale failure product-status label matches the neutral needs-review text");
assertEqual(staleProductStatus.hasProAccess, false, "stale failure product-status still reports no Pro access");
assertEqual(staleProductStatus.banner, null, "stale failure shows no user-facing 'update payment' banner (unverified, so no forced action)");

const staleSnapshot = membership.membershipBillingReviewSnapshot(staleFailedUser, NOW);
assertEqual(staleSnapshot.currentAccess, "past_due", "snapshot keeps current access as its own separate field (still past_due — a billing issue, not simply Free)");
assertEqual(staleSnapshot.stripeSubscriptionStatus, "unpaid", "snapshot keeps raw Stripe status as its own separate field");
assertEqual(staleSnapshot.lastFailedPaymentAt, staleFailedUser.lastFailedPaymentAt, "snapshot keeps last failure date as its own separate field");
assertEqual(staleSnapshot.nextPaymentRetryAt, "", "snapshot keeps next retry date as its own separate field (none scheduled)");
assertEqual(staleSnapshot.needsBillingReview, true, "snapshot flags needsBillingReview for the stale case");

console.log("\n--- 4) A REAL cancellation (verified Stripe event, not elapsed time) ---");
assertEqual(membership.membershipPaymentFailureIsStale(reallyCanceledUser, NOW), false, "a real cancellation is not a 'payment failed' signal at all — staleness never applies");
assertEqual(membership.membershipStatusDisplay(reallyCanceledUser, NOW), "Subscription Ended", "a verified cancellation still legitimately reads as Subscription Ended");
assertEqual(membership.membershipBillingStatusKey(reallyCanceledUser, NOW), "ended", "a verified cancellation still buckets as ended");
assertEqual(membership.membershipHasProAccess(reallyCanceledUser, NOW), false, "a verified cancellation has no Pro access");

console.log("\n--- 5) Recovered after a past failure ---");
assertEqual(membership.membershipPaymentFailureIsStale(recoveredUser, NOW), false, "recovered account is not stale (status is Active already)");
assertEqual(membership.membershipStatusDisplay(recoveredUser, NOW), "Active", "recovered account reads as Active");
assertEqual(membership.membershipHasProAccess(recoveredUser, NOW), true, "recovered account has Pro access");

console.log("\n--- 6) Missing lastFailedPaymentAt (ambiguous) — never treated as stale ---");
assertEqual(membership.membershipPaymentFailureIsStale(ambiguousUnpaidUser, NOW), false, "missing lastFailedPaymentAt is never treated as stale");
assertEqual(membership.membershipStatusDisplay(ambiguousUnpaidUser, NOW), NEEDS_REVIEW, "ambiguous unpaid (no timestamp) still shows Billing Review Required (never Ended)");
assertEqual(membership.membershipHasProAccess(ambiguousUnpaidUser, NOW), false, "ambiguous unpaid has no Pro access");

console.log("\n--- Admin audit buckets stay mutually exclusive and account for the new bucket ---");
const allUsers = [freshFailedUser, openUnpaidInvoiceUser, staleFailedUser, reallyCanceledUser, recoveredUser, ambiguousUnpaidUser];
const buckets = membership.membershipAdminAuditBuckets(allUsers, NOW);
const bucketSum = Object.values(buckets).reduce((sum, n) => sum + n, 0);
assertEqual(bucketSum, allUsers.length, "admin audit buckets sum to total users (still mutually exclusive)");
assertEqual(buckets.needs_billing_review, 1, "exactly one user lands in the needs_billing_review bucket");

console.log("\n--- 7) Read-only audit script (scripts/audit-billing-access-enforcement.js) ---");

const report = auditMembershipUsers(allUsers, { nowMs: NOW, source: "in-memory-test-fixture" });

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
for (const email of ["fresh-failed@example.com", "open-invoice@example.com", "really-canceled@example.com", "recovered@example.com", "ambiguous-unpaid@example.com"]) {
  assertEqual(
    (mismatchCodesByEmail[email] || []).includes("stale_payment_failed_label"),
    false,
    `audit does NOT flag ${email} with stale_payment_failed_label`,
  );
}

const staleRow = report.users.find((u) => u.email === "stale-failed@example.com");
assertEqual(staleRow.membershipStatusDisplay, NEEDS_REVIEW, "audit row for the stale user shows the neutral needs-review status, not Subscription Ended");
const canceledRow = report.users.find((u) => u.email === "really-canceled@example.com");
assertEqual(canceledRow.membershipStatusDisplay, "Subscription Ended", "audit row for the real cancellation still shows Subscription Ended");

console.log("\n--- 9) CONFIRMED MAPPING: unpaid/past_due can never produce Subscription Ended ---");
{
  // Exactly what a REAL customer.subscription.updated webhook produces for a
  // previously-active Pro subscription that Stripe has now marked "unpaid" (dunning
  // exhausted, not configured to auto-cancel). This must NEVER conclude "Subscription
  // Ended" — only eventType:"deleted" or a live status of literally "canceled" may.
  const priorPaidUser = {
    email: "was-paid-now-unpaid@example.com",
    plan: "Pro",
    subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active",
    stripeSubscriptionId: "sub_realpaid",
    stripeCustomerId: "cus_realpaid",
  };
  const webhookUpdates = membership.stripeSubscriptionToMembershipUpdates(
    {
      id: "sub_realpaid",
      customer: "cus_realpaid",
      status: "unpaid",
      current_period_end: Math.floor((NOW - days(1)) / 1000),
      cancel_at_period_end: false,
    },
    priorPaidUser,
    "updated",
  );
  const afterVerifiedWebhook = { ...priorPaidUser, ...webhookUpdates };

  assertEqual(afterVerifiedWebhook.subscriptionStatus, "Billing Review Required — Access Locked", "the webhook mapping itself never concludes Subscription Ended for unpaid — even though the period has elapsed");
  assertEqual(afterVerifiedWebhook.stripeSubscriptionStatus, "unpaid", "the raw stripeSubscriptionStatus is recorded as unpaid");
  assertEqual(afterVerifiedWebhook.plan, "Free", "plan is correctly downgraded to Free by the same verified event");
  assertEqual(membership.membershipHasProAccess(afterVerifiedWebhook, NOW), false, "access is correctly denied");

  assertEqual(membership.membershipStatusDisplay(afterVerifiedWebhook, NOW), NEEDS_REVIEW, "display shows Billing Review Required, never Subscription Ended/Payment Failed");
  assertEqual(membership.membershipBillingStatusKey(afterVerifiedWebhook, NOW), "payment_failed", "billing bucket is payment_failed (fresh billing-review), never ended");
  assertEqual(membership.membershipProductStatus(afterVerifiedWebhook, NOW).key, "payment_failed", "product status key is payment_failed, never inactive/ended");

  // Only a real deletion event may conclude "ended", even for the exact same underlying
  // unpaid status.
  const deletedUpdates = membership.stripeSubscriptionToMembershipUpdates(
    { id: "sub_realpaid", customer: "cus_realpaid", status: "unpaid" },
    priorPaidUser,
    "deleted",
  );
  assertEqual(deletedUpdates.subscriptionStatus, "Subscription Ended", "a verified customer.subscription.deleted event still legitimately concludes Subscription Ended");

  // A live status of literally "canceled" also legitimately concludes "ended" — this is
  // the ONLY other path that may, per the confirmed mapping.
  const canceledUpdates = membership.stripeSubscriptionToMembershipUpdates(
    { id: "sub_realpaid", customer: "cus_realpaid", status: "canceled" },
    priorPaidUser,
    "updated",
  );
  assertEqual(canceledUpdates.subscriptionStatus, "Subscription Ended", "a live status of 'canceled' legitimately concludes Subscription Ended");

  // Same pattern via a failed trial conversion (endedDuringTrial branch) instead of a
  // previously-paid subscription — must resolve to Billing Review Required, never Trial
  // Ended, for an unpaid status.
  const trialUser = {
    email: "trial-failed-now-unpaid@example.com",
    plan: "Free",
    subscriptionStatus: "Pro Monthly Subscription Trialing",
    stripeSubscriptionStatus: "trialing",
    stripeSubscriptionId: "sub_trialfail",
    trialStatus: "In Trial",
  };
  const trialWebhookUpdates = membership.stripeSubscriptionToMembershipUpdates(
    { id: "sub_trialfail", customer: "cus_trialfail", status: "unpaid", current_period_end: Math.floor((NOW - days(1)) / 1000), cancel_at_period_end: false },
    trialUser,
    "updated",
  );
  const afterTrialWebhook = { ...trialUser, ...trialWebhookUpdates };
  assertEqual(afterTrialWebhook.subscriptionStatus, "Billing Review Required — Access Locked", "a failed trial conversion via unpaid status never concludes Trial Ended");
  assertEqual(membership.membershipStatusDisplay(afterTrialWebhook, NOW), NEEDS_REVIEW, "display shows Billing Review Required for the failed trial conversion too");

  // Legacy data audit: a record written before this mapping fix (or edited manually)
  // could still carry an old "...Ended" text alongside a raw unpaid/past_due field. The
  // read-only audit script must still flag that specific combination for manual cleanup —
  // even though today's webhook processing can no longer produce it going forward.
  const legacyAffectedRecord = {
    email: "legacy-unpaid-ended@example.com",
    plan: "Free",
    subscriptionStatus: "Subscription Ended",
    stripeSubscriptionStatus: "unpaid",
    stripeSubscriptionId: "sub_legacy",
    previousPlan: "Pro",
  };
  const echoReport = auditMembershipUsers([afterVerifiedWebhook, afterTrialWebhook, legacyAffectedRecord], { nowMs: NOW, source: "in-memory-test-fixture" });
  const echoMismatchCodes = {};
  for (const m of echoReport.mismatches) {
    echoMismatchCodes[m.email] = echoMismatchCodes[m.email] || [];
    echoMismatchCodes[m.email].push(m.code);
  }
  assertEqual(
    (echoMismatchCodes["legacy-unpaid-ended@example.com"] || []).includes("unpaid_echo_survives_verified_ended_conclusion"),
    true,
    "audit still flags pre-existing legacy records with this pattern, for manual cleanup via reconciliation",
  );
  assertEqual(
    (echoMismatchCodes["was-paid-now-unpaid@example.com"] || []).includes("unpaid_echo_survives_verified_ended_conclusion"),
    false,
    "a freshly-processed unpaid webhook never produces this legacy pattern in the first place",
  );
  assertEqual(
    (echoMismatchCodes["was-paid-now-unpaid@example.com"] || []).includes("stale_payment_failed_label"),
    false,
    "this is NOT the staleness scenario (no lastFailedPaymentAt at all) — must not double-flag as stale_payment_failed_label",
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
