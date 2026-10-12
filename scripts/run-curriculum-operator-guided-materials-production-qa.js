#!/usr/bin/env node
/**
 * Live production QA — guided materials Halloween disposable draft (parse → confirm → create).
 * Requires LLH_SMOKE_ADMIN_* and LLH_EXPECTED_COMMIT_SHA.
 */
"use strict";

const crypto = require("crypto");
const https = require("https");
const fs = require("fs");
const path = require("path");
const schema = require("./curriculum-operator-schema.js");
const guidedFixture = require("./curriculum-operator-guided-materials-e2e-fixture.js");
const guided = require("./curriculum-operator-guided-materials.js");
const ageSafety = require("./curriculum-operator-guided-age-safety.js");
const { parseQaHttpTimeoutMs } = require("./curriculum-operator-qa-http-timeout.js");
const qaJobPoll = require("./curriculum-operator-qa-job-poll.js");

const BASE = process.env.LLH_PROD_BASE || "https://littlelearnershubbyleah.com";
const HTTP_TIMEOUT_MS = parseQaHttpTimeoutMs();
const EXPECTED_SHA = String(process.env.LLH_EXPECTED_COMMIT_SHA || "").slice(0, 7);
const SESSION = `guided-materials-prod-qa-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const OUT_DIR = process.env.LLH_QA_OUT || "/opt/cursor/artifacts/guided-materials-prod-qa";
const PHASE = 7;

const EMAIL = process.env.LLH_SMOKE_ADMIN_EMAIL;
const PASSWORD = process.env.LLH_SMOKE_ADMIN_PASSWORD;
const CODE = process.env.LLH_SMOKE_ADMIN_ACCESS_CODE;

function req(method, urlPath, body, token) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + urlPath);
    const r = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
      timeout: HTTP_TIMEOUT_MS,
    }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { raw: raw.slice(0, 400) }; }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function isLegacyGuidedQaDraftTitle(title) {
  return /^Guided Materials QA Disposable guided-materials-prod-qa-/i.test(String(title || "").trim());
}

function isGuidedQaDraftTitle(title) {
  return guidedFixture.isDisposableGuidedMaterialsQaTitle(title) || isLegacyGuidedQaDraftTitle(title);
}

async function cleanupGuidedQaDrafts(token) {
  const site = await req("GET", "/api/admin/site-content", null, token);
  const curriculum = site.json?.curriculum || site.json?.siteContent?.curriculum || {};
  const stamp = site.json?.siteContent?.updatedAt || site.json?.updatedAt || "";
  const drafts = (curriculum.lessonPlans || []).filter(
    (p) => p && p.status === "draft" && isGuidedQaDraftTitle(p.title),
  );
  const removed = [];
  for (const plan of drafts) {
    const del = await req("POST", "/api/admin/curriculum/lesson-plans/delete", {
      lessonPlanId: plan.id,
      confirmTitle: schema.text(plan.title, 280),
      expectedUpdatedAt: stamp,
    }, token);
    if (del.status === 200 && del.json?.ok !== false) {
      removed.push({ id: plan.id, title: plan.title });
    }
  }
  return removed;
}

function fail(report, name, detail) {
  report.blocked = true;
  report.blockReason = name;
  report.detail = detail || null;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: "BLOCKED", reason: name, detail }, null, 2));
  process.exit(1);
}

async function main() {
  if (!EMAIL || !PASSWORD || !CODE) {
    console.error("Missing LLH_SMOKE_ADMIN_* credentials");
    process.exit(2);
  }
  if (!EXPECTED_SHA) {
    console.error("Set LLH_EXPECTED_COMMIT_SHA");
    process.exit(2);
  }
  const disposableTitle = guidedFixture.buildDisposableGuidedQaTitle(SESSION);
  const command = guidedFixture.buildGuidedCreateCommand(disposableTitle);
  const report = { base: BASE, session: SESSION, disposableTitle, checks: [] };
  const ok = (name, cond, detail) => {
    report.checks.push({ name, ok: Boolean(cond), detail: detail || null });
    if (!cond) fail(report, name, detail);
  };

  const health = await req("GET", "/api/health");
  ok("health_ok", health.status === 200 && health.json?.ok === true);
  ok("launch_ready", health.json?.launchReady === true);
  const build = await req("GET", "/api/build-version");
  ok("build_version_commit", String(build.json?.commit || "").startsWith(EXPECTED_SHA), {
    expected: EXPECTED_SHA,
    actual: build.json?.commit,
  });

  const login = await req("POST", "/api/admin/login", { email: EMAIL, password: PASSWORD, code: CODE });
  ok("admin_login", login.status === 200 && login.json?.token);
  const token = login.json.token;

  const jobsList = await req("POST", "/api/admin/curriculum/operator", { action: "list" }, token);
  const activeJobs = (jobsList.json?.jobs || []).filter((j) => qaJobPoll.isActiveJobStatus(j.status));
  ok("zero_active_mutation_jobs", activeJobs.length === 0, { activeJobIds: activeJobs.map((j) => j.id) });

  const cleaned = await cleanupGuidedQaDrafts(token);
  report.preCleanupRemoved = cleaned;
  const siteAfterCleanup = await req("GET", "/api/admin/site-content", null, token);
  const curAfter = siteAfterCleanup.json?.curriculum || siteAfterCleanup.json?.siteContent?.curriculum || {};
  const remainingGuided = (curAfter.lessonPlans || []).filter(
    (p) => p && p.status === "draft" && isGuidedQaDraftTitle(p.title),
  );
  ok("zero_guided_qa_drafts_before_run", remainingGuided.length === 0, {
    remaining: remainingGuided.map((p) => ({ id: p.id, title: p.title })),
  });

  const parse = await req("POST", "/api/admin/curriculum/operator", {
    action: "parse",
    phase: PHASE,
    command,
    operatorSessionId: SESSION,
    requestId: `guided-parse-${SESSION}`,
  }, token);
  ok("parse_http_200", parse.status === 200);
  ok("guided_understanding", Boolean(parse.json?.guidedUnderstanding?.text?.includes("Here is what I understood")));
  ok("guided_confirmation_required", parse.json?.requiresGuidedConfirmation === true
    || (parse.json?.confirmReasons || []).includes(guided.GUIDED_CONFIRM_REASON));

  const unconfirmed = await req("POST", "/api/admin/curriculum/operator", {
    action: "run",
    phase: PHASE,
    command,
    operatorSessionId: SESSION,
  }, token);
  ok("unconfirmed_run_blocked", unconfirmed.status === 409 || unconfirmed.json?.awaitingConfirm === true, {
    status: unconfirmed.status,
    code: unconfirmed.json?.code,
  });

  const createRun = await req("POST", "/api/admin/curriculum/operator", {
    action: "run",
    phase: PHASE,
    command,
    confirm: true,
    operatorSessionId: SESSION,
  }, token);
  ok("confirmed_create_http", createRun.status === 200 || createRun.status === 202, {
    status: createRun.status,
    error: createRun.json?.error,
  });
  const jobId = createRun.json?.job?.id;
  ok("job_id_present", Boolean(jobId));

  const deadlineMs = Date.now() + HTTP_TIMEOUT_MS;
  let createSummary = null;
  while (Date.now() < deadlineMs) {
    const get = await req("POST", "/api/admin/curriculum/operator", { action: "get", jobId }, token);
    const job = get.json?.job;
    createSummary = qaJobPoll.summarizeCreateJob(job);
    if (qaJobPoll.isTerminalJobStatus(createSummary.jobStatus)) break;
    await new Promise((r) => setTimeout(r, 15000));
  }
  ok("job_terminal", qaJobPoll.isTerminalJobStatus(createSummary?.jobStatus), createSummary);
  ok("lesson_created", qaJobPoll.createJobSucceeded(createSummary), createSummary);

  const lr = schema.asArray(createSummary?.lessonResults)[0] || {};
  ok("publish_false", lr?.published === false);
  ok("owner_review_ready", createSummary?.ownerReviewStatus === "READY_FOR_OWNER_REVIEW", {
    status: createSummary?.ownerReviewStatus,
  });
  ok("content_persistence_complete", createSummary?.contentPersistenceIncomplete !== true);
  ok("ready_gates", ageSafety.readyForOwnerReviewGates({
    ownerReviewStatus: createSummary?.ownerReviewStatus,
    contentPersistenceIncomplete: createSummary?.contentPersistenceIncomplete,
    printableOk: true,
    imagesOk: true,
  }));

  const lessonId = createSummary.createdLessonId;
  const site = await req("GET", "/api/admin/site-content", null, token);
  const curriculum = site.json?.curriculum || site.json?.siteContent?.curriculum || {};
  const plan = (curriculum.lessonPlans || []).find((p) => p.id === lessonId);
  ok("plan_draft", plan?.status === "draft");
  ok("supplied_activities_present", (curriculum.activities || []).filter((a) => a.lessonPlanId === lessonId).length >= 4);
  ok("book_or_printable_signal", (curriculum.resources || []).some((r) => /pumpkin|spider|Room/i.test(r.title || ""))
    || schema.asArray(plan?.enrichmentDraft?.week?.printableIds).length >= 1);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "REPORT.json"), JSON.stringify({ ...report, verdict: "PASS", lessonId }, null, 2));
  console.log(JSON.stringify({ verdict: "PASS", lessonId, jobId }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
