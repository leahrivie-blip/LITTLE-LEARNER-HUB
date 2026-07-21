/**
 * Startup seed/repair for Infant Pro batch2 + Toddler Pro batch2/3 Gold Standard plans.
 */
const {
  INFANT_TODDLER_PRO_BATCH_TARGETS,
  readInfantToddlerProBatchTarget,
  infantToddlerProBatchPlansMissing,
} = require("../scripts/curriculum-infant-toddler-pro-batch-targets.js");

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function weekdayActivityCounts(plan) {
  return Object.fromEntries(
    WEEKDAYS.map((day) => [
      day,
      Array.isArray(plan?.dailyPlans?.[day]?.items) ? plan.dailyPlans[day].items.length : 0,
    ]),
  );
}

function totalActivities(counts) {
  return WEEKDAYS.reduce((sum, day) => sum + (counts[day] || 0), 0);
}

function incompleteWeekdays(counts) {
  return WEEKDAYS.filter((day) => (counts[day] || 0) === 0);
}

function plansNeedingRepair(curriculum, targets = INFANT_TODDLER_PRO_BATCH_TARGETS) {
  const plans = curriculum?.lessonPlans || [];
  const byId = new Map(plans.map((plan) => [plan.id, plan]));
  const needs = [];

  for (const target of targets) {
    const live = byId.get(target.stableId);
    if (!live) continue;
    if (String(live.status || "published") === "archived") continue;

    let source;
    try {
      source = readInfantToddlerProBatchTarget(target);
    } catch {
      continue;
    }

    const liveCounts = weekdayActivityCounts(live);
    const sourceCounts = weekdayActivityCounts(source);
    const missingDays = incompleteWeekdays(liveCounts);
    const liveTotal = totalActivities(liveCounts);
    const sourceTotal = totalActivities(sourceCounts);
    const truncated = sourceTotal >= 8 && liveTotal > 0 && liveTotal < Math.ceil(sourceTotal * 0.6);
    const missingFilledSourceDays = missingDays.some((day) => (sourceCounts[day] || 0) > 0);
    if (missingFilledSourceDays || truncated) {
      needs.push({
        target,
        source,
        reason: truncated ? "truncated-week" : `missing-days:${missingDays.join(",")}`,
        liveTotal,
        sourceTotal,
      });
    }
  }

  return needs;
}

async function ensureInfantToddlerProBatchCurriculumSeeded(deps) {
  const {
    readStore,
    writeStoreAsync,
    writeSiteCurriculum,
    syncCurriculumActivitiesForLessonPlan,
    assertCurriculumIntegrityOrError,
    defaultSiteContentStore,
    defaultCurriculumStore,
  } = deps;

  const store = readStore();
  const siteContent = store.siteContent && typeof store.siteContent === "object"
    ? store.siteContent
    : defaultSiteContentStore();
  const curriculum = siteContent.curriculum || defaultCurriculumStore();
  const missing = infantToddlerProBatchPlansMissing(curriculum);
  const repairQueue = plansNeedingRepair(curriculum);

  if (!missing.length && !repairQueue.length) {
    const seriesOnly = seedInfantToddlerProMonthlySeries({
      store,
      curriculum,
      writeSiteCurriculum,
      now: new Date().toISOString(),
    });
    if (seriesOnly.seeded > 0) await writeStoreAsync(store);
    return {
      seeded: 0,
      repaired: 0,
      seriesSeeded: seriesOnly.seeded,
      skipped: INFANT_TODDLER_PRO_BATCH_TARGETS.length,
      errors: [],
    };
  }

  const errors = [];
  let seeded = 0;
  let repaired = 0;
  let workingCurriculum = curriculum;
  const now = new Date().toISOString();

  const applyPlan = (target, parsed, existingPlan) => {
    const planInput = {
      ...parsed,
      createdAt: existingPlan?.createdAt || now,
      publishedAt: existingPlan?.publishedAt || existingPlan?.createdAt || now,
      updatedAt: now,
    };
    const synced = syncCurriculumActivitiesForLessonPlan(workingCurriculum, planInput);
    if (!synced) {
      errors.push(`${target.stableId}: normalization failed`);
      return false;
    }
    const integrityError = assertCurriculumIntegrityOrError(synced);
    if (integrityError) {
      errors.push(`${target.stableId}: ${integrityError.error}`);
      return false;
    }
    workingCurriculum = synced;
    return true;
  };

  for (const target of missing) {
    try {
      const parsed = readInfantToddlerProBatchTarget(target);
      const existingPlan = (workingCurriculum.lessonPlans || []).find((item) => item.id === target.stableId);
      if (applyPlan(target, parsed, existingPlan)) seeded += 1;
    } catch (error) {
      errors.push(`${target.stableId}: ${error.message}`);
    }
  }

  for (const entry of repairQueue) {
    try {
      const existingPlan = (workingCurriculum.lessonPlans || []).find((item) => item.id === entry.target.stableId);
      if (applyPlan(entry.target, entry.source, existingPlan)) {
        repaired += 1;
        console.log(
          `[curriculum-infant-toddler-pro-batch-seed] repaired ${entry.target.stableId} (${entry.reason}; ${entry.liveTotal} → ${entry.sourceTotal} activities)`,
        );
      }
    } catch (error) {
      errors.push(`${entry.target.stableId}: ${error.message}`);
    }
  }

  if (seeded > 0 || repaired > 0) {
    writeSiteCurriculum(store, workingCurriculum, { updatedAt: now });
    await writeStoreAsync(store);
    console.log(
      `[curriculum-infant-toddler-pro-batch-seed] seeded ${seeded} · repaired ${repaired} Infant/Toddler Pro lesson plan(s)`,
    );
  }

  // Seed Netflix-style monthly series that link the new weekly plans.
  const seriesResult = seedInfantToddlerProMonthlySeries({
    store,
    curriculum: (store.siteContent && store.siteContent.curriculum) || workingCurriculum,
    writeSiteCurriculum,
    now,
  });
  if (seriesResult.seeded > 0) {
    await writeStoreAsync(store);
  }

  if (errors.length) {
    console.error("[curriculum-infant-toddler-pro-batch-seed] errors:", errors);
  }

  return {
    seeded,
    repaired,
    seriesSeeded: seriesResult.seeded,
    skipped: INFANT_TODDLER_PRO_BATCH_TARGETS.length - missing.length - repaired,
    errors,
  };
}

const MONTHLY_SERIES_DEFINITIONS = [
  {
    id: "cur-series-infant-animals-care-pro",
    title: "Infant Animals & Care",
    description: "Four Infant Pro weeks exploring zoo friends, woodland animals, beloved pets, and gentle baby sign communication.",
    theme: "Animals & Care",
    age: "Infant",
    season: "Summer",
    month: "July",
    year: "2026",
    plan: "Pro",
    status: "published",
    featured: true,
    overallGoals: "Build receptive language, secure relationships, sensory exploration, and early communication through animal-themed caregiver play.",
    overallMaterials: "Board books, large animal figures, puppets, scarves, mirrors, soft textures, shakers.",
    familyConnection: "Invite families to name one animal their baby notices at home and practice one simple sign or sound together.",
    learningDomains: ["Social Emotional", "Language & Literacy", "Physical Development", "Creative Arts"],
    coverImageUrl: "/images/lesson-covers/zoo-animals.jpg",
    weeks: [
      { weekNumber: 1, lessonPlanId: "cur-lp-infant-zoo-animals" },
      { weekNumber: 2, lessonPlanId: "cur-lp-infant-woodland-animals" },
      { weekNumber: 3, lessonPlanId: "cur-lp-infant-pets-we-love" },
      { weekNumber: 4, lessonPlanId: "cur-lp-infant-baby-sign-language" },
    ],
  },
  {
    id: "cur-series-infant-sensory-movement-pro",
    title: "Infant Sensory & Movement",
    description: "Infant Pro weeks focused on textures, music, movement, and familiar animal play.",
    theme: "Sensory & Movement",
    age: "Infant",
    season: "Summer",
    month: "August",
    year: "2026",
    plan: "Pro",
    status: "published",
    overallGoals: "Support tummy time, grasping, listening, and joyful movement through short repeated invitations.",
    overallMaterials: "Textured fabrics, scarves, shakers, drums, soft mats, animal cards.",
    familyConnection: "Share one favorite song or texture game from the week for families to repeat at home.",
    learningDomains: ["Physical Development", "Creative Arts", "Social Emotional", "Language & Literacy"],
    coverImageUrl: "/images/lesson-covers/move-and-groove-babies.jpg",
    weeks: [
      { weekNumber: 1, lessonPlanId: "cur-lp-infant-texture-adventures" },
      { weekNumber: 2, lessonPlanId: "cur-lp-infant-move-and-groove-babies" },
      { weekNumber: 3, lessonPlanId: "cur-lp-infant-zoo-animals" },
      { weekNumber: 4, lessonPlanId: "cur-lp-infant-pets-we-love" },
    ],
  },
  {
    id: "cur-series-toddler-stem-builders-pro",
    title: "Toddler STEM Builders",
    description: "Four Toddler Pro weeks of farm STEM, transportation, building, and little scientist investigations.",
    theme: "STEM Builders",
    age: "Toddler",
    season: "Summer",
    month: "July",
    year: "2026",
    plan: "Pro",
    status: "published",
    featured: true,
    overallGoals: "Grow curiosity, early problem-solving, counting/sorting, and collaborative building through play-based STEM.",
    overallMaterials: "Blocks, ramps, vehicles, farm animals, sensory bins, magnifiers, paint.",
    familyConnection: "Ask families to notice one simple machine, vehicle, or building at home and talk about how it works.",
    learningDomains: ["Science", "Math", "Physical Development", "Language & Literacy"],
    coverImageUrl: "/images/lesson-covers/construction-crew.jpg",
    weeks: [
      { weekNumber: 1, lessonPlanId: "cur-lp-toddler-farm-stem" },
      { weekNumber: 2, lessonPlanId: "cur-lp-toddler-transportation-builders" },
      { weekNumber: 3, lessonPlanId: "cur-lp-toddler-busy-builders" },
      { weekNumber: 4, lessonPlanId: "cur-lp-toddler-little-scientists-stem" },
    ],
  },
  {
    id: "cur-series-toddler-nature-explorers-pro",
    title: "Toddler Nature Explorers",
    description: "Toddler Pro nature month: insects, outdoor explorers, pond life, and growing gardens STEM.",
    theme: "Nature Explorers",
    age: "Toddler",
    season: "Summer",
    month: "August",
    year: "2026",
    plan: "Pro",
    status: "published",
    featured: true,
    overallGoals: "Encourage respectful outdoor observation, descriptive language, and hands-on nature STEM play.",
    overallMaterials: "Toy insects, magnifiers, leaves, water trays, garden tools, seeds, books.",
    familyConnection: "Invite a short family nature walk to notice one insect, plant, or pond/water feature.",
    learningDomains: ["Science", "Language & Literacy", "Physical Development", "Creative Arts"],
    coverImageUrl: "/images/lesson-covers/amazing-insects-toddler.jpg",
    weeks: [
      { weekNumber: 1, lessonPlanId: "cur-lp-toddler-amazing-insects" },
      { weekNumber: 2, lessonPlanId: "cur-lp-toddler-nature-explorers" },
      { weekNumber: 3, lessonPlanId: "cur-lp-toddler-pond-life-explorers" },
      { weekNumber: 4, lessonPlanId: "cur-lp-toddler-growing-gardens-stem" },
    ],
  },
  {
    id: "cur-series-toddler-science-lab-pro",
    title: "Toddler Science Lab",
    description: "Toddler Pro science month: rainbow science, weather lab, space explorers, and fossil hunters.",
    theme: "Science Lab",
    age: "Toddler",
    season: "Fall",
    month: "September",
    year: "2026",
    plan: "Pro",
    status: "published",
    overallGoals: "Practice prediction, observation, vocabulary, and playful investigation across weather, color, space, and fossils.",
    overallMaterials: "Weather cards, flashlights, color trays, space props, sand dig trays, fossil replicas.",
    familyConnection: "Look at the sky together and talk about weather, moon, or colors noticed that day.",
    learningDomains: ["Science", "Math", "Language & Literacy", "Creative Arts"],
    coverImageUrl: "/images/lesson-covers/weather-lab.jpg",
    weeks: [
      { weekNumber: 1, lessonPlanId: "cur-lp-toddler-rainbow-science" },
      { weekNumber: 2, lessonPlanId: "cur-lp-toddler-weather-lab" },
      { weekNumber: 3, lessonPlanId: "cur-lp-toddler-space-explorers-stem" },
      { weekNumber: 4, lessonPlanId: "cur-lp-toddler-fossil-hunters" },
    ],
  },
  {
    id: "cur-series-toddler-harvest-kitchen-pro",
    title: "Toddler Harvest Kitchen",
    description: "Toddler Pro harvest-themed weeks blending orchard adventures, baking, gardens, and farm STEM.",
    theme: "Harvest Kitchen",
    age: "Toddler",
    season: "Fall",
    month: "October",
    year: "2026",
    plan: "Pro",
    status: "published",
    overallGoals: "Connect food, farms, and kitchens through sensory play, practical life, and early STEM.",
    overallMaterials: "Apples, playdough, baking props, garden tools, farm animals, scoops.",
    familyConnection: "Cook or taste one farm food together and talk about where it comes from.",
    learningDomains: ["Science", "Physical Development", "Language & Literacy", "Social Emotional"],
    coverImageUrl: "/images/lesson-covers/little-bakers.jpg",
    weeks: [
      { weekNumber: 1, lessonPlanId: "cur-lp-toddler-apple-orchard-adventures" },
      { weekNumber: 2, lessonPlanId: "cur-lp-toddler-little-bakers" },
      { weekNumber: 3, lessonPlanId: "cur-lp-toddler-growing-gardens-stem" },
      { weekNumber: 4, lessonPlanId: "cur-lp-toddler-farm-stem" },
    ],
  },
];

function seedInfantToddlerProMonthlySeries({ store, curriculum, writeSiteCurriculum, now }) {
  let seriesApi = null;
  try {
    seriesApi = require("../scripts/curriculum-series.js");
  } catch {
    return { seeded: 0 };
  }
  const normalize = seriesApi.normalizedCurriculumSeries || seriesApi.normalizeCurriculumSeries;
  if (typeof normalize !== "function") return { seeded: 0 };

  const working = curriculum && typeof curriculum === "object" ? curriculum : { lessonPlans: [], series: [] };
  const seriesList = Array.isArray(working.series) ? [...working.series] : [];
  const planIds = new Set((working.lessonPlans || []).map((p) => p.id));
  let seeded = 0;

  for (const definition of MONTHLY_SERIES_DEFINITIONS) {
    if (seriesList.some((item) => item.id === definition.id)) continue;
    const weeksReady = (definition.weeks || []).every((week) => planIds.has(week.lessonPlanId));
    if (!weeksReady) continue;
    const normalized = normalize({
      ...definition,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      coverImageSource: "mapped",
      weekCount: 4,
    });
    if (!normalized) continue;
    seriesList.push(normalized);
    seeded += 1;
  }

  if (seeded > 0) {
    const nextCurriculum = { ...working, series: seriesList };
    writeSiteCurriculum(store, nextCurriculum, { updatedAt: now });
    // fire-and-forget async write handled by caller path; ensure sync store update
    store.siteContent = store.siteContent || {};
    store.siteContent.curriculum = nextCurriculum;
    console.log(`[curriculum-infant-toddler-pro-batch-seed] seeded ${seeded} monthly curriculum series`);
  }

  return { seeded };
}

module.exports = {
  ensureInfantToddlerProBatchCurriculumSeeded,
  plansNeedingRepair,
  infantToddlerProBatchPlansMissing,
  INFANT_TODDLER_PRO_BATCH_TARGETS,
};
