#!/usr/bin/env node
/**
 * Operator empty_changes regression — production-shaped AI payloads must not
 * be discarded when weekly mutations are present under known wrappers/aliases.
 * Run: npm run test:curriculum-operator-empty-changes
 */
"use strict";

const assert = require("node:assert/strict");
const composer = require("./curriculum-operator-ai-composer.js");
const upgradeApi = require("./curriculum-operator-upgrade.js");
const schema = require("./curriculum-operator-schema.js");

const LESSON_ID = "cur-lp-a7537519b9405e15";
let passed = 0;

function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function longValue(seed = "bakery") {
  return [
    `Preschoolers explore a ${seed} theme through concrete props, turn-taking, and short teacher coaching.`,
    "Teachers narrate measuring, rolling, and customer roles while materials stay large and washable.",
    "Children practice vocabulary during play without worksheets or generic filler prompts.",
  ].join(" ");
}

function arrayValue() {
  return [
    "Stage flour trays before arrival",
    "Label customer and baker roles",
    "Reset utensils between groups",
  ];
}

function makePlan() {
  return {
    id: LESSON_ID,
    title: "Operator QA Empty Changes Fixture",
    age: "Preschool 3–4 Years",
    theme: "Bakery",
    plan: "Pro",
    status: "draft",
    weeklyOverview: "TODO fill bakery overview",
    objectives: "TODO",
    weeklyMaterials: "",
    teacherPreparation: "TODO prep",
    familyConnection: "",
    enrichmentDraft: {
      week: {
        weeklyOverview: "TODO fill bakery overview",
        objectives: "TODO",
      },
      activities: {},
    },
    dailyPlans: {
      monday: { items: [] },
      tuesday: { items: [] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
    activityIds: [],
  };
}

function makeAuditNeedingWork() {
  const fields = [
    ["weeklyOverview", "REPLACE"],
    ["objectives", "REPLACE"],
    ["weeklyMaterials", "REPLACE"],
    ["teacherPreparation", "REPLACE"],
    ["prepChecklist", "IMPROVE"],
    ["observationFocus", "FILL"],
    ["familyConnection", "FILL"],
    ["milestones", "FILL"],
    ["vocabCards", "FILL"],
  ];
  return {
    currentStatus: "NEEDS_WORK",
    scores: { premiumReadinessPercent: 20, completionPercent: 15, blocksPublish: true },
    teachingKitBlockers: [{ message: "Placeholders remain in weekly fields" }],
    weeklyContent: fields.map(([field, decision]) => ({
      field,
      decision,
      reason: "placeholder/TODO",
      preview: "TODO",
    })),
    activityClassifications: [],
    songs: [],
    books: { decision: "KEEP" },
  };
}

function makeAuditNoWork() {
  const fields = composer.WEEK_FIELDS;
  return {
    currentStatus: "READY",
    scores: { premiumReadinessPercent: 90, completionPercent: 88, blocksPublish: false },
    teachingKitBlockers: [],
    weeklyContent: fields.map((field) => ({
      field,
      decision: "KEEP",
      reason: "Already strong",
      preview: longValue(field),
    })),
    activityClassifications: [],
    songs: [],
    books: { decision: "KEEP" },
  };
}

function changeFor(field, action) {
  if (["prepChecklist", "observationFocus", "milestones", "vocabCards"].includes(field)) {
    return { action, value: arrayValue() };
  }
  return { action, value: longValue(field) };
}

function productionLikeWeeklyMap(work) {
  const weeklyChanges = {};
  work.weekRequests.forEach((req) => {
    weeklyChanges[req.field] = changeFor(req.field, req.action);
  });
  return weeklyChanges;
}

function reportShape(label, raw, validated) {
  let parsed = null;
  try {
    parsed = JSON.parse(composer.stripJsonFences(raw));
  } catch (_e) {
    parsed = null;
  }
  const topLevelKeys = parsed && typeof parsed === "object" ? Object.keys(parsed) : [];
  const diag = validated.diagnostics || {};
  console.log(`\n--- fixture report: ${label} ---`);
  console.log("1. raw response shape:", Array.isArray(parsed) ? "array" : typeof parsed, `keys=${topLevelKeys.join(",")}`);
  console.log("2. parsed top-level keys:", topLevelKeys.join(", ") || "(none)");
  console.log("3. expected top-level keys:", (diag.expectedKeys || []).join(", "));
  console.log("4. fields accepted:", (diag.accepted || []).map((a) => a.field || a.scope).join(", ") || "(none)");
  console.log("5. fields rejected:", (diag.rejected || []).map((r) => r.field).join(", ") || "(none)");
  console.log("6. rejection reasons:", (diag.rejected || []).map((r) => `${r.field}:${r.reason}`).join(" | ") || "(none)");
  console.log("7. final mutation count:", diag.finalMutationCount ?? "(n/a)");
  console.log("result:", validated.ok ? "OK" : validated.code);
}

async function main() {
  console.log("Curriculum Operator empty_changes regression");

  const plan = makePlan();
  const audit = makeAuditNeedingWork();
  const work = composer.collectWorkItems(plan, [], audit, {
    upgradeLesson: true,
    upgradeActivities: true,
    touchSongs: false,
    touchBooks: false,
  });
  ok(work.hasWork === true, "audit-needs-work produces hasWork");
  ok(work.weekRequests.length >= 4, "multiple weekly requests collected");
  ok(work.activityRequests.length === 0, "activities workPlan can be empty");

  const weeklyChanges = productionLikeWeeklyMap(work);

  // FILL
  {
    const field = work.weekRequests.find((r) => r.action === "FILL")?.field || "familyConnection";
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: { [field]: changeFor(field, "FILL") },
      activities: [],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok === true, "weekly FILL response produces accepted mutation");
    ok(validated.plan.weeklyChanges[field]?.action === "FILL", "FILL action preserved");
  }

  // IMPROVE
  {
    const field = work.weekRequests.find((r) => r.action === "IMPROVE")?.field || "prepChecklist";
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: { [field]: changeFor(field, "IMPROVE") },
      activities: [],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok === true, "weekly IMPROVE response produces accepted mutation");
  }

  // REPLACE
  {
    const field = work.weekRequests.find((r) => r.action === "REPLACE")?.field || "weeklyOverview";
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: { [field]: changeFor(field, "REPLACE") },
      activities: [],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok === true, "weekly REPLACE response produces accepted mutation");
  }

  // Multiple weekly changes + empty activities (production shape)
  {
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges,
      activities: [],
      songs: [],
      books: [],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    reportShape("canonical multi-weekly", raw, validated);
    ok(validated.ok === true, "multiple weekly changes survive validation");
    ok(Object.keys(validated.plan.weeklyChanges).length === work.weekRequests.length,
      "all requested weekly mutations accepted");
    ok(validated.diagnostics.finalMutationCount === work.weekRequests.length,
      "final mutation count matches weekly requests");
  }

  // Production-like wrapped ~31k payload
  {
    const inner = {
      lessonId: LESSON_ID,
      weeklyChanges,
      activities: [],
      notes: longValue("padding").repeat(80),
    };
    const raw = JSON.stringify({ result: inner });
    ok(raw.length > 10000, "fixture approximates large AI output");
    const validated = composer.validateComposerOutput(raw, work, plan);
    reportShape("production-like wrapped.result", raw, validated);
    ok(validated.ok === true, "wrapped.result weeklyChanges are accepted (not empty_changes)");
    ok(validated.diagnostics.weeklySourceKey === "weeklyChanges", "unwrap reaches weeklyChanges");
  }

  // Supported aliases
  {
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weekly: {
        overview: changeFor("weeklyOverview", "REPLACE"),
        learningGoals: changeFor("objectives", "REPLACE"),
        materials: changeFor("weeklyMaterials", "REPLACE"),
        teacherPrep: changeFor("teacherPreparation", "REPLACE"),
        vocabulary: arrayValue(),
      },
      activities: [],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok === true, "supported field aliases normalize correctly");
    ok(validated.plan.weeklyChanges.weeklyOverview, "overview → weeklyOverview");
    ok(validated.plan.weeklyChanges.objectives, "learningGoals → objectives");
    ok(validated.plan.weeklyChanges.weeklyMaterials, "materials → weeklyMaterials");
    ok(validated.plan.weeklyChanges.teacherPreparation, "teacherPrep → teacherPreparation");
    ok(validated.plan.weeklyChanges.vocabCards, "vocabulary → vocabCards");
  }

  // Array-shaped weeklyChanges (live #730 failure shape class)
  {
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: work.weekRequests.map((req) => ({
        field: req.field,
        action: req.action,
        value: changeFor(req.field, req.action).value,
      })),
      activities: [],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    reportShape("array weeklyChanges", raw, validated);
    ok(validated.ok === true, "array-shaped weeklyChanges produces accepted mutations");
    ok(validated.diagnostics.weeklySourceKey === "weeklyChanges[]", "array source key recorded");
    ok(validated.diagnostics.weeklyChangesShape === "array", "weeklyChangesShape=array");
    ok(validated.diagnostics.acceptedWeeklyCount === work.weekRequests.length, "acceptedWeeklyCount matches");
  }

  // Alternate map keys: changes / fields / updates
  {
    const map = productionLikeWeeklyMap(work);
    for (const key of ["changes", "fields", "updates"]) {
      const raw = JSON.stringify({ lessonId: LESSON_ID, [key]: map, activities: [] });
      const validated = composer.validateComposerOutput(raw, work, plan);
      ok(validated.ok === true, `${key} map key normalizes to weekly mutations`);
      ok(validated.diagnostics.weeklyChangesShape === "object", `${key} shape=object`);
    }
  }

  // enrichmentDraft.week plain values
  {
    const week = {};
    work.weekRequests.forEach((req) => {
      week[req.field] = changeFor(req.field, req.action).value;
    });
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      enrichmentDraft: { week },
      activities: [],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok === true, "enrichmentDraft.week plain values accepted");
    ok(validated.diagnostics.weeklySourceKey === "enrichmentDraft.week"
      || validated.diagnostics.detectedWrapper === "enrichmentDraft",
    "enrichmentDraft.week source recorded");
  }

  // result / data wrappers around object and array forms
  {
    const map = productionLikeWeeklyMap(work);
    const arr = work.weekRequests.map((req) => ({
      field: req.field,
      action: req.action,
      value: changeFor(req.field, req.action).value,
    }));
    const resultObj = composer.validateComposerOutput(JSON.stringify({
      result: { lessonId: LESSON_ID, weeklyChanges: map, activities: [] },
    }), work, plan);
    ok(resultObj.ok === true, "result wrapper + object weeklyChanges accepted");
    ok(resultObj.diagnostics.detectedWrapper === "result", "detectedWrapper=result");

    const dataArr = composer.validateComposerOutput(JSON.stringify({
      data: { lessonId: LESSON_ID, weeklyChanges: arr, activities: [] },
    }), work, plan);
    ok(dataArr.ok === true, "data wrapper + array weeklyChanges accepted");
    ok(dataArr.diagnostics.detectedWrapper === "data", "detectedWrapper=data");
    ok(dataArr.diagnostics.weeklyChangesShape === "array", "wrapper+array weeklyChangesShape=array");
  }

  // Identical array duplicates deduplicated
  {
    const req = work.weekRequests[0];
    const entry = {
      field: req.field,
      action: req.action,
      value: changeFor(req.field, req.action).value,
    };
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: [entry, { ...entry }],
      activities: [],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok === true, "identical array duplicates deduplicated");
    ok(validated.diagnostics.acceptedWeeklyCount === 1, "dedupe keeps one accepted field");
    ok(!(validated.diagnostics.rejectionReasonCodes || []).includes("conflict_duplicate"),
      "identical duplicates are not conflicts");
  }

  // Conflicting array duplicates rejected
  {
    const req = work.weekRequests[0];
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: [
        { field: req.field, action: req.action, value: changeFor(req.field, req.action).value },
        { field: req.field, action: req.action, value: `${changeFor(req.field, req.action).value} CONFLICT DIFFERENT` },
      ],
      activities: [],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok === false && validated.code === "conflict_duplicate",
      "conflicting duplicate array entries rejected");
  }

  // Activity IDs inside weekly arrays rejected
  {
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: [{
        field: "weeklyOverview",
        action: "REPLACE",
        value: longValue("x"),
        activityId: "cur-act-nope",
      }],
      activities: [],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok === false && validated.code === "forbidden_field",
      "activity IDs in weekly field arrays rejected");
  }

  // Safe diagnostics present (no raw AI body)
  {
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: { weeklyOverview: changeFor("weeklyOverview", "REPLACE") },
      activities: [],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.diagnostics.responseTopLevelKeys.includes("weeklyChanges"), "diagnostics responseTopLevelKeys");
    ok(typeof validated.diagnostics.acceptedWeeklyCount === "number", "diagnostics acceptedWeeklyCount");
    ok(Array.isArray(validated.diagnostics.normalizedWeeklyFieldNames), "diagnostics normalizedWeeklyFieldNames");
    ok(!JSON.stringify(validated.diagnostics).includes(longValue("bakery").slice(0, 40)),
      "diagnostics do not embed full field values");
  }

  // Unsupported alias rejected
  {
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: {
        weeklyOverview: changeFor("weeklyOverview", "REPLACE"),
        notASupportedAlias: changeFor("weeklyOverview", "FILL"),
      },
      activities: [],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok === false && validated.code === "unknown_field",
      "unsupported aliases remain rejected");
  }

  // Plain string coercion
  {
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: {
        weeklyOverview: longValue("plain"),
        familyConnection: longValue("family"),
      },
      activities: [],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok === true, "plain string weekly values coerce into mutations");
  }

  // activities {} does not invalidate weekly
  {
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: {
        weeklyOverview: changeFor("weeklyOverview", "REPLACE"),
        objectives: changeFor("objectives", "REPLACE"),
      },
      activities: {},
    });
    // activities as object (invalid array) — schema.asArray should yield []
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok === true, "activities {} does not invalidate valid weekly mutations");
  }

  // Unknown activity IDs
  {
    const workWithAct = {
      ...work,
      activityRequests: [{
        activityId: "cur-act-real",
        title: "Real",
        decision: "IMPROVE",
        fields: [{ field: "objective", action: "FILL" }],
      }],
      hasWork: true,
    };
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: {},
      activities: [{
        activityId: "cur-act-does-not-exist",
        changes: { objective: { action: "FILL", value: longValue("objective") } },
      }],
    });
    const validated = composer.validateComposerOutput(raw, workWithAct, plan);
    ok(validated.ok === false && validated.code === "unknown_activity_id",
      "unknown activity IDs rejected");
  }

  // Malformed
  {
    const validated = composer.validateComposerOutput("not json {{{", work, plan);
    ok(validated.ok === false && validated.code === "malformed_output", "malformed output rejected");
  }

  // Genuine audit no-op
  {
    const noopPlan = {
      ...plan,
      enrichmentDraft: {
        week: Object.fromEntries(composer.WEEK_FIELDS.map((f) => [
          f,
          ["prepChecklist", "observationFocus", "milestones", "vocabCards"].includes(f)
            ? arrayValue()
            : longValue(f),
        ])),
        activities: {},
      },
    };
    // Ensure substantial content so IMPROVE/FILL don't reopen
    const noopAudit = makeAuditNoWork();
    let aiCalled = false;
    const composed = await composer.composeUpgradeContent({
      plan: noopPlan,
      activities: [],
      audit: noopAudit,
      callAi: async () => {
        aiCalled = true;
        return "{}";
      },
      touchSongs: false,
      touchBooks: false,
    });
    ok(composed.ok === true && composed.skipped === true, "genuine audit no-op skips AI");
    ok(composed.code === "NO_CHANGES_NEEDED", "no-op returns NO_CHANGES_NEEDED (not empty_changes)");
    ok(aiCalled === false, "no-op does not call AI");
    const built = await upgradeApi.buildUpgradeDraft(noopPlan, { activities: [] }, noopAudit, {
      callAi: async () => {
        throw new Error("should not call");
      },
      touchSongs: false,
      touchBooks: false,
    });
    ok(built.ok === true && built.aiFailed === false && built.changed.length === 0,
      "genuine audit no-op does NOT become BLOCKED(empty_changes)");
  }

  // Audit needs work + AI returns empty → BLOCKED path
  {
    const emptyRaw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: {},
      activities: [],
    });
    const validated = composer.validateComposerOutput(emptyRaw, work, plan);
    reportShape("audit-needs-work + empty AI", emptyRaw, validated);
    ok(validated.ok === false && validated.code === "empty_changes",
      "audit-needs-work + AI returns no usable changes DOES become empty_changes");

    const built = await upgradeApi.buildUpgradeDraft(plan, { activities: [] }, audit, {
      callAi: async () => emptyRaw,
      touchSongs: false,
      touchBooks: false,
    });
    ok(built.aiFailed === true && built.code === "empty_changes",
      "empty AI after needed audit fails upgrade (BLOCKED path)");
    ok(built.changed.length === 0, "failed empty_changes does not mutate draft");
  }

  // Post-save verification after accepted changes
  {
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: {
        weeklyOverview: changeFor("weeklyOverview", "REPLACE"),
        objectives: changeFor("objectives", "REPLACE"),
        familyConnection: changeFor("familyConnection", "FILL"),
      },
      activities: [],
    });
    const built = await upgradeApi.buildUpgradeDraft(plan, { activities: [] }, audit, {
      callAi: async () => raw,
      touchSongs: false,
      touchBooks: false,
    });
    ok(built.ok === true && built.changed.length >= 3, "accepted changes apply to draft");
    const verify = upgradeApi.verifyUpgradeResult({
      beforePlan: plan,
      afterPlan: { ...plan, enrichmentDraft: built.enrichmentDraft },
      intended: built.intended,
      changed: built.changed,
      keepSnapshots: built.keepSnapshots,
    });
    ok(verify.ok === true, "post-save verification still runs after accepted changes");
    ok(built.mutations.publish === false, "no publish");
    ok(built.mutations.images === false, "no images changed unless requested");
    ok(built.mutations.printables === false, "no printables changed unless requested");
  }

  // Safety boundaries unchanged
  ok(schema.isPhase2Executable("lesson.saveDraft"), "draft save remains executable");
  ok(!schema.isPhase2Executable("lesson.publish"), "publish remains blocked from phase2 executor");

  console.log(`\n${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
