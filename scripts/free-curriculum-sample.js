/**
 * Free Starter Library — exactly 10 complete lesson plans.
 *
 * Distribution (required): 3 Infant · 3 Toddler · 4 Preschool
 * Server store may override IDs via freeStarterLibrary.lessonPlanIds when valid.
 * Do not derive Free access from card position, search order, or localStorage.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LLHFreeCurriculumSample = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const REQUIRED_COUNT = 10;
  const REQUIRED_DISTRIBUTION = Object.freeze({ Infant: 3, Toddler: 3, Preschool: 4 });

  /**
   * Default evergreen Free starter set (server-authoritative when store has no override).
   * Strong play-based demos across ages — entitlement only; curriculum records unchanged.
   */
  const DEFAULT_FREE_STARTER_LESSON_IDS = Object.freeze([
    // Infant (3) — published evergreen demos only (entitlement IDs; records unchanged)
    "cur-lp-infant-animal-sounds-discovery",
    "cur-lp-infant-summer-colors",
    "cur-lp-infant-colors-all-around-us",
    // Toddler (3)
    "cur-lp-toddler-colors-everywhere",
    "cur-lp-toddler-construction-crew",
    "cur-lp-toddler-bugs-and-butterflies",
    // Preschool (4)
    "cur-lp-preschool-community-helpers",
    "cur-lp-preschool-all-about-me",
    "cur-lp-preschool-weather-watchers",
    "cur-lp-preschool-farm-animals",
  ]);

  /** @deprecated Use DEFAULT_FREE_STARTER_LESSON_IDS — kept for older tests/imports. */
  const PERMANENT_FREE_LESSON_IDS = DEFAULT_FREE_STARTER_LESSON_IDS;

  /** Display/admin helpers only — Free unlock is ID-authoritative (exactly these 10). */
  const PERMANENT_FREE_TITLE_MATCHERS = Object.freeze([
    { age: "Infant", pattern: /animal\s*sounds/i },
    { age: "Infant", pattern: /^summer\s*colors$/i },
    { age: "Infant", pattern: /colors\s*all\s*around/i },
    { age: "Toddler", pattern: /colors\s*everywhere/i },
    { age: "Toddler", pattern: /construction\s*crew/i },
    { age: "Toddler", pattern: /bugs?\s*(&|and)?\s*butterflies/i },
    { age: "Preschool", pattern: /community\s*helpers/i },
    { age: "Preschool", pattern: /all\s*about\s*me/i },
    { age: "Preschool", pattern: /weather\s*watchers/i },
    { age: "Preschool", pattern: /farm\s*(animals|friends)/i },
  ]);

  // Seasonal extras are no longer part of Free entitlement (exactly 10 plans).
  const SEASONAL_FREE_LESSON_IDS = Object.freeze({
    winter: Object.freeze([]),
    spring: Object.freeze([]),
    summer: Object.freeze([]),
    fall: Object.freeze([]),
  });
  const SEASONAL_FREE_TITLE_MATCHERS = Object.freeze({
    winter: Object.freeze([]),
    spring: Object.freeze([]),
    summer: Object.freeze([]),
    fall: Object.freeze([]),
  });

  const MARKETING = Object.freeze({
    freeLessonCountLabel: "10 complete starter lesson plans",
    freeLessonCountShort: "10 Free Starter Plans",
    freeFallbackCount: 10,
    freeCore:
      "Free includes 10 complete starter lesson plans across Infant, Toddler and Preschool—no credit card required.",
    freeBrowse:
      "Browse the complete library and preview additional themes. Upgrade to Founding or Pro to unlock every lesson plan, new plans added weekly, and unlimited curriculum printing and downloads.",
    recommendationSummary:
      "Free includes exactly 10 complete starter lesson plans (3 Infant, 3 Toddler, 4 Preschool). Providers can browse titles and previews of the full library; complete contents of other plans stay locked until Founding or Pro.",
  });

  function normalizeAgeGroup(age) {
    const value = String(age || "").trim().toLowerCase();
    if (!value) return "";
    if (value.includes("infant") || value.includes("0–") || value.includes("0-")) return "Infant";
    if (value.includes("toddler")) return "Toddler";
    if (value.includes("preschool") || value.includes("pre-k") || value.includes("prek")) return "Preschool";
    return String(age || "").trim();
  }

  function currentSeasonKey(date = new Date()) {
    const month = date.getMonth();
    if (month === 11 || month <= 1) return "winter";
    if (month >= 2 && month <= 4) return "spring";
    if (month >= 5 && month <= 7) return "summer";
    return "fall";
  }

  function activeSeasonalIds() {
    return [];
  }

  function activeSeasonalMatchers() {
    return [];
  }

  function sanitizeIdList(ids) {
    if (!Array.isArray(ids)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of ids) {
      const id = String(raw || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function resolveStarterIds(overrideIds) {
    const sanitized = sanitizeIdList(overrideIds);
    if (sanitized.length === REQUIRED_COUNT) return sanitized;
    return [...DEFAULT_FREE_STARTER_LESSON_IDS];
  }

  function curatedFreeLessonIdSet(date = new Date(), overrideIds) {
    return new Set(resolveStarterIds(overrideIds));
  }

  function matchesTitleAge(plan, matcher) {
    const haystack = `${plan?.title || ""} ${plan?.theme || ""}`;
    if (!matcher.pattern.test(haystack)) return false;
    if (!matcher.age) return true;
    return normalizeAgeGroup(plan?.age) === matcher.age;
  }

  function isCuratedFreeLessonPlan(plan, date = new Date(), overrideIds) {
    if (!plan) return false;
    if (plan._userLessonCopy) return true;
    // Entitlement is ID-authoritative so Free unlock stays exactly the 10 starters
    // (title matchers must not grant extra premium plans).
    const id = String(plan.id || plan._curriculumLessonPlanId || "").trim();
    const ids = curatedFreeLessonIdSet(date, overrideIds);
    if (id && ids.has(id)) return true;
    const sourceId = String(plan._sourceLessonPlanId || "").trim();
    if (sourceId && ids.has(sourceId)) return true;
    return false;
  }

  function effectivePlanTier(plan, date = new Date(), overrideIds) {
    if (!plan) return "Pro";
    if (isCuratedFreeLessonPlan(plan, date, overrideIds)) return "Free";
    return "Pro";
  }

  function freeSampleMarketingCount() {
    return MARKETING.freeFallbackCount;
  }

  function validateStarterSelection(plansOrIds, { requirePublished = true } = {}) {
    const errors = [];
    let ids = [];
    let ageCounts = { Infant: 0, Toddler: 0, Preschool: 0 };
    if (Array.isArray(plansOrIds) && plansOrIds.every((p) => typeof p === "string" || typeof p === "number")) {
      ids = sanitizeIdList(plansOrIds);
      if (ids.length !== REQUIRED_COUNT) {
        errors.push(`Select exactly ${REQUIRED_COUNT} unique lesson plans (got ${ids.length}).`);
      }
      return { ok: errors.length === 0, errors, ids, ageCounts, distributionOk: false };
    }
    const plans = Array.isArray(plansOrIds) ? plansOrIds : [];
    ids = sanitizeIdList(plans.map((p) => p?.id));
    if (ids.length !== REQUIRED_COUNT) {
      errors.push(`Select exactly ${REQUIRED_COUNT} unique lesson plans (got ${ids.length}).`);
    }
    for (const plan of plans) {
      const age = normalizeAgeGroup(plan?.age);
      if (ageCounts[age] != null) ageCounts[age] += 1;
      if (requirePublished && String(plan?.status || "").toLowerCase() !== "published") {
        errors.push(`Plan "${plan?.title || plan?.id}" must be published.`);
      }
    }
    for (const [age, need] of Object.entries(REQUIRED_DISTRIBUTION)) {
      if (ageCounts[age] !== need) {
        errors.push(`Need ${need} ${age} plans (have ${ageCounts[age] || 0}).`);
      }
    }
    const distributionOk = Object.entries(REQUIRED_DISTRIBUTION).every(([age, need]) => ageCounts[age] === need);
    return { ok: errors.length === 0 && ids.length === REQUIRED_COUNT && distributionOk, errors, ids, ageCounts, distributionOk };
  }

  return {
    REQUIRED_COUNT,
    REQUIRED_DISTRIBUTION,
    DEFAULT_FREE_STARTER_LESSON_IDS,
    PERMANENT_FREE_LESSON_IDS,
    PERMANENT_FREE_TITLE_MATCHERS,
    SEASONAL_FREE_LESSON_IDS,
    SEASONAL_FREE_TITLE_MATCHERS,
    MARKETING,
    normalizeAgeGroup,
    currentSeasonKey,
    activeSeasonalIds,
    activeSeasonalMatchers,
    sanitizeIdList,
    resolveStarterIds,
    curatedFreeLessonIdSet,
    isCuratedFreeLessonPlan,
    effectivePlanTier,
    freeSampleMarketingCount,
    validateStarterSelection,
  };
});
