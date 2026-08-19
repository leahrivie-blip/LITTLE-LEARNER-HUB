#!/usr/bin/env node
/**
 * Weekly curriculum standard: 10 activities = complete week;
 * proportional visual coverage; images never hard-block Ready to Publish alone.
 *
 * Run: NODE_ENV=test node scripts/test-curriculum-weekly-activity-standard.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const enrich = require("./teaching-kit-enrichment.js");
const quality = require("./teaching-kit-quality-review.js");
const status = require("./teaching-kit-status.js");
const lessonTeacher = require("./teaching-kit-ai-lesson-teacher.js");

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
      description: "Children explore the theme with hands-on materials, then share a turn with a friend.",
      materials: "trays, baskets, theme props, tongs, crayons",
      preparation: "Stage trays low.",
      setup: "Set materials on a low table.",
      steps: "1. Invite children.\n2. Model one action.\n3. Let children try.\n4. Clean up together.",
      teacherLanguage: "What do you notice? How does that texture feel?",
      observationOpportunities: "Does the child try a new action, use a theme word, or take a turn?",
      safetyNotes: "Stay nearby.",
      cleanupTips: "Wipe trays.",
      ageModifications: "Preschool",
      durationMinutes: 15,
      indoorAlternatives: "Keep the same tray invitation at a table if weather blocks outdoor time.",
      outdoorAlternatives: "Take the trays onto the patio for a shaded movement path.",
      imageRequirement,
      setupImageUrl: withImages ? `/media/${id}-setup.png` : "",
      exampleImageUrl: withImages ? `/media/${id}-example.png` : "",
      teacherTips: ["Offer two choices and name one feeling word."],
    });
  }
  return items;
}

function buildWeekPlan({
  id = "qa-week-standard",
  perDay = 2,
  countsByDay = null,
  skipDays = [],
  imageDays = [],
  imageRequirement = "not_needed",
  resources = null,
} = {}) {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const dailyPlans = {};
  const activities = [];
  const draftActs = {};
  days.forEach((day) => {
    if (skipDays.includes(day)) {
      dailyPlans[day] = { theme: `${day} theme focus`, focus: `${day} focus`, items: [] };
      return;
    }
    const count = countsByDay && Number.isFinite(Number(countsByDay[day]))
      ? Number(countsByDay[day])
      : perDay;
    const withImages = imageDays.includes(day);
    const items = dayItems(day, count, { withImages, imageRequirement });
    dailyPlans[day] = {
      theme: `${day} theme focus`,
      focus: `${day} focus`,
      items,
    };
    items.forEach((item) => {
      activities.push({ ...item, lessonPlanId: id, status: "draft" });
      draftActs[item.id] = {
        teacherTips: item.teacherTips,
        observationPrompts: ["Tries a new action and uses a theme word?"],
        imageRequirement: item.imageRequirement,
        setupImageUrl: item.setupImageUrl,
        exampleImageUrl: item.exampleImageUrl,
        setup: item.setup,
        steps: item.steps,
        adaptations: "Offer a simpler tray.",
        extensions: "Invite a friend to take a turn.",
        indoorAlternatives: item.indoorAlternatives,
        outdoorAlternatives: item.outdoorAlternatives,
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
    weeklyOverview: "Children explore shells through play, dance, story talk, and pretend kitchen play. They pinch with tongs, observe textures, predict what happens if they sort, draw with crayons, and practice sharing a turn with a friend.",
    objectives: "Children will explore textures, practice sorting by size, notice one shell word, and use kind turn-taking in play.",
    vocabularyWords: "shell, smooth, rough, sort, texture, share",
    weeklyMaterials: "shells, tongs, trays, baskets, magnifiers, paper, crayons, scarves, baskets, cups",
    familyConnection: "Ask your child to find one shell word at home, share how it feels, and tell you what it means.",
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
        weeklyOverview: "Children explore shells through play, dance, story talk, and pretend kitchen play. They pinch with tongs, observe textures, predict what happens if they sort, draw with crayons, and practice sharing a turn with a friend.",
        objectives: "Children will explore textures, practice sorting by size, notice one shell word, and use kind turn-taking in play.",
        weeklyMaterials: "shells, tongs, trays, baskets, magnifiers, paper, crayons, scarves, baskets, cups",
        familyConnection: "Ask your child to find one shell word at home, share how it feels, and tell you what it means.",
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

function imageBlockers(evalOrReport) {
  const issues = evalOrReport.blockingIssues
    || evalOrReport.report?.blockingIssues
    || [];
  return issues.filter((issue) => /image|photo|visual/i.test(`${issue.code} ${issue.message}`));
}

function assertPublishReadyWhenComplete(evaluated, label) {
  const imageHard = imageBlockers(evaluated);
  assert.equal(imageHard.length, 0, `${label}: images must not hard-block (${imageHard.map((i) => i.code).join(",")})`);
  assert.notEqual(evaluated.publishReadiness, "blocked", `${label}: must not be blocked`);
  assert.ok(evaluated.premiumReadinessPercent >= 90, `${label}: premium ${evaluated.premiumReadinessPercent} >= 90`);
  assert.equal(evaluated.publishReadiness, "ready", `${label}: publishReadiness ready (got ${evaluated.publishReadiness})`);
  assert.ok(
    evaluated.workflow === "Publish Ready" || evaluated.workflow === "Ready for Owner Review",
    `${label}: workflow ${evaluated.workflow}`,
  );
}

// Image policy modes remain owner-selectable and do not independently fail Complete when unused
{
  assert.deepEqual(
    enrich.IMAGE_REQUIREMENT_OWNER_OPTIONS,
    ["not_needed", "example_only", "setup_only", "required", "optional"],
  );
  const sample = buildWeekPlan({ id: "qa-image-modes", perDay: 2 }).activities[0];
  const draft = { teacherTips: ["Tip"], observationPrompts: ["See?"], setup: sample.setup, steps: sample.steps };
  ["not_needed", "optional", "example_only", "setup_only", "required"].forEach((req) => {
    const patch = { ...draft, imageRequirement: req };
    const view = enrich.activityEnrichmentView(sample, patch);
    if (req === "not_needed" || req === "optional") {
      assert.equal(enrich.activityImagesSatisfyRequirement(view, req), true);
      assert.equal(enrich.activityStatus(sample, patch), "complete");
    } else {
      assert.equal(enrich.activityImagesSatisfyRequirement(view, req), false);
    }
  });
}

// Volume bands — exact live standard
{
  assert.equal(enrich.scoreActivityVolume(0).band, "empty");
  [1, 2, 3, 4].forEach((n) => {
    const vol = enrich.scoreActivityVolume(n);
    assert.equal(vol.band, "incomplete", `${n} is incomplete`);
    assert.ok(vol.score < 40, `${n} incomplete score ${vol.score}`);
    assert.equal(vol.requirementMet, false);
  });
  [5, 6, 7].forEach((n) => {
    const vol = enrich.scoreActivityVolume(n);
    assert.equal(vol.band, "developing", `${n} is developing`);
    assert.ok(vol.score >= 40 && vol.score < 75, `${n} developing score ${vol.score}`);
    assert.equal(vol.requirementMet, false);
  });
  [8, 9].forEach((n) => {
    const vol = enrich.scoreActivityVolume(n);
    assert.equal(vol.band, "nearly_complete", `${n} is nearly complete`);
    assert.ok(vol.score >= 75 && vol.score < 100, `${n} nearly-complete score ${vol.score}`);
    assert.equal(vol.requirementMet, false);
  });
  const ten = enrich.scoreActivityVolume(10);
  assert.equal(ten.score, 100);
  assert.equal(ten.band, "complete");
  assert.equal(ten.requirementMet, true);
  const eleven = enrich.scoreActivityVolume(11);
  const twelve = enrich.scoreActivityVolume(12);
  assert.equal(eleven.score, 100);
  assert.equal(twelve.score, 100);
  assert.equal(eleven.band, "strong");
  assert.equal(twelve.band, "strong");
  assert.equal(enrich.scoreActivityVolume(13).score, 100);
  assert.equal(enrich.scoreActivityVolume(16).score, 100);
  assert.equal(enrich.scoreActivityVolume(20).score, 100);
  assert.equal(enrich.scoreActivityVolume(13).band, "ample");
}

// A–J proofs
{
  // A. 10 activities, 2 per weekday, otherwise complete → full volume + Publish Ready
  const a = buildWeekPlan({
    id: "qa-a-10",
    perDay: 2,
    imageDays: ["monday", "wednesday", "friday"],
    imageRequirement: "not_needed",
  });
  assert.equal(a.activities.length, 10);
  const aScores = enrich.computeReadinessScores(a.plan, a.activities, a.plan.enrichmentDraft, { resources: a.resources });
  assert.equal(aScores.activityVolume.score, 100);
  assert.equal(aScores.activityVolume.requirementMet, true);
  const aEval = quality.evaluateTeachingKit(a.plan, a.activities, a.plan.enrichmentDraft, { resources: a.resources });
  assertPublishReadyWhenComplete(aEval, "A");

  // B. 12 activities → no meaningful score advantage over 10
  const b12 = buildWeekPlan({
    id: "qa-b-12",
    perDay: 2,
    imageDays: ["monday", "wednesday", "friday"],
    imageRequirement: "not_needed",
  });
  b12.plan.dailyPlans.friday.items.push(...dayItems("friday", 2, { imageRequirement: "not_needed" }));
  b12.plan.dailyPlans.friday.items.slice(-2).forEach((item) => {
    b12.activities.push({ ...item, lessonPlanId: "qa-b-12", status: "draft" });
    b12.plan.enrichmentDraft.activities[item.id] = {
      teacherTips: item.teacherTips,
      observationPrompts: ["Observe?"],
      imageRequirement: "not_needed",
      setup: item.setup,
      steps: item.steps,
      indoorAlternatives: item.indoorAlternatives,
      outdoorAlternatives: item.outdoorAlternatives,
    };
  });
  assert.equal(b12.activities.length, 12);
  const b10Scores = aScores;
  const b12Scores = enrich.computeReadinessScores(
    b12.plan, b12.activities, b12.plan.enrichmentDraft, { resources: b12.resources },
  );
  assert.equal(b12Scores.activityVolumeScore, b10Scores.activityVolumeScore);
  assert.ok(
    Math.abs(b12Scores.premiumReadinessPercent - b10Scores.premiumReadinessPercent) <= 3,
    `B: 12 vs 10 premium ${b12Scores.premiumReadinessPercent} vs ${b10Scores.premiumReadinessPercent}`,
  );

  // C. 16 or 20 activities → no additional volume score
  assert.equal(enrich.scoreActivityVolume(16).score, enrich.scoreActivityVolume(10).score);
  assert.equal(enrich.scoreActivityVolume(20).score, enrich.scoreActivityVolume(10).score);
  const c16 = buildWeekPlan({ id: "qa-c-16", countsByDay: { monday: 4, tuesday: 3, wednesday: 3, thursday: 3, friday: 3 }, imageDays: ["monday", "wednesday"], imageRequirement: "not_needed" });
  assert.equal(c16.activities.length, 16);
  const c20 = buildWeekPlan({ id: "qa-c-20", perDay: 4, imageDays: ["monday", "wednesday"], imageRequirement: "not_needed" });
  assert.equal(c20.activities.length, 20);
  const c16s = enrich.computeReadinessScores(c16.plan, c16.activities, c16.plan.enrichmentDraft, { resources: c16.resources });
  const c20s = enrich.computeReadinessScores(c20.plan, c20.activities, c20.plan.enrichmentDraft, { resources: c20.resources });
  assert.equal(c16s.activityVolumeScore, 100);
  assert.equal(c20s.activityVolumeScore, 100);
  assert.ok(c16s.premiumReadinessPercent <= b10Scores.premiumReadinessPercent + 3);
  assert.ok(c20s.premiumReadinessPercent <= b10Scores.premiumReadinessPercent + 3);

  // D. 10 activities with ~4–6 useful images → Publish Ready
  const d = buildWeekPlan({
    id: "qa-d-images",
    perDay: 2,
    imageDays: ["monday", "wednesday", "friday"],
    imageRequirement: "not_needed",
  });
  const dVisual = enrich.measureVisualCoverage(d.plan, d.activities, d.plan.enrichmentDraft);
  assert.ok(dVisual.withImages >= 4 && dVisual.withImages <= 6, `D: ${dVisual.withImages} images`);
  assert.equal(dVisual.excellent, true);
  const dEval = quality.evaluateTeachingKit(d.plan, d.activities, d.plan.enrichmentDraft, { resources: d.resources });
  assertPublishReadyWhenComplete(dEval, "D");

  // E. several simple activities explicitly No image needed → Publish Ready
  const e = buildWeekPlan({
    id: "qa-e-not-needed",
    perDay: 2,
    imageDays: ["tuesday", "thursday"],
    imageRequirement: "not_needed",
  });
  e.activities.forEach((act) => {
    assert.equal(act.imageRequirement, "not_needed");
    assert.equal(enrich.activityStatus(act, e.plan.enrichmentDraft.activities[act.id]), "complete");
  });
  const eEval = quality.evaluateTeachingKit(e.plan, e.activities, e.plan.enrichmentDraft, { resources: e.resources });
  assertPublishReadyWhenComplete(eEval, "E");

  // F. zero images → soft recommendation, not a hard blocker; can still be Publish Ready
  const f = buildWeekPlan({ id: "qa-f-zero", perDay: 2, imageDays: [], imageRequirement: "not_needed" });
  const fVisual = enrich.measureVisualCoverage(f.plan, f.activities, f.plan.enrichmentDraft);
  assert.equal(fVisual.percent, 0);
  assert.ok(fVisual.recommendation);
  const fScores = enrich.computeReadinessScores(f.plan, f.activities, f.plan.enrichmentDraft, { resources: f.resources });
  assert.ok(fScores.premiumReadinessPercent >= 90, `F: zero images must not cap premium below 90 (got ${fScores.premiumReadinessPercent})`);
  const fEval = quality.evaluateTeachingKit(f.plan, f.activities, f.plan.enrichmentDraft, { resources: f.resources });
  const fImageFinding = (fEval.report.findings || []).find((row) => row.code === "missing_example_images");
  assert.ok(fImageFinding, "F: soft visual recommendation present");
  assert.equal(fImageFinding.blocking, false);
  assert.equal(imageBlockers(fEval).length, 0);
  assertPublishReadyWhenComplete(fEval, "F");

  // G. uneven 1/3/1/4/1 still satisfies weekday coverage
  const g = buildWeekPlan({
    id: "qa-g-uneven",
    countsByDay: { monday: 1, tuesday: 3, wednesday: 1, thursday: 4, friday: 1 },
    imageDays: ["tuesday", "thursday"],
    imageRequirement: "not_needed",
  });
  assert.equal(g.activities.length, 10);
  const gCover = status.measureWeekdayCoverage(g.plan, g.activities);
  assert.equal(gCover.coverageComplete, true);
  assert.deepEqual(gCover.missingDays, []);
  const gEval = quality.evaluateTeachingKit(g.plan, g.activities, g.plan.enrichmentDraft, { resources: g.resources });
  assert.equal(
    (gEval.report.findings || []).some((row) => row.code === "missing_weekday_focus" && row.blocking),
    false,
    "G: uneven distribution is not a weekday blocker",
  );

  // H. missing a weekday still triggers weekday coverage
  const h = buildWeekPlan({
    id: "qa-h-missing-friday",
    perDay: 2,
    skipDays: ["friday"],
    imageDays: ["monday", "wednesday"],
    imageRequirement: "not_needed",
  });
  const hCover = status.measureWeekdayCoverage(h.plan, h.activities);
  assert.equal(hCover.coverageComplete, false);
  assert.ok(hCover.missingDays.includes("friday"));
  const hEval = quality.evaluateTeachingKit(h.plan, h.activities, h.plan.enrichmentDraft, { resources: h.resources });
  const hWorkflow = status.workflowStatusFromParts({
    lessonStatus: "draft",
    enrichmentFillPercent: 95,
    premiumReadinessPercent: 95,
    hasEnrichmentDraft: true,
    coverageComplete: hCover.coverageComplete,
    needsReview: Boolean(hEval.summary.needsReview),
    publishReadiness: hEval.publishReadiness,
    qualityBlocked: hEval.blocksPublish,
  });
  assert.notEqual(hWorkflow, "Publish Ready", "H: missing weekday cannot be Publish Ready");

  // I. owner-classified required image keeps activity guidance without globally blocking on image count
  const i = buildWeekPlan({
    id: "qa-i-required",
    perDay: 2,
    imageDays: ["monday", "tuesday", "wednesday"],
    imageRequirement: "not_needed",
  });
  const target = i.activities.find((act) => act.id === "thursday-1");
  target.imageRequirement = "required";
  target.setupImageUrl = "";
  target.exampleImageUrl = "";
  i.plan.enrichmentDraft.activities["thursday-1"].imageRequirement = "required";
  i.plan.enrichmentDraft.activities["thursday-1"].setupImageUrl = "";
  i.plan.enrichmentDraft.activities["thursday-1"].exampleImageUrl = "";
  assert.equal(enrich.activityStatus(target, i.plan.enrichmentDraft.activities["thursday-1"]), "in_progress");
  assert.equal(enrich.activityPublishContentComplete(target, i.plan.enrichmentDraft.activities["thursday-1"]), true);
  const iScores = enrich.computeReadinessScores(i.plan, i.activities, i.plan.enrichmentDraft, { resources: i.resources });
  assert.equal(iScores.incompleteActivitiesForPublish, 0);
  assert.ok(iScores.premiumReadinessPercent >= 90, `I: premium ${iScores.premiumReadinessPercent}`);
  const iBefore = buildWeekPlan({
    id: "qa-i-required-before",
    perDay: 2,
    imageDays: ["monday", "tuesday", "wednesday"],
    imageRequirement: "not_needed",
  });
  const iBeforeAnalysis = lessonTeacher.analyzeLessonCompleteness(
    iBefore.plan, iBefore.activities, iBefore.plan.enrichmentDraft, { resources: iBefore.resources },
  );
  const iEval = quality.evaluateTeachingKit(i.plan, i.activities, i.plan.enrichmentDraft, { resources: i.resources });
  assert.equal(imageBlockers(iEval).length, 0, "I: image count is not a lesson-level hard blocker");
  assert.ok(iEval.publishReadiness === "ready" || !iEval.blocksPublish, "I: lesson not blocked solely on image count");
  const iAnalysis = lessonTeacher.analyzeLessonCompleteness(i.plan, i.activities, i.plan.enrichmentDraft, { resources: i.resources });
  const iActs = iAnalysis.sections.find((section) => section.id === "activities");
  assert.equal(iActs.status, "complete", "I: AI teacher activities section uses core content, not photos");
  assert.equal(
    iAnalysis.completionPercent,
    iBeforeAnalysis.completionPercent,
    "I: owner-required missing image must not change AI teacher completion vs the same week without that gap",
  );

  // Optional / unclassified / not_needed must not stay In Progress for images
  const optionalAct = i.activities.find((act) => act.id === "friday-1");
  i.plan.enrichmentDraft.activities["friday-1"].imageRequirement = "optional";
  optionalAct.imageRequirement = "optional";
  optionalAct.setupImageUrl = "";
  optionalAct.exampleImageUrl = "";
  i.plan.enrichmentDraft.activities["friday-1"].setupImageUrl = "";
  i.plan.enrichmentDraft.activities["friday-1"].exampleImageUrl = "";
  assert.equal(enrich.activityStatus(optionalAct, i.plan.enrichmentDraft.activities["friday-1"]), "complete");
  const unclassified = i.activities.find((act) => act.id === "friday-2");
  unclassified.imageRequirement = "";
  unclassified.setupImageUrl = "";
  unclassified.exampleImageUrl = "";
  i.plan.enrichmentDraft.activities["friday-2"].imageRequirement = "";
  i.plan.enrichmentDraft.activities["friday-2"].setupImageUrl = "";
  i.plan.enrichmentDraft.activities["friday-2"].exampleImageUrl = "";
  assert.equal(enrich.resolveImageRequirement(unclassified, i.plan.enrichmentDraft.activities["friday-2"]), "needs_owner_classification");
  assert.equal(enrich.activityStatus(unclassified, i.plan.enrichmentDraft.activities["friday-2"]), "complete");

  // J. No active AI prompt recommends filler activities just to increase the score
  const activePromptFiles = [
    "server/enrichment-ai.js",
    "server/index.js",
    "scripts/teaching-kit-ai-lesson-teacher.js",
    "scripts/teaching-kit-enrichment-editor.js",
  ];
  const forbidden = [
    /3[–-]4 activities per day/i,
    /15 activities/i,
    /16 activities/i,
    /20 activities/i,
    /every activity needs an image/i,
    /all activities imaged/i,
    /image required for completion/i,
    /add filler/i,
    /invent filler just to (hit|raise|increase)/i,
    /more activities just to raise a score/i,
  ];
  const allowedNegations = /do not (recommend adding more activities just to raise|invent filler|rewrite or inflate)/i;
  activePromptFiles.forEach((rel) => {
    const src = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
    forbidden.forEach((pattern) => {
      const hits = src.match(new RegExp(pattern.source, pattern.flags + (pattern.flags.includes("g") ? "" : "g"))) || [];
      hits.forEach((hit) => {
        const idx = src.indexOf(hit);
        const window = src.slice(Math.max(0, idx - 80), idx + hit.length + 40);
        if (allowedNegations.test(window) || /Do NOT recommend adding more activities just to raise/i.test(window)) {
          return;
        }
        if (pattern.source.includes("15 activities") || pattern.source.includes("16 activities") || pattern.source.includes("20 activities")) {
          // Live scoring/AI files must not instruct those counts. Comments about historical fixtures are ok if not prompts.
          if (/farm QA fixture|historical|already published with 15/i.test(window)) return;
        }
        assert.fail(`J: active prompt file ${rel} still contains conflicting guidance: ${hit}`);
      });
    });
  });
  const enrichmentPrompt = require("../server/enrichment-ai.js").buildEnrichmentAiSystemPrompt
    ? require("../server/enrichment-ai.js").buildEnrichmentAiSystemPrompt()
    : "";
  if (enrichmentPrompt) {
    assert.match(enrichmentPrompt, /10 strong activities/);
    assert.match(enrichmentPrompt, /Never invent filler/);
    assert.doesNotMatch(enrichmentPrompt, /3[–-]4 activities per day/);
  }
}

console.log("PASS curriculum-weekly-activity-standard");
