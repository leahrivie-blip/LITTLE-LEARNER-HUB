/**
 * Staff Plan start / replacement (isolated from Checkout session creation).
 *
 * Eligible Monthly Pro and Early User subscriptions are updated in place.
 * Annual, founding, existing Staff, and ambiguous Stripe customers are blocked.
 * Never creates a second subscription for an existing paid subscriber.
 */
"use strict";

const membershipAccess = require("../scripts/membership-access.js");
const staffPlan = require("./staff-plan.js");
const staffBetaAccess = require("../scripts/staff-beta-access.js");

const UPGRADE_LOCK_MS = 2 * 60 * 1000;
const HOLDING_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);
const REPLACEABLE_STATUSES = new Set(["active", "trialing"]);
const REPLACEABLE_PLANS = new Set(["monthly", "early_user"]);

const ANNUAL_STAFF_PLAN_BLOCKED_MESSAGE = "Staff Plan is monthly-only right now. Your annual Pro subscription cannot be switched automatically. Keep your annual plan, or contact support if you want this reviewed later.";
const STAFF_BILLING_RECOVERY_MESSAGE = "This account already has a Staff Plan that needs a payment update. Use Billing & Subscription to update the card. Do not start a new Staff Plan checkout.";
const ALREADY_STAFF_MESSAGE = staffPlan.ALREADY_ON_STAFF_PLAN_MESSAGE;
const UPGRADE_IN_PROGRESS_MESSAGE = "A Staff Plan upgrade is already in progress for this account. Wait a moment, then refresh billing instead of starting another checkout.";
const AMBIGUOUS_CUSTOMER_MESSAGE = "This email is linked to more than one Stripe customer with an active or past-due subscription. Staff Plan was not changed. Owner review is required — customers were not merged.";
const STAFF_BETA_REQUIRED_MESSAGE = "Staff Plan is only available to Add Staff beta accounts.";
const MONTHLY_SOURCE_RECOVERY_MESSAGE = "Update the payment method on the current subscription before switching to Staff Plan.";

const upgradeLocks = new Map();

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function nowMs() {
  return Date.now();
}

function subscriptionStatus(subscription) {
  return String(subscription?.status || "").trim().toLowerCase();
}

function firstSubscriptionItem(subscription) {
  const items = subscription?.items?.data;
  return Array.isArray(items) && items.length ? items[0] : null;
}

function subscriptionPriceId(subscription) {
  const item = firstSubscriptionItem(subscription);
  return normalizeId(item?.price?.id || item?.plan?.id);
}

function subscriptionUnitAmount(subscription) {
  const item = firstSubscriptionItem(subscription);
  const amount = Number(item?.price?.unit_amount ?? item?.plan?.amount);
  return Number.isFinite(amount) ? amount : null;
}

function isHoldingStatus(status) {
  return HOLDING_STATUSES.has(String(status || "").toLowerCase());
}

function isStaffPricedSubscription(subscription, staffPriceId = "") {
  const priceId = subscriptionPriceId(subscription);
  if (staffPriceId && priceId && priceId === staffPriceId) return true;
  const planKey = membershipAccess.planKeyFromStripeSubscription(subscription, {});
  if (planKey === staffPlan.STAFF_PLAN_KEY) return true;
  return subscriptionUnitAmount(subscription) === staffPlan.STAFF_PLAN_AMOUNT_CENTS;
}

function isAnnualSubscription(subscription, user = {}) {
  if (membershipAccess.planKeyFromStripeSubscription(subscription, user) === "annual") return true;
  if (String(user?.subscriptionCadence || "").toLowerCase() === "annual") return true;
  if (String(user?.billingOffer || "").toLowerCase() === "pro_annual") return true;
  return subscriptionUnitAmount(subscription) === 19900;
}

function isReplaceableSourcePlan(subscription, user = {}) {
  const planKey = membershipAccess.planKeyFromStripeSubscription(subscription, user);
  if (REPLACEABLE_PLANS.has(planKey)) return true;
  const amount = subscriptionUnitAmount(subscription);
  return amount === 1999 || amount === 1399;
}

function storedStaffHolding(user) {
  if (!staffPlan.isStaffPlanOffer(user)) return false;
  const status = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  return isHoldingStatus(status) || staffPlan.hasStaffPlanEntitlement(user);
}

function upgradeLockIsActive(user, now = nowMs()) {
  const lockedAt = Date.parse(user?.staffPlanUpgradeLockAt || "");
  if (!Number.isFinite(lockedAt)) return false;
  return (now - lockedAt) < UPGRADE_LOCK_MS;
}

function withEmailLock(email, fn) {
  const key = normalizeEmail(email) || "_none";
  const previous = upgradeLocks.get(key) || Promise.resolve();
  const run = previous.then(() => fn(), () => fn());
  upgradeLocks.set(key, run.then(() => undefined, () => undefined));
  return run;
}

/**
 * Decide Staff Plan start without talking to Stripe.
 * Live Stripe inventory is merged by classifyStaffPlanStartFromInventory.
 */
function classifyStaffPlanStart(input = {}) {
  const user = input.user || {};
  const env = input.env || process.env;
  const staffPriceId = staffPlan.getStaffPlanPriceId(env);
  const email = normalizeEmail(user.email || input.email);
  const canAccessStaffBeta = typeof input.canAccessStaffBeta === "function"
    ? input.canAccessStaffBeta
    : staffBetaAccess.canAccessStaffBeta;
  const isConfiguredAdminEmail = input.isConfiguredAdminEmail;

  if (staffPlan.isAuthoritativeFoundingMember(user)) {
    return {
      action: "block",
      status: 400,
      code: "founding_keeps_pricing",
      mutateStripe: false,
      payload: {
        error: staffPlan.FOUNDING_KEEPS_PRICING_MESSAGE,
        code: "founding_keeps_pricing",
        foundingMember: true,
      },
    };
  }
  if (!staffPriceId) {
    return {
      action: "block",
      status: 400,
      code: "staff_plan_price_missing",
      mutateStripe: false,
      payload: {
        error: staffPlan.STAFF_PLAN_PRICE_MISSING_MESSAGE,
        code: "staff_plan_price_missing",
        configured: false,
      },
    };
  }
  if (email && canAccessStaffBeta(user, { isConfiguredAdminEmail }) !== true) {
    return {
      action: "block",
      status: 403,
      code: "staff_beta_required",
      mutateStripe: false,
      payload: {
        error: STAFF_BETA_REQUIRED_MESSAGE,
        code: "staff_beta_required",
      },
    };
  }
  if (upgradeLockIsActive(user)) {
    return {
      action: "block",
      status: 409,
      code: "staff_plan_upgrade_in_progress",
      mutateStripe: false,
      payload: {
        error: UPGRADE_IN_PROGRESS_MESSAGE,
        code: "staff_plan_upgrade_in_progress",
      },
    };
  }

  const inventory = input.inventory || null;
  if (inventory?.ambiguousCustomer) {
    return {
      action: "block",
      status: 409,
      code: "ambiguous_stripe_customer",
      mutateStripe: false,
      payload: {
        error: AMBIGUOUS_CUSTOMER_MESSAGE,
        code: "ambiguous_stripe_customer",
      },
    };
  }

  const staffSub = inventory?.staffSubscription || null;
  const staffStatus = staffSub ? subscriptionStatus(staffSub) : String(user.stripeSubscriptionStatus || "").toLowerCase();
  if (staffSub || storedStaffHolding(user)) {
    const recovery = ["past_due", "unpaid"].includes(staffStatus)
      || membershipAccess.membershipIsBillingReviewRequired(user);
    return {
      action: "block",
      status: 409,
      code: recovery ? "staff_plan_billing_recovery" : "already_subscribed",
      mutateStripe: false,
      payload: {
        error: recovery ? STAFF_BILLING_RECOVERY_MESSAGE : ALREADY_STAFF_MESSAGE,
        code: recovery ? "staff_plan_billing_recovery" : "already_subscribed",
        alreadySubscribed: true,
        recoverViaPortal: recovery,
        planDisplay: staffPlan.STAFF_PLAN_DISPLAY_NAME,
      },
    };
  }

  const annualSub = inventory?.annualSubscription || null;
  if (annualSub || isAnnualSubscription(null, user)) {
    if (annualSub || isHoldingStatus(user.stripeSubscriptionStatus) || membershipAccess.membershipHasProAccess(user)) {
      return {
        action: "block",
        status: 409,
        code: "annual_staff_plan_blocked",
        mutateStripe: false,
        payload: {
          error: ANNUAL_STAFF_PLAN_BLOCKED_MESSAGE,
          code: "annual_staff_plan_blocked",
        },
      };
    }
  }

  const replaceable = inventory?.replaceableSubscription || null;
  if (replaceable) {
    const status = subscriptionStatus(replaceable);
    if (["past_due", "unpaid"].includes(status)) {
      return {
        action: "block",
        status: 409,
        code: "staff_source_billing_recovery",
        mutateStripe: false,
        payload: {
          error: MONTHLY_SOURCE_RECOVERY_MESSAGE,
          code: "staff_source_billing_recovery",
          recoverViaPortal: true,
        },
      };
    }
    return {
      action: "replace",
      status: 200,
      code: "",
      mutateStripe: true,
      staffPriceId,
      subscription: replaceable,
      customerId: normalizeId(replaceable.customer || inventory.customerId || user.stripeCustomerId),
    };
  }

  if (membershipAccess.membershipHasProAccess(user) && !replaceable) {
    if (String(user.subscriptionCadence || "").toLowerCase() === "annual"
      || String(user.billingOffer || "").toLowerCase() === "pro_annual") {
      return {
        action: "block",
        status: 409,
        code: "annual_staff_plan_blocked",
        mutateStripe: false,
        payload: {
          error: ANNUAL_STAFF_PLAN_BLOCKED_MESSAGE,
          code: "annual_staff_plan_blocked",
        },
      };
    }
    if (String(user.billingOffer || "").toLowerCase() === "early_user"
      || String(user.billingOffer || "").toLowerCase() === "pro_monthly"
      || user.stripeSubscriptionId) {
      return {
        action: "replace",
        status: 200,
        code: "",
        mutateStripe: true,
        staffPriceId,
        subscription: {
          id: user.stripeSubscriptionId,
          customer: user.stripeCustomerId,
          status: user.stripeSubscriptionStatus || "active",
          metadata: { plan: String(user.billingOffer || "").includes("early") ? "early_user" : "monthly" },
          items: {
            data: [{
              id: user.stripeSubscriptionItemId || "si_local",
              price: {
                id: user.stripePriceId || "",
                unit_amount: String(user.billingOffer || "").includes("early") ? 1399 : 1999,
              },
            }],
          },
        },
        customerId: user.stripeCustomerId || "",
        localOnly: !user.stripeSubscriptionId,
      };
    }
  }

  return {
    action: "create_checkout",
    status: 200,
    code: "",
    mutateStripe: false,
    staffPriceId,
  };
}

function summarizeSubscriptions(subscriptions = [], staffPriceId = "") {
  const holding = (subscriptions || []).filter((sub) => isHoldingStatus(subscriptionStatus(sub)));
  return {
    staffSubscription: holding.find((sub) => isStaffPricedSubscription(sub, staffPriceId)) || null,
    annualSubscription: holding.find((sub) => isAnnualSubscription(sub, {})) || null,
    replaceableSubscription: holding.find((sub) => isReplaceableSourcePlan(sub, {})) || null,
    holdingCount: holding.length,
  };
}

/**
 * Inspect Stripe customers for one email. Does not merge customers.
 * Prefers the customer attached to the stored authoritative subscription.
 */
function resolveAuthoritativeCustomer({
  user = {},
  customers = [],
  subscriptionsByCustomer = {},
  staffPriceId = "",
} = {}) {
  const storedCustomerId = normalizeId(user.stripeCustomerId);
  const storedSubId = normalizeId(user.stripeSubscriptionId);
  const billed = [];
  for (const customer of customers || []) {
    const customerId = normalizeId(customer?.id);
    const summary = summarizeSubscriptions(subscriptionsByCustomer[customerId] || [], staffPriceId);
    if (summary.holdingCount > 0) {
      billed.push({ customerId, ...summary });
    }
  }

  if (billed.length > 1) {
    const storedMatch = billed.filter((row) => row.customerId === storedCustomerId);
    if (storedMatch.length !== 1) {
      return { ambiguousCustomer: true, billedCustomerCount: billed.length };
    }
    return {
      ambiguousCustomer: false,
      customerId: storedMatch[0].customerId,
      ...storedMatch[0],
    };
  }

  if (billed.length === 1) {
    return {
      ambiguousCustomer: false,
      customerId: billed[0].customerId,
      ...billed[0],
    };
  }

  if (storedCustomerId) {
    const summary = summarizeSubscriptions(subscriptionsByCustomer[storedCustomerId] || [], staffPriceId);
    if (storedSubId) {
      const exact = (subscriptionsByCustomer[storedCustomerId] || []).find((sub) => normalizeId(sub.id) === storedSubId);
      if (exact && isReplaceableSourcePlan(exact, user) && REPLACEABLE_STATUSES.has(subscriptionStatus(exact))) {
        summary.replaceableSubscription = exact;
      }
    }
    return {
      ambiguousCustomer: false,
      customerId: storedCustomerId,
      ...summary,
    };
  }

  return { ambiguousCustomer: false, customerId: "", staffSubscription: null, annualSubscription: null, replaceableSubscription: null };
}

function simulateReplacedSubscription(subscription, staffPriceId) {
  const previous = firstSubscriptionItem(subscription);
  return {
    ...(subscription || {}),
    id: normalizeId(subscription?.id) || "sub_sim_staff_replaced",
    customer: normalizeId(subscription?.customer) || "cus_sim_staff",
    status: subscriptionStatus(subscription) || "active",
    cancel_at_period_end: false,
    metadata: {
      ...(subscription?.metadata || {}),
      plan: staffPlan.STAFF_PLAN_KEY,
      offer: staffPlan.STAFF_PLAN_OFFER,
      billing_price: staffPlan.STAFF_PLAN_AMOUNT,
    },
    items: {
      data: [{
        id: previous?.id || "si_sim_staff",
        quantity: 1,
        price: {
          id: staffPriceId,
          unit_amount: staffPlan.STAFF_PLAN_AMOUNT_CENTS,
          currency: "usd",
          nickname: "Staff Plan",
          metadata: { offer: staffPlan.STAFF_PLAN_OFFER },
          recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
        },
      }],
    },
  };
}

async function replaceSubscriptionWithStaffPlan({
  subscription,
  staffPriceId,
  stripeRequest,
  stripeGet,
  simulation = false,
} = {}) {
  const subId = normalizeId(subscription?.id);
  const item = firstSubscriptionItem(subscription);
  const itemId = normalizeId(item?.id);
  if (!subId) {
    const error = new Error("Existing subscription is missing an id.");
    error.code = "staff_plan_subscription_missing";
    throw error;
  }
  if (simulation) {
    return {
      subscription: simulateReplacedSubscription(subscription, staffPriceId),
      previousPriceId: subscriptionPriceId(subscription),
      prorationBehavior: "none",
      subscriptionIdRetained: true,
    };
  }
  if (!itemId) {
    const error = new Error("Existing subscription has no item to replace.");
    error.code = "staff_plan_item_missing";
    throw error;
  }
  await stripeRequest(`subscription_items/${encodeURIComponent(itemId)}`, {
    price: staffPriceId,
    proration_behavior: "none",
  });
  await stripeRequest(`subscriptions/${encodeURIComponent(subId)}`, {
    "metadata[plan]": staffPlan.STAFF_PLAN_KEY,
    "metadata[offer]": staffPlan.STAFF_PLAN_OFFER,
    "metadata[billing_price]": staffPlan.STAFF_PLAN_AMOUNT,
    proration_behavior: "none",
  });
  const live = await stripeGet(`subscriptions/${encodeURIComponent(subId)}`);
  return {
    subscription: live,
    previousPriceId: subscriptionPriceId(subscription),
    prorationBehavior: "none",
    subscriptionIdRetained: normalizeId(live?.id) === subId,
  };
}

/**
 * Ignore subscription/invoice events that belong to a leftover or unrelated sub
 * after Staff Plan is the authoritative stored subscription.
 */
function shouldApplyStripeSubscriptionEvent({
  user = {},
  subscription = {},
  eventType = "updated",
} = {}) {
  const eventSubId = normalizeId(subscription?.id);
  const storedSubId = normalizeId(user?.stripeSubscriptionId);
  // Plan must come from the event payload, not stored pendingPlan/billingOffer.
  // Otherwise a leftover Monthly event during Staff upgrade would look like Staff.
  const eventIsStaff = isStaffPricedSubscription(subscription);
  const pendingPlan = String(user?.pendingPlan || "").trim().toLowerCase();
  const adoptingStaff = pendingPlan === staffPlan.STAFF_PLAN_KEY && eventIsStaff;
  const userIsStaff = staffPlan.isStaffPlanOffer(user) || storedStaffHolding(user);

  if (!eventSubId) {
    return { apply: false, reason: "missing_event_subscription_id" };
  }
  if (!storedSubId) {
    return { apply: true, reason: "no_stored_subscription" };
  }
  if (eventSubId === storedSubId) {
    return { apply: true, reason: "authoritative_subscription" };
  }
  if (adoptingStaff) {
    return { apply: true, reason: "staff_upgrade_adoption" };
  }
  // While a Staff upgrade is in flight, only the stored subscription or a
  // Staff-priced adoption event may write membership. Leftover Monthly/Early
  // events must not use pendingPlan to look like Staff.
  if (pendingPlan === staffPlan.STAFF_PLAN_KEY && !eventIsStaff) {
    return { apply: false, reason: "ignore_unrelated_subscription" };
  }
  // After Staff Plan is authoritative, leftover Monthly/Early/Annual events
  // must not overwrite billingOffer, stripeSubscriptionId, plan, or entitlement.
  if (userIsStaff && !eventIsStaff) {
    return { apply: false, reason: "ignore_unrelated_subscription" };
  }
  if (userIsStaff && eventIsStaff && eventSubId !== storedSubId) {
    return { apply: false, reason: "ignore_unrelated_subscription" };
  }
  if (eventType === "deleted" && eventSubId !== storedSubId && userIsStaff) {
    return { apply: false, reason: "ignore_unrelated_subscription" };
  }
  // Non-Staff customers keep existing customer-scoped webhook behavior
  // (new checkout after cancel, ordinary renewals, etc.).
  return { apply: true, reason: "non_staff_customer_scope" };
}

function invoiceSubscriptionId(invoice) {
  const raw = invoice?.subscription;
  if (!raw) return "";
  if (typeof raw === "string") return normalizeId(raw);
  return normalizeId(raw.id);
}

function shouldApplyStripeInvoiceEvent({ user = {}, invoice = {}, subscription = null } = {}) {
  const eventSubId = invoiceSubscriptionId(invoice) || normalizeId(subscription?.id);
  // Subscription-linked invoices use the same ownership rules as subscription events.
  if (eventSubId) {
    return shouldApplyStripeSubscriptionEvent({
      user,
      subscription: subscription && normalizeId(subscription.id) === eventSubId
        ? subscription
        : { ...(subscription || {}), id: eventSubId },
      eventType: "invoice",
    });
  }
  // Legacy / test invoices may omit subscription. Apply by customer unless Staff
  // Plan is already authoritative — then only the stored Staff sub may change state.
  if (staffPlan.isStaffPlanOffer(user) || storedStaffHolding(user)) {
    return { apply: false, reason: "ignore_unrelated_subscription" };
  }
  return { apply: true, reason: "invoice_without_subscription_id" };
}

function isFalseCancellationAccessLoss(user) {
  return membershipAccess.membershipIsBillingReviewRequired(user) === true;
}

module.exports = {
  UPGRADE_LOCK_MS,
  HOLDING_STATUSES,
  ANNUAL_STAFF_PLAN_BLOCKED_MESSAGE,
  STAFF_BILLING_RECOVERY_MESSAGE,
  UPGRADE_IN_PROGRESS_MESSAGE,
  AMBIGUOUS_CUSTOMER_MESSAGE,
  classifyStaffPlanStart,
  summarizeSubscriptions,
  resolveAuthoritativeCustomer,
  replaceSubscriptionWithStaffPlan,
  simulateReplacedSubscription,
  shouldApplyStripeSubscriptionEvent,
  shouldApplyStripeInvoiceEvent,
  isFalseCancellationAccessLoss,
  isStaffPricedSubscription,
  isAnnualSubscription,
  isReplaceableSourcePlan,
  withEmailLock,
  subscriptionPriceId,
  firstSubscriptionItem,
};
