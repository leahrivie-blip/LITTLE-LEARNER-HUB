#!/usr/bin/env node
/**
 * Review-draft composition: new jobs save authorized changes without Apply Enrichment.
 * Run: npm run test:curriculum-operator-review-draft-compose
 */
"use strict";

const assert = require("node:assert/strict");
const commandApi = require("./curriculum-operator-command.js");
const draftCompose = require("./curriculum-operator-review-draft-compose.js");
const connected = require("./curriculum-operator-connected-upgrade.js");
const jobApi = require("./curriculum-operator-job.js");

const LMW = "cur-lp-549b80f61dfa8d79";
const CATALOG = [
  { id: LMW, title: "Little Makers Workshop", plan: "Free", status: "draft", age: "Toddler 12–24 Months" },
];

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function parse(raw) {
  return commandApi.parseOperatorCommand(raw, { phase: 7, lessonPlans: CATALOG });
}

console.log("1) vocab / images / printables compose into draft");
{
  const vocab = parse("Fix the vocabulary in Little Makers Workshop. Don't publish.");
  ok(draftCompose.shouldComposeReviewDraft(vocab.command), "vocab compose");
  ok(vocab.command.actions.publish !== true, "vocab not publish");
  ok(connected.canAutoApplyConnectedEnrichment({
    status: "success",
    ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    finalVerificationComplete: true,
    finalVerification: { ok: true },
    lessonId: LMW,
    audit: { lessonId: LMW },
  }, { command: vocab.command }).ok, "vocab eligible for draft compose");

  const images = parse("Upgrade the activity images only for Little Makers Workshop.");
  ok(images.command.intent === "finish_images", "images-only intent");
  ok(draftCompose.shouldComposeReviewDraft(images.command), "images compose");
  ok(images.command.actions.upgradeActivities !== true, "images do not rewrite activities");

  const printables = parse("Fix the printables but don't change the lesson text for Little Makers Workshop.");
  ok(printables.command.actions.generatePrintables === true || printables.command.intent === "finish_printables", "printables work");
  ok(printables.command.actions.upgradeActivities !== true, "printables do not rewrite text");
  ok(draftCompose.shouldComposeReviewDraft(printables.command) || printables.command.actions.saveDraft === true, "printables save draft");
}

console.log("\n2) new job version does not require Apply Enrichment");
{
  const parsed = parse("Fix activity photos only for Little Makers Workshop. Don't publish.");
  const job = jobApi.createJobFromPlan({
    command: parsed.command,
    planSummary: { lessons: [{ id: LMW, title: "Little Makers Workshop" }], selectionNote: "test" },
    createdBy: "owner@example.com",
  });
  ok(job.operatorPlanVersion === 2, "new jobs are plan version 2");
  ok(job.publishEnabled === false, "job cannot publish");
  ok(!draftCompose.legacyJobNeedsManualApply(job), "new job does not need Apply Enrichment");
  ok(draftCompose.legacyJobNeedsManualApply({
    operatorPlanVersion: 1,
    command: { actions: { saveDraft: true, connectedAutoApply: false } },
  }), "legacy job still recognized");
}

console.log("\n3) owner copy");
{
  const copy = draftCompose.ownerFacingWorkflowCopy();
  ok(/lesson draft/.test(copy.saveBehavior), "save copy");
  ok(/Nothing will publish/.test(copy.publishing), "publish copy");
  ok(copy.applyEnrichmentRequired === false, "apply not required");
}

console.log(`\nReview-draft compose passed ${passed} assertions.`);
