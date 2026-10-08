#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const jobApi = require("./curriculum-operator-job.js");
const commandApi = require("./curriculum-operator-command.js");
const runVisibility = require("./curriculum-operator-run-visibility.js");
const { createCurriculumOperatorJobStore } = require("../server/curriculum-operator-job-store.js");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

const OWNER = { email: "owner@example.com" };
const SESSION = "cancel-resume-dedicated-session";

function tmpJobFile() {
  return path.join(os.tmpdir(), `llh-opjob-cr-${crypto.randomBytes(4).toString("hex")}.json`);
}

function buildStoreRef() {
  return {
    siteContent: {
      featureFlags: { teachingKitCurriculumOperator: true },
      curriculum: { lessonPlans: [], activities: [], resources: [] },
      updatedAt: new Date().toISOString(),
    },
    curriculumOperatorJobs: { jobs: [], updatedAt: "" },
    curriculumOperatorConversations: {},
  };
}

function ownerTeachingKitStub(options = {}) {
  const tk = require("./teaching-kit.js");
  const ownerOnly = options.ownerOnly !== false;
  return {
    ...tk,
    isTeachingKitOwnerPreviewEmail: (email) => (
      ownerOnly ? true : String(email || "").toLowerCase() === OWNER.email
    ),
  };
}

function buildRunningCreateJob({ jobId, operatorSessionId, title = "Dedicated-only job" }) {
  const raw = `Create a complete spring planting lesson for preschoolers called "${title}". Keep unpublished.`;
  const parsed = commandApi.parseOperatorCommand(raw, { phase: 7, confirmStagedResearchCreate: true });
  const job = jobApi.createJobFromPlan({
    command: parsed.command,
    planSummary: { selectedLessonIds: [], creationBrief: { title } },
    createdBy: OWNER.email,
    status: "running",
    operatorSessionId,
  });
  job.id = jobId || job.id;
  return jobApi.normalizeOperatorJob(job);
}

function captureApi(storeRef, operatorJobStore, options = {}) {
  const responses = [];
  let runJobCalls = 0;
  const api = createCurriculumOperatorApi({
    readJson: async (req) => req.body || {},
    jsonResponse: (_res, statusCode, body) => {
      responses.push({ statusCode, body });
    },
    readStore: () => storeRef,
    writeStoreAsync: async () => {},
    requireTeachingKitOwnerAdminSession: options.requireSession || (() => OWNER),
    teachingKit: ownerTeachingKitStub(options.teachingKit),
    normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
    readSiteCurriculum: (s) => s.siteContent.curriculum,
    createOperatorLessonPlan: options.createHelper || (async () => ({ ok: true, createdLessonId: "cur-lp-x" })),
    operatorJobStore,
    callOperatorAi: async () => "{}",
    openAiConfigured: true,
  });
  const origRun = api.runJob;
  api.runJob = async (...args) => {
    runJobCalls += 1;
    if (typeof options.runJob === "function") return options.runJob(...args);
    return origRun(...args);
  };
  return { api, responses, getRunJobCalls: () => runJobCalls };
}

async function invokeRun(api, body) {
  await api.handle({ body }, { end: () => {} });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const jobFile = tmpJobFile();
  const operatorJobStore = createCurriculumOperatorJobStore({ localFilePath: jobFile });
  operatorJobStore.configure({ usingPostgres: false });
  await operatorJobStore.loadFromStorage();

  const storeRef = buildStoreRef();
  const hotJob = buildRunningCreateJob({
    jobId: "opjob_hot_cancel_test",
    operatorSessionId: "hot-session",
    title: "Hot bag cancel test",
  });
  storeRef.curriculumOperatorJobs = jobApi.normalizeOperatorJobStore({ jobs: [hotJob] });

  const hotApi = captureApi(storeRef, operatorJobStore);
  await invokeRun(hotApi.api, { action: "cancel", jobId: hotJob.id });
  const hotCancel = hotApi.responses.at(-1);
  assert.equal(hotCancel?.statusCode, 200);
  assert.equal(hotCancel?.body?.job?.status, "cancelled", "cancel hot-store job");

  const dedicatedId = "opjob_dedicated_only_cancel";
  const dedicatedJob = buildRunningCreateJob({
    jobId: dedicatedId,
    operatorSessionId: SESSION,
    title: "Dedicated-only cancel test",
  });
  assert.equal(storeRef.curriculumOperatorJobs.jobs.some((j) => j.id === dedicatedId), false);
  await operatorJobStore.upsertJob(dedicatedJob);

  const dedStore = buildStoreRef();
  const dedApi = captureApi(dedStore, operatorJobStore);
  await invokeRun(dedApi.api, { action: "cancel", jobId: dedicatedId });
  const dedCancel = dedApi.responses.at(-1);
  assert.equal(dedCancel?.statusCode, 200, "cancel dedicated-only job");
  assert.equal(dedCancel?.body?.job?.status, "cancelled");
  const persisted = await operatorJobStore.getJob(dedicatedId);
  assert.equal(persisted?.status, "cancelled", "dedicated row terminal cancelled");

  const resumeId = "opjob_dedicated_resume";
  const resumeJob = buildRunningCreateJob({
    jobId: resumeId,
    operatorSessionId: "resume-session",
    title: "Dedicated resume test",
  });
  await operatorJobStore.upsertJob(resumeJob);
  const resumeApi = captureApi(buildStoreRef(), operatorJobStore);
  await invokeRun(resumeApi.api, { action: "resume", jobId: resumeId });
  const resumeRes = resumeApi.responses.at(-1);
  assert.equal(resumeRes?.statusCode, 200, "resume valid dedicated-store job (not 404)");
  assert.ok(resumeRes?.body?.job?.id === resumeId);
  assert.ok(
    resumeRes?.body?.job?.status !== "running" || resumeRes?.body?.job?.log?.length > 1,
    "resume invoked runJob on dedicated-only row",
  );

  const cancelledJob = buildRunningCreateJob({
    jobId: "opjob_already_cancelled",
    operatorSessionId: "x",
    title: "Cancelled",
  });
  cancelledJob.status = "cancelled";
  await operatorJobStore.upsertJob(cancelledJob);
  const badResumeApi = captureApi(buildStoreRef(), operatorJobStore);
  await invokeRun(badResumeApi.api, { action: "resume", jobId: cancelledJob.id });
  const badResume = badResumeApi.responses.at(-1);
  assert.equal(badResume?.statusCode, 409);
  assert.equal(badResume?.body?.code, "job_not_resumable");

  const missApi = captureApi(buildStoreRef(), operatorJobStore);
  await invokeRun(missApi.api, { action: "cancel", jobId: "opjob_does_not_exist" });
  assert.equal(missApi.responses.at(-1)?.statusCode, 404);

  const unauthApi = captureApi(buildStoreRef(), operatorJobStore, {
    requireSession: () => ({ email: "not-the-owner@example.com" }),
    teachingKit: { ownerOnly: false },
  });
  await invokeRun(unauthApi.api, { action: "cancel", jobId: dedicatedId });
  assert.equal(unauthApi.responses.at(-1)?.statusCode, 403, "authorization failure");

  const guardId = "opjob_cancel_before_resume";
  const guardJob = buildRunningCreateJob({
    jobId: guardId,
    operatorSessionId: "guard-session",
    title: "Cancel before resume guard",
  });
  await operatorJobStore.upsertJob(guardJob);
  const guardApi = captureApi(buildStoreRef(), operatorJobStore);
  await invokeRun(guardApi.api, { action: "cancel", jobId: guardId });
  assert.equal(guardApi.responses.at(-1)?.body?.job?.status, "cancelled");
  await invokeRun(guardApi.api, { action: "resume", jobId: guardId });
  assert.equal(guardApi.responses.at(-1)?.statusCode, 409);
  assert.equal(guardApi.responses.at(-1)?.body?.code, "job_not_resumable", "no worker resume after cancellation");

  const postCancelStore = buildStoreRef();
  const postCancelApi = captureApi(postCancelStore, operatorJobStore);
  const title = "Post-cancel session lesson";
  const command = commandApi.parseOperatorCommand(
    `Create a complete spring planting lesson for preschoolers called "${title}". Keep unpublished.`,
    { phase: 7, confirmStagedResearchCreate: true },
  ).command;
  await invokeRun(postCancelApi.api, {
    action: "run",
    phase: 7,
    confirm: true,
    asyncCreateRun: true,
    operatorSessionId: SESSION,
    command,
  });
  const dup = postCancelApi.responses.at(-1);
  assert.notEqual(dup?.statusCode, 409, "no duplicate active session after prior job cancelled");

  assert.equal(
    runVisibility.isSessionActiveJobStatus("cancelled"),
    false,
    "cancelled is not an active session status",
  );

  console.log("Curriculum operator cancel/resume dedicated lookup checks passed.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
