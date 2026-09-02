/**
 * Public Early User Special ($13.99/month) expiration.
 * Single source of truth for display + earlyUserPricingAvailable() gating.
 * Does not change Stripe price IDs or checkout handlers — only whether
 * the offer is considered currently available.
 *
 * Ends end-of-day August 25, 2026 Central Daylight Time
 * (same instant as THANKYOU6: 2026-08-26T04:59:59.000Z).
 */
"use strict";

const EARLY_USER_OFFER_EXPIRES_LABEL = "August 25";
const EARLY_USER_OFFER_EXPIRES_FULL_LABEL = "August 25, 2026";
const EARLY_USER_OFFER_EXPIRES_AT_MS = Date.parse("2026-08-26T04:59:59.000Z");

function earlyUserOfferStillActive(nowMs = Date.now()) {
  return Number.isFinite(EARLY_USER_OFFER_EXPIRES_AT_MS) && Number(nowMs) <= EARLY_USER_OFFER_EXPIRES_AT_MS;
}

function earlyUserPricingFlagEnabled() {
  return ["1", "true", "yes", "on"].includes(
    String(process.env.EARLY_USER_PRICING_ENABLED || "false").trim().toLowerCase(),
  );
}

/** Public promo surfaces (homepage shell, /pricing) — flag + date, no Stripe price required. */
function earlyUserPublicPromoActive(nowMs = Date.now()) {
  return earlyUserPricingFlagEnabled() && earlyUserOfferStillActive(nowMs);
}

module.exports = {
  EARLY_USER_OFFER_EXPIRES_LABEL,
  EARLY_USER_OFFER_EXPIRES_FULL_LABEL,
  EARLY_USER_OFFER_EXPIRES_AT_MS,
  earlyUserOfferStillActive,
  earlyUserPricingFlagEnabled,
  earlyUserPublicPromoActive,
};
