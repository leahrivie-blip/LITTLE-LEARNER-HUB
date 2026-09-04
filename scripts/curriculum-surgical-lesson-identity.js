/**
 * Surgical curriculum plan patches must preserve publish identity fields.
 *
 * writeSiteCurriculumTouched keeps dailyPlans by reference and merges only
 * touched enrichment/resource fields. Without this helper, Owner publish could
 * set status/publishedAt on the incoming plan and still leave the stored lesson
 * stuck in draft.
 *
 * Only copies fields that are present on `incomingPlan` (hasOwnProperty), so a
 * later draft/resource surgical write that omits status cannot silently revert
 * a published lesson to draft.
 */
"use strict";

function applySurgicalLessonIdentityFields(base, incomingPlan) {
  if (!base || typeof base !== "object" || Array.isArray(base)) return base;
  if (!incomingPlan || typeof incomingPlan !== "object" || Array.isArray(incomingPlan)) {
    return base;
  }
  const next = { ...base };
  if (Object.prototype.hasOwnProperty.call(incomingPlan, "status")) {
    next.status = incomingPlan.status;
  }
  if (Object.prototype.hasOwnProperty.call(incomingPlan, "publishedAt")) {
    next.publishedAt = incomingPlan.publishedAt;
  }
  if (Object.prototype.hasOwnProperty.call(incomingPlan, "teachingKit")) {
    next.teachingKit = incomingPlan.teachingKit;
  }
  // Owner-only Admin list organization. Not publish status and not an AI field.
  if (Object.prototype.hasOwnProperty.call(incomingPlan, "ownerOrganizationStatus")) {
    const org = String(incomingPlan.ownerOrganizationStatus || "").trim().toLowerCase();
    if (org === "completed") {
      next.ownerOrganizationStatus = "completed";
    } else {
      delete next.ownerOrganizationStatus;
    }
  }
  return next;
}

module.exports = {
  applySurgicalLessonIdentityFields,
};
