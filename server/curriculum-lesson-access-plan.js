/**
 * Owner Admin — surgical Free/Pro access-plan updates for curriculum lesson plans.
 *
 * Updates ONLY the canonical `plan` field ("Free" | "Pro") used by the Owner
 * Admin Free/Pro filter and customer-facing plan badges / linked-resource gating.
 * Never mutates status, dailyPlans, enrichment, teachingKit, covers, or IDs.
 */
"use strict";

/** @typedef {"Free" | "Pro"} CurriculumAccessPlan */

const ALLOWED_ACCESS_PLANS = Object.freeze(/** @type {const} */ (["Free", "Pro"]));

/**
 * @param {unknown} value
 * @returns {CurriculumAccessPlan | null}
 */
function normalizeAccessPlan(value) {
  const raw = String(value == null ? "" : value).trim();
  if (raw === "Free" || raw === "Pro") return raw;
  return null;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function sanitizeLessonPlanIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    const id = String(raw == null ? "" : raw).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Apply an access-plan change to selected lesson plans without rewriting content.
 *
 * @param {object[]} lessonPlans
 * @param {string[]} lessonPlanIds
 * @param {CurriculumAccessPlan} accessPlan
 * @param {string} nowIso
 * @returns {{
 *   nextLessonPlans: object[],
 *   updated: Array<{ id: string, title: string, plan: CurriculumAccessPlan, previousPlan: string }>,
 *   failed: Array<{ id: string, title: string, error: string }>,
 *   unchangedIds: string[],
 * }}
 */
function applyAccessPlanToLessonPlans(lessonPlans, lessonPlanIds, accessPlan, nowIso) {
  const plans = Array.isArray(lessonPlans) ? lessonPlans : [];
  const ids = sanitizeLessonPlanIds(lessonPlanIds);
  const planById = new Map(plans.filter((p) => p && p.id).map((p) => [String(p.id), p]));
  /** @type {Array<{ id: string, title: string, plan: CurriculumAccessPlan, previousPlan: string }>} */
  const updated = [];
  /** @type {Array<{ id: string, title: string, error: string }>} */
  const failed = [];
  /** @type {string[]} */
  const unchangedIds = [];
  const touch = new Map();

  for (const id of ids) {
    const existing = planById.get(id);
    if (!existing) {
      failed.push({ id, title: "", error: "Lesson plan not found." });
      continue;
    }
    const previousPlan = existing.plan === "Pro" ? "Pro" : "Free";
    const title = String(existing.title || "Untitled Lesson Plan");
    if (previousPlan === accessPlan) {
      unchangedIds.push(id);
      updated.push({ id, title, plan: accessPlan, previousPlan });
      continue;
    }
    touch.set(id, {
      ...existing,
      plan: accessPlan,
      updatedAt: String(nowIso || new Date().toISOString()),
    });
    updated.push({ id, title, plan: accessPlan, previousPlan });
  }

  const nextLessonPlans = plans.map((plan) => {
    if (!plan?.id) return plan;
    return touch.get(String(plan.id)) || plan;
  });

  return { nextLessonPlans, updated, failed, unchangedIds };
}

/**
 * Build a confirm-preview payload (no mutation).
 * @param {object[]} lessonPlans
 * @param {string[]} lessonPlanIds
 * @param {CurriculumAccessPlan} accessPlan
 */
function previewAccessPlanChange(lessonPlans, lessonPlanIds, accessPlan) {
  const plans = Array.isArray(lessonPlans) ? lessonPlans : [];
  const ids = sanitizeLessonPlanIds(lessonPlanIds);
  const planById = new Map(plans.filter((p) => p && p.id).map((p) => [String(p.id), p]));
  const selected = [];
  const missingIds = [];
  for (const id of ids) {
    const existing = planById.get(id);
    if (!existing) {
      missingIds.push(id);
      continue;
    }
    selected.push({
      id,
      title: String(existing.title || "Untitled Lesson Plan"),
      currentPlan: existing.plan === "Pro" ? "Pro" : "Free",
    });
  }
  return {
    plan: accessPlan,
    selectedCount: selected.length,
    titles: selected.map((item) => item.title),
    lessons: selected,
    missingIds,
  };
}

module.exports = {
  ALLOWED_ACCESS_PLANS,
  normalizeAccessPlan,
  sanitizeLessonPlanIds,
  applyAccessPlanToLessonPlans,
  previewAccessPlanChange,
};
