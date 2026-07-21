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
  assert(v3.parseReport.activityCount === 6, `Expected 6 activities, got ${v3.parseReport.activityCount}`);
  const routed = parseCurriculumLessonPlanImport(v3Text);
  assert(routed.ok, routed.errors.join(" "));
  assert(routed.parseReport.formatVersion === 3, "routed format version");
  assert(routed.parseReport.daysPresent.join(",") === "monday,tuesday,wednesday,thursday,friday", "garden sample has all weekdays");

  console.log("8) Bulk import supports multiple TITLE: plans");
  const bulk = parseCurriculumLessonPlanBulkImport(`${CURRICULUM_LESSON_IMPORT_V3_TEMPLATE}\n\nTITLE:\nSecond Ocean Plan\nAGE_GROUP:\nPreschool\nTHEME:\nOcean\nPLAN:\nFree\nSTATUS:\ndraft\nWEEKLY_OVERVIEW:\nOverview\nMONDAY\nACTIVITY_NAME:\nWave Dance\nCATEGORY:\nMusic & Movement\nDESCRIPTION:\nDance.\nMATERIALS:\nSpace\nDIRECTIONS:\n1. Dance.\nTEACHER_ROLE:\nLead.\nLEARNING_GOALS:\nMove\n`);
  assert(bulk.summary.lessonPlanCount === 2, "bulk count");
  assert(bulk.summary.readyCount === 2, `bulk ready ${bulk.summary.readyCount}`);

  console.log("\nAll curriculum import parser checks passed.");
}

try {
  main();
} catch (error) {
  console.error("\nFAIL:", error.message);
  process.exitCode = 1;
}
