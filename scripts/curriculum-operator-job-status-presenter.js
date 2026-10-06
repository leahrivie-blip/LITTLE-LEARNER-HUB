/**
 * Owner-facing Curriculum Operator job status presentation (browser + Node).
 */
"use strict";

let executionScopeApi = null;
try {
  executionScopeApi = require("./curriculum-operator-execution-scope.js");
} catch (_browserRequire) {
  executionScopeApi = null;
}

const MUTATION_LOCK_API_RE = /Another Operator job is already mutating lesson/i;
const MUTATION_LOCK_OWNER_MESSAGE = "This lesson already has an operator job in progress. You can review that job below.";

const BANNER_SUBTITLES = Object.freeze({
  queued: "Your request is waiting to start.",
  running: "The operator is working on this lesson.",
  ready_for_owner_review: "Your draft is ready. Review the changes before publishing.",
  completed: "This job finished. Review the lesson if changes were saved.",
  failed: "The operator could not finish this request.",
  blocked: "The operator stopped safely and did not publish or save incomplete changes.",
  cancelled: "This job was cancelled.",
  partial: "Some requested changes completed; others did not. Review details below.",
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, max = 400) {
  const s = String(value ?? "").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function primaryLessonResult(job) {
  return asArray(job?.lessonResults)[0] || null;
}

function normalizeJobStatus(job) {
  const raw = String(job?.status || "").toLowerCase();
  const lr = primaryLessonResult(job);
  const review = String(lr?.ownerReviewStatus || "").toUpperCase();

  if (raw === "cancelled" || raw === "canceled") return "cancelled";
  if (raw === "planned" || raw === "awaiting_confirm" || raw === "pending") return "queued";
  if (raw === "running" || raw === "paused") return "running";
  if (raw === "failed") {
    if (review === "BLOCKED" || lr?.contentPersistenceIncomplete === true) return "blocked";
    return "failed";
  }
  if (raw === "completed_with_gaps") {
    if (review === "READY_FOR_OWNER_REVIEW" || review === "PARTIAL") return "partial";
    return "failed";
  }
  if (raw === "completed" || raw === "success") {
    if (review === "READY_FOR_OWNER_REVIEW" || review === "PARTIAL") return "ready_for_owner_review";
    if (lr?.status === "failed") return "failed";
    return "completed";
  }
  return raw || "queued";
}

function bannerTitle(kind) {
  const map = {
    queued: "Queued",
    running: "Running",
    ready_for_owner_review: "Ready for owner review",
    completed: "Completed",
    failed: "Failed",
    blocked: "Blocked",
    cancelled: "Cancelled",
    partial: "Completed with gaps",
  };
  return map[kind] || "In progress";
}

function bannerSubtitle(kind) {
  return BANNER_SUBTITLES[kind] || BANNER_SUBTITLES.running;
}

function jobProgress(job) {
  const progress = job?.progress && typeof job.progress === "object" ? job.progress : {};
  const total = Math.max(0, Number(progress.lessonCount) || 0);
  let completed = Number(progress.completed);
  if (!Number.isFinite(completed)) completed = 0;
  const failed = Number(progress.failed) || 0;
  const skipped = Number(progress.skipped) || 0;
  const kind = normalizeJobStatus(job);
  if (kind === "queued") {
    completed = 0;
  } else if (kind === "ready_for_owner_review" || kind === "completed" || kind === "partial") {
    completed = total > 0 ? total : Math.max(completed, 1);
  }
  const denom = total > 0 ? total : 1;
  const percent = Math.min(100, Math.round((completed / denom) * 100));
  return { completed, total: denom, failed, skipped, percent };
}

function mapActionToStepLabel(action) {
  const key = String(action || "").toLowerCase();
  if (!key) return "";
  if (key.includes("parse") || key.includes("plan") || key.includes("prepare")) return "Preparing request";
  if (key.startsWith("lesson.audit") || key === "lesson.audit") return "Auditing lesson";
  if (key.includes("cover")) return "Updating cover";
  if (key.startsWith("image")) return "Processing images";
  if (key.startsWith("printable")) return "Processing printables";
  if (key.startsWith("song") || key.startsWith("book")) return "Updating songs and books";
  if (key.includes("validate") || key.includes("verification") || key.startsWith("lesson.save")) return "Saving draft";
  if (key.startsWith("lesson.") || key.startsWith("creation.") || key.startsWith("activity.")) return "Updating lesson content";
  return "";
}

function currentStepLabel(job, clientRunPhase) {
  const kind = normalizeJobStatus(job);
  if (kind === "queued") return "Waiting to start";
  if (kind === "ready_for_owner_review") return "Ready for review";
  if (kind === "failed" || kind === "blocked") {
    const lr = primaryLessonResult(job);
    return text(lr?.error || job?.error || "Could not complete", 120) || "Could not complete";
  }
  if (kind === "completed" || kind === "partial") return "Finished";
  const fromProgress = mapActionToStepLabel(job?.progress?.currentAction);
  if (fromProgress) return fromProgress;
  const logTail = asArray(job?.log).slice(-1)[0]?.message;
  if (logTail && !/Job created/i.test(logTail)) return text(logTail, 100);
  if (clientRunPhase === "starting") return "Preparing request";
  if (kind === "running") return "Working on lesson";
  return "Preparing request";
}

function lessonIdFromJob(job) {
  const lr = primaryLessonResult(job);
  return lr?.createdLessonId
    || lr?.lessonId
    || lr?.auditAfter?.lessonId
    || lr?.audit?.lessonId
    || job?.progress?.currentLessonId
    || "";
}

function lessonTitleFromJob(job, planSummary) {
  const lr = primaryLessonResult(job);
  const fromPlan = asArray(planSummary?.lessons)[0]?.title;
  return lr?.title
    || lr?.auditAfter?.title
    || lr?.audit?.title
    || fromPlan
    || "";
}

function isCoverOnlyCommand(command) {
  if (!command || typeof command !== "object") return false;
  const actions = command.actions || {};
  const flags = executionScopeApi?.computeExecutionFlags(command);
  if (flags) {
    const coverAllowed = actions.touchCover === true;
    return coverAllowed
      && !flags.doUpgrade
      && !flags.doImages
      && !flags.doPrintables
      && !flags.doSongsBooks
      && flags.doCreate !== true;
  }
  return actions.touchCover === true
    && actions.upgradeLesson !== true
    && actions.upgradeActivities !== true
    && actions.generateImages !== true
    && actions.generatePrintables !== true
    && actions.generateSongsBooks !== true
    && actions.createLesson !== true;
}

function ownerScopeRows(command) {
  if (!command || typeof command !== "object") return [];
  if (executionScopeApi?.buildWouldRunPhaseMap) {
    const map = executionScopeApi.buildWouldRunPhaseMap(command);
    const row = (label, token) => ({
      label,
      state: /RUN/i.test(String(token || "")) ? "included" : "excluded",
      detail: String(token || "SKIP"),
    });
    return [
      row("Lesson text", map.lessonContent),
      row("Activities", map.activities),
      row("Cover", map.cover),
      row("Activity images", map.images),
      row("Printables", map.printables),
      row("Songs", map.songs),
      row("Books", map.books),
      row("Publish", map.publish),
    ];
  }
  const actions = command.actions || {};
  return [
    { label: "Cover", state: actions.touchCover ? "included" : "excluded", detail: "" },
    { label: "Lesson text", state: actions.upgradeLesson ? "included" : "excluded", detail: "" },
    { label: "Activity images", state: actions.generateImages ? "included" : "excluded", detail: "" },
    { label: "Printables", state: actions.generatePrintables ? "included" : "excluded", detail: "" },
    { label: "Songs/books", state: actions.generateSongsBooks ? "included" : "excluded", detail: "" },
  ];
}

function ownerScopeSummaryText(command) {
  if (isCoverOnlyCommand(command)) {
    return "Cover photo only. Activity text, printables, songs, books, and publishing are not part of this job.";
  }
  const rows = ownerScopeRows(command).filter((r) => r.state === "included");
  if (!rows.length) return "Audit/plan only — no curriculum mutations.";
  const labels = rows.map((r) => r.label.toLowerCase()).join(", ");
  return `This job may change: ${labels}. Publishing stays off until you publish manually.`;
}

function ownerExecutionPlanNote(command, planSummary) {
  const owner = ownerScopeSummaryText(command);
  if (isCoverOnlyCommand(command)) return owner;
  const phaseNote = text(planSummary?.phaseNote, 500);
  if (phaseNote && /Cover locked unless explicitly requested/i.test(phaseNote) && command?.actions?.touchCover === true) {
    return `${owner} Technical note: cover changes are allowed for this request.`;
  }
  return phaseNote ? `${owner}\n${phaseNote}` : owner;
}

function countMutations(counts, keys) {
  if (!counts || typeof counts !== "object") return 0;
  return keys.reduce((sum, key) => sum + (Number(counts[key]) || 0), 0);
}

function buildWhatChangedLines(job) {
  const kind = normalizeJobStatus(job);
  if (kind === "queued") return { lines: [], published: false, partial: null };
  const lr = primaryLessonResult(job);
  if (!lr) return { lines: [], published: false, partial: null };

  const lines = [];
  const updated = asArray(lr.updated);
  const coverTouched = updated.some((row) => /cover/i.test(String(row?.path || row || "")))
    || lr.executionScope?.cover === "CHANGED"
    || (lr.imageCounts && countMutations(lr.imageCounts, ["REPLACE", "GENERATE"]) > 0 && isCoverOnlyCommand(job?.command));

  const activityTextTouched = updated.some((row) => /activit|weekly|objective|overview/i.test(String(row?.path || row || "")))
    || lr.textComplete === true
    || (lr.executionScope && lr.executionScope.activities === "CHANGED");

  const imageWrites = countMutations(lr.imageCounts, ["REPLACE", "GENERATE"]);
  const printableWrites = countMutations(lr.printableCounts, ["CREATE", "REPLACE"]);
  const songWrites = countMutations(lr.songCounts, ["ADD", "IMPROVE", "REPLACE"]);
  const bookWrites = countMutations(lr.bookCounts, ["ADD", "IMPROVE_GUIDE", "REPLACE"]);

  if (coverTouched) lines.push("Cover updated");
  else if (isCoverOnlyCommand(job?.command)) lines.push("Cover not changed yet");

  if (activityTextTouched) lines.push("Activity or lesson text updated");
  else lines.push("Activity text unchanged");

  if (printableWrites > 0) lines.push("Printables updated");
  else lines.push("Printables unchanged");

  if (songWrites > 0 || bookWrites > 0) lines.push("Songs or books updated");
  else lines.push("Songs/books unchanged");

  if (imageWrites > 0 && !coverTouched) lines.push("Activity images updated");

  const published = job?.publishEnabled === true && lr?.published === true;
  lines.push(`Published: ${published ? "Yes" : "No"}`);

  let partial = null;
  if (kind === "partial" || job?.status === "completed_with_gaps") {
    partial = {
      succeeded: lr.textComplete || lr.imagesComplete || lr.printablesComplete || lr.songsBooksComplete
        ? ["Some teaching-kit steps completed"]
        : [],
      failed: lr.error ? [text(lr.error, 240)] : [],
    };
  }

  return { lines, published, partial };
}

function shouldShowReviewDraft(job) {
  const kind = normalizeJobStatus(job);
  if (kind !== "ready_for_owner_review" && kind !== "partial" && kind !== "completed") return false;
  const lr = primaryLessonResult(job);
  if (lr?.lessonCreated === true || lr?.createdLessonId) return true;
  if (lessonIdFromJob(job)) return true;
  return kind === "ready_for_owner_review";
}

function buildMutationLockNotice(payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  if (body.code !== "LESSON_MUTATION_IN_PROGRESS" && !MUTATION_LOCK_API_RE.test(String(body.error || ""))) {
    return null;
  }
  return {
    message: MUTATION_LOCK_OWNER_MESSAGE,
    blockingJobId: body.blockingJobId || body.jobId || "",
    lessonId: body.lessonId || "",
  };
}

function isMutationLockOwnerMessage(msg) {
  const folded = String(msg || "").trim().toLowerCase();
  return MUTATION_LOCK_API_RE.test(msg)
    || folded === MUTATION_LOCK_OWNER_MESSAGE.toLowerCase();
}

function dedupeOperatorMessages(messages) {
  const out = [];
  const seen = new Set();
  for (const raw of asArray(messages)) {
    const msg = text(raw, 800);
    if (!msg) continue;
    const key = isMutationLockOwnerMessage(msg) ? "mutation_lock" : msg.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(isMutationLockOwnerMessage(msg) ? MUTATION_LOCK_OWNER_MESSAGE : msg);
  }
  return out;
}

function filterRecentJobs(jobs, activeJobId) {
  const active = text(activeJobId, 120);
  return asArray(jobs).filter((job) => job && job.id !== active);
}

function renderProgressBarHtml(progress, escFn) {
  const esc = escFn || ((v) => String(v ?? ""));
  const { completed, total, percent } = progress;
  return `<div class="co-job-progress" aria-label="Job progress">
    <div class="co-job-progress-track"><div class="co-job-progress-fill" style="width:${esc(percent)}%"></div></div>
    <p class="muted-copy">${esc(completed)}/${esc(total)} complete</p>
  </div>`;
}

const api = {
  normalizeJobStatus,
  bannerTitle,
  bannerSubtitle,
  jobProgress,
  currentStepLabel,
  lessonIdFromJob,
  lessonTitleFromJob,
  isCoverOnlyCommand,
  ownerScopeRows,
  ownerScopeSummaryText,
  ownerExecutionPlanNote,
  buildWhatChangedLines,
  shouldShowReviewDraft,
  buildMutationLockNotice,
  dedupeOperatorMessages,
  filterRecentJobs,
  renderProgressBarHtml,
  mapActionToStepLabel,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.LLHCurriculumOperatorJobStatus = api;
}
