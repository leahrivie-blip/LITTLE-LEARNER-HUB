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
    return Boolean(
      text(book.questions)
      || text(book.discussionQuestions)
      || text(book.beforeQuestions)
      || text(book.duringQuestions)
      || text(book.afterQuestions)
      || asArray(book.readAloudQuestions).length,
    );
  }

  /**
   * Score each Teaching Kit area for completeness only (not educational quality).
   */
  function analyzeLessonCompleteness(plan, activities, enrichmentDraft) {
    const enrich = loadEnrichment();
    const draft = enrichmentDraft && typeof enrichmentDraft === "object" ? enrichmentDraft : {};
    const week = draft.week && typeof draft.week === "object" ? draft.week : {};
    const draftActs = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
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
    let completeActs = 0;
    list.forEach((act) => {
      const key = text(act.id) || text(act.itemId);
      const view = enrich?.activityEnrichmentView
        ? enrich.activityEnrichmentView(act, draftActs[key])
        : {
          teacherTips: asArray(act.teacherTips),
          observationPrompts: [],
          setupImageUrl: text(act.setupImageUrl),
          exampleImageUrl: text(act.exampleImageUrl),
        };
      if (!view.teacherTips.length) tipsMissing += 1;
      if (!view.observationPrompts.length && !text(act.observationOpportunities)) obsMissing += 1;
      if (!view.setupImageUrl || !view.exampleImageUrl) imagesMissing += 1;
      const status = enrich?.activityStatus ? enrich.activityStatus(act, draftActs[key]) : "not_started";
      if (status === "complete") completeActs += 1;
    });

    const books = asArray(week.books).length ? asArray(week.books) : asArray(plan?.books);
    const songs = asArray(week.songs).length ? asArray(week.songs) : asArray(plan?.songs);
    const booksWithQuestions = books.filter(bookHasQuestions).length;
    const family = text(week.familyConnection) || text(plan?.familyConnection);
    const printables = asArray(plan?.resourceIds).length
      || asArray(week.printableIds).length
      || asArray(week.printableIdeas).length;
    const toolkit = week.teacherToolkit && typeof week.teacherToolkit === "object"
      ? week.teacherToolkit
      : (plan?.teachingKit?.teacherToolkit || {});
    const toolkitReady = asArray(toolkit.prepChecklist).length
      || asArray(toolkit.observationFocus).length
      || text(toolkit.teacherPreparation)
      || text(week.teacherPreparation)
      || text(toolkit.notes);

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
        status: statusFromPresence(Boolean(materialsText), materialsText.split(/[·,\n]/).map(text).filter(Boolean).length >= 6),
        detail: materialsText ? "Materials list present" : "No materials checklist",
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
        status: statusFromPresence(list.length > 0, list.length > 0 && completeActs >= Math.ceil(list.length * 0.6)),
        detail: list.length ? `${completeActs}/${list.length} activities complete` : "No activities linked",
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
        detail: books.length ? `${booksWithQuestions}/${books.length} books have questions` : "No books",
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
        status: statusFromPresence(printables > 0, printables >= 2 || asArray(week.printableIdeas).length >= 2),
        detail: printables ? "Printable ideas or links present" : "No printables",
      },
      {
        id: "images",
        label: "Images",
        status: statusFromPresence(list.length > 0 && imagesMissing < list.length * 2, list.length > 0 && imagesMissing === 0),
        detail: list.length ? `${imagesMissing} photo gap(s) across setup/example` : "No activities",
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
      ? enrich.buildUpgradeSummary(plan, list, draft)
      : { completionPercent: 0 };
    const gapSectionIds = sections
      .filter((section) => section.status !== "complete")
      .map((section) => section.id);

    return {
      sections,
      counts,
      gapSectionIds,
      completionPercent: summary.completionPercent || 0,
      dashboardStage: summary.dashboardStage || "Legacy",
      activityCount: list.length,
      analyzedAt: new Date().toISOString(),
    };
  }

  function sectionNeedsWork(analysis, sectionId) {
    const section = asArray(analysis?.sections).find((item) => item.id === sectionId);
    return section && section.status !== "complete";
  }

  /**
   * Keep only suggestions that fill gaps / weak areas. Never used to wipe strong content —
   * applySuggestionsToDraft is already additive; this filters the suggestion set.
   */
  function filterSuggestionsForGaps(suggestions, analysis) {
    const gap = new Set(asArray(analysis?.gapSectionIds));
    const categoryToSection = {
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
    };
    return asArray(suggestions).filter((sug) => {
      const sectionId = categoryToSection[text(sug.category)] || "";
      if (!sectionId) return true;
      if (sectionId === "books" && gap.has("book_questions")) return true;
      return gap.has(sectionId) || sectionNeedsWork(analysis, sectionId);
    });
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
    analyzeLessonCompleteness,
    filterSuggestionsForGaps,
    buildSideBySideRows,
    applyLessonTeacherDecisions,
    sectionNeedsWork,
  };
});
