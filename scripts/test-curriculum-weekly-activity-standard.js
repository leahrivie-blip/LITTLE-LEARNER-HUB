#!/usr/bin/env node
/**
 * Weekly curriculum standard: 10 activities = complete week;
 * proportional visual coverage; images never hard-block Ready to Publish alone.
 *
 * Run: NODE_ENV=test node scripts/test-curriculum-weekly-activity-standard.js
 */
const assert = require("node:assert/strict");
const enrich = require("./teaching-kit-enrichment.js");
const quality = require("./teaching-kit-quality-review.js");
const status = require("./teaching-kit-status.js");

function dayItems(day, count, { withImages = false, imageRequirement = "not_needed" } = {}) {
  const items = [];
  for (let i = 1; i <= count; i += 1) {
    const id = `${day}-${i}`;
    items.push({
      itemId: id,
      id,
      title: `${day} Activity ${i}`,
      dayOfWeek: day,
      activityCategory: i % 2 === 0 ? "Music and Movement" : "Sensory",
      objective: "Practice theme play",
      description: "Children explore the theme with hands-on materials.",
      materials: "trays, baskets, theme props",
      preparation: "Stage trays low.",
      setup: "Set materials on a low table.",
      steps: "1. Invite children.\n2. Model one action.\n3. Let children try.\n4. Clean up together.",
      teacherLanguage: "What do you notice?",
      observationOpportunities: "Does the child try a new action?",
      safetyNotes: "Stay nearby.",
      cleanupTips: "Wipe trays.",
      ageModifications: "Preschool",
      durationMinutes: 15,
      imageRequirement,
      setupImageUrl: withImages ? `/media/${id}-setup.png` : "",
      exampleImageUrl: withImages ? `/media/${id}-example.png` : "",
      teacherTips: ["Offer two choices."],
    });
  }
  return items;
}

function buildWeekPlan({
  id = "qa-week-standard",
  perDay = 2,
  imageDays = [],
  imageRequirement = "not_needed",
  resources = null,
} = {}) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const dailyPlans = {};
  const activities = [];
  const draftActs = {};
  days.forEach((day) => {
    const withImages = imageDays.includes(day);
    const items = dayItems(day, perDay, { withImages, imageRequirement });
    dailyPlans[day] = {
      theme: `${day} theme focus`,
      focus: `${day} focus`,
      items,
    };
    items.forEach((item) => {
      activities.push({ ...item, lessonPlanId: id, status: "draft" });
      draftActs[item.id] = {
        teacherTips: item.teacherTips,
        observationPrompts: ["Tries a new action?"],
        imageRequirement: item.imageRequirement,
        setupImageUrl: item.setupImageUrl,
        exampleImageUrl: item.exampleImageUrl,
        setup: item.setup,
        steps: item.steps,
        adaptations: "Offer a simpler tray.",
        extensions: "Invite a peer.",
      };
    });
  });
  const resourceId = "cur-res-qa-printable-published";
  const plan = {
    id,
    title: "QA Weekly Standard Fixture",
    theme: "Shells",
    age: "Preschool",
    status: "draft",
    weeklyOverview: "Children explore shells through play across a complete five-day week with strong core activities.",
    objectives: "Name textures, sort by size, and use one shell word in play.",
    vocabularyWords: "shell, smooth, rough, sort, texture",
    weeklyMaterials: "shells, tongs, trays, baskets, magnifiers, paper, crayons, scarves, baskets, cups",
    familyConnection: "Ask your child to find one shell word at home and tell you what it means.",
    books: [{
      title: "Shell Book",
      author: "A. Author",
      whyThisBook: "Shows real shell textures.",
      beforeReadingQuestions: ["What do you notice?"],
      afterReadingQuestions: ["Which shell felt smooth?"],
    }],
    songs: [{
      title: "Shell Song",
      rightsStatus: "original",
      motions: "Clap and sway",
      teacherDirections: "Sing slowly and model motions.",
    }],
    resourceIds: [resourceId],
    dailyPlans,
    enrichmentDraft: {
      activities: draftActs,
      week: {
        weeklyOverview: "Children explore shells through play across a complete five-day week with strong core activities.",
        objectives: "Name textures, sort by size, and use one shell word in play.",
        weeklyMaterials: "shells, tongs, trays, baskets, magnifiers, paper, crayons, scarves, baskets, cups",
        familyConnection: "Ask your child to find one shell word at home and tell you what it means.",
        books: [{
          title: "Shell Book",
          author: "A. Author",
          whyThisBook: "Shows real shell textures.",
          beforeReadingQuestions: ["What do you notice?"],
          afterReadingQuestions: ["Which shell felt smooth?"],
        }],
        songs: [{
          title: "Shell Song",
          rightsStatus: "original",
          motions: "Clap and sway",
          teacherDirections: "Sing slowly and model motions.",
        }],
        teacherToolkit: {
          teacherPreparation: "Stage trays and print cards before children arrive.",
          mixedAgeAdaptations: "Offer larger shells for younger friends.",
          extraSupportAdaptations: "Model one sort with hand-over-hand support.",
          challengeExtensions: "Invite children to invent a shell game.",
          safetyInclusionNotes: "Watch for mouthing of small shells.",
          endOfWeekReflection: "Which shell words did children reuse?",
          familyConnection: "Ask about one shell word at home.",
          teacherTips: ["Keep trays low"],
          setupCleanupShortcuts: ["Pre-sort shells"],
          observationFocus: ["Shell words"],
          documentationPrompts: ["Photo of sorted tray"],
          materialSubstitutions: [{ need: "tongs", use: "spoons" }],
        },
      },
    },
  };
  const catalog = resources || [{
    id: resourceId,
    status: "published",
    resourceCategory: "Printable",
    title: "Shell Cards",
  }];
  return { plan, activities, resources: catalog };
}

// 1) Exactly 10 complete activities → max activity-count score
{
  const vol = enrich.scoreActivityVolume(10);
  assert.equal(vol.score, 100, "10 activities earn max volume score");
  assert.equal(vol.requirementMet, true, "10 activities satisfy weekly requirement");
  const { plan, activities, resources } = buildWeekPlan({ perDay: 2 });
  assert.equal(activities.length, 10);
  const scores = enrich.computeReadinessScores(plan, activities, plan.enrichmentDraft, { resources });
  assert.equal(scores.activityVolume.score, 100);
  assert.equal(scores.activityVolumeScore, 100);
}

// 2) 10-activity lesson is not Needs Changes merely for count < 15/16/20
{
  const { plan, activities, resources } = buildWeekPlan({
    perDay: 2,
    imageDays: ["monday", "wednesday", "friday"],
  });
  const report = quality.buildQualityReport(plan, activities, plan.enrichmentDraft, { resources });
  const volumeFinding = (report.findings || []).find((f) => (
    f.code === "thin_activity_week" || f.code === "developing_activity_week"
  ));
  assert.equal(volumeFinding, undefined, "10 activities do not get thin/developing volume findings");
  assert.notEqual(report.publishReadiness, "blocked", "10-activity week is not blocked for count alone");
  const summary = enrich.buildUpgradeSummary(plan, activities, plan.enrichmentDraft, { resources });
  assert.equal(summary.activityVolume.requirementMet, true);
  assert.ok(!/Needs Changes/i.test(String(summary.dashboardStage || "")), "not Needs Changes for volume");
}

// 3) 12 vs 20 — no meaningful readiness disadvantage from volume alone
{
  const twelve = enrich.scoreActivityVolume(12);
  const twenty = enrich.scoreActivityVolume(20);
  assert.equal(twelve.score, twenty.score, "12 and 20 share max volume score");
  assert.equal(twelve.score, 100);
  const a = buildWeekPlan({ id: "qa-12", perDay: 2, imageDays: ["monday", "wednesday"] });
  // 12 activities: Mon–Thu 2, Fri 4
  a.plan.dailyPlans.friday.items.push(...dayItems("friday", 2, { imageRequirement: "not_needed" }));
  a.plan.dailyPlans.friday.items.slice(-2).forEach((item) => {
    a.activities.push({ ...item, lessonPlanId: "qa-12", status: "draft" });
    a.plan.enrichmentDraft.activities[item.id] = {
      teacherTips: ["Tip"],
      observationPrompts: ["Observe?"],
      imageRequirement: "not_needed",
      setup: item.setup,
      steps: item.steps,
    };
  });
  assert.equal(a.activities.length, 12);
  const b = buildWeekPlan({ id: "qa-20", perDay: 4, imageDays: ["monday", "wednesday"] });
  assert.equal(b.activities.length, 20);
  const score12 = enrich.computeReadinessScores(a.plan, a.activities, a.plan.enrichmentDraft, { resources: a.resources });
  const score20 = enrich.computeReadinessScores(b.plan, b.activities, b.plan.enrichmentDraft, { resources: b.resources });
  assert.equal(score12.activityVolumeScore, score20.activityVolumeScore);
  assert.ok(
    Math.abs(score12.premiumReadinessPercent - score20.premiumReadinessPercent) <= 5,
    `12 vs 20 premium volume gap should be tiny (got ${score12.premiumReadinessPercent} vs ${score20.premiumReadinessPercent})`,
  );
}

// 4) Ready to Publish possible when several simple activities have no image
{
  const { plan, activities, resources } = buildWeekPlan({
    perDay: 2,
    imageDays: ["monday", "wednesday"], // 4/10 = 40% coverage
    imageRequirement: "not_needed",
  });
  const visual = enrich.measureVisualCoverage(plan, activities, plan.enrichmentDraft);
  assert.ok(visual.percent >= 40, `expected ~40%+ coverage, got ${visual.percent}`);
  assert.equal(visual.excellent, true);
  const report = quality.buildQualityReport(plan, activities, plan.enrichmentDraft, { resources });
  assert.equal(
    (report.findings || []).some((f) => f.code === "missing_example_images" && f.blocking),
    false,
    "missing images must not be blocking",
  );
  assert.notEqual(report.publishReadiness, "blocked", "partial images must not block solely");
}

// 5) Missing one activity image does not directly reduce readiness
{
  const withAll = buildWeekPlan({
    perDay: 2,
    imageDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  });
  const missingOne = buildWeekPlan({
    id: "qa-miss-one",
    perDay: 2,
    imageDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  });
  // Clear one image from friday-1
  const target = missingOne.activities.find((a) => a.id === "friday-1");
  target.setupImageUrl = "";
  target.exampleImageUrl = "";
  missingOne.plan.enrichmentDraft.activities["friday-1"].setupImageUrl = "";
  missingOne.plan.enrichmentDraft.activities["friday-1"].exampleImageUrl = "";
  const sAll = enrich.computeReadinessScores(
    withAll.plan, withAll.activities, withAll.plan.enrichmentDraft, { resources: withAll.resources },
  );
  const sMiss = enrich.computeReadinessScores(
    missingOne.plan, missingOne.activities, missingOne.plan.enrichmentDraft, { resources: missingOne.resources },
  );
  assert.equal(sAll.imageReadiness, 100);
  assert.equal(sMiss.imageReadiness, 100, "still excellent coverage after one missing image");
  assert.equal(sAll.premiumReadinessPercent, sMiss.premiumReadinessPercent);
}

// 6) Zero visual coverage → recommendation, not structural incompleteness
{
  const { plan, activities, resources } = buildWeekPlan({ perDay: 2, imageDays: [] });
  const visual = enrich.measureVisualCoverage(plan, activities, plan.enrichmentDraft);
  assert.equal(visual.percent, 0);
  assert.ok(visual.recommendation, "zero coverage yields recommendation");
  const report = quality.buildQualityReport(plan, activities, plan.enrichmentDraft, { resources });
  const imageFinding = (report.findings || []).find((f) => f.code === "missing_example_images");
  assert.ok(imageFinding, "visual recommendation present");
  assert.equal(imageFinding.blocking, false, "zero images is not a publish hard blocker");
  const scores = enrich.computeReadinessScores(plan, activities, plan.enrichmentDraft, { resources });
  assert.ok(scores.structuralCompletionPercent > 0, "structurally not empty");
  assert.ok(scores.activityVolume.requirementMet, "10 activities still meet volume");
}

// 7) Five weekdays × 2 activities satisfies weekday coverage
{
  const { plan, activities } = buildWeekPlan({ perDay: 2 });
  const coverage = status.measureWeekdayCoverage(plan, activities);
  assert.equal(coverage.filled, 5);
  assert.equal(coverage.coverageComplete, true);
  assert.match(coverage.label, /5 of 5 weekdays/);
}

// 8–9) Existing high-count lessons and resources remain untouched (scoring only)
{
  const beforeActs = buildWeekPlan({ id: "qa-legacy-20", perDay: 4 }).activities.map((a) => ({ ...a }));
  const beforeLen = beforeActs.length;
  assert.ok(beforeLen >= 15 && beforeLen <= 25);
  const scored = enrich.scoreActivityVolume(beforeLen);
  assert.equal(scored.score, 100);
  assert.equal(beforeActs.length, beforeLen, "scoring must not mutate activity arrays");
  const { plan, resources } = buildWeekPlan({ id: "qa-resources" });
  const resourceId = resources[0].id;
  enrich.computeReadinessScores(plan, [], plan.enrichmentDraft, { resources });
  assert.equal(resources[0].id, resourceId, "resources untouched");
  assert.equal(plan.resourceIds[0], resourceId, "linked printable ids untouched");
}

// 10) Free/Pro / identity fields unchanged by scoring helpers
{
  const { plan, activities } = buildWeekPlan({ id: "cur-lp-access-check" });
  plan.plan = "Free";
  const actIds = activities.map((a) => a.id);
  enrich.computeReadinessScores(plan, activities, plan.enrichmentDraft, { resources: [] });
  quality.buildQualityReport(plan, activities, plan.enrichmentDraft, { resources: [] });
  assert.equal(plan.id, "cur-lp-access-check");
  assert.equal(plan.plan, "Free");
  assert.deepEqual(activities.map((a) => a.id), actIds);
  assert.equal(plan.status, "draft");
}

// Volume bands
{
  assert.ok(enrich.scoreActivityVolume(3).score < 40);
  assert.ok(enrich.scoreActivityVolume(6).score >= 40 && enrich.scoreActivityVolume(6).score < 75);
  assert.ok(enrich.scoreActivityVolume(9).score >= 75 && enrich.scoreActivityVolume(9).score < 100);
  assert.equal(enrich.scoreActivityVolume(10).score, 100);
  assert.equal(enrich.scoreActivityVolume(11).score, 100);
  assert.equal(enrich.scoreActivityVolume(25).score, 100);
}

console.log("PASS curriculum-weekly-activity-standard");
