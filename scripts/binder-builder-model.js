/**
 * Binder Builder — typed draft model.
 *
 * Drafts REFERENCE a source lesson and hold binder-only overrides/settings.
 * They never become the curriculum source of truth and must not mutate lessons.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHBinderBuilderModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** @typedef {"draft"|"ready"|"archived"} BinderDraftStatus */

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const WEEKDAY_LABELS = Object.freeze({
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  });

  const LEARNING_CENTER_KEYS = Object.freeze([
    "art",
    "sensory",
    "blocks",
    "dramaticPlay",
    "booksLiteracy",
    "fineMotor",
    "manipulatives",
    "scienceNature",
    "grossMotor",
    "outdoorPlay",
  ]);

  const LEARNING_CENTER_LABELS = Object.freeze({
    art: "Art",
    sensory: "Sensory",
    blocks: "Blocks",
    dramaticPlay: "Dramatic Play",
    booksLiteracy: "Books / Literacy",
    fineMotor: "Fine Motor",
    manipulatives: "Manipulatives",
    scienceNature: "Science / Nature",
    grossMotor: "Gross Motor",
    outdoorPlay: "Outdoor Play",
  });

  const DEFAULT_WELCOME_COPY = [
    "This binder is organized by day so teaching feels calm and ready.",
    "Start each morning with the day divider, then follow the activity pages in order.",
    "Use prepared pieces and resources where they are marked as included.",
    "Scan QR codes for selected story or song resources when you want a digital boost.",
    "Activities may be repeated, shortened, extended, or adapted to children's needs.",
    "Everyday classroom supplies may still be helpful for some activities.",
  ].join("\n\n");

  const DEFAULT_DESCRIPTOR = "5-Day Ready-to-Teach Lesson Binder";

  /**
   * @returns {import('./binder-builder-model').BinderSectionSettings}
   */
  function defaultSectionSettings() {
    return {
      welcome: true,
      weekAtAGlance: true,
      dailyDividers: true,
      dailyPlans: true,
      books: true,
      songs: true,
      learningCenters: false,
      familyConnection: true,
      endOfWeek: true,
    };
  }

  function text(value, max = 8000) {
    const raw = String(value == null ? "" : value).trim();
    if (!raw) return "";
    return raw.length > max ? raw.slice(0, max) : raw;
  }

  function shortText(value, max = 240) {
    return text(value, max);
  }

  function id(prefix) {
    const rand = Math.random().toString(36).slice(2, 10);
    const stamp = Date.now().toString(36);
    return `${prefix}-${stamp}${rand}`;
  }

  function bool(value, fallback) {
    if (value === true) return true;
    if (value === false) return false;
    return fallback;
  }

  /**
   * @param {unknown} value
   * @returns {{ url: string, alt: string, source: string }}
   */
  function normalizeImageRef(value) {
    const entry = value && typeof value === "object" ? value : {};
    return {
      url: shortText(entry.url || entry.src || "", 500),
      alt: shortText(entry.alt || "", 240),
      source: shortText(entry.source || "", 40),
    };
  }

  /**
   * @param {unknown} value
   */
  function normalizePersonalization(value) {
    const entry = value && typeof value === "object" ? value : {};
    return {
      teacherName: shortText(entry.teacherName, 120),
      classroomName: shortText(entry.classroomName, 120),
      programName: shortText(entry.programName, 160),
      subtitle: shortText(entry.subtitle, 180),
    };
  }

  /**
   * @param {unknown} value
   */
  function normalizeSections(value) {
    const entry = value && typeof value === "object" ? value : {};
    const defaults = defaultSectionSettings();
    return {
      welcome: bool(entry.welcome, defaults.welcome),
      weekAtAGlance: bool(entry.weekAtAGlance, defaults.weekAtAGlance),
      dailyDividers: bool(entry.dailyDividers, defaults.dailyDividers),
      dailyPlans: bool(entry.dailyPlans, true),
      books: bool(entry.books, defaults.books),
      songs: bool(entry.songs, defaults.songs),
      learningCenters: bool(entry.learningCenters, defaults.learningCenters),
      familyConnection: bool(entry.familyConnection, defaults.familyConnection),
      endOfWeek: bool(entry.endOfWeek, defaults.endOfWeek),
    };
  }

  /**
   * @param {unknown} value
   * @param {string} dayKey
   */
  function normalizeActivity(value, dayKey) {
    const entry = value && typeof value === "object" ? value : {};
    const sourceItemId = shortText(entry.sourceItemId || entry.itemId, 160);
    if (!sourceItemId && !shortText(entry.title, 180)) return null;
    return {
      id: shortText(entry.id, 160) || id("bb-act"),
      sourceItemId,
      dayKey: WEEKDAYS.includes(dayKey) ? dayKey : shortText(entry.dayKey, 20),
      title: shortText(entry.title, 180),
      introductionOverride: text(entry.introductionOverride, 4000),
      whatWereDoingOverride: text(entry.whatWereDoingOverride, 4000),
      howToDoItOverride: text(entry.howToDoItOverride, 8000),
      learningOverride: text(entry.learningOverride, 4000),
      questionsOverride: text(entry.questionsOverride, 4000),
      supportOverride: text(entry.supportOverride, 4000),
      challengeOverride: text(entry.challengeOverride, 4000),
      safetyOverride: text(entry.safetyOverride, 2000),
      cleanupOverride: text(entry.cleanupOverride, 2000),
      includedResources: text(entry.includedResources, 2000),
      imageOverride: normalizeImageRef(entry.imageOverride),
      omit: entry.omit === true,
      useSource: entry.useSource !== false,
    };
  }

  /**
   * @param {unknown} value
   * @param {string} dayKey
   */
  function normalizeDay(value, dayKey) {
    const entry = value && typeof value === "object" ? value : {};
    const key = WEEKDAYS.includes(dayKey) ? dayKey : shortText(entry.dayKey, 20) || "monday";
    const activities = Array.isArray(entry.activities)
      ? entry.activities.map((item) => normalizeActivity(item, key)).filter(Boolean)
      : [];
    return {
      dayKey: key,
      titleOverride: shortText(entry.titleOverride || entry.focusOverride, 180),
      descriptionOverride: text(entry.descriptionOverride, 1000),
      imageOverride: normalizeImageRef(entry.imageOverride),
      activities,
    };
  }

  /**
   * @param {unknown} value
   */
  function normalizeBook(value) {
    const entry = value && typeof value === "object" ? value : {};
    const title = shortText(entry.title, 180);
    if (!title) return null;
    return {
      id: shortText(entry.id, 160) || id("bb-book"),
      sourceIndex: Number.isFinite(Number(entry.sourceIndex)) ? Number(entry.sourceIndex) : -1,
      title,
      author: shortText(entry.author, 120),
      connectionOverride: text(entry.connectionOverride, 2000),
      beforeReadingOverride: text(entry.beforeReadingOverride, 2000),
      afterReadingOverride: text(entry.afterReadingOverride, 2000),
      questionsOverride: text(entry.questionsOverride, 2000),
      alternativeBookOverride: shortText(entry.alternativeBookOverride, 180),
      resourceUrl: shortText(entry.resourceUrl, 500),
      qrEnabled: entry.qrEnabled !== false,
      omit: entry.omit === true,
      useSource: entry.useSource !== false,
    };
  }

  /**
   * @param {unknown} value
   */
  function normalizeSong(value) {
    const entry = value && typeof value === "object" ? value : {};
    const title = shortText(entry.title, 180);
    if (!title) return null;
    return {
      id: shortText(entry.id, 160) || id("bb-song"),
      sourceIndex: Number.isFinite(Number(entry.sourceIndex)) ? Number(entry.sourceIndex) : -1,
      title,
      whenToUseOverride: text(entry.whenToUseOverride, 500),
      movementsOverride: text(entry.movementsOverride, 4000),
      directionsOverride: text(entry.directionsOverride, 4000),
      resourceUrl: shortText(entry.resourceUrl || entry.audioUrl || entry.externalReference, 500),
      qrEnabled: entry.qrEnabled !== false,
      omit: entry.omit === true,
      useSource: entry.useSource !== false,
      allowPrintLyrics: entry.allowPrintLyrics === true,
      lyricsOverride: text(entry.lyricsOverride, 4000),
    };
  }

  /**
   * @param {unknown} value
   */
  function normalizeLearningCenters(value) {
    const entry = value && typeof value === "object" ? value : {};
    /** @type {Record<string, string>} */
    const centers = {};
    LEARNING_CENTER_KEYS.forEach((key) => {
      centers[key] = text(entry[key], 2000);
    });
    return centers;
  }

  /**
   * @param {unknown} value
   * @returns {object}
   */
  function normalizeBinderDraft(value) {
    const entry = value && typeof value === "object" ? value : {};
    const statusRaw = shortText(entry.status, 20).toLowerCase();
    const status = statusRaw === "ready" || statusRaw === "archived" ? statusRaw : "draft";
    const daysInput = entry.days && typeof entry.days === "object" ? entry.days : {};
    /** @type {Record<string, object>} */
    const days = {};
    WEEKDAYS.forEach((day) => {
      days[day] = normalizeDay(daysInput[day] || {}, day);
    });

    return {
      id: shortText(entry.id, 160) || id("bb-draft"),
      sourceLessonId: shortText(entry.sourceLessonId, 160),
      title: shortText(entry.title, 180) || "Untitled Binder",
      ageGroup: shortText(entry.ageGroup || entry.age, 40),
      theme: shortText(entry.theme, 120),
      coverImage: normalizeImageRef(entry.coverImage),
      coverDescriptor: shortText(entry.coverDescriptor, 120) || DEFAULT_DESCRIPTOR,
      welcomeCopy: text(entry.welcomeCopy, 6000) || DEFAULT_WELCOME_COPY,
      weekFocusOverride: text(entry.weekFocusOverride, 2000),
      developmentalFocusOverride: text(entry.developmentalFocusOverride, 2000),
      personalization: normalizePersonalization(entry.personalization),
      sections: normalizeSections(entry.sections),
      days,
      books: Array.isArray(entry.books) ? entry.books.map(normalizeBook).filter(Boolean) : [],
      songs: Array.isArray(entry.songs) ? entry.songs.map(normalizeSong).filter(Boolean) : [],
      learningCenters: normalizeLearningCenters(entry.learningCenters),
      familyConnectionOverride: text(entry.familyConnectionOverride, 4000),
      endOfWeekOverride: text(entry.endOfWeekOverride, 4000),
      skillsPracticedOverride: text(entry.skillsPracticedOverride, 2000),
      noticedOverride: text(entry.noticedOverride, 2000),
      notesAreaEnabled: entry.notesAreaEnabled !== false,
      status,
      createdAt: shortText(entry.createdAt, 80),
      savedAt: shortText(entry.savedAt || entry.updatedAt, 80),
      updatedAt: shortText(entry.updatedAt || entry.savedAt, 80),
    };
  }

  /**
   * Build initial day/activity stubs from a source lesson without copying materials.
   * @param {object|null|undefined} lesson
   */
  function activityStubsFromLesson(lesson) {
    /** @type {Record<string, object>} */
    const days = {};
    WEEKDAYS.forEach((day) => {
      const dayPlan = lesson?.dailyPlans?.[day] || {};
      const items = Array.isArray(dayPlan.items) ? dayPlan.items : [];
      days[day] = {
        dayKey: day,
        titleOverride: "",
        descriptionOverride: "",
        imageOverride: { url: "", alt: "", source: "" },
        activities: items.map((item) => ({
          id: id("bb-act"),
          sourceItemId: shortText(item.itemId || item.id, 160),
          dayKey: day,
          title: shortText(item.title, 180),
          introductionOverride: "",
          whatWereDoingOverride: "",
          howToDoItOverride: "",
          learningOverride: "",
          questionsOverride: "",
          supportOverride: "",
          challengeOverride: "",
          safetyOverride: "",
          cleanupOverride: "",
          includedResources: "",
          imageOverride: { url: "", alt: "", source: "" },
          omit: false,
          useSource: true,
        })).filter((item) => item.sourceItemId || item.title),
      };
    });
    return days;
  }

  /**
   * @param {object|null|undefined} lesson
   */
  function booksFromLesson(lesson) {
    const list = Array.isArray(lesson?.books) ? lesson.books : [];
    return list.map((book, index) => normalizeBook({
      sourceIndex: index,
      title: book.title,
      author: book.author,
      resourceUrl: book.resourceUrl || book.externalUrl || book.videoUrl || "",
      qrEnabled: true,
      useSource: true,
    })).filter(Boolean);
  }

  /**
   * @param {object|null|undefined} lesson
   */
  function songsFromLesson(lesson) {
    const list = Array.isArray(lesson?.songs) ? lesson.songs : [];
    return list.map((song, index) => normalizeSong({
      sourceIndex: index,
      title: song.title,
      resourceUrl: song.audioUrl || song.externalReference || song.resourceUrl || "",
      allowPrintLyrics: song.allowPrintLyrics === true,
      qrEnabled: true,
      useSource: true,
    })).filter(Boolean);
  }

  /**
   * Create a new binder draft that references a lesson (does not mutate it).
   * @param {object} lesson
   * @param {object} [options]
   */
  function createDraftFromLesson(lesson, options = {}) {
    const plan = lesson && typeof lesson === "object" ? lesson : {};
    const stamp = new Date().toISOString();
    const coverUrl = shortText(plan.coverImageUrl || plan.thumbnailUrl, 500);
    return normalizeBinderDraft({
      id: options.id || id("bb-draft"),
      sourceLessonId: shortText(plan.id, 160),
      title: shortText(plan.title, 180) || "Untitled Binder",
      ageGroup: shortText(plan.age, 40),
      theme: shortText(plan.theme, 120),
      coverImage: {
        url: coverUrl,
        alt: shortText(plan.coverImageAlt, 240) || shortText(plan.title, 180),
        source: shortText(plan.coverImageSource, 40),
      },
      coverDescriptor: DEFAULT_DESCRIPTOR,
      welcomeCopy: DEFAULT_WELCOME_COPY,
      personalization: options.personalization || {},
      sections: defaultSectionSettings(),
      days: activityStubsFromLesson(plan),
      books: booksFromLesson(plan),
      songs: songsFromLesson(plan),
      learningCenters: {},
      familyConnectionOverride: "",
      status: "draft",
      createdAt: stamp,
      savedAt: "",
      updatedAt: stamp,
    });
  }

  function createEmptyDraft() {
    return normalizeBinderDraft({
      title: "New Binder Draft",
      sections: defaultSectionSettings(),
      welcomeCopy: DEFAULT_WELCOME_COPY,
      coverDescriptor: DEFAULT_DESCRIPTOR,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Duplicate a draft with a new id (still references the same source lesson).
   * @param {object} draft
   */
  function duplicateDraft(draft) {
    const normalized = normalizeBinderDraft(draft);
    const stamp = new Date().toISOString();
    return normalizeBinderDraft({
      ...normalized,
      id: id("bb-draft"),
      title: `${normalized.title} (Copy)`.slice(0, 180),
      status: "draft",
      createdAt: stamp,
      savedAt: "",
      updatedAt: stamp,
    });
  }

  /**
   * @param {unknown} value
   */
  function normalizeBinderDraftStore(value) {
    const entry = value && typeof value === "object" ? value : {};
    const drafts = Array.isArray(entry.drafts)
      ? entry.drafts.map((item) => normalizeBinderDraft(item)).filter((d) => d.id)
      : [];
    return {
      drafts,
      updatedAt: shortText(entry.updatedAt, 80),
    };
  }

  return {
    WEEKDAYS,
    WEEKDAY_LABELS,
    LEARNING_CENTER_KEYS,
    LEARNING_CENTER_LABELS,
    DEFAULT_WELCOME_COPY,
    DEFAULT_DESCRIPTOR,
    defaultSectionSettings,
    normalizeBinderDraft,
    normalizeBinderDraftStore,
    createDraftFromLesson,
    createEmptyDraft,
    duplicateDraft,
    text,
    shortText,
  };
});
