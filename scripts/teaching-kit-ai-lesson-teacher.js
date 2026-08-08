/**
 * AI Lesson Teacher — analyze lesson completeness + prepare upgrade drafts.
 * Pure helpers. Never writes store, never publishes, never deletes legacy content.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitAiLessonTeacher = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const SECTION_DEFS = Object.freeze([
    Object.freeze({ id: "overview", label: "Overview" }),
    Object.freeze({ id: "objectives", label: "Objectives" }),
    Object.freeze({ id: "vocabulary", label: "Vocabulary" }),
    Object.freeze({ id: "materials", label: "Materials" }),
    Object.freeze({ id: "daily_plan", label: "Daily plan" }),
    Object.freeze({ id: "activities", label: "Activities" }),
    Object.freeze({ id: "teacher_tips", label: "Teacher tips" }),
    Object.freeze({ id: "observation_prompts", label: "Observation prompts" }),
    Object.freeze({ id: "songs", label: "Songs" }),
    Object.freeze({ id: "books", label: "Books" }),
    Object.freeze({ id: "book_questions", label: "Book questions" }),
    Object.freeze({ id: "family", label: "Family connections" }),
    Object.freeze({ id: "printables", label: "Printables" }),
    Object.freeze({ id: "images", label: "Images" }),
    Object.freeze({ id: "teacher_toolkit", label: "Teacher Toolkit" }),
  ]);

  const STATUS = Object.freeze({
    complete: "Complete",
    needs_improvement: "Needs Improvement",
    missing: "Missing",
  });

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function loadEnrichment() {
    if (root && root.LLHTeachingKitEnrichment) return root.LLHTeachingKitEnrichment;
    if (typeof module === "object" && typeof require === "function") {
      try { return require("./teaching-kit-enrichment.js"); } catch (_e) { return null; }
    }
    return null;
  }

  function wordCount(value) {
    return text(value).split(/\s+/).filter(Boolean).length;
  }

  function statusFromPresence(hasAny, hasStrong) {
    if (hasStrong) return "complete";
    if (hasAny) return "needs_improvement";
    return "missing";
  }

  function bookHasQuestions(book) {
    if (!book || typeof book !== "object") return false;
    const enrich = loadEnrichment();
    if (typeof enrich?.bookRecordComplete === "function") {
      return enrich.bookRecordComplete(book);
    }
    const questions = asArray(book.beforeReadingQuestions).length
      + asArray(book.duringReadingPrompts).length
      + asArray(book.afterReadingQuestions || book.questions || book.readAloudQuestions).length
      + (text(book.discussionQuestions) ? 1 : 0)
      + (text(book.beforeQuestions) ? 1 : 0)
      + (text(book.duringQuestions) ? 1 : 0)
      + (text(book.afterQuestions) ? 1 : 0);
    return questions > 0;
  }

  /**
   * Score each Teaching Kit area for completeness only (not educational quality).
   */
  function analyzeLessonCompleteness(plan, activities, enrichmentDraft, options = {}) {
    const enrich = loadEnrichment();
    const draft = enrichmentDraft && typeof enrichmentDraft === "object" ? enrichmentDraft : {};
    const week = draft.week && typeof draft.week === "object" ? draft.week : {};
    const draftActs = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
    const resources = asArray(options.resources);
    const list = enrich?.flattenLessonActivities
      ? enrich.flattenLessonActivities(plan, activities)
      : asArray(activities);

    const overviewText = text(week.weeklyOverview) || text(plan?.weeklyOverview);
    const objectivesText = text(week.objectives) || text(plan?.objectives);
    const materialsText = text(week.weeklyMaterials) || text(plan?.weeklyMaterials);
    const vocabPublished = text(plan?.vocabularyWords)
      .split(/[,;\n]+/)
      .map(text)
      .filter(Boolean);
    const vocabDraftCards = asArray(week.vocabCards).map(text).filter(Boolean);
    const vocabActivityCount = list.filter((act) => {
      const key = text(act.id) || text(act.itemId);
      const view = enrich?.activityEnrichmentView
        ? enrich.activityEnrichmentView(act, draftActs[key])
        : { vocabulary: [] };
      return asArray(view.vocabulary).length > 0 || text(act.vocabulary);
    }).length;

    const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const daysWithItems = weekdays.filter((day) => asArray(plan?.dailyPlans?.[day]?.items).some((item) => text(item?.title))).length;

    let tipsMissing = 0;
    let obsMissing = 0;
    let imagesMissing = 0;
    let imagesBriefOnly = 0;
    let draftReadyActs = 0;
    let completeActs = 0;
    list.forEach((act) => {
      const key = text(act.id) || text(act.itemId);
      const patch = draftActs[key] || {};
      const view = enrich?.activityEnrichmentView
        ? enrich.activityEnrichmentView(act, patch)
        : {
          teacherTips: asArray(act.teacherTips),
          observationPrompts: [],
          setupImageUrl: text(act.setupImageUrl),
          exampleImageUrl: text(act.exampleImageUrl),
        };
      if (!view.teacherTips.length) tipsMissing += 1;
      if (!view.observationPrompts.length && !text(act.observationOpportunities)) obsMissing += 1;
      // Image briefs never count as actual setup/finished photos.
      // Only count missing/brief blockers for slots required by imageRequirement.
      const slots = view.imageSlots
        || (enrich?.imageSlotsForRequirement
          ? enrich.imageSlotsForRequirement(view.imageRequirement || enrich.resolveImageRequirement?.(act, patch))
          : { needsSetup: true, needsExample: true });
      const hasSetupPhoto = Boolean(view.setupImageUrl);
      const hasExamplePhoto = Boolean(view.exampleImageUrl);
      const hasSetupBrief = Boolean(text(patch.imageBriefSetup || view.imageBriefSetup));
      const hasExampleBrief = Boolean(text(patch.imageBriefExample || view.imageBriefExample));
      if ((slots.needsSetup && !hasSetupPhoto) || (slots.needsExample && !hasExamplePhoto)) {
        imagesMissing += 1;
      }
      if (
        (slots.needsSetup && !hasSetupPhoto && hasSetupBrief)
        || (slots.needsExample && !hasExamplePhoto && hasExampleBrief)
      ) {
        imagesBriefOnly += 1;
      }
      const imagesOk = enrich?.activityImagesSatisfyRequirement
        ? enrich.activityImagesSatisfyRequirement(view, view.imageRequirement || slots.requirement)
        : (hasSetupPhoto && hasExamplePhoto);
      const hasDraftPack = Boolean(
        view.teacherTips.length
        && (view.observationPrompts.length || text(act.observationOpportunities))
        && text(patch.setup || act.setup)
        && text(patch.steps || act.steps)
        && imagesOk,
      );
      if (hasDraftPack) draftReadyActs += 1;
      const status = enrich?.activityStatus ? enrich.activityStatus(act, patch) : "not_started";
      if (status === "complete") completeActs += 1;
    });

    const books = asArray(week.books).length ? asArray(week.books) : asArray(plan?.books);
    const songs = asArray(week.songs).length ? asArray(week.songs) : asArray(plan?.songs);
    const booksWithQuestions = books.filter(bookHasQuestions).length;
    const family = text(week.familyConnection) || text(plan?.familyConnection);
    const publishedPrintables = enrich?.hasLinkedPrintable
      ? (enrich.hasLinkedPrintable(plan, week, { resources }) ? 1 : 0)
      : 0;
    const draftOnlyPrintables = enrich?.hasDraftOnlyPrintables
      ? enrich.hasDraftOnlyPrintables(plan, week, { resources })
      : false;
    const printableIdeas = asArray(week.printableIdeas).length;
    const toolkit = week.teacherToolkit && typeof week.teacherToolkit === "object"
      ? week.teacherToolkit
      : (plan?.teachingKit?.teacherToolkit || {});
    const toolkitReady = asArray(toolkit.prepChecklist).length
      || asArray(toolkit.observationFocus).length
      || text(toolkit.teacherPreparation)
      || text(week.teacherPreparation)
      || text(toolkit.notes);
    const materialsState = enrich?.materialsReadinessState
      ? enrich.materialsReadinessState(materialsText)
      : statusFromPresence(Boolean(materialsText), materialsText.split(/[·,\n;]+/).map(text).filter(Boolean).length >= 6);

    const sections = [
      {
        id: "overview",
        label: "Overview",
        status: statusFromPresence(Boolean(overviewText), wordCount(overviewText) >= 25),
        detail: overviewText ? `${wordCount(overviewText)} words` : "No weekly overview",
      },
      {
        id: "objectives",
        label: "Objectives",
        status: statusFromPresence(Boolean(objectivesText), wordCount(objectivesText) >= 12 || objectivesText.split(/\n+/).filter(Boolean).length >= 3),
        detail: objectivesText ? "Objectives present" : "No learning objectives",
      },
      {
        id: "vocabulary",
        label: "Vocabulary",
        status: statusFromPresence(
          vocabPublished.length + vocabDraftCards.length + vocabActivityCount > 0,
          vocabPublished.length >= 6 || vocabDraftCards.length >= 4 || vocabActivityCount >= Math.max(1, Math.ceil(list.length / 2)),
        ),
        detail: `${vocabPublished.length + vocabDraftCards.length} words/cards · ${vocabActivityCount} activities with vocab`,
      },
      {
        id: "materials",
        label: "Materials",
        status: materialsState === "complete" || materialsState === "needs_improvement" || materialsState === "missing"
          ? materialsState
          : statusFromPresence(Boolean(materialsText), materialsText.split(/[·,\n;]+/).map(text).filter(Boolean).length >= 6),
        detail: materialsState === "complete"
          ? "Materials checklist ready"
          : (materialsState === "needs_improvement"
            ? "Materials list too thin (Needs Improvement)"
            : "No materials checklist"),
      },
      {
        id: "daily_plan",
        label: "Daily plan",
        status: statusFromPresence(daysWithItems > 0, daysWithItems >= 5),
        detail: `${daysWithItems}/5 weekdays have activities`,
      },
      {
        id: "activities",
        label: "Activities",
        status: statusFromPresence(
          list.length > 0 && (draftReadyActs > 0 || completeActs > 0),
          list.length > 0 && completeActs >= list.length,
        ),
        detail: list.length
          ? `${completeActs}/${list.length} activities complete (${draftReadyActs} with full photo pack)`
          : "No activities linked",
      },
      {
        id: "teacher_tips",
        label: "Teacher tips",
        status: statusFromPresence(list.length > 0 && tipsMissing < list.length, list.length > 0 && tipsMissing === 0),
        detail: list.length ? `${list.length - tipsMissing}/${list.length} have tips` : "No activities",
      },
      {
        id: "observation_prompts",
        label: "Observation prompts",
        status: statusFromPresence(list.length > 0 && obsMissing < list.length, list.length > 0 && obsMissing === 0),
        detail: list.length ? `${list.length - obsMissing}/${list.length} have observations` : "No activities",
      },
      {
        id: "songs",
        label: "Songs",
        status: statusFromPresence(songs.length > 0, songs.length >= 2),
        detail: `${songs.length} song(s)`,
      },
      {
        id: "books",
        label: "Books",
        status: statusFromPresence(books.length > 0, books.length >= 2),
        detail: `${books.length} book(s)`,
      },
      {
        id: "book_questions",
        label: "Book questions",
        status: statusFromPresence(booksWithQuestions > 0, books.length > 0 && booksWithQuestions >= books.length),
        detail: books.length ? `${booksWithQuestions}/${books.length} books have discussion questions` : "No books",
      },
      {
        id: "family",
        label: "Family connections",
        status: statusFromPresence(Boolean(family), wordCount(family) >= 20),
        detail: family ? `${wordCount(family)} words` : "No family connection",
      },
      {
        id: "printables",
        label: "Printables",
        status: publishedPrintables > 0
          ? "complete"
          : (draftOnlyPrintables || printableIdeas > 0 ? "needs_improvement" : "missing"),
        detail: publishedPrintables > 0
          ? "Published printable linked"
          : (draftOnlyPrintables
            ? "Draft printable linked — does not count as published/usable"
            : (printableIdeas > 0 ? "Printable ideas only — not print-ready" : "No printables")),
      },
      {
        id: "images",
        label: "Images",
        status: list.length > 0 && imagesMissing === 0
          ? "complete"
          : (imagesBriefOnly > 0 || (list.length > 0 && imagesMissing < list.length)
            ? "needs_improvement"
            : (list.length ? "missing" : "missing")),
        detail: list.length
          ? (imagesBriefOnly
            ? `${imagesBriefOnly} brief-only image slot(s) — briefs never count as photos`
            : (imagesMissing
              ? `${imagesMissing} activit${imagesMissing === 1 ? "y" : "ies"} missing real setup/example photos`
              : "All activities have real setup + example photos"))
          : "No activities",
      },
      {
        id: "teacher_toolkit",
        label: "Teacher Toolkit",
        status: statusFromPresence(
          Boolean(toolkitReady),
          asArray(toolkit.prepChecklist).length >= 2 && asArray(toolkit.observationFocus).length >= 1,
        ),
        detail: toolkitReady ? "Toolkit fields present" : "Toolkit empty",
      },
    ].map((section) => ({
      ...section,
      statusLabel: STATUS[section.status] || section.status,
    }));

    const counts = { complete: 0, needs_improvement: 0, missing: 0 };
    sections.forEach((section) => {
      counts[section.status] = (counts[section.status] || 0) + 1;
    });
    const summary = enrich?.buildUpgradeSummary
      ? enrich.buildUpgradeSummary(plan, list, draft, { resources, skipQualityAttach: true })
      : { completionPercent: 0 };
    const gapSectionIds = sections
      .filter((section) => section.status !== "complete")
      .map((section) => section.id);

    // Never call a lesson Ready/Published when large Teaching Kit areas or weekdays still lack content.
    const majorGaps = gapSectionIds.filter((id) => [
      "overview", "objectives", "activities", "songs", "books", "family", "printables", "teacher_toolkit", "daily_plan",
    ].includes(id));
    const coverage = summary.weekdayCoverage || null;
    const contentCompletionPercent = summary.contentCompletionPercent != null
      ? summary.contentCompletionPercent
      : (summary.completionPercent || 0);
    let completionPercent = contentCompletionPercent;
    let dashboardStage = summary.dashboardStage || "Legacy";
    if ((coverage && !coverage.coverageComplete) || gapSectionIds.includes("daily_plan")) {
      completionPercent = Math.min(completionPercent, coverage ? coverage.percent : 20);
      if (["Ready", "Published", "Complete"].includes(dashboardStage)) dashboardStage = "Needs Review";
    } else if (majorGaps.length >= 3 && completionPercent >= 90) {
      completionPercent = Math.min(completionPercent, 75);
      dashboardStage = "Needs Review";
    } else if (list.length && draftReadyActs < list.length && completionPercent >= 90) {
      completionPercent = Math.min(completionPercent, 85);
      if (dashboardStage === "Complete" || dashboardStage === "Published") dashboardStage = "Ready";
    }

    return {
      sections,
      counts,
      gapSectionIds,
      completionPercent,
      enrichmentFillPercent: summary.enrichmentFillPercent ?? summary.completionPercent ?? 0,
      weekdayCoverage: coverage,
      dashboardStage,
      activityCount: list.length,
      draftReadyActivities: draftReadyActs,
      imagesBriefOnly,
      analyzedAt: new Date().toISOString(),
    };
  }

  function sectionNeedsWork(analysis, sectionId) {
    const section = asArray(analysis?.sections).find((item) => item.id === sectionId);
    return section && section.status !== "complete";
  }

  const CATEGORY_TO_SECTION = Object.freeze({
    weekly_overview: "overview",
    learning_objectives: "objectives",
    materials_list: "materials",
    vocabulary: "vocabulary",
    vocab_cards: "vocabulary",
    teacher_tips: "teacher_tips",
    observation_prompts: "observation_prompts",
    songs: "songs",
    books: "books",
    family_connection: "family",
    printable_ideas: "printables",
    teacher_preparation: "teacher_toolkit",
    toolkit_prep: "teacher_toolkit",
    toolkit_observation: "teacher_toolkit",
    image_brief_setup: "images",
    image_brief_example: "images",
    setup: "activities",
    steps: "activities",
    adaptations: "activities",
    extensions: "activities",
    indoor_alternatives: "activities",
    outdoor_alternatives: "activities",
    indoor_outdoor: "activities",
    group_ideas: "teacher_tips",
    setting_tags: "activities",
    substitutions: "activities",
    milestones: "objectives",
  });

  function sectionIdForSuggestion(sug) {
    return CATEGORY_TO_SECTION[text(sug?.category)] || "";
  }

  /**
   * Keep only suggestions that fill gaps / weak areas. Never used to wipe strong content —
   * applySuggestionsToDraft is already additive; this filters the suggestion set.
   * For complete-kit generation, keep activity-scoped rows for activities that are not draft-ready.
   */
  function filterSuggestionsForGaps(suggestions, analysis) {
    const gap = new Set(asArray(analysis?.gapSectionIds));
    const draftReadyRatio = analysis?.activityCount
      ? (analysis.draftReadyActivities || 0) / analysis.activityCount
      : 0;
    const forceActivityFill = draftReadyRatio < 1;
    return asArray(suggestions).filter((sug) => {
      const sectionId = sectionIdForSuggestion(sug);
      if (!sectionId) return true;
      if (text(sug.activityKey) && forceActivityFill) {
        // Still skip sections that are already complete when the category is week-only-ish
        if (["overview", "objectives", "materials", "family", "printables", "songs", "books"].includes(sectionId)
          && !gap.has(sectionId) && !sectionNeedsWork(analysis, sectionId)) {
          return false;
        }
        return true;
      }
      if (sectionId === "books" && gap.has("book_questions")) return true;
      return gap.has(sectionId) || sectionNeedsWork(analysis, sectionId);
    });
  }

  function groupSuggestionsForReview(suggestions) {
    const week = [];
    const byActivity = new Map();
    asArray(suggestions).forEach((sug, index) => {
      const row = { ...sug, index };
      const key = text(sug.activityKey);
      if (!key || text(sug.scope) === "week") {
        week.push(row);
        return;
      }
      if (!byActivity.has(key)) byActivity.set(key, []);
      byActivity.get(key).push(row);
    });
    return {
      week,
      activities: [...byActivity.entries()].map(([activityKey, rows]) => ({
        activityKey,
        rows,
        sectionIds: [...new Set(rows.map(sectionIdForSuggestion).filter(Boolean))],
      })),
    };
  }

  function buildSideBySideRows(suggestions) {
    return asArray(suggestions).map((sug, index) => ({
      id: text(sug.id) || `row-${index + 1}`,
      index,
      category: text(sug.category),
      field: text(sug.field),
      fieldLabel: text(sug.fieldLabel) || text(sug.category).replace(/_/g, " "),
      scope: text(sug.scope) || "week",
      activityKey: text(sug.activityKey),
      currentValue: text(sug.currentValue) || "(empty)",
      proposedText: text(sug.proposedText || sug.editText || sug.proposedValue),
      proposedValue: sug.proposedValue,
      decision: text(sug.decision) || "pending",
      selected: sug.selected === true || sug.decision === "accepted",
    }));
  }

  /**
   * Apply only accepted/selected suggestions into a draft copy.
   * Preserves existing draft + published content (additive apply).
   */
  function applyLessonTeacherDecisions(draftInput, suggestions, { activityKey = "" } = {}) {
    const enrich = loadEnrichment();
    if (!enrich?.applySuggestionsToDraft) {
      return { draft: draftInput || { activities: {}, week: {} }, inserted: [], fields: [] };
    }
    // Group by activityKey so activity-scoped rows apply correctly.
    let draft = draftInput && typeof draftInput === "object"
      ? JSON.parse(JSON.stringify(draftInput))
      : { activities: {}, week: {} };
    const inserted = [];
    const fields = new Set();
    const weekSugs = [];
    const byActivity = new Map();
    asArray(suggestions).forEach((sug) => {
      if (!sug || sug.decision === "discarded") return;
      if (sug.decision !== "accepted" && sug.selected !== true) return;
      if (text(sug.scope) === "week" || !text(sug.activityKey)) {
        weekSugs.push(sug);
        return;
      }
      const key = text(sug.activityKey);
      if (!byActivity.has(key)) byActivity.set(key, []);
      byActivity.get(key).push(sug);
    });
    if (weekSugs.length) {
      const applied = enrich.applySuggestionsToDraft(draft, weekSugs, {});
      draft = applied.draft;
      inserted.push(...applied.inserted);
      applied.fields.forEach((f) => fields.add(f));
    }
    byActivity.forEach((list, key) => {
      const applied = enrich.applySuggestionsToDraft(draft, list, { activityKey: key });
      draft = applied.draft;
      inserted.push(...applied.inserted);
      applied.fields.forEach((f) => fields.add(f));
    });
    // Fallback single-key apply for callers that pass one activityKey
    if (!weekSugs.length && !byActivity.size && activityKey) {
      const applied = enrich.applySuggestionsToDraft(draft, suggestions, { activityKey });
      return applied;
    }
    return { draft, inserted, fields: [...fields] };
  }

  return {
    SECTION_DEFS,
    STATUS,
    CATEGORY_TO_SECTION,
    analyzeLessonCompleteness,
    filterSuggestionsForGaps,
    buildSideBySideRows,
    applyLessonTeacherDecisions,
    sectionNeedsWork,
    sectionIdForSuggestion,
    groupSuggestionsForReview,
  };
});
