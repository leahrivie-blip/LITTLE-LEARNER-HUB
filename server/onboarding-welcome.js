/**
 * Configurable onboarding welcome system for new Free accounts.
 * Delivers in-app system messages + branded welcome email once per account.
 */

const crypto = require("crypto");
const membershipAccess = require("../scripts/membership-access.js");

const SEQUENCE_ID = "free-welcome";
const BACKFILL_CONFIRM_PHRASE = "SEND_FREE_WELCOME_BACKFILL";

const TEMPLATE_VARIABLES = Object.freeze([
  { key: "FirstName", description: "User's first name (falls back to there)" },
  { key: "PlanName", description: "Current plan label (e.g. Free)" },
  { key: "FoundingSection", description: "Highlighted founding offer (empty when sold out)" },
  { key: "SiteUrl", description: "Site home URL" },
  { key: "LessonsUrl", description: "Lesson library URL" },
  { key: "UpgradeUrl", description: "Plans / upgrade URL" },
  { key: "MessagesUrl", description: "In-app messages URL" },
]);

const DEFAULT_FOUNDING_SECTION_TEXT = [
  "🔥 Only a few Founding Member spots left!",
  "",
  "Lock in $9.99/month while your membership remains continuously active before Founding closes. After the final spots are claimed, new Pro is $19.99/month.",
  "",
  "Existing Founding Members keep $9.99/month locked while your membership remains continuously active.",
].join("\n");

const DEFAULT_IN_APP_BODY = [
  "Welcome to Little Learner Hub, and thank you so much for joining!",
  "",
  "I'm so excited you're here. Little Learner Hub is built by a childcare provider with one goal—to create an all-in-one platform that makes your day easier.",
  "",
  "As a Free Member, you can start exploring free lesson plans, activities, and resources right away.",
  "",
  "If you'd like access to everything, you can upgrade to Pro at any time to unlock the full curriculum library and all premium features as they're released.",
  "",
  "{{FoundingSection}}",
  "",
  "Have questions, feedback, or ideas? You can message me directly inside Little Learner Hub anytime. I personally read every message and love hearing suggestions from childcare providers.",
  "",
  "Thank you for being here, and welcome to the community!",
  "",
  "— Leah",
].join("\n");

const DEFAULT_EMAIL_BODY = DEFAULT_IN_APP_BODY;

function defaultFreeWelcomeSequence() {
  return {
    id: SEQUENCE_ID,
    label: "Free Member Welcome",
    audience: "free",
    enabled: true,
    inApp: {
      enabled: true,
      title: "Welcome to Little Learner Hub! 🎉",
      body: DEFAULT_IN_APP_BODY,
    },
    email: {
      enabled: true,
      subject: "Welcome to Little Learner Hub! 🎉",
      body: DEFAULT_EMAIL_BODY,
      primaryCtaLabel: "Explore Free Resources",
      primaryCtaUrl: "{{LessonsUrl}}",
      secondaryCtaLabel: "Upgrade to Pro",
      secondaryCtaUrl: "{{UpgradeUrl}}",
      footerNote: "Questions? Reply to this email or message Leah inside Little Learner Hub anytime.",
    },
    foundingSection: {
      enabled: true,
      inAppText: DEFAULT_FOUNDING_SECTION_TEXT,
      emailHtml: `<div style="background:#fff8e8;border:1px solid #e8c96a;border-radius:10px;padding:16px 18px;margin:20px 0;">
  <p style="margin:0 0 8px;font-weight:700;color:#7a4f00;">🔥 Only a few Founding Member spots left!</p>
  <p style="margin:0 0 8px;color:#3d2f1f;">Lock in <strong>$9.99/month locked while your membership remains continuously active</strong> before Founding closes. After the final spots are claimed, new Pro is <strong>$19.99/month</strong>.</p>
  <p style="margin:0;color:#3d2f1f;">Existing Founding Members keep $9.99/month locked while your membership remains continuously active.</p>
</div>`,
      emailText: DEFAULT_FOUNDING_SECTION_TEXT,
    },
    scheduledSteps: [
      { id: "day-3", delayDays: 3, enabled: false, label: "Day 3 check-in", inApp: { enabled: false, title: "", body: "" }, email: { enabled: false, subject: "", body: "" } },
      { id: "day-7", delayDays: 7, enabled: false, label: "Day 7 tips", inApp: { enabled: false, title: "", body: "" }, email: { enabled: false, subject: "", body: "" } },
      { id: "day-30", delayDays: 30, enabled: false, label: "Day 30 upgrade nudge", inApp: { enabled: false, title: "", body: "" }, email: { enabled: false, subject: "", body: "" } },
    ],
    updatedAt: "",
  };
}

function defaultOnboardingWelcomeStore() {
  return {
    sequences: {
      [SEQUENCE_ID]: defaultFreeWelcomeSequence(),
    },
    backfill: {
      lastRunAt: "",
      lastRunCount: 0,
      lastRunRecipients: [],
    },
    updatedAt: "",
  };
}

function clampText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function userDisplayName(user) {
  const first = clampText(user?.firstName, 80);
  if (first) return first;
  const name = clampText(user?.name || user?.displayName, 120);
  if (name) return name.split(/\s+/)[0] || name;
  return "there";
}

function siteBase(siteUrl) {
  return String(siteUrl || "").replace(/\/$/, "") || "https://littlelearnershubbyleah.com";
}

function welcomeFlags(user) {
  const flags = user?.onboardingWelcome && typeof user.onboardingWelcome === "object"
    ? user.onboardingWelcome
    : {};
  return {
    freeWelcomeSentAt: flags.freeWelcomeSentAt || "",
    inAppMessageId: flags.inAppMessageId || "",
    emailSentAt: flags.emailSentAt || "",
  };
}

function ensureOnboardingWelcome(store) {
  if (!store.onboardingWelcome || typeof store.onboardingWelcome !== "object") {
    store.onboardingWelcome = defaultOnboardingWelcomeStore();
  }
  const root = store.onboardingWelcome;
  root.sequences = root.sequences && typeof root.sequences === "object" ? root.sequences : {};
  const defaults = defaultFreeWelcomeSequence();
  const current = root.sequences[SEQUENCE_ID] && typeof root.sequences[SEQUENCE_ID] === "object"
    ? root.sequences[SEQUENCE_ID]
    : {};
  root.sequences[SEQUENCE_ID] = {
    ...defaults,
    ...current,
    inApp: { ...defaults.inApp, ...(current.inApp || {}) },
    email: { ...defaults.email, ...(current.email || {}) },
    foundingSection: { ...defaults.foundingSection, ...(current.foundingSection || {}) },
    scheduledSteps: Array.isArray(current.scheduledSteps) && current.scheduledSteps.length
      ? current.scheduledSteps.slice(0, 12).map((step, index) => ({
        ...defaults.scheduledSteps[index],
        ...step,
        inApp: { ...(defaults.scheduledSteps[index]?.inApp || {}), ...(step.inApp || {}) },
        email: { ...(defaults.scheduledSteps[index]?.email || {}), ...(step.email || {}) },
      }))
      : defaults.scheduledSteps,
  };
  root.backfill = {
    ...defaultOnboardingWelcomeStore().backfill,
    ...(root.backfill || {}),
  };
  return root;
}

function isEligibleForFreeWelcome(user, nowMs = Date.now()) {
  if (!user) return false;
  const email = String(user.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return false;
  if (welcomeFlags(user).freeWelcomeSentAt) return false;

  if (membershipAccess.membershipHasProAccess(user, nowMs)) return false;
  if (membershipAccess.membershipUserInTrial(user, nowMs)) return false;
  if (membershipAccess.membershipFoundingActive(user, nowMs)) return false;

  const plan = String(user.plan || "Free").trim();
  const selectedPlan = String(user.selectedPlanAtSignup || user.signupPlan || "").trim().toLowerCase();
  if (["Pro", "Founding"].includes(plan)) return false;
  if (["pro", "founding", "founding member"].includes(selectedPlan)) return false;
  if (user.foundingMemberActive || user.foundingMember) return false;

  const status = String(user.accountStatus || "Active").trim().toLowerCase();
  if (status === "disabled" || status === "deleted" || status === "archived") return false;

  return true;
}

function buildTemplateContext(user, store, deps) {
  const siteUrl = siteBase(deps.SITE_URL);
  const foundingOpen = typeof deps.foundingSpotsRemaining === "function"
    ? deps.foundingSpotsRemaining(store) > 0
    : false;
  const sequence = ensureOnboardingWelcome(store).sequences[SEQUENCE_ID];
  const baseContext = {
    FirstName: userDisplayName(user),
    PlanName: membershipAccess.membershipPlanDisplay(user) || "Free",
    SiteUrl: siteUrl,
    LessonsUrl: `${siteUrl}/#lessons`,
    UpgradeUrl: `${siteUrl}/#plans`,
    MessagesUrl: `${siteUrl}/?view=messages`,
    foundingOpen,
    sequence,
  };
  const foundingSectionRaw = foundingOpen && sequence.foundingSection?.enabled !== false
    ? String(sequence.foundingSection?.inAppText || DEFAULT_FOUNDING_SECTION_TEXT).trim()
    : "";
  return {
    ...baseContext,
    FoundingSection: applyTemplateVariables(foundingSectionRaw, baseContext),
  };
}

function applyTemplateVariables(text, context) {
  let output = String(text || "");
  Object.entries(context).forEach(([key, value]) => {
    if (typeof value === "object") return;
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi");
    output = output.replace(pattern, String(value ?? ""));
  });
  // Remove blank lines left when optional sections are empty.
  output = output.replace(/\n{3,}/g, "\n\n").trim();
  return output;
}

function buildFoundingEmailSection(sequence, foundingOpen) {
  if (!foundingOpen || sequence.foundingSection?.enabled === false) return { html: "", text: "" };
  return {
    html: String(sequence.foundingSection?.emailHtml || "").trim(),
    text: String(sequence.foundingSection?.emailText || DEFAULT_FOUNDING_SECTION_TEXT).trim(),
  };
}

function paragraphsToHtml(text, escape = htmlEscape) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map((line) => escape(line)).join("<br>");
      return `<p style="margin:0 0 16px;line-height:1.6;color:#1f2937;font-size:16px;">${lines}</p>`;
    })
    .join("");
}

function buildWelcomeEmailHtml({ subject, bodyText, context, sequence, siteUrl, escape = htmlEscape }) {
  const base = siteBase(siteUrl);
  const logoUrl = `${base}/images/icons/icon-192.png`;
  const founding = buildFoundingEmailSection(sequence, context.foundingOpen);
  let bodyWithFounding = String(bodyText || "");
  if (bodyWithFounding.includes("{{FoundingSection}}")) {
    bodyWithFounding = bodyWithFounding.replace(/\{\{\s*FoundingSection\s*\}\}/gi, founding.text);
  } else if (founding.text) {
    bodyWithFounding = `${bodyWithFounding}\n\n${founding.text}`;
  }
  const resolvedBody = applyTemplateVariables(bodyWithFounding, context);
  const primaryUrl = applyTemplateVariables(sequence.email?.primaryCtaUrl || "{{LessonsUrl}}", context);
  const secondaryUrl = applyTemplateVariables(sequence.email?.secondaryCtaUrl || "{{UpgradeUrl}}", context);
  const primaryLabel = escape(sequence.email?.primaryCtaLabel || "Explore Free Resources");
  const secondaryLabel = escape(sequence.email?.secondaryCtaLabel || "Upgrade to Pro");
  const footerNote = escape(applyTemplateVariables(sequence.email?.footerNote || "", context));
  const safeSubject = escape(subject || "Welcome to Little Learner Hub");

  const foundingHtml = founding.html && !String(bodyText || "").includes("{{FoundingSection}}")
    ? founding.html
    : (founding.html && String(bodyText || "").includes("{{FoundingSection}}") ? "" : founding.html);

  const bodyHtml = paragraphsToHtml(resolvedBody, escape) + (foundingHtml ? foundingHtml : "");

  return `
    <div style="font-family:Georgia,'Times New Roman',serif;max-width:640px;margin:0 auto;padding:24px 20px;color:#1f2937;line-height:1.6;background:#ffffff;">
      <div style="text-align:center;margin:0 0 24px;">
        <img src="${escape(logoUrl)}" alt="Little Learner Hub" width="72" height="72" style="display:inline-block;border-radius:16px;" />
        <p style="margin:12px 0 0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#8a7048;">Little Learner Hub</p>
      </div>
      <h1 style="font-size:26px;margin:0 0 20px;color:#111827;text-align:center;">${safeSubject}</h1>
      ${bodyHtml}
      <div style="text-align:center;margin:28px 0 12px;">
        <a href="${escape(primaryUrl)}" style="display:inline-block;background:#2f6f5e;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;margin:0 8px 12px;">${primaryLabel}</a>
        <a href="${escape(secondaryUrl)}" style="display:inline-block;background:#ffffff;color:#2f6f5e;text-decoration:none;padding:13px 20px;border-radius:10px;font-family:Helvetica,Arial,sans-serif;font-size:15px;border:2px solid #2f6f5e;margin:0 8px 12px;">${secondaryLabel}</a>
      </div>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
      <p style="font-size:13px;color:#6b7280;margin:0;text-align:center;">${footerNote || "Questions? Message Leah inside Little Learner Hub anytime."}</p>
      <p style="font-size:12px;color:#9ca3af;margin:12px 0 0;text-align:center;">Little Learner Hub · Built by a childcare provider, for childcare providers</p>
    </div>
  `.trim();
}

function buildWelcomePreview(user, store, deps, channel = "email") {
  const context = buildTemplateContext(user, store, deps);
  const sequence = context.sequence;
  if (channel === "in_app") {
    const title = applyTemplateVariables(sequence.inApp?.title || "", context);
    const body = applyTemplateVariables(sequence.inApp?.body || "", context);
    return { channel, title, body, text: body, html: "", context, foundingOpen: context.foundingOpen };
  }
  const subject = applyTemplateVariables(sequence.email?.subject || "", context);
  const bodyTemplate = sequence.email?.body || "";
  const textBody = applyTemplateVariables(
    bodyTemplate.includes("{{FoundingSection}}")
      ? bodyTemplate.replace(/\{\{\s*FoundingSection\s*\}\}/gi, buildFoundingEmailSection(sequence, context.foundingOpen).text)
      : `${bodyTemplate}${context.foundingOpen ? `\n\n${buildFoundingEmailSection(sequence, context.foundingOpen).text}` : ""}`,
    context,
  );
  const html = buildWelcomeEmailHtml({
    subject,
    bodyText: bodyTemplate,
    context,
    sequence,
    siteUrl: deps.SITE_URL,
    escape: deps.htmlEscape || htmlEscape,
  });
  return { channel, subject, title: subject, body: textBody, text: textBody, html, context, foundingOpen: context.foundingOpen };
}

function normalizeSequencePayload(input = {}) {
  const defaults = defaultFreeWelcomeSequence();
  const scheduledSteps = Array.isArray(input.scheduledSteps)
    ? input.scheduledSteps.slice(0, 12).map((step, index) => ({
      ...(defaults.scheduledSteps[index] || { id: step.id || `step-${index}`, delayDays: Number(step.delayDays) || 0 }),
      id: clampText(step.id, 80) || `step-${index}`,
      delayDays: Math.max(0, Math.min(365, Number(step.delayDays) || 0)),
      enabled: step.enabled === true,
      label: clampText(step.label, 120),
      inApp: {
        enabled: step.inApp?.enabled === true,
        title: clampText(step.inApp?.title, 300),
        body: clampText(step.inApp?.body, 12000),
      },
      email: {
        enabled: step.email?.enabled === true,
        subject: clampText(step.email?.subject, 300),
        body: clampText(step.email?.body, 12000),
      },
    }))
    : defaults.scheduledSteps;

  return {
    id: SEQUENCE_ID,
    label: clampText(input.label, 120) || defaults.label,
    audience: "free",
    enabled: input.enabled !== false,
    inApp: {
      enabled: input.inApp?.enabled !== false,
      title: clampText(input.inApp?.title, 300) || defaults.inApp.title,
      body: clampText(input.inApp?.body, 12000) || defaults.inApp.body,
    },
    email: {
      enabled: input.email?.enabled !== false,
      subject: clampText(input.email?.subject, 300) || defaults.email.subject,
      body: clampText(input.email?.body, 20000) || defaults.email.body,
      primaryCtaLabel: clampText(input.email?.primaryCtaLabel, 120) || defaults.email.primaryCtaLabel,
      primaryCtaUrl: clampText(input.email?.primaryCtaUrl, 500) || defaults.email.primaryCtaUrl,
      secondaryCtaLabel: clampText(input.email?.secondaryCtaLabel, 120) || defaults.email.secondaryCtaLabel,
      secondaryCtaUrl: clampText(input.email?.secondaryCtaUrl, 500) || defaults.email.secondaryCtaUrl,
      footerNote: clampText(input.email?.footerNote, 500) || defaults.email.footerNote,
    },
    foundingSection: {
      enabled: input.foundingSection?.enabled !== false,
      inAppText: clampText(input.foundingSection?.inAppText, 4000) || defaults.foundingSection.inAppText,
      emailHtml: clampText(input.foundingSection?.emailHtml, 8000) || defaults.foundingSection.emailHtml,
      emailText: clampText(input.foundingSection?.emailText, 4000) || defaults.foundingSection.emailText,
    },
    scheduledSteps,
    updatedAt: new Date().toISOString(),
  };
}

function createOnboardingWelcome(deps) {
  const {
    readStore,
    writeStore,
    upsertUser,
    sendEmail,
    fanOutNotificationsAndPush,
    ensureMessagingStore,
    messagingRandomId,
    messagePreviewText,
    messagingLib,
    foundingSpotsRemaining,
    ADMIN_EMAIL,
    ADMIN_NAME,
    SUPPORT_EMAIL_TO,
    SITE_URL,
    htmlEscape = htmlEscape,
    recordTimeline,
  } = deps;

  function getConfig(store = readStore()) {
    const root = ensureOnboardingWelcome(store);
    return {
      sequence: root.sequences[SEQUENCE_ID],
      variables: TEMPLATE_VARIABLES,
      backfill: root.backfill,
      updatedAt: root.updatedAt || root.sequences[SEQUENCE_ID]?.updatedAt || "",
    };
  }

  async function deliverInAppWelcome(store, email, user, preview) {
    const now = new Date().toISOString();
    const message = {
      id: messagingRandomId("msg"),
      kind: "message",
      audience: "private",
      senderType: "admin",
      senderEmail: ADMIN_EMAIL,
      senderName: ADMIN_NAME || "Leah",
      toEmail: email,
      conversationEmail: email,
      selectedEmails: [],
      subject: preview.title,
      body: preview.body,
      recipientCount: 1,
      createdAt: now,
      sentAt: now,
      status: "sent",
      deliverVia: "in_app",
      channel: "onboarding_welcome",
      onboardingSequenceId: SEQUENCE_ID,
      pushSummary: null,
    };
    store.messages.unshift(message);
    if (typeof recordTimeline === "function") {
      recordTimeline(store, {
        email,
        type: "onboarding_welcome",
        title: preview.title,
        detail: preview.body.slice(0, 400),
      });
    }
    await fanOutNotificationsAndPush(store, {
      type: "message",
      recipients: [email],
      title: "Welcome to Little Learner Hub",
      preview: messagePreviewText(preview.body),
      messageId: message.id,
      conversationEmail: email,
      refId: `onboarding:${SEQUENCE_ID}:${email}`,
      senderName: ADMIN_NAME || "Leah",
      deepLink: "/?view=messages",
    });
    return { sent: true, messageId: message.id };
  }

  async function deliverEmailWelcome(email, user, preview) {
    let emailResult = { sent: false, configured: false, provider: "not configured" };
    try {
      emailResult = await sendEmail({
        to: email,
        replyTo: SUPPORT_EMAIL_TO,
        subject: preview.subject,
        text: preview.text,
        html: preview.html,
      });
    } catch (err) {
      emailResult = {
        sent: false,
        configured: true,
        provider: "error",
        error: err?.message || String(err),
      };
    }
    return emailResult;
  }

  async function deliverFreeWelcome(email, options = {}) {
    const clean = String(email || "").trim().toLowerCase();
    if (!clean) return { ok: false, reason: "missing_email" };

    const store = ensureMessagingStore(readStore());
    const user = store.users?.[clean] || { email: clean };
    if (!isEligibleForFreeWelcome(user) && !options.force) {
      return { ok: false, reason: "not_eligible", email: clean };
    }
    if (welcomeFlags(user).freeWelcomeSentAt && !options.force) {
      return { ok: false, reason: "already_sent", email: clean };
    }

    const config = getConfig(store);
    if (!config.sequence.enabled && !options.force) {
      return { ok: false, reason: "sequence_disabled", email: clean };
    }

    const previewInApp = buildWelcomePreview(user, store, { SITE_URL, foundingSpotsRemaining, htmlEscape }, "in_app");
    const previewEmail = buildWelcomePreview(user, store, { SITE_URL, foundingSpotsRemaining, htmlEscape }, "email");

    const result = {
      ok: true,
      email: clean,
      inApp: { attempted: false, sent: false, skipped: false, reason: "" },
      emailDelivery: { attempted: false, sent: false, skipped: false, reason: "" },
    };

    if (config.sequence.inApp?.enabled !== false || options.forceInApp) {
      result.inApp.attempted = true;
      const inApp = await deliverInAppWelcome(store, clean, user, previewInApp);
      result.inApp.sent = Boolean(inApp.sent);
      result.inApp.messageId = inApp.messageId || "";
      result.inApp.reason = inApp.sent ? "sent" : "failed";
    } else {
      result.inApp.skipped = true;
      result.inApp.reason = "disabled";
    }

    if (config.sequence.email?.enabled !== false || options.forceEmail) {
      result.emailDelivery.attempted = true;
      const emailResult = await deliverEmailWelcome(clean, user, previewEmail);
      result.emailDelivery.sent = Boolean(emailResult.sent);
      result.emailDelivery.configured = Boolean(emailResult.configured);
      result.emailDelivery.reason = emailResult.sent
        ? "sent"
        : (emailResult.configured ? "send_failed" : "unconfigured");
      result.emailDelivery.provider = emailResult.provider || "";
      result.emailDelivery.error = emailResult.error || "";
    } else {
      result.emailDelivery.skipped = true;
      result.emailDelivery.reason = "disabled";
    }

    const stamp = {
      freeWelcomeSentAt: new Date().toISOString(),
      inAppMessageId: result.inApp.messageId || welcomeFlags(user).inAppMessageId || "",
      emailSentAt: result.emailDelivery.sent ? new Date().toISOString() : (welcomeFlags(user).emailSentAt || ""),
      reason: options.reason || "signup",
    };
    upsertUser(clean, { onboardingWelcome: stamp });

    return result;
  }

  async function maybeDeliverOnSignup(email) {
    const store = readStore();
    const user = store.users?.[String(email || "").trim().toLowerCase()] || { email };
    if (!isEligibleForFreeWelcome(user)) {
      return { ok: false, reason: "not_eligible" };
    }
    return deliverFreeWelcome(email, { reason: "signup" });
  }

  function listRecentFreeSignupsWithoutWelcome(store, limit = 5) {
    const users = Object.values(store.users || {});
    return users
      .filter((user) => isEligibleForFreeWelcome(user) && (user.signupAt || user.createdAt))
      .sort((a, b) => {
        const left = new Date(b.signupAt || b.createdAt || 0).getTime();
        const right = new Date(a.signupAt || a.createdAt || 0).getTime();
        return left - right;
      })
      .slice(0, Math.max(1, Math.min(limit, 25)))
      .map((user) => ({
        email: String(user.email || "").trim().toLowerCase(),
        firstName: user.firstName || "",
        signupAt: user.signupAt || user.createdAt || "",
      }));
  }

  async function backfillRecentFreeMembers(count = 5, options = {}) {
    const store = readStore();
    const recipients = listRecentFreeSignupsWithoutWelcome(store, count);
    const results = [];
    for (const row of recipients) {
      // eslint-disable-next-line no-await-in-loop
      const result = await deliverFreeWelcome(row.email, {
        reason: options.reason || "backfill",
        force: Boolean(options.force),
      });
      results.push({ ...row, result });
    }
    const fresh = readStore();
    const root = ensureOnboardingWelcome(fresh);
    root.backfill = {
      lastRunAt: new Date().toISOString(),
      lastRunCount: results.length,
      lastRunRecipients: results.map((entry) => entry.email),
    };
    root.updatedAt = root.backfill.lastRunAt;
    writeStore(fresh);
    return { count: results.length, results };
  }

  function saveConfig(sequenceInput, { deferPersist = false } = {}) {
    const store = readStore();
    const root = ensureOnboardingWelcome(store);
    root.sequences[SEQUENCE_ID] = normalizeSequencePayload(sequenceInput);
    root.updatedAt = new Date().toISOString();
    if (!deferPersist) writeStore(store);
    return getConfig(store);
  }

  return {
    SEQUENCE_ID,
    BACKFILL_CONFIRM_PHRASE,
    TEMPLATE_VARIABLES,
    defaultOnboardingWelcomeStore,
    ensureOnboardingWelcome,
    isEligibleForFreeWelcome,
    welcomeFlags,
    buildTemplateContext,
    applyTemplateVariables,
    buildWelcomePreview,
    normalizeSequencePayload,
    getConfig,
    deliverFreeWelcome,
    maybeDeliverOnSignup,
    listRecentFreeSignupsWithoutWelcome,
    backfillRecentFreeMembers,
    saveConfig,
  };
}

module.exports = {
  SEQUENCE_ID,
  BACKFILL_CONFIRM_PHRASE,
  TEMPLATE_VARIABLES,
  defaultOnboardingWelcomeStore,
  defaultFreeWelcomeSequence,
  ensureOnboardingWelcome,
  isEligibleForFreeWelcome,
  welcomeFlags,
  buildTemplateContext,
  applyTemplateVariables,
  buildWelcomePreview,
  normalizeSequencePayload,
  createOnboardingWelcome,
};
