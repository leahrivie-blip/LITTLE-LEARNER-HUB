#!/usr/bin/env node
/**
 * Unit tests for the read-only Stripe reconciliation comparison logic
 * (scripts/stripe-billing-reconciliation.js). No network calls, no Stripe credentials,
 * no store writes — this only exercises the pure comparison function with synthetic
 * Stripe Subscription objects standing in for what a real read-only GET would return.
 *
 * Run: node scripts/test-stripe-billing-reconciliation.js
 */
"use strict";

const { compareStoredWithStripe } = require("./stripe-billing-reconciliation.js");

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

console.log("--- Stored legacy 'Payment Failed' text vs. an unpaid Stripe subscription that is STILL unpaid ---");
{
  // The raw stripeSubscriptionStatus already agrees ("unpaid" both sides), but the stored
  // subscriptionStatus text is the OLD pre-fix wording ("Payment Failed — Access Locked")
  // rather than the current canonical "Billing Review Required — Access Locked". A fresh
  // re-derivation converges the wording — but per the confirmed mapping, unpaid is NEVER
  // ended/canceled, so the converged conclusion must stay a billing-review label, never
  // "Subscription Ended". This convergence is a safe, explicit, admin-confirmed wording
  // fix, not a time-based inference.
  const user = {
    email: "still-unpaid@example.com",
    subscriptionStatus: "Payment Failed — Access Locked",
    stripeSubscriptionStatus: "unpaid",
    stripeSubscriptionId: "sub_1",
    lastFailedPaymentAt: iso(NOW - days(40)),
    nextPaymentRetryAt: "",
  };
  const stripeSubscription = { id: "sub_1", status: "unpaid", cancel_at_period_end: false, current_period_end: null, canceled_at: null, customer: "cus_1" };
  const result = compareStoredWithStripe(user, { subscription: stripeSubscription, customerId: "cus_1", lookupMethod: "stored_subscription_id" }, NOW);
  assertEqual(result.readOnly, true, "result self-reports read-only");
  assertEqual(result.discrepancies.length, 0, "the raw stripeSubscriptionStatus field itself already agrees (both 'unpaid')");
  assertEqual(result.matches, false, "but the account is not FULLY reconciled — the subscriptionStatus text has not converged yet");
  assertEqual(result.proposedUpdates.fields.includes("subscriptionStatus"), true, "reconciliation proposes converging subscriptionStatus wording to the current canonical text");
  assertEqual(result.proposedUpdates.after.subscriptionStatus, "Billing Review Required — Access Locked", "Stripe is still unpaid — the converged conclusion is Billing Review Required, NEVER Subscription Ended/Canceled");
  assertEqual(result.criticalPaidButFree, false, "still-unpaid is never flagged critical — Stripe has not reported this account as paid");
  assertEqual(result.stored.needsBillingReview, true, "stored snapshot still flags needsBillingReview (unaffected by the proposed convergence)");
}

console.log("\n--- Stripe already canceled the subscription, but local record was never updated (missed webhook) ---");
{
  const user = {
    email: "missed-webhook@example.com",
    subscriptionStatus: "Payment Failed — Access Locked",
    stripeSubscriptionStatus: "unpaid",
    stripeSubscriptionId: "sub_2",
    lastFailedPaymentAt: iso(NOW - days(45)),
    nextPaymentRetryAt: "",
  };
  const stripeSubscription = { id: "sub_2", status: "canceled", cancel_at_period_end: false, current_period_end: null, canceled_at: Math.floor((NOW - days(30)) / 1000), customer: "cus_2" };
  const result = compareStoredWithStripe(user, { subscription: stripeSubscription, customerId: "cus_2", lookupMethod: "stored_subscription_id" }, NOW);
  assertEqual(result.matches, false, "stored unpaid disagrees with Stripe's live canceled status");
  assertEqual(result.discrepancies.length > 0, true, "a discrepancy is reported");
  assertEqual(result.discrepancies[0].includes("unpaid") && result.discrepancies[0].includes("canceled"), true, "discrepancy names both the stored and live status");
  assertEqual(result.stripe.status, "canceled", "stripe snapshot reports the live canceled status");
  assertEqual(typeof result.recommendation === "string" && result.recommendation.length > 0, true, "a recommendation is provided");
  assertEqual(result.recommendation.toLowerCase().includes("review"), true, "recommendation asks for admin review, not an automatic fix");
}

console.log("\n--- No Stripe subscription found at all (deleted customer/subscription) ---");
{
  const user = {
    email: "gone@example.com",
    subscriptionStatus: "Payment Failed — Access Locked",
    stripeSubscriptionStatus: "unpaid",
    stripeSubscriptionId: "sub_gone",
    lastFailedPaymentAt: iso(NOW - days(40)),
  };
  const result = compareStoredWithStripe(user, { subscription: null, customerId: "", lookupMethod: "stored_subscription_id" }, NOW);
  assertEqual(result.stripe, null, "no stripe snapshot when nothing was found");
  assertEqual(result.matches, false, "no-subscription-found is reported as a mismatch, not silently ignored");
  assertEqual(result.discrepancies[0].includes("No Stripe subscription found"), true, "discrepancy explains nothing was found");
}

console.log("\n--- Active subscription matches Stripe's live active status ---");
{
  const activePeriodEndIso = new Date(Math.floor((NOW + days(20)) / 1000) * 1000).toISOString();
  // Every allow-listed field already matches exactly what a fresh re-derivation from this
  // same live subscription would produce — a genuinely fully-synced account, so
  // reconciliation must report matches:true (nothing to change).
  const user = {
    email: "active@example.com",
    plan: "Pro",
    subscriptionCadence: "monthly",
    subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active",
    stripeSubscriptionId: "sub_active",
    monthlyPrice: "$19.99/month",
    foundingMemberActive: false,
    foundingMemberHistorical: false,
    foundingMember: false,
    currentPeriodEnd: activePeriodEndIso,
    accessEndsAt: activePeriodEndIso,
    cancelAtPeriodEnd: false,
  };
  const stripeSubscription = { id: "sub_active", status: "active", cancel_at_period_end: false, current_period_end: Math.floor((NOW + days(20)) / 1000), canceled_at: null, customer: "cus_active" };
  const result = compareStoredWithStripe(user, { subscription: stripeSubscription, customerId: "cus_active", lookupMethod: "stored_subscription_id" }, NOW);
  assertEqual(result.matches, true, "active matches active");
  assertEqual(result.proposedUpdates.fields.length, 0, "a fully-synced account proposes zero field changes");
  assertEqual(result.stored.needsBillingReview, false, "active account is never flagged as needing billing review");
}

console.log("\n--- This module never mutates its inputs ---");
{
  const user = { email: "immutable@example.com", subscriptionStatus: "Payment Failed — Access Locked", stripeSubscriptionStatus: "unpaid" };
  const userSnapshotBefore = JSON.stringify(user);
  compareStoredWithStripe(user, { subscription: null, customerId: "", lookupMethod: "no_stripe_identifiers" }, NOW);
  assertEqual(JSON.stringify(user), userSnapshotBefore, "the input user object is never mutated by the comparison");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
