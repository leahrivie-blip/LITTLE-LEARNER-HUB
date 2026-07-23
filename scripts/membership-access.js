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
 * - $9.99/month for life only while the founding subscription stays continuously active.
 * - foundingMemberHistorical / foundingMemberNumber may remain after cancel of a *paid* founding cycle;
 *   they do NOT grant paid access, and former paid founding members are NOT auto-routed to $9.99 on return.
 * - Admin may intentionally restore $9.99 via foundingMemberActive + restoreFoundingPrice override.
 * - Promo / free-month signups reserve a Founding spot immediately. If the member cancels before the
 *   first paid billing cycle, the reserved spot is released back into inventory.
 * - After the first successful paid invoice, canceling ends access at period end but keeps the
 *   numbered spot (foundingMembers[]) so the original 50 paid founding accounts stay fixed.
 *
 * STALE PAYMENT-FAILURE LABEL POLICY
 * - "Payment Failed" / "Past Due" are event-driven labels set only by Stripe webhooks
 *   (invoice.payment_failed, customer.subscription.updated). There is no polling
 *   reconciliation, so if Stripe never sends a follow-up event (e.g. it leaves the
 *   subscription "unpaid" indefinitely instead of canceling it, or a later webhook is
 *   missed), the label can persist forever even though access was already correctly
 *   revoked and the account is effectively Free.
 * - This does NOT affect access: membershipHasProAccess already denies access for
 *   payment_failed/past_due regardless of staleness, and continues to do so.
 * - IMPORTANT: elapsed time alone is NEVER proof that a subscription was actually
 *   canceled or ended. An old unpaid invoice is not the same thing as a confirmed
 *   cancellation — only a verified Stripe event (webhook) or an explicit admin-authorized
 *   reconciliation may ever write "Subscription Ended"/"canceled" to a user record.
 * - membershipPaymentFailureIsStale() therefore never produces "Subscription Ended". Once
 *   Stripe's retry window has clearly closed (no pending nextPaymentRetryAt, no newer
 *   successful payment) and enough time (PAYMENT_FAILURE_STALE_DAYS) has passed since the
 *   failure, the *display* label instead becomes the neutral, non-conclusive
 *   PAYMENT_FAILURE_NEEDS_REVIEW_LABEL — flagging it for a human to verify against Stripe,
 *   without asserting a conclusion the app cannot actually confirm. This is a label change
 *   only; it never writes to the store and never changes access.
 * - A missing lastFailedPaymentAt timestamp is never treated as stale — the label only
 *   moves to "needs review" based on positive evidence (a real recorded failure date).
 */

// Stripe's default Smart Retries schedule finishes well inside this window; once it has
// passed with no scheduled retry and no recovery, the failure is old enough to flag for
// manual review — but that elapsed time never implies the subscription was canceled/ended.
const PAYMENT_FAILURE_STALE_DAYS = 21;

// Neutral, non-conclusive label shown once a payment failure is stale. Deliberately does
// NOT say "Ended" or "Canceled" — only a verified Stripe event may ever assert that.
const PAYMENT_FAILURE_NEEDS_REVIEW_LABEL = "Historical payment failure — Stripe status needs review";

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
function membershipPaymentFailureIsStale(user, nowMs = Date.now()) {
  const stripeStatus = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  const subStatus = String(user?.subscriptionStatus || "").toLowerCase();
  const isFailedSignal = subStatus.includes("payment failed")
    || stripeStatus === "unpaid"
    || subStatus.includes("past due")
    || stripeStatus === "past_due";
  if (!isFailedSignal) return false;

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

  if (subStatus.includes("payment failed") || stripeStatus === "unpaid") {
    return false;
  }
  if (subStatus.includes("past due") || stripeStatus === "past_due") {
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

function membershipPlanDisplay(user, nowMs = Date.now()) {
  if (!membershipHasProAccess(user, nowMs)) return "Free";
  if (membershipUserInTrial(user, nowMs)) return "Trial";
  if (membershipFoundingActive(user, nowMs)) return "Founding Member";
  if (user?.subscriptionCadence === "annual") return "Pro Annual";
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

  // A verified Stripe event (customer.subscription.updated/deleted, or the equivalent
  // Stripe backfill path) already concluded "Subscription Ended"/"Trial Ended" — do not
  // let a leftover raw stripeSubscriptionStatus echo ("unpaid"/"past_due") resurrect a
  // Payment Failed/Past Due alert for an account that has already been correctly
  // downgraded. (subscriptionStatus "ended" is a real conclusion, not an inference from
  // elapsed time — this is different from, and takes priority over, the staleness check.)
  const alreadyConcluded = status.includes("ended");
  if (!alreadyConcluded) {
    // Stale is never promoted to "ended"/"canceled" — only flagged as unverified.
    if (membershipPaymentFailureIsStale(user, nowMs)) return PAYMENT_FAILURE_NEEDS_REVIEW_LABEL;
    if (status.includes("payment failed") || stripeStatus === "unpaid") return "Payment Failed";
    if (status.includes("past due") || stripeStatus === "past_due") return "Past Due";
  }

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
  const status = membershipStatusDisplay(user, nowMs);
  if (status === "Past Due" || status === "Payment Failed") return "past_due";
  const plan = membershipPlanDisplay(user, nowMs);
  if (plan === "Trial") return "trial";
  if (plan === "Founding Member") return "founding";
  if (plan === "Pro Monthly" || plan === "Pro Annual") return "pro";
  return "free";
}

function membershipBillingStatusKey(user, nowMs = Date.now()) {
  const status = membershipStatusDisplay(user, nowMs);
  if (status === PAYMENT_FAILURE_NEEDS_REVIEW_LABEL) return "needs_billing_review";
  if (status === "No paid subscription") return "never_subscribed";
  if (status === "Cancels at Trial End" || status === "Cancels at Period End") return "canceling";
  if (status === "Trial Canceled") return "canceled";
  if (status === "Trial Ended" || status === "Subscription Ended") return "ended";
  if (status === "Past Due" || status === "Payment Failed") return "payment_failed";
  return "active";
}

function membershipTrialDaysRemaining(user, nowMs = Date.now()) {
  const endMs = parseIsoMs(user?.trialEnd) || parseIsoMs(user?.accessEndsAt);
  if (endMs === null) return null;
  const days = Math.ceil((endMs - nowMs) / 86400000);
  return days > 0 ? days : 0;
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

  // A verified Stripe event already concluded "Subscription Ended"/"Trial Ended" for
  // this account — don't let a leftover raw stripeSubscriptionStatus echo ("unpaid"/
  // "past_due") resurrect a Payment Failed alert for an account already correctly
  // downgraded to Free. See membershipStatusDisplay for the matching gate.
  const alreadyConcluded = subStatus.includes("ended");

  // Stale failure: flag for human review. Never assert "ended"/"canceled" from elapsed
  // time alone — that conclusion requires a verified Stripe event or admin reconciliation.
  if (!alreadyConcluded && membershipPaymentFailureIsStale(user, nowMs)) {
    return {
      key: "needs_billing_review",
      adminKey: "needs_billing_review",
      label: PAYMENT_FAILURE_NEEDS_REVIEW_LABEL,
      emoji: "🟤",
      tone: "review",
      hasProAccess: false,
      daysRemaining: null,
      banner: null,
      cta: null,
      detail: `A payment failure was recorded, but Stripe has not sent a follow-up update in `
        + `over ${PAYMENT_FAILURE_STALE_DAYS} days and no retry is currently scheduled. This may `
        + `already be resolved, canceled, or still pending on Stripe's side — an admin should `
        + `verify the current Stripe status before taking any action. Access remains on the `
        + `Free Plan either way.`,
      planLabel: "Free Plan",
      currentAccess: "free",
      stripeSubscriptionStatus: user?.stripeSubscriptionStatus || "",
      lastFailedPaymentAt: user?.lastFailedPaymentAt || "",
      nextPaymentRetryAt: user?.nextPaymentRetryAt || "",
    };
  }

  if (!alreadyConcluded && (subStatus.includes("payment failed") || stripeStatus === "unpaid")) {
    return {
      key: "payment_failed",
      adminKey: "payment_failed",
      label: "Payment Failed",
      emoji: "🟠",
      tone: "warning",
      hasProAccess: false,
      daysRemaining: null,
      banner: "payment_failed",
      cta: "update_payment",
      detail: "Your recent payment could not be processed. Update your payment method to keep Pro access.",
      planLabel: "Free Plan (locked)",
    };
  }

  if (!alreadyConcluded && (subStatus.includes("past due") || stripeStatus === "past_due")) {
    return {
      key: "past_due",
      adminKey: "past_due",
      label: "Payment Failed",
      emoji: "🟠",
      tone: "warning",
      hasProAccess: false,
      daysRemaining: null,
      banner: "payment_failed",
      cta: "update_payment",
      detail: "Your recent payment could not be processed. Your Pro access will expire if payment is not updated.",
      planLabel: "Free Plan (locked)",
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
    return {
      key: "active_pro",
      adminKey: "active",
      label: "Active Pro",
      emoji: "🟢",
      tone: "success",
      hasProAccess: true,
      daysRemaining: null,
      banner: null,
      cta: null,
      detail: canceling
        ? `Pro access continues until ${user?.accessEndsAt || user?.currentPeriodEnd || "period end"}.`
        : "Your Pro subscription is active.",
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
    if (nickname.includes("founding")) return "founding";
    if (nickname.includes("annual") || nickname.includes("yearly")) return "annual";
    const amount = Number(item?.price?.unit_amount ?? item?.plan?.amount);
    if (Number.isFinite(amount)) {
      if (amount === 999) return "founding";
      if (amount === 19900) return "annual";
      if (amount === 1999) return "monthly";
    }
  }
  return "";
}

function planKeyFromStripeSubscription(subscription, user = {}) {
  const metadataPlan = String(subscription?.metadata?.plan || "").trim().toLowerCase();
  const valid = { founding: true, monthly: true, annual: true };
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
  const ended = eventType === "deleted"
    || stripeStatus === "canceled"
    || stripeStatus === "unpaid"
    || (accessEndsAt && parseIsoMs(accessEndsAt) <= nowMs);

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
  // Plan display must not look like an active paid plan while access is denied.
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") {
    return {
      ...base,
      plan: "Free",
      subscriptionCadence: user.subscriptionCadence || "",
      subscriptionStatus: stripeStatus === "unpaid" ? "Payment Failed — Access Locked" : "Past Due — Access Locked",
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
  const plan = isFoundingCheckout ? "Founding" : "Pro";
  const cadence = planKey === "annual" ? "annual" : "monthly";
  const monthlyPrice = isFoundingCheckout ? "$9.99/month" : planKey === "annual" ? "$199/year" : "$19.99/month";

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
      : "Pro Monthly Subscription Trialing";
  } else if (isFoundingCheckout) {
    subscriptionStatus = "Founding Member Subscription Active";
  } else if (planKey === "annual") {
    subscriptionStatus = "Pro Annual Subscription Active";
  } else {
    subscriptionStatus = "Pro Monthly Subscription Active";
  }

  return {
    ...base,
    plan,
    subscriptionCadence: cadence,
    subscriptionStatus,
    monthlyPrice,
    foundingMemberActive: isFoundingCheckout,
    foundingMemberHistorical: wasFounding || isFoundingCheckout,
    foundingMember: wasFounding || isFoundingCheckout,
    trialStatus: inTrial ? "In Trial" : (user.trialStatus === "In Trial" ? "Trial Ended" : user.trialStatus || ""),
    priceLock: isFoundingCheckout ? "Lifetime" : user.priceLock || "",
    internalAccessOverride: false,
    manualAccessGranted: false,
  };
}

module.exports = {
  PAYMENT_FAILURE_STALE_DAYS,
  PAYMENT_FAILURE_NEEDS_REVIEW_LABEL,
  membershipPaymentFailureIsStale,
  membershipBillingReviewSnapshot,
  membershipHasProAccess,
  membershipUserInTrial,
  membershipFoundingActive,
  membershipFoundingHistorical,
  membershipPlanDisplay,
  membershipStatusDisplay,
  membershipHasTrialHistory,
  membershipHasSubscriptionHistory,
  membershipPreviousPlanDisplay,
  membershipCurrentAccessKey,
  membershipBillingStatusKey,
  membershipTrialDaysRemaining,
  membershipProductStatus,
  membershipAdminAuditKey,
  membershipAdminAuditBuckets,
  planKeyFromStripeSubscription,
  stripeSubscriptionToMembershipUpdates,
  accessEndMs,
};
