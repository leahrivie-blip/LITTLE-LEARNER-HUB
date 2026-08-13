/**
 * Minimal reconcile helper for llh_store updated_at CAS conflicts.
 * Preserves legitimate stale curriculum mutations while never re-inflating
 * enrichmentPublishHistory from a pre-prune cache.
 */
"use strict";

/**
 * @param {object|null|undefined} authPlan
 * @param {object|null|undefined} stalePlan
 * @returns {object|null}
 */
function mergeLessonPlanPreferStaleFieldsAuthHistory(authPlan, stalePlan) {
  if (!stalePlan && !authPlan) return null;
  if (!stalePlan) return authPlan;
  if (!authPlan) {
    const clone = { ...stalePlan };
    // Brand-new local plan: do not carry unbounded history across the conflict.
    if (Array.isArray(clone.enrichmentPublishHistory) && clone.enrichmentPublishHistory.length > 5) {
      clone.enrichmentPublishHistory = clone.enrichmentPublishHistory.slice(0, 5);
    }
    return clone;
  }
  const merged = {
    ...authPlan,
    ...stalePlan,
    // History is always authoritative (pruned) Postgres state.
    enrichmentPublishHistory: Array.isArray(authPlan.enrichmentPublishHistory)
      ? authPlan.enrichmentPublishHistory
      : [],
  };
  // Partial stale plans must not wipe authoritative fields with undefined.
  Object.keys(authPlan).forEach((key) => {
    if (key === "enrichmentPublishHistory") return;
    if (stalePlan[key] === undefined) merged[key] = authPlan[key];
  });
  return merged;
}

/**
 * @param {object[]} authList
 * @param {object[]} staleList
 * @returns {object[]}
 */
function mergeByIdPreferStale(authList, staleList) {
  const auth = Array.isArray(authList) ? authList : [];
  const stale = Array.isArray(staleList) ? staleList : [];
  const staleById = new Map();
  stale.forEach((item) => {
    if (item && item.id != null) staleById.set(String(item.id), item);
  });
  const seen = new Set();
  const out = [];
  auth.forEach((item) => {
    if (!item || item.id == null) return;
    const id = String(item.id);
    seen.add(id);
    out.push(staleById.has(id) ? staleById.get(id) : item);
  });
  stale.forEach((item) => {
    if (!item || item.id == null) return;
    const id = String(item.id);
    if (seen.has(id)) return;
    out.push(item);
  });
  return out;
}

/**
 * @param {object} authCurriculum
 * @param {object} staleCurriculum
 * @returns {object}
 */
function mergeCurriculumAfterUpdatedAtConflict(authCurriculum, staleCurriculum) {
  const authCur = authCurriculum && typeof authCurriculum === "object" ? authCurriculum : {};
  const staleCur = staleCurriculum && typeof staleCurriculum === "object" ? staleCurriculum : {};
  const authPlans = Array.isArray(authCur.lessonPlans) ? authCur.lessonPlans : [];
  const stalePlans = Array.isArray(staleCur.lessonPlans) ? staleCur.lessonPlans : [];
  const staleById = new Map();
  stalePlans.forEach((plan) => {
    if (plan && plan.id != null) staleById.set(String(plan.id), plan);
  });
  const seen = new Set();
  const mergedPlans = [];
  authPlans.forEach((authPlan) => {
    if (!authPlan || authPlan.id == null) return;
    const id = String(authPlan.id);
    seen.add(id);
    mergedPlans.push(mergeLessonPlanPreferStaleFieldsAuthHistory(authPlan, staleById.get(id)));
  });
  stalePlans.forEach((stalePlan) => {
    if (!stalePlan || stalePlan.id == null) return;
    const id = String(stalePlan.id);
    if (seen.has(id)) return;
    mergedPlans.push(mergeLessonPlanPreferStaleFieldsAuthHistory(null, stalePlan));
  });

  return {
    ...authCur,
    ...staleCur,
    lessonPlans: mergedPlans,
    activities: mergeByIdPreferStale(authCur.activities, staleCur.activities),
    resources: mergeByIdPreferStale(authCur.resources, staleCur.resources),
  };
}

/**
 * @param {object} authoritativeStore
 * @param {object|null|undefined} staleLocalStore
 * @returns {object}
 */
function reconcileStoreAfterUpdatedAtConflict(authoritativeStore, staleLocalStore) {
  const auth = authoritativeStore && typeof authoritativeStore === "object"
    ? authoritativeStore
    : {};
  if (!staleLocalStore || typeof staleLocalStore !== "object") {
    return auth;
  }
  const authSite = auth.siteContent && typeof auth.siteContent === "object" ? auth.siteContent : {};
  const staleSite = staleLocalStore.siteContent && typeof staleLocalStore.siteContent === "object"
    ? staleLocalStore.siteContent
    : {};
  const mergedSiteContent = {
    ...authSite,
    ...staleSite,
    curriculum: mergeCurriculumAfterUpdatedAtConflict(authSite.curriculum, staleSite.curriculum),
  };
  return {
    ...auth,
    ...staleLocalStore,
    foundingMembers: auth.foundingMembers,
    siteContent: mergedSiteContent,
  };
}

module.exports = {
  mergeLessonPlanPreferStaleFieldsAuthHistory,
  mergeByIdPreferStale,
  mergeCurriculumAfterUpdatedAtConflict,
  reconcileStoreAfterUpdatedAtConflict,
};
