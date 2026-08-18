/**
 * Isolated one-time IN-APP check-in for current genuine paid customers.
 * Campaign: PAID_USER_CHECKIN_AUG2026
 *
 * Separate from any Free-user promotional campaign.
 * Writes store.notifications only. Never emails. Never web-push.
 */

const crypto = require("crypto");
const membershipAccess = require("../scripts/membership-access.js");
const testAccountGuard = require("./test-account-guard.js");
const { looksLikeTestEmail, looksMalformedEmail } = require("./free-user-welcome-email.js");

const CAMPAIGN_ID = "PAID_USER_CHECKIN_AUG2026";
const CAMPAIGN_NAME = "Paid User Check-In — August 2026";
const CONFIRM_PHRASE = "SEND_PAID_USER_CHECKIN_IN_APP";
const IN_APP_TYPE = "feature_update";
const TITLE = "How are you liking Little Learner Hub? 💛";
const BODY_CORE = "I wanted to check in and see how things are going for you with Little Learner Hub. Are you liking it so far? Is there anything you wish was easier, better, or something you would love for me to add? I’m always working on improving it based on what real childcare providers actually need. 💛";
const CTA_LABEL = "Tell me what you think";
const CTA_PATH = "/?view=messages";
const CHANNEL = "in_app";

// Same owner aliases the server already treats as platform admin.
const OWNER_ADMIN_ALIASES = Object.freeze([
  "leahivie@icloud.com",
  "leahrivie@icloud.com",
  "leahrivie@gmail.com",
  "little.learners.hub.customer@gmail.com",
]);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeFirstName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const first = raw.split(/\s+/)[0];
  if (!first) return "";
  if (["undefined", "null", "nan"].includes(first.toLowerCase())) return "";
  if (!/[A-Za-z]/.test(first)) return "";
  return first;
}

function firstNameOf(user) {
  return sanitizeFirstName(user?.firstName || user?.name || user?.displayName || "");
}

function looksLikeProdFlagEmail(email) {
  const local = normalizeEmail(email).split("@")[0] || "";
  return /^llh\.prod\.flag(?:[._+-]|$)/i.test(local);
}

function buildBody(firstName) {
  const name = sanitizeFirstName(firstName);
  const greeting = name ? `Hi ${name}!` : "Hi!";
  return `${greeting} ${BODY_CORE}`;
}

function buildContent(options = {}) {
  const firstName = sanitizeFirstName(options.firstName);
  const body = buildBody(firstName);
  const site = String(options.siteUrl || "").trim().replace(/\/$/, "") || "https://littlelearnershubbyleah.com";
  return {
    title: TITLE,
    body,
    preview: body,
    ctaLabel: CTA_LABEL,
    ctaPath: CTA_PATH,
    ctaUrl: `${site}${CTA_PATH}`,
    type: IN_APP_TYPE,
    campaign: CAMPAIGN_ID,
    channel: CHANNEL,
  };
}

function defaultState() {
  return {
    campaignId: CAMPAIGN_ID,
    dryRunToken: "",
    dryRunAt: "",
    confirmationToken: "",
    sentAt: "",
    recipientCount: 0,
    recipientReceipts: {},
    lastDryRunSummary: null,
    lastPostSendReport: null,
  };
}

function ensureState(store) {
  if (!store.inAppCampaigns || typeof store.inAppCampaigns !== "object") {
    store.inAppCampaigns = {};
  }
  if (!store.inAppCampaigns[CAMPAIGN_ID] || typeof store.inAppCampaigns[CAMPAIGN_ID] !== "object") {
    store.inAppCampaigns[CAMPAIGN_ID] = defaultState();
  } else {
    const current = store.inAppCampaigns[CAMPAIGN_ID];
    for (const [key, value] of Object.entries(defaultState())) {
      if (current[key] === undefined) current[key] = value;
    }
  }
  const state = store.inAppCampaigns[CAMPAIGN_ID];
  state.recipientReceipts = state.recipientReceipts && typeof state.recipientReceipts === "object"
    ? state.recipientReceipts
    : {};
  return state;
}

function isInternalAccount(user, email) {
  if (user?.systemAccount === true) return true;
  if (user?.internalAccessOverride === true) return true;
  if (user?.qaAccount === true || user?.automationAccount === true) return true;
  const role = String(user?.accountRole || user?.role || "").toLowerCase();
  if (["system", "internal", "qa", "automation"].includes(role)) return true;
  const accountType = String(user?.accountType || "").toLowerCase();
  if (["system", "internal", "qa", "automation", "test"].includes(accountType)) return true;
  if (looksLikeProdFlagEmail(email || user?.email)) return true;
  return false;
}

function hasSuccessfulPaymentEvidence(user) {
  return Boolean(user?.lastSuccessfulPaymentAt || user?.firstPaidInvoiceAt);
}

function hasPaidHistory(user) {
  if (hasSuccessfulPaymentEvidence(user)) return true;
  if (user?.foundingMemberHistorical || user?.foundingMemberNumber || user?.foundingMember) return true;
  if (membershipAccess.membershipHasSubscriptionHistory(user)) return true;
  return false;
}

function alreadyReceived(state, email) {
  const receipt = state?.recipientReceipts?.[normalizeEmail(email)];
  const inApp = receipt?.in_app && typeof receipt.in_app === "object" ? receipt.in_app : receipt;
  return Boolean(inApp?.sentAt || inApp?.notificationId);
}

function existingCampaignNotification(store, email) {
  const needle = normalizeEmail(email);
  return (Array.isArray(store?.notifications) ? store.notifications : []).find((row) => (
    String(row?.refId || "") === CAMPAIGN_ID
    && normalizeEmail(row?.email) === needle
  )) || null;
}

function validatePaidCheckinRecipient(user, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const adminEmails = new Set((options.adminEmails || []).map(normalizeEmail).filter(Boolean));
  const store = options.store || null;
  const state = options.state || (store ? ensureState(store) : null);
  const email = normalizeEmail(user?.email);
  const disabled = String(user?.accountStatus || "").toLowerCase() === "disabled" || user?.disabled === true;
  const testEmail = looksLikeTestEmail(email) || testAccountGuard.isEphemeralTestAccountEmail(email);
  const malformed = !email || looksMalformedEmail(email);
  const internal = isInternalAccount(user, email);
  const admin = adminEmails.has(email) || OWNER_ADMIN_ALIASES.includes(email);
  const hasPro = membershipAccess.membershipHasProAccess(user, nowMs);
  const inTrial = membershipAccess.membershipUserInTrial(user, nowMs);
  const trialOnlyNeverPaid = inTrial && !hasSuccessfulPaymentEvidence(user);
  const accessKey = membershipAccess.membershipCurrentAccessKey(user, nowMs);
  const planDisplay = membershipAccess.membershipPlanDisplay(user, nowMs);
  const statusDisplay = membershipAccess.membershipStatusDisplay(user, nowMs);
  const genuinePaid = hasPro && !trialOnlyNeverPaid && !internal;
  const already = state ? alreadyReceived(state, email) : false;
  const alreadyNotif = store ? Boolean(existingCampaignNotification(store, email)) : false;

  const excludeReasons = [];
  if (malformed) excludeReasons.push("invalid_email");
  if (testEmail) excludeReasons.push("test_email");
  if (internal) excludeReasons.push(looksLikeProdFlagEmail(email) ? "internal_prod_flag_account" : "system_account");
  if (admin) excludeReasons.push("admin_account");
  if (disabled) excludeReasons.push("disabled_account");
  if (!hasPro && hasPaidHistory(user)) excludeReasons.push("former_paid_now_free");
  if (!hasPro && !hasPaidHistory(user) && !inTrial) excludeReasons.push("not_current_paid");
  if (trialOnlyNeverPaid) excludeReasons.push("trial_only_never_paid");
  if (already || alreadyNotif) excludeReasons.push("already_received_checkin");

  const qualifies = genuinePaid && !malformed && !testEmail && !admin && !disabled && !already && !alreadyNotif && excludeReasons.length === 0;
  return {
    email,
    userId: String(user?.id || user?.userId || email || ""),
    firstName: firstNameOf(user),
    qualifies,
    excludeReasons,
    accessKey,
    currentPlan: planDisplay,
    accountStatus: statusDisplay,
    hasProAccess: hasPro,
    inTrial,
    trialOnlyNeverPaid,
    genuinePaid,
    alreadyReceived: already || alreadyNotif,
  };
}

function writeInAppNotificationsOnly(store, { recipients, title, preview, deepLink }) {
  store.notifications = Array.isArray(store.notifications) ? store.notifications : [];
  const now = new Date().toISOString();
  const created = [];
  for (const email of recipients) {
    const normalized = normalizeEmail(email);
    if (!normalized) continue;
    if (existingCampaignNotification(store, normalized)) continue;
    const row = {
      id: `notif-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`,
      email: normalized,
      type: IN_APP_TYPE,
      category: "paid_user_checkin",
      title: String(title || TITLE).slice(0, 200),
      preview: String(preview || ""),
      messageId: "",
      conversationEmail: "",
      refId: CAMPAIGN_ID,
      deepLink: deepLink || CTA_PATH,
      createdAt: now,
      read: false,
      readAt: "",
      pushAttempted: false,
      pushSent: false,
      pushError: "push_disabled_for_campaign",
    };
    store.notifications.unshift(row);
    created.push(row);
  }
  return created;
}

function buildDryRun(store, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const adminEmails = (options.adminEmails || []).map(normalizeEmail).filter(Boolean);
  const state = ensureState(store);
  const users = store?.users && typeof store.users === "object" ? store.users : {};
  const eligible = [];
  const excluded = [];
  const seen = new Set();
  let currentPaidFound = 0;
  const exclusionTotals = {
    internalTestAdmin: 0,
    formerPaidNowFree: 0,
    trialOnlyNeverPaid: 0,
    alreadyReceipted: 0,
    notCurrentPaid: 0,
    invalidEmail: 0,
    disabled: 0,
  };

  for (const [key, user] of Object.entries(users)) {
    const email = normalizeEmail(user?.email || key);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const row = validatePaidCheckinRecipient({ ...user, email }, {
      nowMs,
      adminEmails,
      store,
      state,
    });
    if (row.hasProAccess && !row.trialOnlyNeverPaid) currentPaidFound += 1;
    if (row.qualifies) {
      eligible.push(row);
    } else {
      excluded.push(row);
      if (row.excludeReasons.includes("test_email") || row.excludeReasons.includes("system_account") || row.excludeReasons.includes("internal_prod_flag_account") || row.excludeReasons.includes("admin_account")) {
        exclusionTotals.internalTestAdmin += 1;
      }
      if (row.excludeReasons.includes("former_paid_now_free")) exclusionTotals.formerPaidNowFree += 1;
      if (row.excludeReasons.includes("trial_only_never_paid")) exclusionTotals.trialOnlyNeverPaid += 1;
      if (row.excludeReasons.includes("already_received_checkin")) exclusionTotals.alreadyReceipted += 1;
      if (row.excludeReasons.includes("not_current_paid")) exclusionTotals.notCurrentPaid += 1;
      if (row.excludeReasons.includes("invalid_email")) exclusionTotals.invalidEmail += 1;
      if (row.excludeReasons.includes("disabled_account")) exclusionTotals.disabled += 1;
    }
  }

  const content = buildContent({ siteUrl: options.siteUrl });
  const suspicious = [];
  for (const row of eligible) {
    if (!row.hasProAccess || row.accessKey === "free" || row.currentPlan === "Free") {
      suspicious.push({ email: row.email, reason: "eligible_without_current_paid_access" });
    }
    if (row.trialOnlyNeverPaid) {
      suspicious.push({ email: row.email, reason: "eligible_but_trial_only" });
    }
    if (looksLikeProdFlagEmail(row.email) || looksLikeTestEmail(row.email) || testAccountGuard.isEphemeralTestAccountEmail(row.email)) {
      suspicious.push({ email: row.email, reason: "eligible_looks_internal_or_test" });
    }
    if (OWNER_ADMIN_ALIASES.includes(row.email)) {
      suspicious.push({ email: row.email, reason: "eligible_owner_admin_alias" });
    }
  }
  return {
    dryRun: true,
    willSend: false,
    campaign: CAMPAIGN_ID,
    campaignName: CAMPAIGN_NAME,
    channel: CHANNEL,
    emailWillSend: false,
    pushWillSend: false,
    counts: {
      totalUsers: Object.keys(users).length,
      evaluated: seen.size,
      currentPaidFound,
      selected: eligible.length,
      excluded: excluded.length,
    },
    exclusionTotals,
    suspicious,
    recipients: eligible.map((row) => ({
      userId: row.userId,
      firstName: row.firstName,
      email: row.email,
      currentPlan: row.currentPlan,
      accessKey: row.accessKey,
      accountStatus: row.accountStatus,
      greeting: row.firstName ? `Hi ${row.firstName}!` : "Hi!",
      inAppPreview: buildContent({ firstName: row.firstName, siteUrl: options.siteUrl }),
    })),
    excluded: excluded.slice(0, 80).map((row) => ({
      email: row.email,
      excludeReasons: row.excludeReasons,
      currentPlan: row.currentPlan,
    })),
    inApp: content,
    confirmPhraseRequired: CONFIRM_PHRASE,
    notes: [
      "IN-APP ONLY. Dry-run writes no notification rows, receipts, emails, or web-push.",
      "Audience is canonical current paid access minus trial-only users who have never successfully paid.",
      "Canceled-but-still-paid users remain eligible while membershipHasProAccess is true.",
    ],
  };
}

function createPaidUserCheckin(deps = {}) {
  const {
    readStore,
    writeStore,
    getAdminEmail = () => "",
    getAdminEmails = () => [],
    siteUrl = "",
  } = deps;

  function adminEmailList(override) {
    const extra = Array.isArray(override) ? override : [];
    return [...extra, getAdminEmail(), ...(getAdminEmails() || [])].map(normalizeEmail).filter(Boolean);
  }

  function dryRun(options = {}) {
    const store = options.store || readStore();
    const beforeNotifications = Array.isArray(store.notifications) ? store.notifications.length : 0;
    const beforePromoCampaign = JSON.stringify(store?.emailEngagement?.settings?.freeUserThankYou6 || null);
    const report = buildDryRun(store, {
      adminEmails: adminEmailList(options.adminEmails),
      nowMs: options.nowMs,
      siteUrl: options.siteUrl || siteUrl,
    });
    const state = ensureState(store);
    const dryRunToken = crypto.randomBytes(16).toString("hex");
    const confirmationToken = crypto.randomBytes(16).toString("hex");
    const dryRunAt = new Date().toISOString();
    state.dryRunToken = dryRunToken;
    state.confirmationToken = confirmationToken;
    state.dryRunAt = dryRunAt;
    state.lastDryRunSummary = {
      at: dryRunAt,
      recipientCount: report.counts.selected,
      recipientEmails: report.recipients.map((row) => row.email),
    };
    if (typeof writeStore === "function" && options.persist !== false) writeStore(store);
    const afterNotifications = Array.isArray(store.notifications) ? store.notifications.length : 0;
    return {
      ...report,
      dryRunToken,
      confirmationToken,
      dryRunAt,
      notificationsWritten: afterNotifications - beforeNotifications,
      receiptsWritten: 0,
      promoCampaignUntouched: beforePromoCampaign === JSON.stringify(store?.emailEngagement?.settings?.freeUserThankYou6 || null),
      sendUnlocked: Boolean(!state.sentAt && report.counts.selected > 0 && dryRunToken && confirmationToken),
      alreadySent: Boolean(state.sentAt),
      sentAt: state.sentAt || "",
    };
  }

  function send(options = {}) {
    if (process.env.NODE_ENV === "test" && options.allowTestHarnessSend !== true) {
      return {
        sent: 0,
        skipped: true,
        reason: "test_mode_blocked",
        notificationsWritten: 0,
        emailsSent: 0,
        webPushSent: 0,
      };
    }
    const store = options.store || readStore();
    const state = ensureState(store);
    if (state.sentAt && !options.forceResend) {
      return {
        sent: 0,
        skipped: true,
        reason: "already_sent",
        sentAt: state.sentAt,
        notificationsWritten: 0,
        emailsSent: 0,
        webPushSent: 0,
      };
    }
    if (String(options.confirmPhrase || "").trim() !== CONFIRM_PHRASE || options.confirm !== true) {
      return {
        sent: 0,
        skipped: true,
        reason: "confirmation_required",
        notificationsWritten: 0,
        emailsSent: 0,
        webPushSent: 0,
      };
    }
    if (!state.dryRunToken || options.dryRunToken !== state.dryRunToken) {
      return { sent: 0, skipped: true, reason: "dry_run_required", notificationsWritten: 0, emailsSent: 0, webPushSent: 0 };
    }
    if (!state.confirmationToken || options.confirmationToken !== state.confirmationToken) {
      return { sent: 0, skipped: true, reason: "confirmation_screen_required", notificationsWritten: 0, emailsSent: 0, webPushSent: 0 };
    }

    const beforePromoCampaign = JSON.stringify(store?.emailEngagement?.settings?.freeUserThankYou6 || null);
    const beforeUsers = JSON.stringify(store.users || {});
    const report = buildDryRun(store, {
      adminEmails: adminEmailList(options.adminEmails),
      siteUrl: options.siteUrl || siteUrl,
    });
    const approved = new Set((state.lastDryRunSummary?.recipientEmails || []).map(normalizeEmail));
    const remaining = report.recipients.filter((row) => (
      approved.has(row.email)
      && !alreadyReceived(state, row.email)
      && !existingCampaignNotification(store, row.email)
    ));
    const unexpected = report.recipients.map((row) => row.email).filter((email) => !approved.has(email));
    if (unexpected.length) {
      return {
        sent: 0,
        skipped: true,
        reason: "recipient_drift",
        drift: unexpected.slice(0, 25),
        notificationsWritten: 0,
        emailsSent: 0,
        webPushSent: 0,
      };
    }
    if (!remaining.length) {
      return { sent: 0, skipped: true, reason: "no_recipients", notificationsWritten: 0, emailsSent: 0, webPushSent: 0 };
    }

    const dropped = (state.lastDryRunSummary?.recipientEmails || [])
      .map(normalizeEmail)
      .filter((email) => !remaining.some((row) => row.email === email));

    const beforeNotifications = Array.isArray(store.notifications) ? store.notifications.length : 0;
    const created = [];
    const failures = [];
    for (const row of remaining) {
      const content = buildContent({ firstName: row.firstName, siteUrl: options.siteUrl || siteUrl });
      const written = writeInAppNotificationsOnly(store, {
        recipients: [row.email],
        title: content.title,
        preview: content.body,
        deepLink: content.ctaPath,
      });
      const match = written[0] || existingCampaignNotification(store, row.email);
      if (!match?.id) {
        failures.push({ email: row.email, reason: "notification_write_failed" });
        continue;
      }
      state.recipientReceipts[row.email] = {
        campaignId: CAMPAIGN_ID,
        email: row.email,
        userId: row.userId,
        in_app: {
          campaignId: CAMPAIGN_ID,
          channel: CHANNEL,
          notificationId: match.id,
          sentAt: match.createdAt,
        },
      };
      created.push({ email: row.email, notificationId: match.id });
    }

    const nowIso = new Date().toISOString();
    if (created.length) {
      state.sentAt = nowIso;
      state.recipientCount = created.length;
      state.dryRunToken = "";
      state.confirmationToken = "";
    }
    state.lastPostSendReport = {
      sentAt: state.sentAt || "",
      attempted: remaining.length,
      successful: created.length,
      failed: failures.length,
      dropped,
      emailsSent: 0,
      webPushSent: 0,
      membershipRecordsModified: false,
      billingRecordsModified: false,
    };
    const afterNotifications = Array.isArray(store.notifications) ? store.notifications.length : 0;
    if (typeof writeStore === "function") writeStore(store);
    return {
      sent: created.length,
      failed: failures.length,
      skipped: false,
      reason: "sent",
      sentAt: state.sentAt,
      campaignId: CAMPAIGN_ID,
      channel: CHANNEL,
      notificationsWritten: Math.max(0, afterNotifications - beforeNotifications),
      emailsSent: 0,
      webPushSent: 0,
      emailSent: false,
      productionInAppSent: created.length > 0,
      dropped,
      replacementsAdded: [],
      failures,
      deliveries: created,
      promoCampaignUntouched: beforePromoCampaign === JSON.stringify(store?.emailEngagement?.settings?.freeUserThankYou6 || null),
      membershipRecordsModified: beforeUsers !== JSON.stringify(store.users || {}),
      billingRecordsModified: false,
      accountAccessModified: false,
      stripeUntouched: true,
    };
  }

  function getReport(options = {}) {
    const store = options.store || readStore();
    const state = ensureState(store);
    return {
      ok: true,
      campaign: CAMPAIGN_ID,
      channel: CHANNEL,
      sent: Boolean(state.sentAt),
      sentAt: state.sentAt || "",
      recipientCount: Number(state.recipientCount || 0),
      receiptCount: Object.keys(state.recipientReceipts || {}).length,
      notificationsWritten: (Array.isArray(store.notifications) ? store.notifications : [])
        .filter((row) => String(row?.refId || "") === CAMPAIGN_ID).length,
      lastDryRun: state.lastDryRunSummary || null,
      lastPostSendReport: state.lastPostSendReport || null,
    };
  }

  return { dryRun, send, getReport, CAMPAIGN_ID, CONFIRM_PHRASE };
}

module.exports = {
  CAMPAIGN_ID,
  CAMPAIGN_NAME,
  CONFIRM_PHRASE,
  TITLE,
  BODY_CORE,
  CTA_LABEL,
  CTA_PATH,
  buildContent,
  buildBody,
  sanitizeFirstName,
  validatePaidCheckinRecipient,
  buildDryRun,
  writeInAppNotificationsOnly,
  createPaidUserCheckin,
  alreadyReceived,
  ensureState,
};
