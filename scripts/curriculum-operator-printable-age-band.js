/**
 * Resolve canonical printable age_band from a parent lesson record.
 * Parent lesson is the source of truth — never invent an age band.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const SUPPORTED_AGE_BANDS = Object.freeze([
  "infant",
  "toddler",
  "preschool",
  "school_age",
  "mixed",
]);

function ageLabel(ageBand) {
  if (ageBand === "infant") return "Infant 0–12 Months";
  if (ageBand === "toddler") return "Toddler 18–24 Months";
  if (ageBand === "preschool") return "Preschool 3–5";
  if (ageBand === "school_age") return "School Age";
  return "Mixed Ages";
}

function text(value, max = 200) {
  return schema.text(value, max);
}

function pickRawAgeFields(lesson) {
  const row = lesson && typeof lesson === "object" ? lesson : {};
  return {
    age: row.age ?? "",
    ageBand: row.ageBand ?? row.age_band ?? "",
    ageGroup: row.ageGroup ?? row.age_group ?? "",
    ageRange: row.ageRange ?? "",
    classroomAge: row.classroomAge ?? "",
  };
}

function normalizeMixedAgeBand(rawFields) {
  const blob = Object.values(rawFields).map((v) => text(v, 80)).join(" ").toLowerCase();
  if (/\bmixed\b/i.test(blob)) return "mixed";
  return null;
}

/**
 * @param {object|null|undefined} parentLesson
 * @param {{ activity?: object, fallbackAgeBand?: string|null }} [options]
 * @returns {{
 *   ok: boolean,
 *   ageBand?: string,
 *   ageLabel?: string,
 *   source?: string,
 *   rawFields?: object,
 *   code?: string,
 *   needsOwnerInput?: string[],
 *   error?: string,
 *   debug?: object,
 * }}
 */
function resolvePrintableAgeBand(parentLesson, options = {}) {
  const lesson = parentLesson && typeof parentLesson === "object" ? parentLesson : null;
  const activity = options.activity && typeof options.activity === "object" ? options.activity : null;
  const rawFields = {
    ...pickRawAgeFields(lesson),
    activityAge: activity?.age ?? "",
  };

  const candidates = [
    { value: lesson?.ageBand, source: "lesson.ageBand" },
    { value: lesson?.age_band, source: "lesson.age_band" },
    { value: lesson?.ageGroup, source: "lesson.ageGroup" },
    { value: lesson?.age_group, source: "lesson.age_group" },
    { value: lesson?.age, source: "lesson.age" },
    { value: lesson?.ageRange, source: "lesson.ageRange" },
    { value: lesson?.classroomAge, source: "lesson.classroomAge" },
    { value: activity?.age, source: "activity.age" },
    { value: options.fallbackAgeBand, source: "fallbackAgeBand" },
  ];

  for (const candidate of candidates) {
    const normalized = schema.normalizeAgeBand(candidate.value);
    if (normalized && SUPPORTED_AGE_BANDS.includes(normalized)) {
      const ageLabelText = text(lesson?.age, 80)
        || text(activity?.age, 80)
        || ageLabel(normalized);
      return {
        ok: true,
        ageBand: normalized,
        ageLabel: ageLabelText,
        source: candidate.source,
        rawFields,
      };
    }
  }

  const mixed = normalizeMixedAgeBand(rawFields);
  if (mixed) {
    return {
      ok: true,
      ageBand: mixed,
      ageLabel: text(lesson?.age, 80) || text(activity?.age, 80) || ageLabel(mixed),
      source: "lesson.mixed_age_label",
      rawFields,
    };
  }

  return {
    ok: false,
    code: "NEEDS_OWNER_INPUT",
    needsOwnerInput: ["age_band"],
    error: "Needs owner input: age_band",
    debug: {
      lessonId: text(lesson?.id, 160) || null,
      lessonTitle: text(lesson?.title, 180) || null,
      rawAgeFields: rawFields,
      acceptedAgeBands: SUPPORTED_AGE_BANDS.slice(),
      reason: "normalization_failed_no_canonical_age_band",
    },
  };
}

function buildPrintableAgeBandOwnerInputError(resolved) {
  const debug = resolved?.debug || {};
  return {
    ok: false,
    code: resolved?.code || "NEEDS_OWNER_INPUT",
    needsOwnerInput: resolved?.needsOwnerInput || ["age_band"],
    error: resolved?.error || "Needs owner input: age_band",
    lessonId: debug.lessonId || null,
    lessonTitle: debug.lessonTitle || null,
    rawAgeFields: debug.rawAgeFields || {},
    acceptedAgeBands: debug.acceptedAgeBands || SUPPORTED_AGE_BANDS.slice(),
    reason: debug.reason || "normalization_failed_no_canonical_age_band",
  };
}

/**
 * Printable-focused commands on existing lessons must not enter new-lesson create parsing.
 */
function isPrintableExistingLessonCommand(rawCommand) {
  const raw = String(rawCommand || "");
  const printableFocused = /\b(printable|printables|pdf|resource pack)\b/i.test(raw)
    && /\b(generate|create|make|build|fix|replace|regenerate|finish|add|upload)\b/i.test(raw);
  if (!printableFocused) return false;
  if (/\bnew\s+(draft\s+)?(lesson|week)\b/i.test(raw)) return false;
  if (/\bmake\s+me\s+a\s+new\b/i.test(raw)) return false;
  if (/\bcreate\s+an?\s+new\b/i.test(raw)) return false;
  return true;
}

module.exports = {
  SUPPORTED_AGE_BANDS,
  pickRawAgeFields,
  resolvePrintableAgeBand,
  buildPrintableAgeBandOwnerInputError,
  isPrintableExistingLessonCommand,
};
