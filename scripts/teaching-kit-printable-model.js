/**
 * Shared normalized printable Teaching Kit view-model.
 * Display/print only — never mutates stored curriculum.
 * Completeness follows real stored companion/plan data (no fabrication).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LLHTeachingKitPrintableModel = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const DAY_LABELS = Object.freeze({
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  });

  function presentApi() {
    return (typeof globalThis !== "undefined" && globalThis.LLHTeachingKitPresent)
      || (typeof require === "function" ? (() => { try { return require("./teaching-kit-present.js"); } catch (_e) { return null; } })()
      : null);
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function presentLabel(value, fallback) {
    const api = presentApi();
    return api?.presentLabel ? api.presentLabel(value, fallback) : (text(value) || text(fallback) || "");
  }

  function presentCopy(value, fallback) {
    const api = presentApi();
    if (api?.presentCopy) return api.presentCopy(value, fallback);
    return text(value) || text(fallback) || "";
  }

  function hasDisplayValue(value) {
    const api = presentApi();
    if (api?.hasDisplayValue) return api.hasDisplayValue(value);
    if (Array.isArray(value)) return value.some((item) => hasDisplayValue(item));
    return Boolean(text(value));
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asLines(value) {
    if (Array.isArray(value)) {
      return value.map((item) => presentCopy(typeof item === "string" ? item : item?.title || item?.label || item)).filter(Boolean);
    }
    const raw = presentCopy(value);
    if (!raw) return [];
    return raw.split(/\r?\n+/).map((line) => line.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  }

  function uniqueStrings(values, limit) {
    const seen = new Set();
    const out = [];
    asArray(values).forEach((value) => {
      const item = text(value);
      if (!item) return;
      const key = item.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return Number.isFinite(limit) ? out.slice(0, limit) : out;
  }

  function normalizeActivity(activity) {
    const entry = activity && typeof activity === "object" ? activity : {};
    const materials = asArray(entry.materials).map((item) => presentCopy(item)).filter(Boolean);
    const materialsText = presentCopy(entry.materialsText) || materials.join(" · ");
    return {
      id: text(entry.id),
      title: presentCopy(entry.title) || "Activity",
      category: presentLabel(entry.activityCategory || entry.category || entry.sectionId || "", ""),
      dayOfWeek: text(entry.dayOfWeek).toLowerCase(),
      dayLabel: DAY_LABELS[text(entry.dayOfWeek).toLowerCase()] || "",
      objective: presentCopy(entry.learningObjective || entry.objective),
      description: presentCopy(entry.description),
      materials,
      materialsText,
      setup: presentCopy(entry.setup),
      steps: presentCopy(entry.steps || entry.directions),
      teacherRole: presentCopy(entry.teacherRole || entry.teacherSupport),
      teacherPrompts: asArray(entry.teacherPrompts).map((prompt) => ({
        label: presentLabel(prompt?.label || "Prompt"),
        text: presentCopy(prompt?.text),
      })).filter((prompt) => prompt.text),
      learningGoals: asLines(entry.learningGoals),
      observationIdeas: asLines(entry.observationIdeas || entry.observationOpportunities),
      vocabulary: asLines(entry.vocabulary),
      extensions: presentCopy(entry.extensions),
      adaptations: presentCopy(entry.adaptations),
      ageModifications: presentCopy(entry.ageModifications),
      safetyNotes: presentCopy(entry.safetyNotes),
      cleanupTips: asLines(entry.cleanupTips),
      examplePhotoUrl: text(entry.examplePhotoUrl || entry.exampleImageUrl),
      exampleAlt: presentCopy(entry.exampleAlt || entry.examplePhotoAlt),
      setupPhotoUrl: text(entry.setupPhotoUrl || entry.setupImageUrl),
      setupAlt: presentCopy(entry.setupAlt || entry.setupPhotoAlt),
    };
  }

  function normalizeSong(song) {
    const entry = song && typeof song === "object" ? song : { title: song };
    const title = presentCopy(entry.title);
    if (!title) return null;
    const rights = presentApi()?.presentRightsStatus
      ? presentApi().presentRightsStatus(entry.rightsMode || entry.rights || "")
      : presentLabel(entry.rightsMode || entry.rights || "", "");
    const lyricsAllowed = entry.lyricsPrintable === true || /public domain|traditional|original/i.test(rights);
    return {
      title,
      notes: presentCopy(entry.notes || entry.teachingNotes || entry.howToUse),
      motions: presentCopy(entry.motions || entry.props),
      rights,
      lyrics: lyricsAllowed ? presentCopy(entry.lyrics) : "",
      lyricsPrintable: Boolean(lyricsAllowed && presentCopy(entry.lyrics)),
    };
  }

  function normalizeBook(book) {
    const entry = book && typeof book === "object" ? book : { title: book };
    const title = presentCopy(entry.title);
    if (!title) return null;
    return {
      title,
      author: presentCopy(entry.author),
      whyThisBook: presentCopy(entry.whyThisBook || entry.notes),
      readAloudQuestions: asLines(entry.readAloudQuestions || entry.afterReadingQuestions),
      extensionIdeas: asLines(entry.extensionIdeas || entry.extensions),
    };
  }

  function normalizePrintable(item) {
    const entry = item && typeof item === "object" ? item : {};
    const title = presentCopy(entry.title);
    if (!title) return null;
    return {
      id: text(entry.id),
      title,
      category: presentLabel(entry.resourceCategory || entry.category || "", "Printable"),
      fileName: text(entry.fileName),
      mimeType: text(entry.mimeType),
      pageCount: Number(entry.pageCount) || 0,
      printingDirections: presentCopy(entry.printingDirections || entry.notes || entry.description),
      previewUrl: text(entry.previewUrl || entry.thumbnailUrl || entry.coverImageUrl),
      usedInWeek: asArray(entry.usedInWeek).map((slot) => ({
        day: text(slot.day),
        dayLabel: presentCopy(slot.dayLabel) || DAY_LABELS[text(slot.day)] || presentLabel(slot.day, ""),
        moment: presentCopy(slot.moment),
      })),
      hasEmbeddedPages: false, // Never claim file pages are merged unless a future merger sets this.
    };
  }

  function resolveDayActivities(modelActivities, activityById) {
    return asArray(modelActivities).map((ref) => {
      if (!ref) return null;
      const id = text(typeof ref === "string" ? ref : ref.id);
      const full = (id && activityById.get(id)) || null;
      if (full) return full;
      const partial = typeof ref === "object" ? normalizeActivity(ref) : null;
      return partial && partial.title ? partial : null;
    }).filter(Boolean);
  }

  function dayFromCompanion(companion, day, plan, activityById) {
    const model = companion?.days?.[day] || {};
    const dayPlan = plan?.dailyPlans?.[day] || {};
    const dayActivities = resolveDayActivities(model.activities, activityById);
    return {
      day,
      dayLabel: DAY_LABELS[day],
      focus: presentCopy(model.focus || dayPlan.theme || dayPlan.objectives),
      objectives: presentCopy(dayPlan.objectives),
      circleTime: asLines(dayPlan.circleTime || model.transitions),
      invitationToPlay: presentCopy(dayPlan.invitationToPlay || dayPlan.sensory),
      sensory: presentCopy(dayPlan.sensory),
      fineMotor: presentCopy(dayPlan.fineMotor),
      grossMotor: presentCopy(dayPlan.grossMotor || dayPlan.outdoorPlay || model.outdoorPlay),
      outdoorPlay: presentCopy(dayPlan.outdoorPlay),
      art: presentCopy(dayPlan.art),
      stem: presentCopy(dayPlan.stem),
      smallGroup: presentCopy(dayPlan.smallGroup),
      schedule: asArray(model.schedule).map((slot) => ({
        time: text(slot.time),
        label: presentCopy(slot.label),
        kind: presentLabel(slot.kind || "", ""),
      })).filter((slot) => slot.label),
      activities: dayActivities,
      activityTitles: dayActivities.map((item) => item.title).filter(Boolean),
      books: asArray(model.books).map(normalizeBook).filter(Boolean),
      songs: asArray(model.songs).map(normalizeSong).filter(Boolean),
      materials: asLines(model.materials || dayPlan.materials),
      transitions: asLines(model.transitions),
      observations: asLines(model.observations || dayPlan.observations),
      parentMessage: presentCopy(model.parentMessage || dayPlan.familyConnection),
      adaptations: presentCopy(dayPlan.adaptations),
      safetyNotes: presentCopy(dayPlan.safetyNotes),
      vocabulary: asLines(model.vocabulary || dayPlan.vocabulary),
    };
  }

  function buildOverview(plan, companion) {
    const setup = companion?.mondayMorningSetup || {};
    const materialsModel = companion?.materialsModel || null;
    const masterMaterials = materialsModel?.master?.length
      ? materialsModel.master.map((item) => presentCopy(item.label || item)).filter(Boolean)
      : asArray(setup.materials).map((item) => presentCopy(item.label || item)).filter(Boolean);
    if (!masterMaterials.length) {
      asLines(plan?.weeklyMaterials).forEach((line) => masterMaterials.push(line));
    }
    return {
      weeklyOverview: presentCopy(plan?.weeklyOverview),
      learningObjectives: asLines(plan?.objectives || plan?.weeklyObjectives),
      learningDomains: asLines(plan?.learningDomains).map((item) => presentLabel(item, item)),
      vocabulary: asArray(companion?.vocabulary).map((word) => ({
        word: presentCopy(word.word || word),
        definition: presentCopy(word.definition),
        discussionIdea: presentCopy(word.discussionIdea),
      })).filter((word) => word.word),
      masterMaterials: uniqueStrings(masterMaterials, 80),
      teacherPrep: asArray(setup.prepTasks).map((task) => ({
        label: presentCopy(task.label),
        minutes: Number(task.minutes) || 0,
        detail: presentCopy(task.detail),
      })).filter((task) => task.label),
      estimatedPrepMinutes: Number(setup.estimatedPrepMinutes) || 0,
      safety: uniqueStrings([
        ...asLines(plan?.safetyNotes),
        ...asArray(setup.safetyNotes),
        ...WEEKDAYS.flatMap((day) => asLines(plan?.dailyPlans?.[day]?.safetyNotes)),
      ], 20),
      adaptations: presentCopy(plan?.adaptations),
      observationFocus: asLines(plan?.observationOpportunities),
      familyConnection: presentCopy(plan?.familyConnection || companion?.parentConnection?.readyToSendMessage),
    };
  }

  function buildToolkit(plan, companion, overview) {
    const setup = companion?.mondayMorningSetup || {};
    const toolkit = companion?.binder?.teacherToolkit || companion?.providerBinder?.teacherToolkit || {};
    return {
      mondayMorningSetup: {
        estimatedPrepMinutes: overview.estimatedPrepMinutes,
        materials: overview.masterMaterials,
        prepTasks: overview.teacherPrep,
        printChecklist: asArray(setup.printChecklist).map((item) => ({
          label: presentCopy(item.label),
          usedInWeek: asArray(item.usedInWeek).map((slot) => presentCopy(typeof slot === "string" ? slot : `${slot.dayLabel || slot.day || ""} · ${slot.moment || ""}`)).filter(Boolean),
        })).filter((item) => item.label),
        missingMaterials: asLines(setup.missingMaterials),
      },
      teachingTips: asLines(toolkit.teacherTips || toolkit.tips || plan?.teacherTips),
      cleanup: asLines(toolkit.cleanup || toolkit.cleanupTips),
      observationGuidance: asLines(toolkit.observationFocus || toolkit.observationPrompts || overview.observationFocus),
      adaptations: presentCopy(toolkit.adaptations || overview.adaptations),
      familyResources: presentCopy(toolkit.familyConnection || overview.familyConnection),
      notes: presentCopy(toolkit.notes || toolkit.teacherPreparation),
    };
  }

  function collectExampleImages(activities) {
    const images = [];
    asArray(activities).forEach((activity) => {
      if (activity.examplePhotoUrl) {
        images.push({
          url: activity.examplePhotoUrl,
          alt: activity.exampleAlt || `Example for ${activity.title}`,
          caption: `${activity.title} · Finished example`,
          kind: "example",
        });
      }
      if (activity.setupPhotoUrl) {
        images.push({
          url: activity.setupPhotoUrl,
          alt: activity.setupAlt || `Setup for ${activity.title}`,
          caption: `${activity.title} · Setup`,
          kind: "setup",
        });
      }
    });
    return images;
  }

  /**
   * Build normalized printable model from Teaching Kit payload (+ optional plan).
   * @param {object} kit Teaching Kit API payload (with companion)
   * @param {object} [plan] Optional curriculum plan for richer overview fields
   * @param {object} [options]
   */
  function buildPrintableTeachingKitModel(kit, plan, options = {}) {
    const companion = kit?.companion || null;
    if (!kit || kit.ok === false || kit.locked || !companion) {
      return {
        ok: false,
        reason: kit?.locked ? "locked" : "unavailable",
        capabilities: {},
        sections: [],
      };
    }

    const sourcePlan = plan && typeof plan === "object" ? plan : {};
    const removed = options.removedActivityIds && typeof options.removedActivityIds === "object"
      ? options.removedActivityIds
      : {};

    const activities = asArray(companion.activities)
      .filter((item) => item && !removed[item.id])
      .map(normalizeActivity);
    const activityById = new Map(activities.map((item) => [item.id, item]));

    const songs = asArray(companion.songs).map(normalizeSong).filter(Boolean);
    const books = asArray(companion.books).map(normalizeBook).filter(Boolean);
    const printables = asArray(companion.printables).map(normalizePrintable).filter(Boolean);
    const days = WEEKDAYS.map((day) => dayFromCompanion(companion, day, sourcePlan, activityById));
    const overview = buildOverview(sourcePlan, companion);
    const toolkit = buildToolkit(sourcePlan, companion, overview);
    const examples = collectExampleImages(activities);
    const duration = presentCopy(sourcePlan.duration || kit.duration || "");

    const capabilities = {
      overview: Boolean(
        overview.weeklyOverview
        || overview.learningObjectives.length
        || overview.learningDomains.length
        || overview.vocabulary.length
        || overview.masterMaterials.length
        || overview.teacherPrep.length
        || overview.safety.length
        || overview.adaptations
        || overview.observationFocus.length
        || overview.familyConnection
      ),
      weekAtAGlance: days.some((day) => (
        day.focus || day.circleTime.length || day.activities.length || day.books.length || day.songs.length
        || day.sensory || day.fineMotor || day.grossMotor || day.outdoorPlay || day.art || day.stem || day.smallGroup
      )),
      dailyPlans: days.some((day) => (
        day.focus || day.schedule.length || day.activities.length || day.books.length || day.songs.length
        || day.materials.length || day.observations.length || day.parentMessage
      )),
      activities: activities.length > 0,
      printables: printables.length > 0,
      songs: songs.length > 0,
      books: books.length > 0,
      examples: examples.length > 0,
      toolkit: Boolean(
        toolkit.mondayMorningSetup.materials.length
        || toolkit.mondayMorningSetup.prepTasks.length
        || toolkit.teachingTips.length
        || toolkit.cleanup.length
        || toolkit.observationGuidance.length
        || toolkit.adaptations
        || toolkit.familyResources
        || toolkit.notes
      ),
      teacherNotes: true, // empty planning pages are intentional printable worksheets
    };

    const sectionOrder = [
      { id: "cover", label: "Cover", available: true },
      { id: "toc", label: "Table of Contents", available: true },
      { id: "overview", label: "Overview", available: capabilities.overview },
      { id: "weekAtAGlance", label: "Week at a Glance", available: capabilities.weekAtAGlance },
      { id: "dailyPlans", label: "Daily Plans", available: capabilities.dailyPlans },
      { id: "activities", label: "Activity Cards", available: capabilities.activities },
      { id: "printables", label: "Printables", available: capabilities.printables },
      { id: "songs", label: "Songs", available: capabilities.songs },
      { id: "books", label: "Books", available: capabilities.books },
      { id: "examples", label: "Example Images", available: capabilities.examples },
      { id: "toolkit", label: "Teacher Toolkit", available: capabilities.toolkit },
      { id: "teacherNotes", label: "Teacher Notes / Planning", available: capabilities.teacherNotes },
    ];

    return {
      ok: true,
      reason: "ok",
      schemaVersion: 1,
      lessonPlanId: text(kit.lessonPlanId || sourcePlan.id),
      title: presentCopy(kit.title || sourcePlan.title) || "Teaching Kit",
      age: presentCopy(kit.age || sourcePlan.age),
      theme: presentCopy(kit.theme || sourcePlan.theme),
      duration,
      plan: text(kit.plan || sourcePlan.plan) === "Pro" ? "Pro" : "Free",
      coverImageUrl: text(kit.coverImageUrl || sourcePlan.coverImageUrl),
      coverImageAlt: presentCopy(kit.coverImageAlt || sourcePlan.coverImageAlt),
      completeness: text(kit.completeness) || "legacy_mapped",
      footerLabel: text(companion?.binder?.footerLabel) || `${presentCopy(kit.title) || "Teaching Kit"} · Little Learner Hub`,
      brand: "Little Learner Hub",
      overview,
      days,
      activities,
      songs,
      books,
      printables,
      examples,
      toolkit,
      capabilities,
      sections: sectionOrder.filter((section) => section.available),
      source: {
        hasCompanion: true,
        activityCount: activities.length,
        printableCount: printables.length,
        songCount: songs.length,
        bookCount: books.length,
        imageCount: examples.length,
      },
    };
  }

  return {
    WEEKDAYS,
    DAY_LABELS,
    buildPrintableTeachingKitModel,
    presentLabel,
    presentCopy,
    hasDisplayValue,
  };
});
