#!/usr/bin/env node
/**
 * Phase 5 — sentinel / empty-value normalization.
 * Run: npm run test:curriculum-sentinel-phase5
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  isSentinelValue,
  emptyFromSentinel,
  normalizeBookOrSongEntry,
  scrubSentinelsFromLessonPlan,
  scrubSentinelsFromPromptContext,
  normalizeDailyPlansEmpties,
} = require("./curriculum-sentinel.js");
const parser = require("./curriculum-lesson-import-parser.js");

const variants = [
  "None",
  "None required",
  "N/A",
  "NA",
  "Not applicable",
  "No books",
  "No book",
  "No songs",
  "No materials",
  "Not needed",
  "—",
  "-",
  "  none required.  ",
  "",
  "   ",
];

for (const value of variants) {
  assert.equal(isSentinelValue(value), true, `sentinel: ${JSON.stringify(value)}`);
  assert.equal(emptyFromSentinel(value), "", `empty: ${JSON.stringify(value)}`);
}

assert.equal(isSentinelValue("Brown Bear, Brown Bear"), false);
assert.equal(normalizeBookOrSongEntry({ title: "None required", author: "X" }), null);
assert.equal(normalizeBookOrSongEntry({ title: "Real Book", author: "Author" })?.title, "Real Book");

const booksText = "None required\nReal Book | Real Author\nN/A\n";
const books = parser.parseCurriculumImportListLines(booksText, { parts: 3 });
assert.equal(books.length, 1);
assert.equal(books[0].title, "Real Book");

const songs = parser.parseCurriculumImportListLines("No songs\nItsy Bitsy Spider\n", { parts: 2 });
assert.equal(songs.length, 1);
assert.equal(songs[0].title, "Itsy Bitsy Spider");

const plan = scrubSentinelsFromLessonPlan({
  books: [{ title: "None required" }, { title: "Goodnight Moon", author: "Brown" }],
  songs: [{ title: "N/A" }],
  weeklyMaterials: "None required",
  familyConnection: "Not applicable",
  dailyPlans: {
    monday: {
      items: [{ title: "Sort" }],
      books: [{ title: "None required" }],
      materials: "No materials",
    },
    tuesday: { items: [], books: [], songs: [] },
    wednesday: { items: [] },
    thursday: { items: [] },
    friday: { items: [] },
  },
});
assert.equal(plan.books.length, 1);
assert.equal(plan.books[0].title, "Goodnight Moon");
assert.equal(plan.songs.length, 0);
assert.equal(plan.weeklyMaterials, "");
assert.equal(plan.familyConnection, "");
assert.equal(plan.dailyPlans.monday.books.length, 0);
assert.equal(plan.dailyPlans.monday.materials, "");
assert.equal(plan.dailyPlans.monday.missing, false);
assert.equal(plan.dailyPlans.tuesday.missing, true);
assert.deepEqual(plan._missingWeekdays, ["tuesday", "wednesday", "thursday", "friday"]);

const days = normalizeDailyPlansEmpties({
  monday: { items: [{ title: "A" }] },
  tuesday: { items: [] },
});
assert.equal(days.missingDays.includes("tuesday"), true);
assert.equal(days.dailyPlans.monday.missing, false);

const prompt = scrubSentinelsFromPromptContext("BOOKS: None required\nSONGS: N/A\nTHEME: Apples");
assert.match(prompt, /BOOKS:\s*\(empty\)/);
assert.match(prompt, /THEME: Apples/);
assert.doesNotMatch(prompt, /None required/);
assert.doesNotMatch(prompt, /\bN\/A\b/);

// Import paste with Monday-only should not invent Tue–Fri activities.
const mondayOnly = `
TITLE: QA Sentinel Monday Only
AGE_GROUP: Preschool
THEME: Sorting
WEEKLY_OVERVIEW: Disposable.
LEARNING_OBJECTIVES: Sort by color.
WEEKLY_MATERIALS: None required
VOCABULARY: sort
FAMILY_CONNECTION: Not applicable
BOOKS:
None required
SONGS:
No songs
MONDAY:
ACTIVITY_NAME: Color Sort
ACTIVITY_CATEGORY: Fine Motor
MATERIALS: cups
DIRECTIONS:
1. Sort.
TEACHER_ROLE: Guide.
LEARNING_GOALS: Sorting.
`;
const parsed = parser.parseCurriculumLessonPlanImport(mondayOnly, {
  allowIncompleteWeekdays: true,
  status: "draft",
});
assert.ok(parsed.data, `import returned data (${(parsed.errors || []).join("; ")})`);
const data = parsed.data;
assert.equal((data.dailyPlans.tuesday?.items || []).length, 0, "does not fabricate Tuesday activities");
assert.equal((data.books || []).length, 0, "sentinel books cleared");
assert.equal((data.songs || []).length, 0, "sentinel songs cleared");
assert.equal(data.weeklyMaterials || "", "", "sentinel materials cleared");
assert.equal(data.familyConnection || "", "", "sentinel family cleared");
assert.ok(!(JSON.stringify(data).includes("None required")), "sentinel text does not remain as curriculum content");
assert.ok(!(JSON.stringify(data).includes("Not applicable")), "not applicable does not remain as content");

console.log("PASS curriculum-sentinel-phase5");
