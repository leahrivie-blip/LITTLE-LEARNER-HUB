/**
 * Isolated THANKYOU6 in-app campaign.
 * Reuses store.notifications + fanOutNotificationsAndPush.
 * Dry-run never writes notification rows or channel receipts.
 * Production send requires SEND_THANKYOU6_IN_APP and does not send email.
 */

const crypto = require("crypto");
const thankYou6Checkout = require("./thankyou6-checkout.js");
const {
  CAMPAIGN_ID,
  buildThankYou6RecipientDryRun,
  alreadyReceived,
  defaultCampaignState,
} = require("./free-user-thankyou6-email.js");

const IN_APP_CONFIRM_PHRASE = "SEND_THANKYOU6_IN_APP";
const IN_APP_TYPE = "feature_update";
const IN_APP_TITLE = "A little thank-you from Little Learner Hub 💛";
const IN_APP_BODY = "Thanks for being part of Little Learner Hub while I keep building and improving it for childcare providers like you. For a limited time, you can get your first month of Early User access for $7.99 with code THANKYOU6.";
const IN_APP_CTA_LABEL = "Upgrade for $7.99";
const IN_APP_WARNING = "You are about to create in-app THANKYOU6 messages for N Free users.";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function buildInAppContent(options = {}) {
  const ctaPath = thankYou6Checkout.checkoutCtaPath();
  const ctaUrl = thankYou6Checkout.checkoutCtaUrl(options.siteUrl);
  return {
    title: IN_APP_TITLE,
    body: IN_APP_BODY,
    preview: IN_APP_BODY,
    ctaLabel: IN_APP_CTA_LABEL,
    ctaPath,
    ctaUrl,
    type: IN_APP_TYPE,
    campaign: CAMPAIGN_ID,
    checkoutPlan: thankYou6Checkout.CHECKOUT_PLAN,
  };
}

function ensureState(store) {
  if (!store.emailEngagement || typeof store.emailEngagement !== "object") {
    store.emailEngagement = { settings: {}, events: [] };
  }
  const eng = store.emailEngagement;
  eng.settings = eng.settings || {};
  if (!eng.settings.freeUserThankYou6 || typeof eng.settings.freeUserThankYou6 !== "object") {
    eng.settings.freeUserThankYou6 = defaultCampaignState();
  } else {
    const defaults = defaultCampaignState();
    for (const [key, value] of Object.entries(defaults)) {
      if (eng.settings.freeUserThankYou6[key] === undefined) {
        eng.settings.freeUserThankYou6[key] = value;
      }
    }
  }
  const state = eng.settings.freeUserThankYou6;
  state.recipientReceipts = state.recipientReceipts && typeof state.recipientReceipts === "object"
    ? state.recipientReceipts
    : {};
  return state;
}

function notificationCountForCampaign(store) {
  const rows = Array.isArray(store?.notifications) ? store.notifications : [];
  return rows.filter((row) => String(row?.refId || "") === CAMPAIGN_ID).length;
}

function hasExistingInAppNotification(store, email) {
  const needle = normalizeEmail(email);
  return (Array.isArray(store?.notifications) ? store.notifications : []).some((row) => (
    String(row?.refId || "") === CAMPAIGN_ID
    && normalizeEmail(row?.email) === needle
  ));
}

function findCampaignNotification(store, email) {
  const needle = normalizeEmail(email);
  return (Array.isArray(store?.notifications) ? store.notifications : []).find((row) => (
    String(row?.refId || "") === CAMPAIGN_ID
    && normalizeEmail(row?.email) === needle
  )) || null;
}

function buildInAppDryRun(store, options = {}) {
  const content = buildInAppContent({ siteUrl: options.siteUrl });
  const report = buildThankYou6RecipientDryRun(store, {
    ...options,
    channel: "in_app",
  });
  const state = ensureState(store);
  return {
    ...report,
    channel: "in_app",
    willSend: false,
    inApp: content,
    recipients: (report.recipients || []).map((row) => ({
      ...row,
      eligible: true,
      exclusionReason: "",
      emailReceipt: alreadyReceived(state, row.email, "email"),
      inAppReceipt: alreadyReceived(state, row.email, "in_app"),
      inAppPreview: content,
      ctaPath: content.ctaPath,
    })),
    alreadySent: Boolean(state.inAppSentAt),
    sentAt: state.inAppSentAt || "",
    existingInAppNotifications: notificationCountForCampaign(store),
    confirmPhraseRequired: IN_APP_CONFIRM_PHRASE,
    confirmationWarning: IN_APP_WARNING.replace("N", String(report.counts?.selected || 0)),
    notes: [
      "Same canonical eligibility as the THANKYOU6 email list.",
      "Marketing opt-out (emailPrefs.marketing === false / unsubscribedAt) is honored for this promotional in-app message because the app has no separate in-app promo preference.",
      "Dry-run writes no notification rows and no in-app receipts.",
    ],
  };
}

function createThankYou6InApp(deps = {}) {
  const {
    readStore,
    writeStore,
    fanOutNotificationsAndPush,
    getAdminEmail = () => "",
    getAdminEmails = () => [],
    siteUrl = "",
  } = deps;

  function adminEmailList(override) {
    const extra = Array.isArray(override) ? override : [];
    return [...extra, getAdminEmail(), ...(getAdminEmails() || [])]
      .map(normalizeEmail)
      .filter(Boolean);
  }

  function dryRun(options = {}) {
    const store = options.store || readStore();
    const beforeNotifications = Array.isArray(store.notifications) ? store.notifications.length : 0;
    const report = buildInAppDryRun(store, {
      adminEmails: adminEmailList(options.adminEmails),
      nowMs: options.nowMs,
      siteUrl: options.siteUrl || siteUrl,
    });
    const state = ensureState(store);
    const dryRunToken = crypto.randomBytes(16).toString("hex");
    const confirmationToken = crypto.randomBytes(16).toString("hex");
    const dryRunAt = new Date().toISOString();
    state.inAppPreparedAt = dryRunAt;
    state.inAppDryRunToken = dryRunToken;
    state.inAppDryRunAt = dryRunAt;
    state.inAppConfirmationToken = confirmationToken;
    state.lastInAppDryRunSummary = {
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
      sendUnlocked: Boolean(
        !state.inAppSentAt
        && !report.insufficientActivityData
        && report.counts.selected > 0
        && dryRunToken
        && confirmationToken
      ),
    };
  }

  async function send(options = {}) {
    if (process.env.NODE_ENV === "test" && options.allowTestHarnessSend !== true) {
      return {
        sent: 0,
        skipped: true,
        reason: "test_mode_blocked",
        productionInAppSent: false,
        notificationsWritten: 0,
      };
    }
    const store = readStore();
    const state = ensureState(store);
    if (state.inAppSentAt && !options.forceResend) {
      return {
        sent: 0,
        skipped: true,
        reason: "already_sent",
        sentAt: state.inAppSentAt,
        productionInAppSent: true,
        notificationsWritten: 0,
      };
    }
    if (String(options.confirmPhrase || "").trim() !== IN_APP_CONFIRM_PHRASE || options.confirm !== true) {
      return {
        sent: 0,
        skipped: true,
        reason: "confirmation_required",
        detail: `Pass confirm:true and confirmPhrase "${IN_APP_CONFIRM_PHRASE}".`,
        notificationsWritten: 0,
      };
    }
    if (!state.inAppDryRunToken || options.dryRunToken !== state.inAppDryRunToken) {
      return { sent: 0, skipped: true, reason: "dry_run_required", notificationsWritten: 0 };
    }
    if (!state.inAppConfirmationToken || options.confirmationToken !== state.inAppConfirmationToken) {
      return { sent: 0, skipped: true, reason: "confirmation_screen_required", notificationsWritten: 0 };
    }
    const dryRunAgeMs = Date.now() - new Date(state.inAppDryRunAt || 0).getTime();
    if (!Number.isFinite(dryRunAgeMs) || dryRunAgeMs < 0 || dryRunAgeMs > 2 * 60 * 60 * 1000) {
      return { sent: 0, skipped: true, reason: "dry_run_expired", notificationsWritten: 0 };
    }

    const beforeNotifications = Array.isArray(store.notifications) ? store.notifications.length : 0;
    const report = buildInAppDryRun(store, {
      adminEmails: adminEmailList(options.adminEmails),
      siteUrl: options.siteUrl || siteUrl,
    });
    if (!report.recipients.length) {
      return { sent: 0, skipped: true, reason: "no_recipients", notificationsWritten: 0 };
    }
    const approved = new Set((state.lastInAppDryRunSummary?.recipientEmails || []).map(normalizeEmail));
    const unexpected = report.recipients.map((row) => row.email).filter((email) => !approved.has(email));
    if (unexpected.length) {
      return { sent: 0, skipped: true, reason: "recipient_drift", drift: unexpected.slice(0, 25), notificationsWritten: 0 };
    }

    const remaining = report.recipients.filter((row) => (
      !alreadyReceived(state, row.email, "in_app")
      && !hasExistingInAppNotification(store, row.email)
    ));
    const content = buildInAppContent({ siteUrl: options.siteUrl || siteUrl });
    if (!remaining.length) {
      return { sent: 0, skipped: true, reason: "already_received", notificationsWritten: 0 };
    }
    if (typeof fanOutNotificationsAndPush !== "function") {
      return { sent: 0, skipped: true, reason: "fanout_unavailable", notificationsWritten: 0 };
    }

    const fanout = await fanOutNotificationsAndPush(store, {
      type: IN_APP_TYPE,
      recipients: remaining.map((row) => row.email),
      title: content.title,
      preview: content.body,
      refId: CAMPAIGN_ID,
      url: content.ctaPath,
      deepLink: content.ctaPath,
      category: "thankyou6",
    });

    const nowIso = new Date().toISOString();
    for (const row of remaining) {
      const match = findCampaignNotification(store, row.email);
      const prior = state.recipientReceipts[row.email] && typeof state.recipientReceipts[row.email] === "object"
        ? state.recipientReceipts[row.email]
        : {};
      state.recipientReceipts[row.email] = {
        ...prior,
        in_app: {
          campaignId: CAMPAIGN_ID,
          channel: "in_app",
          notificationId: match?.id || "",
          sentAt: nowIso,
        },
      };
    }
    Object.assign(state, {
      inAppSentAt: nowIso,
      inAppRecipientCount: remaining.length,
      inAppDeliveries: remaining.map((row) => ({ email: row.email, sentAt: nowIso })),
      inAppDryRunToken: "",
      inAppConfirmationToken: "",
    });
    const afterNotifications = Array.isArray(store.notifications) ? store.notifications.length : 0;
    writeStore(store);
    return {
      sent: remaining.length,
      skipped: false,
      reason: "sent",
      sentAt: nowIso,
      productionInAppSent: true,
      emailSent: false,
      notificationsWritten: Math.max(0, afterNotifications - beforeNotifications),
      fanout,
      membershipRecordsModified: false,
      billingRecordsModified: false,
    };
  }

  function getReport(options = {}) {
    const store = options.store || readStore();
    const state = ensureState(store);
    return {
      ok: true,
      channel: "in_app",
      sent: Boolean(state.inAppSentAt),
      sentAt: state.inAppSentAt || "",
      recipientCount: Number(state.inAppRecipientCount || 0),
      notificationsWritten: notificationCountForCampaign(store),
      lastDryRun: state.lastInAppDryRunSummary || null,
      confirmPhraseRequired: IN_APP_CONFIRM_PHRASE,
      emailSent: Boolean(state.sentAt),
    };
  }

  return {
    IN_APP_CONFIRM_PHRASE,
    dryRun,
    send,
    getReport,
    buildInAppContent,
  };
}

module.exports = {
  IN_APP_CONFIRM_PHRASE,
  IN_APP_TITLE,
  IN_APP_BODY,
  IN_APP_CTA_LABEL,
  IN_APP_TYPE,
  buildInAppContent,
  buildInAppDryRun,
  createThankYou6InApp,
};
