/**
 * Revenue line-item collection for Admin analytics.
 * Phase 1: dedupe analytics checkout_success vs billingEvents twins.
 *
 * =============================================================================
 * INVARIANT (narrow — do not broaden without a stable payment id)
 * =============================================================================
 * Twin identity key: lowercase email + checkout_success type + identical createdAt
 * string equality.
 *
 * Guaranteed ONLY for this synchronous path:
 *   sanitizeAnalyticsEvent(body) → handleAnalyticsEvent
 *     → recordBillingEvent(store, event)
 *       → billing.createdAt = event.createdAt  (same string reference copy)
 *
 * NOT guaranteed for:
 *   - appendBillingEvent(...) which sets createdAt: new Date().toISOString()
 *     independently (Stripe membership assign / cancel helpers)
 *   - Client analytics checkout_success that arrives later with a different ISO
 *     timestamp than an earlier Stripe billing row (missed-dedupe → possible
 *     double-count)
 *   - Postgres TIMESTAMPTZ round-trip of analytics created_at vs JSON store
 *     billingEvents createdAt (string equality can fail if formats diverge)
 *
 * billingEvents and analytics checkout_success do NOT currently share a Stripe
 * invoice / payment_intent / checkout session id. Future fix: persist a stable
 * payment identifier on both sides when available — do not add fuzzy
 * amount+time matching here.
 *
 * Refunds: not safely modelable from current billingEvents (no refund type/id).
 */

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function moneyNumber(value) {
  const amount = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function isCancelBillingType(type) {
  return String(type || "").toLowerCase().includes("cancel");
}

function isFailedBillingType(type) {
  const text = String(type || "").toLowerCase();
  return text.includes("fail") || text.includes("unpaid") || text.includes("incomplete");
}

function isCheckoutSuccessType(type) {
  return String(type || "").toLowerCase().includes("checkout_success");
}

/**
 * Prefer billing ledger rows; add analytics checkout_success only when no twin billing row exists.
 * Twin match requires identical createdAt strings (see file header invariant).
 * @param {object[]} paidEvents analytics events named checkout_success
 * @param {object[]} billingEvents store.billingEvents
 * @returns {object[]}
 */
function collectRevenueItems(paidEvents = [], billingEvents = []) {
  const billing = (Array.isArray(billingEvents) ? billingEvents : []).filter((event) => {
    const type = event?.type || event?.name || "";
    if (isCancelBillingType(type)) return false;
    if (isFailedBillingType(type)) return false;
    return true;
  });

  const result = billing.slice();
  for (const event of Array.isArray(paidEvents) ? paidEvents : []) {
    if (!event || event.name !== "checkout_success") continue;
    const email = normalizeEmail(event.user || event.email || "");
    const createdAt = String(event.createdAt || "");
    const twin = billing.some((be) => {
      if (!isCheckoutSuccessType(be.type || be.name || "")) return false;
      const beEmail = normalizeEmail(be.email || be.user || "");
      if (email && beEmail && beEmail !== email) return false;
      // Exact string match only — mirrors recordBillingEvent copying event.createdAt.
      return createdAt && String(be.createdAt || "") === createdAt;
    });
    if (twin) continue;
    result.push(event);
  }
  return result;
}

function sumRevenueAmount(items = []) {
  return Number(
    (items || [])
      .reduce((total, event) => total + moneyNumber(event.amount || event.detail?.monthlyPrice || event.detail?.amount), 0)
      .toFixed(2),
  );
}

module.exports = {
  collectRevenueItems,
  sumRevenueAmount,
  moneyNumber,
  isCancelBillingType,
  isFailedBillingType,
};
