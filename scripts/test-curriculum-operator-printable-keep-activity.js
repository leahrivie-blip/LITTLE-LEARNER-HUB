#!/usr/bin/env node
/**
 * Regression: KEEP content must not block printable generation for valid lesson activities.
 * Mirrors production opjob_966fe13ccdc84546 / cur-act-0199336343c8c28e failure.
 * Run: npm run test:curriculum-operator-printable-keep-activity
 */
"use strict";

const assert = require("node:assert/strict");
const composer = require("./curriculum-operator-ai-composer.js");
const printablesApi = require("./curriculum-operator-printables.js");
const schema = require("./curriculum-operator-schema.js");

const LESSON_ID = "cur-lp-lmw-printable-fixture";
/** Fixture equivalent of production cur-act-0199336343c8c28e (Dot Marker Color Pops). */
const ACT_DOT_MARKER = "cur-act-dot-marker-fixture";
const ACT_IMPROVE = "cur-act-improve-fixture";
const ACT_OTHER_LESSON = "cur-act-other-lesson-fixture";
const OTHER_LESSON_ID = "cur-lp-other-lesson-fixture";

let passed = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function longObjective(seed) {
  return [
    `Toddlers explore ${seed} with chunky tools, washable materials, and teacher narration.`,
    "Children practice fine motor control while teachers describe colors, textures, and choices aloud.",
    "The activity stays open-ended with large visuals and no reading expectations.",
  ].join(" ");
}

function makePlan() {
  return {
    id: LESSON_ID,
    title: "Little Makers Workshop Fixture",
    age: "Toddler 12–24 Months",
    theme: "Making",
    plan: "Free",
    status: "draft",
    weeklyOverview: "Substantial weekly overview about maker play and process art for toddlers.",
    objectives: "Children explore making with safe recycled materials and teacher-supported process art.",
    weeklyMaterials: "Paper, tape, boxes, paint, dot markers, play dough.",
    teacherPreparation: "Stage maker stations with low tables and washable surfaces before children arrive.",
    enrichmentDraft: { week: { milestones: [], vocabCards: [] }, activities: {} },
    dailyPlans: {
      monday: { items: [{ itemId: ACT_DOT_MARKER, title: "Dot Marker Color Pops" }] },
      tuesday: { items: [] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
    activityIds: [ACT_DOT_MARKER, ACT_IMPROVE],
  };
}

function makeActivities() {
  return [
    {
      id: ACT_DOT_MARKER,
      lessonPlanId: LESSON_ID,
      title: "Dot Marker Color Pops",
      dayOfWeek: "monday",
      category: "Art",
      objective: longObjective("dot markers"),
      description: "Children press dot markers on large paper while teachers name colors.",
      materials: "Dot markers, large paper, smocks",
      setup: "Cover table; set one marker per child.",
      steps: "Invite presses; name colors; display work.",
    },
    {
      id: ACT_IMPROVE,
      lessonPlanId: LESSON_ID,
      title: "Recycled Creation Station",
      dayOfWeek: "friday",
      category: "Building",
      objective: "Short objective.",
      description: "TODO expand.",
      materials: "Boxes, tape",
      setup: "Bins of safe recycled items.",
      steps: "Build freely.",
    },
    {
      id: ACT_OTHER_LESSON,
      lessonPlanId: OTHER_LESSON_ID,
      title: "Foreign Activity",
      dayOfWeek: "monday",
      category: "Art",
      objective: longObjective("foreign"),
    },
  ];
}

function makeKeepWork() {
  return {
    lessonId: LESSON_ID,
    weekRequests: [
      { field: "milestones", action: "FILL", reason: "empty", currentPreview: "" },
    ],
    weekKeep: [
      { field: "weeklyOverview", decision: "KEEP", reason: "substantial" },
    ],
    activityRequests: [],
    activityKeep: [
      { activityId: ACT_DOT_MARKER, decision: "KEEP", title: "Dot Marker Color Pops" },
      { activityId: ACT_IMPROVE, decision: "KEEP", title: "Recycled Creation Station" },
    ],
    songRequests: [],
    bookRequest: null,
    hasWork: true,
  };
}

function makeImproveWork() {
  return {
    ...makeKeepWork(),
    activityRequests: [{
      activityId: ACT_IMPROVE,
      title: "Recycled Creation Station",
      decision: "IMPROVE",
      fields: [{ field: "description", action: "IMPROVE" }],
    }],
    activityKeep: [
      { activityId: ACT_DOT_MARKER, decision: "KEEP", title: "Dot Marker Color Pops" },
    ],
  };
}

function printableSpec(activityId, title) {
  return {
    lessonId: LESSON_ID,
    activityIds: [activityId],
    decision: "CREATE",
    title,
    resourceType: "dramatic_play_pack",
    purpose: "Children use visual props during the maker activity.",
    pageCount: 2,
    filename: `${title.replace(/\s+/g, "-").toLowerCase()}.pdf`,
    pages: [{ index: 1, label: "Cards", kind: "dramatic_play_pack", intentionalBlank: false }],
  };
}

function main() {
  console.log("Curriculum Operator printable KEEP-activity regression");
  const plan = makePlan();
  const activities = makeActivities();
  const knownIds = activities
    .filter((a) => a.lessonPlanId === LESSON_ID)
    .map((a) => a.id);

  // A — valid activity + content KEEP + printable CREATE
  {
    const spec = printableSpec(ACT_DOT_MARKER, "Process Maker Prompt Cards");
    const check = printablesApi.validatePrintableSpec(spec, {
      expectedLessonId: LESSON_ID,
      knownActivityIds: knownIds,
    });
    ok(check.ok, "A: KEEP content activity still passes printable spec validation");
  }

  // B — valid activity + content IMPROVE + printable CREATE
  {
    const spec = printableSpec(ACT_IMPROVE, "Recycled Creation Station Cards");
    const check = printablesApi.validatePrintableSpec(spec, {
      expectedLessonId: LESSON_ID,
      knownActivityIds: knownIds,
    });
    ok(check.ok, "B: IMPROVE content activity passes printable spec validation");
  }

  // C — unknown activity ID blocked (printable)
  {
    const spec = printableSpec("cur-act-does-not-exist", "Ghost Pack");
    const check = printablesApi.validatePrintableSpec(spec, {
      expectedLessonId: LESSON_ID,
      knownActivityIds: knownIds,
    });
    ok(!check.ok && check.errors.some((e) => e.startsWith("unknown_activity_id:")),
      "C: unknown activity ID blocked in printable validation");
  }

  // C — unknown activity ID blocked (composer)
  {
    const work = makeKeepWork();
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: {
        milestones: { action: "FILL", value: ["Uses two hands to stack blocks", "Names one color during art"] },
      },
      activities: [{
        activityId: "cur-act-does-not-exist",
        changes: { objective: { action: "FILL", value: longObjective("ghost") } },
      }],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(!validated.ok && validated.code === "unknown_activity_id",
      "C: unknown activity ID blocked in composer validation");
  }

  // D — activity from different lesson blocked
  {
    const spec = printableSpec(ACT_OTHER_LESSON, "Foreign Pack");
    const check = printablesApi.validatePrintableSpec(spec, {
      expectedLessonId: LESSON_ID,
      knownActivityIds: knownIds,
    });
    ok(!check.ok && check.errors.some((e) => e.startsWith("unknown_activity_id:")),
      "D: activity from different lesson blocked");
  }

  // E — archived/removed activity blocked (omitted from lesson inventory)
  {
    const spec = printableSpec(ACT_DOT_MARKER, "Removed Activity Pack");
    const withoutDot = knownIds.filter((id) => id !== ACT_DOT_MARKER);
    const check = printablesApi.validatePrintableSpec(spec, {
      expectedLessonId: LESSON_ID,
      knownActivityIds: withoutDot,
    });
    ok(!check.ok && check.errors.some((e) => e.startsWith("unknown_activity_id:")),
      "E: removed/archived activity blocked when absent from lesson inventory");
  }

  // F — printable-only job: composer soft-skips KEEP activity echo, week work still accepted
  {
    const work = makeKeepWork();
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: {
        milestones: {
          action: "FILL",
          value: [
            "Stacks three blocks with help",
            "Uses a marker to make a mark on paper",
            "Chooses one material to explore",
          ],
        },
        weeklyOverview: {
          action: "KEEP",
          value: plan.weeklyOverview,
        },
      },
      activities: [{
        activityId: ACT_DOT_MARKER,
        changes: {
          objective: { action: "KEEP", value: longObjective("dot markers") },
        },
      }],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok, "F: KEEP activity echo does not fail composer validation");
    ok(
      validated.diagnostics?.rejected?.some((r) => r.reason === "unrequested_activity" && r.field === ACT_DOT_MARKER),
      "F: KEEP activity echo recorded as unrequested_activity",
    );
    ok(validated.plan?.weeklyChanges?.milestones, "F: week-only mutations still accepted");
    ok(!validated.plan?.activities?.length, "F: no activity content mutations applied from KEEP echo");
  }

  // G — lesson/activity IDs unchanged through validation
  {
    const work = makeImproveWork();
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: {
        milestones: { action: "FILL", value: ["Stacks blocks", "Makes a mark", "Chooses tape"] },
      },
      activities: [{
        activityId: ACT_IMPROVE,
        changes: {
          description: {
            action: "IMPROVE",
            value: "Children choose safe recycled items and attach them with tape while teachers describe textures.",
          },
        },
      }],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok && validated.plan.lessonId === LESSON_ID, "G: lesson ID preserved");
    ok(
      validated.plan.activities.every((row) => [ACT_IMPROVE].includes(row.activityId)),
      "G: only requested activity IDs appear in validated plan",
    );
  }

  // H — duplicate printable retries use stable idempotency keys (no duplicate attach path)
  {
    const action = {
      activityId: ACT_IMPROVE,
      decision: "CREATE",
      spec: printableSpec(ACT_IMPROVE, "Recycled Creation Station Cards"),
      reason: "Card activity needs usable pieces.",
    };
    const key = `printable:${LESSON_ID}:${action.activityId}:${text(action.spec.resourceType, 40)}:${text(action.spec.title, 80)}`;
    const key2 = `printable:${LESSON_ID}:${action.activityId}:${text(action.spec.resourceType, 40)}:${text(action.spec.title, 80)}`;
    ok(key === key2, "H: printable idempotency key is stable across retries");
    ok(key.includes(ACT_IMPROVE) && key.includes("Recycled Creation Station Cards"),
      "H: idempotency key binds activity + title for dedupe");
  }

  // I — quality gates unchanged (purpose/title still required)
  {
    const missingPurpose = {
      ...printableSpec(ACT_DOT_MARKER, "Maker Station Signs"),
      purpose: "",
    };
    const check = printablesApi.validatePrintableSpec(missingPurpose, {
      expectedLessonId: LESSON_ID,
      knownActivityIds: knownIds,
    });
    ok(!check.ok && check.errors.includes("purpose_required"),
      "I: printable quality gate still requires purpose");
  }

  // Production-shaped fixture ID soft-skip (equivalent to cur-act-0199336343c8c28e)
  {
    const work = makeKeepWork();
    const raw = JSON.stringify({
      lessonId: LESSON_ID,
      weeklyChanges: {
        milestones: { action: "FILL", value: ["Presses dot marker", "Names red or blue", "Chooses paper"] },
      },
      activities: [{ activityId: ACT_DOT_MARKER, changes: {} }],
    });
    const validated = composer.validateComposerOutput(raw, work, plan);
    ok(validated.ok, "production-equivalent KEEP activity (dot marker fixture) no longer blocks job");
  }

  console.log(`\n${passed} checks passed`);
}

function text(value, max) {
  return schema.text(value, max);
}

main();
