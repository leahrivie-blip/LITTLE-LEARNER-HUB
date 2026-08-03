/**
 * Teaching Kit Enrichment — pure helpers (completion %, activity status, draft merge).
 * Shared by admin editor (browser) and server/tests (require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitEnrichment = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const ACTIVITY_STATUS = Object.freeze({
    not_started: "not_started",
    in_progress: "in_progress",
    complete: "complete",
  });

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function flattenLessonActivities(plan, activities) {
    const planId = text(plan && plan.id);
    const fromStore = asArray(activities).filter((a) => a && a.lessonPlanId === planId && a.status !== "archived");
    if (fromStore.length) {
      return fromStore
        .slice()
        .sort((a, b) => {
          const da = WEEKDAYS.indexOf(String(a.dayOfWeek || "").toLowerCase());
          const db = WEEKDAYS.indexOf(String(b.dayOfWeek || "").toLowerCase());
          if (da !== db) return (da < 0 ? 99 : da) - (db < 0 ? 99 : db);
          return text(a.title).localeCompare(text(b.title));
        });
    }
    const out = [];
    WEEKDAYS.forEach((day) => {
      const items = asArray(plan?.dailyPlans?.[day]?.items);
      items.forEach((item, index) => {
        if (!text(item?.title)) return;
        out.push({
          id: text(item.activityId) || text(item.sourceKey) || `${planId}:${day}:${item.itemId || index}`,
          itemId: text(item.itemId) || `${day}-${index}`,
          lessonPlanId: planId,
          dayOfWeek: day,
          title: text(item.title),
          activityCategory: text(item.activityCategory),
          setupImageUrl: text(item.setupImageUrl),
          exampleImageUrl: text(item.exampleImageUrl || item.examplePhotoUrl),
          teacherTips: asArray(item.teacherTips).map(text).filter(Boolean),
          substitutions: asArray(item.substitutions),
          settingTags: asArray(item.settingTags).map(text).filter(Boolean),
          observationOpportunities: text(item.observationOpportunities),
          materials: text(item.materials),
        });
      });
    });
    return out;
  }

  function activityEnrichmentView(activity, draftActivity) {
    const d = draftActivity && typeof draftActivity === "object" ? draftActivity : {};
    const tips = asArray(d.teacherTips).length
      ? asArray(d.teacherTips).map(text).filter(Boolean)
      : asArray(activity?.teacherTips).map(text).filter(Boolean);
    const substitutions = asArray(d.substitutions).length
      ? asArray(d.substitutions)
      : asArray(activity?.substitutions);
    const settingTags = asArray(d.settingTags).length
      ? asArray(d.settingTags).map(text).filter(Boolean)
      : asArray(activity?.settingTags).map(text).filter(Boolean);
    return {
      setupImageUrl: text(d.setupImageUrl) || text(activity?.setupImageUrl || activity?.setupPhotoUrl),
      exampleImageUrl: text(d.exampleImageUrl) || text(activity?.exampleImageUrl || activity?.examplePhotoUrl),
      teacherTips: tips,
      substitutions,
      settingTags,
      observationPrompts: asArray(d.observationPrompts).length
        ? asArray(d.observationPrompts).map(text).filter(Boolean)
        : (text(activity?.observationOpportunities)
          ? text(activity.observationOpportunities).split(/\n+/).map(text).filter(Boolean)
          : []),
    };
  }

  function activityStatus(activity, draftActivity) {
    const view = activityEnrichmentView(activity, draftActivity);
    const hasSetup = Boolean(view.setupImageUrl);
    const hasExample = Boolean(view.exampleImageUrl);
    const hasTip = view.teacherTips.length > 0;
    const hasExtra = view.substitutions.length > 0
      || view.settingTags.length > 0
      || view.observationPrompts.length > 0;
    if (hasSetup && hasExample && hasTip) return ACTIVITY_STATUS.complete;
    if (hasSetup || hasExample || hasTip || hasExtra) return ACTIVITY_STATUS.in_progress;
    return ACTIVITY_STATUS.not_started;
  }

  function activityStatusLabel(status) {
    if (status === ACTIVITY_STATUS.complete) return "Complete";
    if (status === ACTIVITY_STATUS.in_progress) return "In Progress";
    return "Not Started";
  }

  function firstIncompleteActivityIndex(activities, draftActivities) {
    const draft = draftActivities && typeof draftActivities === "object" ? draftActivities : {};
    for (let i = 0; i < activities.length; i += 1) {
      const key = text(activities[i].id) || text(activities[i].itemId);
      if (activityStatus(activities[i], draft[key]) !== ACTIVITY_STATUS.complete) return i;
    }
    return 0;
  }

  function clampPercent(value) {
    const n = Math.round(Number(value) || 0);
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
  }

  /**
   * Weighted completion % from quality checklist (guidance; never blocks draft save).
   */
  function computeCompletionPercent(plan, activities, enrichmentDraft) {
    const draft = enrichmentDraft && typeof enrichmentDraft === "object" ? enrichmentDraft : {};
    const draftActs = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
    const week = draft.week && typeof draft.week === "object" ? draft.week : {};
    const list = flattenLessonActivities(plan, activities);

    let photoScore = 0;
    let tipScore = 0;
    let optionScore = 0;
    if (list.length) {
      let photoUnits = 0;
      let tipUnits = 0;
      let optionUnits = 0;
      list.forEach((act) => {
        const key = text(act.id) || text(act.itemId);
        const view = activityEnrichmentView(act, draftActs[key]);
        photoUnits += (view.setupImageUrl ? 0.5 : 0) + (view.exampleImageUrl ? 0.5 : 0);
        tipUnits += view.teacherTips.length ? 1 : 0;
        optionUnits += (view.substitutions.length || view.settingTags.length) ? 1 : 0;
      });
      photoScore = photoUnits / list.length;
      tipScore = tipUnits / list.length;
      optionScore = optionUnits / list.length;
    }

    const hasCover = Boolean(text(plan?.coverImageUrl));
    const hasOverview = Boolean(text(plan?.weeklyOverview));
    const weekStory = ((hasCover ? 0.5 : 0) + (hasOverview ? 0.5 : 0));
    const booksSongs = Math.min(1, (asArray(plan?.books).length ? 0.5 : 0) + (asArray(plan?.songs).length ? 0.5 : 0));
    const familyObs = Math.min(1, (text(plan?.familyConnection) || text(week.familyConnection) ? 0.5 : 0)
      + (text(plan?.observationOpportunities) ? 0.5 : 0));
    const printables = asArray(plan?.resourceIds).length || asArray(week.printableIds).length ? 1 : 0;

    const percent = (
      weekStory * 15
      + booksSongs * 10
      + familyObs * 10
      + photoScore * 30
      + tipScore * 15
      + printables * 10
      + optionScore * 10
    );
    return clampPercent(percent);
  }

  function completenessLabelFromPercent(percent, explicit) {
    const forced = text(explicit);
    if (forced === "complete" || forced === "enriched" || forced === "legacy_mapped") {
      if (forced === "legacy_mapped") return "Legacy";
      if (forced === "enriched") return "Enriched";
      return "Complete";
    }
    const p = clampPercent(percent);
    if (p >= 90) return "Complete";
    if (p >= 50) return "Enriched";
    return "Legacy";
  }

  function buildJumpIndex(plan, activities, enrichmentDraft) {
    const list = flattenLessonActivities(plan, activities);
    const hits = [];
    list.forEach((act, index) => {
      hits.push({
        type: "activity",
        id: text(act.id) || text(act.itemId),
        label: text(act.title) || "Activity",
        meta: text(act.dayOfWeek),
        index,
      });
    });
    asArray(plan?.books).forEach((book, i) => {
      const title = text(book?.title || book);
      if (title) hits.push({ type: "book", id: `book-${i}`, label: title, meta: "Book" });
    });
    asArray(plan?.songs).forEach((song, i) => {
      const title = text(song?.title || song);
      if (title) hits.push({ type: "song", id: `song-${i}`, label: title, meta: "Song" });
    });
    text(plan?.vocabularyWords).split(/[,;\n]+/).map(text).filter(Boolean).forEach((word, i) => {
      hits.push({ type: "vocabulary", id: `vocab-${i}`, label: word, meta: "Vocabulary" });
    });
    asArray(plan?.resourceIds).forEach((id, i) => {
      hits.push({ type: "printable", id: text(id) || `res-${i}`, label: text(id) || "Printable", meta: "Printable" });
    });
    [
      ["family", "Family connection"],
      ["milestones", "Milestones"],
      ["materials", "Materials"],
      ["printables", "Printables"],
    ].forEach(([id, label]) => {
      hits.push({ type: "section", id, label, meta: "Week section" });
    });
    void enrichmentDraft;
    return hits;
  }

  function searchJumpIndex(hits, query) {
    const q = text(query).toLowerCase();
    if (!q) return asArray(hits).slice(0, 12);
    return asArray(hits).filter((hit) => (
      `${hit.label} ${hit.meta} ${hit.type}`.toLowerCase().includes(q)
    )).slice(0, 20);
  }

  function mergeDraftIntoPlan(plan, activities, enrichmentDraft) {
    const draft = enrichmentDraft && typeof enrichmentDraft === "object" ? enrichmentDraft : null;
    if (!draft) {
      return { plan: plan || {}, activities: asArray(activities) };
    }
    const draftActs = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
    const baseActivities = flattenLessonActivities(plan, activities);
    const nextActivities = baseActivities.map((act) => {
      const key = text(act.id) || text(act.itemId);
      const patch = draftActs[key] || draftActs[text(act.itemId)];
      if (!patch) return act;
      const view = activityEnrichmentView(act, patch);
      return {
        ...act,
        setupImageUrl: view.setupImageUrl,
        exampleImageUrl: view.exampleImageUrl,
        teacherTips: view.teacherTips,
        substitutions: view.substitutions,
        settingTags: view.settingTags,
        observationOpportunities: view.observationPrompts.join("\n") || act.observationOpportunities,
      };
    });
    const byItemDay = new Map();
    nextActivities.forEach((act) => {
      byItemDay.set(`${text(act.dayOfWeek)}:${text(act.itemId)}`, act);
      byItemDay.set(`${text(act.dayOfWeek)}:${text(act.title).toLowerCase()}`, act);
    });
    const nextPlan = { ...(plan || {}) };
    const daily = { ...(nextPlan.dailyPlans || {}) };
    WEEKDAYS.forEach((day) => {
      const dayPlan = {
        ...(daily[day] || {}),
        items: asArray(daily[day]?.items).map((item) => {
          const match = byItemDay.get(`${day}:${text(item.itemId)}`)
            || byItemDay.get(`${day}:${text(item.title).toLowerCase()}`);
          if (!match) return item;
          return {
            ...item,
            setupImageUrl: match.setupImageUrl,
            exampleImageUrl: match.exampleImageUrl,
            teacherTips: match.teacherTips,
            substitutions: match.substitutions,
            settingTags: match.settingTags,
            observationOpportunities: match.observationOpportunities,
          };
        }),
      };
      daily[day] = dayPlan;
    });
    nextPlan.dailyPlans = daily;
    const week = draft.week && typeof draft.week === "object" ? draft.week : {};
    if (text(week.familyConnection)) nextPlan.familyConnection = text(week.familyConnection);
    const percent = computeCompletionPercent(nextPlan, nextActivities, null);
    nextPlan.teachingKit = {
      ...(nextPlan.teachingKit || {}),
      schemaVersion: 1,
      completeness: percent >= 90 ? "complete" : percent >= 50 ? "enriched" : "legacy_mapped",
      completionPercent: percent,
      updatedAt: new Date().toISOString(),
    };
    return { plan: nextPlan, activities: nextActivities };
  }

  function summarizePublishChanges(plan, activities, enrichmentDraft) {
    const list = flattenLessonActivities(plan, activities);
    const draftActs = enrichmentDraft?.activities || {};
    let photos = 0;
    let tips = 0;
    list.forEach((act) => {
      const key = text(act.id) || text(act.itemId);
      const before = activityEnrichmentView(act, null);
      const after = activityEnrichmentView(act, draftActs[key]);
      if (after.setupImageUrl && after.setupImageUrl !== before.setupImageUrl) photos += 1;
      if (after.exampleImageUrl && after.exampleImageUrl !== before.exampleImageUrl) photos += 1;
      if (after.teacherTips.length > before.teacherTips.length) tips += 1;
    });
    const beforePct = computeCompletionPercent(plan, activities, null);
    const afterPct = computeCompletionPercent(plan, activities, enrichmentDraft);
    return {
      photoChanges: photos,
      tipChanges: tips,
      linkedActivitiesAffected: list.filter((act) => {
        const key = text(act.id) || text(act.itemId);
        return Boolean(draftActs[key]);
      }).length,
      completionBefore: beforePct,
      completionAfter: afterPct,
      labelBefore: completenessLabelFromPercent(beforePct, plan?.teachingKit?.completeness),
      labelAfter: completenessLabelFromPercent(afterPct, null),
      isPublished: ["published", "featured"].includes(text(plan?.status).toLowerCase()),
    };
  }

  return {
    WEEKDAYS,
    ACTIVITY_STATUS,
    flattenLessonActivities,
    activityEnrichmentView,
    activityStatus,
    activityStatusLabel,
    firstIncompleteActivityIndex,
    computeCompletionPercent,
    completenessLabelFromPercent,
    buildJumpIndex,
    searchJumpIndex,
    mergeDraftIntoPlan,
    summarizePublishChanges,
    clampPercent,
  };
});
