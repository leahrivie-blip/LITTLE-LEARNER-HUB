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
        if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
          // Stage 2 repair must not “fix” empty indoor/outdoor so Stage 4 can still run.
          const parsed = JSON.parse(user.slice(user.indexOf("{")));
          const prior = parsed.previousBatchActivities || [];
          return JSON.stringify({
            activities: prior.map((a) => ({
              ...a,
              indoorAlternatives: "",
              outdoorAlternatives: "",
            })),
          });
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
        if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
          // Keep Stage 2 blocked so we never reach create / Stage 4.
          const parsed = JSON.parse(user.slice(user.indexOf("{")));
          return JSON.stringify({
            activities: schema.asArray(parsed.previousBatchActivities).map((a) => ({
              ...a,
              teacherTips: [],
              observationPrompts: [],
              objective: "Short.",
            })),
          });
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

  // ---- Stage 1 weekly-field contract (Live Test 2 defect) ----
  {
    const base = JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15)));
    ok(staged.validateBlueprint(base, brief15).ok === true, "all required weekly fields + 15 outlines → pass");

    for (const field of ["weeklyOverview", "objectives", "weeklyMaterials", "teacherPreparation", "familyConnection"]) {
      const clone = JSON.parse(JSON.stringify(base));
      clone.lesson[field] = "";
      const v = staged.validateBlueprint(clone, brief15);
      ok(v.ok === false && v.issues.some((i) => new RegExp(field, "i").test(i)),
        `15 outlines + empty ${field} → fail`);
    }

    const noPrep = JSON.parse(JSON.stringify(base));
    noPrep.lesson.prepChecklist = [];
    ok(staged.validateBlueprint(noPrep, brief15).ok === false
      && staged.validateBlueprint(noPrep, brief15).issues.includes("missing_prep_checklist"),
      "missing prepChecklist → fail");

    const noObs = JSON.parse(JSON.stringify(base));
    noObs.lesson.observationFocus = [];
    ok(staged.validateBlueprint(noObs, brief15).ok === false
      && staged.validateBlueprint(noObs, brief15).issues.includes("missing_observation_focus"),
      "missing observationFocus → fail");

    const wrongCount = JSON.parse(JSON.stringify(base));
    wrongCount.activityOutlines = wrongCount.activityOutlines.slice(0, 10);
    ok(staged.validateBlueprint(wrongCount, brief15).ok === false, "wrong outline count still fails");
  }

  // Known weekly aliases normalize; unknown rejected
  {
    const base = JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15)));
    const aliased = {
      lesson: {
        title: base.lesson.title,
        age: base.lesson.age,
        theme: base.lesson.theme,
        plan: base.lesson.plan,
        dailyFocus: base.lesson.dailyFocus,
        overview: base.lesson.weeklyOverview,
        learningObjectives: base.lesson.objectives,
        materials: base.lesson.weeklyMaterials,
        teacherPrep: base.lesson.teacherPreparation,
        prepChecklist: base.lesson.prepChecklist,
        observations: base.lesson.observationFocus,
        familyNotes: base.lesson.familyConnection,
        milestones: base.lesson.milestones,
      },
      activityOutlines: base.activityOutlines,
    };
    const v = staged.validateBlueprint(aliased, brief15);
    ok(v.ok === true, "known weekly aliases normalize correctly");
    ok(v.blueprint.lesson.weeklyOverview === base.lesson.weeklyOverview, "overview → weeklyOverview");
    ok(v.blueprint.lesson.objectives === base.lesson.objectives, "learningObjectives → objectives");
    ok(v.blueprint.lesson.weeklyMaterials === base.lesson.weeklyMaterials, "materials → weeklyMaterials");

    const unknown = JSON.parse(JSON.stringify(base));
    unknown.lesson.mysteryWeeklyBlurb = "This should not become stored weekly content.";
    const u = staged.validateBlueprint(unknown, brief15);
    ok(u.ok === false && u.issues.some((i) => /unknown_weekly_alias:mysteryWeeklyBlurb/.test(i)),
      "unknown weekly aliases rejected");
    ok(!Object.prototype.hasOwnProperty.call(u.blueprint.lesson, "mysteryWeeklyBlurb"),
      "unknown alias not stored on lesson");
  }

  // Machine-readable requiredWeeklyFields present in Stage 1 payload
  {
    const prompt = staged.buildStage1UserPrompt(brief15);
    ok(/requiredWeeklyFields/.test(prompt), "Stage 1 payload includes requiredWeeklyFields");
    for (const field of staged.REQUIRED_WEEKLY_FIELDS) {
      ok(prompt.includes(`"${field}"`), `requiredWeeklyFields lists ${field}`);
    }
    ok(/requiredActivityCount/.test(prompt), "Stage 1 payload includes requiredActivityCount");
  }

  // Repair preserves 15 valid outlines; fills weekly fields; cannot erase valid weekly with empty
  {
    const good = JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15)));
    const emptyWeekly = JSON.parse(JSON.stringify(good));
    emptyWeekly.lesson.weeklyOverview = "";
    emptyWeekly.lesson.objectives = "";
    emptyWeekly.lesson.weeklyMaterials = "";
    emptyWeekly.lesson.teacherPreparation = "";
    emptyWeekly.lesson.familyConnection = "";
    emptyWeekly.lesson.prepChecklist = [];
    emptyWeekly.lesson.observationFocus = [];
    const prior = staged.validateBlueprint(emptyWeekly, brief15);
    ok(prior.ok === false, "empty weekly Stage 1 fails before repair");

    let sawRepairPreserve = false;
    const repaired = await staged.composeStagedLessonContent(brief15, {
      forceLive: true,
      callAi: async (_s, user) => {
        if (/CREATE_WEEK_BLUEPRINT/.test(user) && /stage1Repair/.test(user)) {
          sawRepairPreserve = /PRESERVE ALL 15 VALID ACTIVITY OUTLINES/.test(user)
            && /previousStage1/.test(user)
            && /requiredWeeklyFields/.test(user);
          // Repair returns filled weekly fields but drops outlines (must be preserved by merge)
          return JSON.stringify({
            lesson: good.lesson,
            activityOutlines: [],
          });
        }
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) {
          return JSON.stringify(emptyWeekly);
        }
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(sawRepairPreserve, "repair prompt preserves 15 outlines and lists failed weekly fields");
    ok(repaired.ok === true, "repair fills weekly fields and preserves outlines → Stage 1 passes");
    ok(repaired.usage.lessonArchitectureCalls === 2, "exactly one Stage 1 repair call");
    ok(activityCountFromContent(repaired.content) === 15, "create path continues only after Stage 1 valid");
  }

  // Repair empty overwrite cannot erase previously valid weekly field
  {
    const good = JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15)));
    const almost = JSON.parse(JSON.stringify(good));
    almost.lesson.familyConnection = ""; // only family fails
    const coalesced = staged.coalesceStage1Parsed(
      staged.validateBlueprint(almost, brief15).blueprint,
      {
        lesson: {
          ...good.lesson,
          weeklyOverview: "", // repair wrongly empties a previously valid field
          familyConnection: good.lesson.familyConnection,
        },
        activityOutlines: good.activityOutlines,
      },
      brief15,
    );
    const v = staged.validateBlueprint(coalesced, brief15);
    ok(v.ok === true, "repair merge preserves valid weeklyOverview against empty overwrite");
    ok(v.blueprint.lesson.weeklyOverview === almost.lesson.weeklyOverview
      || v.blueprint.lesson.weeklyOverview === good.lesson.weeklyOverview,
      "preserved weeklyOverview remains non-empty");
  }

  // Repair still invalid → BLOCKED, no lesson.create
  {
    const emptyWeekly = JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15)));
    emptyWeekly.lesson.weeklyOverview = "";
    emptyWeekly.lesson.objectives = "";
    emptyWeekly.lesson.weeklyMaterials = "";
    emptyWeekly.lesson.teacherPreparation = "";
    emptyWeekly.lesson.familyConnection = "";
    emptyWeekly.lesson.prepChecklist = [];
    emptyWeekly.lesson.observationFocus = [];
    const blocked = await staged.composeStagedLessonContent(brief15, {
      forceLive: true,
      callAi: async (_s, user) => {
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) return JSON.stringify(emptyWeekly);
        throw new Error("should not reach expansion when Stage 1 blocked");
      },
    });
    ok(blocked.ok === false && blocked.code === "AI_CREATION_FAILED", "repair still invalid → BLOCKED");
    ok(blocked.progress?.creationBlueprintComplete !== true, "no trusted lesson.create on Stage 1 failure");
    ok((blocked.usage?.activityExpansionCalls || 0) === 0, "Stage 2 not reached on Stage 1 failure");
  }

  // Truncation heuristic: completed + parseable + exact count is not false truncation;
  // unterminated JSON still reports truncation
  {
    const goodJson = staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15));
    const fenced = `\`\`\`json\n${goodJson}\n\`\`\``;
    const okFlags = staged.truncationFlags(fenced, 15, 15, { finishReason: "completed" });
    ok(okFlags.possibleOutputTruncation !== true,
      "completed + parseable + exact outline count does NOT falsely report truncation");
    ok(okFlags.unterminatedJsonTail !== true, "fenced JSON does not false-flag unterminated tail");

    const trunc = architect.detectOutputTruncation("{\"lesson\":{", 0, 15, { finishReason: "completed" });
    ok(trunc.truncatedLikely === true && trunc.reasons.includes("unterminated_json_tail"),
      "unterminated JSON still reports truncation");
  }

  // Contract-key echo must not become unknown_weekly_alias (Live Test 2 residual)
  {
    const base = JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15)));
    base.requiredWeeklyFields = [...staged.REQUIRED_WEEKLY_FIELDS];
    base.lesson.requiredWeeklyFields = [...staged.REQUIRED_WEEKLY_FIELDS];
    base.lesson.requiredActivityCount = 15;
    const v = staged.validateBlueprint(base, brief15);
    ok(v.ok === true, "echoed requiredWeeklyFields does not fail Stage 1");
    ok(!v.issues.some((i) => /unknown_weekly_alias:requiredWeeklyFields/.test(i)),
      "requiredWeeklyFields echo is ignored, not rejected");
    ok(!Object.prototype.hasOwnProperty.call(v.blueprint.lesson, "requiredWeeklyFields"),
      "contract echo keys are not stored on lesson");
  }

  // Repair prompt targets failed weekly fields + anti-filler; thin outline rewrite only
  {
    const good = JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15)));
    const prior = staged.validateBlueprint(good, brief15).blueprint;
    prior.lesson.weeklyOverview = "Children will explore bakeries through play.";
    const issues = [
      "Generic filler in weeklyOverview",
      "Baking Science.thin_concept",
    ];
    const repairPrompt = staged.buildStage1UserPrompt(brief15, issues, prior);
    ok(/failedWeeklyFields/.test(repairPrompt), "repair payload lists failedWeeklyFields");
    ok(/weeklyOverview/.test(repairPrompt), "repair names weeklyOverview failure");
    ok(/Forbidden:/.test(repairPrompt) || /Children will explore/.test(repairPrompt),
      "repair forbids shallow filler phrases");
    ok(/Baking Science/.test(repairPrompt), "repair names thin outline");
    ok(/Do NOT echo requiredWeeklyFields/.test(repairPrompt), "repair forbids contract-key echo");
  }

  // Merge: do not let repair overwrite valid weekly with filler; keep valid outline vs thin repair
  {
    const good = JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15)));
    const prior = staged.validateBlueprint(good, brief15).blueprint;
    const fillerRepair = {
      lesson: {
        ...prior.lesson,
        weeklyOverview: "Children will explore bakeries this week.",
      },
      activityOutlines: prior.activityOutlines.map((o, i) => (i === 0
        ? { ...o, concept: "Bake.", developmentalPurpose: "Fun." }
        : o)),
    };
    const coalesced = staged.coalesceStage1Parsed(prior, fillerRepair, brief15);
    const v = staged.validateBlueprint(coalesced, brief15);
    ok(v.ok === true, "coalesce keeps valid weeklyOverview and outline substance over bad repair");
    ok(v.blueprint.lesson.weeklyOverview === prior.lesson.weeklyOverview,
      "valid weeklyOverview preserved against filler overwrite");
    ok(v.blueprint.activityOutlines[0].concept === prior.activityOutlines[0].concept,
      "valid outline concept preserved against thin repair overwrite");
  }

  // ---- Stage 2 expansion quality (Live Test 2 residual) ----
  {
    const blueprint = staged.validateBlueprint(
      JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15))),
      brief15,
    ).blueprint;
    const ids = blueprint.activityOutlines.slice(0, 5).map((o) => o.outlineId);
    const goodBatch = JSON.parse(staged.buildStagedFixtureResponse(
      staged.buildExpansionUserPrompt(brief15, blueprint, ids),
    ));
    ok(staged.validateExpansionBatch(goodBatch, ids, blueprint, brief15).ok === true,
      "complete 5-activity batch passes");

    const noTips = {
      activities: goodBatch.activities.map((a, i) => (i === 0 ? { ...a, teacherTips: [] } : a)),
    };
    ok(staged.validateExpansionBatch(noTips, ids, blueprint, brief15).ok === false
      && staged.validateExpansionBatch(noTips, ids, blueprint, brief15).issues.some((x) => /missing_tips/.test(x)),
      "missing tips fails");

    const noObs = {
      activities: goodBatch.activities.map((a, i) => (i === 0 ? { ...a, observationPrompts: [] } : a)),
    };
    ok(staged.validateExpansionBatch(noObs, ids, blueprint, brief15).ok === false
      && staged.validateExpansionBatch(noObs, ids, blueprint, brief15).issues.some((x) => /missing_observation_prompts/.test(x)),
      "missing observationPrompts fails");

    const thinTips = {
      activities: goodBatch.activities.map((a, i) => (
        i === 0 ? { ...a, teacherTips: ["Help children as needed."] } : a
      )),
    };
    ok(staged.validateExpansionBatch(thinTips, ids, blueprint, brief15).ok === false
      && staged.validateExpansionBatch(thinTips, ids, blueprint, brief15).issues.some((x) => /thin_tips/.test(x)),
      "too-short tips fails");

    const thinObs = {
      activities: goodBatch.activities.map((a, i) => (
        i === 0 ? { ...a, observationPrompts: ["Observe the child."] } : a
      )),
    };
    ok(staged.validateExpansionBatch(thinObs, ids, blueprint, brief15).ok === false
      && staged.validateExpansionBatch(thinObs, ids, blueprint, brief15).issues.some((x) => /thin_observation_prompts/.test(x)),
      "too-short observationPrompts fails");

    const weakAdapt = {
      activities: goodBatch.activities.map((a, i) => (
        i === 0 ? { ...a, adaptations: "Provide support." } : a
      )),
    };
    ok(staged.validateExpansionBatch(weakAdapt, ids, blueprint, brief15).ok === false,
      "weak supportAdaptations fails");

    const weakExt = {
      activities: goodBatch.activities.map((a, i) => (
        i === 0 ? { ...a, extensions: "Make it harder." } : a
      )),
    };
    ok(staged.validateExpansionBatch(weakExt, ids, blueprint, brief15).ok === false,
      "weak addedChallenge fails");

    const weakQs = {
      activities: goodBatch.activities.map((a, i) => (
        i === 0 ? { ...a, teacherLanguage: "What do you see?" } : a
      )),
    };
    ok(staged.validateExpansionBatch(weakQs, ids, blueprint, brief15).ok === false
      && staged.validateExpansionBatch(weakQs, ids, blueprint, brief15).issues.some((x) => /insufficient_questions|Generic filler|Too short/.test(x)),
      "insufficient questions fail where required");

    const conciseOk = {
      activities: goodBatch.activities.map((a, i) => (
        i === 0
          ? {
            ...a,
            cleanupTips: "Sort props into labeled bins and wipe trays.",
            vocabulary: "bakery, count, share, place",
          }
          : a
      )),
    };
    ok(staged.validateExpansionBatch(conciseOk, ids, blueprint, brief15).ok === true,
      "valid concise cleanup and vocabulary accepted");

    // string tips/prompts normalize
    const stringLists = {
      activities: goodBatch.activities.map((a, i) => (
        i === 0
          ? {
            ...a,
            tips: "Offer two tools first for overwhelmed children, then add more once engaged.\nStage a backup tray nearby.",
            observationQuestions: "Notice one-to-one correspondence while placing cookies.\nNotice whether the child recounts after a mismatch.",
            teacherTips: undefined,
            observationPrompts: undefined,
          }
          : a
      )),
    };
    ok(staged.validateExpansionBatch(stringLists, ids, blueprint, brief15).ok === true,
      "string tips/observation aliases normalize into arrays");

    // contract echo stripped; unknown/forbidden rejected
    const echoed = {
      requiredActivityFields: [...staged.REQUIRED_EXPANSION_ACTIVITY_FIELDS],
      activities: goodBatch.activities.map((a, i) => (
        i === 0
          ? {
            ...a,
            requiredActivityFields: ["x"],
            mysteryTipField: "should reject",
            status: "published",
            publishedAt: "2026-01-01",
          }
          : a
      )),
    };
    const echoV = staged.validateExpansionBatch(echoed, ids, blueprint, brief15);
    ok(echoV.ok === false, "unknown/forbidden activity keys rejected");
    ok(echoV.issues.some((x) => /unknown_activity_key:mysteryTipField/.test(x)),
      "random unknown key rejected");
    ok(echoV.issues.some((x) => /forbidden_activity_key:status|forbidden_activity_key:publishedAt/.test(x)),
      "forbidden status/publishedAt rejected");
    ok(!Object.prototype.hasOwnProperty.call(echoV.activities[0] || {}, "requiredActivityFields"),
      "echoed known Stage 2 contract meta-key stripped");
  }

  // Targeted Stage 2 repair + merge + one-repair bound
  {
    const blueprint = staged.validateBlueprint(
      JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15))),
      brief15,
    ).blueprint;
    const ids = blueprint.activityOutlines.slice(0, 5).map((o) => o.outlineId);
    const goodBatch = JSON.parse(staged.buildStagedFixtureResponse(
      staged.buildExpansionUserPrompt(brief15, blueprint, ids),
    ));
    const priorValidated = staged.validateExpansionBatch(goodBatch, ids, blueprint, brief15);
    const broken = {
      activities: priorValidated.activities.map((a, i) => (
        i === 0
          ? { ...a, teacherTips: [], observationPrompts: [] }
          : a
      )),
    };
    const brokenV = staged.validateExpansionBatch(broken, ids, blueprint, brief15);
    ok(brokenV.ok === false, "broken tips/prompts fail before repair");
    const targets = staged.buildExpansionRepairTargets(brokenV.issues, brokenV.activities);
    ok(targets.some((t) => t.outlineId === ids[0] && t.fields.some((f) => f.field === "teacherTips")),
      "repair targets include failed tips field");
    const repairPrompt = staged.buildExpansionRepairUserPrompt(
      brief15,
      blueprint,
      ids,
      brokenV.activities,
      brokenV.issues,
      { batchNumber: 1 },
    );
    ok(/REPAIR_ACTIVITY_BATCH/.test(repairPrompt) && /repairTargets/.test(repairPrompt),
      "repair prompt is targeted");

    // Repair returns only fixed tips/prompts for act0; empties a previously valid objective → merge keeps prior objective
    const repairPayload = {
      activities: brokenV.activities.map((a, i) => (
        i === 0
          ? {
            ...a,
            objective: "",
            teacherTips: [
              "Offer only two bakery tools at first for children who become overwhelmed, then add more once engaged.",
            ],
            observationPrompts: [
              "Notice whether the child uses one-to-one correspondence while placing pretend cookies.",
            ],
          }
          : { ...a, objective: "" }
      )),
    };
    const merged = staged.coalesceExpansionBatch(
      priorValidated.activities,
      repairPayload,
      ids,
      blueprint,
      brief15,
      brokenV.issues,
    );
    ok(merged.ok === true, "targeted repair fixes only failed fields");
    ok(merged.activities[0].outlineId === ids[0], "repair preserves outline IDs");
    ok(merged.activities[0].dayOfWeek === priorValidated.activities[0].dayOfWeek
      && merged.activities[0].activityCategory === priorValidated.activities[0].activityCategory,
      "repair preserves weekday/domain");
    ok(merged.activities[0].objective === priorValidated.activities[0].objective,
      "repair preserves valid original fields");
    ok(merged.activities[0].teacherTips.length > 0 && merged.activities[0].observationPrompts.length > 0,
      "repair fills tips and observationPrompts");

    let expandCalls = 0;
    let repairCalls = 0;
    const blocked = await staged.composeStagedLessonContent(brief15, {
      forceLive: true,
      callAi: async (_s, user) => {
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) {
          return staged.buildStagedFixtureResponse(user);
        }
        if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
          repairCalls += 1;
          const parsed = JSON.parse(user.slice(user.indexOf("{")));
          return JSON.stringify({
            activities: schema.asArray(parsed.previousBatchActivities).map((a) => ({
              ...a,
              teacherTips: [],
              observationPrompts: [],
            })),
          });
        }
        if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
          expandCalls += 1;
          const full = JSON.parse(staged.buildStagedFixtureResponse(user));
          full.activities = full.activities.map((a) => ({ ...a, teacherTips: [], observationPrompts: [] }));
          return JSON.stringify(full);
        }
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(blocked.ok === false && blocked.code === "AI_CREATION_FAILED",
      "repaired batch still invalid → BLOCKED");
    ok(repairCalls === 1, "no second batch repair");
    ok(expandCalls === 1, "one expand + one repair only for failed batch");
    ok(/Stage 2 batch batch1 failed/i.test(String(blocked.error || "")),
      "failed batch does not trigger lesson.create");
    ok((blocked.usage?.activityExpansionCalls || 0) === 2, "bounded expansion+repair call count");
  }

  // Three valid batches → Stage 3 receives exactly 15; diagnostics present; publish blocked
  {
    const composed = await staged.composeStagedLessonContent(brief15, { forceFixture: true });
    ok(composed.ok === true, "fixture compose still succeeds after Stage 2 changes");
    ok(activityCountFromContent(composed.content) === 15, "all 3 batches valid → Stage 3 receives exactly 15");
    ok(Array.isArray(composed.stagedDiagnostics?.batches)
      && composed.stagedDiagnostics.batches.length >= 3,
      "Stage 2 batch diagnostics recorded");
    ok(composed.stagedDiagnostics.batches.every((b) => b.finalBatchPass === true),
      "each batch diagnostic marks finalBatchPass");
    ok(composed.content.lesson.status === "draft", "assembled content remains draft");
    ok(!schema.isPhase2Executable("lesson.publish"), "publish remains blocked");
  }

  console.log(`\n${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
