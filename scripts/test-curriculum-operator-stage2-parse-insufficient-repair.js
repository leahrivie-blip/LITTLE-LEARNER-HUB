#!/usr/bin/env node
/**
 * Stage 2 parse recovery + insufficient_questions repair follow-up.
 */
"use strict";

const assert = require("node:assert/strict");
const createApi = require("./curriculum-operator-create.js");
const staged = require("./curriculum-operator-staged-composer.js");
const schema = require("./curriculum-operator-schema.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function briefFor(target, title = "Spring Planting QA Disposable test-qa") {
  const parsed = createApi.parseCreationBrief(
    `Create a Preschool spring planting lesson titled "${title}" with ${target} activities and leave it ready for review. Do not publish.`,
  );
  return { ...parsed.brief, title, theme: "Spring Planting", activityTarget: target };
}

function loadValidatedBatch(brief, blueprint, batchNumber) {
  const allIds = blueprint.activityOutlines.map((o) => o.outlineId);
  const batches = staged.chunkIds(allIds, staged.DEFAULT_BATCH_SIZE);
  const ids = batches[batchNumber - 1];
  const raw = JSON.parse(staged.buildStagedFixtureResponse(
    staged.buildExpansionUserPrompt(brief, blueprint, ids, { batchNumber }),
  ));
  const v = staged.validateExpansionBatch(raw, ids, blueprint, brief);
  assert.equal(v.ok, true, `batch ${batchNumber} fixture validates`);
  return { ids, activities: v.activities };
}

const MULTI_PROMPT = [
  "What do you notice on the chart after we water the seeds?",
  "How can you compare today’s sprout height with yesterday’s mark?",
  "What might change on the chart if we move the cups to sunny window light?",
].join("\n");

async function main() {
  console.log("Stage 2 parse + insufficient_questions repair\n");

  // --- parseStageAiJson ---
  {
    const inner = JSON.stringify({ activities: [{ outlineId: "a1", title: "T" }] });
    const trailing = `${inner}\nNote: ignore stray brace } in prose.`;
    const recovered = staged.parseStageAiJson(trailing);
    ok(recovered.ok === true && recovered.method === "balanced_object_extract",
      "recoverable JSON with trailing text parses via balanced extract");

    const strictOnly = staged.parseStageAiJson(`\`\`\`json\n${inner}\n\`\`\``);
    ok(strictOnly.ok === true && strictOnly.method === "strip_fences",
      "fenced JSON parses via strip_fences");

    const broken = staged.parseStageAiJson("{ not valid json at all ".padEnd(600, "x"));
    ok(broken.ok === false, "unrecoverable malformed JSON stays invalid");

    const substantialBroken = staged.parseStageAiJson(`{"activities":[${"x".repeat(520)}`);
    ok(substantialBroken.ok === false, "substantial but unterminated JSON stays invalid");
  }

  const brief = briefFor(15);
  const blueprint = staged.validateBlueprint(
    JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief))),
    brief,
  ).blueprint;
  const batch1 = loadValidatedBatch(brief, blueprint, 1);
  const { ids, activities: goodActs } = batch1;

  const dailyGrowth = goodActs.find((a) => /growth chart/i.test(a.title)) || goodActs[0];
  const growthDiscuss = goodActs.find((a) => /observation discussion/i.test(a.title)) || goodActs[1];
  ok(Boolean(dailyGrowth) && Boolean(growthDiscuss), "fixture includes chart + discussion activities");

  const thinQs = goodActs.map((a) => {
    if (a.outlineId === dailyGrowth.outlineId || a.outlineId === growthDiscuss.outlineId) {
      return { ...a, teacherLanguage: "What do you see?" };
    }
    return a;
  });
  const issueChart = `${dailyGrowth.title}.insufficient_questions`;
  const issueDiscuss = `${growthDiscuss.title}.insufficient_questions`;
  ok(staged.validateExpansionBatch({ activities: thinQs }, ids, blueprint, brief).ok === false,
    "Daily Growth Chart + Growth Observation Discussion insufficient_questions fail batch");
  ok(staged.expansionQualityIssuesAreOnlyInsufficientQuestions(
    [issueChart, issueDiscuss],
    thinQs,
  ), "paired insufficient_questions qualifies for follow-up repair");

  const plan = staged.planExpansionRepair([issueChart, issueDiscuss], thinQs);
  ok(plan.canRepair && plan.mappedRepairTargets.length === 2,
    "insufficient_questions maps to teacherLanguage repair targets");
  ok(plan.mappedRepairTargets.every((t) => t.fields.some((f) => f.field === "teacherLanguage")),
    "repair targets include teacherLanguage only for question failures");

  const enriched = staged.enrichExpansionRepairTargets(plan.mappedRepairTargets, thinQs, blueprint, brief);
  ok(enriched.every((t) => t.activityContext?.currentTeacherLanguage),
    "repair payload includes currentTeacherLanguage context");

  const repairedPayload = {
    activities: thinQs.map((a) => (
      a.outlineId === dailyGrowth.outlineId || a.outlineId === growthDiscuss.outlineId
        ? { ...a, teacherLanguage: MULTI_PROMPT }
        : a
    )),
  };
  const control = thinQs[2];
  const merged = staged.coalesceExpansionBatch(
    thinQs,
    repairedPayload,
    ids,
    blueprint,
    brief,
    [issueChart, issueDiscuss],
  );
  ok(merged.ok === true, "successful activity-specific teacherLanguage repair passes batch");
  ok(merged.activities.find((a) => a.outlineId === control.outlineId)?.objective === control.objective,
    "unrelated valid fields unchanged after targeted repair");

  const stillBadPayload = {
    activities: thinQs.map((a) => (
      a.outlineId === dailyGrowth.outlineId || a.outlineId === growthDiscuss.outlineId
        ? { ...a, teacherLanguage: "What do you see?" }
        : a
    )),
  };
  const mergedBad = staged.coalesceExpansionBatch(
    thinQs,
    stillBadPayload,
    ids,
    blueprint,
    brief,
    [issueChart, issueDiscuss],
  );
  ok(mergedBad.ok === false, "repair that remains invalid fails closed");

  // --- compose: repair parse retry + insufficient follow-up ---
  {
    let repairCalls = 0;
    let expandCalls = 0;
    const r = await staged.composeStagedLessonContent(brief, {
      forceLive: true,
      callAi: async (_s, user) => {
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) return staged.buildStagedFixtureResponse(user);
        if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
          repairCalls += 1;
          if (/could not be parsed/i.test(user)) {
            const parsed = JSON.parse(user.slice(user.indexOf("{")));
            return JSON.stringify({
              activities: schema.asArray(parsed.previousBatchActivities).map((a) => (
                a.outlineId === dailyGrowth.outlineId || a.outlineId === growthDiscuss.outlineId
                  ? { ...a, teacherLanguage: MULTI_PROMPT }
                  : a
              )),
            });
          }
          if (repairCalls === 1) {
            return `{ "activities": broken repair ${"x".repeat(600)}`;
          }
          const parsed = JSON.parse(user.slice(user.indexOf("{")));
          return JSON.stringify({
            activities: schema.asArray(parsed.previousBatchActivities).map((a) => (
              a.outlineId === dailyGrowth.outlineId || a.outlineId === growthDiscuss.outlineId
                ? { ...a, teacherLanguage: "What do you see?" }
                : a
            )),
          });
        }
        if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
          expandCalls += 1;
          const full = JSON.parse(staged.buildStagedFixtureResponse(user));
          if (expandCalls === 1) {
            full.activities = full.activities.map((a) => (
              a.outlineId === dailyGrowth.outlineId || a.outlineId === growthDiscuss.outlineId
                ? { ...a, teacherLanguage: "What do you see?" }
                : a
            ));
          }
          return JSON.stringify(full);
        }
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(r.ok === true, "compose succeeds after repair parse retry + insufficient follow-up");
    ok(repairCalls >= 2, "insufficient_questions follow-up repair invoked");
    const b1 = schema.asArray(r.stagedDiagnostics?.batches).find((b) => b.batchNumber === 1);
    ok(b1?.repairUsed === true && b1?.finalBatchPass === true, "batch1 repair succeeds");
    ok(b1?.repairParseRetryUsed === true || repairCalls >= 2,
      "repair parse retry or follow-up used");
    ok(r.content && typeof r.content === "object", "lesson content returned on success");
  }

  // --- terminal failure: no lesson content returned ---
  {
    let repairCalls = 0;
    const r = await staged.composeStagedLessonContent(brief, {
      forceLive: true,
      callAi: async (_s, user) => {
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) return staged.buildStagedFixtureResponse(user);
        if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
          repairCalls += 1;
          return "{ still broken ".padEnd(700, "!");
        }
        if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
          const full = JSON.parse(staged.buildStagedFixtureResponse(user));
          full.activities = full.activities.map((a) => (
            a.outlineId === dailyGrowth.outlineId || a.outlineId === growthDiscuss.outlineId
              ? { ...a, teacherLanguage: "What do you see?" }
              : a
          ));
          return JSON.stringify(full);
        }
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(r.ok === false && r.code === "AI_CREATION_FAILED", "terminal failure returns no lesson");
    ok(!r.content?.dailyPlans, "no persisted lesson shape on terminal failure");
    ok(repairCalls >= 2, "repair parse retry attempted before fail closed");
  }

  console.log(`\n${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
