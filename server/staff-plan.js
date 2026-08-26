/**
 * Staff Plan billing ($29.99/month total replacement tier).
 *
 * Isolated from seat counting and Pro inheritance. Does not invent Stripe
 * Price IDs and never falls back to founding / monthly / early-user / annual.
 *
 * Founding waiver uses permanent founding identity (numbered cohort), not the
 * live foundingMemberActive billing flag and not display text.
 */
"use strict";

const membershipAccess = require("../scripts/membership-access.js");
const foundingIdentity = require("../scripts/founding-identity.js");

const STAFF_PLAN_KEY = "staff";
const STAFF_PLAN_OFFER = "staff_plan";
const STAFF_PLAN_DISPLAY_NAME = "Staff Plan";
const STAFF_PLAN_AMOUNT = "$29.99/month";
const STAFF_PLAN_AMOUNT_CENTS = 2999;
const STAFF_PLAN_PRICE_ENV = "STRIPE_PRICE_STAFF_MONTHLY";
const STAFF_PLAN_PRICE_ENV_ALIAS = "STAFF_PLAN_PRICE_ID";
const MAX_INCLUDED_STAFF_SEATS = 5;

const STAFF_PLAN_REQUIRED_MESSAGE = "Upgrade to the Staff Plan ($29.99/month) to invite staff. This includes Pro for your account plus access for up to 5 staff members.";
const STAFF_PLAN_PRICE_MISSING_MESSAGE = "Staff Plan checkout is not configured. The Staff Plan Stripe price ID is missing.";
const FOUNDING_KEEPS_PRICING_MESSAGE = "Founding Members keep their existing founding pricing and do not need the Staff Plan.";
const FOUNDING_BILLING_INACTIVE_MESSAGE = "Add Staff is included with your Founding Member plan. Update billing to invite staff.";
const ALREADY_ON_STAFF_PLAN_MESSAGE = "This account already has an active Staff Plan. Manage billing from Settings → Billing & Subscription instead of starting a new checkout.";

function normalizeOffer(value) {
  return String(value || "").trim().toLowerCase();
}

function getStaffPlanPriceId(env = process.env) {
  const primary = String(env?.[STAFF_PLAN_PRICE_ENV] || "").trim();
  if (primary) return primary;
  const alias = String(env?.[STAFF_PLAN_PRICE_ENV_ALIAS] || "").trim();
  if (alias) return alias;
  return "";
}

function isStaffPlanPriceConfigured(env = process.env) {
  return Boolean(getStaffPlanPriceId(env));
}

function staffPlanConfig() {
  return {
    plan: "Pro",
    label: STAFF_PLAN_DISPLAY_NAME,
    cadence: "monthly",
    priceEnv: STAFF_PLAN_PRICE_ENV,
    amount: STAFF_PLAN_AMOUNT,
    priceLock: "",
    offer: STAFF_PLAN_OFFER,
    displayName: STAFF_PLAN_DISPLAY_NAME,
  };
}

/**
 * Staff Plan pricing uses permanent founding identity, not current access.
 * past_due founding members stay founding for tier eligibility.
 */
function isAuthoritativeFoundingMember(user) {
  return foundingIdentity.hasPermanentFoundingIdentity(user);
}

function isStaffPlanOffer(user) {
  return normalizeOffer(user?.billingOffer) === STAFF_PLAN_OFFER;
}

function hasStaffPlanEntitlement(user, nowMs = Date.now()) {
  if (!isStaffPlanOffer(user)) return false;
  return membershipAccess.membershipHasProAccess(user, nowMs) === true;
}

function evaluateStaffPlanInviteAccess({
  owner,
  ownerEmail = "",
  isConfiguredAdminEmail,
} = {}) {
  const email = String(owner?.email || ownerEmail || "").trim().toLowerCase();
  if (typeof isConfiguredAdminEmail === "function" && email && isConfiguredAdminEmail(email) === true) {
    return {
      ok: true,
      reason: "admin",
      code: "",
      message: "",
    };
  }
  if (isAuthoritativeFoundingMember(owner)) {
    if (membershipAccess.membershipHasProAccess(owner) === true) {
      return {
        ok: true,
        reason: "founding",
        code: "",
        message: "",
      };
    }
    return {
      ok: false,
      reason: "founding_billing_inactive",
      code: "founding_billing_inactive",
      message: FOUNDING_BILLING_INACTIVE_MESSAGE,
    };
  }
  if (hasStaffPlanEntitlement(owner)) {
    return {
      ok: true,
      reason: "staff_plan",
      code: "",
      message: "",
    };
  }
  return {
    ok: false,
    reason: "staff_plan_required",
    code: "staff_plan_required",
    message: STAFF_PLAN_REQUIRED_MESSAGE,
  };
}

function staffPlanPublicState({
  owner,
  ownerEmail = "",
  isConfiguredAdminEmail,
  env = process.env,
} = {}) {
  const decision = evaluateStaffPlanInviteAccess({
    owner,
    ownerEmail,
    isConfiguredAdminEmail,
  });
  const foundingMember = isAuthoritativeFoundingMember(owner);
  const foundingEntitlementActive = foundingMember
    && membershipAccess.membershipHasProAccess(owner) === true;
  const admin = decision.reason === "admin";
  const required = !admin && !foundingMember;
  const entitled = hasStaffPlanEntitlement(owner);
  return {
    required,
    foundingMember,
    foundingEntitlementActive,
    hasStaffPlanEntitlement: entitled,
    configured: isStaffPlanPriceConfigured(env),
    amount: STAFF_PLAN_AMOUNT,
    displayName: STAFF_PLAN_DISPLAY_NAME,
    includedSeats: MAX_INCLUDED_STAFF_SEATS,
    canInvite: decision.ok,
    upgradeRequired: required && !entitled,
    code: decision.code || "",
    reason: decision.reason,
    message: decision.ok
      ? ""
      : decision.message,
  };
}

function staffPlanCheckoutBlock({ user, requestedPlan } = {}) {
  if (String(requestedPlan || "").trim().toLowerCase() !== STAFF_PLAN_KEY) {
    return null;
  }
  if (isAuthoritativeFoundingMember(user)) {
    return {
      status: 400,
      payload: {
        error: FOUNDING_KEEPS_PRICING_MESSAGE,
        code: "founding_keeps_pricing",
        foundingMember: true,
      },
    };
  }
  if (hasStaffPlanEntitlement(user)) {
    return {
      status: 409,
      payload: {
        error: ALREADY_ON_STAFF_PLAN_MESSAGE,
        code: "already_subscribed",
        alreadySubscribed: true,
        planDisplay: STAFF_PLAN_DISPLAY_NAME,
      },
    };
  }
  if (!isStaffPlanPriceConfigured()) {
    return {
      status: 400,
      payload: {
        error: STAFF_PLAN_PRICE_MISSING_MESSAGE,
        code: "staff_plan_price_missing",
        configured: false,
      },
    };
  }
  return null;
}

function allowsStaffPlanCheckoutDespiteExistingPro(requestedPlan, user) {
  return String(requestedPlan || "").trim().toLowerCase() === STAFF_PLAN_KEY
    && !isAuthoritativeFoundingMember(user)
    && !hasStaffPlanEntitlement(user);
}

module.exports = {
  STAFF_PLAN_KEY,
  STAFF_PLAN_OFFER,
  STAFF_PLAN_DISPLAY_NAME,
  STAFF_PLAN_AMOUNT,
  STAFF_PLAN_AMOUNT_CENTS,
  STAFF_PLAN_PRICE_ENV,
  STAFF_PLAN_PRICE_ENV_ALIAS,
  MAX_INCLUDED_STAFF_SEATS,
  STAFF_PLAN_REQUIRED_MESSAGE,
  STAFF_PLAN_PRICE_MISSING_MESSAGE,
  FOUNDING_KEEPS_PRICING_MESSAGE,
  FOUNDING_BILLING_INACTIVE_MESSAGE,
  ALREADY_ON_STAFF_PLAN_MESSAGE,
  getStaffPlanPriceId,
  isStaffPlanPriceConfigured,
  staffPlanConfig,
  isAuthoritativeFoundingMember,
  isStaffPlanOffer,
  hasStaffPlanEntitlement,
  evaluateStaffPlanInviteAccess,
  staffPlanPublicState,
  staffPlanCheckoutBlock,
  allowsStaffPlanCheckoutDespiteExistingPro,
};
