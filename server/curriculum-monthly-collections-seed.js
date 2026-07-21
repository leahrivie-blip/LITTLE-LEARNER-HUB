/**
 * Boot seed for starter Monthly Curriculum collections (playlist of existing weeks).
 *
 * Exact-title rule: weeks without an exact library match stay empty and flagged
 * (needsManualPick). Incomplete collections seed as needs_review — never substitute.
 */
const { MONTHLY_COLLECTION_DEFINITIONS, missingExactPlanReport } = require("../scripts/curriculum-monthly-collections.js");

function weeksMatchDefinition(liveWeeks, definitionWeeks) {
  const live = Array.isArray(liveWeeks) ? liveWeeks : [];
  const expected = Array.isArray(definitionWeeks) ? definitionWeeks : [];
  if (live.length !== expected.length) return false;
  return expected.every((week, index) => {
    const item = live[index] || {};
    return String(item.lessonPlanId || "") === String(week.lessonPlanId || "")
      && String(item.label || "") === String(week.label || "");
  });
}

function seedMonthlyCollectionSeries({ store, curriculum, writeSiteCurriculum, now }) {
  let seriesApi = null;
  try {
    seriesApi = require("../scripts/curriculum-series.js");
  } catch {
    return { seeded: 0, repaired: 0, skipped: 0, flagged: [] };
  }
  const normalize = seriesApi.normalizedCurriculumSeries || seriesApi.normalizeCurriculumSeries;
  if (typeof normalize !== "function") return { seeded: 0, repaired: 0, skipped: 0, flagged: [] };

  const working = curriculum && typeof curriculum === "object" ? curriculum : { lessonPlans: [], series: [] };
  const seriesList = Array.isArray(working.series) ? [...working.series] : [];
  const planIds = new Set((working.lessonPlans || []).map((plan) => plan.id));
  let seeded = 0;
  let repaired = 0;
  let skipped = 0;
  const flagged = missingExactPlanReport();

  for (const definition of MONTHLY_COLLECTION_DEFINITIONS) {
    const linkedMissing = (definition.weeks || [])
      .filter((week) => week.lessonPlanId && !planIds.has(week.lessonPlanId))
      .map((week) => week.lessonPlanId);
    if (linkedMissing.length) {
      console.warn(
        `[curriculum-monthly-collections-seed] ${definition.id} waiting on plans: ${linkedMissing.join(", ")}`,
      );
    }

    const safeWeeks = (definition.weeks || []).map((week) => (
      week.lessonPlanId && !planIds.has(week.lessonPlanId)
        ? {
          ...week,
          lessonPlanId: "",
          needsManualPick: true,
          missingPlanTitle: week.label || week.missingPlanTitle || week.lessonPlanId,
        }
        : week
    ));
    const hasGaps = safeWeeks.some((week) => !week.lessonPlanId);
    const filledCount = safeWeeks.filter((week) => week.lessonPlanId).length;
    const status = filledCount
      ? (definition.status || "published")
      : "needs_review";
    const payload = {
      ...definition,
      weeks: safeWeeks,
      status,
      featured: !hasGaps && Boolean(definition.featured),
      createdAt: now,
      updatedAt: now,
      publishedAt: filledCount ? now : "",
      coverImageSource: definition.coverImageUrl ? "mapped" : "fallback",
      weekCount: definition.weekCount || 4,
    };

    const existingIndex = seriesList.findIndex((item) => item.id === definition.id);
    if (existingIndex >= 0) {
      const existing = seriesList[existingIndex];
      if (weeksMatchDefinition(existing.weeks, safeWeeks) && existing.status === status) {
        skipped += 1;
        continue;
      }
      const normalized = normalize({
        ...existing,
        ...payload,
        createdAt: existing.createdAt || now,
      });
      if (!normalized) continue;
      seriesList[existingIndex] = normalized;
      repaired += 1;
      continue;
    }

    const normalized = normalize(payload);
    if (!normalized) continue;
    seriesList.push(normalized);
    seeded += 1;
  }

  if (seeded > 0 || repaired > 0) {
    const nextCurriculum = { ...working, series: seriesList };
    writeSiteCurriculum(store, nextCurriculum, { updatedAt: now });
    store.siteContent = store.siteContent || {};
    store.siteContent.curriculum = nextCurriculum;
    console.log(
      `[curriculum-monthly-collections-seed] seeded ${seeded} · repaired ${repaired} monthly curriculum collection(s)`,
    );
  }
  if (flagged.length) {
    console.warn(
      `[curriculum-monthly-collections-seed] ${flagged.length} week(s) need manual plan picks:`,
      flagged.map((row) => `${row.curriculumTitle} W${row.weekNumber} “${row.requestedTitle}”`).join("; "),
    );
  }

  return { seeded, repaired, skipped, flagged };
}

async function ensureMonthlyCollectionsSeeded(deps) {
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
  if (seriesResult.seeded > 0 || seriesResult.repaired > 0) {
    await deps.writeStoreAsync(store);
  }
  return {
    softSoundsSeeded: 0,
    seriesSeeded: seriesResult.seeded,
    seriesRepaired: seriesResult.repaired,
    seriesSkipped: seriesResult.skipped,
    flaggedWeeks: seriesResult.flagged,
    errors: [],
  };
}

module.exports = {
  ensureMonthlyCollectionsSeeded,
  seedMonthlyCollectionSeries,
  MONTHLY_COLLECTION_DEFINITIONS,
  missingExactPlanReport,
};
