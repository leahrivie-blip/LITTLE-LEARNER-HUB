#!/usr/bin/env node
/**
 * Rich weekly lesson-plan export shaping + field audit.
 * Run: node scripts/test-lesson-plan-weekly-export.js
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const api = require("./lesson-plan-weekly-export.js");
const safe = require("./curriculum-safe-values.js");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const ROOT = path.join(__dirname, "..");
const SAMPLE = path.join(ROOT, "scripts/curriculum-import-samples/ocean-explorers-chatgpt-format.txt");
const GARDEN = path.join(ROOT, "scripts/curriculum-import-samples/label-only-garden-scientists-v3.txt");

function main() {
  console.log("1) Field audit — no core lesson-plan fields left undisplayed");
  const audit = api.auditLessonPlanExportFields();
  assert.deepStrictEqual(audit.weekly.missing, [], `weekly missing: ${audit.weekly.missing}`);
  assert.deepStrictEqual(audit.daily.missing, [], `daily missing: ${audit.daily.missing}`);
  assert.deepStrictEqual(audit.activity.missing, [], `activity missing: ${audit.activity.missing}`);
  assert.ok(audit.activity.condensedIntoNotesOrOmittedOnBoard.includes("setup"));
  assert.ok(audit.activity.condensedIntoNotesOrOmittedOnBoard.includes("steps"));

  console.log("2) Ocean Explorers shapes rich Mon–Fri content");
  const oceanParsed = parseCurriculumLessonPlanImport(fs.readFileSync(SAMPLE, "utf8"));
  assert.ok(oceanParsed.ok, oceanParsed.errors?.join("; "));
  const ocean = safe.normalizeCurriculumLessonPlanForRender(oceanParsed.data);
  const oceanDays = api.buildRichWeeklyDays(ocean);
  const oceanSummary = api.buildWeeklySummary(ocean);
  assert.equal(oceanDays.length, 5);
  assert.match(oceanSummary.title, /Ocean Explorers/i);
  assert.match(oceanSummary.theme, /Ocean/i);
  assert.ok(oceanSummary.objectives.length, "weekly objectives");
  assert.ok(oceanSummary.books.length, "weekly books");
  assert.ok(oceanSummary.songs.length, "weekly songs");
  assert.ok(oceanSummary.weeklyMaterials, "weekly materials");
  assert.ok(oceanSummary.familyConnection, "family connection");

  const monday = oceanDays[0];
  assert.ok(monday.themeFocus, "monday theme focus");
  assert.ok(monday.activitySlots.some(Boolean), "monday activities");
  assert.ok(monday.activitySlots[0]?.title, "activity 1 title");
  assert.ok(monday.activitySlots[0]?.description, "activity 1 description");
  assert.ok(monday.bookOfTheDay, "book of the day");
  assert.ok(monday.materialsNeeded, "materials");
  assert.ok(monday.teacherNotes || monday.teacherNotesDetail?.reminders, "teacher notes");
  assert.ok(monday.teacherNotesDetail?.learningGoals, "learning goals in teacher notes");

  console.log("2b) Quality check — every weekday carries usable classroom content when present in source");
  oceanDays.forEach((day) => {
    assert.ok(day.label, `${day.day} label`);
    assert.ok(day.themeFocus, `${day.day} theme focus`);
    assert.ok(day.activities.length >= 1, `${day.day} should have activities`);
    day.activities.forEach((activity) => {
      assert.ok(activity.title, `${day.day} activity title`);
      assert.ok(activity.description, `${day.day} activity description for ${activity.title}`);
    });
    assert.ok(day.bookOfTheDay, `${day.day} book`);
    assert.ok(day.materialsNeeded, `${day.day} materials`);
    assert.ok(day.teacherNotesDetail?.reminders || day.teacherNotes, `${day.day} teacher notes`);
  });
  assert.ok(oceanSummary.songs.length, "songs appear in weekly summary");
  assert.ok(oceanDays.some((day) => day.teacherNotesDetail?.adaptations || oceanSummary.adaptations), "adaptations available");

  console.log("3) No placeholder filler text is injected for empty days");
  const gardenParsed = parseCurriculumLessonPlanImport(fs.readFileSync(GARDEN, "utf8"));
  assert.ok(gardenParsed.ok, gardenParsed.errors?.join("; "));
  const gardenDays = api.buildRichWeeklyDays(safe.normalizeCurriculumLessonPlanForRender(gardenParsed.data));
  gardenDays.forEach((day) => {
    const blob = JSON.stringify(day);
    assert.ok(!/Open exploration|Follow child interest|________________/i.test(blob), `${day.label} has placeholder text`);
    (day.activitySlots || []).forEach((slot) => {
      if (!slot) return;
      assert.ok(slot.title);
      assert.notEqual(slot.title, "Open exploration");
    });
  });

  console.log("4) Static app.js wires rich export into Download Lesson Plan");
  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  assert.ok(appJs.includes("lessonPlanWeeklyExportApi"), "export api helper missing");
  assert.ok(appJs.includes("WEEKLY LESSON PLAN"), "new weekly PDF title missing");
  assert.ok(appJs.includes("THEME FOCUS"), "theme focus row missing");
  assert.ok(appJs.includes("CIRCLE TIME"), "circle time row missing");
  assert.ok(appJs.includes("BOOK OF THE DAY"), "book row missing");
  assert.ok(appJs.includes("TEACHER NOTES"), "teacher notes row missing");
  assert.ok(appJs.includes("0.42 0.275 0.757"), "purple brand color missing");
  const calendarFn = appJs.slice(
    appJs.indexOf("function buildLessonPlanWeeklyCalendarBoardPdfBlob"),
    appJs.indexOf("function buildLessonPlanPlanningSheetPdfBlob"),
  );
  assert.ok(!/title:\s*"Open exploration"/.test(calendarFn), "calendar PDF should not inject Open exploration placeholder");

  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.ok(indexHtml.includes("lesson-plan-weekly-export.js"), "export script not loaded");

  console.log("\nRich weekly lesson-plan export checks passed.");
  console.log("Audit condensed (still in Full PDF):", audit.activity.condensedIntoNotesOrOmittedOnBoard.join(", "));
}

main();
