/**
 * Shared membership access rules for server QA tests and documentation parity.
 * Server and app.js mirror this logic inline for runtime.
 *
 * CANCELLATION POLICY
 * - Paid Pro/Founding cancel → keep access until current_period_end (or trial_end if trialing).
 * - Status shows "Canceled — Access Ends [date]" while access remains; trialing adds "(Trial — no future charge)".
 * - After access-end date → Free. Never revoke access solely because status text contains "cancel".
 * - Trial cancel uses Stripe cancel_at_period_end: no future charge, access through trial end.
 *
 * FOUNDING MEMBER POLICY
 * - $9.99/month locked while your membership remains continuously active only while the founding subscription stays continuously active.
 * - foundingMemberHistorical / foundingMemberNumber may remain after cancel of a *paid* founding cycle;
 *   they do NOT grant paid access, and former paid founding members are NOT auto-routed to $9.99 on return.
 * - Admin may intentionally restore $9.99 via foundingMemberActive + restoreFoundingPrice override.
 * - Promo / free-month signups reserve a Founding spot immediately. If the member cancels before the
 *   first paid billing cycle, the reserved spot is released back into inventory.
 * - After the first successful paid invoice, canceling ends access at period end but keeps the
 *   numbered spot (foundingMembers[]) so the original paid founding accounts stay fixed.
 *
 * STRIPE STATUS MAPPING (confirmed)
 * - stripeSubscriptionStatus "unpaid" is NEVER treated as canceled or ended.
 * - stripeSubscriptionStatus "past_due" is NEVER treated as canceled or ended.
 * - "Subscription Ended" (or "Trial Ended") may ONLY ever be produced by a verified
 *   customer.subscription.deleted event, or a customer.subscription.updated event whose
 *   Stripe status is literally "canceled" (or the account's own access period has
 *   genuinely elapsed). unpaid/past_due are explicitly excluded from that condition.
 * - unpaid/past_due DO remove paid platform access (membershipHasProAccess still denies
 *   access for either), but the account is displayed as "Billing Review Required" — never
 *   "Payment Failed", never "Subscription Ended", never "Canceled". This is a deliberately
 *   neutral, non-alarmist, non-conclusive label: it asserts only that a human should check
 *   Stripe, not that the subscription is over.
 *
 * BILLING REVIEW LABEL POLICY
 * - "Billing Review Required" is event-driven, set by Stripe webhooks
 *   (invoice.payment_failed, customer.subscription.updated reporting unpaid/past_due).
 *   There is no polling reconciliation, so if Stripe never sends a follow-up event (e.g.
 *   it leaves the subscription "unpaid" indefinitely instead of canceling it, or a later
 *   webhook is missed), the label can persist — this is expected and correct: it is NOT
 *   promoted to "Subscription Ended" just because time has passed (see above).
 * - This does NOT affect access: membershipHasProAccess already denies access for any
 *   unpaid/past_due/billing-review signal regardless of staleness, and continues to do so.
 * - IMPORTANT: elapsed time alone is NEVER proof that a subscription was actually
 *   canceled or ended. An old unpaid invoice is not the same thing as a confirmed
 *   cancellation — only a verified Stripe event (webhook) or an explicit admin-authorized
 *   reconciliation may ever write "Subscription Ended"/"canceled" to a user record.
 * - membershipPaymentFailureIsStale() distinguishes a fresh billing-review signal (Stripe
 *   may still be retrying, or the failure just happened) from a stale one (retries have
 *   clearly stopped, no recovery) — used only to decide whether to keep nagging the
 *   end-user with an "update payment" banner and which admin bucket it sorts into. The
 *   displayed label text is "Billing Review Required" either way; a missing
 *   lastFailedPaymentAt timestamp is never treated as stale.
 */

// Stripe's default Smart Retries schedule finishes well inside this window; once it has
// passed with no scheduled retry and no recovery, the failure is old enough that Stripe is
// clearly done retrying — but that elapsed time never implies the subscription was
// canceled/ended, and the displayed label does not change; only the end-user nag banner
// and the admin triage bucket do.
const PAYMENT_FAILURE_STALE_DAYS = 21;

// Single, deliberately neutral label for any unpaid/past_due signal, fresh or historical.
// Never "Payment Failed", never "Past Due", never "Ended"/"Canceled" — only a verified
// Stripe event (deleted, or status=canceled) may ever produce those.
const BILLING_REVIEW_REQUIRED_LABEL = "Billing Review Required";
// Retained as an alias so any code/tests still referencing the older name keep working.
const PAYMENT_FAILURE_NEEDS_REVIEW_LABEL = BILLING_REVIEW_REQUIRED_LABEL;

function parseIsoMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function stripeStatusIsPaidAccess(status = "") {
  const s = String(status || "").toLowerCase();
  return s === "active" || s === "trialing";
}

/**
 * True when a stored "payment failed" / "past due" signal is old news: Stripe is no
 * longer actively retrying and enough time has passed that this is a historical event,
 * not a current problem. Used only to pick the display label — never to grant or revoke
 * access, send emails, or touch Stripe.
 */
/**
 * True whenever the stored signal is "unpaid"/"past_due" (by raw Stripe status OR by the
 * older/newer subscriptionStatus text), and the account has not already been concluded
 * "ended" by a verified Stripe event. This is the ONLY place that decides "is this account
 * in the billing-review family" — every other function (display label, buckets, access
 * checks) is built on top of this so they can never drift apart.
 */
function membershipIsBillingReviewRequired(user) {
  const stripeStatus = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  const subStatus = String(user?.subscriptionStatus || "").toLowerCase();
  if (subStatus.includes("ended")) return false; // A verified conclusion always wins.
  return subStatus.includes("billing review required")
    || subStatus.includes("payment failed")
    || subStatus.includes("past due")
    || stripeStatus === "unpaid"
    || stripeStatus === "past_due";
}

function membershipPaymentFailureIsStale(user, nowMs = Date.now()) {
  if (!membershipIsBillingReviewRequired(user)) return false;

  const lastFailedMs = parseIsoMs(user?.lastFailedPaymentAt);
  if (lastFailedMs === null) return false; // No timestamp evidence — keep showing the alert.

  const lastSuccessMs = parseIsoMs(user?.lastSuccessfulPaymentAt);
  if (lastSuccessMs !== null && lastSuccessMs > lastFailedMs) return false; // Recovered since.

  const nextRetryMs = parseIsoMs(user?.nextPaymentRetryAt);
  if (nextRetryMs !== null && nextRetryMs > nowMs) return false; // Stripe is still retrying.

  return (nowMs - lastFailedMs) > PAYMENT_FAILURE_STALE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Read-only snapshot that keeps the four billing signals visually and structurally
 * distinct, instead of collapsing them into one label:
 *   1. currentAccess       — what the user can actually do right now (Free/Trial/Pro/Founding)
 *   2. stripeSubscriptionStatus — the raw Stripe status string as last recorded locally
 *   3. lastFailedPaymentAt — when (if ever) a payment failure was last recorded
 *   4. nextPaymentRetryAt  — whether Stripe still has a retry scheduled
 * Never mutates anything; used by admin UI and the read-only reconciliation tooling.
 */
function membershipBillingReviewSnapshot(user, nowMs = Date.now()) {
  return {
    email: user?.email || "",
    currentAccess: membershipCurrentAccessKey(user, nowMs),
    currentAccessLabel: membershipPlanDisplay(user, nowMs),
    hasProAccess: membershipHasProAccess(user, nowMs),
    stripeSubscriptionStatus: user?.stripeSubscriptionStatus || "",
    subscriptionStatus: user?.subscriptionStatus || "",
    stripeSubscriptionId: user?.stripeSubscriptionId || "",
    stripeCustomerId: user?.stripeCustomerId || "",
    lastFailedPaymentAt: user?.lastFailedPaymentAt || "",
    nextPaymentRetryAt: user?.nextPaymentRetryAt || "",
    lastSuccessfulPaymentAt: user?.lastSuccessfulPaymentAt || "",
    needsBillingReview: membershipPaymentFailureIsStale(user, nowMs),
  };
}

function accessEndMs(user) {
  return parseIsoMs(user?.accessEndsAt)
    || parseIsoMs(user?.currentPeriodEnd)
    || parseIsoMs(user?.trialEnd);
}

function membershipHasProAccess(user, nowMs = Date.now()) {
  if (!user) return false;
  if (String(user.accountStatus || "").toLowerCase() === "disabled" || user.disabled === true) return false;
  if (user.internalAccessOverride === true) return true;

  const stripeStatus = String(user.stripeSubscriptionStatus || "").toLowerCase();
  const subStatus = String(user.subscriptionStatus || "").toLowerCase();

  // unpaid/past_due (old or new wording) always remove paid access — but this is an
  // access decision, never a "canceled/ended" conclusion. See membershipIsBillingReviewRequired.
  if (subStatus.includes("billing review required")
    || subStatus.includes("payment failed")
    || subStatus.includes("past due")
    || stripeStatus === "unpaid"
    || stripeStatus === "past_due") {
    return false;
  }

  const endMs = accessEndMs(user);
  const periodStillValid = endMs !== null && endMs > nowMs;

  if (stripeStatus === "trialing") return endMs === null || periodStillValid;
  if (stripeStatus === "active") return true;

  if (periodStillValid && (user.plan === "Pro" || user.plan === "Founding" || user.foundingMemberActive)) {
    return true;
  }

  if (subStatus.includes("access ends") && periodStillValid) {
    return true;
  }

  if (subStatus.includes("free plan") || subStatus.includes("ended")) {
    return false;
  }

  // Active Founding marker can precede Stripe field sync after checkout — still paid access
  // when there is no Free/ended/billing-review signal and the period has not expired.
  if (user.foundingMemberActive) {
    return endMs === null || periodStillValid;
  }

  if (["Pro", "Founding"].includes(user.plan) && (subStatus.includes("active") || subStatus.includes("trialing") || subStatus.includes("trial"))) {
    return periodStillValid || endMs === null;
  }

  return false;
}

function membershipUserInTrial(user, nowMs = Date.now()) {
  if (!user || !membershipHasProAccess(user, nowMs)) return false;
  const trialStatus = String(user.trialStatus || "").toLowerCase();
  if (trialStatus.includes("in trial") || trialStatus.includes("trial active")) return true;
  const stripeStatus = String(user.stripeSubscriptionStatus || "").toLowerCase();
  if (stripeStatus === "trialing") return true;
  const status = String(user.subscriptionStatus || "").toLowerCase();
  return status.includes("trialing")
    || (status.includes("trial") && !status.includes("trial ended") && !status.includes("no trial"));
}

function membershipFoundingActive(user, nowMs = Date.now()) {
  return Boolean(user?.foundingMemberActive) && membershipHasProAccess(user, nowMs);
}

function membershipFoundingHistorical(user) {
  return Boolean(user?.foundingMemberHistorical || user?.foundingMember || user?.foundingMemberNumber);
}

function membershipIsEarlyUser(user) {
  if (!user) return false;
  if (String(user.billingOffer || "").trim().toLowerCase() === "early_user") return true;
  if (String(user.priceLock || "").trim() === "Early User") return true;
  return false;
}

function membershipIsStaffPlan(user) {
  return String(user?.billingOffer || "").trim().toLowerCase() === "staff_plan";
}

function membershipPlanDisplay(user, nowMs = Date.now()) {
  if (!membershipHasProAccess(user, nowMs)) return "Free";
  if (membershipUserInTrial(user, nowMs)) return "Trial";
  if (membershipFoundingActive(user, nowMs)) return "Founding Member";
  if (membershipIsStaffPlan(user)) return "Staff Plan";
  if (user?.subscriptionCadence === "annual") return "Pro Annual";
  if (membershipIsEarlyUser(user)) return "Pro — Early User";
  return "Pro Monthly";
}

function membershipHasTrialHistory(user) {
  if (!user) return false;
  const trialStatus = String(user.trialStatus || "").toLowerCase();
  const status = String(user.subscriptionStatus || "").toLowerCase();
  return Boolean(user.trialStart || user.trialEnd)
    || (trialStatus.includes("trial") && !trialStatus.includes("no trial"))
    || status.includes("trialing")
    || status.includes("trial ended")
    || status.includes("trial canceled");
}

function membershipHasSubscriptionHistory(user) {
  if (!user) return false;
  const status = String(user.subscriptionStatus || "").toLowerCase();
  const stripeStatus = String(user.stripeSubscriptionStatus || "").toLowerCase();
  const stripeEvidence = Boolean(user.subscriptionStartedAt || user.stripeSubscriptionId)
    || ["active", "trialing", "past_due", "unpaid", "canceled"].includes(stripeStatus);
  if ((user.manualAccessGranted || user.internalAccessOverride) && !stripeEvidence && !membershipHasTrialHistory(user)) return false;
  return membershipHasTrialHistory(user)
    || stripeEvidence
    || (["Pro", "Founding"].includes(user.plan) && !user.internalAccessOverride)
    || Boolean(user.foundingMemberHistorical || user.foundingMember || user.foundingMemberNumber)
    || (!user.manualAccessGranted && (
      status.includes("subscription active")
      || status.includes("subscription ended")
      || status.includes("canceled and ended")
    ));
}

function membershipPreviousPlanDisplay(user) {
  if (!user || !membershipHasSubscriptionHistory(user)) return "None";
  if (membershipHasProAccess(user)) return "None";
  if (membershipHasTrialHistory(user)) return "Pro Trial";
  if (membershipFoundingHistorical(user)) return "Founding Member";
  return user.previousPlan || "Pro";
}

function membershipStatusDisplay(user, nowMs = Date.now()) {
  const stripeStatus = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  const status = String(user?.subscriptionStatus || "").toLowerCase();

  // unpaid/past_due — fresh or historical — always display as the single neutral
  // "Billing Review Required" label. Never "Payment Failed", never "Ended"/"Canceled".
  // A verified Stripe event (customer.subscription.deleted, or status=canceled) always
  // takes priority (membershipIsBillingReviewRequired already excludes "...ended" text).
  if (membershipIsBillingReviewRequired(user)) return BILLING_REVIEW_REQUIRED_LABEL;

  const hasAccess = membershipHasProAccess(user, nowMs);
  const cancelScheduled = Boolean(user?.cancelAtPeriodEnd) || status.includes("access ends");
  const trialEndMs = parseIsoMs(user?.trialEnd) || parseIsoMs(user?.accessEndsAt);
  const stripeTrialActive = stripeStatus === "trialing" && (trialEndMs === null || trialEndMs > nowMs);
  const manualOnlyAccess = Boolean(user?.internalAccessOverride) && !stripeStatusIsPaidAccess(stripeStatus);
  const billingActive = stripeStatus === "active" || stripeTrialActive || (hasAccess && !manualOnlyAccess);

  if (cancelScheduled && billingActive) {
    return stripeTrialActive || membershipUserInTrial(user, nowMs) ? "Cancels at Trial End" : "Cancels at Period End";
  }
  if (stripeTrialActive || membershipUserInTrial(user, nowMs)) return "Trial Active";
  if (billingActive) return "Active";
  if (membershipHasTrialHistory(user)) {
    return status.includes("cancel") || String(user?.trialStatus || "").toLowerCase().includes("cancel")
      ? "Trial Canceled"
      : "Trial Ended";
  }
  if (membershipHasSubscriptionHistory(user)) return "Subscription Ended";
  return "No paid subscription";
}

function membershipCurrentAccessKey(user, nowMs = Date.now()) {
  if (membershipIsBillingReviewRequired(user)) return "past_due";
  const plan = membershipPlanDisplay(user, nowMs);
  if (plan === "Trial") return "trial";
  if (plan === "Founding Member") return "founding";
  // Early User is still Pro entitlement — keep a distinct key for analytics/admin counts.
  if (plan === "Pro — Early User" || membershipIsEarlyUser(user)) return "early_user";
  if (plan === "Pro Monthly" || plan === "Pro Annual") return "pro";
  return "free";
}

function membershipBillingStatusKey(user, nowMs = Date.now()) {
  // The displayed label is the same ("Billing Review Required") whether fresh or stale;
  // the admin triage bucket still distinguishes them by the underlying signal, not by text.
  if (membershipIsBillingReviewRequired(user)) {
    return membershipPaymentFailureIsStale(user, nowMs) ? "needs_billing_review" : "payment_failed";
  }
  const status = membershipStatusDisplay(user, nowMs);
  if (status === "No paid subscription") return "never_subscribed";
  if (status === "Cancels at Trial End" || status === "Cancels at Period End") return "canceling";
  if (status === "Trial Canceled") return "canceled";
  if (status === "Trial Ended" || status === "Subscription Ended") return "ended";
  return "active";
}

function membershipTrialDaysRemaining(user, nowMs = Date.now()) {
  const endMs = parseIsoMs(user?.trialEnd) || parseIsoMs(user?.accessEndsAt);
  if (endMs === null) return null;
  const days = Math.ceil((endMs - nowMs) / 86400000);
  return days > 0 ? days : 0;
}

const STANDARD_TRIAL_DAYS = 7;

function membershipTrialLengthDays(user) {
  const startMs = parseIsoMs(user?.trialStart);
  const endMs = parseIsoMs(user?.trialEnd);
  if (startMs === null || endMs === null) return null;
  return Math.round((endMs - startMs) / 86400000);
}

function membershipPromoCodeUsed(user) {
  if (!user) return "";
  const direct = String(user.promoCodeUsed || "").trim();
  if (direct) return direct.toUpperCase();
  const first = Array.isArray(user.promoRedemptions) ? user.promoRedemptions[0] : null;
  const nested = String(first?.code || first?.promoCode || "").trim();
  return nested ? nested.toUpperCase() : "";
}

/**
 * Classify an active (or historical) trial offer for Admin clarity.
 * Standard intro trial is always 7 days. Promo / manual / legacy are separate.
 */
function classifyMembershipTrialOffer(user, nowMs = Date.now()) {
  if (!user) return null;
  const inTrial = membershipUserInTrial(user, nowMs);
  const hasHistory = membershipHasTrialHistory(user);
  if (!inTrial && !hasHistory) return null;

  const promoCode = membershipPromoCodeUsed(user);
  const promoLabel = String(user.promoLabelUsed || user.pendingPromoLabel || "").trim();
  const lengthDays = membershipTrialLengthDays(user);
  const daysRemaining = inTrial ? membershipTrialDaysRemaining(user, nowMs) : null;
  const manualDays = Number(user.manualTrialExtensionDays || 0);
  const manualMarked = Boolean(
    user.trialExtensionSource === "manual_admin"
    || user.trialExtendedManually
    || (Number.isFinite(manualDays) && manualDays > 0)
    || (user.internalAccessOverride && inTrial && !promoCode && lengthDays != null && lengthDays > STANDARD_TRIAL_DAYS + 1),
  );

  let key = "standard_7_day";
  let label = "Standard 7-Day Trial";
  let extensionSource = "standard_introductory";

  if (manualMarked) {
    key = "manually_extended";
    label = "Correct Manual Extension";
    extensionSource = "manual_admin";
  } else if (promoCode || /promo|free month|day free|try1month|trypro/i.test(promoLabel)) {
    key = "promo_extended";
    label = "Correct Promo-Extended Trial";
    extensionSource = "promo_code";
  } else if (lengthDays != null && lengthDays >= 28 && lengthDays <= 31) {
    key = "unexpected_30day";
    label = "Unexpected 30-Day Trial";
    extensionSource = "unexpected_30day";
  } else if (lengthDays != null && lengthDays > STANDARD_TRIAL_DAYS + 1) {
    key = "legacy";
    label = "Legacy Trial";
    extensionSource = "legacy_or_unknown";
  } else {
    key = "standard_7_day";
    label = "Standard 7-Day Trial";
    extensionSource = user.introductoryTrialConsumed || lengthDays === STANDARD_TRIAL_DAYS
      ? "standard_introductory"
      : "standard_or_unspecified";
  }

  return {
    key,
    label,
    inTrial,
    promoCode: promoCode || null,
    promoLabel: promoLabel || null,
    extensionSource,
    manualTrialExtensionDays: Number.isFinite(manualDays) && manualDays > 0 ? manualDays : null,
    trialStart: user.trialStart || null,
    trialEnd: user.trialEnd || null,
    trialLengthDays: lengthDays,
    daysRemaining,
    standardTrialDays: STANDARD_TRIAL_DAYS,
  };
}

/**
 * Mutually exclusive product-facing account status for banners, badges, and emails.
 * Priority: payment_failed → past_due → trial → founding → active_pro → canceled/inactive → free
 */
function membershipProductStatus(user, nowMs = Date.now()) {
  const stripeStatus = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  const subStatus = String(user?.subscriptionStatus || "").toLowerCase();
  const hasAccess = membershipHasProAccess(user, nowMs);
  const hasHistory = membershipHasSubscriptionHistory(user);

  // unpaid/past_due — fresh or historical — always show the SAME neutral "Billing Review
  // Required" label. Never "Payment Failed", never "Ended"/"Canceled". Only the admin
  // triage bucket (key/adminKey) and whether to keep nagging the end user (banner/cta)
  // differ based on staleness — never the displayed label text.
  if (membershipIsBillingReviewRequired(user)) {
    const stale = membershipPaymentFailureIsStale(user, nowMs);
    return {
      key: stale ? "needs_billing_review" : "payment_failed",
      adminKey: stale ? "needs_billing_review" : "payment_failed",
      label: BILLING_REVIEW_REQUIRED_LABEL,
      emoji: "🟤",
      tone: "review",
      hasProAccess: false,
      daysRemaining: null,
      banner: stale ? null : "billing_review_required",
      cta: stale ? null : "update_payment",
      detail: stale
        ? `A payment issue was recorded, but Stripe has not sent a follow-up update in over `
          + `${PAYMENT_FAILURE_STALE_DAYS} days and no retry is currently scheduled. This may `
          + `already be resolved, canceled, or still pending on Stripe's side — an admin should `
          + `verify the current Stripe status before taking any action. Access remains on the `
          + `Free Plan either way.`
        : "Stripe reports an unresolved billing issue on this subscription. Update your payment "
          + "method to keep Pro access — an admin may also need to verify the current Stripe status.",
      planLabel: "Free Plan (locked)",
      currentAccess: "free",
      stripeSubscriptionStatus: user?.stripeSubscriptionStatus || "",
      lastFailedPaymentAt: user?.lastFailedPaymentAt || "",
      nextPaymentRetryAt: user?.nextPaymentRetryAt || "",
    };
  }

  if (hasAccess && membershipUserInTrial(user, nowMs)) {
    const days = membershipTrialDaysRemaining(user, nowMs);
    const dayLabel = days === null ? "Trial" : days === 1 ? "Trial (1 Day Remaining)" : `Trial (${days} Days Remaining)`;
    return {
      key: "trial",
      adminKey: "trial",
      label: dayLabel,
      emoji: "🟡",
      tone: "info",
      hasProAccess: true,
      daysRemaining: days,
      banner: null,
      cta: null,
      detail: days === null
        ? "You are currently in a Pro trial."
        : `Your trial ends in ${days} day${days === 1 ? "" : "s"}.`,
      planLabel: "Trial",
    };
  }

  if (hasAccess && membershipFoundingActive(user, nowMs)) {
    const canceling = Boolean(user?.cancelAtPeriodEnd);
    return {
      key: "active_founding",
      adminKey: "founding",
      label: "Active Founding Member",
      emoji: "🟢",
      tone: "success",
      hasProAccess: true,
      daysRemaining: null,
      banner: null,
      cta: null,
      detail: canceling
        ? `Founding Member access continues until ${user?.accessEndsAt || user?.currentPeriodEnd || "period end"}.`
        : "Your Founding Member subscription is active.",
      planLabel: "Founding Member",
    };
  }

  if (hasAccess) {
    const canceling = Boolean(user?.cancelAtPeriodEnd);
    const isEarlyUser = membershipIsEarlyUser(user) && user?.subscriptionCadence !== "annual";
    return {
      key: isEarlyUser ? "active_early_user" : "active_pro",
      adminKey: "active",
      label: isEarlyUser ? "Active Early User" : "Active Pro",
      emoji: "🟢",
      tone: "success",
      hasProAccess: true,
      daysRemaining: null,
      banner: null,
      cta: null,
      detail: canceling
        ? `${isEarlyUser ? "Early User" : "Pro"} access continues until ${user?.accessEndsAt || user?.currentPeriodEnd || "period end"}.`
        : (isEarlyUser
          ? "Your Early User Pro subscription is active at $13.99/month."
          : "Your Pro subscription is active."),
      planLabel: membershipPlanDisplay(user, nowMs),
    };
  }

  if (hasHistory) {
    const canceled = subStatus.includes("cancel") || stripeStatus === "canceled";
    return {
      key: "inactive",
      adminKey: canceled ? "canceled" : "canceled",
      label: "Subscription Inactive",
      emoji: "🔴",
      tone: "danger",
      hasProAccess: false,
      daysRemaining: null,
      banner: "access_lost",
      cta: "reactivate",
      detail: "Your subscription is no longer active and your account is on the Free Plan. Your saved data is safe.",
      planLabel: "Free Plan",
    };
  }

  return {
    key: "free",
    adminKey: "free",
    label: "Free Plan",
    emoji: "⚪",
    tone: "neutral",
    hasProAccess: false,
    daysRemaining: null,
    banner: null,
    cta: "upgrade",
    detail: "You are on the Free Plan.",
    planLabel: "Free Plan",
  };
}

/** Admin audit buckets — mutually exclusive counts. */
function membershipAdminAuditKey(user, nowMs = Date.now()) {
  return membershipProductStatus(user, nowMs).adminKey;
}

function membershipAdminAuditBuckets(users = [], nowMs = Date.now()) {
  const buckets = {
    active: 0,
    trial: 0,
    free: 0,
    past_due: 0,
    payment_failed: 0,
    needs_billing_review: 0,
    canceled: 0,
    founding: 0,
  };
  (users || []).forEach((user) => {
    const key = membershipAdminAuditKey(user, nowMs);
    if (Object.prototype.hasOwnProperty.call(buckets, key)) buckets[key] += 1;
    else buckets.free += 1;
  });
  return buckets;
}

function planKeyFromStripePriceHints(subscription, user = {}) {
  const items = subscription?.items?.data || [];
  for (const item of items) {
    const priceId = String(item?.price?.id || item?.plan?.id || "").trim();
    if (priceId && user?.__priceIdToPlanKey?.[priceId]) return user.__priceIdToPlanKey[priceId];
    const nickname = String(item?.price?.nickname || item?.plan?.nickname || "").toLowerCase();
    const offerMeta = String(item?.price?.metadata?.offer || "").toLowerCase();
    if (nickname.includes("founding") || offerMeta === "founding") return "founding";
    if (nickname.includes("early") || offerMeta === "early_user") return "early_user";
    if (nickname.includes("staff") || offerMeta === "staff_plan" || offerMeta === "staff") return "staff";
    if (nickname.includes("annual") || nickname.includes("yearly")) return "annual";
    const amount = Number(item?.price?.unit_amount ?? item?.plan?.amount);
    if (Number.isFinite(amount)) {
      if (amount === 999) return "founding";
      if (amount === 1399) return "early_user";
      if (amount === 2999) return "staff";
      if (amount === 19900) return "annual";
      if (amount === 1999) return "monthly";
    }
  }
  return "";
}

function planKeyFromStripeSubscription(subscription, user = {}) {
  const metadataPlan = String(subscription?.metadata?.plan || "").trim().toLowerCase();
  const valid = { founding: true, monthly: true, annual: true, early_user: true, staff: true };
  if (valid[metadataPlan]) return metadataPlan;

  const hinted = planKeyFromStripePriceHints(subscription, user);
  if (valid[hinted]) return hinted;

  const pendingPlan = String(user?.pendingPlan || "").trim().toLowerCase();
  if (valid[pendingPlan]) return pendingPlan;

  // Never demote a continuously active founding member when Stripe did not
  // explicitly signal a Pro monthly/annual price change.
  if (user?.foundingMemberActive || String(user?.plan || "").trim() === "Founding") {
    return "founding";
  }

  // Preserve Early User billing identity from stored offer markers when Stripe
  // payload is incomplete (renewal webhooks must not depend on the promo flag).
  if (membershipIsEarlyUser(user) && user?.subscriptionCadence !== "annual") {
    return "early_user";
  }

  if (membershipIsStaffPlan(user) && user?.subscriptionCadence !== "annual") {
    return "staff";
  }

  if (user?.subscriptionCadence === "annual") return "annual";
  return "monthly";
}

function stripeSubscriptionToMembershipUpdates(subscription, user = {}, eventType = "updated") {
  const stripeStatus = String(subscription?.status || "").toLowerCase();
  const periodEndIso = subscription?.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : "";
  const trialEndIso = subscription?.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : "";
  const accessEndsAt = stripeStatus === "trialing" && trialEndIso ? trialEndIso : periodEndIso;
  const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end);
  const nowMs = Date.now();
  const previousStripeStatus = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  const previousTrialStatus = String(user?.trialStatus || "").toLowerCase();
  const previousStatus = String(user?.subscriptionStatus || "").toLowerCase();
  const endedDuringTrial = stripeStatus === "trialing"
    || previousStripeStatus === "trialing"
    || (previousTrialStatus.includes("in trial") && previousStatus.includes("trial"));
  // Confirmed Stripe status mapping: "unpaid" and "past_due" are NEVER canceled/ended.
  // Only a verified customer.subscription.deleted event, or a live Stripe status of
  // literally "canceled", may ever produce "Subscription Ended"/"Trial Ended" here. The
  // period-elapsed fallback below is explicitly excluded for unpaid/past_due so a
  // naturally-past current_period_end on an unpaid subscription can never masquerade as
  // "ended" either.
  const ended = eventType === "deleted"
    || stripeStatus === "canceled"
    || (
      stripeStatus !== "unpaid"
      && stripeStatus !== "past_due"
      && Boolean(accessEndsAt)
      && parseIsoMs(accessEndsAt) <= nowMs
    );

  const planKey = planKeyFromStripeSubscription(subscription, user);
  const wasFounding = Boolean(user.foundingMemberActive || user.foundingMemberHistorical || user.foundingMember || user.plan === "Founding");
  const base = {
    stripeSubscriptionStatus: subscription?.status || "",
    stripeSubscriptionId: subscription?.id || user.stripeSubscriptionId || "",
    currentPeriodEnd: periodEndIso,
    accessEndsAt,
    cancelAtPeriodEnd,
    trialStart: subscription?.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : user.trialStart || "",
    trialEnd: trialEndIso || user.trialEnd || "",
    lastStripeSyncAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (ended) {
    const endedAt = accessEndsAt && parseIsoMs(accessEndsAt) <= nowMs
      ? accessEndsAt
      : new Date().toISOString();
    const previousPlan = endedDuringTrial
      ? "Pro Trial"
      : (user.foundingMemberActive || user.plan === "Founding" ? "Founding Member" : "Pro");
    return {
      ...base,
      plan: "Free",
      subscriptionCadence: "",
      subscriptionStatus: endedDuringTrial ? "Trial Ended" : "Subscription Ended",
      monthlyPrice: "$0/month",
      foundingMemberActive: false,
      foundingMemberHistorical: wasFounding,
      foundingMember: wasFounding,
      trialStatus: endedDuringTrial ? (cancelAtPeriodEnd ? "Trial Canceled" : "Trial Ended") : user.trialStatus || "",
      previousPlan,
      subscriptionEndedAt: endedAt,
    };
  }

  // Past due / unpaid: keep historical founding markers but lock Pro/Founding access.
  // Plan display must not look like an active paid plan while access is denied. Neither
  // status is ever "ended"/"canceled" (see the ended check above) — both surface as the
  // single neutral "Billing Review Required" label, never "Payment Failed"/"Past Due".
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") {
    return {
      ...base,
      plan: "Free",
      subscriptionCadence: user.subscriptionCadence || "",
      subscriptionStatus: "Billing Review Required — Access Locked",
      monthlyPrice: "$0/month",
      foundingMemberActive: false,
      foundingMemberHistorical: wasFounding,
      foundingMember: wasFounding,
      trialStatus: user.trialStatus || "",
      previousPlan: wasFounding ? "Founding Member" : "Pro",
    };
  }

  const inTrial = stripeStatus === "trialing";
  const isFoundingCheckout = planKey === "founding";
  const isEarlyUserCheckout = planKey === "early_user";
  const isStaffCheckout = planKey === "staff";
  const plan = isFoundingCheckout ? "Founding" : "Pro";
  const cadence = planKey === "annual" ? "annual" : "monthly";
  const monthlyPrice = isFoundingCheckout
    ? "$9.99/month"
    : planKey === "annual"
      ? "$199/year"
      : isEarlyUserCheckout
        ? "$13.99/month"
        : isStaffCheckout
          ? "$29.99/month"
          : "$19.99/month";

  let subscriptionStatus;
  if (cancelAtPeriodEnd) {
    const endMs = parseIsoMs(accessEndsAt);
    const endLabel = endMs != null ? new Date(endMs).toLocaleDateString() : "period end";
    subscriptionStatus = inTrial
      ? `Canceled — Access Ends ${endLabel} (Trial — no future charge)`
      : `Canceled — Access Ends ${endLabel}`;
  } else if (inTrial) {
    subscriptionStatus = isFoundingCheckout
      ? "Founding Member Subscription Trialing"
      : isEarlyUserCheckout
        ? "Pro Early User Subscription Trialing"
        : isStaffCheckout
          ? "Staff Plan Subscription Trialing"
          : "Pro Monthly Subscription Trialing";
  } else if (isFoundingCheckout) {
    subscriptionStatus = "Founding Member Subscription Active";
  } else if (planKey === "annual") {
    subscriptionStatus = "Pro Annual Subscription Active";
  } else if (isEarlyUserCheckout) {
    subscriptionStatus = "Pro Early User Subscription Active";
  } else if (isStaffCheckout) {
    subscriptionStatus = "Staff Plan Subscription Active";
  } else {
    subscriptionStatus = "Pro Monthly Subscription Active";
  }

  return {
    ...base,
    plan,
    subscriptionCadence: cadence,
    subscriptionStatus,
    monthlyPrice,
    billingOffer: isEarlyUserCheckout
      ? "early_user"
      : isFoundingCheckout
        ? "founding"
        : isStaffCheckout
          ? "staff_plan"
          : (planKey === "annual" ? "pro_annual" : "pro_monthly"),
    planDisplayName: isFoundingCheckout
      ? "Founding Member"
      : isEarlyUserCheckout
        ? "Pro — Early User"
        : isStaffCheckout
          ? "Staff Plan"
          : planKey === "annual"
            ? "Pro Annual"
            : "Pro",
    foundingMemberActive: isFoundingCheckout,
    foundingMemberHistorical: wasFounding || isFoundingCheckout,
    foundingMember: wasFounding || isFoundingCheckout,
    trialStatus: inTrial ? "In Trial" : (user.trialStatus === "In Trial" ? "Trial Ended" : user.trialStatus || ""),
    // Once Stripe starts an introductory trial, mark it consumed so it cannot be re-granted.
    introductoryTrialConsumed: Boolean(user.introductoryTrialConsumed) || inTrial || Boolean(base.trialStart),
    priceLock: isFoundingCheckout ? "Lifetime" : (isEarlyUserCheckout ? "Early User" : ""),
    internalAccessOverride: false,
    manualAccessGranted: false,
  };
}

module.exports = {
  PAYMENT_FAILURE_STALE_DAYS,
  BILLING_REVIEW_REQUIRED_LABEL,
  PAYMENT_FAILURE_NEEDS_REVIEW_LABEL,
  STANDARD_TRIAL_DAYS,
  membershipIsBillingReviewRequired,
  membershipPaymentFailureIsStale,
  membershipBillingReviewSnapshot,
  membershipHasProAccess,
  membershipUserInTrial,
  membershipFoundingActive,
  membershipFoundingHistorical,
  membershipIsEarlyUser,
  membershipIsStaffPlan,
  membershipPlanDisplay,
  membershipStatusDisplay,
  membershipHasTrialHistory,
  membershipHasSubscriptionHistory,
  membershipPreviousPlanDisplay,
  membershipCurrentAccessKey,
  membershipBillingStatusKey,
  membershipTrialDaysRemaining,
  membershipTrialLengthDays,
  membershipPromoCodeUsed,
  classifyMembershipTrialOffer,
  membershipProductStatus,
  membershipAdminAuditKey,
  membershipAdminAuditBuckets,
  planKeyFromStripeSubscription,
  stripeSubscriptionToMembershipUpdates,
  accessEndMs,
};
