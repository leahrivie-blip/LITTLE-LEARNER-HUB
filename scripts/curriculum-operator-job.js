/**
 * AI Curriculum Operator — durable job model (Phase 1+).
 * Store-backed, resumable. Extensible action steps for later phases.
 */
"use strict";

const crypto = require("crypto");
const schema = require("./curriculum-operator-schema.js");
const allowlistApi = require("./curriculum-operator-mutation-allowlist.js");
const executionScopeApi = require("./curriculum-operator-execution-scope.js");

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
    executableInPhase2: schema.isPhase2Executable(type),
  };
}

function normalizeLessonResult(raw = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  let status = schema.text(input.status, 20).toLowerCase() || "pending";
  if (!["pending", "running", "success", "failed", "skipped"].includes(status)) status = "pending";
  let ownerReviewStatus = schema.text(input.ownerReviewStatus, 40).toUpperCase() || "";
  if (ownerReviewStatus && !schema.OWNER_REVIEW_STATUSES.includes(ownerReviewStatus)) {
    ownerReviewStatus = "PARTIAL";
  }
  return {
    lessonId: schema.text(input.lessonId, 160),
    title: schema.text(input.title, 180),
    status,
    preSnapshotHistoryId: schema.text(input.preSnapshotHistoryId, 80) || null,
    actions: schema.asArray(input.actions).map(normalizeStep).slice(0, 200),
    audit: input.audit && typeof input.audit === "object" ? input.audit : null,
    auditAfter: input.auditAfter && typeof input.auditAfter === "object" ? input.auditAfter : null,
    verification: input.verification && typeof input.verification === "object" ? input.verification : null,
    upgradeVerification: input.upgradeVerification && typeof input.upgradeVerification === "object"
      ? input.upgradeVerification
      : null,
    beforeScores: input.beforeScores && typeof input.beforeScores === "object" ? input.beforeScores : null,
    afterScores: input.afterScores && typeof input.afterScores === "object" ? input.afterScores : null,
    kept: schema.asArray(input.kept).slice(0, 200),
    updated: schema.asArray(input.updated).slice(0, 200),
    generated: schema.asArray(input.generated).slice(0, 100),
    imageActions: schema.asArray(input.imageActions).slice(0, 200),
    imageCounts: input.imageCounts && typeof input.imageCounts === "object" ? input.imageCounts : null,
    imagesComplete: input.imagesComplete === true,
    printableActions: schema.asArray(input.printableActions).slice(0, 200),
    printableCounts: input.printableCounts && typeof input.printableCounts === "object" ? input.printableCounts : null,
    printablesComplete: input.printablesComplete === true,
    songActions: schema.asArray(input.songActions).slice(0, 200),
    bookActions: schema.asArray(input.bookActions).slice(0, 200),
    songCounts: input.songCounts && typeof input.songCounts === "object" ? input.songCounts : null,
    bookCounts: input.bookCounts && typeof input.bookCounts === "object" ? input.bookCounts : null,
    songsBooksComplete: input.songsBooksComplete === true,
    textComplete: input.textComplete === true,
    finalVerificationComplete: input.finalVerificationComplete === true,
    creationBriefComplete: input.creationBriefComplete === true,
    duplicateCheckComplete: input.duplicateCheckComplete === true,
    baseContentComplete: input.baseContentComplete === true,
    lessonCreated: input.lessonCreated === true,
    idsVerified: input.idsVerified === true,
    createdLessonId: schema.text(input.createdLessonId, 160) || null,
    creationBrief: input.creationBrief && typeof input.creationBrief === "object" ? input.creationBrief : null,
    creationIdempotencyKey: schema.text(input.creationIdempotencyKey, 200) || null,
    qualityReview: input.qualityReview && typeof input.qualityReview === "object" ? input.qualityReview : null,
    workPlan: input.workPlan && typeof input.workPlan === "object" ? input.workPlan : null,
    kitScope: input.kitScope && typeof input.kitScope === "object" ? input.kitScope : null,
    executionScope: input.executionScope && typeof input.executionScope === "object" ? input.executionScope : null,
    lessonReadiness: schema.text(input.lessonReadiness, 40) || null,
    reportConsistency: input.reportConsistency && typeof input.reportConsistency === "object"
      ? input.reportConsistency
      : null,
    readinessDelta: input.readinessDelta && typeof input.readinessDelta === "object"
      ? input.readinessDelta
      : null,
    finalVerification: input.finalVerification && typeof input.finalVerification === "object"
      ? input.finalVerification
      : null,
    aiUsage: input.aiUsage && typeof input.aiUsage === "object" ? input.aiUsage : null,
    composerDiagnostics: input.composerDiagnostics && typeof input.composerDiagnostics === "object"
      ? input.composerDiagnostics
      : null,
    stagedDiagnostics: input.stagedDiagnostics && typeof input.stagedDiagnostics === "object"
      ? input.stagedDiagnostics
      : null,
    creationBlueprintComplete: input.creationBlueprintComplete === true,
    creationBlueprint: input.creationBlueprint && typeof input.creationBlueprint === "object"
      ? input.creationBlueprint
      : null,
    activityExpansionBatches: input.activityExpansionBatches && typeof input.activityExpansionBatches === "object"
      ? input.activityExpansionBatches
      : null,
    ownerReviewStatus: ownerReviewStatus || null,
    readyForReview: input.readyForReview === true || ownerReviewStatus === "READY_FOR_OWNER_REVIEW",
    publishRequested: input.publishRequested === true,
    published: false,
    error: input.error ? schema.text(input.error, 500) : null,
    code: input.code ? schema.text(input.code, 80) : null,
  };
}

function normalizeOperatorJob(raw = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  let status = schema.text(input.status, 30).toLowerCase() || "planned";
  if (!schema.JOB_STATUSES.includes(status)) status = "planned";
  const command = schema.normalizeOperatorCommand(input.command || {}, {
    phase: Number(input.command?.completion?.phase) || Number(input.phase) || 1,
  });
  const lessonResults = schema.asArray(input.lessonResults).map(normalizeLessonResult).slice(0, 50);
  const completed = lessonResults.filter((l) => l.status === "success").length;
  const failed = lessonResults.filter((l) => l.status === "failed").length;
  const skipped = lessonResults.filter((l) => l.status === "skipped").length;
  const phase = Number(command.completion?.phase) || Number(input.phase) || 1;
  return {
    id: schema.text(input.id, 80) || newJobId(),
    createdAt: schema.text(input.createdAt, 40) || nowIso(),
    updatedAt: schema.text(input.updatedAt, 40) || nowIso(),
    createdBy: schema.text(input.createdBy, 160),
    status,
    phase,
    mutationsEnabled: phase >= 2 && (
      command.actions?.saveDraft === true
      || command.actions?.generateImages === true
      || command.actions?.generatePrintables === true
      || command.actions?.generateSongsBooks === true
    ),
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
        songPlannerCalls: Number(input.costCounters.songPlannerCalls) || 0,
        songsCreated: Number(input.costCounters.songsCreated) || 0,
        songsImproved: Number(input.costCounters.songsImproved) || 0,
        bookGuideCalls: Number(input.costCounters.bookGuideCalls) || 0,
        booksLinked: Number(input.costCounters.booksLinked) || 0,
        bookGuidesImproved: Number(input.costCounters.bookGuidesImproved) || 0,
        lessonArchitectCalls: Number(input.costCounters.lessonArchitectCalls) || 0,
        lessonRevisionCalls: Number(input.costCounters.lessonRevisionCalls) || 0,
        lessonArchitectureCalls: Number(input.costCounters.lessonArchitectureCalls) || 0,
        activityExpansionCalls: Number(input.costCounters.activityExpansionCalls) || 0,
        activityRepairCalls: Number(input.costCounters.activityRepairCalls) || 0,
        activitiesRequested: Number(input.costCounters.activitiesRequested) || 0,
        activitiesCompleted: Number(input.costCounters.activitiesCompleted) || 0,
        outputTruncationCount: Number(input.costCounters.outputTruncationCount) || 0,
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

function findActiveMutationJob(jobs, lessonId) {
  const id = schema.text(lessonId, 160);
  return (Array.isArray(jobs) ? jobs : []).find((job) => {
    const status = String(job?.status || "").toLowerCase();
    if (!["running", "awaiting_confirm", "planned"].includes(status)) return false;
    return schema.asArray(job?.lessonResults).some((lr) => {
      if (schema.text(lr?.lessonId, 160) !== id && schema.text(lr?.createdLessonId, 160) !== id) return false;
      const lrStatus = String(lr?.status || "").toLowerCase();
      return lrStatus === "pending" || lrStatus === "running" || lrStatus === "";
    });
  }) || null;
}

function findActiveMutationJobForLessons(jobs, lessonIds = [], options = {}) {
  const excludeJobId = schema.text(options.excludeJobId, 80);
  for (const lessonId of schema.asArray(lessonIds)) {
    const hit = findActiveMutationJob(jobs, lessonId);
    if (hit && hit.id !== excludeJobId) {
      return { job: hit, lessonId: schema.text(lessonId, 160) };
    }
  }
  return null;
}

function createJobFromPlan({ command, planSummary, createdBy, status = "planned" }) {
  const lessons = schema.asArray(planSummary?.lessons);
  const phase = Number(command?.completion?.phase) || 1;
  const doCreate = phase >= 7 && command?.actions?.createLesson === true;
  const doUpgrade = !doCreate && phase >= 2 && command?.actions?.saveDraft === true
    && (command?.actions?.upgradeLesson || command?.actions?.upgradeActivities)
    && command?.actions?.touchDraft !== false;
  const doImages = ((phase === 3) || (phase >= 6))
    && command?.actions?.generateImages === true
    && command?.actions?.touchImages !== false;
  const doPrintables = ((phase === 4) || (phase >= 6))
    && command?.actions?.generatePrintables === true
    && command?.actions?.touchPrintables !== false;
  const doSongsBooks = ((phase === 5) || (phase >= 6))
    && command?.actions?.generateSongsBooks === true
    && (command?.actions?.touchSongs !== false || command?.actions?.touchBooks !== false);
  const allowActivityUpdate = executionScopeApi.activityUpdatesAllowed(command);
  const lessonRows = lessons.length
    ? lessons
    : (doCreate
      ? [{
        id: schema.text(planSummary?.pendingCreateId, 160) || "pending-create",
        title: schema.text(planSummary?.creationBrief?.title, 180) || "New lesson (pending create)",
        workPlan: null,
        kitScope: null,
      }]
      : []);
  const job = normalizeOperatorJob({
    createdBy,
    status,
    command,
    planSummary,
    phase,
    mutationsEnabled: Boolean(doCreate || doUpgrade || doImages || doPrintables || doSongsBooks),
    publishEnabled: false,
    progress: {
      lessonIndex: 0,
      lessonCount: lessonRows.length,
      currentLessonId: "",
      currentAction: "",
      completed: 0,
      failed: 0,
      skipped: 0,
      remaining: lessonRows.length,
    },
    lessonResults: lessonRows.map((lesson) => {
      const id = lesson.id || lesson.lessonId || (doCreate ? "pending-create" : "");
      const createKey = schema.text(
        lesson.creationIdempotencyKey || planSummary?.creationBrief?.idempotencyKey || `create:${id}`,
        200,
      );
      const actions = [];
      if (doCreate) {
        actions.push(
          { id: newStepId(), type: "lesson.create", status: "pending", idempotencyKey: `brief:${createKey}` },
          { id: newStepId(), type: "lesson.create", status: "pending", idempotencyKey: `dup:${createKey}` },
          { id: newStepId(), type: "lesson.create", status: "pending", idempotencyKey: `content:${createKey}` },
          { id: newStepId(), type: "lesson.create", status: "pending", idempotencyKey: `create:${createKey}` },
          { id: newStepId(), type: "lesson.validate", status: "pending", idempotencyKey: `ids:${createKey}` },
        );
      } else {
        actions.push(
          { id: newStepId(), type: "lesson.get", status: "pending", idempotencyKey: `get:${id}` },
          { id: newStepId(), type: "lesson.audit", status: "pending", idempotencyKey: `audit:${id}` },
          { id: newStepId(), type: "asset.plan", status: "pending", idempotencyKey: `asset:${id}` },
          { id: newStepId(), type: "teachingKit.score", status: "pending", idempotencyKey: `score:${id}` },
        );
      }
      if (doUpgrade) {
        actions.push(
          { id: newStepId(), type: "lesson.updateFields", status: "pending", idempotencyKey: `update:${id}` },
          { id: newStepId(), type: "lesson.saveDraft", status: "pending", idempotencyKey: `draft:${id}` },
          { id: newStepId(), type: "lesson.validate", status: "pending", idempotencyKey: `validate:${id}` },
        );
        if (allowActivityUpdate) {
          actions.push(
            { id: newStepId(), type: "activity.update", status: "pending", idempotencyKey: `actupdate:${id}` },
          );
        }
      }
      // Phase 6/7 order after create (or existing): songs/books → images → printables
      if (doSongsBooks) {
        actions.push(
          { id: newStepId(), type: "song.audit", status: "pending", idempotencyKey: `song-audit:${id}` },
          { id: newStepId(), type: "song.upsert", status: "pending", idempotencyKey: `song-upsert:${id}` },
          { id: newStepId(), type: "book.audit", status: "pending", idempotencyKey: `book-audit:${id}` },
          { id: newStepId(), type: "book.upsert", status: "pending", idempotencyKey: `book-upsert:${id}` },
          { id: newStepId(), type: "lesson.saveDraft", status: "pending", idempotencyKey: `sb-draft:${id}` },
          { id: newStepId(), type: "lesson.validate", status: "pending", idempotencyKey: `sb-validate:${id}` },
        );
      }
      if (doImages) {
        actions.push(
          { id: newStepId(), type: "image.inspect", status: "pending", idempotencyKey: `img-inspect:${id}` },
          { id: newStepId(), type: "image.generate", status: "pending", idempotencyKey: `img-gen:${id}` },
          { id: newStepId(), type: "image.upload", status: "pending", idempotencyKey: `img-upload:${id}` },
          { id: newStepId(), type: "image.attachToActivity", status: "pending", idempotencyKey: `img-attach:${id}` },
          { id: newStepId(), type: "lesson.validate", status: "pending", idempotencyKey: `img-validate:${id}` },
        );
      }
      if (doPrintables) {
        actions.push(
          { id: newStepId(), type: "printable.plan", status: "pending", idempotencyKey: `pr-plan:${id}` },
          { id: newStepId(), type: "printable.generatePages", status: "pending", idempotencyKey: `pr-gen:${id}` },
          { id: newStepId(), type: "printable.buildPdf", status: "pending", idempotencyKey: `pr-pdf:${id}` },
          { id: newStepId(), type: "printable.upload", status: "pending", idempotencyKey: `pr-upload:${id}` },
          { id: newStepId(), type: "printable.attach", status: "pending", idempotencyKey: `pr-attach:${id}` },
          { id: newStepId(), type: "printable.verify", status: "pending", idempotencyKey: `pr-verify:${id}` },
        );
      }
      if (phase >= 6) {
        actions.push(
          { id: newStepId(), type: "lesson.validate", status: "pending", idempotencyKey: `final-validate:${id}` },
        );
      }
      const publishRequested = Array.isArray(command?.confirmations?.reasons)
        && command.confirmations.reasons.includes("publish_requested");
      return {
        lessonId: id,
        title: lesson.title,
        status: "pending",
        actions,
        imageActions: [],
        imageCounts: null,
        imagesComplete: false,
        printableActions: [],
        printableCounts: null,
        printablesComplete: false,
        songActions: [],
        bookActions: [],
        songCounts: null,
        bookCounts: null,
        songsBooksComplete: false,
        textComplete: doCreate,
        finalVerificationComplete: false,
        creationBriefComplete: false,
        duplicateCheckComplete: false,
        baseContentComplete: false,
        lessonCreated: Boolean(lesson.createdLessonId || planSummary?.createdLessonId),
        idsVerified: false,
        createdLessonId: schema.text(lesson.createdLessonId || planSummary?.createdLessonId, 160) || null,
        creationBrief: lesson.creationBrief || planSummary?.creationBrief || null,
        creationIdempotencyKey: createKey,
        workPlan: lesson.workPlan || null,
        kitScope: lesson.kitScope || null,
        publishRequested,
        published: false,
      };
    }),
    log: [],
  });
  let createdMsg = executionScopeApi.buildJobCreatedLogMessage(status, command);
  appendLog(job, createdMsg);
  job.mutationAllowlist = allowlistApi.buildMutationAllowlist(command, {
    lessonIds: schema.asArray(command?.scope?.lessonIds),
  });
  return job;
}

function buildOwnerSummary(job) {
  const lines = [];
  lines.push(`Job ${job.id}`);
  lines.push(`Status: ${job.status}`);
  lines.push(`Phase: ${job.phase || 1}`);
  lines.push(`Command: ${job.command?.rawCommand || ""}`);
  lines.push(`Lessons: ${job.progress.completed}/${job.progress.lessonCount}`);
  if (job.progress.failed) lines.push(`Failed: ${job.progress.failed}`);
  if (job.costCounters?.images) lines.push(`Images generated: ${job.costCounters.images}`);
  schema.asArray(job.lessonResults).forEach((lr) => {
    if (!lr.audit && !lr.auditAfter && !lr.imageCounts) {
      lines.push(`- ${lr.title || lr.lessonId}: ${lr.status}${lr.error ? ` (${lr.error})` : ""}`);
      return;
    }
    const before = lr.beforeScores?.premiumReadinessPercent ?? lr.audit?.scores?.premiumReadinessPercent;
    const after = lr.afterScores?.premiumReadinessPercent ?? before;
    lines.push(`- ${lr.title || lr.lessonId}: ${lr.ownerReviewStatus || lr.status} · readiness ${before}% → ${after}%`);
    if (schema.asArray(lr.updated).length) {
      lines.push(`    changed: ${lr.updated.length} field(s)`);
    }
    if (schema.asArray(lr.kept).length) {
      lines.push(`    kept: ${Math.min(lr.kept.length, 8)} strong section(s)`);
    }
    if (lr.imageCounts) {
      const c = lr.imageCounts;
      lines.push(
        `    activity images: KEEP ${c.KEEP || 0} · GENERATED ${c.GENERATE || 0} · REPLACED ${c.REPLACE || 0} · NOT NEEDED ${c.NOT_NEEDED || 0} · FAILED ${c.FAILED || 0}`,
      );
      schema.asArray(lr.imageActions).slice(0, 12).forEach((a) => {
        lines.push(`      ${a.activityTitle || a.activityId}: ${a.decision}${a.reason ? ` — ${String(a.reason).slice(0, 100)}` : ""}`);
      });
    }
    if (lr.printableCounts) {
      const c = lr.printableCounts;
      lines.push(
        `    printables: KEEP ${c.KEEP || 0} · CREATE ${c.CREATE || 0} · REPLACE ${c.REPLACE || 0} · NOT NEEDED ${c.NOT_NEEDED || 0} · FAILED ${c.FAILED || 0}`,
      );
      schema.asArray(lr.printableActions).slice(0, 12).forEach((a) => {
        lines.push(`      ${a.activityTitle || a.activityId}: ${a.decision}${a.spec?.title ? ` — ${a.spec.title}` : ""}${a.reason ? ` — ${String(a.reason).slice(0, 80)}` : ""}`);
      });
    }
    if (lr.songCounts || lr.bookCounts) {
      const sc = lr.songCounts || {};
      const bc = lr.bookCounts || {};
      lines.push(
        `    songs: KEEP ${sc.KEEP || 0} · ADD ${sc.ADD || 0} · IMPROVE ${sc.IMPROVE || 0} · REPLACE ${sc.REPLACE || 0} · NOT NEEDED ${sc.NOT_NEEDED || 0}`,
      );
      schema.asArray(lr.songActions).slice(0, 10).forEach((a) => {
        lines.push(`      ${a.weekday || "?"}: ${a.decision}${a.title || a.existingTitle ? ` — ${a.title || a.existingTitle}` : ""}${a.reason ? ` — ${String(a.reason).slice(0, 80)}` : ""}`);
      });
      lines.push(
        `    books: KEEP ${bc.KEEP || 0} · ADD ${bc.ADD || 0} · IMPROVE_GUIDE ${bc.IMPROVE_GUIDE || 0} · REPLACE ${bc.REPLACE || 0} · NOT NEEDED ${bc.NOT_NEEDED || 0}`,
      );
      schema.asArray(lr.bookActions).slice(0, 6).forEach((a) => {
        lines.push(`      ${a.title || a.existingTitle || "book"}: ${a.decision}${a.reason ? ` — ${String(a.reason).slice(0, 80)}` : ""}`);
      });
    }
  });
  lines.push("Publish: NOT PUBLISHED");
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
  findActiveMutationJob,
  findActiveMutationJobForLessons,
  nowIso,
};
