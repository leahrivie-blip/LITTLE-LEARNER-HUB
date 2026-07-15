/**
 * Email & User Engagement System
 * - Onboarding drip (welcome → tips → explore), once-only per user
 * - Weekly Monday "What's New" curriculum digest (skip if empty)
 * - Analytics events + admin controls
 *
 * Reuses the shared sendEmail() helper. Soft-fails when email is not configured.
 * Does not send Firebase auth emails (verification / password reset).
 */

const crypto = require("crypto");

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
    subject: "Your first week with Little Learner Hub",
  },
  {
    key: "explore",
    flag: "exploreSentAt",
    delayDays: 5,
    subject: "New curriculum ideas waiting for you",
  },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 2000;

function defaultEmailEngagementStore() {
  return {
    settings: {
      onboardingEnabled: true,
      weeklyWhatsNewEnabled: true,
      lastWeeklyRunAt: "",
      lastWeeklySkippedAt: "",
      lastWeeklySkipReason: "",
      lastWeeklySentCount: 0,
      lastOnboardingSweepAt: "",
    },
    events: [],
  };
}

function ensureEmailEngagement(store) {
  if (!store.emailEngagement || typeof store.emailEngagement !== "object") {
    store.emailEngagement = defaultEmailEngagementStore();
  }
  const eng = store.emailEngagement;
  eng.settings = { ...defaultEmailEngagementStore().settings, ...(eng.settings || {}) };
  eng.events = Array.isArray(eng.events) ? eng.events : [];
  return eng;
}

function siteBase(siteUrl) {
  return String(siteUrl || "").replace(/\/$/, "") || "https://www.littlelearnerhub.com";
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
  const plannerUrl = `${base}/#planner`;
  const childrenUrl = `${base}/#children`;
  const plansUrl = `${base}/#plans`;
  const greeting = `Hi ${htmlEscape(first)},`;

  if (stepKey === "welcome") {
    const shell = brandEmailShell({
      htmlEscape,
      title: "Welcome to Little Learner Hub",
      introHtml: `<p>${greeting}</p><p>You’re in. Little Learner Hub is built for daycare teachers who need classroom-ready lesson plans without the Sunday-night scramble.</p>`,
      bodyHtml: `
        <p>Start here:</p>
        <ol>
          <li>Browse the Lesson Plan Library</li>
          <li>Open a plan and tap <strong>Use This Plan</strong></li>
          <li>Add it to your Weekly Planner</li>
        </ol>
      `,
      ctaLabel: "Browse Lesson Plans",
      ctaUrl: lessonsUrl,
      footerNote: "You’re receiving this welcome email once for your new account.",
    });
    const text = [
      `Hi ${first},`,
      "",
      "Welcome to Little Learner Hub.",
      "Browse the Lesson Plan Library, open a plan, and tap Use This Plan to add it to your Weekly Planner.",
      "",
      `Open lessons: ${lessonsUrl}`,
      "",
      "— The Little Learner Hub Team",
    ].join("\n");
    return { subject: ONBOARDING_STEPS[0].subject, text, html: shell.html };
  }

  if (stepKey === "tips") {
    const shell = brandEmailShell({
      htmlEscape,
      title: "Your first week setup",
      introHtml: `<p>${greeting}</p><p>Here’s a simple path to get value in under 15 minutes.</p>`,
      bodyHtml: `
        <ol>
          <li><a href="${htmlEscape(childrenUrl)}">Add a child profile</a> (or skip if you’re exploring)</li>
          <li><a href="${htmlEscape(lessonsUrl)}">Save a lesson plan</a> you want to teach</li>
          <li><a href="${htmlEscape(plannerUrl)}">Open Weekly Planner</a> and place it on a day</li>
        </ol>
        <p>Tip: the Plan tab includes vocabulary, books, songs, and family connection notes ready for classroom use.</p>
      `,
      ctaLabel: "Open Weekly Planner",
      ctaUrl: plannerUrl,
    });
    const text = [
      `Hi ${first},`,
      "",
      "Your first week with Little Learner Hub:",
      "1) Add a child profile",
      "2) Save a lesson plan",
      "3) Place it on your Weekly Planner",
      "",
      `Planner: ${plannerUrl}`,
      "",
      "— The Little Learner Hub Team",
    ].join("\n");
    return { subject: ONBOARDING_STEPS[1].subject, text, html: shell.html };
  }

  // explore
  const shell = brandEmailShell({
    htmlEscape,
    title: "Fresh curriculum ideas for your classroom",
    introHtml: `<p>${greeting}</p><p>When you’re ready for more themes and ages, the library grows with Infant, Toddler, and Preschool plans built for real daycare rooms.</p>`,
    bodyHtml: `
      <p>This week, try:</p>
      <ul>
        <li>Filter by age group in the Lesson Library</li>
        <li>Open Week at a Glance to see Mon–Fri at a glance</li>
        <li>Print or download a Weekly Schedule PDF for your room</li>
      </ul>
      <p>Pro unlocks the full curriculum library when you need it.</p>
    `,
    ctaLabel: "Explore the Library",
    ctaUrl: lessonsUrl,
  });
  const text = [
    `Hi ${first},`,
    "",
    "Fresh curriculum ideas are waiting in Little Learner Hub.",
    "Filter by age, open Week at a Glance, and print a Weekly Schedule for your room.",
    "",
    `Library: ${lessonsUrl}`,
    `Plans: ${plansUrl}`,
    "",
    "— The Little Learner Hub Team",
  ].join("\n");
  return { subject: ONBOARDING_STEPS[2].subject, text, html: shell.html };
}

function buildWhatsNewContent(lessons, { siteUrl, htmlEscape }) {
  const base = siteBase(siteUrl);
  const lessonsUrl = `${base}/#lessons`;
  const itemsHtml = lessons.map((lesson) => {
    const title = htmlEscape(lesson.title || "Untitled lesson");
    const age = htmlEscape(lesson.age || "");
    const theme = htmlEscape(lesson.theme || "");
    const meta = [age, theme].filter(Boolean).join(" · ");
    return `<li style="margin:0 0 10px"><strong>${title}</strong>${meta ? `<br><span style="color:#7a6e5c;font-size:13px">${meta}</span>` : ""}</li>`;
  }).join("");
  const itemsText = lessons.map((lesson) => {
    const meta = [lesson.age, lesson.theme].filter(Boolean).join(" · ");
    return `- ${lesson.title || "Untitled"}${meta ? ` (${meta})` : ""}`;
  }).join("\n");

  const shell = brandEmailShell({
    htmlEscape,
    title: "What’s New this week",
    introHtml: `<p>New classroom-ready curriculum just landed in Little Learner Hub.</p>`,
    bodyHtml: `<ul style="padding-left:18px;margin:16px 0">${itemsHtml}</ul>`,
    ctaLabel: "Open Lesson Library",
    ctaUrl: lessonsUrl,
    footerNote: "Weekly curriculum digest from Little Learner Hub. Sent only when new plans are published.",
  });
  const text = [
    "What’s New this week — Little Learner Hub",
    "",
    "New classroom-ready curriculum:",
    itemsText,
    "",
    `Open the library: ${lessonsUrl}`,
    "",
    "— The Little Learner Hub Team",
  ].join("\n");
  return {
    subject: `What’s New: ${lessons.length} new lesson${lessons.length === 1 ? "" : "s"} this week`,
    text,
    html: shell.html,
  };
}

function createEmailEngagement(deps) {
  const {
    sendEmail,
    SITE_URL,
    htmlEscape,
    readStore,
    writeStore,
    writeStoreAsync,
    isCurriculumLessonPublic,
  } = deps;

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

  function newlyPublishedLessons(store, sinceMs = 7 * MS_PER_DAY) {
    const curriculum = store?.siteContent?.curriculum || {};
    const plans = Array.isArray(curriculum.lessonPlans) ? curriculum.lessonPlans : [];
    const cutoff = Date.now() - sinceMs;
    return plans
      .filter((plan) => isCurriculumLessonPublic(plan.status))
      .filter((plan) => {
        // Require publishedAt so routine edits (updatedAt) and seed imports without a
        // publish stamp do not accidentally trigger the weekly digest.
        const stamp = plan.publishedAt || "";
        const t = new Date(stamp).getTime();
        return Number.isFinite(t) && t >= cutoff;
      })
      .sort((a, b) => {
        const ta = new Date(a.publishedAt || 0).getTime();
        const tb = new Date(b.publishedAt || 0).getTime();
        return tb - ta;
      })
      .slice(0, 12)
      .map((plan) => ({
        id: plan.id,
        title: plan.title,
        age: plan.age,
        theme: plan.theme,
        plan: plan.plan,
        publishedAt: plan.publishedAt || "",
      }));
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

  async function sendOnboardingStep(email, stepKey, options = {}) {
    const store = readStore();
    store.users = store.users || {};
    const clean = String(email || "").trim().toLowerCase();
    const user = store.users[clean];
    if (!user) return { sent: false, reason: "user_not_found" };

    const eng = ensureEmailEngagement(store);
    if (!eng.settings.onboardingEnabled && !options.force) {
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
      writeStore(store);
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
    writeStore(store);
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
        const result = await sendOnboardingStep(email, step.key, { force: options.force });
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
    writeStore(fresh);

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

    if (!eng.settings.weeklyWhatsNewEnabled && !options.force) {
      return { sent: 0, skipped: true, reason: "weekly_disabled", weekKey: key };
    }
    if (!isMonday(new Date()) && !options.force) {
      return { sent: 0, skipped: true, reason: "not_monday", weekKey: key };
    }
    if (eng.settings.lastWeeklyRunAt && weekKey(new Date(eng.settings.lastWeeklyRunAt)) === key && !options.force) {
      return { sent: 0, skipped: true, reason: "already_ran_this_week", weekKey: key };
    }

    const lessons = newlyPublishedLessons(store, 7 * MS_PER_DAY);
    if (!lessons.length) {
      eng.settings.lastWeeklySkippedAt = new Date().toISOString();
      eng.settings.lastWeeklySkipReason = "no_new_lessons";
      eng.settings.lastWeeklyRunAt = new Date().toISOString();
      eng.settings.lastWeeklySentCount = 0;
      logEvent(store, {
        type: "skipped_empty",
        templateKey: "weekly_whats_new",
        campaign: "weekly_whats_new",
        to: "",
        subject: "What’s New this week",
        meta: { weekKey: key, lessonCount: 0 },
      });
      writeStore(store);
      return { sent: 0, skipped: true, reason: "no_new_lessons", weekKey: key, lessons: [] };
    }

    const content = buildWhatsNewContent(lessons, { siteUrl: SITE_URL, htmlEscape });
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
        meta: { weekKey: key, lessonIds: lessons.map((l) => l.id) },
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
    writeStore(store);

    return {
      sent: sentCount,
      failed: failCount,
      softSkipped: softSkip,
      recipients: recipients.length,
      weekKey: key,
      lessons,
      skipped: sentCount === 0 && lessons.length === 0,
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
    writeStore(store);
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
    writeStore(store);
    return { ok: true };
  }

  function startScheduler(options = {}) {
    const intervalMs = options.intervalMs || 60 * 60 * 1000; // hourly
    if (global.__llhEmailEngagementTimer) {
      clearInterval(global.__llhEmailEngagementTimer);
    }
    const tick = async () => {
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
  };
}

module.exports = {
  createEmailEngagement,
  defaultEmailEngagementStore,
  ONBOARDING_STEPS,
  weekKey,
  isMonday,
};
