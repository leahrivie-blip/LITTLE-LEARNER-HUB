/**
 * AI Curriculum Operator Phase 8 — Owner-gated review + manual publish helpers.
 *
 * Pure eligibility / fingerprint / confirmation / verification logic.
 * Does NOT publish. Does NOT grant AI jobs publish authority.
 * The Owner API reuses the trusted enrichment publish path separately.
 */
"use strict";

const crypto = require("crypto");

const OWNER_PUBLISH_CODES = Object.freeze({
  OK: "OK",
  LESSON_NOT_FOUND: "LESSON_NOT_FOUND",
  LESSON_ID_MISMATCH: "LESSON_ID_MISMATCH",
  NOT_READY: "NOT_READY",
  PUBLISH_DISABLED: "PUBLISH_DISABLED",
  DRAFT_MISSING: "DRAFT_MISSING",
  TRUE_PUBLISH_BLOCKERS: "TRUE_PUBLISH_BLOCKERS",
  ACTIVE_MUTATION_JOB: "ACTIVE_MUTATION_JOB",
  PENDING_OPERATOR_ACTIONS: "PENDING_OPERATOR_ACTIONS",
  IDENTITY_MISMATCH: "IDENTITY_MISMATCH",
  ACCESS_PLAN_CHANGED: "ACCESS_PLAN_CHANGED",
  TITLE_AGE_CHANGED: "TITLE_AGE_CHANGED",
  DRAFT_CHANGED_REVIEW_AGAIN: "DRAFT_CHANGED_REVIEW_AGAIN",
  CONFIRMATION_REQUIRED: "CONFIRMATION_REQUIRED",
  BATCH_PUBLISH_NOT_IMPLEMENTED: "BATCH_PUBLISH_NOT_IMPLEMENTED",
  PUBLISH_VERIFY_FAILED: "PUBLISH_VERIFY_FAILED",
  INVALID_ACTIVITY_IDS: "INVALID_ACTIVITY_IDS",
  IMAGE_REFS_UNRESOLVED: "IMAGE_REFS_UNRESOLVED",
  PRINTABLE_REFS_UNRESOLVED: "PRINTABLE_REFS_UNRESOLVED",
  PREVIEW_DOWNLOAD_FAILED: "PREVIEW_DOWNLOAD_FAILED",
  SONGS_BOOKS_FAILED: "SONGS_BOOKS_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  OPERATOR_CANNOT_PUBLISH: "OPERATOR_CANNOT_PUBLISH",
});

const READY = "READY_FOR_OWNER_REVIEW";
const BLOCKED_REVIEW_STATUSES = Object.freeze([
  "PARTIAL",
  "BLOCKED",
  "SCOPE_REVIEW_REQUIRED",
  "RUNNING",
  "AUDIT_ONLY",
  "FAILED",
]);

function text(value, max = 400) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeAccessPlan(value) {
  const raw = text(value, 40);
  if (/^pro$/i.test(raw)) return "Pro";
  if (/^free$/i.test(raw)) return "Free";
  return raw || "Free";
}

function normalizeAge(value) {
  return text(value, 120);
}

function hasEnrichmentDraftContent(draft) {
  if (!draft || typeof draft !== "object") return false;
  const week = draft.week && typeof draft.week === "object" ? draft.week : {};
  const acts = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
  if (Object.keys(acts).length) return true;
  const toolkit = week.teacherToolkit && typeof week.teacherToolkit === "object" ? week.teacherToolkit : {};
  return Boolean(
    text(week.familyConnection)
    || text(week.weeklyOverview)
    || text(week.objectives)
    || text(week.weeklyMaterials)
    || text(week.teacherPreparation)
    || text(toolkit.teacherPreparation)
    || text(toolkit.notes)
    || (Array.isArray(week.milestones) && week.milestones.length)
    || (Array.isArray(week.printableIds) && week.printableIds.length)
    || (Array.isArray(week.printableIdeas) && week.printableIdeas.length)
    || (Array.isArray(week.books) && week.books.length)
    || (Array.isArray(week.songs) && week.songs.length)
    || (Array.isArray(toolkit.prepChecklist) && toolkit.prepChecklist.length)
    || (Array.isArray(toolkit.observationFocus) && toolkit.observationFocus.length),
  );
}

function isDraftLesson(lesson) {
  return String(lesson?.status || "").toLowerCase() === "draft";
}

function lessonHasPublishableDraft(lesson) {
  if (hasEnrichmentDraftContent(lesson?.enrichmentDraft)) return true;
  // New Operator-created lessons may carry authored content on the plan while status=draft.
  if (isDraftLesson(lesson) && Array.isArray(lesson?.activityIds) && lesson.activityIds.length) {
    return true;
  }
  return false;
}

/**
 * Fingerprint of the reviewed draft identity + content.
 * Used for stale-confirmation protection (must be rechecked immediately before publish).
 */
function buildOwnerReviewFingerprint(lesson) {
  const draft = lesson?.enrichmentDraft && typeof lesson.enrichmentDraft === "object"
    ? lesson.enrichmentDraft
    : {};
  const payload = {
    lessonId: text(lesson?.id, 160),
    title: text(lesson?.title, 180),
    age: normalizeAge(lesson?.age),
    accessPlan: normalizeAccessPlan(lesson?.plan),
    status: text(lesson?.status, 40).toLowerCase(),
    draftUpdatedAt: text(draft.updatedAt || "", 80),
    lessonUpdatedAt: text(lesson?.updatedAt || "", 80),
    enrichment: {
      week: draft.week || {},
      activities: draft.activities || {},
    },
    live: {
      weeklyOverview: text(lesson?.weeklyOverview, 2000),
      objectives: text(lesson?.objectives, 2000),
      teacherPreparation: text(lesson?.teacherPreparation, 2000),
      familyConnection: text(lesson?.familyConnection, 2000),
      activityIds: Array.isArray(lesson?.activityIds) ? lesson.activityIds.map((id) => text(id, 160)) : [],
      resourceIds: Array.isArray(lesson?.resourceIds) ? lesson.resourceIds.map((id) => text(id, 160)) : [],
      songs: Array.isArray(lesson?.songs) ? lesson.songs : [],
      books: Array.isArray(lesson?.books) ? lesson.books : [],
    },
  };
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return {
    fingerprint,
    lessonId: payload.lessonId,
    title: payload.title,
    age: payload.age,
    accessPlan: payload.accessPlan,
    version: payload.draftUpdatedAt || payload.lessonUpdatedAt || fingerprint.slice(0, 16),
  };
}

function countActivities(lesson, activities) {
  const linked = (Array.isArray(activities) ? activities : []).filter(
    (a) => a && a.lessonPlanId === lesson?.id && String(a.status || "").toLowerCase() !== "archived",
  );
  if (linked.length) return linked.length;
  return Array.isArray(lesson?.activityIds) ? lesson.activityIds.length : 0;
}

function countPrintables(lesson, resources) {
  const ids = new Set((Array.isArray(lesson?.resourceIds) ? lesson.resourceIds : []).map((id) => text(id, 160)).filter(Boolean));
  const draftIds = Array.isArray(lesson?.enrichmentDraft?.week?.printableIds)
    ? lesson.enrichmentDraft.week.printableIds
    : [];
  draftIds.forEach((id) => {
    const clean = text(id, 160);
    if (clean) ids.add(clean);
  });
  const catalog = Array.isArray(resources) ? resources : [];
  return [...ids].filter((id) => catalog.some((r) => r && r.id === id)).length;
}

function findActiveMutationJob(jobs, lessonId) {
  const id = text(lessonId, 160);
  return (Array.isArray(jobs) ? jobs : []).find((job) => {
    const status = String(job?.status || "").toLowerCase();
    if (!["running", "awaiting_confirm", "planned"].includes(status)) return false;
    return (Array.isArray(job?.lessonResults) ? job.lessonResults : []).some((lr) => {
      if (text(lr?.lessonId, 160) !== id && text(lr?.createdLessonId, 160) !== id) return false;
      const lrStatus = String(lr?.status || "").toLowerCase();
      return lrStatus === "pending" || lrStatus === "running";
    });
  }) || null;
}

function findLatestLessonJobResult(jobs, lessonId) {
  const id = text(lessonId, 160);
  let latest = null;
  let latestAt = "";
  (Array.isArray(jobs) ? jobs : []).forEach((job) => {
    (Array.isArray(job?.lessonResults) ? job.lessonResults : []).forEach((lr) => {
      if (text(lr?.lessonId, 160) !== id && text(lr?.createdLessonId, 160) !== id) return;
      const at = text(job?.updatedAt || job?.createdAt || "", 80);
      if (!latest || at >= latestAt) {
        latest = { job, lessonResult: lr };
        latestAt = at;
      }
    });
  });
  return latest;
}

function resolveOwnerReviewStatus(input) {
  const explicit = text(input?.ownerReviewStatus, 40).toUpperCase();
  if (explicit) return explicit;
  const fromJob = text(input?.latestLessonResult?.ownerReviewStatus, 40).toUpperCase();
  if (fromJob) return fromJob;
  return "";
}

function validateActivityIds(lesson, activities) {
  const linked = (Array.isArray(activities) ? activities : []).filter((a) => a && a.lessonPlanId === lesson?.id);
  const ids = Array.isArray(lesson?.activityIds) ? lesson.activityIds : [];
  const missing = ids.filter((id) => !linked.some((a) => a.id === id));
  const empty = linked.filter((a) => !text(a?.id, 160) || !text(a?.title, 180));
  return {
    ok: missing.length === 0 && empty.length === 0 && (ids.length > 0 || linked.length > 0),
    missing,
    emptyCount: empty.length,
  };
}

function validateImageRefs(lesson, activities) {
  const linked = (Array.isArray(activities) ? activities : []).filter((a) => a && a.lessonPlanId === lesson?.id);
  const draftActs = lesson?.enrichmentDraft?.activities && typeof lesson.enrichmentDraft.activities === "object"
    ? lesson.enrichmentDraft.activities
    : {};
  const unresolved = [];
  linked.forEach((act) => {
    const draft = draftActs[act.itemId] || draftActs[act.id] || {};
    const setup = text(draft.setupImageUrl || act.setupImageUrl, 500);
    const example = text(draft.exampleImageUrl || act.exampleImageUrl, 500);
    const req = text(draft.imageRequirement || act.imageRequirement, 40).toLowerCase();
    if ((req === "required" || req === "needed") && !setup && !example) {
      unresolved.push({ activityId: act.id, title: act.title, reason: "required_image_missing" });
    }
    [setup, example].forEach((url) => {
      if (url && url.startsWith("blob:")) {
        unresolved.push({ activityId: act.id, title: act.title, reason: "unresolvable_blob_url" });
      }
    });
  });
  return { ok: unresolved.length === 0, unresolved };
}

function validatePrintableRefs(lesson, resources) {
  const catalog = Array.isArray(resources) ? resources : [];
  const ids = new Set();
  (Array.isArray(lesson?.resourceIds) ? lesson.resourceIds : []).forEach((id) => {
    const clean = text(id, 160);
    if (clean) ids.add(clean);
  });
  (Array.isArray(lesson?.enrichmentDraft?.week?.printableIds) ? lesson.enrichmentDraft.week.printableIds : []).forEach((id) => {
    const clean = text(id, 160);
    if (clean) ids.add(clean);
  });
  const missing = [...ids].filter((id) => !catalog.some((r) => r && r.id === id));
  return { ok: missing.length === 0, missing };
}

function validatePreviewDownload(latestLessonResult) {
  const actions = Array.isArray(latestLessonResult?.printableActions)
    ? latestLessonResult.printableActions
    : [];
  const failed = actions.filter((a) => {
    if (!a || a.status === "skipped" || a.decision === "KEEP" || a.decision === "KEEP_EXISTING" || a.decision === "NOT_NEEDED") {
      return false;
    }
    if (a.status === "failed") return true;
    if (a.previewVerified === false || a.downloadVerified === false) return true;
    return false;
  });
  return { ok: failed.length === 0, failed };
}

function validateSongsBooks(latestLessonResult) {
  const songs = Array.isArray(latestLessonResult?.songActions) ? latestLessonResult.songActions : [];
  const books = Array.isArray(latestLessonResult?.bookActions) ? latestLessonResult.bookActions : [];
  const failed = [...songs, ...books].filter((a) => a && a.status === "failed");
  return { ok: failed.length === 0, failed };
}

function collectPendingFailedOperatorActions(latestLessonResult) {
  const actions = Array.isArray(latestLessonResult?.actions) ? latestLessonResult.actions : [];
  return actions.filter((a) => {
    const st = String(a?.status || "").toLowerCase();
    return st === "pending" || st === "running" || st === "failed";
  });
}

/**
 * Reload-store eligibility gate. Never trusts stale UI.
 */
function evaluatePublishEligibility(input = {}) {
  const lesson = input.lesson && typeof input.lesson === "object" ? input.lesson : null;
  const activities = Array.isArray(input.activities) ? input.activities : [];
  const resources = Array.isArray(input.resources) ? input.resources : [];
  const jobs = Array.isArray(input.jobs) ? input.jobs : [];
  const blockers = [];

  if (!lesson || !text(lesson.id, 160)) {
    return {
      eligible: false,
      publishEnabled: false,
      code: OWNER_PUBLISH_CODES.LESSON_NOT_FOUND,
      ownerReviewStatus: resolveOwnerReviewStatus(input) || null,
      blockers: [{ code: OWNER_PUBLISH_CODES.LESSON_NOT_FOUND, message: "Lesson not found in store." }],
      fingerprint: null,
      summary: null,
    };
  }

  const expectedId = text(input.expectedLessonId || lesson.id, 160);
  if (expectedId && expectedId !== text(lesson.id, 160)) {
    return {
      eligible: false,
      publishEnabled: false,
      code: OWNER_PUBLISH_CODES.LESSON_ID_MISMATCH,
      ownerReviewStatus: null,
      blockers: [{ code: OWNER_PUBLISH_CODES.LESSON_ID_MISMATCH, message: "lessonId does not match store record." }],
      fingerprint: null,
      summary: null,
    };
  }

  const latest = findLatestLessonJobResult(jobs, lesson.id);
  const ownerReviewStatus = resolveOwnerReviewStatus({
    ownerReviewStatus: input.ownerReviewStatus,
    latestLessonResult: latest?.lessonResult,
  });

  if (ownerReviewStatus !== READY) {
    const code = BLOCKED_REVIEW_STATUSES.includes(ownerReviewStatus)
      ? OWNER_PUBLISH_CODES.PUBLISH_DISABLED
      : OWNER_PUBLISH_CODES.NOT_READY;
    blockers.push({
      code,
      message: ownerReviewStatus
        ? `Publish disabled while status is ${ownerReviewStatus}. Only READY_FOR_OWNER_REVIEW may proceed.`
        : "Owner review status is not READY_FOR_OWNER_REVIEW.",
    });
  }

  const activeJob = findActiveMutationJob(jobs, lesson.id);
  if (activeJob) {
    blockers.push({
      code: OWNER_PUBLISH_CODES.ACTIVE_MUTATION_JOB,
      message: `An Operator job (${activeJob.id}) is still active on this lesson.`,
    });
  }

  const pendingActions = collectPendingFailedOperatorActions(latest?.lessonResult);
  if (pendingActions.length) {
    blockers.push({
      code: OWNER_PUBLISH_CODES.PENDING_OPERATOR_ACTIONS,
      message: `${pendingActions.length} pending/failed Operator action(s) remain on the latest job.`,
    });
  }

  if (!lessonHasPublishableDraft(lesson)) {
    blockers.push({
      code: OWNER_PUBLISH_CODES.DRAFT_MISSING,
      message: "No publishable draft found for this lesson.",
    });
  }

  let trueBlockers = [];
  try {
    const ownerWorkspace = require("./teaching-kit-owner-workspace.js");
    const linked = activities.filter((a) => a && a.lessonPlanId === lesson.id);
    trueBlockers = ownerWorkspace.collectTruePublishBlockers(lesson, linked) || [];
  } catch (_error) {
    trueBlockers = [];
  }
  if (trueBlockers.length) {
    blockers.push({
      code: OWNER_PUBLISH_CODES.TRUE_PUBLISH_BLOCKERS,
      message: trueBlockers.map((b) => b.message).join(". "),
      details: trueBlockers,
    });
  }

  const activityCheck = validateActivityIds(lesson, activities);
  if (!activityCheck.ok) {
    blockers.push({
      code: OWNER_PUBLISH_CODES.INVALID_ACTIVITY_IDS,
      message: "Required activity IDs are missing or invalid.",
      details: activityCheck,
    });
  }

  const imageCheck = validateImageRefs(lesson, activities);
  if (!imageCheck.ok) {
    blockers.push({
      code: OWNER_PUBLISH_CODES.IMAGE_REFS_UNRESOLVED,
      message: "Required image references could not be resolved.",
      details: imageCheck.unresolved.slice(0, 12),
    });
  }

  const printableCheck = validatePrintableRefs(lesson, resources);
  if (!printableCheck.ok) {
    blockers.push({
      code: OWNER_PUBLISH_CODES.PRINTABLE_REFS_UNRESOLVED,
      message: "Printable resource references could not be resolved.",
      details: printableCheck.missing.slice(0, 12),
    });
  }

  const previewCheck = validatePreviewDownload(latest?.lessonResult);
  if (!previewCheck.ok) {
    blockers.push({
      code: OWNER_PUBLISH_CODES.PREVIEW_DOWNLOAD_FAILED,
      message: "Preview/Download verification failed for one or more printables.",
    });
  }

  const songsBooksCheck = validateSongsBooks(latest?.lessonResult);
  if (!songsBooksCheck.ok) {
    blockers.push({
      code: OWNER_PUBLISH_CODES.SONGS_BOOKS_FAILED,
      message: "Song/book verification reported failures on the latest Operator job.",
    });
  }

  const fingerprint = buildOwnerReviewFingerprint(lesson);
  const activityCount = countActivities(lesson, activities);
  const printableCount = countPrintables(lesson, resources);
  const publishRequested = Boolean(
    input.publishRequested
    || latest?.lessonResult?.publishRequested
    || (Array.isArray(latest?.job?.command?.confirmations?.reasons)
      && latest.job.command.confirmations.reasons.includes("publish_requested"))
    || (Array.isArray(latest?.job?.planSummary?.confirmReasons)
      && latest.job.planSummary.confirmReasons.includes("publish_requested")),
  );

  const summary = buildOwnerReviewSummary({
    lesson,
    activities,
    resources,
    ownerReviewStatus: ownerReviewStatus || "UNKNOWN",
    latestLessonResult: latest?.lessonResult,
    latestJob: latest?.job,
    fingerprint,
    publishRequested,
    activityCount,
    printableCount,
    blockers,
  });

  const eligible = blockers.length === 0 && ownerReviewStatus === READY;
  return {
    eligible,
    publishEnabled: eligible,
    code: eligible ? OWNER_PUBLISH_CODES.OK : (blockers[0]?.code || OWNER_PUBLISH_CODES.PUBLISH_DISABLED),
    ownerReviewStatus: ownerReviewStatus || null,
    blockers,
    fingerprint,
    summary,
    publishRequested,
    operatorJobId: latest?.job?.id || null,
    trueBlockers,
  };
}

function buildOwnerReviewSummary({
  lesson,
  activities,
  resources,
  ownerReviewStatus,
  latestLessonResult,
  latestJob,
  fingerprint,
  publishRequested,
  activityCount,
  printableCount,
  blockers,
}) {
  const audit = latestLessonResult?.auditAfter || latestLessonResult?.audit || {};
  const readiness = Number(latestLessonResult?.afterScores?.premiumReadinessPercent
    ?? audit?.scores?.premiumReadinessPercent
    ?? 0) || 0;
  const status = String(lesson?.status || "").toLowerCase();
  const changes = buildChangesSummary(latestLessonResult);
  return {
    title: text(lesson?.title, 180),
    lessonId: text(lesson?.id, 160),
    ownerReviewStatus,
    teachingKitPercent: readiness,
    content: {
      weeklyPlan: Boolean(text(lesson?.weeklyOverview) || lesson?.enrichmentDraft?.week?.weeklyOverview),
      activities: activityCount > 0,
      songs: Boolean((Array.isArray(lesson?.songs) && lesson.songs.length)
        || (Array.isArray(lesson?.enrichmentDraft?.week?.songs) && lesson.enrichmentDraft.week.songs.length)
        || latestLessonResult?.songsBooksComplete),
      books: Boolean((Array.isArray(lesson?.books) && lesson.books.length)
        || (Array.isArray(lesson?.enrichmentDraft?.week?.books) && lesson.enrichmentDraft.week.books.length)
        || latestLessonResult?.songsBooksComplete),
    },
    activityImages: latestLessonResult?.imagesComplete || imageRefsOk(lesson, activities)
      ? "Verified"
      : "Needs review",
    printables: latestLessonResult?.printablesComplete || printableRefsOk(lesson, resources)
      ? "Verified"
      : "Needs review",
    finalValidation: blockers.length === 0 ? "No critical blockers" : `${blockers.length} blocker(s)`,
    lastOperatorJob: latestJob
      ? { id: latestJob.id, status: latestJob.status, completed: String(latestJob.status).toLowerCase() === "completed" }
      : null,
    publishStatus: status === "published" || status === "featured" ? "PUBLISHED" : "NOT PUBLISHED",
    accessPlan: normalizeAccessPlan(lesson?.plan),
    age: normalizeAge(lesson?.age),
    activityCount,
    printableCount,
    publishRequested: Boolean(publishRequested),
    fingerprint: fingerprint?.fingerprint || null,
    version: fingerprint?.version || null,
    changes,
  };
}

function imageRefsOk(lesson, activities) {
  return validateImageRefs(lesson, activities).ok;
}

function printableRefsOk(lesson, resources) {
  return validatePrintableRefs(lesson, resources).ok;
}

function buildChangesSummary(lessonResult) {
  const updated = Array.isArray(lessonResult?.updated) ? lessonResult.updated : [];
  const kept = Array.isArray(lessonResult?.kept) ? lessonResult.kept : [];
  const changedLabels = updated.slice(0, 24).map((item) => {
    if (typeof item === "string") return item;
    if (item?.activityTitle) return item.activityTitle;
    if (item?.path) return String(item.path);
    if (item?.label) return String(item.label);
    return "change";
  });
  return {
    changed: changedLabels,
    kept: kept.slice(0, 24).map((k) => (typeof k === "string" ? k : text(k?.label || k?.path || "", 120))),
    changedCount: updated.length,
    keptCount: kept.length,
  };
}

function buildConfirmationPayload(eligibility) {
  const summary = eligibility?.summary || {};
  return {
    title: summary.title || "",
    lessonId: summary.lessonId || "",
    accessPlan: summary.accessPlan || "Free",
    age: summary.age || "",
    activityCount: summary.activityCount || 0,
    printableCount: summary.printableCount || 0,
    fingerprint: eligibility?.fingerprint?.fingerprint || summary.fingerprint || "",
    version: eligibility?.fingerprint?.version || summary.version || "",
    operatorJobId: eligibility?.operatorJobId || null,
    message: `Publish “${summary.title || "this lesson"}”?`,
    detail: "This will make the current reviewed draft available to users according to its access plan. This action changes the live curriculum.",
    requireExplicitConfirm: true,
  };
}

/**
 * Compare confirmation fingerprint/identity against freshly reloaded lesson.
 */
function assertConfirmationStillFresh({ lesson, confirmation, eligibility }) {
  if (!confirmation || confirmation.confirmPublish !== true) {
    return {
      ok: false,
      code: OWNER_PUBLISH_CODES.CONFIRMATION_REQUIRED,
      error: "Explicit Owner confirmPublish is required.",
    };
  }
  if (!lesson) {
    return { ok: false, code: OWNER_PUBLISH_CODES.LESSON_NOT_FOUND, error: "Lesson not found." };
  }
  const expectedFp = text(confirmation.reviewedFingerprint || confirmation.fingerprint, 128);
  const currentFp = text(eligibility?.fingerprint?.fingerprint, 128);
  if (!expectedFp || !currentFp || expectedFp !== currentFp) {
    return {
      ok: false,
      code: OWNER_PUBLISH_CODES.DRAFT_CHANGED_REVIEW_AGAIN,
      error: "Draft changed since confirmation opened. Review again before publishing.",
    };
  }
  const expectedTitle = text(confirmation.title, 180);
  const expectedAge = normalizeAge(confirmation.age);
  const expectedPlan = normalizeAccessPlan(confirmation.accessPlan);
  if (expectedTitle && expectedTitle !== text(lesson.title, 180)) {
    return {
      ok: false,
      code: OWNER_PUBLISH_CODES.TITLE_AGE_CHANGED,
      error: "Lesson title changed since confirmation. Review again.",
    };
  }
  if (expectedAge && expectedAge !== normalizeAge(lesson.age)) {
    return {
      ok: false,
      code: OWNER_PUBLISH_CODES.TITLE_AGE_CHANGED,
      error: "Lesson age changed since confirmation. Review again.",
    };
  }
  if (expectedPlan && expectedPlan !== normalizeAccessPlan(lesson.plan)) {
    return {
      ok: false,
      code: OWNER_PUBLISH_CODES.ACCESS_PLAN_CHANGED,
      error: "Access plan changed since confirmation. Review again.",
    };
  }
  if (text(confirmation.lessonId, 160) && text(confirmation.lessonId, 160) !== text(lesson.id, 160)) {
    return {
      ok: false,
      code: OWNER_PUBLISH_CODES.LESSON_ID_MISMATCH,
      error: "Confirmation lessonId does not match store lesson.",
    };
  }
  return { ok: true, code: OWNER_PUBLISH_CODES.OK };
}

function verifyPublishedState({
  lessonId,
  beforeLesson,
  afterLesson,
  activities,
  resources,
  otherLessonsBefore = [],
  otherLessonsAfter = [],
  expectedTitle,
  expectedAge,
  expectedAccessPlan,
  expectedActivityCount,
} = {}) {
  const issues = [];
  if (!afterLesson || text(afterLesson.id, 160) !== text(lessonId, 160)) {
    issues.push("published lessonId mismatch or missing");
  }
  const status = String(afterLesson?.status || "").toLowerCase();
  if (status !== "published" && status !== "featured") {
    issues.push(`status is ${status || "missing"}, expected published`);
  }
  if (expectedTitle && text(afterLesson?.title, 180) !== text(expectedTitle, 180)) {
    issues.push("title changed during publish");
  }
  if (expectedAge && normalizeAge(afterLesson?.age) !== normalizeAge(expectedAge)) {
    issues.push("age changed during publish");
  }
  if (expectedAccessPlan && normalizeAccessPlan(afterLesson?.plan) !== normalizeAccessPlan(expectedAccessPlan)) {
    issues.push("access plan changed during publish");
  }
  const activityCount = countActivities(afterLesson, activities);
  if (expectedActivityCount != null && activityCount !== Number(expectedActivityCount)) {
    issues.push(`activity count ${activityCount} !== expected ${expectedActivityCount}`);
  }
  const imageCheck = validateImageRefs(afterLesson, activities);
  if (!imageCheck.ok) issues.push("required images unresolved after publish");
  const printableCheck = validatePrintableRefs(afterLesson, resources);
  if (!printableCheck.ok) issues.push("printable relationships unresolved after publish");

  const beforeMap = new Map((otherLessonsBefore || []).map((l) => [l.id, JSON.stringify({
    title: l.title, status: l.status, updatedAt: l.updatedAt, plan: l.plan,
  })]));
  (otherLessonsAfter || []).forEach((l) => {
    if (!beforeMap.has(l.id)) return;
    if (l.id === lessonId) return;
    const before = beforeMap.get(l.id);
    const after = JSON.stringify({
      title: l.title, status: l.status, updatedAt: l.updatedAt, plan: l.plan,
    });
    if (before !== after) issues.push(`unrelated lesson changed: ${l.id}`);
  });

  if (hasEnrichmentDraftContent(afterLesson?.enrichmentDraft) && beforeLesson && hasEnrichmentDraftContent(beforeLesson.enrichmentDraft)) {
    // Enrichment publish should clear draft; status-only publish may keep none.
    // Only flag if enrichment path claimed success but draft remains with prior content fingerprint mismatch ambiguity.
  }

  return {
    ok: issues.length === 0,
    code: issues.length === 0 ? OWNER_PUBLISH_CODES.OK : OWNER_PUBLISH_CODES.PUBLISH_VERIFY_FAILED,
    issues,
    publishedAt: afterLesson?.publishedAt || afterLesson?.teachingKit?.lastEnrichmentPublishedAt || null,
    status: afterLesson?.status || null,
    accessPlan: normalizeAccessPlan(afterLesson?.plan),
    activityCount,
    printableCount: countPrintables(afterLesson, resources),
  };
}

function rejectBatchPublish(lessonIds) {
  const ids = Array.isArray(lessonIds) ? lessonIds.filter(Boolean) : [];
  if (ids.length > 1) {
    return {
      ok: false,
      code: OWNER_PUBLISH_CODES.BATCH_PUBLISH_NOT_IMPLEMENTED,
      error: "Batch publish is not enabled in Phase 8. Publish one lesson at a time.",
      lessonIds: ids,
    };
  }
  return { ok: true };
}

/** AI Operator must never treat publish as an executable action. */
function assertOperatorCannotPublish(command) {
  if (command?.actions?.publish === true) {
    return {
      ok: false,
      code: OWNER_PUBLISH_CODES.OPERATOR_CANNOT_PUBLISH,
      error: "AI Curriculum Operator jobs cannot publish. Owner confirmation is required.",
    };
  }
  return { ok: true };
}

module.exports = {
  OWNER_PUBLISH_CODES,
  READY,
  BLOCKED_REVIEW_STATUSES,
  text,
  normalizeAccessPlan,
  normalizeAge,
  hasEnrichmentDraftContent,
  lessonHasPublishableDraft,
  buildOwnerReviewFingerprint,
  evaluatePublishEligibility,
  buildOwnerReviewSummary,
  buildConfirmationPayload,
  buildChangesSummary,
  assertConfirmationStillFresh,
  verifyPublishedState,
  rejectBatchPublish,
  assertOperatorCannotPublish,
  findLatestLessonJobResult,
  findActiveMutationJob,
  countActivities,
  countPrintables,
};
