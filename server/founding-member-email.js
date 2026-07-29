/**
 * One-time Founding Members thank-you email.
 *
 * Safety:
 * - Dry-run / final confirmation never send.
 * - Send requires confirmPhrase === "SEND_FOUNDING_MEMBER_EMAIL".
 * - One-time only + per-recipient already-received guard.
 * - Does NOT require EMAIL_AUTOMATIONS_ENABLED (keeps drip/weekly/bulk off).
 * - Does NOT modify subscriptions, access levels, or Founding Member records.
 * - Recipients = current confirmed Founding Member access only.
 */

const crypto = require("crypto");
const membershipAccess = require("../scripts/membership-access.js");

const CONFIRM_PHRASE = "SEND_FOUNDING_MEMBER_EMAIL";
const CAMPAIGN_KEY = "founding_member_thank_you";
const TEMPLATE_KEY = "founding_member_thank_you";

const EMAIL_SUBJECT = "💜 A Personal Thank You to Our Founding Members";

const EMAIL_TEXT = [
  "Hi Founding Members,",
  "",
  "I wanted to personally reach out and say thank you for being one of the first people to support Little Learner Hub.",
  "",
  "When I started building this platform, I had one goal: to create an affordable, all-in-one resource built by a childcare provider, for childcare providers. Your early support has helped make that possible.",
  "",
  "As a reminder, your Founding Member pricing is $9.99/month locked while your membership remains continuously active. No matter how many new features, lesson plans, activities, printables, tools, or updates are added in the future, you will continue to keep your special Founding Member rate as long as your membership remains active and in good standing.",
  "",
  "Little Learner Hub already includes a growing lesson plan library, hundreds of activities, calendar and planning tools, documentation helpers, child profiles, daily logs, messaging, and more. New lesson plans are added weekly, and many more tools and resources are still being built.",
  "",
  "Your feedback is incredibly important to me. If you have an idea, feature request, suggestion, or notice something that is not working correctly, you can message me anytime directly through the Little Learner Hub website. I personally read your messages, and many improvements come directly from provider feedback.",
  "",
  "You can also add Little Learner Hub to your phone, tablet, or computer home screen for quicker access, almost like an app.",
  "",
  "Thank you again for believing in Little Learner Hub and helping shape what it becomes. Your support truly means more than you know.",
  "",
  "💜 Leah",
  "Founder, Little Learner Hub",
  "",
  "P.S. New lesson plans, activities, printables, and provider-requested features are continuing to be added, and your Founding Member access will continue to include future Pro updates.",
].join("\n");

function defaultFoundingMemberThankYouState() {
  return {
    preparedAt: "",
    preparedRecipientCount: 0,
    preparedSubject: "",
    dryRunToken: "",
    dryRunAt: "",
    confirmationToken: "",
    confirmationAt: "",
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
  };
}

function looksLikeTestEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value || !value.includes("@")) return true;
  const [local, domain] = value.split("@");
  if (!local || !domain) return true;
  if (["example.com", "example.org", "example.net", "test.com", "localhost"].includes(domain)) return true;
  if (domain.endsWith(".local") || domain.endsWith(".test")) return true;
  if (/^(test|prod-up|regression-probe|e2e|smoke)/i.test(local)) return true;
  return false;
}

function looksMalformedEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value) return true;
  if ((value.match(/@/g) || []).length !== 1) return true;
  if (/\s/.test(value) || value.includes("..")) return true;
  const [, domain] = value.split("@");
  if (!domain || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return true;
  // Basic TLD check
  if (!/\.[a-z]{2,}$/i.test(domain)) return true;
  return false;
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

function buildEmailContent(options = {}) {
  const escape = typeof options.htmlEscape === "function" ? options.htmlEscape : htmlEscape;
  const paragraphs = EMAIL_TEXT.split("\n\n").map((block) => {
    const lines = block.split("\n").map((line) => escape(line)).join("<br>");
    return `<p style="margin:0 0 16px;line-height:1.55;color:#1f2937;font-size:16px;">${lines}</p>`;
  }).join("");
  return {
    subject: EMAIL_SUBJECT,
    text: EMAIL_TEXT,
    html: [
      '<div style="font-family:Georgia,\'Times New Roman\',serif;max-width:640px;margin:0 auto;padding:24px;">',
      paragraphs,
      "</div>",
    ].join(""),
  };
}

function ensureThankYouState(store) {
  if (!store.emailEngagement || typeof store.emailEngagement !== "object") {
    store.emailEngagement = { settings: {}, events: [] };
  }
  const eng = store.emailEngagement;
  eng.settings = eng.settings || {};
  // Mutate in place — never replace the object after callers hold a reference
  // (send() calls this again during recipient rebuild and must keep the same state).
  if (!eng.settings.foundingMemberThankYou || typeof eng.settings.foundingMemberThankYou !== "object") {
    eng.settings.foundingMemberThankYou = defaultFoundingMemberThankYouState();
  } else {
    const defaults = defaultFoundingMemberThankYouState();
    const current = eng.settings.foundingMemberThankYou;
    for (const [key, value] of Object.entries(defaults)) {
      if (current[key] === undefined) current[key] = value;
    }
  }
  const state = eng.settings.foundingMemberThankYou;
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

function accountStatusLabel(user, nowMs = Date.now()) {
  if (String(user?.accountStatus || "").toLowerCase() === "disabled" || user?.disabled === true) {
    return "Disabled";
  }
  if (typeof membershipAccess.membershipStatusDisplay === "function") {
    return membershipAccess.membershipStatusDisplay(user, nowMs);
  }
  return String(user?.subscriptionStatus || user?.stripeSubscriptionStatus || "Unknown");
}

function subscriptionIsCanceled(user) {
  const stripe = String(user?.stripeSubscriptionStatus || "").toLowerCase();
  const sub = String(user?.subscriptionStatus || "").toLowerCase();
  if (stripe === "canceled" || stripe === "unpaid") return true;
  if (sub.includes("subscription ended") || sub.includes("canceled — access ended")) return true;
  // cancel_at_period_end with stripe still "active" is NOT treated as canceled.
  return false;
}

function alreadyReceivedThankYou(state, email) {
  const receipt = state?.recipientReceipts?.[normalizeEmail(email)];
  return Boolean(receipt?.sentAt || receipt?.messageId);
}

/**
 * Final per-recipient validation checklist used by dry-run, confirmation, and send.
 */
function validateFoundingRecipientFinal(user, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const adminEmail = normalizeEmail(options.adminEmail || "");
  const includeAdmin = options.includeAdmin === true;
  const state = options.state || null;
  const email = normalizeEmail(user?.email);

  const accountActive = !(
    String(user?.accountStatus || "").toLowerCase() === "disabled"
    || user?.disabled === true
  );
  const emailValid = Boolean(email)
    && !looksMalformedEmail(email)
    && !looksDisposableEmail(email);
  const isTest = looksLikeTestEmail(email);
  const foundingFlag = Boolean(user?.foundingMemberActive);
  const hasPro = membershipAccess.membershipHasProAccess(user, nowMs);
  const inTrial = membershipAccess.membershipUserInTrial(user, nowMs);
  const foundingActive = membershipAccess.membershipFoundingActive(user, nowMs);
  const canceled = subscriptionIsCanceled(user);
  const alreadyReceived = state ? alreadyReceivedThankYou(state, email) : false;
  const isAdmin = Boolean(adminEmail && email === adminEmail);

  const checks = {
    emailValid: emailValid && !isTest,
    accountActive,
    foundingAccessActive: foundingActive && foundingFlag && hasPro,
    subscriptionNotCanceled: !canceled,
    notTrial: !inTrial,
    notTestAccount: !isTest,
    notAlreadyReceived: !alreadyReceived,
    adminAllowed: !isAdmin || includeAdmin,
  };

  const excludeReasons = [];
  if (!email) excludeReasons.push("missing_email");
  if (looksMalformedEmail(email) || looksDisposableEmail(email)) excludeReasons.push("invalid_email");
  if (isTest) excludeReasons.push("test_email");
  if (!accountActive) excludeReasons.push("disabled_account");
  if (!foundingFlag) excludeReasons.push("foundingMemberActive_false");
  if (!hasPro) excludeReasons.push("no_pro_access");
  if (!foundingActive) excludeReasons.push("not_active_founding_access");
  if (canceled) excludeReasons.push("subscription_canceled");
  if (inTrial) excludeReasons.push("in_trial");
  if (alreadyReceived) excludeReasons.push("already_received_founding_thank_you");
  if (isAdmin && !includeAdmin) excludeReasons.push("admin_excluded_until_approved");

  const qualifies = Object.values(checks).every(Boolean) && excludeReasons.length === 0;
  const qualifyReason = qualifies
    ? "Final validation passed: valid email, active account, active Founding access, subscription not canceled, not trial, not test, not already received"
    : "";

  return {
    email,
    qualifies,
    qualifyReason,
    excludeReasons,
    checks,
    accountStatus: accountStatusLabel(user, nowMs),
    membershipPlan: membershipAccess.membershipPlanDisplay(user, nowMs),
    foundingMemberActive: foundingFlag,
    foundingMemberNumber: user?.foundingMemberNumber || null,
    stripeSubscriptionStatus: String(user?.stripeSubscriptionStatus || ""),
    subscriptionStatus: String(user?.subscriptionStatus || ""),
    plan: String(user?.plan || ""),
    inTrial,
    hasProAccess: hasPro,
    subscriptionCanceled: canceled,
    alreadyReceived,
    isAdminAccount: isAdmin,
  };
}

// Back-compat alias used by tests / older callers
function qualifyFoundingRecipient(user, options = {}) {
  return validateFoundingRecipientFinal(user, options);
}

function buildFoundingMemberRecipientDryRun(store, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const adminEmail = normalizeEmail(options.adminEmail || "");
  const includeAdmin = options.includeAdmin === true;
  const state = ensureThankYouState(store);
  const users = store?.users && typeof store.users === "object" ? store.users : {};
  const foundingList = Array.isArray(store?.foundingMembers)
    ? store.foundingMembers.map(normalizeEmail).filter(Boolean)
    : [];

  const seen = new Set();
  const duplicatesRemoved = [];
  const recipients = [];
  const excluded = [];

  for (const [key, user] of Object.entries(users)) {
    const email = normalizeEmail(user?.email || key);
    if (!email) continue;

    const foundingRelated = Boolean(
      user?.foundingMemberActive
      || user?.foundingMemberHistorical
      || user?.foundingMember
      || user?.foundingMemberNumber
      || String(user?.plan || "") === "Founding"
      || foundingList.includes(email),
    );
    if (!foundingRelated) continue;

    if (seen.has(email)) {
      duplicatesRemoved.push(email);
      continue;
    }
    seen.add(email);

    const row = validateFoundingRecipientFinal(
      { ...user, email },
      { nowMs, adminEmail, includeAdmin, state },
    );

    if (row.qualifies) recipients.push(row);
    else excluded.push(row);
  }

  recipients.sort((a, b) => a.email.localeCompare(b.email));
  excluded.sort((a, b) => a.email.localeCompare(b.email));

  const activeFoundingAccessCount = Object.values(users).filter((user) => (
    membershipAccess.membershipFoundingActive(user, nowMs)
    && !membershipAccess.membershipUserInTrial(user, nowMs)
    && !subscriptionIsCanceled(user)
  )).length;

  const content = buildEmailContent({ htmlEscape: options.htmlEscape || htmlEscape });

  return {
    dryRun: true,
    willSend: false,
    campaign: CAMPAIGN_KEY,
    audienceRule: "Only users with current confirmed Founding Member access who pass final validation (valid email, active account, active founding access, subscription not canceled, not trial, not test, not already received).",
    confirmPhraseRequired: CONFIRM_PHRASE,
    counts: {
      foundingList: foundingList.length,
      foundingRelatedReviewed: recipients.length + excluded.length + duplicatesRemoved.length,
      activeFoundingAccessNonTrial: activeFoundingAccessCount,
      recipients: recipients.length,
      excluded: excluded.length,
      duplicatesRemoved: duplicatesRemoved.length,
    },
    recipients,
    excluded,
    duplicatesRemoved: [...new Set(duplicatesRemoved)],
    email: {
      subject: content.subject,
      textPreview: content.text,
      htmlPreview: content.html,
    },
    finalValidation: {
      requiredChecks: [
        "emailValid",
        "accountActive",
        "foundingAccessActive",
        "subscriptionNotCanceled",
        "notTrial",
        "notTestAccount",
        "notAlreadyReceived",
      ],
      allRecipientsPassed: recipients.every((r) => Object.values(r.checks || {}).every(Boolean)),
    },
    notes: [
      "The founding list count can be higher than Active Founding access — list/historical/trial/past_due/canceled accounts are not recipients.",
      "Admin is excluded unless includeAdmin=true and that admin account genuinely qualifies as Founding Member.",
      "Sending does not modify subscriptions, access levels, billing, or Founding Member records.",
      "EMAIL_AUTOMATIONS_ENABLED can remain false; this is a gated one-time send only.",
    ],
  };
}

function buildConfirmationScreen(report, options = {}) {
  return {
    title: "Final Confirmation — Founding Member thank-you",
    willSend: false,
    confirmPhraseRequired: CONFIRM_PHRASE,
    recipientCount: report.counts.recipients,
    recipientEmails: report.recipients.map((r) => r.email),
    recipients: report.recipients.map((r) => ({
      email: r.email,
      accountStatus: r.accountStatus,
      membershipPlan: r.membershipPlan,
      checks: r.checks,
      qualifyReason: r.qualifyReason,
      stripeSubscriptionStatus: r.stripeSubscriptionStatus,
    })),
    subject: report.email.subject,
    textPreview: report.email.textPreview,
    htmlPreview: report.email.htmlPreview,
    excludedCount: report.counts.excluded,
    duplicatesRemoved: report.duplicatesRemoved,
    finalValidation: report.finalValidation,
    dryRunToken: options.dryRunToken || "",
    confirmationToken: options.confirmationToken || "",
    warning: "Type SEND_FOUNDING_MEMBER_EMAIL only after reviewing this screen. Memberships will not be modified.",
  };
}

function buildPostSendReport(state) {
  const deliveries = Array.isArray(state.deliveries) ? state.deliveries : [];
  const failures = Array.isArray(state.failures) ? state.failures : [];
  const skipped = Array.isArray(state.skipped) ? state.skipped : [];
  const receipts = state.recipientReceipts || {};
  const bounced = Object.values(receipts).filter((r) => r.bouncedAt || r.deliveryStatus === "bounced");
  const delivered = Object.values(receipts).filter((r) => (
    r.deliveredAt || r.deliveryStatus === "delivered" || (r.sentAt && !r.bouncedAt && r.apiAccepted)
  ));
  const opened = Object.values(receipts).filter((r) => r.openedAt);
  const clicked = Object.values(receipts).filter((r) => r.clickedAt);
  const messageIds = deliveries.map((d) => d.messageId).filter(Boolean);

  return {
    campaign: CAMPAIGN_KEY,
    sentAt: state.sentAt || "",
    totalAttempted: Number(state.attemptedCount || 0),
    totalDelivered: Number(state.deliveredCount || delivered.length || state.sentCount || 0),
    totalFailed: Number(state.failedCount || failures.length || 0),
    totalBounced: Number(state.bouncedCount || bounced.length || 0),
    totalOpened: Number(state.openedCount || opened.length || 0),
    totalClicked: Number(state.clickedCount || clicked.length || 0),
    totalSkipped: skipped.length + Number(state.skippedAlreadyReceivedCount || 0) + Number(state.softSkippedCount || 0),
    resendMessageIds: messageIds,
    deliveries,
    failures,
    skipped,
    membershipRecordsModified: false,
    billingRecordsModified: false,
    foundingMemberStatusModified: false,
    note: "Open/click/bounce update when Resend webhooks arrive (or after refresh-status). API accept counts as attempted/sent until delivery events arrive.",
  };
}

function applyResendEventToState(state, event) {
  const type = String(event?.type || "");
  const data = event?.data || {};
  const messageId = String(data.email_id || data.id || "").trim();
  const toList = Array.isArray(data.to) ? data.to : (data.to ? [data.to] : []);
  const emailFromEvent = normalizeEmail(toList[0] || "");
  const email = emailFromEvent
    || normalizeEmail(state.messageIdIndex?.[messageId] || "");
  if (!email && !messageId) return { updated: false };

  const receiptKey = email || state.messageIdIndex?.[messageId];
  if (!receiptKey || !state.recipientReceipts[receiptKey]) {
    // Still record webhook for audit even if not in this campaign.
    return { updated: false, reason: "not_founding_campaign_message" };
  }

  const receipt = state.recipientReceipts[receiptKey];
  const at = event.created_at || new Date().toISOString();
  if (type === "email.delivered") {
    receipt.deliveredAt = at;
    receipt.deliveryStatus = "delivered";
  } else if (type === "email.bounced" || type === "email.failed") {
    receipt.bouncedAt = at;
    receipt.deliveryStatus = "bounced";
    receipt.bounceDetail = data.bounce || data.error || null;
  } else if (type === "email.opened") {
    receipt.openedAt = receipt.openedAt || at;
    receipt.openCount = (receipt.openCount || 0) + 1;
  } else if (type === "email.clicked") {
    receipt.clickedAt = receipt.clickedAt || at;
    receipt.clickCount = (receipt.clickCount || 0) + 1;
  } else if (type === "email.delivery_delayed") {
    receipt.deliveryStatus = receipt.deliveryStatus || "delayed";
    receipt.delayedAt = at;
  } else if (type === "email.sent") {
    receipt.deliveryStatus = receipt.deliveryStatus || "sent";
  }

  // Recompute aggregate counters from receipts
  const receipts = Object.values(state.recipientReceipts);
  state.deliveredCount = receipts.filter((r) => r.deliveryStatus === "delivered" || r.deliveredAt).length;
  state.bouncedCount = receipts.filter((r) => r.deliveryStatus === "bounced" || r.bouncedAt).length;
  state.openedCount = receipts.filter((r) => r.openedAt).length;
  state.clickedCount = receipts.filter((r) => r.clickedAt).length;
  state.deliveries = state.deliveries.map((d) => {
    if (normalizeEmail(d.email) !== normalizeEmail(receiptKey) && d.messageId !== messageId) return d;
    return {
      ...d,
      deliveryStatus: receipt.deliveryStatus || d.deliveryStatus,
      deliveredAt: receipt.deliveredAt || d.deliveredAt || "",
      bouncedAt: receipt.bouncedAt || d.bouncedAt || "",
      openedAt: receipt.openedAt || d.openedAt || "",
      clickedAt: receipt.clickedAt || d.clickedAt || "",
    };
  });
  state.lastPostSendReport = buildPostSendReport(state);
  return { updated: true, email: receiptKey, type };
}

function verifyResendWebhookSignature(rawBody, headers, secret) {
  const cleanSecret = String(secret || "").trim();
  if (!cleanSecret) return { ok: false, reason: "secret_not_configured" };
  const svixId = headers["svix-id"] || headers["Svix-Id"] || "";
  const svixTimestamp = headers["svix-timestamp"] || headers["Svix-Timestamp"] || "";
  const svixSignature = headers["svix-signature"] || headers["Svix-Signature"] || "";
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: "missing_svix_headers" };
  }
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const secretPart = cleanSecret.startsWith("whsec_") ? cleanSecret.slice(6) : cleanSecret;
  let key;
  try {
    key = Buffer.from(secretPart, "base64");
  } catch {
    key = Buffer.from(secretPart);
  }
  const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");
  const signatures = String(svixSignature).split(" ").map((part) => part.replace(/^v1,/, "").trim()).filter(Boolean);
  const match = signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch {
      return expected === sig;
    }
  });
  return { ok: match, reason: match ? "verified" : "signature_mismatch" };
}

function createFoundingMemberEmail(deps = {}) {
  const {
    sendEmail,
    readStore,
    writeStore,
    htmlEscape: htmlEscapeFn = htmlEscape,
    getAdminEmail = () => "",
    getSupportEmailStatus = () => ({ ready: false }),
    fetchResendEmailStatus = null,
  } = deps;

  function dryRun(options = {}) {
    const store = options.store || readStore();
    const adminEmail = normalizeEmail(options.adminEmail || getAdminEmail() || "");
    const includeAdmin = options.includeAdmin === true;
    const report = buildFoundingMemberRecipientDryRun(store, {
      adminEmail,
      includeAdmin,
      nowMs: options.nowMs,
      htmlEscape: htmlEscapeFn,
    });

    const state = ensureThankYouState(store);
    const alreadySent = Boolean(state.sentAt);
    const dryRunToken = crypto.randomBytes(16).toString("hex");
    const confirmationToken = crypto.randomBytes(16).toString("hex");
    const dryRunAt = new Date().toISOString();
    const confirmationScreen = buildConfirmationScreen(report, { dryRunToken, confirmationToken });

    state.preparedAt = dryRunAt;
    state.preparedRecipientCount = report.counts.recipients;
    state.preparedSubject = report.email.subject;
    state.dryRunToken = dryRunToken;
    state.dryRunAt = dryRunAt;
    state.confirmationToken = confirmationToken;
    state.confirmationAt = dryRunAt;
    state.lastDryRunSummary = {
      at: dryRunAt,
      recipientCount: report.counts.recipients,
      recipientEmails: report.recipients.map((r) => r.email),
      excludedCount: report.counts.excluded,
      foundingList: report.counts.foundingList,
      activeFoundingAccessNonTrial: report.counts.activeFoundingAccessNonTrial,
      includeAdmin,
    };
    state.lastConfirmationScreen = {
      at: dryRunAt,
      recipientCount: confirmationScreen.recipientCount,
      recipientEmails: confirmationScreen.recipientEmails,
      subject: confirmationScreen.subject,
    };
    if (typeof writeStore === "function" && options.persist !== false) {
      writeStore(store);
    }

    const emailStatus = typeof getSupportEmailStatus === "function"
      ? (getSupportEmailStatus() || {})
      : {};

    return {
      ...report,
      alreadySent,
      sentAt: state.sentAt || "",
      dryRunToken,
      dryRunAt,
      confirmationToken,
      confirmationScreen,
      emailProvider: {
        ready: Boolean(emailStatus.ready),
        provider: emailStatus.provider || "not configured",
        from: emailStatus.from || "",
        note: emailStatus.note || "",
      },
      sendUnlocked: Boolean(
        !alreadySent
        && report.counts.recipients > 0
        && report.finalValidation.allRecipientsPassed
        && emailStatus.ready
        && dryRunToken
        && confirmationToken,
      ),
      nextStep: alreadySent
        ? "Already sent — duplicate send blocked."
        : "Review Final Confirmation Screen (recipients + full email). Send only with confirmPhrase SEND_FOUNDING_MEMBER_EMAIL + confirm:true + dryRunToken + confirmationToken.",
    };
  }

  function getReport(options = {}) {
    const store = options.store || readStore();
    const state = ensureThankYouState(store);
    return {
      ok: true,
      sent: Boolean(state.sentAt),
      report: buildPostSendReport(state),
      confirmationScreen: state.lastConfirmationScreen,
    };
  }

  async function refreshDeliveryStatuses(options = {}) {
    const store = readStore();
    const state = ensureThankYouState(store);
    if (typeof fetchResendEmailStatus !== "function") {
      return { ok: false, reason: "status_fetcher_unavailable", report: buildPostSendReport(state) };
    }
    let updated = 0;
    for (const [email, receipt] of Object.entries(state.recipientReceipts || {})) {
      if (!receipt.messageId) continue;
      try {
        const status = await fetchResendEmailStatus(receipt.messageId);
        const lastEvent = String(status?.last_event || status?.lastEvent || "").toLowerCase();
        if (!lastEvent) continue;
        if (lastEvent === "delivered") {
          receipt.deliveredAt = receipt.deliveredAt || new Date().toISOString();
          receipt.deliveryStatus = "delivered";
        } else if (lastEvent === "bounced" || lastEvent === "failed") {
          receipt.bouncedAt = receipt.bouncedAt || new Date().toISOString();
          receipt.deliveryStatus = "bounced";
        } else if (lastEvent === "opened") {
          receipt.openedAt = receipt.openedAt || new Date().toISOString();
        } else if (lastEvent === "clicked") {
          receipt.clickedAt = receipt.clickedAt || new Date().toISOString();
        } else {
          receipt.deliveryStatus = receipt.deliveryStatus || lastEvent;
        }
        updated += 1;
        void email;
      } catch {
        // keep prior status
      }
    }
    const receipts = Object.values(state.recipientReceipts);
    state.deliveredCount = receipts.filter((r) => r.deliveryStatus === "delivered" || r.deliveredAt).length;
    state.bouncedCount = receipts.filter((r) => r.deliveryStatus === "bounced" || r.bouncedAt).length;
    state.openedCount = receipts.filter((r) => r.openedAt).length;
    state.clickedCount = receipts.filter((r) => r.clickedAt).length;
    state.lastPostSendReport = buildPostSendReport(state);
    writeStore(store);
    return { ok: true, updated, report: state.lastPostSendReport };
  }

  function handleResendWebhook(event, options = {}) {
    const store = options.store || readStore();
    const state = ensureThankYouState(store);
    const result = applyResendEventToState(state, event);
    state.webhookEvents.unshift({
      at: new Date().toISOString(),
      type: event?.type || "",
      emailId: event?.data?.email_id || event?.data?.id || "",
      updated: Boolean(result.updated),
    });
    state.webhookEvents = state.webhookEvents.slice(0, 200);
    if (result.updated) writeStore(store);
    else if (options.persistAlways) writeStore(store);
    return result;
  }

  async function send(options = {}) {
    const store = readStore();
    const state = ensureThankYouState(store);

    if (state.sentAt && !options.forceResend) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "already_sent",
        sentAt: state.sentAt,
        recipientCount: state.recipientCount || 0,
        report: buildPostSendReport(state),
        detail: "This one-time Founding Member thank-you was already sent. Duplicate sends are blocked.",
      };
    }

    const phrase = String(options.confirmPhrase || "").trim();
    if (phrase !== CONFIRM_PHRASE) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "confirmation_required",
        detail: `Pass confirmPhrase: "${CONFIRM_PHRASE}" after approving the Final Confirmation Screen.`,
      };
    }

    if (options.confirm !== true) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "confirmation_required",
        detail: "Pass confirm: true after reviewing recipient count, emails, subject, and full rendered preview.",
      };
    }

    const dryRunToken = String(options.dryRunToken || "").trim();
    const confirmationToken = String(options.confirmationToken || "").trim();
    if (!state.dryRunToken || !dryRunToken || dryRunToken !== state.dryRunToken) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "dry_run_required",
        detail: "Run dry-run / Final Confirmation and pass the returned dryRunToken.",
      };
    }
    if (!state.confirmationToken || !confirmationToken || confirmationToken !== state.confirmationToken) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "confirmation_screen_required",
        detail: "Pass confirmationToken from the Final Confirmation Screen.",
      };
    }
    const dryRunAgeMs = Date.now() - new Date(state.dryRunAt || 0).getTime();
    if (!Number.isFinite(dryRunAgeMs) || dryRunAgeMs < 0 || dryRunAgeMs > 2 * 60 * 60 * 1000) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "dry_run_expired",
        detail: "Confirmation expired (2 hours). Re-run dry-run and approve again.",
      };
    }

    const adminEmail = normalizeEmail(options.adminEmail || getAdminEmail() || "");
    const includeAdmin = options.includeAdmin === true;
    const report = buildFoundingMemberRecipientDryRun(store, {
      adminEmail,
      includeAdmin,
      htmlEscape: htmlEscapeFn,
    });

    // Re-run final validation; drop anyone who no longer passes.
    const validated = [];
    const skipped = [];
    for (const row of report.recipients) {
      const user = store.users?.[row.email] || { email: row.email };
      const finalRow = validateFoundingRecipientFinal(user, {
        adminEmail,
        includeAdmin,
        state,
      });
      if (finalRow.qualifies) validated.push(finalRow);
      else skipped.push({
        email: finalRow.email,
        reason: (finalRow.excludeReasons || []).join(",") || "failed_final_validation",
        checks: finalRow.checks,
      });
    }

    if (!validated.length) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "no_recipients",
        detail: "No verified active Founding Members passed final validation.",
        skippedRecipients: skipped,
        dryRun: report,
      };
    }

    const approved = new Set((state.lastDryRunSummary?.recipientEmails || []).map(normalizeEmail));
    const current = validated.map((r) => r.email);
    const unexpected = current.filter((email) => !approved.has(email));
    if (unexpected.length) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "recipient_drift",
        detail: "Recipient list gained unexpected addresses since dry-run. Re-run dry-run and re-approve.",
        drift: unexpected.slice(0, 25),
      };
    }

    const content = buildEmailContent({ htmlEscape: htmlEscapeFn });
    let sentCount = 0;
    let failCount = 0;
    let softSkip = 0;
    let alreadyReceivedSkip = 0;
    const deliveries = [];
    const failures = [];
    const attempted = [];

    // Snapshot membership fingerprints before send to prove no mutation.
    const membershipFingerprintBefore = validated.map((r) => {
      const u = store.users[r.email] || {};
      return {
        email: r.email,
        foundingMemberActive: u.foundingMemberActive,
        plan: u.plan,
        stripeSubscriptionStatus: u.stripeSubscriptionStatus,
        subscriptionStatus: u.subscriptionStatus,
      };
    });

    for (const row of validated) {
      // Per-recipient duplicate protection
      if (alreadyReceivedThankYou(state, row.email)) {
        alreadyReceivedSkip += 1;
        skipped.push({ email: row.email, reason: "already_received_founding_thank_you" });
        continue;
      }

      attempted.push(row.email);
      let emailResult = { sent: false, configured: false, provider: "not configured" };
      try {
        emailResult = await sendEmail({
          to: row.email,
          subject: content.subject,
          text: content.text,
          html: content.html,
          tags: [
            { name: "campaign", value: CAMPAIGN_KEY },
            { name: "template", value: TEMPLATE_KEY },
          ],
        });
      } catch (err) {
        emailResult = {
          sent: false,
          configured: true,
          provider: "error",
          error: err.message || String(err),
        };
      }

      const messageId = emailResult.messageId || emailResult.id || "";
      const nowIso = new Date().toISOString();
      const delivery = {
        email: row.email,
        sent: Boolean(emailResult.sent),
        apiAccepted: Boolean(emailResult.sent),
        provider: emailResult.provider || "",
        messageId,
        error: emailResult.error || "",
        accountStatus: row.accountStatus,
        qualifyReason: row.qualifyReason,
        checks: row.checks,
        deliveryStatus: emailResult.sent ? "accepted" : "failed",
        sentAt: emailResult.sent ? nowIso : "",
        deliveredAt: "",
        bouncedAt: "",
        openedAt: "",
        clickedAt: "",
      };

      const eng = store.emailEngagement;
      eng.events.unshift({
        id: `em-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        at: nowIso,
        type: emailResult.sent ? "sent" : (emailResult.configured ? "failed" : "skipped_unconfigured"),
        templateKey: TEMPLATE_KEY,
        campaign: CAMPAIGN_KEY,
        to: row.email,
        subject: content.subject,
        provider: emailResult.provider || "",
        messageId,
        error: emailResult.error || "",
        meta: {
          oneTime: true,
          foundingMemberThankYou: true,
          membershipUnchanged: true,
        },
      });
      eng.events = eng.events.slice(0, 500);

      if (emailResult.sent) {
        sentCount += 1;
        deliveries.push(delivery);
        state.recipientReceipts[row.email] = {
          email: row.email,
          messageId,
          sentAt: nowIso,
          apiAccepted: true,
          deliveryStatus: "accepted",
          deliveredAt: "",
          bouncedAt: "",
          openedAt: "",
          clickedAt: "",
          openCount: 0,
          clickCount: 0,
        };
        if (messageId) state.messageIdIndex[messageId] = row.email;
      } else if (!emailResult.configured) {
        softSkip += 1;
        failures.push({ ...delivery, reason: "unconfigured" });
      } else {
        failCount += 1;
        failures.push({ ...delivery, reason: "failed" });
      }
    }

    // Prove membership fields unchanged
    const membershipMutations = [];
    for (const before of membershipFingerprintBefore) {
      const after = store.users[before.email] || {};
      if (
        Boolean(after.foundingMemberActive) !== Boolean(before.foundingMemberActive)
        || String(after.plan || "") !== String(before.plan || "")
        || String(after.stripeSubscriptionStatus || "") !== String(before.stripeSubscriptionStatus || "")
        || String(after.subscriptionStatus || "") !== String(before.subscriptionStatus || "")
      ) {
        membershipMutations.push(before.email);
      }
    }

    const now = new Date().toISOString();
    Object.assign(state, {
      sentAt: now,
      recipientCount: validated.length,
      attemptedCount: attempted.length,
      sentCount,
      failedCount: failCount,
      softSkippedCount: softSkip,
      skippedAlreadyReceivedCount: alreadyReceivedSkip,
      deliveredCount: 0,
      bouncedCount: 0,
      openedCount: 0,
      clickedCount: 0,
      deliveries: deliveries.slice(0, 200),
      failures: failures.slice(0, 200),
      skipped: skipped.slice(0, 200),
      dryRunToken: "",
      confirmationToken: "",
    });
    const reportOut = buildPostSendReport(state);
    state.lastPostSendReport = reportOut;
    writeStore(store);

    return {
      sent: sentCount,
      failed: failCount,
      softSkipped: softSkip,
      recipients: validated.length,
      attempted: attempted.length,
      skipped: false,
      reason: sentCount ? "sent" : (softSkip ? "unconfigured" : "no_successful_sends"),
      sentAt: now,
      recurring: false,
      membershipRecordsModified: false,
      billingRecordsModified: false,
      foundingMemberStatusModified: false,
      membershipMutationDetected: membershipMutations.length > 0,
      membershipMutations,
      automationsEnabledRequired: false,
      deliveries,
      failures,
      skippedRecipients: skipped,
      duplicatesRemoved: report.duplicatesRemoved,
      resendMessageIds: deliveries.map((d) => d.messageId).filter(Boolean),
      report: reportOut,
      confirmationScreen: buildConfirmationScreen({
        ...report,
        recipients: validated,
        counts: { ...report.counts, recipients: validated.length },
      }),
    };
  }

  return {
    CONFIRM_PHRASE,
    CAMPAIGN_KEY,
    buildEmailContent,
    buildFoundingMemberRecipientDryRun,
    validateFoundingRecipientFinal,
    qualifyFoundingRecipient,
    buildConfirmationScreen,
    buildPostSendReport,
    verifyResendWebhookSignature,
    applyResendEventToState,
    dryRun,
    send,
    getReport,
    refreshDeliveryStatuses,
    handleResendWebhook,
    defaultFoundingMemberThankYouState,
    ensureThankYouState,
  };
}

module.exports = {
  CONFIRM_PHRASE,
  CAMPAIGN_KEY,
  EMAIL_SUBJECT,
  EMAIL_TEXT,
  createFoundingMemberEmail,
  buildFoundingMemberRecipientDryRun,
  buildEmailContent,
  buildConfirmationScreen,
  buildPostSendReport,
  validateFoundingRecipientFinal,
  qualifyFoundingRecipient,
  looksLikeTestEmail,
  looksMalformedEmail,
  subscriptionIsCanceled,
  verifyResendWebhookSignature,
  defaultFoundingMemberThankYouState,
};
