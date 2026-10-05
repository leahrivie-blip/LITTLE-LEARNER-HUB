#!/usr/bin/env node
/**
 * Stage 2 too_short field repair — extensions & preparation (no production fixture flags).
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

function briefFor(target, title = "Spring Planting QA") {
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

const SUBSTANTIVE_EXTENSIONS = "Invite children to sequence seed-to-sprout picture cards, then teach a partner the plant stages using the classroom garden tray.";
const SUBSTANTIVE_PREPARATION = "Pre-moisten soil cups, place labeled seed trays at child height, and set out magnifiers beside the sprout observation station before children arrive.";
const STILL_SHORT = "Too thin.";

async function main() {
  console.log("Stage 2 too_short repair (extensions & preparation)\n");

  const brief = briefFor(15);
  const blueprint = staged.validateBlueprint(
    JSON.parse(staged.buildStagedFixtureResponse(staged.buildStage1UserPrompt(brief))),
    brief,
  ).blueprint;
  const batch3 = loadValidatedBatch(brief, blueprint, 3);
  const { ids, activities: goodActs } = batch3;

  const withTitles = goodActs.map((a, i) => {
    if (i === 0) return { ...a, title: "Observation Sharing" };
    if (i === 1) return { ...a, title: "Growth Reflection" };
    return a;
  });

  const shortExtAct = { ...withTitles[0], extensions: "More fun." };
  const shortPrepAct = { ...withTitles[1], preparation: "Prep trays." };
  const controlObjective = withTitles[2].objective;

  ok(staged.rejectGeneric("Observation Sharing.extensions", shortExtAct.extensions) !== null,
    "short Observation Sharing.extensions fails validation");
  ok(staged.rejectGeneric("Growth Reflection.preparation", shortPrepAct.preparation) !== null,
    "short Growth Reflection.preparation fails validation");

  const issueExt = `Too short: Observation Sharing.extensions`;
  const issuePrep = `Too short: Growth Reflection.preparation`;
  const planExt = staged.planExpansionRepair([issueExt], [shortExtAct, ...withTitles.slice(1)]);
  ok(planExt.canRepair && planExt.mappedRepairTargets.some((t) => (
    t.title === "Observation Sharing" && t.fields.some((f) => f.field === "extensions" && f.reason === "too_short")
  )), "too_short extensions maps to Observation Sharing");

  const planPrep = staged.planExpansionRepair([issuePrep], [withTitles[0], shortPrepAct, ...withTitles.slice(2)]);
  ok(planPrep.canRepair && planPrep.mappedRepairTargets.some((t) => (
    t.title === "Growth Reflection" && t.fields.some((f) => f.field === "preparation" && f.reason === "too_short")
  )), "too_short preparation maps to Growth Reflection");

  const bothThin = withTitles.map((a, i) => (
    i === 0 ? { ...a, extensions: "More fun." }
      : i === 1 ? { ...a, preparation: "Prep trays." }
        : a
  ));
  const planBoth = staged.planExpansionRepair([issueExt, issuePrep], bothThin);
  ok(planBoth.canRepair && planBoth.mappedRepairTargets.length === 2,
    "both short fields map to two repair targets together");
  ok(staged.expansionQualityIssuesAreOnlyTooShort([issueExt, issuePrep], bothThin),
    "paired too_short issues are only-too-short actionable");
  ok(!staged.expansionQualityIssuesAreOnlyTooShort(
    [`${withTitles[0].title}.thin_vocabulary`, issueExt],
    bothThin,
  ), "thin_vocabulary does not qualify for too_short-only follow-up");

  ok(/EXPAND extensions into a concrete added challenge/i.test(
    staged.fieldRepairQualityInstruction("extensions", "too_short"),
  ), "extensions too_short receives EXPAND contract");
  ok(/EXPAND preparation into concrete teacher prep/i.test(
    staged.fieldRepairQualityInstruction("preparation", "too_short"),
  ), "preparation too_short receives EXPAND contract");

  const repairPayload = {
    activities: bothThin.map((a, i) => (
      i === 0 ? { ...a, extensions: SUBSTANTIVE_EXTENSIONS }
        : i === 1 ? { ...a, preparation: SUBSTANTIVE_PREPARATION }
          : a
    )),
  };
  const mergedOk = staged.coalesceExpansionBatch(
    bothThin,
    repairPayload,
    ids,
    blueprint,
    brief,
    [issueExt, issuePrep],
  );
  ok(mergedOk.ok === true, "targeted repair passes validation for extensions and preparation");
  ok(mergedOk.activities[0].extensions === SUBSTANTIVE_EXTENSIONS,
    "extensions field replaced with substantive repair");
  ok(mergedOk.activities[1].preparation === SUBSTANTIVE_PREPARATION,
    "preparation field replaced with substantive repair");
  ok(mergedOk.activities[2].objective === controlObjective,
    "unrelated valid fields remain unchanged after repair merge");

  const repairStillBad = {
    activities: bothThin.map((a, i) => (
      i === 0 ? { ...a, extensions: STILL_SHORT }
        : i === 1 ? { ...a, preparation: STILL_SHORT }
          : a
    )),
  };
  const mergedFail = staged.coalesceExpansionBatch(
    bothThin,
    repairStillBad,
    ids,
    blueprint,
    brief,
    [issueExt, issuePrep],
  );
  ok(mergedFail.ok === false, "repair that still fails keeps batch invalid");
  ok(mergedFail.issues.some((i) => /Too short: Observation Sharing\.extensions/.test(i)),
    "still-short extensions reported after failed repair");

  let blockedRepairCalls = 0;
  const blocked = await staged.composeStagedLessonContent(brief, {
    forceLive: true,
    callAi: async (_s, user) => {
      if (/CREATE_WEEK_BLUEPRINT/.test(user)) {
        return staged.buildStagedFixtureResponse(user);
      }
      if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
        blockedRepairCalls += 1;
        const parsed = JSON.parse(user.slice(user.indexOf("{")));
        const targets = schema.asArray(parsed.repairTargets);
        const needsExt = targets.some((t) => schema.asArray(t.fields).some((f) => f.field === "extensions"));
        const needsPrep = targets.some((t) => schema.asArray(t.fields).some((f) => f.field === "preparation"));
        return JSON.stringify({
          activities: schema.asArray(parsed.previousBatchActivities).map((a) => {
            if (a.title === "Observation Sharing" && needsExt) {
              return { ...a, extensions: STILL_SHORT };
            }
            if (a.title === "Growth Reflection" && needsPrep) {
              return { ...a, preparation: STILL_SHORT };
            }
            return a;
          }),
        });
      }
      if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
        const parsed = JSON.parse(user.slice(user.indexOf("{")));
        const want = parsed.expandExactlyTheseOutlineIds || [];
        const full = JSON.parse(staged.buildStagedFixtureResponse(user));
        if (want[0] === ids[0]) {
          full.activities = full.activities.map((a, i) => {
            const base = { ...a };
            if (i === 0) return { ...base, title: "Observation Sharing", extensions: "More fun." };
            if (i === 1) return { ...base, title: "Growth Reflection", preparation: "Prep trays." };
            return base;
          });
        }
        return JSON.stringify(full);
      }
      return staged.buildStagedFixtureResponse(user);
    },
  });
  ok(blocked.ok === false && blocked.code === "AI_CREATION_FAILED",
    "lesson persistence blocked when validation remains invalid");
  ok(/batch3|Stage 2/i.test(String(blocked.error || "")), "failure names Stage 2 batch3");
  ok(blockedRepairCalls >= 1, "at least one quality repair attempted before fail-closed");

  let followUpRepair = 0;
  const recovered = await staged.composeStagedLessonContent(brief, {
    forceLive: true,
    callAi: async (_s, user) => {
      if (/CREATE_WEEK_BLUEPRINT/.test(user)) {
        return staged.buildStagedFixtureResponse(user);
      }
      if (/REPAIR_ACTIVITY_BATCH/.test(user)) {
        followUpRepair += 1;
        const parsed = JSON.parse(user.slice(user.indexOf("{")));
        return JSON.stringify({
          activities: schema.asArray(parsed.previousBatchActivities).map((a) => {
            if (a.title === "Observation Sharing") {
              return { ...a, extensions: SUBSTANTIVE_EXTENSIONS };
            }
            if (a.title === "Growth Reflection") {
              return { ...a, preparation: SUBSTANTIVE_PREPARATION };
            }
            return a;
          }),
        });
      }
      if (/EXPAND_ACTIVITY_BATCH/.test(user)) {
        const parsed = JSON.parse(user.slice(user.indexOf("{")));
        const want = parsed.expandExactlyTheseOutlineIds || [];
        const full = JSON.parse(staged.buildStagedFixtureResponse(user));
        if (want[0] === ids[0]) {
          full.activities = full.activities.map((a, i) => {
            const base = { ...a };
            if (i === 0) return { ...base, title: "Observation Sharing", extensions: "More fun." };
            if (i === 1) return { ...base, title: "Growth Reflection", preparation: "Prep trays." };
            return base;
          });
        }
        return JSON.stringify(full);
      }
      return staged.buildStagedFixtureResponse(user);
    },
  });
  ok(recovered.ok === true, "successful targeted repair allows staged lesson assembly");
  ok(followUpRepair >= 1, "repair path invoked for too_short recovery");

  console.log(`\nRESULT: PASS — ${passed} assertions`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
