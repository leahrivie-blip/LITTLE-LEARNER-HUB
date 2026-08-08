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

  /**
   * Per-activity image requirement — instructional value, not universal.
   * Briefs never satisfy any requirement; they remain drafting notes only.
   */
  const IMAGE_REQUIREMENT = Object.freeze({
    required: "required",
    setup_only: "setup_only",
    example_only: "example_only",
    optional: "optional",
    not_needed: "not_needed",
  });

  const IMAGE_REQUIREMENT_LABELS = Object.freeze({
    required: "Required: setup and example",
    setup_only: "Setup image only",
    example_only: "Finished example only",
    optional: "Optional",
    not_needed: "Not needed",
  });

  const IMAGE_REQUIREMENT_VALUES = Object.freeze(Object.values(IMAGE_REQUIREMENT));

  /** Categories that need both setup + finished example by default. */
  const IMAGE_REQUIRED_CATEGORIES = Object.freeze(new Set([
    "Art",
    "Process Art",
    "Sensory",
    "Sensory Play",
    "STEM",
    "STEM/Discovery",
    "Science",
    "Dramatic Play",
    "Fine Motor",
    "Cooking",
    "Invitation to Play",
    "Open-Ended Exploration",
    "Outdoor Play",
  ]));

  /** Categories that rarely need photos (songs, circle, simple movement). */
  const IMAGE_NOT_NEEDED_CATEGORIES = Object.freeze(new Set([
    "Circle Time",
    "Music and Movement",
    "Music & Movement",
  ]));

  /** Categories where photos help sometimes but should not block Complete. */
  const IMAGE_OPTIONAL_CATEGORIES = Object.freeze(new Set([
    "Gross Motor",
    "Literacy",
    "Early Literacy",
    "Early Math",
    "Matching",
    "Sorting",
    "Social-Emotional",
    "Small Group",
    "Parent Connection",
  ]));

  let statusApi = null;
  function loadStatusApi() {
    if (statusApi) return statusApi;
    if (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitStatus) {
      statusApi = globalThis.LLHTeachingKitStatus;
      return statusApi;
    }
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      statusApi = require("./teaching-kit-status.js");
    } catch (_error) {
      statusApi = null;
    }
    return statusApi;
  }

  let qualityApi = null;
  function loadQualityApi() {
    if (qualityApi) return qualityApi;
    if (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitQualityReview) {
      qualityApi = globalThis.LLHTeachingKitQualityReview;
      return qualityApi;
    }
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      qualityApi = require("./teaching-kit-quality-review.js");
    } catch (_error) {
      qualityApi = null;
    }
    return qualityApi;
  }

  function normalizeOptions(optionsOrResources) {
    if (Array.isArray(optionsOrResources)) return { resources: optionsOrResources };
    if (optionsOrResources && typeof optionsOrResources === "object") return optionsOrResources;
    return {};
  }

  /** Published/featured only — draft and archived never count as usable printables. */
  function isUsablePrintableResource(resource) {
    if (!resource || typeof resource !== "object") return false;
    const status = text(resource.status).toLowerCase();
    return status === "published" || status === "featured";
  }

  function resourceCatalogFromOptions(options = {}) {
    return asArray(options.resources);
  }

  function linkedPrintableIds(plan, week) {
    const ids = [
      ...asArray(plan?.resourceIds),
      ...asArray(week?.printableIds),
    ].map(text).filter(Boolean);
    return [...new Set(ids)];
  }

  function materialsItemCount(materialsText) {
    return text(materialsText)
      .split(/[·,\n;]+/)
      .map(text)
      .filter(Boolean).length;
  }

  /**
   * Materials completeness for premium readiness.
   * Thin lists (< 6 ordinary items) are Needs Improvement — not premium-ready.
   */
  function materialsReadinessState(materialsText) {
    const count = materialsItemCount(materialsText);
    if (count <= 0) return "missing";
    if (count < 6) return "needs_improvement";
    return "complete";
  }

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
          imageRequirement: text(item.imageRequirement),
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

  function normalizeImageRequirement(value) {
    const raw = text(value).toLowerCase().replace(/[\s-]+/g, "_");
    if (!raw) return "";
    const aliases = {
      required: IMAGE_REQUIREMENT.required,
      required_setup_and_example: IMAGE_REQUIREMENT.required,
      setup_and_example: IMAGE_REQUIREMENT.required,
      both: IMAGE_REQUIREMENT.required,
      setup_only: IMAGE_REQUIREMENT.setup_only,
      setup_image_only: IMAGE_REQUIREMENT.setup_only,
      setup: IMAGE_REQUIREMENT.setup_only,
      example_only: IMAGE_REQUIREMENT.example_only,
      finished_example_only: IMAGE_REQUIREMENT.example_only,
      example: IMAGE_REQUIREMENT.example_only,
      finished_only: IMAGE_REQUIREMENT.example_only,
      optional: IMAGE_REQUIREMENT.optional,
      not_needed: IMAGE_REQUIREMENT.not_needed,
      notneeded: IMAGE_REQUIREMENT.not_needed,
      none: IMAGE_REQUIREMENT.not_needed,
      na: IMAGE_REQUIREMENT.not_needed,
    };
    return aliases[raw] || (IMAGE_REQUIREMENT_VALUES.includes(raw) ? raw : "");
  }

  function imageRequirementLabel(value) {
    const key = normalizeImageRequirement(value) || IMAGE_REQUIREMENT.required;
    return IMAGE_REQUIREMENT_LABELS[key] || IMAGE_REQUIREMENT_LABELS.required;
  }

  /**
   * Category + title heuristics for instructional image value.
   * Explicit activity/draft imageRequirement always wins over defaults.
   */
  function defaultImageRequirementForActivity(activity) {
    const category = text(activity?.activityCategory);
    const title = text(activity?.title);
    const blob = `${category} ${title} ${text(activity?.description)} ${text(activity?.objective)}`.toLowerCase();

    // Category defaults first (stable instructional policy).
    if (IMAGE_REQUIRED_CATEGORIES.has(category)) return IMAGE_REQUIREMENT.required;
    if (IMAGE_NOT_NEEDED_CATEGORIES.has(category)) return IMAGE_REQUIREMENT.not_needed;
    if (IMAGE_OPTIONAL_CATEGORIES.has(category)) return IMAGE_REQUIREMENT.optional;

    // Title / description heuristics for aliases and non-canonical categories.
    if (/printable|worksheet|cutting practice|laminat|flash.?card|name tag/i.test(blob)) {
      return IMAGE_REQUIREMENT.required;
    }
    if (/process art|sensory bin|stem|dramatic play|invitation to play|hands.?on setup/i.test(blob)) {
      return IMAGE_REQUIREMENT.required;
    }
    if (/circle time|morning meeting|\bsong\b|sing along|rhyme|chant|transition|line up|cleanup song/i.test(blob)) {
      return IMAGE_REQUIREMENT.not_needed;
    }
    if (/book discussion|read.?aloud|story time|storytime|\bgame\b|matching game|memory game|bingo|simple movement|freeze dance/i.test(blob)) {
      return IMAGE_REQUIREMENT.optional;
    }

    // Preserve prior universal expectation for unknown hands-on categories.
    return IMAGE_REQUIREMENT.required;
  }

  function resolveImageRequirement(activity, draftActivity) {
    const d = draftActivity && typeof draftActivity === "object" ? draftActivity : {};
    const explicit = normalizeImageRequirement(d.imageRequirement)
      || normalizeImageRequirement(activity?.imageRequirement);
    if (explicit) return explicit;
    return defaultImageRequirementForActivity(activity);
  }

  function imageSlotsForRequirement(requirement) {
    const req = normalizeImageRequirement(requirement) || IMAGE_REQUIREMENT.required;
    return {
      requirement: req,
      needsSetup: req === IMAGE_REQUIREMENT.required || req === IMAGE_REQUIREMENT.setup_only,
      needsExample: req === IMAGE_REQUIREMENT.required || req === IMAGE_REQUIREMENT.example_only,
      imagesOptional: req === IMAGE_REQUIREMENT.optional,
      imagesNotNeeded: req === IMAGE_REQUIREMENT.not_needed,
      expectedCount: req === IMAGE_REQUIREMENT.required
        ? 2
        : (req === IMAGE_REQUIREMENT.setup_only || req === IMAGE_REQUIREMENT.example_only ? 1 : 0),
    };
  }

  function activityImagesSatisfyRequirement(view, requirement) {
    const slots = imageSlotsForRequirement(requirement);
    if (slots.imagesOptional || slots.imagesNotNeeded) return true;
    if (slots.needsSetup && !text(view?.setupImageUrl)) return false;
    if (slots.needsExample && !text(view?.exampleImageUrl)) return false;
    return true;
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
    const imageRequirement = resolveImageRequirement(activity, d);
    const imageSlots = imageSlotsForRequirement(imageRequirement);
    return {
      imageRequirement,
      imageRequirementLabel: imageRequirementLabel(imageRequirement),
      imageSlots,
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
    const imagesOk = activityImagesSatisfyRequirement(view, view.imageRequirement);
    if (imagesOk && hasTip) return ACTIVITY_STATUS.complete;
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

  const PLACEHOLDER_RE = /coming soon|theme focus coming soon|lorem ipsum|\btodo\b|\btbd\b|placeholder|\[insert/i;

  function isPlaceholderText(value) {
    return PLACEHOLDER_RE.test(text(value));
  }

  function meaningfulText(value, minWords = 3) {
    const raw = text(value);
    if (!raw || isPlaceholderText(raw)) return false;
    return raw.split(/\s+/).filter(Boolean).length >= minWords;
  }

  function imageReadinessState(url, brief) {
    if (text(url)) return "image_uploaded";
    if (text(brief)) return "image_brief_ready";
    return "image_missing";
  }

  function bookRecordComplete(book) {
    if (!book || typeof book !== "object") return false;
    if (!text(book.title) || !text(book.author)) return false;
    const questions = asArray(book.beforeReadingQuestions).length
      + asArray(book.duringReadingPrompts).length
      + asArray(book.afterReadingQuestions || book.questions || book.readAloudQuestions).length;
    return Boolean(text(book.whyThisBook || book.whyItFits) || questions > 0)
      && questions > 0;
  }

  function songRecordComplete(song) {
    if (!song || typeof song !== "object") return false;
    if (!text(song.title)) return false;
    const rights = text(song.rightsStatus || song.copyrightStatus).toLowerCase();
    if (!rights) return false;
    return Boolean(text(song.motions) || text(song.teacherDirections) || text(song.whenToUse));
  }

  function toolkitRecordComplete(toolkit, week) {
    const t = toolkit && typeof toolkit === "object" ? toolkit : {};
    const requiredText = [
      text(t.teacherPreparation) || text(week?.teacherPreparation),
      text(t.mixedAgeAdaptations),
      text(t.extraSupportAdaptations || t.extraSupport),
      text(t.challengeExtensions || t.extensions),
      text(t.safetyInclusionNotes || t.safetyNotes),
      text(t.endOfWeekReflection),
      text(t.familyConnection) || text(week?.familyConnection),
    ].filter((v) => meaningfulText(v, 4));
    const requiredLists = [
      asArray(t.teacherTips || t.tips),
      asArray(t.setupCleanupShortcuts),
      asArray(t.observationPrompts).length ? asArray(t.observationPrompts) : asArray(t.observationFocus),
      asArray(t.documentationPrompts),
      asArray(t.materialSubstitutions || t.substitutions),
    ].filter((list) => list.length > 0);
    return requiredText.length >= 4 && requiredLists.length >= 3;
  }

  /**
   * True only when a published/usable printable resource is linked.
   * Draft / archived resources and printable ideas never count.
   * Pass options.resources (curriculum resource catalog) so status can be resolved.
   * Bare IDs with no catalog entry are treated as unknown/incomplete (not usable).
   */
  function hasLinkedPrintable(plan, week, optionsOrResources) {
    const options = normalizeOptions(optionsOrResources);
    const catalog = resourceCatalogFromOptions(options);
    const byId = new Map(catalog.map((r) => [text(r?.id), r]).filter(([id]) => id));
    const ids = linkedPrintableIds(plan, week);
    if (!ids.length) return false;
    // Require a catalog entry with published/featured status.
    // Without a match, the id may be a draft upload — never treat as print-ready.
    return ids.some((id) => isUsablePrintableResource(byId.get(id)));
  }

  function hasDraftOnlyPrintables(plan, week, optionsOrResources) {
    const options = normalizeOptions(optionsOrResources);
    const catalog = resourceCatalogFromOptions(options);
    const byId = new Map(catalog.map((r) => [text(r?.id), r]).filter(([id]) => id));
    const ids = linkedPrintableIds(plan, week);
    if (!ids.length) return false;
    if (hasLinkedPrintable(plan, week, options)) return false;
    return ids.some((id) => {
      const resource = byId.get(id);
      if (!resource) return true; // unresolved id — treat as not yet usable
      const status = text(resource.status).toLowerCase();
      return status === "draft" || !status || status === "archived";
    });
  }

  /**
   * Multi-dimension readiness scores for premium Teaching Kit quality.
   * Image briefs and printable ideas never count as finished assets.
   * Draft printables never raise print readiness.
   * Guidance for draft save — hard blockers live in quality-review / publish gate.
   */
  function computeReadinessScores(plan, activities, enrichmentDraft, optionsOrResources) {
    const options = normalizeOptions(optionsOrResources);
    const draft = enrichmentDraft && typeof enrichmentDraft === "object" ? enrichmentDraft : {};
    const draftActs = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
    const week = draft.week && typeof draft.week === "object" ? draft.week : {};
    const list = flattenLessonActivities(plan, activities);
    const books = asArray(week.books).length ? asArray(week.books) : asArray(plan?.books);
    const songs = asArray(week.songs).length ? asArray(week.songs) : asArray(plan?.songs);
    const toolkit = week.teacherToolkit && typeof week.teacherToolkit === "object"
      ? week.teacherToolkit
      : (plan?.teachingKit?.teacherToolkit || {});
    const printableLinked = hasLinkedPrintable(plan, week, options);
    const draftOnlyPrintables = hasDraftOnlyPrintables(plan, week, options);
    const materialsText = text(week.weeklyMaterials || plan?.weeklyMaterials);
    const materialsState = materialsReadinessState(materialsText);

    let setupImages = 0;
    let exampleImages = 0;
    let expectedSetupImages = 0;
    let expectedExampleImages = 0;
    let imageBriefsOnly = 0;
    let activityCompleteUnits = 0;
    let activitiesInProgress = 0;
    let tipUnits = 0;
    let depthUnits = 0;
    list.forEach((act) => {
      const key = text(act.id) || text(act.itemId);
      const patch = draftActs[key] || {};
      const view = activityEnrichmentView(act, patch);
      const slots = view.imageSlots || imageSlotsForRequirement(view.imageRequirement);
      const setupState = imageReadinessState(view.setupImageUrl, patch.imageBriefSetup || view.imageBriefSetup);
      const exampleState = imageReadinessState(view.exampleImageUrl, patch.imageBriefExample || view.imageBriefExample);
      if (slots.needsSetup) {
        expectedSetupImages += 1;
        if (setupState === "image_uploaded") setupImages += 1;
        else if (setupState === "image_brief_ready") imageBriefsOnly += 1;
      }
      if (slots.needsExample) {
        expectedExampleImages += 1;
        if (exampleState === "image_uploaded") exampleImages += 1;
        else if (exampleState === "image_brief_ready") imageBriefsOnly += 1;
      }
      tipUnits += view.teacherTips.length ? 1 : 0;
      const depth = (
        (meaningfulText(view.setup || act.setup, 4) ? 0.2 : 0)
        + (meaningfulText(view.steps || act.steps, 4) ? 0.2 : 0)
        + (view.observationPrompts.length ? 0.2 : 0)
        + (meaningfulText(view.adaptations || patch.adaptations, 4) ? 0.2 : 0)
        + (meaningfulText(view.extensions || patch.extensions, 3) ? 0.2 : 0)
      );
      depthUnits += depth;
      const status = activityStatus(act, patch);
      if (status === ACTIVITY_STATUS.complete) activityCompleteUnits += 1;
      else if (status === ACTIVITY_STATUS.in_progress) activitiesInProgress += 1;
    });
    const n = Math.max(1, list.length);
    const expectedImageSlots = Math.max(0, expectedSetupImages + expectedExampleImages);
    const filledImageSlots = setupImages + exampleImages;
    const imageReadiness = expectedImageSlots === 0
      ? 100
      : clampPercent((filledImageSlots / expectedImageSlots) * 100);
    const activityCompleteness = clampPercent((activityCompleteUnits / n) * 100);

    const weekdayFocusDays = ["monday", "tuesday", "wednesday", "thursday", "friday"].filter((day) => {
      const dayPlan = plan?.dailyPlans?.[day] || {};
      const focus = text(dayPlan.theme || dayPlan.focus || dayPlan.objectives);
      return focus && !isPlaceholderText(focus);
    });
    const weekdayCompleteness = clampPercent((weekdayFocusDays.length / 5) * 100);

    const completeBooks = books.filter(bookRecordComplete).length;
    const completeSongs = songs.filter(songRecordComplete).length;
    const resourceCompleteness = clampPercent((
      (books.length ? (completeBooks / books.length) : 0) * 35
      + (songs.length ? (completeSongs / songs.length) : 0) * 35
      + (printableLinked ? 30 : 0)
    ));
    // Draft-only / idea-only printables never reach print-ready.
    const printReadiness = printableLinked
      ? 100
      : (draftOnlyPrintables || asArray(week.printableIdeas).length ? 15 : 0);

    const materialsReady = materialsState === "complete";
    const structural = clampPercent((
      (text(plan?.title) ? 10 : 0)
      + (text(plan?.age) ? 8 : 0)
      + (text(plan?.theme) ? 8 : 0)
      + (meaningfulText(week.weeklyOverview || plan?.weeklyOverview, 12) ? 14 : 0)
      + (meaningfulText(week.objectives || plan?.objectives, 8) ? 14 : 0)
      + (text(plan?.vocabularyWords) ? 10 : 0)
      + (materialsReady ? 10 : (materialsState === "needs_improvement" ? 4 : 0))
      + (text(week.familyConnection || plan?.familyConnection) ? 8 : 0)
      + (text(week.teacherPreparation) || asArray(toolkit.prepChecklist).length ? 9 : 0)
      + (toolkitRecordComplete(toolkit, week) ? 9 : 0)
    ));

    const educational = clampPercent((
      (tipUnits / n) * 25
      + (depthUnits / n) * 45
      + (completeBooks ? 15 : (books.length ? 5 : 0))
      + (completeSongs ? 15 : (songs.length ? 5 : 0))
    ));

    // Structural text fill only — NEVER treat image briefs / printable ideas as assets.
    const structuralCompletionPercent = clampPercent((
      structural * 0.35
      + activityCompleteness * 0.2
      + weekdayCompleteness * 0.15
      + educational * 0.15
      + resourceCompleteness * 0.15
    ));
    // Premium readiness requires real images + published printables + complete resources.
    // Cap below Publish Ready when activities are still In Progress, materials are weak,
    // books lack discussion questions, or only draft/idea printables / image briefs exist.
    let premiumReadinessPercent = clampPercent((
      structural * 0.2
      + activityCompleteness * 0.15
      + weekdayCompleteness * 0.1
      + educational * 0.15
      + imageReadiness * 0.2
      + printReadiness * 0.1
      + resourceCompleteness * 0.1
    ));
    const incompleteBooks = Math.max(0, books.length - completeBooks);
    if (
      activitiesInProgress > 0
      || activityCompleteUnits < list.length
      || imageBriefsOnly > 0
      || setupImages < expectedSetupImages
      || exampleImages < expectedExampleImages
      || !printableLinked
      || incompleteBooks > 0
      || materialsState !== "complete"
    ) {
      premiumReadinessPercent = Math.min(premiumReadinessPercent, 89);
    }

    return {
      structuralCompleteness: structural,
      educationalQuality: educational,
      activityCompleteness,
      weekdayCompleteness,
      resourceCompleteness,
      imageReadiness,
      printReadiness,
      structuralCompletionPercent,
      premiumReadinessPercent,
      // Back-compat: completionPercent is structural/text progress only (not publish gate).
      completionPercent: structuralCompletionPercent,
      setupImages,
      exampleImages,
      expectedSetupImages,
      expectedExampleImages,
      expectedImageSlots,
      imageBriefsOnly,
      activitiesInProgress,
      incompleteActivities: Math.max(0, list.length - activityCompleteUnits),
      completeBooks,
      completeSongs,
      bookCount: books.length,
      songCount: songs.length,
      incompleteBooks,
      hasLinkedPrintable: printableLinked,
      hasDraftOnlyPrintables: draftOnlyPrintables,
      hasPrintableIdeasOnly: !printableLinked && !draftOnlyPrintables && asArray(week.printableIdeas).length > 0,
      materialsState,
      materialsItemCount: materialsItemCount(materialsText),
      toolkitComplete: toolkitRecordComplete(toolkit, week),
      weekdayFocusDays,
    };
  }

  /**
   * Structural/text completion % (not premium publish readiness).
   * Image briefs and printable ideas do NOT inflate this toward Publish Ready.
   */
  function computeCompletionPercent(plan, activities, enrichmentDraft, optionsOrResources) {
    return computeReadinessScores(plan, activities, enrichmentDraft, optionsOrResources).completionPercent;
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
   * Curriculum dashboard triage stages (Phase 7).
   * Legacy → In Progress → Needs Review → Ready → Published → Archived
   * Ready/Published require full weekday coverage — Monday-only never reads Ready/100%.
   */
  function dashboardStageFromSummary(summary) {
    if (!summary || typeof summary !== "object") return "Legacy";
    const status = loadStatusApi();
    const coverageComplete = summary.weekdayCoverageComplete != null
      ? Boolean(summary.weekdayCoverageComplete)
      : (summary.weekdayCoverage
        ? Boolean(summary.weekdayCoverage.coverageComplete)
        : true); // back-compat when callers omit coverage
    if (status?.workflowStatusFromParts) {
      const qualityBlocked = Boolean(summary.blocksPublish)
        || text(summary.publishReadiness).toLowerCase() === "blocked"
        || /^blocked$/i.test(text(summary.blocking || summary.libraryStatus));
      return status.workflowStatusFromParts({
        lessonStatus: summary.lessonStatus || (summary.isPublished ? "published" : "draft"),
        enrichmentFillPercent: summary.completionPercent,
        premiumReadinessPercent: summary.premiumReadinessPercent,
        hasEnrichmentDraft: summary.hasEnrichmentDraft,
        coverageComplete,
        needsReview: summary.needsReview || qualityBlocked,
        publishReadiness: qualityBlocked ? "blocked" : summary.publishReadiness,
        hasAiProposal: summary.hasAiProposal,
        qualityBlocked,
        blocking: summary.blocking || summary.libraryStatus || "",
      });
    }
    const percent = clampPercent(summary.completionPercent);
    const hasDraft = Boolean(summary.hasEnrichmentDraft);
    const cms = text(summary.lessonStatus).toLowerCase();
    if (cms === "archived") return "Archived";
    if (percent >= 90 && Boolean(summary.isPublished) && !hasDraft && coverageComplete) return "Published";
    if (percent >= 90 && !hasDraft && coverageComplete) return "Ready";
    if (summary.needsReview || hasDraft || (percent >= 90 && !coverageComplete)) return "Needs Review";
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
        imageRequirement: view.imageRequirement || act.imageRequirement || "",
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
            imageRequirement: match.imageRequirement || item.imageRequirement || "",
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
    // Only publish draft objectives when explicitly owned; blank never overwrites legacy.
    if (week.fieldOwnership?.objectives === true && text(week.objectives)) {
      nextPlan.objectives = text(week.objectives);
    }
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
   * Pass options.resources so draft printables are not treated as published.
   * Pass options.qualityReport (or allow attach) so workflow matches Library Health / publish gate.
   */
  function buildUpgradeSummary(plan, activities, enrichmentDraft, optionsOrResources) {
    const options = normalizeOptions(optionsOrResources);
    const draft = enrichmentDraft && typeof enrichmentDraft === "object" ? enrichmentDraft : null;
    const draftActs = draft?.activities && typeof draft.activities === "object" ? draft.activities : {};
    const week = draft?.week && typeof draft.week === "object" ? draft.week : {};
    const list = flattenLessonActivities(plan, activities);
    const readiness = computeReadinessScores(plan, list, draft, options);
    const percent = readiness.completionPercent;
    const label = completenessLabelFromPercent(percent, null);

    let incompleteActivities = 0;
    let activitiesInProgress = 0;
    let missingSetupPhotos = 0;
    let missingExamplePhotos = 0;
    let missingTeacherTips = 0;
    let missingObservationPrompts = 0;
    let missingActivityObjectives = 0;
    let missingActivityMaterials = 0;
    let imageBriefsNotImages = 0;

    list.forEach((act) => {
      const key = activityKey(act);
      const patch = draftActs[key];
      const status = activityStatus(act, patch);
      if (status !== ACTIVITY_STATUS.complete) incompleteActivities += 1;
      if (status === ACTIVITY_STATUS.in_progress) activitiesInProgress += 1;
      const view = activityEnrichmentView(act, patch);
      const slots = view.imageSlots || imageSlotsForRequirement(view.imageRequirement);
      // Only required image slots create missing-photo guidance / blockers.
      if (slots.needsSetup && !view.setupImageUrl) missingSetupPhotos += 1;
      if (slots.needsExample && !view.exampleImageUrl) missingExamplePhotos += 1;
      if (slots.needsSetup && !view.setupImageUrl && text(patch?.imageBriefSetup || view.imageBriefSetup)) {
        imageBriefsNotImages += 1;
      }
      if (slots.needsExample && !view.exampleImageUrl && text(patch?.imageBriefExample || view.imageBriefExample)) {
        imageBriefsNotImages += 1;
      }
      if (!view.teacherTips.length) missingTeacherTips += 1;
      if (!hasObservationPrompts(act, patch)) missingObservationPrompts += 1;
      if (!hasActivityObjective(act, patch)) missingActivityObjectives += 1;
      if (!hasActivityMaterials(act, patch)) missingActivityMaterials += 1;
    });

    const missingFamilyConnection = !(text(plan?.familyConnection) || text(week.familyConnection));
    // Draft printables / ideas alone never clear the printable gap — need published resources.
    const missingPrintables = !hasLinkedPrintable(plan, week, options);
    const draftOnlyPrintables = hasDraftOnlyPrintables(plan, week, options);
    const missingBooks = readiness.completeBooks === 0;
    const missingSongs = readiness.completeSongs === 0;
    const missingTeacherToolkit = !readiness.toolkitComplete;
    const materialsState = readiness.materialsState || materialsReadinessState(week.weeklyMaterials || plan?.weeklyMaterials);
    const weakMaterials = materialsState === "needs_improvement";
    const aiReady = Boolean(text(plan?.title)) && (
      list.length > 0 || Boolean(text(plan?.weeklyOverview) || text(week.weeklyOverview))
    );
    const missingVocabulary = !text(plan?.vocabularyWords).split(/[,;\n]+/).map(text).filter(Boolean).length;
    const missingWeekObjectives = !text(plan?.objectives);
    const missingWeekMaterials = !text(plan?.weeklyMaterials) && !text(week.weeklyMaterials);

    const lessonStatus = text(plan?.status).toLowerCase() || "draft";
    const isPublished = ["published", "featured"].includes(lessonStatus);
    // Require real draft content — bare updatedAt/lastEditedBy alone is not a pending draft
    // (prevents "Draft Pending" after a timestamp-only / empty overwrite that lost tips).
    const hasEnrichmentDraft = Boolean(
      draft
      && (
        Object.keys(draftActs).length
        || text(week.familyConnection)
        || asArray(week.milestones).length
        || asArray(week.printableIds).length
        || draft.previewReady === true
        || Object.keys(week).some((key) => {
          if (["familyConnection", "milestones", "printableIds"].includes(key)) return false;
          const value = week[key];
          if (value == null) return false;
          if (typeof value === "string") return Boolean(text(value));
          if (Array.isArray(value)) return value.length > 0;
          if (typeof value === "object") return Object.keys(value).length > 0;
          return true;
        })
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

    const status = loadStatusApi();
    const weekdayCoverage = status?.measureWeekdayCoverage
      ? status.measureWeekdayCoverage(plan, list)
      : {
        filled: 0,
        total: 5,
        coverageComplete: true,
        label: "weekday coverage unavailable",
        percent: 0,
      };
    const needsReview = (isPublished && (hasEnrichmentDraft || readiness.premiumReadinessPercent < 90))
      || (percent >= 90 && !weekdayCoverage.coverageComplete)
      || missingSetupPhotos > 0
      || missingExamplePhotos > 0
      || missingPrintables
      || draftOnlyPrintables
      || missingBooks
      || missingSongs
      || incompleteActivities > 0
      || weakMaterials
      || materialsState === "missing"
      || (readiness.incompleteBooks || 0) > 0
      || !readiness.toolkitComplete;
    const missingExamples = missingSetupPhotos > 0 || missingExamplePhotos > 0;
    const contentCompletionPercent = weekdayCoverage.coverageComplete
      ? percent
      : Math.min(percent, clampPercent((weekdayCoverage.filled / 5) * 100 + (percent * 0.15)));
    const baseSummary = {
      completionPercent: percent,
      enrichmentFillPercent: percent,
      contentCompletionPercent,
      premiumReadinessPercent: readiness.premiumReadinessPercent,
      readinessScores: readiness,
      completenessLabel: label,
      weekdayCoverage,
      weekdayCoverageComplete: Boolean(weekdayCoverage.coverageComplete),
      weekdayCoverageLabel: weekdayCoverage.label || "",
      activityCount: list.length,
      incompleteActivities,
      activitiesInProgress,
      missingSetupPhotos,
      missingExamplePhotos,
      imageBriefsNotImages,
      missingTeacherTips,
      missingObservationPrompts,
      missingFamilyConnection,
      missingPrintables,
      hasDraftOnlyPrintables: draftOnlyPrintables,
      hasPrintableIdeasOnly: readiness.hasPrintableIdeasOnly,
      missingBooks,
      missingSongs,
      incompleteBooks: Math.max(0, readiness.bookCount - readiness.completeBooks),
      incompleteSongs: Math.max(0, readiness.songCount - readiness.completeSongs),
      missingTeacherToolkit,
      missingVocabulary,
      missingLearningObjectives: missingWeekObjectives || missingActivityObjectives > 0,
      missingWeekObjectives,
      missingActivityObjectives,
      missingMaterials: missingWeekMaterials || missingActivityMaterials > 0,
      weakMaterials,
      materialsState,
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
      aiReady,
    };

    // Attach the same quality report Library Health / publish dialog use (avoid recursion).
    let qualityReport = options.qualityReport || null;
    if (!qualityReport && !options.skipQualityAttach) {
      const qr = loadQualityApi();
      if (qr?.buildQualityReport) {
        try {
          qualityReport = qr.buildQualityReport(plan, list, draft, {
            resources: options.resources,
            ignoredCodes: options.ignoredCodes || week.qualityReviewIgnored || [],
            skipUpgradeSummary: true,
          });
        } catch (_error) {
          qualityReport = null;
        }
      }
    }
    if (qualityReport) {
      baseSummary.qualityReport = qualityReport;
      baseSummary.publishReadiness = qualityReport.publishReadiness;
      baseSummary.publishReadinessLabel = qualityReport.publishReadinessLabel;
      baseSummary.blocksPublish = Boolean(qualityReport.blocksPublish);
      baseSummary.blockingIssues = asArray(qualityReport.blockingIssues);
      baseSummary.overallLabel = qualityReport.overallLabel;
      baseSummary.qualityScore = qualityReport.overallScore;
      if (qualityReport.premiumReadinessPercent != null) {
        baseSummary.premiumReadinessPercent = clampPercent(qualityReport.premiumReadinessPercent);
      }
    }

    baseSummary.dashboardStage = dashboardStageFromSummary(baseSummary);
    baseSummary.dashboardStageSlug = dashboardStageSlug(baseSummary.dashboardStage);
    if (status?.buildLessonStatus) {
      baseSummary.canonicalStatus = status.buildLessonStatus({
        plan,
        activities: list,
        enrichmentDraft: draft,
        upgradeSummary: baseSummary,
        qualityReport,
      });
      // Prefer canonical workflow everywhere — never Publish Ready while Blocked.
      if (baseSummary.canonicalStatus?.workflow) {
        baseSummary.dashboardStage = baseSummary.canonicalStatus.workflow;
        baseSummary.dashboardStageSlug = dashboardStageSlug(baseSummary.dashboardStage);
      }
      baseSummary.blocking = baseSummary.canonicalStatus.blocking;
      baseSummary.libraryStatus = baseSummary.canonicalStatus.blocking;
    }
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
          if (field === "objectives") {
            // Accepted AI suggestion claims draft ownership (never silent replace on open).
            if (!draft.week.fieldOwnership || typeof draft.week.fieldOwnership !== "object") {
              draft.week.fieldOwnership = {};
            }
            draft.week.fieldOwnership.objectives = true;
          }
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
    IMAGE_REQUIREMENT,
    IMAGE_REQUIREMENT_LABELS,
    IMAGE_REQUIREMENT_VALUES,
    flattenLessonActivities,
    activityEnrichmentView,
    activityStatus,
    activityStatusLabel,
    firstIncompleteActivityIndex,
    normalizeImageRequirement,
    imageRequirementLabel,
    defaultImageRequirementForActivity,
    resolveImageRequirement,
    imageSlotsForRequirement,
    activityImagesSatisfyRequirement,
    computeCompletionPercent,
    computeReadinessScores,
    imageReadinessState,
    bookRecordComplete,
    songRecordComplete,
    toolkitRecordComplete,
    hasLinkedPrintable,
    hasDraftOnlyPrintables,
    isUsablePrintableResource,
    materialsReadinessState,
    materialsItemCount,
    isPlaceholderText,
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
