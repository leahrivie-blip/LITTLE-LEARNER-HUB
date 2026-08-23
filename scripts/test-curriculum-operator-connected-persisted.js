#!/usr/bin/env node
/**
 * Connected upgrade — final persisted lesson record regression.
 * Simulates post-job enrichmentDraft + auto-apply merge (no live server).
 * Run: npm run test:curriculum-operator-connected-persisted
 */
"use strict";

const assert = require("node:assert/strict");
const connected = require("./curriculum-operator-connected-upgrade.js");
const enrichment = require("./teaching-kit-enrichment.js");

const LESSON_ID = "cur-lp-connected-persist";
const ACT_A = "cur-act-connected-a";
const ACT_B = "cur-act-connected-b";
const KEEP_IMG = "https://cdn.example.test/keep-good.png";
const NEW_IMG = "https://cdn.example.test/generated-setup.png";
const KEEP_PRINT = "cur-res-connected-keep";
const WEAK_COVER = "/images/lesson-covers/generic-toddler.svg";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function seedPublishedLesson() {
  const now = new Date().toISOString();
  const publishedAt = "2025-06-01T12:00:00.000Z";
  const plan = {
    id: LESSON_ID,
    title: "Weather Watchers",
    age: "Toddler 18–24 Months",
    theme: "Weather",
    plan: "Pro",
    status: "published",
    publishedAt,
    coverImageUrl: WEAK_COVER,
    weeklyOverview: "Short overview only.",
    objectives: "",
    enrichmentDraft: null,
    resourceIds: [KEEP_PRINT],
    activityIds: [ACT_A, ACT_B],
    dailyPlans: {
      monday: {
        items: [{
          itemId: "a",
          title: "Wind Dance",
          dayOfWeek: "monday",
          objective: "Move like wind.",
          setupImageUrl: KEEP_IMG,
          relatedPrintableId: KEEP_PRINT,
        }],
      },
      tuesday: { items: [{ itemId: "b", title: "Weather Reporter", dayOfWeek: "tuesday" }] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
    updatedAt: now,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
  const activities = [
    {
      id: ACT_A,
      lessonPlanId: LESSON_ID,
      itemId: "a",
      title: "Wind Dance",
      dayOfWeek: "monday",
      objective: "Move like wind.",
      steps: "Sway scarves.",
      setupImageUrl: KEEP_IMG,
      relatedPrintableId: KEEP_PRINT,
    },
    {
      id: ACT_B,
      lessonPlanId: LESSON_ID,
      itemId: "b",
      title: "Weather Reporter",
      dayOfWeek: "tuesday",
      objective: "Use weather words.",
      steps: "Pretend report.",
    },
  ];
  return { plan, activities, publishedAt, now };
}

function simulatePostJobDraft({ now }) {
  return {
    week: {
      weeklyOverview: "Children explore weather through movement, observation, and playful reporting all week.",
      objectives: "Children will use weather words, notice sky changes, and practice turn-taking during weather play.",
      weeklyMaterials: "Weather chart · scarves · clipboards · crayons · weather symbol cards",
      teacherPreparation: "Preview the weather chart and gather scarves before children arrive.",
      familyConnection: "Ask families to notice today's weather together at pickup.",
      songs: [{ title: "Weather Song", linkedWeekday: "monday", rightsStatus: "original" }],
      books: [{
        title: "What Will the Weather Be?",
        author: "Lynda DeWitt",
        whyThisBook: "Supports weather observation vocabulary.",
      }],
      fieldOwnership: {
        objectives: true,
        weeklyOverview: true,
      },
    },
    activities: {
      [ACT_A]: {
        objective: "Children will move like wind and rain using scarves while naming weather words.",
        description: "Children choose scarves, move to music, and name sunny, windy, or rainy motions with teacher support.",
        materials: "Scarves · weather symbol cards · music player",
        setup: "Place scarves in a low basket near the movement area.",
        steps: "1. Invite children to the movement space.\n2. Model a wind motion.\n3. Let children try and name the weather.",
        teacherLanguage: "How does the wind move?\nCan you show me rainy weather?",
        setupImageUrl: KEEP_IMG,
        relatedPrintableId: KEEP_PRINT,
      },
      [ACT_B]: {
        objective: "Children will use weather words while pretending to report the day's sky.",
        description: "Children take turns at the weather reporter table with picture cards and simple scripts.",
        materials: "Weather cards · clipboards · crayons",
        setup: "Set weather cards and clipboards on a child-height table.",
        steps: "1. Invite 2–3 reporters.\n2. Model one weather report.\n3. Let children report and draw.",
        setupImageUrl: NEW_IMG,
      },
    },
    operatorCover: {
      coverImageUrl: NEW_IMG,
      coverImageSource: "generated",
      coverQualityStatus: "good",
      sourceActivityId: ACT_B,
      updatedAt: now,
    },
    updatedAt: now,
    lastEditedBy: "curriculum-operator-connected-test",
  };
}

function main() {
  console.log("Connected upgrade — persisted lesson regression");

  const { plan, activities, publishedAt, now } = seedPublishedLesson();
  const beforeId = plan.id;
  const beforeAge = plan.age;
  const beforePlan = plan.plan;
  const beforeStatus = plan.status;
  const beforeActIds = activities.map((a) => a.id).sort();

  const draft = simulatePostJobDraft({ now });
  const merged = enrichment.mergeDraftIntoPlan(plan, activities, draft);
  let finalPlan = connected.applyOperatorCoverToMergedPlan(merged.plan, draft);

  ok(finalPlan.id === beforeId, "lesson ID unchanged after merge");
  ok(finalPlan.age === beforeAge, "age unchanged after merge");
  ok(finalPlan.plan === beforePlan, "Free/Pro unchanged after merge");
  ok(finalPlan.status === beforeStatus, "status not auto-published");
  ok(finalPlan.publishedAt === publishedAt, "publishedAt not mutated by merge simulation");

  const finalActs = merged.activities;
  ok(finalActs.map((a) => a.id).sort().join() === beforeActIds.join(), "activity IDs unchanged");
  ok(finalActs.find((a) => a.id === ACT_A)?.setupImageUrl === KEEP_IMG, "good existing image preserved on ACT_A");
  ok(finalActs.find((a) => a.id === ACT_B)?.setupImageUrl === NEW_IMG, "generated image attached to ACT_B");
  ok(String(finalPlan.weeklyOverview || "").includes("weather"), "weekly overview upgraded on final plan");
  ok(String(finalPlan.objectives || "").includes("weather"), "objectives upgraded on final plan");
  ok(finalPlan.coverImageUrl === NEW_IMG, "cover replaced with activity image URL");
  ok(finalPlan.coverQualityStatus === "good", "cover quality marked good");

  ok(!connected.isUsableActivityImageUrl("https://cdn.example.test/file.pdf"), "PDF rejected as cover candidate");
  ok(connected.isUsableActivityImageUrl(NEW_IMG), "realistic image URL accepted");

  const dupCurriculum = {
    lessonPlans: [plan],
    activities: [
      ...activities,
      { id: "cur-act-dup", lessonPlanId: LESSON_ID, itemId: "c", title: "Wind Dance", dayOfWeek: "wednesday" },
    ],
  };
  const dupBundle = connected.buildConnectedUpgradePlan(dupCurriculum, LESSON_ID);
  ok(dupBundle.structuralReview?.flags?.some((f) => f.code === "duplicate_activity_title"),
    "duplicate activity titles flagged for Owner review");

  console.log(`\nPersisted regression passed ${passed} assertions`);
}

main();
