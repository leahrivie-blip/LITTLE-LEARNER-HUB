/**
 * Isolated THANKYOU6 checkout helpers.
 * Does not replace Stripe checkout, price maps, webhooks, or portal logic.
 *
 * Campaign checkout uses Pro Monthly ($19.99 / STRIPE_PRICE_PRO_MONTHLY).
 * Early User ($13.99) acquisition is retired for all new customers, including
 * THANKYOU6. Stripe promotion codes (e.g. THANKYOU6) remain allowed for a
 * first-month discount on Pro Monthly. Existing Early User subscribers are
 * recognized via price-ID / billingOffer mapping elsewhere — not here.
 */

const CAMPAIGN_ID = "FREE_USER_THANKYOU6_AUG2026";
const CHECKOUT_PLAN = "monthly";
const CHECKOUT_PRICE_ENV = "STRIPE_PRICE_PRO_MONTHLY";
/** @deprecated Retired Early User acquisition price — kept for historical docs only. */
const RETIRED_EARLY_USER_PRICE_ENV = "STRIPE_PRICE_EARLY_USER_MONTHLY";

function normalizeCampaignId(value) {
  return String(value || "").trim();
}

function isThankYou6CampaignRequest(body = {}) {
  return normalizeCampaignId(body.campaign || body.campaignId) === CAMPAIGN_ID;
}

/**
 * Early User ($13.99) is closed for NEW acquisition, including THANKYOU6.
 * Any early_user checkout request remaps to monthly ($19.99) when Early User
 * acquisition is unavailable. Existing Early User subscribers are unaffected.
 *
 * @param {string} requestedPlan
 * @param {{ earlyUserAvailable?: boolean, body?: Record<string, unknown> }} [options]
 * @returns {string}
 */
function resolveCheckoutPlanKey(requestedPlan, options = {}) {
  const plan = String(requestedPlan || "monthly");
  const earlyUserAvailable = options.earlyUserAvailable === true;
  if (plan === "early_user" && !earlyUserAvailable) {
    return "monthly";
  }
  return plan;
}

function applyPromotionCodeCheckoutParams(sessionParams) {
  if (!sessionParams || typeof sessionParams !== "object") return sessionParams;
  sessionParams.allow_promotion_codes = "true";
  return sessionParams;
}

function applyThankYou6CheckoutMetadata(sessionParams, body = {}) {
  if (!sessionParams || typeof sessionParams !== "object") return sessionParams;
  if (!isThankYou6CampaignRequest(body)) return sessionParams;
  sessionParams["metadata[campaign]"] = CAMPAIGN_ID;
  sessionParams["subscription_data[metadata][campaign]"] = CAMPAIGN_ID;
  return sessionParams;
}

function checkoutCtaPath() {
  return `/?view=upgrade&plan=${encodeURIComponent(CHECKOUT_PLAN)}&campaign=${encodeURIComponent(CAMPAIGN_ID)}`;
}

function checkoutCtaUrl(siteUrl) {
  const base = String(siteUrl || "").trim().replace(/\/$/, "") || "https://littlelearnershubbyleah.com";
  return `${base}${checkoutCtaPath()}`;
}

module.exports = {
  CAMPAIGN_ID,
  CHECKOUT_PLAN,
  CHECKOUT_PRICE_ENV,
  RETIRED_EARLY_USER_PRICE_ENV,
  /** @deprecated Use RETIRED_EARLY_USER_PRICE_ENV — no longer selected for checkout. */
  EXCLUDED_PRICE_ENV: RETIRED_EARLY_USER_PRICE_ENV,
  isThankYou6CampaignRequest,
  resolveCheckoutPlanKey,
  applyPromotionCodeCheckoutParams,
  applyThankYou6CheckoutMetadata,
  checkoutCtaPath,
  checkoutCtaUrl,
};
