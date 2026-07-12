#!/usr/bin/env node
/**
 * Full v3 import workflow verification.
 * Run: node scripts/test-curriculum-v3-full-workflow.js
 */
const fs = require("fs");
const path = require("path");
const {
  parseCurriculumLessonPlanImport,
  parseCurriculumLessonPlanImportV3,
} = require("./curriculum-lesson-import-parser.js");
const { buildCurriculumImportPreview } = require("./curriculum-import-preview.js");
const {
  renderCurriculumLessonPlanHtml,
  renderCurriculumActivityHtml,
  curriculumLessonDayActivityCardHtml,
} = require("./curriculum-lesson-viewer-render.js");

const ROOT = path.join(__dirname, "..");
const FULL_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-full-workflow-v3.txt");
const CURRICULUM_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const text = fs.readFileSync(FULL_SAMPLE, "utf8");
  const parsed = parseCurriculumLessonPlanImportV3(text);
  if (!parsed.ok) throw new Error(parsed.errors.join(" | "));

  assert(parsed.parseReport.activityCount === 15, `Expected 15 activities, got ${parsed.parseReport.activityCount}`);
  assert(parsed.parseReport.daysPresent.length === 5, "Expected 5 weekdays");
  assert(parsed.data.books.length === 3, "Expected 3 books");
  assert(parsed.data.songs.length === 3, "Expected 3 songs");
  assert(parsed.data.age.includes("Preschool"), "Detailed age group preserved");
  assert(parsed.data.plan === "Free", "Plan preserved");
  assert(parsed.data.status === "published", "Status preserved");
  assert(parsed.unmapped.length === 0, `Unexpected unmapped lines: ${parsed.unmapped.map((e) => e.text).join(" | ")}`);

  const preview = buildCurriculumImportPreview(parsed, { formatVersion: 3 });
  assert(preview.canConfirm, preview.errors.map((e) => e.message).join(" | "));
  assert(preview.summary.activityCount === 15, "Preview activity count");
  assert(preview.summary.weekdaysDetected === 5, "Preview weekday count");
  assert(preview.summary.bookCount === 3, "Preview book count");
  assert(preview.summary.songCount === 3, "Preview song count");
  assert(preview.summary.errorCount === 0, "Preview errors");

  CURRICULUM_WEEKDAYS.forEach((day) => {
    assert(parsed.data.dailyPlans[day].items.length === 3, `${day} should have 3 activities`);
    parsed.data.dailyPlans[day].items.forEach((item) => {
      assert(item.objective, `${item.title} missing objective`);
      assert(item.description, `${item.title} missing description`);
      assert(item.materials, `${item.title} missing materials`);
      assert(item.setup, `${item.title} missing setup`);
      assert(item.teacherRole, `${item.title} missing teacherRole`);
      assert(item.steps, `${item.title} missing directions`);
      assert(item.learningGoals.length, `${item.title} missing learningGoals`);
      assert(item.observationOpportunities, `${item.title} missing observationOpportunities`);
      assert(item.objective !== item.description, `${item.title} objective/description must differ`);
    });
  });

  const lessonHtml = renderCurriculumLessonPlanHtml(parsed.data, { mode: "print" });
  assert(lessonHtml.includes("Objective"), "Viewer shows Objective heading");
  assert(lessonHtml.includes("Description"), "Viewer shows Description heading");
  assert(lessonHtml.includes("Observation opportunities"), "Viewer shows observation opportunities");
  assert(!lessonHtml.includes("Extensions"), "Viewer should not label observations as Extensions for v3 activities");
  assert(lessonHtml.includes("Learning Domains"), "Weekly learning domains section present");

  const firstActivity = parsed.data.dailyPlans.monday.items[0];
  const activityHtml = renderCurriculumActivityHtml(firstActivity, { parentTitle: parsed.data.title, parentAge: parsed.data.age });
  assert(activityHtml.includes("Objective"), "Activity viewer objective");
  assert(activityHtml.includes(firstActivity.description), "Activity viewer description");

  const cardHtml = curriculumLessonDayActivityCardHtml("cur-lp-test", firstActivity);
  assert(cardHtml.includes(firstActivity.objective), "Activity card objective");
  assert(cardHtml.includes(firstActivity.description), "Activity card description");

  const routed = parseCurriculumLessonPlanImport(text);
  assert(routed.parseReport.formatVersion === 3, "Auto-detected v3");

  console.log("All v3 full workflow checks passed.");
  console.log(`Import counts: 1 plan, 5 weekdays, 15 activities, 3 books, 3 songs, 0 errors, ${parsed.unmapped.length} unmapped`);
}

try {
  main();
} catch (error) {
  console.error("\nFAIL:", error.message);
  process.exitCode = 1;
}
