/**
 * Read-only owner Sent history for in-app campaigns.
 *
 * Assembles Admin → Messages → Sent from persisted campaign receipts
 * and notification evidence. Never sends, never writes the store, and
 * never creates notifications or receipts.
 */
"use strict";

const paidUserCheckin = require("./paid-user-checkin.js");
const thankYou6InApp = require("./thankyou6-in-app.js");
const thankYou6Checkout = require("./thankyou6-checkout.js");
const thankYou6Email = require("./free-user-thankyou6-email.js");

const PAID_CAMPAIGN_ID = paidUserCheckin.CAMPAIGN_ID;
const THANKYOU6_CAMPAIGN_ID = thankYou6Checkout.CAMPAIGN_ID;

const KNOWN_CAMPAIGNS = Object.freeze({
  [PAID_CAMPAIGN_ID]: {
    campaignId: PAID_CAMPAIGN_ID,
    displayName: "Paid User Check-In",
    title: paidUserCheckin.TITLE,
    body: paidUserCheckin.BODY_CORE,
    ctaLabel: paidUserCheckin.CTA_LABEL,
    ctaDestination: paidUserCheckin.CTA_PATH,
    channel: "In-app",
  },
  [THANKYOU6_CAMPAIGN_ID]: {
    campaignId: THANKYOU6_CAMPAIGN_ID,
    displayName: thankYou6Email.CAMPAIGN_NAME || "Free User Thank You — THANKYOU6",
    title: thankYou6InApp.IN_APP_TITLE,
    body: thankYou6InApp.IN_APP_BODY,
    emailSubject: thankYou6Email.EMAIL_SUBJECT,
    ctaLabel: thankYou6InApp.IN_APP_CTA_LABEL,
    ctaDestination: thankYou6Checkout.checkoutCtaPath(),
    channel: "Email + In-app",
  },
});

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function safeText(value, max = 4000) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return "";
  return text.length > max ? text.slice(0, max) : text;
}

function knownCampaignMeta(campaignId) {
  const id = String(campaignId || "").trim();
  return KNOWN_CAMPAIGNS[id] || null;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function notificationsForCampaign(store, campaignId) {
  const id = String(campaignId || "");
  return (Array.isArray(store?.notifications) ? store.notifications : []).filter(
    (row) => row && String(row.refId || "") === id,
  );
}

function finiteCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function recipientFromUser(store, email) {
  const users = asObject(store?.users) || {};
  const user = users[email] || Object.values(users).find((row) => normalizeEmail(row?.email) === email) || {};
  return {
    email,
    userId: safeText(user.id || user.userId || email, 200),
    firstName: safeText(user.firstName || user.name || "", 80),
  };
}

function uniqueRecipients(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const email = normalizeEmail(row?.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(row);
  }
  return out;
}

function publicRecipient(row) {
  return {
    email: safeText(row.email, 200),
    userId: safeText(row.userId || row.email, 200),
    firstName: safeText(row.firstName, 80),
    delivered: row.delivered === true,
    notificationId: safeText(row.notificationId, 120),
    channel: safeText(row.channel, 20),
  };
}

function publicChannel(channel) {
  if (!channel || channel.sent !== true) return null;
  return {
    label: safeText(channel.label, 40),
    sent: true,
    sentAt: safeText(channel.sentAt, 40),
    attemptedCount: Number(channel.attemptedCount) || 0,
    successCount: Number(channel.successCount) || 0,
    failureCount: Number(channel.failureCount) || 0,
    recipientCount: Number(channel.recipientCount) || 0,
    receiptCount: Number(channel.receiptCount) || 0,
    title: safeText(channel.title, 200),
    body: safeText(channel.body, 4000),
    ctaLabel: safeText(channel.ctaLabel, 120),
    ctaDestination: safeText(channel.ctaDestination, 400),
  };
}

function publicCampaignItem(item) {
  if (!item) return null;
  const emailChannel = publicChannel(item.channels?.email);
  const inAppChannel = publicChannel(item.channels?.inApp);
  return {
    campaignId: item.campaignId,
    displayName: item.displayName,
    kind: "campaign",
    channel: item.channel,
    title: item.title,
    body: item.body,
    preview: item.preview,
    ctaLabel: item.ctaLabel,
    ctaDestination: item.ctaDestination,
    sentAt: item.sentAt,
    attemptedCount: item.attemptedCount,
    successCount: item.successCount,
    failureCount: item.failureCount,
    recipientCount: item.recipientCount,
    receiptCount: item.receiptCount,
    emailSent: item.emailSent === true,
    webPushSent: item.webPushSent === true,
    emailLabel: item.emailSent === true ? "Sent" : "Not sent",
    webPushLabel: item.webPushSent === true ? "Sent" : "Not sent",
    channels: {
      email: emailChannel,
      inApp: inAppChannel,
    },
    recipients: (item.recipients || []).map(publicRecipient),
  };
}

function readPaidCheckinState(store) {
  return asObject(asObject(store?.inAppCampaigns)?.[PAID_CAMPAIGN_ID]);
}

function readThankYou6State(store) {
  return asObject(asObject(asObject(store?.emailEngagement)?.settings)?.freeUserThankYou6);
}

function receiptDelivered(receipt) {
  const inApp = asObject(receipt?.in_app) || receipt;
  return Boolean(inApp?.notificationId || inApp?.sentAt);
}

function buildPaidCheckinHistory(store) {
  const meta = knownCampaignMeta(PAID_CAMPAIGN_ID);
  const state = readPaidCheckinState(store);
  const receipts = asObject(state?.recipientReceipts) || {};
  const receiptRows = Object.values(receipts).filter((row) => asObject(row));
  const notifications = notificationsForCampaign(store, PAID_CAMPAIGN_ID);
  if (!state?.sentAt && !receiptRows.length && !notifications.length) return null;

  const report = asObject(state?.lastPostSendReport) || {};
  const deliveredReceipts = receiptRows.filter(receiptDelivered);
  const successFromReport = finiteCount(report.successful);
  const attemptedFromReport = finiteCount(report.attempted);
  const failedFromReport = finiteCount(report.failed);
  const successCount = successFromReport != null
    ? successFromReport
    : Math.max(deliveredReceipts.length, notifications.length);
  const attemptedCount = attemptedFromReport != null
    ? attemptedFromReport
    : (finiteCount(state?.recipientCount) != null ? finiteCount(state.recipientCount) : successCount);
  const failureCount = failedFromReport != null
    ? failedFromReport
    : Math.max(0, attemptedCount - successCount);

  const notifByEmail = new Map(
    notifications.map((row) => [normalizeEmail(row.email), row]),
  );
  const recipients = uniqueRecipients([
    ...deliveredReceipts.map((row) => {
      const email = normalizeEmail(row.email);
      const inApp = asObject(row.in_app) || {};
      const notif = notifByEmail.get(email);
      return {
        ...recipientFromUser(store, email),
        delivered: true,
        notificationId: safeText(inApp.notificationId || notif?.id, 120),
      };
    }),
    ...notifications.map((row) => {
      const email = normalizeEmail(row.email);
      return {
        ...recipientFromUser(store, email),
        delivered: true,
        notificationId: safeText(row.id, 120),
      };
    }),
  ]);

  const sampleTitle = safeText(notifications[0]?.title, 200);
  const samplePreview = safeText(notifications[0]?.preview, 400);
  const title = sampleTitle || meta.title;
  const body = meta.body;
  const preview = samplePreview || body;

  const emailSent = finiteCount(report.emailsSent) > 0 || report.emailSent === true;
  const webPushSent = finiteCount(report.webPushSent) > 0 || report.pushSent === true;
  const sentAt = safeText(state?.sentAt || notifications[0]?.createdAt || deliveredReceipts[0]?.in_app?.sentAt, 40);
  const inAppChannel = {
    label: "In-app",
    sent: true,
    sentAt,
    attemptedCount,
    successCount,
    failureCount,
    recipientCount: recipients.length || successCount,
    receiptCount: deliveredReceipts.length,
    title,
    body,
    ctaLabel: meta.ctaLabel,
    ctaDestination: meta.ctaDestination,
  };

  return publicCampaignItem({
    campaignId: PAID_CAMPAIGN_ID,
    displayName: meta.displayName,
    channel: meta.channel,
    title,
    body,
    preview,
    ctaLabel: meta.ctaLabel,
    ctaDestination: meta.ctaDestination,
    sentAt,
    attemptedCount,
    successCount,
    failureCount,
    recipientCount: recipients.length || successCount,
    receiptCount: deliveredReceipts.length,
    emailSent,
    webPushSent,
    channels: { email: null, inApp: inAppChannel },
    recipients,
  });
}

function strongestCount(...candidates) {
  const values = candidates
    .map((value) => finiteCount(value))
    .filter((value) => value != null);
  return values.length ? Math.max(...values) : 0;
}

function emailReceiptEmail(key, receipt) {
  return normalizeEmail(key || receipt?.email || asObject(receipt?.email)?.email);
}

function thankYou6EmailReceipts(state) {
  const receipts = asObject(state?.recipientReceipts) || {};
  const out = [];
  for (const [key, receipt] of Object.entries(receipts)) {
    if (!asObject(receipt)) continue;
    const channel = thankYou6Email.channelReceiptOf(state, key, "email");
    const nested = asObject(receipt.email);
    const proven = Boolean(
      (channel && (channel.sentAt || channel.messageId || channel.apiAccepted || channel.deliveryStatus))
      || (nested && (nested.sentAt || nested.messageId || nested.apiAccepted || nested.deliveryStatus))
      || receipt.messageId
      || (receipt.sentAt && (receipt.apiAccepted || receipt.deliveryStatus || receipt.channel === "email"))
    );
    if (!proven) continue;
    const email = emailReceiptEmail(key, receipt);
    if (!email) continue;
    out.push({
      email,
      sentAt: safeText(nested?.sentAt || channel?.sentAt || receipt.sentAt, 40),
      messageId: safeText(nested?.messageId || channel?.messageId || receipt.messageId, 120),
    });
  }
  return uniqueRecipients(out);
}

function thankYou6InAppReceipts(state) {
  const receipts = asObject(state?.recipientReceipts) || {};
  const out = [];
  for (const [key, receipt] of Object.entries(receipts)) {
    if (!asObject(receipt)) continue;
    const channel = thankYou6Email.channelReceiptOf(state, key, "in_app");
    const nested = asObject(receipt.in_app);
    if (!channel && !nested) continue;
    if (!(nested?.notificationId || nested?.sentAt || channel?.notificationId || channel?.sentAt)) continue;
    const email = emailReceiptEmail(key, receipt);
    if (!email) continue;
    out.push({
      email,
      sentAt: safeText(nested?.sentAt || channel?.sentAt, 40),
      notificationId: safeText(nested?.notificationId || channel?.notificationId, 120),
    });
  }
  return uniqueRecipients(out);
}

function thankYou6EmailDeliveries(state) {
  return (Array.isArray(state?.deliveries) ? state.deliveries : [])
    .filter((row) => asObject(row) && (row.sentAt || row.messageId || row.deliveryStatus))
    .map((row) => ({
      email: normalizeEmail(row.email),
      sentAt: safeText(row.sentAt, 40),
      messageId: safeText(row.messageId, 120),
    }))
    .filter((row) => row.email);
}

function thankYou6InAppDeliveries(state) {
  return (Array.isArray(state?.inAppDeliveries) ? state.inAppDeliveries : [])
    .filter((row) => asObject(row) && (row.sentAt || row.notificationId || row.email))
    .map((row) => ({
      email: normalizeEmail(row.email),
      sentAt: safeText(row.sentAt, 40),
      notificationId: safeText(row.notificationId, 120),
    }))
    .filter((row) => row.email);
}

function thankYou6EmailContent() {
  try {
    const content = thankYou6Email.buildEmailContent({ firstName: "" });
    return {
      title: safeText(content?.subject || thankYou6Email.EMAIL_SUBJECT, 200),
      body: safeText(content?.text, 4000),
      ctaLabel: "Try Pro for $7.99",
      ctaDestination: safeText(content?.ctaUrl || thankYou6Checkout.checkoutCtaUrl(), 400),
    };
  } catch {
    return {
      title: thankYou6Email.EMAIL_SUBJECT,
      body: "",
      ctaLabel: "Try Pro for $7.99",
      ctaDestination: thankYou6Checkout.checkoutCtaUrl(),
    };
  }
}

function buildThankYou6History(store) {
  const meta = knownCampaignMeta(THANKYOU6_CAMPAIGN_ID);
  const state = readThankYou6State(store);
  const notifications = notificationsForCampaign(store, THANKYOU6_CAMPAIGN_ID);
  const emailReceipts = thankYou6EmailReceipts(state);
  const inAppReceipts = thankYou6InAppReceipts(state);
  const emailDeliveries = thankYou6EmailDeliveries(state);
  const inAppDeliveries = thankYou6InAppDeliveries(state);
  const report = asObject(state?.lastPostSendReport) || {};
  const inAppReport = asObject(state?.lastInAppPostSendReport) || {};
  const messageIdCount = Object.keys(asObject(state?.messageIdIndex) || {}).length;

  const emailSentAt = safeText(
    state?.sentAt || report.sentAt || emailReceipts[0]?.sentAt || emailDeliveries[0]?.sentAt,
    40,
  );
  const inAppSentAt = safeText(
    state?.inAppSentAt || inAppReport.sentAt || inAppReceipts[0]?.sentAt || inAppDeliveries[0]?.sentAt || notifications[0]?.createdAt,
    40,
  );

  const hasEmailEvidence = Boolean(
    emailSentAt
    || emailReceipts.length
    || emailDeliveries.length
    || messageIdCount
    || finiteCount(state?.sentCount)
    || finiteCount(state?.deliveredCount)
    || finiteCount(report.totalDelivered)
  );
  const hasInAppEvidence = Boolean(
    inAppSentAt
    || inAppReceipts.length
    || inAppDeliveries.length
    || notifications.length
    || finiteCount(state?.inAppRecipientCount)
    || finiteCount(inAppReport.successful)
  );
  if (!hasEmailEvidence && !hasInAppEvidence) return null;

  const emailSuccess = strongestCount(
    state?.sentCount,
    state?.deliveredCount,
    report.totalDelivered,
    emailReceipts.length,
    emailDeliveries.length,
    messageIdCount,
  );
  const emailAttempted = strongestCount(
    state?.attemptedCount,
    state?.recipientCount,
    report.totalAttempted,
    emailSuccess,
  );
  const emailFailed = finiteCount(state?.failedCount) != null
    ? finiteCount(state.failedCount)
    : (finiteCount(report.totalFailed) != null ? finiteCount(report.totalFailed) : Math.max(0, emailAttempted - emailSuccess));

  const inAppSuccess = strongestCount(
    state?.inAppRecipientCount,
    inAppReport.successful,
    inAppReceipts.length,
    inAppDeliveries.length,
    notifications.length,
  );
  const inAppAttempted = strongestCount(inAppReport.attempted, inAppSuccess);
  const inAppFailed = finiteCount(inAppReport.failed) != null
    ? finiteCount(inAppReport.failed)
    : Math.max(0, inAppAttempted - inAppSuccess);

  const emailCopy = thankYou6EmailContent();
  const emailChannel = hasEmailEvidence
    ? {
      label: "Email",
      sent: true,
      sentAt: emailSentAt,
      attemptedCount: emailAttempted,
      successCount: emailSuccess,
      failureCount: emailFailed,
      recipientCount: emailSuccess || emailAttempted,
      receiptCount: Math.max(emailReceipts.length, emailDeliveries.length, messageIdCount),
      title: emailCopy.title,
      body: emailCopy.body,
      ctaLabel: emailCopy.ctaLabel,
      ctaDestination: emailCopy.ctaDestination,
    }
    : null;
  const inAppChannel = hasInAppEvidence
    ? {
      label: "In-app",
      sent: true,
      sentAt: inAppSentAt,
      attemptedCount: inAppAttempted,
      successCount: inAppSuccess,
      failureCount: inAppFailed,
      recipientCount: inAppSuccess || inAppAttempted,
      receiptCount: Math.max(inAppReceipts.length, notifications.length),
      title: safeText(notifications[0]?.title, 200) || meta.title,
      body: meta.body,
      ctaLabel: meta.ctaLabel,
      ctaDestination: meta.ctaDestination,
    }
    : null;

  const recipients = uniqueRecipients([
    ...inAppReceipts.map((row) => ({
      ...recipientFromUser(store, row.email),
      delivered: true,
      notificationId: row.notificationId,
      channel: "in_app",
    })),
    ...notifications.map((row) => ({
      ...recipientFromUser(store, normalizeEmail(row.email)),
      delivered: true,
      notificationId: safeText(row.id, 120),
      channel: "in_app",
    })),
    ...emailReceipts.map((row) => ({
      ...recipientFromUser(store, row.email),
      delivered: true,
      notificationId: "",
      channel: "email",
    })),
    ...emailDeliveries.map((row) => ({
      ...recipientFromUser(store, row.email),
      delivered: true,
      notificationId: "",
      channel: "email",
    })),
  ]);

  const channelLabel = hasEmailEvidence && hasInAppEvidence
    ? "Email + In-app"
    : hasEmailEvidence
      ? "Email"
      : "In-app";
  const sentAt = [emailSentAt, inAppSentAt].filter(Boolean).sort().slice(-1)[0] || "";

  return publicCampaignItem({
    campaignId: THANKYOU6_CAMPAIGN_ID,
    displayName: "THANKYOU6",
    channel: channelLabel,
    title: hasInAppEvidence ? (inAppChannel.title || meta.title) : emailCopy.title,
    body: hasInAppEvidence ? meta.body : emailCopy.body,
    preview: hasInAppEvidence ? (safeText(notifications[0]?.preview, 400) || meta.body) : emailCopy.body,
    ctaLabel: hasInAppEvidence ? meta.ctaLabel : emailCopy.ctaLabel,
    ctaDestination: hasInAppEvidence ? meta.ctaDestination : emailCopy.ctaDestination,
    sentAt,
    attemptedCount: hasInAppEvidence ? inAppAttempted : emailAttempted,
    successCount: hasInAppEvidence ? inAppSuccess : emailSuccess,
    failureCount: hasInAppEvidence ? inAppFailed : emailFailed,
    recipientCount: hasInAppEvidence ? inAppSuccess : emailSuccess,
    receiptCount: (emailChannel?.receiptCount || 0) + (inAppChannel?.receiptCount || 0),
    emailSent: hasEmailEvidence,
    webPushSent: false,
    channels: { email: emailChannel, inApp: inAppChannel },
    recipients,
  });
}

function listOwnerSentCampaigns(store) {
  return [buildPaidCheckinHistory(store), buildThankYou6History(store)]
    .filter(Boolean)
    .sort((a, b) => String(b.sentAt || "").localeCompare(String(a.sentAt || "")));
}

function getOwnerSentCampaign(store, campaignId) {
  const id = String(campaignId || "").trim();
  if (!id) return null;
  return listOwnerSentCampaigns(store).find((row) => row.campaignId === id) || null;
}

function inferInboxReplyTo(store, userEmail) {
  const email = normalizeEmail(userEmail);
  if (!email) return null;
  const userMessages = (Array.isArray(store?.messages) ? store.messages : [])
    .filter((m) => (
      m
      && m.audience === "private"
      && m.senderType === "user"
      && normalizeEmail(m.conversationEmail || m.senderEmail) === email
    ))
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));

  for (const message of userMessages) {
    const stamped = knownCampaignMeta(message.inReplyToCampaign);
    if (stamped) {
      return { campaignId: stamped.campaignId, displayName: stamped.displayName };
    }
  }

  const campaignNotifs = (Array.isArray(store?.notifications) ? store.notifications : [])
    .filter((n) => n && normalizeEmail(n.email) === email && knownCampaignMeta(n.refId))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  for (const notification of campaignNotifs) {
    const replyAfter = userMessages.find((m) => String(m.createdAt || "") >= String(notification.createdAt || ""));
    if (!replyAfter) continue;
    const meta = knownCampaignMeta(notification.refId);
    return { campaignId: meta.campaignId, displayName: meta.displayName };
  }
  return null;
}

function sanitizeInReplyToCampaign(value) {
  const meta = knownCampaignMeta(value);
  return meta ? meta.campaignId : "";
}

function campaignEvidenceSnapshot(store) {
  const paid = readPaidCheckinState(store);
  const thankyou = readThankYou6State(store);
  const users = asObject(store?.users) || {};
  const stripeFingerprint = JSON.stringify(Object.values(users).map((user) => ([
    normalizeEmail(user?.email),
    user?.stripeCustomerId || "",
    user?.stripeSubscriptionId || "",
    user?.stripeSubscriptionStatus || "",
    user?.plan || "",
  ])));
  return {
    notificationCount: Array.isArray(store?.notifications) ? store.notifications.length : 0,
    paidReceiptCount: Object.keys(asObject(paid?.recipientReceipts) || {}).length,
    paidSentAt: safeText(paid?.sentAt, 40),
    thankYou6ReceiptCount: Object.keys(asObject(thankyou?.recipientReceipts) || {}).length,
    thankYou6SentAt: safeText(thankyou?.sentAt, 40),
    thankYou6InAppSentAt: safeText(thankyou?.inAppSentAt, 40),
    thankYou6SentCount: finiteCount(thankyou?.sentCount),
    thankYou6InAppRecipientCount: finiteCount(thankyou?.inAppRecipientCount),
    paidJson: JSON.stringify(paid || null),
    thankYou6Json: JSON.stringify(thankyou || null),
    stripeFingerprint,
  };
}

module.exports = {
  PAID_CAMPAIGN_ID,
  THANKYOU6_CAMPAIGN_ID,
  KNOWN_CAMPAIGNS,
  listOwnerSentCampaigns,
  getOwnerSentCampaign,
  inferInboxReplyTo,
  sanitizeInReplyToCampaign,
  campaignEvidenceSnapshot,
  knownCampaignMeta,
};
