#!/usr/bin/env node
/**
 * Operator new-lesson architect quality contract tests (validation + staged compose entry).
 * Deterministic fixtures only — no live OpenAI.
 * Run: npm run test:curriculum-operator-create-architect
 */
"use strict";

const assert = require("node:assert/strict");
const createApi = require("./curriculum-operator-create.js");
const architect = require("./curriculum-operator-create-architect.js");
const schema = require("./curriculum-operator-schema.js");

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function briefFor(target, title = "Operator QA Bakery Creation Test") {
  const parsed = createApi.parseCreationBrief(
    `Create a Preschool bakery lesson with ${target} activities and leave it ready for review. Do not publish.`,
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

function weekdayCoverage(content) {
  return ["monday", "tuesday", "wednesday", "thursday", "friday"].filter(
    (day) => schema.asArray(content?.dailyPlans?.[day]?.items).length > 0,
  );
}

async function main() {
  console.log("Curriculum Operator create-architect activity contract");

  const brief15 = briefFor(15);
  const userPrompt = architect.buildArchitectUserPrompt(brief15);
  ok(/"requiredActivityCount": 15/.test(userPrompt), "exact activityTarget passed into architect as requiredActivityCount");
  ok(/"requiredWeekdays"/.test(userPrompt), "requiredWeekdays present in architect input");
  ok(/"requiredWeekdayDistribution"/.test(userPrompt), "requiredWeekdayDistribution present");
  ok(/contentDepthRequirements/.test(userPrompt), "content depth requirements present");

  const dist15 = architect.expectedWeekdayDistribution(15);
  ok(Object.values(dist15).every((n) => n === 3), "15 activities → 3 per weekday guidance");

  // Staged fixture path via composeNewLessonContent entry
  const good15 = await architect.composeNewLessonContent(brief15, { forceFixture: true });
  ok(good15.ok === true, "fixture create succeeds for 15");
  ok(activityCountFromContent(good15.content) === 15, "requested 15 → exactly 15 activities");
  ok(weekdayCoverage(good15.content).length === 5, "15 distributed across all 5 weekdays");
  ok(good15.source === "fixture_ai", "fixture source (no live AI)");
  ok(good15.staged === true, "compose delegates to staged composer");
  ok(good15.usage.activityExpansionCalls === 3, "staged compose uses 3 expansion batches for 15");

  const brief10 = briefFor(10);
  const good10 = await architect.composeNewLessonContent(brief10, { forceFixture: true });
  ok(good10.ok === true && activityCountFromContent(good10.content) === 10, "requested 10 → exactly 10");

  // Strong content accepted via validate (full-lesson validator still authoritative)
  const strongRaw = architect.buildOperatorCreateArchitectFixtureResponse(userPrompt);
  const strongValidated = architect.validateArchitectOutput(strongRaw, brief15);
  ok(strongValidated.ok === true, "strong activity content accepted");
  ok(strongValidated.requiredActivityCount === 15, "validator records requiredActivityCount 15");
  ok(strongValidated.parsedActivityCount === 15, "validator records parsedActivityCount 15");

  // Count cannot silently shrink
  const parsedStrong = JSON.parse(strongRaw);
  const shrunk = {
    ...parsedStrong,
    activities: parsedStrong.activities.slice(0, 5),
  };
  const shrunkValidated = architect.validateArchitectOutput(JSON.stringify(shrunk), brief15);
  ok(shrunkValidated.ok === false, "requested activity count cannot silently shrink");
  ok(shrunkValidated.issues.some((i) => /activity_count_mismatch:5!=15/.test(i)),
    "activity_count_mismatch:5!=15 still enforced");
  ok(shrunkValidated.issues.some((i) => /weekday_coverage_incomplete|possible_output_truncation/.test(i)),
    "under-count flags coverage/truncation diagnostics");

  // Too-short fields trigger quality failure
  const shortActs = parsedStrong.activities.map((a, idx) => ({
    ...a,
    objective: idx < 3 ? "Short." : a.objective,
    description: idx < 3 ? "Tiny." : a.description,
    steps: idx < 3 ? "Do it." : a.steps,
  }));
  const shortRaw = JSON.stringify({ ...parsedStrong, activities: shortActs });
  const shortValidated = architect.validateArchitectOutput(shortRaw, brief15);
  ok(shortValidated.ok === false, "too-short required fields fail quality gate");
  ok(shortValidated.issues.some((i) => /Too short/i.test(i)), "too-short required fields trigger quality issues");

  // Truncation detection
  const trunc = architect.detectOutputTruncation(`${"{".repeat(20)} unfinished`, 5, 15);
  ok(trunc.truncatedLikely === true, "parser/truncation detection flags unterminated JSON");
  const truncCount = architect.detectOutputTruncation(`${"x".repeat(9000)}{"activities":[]}`, 5, 15);
  ok(truncCount.reasons.includes("activity_count_far_below_target_with_large_payload")
    || truncCount.truncatedLikely === true,
  "large under-count payload flagged as possible truncation");

  // Duplicate concepts rejected
  const dup = JSON.parse(strongRaw);
  dup.activities[1] = { ...dup.activities[0], title: dup.activities[0].title };
  const dupValidated = architect.validateArchitectOutput(JSON.stringify(dup), brief15);
  ok(dupValidated.ok === false, "duplicate activity concepts rejected");

  // No deterministic production fallback
  const noAi = await architect.composeNewLessonContent(brief15, { forceLive: true, callAi: undefined });
  ok(noAi.ok === false && noAi.code === "AI_CREATION_FAILED", "no deterministic production fallback");

  // Publish still not in create content
  ok(good15.content.lesson.status === "draft", "created content remains draft");
  ok(!schema.isPhase2Executable("lesson.publish"), "publish remains blocked");

  console.log("\n--- staged compose debug report (fixture) ---");
  console.log("architectureCalls:", good15.usage.lessonArchitectureCalls);
  console.log("expansionCalls:", good15.usage.activityExpansionCalls);
  console.log("repairCalls:", good15.usage.activityRepairCalls);
  console.log("activitiesCompleted:", good15.usage.activitiesCompleted);

  console.log(`\n${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
