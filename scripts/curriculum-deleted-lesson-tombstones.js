/**
 * Durable Owner Admin lesson-delete tombstones.
 *
 * When a lesson plan is explicitly deleted, its id is recorded on
 * curriculum.deletedLessonPlanIds so startup seed / ensure / hydrate logic
 * cannot recreate it from import targets.
 */

const MAX_DELETED_LESSON_PLAN_IDS = 5000;

function normalizeLessonPlanId(id) {
  return String(id || "").trim().slice(0, 160);
}

function normalizedDeletedLessonPlanIds(value) {
  const raw = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const id = normalizeLessonPlanId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_DELETED_LESSON_PLAN_IDS) break;
  }
  return out;
}

function isLessonPlanIdTombstoned(curriculum, id) {
  const key = normalizeLessonPlanId(id);
  if (!key) return false;
  return normalizedDeletedLessonPlanIds(curriculum?.deletedLessonPlanIds).includes(key);
}

function recordDeletedLessonPlanId(curriculum, id) {
  const key = normalizeLessonPlanId(id);
  const base = curriculum && typeof curriculum === "object" ? curriculum : {};
  if (!key) {
    return {
      ...base,
      deletedLessonPlanIds: normalizedDeletedLessonPlanIds(base.deletedLessonPlanIds),
    };
  }
  const existing = normalizedDeletedLessonPlanIds(base.deletedLessonPlanIds);
  if (existing.includes(key)) {
    return { ...base, deletedLessonPlanIds: existing };
  }
  return {
    ...base,
    deletedLessonPlanIds: [...existing, key],
  };
}

/**
 * Shared check for startup seed "plans missing" helpers:
 * a target is missing only when the live plan is absent AND the id was not
 * explicitly deleted by Owner Admin.
 */
function seedTargetsMissing(curriculum, targets) {
  const plans = Array.isArray(curriculum?.lessonPlans) ? curriculum.lessonPlans : [];
  const list = Array.isArray(targets) ? targets : [];
  return list.filter((target) => {
    const stableId = normalizeLessonPlanId(target?.stableId);
    if (!stableId) return false;
    if (isLessonPlanIdTombstoned(curriculum, stableId)) return false;
    return !plans.some((plan) => plan && plan.id === stableId);
  });
}

module.exports = {
  MAX_DELETED_LESSON_PLAN_IDS,
  normalizeLessonPlanId,
  normalizedDeletedLessonPlanIds,
  isLessonPlanIdTombstoned,
  recordDeletedLessonPlanId,
  seedTargetsMissing,
};
