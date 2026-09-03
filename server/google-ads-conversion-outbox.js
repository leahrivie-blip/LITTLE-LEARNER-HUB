"use strict";

const PAID_SUBSCRIPTION = "paid_subscription";

function googleAdsDeliveryConfigured(env = process.env) {
  return [
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CUSTOMER_ID",
    "GOOGLE_ADS_CLIENT_ID",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
  ].every((key) => Boolean(String(env[key] || "").trim()));
}

function enqueuePaidSubscription(store, invoice) {
  const invoiceId = String(invoice?.id || "").trim();
  const amountPaid = Number(invoice?.amount_paid || 0);
  const currency = String(invoice?.currency || "").trim().toUpperCase();
  if (!invoiceId || amountPaid <= 0 || !/^[A-Z]{3}$/.test(currency)) return null;
  const idempotencyKey = `${PAID_SUBSCRIPTION}:${invoiceId}`;
  store.googleAdsConversionOutbox = Array.isArray(store.googleAdsConversionOutbox)
    ? store.googleAdsConversionOutbox
    : [];
  const existing = store.googleAdsConversionOutbox.find((entry) => entry.idempotencyKey === idempotencyKey);
  if (existing) return { created: false, record: existing };
  const now = new Date().toISOString();
  const record = {
    idempotencyKey,
    conversionType: PAID_SUBSCRIPTION,
    stripeInvoiceId: invoiceId,
    transactionId: invoiceId,
    value: Number((amountPaid / 100).toFixed(2)),
    currency,
    status: "pending",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
    lastError: "",
  };
  store.googleAdsConversionOutbox.push(record);
  return { created: true, record };
}

async function deliverPendingGoogleAdsConversions() {
  // Disabled until the supported Google Ads API client and all credentials are configured.
  return { enabled: googleAdsDeliveryConfigured(), delivered: 0, skipped: true };
}

module.exports = { enqueuePaidSubscription, deliverPendingGoogleAdsConversions, googleAdsDeliveryConfigured };
