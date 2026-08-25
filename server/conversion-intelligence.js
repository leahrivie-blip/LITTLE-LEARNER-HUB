/**
 * Conversion Intelligence — admin-only Free → Pro funnel analytics.
 * Read-only aggregates from existing analytics events + user store.
 */

const testAccountGuard = require("./test-account-guard.js");
const membershipAccess = require("../scripts/membership-access.js");
const conversionEvents = require("./conversion-events.js");
const conversionPhase2 = require("./conversion-phase2.js");
const conversionLeads = require("./conversion-leads.js");

const {
  FUNNEL_STAGES,
  INTENT_WEIGHTS,
  resolveCanonicalEvent,
  eventActorKey,
  normalizeAttributionSource,
  extractAgeGroup,
  extractCtaLocation,
  extractProFeatureType,
} = conversionEvents;

/** @typedef {"today"|"3d"|"7d"|"14d"|"30d"|"all"|"custom"} ConversionRangeKey */

const RANGE_KEYS = Object.freeze(["today", "3d", "7d", "14d", "30d", "all", "custom"]);

/**
 * @param {string} range
 * @param {string} [startDate]
 * @param {string} [endDate]
 */
function parseConversionRange(range = "7d", startDate = "", endDate = "") {
  const key = RANGE_KEYS.includes(String(range || "").toLowerCase())
    ? String(range).toLowerCase()
    : "7d";
  const now = Date.now();
  if (key === "custom" && startDate && endDate) {
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      return { key, startMs, endMs: endMs + 86400000 - 1, label: `${startDate} → ${endDate}` };
    }
  }
  if (key === "all") return { key, startMs: 0, endMs: now, label: "All time" };
  if (key === "today") {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return { key, startMs: d.getTime(), endMs: now, label: "Today (UTC)" };
  }
  const days = { "3d": 3, "7d": 7, "14d": 14, "30d": 30 }[key] || 7;
  return {
    key,
    startMs: now - days * 86400000,
    endMs: now,
    label: key === "3d" ? "Last 3 days" : key === "14d" ? "Last 14 days" : key === "30d" ? "Last 30 days" : "Last 7 days",
  };
}

/**
 * @param {unknown} event
 */
function eventTime(event) {
  const ts = new Date(/** @type {{ createdAt?: string }} */ (event)?.createdAt || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

/**
 * @param {unknown} event
 * @param {{ startMs: number, endMs?: number }} range
 */
function eventInRange(event, range) {
  const t = eventTime(event);
  if (!t) return false;
  if (range.startMs && t < range.startMs) return false;
  if (range.endMs && t > range.endMs) return false;
  return true;
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

/**
 * @param {unknown} event
 */
function isTestActor(event) {
  const email = normalizeEmail(/** @type {{ user?: string }} */ (event)?.user || "");
  if (email && testAccountGuard.shouldRejectTestAccountPersistence(email)) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} user
 */
function userHasAuthoritativePaidConversion(user = {}) {
  if (!user || !membershipAccess.membershipHasProAccess(user)) return false;
  const stripeStatus = String(user.stripeSubscriptionStatus || "").toLowerCase();
  const subStatus = String(user.subscriptionStatus || "").toLowerCase();
  if (stripeStatus === "unpaid" || stripeStatus === "past_due") return false;
  if (subStatus.includes("billing review required") || subStatus.includes("payment failed") || subStatus.includes("past due")) {
    return false;
  }
  if (subStatus.includes("canceled") && subStatus.includes("access ends")) return false;
  if (user.firstPaidInvoiceAt || user.metaPurchaseAt) return true;
  if (stripeStatus === "active" && !membershipAccess.membershipUserInTrial(user)) return true;
  return false;
}

/**
 * @param {Array<unknown>} events
 * @param {Record<string, Record<string, unknown>>} usersByEmail
 */
function buildActorProfiles(events, usersByEmail) {
  /** @type {Map<string, { email: string, visitorIds: Set<string>, events: Array<unknown>, source: string, signupAt: string, sessions: Set<string>, lessonViews: number, activityViews: number, proEncounters: number, pricingViews: number, upgradeClicks: number, checkoutStarts: number, checkoutCompleted: boolean, paidActive: boolean, lastActive: string, ageGroups: Set<string>, converted: boolean }>} */
  const profiles = new Map();

  const ensure = (actorKey, email = "") => {
    if (!profiles.has(actorKey)) {
      const user = email ? usersByEmail[email] : null;
      profiles.set(actorKey, {
        email: email || "",
        visitorIds: new Set(),
        events: [],
        source: user?.attribution?.source ? normalizeAttributionSource({ attribution: user.attribution }) : "Unknown",
        signupAt: String(user?.signupAt || user?.createdAt || ""),
        sessions: new Set(),
        lessonViews: 0,
        activityViews: 0,
        proEncounters: 0,
        pricingViews: 0,
        upgradeClicks: 0,
        checkoutStarts: 0,
        checkoutCompleted: false,
        paidActive: false,
        lastActive: "",
        ageGroups: new Set(),
        converted: false,
      });
    }
    return /** @type {NonNullable<ReturnType<typeof profiles.get>>} */ (profiles.get(actorKey));
  };

  const linkEmail = (actorKey, email) => {
    const clean = normalizeEmail(email);
    if (!clean) return actorKey;
    const emailKey = `email:${clean}`;
    if (actorKey === emailKey) return actorKey;
    const existing = profiles.get(actorKey);
    const emailProfile = ensure(emailKey, clean);
    if (existing && actorKey !== emailKey) {
      for (const vid of existing.visitorIds) emailProfile.visitorIds.add(vid);
      emailProfile.events.push(...existing.events);
      profiles.delete(actorKey);
    }
    return emailKey;
  };

  for (const event of events) {
    if (isTestActor(event)) continue;
    let actorKey = eventActorKey(event);
    if (!actorKey) continue;
    const email = normalizeEmail(/** @type {{ user?: string }} */ (event).user || "");
    if (email) actorKey = linkEmail(actorKey, email);
    const profile = ensure(actorKey, email);
    const e = /** @type {{ visitorId?: string, sessionId?: string, createdAt?: string }} */ (event);
    if (e.visitorId) profile.visitorIds.add(String(e.visitorId));
    if (e.sessionId) profile.sessions.add(String(e.sessionId));
    profile.events.push(event);
    if (e.createdAt && (!profile.lastActive || e.createdAt > profile.lastActive)) {
      profile.lastActive = e.createdAt;
    }
    const canonical = resolveCanonicalEvent(event);
    if (!canonical) continue;
    const age = extractAgeGroup(event);
    if (age) profile.ageGroups.add(age);
    if (canonical === "lesson_viewed") profile.lessonViews += 1;
    if (canonical === "activity_viewed") profile.activityViews += 1;
    if (canonical === "pro_content_encountered") profile.proEncounters += 1;
    if (canonical === "pricing_viewed") profile.pricingViews += 1;
    if (canonical === "upgrade_cta_clicked") profile.upgradeClicks += 1;
    if (canonical === "checkout_started") profile.checkoutStarts += 1;
    if (canonical === "checkout_completed") profile.checkoutCompleted = true;
    if (canonical === "account_created" && !profile.signupAt) {
      profile.signupAt = e.createdAt || "";
      profile.source = normalizeAttributionSource(event);
    }
  }

  for (const [email, user] of Object.entries(usersByEmail)) {
    if (testAccountGuard.shouldRejectTestAccountPersistence(email)) continue;
    const actorKey = `email:${email}`;
    const profile = ensure(actorKey, email);
    profile.converted = userHasAuthoritativePaidConversion(user);
    profile.paidActive = profile.converted;
    if (user.attribution?.source && profile.source === "Unknown") {
      profile.source = normalizeAttributionSource({ attribution: user.attribution });
    }
    if (user.signupAt || user.createdAt) profile.signupAt = String(user.signupAt || user.createdAt);
  }

  return profiles;
}

/**
 * @param {Map<string, { converted: boolean, paidActive: boolean, events: Array<unknown> }>} profiles
 * @param {string} stageEvent
 */
function actorsReachingStage(profiles, stageEvent) {
  /** @type {Set<string>} */
  const reached = new Set();
  for (const [key, profile] of profiles) {
    if (stageEvent === "paid_subscription_active" && profile.paidActive) {
      reached.add(key);
      continue;
    }
    const hit = profile.events.some((ev) => resolveCanonicalEvent(ev) === stageEvent);
    if (hit) reached.add(key);
  }
  return reached;
}

/**
 * @param {Map<string, { converted: boolean, freeUsers?: number, events: Array<unknown>, paidActive: boolean }>} profiles
 */
function buildFunnel(profiles) {
  const signupActors = actorsReachingStage(profiles, "account_created");
  const baseCount = signupActors.size || profiles.size;
  const denominator = Math.max(baseCount, 1);

  /** @type {Array<Record<string, unknown>>} */
  const stages = [];
  let prevCount = baseCount;
  let biggestDrop = { from: "", to: "", dropPct: 0, dropCount: 0 };

  for (let i = 0; i < FUNNEL_STAGES.length; i += 1) {
    const def = FUNNEL_STAGES[i];
    const reached = actorsReachingStage(profiles, def.event);
    const count = reached.size;
    const pctOfSignups = baseCount ? Number(((count / denominator) * 100).toFixed(1)) : 0;
    const pctContinuing = prevCount ? Number(((count / prevCount) * 100).toFixed(1)) : 0;
    const dropCount = Math.max(prevCount - count, 0);
    const dropPct = prevCount ? Number(((dropCount / prevCount) * 100).toFixed(1)) : 0;

    let freeUsers = 0;
    let convertedUsers = 0;
    for (const key of reached) {
      const p = profiles.get(key);
      if (!p) continue;
      if (p.converted) convertedUsers += 1;
      else freeUsers += 1;
    }

    if (i > 0 && dropPct > biggestDrop.dropPct) {
      const prevDef = FUNNEL_STAGES[i - 1];
      biggestDrop = { from: prevDef.label, to: def.label, dropPct, dropCount };
    }

    stages.push({
      id: def.id,
      label: def.label,
      uniqueUsers: count,
      pctOfSignups,
      pctContinuingFromPrev: i === 0 ? 100 : pctContinuing,
      dropOffPct: i === 0 ? 0 : dropPct,
      dropOffCount: i === 0 ? 0 : dropCount,
      freeUsers,
      convertedUsers,
    });
    prevCount = count || prevCount;
  }

  return { stages, baseCount, biggestDropOff: biggestDrop };
}

/**
 * @param {Map<string, { source: string, signupAt: string, converted: boolean, events: Array<unknown> }>} profiles
 */
function buildSourceConversion(profiles) {
  /** @type {Map<string, { signups: number, paid: number }>} */
  const bySource = new Map();
  for (const profile of profiles.values()) {
    const source = profile.source || "Unknown";
    if (!bySource.has(source)) bySource.set(source, { signups: 0, paid: 0 });
    const row = /** @type {{ signups: number, paid: number }} */ (bySource.get(source));
    if (profile.signupAt || profile.events.some((e) => resolveCanonicalEvent(e) === "account_created")) {
      row.signups += 1;
    }
    if (profile.converted) row.paid += 1;
  }
  return [...bySource.entries()]
    .map(([source, stats]) => ({
      source,
      signups: stats.signups,
      paid: stats.paid,
      conversionRate: stats.signups ? Number(((stats.paid / stats.signups) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.signups - a.signups);
}

/**
 * @param {Array<unknown>} events
 * @param {Map<string, { converted: boolean, email: string }>} profiles
 */
function buildContentBeforePurchase(events, profiles) {
  /** @type {Map<string, { lessonId: string, title: string, ageGroup: string, views: number, upgradeClicks: number, purchases: number }>} */
  const lessons = new Map();
  /** @type {Map<string, { ageGroup: string, signups: number, lessonViews: number, proEncounters: number, upgradeClicks: number, paid: number }>} */
  const ageGroups = new Map();

  const convertedEmails = new Set(
    [...profiles.values()].filter((p) => p.converted && p.email).map((p) => p.email),
  );

  for (const event of events) {
    if (isTestActor(event)) continue;
    const canonical = resolveCanonicalEvent(event);
    if (!canonical) continue;
    const detail = /** @type {{ detail?: Record<string, string> }} */ (event).detail || {};
    const email = normalizeEmail(/** @type {{ user?: string }} */ (event).user || "");
    const isConverted = Boolean(email && convertedEmails.has(email));
    const lessonId = String(detail.resourceId || detail.lessonId || "").trim();
    const title = String(detail.title || detail.lessonTitle || "").trim();
    const ageGroup = extractAgeGroup(event) || "Unknown";

    if (canonical === "lesson_viewed" || canonical === "activity_viewed") {
      const key = lessonId || title || "unknown";
      if (!lessons.has(key)) {
        lessons.set(key, { lessonId: lessonId || key, title: title || key, ageGroup, views: 0, upgradeClicks: 0, purchases: 0 });
      }
      const row = /** @type {NonNullable<ReturnType<typeof lessons.get>>} */ (lessons.get(key));
      row.views += 1;
      if (isConverted) row.purchases += 1;
    }
    if (canonical === "upgrade_cta_clicked" && lessonId) {
      const key = lessonId;
      if (!lessons.has(key)) {
        lessons.set(key, { lessonId: key, title: title || key, ageGroup, views: 0, upgradeClicks: 0, purchases: 0 });
      }
      const row = /** @type {NonNullable<ReturnType<typeof lessons.get>>} */ (lessons.get(key));
      row.upgradeClicks += 1;
    }

    if (!ageGroups.has(ageGroup)) {
      ageGroups.set(ageGroup, { ageGroup, signups: 0, lessonViews: 0, proEncounters: 0, upgradeClicks: 0, paid: 0 });
    }
    const ag = /** @type {NonNullable<ReturnType<typeof ageGroups.get>>} */ (ageGroups.get(ageGroup));
    if (canonical === "lesson_viewed" || canonical === "activity_viewed") ag.lessonViews += 1;
    if (canonical === "pro_content_encountered") ag.proEncounters += 1;
    if (canonical === "upgrade_cta_clicked") ag.upgradeClicks += 1;
    if (canonical === "account_created") ag.signups += 1;
    if (isConverted) ag.paid += 1;
  }

  const topLessons = [...lessons.values()]
    .map((row) => ({
      ...row,
      conversionRate: row.views ? Number(((row.purchases / row.views) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.upgradeClicks - a.upgradeClicks || b.views - a.views)
    .slice(0, 25);

  return {
    topLessons,
    topAgeGroups: [...ageGroups.values()].sort((a, b) => b.lessonViews - a.lessonViews),
  };
}

/**
 * @param {Array<unknown>} events
 */
function buildPaywallAnalytics(events) {
  /** @type {Map<string, { featureType: string, encounters: number, pricingVisits: number, upgradeClicks: number, purchases: number, actors: Set<string> }>} */
  const features = new Map();
  /** @type {Map<string, Set<string>>} */
  const actorPricing = new Map();
  /** @type {Map<string, Set<string>>} */
  const actorUpgrade = new Map();
  /** @type {Set<string>} */
  const paidActors = new Set();

  for (const event of events) {
    if (isTestActor(event)) continue;
    const actor = eventActorKey(event);
    if (!actor) continue;
    const canonical = resolveCanonicalEvent(event);
    if (canonical === "pricing_viewed") {
      if (!actorPricing.has(actor)) actorPricing.set(actor, new Set());
      actorPricing.get(actor)?.add(String(eventTime(event)));
    }
    if (canonical === "upgrade_cta_clicked") {
      if (!actorUpgrade.has(actor)) actorUpgrade.set(actor, new Set());
      actorUpgrade.get(actor)?.add(String(eventTime(event)));
    }
    if (canonical === "paid_subscription_active" || /** @type {{ name?: string }} */ (event).name === "checkout_success") {
      paidActors.add(actor);
    }
    if (canonical !== "pro_content_encountered") continue;
    const featureType = extractProFeatureType(event);
    if (!features.has(featureType)) {
      features.set(featureType, { featureType, encounters: 0, pricingVisits: 0, upgradeClicks: 0, purchases: 0, actors: new Set() });
    }
    const row = /** @type {NonNullable<ReturnType<typeof features.get>>} */ (features.get(featureType));
    row.encounters += 1;
    row.actors.add(actor);
  }

  const result = [];
  for (const row of features.values()) {
    let pricingVisits = 0;
    let upgradeClicks = 0;
    let purchases = 0;
    for (const actor of row.actors) {
      if (actorPricing.has(actor)) pricingVisits += 1;
      if (actorUpgrade.has(actor)) upgradeClicks += 1;
      if (paidActors.has(actor)) purchases += 1;
    }
    result.push({
      featureType: row.featureType,
      encounters: row.encounters,
      pricingVisits,
      upgradeClicks,
      purchases,
    });
  }

  return result.sort((a, b) => b.encounters - a.encounters);
}

/**
 * @param {Array<unknown>} events
 */
function buildCtaPerformance(events) {
  /** @type {Map<string, { cta: string, clicks: number, checkoutStarts: number, purchases: number, actors: Set<string>, conversionRate?: number }>} */
  const ctas = new Map();
  /** @type {Map<string, { upgraded: boolean, checkout: boolean, purchased: boolean }>} */
  const actorState = new Map();

  for (const event of events) {
    if (isTestActor(event)) continue;
    const actor = eventActorKey(event);
    if (!actor) continue;
    if (!actorState.has(actor)) actorState.set(actor, { upgraded: false, checkout: false, purchased: false });
    const state = /** @type {NonNullable<ReturnType<typeof actorState.get>>} */ (actorState.get(actor));
    const canonical = resolveCanonicalEvent(event);
    if (canonical === "checkout_started") state.checkout = true;
    if (canonical === "checkout_completed" || canonical === "paid_subscription_active") state.purchased = true;

    if (canonical !== "upgrade_cta_clicked") continue;
    const cta = extractCtaLocation(event);
    if (!ctas.has(cta)) ctas.set(cta, { cta, clicks: 0, checkoutStarts: 0, purchases: 0, actors: new Set() });
    const row = /** @type {NonNullable<ReturnType<typeof ctas.get>>} */ (ctas.get(cta));
    row.clicks += 1;
    row.actors.add(actor);
    state.upgraded = true;
  }

  for (const row of ctas.values()) {
    for (const actor of row.actors) {
      const state = actorState.get(actor);
      if (!state) continue;
      if (state.checkout) row.checkoutStarts += 1;
      if (state.purchased) row.purchases += 1;
    }
    row.conversionRate = row.clicks ? Number(((row.purchases / row.clicks) * 100).toFixed(1)) : 0;
    delete /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (row)).actors;
  }

  return [...ctas.values()].sort((a, b) => b.clicks - a.clicks);
}

/**
 * @param {Map<string, { upgradeClicks: number, checkoutStarts: number, checkoutCompleted: boolean, paidActive: boolean }>} profiles
 */
function buildCheckoutDropOff(profiles) {
  let clickedUpgrade = 0;
  let startedCheckout = 0;
  let completedPurchase = 0;
  let clickedNoCheckout = 0;
  let checkoutNoComplete = 0;

  for (const profile of profiles.values()) {
    if (profile.upgradeClicks > 0) {
      clickedUpgrade += 1;
      if (profile.checkoutStarts === 0) clickedNoCheckout += 1;
    }
    if (profile.checkoutStarts > 0) {
      startedCheckout += 1;
      if (!profile.checkoutCompleted && !profile.paidActive) checkoutNoComplete += 1;
    }
    if (profile.paidActive || profile.checkoutCompleted) completedPurchase += 1;
  }

  return {
    upgradeClicked: clickedUpgrade,
    checkoutStarted: startedCheckout,
    purchaseCompleted: completedPurchase,
    clickedUpgradeNoCheckout: clickedNoCheckout,
    checkoutStartedNoCompletion: checkoutNoComplete,
  };
}

/**
 * @param {{ lessonViews: number, activityViews: number, sessions: Set<string>, proEncounters: number, pricingViews: number, upgradeClicks: number, checkoutStarts: number, converted: boolean, events: Array<unknown> }} profile
 */
function computeIntentScore(profile) {
  let score = 0;
  /** @type {string[]} */
  const reasons = [];
  if (profile.lessonViews >= 1) { score += INTENT_WEIGHTS.lesson_viewed; reasons.push(`viewed ${profile.lessonViews} lesson${profile.lessonViews === 1 ? "" : "s"}`); }
  if (profile.lessonViews >= 3) { score += INTENT_WEIGHTS.multiple_lessons; reasons.push("viewed multiple lessons"); }
  if (profile.activityViews >= 1) { score += INTENT_WEIGHTS.activity_viewed; reasons.push(`opened ${profile.activityViews} activit${profile.activityViews === 1 ? "y" : "ies"}`); }
  if (profile.events.some((e) => resolveCanonicalEvent(e) === "printable_viewed")) {
    score += INTENT_WEIGHTS.printable_viewed;
    reasons.push("viewed printables");
  }
  if (profile.sessions.size >= 2) { score += INTENT_WEIGHTS.repeat_session; reasons.push(`returned ${profile.sessions.size} times`); }
  if (profile.proEncounters >= 1) { score += INTENT_WEIGHTS.pro_content_encountered; reasons.push(`encountered Pro content ${profile.proEncounters} time${profile.proEncounters === 1 ? "" : "s"}`); }
  if (profile.pricingViews >= 1) { score += INTENT_WEIGHTS.pricing_viewed; reasons.push(`viewed pricing ${profile.pricingViews} time${profile.pricingViews === 1 ? "" : "s"}`); }
  if (profile.upgradeClicks >= 1) { score += INTENT_WEIGHTS.upgrade_cta_clicked; reasons.push("clicked Upgrade"); }
  if (profile.checkoutStarts >= 1) { score += INTENT_WEIGHTS.checkout_started; reasons.push("started checkout"); }
  if (profile.events.some((e) => resolveCanonicalEvent(e) === "lesson_saved")) {
    score += INTENT_WEIGHTS.lesson_saved;
    reasons.push("saved a lesson");
  }

  let level = "Low engagement";
  if (score >= 70) level = "High purchase intent";
  else if (score >= 35) level = "Medium purchase intent";

  if (!profile.converted && profile.upgradeClicks > 0) reasons.push("has not purchased");

  return { score, level, reasons };
}

/**
 * @param {Map<string, Parameters<typeof computeIntentScore>[0] & { email: string, signupAt: string, source: string, sessions: Set<string>, lessonViews: number, proEncounters: number, pricingViews: number, upgradeClicks: number, checkoutStarts: number, lastActive: string, converted: boolean }>} profiles
 * @param {number} [limit]
 */
function buildHighIntentUsers(profiles, limit = 25) {
  const rows = [];
  for (const profile of profiles.values()) {
    if (profile.converted) continue;
    if (!profile.email) continue;
    const intent = computeIntentScore(profile);
    if (intent.level === "Low engagement") continue;
    rows.push({
      user: profile.email.replace(/(.{2}).+(@.+)/, "$1…$2"),
      email: profile.email,
      signupDate: profile.signupAt ? profile.signupAt.slice(0, 10) : "—",
      source: profile.source,
      sessions: profile.sessions.size,
      lessonsViewed: profile.lessonViews,
      proEncounters: profile.proEncounters,
      pricingViews: profile.pricingViews,
      upgradeClicks: profile.upgradeClicks,
      checkoutStarted: profile.checkoutStarts > 0 ? "Yes" : "No",
      lastActive: profile.lastActive ? profile.lastActive.slice(0, 16).replace("T", " ") : "—",
      intentLevel: intent.level,
      intentScore: intent.score,
      intentReasons: intent.reasons,
    });
  }
  return rows.sort((a, b) => b.intentScore - a.intentScore).slice(0, limit);
}

/**
 * @param {string} email
 * @param {Array<unknown>} events
 */
function buildUserJourney(email, events) {
  const clean = normalizeEmail(email);
  const scoped = events
    .filter((e) => !isTestActor(e) && normalizeEmail(/** @type {{ user?: string }} */ (e).user || "") === clean)
    .sort((a, b) => eventTime(a) - eventTime(b));

  /** @type {Array<{ time: string, label: string, detail: string }>} */
  const timeline = [];
  for (const event of scoped) {
    const canonical = resolveCanonicalEvent(event);
    if (!canonical) continue;
    const t = new Date(eventTime(event));
    const timeLabel = Number.isFinite(t.getTime())
      ? t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "—";
    const detail = /** @type {{ detail?: Record<string, string> }} */ (event).detail || {};
    let label = canonical.replace(/_/g, " ");
    let extra = "";
    if (canonical === "account_created") {
      label = "Account created";
      extra = `Source: ${normalizeAttributionSource(event)}`;
    } else if (canonical === "lesson_viewed") {
      label = `Viewed ${detail.title || "lesson"}`;
      if (detail.age || detail.ageGroup) extra = `Age: ${detail.age || detail.ageGroup}`;
    } else if (canonical === "activity_viewed") {
      label = `Opened activity${detail.title ? `: "${detail.title}"` : ""}`;
    } else if (canonical === "pro_content_encountered") {
      label = "Encountered Pro locked content";
      extra = extractProFeatureType(event);
    } else if (canonical === "pricing_viewed") label = "Viewed pricing";
    else if (canonical === "upgrade_cta_clicked") label = "Clicked Upgrade";
    else if (canonical === "checkout_started") label = "Checkout started";
    else if (canonical === "checkout_completed") label = "Checkout completed";
    else if (canonical === "paid_subscription_active") label = "Paid subscription active";
    else if (canonical === "printable_viewed") label = "Viewed printable";
    else if (canonical === "lesson_saved") label = "Saved lesson";

    timeline.push({ time: timeLabel, label, detail: extra });
  }

  const purchased = scoped.some((e) => {
    const c = resolveCanonicalEvent(e);
    return c === "checkout_completed" || c === "paid_subscription_active";
  });

  return { email: clean, timeline, purchased, outcome: purchased ? "Purchase completed" : "No purchase" };
}

/**
 * @param {Map<string, unknown>} profiles
 * @param {{ stages: Array<Record<string, unknown>>, baseCount: number, biggestDropOff: Record<string, unknown> }} funnel
 * @param {ReturnType<typeof buildCheckoutDropOff>} checkout
 * @param {Array<{ source: string, signups: number, conversionRate: number }>} sources
 * @param {number} sampleSize
 */
function buildRuleInsights(profiles, funnel, checkout, sources, sampleSize) {
  /** @type {Array<string>} */
  const insights = [];
  void profiles;
  if (sampleSize < 5) {
    return ["Not enough data yet."];
  }

  const pricingStage = funnel.stages.find((s) => s.id === "pricing_viewed");
  const upgradeStage = funnel.stages.find((s) => s.id === "upgrade_clicked");
  const signupCount = Number(funnel.baseCount || 0);

  if (pricingStage && signupCount > 0) {
    const pct = Number(pricingStage.pctOfSignups || 0);
    if (pct < 30) insights.push("Most free users are not reaching the pricing page.");
  }

  if (upgradeStage && pricingStage) {
    const pricingUsers = Number(pricingStage.uniqueUsers || 0);
    const upgradeUsers = Number(upgradeStage.uniqueUsers || 0);
    if (pricingUsers >= 5) {
      const rate = Number(((upgradeUsers / pricingUsers) * 100).toFixed(1));
      if (rate < 15) insights.push(`Users frequently encounter Pro content but only ${rate}% click Upgrade.`);
    }
  }

  if (checkout.clickedUpgrade > 0 && checkout.clickedUpgradeNoCheckout > 0) {
    const pct = Number(((checkout.clickedUpgradeNoCheckout / checkout.clickedUpgrade) * 100).toFixed(0));
    if (pct >= 20) insights.push(`Users are clicking Upgrade but ${pct}% do not start checkout.`);
  }

  if (checkout.checkoutStarted > 0 && checkout.checkoutStartedNoCompletion > 0) {
    const pct = Number(((checkout.checkoutStartedNoCompletion / checkout.checkoutStarted) * 100).toFixed(0));
    if (pct >= 20) insights.push(`${pct}% who started checkout did not complete — status: checkout started, no confirmed completion.`);
  }

  if (sources.length >= 2) {
    const topSignup = sources[0];
    const bestConv = [...sources].filter((s) => s.signups >= 3).sort((a, b) => b.conversionRate - a.conversionRate)[0];
    if (topSignup && bestConv && topSignup.source !== bestConv.source && topSignup.signups > bestConv.signups) {
      insights.push(`${topSignup.source} is generating the most signups but ${bestConv.source} traffic currently has a higher paid conversion rate.`);
    }
  }

  const biggest = funnel.biggestDropOff;
  if (biggest?.from && Number(biggest.dropPct) >= 25) {
    insights.push(`Biggest drop-off: ${biggest.from} → ${biggest.to} (${biggest.dropPct}% lost).`);
  }

  if (!insights.length) insights.push("Not enough data yet.");
  return insights;
}

/**
 * @param {Map<string, { signupAt: string, sessions: Set<string>, events: Array<unknown> }>} profiles
 */
function buildRetention(profiles) {
  let signups = 0;
  let day1 = 0;
  let day3 = 0;
  let day7 = 0;

  for (const profile of profiles.values()) {
    if (!profile.signupAt) continue;
    signups += 1;
    const signupMs = new Date(profile.signupAt).getTime();
    if (!Number.isFinite(signupMs)) continue;
    const returnDays = new Set();
    for (const ev of profile.events) {
      const t = eventTime(ev);
      if (t <= signupMs) continue;
      const daysAfter = Math.floor((t - signupMs) / 86400000);
      if (daysAfter >= 1) returnDays.add(1);
      if (daysAfter >= 3) returnDays.add(3);
      if (daysAfter >= 7) returnDays.add(7);
    }
    if (returnDays.has(1)) day1 += 1;
    if (returnDays.has(3)) day3 += 1;
    if (returnDays.has(7)) day7 += 1;
  }

  const rate = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : "Not enough data yet");

  return {
    signups,
    day1Return: day1,
    day3Return: day3,
    day7Return: day7,
    day1Rate: rate(day1, signups),
    day3Rate: rate(day3, signups),
    day7Rate: rate(day7, signups),
  };
}

/**
 * @param {Map<string, { signupAt: string, events: Array<unknown> }>} profiles
 */
function buildTimeToValue(profiles) {
  /** @type {number[]} */
  const toLesson = [];
  /** @type {number[]} */
  const toPro = [];
  /** @type {number[]} */
  const toPricing = [];
  /** @type {number[]} */
  const toPurchase = [];

  for (const profile of profiles.values()) {
    if (!profile.signupAt) continue;
    const signupMs = new Date(profile.signupAt).getTime();
    if (!Number.isFinite(signupMs)) continue;

    let firstLesson = 0;
    let firstPro = 0;
    let firstPricing = 0;
    let firstPurchase = 0;

    for (const ev of profile.events) {
      const t = eventTime(ev);
      if (t < signupMs) continue;
      const c = resolveCanonicalEvent(ev);
      if (!firstLesson && (c === "lesson_viewed" || c === "activity_viewed")) firstLesson = t;
      if (!firstPro && c === "pro_content_encountered") firstPro = t;
      if (!firstPricing && c === "pricing_viewed") firstPricing = t;
      if (!firstPurchase && (c === "checkout_completed" || c === "paid_subscription_active")) firstPurchase = t;
    }

    if (firstLesson) toLesson.push((firstLesson - signupMs) / 60000);
    if (firstPro) toPro.push((firstPro - signupMs) / 60000);
    if (firstPricing) toPricing.push((firstPricing - signupMs) / 60000);
    if (firstPurchase) toPurchase.push((firstPurchase - signupMs) / 60000);
  }

  const median = (arr) => {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const fmt = (mins) => {
    if (mins == null) return "Not enough data yet";
    if (mins < 60) return `${Math.round(mins)} min`;
    if (mins < 1440) return `${(mins / 60).toFixed(1)} hr`;
    return `${(mins / 1440).toFixed(1)} days`;
  };

  return {
    signupToFirstLesson: fmt(median(toLesson)),
    signupToProEncounter: fmt(median(toPro)),
    signupToPricing: fmt(median(toPricing)),
    signupToPurchase: fmt(median(toPurchase)),
    sampleSizes: {
      lesson: toLesson.length,
      pro: toPro.length,
      pricing: toPricing.length,
      purchase: toPurchase.length,
    },
  };
}

/**
 * @param {Map<string, { signupAt: string, source: string, lessonViews: number, activityViews: number, proEncounters: number, pricingViews: number, upgradeClicks: number, checkoutStarts: number, paidActive: boolean }>} profiles
 */
function buildTodaySignups(profiles) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const startMs = todayStart.getTime();

  /** @type {Map<string, number>} */
  const sourceCounts = new Map();
  let signups = 0;
  let lessonViewers = 0;
  let activityViewers = 0;
  let proEncounters = 0;
  let pricingViews = 0;
  let upgradeClicks = 0;
  let checkoutStarts = 0;
  let paid = 0;

  for (const profile of profiles.values()) {
    const signupMs = profile.signupAt ? new Date(profile.signupAt).getTime() : 0;
    if (!signupMs || signupMs < startMs) continue;
    signups += 1;
    const src = profile.source || "Unknown";
    sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
    if (profile.lessonViews > 0) lessonViewers += 1;
    if (profile.activityViews > 0) activityViewers += 1;
    if (profile.proEncounters > 0) proEncounters += 1;
    if (profile.pricingViews > 0) pricingViews += 1;
    if (profile.upgradeClicks > 0) upgradeClicks += 1;
    if (profile.checkoutStarts > 0) checkoutStarts += 1;
    if (profile.paidActive) paid += 1;
  }

  let biggestDropOff = "—";
  if (pricingViews > 0 && upgradeClicks < pricingViews) {
    biggestDropOff = "Pricing → Upgrade Click";
  } else if (proEncounters > 0 && pricingViews < proEncounters) {
    biggestDropOff = "Pro Encounter → Pricing";
  } else if (lessonViewers > 0 && (lessonViewers - activityViewers) > 0) {
    biggestDropOff = "Lesson View → Activity";
  }

  return {
    signups,
    sources: [...sourceCounts.entries()].map(([source, count]) => ({ source, count })),
    lessonViewers,
    activityViewers,
    proEncounters,
    pricingViews,
    upgradeClicks,
    checkoutStarts,
    paid,
    biggestDropOff,
  };
}

/**
 * @param {Record<string, unknown>} store
 * @param {object} options
 * @param {Array<unknown>} [options.events]
 * @param {string} [options.range]
 * @param {string} [options.startDate]
 * @param {string} [options.endDate]
 * @param {string} [options.source]
 * @param {string} [options.ageGroup]
 * @param {string} [options.converted]
 * @param {string} [options.journeyEmail]
 */
function buildConversionIntelligence(store = {}, options = {}) {
  const range = parseConversionRange(
    options.range || "7d",
    options.startDate || "",
    options.endDate || "",
  );
  const allEvents = Array.isArray(options.events) ? options.events : (/** @type {{ analyticsEvents?: unknown[] }} */ (store).analyticsEvents || []);
  const scopedEvents = allEvents.filter((e) => eventInRange(e, range) && !isTestActor(e));

  /** @type {Record<string, Record<string, unknown>>} */
  const usersByEmail = {};
  const rawUsers = store.users && typeof store.users === "object" ? store.users : {};
  for (const [key, user] of Object.entries(rawUsers)) {
    const email = normalizeEmail(/** @type {{ email?: string }} */ (user)?.email || key);
    if (!email || testAccountGuard.shouldRejectTestAccountPersistence(email)) continue;
    usersByEmail[email] = /** @type {Record<string, unknown>} */ (user);
  }

  let profiles = buildActorProfiles(scopedEvents, usersByEmail);
  conversionPhase2.enrichProfilesPhase2(profiles, usersByEmail, userHasAuthoritativePaidConversion);

  if (options.source && options.source !== "all") {
    const want = String(options.source);
    profiles = new Map([...profiles].filter(([, p]) => p.source === want));
  }
  if (options.ageGroup && options.ageGroup !== "all") {
    const want = String(options.ageGroup);
    profiles = new Map([...profiles].filter(([, p]) => p.ageGroups.has(want)));
  }
  if (options.converted === "converted") {
    profiles = new Map([...profiles].filter(([, p]) => p.converted));
  } else if (options.converted === "not_converted") {
    profiles = new Map([...profiles].filter(([, p]) => !p.converted));
  }

  const funnel = buildFunnel(profiles);
  const sources = buildSourceConversion(profiles);
  const content = buildContentBeforePurchase(scopedEvents, profiles);
  const lessonAssociation = conversionPhase2.buildLessonPurchaseAssociation(scopedEvents, profiles);
  // Prefer extended association rows for topLessons display while keeping legacy shape.
  content.topLessons = (lessonAssociation.topLessons || []).map((row) => ({
    lessonId: row.lessonId,
    title: row.title,
    ageGroup: row.ageGroup,
    views: row.uniqueViewers,
    uniqueViewers: row.uniqueViewers,
    saves: row.saves,
    printableInteractions: row.printableInteractions,
    proEncounters: row.proEncounters,
    pricingViewsWithin7d: row.pricingViewsWithin7d,
    purchasesWithin30d: row.purchasesWithin30d,
    upgradeClicks: 0,
    purchases: row.purchasesWithin30d,
    conversionRate: Number(row.conversionRatePct || 0),
    associationLabel: row.associationLabel,
  }));
  content.associationDisclaimer = lessonAssociation.associationDisclaimer;
  content.attributionWindows = lessonAssociation.attributionWindows;

  const paywall = buildPaywallAnalytics(scopedEvents);
  const ctaPerformance = conversionPhase2.buildCtaPerformanceWithImpressions(scopedEvents);
  const checkout = buildCheckoutDropOff(profiles);
  const highIntent = buildHighIntentUsers(profiles);
  const highIntentQueue = conversionPhase2.buildHighIntentQueue(profiles, computeIntentScore);
  const retention = buildRetention(profiles);
  const timeToValue = buildTimeToValue(profiles);
  const today = buildTodaySignups(profiles);
  const insights = buildRuleInsights(profiles, funnel, checkout, sources, profiles.size);

  const activation = conversionPhase2.buildActivation(profiles);
  const signupCohorts = conversionPhase2.buildSignupCohorts(profiles);
  const campaignAttribution = conversionPhase2.buildCampaignAttribution(profiles);
  const personaSegmentation = conversionPhase2.buildPersonaSegmentation(profiles);
  const ageGroupSegmentation = conversionPhase2.buildAgeGroupSegmentation(scopedEvents, profiles);
  const offerAttribution = conversionPhase2.buildOfferAttribution(profiles);
  const lostUsers = conversionPhase2.buildLostUserSegments(profiles);

  // Phase 2B — owner follow-up workflow (additive; does not alter Phase 2A metrics).
  const ownerActionQueueAll = conversionLeads.buildOwnerActionQueue(
    profiles,
    highIntentQueue,
    /** @type {Record<string, unknown>} */ (store),
    userHasAuthoritativePaidConversion,
    usersByEmail,
  );
  const ownerFilters = {
    activated: String(options.activated || "all"),
    highIntent: String(options.highIntent || "all"),
    persona: String(options.persona || "all"),
    ageGroup: String(options.ageGroupFilter || options.queueAgeGroup || "all"),
    source: String(options.queueSource || "all"),
    offer: String(options.offer || "all"),
    leadStatus: String(options.leadStatus || "all"),
    reason: String(options.reason || "all"),
    cohort: String(options.cohort || "all"),
    converted: String(options.queueConverted || "all"),
  };
  const ownerActionQueue = conversionLeads.filterOwnerActionQueue(ownerActionQueueAll, ownerFilters);
  const ownerWorkflowSummary = conversionLeads.buildOwnerWorkflowSummary(ownerActionQueueAll, profiles);
  const lostUserWorkflow = conversionLeads.buildLostUserWorkflow(lostUsers);

  let conversionLeadDetail = null;
  const detailEmail = normalizeEmail(String(options.detailEmail || ""));
  if (detailEmail) {
    const detailUser = usersByEmail[detailEmail];
    const detailPaid = detailUser ? userHasAuthoritativePaidConversion(detailUser) : false;
    conversionLeadDetail = conversionLeads.buildConversionLeadDetail(
      detailEmail,
      profiles,
      scopedEvents,
      /** @type {Record<string, unknown>} */ (store),
      buildUserJourney,
      detailPaid,
    );
  }

  const freeSignups = [...profiles.values()].filter((p) => !p.converted).length;
  const paidConversions = [...profiles.values()].filter((p) => p.converted).length;
  const totalSignups = profiles.size;
  const freeToPaidPct = totalSignups ? Number(((paidConversions / totalSignups) * 100).toFixed(1)) : 0;

  let pricingViews = 0;
  let upgradeClicks = 0;
  let checkoutStarts = 0;
  for (const p of profiles.values()) {
    if (p.pricingViews > 0) pricingViews += 1;
    if (p.upgradeClicks > 0) upgradeClicks += 1;
    if (p.checkoutStarts > 0) checkoutStarts += 1;
  }

  const recentJourneys = [...profiles.values()]
    .filter((p) => p.email && p.signupAt)
    .sort((a, b) => String(b.signupAt).localeCompare(String(a.signupAt)))
    .slice(0, 10)
    .map((p) => buildUserJourney(p.email, scopedEvents));

  if (options.journeyEmail) {
    return {
      range,
      journey: buildUserJourney(options.journeyEmail, allEvents),
    };
  }

  return {
    range,
    summaryCards: {
      freeSignups,
      paidConversions,
      freeToPaidPct,
      pricingViews,
      upgradeClicks,
      checkoutStarts,
      biggestDropOff: funnel.biggestDropOff,
      activationRate: activation.activationRate,
      activatedUsers: activation.activatedUsers,
    },
    funnel,
    today,
    activation,
    signupCohorts,
    campaignAttribution,
    personaSegmentation,
    ageGroupSegmentation,
    offerAttribution,
    lessonAssociation,
    lostUsers,
    lostUserWorkflow,
    ownerWorkflowSummary,
    ownerActionQueue,
    ownerActionQueueTotal: ownerActionQueueAll.length,
    ownerFilters,
    conversionLeadDetail,
    leadStatuses: conversionLeads.LEAD_STATUSES,
    nonBuyerReasons: conversionLeads.NON_BUYER_REASONS,
    highIntentUsers: highIntent,
    highIntentQueue,
    checkoutDropOff: checkout,
    trafficSources: sources,
    content,
    paywall,
    ctaPerformance,
    insights,
    retention,
    timeToValue,
    recentJourneys,
    intentWeights: INTENT_WEIGHTS,
    sampleSize: profiles.size,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  RANGE_KEYS,
  parseConversionRange,
  buildConversionIntelligence,
  buildUserJourney,
  computeIntentScore,
  userHasAuthoritativePaidConversion,
  resolveCanonicalEvent,
  // Phase 2A helpers re-exported for focused tests
  computeActivationState: conversionPhase2.computeActivationState,
  buildActivation: conversionPhase2.buildActivation,
  buildSignupCohorts: conversionPhase2.buildSignupCohorts,
  buildCampaignAttribution: conversionPhase2.buildCampaignAttribution,
  buildPersonaSegmentation: conversionPhase2.buildPersonaSegmentation,
  buildAgeGroupSegmentation: conversionPhase2.buildAgeGroupSegmentation,
  buildOfferAttribution: conversionPhase2.buildOfferAttribution,
  buildLessonPurchaseAssociation: conversionPhase2.buildLessonPurchaseAssociation,
  buildLostUserSegments: conversionPhase2.buildLostUserSegments,
  buildHighIntentQueue: conversionPhase2.buildHighIntentQueue,
  buildCtaPerformanceWithImpressions: conversionPhase2.buildCtaPerformanceWithImpressions,
  enrichProfilesPhase2: conversionPhase2.enrichProfilesPhase2,
  normalizeOffer: conversionEvents.normalizeOffer,
  resolvePersona: conversionEvents.resolvePersona,
  extractResourceId: conversionEvents.extractResourceId,
  conversionLeads,
};
