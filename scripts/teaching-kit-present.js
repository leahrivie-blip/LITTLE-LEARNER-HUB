/**
 * Teaching Kit presentation helpers — display-only humanization.
 * Never rewrite stored curriculum values; format for UI/print only.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LLHTeachingKitPresent = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LABEL_MAP = Object.freeze({
    copyrighted_title_only: "Copyrighted title only",
    copyrighted: "Copyrighted",
    title_only: "Title only",
    "title-only": "Title only",
    public_domain: "Public domain",
    traditional: "Traditional / public domain",
    original: "Original",
    unspecified: "Rights not specified",
    week_binder: "Weekly Teaching Kit",
    today_pack: "Today’s classroom pack",
    monday_setup_pack: "Monday Morning Setup pack",
    family_pack: "Family pack",
    ACTIVITY_NAME: "Activity",
    AGE_GROUP: "Age group",
    AGE_MODIFICATIONS: "Age adaptations",
    OBSERVATION_OPPORTUNITIES: "Observation opportunities",
    LEARNING_OBJECTIVES: "Learning objectives",
    LEARNING_GOALS: "Learning goals",
    LEARNING_DOMAINS: "Learning domains",
    TEACHER_ROLE: "Teacher role",
    TEACHER_LANGUAGE: "Teacher language",
    TEACHER_TIPS: "Teacher tips",
    TEACHER_PROMPTS: "Teacher prompts",
    FAMILY_CONNECTION: "Family connection",
    WEEKLY_OVERVIEW: "Weekly overview",
    WEEKLY_MATERIALS: "Materials list",
    WEEKLY_OBJECTIVES: "Learning objectives",
    VOCABULARY: "Vocabulary",
    VOCABULARY_WORDS: "Vocabulary",
    SAFETY_NOTES: "Safety notes",
    DAILY_THEME: "Daily theme",
    DAILY_OBJECTIVES: "Daily objectives",
    DAILY_VOCABULARY: "Daily vocabulary",
    DAILY_MATERIALS: "Daily materials",
    DAILY_LEARNING_DOMAINS: "Daily learning domains",
    DAILY_OBSERVATIONS: "Observation opportunities",
    DAILY_ADAPTATIONS: "Adaptations",
    CIRCLE_TIME: "Circle time",
    OUTDOOR_PLAY: "Outdoor play",
    INDOOR_ALTERNATIVES: "Indoor alternatives",
    OUTDOOR_ALTERNATIVES: "Outdoor alternatives",
    CATEGORY: "Category",
    OBJECTIVE: "Objective",
    DESCRIPTION: "Description",
    MATERIALS: "Materials",
    SETUP: "Setup",
    DIRECTIONS: "Directions",
    EXTENSIONS: "Extensions",
    ADAPTATIONS: "Adaptations",
    BOOKS: "Books",
    SONGS: "Songs",
    TITLE: "Title",
    THEME: "Theme",
    PLAN: "Access",
    STATUS: "Status",
    parent_message: "Family message",
    parent_connection: "Family connection",
    activity: "Activity",
    book: "Book",
    song: "Song",
    printable: "Printable",
    circle: "Circle time",
    circle_time: "Circle time",
    fine_motor: "Fine motor",
    gross_motor: "Gross motor",
    sensory: "Sensory",
    stem: "STEM",
    art: "Art",
    outdoor: "Outdoor",
    small_group: "Small group",
    large_group: "Large group",
    literacy: "Literacy",
    math: "Math",
    dramatic_play: "Dramatic play",
    open_ended: "Open-ended exploration",
    "open-ended exploration": "Open-ended exploration",
    music_movement: "Music & movement",
    "music & movement": "Music & movement",
  });

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const DAY_LONG = Object.freeze({
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  });

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function titleCaseWords(value) {
    return text(value)
      .toLowerCase()
      .replace(/(^|[\s/_-])([a-z])/g, (_, sep, ch) => `${sep === "_" || sep === "/" || sep === "-" ? " " : sep}${ch.toUpperCase()}`)
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Humanize an enum/id/snake_case/SCREAMING_SNAKE token for customer UI/print.
   */
  function presentLabel(value, fallback) {
    const raw = text(value);
    if (!raw) return text(fallback) || "";
    const key = raw.toLowerCase();
    if (LABEL_MAP[raw]) return LABEL_MAP[raw];
    if (LABEL_MAP[key]) return LABEL_MAP[key];
    if (/^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(raw)) {
      return titleCaseWords(raw.replace(/_/g, " "));
    }
    if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(raw)) {
      return titleCaseWords(raw.replace(/_/g, " "));
    }
    if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(raw)) {
      return titleCaseWords(raw.replace(/-/g, " "));
    }
    return raw;
  }

  function presentRightsStatus(value) {
    const raw = text(value);
    if (!raw) return "";
    return presentLabel(raw, "Rights not specified");
  }

  function presentPresetLabel(presetId, fallbackLabel) {
    const mapped = presentLabel(presetId, "");
    if (mapped && mapped !== text(presetId)) return mapped;
    return text(fallbackLabel) || mapped || "Print pack";
  }

  function presentKind(value) {
    return presentLabel(value, "Item");
  }

  function hasDisplayValue(value) {
    if (value == null) return false;
    if (Array.isArray(value)) return value.some((item) => hasDisplayValue(item));
    if (typeof value === "object") {
      return Object.keys(value).some((key) => hasDisplayValue(value[key]));
    }
    const raw = text(value);
    if (!raw) return false;
    if (/^(none listed|n\/a|na|null|undefined|tbd|coming soon)$/i.test(raw)) return false;
    return true;
  }

  /** Skip unfinished / developer-facing copy in customer surfaces. */
  function isDeveloperFacingCopy(value) {
    const raw = text(value);
    if (!raw) return false;
    return /\b(TODO|FIXME|lorem ipsum|placeholder|not implemented|ACTIVITY_NAME|AGE_MODIFICATIONS|OBSERVATION_OPPORTUNITIES)\b/i.test(raw)
      || /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(raw)
      || /^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(raw);
  }

  function presentCopy(value, fallback) {
    const raw = text(value);
    if (!raw || isDeveloperFacingCopy(raw)) return text(fallback) || "";
    return raw;
  }

  function asLines(value) {
    if (Array.isArray(value)) {
      return value.map((item) => text(typeof item === "string" ? item : item?.title || item)).filter(Boolean);
    }
    const raw = text(value);
    if (!raw) return [];
    return raw.split(/\r?\n+/).map((line) => line.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  }

  function pushBlank(lines) {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
  }

  function pushHeading(lines, label) {
    const heading = presentLabel(label, label);
    if (!heading) return;
    pushBlank(lines);
    lines.push(heading);
  }

  function pushSection(lines, label, value) {
    if (!hasDisplayValue(value)) return;
    const copy = Array.isArray(value)
      ? asLines(value).filter((line) => !isDeveloperFacingCopy(line))
      : presentCopy(value);
    if (Array.isArray(copy) ? !copy.length : !copy) return;
    pushHeading(lines, label);
    if (Array.isArray(copy)) {
      copy.forEach((line) => lines.push(`- ${line}`));
    } else {
      String(copy).split(/\r?\n/).forEach((line) => {
        const trimmed = line.trimEnd();
        if (trimmed.trim()) lines.push(trimmed);
      });
    }
  }

  function formatBookLine(book) {
    if (!book) return "";
    if (typeof book === "string") return presentCopy(book);
    const title = presentCopy(book.title);
    if (!title) return "";
    const author = presentCopy(book.author);
    const notes = presentCopy(book.notes);
    return [title, author ? `by ${author}` : "", notes].filter(Boolean).join(" — ");
  }

  function formatSongLine(song) {
    if (!song) return "";
    if (typeof song === "string") return presentCopy(song);
    const title = presentCopy(song.title);
    if (!title) return "";
    const rights = presentRightsStatus(song.rightsMode || song.rights || "");
    const notes = presentCopy(song.notes);
    return [title, rights ? `(${rights})` : "", notes].filter(Boolean).join(" — ");
  }

  /**
   * Teacher-facing activity block for Full Lesson Plan downloads.
   * Display-only — does not mutate stored curriculum fields.
   */
  function formatActivityForDownload(activity = {}) {
    const entry = activity && typeof activity === "object" ? activity : {};
    const lines = [];
    const title = presentCopy(entry.title) || "Activity";
    lines.push(title);
    const category = presentLabel(entry.activityCategory || entry.category || "", "");
    if (category) lines.push(`Category: ${category}`);
    pushSection(lines, "Objective", entry.objective || entry.learningObjective);
    pushSection(lines, "Description", entry.description);
    pushSection(lines, "Materials", entry.materials || entry.materialsText);
    pushSection(lines, "Setup", entry.setup);
    pushSection(lines, "Directions", entry.steps || entry.directions);
    pushSection(lines, "Teacher role", entry.teacherRole);
    pushSection(lines, "Teacher language", entry.teacherLanguage);
    pushSection(lines, "Learning goals", entry.learningGoals);
    pushSection(lines, "Observation opportunities", entry.observationOpportunities || entry.observationIdeas);
    pushSection(lines, "Vocabulary", entry.vocabulary);
    pushSection(lines, "Extensions", entry.extensions);
    pushSection(lines, "Adaptations", entry.adaptations);
    pushSection(lines, "Age adaptations", entry.ageModifications);
    pushSection(lines, "Safety notes", entry.safetyNotes);
    return lines.join("\n").trim();
  }

  /**
   * Teacher-facing Full Lesson Plan body for PDF/DOCX downloads.
   * Keeps import/export SCREAMING_SNAKE format untouched elsewhere.
   */
  function formatFullLessonPlanForDownload(plan = {}, options = {}) {
    const entry = plan && typeof plan === "object" ? plan : {};
    const lines = [];
    const title = presentCopy(options.title || entry.title) || "Full Lesson Plan";
    const theme = presentCopy(options.theme || entry.theme);
    const age = presentCopy(options.age || entry.age) || "Preschool";
    const weekOf = presentCopy(options.weekOfLabel || "");

    lines.push("Little Learner Hub · Full Lesson Plan");
    lines.push(title);
    if (theme) lines.push(`Theme: ${theme}`);
    lines.push(`Age group: ${age}`);
    if (weekOf) lines.push(`Week of: ${weekOf}`);

    const weeklyBits = [];
    pushSection(weeklyBits, "Weekly overview", entry.weeklyOverview);
    pushSection(weeklyBits, "Learning domains", entry.learningDomains);
    pushSection(weeklyBits, "Learning objectives", entry.objectives || entry.weeklyObjectives);
    pushSection(weeklyBits, "Materials list", entry.weeklyMaterials);
    pushSection(weeklyBits, "Vocabulary", entry.vocabularyWords);
    const books = (Array.isArray(entry.books) ? entry.books : []).map(formatBookLine).filter(Boolean);
    pushSection(weeklyBits, "Books", books);
    const songs = (Array.isArray(entry.songs) ? entry.songs : []).map(formatSongLine).filter(Boolean);
    pushSection(weeklyBits, "Songs", songs);
    pushSection(weeklyBits, "Family connection", entry.familyConnection);
    pushSection(weeklyBits, "Observation opportunities", entry.observationOpportunities);
    pushSection(weeklyBits, "Adaptations", entry.adaptations);
    if (weeklyBits.length) {
      pushHeading(lines, "Weekly Snapshot");
      weeklyBits.forEach((line) => lines.push(line));
    }

    WEEKDAYS.forEach((day) => {
      const dayPlan = entry.dailyPlans?.[day] || {};
      const items = Array.isArray(dayPlan.items) ? dayPlan.items : [];
      const dayBits = [];
      pushSection(dayBits, "Daily theme", dayPlan.theme);
      pushSection(dayBits, "Daily objectives", dayPlan.objectives);
      pushSection(dayBits, "Daily vocabulary", dayPlan.vocabulary);
      pushSection(dayBits, "Daily materials", dayPlan.materials);
      pushSection(dayBits, "Daily learning domains", dayPlan.learningDomains);
      pushSection(dayBits, "Circle time", dayPlan.circleTime);
      pushSection(dayBits, "Outdoor play", dayPlan.outdoorPlay);
      pushSection(dayBits, "Observation opportunities", dayPlan.observations);
      pushSection(dayBits, "Adaptations", dayPlan.adaptations);
      pushSection(dayBits, "Safety notes", dayPlan.safetyNotes);
      pushSection(dayBits, "Family connection", dayPlan.familyConnection);
      const dayBooks = (Array.isArray(dayPlan.books) ? dayPlan.books : []).map(formatBookLine).filter(Boolean);
      pushSection(dayBits, "Books", dayBooks);
      const daySongs = (Array.isArray(dayPlan.songs) ? dayPlan.songs : []).map(formatSongLine).filter(Boolean);
      pushSection(dayBits, "Songs", daySongs);
      items.forEach((item) => {
        const block = formatActivityForDownload(item);
        if (!block) return;
        pushBlank(dayBits);
        dayBits.push(block);
      });
      if (!dayBits.length && !items.length) return;
      pushBlank(lines);
      lines.push(DAY_LONG[day] || presentLabel(day));
      dayBits.forEach((line) => lines.push(line));
    });

    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    return `${lines.join("\n")}\n`;
  }

  return {
    LABEL_MAP,
    WEEKDAYS,
    DAY_LONG,
    presentLabel,
    presentRightsStatus,
    presentPresetLabel,
    presentKind,
    presentCopy,
    hasDisplayValue,
    isDeveloperFacingCopy,
    titleCaseWords,
    formatActivityForDownload,
    formatFullLessonPlanForDownload,
    formatBookLine,
    formatSongLine,
  };
});
