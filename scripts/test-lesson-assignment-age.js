#!/usr/bin/env node
/**
 * Planner/calendar assignment writes must not invent Preschool for missing age.
 * Run: npm run test:lesson-assignment-age
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const safe = require("./curriculum-safe-values.js");
const scheduleLib = require("../server/schedule-lib.js");

const ROOT = path.join(__dirname, "..");
const APP_JS = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const SCHEDULE_JS = fs.readFileSync(path.join(ROOT, "scripts/llh-schedule.js"), "utf8");
const SERVER_SCHEDULE_JS = fs.readFileSync(path.join(ROOT, "server/schedule-lib.js"), "utf8");

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing function ${name}`);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed function ${name}`);
}

function main() {
  console.log("1) Assignment age helper keeps missing age empty");
  assert.equal(safe.curriculumAssignmentAgeText("", { age: "" }), "");
  assert.equal(safe.curriculumAssignmentAgeText(null, { age: "" }), "");
  assert.equal(safe.curriculumAssignmentAgeText("", {}), "");
  assert.equal(safe.curriculumAssignmentAgeText("", { age: "Preschool" }), "Preschool");
  assert.equal(safe.curriculumAssignmentAgeText("", { age: "Toddler" }), "Toddler");
  assert.equal(safe.curriculumAssignmentAgeText("", { age: "Infant" }), "Infant");
  assert.equal(safe.curriculumAssignmentAgeText("Toddler", { age: "Preschool" }), "Toddler");
  assert.equal(safe.curriculumAssignmentAgeText("Infant", { age: "" }), "Infant");
  assert.equal(safe.curriculumAssignmentAgeText("Preschool", { age: "" }), "Preschool");
  assert.equal(safe.curriculumAssignmentAgeText("Banana", { age: "Preschool" }), "Banana");
  assert.doesNotMatch(safe.curriculumAssignmentAgeText("", { age: "" }), /Preschool/);
  assert.doesNotMatch(safe.curriculumAssignmentAgeText("Banana", {}), /Preschool/);
  console.log("  PASS helper empty / Toddler / Infant / Preschool / invalid");

  console.log("2) Calendar schedule persist keeps empty assignment age empty");
  const emptyItem = scheduleLib.normalizeScheduleItem({
    type: "lesson_plan",
    lessonPlanId: "cur-lp-empty-age",
    lessonPlanTitle: "Empty Age Assign Fixture",
    ageGroup: "",
    snapshot: { title: "Empty Age Assign Fixture", age: "" },
  });
  assert.equal(emptyItem.ageGroup, "");
  assert.doesNotMatch(String(emptyItem.ageGroup), /Preschool/);

  const toddlerItem = scheduleLib.normalizeScheduleItem({
    type: "lesson_plan",
    lessonPlanTitle: "Toddler Assign Fixture",
    ageGroup: "Toddler",
  });
  assert.equal(toddlerItem.ageGroup, "Toddler");

  const infantItem = scheduleLib.normalizeScheduleItem({
    type: "lesson_plan",
    lessonPlanTitle: "Infant Assign Fixture",
    ageGroup: "Infant",
  });
  assert.equal(infantItem.ageGroup, "Infant");

  const preschoolItem = scheduleLib.normalizeScheduleItem({
    type: "lesson_plan",
    lessonPlanTitle: "Preschool Assign Fixture",
    ageGroup: "Preschool",
  });
  assert.equal(preschoolItem.ageGroup, "Preschool");

  const invalidItem = scheduleLib.normalizeScheduleItem({
    type: "lesson_plan",
    lessonPlanTitle: "Invalid Assign Fixture",
    ageGroup: "Banana",
  });
  assert.equal(invalidItem.ageGroup, "Banana");
  console.log("  PASS calendar persist empty / Toddler / Infant / Preschool / invalid");

  console.log("3) Unrelated planner/day snapshot save does not rewrite age");
  const dayEditor = extractFn(APP_JS, "saveWeeklyPlannerDayEditor");
  assert.match(dayEditor, /updateScheduleLessonSnapshot/);
  assert.doesNotMatch(dayEditor, /ageGroup/);
  assert.doesNotMatch(dayEditor, /Preschool/);
  const collect = extractFn(APP_JS, "collectPlannerData");
  assert.match(collect, /ageGroup:\s*data\.ageGroup/);
  assert.doesNotMatch(collect, /\|\|\s*["']Preschool["']/);
  console.log("  PASS unrelated field saves do not invent Preschool");

  console.log("4) Assignment write functions no longer fallback to Preschool");
  [
    "lessonAssignmentAgeGroup",
    "applyCurriculumLessonToWeeklyPlanner",
    "assignScheduleLessonPlan",
    "assignCurriculumLessonPlanToWeek",
    "handleCurriculumPlannerAssignSubmit",
    "addCurriculumLessonPlanToMainCalendar",
  ].forEach((name) => {
    const body = extractFn(APP_JS, name);
    assert.doesNotMatch(body, /\|\|\s*["']Preschool["']/, `${name} still fabricates Preschool`);
  });
  assert.doesNotMatch(extractFn(SCHEDULE_JS, "assignLessonPlanToWeek"), /\|\|\s*["']Preschool["']/);
  assert.doesNotMatch(extractFn(SCHEDULE_JS, "scheduleItemToLegacyAssignment"), /\|\|\s*["']Preschool["']/);
  assert.doesNotMatch(extractFn(SCHEDULE_JS, "buildPlannerFromLessonItem"), /\|\|\s*["']Preschool["']/);
  assert.doesNotMatch(extractFn(SERVER_SCHEDULE_JS, "normalizeScheduleItem"), /\|\|\s*["']Preschool["']/);
  console.log("  PASS write-path source audit");

  console.log("5) Activity-library parentAge display does not invent Preschool");
  const mapped = extractFn(APP_JS, "loadCurriculumManagedActivities");
  assert.doesNotMatch(mapped, /\|\|\s*["']Preschool["']/);
  assert.match(mapped, /parentAge:\s*parent\?\.age \|\| activity\.parentAge \|\| ""/);
  const card = extractFn(APP_JS, "activityBrowseCard");
  assert.doesNotMatch(card, /\|\|\s*["']Preschool["']/);
  assert.doesNotMatch(card, /\|\|\s*["']All Ages["']/);
  assert.match(card, /age \? `\$\{escapeHtml\(age\)\} · ` : ""/);
  console.log("  PASS activity-library display");

  console.log("\nAll lesson assignment age checks passed.");
}

try {
  main();
} catch (error) {
  console.error("\nFAIL:", error.stack || error.message);
  process.exitCode = 1;
}
