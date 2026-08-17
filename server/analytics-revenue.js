/**
 * Revenue line-item collection for Admin analytics.
 * Phase 1: dedupe analytics checkout_success vs billingEvents twins.
 *
 * Identity note: billingEvents and analytics checkout_success do NOT currently
 * share a Stripe invoice / payment_intent / checkout session id. When analytics
 * checkout_success is persisted, recordBillingEvent copies the same createdAt.
 * That exact createdAt + email + checkout_success type is the reliable twin key.
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
      // Reliable twin: recordBillingEvent copies analytics createdAt onto the billing row.
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
