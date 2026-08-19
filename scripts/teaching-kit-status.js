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
    "Draft Started",
    "AI Draft Ready",
    "In Review",
    "Needs Changes",
    "Ready for Owner Review",
    "Publish Ready",
    "Published",
    "Archived",
    // Back-compat aliases used by older UI
    "In Progress",
    "Needs Review",
    "Ready",
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
   * A weekday counts when it has at least one titled activity — no per-day minimum of 3–4.
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
      label: `${days.length} of 5 weekdays represented`,
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
    premiumReadinessPercent = null,
    hasEnrichmentDraft = false,
    coverageComplete = false,
    needsReview = false,
    publishReadiness = "",
    hasAiProposal = false,
    qualityBlocked = false,
    blocking = "",
  } = {}) {
    const cms = text(lessonStatus).toLowerCase() || "draft";
    if (cms === "archived") return "Archived";

    const fill = clampPercent(enrichmentFillPercent);
    const premium = premiumReadinessPercent == null
      ? fill
      : clampPercent(premiumReadinessPercent);
    const readiness = text(publishReadiness).toLowerCase();
    const blocked = Boolean(qualityBlocked)
      || readiness === "blocked"
      || /^blocked$/i.test(text(blocking));

    // Hard rule: Publish Ready / Ready for Owner can never appear while blocked.
    if (blocked) {
      return "Needs Changes";
    }

    // "Published" describes CMS published state — not Teaching Kit draft completeness.
    if (["published", "featured"].includes(cms) && !hasEnrichmentDraft && readiness === "ready" && premium >= 90 && coverageComplete) {
      return "Published";
    }
    if (readiness === "ready" && premium >= 90 && coverageComplete && !hasEnrichmentDraft) {
      return "Publish Ready";
    }
    if (readiness === "ready" && hasEnrichmentDraft && premium >= 90 && coverageComplete) {
      return "Ready for Owner Review";
    }
    if (needsReview && premium < 70) {
      return "Needs Changes";
    }
    if (hasAiProposal) return "AI Draft Ready";
    if (
      needsReview
      || readiness === "needs_review"
      || (fill >= 50 && !coverageComplete)
      || (hasEnrichmentDraft && fill >= 25)
    ) {
      return "In Review";
    }
    if (fill > 0 || hasEnrichmentDraft) return "Draft Started";
    return "Legacy";
  }

  /**
   * Single publish-eligibility + stepper UI model.
   * Editor stepper / badges / Publish controls must all use this so "Publish Ready"
   * never appears as an active or implied state while blocked.
   */
  function buildPublishReadinessUi({
    workflow = "",
    blocking = "",
    blocksPublish = false,
    publishReadiness = "",
    hasDraftOnlyPrintables = false,
    hasRejectedPrintables = false,
    missingPrintables = false,
    incompleteActivities = 0,
    enrichmentFillPercent = 0,
    printableApprovalStatuses = null,
  } = {}) {
    const approvals = Array.isArray(printableApprovalStatuses) ? printableApprovalStatuses : [];
    const awaitingPrintableReview = Boolean(hasDraftOnlyPrintables)
      || approvals.some((status) => /^(pending|awaiting|awaiting_review)$/i.test(String(status || "")));
    const rejectedPrintable = Boolean(hasRejectedPrintables)
      || approvals.some((status) => /^(revision_requested|rejected|needs_replacement)$/i.test(String(status || "")));
    const incomplete = Number(incompleteActivities) > 0
      || Number(enrichmentFillPercent) < 50;
    const blocked = Boolean(blocksPublish)
      || /^blocked$/i.test(String(blocking || ""))
      || /^blocked$/i.test(String(publishReadiness || ""))
      || awaitingPrintableReview
      || rejectedPrintable
      || Boolean(missingPrintables);

    const published = /^published$/i.test(String(workflow || ""));
    let publishReady = !blocked
      && !published
      && /^(Publish Ready|Ready for Owner Review)$/i.test(String(workflow || ""));

    let displayWorkflow = String(workflow || "Legacy").trim() || "Legacy";
    if (published) {
      displayWorkflow = "Published";
      publishReady = false;
    } else if (blocked) {
      displayWorkflow = "Needs Changes";
      publishReady = false;
    } else if (publishReady) {
      displayWorkflow = /^Ready for Owner Review$/i.test(String(workflow || ""))
        ? "Ready for Owner Review"
        : "Publish Ready";
    }

    // Third stepper label: never say "Publish Ready" unless actually eligible.
    // When published, chrome's third slot becomes "Published" (summary keeps a 4th step).
    let readinessStepLabel = "Not Ready";
    let readinessStepKind = "not_ready";
    if (published) {
      readinessStepLabel = "Published";
      readinessStepKind = "published";
    } else if (publishReady) {
      readinessStepLabel = "Publish Ready";
      readinessStepKind = "publish_ready";
    } else if (awaitingPrintableReview || rejectedPrintable) {
      readinessStepLabel = "Needs Changes";
      readinessStepKind = "needs_changes";
    } else if (blocked && incomplete) {
      readinessStepLabel = "Incomplete";
      readinessStepKind = "incomplete";
    } else if (blocked) {
      readinessStepLabel = "Needs Changes";
      readinessStepKind = "needs_changes";
    }

    const activeId = published
      ? "published"
      : (publishReady || blocked || readinessStepKind === "needs_changes" || readinessStepKind === "incomplete"
        ? "readiness"
        : (Number(enrichmentFillPercent) < 25 && /^Legacy$/i.test(displayWorkflow) ? "legacy" : "in_review"));

    function classFor(id, { done = false, blockedActive = false } = {}) {
      if (activeId === id) {
        return blockedActive ? "is-active is-blocked" : "is-active";
      }
      return done ? "is-done" : "";
    }

    const readinessBlockedActive = activeId === "readiness"
      && (readinessStepKind === "needs_changes" || readinessStepKind === "incomplete" || readinessStepKind === "not_ready");

    const steps = [
      {
        id: "legacy",
        label: "Legacy",
        className: classFor("legacy", { done: activeId !== "legacy" }),
      },
      {
        id: "in_review",
        label: "In Review",
        className: classFor("in_review", {
          done: publishReady || published || activeId === "readiness",
        }),
      },
      {
        id: "readiness",
        // Summary keeps "Publish Ready" as the completed gate before Published.
        label: published ? "Publish Ready" : readinessStepLabel,
        kind: published ? "publish_ready" : readinessStepKind,
        className: classFor("readiness", {
          done: published,
          blockedActive: readinessBlockedActive,
        }),
      },
      {
        id: "published",
        label: "Published",
        className: classFor("published"),
      },
    ];

    // Chrome is 3 slots; when published, the final slot must say Published (not Publish Ready).
    const chromeSteps = published
      ? [
        { id: "legacy", label: "Legacy", className: "is-done" },
        { id: "in_review", label: "In Review", className: "is-done" },
        {
          id: "readiness",
          label: "Published",
          kind: "published",
          className: "is-active",
        },
      ]
      : steps.slice(0, 3);

    return {
      blocked,
      publishReady,
      published,
      canPublish: publishReady === true,
      displayWorkflow,
      libraryStatus: blocked ? "Blocked" : (String(blocking || "").trim() || "No blockers"),
      awaitingPrintableReview,
      rejectedPrintable,
      readinessStepLabel,
      readinessStepKind,
      steps,
      chromeSteps,
      summarySteps: steps,
      renderStepperHtml(stepList) {
        return (stepList || steps).map((step) => {
          const readyAttr = step.id === "readiness"
            ? ` data-publish-ready-step data-readiness-kind="${String(step.kind || "")}"`
            : "";
          return `<span class="${String(step.className || "").trim()}"${readyAttr}>${String(step.label || "")}</span>`;
        }).join("");
      },
    };
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
    const premiumReadinessPercent = clampPercent(
      summary.premiumReadinessPercent != null
        ? summary.premiumReadinessPercent
        : (qualityReport?.premiumReadinessPercent != null
          ? qualityReport.premiumReadinessPercent
          : enrichmentFillPercent),
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
    const qualityBlocked = blocking === "Blocked"
      || Boolean(qualityReport?.blocksPublish)
      || text(qualityReport?.publishReadiness).toLowerCase() === "blocked";
    const publishReadiness = qualityBlocked
      ? "blocked"
      : (qualityReport?.publishReadiness || summary.publishReadiness || "");
    const workflow = workflowStatusFromParts({
      lessonStatus: summary.lessonStatus || plan?.status,
      enrichmentFillPercent,
      premiumReadinessPercent,
      hasEnrichmentDraft: Boolean(summary.hasEnrichmentDraft),
      coverageComplete: coverage.coverageComplete,
      needsReview: Boolean(summary.needsReview) || blocking !== "No blockers",
      publishReadiness,
      hasAiProposal: Boolean(summary.hasAiProposal),
      qualityBlocked,
      blocking,
    });
    // Final consistency: never surface Publish Ready while library reports Blocked.
    const safeWorkflow = (qualityBlocked && /publish\s*ready|ready for owner/i.test(workflow))
      ? "Needs Changes"
      : workflow;

    const publishUi = buildPublishReadinessUi({
      workflow: safeWorkflow,
      blocking,
      blocksPublish: qualityBlocked,
      publishReadiness,
      hasDraftOnlyPrintables: Boolean(summary.hasDraftOnlyPrintables),
      hasRejectedPrintables: Boolean(summary.hasRejectedPrintables),
      missingPrintables: Boolean(summary.missingPrintables),
      incompleteActivities: Number(
        summary.incompleteActivitiesForPublish != null
          ? summary.incompleteActivitiesForPublish
          : summary.incompleteActivities,
      ) || 0,
      enrichmentFillPercent,
      printableApprovalStatuses: Array.isArray(summary.printableApprovalStatuses)
        ? summary.printableApprovalStatuses
        : null,
    });

    return {
      content: {
        enrichmentFillPercent,
        contentCompletionPercent,
        premiumReadinessPercent,
        weekdayCoverage: coverage,
        label: coverage.coverageComplete
          ? `${enrichmentFillPercent}% structural · ${premiumReadinessPercent}% premium readiness · ${coverage.label}`
          : `${coverage.label} · ${enrichmentFillPercent}% structural · ${premiumReadinessPercent}% premium`,
      },
      quality: {
        score: qualityScore,
        label: qualityLabel,
      },
      readiness: summary.readinessScores || null,
      workflow: publishUi.displayWorkflow || safeWorkflow,
      blocking,
      libraryStatus: publishUi.libraryStatus || blocking,
      blocksPublish: qualityBlocked,
      blockingIssues: asArray(qualityReport?.blockingIssues),
      publishReadiness,
      publishReady: publishUi.publishReady === true,
      canPublish: publishUi.canPublish === true,
      publishUi,
      primaryStatus: publishUi.displayWorkflow || safeWorkflow,
      // Back-compat aliases for older UI
      dashboardStage: publishUi.published ? "Published"
        : (publishUi.publishReady ? "Ready"
          : (safeWorkflow === "Draft Started" ? "In Progress"
            : (safeWorkflow === "In Review" || safeWorkflow === "Needs Changes" || safeWorkflow === "AI Draft Ready" || publishUi.blocked ? "Needs Review" : safeWorkflow))),
      completionPercent: contentCompletionPercent,
      enrichmentFillPercent,
      premiumReadinessPercent,
    };
  }

  return {
    WEEKDAYS,
    WORKFLOW_STATUSES,
    BLOCKING_STATES,
    measureWeekdayCoverage,
    blockingStateFromReport,
    workflowStatusFromParts,
    buildPublishReadinessUi,
    buildLessonStatus,
    clampPercent,
  };
});
