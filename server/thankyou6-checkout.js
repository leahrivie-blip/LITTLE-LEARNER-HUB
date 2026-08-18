/**
 * Isolated THANKYOU6 checkout helpers.
 * Does not replace Stripe checkout, price maps, webhooks, or portal logic.
 *
 * Campaign checkout uses the existing Early User $13.99 price
 * (STRIPE_PRICE_EARLY_USER_MONTHLY) so Stripe's ONCE coupon can make
 * the first invoice $7.99 and later cycles $13.99. Regular Pro Monthly
 * ($19.99 / STRIPE_PRICE_PRO_MONTHLY) is never selected for this campaign.
 */

const CAMPAIGN_ID = "FREE_USER_THANKYOU6_AUG2026";
const CHECKOUT_PLAN = "early_user";
const CHECKOUT_PRICE_ENV = "STRIPE_PRICE_EARLY_USER_MONTHLY";
const EXCLUDED_PRICE_ENV = "STRIPE_PRICE_PRO_MONTHLY";

function normalizeCampaignId(value) {
  return String(value || "").trim();
}

function isThankYou6CampaignRequest(body = {}) {
  return normalizeCampaignId(body.campaign || body.campaignId) === CAMPAIGN_ID;
}

/**
 * Preserve Early User ($13.99) for this campaign even when the public
 * EARLY_USER_PRICING_ENABLED flag is off. All other early_user requests
 * still remap to monthly ($19.99) when that flag is off.
 */
function resolveCheckoutPlanKey(requestedPlan, options = {}) {
  const plan = String(requestedPlan || "monthly");
  const earlyUserAvailable = options.earlyUserAvailable === true;
  const body = options.body || {};
  if (plan === "early_user" && !earlyUserAvailable && !isThankYou6CampaignRequest(body)) {
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
  EXCLUDED_PRICE_ENV,
  isThankYou6CampaignRequest,
  resolveCheckoutPlanKey,
  applyPromotionCodeCheckoutParams,
  applyThankYou6CheckoutMetadata,
  checkoutCtaPath,
  checkoutCtaUrl,
};
