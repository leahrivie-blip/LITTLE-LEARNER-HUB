#!/usr/bin/env node
/**
 * Focused tests for Owner Admin Paste Printable Update.
 * Run: npm run test:teaching-kit-printable-paste
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const paste = require("./teaching-kit-printable-paste.js");
const weekPaste = require("./teaching-kit-paste-import.js");
const lessonPaste = require("./curriculum-lesson-structure-paste.js");

const ROOT = path.join(__dirname, "..");
let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

const VISUAL_STRIP = `Title:
Tummy-Time Visual Strip
Type:
Printable
Age group:
Infant 0–6 Months
Theme:
Tummy Time Adventures
Description:
Simple teacher-use visual cards for tummy-time routines, including Look, Reach, Listen, Turn, Rest, and All Done. Designed to support responsive interaction, movement, and communication during supervised tummy time.
Page count:
1
Access level:
Free
Printing instructions:
Print on standard US Letter paper at 100% scale. For repeated classroom use, print on cardstock or laminate after printing. Keep cards under adult control and out of babies’ mouths and unsupervised reach.`;

const VISUAL_STRIP_WITH_LESSON = `Title:
Tummy-Time Visual Strip
Type:
Printable
Age group:
Infant 0–6 Months
Theme:
Tummy Time Adventures
Link to lesson:
Tummy Time Adventures
Description:
Simple teacher-use visual cards for tummy-time routines, including Look, Reach, Listen, Turn, Rest, and All Done.
Page count:
1
Access level:
Free
Printing instructions:
Print on standard US Letter paper at 100% scale. For repeated classroom use, print on cardstock or laminate after printing.`;

const OBSERVATION_CARD = `Title:
Tummy Time Observation & Progress Card
Type:
Printable
Age group:
Infant 0–6 Months
Theme:
Tummy Time Adventures
Link to lesson:
Tummy Time Adventures
Description:
Teacher observation sheet for tracking head lifting, turning, visual tracking, reaching, sound response, forearm support, weight shifting, early rolling movements, tummy-time comfort, and preferred support.
Page count:
1
Access level:
Free
Printing instructions:
Print on standard US Letter paper at 100% scale. Use one copy per child as needed for observations and progress notes. Store completed forms according to your program’s documentation and privacy procedures.`;

const currentLesson = {
  id: "cur-lp-tummy-time-adventures",
  title: "Tummy Time Adventures",
  age: "Infant 0–6 Months",
  status: "draft",
};
const toddlerSameTitle = {
  id: "cur-lp-tummy-time-toddler",
  title: "Tummy Time Adventures",
  age: "Toddler 12–24 Months",
  status: "draft",
};
const otherLesson = {
  id: "cur-lp-other-theme",
  title: "Other Theme",
  age: "Infant 0–6 Months",
  status: "published",
};
const lessons = [currentLesson, toddlerSameTitle, otherLesson];

function main() {
  const parsed = paste.parsePrintablePaste(VISUAL_STRIP);
  ok(parsed.valid, "1. Visual Strip parse is valid");
  ok(parsed.values.title === "Tummy-Time Visual Strip", "1. title");
  ok(parsed.values.resourceType === "Printable", "1. type Printable");
  ok(parsed.values.ageGroup === "Infant 0–6 Months", "1. canonical age");
  ok(parsed.values.theme === "Tummy Time Adventures", "1. theme");
  ok(String(parsed.values.description).includes("Look, Reach, Listen"), "1. description");
  ok(parsed.values.pageCount === 1, "1. page count 1");
  ok(parsed.values.accessLevel === "free", "1. access free");
  ok(String(parsed.values.printingInstructions).includes("US Letter"), "1. printing instructions");

  const obs = paste.parsePrintablePaste(OBSERVATION_CARD);
  ok(obs.valid && obs.values.title === "Tummy Time Observation & Progress Card", "2. Observation card title");
  ok(obs.values.pageCount === 1 && obs.values.accessLevel === "free", "2. Observation card pages/access");

  const mixedCase = paste.parsePrintablePaste(`TITLE:
Tummy-Time Visual Strip
type:
printable
AGE GROUP:
Infant 0–6 Months
THEME:
Tummy Time Adventures
DESCRIPTION:
Hello
PAGE COUNT:
1
ACCESS LEVEL:
free
PRINTING INSTRUCTIONS:
Print.`);
  ok(mixedCase.valid && mixedCase.values.title === "Tummy-Time Visual Strip", "3. mixed heading capitalization");

  const hyphenAge = paste.parsePrintablePaste(`Title:
Card
Age group:
Infant 0-6 months
Page count:
1
Access level:
Free`);
  ok(hyphenAge.values.ageGroup === "Infant 0–6 Months", "4. hyphen age maps to canonical en dash band");

  const multiDesc = paste.parsePrintablePaste(`Title:
Card
Description:
Line one.
Line two.
Page count:
1
Access:
Free`);
  ok(multiDesc.values.description === "Line one.\nLine two.", "5. multiline description");

  const multiPrint = paste.parsePrintablePaste(`Title:
Card
Printing instructions:
Print on US Letter paper.
Use 100% scale.
Optional: laminate for repeated classroom use.
Page count:
1
Access:
Pro`);
  ok(multiPrint.values.printingInstructions.includes("100% scale"), "6. multiline printing instructions");
  ok(multiPrint.values.accessLevel === "pro", "6. Pro access");

  ok(paste.parsePageCount("one").error.includes("positive whole number"), "7. reject 'one'");
  ok(paste.parsePageCount("0").error.includes("positive whole number"), "7. reject 0");
  ok(paste.parsePageCount("-1").error.includes("positive whole number"), "7. reject -1");
  ok(paste.parsePageCount("2").value === 2, "7. accept 2");

  const badAge = paste.parsePrintablePaste(`Title:\nX\nAge group:\nInfant 0–7 Months\nPage count:\n1\nAccess:\nFree`);
  ok(!badAge.valid && badAge.errors.some((e) => /Age group/.test(e) && /Infant 0–7 Months/.test(e)), "8. unknown age rejected");

  const badAccess = paste.parsePrintablePaste(`Title:\nX\nAccess level:\nPremium\nPage count:\n1`);
  ok(!badAccess.valid && badAccess.errors.some((e) => /Premium/.test(e) && /Free, Pro/.test(e)), "9. unknown access rejected");

  const existingDraft = {
    lessonPlanId: currentLesson.id,
    resourceId: "res-existing",
    title: "Old Title",
    resourceType: "Printable",
    ageGroup: "Infant 0–6 Months",
    theme: "Tummy Time Adventures",
    description: "Old description",
    pageCount: "4",
    accessLevel: "pro",
    printingInstructions: "Old print notes",
    pdfFile: { name: "keep.pdf" },
    pdfFileName: "keep.pdf",
    previewFile: { name: "keep.png" },
    previewFileName: "keep.png",
    previewImageUrl: "https://example.test/keep.png",
  };
  const partialPreview = paste.buildPrintablePastePreview(`Title:
New Title
Description:
New Description`, {
    currentLesson,
    lessons,
    existingResource: {
      id: "res-existing",
      lessonPlanIds: [currentLesson.id],
      fileName: "keep.pdf",
      previewImageUrl: "https://example.test/keep.png",
    },
  });
  ok(partialPreview.canApply, "10. partial paste preview can apply");
  const merged = paste.applyPrintablePasteToDraft(existingDraft, partialPreview);
  ok(merged.title === "New Title" && merged.description === "New Description", "10. partial updates included fields");
  ok(merged.resourceType === "Printable" && merged.ageGroup === "Infant 0–6 Months", "10. type/age unchanged");
  ok(merged.theme === "Tummy Time Adventures" && merged.pageCount === "4", "10. theme/pages unchanged");
  ok(merged.accessLevel === "pro" && merged.printingInstructions === "Old print notes", "10. access/print unchanged");
  ok(merged.pdfFile && merged.pdfFile.name === "keep.pdf", "11. existing PDF untouched");
  ok(merged.previewFile && merged.previewFileName === "keep.png", "12. existing preview image untouched");
  ok(merged.pasteLinkedLessonPlanId === currentLesson.id, "13. lesson link stays current lesson");
  ok(partialPreview.statusAfterSave === "draft" && partialPreview.publishes === false, "14-15. remains draft, no auto publish");

  const appJs = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  ok(appJs.includes("Save draft & link to lesson"), "16. manual save CTA still present");
  ok(appJs.includes('data-tk-printable-field="pdfFile"'), "16. PDF still manual");
  ok(appJs.includes('data-tk-printable-field="previewFile"'), "16. preview still manual");
  ok(appJs.includes("data-tk-printable-paste-open"), "16. paste button in printable form");
  ok(appJs.includes("applyPrintablePasteToDraft") || appJs.includes("LLHTeachingKitPrintablePaste"), "16. client uses printable paste module");

  const weekPreview = weekPaste.buildWeekPreview("Weekly overview:\nKeep week paste working.", {
    weeklyOverview: "old",
    teacherToolkit: {},
  }, { id: "plan-1", title: "Tummy Time Adventures" });
  ok(weekPreview && (weekPreview.fieldChanges || []).length >= 1, "17. Paste Week Update still parses");

  const actPreview = weekPaste.buildActivityPreview("Activity name:\nRolling Rattle", {
    id: "act-1",
    itemId: "mon-1",
    title: "Old",
  }, { title: "Old" }, "act-1");
  ok(actPreview && actPreview.scope === "activity", "18. Paste Activity Update still parses");

  const structure = lessonPaste.parseFullLessonStructurePaste("Lesson plan name:\nDemo Week\nAge band:\nInfant 0–6 Months\nMonday:\nTummy Time");
  ok(structure && structure.lesson && structure.lesson.title === "Demo Week", "19. Create New Lesson Plan big paste still parses");
  ok(structure.lesson.age === "Infant 0–6 Months", "19. lesson paste still reuses age bands");

  const fromLessonPreview = paste.buildPrintablePastePreview(VISUAL_STRIP_WITH_LESSON, {
    currentLesson,
    lessons,
  });
  ok(fromLessonPreview.canApply, "link.1 current lesson is default/matching target");
  ok(fromLessonPreview.linkedLesson.id === currentLesson.id, "link.2/3 exact lesson resolved");
  ok(fromLessonPreview.destinationLabel === "Linked Resources → Printables", "link.7 destination Linked Resources → Printables");
  ok(fromLessonPreview.destination !== "printable_ideas", "link.8 not Printable Ideas");
  const ideasBlocked = paste.parsePrintablePaste(`Title:\nX\nType:\nPrintable\nResource placement:\nPrintable Ideas\nPage count:\n1\nAccess:\nFree`);
  ok(!ideasBlocked.valid && ideasBlocked.errors.some((e) => /Printable Ideas/.test(e)), "link.8 Printable Ideas placement is rejected");
  ok(fromLessonPreview.previewRows.some((row) => row.label === "PDF" && /not uploaded/i.test(row.value)), "link.13 PDF still required upload");
  ok(fromLessonPreview.previewRows.some((row) => row.label === "Preview image"), "link.14 preview image manual");
  ok(fromLessonPreview.publishes === false, "link.17 no automatic publish");

  const defaultDest = paste.buildPrintablePastePreview(`Title:\nStrip\nType:\nPrintable\nAge group:\nInfant 0–6 Months\nPage count:\n1\nAccess:\nFree`, {
    currentLesson,
    lessons,
  });
  ok(defaultDest.destinationLabel === "Linked Resources → Printables", "default placement when Resource placement omitted");
  ok(defaultDest.linkedLesson.id === currentLesson.id, "current lesson used when Link to lesson omitted");

  const outside = paste.resolveLinkedLesson({
    pastedLessonRaw: "Tummy Time Adventures",
    ageDisplay: "Infant 0–6 Months",
    currentLesson: null,
    lessons,
  });
  ok(outside.ok && outside.lesson.id === currentLesson.id, "link.4 age band disambiguates duplicate titles");

  const ambiguous = paste.resolveLinkedLesson({
    pastedLessonRaw: "Tummy Time Adventures",
    currentLesson: null,
    lessons,
  });
  ok(!ambiguous.ok && ambiguous.ambiguous === true, "link.5 ambiguous lessons are never guessed");

  const conflict = paste.resolveLinkedLesson({
    pastedLessonRaw: "Other Theme",
    currentLesson,
    lessons,
  });
  ok(conflict.conflict && /Choose which lesson/.test(conflict.error), "link.6 wrong pasted lesson vs current triggers warning");

  const already = paste.existingLessonResourceLink(
    { id: "res-1", lessonPlanIds: [currentLesson.id] },
    currentLesson.id,
  );
  ok(already === true, "link.12 existing lesson-resource link detected (no duplicate needed)");
  ok(paste.existingLessonResourceLink({ id: "res-1", lessonPlanIds: [currentLesson.id] }, otherLesson.id) === false, "link.12 other lesson not treated as linked");

  const applyLinked = paste.applyPrintablePasteToDraft({
    lessonPlanId: currentLesson.id,
    title: "",
    pdfFile: null,
    previewFile: null,
  }, fromLessonPreview);
  ok(applyLinked.pasteLinkedLessonPlanId === currentLesson.id, "after apply sets lesson reference");
  ok(applyLinked.pdfFile == null && applyLinked.previewFile == null, "apply does not invent files");

  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  ok(indexHtml.includes("teaching-kit-printable-paste.js"), "script tag registered");

  const editorJs = fs.readFileSync(path.join(ROOT, "scripts/teaching-kit-enrichment-editor.js"), "utf8");
  ok(editorJs.includes("data-paste-week-update") && editorJs.includes("data-paste-activity-update"), "18/19 week/activity buttons unchanged");

  const types = paste.resolvePrintableType("Printable");
  ok(types.value === "Printable", "canonical type Printable");
  ok(paste.resolvePrintableType("Book", ["Printable"]).error, "unknown type blocked");

  console.log(`OK — teaching-kit-printable-paste (${passed} assertions)`);
}

main();
