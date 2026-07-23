/**
 * Pure, network-free comparison + reconciliation-preview logic for the admin Stripe
 * billing reconciliation workflow.
 *
 * This module contains NO network calls and NEVER writes anything. server/index.js fetches
 * the current Stripe customer/subscription/invoice via read-only GET requests (see
 * fetchStripeSubscriptionForReconciliation in server/index.js) and passes the raw result
 * here to compare against what's stored locally and compute a *preview* of what would
 * change. Kept separate from the HTTP fetch so this logic can be unit-tested without any
 * network access or Stripe credentials.
 *
 * Nothing in this module decides to write a correction — it only ever produces a report
 * (matches/discrepancies/proposedUpdates/recommendation). Applying a correction is a
 * separate, explicit, admin-confirmed action in server/index.js that reuses
 * `proposedUpdates` verbatim so the applied write is always exactly what was previewed.
 */
"use strict";

const membership = require("./membership-access.js");

// Only these fields are ever proposed/applied by reconciliation — the exact same
// membership fields the trusted live-webhook mapping function produces. This function
// never invents fields, and reconciliation never touches unrelated account data (name,
// business info, usage history, etc.).
const RECONCILIATION_FIELD_ALLOWLIST = [
  "plan",
  "subscriptionCadence",
  "subscriptionStatus",
  "stripeSubscriptionStatus",
  "stripeSubscriptionId",
  "monthlyPrice",
  "foundingMemberActive",
  "foundingMemberHistorical",
  "foundingMember",
  "trialStatus",
  "trialStart",
  "trialEnd",
  "currentPeriodEnd",
  "accessEndsAt",
  "cancelAtPeriodEnd",
  "previousPlan",
  "subscriptionEndedAt",
  "priceLock",
  "lastFailedPaymentAt",
  "nextPaymentRetryAt",
  "lastSuccessfulPaymentAt",
];

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

function stripeInvoiceToSnapshot(invoice) {
  if (!invoice || typeof invoice !== "object") return null;
  return {
    invoiceId: invoice.id || "",
    status: invoice.status || "",
    amountPaid: Number.isFinite(Number(invoice.amount_paid)) ? Number(invoice.amount_paid) : null,
    amountDue: Number.isFinite(Number(invoice.amount_due)) ? Number(invoice.amount_due) : null,
    paid: Boolean(invoice.paid),
    created: invoice.created
      ? new Date(Number(invoice.created) * 1000).toISOString()
      : null,
  };
}

/**
 * True when Stripe currently reports an active/trialing subscription (i.e. the customer
 * is paid up) but the local record does not currently grant Pro access — the "Paid in
 * Stripe but access not restored" pattern this whole workflow exists to catch.
 */
function isCriticalPaidButFree(stripeSnapshot, stored) {
  if (!stripeSnapshot) return false;
  const liveStatus = String(stripeSnapshot.status || "").toLowerCase();
  const stripeIsPaidUp = liveStatus === "active" || liveStatus === "trialing";
  return stripeIsPaidUp && !stored?.hasProAccess;
}

/**
 * Computes the exact local-field changes reconciliation would apply, by running the raw
 * Stripe subscription through the SAME trusted mapping function live webhooks use
 * (membership.stripeSubscriptionToMembershipUpdates) and diffing against the user's
 * current stored values. Only allow-listed membership fields are ever included — nothing
 * else on the account record is touched. Returns `null` proposedUpdates when there is no
 * live subscription to reconcile against (e.g. genuinely not found).
 */
function computeProposedUpdates(user, subscriptionRaw) {
  if (!subscriptionRaw) return { fields: [], before: {}, after: {} };
  const rawUpdates = membership.stripeSubscriptionToMembershipUpdates(subscriptionRaw, user || {}, "updated");
  const fields = [];
  const before = {};
  const after = {};
  for (const key of RECONCILIATION_FIELD_ALLOWLIST) {
    if (!(key in rawUpdates)) continue;
    const currentValue = user?.[key] ?? "";
    const nextValue = rawUpdates[key] ?? "";
    const currentComparable = typeof currentValue === "boolean" ? currentValue : String(currentValue ?? "");
    const nextComparable = typeof nextValue === "boolean" ? nextValue : String(nextValue ?? "");
    if (currentComparable !== nextComparable) {
      fields.push(key);
      before[key] = user?.[key] ?? null;
      after[key] = rawUpdates[key];
    }
  }
  return { fields, before, after };
}

/**
 * Compares what's stored locally for `user` against Stripe data already fetched by the
 * caller (or `null` where not found). Never mutates `user`, never performs I/O.
 * `stripeLookup`:
 *   - subscription: raw Stripe Subscription object, or null
 *   - customerId, lookupMethod, allSubscriptions: as returned by the server-side fetch
 *   - latestInvoice: raw Stripe Invoice object for the subscription's latest invoice, or null
 *   - ambiguousCustomerIds: array of Stripe customer IDs sharing this email, when the
 *     email-search fallback found more than one Stripe customer (reconciliation must never
 *     guess which one is correct in that case)
 */
function compareStoredWithStripe(user, stripeLookup = {}, nowMs = Date.now()) {
  const {
    subscription = null,
    customerId = "",
    lookupMethod = "unknown",
    allSubscriptions = null,
    latestInvoice = null,
    ambiguousCustomerIds = null,
  } = stripeLookup;
  const stored = membership.membershipBillingReviewSnapshot(user, nowMs);
  const stripeSnapshot = stripeSubscriptionToSnapshot(subscription, customerId);
  const invoiceSnapshot = stripeInvoiceToSnapshot(latestInvoice);
  const hasAmbiguousCustomers = Array.isArray(ambiguousCustomerIds) && ambiguousCustomerIds.length > 1;

  const discrepancies = [];
  if (hasAmbiguousCustomers) {
    discrepancies.push(
      `Multiple Stripe customers share this email (${ambiguousCustomerIds.join(", ")}). Reconciliation cannot `
      + `safely guess which one is authoritative — resolve the duplicate customer in Stripe or specify the `
      + `correct customer/subscription ID explicitly before reconciling.`,
    );
  }
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

  const criticalPaidButFree = !hasAmbiguousCustomers && isCriticalPaidButFree(stripeSnapshot, stored);
  if (criticalPaidButFree) {
    discrepancies.push(
      `CRITICAL: Stripe reports an active/trialing subscription (customer has paid) but this account `
      + `currently has no Pro access on the website. Access was not restored by webhook sync.`,
    );
  }

  // Never propose a write when the Stripe-customer match itself is ambiguous — that would
  // require guessing which customer's subscription is authoritative.
  const proposed = hasAmbiguousCustomers
    ? { fields: [], before: {}, after: {} }
    : computeProposedUpdates(user, subscription);

  return {
    email: user?.email || "",
    readOnly: true,
    stored,
    stripe: stripeSnapshot,
    latestInvoice: invoiceSnapshot,
    stripeSubscriptionCountForCustomer: Array.isArray(allSubscriptions) ? allSubscriptions.length : null,
    ambiguousCustomerIds: hasAmbiguousCustomers ? ambiguousCustomerIds : [],
    lookupMethod,
    matches: discrepancies.length === 0 && proposed.fields.length === 0,
    criticalPaidButFree,
    discrepancies,
    proposedUpdates: proposed,
    recommendation: hasAmbiguousCustomers
      ? "Do not reconcile automatically — resolve the duplicate Stripe customer first."
      : discrepancies.length === 0 && proposed.fields.length === 0
        ? "Stored data matches Stripe's current status. No action needed."
        : "Stored data disagrees with Stripe's current status. Review proposedUpdates and, only with "
          + "explicit Platform Admin confirmation, apply the correction via the reconciliation apply "
          + "endpoint — this comparison itself never writes anything.",
  };
}

/** True when there is nothing to change — used to make repeated reconciliation idempotent. */
function isAlreadyReconciled(comparison) {
  return Boolean(comparison?.matches) && !comparison?.ambiguousCustomerIds?.length;
}

module.exports = {
  RECONCILIATION_FIELD_ALLOWLIST,
  stripeSubscriptionToSnapshot,
  stripeInvoiceToSnapshot,
  isCriticalPaidButFree,
  computeProposedUpdates,
  compareStoredWithStripe,
  isAlreadyReconciled,
};
