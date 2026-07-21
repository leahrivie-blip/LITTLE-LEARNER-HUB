/**
 * Future entitlement / pricing foundation for Little Learner Hub.
 *
 * Phase 1 only: structure and helpers. Does NOT:
 * - create Stripe products/prices
 * - change current subscriptions
 * - charge customers
 * - display new pricing publicly
 * - remove Founding Member benefits
 *
 * Current live access continues to use membership-access.js (Free / Pro / Founding).
 * Future plan access must come from verified server-side entitlements, not UI labels.
 */

const PLAN_KEYS = Object.freeze({
  CURRICULUM_ONLY: "curriculum_only",
  HOME_DAYCARE: "home_daycare",
  SMALL_CENTER: "small_center",
  GROWING_CENTER: "growing_center",
  LARGE_CENTER: "large_center",
  FOUNDING_MEMBER: "founding_member",
  CUSTOM: "custom",
});

const BILLING_INTERVALS = Object.freeze({
  MONTHLY: "monthly",
  ANNUAL: "annual",
});

const ENTITLEMENT_STATUSES = Object.freeze({
  ACTIVE: "active",
  TRIALING: "trialing",
  PAST_DUE: "past_due",
  UNPAID: "unpaid",
  CANCELED_PENDING_END: "canceled_pending_end",
  ENDED: "ended",
  RESTRICTED: "restricted",
});

const FEATURE_ENTITLEMENTS = Object.freeze({
  CURRICULUM: "curriculum",
  CHILD_PROFILES: "child_profiles",
  DAILY_REPORTS: "daily_reports",
  OBSERVATIONS: "observations",
  DOCUMENTATION_HELPERS: "documentation_helpers",
  BEHAVIOR_SUPPORT: "behavior_support",
  ATTENDANCE: "attendance",
  FORMS_CENTER: "forms_center",
  FAMILY_HUB: "family_hub",
  DIRECTOR_CENTER: "director_center",
  CLASSROOM_MANAGEMENT: "classroom_management",
  STAFF_ROLES: "staff_roles",
  CENTER_REPORTS: "center_reports",
  ENROLLMENT: "enrollment",
});

const PLANNED_PLAN_CATALOG = Object.freeze({
  [PLAN_KEYS.CURRICULUM_ONLY]: {
    key: PLAN_KEYS.CURRICULUM_ONLY,
    label: "Curriculum Only",
    monthlyPriceCents: 1499,
    annualPriceCents: 14900,
    annualMessage: "Choose annual billing and get approximately two months free.",
    classroomLimit: 0,
    staffAccountLimit: 0,
    locationLimit: 0,
    allowsClassroomAddOns: false,
    features: [
      FEATURE_ENTITLEMENTS.CURRICULUM,
    ],
    excludes: [
      FEATURE_ENTITLEMENTS.DIRECTOR_CENTER,
      FEATURE_ENTITLEMENTS.CLASSROOM_MANAGEMENT,
      FEATURE_ENTITLEMENTS.CHILD_PROFILES,
      FEATURE_ENTITLEMENTS.ENROLLMENT,
      FEATURE_ENTITLEMENTS.FORMS_CENTER,
      FEATURE_ENTITLEMENTS.CENTER_REPORTS,
      FEATURE_ENTITLEMENTS.FAMILY_HUB,
      FEATURE_ENTITLEMENTS.STAFF_ROLES,
    ],
  },
  [PLAN_KEYS.HOME_DAYCARE]: {
    key: PLAN_KEYS.HOME_DAYCARE,
    label: "Home Daycare",
    monthlyPriceCents: 1999,
    annualPriceCents: 19900,
    annualMessage: "Choose annual billing and get approximately two months free.",
    classroomLimit: 1,
    staffAccountLimit: 2, // owner + one additional
    locationLimit: 1,
    allowsClassroomAddOns: false,
    upgradeHint: "A Home Daycare needing more than one classroom should upgrade to a center plan.",
    features: [
      FEATURE_ENTITLEMENTS.CURRICULUM,
      FEATURE_ENTITLEMENTS.CHILD_PROFILES,
      FEATURE_ENTITLEMENTS.DAILY_REPORTS,
      FEATURE_ENTITLEMENTS.OBSERVATIONS,
      FEATURE_ENTITLEMENTS.DOCUMENTATION_HELPERS,
      FEATURE_ENTITLEMENTS.BEHAVIOR_SUPPORT,
      FEATURE_ENTITLEMENTS.ATTENDANCE,
      FEATURE_ENTITLEMENTS.FORMS_CENTER,
      FEATURE_ENTITLEMENTS.FAMILY_HUB,
    ],
  },
  [PLAN_KEYS.SMALL_CENTER]: {
    key: PLAN_KEYS.SMALL_CENTER,
    label: "Small Center",
    monthlyPriceCents: 2999,
    annualPriceCents: 29900,
    annualMessage: "Choose annual billing and get approximately two months free.",
    classroomLimit: 8,
    staffAccountLimit: 15,
    locationLimit: 1,
    allowsClassroomAddOns: true,
    features: [
      FEATURE_ENTITLEMENTS.CURRICULUM,
      FEATURE_ENTITLEMENTS.CHILD_PROFILES,
      FEATURE_ENTITLEMENTS.DAILY_REPORTS,
      FEATURE_ENTITLEMENTS.OBSERVATIONS,
      FEATURE_ENTITLEMENTS.DOCUMENTATION_HELPERS,
      FEATURE_ENTITLEMENTS.BEHAVIOR_SUPPORT,
      FEATURE_ENTITLEMENTS.ATTENDANCE,
      FEATURE_ENTITLEMENTS.FORMS_CENTER,
      FEATURE_ENTITLEMENTS.FAMILY_HUB,
      FEATURE_ENTITLEMENTS.DIRECTOR_CENTER,
      FEATURE_ENTITLEMENTS.CLASSROOM_MANAGEMENT,
      FEATURE_ENTITLEMENTS.STAFF_ROLES,
      FEATURE_ENTITLEMENTS.CENTER_REPORTS,
      FEATURE_ENTITLEMENTS.ENROLLMENT,
    ],
  },
  [PLAN_KEYS.GROWING_CENTER]: {
    key: PLAN_KEYS.GROWING_CENTER,
    label: "Growing Center",
    monthlyPriceCents: 4499,
    annualPriceCents: 44900,
    annualMessage: "Choose annual billing and get approximately two months free.",
    classroomLimit: 15,
    staffAccountLimit: 30,
    locationLimit: 1,
    allowsClassroomAddOns: true,
    features: null, // inherits Small Center + expanded capacity
  },
  [PLAN_KEYS.LARGE_CENTER]: {
    key: PLAN_KEYS.LARGE_CENTER,
    label: "Large Center",
    monthlyPriceCents: 7499,
    annualPriceCents: 74900,
    annualMessage: "Choose annual billing and get approximately two months free.",
    classroomLimit: 30,
    staffAccountLimit: 60,
    locationLimit: 1,
    allowsClassroomAddOns: true,
    features: null,
  },
  [PLAN_KEYS.FOUNDING_MEMBER]: {
    key: PLAN_KEYS.FOUNDING_MEMBER,
    label: "Founding Member",
    monthlyPriceCents: 999,
    annualPriceCents: null,
    lockedPrice: true,
    grandfathered: true,
    classroomLimit: null, // governed by current Pro-equivalent access until future mapping
    staffAccountLimit: null,
    locationLimit: 1,
    allowsClassroomAddOns: true,
    note: "Existing active Founding Members remain locked at $9.99/month while continuously active.",
  },
});

const CLASSROOM_ADD_ON = Object.freeze({
  key: "classroom_addon",
  label: "Additional Classroom",
  monthlyPriceCents: 699,
  annualPriceCents: 6900,
  classroomsGranted: 1,
  staffAccountsGranted: 2,
  rules: [
    "Curriculum Only cannot purchase classroom add-ons.",
    "Home Daycare should upgrade rather than stack add-ons for extra classrooms.",
    "Center plans may purchase add-ons when allowed.",
    "Each add-on belongs to one organization and one physical location.",
    "Add-ons are tracked separately from the base subscription.",
    "Canceling an add-on must not cancel the base subscription.",
    "Add-on access continues through the paid billing period.",
    "Ending an add-on must never delete classroom or child records.",
    "A classroom with ended access becomes restricted or archived.",
    "Forms, signatures, reports, observations, messages, documents, and audit history are preserved.",
  ],
});

function centsToDisplay(cents) {
  if (cents === null || cents === undefined) return null;
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

function annualSavings(plan) {
  if (!plan || plan.monthlyPriceCents == null || plan.annualPriceCents == null) return null;
  const yearIfMonthly = plan.monthlyPriceCents * 12;
  return yearIfMonthly - plan.annualPriceCents;
}

function resolvePlanFeatures(planKey) {
  const plan = PLANNED_PLAN_CATALOG[planKey];
  if (!plan) return [];
  if (Array.isArray(plan.features)) return [...plan.features];
  if (planKey === PLAN_KEYS.GROWING_CENTER || planKey === PLAN_KEYS.LARGE_CENTER) {
    return resolvePlanFeatures(PLAN_KEYS.SMALL_CENTER);
  }
  if (planKey === PLAN_KEYS.FOUNDING_MEMBER) {
    return resolvePlanFeatures(PLAN_KEYS.HOME_DAYCARE);
  }
  return [];
}

function createOrganizationEntitlementRecord({
  id = "",
  organizationId = "",
  basePlanKey = PLAN_KEYS.HOME_DAYCARE,
  billingInterval = BILLING_INTERVALS.MONTHLY,
  status = ENTITLEMENT_STATUSES.ACTIVE,
  stripeCustomerId = "",
  stripeSubscriptionId = "",
  stripeProductId = "",
  stripePriceId = "",
  classroomLimit = null,
  staffAccountLimit = null,
  classroomAddOnQuantity = 0,
  foundingMemberEligible = false,
  grandfatheredPriceCents = null,
  promotionalPriceCents = null,
  trialStatus = "",
  accessEndsAt = "",
  renewalDate = "",
} = {}) {
  const plan = PLANNED_PLAN_CATALOG[basePlanKey] || PLANNED_PLAN_CATALOG[PLAN_KEYS.HOME_DAYCARE];
  const addOns = Number(classroomAddOnQuantity) || 0;
  const baseClassrooms = classroomLimit == null ? (plan.classroomLimit || 0) : classroomLimit;
  const baseStaff = staffAccountLimit == null ? (plan.staffAccountLimit || 0) : staffAccountLimit;
  return {
    id: id || `ent_${organizationId || "org"}`,
    organizationId,
    // Separated billing concepts — do not collapse these.
    stripeCustomerId: stripeCustomerId || "",
    stripeSubscriptionId: stripeSubscriptionId || "",
    stripeProductId: stripeProductId || "",
    stripePriceId: stripePriceId || "",
    basePlanKey,
    billingInterval,
    subscriptionStatus: status,
    accountTypeHint: "",
    featureEntitlements: resolvePlanFeatures(basePlanKey),
    classroomLimit: baseClassrooms + (addOns * CLASSROOM_ADD_ON.classroomsGranted),
    staffAccountLimit: baseStaff + (addOns * CLASSROOM_ADD_ON.staffAccountsGranted),
    classroomAddOnQuantity: addOns,
    foundingMemberEligible: foundingMemberEligible === true,
    grandfatheredPriceCents,
    promotionalPriceCents,
    trialStatus: trialStatus || "",
    accessEndsAt: accessEndsAt || "",
    renewalDate: renewalDate || "",
    live: false,
    note: "Phase 1 structure only — not connected to live Stripe checkout.",
  };
}

function createClassroomAddOnRecord({
  id = "",
  organizationId = "",
  quantity = 1,
  billingInterval = BILLING_INTERVALS.MONTHLY,
  stripeSubscriptionItemId = "",
  status = ENTITLEMENT_STATUSES.ACTIVE,
  accessEndsAt = "",
} = {}) {
  return {
    id: id || `addon_${organizationId || "org"}`,
    organizationId,
    quantity: Number(quantity) || 1,
    billingInterval,
    stripeSubscriptionItemId: stripeSubscriptionItemId || "",
    status,
    accessEndsAt: accessEndsAt || "",
    classroomsGranted: (Number(quantity) || 1) * CLASSROOM_ADD_ON.classroomsGranted,
    staffAccountsGranted: (Number(quantity) || 1) * CLASSROOM_ADD_ON.staffAccountsGranted,
    live: false,
  };
}

/**
 * Before purchasing multiple classroom add-ons, compare total vs next plan.
 * Returns a recommendation when upgrading would cost the same or less.
 */
function recommendUpgradeInsteadOfAddOns({
  currentPlanKey = "",
  billingInterval = BILLING_INTERVALS.MONTHLY,
  additionalClassroomsNeeded = 0,
} = {}) {
  const order = [
    PLAN_KEYS.HOME_DAYCARE,
    PLAN_KEYS.SMALL_CENTER,
    PLAN_KEYS.GROWING_CENTER,
    PLAN_KEYS.LARGE_CENTER,
  ];
  const currentIndex = order.indexOf(currentPlanKey);
  if (currentIndex < 0 || additionalClassroomsNeeded <= 0) {
    return { recommendUpgrade: false };
  }
  const current = PLANNED_PLAN_CATALOG[currentPlanKey];
  if (!current?.allowsClassroomAddOns && currentPlanKey === PLAN_KEYS.HOME_DAYCARE) {
    return {
      recommendUpgrade: true,
      message: "Based on the number of classrooms you need, upgrading your plan will save you money.",
      reason: "home_daycare_should_upgrade",
      nextPlanKey: PLAN_KEYS.SMALL_CENTER,
    };
  }
  const priceField = billingInterval === BILLING_INTERVALS.ANNUAL ? "annualPriceCents" : "monthlyPriceCents";
  const addOnUnit = billingInterval === BILLING_INTERVALS.ANNUAL
    ? CLASSROOM_ADD_ON.annualPriceCents
    : CLASSROOM_ADD_ON.monthlyPriceCents;
  const stayCost = (current[priceField] || 0) + (additionalClassroomsNeeded * addOnUnit);
  for (let i = currentIndex + 1; i < order.length; i += 1) {
    const next = PLANNED_PLAN_CATALOG[order[i]];
    const nextCost = next[priceField] || 0;
    const nextCoversNeed = (next.classroomLimit || 0) >= ((current.classroomLimit || 0) + additionalClassroomsNeeded);
    if (nextCoversNeed && nextCost <= stayCost) {
      return {
        recommendUpgrade: true,
        message: "Based on the number of classrooms you need, upgrading your plan will save you money.",
        currentPlanKey,
        nextPlanKey: next.key,
        stayCostCents: stayCost,
        upgradeCostCents: nextCost,
        savingsCents: stayCost - nextCost,
      };
    }
  }
  return { recommendUpgrade: false, stayCostCents: stayCost };
}

function plannedBillingDisplay(planKey, billingInterval = BILLING_INTERVALS.MONTHLY) {
  const plan = PLANNED_PLAN_CATALOG[planKey];
  if (!plan) return null;
  const savings = annualSavings(plan);
  return {
    planKey,
    label: plan.label,
    monthlyPrice: centsToDisplay(plan.monthlyPriceCents),
    annualPrice: centsToDisplay(plan.annualPriceCents),
    annualSavings: centsToDisplay(savings),
    billingInterval,
    annualMessage: plan.annualMessage || "Choose annual billing and get approximately two months free.",
    renewalDate: null,
    cancellationTerms: "Cancellation keeps access through the paid billing period.",
    live: false,
  };
}

/**
 * Map current live membership shape onto future entitlement concepts (documentation helper).
 * Does not mutate or replace membership-access decisions.
 */
function describeCurrentLiveBillingModel() {
  return {
    livePlans: {
      free: "Free plan with curated/grandfathered limits",
      founding: "$9.99/month lifetime lock while continuously active (FOUNDING_LIMIT default 50)",
      proMonthly: "$19.99/month",
      proAnnual: "$199/year",
    },
    identification: {
      userFields: [
        "plan",
        "subscriptionStatus",
        "subscriptionCadence",
        "stripeCustomerId",
        "stripeSubscriptionId",
        "stripeSubscriptionStatus",
        "stripePriceId",
        "foundingMember",
        "foundingMemberActive",
        "foundingMemberHistorical",
        "foundingMemberNumber",
        "priceLock",
        "accessEndsAt",
        "currentPeriodEnd",
        "trialEnd",
        "cancelAtPeriodEnd",
      ],
      accessFunction: "membershipHasProAccess / membershipCurrentAccessKey in scripts/membership-access.js",
      note: "Access is not determined by dollar amount alone; Stripe status + period end + founding flags matter.",
    },
    foundingProtection: [
      "Do not change existing Stripe founding price.",
      "Do not auto-move Founding Members to annual billing.",
      "Do not migrate them onto a new public plan automatically.",
      "Do not remove Founding Member status while continuously active.",
      "Former Founding Members are not auto-eligible for $9.99 on return.",
      "Failed payments follow past_due / unpaid locks in membership-access.js.",
    ],
    phase1Rule: "Keep live billing untouched. Future plans live in organizationEntitlements when a later phase connects Stripe products.",
  };
}

function downgradeSafetyRules() {
  return {
    upgrade: "May increase access immediately according to future billing rules.",
    downgrade: [
      "Must not delete information.",
      "If classroom or staff usage exceeds new limits, show exceeded limits.",
      "Require director to select active classrooms and staff.",
      "Archive remaining classrooms safely.",
      "Preserve historical records, signed forms, and audit history.",
      "Prevent new activity in restricted classrooms.",
      "Allow restore if the customer upgrades again.",
    ],
  };
}

function failedPaymentRules() {
  return {
    current: "membershipHasProAccess returns false for past_due / unpaid / payment failed.",
    future: [
      "Keep entitlement status past_due or unpaid.",
      "Retain records; restrict new paid-feature activity.",
      "Document recovery CTA to update payment method.",
      "Founding Member price remains only if subscription recovers while continuously eligible.",
    ],
  };
}

module.exports = {
  PLAN_KEYS,
  BILLING_INTERVALS,
  ENTITLEMENT_STATUSES,
  FEATURE_ENTITLEMENTS,
  PLANNED_PLAN_CATALOG,
  CLASSROOM_ADD_ON,
  centsToDisplay,
  annualSavings,
  resolvePlanFeatures,
  createOrganizationEntitlementRecord,
  createClassroomAddOnRecord,
  recommendUpgradeInsteadOfAddOns,
  plannedBillingDisplay,
  describeCurrentLiveBillingModel,
  downgradeSafetyRules,
  failedPaymentRules,
};
