/**
 * Versioned field manifest for deterministic Paste and Organize Lesson Plan.
 * No AI — metadata only.
 */
"use strict";

const MANIFEST_VERSION = 1;

const GLOBAL_FIELD_IDS = Object.freeze([
  "title",
  "theme",
  "ageGroup",
  "dateRange",
  "weekStartDate",
  "weekEndDate",
  "classroomGroup",
  "weeklyFocus",
  "weeklyObjectives",
  "weeklyMaterials",
  "weeklyPreparation",
  "classroomSetup",
  "weeklySafety",
  "cleanupSupplies",
  "weeklyVocabulary",
  "weeklyBooks",
  "weeklySongs",
  "weeklyPrintables",
  "familyConnection",
  "teacherNotes",
  "cover",
]);

const DAILY_FIELD_IDS = Object.freeze([
  "date",
  "dailyFocus",
  "dailyObjective",
  "activity1",
  "activity2",
  "activity3",
  "book",
  "songOrFingerplay",
  "circleTime",
  "sensoryActivity",
  "artActivity",
  "scienceActivity",
  "mathActivity",
  "literacyActivity",
  "musicMovement",
  "indoorActivity",
  "outdoorActivity",
  "transitionActivity",
  "printable",
  "materials",
  "preparation",
  "setup",
  "directions",
  "teacherQuestions",
  "observation",
  "safety",
  "cleanup",
  "indoorAlternative",
  "outdoorAlternative",
  "supportModification",
  "challengeExtension",
  "mixedAgeAdaptation",
  "vocabulary",
  "familyConnection",
  "teacherNotes",
]);

const ACTIVITY_SUBFIELD_IDS = Object.freeze([
  "title",
  "type",
  "objective",
  "developmentalDomains",
  "materials",
  "preparation",
  "setup",
  "directions",
  "teacherRole",
  "childActions",
  "questions",
  "observation",
  "safety",
  "cleanup",
  "location",
  "support",
  "challenge",
  "mixedAgeAdaptation",
  "vocabulary",
  "relatedBook",
  "relatedPrintable",
  "imagePlaceholder",
  "teacherNotes",
]);

const BOOK_FIELD_IDS = Object.freeze([
  "title", "author", "assignedDay", "relatedActivity", "purpose",
  "discussionQuestions", "extension", "sourceLink", "verificationStatus", "notes",
]);

const SONG_FIELD_IDS = Object.freeze([
  "title", "assignedDay", "purpose", "movementInstructions",
  "lyricsSource", "relatedActivity", "notes",
]);

const PRINTABLE_FIELD_IDS = Object.freeze([
  "title", "purpose", "assignedDay", "relatedActivity", "pageCount",
  "paperSize", "teacherDirections", "childDirections", "filePlaceholder",
  "printableStatus", "notes",
]);

const FAMILY_FIELD_IDS = Object.freeze([
  "title", "assignedScope", "instructions", "materials",
  "questionsForFamilies", "homeExtension", "safetyNote", "notes",
]);

const REQUIRED_GLOBAL = Object.freeze(["title"]);
const REQUIRED_FOR_COMPLETE = Object.freeze(["title", "ageGroupOrUnknown", "themeOrUnknown"]);

const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);

function fieldDef(id, label, scope, options = {}) {
  return Object.freeze({
    id,
    label,
    scope,
    required: options.required === true,
    optional: options.optional !== false,
  });
}

const GLOBAL_FIELDS = Object.freeze(GLOBAL_FIELD_IDS.map((id) => {
  const labels = {
    title: "Title",
    theme: "Theme",
    ageGroup: "Age group",
    dateRange: "Date range",
    weekStartDate: "Week start date",
    weekEndDate: "Week end date",
    classroomGroup: "Classroom / group",
    weeklyFocus: "Weekly focus",
    weeklyObjectives: "Weekly objectives",
    weeklyMaterials: "Weekly materials",
    weeklyPreparation: "Weekly preparation",
    classroomSetup: "Classroom setup",
    weeklySafety: "Weekly safety",
    cleanupSupplies: "Cleanup supplies",
    weeklyVocabulary: "Weekly vocabulary",
    weeklyBooks: "Weekly books",
    weeklySongs: "Weekly songs",
    weeklyPrintables: "Weekly printables",
    familyConnection: "Family connection",
    teacherNotes: "Teacher notes",
    cover: "Cover",
  };
  return fieldDef(id, labels[id] || id, "global", { required: id === "title" });
}));

function dailyFieldsForWeekday(weekday) {
  return DAILY_FIELD_IDS.map((id) => fieldDef(id, `${weekday} — ${id}`, `daily.${weekday}`));
}

function getAllFieldDefinitions() {
  const out = [...GLOBAL_FIELDS];
  WEEKDAYS.forEach((day) => {
    out.push(...dailyFieldsForWeekday(day));
  });
  return out;
}

const lessonPasteOrganizerManifestApi = {
  MANIFEST_VERSION,
  WEEKDAYS,
  GLOBAL_FIELD_IDS,
  DAILY_FIELD_IDS,
  ACTIVITY_SUBFIELD_IDS,
  BOOK_FIELD_IDS,
  SONG_FIELD_IDS,
  PRINTABLE_FIELD_IDS,
  FAMILY_FIELD_IDS,
  REQUIRED_GLOBAL,
  REQUIRED_FOR_COMPLETE,
  GLOBAL_FIELDS,
  getAllFieldDefinitions,
};
if (typeof module === "object" && module.exports) module.exports = lessonPasteOrganizerManifestApi;
if (typeof globalThis !== "undefined") globalThis.LLHLessonPasteOrganizerManifest = lessonPasteOrganizerManifestApi;
