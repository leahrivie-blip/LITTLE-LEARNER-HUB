/**
 * Startup seed: ensure 10 preschool Free/published lesson plans exist in the store.
 * Idempotent — only imports plans whose stable IDs are missing.
 */
const {
  PRESCHOOL_IMPORT_TARGETS,
  readPreschoolImportTarget,
  preschoolPlansMissing,
} = require("../scripts/curriculum-preschool-import-targets.js");

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

  if (!missing.length) {
    return { seeded: 0, skipped: PRESCHOOL_IMPORT_TARGETS.length, errors: [] };
  }

  const errors = [];
  let seeded = 0;
  let workingCurriculum = curriculum;
  const now = new Date().toISOString();

  for (const target of missing) {
    try {
      const parsed = readPreschoolImportTarget(target);
      const existingPlan = (workingCurriculum.lessonPlans || []).find((item) => item.id === target.stableId);
      const planInput = {
        ...parsed,
        createdAt: existingPlan?.createdAt || now,
        updatedAt: now,
      };
      const synced = syncCurriculumActivitiesForLessonPlan(workingCurriculum, planInput);
      if (!synced) {
        errors.push(`${target.stableId}: normalization failed`);
        continue;
      }
      const integrityError = assertCurriculumIntegrityOrError(synced);
      if (integrityError) {
        errors.push(`${target.stableId}: ${integrityError.error}`);
        continue;
      }
      workingCurriculum = synced;
      seeded += 1;
    } catch (error) {
      errors.push(`${target.stableId}: ${error.message}`);
    }
  }

  if (seeded > 0) {
    writeSiteCurriculum(store, workingCurriculum, { updatedAt: now });
    await writeStoreAsync(store);
    console.log(`[curriculum-preschool-seed] seeded ${seeded} preschool lesson plan(s) with synced activities`);
  }

  if (errors.length) {
    console.error("[curriculum-preschool-seed] errors:", errors);
  }

  return {
    seeded,
    skipped: PRESCHOOL_IMPORT_TARGETS.length - missing.length,
    errors,
  };
}

module.exports = { ensurePreschoolCurriculumSeeded };
