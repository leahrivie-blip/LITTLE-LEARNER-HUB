#!/usr/bin/env node
/**
 * Execution scope reporting + pre-run contradiction tests.
 */
"use strict";

const assert = require("node:assert/strict");
const commandApi = require("./curriculum-operator-command.js");
const selectApi = require("./curriculum-operator-select.js");
const jobApi = require("./curriculum-operator-job.js");
const executionScopeApi = require("./curriculum-operator-execution-scope.js");
const allowlistApi = require("./curriculum-operator-mutation-allowlist.js");

const LMW_ID = "cur-lp-549b80f61dfa8d79";
const HELLO_FALL_ID = "cur-lp-19fb387f75cfd1f1745";
const PRODUCTION_COMMAND = `ONE CONTROLLED VOCABULARY-ONLY connected upgrade on the EXISTING lesson only.

Lesson: Little Makers Workshop
Lesson ID: ${LMW_ID}

TARGET: Vocabulary only
weeklyFieldScope vocabulary only
publish false
textOnly expected true

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

Do NOT generate images.
Save draft. Do not publish.`;

const lessonPlans = [
  { id: LMW_ID, title: "Little Makers Workshop", age: "Toddler 12–24 Months", plan: "Free", status: "draft" },
  { id: HELLO_FALL_ID, title: "Hello Fall, Little One", age: "Toddler 12–24 Months", plan: "Pro", status: "published" },
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

function buildPlanSummary(command, selection) {
  const phase = Number(command.completion?.phase) || 1;
  const upgrade = command.actions?.saveDraft && (command.actions?.upgradeLesson || command.actions?.upgradeActivities);
  const images = command.actions?.generateImages === true && command.actions?.touchImages !== false;
  const printables = command.actions?.generatePrintables === true && command.actions?.touchPrintables !== false;
  const songsBooks = command.actions?.generateSongsBooks === true;
  const create = phase >= 7 && command.actions?.createLesson === true;
  const expected = ["lesson.get", "lesson.audit", "asset.plan", "teachingKit.score"];
  if (upgrade) {
    expected.push("lesson.updateFields", "lesson.saveDraft", "lesson.validate");
    if (executionScopeApi.activityUpdatesAllowed(command)) expected.push("activity.update");
  }
  return {
    phase,
    phaseNote: executionScopeApi.buildScopeAwarePhaseNote(command),
    lessons: selection.selected.map((row) => ({ id: row.id, expectedActions: expected.slice() })),
    selectedLessonIds: selection.selected.map((row) => row.id),
    generatesImages: images,
    generatesPrintables: printables,
    generatesSongsBooks: songsBooks,
    createsLesson: create,
  };
}

console.log("1) vocabulary-only command does not display full-kit execution label");
{
  const parsed = parse(PRODUCTION_COMMAND);
  const selection = selectApi.selectLessons(curriculum, parsed.command);
  const plan = buildPlanSummary(parsed.command, selection);
  ok(!executionScopeApi.isFullKitPhaseNote(plan.phaseNote), "phaseNote not full-kit");
  ok(/Vocabulary-only connected upgrade/i.test(plan.phaseNote), "phaseNote vocabulary-only");
  ok(!/Phase 6:\s*full Teaching Kit finish/i.test(plan.phaseNote), "no Phase 6 full-kit wording");
}

console.log("\n2) narrow weeklyFieldScope cannot produce full-kit plan");
{
  const parsed = parse(PRODUCTION_COMMAND);
  const contradiction = executionScopeApi.detectPlannedScopeContradiction(parsed.command, {
    phaseNote: executionScopeApi.buildScopeAwarePhaseNote(parsed.command),
    generatesImages: false,
    generatesPrintables: false,
    generatesSongsBooks: false,
    lessons: [{ expectedActions: ["lesson.updateFields"] }],
  });
  ok(!contradiction.blocked, "fixed plan has no contradiction");
  const bad = executionScopeApi.detectPlannedScopeContradiction(parsed.command, {
    phaseNote: "Phase 6: full Teaching Kit finish into enrichmentDraft. NOT published.",
    generatesImages: false,
    generatesPrintables: false,
    generatesSongsBooks: false,
    lessons: [{ expectedActions: ["lesson.updateFields"] }],
  });
  ok(bad.blocked, "stale full-kit label blocked");
  ok(bad.contradictions.some((c) => c.code === "PLANNED_SCOPE_CONTRADICTION"), "contradiction code set");
}

console.log("\n3) stored allowlist contains vocabulary paths only");
{
  const parsed = parse(PRODUCTION_COMMAND);
  const allowlist = allowlistApi.buildMutationAllowlist(parsed.command);
  ok(allowlist.allowedWeeklyFields.has("vocabCards"), "vocabCards allowed");
  ok(allowlist.allowedWeeklyFields.has("vocabularyWords"), "vocabularyWords allowed");
  ok(!allowlistApi.isPathAllowed("learningDomains", allowlist), "learningDomains denied");
  ok(!allowlistApi.isPathAllowed("teachingKit.milestones", allowlist), "milestones denied");
  ok(allowlist.assets.images === false, "images denied");
  ok(allowlist.publishAllowed === false, "publish denied");
}

console.log("\n4-8) phase skip map for vocabulary-only");
{
  const parsed = parse(PRODUCTION_COMMAND);
  const allowlist = allowlistApi.buildMutationAllowlist(parsed.command);
  const map = executionScopeApi.buildWouldRunPhaseMap(parsed.command, allowlist);
  ok(map.lessonContent.startsWith("RUN"), "lesson content runs for vocab");
  ok(map.activities.startsWith("SKIP"), "activities skipped");
  ok(map.images.startsWith("SKIP"), "images skipped");
  ok(map.printables.startsWith("SKIP"), "printables skipped");
  ok(map.cover.startsWith("SKIP"), "cover skipped");
  ok(map.songs.startsWith("SKIP"), "songs skipped");
  ok(map.books.startsWith("SKIP"), "books skipped");
}

console.log("\n9) publish skipped");
{
  const parsed = parse(PRODUCTION_COMMAND);
  const map = executionScopeApi.buildWouldRunPhaseMap(parsed.command);
  ok(map.publish.startsWith("SKIP"), "publish skipped");
}

console.log("\n10) PLANNED_SCOPE_CONTRADICTION blocks mismatch");
{
  const parsed = parse(PRODUCTION_COMMAND);
  const blocked = executionScopeApi.detectPlannedScopeContradiction(parsed.command, {
    phaseNote: "Phase 6: full Teaching Kit finish into enrichmentDraft. NOT published.",
    generatesImages: true,
    lessons: [{ expectedActions: ["image.generate"] }],
  });
  ok(blocked.blocked, "asset flags + full-kit label blocked");
  ok(allowlistApi.isRunBlockedByConfirmations(blocked.confirmReasons, null), "run blocked by contradiction reason");
}

console.log("\n11) true full-kit command still displays full-kit plan correctly");
{
  const parsed = parse("Finish everything missing in Little Makers Workshop completely and save draft. Lesson ID: " + LMW_ID);
  const plan = buildPlanSummary(parsed.command, selectApi.selectLessons(curriculum, parsed.command));
  ok(executionScopeApi.isFullKitPhaseNote(plan.phaseNote), "full-kit retains full-kit label");
}

console.log("\n12) planned job log + actions omit activity.update for vocab-only");
{
  const parsed = parse(PRODUCTION_COMMAND);
  const selection = selectApi.selectLessons(curriculum, parsed.command);
  const plan = buildPlanSummary(parsed.command, selection);
  const job = jobApi.createJobFromPlan({
    command: parsed.command,
    planSummary: plan,
    createdBy: "test@example.com",
    status: "planned",
  });
  ok(/Vocabulary-only connected upgrade/i.test(job.log[0]?.message || ""), "job log vocabulary-only");
  ok(!(job.lessonResults[0]?.actions || []).some((a) => a.type === "activity.update"), "no activity.update step");
  ok(job.mutationAllowlist?.allowedWeeklyFields?.has("vocabCards"), "stored allowlist vocabCards");
}

console.log("\n13) same-lesson mutation lock detects active planned job");
{
  const parsed = parse(PRODUCTION_COMMAND);
  const selection = selectApi.selectLessons(curriculum, parsed.command);
  const plan = buildPlanSummary(parsed.command, selection);
  const first = jobApi.createJobFromPlan({
    command: parsed.command,
    planSummary: plan,
    createdBy: "test@example.com",
    status: "planned",
  });
  const lock = jobApi.findActiveMutationJobForLessons([first], plan.selectedLessonIds);
  ok(Boolean(lock?.job?.id), "active planned job blocks same lesson");
}

console.log(`\n${passed} assertions passed.`);
