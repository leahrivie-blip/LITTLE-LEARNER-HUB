#!/usr/bin/env node
/**
 * Lesson plan importer: label-only format (ChatGPT paste) tests.
 * Run: node scripts/test-curriculum-import-parser.js
 */
const fs = require("fs");
const path = require("path");
const {
  detectImportFormat,
  parseCurriculumLessonPlanImport,
  parseCurriculumLessonPlanImportV1,
  parseCurriculumLessonPlanImportV3,
  parseCurriculumLessonPlanBulkImport,
  CURRICULUM_LESSON_IMPORT_V3_TEMPLATE,
  normalizeActivityCategory,
} = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const V2_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/premium-garden-scientists-v2.txt");
const V3_SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/label-only-garden-scientists-v3.txt");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  console.log("1) Format detection");
  assert(detectImportFormat(fs.readFileSync(V2_SAMPLE, "utf8")) === "v2", "Premium sample should be detected as legacy v2");
  assert(detectImportFormat(fs.readFileSync(V3_SAMPLE, "utf8")) === "v3", "Label-only sample should be v3");
  assert(detectImportFormat(CURRICULUM_LESSON_IMPORT_V3_TEMPLATE) === "v3", "Ocean Explorers template should be v3");

  console.log("2) Public importer rejects legacy marker format");
  const rejectedV2 = parseCurriculumLessonPlanImport(fs.readFileSync(V2_SAMPLE, "utf8"));
  assert(!rejectedV2.ok, "legacy v2 should be rejected by public importer");
  assert(rejectedV2.errors.some((err) => /no longer supported|label-only/i.test(err)), "legacy rejection message");

  console.log("3) Ocean Explorers ChatGPT-style paste imports cleanly");
  const ocean = parseCurriculumLessonPlanImport(CURRICULUM_LESSON_IMPORT_V3_TEMPLATE);
  if (!ocean.ok) throw new Error(ocean.errors.join(" | "));
  assert(ocean.data.title === "Ocean Explorers", "ocean title");
  assert(ocean.data.status === "published", "Published status normalized");
  assert(ocean.data.plan === "Pro", "plan");
  assert(ocean.data.learningDomains.includes("Science"), "science domain");
  assert(ocean.data.learningDomains.includes("Physical Development"), "motor domains map to Physical Development");
  assert(ocean.parseReport.activityCount === 6, `Expected 6 activities, got ${ocean.parseReport.activityCount}`);
  assert(ocean.parseReport.daysPresent.join(",") === "monday,tuesday,wednesday,thursday,friday", "all weekdays present");
  assert(ocean.data.dailyPlans.monday.items[0].title === "Ocean Sensory Bin", "monday activity");
  assert(ocean.data.dailyPlans.monday.items[1].activityCategory === "Gross Motor", "Gross Motor & Movement alias");
  assert(ocean.data.books.length === 2, "books without pipe separators");
  assert(ocean.data.songs[0].title === "Baby Shark", "songs without pipe separators");

  console.log("4) Weekday headers work with or without colon");
  const noColon = parseCurriculumLessonPlanImport(`TITLE:
Test Plan
AGE_GROUP:
Preschool
THEME:
Theme
PLAN:
Free
STATUS:
draft
WEEKLY_OVERVIEW:
Overview
MONDAY
ACTIVITY_NAME:
Bin Play
CATEGORY:
Sensory Play
DESCRIPTION:
Explore.
MATERIALS:
Bin
DIRECTIONS:
1. Play.
TEACHER_ROLE:
Guide.
LEARNING_GOALS:
Explore
`);
  assert(noColon.ok, noColon.errors.join(" | "));
  assert(noColon.data.dailyPlans.monday.items.length === 1, "monday without colon");

  console.log("5) Inline LABEL: value fields are accepted");
  const inline = parseCurriculumLessonPlanImport(`TITLE: Inline Plan
AGE_GROUP: Preschool
THEME: Theme
PLAN: Free
STATUS: draft
WEEKLY_OVERVIEW: Overview text
MONDAY:
ACTIVITY_NAME: Inline Activity
CATEGORY: Fine Motor
DESCRIPTION: Paint.
MATERIALS: Paint
DIRECTIONS: 1. Paint.
TEACHER_ROLE: Support.
LEARNING_GOALS: Fine motor
`);
  assert(inline.ok, inline.errors.join(" | "));
  assert(inline.data.title === "Inline Plan", "inline title");
  assert(inline.data.dailyPlans.monday.items[0].title === "Inline Activity", "inline activity name");

  console.log("6) Category aliases");
  assert(normalizeActivityCategory("Gross Motor & Movement") === "Gross Motor", "gross motor alias");
  assert(normalizeActivityCategory("Fine Motor") === "Fine Motor", "fine motor exact");

  console.log("7) Existing v3 sample still parses via V3 function and public router");
  const v3Text = fs.readFileSync(V3_SAMPLE, "utf8");
  const v3 = parseCurriculumLessonPlanImportV3(v3Text);
  if (!v3.ok) throw new Error(v3.errors.join(" | "));
  assert(v3.parseReport.activityCount === 4, `Expected 4 activities, got ${v3.parseReport.activityCount}`);
  const routed = parseCurriculumLessonPlanImport(v3Text);
  assert(routed.ok, routed.errors.join(" "));
  assert(routed.parseReport.formatVersion === 3, "routed format version");

  console.log("8) Bulk import supports multiple TITLE: plans");
  const bulk = parseCurriculumLessonPlanBulkImport(`${CURRICULUM_LESSON_IMPORT_V3_TEMPLATE}\n\nTITLE:\nSecond Ocean Plan\nAGE_GROUP:\nPreschool\nTHEME:\nOcean\nPLAN:\nFree\nSTATUS:\ndraft\nWEEKLY_OVERVIEW:\nOverview\nMONDAY\nACTIVITY_NAME:\nWave Dance\nCATEGORY:\nMusic & Movement\nDESCRIPTION:\nDance.\nMATERIALS:\nSpace\nDIRECTIONS:\n1. Dance.\nTEACHER_ROLE:\nLead.\nLEARNING_GOALS:\nMove\n`);
  assert(bulk.summary.lessonPlanCount === 2, "bulk count");
  assert(bulk.summary.readyCount === 2, `bulk ready ${bulk.summary.readyCount}`);

  console.log("9) Legacy V1 never converts empty/invalid age to Preschool");
  function v1Paste(ageBlock) {
    return `TITLE:
V1 Age Fixture
${ageBlock}THEME:
Wheels
PLAN:
Free
STATUS:
draft
MONDAY:
ACTIVITY NAME:
Paint Tracks
CATEGORY:
Art
Description:
Paint.
MATERIALS:
Paint
DIRECTIONS:
1. Paint.
TEACHER_ROLE:
Guide.
LEARNING_GOALS:
Explore
`;
  }
  const v1Missing = parseCurriculumLessonPlanImportV1(v1Paste(""));
  assert(v1Missing.ok, v1Missing.errors.join(" | "));
  assert(v1Missing.data.age === "", "missing V1 age stays empty");
  const v1Empty = parseCurriculumLessonPlanImportV1(v1Paste("AGE_GROUP:\n\n"));
  assert(v1Empty.ok, v1Empty.errors.join(" | "));
  assert(v1Empty.data.age === "", "empty V1 age stays empty");
  const v1Toddler = parseCurriculumLessonPlanImportV1(v1Paste("AGE_GROUP:\nToddler\n"));
  assert(v1Toddler.data.age === "Toddler", "V1 Toddler preserved");
  const v1Infant = parseCurriculumLessonPlanImportV1(v1Paste("AGE_GROUP:\nInfant\n"));
  assert(v1Infant.data.age === "Infant", "V1 Infant preserved");
  const v1Preschool = parseCurriculumLessonPlanImportV1(v1Paste("AGE_GROUP:\nPreschool\n"));
  assert(v1Preschool.data.age === "Preschool", "V1 Preschool preserved");
  const v1Invalid = parseCurriculumLessonPlanImportV1(v1Paste("AGE_GROUP:\nBanana\n"));
  assert(v1Invalid.data.age === "Banana", "invalid V1 age is preserved, not Preschool");
  assert(!/preschool/i.test(v1Missing.data.age), "missing age is not Preschool");
  assert(!/preschool/i.test(v1Empty.data.age), "empty age is not Preschool");
  assert(!/preschool/i.test(v1Invalid.data.age), "invalid age is not normalized to Preschool");

  console.log("10) Published 3-day / 4-day / 5-day pastes import; missing days stay empty");
  function publishedWeekdayPaste(days) {
    const blocks = days.map((day) => `${day}
ACTIVITY_NAME:
${day} Named Activity
CATEGORY:
Art
DESCRIPTION:
Paint.
MATERIALS:
Paint
DIRECTIONS:
1. Paint.
TEACHER_ROLE:
Guide.
LEARNING_GOALS:
Explore
`).join("\n");
    return `TITLE:
Published ${days.length}-Day Fixture
AGE_GROUP:
Preschool
THEME:
Wheels
PLAN:
Free
STATUS:
published
WEEKLY_OVERVIEW:
Intentional ${days.length}-day lesson.
${blocks}`;
  }
  function assertPublishedWeekdayImport(days, label) {
    const parsed = parseCurriculumLessonPlanImport(publishedWeekdayPaste(days));
    assert(parsed.ok, `${label} should import: ${(parsed.errors || []).join(" | ")}`);
    assert(parsed.data.status === "published", `${label} stays published`);
    assert(parsed.parseReport.activityCount === days.length, `${label} activity count ${parsed.parseReport.activityCount}`);
    const keys = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    keys.forEach((key) => {
      assert(parsed.data.dailyPlans[key], `${label} keeps ${key} container`);
      assert(Array.isArray(parsed.data.dailyPlans[key].items), `${label} ${key} items array`);
    });
    days.forEach((day) => {
      const key = day.toLowerCase();
      assert(parsed.data.dailyPlans[key].items.length === 1, `${label} ${day} has one activity`);
      assert(parsed.data.dailyPlans[key].items[0].title === `${day} Named Activity`, `${label} ${day} title`);
    });
    keys.filter((key) => !days.map((day) => day.toLowerCase()).includes(key)).forEach((key) => {
      assert(parsed.data.dailyPlans[key].items.length === 0, `${label} ${key} stays empty`);
      const titles = parsed.data.dailyPlans[key].items.map((item) => item.title || "");
      assert(!titles.some((title) => /no activity scheduled/i.test(title)), `${label} no fake ${key} activity`);
    });
    assert(!(parsed.errors || []).some((err) => /Missing activities|Mon–Fri|Mon-Fri|all five/i.test(err)), `${label} must not require all five ACTIVITY_NAME blocks`);
  }
  assertPublishedWeekdayImport(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "5-day published");
  assertPublishedWeekdayImport(["Monday", "Tuesday", "Wednesday", "Thursday"], "4-day published");
  assertPublishedWeekdayImport(["Monday", "Tuesday", "Wednesday"], "3-day published");

  console.log("11) Zero-activity published paste is still rejected");
  const zero = parseCurriculumLessonPlanImport(`TITLE:
Zero Activity Fixture
AGE_GROUP:
Toddler
THEME:
Wheels
PLAN:
Free
STATUS:
published
WEEKLY_OVERVIEW:
No named activities.
MONDAY
`);
  assert(!zero.ok, "zero-activity published paste must fail");
  assert(zero.errors.some((err) => /ACTIVITY_NAME/i.test(err)), "zero-activity error mentions ACTIVITY_NAME");
  assert(!(zero.data && zero.data.dailyPlans && Object.values(zero.data.dailyPlans).some((day) => (day.items || []).some((item) => /no activity scheduled/i.test(item.title || "")))), "zero-activity must not invent placeholders");

  console.log("\nAll curriculum import parser checks passed.");
}

try {
  main();
} catch (error) {
  console.error("\nFAIL:", error.message);
  process.exitCode = 1;
}
