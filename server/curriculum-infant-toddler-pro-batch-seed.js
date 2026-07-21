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
    return {
      seeded: 0,
      repaired: 0,
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

  if (errors.length) {
    console.error("[curriculum-infant-toddler-pro-batch-seed] errors:", errors);
  }

  return {
    seeded,
    repaired,
    skipped: INFANT_TODDLER_PRO_BATCH_TARGETS.length - missing.length - repaired,
    errors,
  };
}

module.exports = {
  ensureInfantToddlerProBatchCurriculumSeeded,
  plansNeedingRepair,
  infantToddlerProBatchPlansMissing,
  INFANT_TODDLER_PRO_BATCH_TARGETS,
};
