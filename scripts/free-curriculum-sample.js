/**
 * Curated Free lesson-plan sample for conversion.
 *
 * Free users get a small, high-quality showcase across ages/themes/styles —
 * not the full Free-tagged catalog. Seasonal slots rotate 1–2 extras so the
 * Free library feels fresh without giving away the Pro library.
 *
 * Works in Node (module.exports) and the browser (globalThis.LLHFreeCurriculumSample).
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

  /**
   * Permanent Free showcase (recommended mix):
   *
   * Infant — bonding, sensory/music, colors
   * Toddler — playful discovery + high-appeal adventure theme
   * Preschool — community, identity, weather/season, farm theme
   *
   * Multiple IDs cover historical seed/import variants of the same title.
   */
  const PERMANENT_FREE_LESSON_IDS = Object.freeze([
    // Infant
    "cur-lp-2f-soft-sounds",
    "cur-lp-infant-soft-sounds-faces",
    "cur-lp-infant-animal-sounds-discovery",
    "cur-lp-infant-summer-colors",
    // Toddler
    "cur-lp-2f-color-hunt",
    "cur-lp-toddler-construction-crew",
    "cur-lp-toddler-bugs-and-butterflies",
    // Preschool
    "cur-lp-preschool-community-helpers",
    "cur-lp-2f-community-helpers",
    "cur-lp-preschool-all-about-me",
    "cur-lp-preschool-weather-watchers",
    "cur-lp-preschool-farm-animals",
  ]);

  /** Title/theme matchers when store IDs differ from import targets. */
  const PERMANENT_FREE_TITLE_MATCHERS = Object.freeze([
    { age: "Infant", pattern: /soft\s*sounds|familiar\s*faces/i },
    { age: "Infant", pattern: /animal\s*sounds/i },
    { age: "Infant", pattern: /summer\s*colors|colors\s*all\s*around/i },
    { age: "Toddler", pattern: /color\s*hunt/i },
    { age: "Toddler", pattern: /construction\s*crew/i },
    { age: "Toddler", pattern: /bugs?\s*(&|and)?\s*butterflies/i },
    { age: "Preschool", pattern: /community\s*helpers/i },
    { age: "Preschool", pattern: /all\s*about\s*me/i },
    { age: "Preschool", pattern: /weather\s*watchers/i },
    { age: "Preschool", pattern: /farm\s*(animals|friends)/i },
  ]);

  /**
   * Seasonal Free extras (in addition to the permanent sample).
   * Keep these to 1–2 active IDs at a time.
   */
  const SEASONAL_FREE_LESSON_IDS = Object.freeze({
    winter: Object.freeze([
      "cur-lp-preschool-new-years-goal-setters-big-dreams",
      "cur-lp-infant-new-years-celebration",
    ]),
    spring: Object.freeze([
      "cur-lp-preschool-easter-eggs-chicks-spring-science",
      "cur-lp-toddler-easter-eggstravaganza",
    ]),
    summer: Object.freeze([
      "cur-lp-infant-water-play-wonders",
      "cur-lp-preschool-water-park-engineers",
    ]),
    fall: Object.freeze([
      "cur-lp-preschool-seasons-of-the-year",
      "cur-lp-preschool-camping-adventure",
    ]),
  });

  const SEASONAL_FREE_TITLE_MATCHERS = Object.freeze({
    winter: Object.freeze([
      { age: "", pattern: /new\s*year/i },
    ]),
    spring: Object.freeze([
      { age: "", pattern: /easter/i },
    ]),
    summer: Object.freeze([
      { age: "Infant", pattern: /water\s*play/i },
      { age: "Preschool", pattern: /water\s*park/i },
    ]),
    fall: Object.freeze([
      { age: "Preschool", pattern: /seasons\s*of\s*the\s*year/i },
      { age: "Preschool", pattern: /camping\s*adventure/i },
    ]),
  });

  const MARKETING = Object.freeze({
    freeLessonCountLabel: "Selected free lesson plans (sample library)",
    freeLessonCountShort: "Selected Free Lesson Plans",
    freeFallbackCount: 10,
    recommendationSummary:
      "Free keeps a curated sample across Infant, Toddler, and Preschool — bonding, discovery, community, weather, and farm themes — plus 1–2 seasonal extras. Everything else stays Pro so providers fall in love with quality and want the full weekly library.",
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
    const month = date.getMonth(); // 0-indexed
    if (month === 11 || month <= 1) return "winter";
    if (month >= 2 && month <= 4) return "spring";
    if (month >= 5 && month <= 7) return "summer";
    return "fall";
  }

  function activeSeasonalIds(date = new Date()) {
    const season = currentSeasonKey(date);
    return SEASONAL_FREE_LESSON_IDS[season] || [];
  }

  function activeSeasonalMatchers(date = new Date()) {
    const season = currentSeasonKey(date);
    return SEASONAL_FREE_TITLE_MATCHERS[season] || [];
  }

  function curatedFreeLessonIdSet(date = new Date()) {
    return new Set([...PERMANENT_FREE_LESSON_IDS, ...activeSeasonalIds(date)]);
  }

  function matchesTitleAge(plan, matcher) {
    const haystack = `${plan?.title || ""} ${plan?.theme || ""}`;
    if (!matcher.pattern.test(haystack)) return false;
    if (!matcher.age) return true;
    return normalizeAgeGroup(plan?.age) === matcher.age;
  }

  function isCuratedFreeLessonPlan(plan, date = new Date()) {
    if (!plan) return false;
    if (plan._userLessonCopy) return true;
    const id = String(plan.id || plan._curriculumLessonPlanId || plan._sourceLessonPlanId || "").trim();
    const ids = curatedFreeLessonIdSet(date);
    if (id && ids.has(id)) return true;
    const sourceId = String(plan._sourceLessonPlanId || "").trim();
    if (sourceId && ids.has(sourceId)) return true;
    const matchers = [...PERMANENT_FREE_TITLE_MATCHERS, ...activeSeasonalMatchers(date)];
    return matchers.some((matcher) => matchesTitleAge(plan, matcher));
  }

  function effectivePlanTier(plan, date = new Date()) {
    if (!plan) return "Pro";
    if (isCuratedFreeLessonPlan(plan, date)) return "Free";
    return "Pro";
  }

  function freeSampleMarketingCount() {
    // Stable marketing number: curated showcase across 3 ages + seasonal extras.
    return MARKETING.freeFallbackCount;
  }

  return {
    PERMANENT_FREE_LESSON_IDS,
    PERMANENT_FREE_TITLE_MATCHERS,
    SEASONAL_FREE_LESSON_IDS,
    SEASONAL_FREE_TITLE_MATCHERS,
    MARKETING,
    normalizeAgeGroup,
    currentSeasonKey,
    activeSeasonalIds,
    curatedFreeLessonIdSet,
    isCuratedFreeLessonPlan,
    effectivePlanTier,
    freeSampleMarketingCount,
  };
});
