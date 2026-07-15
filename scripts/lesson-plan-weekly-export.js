/**
 * Rich weekly lesson-plan export helpers (PDF day shaping + field audit).
 * Browser: globalThis.LlhLessonWeeklyExport
 * Node: module.exports
 */
(function lessonPlanWeeklyExportModule() {
  "use strict";

  const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const DAY_LONG = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  };

  const ACTIVITY_SLOT_PREFS = [
    ["Sensory Play", "Sensory", "Art", "STEM/Discovery", "Open-Ended Exploration"],
    ["Fine Motor", "Literacy", "Dramatic Play"],
    ["Gross Motor", "Gross Motor & Movement", "Music & Movement", "Outdoor Play"],
  ];

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function asStringArray(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => cleanText(typeof entry === "string" ? entry : entry?.title || entry)).filter(Boolean);
    }
    const text = cleanText(value);
    if (!text) return [];
    return text.split(/\r?\n+|;\s+/).map((line) => line.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  }

  function compactText(value, maxChars = 260) {
    const clean = cleanText(value);
    if (!clean || clean.length <= maxChars) return clean;
    return `${clean.slice(0, maxChars - 1).trim()}…`;
  }

  function firstSentence(value, maxChars = 160) {
    const clean = cleanText(value);
    if (!clean) return "";
    const match = clean.match(/^(.+?[.!?])(?:\s|$)/);
    return compactText(match ? match[1] : clean, maxChars);
  }

  function formatBook(book) {
    if (!book) return "";
    if (typeof book === "string") return cleanText(book);
    const title = cleanText(book.title);
    if (!title) return "";
    const author = cleanText(book.author);
    return author ? `${title} by ${author}` : title;
  }

  function formatSong(song) {
    if (!song) return "";
    if (typeof song === "string") return cleanText(song);
    return cleanText(song.title);
  }

  function joinUnique(parts, separator = "; ") {
    const seen = new Set();
    const out = [];
    parts.forEach((part) => {
      const clean = cleanText(part);
      if (!clean) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(clean);
    });
    return out.join(separator);
  }

  function categoryMatches(category, prefs) {
    const value = cleanText(category).toLowerCase();
    return prefs.some((pref) => value === pref.toLowerCase() || value.includes(pref.toLowerCase()));
  }

  function isCircleCategory(category) {
    return categoryMatches(category, ["Circle Time", "Music & Movement"]);
  }

  function isOutdoorCategory(category) {
    return categoryMatches(category, ["Outdoor Play"]);
  }

  function shapeActivity(item) {
    if (!item || !cleanText(item.title)) return null;
    const learningGoals = asStringArray(item.learningGoals);
    const description = firstSentence(
      item.description || item.objective || learningGoals[0] || item.steps || "",
      180,
    );
    return {
      title: cleanText(item.title) || "Activity",
      category: cleanText(item.activityCategory) || "Activity",
      description,
      objective: cleanText(item.objective),
      materials: cleanText(item.materials),
      setup: cleanText(item.setup),
      steps: cleanText(item.steps || item.directions),
      teacherRole: cleanText(item.teacherRole),
      teacherLanguage: cleanText(item.teacherLanguage),
      learningGoals,
      observationOpportunities: cleanText(item.observationOpportunities),
      vocabulary: cleanText(item.vocabulary),
      extensions: cleanText(item.extensions),
      adaptations: cleanText(item.adaptations),
      safetyNotes: cleanText(item.safetyNotes),
      ageModifications: cleanText(item.ageModifications),
      domains: asStringArray(item.learningDomains),
      teacherNote: firstSentence(item.teacherRole || item.observationOpportunities || "", 120),
    };
  }

  function pickActivitySlots(items) {
    const remaining = items.map((item, index) => ({ item, index })).filter((entry) => entry.item);
    const used = new Set();
    const takePreferred = (prefs) => {
      const found = remaining.find((entry) => !used.has(entry.index) && categoryMatches(entry.item.category, prefs));
      if (!found) return null;
      used.add(found.index);
      return found.item;
    };
    const takeNext = () => {
      const found = remaining.find((entry) => !used.has(entry.index));
      if (!found) return null;
      used.add(found.index);
      return found.item;
    };
    return ACTIVITY_SLOT_PREFS.map((prefs) => takePreferred(prefs) || takeNext());
  }

  function buildTeacherNotesDetail(dayPlan, activitySlots, weeklyAdaptations) {
    const reminders = [];
    const learningGoals = [];
    const adaptations = [];
    const safety = [];

    asStringArray(dayPlan.observations).forEach((item) => reminders.push(item));
    asStringArray(dayPlan.transitions).forEach((item) => reminders.push(`Transition: ${item}`));
    if (cleanText(dayPlan.familyConnection)) {
      reminders.push(`Family: ${cleanText(dayPlan.familyConnection)}`);
    }

    activitySlots.filter(Boolean).forEach((activity) => {
      if (activity.teacherRole) reminders.push(firstSentence(activity.teacherRole, 140));
      if (activity.teacherLanguage) reminders.push(`Say: ${firstSentence(activity.teacherLanguage, 120)}`);
      activity.learningGoals.forEach((goal) => learningGoals.push(goal));
      if (activity.objective) learningGoals.push(firstSentence(activity.objective, 120));
      if (activity.adaptations) adaptations.push(activity.adaptations);
      if (activity.ageModifications) adaptations.push(activity.ageModifications);
      if (activity.safetyNotes) safety.push(activity.safetyNotes);
      if (activity.observationOpportunities) reminders.push(firstSentence(activity.observationOpportunities, 120));
    });

    if (cleanText(dayPlan.adaptations)) adaptations.push(cleanText(dayPlan.adaptations));
    if (cleanText(weeklyAdaptations)) adaptations.push(cleanText(weeklyAdaptations));
    if (cleanText(dayPlan.safetyNotes)) safety.push(cleanText(dayPlan.safetyNotes));
    if (cleanText(dayPlan.objectives)) {
      asStringArray(dayPlan.objectives).forEach((goal) => learningGoals.push(goal));
    }

    return {
      reminders: joinUnique(reminders, " · "),
      learningGoals: joinUnique(learningGoals, " · "),
      adaptations: joinUnique(adaptations, " · "),
      safetyNotes: joinUnique(safety, " · "),
      combined: joinUnique([
        ...reminders.slice(0, 4),
        learningGoals.length ? `Goals: ${learningGoals.slice(0, 3).join("; ")}` : "",
        adaptations.length ? `Adapt: ${adaptations.slice(0, 2).join("; ")}` : "",
        safety.length ? `Safety: ${safety.slice(0, 2).join("; ")}` : "",
      ], " · "),
    };
  }

  function buildRichWeeklyDays(plan) {
    const normalized = plan && typeof plan === "object" ? plan : {};
    const weeklyDomains = asStringArray(normalized.learningDomains);
    const weeklyBooks = Array.isArray(normalized.books) ? normalized.books : [];
    const weeklySongs = Array.isArray(normalized.songs) ? normalized.songs : [];
    const dailyPlans = normalized.dailyPlans && typeof normalized.dailyPlans === "object" ? normalized.dailyPlans : {};

    return WEEKDAYS.map((day, dayIndex) => {
      const dayPlan = dailyPlans[day] || {};
      const rawItems = Array.isArray(dayPlan.items) ? dayPlan.items : [];
      const shapedItems = rawItems.map(shapeActivity).filter(Boolean);

      const circleFromItems = shapedItems.filter((item) => isCircleCategory(item.category));
      const outdoorFromItems = shapedItems.filter((item) => isOutdoorCategory(item.category));
      const playItems = shapedItems.filter((item) => !isCircleCategory(item.category) && !isOutdoorCategory(item.category));

      const activitySlots = pickActivitySlots(playItems.length ? playItems : shapedItems);
      const activities = (playItems.length ? playItems : shapedItems).length
        ? (playItems.length ? playItems : shapedItems)
        : activitySlots.filter(Boolean);

      const daySongs = Array.isArray(dayPlan.songs) ? dayPlan.songs.map(formatSong).filter(Boolean) : [];
      const circleParts = [
        ...asStringArray(dayPlan.circleTime),
        ...circleFromItems.map((item) => joinUnique([item.title, item.description], " — ")),
        ...daySongs.map((song) => `Song: ${song}`),
      ];
      if (!circleParts.length && weeklySongs[dayIndex]) {
        circleParts.push(`Song: ${formatSong(weeklySongs[dayIndex])}`);
      }

      const outdoorParts = [
        cleanText(dayPlan.outdoorPlay),
        ...outdoorFromItems.map((item) => joinUnique([item.title, item.description], " — ")),
      ];

      const dayBooks = Array.isArray(dayPlan.books) ? dayPlan.books.map(formatBook).filter(Boolean) : [];
      const bookOfTheDay = dayBooks[0]
        || formatBook(weeklyBooks[dayIndex])
        || formatBook(weeklyBooks[0])
        || "";

      const dayMaterials = cleanText(dayPlan.materials);
      const activityMaterials = activities.map((item) => item.materials).filter(Boolean);
      const materialsNeeded = dayMaterials || joinUnique(activityMaterials, "; ");

      const dayDomains = asStringArray(dayPlan.learningDomains);
      const teacherNotesDetail = buildTeacherNotesDetail(dayPlan, activitySlots, normalized.adaptations);
      const teacherNotes = teacherNotesDetail.combined
        || firstSentence(dayPlan.observations || dayPlan.adaptations || dayPlan.familyConnection || dayPlan.outdoorPlay || "", 180)
        || firstSentence(activities[0]?.teacherRole || activities[0]?.observationOpportunities || "", 140);

      return {
        day,
        label: DAY_LONG[day],
        theme: cleanText(dayPlan.theme) || cleanText(normalized.theme),
        themeFocus: cleanText(dayPlan.theme)
          || firstSentence(dayPlan.objectives, 120)
          || cleanText(normalized.theme),
        domains: dayDomains.length ? dayDomains : weeklyDomains,
        objectives: cleanText(dayPlan.objectives),
        vocabulary: cleanText(dayPlan.vocabulary),
        circleTime: joinUnique(circleParts, " · "),
        outdoorPlay: joinUnique(outdoorParts, " · "),
        bookOfTheDay,
        books: dayBooks,
        songs: daySongs,
        materialsNeeded,
        materialsList: materialsNeeded,
        familyConnection: cleanText(dayPlan.familyConnection),
        transitions: asStringArray(dayPlan.transitions),
        observations: asStringArray(dayPlan.observations),
        adaptations: cleanText(dayPlan.adaptations),
        safetyNotes: cleanText(dayPlan.safetyNotes),
        teacherNotes,
        teacherNotesDetail,
        activitySlots,
        activities,
      };
    });
  }

  function buildWeeklySummary(plan) {
    const normalized = plan && typeof plan === "object" ? plan : {};
    return {
      title: cleanText(normalized.title) || "Weekly Lesson Plan",
      theme: cleanText(normalized.theme),
      age: cleanText(normalized.age) || "Preschool",
      learningDomains: asStringArray(normalized.learningDomains),
      weeklyOverview: cleanText(normalized.weeklyOverview),
      objectives: asStringArray(normalized.objectives),
      vocabularyWords: cleanText(normalized.vocabularyWords).replace(/\n+/g, ", "),
      weeklyMaterials: cleanText(normalized.weeklyMaterials),
      books: (Array.isArray(normalized.books) ? normalized.books : []).map(formatBook).filter(Boolean),
      songs: (Array.isArray(normalized.songs) ? normalized.songs : []).map(formatSong).filter(Boolean),
      familyConnection: cleanText(normalized.familyConnection),
      observationOpportunities: cleanText(normalized.observationOpportunities),
      adaptations: cleanText(normalized.adaptations),
    };
  }

  /**
   * Audit: lesson-plan / daily / activity fields vs what weekly export surfaces.
   * usedByExport = fields intentionally rendered in the rich weekly PDF/HTML path.
   */
  function auditLessonPlanExportFields() {
    const weeklyFields = [
      "title", "age", "theme", "learningDomains", "weeklyOverview", "objectives",
      "books", "songs", "weeklyMaterials", "vocabularyWords", "observationOpportunities",
      "adaptations", "familyConnection", "dailyPlans",
    ];
    const dailyFields = [
      "theme", "objectives", "learningDomains", "materials", "vocabulary", "books", "songs",
      "circleTime", "transitions", "outdoorPlay", "familyConnection", "observations",
      "adaptations", "safetyNotes", "items",
    ];
    const activityFields = [
      "activityCategory", "title", "objective", "description", "learningDomains", "materials",
      "setup", "steps", "teacherRole", "teacherLanguage", "learningGoals",
      "observationOpportunities", "vocabulary", "extensions", "adaptations", "safetyNotes",
      "ageModifications",
    ];
    const usedWeekly = new Set([
      "title", "age", "theme", "learningDomains", "weeklyOverview", "objectives",
      "books", "songs", "weeklyMaterials", "vocabularyWords", "observationOpportunities",
      "adaptations", "familyConnection", "dailyPlans",
    ]);
    const usedDaily = new Set([
      "theme", "objectives", "learningDomains", "materials", "vocabulary", "books", "songs",
      "circleTime", "transitions", "outdoorPlay", "familyConnection", "observations",
      "adaptations", "safetyNotes", "items",
    ]);
    const usedActivity = new Set([
      "activityCategory", "title", "objective", "description", "learningDomains", "materials",
      "teacherRole", "teacherLanguage", "learningGoals", "observationOpportunities",
      "adaptations", "safetyNotes", "ageModifications",
    ]);
    // Intentionally condensed / omitted from dense weekly board to avoid clutter:
    // setup, steps, extensions, vocabulary (activity-level) — still available in Full Lesson Plan PDF.
    const condensedActivity = new Set(["setup", "steps", "extensions", "vocabulary"]);

    return {
      weekly: {
        all: weeklyFields,
        displayed: weeklyFields.filter((field) => usedWeekly.has(field)),
        missing: weeklyFields.filter((field) => !usedWeekly.has(field)),
      },
      daily: {
        all: dailyFields,
        displayed: dailyFields.filter((field) => usedDaily.has(field)),
        missing: dailyFields.filter((field) => !usedDaily.has(field)),
      },
      activity: {
        all: activityFields,
        displayed: activityFields.filter((field) => usedActivity.has(field)),
        condensedIntoNotesOrOmittedOnBoard: activityFields.filter((field) => condensedActivity.has(field)),
        missing: activityFields.filter((field) => !usedActivity.has(field) && !condensedActivity.has(field)),
      },
    };
  }

  const api = {
    WEEKDAYS,
    DAY_LONG,
    cleanText,
    asStringArray,
    compactText,
    firstSentence,
    formatBook,
    formatSong,
    joinUnique,
    shapeActivity,
    pickActivitySlots,
    buildTeacherNotesDetail,
    buildRichWeeklyDays,
    buildWeeklySummary,
    auditLessonPlanExportFields,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== "undefined") {
    globalThis.LlhLessonWeeklyExport = api;
  }
})();
