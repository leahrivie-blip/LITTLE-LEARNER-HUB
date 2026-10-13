/**
 * Deterministic Paste and Organize — parser (no AI, no guessing).
 */
"use strict";

const manifest = require("./lesson-paste-organizer-manifest.js");

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
  title: "global.title",
  theme: "global.theme",
  age: "global.ageGroup",
  "age group": "global.ageGroup",
  "age band": "global.ageGroup",
  week: "global.dateRange",
  "week of": "global.weekStartDate",
  objectives: "global.weeklyObjectives",
  "weekly objectives": "global.weeklyObjectives",
  materials: "global.weeklyMaterials",
  "weekly materials": "global.weeklyMaterials",
  supplies: "global.weeklyMaterials",
  "what you need": "global.weeklyMaterials",
  preparation: "global.weeklyPreparation",
  "how to prepare": "global.weeklyPreparation",
  setup: "global.classroomSetup",
  safety: "global.weeklySafety",
  "safety notes": "global.weeklySafety",
  cleanup: "global.cleanupSupplies",
  vocabulary: "global.weeklyVocabulary",
  "family connection": "global.familyConnection",
  "home connection": "global.familyConnection",
  books: "global.weeklyBooks",
  book: "book.record",
  songs: "global.weeklySongs",
  song: "song.record",
  printables: "global.weeklyPrintables",
  printable: "printable.record",
  cover: "global.cover",
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

function resolveFieldPath(normalized, context) {
  if (WEEKDAY_ALIASES[normalized]) {
    return { kind: "weekday", day: WEEKDAY_ALIASES[normalized] };
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
  let context = {};

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
      context = { day: section.resolved.day, activityBlock: false };
      if (body) {
        unsorted.push({
          id: `unsorted-${section.lineStart}`,
          line: section.lineStart,
          heading: section.headingRaw,
          text: body,
          reason: "weekday_block_needs_activity_labels",
        });
      }
      return;
    }

    const path = section.resolved?.path;
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

  const unresolvedConflicts = conflicts.length > 0;
  const unresolvedUnsorted = unsorted.length > 0;
  const unresolvedRelativeDates = unresolvedDates.length > 0;

  return {
    manifestVersion: manifest.MANIFEST_VERSION,
    originalText,
    characterCount: originalText.length,
    detectedSections,
    values,
    books,
    songs,
    printables,
    report: {
      filled,
      missingRequired,
      missingOptional,
      unsorted,
      conflicts,
      needsOwnerDecision,
      unresolvedDates,
    },
    flags: {
      ageMarkedUnknown: options.ageMarkedUnknown === true,
      themeMarkedUnknown: options.themeMarkedUnknown === true,
    },
    canSaveDraft: !unresolvedConflicts && !unresolvedUnsorted && !unresolvedRelativeDates
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
