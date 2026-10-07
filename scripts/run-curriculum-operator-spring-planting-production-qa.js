#!/usr/bin/env node
/**
 * Live production QA — Spring Planting operator flow (disposable draft lesson only).
 * Requires LLH_SMOKE_ADMIN_* and optional LLH_PROD_BASE.
 */
"use strict";

const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const fixture = require("./curriculum-operator-spring-planting-e2e-fixture.js");
const createApi = require("./curriculum-operator-create.js");
const commandApi = require("./curriculum-operator-command.js");
const auditApi = require("./curriculum-operator-audit.js");
const imagesApi = require("./curriculum-operator-images.js");
const printablesApi = require("./curriculum-operator-printables.js");
const schema = require("./curriculum-operator-schema.js");
const prepApi = require("./curriculum-operator-production-qa-live-prep.js");
const { parseQaHttpTimeoutMs } = require("./curriculum-operator-qa-http-timeout.js");
const qaJobPoll = require("./curriculum-operator-qa-job-poll.js");
const qaCleanup = require("./curriculum-operator-qa-disposable-cleanup.js");

const BASE = process.env.LLH_PROD_BASE || "https://littlelearnershubbyleah.com";
const HTTP_TIMEOUT_MS = parseQaHttpTimeoutMs();
const CREATE_SUBMIT_TIMEOUT_MS = qaJobPoll.parseCreateSubmitTimeoutMs();
const EXPECTED_SHA = String(process.env.LLH_EXPECTED_COMMIT_SHA || "259fe94").slice(0, 7);
const SESSION = `spring-planting-prod-qa-${Date.now()}`;
const OUT_DIR = process.env.LLH_QA_OUT || "/opt/cursor/artifacts/spring-planting-prod-qa";
const PHASE = 7;

const EMAIL = process.env.LLH_SMOKE_ADMIN_EMAIL;
const PASSWORD = process.env.LLH_SMOKE_ADMIN_PASSWORD;
const CODE = process.env.LLH_SMOKE_ADMIN_ACCESS_CODE;

const BAD_IMAGE = "https://example.com/cartoon-clipart-spring-theme.png";

function req(method, urlPath, body, token, options = {}) {
  const payload = body == null ? null : JSON.stringify(body);
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : HTTP_TIMEOUT_MS;
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
      timeout: timeoutMs,
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
    r.on("timeout", () => r.destroy(new Error("request timeout")));
    if (payload) r.write(payload);
    r.end();
  });
}

function readCurriculum(siteJson) {
  const root = siteJson && typeof siteJson === "object" ? siteJson : {};
  const nested = root.siteContent && typeof root.siteContent === "object" ? root.siteContent : {};
  return root.curriculum || nested.curriculum || {};
}

function publishedScopeFingerprint(curriculum) {
  const plans = (curriculum.lessonPlans || []).filter((p) => p && p.status === "published");
  const resources = (curriculum.resources || []).filter((r) => {
    const ids = (r.lessonPlanIds || []).map(String);
    return ids.some((id) => plans.some((p) => p.id === id));
  });
  const payload = {
    published: plans.map((p) => ({
      id: p.id,
      title: p.title,
      coverImageUrl: p.coverImageUrl,
      resourceIds: p.resourceIds,
      week: p.enrichmentDraft?.week,
    })),
    resources: resources.map((r) => ({ id: r.id, title: r.title, fileName: r.fileName })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function countSpringDrafts(curriculum) {
  return (curriculum.lessonPlans || []).filter((p) => p.status === "draft" && /spring planting/i.test(p.title || "")).length;
}

function orderedActivityIds(curriculum, lessonId) {
  const plan = (curriculum.lessonPlans || []).find((p) => p.id === lessonId);
  const acts = (curriculum.activities || []).filter((a) => a.lessonPlanId === lessonId);
  const fromPlan = schema.asArray(plan?.activityIds).filter(Boolean);
  if (fromPlan.length) return fromPlan;
  return acts.map((a) => a.id);
}

function activityIdFromPrintableResource(resource) {
  const match = String(resource?.description || "").match(/Operator activityId=([^\s\n]+)/);
  return match ? match[1] : "";
}

async function loadSite(token) {
  const site = await req("GET", "/api/admin/site-content", null, token);
  const curriculum = readCurriculum(site.json);
  return { site, curriculum, stamp: prepApi.siteContentStamp(site.json) };
}

async function saveEnrichmentDraft(token, stamp, lessonId, enrichmentDraft) {
  return req("POST", "/api/admin/curriculum/lesson-plans", {
    expectedUpdatedAt: stamp,
    saveMode: "enrichment_draft",
    lessonPlan: { id: lessonId, enrichmentDraft },
  }, token);
}

async function operatorListJobs(token) {
  const list = await req("POST", "/api/admin/curriculum/operator", { action: "list" }, token);
  return schema.asArray(list.json?.jobs);
}

async function operatorGetJob(token, jobId) {
  const get = await req("POST", "/api/admin/curriculum/operator", { action: "get", jobId }, token);
  if (get.status !== 200 || !get.json?.job) return null;
  return get.json.job;
}

async function operatorSessionContext(token, operatorSessionId) {
  const res = await req("POST", "/api/admin/curriculum/operator", {
    action: "context_get",
    operatorSessionId,
  }, token);
  return res.json?.context || null;
}

async function operatorJobsBySession(token, operatorSessionId) {
  const res = await req("POST", "/api/admin/curriculum/operator", {
    action: "job_by_session",
    operatorSessionId,
  }, token);
  return schema.asArray(res.json?.jobs);
}

/**
 * Submit confirmed create with a short HTTP timeout, then poll operator jobs by session/title
 * until terminal or the overall QA deadline (LLH_QA_HTTP_TIMEOUT_MS).
 */
async function runConfirmedCreateWithPolling(token, report, {
  operatorSessionId,
  disposableTitle,
  explicitCreateCommand,
  deadlineMs,
}) {
  const createBody = {
    action: "run",
    phase: PHASE,
    confirm: true,
    command: explicitCreateCommand,
    operatorSessionId,
  };
  const startedMs = Date.now();
  report.createJobFlow = {
    operatorSessionId,
    disposableTitle,
    createSubmitTimeoutMs: CREATE_SUBMIT_TIMEOUT_MS,
    pollDeadlineMs: deadlineMs,
    submitHttpStatus: null,
    submitError: null,
    submitJobId: null,
    resolvedVia: null,
    polled: false,
  };

  let submitResponse = null;
  try {
    submitResponse = await req("POST", "/api/admin/curriculum/operator", createBody, token, {
      timeoutMs: CREATE_SUBMIT_TIMEOUT_MS,
    });
    report.createJobFlow.submitHttpStatus = submitResponse.status;
    if (submitResponse.json?.job?.id) {
      report.createJobFlow.submitJobId = submitResponse.json.job.id;
    }
    if ((submitResponse.status === 200 || submitResponse.status === 202) && submitResponse.json?.job) {
      const summary = qaJobPoll.summarizeCreateJob(submitResponse.json.job);
      if (qaJobPoll.isTerminalJobStatus(summary.jobStatus)) {
        report.createJobFlow.resolvedVia = "create_http_response";
        return { job: submitResponse.json.job, summary, createRun: submitResponse };
      }
      if (submitResponse.status === 202) {
        report.createJobFlow.resolvedVia = "create_http_202_ack";
      }
    }
  } catch (err) {
    report.createJobFlow.submitError = String(err?.message || err);
    if (!/timeout|ECONNRESET|socket hang up/i.test(report.createJobFlow.submitError)) {
      throw err;
    }
  }

  report.createJobFlow.polled = true;
  const pollResult = await qaJobPoll.resolveAndPollCreateJob({
    listJobs: () => operatorListJobs(token),
    getJob: (jobId) => operatorGetJob(token, jobId),
    getSessionContext: () => operatorSessionContext(token, operatorSessionId),
    listSessionJobs: () => operatorJobsBySession(token, operatorSessionId),
    operatorSessionId,
    disposableTitle,
    deadlineMs,
  });
  report.createJobFlow.pollResult = {
    ok: pollResult.ok,
    code: pollResult.code || null,
    resolvedVia: pollResult.resolvedVia || null,
    lastCandidateIds: schema.asArray(pollResult.lastCandidates).map((row) => row.id).filter(Boolean),
  };

  if (pollResult.ok && pollResult.job) {
    report.createJobFlow.resolvedVia = pollResult.resolvedVia;
    return {
      job: pollResult.job,
      summary: pollResult.summary,
      createRun: { status: 200, json: { ok: true, job: pollResult.job, published: false, publishEnabled: false } },
    };
  }

  let draftLessonHint = null;
  try {
    const { curriculum: curAfterPoll } = await loadSite(token);
    const draftByTitle = (curAfterPoll.lessonPlans || []).find(
      (p) => schema.text(p?.title, 280) === disposableTitle,
    );
    if (draftByTitle) {
      draftLessonHint = {
        lessonId: draftByTitle.id,
        exactTitle: draftByTitle.title,
        verified: qaCleanup.verifyDisposableQaLessonIdentity(draftByTitle, {
          lessonId: draftByTitle.id,
          exactTitle: disposableTitle,
        }),
      };
    }
  } catch {
    draftLessonHint = null;
  }
  fail(report, "confirmed_create_job_unresolved", {
    operatorSessionId,
    disposableTitle,
    elapsedMs: Date.now() - startedMs,
    pollDeadlineMs: deadlineMs,
    poll: pollResult,
    draftLessonHint,
  });
}

function fail(report, reason, detail) {
  report.blocked = true;
  report.blockReason = reason;
  if (detail) report.detail = detail;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: "BLOCKED", reason, detail }, null, 2));
  process.exit(1);
}

async function main() {
  if (!EMAIL || !PASSWORD || !CODE) {
    console.error("Missing LLH_SMOKE_ADMIN_* credentials");
    process.exit(2);
  }
  const disposableTitle = fixture.buildDisposableSpringPlantingQaTitle(SESSION);
  const explicitCreateCommand = fixture.buildExplicitCreateCommand(disposableTitle);
  const report = { base: BASE, session: SESSION, disposableTitle, checks: [] };
  const ok = (name, cond, detail) => {
    report.checks.push({ name, ok: Boolean(cond), detail: detail || null });
    if (!cond) fail(report, name, detail);
  };

  const health = await req("GET", "/api/health");
  ok("health_ok", health.status === 200 && health.json?.ok === true, health.json);
  ok("launch_ready", health.json?.launchReady === true, { launchReady: health.json?.launchReady });

  const build = await req("GET", "/api/build-version");
  report.buildVersion = build.json;
  ok("build_version_commit", String(build.json?.commit || "").startsWith(EXPECTED_SHA), {
    expected: EXPECTED_SHA,
    actual: build.json?.commit,
  });

  const login = await req("POST", "/api/admin/login", { email: EMAIL, password: PASSWORD, code: CODE });
  ok("admin_login", login.status === 200 && login.json?.token, { status: login.status });
  const token = login.json.token;

  let { curriculum, stamp } = await loadSite(token);
  const scopeBefore = publishedScopeFingerprint(curriculum);
  const springDraftsBefore = countSpringDrafts(curriculum);

  const parse = await req("POST", "/api/admin/curriculum/operator", {
    action: "parse",
    phase: PHASE,
    command: fixture.EXACT_COMMAND,
    operatorSessionId: SESSION,
    requestId: `prod-spring-${SESSION}`,
  }, token);
  ok("parse_http_200", parse.status === 200, { status: parse.status, code: parse.json?.code });
  ok("research_then_create", parse.json?.command?.intent === "research_then_create", parse.json?.command?.intent);
  ok("research_sources_present", schema.asArray(parse.json?.conversationContext?.researchSources).length >= 1,
    { count: schema.asArray(parse.json?.conversationContext?.researchSources).length });

  const blocked = await req("POST", "/api/admin/curriculum/operator", {
    action: "run",
    phase: PHASE,
    command: fixture.EXACT_COMMAND,
    operatorSessionId: SESSION,
  }, token);
  ok("unconfirmed_run_409", blocked.status === 409, { status: blocked.status, code: blocked.json?.code });

  ({ curriculum, stamp } = await loadSite(token));
  ok("no_lesson_before_confirm", countSpringDrafts(curriculum) === springDraftsBefore,
    { before: springDraftsBefore, after: countSpringDrafts(curriculum) });

  const createParse = commandApi.parseOperatorCommand(explicitCreateCommand, { phase: PHASE });
  ok("create_intent", createParse.command?.intent === "create_lesson", { intent: createParse.command?.intent });
  const createBrief = createApi.parseCreationBrief(explicitCreateCommand).brief;
  ok("create_brief_title", createBrief.title === disposableTitle, {
    expected: disposableTitle,
    actual: createBrief.title,
  });
  ok("create_brief_theme", /spring planting/i.test(String(createBrief.theme || createBrief.title || "")),
    { theme: createBrief.theme, title: createBrief.title });
  ok("create_explicit_printable", schema.asArray(createBrief.explicitPrintables).length >= 1
    && /Seed Growth Sequencing Cards/i.test(createBrief.explicitPrintables[0].title || ""),
    { explicitPrintables: createBrief.explicitPrintables });
  const titleCollision = (curriculum.lessonPlans || []).some(
    (p) => String(p.title || "").trim().toLowerCase() === disposableTitle.trim().toLowerCase(),
  );
  ok("no_title_collision_before_create", !titleCollision, { disposableTitle });

  const preCreateJobs = await operatorListJobs(token);
  const activeForSession = qaJobPoll.findActiveQaSessionJobs(preCreateJobs, {
    operatorSessionId: SESSION,
    disposableTitle,
  });
  ok("no_active_qa_job_for_session", activeForSession.length === 0, {
    operatorSessionId: SESSION,
    activeJobIds: activeForSession.map((row) => row.id),
  });

  const createDeadlineMs = Date.now() + HTTP_TIMEOUT_MS;
  const createOutcome = await runConfirmedCreateWithPolling(token, report, {
    operatorSessionId: SESSION,
    disposableTitle,
    explicitCreateCommand,
    deadlineMs: createDeadlineMs,
  });
  const createRun = createOutcome.createRun;
  const job = createOutcome.job;
  const createSummary = createOutcome.summary;
  report.createJob = createSummary;

  ok("confirmed_create_terminal", qaJobPoll.isTerminalJobStatus(createSummary.jobStatus), createSummary);
  ok("confirmed_create_200", createRun.status === 200 || createRun.status === 202, {
    status: createRun.status,
    error: createRun.json?.error,
    jobId: createSummary.jobId,
    jobStatus: createSummary.jobStatus,
    resolvedVia: report.createJobFlow?.resolvedVia,
  });
  const lr = job?.lessonResults?.[0];
  ok("publish_false", createRun.json?.published === false && createRun.json?.publishEnabled === false);
  ok("research_context_on_job", schema.asArray(lr?.creationBrief?.researchContext).length >= 1);
  const lessonCreatedDetail = {
    jobStatus: createSummary.jobStatus,
    jobId: createSummary.jobId,
    lrStatus: createSummary.lrStatus,
    code: createSummary.code,
    error: createSummary.error,
    activityRepairCalls: createSummary.activityRepairCalls,
    activityExpansionCalls: createSummary.activityExpansionCalls,
    batchState: createSummary.batchState,
    createdLessonId: createSummary.createdLessonId,
    ownerReviewStatus: createSummary.ownerReviewStatus,
  };
  if (!qaJobPoll.createJobSucceeded(createSummary)) {
    const maybePlan = qaCleanup.findLessonPlanByExactId(curriculum, createSummary.createdLessonId || "")
      || (curriculum.lessonPlans || []).find((p) => schema.text(p?.title, 280) === disposableTitle);
    lessonCreatedDetail.cleanupHint = maybePlan ? {
      lessonId: maybePlan.id,
      exactTitle: maybePlan.title,
      verified: qaCleanup.verifyDisposableQaLessonIdentity(maybePlan, {
        lessonId: maybePlan.id,
        exactTitle: disposableTitle,
      }),
    } : null;
  }
  ok("lesson_created", qaJobPoll.createJobSucceeded(createSummary), lessonCreatedDetail);
  ok("lesson_draft", lr?.published === false);
  ok("no_content_persistence_incomplete", lr?.contentPersistenceIncomplete !== true && job?.contentPersistenceIncomplete !== true);
  ok("owner_review_ready", lr?.ownerReviewStatus === "READY_FOR_OWNER_REVIEW"
    || lr?.ownerReviewStatus === "PARTIAL");

  const lessonId = createSummary.createdLessonId;
  ({ curriculum, stamp } = await loadSite(token));
  ok("one_new_spring_draft", countSpringDrafts(curriculum) === springDraftsBefore + 1);
  ok("published_scope_unchanged", publishedScopeFingerprint(curriculum) === scopeBefore);

  const plan = (curriculum.lessonPlans || []).find((p) => p.id === lessonId);
  ok("plan_status_draft", plan?.status === "draft");

  const seqResource = (curriculum.resources || []).find(
    (r) => /seed growth/i.test(r.title) && (r.lessonPlanIds || []).includes(lessonId),
  );
  ok("seed_growth_printable", Boolean(seqResource), { titles: (curriculum.resources || []).map((r) => r.title).slice(0, 5) });
  ok("printable_week_ids", schema.asArray(plan?.enrichmentDraft?.week?.printableIds).includes(seqResource?.id)
    || schema.asArray(plan?.resourceIds).includes(seqResource?.id));
  ok("printable_activity_link", Boolean(activityIdFromPrintableResource(seqResource)));

  const fileRes = await req(
    "GET",
    `/api/admin/curriculum/resources/file?id=${encodeURIComponent(seqResource.id)}`,
    null,
    token,
  );
  const fileData = fileRes.json?.resource?.fileData || "";
  ok("printable_file_http", fileRes.status === 200 && fileData.length > 400, { status: fileRes.status, len: fileData.length });
  const pdfBuf = Buffer.from(String(fileData).replace(/^data:application\/pdf;base64,/, ""), "base64");
  const validated = await printablesApi.validateGeneratedPdf(pdfBuf, { fileName: seqResource.fileName });
  ok("printable_pdf_valid", validated.ok, validated.failed);
  ok("printable_letter_size", validated.checks.some((c) => c.code === "letter_size" && c.ok));

  const actIds = orderedActivityIds(curriculum, lessonId);
  ok("four_activities", actIds.length >= 4);
  const goodUrl = (() => {
    const a = (curriculum.activities || []).find((x) => x.id === actIds[0]);
    return a?.setupImageUrl || plan?.enrichmentDraft?.activities?.[actIds[0]]?.setupImageUrl || "";
  })();
  const controlUrl = (() => {
    const a = (curriculum.activities || []).find((x) => x.id === actIds[3]);
    return a?.setupImageUrl || plan?.enrichmentDraft?.activities?.[actIds[3]]?.setupImageUrl || "";
  })();

  const draftPatch = { activities: {} };
  draftPatch.activities[actIds[0]] = { setupImageUrl: goodUrl };
  draftPatch.activities[actIds[1]] = { setupImageUrl: BAD_IMAGE };
  draftPatch.activities[actIds[2]] = { setupImageUrl: null, setupMediaAssetId: null, setupImageThumbUrl: null };
  draftPatch.activities[actIds[3]] = { setupImageUrl: controlUrl };
  const seedSave = await saveEnrichmentDraft(token, stamp, lessonId, draftPatch);
  ok("image_seed_save", seedSave.status === 200, { status: seedSave.status, code: seedSave.json?.code });
  ({ curriculum, stamp } = await loadSite(token));
  const planForAudit = (curriculum.lessonPlans || []).find((p) => p.id === lessonId);
  const actsForAudit = (curriculum.activities || []).filter((a) => a.lessonPlanId === lessonId);
  const audit = auditApi.auditLesson(planForAudit, curriculum, {
    command: { actions: { replaceBadImages: true, keepGoodImages: true, generateImages: true } },
  });
  const imagePlan = imagesApi.buildImageActionsFromAudit(planForAudit, actsForAudit, audit, {
    replaceBadImages: true,
    keepGoodImages: true,
    command: { actions: { replaceBadImages: true, keepGoodImages: true, generateImages: true } },
  });
  const byAct = Object.fromEntries(imagePlan.map((row) => [row.activityId, row]));
  ok("audit_keep", byAct[actIds[0]]?.decision === "KEEP");
  ok("audit_replace", byAct[actIds[1]]?.decision === "REPLACE");
  ok("audit_generate", byAct[actIds[2]]?.decision === "GENERATE");
  ok("audit_control_keep", byAct[actIds[3]]?.decision === "KEEP");

  const imageRun = await req("POST", "/api/admin/curriculum/operator", {
    action: "run",
    phase: PHASE,
    currentlySelectedLessonId: lessonId,
    command: `For ${planForAudit.title}, keep the good activity pictures, replace pictures that look wrong, and generate missing activity pictures. Do not change lesson wording, printables, songs, books, or the cover.`,
  }, token);
  ok("image_run_200", imageRun.status === 200, { status: imageRun.status, error: imageRun.json?.error });
  ({ curriculum } = await loadSite(token));
  const afterActs = (curriculum.activities || []).filter((a) => a.lessonPlanId === lessonId);
  const draftActs = (curriculum.lessonPlans || []).find((p) => p.id === lessonId)?.enrichmentDraft?.activities || {};
  const url = (id) => draftActs[id]?.setupImageUrl || afterActs.find((a) => a.id === id)?.setupImageUrl || "";
  ok("good_image_unchanged", url(actIds[0]) === goodUrl);
  ok("bad_image_replaced", url(actIds[1]) !== BAD_IMAGE);
  ok("missing_image_generated", Boolean(url(actIds[2])) && !/^https:\/\/example\.com\/cartoon/.test(url(actIds[2])));
  ok("control_image_unchanged", url(actIds[3]) === controlUrl);

  const snapBeforePrintable = JSON.stringify(plan?.objectives);
  const printableParsed = commandApi.parseOperatorCommand(fixture.FOLLOW_UP_COMMANDS[1], {
    phase: PHASE,
    lessonPlans: curriculum.lessonPlans,
    currentlySelectedLessonId: lessonId,
  });
  ok("printable_follow_primary", printableParsed.interpretation?.primary === "PRINTABLE_WORK");
  const printableRun = await req("POST", "/api/admin/curriculum/operator", {
    action: "run",
    phase: PHASE,
    currentlySelectedLessonId: lessonId,
    command: fixture.FOLLOW_UP_COMMANDS[1],
  }, token);
  ok("printable_follow_200", printableRun.status === 200);
  ({ curriculum } = await loadSite(token));
  const planAfterPrint = (curriculum.lessonPlans || []).find((p) => p.id === lessonId);
  ok("printable_follow_objectives", JSON.stringify(planAfterPrint?.objectives) === snapBeforePrintable);

  const act3Id = actIds[2];
  const parsedImg = commandApi.parseOperatorCommand(fixture.FOLLOW_UP_COMMANDS[3], {
    phase: PHASE,
    lessonPlans: curriculum.lessonPlans,
    activities: afterActs,
    currentlySelectedLessonId: lessonId,
  });
  ok("act3_image_repair_intent", parsedImg.interpretation?.primary === "ACTIVITY_IMAGE_REPAIR");
  const act3Run = await req("POST", "/api/admin/curriculum/operator", {
    action: "run",
    phase: PHASE,
    currentlySelectedLessonId: lessonId,
    command: fixture.FOLLOW_UP_COMMANDS[3],
  }, token);
  ok("act3_run_200", act3Run.status === 200);

  const failClosed = [
    fixture.FOLLOW_UP_COMMANDS[0],
    fixture.FOLLOW_UP_COMMANDS[2],
    fixture.FOLLOW_UP_COMMANDS[4],
  ];
  for (const text of failClosed) {
    const parsed = commandApi.parseOperatorCommand(text, {
      phase: PHASE,
      lessonPlans: curriculum.lessonPlans,
      activities: afterActs,
      currentlySelectedLessonId: lessonId,
    });
    const runRes = await req("POST", "/api/admin/curriculum/operator", {
      action: "run",
      phase: PHASE,
      currentlySelectedLessonId: lessonId,
      command: text,
    }, token);
    const needsOwner = runRes.status === 409 && (runRes.json?.code === "NEEDS_OWNER_INPUT"
      || runRes.json?.needsOwnerInput?.length
      || parsed.command.completion?.mutationsEnabled !== true
      || runRes.json?.runBlocked === true);
    ok(`fail_closed_${text.slice(0, 24)}`, needsOwner, {
      status: runRes.status,
      code: runRes.json?.code,
      mutationsEnabled: parsed.command.completion?.mutationsEnabled,
    });
  }

  ok("published_scope_unchanged_end", publishedScopeFingerprint(curriculum) === scopeBefore);

  report.lessonId = lessonId;
  report.verdict = "PASS";
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: "PASS", lessonId, checks: report.checks.length }, null, 2));
}

main().catch((err) => {
  console.error("BLOCKED", err);
  process.exit(1);
});
