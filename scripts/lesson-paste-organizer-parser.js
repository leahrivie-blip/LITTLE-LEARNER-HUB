/**
 * Deterministic Paste and Organize — parser (no AI, no guessing).
 */
"use strict";

const manifest = require("./lesson-paste-organizer-manifest.js");
const weekKit = require("./curriculum-week-kit-paste.js");
const ageSafety = require("./curriculum-operator-guided-age-safety.js");

const ACTIVITY_TITLE_MAX = 180;

const RELATIVE_DATE_RE = /\b(next\s+(?:monday|tuesday|wednesday|thursday|friday|week|month)|this\s+week|tomorrow|later|soon)\b/i;
const ABSOLUTE_DATE_RE = /\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}|(?:monday|tuesday|wednesday|thursday|friday),?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}|week\s+of\s+(?:\d{1,2}\/\d{1,2}|\w+\s+\d{1,2}))/i;

function text(value, max = 8000) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeHeading(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[_/&]+/g, " ")
    .replace(/[:：#*]+$/g, "")
    .replace(/[:：]+$/g, "")
    .replace(/[–—−⸻]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function freezeAliasMap(entries) {
  const out = {};
  Object.keys(entries).forEach((key) => {
    out[normalizeHeading(key)] = entries[key];
  });
  return Object.freeze(out);
}

const GLOBAL_ALIASES = freezeAliasMap({
  lesson: "global.title",
  "lesson plan": "global.title",
  "lesson plan title": "global.title",
  title: "global.title",
  theme: "global.theme",
  age: "global.ageGroup",
  "age group": "global.ageGroup",
  "age band": "global.ageGroup",
  "recommended age": "global.ageGroup",
  week: "global.dateRange",
  "week of": "global.weekStartDate",
  objectives: "global.weeklyObjectives",
  "weekly objectives": "global.weeklyObjectives",
  "learning objectives": "global.weeklyObjectives",
  "weekly overview": "global.weeklyFocus",
  "week overview": "global.weeklyFocus",
  materials: "global.weeklyMaterials",
  "materials list": "global.weeklyMaterials",
  "weekly materials": "global.weeklyMaterials",
  supplies: "global.weeklyMaterials",
  "what you need": "global.weeklyMaterials",
  preparation: "global.weeklyPreparation",
  "teacher preparation": "global.weeklyPreparation",
  "weekly teacher preparation": "global.weeklyPreparation",
  "how to prepare": "global.weeklyPreparation",
  setup: "global.classroomSetup",
  safety: "global.weeklySafety",
  "safety notes": "global.weeklySafety",
  "weekly safety": "global.weeklySafety",
  cleanup: "global.cleanupSupplies",
  vocabulary: "global.weeklyVocabulary",
  "family connection": "global.familyConnection",
  "home connection": "global.familyConnection",
  books: "global.weeklyBooks",
  "weekly books": "kit.books",
  book: "book.record",
  songs: "global.weeklySongs",
  "weekly songs and movement": "kit.songs",
  "weekly songs": "kit.songs",
  song: "song.record",
  printables: "global.weeklyPrintables",
  "weekly printables": "kit.printables",
  "printable ideas": "kit.printables",
  printable: "printable.record",
  cover: "global.cover",
  "cover image": "global.cover",
  "teacher notes": "global.teacherNotes",
  notes: "global.teacherNotes",
});

const WEEKDAY_ALIASES = freezeAliasMap({
  monday: "monday",
  mon: "monday",
  tuesday: "tuesday",
  tues: "tuesday",
  tue: "tuesday",
  wednesday: "wednesday",
  wed: "wednesday",
  thursday: "thursday",
  thurs: "thursday",
  thu: "thursday",
  friday: "friday",
  fri: "friday",
});

const DAILY_ALIASES = freezeAliasMap({
  "daily focus": "dailyFocus",
  "daily objective": "dailyObjective",
  activity: "activity1",
  "activity 1": "activity1",
  "activity 2": "activity2",
  "activity 3": "activity3",
  "circle time": "circleTime",
  sensory: "sensoryActivity",
  art: "artActivity",
  science: "scienceActivity",
  math: "mathActivity",
  literacy: "literacyActivity",
  music: "musicMovement",
  movement: "musicMovement",
  outdoor: "outdoorActivity",
  indoor: "indoorActivity",
  observation: "observation",
  questions: "teacherQuestions",
  "teacher questions": "teacherQuestions",
  directions: "directions",
  "what children do": "directions",
  materials: "materials",
  preparation: "preparation",
  setup: "setup",
  safety: "safety",
  cleanup: "cleanup",
  printable: "printable",
  book: "book",
  song: "songOrFingerplay",
  "family connection": "familyConnection",
  "teacher notes": "teacherNotes",
});

const ACTIVITY_TYPE_ALIASES = freezeAliasMap({
  "circle time": "circleTime",
  sensory: "sensoryActivity",
  art: "artActivity",
  science: "scienceActivity",
  math: "mathActivity",
  literacy: "literacyActivity",
  music: "musicMovement",
  movement: "musicMovement",
  outdoor: "outdoorActivity",
  indoor: "indoorActivity",
});

function parseHeadingLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;
  const md = trimmed.match(/^#{1,6}\s+(.+?)\s*[:：]?\s*$/);
  const plain = trimmed.match(/^(.{2,120}?)\s*[:：]\s*(.*)$/);
  const labelRaw = md ? md[1] : (plain ? plain[1] : null);
  if (!labelRaw) return null;
  const inlineBody = plain && plain[2] != null ? plain[2] : "";
  return { labelRaw: labelRaw.trim(), inlineBody: inlineBody.trim(), normalized: normalizeHeading(labelRaw) };
}

const GLOBAL_LESSON_BOUNDARY = new Set(
  Object.entries(GLOBAL_ALIASES)
    .filter(([, path]) => String(path).startsWith("global.") || String(path).startsWith("kit."))
    .map(([key]) => normalizeHeading(key)),
);

function isGreedyKitSection(resolved) {
  const path = resolved?.path || "";
  return path === "kit.books" || path === "kit.songs" || path === "kit.printables";
}

function endsGreedyWeekdaySection(normalized, context) {
  if (WEEKDAY_ALIASES[normalized]) return true;
  const resolved = resolveFieldPath(normalized, context);
  if (!resolved) return false;
  if (resolved.path === "book.record" || resolved.path === "song.record" || resolved.path === "printable.record") {
    return true;
  }
  if (isGreedyKitSection(resolved)) return true;
  const path = String(resolved.path || "");
  if (path === "global.title" || path === "global.theme") return true;
  if (path === "global.ageGroup") return !context.day;
  if (path === "global.weeklyFocus" || path === "global.weeklyObjectives") return true;
  if (path === "global.familyConnection" || path === "global.teacherNotes" || path === "global.cover") return true;
  if (path === "global.weeklyMaterials") {
    return normalized.includes("weekly") || normalized === "materials list" || normalized === "supplies" || normalized === "what you need";
  }
  if (path === "global.weeklySafety") {
    return normalized.includes("weekly") || normalized === "safety notes";
  }
  if (path === "global.weeklyPreparation") {
    return normalized.includes("weekly") || normalized === "how to prepare";
  }
  return false;
}

function resolveFieldPath(normalized, context) {
  if (WEEKDAY_ALIASES[normalized]) {
    return { kind: "weekday", day: WEEKDAY_ALIASES[normalized] };
  }
  if (normalized === "activity name" || normalized === "activity title" || normalized === "activity") {
    return { kind: "structuredActivityBlock", anchor: normalized };
  }
  if (normalized === "book" || normalized === "books") {
    return { kind: "field", path: "book.record" };
  }
  if (normalized === "song" || normalized === "songs") {
    return { kind: "field", path: "song.record" };
  }
  if (normalized === "printable" || normalized === "printables") {
    return { kind: "field", path: "printable.record" };
  }
  if (normalized === "family connection" || normalized === "home connection") {
    return { kind: "field", path: "global.familyConnection" };
  }
  if (context.day && DAILY_ALIASES[normalized]) {
    const fieldId = DAILY_ALIASES[normalized];
    return { kind: "field", path: `daily.${context.day}.${fieldId}` };
  }
  if (ACTIVITY_TYPE_ALIASES[normalized] && context.day) {
    return { kind: "field", path: `daily.${context.day}.${ACTIVITY_TYPE_ALIASES[normalized]}` };
  }
  if (GLOBAL_ALIASES[normalized]) {
    return { kind: "field", path: GLOBAL_ALIASES[normalized] };
  }
  return null;
}

function splitSections(pastedText) {
  const lines = String(pastedText || "").replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let current = null;
  let activeContext = {};

  function pushCurrent() {
    if (current) sections.push(current);
    current = null;
  }

  lines.forEach((line, index) => {
    const heading = parseHeadingLine(line);
    if (heading && current?.greedy) {
      if (current.resolved?.kind === "weekday") {
        if (endsGreedyWeekdaySection(heading.normalized, activeContext)) {
          pushCurrent();
        } else {
          current.bodyLines.push(line);
          return;
        }
      } else if (isGreedyKitSection(current.resolved)) {
        if (WEEKDAY_ALIASES[heading.normalized] || GLOBAL_LESSON_BOUNDARY.has(heading.normalized)) {
          pushCurrent();
        } else {
          current.bodyLines.push(line);
          return;
        }
      }
    }
    if (heading) {
      const resolved = resolveFieldPath(heading.normalized, activeContext);
      pushCurrent();
      if (resolved?.kind === "weekday") {
        activeContext = { day: resolved.day, activityBlock: false };
      }
      current = {
        lineStart: index + 1,
        headingRaw: heading.labelRaw,
        headingNormalized: heading.normalized,
        inlineBody: heading.inlineBody,
        bodyLines: [],
        resolved,
        context: { ...activeContext },
        greedy: resolved?.kind === "weekday" || isGreedyKitSection(resolved),
      };
      return;
    }
    if (!current) {
      current = {
        lineStart: index + 1,
        headingRaw: "",
        headingNormalized: "",
        inlineBody: "",
        bodyLines: [line],
        resolved: null,
        context: { ...activeContext },
      };
    } else {
      current.bodyLines.push(line);
    }
  });
  pushCurrent();
  return sections;
}

function bodyText(section) {
  const parts = [];
  if (section.inlineBody) parts.push(section.inlineBody);
  parts.push(...section.bodyLines);
  return parts.join("\n").trim();
}

function normalizeActivityTitle(raw) {
  return String(raw == null ? "" : raw).replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

function inferAgeBand(ageGroupText) {
  const value = text(ageGroupText, 120).toLowerCase();
  if (!value) return "";
  if (/infant/.test(value)) return "infant";
  if (/toddler/.test(value)) return "toddler";
  if (/preschool|pre-k|prek/.test(value)) return "preschool";
  return "";
}

function structuredActivityMissingFields(record) {
  const missing = [];
  if (!text(record.objective, 20)) missing.push("objective");
  if (!text(record.materials, 10)) missing.push("materials");
  if (!text(record.steps, 20)) missing.push("directions");
  if (!text(record.safetyNotes, 10)) missing.push("safety");
  return missing;
}

function applyStructuredActivityRecord(values, day, slot, record, meta, titleIssues, activitiesReport) {
  const title = normalizeActivityTitle(record.title);
  if (!title) return;
  if (title.length > ACTIVITY_TITLE_MAX) {
    titleIssues.push({
      type: "activity_title_too_long",
      day,
      titlePreview: title.slice(0, 80),
      length: title.length,
      max: ACTIVITY_TITLE_MAX,
    });
  }
  assignValue(values, `daily.${day}.${slot}`, title, meta);
  if (text(record.objective)) assignValue(values, `daily.${day}.dailyObjective`, record.objective, meta);
  if (text(record.description)) assignValue(values, `daily.${day}.dailyFocus`, record.description, meta);
  if (multiline(record.materials)) assignValue(values, `daily.${day}.materials`, record.materials, meta);
  if (text(record.preparation)) assignValue(values, `daily.${day}.preparation`, record.preparation, meta);
  if (text(record.setup)) assignValue(values, `daily.${day}.setup`, record.setup, meta);
  if (multiline(record.steps)) assignValue(values, `daily.${day}.directions`, record.steps, meta);
  else if (text(record.description)) assignValue(values, `daily.${day}.directions`, record.description, meta);
  if (multiline(record.teacherLanguage)) assignValue(values, `daily.${day}.teacherQuestions`, record.teacherLanguage, meta);
  if (multiline(record.observationOpportunities)) assignValue(values, `daily.${day}.observation`, record.observationOpportunities, meta);
  if (multiline(record.safetyNotes)) assignValue(values, `daily.${day}.safety`, record.safetyNotes, meta);
  if (text(record.cleanupTips)) assignValue(values, `daily.${day}.cleanup`, record.cleanupTips, meta);
  if (text(record.indoorAlternatives)) assignValue(values, `daily.${day}.indoorAlternative`, record.indoorAlternatives, meta);
  if (text(record.outdoorAlternatives)) assignValue(values, `daily.${day}.outdoorAlternative`, record.outdoorAlternatives, meta);
  if (text(record.adaptations)) assignValue(values, `daily.${day}.supportModification`, record.adaptations, meta);
  if (text(record.extensions)) assignValue(values, `daily.${day}.challengeExtension`, record.extensions, meta);
  if (text(record.mixedAgeAdaptations)) assignValue(values, `daily.${day}.mixedAgeAdaptation`, record.mixedAgeAdaptations, meta);
  if (multiline(record.vocabulary)) assignValue(values, `daily.${day}.vocabulary`, record.vocabulary, meta);

  activitiesReport.push({
    title,
    weekday: day,
    slot,
    missingFields: structuredActivityMissingFields(record),
    fieldPaths: [
      `daily.${day}.${slot}`,
      `daily.${day}.dailyObjective`,
      `daily.${day}.materials`,
      `daily.${day}.directions`,
      `daily.${day}.safety`,
    ],
  });
}

function multiline(value) {
  return String(value == null ? "" : value).replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "").trim();
}

function weekdayBodyHasStructuredActivities(body) {
  const source = String(body || "");
  if (weekKit.hasExplicitActivityStart(source)) return true;
  if (weekKit.looksLikeStructuredActivityFields(source)) return true;
  return false;
}

function applyLegacyWeekdayBody(values, day, body, meta) {
  const lines = String(body || "").replace(/\r\n/g, "\n").split("\n");
  let currentPath = null;
  const currentLines = [];
  function flush() {
    if (!currentPath) return;
    assignValue(values, currentPath, currentLines.join("\n"), meta);
    currentPath = null;
    currentLines.length = 0;
  }
  lines.forEach((line) => {
    const heading = parseHeadingLine(line);
    if (heading) {
      const resolved = resolveFieldPath(heading.normalized, { day });
      flush();
      if (resolved?.kind === "field" && String(resolved.path || "").startsWith(`daily.${day}.`)) {
        currentPath = resolved.path;
        if (heading.inlineBody) currentLines.push(heading.inlineBody);
      }
      return;
    }
    if (currentPath) currentLines.push(line);
  });
  flush();
}

function assignValue(store, path, value, meta) {
  if (!path || !text(value, 20000)) return;
  if (!store[path]) {
    store[path] = { value: value.trim(), occurrences: [meta] };
    return;
  }
  const existing = store[path].value;
  if (existing.trim() === value.trim()) {
    store[path].occurrences.push(meta);
    return;
  }
  store[path].conflict = true;
  store[path].conflictValues = store[path].conflictValues || [existing];
  store[path].conflictValues.push(value.trim());
}

function parseDeterministicPaste(pastedText, options = {}) {
  const originalText = String(pastedText || "");
  const sections = splitSections(originalText);
  const values = {};
  const detectedSections = [];
  const unsorted = [];
  const unresolvedDates = [];
  const books = [];
  const songs = [];
  const printables = [];
  const activitiesReport = [];
  const titleIssues = [];
  let context = {};
  let floatingActivityLines = [];

  function flushFloatingActivities() {
    if (!floatingActivityLines.length) return;
    const block = floatingActivityLines.join("\n").trim();
    floatingActivityLines = [];
    if (!block) return;
    const parsed = weekKit.parseStructuredActivities(block, "");
    (parsed.records || []).forEach((record, index) => {
      const day = weekKit.parseWeekdayName(record.dayOfWeek) || context.day || "";
      if (!manifest.WEEKDAYS.includes(day)) {
        unsorted.push({
          id: `unsorted-activity-${sections.length}-${index}`,
          line: 0,
          heading: record.title || "Activity",
          text: block.slice(0, 400),
          reason: "activity_weekday_missing",
        });
        return;
      }
      const slot = `activity${Math.min(index + 1, 3)}`;
      applyStructuredActivityRecord(values, day, slot, record, { line: 0, heading: "Activity name" }, titleIssues, activitiesReport);
    });
    (parsed.unsupported || []).forEach((row, index) => {
      unsorted.push({
        id: `unsorted-activity-field-${index}`,
        line: 0,
        heading: row.heading || "Activity field",
        text: row.body || "",
        reason: "unsupported_activity_field",
      });
    });
  }

  sections.forEach((section) => {
    const body = bodyText(section);
    detectedSections.push({
      line: section.lineStart,
      heading: section.headingRaw || "(preamble)",
      fieldPath: section.resolved?.path || section.resolved?.day || null,
    });

    if (RELATIVE_DATE_RE.test(body) || RELATIVE_DATE_RE.test(section.headingRaw)) {
      unresolvedDates.push({
        text: text(body || section.headingRaw, 200),
        line: section.lineStart,
        reason: "relative_date_phrase",
      });
    }
    if (ABSOLUTE_DATE_RE.test(body)) {
      assignValue(values, "global.weekStartDate", body.match(ABSOLUTE_DATE_RE)[0], { line: section.lineStart, heading: section.headingRaw });
    }

    if (section.resolved?.kind === "weekday") {
      flushFloatingActivities();
      context = { day: section.resolved.day, activityBlock: false };
      if (body && weekdayBodyHasStructuredActivities(body)) {
        const parsedDay = weekKit.parseStructuredActivities(body, section.resolved.day);
        (parsedDay.records || []).forEach((record, index) => {
          const slot = `activity${Math.min(index + 1, 3)}`;
          applyStructuredActivityRecord(
            values,
            section.resolved.day,
            slot,
            record,
            { line: section.lineStart, heading: section.headingRaw },
            titleIssues,
            activitiesReport,
          );
        });
        (parsedDay.unsupported || []).forEach((row, index) => {
          unsorted.push({
            id: `unsorted-${section.lineStart}-field-${index}`,
            line: section.lineStart,
            heading: row.heading || section.headingRaw,
            text: row.body || "",
            reason: "unsupported_activity_field",
          });
        });
      } else if (body) {
        applyLegacyWeekdayBody(values, section.resolved.day, body, {
          line: section.lineStart,
          heading: section.headingRaw,
        });
        if (!values[`daily.${section.resolved.day}.activity1`]?.value
          && !values[`daily.${section.resolved.day}.activity2`]?.value) {
          unsorted.push({
            id: `unsorted-${section.lineStart}`,
            line: section.lineStart,
            heading: section.headingRaw,
            text: body,
            reason: "weekday_block_needs_activity_labels",
          });
        }
      }
      return;
    }

    if (section.resolved?.kind === "structuredActivityBlock") {
      flushFloatingActivities();
      const chunk = [section.headingRaw ? `${section.headingRaw}:` : "Activity name:", section.inlineBody, ...section.bodyLines].filter(Boolean).join("\n");
      floatingActivityLines.push(chunk);
      return;
    }

    const path = section.resolved?.path;
    if (path === "kit.books") {
      flushFloatingActivities();
      const parsedBooks = weekKit.parseBooksSection(body);
      (parsedBooks.records || []).forEach((book) => {
        books.push({
          title: text(book.title, 200),
          body: [book.title, book.author, book.questions].filter(Boolean).join("\n"),
          line: section.lineStart,
          assignedDay: book.suggestedWeekday || "",
        });
      });
      if (text(body) && !(parsedBooks.records || []).length) {
        assignValue(values, "global.weeklyBooks", body, { line: section.lineStart, heading: section.headingRaw });
      }
      return;
    }
    if (path === "kit.songs") {
      flushFloatingActivities();
      const parsedSongs = weekKit.parseSongsSection(body);
      (parsedSongs.records || []).forEach((song) => {
        songs.push({
          title: text(song.title, 200),
          body: [song.title, song.lyrics, song.teacherDirections].filter(Boolean).join("\n"),
          line: section.lineStart,
          assignedDay: song.linkedWeekday || "",
        });
      });
      if (text(body) && !(parsedSongs.records || []).length) {
        assignValue(values, "global.weeklySongs", body, { line: section.lineStart, heading: section.headingRaw });
      }
      return;
    }
    if (path === "kit.printables") {
      flushFloatingActivities();
      const parsedIdeas = weekKit.parsePrintableIdeasSection(body);
      (parsedIdeas.records || []).forEach((idea) => {
        printables.push({
          title: text(idea.title, 200),
          body: [idea.title, idea.purpose, idea.instructions].filter(Boolean).join("\n"),
          line: section.lineStart,
          assignedDay: "",
        });
      });
      if (text(body) && !(parsedIdeas.records || []).length) {
        assignValue(values, "global.weeklyPrintables", body, { line: section.lineStart, heading: section.headingRaw });
      }
      return;
    }
    if (path === "book.record") {
      books.push({ title: text(body.split("\n")[0], 200), body, line: section.lineStart, assignedDay: context.day || "" });
      return;
    }
    if (path === "song.record") {
      songs.push({ title: text(body.split("\n")[0], 200), body, line: section.lineStart, assignedDay: context.day || "" });
      return;
    }
    if (path === "printable.record") {
      printables.push({ title: text(body.split("\n")[0], 200), body, line: section.lineStart, assignedDay: context.day || "" });
      return;
    }

    if (path) {
      flushFloatingActivities();
      assignValue(values, path, body, { line: section.lineStart, heading: section.headingRaw });
      return;
    }

    if (body || section.headingRaw) {
      unsorted.push({
        id: `unsorted-${section.lineStart}`,
        line: section.lineStart,
        heading: section.headingRaw || "(no heading)",
        text: body || section.headingRaw,
        reason: section.headingRaw ? "unrecognized_heading" : "preamble_without_heading",
      });
    }
  });
  flushFloatingActivities();

  const conflicts = [];
  Object.keys(values).forEach((path) => {
    if (values[path].conflict) {
      conflicts.push({
        type: "duplicate_field_values",
        path,
        values: values[path].conflictValues,
      });
    }
  });

  const titles = [values["global.title"]].filter(Boolean);
  if (titles.length > 1) conflicts.push({ type: "multiple_titles", values: titles.map((t) => t.value) });

  const filled = Object.keys(values).map((path) => ({
    path,
    label: path,
    valuePreview: text(values[path].value, 120),
    line: values[path].occurrences[0]?.line,
  }));

  const missingRequired = [];
  if (!values["global.title"]?.value) missingRequired.push({ id: "title", label: "Title" });

  const ageUnknown = !values["global.ageGroup"]?.value;
  const themeUnknown = !values["global.theme"]?.value;
  if (ageUnknown) missingRequired.push({ id: "ageGroup", label: "Age group (or mark unknown)" });
  if (themeUnknown) missingRequired.push({ id: "theme", label: "Theme (or mark unknown)" });

  const missingOptional = manifest.GLOBAL_FIELD_IDS
    .filter((id) => id !== "title" && !values[`global.${id}`]?.value)
    .map((id) => ({ id, label: id }));

  const needsOwnerDecision = unsorted.map((item) => ({
    ...item,
    actions: [
      "monday", "tuesday", "wednesday", "thursday", "friday",
      "weeklyMaterials", "books", "songs", "printables", "familyConnection", "unsorted", "delete",
    ],
  }));

  titleIssues.forEach((issue) => {
    conflicts.push({
      type: issue.type,
      path: `daily.${issue.day}.activity1`,
      values: [`${issue.length} characters`],
      message: `Activity title exceeds ${issue.max} characters.`,
    });
  });

  const ageBand = inferAgeBand(values["global.ageGroup"]?.value);
  const infantSafety = ageSafety.validateLessonActivities({
    brief: { ageBand, guidedWorkflow: false },
    activities: activitiesReport.map((row) => ({
      title: row.title,
      materials: values[`daily.${row.weekday}.materials`]?.value || "",
      objective: values[`daily.${row.weekday}.dailyObjective`]?.value || "",
      steps: values[`daily.${row.weekday}.directions`]?.value || "",
      safetyNotes: values[`daily.${row.weekday}.safety`]?.value || "",
    })),
  });

  const unresolvedConflicts = conflicts.length > 0;
  const unresolvedUnsorted = unsorted.length > 0;
  const unresolvedRelativeDates = unresolvedDates.length > 0;
  const unresolvedTitleLength = titleIssues.length > 0;

  return {
    manifestVersion: manifest.MANIFEST_VERSION,
    originalText,
    characterCount: originalText.length,
    detectedSections,
    values,
    books,
    songs,
    printables,
    activities: activitiesReport,
    report: {
      filled,
      missingRequired,
      missingOptional,
      unsorted,
      conflicts,
      needsOwnerDecision,
      unresolvedDates,
      titleIssues,
      infantSafety,
      activities: activitiesReport,
    },
    flags: {
      ageMarkedUnknown: options.ageMarkedUnknown === true,
      themeMarkedUnknown: options.themeMarkedUnknown === true,
    },
    canSaveDraft: !unresolvedConflicts && !unresolvedUnsorted && !unresolvedRelativeDates && !unresolvedTitleLength
      && Boolean(values["global.title"]?.value)
      && (!ageUnknown || options.ageMarkedUnknown)
      && (!themeUnknown || options.themeMarkedUnknown),
    aiUsed: false,
  };
}

const api = {
  normalizeHeading,
  parseDeterministicPaste,
  RELATIVE_DATE_RE,
  ABSOLUTE_DATE_RE,
};
module.exports = api;
if (typeof globalThis !== "undefined") globalThis.LLHLessonPasteOrganizerParser = api;
