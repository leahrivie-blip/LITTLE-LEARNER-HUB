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
    displayName: "Free User Thank You — THANKYOU6",
    title: thankYou6InApp.IN_APP_TITLE,
    body: thankYou6InApp.IN_APP_BODY,
    ctaLabel: thankYou6InApp.IN_APP_CTA_LABEL,
    ctaDestination: thankYou6Checkout.checkoutCtaPath(),
    channel: "In-app",
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
  };
}

function publicCampaignItem(item) {
  if (!item) return null;
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
    emailSent: item.emailSent === true,
    webPushSent: item.webPushSent === true,
    emailLabel: item.emailSent === true ? "Sent" : "Not sent",
    webPushLabel: item.webPushSent === true ? "Sent" : "Not sent",
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

  return publicCampaignItem({
    campaignId: PAID_CAMPAIGN_ID,
    displayName: meta.displayName,
    channel: meta.channel,
    title,
    body,
    preview,
    ctaLabel: meta.ctaLabel,
    ctaDestination: meta.ctaDestination,
    sentAt: safeText(state?.sentAt || notifications[0]?.createdAt || deliveredReceipts[0]?.in_app?.sentAt, 40),
    attemptedCount,
    successCount,
    failureCount,
    recipientCount: recipients.length || successCount,
    emailSent,
    webPushSent,
    recipients,
  });
}

function thankYou6InAppReceipts(state) {
  const receipts = asObject(state?.recipientReceipts) || {};
  return Object.values(receipts).filter((row) => {
    const inApp = asObject(row?.in_app);
    return Boolean(inApp && (inApp.notificationId || inApp.sentAt));
  });
}

function buildThankYou6History(store) {
  const meta = knownCampaignMeta(THANKYOU6_CAMPAIGN_ID);
  const state = readThankYou6State(store);
  const inAppReceipts = thankYou6InAppReceipts(state);
  const notifications = notificationsForCampaign(store, THANKYOU6_CAMPAIGN_ID);
  const inAppSentAt = safeText(state?.inAppSentAt, 40);
  const emailSentAt = safeText(state?.sentAt, 40);
  const hasInAppEvidence = Boolean(inAppSentAt || inAppReceipts.length || notifications.length);
  const hasEmailEvidence = Boolean(emailSentAt);
  if (!hasInAppEvidence && !hasEmailEvidence) return null;

  const emailReceipts = Object.values(asObject(state?.recipientReceipts) || {}).filter((row) => {
    const email = asObject(row?.email) || row;
    return Boolean(email?.sentAt || email?.messageId);
  });

  const successCount = hasInAppEvidence
    ? (finiteCount(state?.inAppRecipientCount) != null
      ? finiteCount(state.inAppRecipientCount)
      : Math.max(inAppReceipts.length, notifications.length))
    : (finiteCount(state?.recipientCount) != null ? finiteCount(state.recipientCount) : emailReceipts.length);
  const attemptedCount = successCount;
  const recipients = uniqueRecipients([
    ...inAppReceipts.map((row) => {
      const email = normalizeEmail(row.email);
      const inApp = asObject(row.in_app) || {};
      return {
        ...recipientFromUser(store, email),
        delivered: true,
        notificationId: safeText(inApp.notificationId, 120),
      };
    }),
    ...notifications.map((row) => ({
      ...recipientFromUser(store, normalizeEmail(row.email)),
      delivered: true,
      notificationId: safeText(row.id, 120),
    })),
    ...(!hasInAppEvidence ? emailReceipts.map((row) => ({
      ...recipientFromUser(store, normalizeEmail(row.email)),
      delivered: Boolean(row.sentAt || row.messageId),
      notificationId: "",
    })) : []),
  ]);

  const sampleTitle = safeText(notifications[0]?.title, 200);
  const samplePreview = safeText(notifications[0]?.preview, 400);
  const channel = hasInAppEvidence && hasEmailEvidence
    ? "In-app + Email"
    : hasInAppEvidence
      ? "In-app"
      : "Email";

  return publicCampaignItem({
    campaignId: THANKYOU6_CAMPAIGN_ID,
    displayName: meta.displayName,
    channel,
    title: sampleTitle || meta.title,
    body: meta.body,
    preview: samplePreview || meta.body,
    ctaLabel: meta.ctaLabel,
    ctaDestination: meta.ctaDestination,
    sentAt: inAppSentAt || emailSentAt || notifications[0]?.createdAt || "",
    attemptedCount,
    successCount,
    failureCount: 0,
    recipientCount: recipients.length || successCount,
    emailSent: hasEmailEvidence,
    webPushSent: false,
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
  return {
    notificationCount: Array.isArray(store?.notifications) ? store.notifications.length : 0,
    paidReceiptCount: Object.keys(asObject(paid?.recipientReceipts) || {}).length,
    paidSentAt: safeText(paid?.sentAt, 40),
    thankYou6ReceiptCount: Object.keys(asObject(thankyou?.recipientReceipts) || {}).length,
    thankYou6SentAt: safeText(thankyou?.sentAt, 40),
    thankYou6InAppSentAt: safeText(thankyou?.inAppSentAt, 40),
    paidJson: JSON.stringify(paid || null),
    thankYou6Json: JSON.stringify(thankyou || null),
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
