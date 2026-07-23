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

console.log("--- Stored 'needs billing review' still matches an unpaid Stripe subscription ---");
{
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
  assertEqual(result.matches, true, "stored unpaid still matches Stripe's live unpaid status");
  assertEqual(result.discrepancies.length, 0, "no discrepancies when statuses agree");
  assertEqual(result.stored.needsBillingReview, true, "stored snapshot still flags needsBillingReview");
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
  const user = {
    email: "active@example.com",
    subscriptionStatus: "Pro Monthly Subscription Active",
    stripeSubscriptionStatus: "active",
    stripeSubscriptionId: "sub_active",
  };
  const stripeSubscription = { id: "sub_active", status: "active", cancel_at_period_end: false, current_period_end: Math.floor((NOW + days(20)) / 1000), canceled_at: null, customer: "cus_active" };
  const result = compareStoredWithStripe(user, { subscription: stripeSubscription, customerId: "cus_active", lookupMethod: "stored_subscription_id" }, NOW);
  assertEqual(result.matches, true, "active matches active");
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
