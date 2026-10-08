#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const jobApi = require("./curriculum-operator-job.js");
const commandApi = require("./curriculum-operator-command.js");
const createApi = require("./curriculum-operator-create.js");
const runVisibility = require("./curriculum-operator-run-visibility.js");
const asyncDispatch = require("./curriculum-operator-async-dispatch.js");
const { createCurriculumOperatorJobStore } = require("../server/curriculum-operator-job-store.js");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

const OWNER = { email: "owner@example.com" };
const SESSION = "async-dispatch-session-001";

function tmpJobFile() {
  return path.join(os.tmpdir(), `llh-opjob-async-${crypto.randomBytes(4).toString("hex")}.json`);
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

function ownerTeachingKitStub() {
  const tk = require("./teaching-kit.js");
  return { ...tk, isTeachingKitOwnerPreviewEmail: () => true };
}

function buildConfirmedCreateCommand(title) {
  const raw = `Create a complete spring planting lesson for preschoolers called "${title}". `
    + "Include at least four activities. Keep unpublished.";
  const parsed = commandApi.parseOperatorCommand(raw, { phase: 7, confirmStagedResearchCreate: true });
  return parsed.command;
}

function captureApi(storeRef, operatorJobStore, createHelper, callOperatorAi, readStoreOverride) {
  const responses = [];
  let readCalls = 0;
  const api = createCurriculumOperatorApi({
    readJson: async (req) => req.body || {},
    jsonResponse: (_res, statusCode, body) => {
      responses.push({ statusCode, body });
    },
    readStore: () => {
      readCalls += 1;
      if (typeof readStoreOverride === "function") return readStoreOverride(storeRef, readCalls);
      return storeRef;
    },
    writeStoreAsync: async () => {},
    requireTeachingKitOwnerAdminSession: () => OWNER,
    teachingKit: ownerTeachingKitStub(),
    normalizeEmail: (v) => String(v || "").trim().toLowerCase(),
    readSiteCurriculum: (s) => s.siteContent.curriculum,
    createOperatorLessonPlan: createHelper,
    operatorJobStore,
    callOperatorAi: callOperatorAi || (async () => "{}"),
    openAiConfigured: true,
  });
  return { api, responses };
}

function makeCreateHelper(storeRef) {
  return async function createOperatorLessonPlan({ lessonPlan, adminEmail }) {
    const id = `cur-lp-${crypto.randomBytes(8).toString("hex")}`;
    const now = new Date().toISOString();
    const plan = {
      ...lessonPlan,
      id,
      status: "draft",
      plan: lessonPlan.plan === "Pro" ? "Pro" : "Free",
      activityIds: [],
      createdAt: now,
      updatedAt: now,
      lastEditedBy: adminEmail || "test",
    };
    storeRef.siteContent.curriculum.lessonPlans.push(plan);
    return { ok: true, createdLessonId: id, lessonPlan: plan, activities: [], published: false };
  };
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
  const title = "Async Dispatch QA Disposable lesson";
  const command = buildConfirmedCreateCommand(title);
  const brief = createApi.parseCreationBrief(command.rawCommand || "").brief;
  assert.ok(brief?.title);

  let aiCalls = 0;
  const delayedAi = async () => {
    aiCalls += 1;
    await sleep(60);
    const architect = require("./curriculum-operator-create-architect.js");
    return architect.buildOperatorCreateArchitectFixtureResponse("CREATE_NEW_LESSON_ARCHITECT");
  };

  const { api, responses } = captureApi(storeRef, operatorJobStore, makeCreateHelper(storeRef), delayedAi);

  await invokeRun(api, {
    action: "run",
    phase: 7,
    confirm: true,
    asyncCreateRun: true,
    operatorSessionId: SESSION,
    command,
  });

  const ack = responses.at(-1);
  assert.equal(ack?.statusCode, 202, "async acknowledgement returns 202");
  assert.ok(ack?.body?.job?.id, "immediate job id on 202");
  assert.equal(ack?.body?.job?.operatorSessionId, SESSION);

  const jobId = ack.body.job.id;
  await sleep(400);

  const finished = await operatorJobStore.getJob(jobId);
  assert.ok(finished, "dedicated store lookup after ack");
  const logs = schemaAsArray(finished.log).map((e) => e.message);
  assert.ok(
    logs.some((m) => /async worker starting runjob/i.test(String(m))),
    "worker start logged after dispatch",
  );
  assert.ok(
    ["completed", "failed", "blocked", "cancelled"].includes(String(finished.status))
      || finished.status === "running",
    "job reaches terminal or is actively running with progress",
  );
  if (finished.status === "running") {
    const progress = asyncDispatch.countLessonActionProgress(finished);
    assert.ok(
      progress.running + progress.success + progress.failed > 0,
      "no permanently running job with zero action progress",
    );
  }

  const dupApi = captureApi(storeRef, operatorJobStore, makeCreateHelper(storeRef), delayedAi);
  await invokeRun(dupApi.api, {
    action: "run",
    phase: 7,
    confirm: true,
    asyncCreateRun: true,
    operatorSessionId: SESSION,
    command,
  });
  const dup = dupApi.responses.at(-1);
  if (finished?.status === "running" || finished?.status === "planned") {
    assert.equal(dup?.statusCode, 409);
    assert.equal(dup?.body?.code, "OPERATOR_SESSION_JOB_ACTIVE");
  }

  const zombieStub = jobApi.createJobFromPlan({
    command,
    planSummary: { selectedLessonIds: [] },
    createdBy: OWNER.email,
    status: "running",
    operatorSessionId: "zombie-stub",
  });
  assert.ok(asyncDispatch.hasZeroExecutionProgress(zombieStub), "detect zero-progress running stub");
  const failedJob = asyncDispatch.buildAsyncDispatchFailureJob(zombieStub, {
    errorCode: "async_dispatch_job_unresolved",
    message: "Async worker could not resolve acknowledged job.",
    diagnostic: asyncDispatch.buildDispatchDiagnostic({
      jobId: zombieStub.id,
      errorCode: "async_dispatch_job_unresolved",
      lookupAttempts: 5,
    }),
  });
  assert.equal(failedJob.status, "failed", "dispatch failure is terminal failed");
  assert.equal(failedJob.code, "async_dispatch_job_unresolved");
  assert.ok(
    schemaAsArray(failedJob.log).some((e) => /async dispatch failed/i.test(String(e.message))),
    "dispatch failure reason logged on job",
  );

  assert.equal(
    runVisibility.shouldAcknowledgeCreateAsynchronously({
      action: "run",
      body: { confirm: true, syncCreateRun: true },
      wantsCreate: true,
    }),
    false,
    "sync test mode preserved",
  );

  const syncStore = buildStoreRef();
  const syncJobStore = createCurriculumOperatorJobStore({ localFilePath: tmpJobFile() });
  syncJobStore.configure({ usingPostgres: false });
  await syncJobStore.loadFromStorage();
  const syncApi = captureApi(syncStore, syncJobStore, makeCreateHelper(syncStore), delayedAi);
  await invokeRun(syncApi.api, {
    action: "run",
    phase: 7,
    confirm: true,
    syncCreateRun: true,
    operatorSessionId: "sync-mode-session-isolated",
    command: buildConfirmedCreateCommand("Sync Mode Disposable lesson"),
  });
  const syncRes = syncApi.responses.at(-1);
  assert.equal(syncRes?.statusCode, 200, "sync create returns 200 in test mode");

  const lookupStore = createCurriculumOperatorJobStore({ localFilePath: tmpJobFile() });
  lookupStore.configure({ usingPostgres: false });
  await lookupStore.loadFromStorage();
  const resolved = await asyncDispatch.resolveJobForAsyncDispatch(
    {
      readStore: () => buildStoreRef(),
      resolveJobById: async () => null,
      operatorJobStore: lookupStore,
    },
    { jobId: "opjob_missing", jobSnapshot: null, maxAttempts: 2, delayMs: 5 },
  );
  assert.equal(resolved.job, null);
  assert.equal(resolved.diagnostic.errorCode, "async_dispatch_job_unresolved");

  const viaDedicated = await asyncDispatch.resolveJobForAsyncDispatch(
    {
      readStore: () => buildStoreRef(),
      resolveJobById: async () => null,
      operatorJobStore,
    },
    { jobId, jobSnapshot: null, maxAttempts: 2, delayMs: 5 },
  );
  assert.equal(viaDedicated.job?.id, jobId, "worker lookup through dedicated store");

  console.log("Curriculum operator async dispatch checks passed.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

function schemaAsArray(value) {
  return Array.isArray(value) ? value : [];
}
