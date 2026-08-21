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

  // Stage 1 thin_concept → concept repair (Live Test opjob_8cc9a47275bd8b3c)
  {
    const good = JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15)));
    const prior = staged.validateBlueprint(good, brief15).blueprint;
    const thinId = prior.activityOutlines[0].outlineId;
    const thinName = prior.activityOutlines[0].name;
    const preserved = prior.activityOutlines.slice(1).map((o) => ({
      outlineId: o.outlineId,
      name: o.name,
      weekday: o.weekday,
      domain: o.domain,
      concept: o.concept,
      developmentalPurpose: o.developmentalPurpose,
    }));

    // Live-shaped thin concept (5 words) triggers thin_concept; detector unchanged
    const thinBlueprint = {
      ...good,
      lesson: prior.lesson,
      activityOutlines: prior.activityOutlines.map((o, i) => (
        i === 0
          ? { ...o, concept: "Innovatively crafting unique pastry shapes" }
          : o
      )),
    };
    const thinV = staged.validateBlueprint(thinBlueprint, brief15);
    ok(thinV.ok === false && thinV.issues.some((i) => i === `${thinName}.thin_concept`),
      "vague concept triggers thin_concept");
    ok(staged.STAGE1_OUTLINE_ISSUE_CODE_FIELD_MAP.thin_concept === "concept",
      "thin_concept maps to concept");

    const plan = staged.planStage1OutlineRepair(thinV.issues, thinV.blueprint.activityOutlines);
    ok(plan.mappedRepairTargets.some((t) => (
      t.outlineId === thinId && t.fields.some((f) => f.field === "concept" && f.reason === "thin_concept")
    )), "repair target includes correct outlineId + concept");
    ok(plan.initialThinConceptOutlineIds.includes(thinId),
      "initialThinConceptOutlineIds lists failing outline");

    const repairPrompt = staged.buildStage1UserPrompt(brief15, thinV.issues, thinV.blueprint);
    ok(/stage1OutlineRepairTargets/.test(repairPrompt) && new RegExp(thinId).test(repairPrompt),
      "repair prompt includes outlineId-targeted concept repair");
    ok(/what children actually do/i.test(repairPrompt) && /thin_concept → concept/i.test(repairPrompt),
      "repair prompt explains substantive concept requirements");

    const substantiveConcept = "Children roll, press, cut, and shape play dough into pretend bakery foods using simple tools, building fine-motor strength while using descriptive language.";
    const goodRepair = {
      lesson: thinV.blueprint.lesson,
      activityOutlines: thinV.blueprint.activityOutlines.map((o, i) => (
        i === 0
          ? {
            ...o,
            name: "CHANGED NAME SHOULD NOT APPLY",
            weekday: "friday",
            domain: "CHANGED",
            concept: substantiveConcept,
            developmentalPurpose: o.developmentalPurpose,
          }
          : {
            ...o,
            concept: "SHOULD NOT CHANGE OTHER OUTLINES",
            developmentalPurpose: "SHOULD NOT CHANGE",
          }
      )),
    };
    const mergedGood = staged.coalesceStage1Parsed(thinV.blueprint, goodRepair, brief15, {
      repairTargets: plan.mappedRepairTargets,
    });
    const mergedV = staged.validateBlueprint(mergedGood, brief15);
    ok(mergedV.ok === true, "substantive replacement passes");
    ok(mergedV.blueprint.activityOutlines[0].outlineId === thinId, "outlineId preserved");
    ok(mergedV.blueprint.activityOutlines[0].weekday === thinV.blueprint.activityOutlines[0].weekday,
      "weekday preserved");
    ok(mergedV.blueprint.activityOutlines[0].name === thinName, "name preserved when valid");
    ok(mergedV.blueprint.activityOutlines[0].domain === thinV.blueprint.activityOutlines[0].domain,
      "domain preserved when valid");
    ok(mergedV.blueprint.activityOutlines[0].developmentalPurpose
      === thinV.blueprint.activityOutlines[0].developmentalPurpose,
      "developmentalPurpose preserved if valid");
    ok(mergedV.blueprint.activityOutlines[0].concept === substantiveConcept,
      "targeted concept replaced with substantive repair");
    const othersUnchanged = preserved.every((p, idx) => {
      const got = mergedV.blueprint.activityOutlines[idx + 1];
      return got
        && got.concept === p.concept
        && got.developmentalPurpose === p.developmentalPurpose
        && got.name === p.name
        && got.weekday === p.weekday
        && got.domain === p.domain
        && got.outlineId === p.outlineId;
    });
    ok(othersUnchanged, "valid other 14 outlines remain unchanged");

    const vagueRepair = {
      lesson: thinV.blueprint.lesson,
      activityOutlines: thinV.blueprint.activityOutlines.map((o, i) => (
        i === 0 ? { ...o, concept: "Children explore baking." } : o
      )),
    };
    const mergedVague = staged.coalesceStage1Parsed(thinV.blueprint, vagueRepair, brief15, {
      repairTargets: plan.mappedRepairTargets,
    });
    const vagueV = staged.validateBlueprint(mergedVague, brief15);
    ok(vagueV.ok === false && vagueV.issues.some((i) => /\.thin_concept$/.test(i)),
      "vague replacement still fails");
    ok(mergedVague.activityOutlines[0].concept === "Children explore baking.",
      "thin repair replaces prior thin concept (gate remains authoritative)");

    // thin developmentalPurpose targeted independently
    const thinPurposeBp = {
      ...good,
      lesson: prior.lesson,
      activityOutlines: prior.activityOutlines.map((o, i) => (
        i === 1 ? { ...o, developmentalPurpose: "Fun play" } : o
      )),
    };
    const purposeV = staged.validateBlueprint(thinPurposeBp, brief15);
    ok(purposeV.issues.some((i) => /\.thin_purpose$/.test(i)), "thin developmentalPurpose fails");
    const purposePlan = staged.planStage1OutlineRepair(
      purposeV.issues,
      purposeV.blueprint.activityOutlines,
    );
    ok(purposePlan.mappedRepairTargets.some((t) => (
      t.outlineId === prior.activityOutlines[1].outlineId
      && t.fields.some((f) => f.field === "developmentalPurpose")
    )), "thin developmentalPurpose targeted if it independently fails");

    // one repair max; failed repair blocks Stage 2 / create
    let stage1Calls = 0;
    let expandCalls = 0;
    const blocked = await staged.composeStagedLessonContent(brief15, {
      forceLive: true,
      callAi: async (_s, user) => {
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) {
          stage1Calls += 1;
          if (/stage1Repair/.test(user)) {
            ok(/stage1OutlineRepairTargets/.test(user) && /thin_concept → concept/.test(user),
              "live Stage 1 repair uses explicit concept targets");
            const full = JSON.parse(staged.buildStagedFixtureResponse(user));
            // Keep thin concept after repair
            const parsed = JSON.parse(user.slice(user.indexOf("{")));
            const thinIds = schema.asArray(parsed.initialThinConceptOutlineIds);
            full.activityOutlines = full.activityOutlines.map((o) => (
              thinIds.includes(o.outlineId)
                ? { ...o, concept: "Innovatively crafting unique pastry shapes" }
                : o
            ));
            // If no ids in prompt fixture path, thin first outline
            if (!thinIds.length) {
              full.activityOutlines[0].concept = "Innovatively crafting unique pastry shapes";
            }
            return JSON.stringify(full);
          }
          const full = JSON.parse(staged.buildStagedFixtureResponse(user));
          full.activityOutlines[0].concept = "Innovatively crafting unique pastry shapes";
          return JSON.stringify(full);
        }
        if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
          expandCalls += 1;
          return staged.buildStagedFixtureResponse(user);
        }
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(blocked.ok === false && blocked.code === "AI_CREATION_FAILED",
      "failed repair still blocks Stage 2");
    ok(stage1Calls === 2, "one Stage 1 repair max");
    ok(expandCalls === 0, "Stage 2 not reached after Stage 1 thin_concept failure");
    ok(!blocked.content, "no lesson.create on Stage 1 failure");
    ok(blocked.stagedDiagnostics?.stage1?.finalStage1Pass === false, "finalStage1Pass false");
    ok(schema.asArray(blocked.stagedDiagnostics?.stage1?.repairTargets).some((t) => (
      schema.asArray(t.fields).some((f) => f.field === "concept")
    )), "diagnostics show thin_concept → concept targets");

    // valid repaired Stage 1 continues to Stage 2
    stage1Calls = 0;
    expandCalls = 0;
    const recovered = await staged.composeStagedLessonContent(brief15, {
      forceLive: true,
      callAi: async (_s, user) => {
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) {
          stage1Calls += 1;
          const full = JSON.parse(staged.buildStagedFixtureResponse(user));
          if (/stage1Repair/.test(user)) {
            const parsed = JSON.parse(user.slice(user.indexOf("{")));
            const thinIds = new Set(schema.asArray(parsed.initialThinConceptOutlineIds));
            full.activityOutlines = full.activityOutlines.map((o) => (
              thinIds.has(o.outlineId) || (!thinIds.size && o === full.activityOutlines[0])
                ? { ...o, concept: substantiveConcept }
                : o
            ));
            return JSON.stringify(full);
          }
          full.activityOutlines[0].concept = "Innovatively crafting unique pastry shapes";
          return JSON.stringify(full);
        }
        if (/EXPAND_ACTIVITY_BATCH/.test(user) || /REPAIR_ACTIVITY_BATCH/.test(user)
          || /could not be parsed/i.test(user)) {
          expandCalls += 1;
          return staged.buildStagedFixtureResponse(user);
        }
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(recovered.ok === true, "valid repaired Stage 1 continues to Stage 2");
    ok(stage1Calls === 2 && expandCalls >= 3, "Stage 1 repair then Stage 2 batches run");
    ok(recovered.stagedDiagnostics?.stage1?.finalStage1Pass === true, "finalStage1Pass true after repair");
    ok(!schema.isPhase2Executable("lesson.publish"), "publish remains disabled");
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
    ok((blocked.usage?.activityExpansionCalls || 0) === 1, "quality repair does not count as expansion");
    ok((blocked.usage?.activityRepairCalls || 0) === 1, "one quality repair call counted");
    ok((blocked.usage?.activityExpansionRetryCalls || 0) === 0,
      "quality failure does not consume parse retry budget");
  }

  // Stage 2 issue-code → canonical-field mapping (Live Test 2 residual: insufficient_questions)
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
    ok(priorValidated.ok === true, "baseline batch valid before mapping tests");

    ok(staged.EXPANSION_ISSUE_CODE_FIELD_MAP.insufficient_questions === "teacherLanguage",
      "insufficient_questions maps to teacherLanguage");

    // All 5 activities fail questions → teacherLanguage targets for each
    const allWeakQs = {
      activities: priorValidated.activities.map((a) => ({
        ...a,
        teacherLanguage: "What do you see?",
      })),
    };
    const weakAllV = staged.validateExpansionBatch(allWeakQs, ids, blueprint, brief15);
    ok(weakAllV.ok === false, "all-5 weak questions fail validation");
    ok(weakAllV.issues.filter((i) => /\.insufficient_questions$/.test(i)).length === 5
      || weakAllV.issues.filter((i) => /teacherLanguage/i.test(i)).length >= 5,
      "insufficient_questions (or teacherLanguage filler) on all 5 activities");
    const planAll = staged.planExpansionRepair(weakAllV.issues, weakAllV.activities);
    ok(planAll.canRepair === true, "mapped question failures are repairable");
    ok(planAll.unmappedQualityIssues.length === 0, "no unmapped issues for insufficient_questions");
    ok(planAll.mappedRepairTargets.length === 5, "all 5 failed activities produce repair targets");
    ok(planAll.mappedRepairTargets.every((t) => t.fields.some((f) => f.field === "teacherLanguage")),
      "every target includes teacherLanguage for insufficient_questions");
    ok(ids.every((id) => planAll.mappedRepairTargets.some((t) => t.outlineId === id)),
      "repair targets cover every outlineId in the batch");

    // Multi-prompt teacherLanguage repair passes; one generic still fails
    const multiPrompt = [
      "What do you notice about these two tools?",
      "What do you think will happen if we add more?",
      "How are these groups the same or different?",
    ].join("\n");
    const repairedQs = {
      activities: weakAllV.activities.map((a) => ({ ...a, teacherLanguage: multiPrompt })),
    };
    const repairedQsV = staged.validateExpansionBatch(repairedQs, ids, blueprint, brief15);
    ok(repairedQsV.ok === true, "teacherLanguage repair with multiple prompts passes");
    const stillGeneric = {
      activities: weakAllV.activities.map((a, i) => (
        i === 0 ? { ...a, teacherLanguage: "What do you see?" } : { ...a, teacherLanguage: multiPrompt }
      )),
    };
    ok(staged.validateExpansionBatch(stillGeneric, ids, blueprint, brief15).ok === false,
      "one generic prompt still fails");

    // adaptations too_short → canonical adaptations
    const thinAdapt = {
      activities: priorValidated.activities.map((a, i) => (
        i === 0 ? { ...a, adaptations: "Provide support." } : a
      )),
    };
    const thinAdaptV = staged.validateExpansionBatch(thinAdapt, ids, blueprint, brief15);
    ok(thinAdaptV.ok === false, "thin adaptations remains BLOCKED");
    const adaptPlan = staged.planExpansionRepair(thinAdaptV.issues, thinAdaptV.activities);
    ok(adaptPlan.mappedRepairTargets.some((t) => (
      t.outlineId === ids[0] && t.fields.some((f) => f.field === "adaptations")
    )), "adaptations-too-short maps to canonical adaptations field");
    const substantiveAdapt = {
      activities: thinAdaptV.activities.map((a, i) => (
        i === 0
          ? {
            ...a,
            adaptations: "Offer a pre-portioned dough ball and model one press at a time for children who need more support.",
          }
          : a
      )),
    };
    ok(staged.validateExpansionBatch(substantiveAdapt, ids, blueprint, brief15).ok === true,
      "adaptations repair passes when substantive");

    // tips / observationPrompts / vocabulary mapping still works
    const tipsIssue = `${priorValidated.activities[0].title}.missing_tips`;
    const obsIssue = `${priorValidated.activities[0].title}.thin_observation_prompts`;
    const vocabIssue = `${priorValidated.activities[0].title}.thin_vocabulary`;
    const tipPlan = staged.planExpansionRepair(
      [tipsIssue, obsIssue, vocabIssue],
      priorValidated.activities,
    );
    const tipFields = tipPlan.mappedRepairTargets.find((t) => t.outlineId === ids[0])?.fields.map((f) => f.field) || [];
    ok(tipFields.includes("teacherTips"), "tips mapping still works");
    ok(tipFields.includes("observationPrompts"), "observationPrompts mapping still works");
    ok(tipFields.includes("vocabulary"), "vocabulary mapping still works");

    // Unmapped actionable issue → block locally; no wasted repair call
    const unmappedIssue = `Too short: ${priorValidated.activities[0].title}.nonexistentQualityField`;
    const mixedIssues = [
      ...weakAllV.issues.filter((i) => /\.insufficient_questions$|teacherLanguage/i.test(i)).slice(0, 1),
      unmappedIssue,
    ];
    const unmappedPlan = staged.planExpansionRepair(mixedIssues, weakAllV.activities);
    ok(unmappedPlan.unmappedQualityIssues.includes(unmappedIssue),
      "known actionable issue with no mapping is unmapped");
    ok(unmappedPlan.canRepair === false, "incomplete mapping cannot repair");
    ok(staged.planExpansionRepair([unmappedIssue], priorValidated.activities).canRepair === false,
      "unmapped-only plan blocks repair");

    // Successful question+adaptations repair preserves valid fields, outline IDs, count
    const brokenCombo = {
      activities: priorValidated.activities.map((a, i) => ({
        ...a,
        teacherLanguage: "What do you see?",
        ...(i === 0 ? { adaptations: "Provide support." } : {}),
      })),
    };
    const brokenComboV = staged.validateExpansionBatch(brokenCombo, ids, blueprint, brief15);
    const comboPlan = staged.planExpansionRepair(brokenComboV.issues, brokenComboV.activities);
    ok(comboPlan.mappedRepairTargets.every((t) => t.fields.some((f) => f.field === "teacherLanguage")),
      "combo plan targets teacherLanguage on each failed activity");
    ok(comboPlan.mappedRepairTargets.some((t) => (
      t.outlineId === ids[0] && t.fields.some((f) => f.field === "adaptations")
    )), "combo plan also targets adaptations for the thin activity");
    const repairPromptCombo = staged.buildExpansionRepairUserPrompt(
      brief15,
      blueprint,
      ids,
      brokenComboV.activities,
      brokenComboV.issues,
      { batchNumber: 1, repairPlan: comboPlan },
    );
    ok(/If teacherLanguage is targeted/i.test(repairPromptCombo),
      "repair prompt requires multi-prompt teacherLanguage");
    ok(/If adaptations is targeted/i.test(repairPromptCombo),
      "repair prompt requires substantive adaptations");
    ok(/Do not regenerate all activities from scratch/i.test(repairPromptCombo),
      "repair prompt forbids full batch regenerate");

    const repairedCombo = {
      activities: brokenComboV.activities.map((a, i) => ({
        ...a,
        objective: "",
        teacherLanguage: multiPrompt,
        ...(i === 0
          ? {
            adaptations: "Offer hand-over-hand rolling and a smaller dough ball for children needing motor support.",
          }
          : {}),
      })),
    };
    const mergedCombo = staged.coalesceExpansionBatch(
      priorValidated.activities,
      repairedCombo,
      ids,
      blueprint,
      brief15,
      brokenComboV.issues,
    );
    ok(mergedCombo.ok === true, "merged question+adaptations repair passes");
    ok(mergedCombo.activities.every((a, i) => a.outlineId === ids[i]), "outline IDs preserved after repair merge");
    ok(mergedCombo.activities.length === 5, "no extra/missing activities after repair");
    ok(mergedCombo.activities[0].objective === priorValidated.activities[0].objective,
      "repair preserves valid non-targeted fields");
    ok(mergedCombo.activities[0].teacherTips.length > 0, "non-targeted tips remain");

    // Thin adaptations after targeted repair still BLOCKED
    const badAdaptRepair = {
      activities: brokenComboV.activities.map((a) => ({
        ...a,
        teacherLanguage: multiPrompt,
        adaptations: a.outlineId === ids[0] ? "Help more." : a.adaptations,
      })),
    };
    const mergedBadAdapt = staged.coalesceExpansionBatch(
      brokenComboV.activities,
      badAdaptRepair,
      ids,
      blueprint,
      brief15,
      brokenComboV.issues,
    );
    ok(mergedBadAdapt.ok === false, "thin adaptations after repair remains BLOCKED");

    // Live compose: weak questions then successful multi-prompt repair → continues to batch2+
    let expandN = 0;
    let repairN = 0;
    let createTrusted = false;
    const successRepair = await staged.composeStagedLessonContent(brief15, {
      forceLive: true,
      callAi: async (_s, user) => {
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) {
          return staged.buildStagedFixtureResponse(user);
        }
        if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
          repairN += 1;
          const parsed = JSON.parse(user.slice(user.indexOf("{")));
          ok(parsed.repairTargets?.every((t) => (
            schema.asArray(t.fields).some((f) => f.field === "teacherLanguage")
          )), "live repair payload maps insufficient_questions → teacherLanguage");
          return JSON.stringify({
            activities: schema.asArray(parsed.previousBatchActivities).map((a) => ({
              ...a,
              teacherLanguage: multiPrompt,
              adaptations: String(a.adaptations || "").length >= 20
                ? a.adaptations
                : "Offer a smaller tray and model one scoop at a time for children who need support.",
            })),
          });
        }
        if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
          expandN += 1;
          const full = JSON.parse(staged.buildStagedFixtureResponse(user));
          if (expandN === 1) {
            full.activities = full.activities.map((a) => ({
              ...a,
              teacherLanguage: "What do you see?",
            }));
          }
          return JSON.stringify(full);
        }
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(successRepair.ok === true, "valid repaired batch may continue to Batch 2+");
    ok(repairN === 1, "one repair max on success path");
    ok(expandN === 3, "three expansion batches after Batch 1 repair success");
    ok(activityCountFromContent(successRepair.content) === 15, "repaired path yields 15 activities");
    const batch1Diag = schema.asArray(successRepair.stagedDiagnostics?.batches).find((b) => b.batchNumber === 1);
    ok(batch1Diag?.repairUsed === true, "diagnostics mark repairUsed");
    ok(schema.asArray(batch1Diag?.mappedRepairTargets).length === 5
      || schema.asArray(batch1Diag?.initialQualityFailures).some((i) => /insufficient_questions|teacherLanguage/i.test(i)),
      "diagnostics show question failures mapped for Batch 1");
    ok(batch1Diag?.finalBatchPass === true, "diagnostics finalBatchPass true after repair");

    // Failed batch still prevents lesson.create — weak questions, repair also weak
    expandN = 0;
    repairN = 0;
    createTrusted = false;
    const stillBlocked = await staged.composeStagedLessonContent(brief15, {
      forceLive: true,
      callAi: async (_s, user) => {
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) {
          return staged.buildStagedFixtureResponse(user);
        }
        if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
          repairN += 1;
          const parsed = JSON.parse(user.slice(user.indexOf("{")));
          return JSON.stringify({
            activities: schema.asArray(parsed.previousBatchActivities).map((a) => ({
              ...a,
              teacherLanguage: "What do you see?",
            })),
          });
        }
        if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
          expandN += 1;
          const full = JSON.parse(staged.buildStagedFixtureResponse(user));
          full.activities = full.activities.map((a) => ({
            ...a,
            teacherLanguage: "What do you see?",
          }));
          return JSON.stringify(full);
        }
        createTrusted = true;
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(stillBlocked.ok === false && stillBlocked.code === "AI_CREATION_FAILED",
      "failed Stage 2 still blocks create");
    ok(repairN === 1 && expandN === 1, "one expand + one repair max when still failing");
    ok(createTrusted === false, "no lesson.create / further stages when Stage 2 blocked");
    ok(!schema.isPhase2Executable("lesson.publish"), "publish behavior unchanged");

    // Unmapped quality issue wastes no repair call (inject via repairPlanner option)
    expandN = 0;
    repairN = 0;
    const noWaste = await staged.composeStagedLessonContent(brief15, {
      forceLive: true,
      repairPlanner: (issues, activities) => {
        const real = staged.planExpansionRepair(issues, activities);
        return {
          ...real,
          unmappedQualityIssues: [`Too short: ${activities[0]?.title || "Act"}.nonexistentQualityField`],
          canRepair: false,
        };
      },
      callAi: async (_s, user) => {
        if (/CREATE_WEEK_BLUEPRINT/.test(user)) {
          return staged.buildStagedFixtureResponse(user);
        }
        if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
          repairN += 1;
          return "{}";
        }
        if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
          expandN += 1;
          const full = JSON.parse(staged.buildStagedFixtureResponse(user));
          full.activities = full.activities.map((a) => ({
            ...a,
            teacherLanguage: "What do you see?",
          }));
          return JSON.stringify(full);
        }
        return staged.buildStagedFixtureResponse(user);
      },
    });
    ok(noWaste.ok === false, "unmapped mapping incomplete blocks Stage 2");
    ok(repairN === 0, "no repair call is wasted when mapping is incomplete");
    ok(expandN === 1, "only initial expand when unmapped blocks repair");
    ok(
      schema.asArray(noWaste.issues).some((i) => /unmapped_quality_issue/.test(String(i)))
        || schema.asArray(noWaste.stagedDiagnostics?.batches).some((b) => (
          schema.asArray(b.unmappedQualityIssues).length > 0
        )),
      "diagnostics expose unmapped_quality_issue",
    );
  }

  // Stage 2 parse-recovery vs quality-repair budgets (Live Test opjob_b82cd662d3f24b3c)
  {
    const multiPrompt = [
      "What do you notice about these two tools?",
      "What do you think will happen if we add more?",
      "How are these groups the same or different?",
    ].join("\n");

    // 1. first expansion parses + quality passes → 1 call total
    {
      let expandN = 0;
      let repairN = 0;
      let parseRetryN = 0;
      const r = await staged.composeStagedLessonContent(brief15, {
        forceLive: true,
        callAi: async (_s, user) => {
          if (/CREATE_WEEK_BLUEPRINT/.test(user)) return staged.buildStagedFixtureResponse(user);
          if (/could not be parsed/i.test(user)) parseRetryN += 1;
          if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
            repairN += 1;
            return "{}";
          }
          if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
            expandN += 1;
            return staged.buildStagedFixtureResponse(user);
          }
          return staged.buildStagedFixtureResponse(user);
        },
      });
      ok(r.ok === true, "happy path: first expansion parses + quality passes");
      ok(expandN === 3 && repairN === 0 && parseRetryN === 0,
        "happy path → 1 expand per batch, 0 repair, 0 parse retry");
      ok((r.usage?.activityExpansionCalls || 0) === 3
        && (r.usage?.activityExpansionRetryCalls || 0) === 0
        && (r.usage?.activityRepairCalls || 0) === 0,
        "happy path counters bounded (3 expand / 0 retry / 0 repair)");
    }

    // 2. first expansion parse fails, second parses + quality passes → 2 expansion, 0 repair
    {
      let expandN = 0;
      let repairN = 0;
      let parseRetryN = 0;
      const r = await staged.composeStagedLessonContent(brief15, {
        forceLive: true,
        callAi: async (_s, user) => {
          if (/CREATE_WEEK_BLUEPRINT/.test(user)) return staged.buildStagedFixtureResponse(user);
          if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
            repairN += 1;
            return "{}";
          }
          if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
            expandN += 1;
            if (/could not be parsed/i.test(user)) parseRetryN += 1;
            // Fail only the first Batch 1 expand; parse-retry + later batches succeed
            if (expandN === 1 && !/could not be parsed/i.test(user)) {
              return "{ not valid json";
            }
            return staged.buildStagedFixtureResponse(user);
          }
          return staged.buildStagedFixtureResponse(user);
        },
      });
      ok(r.ok === true, "parse fail then parse-ok quality-pass succeeds");
      ok(parseRetryN === 1 && repairN === 0, "2 expansion path uses parse retry, 0 repair");
      ok((r.usage?.activityExpansionCalls || 0) === 4
        && (r.usage?.activityExpansionRetryCalls || 0) === 1
        && (r.usage?.activityRepairCalls || 0) === 0,
        "parse-retry counters: expand includes retry; repair unused");
      const b1 = schema.asArray(r.stagedDiagnostics?.batches).find((b) => b.batchNumber === 1);
      ok(b1?.parseRetryUsed === true && b1?.repairUsed === false && b1?.finalBatchPass === true,
        "diagnostics: parseRetryUsed true, quality repair unused, batch pass");
    }

    // 3. first parses but quality fails → 1 expansion + 1 repair
    {
      let expandN = 0;
      let repairN = 0;
      let parseRetryN = 0;
      const r = await staged.composeStagedLessonContent(brief15, {
        forceLive: true,
        callAi: async (_s, user) => {
          if (/CREATE_WEEK_BLUEPRINT/.test(user)) return staged.buildStagedFixtureResponse(user);
          if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
            repairN += 1;
            const parsed = JSON.parse(user.slice(user.indexOf("{")));
            return JSON.stringify({
              activities: schema.asArray(parsed.previousBatchActivities).map((a) => ({
                ...a,
                teacherLanguage: multiPrompt,
                vocabulary: "bakery, dough, count, share, place",
                objective: "Children practice counting bakery tools with one-to-one correspondence and comparing groups.",
              })),
            });
          }
          if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
            expandN += 1;
            if (/could not be parsed/i.test(user)) parseRetryN += 1;
            const full = JSON.parse(staged.buildStagedFixtureResponse(user));
            if (expandN === 1) {
              full.activities = full.activities.map((a) => ({
                ...a,
                teacherLanguage: "What do you see?",
                vocabulary: "hi",
                objective: "Explore.",
              }));
            }
            return JSON.stringify(full);
          }
          return staged.buildStagedFixtureResponse(user);
        },
      });
      ok(r.ok === true, "quality-fail then repair succeeds");
      ok(expandN === 3 && repairN === 1 && parseRetryN === 0,
        "quality path: 1 expand + 1 repair, no parse retry");
      ok((r.usage?.activityExpansionRetryCalls || 0) === 0
        && (r.usage?.activityRepairCalls || 0) === 1,
        "quality failure does not consume parse retry budget");
    }

    // 4+5. Live pattern: malformed → parse retry 5/5 → quality fail → repair runs with targets
    {
      let expandN = 0;
      let repairN = 0;
      let parseRetryN = 0;
      const r = await staged.composeStagedLessonContent(brief15, {
        forceLive: true,
        callAi: async (_s, user) => {
          if (/CREATE_WEEK_BLUEPRINT/.test(user)) return staged.buildStagedFixtureResponse(user);
          if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
            repairN += 1;
            const parsed = JSON.parse(user.slice(user.indexOf("{")));
            const fields = new Set();
            schema.asArray(parsed.repairTargets).forEach((t) => {
              schema.asArray(t.fields).forEach((f) => fields.add(f.field));
            });
            ok(fields.has("objective") && fields.has("vocabulary") && fields.has("teacherLanguage"),
              "live pattern repairTargets include objective/vocabulary/teacherLanguage");
            return JSON.stringify({
              activities: schema.asArray(parsed.previousBatchActivities).map((a) => ({
                ...a,
                teacherLanguage: multiPrompt,
                vocabulary: "bakery, dough, count, share, place",
                objective: "Children practice counting bakery tools with one-to-one correspondence and comparing groups.",
              })),
            });
          }
          if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
            expandN += 1;
            if (/could not be parsed/i.test(user)) parseRetryN += 1;
            if (expandN === 1 && !/could not be parsed/i.test(user)) {
              return "{ truncated malformed";
            }
            const full = JSON.parse(staged.buildStagedFixtureResponse(user));
            // After parse retry for batch1: inject live quality failures
            if (parseRetryN === 1 && expandN === 2) {
              full.activities = full.activities.map((a, i) => ({
                ...a,
                objective: "Explore.",
                vocabulary: "hi",
                teacherLanguage: i < 2 ? "What do you see?" : a.teacherLanguage,
              }));
            }
            return JSON.stringify(full);
          }
          return staged.buildStagedFixtureResponse(user);
        },
      });
      ok(r.ok === true, "live pattern: parse retry + quality repair both allowed");
      ok(parseRetryN === 1 && repairN === 1, "parse retry used and quality repair used (separate)");
      ok((r.usage?.activityExpansionRetryCalls || 0) === 1
        && (r.usage?.activityRepairCalls || 0) === 1,
        "parse failure does not consume quality repair budget");
      ok(repairN === 1, "no second quality repair / no third uncontrolled repair");
      const b1 = schema.asArray(r.stagedDiagnostics?.batches).find((b) => b.batchNumber === 1);
      ok(b1?.expansionAttempts === 2, "Batch 1 expansionAttempts capped at initial+1 parse retry");
      ok(b1?.parseRetryUsed === true && b1?.repairUsed === true && b1?.finalBatchPass === true,
        "diagnostics separate parseRetryUsed and repairUsed");
      ok(schema.asArray(b1?.mappedRepairTargets).length >= 1, "mappedRepairTargets populated after parseable batch");
      ok(activityCountFromContent(r.content) === 15, "valid repaired Batch 1 may continue to Batch 2/3");
    }

    // 6. second parse failure → BLOCK
    {
      let expandN = 0;
      let repairN = 0;
      const r = await staged.composeStagedLessonContent(brief15, {
        forceLive: true,
        callAi: async (_s, user) => {
          if (/CREATE_WEEK_BLUEPRINT/.test(user)) return staged.buildStagedFixtureResponse(user);
          if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
            repairN += 1;
            return "{}";
          }
          if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
            expandN += 1;
            return "{ still broken";
          }
          return staged.buildStagedFixtureResponse(user);
        },
      });
      ok(r.ok === false && r.code === "AI_CREATION_FAILED", "second parse failure → BLOCK");
      ok(expandN === 2 && repairN === 0, "max one parse retry; no quality repair without parse");
      ok((r.usage?.activityExpansionRetryCalls || 0) === 1
        && (r.usage?.activityRepairCalls || 0) === 0,
        "double parse fail: retry=1 repair=0");
      const b1 = schema.asArray(r.stagedDiagnostics?.batches).find((b) => b.batchNumber === 1);
      ok(b1?.finalBatchPass === false && b1?.parseRetryUsed === true, "parseRetryUsed with finalBatchPass false");
    }

    // 7+8. repair still invalid → BLOCK; no second quality repair
    {
      let repairN = 0;
      const r = await staged.composeStagedLessonContent(brief15, {
        forceLive: true,
        callAi: async (_s, user) => {
          if (/CREATE_WEEK_BLUEPRINT/.test(user)) return staged.buildStagedFixtureResponse(user);
          if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
            repairN += 1;
            const parsed = JSON.parse(user.slice(user.indexOf("{")));
            return JSON.stringify({
              activities: schema.asArray(parsed.previousBatchActivities).map((a) => ({
                ...a,
                teacherLanguage: "What do you see?",
              })),
            });
          }
          if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
            const full = JSON.parse(staged.buildStagedFixtureResponse(user));
            full.activities = full.activities.map((a) => ({
              ...a,
              teacherLanguage: "What do you see?",
            }));
            return JSON.stringify(full);
          }
          return staged.buildStagedFixtureResponse(user);
        },
      });
      ok(r.ok === false && r.code === "AI_CREATION_FAILED", "repair still invalid → BLOCK");
      ok(repairN === 1, "no second quality repair");
      ok(!r.content, "failed Stage 2 still blocks lesson.create");
      ok(!schema.isPhase2Executable("lesson.publish"), "publish behavior unchanged");
    }

    // 9–12 already covered above; parse retry prompt shape
    ok(/could not be parsed/i.test(
      staged.buildExpansionParseRetryUserPrompt(
        brief15,
        staged.validateBlueprint(
          JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief15))),
          brief15,
        ).blueprint,
        ["o1"],
        { batchNumber: 1 },
      ),
    ), "parse retry prompt asks for same batch as valid JSON only");

    ok(staged.MAX_EXPANSION_PARSE_RETRIES === 1
      && staged.MAX_QUALITY_REPAIR_CALLS_PER_BATCH === 1,
      "hard limits: max 1 parse retry and 1 quality repair per batch");

    ok(staged.isExpansionParseTransportFailure(
      { ok: false, flags: { possibleOutputTruncation: true } },
      null,
      5,
    ) === true, "malformed stage classified as parse/transport failure");

    ok(staged.isExpansionParseTransportFailure(
      { ok: true, flags: {}, parsedObjectCount: 5 },
      {
        ok: false,
        parsedObjectCount: 5,
        activities: [{ outlineId: "a" }],
        issues: ["Title.insufficient_questions"],
      },
      5,
    ) === false, "parsed valid batch with quality issues is NOT parse failure");
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
    ok(!schema.isPhase2Executable("lesson.publish"), "publish behavior unchanged (fixture path)");
  }

  console.log(`\n${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
