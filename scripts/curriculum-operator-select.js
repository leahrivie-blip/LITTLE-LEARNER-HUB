/**
 * AI Curriculum Operator — lesson selection helpers (Phase 1).
 * Uses existing readiness / completeness scorers. Never mutates curriculum.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

function loadEnrichment() {
  try { return require("./teaching-kit-enrichment.js"); } catch (_e) { return null; }
}

function loadQuality() {
  try { return require("./teaching-kit-quality-review.js"); } catch (_e) { return null; }
}

function loadTeacher() {
  try { return require("./teaching-kit-ai-lesson-teacher.js"); } catch (_e) { return null; }
}

function loadDirector() {
  try { return require("./teaching-kit-curriculum-director.js"); } catch (_e) { return null; }
}

function ageBandOf(plan) {
  const director = loadDirector();
  if (director?.ageBand) return director.ageBand(plan?.age);
  return schema.normalizeAgeBand(plan?.age) || "unspecified";
}

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function planMatchesFilters(plan, scope) {
  if (!plan || plan.status === "archived") return false;
  if (scope.plan && String(plan.plan || "") !== scope.plan) return false;
  if (scope.ageBand) {
    const band = ageBandOf(plan);
    if (band !== scope.ageBand) return false;
  }
  return true;
}

function scorePlan(plan, curriculum) {
  const enrichment = loadEnrichment();
  const quality = loadQuality();
  const activities = (curriculum.activities || []).filter((a) => a.lessonPlanId === plan.id);
  const draft = plan.enrichmentDraft || null;
  const flat = enrichment?.flattenLessonActivities
    ? enrichment.flattenLessonActivities(plan, activities)
    : activities;
  const completion = enrichment?.computeCompletionPercent
    ? enrichment.computeCompletionPercent(plan, flat, draft)
    : 0;
  let premium = completion;
  let blocksPublish = false;
  try {
    if (quality?.evaluateTeachingKit) {
      const evaluated = quality.evaluateTeachingKit(plan, flat, draft, {
        resources: curriculum.resources || [],
      });
      premium = Number(evaluated?.premiumReadinessPercent);
      if (!Number.isFinite(premium)) premium = Number(evaluated?.completionPercent) || completion;
      blocksPublish = Boolean(evaluated?.blocksPublish);
    }
  } catch (_e) {
    /* scoring best-effort */
  }
  const hasDraft = Boolean(draft && typeof draft === "object"
    && (Object.keys(draft.week || {}).length || Object.keys(draft.activities || {}).length));
  return {
    id: plan.id,
    title: schema.text(plan.title, 180),
    theme: schema.text(plan.theme, 120),
    age: schema.text(plan.age, 80),
    ageBand: ageBandOf(plan),
    plan: plan.plan === "Pro" ? "Pro" : "Free",
    status: schema.text(plan.status, 40),
    updatedAt: schema.text(plan.updatedAt, 40),
    completionPercent: Math.round(Number(completion) || 0),
    readinessPercent: Math.round(Number(premium) || 0),
    blocksPublish,
    hasEnrichmentDraft: hasDraft,
    activityCount: flat.length,
  };
}

function normalizeTitleKey(value) {
  return schema.text(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function selectLessons(curriculum, command, options = {}) {
  const scope = command.scope || {};
  const plans = schema.asArray(curriculum?.lessonPlans);
  const limit = Math.min(
    Number(scope.count) || command.limits?.maxLessons || 10,
    command.limits?.hardMaxLessons || 20,
  );
  const scored = plans.map((p) => scorePlan(p, curriculum));
  const byId = new Map(scored.map((s) => [s.id, s]));
  let selected = [];
  let selectionNote = "";

  if (scope.selection === "explicit_ids" || scope.lessonIds?.length) {
    selected = scope.lessonIds.map((id) => byId.get(id)).filter(Boolean);
    selectionNote = "Selected by explicit lesson IDs.";
  } else if (scope.selection === "named_titles" || scope.titles?.length) {
    const keys = scope.titles.map(normalizeTitleKey);
    selected = scored.filter((s) => {
      const titleKey = normalizeTitleKey(s.title);
      return keys.some((k) => titleKey === k || titleKey.includes(k) || k.includes(titleKey));
    });
    selectionNote = "Selected by lesson title match.";
    if (!selected.length) {
      return {
        selected: [],
        candidatesConsidered: scored.length,
        selectionNote: "No lessons matched the named titles.",
        unresolvedTitles: scope.titles,
        ambiguous: true,
      };
    }
  } else if (scope.selection === "currently_selected") {
    const id = scope.currentlySelectedLessonId || options.currentlySelectedLessonId;
    const hit = id ? byId.get(id) : null;
    selected = hit ? [hit] : [];
    selectionNote = hit ? "Currently selected lesson." : "No currently selected lesson.";
  } else if (scope.selection === "updated_today" || scope.updatedSince === "today") {
    const start = startOfTodayIso();
    selected = scored
      .filter((s) => planMatchesFilters(plans.find((p) => p.id === s.id), scope))
      .filter((s) => s.updatedAt && s.updatedAt >= start)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, limit);
    selectionNote = "Lessons updated today (by updatedAt).";
  } else if (scope.selection === "missing_teaching_kit") {
    selected = scored
      .filter((s) => planMatchesFilters(plans.find((p) => p.id === s.id), scope))
      .filter((s) => !s.hasEnrichmentDraft || s.readinessPercent < 50 || s.completionPercent < 50)
      .sort((a, b) => a.readinessPercent - b.readinessPercent || a.completionPercent - b.completionPercent)
      .slice(0, limit);
    selectionNote = "Lessons missing or lightly filled Teaching Kit enrichment.";
  } else if (scope.selection === "weak_printables" || scope.selection === "needs_activity_images") {
    // Pre-filter by readiness; detailed printable/image gaps confirmed during audit.
    selected = scored
      .filter((s) => planMatchesFilters(plans.find((p) => p.id === s.id), scope))
      .sort((a, b) => a.readinessPercent - b.readinessPercent)
      .slice(0, Math.max(limit * 2, limit));
    // Narrow with a lightweight teacher analysis when available
    const teacher = loadTeacher();
    const enrichment = loadEnrichment();
    const refined = [];
    for (const row of selected) {
      const plan = plans.find((p) => p.id === row.id);
      if (!plan) continue;
      const acts = (curriculum.activities || []).filter((a) => a.lessonPlanId === plan.id);
      const flat = enrichment?.flattenLessonActivities
        ? enrichment.flattenLessonActivities(plan, acts)
        : acts;
      const analysis = teacher?.analyzeLessonCompleteness
        ? teacher.analyzeLessonCompleteness(plan, flat, plan.enrichmentDraft || null, {
          resources: curriculum.resources || [],
        })
        : null;
      const printables = analysis?.sections?.find((s) => s.id === "printables");
      const images = analysis?.sections?.find((s) => s.id === "images");
      if (scope.selection === "weak_printables") {
        if (!printables || printables.status !== "complete") refined.push(row);
      } else if (!images || images.status !== "complete") {
        refined.push(row);
      }
      if (refined.length >= limit) break;
    }
    selected = refined.slice(0, limit);
    selectionNote = scope.selection === "weak_printables"
      ? "Lessons with incomplete/weak printable coverage."
      : "Lessons that likely need activity pictures.";
  } else if (scope.selection === "lowest_readiness") {
    selected = scored
      .filter((s) => planMatchesFilters(plans.find((p) => p.id === s.id), scope))
      .sort((a, b) => a.readinessPercent - b.readinessPercent
        || a.completionPercent - b.completionPercent
        || a.title.localeCompare(b.title))
      .slice(0, limit);
    selectionNote = "Lowest Teaching Kit readiness / completion first.";
  } else {
    selected = scored
      .filter((s) => planMatchesFilters(plans.find((p) => p.id === s.id), scope))
      .sort((a, b) => a.readinessPercent - b.readinessPercent)
      .slice(0, limit);
    selectionNote = "Filtered catalog slice.";
  }

  return {
    selected: selected.slice(0, limit),
    candidatesConsidered: scored.length,
    selectionNote,
    unresolvedTitles: [],
    ambiguous: false,
  };
}

module.exports = {
  selectLessons,
  scorePlan,
  ageBandOf,
  startOfTodayIso,
  normalizeTitleKey,
};
