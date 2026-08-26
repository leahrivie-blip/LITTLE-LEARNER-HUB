#!/usr/bin/env node
/**
 * Regression tests for Little Makers Workshop connected-upgrade command interpretation
 * and learningDomains weekly-field composer support.
 * Run: npm run test:curriculum-operator-lmw-intent-fix
 */
"use strict";

const assert = require("node:assert/strict");
const commandApi = require("./curriculum-operator-command.js");
const intentRouter = require("./curriculum-operator-intent-router.js");
const composer = require("./curriculum-operator-ai-composer.js");
const orchestrator = require("./curriculum-operator-orchestrator.js");
const schema = require("./curriculum-operator-schema.js");

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const ACT_STRONG = "cur-act-0a02697c73ccac85";
const ACT_WEAK = "cur-act-374ff7ad30144089";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function lmwPlans() {
  return [{
    id: LMW_ID,
    title: "Little Makers Workshop",
    age: "Toddler 12–24 Months",
    plan: "Free",
    status: "draft",
    learningDomains: ["Creative Arts", "Physical Development"],
    activityIds: [ACT_STRONG, ACT_WEAK],
  }];
}

function parse(raw, opts = {}) {
  return commandApi.parseOperatorCommand(raw, {
    phase: 7,
    lessonPlans: lmwPlans(),
    currentlySelectedLessonId: Object.prototype.hasOwnProperty.call(opts, "currentlySelectedLessonId")
      ? opts.currentlySelectedLessonId
      : null,
    ...opts,
  });
}

const LMW_COMMAND = [
  "Upgrade the existing Little Makers Workshop lesson only.",
  `Use existing lesson ID ${LMW_ID} with the same activity IDs.`,
  "Keep Free, keep draft, and do not publish.",
  "Save directly to the editable draft lesson record without Apply Enrichment.",
  "Improve only genuinely weak content and keep strong activity fields unchanged.",
  "Fill empty Vocabulary, add missing teacher tips, and complete missing book discussion questions.",
  "Regenerate weak remaining activity images only.",
  "Create a new REALISTIC_LESSON_COVER for this lesson.",
  "Do not touch printables.",
  "Do not create a new lesson.",
].join(" ");

console.log("A–M. LMW connected-upgrade command interpretation");
{
  const parsed = parse(LMW_COMMAND);
  const actions = parsed.command.actions;
  ok(parsed.command.scope.lessonIds.includes(LMW_ID), "A: explicit lesson ID resolves scope");
  ok(!parsed.confirmReasons.includes("missing_selected_lesson"), "A: no missing_selected_lesson with explicit ID");
  ok(parsed.ownerIntent.route === intentRouter.ROUTES.EXISTING_CONNECTED_UPGRADE, "B: existing lesson → connected upgrade route");
  ok(actions.connectedUpgrade === true, "B: connectedUpgrade=true");
  ok(actions.connectedAutoApply === true, "C: direct editable draft save → connectedAutoApply=true");
  ok(actions.generatePrintables !== true, "D: do not touch printables → generatePrintables false");
  ok(actions.touchPrintables === false, "D: touchPrintables false");
  ok(actions.checkPrintables !== true, "D: checkPrintables false");
  ok(actions.replaceBadImages === true, "E: weak image regeneration → replaceBadImages=true");
  ok(actions.touchCover === true, "F: REALISTIC_LESSON_COVER → touchCover=true");
  const scope = orchestrator.normalizeKitScopeFlags(actions);
  ok(scope.cover === true, "F: cover unlocked in kit scope");
  ok(scope.locks.cover === false, "G: cover not locked when explicitly requested");
  ok(actions.createLesson !== true, "L: same lesson — no create");
  ok(actions.publish !== true, "M: no publish");
  ok(parsed.command.scope.lessonIds[0] === LMW_ID, "L: same lesson ID retained");
}

console.log("\nH–I. learningDomains composer support");
{
  const plan = {
    id: LMW_ID,
    title: "Little Makers Workshop",
    age: "Toddler 12–24 Months",
    plan: "Free",
    learningDomains: ["Creative Arts"],
    enrichmentDraft: { week: {}, activities: {} },
  };
  const work = composer.collectWorkItems(plan, [], {
    weeklyContent: [{
      field: "learningDomains",
      decision: "FILL",
      reason: "Empty",
      preview: "",
    }],
  }, { upgradeLesson: true });
  ok(work.weekRequests.some((r) => r.field === "learningDomains"), "learningDomains included in work requests");
  const raw = JSON.stringify({
    lessonId: LMW_ID,
    weeklyChanges: {
      learningDomains: {
        action: "FILL",
        value: ["Creative Arts", "Physical Development"],
      },
    },
    activities: [],
  });
  const validated = composer.validateComposerOutput(raw, work, plan);
  ok(validated.ok === true, "H: learningDomains accepted — no unknown_field hard-fail");
  ok(validated.plan.weeklyChanges.learningDomains.value.length === 2, "I: canonical learningDomains mapping preserved");
}

console.log("\nJ–K. draft/Free unchanged in command scope");
{
  const parsed = parse(LMW_COMMAND);
  ok(parsed.command.scope.plan !== "Pro", "K: Free/Pro unchanged (still Free)");
  ok(parsed.command.actions.publish !== true, "J/M: lesson stays draft — no publish action");
}

console.log("\nN. no production image generation flag in parse-only test");
{
  const parsed = parse(LMW_COMMAND);
  ok(parsed.command.actions.generateImages === true, "images requested at parse layer");
  ok(process.env.VISUAL_PRODUCTION_MOCK_GENERATE == null || process.env.NODE_ENV === "test",
    "N: test path only — no live generation in this script");
}

console.log(`\nOK curriculum-operator-lmw-intent-fix (${passed} assertions)`);
