#!/usr/bin/env node
/**
 * Regression: Owner Admin operator job-status UX presenter.
 * Run: npm run test:curriculum-operator-job-status-ui
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const presenterPath = path.join(__dirname, "curriculum-operator-job-status-presenter.js");
const uiPath = path.join(__dirname, "curriculum-operator-ui.js");

const presenter = require("./curriculum-operator-job-status-presenter.js");

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

const coverOnlyCommand = {
  completion: { phase: 7 },
  actions: {
    touchCover: true,
    saveDraft: true,
    upgradeLesson: false,
    upgradeActivities: false,
    generateImages: false,
    generatePrintables: false,
    generateSongsBooks: false,
    touchSongs: false,
    touchBooks: false,
    createLesson: false,
  },
};

console.log("1. queued / planned job display");
{
  const job = { status: "planned", progress: { lessonCount: 1, completed: 0 } };
  ok(presenter.normalizeJobStatus(job) === "queued", "planned maps to queued");
  ok(presenter.bannerTitle("queued") === "Queued", "queued banner title");
  ok(/waiting to start/i.test(presenter.bannerSubtitle("queued")), "queued subtitle");
  const progress = presenter.jobProgress(job);
  ok(progress.completed === 0 && progress.total === 1, "queued progress stays 0/1");
  ok(presenter.currentStepLabel(job) === "Waiting to start", "queued step label");
}

console.log("\n2. running job display");
{
  const job = {
    status: "running",
    progress: { lessonCount: 1, completed: 0, currentAction: "image.replace" },
  };
  ok(presenter.normalizeJobStatus(job) === "running", "running status");
  ok(presenter.currentStepLabel(job) === "Processing images", "running step from currentAction");
  const progress = presenter.jobProgress(job);
  ok(progress.percent >= 0 && progress.percent < 100, "running progress not complete");
}

console.log("\n3. completed READY_FOR_OWNER_REVIEW display");
{
  const job = {
    status: "completed",
    publishEnabled: false,
    command: coverOnlyCommand,
    lessonResults: [{
      status: "success",
      ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
      lessonId: "cur-lp-colors-around-me",
      updated: [{ path: "coverImageUrl" }],
      executionScope: { cover: "CHANGED" },
    }],
    progress: { lessonCount: 1, completed: 1 },
  };
  ok(presenter.normalizeJobStatus(job) === "ready_for_owner_review", "ready for review kind");
  ok(presenter.shouldShowReviewDraft(job), "review draft button eligible");
  ok(presenter.lessonIdFromJob(job) === "cur-lp-colors-around-me", "lesson id resolved");
  const changed = presenter.buildWhatChangedLines(job);
  ok(changed.lines.includes("Cover updated"), "what changed includes cover");
  ok(changed.lines.includes("Published: No"), "publish false in summary");
}

console.log("\n4. failed and blocked display");
{
  const failed = {
    status: "failed",
    lessonResults: [{ status: "failed", error: "Stage 2 failed", ownerReviewStatus: "BLOCKED" }],
  };
  ok(presenter.normalizeJobStatus(failed) === "blocked", "blocked when owner review blocked");
  ok(/stopped safely/i.test(presenter.bannerSubtitle("blocked")), "blocked subtitle");

  const hardFail = {
    status: "failed",
    lessonResults: [{ status: "failed", error: "Timeout", ownerReviewStatus: "PARTIAL" }],
  };
  ok(presenter.normalizeJobStatus(hardFail) === "failed", "failed without blocked review");
}

console.log("\n5. duplicate mutation-lock message deduplication");
{
  const lock = presenter.buildMutationLockNotice({
    code: "LESSON_MUTATION_IN_PROGRESS",
    error: "Another Operator job is already mutating lesson cur-lp-x.",
    blockingJobId: "opjob_abc",
  });
  ok(lock && /review that job below/i.test(lock.message), "lock notice plain language");
  const deduped = presenter.dedupeOperatorMessages([
    "Another Operator job is already mutating lesson cur-lp-x.",
    lock.message,
  ]);
  ok(deduped.length === 1, "duplicate lock messages collapse to one");
}

console.log("\n6. Review draft navigation hook in UI source");
{
  const uiSrc = fs.readFileSync(uiPath, "utf8");
  ok(/Review draft/.test(uiSrc), "review draft button label");
  ok(/data-co-open-lesson/.test(uiSrc), "open lesson navigation attribute");
  ok(/co-current-job-panel/.test(uiSrc), "current job visually separated");
  ok(/co-recent-jobs-panel/.test(uiSrc), "recent jobs panel separated");
}

console.log("\n7. cover-only scope does not imply unrelated actions");
{
  ok(presenter.isCoverOnlyCommand(coverOnlyCommand), "cover-only command detected");
  const summary = presenter.ownerScopeSummaryText(coverOnlyCommand);
  ok(/cover photo only/i.test(summary), "cover-only summary");
  ok(!/full teaching kit/i.test(summary.toLowerCase()), "no full-kit wording in owner summary");
  const rows = presenter.ownerScopeRows(coverOnlyCommand);
  const coverRow = rows.find((r) => r.label === "Cover");
  const lessonRow = rows.find((r) => r.label === "Lesson text");
  ok(coverRow?.state === "included", "cover included");
  ok(lessonRow?.state === "excluded", "lesson text excluded");
}

console.log("\n8. publish=false and Nothing was published banner");
{
  const uiSrc = fs.readFileSync(uiPath, "utf8");
  ok(/Nothing was published/.test(uiSrc), "not-published banner in UI");
  const job = {
    status: "completed",
    publishEnabled: false,
    lessonResults: [{ ownerReviewStatus: "READY_FOR_OWNER_REVIEW", lessonId: "cur-lp-a" }],
  };
  const changed = presenter.buildWhatChangedLines(job);
  ok(changed.published === false, "presenter publish flag false");
  ok(changed.lines.some((line) => line === "Published: No"), "published: no line");
}

console.log("\n9. UI loads job-status presenter before operator UI");
{
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const presenterPos = html.indexOf("curriculum-operator-job-status-presenter.js");
  const uiPos = html.indexOf("curriculum-operator-ui.js");
  ok(presenterPos > 0 && uiPos > presenterPos, "presenter script precedes operator UI");
}

console.log(`\nJob status UI tests passed (${passed} assertions)`);
