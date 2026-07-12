#!/usr/bin/env node
/**
 * Phase A: strict marker lesson plan import parser tests.
 * Run: node scripts/test-curriculum-import-parser.js
 */
const fs = require("fs");
const path = require("path");
const {
  detectImportFormat,
  parseCurriculumLessonPlanImport,
  parseCurriculumLessonPlanImportV1,
  parseCurriculumLessonPlanImportV2,
  parseCurriculumLessonPlanImportV3,
  parseCurriculumLessonPlanBulkImport,
  APPROVED_V2_ACTIVITY_CATEGORIES,
} = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const V1_SAMPLE = path.join(ROOT, "scripts/curriculum-phase-2f-imports/05-preschool-garden-scientists-pro.txt");
const V1_LEGACY = path.join(ROOT, "scripts/curriculum-phase-2f-imports/legacy-backward-compat-sample.txt");
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");
const V3_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-garden-scientists-v3.txt");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  console.log("1) Format detection");
  assert(detectImportFormat(fs.readFileSync(V1_SAMPLE, "utf8")) === "v1", "Phase 2F file should be v1");
  assert(detectImportFormat(fs.readFileSync(V2_SAMPLE, "utf8")) === "v2", "Premium sample should be v2");
  assert(detectImportFormat(fs.readFileSync(V3_SAMPLE, "utf8")) === "v3", "Label-only sample should be v3");

  console.log("2) v1 backward compatibility");
  const v1 = parseCurriculumLessonPlanImportV1(fs.readFileSync(V1_SAMPLE, "utf8"));
  assert(v1.ok, v1.errors.join(" "));
  assert(v1.data._activityCount === 10, `Expected 10 activities, got ${v1.data._activityCount}`);
  assert(v1.parseReport.formatVersion === 1, "v1 parseReport version");

  const legacy = parseCurriculumLessonPlanImport(fs.readFileSync(V1_LEGACY, "utf8"));
  assert(legacy.ok, legacy.errors.join(" "));
  assert(legacy.data._activityCount === 8, `Legacy activity count mismatch: ${legacy.data._activityCount}`);

  console.log("3) v2 premium sample parses with exact wording preserved");
  const v2Text = fs.readFileSync(V2_SAMPLE, "utf8");
  const v2 = parseCurriculumLessonPlanImportV2(v2Text);
  if (!v2.ok) throw new Error(v2.errors.join(" | "));
  assert(v2.data.title === "Garden Scientists", "title");
  assert(v2.data.plan === "Pro", "plan preserved");
  assert(v2.data.status === "draft", "status preserved");
  assert(v2.data.age === "Preschool", "age");
  assert(v2.parseReport.activityCount === 3, `Expected 3 activities, got ${v2.parseReport.activityCount}`);
  assert(v2.data.dailyPlans.monday.items.length === 2, "Monday should have 2 activities");
  assert(v2.data.dailyPlans.monday.books[0].title === "Planting a Rainbow", "Monday book stays on Monday");
  assert(v2.data.dailyPlans.monday.songs[0].title === "The Farmer Plants the Seeds", "Monday song stays on Monday");
  assert(v2.data.books[0].title === "The Tiny Seed", "Weekly book stays weekly");
  assert(
    v2.data.dailyPlans.monday.items[0].steps.includes("Invite children to scoop and feel the soil."),
    "Directions preserved exactly",
  );
  assert(
    v2.data.dailyPlans.monday.items[0].teacherLanguage.includes("I notice the soil feels damp"),
    "Teacher language preserved",
  );
  assert(v2.data.dailyPlans.monday.circleTime[0].includes("seed tray"), "Circle time captured");

  console.log("4) Invalid category is an error (not silently remapped)");
  const badCategory = v2Text.replace("CATEGORY:\nSensory Play", "CATEGORY:\nCircle Time");
  const bad = parseCurriculumLessonPlanImportV2(badCategory);
  assert(!bad.ok, "Invalid category should fail");
  assert(bad.errors.some((err) => /invalid CATEGORY/i.test(err)), "Invalid category error message");

  console.log("5) Unmapped content is reported");
  const withStray = `${v2Text}\nThis line is outside lesson plan markers.\n`;
  const stray = parseCurriculumLessonPlanImportV2(withStray);
  assert(stray.unmapped.some((entry) => /outside lesson plan/i.test(entry.text) || /outside lesson plan/i.test(entry.reason) || entry.text.includes("outside lesson plan")), "Stray line reported");
  const insideStray = v2Text.replace(
    "@MONDAY_START@\n",
    "@MONDAY_START@\nThis Monday line has no field marker.\n",
  );
  const mondayStray = parseCurriculumLessonPlanImportV2(insideStray);
  assert(
    mondayStray.unmapped.some((entry) => entry.text.includes("This Monday line has no field marker")),
    "Unmapped Monday prose reported",
  );

  console.log("6) Multi-activity day and activity library count");
  assert(v2.parseReport.activityLibraryEntries === 3, "activity library entry count");

  console.log("7) Bulk import detects multiple plans");
  const bulkText = `${fs.readFileSync(V2_SAMPLE, "utf8")}\n${fs.readFileSync(V2_SAMPLE, "utf8").replace("Garden Scientists", "Garden Scientists Week 2")}`;
  const bulk = parseCurriculumLessonPlanBulkImport(bulkText);
  assert(bulk.summary.lessonPlanCount === 2, "bulk count");
  assert(bulk.summary.readyCount === 2, "bulk ready");
  assert(bulk.summary.activityCount === 6, "bulk activity total");

  console.log("8) Single-entry API rejects multi-plan paste");
  const multi = parseCurriculumLessonPlanImport(bulkText);
  assert(!multi.ok, "single parser should reject multi-plan v2 paste");
  assert(multi.errors[0].includes("2 lesson plans"), "multi-plan error");

  console.log("9) Approved v2 categories list is fixed to six play-based categories");
  assert(APPROVED_V2_ACTIVITY_CATEGORIES.length === 6, "six approved categories");
  assert(!APPROVED_V2_ACTIVITY_CATEGORIES.includes("Circle Time"), "Circle Time is not a v2 activity category");

  console.log("10) v3 label-only format parses lesson and activity fields");
  const v3Text = fs.readFileSync(V3_SAMPLE, "utf8");
  const v3 = parseCurriculumLessonPlanImportV3(v3Text);
  if (!v3.ok) throw new Error(v3.errors.join(" | "));
  assert(v3.data.title === "Garden Scientists", "v3 title");
  assert(v3.data.plan === "Pro", "v3 plan preserved");
  assert(v3.data.status === "draft", "v3 status preserved");
  assert(v3.data.age === "Preschool", "v3 age");
  assert(v3.parseReport.activityCount === 4, `Expected 4 activities, got ${v3.parseReport.activityCount}`);
  assert(v3.parseReport.daysPresent.length === 3, "Expected 3 weekdays with activities");
  assert(v3.data.books.length === 2, "v3 weekly books");
  assert(v3.data.songs.length === 2, "v3 weekly songs");
  assert(v3.data.dailyPlans.monday.items.length === 2, "Monday should have 2 activities");
  assert(
    v3.data.dailyPlans.monday.items[0].steps.includes("Invite children to scoop and feel the soil."),
    "Directions preserved exactly",
  );
  assert(
    v3.data.dailyPlans.monday.items[0].description.includes("explore soil texture"),
    "OBJECTIVE maps to description",
  );
  assert(
    v3.data.dailyPlans.monday.items[0].extensions.includes("vocabulary children use"),
    "OBSERVATION_OPPORTUNITIES captured",
  );
  assert(v3.data.dailyPlans.monday.items[0].activityCategory === "Sensory Play", "v3 accepts editor categories");

  console.log("11) v3 missing required fields produce clear errors");
  const noTitle = parseCurriculumLessonPlanImportV3("AGE_GROUP:\nPreschool\n\nMONDAY:\n\nACTIVITY_NAME:\nTest\nCATEGORY:\nArt\nOBJECTIVE:\nTest\nMATERIALS:\nM\nSETUP:\nS\nTEACHER_ROLE:\nT\nDIRECTIONS:\n1. Go\nLEARNING_GOALS:\nG\nOBSERVATION_OPPORTUNITIES:\nO\n");
  assert(!noTitle.ok, "missing TITLE should fail");
  assert(noTitle.errors.some((err) => /TITLE/i.test(err)), "TITLE error message");

  console.log("12) v3 invalid category is an error");
  const badV3Category = v3Text.replace("CATEGORY:\nSensory Play", "CATEGORY:\nNot A Real Category");
  const badV3 = parseCurriculumLessonPlanImportV3(badV3Category);
  assert(!badV3.ok, "Invalid v3 category should fail");
  assert(badV3.errors.some((err) => /invalid CATEGORY/i.test(err)), "Invalid category error message");

  console.log("13) Auto-routing uses v3 for label-only paste");
  const routed = parseCurriculumLessonPlanImport(v3Text);
  assert(routed.ok, routed.errors.join(" "));
  assert(routed.parseReport.formatVersion === 3, "routed format version");

  console.log("\nAll curriculum import parser Phase A checks passed.");
}

try {
  main();
} catch (error) {
  console.error("\nFAIL:", error.message);
  process.exitCode = 1;
}
