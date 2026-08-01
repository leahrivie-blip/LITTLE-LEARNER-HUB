/**
 * Configurable onboarding welcome system for Free, Trial, and Pro members.
 * Delivers in-app system messages + branded welcome email once per sequence.
 *
 * Auto-delivery for Trial/Pro sequences only applies to accounts that start
 * trial/paid membership after AUTO_DELIVER_ELIGIBLE_AFTER (existing Pros/trials
 * — including the most recent Pro joiners — are never backfilled).
 */

const membershipAccess = require("../scripts/membership-access.js");

const SEQUENCE_ID = "free-welcome";
const TRIAL_SEQUENCE_ID = "trial-welcome";
const TRIAL_CHECKIN_SEQUENCE_ID = "trial-checkin";
const PRO_SEQUENCE_ID = "pro-welcome";
const BACKFILL_CONFIRM_PHRASE = "SEND_FREE_WELCOME_BACKFILL";
/** Only memberships started on/after this UTC time auto-receive Trial/Pro welcomes. */
const AUTO_DELIVER_ELIGIBLE_AFTER = "2026-08-01T02:30:00.000Z";
const CONTENT_REVISION = "20260801-welcome-v2";

const TEMPLATE_VARIABLES = Object.freeze([
  { key: "FirstName", description: "User's first name (falls back to there)" },
  { key: "PlanName", description: "Current plan label (e.g. Free)" },
  { key: "FoundingSection", description: "Legacy template slot (always empty — Founding acquisition closed)" },
  { key: "SiteUrl", description: "Site home URL" },
  { key: "LessonsUrl", description: "Lesson library URL" },
  { key: "UpgradeUrl", description: "Plans / upgrade URL" },
  { key: "MessagesUrl", description: "In-app messages URL" },
]);

const DEFAULT_FOUNDING_SECTION_TEXT = "";

const FREE_WELCOME_BODY = [
  "Thank you so much for joining Little Learner Hub!",
  "",
  "I’m so happy you’re here. As a childcare provider myself, I created this platform to save educators time, reduce stress, and make lesson planning easier.",
  "",
  "As a Free Member, you can start exploring free lesson plans, activities, and resources right away.",
  "",
  "One thing that makes Little Learner Hub different is that it’s constantly growing. I build new features, lesson plans, and tools based on what childcare providers actually need.",
  "",
  "Have an idea that would make your day easier? Looking for a specific theme, age group, activity, or feature?",
  "",
  "Send me a message anytime through Little Learner Hub.",
  "",
  "I personally read every message, and many of the updates you see are inspired by suggestions from providers just like you. I’m building this platform for you, so your feedback truly matters.",
  "",
  "Whenever you’re ready, you can upgrade to Pro to unlock the complete curriculum library, premium tools, and every new feature as it’s released.",
  "",
  "Thank you again for being here. I can’t wait to keep building Little Learner Hub with you! 💜",
].join("\n");

const TRIAL_WELCOME_BODY = [
  "Thanks for starting your Pro trial!",
  "",
  "Over the next 7 days, you’ll get to explore the Pro experience and see how Little Learner Hub can save you time every week.",
  "",
  "During your trial you can:",
  "",
  "• Browse and explore the complete curriculum library.",
  "• Open and preview every Pro lesson plan.",
  "• Save lesson plans to your calendar.",
  "• Try Pro tools and features.",
  "• Download or print up to 3 premium lesson plans during your trial.",
  "",
  "The download limit only applies during the trial. Once you become a Pro member, you’ll have unlimited access to your curriculum library and premium resources.",
  "",
  "I’m building Little Learner Hub for childcare providers, so your feedback means everything to me.",
  "",
  "Need a lesson plan for a specific theme or age group? Wish a feature worked differently? Have an idea that would make your day easier?",
  "",
  "Send me a message anytime inside Little Learner Hub. I personally read every message, and many updates come directly from suggestions from providers like you.",
  "",
  "Thank you for giving Little Learner Hub a try. I hope it becomes a tool you love using every day! 💜",
].join("\n");

const TRIAL_CHECKIN_BODY = [
  "You’ve been exploring Little Learner Hub for a few days now, and I’d love to hear what you think!",
  "",
  "What’s one thing that would make Little Learner Hub even more helpful for your classroom?",
  "",
  "Whether it’s:",
  "• A lesson plan you’d like to see",
  "• A feature that would save you time",
  "• Something that’s confusing",
  "• Or an idea you’ve always wished existed",
  "",
  "Send me a message anytime inside Little Learner Hub.",
  "",
  "I personally read every message, and many of the updates on Little Learner Hub have come directly from childcare providers like you. I’m building this platform for you, and your feedback truly helps shape what’s added next.",
  "",
  "Don’t forget—you can continue exploring the curriculum library and Pro features throughout your trial, and you can download or print up to 3 premium lesson plans during your trial.",
  "",
  "Thanks again for being here. I can’t wait to hear your ideas and keep making Little Learner Hub even better! 💜",
].join("\n");

const PRO_WELCOME_BODY = [
  "Thank you so much for becoming a Pro Member!",
  "",
  "Your support means more than you know. Every subscription helps me continue building Little Learner Hub into the platform childcare providers deserve.",
  "",
  "You now have unlimited access to the full curriculum library, premium lesson plans, activities, planning tools, and every new Pro feature as it’s released.",
  "",
  "But here’s something even more important…",
  "",
  "I’m not building Little Learner Hub for childcare providers—I’m building it with childcare providers.",
  "",
  "If there’s a feature you’d love to have, a lesson plan you’re looking for, or something that would make your day easier, send me a message anytime inside Little Learner Hub.",
  "",
  "I personally read every message, and many of the updates and ideas added to Little Learner Hub come directly from members like you.",
  "",
  "Thank you for believing in my vision and for being part of this community. I’m so excited to keep growing Little Learner Hub with you and can’t wait to show you what’s coming next.",
  "",
  "Welcome to Pro! 💜",
].join("\n");

function defaultFreeWelcomeSequence() {
  return {
    id: SEQUENCE_ID,
    label: "Free Member Welcome",
    audience: "free",
    contentRevision: CONTENT_REVISION,
    enabled: true,
    inApp: {
      enabled: true,
      title: "Welcome to Little Learner Hub! 💜",
      body: FREE_WELCOME_BODY,
    },
    email: {
      enabled: true,
      subject: "Welcome to Little Learner Hub! 💜",
      body: FREE_WELCOME_BODY,
      primaryCtaLabel: "Explore Free Resources",
      primaryCtaUrl: "{{LessonsUrl}}",
      secondaryCtaLabel: "Upgrade to Pro",
      secondaryCtaUrl: "{{UpgradeUrl}}",
      footerNote: "Questions? Reply to this email or message Leah inside Little Learner Hub anytime.",
    },
    foundingSection: {
      enabled: false,
      inAppText: "",
      emailHtml: "",
      emailText: "",
    },
    scheduledSteps: [
      { id: "day-3", delayDays: 3, enabled: false, label: "Day 3 check-in", inApp: { enabled: false, title: "", body: "" }, email: { enabled: false, subject: "", body: "" } },
      { id: "day-7", delayDays: 7, enabled: false, label: "Day 7 tips", inApp: { enabled: false, title: "", body: "" }, email: { enabled: false, subject: "", body: "" } },
      { id: "day-30", delayDays: 30, enabled: false, label: "Day 30 upgrade nudge", inApp: { enabled: false, title: "", body: "" }, email: { enabled: false, subject: "", body: "" } },
    ],
    updatedAt: "",
  };
}

function defaultTrialWelcomeSequence() {
  return {
    id: TRIAL_SEQUENCE_ID,
    label: "Pro Trial Welcome",
    audience: "trial",
    contentRevision: CONTENT_REVISION,
    enabled: true,
    inApp: {
      enabled: true,
      title: "Welcome to Your Pro Trial! 🎉",
      body: TRIAL_WELCOME_BODY,
    },
    email: {
      enabled: true,
      subject: "Welcome to Your Pro Trial! 🎉",
      body: TRIAL_WELCOME_BODY,
      primaryCtaLabel: "Explore Curriculum",
      primaryCtaUrl: "{{LessonsUrl}}",
      secondaryCtaLabel: "Send Leah a Message",
      secondaryCtaUrl: "{{MessagesUrl}}",
      footerNote: "Questions? Message Leah inside Little Learner Hub anytime.",
    },
    foundingSection: { enabled: false, inAppText: "", emailHtml: "", emailText: "" },
    scheduledSteps: [],
    updatedAt: "",
  };
}

function defaultTrialCheckinSequence() {
  return {
    id: TRIAL_CHECKIN_SEQUENCE_ID,
    label: "Trial Check-in (Day 3)",
    audience: "trial",
    contentRevision: CONTENT_REVISION,
    enabled: true,
    delayDays: 3,
    inApp: {
      enabled: true,
      title: "How’s Your Trial Going? 💜",
      body: TRIAL_CHECKIN_BODY,
    },
    email: {
      enabled: true,
      subject: "How’s Your Trial Going? 💜",
      body: TRIAL_CHECKIN_BODY,
      primaryCtaLabel: "Send Feedback",
      primaryCtaUrl: "{{MessagesUrl}}",
      secondaryCtaLabel: "Continue Exploring",
      secondaryCtaUrl: "{{LessonsUrl}}",
      footerNote: "I personally read every message — thank you for helping shape Little Learner Hub.",
    },
    foundingSection: { enabled: false, inAppText: "", emailHtml: "", emailText: "" },
    scheduledSteps: [],
    updatedAt: "",
  };
}

function defaultProWelcomeSequence() {
  return {
    id: PRO_SEQUENCE_ID,
    label: "Pro Member Welcome",
    audience: "pro",
    contentRevision: CONTENT_REVISION,
    enabled: true,
    inApp: {
      enabled: true,
      title: "Thank You for Becoming a Pro Member! 💜",
      body: PRO_WELCOME_BODY,
    },
    email: {
      enabled: true,
      subject: "Thank You for Becoming a Pro Member! 💜",
      body: PRO_WELCOME_BODY,
      primaryCtaLabel: "Explore Your Curriculum",
      primaryCtaUrl: "{{LessonsUrl}}",
      secondaryCtaLabel: "Send Leah a Message",
      secondaryCtaUrl: "{{MessagesUrl}}",
      footerNote: "Questions? Message Leah inside Little Learner Hub anytime.",
    },
    foundingSection: { enabled: false, inAppText: "", emailHtml: "", emailText: "" },
    scheduledSteps: [],
    updatedAt: "",
  };
}

function allDefaultSequences() {
  return {
    [SEQUENCE_ID]: defaultFreeWelcomeSequence(),
    [TRIAL_SEQUENCE_ID]: defaultTrialWelcomeSequence(),
    [TRIAL_CHECKIN_SEQUENCE_ID]: defaultTrialCheckinSequence(),
    [PRO_SEQUENCE_ID]: defaultProWelcomeSequence(),
  };
}

function defaultOnboardingWelcomeStore() {
  return {
    sequences: allDefaultSequences(),
    autoDeliverEligibleAfter: AUTO_DELIVER_ELIGIBLE_AFTER,
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
    trialWelcomeSentAt: flags.trialWelcomeSentAt || "",
    trialCheckinSentAt: flags.trialCheckinSentAt || "",
    proWelcomeSentAt: flags.proWelcomeSentAt || "",
    inAppMessageId: flags.inAppMessageId || "",
    emailSentAt: flags.emailSentAt || "",
  };
}

function mergeSequenceWithDefaults(defaults, current = {}) {
  const stale = !current || current.contentRevision !== defaults.contentRevision;
  if (stale) {
    return {
      ...defaults,
      enabled: current.enabled !== false,
      contentRevision: defaults.contentRevision,
      inApp: {
        ...defaults.inApp,
        enabled: current.inApp?.enabled !== false,
      },
      email: {
        ...defaults.email,
        enabled: current.email?.enabled !== false,
      },
      foundingSection: { ...defaults.foundingSection },
      scheduledSteps: Array.isArray(defaults.scheduledSteps) ? defaults.scheduledSteps.map((step) => ({ ...step, inApp: { ...step.inApp }, email: { ...step.email } })) : [],
      delayDays: defaults.delayDays,
      updatedAt: current.updatedAt || "",
    };
  }
  return {
    ...defaults,
    ...current,
    contentRevision: defaults.contentRevision,
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
}

function ensureOnboardingWelcome(store) {
  if (!store.onboardingWelcome || typeof store.onboardingWelcome !== "object") {
    store.onboardingWelcome = defaultOnboardingWelcomeStore();
  }
  const root = store.onboardingWelcome;
  root.sequences = root.sequences && typeof root.sequences === "object" ? root.sequences : {};
  if (!root.autoDeliverEligibleAfter) {
    root.autoDeliverEligibleAfter = AUTO_DELIVER_ELIGIBLE_AFTER;
  }
  const defaultsById = allDefaultSequences();
  Object.keys(defaultsById).forEach((id) => {
    root.sequences[id] = mergeSequenceWithDefaults(defaultsById[id], root.sequences[id]);
  });
  root.backfill = {
    ...defaultOnboardingWelcomeStore().backfill,
    ...(root.backfill || {}),
  };
  return root;
}

function autoDeliverCutoffMs(store) {
  const raw = store?.onboardingWelcome?.autoDeliverEligibleAfter || AUTO_DELIVER_ELIGIBLE_AFTER;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : new Date(AUTO_DELIVER_ELIGIBLE_AFTER).getTime();
}

function membershipStartedAtMs(user) {
  const candidates = [
    user?.subscriptionStartedAt,
    user?.trialStart,
    user?.promoRedeemedAt,
    user?.signupAt,
    user?.createdAt,
  ];
  for (const value of candidates) {
    const ms = new Date(value || 0).getTime();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return 0;
}

function isAfterAutoDeliverCutoff(user, store) {
  const started = membershipStartedAtMs(user);
  if (!started) return false;
  return started >= autoDeliverCutoffMs(store);
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

function isEligibleForTrialWelcome(user, store, nowMs = Date.now()) {
  if (!user) return false;
  const email = String(user.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return false;
  if (welcomeFlags(user).trialWelcomeSentAt) return false;
  if (!membershipAccess.membershipUserInTrial(user, nowMs)) return false;
  if (!isAfterAutoDeliverCutoff(user, store)) return false;
  const status = String(user.accountStatus || "Active").trim().toLowerCase();
  if (status === "disabled" || status === "deleted" || status === "archived") return false;
  return true;
}

function isEligibleForTrialCheckin(user, store, nowMs = Date.now()) {
  if (!user) return false;
  const email = String(user.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return false;
  if (welcomeFlags(user).trialCheckinSentAt) return false;
  if (!membershipAccess.membershipUserInTrial(user, nowMs)) return false;
  if (!isAfterAutoDeliverCutoff(user, store)) return false;
  const trialStartMs = new Date(user.trialStart || 0).getTime();
  if (!Number.isFinite(trialStartMs) || trialStartMs <= 0) return false;
  const delayDays = Number(store?.onboardingWelcome?.sequences?.[TRIAL_CHECKIN_SEQUENCE_ID]?.delayDays || 3);
  const dueAt = trialStartMs + Math.max(1, delayDays) * 86400000;
  if (nowMs < dueAt) return false;
  const status = String(user.accountStatus || "Active").trim().toLowerCase();
  if (status === "disabled" || status === "deleted" || status === "archived") return false;
  return true;
}

function isEligibleForProWelcome(user, store, nowMs = Date.now()) {
  if (!user) return false;
  const email = String(user.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return false;
  if (welcomeFlags(user).proWelcomeSentAt) return false;
  if (membershipAccess.membershipUserInTrial(user, nowMs)) return false;
  if (!membershipAccess.membershipHasProAccess(user, nowMs)) return false;
  if (!isAfterAutoDeliverCutoff(user, store)) return false;
  const status = String(user.accountStatus || "Active").trim().toLowerCase();
  if (status === "disabled" || status === "deleted" || status === "archived") return false;
  return true;
}

function buildTemplateContext(user, store, deps, sequenceId = SEQUENCE_ID) {
  const siteUrl = siteBase(deps.SITE_URL);
  // Founding acquisition is closed — never inject Founding offer copy into welcome messages.
  const foundingOpen = false;
  const root = ensureOnboardingWelcome(store);
  const sequence = root.sequences[sequenceId] || root.sequences[SEQUENCE_ID];
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
  const primaryLabel = escape(sequence.email?.primaryCtaLabel || "Open Little Learner Hub");
  const secondaryLabel = escape(sequence.email?.secondaryCtaLabel || "Send a Message");
  const footerNote = escape(applyTemplateVariables(sequence.email?.footerNote || "", context));
  const safeSubject = escape(subject || "Welcome to Little Learner Hub");

  const foundingHtml = founding.html && !String(bodyText || "").includes("{{FoundingSection}}")
    ? founding.html
    : "";

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

function buildWelcomePreview(user, store, deps, channel = "email", sequenceId = SEQUENCE_ID) {
  const context = buildTemplateContext(user, store, deps, sequenceId);
  const sequence = context.sequence;
  if (channel === "in_app") {
    const title = applyTemplateVariables(sequence.inApp?.title || "", context);
    const body = applyTemplateVariables(sequence.inApp?.body || "", context);
    return { channel, title, body, text: body, html: "", context, foundingOpen: context.foundingOpen, sequenceId };
  }
  const subject = applyTemplateVariables(sequence.email?.subject || "", context);
  const bodyTemplate = sequence.email?.body || "";
  const textBody = applyTemplateVariables(
    bodyTemplate.includes("{{FoundingSection}}")
      ? bodyTemplate.replace(/\{\{\s*FoundingSection\s*\}\}/gi, buildFoundingEmailSection(sequence, context.foundingOpen).text)
      : `${bodyTemplate}${context.foundingOpen && sequence.foundingSection?.enabled !== false ? `\n\n${buildFoundingEmailSection(sequence, context.foundingOpen).text}` : ""}`,
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
  return { channel, subject, title: subject, body: textBody, text: textBody, html, context, foundingOpen: context.foundingOpen, sequenceId };
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
    contentRevision: CONTENT_REVISION,
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
      enabled: input.foundingSection?.enabled === true,
      inAppText: clampText(input.foundingSection?.inAppText, 4000) || defaults.foundingSection.inAppText,
      emailHtml: clampText(input.foundingSection?.emailHtml, 8000) || defaults.foundingSection.emailHtml,
      emailText: clampText(input.foundingSection?.emailText, 4000) || defaults.foundingSection.emailText,
    },
    scheduledSteps,
    updatedAt: new Date().toISOString(),
  };
}

function stampFieldForSequence(sequenceId) {
  if (sequenceId === TRIAL_SEQUENCE_ID) return "trialWelcomeSentAt";
  if (sequenceId === TRIAL_CHECKIN_SEQUENCE_ID) return "trialCheckinSentAt";
  if (sequenceId === PRO_SEQUENCE_ID) return "proWelcomeSentAt";
  return "freeWelcomeSentAt";
}

function createOnboardingWelcome(deps) {
  const {
    readStore,
    writeStore,
    writableStore,
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
      sequences: root.sequences,
      autoDeliverEligibleAfter: root.autoDeliverEligibleAfter || AUTO_DELIVER_ELIGIBLE_AFTER,
      variables: TEMPLATE_VARIABLES,
      backfill: root.backfill,
      updatedAt: root.updatedAt || root.sequences[SEQUENCE_ID]?.updatedAt || "",
    };
  }

  async function deliverInAppWelcome(store, email, user, preview, sequenceId) {
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
      onboardingSequenceId: sequenceId,
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
      title: preview.title || "Welcome to Little Learner Hub",
      preview: messagePreviewText(preview.body),
      messageId: message.id,
      conversationEmail: email,
      refId: `onboarding:${sequenceId}:${email}`,
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

  async function deliverSequenceWelcome(email, sequenceId, options = {}) {
    const clean = String(email || "").trim().toLowerCase();
    if (!clean) return { ok: false, reason: "missing_email" };

    // Use the live mutable store so in-app messages + stamps persist together on local-json.
    const store = ensureMessagingStore(writableStoreCompatible());
    const user = store.users?.[clean] || { email: clean };
    const stampKey = stampFieldForSequence(sequenceId);
    const flags = welcomeFlags(user);

    const eligibility = {
      [SEQUENCE_ID]: () => isEligibleForFreeWelcome(user),
      [TRIAL_SEQUENCE_ID]: () => isEligibleForTrialWelcome(user, store),
      [TRIAL_CHECKIN_SEQUENCE_ID]: () => isEligibleForTrialCheckin(user, store),
      [PRO_SEQUENCE_ID]: () => isEligibleForProWelcome(user, store),
    };
    if (!options.force && typeof eligibility[sequenceId] === "function" && !eligibility[sequenceId]()) {
      return { ok: false, reason: "not_eligible", email: clean, sequenceId };
    }
    if (flags[stampKey] && !options.force) {
      return { ok: false, reason: "already_sent", email: clean, sequenceId };
    }

    const config = getConfig(store);
    const sequence = config.sequences[sequenceId];
    if (!sequence?.enabled && !options.force) {
      return { ok: false, reason: "sequence_disabled", email: clean, sequenceId };
    }

    const previewInApp = buildWelcomePreview(user, store, { SITE_URL, foundingSpotsRemaining, htmlEscape }, "in_app", sequenceId);
    const previewEmail = buildWelcomePreview(user, store, { SITE_URL, foundingSpotsRemaining, htmlEscape }, "email", sequenceId);

    const result = {
      ok: true,
      email: clean,
      sequenceId,
      inApp: { attempted: false, sent: false, skipped: false, reason: "" },
      emailDelivery: { attempted: false, sent: false, skipped: false, reason: "" },
    };

    if (sequence.inApp?.enabled !== false || options.forceInApp) {
      result.inApp.attempted = true;
      const inApp = await deliverInAppWelcome(store, clean, user, previewInApp, sequenceId);
      result.inApp.sent = Boolean(inApp.sent);
      result.inApp.messageId = inApp.messageId || "";
      result.inApp.reason = inApp.sent ? "sent" : "failed";
    } else {
      result.inApp.skipped = true;
      result.inApp.reason = "disabled";
    }

    if (sequence.email?.enabled !== false || options.forceEmail) {
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

    const nextFlags = {
      ...flags,
      [stampKey]: new Date().toISOString(),
      inAppMessageId: result.inApp.messageId || flags.inAppMessageId || "",
      emailSentAt: result.emailDelivery.sent ? new Date().toISOString() : (flags.emailSentAt || ""),
      reason: options.reason || sequenceId,
    };
    // Stamp on the same store object that holds the welcome message, then persist once.
    store.users = store.users || {};
    store.users[clean] = {
      ...(store.users[clean] || { email: clean }),
      email: clean,
      onboardingWelcome: nextFlags,
      updatedAt: new Date().toISOString(),
    };
    writeStore(store);
    return result;
  }

  function writableStoreCompatible() {
    // Prefer the host app's mutable store helper when provided; fall back to readStore.
    if (typeof writableStore === "function") return writableStore();
    return ensureMessagingStore(readStore());
  }

  async function deliverFreeWelcome(email, options = {}) {
    return deliverSequenceWelcome(email, SEQUENCE_ID, options);
  }

  async function maybeDeliverOnSignup(email) {
    const store = readStore();
    const user = store.users?.[String(email || "").trim().toLowerCase()] || { email };
    if (!isEligibleForFreeWelcome(user)) {
      return { ok: false, reason: "not_eligible" };
    }
    return deliverFreeWelcome(email, { reason: "signup" });
  }

  async function maybeDeliverOnTrialStart(email) {
    const store = readStore();
    const user = store.users?.[String(email || "").trim().toLowerCase()] || { email };
    if (!isEligibleForTrialWelcome(user, store)) {
      return { ok: false, reason: "not_eligible" };
    }
    return deliverSequenceWelcome(email, TRIAL_SEQUENCE_ID, { reason: "trial_start" });
  }

  async function maybeDeliverOnProPurchase(email) {
    const store = readStore();
    const user = store.users?.[String(email || "").trim().toLowerCase()] || { email };
    if (!isEligibleForProWelcome(user, store)) {
      return { ok: false, reason: "not_eligible" };
    }
    return deliverSequenceWelcome(email, PRO_SEQUENCE_ID, { reason: "pro_purchase" });
  }

  async function processTrialCheckIns({ limit = 25 } = {}) {
    const store = readStore();
    ensureOnboardingWelcome(store);
    const recipients = Object.values(store.users || {})
      .filter((user) => isEligibleForTrialCheckin(user, store))
      .slice(0, Math.max(1, Math.min(limit, 100)));
    const results = [];
    for (const user of recipients) {
      // eslint-disable-next-line no-await-in-loop
      const result = await deliverSequenceWelcome(user.email, TRIAL_CHECKIN_SEQUENCE_ID, {
        reason: "trial_checkin",
      });
      results.push({ email: user.email, result });
    }
    return { count: results.length, results };
  }

  function listRecentFreeSignupsWithoutWelcome(store, limit = 5) {
    const users = Object.values(store.users || {});
    return users
      .filter((user) => isEligibleForFreeWelcome(user) && (user.signupAt || user.createdAt || user.updatedAt))
      .sort((a, b) => {
        const left = new Date(b.signupAt || b.createdAt || b.updatedAt || 0).getTime();
        const right = new Date(a.signupAt || a.createdAt || a.updatedAt || 0).getTime();
        return left - right;
      })
      .slice(0, Math.max(1, Math.min(limit, 25)))
      .map((user) => ({
        email: String(user.email || "").trim().toLowerCase(),
        firstName: user.firstName || "",
        signupAt: user.signupAt || user.createdAt || user.updatedAt || "",
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

  function startTrialCheckinScheduler() {
    const tick = () => {
      processTrialCheckIns({ limit: 40 }).catch((error) => {
        console.warn("[onboarding-welcome] trial check-in sweep failed:", error.message || error);
      });
    };
    // First run after boot settles; then hourly. Only eligible NEW trials are considered.
    setTimeout(tick, 90 * 1000);
    return setInterval(tick, 60 * 60 * 1000);
  }

  return {
    SEQUENCE_ID,
    TRIAL_SEQUENCE_ID,
    TRIAL_CHECKIN_SEQUENCE_ID,
    PRO_SEQUENCE_ID,
    BACKFILL_CONFIRM_PHRASE,
    AUTO_DELIVER_ELIGIBLE_AFTER,
    CONTENT_REVISION,
    TEMPLATE_VARIABLES,
    defaultOnboardingWelcomeStore,
    ensureOnboardingWelcome,
    isEligibleForFreeWelcome,
    isEligibleForTrialWelcome,
    isEligibleForTrialCheckin,
    isEligibleForProWelcome,
    welcomeFlags,
    buildTemplateContext,
    applyTemplateVariables,
    buildWelcomePreview,
    normalizeSequencePayload,
    getConfig,
    deliverFreeWelcome,
    deliverSequenceWelcome,
    maybeDeliverOnSignup,
    maybeDeliverOnTrialStart,
    maybeDeliverOnProPurchase,
    processTrialCheckIns,
    listRecentFreeSignupsWithoutWelcome,
    backfillRecentFreeMembers,
    saveConfig,
    startTrialCheckinScheduler,
  };
}

module.exports = {
  SEQUENCE_ID,
  TRIAL_SEQUENCE_ID,
  TRIAL_CHECKIN_SEQUENCE_ID,
  PRO_SEQUENCE_ID,
  BACKFILL_CONFIRM_PHRASE,
  AUTO_DELIVER_ELIGIBLE_AFTER,
  CONTENT_REVISION,
  TEMPLATE_VARIABLES,
  defaultOnboardingWelcomeStore,
  defaultFreeWelcomeSequence,
  defaultTrialWelcomeSequence,
  defaultTrialCheckinSequence,
  defaultProWelcomeSequence,
  ensureOnboardingWelcome,
  isEligibleForFreeWelcome,
  isEligibleForTrialWelcome,
  isEligibleForTrialCheckin,
  isEligibleForProWelcome,
  welcomeFlags,
  buildTemplateContext,
  applyTemplateVariables,
  buildWelcomePreview,
  normalizeSequencePayload,
  createOnboardingWelcome,
};
