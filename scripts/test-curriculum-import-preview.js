#!/usr/bin/env node
/**
 * Curriculum import preview tests for the current label-only importer.
 * Run: npm run test:curriculum-import-preview
 */
const fs = require("fs");
const path = require("path");
const {
  buildCurriculumImportPreview,
  applyImportTitleAction,
  resolveDuplicateLessonTitle,
} = require("./curriculum-import-preview.js");
const {
  parseCurriculumLessonPlanImport,
  CURRICULUM_LESSON_IMPORT_V3_TEMPLATE,
} = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");
const V3_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-garden-scientists-v3.txt");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function draftFromParsed(parsedData) {
  const draft = { ...parsedData };
  delete draft.dailyPlansCompat;
  delete draft._formatVersion;
  delete draft._activityCount;
  return draft;
}

function main() {
  console.log("1) Legacy marker format is rejected and not confirmable");
  const legacy = buildCurriculumImportPreview(parseCurriculumLessonPlanImport(fs.readFileSync(V2_SAMPLE, "utf8")), { formatVersion: 2 });
  assert(!legacy.canConfirm, "legacy v2 must not confirm");
  assert(legacy.errors.some((entry) => /no longer supported|label-only|unrecognized/i.test(entry.message)), "legacy error message");

  console.log("2) Ocean Explorers template preview is confirmable");
  const oceanParsed = parseCurriculumLessonPlanImport(CURRICULUM_LESSON_IMPORT_V3_TEMPLATE);
  const ocean = buildCurriculumImportPreview(oceanParsed, { formatVersion: 3 });
  assert(ocean.canConfirm, ocean.errors.map((entry) => entry.message).join(" | "));
  assert(ocean.data.title === "Ocean Explorers", "ocean title");
  assert(ocean.summary.activityCount === 6, "ocean activities");
  assert(ocean.summary.weekdaysDetected === 5, "ocean weekdays");
  assert(/Import & Save will create/i.test(ocean.confirmMessage), "auto-save confirm copy");
  assert(ocean.summary.formatLabel === "Little Learner Hub lesson plan format", "format label");

  console.log("3) Existing v3 sample preview summary");
  const v3Parsed = parseCurriculumLessonPlanImport(fs.readFileSync(V3_SAMPLE, "utf8"));
  const v3Preview = buildCurriculumImportPreview(v3Parsed, { formatVersion: 3 });
  assert(v3Preview.canConfirm, v3Preview.errors.map((entry) => entry.message).join(" | "));
  assert(v3Preview.data.title === "Garden Scientists", "v3 preview title");
  assert(v3Preview.summary.activityCount === 4, "v3 activity count");
  assert(v3Preview.summary.bookCount === 2, "v3 books count");

  console.log("4) Invalid category blocks Import & Save");
  const badText = fs.readFileSync(V3_SAMPLE, "utf8").replace("CATEGORY:\nSensory Play", "CATEGORY:\nNot A Real Category");
  const bad = buildCurriculumImportPreview(parseCurriculumLessonPlanImport(badText), { formatVersion: 3 });
  assert(!bad.canConfirm, "invalid category should block confirm");
  assert(bad.errors.some((entry) => /invalid CATEGORY/i.test(entry.message)), "invalid category error");

  console.log("5) Duplicate title does not silently overwrite");
  const duplicate = resolveDuplicateLessonTitle(
    { title: "Garden Scientists" },
    [{ id: "cur-lp-existing", title: "Garden Scientists" }],
    "",
  );
  assert(duplicate.status === "duplicate", "duplicate title detected");
  const duplicatePreview = buildCurriculumImportPreview(v3Parsed, {
    formatVersion: 3,
    existingPlans: [{ id: "cur-lp-existing", title: "Garden Scientists" }],
  });
  assert(!duplicatePreview.canConfirm, "duplicate title blocks confirm until resolved");
  const resolved = applyImportTitleAction(duplicatePreview, "new-copy");
  assert(resolved.canConfirm, "new-copy title resolves duplicate");
  assert(resolved.data.title.includes("(Import copy)"), "new copy title");

  console.log("6) Confirm draft keeps weekday activities");
  const draft = draftFromParsed(ocean.data);
  assert(draft.dailyPlans.monday.items[0].title === "Ocean Sensory Bin", "draft monday activity");
  assert(draft.dailyPlans.monday.items[1].activityCategory === "Gross Motor", "draft category alias");
  assert(draft.plan === "Pro" && draft.status === "published", "draft keeps plan/status");

  console.log("\nAll curriculum import preview checks passed.");
}

try {
  main();
} catch (error) {
  console.error("\nFAIL:", error.message);
  process.exitCode = 1;
}
