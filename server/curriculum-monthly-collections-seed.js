/**
 * Boot seed for starter Monthly Curriculum collections (playlist of existing weeks).
 * Also ensures Soft Sounds & Faces exists when referenced by Baby's First Discoveries.
 */
const fs = require("fs");
const path = require("path");
const { MONTHLY_COLLECTION_DEFINITIONS } = require("../scripts/curriculum-monthly-collections.js");

const SOFT_SOUNDS = {
  stableId: "cur-lp-infant-soft-sounds-faces",
  file: path.join(__dirname, "../scripts/curriculum-phase-2f-imports/01-infant-soft-sounds-free.txt"),
};

function seedMonthlyCollectionSeries({ store, curriculum, writeSiteCurriculum, now }) {
  let seriesApi = null;
  try {
    seriesApi = require("../scripts/curriculum-series.js");
  } catch {
    return { seeded: 0, skipped: 0 };
  }
  const normalize = seriesApi.normalizedCurriculumSeries || seriesApi.normalizeCurriculumSeries;
  if (typeof normalize !== "function") return { seeded: 0, skipped: 0 };

  const working = curriculum && typeof curriculum === "object" ? curriculum : { lessonPlans: [], series: [] };
  const seriesList = Array.isArray(working.series) ? [...working.series] : [];
  const planIds = new Set((working.lessonPlans || []).map((plan) => plan.id));
  let seeded = 0;
  let skipped = 0;

  for (const definition of MONTHLY_COLLECTION_DEFINITIONS) {
    if (seriesList.some((item) => item.id === definition.id)) {
      skipped += 1;
      continue;
    }
    const weeksReady = (definition.weeks || []).every((week) => planIds.has(week.lessonPlanId));
    if (!weeksReady) {
      console.warn(
        `[curriculum-monthly-collections-seed] skip ${definition.id} — missing week plan(s):`,
        (definition.weeks || [])
          .filter((week) => !planIds.has(week.lessonPlanId))
          .map((week) => week.lessonPlanId)
          .join(", "),
      );
      continue;
    }
    const normalized = normalize({
      ...definition,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      coverImageSource: definition.coverImageUrl ? "mapped" : "fallback",
      weekCount: definition.weekCount || 4,
    });
    if (!normalized) continue;
    seriesList.push(normalized);
    seeded += 1;
  }

  if (seeded > 0) {
    const nextCurriculum = { ...working, series: seriesList };
    writeSiteCurriculum(store, nextCurriculum, { updatedAt: now });
    store.siteContent = store.siteContent || {};
    store.siteContent.curriculum = nextCurriculum;
    console.log(`[curriculum-monthly-collections-seed] seeded ${seeded} monthly curriculum collection(s)`);
  }

  return { seeded, skipped };
}

async function ensureSoftSoundsPlanSeeded(deps) {
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
  let curriculum = siteContent.curriculum || defaultCurriculumStore();
  if ((curriculum.lessonPlans || []).some((plan) => plan.id === SOFT_SOUNDS.stableId)) {
    return { seeded: 0 };
  }
  if (!fs.existsSync(SOFT_SOUNDS.file)) {
    console.warn("[curriculum-monthly-collections-seed] Soft Sounds file missing — skipping ensure");
    return { seeded: 0 };
  }

  const { parseCurriculumLessonPlanImport } = require("../scripts/curriculum-lesson-import-parser.js");
  const parsed = parseCurriculumLessonPlanImport(fs.readFileSync(SOFT_SOUNDS.file, "utf8"));
  if (!parsed.ok) {
    console.warn("[curriculum-monthly-collections-seed] Soft Sounds parse failed:", parsed.errors?.join("; "));
    return { seeded: 0, errors: parsed.errors || [] };
  }
  const now = new Date().toISOString();
  const planInput = {
    ...parsed.data,
    id: SOFT_SOUNDS.stableId,
    title: "Infant Soft Sounds & Faces",
    plan: "Free",
    status: "published",
    age: "Infant (0-6 months)",
    createdAt: now,
    publishedAt: now,
    updatedAt: now,
  };
  const synced = syncCurriculumActivitiesForLessonPlan(curriculum, planInput);
  if (!synced) return { seeded: 0, errors: ["normalize failed"] };
  const integrityError = assertCurriculumIntegrityOrError(synced);
  if (integrityError) return { seeded: 0, errors: [integrityError.error] };
  writeSiteCurriculum(store, synced, { updatedAt: now });
  await writeStoreAsync(store);
  console.log("[curriculum-monthly-collections-seed] ensured Soft Sounds & Faces lesson plan");
  return { seeded: 1 };
}

async function ensureMonthlyCollectionsSeeded(deps) {
  const soft = await ensureSoftSoundsPlanSeeded(deps);
  const store = deps.readStore();
  const siteContent = store.siteContent && typeof store.siteContent === "object"
    ? store.siteContent
    : deps.defaultSiteContentStore();
  const curriculum = siteContent.curriculum || deps.defaultCurriculumStore();
  const now = new Date().toISOString();
  const seriesResult = seedMonthlyCollectionSeries({
    store,
    curriculum,
    writeSiteCurriculum: deps.writeSiteCurriculum,
    now,
  });
  if (seriesResult.seeded > 0) {
    await deps.writeStoreAsync(store);
  }
  return {
    softSoundsSeeded: soft.seeded || 0,
    seriesSeeded: seriesResult.seeded,
    seriesSkipped: seriesResult.skipped,
    errors: soft.errors || [],
  };
}

module.exports = {
  ensureMonthlyCollectionsSeeded,
  seedMonthlyCollectionSeries,
  MONTHLY_COLLECTION_DEFINITIONS,
  SOFT_SOUNDS,
};
