/**
 * Teaching Kit Upgrade Workspace — dashboard triage + one-at-a-time helpers.
 * Pure helpers shared by admin UI and tests. Never enables flags.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitUpgradeWorkspace = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function toolkitFromPlan(plan) {
    const toolkit = plan?.teachingKit?.teacherToolkit;
    if (!toolkit || typeof toolkit !== "object") return null;
    return toolkit;
  }

  function missingTeacherToolkit(plan, enrichmentDraft) {
    const week = enrichmentDraft?.week && typeof enrichmentDraft.week === "object"
      ? enrichmentDraft.week
      : {};
    const draftToolkit = week.teacherToolkit && typeof week.teacherToolkit === "object"
      ? week.teacherToolkit
      : null;
    const published = toolkitFromPlan(plan) || {};
    const prep = asArray(draftToolkit?.prepChecklist).length || asArray(published.prepChecklist).length;
    const focus = asArray(draftToolkit?.observationFocus).length || asArray(published.observationFocus).length;
    const notes = text(draftToolkit?.notes) || text(published.notes);
    const preparation = text(draftToolkit?.teacherPreparation)
      || text(week.teacherPreparation)
      || text(published.teacherPreparation);
    return !(prep || focus || notes || preparation);
  }

  /**
   * AI Ready = lesson has enough base content for a useful Upgrade pass
   * (title + age + at least one activity or weekly overview).
   */
  function isAiReady(plan, activities) {
    if (!plan || !text(plan.id) || !text(plan.title)) return false;
    const acts = asArray(activities);
    const hasActs = acts.length > 0
      || ["monday", "tuesday", "wednesday", "thursday", "friday"].some((day) => (
        asArray(plan.dailyPlans?.[day]?.items).some((item) => text(item?.title))
      ));
    return hasActs || Boolean(text(plan.weeklyOverview));
  }

  function enrichSummaryForWorkspace(summary, plan, enrichmentDraft) {
    const base = summary && typeof summary === "object" ? { ...summary } : {};
    base.missingTeacherToolkit = missingTeacherToolkit(plan, enrichmentDraft || plan?.enrichmentDraft);
    base.aiReady = isAiReady(plan, null) || Boolean(base.activityCount > 0);
    if (plan) {
      base.aiReady = isAiReady(plan, null) || Number(base.activityCount || 0) > 0
        || Boolean(text(plan.weeklyOverview));
    }
    return base;
  }

  function gapChipsFromSummary(summary) {
    const bits = [];
    if (!summary) return bits;
    if (summary.incompleteActivities) bits.push(`${summary.incompleteActivities} incomplete`);
    if (summary.missingSongs) bits.push("songs");
    if (summary.missingBooks) bits.push("books");
    if (summary.missingPrintables) bits.push("printables");
    if (summary.missingExamples || summary.missingPhotos) bits.push("examples");
    if (summary.missingTeacherToolkit) bits.push("toolkit");
    if (summary.missingObservations || summary.missingObservationPrompts > 0) bits.push("observations");
    if (summary.missingFamilyConnection) bits.push("family");
    if (summary.aiReady === false) bits.push("not AI-ready");
    return bits;
  }

  /**
   * Sort plans for one-at-a-time upgrade: most incomplete first, then oldest edit.
   */
  function sortForUpgradeQueue(plans, metaFor) {
    return asArray(plans).slice().sort((a, b) => {
      const ma = metaFor(a) || {};
      const mb = metaFor(b) || {};
      const pa = Number(ma.percent ?? ma.summary?.completionPercent ?? 0);
      const pb = Number(mb.percent ?? mb.summary?.completionPercent ?? 0);
      if (pa !== pb) return pa - pb;
      const ta = Date.parse(ma.summary?.lastEditedDate || a.updatedAt || "") || 0;
      const tb = Date.parse(mb.summary?.lastEditedDate || b.updatedAt || "") || 0;
      return ta - tb;
    });
  }

  function nextLessonInQueue(plans, currentId, metaFor) {
    const queue = sortForUpgradeQueue(plans, metaFor);
    if (!queue.length) return null;
    const idx = queue.findIndex((plan) => plan.id === currentId);
    if (idx < 0) return queue[0];
    return queue[idx + 1] || null;
  }

  function workspaceCopy() {
    return {
      eyebrow: "Upgrade Workspace",
      title: "Upgrade lessons into Teaching Kits",
      blurb: "Open one lesson → Upgrade with AI → Review → Edit → Publish → Move to the next. Nothing publishes automatically.",
      oneAtATime: "One lesson at a time — no bulk auto-upgrade.",
    };
  }

  return {
    missingTeacherToolkit,
    isAiReady,
    enrichSummaryForWorkspace,
    gapChipsFromSummary,
    sortForUpgradeQueue,
    nextLessonInQueue,
    workspaceCopy,
  };
});
