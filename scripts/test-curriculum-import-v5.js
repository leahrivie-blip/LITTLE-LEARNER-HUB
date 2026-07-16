#!/usr/bin/env node
/**
 * V5 Flexible Import — ChatGPT-style pastes without strict formatting.
 * Run: node scripts/test-curriculum-import-v5.js
 */
const assert = require("node:assert/strict");

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

const chatgptBarePaste = `
TITLE
Beach Explorers

AGE GROUP
Preschool

THEME
Beach Exploration

PLAN
Pro

STATUS
Published

WEEKLY OVERVIEW
Children explore beach life through sensory play and literacy.

LEARNING OBJECTIVES
Investigate sand and shells
Build beach vocabulary

NEEDED MATERIALS
Sand, shells, buckets

VOCABULARY
Beach, Shell, Sand

RECOMMENDED BOOKS
Beach Day

MUSIC & SONGS
The Waves in the Ocean

FAMILY ENGAGEMENT
Share a beach memory at home.

ASSESSMENT
Observe vocabulary and cooperation.

SUPPORT STRATEGIES
Provide adaptive tools as needed.

MONDAY

Activity Title: Sand Discovery Station
Activity Type: Sensory Play
What Children Will Do:
Children explore sand textures with scoops and shells.
Items Needed:
Sand table, scoops, shells
Procedure:
1. Invite children to the sand table.
2. Model scooping and pouring.
Teacher Support:
Narrate discoveries.
Skills Practiced:
Sensory awareness and vocabulary

Activity: Beach Story Time
Description:
Read a beach-themed story together.
Materials:
Beach book
Directions:
1. Read aloud.
2. Point to pictures.
Teacher Role:
Support listening.
Learning Goals:
Early literacy

TUESDAY
Day 2

Center Activity: Shell Sorting
Category: STEM/Discovery
Description:
Children sort shells by size and color.
Materials:
Shells, trays
Directions:
1. Offer shells.
2. Sort by size.
Teacher Notes:
Ask open-ended questions.
Goals:
Comparing and classifying
`;

test("V5 API is installed", () => {
  assert.equal(typeof parser.parseCurriculumLessonPlanImportV5, "function");
  assert.match(parser.CURRICULUM_LESSON_IMPORT_V5_TEMPLATE || "", /TITLE:/i);
  assert.match(parser.CURRICULUM_LESSON_IMPORT_V5_TEMPLATE || "", /AGE_GROUP:/i);
  assert.match(parser.CURRICULUM_LESSON_IMPORT_V5_TEMPLATE || "", /THEME:/i);
  assert.match(parser.CURRICULUM_LESSON_IMPORT_V5_TEMPLATE || "", /ACTIVITY_NAME:/i);
  assert.match(parser.CURRICULUM_LESSON_IMPORT_V5_TEMPLATE || "", /DAILY_THEME:/i);
});

test("V5 maps bare headings without colons", () => {
  const parsed = parser.parseCurriculumLessonPlanImport(chatgptBarePaste, { mode: "v5" });
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  assert.equal(parsed.data._formatVersion, 5);
  assert.equal(parsed.data.title, "Beach Explorers");
  assert.match(parsed.data.age, /Preschool/i);
  assert.equal(parsed.data.theme, "Beach Exploration");
  assert.equal(parsed.data.plan, "Pro");
  assert.equal(parsed.data.status, "published");
  assert.match(parsed.data.weeklyOverview, /beach life/i);
  assert.match(parsed.data.objectives, /sand and shells/i);
  assert.match(parsed.data.weeklyMaterials, /Sand, shells/i);
  assert.match(parsed.data.vocabularyWords, /Beach/i);
  assert.ok((parsed.data.books || []).length >= 1);
  assert.ok((parsed.data.songs || []).length >= 1);
  assert.match(parsed.data.familyConnection, /beach memory/i);
  assert.match(parsed.data.observationOpportunities, /vocabulary/i);
  assert.match(parsed.data.adaptations, /adaptive tools/i);
});

test("V5 maps alternate activity field labels", () => {
  const parsed = parser.parseCurriculumLessonPlanImportV5(chatgptBarePaste);
  const monday = parsed.data.dailyPlans.monday.items;
  assert.ok(monday.length >= 2, `expected >=2 monday activities, got ${monday.length}`);
  const sand = monday.find((item) => /Sand Discovery/i.test(item.title));
  assert.ok(sand, "Sand Discovery Station missing");
  assert.equal(sand.activityCategory, "Sensory Play");
  assert.match(sand.description, /sand textures/i);
  assert.match(sand.materials, /Sand table/i);
  assert.match(sand.steps, /Invite children/i);
  assert.match(sand.teacherRole, /Narrate/i);
  assert.ok((sand.learningGoals || []).length >= 1);

  const tuesday = parsed.data.dailyPlans.tuesday.items;
  assert.equal(tuesday[0].title, "Shell Sorting");
  assert.equal(tuesday[0].activityCategory, "STEM/Discovery");
  assert.match(tuesday[0].teacherRole, /open-ended/i);
});

test("V5 Day 1–5 headers map to weekdays", () => {
  const parsed = parser.parseCurriculumLessonPlanImportV5(`
Title: Day Numbers Sample
Age Group: Toddler
Theme Overview: Short week.
Day 1
Activity: Morning Stretch
Description: Stretch together.
Day 3
Activity: Paint Waves
Description: Finger paint blue waves.
`);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  assert.equal(parsed.data.dailyPlans.monday.items[0].title, "Morning Stretch");
  assert.equal(parsed.data.dailyPlans.wednesday.items[0].title, "Paint Waves");
  assert.equal(parsed.data.dailyPlans.wednesday.items[0].activityCategory, "Art");
});

test("V5 preview shows quality score, recognized fields, and missing list", () => {
  const parsed = parser.parseCurriculumLessonPlanImportV5(chatgptBarePaste);
  const preview = previewApi.buildCurriculumImportPreview(parsed, { formatVersion: 5 });
  assert.equal(preview.canConfirm, true);
  assert.equal(preview.summary.formatLabel, "V5 Flexible Import");
  assert.ok(preview.quality.qualityScore >= 40);
  assert.ok((preview.quality.recognizedFields || []).includes("TITLE"));
  assert.ok((preview.quality.missingFields || []).some((item) => /activities|vocabulary|objectives|materials/i.test(item)));
});

test("default auto mode uses V5 for flexible pastes", () => {
  const parsed = parser.parseCurriculumLessonPlanImport(chatgptBarePaste, { mode: "auto" });
  assert.equal(parsed.data._formatVersion, 5);
  assert.equal(parsed.ok, true);
});

test("V4 mode still returns formatVersion 4", () => {
  const parsed = parser.parseCurriculumLessonPlanImport(chatgptBarePaste, { mode: "v4" });
  assert.equal(parsed.data._formatVersion, 4);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.title, "Beach Explorers");
});

if (!process.exitCode) {
  console.log("\nAll V5 Flexible Import tests passed.");
}
