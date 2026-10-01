"use strict";

/**
 * Disposable QA scope fixtures for Curriculum Operator spring planting E2E.
 */

const EXACT_COMMAND = "Research spring planting activities for preschoolers, create a complete lesson plan, make the activities age-appropriate, create the matching printable, use realistic activity pictures, keep anything that is already good, fix anything that is wrong, and leave it ready for me to review.";

const FOLLOW_UP_COMMANDS = [
  "Make Activity 1 easier for younger toddlers.",
  "Replace only the printable.",
  "Make the materials more budget-friendly.",
  "Change only Activity 3’s image.",
  "Add a family connection without changing the activities.",
];

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

/** Minimum seed URLs for image audit (not lesson content). */
const IMAGE_SEED = {
  GOOD: "/api/media/enrichment-photos/tk-enrich-spring-qa-good?variant=full",
  BAD: "https://example.com/cartoon-clipart-spring-theme.png",
  CONTROL: "/api/media/enrichment-photos/tk-enrich-spring-qa-control?variant=full",
};

const DECOY_LESSON_IDS = [
  "cur-lp-qa-scope-farm-published",
  "cur-lp-qa-scope-weather-draft",
];

function seedScopeLibrary() {
  const now = new Date().toISOString();
  return {
    lessonPlans: [
      {
        id: DECOY_LESSON_IDS[0],
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
        enrichmentDraft: {
          week: {
            songs: [{ title: "Farm Song", rightsStatus: "original" }],
            books: [{ title: "Farm Book", author: "Decoy Author" }],
            printableIds: [],
          },
          activities: {},
          updatedAt: now,
        },
        dailyPlans: {
          monday: { items: [{ itemId: "f1", title: "Farm Circle", dayOfWeek: "monday" }] },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: DECOY_LESSON_IDS[1],
        title: "Weather Watchers QA Decoy",
        age: "Toddler 18–24 Months",
        theme: "Weather",
        plan: "Pro",
        status: "draft",
        weeklyOverview: "Unrelated draft decoy.",
        coverImageUrl: "/images/lesson-covers/weather-decoy.jpg",
        activityIds: ["cur-act-qa-weather-1"],
        resourceIds: ["cur-res-qa-weather-print"],
        enrichmentDraft: {
          week: {
            songs: [{ title: "Weather Song", rightsStatus: "original" }],
            books: [{ title: "Weather Book", author: "Decoy Author" }],
            printableIds: ["cur-res-qa-weather-print"],
          },
          activities: {},
          updatedAt: now,
        },
        dailyPlans: {
          monday: { items: [{ itemId: "w1", title: "Wind Dance", dayOfWeek: "monday" }] },
          tuesday: { items: [] },
          wednesday: { items: [] },
          thursday: { items: [] },
          friday: { items: [] },
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    activities: [
      {
        id: "cur-act-qa-farm-1",
        lessonPlanId: DECOY_LESSON_IDS[0],
        title: "Farm Circle",
        dayOfWeek: "monday",
        setupImageUrl: "/api/media/farm-circle.png",
      },
      {
        id: "cur-act-qa-weather-1",
        lessonPlanId: DECOY_LESSON_IDS[1],
        title: "Wind Dance",
        dayOfWeek: "monday",
      },
    ],
    resources: [
      {
        id: "cur-res-qa-farm-book",
        title: "Farm Book Guide",
        resourceCategory: "Books",
        status: "published",
        lessonPlanIds: [DECOY_LESSON_IDS[0]],
      },
      {
        id: "cur-res-qa-weather-print",
        title: "Weather Cards",
        resourceCategory: "Printables",
        status: "draft",
        lessonPlanIds: [DECOY_LESSON_IDS[1]],
        fileName: "weather.pdf",
        fileData: "data:application/pdf;base64,JVBERi0xLjQK",
        pageCount: 1,
      },
    ],
  };
}

function orderedActivityIds(curriculum, lessonId) {
  const plan = curriculum.lessonPlans.find((p) => p.id === lessonId);
  if (!plan) return [];
  const order = [];
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    const items = plan.dailyPlans?.[day]?.items || [];
    items.forEach((item) => {
      const act = curriculum.activities.find((a) => a.lessonPlanId === lessonId && a.itemId === item.itemId);
      if (act) order.push(act.id);
    });
  });
  if (!order.length) {
    return curriculum.activities.filter((a) => a.lessonPlanId === lessonId).map((a) => a.id);
  }
  return order;
}

function scopeFingerprint(curriculum) {
  return JSON.stringify({
    decoyPlans: DECOY_LESSON_IDS.map((id) => {
      const p = curriculum.lessonPlans.find((row) => row.id === id);
      return p ? {
        id: p.id,
        status: p.status,
        title: p.title,
        weeklyOverview: p.weeklyOverview,
        coverImageUrl: p.coverImageUrl,
        resourceIds: p.resourceIds,
        songs: p.enrichmentDraft?.week?.songs,
        books: p.enrichmentDraft?.week?.books,
        printableIds: p.enrichmentDraft?.week?.printableIds,
      } : null;
    }),
    decoyResources: ["cur-res-qa-farm-book", "cur-res-qa-weather-print"].map((id) => {
      const r = curriculum.resources.find((row) => row.id === id);
      return r ? { id: r.id, title: r.title, fileName: r.fileName, fileData: r.fileData } : null;
    }),
    decoyActivities: ["cur-act-qa-farm-1", "cur-act-qa-weather-1"].map((id) => {
      const a = curriculum.activities.find((row) => row.id === id);
      return a ? { id: a.id, setupImageUrl: a.setupImageUrl, title: a.title } : null;
    }),
  });
}

function lessonSnapshot(curriculum, lessonId) {
  const plan = curriculum.lessonPlans.find((p) => p.id === lessonId);
  const acts = curriculum.activities.filter((a) => a.lessonPlanId === lessonId);
  const resources = curriculum.resources.filter((r) => (r.lessonPlanIds || []).includes(lessonId));
  return JSON.stringify({
    plan: {
      weeklyOverview: plan?.weeklyOverview,
      objectives: plan?.objectives,
      weeklyMaterials: plan?.weeklyMaterials,
      teacherPreparation: plan?.teacherPreparation,
      familyConnection: plan?.familyConnection,
      mixedAgeAdaptations: plan?.mixedAgeAdaptations,
      budgetSubstitutions: plan?.budgetSubstitutions,
      coverImageUrl: plan?.coverImageUrl,
      enrichmentDraft: plan?.enrichmentDraft,
    },
    activities: acts.map((a) => ({
      id: a.id,
      title: a.title,
      objective: a.objective,
      materials: a.materials,
      steps: a.steps,
      setupImageUrl: a.setupImageUrl,
      relatedPrintableId: a.relatedPrintableId,
    })),
    resources: resources.map((r) => ({ id: r.id, title: r.title, fileName: r.fileName, pageCount: r.pageCount })),
  });
}

module.exports = {
  EXACT_COMMAND,
  FOLLOW_UP_COMMANDS,
  MOCK_RESEARCH_SOURCES,
  IMAGE_SEED,
  DECOY_LESSON_IDS,
  seedScopeLibrary,
  orderedActivityIds,
  scopeFingerprint,
  lessonSnapshot,
};
