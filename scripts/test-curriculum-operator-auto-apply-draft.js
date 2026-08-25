#!/usr/bin/env node
/**
 * Auto-apply existing-lesson upgrade → editable draft lesson (no manual Apply Enrichment).
 * Run: npm run test:curriculum-operator-auto-apply-draft
 */
"use strict";

const assert = require("node:assert/strict");
const commandApi = require("./curriculum-operator-command.js");
const intentRouter = require("./curriculum-operator-intent-router.js");
const connected = require("./curriculum-operator-connected-upgrade.js");
const schema = require("./curriculum-operator-schema.js");
const enrichment = require("./teaching-kit-enrichment.js");
const jobApi = require("./curriculum-operator-job.js");

const OWNER = { email: "leahivie@icloud.com" };
const LESSON_ID = "cur-lp-auto-apply-draft";
const ACT_A = "cur-act-auto-a";
const DUP_RES_A = "cur-res-dup-a";
const DUP_RES_B = "cur-res-dup-b";

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function seedCurriculum() {
  const now = new Date().toISOString();
  return {
    lessonPlans: [{
      id: LESSON_ID,
      title: "Little Makers Workshop",
      age: "Toddler 12–24 Months",
      theme: "Makers",
      plan: "Free",
      status: "draft",
      enrichmentDraft: null,
      activityIds: [ACT_A],
      resourceIds: [DUP_RES_A],
      updatedAt: now,
      createdAt: now,
    }],
    activities: [{
      id: ACT_A,
      lessonPlanId: LESSON_ID,
      itemId: "a",
      title: "Tool Table",
      dayOfWeek: "monday",
      objective: "Children explore safe tools with teacher support.",
      materials: "bowls spoons safe tools",
    }],
    resources: [
      { id: DUP_RES_A, title: "Maker Station Signs", resourceType: "Printable", status: "published" },
      { id: DUP_RES_B, title: "Maker Station Signs", resourceType: "Printable", status: "published" },
    ],
  };
}

function parse(raw, opts = {}) {
  return commandApi.parseOperatorCommand(raw, {
    phase: 7,
    lessonPlans: seedCurriculum().lessonPlans,
    currentlySelectedLessonId: opts.currentlySelectedLessonId ?? null,
  });
}

console.log("A–C. existing connected upgrade defaults to auto-apply draft save");
{
  for (const raw of [
    "Fix Little Makers Workshop completely and leave it ready for me to review. Do not publish it.",
    "Make this lesson publish-ready.",
    "Finish everything missing in this lesson.",
  ]) {
    const parsed = parse(raw, {
      currentlySelectedLessonId: /this lesson/i.test(raw) ? LESSON_ID : null,
    });
    ok(parsed.command.actions.connectedUpgrade === true, `${raw.slice(0, 40)}… → connectedUpgrade`);
    ok(parsed.command.actions.connectedAutoApply === true, `${raw.slice(0, 40)}… → connectedAutoApply`);
    ok(parsed.command.actions.publish !== true, `${raw.slice(0, 40)}… → not publish`);
    ok(parsed.command.scope.lessonIds.includes(LESSON_ID), `${raw.slice(0, 40)}… → same lesson`);
  }
}

console.log("\nE. plan-only → no auto-apply");
{
  const parsed = parse("Plan only: Fix Little Makers Workshop completely but do not apply.");
  ok(parsed.command.actions.planOnly === true, "planOnly flag set");
  ok(parsed.command.actions.connectedAutoApply !== true, "connectedAutoApply disabled for plan-only");
}

console.log("\nD. explicit Publish this lesson unchanged");
{
  const parsed = parse("Publish this lesson.");
  ok(parsed.needsConfirmation === true || parsed.confirmReasons.includes("publish_requested"), "publish still needs confirmation");
  ok(parsed.command.actions.publish !== true, "publish not auto-enabled in normalized command");
}

console.log("\nF. failed final verification → auto-apply blocked");
{
  const job = {
    command: schema.normalizeOperatorCommand({
      rawCommand: "Fix lesson",
      actions: { connectedUpgrade: true, connectedAutoApply: true },
    }, { phase: 7 }),
  };
  const gate = connected.canAutoApplyConnectedEnrichment({
    lessonId: LESSON_ID,
    status: "success",
    ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    finalVerificationComplete: false,
    finalVerification: { ok: false },
    audit: { lessonId: LESSON_ID },
    kitScope: { images: true },
    imagesComplete: true,
  }, job);
  ok(gate.ok === false, "final verification failure blocks auto-apply");
}

console.log("\nG–M. merge + duplicate printable safety");
{
  const curriculum = seedCurriculum();
  const plan = curriculum.lessonPlans[0];
  const draft = {
    week: {
      weeklyOverview: "Children explore making with safe classroom tools all week.",
      printableIds: [DUP_RES_B],
    },
    activities: {
      [ACT_A]: {
        objective: "Children will explore safe maker tools with teacher modeling and turn-taking.",
        setupImageUrl: "https://cdn.example.test/maker-setup.png",
      },
    },
    updatedAt: new Date().toISOString(),
  };
  const merged = enrichment.mergeDraftIntoPlan(plan, curriculum.activities, draft, {
    resources: curriculum.resources,
  });
  ok(merged.plan.resourceIds.filter((id) => id === DUP_RES_A || id === DUP_RES_B).length === 1,
    "duplicate printable title attaches once");
  ok(merged.plan.status === plan.status, "status preserved on merge");
  ok(merged.plan.plan === plan.plan, "Free/Pro preserved");
  ok(merged.activities[0].id === ACT_A, "activity id preserved");
  ok(merged.activities[0].setupImageUrl.includes("maker-setup"), "generated image attached");
}

console.log("\nJ. legacy Apply Enrichment eligibility (connected auto-apply gate)");
{
  const job = jobApi.createJobFromPlan({
    command: schema.normalizeOperatorCommand({
      rawCommand: "Fix Little Makers Workshop",
      scope: { lessonIds: [LESSON_ID] },
      actions: { connectedUpgrade: true, connectedAutoApply: true },
    }, { phase: 7 }),
    planSummary: { selectedLessonIds: [LESSON_ID] },
    createdBy: OWNER.email,
    status: "completed",
  });
  job.lessonResults = [{
    lessonId: LESSON_ID,
    status: "success",
    ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    finalVerificationComplete: true,
    finalVerification: { ok: true },
    audit: { lessonId: LESSON_ID },
    kitScope: { images: false, printables: false, songs: false, books: false },
    textComplete: true,
  }];
  const gate = connected.canAutoApplyConnectedEnrichment(job.lessonResults[0], job);
  ok(gate.ok === true, "successful connected result eligible for auto-apply");
}

console.log(`\nAuto-apply draft save tests passed (${passed} assertions)`);
