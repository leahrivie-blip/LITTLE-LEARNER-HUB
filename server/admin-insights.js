/**
 * Admin Dashboard 2.0 — read-only insights derived from existing store + analytics.
 * No pricing/membership/Stripe/auth changes. Safe to call from admin APIs only.
 */

const HUBS = Object.freeze([
  "advisor",
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

  return {
    range: range.key,
    mostUsedPages,
    leastUsedPages,
    avgSessionMinutes: sessions.avgSessionMinutes,
    sessionCount: sessions.sessionCount,
    dropOffPoints: sessions.dropOffPoints,
    mostUsedFeatures,
    searchNoResults: noResultSearches,
    searchInstrumentation: searchEvents.length > 0 ? "live" : "pending",
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
  return {
    range: range.key,
    instrumentation: searches.length ? "live" : "pending",
    mostSearched: terms,
    noResults,
    leadingToLessonViews: toLesson.length,
    leadingToSignups: toSignup.length,
    leadingToSubscriptions: toSub.length,
    contentRecommendations: recommendations,
    note: searches.length
      ? ""
      : "Search event instrumentation is pending. Hub is ready; queries will appear after search_query / search_no_results events start flowing.",
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
  const receiptSent = receiptRows.length || sent;

  return {
    instrumentation: {
      opensClicks: receiptRows.length ? "partial" : "pending",
      note: "Open/click available for welcome/founding campaigns; general automations currently track send/fail/unsubscribe.",
    },
    totals: {
      sent: sent || receiptSent,
      delivered: Math.max((sent || receiptSent) - failed, 0),
      failed,
      openRate: rate(opened, receiptSent || 1),
      clickRate: rate(clicked, receiptSent || 1),
      conversionRate: "—",
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

function buildAdvisor(store, events, range, extras = {}) {
  const usage = buildFeatureUsage(store, events, range);
  const marketing = extras.marketing || {};
  const featureReqs = buildFeatureRequestsCenter(store, { sort: "votes" });
  const churn = buildChurnDashboard(store, events, range);
  const content = buildContentHealth(store, events, range);
  const errors = buildErrorCenter(store, events, range, extras.monitoringSnapshot);
  const search = buildSearchAnalytics(store, events, range);
  const scoped = filterEvents(events, range.startMs);

  const visitors = scoped.filter((e) => e.name === "website_visit").length
    || Number(marketing?.realtime?.sessionVisitsToday || 0);
  const signups = scoped.filter((e) => e.name === "account_signup_complete").length;
  const trials = Object.values(store.users || {}).filter((u) => {
    const at = u.metaStartTrialAt || u.trialStart || "";
    if (!at) return false;
    return !range.startMs || new Date(at).getTime() >= range.startMs;
  }).length;
  const paid = scoped.filter((e) => e.name === "checkout_success").length
    || Object.values(store.users || {}).filter((u) => {
      const at = u.metaPurchaseAt || u.firstPaidInvoiceAt || "";
      return at && (!range.startMs || new Date(at).getTime() >= range.startMs);
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

  const summaryLines = [
    `${visitors} website session visit${visitors === 1 ? "" : "s"} (${range.key})`,
    `${signups} new signup${signups === 1 ? "" : "s"}`,
    `${trials} trial start${trials === 1 ? "" : "s"}`,
    `${paid} paid conversion${paid === 1 ? "" : "s"}`,
    revenueMonth ? `Revenue this month: $${revenueMonth.toFixed(2)}` : (revenueToday ? `Revenue today: $${revenueToday.toFixed(2)}` : "Revenue: awaiting paid invoices in range"),
  ];
  if (bestSource) {
    summaryLines.push(`${bestSource.source} leads conversions (signups ${bestSource.signups || 0}, paid ${bestSource.paid || 0})`);
  }
  if (topNoResult) {
    summaryLines.push(`${topNoResult.count} search${topNoResult.count === 1 ? "" : "es"} for “${topNoResult.key}” returned no results`);
  } else if (search.instrumentation === "pending") {
    summaryLines.push("Search demand tracking is ready but waiting on search event instrumentation");
  }
  if (topLesson) {
    summaryLines.push(`“${topLesson.key}” was viewed ${topLesson.count} time${topLesson.count === 1 ? "" : "s"}`);
  }
  if (topRequest) {
    summaryLines.push(`Top request: “${topRequest.title}” (${topRequest.votes} votes, ${topRequest.statusLabel})`);
  }

  const recommendations = [];
  const addRec = (priority, title, detail, hub) => {
    recommendations.push({ priority, title, detail, hub });
  };
  if (topNoResult) {
    addRec("high", `Build content for “${topNoResult.key}”`, `${topNoResult.count} no-result searches in this range.`, "search-analytics");
  }
  if (topLesson) {
    addRec("high", `Promote “${topLesson.key}”`, "Highest viewed lesson — feature it on TikTok/Facebook and homepage.", "feature-usage");
  }
  if (topRequest && ["New", "Under Review", "Planned"].includes(topRequest.status)) {
    addRec("medium", `Advance feature request “${topRequest.title}”`, `${topRequest.votes} votes — update status or estimate a release.`, "feature-requests");
  }
  const trialEnding = Object.values(store.users || {}).filter((u) => {
    if (!u.trialEnd) return false;
    const end = new Date(u.trialEnd).getTime();
    const days = (end - Date.now()) / 86400000;
    return days >= 0 && days <= 2;
  });
  if (trialEnding.length) {
    addRec("high", `Email ${trialEnding.length} trial user${trialEnding.length === 1 ? "" : "s"} ending within 48 hours`, "Convert while intent is highest.", "advisor");
  }
  const inactivePro = Object.values(store.users || {}).filter((u) => {
    const plan = String(u.plan || "").toLowerCase();
    if (!plan.includes("pro") && !plan.includes("found")) return false;
    const last = new Date(u.lastSeenAt || u.lastLoginAt || 0).getTime();
    return !last || (Date.now() - last) > 14 * 86400000;
  });
  if (inactivePro.length) {
    addRec("medium", `Reach out to ${Math.min(inactivePro.length, 25)} inactive Pro/Founding members`, "No activity in 14+ days — win-back message.", "churn-dashboard");
  }
  if (errors.serverMonitor && errors.serverMonitor.ok === false) {
    addRec("high", "Investigate 5xx error spike", errors.serverMonitor.detail || "Error rate check is failing.", "error-center");
  }
  if (content.updateRecommendations[0]) {
    addRec("medium", `Update “${content.updateRecommendations[0].title}”`, content.updateRecommendations[0].reason, "content-health");
  }
  if (bestSource && String(bestSource.source).toLowerCase().includes("tiktok") === false && (bestSource.signups || 0) > 0) {
    addRec("low", `Double down on ${bestSource.source}`, "Best converting source in marketing attribution for this snapshot.", "advisor");
  }
  if (!recommendations.length) {
    addRec("low", "Keep collecting usage signals", "Not enough conversion pressure today — review Feature Usage and Content Health.", "feature-usage");
  }

  return {
    range: range.key,
    generatedAt: new Date().toISOString(),
    headline: "Today's Summary",
    summaryLines,
    metrics: {
      visitors,
      signups,
      trials,
      paid,
      avgSessionMinutes: usage.avgSessionMinutes,
      openFeatureRequests: featureReqs.total,
      monthlyCancels: churn.monthlyChurnEvents,
    },
    recommendations: recommendations.slice(0, 8),
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
  parseRange,
  buildInsights,
  buildFeatureUsage,
  buildUserJourney,
  buildFeatureRequestsCenter,
  buildAdvisor,
};
