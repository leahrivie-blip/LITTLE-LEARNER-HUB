#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const commandApi = require("./curriculum-operator-command.js");
const intentApi = require("./curriculum-operator-intent-router.js");
const scopeApi = require("./curriculum-operator-execution-scope.js");

const TODDLER_ID = "cur-lp-1111111111111111";
const PRESCHOOL_ID = "cur-lp-2222222222222222";
const OTHER_TODDLER_ID = "cur-lp-3333333333333333";
const plans = [
  { id: TODDLER_ID, title: "Big Feelings, Little Bodies", age: "Toddler 12–24 Months", status: "draft" },
  { id: PRESCHOOL_ID, title: "Big Feelings, Little Bodies", age: "Preschool 3–5", status: "draft" },
  { id: OTHER_TODDLER_ID, title: "Healthy Me", age: "Toddler 12–24 Months", status: "draft" },
];

function parse(raw, currentlySelectedLessonId = null) {
  return commandApi.parseOperatorCommand(raw, { phase: 7, lessonPlans: plans, currentlySelectedLessonId });
}

{
  const parsed = parse("Finish the Toddler lesson titled Big Feelings, Little Bodies and make it classroom-ready.");
  assert.deepEqual(parsed.command.scope.lessonIds, [TODDLER_ID], "title plus age resolves exactly one lesson");
  assert.equal(parsed.command.scope.requestedTargetCount, 1, "single target is recorded");
}
{
  const parsed = parse("Update the lesson titled Healthy Me and keep the cover.");
  assert.deepEqual(parsed.command.scope.lessonIds, [OTHER_TODDLER_ID], "unique title resolves without an ID");
  assert.equal(parsed.command.actions.touchCover, false, "keep the cover remains an exclusion");
  assert.equal(parsed.command.actions.publish, false, "natural updates never publish");
}
{
  const parsed = parse("Update the selected lesson.", TODDLER_ID);
  assert.deepEqual(parsed.command.scope.lessonIds, [TODDLER_ID], "selected lesson uses trusted UI selection");
}
{
  const parsed = parse("Update the selected lesson.");
  assert.ok(parsed.confirmReasons.includes("missing_selected_lesson"), "missing selection asks one clarification");
}
{
  const parsed = parse("Only update the pictures for the selected lesson.", TODDLER_ID);
  assert.equal(parsed.ownerIntent.naturalIntent, intentApi.NATURAL_INTENTS.IMAGE_ONLY_UPDATE);
  assert.equal(parsed.command.actions.generateImages, true);
  assert.equal(parsed.command.actions.upgradeLesson, false);
  assert.equal(parsed.command.actions.generatePrintables, false);
  assert.equal(parsed.command.actions.touchCover, false);
}
{
  const parsed = parse("Only fix the printables for the selected lesson.", TODDLER_ID);
  assert.equal(parsed.ownerIntent.naturalIntent, intentApi.NATURAL_INTENTS.PRINTABLE_ONLY_UPDATE);
  assert.equal(parsed.command.actions.generatePrintables, true);
  assert.equal(parsed.command.actions.generateImages, false);
  assert.equal(parsed.command.actions.upgradeLesson, false);
}
{
  const parsed = parse("Update all toddler lessons.");
  assert.equal(parsed.ownerIntent.naturalIntent, intentApi.NATURAL_INTENTS.UPDATE_MULTIPLE_LESSONS);
  assert.equal(parsed.command.scope.requestedTargetCount, null, "intentional batch is not treated as one lesson");
}
{
  const result = scopeApi.validateResolvedTargetCount(
    { scope: { requestedTargetCount: 1 } },
    [{ id: TODDLER_ID, title: "Big Feelings, Little Bodies" }, { id: OTHER_TODDLER_ID, title: "Healthy Me" }],
  );
  assert.equal(result.ok, false, "server guard blocks one lesson expanding into a batch");
  assert.deepEqual(result.lessonIds, [TODDLER_ID, OTHER_TODDLER_ID]);
}

console.log("Curriculum operator conversational routing checks passed.");
