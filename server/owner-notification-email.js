/**
 * Owner/admin notification emails — branded shell + enrichment for the
 * SUPPORT_EMAIL_TO inbox only. Separate from customer transactionalEmailShell.
 *
 * Best-effort: missing optional fields never fail generation.
 * Enrichment uses user records + featureUsage summaries (no unbounded analytics scans).
 */
"use strict";

const accountAccess = require("../scripts/account-access.js");
const membershipAccess = require("../scripts/membership-access.js");

const BRAND = "Little Learner Hub";
const INSIGHT_FALLBACK = "No meaningful activity yet.";
const ENGAGEMENT_EMPTY = "No activity yet.";
const RECENT_ACTIVITY_EMPTY = "No activity yet.";
const ANALYTICS_SCAN_LIMIT = 800;

const PRIORITY = Object.freeze({
  information: { key: "information", label: "Information", emoji: "🔵", color: "#175cd3", bg: "#eff8ff", border: "#b2ddff" },
  success: { key: "success", label: "Success", emoji: "🟢", color: "#067647", bg: "#ecfdf3", border: "#abefc6" },
  attention: { key: "attention", label: "Attention", emoji: "🟡", color: "#b54708", bg: "#fffaeb", border: "#fedf89" },
  critical: { key: "critical", label: "Critical", emoji: "🔴", color: "#b42318", bg: "#fef3f2", border: "#fecdca" },
});

const MEMBERSHIP_EVENT_TYPES = new Set([
  "admin_new_signup", "new_free_member",
  "admin_new_trial", "trial_started",
  "admin_new_pro", "admin_new_annual", "new_pro_member",
  "admin_new_founding", "new_founding_member",
  "admin_subscription_canceled", "subscription_ended",
  "admin_payment_failed", "payment_failed",
]);

const SOURCE_LABELS = Object.freeze({
  tiktok: "TikTok",
  facebook: "Facebook",
  fb: "Facebook",
  meta: "Facebook",
  instagram: "Facebook",
  google: "Google",
  googleads: "Google",
  "google ads": "Google",
  cpc: "Google",
  organic: "Organic",
  seo: "Organic",
  direct: "Direct",
  "(direct)": "Direct",
  none: "Direct",
  unknown: "Unknown",
  other: "Unknown",
});

const CALENDAR_KEYS = Object.freeze([
  "lesson_plan_added_to_calendar",
  "calendar_lesson_assigned",
  "add_to_calendar",
  "schedule_assign_lesson",
  "curriculum_planner_assign",
  "lesson_use_this_plan_main_calendar",
  "lesson_add_to_my_week",
]);

const DOWNLOAD_KEYS = Object.freeze([
  "resource_pdf_download",
  "resource_docx_download",
  "resource_download",
  "lesson_docx_download",
  "generated_pdf",
  "provider_tool_pdf",
]);

const PRINT_KEYS = Object.freeze([
  "resource_print",
  "generated_print",
  "provider_tool_pdf",
]);

const AI_KEYS = Object.freeze([
  "ai_helper_used",
  "ai_generation",
  "documentation_helper",
  "ai_guide_open",
  "helper_generate",
]);

const DOC_HELPER_KEYS = Object.freeze([
  "documentation_helper",
  "observation_created",
  "observation_saved",
  "daily_log_created",
  "daily_report_saved",
  "form_submitted",
  "forms_submitted",
]);

const MESSAGE_KEYS = Object.freeze([
  "message_sent",
  "member_message_sent",
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function clampText(value, max = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function hasValue(value) {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  const text = String(value).trim();
  if (!text) return false;
  if (text === "—" || text === "-" || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") {
    return false;
  }
  return true;
}

function resolveEnvironmentLabel(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv === "production") return "Production";
  if (nodeEnv === "test") return "Test";
  if (String(env.RENDER || "").trim() === "true" || String(env.RENDER_SERVICE_ID || "").trim()) {
    return "Production";
  }
  return "Test";
}

function formatOwnerDate(value) {
  if (!hasValue(value)) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  try {
    return date.toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
      timeZoneName: "short",
    });
  } catch {
    return date.toISOString();
  }
}

function detectDevice(ua = "") {
  const value = String(ua || "");
  if (/iPad|Tablet/i.test(value)) return "Tablet";
  if (/Mobi|Android|iPhone/i.test(value)) return "Mobile";
  if (!value) return "";
  return "Desktop";
}

function detectBrowser(ua = "") {
  const value = String(ua || "");
  if (/Edg\//i.test(value)) return "Edge";
  if (/Chrome\//i.test(value) && !/Edg\//i.test(value)) return "Chrome";
  if (/Safari\//i.test(value) && !/Chrome\//i.test(value)) return "Safari";
  if (/Firefox\//i.test(value)) return "Firefox";
  return value ? "Other" : "";
}

function normalizeSourceLabel(raw) {
  if (!hasValue(raw)) return "";
  const key = String(raw).trim().toLowerCase();
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  if (key.includes("tiktok")) return "TikTok";
  if (key.includes("facebook") || key.includes("instagram") || key === "ig") return "Facebook";
  if (key.includes("google")) return "Google";
  if (key.includes("organic") || key.includes("seo")) return "Organic";
  if (key.includes("direct")) return "Direct";
  const cleaned = String(raw).trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Unknown";
}

function usageSum(featureUsage, keys) {
  const usage = featureUsage && typeof featureUsage === "object" ? featureUsage : {};
  return keys.reduce((total, key) => total + (Number(usage[key]) || 0), 0);
}

function displayName(user = {}, fallbackEmail = "") {
  return user.name
    || [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
    || fallbackEmail
    || "";
}

function membershipLabel(user = {}) {
  if (!user || typeof user !== "object") return "";
  if (user.foundingMemberActive || user.plan === "Founding") return "Founding";
  const plan = String(user.plan || "Free").trim() || "Free";
  const trialish = /trial/i.test(String(user.subscriptionStatus || ""))
    || /trial/i.test(String(user.trialStatus || ""))
    || Boolean(user.trialEnd && new Date(user.trialEnd).getTime() > Date.now() && plan === "Pro");
  if (trialish && plan !== "Founding") return "Pro Trial";
  return plan;
}

function statusLabelForEvent(eventType, user = {}) {
  switch (eventType) {
    case "admin_new_signup":
    case "new_free_member":
      return "New Free Member";
    case "admin_new_trial":
    case "trial_started":
      return "Trial Started";
    case "admin_new_pro":
    case "admin_new_annual":
    case "new_pro_member":
      return "New Pro Member";
    case "admin_new_founding":
    case "new_founding_member":
      return "New Founding Member";
    case "admin_subscription_canceled":
    case "subscription_ended":
      return "Subscription Ended";
    case "admin_payment_failed":
    case "payment_failed":
      return "Payment Failed";
    default:
      return membershipLabel(user) || String(user.plan || "").trim() || "";
  }
}

function activityLevelLabel(engagement = {}) {
  const total = Number(engagement.totalActions || 0);
  if (!total) return "No activity yet";
  if (total >= 20) return "Highly engaged";
  if (total >= 5) return "Active";
  return "Light activity";
}

function findUser(store, email) {
  const clean = normalizeEmail(email);
  if (!clean || !store?.users) return null;
  if (store.users[clean]) return store.users[clean];
  return Object.values(store.users).find((u) => normalizeEmail(u?.email) === clean) || null;
}

function fieldFromPairs(fields, label) {
  if (!Array.isArray(fields)) return "";
  const want = String(label || "").toLowerCase();
  const hit = fields.find((pair) => Array.isArray(pair) && String(pair[0] || "").toLowerCase() === want);
  return hit ? hit[1] : "";
}

function absoluteAdminUrl(siteUrl, pathOrQuery) {
  const base = String(siteUrl || "").replace(/\/$/, "") || "";
  const path = String(pathOrQuery || "");
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/?")) return `${base}${path}`;
  if (path.startsWith("?")) return `${base}/${path}`;
  if (path.startsWith("/")) return `${base}${path}`;
  return `${base}/?view=admin&adminPanel=${encodeURIComponent(path || "admin-home")}`;
}

function adminLink(siteUrl, panel, params = {}) {
  const search = new URLSearchParams({ view: "admin", adminPanel: panel });
  Object.entries(params).forEach(([key, value]) => {
    if (hasValue(value)) search.set(key, String(value));
  });
  return absoluteAdminUrl(siteUrl, `/?${search.toString()}`);
}

function parseMoney(value) {
  const n = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isSameUtcDay(iso, now = new Date()) {
  if (!hasValue(iso)) return false;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return false;
  return date.getUTCFullYear() === now.getUTCFullYear()
    && date.getUTCMonth() === now.getUTCMonth()
    && date.getUTCDate() === now.getUTCDate();
}

function withinDays(iso, days, nowMs = Date.now()) {
  if (!hasValue(iso)) return false;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return false;
  return (nowMs - ms) <= days * 24 * 60 * 60 * 1000 && ms <= nowMs;
}

function contentLabelFromEvent(event) {
  const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
  return String(
    detail.title
    || detail.resourceId
    || detail.lessonId
    || detail.activityId
    || detail.name
    || event?.name
    || "",
  ).trim().slice(0, 120);
}

function isLessonEvent(event) {
  const name = String(event?.name || "");
  if (["lesson_plan_view", "curriculum_lesson_view"].includes(name)) return true;
  if (name !== "resource_view") return false;
  return String(event?.detail?.category || "").toLowerCase().includes("lesson");
}

function isActivityEvent(event) {
  const name = String(event?.name || "");
  if (["activity_view", "curriculum_activity_view"].includes(name)) return true;
  if (name !== "resource_view") return false;
  return String(event?.detail?.category || "").toLowerCase().includes("activit");
}

function isCalendarEvent(event) {
  return CALENDAR_KEYS.includes(String(event?.name || ""));
}

function isAiEvent(event) {
  return AI_KEYS.includes(String(event?.name || ""));
}

/**
 * Lightweight snapshot from store.users only (no analytics event scan).
 * Mirrors existing admin analytics member/MRR rollups using the same fields.
 */
function buildBusinessImpactSnapshot(store = {}, { excludeEmail = "" } = {}) {
  const users = Object.values(store?.users || {}).filter((user) => user && normalizeEmail(user.email));
  if (!users.length) return { rows: [], present: false };

  const cleanExclude = normalizeEmail(excludeEmail);
  let activeTrials = 0;
  let activeSubscribers = 0;
  let mrr = 0;
  let signupsToday = 0;
  let proSignupsLast3Days = 0;
  const now = new Date();
  const nowMs = now.getTime();

  for (const user of users) {
    const email = normalizeEmail(user.email);
    const access = membershipAccess.membershipCurrentAccessKey(user, nowMs);
    if (access === "trial") activeTrials += 1;
    if (access === "pro" || access === "founding") {
      activeSubscribers += 1;
      const price = parseMoney(user.monthlyPrice || user.displayPrice || "");
      if (price > 0) {
        mrr += String(user.subscriptionCadence || "").toLowerCase().includes("year")
          ? Number((price / 12).toFixed(2))
          : price;
      } else if (access === "founding") {
        mrr += 9.99;
      } else {
        mrr += 19.99;
      }
    }
    if (isSameUtcDay(user.signupAt || user.createdAt, now)) signupsToday += 1;
    const paidAt = user.subscriptionStartedAt || user.firstPaidInvoiceAt || user.metaPurchaseAt || "";
    if (
      email !== cleanExclude
      && withinDays(paidAt, 3, nowMs)
      && (access === "pro" || access === "founding" || ["Pro", "Founding"].includes(String(user.plan || "")))
    ) {
      proSignupsLast3Days += 1;
    }
  }

  const totalMembers = users.length;
  const conversionRate = totalMembers > 0 && activeSubscribers > 0
    ? `${((activeSubscribers / totalMembers) * 100).toFixed(1)}%`
    : "";
  const rows = [
    ["Total members", String(totalMembers)],
    ["Active trials", String(activeTrials)],
    ["Active subscribers", String(activeSubscribers)],
    ["Monthly recurring revenue", mrr > 0 ? `$${Number(mrr).toFixed(2)}` : ""],
    ["Conversion rate", conversionRate],
  ].filter(([, value]) => hasValue(value));

  return {
    rows,
    present: rows.length > 0,
    totalMembers,
    activeTrials,
    activeSubscribers,
    mrr: Number(mrr.toFixed(2)),
    conversionRate,
    signupsToday,
    proSignupsLast3Days,
  };
}

/**
 * Recent activity for one member. Uses user timestamps + a bounded reverse
 * scan of analyticsEvents (max ANALYTICS_SCAN_LIMIT) — never full history.
 */
function buildRecentActivity(user = {}, store = null) {
  const lastLogin = user.lastLoginAt || "";
  let lastLesson = "";
  let lastActivityViewed = "";
  let lastCalendar = "";
  let lastAi = "";

  const email = normalizeEmail(user.email);
  const events = Array.isArray(store?.analyticsEvents) ? store.analyticsEvents : [];
  if (email && events.length) {
    const start = Math.max(0, events.length - ANALYTICS_SCAN_LIMIT);
    for (let i = events.length - 1; i >= start; i -= 1) {
      const event = events[i];
      if (!event || normalizeEmail(event.user) !== email) continue;
      const when = formatOwnerDate(event.createdAt) || event.createdAt || "";
      const label = contentLabelFromEvent(event);
      const stamp = label && when ? `${label} · ${when}` : (when || label);
      if (!lastLesson && isLessonEvent(event)) lastLesson = stamp;
      else if (!lastActivityViewed && isActivityEvent(event)) lastActivityViewed = stamp;
      else if (!lastCalendar && isCalendarEvent(event)) lastCalendar = stamp;
      else if (!lastAi && isAiEvent(event)) lastAi = stamp;
      if (lastLesson && lastActivityViewed && lastCalendar && lastAi) break;
    }
  }

  // FeatureUsage fallbacks when event titles are unavailable.
  const usage = user.featureUsage && typeof user.featureUsage === "object" ? user.featureUsage : {};
  if (!lastLesson && usageSum(usage, ["lesson_plan_view", "curriculum_lesson_view"]) > 0) {
    lastLesson = "Lesson plan opened (recent count on file)";
  }
  if (!lastActivityViewed && usageSum(usage, ["activity_view", "curriculum_activity_view"]) > 0) {
    lastActivityViewed = "Activity viewed (recent count on file)";
  }
  if (!lastCalendar && usageSum(usage, CALENDAR_KEYS) > 0) {
    lastCalendar = "Calendar assignment recorded";
  }
  if (!lastAi && usageSum(usage, AI_KEYS) > 0) {
    lastAi = "AI feature used (recent count on file)";
  }

  const rows = [
    ["Last login", formatOwnerDate(lastLogin) || lastLogin],
    ["Last lesson opened", lastLesson],
    ["Last activity viewed", lastActivityViewed],
    ["Last calendar assignment", lastCalendar],
    ["Last AI feature used", lastAi],
  ].filter(([, value]) => hasValue(value));

  const empty = rows.length === 0
    || (!lastLogin && !lastLesson && !lastActivityViewed && !lastCalendar && !lastAi);

  return {
    rows: empty ? [] : rows,
    empty: empty && !hasValue(user.lastSeenAt),
    lastLogin,
    lastLesson,
    lastActivityViewed,
    lastCalendar,
    lastAi,
  };
}

function resolvePriority(eventType) {
  switch (eventType) {
    case "admin_paid_access_not_restored":
    case "critical_billing_mismatch":
      return PRIORITY.critical;
    case "admin_payment_failed":
    case "payment_failed":
    case "admin_subscription_canceled":
    case "subscription_ended":
    case "bug_report":
    case "Bug Report":
      return PRIORITY.attention;
    case "admin_new_trial":
    case "trial_started":
    case "admin_new_pro":
    case "admin_new_annual":
    case "new_pro_member":
    case "admin_new_founding":
    case "new_founding_member":
      return PRIORITY.success;
    default:
      return PRIORITY.information;
  }
}

function buildEngagementSnapshot(user = {}) {
  const usage = user.featureUsage && typeof user.featureUsage === "object" ? user.featureUsage : {};
  const lessonPlansOpened = usageSum(usage, ["lesson_plan_view", "curriculum_lesson_view", "resource_view"]);
  // resource_view may include activities; prefer explicit activity keys when present.
  const activitiesViewed = usageSum(usage, ["activity_view", "curriculum_activity_view"])
    || (Number(usage.resource_view) && !lessonPlansOpened ? Number(usage.resource_view) : 0);
  const calendarAssignments = usageSum(usage, CALENDAR_KEYS);
  const favorites = usageSum(usage, ["favorite_add", "resource_favorite"]);
  const downloads = usageSum(usage, DOWNLOAD_KEYS);
  const prints = usageSum(usage, PRINT_KEYS);
  const aiFeaturesUsed = usageSum(usage, AI_KEYS);
  const messagesSent = usageSum(usage, MESSAGE_KEYS);
  const documentationHelpersUsed = usageSum(usage, DOC_HELPER_KEYS);
  const totalActions = Object.values(usage).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const lastActivity = user.lastSeenAt || user.lastLoginAt || "";
  const lastLogin = user.lastLoginAt || "";

  const rows = [
    ["Lesson plans opened", lessonPlansOpened || ""],
    ["Activities viewed", activitiesViewed || ""],
    ["Calendar assignments", calendarAssignments || ""],
    ["Favorites", favorites || ""],
    ["Downloads", downloads || ""],
    ["Prints", prints || ""],
    ["AI features used", aiFeaturesUsed || ""],
    ["Messages sent", messagesSent || ""],
    ["Documentation helpers used", documentationHelpersUsed || ""],
    ["Last activity", formatOwnerDate(lastActivity)],
    ["Last login", formatOwnerDate(lastLogin)],
  ].filter(([, value]) => hasValue(value) && value !== 0);

  const hasCounts = [
    lessonPlansOpened, activitiesViewed, calendarAssignments, favorites,
    downloads, prints, aiFeaturesUsed, messagesSent, documentationHelpersUsed,
  ].some((n) => Number(n) > 0);

  return {
    rows: hasCounts || lastActivity || lastLogin ? rows : [],
    empty: !hasCounts && !lastActivity && !lastLogin,
    lessonPlansOpened,
    activitiesViewed,
    calendarAssignments,
    favorites,
    downloads,
    prints,
    aiFeaturesUsed,
    messagesSent,
    documentationHelpersUsed,
    lastActivity,
    lastLogin,
    totalActions,
    activityLevel: activityLevelLabel({ totalActions: hasCounts ? totalActions : 0 }),
  };
}

function buildAttribution(user = {}, extras = {}) {
  const attr = user.attribution && typeof user.attribution === "object" ? user.attribution : {};
  const ua = extras.userAgent || user.userAgent || user.lastUserAgent || attr.userAgent || "";
  const device = extras.device
    || attr.device
    || detectDevice(ua)
    || "";
  const source = normalizeSourceLabel(
    extras.source || attr.source || attr.utm_source || attr.trafficSource || "",
  );
  const rows = [
    ["Source", source],
    ["Campaign", extras.campaign || attr.campaign || attr.utm_campaign || ""],
    ["Medium", extras.medium || attr.medium || attr.utm_medium || ""],
    ["Referrer", extras.referrer || attr.referrer || attr.referer || ""],
    ["Landing page", extras.landingPage || attr.landingPage || attr.landing_page || ""],
    ["First page visited", extras.firstPage || attr.firstPage || attr.firstPageVisited || attr.landingPage || ""],
    ["Device", device],
  ].filter(([, value]) => hasValue(value));
  return { rows, source, device, present: rows.length > 0 };
}

function buildMemberSummary({ eventType, user = {}, email = "", extras = {}, engagement = null }) {
  const eng = engagement || buildEngagementSnapshot(user);
  const attr = buildAttribution(user, extras);
  const name = displayName(user, email);
  const accountType = hasValue(extras.accountType)
    ? extras.accountType
    : (user.accountType ? accountAccess.accountTypeLabel(user.accountType) : "");
  const role = hasValue(extras.role)
    ? extras.role
    : (user.role ? accountAccess.roleLabel(user.role) : "");
  const program = extras.programName
    || user.programName
    || user.businessName
    || user.daycareName
    || "";
  const state = extras.state || user.state || user.region || user.locationState || "";
  const membership = extras.membership || membershipLabel(user);
  const status = extras.status || statusLabelForEvent(eventType, user);
  const signupAt = extras.signupAt || user.signupAt || user.createdAt || "";
  const trialEnd = extras.trialEnd || user.trialEnd || "";

  const rows = [
    ["Status", status],
    ["Name", name && name !== email ? name : (name || "")],
    ["Email", email || user.email || ""],
    ["Membership", membership],
    ["Account type", accountType],
    ["Role", role],
    ["Program name", program],
    ["State", state],
    ["Traffic source", attr.source],
    ["Device", attr.device],
    ["Signup date", formatOwnerDate(signupAt)],
    ["Trial end date", formatOwnerDate(trialEnd)],
    ["Current activity level", eng.activityLevel],
  ].filter(([, value]) => hasValue(value));

  return { rows, name, email: email || user.email || "", membership, status };
}

function buildOwnerInsight({
  eventType,
  user = {},
  attribution = {},
  engagement = {},
  extras = {},
  businessImpact = null,
}) {
  const source = attribution.source || "";
  const lessons = Number(engagement.lessonPlansOpened || 0);
  const calendar = Number(engagement.calendarAssignments || 0);
  const total = Number(engagement.totalActions || 0);
  const plan = String(user.plan || extras.membership || "").toLowerCase();
  const isPro = plan.includes("pro") || plan.includes("founding") || Boolean(user.foundingMemberActive);
  const isFree = !isPro && !/trial/i.test(String(user.subscriptionStatus || ""));
  const lastSeenMs = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;
  const signupMs = user.signupAt || user.createdAt ? new Date(user.signupAt || user.createdAt).getTime() : 0;
  const hoursSinceSignup = signupMs && Number.isFinite(signupMs)
    ? (Date.now() - signupMs) / (60 * 60 * 1000)
    : null;
  const inactiveDays = lastSeenMs && Number.isFinite(lastSeenMs)
    ? (Date.now() - lastSeenMs) / (24 * 60 * 60 * 1000)
    : null;
  const impact = businessImpact || {};

  if (eventType === "support_request" || eventType === "Support Request") {
    if (isPro) return "This request came from a current Pro member.";
  }

  if (
    (eventType === "admin_subscription_canceled" || eventType === "subscription_ended")
    && total > 0
    && inactiveDays != null
    && inactiveDays >= 14
  ) {
    return "This member became inactive after previously using the platform.";
  }

  if (
    (eventType === "admin_new_signup" || eventType === "new_free_member")
    && Number(impact.signupsToday || 0) <= 1
    && source === "TikTok"
  ) {
    return "First member today from TikTok.";
  }

  if (
    (eventType === "admin_new_pro" || eventType === "admin_new_annual" || eventType === "new_pro_member"
      || eventType === "admin_new_founding" || eventType === "new_founding_member")
    && Number(impact.proSignupsLast3Days || 0) === 0
  ) {
    return "First Pro signup in 3 days.";
  }

  if (
    (eventType === "admin_new_signup" || eventType === "new_free_member" || isFree)
    && lessons >= 3
    && !membershipAccess.membershipUserInTrial(user)
    && !isPro
  ) {
    return "Member has viewed several premium lesson plans but has not started a trial.";
  }

  if (hoursSinceSignup != null && hoursSinceSignup <= 24 && total >= 8) {
    return "Highly engaged member during first 24 hours.";
  }

  if (
    (eventType === "admin_new_trial" || eventType === "trial_started")
    && lessons >= 2
    && calendar >= 1
  ) {
    return "This trial member has opened several lessons and assigned one to the calendar.";
  }

  if (source === "TikTok" && lessons === 0 && total === 0) {
    return "This member came from TikTok and has not opened a lesson plan yet.";
  }

  if (source && lessons === 0 && total === 0 && (eventType === "admin_new_signup" || eventType === "new_free_member")) {
    return `This member came from ${source} and has not opened a lesson plan yet.`;
  }

  if (total === 0 && lessons === 0) return INSIGHT_FALLBACK;
  if (lessons > 0 && calendar === 0) {
    return `This member has opened ${lessons} lesson plan${lessons === 1 ? "" : "s"} but has not assigned one to the calendar yet.`;
  }
  if (total > 0) {
    return `This member has ${total} tracked in-app action${total === 1 ? "" : "s"} so far.`;
  }
  return INSIGHT_FALLBACK;
}

function resolveEventType(opts = {}) {
  if (hasValue(opts.ownerEventType)) return String(opts.ownerEventType);
  if (hasValue(opts.alertType)) return String(opts.alertType);
  const kind = String(opts.kind || "").trim().toLowerCase();
  if (kind === "signup") return "admin_new_signup";
  if (kind === "bug report") return "bug_report";
  if (kind === "feature request") return "feature_request";
  if (kind === "feedback") return "feedback";
  if (kind === "member message") return "member_message";
  if (kind === "support request" || kind === "support") return "support_request";
  if (kind === "billing") {
    const topic = String(opts.topic || opts.title || "").toLowerCase();
    if (topic.includes("trial")) return "admin_new_trial";
    if (topic.includes("founding")) return "admin_new_founding";
    if (topic.includes("annual") || topic.includes("monthly") || topic.includes("pro")) return "admin_new_pro";
    if (topic.includes("cancel") || topic.includes("ended")) return "admin_subscription_canceled";
    if (topic.includes("payment failed") || topic.includes("failed")) return "admin_payment_failed";
    if (topic.includes("critical") || topic.includes("not restored") || topic.includes("no matching")) {
      return "admin_paid_access_not_restored";
    }
  }
  return kind || "owner_alert";
}

function membershipLengthLabel(user = {}) {
  const start = user.subscriptionStartedAt || user.firstPaidInvoiceAt || user.firstPaidAt || user.metaPurchaseAt || "";
  const end = user.accessEndsAt || user.currentPeriodEnd || user.lastFailedPaymentAt || "";
  if (!hasValue(start)) return "";
  const startMs = new Date(start).getTime();
  const endMs = hasValue(end) ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return "";
  const days = Math.max(0, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)));
  if (days < 31) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.max(1, Math.round(days / 30));
  return `${months} month${months === 1 ? "" : "s"}`;
}

function buildActionLinks(eventType, { siteUrl, email, refId, deepLink }) {
  const userUrl = adminLink(siteUrl, "users", { adminFocusEmail: email });
  const journeyUrl = adminLink(siteUrl, "users", { adminFocusEmail: email, adminUserTab: "journey" });
  const funnelUrl = adminLink(siteUrl, "marketing-funnel");
  const billingUrl = adminLink(siteUrl, "billing-home", { adminFocusEmail: email });
  const dashboardUrl = adminLink(siteUrl, "admin-home");
  const conversationUrl = deepLink && String(deepLink).includes("messages-conversations")
    ? absoluteAdminUrl(siteUrl, deepLink)
    : adminLink(siteUrl, "messages-conversations", { adminFocusConversation: email });

  switch (eventType) {
    case "admin_new_signup":
    case "new_free_member":
      return {
        primary: { label: "View User", url: userUrl },
        secondary: [
          { label: "View User Journey", url: journeyUrl },
          { label: "Open Marketing Funnel", url: funnelUrl },
        ],
      };
    case "admin_new_trial":
    case "trial_started":
      return {
        primary: { label: "View User", url: userUrl },
        secondary: [
          { label: "View User Journey", url: journeyUrl },
          { label: "Open Billing", url: billingUrl },
          { label: "Open Marketing Funnel", url: funnelUrl },
        ],
      };
    case "admin_new_pro":
    case "admin_new_annual":
    case "new_pro_member":
    case "admin_new_founding":
    case "new_founding_member":
      return {
        primary: { label: "View User", url: userUrl },
        secondary: [
          { label: "Open Billing", url: billingUrl },
          { label: "View User Journey", url: journeyUrl },
        ],
      };
    case "admin_subscription_canceled":
    case "subscription_ended":
      return {
        primary: { label: "View User", url: userUrl },
        secondary: [
          { label: "View User Journey", url: journeyUrl },
          { label: "Open Billing", url: billingUrl },
        ],
      };
    case "admin_payment_failed":
    case "payment_failed":
      return {
        primary: { label: "Open Billing", url: billingUrl },
        secondary: [
          { label: "View User", url: userUrl },
          { label: "View User Journey", url: journeyUrl },
        ],
      };
    case "admin_paid_access_not_restored":
    case "critical_billing_mismatch":
      return {
        primary: {
          label: "Open Admin Reconciliation",
          url: adminLink(siteUrl, "billing-home", { adminFocusEmail: email, adminFocusRef: refId }),
        },
        secondary: email
          ? [{ label: "View User", url: userUrl }, { label: "Open Billing", url: billingUrl }]
          : [{ label: "Open Billing", url: billingUrl }],
      };
    case "support_request":
    case "Support Request":
      return {
        primary: {
          label: "Open Support Ticket",
          url: adminLink(siteUrl, "support", { adminFocusRef: refId, adminFocusEmail: email }),
        },
        secondary: [
          ...(email ? [{ label: "Reply to Member", url: `mailto:${encodeURIComponent(email)}` }] : []),
          ...(email ? [{ label: "View User", url: userUrl }] : []),
        ],
      };
    case "feature_request":
    case "Feature Request":
      return {
        primary: {
          label: "Open Feature Requests",
          url: adminLink(siteUrl, "feature-requests", { adminFocusRef: refId }),
        },
        secondary: email ? [{ label: "View User", url: userUrl }] : [],
      };
    case "bug_report":
    case "Bug Report":
      return {
        primary: {
          label: "Open Bug Report",
          url: adminLink(siteUrl, "bug-reports", { adminFocusRef: refId }),
        },
        secondary: email ? [{ label: "View User", url: userUrl }] : [],
      };
    case "feedback":
    case "Feedback":
      return {
        primary: {
          label: "Open Feedback",
          url: adminLink(siteUrl, "feedback", { adminFocusRef: refId }),
        },
        secondary: email ? [{ label: "View User", url: userUrl }] : [],
      };
    case "member_message":
    case "Member Message":
      return {
        primary: { label: "Open Conversation", url: conversationUrl },
        secondary: email
          ? [{ label: "View User", url: userUrl }, { label: "View User Journey", url: journeyUrl }]
          : [],
      };
    default:
      return {
        primary: { label: "Open Admin Dashboard", url: dashboardUrl },
        secondary: email ? [{ label: "View User", url: userUrl }] : [],
      };
  }
}

function eventCopy(eventType, { name, email, topic, user = {}, fields = [], extras = {} }) {
  const who = name || email || "Member";
  switch (eventType) {
    case "admin_new_signup":
    case "new_free_member":
      return {
        subject: `🎉 New Free Member • ${who}`,
        title: "New Free Member",
        summary: "A new member created a Free account.",
        critical: false,
      };
    case "admin_new_trial":
    case "trial_started":
      return {
        subject: `⭐ Trial Started • ${who}`,
        title: "Trial Started",
        summary: "A Free member started a 7-day Pro trial.",
        critical: false,
      };
    case "admin_new_pro":
    case "admin_new_annual":
    case "new_pro_member":
      return {
        subject: `💜 New Pro Member • ${who}`,
        title: "New Pro Member",
        summary: "A member successfully subscribed to Pro.",
        critical: false,
      };
    case "admin_new_founding":
    case "new_founding_member":
      return {
        subject: `💜 New Founding Member • ${who}`,
        title: "New Founding Member",
        summary: "A founding membership was activated for an existing founding account path.",
        critical: false,
      };
    case "admin_subscription_canceled":
    case "subscription_ended":
      return {
        subject: `❌ Subscription Cancelled • ${who}`,
        title: "Subscription Cancelled",
        summary: "A member’s paid access ended.",
        critical: false,
      };
    case "admin_payment_failed":
    case "payment_failed":
      return {
        subject: `⚠️ Payment Failed • ${who}`,
        title: "Payment Failed",
        summary: "A payment could not be processed.",
        critical: false,
      };
    case "admin_paid_access_not_restored":
    case "critical_billing_mismatch": {
      const unmatched = (!findUserMatchHint(user, email) && !hasValue(email))
        || String(extras.mismatchKind || "").includes("unmatched");
      const criticalTitle = unmatched
        ? "Paid Customer Not Matched to Account"
        : "Paid Access Not Restored";
      return {
        subject: `🚨 ${criticalTitle}`,
        title: criticalTitle,
        summary: unmatched
          ? "Stripe reported a paid event that could not be matched to a local account."
          : "Stripe shows paid access, but the local account is not restored.",
        critical: true,
      };
    }
    case "support_request":
    case "Support Request":
      return {
        subject: `📩 New Support Request • ${topic || "General Questions"}`,
        title: "New Support Request",
        summary: "A member submitted a support or contact request.",
        critical: false,
      };
    case "feature_request":
    case "Feature Request":
      return {
        subject: `💡 Feature Request • ${topic || "Untitled"}`,
        title: "New Feature Request",
        summary: "A member submitted a feature request.",
        critical: false,
      };
    case "bug_report":
    case "Bug Report":
      return {
        subject: `🐞 New Bug Report • ${topic || "Untitled"}`,
        title: "New Bug Report",
        summary: "A member reported a bug.",
        critical: false,
      };
    case "feedback":
    case "Feedback":
      return {
        subject: `⭐ New Feedback • ${topic || "Feedback"}`,
        title: "New Feedback",
        summary: "A member submitted feedback or a review.",
        critical: false,
      };
    case "member_message":
    case "Member Message":
      return {
        subject: `💬 New Member Message • ${name || email || "Member"}`,
        title: "New Member Message",
        summary: "A member sent a message in the admin inbox.",
        critical: false,
      };
    default:
      return {
        subject: `[${BRAND}] ${optsTopicFallback(topic, fields, who)}`,
        title: String(topic || "Owner Alert"),
        summary: String(extras.summary || "An owner notification event occurred."),
        critical: false,
      };
  }
}

function findUserMatchHint(user, email) {
  return Boolean(user && (user.email || email));
}

function optsTopicFallback(topic, fields, who) {
  return topic || fieldFromPairs(fields, "Type") || who || "Owner alert";
}

function detailRowsForEvent(eventType, {
  user = {},
  fields = [],
  extras = {},
  message = "",
  topic = "",
  sourceUrl = "",
  environment = "Test",
}) {
  const fromFields = (Array.isArray(fields) ? fields : [])
    .filter((pair) => Array.isArray(pair) && hasValue(pair[0]) && hasValue(pair[1]));

  const common = [];

  if (eventType === "admin_new_trial" || eventType === "trial_started") {
    common.push(
      ["Trial start", formatOwnerDate(extras.trialStart || user.trialStart || user.trialStartedAt || user.metaStartTrialAt || "")],
      ["Trial end", formatOwnerDate(extras.trialEnd || user.trialEnd || "")],
      ["Current plan", extras.plan || fieldFromPairs(fields, "Plan") || membershipLabel(user) || "Pro Trial"],
    );
  }

  if (eventType === "admin_new_pro" || eventType === "admin_new_annual" || eventType === "new_pro_member") {
    const cadence = extras.billingFrequency
      || user.subscriptionCadence
      || (eventType === "admin_new_annual" ? "annual" : "monthly");
    common.push(
      ["Plan", extras.plan || fieldFromPairs(fields, "Plan") || user.planDisplayName || user.plan || "Pro"],
      ["Billing frequency", cadence],
      ["Amount", extras.amount || user.monthlyPrice || ""],
      ["Subscription status", extras.subscriptionStatus || user.subscriptionStatus || user.stripeSubscriptionStatus || ""],
      ["Next renewal", formatOwnerDate(extras.nextRenewal || user.currentPeriodEnd || "")],
    );
  }

  if (eventType === "admin_new_founding" || eventType === "new_founding_member") {
    common.push(
      ["Founding status", "Founding Member"],
      ["Billing", extras.amount || user.monthlyPrice || "$9.99/month"],
      ["Price lock", user.priceLock || "Lifetime"],
      ["Founding number", user.foundingMemberNumber || ""],
      ["Subscription status", user.subscriptionStatus || ""],
    );
  }

  if (eventType === "admin_subscription_canceled" || eventType === "subscription_ended") {
    common.push(
      ["Previous plan", extras.previousPlan || user.previousPlan || user.planDisplayName || ""],
      ["Subscription status", extras.subscriptionStatus || user.subscriptionStatus || "ended"],
      ["Effective end date", formatOwnerDate(extras.endDate || user.accessEndsAt || user.currentPeriodEnd || "")],
      ["Membership length", membershipLengthLabel(user)],
      ["Last login", formatOwnerDate(user.lastLoginAt || "")],
      ["Cancellation reason", extras.cancellationReason || user.cancellationReason || ""],
    );
  }

  if (eventType === "admin_payment_failed" || eventType === "payment_failed") {
    common.push(
      ["Plan", extras.plan || user.previousPlan || "Pro"],
      ["Amount", extras.amount || user.monthlyPrice || ""],
      ["Invoice ID", extras.invoiceId || fieldFromPairs(fields, "Invoice") || ""],
      ["Current access status", extras.accessStatus || user.subscriptionStatus || "Billing Review Required — Access Locked"],
      ["Retry information", extras.retryAt ? `Next retry: ${formatOwnerDate(extras.retryAt)}` : (user.nextPaymentRetryAt ? `Next retry: ${formatOwnerDate(user.nextPaymentRetryAt)}` : "")],
    );
  }

  if (eventType === "admin_paid_access_not_restored" || eventType === "critical_billing_mismatch") {
    common.push(
      ["Customer email", extras.customerEmail || user.email || ""],
      ["Invoice / subscription ID", extras.invoiceId || extras.subscriptionId || fieldFromPairs(fields, "Invoice") || ""],
      ["Local account match status", extras.matchStatus || (user?.email ? "Matched local account" : "No matching local account")],
      ["Current membership state", extras.membershipState || user.plan || "Free / unknown"],
      ["Exact mismatch", extras.mismatch || extras.preview || ""],
      ["Recommended admin action", extras.recommendedAction || "Open Admin Reconciliation, compare Stripe vs local membership, and restore access only after verifying payment."],
      ["Environment", environment],
    );
  }

  if (eventType === "support_request" || eventType === "Support Request") {
    common.push(
      ["Topic", topic],
      ["Page submitted from", sourceUrl || extras.page || ""],
      ["Device/browser", extras.userAgent || fieldFromPairs(fields, "Device/Browser") || ""],
    );
  }

  if (eventType === "feature_request" || eventType === "Feature Request") {
    common.push(
      ["Request title", topic],
      ["Category", extras.category || fieldFromPairs(fields, "Category") || ""],
      ["Age group", extras.ageGroup || fieldFromPairs(fields, "Age Group") || ""],
    );
  }

  if (eventType === "bug_report" || eventType === "Bug Report") {
    const screenshotNote = hasValue(extras.screenshotUrl) || hasValue(fieldFromPairs(fields, "Screenshot"))
      ? "Attached — open Bug Report in Admin (URL not emailed for access control)."
      : "";
    common.push(
      ["Category", extras.category || fieldFromPairs(fields, "Category") || ""],
      ["Page", sourceUrl || extras.page || ""],
      ["Device", extras.deviceInfo || extras.device || ""],
      ["Browser", extras.browserInfo || extras.browser || ""],
      ["Screenshot", screenshotNote],
      ["Environment", environment],
    );
  }

  if (eventType === "feedback" || eventType === "Feedback") {
    common.push(
      ["Star rating", extras.stars || fieldFromPairs(fields, "Stars") || ""],
      ["Sentiment", extras.sentiment || fieldFromPairs(fields, "Sentiment") || ""],
      ["Feedback type", extras.feedbackType || fieldFromPairs(fields, "Feedback Type") || ""],
      ["Lesson or activity", extras.lessonOrActivity || fieldFromPairs(fields, "Lesson ID") || fieldFromPairs(fields, "Activity ID") || ""],
      ["Page", sourceUrl || extras.page || fieldFromPairs(fields, "Page") || ""],
    );
  }

  if (eventType === "member_message" || eventType === "Member Message") {
    common.push(
      ["Program", extras.programName || user.programName || user.businessName || ""],
      ["Time", formatOwnerDate(extras.createdAt || "")],
      ["Message preview", clampText(message, 160)],
    );
  }

  if (eventType === "admin_new_signup" || eventType === "new_free_member") {
    common.push(
      ["Account type", extras.accountType || fieldFromPairs(fields, "Account type") || (user.accountType ? accountAccess.accountTypeLabel(user.accountType) : "")],
      ["Role", extras.role || fieldFromPairs(fields, "Role") || (user.role ? accountAccess.roleLabel(user.role) : "")],
      ["Signup timestamp", formatOwnerDate(extras.signupAt || user.signupAt || user.createdAt || "")],
    );
  }

  const merged = [...common, ...fromFields]
    .filter(([, value]) => hasValue(value))
    .reduce((acc, [label, value]) => {
      if (acc.some((row) => row[0] === label)) return acc;
      acc.push([label, value]);
      return acc;
    }, []);

  if (hasValue(message)
    && !["member_message", "Member Message"].includes(eventType)
  ) {
    // Full message rendered in dedicated block; keep out of detail rows unless critical ops.
  }

  return merged;
}

function rowsToHtml(rows) {
  if (!rows.length) return "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0;">
      ${rows.map(([label, value]) => `
        <tr>
          <td style="padding:6px 0;width:42%;vertical-align:top;color:#5b6472;font-size:13px;line-height:1.4;">${escapeHtml(label)}</td>
          <td style="padding:6px 0;vertical-align:top;color:#15202b;font-size:13px;line-height:1.4;font-weight:600;">${escapeHtml(String(value))}</td>
        </tr>
      `).join("")}
    </table>
  `.trim();
}

function rowsToText(rows) {
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function sectionHtml(title, bodyHtml, { highlight = false, critical = false } = {}) {
  if (!bodyHtml) return "";
  const border = critical ? "#b42318" : (highlight ? "#2f6f5e" : "#e5e7eb");
  const bg = critical ? "#fff5f5" : (highlight ? "#f3faf7" : "#ffffff");
  return `
    <div style="margin:0 0 16px;padding:14px 16px;border:1px solid ${border};border-radius:10px;background:${bg};">
      <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${critical ? "#b42318" : "#2f6f5e"};font-weight:700;">${escapeHtml(title)}</p>
      ${bodyHtml}
    </div>
  `.trim();
}

function renderOwnerShell({
  title,
  summary,
  environment,
  timestamp,
  priority,
  memberSummaryHtml,
  businessImpactHtml,
  recentActivityHtml,
  attributionHtml,
  engagementHtml,
  insightHtml,
  detailsHtml,
  messageHtml,
  primaryAction,
  secondaryActions = [],
  critical = false,
}) {
  const envColor = environment === "Production" ? "#b42318" : "#8a7048";
  const priorityMeta = priority || PRIORITY.information;
  const primary = primaryAction && primaryAction.url
    ? `<a href="${escapeHtml(primaryAction.url)}" style="display:inline-block;background:${critical ? "#b42318" : "#2f6f5e"};color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px;font-weight:700;">${escapeHtml(primaryAction.label || "Open")}</a>`
    : "";
  const secondary = (secondaryActions || [])
    .filter((action) => action && action.url && action.label)
    .map((action) => `<a href="${escapeHtml(action.url)}" style="color:#2f6f5e;font-size:13px;margin-right:14px;">${escapeHtml(action.label)}</a>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f0;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(priorityMeta.emoji)} ${escapeHtml(priorityMeta.label)} · ${escapeHtml(summary)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f0;padding:20px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #d9e2dc;">
          <tr>
            <td style="padding:12px 22px 0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
              <span style="display:inline-block;padding:5px 10px;border-radius:999px;background:${priorityMeta.bg};border:1px solid ${priorityMeta.border};color:${priorityMeta.color};font-size:12px;font-weight:700;line-height:1.3;">
                ${escapeHtml(priorityMeta.emoji)} ${escapeHtml(priorityMeta.label)}
              </span>
            </td>
          </tr>
          <tr>
            <td style="background:linear-gradient(135deg,#1f4f43 0%,#2f6f5e 55%,#3d8b74 100%);padding:18px 22px;color:#ffffff;">
              <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.9;">${escapeHtml(BRAND)}</p>
              <h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;font-family:Georgia,'Times New Roman',serif;font-weight:700;">${escapeHtml(title)}</h1>
              <p style="margin:0;font-size:14px;line-height:1.5;opacity:0.95;">${escapeHtml(summary)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 22px;background:#f7faf8;border-bottom:1px solid #e5eee9;">
              <p style="margin:0;font-size:12px;color:#5b6472;">
                <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#ffffff;border:1px solid #d9e2dc;color:${envColor};font-weight:700;margin-right:8px;">${escapeHtml(environment)}</span>
                ${escapeHtml(timestamp)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 22px 8px;font-family:Arial,Helvetica,sans-serif;color:#15202b;">
              ${memberSummaryHtml || ""}
              ${businessImpactHtml || ""}
              ${recentActivityHtml || ""}
              ${attributionHtml || ""}
              ${engagementHtml || ""}
              ${insightHtml || ""}
              ${detailsHtml || ""}
              ${messageHtml || ""}
              <div style="margin:22px 0 10px;">${primary}</div>
              ${secondary ? `<div style="margin:0 0 8px;line-height:1.8;">${secondary}</div>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 22px 22px;border-top:1px solid #e5eee9;background:#fbfcfc;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">
                Owner/admin notification for ${escapeHtml(BRAND)}. Use secure admin routes only — do not forward as a customer email.
                Support inbox routing and reply-to are preserved where configured.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildPlainText({
  title,
  summary,
  environment,
  timestamp,
  priority,
  memberRows,
  businessImpactRows,
  recentActivityRows,
  attributionRows,
  engagementRows,
  insight,
  detailRows,
  message,
  primaryAction,
  secondaryActions,
}) {
  const priorityMeta = priority || PRIORITY.information;
  const lines = [
    BRAND,
    `${priorityMeta.emoji} ${priorityMeta.label}`,
    title,
    summary,
    "",
    `Environment: ${environment}`,
    `Timestamp: ${timestamp}`,
  ];
  if (memberRows?.length) {
    lines.push("", "Member Summary", rowsToText(memberRows));
  }
  if (businessImpactRows?.length) {
    lines.push("", "Business Impact", rowsToText(businessImpactRows));
  }
  if (recentActivityRows?.length) {
    lines.push("", "Recent Activity", rowsToText(recentActivityRows));
  } else if (recentActivityRows) {
    lines.push("", "Recent Activity", RECENT_ACTIVITY_EMPTY);
  }
  if (attributionRows?.length) {
    lines.push("", "Marketing Attribution", rowsToText(attributionRows));
  }
  if (engagementRows?.length) {
    lines.push("", "Engagement Snapshot", rowsToText(engagementRows));
  } else if (engagementRows) {
    lines.push("", "Engagement Snapshot", ENGAGEMENT_EMPTY);
  }
  if (insight) {
    lines.push("", "AI Owner Insight", insight);
  }
  if (detailRows?.length) {
    lines.push("", "Event Details", rowsToText(detailRows));
  }
  if (hasValue(message)) {
    lines.push("", "Message", String(message));
  }
  if (primaryAction?.url) {
    lines.push("", `${primaryAction.label}: ${primaryAction.url}`);
  }
  (secondaryActions || []).forEach((action) => {
    if (action?.url) lines.push(`${action.label}: ${action.url}`);
  });
  lines.push("", "— Owner/admin notification · Little Learner Hub");
  return lines.filter((line, index, arr) => !(line === "" && arr[index - 1] === "")).join("\n");
}

/**
 * Build a complete owner notification email payload.
 * @param {object} opts
 * @param {object} [opts.store]
 * @param {string} [opts.siteUrl]
 * @param {object} [opts.env]
 */
function buildOwnerNotification(opts = {}) {
  const env = opts.env || process.env;
  const environment = resolveEnvironmentLabel(env);
  const siteUrl = String(opts.siteUrl || env.SITE_URL || "").replace(/\/$/, "");
  const eventType = resolveEventType(opts);
  const email = normalizeEmail(opts.email || opts.userEmail || "");
  let user = opts.user || null;
  if (!user && opts.store && email) {
    try { user = findUser(opts.store, email); } catch { user = null; }
  }
  user = user || {};

  const pickExtra = (...candidates) => {
    for (const value of candidates) {
      if (hasValue(value)) return value;
    }
    return "";
  };
  const extras = {
    ...(opts.extras || {}),
    accountType: pickExtra(opts.extras?.accountType, fieldFromPairs(opts.fields, "Account type"), fieldFromPairs(opts.fields, "Account Type")),
    role: pickExtra(opts.extras?.role, fieldFromPairs(opts.fields, "Role")),
    plan: pickExtra(opts.extras?.plan, fieldFromPairs(opts.fields, "Plan")),
    invoiceId: pickExtra(opts.extras?.invoiceId, fieldFromPairs(opts.fields, "Invoice")),
    userAgent: pickExtra(opts.extras?.userAgent, fieldFromPairs(opts.fields, "Device/Browser"), opts.submission?.userAgent),
    page: pickExtra(opts.sourceUrl, opts.extras?.page),
    createdAt: pickExtra(opts.createdAt, opts.extras?.createdAt),
    category: pickExtra(opts.extras?.category, fieldFromPairs(opts.fields, "Category")),
    ageGroup: pickExtra(opts.extras?.ageGroup, fieldFromPairs(opts.fields, "Age Group")),
    stars: pickExtra(opts.extras?.stars, fieldFromPairs(opts.fields, "Stars")),
    sentiment: pickExtra(opts.extras?.sentiment, fieldFromPairs(opts.fields, "Sentiment")),
    feedbackType: pickExtra(opts.extras?.feedbackType, fieldFromPairs(opts.fields, "Feedback Type")),
    screenshotUrl: pickExtra(opts.extras?.screenshotUrl, opts.submission?.screenshotUrl),
    deviceInfo: pickExtra(opts.extras?.deviceInfo, opts.submission?.deviceInfo),
    browserInfo: pickExtra(opts.extras?.browserInfo, opts.submission?.browserInfo),
    preview: pickExtra(opts.preview, opts.message, opts.extras?.preview),
    mismatch: pickExtra(opts.extras?.mismatch, opts.preview, opts.message),
    customerEmail: pickExtra(opts.extras?.customerEmail, email),
    mismatchKind: pickExtra(opts.extras?.mismatchKind),
    lessonOrActivity: pickExtra(
      opts.extras?.lessonOrActivity,
      fieldFromPairs(opts.fields, "Lesson ID"),
      fieldFromPairs(opts.fields, "Activity ID"),
    ),
  };

  // Critical unmatched paid invoice: no local user
  if (eventType === "admin_paid_access_not_restored" && !user.email && !email) {
    extras.mismatchKind = extras.mismatchKind || "unmatched";
    extras.matchStatus = "No matching local account";
  } else if (eventType === "admin_paid_access_not_restored" && email && (!user.email || String(user.plan || "Free") === "Free")) {
    extras.matchStatus = user.email ? "Matched local account (membership Free / not restored)" : "Email present but account incomplete";
    extras.membershipState = user.plan || "Free";
  }

  let businessImpact = { rows: [], present: false };
  try {
    if (opts.store && MEMBERSHIP_EVENT_TYPES.has(eventType)) {
      businessImpact = buildBusinessImpactSnapshot(opts.store, { excludeEmail: email });
    }
  } catch {
    businessImpact = { rows: [], present: false };
  }

  const engagement = buildEngagementSnapshot(user);
  const recentActivity = (user.email || email)
    ? buildRecentActivity({ ...user, email: user.email || email }, opts.store)
    : { rows: [], empty: true };
  const attribution = buildAttribution(user, extras);
  const member = buildMemberSummary({
    eventType,
    user,
    email,
    extras,
    engagement,
  });
  const name = opts.name || member.name || email;
  const topic = String(opts.topic || opts.title || "").trim();
  const copy = eventCopy(eventType, {
    name,
    email,
    topic,
    user,
    fields: opts.fields,
    extras,
  });
  if (!copy.title) copy.title = topic || "Owner Alert";
  const priority = resolvePriority(eventType);

  const insight = [
    "admin_new_signup", "new_free_member",
    "admin_new_trial", "trial_started",
    "admin_new_pro", "admin_new_annual", "new_pro_member",
    "admin_new_founding", "new_founding_member",
    "admin_subscription_canceled", "subscription_ended",
    "support_request", "Support Request",
    "feature_request", "Feature Request",
    "bug_report", "Bug Report",
    "feedback", "Feedback",
    "member_message", "Member Message",
  ].includes(eventType)
    ? buildOwnerInsight({
      eventType,
      user,
      attribution,
      engagement,
      extras,
      businessImpact,
    })
    : "";

  const showInsight = Boolean(insight);
  const isCriticalBilling = [
    "admin_paid_access_not_restored",
    "critical_billing_mismatch",
  ].includes(eventType);
  const showMember = member.rows.length > 0
    && (!isCriticalBilling || Boolean(email && user.email));
  const showBusinessImpact = MEMBERSHIP_EVENT_TYPES.has(eventType) && businessImpact.present;
  // Include signup events — usually empty → "No activity yet."
  const showRecentActivityIncludingSignup = !isCriticalBilling && Boolean(user.email || email);
  const showAttribution = attribution.present && !isCriticalBilling;
  const showEngagement = !isCriticalBilling;

  const detailRows = detailRowsForEvent(eventType, {
    user,
    fields: opts.fields,
    extras,
    message: opts.message,
    topic,
    sourceUrl: opts.sourceUrl,
    environment,
  });

  const actions = buildActionLinks(eventType, {
    siteUrl,
    email,
    refId: opts.refId || opts.submission?.id || "",
    deepLink: opts.deepLink || "",
  });

  const timestamp = formatOwnerDate(opts.createdAt || new Date().toISOString());
  const messageBody = hasValue(opts.message)
    && !["admin_paid_access_not_restored", "critical_billing_mismatch"].includes(eventType)
    ? opts.message
    : "";

  const memberSummaryHtml = showMember
    ? sectionHtml("Member Summary", rowsToHtml(member.rows), { highlight: true })
    : "";
  const businessImpactHtml = showBusinessImpact
    ? sectionHtml("Business Impact", rowsToHtml(businessImpact.rows))
    : "";
  const recentActivityHtml = showRecentActivityIncludingSignup
    ? sectionHtml(
      "Recent Activity",
      recentActivity.empty || !recentActivity.rows.length
        ? `<p style="margin:0;font-size:13px;color:#5b6472;">${escapeHtml(RECENT_ACTIVITY_EMPTY)}</p>`
        : rowsToHtml(recentActivity.rows),
    )
    : "";
  const attributionHtml = showAttribution
    ? sectionHtml("Marketing Attribution", rowsToHtml(attribution.rows))
    : "";
  const engagementHtml = showEngagement
    ? sectionHtml(
      "Engagement Snapshot",
      engagement.empty
        ? `<p style="margin:0;font-size:13px;color:#5b6472;">${escapeHtml(ENGAGEMENT_EMPTY)}</p>`
        : rowsToHtml(engagement.rows),
    )
    : "";
  const insightHtml = showInsight
    ? sectionHtml("AI Owner Insight", `<p style="margin:0;font-size:14px;line-height:1.5;color:#15202b;">${escapeHtml(insight)}</p>`)
    : "";
  const detailsHtml = detailRows.length
    ? sectionHtml("Event Details", rowsToHtml(detailRows), { critical: copy.critical })
    : "";
  const messageHtml = hasValue(messageBody)
    ? sectionHtml(
      eventType.includes("message") ? "Message Preview" : "Full Message",
      `<p style="margin:0;font-size:14px;line-height:1.55;color:#15202b;white-space:pre-wrap;">${escapeHtml(String(messageBody))}</p>`,
      { critical: copy.critical },
    )
    : "";

  const html = renderOwnerShell({
    title: copy.title,
    summary: copy.summary,
    environment,
    timestamp,
    priority,
    memberSummaryHtml,
    businessImpactHtml,
    recentActivityHtml,
    attributionHtml,
    engagementHtml,
    insightHtml,
    detailsHtml,
    messageHtml,
    primaryAction: actions.primary,
    secondaryActions: actions.secondary,
    critical: copy.critical,
  });

  const text = buildPlainText({
    title: copy.title,
    summary: copy.summary,
    environment,
    timestamp,
    priority,
    memberRows: showMember ? member.rows : [],
    businessImpactRows: showBusinessImpact ? businessImpact.rows : [],
    recentActivityRows: showRecentActivityIncludingSignup
      ? (recentActivity.empty || !recentActivity.rows.length ? [] : recentActivity.rows)
      : null,
    attributionRows: showAttribution ? attribution.rows : [],
    engagementRows: showEngagement ? (engagement.empty ? [] : engagement.rows) : null,
    insight: showInsight ? insight : "",
    detailRows,
    message: messageBody,
    primaryAction: actions.primary,
    secondaryActions: actions.secondary,
  });

  return {
    subject: clampText(copy.subject, 500),
    text,
    html,
    meta: {
      eventType,
      environment,
      critical: copy.critical,
      priority,
      primaryAction: actions.primary,
      secondaryActions: actions.secondary,
      insight,
      memberRows: member.rows,
      attributionRows: attribution.rows,
      engagementEmpty: engagement.empty,
      businessImpactRows: businessImpact.rows,
      recentActivityEmpty: recentActivity.empty,
    },
  };
}

module.exports = {
  BRAND,
  INSIGHT_FALLBACK,
  ENGAGEMENT_EMPTY,
  RECENT_ACTIVITY_EMPTY,
  PRIORITY,
  escapeHtml,
  normalizeEmail,
  hasValue,
  resolveEnvironmentLabel,
  formatOwnerDate,
  normalizeSourceLabel,
  detectDevice,
  buildEngagementSnapshot,
  buildBusinessImpactSnapshot,
  buildRecentActivity,
  buildAttribution,
  buildMemberSummary,
  buildOwnerInsight,
  buildActionLinks,
  resolvePriority,
  resolveEventType,
  buildOwnerNotification,
  renderOwnerShell,
};
