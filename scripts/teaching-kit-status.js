/**
 * Canonical Teaching Kit / curriculum status model (Phase 7).
 * Separates content completion, educational quality, workflow status, and blocking.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LLHTeachingKitStatus = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const WORKFLOW_STATUSES = Object.freeze([
    "Legacy",
    "In Progress",
    "Needs Review",
    "Ready",
    "Published",
    "Archived",
  ]);
  const BLOCKING_STATES = Object.freeze(["No blockers", "Warnings", "Blocked"]);

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function clampPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function normalizeWeekday(value) {
    const raw = text(value).toLowerCase();
    if (WEEKDAYS.includes(raw)) return raw;
    const map = {
      mon: "monday",
      tue: "tuesday",
      tues: "tuesday",
      wed: "wednesday",
      thu: "thursday",
      thur: "thursday",
      thurs: "thursday",
      fri: "friday",
    };
    return map[raw] || "";
  }

  /**
   * Content completion: required field / weekday presence (not educational quality).
   */
  function measureWeekdayCoverage(plan, activities) {
    const filled = new Set();
    WEEKDAYS.forEach((day) => {
      const bucket = plan?.dailyPlans?.[day];
      const items = Array.isArray(bucket?.items) ? bucket.items : (Array.isArray(bucket) ? bucket : []);
      if (items.some((item) => text(item?.title || item?.name))) filled.add(day);
    });
    asArray(activities).forEach((act) => {
      const day = normalizeWeekday(act?.dayOfWeek || act?.day);
      if (day) filled.add(day);
    });
    const days = WEEKDAYS.filter((day) => filled.has(day));
    return {
      filled: days.length,
      total: 5,
      days,
      missingDays: WEEKDAYS.filter((day) => !filled.has(day)),
      coverageComplete: days.length === 5,
      label: `${days.length} of 5 weekdays complete`,
      percent: clampPercent((days.length / 5) * 100),
    };
  }

  function blockingStateFromReport(report) {
    if (!report || typeof report !== "object") return "No blockers";
    if (report.blocksPublish) return "Blocked";
    const warnings = asArray(report.warnings).length
      || asArray(report.findings).filter((f) => f && f.status !== "ignored" && /medium|high|low/i.test(String(f.severity || ""))).length;
    if (warnings > 0 || report.publishReadiness === "needs_review") return "Warnings";
    return "No blockers";
  }

  /**
   * Primary workflow status — one value only.
   * Ready/Published require full weekday coverage (never Ready at Monday-only).
   */
  function workflowStatusFromParts({
    lessonStatus = "",
    enrichmentFillPercent = 0,
    hasEnrichmentDraft = false,
    coverageComplete = false,
    needsReview = false,
    publishReadiness = "",
  } = {}) {
    const cms = text(lessonStatus).toLowerCase() || "draft";
    if (cms === "archived") return "Archived";

    const fill = clampPercent(enrichmentFillPercent);
    const readiness = text(publishReadiness).toLowerCase();

    if (["published", "featured"].includes(cms) && !hasEnrichmentDraft && fill >= 90 && coverageComplete) {
      return "Published";
    }
    if (readiness === "blocked") return "Needs Review";
    if (fill >= 90 && !hasEnrichmentDraft && coverageComplete && readiness !== "needs_review") {
      return "Ready";
    }
    // High fill without full weekday coverage, explicit review flags, or a substantial draft → Needs Review.
    if (
      needsReview
      || readiness === "needs_review"
      || (fill >= 90 && !coverageComplete)
      || (hasEnrichmentDraft && fill >= 25)
    ) {
      return "Needs Review";
    }
    if (fill > 0 || hasEnrichmentDraft) return "In Progress";
    return "Legacy";
  }

  /**
   * Compose the canonical status object used by dashboard, cards, editor, and publish dialog.
   */
  function buildLessonStatus({
    plan = null,
    activities = [],
    enrichmentDraft = null,
    upgradeSummary = null,
    qualityReport = null,
  } = {}) {
    const summary = upgradeSummary && typeof upgradeSummary === "object" ? upgradeSummary : {};
    const coverage = measureWeekdayCoverage(plan, activities);
    const enrichmentFillPercent = clampPercent(
      summary.completionPercent != null
        ? summary.completionPercent
        : 0,
    );
    // Never present enrichment fill as "100% complete" when weekdays are missing.
    const contentCompletionPercent = coverage.coverageComplete
      ? enrichmentFillPercent
      : Math.min(enrichmentFillPercent, clampPercent((coverage.filled / 5) * 100 + (enrichmentFillPercent * 0.15)));

    const qualityScore = qualityReport && Number.isFinite(Number(qualityReport.overallScore))
      ? clampPercent(qualityReport.overallScore)
      : null;
    const qualityLabel = qualityReport
      ? (text(qualityReport.overallLabel) || "Not reviewed")
      : "Not reviewed";

    const blocking = blockingStateFromReport(qualityReport);
    const workflow = workflowStatusFromParts({
      lessonStatus: summary.lessonStatus || plan?.status,
      enrichmentFillPercent,
      hasEnrichmentDraft: Boolean(summary.hasEnrichmentDraft),
      coverageComplete: coverage.coverageComplete,
      needsReview: Boolean(summary.needsReview) || blocking !== "No blockers",
      publishReadiness: qualityReport?.publishReadiness,
    });

    return {
      content: {
        enrichmentFillPercent,
        contentCompletionPercent,
        weekdayCoverage: coverage,
        label: coverage.coverageComplete
          ? `${enrichmentFillPercent}% enrichment fill · ${coverage.label}`
          : `${coverage.label} · ${enrichmentFillPercent}% enrichment fill`,
      },
      quality: {
        score: qualityScore,
        label: qualityLabel,
      },
      workflow,
      blocking,
      primaryStatus: workflow,
      // Back-compat aliases for older UI
      dashboardStage: workflow === "Published" ? "Published" : workflow,
      completionPercent: contentCompletionPercent,
      enrichmentFillPercent,
    };
  }

  return {
    WEEKDAYS,
    WORKFLOW_STATUSES,
    BLOCKING_STATES,
    measureWeekdayCoverage,
    blockingStateFromReport,
    workflowStatusFromParts,
    buildLessonStatus,
    clampPercent,
  };
});
