#!/usr/bin/env node
/**
 * V4 Smart Import parser + preview tests.
 * Run: node scripts/test-curriculum-import-v4.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

require("./curriculum-lesson-import-parser.js");
const parser = require("./curriculum-lesson-import-v4.js");
const previewApi = require("./curriculum-import-preview.js");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const flexibleSample = `
Title:
Ocean Explorers Week

Age Group:
Toddler

Theme Overview:
Children explore ocean animals through sensory play, movement, and books.

Learning Goals:
- Use descriptive words about ocean animals
- Practice scooping and pouring

Family Engagement:
Ask families to share a favorite water animal photo.

Observe For:
Language and fine motor control.

Monday
Daily Theme:
Blue Ocean Day
Daily Objectives:
Explore water textures.
Daily Materials:
Water table, scoops
Daily Vocabulary:
wave, splash, fish
Circle Time:
Welcome song
Family Connection:
Talk about bath time waves

Activity: Wave Water Table
Description:
Children scoop and pour at the water table with ocean toys.
Materials:
Water table, cups, fish toys
Directions:
1. Invite children to the water table.
2. Model scooping and pouring.
Teacher Role:
Narrate actions.
Learning Goals:
Fine motor strength

Activity: Ocean Creature Freeze Dance
Description:
Children move like crabs and fish.
Materials:
Music player
Directions:
1. Play ocean music.
2. Call out animal movements.
Teacher Role:
Model movements.
Learning Goals:
Gross motor control

Tuesday
Daily Theme:
Shell Sort
Activity Name:
Shell Sorting Tray
Description:
Children sort shells by size.
Materials:
Shells, trays
Directions:
1. Offer a tray of shells.
2. Invite sorting by size.
Teacher Role:
Ask open-ended questions.
Learning Goals:
Comparing and describing
`;

test("V4 API is installed on CurriculumLessonImportParser", () => {
  assert.equal(typeof parser.parseCurriculumLessonPlanImportV4, "function");
  assert.equal(typeof parser.parseCurriculumLessonPlanImport, "function");
  assert.match(parser.CURRICULUM_LESSON_IMPORT_V4_TEMPLATE || "", /Theme Overview/i);
});

test("V4 maps synonym weekly sections and day fields", () => {
  const parsed = parser.parseCurriculumLessonPlanImportV4(flexibleSample);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  assert.equal(parsed.data._formatVersion, 4);
  assert.equal(parsed.data.title, "Ocean Explorers Week");
  assert.match(parsed.data.age, /Toddler/i);
  assert.match(parsed.data.weeklyOverview, /ocean animals/i);
  assert.match(parsed.data.objectives, /descriptive words/i);
  assert.match(parsed.data.familyConnection, /favorite water animal/i);
  assert.match(parsed.data.observationOpportunities, /Language/i);
  assert.ok(parsed.data.dailyPlans.monday.items.length >= 2);
  assert.match(parsed.data.dailyPlans.monday.theme, /Blue Ocean/i);
  assert.match(parsed.data.dailyPlans.monday.objectives, /water textures/i);
  assert.match(parsed.data.dailyPlans.monday.materials, /Water table/i);
  assert.match(parsed.data.dailyPlans.monday.vocabulary, /wave/i);
  assert.ok((parsed.data.dailyPlans.monday.circleTime || []).length >= 1);
  assert.match(parsed.data.dailyPlans.monday.familyConnection, /bath time/i);
  assert.equal(parsed.data.dailyPlans.tuesday.items[0].title, "Shell Sorting Tray");
});

test("V4 infers activity categories when missing", () => {
  const parsed = parser.parseCurriculumLessonPlanImportV4(flexibleSample);
  const monday = parsed.data.dailyPlans.monday.items;
  const water = monday.find((item) => /Wave Water/i.test(item.title));
  const dance = monday.find((item) => /Freeze Dance/i.test(item.title));
  assert.equal(water.activityCategory, "Sensory Play");
  assert.equal(dance.activityCategory, "Music & Movement");
});

test("V4 soft-validates instead of hard-failing optional activity fields", () => {
  const minimal = `
Title: Soft Validation Sample
Age: Preschool
Theme Overview: A short week.
Monday
Activity: Playdough Snails
Description: Roll and pinch playdough.
`;
  const parsed = parser.parseCurriculumLessonPlanImportV4(minimal);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  assert.ok(parsed.warnings.some((w) => /CATEGORY/i.test(w)));
  assert.ok(parsed.warnings.some((w) => /MATERIALS|DIRECTIONS|TEACHER_ROLE|LEARNING_GOALS/i.test(w)));
  assert.equal(parsed.data.dailyPlans.monday.items[0].activityCategory, "Fine Motor");
});

test("V4 detects Free/Pro synonyms", () => {
  const pro = parser.parseCurriculumLessonPlanImportV4(`
Title: Premium Pack Week
Plan: Premium
Theme Overview: Members only content.
Monday
Activity: Nature Walk
Description: Outdoor exploration.
`);
  assert.equal(pro.ok, true, pro.errors.join("; "));
  assert.equal(pro.data.plan, "Pro");
});

test("V4 mode can be selected via parseCurriculumLessonPlanImport({ mode: 'v4' })", () => {
  const parsed = parser.parseCurriculumLessonPlanImport(flexibleSample, { mode: "v4" });
  assert.equal(parsed.data._formatVersion, 4);
  assert.equal(parsed.ok, true);
});

test("V3 strict mode still rejects flexible synonym headings", () => {
  const parsed = parser.parseCurriculumLessonPlanImport(flexibleSample, { mode: "v3" });
  assert.equal(parsed.ok, false);
  assert.ok(
    parsed.errors.some((msg) => /THEME|PLAN|STATUS|WEEKLY_OVERVIEW|V3 Strict/i.test(msg)),
    `expected strict validation errors, got: ${parsed.errors.join("; ")}`,
  );
});

test("V3 strict mode still accepts classic label-only paste", () => {
  const samplePath = path.join(__dirname, "curriculum-import-samples", "label-only-full-workflow-v3.txt");
  const text = fs.readFileSync(samplePath, "utf8");
  const parsed = parser.parseCurriculumLessonPlanImport(text, { mode: "v3" });
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  assert.equal(parsed.data._formatVersion, 3);
  assert.ok(parsed.data._activityCount >= 10);
});

test("preview includes quality score for V4", () => {
  const parsed = parser.parseCurriculumLessonPlanImportV4(flexibleSample);
  const preview = previewApi.buildCurriculumImportPreview(parsed, { formatVersion: 4 });
  assert.equal(preview.canConfirm, true);
  assert.equal(preview.summary.formatLabel, "V4 Smart Import");
  assert.ok(preview.quality);
  assert.ok(preview.quality.qualityScore >= 50);
  assert.ok(preview.quality.activitiesImported >= 3);
  assert.ok(preview.warnings.some((w) => /missing vocabulary|missing family connection/i.test(w.message)));
});

test("category inference helper covers common cues", () => {
  assert.equal(parser.inferActivityCategory({ title: "Playdough Snails" }), "Fine Motor");
  assert.equal(parser.inferActivityCategory({ title: "Finger Painting" }), "Art");
  assert.equal(parser.inferActivityCategory({ title: "Obstacle Course" }), "Gross Motor");
  assert.equal(parser.inferActivityCategory({ description: "Science experiment with magnets" }), "STEM/Discovery");
  assert.equal(parser.inferActivityCategory({ title: "Pretend Restaurant" }), "Dramatic Play");
});

if (!process.exitCode) {
  console.log("\nAll V4 Smart Import tests passed.");
}
