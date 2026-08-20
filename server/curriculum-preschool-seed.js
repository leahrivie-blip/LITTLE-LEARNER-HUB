const curriculumLessonAccessPlan = require("./curriculum-lesson-access-plan.js");
/**
 * Startup seed/repair: ensure preschool Free and Pro published lesson plans exist
 * and repair incomplete weeks (e.g. Space Adventure with only Mon/Tue).
 *
 * Idempotent:
 * - Seeds plans whose stable IDs are missing
 * - Re-imports plans that are missing one or more weekdays vs the local source file
 */
const {
  PRESCHOOL_IMPORT_TARGETS,
  readPreschoolImportTarget,
  preschoolPlansMissing,
} = require("../scripts/curriculum-preschool-import-targets.js");

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

function plansNeedingRepair(curriculum, targets = PRESCHOOL_IMPORT_TARGETS) {
  const plans = curriculum?.lessonPlans || [];
  const byId = new Map(plans.map((plan) => [plan.id, plan]));
  const needs = [];

  for (const target of targets) {
    const live = byId.get(target.stableId);
    if (!live) continue; // missing handled by seed path
    if (String(live.status || "published") === "archived") continue;

    let source;
    try {
      source = readPreschoolImportTarget(target);
    } catch {
      continue;
    }

    const liveCounts = weekdayActivityCounts(live);
    const sourceCounts = weekdayActivityCounts(source);
    const missingDays = incompleteWeekdays(liveCounts);
    const liveTotal = totalActivities(liveCounts);
    const sourceTotal = totalActivities(sourceCounts);

    // Repair when any weekday is empty but the source has content for that day,
    // or when the live plan is clearly truncated vs source (e.g. Space Adventure 8 vs 19).
    const truncated = sourceTotal >= 10 && liveTotal > 0 && liveTotal < Math.ceil(sourceTotal * 0.6);
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

async function ensurePreschoolCurriculumSeeded(deps) {
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
  const missing = preschoolPlansMissing(curriculum);
  const repairQueue = plansNeedingRepair(curriculum);

  if (!missing.length && !repairQueue.length) {
    return {
      seeded: 0,
      repaired: 0,
      skipped: PRESCHOOL_IMPORT_TARGETS.length,
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
      ...curriculumLessonAccessPlan.mergeSeedImportPreservingOwnerAccess(parsed, existingPlan),
      createdAt: existingPlan?.createdAt || now,
      // Stable historical stamp so startup seeds never look like "new this week".
      publishedAt: existingPlan?.publishedAt || existingPlan?.createdAt || "2026-01-01T00:00:00.000Z",
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
      const parsed = readPreschoolImportTarget(target);
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
          `[curriculum-preschool-seed] repaired ${entry.target.stableId} (${entry.reason}; ${entry.liveTotal} → ${entry.sourceTotal} activities)`,
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
      `[curriculum-preschool-seed] seeded ${seeded} · repaired ${repaired} preschool lesson plan(s)`,
    );
  }

  if (errors.length) {
    console.error("[curriculum-preschool-seed] errors:", errors);
  }

  return {
    seeded,
    repaired,
    skipped: PRESCHOOL_IMPORT_TARGETS.length - missing.length - repaired,
    errors,
  };
}

module.exports = {
  ensurePreschoolCurriculumSeeded,
  plansNeedingRepair,
  weekdayActivityCounts,
};
