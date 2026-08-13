/**
 * Configurable onboarding welcome system for Free, Trial, and Pro members.
 * Delivers in-app system messages + branded welcome email once per sequence.
 *
 * Auto-delivery for Trial/Pro sequences only applies to accounts that start
 * trial/paid membership after AUTO_DELIVER_ELIGIBLE_AFTER (existing Pros/trials
 * — including the most recent Pro joiners — are never backfilled).
 */

const membershipAccess = require("../scripts/membership-access.js");
const { isKnownBouncedEmail } = require("./free-user-welcome-email.js");

const SEQUENCE_ID = "free-welcome";
const TRIAL_SEQUENCE_ID = "trial-welcome";
const TRIAL_CHECKIN_SEQUENCE_ID = "trial-checkin";
const PRO_SEQUENCE_ID = "pro-welcome";
const BACKFILL_CONFIRM_PHRASE = "SEND_FREE_WELCOME_BACKFILL";
/** Only memberships started on/after this UTC time auto-receive Trial/Pro welcomes. */
const AUTO_DELIVER_ELIGIBLE_AFTER = "2026-08-01T02:30:00.000Z";
const CONTENT_REVISION = "20260812-teaching-kits-welcome-v1";

const TEMPLATE_VARIABLES = Object.freeze([
  { key: "FirstName", description: "User's first name (falls back to there)" },
  { key: "PlanName", description: "Current plan label (e.g. Free)" },
  { key: "FoundingSection", description: "Legacy template slot (always empty — Founding acquisition closed)" },
  { key: "SiteUrl", description: "Site home URL" },
  { key: "LessonsUrl", description: "Lesson library URL" },
  { key: "UpgradeUrl", description: "Plans / upgrade URL" },
  { key: "MessagesUrl", description: "In-app messages URL" },
  { key: "PrimaryCta", description: "Primary CTA button (email HTML only; omitted in plain text / in-app)" },
]);

const DEFAULT_FOUNDING_SECTION_TEXT = "";

const FREE_WELCOME_SUBJECT = "Welcome to Little Learner Hub 💛 Here’s where to start";

const FREE_WELCOME_BODY = [
  "Hi!",
  "",
  "Welcome to Little Learner Hub! 💛 I’m Leah, the creator behind LLH, and I’m so glad you’re here.",
  "",
  "I built Little Learner Hub because childcare teachers already have enough on their plates. Planning activities, finding printables, documenting learning, communicating with families, and keeping everything organized shouldn’t mean spending hours searching Pinterest or taking work home.",
  "",
  "So, where should you start?",
  "",
  "Start with the lesson plans. Pick an age group and find a theme your children will actually enjoy.",
  "",
  "We’re also upgrading lesson plans into full Teaching Kits that can include ready-to-use activities, classroom visuals, printables, materials lists, teacher guidance, and more—all organized together.",
  "",
  "And Little Learner Hub goes beyond curriculum.",
  "",
  "With the full platform, we're building tools to help with the everyday work of running a classroom or childcare program—from planning and child documentation to family communication and other time-consuming teacher tasks.",
  "",
  "Your free account gives you a chance to explore Little Learner Hub and see how it fits into your day. If you find yourself wanting access to more of the plans, resources, and tools, you can upgrade whenever you're ready.",
  "",
  "One more thing: I actually want your feedback.",
  "",
  "Reply to this email and tell me the ONE thing that takes up too much of your time as a childcare teacher or provider.",
  "",
  "Lesson planning? Documentation? Finding activities? Parent communication? Something completely different?",
  "",
  "Your answers help me decide what Little Learner Hub needs next. 💛",
  "",
  "Welcome to LLH!",
  "",
  "Leah",
  "Little Learner Hub",
].join("\n");

/** Email body inserts {{PrimaryCta}} after the lesson-plans start tip; in-app omits the marker. */
const FREE_WELCOME_EMAIL_BODY = FREE_WELCOME_BODY.replace(
  "Start with the lesson plans. Pick an age group and find a theme your children will actually enjoy.",
  [
    "Start with the lesson plans. Pick an age group and find a theme your children will actually enjoy.",
    "",
    "{{PrimaryCta}}",
  ].join("\n"),
);

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

const PRO_WELCOME_SUBJECT = "You’re officially a Little Learner Hub member 💛";

const PRO_WELCOME_BODY = [
  "Hi!",
  "",
  "I wanted to personally say thank you for becoming a Little Learner Hub member. 💛",
  "",
  "Seriously, it means more to me than just seeing another subscription come through.",
  "",
  "Little Learner Hub is something I’m actively building and improving for real childcare teachers, providers, and directors. Every person who chooses to support it is helping me continue making the lesson plans, Teaching Kits, printables, visuals, and tools better.",
  "",
  "But I also want you to know something from the beginning:",
  "",
  "You can reach out to me.",
  "",
  "If you're confused about something, can't find what you need, have an idea for a lesson plan or printable, run into a problem, or just think, “I really wish Little Learner Hub had this…” — reply to this email and tell me.",
  "",
  "I read the replies, and I will respond.",
  "",
  "I don't want Little Learner Hub to feel like one of those platforms where you pay every month and have no idea who is behind it. I want you to feel like you have someone you can actually reach when you need help.",
  "",
  "As a member, you'll also continue seeing Little Learner Hub grow. I'm currently working through our lesson-plan library and upgrading plans into full Teaching Kits with more printables, visuals, teacher guidance, and ready-to-use resources, while also adding new lesson plans and improving the rest of the platform.",
  "",
  "And because you're one of the people actually using LLH, your feedback matters when I'm deciding what to build next.",
  "",
  "So here's the first thing I'd love to know:",
  "",
  "What would make Little Learner Hub more useful in your classroom or childcare program?",
  "",
  "Just hit reply and tell me. It doesn't need to be formal. Even if it's one sentence, I want to hear it.",
  "",
  "Thank you for trusting Little Learner Hub to be part of your classroom. I'm really glad you're here. 💛",
  "",
  "Leah",
  "Creator, Little Learner Hub",
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
      title: FREE_WELCOME_SUBJECT,
      body: FREE_WELCOME_BODY,
    },
    email: {
      enabled: true,
      subject: FREE_WELCOME_SUBJECT,
      body: FREE_WELCOME_EMAIL_BODY,
      primaryCtaLabel: "Explore Lesson Plans",
      primaryCtaUrl: "{{LessonsUrl}}",
      secondaryCtaLabel: "",
      secondaryCtaUrl: "",
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
    label: "Paid Member Welcome",
    audience: "pro",
    contentRevision: CONTENT_REVISION,
    enabled: true,
    inApp: {
      enabled: true,
      title: PRO_WELCOME_SUBJECT,
      body: PRO_WELCOME_BODY,
    },
    email: {
      enabled: true,
      subject: PRO_WELCOME_SUBJECT,
      body: PRO_WELCOME_BODY,
      primaryCtaLabel: "Explore Lesson Plans",
      primaryCtaUrl: "{{LessonsUrl}}",
      secondaryCtaLabel: "",
      secondaryCtaUrl: "",
      footerNote: "Questions? Reply to this email — Leah reads every reply.",
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

  // Canonical Free access only (membershipCurrentAccessKey) — never UI labels.
  // If paid membership is already authoritative, free welcome must not send
  // (covers the race where checkout completes before the async signup welcome runs).
  if (membershipAccess.membershipCurrentAccessKey(user, nowMs) !== "free") return false;

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
  const primaryCtaPattern = /\{\{\s*PrimaryCta\s*\}\}/i;
  const hasInlinePrimaryCta = primaryCtaPattern.test(bodyWithFounding);
  // Keep {{PrimaryCta}} through applyTemplateVariables, then split for mid-body placement.
  const resolvedBody = applyTemplateVariables(
    bodyWithFounding.replace(primaryCtaPattern, "{{PrimaryCta}}"),
    context,
  );
  const primaryUrl = applyTemplateVariables(sequence.email?.primaryCtaUrl || "{{LessonsUrl}}", context);
  const secondaryUrl = applyTemplateVariables(sequence.email?.secondaryCtaUrl || "{{UpgradeUrl}}", context);
  const primaryLabelRaw = String(sequence.email?.primaryCtaLabel || "Open Little Learner Hub").trim();
  const secondaryLabelRaw = String(sequence.email?.secondaryCtaLabel || "").trim();
  const primaryLabel = escape(primaryLabelRaw || "Open Little Learner Hub");
  const secondaryLabel = escape(secondaryLabelRaw);
  const footerNote = escape(applyTemplateVariables(sequence.email?.footerNote || "", context));
  const safeSubject = escape(subject || "Welcome to Little Learner Hub");

  const foundingHtml = founding.html && !String(bodyText || "").includes("{{FoundingSection}}")
    ? founding.html
    : "";

  const primaryButtonHtml = primaryLabelRaw
    ? `<div style="text-align:center;margin:24px 0 12px;">
        <a href="${escape(primaryUrl)}" style="display:inline-block;background:#2f6f5e;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;">${primaryLabel}</a>
      </div>`
    : "";

  let bodyHtml = "";
  if (hasInlinePrimaryCta && primaryCtaPattern.test(resolvedBody)) {
    const [beforeCta, ...afterParts] = resolvedBody.split(primaryCtaPattern);
    bodyHtml = paragraphsToHtml(beforeCta, escape)
      + primaryButtonHtml
      + paragraphsToHtml(afterParts.join(""), escape)
      + (foundingHtml || "");
  } else {
    bodyHtml = paragraphsToHtml(resolvedBody, escape) + (foundingHtml || "");
  }

  const showBottomPrimary = Boolean(primaryLabelRaw) && !hasInlinePrimaryCta;
  const showBottomSecondary = Boolean(secondaryLabelRaw);
  const bottomCtaHtml = (showBottomPrimary || showBottomSecondary)
    ? `<div style="text-align:center;margin:28px 0 12px;">
        ${showBottomPrimary
          ? `<a href="${escape(primaryUrl)}" style="display:inline-block;background:#2f6f5e;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;margin:0 8px 12px;">${primaryLabel}</a>`
          : ""}
        ${showBottomSecondary
          ? `<a href="${escape(secondaryUrl)}" style="display:inline-block;background:#ffffff;color:#2f6f5e;text-decoration:none;padding:13px 20px;border-radius:10px;font-family:Helvetica,Arial,sans-serif;font-size:15px;border:2px solid #2f6f5e;margin:0 8px 12px;">${secondaryLabel}</a>`
          : ""}
      </div>`
    : "";

  return `
    <div style="font-family:Georgia,'Times New Roman',serif;max-width:640px;margin:0 auto;padding:24px 20px;color:#1f2937;line-height:1.6;background:#ffffff;">
      <div style="text-align:center;margin:0 0 24px;">
        <img src="${escape(logoUrl)}" alt="Little Learner Hub" width="72" height="72" style="display:inline-block;border-radius:16px;" />
        <p style="margin:12px 0 0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#8a7048;">Little Learner Hub</p>
      </div>
      <h1 style="font-size:26px;margin:0 0 20px;color:#111827;text-align:center;">${safeSubject}</h1>
      ${bodyHtml}
      ${bottomCtaHtml}
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
  const primaryCtaText = String(sequence.email?.primaryCtaLabel || "Explore Lesson Plans").trim()
    ? `\n\n${String(sequence.email?.primaryCtaLabel || "Explore Lesson Plans").trim()}: ${context.LessonsUrl}\n\n`
    : "\n\n";
  const textBody = applyTemplateVariables(
    (bodyTemplate.includes("{{FoundingSection}}")
      ? bodyTemplate.replace(/\{\{\s*FoundingSection\s*\}\}/gi, buildFoundingEmailSection(sequence, context.foundingOpen).text)
      : `${bodyTemplate}${context.foundingOpen && sequence.foundingSection?.enabled !== false ? `\n\n${buildFoundingEmailSection(sequence, context.foundingOpen).text}` : ""}`)
      .replace(/\{\{\s*PrimaryCta\s*\}\}/gi, primaryCtaText),
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

  async function deliverEmailWelcome(email, user, preview, {
    eventType = "free_welcome",
    idempotencyKey = "",
    store = null,
  } = {}) {
    // Hard-bounce / known-undeliverable: never call the provider again.
    // Marketing unsubscribe is intentionally NOT checked — these are transactional
    // account/onboarding welcomes, not marketing broadcasts.
    if (store && typeof isKnownBouncedEmail === "function" && isKnownBouncedEmail(store, email)) {
      return {
        sent: false,
        configured: true,
        provider: "suppressed",
        messageId: "",
        skipped: true,
        reason: "known_bounced",
        error: "known_bounced",
      };
    }
    let emailResult = { sent: false, configured: false, provider: "not configured", messageId: "" };
    try {
      emailResult = await sendEmail({
        to: email,
        replyTo: SUPPORT_EMAIL_TO,
        subject: preview.subject,
        text: preview.text,
        html: preview.html,
        eventType,
        idempotencyKey,
      });
    } catch (err) {
      emailResult = {
        sent: false,
        configured: true,
        provider: "error",
        error: err?.message || String(err),
        messageId: "",
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
    const isFreeWelcome = sequenceId === SEQUENCE_ID;

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

    const alreadyHasInApp = Boolean(flags.inAppMessageId)
      || (Array.isArray(store.messages) && store.messages.some(
        (m) => m
          && String(m.toEmail || "").toLowerCase() === clean
          && m.channel === "onboarding_welcome"
          && String(m.onboardingSequenceId || SEQUENCE_ID) === sequenceId,
      ));

    if (sequence.inApp?.enabled !== false || options.forceInApp) {
      if (alreadyHasInApp && !options.force) {
        result.inApp.skipped = true;
        result.inApp.reason = "already_sent";
        result.inApp.messageId = flags.inAppMessageId || "";
      } else {
        result.inApp.attempted = true;
        const inApp = await deliverInAppWelcome(store, clean, user, previewInApp, sequenceId);
        result.inApp.sent = Boolean(inApp.sent);
        result.inApp.messageId = inApp.messageId || "";
        result.inApp.reason = inApp.sent ? "sent" : "failed";
      }
    } else {
      result.inApp.skipped = true;
      result.inApp.reason = "disabled";
    }

    if (sequence.email?.enabled !== false || options.forceEmail) {
      // Fresh authoritative re-check immediately before provider send. If checkout
      // completed during in-app delivery, free welcome must not also email.
      const liveStore = typeof readStore === "function" ? readStore() : store;
      const liveUser = liveStore?.users?.[clean] || store.users?.[clean] || user;
      if (!options.force && isFreeWelcome && !isEligibleForFreeWelcome(liveUser)) {
        result.emailDelivery.attempted = false;
        result.emailDelivery.skipped = true;
        result.emailDelivery.reason = "skipped_not_free";
      } else {
        const emailEventType = isFreeWelcome
          ? "free_welcome"
          : sequenceId === TRIAL_SEQUENCE_ID
            ? "trial_welcome"
            : sequenceId === PRO_SEQUENCE_ID
              ? "pro_welcome"
              : sequenceId === TRIAL_CHECKIN_SEQUENCE_ID
                ? "trial_checkin"
                : `onboarding_${sequenceId}`;
        const emailResult = await deliverEmailWelcome(clean, liveUser, previewEmail, {
          eventType: emailEventType,
          idempotencyKey: `${emailEventType}:${clean}`,
          store: liveStore || store,
        });
        if (emailResult.skipped && emailResult.reason === "known_bounced") {
          result.emailDelivery.attempted = false;
          result.emailDelivery.skipped = true;
          result.emailDelivery.sent = false;
          result.emailDelivery.configured = true;
          result.emailDelivery.reason = "known_bounced";
          result.emailDelivery.provider = "suppressed";
          result.emailDelivery.error = "known_bounced";
        } else {
          result.emailDelivery.attempted = true;
          result.emailDelivery.sent = Boolean(emailResult.sent);
          result.emailDelivery.configured = Boolean(emailResult.configured);
          result.emailDelivery.messageId = emailResult.messageId || "";
          result.emailDelivery.reason = emailResult.sent
            ? "sent"
            : (emailResult.configured ? "send_failed" : "unconfigured");
          result.emailDelivery.provider = emailResult.provider || "";
          result.emailDelivery.error = emailResult.error || "";
        }
      }
    } else {
      result.emailDelivery.skipped = true;
      result.emailDelivery.reason = "disabled";
    }

    const nowIso = new Date().toISOString();
    const nextFlags = {
      ...flags,
      inAppMessageId: result.inApp.messageId || flags.inAppMessageId || "",
      reason: options.reason || sequenceId,
    };

    // Free welcome: if Resend is configured and the send fails, do NOT stamp so a later
    // retry can deliver exactly one email. If email is unconfigured/disabled, stamp after
    // in-app delivery so local/dev does not loop forever.
    // Known hard-bounce skips are terminal (stamp without emailSentAt) so signup retries
    // do not loop provider attempts forever.
    if (isFreeWelcome) {
      const emailSendFailed = result.emailDelivery.attempted
        && !result.emailDelivery.sent
        && result.emailDelivery.reason === "send_failed";
      const knownBounced = result.emailDelivery.reason === "known_bounced";
      const skippedNotFree = result.emailDelivery.reason === "skipped_not_free";
      if (result.emailDelivery.sent) {
        nextFlags[stampKey] = nowIso;
        nextFlags.emailSentAt = nowIso;
        nextFlags.emailMessageId = result.emailDelivery.messageId || "";
        nextFlags.lastError = "";
      } else if (knownBounced) {
        nextFlags[stampKey] = nowIso;
        nextFlags.lastError = "known_bounced";
      } else if (skippedNotFree) {
        // Paid became authoritative before free email — do not stamp free welcome as sent
        // and do not set emailSentAt. Paid welcome path owns onboarding email.
        nextFlags.lastAttemptAt = nowIso;
        nextFlags.lastError = "skipped_not_free";
      } else if (emailSendFailed) {
        nextFlags.lastAttemptAt = nowIso;
        nextFlags.lastError = result.emailDelivery.error || "send_failed";
      } else if (result.inApp.sent || result.inApp.reason === "already_sent" || alreadyHasInApp) {
        nextFlags[stampKey] = nowIso;
        nextFlags.lastError = result.emailDelivery.reason || "";
      } else {
        nextFlags.lastAttemptAt = nowIso;
        nextFlags.lastError = result.emailDelivery.error
          || result.emailDelivery.reason
          || result.inApp.reason
          || "send_failed";
      }
    } else {
      nextFlags[stampKey] = nowIso;
      nextFlags.emailSentAt = result.emailDelivery.sent ? nowIso : (flags.emailSentAt || "");
      if (result.emailDelivery.messageId) nextFlags.emailMessageId = result.emailDelivery.messageId;
      if (result.emailDelivery.reason === "known_bounced") {
        nextFlags.lastError = "known_bounced";
      }
    }

    // Stamp on the same store object that holds the welcome message, then persist once.
    store.users = store.users || {};
    store.users[clean] = {
      ...(store.users[clean] || { email: clean }),
      email: clean,
      onboardingWelcome: nextFlags,
      updatedAt: nowIso,
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
