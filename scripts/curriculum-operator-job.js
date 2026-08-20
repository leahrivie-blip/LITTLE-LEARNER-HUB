/**
 * AI Curriculum Operator — durable job model (Phase 1+).
 * Store-backed, resumable. Extensible action steps for later phases.
 */
"use strict";

const crypto = require("crypto");
const schema = require("./curriculum-operator-schema.js");

function nowIso() {
  return new Date().toISOString();
}

function newJobId() {
  return `opjob_${crypto.randomBytes(8).toString("hex")}`;
}

function newStepId() {
  return `opstep_${crypto.randomBytes(5).toString("hex")}`;
}

function appendLog(job, message, level = "info", lessonId = null) {
  const entry = {
    at: nowIso(),
    level: ["info", "warn", "error"].includes(level) ? level : "info",
    message: schema.text(message, 800),
    lessonId: lessonId ? schema.text(lessonId, 160) : null,
  };
  job.log = schema.asArray(job.log).concat([entry]).slice(-500);
  job.updatedAt = entry.at;
  return entry;
}

function normalizeStep(raw = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  const type = schema.text(input.type, 60);
  let status = schema.text(input.status, 20).toLowerCase() || "pending";
  if (!schema.STEP_STATUSES.includes(status)) status = "pending";
  return {
    id: schema.text(input.id, 80) || newStepId(),
    type,
    status,
    idempotencyKey: schema.text(input.idempotencyKey, 200),
    input: input.input && typeof input.input === "object" ? input.input : {},
    output: input.output && typeof input.output === "object" ? input.output : null,
    error: input.error ? schema.text(input.error, 500) : null,
    retryable: input.retryable === true,
    mutation: schema.isMutationAction(type),
    executableInPhase1: schema.isPhase1Executable(type),
  };
}

function normalizeLessonResult(raw = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  let status = schema.text(input.status, 20).toLowerCase() || "pending";
  if (!["pending", "running", "success", "failed", "skipped"].includes(status)) status = "pending";
  return {
    lessonId: schema.text(input.lessonId, 160),
    title: schema.text(input.title, 180),
    status,
    preSnapshotHistoryId: schema.text(input.preSnapshotHistoryId, 80) || null,
    actions: schema.asArray(input.actions).map(normalizeStep).slice(0, 200),
    audit: input.audit && typeof input.audit === "object" ? input.audit : null,
    verification: input.verification && typeof input.verification === "object" ? input.verification : null,
    kept: schema.asArray(input.kept).slice(0, 100),
    updated: schema.asArray(input.updated).slice(0, 100),
    generated: schema.asArray(input.generated).slice(0, 100),
    readyForReview: input.readyForReview === true,
    published: false,
    error: input.error ? schema.text(input.error, 500) : null,
  };
}

function normalizeOperatorJob(raw = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  let status = schema.text(input.status, 30).toLowerCase() || "planned";
  if (!schema.JOB_STATUSES.includes(status)) status = "planned";
  const command = schema.normalizeOperatorCommand(input.command || {}, { phase1: true });
  const lessonResults = schema.asArray(input.lessonResults).map(normalizeLessonResult).slice(0, 50);
  const completed = lessonResults.filter((l) => l.status === "success").length;
  const failed = lessonResults.filter((l) => l.status === "failed").length;
  const skipped = lessonResults.filter((l) => l.status === "skipped").length;
  return {
    id: schema.text(input.id, 80) || newJobId(),
    createdAt: schema.text(input.createdAt, 40) || nowIso(),
    updatedAt: schema.text(input.updatedAt, 40) || nowIso(),
    createdBy: schema.text(input.createdBy, 160),
    status,
    phase: 1,
    mutationsEnabled: false,
    publishEnabled: false,
    command,
    planSummary: input.planSummary && typeof input.planSummary === "object"
      ? input.planSummary
      : { task: "", lessons: [], selectionNote: "", needsConfirmation: false, confirmReasons: [] },
    progress: {
      lessonIndex: Number(input.progress?.lessonIndex) || 0,
      lessonCount: Number(input.progress?.lessonCount) || lessonResults.length,
      currentLessonId: schema.text(input.progress?.currentLessonId, 160),
      currentAction: schema.text(input.progress?.currentAction, 80),
      completed,
      failed,
      skipped,
      remaining: Math.max(0, lessonResults.length - completed - failed - skipped),
    },
    lessonResults,
    costCounters: {
      ...schema.emptyCostCounters(),
      ...(input.costCounters && typeof input.costCounters === "object" ? {
        images: Number(input.costCounters.images) || 0,
        printables: Number(input.costCounters.printables) || 0,
        openaiCalls: Number(input.costCounters.openaiCalls) || 0,
        lessonsAudited: Number(input.costCounters.lessonsAudited) || 0,
      } : {}),
    },
    log: schema.asArray(input.log).slice(-500),
    ownerSummary: schema.text(input.ownerSummary, 4000),
  };
}

function normalizeOperatorJobStore(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const jobs = schema.asArray(input.jobs).map(normalizeOperatorJob).slice(0, 100);
  return {
    jobs,
    updatedAt: schema.text(input.updatedAt, 40) || "",
  };
}

function createJobFromPlan({ command, planSummary, createdBy, status = "planned" }) {
  const lessons = schema.asArray(planSummary?.lessons);
  const job = normalizeOperatorJob({
    createdBy,
    status,
    command,
    planSummary,
    progress: {
      lessonIndex: 0,
      lessonCount: lessons.length,
      currentLessonId: "",
      currentAction: "",
      completed: 0,
      failed: 0,
      skipped: 0,
      remaining: lessons.length,
    },
    lessonResults: lessons.map((lesson) => ({
      lessonId: lesson.id || lesson.lessonId,
      title: lesson.title,
      status: "pending",
      actions: [
        {
          id: newStepId(),
          type: "lesson.get",
          status: "pending",
          idempotencyKey: `get:${lesson.id || lesson.lessonId}`,
        },
        {
          id: newStepId(),
          type: "lesson.audit",
          status: "pending",
          idempotencyKey: `audit:${lesson.id || lesson.lessonId}`,
        },
        {
          id: newStepId(),
          type: "asset.plan",
          status: "pending",
          idempotencyKey: `asset:${lesson.id || lesson.lessonId}`,
        },
        {
          id: newStepId(),
          type: "teachingKit.score",
          status: "pending",
          idempotencyKey: `score:${lesson.id || lesson.lessonId}`,
        },
      ],
    })),
    log: [],
  });
  appendLog(job, `Job created (${status}). Phase 1 audit-only.`);
  return job;
}

function buildOwnerSummary(job) {
  const lines = [];
  lines.push(`Job ${job.id}`);
  lines.push(`Status: ${job.status}`);
  lines.push(`Command: ${job.command?.rawCommand || ""}`);
  lines.push(`Lessons: ${job.progress.completed}/${job.progress.lessonCount} audited`);
  if (job.progress.failed) lines.push(`Failed: ${job.progress.failed}`);
  schema.asArray(job.lessonResults).forEach((lr) => {
    if (!lr.audit) {
      lines.push(`- ${lr.title || lr.lessonId}: ${lr.status}${lr.error ? ` (${lr.error})` : ""}`);
      return;
    }
    const a = lr.audit;
    lines.push(`- ${a.title}: ${a.currentStatus} · readiness ${a.scores?.premiumReadinessPercent ?? "—"}%`);
    const scope = a.estimatedJobScope || {};
    lines.push(`    fields needing work: ${scope.lessonFieldsNeedingWork || 0}; activities: ${scope.activitiesNeedingWork || 0}; images likely: ${scope.imagesLikelyNeeded || 0}; printables likely: ${scope.printablesLikelyNeeded || 0}`);
  });
  lines.push("NO curriculum mutations. NOT published.");
  return lines.join("\n");
}

module.exports = {
  newJobId,
  newStepId,
  appendLog,
  normalizeStep,
  normalizeLessonResult,
  normalizeOperatorJob,
  normalizeOperatorJobStore,
  createJobFromPlan,
  buildOwnerSummary,
  nowIso,
};
