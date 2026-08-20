/**
 * Owner-only AI Curriculum Operator API (Phase 1).
 *
 * Parse → select → audit → durable jobs. Never mutates curriculum. Never publishes.
 */
"use strict";

const schema = require("../scripts/curriculum-operator-schema.js");
const commandApi = require("../scripts/curriculum-operator-command.js");
const selectApi = require("../scripts/curriculum-operator-select.js");
const auditApi = require("../scripts/curriculum-operator-audit.js");
const jobApi = require("../scripts/curriculum-operator-job.js");

const ACTIONS = Object.freeze([
  "parse",
  "plan",
  "run",
  "list",
  "get",
  "resume",
  "cancel",
]);

function createCurriculumOperatorApi(deps) {
  const {
    readJson,
    jsonResponse,
    readStore,
    writeStoreAsync,
    requireTeachingKitOwnerAdminSession,
    teachingKit,
    normalizeEmail,
    readSiteCurriculum,
  } = deps;

  function requireOwner(request, body, response) {
    const session = requireTeachingKitOwnerAdminSession(request, body, response);
    if (!session) return null;
    const email = normalizeEmail(session.email || "");
    if (!teachingKit.isTeachingKitOwnerPreviewEmail(email)) {
      jsonResponse(response, 403, {
        error: "AI Curriculum Operator is restricted to the owner account.",
        code: "teaching_kit_owner_required",
      });
      return null;
    }
    return { ...session, email };
  }

  function requireFlag(store, response) {
    const flags = store?.siteContent?.featureFlags || {};
    if (!teachingKit.isTeachingKitCurriculumOperatorEnabled(flags)) {
      jsonResponse(response, 404, {
        error: "AI Curriculum Operator is disabled.",
        code: "curriculum_operator_disabled",
      });
      return false;
    }
    return true;
  }

  function readJobs(store) {
    return jobApi.normalizeOperatorJobStore(store?.curriculumOperatorJobs);
  }

  async function writeJobs(store, nextJobs) {
    const stamp = jobApi.nowIso();
    store.curriculumOperatorJobs = jobApi.normalizeOperatorJobStore({
      ...nextJobs,
      updatedAt: stamp,
    });
    await writeStoreAsync(store);
    return store.curriculumOperatorJobs;
  }

  function buildPlanSummary(command, selection) {
    const lessons = schema.asArray(selection.selected).map((row) => ({
      id: row.id,
      title: row.title,
      theme: row.theme,
      age: row.age,
      ageBand: row.ageBand,
      plan: row.plan,
      readinessPercent: row.readinessPercent,
      completionPercent: row.completionPercent,
      expectedActions: [
        "lesson.get",
        "lesson.audit",
        "asset.plan",
        "teachingKit.score",
      ],
      weakSections: [],
      publishRequested: false,
    }));
    return {
      task: command.rawCommand,
      intent: command.intent,
      selectionNote: selection.selectionNote,
      lessons,
      candidatesConsidered: selection.candidatesConsidered,
      unresolvedTitles: selection.unresolvedTitles || [],
      needsConfirmation: false,
      confirmReasons: [],
      phase1: {
        mutationsEnabled: false,
        publishEnabled: false,
        note: "Phase 1 will audit and plan only. No curriculum changes.",
      },
    };
  }

  function auditOneLesson(plan, curriculum) {
    const audit = auditApi.auditLesson(plan, curriculum);
    const verification = auditApi.verifyAuditAgainstPlan(plan, audit);
    audit.verification = verification;
    return { audit, verification };
  }

  function runJobAudits(job, curriculum) {
    job.status = "running";
    jobApi.appendLog(job, "Starting Phase 1 audit run.");
    const plansById = new Map(schema.asArray(curriculum.lessonPlans).map((p) => [p.id, p]));

    job.lessonResults = schema.asArray(job.lessonResults).map((lr, index) => {
      if (lr.status === "success" && lr.audit) return lr;
      job.progress.lessonIndex = index;
      job.progress.currentLessonId = lr.lessonId;
      job.progress.currentAction = "lesson.audit";
      const plan = plansById.get(lr.lessonId);
      if (!plan) {
        jobApi.appendLog(job, `Lesson not found: ${lr.lessonId}`, "error", lr.lessonId);
        return {
          ...lr,
          status: "failed",
          error: "Lesson plan not found.",
          actions: schema.asArray(lr.actions).map((s) => ({ ...s, status: "failed", error: "lesson_not_found" })),
        };
      }

      try {
        const { audit, verification } = auditOneLesson(plan, curriculum);
        if (!verification.ok) {
          jobApi.appendLog(job, `Verification failed for ${plan.title}`, "error", plan.id);
          return {
            ...lr,
            title: plan.title,
            status: "failed",
            audit,
            verification,
            error: "Post-read verification failed.",
            actions: schema.asArray(lr.actions).map((s) => ({
              ...s,
              status: "failed",
              error: "verification_failed",
              output: s.type === "lesson.audit" ? { audit } : null,
            })),
          };
        }

        job.costCounters.lessonsAudited = (job.costCounters.lessonsAudited || 0) + 1;
        jobApi.appendLog(
          job,
          `Audited “${plan.title}” — ${audit.currentStatus}; images likely ${audit.estimatedJobScope.imagesLikelyNeeded}; printables likely ${audit.estimatedJobScope.printablesLikelyNeeded}.`,
          "info",
          plan.id,
        );
        return {
          ...lr,
          title: plan.title,
          status: "success",
          audit,
          verification,
          kept: [
            ...(audit.weeklyContent || []).filter((f) => f.decision === "KEEP").map((f) => f.field),
          ],
          updated: [],
          generated: [],
          readyForReview: false,
          published: false,
          actions: schema.asArray(lr.actions).map((s) => ({
            ...s,
            status: "success",
            output: s.type === "lesson.audit" || s.type === "asset.plan" || s.type === "teachingKit.score"
              ? {
                currentStatus: audit.currentStatus,
                scores: audit.scores,
                estimatedJobScope: audit.estimatedJobScope,
              }
              : { lessonId: plan.id },
          })),
        };
      } catch (error) {
        jobApi.appendLog(job, `Audit error: ${error.message}`, "error", lr.lessonId);
        return {
          ...lr,
          status: "failed",
          error: schema.text(error.message, 500),
          actions: schema.asArray(lr.actions).map((s) => ({
            ...s,
            status: "failed",
            error: schema.text(error.message, 300),
            retryable: true,
          })),
        };
      }
    });

    const completed = job.lessonResults.filter((l) => l.status === "success").length;
    const failed = job.lessonResults.filter((l) => l.status === "failed").length;
    const skipped = job.lessonResults.filter((l) => l.status === "skipped").length;
    job.progress = {
      ...job.progress,
      completed,
      failed,
      skipped,
      remaining: Math.max(0, job.lessonResults.length - completed - failed - skipped),
      currentAction: "",
      currentLessonId: "",
    };
    job.status = failed && !completed ? "failed" : "completed";
    job.ownerSummary = jobApi.buildOwnerSummary(job);
    jobApi.appendLog(job, `Job ${job.status}. Audited ${completed}; failed ${failed}. No mutations.`);
    job.updatedAt = jobApi.nowIso();
    return job;
  }

  async function handle(request, response) {
    const body = await readJson(request);
    const session = requireOwner(request, body, response);
    if (!session) return;

    const store = readStore();
    if (!requireFlag(store, response)) return;

    const action = schema.text(body.action, 40).toLowerCase() || "list";
    if (!ACTIONS.includes(action)) {
      jsonResponse(response, 400, { error: "Unknown operator action.", code: "unknown_action", actions: ACTIONS });
      return;
    }

    const curriculum = typeof readSiteCurriculum === "function"
      ? readSiteCurriculum(store)
      : (store.siteContent?.curriculum || { lessonPlans: [], activities: [], resources: [] });

    if (action === "parse") {
      const parsed = commandApi.parseOperatorCommand(body.command || body.rawCommand || "", {
        currentlySelectedLessonId: body.currentlySelectedLessonId,
      });
      jsonResponse(response, 200, {
        ok: true,
        action,
        ...parsed,
        mutationsEnabled: false,
        publishEnabled: false,
      });
      return;
    }

    if (action === "plan" || action === "run") {
      const parsed = body.command && typeof body.command === "object"
        ? {
          command: schema.normalizeOperatorCommand(body.command, { phase1: true }),
          needsConfirmation: body.forceConfirm === true,
          confirmReasons: schema.asArray(body.command?.confirmations?.reasons),
          ambiguous: false,
        }
        : commandApi.parseOperatorCommand(body.command || body.rawCommand || "", {
          currentlySelectedLessonId: body.currentlySelectedLessonId,
        });

      const command = parsed.command;
      if (!command.rawCommand && !(command.scope.lessonIds?.length || command.scope.titles?.length)) {
        jsonResponse(response, 400, {
          error: "Provide a natural-language command or typed command schema.",
          code: "command_required",
        });
        return;
      }

      // Reject mutation / publish intents from executing (plan may still describe them).
      if (command.actions.publish || command.completion.publish) {
        parsed.needsConfirmation = true;
        parsed.confirmReasons = [...new Set([...(parsed.confirmReasons || []), "publish_requested"])];
      }

      const selection = selectApi.selectLessons(curriculum, command, {
        currentlySelectedLessonId: body.currentlySelectedLessonId,
      });
      if (selection.ambiguous || !selection.selected.length) {
        jsonResponse(response, 409, {
          ok: false,
          code: selection.selected.length ? "ambiguous_scope" : "no_lessons_selected",
          error: selection.selected.length
            ? "Command scope is ambiguous. Narrow the request."
            : (selection.selectionNote || "No lessons matched this command."),
          command,
          selection,
          needsConfirmation: true,
          confirmReasons: ["ambiguous_scope"],
        });
        return;
      }

      if (selection.selected.length > command.limits.hardMaxLessons) {
        jsonResponse(response, 409, {
          ok: false,
          code: "unexpectedly_large_scope",
          error: `Scope exceeds hard max of ${command.limits.hardMaxLessons} lessons.`,
          needsConfirmation: true,
          confirmReasons: ["unexpectedly_large_scope"],
        });
        return;
      }

      const planSummary = buildPlanSummary(command, selection);
      planSummary.needsConfirmation = Boolean(parsed.needsConfirmation);
      planSummary.confirmReasons = parsed.confirmReasons || [];

      // Only stop for truly ambiguous / publish / huge-scope — not for normal audits.
      const mustConfirm = planSummary.needsConfirmation
        && !body.confirm
        && (planSummary.confirmReasons.includes("ambiguous_scope")
          || planSummary.confirmReasons.includes("unexpectedly_large_scope")
          || planSummary.confirmReasons.includes("publish_requested"));

      if (action === "plan" || mustConfirm) {
        const planned = jobApi.createJobFromPlan({
          command,
          planSummary,
          createdBy: session.email,
          status: mustConfirm ? "awaiting_confirm" : "planned",
        });
        if (action === "run" && mustConfirm) {
          const bag = readJobs(store);
          bag.jobs = [planned, ...bag.jobs.filter((j) => j.id !== planned.id)].slice(0, 100);
          await writeJobs(store, bag);
        }
        jsonResponse(response, 200, {
          ok: true,
          action,
          awaitingConfirm: mustConfirm,
          command,
          planSummary,
          job: mustConfirm || action === "plan" ? planned : null,
          mutationsEnabled: false,
          publishEnabled: false,
          note: "Phase 1 audit-only. No curriculum mutations.",
        });
        return;
      }

      // action === run and safe to execute
      let job = jobApi.createJobFromPlan({
        command,
        planSummary,
        createdBy: session.email,
        status: "running",
      });
      job = runJobAudits(job, curriculum);
      const bag = readJobs(store);
      bag.jobs = [job, ...bag.jobs.filter((j) => j.id !== job.id)].slice(0, 100);
      await writeJobs(store, bag);
      jsonResponse(response, 200, {
        ok: true,
        action: "run",
        command,
        planSummary,
        job,
        mutationsEnabled: false,
        publishEnabled: false,
        curriculumUnchanged: true,
      });
      return;
    }

    if (action === "list") {
      const bag = readJobs(store);
      jsonResponse(response, 200, {
        ok: true,
        action,
        jobs: bag.jobs.map((j) => ({
          id: j.id,
          status: j.status,
          createdAt: j.createdAt,
          updatedAt: j.updatedAt,
          rawCommand: j.command?.rawCommand,
          progress: j.progress,
          mutationsEnabled: false,
        })),
      });
      return;
    }

    if (action === "get") {
      const bag = readJobs(store);
      const job = bag.jobs.find((j) => j.id === schema.text(body.jobId, 80));
      if (!job) {
        jsonResponse(response, 404, { error: "Job not found.", code: "job_not_found" });
        return;
      }
      jsonResponse(response, 200, { ok: true, action, job });
      return;
    }

    if (action === "resume") {
      const bag = readJobs(store);
      let job = bag.jobs.find((j) => j.id === schema.text(body.jobId, 80));
      if (!job) {
        jsonResponse(response, 404, { error: "Job not found.", code: "job_not_found" });
        return;
      }
      if (job.status === "awaiting_confirm" && !body.confirm) {
        jsonResponse(response, 409, {
          ok: false,
          code: "awaiting_confirm",
          error: "Confirm the planned job before resuming.",
          job,
        });
        return;
      }
      job = runJobAudits(jobApi.normalizeOperatorJob(job), curriculum);
      bag.jobs = bag.jobs.map((j) => (j.id === job.id ? job : j));
      await writeJobs(store, bag);
      jsonResponse(response, 200, {
        ok: true,
        action,
        job,
        curriculumUnchanged: true,
      });
      return;
    }

    if (action === "cancel") {
      const bag = readJobs(store);
      const idx = bag.jobs.findIndex((j) => j.id === schema.text(body.jobId, 80));
      if (idx < 0) {
        jsonResponse(response, 404, { error: "Job not found.", code: "job_not_found" });
        return;
      }
      const job = jobApi.normalizeOperatorJob(bag.jobs[idx]);
      job.status = "cancelled";
      jobApi.appendLog(job, "Cancelled by owner.");
      bag.jobs[idx] = job;
      await writeJobs(store, bag);
      jsonResponse(response, 200, { ok: true, action, job });
    }
  }

  return {
    handle,
    ACTIONS,
    readJobs,
    runJobAudits,
    buildPlanSummary,
  };
}

/**
 * Preserve operator jobs when a stale store clone is written.
 */
function mergeStorePreserveCurriculumOperatorJobs(incomingStore, storeCache) {
  if (!incomingStore || typeof incomingStore !== "object") return incomingStore;
  const cached = jobApi.normalizeOperatorJobStore(storeCache?.curriculumOperatorJobs);
  const incoming = Object.prototype.hasOwnProperty.call(incomingStore, "curriculumOperatorJobs")
    ? jobApi.normalizeOperatorJobStore(incomingStore.curriculumOperatorJobs)
    : null;
  if (!incoming) {
    if (!cached.jobs.length) return incomingStore;
    return { ...incomingStore, curriculumOperatorJobs: cached };
  }
  const byId = new Map();
  function keepNewer(item) {
    if (!item?.id) return;
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      return;
    }
    const existingMs = Date.parse(existing.updatedAt || "") || 0;
    const nextMs = Date.parse(item.updatedAt || "") || 0;
    if (nextMs >= existingMs) byId.set(item.id, item);
  }
  cached.jobs.forEach(keepNewer);
  incoming.jobs.forEach(keepNewer);
  return {
    ...incomingStore,
    curriculumOperatorJobs: {
      jobs: Array.from(byId.values()).slice(0, 100),
      updatedAt: incoming.updatedAt || cached.updatedAt || jobApi.nowIso(),
    },
  };
}

module.exports = {
  createCurriculumOperatorApi,
  mergeStorePreserveCurriculumOperatorJobs,
  ACTIONS,
};
