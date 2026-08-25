#!/usr/bin/env node
/**
 * Operator UPGRADE_TEXT thin-field bounded repair (materials and related prose gates).
 * Run: npm run test:curriculum-operator-upgrade-thin-repair
 */
"use strict";

const assert = require("node:assert/strict");
const composer = require("./curriculum-operator-ai-composer.js");
const upgradeApi = require("./curriculum-operator-upgrade.js");
const auditApi = require("./curriculum-operator-audit.js");
const schema = require("./curriculum-operator-schema.js");

const LESSON_ID = "cur-lp-thin-repair-test";
const ACT_ID = "cur-act-thin-materials";
const GOOD_OBJECTIVE = "Children press dot markers on paper while naming colors and sharing the tray with a friend.";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function seedPlan() {
  return {
    id: LESSON_ID,
    title: "Dot Marker Studio",
    age: "Toddler 18–24 Months",
    theme: "Colors",
    plan: "Free",
    status: "draft",
    weeklyOverview: "Children explore colors through process art all week with dot markers, paper, and teacher-guided language.",
    objectives: "",
    enrichmentDraft: { week: {}, activities: {} },
    dailyPlans: {
      monday: {
        items: [{
          itemId: "dots",
          title: "Dot Marker Color Pops",
          dayOfWeek: "monday",
          objective: GOOD_OBJECTIVE,
          materials: "markers",
        }],
      },
      tuesday: { items: [] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
    activityIds: [ACT_ID],
  };
}

function seedCurriculum() {
  const plan = seedPlan();
  return {
    lessonPlans: [plan],
    activities: [{
      id: ACT_ID,
      lessonPlanId: LESSON_ID,
      itemId: "dots",
      title: "Dot Marker Color Pops",
      dayOfWeek: "monday",
      objective: GOOD_OBJECTIVE,
      materials: "markers",
      description: "",
      steps: "",
    }],
    resources: [],
  };
}

async function main() {
  console.log("Operator upgrade thin-field repair");
  const curriculum = seedCurriculum();
  const plan = curriculum.lessonPlans[0];
  const audit = auditApi.auditLesson(plan, curriculum);
  let aiCalls = 0;

  const thinThenRepairAi = async (system, user) => {
    aiCalls += 1;
    if (aiCalls === 1) {
      return JSON.stringify({
        lessonId: LESSON_ID,
        weeklyChanges: {
          objectives: {
            action: "FILL",
            value: "Children explore colors through dot markers, paper trays, and teacher-guided language all week.",
          },
        },
        activities: [{
          activityId: ACT_ID,
          changes: {
            objective: { action: "KEEP", value: GOOD_OBJECTIVE },
            materials: { action: "FILL", value: "dot markers paper" },
            description: {
              action: "FILL",
              value: "Children press markers on paper while naming colors and trading markers with teacher support nearby.",
            },
          },
        }],
      });
    }
    return composer.buildOperatorAiFixtureResponse(user);
  };

  const composed = await composer.composeUpgradeContent({
    plan,
    activities: curriculum.activities,
    audit,
    callAi: thinThenRepairAi,
  });

  ok(composed.ok, "thin materials repair succeeds");
  ok(composed.repairUsed === true, "repair pass was used");
  ok(composed.usage?.repairCalls === 1, "exactly one repair call");
  ok(aiCalls === 2, "total AI calls bounded to initial + one repair");
  ok(composed.validatedPlan?.weeklyChanges?.objectives, "weekly objectives accepted from initial pass");
  const actChanges = (composed.validatedPlan?.activities || []).find((a) => a.activityId === ACT_ID)?.changes || {};
  ok(wordCount(actChanges.materials?.value) >= 8, "repaired materials meets word gate");
  ok(
    wordCount(actChanges.description?.value) >= 8,
    "valid description from initial pass preserved through repair merge",
  );

  const upgrade = await upgradeApi.buildUpgradeDraft(plan, curriculum, audit, {
    callAi: thinThenRepairAi,
    editedBy: "test",
  });
  ok(upgrade.ok && !upgrade.aiFailed, "buildUpgradeDraft succeeds after repair");
  ok(upgrade.enrichmentDraft?.activities?.[ACT_ID]?.materials, "materials saved on draft");
  ok(
    wordCount(upgrade.enrichmentDraft?.activities?.[ACT_ID]?.description) >= 8,
    "description preserved on draft after repair",
  );

  const afterPlan = {
    ...plan,
    enrichmentDraft: upgrade.enrichmentDraft,
  };
  const verify = upgradeApi.verifyUpgradeResult({
    beforePlan: plan,
    afterPlan,
    intended: upgrade.intended,
    changed: upgrade.changed,
    keepSnapshots: upgrade.keepSnapshots,
  });
  ok(verify.ok, "verifyUpgradeResult passes");
  ok(verify.checks.every((c) => c.code !== "lesson_id" || c.ok), "lesson ID stable");

  aiCalls = 0;
  const failRepairAi = async (system, user) => {
    aiCalls += 1;
    if (aiCalls === 1) {
      return JSON.stringify({
        lessonId: LESSON_ID,
        activities: [{
          activityId: ACT_ID,
          changes: { materials: { action: "FILL", value: "too thin" } },
        }],
      });
    }
    return JSON.stringify({
      lessonId: LESSON_ID,
      activities: [{
        activityId: ACT_ID,
        changes: { materials: { action: "FILL", value: "still thin" } },
      }],
    });
  };

  const failed = await composer.composeUpgradeContent({
    plan,
    activities: curriculum.activities,
    audit,
    callAi: failRepairAi,
  });
  ok(!failed.ok, "failed repair leaves compose failed");
  ok(
    ["thin_repair_failed", "thin_repair_merge_failed", "invalid_change"].includes(failed.code),
    "failed repair code surfaced",
  );
  ok(failed.repairUsed === true, "repair was attempted once");

  const blockedUpgrade = await upgradeApi.buildUpgradeDraft(plan, curriculum, audit, {
    callAi: failRepairAi,
  });
  ok(!blockedUpgrade.ok && blockedUpgrade.aiFailed, "buildUpgradeDraft blocked on failed repair");
  ok(
  text(blockedUpgrade.enrichmentDraft?.activities?.[ACT_ID]?.materials || "markers") === "markers",
    "failed repair does not persist thin materials to prior draft",
  );

  console.log("\nsafetyNotes thin-field repair");
  const safetyActId = "cur-act-thin-safety";
  const safetyCurriculum = {
    lessonPlans: [{
      ...seedPlan(),
      id: LESSON_ID,
      dailyPlans: {
        monday: {
          items: [{
            itemId: "safe",
            title: "Calm Breathing Scarves",
            dayOfWeek: "monday",
            objective: GOOD_OBJECTIVE,
            materials: "soft scarves, calm music, floor cushions for toddler resting spots",
            safetyNotes: "Be careful",
            description: "Children wave soft scarves slowly while practicing calm breaths with a teacher nearby for support.",
          }],
        },
        tuesday: { items: [] },
        wednesday: { items: [] },
        thursday: { items: [] },
        friday: { items: [] },
      },
      activityIds: [safetyActId],
    }],
    activities: [{
      id: safetyActId,
      lessonPlanId: LESSON_ID,
      itemId: "safe",
      title: "Calm Breathing Scarves",
      dayOfWeek: "monday",
      objective: GOOD_OBJECTIVE,
      materials: "soft scarves, calm music, floor cushions for toddler resting spots",
      safetyNotes: "Be careful",
      description: "Children wave soft scarves slowly while practicing calm breaths with a teacher nearby for support.",
    }],
    resources: [],
  };
  const safetyPlan = safetyCurriculum.lessonPlans[0];
  const safetyAudit = auditApi.auditLesson(safetyPlan, safetyCurriculum);
  let safetyCalls = 0;
  const safetyRepairAi = async (system, user) => {
    safetyCalls += 1;
    if (safetyCalls === 1) {
      return JSON.stringify({
        lessonId: LESSON_ID,
        activities: [{
          activityId: safetyActId,
          changes: {
            setup: {
              action: "FILL",
              value: "Place soft scarves and floor cushions in a calm corner with space for two toddlers to sit and breathe together.",
            },
            steps: {
              action: "FILL",
              value: "1. Invite two children to sit on cushions.\n2. Model a slow scarf wave and calm breath.\n3. Let children copy the motion.\n4. Narrate what they notice.\n5. Give a two-minute warning and put scarves away.",
            },
            safetyNotes: { action: "FILL", value: "Watch closely" },
          },
        }],
      });
    }
    return composer.buildOperatorAiFixtureResponse(user);
  };
  const safetyComposed = await composer.composeUpgradeContent({
    plan: safetyPlan,
    activities: safetyCurriculum.activities,
    audit: safetyAudit,
    callAi: safetyRepairAi,
  });
  ok(safetyComposed.ok, "thin safetyNotes repair succeeds");
  ok(safetyComposed.repairUsed === true, "safetyNotes repair pass was used");
  ok(safetyComposed.usage?.repairCalls === 1, "exactly one safetyNotes repair call");
  ok(composer.REPAIRABLE_THIN_PROSE_FIELDS.includes("safetyNotes"), "safetyNotes listed as repairable thin prose field");
  ok(
    composer.isRepairableThinValidationError("Value too short for safetyNotes", "safetyNotes"),
    "safetyNotes thin error is repairable",
  );
  const safetyChanges = (safetyComposed.validatedPlan?.activities || [])
    .find((a) => a.activityId === safetyActId)?.changes || {};
  ok(wordCount(safetyChanges.safetyNotes?.value) >= 8, "repaired safetyNotes meets word gate");
  ok(
    wordCount(safetyChanges.setup?.value || "") >= 8
      || wordCount(safetyChanges.steps?.value || "") >= 8,
    "valid sibling setup/steps from initial pass preserved through safetyNotes repair",
  );
  ok(
    /scarf|chok|arm|reach|mouth|tool|hazard|supervis/i.test(safetyChanges.safetyNotes?.value || ""),
    "repaired safetyNotes includes concrete hazard/supervision guidance",
  );

  safetyCalls = 0;
  const failSafetyAi = async (system, user) => {
    safetyCalls += 1;
    if (safetyCalls === 1) {
      return JSON.stringify({
        lessonId: LESSON_ID,
        activities: [{
          activityId: safetyActId,
          changes: { safetyNotes: { action: "FILL", value: "Be safe" } },
        }],
      });
    }
    return JSON.stringify({
      lessonId: LESSON_ID,
      activities: [{
        activityId: safetyActId,
        changes: { safetyNotes: { action: "FILL", value: "Still thin" } },
      }],
    });
  };
  const failedSafety = await composer.composeUpgradeContent({
    plan: safetyPlan,
    activities: safetyCurriculum.activities,
    audit: safetyAudit,
    callAi: failSafetyAi,
  });
  ok(!failedSafety.ok, "failed safetyNotes repair leaves compose failed");
  ok(
    ["thin_repair_failed", "thin_repair_merge_failed", "invalid_change"].includes(failedSafety.code),
    "failed safetyNotes repair code surfaced",
  );
  ok(failedSafety.repairUsed === true, "safetyNotes repair was attempted once before BLOCKED");

  console.log(`\nThin repair passed ${passed} assertions`);
}

function text(value) {
  return schema.text(value, 4000);
}

function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
