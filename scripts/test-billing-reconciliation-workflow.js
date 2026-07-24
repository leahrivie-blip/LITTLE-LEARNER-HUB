#!/usr/bin/env node
/**
 * Unit tests for the read-only-preview / admin-confirmed-apply Stripe billing
 * reconciliation workflow (scripts/stripe-billing-reconciliation.js).
 *
 * No network calls, no Stripe credentials, no store writes — these exercise the pure
 * comparison/preview logic directly with synthetic Stripe objects standing in for what a
 * real read-only GET would return. Server-level integration (auth, confirm-gating, webhook
 * ordering/duplicate/unmatched handling against a real spawned server) is covered by
 * scripts/test-billing-membership-qa.js (sections 9c-9h).
 *
 * Scenarios covered here:
 *   1. Failed payment followed by a successful payment — access is restored, and the
 *      comparison after "catching up" reports matches:true (nothing left to reconcile).
 *   2. Active paid Stripe subscription with Free website access (the exact "Paid in
 *      Stripe but access not restored" pattern) — flagged as criticalPaidButFree, with a
 *      clean before/after proposedUpdates diff.
 *   3. Two Stripe customers sharing the same email — reconciliation must flag ambiguity
 *      and propose ZERO field changes rather than guessing which customer is authoritative.
 *   4. Reconciliation preview never mutates the input user object.
 *   5. Reconciliation "apply" idempotency: after simulating an apply (writing
 *      proposedUpdates.after onto the user), re-comparing against the SAME Stripe data
 *      reports matches:true / isAlreadyReconciled:true — running it again would no-op.
 *   6. proposedUpdates only ever contains allow-listed membership fields — never arbitrary
 *      account data (name, business info, usage, etc.).
 *   7. No Stripe subscription found at all still produces a safe, non-crashing report.
 *
 * Run: node scripts/test-billing-reconciliation-workflow.js
 */
"use strict";

const {
  compareStoredWithStripe,
  computeProposedUpdates,
  isCriticalPaidButFree,
  isAlreadyReconciled,
  RECONCILIATION_FIELD_ALLOWLIST,
} = require("./stripe-billing-reconciliation.js");

let failures = 0;
function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1;
    console.error(`FAIL: ${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok: ${message}`);
  }
}
function assertTrue(condition, message) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

const NOW = Date.parse("2026-07-23T00:00:00.000Z");
const days = (n) => n * 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

console.log("--- 1) Failed payment followed by a successful payment ---");
{
  const user = {
    email: "recovered-after-failure@example.com",
    plan: "Free",
    subscriptionStatus: "Payment Failed — Access Locked",
    stripeSubscriptionStatus: "unpaid",
    stripeSubscriptionId: "sub_recover",
    stripeCustomerId: "cus_recover",
    lastFailedPaymentAt: iso(NOW - days(5)),
  };
  // The customer fixed their card; Stripe now reports the subscription active again.
  const liveSub = {
    id: "sub_recover",
    customer: "cus_recover",
    status: "active",
    current_period_end: Math.floor((NOW + days(25)) / 1000),
    cancel_at_period_end: false,
  };
  const invoice = { id: "in_recover", status: "paid", paid: true, amount_paid: 1999, amount_due: 0, created: Math.floor((NOW - days(1)) / 1000) };

  const before = compareStoredWithStripe(user, { subscription: liveSub, customerId: "cus_recover", lookupMethod: "stored_subscription_id", latestInvoice: invoice }, NOW);
  assertTrue(!before.matches, "before reconciling, stored data disagrees with Stripe (still shows failed/unpaid)");
  assertTrue(before.proposedUpdates.fields.includes("plan"), "proposedUpdates includes plan (Free -> Pro)");
  assertEqual(before.proposedUpdates.after.plan, "Pro", "proposed plan is Pro");
  assertEqual(before.proposedUpdates.after.stripeSubscriptionStatus, "active", "proposed stripeSubscriptionStatus is active");
  assertEqual(before.latestInvoice.paid, true, "latest invoice snapshot reports paid:true");

  // Simulate applying the proposed updates (what handleAdminBillingReconciliationApply
  // does server-side after admin confirmation).
  const reconciledUser = { ...user, ...before.proposedUpdates.after };
  const after = compareStoredWithStripe(reconciledUser, { subscription: liveSub, customerId: "cus_recover", lookupMethod: "stored_subscription_id", latestInvoice: invoice }, NOW);
  assertTrue(after.matches, "after applying, stored data matches Stripe — nothing left to reconcile");
  assertTrue(!after.criticalPaidButFree, "after applying, no longer flagged as paid-but-free");
}

console.log("\n--- 2) Active paid Stripe subscription with Free website access (critical) ---");
{
  const user = {
    email: "paid-but-free@example.com",
    plan: "Free",
    subscriptionStatus: "Subscription Ended",
    stripeSubscriptionStatus: "unpaid",
    stripeSubscriptionId: "sub_paidfree",
    stripeCustomerId: "cus_paidfree",
  };
  const liveSub = { id: "sub_paidfree", customer: "cus_paidfree", status: "active", current_period_end: Math.floor((NOW + days(10)) / 1000), cancel_at_period_end: false };
  const invoice = { id: "in_paidfree", status: "paid", paid: true, amount_paid: 999, amount_due: 0, created: Math.floor((NOW - days(2)) / 1000) };

  const comparison = compareStoredWithStripe(user, { subscription: liveSub, customerId: "cus_paidfree", lookupMethod: "stored_subscription_id", latestInvoice: invoice }, NOW);
  assertTrue(comparison.criticalPaidButFree, "flagged criticalPaidButFree: Stripe active + invoice paid, local access is Free");
  assertTrue(comparison.discrepancies.some((d) => d.includes("CRITICAL")), "discrepancies include an explicit CRITICAL entry");
  assertTrue(comparison.proposedUpdates.fields.length > 0, "a concrete set of field changes is proposed");
  assertEqual(isCriticalPaidButFree(comparison.stripe, comparison.stored), true, "isCriticalPaidButFree() helper agrees directly");
}

console.log("\n--- 3) Two Stripe customers share the same email — must not guess ---");
{
  const user = {
    email: "duplicate-customer@example.com",
    plan: "Free",
    subscriptionStatus: "No paid subscription",
  };
  const comparison = compareStoredWithStripe(user, {
    subscription: null,
    lookupMethod: "email_search_ambiguous",
    ambiguousCustomerIds: ["cus_dup_1", "cus_dup_2"],
  }, NOW);
  assertTrue(!comparison.matches, "ambiguous case is never reported as a clean match");
  assertEqual(comparison.ambiguousCustomerIds, ["cus_dup_1", "cus_dup_2"], "both ambiguous customer ids are surfaced");
  assertEqual(comparison.proposedUpdates.fields, [], "zero field changes are proposed when the customer match is ambiguous");
  assertTrue(!comparison.criticalPaidButFree, "ambiguous case is never auto-flagged critical (would require guessing which customer is authoritative)");
  assertTrue(comparison.recommendation.toLowerCase().includes("duplicate"), "recommendation calls out the duplicate customer explicitly");
}

console.log("\n--- 4) Preview never mutates the input user object ---");
{
  const user = { email: "immutable-preview@example.com", plan: "Free", subscriptionStatus: "Payment Failed — Access Locked", stripeSubscriptionStatus: "unpaid" };
  const snapshotBefore = JSON.stringify(user);
  compareStoredWithStripe(user, { subscription: { id: "sub_x", customer: "cus_x", status: "active" }, lookupMethod: "stored_subscription_id" }, NOW);
  assertEqual(JSON.stringify(user), snapshotBefore, "the input user object is byte-for-byte unchanged after building a preview");
}

console.log("\n--- 5) Idempotency: re-running after a simulated apply is a safe no-op ---");
{
  const user = {
    email: "repeat-safety@example.com",
    plan: "Free",
    subscriptionStatus: "Payment Failed — Access Locked",
    stripeSubscriptionStatus: "unpaid",
    stripeSubscriptionId: "sub_repeat",
    stripeCustomerId: "cus_repeat",
  };
  const liveSub = { id: "sub_repeat", customer: "cus_repeat", status: "active", current_period_end: Math.floor((NOW + days(15)) / 1000), cancel_at_period_end: false };
  const lookup = { subscription: liveSub, customerId: "cus_repeat", lookupMethod: "stored_subscription_id" };

  const firstRun = compareStoredWithStripe(user, lookup, NOW);
  assertTrue(!isAlreadyReconciled(firstRun), "first comparison is not yet reconciled (real changes pending)");
  const reconciledUser = { ...user, ...firstRun.proposedUpdates.after };

  const secondRun = compareStoredWithStripe(reconciledUser, lookup, NOW);
  assertTrue(isAlreadyReconciled(secondRun), "second comparison (after applying) reports already reconciled");
  assertEqual(secondRun.proposedUpdates.fields, [], "second comparison proposes zero further changes");

  // A THIRD run against the identical already-reconciled state must still be a no-op —
  // repeated apply attempts converge, they never duplicate or drift.
  const thirdRun = compareStoredWithStripe(reconciledUser, lookup, NOW);
  assertEqual(thirdRun.matches, secondRun.matches, "a third run is identical to the second — stable, no duplication");
}

console.log("\n--- 6) proposedUpdates only ever touches allow-listed membership fields ---");
{
  const user = {
    email: "allowlist-check@example.com",
    plan: "Free",
    subscriptionStatus: "Payment Failed — Access Locked",
    stripeSubscriptionStatus: "unpaid",
    stripeSubscriptionId: "sub_allow",
    // Non-billing fields that must never be touched by reconciliation.
    businessName: "Sunny Days Daycare",
    firstName: "Alex",
    usage: { lessonPlansViewed: 42 },
  };
  const liveSub = { id: "sub_allow", customer: "cus_allow", status: "active", current_period_end: Math.floor((NOW + days(10)) / 1000), cancel_at_period_end: false };
  const { fields } = computeProposedUpdates(user, liveSub);
  assertTrue(fields.length > 0, "some fields are proposed");
  const disallowed = fields.filter((f) => !RECONCILIATION_FIELD_ALLOWLIST.includes(f));
  assertEqual(disallowed, [], "every proposed field is on the membership allow-list (never business/personal/usage data)");
}

console.log("\n--- 7) No Stripe subscription found at all — safe, non-crashing report ---");
{
  const user = { email: "nothing-found@example.com", plan: "Free", subscriptionStatus: "No paid subscription", stripeSubscriptionId: "sub_gone" };
  const comparison = compareStoredWithStripe(user, { subscription: null, lookupMethod: "stored_subscription_id" }, NOW);
  assertTrue(!comparison.matches, "no-subscription-found is reported as a discrepancy, not silently ignored");
  assertEqual(comparison.stripe, null, "stripe snapshot is null when nothing was found");
  assertEqual(comparison.proposedUpdates.fields, [], "no field changes are proposed when there is no live subscription to reconcile against");
  assertTrue(!comparison.criticalPaidButFree, "not flagged critical — there's no evidence Stripe shows this account as paid");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
