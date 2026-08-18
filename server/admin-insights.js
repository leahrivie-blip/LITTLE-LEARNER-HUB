/**
 * Admin Dashboard 2.0 — read-only insights derived from existing store + analytics.
 * No pricing/membership/Stripe/auth changes. Safe to call from admin APIs only.
 */

const testAccountGuard = require("./test-account-guard.js");

const HUBS = Object.freeze([
  "advisor",
  "marketing-funnel",
  "feature-usage",
  "user-journey",
  "feature-requests",
  "error-center",
  "search-analytics",
  "email-analytics",
  "seo-dashboard",
  "churn-dashboard",
  "content-health",
  "release-center",
]);

const FUNNEL_SOURCES = Object.freeze(["TikTok", "Facebook", "Google", "Direct", "Organic", "Other"]);
/**
 * role:
 * - required: core conversion path used for drop-off recommendations
 * - supporting: useful funnel detail; can still contribute to Why They Left
 * - optional: informational unless product config requires it (email verify)
 * - snapshot: current-state metric, never an exit edge
 */
const FUNNEL_STAGE_DEFS = Object.freeze([
  { id: "visitors", label: "Visitors", role: "required" },
  { id: "landingPageViews", label: "Landing page views", role: "supporting" },
  { id: "ctaClicks", label: "CTA clicks", role: "supporting" },
  { id: "signupStarts", label: "Signup started", role: "required" },
  { id: "signupCompletions", label: "Signup completed", role: "required" },
  { id: "emailVerified", label: "Email verified", role: "optional" },
  { id: "trialStarts", label: "Trial started", role: "required" },
  { id: "trialEnded", label: "Trial ended", role: "optional" },
  { id: "paidConversions", label: "Converted to paid", role: "required" },
  { id: "activeSubscribers", label: "Active subscribers", role: "snapshot" },
]);

/** Advisor focuses on these required edges (skips optional/supporting noise). */
const ADVISOR_FUNNEL_EDGES = Object.freeze([
  { from: "visitors", to: "signupStarts", label: "Visitor → Signup started" },
  { from: "signupStarts", to: "signupCompletions", label: "Signup started → Signup completed" },
  { from: "signupCompletions", to: "trialStarts", label: "Signup completed → Trial started" },
  { from: "trialStarts", to: "paidConversions", label: "Trial started → Paid" },
]);

function isEmailVerificationRequired(store = {}, env = process.env) {
  const flag = String(
    env.EMAIL_VERIFICATION_REQUIRED
    || env.REQUIRE_EMAIL_VERIFICATION
    || store?.siteContent?.auth?.emailVerificationRequired
    || store?.settings?.emailVerificationRequired
    || "",
  ).trim().toLowerCase();
  if (["true", "1", "yes", "required", "on"].includes(flag)) return true;
  if (["false", "0", "no", "optional", "off"].includes(flag)) return false;
  // Product default: email verification is optional for onboarding.
  return false;
}

function resolveFunnelStageRole(def, emailVerificationRequired = false) {
  if (!def) return "supporting";
  if (def.id === "emailVerified") return emailVerificationRequired ? "required" : "optional";
  return def.role || "supporting";
}

function isActionableFunnelStage(def, emailVerificationRequired = false) {
  const role = resolveFunnelStageRole(def, emailVerificationRequired);
  return role === "required" || role === "supporting";
}

function isOptionalFunnelStage(def, emailVerificationRequired = false) {
  return resolveFunnelStageRole(def, emailVerificationRequired) === "optional";
}

function nextActionableStageDef(fromIndex, emailVerificationRequired = false) {
  for (let i = fromIndex + 1; i < FUNNEL_STAGE_DEFS.length; i += 1) {
    const def = FUNNEL_STAGE_DEFS[i];
    if (resolveFunnelStageRole(def, emailVerificationRequired) === "snapshot") continue;
    if (isOptionalFunnelStage(def, emailVerificationRequired)) continue;
    return def;
  }
  return null;
}

const RANGES = Object.freeze(["today", "7d", "30d", "all"]);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseRange(range = "7d") {
  const key = RANGES.includes(String(range || "").toLowerCase()) ? String(range).toLowerCase() : "7d";
  if (key === "all") return { key, startMs: 0 };
  const now = Date.now();
  if (key === "today") {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return { key, startMs: d.getTime() };
  }
  const days = key === "30d" ? 30 : 7;
  return { key, startMs: now - days * 24 * 60 * 60 * 1000 };
}

function eventTime(event) {
  const ts = new Date(event?.createdAt || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function inRange(event, startMs) {
  if (!startMs) return true;
  return eventTime(event) >= startMs;
}

function countBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function rate(part, whole) {
  if (!whole) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function detectDevice(ua = "") {
  const value = String(ua || "");
  if (/iPad|Tablet/i.test(value)) return "Tablet";
  if (/Mobi|Android|iPhone/i.test(value)) return "Mobile";
  if (!value) return "Unknown";
  return "Desktop";
}

function detectBrowser(ua = "") {
  const value = String(ua || "");
  if (/Edg\//i.test(value)) return "Edge";
  if (/Chrome\//i.test(value) && !/Edg\//i.test(value)) return "Chrome";
  if (/Safari\//i.test(value) && !/Chrome\//i.test(value)) return "Safari";
  if (/Firefox\//i.test(value)) return "Firefox";
  return value ? "Other" : "Unknown";
}

function pageLabel(event) {
  const view = event?.detail?.view || event?.hash || event?.path || "/";
  return String(view).replace(/^#/, "") || "/";
}

function contentTitle(event) {
  return event?.detail?.title
    || event?.detail?.resourceId
    || event?.detail?.lessonId
    || event?.detail?.activityId
    || event?.detail?.category
    || event?.name
    || "Untitled";
}

function isLessonView(event) {
  if (!event) return false;
  if (["lesson_plan_view", "curriculum_lesson_view"].includes(event.name)) return true;
  if (event.name !== "resource_view") return false;
  return String(event.detail?.category || "").toLowerCase().includes("lesson");
}

function isActivityView(event) {
  if (!event) return false;
  if (event.name === "resource_view") {
    return String(event.detail?.category || "").toLowerCase().includes("activit");
  }
  return false;
}

function isDownload(event) {
  return [
    "resource_pdf_download",
    "resource_docx_download",
    "resource_download",
    "lesson_docx_download",
    "generated_pdf",
    "provider_tool_pdf",
  ].includes(event?.name);
}

function isPrint(event) {
  return ["resource_print", "generated_print", "provider_tool_pdf"].includes(event?.name);
}

function sessionBuckets(events) {
  const bySession = new Map();
  for (const event of events) {
    const sid = event.sessionId || event.visitorId || "";
    if (!sid) continue;
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid).push(event);
  }
  const lengthsMin = [];
  const dropOff = new Map();
  for (const list of bySession.values()) {
    const sorted = list.slice().sort((a, b) => eventTime(a) - eventTime(b));
    if (sorted.length < 2) {
      const last = pageLabel(sorted[0] || {});
      dropOff.set(last, (dropOff.get(last) || 0) + 1);
      continue;
    }
    const start = eventTime(sorted[0]);
    const end = eventTime(sorted[sorted.length - 1]);
    if (end >= start) lengthsMin.push((end - start) / 60000);
    const last = pageLabel(sorted[sorted.length - 1]);
    dropOff.set(last, (dropOff.get(last) || 0) + 1);
  }
  const avgSessionMinutes = lengthsMin.length
    ? Number((lengthsMin.reduce((a, b) => a + b, 0) / lengthsMin.length).toFixed(2))
    : 0;
  return {
    avgSessionMinutes,
    sessionCount: bySession.size,
    dropOffPoints: [...dropOff.entries()]
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  };
}

function filterEvents(events, startMs) {
  return (events || []).filter((event) => inRange(event, startMs));
}

function buildFeatureUsage(store, events, range) {
  const scoped = filterEvents(events, range.startMs);
  const pageViews = scoped.filter((e) => e.name === "page_view" || e.name === "website_visit");
  const pages = countBy(pageViews, pageLabel);
  const mostUsedPages = pages.slice(0, 15);
  const leastUsedPages = pages.slice().sort((a, b) => a.count - b.count).slice(0, 15);
  const sessions = sessionBuckets(scoped);
  const featureEvents = scoped.filter((e) => ![
    "website_visit", "page_view", "ad_route_visit",
  ].includes(e.name));
  const mostUsedFeatures = countBy(featureEvents, (e) => e.name).slice(0, 20);
  const searchEvents = scoped.filter((e) => e.name === "search_query" || e.name === "search_no_results");
  const noResultSearches = countBy(
    searchEvents.filter((e) => e.name === "search_no_results" || e.detail?.results === 0),
    (e) => String(e.detail?.query || e.detail?.term || "").trim().toLowerCase(),
  ).slice(0, 20);
  const lessonViews = countBy(scoped.filter(isLessonView), contentTitle).slice(0, 15);
  const activityViews = countBy(scoped.filter(isActivityView), contentTitle).slice(0, 15);
  const downloads = countBy(scoped.filter(isDownload), contentTitle).slice(0, 15);
  const prints = countBy(scoped.filter(isPrint), contentTitle).slice(0, 15);
  const favoriteEvents = scoped.filter((e) => e.name === "favorite_add" || e.name === "resource_favorite");
  const favorites = countBy(favoriteEvents, contentTitle).slice(0, 15);
  // Library search emits search_query / search_no_results (trackLibrarySearchAnalytics).
  // Zero events in-range means empty period — not missing instrumentation.
  const searchInstrumentation = searchEvents.length > 0 ? "live" : "active_empty";

  return {
    range: range.key,
    mostUsedPages,
    leastUsedPages,
    avgSessionMinutes: sessions.avgSessionMinutes,
    sessionCount: sessions.sessionCount,
    dropOffPoints: sessions.dropOffPoints,
    mostUsedFeatures,
    searchNoResults: noResultSearches,
    searchInstrumentation,
    mostFavorited: favorites,
    favoritesInstrumentation: favoriteEvents.length > 0 ? "live" : "pending",
    mostDownloaded: downloads,
    mostPrinted: prints,
    mostViewedLessons: lessonViews,
    mostViewedActivities: activityViews,
    totals: {
      pageViews: pageViews.length,
      featureEvents: featureEvents.length,
    },
  };
}

function buildUserJourney(store, email, events = []) {
  const clean = normalizeEmail(email);
  const user = store.users?.[clean] || Object.values(store.users || {}).find((u) => normalizeEmail(u.email) === clean) || null;
  if (!user) {
    return { found: false, email: clean, timeline: [] };
  }
  const attr = user.attribution && typeof user.attribution === "object" ? user.attribution : {};
  const userEvents = (events || [])
    .filter((e) => normalizeEmail(e.user) === clean)
    .sort((a, b) => eventTime(a) - eventTime(b));
  const firstVisitEvent = userEvents.find((e) => e.name === "website_visit" || e.name === "page_view") || null;
  const lastEvent = userEvents[userEvents.length - 1] || null;
  const lastFeature = [...userEvents].reverse().find((e) => !["website_visit", "page_view"].includes(e.name)) || null;
  const ua = lastEvent?.userAgent || firstVisitEvent?.userAgent || "";

  const milestones = [
    { id: "first_visit", label: "First website visit", at: attr.firstSeenAt || firstVisitEvent?.createdAt || "", detail: attr.landingPage || firstVisitEvent?.path || "" },
    { id: "referral", label: "Referral source", at: attr.capturedAt || attr.firstSeenAt || "", detail: [attr.source, attr.medium, attr.campaign].filter(Boolean).join(" · ") || "Unknown" },
    { id: "landing", label: "Landing page", at: attr.firstSeenAt || "", detail: attr.landingPage || firstVisitEvent?.path || "/" },
    { id: "signup", label: "Signup date", at: user.signupAt || user.createdAt || "", detail: user.plan || "Free" },
    { id: "trial", label: "Trial start", at: user.metaStartTrialAt || user.trialStart || user.trialStartedAt || "", detail: user.trialEnd ? `Ends ${user.trialEnd}` : "" },
    { id: "paid", label: "Upgrade to paid", at: user.metaPurchaseAt || user.firstPaidInvoiceAt || user.subscriptionStartedAt || "", detail: user.planDisplayName || user.plan || "" },
    { id: "last_login", label: "Last login", at: user.lastLoginAt || "", detail: "" },
    { id: "last_page", label: "Last page visited", at: lastEvent?.createdAt || user.lastSeenAt || "", detail: lastEvent ? pageLabel(lastEvent) : "" },
    { id: "last_feature", label: "Last feature used", at: lastFeature?.createdAt || "", detail: lastFeature?.name || "" },
    { id: "last_activity", label: "Last activity", at: user.lastSeenAt || lastEvent?.createdAt || "", detail: "" },
    { id: "device", label: "Device", at: "", detail: detectDevice(ua) },
    { id: "browser", label: "Browser", at: "", detail: detectBrowser(ua) },
  ];

  const recent = userEvents.slice(-40).reverse().map((e) => ({
    at: e.createdAt || "",
    name: e.name,
    detail: pageLabel(e),
    path: e.path || "",
  }));

  return {
    found: true,
    email: clean,
    name: user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || clean,
    plan: user.plan || "Free",
    milestones,
    recentActivity: recent,
    attribution: attr,
    featureUsage: user.featureUsage || {},
  };
}

function buildFeatureRequestsCenter(store, { sort = "votes", category = "", status = "" } = {}) {
  let items = Array.isArray(store.featureRequests) ? store.featureRequests.slice() : [];
  if (category) items = items.filter((i) => String(i.category || "").toLowerCase() === category.toLowerCase());
  if (status) {
    const want = String(status).toLowerCase();
    items = items.filter((i) => {
      const s = String(i.status || "").toLowerCase();
      if (want === "released") return s === "completed" || s === "released";
      return s === want;
    });
  }
  if (sort === "newest") {
    items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else if (sort === "category") {
    items.sort((a, b) => String(a.category || "").localeCompare(String(b.category || "")) || (b.votes || 0) - (a.votes || 0));
  } else if (sort === "status") {
    items.sort((a, b) => String(a.status || "").localeCompare(String(b.status || "")) || (b.votes || 0) - (a.votes || 0));
  } else {
    items.sort((a, b) => (b.votes || 0) - (a.votes || 0) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }
  const categories = [...new Set(items.map((i) => i.category || "General"))].sort();
  const statusCounts = countBy(items, (i) => i.status || "New");
  return {
    sort,
    category: category || "all",
    status: status || "all",
    categories,
    statusCounts,
    total: items.length,
    openCount: countOpenFeatureRequests(store),
    items: items.slice(0, 200).map((item) => ({
      id: item.id,
      title: item.title || "",
      description: item.description || "",
      category: item.category || "General",
      ageGroup: item.ageGroup || "",
      status: item.status || "New",
      statusLabel: item.status === "Completed" ? "Released" : (item.status || "New"),
      votes: Number(item.votes || 0),
      email: item.email || "",
      name: item.name || "",
      estimatedRelease: item.estimatedRelease || "",
      notifyOnComplete: item.notifyOnComplete !== false,
      adminNotes: Array.isArray(item.adminNotes) ? item.adminNotes.slice(-5) : [],
      createdAt: item.createdAt || "",
      updatedAt: item.updatedAt || "",
    })),
  };
}

/** Feature Request Center terminal statuses (Released / Declined / archived). */
const CLOSED_FEATURE_REQUEST_STATUSES = Object.freeze([
  "completed",
  "released",
  "declined",
  "rejected",
  "archived",
]);

function isOpenFeatureRequestStatus(status) {
  const value = String(status || "New").trim().toLowerCase();
  if (!value) return true;
  return !CLOSED_FEATURE_REQUEST_STATUSES.includes(value);
}

function countOpenFeatureRequests(store = {}) {
  const items = Array.isArray(store.featureRequests) ? store.featureRequests : [];
  return items.filter((item) => isOpenFeatureRequestStatus(item?.status)).length;
}

function funnelStageCount(funnel, stageId) {
  const stage = (funnel?.stages || []).find((row) => row.id === stageId);
  if (!stage) return null;
  return Number(stage.count || 0);
}

function buildErrorCenter(store, events, range, monitoringSnapshot = null) {
  const scoped = filterEvents(events, range.startMs);
  const clientErrors = scoped.filter((e) => e.name === "client_error" || e.name === "js_error");
  const apiFails = scoped.filter((e) => e.name === "api_error" || e.name === "api_request_failed");
  const notFound = scoped.filter((e) => e.name === "not_found" || e.detail?.status === 404);
  const browsers = countBy(scoped, (e) => detectBrowser(e.userAgent));
  const devices = countBy(scoped, (e) => detectDevice(e.userAgent));
  const common = countBy(clientErrors.concat(apiFails), (e) => e.detail?.message || e.detail?.path || e.name).slice(0, 20);
  const http = monitoringSnapshot?.checks?.find((c) => c.id === "error_rate_5xx") || null;
  return {
    range: range.key,
    instrumentation: {
      clientErrors: clientErrors.length > 0 ? "live" : "pending",
      apiErrors: apiFails.length > 0 ? "live" : "pending",
      notFound: notFound.length > 0 ? "live" : "pending",
    },
    javascriptErrors: clientErrors.length,
    failedApiRequests: apiFails.length,
    notFoundPages: notFound.length,
    commonErrors: common,
    browserBreakdown: browsers.slice(0, 8),
    deviceBreakdown: devices.slice(0, 8),
    recent: clientErrors.concat(apiFails, notFound).sort((a, b) => eventTime(b) - eventTime(a)).slice(0, 40).map((e) => ({
      at: e.createdAt || "",
      name: e.name,
      message: e.detail?.message || e.detail?.path || "",
      user: e.user && e.user !== "guest" ? e.user : "",
      path: e.path || "",
      browser: detectBrowser(e.userAgent),
      device: detectDevice(e.userAgent),
    })),
    serverMonitor: http ? { ok: http.ok, detail: http.detail, value: http.value || null } : null,
    monitoringOverall: monitoringSnapshot?.overall || null,
  };
}

function buildSearchAnalytics(store, events, range) {
  const scoped = filterEvents(events, range.startMs);
  const searches = scoped.filter((e) => e.name === "search_query" || e.name === "search_no_results");
  const terms = countBy(searches, (e) => String(e.detail?.query || e.detail?.term || "").trim().toLowerCase()).slice(0, 30);
  const noResults = countBy(
    searches.filter((e) => e.name === "search_no_results" || Number(e.detail?.results || 0) === 0),
    (e) => String(e.detail?.query || e.detail?.term || "").trim().toLowerCase(),
  ).slice(0, 30);
  const toLesson = searches.filter((e) => e.detail?.ledTo === "lesson_view" || e.detail?.convertedTo === "lesson");
  const toSignup = searches.filter((e) => e.detail?.ledTo === "signup");
  const toSub = searches.filter((e) => e.detail?.ledTo === "subscription" || e.detail?.ledTo === "paid");
  const recommendations = noResults.slice(0, 8).map((row) => ({
    query: row.key,
    demand: row.count,
    suggestion: `Create or tag content for “${row.key}” — ${row.count} no-result search${row.count === 1 ? "" : "es"}.`,
  }));
  // Library search is instrumented via trackLibrarySearchAnalytics → search_query / search_no_results.
  // Other search surfaces may still be untracked — do not claim site-wide coverage.
  const instrumentation = searches.length ? "live" : "active_empty";
  return {
    range: range.key,
    instrumentation,
    mostSearched: terms,
    noResults,
    leadingToLessonViews: toLesson.length,
    leadingToSignups: toSignup.length,
    leadingToSubscriptions: toSub.length,
    contentRecommendations: recommendations,
    note: searches.length
      ? ""
      : "Search tracking is active for library search; no tracked searches occurred in this period.",
  };
}

function buildEmailAnalytics(store) {
  const engagement = store.emailEngagement || {};
  const events = Array.isArray(engagement.events) ? engagement.events : [];
  const campaigns = engagement.campaigns && typeof engagement.campaigns === "object"
    ? Object.values(engagement.campaigns)
    : [];
  const sent = events.filter((e) => e.type === "sent").length;
  const failed = events.filter((e) => e.type === "failed").length;
  const unsubscribed = events.filter((e) => e.type === "unsubscribed").length;
  const byTemplate = countBy(events.filter((e) => e.type === "sent"), (e) => e.templateId || e.campaignId || "unknown");

  // Campaign modules with open/click receipts (free welcome / founding)
  const welcome = store.freeUserWelcomeEmail || {};
  const founding = store.foundingMemberEmail || {};
  const receiptRows = [];
  const pushReceipts = (bag, label) => {
    const receipts = bag?.recipientReceipts || bag?.receipts || {};
    Object.values(receipts).forEach((row) => {
      receiptRows.push({
        campaign: label,
        email: row.email || "",
        sentAt: row.sentAt || "",
        openedAt: row.openedAt || "",
        clickedAt: row.clickedAt || "",
      });
    });
  };
  pushReceipts(welcome, "Free user welcome");
  pushReceipts(founding, "Founding member");

  const opened = receiptRows.filter((r) => r.openedAt).length;
  const clicked = receiptRows.filter((r) => r.clickedAt).length;
  const receiptDenom = receiptRows.length;
  const sentTotal = sent || receiptRows.length;

  return {
    instrumentation: {
      opensClicks: receiptRows.length ? "partial" : "pending",
      delivery: "unavailable",
      note: "Provider-confirmed delivery is unavailable. Open/click available for welcome/founding campaigns; general automations track send/fail/unsubscribe only.",
    },
    totals: {
      sent: sentTotal,
      // Do not treat (sent - failed) as Delivered — that is not provider delivery confirmation.
      delivered: null,
      sentWithoutImmediateFailure: Math.max(sentTotal - failed, 0),
      failed,
      openRate: receiptDenom > 0 ? rate(opened, receiptDenom) : null,
      clickRate: receiptDenom > 0 ? rate(clicked, receiptDenom) : null,
      conversionRate: null,
      revenueGenerated: null,
      unsubscribes: unsubscribed,
      spamComplaints: null,
    },
    byTemplate: byTemplate.slice(0, 20),
    campaigns: campaigns.slice(0, 30).map((c) => ({
      id: c.id || c.campaignId || "",
      name: c.name || c.label || c.id || "Campaign",
      status: c.status || "",
      sent: c.sentCount || c.sent || 0,
    })),
    recentEvents: events.slice(-30).reverse(),
  };
}

function buildSeoDashboard(store, deps = {}) {
  const seoStatus = typeof deps.getSeoStatus === "function" ? deps.getSeoStatus() : null;
  return {
    indexedPages: seoStatus?.urlCount ?? null,
    sitemapStatus: seoStatus?.sitemapOk ? "ok" : (seoStatus ? "check" : "unknown"),
    robotsStatus: seoStatus?.robotsOk ? "ok" : (seoStatus ? "check" : "unknown"),
    missingTitles: seoStatus?.missingTitles || [],
    missingDescriptions: seoStatus?.missingDescriptions || [],
    brokenLinks: seoStatus?.brokenLinks || [],
    googleLandingPages: seoStatus?.topLandingPages || [],
    topSearchQueries: [],
    clickThroughRate: null,
    searchImpressions: null,
    note: "On-site SEO signals are available from the app sitemap/robots helpers. Google Search Console query/CTR data requires a future GSC API connection.",
    gscConnected: false,
  };
}

function buildChurnDashboard(store, events, range) {
  const users = Object.values(store.users || {});
  const canceled = users.filter((u) => {
    const status = String(u.subscriptionStatus || u.stripeSubscriptionStatus || "").toLowerCase();
    return Boolean(u.canceledAt || u.subscriptionEndedAt || status.includes("cancel") || status.includes("ended"));
  });
  const cancelEvents = filterEvents(events, range.startMs).filter((e) => e.name === "subscription_canceled");
  const rows = canceled.slice(0, 100).map((u) => {
    const start = new Date(u.subscriptionStartedAt || u.trialStart || u.signupAt || u.createdAt || 0).getTime();
    const end = new Date(u.canceledAt || u.subscriptionEndedAt || Date.now()).getTime();
    const days = Number.isFinite(start) && end >= start ? Math.round((end - start) / 86400000) : null;
    const usage = u.featureUsage || {};
    const topFeature = Object.entries(usage).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0];
    return {
      email: u.email,
      reason: u.cancellationReason || u.cancelReason || "Not collected",
      subscriptionLengthDays: days,
      trialOrPaid: u.metaPurchaseAt || u.firstPaidInvoiceAt ? "paid" : (u.trialStart || u.metaStartTrialAt ? "trial" : "free"),
      featuresUsed: topFeature ? `${topFeature[0]} (${topFeature[1]})` : "—",
      lastLogin: u.lastLoginAt || "",
      lastActivity: u.lastSeenAt || "",
      offerAccepted: u.cancelOfferAccepted || u.retentionOfferAccepted || false,
      canceledAt: u.canceledAt || u.subscriptionEndedAt || "",
    };
  });
  const monthlyCancels = cancelEvents.length || rows.filter((r) => {
    const t = new Date(r.canceledAt || 0).getTime();
    return t >= Date.now() - 30 * 86400000;
  }).length;
  return {
    range: range.key,
    monthlyChurnEvents: monthlyCancels,
    annualChurnEvents: rows.filter((r) => {
      const t = new Date(r.canceledAt || 0).getTime();
      return t >= Date.now() - 365 * 86400000;
    }).length,
    rows,
    note: "Cancellation reason capture is partial until checkout-portal cancel surveys are wired. Retention trends use canceledAt / subscription_canceled events.",
  };
}

function buildContentHealth(store, events, range) {
  const scoped = filterEvents(events, range.startMs);
  const curriculum = store.siteContent?.curriculum || {};
  const lessons = Array.isArray(curriculum.lessonPlans) ? curriculum.lessonPlans : [];
  const activities = Array.isArray(curriculum.activities) ? curriculum.activities : [];
  const viewMap = new Map();
  for (const event of scoped.filter((e) => isLessonView(e) || isActivityView(e) || isDownload(e) || isPrint(e))) {
    const id = event.detail?.lessonId || event.detail?.activityId || event.detail?.resourceId || contentTitle(event);
    if (!viewMap.has(id)) viewMap.set(id, { views: 0, downloads: 0, prints: 0, favorites: 0 });
    const row = viewMap.get(id);
    if (isLessonView(event) || isActivityView(event)) row.views += 1;
    if (isDownload(event)) row.downloads += 1;
    if (isPrint(event)) row.prints += 1;
    if (event.name === "favorite_add" || event.name === "resource_favorite") row.favorites += 1;
  }

  const scoreItem = (item, kind) => {
    const stats = viewMap.get(item.id) || { views: 0, downloads: 0, prints: 0, favorites: 0 };
    const missing = [];
    if (!item.coverImage && !item.coverUrl && !item.imageUrl) missing.push("cover");
    if (!item.objectives && !item.learningObjectives) missing.push("objectives");
    if (!(item.images || item.gallery || item.media)?.length && missing.includes("cover")) missing.push("images");
    return {
      id: item.id,
      title: item.title || item.name || item.id,
      kind,
      ageGroup: item.ageGroup || item.age || "",
      views: stats.views,
      favorites: stats.favorites,
      downloads: stats.downloads,
      prints: stats.prints,
      reviews: Number(item.ratingCount || item.reviewsCount || 0),
      lastUpdated: item.updatedAt || item.modifiedAt || item.createdAt || "",
      missing,
      lowPerforming: stats.views > 0 && stats.views < 3,
    };
  };

  const lessonRows = lessons.map((l) => scoreItem(l, "lesson")).sort((a, b) => b.views - a.views);
  const activityRows = activities.map((a) => scoreItem(a, "activity")).sort((a, b) => b.views - a.views);
  const updateRecommendations = [...lessonRows, ...activityRows]
    .filter((row) => row.missing.length || row.lowPerforming)
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      title: row.title,
      reason: row.missing.length ? `Missing ${row.missing.join(", ")}` : "Low views — consider refresh or promotion",
    }));

  return {
    range: range.key,
    lessonCount: lessons.length,
    activityCount: activities.length,
    lessons: lessonRows.slice(0, 100),
    activities: activityRows.slice(0, 100),
    updateRecommendations,
  };
}

function buildReleaseCenter(deps = {}) {
  const build = typeof deps.getBuildInfo === "function" ? deps.getBuildInfo() : {};
  const monitoring = deps.monitoringSnapshot || null;
  return {
    current: {
      version: build.version || build.shellVersion || "unknown",
      commitSha: build.commitSha || build.gitSha || "",
      deployTime: build.deployedAt || build.buildTime || "",
      healthStatus: monitoring?.overall || "unknown",
    },
    rollbackAvailability: "Use Render Dashboard → Deploys → Rollback previous deploy",
    releaseNotes: build.releaseNotes || [],
    qaChecklist: [
      { item: "GET /api/health returns ok", done: monitoring?.checks?.find((c) => c.id === "website_health")?.ok ?? null },
      { item: "Database ready", done: monitoring?.checks?.find((c) => c.id === "database")?.ok ?? null },
      { item: "No 5xx spike", done: monitoring?.checks?.find((c) => c.id === "error_rate_5xx")?.ok ?? null },
      { item: "Meta tracking healthy", done: monitoring?.checks?.find((c) => c.id === "meta_tracking")?.ok ?? null },
    ],
    historyNote: "Full deploy history lives in Render. This hub mirrors the live build + health snapshot for morning ops.",
    monitoring,
  };
}

function parseUrlParams(raw = "") {
  try {
    return new URL(String(raw || ""), "https://littlelearnershubbyleah.com").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function funnelChannelFromRaw(value, { url = "", referrer = "", medium = "" } = {}) {
  const raw = String(value || "").trim();
  const mediumText = String(medium || "").trim().toLowerCase();
  const blob = `${raw} ${url} ${referrer} ${mediumText}`.toLowerCase();
  if (/facebook|instagram|fbclid|\bmeta\b/.test(blob) || /^fb$/i.test(raw)) return "Facebook";
  if (/tiktok|ttclid/.test(blob)) return "TikTok";
  if (/gclid|google|adwords|youtube|googlesyndication/.test(blob)) return "Google";
  if (/^direct$/i.test(raw) || (!raw && !referrer)) return "Direct";
  if (
    mediumText === "email"
    || mediumText === "newsletter"
    || /^referral$/i.test(raw)
    || /^email$/i.test(raw)
    || /^organic$/i.test(raw)
    || /\bemail\b|newsletter|bing|yahoo|duckduckgo|organic/.test(blob)
    || referrer
  ) {
    return "Organic";
  }
  if (!raw) return "Direct";
  return "Other";
}

function eventFunnelSource(event = {}, user = null) {
  const attr = (event.attribution && typeof event.attribution === "object" ? event.attribution : null)
    || (user?.attribution && typeof user.attribution === "object" ? user.attribution : {})
    || {};
  const params = parseUrlParams(event.url || attr.landingPage || "");
  const medium = attr.medium || params.get("utm_medium") || event.detail?.medium || "";
  const referrer = attr.referrer || event.referrer || "";
  const sourceRaw = attr.source || event.source || event.detail?.source || params.get("utm_source") || "";
  return funnelChannelFromRaw(sourceRaw, { url: event.url || "", referrer, medium });
}

function actorKey(event = {}) {
  return String(event.visitorId || event.user || event.sessionId || event.ipHash || "").trim().toLowerCase();
}

function isCtaClickEvent(event) {
  if (!event) return false;
  if (event.name === "cta_click") return true;
  if (event.name === "signup_click") return true;
  if (event.name !== "button_click") return false;
  const label = String(event.detail?.label || event.detail?.action || "").toLowerCase();
  return /start free|start trial|create free account|^sign up$|sign up$|try pro|start 7/.test(label);
}

function ctaKind(event) {
  if (event?.name === "cta_click") {
    const cta = String(event.detail?.cta || "").toLowerCase();
    if (cta.includes("trial")) return "start_trial";
    return "start_free";
  }
  const label = String(event?.detail?.label || event?.detail?.action || event?.name || "").toLowerCase();
  if (/trial|try pro|start 7/.test(label)) return "start_trial";
  return "start_free";
}

function isSignupStartEvent(event) {
  if (!event) return false;
  return [
    "signup_start",
    "signup_click",
    "signup_plan_selected",
    "free_plan_selected",
    "signup_persona_selected",
  ].includes(event.name);
}

/** Step-level unique-actor counts for signup diagnosis — does not change funnel stages. */
const SIGNUP_STEP_EVENT_NAMES = Object.freeze([
  "signup_start",
  "signup_form_submit",
  "account_signup_complete",
  "signup_persona_selected",
  "signup_plan_selected",
  "free_plan_selected",
  "signup_landed_free",
]);

function buildSignupStepCounts(events = [], isTestActor = () => false) {
  const counts = {};
  for (const name of SIGNUP_STEP_EVENT_NAMES) {
    const keys = new Set();
    for (const event of events) {
      if (!event || event.name !== name || isTestActor(event)) continue;
      const key = actorKey(event) || normalizeEmail(event.user || event.detail?.email || "");
      if (key) keys.add(key);
    }
    counts[name] = keys.size;
  }
  return counts;
}

/** Owner-facing Free signup diagnosis — additive; does not change FUNNEL_STAGE_DEFS. */
const FREE_SIGNUP_FUNNEL_STAGE_DEFS = Object.freeze([
  { id: "homepageVisitors", label: "Homepage visitors" },
  { id: "startFreeClicks", label: "Clicked Start Free" },
  { id: "signupStart", label: "Signup started" },
  { id: "signupFormSubmit", label: "Submitted signup" },
  { id: "accountCreated", label: "Account created" },
  { id: "landedFree", label: "Reached Free lessons" },
]);

const FREE_SIGNUP_CTA_SOURCE_DEFS = Object.freeze([
  { id: "hero", label: "Homepage hero" },
  { id: "nav", label: "Header / navigation" },
  { id: "other", label: "Other Start Free CTAs" },
]);

function isHomepageVisitEvent(event) {
  if (!event || (event.name !== "website_visit" && event.name !== "page_view")) return false;
  const view = String(event.detail?.view || event.view || "").trim().toLowerCase();
  if (view) return view === "home";
  const raw = String(event.path || event.url || event.attribution?.landingPage || "").trim();
  if (!raw || raw === "/" || raw === "/index.html" || raw === "home" || raw.startsWith("/?")) return true;
  try {
    const url = new URL(raw, "https://littlelearnershubbyleah.com");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return pathname === "/" || pathname === "/index.html";
  } catch {
    return false;
  }
}

function isStartFreeClickEvent(event) {
  if (!event) return false;
  if (event.name === "signup_click") return true;
  if (!isCtaClickEvent(event)) return false;
  return ctaKind(event) === "start_free";
}

/**
 * Reliable CTA source from existing analytics only.
 * Farm / pricing / footer / sticky all record placement=page and cannot be split.
 */
function startFreeCtaSourceId(event) {
  if (!event) return "other";
  if (event.name === "signup_click") return "nav";
  const placement = String(event.detail?.placement || "").trim().toLowerCase();
  if (placement === "hero") return "hero";
  if (placement === "nav") return "nav";
  return "other";
}

function buildActorUnionFinder(links = { visitorToEmail: new Map(), emailToVisitors: new Map() }) {
  const parent = new Map();
  const find = (value) => {
    const key = String(value || "").trim().toLowerCase();
    if (!key) return "";
    if (!parent.has(key)) parent.set(key, key);
    let cur = key;
    while (parent.get(cur) !== cur) cur = parent.get(cur);
    let walk = key;
    while (walk && parent.get(walk) !== cur) {
      const next = parent.get(walk);
      parent.set(walk, cur);
      walk = next;
    }
    return cur;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (!ra || !rb || ra === rb) return;
    parent.set(ra, rb);
  };
  for (const [visitor, email] of (links.visitorToEmail || new Map()).entries()) union(visitor, email);
  for (const [email, visitors] of (links.emailToVisitors || new Map()).entries()) {
    for (const visitor of visitors) union(email, visitor);
  }
  return { find, union };
}

function eventActorId(event, unioner) {
  if (!event || !unioner) return "";
  const email = normalizeEmail(event.user || event.detail?.email || event.email || "");
  const key = actorKey(event);
  if (key && email) unioner.union(key, email);
  const visitor = String(event.visitorId || "").trim().toLowerCase();
  const session = String(event.sessionId || "").trim().toLowerCase();
  if (visitor && email) unioner.union(visitor, email);
  if (session && email) unioner.union(session, email);
  return unioner.find(key || email);
}

function uniqueActorSet(events, unioner, predicate) {
  const actors = new Set();
  let eventCount = 0;
  for (const event of events) {
    if (!predicate(event)) continue;
    eventCount += 1;
    const id = eventActorId(event, unioner);
    if (id) actors.add(id);
  }
  return { actors, eventCount };
}

function buildFreeSignupStageRow(def, uniqueActors, eventCount, prevCount, index) {
  const count = uniqueActors;
  const converted = index === 0 ? count : Math.min(count, prevCount);
  const dropped = index === 0 ? 0 : Math.max(prevCount - count, 0);
  return {
    id: def.id,
    label: def.label,
    uniqueActors: count,
    reaching: count,
    eventCount,
    conversionFromPrev: index === 0 ? 100 : pct(converted, prevCount),
    conversionFromPrevLabel: index === 0 ? "—" : rate(converted, prevCount),
    dropOffCount: dropped,
    dropOffRate: index === 0 ? 0 : pct(dropped, prevCount),
    dropOffRateLabel: index === 0 ? "—" : rate(dropped, prevCount),
  };
}

/**
 * Detailed Free signup funnel from existing analytics only.
 * Unique actors (visitor/email/session linked). Repeated signup_start is one start.
 */
function buildFreeSignupFunnel(events = [], isTestActor = () => false) {
  const scoped = (events || []).filter((event) => event && !isTestActor(event));
  const links = buildActorLinkIndex(scoped);
  const unioner = buildActorUnionFinder(links);

  const homepage = uniqueActorSet(scoped, unioner, isHomepageVisitEvent);
  const startFree = uniqueActorSet(scoped, unioner, isStartFreeClickEvent);
  const signupStart = uniqueActorSet(scoped, unioner, (event) => event.name === "signup_start");
  const formSubmit = uniqueActorSet(scoped, unioner, (event) => event.name === "signup_form_submit");
  const accountCreated = uniqueActorSet(scoped, unioner, (event) => event.name === "account_signup_complete");
  const landedFree = uniqueActorSet(scoped, unioner, (event) => event.name === "signup_landed_free");

  const collected = [
    { def: FREE_SIGNUP_FUNNEL_STAGE_DEFS[0], set: homepage },
    { def: FREE_SIGNUP_FUNNEL_STAGE_DEFS[1], set: startFree },
    { def: FREE_SIGNUP_FUNNEL_STAGE_DEFS[2], set: signupStart },
    { def: FREE_SIGNUP_FUNNEL_STAGE_DEFS[3], set: formSubmit },
    { def: FREE_SIGNUP_FUNNEL_STAGE_DEFS[4], set: accountCreated },
    { def: FREE_SIGNUP_FUNNEL_STAGE_DEFS[5], set: landedFree },
  ];

  const stages = collected.map((row, index) => {
    const prevCount = index === 0 ? row.set.actors.size : collected[index - 1].set.actors.size;
    return buildFreeSignupStageRow(row.def, row.set.actors.size, row.set.eventCount, prevCount, index);
  });

  const transitions = stages.slice(1).map((stage, idx) => {
    const from = stages[idx];
    return {
      from: from.id,
      to: stage.id,
      fromLabel: from.label,
      toLabel: stage.label,
      fromCount: from.uniqueActors,
      toCount: stage.uniqueActors,
      conversionRate: stage.conversionFromPrev,
      conversionRateLabel: stage.conversionFromPrevLabel,
      dropOffCount: stage.dropOffCount,
      dropOffRate: stage.dropOffRate,
      dropOffRateLabel: stage.dropOffRateLabel,
    };
  });

  const leakCount = (fromSet, toSet) => {
    let n = 0;
    for (const id of fromSet) {
      if (!toSet.has(id)) n += 1;
    }
    return n;
  };
  const leakA = leakCount(homepage.actors, startFree.actors);
  const leakB = leakCount(startFree.actors, formSubmit.actors);
  const leakC = leakCount(formSubmit.actors, accountCreated.actors);
  const leakD = leakCount(accountCreated.actors, landedFree.actors);
  const leakE = landedFree.actors.size;

  const leaks = [
    {
      id: "A",
      label: "Visitor who never clicks Start Free",
      count: leakA,
      percent: pct(leakA, homepage.actors.size),
      percentLabel: rate(leakA, homepage.actors.size),
      from: "homepageVisitors",
      to: "startFreeClicks",
    },
    {
      id: "B",
      label: "Clicked Start Free but never submitted",
      count: leakB,
      percent: pct(leakB, startFree.actors.size),
      percentLabel: rate(leakB, startFree.actors.size),
      from: "startFreeClicks",
      to: "signupFormSubmit",
    },
    {
      id: "C",
      label: "Form submitted but account creation fails",
      count: leakC,
      percent: pct(leakC, formSubmit.actors.size),
      percentLabel: rate(leakC, formSubmit.actors.size),
      from: "signupFormSubmit",
      to: "accountCreated",
    },
    {
      id: "D",
      label: "Account created but Free landing fails",
      count: leakD,
      percent: pct(leakD, accountCreated.actors.size),
      percentLabel: rate(leakD, accountCreated.actors.size),
      from: "accountCreated",
      to: "landedFree",
    },
    {
      id: "E",
      label: "Successful Free signup",
      count: leakE,
      percent: pct(leakE, homepage.actors.size),
      percentLabel: rate(leakE, homepage.actors.size),
      from: "landedFree",
      to: "",
    },
  ];

  const leakTransitions = transitions.filter((row) => row.dropOffCount > 0);
  const largestTransition = leakTransitions
    .slice()
    .sort((a, b) => b.dropOffRate - a.dropOffRate || b.dropOffCount - a.dropOffCount)[0] || null;
  const largestLeak = largestTransition
    ? {
      id: largestTransition.from,
      label: `${largestTransition.fromLabel} → ${largestTransition.toLabel}`,
      fromLabel: largestTransition.fromLabel,
      toLabel: largestTransition.toLabel,
      dropOffCount: largestTransition.dropOffCount,
      dropOffRate: largestTransition.dropOffRate,
      dropOffRateLabel: largestTransition.dropOffRateLabel,
      fromCount: largestTransition.fromCount,
    }
    : null;

  const ctaSources = FREE_SIGNUP_CTA_SOURCE_DEFS.map((def) => {
    const matched = uniqueActorSet(
      scoped,
      unioner,
      (event) => isStartFreeClickEvent(event) && startFreeCtaSourceId(event) === def.id,
    );
    return {
      id: def.id,
      label: def.label,
      uniqueActors: matched.actors.size,
      eventCount: matched.eventCount,
    };
  });

  return {
    title: "FREE SIGNUP FUNNEL",
    stages,
    transitions,
    leaks,
    largestLeak,
    largestLeakLabel: largestLeak
      ? `Largest current leak: ${largestLeak.label}`
      : "Largest current leak: none in this range",
    ctaSources,
    signupStepCounts: buildSignupStepCounts(events, isTestActor),
    note: "Unique people, not repeat modal opens. Hero and header/nav are separately attributed. Farm Animals preview, pricing, footer, and other page Start Free buttons share “Other” because existing analytics only record placement=page for those.",
  };
}

function pct(part, whole) {
  if (!whole) return 0;
  return Number(((part / whole) * 100).toFixed(1));
}

function buildTransitionRow(fromStage, toStage, { informational = false } = {}) {
  const fromCount = Number(fromStage?.count || 0);
  const toCount = Number(toStage?.count || 0);
  const converted = Math.min(toCount, fromCount);
  const dropped = Math.max(fromCount - toCount, 0);
  return {
    from: fromStage.id,
    to: toStage.id,
    fromLabel: fromStage.label,
    toLabel: toStage.label,
    fromCount,
    toCount,
    conversionRate: pct(converted, fromCount),
    conversionRateLabel: rate(converted, fromCount),
    dropOffCount: informational ? 0 : dropped,
    dropOffRate: informational ? 0 : pct(dropped, fromCount),
    dropOffRateLabel: informational ? "n/a" : rate(dropped, fromCount),
    rawDropOffCount: dropped,
    rawDropOffRate: pct(dropped, fromCount),
    rawDropOffRateLabel: rate(dropped, fromCount),
    informational,
    countsTowardRecommendations: !informational,
  };
}

function buildStageTransitions(stages, { emailVerificationRequired = false } = {}) {
  const byId = Object.fromEntries((stages || []).map((s) => [s.id, s]));
  const transitions = [];
  for (let i = 0; i < FUNNEL_STAGE_DEFS.length - 1; i += 1) {
    const fromDef = FUNNEL_STAGE_DEFS[i];
    const toDef = FUNNEL_STAGE_DEFS[i + 1];
    const from = byId[fromDef.id];
    const to = byId[toDef.id];
    if (!from || !to) continue;
    const fromRole = resolveFunnelStageRole(fromDef, emailVerificationRequired);
    const toRole = resolveFunnelStageRole(toDef, emailVerificationRequired);
    const informational = fromRole === "optional" || toRole === "optional" || toRole === "snapshot";
    transitions.push(buildTransitionRow(from, to, { informational }));
  }
  return transitions;
}

function buildAdvisorFunnelTransitions(stages) {
  const byId = Object.fromEntries((stages || []).map((s) => [s.id, s]));
  return ADVISOR_FUNNEL_EDGES.map((edge) => {
    const from = byId[edge.from] || { id: edge.from, label: edge.from, count: 0 };
    const to = byId[edge.to] || { id: edge.to, label: edge.to, count: 0 };
    return {
      ...buildTransitionRow(
        { ...from, label: from.label || edge.from },
        { ...to, label: to.label || edge.to },
        { informational: false },
      ),
      advisorLabel: edge.label,
    };
  });
}

function pickWorstActionableDropOff(transitions = []) {
  return transitions
    .filter((t) => t && t.countsTowardRecommendations !== false && !t.informational)
    .filter((t) => t.to !== "activeSubscribers")
    .slice()
    .sort((a, b) => b.dropOffRate - a.dropOffRate || b.dropOffCount - a.dropOffCount)[0] || null;
}

function emptyStageSets() {
  return Object.fromEntries(FUNNEL_STAGE_DEFS.map((s) => [s.id, new Set()]));
}

function emptyStagePeople() {
  return Object.fromEntries(FUNNEL_STAGE_DEFS.map((s) => [s.id, new Map()]));
}

function detectFunnelDevice(ua = "") {
  const value = String(ua || "");
  if (/iPad|Tablet/i.test(value)) return "Tablet";
  if (/Mobi|Android|iPhone/i.test(value)) return "Mobile";
  if (!value) return "Unknown";
  return "Desktop";
}

function landingPathFromEvent(event = {}, user = null) {
  const attr = event.attribution || user?.attribution || {};
  const raw = attr.landingPage || event.path || event.detail?.view || event.url || "/";
  try {
    const url = new URL(String(raw), "https://littlelearnershubbyleah.com");
    return `${url.pathname}${url.search}`.slice(0, 180) || "/";
  } catch {
    return String(raw || "/").slice(0, 180);
  }
}

function isActiveSubscriber(user = {}) {
  const plan = String(user.plan || user.planDisplayName || "").toLowerCase();
  const status = String(user.subscriptionStatus || user.stripeSubscriptionStatus || user.accountStatus || "").toLowerCase();
  if (user.foundingMemberActive) return true;
  if (status.includes("cancel") && !status.includes("active")) return false;
  if (status.includes("ended") || status.includes("incomplete_expired")) return false;
  if (status.includes("active") || status.includes("trialing") || status.includes("past_due")) {
    return /pro|founding|paid|annual|monthly/.test(plan) || Boolean(user.metaPurchaseAt || user.firstPaidInvoiceAt);
  }
  return Boolean(user.metaPurchaseAt || user.firstPaidInvoiceAt) && /pro|founding/.test(plan);
}

function readFunnelAdSpend(store) {
  const fromStore = store?.marketingAdSpend && typeof store.marketingAdSpend === "object"
    ? store.marketingAdSpend
    : {};
  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const bySource = {
    Facebook: num(fromStore.Facebook ?? fromStore.facebook ?? process.env.MARKETING_AD_SPEND_FACEBOOK),
    TikTok: num(fromStore.TikTok ?? fromStore.tiktok ?? process.env.MARKETING_AD_SPEND_TIKTOK),
    Google: num(fromStore.Google ?? fromStore.google ?? process.env.MARKETING_AD_SPEND_GOOGLE),
    Direct: num(fromStore.Direct ?? fromStore.direct),
    Organic: num(fromStore.Organic ?? fromStore.organic ?? fromStore.Referral ?? fromStore.referral),
    Other: num(fromStore.Other ?? fromStore.Unknown ?? fromStore.unknown),
  };
  const totalFromParts = Object.values(bySource).reduce((sum, value) => sum + value, 0);
  const total = num(fromStore.total ?? process.env.MARKETING_AD_SPEND_TOTAL) || totalFromParts;
  return { total, bySource, configured: total > 0 || totalFromParts > 0 };
}

function costLabel(spend, conversions) {
  if (!(spend > 0) || !(conversions > 0)) return null;
  return Number((spend / conversions).toFixed(2));
}

function avgHours(list) {
  if (!list.length) return null;
  return Number((list.reduce((a, b) => a + b, 0) / list.length).toFixed(2));
}

function formatHoursLabel(hours) {
  if (!Number.isFinite(hours) || hours < 0) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function formatMinutesLabel(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function avgMinutes(list) {
  if (!list.length) return null;
  return Number((list.reduce((a, b) => a + b, 0) / list.length).toFixed(2));
}

/** Index scoped analytics by actor for last-page + time-on-site before funnel exit. */
function buildActorActivityIndex(scopedEvents = []) {
  const byActor = new Map();
  const touch = (key, event) => {
    if (!key) return;
    const t = eventTime(event);
    const page = pageLabel(event);
    const existing = byActor.get(key);
    if (!existing) {
      byActor.set(key, { firstMs: t, lastMs: t, lastPage: page || "/", eventCount: 1 });
      return;
    }
    if (t && (!existing.firstMs || t < existing.firstMs)) existing.firstMs = t;
    if (t && t >= existing.lastMs) {
      existing.lastMs = t;
      if (page) existing.lastPage = page;
    }
    existing.eventCount += 1;
  };
  for (const event of scopedEvents) {
    const email = normalizeEmail(event.user || event.detail?.email || "");
    const key = actorKey(event);
    if (key) touch(key, event);
    if (email) touch(email, event);
  }
  return byActor;
}

function resolveActorActivity(index, person = {}, identityKeys = []) {
  const keys = identityKeys.length
    ? identityKeys
    : [person.key, person.email].filter(Boolean);
  let activity = null;
  for (const key of keys) {
    const hit = index.get(String(key || "").trim().toLowerCase()) || index.get(key);
    if (!hit) continue;
    if (!activity) {
      activity = { ...hit };
      continue;
    }
    if (hit.firstMs && (!activity.firstMs || hit.firstMs < activity.firstMs)) activity.firstMs = hit.firstMs;
    if (hit.lastMs && hit.lastMs >= (activity.lastMs || 0)) {
      activity.lastMs = hit.lastMs;
      activity.lastPage = hit.lastPage || activity.lastPage;
    }
    activity.eventCount = (activity.eventCount || 0) + (hit.eventCount || 0);
  }
  if (!activity) {
    return { lastPage: person.landingPage || "/", minutesBeforeExit: null };
  }
  const minutes = activity.firstMs && activity.lastMs && activity.lastMs >= activity.firstMs
    ? (activity.lastMs - activity.firstMs) / 60000
    : null;
  return {
    lastPage: activity.lastPage || person.landingPage || "/",
    minutesBeforeExit: minutes == null ? null : Number(minutes.toFixed(2)),
  };
}

/** Link visitorId/sessionId ↔ email so funnel exits don't false-positive after signup. */
function buildActorLinkIndex(scopedEvents = []) {
  const visitorToEmail = new Map();
  const emailToVisitors = new Map();
  const link = (visitor, email) => {
    const v = String(visitor || "").trim().toLowerCase();
    const e = normalizeEmail(email);
    if (!v || !e) return;
    visitorToEmail.set(v, e);
    if (!emailToVisitors.has(e)) emailToVisitors.set(e, new Set());
    emailToVisitors.get(e).add(v);
  };
  for (const event of scopedEvents) {
    const email = normalizeEmail(event.user || event.detail?.email || event.email || "");
    const visitor = event.visitorId || "";
    const session = event.sessionId || "";
    if (email && visitor) link(visitor, email);
    if (email && session) link(session, email);
  }
  return { visitorToEmail, emailToVisitors };
}

function actorIdentityKeys(person = {}, links = { visitorToEmail: new Map(), emailToVisitors: new Map() }) {
  const keys = new Set();
  const add = (value) => {
    const text = String(value || "").trim().toLowerCase();
    if (text) keys.add(text);
  };
  add(person.key);
  add(person.email);
  add(person.visitorKey);
  const seed = [...keys];
  for (const key of seed) {
    if (links.visitorToEmail.has(key)) add(links.visitorToEmail.get(key));
    if (links.emailToVisitors.has(key)) {
      for (const visitor of links.emailToVisitors.get(key)) add(visitor);
    }
  }
  return [...keys];
}

function stageHasActor(stageSet, person, links) {
  if (!stageSet) return false;
  return actorIdentityKeys(person, links).some((key) => stageSet.has(key));
}

function countMapEntries(map) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}

function buildFunnelExitInsights({
  people,
  overall,
  transitions,
  landingStats,
  actorActivity,
  actorLinks,
  exitStageFilter = "",
  emailVerificationRequired = false,
} = {}) {
  const exitStages = [];
  const allLeaverKeys = new Set();
  const abandonByLanding = new Map();
  const links = actorLinks || { visitorToEmail: new Map(), emailToVisitors: new Map() };

  for (let i = 0; i < FUNNEL_STAGE_DEFS.length - 1; i += 1) {
    const current = FUNNEL_STAGE_DEFS[i];
    // Skip optional stages as exit origins (e.g. Email verified when optional).
    if (isOptionalFunnelStage(current, emailVerificationRequired)) continue;
    if (resolveFunnelStageRole(current, emailVerificationRequired) === "snapshot") continue;

    // Jump to next actionable stage so optional gates (email verify / trial ended) are not exits.
    const next = nextActionableStageDef(i, emailVerificationRequired);
    if (!next) continue;

    const reachedCount = overall[current.id]?.size || 0;
    const seenLeaver = new Set();
    const leavers = [];
    for (const person of (people[current.id]?.values() || [])) {
      if (person.exitedBefore !== next.id) continue;
      const identity = actorIdentityKeys(person, links);
      const dedupeKey = identity.find((k) => k.includes("@")) || identity[0] || person.key;
      if (seenLeaver.has(dedupeKey)) continue;
      seenLeaver.add(dedupeKey);
      leavers.push(person);
    }
    const deviceMap = new Map();
    const sourceMap = new Map();
    const lastPageMap = new Map();
    const minutesList = [];
    const enriched = [];

    for (const person of leavers) {
      const identity = actorIdentityKeys(person, links);
      const linkedEmail = identity.find((k) => k.includes("@")) || person.email || "";
      const activity = resolveActorActivity(actorActivity, person, identity);
      const device = person.device || "Unknown";
      const src = person.source || "Other";
      const lastPage = activity.lastPage || person.landingPage || "/";
      const landingPage = person.landingPage || "/";
      deviceMap.set(device, (deviceMap.get(device) || 0) + 1);
      sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
      lastPageMap.set(lastPage, (lastPageMap.get(lastPage) || 0) + 1);
      if (activity.minutesBeforeExit != null) minutesList.push(activity.minutesBeforeExit);
      allLeaverKeys.add(linkedEmail || person.key || person.email);
      abandonByLanding.set(landingPage, (abandonByLanding.get(landingPage) || 0) + 1);
      enriched.push({
        email: linkedEmail || person.email || "",
        name: person.name || "",
        visitorKey: (linkedEmail || person.email) ? "" : person.key,
        source: src,
        device,
        landingPage,
        lastPage,
        minutesBeforeExit: activity.minutesBeforeExit,
        minutesBeforeExitLabel: formatMinutesLabel(activity.minutesBeforeExit),
        reachedAt: person.reachedAt || "",
        exitLabel: person.exitLabel || `Left before ${next.label}`,
        exitedAfter: current.id,
        exitedBefore: next.id,
      });
    }

    // Identity-aware leaver count (visitorId ↔ email linked) should match funnel drop-off.
    const dropOffCount = Math.max(reachedCount - (overall[next.id]?.size || 0), 0);
    const exitCount = leavers.length;
    exitStages.push({
      from: current.id,
      to: next.id,
      fromLabel: current.label,
      toLabel: next.label,
      reachedCount,
      exitCount,
      funnelDropOffCount: dropOffCount,
      exitRate: pct(exitCount, reachedCount),
      exitRateLabel: rate(exitCount, reachedCount),
      avgMinutesBeforeExit: avgMinutes(minutesList),
      avgMinutesBeforeExitLabel: formatMinutesLabel(avgMinutes(minutesList)),
      devices: countMapEntries(deviceMap),
      sources: countMapEntries(sourceMap),
      topLastPages: countMapEntries(lastPageMap).slice(0, 8),
      sampleSize: enriched.length,
      informational: false,
      _people: enriched,
    });
  }

  const mostCommonExit = exitStages
    .filter((row) => !row.informational)
    .slice()
    .sort((a, b) => b.exitCount - a.exitCount || b.exitRate - a.exitRate)[0] || null;

  const topAbandonmentLandingPages = [...landingStats.entries()]
    .map(([page, stats]) => {
      const visitors = stats.visitors.size;
      const signups = stats.signups.size;
      const abandoned = Math.max(visitors - signups, 0);
      const exitTouches = abandonByLanding.get(page) || 0;
      return {
        page,
        visitors,
        signups,
        abandoned,
        abandonRate: pct(abandoned, visitors),
        abandonRateLabel: rate(abandoned, visitors),
        exitTouches,
      };
    })
    .filter((row) => row.visitors > 0 && (row.abandoned > 0 || row.exitTouches > 0))
    .sort((a, b) => b.abandonRate - a.abandonRate || b.abandoned - a.abandoned || b.visitors - a.visitors)
    .slice(0, 12);

  const exitPeople = {};
  if (exitStageFilter) {
    const row = exitStages.find((s) => s.from === exitStageFilter);
    if (row) {
      exitPeople[exitStageFilter] = row._people
        .slice()
        .sort((a, b) => String(b.reachedAt).localeCompare(String(a.reachedAt)))
        .slice(0, 100);
    }
  }

  const publicExitStages = exitStages.map(({ _people, ...rest }) => rest);

  // Align transition drop-off with exit rows for UI convenience.
  const transitionExits = (transitions || []).map((t) => {
    const match = publicExitStages.find((s) => s.from === t.from && s.to === t.to);
    return {
      ...t,
      exitCount: match?.exitCount ?? t.dropOffCount,
      exitRate: match?.exitRate ?? t.dropOffRate,
      exitRateLabel: match?.exitRateLabel ?? t.dropOffRateLabel,
    };
  });

  return {
    mostCommonExit: mostCommonExit
      ? {
        from: mostCommonExit.from,
        to: mostCommonExit.to,
        fromLabel: mostCommonExit.fromLabel,
        toLabel: mostCommonExit.toLabel,
        exitCount: mostCommonExit.exitCount,
        exitRate: mostCommonExit.exitRate,
        exitRateLabel: mostCommonExit.exitRateLabel,
        avgMinutesBeforeExitLabel: mostCommonExit.avgMinutesBeforeExitLabel,
        topLastPage: mostCommonExit.topLastPages[0]?.key || "",
      }
      : null,
    exitStages: publicExitStages,
    topAbandonmentLandingPages,
    exitPeople,
    totalExits: allLeaverKeys.size,
    transitionExits,
    note: "Why They Left uses unique actors who reached a stage but not the next. Last page and time spent come from their analytics events in this range.",
  };
}

function buildMarketingFunnel(store, events, range, { source = "", stage = "", exitStage = "" } = {}) {
  const sourceFilter = FUNNEL_SOURCES.includes(source) ? source : "";
  const stageFilter = FUNNEL_STAGE_DEFS.some((s) => s.id === stage) ? stage : "";
  const exitStageFilter = FUNNEL_STAGE_DEFS.some((s) => s.id === exitStage) ? exitStage : "";
  const emailVerificationRequired = isEmailVerificationRequired(store);
  const scoped = filterEvents(events, range.startMs);
  const { users } = testAccountGuard.filterUsersForCustomerAnalytics(Object.values(store.users || {}));
  const usersByEmail = new Map(users.map((u) => [normalizeEmail(u.email), u]));
  const isTestActor = (event) => testAccountGuard.shouldExcludeFromCustomerAnalytics(
    event?.user || event?.detail?.email || event?.email || "",
  );

  const overall = emptyStageSets();
  const bySourceSets = Object.fromEntries(FUNNEL_SOURCES.map((src) => [src, emptyStageSets()]));
  const people = emptyStagePeople();
  const ctaKindCounts = { start_free: 0, start_trial: 0 };
  const deviceCounts = { Mobile: 0, Desktop: 0, Tablet: 0, Unknown: 0 };
  const landingStats = new Map();
  const visitToSignupHours = [];
  const signupToPaidHours = [];
  const firstVisitByActor = new Map();

  const ensureLanding = (page) => {
    if (!landingStats.has(page)) landingStats.set(page, { visitors: new Set(), signups: new Set(), paid: new Set() });
    return landingStats.get(page);
  };

  const mark = (stageId, key, meta = {}) => {
    if (!key || !overall[stageId]) return;
    const src = FUNNEL_SOURCES.includes(meta.source) ? meta.source : "Other";
    if (sourceFilter && src !== sourceFilter) return;
    overall[stageId].add(key);
    bySourceSets[src][stageId].add(key);
    const existing = people[stageId].get(key) || {};
    people[stageId].set(key, {
      key,
      email: meta.email || existing.email || (/@/.test(key) ? key : ""),
      name: meta.name || existing.name || "",
      source: src,
      device: meta.device || existing.device || "Unknown",
      landingPage: meta.landingPage || existing.landingPage || "/",
      reachedAt: meta.reachedAt || existing.reachedAt || "",
      label: meta.label || existing.label || "",
    });
  };

  for (const event of scoped) {
    if (isTestActor(event)) continue;
    const email = normalizeEmail(event.user || event.detail?.email || "");
    const user = usersByEmail.get(email) || null;
    const eventSource = eventFunnelSource(event, user);
    const key = actorKey(event) || email;
    const device = detectFunnelDevice(event.userAgent || user?.userAgent || "");
    const landingPage = landingPathFromEvent(event, user);
    const meta = {
      source: eventSource,
      device,
      landingPage,
      reachedAt: event.createdAt || "",
      email,
      name: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "",
    };

    if (event.name === "website_visit" || event.name === "page_view") {
      deviceCounts[device] = (deviceCounts[device] || 0) + 1;
      if (key) ensureLanding(landingPage).visitors.add(key);
      if (key && !firstVisitByActor.has(key)) firstVisitByActor.set(key, eventTime(event));
    }
    if (event.name === "website_visit") {
      mark("visitors", key || `visit_${eventTime(event)}`, meta);
      mark("landingPageViews", key || `land_${eventTime(event)}`, { ...meta, label: landingPage });
    } else if (event.name === "page_view") {
      mark("landingPageViews", key || `land_${eventTime(event)}`, { ...meta, label: landingPage });
    }
    if (isCtaClickEvent(event)) {
      const kind = ctaKind(event);
      ctaKindCounts[kind] = (ctaKindCounts[kind] || 0) + 1;
      mark("ctaClicks", key || `cta_${eventTime(event)}`, { ...meta, label: kind });
    }
    if (isSignupStartEvent(event) || (event.name === "cta_click" && ctaKind(event) === "start_free")) {
      mark("signupStarts", key || email || `start_${eventTime(event)}`, meta);
    }
    if (event.name === "account_signup_complete") {
      const signupKey = email || key;
      mark("signupCompletions", signupKey, meta);
      ensureLanding(landingPage).signups.add(signupKey);
      const first = firstVisitByActor.get(key) || firstVisitByActor.get(email);
      const signupMs = eventTime(event);
      if (first && signupMs >= first) visitToSignupHours.push((signupMs - first) / 3600000);
    }
    if (event.name === "checkout_success") {
      const paidKey = email || key;
      mark("paidConversions", paidKey, meta);
      ensureLanding(landingPage).paid.add(paidKey);
    }
    if (event.name === "email_verified" || event.name === "email_verification_complete") {
      mark("emailVerified", email || key, meta);
    }
  }

  for (const user of users) {
    const email = normalizeEmail(user.email);
    if (!email) continue;
    const eventSource = eventFunnelSource({ attribution: user.attribution }, user);
    const device = detectFunnelDevice(user.userAgent || user.lastUserAgent || "");
    const landingPage = landingPathFromEvent({ attribution: user.attribution }, user);
    const baseMeta = {
      source: eventSource,
      device,
      landingPage,
      email,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
    };

    const signupAt = user.signupAt || user.createdAt || "";
    const signupMs = signupAt ? new Date(signupAt).getTime() : 0;
    if (signupMs && (!range.startMs || signupMs >= range.startMs)) {
      mark("signupCompletions", email, { ...baseMeta, reachedAt: signupAt });
      ensureLanding(landingPage).signups.add(email);
      const firstSeen = user.attribution?.firstSeenAt || user.attribution?.firstVisitAt || "";
      const firstMs = firstSeen ? new Date(firstSeen).getTime() : 0;
      if (firstMs && signupMs >= firstMs) visitToSignupHours.push((signupMs - firstMs) / 3600000);
    }

    const verifiedAt = user.emailVerifiedAt || "";
    const verifiedMs = verifiedAt ? new Date(verifiedAt).getTime() : 0;
    if (user.emailVerified === true || user.emailVerified === "true") {
      if (!range.startMs || (verifiedMs && verifiedMs >= range.startMs) || (signupMs && signupMs >= range.startMs)) {
        mark("emailVerified", email, { ...baseMeta, reachedAt: verifiedAt || signupAt });
      }
    }

    const trialAt = user.metaStartTrialAt || user.trialStart || user.trialStartedAt || "";
    const trialMs = trialAt ? new Date(trialAt).getTime() : 0;
    if (trialMs && (!range.startMs || trialMs >= range.startMs)) {
      mark("trialStarts", email, { ...baseMeta, reachedAt: trialAt });
    }

    const trialEndAt = user.trialEnd || user.trialEndedAt || "";
    const trialEndMs = trialEndAt ? new Date(trialEndAt).getTime() : 0;
    if (trialMs && trialEndMs && trialEndMs <= Date.now() && (!range.startMs || trialEndMs >= range.startMs)) {
      mark("trialEnded", email, { ...baseMeta, reachedAt: trialEndAt });
    }

    const paidAt = user.metaPurchaseAt || user.firstPaidInvoiceAt || "";
    const paidMs = paidAt ? new Date(paidAt).getTime() : 0;
    if (paidMs && (!range.startMs || paidMs >= range.startMs)) {
      mark("paidConversions", email, { ...baseMeta, reachedAt: paidAt });
      ensureLanding(landingPage).paid.add(email);
      if (signupMs && paidMs >= signupMs) signupToPaidHours.push((paidMs - signupMs) / 3600000);
    }

    if (isActiveSubscriber(user)) {
      mark("activeSubscribers", email, { ...baseMeta, reachedAt: paidAt || trialAt || signupAt });
    }
  }

  const nonTestEvents = scoped.filter((event) => !isTestActor(event));
  const actorLinks = buildActorLinkIndex(nonTestEvents);
  // Also link known user emails to any visitor keys seen on their events.
  for (const user of users) {
    const email = normalizeEmail(user.email);
    if (!email) continue;
    for (const event of nonTestEvents) {
      const eventEmail = normalizeEmail(event.user || event.detail?.email || "");
      if (eventEmail !== email) continue;
      if (event.visitorId) {
        actorLinks.visitorToEmail.set(String(event.visitorId).trim().toLowerCase(), email);
        if (!actorLinks.emailToVisitors.has(email)) actorLinks.emailToVisitors.set(email, new Set());
        actorLinks.emailToVisitors.get(email).add(String(event.visitorId).trim().toLowerCase());
      }
    }
  }

  for (let i = 0; i < FUNNEL_STAGE_DEFS.length; i += 1) {
    const current = FUNNEL_STAGE_DEFS[i];
    const currentRole = resolveFunnelStageRole(current, emailVerificationRequired);
    // Optional stages are informational metrics — do not mark people as dropped for skipping them.
    if (currentRole === "optional" || currentRole === "snapshot") {
      for (const [, person] of people[current.id].entries()) {
        person.exitedAfter = "";
        person.exitedBefore = "";
        person.exitLabel = currentRole === "optional" ? "Informational stage" : "Current snapshot";
      }
      continue;
    }
    const next = nextActionableStageDef(i, emailVerificationRequired);
    if (!next) continue;
    for (const [, person] of people[current.id].entries()) {
      if (!person.email) {
        const linked = actorLinks.visitorToEmail.get(String(person.key || "").trim().toLowerCase());
        if (linked) person.email = linked;
      }
      const reachedNext = stageHasActor(overall[next.id], person, actorLinks);
      if (!reachedNext) {
        person.exitedAfter = current.id;
        person.exitedBefore = next.id;
        person.exitLabel = `Left before ${next.label}`;
      } else {
        person.exitedAfter = "";
        person.exitedBefore = "";
        person.exitLabel = `Reached ${next.label}`;
      }
    }
  }

  const actorActivity = buildActorActivityIndex(nonTestEvents);

  const maxCount = Math.max(1, ...FUNNEL_STAGE_DEFS.map((def) => overall[def.id].size));
  const stages = FUNNEL_STAGE_DEFS.map((def, index) => {
    const count = overall[def.id].size;
    const role = resolveFunnelStageRole(def, emailVerificationRequired);
    const prevDef = index === 0 ? null : FUNNEL_STAGE_DEFS[index - 1];
    const prevCount = index === 0 ? count : overall[prevDef.id].size;
    const converted = index === 0 ? count : Math.min(count, prevCount);
    const dropped = index === 0 ? 0 : Math.max(prevCount - count, 0);
    const informationalEdge = index > 0 && (
      isOptionalFunnelStage(def, emailVerificationRequired)
      || isOptionalFunnelStage(prevDef, emailVerificationRequired)
    );
    return {
      id: def.id,
      label: def.label,
      count,
      role,
      informational: role === "optional",
      shareOfTop: pct(count, maxCount),
      conversionFromPrev: index === 0 ? 100 : pct(converted, prevCount),
      conversionFromPrevLabel: index === 0 ? "100%" : rate(converted, prevCount),
      dropOffFromPrev: informationalEdge ? 0 : (index === 0 ? 0 : pct(dropped, prevCount)),
      dropOffFromPrevLabel: informationalEdge ? "n/a (optional)" : (index === 0 ? "0%" : rate(dropped, prevCount)),
      dropOffCount: informationalEdge ? 0 : dropped,
      rawDropOffCount: dropped,
      snapshot: role === "snapshot",
    };
  });
  const transitions = buildStageTransitions(stages, { emailVerificationRequired });
  const advisorTransitions = buildAdvisorFunnelTransitions(stages);
  const worstDrop = pickWorstActionableDropOff(advisorTransitions)
    || pickWorstActionableDropOff(transitions);

  const bySource = FUNNEL_SOURCES.map((src) => {
    const sourceStages = FUNNEL_STAGE_DEFS.map((def) => ({
      id: def.id,
      label: def.label,
      count: bySourceSets[src][def.id].size,
    }));
    const paidConversions = sourceStages.find((s) => s.id === "paidConversions")?.count || 0;
    return {
      source: src,
      stages: sourceStages,
      counts: Object.fromEntries(sourceStages.map((s) => [s.id, s.count])),
      transitions: buildStageTransitions(sourceStages, { emailVerificationRequired }),
      visitors: sourceStages[0].count,
      paidConversions,
      overallConversionRate: rate(paidConversions, sourceStages[0].count),
    };
  }).filter((row) => FUNNEL_STAGE_DEFS.some((def) => row.counts[def.id] > 0));

  const topLandingPages = [...landingStats.entries()]
    .map(([page, stats]) => {
      const visitors = stats.visitors.size;
      const signups = stats.signups.size;
      const paid = stats.paid.size;
      return {
        page,
        visitors,
        signups,
        paid,
        signupRate: rate(signups, visitors),
        paidRate: rate(paid, visitors),
        conversionRate: pct(signups, visitors),
      };
    })
    .filter((row) => row.visitors > 0)
    .sort((a, b) => b.conversionRate - a.conversionRate || b.signups - a.signups || b.visitors - a.visitors)
    .slice(0, 12);

  const spend = readFunnelAdSpend(store);
  const signupCount = overall.signupCompletions.size;
  const paidCount = overall.paidConversions.size;
  const spendForFilter = sourceFilter ? (spend.bySource[sourceFilter] || 0) : spend.total;

  // Separate Early User vs regular Pro for discounted-subscriber visibility.
  const offerBreakdown = {
    early_user: 0,
    pro_monthly: 0,
    pro_annual: 0,
    founding: 0,
    other_paid: 0,
  };
  for (const user of users) {
    if (!isActiveSubscriber(user)) continue;
    const offer = String(user.billingOffer || "").trim().toLowerCase();
    const priceLock = String(user.priceLock || "").trim();
    if (offer === "early_user" || priceLock === "Early User") offerBreakdown.early_user += 1;
    else if (offer === "founding" || user.foundingMemberActive) offerBreakdown.founding += 1;
    else if (offer === "pro_annual" || String(user.subscriptionCadence || "").toLowerCase() === "annual") offerBreakdown.pro_annual += 1;
    else if (offer === "pro_monthly" || String(user.plan || "").toLowerCase() === "pro") offerBreakdown.pro_monthly += 1;
    else offerBreakdown.other_paid += 1;
  }

  const stagePeople = {};
  for (const def of FUNNEL_STAGE_DEFS) {
    if (stageFilter && def.id !== stageFilter) continue;
    stagePeople[def.id] = [...people[def.id].values()]
      .sort((a, b) => String(b.reachedAt).localeCompare(String(a.reachedAt)))
      .slice(0, 100)
      .map((person) => {
        const identity = actorIdentityKeys(person, actorLinks);
        const activity = resolveActorActivity(actorActivity, person, identity);
        const linkedEmail = identity.find((k) => k.includes("@")) || person.email || "";
        return {
          email: linkedEmail || person.email || "",
          name: person.name || "",
          visitorKey: (linkedEmail || person.email) ? "" : person.key,
          source: person.source,
          device: person.device,
          landingPage: person.landingPage,
          lastPage: activity.lastPage || person.landingPage || "/",
          minutesBeforeExit: activity.minutesBeforeExit,
          minutesBeforeExitLabel: formatMinutesLabel(activity.minutesBeforeExit),
          reachedAt: person.reachedAt,
          exitLabel: person.exitLabel || "",
          exitedBefore: person.exitedBefore || "",
          exitedAfter: person.exitedAfter || "",
        };
      });
  }

  const exitInsights = buildFunnelExitInsights({
    people,
    overall,
    transitions,
    landingStats,
    actorActivity,
    actorLinks,
    exitStageFilter,
    emailVerificationRequired,
  });

  return {
    range: range.key,
    sourceFilter: sourceFilter || "all",
    stageFilter: stageFilter || "",
    exitStageFilter: exitStageFilter || "",
    emailVerificationRequired,
    sources: ["all", ...FUNNEL_SOURCES],
    stages,
    transitions,
    advisorTransitions,
    worstDropOff: worstDrop,
    signupStepCounts: buildSignupStepCounts(scoped, isTestActor),
    freeSignupFunnel: buildFreeSignupFunnel(scoped, isTestActor),
    ctaBreakdown: {
      startFree: ctaKindCounts.start_free || 0,
      startTrial: ctaKindCounts.start_trial || 0,
    },
    bySource,
    deviceBreakdown: Object.entries(deviceCounts)
      .map(([key, count]) => ({ key, count }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count),
    topLandingPages,
    exitInsights,
    timing: {
      avgHoursVisitToSignup: avgHours(visitToSignupHours),
      avgHoursVisitToSignupLabel: formatHoursLabel(avgHours(visitToSignupHours)),
      avgHoursSignupToPaid: avgHours(signupToPaidHours),
      avgHoursSignupToPaidLabel: formatHoursLabel(avgHours(signupToPaidHours)),
      visitToSignupSamples: visitToSignupHours.length,
      signupToPaidSamples: signupToPaidHours.length,
    },
    costs: {
      configured: spend.configured,
      adSpend: spendForFilter || null,
      costPerSignup: costLabel(spendForFilter, signupCount),
      costPerPaid: costLabel(spendForFilter, paidCount),
      note: spend.configured
        ? "Costs use configured ad spend (MARKETING_AD_SPEND_* or store.marketingAdSpend)."
        : "Ad spend not configured — set MARKETING_AD_SPEND_* env vars to unlock cost metrics.",
    },
    offerBreakdown,
    stagePeople,
    overallConversionRate: rate(paidCount, stages[0]?.count || 0),
    note: emailVerificationRequired
      ? "Active subscribers is a current snapshot. Email verification is required in this environment, so verify→next-step drop-off counts toward recommendations."
      : "Active subscribers is a current snapshot. Email verified and Trial ended are informational (optional) — skipping them is not counted as drop-off. Recommendations focus on Visitor→Signup→Trial→Paid.",
  };
}

function buildAdvisor(store, events, range, extras = {}) {
  const usage = buildFeatureUsage(store, events, range);
  const funnel = buildMarketingFunnel(store, events, range);
  const marketing = extras.marketing || {};
  const featureReqs = buildFeatureRequestsCenter(store, { sort: "votes" });
  const churn = buildChurnDashboard(store, events, range);
  const content = buildContentHealth(store, events, range);
  const errors = buildErrorCenter(store, events, range, extras.monitoringSnapshot);
  const search = buildSearchAnalytics(store, events, range);
  const scoped = filterEvents(events, range.startMs);
  // Match Admin Analytics: exclude ephemeral QA/test actors from conversion KPIs.
  const isTestActor = (event) => testAccountGuard.shouldExcludeFromCustomerAnalytics(
    event?.user || event?.detail?.email || event?.email || "",
  );
  const customerScoped = scoped.filter((e) => !isTestActor(e));
  const { users: customerUsers } = testAccountGuard.filterUsersForCustomerAnalytics(
    Object.values(store.users || {}),
  );

  // Canonical visitor / signup / paid counts come from Marketing Funnel unique-actor sets
  // for this Insights range — never fall back across date ranges when a measured 0 occurs.
  const visitors = funnelStageCount(funnel, "visitors");
  const signups = funnelStageCount(funnel, "signupCompletions");
  const paid = funnelStageCount(funnel, "paidConversions");
  const trials = customerUsers.filter((u) => {
    const at = u.metaStartTrialAt || u.trialStart || "";
    if (!at) return false;
    return !range.startMs || new Date(at).getTime() >= range.startMs;
  }).length;

  const sourceRows = Array.isArray(marketing?.performance?.conversionBySource)
    ? marketing.performance.conversionBySource
    : [];
  const bestSource = sourceRows.slice().sort((a, b) => (b.paid || 0) - (a.paid || 0) || (b.signups || 0) - (a.signups || 0))[0];
  const topLesson = usage.mostViewedLessons[0];
  const topNoResult = search.noResults[0] || usage.searchNoResults[0];
  const topRequest = featureReqs.items[0];
  const revenueToday = Number(marketing?.realtime?.revenueToday || 0);
  const revenueMonth = Number(marketing?.funnel?.revenueThisMonth || 0);
  const openFeatureRequests = countOpenFeatureRequests(store);

  const formatCount = (value) => (value == null ? "—" : value);
  const summaryLines = [
    visitors == null
      ? `Unique website visitors unavailable (${range.key})`
      : `${visitors} unique website visitor${visitors === 1 ? "" : "s"} (${range.key})`,
    `${formatCount(signups)} new signup${signups === 1 ? "" : "s"}`,
    `${trials} trial start${trials === 1 ? "" : "s"}`,
    `${formatCount(paid)} paid conversion${paid === 1 ? "" : "s"}`,
    revenueMonth ? `Revenue this month: $${revenueMonth.toFixed(2)}` : (revenueToday ? `Revenue today: $${revenueToday.toFixed(2)}` : "Revenue: awaiting paid invoices in range"),
  ];
  if (bestSource) {
    summaryLines.push(`${bestSource.source} leads conversions (signups ${bestSource.signups || 0}, paid ${bestSource.paid || 0})`);
  }
  if (topNoResult) {
    summaryLines.push(`${topNoResult.count} search${topNoResult.count === 1 ? "" : "es"} for “${topNoResult.key}” returned no results`);
  } else if (search.instrumentation === "active_empty") {
    summaryLines.push("Search tracking is active for library search; no tracked searches occurred in this period");
  } else if (search.instrumentation === "pending") {
    summaryLines.push("Search demand tracking is ready but waiting on search event instrumentation");
  }
  if (topLesson) {
    summaryLines.push(`“${topLesson.key}” was viewed ${topLesson.count} time${topLesson.count === 1 ? "" : "s"}`);
  }
  if (topRequest) {
    summaryLines.push(`Top request: “${topRequest.title}” (${topRequest.votes} votes, ${topRequest.statusLabel})`);
  }
  const advisorEdges = Array.isArray(funnel.advisorTransitions) && funnel.advisorTransitions.length
    ? funnel.advisorTransitions
    : buildAdvisorFunnelTransitions(funnel.stages || []);
  const actionableWorst = pickWorstActionableDropOff(advisorEdges) || (
    funnel.worstDropOff && !funnel.worstDropOff.informational ? funnel.worstDropOff : null
  );
  // dropOffRateLabel is DROP-OFF math (fromCount - toCount) / fromCount — label it honestly.
  if (actionableWorst && actionableWorst.fromCount > 0 && actionableWorst.dropOffCount > 0) {
    const edgeLabel = actionableWorst.advisorLabel
      || `${actionableWorst.fromLabel} → ${actionableWorst.toLabel}`;
    summaryLines.push(
      `Largest drop-off: ${edgeLabel} (${actionableWorst.dropOffRateLabel} drop-off)`,
    );
  }
  if (funnel.freeSignupFunnel?.largestLeak?.fromCount > 0 && funnel.freeSignupFunnel.largestLeak.dropOffCount > 0) {
    summaryLines.push(funnel.freeSignupFunnel.largestLeakLabel);
  }
  if (!funnel.emailVerificationRequired) {
    summaryLines.push("Email verification is optional — verify rates are informational only");
  }

  const recommendations = [];
  const addRec = (priority, title, detail, hub, category = "conversion") => {
    recommendations.push({ priority, title, detail, hub, category });
  };

  const scopedEvents = customerScoped;
  const signupCompletions = signups == null ? 0 : signups;
  const firstLessons = scopedEvents.filter((e) => e.name === "first_lesson_opened" || e.name === "lesson_plan_view").length;
  const freeSelected = scopedEvents.filter((e) => e.name === "free_selected" || e.name === "free_plan_selected").length;
  const trialSelected = scopedEvents.filter((e) => e.name === "trial_selected").length;
  const welcomeViews = scopedEvents.filter((e) => e.name === "welcome_screen_viewed").length;

  // Onboarding opportunity: accounts created but little product use.
  if (signupCompletions >= 5 && firstLessons < Math.max(1, Math.round(signupCompletions * 0.4))) {
    addRec(
      "high",
      "Many new users create an account but never open a lesson plan",
      "Guide users to a lesson plan immediately after signup (Welcome → starter cards).",
      "feature-usage",
      "onboarding",
    );
  }
  // Conversion opportunity: Free explorers who never choose trial.
  if (freeSelected >= 5 && trialSelected < Math.max(1, Math.round(freeSelected * 0.25))) {
    addRec(
      "medium",
      "Many Free users explore the platform but never start a trial",
      "Improve the trial presentation after users experience the platform — not immediately at signup.",
      "marketing-funnel",
      "conversion",
    );
  }
  if (welcomeViews >= 5 && trialSelected + freeSelected < welcomeViews * 0.5) {
    addRec(
      "medium",
      "Welcome screen continues are not converting into an explore choice",
      "Consider clarifying the Free vs Trial chooser copy (A/B versions B–D).",
      "marketing-funnel",
      "onboarding",
    );
  }

  // Never recommend fixing optional gates (Email verified / Trial ended) as broken leaks.
  if (
    actionableWorst
    && actionableWorst.dropOffRate >= 50
    && actionableWorst.fromCount >= 5
    && !/email verified/i.test(`${actionableWorst.fromLabel} ${actionableWorst.toLabel}`)
    && actionableWorst.from !== "emailVerified"
    && actionableWorst.to !== "emailVerified"
    && actionableWorst.from !== "trialEnded"
    && actionableWorst.to !== "trialEnded"
  ) {
    const edgeLabel = actionableWorst.advisorLabel || `${actionableWorst.fromLabel} → ${actionableWorst.toLabel}`;
    const isTrialEdge = /trial/i.test(edgeLabel);
    addRec(
      "high",
      isTrialEdge
        ? `Conversion Opportunity: ${edgeLabel}`
        : `Largest drop-off: ${edgeLabel}`,
      `${actionableWorst.dropOffRateLabel} drop-off before ${actionableWorst.toLabel}. Focus on required steps (Visitor→Signup→Trial→Paid) — optional steps are informational only.`,
      "marketing-funnel",
      "conversion",
    );
  }
  const secondary = advisorEdges
    .filter((t) => t !== actionableWorst && t.dropOffRate >= 40 && t.fromCount >= 5)
    .sort((a, b) => b.dropOffRate - a.dropOffRate || b.dropOffCount - a.dropOffCount)[0];
  if (secondary && recommendations.length < 3) {
    addRec(
      "medium",
      `Conversion Opportunity: ${secondary.advisorLabel}`,
      `${secondary.dropOffRateLabel} drop-off on a required conversion step (${secondary.dropOffCount} people).`,
      "marketing-funnel",
      "conversion",
    );
  }
  if (topNoResult) {
    addRec("high", `Content Opportunity: build “${topNoResult.key}”`, `${topNoResult.count} no-result searches in this range.`, "search-analytics", "content");
  }
  if (topLesson) {
    addRec(
      "high",
      `Content Opportunity: improve “${topLesson.key}”`,
      "Highest viewed lesson — many users open this before upgrading. Feature it and polish the trial presentation around it.",
      "feature-usage",
      "content",
    );
  }
  if (topRequest && ["New", "Under Review", "Planned"].includes(topRequest.status)) {
    addRec("medium", `Retention Opportunity: advance “${topRequest.title}”`, `${topRequest.votes} votes — update status or estimate a release.`, "feature-requests", "retention");
  }
  const trialEnding = Object.values(store.users || {}).filter((u) => {
    if (!u.trialEnd) return false;
    const end = new Date(u.trialEnd).getTime();
    const days = (end - Date.now()) / 86400000;
    return days >= 0 && days <= 2;
  });
  if (trialEnding.length) {
    addRec("high", `Conversion Opportunity: email ${trialEnding.length} trial user${trialEnding.length === 1 ? "" : "s"} ending within 48 hours`, "Convert while intent is highest.", "advisor", "conversion");
  }
  const inactivePro = Object.values(store.users || {}).filter((u) => {
    const plan = String(u.plan || "").toLowerCase();
    if (!plan.includes("pro") && !plan.includes("found")) return false;
    const last = new Date(u.lastSeenAt || u.lastLoginAt || 0).getTime();
    return !last || (Date.now() - last) > 14 * 86400000;
  });
  if (inactivePro.length) {
    addRec("medium", `Retention Opportunity: reach ${Math.min(inactivePro.length, 25)} inactive Pro/Founding members`, "No activity in 14+ days — win-back message.", "churn-dashboard", "retention");
  }
  if (errors.serverMonitor && errors.serverMonitor.ok === false) {
    addRec("high", "Investigate 5xx error spike", errors.serverMonitor.detail || "Error rate check is failing.", "error-center", "retention");
  }
  if (content.updateRecommendations[0]) {
    addRec("medium", `Content Opportunity: update “${content.updateRecommendations[0].title}”`, content.updateRecommendations[0].reason, "content-health", "content");
  }
  if (bestSource && String(bestSource.source).toLowerCase().includes("tiktok") === false && (bestSource.signups || 0) > 0) {
    addRec("low", `Conversion Opportunity: double down on ${bestSource.source}`, "Best converting source in marketing attribution for this snapshot.", "advisor", "conversion");
  }
  if (!recommendations.length) {
    addRec("low", "Keep collecting usage signals", "Not enough conversion pressure today — review Feature Usage and Content Health.", "feature-usage", "onboarding");
  }

  return {
    range: range.key,
    generatedAt: new Date().toISOString(),
    headline: "Today's Summary",
    summaryLines,
    metrics: {
      visitors: visitors == null ? null : visitors,
      visitorsLabel: "Unique visitors",
      signups: signups == null ? null : signups,
      trials,
      paid: paid == null ? null : paid,
      avgSessionMinutes: usage.avgSessionMinutes,
      openFeatureRequests,
      monthlyCancels: churn.monthlyChurnEvents,
    },
    recommendations: recommendations.slice(0, 8),
    freeSignupFunnel: funnel.freeSignupFunnel || null,
    engine: "rules-v1",
    note: "Rule-based Business Advisor using live analytics. Optional LLM narrative can layer on later without changing the underlying metrics.",
  };
}

function buildInsights(store, {
  hub = "advisor",
  range = "7d",
  email = "",
  sort = "votes",
  category = "",
  status = "",
  source = "",
  stage = "",
  exitStage = "",
  events = null,
  marketing = null,
  monitoringSnapshot = null,
  getSeoStatus = null,
  getBuildInfo = null,
} = {}) {
  const hubKey = HUBS.includes(hub) ? hub : "advisor";
  const rangeInfo = parseRange(range);
  const analyticsEvents = Array.isArray(events) ? events : (store.analyticsEvents || []);

  const base = {
    hub: hubKey,
    range: rangeInfo.key,
    hubs: HUBS.slice(),
    ranges: RANGES.slice(),
    updatedAt: new Date().toISOString(),
  };

  switch (hubKey) {
    case "marketing-funnel":
      return {
        ...base,
        data: buildMarketingFunnel(store, analyticsEvents, rangeInfo, { source, stage, exitStage }),
      };
    case "feature-usage":
      return { ...base, data: buildFeatureUsage(store, analyticsEvents, rangeInfo) };
    case "user-journey":
      return { ...base, data: buildUserJourney(store, email, analyticsEvents) };
    case "feature-requests":
      return { ...base, data: buildFeatureRequestsCenter(store, { sort, category, status }) };
    case "error-center":
      return { ...base, data: buildErrorCenter(store, analyticsEvents, rangeInfo, monitoringSnapshot) };
    case "search-analytics":
      return { ...base, data: buildSearchAnalytics(store, analyticsEvents, rangeInfo) };
    case "email-analytics":
      return { ...base, data: buildEmailAnalytics(store) };
    case "seo-dashboard":
      return { ...base, data: buildSeoDashboard(store, { getSeoStatus }) };
    case "churn-dashboard":
      return { ...base, data: buildChurnDashboard(store, analyticsEvents, rangeInfo) };
    case "content-health":
      return { ...base, data: buildContentHealth(store, analyticsEvents, rangeInfo) };
    case "release-center":
      return { ...base, data: buildReleaseCenter({ getBuildInfo, monitoringSnapshot }) };
    case "advisor":
    default:
      return {
        ...base,
        data: buildAdvisor(store, analyticsEvents, rangeInfo, { marketing, monitoringSnapshot }),
      };
  }
}

module.exports = {
  HUBS,
  RANGES,
  FUNNEL_STAGE_DEFS,
  ADVISOR_FUNNEL_EDGES,
  SIGNUP_STEP_EVENT_NAMES,
  FREE_SIGNUP_FUNNEL_STAGE_DEFS,
  parseRange,
  buildInsights,
  buildFeatureUsage,
  buildMarketingFunnel,
  buildFreeSignupFunnel,
  buildUserJourney,
  buildFeatureRequestsCenter,
  buildAdvisor,
  buildSearchAnalytics,
  buildEmailAnalytics,
  buildTransitionRow,
  buildAdvisorFunnelTransitions,
  isEmailVerificationRequired,
  resolveFunnelStageRole,
  pickWorstActionableDropOff,
  isOpenFeatureRequestStatus,
  countOpenFeatureRequests,
  funnelStageCount,
  CLOSED_FEATURE_REQUEST_STATUSES,
};
