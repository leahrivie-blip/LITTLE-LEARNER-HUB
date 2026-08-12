/**
 * Email & User Engagement System
 * - Onboarding drip (welcome → tips → explore), once-only per user
 * - Weekly Monday "What's New" curriculum digest (skip if empty)
 * - One-time all-users welcome/update email (manual, audit-gated, never scheduled)
 * - Analytics events + admin controls
 *
 * Reuses the shared sendEmail() helper. Soft-fails when email is not configured.
 * Does not send Firebase auth emails (verification / password reset).
 */

const crypto = require("crypto");
const membershipAccess = require("../scripts/membership-access.js");

const FREE_REENGAGEMENT_CAMPAIGN_ID = "free-reengagement-2026-07";
const FREE_REENGAGEMENT_SUBJECT = "🎉 Little Learner Hub Has Been Updated!";

const ONBOARDING_STEPS = [
  {
    key: "welcome",
    flag: "welcomeSentAt",
    delayDays: 0,
    subject: "Welcome to Little Learner Hub",
  },
  {
    key: "tips",
    flag: "tipsSentAt",
    delayDays: 2,
    subject: "Quick favor: what should we improve?",
  },
  {
    key: "explore",
    flag: "exploreSentAt",
    delayDays: 5,
    subject: "What’s coming next in Little Learner Hub",
  },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 2000;

function defaultOneTimeWelcomeUpdate() {
  return {
    sentAt: "",
    sentCount: 0,
    failedCount: 0,
    recipientCount: 0,
    lastAuditAt: "",
    lastAuditPassed: false,
    lastAuditToken: "",
    preparedAt: "",
    preparedRecipientCount: 0,
    preparedSubject: "",
  };
}

function defaultEmailEngagementStore() {
  return {
    settings: {
      // Default OFF — no drip / weekly mail until explicitly enabled after content approval.
      onboardingEnabled: false,
      weeklyWhatsNewEnabled: false,
      lastWeeklyRunAt: "",
      lastWeeklySkippedAt: "",
      lastWeeklySkipReason: "",
      lastWeeklySentCount: 0,
      lastOnboardingSweepAt: "",
      automationsPausedAt: "",
      automationsPausedReason: "",
      oneTimeWelcomeUpdate: defaultOneTimeWelcomeUpdate(),
    },
    events: [],
    campaigns: {},
  };
}

function ensureEmailEngagement(store) {
  if (!store.emailEngagement || typeof store.emailEngagement !== "object") {
    store.emailEngagement = defaultEmailEngagementStore();
  }
  const eng = store.emailEngagement;
  eng.settings = { ...defaultEmailEngagementStore().settings, ...(eng.settings || {}) };
  eng.settings.oneTimeWelcomeUpdate = {
    ...defaultOneTimeWelcomeUpdate(),
    ...(eng.settings.oneTimeWelcomeUpdate || {}),
  };
  eng.events = Array.isArray(eng.events) ? eng.events : [];
  eng.campaigns = eng.campaigns && typeof eng.campaigns === "object" ? eng.campaigns : {};
  return eng;
}

function isStagingOrTestDatabase({ provider, connectionString, nodeEnv, allowLocalForTests }) {
  const providerKey = String(provider || "").trim().toLowerCase();
  const url = String(connectionString || "").trim().toLowerCase();
  const env = String(nodeEnv || "").trim().toLowerCase();
  const stagingHints = ["staging", "stage-", "-stage", "test", "sandbox", "localhost", "127.0.0.1"];
  const urlLooksStaging = stagingHints.some((hint) => url.includes(hint));
  const isLocalJson = !providerKey || providerKey === "local-json";
  if (isLocalJson) {
    // Local JSON is never production. Tests may still run the audit path.
    return { isStagingOrTest: !(allowLocalForTests && env === "test"), isLocalJson: true, urlLooksStaging };
  }
  if (urlLooksStaging) {
    return { isStagingOrTest: true, isLocalJson: false, urlLooksStaging: true };
  }
  return { isStagingOrTest: false, isLocalJson: false, urlLooksStaging: false };
}

function isActiveAccount(user) {
  const status = String(user?.accountStatus || "Active").trim().toLowerCase();
  return status !== "disabled" && status !== "deleted" && status !== "archived";
}

function isNewInboxStatus(status) {
  // Match /api/admin/inbox (comms-api isNewSubmissionStatus).
  const value = String(status || "New").trim().toLowerCase();
  return !value || value === "new" || value === "open";
}

/**
 * Rebuilds admin-inbox counts from the authoritative store collections so the
 * dashboard can be checked for parity (same rules as /api/admin/inbox).
 */
function countAdminInboxFromStore(store, adminEmail) {
  const admin = String(adminEmail || "").trim().toLowerCase();
  let support = 0;
  let feature = 0;
  let bug = 0;
  let feedback = 0;
  let message = 0;

  (store.supportTickets || []).forEach((ticket) => {
    if (isNewInboxStatus(ticket.status)) support += 1;
  });
  (store.featureRequests || []).forEach((item) => {
    if (isNewInboxStatus(item.status)) feature += 1;
  });
  (store.bugReports || []).forEach((item) => {
    if (isNewInboxStatus(item.status)) bug += 1;
  });
  (store.feedbackItems || []).forEach((item) => {
    if (isNewInboxStatus(item.status)) feedback += 1;
  });

  const unreadConversations = new Set();
  (store.notifications || []).forEach((n) => {
    if (!admin) return;
    if (String(n.email || "").trim().toLowerCase() !== admin) return;
    if (n.type !== "message" || n.read) return;
    const conversationEmail = String(n.conversationEmail || "").trim().toLowerCase();
    if (conversationEmail) unreadConversations.add(conversationEmail);
  });
  message = unreadConversations.size;

  return {
    support,
    feature,
    bug,
    feedback,
    message,
    total: support + feature + bug + feedback + message,
  };
}

function makeAuditToken() {
  return crypto.randomBytes(16).toString("hex");
}

function siteBase(siteUrl) {
  return String(siteUrl || "").replace(/\/$/, "") || "https://littlelearnershubbyleah.com";
}

function weekKey(date = new Date()) {
  // ISO week key: YYYY-Www
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / MS_PER_DAY) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function isMonday(date = new Date()) {
  return date.getDay() === 1;
}

function daysSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / MS_PER_DAY;
}

function userDisplayName(user) {
  const name = String(user?.firstName || user?.name || user?.displayName || "").trim();
  if (name) return name.split(/\s+/)[0];
  return "there";
}

function emailPrefs(user) {
  const prefs = user?.emailPrefs && typeof user.emailPrefs === "object" ? user.emailPrefs : {};
  return {
    onboarding: prefs.onboarding !== false,
    weeklyWhatsNew: prefs.weeklyWhatsNew !== false,
    marketing: prefs.marketing !== false,
    unsubscribedAt: prefs.unsubscribedAt || "",
  };
}

function onboardingFlags(user) {
  const flags = user?.onboardingEmails && typeof user.onboardingEmails === "object"
    ? user.onboardingEmails
    : {};
  return {
    welcomeSentAt: flags.welcomeSentAt || "",
    tipsSentAt: flags.tipsSentAt || "",
    exploreSentAt: flags.exploreSentAt || "",
  };
}

function brandEmailShell({ htmlEscape, title, introHtml, bodyHtml, ctaLabel, ctaUrl, footerNote }) {
  const safeTitle = htmlEscape(title || "");
  const safeCta = htmlEscape(ctaLabel || "Open Little Learner Hub");
  const safeUrl = htmlEscape(ctaUrl || "#");
  const safeFooter = htmlEscape(footerNote || "You’re receiving this because you have a Little Learner Hub account.");
  return {
    html: `
      <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#2c2416;line-height:1.55">
        <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#8a7048;margin:0 0 8px">Little Learner Hub</p>
        <h1 style="font-size:24px;margin:0 0 16px;color:#1f180f">${safeTitle}</h1>
        ${introHtml || ""}
        ${bodyHtml || ""}
        <p style="margin:28px 0 12px">
          <a href="${safeUrl}" style="display:inline-block;background:#2f6f5e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-family:Helvetica,Arial,sans-serif;font-size:15px">${safeCta}</a>
        </p>
        <p style="font-size:12px;color:#7a6e5c;margin-top:28px">${safeFooter}</p>
      </div>
    `.trim(),
  };
}

function buildOnboardingContent(stepKey, user, { siteUrl, htmlEscape }) {
  const first = userDisplayName(user);
  const base = siteBase(siteUrl);
  const lessonsUrl = `${base}/#lessons`;
  const contactUrl = `${base}/#contact`;
  const homeUrl = `${base}/`;
  const greeting = `Hi ${htmlEscape(first)},`;

  if (stepKey === "welcome") {
    const shell = brandEmailShell({
      htmlEscape,
      title: "Welcome to Little Learner Hub",
      introHtml: `<p>${greeting}</p>
        <p>Little Learner Hub is built for daycare teachers and home providers who need classroom-ready curriculum without the Sunday-night scramble.</p>
        <p>Inside you’ll find play-based lesson plans for Infant, Toddler, and Preschool — with Week at a Glance, activities, materials, and print-ready weekly schedules.</p>`,
      bodyHtml: `
        <p>New lesson plans are added regularly, so the library keeps growing with you.</p>
        <p>As you explore, we’d love your feedback. If something feels confusing, missing, or especially helpful, tell us — your notes shape what we build next.</p>
      `,
      ctaLabel: "Open Little Learner Hub",
      ctaUrl: lessonsUrl,
      footerNote: "You’re receiving this welcome email once for your new account.",
    });
    const text = [
      `Hi ${first},`,
      "",
      "Welcome to Little Learner Hub.",
      "",
      "Little Learner Hub is built for daycare teachers and home providers who need classroom-ready curriculum without the Sunday-night scramble.",
      "Inside you’ll find play-based lesson plans for Infant, Toddler, and Preschool — with Week at a Glance, activities, materials, and print-ready weekly schedules.",
      "",
      "New lesson plans are added regularly, so the library keeps growing with you.",
      "",
      "As you explore, we’d love your feedback. If something feels confusing, missing, or especially helpful, tell us — your notes shape what we build next.",
      "",
      `Open the library: ${lessonsUrl}`,
      `Share feedback anytime: ${contactUrl}`,
      "",
      "— The Little Learner Hub Team",
    ].join("\n");
    return { subject: ONBOARDING_STEPS[0].subject, text, html: shell.html };
  }

  if (stepKey === "tips") {
    const shell = brandEmailShell({
      htmlEscape,
      title: "How is Little Learner Hub working for you?",
      introHtml: `<p>${greeting}</p>
        <p>You’re one of the early providers using Little Learner Hub, and your feedback matters a lot right now.</p>`,
      bodyHtml: `
        <p>Could you send a quick note about:</p>
        <ul>
          <li>Anything confusing or hard to find</li>
          <li>A bug or glitch you ran into</li>
          <li>One thing that would make lesson planning easier</li>
        </ul>
        <p>Even one sentence helps. Bug reports and honest feedback are the fastest way we improve the product for real classrooms.</p>
      `,
      ctaLabel: "Send Feedback or Report a Bug",
      ctaUrl: contactUrl,
      footerNote: "This is a one-time check-in email from your onboarding sequence.",
    });
    const text = [
      `Hi ${first},`,
      "",
      "How is Little Learner Hub working for you?",
      "",
      "You’re one of the early providers using Little Learner Hub, and your feedback matters a lot right now.",
      "",
      "Could you send a quick note about:",
      "- Anything confusing or hard to find",
      "- A bug or glitch you ran into",
      "- One thing that would make lesson planning easier",
      "",
      "Even one sentence helps. Bug reports and honest feedback are the fastest way we improve the product for real classrooms.",
      "",
      `Send feedback: ${contactUrl}`,
      "",
      "— The Little Learner Hub Team",
    ].join("\n");
    return { subject: ONBOARDING_STEPS[1].subject, text, html: shell.html };
  }

  // explore — upcoming features / new content / what’s next
  const shell = brandEmailShell({
    htmlEscape,
    title: "What’s coming next",
    introHtml: `<p>${greeting}</p>
      <p>Thanks for being here early. Here’s what we’re focused on next for Little Learner Hub.</p>`,
    bodyHtml: `
      <p><strong>New content rolling out</strong></p>
      <ul>
        <li>More Infant, Toddler, and Preschool lesson plans</li>
        <li>More classroom activities tied to weekly themes</li>
        <li>More printable resources for teachers</li>
      </ul>
      <p><strong>Product improvements underway</strong></p>
      <ul>
        <li>Faster lesson browsing and planning on mobile</li>
        <li>Clearer weekly planning and print workflows</li>
        <li>Better ways to discover what’s newly added</li>
      </ul>
      <p>You’ll also get a short Monday “What’s New” email when fresh curriculum is published — and we’ll skip the week if nothing new went live.</p>
    `,
    ctaLabel: "See What’s in the Library",
    ctaUrl: lessonsUrl,
    footerNote: "This is the final email in your one-time onboarding sequence.",
  });
  const text = [
    `Hi ${first},`,
    "",
    "What’s coming next in Little Learner Hub",
    "",
    "Thanks for being here early. Here’s what we’re focused on next:",
    "",
    "New content rolling out:",
    "- More Infant, Toddler, and Preschool lesson plans",
    "- More classroom activities tied to weekly themes",
    "- More printable resources for teachers",
    "",
    "Product improvements underway:",
    "- Faster lesson browsing and planning on mobile",
    "- Clearer weekly planning and print workflows",
    "- Better ways to discover what’s newly added",
    "",
    "You’ll also get a short Monday “What’s New” email when fresh curriculum is published — and we’ll skip the week if nothing new went live.",
    "",
    `Library: ${lessonsUrl}`,
    `Home: ${homeUrl}`,
    "",
    "— The Little Learner Hub Team",
  ].join("\n");
  return { subject: ONBOARDING_STEPS[2].subject, text, html: shell.html };
}

/**
 * Single welcome/update email for a one-time all-users blast.
 * Not part of the onboarding drip and never scheduled.
 */
function buildWelcomeUpdateContent(_user, { siteUrl, htmlEscape }) {
  const base = siteBase(siteUrl);
  const lessonsUrl = `${base}/#lessons`;
  const subject = "New Teaching Kits Are Here! 🎉";
  const shell = brandEmailShell({
    htmlEscape,
    title: "New Teaching Kits Are Here! 🎉",
    introHtml: `<p>Hi everyone!</p>
      <p>Thank you so much for being a part of Little Learner Hub! 💛 I wanted to send a quick update about what we’ve been working on behind the scenes.</p>`,
    bodyHtml: `
      <p>We’ve officially started upgrading our lesson plans into full Teaching Kits! 🎉 Farm Animals is one example that has already been updated, with more resources designed to make planning and teaching easier.</p>
      <p>We’re working hard to update the rest of our lesson plans with things like:</p>
      <ul>
        <li>Printable classroom resources</li>
        <li>Visuals to support activities and setup</li>
        <li>More complete, ready-to-use activities</li>
        <li>Teacher-friendly materials and guidance</li>
        <li>New lesson plans and themes</li>
      </ul>
      <p>This is an ongoing process, so you’ll continue seeing more Teaching Kits and improvements added to Little Learner Hub as we work through the library.</p>
      <p>And I would LOVE your input! If there’s a lesson plan, theme, printable, classroom resource, or feature you’d really like to see added, please reply to this email and let me know. Your recommendations help me decide what to work on next.</p>
      <p>Thank you again for being here and growing with Little Learner Hub. I’m excited for you to see everything that’s coming! 💛</p>
      <p>Leah<br>Little Learner Hub</p>
    `,
    ctaLabel: "Open Lesson Plans",
    ctaUrl: lessonsUrl,
    footerNote: "This is a one-time product-update email. It is not a recurring campaign.",
  });
  const text = [
    "Hi everyone!",
    "",
    "Thank you so much for being a part of Little Learner Hub! 💛 I wanted to send a quick update about what we’ve been working on behind the scenes.",
    "",
    "We’ve officially started upgrading our lesson plans into full Teaching Kits! 🎉 Farm Animals is one example that has already been updated, with more resources designed to make planning and teaching easier.",
    "",
    "We’re working hard to update the rest of our lesson plans with things like:",
    "",
    "• Printable classroom resources",
    "• Visuals to support activities and setup",
    "• More complete, ready-to-use activities",
    "• Teacher-friendly materials and guidance",
    "• New lesson plans and themes",
    "",
    "This is an ongoing process, so you’ll continue seeing more Teaching Kits and improvements added to Little Learner Hub as we work through the library.",
    "",
    "And I would LOVE your input! If there’s a lesson plan, theme, printable, classroom resource, or feature you’d really like to see added, please reply to this email and let me know. Your recommendations help me decide what to work on next.",
    "",
    "Thank you again for being here and growing with Little Learner Hub. I’m excited for you to see everything that’s coming! 💛",
    "",
    "Leah",
    "Little Learner Hub",
    "",
    `Open Lesson Plans: ${lessonsUrl}`,
    "",
    "This is a one-time product-update email. It is not a recurring campaign.",
  ].join("\n");
  return { subject, text, html: shell.html };
}

function lessonDeepLink(base, lessonId) {
  const id = encodeURIComponent(String(lessonId || ""));
  return `${base}/#lessons?lesson=${id}`;
}

function buildWhatsNewContent(digest, { siteUrl, htmlEscape }) {
  const base = siteBase(siteUrl);
  const lessonsUrl = `${base}/#lessons`;
  const lessons = Array.isArray(digest.lessons) ? digest.lessons : [];
  const activities = Array.isArray(digest.activities) ? digest.activities : [];
  const resources = Array.isArray(digest.resources) ? digest.resources : [];
  const printables = Array.isArray(digest.printables) ? digest.printables : [];

  const lessonItemsHtml = lessons.map((lesson) => {
    const title = htmlEscape(lesson.title || "Untitled lesson");
    const age = htmlEscape(lesson.age || "");
    const theme = htmlEscape(lesson.theme || "");
    const meta = [age, theme].filter(Boolean).join(" · ");
    const link = htmlEscape(lesson.url || lessonsUrl);
    const counts = [];
    if (Number.isFinite(lesson.activityCount)) counts.push(`${lesson.activityCount} activit${lesson.activityCount === 1 ? "y" : "ies"}`);
    if (Number.isFinite(lesson.resourceCount)) counts.push(`${lesson.resourceCount} resource${lesson.resourceCount === 1 ? "" : "s"}`);
    const countLine = counts.length ? `<br><span style="color:#7a6e5c;font-size:13px">${htmlEscape(counts.join(" · "))}</span>` : "";
    return `<li style="margin:0 0 12px"><a href="${link}" style="color:#2f6f5e;font-weight:700;text-decoration:none">${title}</a>${meta ? `<br><span style="color:#7a6e5c;font-size:13px">${meta}</span>` : ""}${countLine}</li>`;
  }).join("");

  const listSection = (heading, items, formatter) => {
    if (!items.length) return "";
    return `<p style="margin:22px 0 8px"><strong>${htmlEscape(heading)}</strong></p><ul style="padding-left:18px;margin:0">${items.map(formatter).join("")}</ul>`;
  };

  const activityHtml = listSection("New activities", activities, (item) => {
    const title = htmlEscape(item.title || "Activity");
    const age = htmlEscape(item.age || "");
    const category = htmlEscape(item.category || "");
    const meta = [age, category].filter(Boolean).join(" · ");
    return `<li style="margin:0 0 8px"><strong>${title}</strong>${meta ? `<br><span style="color:#7a6e5c;font-size:13px">${meta}</span>` : ""}</li>`;
  });
  const resourceHtml = listSection("New curriculum resources", resources, (item) => {
    const title = htmlEscape(item.title || "Resource");
    const category = htmlEscape(item.category || "");
    return `<li style="margin:0 0 8px"><strong>${title}</strong>${category ? `<br><span style="color:#7a6e5c;font-size:13px">${category}</span>` : ""}</li>`;
  });
  const printableHtml = listSection("New printables", printables, (item) => {
    const title = htmlEscape(item.title || "Printable");
    return `<li style="margin:0 0 8px"><strong>${title}</strong></li>`;
  });

  const bodyHtml = `
    ${lessons.length ? `<p style="margin:16px 0 8px"><strong>New lesson plans</strong></p><ul style="padding-left:18px;margin:0">${lessonItemsHtml}</ul>` : ""}
    ${activityHtml}
    ${resourceHtml}
    ${printableHtml}
  `;

  const lessonText = lessons.map((lesson) => {
    const meta = [lesson.age, lesson.theme].filter(Boolean).join(" · ");
    const counts = [];
    if (Number.isFinite(lesson.activityCount)) counts.push(`${lesson.activityCount} activities`);
    if (Number.isFinite(lesson.resourceCount)) counts.push(`${lesson.resourceCount} resources`);
    return `- ${lesson.title || "Untitled"}${meta ? ` (${meta})` : ""}${counts.length ? ` [${counts.join(", ")}]` : ""}\n  ${lesson.url || lessonsUrl}`;
  }).join("\n");
  const activityText = activities.map((a) => `- ${a.title || "Activity"}${a.age || a.category ? ` (${[a.age, a.category].filter(Boolean).join(" · ")})` : ""}`).join("\n");
  const resourceText = resources.map((r) => `- ${r.title || "Resource"}${r.category ? ` (${r.category})` : ""}`).join("\n");
  const printableText = printables.map((p) => `- ${p.title || "Printable"}`).join("\n");

  const totalCount = lessons.length + activities.length + resources.length + printables.length;
  const shell = brandEmailShell({
    htmlEscape,
    title: "What’s New this week",
    introHtml: `<p>Fresh curriculum content just landed in Little Learner Hub.</p>`,
    bodyHtml,
    ctaLabel: "Open Lesson Library",
    ctaUrl: lessonsUrl,
    footerNote: "Weekly curriculum digest from Little Learner Hub. Sent only when new content is published.",
  });
  const textParts = [
    "What’s New this week — Little Learner Hub",
    "",
    "Fresh curriculum content just landed:",
  ];
  if (lessons.length) textParts.push("", "New lesson plans:", lessonText);
  if (activities.length) textParts.push("", "New activities:", activityText);
  if (resources.length) textParts.push("", "New curriculum resources:", resourceText);
  if (printables.length) textParts.push("", "New printables:", printableText);
  textParts.push("", `Open the library: ${lessonsUrl}`, "", "— The Little Learner Hub Team");

  return {
    subject: `What’s New: ${totalCount} new item${totalCount === 1 ? "" : "s"} this week`,
    text: textParts.join("\n"),
    html: shell.html,
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

function buildAudienceReport(store) {
  const users = Object.values(store?.users || {});
  const emails = users.map((user) => String(user.email || "").trim().toLowerCase()).filter(Boolean);
  const counts = emails.reduce((acc, email) => {
    acc[email] = (acc[email] || 0) + 1;
    return acc;
  }, {});
  const duplicates = Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([email, count]) => ({ email, count }));
  const activeUsers = users.filter(isActiveAccount);
  const validEmails = emails.filter((email) => !looksMalformedEmail(email));
  const testOrProbe = emails.filter((email) => looksLikeTestEmail(email));
  const bounceRisk = emails
    .map((email) => {
      const reasons = [];
      if (looksMalformedEmail(email)) reasons.push("malformed");
      if (looksLikeTestEmail(email)) reasons.push("test_or_probe");
      const domain = email.includes("@") ? email.split("@")[1] : "";
      if (/(mailinator|tempmail|guerrillamail|yopmail|trashmail)/i.test(domain)) {
        reasons.push("disposable_domain");
      }
      return reasons.length ? { email, reasons } : null;
    })
    .filter(Boolean);
  const marketingEligible = users.filter((user) => {
    const email = String(user.email || "").trim().toLowerCase();
    if (!email || looksMalformedEmail(email) || looksLikeTestEmail(email)) return false;
    if (!isActiveAccount(user)) return false;
    const prefs = emailPrefs(user);
    if (prefs.unsubscribedAt || prefs.marketing === false) return false;
    return true;
  });

  return {
    totalUsers: users.length,
    totalActiveUsers: activeUsers.length,
    totalValidEmailAddresses: validEmails.length,
    uniqueEmailAddresses: Object.keys(counts).length,
    duplicateEmailCount: duplicates.length,
    duplicates: duplicates.slice(0, 25),
    testOrProbeCount: testOrProbe.length,
    testOrProbeEmails: testOrProbe.slice(0, 25),
    bounceRiskCount: bounceRisk.length,
    bounceRiskSample: bounceRisk.slice(0, 25),
    marketingEligibleCount: marketingEligible.length,
    unsubscribedCount: users.filter((user) => emailPrefs(user).unsubscribedAt).length,
    note: "Exclude test/probe and malformed addresses before any bulk send. Confirm content approval before enabling EMAIL_AUTOMATIONS_ENABLED.",
  };
}

function buildFreeReengagementContent(user, { siteUrl, htmlEscape, unsubscribeUrl, postalAddress, foundingOpen = true } = {}) {
  const base = siteBase(siteUrl);
  const safeBase = htmlEscape(base);
  const safeUnsubscribe = htmlEscape(unsubscribeUrl || `${base}/`);
  const safePostalAddress = htmlEscape(postalAddress || "");
  const foundingPsText = foundingOpen
    ? "P.S. Upgrade to Pro for $19.99/month to unlock the full all-in-one childcare platform — lesson plans, activities, curriculum planning, AI documentation helpers, and child profiles."
    : "P.S. Upgrade to Pro for $19.99/month to unlock the full all-in-one childcare platform — lesson plans, activities, curriculum planning, AI documentation helpers, and child profiles.";
  const foundingPsHtml = foundingOpen
    ? `<p><strong>P.S.</strong> Upgrade to Pro for $19.99/month to unlock the full all-in-one childcare platform — lesson plans, activities, curriculum planning, AI documentation helpers, and child profiles.</p>`
    : `<p><strong>P.S.</strong> Upgrade to Pro for $19.99/month to unlock the full all-in-one childcare platform — lesson plans, activities, curriculum planning, AI documentation helpers, and child profiles.</p>`;
  const text = [
    "Hi!",
    "",
    "I wanted to reach out and let you know that we've been working hard behind the scenes and have added a lot of new content and improvements to Little Learner Hub.",
    "",
    "✨ What's New",
    "• New lesson plans added",
    "• New activities added",
    "• Improved lesson plan viewing",
    "• Better lesson plan downloads and printing",
    "• Calendar improvements",
    "• Cleaner navigation and organization",
    "• Bug fixes and performance improvements",
    "",
    "🚧 Coming Soon",
    "• Daily Logs improvements",
    "• Child Profiles enhancements",
    "• Observation and documentation tools",
    "• Behavior & Support resources",
    "• Forms and paperwork tools",
    "• Even more lesson plans and activities",
    "",
    "As a childcare provider myself, my goal is to create an affordable platform that truly gives providers everything they need in one place. Many of the updates we've made have come directly from feedback from childcare providers.",
    "",
    "I'd love for you to log back in, explore the updates, and let me know what you think.",
    "",
    "If you see anything that would make Little Learner Hub better, easier, or more useful for your program, please let me know. I genuinely use provider feedback to decide what gets built next.",
    "",
    "👉 Login Here:",
    base,
    "",
    "Thank you for being part of helping build Little Learner Hub! ❤️",
    "",
    "Leah Ivie",
    "Founder, Little Learner Hub",
    "",
    foundingPsText,
    "",
    `Unsubscribe from marketing emails: ${unsubscribeUrl || `${base}/`}`,
    postalAddress || "",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#2c2416;line-height:1.6">
      <p>Hi!</p>
      <p>I wanted to reach out and let you know that we've been working hard behind the scenes and have added a lot of new content and improvements to Little Learner Hub.</p>
      <h2 style="font-size:20px">✨ What's New</h2>
      <ul>
        <li>New lesson plans added</li><li>New activities added</li><li>Improved lesson plan viewing</li>
        <li>Better lesson plan downloads and printing</li><li>Calendar improvements</li>
        <li>Cleaner navigation and organization</li><li>Bug fixes and performance improvements</li>
      </ul>
      <h2 style="font-size:20px">🚧 Coming Soon</h2>
      <ul>
        <li>Daily Logs improvements</li><li>Child Profiles enhancements</li>
        <li>Observation and documentation tools</li><li>Behavior &amp; Support resources</li>
        <li>Forms and paperwork tools</li><li>Even more lesson plans and activities</li>
      </ul>
      <p>As a childcare provider myself, my goal is to create an affordable platform that truly gives providers everything they need in one place. Many of the updates we've made have come directly from feedback from childcare providers.</p>
      <p>I'd love for you to log back in, explore the updates, and let me know what you think.</p>
      <p>If you see anything that would make Little Learner Hub better, easier, or more useful for your program, please let me know. I genuinely use provider feedback to decide what gets built next.</p>
      <p><strong>👉 Login Here:</strong><br><a href="${safeBase}">${safeBase}</a></p>
      <p>Thank you for being part of helping build Little Learner Hub! ❤️</p>
      <p>Leah Ivie<br>Founder, Little Learner Hub</p>
      ${foundingPsHtml}
      <hr style="border:0;border-top:1px solid #ddd;margin:28px 0 16px">
      <p style="font-size:12px;color:#6f675d">You are receiving this because you have an active Free Little Learner Hub account. <a href="${safeUnsubscribe}">Unsubscribe from marketing emails</a>.<br>${safePostalAddress}</p>
    </div>
  `.trim();
  return { subject: FREE_REENGAGEMENT_SUBJECT, text, html };
}

function createEmailEngagement(deps) {
  const {
    sendEmail,
    SITE_URL,
    reviewEmail,
    unsubscribeUrlForEmail = () => "",
    postalAddress = "",
    htmlEscape,
    readStore,
    readStoreFresh = async () => readStore(),
    writeStore,
    writeStoreAsync,
    claimEmailCampaignDelivery = async () => ({ claimed: false }),
    completeEmailCampaignDelivery = async () => {},
    listEmailCampaignDeliveries = async () => [],
    patchEmailCampaignState = async () => ({}),
    isCurriculumLessonPublic,
    getDatabaseStatus = () => ({}),
    getAdminEmail = () => "",
    getSupportEmailStatus = () => ({ ready: false, provider: "not configured", fromConfigured: false }),
    areAutomationsEnabled = () => false,
    foundingSpotsRemaining = null,
    // Optional: when provided, used to cross-check audience "all" recipients.
    resolveAudienceRecipients = null,
  } = deps;

  async function persistEngagementStore(store, options = {}) {
    if (options.deferPersist) return;
    if (typeof writeStoreAsync === "function") {
      await writeStoreAsync(store);
      return;
    }
    writeStore(store);
  }

  function foundingOfferStillOpen(store) {
    if (typeof foundingSpotsRemaining !== "function") return true;
    try {
      return foundingSpotsRemaining(store) > 0;
    } catch {
      return true;
    }
  }

  function automationsAllowed() {
    try {
      return Boolean(areAutomationsEnabled());
    } catch {
      return false;
    }
  }

  function logEvent(store, event) {
    const eng = ensureEmailEngagement(store);
    const entry = {
      id: `em-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      at: new Date().toISOString(),
      ...event,
    };
    eng.events.unshift(entry);
    eng.events = eng.events.slice(0, MAX_EVENTS);
    return entry;
  }

  function freeReengagementContentHash() {
    const content = buildFreeReengagementContent({}, {
      siteUrl: SITE_URL,
      htmlEscape,
      unsubscribeUrl: "{{signed_unsubscribe_url}}",
      postalAddress,
      foundingOpen: foundingOfferStillOpen(readStore()),
    });
    return crypto.createHash("sha256")
      .update(`${content.subject}\n${content.text}\n${content.html}`)
      .digest("hex");
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim().toLowerCase());
  }

  function hasPromoAccessHistory(user, store, email) {
    return Boolean(
      user?.promoRedeemedAt
      || user?.pendingPromoCode
      || user?.promoCode
      || (Array.isArray(user?.promoRedemptions) && user.promoRedemptions.length)
      || (Array.isArray(store?.promoRedemptions) && store.promoRedemptions.some((record) => (
        String(record?.email || "").trim().toLowerCase() === email
      )))
    );
  }

  function freeReengagementAudience(store = readStore()) {
    const eligible = [];
    const invalid = [];
    const excluded = {
      disabled: 0,
      paidTrialOrPastDue: 0,
      admin: 0,
      promo: 0,
      unsubscribed: 0,
      missingAccountActivity: 0,
      alreadySent: 0,
      duplicateEmail: 0,
    };
    const seenEmails = new Set();
    for (const user of Object.values(store.users || {})) {
      const email = String(user?.email || "").trim().toLowerCase();
      if (String(user?.accountStatus || "Active").toLowerCase() === "disabled" || user?.disabled === true) {
        excluded.disabled += 1;
        continue;
      }
      const rawPlan = String(user?.plan || "").toLowerCase();
      const rawStripeStatus = String(user?.stripeSubscriptionStatus || "").toLowerCase();
      const rawTrialStatus = String(user?.trialStatus || "").toLowerCase();
      const explicitlyNonFree = rawPlan === "pro"
        || rawPlan === "founding"
        || Boolean(user?.foundingMember || user?.foundingMemberHistorical || user?.foundingMemberActive || user?.foundingMemberNumber)
        || ["active", "trialing", "past_due", "unpaid"].includes(rawStripeStatus)
        || rawTrialStatus.includes("in trial")
        || rawTrialStatus.includes("trial active");
      if (explicitlyNonFree || membershipAccess.membershipCurrentAccessKey(user) !== "free") {
        excluded.paidTrialOrPastDue += 1;
        continue;
      }
      if (
        email === String(reviewEmail || "").trim().toLowerCase()
        || String(user?.role || "").toLowerCase() === "admin"
        || user?.admin === true
        || user?.adminOverride === true
        || user?.internalAccessOverride === true
        || user?.manualAccessGranted === true
      ) {
        excluded.admin += 1;
        continue;
      }
      if (hasPromoAccessHistory(user, store, email)) {
        excluded.promo += 1;
        continue;
      }
      const prefs = emailPrefs(user);
      if (prefs.unsubscribedAt || prefs.marketing === false || prefs.weeklyWhatsNew === false) {
        excluded.unsubscribed += 1;
        continue;
      }
      if (!user?.signupAt && !user?.createdAt && !user?.lastLoginAt && !user?.lastSeenAt) {
        excluded.missingAccountActivity += 1;
        continue;
      }
      if (!isValidEmail(email)) {
        invalid.push(email || "(missing email)");
        continue;
      }
      if (seenEmails.has(email)) {
        excluded.duplicateEmail += 1;
        continue;
      }
      seenEmails.add(email);
      const campaignStamp = user?.emailCampaigns?.[FREE_REENGAGEMENT_CAMPAIGN_ID] || {};
      if (campaignStamp.sentAt || campaignStamp.pendingAt) {
        excluded.alreadySent += 1;
        continue;
      }
      eligible.push({ email, user });
    }
    return {
      campaignId: FREE_REENGAGEMENT_CAMPAIGN_ID,
      subject: FREE_REENGAGEMENT_SUBJECT,
      eligible,
      eligibleCount: eligible.length,
      invalid,
      excluded,
    };
  }


  function newlyPublishedCurriculum(store, sinceMs = 7 * MS_PER_DAY) {
    const curriculum = store?.siteContent?.curriculum || {};
    const plans = Array.isArray(curriculum.lessonPlans) ? curriculum.lessonPlans : [];
    const activities = Array.isArray(curriculum.activities) ? curriculum.activities : [];
    const resources = Array.isArray(curriculum.resources) ? curriculum.resources : [];
    const printables = Array.isArray(store?.siteContent?.printables) ? store.siteContent.printables : [];
    const cutoff = Date.now() - sinceMs;
    const base = siteBase(SITE_URL);
    const planById = Object.fromEntries(plans.map((p) => [p.id, p]));

    const inWindow = (stamp) => {
      const t = new Date(stamp || "").getTime();
      return Number.isFinite(t) && t >= cutoff;
    };

    const lessons = plans
      .filter((plan) => isCurriculumLessonPublic(plan.status))
      .filter((plan) => inWindow(plan.publishedAt))
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, 12)
      .map((plan) => {
        const linkedActivities = activities.filter((a) => a.lessonPlanId === plan.id && a.status === "published");
        const linkedResources = resources.filter((r) => (
          r.status === "published"
          && Array.isArray(r.lessonPlanIds)
          && r.lessonPlanIds.includes(plan.id)
        ));
        return {
          id: plan.id,
          title: plan.title,
          age: plan.age,
          theme: plan.theme,
          plan: plan.plan,
          publishedAt: plan.publishedAt || "",
          activityCount: linkedActivities.length,
          resourceCount: linkedResources.length,
          url: lessonDeepLink(base, plan.id),
        };
      });

    const newActivities = activities
      .filter((activity) => activity.status === "published" && inWindow(activity.publishedAt))
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, 20)
      .map((activity) => {
        const parent = planById[activity.lessonPlanId] || {};
        return {
          id: activity.id,
          title: activity.title,
          category: activity.activityCategory || "",
          age: parent.age || "",
          lessonPlanId: activity.lessonPlanId || "",
          publishedAt: activity.publishedAt || "",
          url: activity.lessonPlanId ? lessonDeepLink(base, activity.lessonPlanId) : `${base}/#lessons`,
        };
      });

    const newResources = resources
      .filter((resource) => resource.status === "published" && inWindow(resource.publishedAt))
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, 20)
      .map((resource) => ({
        id: resource.id,
        title: resource.title,
        category: resource.resourceCategory || "",
        publishedAt: resource.publishedAt || "",
      }));

    // Site-content printables library (separate from curriculum resources).
    // Use createdAt when present; only include visible/non-hidden items.
    const newPrintables = printables
      .filter((item) => item && item.hidden !== true && item.visible !== false)
      .filter((item) => inWindow(item.publishedAt || item.createdAt))
      .sort((a, b) => new Date(b.publishedAt || b.createdAt || 0) - new Date(a.publishedAt || a.createdAt || 0))
      .slice(0, 12)
      .map((item) => ({
        id: item.id,
        title: item.title || item.name || "Printable",
        publishedAt: item.publishedAt || item.createdAt || "",
      }));

    return {
      lessons,
      activities: newActivities,
      resources: newResources,
      printables: newPrintables,
      totalCount: lessons.length + newActivities.length + newResources.length + newPrintables.length,
    };
  }

  // Back-compat alias used by admin preview endpoint
  function newlyPublishedLessons(store, sinceMs = 7 * MS_PER_DAY) {
    return newlyPublishedCurriculum(store, sinceMs).lessons;
  }

  async function sendAndLog({ store, to, templateKey, campaign, subject, text, html, meta = {} }) {
    let emailResult = { sent: false, configured: false, provider: "not configured" };
    try {
      emailResult = await sendEmail({ to, subject, text, html });
    } catch (err) {
      emailResult = {
        sent: false,
        configured: true,
        provider: "error",
        error: err.message || String(err),
      };
    }
    const event = logEvent(store, {
      type: emailResult.sent ? "sent" : (emailResult.configured ? "failed" : "skipped_unconfigured"),
      templateKey,
      campaign,
      to,
      subject,
      provider: emailResult.provider || "",
      error: emailResult.error || "",
      meta,
    });
    return { emailResult, event };
  }

  async function sendFreeReengagementTest() {
    const cleanReviewEmail = String(reviewEmail || "").trim().toLowerCase();
    if (!isValidEmail(cleanReviewEmail)) {
      return { sent: false, reason: "review_email_not_configured" };
    }
    const unsubscribeUrl = unsubscribeUrlForEmail(cleanReviewEmail);
    const content = buildFreeReengagementContent({}, {
      siteUrl: SITE_URL,
      htmlEscape,
      unsubscribeUrl,
      postalAddress,
      foundingOpen: foundingOfferStillOpen(readStore()),
    });
    let emailResult;
    try {
      emailResult = await sendEmail({
        to: cleanReviewEmail,
        ...content,
        listUnsubscribeUrl: unsubscribeUrl,
        idempotencyKey: `${FREE_REENGAGEMENT_CAMPAIGN_ID}:review:${freeReengagementContentHash().slice(0, 32)}`,
      });
    } catch (err) {
      emailResult = {
        sent: false,
        configured: true,
        provider: "error",
        error: err.message || String(err),
      };
    }
    await patchEmailCampaignState(FREE_REENGAGEMENT_CAMPAIGN_ID, {
      subject: FREE_REENGAGEMENT_SUBJECT,
      testRecipient: cleanReviewEmail,
      testSentAt: emailResult.sent ? new Date().toISOString() : "",
      testProvider: emailResult.provider || "",
      testError: emailResult.error || "",
      testContentHash: freeReengagementContentHash(),
    });
    return {
      sent: Boolean(emailResult.sent),
      configured: Boolean(emailResult.configured),
      provider: emailResult.provider || "",
      messageId: emailResult.messageId || "",
      error: emailResult.error || "",
      recipient: cleanReviewEmail,
      eventId: "",
    };
  }

  async function runFreeReengagementCampaign(options = {}) {
    if (global.__llhFreeReengagementCampaignRunning) {
      return { sent: 0, failed: 0, reason: "campaign_already_in_progress" };
    }
    let store = await readStoreFresh();
    let eng = ensureEmailEngagement(store);
    eng.campaigns = eng.campaigns && typeof eng.campaigns === "object" ? eng.campaigns : {};
    let campaignState = eng.campaigns[FREE_REENGAGEMENT_CAMPAIGN_ID] || {};
    if (!campaignState.testSentAt || campaignState.testRecipient !== String(reviewEmail || "").trim().toLowerCase()) {
      return { sent: 0, failed: 0, reason: "successful_review_test_required" };
    }
    if (campaignState.testContentHash !== freeReengagementContentHash()) {
      return { sent: 0, failed: 0, reason: "review_test_content_changed" };
    }
    const testSentMs = Date.parse(campaignState.testSentAt) || 0;
    if (!testSentMs || Date.now() - testSentMs > 24 * 60 * 60 * 1000) {
      return { sent: 0, failed: 0, reason: "review_test_expired" };
    }
    if (options.reviewApproved !== true) {
      return { sent: 0, failed: 0, reason: "human_review_approval_required" };
    }
    if (options.confirmCampaignId !== FREE_REENGAGEMENT_CAMPAIGN_ID) {
      return { sent: 0, failed: 0, reason: "explicit_campaign_confirmation_required" };
    }
    if (campaignState.sendCompletedAt) {
      return { sent: 0, failed: 0, reason: "campaign_already_completed" };
    }
    const sendStartedMs = Date.parse(campaignState.sendStartedAt || "") || 0;
    if (sendStartedMs && !campaignState.sendCompletedAt && Date.now() - sendStartedMs < 30 * 60 * 1000) {
      return { sent: 0, failed: 0, reason: "campaign_already_in_progress" };
    }
    const runClaim = await claimEmailCampaignDelivery({
      campaignId: FREE_REENGAGEMENT_CAMPAIGN_ID,
      email: "__campaign_lock__",
      contentHash: freeReengagementContentHash(),
    });
    if (!runClaim.claimed) {
      return { sent: 0, failed: 0, reason: "campaign_already_claimed" };
    }

    const audience = freeReengagementAudience(store);
    const failures = [];
    const successes = [];
    const skippedAfterRecheck = [];
    campaignState.sendStartedAt = new Date().toISOString();
    campaignState.reviewApprovedAt = new Date().toISOString();
    campaignState.targetCount = audience.eligibleCount;
    await patchEmailCampaignState(FREE_REENGAGEMENT_CAMPAIGN_ID, {
      sendStartedAt: campaignState.sendStartedAt,
      reviewApprovedAt: campaignState.reviewApprovedAt,
      targetCount: campaignState.targetCount,
    });
    global.__llhFreeReengagementCampaignRunning = true;
    try {
      for (const { email } of audience.eligible) {
        // Re-read and re-segment immediately before every send. A user who
        // unsubscribed, upgraded, or was disabled after preview is skipped.
        let latestStore = await readStoreFresh();
        const latestEntry = freeReengagementAudience(latestStore).eligible.find((entry) => entry.email === email);
        if (!latestEntry) {
          skippedAfterRecheck.push(email);
          continue;
        }
        const currentUser = latestEntry.user;
        const idempotencyKey = `${FREE_REENGAGEMENT_CAMPAIGN_ID}:${crypto.createHash("sha256").update(email).digest("hex").slice(0, 32)}`;
        const unsubscribeUrl = unsubscribeUrlForEmail(email);
        const content = buildFreeReengagementContent(currentUser, {
          siteUrl: SITE_URL,
          htmlEscape,
          unsubscribeUrl,
          postalAddress,
          foundingOpen: foundingOfferStillOpen(latestStore),
        });
        const deliveryClaim = await claimEmailCampaignDelivery({
          campaignId: FREE_REENGAGEMENT_CAMPAIGN_ID,
          email,
          contentHash: freeReengagementContentHash(),
        });
        if (!deliveryClaim.claimed) {
          skippedAfterRecheck.push(email);
          continue;
        }
        // Re-check after the atomic delivery claim and immediately before the
        // provider call. Claiming never rewrites the account store.
        latestStore = await readStoreFresh();
        const stillEligible = freeReengagementAudience(latestStore).eligible.some((entry) => entry.email === email);
        if (!stillEligible) {
          await completeEmailCampaignDelivery({
            campaignId: FREE_REENGAGEMENT_CAMPAIGN_ID,
            email,
            status: "skipped",
            error: "Recipient became ineligible after delivery claim",
          });
          skippedAfterRecheck.push(email);
          continue;
        }
        let emailResult;
        try {
          emailResult = await sendEmail({
            to: email,
            ...content,
            listUnsubscribeUrl: unsubscribeUrl,
            idempotencyKey,
          });
        } catch (err) {
          emailResult = {
            sent: false,
            configured: true,
            provider: "error",
            error: err.message || String(err),
          };
        }
        await completeEmailCampaignDelivery({
          campaignId: FREE_REENGAGEMENT_CAMPAIGN_ID,
          email,
          status: emailResult.sent ? "sent" : "failed",
          provider: emailResult.provider || "",
          messageId: emailResult.messageId || "",
          error: emailResult.error || "",
        });

        if (emailResult.sent) successes.push(email);
        else {
          failures.push({
            email,
            error: emailResult.error || (emailResult.configured ? "Provider rejected send" : "Email provider not configured"),
          });
        }
      }

      const deliveries = (await listEmailCampaignDeliveries(FREE_REENGAGEMENT_CAMPAIGN_ID))
        .filter((delivery) => delivery.email !== "__campaign_lock__");
      const delivered = deliveries.filter((delivery) => delivery.status === "sent");
      const failedDeliveries = deliveries.filter((delivery) => delivery.status === "failed");
      const pendingDeliveries = deliveries.filter((delivery) => delivery.status === "pending");
      const completionPatch = {
        sendCompletedAt: pendingDeliveries.length ? "" : new Date().toISOString(),
        needsReconciliationAt: pendingDeliveries.length ? new Date().toISOString() : "",
        successfulSends: delivered.length,
        failedSends: failedDeliveries.length,
        pendingDeliveries: pendingDeliveries.map((delivery) => delivery.email),
        invalidEmails: audience.invalid,
        failures: failedDeliveries.map((delivery) => ({
        email: delivery.email,
        error: delivery.error || "",
        })),
        skippedAfterRecheck,
        bouncedEmails: [],
        bounceTrackingAvailable: false,
      };
      await patchEmailCampaignState(FREE_REENGAGEMENT_CAMPAIGN_ID, completionPatch);
      await completeEmailCampaignDelivery({
        campaignId: FREE_REENGAGEMENT_CAMPAIGN_ID,
        email: "__campaign_lock__",
        status: "sent",
      });
      campaignState = { ...campaignState, ...completionPatch };
      return {
        campaignId: FREE_REENGAGEMENT_CAMPAIGN_ID,
        totalFreeUsersEmailed: delivered.length + failedDeliveries.length,
        successfulSends: delivered.length,
        failedSends: failedDeliveries.length,
        failures: failedDeliveries.map((delivery) => ({ email: delivery.email, error: delivery.error || "" })),
        pendingReconciliation: pendingDeliveries.map((delivery) => delivery.email),
        invalidEmails: audience.invalid,
        skippedAfterRecheck,
        bouncedEmails: [],
        bounceTrackingAvailable: false,
        excluded: audience.excluded,
        reviewCopy: {
          recipient: campaignState.testRecipient,
          deliveredToProvider: Boolean(campaignState.testSentAt),
          sentAt: campaignState.testSentAt,
        },
      };
    } finally {
      global.__llhFreeReengagementCampaignRunning = false;
    }
  }

  async function sendOnboardingStep(email, stepKey, options = {}) {
    const store = readStore();
    store.users = store.users || {};
    const clean = String(email || "").trim().toLowerCase();
    const user = store.users[clean];
    if (!user) return { sent: false, reason: "user_not_found" };

    const eng = ensureEmailEngagement(store);
    // Campaign sends require the master kill-switch. Admin single-user tests may
    // pass adminTest to verify delivery while automations remain paused.
    if (!automationsAllowed() && !options.adminTest) {
      return { sent: false, reason: "automations_disabled" };
    }
    if (!eng.settings.onboardingEnabled && !options.force && !options.adminTest) {
      return { sent: false, reason: "onboarding_disabled" };
    }

    const prefs = emailPrefs(user);
    if (prefs.unsubscribedAt || prefs.onboarding === false) {
      logEvent(store, {
        type: "skipped_unsubscribed",
        templateKey: `onboarding_${stepKey}`,
        campaign: "onboarding",
        to: clean,
        subject: "",
      });
      if (!options.deferPersist) await persistEngagementStore(store);
      return { sent: false, reason: "unsubscribed" };
    }

    const step = ONBOARDING_STEPS.find((s) => s.key === stepKey);
    if (!step) return { sent: false, reason: "unknown_step" };

    const flags = onboardingFlags(user);
    if (flags[step.flag] && !options.force) {
      return { sent: false, reason: "already_sent", sentAt: flags[step.flag] };
    }

    // Enforce sequence: tips requires welcome; explore requires tips (unless force)
    if (!options.force) {
      if (stepKey === "tips" && !flags.welcomeSentAt) {
        return { sent: false, reason: "awaiting_welcome" };
      }
      if (stepKey === "explore" && !flags.tipsSentAt) {
        return { sent: false, reason: "awaiting_tips" };
      }
      const signupAt = user.signupAt || user.createdAt || "";
      if (daysSince(signupAt) < step.delayDays) {
        return { sent: false, reason: "too_early", delayDays: step.delayDays };
      }
    }

    const content = buildOnboardingContent(stepKey, user, { siteUrl: SITE_URL, htmlEscape });
    const { emailResult, event } = await sendAndLog({
      store,
      to: clean,
      templateKey: `onboarding_${stepKey}`,
      campaign: "onboarding",
      subject: content.subject,
      text: content.text,
      html: content.html,
      meta: { step: stepKey },
    });

    // Stamp once-only even when unconfigured so we don't spam retries forever after config is added mid-flight.
    // Exception: if configured but failed, leave flag empty so a later sweep can retry.
    const shouldStamp = emailResult.sent || !emailResult.configured || options.forceStampOnSoftFail;
    if (shouldStamp) {
      store.users[clean] = {
        ...user,
        onboardingEmails: {
          ...flags,
          [step.flag]: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };
    }
    if (!options.deferPersist) await persistEngagementStore(store);
    return {
      sent: Boolean(emailResult.sent),
      configured: Boolean(emailResult.configured),
      stamped: shouldStamp,
      emailResult,
      event,
      reason: emailResult.sent ? "sent" : (emailResult.configured ? "send_failed" : "unconfigured"),
    };
  }

  async function maybeSendWelcomeOnSignup(email) {
    return sendOnboardingStep(email, "welcome", { forceStampOnSoftFail: true });
  }

  async function processOnboardingDrip(options = {}) {
    const store = readStore();
    const eng = ensureEmailEngagement(store);
    if (!automationsAllowed()) {
      return { processed: 0, sent: 0, skipped: 0, reason: "automations_disabled" };
    }
    if (!eng.settings.onboardingEnabled && !options.force) {
      return { processed: 0, sent: 0, skipped: 0, reason: "onboarding_disabled" };
    }
    const users = Object.values(store.users || {});
    let processed = 0;
    let sent = 0;
    let skipped = 0;
    const details = [];

    for (const user of users) {
      const email = String(user.email || "").trim().toLowerCase();
      if (!email) continue;
      const prefs = emailPrefs(user);
      if (prefs.unsubscribedAt || prefs.onboarding === false) {
        skipped += 1;
        continue;
      }
      const flags = onboardingFlags(user);
      const signupAt = user.signupAt || user.createdAt || "";
      if (!signupAt) continue;

      for (const step of ONBOARDING_STEPS) {
        if (flags[step.flag]) continue;
        if (daysSince(signupAt) < step.delayDays && !options.force) continue;
        // Sequence gate
        if (step.key === "tips" && !flags.welcomeSentAt) continue;
        if (step.key === "explore" && !flags.tipsSentAt) continue;

        processed += 1;
        const result = await sendOnboardingStep(email, step.key, { force: options.force, deferPersist: true });
        details.push({ email, step: step.key, reason: result.reason, sent: result.sent });
        if (result.sent) sent += 1;
        else skipped += 1;
        // One step per user per sweep keeps pacing gentle
        break;
      }
    }

    const fresh = readStore();
    const freshEng = ensureEmailEngagement(fresh);
    freshEng.settings.lastOnboardingSweepAt = new Date().toISOString();
    await persistEngagementStore(fresh);

    return { processed, sent, skipped, details: details.slice(0, 50) };
  }

  function eligibleWeeklyRecipients(store, options = {}) {
    const key = weekKey();
    return Object.values(store.users || {})
      .filter((user) => {
        const email = String(user.email || "").trim().toLowerCase();
        if (!email || !email.includes("@")) return false;
        const prefs = emailPrefs(user);
        if (prefs.unsubscribedAt || prefs.weeklyWhatsNew === false) return false;
        // Only accounts that have signed up / synced
        if (!user.signupAt && !user.createdAt && !user.lastLoginAt) return false;
        const lastWeek = user.weeklyWhatsNew?.lastSentWeekKey || "";
        if (lastWeek === key && !options.force) return false;
        return true;
      })
      .map((user) => String(user.email).trim().toLowerCase());
  }

  async function runWeeklyWhatsNew(options = {}) {
    const store = readStore();
    const eng = ensureEmailEngagement(store);
    const key = weekKey();

    if (!automationsAllowed()) {
      return { sent: 0, skipped: true, reason: "automations_disabled", weekKey: key };
    }
    if (!eng.settings.weeklyWhatsNewEnabled && !options.force) {
      return { sent: 0, skipped: true, reason: "weekly_disabled", weekKey: key };
    }
    if (!isMonday(new Date()) && !options.force) {
      return { sent: 0, skipped: true, reason: "not_monday", weekKey: key };
    }
    if (eng.settings.lastWeeklyRunAt && weekKey(new Date(eng.settings.lastWeeklyRunAt)) === key && !options.force) {
      return { sent: 0, skipped: true, reason: "already_ran_this_week", weekKey: key };
    }

    const digest = newlyPublishedCurriculum(store, 7 * MS_PER_DAY);
    if (!digest.totalCount) {
      eng.settings.lastWeeklySkippedAt = new Date().toISOString();
      eng.settings.lastWeeklySkipReason = "no_new_content";
      eng.settings.lastWeeklyRunAt = new Date().toISOString();
      eng.settings.lastWeeklySentCount = 0;
      logEvent(store, {
        type: "skipped_empty",
        templateKey: "weekly_whats_new",
        campaign: "weekly_whats_new",
        to: "",
        subject: "What’s New this week",
        meta: { weekKey: key, lessonCount: 0, activityCount: 0, resourceCount: 0, printableCount: 0 },
      });
      await persistEngagementStore(store);
      return { sent: 0, skipped: true, reason: "no_new_content", weekKey: key, digest };
    }

    const content = buildWhatsNewContent(digest, { siteUrl: SITE_URL, htmlEscape });
    const recipients = eligibleWeeklyRecipients(store, options);
    let sentCount = 0;
    let failCount = 0;
    let softSkip = 0;

    for (const to of recipients) {
      const user = store.users[to];
      if (!options.force && user?.weeklyWhatsNew?.lastSentWeekKey === key) {
        softSkip += 1;
        continue;
      }
      const { emailResult } = await sendAndLog({
        store,
        to,
        templateKey: "weekly_whats_new",
        campaign: "weekly_whats_new",
        subject: content.subject,
        text: content.text,
        html: content.html,
        meta: {
          weekKey: key,
          lessonIds: digest.lessons.map((l) => l.id),
          activityIds: digest.activities.map((a) => a.id),
          resourceIds: digest.resources.map((r) => r.id),
        },
      });
      if (emailResult.sent) {
        sentCount += 1;
        store.users[to] = {
          ...user,
          weeklyWhatsNew: {
            ...(user.weeklyWhatsNew || {}),
            lastSentWeekKey: key,
            lastSentAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        };
      } else if (!emailResult.configured) {
        softSkip += 1;
        // Stamp week key on soft-fail so we don't retry every hour while unconfigured
        store.users[to] = {
          ...user,
          weeklyWhatsNew: {
            ...(user.weeklyWhatsNew || {}),
            lastSentWeekKey: key,
            lastAttemptAt: new Date().toISOString(),
            lastAttemptStatus: "unconfigured",
          },
        };
      } else {
        failCount += 1;
      }
    }

    eng.settings.lastWeeklyRunAt = new Date().toISOString();
    eng.settings.lastWeeklySentCount = sentCount;
    eng.settings.lastWeeklySkipReason = sentCount ? "" : (recipients.length ? "no_successful_sends" : "no_recipients");
    if (!sentCount && !recipients.length) {
      eng.settings.lastWeeklySkippedAt = eng.settings.lastWeeklyRunAt;
    }
    await persistEngagementStore(store);

    return {
      sent: sentCount,
      failed: failCount,
      softSkipped: softSkip,
      recipients: recipients.length,
      weekKey: key,
      lessons: digest.lessons,
      digest,
      skipped: sentCount === 0 && digest.totalCount === 0,
      reason: sentCount ? "sent" : eng.settings.lastWeeklySkipReason,
    };
  }

  function getAnalyticsSummary(store = readStore()) {
    const eng = ensureEmailEngagement(store);
    const events = eng.events || [];
    const byType = {};
    const byTemplate = {};
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    events.forEach((ev) => {
      byType[ev.type] = (byType[ev.type] || 0) + 1;
      byTemplate[ev.templateKey || "unknown"] = (byTemplate[ev.templateKey || "unknown"] || 0) + 1;
      if (ev.type === "sent") sent += 1;
      else if (ev.type === "failed") failed += 1;
      else skipped += 1;
    });

    const users = Object.values(store.users || {});
    const onboarding = {
      welcome: users.filter((u) => onboardingFlags(u).welcomeSentAt).length,
      tips: users.filter((u) => onboardingFlags(u).tipsSentAt).length,
      explore: users.filter((u) => onboardingFlags(u).exploreSentAt).length,
      unsubscribed: users.filter((u) => emailPrefs(u).unsubscribedAt).length,
    };

    return {
      settings: eng.settings,
      totals: { events: events.length, sent, failed, skipped },
      byType,
      byTemplate,
      onboarding,
      recentEvents: events.slice(0, 40),
      emailConfiguredNote: "Outbound mail uses the shared sendEmail() provider (Resend / SendGrid / Postmark).",
      oneTimeWelcomeUpdate: eng.settings.oneTimeWelcomeUpdate || defaultOneTimeWelcomeUpdate(),
    };
  }

  /**
   * Eligible recipients for the one-time all-users welcome/update email.
   * Uses the full user directory (no UI search/health filters). Excludes admin
   * and marketing-unsubscribed accounts.
   */
  function eligibleOneTimeRecipients(store, options = {}) {
    const adminEmail = String(options.adminEmail || getAdminEmail() || "").trim().toLowerCase();
    return Object.values(store.users || {})
      .filter((user) => {
        const email = String(user.email || "").trim().toLowerCase();
        if (!email || !email.includes("@")) return false;
        if (adminEmail && email === adminEmail) return false;
        if (!isActiveAccount(user)) return false;
        const prefs = emailPrefs(user);
        if (prefs.unsubscribedAt) return false;
        return true;
      })
      .map((user) => String(user.email).trim().toLowerCase());
  }

  /**
   * Complete admin preflight audit before any bulk / all-users email send.
   * Does not send mail. Issues a short-lived audit token used to unlock the
   * one-time welcome/update send.
   */
  async function runPreflightAudit(options = {}) {
    const store = options.store || readStore();
    const eng = ensureEmailEngagement(store);
    const adminEmail = String(options.adminEmail || getAdminEmail() || "").trim().toLowerCase();
    const dbStatus = typeof getDatabaseStatus === "function" ? (getDatabaseStatus() || {}) : {};
    const nodeEnv = String(options.nodeEnv || process.env.NODE_ENV || "").trim().toLowerCase();
    const allowLocalForTests = Boolean(options.allowLocalForTests || nodeEnv === "test");

    const userEntries = Object.entries(store.users || {});
    const users = userEntries.map(([, user]) => user);
    const totalUsers = users.length;
    const activeUsers = users.filter(isActiveAccount).length;
    const totalMessages = Array.isArray(store.messages) ? store.messages.length : 0;

    // Admin dashboard analytics user list should be the full directory (no slice).
    const dashboardUserEmails = new Set(
      users
        .map((user) => String(user.email || "").trim().toLowerCase())
        .filter(Boolean),
    );
    const dbUserEmails = new Set(
      userEntries
        .map(([key, user]) => String(user.email || key || "").trim().toLowerCase())
        .filter(Boolean),
    );
    const userListMatchesDb = dashboardUserEmails.size === dbUserEmails.size
      && [...dashboardUserEmails].every((email) => dbUserEmails.has(email));

    const inboxExpected = countAdminInboxFromStore(store, adminEmail);
    const inboxReported = options.inboxSummary && typeof options.inboxSummary === "object"
      ? {
        total: Number(options.inboxSummary.total) || 0,
        support: Number(options.inboxSummary.support) || 0,
        feature: Number(options.inboxSummary.feature) || 0,
        bug: Number(options.inboxSummary.bug) || 0,
        feedback: Number(options.inboxSummary.feedback) || 0,
        message: Number(options.inboxSummary.message) || 0,
      }
      : inboxExpected;
    const inboxMatchesDb = inboxExpected.total === inboxReported.total
      && inboxExpected.support === inboxReported.support
      && inboxExpected.feature === inboxReported.feature
      && inboxExpected.bug === inboxReported.bug
      && inboxExpected.feedback === inboxReported.feedback
      && inboxExpected.message === inboxReported.message;

    const recipients = eligibleOneTimeRecipients(store, { adminEmail });
    const recipientSet = new Set(recipients);
    let audienceAllCount = recipients.length;
    if (typeof resolveAudienceRecipients === "function") {
      const audienceAll = resolveAudienceRecipients(store, {
        audience: "all",
        adminEmail,
      }) || [];
      audienceAllCount = audienceAll.length;
    }
    // Recipients are active, non-admin, non-unsubscribed users from the full directory.
    // Smaller than audience "all" when disabled/unsubscribed users exist — intentional.
    const unsubscribedCount = users.filter((user) => emailPrefs(user).unsubscribedAt).length;
    const missingRecipients = [];
    const unexpectedRecipients = [];
    userEntries.forEach(([key, user]) => {
      const email = String(user.email || key || "").trim().toLowerCase();
      if (!email) return;
      const shouldInclude = email.includes("@")
        && !(adminEmail && email === adminEmail)
        && isActiveAccount(user)
        && !emailPrefs(user).unsubscribedAt;
      const included = recipientSet.has(email);
      if (shouldInclude && !included) missingRecipients.push(email);
      if (!shouldInclude && included) unexpectedRecipients.push(email);
    });
    const recipientListMatchesDb = missingRecipients.length === 0
      && unexpectedRecipients.length === 0
      && recipients.every((email) => dbUserEmails.has(email));

    const dbCheck = isStagingOrTestDatabase({
      provider: dbStatus.provider || process.env.DATABASE_PROVIDER || "local-json",
      connectionString: dbStatus.connectionString
        || process.env.PRODUCTION_DATABASE_URL
        || "",
      nodeEnv,
      allowLocalForTests,
    });
    const usingProductionDb = Boolean(dbStatus.ready)
      && !dbCheck.isStagingOrTest
      && !dbCheck.isLocalJson;
    // In automated tests, local-json is allowed so the audit/send path can be exercised.
    const databaseOk = usingProductionDb || (allowLocalForTests && dbCheck.isLocalJson && nodeEnv === "test");

    const noHiddenUserFilters = userListMatchesDb
      && recipientListMatchesDb
      && totalUsers === dbUserEmails.size;

    const emailStatus = typeof getSupportEmailStatus === "function"
      ? (getSupportEmailStatus() || {})
      : {};
    const emailProviderReady = Boolean(emailStatus.ready);

    const checks = [
      {
        id: "total_users",
        label: "Total production user count",
        pass: totalUsers >= 0 && userListMatchesDb,
        value: totalUsers,
        detail: `${totalUsers} users in the authoritative store directory`,
      },
      {
        id: "active_users",
        label: "Total active user count",
        pass: activeUsers >= 0 && activeUsers <= totalUsers,
        value: activeUsers,
        detail: `${activeUsers} non-disabled accounts (of ${totalUsers})`,
      },
      {
        id: "total_messages",
        label: "Total message count",
        pass: totalMessages >= 0,
        value: totalMessages,
        detail: `${totalMessages} rows in store.messages`,
      },
      {
        id: "user_list_matches_db",
        label: "Admin dashboard user list matches the database",
        pass: userListMatchesDb,
        value: dashboardUserEmails.size,
        detail: userListMatchesDb
          ? `Dashboard directory and database both list ${dashboardUserEmails.size} users`
          : `Mismatch: dashboard ${dashboardUserEmails.size} vs database ${dbUserEmails.size}`,
      },
      {
        id: "inbox_matches_db",
        label: "Admin inbox matches the database",
        pass: inboxMatchesDb,
        value: inboxExpected.total,
        detail: inboxMatchesDb
          ? `Inbox totals match store collections (${inboxExpected.total} open items)`
          : `Inbox mismatch: expected ${JSON.stringify(inboxExpected)} reported ${JSON.stringify(inboxReported)}`,
      },
      {
        id: "recipients_match_db",
        label: "Email recipient list matches the database",
        pass: recipientListMatchesDb,
        value: recipients.length,
        detail: recipientListMatchesDb
          ? `${recipients.length} recipients from the full user directory (admin/disabled/unsubscribed excluded)`
          : `Recipient list mismatch (missing=${missingRecipients.length}, unexpected=${unexpectedRecipients.length}, audience-all=${audienceAllCount}, recipients=${recipients.length}, unsubscribed=${unsubscribedCount})`,
      },
      {
        id: "production_database",
        label: "No staging/test database is being used",
        pass: databaseOk,
        value: dbStatus.provider || process.env.DATABASE_PROVIDER || "local-json",
        detail: databaseOk
          ? (usingProductionDb
            ? `Connected to production-ready database (${dbStatus.provider})`
            : "Test mode: local-json allowed for automated audits only")
          : `Blocked: provider=${dbStatus.provider || "unknown"}, stagingOrTest=${dbCheck.isStagingOrTest}, ready=${Boolean(dbStatus.ready)}`,
      },
      {
        id: "no_hidden_filters",
        label: "No filters are hiding users",
        pass: noHiddenUserFilters,
        value: totalUsers,
        detail: noHiddenUserFilters
          ? "User directory, dashboard list, and recipient resolution use the full unfiltered store"
          : "A filter or slice appears to be hiding users from the dashboard or recipient list",
      },
      {
        id: "email_provider_ready",
        label: "Email provider is configured and ready to send",
        pass: emailProviderReady || (allowLocalForTests && nodeEnv === "test"),
        value: emailStatus.provider || "not configured",
        detail: emailProviderReady
          ? `Provider ${emailStatus.provider || "configured"} is ready (from address configured)`
          : (allowLocalForTests && nodeEnv === "test"
            ? "Test mode: provider soft-fail allowed for prepare/audit coverage"
            : "Outbound email is not ready. Set RESEND_API_KEY (or SendGrid/Postmark) plus SUPPORT_EMAIL_FROM."),
      },
    ];

    const auditPassed = checks.every((check) => check.pass);
    const auditToken = auditPassed ? makeAuditToken() : "";
    const now = new Date().toISOString();
    eng.settings.oneTimeWelcomeUpdate = {
      ...defaultOneTimeWelcomeUpdate(),
      ...(eng.settings.oneTimeWelcomeUpdate || {}),
      lastAuditAt: now,
      lastAuditPassed: auditPassed,
      lastAuditToken: auditToken,
    };
    await persistEngagementStore(store);

    return {
      auditPassed,
      auditToken,
      auditedAt: now,
      counts: {
        totalUsers,
        activeUsers,
        totalMessages,
        emailRecipients: recipients.length,
        unsubscribedUsers: unsubscribedCount,
        audienceAllCount,
      },
      inbox: inboxExpected,
      database: {
        provider: dbStatus.provider || process.env.DATABASE_PROVIDER || "local-json",
        ready: Boolean(dbStatus.ready),
        isProduction: usingProductionDb,
        isStagingOrTest: dbCheck.isStagingOrTest,
        isLocalJson: dbCheck.isLocalJson,
        note: dbStatus.note || "",
      },
      recipients: {
        count: recipients.length,
        sample: recipients.slice(0, 12),
        matchesDatabase: recipientListMatchesDb,
      },
      checks,
      oneTimeWelcomeUpdate: eng.settings.oneTimeWelcomeUpdate,
      emailProvider: {
        ready: emailProviderReady,
        provider: emailStatus.provider || "not configured",
        fromConfigured: Boolean(emailStatus.fromConfigured),
        to: emailStatus.to || "",
        note: emailStatus.note || "",
      },
      sendUnlocked: Boolean(
        auditPassed
        && auditToken
        && !eng.settings.oneTimeWelcomeUpdate.sentAt,
      ),
    };
  }

  /**
   * Build the one-time welcome/update email + recipient list without sending.
   * Safe to run anytime after (or with) the preflight audit.
   */
  async function prepareOneTimeWelcomeUpdate(options = {}) {
    const store = options.store || readStore();
    const eng = ensureEmailEngagement(store);
    const state = eng.settings.oneTimeWelcomeUpdate || defaultOneTimeWelcomeUpdate();
    const adminEmail = String(options.adminEmail || getAdminEmail() || "").trim().toLowerCase();
    const emailStatus = typeof getSupportEmailStatus === "function"
      ? (getSupportEmailStatus() || {})
      : {};
    const recipients = eligibleOneTimeRecipients(store, { adminEmail });
    const sampleUser = store.users?.[recipients[0]] || {
      email: recipients[0] || "teacher@example.com",
      firstName: "there",
    };
    const content = buildWelcomeUpdateContent(sampleUser, { siteUrl: SITE_URL, htmlEscape });
    const alreadySent = Boolean(state.sentAt);
    const preparedAt = new Date().toISOString();

    eng.settings.oneTimeWelcomeUpdate = {
      ...defaultOneTimeWelcomeUpdate(),
      ...state,
      preparedAt,
      preparedRecipientCount: recipients.length,
      preparedSubject: content.subject,
    };
    await persistEngagementStore(store);

    return {
      prepared: true,
      sent: false,
      willSend: false,
      dryRun: true,
      alreadySent,
      preparedAt,
      subject: content.subject,
      textPreview: content.text,
      htmlPreview: content.html,
      ctaSiteUrl: siteBase(SITE_URL),
      recipients: {
        count: recipients.length,
        sample: recipients.slice(0, 20),
        fullListIncluded: false,
      },
      emailProvider: {
        ready: Boolean(emailStatus.ready),
        provider: emailStatus.provider || "not configured",
        fromConfigured: Boolean(emailStatus.fromConfigured),
        to: emailStatus.to || "",
        note: emailStatus.note || "",
      },
      audit: {
        lastAuditAt: state.lastAuditAt || "",
        lastAuditPassed: Boolean(state.lastAuditPassed),
        sendUnlocked: Boolean(state.lastAuditPassed && state.lastAuditToken && !alreadySent),
      },
      note: alreadySent
        ? "This one-time email was already sent. Prepare shows the template only — no send."
        : "Emails are prepared only. Nothing was sent. Use send-one-time with confirm:true after audit to deliver.",
    };
  }

  /**
   * One-time welcome/update email to every eligible user.
   * Requires a passing preflight audit token. Never scheduled / never recurring.
   */
  async function sendOneTimeWelcomeUpdate(options = {}) {
    const store = readStore();
    const eng = ensureEmailEngagement(store);
    const state = eng.settings.oneTimeWelcomeUpdate || defaultOneTimeWelcomeUpdate();

    if (!automationsAllowed()) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "automations_disabled",
        detail: "Set EMAIL_AUTOMATIONS_ENABLED=true only after content approval.",
      };
    }

    if (state.sentAt && !options.forceResend) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "already_sent",
        sentAt: state.sentAt,
        recipientCount: state.recipientCount || 0,
      };
    }

    const auditToken = String(options.auditToken || "").trim();
    if (!options.skipAuditToken) {
      if (!state.lastAuditPassed || !state.lastAuditToken || auditToken !== state.lastAuditToken) {
        return {
          sent: 0,
          failed: 0,
          skipped: true,
          reason: "audit_required",
          detail: "Run the admin preflight audit and confirm before sending.",
        };
      }
      const auditAgeMs = Date.now() - new Date(state.lastAuditAt || 0).getTime();
      if (!Number.isFinite(auditAgeMs) || auditAgeMs < 0 || auditAgeMs > 2 * 60 * 60 * 1000) {
        return {
          sent: 0,
          failed: 0,
          skipped: true,
          reason: "audit_expired",
          detail: "Audit token expired. Re-run the preflight audit.",
        };
      }
    }

    if (options.confirm !== true) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: "confirmation_required",
        detail: "Pass confirm: true after reviewing the audit recipient count.",
      };
    }

    const adminEmail = String(options.adminEmail || getAdminEmail() || "").trim().toLowerCase();
    const recipients = eligibleOneTimeRecipients(store, { adminEmail });
    if (!recipients.length) {
      return { sent: 0, failed: 0, skipped: true, reason: "no_recipients", recipients: 0 };
    }

    let sentCount = 0;
    let failCount = 0;
    let softSkip = 0;
    const details = [];

    for (const to of recipients) {
      const user = store.users[to] || { email: to };
      const content = buildWelcomeUpdateContent(user, { siteUrl: SITE_URL, htmlEscape });
      const { emailResult } = await sendAndLog({
        store,
        to,
        templateKey: "one_time_welcome_update",
        campaign: "one_time_welcome_update",
        subject: content.subject,
        text: content.text,
        html: content.html,
        meta: { oneTime: true, recurring: false },
      });
      if (emailResult.sent) {
        sentCount += 1;
        details.push({ email: to, reason: "sent" });
      } else if (!emailResult.configured) {
        softSkip += 1;
        details.push({ email: to, reason: "unconfigured" });
      } else {
        failCount += 1;
        details.push({ email: to, reason: "failed", error: emailResult.error || "" });
      }
    }

    const now = new Date().toISOString();
    // Stamp once-only even in soft-fail/unconfigured mode so this cannot become recurring.
    eng.settings.oneTimeWelcomeUpdate = {
      ...state,
      sentAt: now,
      sentCount,
      failedCount: failCount,
      recipientCount: recipients.length,
      lastAuditToken: "",
      lastAuditPassed: false,
    };
    await persistEngagementStore(store);

    return {
      sent: sentCount,
      failed: failCount,
      softSkipped: softSkip,
      recipients: recipients.length,
      skipped: false,
      reason: sentCount ? "sent" : (softSkip ? "unconfigured" : "no_successful_sends"),
      sentAt: now,
      recurring: false,
      details: details.slice(0, 50),
    };
  }

  async function updateSettings(partial = {}) {
    const store = readStore();
    const eng = ensureEmailEngagement(store);
    if (typeof partial.onboardingEnabled === "boolean") {
      eng.settings.onboardingEnabled = partial.onboardingEnabled;
    }
    if (typeof partial.weeklyWhatsNewEnabled === "boolean") {
      eng.settings.weeklyWhatsNewEnabled = partial.weeklyWhatsNewEnabled;
    }
    await persistEngagementStore(store);
    return eng.settings;
  }

  async function unsubscribeUser(email, options = {}) {
    const store = readStore();
    const clean = String(email || "").trim().toLowerCase();
    if (!clean || !store.users?.[clean]) return { ok: false, reason: "user_not_found" };
    const user = store.users[clean];
    const prefs = emailPrefs(user);
    store.users[clean] = {
      ...user,
      emailPrefs: {
        ...prefs,
        onboarding: options.keepTransactional ? prefs.onboarding : false,
        weeklyWhatsNew: false,
        marketing: false,
        unsubscribedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    logEvent(store, {
      type: "unsubscribed",
      templateKey: "prefs",
      campaign: "prefs",
      to: clean,
      subject: "",
    });
    await persistEngagementStore(store);
    return { ok: true };
  }

  function startScheduler(options = {}) {
    // Hourly onboarding + Monday What's New only.
    // The one-time welcome/update blast is intentionally NEVER scheduled.
    if (!automationsAllowed() && !options.forceStart) {
      console.log("[email-engagement] scheduler not started (EMAIL_AUTOMATIONS_ENABLED=false)");
      return null;
    }
    const intervalMs = options.intervalMs || 60 * 60 * 1000; // hourly
    if (global.__llhEmailEngagementTimer) {
      clearInterval(global.__llhEmailEngagementTimer);
    }
    const tick = async () => {
      if (!automationsAllowed()) return;
      try {
        await processOnboardingDrip();
      } catch (err) {
        console.warn("[email-engagement] onboarding sweep failed:", err.message);
      }
      try {
        await runWeeklyWhatsNew();
      } catch (err) {
        console.warn("[email-engagement] weekly run failed:", err.message);
      }
    };
    // Delay first tick slightly so boot completes
    setTimeout(() => {
      tick().catch(() => {});
    }, options.initialDelayMs || 15_000);
    global.__llhEmailEngagementTimer = setInterval(() => {
      tick().catch(() => {});
    }, intervalMs);
    if (typeof global.__llhEmailEngagementTimer.unref === "function") {
      global.__llhEmailEngagementTimer.unref();
    }
    return global.__llhEmailEngagementTimer;
  }

  return {
    ONBOARDING_STEPS,
    defaultEmailEngagementStore,
    ensureEmailEngagement,
    weekKey,
    newlyPublishedLessons,
    newlyPublishedCurriculum,
    maybeSendWelcomeOnSignup,
    sendOnboardingStep,
    processOnboardingDrip,
    runWeeklyWhatsNew,
    getAnalyticsSummary,
    updateSettings,
    unsubscribeUser,
    startScheduler,
    buildOnboardingContent,
    buildWhatsNewContent,
    buildWelcomeUpdateContent,
    buildAudienceReport,
    eligibleOneTimeRecipients,
    runPreflightAudit,
    prepareOneTimeWelcomeUpdate,
    sendOneTimeWelcomeUpdate,
    countAdminInboxFromStore,
    buildFreeReengagementContent,
    freeReengagementAudience,
    sendFreeReengagementTest,
    runFreeReengagementCampaign,
    FREE_REENGAGEMENT_CAMPAIGN_ID,
    FREE_REENGAGEMENT_SUBJECT,
  };
}

module.exports = {
  createEmailEngagement,
  defaultEmailEngagementStore,
  buildAudienceReport,
  ONBOARDING_STEPS,
  weekKey,
  isMonday,
  isStagingOrTestDatabase,
  countAdminInboxFromStore,
  buildWelcomeUpdateContent,
  FREE_REENGAGEMENT_CAMPAIGN_ID,
  FREE_REENGAGEMENT_SUBJECT,
};
