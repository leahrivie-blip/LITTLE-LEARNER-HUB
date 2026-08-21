#!/usr/bin/env node
/**
 * Operator staged lesson composer — deterministic fixture tests (no live OpenAI).
 * Run: npm run test:curriculum-operator-staged-composer
 */
"use strict";

const assert = require("node:assert/strict");
const createApi = require("./curriculum-operator-create.js");
const architect = require("./curriculum-operator-create-architect.js");
const staged = require("./curriculum-operator-staged-composer.js");
const schema = require("./curriculum-operator-schema.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function briefFor(target, title = "Operator QA Bakery Creation Test") {
  const parsed = createApi.parseCreationBrief(
    `Create a Preschool bakery lesson titled "${title}" with ${target} activities and leave it ready for review. Do not publish.`,
  );
  return {
    ...parsed.brief,
    title,
    theme: "Bakery",
    activityTarget: target,
  };
}

function activityCountFromContent(content) {
  let n = 0;
  ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
    n += schema.asArray(content?.dailyPlans?.[day]?.items).length;
  });
  return n;
}

async function main() {
  console.log("Curriculum Operator staged lesson composer");

  const brief15 = briefFor(15);
  const brief10 = briefFor(10);

  // Stage 1 fixture: exact outline counts
  {
    const raw15 = staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15));
    const parsed15 = JSON.parse(raw15);
    const v15 = staged.validateBlueprint(parsed15, brief15);
    ok(v15.ok === true, "Stage 1 fixture: 15 outlines accepted");
    ok(v15.parsedOutlineCount === 15, "Stage 1: 15 requested → exactly 15 outlines");
    ok(Object.values(v15.weekdayDistribution).every((n) => n === 3), "Stage 1: 3 per weekday");

    const raw10 = staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief10));
    const v10 = staged.validateBlueprint(JSON.parse(raw10), brief10);
    ok(v10.ok === true && v10.parsedOutlineCount === 10, "Stage 1: 10 requested → exactly 10 outlines");
  }

  // Stage 1 duplicate concepts rejected
  {
    const raw = JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15)));
    raw.activityOutlines[1] = { ...raw.activityOutlines[0], outlineId: "dup-2" };
    const v = staged.validateBlueprint(raw, brief15);
    ok(v.ok === false, "Stage 1 duplicate concepts rejected");
  }

  // Stage 1 wrong count → repair then fail if still wrong
  {
    let calls = 0;
    const bad = await staged.composeStagedLessonContent(brief15, {
      forceLive: true,
      callAi: async (_s, user) => {
        calls += 1;
        const full = JSON.parse(staged.buildStagedFixtureResponse(user));
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) {
          full.activityOutlines = full.activityOutlines.slice(0, 10);
          return JSON.stringify(full);
        }
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(bad.ok === false && bad.code === "AI_CREATION_FAILED", "Stage 1 failed repair → no create");
    ok(calls === 2, "Stage 1 allows exactly one repair call");
    ok(bad.progress?.creationBlueprintComplete !== true, "failed Stage 1 does not mark blueprint complete for create");
  }

  // Full staged fixture compose → exactly 15
  {
    const good = await architect.composeNewLessonContent(brief15, { forceFixture: true });
    ok(good.ok === true, "staged fixture compose succeeds");
    ok(good.staged === true || good.source === "fixture_ai", "compose uses staged/fixture path");
    ok(activityCountFromContent(good.content) === 15, "assembled lesson has exactly 15 activities");
    ok(good.usage.lessonArchitectureCalls >= 1, "tracks lessonArchitectureCalls");
    ok(good.usage.activityExpansionCalls === 3, "15 activities → 3 expansion batches of 5");
    ok(good.usage.activityRepairCalls === 0, "happy path needs no final repair");
  }

  // Expansion ID safety
  {
    const blueprint = staged.validateBlueprint(
      JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15))),
      brief15,
    ).blueprint;
    const ids = blueprint.activityOutlines.slice(0, 5).map((o) => o.outlineId);
    const expandUser = staged.buildExpansionUserPrompt(brief15, blueprint, ids);
    const goodBatch = JSON.parse(staged.buildStagedFixtureResponse(expandUser));
    const okBatch = staged.validateExpansionBatch(goodBatch, ids, blueprint, brief15);
    ok(okBatch.ok === true, "expansion accepts exact requested outline IDs");

    const missing = { activities: goodBatch.activities.slice(0, 4) };
    ok(staged.validateExpansionBatch(missing, ids, blueprint, brief15).ok === false,
      "missing requested outlineId rejected");

    const extra = {
      activities: [
        ...goodBatch.activities,
        { ...goodBatch.activities[0], outlineId: "extra-id-should-fail" },
      ],
    };
    ok(staged.validateExpansionBatch(extra, ids, blueprint, brief15).ok === false,
      "extra outlineId rejected");

    const dup = {
      activities: [
        goodBatch.activities[0],
        { ...goodBatch.activities[1], outlineId: goodBatch.activities[0].outlineId },
        ...goodBatch.activities.slice(2),
      ],
    };
    ok(staged.validateExpansionBatch(dup, ids, blueprint, brief15).ok === false,
      "duplicate outlineId rejected");
  }

  // Truncated batch does not create; prior batches preserved for resume
  {
    let calls = 0;
    const blueprintRaw = staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15));
    const blueprint = staged.validateBlueprint(JSON.parse(blueprintRaw), brief15).blueprint;
    const ids = blueprint.activityOutlines.map((o) => o.outlineId);
    const batches = staged.chunkIds(ids, 5);

    const result = await staged.composeStagedLessonContent(brief15, {
      forceLive: true,
      callAi: async (_s, user) => {
        calls += 1;
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) return blueprintRaw;
        if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
          const parsed = JSON.parse(user.slice(user.indexOf("{")));
          const want = parsed.expandExactlyTheseOutlineIds || [];
          // Fail batch 3 (activities 11–15) with truncation-like short JSON
          if (want[0] === batches[2][0]) {
            return "{\"activities\":["; // truncated
          }
          return staged.buildStagedFixtureResponse(user);
        }
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(result.ok === false, "truncated batch does not create lesson");
    ok(/batch3|Stage 2/i.test(String(result.error || "")), "failure names the failed expansion batch");
    ok(result.progress?.activityExpansionBatches?.batch1?.status === "SUCCESS", "batch1 preserved for resume");
    ok(result.progress?.activityExpansionBatches?.batch2?.status === "SUCCESS", "batch2 preserved for resume");
    ok(result.progress?.activityExpansionBatches?.batch3?.status === "FAILED", "batch3 marked FAILED");
    ok((result.usage?.outputTruncationCount || 0) >= 1, "truncation counter increments");

    // Resume reruns only failed batch
    let resumeCalls = 0;
    const resumed = await staged.composeStagedLessonContent(brief15, {
      forceLive: true,
      priorProgress: result.progress,
      callAi: async (_s, user) => {
        resumeCalls += 1;
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) {
          throw new Error("should not regenerate successful blueprint");
        }
        if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
          const parsed = JSON.parse(user.slice(user.indexOf("{")));
          const want = parsed.expandExactlyTheseOutlineIds || [];
          if (want[0] === batches[0][0] || want[0] === batches[1][0]) {
            throw new Error("should not regenerate successful batches");
          }
          return staged.buildStagedFixtureResponse(user);
        }
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(resumed.ok === true, "resume completes after repairing only failed batch");
    ok(activityCountFromContent(resumed.content) === 15, "resume assembles exactly 15");
    ok(resumeCalls >= 1 && resumeCalls <= 3, "resume uses bounded calls for failed batch only");
  }

  // Weak expansion fields rejected
  {
    const blueprint = staged.validateBlueprint(
      JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15))),
      brief15,
    ).blueprint;
    const ids = blueprint.activityOutlines.slice(0, 5).map((o) => o.outlineId);
    const weak = {
      activities: ids.map((id, i) => ({
        outlineId: id,
        title: blueprint.activityOutlines[i].name,
        dayOfWeek: blueprint.activityOutlines[i].weekday,
        objective: "Learn about baking tools.",
        description: "Children will explore tools.",
        materials: "Tools",
        preparation: "Prep",
        setup: "Set out the tools.",
        steps: "Do it",
        teacherLanguage: "What do you see?",
        observationOpportunities: "Watch",
        safetyNotes: "Be careful",
        cleanupTips: "Clean",
        adaptations: "Help as needed",
        extensions: "More",
        vocabulary: "x",
        teacherTips: [],
        observationPrompts: [],
      })),
    };
    const v = staged.validateExpansionBatch(weak, ids, blueprint, brief15);
    ok(v.ok === false, "weak expansion fields rejected");
    ok(v.issues.some((i) => /Too short|Generic filler|missing_tips|thin_vocabulary/i.test(i)),
      "weak-field issue codes present");
  }

  // Final assembly quality + targeted repair
  {
    let expandCalls = 0;
    const composed = await staged.composeStagedLessonContent(brief15, {
      forceLive: true,
      callAi: async (_s, user) => {
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) {
          return staged.buildStagedFixtureResponse(user);
        }
        if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
          expandCalls += 1;
          const good = JSON.parse(staged.buildStagedFixtureResponse(user));
          // Pass batch validation but fail final architect validate (empty indoor/outdoor).
          good.activities = good.activities.map((a) => ({
            ...a,
            indoorAlternatives: "",
            outdoorAlternatives: "",
          }));
          return JSON.stringify(good);
        }
        if (/REPAIR_TARGETED/.test(user)) {
          return staged.buildStagedFixtureResponse(user);
        }
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(composed.ok === true, "targeted final repair can recover weak fields");
    ok(composed.revised === true || Number(composed.usage?.activityRepairCalls) === 1,
      "final repair usage recorded");
    ok(expandCalls === 3, "all three expansion batches ran before repair");
    ok(activityCountFromContent(composed.content) === 15, "repaired assembly still exactly 15");
  }

  // Failed final repair → no lesson.create
  {
    const failed = await staged.composeStagedLessonContent(brief15, {
      forceLive: true,
      callAi: async (_s, user) => {
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) return staged.buildStagedFixtureResponse(user);
        if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
          const good = JSON.parse(staged.buildStagedFixtureResponse(user));
          good.activities = good.activities.map((a) => ({
            ...a,
            objective: "Short.",
            description: "Tiny.",
            setup: "Set out the tools.",
            teacherLanguage: "What do you see?",
            teacherTips: [],
            observationPrompts: [],
          }));
          return JSON.stringify(good);
        }
        // Repair also returns weak content
        if (/REPAIR_TARGETED/.test(user)) {
          return JSON.stringify({ lessonPatches: {}, activities: [] });
        }
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(failed.ok === false && failed.code === "AI_CREATION_FAILED",
      "failed final repair → no lesson.create");
    ok((failed.usage?.activityRepairCalls || 0) <= 1, "only one final repair attempt");
  }

  // Safety: no deterministic fallback, draft only, publish blocked
  {
    const noAi = await architect.composeNewLessonContent(brief15, { forceLive: true, callAi: undefined });
    ok(noAi.ok === false && noAi.code === "AI_CREATION_FAILED", "no deterministic production fallback");
    const good = await architect.composeNewLessonContent(brief15, { forceFixture: true });
    ok(good.content.lesson.status === "draft", "assembled content remains draft");
    ok(!schema.isPhase2Executable("lesson.publish"), "publish remains blocked");
  }

  console.log(`\n${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
