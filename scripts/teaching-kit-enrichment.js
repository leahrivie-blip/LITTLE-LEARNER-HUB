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
          objective: text(item.objective),
          setupImageUrl: text(item.setupImageUrl),
          exampleImageUrl: text(item.exampleImageUrl || item.examplePhotoUrl),
          teacherTips: asArray(item.teacherTips).map(text).filter(Boolean),
          substitutions: asArray(item.substitutions),
          settingTags: asArray(item.settingTags).map(text).filter(Boolean),
          observationOpportunities: text(item.observationOpportunities),
          vocabulary: text(item.vocabulary),
          materials: text(item.materials),
        });
      });
    });
    return out;
  }

  function vocabularyListFrom(value) {
    if (asArray(value).length) return asArray(value).map(text).filter(Boolean);
    return text(value).split(/[,;\n]+/).map(text).filter(Boolean);
  }

  function pickDraftOrPublishedText(draftValue, publishedValue) {
    const draft = text(draftValue);
    if (draft) return draft;
    return text(publishedValue);
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
    const observationPrompts = asArray(d.observationPrompts).length
      ? asArray(d.observationPrompts).map(text).filter(Boolean)
      : (text(activity?.observationOpportunities)
        ? text(activity.observationOpportunities).split(/\n+/).map(text).filter(Boolean)
        : []);
    const vocabulary = Object.prototype.hasOwnProperty.call(d, "vocabulary")
      ? vocabularyListFrom(d.vocabulary)
      : vocabularyListFrom(activity?.vocabulary);
    return {
      setupImageUrl: text(d.setupImageUrl) || text(activity?.setupImageUrl || activity?.setupPhotoUrl),
      exampleImageUrl: text(d.exampleImageUrl) || text(activity?.exampleImageUrl || activity?.examplePhotoUrl),
      setupImageThumbUrl: text(d.setupImageThumbUrl) || text(d.setupImageUrl) || text(activity?.setupImageUrl || activity?.setupPhotoUrl),
      exampleImageThumbUrl: text(d.exampleImageThumbUrl) || text(d.exampleImageUrl) || text(activity?.exampleImageUrl || activity?.examplePhotoUrl),
      setupMediaAssetId: text(d.setupMediaAssetId),
      exampleMediaAssetId: text(d.exampleMediaAssetId),
      teacherTips: tips,
      substitutions,
      settingTags,
      observationPrompts,
      vocabulary,
      indoorAlternatives: pickDraftOrPublishedText(d.indoorAlternatives, activity?.indoorAlternatives),
      outdoorAlternatives: pickDraftOrPublishedText(d.outdoorAlternatives, activity?.outdoorAlternatives),
      adaptations: pickDraftOrPublishedText(d.adaptations, activity?.adaptations),
      extensions: pickDraftOrPublishedText(d.extensions, activity?.extensions),
      setup: pickDraftOrPublishedText(d.setup, activity?.setup),
      steps: pickDraftOrPublishedText(d.steps, activity?.steps),
      imageBriefSetup: text(d.imageBriefSetup),
      imageBriefExample: text(d.imageBriefExample),
    };
  }

  function activityStatus(activity, draftActivity) {
    const view = activityEnrichmentView(activity, draftActivity);
    const hasSetup = Boolean(view.setupImageUrl);
    const hasExample = Boolean(view.exampleImageUrl);
    const hasTip = view.teacherTips.length > 0;
    const hasExtra = view.substitutions.length > 0
      || view.settingTags.length > 0
      || view.observationPrompts.length > 0
      || view.vocabulary.length > 0;
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

  /**
   * Curriculum dashboard triage stages (vision alignment).
   * Legacy → In Progress → Needs Review → Ready → Complete
   */
  function dashboardStageFromSummary(summary) {
    if (!summary || typeof summary !== "object") return "Legacy";
    const percent = clampPercent(summary.completionPercent);
    const hasDraft = Boolean(summary.hasEnrichmentDraft);
    const isPublished = Boolean(summary.isPublished);
    const needsReview = Boolean(summary.needsReview);

    if (percent >= 90 && isPublished && !hasDraft) return "Complete";
    if (percent >= 90 && !hasDraft) return "Ready";
    if (needsReview || (hasDraft && percent >= 25)) return "Needs Review";
    if (percent > 0 || hasDraft) return "In Progress";
    return "Legacy";
  }

  function dashboardStageSlug(stage) {
    return text(stage).toLowerCase().replace(/\s+/g, "_");
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

  /**
   * Strip admin-only draft channel before provider/mapper use.
   * Incomplete enrichment must never change the published Teaching Kit.
   */
  function planForProviderMapping(plan) {
    const next = { ...(plan || {}) };
    delete next.enrichmentDraft;
    return next;
  }

  function mergeDraftIntoPlan(plan, activities, enrichmentDraft) {
    const draft = enrichmentDraft && typeof enrichmentDraft === "object" ? enrichmentDraft : null;
    if (!draft) {
      return { plan: planForProviderMapping(plan), activities: asArray(activities) };
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
        setupImageThumbUrl: view.setupImageThumbUrl,
        exampleImageThumbUrl: view.exampleImageThumbUrl,
        setupMediaAssetId: view.setupMediaAssetId,
        exampleMediaAssetId: view.exampleMediaAssetId,
        teacherTips: view.teacherTips,
        substitutions: view.substitutions,
        settingTags: view.settingTags,
        observationOpportunities: view.observationPrompts.join("\n") || act.observationOpportunities,
        vocabulary: view.vocabulary.join(", ") || act.vocabulary,
        indoorAlternatives: view.indoorAlternatives || act.indoorAlternatives,
        outdoorAlternatives: view.outdoorAlternatives || act.outdoorAlternatives,
        adaptations: view.adaptations || act.adaptations,
        extensions: view.extensions || act.extensions,
        setup: view.setup || act.setup,
        steps: view.steps || act.steps,
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
            setupImageThumbUrl: match.setupImageThumbUrl,
            exampleImageThumbUrl: match.exampleImageThumbUrl,
            setupMediaAssetId: match.setupMediaAssetId,
            exampleMediaAssetId: match.exampleMediaAssetId,
            teacherTips: match.teacherTips,
            substitutions: match.substitutions,
            settingTags: match.settingTags,
            observationOpportunities: match.observationOpportunities,
            vocabulary: match.vocabulary,
            indoorAlternatives: match.indoorAlternatives,
            outdoorAlternatives: match.outdoorAlternatives,
            adaptations: match.adaptations,
            extensions: match.extensions,
            setup: match.setup,
            steps: match.steps,
          };
        }),
      };
      daily[day] = dayPlan;
    });
    nextPlan.dailyPlans = daily;
    const week = draft.week && typeof draft.week === "object" ? draft.week : {};
    if (text(week.familyConnection)) nextPlan.familyConnection = text(week.familyConnection);
    if (text(week.weeklyOverview)) nextPlan.weeklyOverview = text(week.weeklyOverview);
    if (text(week.objectives)) nextPlan.objectives = text(week.objectives);
    if (text(week.weeklyMaterials)) nextPlan.weeklyMaterials = text(week.weeklyMaterials);

    const draftBooks = asArray(week.books)
      .map((book) => {
        if (!book || typeof book !== "object") {
          const title = text(book);
          return title ? { title } : null;
        }
        const title = text(book.title);
        if (!title) return null;
        return {
          title,
          author: text(book.author),
          questions: text(book.questions || book.discussionQuestions),
        };
      })
      .filter(Boolean);
    if (draftBooks.length) {
      const existing = asArray(nextPlan.books).map((book) => (
        typeof book === "object" ? book : { title: text(book) }
      ));
      const seen = new Set(existing.map((book) => text(book.title).toLowerCase()).filter(Boolean));
      draftBooks.forEach((book) => {
        const key = text(book.title).toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        existing.push(book);
      });
      nextPlan.books = existing.slice(0, 40);
    }

    const draftSongs = asArray(week.songs)
      .map((song) => {
        if (!song || typeof song !== "object") {
          const title = text(song);
          return title ? { title } : null;
        }
        const title = text(song.title);
        if (!title) return null;
        return {
          title,
          lyrics: text(song.lyrics),
          motions: text(song.motions),
        };
      })
      .filter(Boolean);
    if (draftSongs.length) {
      const existing = asArray(nextPlan.songs).map((song) => (
        typeof song === "object" ? song : { title: text(song) }
      ));
      const seen = new Set(existing.map((song) => text(song.title).toLowerCase()).filter(Boolean));
      draftSongs.forEach((song) => {
        const key = text(song.title).toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        existing.push(song);
      });
      nextPlan.songs = existing.slice(0, 40);
    }

    const milestones = asArray(week.milestones).map(text).filter(Boolean).slice(0, 16);
    const printableIds = asArray(week.printableIds).map(text).filter(Boolean).slice(0, 100);
    const printableIdeas = asArray(week.printableIdeas).map(text).filter(Boolean).slice(0, 24);
    const vocabCards = asArray(week.vocabCards).map(text).filter(Boolean).slice(0, 40);
    if (printableIds.length) {
      const existingIds = asArray(nextPlan.resourceIds).map(text).filter(Boolean);
      const mergedIds = [...existingIds];
      printableIds.forEach((id) => {
        if (!mergedIds.includes(id)) mergedIds.push(id);
      });
      nextPlan.resourceIds = mergedIds.slice(0, 200);
    }
    const percent = computeCompletionPercent(nextPlan, nextActivities, null);
    const priorToolkit = nextPlan.teachingKit?.teacherToolkit && typeof nextPlan.teachingKit.teacherToolkit === "object"
      ? nextPlan.teachingKit.teacherToolkit
      : {};
    const draftToolkit = week.teacherToolkit && typeof week.teacherToolkit === "object"
      ? week.teacherToolkit
      : {};
    const toolkitPrep = asArray(draftToolkit.prepChecklist).length
      ? asArray(draftToolkit.prepChecklist).map(text).filter(Boolean)
      : asArray(priorToolkit.prepChecklist).map(text).filter(Boolean);
    const toolkitFocus = asArray(draftToolkit.observationFocus).length
      ? asArray(draftToolkit.observationFocus).map(text).filter(Boolean)
      : asArray(priorToolkit.observationFocus).map(text).filter(Boolean);
    const teacherPreparation = text(week.teacherPreparation)
      || text(draftToolkit.teacherPreparation)
      || text(priorToolkit.teacherPreparation);
    nextPlan.teachingKit = {
      ...(nextPlan.teachingKit || {}),
      schemaVersion: 1,
      completeness: percent >= 90 ? "complete" : percent >= 50 ? "enriched" : "legacy_mapped",
      completionPercent: percent,
      updatedAt: text(draft.updatedAt) || new Date().toISOString(),
      lastEditedBy: text(draft.lastEditedBy) || text(nextPlan.teachingKit?.lastEditedBy) || "",
      teacherToolkit: {
        prepChecklist: toolkitPrep.slice(0, 24),
        observationFocus: toolkitFocus.slice(0, 24),
        notes: text(draftToolkit.notes) || text(priorToolkit.notes),
        teacherPreparation,
      },
    };
    if (printableIdeas.length) nextPlan.teachingKit.printableIdeas = printableIdeas;
    if (vocabCards.length) nextPlan.teachingKit.vocabCards = vocabCards;
    if (milestones.length) {
      nextPlan.teachingKit.milestones = milestones;
    } else if (Array.isArray(nextPlan.teachingKit.milestones)) {
      // keep prior published milestones when draft omits them
    }
    if (printableIds.length) {
      nextPlan.teachingKit.printableIds = printableIds;
    }
    if (!nextPlan.teachingKit.lastEditedBy) delete nextPlan.teachingKit.lastEditedBy;
    delete nextPlan.enrichmentDraft;
    return { plan: nextPlan, activities: nextActivities };
  }

  /**
   * Admin Draft Preview vs published provider kit (same mapper).
   * mapFn defaults to LLHTeachingKit.mapLessonPlanToTeachingKit when available.
   */
  function buildTeachingKitPreviewModel(plan, activities, resources, enrichmentDraft, options, mapFn) {
    const mapper = typeof mapFn === "function"
      ? mapFn
      : (typeof globalThis !== "undefined"
        && globalThis.LLHTeachingKit
        && typeof globalThis.LLHTeachingKit.mapLessonPlanToTeachingKit === "function"
        ? globalThis.LLHTeachingKit.mapLessonPlanToTeachingKit.bind(globalThis.LLHTeachingKit)
        : null);
    if (!mapper) {
      throw new Error("mapLessonPlanToTeachingKit is required for preview parity");
    }
    const opts = options && typeof options === "object" ? options : { day: "monday" };
    const publishedPlan = planForProviderMapping(plan);
    const publishedKit = mapper(publishedPlan, asArray(activities), asArray(resources), opts);
    const merged = mergeDraftIntoPlan(publishedPlan, activities, enrichmentDraft);
    const draftKit = mapper(merged.plan, merged.activities, asArray(resources), opts);
    return {
      publishedKit,
      draftKit,
      merged,
      publishedPlan,
    };
  }

  function activityKey(activity) {
    return text(activity?.id) || text(activity?.itemId);
  }

  function hasObservationPrompts(activity, draftActivity) {
    const view = activityEnrichmentView(activity, draftActivity);
    if (view.observationPrompts.length) return true;
    return Boolean(text(activity?.observationOpportunities));
  }

  function hasActivityObjective(activity, draftActivity) {
    const d = draftActivity && typeof draftActivity === "object" ? draftActivity : {};
    return Boolean(text(d.objective) || text(activity?.objective) || asArray(activity?.learningGoals).some((g) => text(g)));
  }

  function hasActivityMaterials(activity, draftActivity) {
    const d = draftActivity && typeof draftActivity === "object" ? draftActivity : {};
    return Boolean(text(d.materials) || text(activity?.materials));
  }

  /**
   * Upgrade Summary — shared by Enrichment Editor panel and library triage filters.
   * Guidance only; never blocks draft save.
   */
  function buildUpgradeSummary(plan, activities, enrichmentDraft) {
    const draft = enrichmentDraft && typeof enrichmentDraft === "object" ? enrichmentDraft : null;
    const draftActs = draft?.activities && typeof draft.activities === "object" ? draft.activities : {};
    const week = draft?.week && typeof draft.week === "object" ? draft.week : {};
    const list = flattenLessonActivities(plan, activities);
    const percent = computeCompletionPercent(plan, list, draft);
    const label = completenessLabelFromPercent(percent, null);

    let incompleteActivities = 0;
    let missingSetupPhotos = 0;
    let missingExamplePhotos = 0;
    let missingTeacherTips = 0;
    let missingObservationPrompts = 0;
    let missingActivityObjectives = 0;
    let missingActivityMaterials = 0;

    list.forEach((act) => {
      const key = activityKey(act);
      const patch = draftActs[key];
      const status = activityStatus(act, patch);
      if (status !== ACTIVITY_STATUS.complete) incompleteActivities += 1;
      const view = activityEnrichmentView(act, patch);
      if (!view.setupImageUrl) missingSetupPhotos += 1;
      if (!view.exampleImageUrl) missingExamplePhotos += 1;
      if (!view.teacherTips.length) missingTeacherTips += 1;
      if (!hasObservationPrompts(act, patch)) missingObservationPrompts += 1;
      if (!hasActivityObjective(act, patch)) missingActivityObjectives += 1;
      if (!hasActivityMaterials(act, patch)) missingActivityMaterials += 1;
    });

    const missingFamilyConnection = !(text(plan?.familyConnection) || text(week.familyConnection));
    const missingPrintables = !(
      asArray(plan?.resourceIds).length
      || asArray(week.printableIds).length
      || asArray(week.printableIdeas).length
    );
    const missingBooks = !(asArray(plan?.books).length || asArray(week.books).length);
    const missingSongs = !(asArray(plan?.songs).length || asArray(week.songs).length);
    const publishedToolkit = plan?.teachingKit?.teacherToolkit && typeof plan.teachingKit.teacherToolkit === "object"
      ? plan.teachingKit.teacherToolkit
      : {};
    const draftToolkit = week.teacherToolkit && typeof week.teacherToolkit === "object"
      ? week.teacherToolkit
      : {};
    const missingTeacherToolkit = !(
      asArray(draftToolkit.prepChecklist).length
      || asArray(publishedToolkit.prepChecklist).length
      || asArray(draftToolkit.observationFocus).length
      || asArray(publishedToolkit.observationFocus).length
      || text(draftToolkit.notes)
      || text(publishedToolkit.notes)
      || text(week.teacherPreparation)
      || text(draftToolkit.teacherPreparation)
      || text(publishedToolkit.teacherPreparation)
    );
    const aiReady = Boolean(text(plan?.title)) && (
      list.length > 0 || Boolean(text(plan?.weeklyOverview) || text(week.weeklyOverview))
    );
    const missingVocabulary = !text(plan?.vocabularyWords).split(/[,;\n]+/).map(text).filter(Boolean).length;
    const missingWeekObjectives = !text(plan?.objectives);
    const missingWeekMaterials = !text(plan?.weeklyMaterials);

    const lessonStatus = text(plan?.status).toLowerCase() || "draft";
    const isPublished = ["published", "featured"].includes(lessonStatus);
    const hasEnrichmentDraft = Boolean(
      draft
      && (
        Object.keys(draftActs).length
        || text(week.familyConnection)
        || asArray(week.milestones).length
        || asArray(week.printableIds).length
        || draft.previewReady === true
        || text(draft.updatedAt)
        || text(draft.lastEditedBy)
      ),
    );
    const draftOrPublished = hasEnrichmentDraft
      ? (isPublished ? "Published · enrichment draft pending" : `${lessonStatus || "draft"} · enrichment draft pending`)
      : (isPublished ? "Published" : (lessonStatus === "featured" ? "Published" : (lessonStatus || "Draft")));

    const lastEditedDate = text(draft?.updatedAt) || text(plan?.updatedAt) || "";
    const lastEditedBy = text(draft?.lastEditedBy)
      || text(plan?.teachingKit?.lastEditedBy)
      || text(plan?.lastEditedBy)
      || "";

    const needsReview = isPublished && (hasEnrichmentDraft || percent < 90);
    const missingExamples = missingSetupPhotos > 0 || missingExamplePhotos > 0;
    const baseSummary = {
      completionPercent: percent,
      completenessLabel: label,
      activityCount: list.length,
      incompleteActivities,
      missingSetupPhotos,
      missingExamplePhotos,
      missingTeacherTips,
      missingObservationPrompts,
      missingFamilyConnection,
      missingPrintables,
      missingBooks,
      missingSongs,
      missingVocabulary,
      missingLearningObjectives: missingWeekObjectives || missingActivityObjectives > 0,
      missingWeekObjectives,
      missingActivityObjectives,
      missingMaterials: missingWeekMaterials || missingActivityMaterials > 0,
      missingWeekMaterials,
      missingActivityMaterials,
      lastEditedDate,
      lastEditedBy,
      lessonStatus,
      isPublished,
      hasEnrichmentDraft,
      draftOrPublished,
      needsReview,
      missingPhotos: missingExamples,
      missingExamples,
      missingObservations: missingObservationPrompts > 0,
      missingTeacherToolkit,
      aiReady,
    };
    baseSummary.dashboardStage = dashboardStageFromSummary(baseSummary);
    baseSummary.dashboardStageSlug = dashboardStageSlug(baseSummary.dashboardStage);
    return baseSummary;
  }

  function matchesUpgradeGapFilter(summary, gapFilter) {
    const gap = text(gapFilter).toLowerCase();
    if (!gap) return true;
    if (!summary) return false;
    if (gap === "missing_photos" || gap === "missing_examples") {
      return summary.missingPhotos || summary.missingExamples;
    }
    if (gap === "missing_printables") return summary.missingPrintables;
    if (gap === "missing_books") return summary.missingBooks;
    if (gap === "missing_songs") return summary.missingSongs;
    if (gap === "missing_tips" || gap === "missing_teacher_tips") return summary.missingTeacherTips > 0;
    if (gap === "missing_observations" || gap === "missing_observation") {
      return summary.missingObservations || summary.missingObservationPrompts > 0;
    }
    if (gap === "missing_family" || gap === "missing_family_connection") {
      return summary.missingFamilyConnection;
    }
    if (gap === "missing_toolkit" || gap === "missing_teacher_toolkit") {
      return summary.missingTeacherToolkit;
    }
    if (gap === "ai_ready") return summary.aiReady === true;
    if (gap === "not_ai_ready") return summary.aiReady === false;
    if (gap === "most_incomplete" || gap === "incomplete") {
      return Number(summary.completionPercent || 0) < 90
        || Number(summary.incompleteActivities || 0) > 0
        || summary.missingSongs
        || summary.missingBooks
        || summary.missingPrintables
        || summary.missingExamples
        || summary.missingTeacherToolkit
        || summary.missingFamilyConnection
        || summary.missingObservations;
    }
    if (gap === "draft") return summary.hasEnrichmentDraft || summary.lessonStatus === "draft";
    if (gap === "published") return summary.isPublished;
    if (gap === "needs_review") return summary.needsReview;
    if (gap === "stage_legacy") return summary.dashboardStage === "Legacy";
    if (gap === "stage_in_progress" || gap === "in_progress") return summary.dashboardStage === "In Progress";
    if (gap === "stage_needs_review") return summary.dashboardStage === "Needs Review";
    if (gap === "stage_ready") return summary.dashboardStage === "Ready";
    if (gap === "stage_complete") return summary.dashboardStage === "Complete";
    if (gap === "edited_today") {
      if (!summary.lastEditedDate) return false;
      const d = new Date(summary.lastEditedDate);
      if (Number.isNaN(d.getTime())) return false;
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }
    if (gap === "edited_7d") {
      if (!summary.lastEditedDate) return false;
      const d = new Date(summary.lastEditedDate);
      if (Number.isNaN(d.getTime())) return false;
      return (Date.now() - d.getTime()) <= 7 * 24 * 60 * 60 * 1000;
    }
    if (gap === "edited_older") {
      if (!summary.lastEditedDate) return true;
      const d = new Date(summary.lastEditedDate);
      if (Number.isNaN(d.getTime())) return true;
      return (Date.now() - d.getTime()) > 7 * 24 * 60 * 60 * 1000;
    }
    return true;
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

  const AI_SETTING_TAGS = new Set(["small_group", "large_group", "indoor", "outdoor"]);
  const AI_CATEGORY_TO_FIELD = Object.freeze({
    teacher_tips: "teacherTips",
    observation_prompts: "observationPrompts",
    vocabulary: "vocabulary",
    substitutions: "substitutions",
    indoor_outdoor: "indoorAlternatives",
    indoor_alternatives: "indoorAlternatives",
    outdoor_alternatives: "outdoorAlternatives",
    group_ideas: "teacherTips",
    setting_tags: "settingTags",
    adaptations: "adaptations",
    extensions: "extensions",
    setup: "setup",
    steps: "steps",
    image_brief_setup: "imageBriefSetup",
    image_brief_example: "imageBriefExample",
    family_connection: "familyConnection",
    milestones: "milestones",
    weekly_overview: "weeklyOverview",
    learning_objectives: "objectives",
    materials_list: "weeklyMaterials",
    teacher_preparation: "teacherPreparation",
    toolkit_prep: "toolkitPrep",
    toolkit_observation: "toolkitObservation",
    books: "books",
    songs: "songs",
    printable_ideas: "printableIdeas",
    vocab_cards: "vocabCards",
  });
  const AI_WEEK_FIELDS = new Set([
    "familyConnection",
    "milestones",
    "weeklyOverview",
    "objectives",
    "weeklyMaterials",
    "teacherPreparation",
    "toolkitPrep",
    "toolkitObservation",
    "books",
    "songs",
    "printableIdeas",
    "vocabCards",
  ]);
  const AI_ACTIVITY_TEXT_FIELDS = new Set([
    "indoorAlternatives",
    "outdoorAlternatives",
    "adaptations",
    "extensions",
    "setup",
    "steps",
    "imageBriefSetup",
    "imageBriefExample",
  ]);
  const AI_ACTIVITY_LIST_FIELDS = new Set(["teacherTips", "observationPrompts", "vocabulary"]);

  function appendDraftText(prev, next) {
    const a = text(prev);
    const b = text(next);
    if (!b) return a;
    if (!a) return b;
    if (a.includes(b)) return a;
    return `${a}\n\n${b}`;
  }

  function ensureWeekToolkit(draft) {
    if (!draft.week.teacherToolkit || typeof draft.week.teacherToolkit !== "object") {
      draft.week.teacherToolkit = {
        prepChecklist: [],
        observationFocus: [],
        notes: "",
        teacherPreparation: "",
      };
    }
    return draft.week.teacherToolkit;
  }

  /**
   * Canonical AI suggestion applicator (browser + server).
   * Never removes existing draft content. Pure — caller decides whether to save.
   */
  function applySuggestionsToDraft(draftInput, suggestions, { activityKey = "" } = {}) {
    const draft = draftInput && typeof draftInput === "object"
      ? JSON.parse(JSON.stringify(draftInput))
      : { activities: {}, week: {} };
    if (!draft.activities || typeof draft.activities !== "object") draft.activities = {};
    if (!draft.week || typeof draft.week !== "object") draft.week = {};

    const inserted = [];
    const fields = new Set();

    asArray(suggestions).forEach((sug) => {
      if (!sug || sug.decision === "discarded") return;
      if (sug.decision !== "accepted" && sug.selected !== true) return;
      const field = text(sug.field)
        || text(AI_CATEGORY_TO_FIELD[text(sug.category)])
        || "";
      if (!field) return;

      if (AI_WEEK_FIELDS.has(field) || text(sug.scope) === "week") {
        if (field === "familyConnection" || field === "weeklyOverview"
          || field === "objectives" || field === "weeklyMaterials"
          || field === "teacherPreparation") {
          const next = text(sug.proposedValue || sug.proposedText);
          if (!next) return;
          draft.week[field] = appendDraftText(draft.week[field], next);
          if (field === "teacherPreparation") {
            const toolkit = ensureWeekToolkit(draft);
            toolkit.teacherPreparation = appendDraftText(toolkit.teacherPreparation, next);
          }
          inserted.push(sug.id);
          fields.add(field);
          return;
        }
        if (field === "milestones" || field === "printableIdeas" || field === "vocabCards") {
          const label = text(sug.proposedValue || sug.proposedText);
          if (!label) return;
          const list = asArray(draft.week[field]).map(text).filter(Boolean);
          if (!list.includes(label)) list.push(label);
          draft.week[field] = list.slice(0, field === "milestones" ? 16 : 40);
          inserted.push(sug.id);
          fields.add(field);
          return;
        }
        if (field === "toolkitPrep" || field === "toolkitObservation") {
          const label = text(sug.proposedValue || sug.proposedText);
          if (!label) return;
          const toolkit = ensureWeekToolkit(draft);
          const key = field === "toolkitPrep" ? "prepChecklist" : "observationFocus";
          const list = asArray(toolkit[key]).map(text).filter(Boolean);
          if (!list.includes(label)) list.push(label);
          toolkit[key] = list.slice(0, 24);
          inserted.push(sug.id);
          fields.add(field);
          return;
        }
        if (field === "books") {
          const value = sug.proposedValue && typeof sug.proposedValue === "object"
            ? sug.proposedValue
            : { title: text(sug.proposedText) };
          const title = text(value.title);
          if (!title) return;
          const list = asArray(draft.week.books).filter((item) => item && text(item.title));
          if (!list.some((item) => text(item.title).toLowerCase() === title.toLowerCase())) {
            list.push({
              title,
              author: text(value.author),
              questions: text(value.questions),
            });
          }
          draft.week.books = list.slice(0, 24);
          inserted.push(sug.id);
          fields.add(field);
          return;
        }
        if (field === "songs") {
          const value = sug.proposedValue && typeof sug.proposedValue === "object"
            ? sug.proposedValue
            : { title: text(sug.proposedText) };
          const title = text(value.title);
          if (!title) return;
          const list = asArray(draft.week.songs).filter((item) => item && text(item.title));
          if (!list.some((item) => text(item.title).toLowerCase() === title.toLowerCase())) {
            list.push({
              title,
              lyrics: text(value.lyrics),
              motions: text(value.motions),
            });
          }
          draft.week.songs = list.slice(0, 24);
          inserted.push(sug.id);
          fields.add(field);
          return;
        }
        return;
      }

      const key = text(activityKey);
      if (!key) return;
      if (!draft.activities[key] || typeof draft.activities[key] !== "object") {
        draft.activities[key] = {};
      }
      const act = draft.activities[key];

      if (field === "substitutions") {
        const need = text(sug.proposedValue?.need || sug.need);
        const use = text(sug.proposedValue?.use || sug.use);
        if (!need || !use) return;
        const list = asArray(act.substitutions).filter((s) => s && typeof s === "object");
        const exists = list.some((s) => text(s.need) === need && text(s.use) === use);
        if (!exists) list.push({ need, use });
        act.substitutions = list.slice(0, 12);
        inserted.push(sug.id);
        fields.add(field);
        return;
      }

      if (field === "settingTags") {
        const tag = text(sug.proposedValue || sug.proposedText).toLowerCase().replace(/\s+/g, "_");
        if (!AI_SETTING_TAGS.has(tag)) return;
        const list = asArray(act.settingTags).map(text).filter(Boolean);
        if (!list.includes(tag)) list.push(tag);
        act.settingTags = list.slice(0, 8);
        inserted.push(sug.id);
        fields.add(field);
        return;
      }

      if (AI_ACTIVITY_TEXT_FIELDS.has(field)) {
        const value = text(sug.proposedValue || sug.proposedText);
        if (!value) return;
        act[field] = appendDraftText(act[field], value);
        inserted.push(sug.id);
        fields.add(field);
        return;
      }

      if (!AI_ACTIVITY_LIST_FIELDS.has(field) && field !== "teacherTips") return;
      const value = text(sug.proposedValue || sug.proposedText);
      if (!value) return;
      const max = field === "vocabulary" ? 24 : 8;
      const list = asArray(act[field]).map(text).filter(Boolean);
      if (!list.includes(value)) list.push(value);
      act[field] = list.slice(0, max);
      inserted.push(sug.id);
      fields.add(field);
    });

    return { draft, inserted, fields: [...fields] };
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
    dashboardStageFromSummary,
    dashboardStageSlug,
    buildJumpIndex,
    searchJumpIndex,
    mergeDraftIntoPlan,
    planForProviderMapping,
    buildTeachingKitPreviewModel,
    buildUpgradeSummary,
    matchesUpgradeGapFilter,
    summarizePublishChanges,
    applySuggestionsToDraft,
    clampPercent,
  };
});
