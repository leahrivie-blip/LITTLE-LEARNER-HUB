#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const qaJobPoll = require("./curriculum-operator-qa-job-poll.js");
const qaCleanup = require("./curriculum-operator-qa-disposable-cleanup.js");

const SESSION = "spring-planting-prod-qa-1791370704478";
const TITLE = "Spring Planting QA Disposable spring-planting-prod-qa-1791370704478-86bf791a";
const LESSON_ID = "cur-lp-afe9566a60d977c7";

const jobs = [
  {
    id: "opjob_old",
    status: "failed",
    updatedAt: "2026-10-01T00:00:00.000Z",
    rawCommand: "Create a complete spring planting lesson for preschoolers called \"Other\".",
  },
  {
    id: "opjob_match",
    status: "running",
    updatedAt: "2026-10-07T11:00:00.000Z",
    rawCommand: `Create a complete spring planting lesson for preschoolers called "${TITLE}".`,
  },
];

assert.ok(
  qaJobPoll.jobMatchesQaSession(jobs[1], { operatorSessionId: SESSION, disposableTitle: TITLE }),
  "operatorSessionId/title resolves job candidate",
);
assert.equal(
  qaJobPoll.findJobsForQaSession(jobs, { operatorSessionId: SESSION, disposableTitle: TITLE })[0].id,
  "opjob_match",
);

const completedJob = {
  id: "opjob_done",
  status: "completed",
  lessonResults: [{
    lessonCreated: true,
    createdLessonId: LESSON_ID,
    ownerReviewStatus: "READY_FOR_OWNER_REVIEW",
    status: "success",
  }],
};
const failedJob = {
  id: "opjob_fail",
  status: "failed",
  lessonResults: [{ status: "failed", code: "AI_CREATION_FAILED", error: "Stage 2 batch batch1 failed" }],
};

assert.equal(qaJobPoll.summarizeCreateJob(completedJob).jobId, "opjob_done");
assert.ok(qaJobPoll.createJobSucceeded(qaJobPoll.summarizeCreateJob(completedJob)));
assert.ok(!qaJobPoll.createJobSucceeded(qaJobPoll.summarizeCreateJob(failedJob)));

let pollCalls = 0;
(async () => {
  const timeoutThenSuccess = await qaJobPoll.resolveAndPollCreateJob({
    operatorSessionId: SESSION,
    disposableTitle: TITLE,
    deadlineMs: Date.now() + 500,
    pollIntervalMs: 50,
    listJobs: async () => {
      pollCalls += 1;
      return pollCalls >= 2
        ? [{ id: "opjob_done", status: "completed", updatedAt: new Date().toISOString(), rawCommand: TITLE }]
        : [{ id: "opjob_done", status: "running", updatedAt: new Date().toISOString(), rawCommand: TITLE }];
    },
    getJob: async (id) => (id === "opjob_done" ? completedJob : null),
  });
  assert.ok(timeoutThenSuccess.ok, "timeout path polls until terminal success");
  assert.equal(timeoutThenSuccess.summary.createdLessonId, LESSON_ID);

  const failedPoll = await qaJobPoll.resolveAndPollCreateJob({
    operatorSessionId: SESSION,
    disposableTitle: TITLE,
    deadlineMs: Date.now() + 120,
    pollIntervalMs: 40,
    listJobs: async () => [{ id: "opjob_fail", status: "failed", updatedAt: new Date().toISOString(), rawCommand: TITLE }],
    getJob: async () => failedJob,
  });
  assert.ok(failedPoll.ok && failedPoll.summary.jobStatus === "failed", "failed terminal job is returned");

  const active = qaJobPoll.findActiveQaSessionJobs(jobs, { operatorSessionId: SESSION, disposableTitle: TITLE });
  assert.equal(active.length, 1, "no duplicate QA run while original job active");

  const plan = { id: LESSON_ID, title: TITLE, status: "draft" };
  assert.ok(qaCleanup.verifyDisposableQaLessonIdentity(plan, { lessonId: LESSON_ID, exactTitle: TITLE }).ok);
  assert.equal(
    qaCleanup.verifyDisposableQaLessonIdentity(plan, { lessonId: LESSON_ID, exactTitle: "Similar title" }).code,
    "lesson_title_mismatch",
  );
  assert.equal(
    qaCleanup.verifyDisposableQaLessonIdentity(plan, { lessonId: "cur-lp-other", exactTitle: TITLE }).code,
    "lesson_id_mismatch",
  );

  console.log("Curriculum operator QA job poll + cleanup checks passed.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
