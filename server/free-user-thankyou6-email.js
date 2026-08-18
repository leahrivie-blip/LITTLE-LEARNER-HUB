/**
 * One-time Free User thank-you campaign — THANKYOU6.
 *
 * Safety:
 * - Dry-run / preview / test-to-owner never send the production list.
 * - Production send requires confirmPhrase === "SEND_THANKYOU6_CAMPAIGN"
 *   plus confirm:true, dryRunToken, confirmationToken, and the owner warning.
 * - Never auto-sends on deploy or module load.
 * - NODE_ENV=test blocks production send unless allowTestHarnessSend is set.
 * - Per-recipient already-received guard + campaign-level sentAt.
 * - Does not modify subscriptions, access, or Free/Pro records.
 * - Does not require EMAIL_AUTOMATIONS_ENABLED.
 */

const crypto = require("crypto");
const membershipAccess = require("../scripts/membership-access.js");
const testAccountGuard = require("./test-account-guard.js");
const {
  looksLikeTestEmail,
  looksMalformedEmail,
  isKnownBouncedEmail,
} = require("./free-user-welcome-email.js");
const thankYou6Checkout = require("./thankyou6-checkout.js");
const activityScore = require("./thankyou6-activity-score.js");
const thankYou6Eligibility = require("./thankyou6-eligibility.js");

const CONFIRM_PHRASE = "SEND_THANKYOU6_CAMPAIGN";
const CAMPAIGN_ID = thankYou6Checkout.CAMPAIGN_ID;
const CAMPAIGN_NAME = "Free User Thank You — THANKYOU6";
const TEMPLATE_KEY = "free_user_thankyou6_aug2026";
const EMAIL_SUBJECT = "A little thank-you from Little Learner Hub 💛";
const OFFER_LABEL = "$6 off first month";
const OFFER_EXPIRES_LABEL = "August 25, 2026 at 11:59 PM CDT";
const OFFER_EXPIRES_AT_MS = Date.parse("2026-08-26T04:59:59.000Z");
const PROMO_CODE = "THANKYOU6";
const SELECT_LIMIT = activityScore.SELECT_LIMIT;
const CHECKOUT_PLAN = thankYou6Checkout.CHECKOUT_PLAN;
const CHECKOUT_PRICE_ENV = thankYou6Checkout.CHECKOUT_PRICE_ENV;
const EXCLUDED_PRICE_ENV = thankYou6Checkout.EXCLUDED_PRICE_ENV;
const CONFIRMATION_WARNING = "You are about to send the THANKYOU6 promotion to 25 Free users.";

function defaultCampaignState() {
  return {
    campaignId: CAMPAIGN_ID,
    preparedAt: "",
    preparedRecipientCount: 0,
    preparedSubject: "",
    dryRunToken: "",
    dryRunAt: "",
    confirmationToken: "",
    confirmationAt: "",
    testSentAt: "",
    testRecipient: "",
    sentAt: "",
    recipientCount: 0,
    attemptedCount: 0,
    sentCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    bouncedCount: 0,
    openedCount: 0,
    clickedCount: 0,
    softSkippedCount: 0,
    skippedAlreadyReceivedCount: 0,
    deliveries: [],
    failures: [],
    skipped: [],
    recipientReceipts: {},
    messageIdIndex: {},
    lastDryRunSummary: null,
    lastConfirmationScreen: null,
    lastPostSendReport: null,
    webhookEvents: [],
    inAppPreparedAt: "",
    inAppDryRunToken: "",
    inAppDryRunAt: "",
    inAppConfirmationToken: "",
    inAppSentAt: "",
    inAppRecipientCount: 0,
    inAppDeliveries: [],
    lastInAppDryRunSummary: null,
    lastInAppPostSendReport: null,
  };
}

function looksDisposableEmail(email) {
  const domain = String(email || "").trim().toLowerCase().split("@")[1] || "";
  return /(mailinator|tempmail|guerrillamail|yopmail|trashmail)/i.test(domain);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstNameOf(user) {
  const raw = String(user?.firstName || user?.name || user?.displayName || "").trim();
  if (!raw) return "";
  return raw.split(/\s+/)[0];
}

function greetingName(user) {
  return firstNameOf(user) || "there";
}

function emailPrefs(user) {
  const prefs = user?.emailPrefs && typeof user.emailPrefs === "object" ? user.emailPrefs : {};
  return {
    marketing: prefs.marketing !== false,
    unsubscribedAt: prefs.unsubscribedAt || "",
  };
}

function ensureCampaignState(store) {
  if (!store.emailEngagement || typeof store.emailEngagement !== "object") {
    store.emailEngagement = { settings: {}, events: [] };
  }
  const eng = store.emailEngagement;
  eng.settings = eng.settings || {};
  if (!eng.settings.freeUserThankYou6 || typeof eng.settings.freeUserThankYou6 !== "object") {
    eng.settings.freeUserThankYou6 = defaultCampaignState();
  } else {
    const defaults = defaultCampaignState();
    const current = eng.settings.freeUserThankYou6;
    for (const [key, value] of Object.entries(defaults)) {
      if (current[key] === undefined) current[key] = value;
    }
  }
  const state = eng.settings.freeUserThankYou6;
  state.recipientReceipts = state.recipientReceipts && typeof state.recipientReceipts === "object"
    ? state.recipientReceipts
    : {};
  state.messageIdIndex = state.messageIdIndex && typeof state.messageIdIndex === "object"
    ? state.messageIdIndex
    : {};
  state.webhookEvents = Array.isArray(state.webhookEvents) ? state.webhookEvents : [];
  state.deliveries = Array.isArray(state.deliveries) ? state.deliveries : [];
  state.failures = Array.isArray(state.failures) ? state.failures : [];
  state.skipped = Array.isArray(state.skipped) ? state.skipped : [];
  eng.events = Array.isArray(eng.events) ? eng.events : [];
  return state;
}

function channelReceiptOf(state, email, channel = "email") {
  const receipt = state?.recipientReceipts?.[normalizeEmail(email)];
  if (!receipt || typeof receipt !== "object") return null;
  if (channel === "in_app") {
    return receipt.in_app && typeof receipt.in_app === "object" ? receipt.in_app : null;
  }
  if (receipt.email && typeof receipt.email === "object") return receipt.email;
  return receipt;
}

function alreadyReceived(state, email, channel = "email") {
  if (!state || channel === "none") return false;
  const receipt = channelReceiptOf(state, email, channel);
  return Boolean(receipt?.sentAt || receipt?.messageId || receipt?.notificationId);
}

function hasActivePaidStripe(user) {
  const stripe = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  return ["active", "trialing", "past_due", "unpaid"].includes(stripe);
}

function looksCenterPaid(user) {
  const blob = [
    user?.plan,
    user?.planDisplayName,
    user?.billingOffer,
    user?.subscriptionCadence,
    user?.priceLock,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return blob.includes("center") && membershipAccess.membershipHasProAccess(user);
}

function hasConvertedToPaid(user) {
  if (user?.lastSuccessfulPaymentAt || user?.firstPaidInvoiceAt) return true;
  if (user?.foundingMemberNumber || user?.foundingMemberHistorical || user?.foundingMember) return true;
  if (membershipAccess.membershipIsEarlyUser(user)) return true;
  if (String(user?.subscriptionCadence || "").toLowerCase() === "annual") return true;
  if (looksCenterPaid(user)) return true;
  const stripe = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  if (user?.stripeSubscriptionId && ["active", "trialing", "past_due", "unpaid"].includes(stripe)) return true;
  if (user?.lastSuccessfulPaymentAt) return true;
  return false;
}

function isGrandfatheredPaid(user) {
  if (membershipAccess.membershipFoundingActive(user)) return true;
  if (user?.foundingMemberActive) return true;
  if (user?.internalAccessOverride === true && membershipAccess.membershipHasProAccess(user)) return true;
  if (user?.manualAccessGranted === true && membershipAccess.membershipHasProAccess(user)) return true;
  const lock = String(user?.priceLock || "").toLowerCase();
  if ((lock === "lifetime" || lock.includes("founding")) && membershipAccess.membershipHasProAccess(user)) {
    return true;
  }
  return false;
}

function accountStatusLabel(user, nowMs = Date.now()) {
  if (String(user?.accountStatus || "").toLowerCase() === "disabled" || user?.disabled === true) {
    return "Disabled";
  }
  if (typeof membershipAccess.membershipStatusDisplay === "function") {
    return membershipAccess.membershipStatusDisplay(user, nowMs);
  }
  return String(user?.subscriptionStatus || user?.stripeSubscriptionStatus || "Unknown");
}

function userIdOf(user, email) {
  return String(user?.id || user?.userId || user?.uid || email || "").trim();
}

function validateThankYou6Recipient(user, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const adminEmails = new Set((options.adminEmails || []).map(normalizeEmail).filter(Boolean));
  const store = options.store || null;
  const state = options.state || null;
  const email = normalizeEmail(user?.email);

  const accountActive = !(
    String(user?.accountStatus || "").toLowerCase() === "disabled"
    || user?.disabled === true
  );
  const emailValid = Boolean(email)
    && !looksMalformedEmail(email)
    && !looksDisposableEmail(email);
  const channel = options.channel || "email";
  const isTest = looksLikeTestEmail(email) || testAccountGuard.isEphemeralTestAccountEmail(email);
  const isInternalFlag = thankYou6Eligibility.isInternalThankYou6Account(user, email);
  const suspiciousDomain = thankYou6Eligibility.isSuspiciousThankYou6Domain(user, email, store);
  const hasPro = membershipAccess.membershipHasProAccess(user, nowMs);
  const inTrial = membershipAccess.membershipUserInTrial(user, nowMs);
  const foundingActive = membershipAccess.membershipFoundingActive(user, nowMs);
  const planDisplay = membershipAccess.membershipPlanDisplay(user, nowMs);
  const accessKey = membershipAccess.membershipCurrentAccessKey(user, nowMs);
  const billingReview = membershipAccess.membershipIsBillingReviewRequired(user);
  const cancelingPaid = (
    Boolean(user?.cancelAtPeriodEnd)
    || String(user?.subscriptionStatus || "").toLowerCase().includes("access ends")
  ) && hasPro;
  const isSystem = isInternalFlag;
  const isFreeAccess = accessKey === "free" && !hasPro && planDisplay === "Free" && !billingReview && !cancelingPaid;
  const alreadyGot = state ? alreadyReceived(state, email, channel) : false;
  const isAdmin = adminEmails.has(email);
  const prefs = emailPrefs(user);
  const unsubscribed = Boolean(prefs.unsubscribedAt) || prefs.marketing === false;
  const bounced = store ? isKnownBouncedEmail(store, email) : Boolean(
    user?.emailBounced || user?.bouncedAt || user?.emailDeliveryStatus === "bounced",
  );
  const activeStripe = hasActivePaidStripe(user);
  const converted = hasConvertedToPaid(user);
  const grandfatheredPaid = isGrandfatheredPaid(user);
  const earlyUser = membershipAccess.membershipIsEarlyUser(user);
  const annual = String(user?.subscriptionCadence || "").toLowerCase() === "annual";
  const centerPaid = looksCenterPaid(user);

  const checks = {
    emailValid: emailValid && !isTest,
    accountActive,
    freeAccess: isFreeAccess,
    notFoundingMember: !foundingActive && !Boolean(user?.foundingMemberActive),
    notProAccess: !hasPro,
    notTrial: !inTrial,
    notAdmin: !isAdmin,
    notTestAccount: !isTest,
    notSystemAccount: !isSystem,
    notSuspiciousDomain: !suspiciousDomain,
    notBounced: !bounced,
    notUnsubscribed: !unsubscribed,
    notAlreadyReceived: !alreadyGot,
    noActivePaidStripe: !activeStripe,
    notBillingReview: !billingReview,
    notCancelingPaid: !cancelingPaid,
    notConvertedToPaid: !converted,
    notGrandfatheredPaid: !grandfatheredPaid,
    notEarlyUser: !earlyUser,
    notAnnual: !annual,
    notCenterPaid: !centerPaid,
  };

  const excludeReasons = [];
  if (!email) excludeReasons.push("missing_email");
  if (looksMalformedEmail(email) || looksDisposableEmail(email)) excludeReasons.push("invalid_email");
  if (isTest) excludeReasons.push("test_email");
  if (!accountActive) excludeReasons.push("disabled_account");
  if (!isFreeAccess) excludeReasons.push("not_free_access");
  if (foundingActive || user?.foundingMemberActive) excludeReasons.push("founding_member");
  if (hasPro) excludeReasons.push("has_pro_access");
  if (inTrial) excludeReasons.push("in_trial");
  if (isAdmin) excludeReasons.push("admin_account");
  if (isSystem) excludeReasons.push(thankYou6Eligibility.looksLikeProdFlagEmail(email) ? "internal_prod_flag_account" : "system_account");
  if (suspiciousDomain) excludeReasons.push("suspicious_email_domain");
  if (bounced) excludeReasons.push("bounced_email");
  if (unsubscribed) excludeReasons.push("unsubscribed");
  if (alreadyGot) excludeReasons.push("already_received_thankyou6");
  if (activeStripe) excludeReasons.push("active_paid_stripe");
  if (billingReview) excludeReasons.push("billing_review_or_past_due");
  if (cancelingPaid) excludeReasons.push("canceling_with_paid_access");
  if (converted) excludeReasons.push("already_converted_to_paid");
  if (grandfatheredPaid) excludeReasons.push("grandfathered_paid");
  if (earlyUser) excludeReasons.push("early_user_paid");
  if (annual) excludeReasons.push("annual_subscriber");
  if (centerPaid) excludeReasons.push("center_paid");

  const qualifies = Object.values(checks).every(Boolean) && excludeReasons.length === 0;
  return {
    email,
    userId: userIdOf(user, email),
    firstName: firstNameOf(user),
    createdAt: activityScore.accountCreatedAtOf(user),
    qualifies,
    qualifyReason: qualifies
      ? "Canonical accessKey=free, valid email, no paid/Stripe/trial/Early User/Founding/annual/center/past_due/canceling entitlement, not admin/test/system, marketing allowed"
      : "",
    excludeReasons,
    checks,
    accountStatus: accountStatusLabel(user, nowMs),
    accessKey,
    membershipPlan: planDisplay,
    currentPlan: planDisplay,
    stripeSubscriptionStatus: String(user?.stripeSubscriptionStatus || ""),
    hasActivePaidSubscription: activeStripe || hasPro,
    noActivePaidSubscription: !activeStripe && !hasPro,
    user,
  };
}

function buildEmailContent(options = {}) {
  const escape = typeof options.htmlEscape === "function" ? options.htmlEscape : htmlEscape;
  const firstName = greetingName({ firstName: options.firstName });
  const ctaUrl = thankYou6Checkout.checkoutCtaUrl(options.siteUrl);
  const unsubscribeUrl = String(options.unsubscribeUrl || "");
  const postalAddress = String(options.postalAddress || "");
  const safeCta = escape(ctaUrl);
  const safeName = escape(firstName);
  const text = [
    `Hi ${firstName},`,
    "",
    "Thank you for being one of our Little Learner Hub Free users and for giving the website a try. 💛",
    "",
    "I wanted to send you a little thank-you offer.",
    "",
    "For a limited time, use code:",
    "",
    PROMO_CODE,
    "",
    "and get $6 off your first month of Little Learner Hub Pro.",
    "",
    "That makes your first month just $7.99.",
    "",
    "With Pro, you'll unlock the full Little Learner Hub experience, including more lesson plans, activities, printables, planning tools, documentation tools, and everything new we're continuing to add for childcare providers.",
    "",
    "Your first month: $7.99",
    "Then: $13.99/month",
    "",
    `Promo code: ${PROMO_CODE}`,
    "",
    `Offer ends ${OFFER_EXPIRES_LABEL.replace(" at 11:59 PM CDT", "")} at 11:59 PM CDT.`,
    "",
    "Try Pro for $7.99:",
    ctaUrl,
    "",
    "Thank you for being here and helping me grow Little Learner Hub. 💛",
    "",
    "Leah",
    "Little Learner Hub",
    "",
    unsubscribeUrl ? `Unsubscribe from marketing emails: ${unsubscribeUrl}` : "",
    postalAddress,
  ].filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n").trim();

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;line-height:1.6">
      <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#8a7048;margin:0 0 8px">Little Learner Hub</p>
      <p>Hi ${safeName},</p>
      <p>Thank you for being one of our Little Learner Hub Free users and for giving the website a try. 💛</p>
      <p>I wanted to send you a little thank-you offer.</p>
      <p>For a limited time, use code:</p>
      <p style="font-size:22px;font-weight:700;letter-spacing:0.06em;margin:12px 0">${escape(PROMO_CODE)}</p>
      <p>and get $6 off your first month of Little Learner Hub Pro.</p>
      <p>That makes your first month just <strong>$7.99</strong>.</p>
      <p>With Pro, you'll unlock the full Little Learner Hub experience, including more lesson plans, activities, printables, planning tools, documentation tools, and everything new we're continuing to add for childcare providers.</p>
      <p><strong>Your first month:</strong> $7.99<br><strong>Then:</strong> $13.99/month<br><strong>Promo code:</strong> ${escape(PROMO_CODE)}</p>
      <p>Offer ends ${escape(OFFER_EXPIRES_LABEL)}.</p>
      <p style="margin:24px 0 12px">
        <a href="${safeCta}" style="display:inline-block;background:#2f6f5e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px">Try Pro for $7.99</a>
      </p>
      <p>Thank you for being here and helping me grow Little Learner Hub. 💛</p>
      <p>Leah<br>Little Learner Hub</p>
      ${unsubscribeUrl ? `<hr style="border:0;border-top:1px solid #ddd;margin:28px 0 16px"><p style="font-size:12px;color:#6b7280">You are receiving this because you have a Free Little Learner Hub account. <a href="${escape(unsubscribeUrl)}">Unsubscribe from marketing emails</a>.${postalAddress ? `<br>${escape(postalAddress)}` : ""}</p>` : ""}
    </div>
  `.trim();

  return {
    subject: EMAIL_SUBJECT,
    text,
    html,
    ctaUrl,
    checkoutPlan: CHECKOUT_PLAN,
    checkoutPriceEnv: CHECKOUT_PRICE_ENV,
    excludedPriceEnv: EXCLUDED_PRICE_ENV,
  };
}

function previewRow(row, state = null) {
  return {
    userId: row.userId,
    firstName: row.firstName || "",
    email: row.email,
    currentPlan: row.currentPlan || "Free",
    accessKey: row.accessKey || "free",
    accountCreatedAt: row.createdAt || "",
    lastActiveAt: row.lastActiveAt || "",
    lastSeenAt: row.signals?.lastSeenAt || "",
    lastLoginAt: row.signals?.lastLoginAt || "",
    noActivePaidSubscription: row.noActivePaidSubscription === true,
    emailReceipt: alreadyReceived(state, row.email, "email"),
    inAppReceipt: alreadyReceived(state, row.email, "in_app"),
    activityScore: row.score,
    rankWhy: row.rankWhy || "",
    signals: {
      daysSinceActive: row.signals?.daysSinceActive,
      pageViews: row.signals?.pageViews || 0,
      loginEvents: row.signals?.loginEvents || 0,
      lessonViews: row.signals?.lessonViews || 0,
      activityViews: row.signals?.activityViews || 0,
      saves: row.signals?.saves || 0,
      plannerUses: row.signals?.plannerUses || 0,
      docToolUses: row.signals?.docToolUses || 0,
      aiUses: row.signals?.aiUses || 0,
      downloadsPrints: row.signals?.downloadsPrints || 0,
    },
  };
}

function buildThankYou6RecipientDryRun(store, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const adminEmails = (options.adminEmails || []).map(normalizeEmail).filter(Boolean);
  const state = ensureCampaignState(store);
  const users = store?.users && typeof store.users === "object" ? store.users : {};
  const seen = new Set();
  const eligible = [];
  const excluded = [];
  const duplicatesRemoved = [];

  let totalFree = 0;
  for (const [key, user] of Object.entries(users)) {
    const email = normalizeEmail(user?.email || key);
    if (!email) continue;
    if (seen.has(email)) {
      duplicatesRemoved.push(email);
      continue;
    }
    seen.add(email);
    if (membershipAccess.membershipCurrentAccessKey({ ...user, email }, nowMs) === "free") {
      totalFree += 1;
    }
    const row = validateThankYou6Recipient({ ...user, email }, {
      nowMs,
      adminEmails,
      store,
      state,
      channel: options.channel || "email",
    });
    if (row.qualifies) eligible.push(row);
    else excluded.push(row);
  }

  const ranked = activityScore.rankThankYou6ByActivity(eligible, { nowMs, limit: SELECT_LIMIT });
  const content = buildEmailContent({
    htmlEscape: options.htmlEscape || htmlEscape,
    siteUrl: options.siteUrl,
    firstName: "there",
    unsubscribeUrl: options.unsubscribeUrl || "",
    postalAddress: options.postalAddress || "",
  });

  const offerExpired = nowMs > OFFER_EXPIRES_AT_MS;
  const stopReason = ranked.insufficientActivityData
    ? "No eligible Free user has lastSeenAt or lastLoginAt within 60 days. Activity ranking stopped — not falling back to newest accounts."
    : "";

  return {
    dryRun: true,
    willSend: false,
    campaign: CAMPAIGN_ID,
    campaignName: CAMPAIGN_NAME,
    offer: OFFER_LABEL,
    promoCode: PROMO_CODE,
    expiration: OFFER_EXPIRES_LABEL,
    checkoutPlan: CHECKOUT_PLAN,
    checkoutPriceEnv: CHECKOUT_PRICE_ENV,
    excludedPriceEnv: EXCLUDED_PRICE_ENV,
    audienceRule: "Canonical membershipCurrentAccessKey === free only (not Owner paidUsers / Inactive / Active Users). Ranked by isolated lastSeenAt/lastLoginAt + featureUsage. Max 25.",
    confirmPhraseRequired: CONFIRM_PHRASE,
    confirmationWarning: CONFIRMATION_WARNING.replace("25", String(ranked.selectedCount || 25)),
    activityFormula: ranked.formula,
    insufficientActivityData: ranked.insufficientActivityData,
    stopReason,
    offerExpired,
    counts: {
      totalUsers: Object.keys(users).length,
      totalFreeUsers: totalFree,
      totalEligible: eligible.length,
      measurableActivity: ranked.measurableCount,
      recentActivity: ranked.recentCount,
      selected: ranked.selectedCount,
      excluded: excluded.length,
      duplicatesRemoved: duplicatesRemoved.length,
      highestActivityScore: ranked.highestScore,
      lowestSelectedActivityScore: ranked.lowestSelectedScore,
    },
    activityDateRange: ranked.activityDateRange,
    recipients: ranked.selected.map((row) => previewRow(row, state)),
    eligibleUnranked: eligible.length,
    excluded: excluded.slice(0, 80),
    duplicatesRemoved: [...new Set(duplicatesRemoved)],
    email: {
      subject: content.subject,
      textPreview: content.text,
      htmlPreview: content.html,
      ctaUrl: content.ctaUrl,
    },
    exclusionTotals: excluded.reduce((totals, row) => {
      const reasons = Array.isArray(row.excludeReasons) ? row.excludeReasons : [];
      const bump = (key) => { totals[key] += 1; };
      if (reasons.includes("active_paid_stripe") || reasons.includes("has_pro_access") || reasons.includes("early_user_paid") || reasons.includes("founding_member") || reasons.includes("annual_subscriber") || reasons.includes("center_paid") || reasons.includes("billing_review_or_past_due") || reasons.includes("canceling_with_paid_access")) bump("currentlyPaid");
      if (reasons.includes("already_converted_to_paid") || reasons.includes("grandfathered_paid")) bump("historicallyPaid");
      if (reasons.includes("admin_account")) bump("ownerAdmin");
      if (reasons.includes("system_account") || reasons.includes("test_email")) bump("systemInternalQaTest");
      if (reasons.includes("internal_prod_flag_account")) bump("prodFlagAccounts");
      if (reasons.includes("suspicious_email_domain")) bump("suspiciousEmailDomains");
      if (reasons.includes("invalid_email") || reasons.includes("missing_email")) bump("invalidDisposable");
      if (reasons.includes("bounced_email")) bump("bounced");
      if (reasons.includes("unsubscribed")) bump("unsubscribed");
      if (reasons.includes("disabled_account")) bump("disabledAccounts");
      if (reasons.includes("already_received_thankyou6")) bump("alreadyReceipted");
      if (reasons.includes("not_free_access") && !reasons.includes("has_pro_access") && !reasons.includes("active_paid_stripe") && !reasons.includes("already_converted_to_paid")) bump("notFreeAccessOther");
      return totals;
    }, {
      currentlyPaid: 0,
      historicallyPaid: 0,
      ownerAdmin: 0,
      systemInternalQaTest: 0,
      prodFlagAccounts: 0,
      suspiciousEmailDomains: 0,
      invalidDisposable: 0,
      bounced: 0,
      unsubscribed: 0,
      disabledAccounts: 0,
      alreadyReceipted: 0,
      notFreeAccessOther: 0,
    }),
    trackedExclusions: ["llh.prod.flag.free.1785770260@littlelearnershubbyleah.com", "andvarvele22@gmil.com"].map((email) => {
      const row = excluded.find((item) => item.email === email);
      return row
        ? { email, found: true, qualifies: false, excludeReasons: row.excludeReasons }
        : { email, found: false, qualifies: null, excludeReasons: [] };
    }),
    notableExcluded: excluded.filter((row) => (
      row.excludeReasons.includes("internal_prod_flag_account")
      || row.excludeReasons.includes("suspicious_email_domain")
      || row.excludeReasons.includes("system_account")
    )).map((row) => ({
      email: row.email,
      userId: row.userId,
      excludeReasons: row.excludeReasons,
    })),
    notes: [
      "Paid, Stripe-active, Early User, Founding, annual, center-paid, admin, test, bounced, and unsubscribed accounts are excluded.",
      "Internal/system/QA/automation accounts and llh.prod.flag.* production-flag emails are excluded. The Little Learner Hub domain alone is not enough to exclude a customer.",
      "Unverified gmil.com addresses are excluded as suspicious_email_domain unless a delivered-status proof already exists.",
      "Selection uses lastSeenAt/lastLoginAt + featureUsage only. Account age is a tie-breaker.",
      "Sending does not modify memberships, subscriptions, billing, or account access.",
      "Production send never runs automatically.",
    ],
  };
}

function buildConfirmationScreen(report, options = {}) {
  return {
    title: "Final Confirmation — Free User Thank You THANKYOU6",
    willSend: false,
    campaign: CAMPAIGN_NAME,
    offer: OFFER_LABEL,
    recipients: report.counts.selected,
    expiration: OFFER_EXPIRES_LABEL,
    confirmPhraseRequired: CONFIRM_PHRASE,
    warning: report.confirmationWarning || CONFIRMATION_WARNING,
    recipientCount: report.counts.selected,
    recipientEmails: (report.recipients || []).map((row) => row.email),
    recipientsDetailed: report.recipients,
    subject: report.email.subject,
    textPreview: report.email.textPreview,
    htmlPreview: report.email.htmlPreview,
    ctaUrl: report.email.ctaUrl,
    checkoutPlan: report.checkoutPlan,
    checkoutPriceEnv: report.checkoutPriceEnv,
    excludedCount: report.counts.excluded,
    insufficientActivityData: report.insufficientActivityData,
    stopReason: report.stopReason,
    dryRunToken: options.dryRunToken || "",
    confirmationToken: options.confirmationToken || "",
  };
}

function buildPostSendReport(state) {
  const deliveries = Array.isArray(state.deliveries) ? state.deliveries : [];
  const failures = Array.isArray(state.failures) ? state.failures : [];
  const skipped = Array.isArray(state.skipped) ? state.skipped : [];
  return {
    campaign: CAMPAIGN_ID,
    sentAt: state.sentAt || "",
    totalAttempted: Number(state.attemptedCount || 0),
    totalDelivered: Number(state.deliveredCount || state.sentCount || 0),
    totalFailed: Number(state.failedCount || failures.length || 0),
    totalBounced: Number(state.bouncedCount || 0),
    totalOpened: Number(state.openedCount || 0),
    totalClicked: Number(state.clickedCount || 0),
    totalSkipped: skipped.length + Number(state.skippedAlreadyReceivedCount || 0) + Number(state.softSkippedCount || 0),
    resendMessageIds: deliveries.map((row) => row.messageId).filter(Boolean),
    deliveries,
    failures,
    skipped,
    membershipRecordsModified: false,
    billingRecordsModified: false,
    accountAccessModified: false,
  };
}

function applyResendEventToState(state, event) {
  const type = String(event?.type || "");
  const data = event?.data || {};
  const messageId = String(data.email_id || data.id || "").trim();
  const toList = Array.isArray(data.to) ? data.to : (data.to ? [data.to] : []);
  const emailFromEvent = normalizeEmail(toList[0] || "");
  const email = emailFromEvent || normalizeEmail(state.messageIdIndex?.[messageId] || "");
  const receiptKey = email || state.messageIdIndex?.[messageId];
  if (!receiptKey || !state.recipientReceipts[receiptKey]) {
    return { updated: false, reason: "not_thankyou6_campaign_message" };
  }
  const receipt = state.recipientReceipts[receiptKey];
  const at = event.created_at || new Date().toISOString();
  if (type === "email.delivered") {
    receipt.deliveredAt = at;
    receipt.deliveryStatus = "delivered";
  } else if (type === "email.bounced" || type === "email.failed") {
    receipt.bouncedAt = at;
    receipt.deliveryStatus = "bounced";
  } else if (type === "email.opened") {
    receipt.openedAt = receipt.openedAt || at;
  } else if (type === "email.clicked") {
    receipt.clickedAt = receipt.clickedAt || at;
  }
  const receipts = Object.values(state.recipientReceipts);
  state.deliveredCount = receipts.filter((row) => row.deliveryStatus === "delivered" || row.deliveredAt).length;
  state.bouncedCount = receipts.filter((row) => row.deliveryStatus === "bounced" || row.bouncedAt).length;
  state.openedCount = receipts.filter((row) => row.openedAt).length;
  state.clickedCount = receipts.filter((row) => row.clickedAt).length;
  state.lastPostSendReport = buildPostSendReport(state);
  return { updated: true, email: receiptKey, type };
}

function createFreeUserThankYou6Email(deps = {}) {
  const {
    sendEmail,
    readStore,
    writeStore,
    htmlEscape: htmlEscapeFn = htmlEscape,
    getAdminEmail = () => "",
    getAdminEmails = () => [],
    getSupportEmailStatus = () => ({ ready: false }),
    unsubscribeUrlForEmail = () => "",
    postalAddress = "",
    siteUrl = "",
    fetchResendEmailStatus = null,
  } = deps;

  function adminEmailList(override) {
    const extra = Array.isArray(override) ? override : [];
    return [...extra, getAdminEmail(), ...(getAdminEmails() || [])].map(normalizeEmail).filter(Boolean);
  }

  function dryRun(options = {}) {
    const store = options.store || readStore();
    const report = buildThankYou6RecipientDryRun(store, {
      adminEmails: adminEmailList(options.adminEmails),
      nowMs: options.nowMs,
      htmlEscape: htmlEscapeFn,
      siteUrl: options.siteUrl || siteUrl,
      postalAddress: options.postalAddress || postalAddress,
      channel: options.channel || "email",
    });
    const state = ensureCampaignState(store);
    const alreadySent = Boolean(state.sentAt);
    const dryRunToken = crypto.randomBytes(16).toString("hex");
    const confirmationToken = crypto.randomBytes(16).toString("hex");
    const dryRunAt = new Date().toISOString();
    const confirmationScreen = buildConfirmationScreen(report, { dryRunToken, confirmationToken });
    state.preparedAt = dryRunAt;
    state.preparedRecipientCount = report.counts.selected;
    state.preparedSubject = report.email.subject;
    state.dryRunToken = dryRunToken;
    state.dryRunAt = dryRunAt;
    state.confirmationToken = confirmationToken;
    state.confirmationAt = dryRunAt;
    state.lastDryRunSummary = {
      at: dryRunAt,
      recipientCount: report.counts.selected,
      recipientEmails: report.recipients.map((row) => row.email),
    };
    state.lastConfirmationScreen = {
      at: dryRunAt,
      recipientCount: confirmationScreen.recipientCount,
      recipientEmails: confirmationScreen.recipientEmails,
      subject: confirmationScreen.subject,
    };
    if (typeof writeStore === "function" && options.persist !== false) writeStore(store);
    const emailStatus = typeof getSupportEmailStatus === "function" ? (getSupportEmailStatus() || {}) : {};
    return {
      ...report,
      alreadySent,
      sentAt: state.sentAt || "",
      testSentAt: state.testSentAt || "",
      dryRunToken,
      dryRunAt,
      confirmationToken,
      confirmationScreen,
      emailProvider: {
        ready: Boolean(emailStatus.ready),
        provider: emailStatus.provider || "not configured",
      },
      sendUnlocked: Boolean(
        !alreadySent
        && !report.insufficientActivityData
        && !report.offerExpired
        && report.counts.selected > 0
        && emailStatus.ready
        && dryRunToken
        && confirmationToken,
      ),
      nextStep: alreadySent
        ? "Already sent — duplicate send blocked."
        : report.insufficientActivityData
          ? report.stopReason
          : "Review recipients + email preview. Send test to owner first. Production send requires SEND_THANKYOU6_CAMPAIGN.",
    };
  }

  function getReport(options = {}) {
    const store = options.store || readStore();
    const state = ensureCampaignState(store);
    return {
      ok: true,
      sent: Boolean(state.sentAt),
      report: buildPostSendReport(state),
      confirmationScreen: state.lastConfirmationScreen,
    };
  }

  function handleResendWebhook(event, options = {}) {
    const store = options.store || readStore();
    const state = ensureCampaignState(store);
    const result = applyResendEventToState(state, event);
    state.webhookEvents.unshift({
      at: new Date().toISOString(),
      type: event?.type || "",
      emailId: event?.data?.email_id || event?.data?.id || "",
      updated: Boolean(result.updated),
    });
    state.webhookEvents = state.webhookEvents.slice(0, 200);
    if (result.updated || options.persistAlways) writeStore(store);
    return result;
  }

  async function refreshDeliveryStatuses() {
    const store = readStore();
    const state = ensureCampaignState(store);
    if (typeof fetchResendEmailStatus !== "function") {
      return { ok: false, reason: "status_fetcher_unavailable", report: buildPostSendReport(state) };
    }
    let updated = 0;
    for (const receipt of Object.values(state.recipientReceipts || {})) {
      if (!receipt.messageId) continue;
      try {
        const status = await fetchResendEmailStatus(receipt.messageId);
        const lastEvent = String(status?.last_event || status?.lastEvent || "").toLowerCase();
        if (lastEvent === "delivered") {
          receipt.deliveredAt = receipt.deliveredAt || new Date().toISOString();
          receipt.deliveryStatus = "delivered";
          updated += 1;
        } else if (lastEvent === "bounced" || lastEvent === "failed") {
          receipt.bouncedAt = receipt.bouncedAt || new Date().toISOString();
          receipt.deliveryStatus = "bounced";
          updated += 1;
        }
      } catch {
        /* keep prior status */
      }
    }
    state.lastPostSendReport = buildPostSendReport(state);
    writeStore(store);
    return { ok: true, updated, report: state.lastPostSendReport };
  }

  async function sendTestToOwner(options = {}) {
    const store = options.store || readStore();
    const adminEmail = normalizeEmail(options.adminEmail || getAdminEmail() || "");
    if (!adminEmail) {
      return { sent: false, skipped: true, reason: "missing_owner_email" };
    }
    const emailStatus = typeof getSupportEmailStatus === "function" ? (getSupportEmailStatus() || {}) : {};
    if (!emailStatus.ready) {
      return { sent: false, skipped: true, reason: "provider_not_ready", emailProvider: emailStatus };
    }
    const content = buildEmailContent({
      htmlEscape: htmlEscapeFn,
      siteUrl: options.siteUrl || siteUrl,
      firstName: options.firstName || "Leah",
      unsubscribeUrl: unsubscribeUrlForEmail(adminEmail),
      postalAddress,
    });
    const result = await sendEmail({
      to: adminEmail,
      subject: `[TEST] ${content.subject}`,
      text: content.text,
      html: content.html,
      listUnsubscribeUrl: unsubscribeUrlForEmail(adminEmail),
      tags: [
        { name: "campaign", value: `${CAMPAIGN_ID}_test` },
        { name: "template", value: TEMPLATE_KEY },
      ],
      eventType: "thankyou6_owner_test",
    });
    const state = ensureCampaignState(store);
    state.testSentAt = new Date().toISOString();
    state.testRecipient = adminEmail;
    if (options.persist !== false) writeStore(store);
    return {
      sent: Boolean(result?.sent),
      productionCampaignSent: false,
      recipient: adminEmail,
      testSentAt: state.testSentAt,
      provider: result?.provider || "",
      messageId: result?.messageId || "",
    };
  }

  async function send(options = {}) {
    if (process.env.NODE_ENV === "test" && options.allowTestHarnessSend !== true) {
      return {
        sent: 0,
        skipped: true,
        reason: "test_mode_blocked",
        detail: "NODE_ENV=test cannot send the production THANKYOU6 campaign.",
        productionCampaignSent: false,
      };
    }

    const store = readStore();
    const state = ensureCampaignState(store);
    if (state.sentAt && !options.forceResend) {
      return {
        sent: 0,
        skipped: true,
        reason: "already_sent",
        sentAt: state.sentAt,
        detail: "This THANKYOU6 campaign was already sent. Duplicate sends are blocked.",
        report: buildPostSendReport(state),
        productionCampaignSent: Boolean(state.sentAt),
      };
    }
    if (String(options.confirmPhrase || "").trim() !== CONFIRM_PHRASE || options.confirm !== true) {
      return {
        sent: 0,
        skipped: true,
        reason: "confirmation_required",
        detail: `Pass confirm:true and confirmPhrase "${CONFIRM_PHRASE}" after reviewing the warning: ${CONFIRMATION_WARNING}`,
      };
    }
    if (!state.dryRunToken || options.dryRunToken !== state.dryRunToken) {
      return { sent: 0, skipped: true, reason: "dry_run_required", detail: "Run preview/dry-run first." };
    }
    if (!state.confirmationToken || options.confirmationToken !== state.confirmationToken) {
      return { sent: 0, skipped: true, reason: "confirmation_screen_required" };
    }
    const dryRunAgeMs = Date.now() - new Date(state.dryRunAt || 0).getTime();
    if (!Number.isFinite(dryRunAgeMs) || dryRunAgeMs < 0 || dryRunAgeMs > 2 * 60 * 60 * 1000) {
      return { sent: 0, skipped: true, reason: "dry_run_expired", detail: "Confirmation expired (2 hours)." };
    }

    const report = buildThankYou6RecipientDryRun(store, {
      adminEmails: adminEmailList(options.adminEmails),
      htmlEscape: htmlEscapeFn,
      siteUrl: options.siteUrl || siteUrl,
      postalAddress,
    });
    if (report.offerExpired) {
      return { sent: 0, skipped: true, reason: "offer_expired", detail: `Offer ended ${OFFER_EXPIRES_LABEL}.` };
    }
    if (report.insufficientActivityData) {
      return { sent: 0, skipped: true, reason: "insufficient_activity_data", detail: report.stopReason };
    }
    if (!report.recipients.length) {
      return { sent: 0, skipped: true, reason: "no_recipients" };
    }
    const approved = new Set((state.lastDryRunSummary?.recipientEmails || []).map(normalizeEmail));
    const unexpected = report.recipients.map((row) => row.email).filter((email) => !approved.has(email));
    if (unexpected.length) {
      return {
        sent: 0,
        skipped: true,
        reason: "recipient_drift",
        detail: "Recipient list changed since preview. Re-run preview and confirm again.",
        drift: unexpected.slice(0, 25),
      };
    }

    const emailStatus = typeof getSupportEmailStatus === "function" ? (getSupportEmailStatus() || {}) : {};
    if (!emailStatus.ready) {
      return { sent: 0, skipped: true, reason: "provider_not_ready", emailProvider: emailStatus };
    }

    let sentCount = 0;
    let failCount = 0;
    let alreadyReceivedSkip = 0;
    const deliveries = [];
    const failures = [];
    const skipped = [];

    for (const row of report.recipients) {
      if (alreadyReceived(state, row.email)) {
        alreadyReceivedSkip += 1;
        skipped.push({ email: row.email, reason: "already_received_thankyou6" });
        continue;
      }
      const user = store.users?.[row.email] || { email: row.email, firstName: row.firstName };
      const content = buildEmailContent({
        htmlEscape: htmlEscapeFn,
        siteUrl: options.siteUrl || siteUrl,
        firstName: firstNameOf(user) || row.firstName,
        unsubscribeUrl: unsubscribeUrlForEmail(row.email),
        postalAddress,
      });
      let emailResult = { sent: false, configured: false, provider: "not configured" };
      try {
        emailResult = await sendEmail({
          to: row.email,
          subject: content.subject,
          text: content.text,
          html: content.html,
          listUnsubscribeUrl: unsubscribeUrlForEmail(row.email),
          tags: [
            { name: "campaign", value: CAMPAIGN_ID },
            { name: "template", value: TEMPLATE_KEY },
          ],
          eventType: "thankyou6_campaign",
          idempotencyKey: `${CAMPAIGN_ID}:${row.email}`,
        });
      } catch (error) {
        emailResult = { sent: false, configured: true, provider: "error", error: error.message || String(error) };
      }
      const nowIso = new Date().toISOString();
      const messageId = emailResult.messageId || "";
      if (emailResult.sent) {
        sentCount += 1;
        deliveries.push({ email: row.email, messageId, sentAt: nowIso, deliveryStatus: "accepted" });
        const prior = state.recipientReceipts[row.email] && typeof state.recipientReceipts[row.email] === "object"
          ? state.recipientReceipts[row.email]
          : {};
        state.recipientReceipts[row.email] = {
          ...prior,
          email: {
            campaignId: CAMPAIGN_ID,
            channel: "email",
            messageId,
            sentAt: nowIso,
            apiAccepted: true,
            deliveryStatus: "accepted",
          },
          campaignId: CAMPAIGN_ID,
          messageId,
          sentAt: nowIso,
          apiAccepted: true,
          deliveryStatus: "accepted",
        };
        if (messageId) state.messageIdIndex[messageId] = row.email;
      } else {
        failCount += 1;
        failures.push({ email: row.email, reason: emailResult.error || "failed" });
      }
    }

    const now = new Date().toISOString();
    Object.assign(state, {
      sentAt: now,
      recipientCount: report.recipients.length,
      attemptedCount: report.recipients.length,
      sentCount,
      failedCount: failCount,
      skippedAlreadyReceivedCount: alreadyReceivedSkip,
      deliveries: deliveries.slice(0, 500),
      failures: failures.slice(0, 200),
      skipped: skipped.slice(0, 200),
      dryRunToken: "",
      confirmationToken: "",
    });
    state.lastPostSendReport = buildPostSendReport(state);
    writeStore(store);
    return {
      sent: sentCount,
      failed: failCount,
      skipped: false,
      reason: "sent",
      sentAt: now,
      productionCampaignSent: true,
      recipients: report.recipients.length,
      report: state.lastPostSendReport,
      membershipRecordsModified: false,
      billingRecordsModified: false,
      accountAccessModified: false,
    };
  }

  return {
    CONFIRM_PHRASE,
    CAMPAIGN_ID,
    dryRun,
    send,
    sendTestToOwner,
    getReport,
    refreshDeliveryStatuses,
    handleResendWebhook,
    ensureCampaignState,
  };
}

module.exports = {
  CONFIRM_PHRASE,
  CAMPAIGN_ID,
  CAMPAIGN_NAME,
  EMAIL_SUBJECT,
  OFFER_LABEL,
  OFFER_EXPIRES_LABEL,
  PROMO_CODE,
  SELECT_LIMIT,
  CONFIRMATION_WARNING,
  CHECKOUT_PLAN,
  CHECKOUT_PRICE_ENV,
  EXCLUDED_PRICE_ENV,
  createFreeUserThankYou6Email,
  buildThankYou6RecipientDryRun,
  buildEmailContent,
  buildConfirmationScreen,
  validateThankYou6Recipient,
  defaultCampaignState,
  alreadyReceived,
  channelReceiptOf,
};
