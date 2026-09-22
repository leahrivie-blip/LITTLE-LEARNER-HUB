#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const commandApi = require("./curriculum-operator-command.js");
const intentApi = require("./curriculum-operator-intent-router.js");
const scopeApi = require("./curriculum-operator-execution-scope.js");
const createApi = require("./curriculum-operator-create.js");
const architect = require("./curriculum-operator-create-architect.js");
const connected = require("./curriculum-operator-connected-upgrade.js");
const conversationStore = require("./curriculum-operator-conversation-store.js");

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
function parseUnique(raw) {
  return commandApi.parseOperatorCommand(raw, {
    phase: 7,
    lessonPlans: plans.filter((plan) => plan.id !== PRESCHOOL_ID),
  });
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
{
  const parsed = parseUnique(
    "Update the Toddler lesson Big Feelings, Little Bodies. Keep the strong content, complete the weekly Teaching Kit, add realistic exact-activity pictures, create missing printables, and leave it as a draft. Do not change the cover or publish.",
  );
  assert.deepEqual(parsed.command.scope.lessonIds, [TODDLER_ID], "full-kit request resolves exactly one lesson");
  assert.equal(parsed.command.scope.requestedTargetCount, 1, "full-kit request records one requested target");
  assert.equal(parsed.command.actions.generateImages, true, "full-kit request includes images");
  assert.equal(parsed.command.actions.generatePrintables, true, "full-kit request includes printables");
  assert.equal(parsed.command.actions.touchCover, false, "compound cover exclusion wins");
  assert.equal(parsed.command.actions.publish, false, "compound publish exclusion wins");
  assert.equal(parsed.command.completion.publish, false, "completion never enables publishing");
}
{
  const parsed = parseUnique(
    "Add these activities to Big Feelings, Little Bodies: emotion cards, calming bottles, mirror faces, and a feelings movement game. Build all missing materials, setup, steps, questions, observations, safety, cleanup, indoor/outdoor alternatives, substitutions, support, challenge, vocabulary, family connection, printables, and pictures around those exact activities.",
  );
  assert.deepEqual(parsed.command.scope.requestedActivities, [
    "emotion cards", "calming bottles", "mirror faces", "a feelings movement game",
  ], "existing-lesson activity list is retained verbatim in typed command scope");
  assert.deepEqual(parsed.command.scope.lessonIds, [TODDLER_ID], "activity request stays on named lesson");
}
{
  const parsed = parseUnique(
    "Only update the activity pictures for Big Feelings, Little Bodies. Keep all lesson text, printables, and the cover unchanged.",
  );
  assert.equal(parsed.command.intent, "finish_images", "image-only intent stays image-only");
  assert.equal(parsed.command.actions.upgradeLesson, false, "image-only blocks text changes");
  assert.equal(parsed.command.actions.generatePrintables, false, "image-only blocks printable changes");
  assert.equal(parsed.command.actions.touchCover, false, "image-only blocks cover changes");
}
{
  const parsed = parseUnique(
    "Only create the missing printables for Big Feelings, Little Bodies. Do not rewrite the lesson or replace images.",
  );
  assert.equal(parsed.command.intent, "finish_printables", "printable-only intent stays printable-only");
  assert.equal(parsed.command.actions.generatePrintables, true, "printable-only enables printable work");
  assert.equal(parsed.command.actions.upgradeLesson, false, "printable-only blocks text changes");
  assert.equal(parsed.command.actions.generateImages, false, "printable-only blocks images");
}
{
  const raw = "Create a Preschool lesson about bakery and cooking using pretend bakery shop, measuring ingredients, decorating paper cupcakes, and sorting baked goods. Make the complete five-day Teaching Kit, realistic activity pictures, matching printables, low-cost substitutions, safety, cleanup, and family connection. Leave it as a draft.";
  const parsed = parse(raw);
  const brief = createApi.parseCreationBrief(raw);
  assert.equal(parsed.command.actions.createLesson, true, "detailed new-lesson request remains a create job");
  assert.equal(parsed.command.actions.publish, false, "new lesson remains unpublished");
  assert.deepEqual(brief.brief.requestedActivities, [
    "pretend bakery shop", "measuring ingredients", "decorating paper cupcakes", "sorting baked goods",
  ], "new-lesson brief retains requested activities");
  const promptText = architect.buildArchitectUserPrompt(brief.brief);
  const prompt = JSON.parse(promptText.slice(promptText.indexOf("{")));
  assert.deepEqual(prompt.brief.requestedActivities, brief.brief.requestedActivities, "architect receives exact activity requirements");
  assert.match(prompt.rules.join("\n"), /Include every requestedActivities item/, "architect is instructed not to replace requested activities");
  assert.match(brief.brief.idempotencyKey, /^create:/, "new lesson has stable retry idempotency key");
  assert.equal(architect.validateRequestedActivities(
    brief.brief.requestedActivities,
    ["Pretend Bakery Shop", "Measuring Ingredients", "Decorating Paper Cupcakes", "Sorting Baked Goods"],
  ).ok, true, "requested activities validate against generated activity titles");
  assert.deepEqual(architect.validateRequestedActivities(
    ["pretend bakery shop", "measuring ingredients"],
    ["Pretend Bakery Shop", "Painting Dough"],
  ).missing, ["measuring ingredients"], "missing requested activity is surfaced");
}
{
  const research = createApi.parseCreationBrief(
    "Research current preschool and childcare activity trends for bakery, cooking, sensory play, and dramatic play. Use the research only for inspiration, then create a new Preschool bakery lesson.",
  );
  assert.equal(research.brief.researchRequested, true, "research request is explicitly recorded");
  assert.equal(research.brief.requestedFeatures.cover, false, "research does not imply a cover change");
}
{
  const followUp = commandApi.parseOperatorCommand(
    "Keep the cover the same, make the materials cheaper, and add more movement.",
    {
      phase: 7,
      lessonPlans: plans,
      operatorContext: {
        previousIntent: "FULL_KIT_WORK",
        previousResolvedTargets: [TODDLER_ID],
        previousAllowedScopes: ["upgradeLesson", "upgradeActivities"],
        previousExclusions: [],
      },
    },
  );
  assert.deepEqual(followUp.command.scope.lessonIds, [TODDLER_ID], "follow-up inherits trusted prior lesson");
  assert.equal(followUp.command.actions.touchCover, false, "follow-up preserves cover exclusion");
  assert.equal(followUp.command.actions.saveDraft, true, "follow-up remains a draft update");
}
{
  const ambiguous = parse("Fix my toddler lessons.");
  assert.ok(ambiguous.confirmReasons.includes("ambiguous_scope"), "unqualified toddler batch is blocked for clarification");
  assert.equal(ambiguous.command.actions.publish, false, "ambiguous request cannot publish");
}
{
  const failedAssets = connected.canAutoApplyConnectedEnrichment({
    status: "failed",
    ownerReviewStatus: "PARTIAL",
    finalVerification: { ok: false },
    imagesComplete: false,
    printablesComplete: false,
  }, { command: { actions: { connectedAutoApply: true } } });
  assert.equal(failedAssets.ok, false, "failed asset work cannot auto-apply a draft");
}
{
  const store = {};
  const now = Date.UTC(2026, 0, 1);
  conversationStore.save(store, {
    ownerId: "leah@example.test",
    sessionId: "session-a",
    currentLessonId: TODDLER_ID,
    currentLessonTitle: "Big Feelings, Little Bodies",
    currentOperation: "finish_full_kit",
  }, now);
  assert.equal(conversationStore.read(store, "leah@example.test", "session-a", now + 1).currentLessonId, TODDLER_ID,
    "refresh restores same-owner conversation context");
  assert.equal(conversationStore.read(store, "other@example.test", "session-a", now + 1), null,
    "conversation context is isolated by owner");
  const explicitTarget = commandApi.parseOperatorCommand("Update Healthy Me.", {
    phase: 7,
    lessonPlans: plans,
    operatorContext: {
      previousResolvedTargets: [TODDLER_ID],
      previousIntent: "finish_full_kit",
    },
  });
  assert.deepEqual(explicitTarget.command.scope.lessonIds, [OTHER_TODDLER_ID],
    "new explicit target overrides restored conversation context");
  assert.equal(conversationStore.read(store, "leah@example.test", "session-a", now + conversationStore.TTL_MS + 1), null,
    "stale conversation context expires");
  conversationStore.clear(store, "leah@example.test", "session-a");
  assert.equal(conversationStore.read(store, "leah@example.test", "session-a", now + 1), null,
    "start over clears current conversation");
}

console.log("Curriculum operator conversational routing checks passed.");
