"use strict";

/**
 * Disposable QA fixtures for Curriculum Operator spring planting E2E.
 * Never targets production curriculum IDs.
 */

const EXACT_COMMAND = "Research spring planting activities for preschoolers, create a complete lesson plan, make the activities age-appropriate, create the matching printable, use realistic activity pictures, keep anything that is already good, fix anything that is wrong, and leave it ready for me to review.";

const MOCK_RESEARCH_SOURCES = [
  {
    query: EXACT_COMMAND.slice(0, 200),
    title: "NAEYC — Playful Garden and Planting Ideas for Preschool",
    url: "https://www.naeyc.org/resources/topics/play/garden-play-preschool",
    source: "www.naeyc.org",
    publicationDate: null,
    retrievedAt: "2026-10-01T12:00:00.000Z",
    provider: "openai_web_search",
    summary: "Preschool planting play uses sensory bins, seed sorting with large props, and adult-led tool routines—not worksheets.",
    sourceId: "openai:https://www.naeyc.org/resources/topics/play/garden-play-preschool",
  },
  {
    query: EXACT_COMMAND.slice(0, 200),
    title: "Extension — Safe Scissor Skills for Young Children",
    url: "https://extension.umn.edu/family/child-development/scissor-skills-young-children",
    source: "extension.umn.edu",
    publicationDate: null,
    retrievedAt: "2026-10-01T12:00:00.000Z",
    provider: "openai_web_search",
    summary: "Use child-safe scissors, thumb-up grip modeling, and close supervision; offer tearing as an alternative.",
    sourceId: "openai:https://extension.umn.edu/family/child-development/scissor-skills-young-children",
  },
];

const GOOD_IMAGE_URL = "/api/media/enrichment-photos/tk-enrich-spring-good?variant=full";
const BAD_IMAGE_URL = "https://example.com/cartoon-clipart-spring-theme.png";

const SPRING_ACTIVITY_TITLES = [
  "Seed Sorting Sensory Bin",
  "Watering Can Pouring Station",
  "Seed Growth Story Sequence",
  "Garden Scissor Snip Herbs",
];

const SAFETY_SNIPPETS = {
  smallObjects: "choke-safe large seeds",
  water: "water spill",
  scissors: "child-safe scissors",
  allergens: "allergy list",
  sensory: "sensory bin",
};

function buildSeedGrowthPrintableFixture() {
  return {
    title: "Seed Growth Sequencing Cards",
    resourceType: "sequencing_cards",
    purpose: "Children order seed-to-plant pictures during the Seed Growth Story Sequence activity.",
    teacherUse: "Print on letter paper, cut the four seed-growth cards, and use them at the story sequence table.",
    childUse: "Children place the cards in order from seed to sprout to plant.",
    ageBand: "Preschool 3–5",
    pages: [
      {
        type: "sequencing",
        heading: "Seed Growth Sequence",
        visualMode: "simple_vector",
        instructions: "Cut out the cards. Child places them in order: seed, sprout, leaves, flower.",
        items: [
          { name: "Dry seed in soil", visualConcept: "brown seed in dirt cup" },
          { name: "Sprout emerging", visualConcept: "small green sprout" },
          { name: "Growing leaves", visualConcept: "seedling with two leaves" },
          { name: "Flowering plant", visualConcept: "small flowering garden plant" },
        ],
      },
    ],
  };
}

function seedScopeLibrary() {
  const now = new Date().toISOString();
  return {
    lessonPlans: [
      {
        id: "cur-lp-qa-scope-farm-published",
        title: "Farm Animals",
        age: "Preschool 3–5",
        theme: "Farm",
        plan: "Free",
        status: "published",
        weeklyOverview: "Farm scope decoy.",
        objectives: "Do not mutate.",
        coverImageUrl: "/images/lesson-covers/farm-animals.jpg",
        activityIds: ["cur-act-qa-farm-1"],
        resourceIds: ["cur-res-qa-farm-book"],
        dailyPlans: { monday: { items: [{ itemId: "f1", title: "Farm Circle" }] }, tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] } },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "cur-lp-qa-scope-weather-draft",
        title: "Weather Watchers QA Decoy",
        age: "Toddler 18–24 Months",
        theme: "Weather",
        plan: "Pro",
        status: "draft",
        weeklyOverview: "Unrelated draft decoy.",
        activityIds: ["cur-act-qa-weather-1"],
        resourceIds: ["cur-res-qa-weather-print"],
        dailyPlans: { monday: { items: [{ itemId: "w1", title: "Wind Dance" }] }, tuesday: { items: [] }, wednesday: { items: [] }, thursday: { items: [] }, friday: { items: [] } },
        createdAt: now,
        updatedAt: now,
      },
    ],
    activities: [
      { id: "cur-act-qa-farm-1", lessonPlanId: "cur-lp-qa-scope-farm-published", title: "Farm Circle", dayOfWeek: "monday", setupImageUrl: "/api/media/farm-circle.png" },
      { id: "cur-act-qa-weather-1", lessonPlanId: "cur-lp-qa-scope-weather-draft", title: "Wind Dance", dayOfWeek: "monday" },
    ],
    resources: [
      { id: "cur-res-qa-farm-book", title: "Farm Book Guide", resourceCategory: "Books", status: "published", lessonPlanIds: ["cur-lp-qa-scope-farm-published"] },
      { id: "cur-res-qa-weather-print", title: "Weather Cards", resourceCategory: "Printables", status: "draft", lessonPlanIds: ["cur-lp-qa-scope-weather-draft"], fileName: "weather.pdf" },
    ],
  };
}

function snapshotScope(curriculum) {
  return JSON.stringify({
    lessonPlans: curriculum.lessonPlans.map((p) => ({
      id: p.id,
      status: p.status,
      title: p.title,
      weeklyOverview: p.weeklyOverview,
      coverImageUrl: p.coverImageUrl,
      resourceIds: p.resourceIds,
    })),
    resources: curriculum.resources.map((r) => ({ id: r.id, title: r.title, fileName: r.fileName })),
    activities: curriculum.activities.map((a) => ({ id: a.id, lessonPlanId: a.lessonPlanId, title: a.title, setupImageUrl: a.setupImageUrl })),
  });
}

function assertLessonSectionContract(plan, activities) {
  const issues = [];
  const blob = [
    plan.weeklyOverview,
    plan.objectives,
    plan.weeklyMaterials,
    plan.teacherPreparation,
    plan.familyConnection,
    plan.mixedAgeAdaptations,
    plan.budgetSubstitutions,
  ].join("\n");
  if (!String(plan.objectives || "").trim()) issues.push("missing_weekly_objectives");
  if (!String(plan.weeklyMaterials || "").trim()) issues.push("missing_materials");
  if (!String(plan.teacherPreparation || "").trim()) issues.push("missing_preparation");
  if (!String(plan.familyConnection || "").trim()) issues.push("missing_family_connection");
  if (!String(plan.mixedAgeAdaptations || "").trim()) issues.push("missing_mixed_age");
  if (!String(plan.budgetSubstitutions || "").trim()) issues.push("missing_budget_substitutions");
  const checks = [
    [/setup|prepar|stage|tray/i, "teacher setup"],
  ];
  checks.forEach(([re, label]) => {
    if (!re.test(blob)) issues.push(`missing_${label.replace(/\s+/g, "_")}`);
  });
  const actCount = activities.length;
  if (actCount < 3) issues.push(`activity_count_lt_3:${actCount}`);
  activities.slice(0, Math.max(3, actCount)).forEach((act, idx) => {
    const text = [act.objective, act.steps, act.materials, act.safetyNotes, act.teacherLanguage, act.cleanupTips].join("\n");
    if (!act.objective || String(act.objective).length < 20) issues.push(`activity_${idx}_objective`);
    if (!act.steps || String(act.steps).length < 20) issues.push(`activity_${idx}_steps`);
    if (!act.materials || String(act.materials).length < 10) issues.push(`activity_${idx}_materials`);
    if (!/safety|supervis|allerg|choke|scissor|water/i.test(text)) issues.push(`activity_${idx}_safety`);
    if (!/\?/.test(String(act.teacherLanguage || act.steps || ""))) issues.push(`activity_${idx}_open_questions`);
  });
  return { ok: issues.length === 0, issues };
}

function assertSafetyThemes(activities) {
  const combined = activities.map((a) => [a.title, a.materials, a.steps, a.safetyNotes].join(" ")).join("\n").toLowerCase();
  const required = Object.keys(SAFETY_SNIPPETS);
  const missing = required.filter((key) => !new RegExp(SAFETY_SNIPPETS[key].split(/\s+/).slice(0, 2).join("|"), "i").test(combined)
    && !combined.includes(key.replace(/([A-Z])/g, " $1").trim().toLowerCase().split(" ")[0]));
  // Looser check: themes by keyword
  const themes = {
    smallObjects: /choke|small object|bead|seed/i.test(combined),
    water: /water/i.test(combined),
    scissors: /scissor/i.test(combined),
    allergens: /allerg|food|taste/i.test(combined),
    sensory: /sensory|bin|texture/i.test(combined),
  };
  const missingThemes = Object.entries(themes).filter(([, ok]) => !ok).map(([k]) => k);
  return { ok: missingThemes.length === 0, missingThemes, themes };
}

module.exports = {
  EXACT_COMMAND,
  MOCK_RESEARCH_SOURCES,
  GOOD_IMAGE_URL,
  BAD_IMAGE_URL,
  SAFETY_SNIPPETS,
  SPRING_ACTIVITY_TITLES,
  buildSeedGrowthPrintableFixture,
  seedScopeLibrary,
  snapshotScope,
  assertLessonSectionContract,
  assertSafetyThemes,
};
