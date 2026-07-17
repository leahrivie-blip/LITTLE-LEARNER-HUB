/**
 * One-time Founding Members thank-you email.
 *
 * Safety:
 * - Dry-run / preview never sends.
 * - Send requires confirmPhrase === "SEND_FOUNDING_MEMBER_EMAIL".
 * - One-time only (stamped in store.emailEngagement.settings.foundingMemberThankYou).
 * - Does NOT require EMAIL_AUTOMATIONS_ENABLED (keeps drip/weekly/bulk off).
 * - Does NOT modify subscriptions, access levels, or Founding Member records.
 * - Recipients = current confirmed Founding Member access only
 *   (foundingMemberActive + pro access + not trial), not the founding list alone.
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
  "As a reminder, your Founding Member pricing is locked in for life. No matter how many new features, lesson plans, activities, printables, tools, or updates are added in the future, you will continue to keep your special Founding Member rate as long as your membership remains active and in good standing.",
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
    sentAt: "",
    recipientCount: 0,
    sentCount: 0,
    failedCount: 0,
    softSkippedCount: 0,
    deliveries: [],
    failures: [],
    lastDryRunSummary: null,
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
  eng.settings.foundingMemberThankYou = {
    ...defaultFoundingMemberThankYouState(),
    ...(eng.settings.foundingMemberThankYou || {}),
  };
  eng.events = Array.isArray(eng.events) ? eng.events : [];
  return eng.settings.foundingMemberThankYou;
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

function qualifyFoundingRecipient(user, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const adminEmail = normalizeEmail(options.adminEmail || "");
  const includeAdmin = options.includeAdmin === true;
  const email = normalizeEmail(user?.email);
  const excludeReasons = [];

  if (!email) excludeReasons.push("missing_email");
  if (looksMalformedEmail(email)) excludeReasons.push("invalid_email");
  if (looksLikeTestEmail(email)) excludeReasons.push("test_email");
  if (looksDisposableEmail(email)) excludeReasons.push("disposable_email");
  if (String(user?.accountStatus || "").toLowerCase() === "disabled" || user?.disabled === true) {
    excludeReasons.push("disabled_account");
  }

  const foundingFlag = Boolean(user?.foundingMemberActive);
  const hasPro = membershipAccess.membershipHasProAccess(user, nowMs);
  const inTrial = membershipAccess.membershipUserInTrial(user, nowMs);
  const foundingActive = membershipAccess.membershipFoundingActive(user, nowMs);

  if (!foundingFlag) excludeReasons.push("foundingMemberActive_false");
  if (!hasPro) excludeReasons.push("no_pro_access");
  if (inTrial) excludeReasons.push("in_trial");
  if (!foundingActive) excludeReasons.push("not_active_founding_access");

  if (adminEmail && email === adminEmail && !includeAdmin) {
    excludeReasons.push("admin_excluded_until_approved");
  }

  const qualifies = excludeReasons.length === 0;
  const qualifyReason = qualifies
    ? "Current Founding Member access: foundingMemberActive=true, membershipHasProAccess=true, not in trial, valid non-test email"
    : "";

  return {
    email,
    qualifies,
    qualifyReason,
    excludeReasons,
    accountStatus: accountStatusLabel(user, nowMs),
    membershipPlan: membershipAccess.membershipPlanDisplay(user, nowMs),
    foundingMemberActive: foundingFlag,
    foundingMemberNumber: user?.foundingMemberNumber || null,
    stripeSubscriptionStatus: String(user?.stripeSubscriptionStatus || ""),
    subscriptionStatus: String(user?.subscriptionStatus || ""),
    plan: String(user?.plan || ""),
    inTrial,
    hasProAccess: hasPro,
    isAdminAccount: Boolean(adminEmail && email === adminEmail),
  };
}

/**
 * Build dry-run recipient report from production membership fields.
 * Scans all users; does not use foundingMembers[] as the include list.
 */
function buildFoundingMemberRecipientDryRun(store, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const adminEmail = normalizeEmail(options.adminEmail || "");
  const includeAdmin = options.includeAdmin === true;
  const users = store?.users && typeof store.users === "object" ? store.users : {};
  const foundingList = Array.isArray(store?.foundingMembers)
    ? store.foundingMembers.map(normalizeEmail).filter(Boolean)
    : [];

  const seen = new Set();
  const duplicatesRemoved = [];
  const recipients = [];
  const excluded = [];

  const entries = Object.entries(users);
  for (const [key, user] of entries) {
    const email = normalizeEmail(user?.email || key);
    if (!email) continue;

    // Only evaluate accounts that look founding-related OR have the active flag,
    // so the excluded section explains near-misses (list / historical / trials).
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

    const row = qualifyFoundingRecipient(
      { ...user, email },
      { nowMs, adminEmail, includeAdmin },
    );

    if (row.qualifies) recipients.push(row);
    else excluded.push(row);
  }

  recipients.sort((a, b) => a.email.localeCompare(b.email));
  excluded.sort((a, b) => a.email.localeCompare(b.email));

  const activeFoundingAccessCount = Object.values(users).filter((user) => (
    membershipAccess.membershipFoundingActive(user, nowMs)
    && !membershipAccess.membershipUserInTrial(user, nowMs)
  )).length;

  const content = buildEmailContent({ htmlEscape: options.htmlEscape || htmlEscape });

  return {
    dryRun: true,
    willSend: false,
    campaign: CAMPAIGN_KEY,
    audienceRule: "Only users with current confirmed Founding Member access (foundingMemberActive + pro access + not trial). Not the founding list, not all Pro/paid/Stripe customers.",
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
    notes: [
      "The founding list count can be higher than Active Founding access — list/historical/trial/past_due accounts are not recipients.",
      "Admin is excluded unless includeAdmin=true and that admin account genuinely qualifies as Founding Member.",
      "Sending does not modify subscriptions, access levels, or Founding Member records.",
      "EMAIL_AUTOMATIONS_ENABLED can remain false; this is a gated one-time send only.",
    ],
  };
}

function createFoundingMemberEmail(deps = {}) {
  const {
    sendEmail,
    readStore,
    writeStore,
    htmlEscape: htmlEscapeFn = htmlEscape,
    getAdminEmail = () => "",
    getSupportEmailStatus = () => ({ ready: false }),
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
    const dryRunAt = new Date().toISOString();

    state.preparedAt = dryRunAt;
    state.preparedRecipientCount = report.counts.recipients;
    state.preparedSubject = report.email.subject;
    state.dryRunToken = dryRunToken;
    state.dryRunAt = dryRunAt;
    state.lastDryRunSummary = {
      at: dryRunAt,
      recipientCount: report.counts.recipients,
      recipientEmails: report.recipients.map((r) => r.email),
      excludedCount: report.counts.excluded,
      foundingList: report.counts.foundingList,
      activeFoundingAccessNonTrial: report.counts.activeFoundingAccessNonTrial,
      includeAdmin,
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
      emailProvider: {
        ready: Boolean(emailStatus.ready),
        provider: emailStatus.provider || "not configured",
        from: emailStatus.from || "",
        note: emailStatus.note || "",
      },
      sendUnlocked: Boolean(
        !alreadySent
        && report.counts.recipients > 0
        && emailStatus.ready
        && dryRunToken,
      ),
      nextStep: alreadySent
        ? "Already sent — duplicate send blocked."
        : "Review recipients + email preview. To send, POST with confirmPhrase SEND_FOUNDING_MEMBER_EMAIL, confirm:true, and this dryRunToken.",
    };
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
        detail: `Pass confirmPhrase: "${CONFIRM_PHRASE}" after approving the dry-run list.`,
      };
    }

    if (options.confirm !== true) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "confirmation_required",
        detail: "Pass confirm: true after reviewing the dry-run recipient list and final email preview.",
      };
    }

    const dryRunToken = String(options.dryRunToken || "").trim();
    if (!state.dryRunToken || !dryRunToken || dryRunToken !== state.dryRunToken) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "dry_run_required",
        detail: "Run the dry-run preview and pass the returned dryRunToken with the send request.",
      };
    }
    const dryRunAgeMs = Date.now() - new Date(state.dryRunAt || 0).getTime();
    if (!Number.isFinite(dryRunAgeMs) || dryRunAgeMs < 0 || dryRunAgeMs > 2 * 60 * 60 * 1000) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "dry_run_expired",
        detail: "Dry-run token expired (2 hours). Re-run dry-run and approve again.",
      };
    }

    const adminEmail = normalizeEmail(options.adminEmail || getAdminEmail() || "");
    const includeAdmin = options.includeAdmin === true;
    const report = buildFoundingMemberRecipientDryRun(store, {
      adminEmail,
      includeAdmin,
      htmlEscape: htmlEscapeFn,
    });
    const recipients = report.recipients;
    if (!recipients.length) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "no_recipients",
        detail: "No verified active Founding Members qualify for this send.",
        dryRun: report,
      };
    }

    // Guard: recipient set must match the approved dry-run list (order-independent).
    const approved = new Set((state.lastDryRunSummary?.recipientEmails || []).map(normalizeEmail));
    const current = recipients.map((r) => r.email);
    const drift = current.filter((email) => !approved.has(email))
      .concat([...approved].filter((email) => !current.includes(email)));
    if (drift.length) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "recipient_drift",
        detail: "Recipient list changed since dry-run. Re-run dry-run and re-approve before sending.",
        drift: drift.slice(0, 25),
      };
    }

    const content = buildEmailContent({ htmlEscape: htmlEscapeFn });
    let sentCount = 0;
    let failCount = 0;
    let softSkip = 0;
    const deliveries = [];
    const failures = [];

    for (const row of recipients) {
      let emailResult = { sent: false, configured: false, provider: "not configured" };
      try {
        emailResult = await sendEmail({
          to: row.email,
          subject: content.subject,
          text: content.text,
          html: content.html,
        });
      } catch (err) {
        emailResult = {
          sent: false,
          configured: true,
          provider: "error",
          error: err.message || String(err),
        };
      }

      const delivery = {
        email: row.email,
        sent: Boolean(emailResult.sent),
        provider: emailResult.provider || "",
        messageId: emailResult.messageId || emailResult.id || "",
        error: emailResult.error || "",
        accountStatus: row.accountStatus,
        qualifyReason: row.qualifyReason,
      };

      const eng = store.emailEngagement;
      eng.events.unshift({
        id: `em-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        at: new Date().toISOString(),
        type: emailResult.sent ? "sent" : (emailResult.configured ? "failed" : "skipped_unconfigured"),
        templateKey: TEMPLATE_KEY,
        campaign: CAMPAIGN_KEY,
        to: row.email,
        subject: content.subject,
        provider: emailResult.provider || "",
        messageId: delivery.messageId,
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
      } else if (!emailResult.configured) {
        softSkip += 1;
        failures.push({ ...delivery, reason: "unconfigured" });
      } else {
        failCount += 1;
        failures.push({ ...delivery, reason: "failed" });
      }
    }

    const now = new Date().toISOString();
    // Stamp once-only even if soft-fail so this cannot become a recurring/bulk campaign.
    Object.assign(state, {
      sentAt: now,
      recipientCount: recipients.length,
      sentCount,
      failedCount: failCount,
      softSkippedCount: softSkip,
      deliveries: deliveries.slice(0, 200),
      failures: failures.slice(0, 200),
      dryRunToken: "",
    });
    writeStore(store);

    return {
      sent: sentCount,
      failed: failCount,
      softSkipped: softSkip,
      recipients: recipients.length,
      skipped: false,
      reason: sentCount ? "sent" : (softSkip ? "unconfigured" : "no_successful_sends"),
      sentAt: now,
      recurring: false,
      membershipRecordsModified: false,
      automationsEnabledRequired: false,
      deliveries,
      failures,
      excluded: report.excluded,
      duplicatesRemoved: report.duplicatesRemoved,
    };
  }

  return {
    CONFIRM_PHRASE,
    CAMPAIGN_KEY,
    buildEmailContent,
    buildFoundingMemberRecipientDryRun,
    qualifyFoundingRecipient,
    dryRun,
    send,
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
  qualifyFoundingRecipient,
  looksLikeTestEmail,
  looksMalformedEmail,
  defaultFoundingMemberThankYouState,
};
