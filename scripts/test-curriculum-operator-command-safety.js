#!/usr/bin/env node
/**
 * Operator command parser safety regression suite (opjob_506cd34286d3baac class).
 * Run: npm run test:curriculum-operator-command-safety
 */
"use strict";

const assert = require("node:assert/strict");
const commandApi = require("./curriculum-operator-command.js");
const selectApi = require("./curriculum-operator-select.js");

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const HELLO_FALL_ID = "cur-lp-19fb387f75cfd1f1745";

const lessonPlans = [
  { id: LMW_ID, title: "Little Makers Workshop", age: "Toddler 12–24 Months", plan: "Free", status: "draft" },
  { id: HELLO_FALL_ID, title: "Hello Fall, Little One", age: "Toddler 12–24 Months", plan: "Free", status: "draft" },
  { id: "cur-lp-weather-watchers", title: "Weather Watchers", age: "Toddler 18–24 Months", plan: "Pro", status: "published" },
];

const curriculum = { lessonPlans, activities: [], resources: [] };

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function parse(raw, options = {}) {
  return commandApi.parseOperatorCommand(raw, {
    phase: 7,
    lessonPlans,
    currentlySelectedLessonId: options.currentlySelectedLessonId || HELLO_FALL_ID,
    ...options,
  });
}

const PRODUCTION_BAD_COMMAND = `ONE CONTROLLED VOCABULARY-ONLY connected upgrade on the EXISTING lesson only.

Lesson: Little Makers Workshop
Lesson ID: ${LMW_ID}

TARGET: Vocabulary only
learning domains KEEP
milestones KEEP
activities KEEP
teacher tips KEEP
books EXCLUDED FROM MUTATION
songs EXCLUDED FROM MUTATION
IMAGES: EXCLUDED
cover EXCLUDED
printables EXCLUDED
publish false
textOnly expected true
weeklyFieldScope vocabulary only

checkImages=false
generateImages=false
touchImages=false
checkPrintables=false
generatePrintables=false
touchPrintables=false
touchSongs=false
touchBooks=false
connectedUpgrade=true
connectedAutoApply=true

CURRENT VOCABULARY STATE
plan.vocabularyWords = ""
teachingKit.vocabCards contains one MALFORMED legacy combined-word card similar to:
{ word: "art, create, explore, build, sticky, paper, press, paint" }

HARD SUCCESS REQUIRES BOTH
teachingKit.vocabCards valid structured cards
plan.vocabularyWords synchronized

Do NOT generate images.
Do NOT touch printables.
Do NOT perform a broad lesson upgrade.
Save draft. Do not publish.`;

console.log("1) exact production bad command post-fix");
{
  const parsed = parse(PRODUCTION_BAD_COMMAND);
  const actions = parsed.command.actions;
  ok(parsed.command.intent !== "finish_images", "not finish_images");
  ok(actions.textOnly === true, "textOnly=true");
  ok(actions.connectedUpgrade === true, "connectedUpgrade=true");
  ok(actions.connectedAutoApply === true, "connectedAutoApply=true");
  ok(actions.publish === false, "publish=false");
  ok(JSON.stringify(actions.weeklyFieldScope) === JSON.stringify(["vocabCards"]), "weeklyFieldScope vocabulary only");
  ok(actions.checkImages === false, "checkImages=false");
  ok(actions.generateImages === false, "generateImages=false");
  ok(actions.touchImages === false, "touchImages=false");
  ok(actions.checkPrintables === false, "checkPrintables=false");
  ok(actions.generatePrintables === false, "generatePrintables=false");
  ok(actions.touchPrintables === false, "touchPrintables=false");
  ok(actions.touchSongs === false, "touchSongs=false");
  ok(actions.touchBooks === false, "touchBooks=false");
  ok(actions.createLesson !== true, "createLesson=false");
  ok(parsed.command.scope.lessonIds.length === 1, "one lesson ID");
  ok(parsed.command.scope.lessonIds[0] === LMW_ID, "exact LMW ID only");
  ok(!parsed.command.scope.lessonIds.includes(HELLO_FALL_ID), "no Hello Fall ID");
  ok(!parsed.command.parsedNotes.some((n) => /Phase 6 may generate justified activity images/i.test(n)), "no Phase 6 image note");
  ok(!parsed.needsConfirmation || !parsed.confirmReasons.includes("multiple_lessons_matched"), "no multiple_lessons_matched");
  const selected = selectApi.selectLessons(curriculum, parsed.command);
  ok(selected.selected.length === 1, "selection resolves one lesson");
  ok(selected.selected[0].id === LMW_ID, "selection is LMW");
}

console.log("\n2) short vocabulary-only command");
{
  const parsed = parse(`Fix vocabulary only for ${LMW_ID}. connectedUpgrade=true connectedAutoApply=true publish=false`);
  ok(parsed.command.actions.weeklyFieldScope?.includes("vocabCards"), "vocab scope");
  ok(parsed.command.actions.textOnly === true, "textOnly");
  ok(parsed.command.scope.lessonIds[0] === LMW_ID, "exact ID");
}

console.log("\n3) exclusions without images");
{
  const parsed = parse("Fix vocabulary only. Do not touch images or printables.");
  ok(parsed.command.actions.touchImages === false, "touchImages false");
  ok(parsed.command.actions.touchPrintables === false, "touchPrintables false");
}

console.log("\n4) audit images but don't replace");
{
  const parsed = parse(`Audit images but don't replace them for ${LMW_ID}.`);
  ok(parsed.command.actions.checkImages === true, "checkImages true");
  ok(parsed.command.actions.touchImages === false, "touchImages false");
  ok(parsed.command.actions.generateImages === false, "generateImages false");
}

console.log("\n5) finish_images still works");
{
  const parsed = parse("Finish all images for Little Makers Workshop.");
  ok(parsed.command.intent === "finish_images" || parsed.command.actions.generateImages === true, "finish_images path preserved");
}

console.log("\n6) full-kit still works");
{
  const parsed = parse("Finish the full Teaching Kit for Little Makers Workshop.");
  ok(parsed.command.intent === "finish_full_kit" || parsed.command.actions.generateSongsBooks === true, "full-kit path preserved");
}

console.log("\n7) generateImages=false does not enable generation");
{
  const parsed = parse(`Repair vocabulary for ${LMW_ID}. generateImages=false touchImages=false connectedUpgrade=true`);
  ok(parsed.command.actions.generateImages === false, "generateImages stays false");
}

console.log("\n8) garbage headings are not lesson titles");
{
  const parsed = parse(PRODUCTION_BAD_COMMAND);
  ok(!parsed.command.scope.titles.some((t) => /HARD SUCCESS|teachingKit\.vocabCards|CURRENT VOCABULARY/i.test(t)), "no garbage titles");
  if (parsed.command.scope.titles.length) {
    ok(parsed.command.scope.titles.every((t) => /Little Makers Workshop/i.test(t)), "only trusted lesson title");
  }
}

console.log("\n9) explicit ID blocks scope expansion");
{
  const parsed = parse(`Fix vocabulary only for ${LMW_ID}. ONE existing lesson only.`);
  ok(parsed.command.scope.lessonIds.length === 1, "scope stays one");
  ok(!parsed.confirmReasons.includes("unexpected_scope_expansion"), "no scope expansion");
}

console.log("\n10) connected upgrade boolean syntax");
{
  const parsed = parse(`Vocabulary-only connected upgrade for ${LMW_ID}. connectedUpgrade=true connectedAutoApply=true publish=false`);
  ok(parsed.command.actions.connectedUpgrade === true, "connectedUpgrade true from boolean");
}

console.log("\n11) contradiction blocks mutations");
{
  const parsed = parse(`Vocabulary only for ${LMW_ID}. IMAGES: EXCLUDED. generateImages=true touchImages=true`);
  ok(parsed.command.completion.mutationsEnabled === false || parsed.needsConfirmation, "unsafe contradiction blocked");
}

console.log(`\n${passed} assertions passed.`);
