/**
 * Conversion Intelligence — canonical event types and legacy mapping.
 * Plain JS with JSDoc for type safety (no `any`).
 */

/** @typedef {"account_created"|"session_started"|"lesson_viewed"|"activity_viewed"|"lesson_saved"|"printable_viewed"|"printable_downloaded"|"pro_content_encountered"|"pricing_viewed"|"upgrade_cta_clicked"|"upgrade_cta_impression"|"checkout_started"|"checkout_completed"|"paid_subscription_active"} ConversionEventName */

/** @typedef {"early_user"|"founding"|"pro_monthly"|"pro_annual"|"trial"|"unknown"} ConversionOffer */

/** @typedef {"home_daycare"|"center"|"teacher_staff"|"unknown"} ConversionPersona */

/** @typedef {{ featureType?: string, lessonId?: string, lessonTitle?: string, ageGroup?: string, location?: string, ctaLocation?: string, resourceId?: string, title?: string, category?: string, access?: string, plan?: string, promptId?: string, source?: string, utm_source?: string, utm_medium?: string, utm_campaign?: string, utm_content?: string, utm_term?: string, [key: string]: string|number|boolean|undefined }} ConversionEventDetail */

/** @readonly */
const CONVERSION_EVENT_NAMES = Object.freeze([
  "account_created",
  "session_started",
  "lesson_viewed",
  "activity_viewed",
  "lesson_saved",
  "printable_viewed",
  "printable_downloaded",
  "pro_content_encountered",
  "pricing_viewed",
  "upgrade_cta_clicked",
  "upgrade_cta_impression",
  "checkout_started",
  "checkout_completed",
  "paid_subscription_active",
]);

/**
 * Legacy name → canonical. Note: upgrade_prompt_shown is intentionally NOT mapped
 * to pro_content_encountered — it is historical CTA impression evidence only.
 */
/** @type {Readonly<Record<string, ConversionEventName>>} */
const LEGACY_EVENT_MAP = Object.freeze({
  account_signup_complete: "account_created",
  page_view: "session_started",
  website_visit: "session_started",
  lesson_plan_view: "lesson_viewed",
  first_favorite: "lesson_saved",
  favorite_add: "lesson_saved",
  resource_print: "printable_viewed",
  teaching_kit_print: "printable_viewed",
  generated_goal_printable_view: "printable_viewed",
  resource_pdf_download: "printable_downloaded",
  resource_docx_download: "printable_downloaded",
  generated_pdf: "printable_downloaded",
  pro_content_encountered: "pro_content_encountered",
  pricing_cards_shown: "pricing_viewed",
  pricing_confirm_shown: "pricing_viewed",
  upgrade_click: "upgrade_cta_clicked",
  upgrade_prompt_click: "upgrade_cta_clicked",
  pro_upgrade_intent: "upgrade_cta_clicked",
  checkout_start: "checkout_started",
  checkout_success: "checkout_completed",
});

/** Canonical signup personas — do not invent others. */
const CANONICAL_PERSONAS = Object.freeze(["home_daycare", "center", "teacher_staff"]);

/** Canonical offer keys for attribution. */
const CANONICAL_OFFERS = Object.freeze(["early_user", "founding", "pro_monthly", "pro_annual", "trial", "unknown"]);

/** Cohort windows in days. */
const COHORT_WINDOWS_DAYS = Object.freeze([1, 3, 7, 14, 30]);

/** @type {ReadonlySet<string>} */
const SENSITIVE_DETAIL_KEYS = new Set([
  "password",
  "passwordHash",
  "childName",
  "childNames",
  "children",
  "formData",
  "message",
  "notes",
  "phone",
  "address",
  "ssn",
  "card",
  "paymentMethod",
  "stripeToken",
]);

/** Funnel stage definitions for Conversion Intelligence. */
const FUNNEL_STAGES = Object.freeze([
  { id: "account_created", label: "Account Created", event: "account_created" },
  { id: "first_session", label: "First Session", event: "session_started" },
  { id: "lesson_viewed", label: "Lesson Viewed", event: "lesson_viewed" },
  { id: "activity_viewed", label: "Activity Viewed", event: "activity_viewed" },
  { id: "lesson_saved", label: "Lesson Saved / Favorited", event: "lesson_saved" },
  { id: "printable_viewed", label: "Printable Viewed / Downloaded", event: "printable_viewed" },
  { id: "pro_encountered", label: "Pro-Locked Content Encountered", event: "pro_content_encountered" },
  { id: "pricing_viewed", label: "Pricing Page Viewed", event: "pricing_viewed" },
  { id: "upgrade_clicked", label: "Upgrade CTA Clicked", event: "upgrade_cta_clicked" },
  { id: "checkout_started", label: "Checkout Started", event: "checkout_started" },
  { id: "checkout_completed", label: "Checkout Completed", event: "checkout_completed" },
  { id: "paid_active", label: "Paid Subscription Active", event: "paid_subscription_active" },
]);

/** @type {Readonly<Record<string, number>>} */
const INTENT_WEIGHTS = Object.freeze({
  lesson_viewed: 8,
  activity_viewed: 10,
  printable_viewed: 12,
  lesson_saved: 15,
  pro_content_encountered: 18,
  pricing_viewed: 22,
  upgrade_cta_clicked: 28,
  checkout_started: 35,
  repeat_session: 10,
  multiple_lessons: 12,
});

/** @type {Readonly<Record<string, string>>} */
const KNOWN_SOURCES = Object.freeze({
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google",
  direct: "Direct",
  referral: "Referral",
  email: "Email",
  search: "Search",
  organic: "Organic",
});

/**
 * @param {string} value
 * @returns {ConversionEventName|null}
 */
function normalizeConversionEventName(value) {
  const raw = String(value || "").trim();
  if (CONVERSION_EVENT_NAMES.includes(/** @type {ConversionEventName} */ (raw))) {
    return /** @type {ConversionEventName} */ (raw);
  }
  return LEGACY_EVENT_MAP[raw] || null;
}

/**
 * @param {unknown} event
 * @returns {ConversionEventName|null}
 */
function resolveCanonicalEvent(event) {
  if (!event || typeof event !== "object") return null;
  const name = String(/** @type {{ name?: string }} */ (event).name || "");
  const detail = /** @type {{ detail?: Record<string, unknown>, category?: string }} */ (event).detail || {};

  const direct = normalizeConversionEventName(name);
  if (direct) return direct;

  if (name === "resource_view") {
    const category = String(detail.category || "");
    if (/activity/i.test(category)) return "activity_viewed";
    if (/lesson/i.test(category) || detail._curriculumManaged) return "lesson_viewed";
    return null;
  }

  return LEGACY_EVENT_MAP[name] || null;
}

/**
 * @param {Record<string, unknown>} detail
 * @returns {ConversionEventDetail}
 */
function sanitizeConversionDetail(detail = {}) {
  /** @type {ConversionEventDetail} */
  const clean = {};
  for (const [key, value] of Object.entries(detail)) {
    if (SENSITIVE_DETAIL_KEYS.has(key)) continue;
    if (typeof value === "string") {
      clean[key] = value.slice(0, 240);
    } else if (typeof value === "number" || typeof value === "boolean") {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * @param {unknown} event
 * @returns {string}
 */
function eventActorKey(event) {
  const e = /** @type {{ user?: string, visitorId?: string, detail?: { email?: string } }} */ (event || {});
  const email = String(e.user || e.detail?.email || "").trim().toLowerCase();
  if (email && email !== "guest") return `email:${email}`;
  const visitor = String(e.visitorId || "").trim().toLowerCase();
  if (visitor) return `visitor:${visitor}`;
  return "";
}

/**
 * @param {unknown} event
 * @returns {string}
 */
function normalizeAttributionSource(event) {
  const e = /** @type {{ source?: string, attribution?: Record<string, string> }} */ (event || {});
  const raw = String(
    e.attribution?.source
    || e.attribution?.utm_source
    || e.source
    || "",
  ).trim();
  if (!raw) return "Unknown";
  const lower = raw.toLowerCase();
  for (const [key, label] of Object.entries(KNOWN_SOURCES)) {
    if (lower.includes(key)) return label;
  }
  if (/^direct$/i.test(raw)) return "Direct";
  return raw.slice(0, 80);
}

/**
 * @param {unknown} event
 * @returns {string}
 */
function extractAgeGroup(event) {
  const detail = /** @type {{ detail?: Record<string, string>, age?: string }} */ (event || {}).detail || {};
  const age = String(detail.ageGroup || detail.age || "").trim();
  if (!age) return "";
  try {
    const normalize = require("../scripts/age-group-normalize.js");
    if (normalize && typeof normalize.canonicalAgeGroup === "function") {
      const canonical = normalize.canonicalAgeGroup(age);
      if (canonical) return canonical;
    }
  } catch {
    /* fall through to local heuristics */
  }
  if (/infant/i.test(age)) return "Infant";
  if (/toddler/i.test(age)) return "Toddler";
  if (/preschool/i.test(age)) return "Preschool";
  if (/school\s*age/i.test(age)) return "School Age";
  if (/mixed/i.test(age)) return "Mixed Ages";
  if (/all\s*ages/i.test(age)) return "All Ages";
  return age.slice(0, 40);
}

/**
 * Best existing resource identifier for distinct curriculum views.
 * @param {unknown} event
 * @returns {string}
 */
function extractResourceId(event) {
  const detail = /** @type {{ detail?: Record<string, string> }} */ (event || {}).detail || {};
  const id = String(detail.resourceId || detail.lessonId || "").trim();
  if (id) return id.slice(0, 160);
  const title = String(detail.title || detail.lessonTitle || "").trim();
  return title ? `title:${title.slice(0, 120)}` : "";
}

/**
 * @param {unknown} input
 * @returns {ConversionOffer}
 */
function normalizeOffer(input) {
  if (input && typeof input === "object") {
    const obj = /** @type {Record<string, unknown>} */ (input);
    const detail = obj.detail && typeof obj.detail === "object"
      ? /** @type {Record<string, unknown>} */ (obj.detail)
      : obj;
    if (detail.trial7day === true || detail.trial7day === "true") return "trial";
    const type = String(detail.type || detail.offer || detail.billingOffer || obj.billingOffer || "").trim().toLowerCase();
    if (type === "early_user") return "early_user";
    if (type === "founding") return "founding";
    if (type === "annual" || type === "pro_annual") return "pro_annual";
    if (type === "monthly" || type === "pro_monthly") return "pro_monthly";
    if (type === "trial" || type.includes("trial")) return "trial";
    const lock = String(obj.priceLock || detail.priceLock || "").trim().toLowerCase();
    if (lock === "early user") return "early_user";
    if (lock === "lifetime") return "founding";
    return "unknown";
  }
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return "unknown";
  if (raw === "early_user") return "early_user";
  if (raw === "founding") return "founding";
  if (raw === "annual" || raw === "pro_annual") return "pro_annual";
  if (raw === "monthly" || raw === "pro_monthly") return "pro_monthly";
  if (raw.includes("trial")) return "trial";
  return "unknown";
}

/**
 * Resolve canonical signup persona. Prefer event persona, then onboardingPersona, then accountType+role.
 * @param {{ persona?: string, onboardingPersona?: string, accountType?: string, role?: string }|null} sources
 * @returns {ConversionPersona}
 */
function resolvePersona(sources = {}) {
  const direct = String(sources?.persona || sources?.onboardingPersona || "").trim().toLowerCase();
  if (CANONICAL_PERSONAS.includes(direct)) return /** @type {ConversionPersona} */ (direct);
  const accountType = String(sources?.accountType || "").trim().toLowerCase();
  const role = String(sources?.role || "").trim().toLowerCase();
  // Mirrors mapSignupPersona() in app.js without inventing new values.
  if (accountType === "center" && (role === "teacher" || role === "assistant")) return "teacher_staff";
  if (accountType === "center") return "center";
  if (accountType === "home_daycare" || accountType === "single_provider") return "home_daycare";
  return "unknown";
}

/**
 * True when an event is CTA impression evidence (new canonical or historical raw).
 * @param {unknown} event
 * @returns {boolean}
 */
function isCtaImpressionEvent(event) {
  const name = String(/** @type {{ name?: string }} */ (event || {}).name || "");
  if (name === "upgrade_cta_impression") return true;
  if (name === "upgrade_prompt_shown") return true;
  return false;
}

/**
 * @param {unknown} event
 * @returns {string}
 */
function extractCtaLocation(event) {
  const e = /** @type {{ name?: string, detail?: Record<string, string>, path?: string }} */ (event || {});
  const detail = e.detail || {};
  if (detail.ctaLocation) return String(detail.ctaLocation).slice(0, 80);
  if (detail.location) return String(detail.location).slice(0, 80);
  if (detail.promptId) return String(detail.promptId).slice(0, 80);
  if (detail.source) return String(detail.source).slice(0, 80);
  if (e.name === "upgrade_click" && detail.targetView) return `navigation_${detail.targetView}`;
  if (String(e.path || "").includes("pricing")) return "pricing_upgrade";
  return "other";
}

/**
 * @param {unknown} event
 * @returns {string}
 */
function extractProFeatureType(event) {
  const detail = /** @type {{ detail?: Record<string, string> }} */ (event || {}).detail || {};
  if (detail.featureType) return String(detail.featureType).slice(0, 80);
  if (detail.promptId) {
    const pid = String(detail.promptId);
    if (/printable|print/i.test(pid)) return "printable_locked";
    if (/lesson|locked_lesson/i.test(pid)) return "pro_lesson_locked";
    if (/activity/i.test(pid)) return "premium_activity_locked";
    if (/favorite/i.test(pid)) return "feature_locked";
    if (/resource|limit/i.test(pid)) return "feature_locked";
    return "feature_locked";
  }
  if (detail.type === "limit") return "feature_locked";
  return "feature_locked";
}

module.exports = {
  CONVERSION_EVENT_NAMES,
  LEGACY_EVENT_MAP,
  FUNNEL_STAGES,
  INTENT_WEIGHTS,
  KNOWN_SOURCES,
  SENSITIVE_DETAIL_KEYS,
  CANONICAL_PERSONAS,
  CANONICAL_OFFERS,
  COHORT_WINDOWS_DAYS,
  normalizeConversionEventName,
  resolveCanonicalEvent,
  sanitizeConversionDetail,
  eventActorKey,
  normalizeAttributionSource,
  extractAgeGroup,
  extractResourceId,
  normalizeOffer,
  resolvePersona,
  isCtaImpressionEvent,
  extractCtaLocation,
  extractProFeatureType,
};
