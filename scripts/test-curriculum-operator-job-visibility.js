#!/usr/bin/env node
/**
 * Durable early operator job ack + session lookup for long confirmed create.
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const jobApi = require("./curriculum-operator-job.js");
const createApi = require("./curriculum-operator-create.js");
const commandApi = require("./curriculum-operator-command.js");
const runVisibility = require("./curriculum-operator-run-visibility.js");
const { createCurriculumOperatorJobStore } = require("../server/curriculum-operator-job-store.js");
const { createCurriculumOperatorApi } = require("../server/curriculum-operator.js");

const OWNER = { email: "owner@example.com" };
const SESSION = "visibility-session-qa-001";

function tmpJobFile() {
  return path.join(os.tmpdir(), `llh-opjob-vis-${crypto.randomBytes(4).toString("hex")}.json`);
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
  return {
    ...tk,
    isTeachingKitOwnerPreviewEmail: () => true,
  };
}

function captureApi(storeRef, operatorJobStore, createHelper, callOperatorAi) {
  const responses = [];
  const api = createCurriculumOperatorApi({
    readJson: async (req) => req.body || {},
    jsonResponse: (_res, statusCode, body) => {
      responses.push({ statusCode, body });
    },
    readStore: () => storeRef,
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

function buildConfirmedCreateCommand(title) {
  const raw = `Create a complete spring planting lesson for preschoolers called "${title}". `
    + "Include at least four activities. Keep unpublished.";
  const parsed = commandApi.parseOperatorCommand(raw, { phase: 7, confirmStagedResearchCreate: true });
  return parsed.command;
}

async function invokeRun(api, body) {
  await api.handle({ body }, { end: () => {} });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  assert.equal(
    runVisibility.shouldAcknowledgeCreateAsynchronously({
      action: "run",
      body: { confirm: true, asyncCreateRun: true },
      wantsCreate: true,
    }),
    true,
  );
  assert.equal(
    runVisibility.shouldAcknowledgeCreateAsynchronously({
      action: "run",
      body: { confirm: true, syncCreateRun: true },
      wantsCreate: true,
    }),
    false,
  );

  const jobFile = tmpJobFile();
  const operatorJobStore = createCurriculumOperatorJobStore({ localFilePath: jobFile });
  operatorJobStore.configure({ usingPostgres: false });
  await operatorJobStore.loadFromStorage();

  const storeRef = buildStoreRef();
  const title = "Visibility QA Disposable lesson";
  const command = buildConfirmedCreateCommand(title);
  const brief = createApi.parseCreationBrief(command.rawCommand || "").brief;
  assert.ok(brief?.title);

  let aiCalls = 0;
  const delayedAi = async () => {
    aiCalls += 1;
    await sleep(80);
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
  assert.equal(ack?.statusCode, 202, "confirmed create returns 202 ack");
  assert.ok(ack?.body?.job?.id, "job id exposed immediately");
  assert.equal(ack?.body?.publishEnabled, false);
  assert.equal(ack?.body?.published, false);
  assert.equal(ack?.body?.job?.operatorSessionId, SESSION);

  const jobId = ack.body.job.id;
  const listRes = [];
  const listApi = captureApi(storeRef, operatorJobStore, makeCreateHelper(storeRef), delayedAi);
  await invokeRun(listApi.api, { action: "list" });
  const listBody = listApi.responses.at(-1)?.body;
  assert.ok(listBody?.jobs?.some((j) => j.id === jobId), "job visible in list immediately");

  const sessionApi = captureApi(storeRef, operatorJobStore, makeCreateHelper(storeRef), delayedAi);
  await invokeRun(sessionApi.api, { action: "job_by_session", operatorSessionId: SESSION });
  const sessionBody = sessionApi.responses.at(-1)?.body;
  assert.ok(sessionBody?.jobs?.some((j) => j.id === jobId), "job_by_session resolves job");

  const dedicated = await operatorJobStore.getJob(jobId);
  assert.ok(dedicated?.id === jobId, "dedicated store retains job after ack");

  await sleep(250);
  const finished = await operatorJobStore.getJob(jobId);
  assert.ok(["completed", "failed", "blocked", "cancelled"].includes(String(finished?.status || ""))
    || finished?.status === "running", "job progresses after async run");

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

  const failStore = buildStoreRef();
  const failJobStore = createCurriculumOperatorJobStore({ localFilePath: tmpJobFile() });
  failJobStore.configure({ intendedPostgres: true, pool: null });
  await failJobStore.loadFromStorage();
  const failApi = captureApi(failStore, failJobStore, makeCreateHelper(failStore), delayedAi);
  await invokeRun(failApi.api, {
    action: "run",
    phase: 7,
    confirm: true,
    asyncCreateRun: true,
    operatorSessionId: "fail-session",
    command,
  });
  const failRes = failApi.responses.at(-1);
  assert.equal(failRes?.statusCode, 503);
  assert.equal(failRes?.body?.code, "operator_job_backend_not_ready");
  assert.equal(failStore.siteContent.curriculum.lessonPlans.length, 0, "no partial lesson on persist failure");

  console.log("Curriculum operator job visibility checks passed.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
