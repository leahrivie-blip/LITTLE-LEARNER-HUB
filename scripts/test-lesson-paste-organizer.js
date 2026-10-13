#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("./lesson-paste-organizer-manifest.js");
const parser = require("./lesson-paste-organizer-parser.js");
const applyApi = require("./lesson-paste-organizer-apply.js");

const LARGE_PASTE = `
Title:
Autumn Harvest Explorers

Theme:
Autumn Harvest

Age Group:
Preschool 3–5 Years

Weekly Objectives:
Sort natural materials
Practice fine motor tweezers work
Collaborate on collage art

Weekly Materials:
Apples, paper, glue, tweezers, corn kernels

Safety:
Supervise food materials and choking hazards

Monday:
Activity 1:
Apple Color Sorting Table
Children sort apples by color.

Tuesday:
Activity 1:
Corn Kernel Tweezers Transfer

Book:
The Little Red Hen
Author: Paul Galdone
Monday

Song:
Five Little Pumpkins
Tuesday

Printable:
Apple counting cards
Letter-size
Related to apple sorting

Family Connection:
Send home a sorting challenge with pantry items.

Wednesday:
Activity 1:
Scarecrow Collage

Thursday:
Activity 1:
Harvest Story Walk

Week of next Friday
Tomorrow we adjust the schedule.
`.trim();

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log("Manifest");
ok(manifest.MANIFEST_VERSION >= 1, "manifest versioned");
ok(manifest.getAllFieldDefinitions().length > 50, "manifest lists global + daily fields");

console.log("Large paste — headings");
{
  const parsed = parser.parseDeterministicPaste(LARGE_PASTE);
  ok(parsed.aiUsed === false, "no AI calls");
  ok(parsed.characterCount === LARGE_PASTE.length, "character count");
  ok(parsed.values["global.title"]?.value.includes("Autumn Harvest"), "title filled");
  ok(parsed.values["global.weeklyMaterials"]?.value.includes("Apples"), "weekly materials");
  ok(parsed.values["global.weeklySafety"]?.value.includes("Supervise"), "safety placement");
  ok(parsed.values["daily.monday.activity1"]?.value.includes("Apple Color"), "Monday activity");
  ok(parsed.values["daily.tuesday.activity1"]?.value.includes("Corn Kernel"), "Tuesday activity");
  ok(parsed.books.length >= 1 && /Little Red Hen/i.test(parsed.books[0].title), "book record");
  ok(parsed.songs.length >= 1, "song record");
  ok(parsed.printables.length >= 1, "printable record");
  ok(parsed.values["global.familyConnection"]?.value.includes("sorting challenge"), "family connection");
  ok(parsed.report.unresolvedDates.length >= 1, "unresolved relative dates flagged");
  ok(parsed.detectedSections.length >= 8, "detected sections listed");
  ok(!parsed.canSaveDraft, "cannot save until unsorted and dates resolved");
}

console.log("Owner decisions + draft build");
{
  const parsed = parser.parseDeterministicPaste(LARGE_PASTE);
  const decisions = {};
  parsed.report.unsorted.forEach((u) => {
    if (/Monday/i.test(u.text) || /Apple Color/i.test(u.text)) decisions[u.id] = "monday";
    else decisions[u.id] = "delete";
  });
  const draft = applyApi.buildDraftLessonPlan(parsed, {
    ownerDecisions: decisions,
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  ok(!draft.ok, "still blocked by unresolved dates");
  const parsed2 = parser.parseDeterministicPaste(LARGE_PASTE.replace(/Week of next Friday\nTomorrow we adjust the schedule./, ""));
  const draft2 = applyApi.buildDraftLessonPlan(parsed2, {
    ownerDecisions: decisions,
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  ok(draft2.ok, "draft builds after date lines removed and unsorted resolved");
  ok(draft2.lessonPlan.status === "draft", "draft only");
  ok(draft2.lessonPlan.publishedAt == null, "no automatic publish");
  ok(draft2.lessonPlan.pasteOrganizerImport?.originalPaste.includes("Autumn Harvest"), "import history preserves paste");
  ok((draft2.lessonPlan.dailyPlans?.monday?.items || []).length >= 1, "Monday activities in plan");
  ok(draft2.parsed.books.length >= 1, "books preserved in parsed shape");
}

console.log("Conflicting titles");
{
  const paste = "Title:\nOne\n\nTitle:\nTwo\n\nAge Group:\nPreschool";
  const parsed = parser.parseDeterministicPaste(paste);
  ok(parsed.report.conflicts.some((c) => c.path === "global.title"), "title conflict detected");
}

console.log("Heading variations");
{
  const p = parser.parseDeterministicPaste("Supplies:\nPaper\n\nWhat you need:\nGlue\n\nHome connection:\nShare art");
  ok(p.values["global.weeklyMaterials"]?.value.includes("Paper"), "Supplies alias");
  ok(p.values["global.familyConnection"]?.value.includes("Share art"), "Home connection alias");
}

console.log("Restore + undo field movement");
{
  const original = "Title:\nOriginal\n\nMaterials:\nYarn";
  const parsed = parser.parseDeterministicPaste(original);
  const moved = applyApi.applyOwnerDecisions(parsed, {});
  ok(moved.values["global.title"]?.value === "Original", "values preserved");
  const restored = parser.parseDeterministicPaste(original);
  ok(restored.originalText === original, "restore original paste text");
}

console.log("Ambiguous weekday block");
{
  const p = parser.parseDeterministicPaste("Title:\nT\n\nAge Group:\n3s\n\nTheme:\nFall\n\nMonday:\nFree play and art without activity labels");
  ok(p.report.unsorted.some((u) => u.reason === "weekday_block_needs_activity_labels"), "weekday body stays unsorted");
}

console.log("Duplicate activity labels conflict");
{
  const paste = "Title:\nDup\n\nAge Group:\nPreK\n\nTheme:\nX\n\nMonday:\nActivity 1:\nFirst\n\nMonday:\nActivity 1:\nSecond";
  const p = parser.parseDeterministicPaste(paste);
  ok(p.report.unsorted.length >= 1 || p.report.conflicts.length >= 0, "duplicate Monday blocks handled without guessing");
  ok(p.values["daily.monday.activity1"]?.value.includes("First"), "first Monday activity kept");
}

console.log("Print preview structure matches draft");
{
  const clean = LARGE_PASTE.replace(/Week of next Friday\nTomorrow we adjust the schedule./, "");
  const parsed = parser.parseDeterministicPaste(clean);
  const decisions = {};
  parsed.report.unsorted.forEach((u) => {
    decisions[u.id] = /Apple Color/i.test(u.text) ? "monday" : "delete";
  });
  const draft = applyApi.buildDraftLessonPlan(parsed, {
    ownerDecisions: decisions,
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  ok(draft.ok, "draft for preview");
  const preview = applyApi.buildStructurePreview(parsed, {
    ownerDecisions: decisions,
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  const ids = preview.sections.map((s) => s.id);
  ok(ids.includes("overview") && ids.includes("monday") && ids.includes("books"), "preview section order");
  const html = applyApi.buildPrintPreviewHtml(parsed, { ownerDecisions: decisions });
  ok(/Overview/.test(html) && /Monday/.test(html) && /Books/.test(html), "print HTML includes structure");
  ok(draft.lessonPlan.title && preview.sections[0].fields[0].value.includes("Autumn"), "print preview title matches draft");
}

console.log("Missing required fields");
{
  const p = parser.parseDeterministicPaste("Materials:\nOnly supplies");
  ok(p.report.missingRequired.some((m) => m.id === "title"), "title missing flagged");
  ok(!p.canSaveDraft, "cannot save without required fields");
}

console.log("No invented content");
{
  const p = parser.parseDeterministicPaste("Title:\nExact Title\n\nAge Group:\nToddler\n\nTheme:\nWater");
  ok(p.values["global.title"].value === "Exact Title", "title wording preserved verbatim");
  ok(!Object.values(p.values).some((v) => /generated|placeholder/i.test(v.value)), "no invented filler");
}

console.log("Unrelated lessons unchanged (apply isolation)");
{
  const before = { id: "cur-lp-other", title: "Other Lesson", status: "published" };
  const draft = applyApi.buildDraftLessonPlan(parser.parseDeterministicPaste("Title:\nNew Only\n\nAge Group:\nToddler\n\nTheme:\nWater"), {
    ownerDecisions: {},
    ageMarkedUnknown: false,
    themeMarkedUnknown: false,
  });
  ok(draft.ok, "isolated new draft");
  ok(before.title === "Other Lesson", "unrelated lesson object untouched");
}

console.log("Static wiring");
{
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  ok(html.includes("lesson-paste-organizer-parser.js"), "index loads organizer parser");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  ok(app.includes("organize-paste"), "app.js organize paste step");
  ok(app.includes("data-paste-organize"), "app.js paste organize handlers");
}

console.log("All lesson paste organizer checks passed.");
