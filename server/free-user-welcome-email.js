/**
 * One-time Free Users welcome + upgrade email.
 *
 * Safety:
 * - Dry-run / confirmation never send.
 * - Send requires confirmPhrase === "SEND_FREE_USER_WELCOME_EMAIL".
 * - One-time only + per-recipient already-received guard.
 * - Does NOT require EMAIL_AUTOMATIONS_ENABLED.
 * - Does NOT modify subscriptions, access levels, or membership records.
 * - Recipients = Free access only (no Pro, Founding, trial, admin, test, invalid, bounced).
 */

const crypto = require("crypto");
const membershipAccess = require("../scripts/membership-access.js");

const CONFIRM_PHRASE = "SEND_FREE_USER_WELCOME_EMAIL";
const CAMPAIGN_KEY = "free_user_welcome_upgrade";
const TEMPLATE_KEY = "free_user_welcome_upgrade";

const EMAIL_SUBJECT = "Welcome to Little Learner Hub! 💜";

const EMAIL_TEXT = [
  "Hi,",
  "",
  "Welcome to Little Learner Hub!",
  "",
  "I'm so excited you're here.",
  "",
  "My name is Leah, and I'm a childcare provider just like you. I created Little Learner Hub because I wanted an affordable place where providers could find lesson plans, activities, planning tools, documentation help, and more—all in one place.",
  "",
  "As a Free Member, you can already:",
  "",
  "✅ Explore lesson plans",
  "✅ Browse activities",
  "✅ Use select planning tools",
  "✅ Get a feel for how the platform works",
  "",
  "But if you've been using Little Learner Hub for a while, you may have noticed something...",
  "",
  "👀 You're enjoying a curated Free sample — not the full library.",
  "",
  "That's intentional. Free lets you experience the quality of Little Learner Hub lesson plans (and print them), while Pro unlocks unlimited plans, customization, the full Activity Center, and new resources every week.",
  "",
  "With Pro Membership You Get:",
  "",
  "⭐ Unlimited Lesson Plans — save hours every week",
  "⭐ New Lesson Plans Added Weekly",
  "⭐ Lesson Plan Customization & Saved Personal Copies",
  "⭐ Full Activity Center by Age, Theme & Learning Domain",
  "⭐ Unlimited Calendar Planning",
  "⭐ Documentation Helpers, Child Profiles & Future Features",
  "",
  "Special Reminder",
  "",
  "🔥 Founding Member spots are still available!",
  "",
  "Lock in $9.99/month for life and keep that price as Little Learner Hub continues to grow.",
  "",
  "Regular Pro pricing is higher, but Founding Members keep their rate forever.",
  "",
  "If you're tired of seeing the same free lesson plans and want access to everything Little Learner Hub has to offer, now is the best time to upgrade.",
  "",
  "📱 Don't forget: You can add Little Learner Hub to your phone, tablet, or computer home screen and use it just like an app for quick access.",
  "",
  "💬 Need Help or Have Questions?",
  "",
  "You can message me directly through the Little Learner Hub website anytime.",
  "",
  "Whether you:",
  "",
  "Have a question",
  "Need help finding something",
  "Have an idea for a new feature",
  "Found a bug",
  "Want to request a lesson plan or activity",
  "",
  "Just send me a message through the website and I'll do my best to help. I personally read every message and truly value your feedback as we continue building Little Learner Hub together.",
  "",
  "Have an idea, suggestion, feature request, or question?",
  "",
  "Don't hesitate to reach out. You can message me directly through the website anytime. I personally read every message and many of the improvements on Little Learner Hub come directly from provider feedback.",
  "",
  "Thank you for being part of Little Learner Hub!",
  "",
  "💜 Leah",
  "Founder, Little Learner Hub",
  "",
  "P.S. New lesson plans are added weekly, new activities are added regularly, and more features are being added all the time. Upgrade today and unlock the full library instead of seeing the same free plans each time you visit.",
].join("\n");

function defaultCampaignState() {
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
  if (["example.com", "example.org", "example.net", "test.com", "localhost", "web-library.net"].includes(domain)) return true;
  if (domain.endsWith(".local") || domain.endsWith(".test")) return true;
  if (/^(test|prod-up|regression-probe|e2e|smoke|llh-signup|signup-ui|ui-test)/i.test(local)) return true;
  return false;
}

function looksMalformedEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value) return true;
  if ((value.match(/@/g) || []).length !== 1) return true;
  if (/\s/.test(value) || value.includes("..")) return true;
  const [, domain] = value.split("@");
  if (!domain || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return true;
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

function ensureCampaignState(store) {
  if (!store.emailEngagement || typeof store.emailEngagement !== "object") {
    store.emailEngagement = { settings: {}, events: [] };
  }
  const eng = store.emailEngagement;
  eng.settings = eng.settings || {};
  if (!eng.settings.freeUserWelcome || typeof eng.settings.freeUserWelcome !== "object") {
    eng.settings.freeUserWelcome = defaultCampaignState();
  } else {
    const defaults = defaultCampaignState();
    const current = eng.settings.freeUserWelcome;
    for (const [key, value] of Object.entries(defaults)) {
      if (current[key] === undefined) current[key] = value;
    }
  }
  const state = eng.settings.freeUserWelcome;
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

function alreadyReceived(state, email) {
  const receipt = state?.recipientReceipts?.[normalizeEmail(email)];
  return Boolean(receipt?.sentAt || receipt?.messageId);
}

function isKnownBouncedEmail(store, email) {
  const clean = normalizeEmail(email);
  if (!clean) return false;
  const user = store?.users?.[clean];
  if (user?.emailBounced === true || user?.bouncedAt || user?.emailDeliveryStatus === "bounced") return true;
  const eng = store?.emailEngagement?.settings || {};
  for (const key of Object.keys(eng)) {
    const receipts = eng[key]?.recipientReceipts;
    if (!receipts || typeof receipts !== "object") continue;
    const receipt = receipts[clean];
    if (receipt?.bouncedAt || receipt?.deliveryStatus === "bounced") return true;
  }
  return false;
}

/**
 * Free-user final validation checklist.
 */
function validateFreeUserRecipient(user, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const adminEmail = normalizeEmail(options.adminEmail || "");
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
  const isTest = looksLikeTestEmail(email);
  const hasPro = membershipAccess.membershipHasProAccess(user, nowMs);
  const inTrial = membershipAccess.membershipUserInTrial(user, nowMs);
  const foundingActive = membershipAccess.membershipFoundingActive(user, nowMs);
  const planDisplay = membershipAccess.membershipPlanDisplay(user, nowMs);
  const isFreeAccess = !hasPro && planDisplay === "Free";
  const alreadyGot = state ? alreadyReceived(state, email) : false;
  const isAdmin = Boolean(adminEmail && email === adminEmail);
  const bounced = store ? isKnownBouncedEmail(store, email) : Boolean(
    user?.emailBounced || user?.bouncedAt || user?.emailDeliveryStatus === "bounced",
  );

  const checks = {
    emailValid: emailValid && !isTest,
    accountActive,
    freeAccess: isFreeAccess,
    notFoundingMember: !foundingActive && !Boolean(user?.foundingMemberActive),
    notProAccess: !hasPro,
    notTrial: !inTrial,
    notAdmin: !isAdmin,
    notTestAccount: !isTest,
    notBounced: !bounced,
    notAlreadyReceived: !alreadyGot,
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
  if (bounced) excludeReasons.push("bounced_email");
  if (alreadyGot) excludeReasons.push("already_received_free_welcome");

  const qualifies = Object.values(checks).every(Boolean) && excludeReasons.length === 0;
  const qualifyReason = qualifies
    ? "Free access only: no Pro/Founding/trial, active account, valid non-test non-bounced email, not admin, not already received"
    : "";

  return {
    email,
    qualifies,
    qualifyReason,
    excludeReasons,
    checks,
    accountStatus: accountStatusLabel(user, nowMs),
    membershipPlan: planDisplay,
    foundingMemberActive: Boolean(user?.foundingMemberActive),
    stripeSubscriptionStatus: String(user?.stripeSubscriptionStatus || ""),
    subscriptionStatus: String(user?.subscriptionStatus || ""),
    plan: String(user?.plan || ""),
    inTrial,
    hasProAccess: hasPro,
    isAdminAccount: isAdmin,
    bounced,
    alreadyReceived: alreadyGot,
  };
}

function buildFreeUserRecipientDryRun(store, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const adminEmail = normalizeEmail(options.adminEmail || "");
  const state = ensureCampaignState(store);
  const users = store?.users && typeof store.users === "object" ? store.users : {};

  const seen = new Set();
  const duplicatesRemoved = [];
  const recipients = [];
  const excluded = [];
  const invalidEmails = [];

  for (const [key, user] of Object.entries(users)) {
    const email = normalizeEmail(user?.email || key);
    if (!email) continue;

    if (seen.has(email)) {
      duplicatesRemoved.push(email);
      continue;
    }
    seen.add(email);

    const row = validateFreeUserRecipient(
      { ...user, email },
      { nowMs, adminEmail, store, state },
    );

    if (row.excludeReasons.includes("invalid_email") || row.excludeReasons.includes("test_email")) {
      invalidEmails.push({ email, reasons: row.excludeReasons.slice() });
    }

    if (row.qualifies) recipients.push(row);
    else excluded.push(row);
  }

  recipients.sort((a, b) => a.email.localeCompare(b.email));
  excluded.sort((a, b) => a.email.localeCompare(b.email));

  const freeAccessCount = Object.values(users).filter((user) => {
    const plan = membershipAccess.membershipPlanDisplay(user, nowMs);
    return plan === "Free" && !membershipAccess.membershipHasProAccess(user, nowMs);
  }).length;

  const content = buildEmailContent({ htmlEscape: options.htmlEscape || htmlEscape });

  return {
    dryRun: true,
    willSend: false,
    campaign: CAMPAIGN_KEY,
    audienceRule: "Only users with current Free access — not Founding, not Pro, not trial, not admin, not test, not invalid/bounced.",
    confirmPhraseRequired: CONFIRM_PHRASE,
    counts: {
      totalUsers: Object.keys(users).length,
      freeAccessAccounts: freeAccessCount,
      recipients: recipients.length,
      excluded: excluded.length,
      duplicatesRemoved: duplicatesRemoved.length,
      invalidOrTestEmails: invalidEmails.length,
    },
    recipients,
    excluded,
    duplicatesRemoved: [...new Set(duplicatesRemoved)],
    invalidEmailAnalysis: {
      count: invalidEmails.length,
      sample: invalidEmails.slice(0, 50),
    },
    duplicateAnalysis: {
      count: [...new Set(duplicatesRemoved)].length,
      emails: [...new Set(duplicatesRemoved)],
    },
    email: {
      subject: content.subject,
      textPreview: content.text,
      htmlPreview: content.html,
    },
    finalValidation: {
      requiredChecks: [
        "emailValid",
        "accountActive",
        "freeAccess",
        "notFoundingMember",
        "notProAccess",
        "notTrial",
        "notAdmin",
        "notTestAccount",
        "notBounced",
        "notAlreadyReceived",
      ],
      allRecipientsPassed: recipients.every((r) => Object.values(r.checks || {}).every(Boolean)),
    },
    notes: [
      "Former Founding/Pro users who are currently Free may be included if they no longer have Pro/Founding/trial access.",
      "Admin is always excluded for this campaign.",
      "Sending does not modify memberships, subscriptions, billing, or account access.",
      "EMAIL_AUTOMATIONS_ENABLED can remain false; this is a gated one-time send only.",
    ],
  };
}

function buildConfirmationScreen(report, options = {}) {
  return {
    title: "Final Confirmation — Free Users welcome & upgrade",
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
    })),
    subject: report.email.subject,
    textPreview: report.email.textPreview,
    htmlPreview: report.email.htmlPreview,
    excludedCount: report.counts.excluded,
    duplicatesRemoved: report.duplicatesRemoved,
    invalidEmailAnalysis: report.invalidEmailAnalysis,
    finalValidation: report.finalValidation,
    dryRunToken: options.dryRunToken || "",
    confirmationToken: options.confirmationToken || "",
    warning: "Type SEND_FREE_USER_WELCOME_EMAIL only after reviewing this screen. Memberships will not be modified.",
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
    accountAccessModified: false,
    note: "Open/click/bounce update when Resend webhooks arrive (or after refresh-status).",
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
    return { updated: false, reason: "not_free_welcome_campaign_message" };
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

function createFreeUserWelcomeEmail(deps = {}) {
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
    const report = buildFreeUserRecipientDryRun(store, {
      adminEmail,
      nowMs: options.nowMs,
      htmlEscape: htmlEscapeFn,
    });

    const state = ensureCampaignState(store);
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
      freeAccessAccounts: report.counts.freeAccessAccounts,
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
        : "Review Final Confirmation Screen. Send only with confirmPhrase SEND_FREE_USER_WELCOME_EMAIL + confirm:true + dryRunToken + confirmationToken.",
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

  async function refreshDeliveryStatuses() {
    const store = readStore();
    const state = ensureCampaignState(store);
    if (typeof fetchResendEmailStatus !== "function") {
      return { ok: false, reason: "status_fetcher_unavailable", report: buildPostSendReport(state) };
    }
    let updated = 0;
    for (const [, receipt] of Object.entries(state.recipientReceipts || {})) {
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

  async function send(options = {}) {
    const store = readStore();
    const state = ensureCampaignState(store);

    if (state.sentAt && !options.forceResend) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "already_sent",
        sentAt: state.sentAt,
        recipientCount: state.recipientCount || 0,
        report: buildPostSendReport(state),
        detail: "This one-time Free User welcome email was already sent. Duplicate sends are blocked.",
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
    const report = buildFreeUserRecipientDryRun(store, {
      adminEmail,
      htmlEscape: htmlEscapeFn,
    });

    const validated = [];
    const skipped = [];
    for (const row of report.recipients) {
      const user = store.users?.[row.email] || { email: row.email };
      const finalRow = validateFreeUserRecipient(user, { adminEmail, store, state });
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
        detail: "No Free users passed final validation.",
        skippedRecipients: skipped,
        dryRun: report,
      };
    }

    const approved = new Set((state.lastDryRunSummary?.recipientEmails || []).map(normalizeEmail));
    const unexpected = validated.map((r) => r.email).filter((email) => !approved.has(email));
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
      if (alreadyReceived(state, row.email)) {
        alreadyReceivedSkip += 1;
        skipped.push({ email: row.email, reason: "already_received_free_welcome" });
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
          freeUserWelcome: true,
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
      deliveries: deliveries.slice(0, 500),
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
      accountAccessModified: false,
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
    buildFreeUserRecipientDryRun,
    validateFreeUserRecipient,
    buildConfirmationScreen,
    buildPostSendReport,
    dryRun,
    send,
    getReport,
    refreshDeliveryStatuses,
    handleResendWebhook,
    ensureCampaignState,
    defaultCampaignState,
  };
}

module.exports = {
  CONFIRM_PHRASE,
  CAMPAIGN_KEY,
  EMAIL_SUBJECT,
  EMAIL_TEXT,
  createFreeUserWelcomeEmail,
  buildFreeUserRecipientDryRun,
  buildEmailContent,
  buildConfirmationScreen,
  buildPostSendReport,
  validateFreeUserRecipient,
  looksLikeTestEmail,
  looksMalformedEmail,
  defaultCampaignState,
};
