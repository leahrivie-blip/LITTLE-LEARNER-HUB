/**
 * Pure, network-free comparison logic for the admin Stripe billing reconciliation check.
 *
 * This module contains NO network calls and NEVER writes anything. server/index.js fetches
 * the current Stripe subscription via read-only GET requests (see
 * fetchStripeSubscriptionForReconciliation) and passes the raw result here to compare
 * against what's stored locally. Kept separate from the HTTP fetch so the comparison logic
 * itself can be unit-tested without any network access or Stripe credentials.
 *
 * Output is a report only — matches/discrepancies/recommendation. Nothing here decides to
 * write a correction; that stays a manual/admin action outside this module.
 */
"use strict";

const membership = require("./membership-access.js");

function stripeSubscriptionToSnapshot(subscription, customerId = "") {
  if (!subscription) return null;
  return {
    subscriptionId: subscription.id || "",
    status: subscription.status || "",
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    canceledAt: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    customerId: customerId || subscription.customer || "",
  };
}

/**
 * Compares what's stored locally for `user` against a Stripe subscription object already
 * fetched by the caller (or `null` if none was found). Never mutates `user`, never performs
 * I/O. `stripeLookup.subscription` should be the raw Stripe Subscription object (or null).
 */
function compareStoredWithStripe(user, stripeLookup = {}, nowMs = Date.now()) {
  const { subscription = null, customerId = "", lookupMethod = "unknown", allSubscriptions = null } = stripeLookup;
  const stored = membership.membershipBillingReviewSnapshot(user, nowMs);
  const stripeSnapshot = stripeSubscriptionToSnapshot(subscription, customerId);

  const discrepancies = [];
  if (!stripeSnapshot) {
    discrepancies.push(
      `No Stripe subscription found (lookup: ${lookupMethod}). Locally stored Stripe identifiers `
      + `may be stale, or the subscription/customer was deleted in Stripe.`,
    );
  } else {
    const storedStripeStatus = String(stored.stripeSubscriptionStatus || "").toLowerCase();
    const liveStatus = String(stripeSnapshot.status || "").toLowerCase();
    if (storedStripeStatus !== liveStatus) {
      discrepancies.push(
        `Stored stripeSubscriptionStatus="${stored.stripeSubscriptionStatus || "(none)"}" but Stripe currently `
        + `reports "${stripeSnapshot.status}".`,
      );
    }
  }

  return {
    email: user?.email || "",
    readOnly: true,
    stored,
    stripe: stripeSnapshot,
    stripeSubscriptionCountForCustomer: Array.isArray(allSubscriptions) ? allSubscriptions.length : null,
    lookupMethod,
    matches: discrepancies.length === 0,
    discrepancies,
    recommendation: discrepancies.length === 0
      ? "Stored data matches Stripe's current status. No action needed."
      : "Stored data disagrees with Stripe's current status. An admin should review and, if "
        + "appropriate, apply a verified correction (e.g. the existing Stripe refresh action) — "
        + "this check itself never writes anything.",
  };
}

module.exports = {
  stripeSubscriptionToSnapshot,
  compareStoredWithStripe,
};
