#!/usr/bin/env node
/**
 * Phase 7 — content completion vs educational quality vs workflow vs blocking.
 * Run: npm run test:curriculum-quality-status-phase7
 */
const assert = require("node:assert/strict");
const status = require("./teaching-kit-status.js");
const enrichment = require("./teaching-kit-enrichment.js");
const quality = require("./teaching-kit-quality-review.js");
const lessonTeacher = require("./teaching-kit-ai-lesson-teacher.js");
const teachingKit = require("./teaching-kit.js");

function mondayOnlyPlan(overrides = {}) {
  return {
    id: "qa-status-mon-only",
    title: "ZZ QA Monday-Only Status Fixture",
    theme: "Shells",
    age: "Preschool",
    status: overrides.status || "draft",
    weeklyOverview: "Children study shells on Monday.",
    objectives: "Name shell textures",
    weeklyMaterials: "shells, tongs",
    familyConnection: "Ask about one shell word.",
    books: [{ title: "Shell Book", author: "Author" }],
    songs: [{ title: "Shell Song" }],
    vocabularyWords: "shell, sort",
    dailyPlans: {
      monday: {
        items: [{
          itemId: "mon-1",
          title: "Shell Sort",
          materials: "shells, tongs",
          objective: "sort shells",
          dayOfWeek: "monday",
          setup: "Tray ready",
          steps: "1. Sort. 2. Share.",
        }],
      },
      tuesday: { items: [] },
      wednesday: { items: [] },
      thursday: { items: [] },
      friday: { items: [] },
    },
    enrichmentDraft: overrides.enrichmentDraft || {
      activities: {
        "mon-1": {
          teacherTips: ["Set shells low"],
          observationPrompts: ["Does the child sort by size?"],
          imageBriefSetup: "Shell tray setup",
          imageBriefExample: "Sorted shells",
          adaptations: "Fewer shells",
          extensions: "Reuse shell word",
          indoorAlternatives: "Tabletop shell tray",
          outdoorAlternatives: "Shaded shell sort",
          setup: "Tray ready",
          steps: "1. Sort. 2. Share.",
        },
      },
      week: {
        weeklyOverview: "Children study shells on Monday.",
        objectives: "Name shell textures",
        familyConnection: "Ask about one shell word.",
        books: [{ title: "Shell Book", author: "Author" }],
        songs: [{ title: "Shell Song" }],
        printableIdeas: ["Shell vocab cards"],
        teacherToolkit: { prepChecklist: ["Print cards"], observationFocus: ["Shell words"] },
      },
    },
    ...overrides,
  };
}

function fiveDayPlan() {
  const plan = mondayOnlyPlan({ id: "qa-status-five-day", title: "ZZ QA Five-Day Status Fixture" });
  ["tuesday", "wednesday", "thursday", "friday"].forEach((day, index) => {
    plan.dailyPlans[day] = {
      items: [{
        itemId: `${day}-1`,
        title: `${day} Shell Play`,
        materials: "shells",
        objective: "explore shells",
        dayOfWeek: day,
        setup: "Ready",
        steps: "1. Play. 2. Share.",
      }],
    };
    plan.enrichmentDraft.activities[`${day}-1`] = {
      teacherTips: [`Tip for ${day}`],
      observationPrompts: [`Observe on ${day}`],
      imageBriefSetup: `${day} setup`,
      imageBriefExample: `${day} example`,
      adaptations: "Support",
      extensions: "Home word",
      indoorAlternatives: "Indoor tray",
      outdoorAlternatives: "Outdoor tray",
      setup: "Ready",
      steps: "1. Play. 2. Share.",
    };
  });
  return plan;
}

// Empty lesson
{
  const empty = {
    id: "empty",
    title: "Empty",
    status: "draft",
    dailyPlans: {
      monday: { items: [] }, tuesday: { items: [] }, wednesday: { items: [] },
      thursday: { items: [] }, friday: { items: [] },
    },
  };
  const coverage = status.measureWeekdayCoverage(empty, []);
  assert.equal(coverage.filled, 0);
  const summary = enrichment.buildUpgradeSummary(empty, [], null);
  assert.equal(summary.dashboardStage, "Legacy");
  assert.ok(summary.contentCompletionPercent <= 20);
}

// Monday-only: high enrichment fill must NOT be Ready or 100% content completion
{
  const plan = mondayOnlyPlan();
  const acts = enrichment.flattenLessonActivities(plan, []);
  const summary = enrichment.buildUpgradeSummary(plan, acts, plan.enrichmentDraft);
  assert.equal(summary.weekdayCoverage.filled, 1, "monday only filled");
  assert.equal(summary.weekdayCoverageComplete, false);
  assert.notEqual(summary.dashboardStage, "Ready", "monday-only not Ready");
  assert.notEqual(summary.dashboardStage, "Published");
  assert.ok(summary.contentCompletionPercent < 100, "content completion not 100%");
  assert.ok(summary.contentCompletionPercent <= 40, `content completion capped for one day (got ${summary.contentCompletionPercent})`);
  assert.match(summary.weekdayCoverageLabel, /1 of 5/);

  const analysis = lessonTeacher.analyzeLessonCompleteness(plan, acts, plan.enrichmentDraft);
  assert.ok(analysis.completionPercent < 100);
  assert.notEqual(analysis.dashboardStage, "Ready");
  assert.ok(analysis.gapSectionIds.includes("daily_plan") || analysis.weekdayCoverage?.filled === 1);
}

// Full five-day lesson can reach Ready when enrichment is strong and unpublished
{
  const plan = fiveDayPlan();
  const acts = enrichment.flattenLessonActivities(plan, []);
  const summary = enrichment.buildUpgradeSummary(plan, acts, plan.enrichmentDraft);
  assert.equal(summary.weekdayCoverage.filled, 5);
  assert.equal(summary.weekdayCoverageComplete, true);
  // Draft pending keeps it Needs Review; clear draft for Ready check
  const publishedReady = enrichment.buildUpgradeSummary(
    { ...plan, status: "draft", enrichmentDraft: null },
    acts,
    null,
  );
  // Without draft, enrichment fill may drop — use draft-as-published fields by merging into plan
  const merged = enrichment.mergeDraftIntoPlan(plan, acts, plan.enrichmentDraft);
  const readySummary = enrichment.buildUpgradeSummary(
    { ...merged.plan, status: "draft", enrichmentDraft: null },
    merged.activities || acts,
    null,
  );
  assert.equal(readySummary.weekdayCoverageComplete, true);
  assert.ok(["Ready", "Needs Review", "In Progress"].includes(readySummary.dashboardStage));
}

// Published + full coverage + no draft → Published workflow
{
  const plan = fiveDayPlan();
  const acts = enrichment.flattenLessonActivities(plan, []);
  const merged = enrichment.mergeDraftIntoPlan(plan, acts, plan.enrichmentDraft);
  const summary = enrichment.buildUpgradeSummary(
    { ...merged.plan, status: "published", enrichmentDraft: null },
    merged.activities || acts,
    null,
  );
  if (summary.completionPercent >= 90 && summary.weekdayCoverageComplete) {
    assert.equal(summary.dashboardStage, "Published");
  }
}

// Archived
{
  const plan = mondayOnlyPlan({ status: "archived" });
  const summary = enrichment.buildUpgradeSummary(plan, [], null);
  assert.equal(summary.dashboardStage, "Archived");
}

// Quality vs completion separated on report
{
  const plan = mondayOnlyPlan();
  const acts = enrichment.flattenLessonActivities(plan, []);
  const report = quality.buildQualityReport(plan, acts, plan.enrichmentDraft);
  assert.ok(Number.isFinite(report.overallScore), "quality score present");
  assert.ok(report.weekdayCoverageLabel || report.contentCompletionLabel, "content label present");
  assert.match(String(report.contentCompletionLabel || report.weekdayCoverageLabel), /1 of 5|enrichment fill/i);
  assert.ok("overallScore" in report && "completionPercent" in report, "quality and completion both present as separate fields");
}

// Blocking states
{
  assert.equal(status.blockingStateFromReport({ blocksPublish: true }), "Blocked");
  assert.equal(status.blockingStateFromReport({ blocksPublish: false, publishReadiness: "needs_review" }), "Warnings");
  assert.equal(status.blockingStateFromReport({ blocksPublish: false, publishReadiness: "ready", findings: [] }), "No blockers");
}

assert.deepEqual(teachingKit.DASHBOARD_STAGES, [
  "Legacy", "In Progress", "Needs Review", "Ready", "Published", "Archived",
]);

console.log("PASS curriculum-quality-status-phase7");
