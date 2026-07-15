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
 * - foundingMemberHistorical / foundingMemberNumber may remain after cancel; they do NOT grant paid access.
 * - Former founding members are NOT auto-routed to the $9.99 Stripe price on return.
 * - Admin may intentionally restore $9.99 via foundingMemberActive + restoreFoundingPrice override.
 * - Numbered spots (50 total) are retained by original accounts; canceling releases access but NOT the spot
 *   to new users — foundingMembers[] keeps the email so the 50 legitimate accounts stay fixed.
 */

function parseIsoMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function stripeStatusIsPaidAccess(status = "") {
  const s = String(status || "").toLowerCase();
  return s === "active" || s === "trialing";
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

  if (subStatus.includes("payment failed") || subStatus.includes("failed") || stripeStatus === "unpaid") {
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
  if (trialStatus.includes("in trial")) return true;
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
  if (user?.internalAccessOverride && membershipHasProAccess(user, nowMs)) return "Manual Access";
  const stripeStatus = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  const status = String(user?.subscriptionStatus || "").toLowerCase();

  if (status.includes("payment failed") || stripeStatus === "unpaid") return "Payment Failed";
  if (status.includes("past due") || stripeStatus === "past_due") return "Past Due";

  const hasAccess = membershipHasProAccess(user, nowMs);
  const cancelScheduled = Boolean(user?.cancelAtPeriodEnd) || status.includes("access ends");
  const trialEndMs = parseIsoMs(user?.trialEnd) || parseIsoMs(user?.accessEndsAt);
  const stripeTrialActive = stripeStatus === "trialing" && (trialEndMs === null || trialEndMs > nowMs);
  const billingActive = stripeStatus === "active" || stripeTrialActive || hasAccess;

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
  if (status === "No paid subscription") return "never_subscribed";
  if (status === "Cancels at Trial End" || status === "Cancels at Period End") return "canceling";
  if (status === "Trial Canceled") return "canceled";
  if (status === "Trial Ended" || status === "Subscription Ended") return "ended";
  if (status === "Past Due" || status === "Payment Failed") return "payment_failed";
  return "active";
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

  const inTrial = stripeStatus === "trialing";
  const isFoundingCheckout = planKey === "founding";
  const plan = isFoundingCheckout ? "Founding" : "Pro";
  const cadence = planKey === "annual" ? "annual" : "monthly";
  const monthlyPrice = isFoundingCheckout ? "$9.99/month" : planKey === "annual" ? "$199/year" : "$19.99/month";

  let subscriptionStatus;
  if (cancelAtPeriodEnd) {
    const endLabel = new Date(accessEndsAt).toLocaleDateString();
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
  };
}

module.exports = {
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
  planKeyFromStripeSubscription,
  stripeSubscriptionToMembershipUpdates,
  accessEndMs,
};
