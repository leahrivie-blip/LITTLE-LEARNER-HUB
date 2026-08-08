/**
 * Curriculum Draft Review Queue — shared model (permanent, reusable).
 * Phase 1: submit / review / revision / discard / rollback. No publish.
 */
"use strict";

const crypto = require("crypto");

const STATUSES = Object.freeze([
  "submitted",
  "in_review",
  "revision_requested",
  "revised",
  "ready_for_owner_approval",
  "approved",
  "published",
  "discarded",
  "rolled_back",
  "failed_validation",
]);

const STATUS_LABELS = Object.freeze({
  submitted: "Submitted",
  in_review: "In Review",
  revision_requested: "Revision Requested",
  revised: "Revised",
  ready_for_owner_approval: "Ready for Owner Approval",
  approved: "Approved",
  published: "Published",
  discarded: "Discarded",
  rolled_back: "Rolled Back",
  failed_validation: "Failed Validation",
});

const PHASE1_ACTIONS = Object.freeze([
  "list",
  "get",
  "submit",
  "submit-seed",
  "save-edited",
  "add-notes",
  "request-revision",
  "discard",
  "rollback",
  "compare",
  "mark-in-review",
]);

const PHASE2_ONLY = Object.freeze(["approve", "publish"]);

function sha256Short(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 24);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function normalizeStatus(value) {
  const key = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return STATUSES.includes(key) ? key : "submitted";
}

function statusLabel(status) {
  return STATUS_LABELS[normalizeStatus(status)] || status;
}

function generateId(prefix) {
  return `${prefix}-${crypto.randomBytes(8).toString("hex")}`;
}

function publishedBodyPayload(plan) {
  if (!plan || typeof plan !== "object") return {};
  const {
    enrichmentDraft: _d,
    enrichmentDraftUndo: _u,
    enrichmentPublishHistory: _h,
    enrichmentPublished: _p,
    resourceIds: _r,
    updatedAt: _u2,
    ...rest
  } = plan;
  return cloneJson(rest);
}

function publishedBodyFingerprint(plan) {
  return sha256Short(JSON.stringify(publishedBodyPayload(plan)));
}

function activityLinkFingerprint(plan, activities) {
  const planId = String(plan?.id || "");
  const linked = (activities || [])
    .filter((a) => a && a.lessonPlanId === planId)
    .map((a) => ({ id: a.id, itemId: a.itemId || "", title: a.title || "", dayOfWeek: a.dayOfWeek || "" }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const daily = [];
  const days = plan?.dailyPlans && typeof plan.dailyPlans === "object" ? plan.dailyPlans : {};
  Object.keys(days).sort().forEach((day) => {
    (days[day]?.items || []).forEach((item) => {
      daily.push({ day, itemId: item.itemId || item.id || "", title: item.title || "" });
    });
  });
  return sha256Short(JSON.stringify({ linked, daily }));
}

function draftContentFingerprint(draft) {
  const cloned = cloneJson(draft || {});
  if (cloned && typeof cloned === "object") {
    delete cloned.updatedAt;
    delete cloned.lastEditedBy;
  }
  return sha256Short(JSON.stringify(cloned));
}
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return false;
  const acts = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
  if (Object.keys(acts).some((k) => acts[k] && typeof acts[k] === "object" && Object.keys(acts[k]).length)) {
    return true;
  }
  const week = draft.week && typeof draft.week === "object" ? draft.week : {};
  return Object.keys(week).some((k) => {
    const v = week[k];
    if (v == null) return false;
    if (typeof v === "string") return Boolean(v.trim());
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  });
}

function stripLocalUrls(value) {
  if (typeof value === "string") {
    if (/^file:\/\//i.test(value) || /^seed:\/\//i.test(value)) return "";
    return value;
  }
  if (Array.isArray(value)) return value.map(stripLocalUrls);
  if (value && typeof value === "object") {
    const next = {};
    Object.keys(value).forEach((k) => { next[k] = stripLocalUrls(value[k]); });
    return next;
  }
  return value;
}

function sanitizeDraft(draft, meta = {}) {
  const cleaned = stripLocalUrls(cloneJson(draft || {}));
  cleaned.updatedAt = new Date().toISOString();
  if (meta.lastEditedBy) cleaned.lastEditedBy = meta.lastEditedBy;
  cleaned.importChannel = "draft_review_queue";
  if (meta.batchId) cleaned.batchId = meta.batchId;
  return cleaned;
}

function countMissingRequiredImages(draft) {
  const acts = draft?.activities && typeof draft.activities === "object" ? draft.activities : {};
  let missing = 0;
  Object.values(acts).forEach((act) => {
    if (!act || typeof act !== "object") return;
    const req = String(act.imageRequirement || "").toLowerCase();
    if (req === "required" || req === "setup_required" || req === "example_required") {
      const has = Boolean(act.exampleImageUrl || act.setupImageUrl || act.exampleMediaAssetId || act.setupMediaAssetId);
      if (!has) missing += 1;
    }
  });
  return missing;
}

function buildStats(draft, draftResourceIds = []) {
  const acts = draft?.activities && typeof draft.activities === "object" ? draft.activities : {};
  const week = draft?.week && typeof draft.week === "object" ? draft.week : {};
  return {
    changedActivities: Object.keys(acts).length,
    printables: Array.isArray(draftResourceIds) ? draftResourceIds.length : 0,
    missingRequiredImages: countMissingRequiredImages(draft),
    songCount: Array.isArray(week.songs) ? week.songs.length : 0,
    bookCount: Array.isArray(week.books) ? week.books.length : 0,
  };
}

function buildScores(qualityReport) {
  if (!qualityReport || typeof qualityReport !== "object") {
    return {
      structuralScore: null,
      premiumScore: null,
      overallScore: null,
      blockers: [],
      scoringMode: "actual_draft_catalog",
    };
  }
  const raw = Array.isArray(qualityReport.blockingIssues)
    ? qualityReport.blockingIssues
    : (Array.isArray(qualityReport.publishBlockers) ? qualityReport.publishBlockers : []);
  return {
    structuralScore: qualityReport.completionPercent ?? qualityReport.structuralScore ?? null,
    premiumScore: qualityReport.premiumReadinessPercent ?? qualityReport.premiumScore ?? null,
    overallScore: qualityReport.overallScore ?? null,
    blockers: raw.map((item) => (typeof item === "string" ? item : (item?.code || item?.message || ""))).filter(Boolean).slice(0, 40),
    scoringMode: "actual_draft_catalog",
  };
}

function normalizeEntry(value) {
  const e = value && typeof value === "object" ? value : {};
  const id = String(e.id || "").trim();
  const lessonPlanId = String(e.lessonPlanId || "").trim();
  if (!id || !lessonPlanId) return null;
  const status = normalizeStatus(e.status);
  return {
    id,
    lessonPlanId,
    title: String(e.title || "").trim(),
    age: String(e.age || "").trim(),
    theme: String(e.theme || "").trim(),
    submissionKey: String(e.submissionKey || e.id).trim(),
    revisionId: String(e.revisionId || "").trim(),
    batchId: String(e.batchId || "").trim(),
    batchName: String(e.batchName || "").trim(),
    source: String(e.source || "curriculum-tool").trim(),
    status,
    statusLabel: statusLabel(status),
    submittedAt: String(e.submittedAt || e.receivedAt || "").trim(),
    updatedAt: String(e.updatedAt || "").trim(),
    enrichmentDraft: e.enrichmentDraft && typeof e.enrichmentDraft === "object" ? e.enrichmentDraft : null,
    draftResourceIds: Array.isArray(e.draftResourceIds) ? e.draftResourceIds.map((x) => String(x || "").trim()).filter(Boolean) : [],
    versions: Array.isArray(e.versions) ? e.versions.slice(0, 30) : [],
    snapshots: e.snapshots && typeof e.snapshots === "object" ? e.snapshots : null,
    reviewNotes: String(e.reviewNotes || "").trim(),
    notesHistory: Array.isArray(e.notesHistory) ? e.notesHistory.slice(0, 50) : [],
    scores: e.scores && typeof e.scores === "object" ? e.scores : buildScores(null),
    stats: e.stats && typeof e.stats === "object" ? e.stats : buildStats(e.enrichmentDraft, e.draftResourceIds),
    qualityResults: e.qualityResults && typeof e.qualityResults === "object" ? e.qualityResults : null,
    validationErrors: Array.isArray(e.validationErrors) ? e.validationErrors : [],
  };
}

function normalizeQueue(value) {
  return (Array.isArray(value) ? value : []).map(normalizeEntry).filter(Boolean).slice(0, 500);
}

function listItem(entry) {
  const e = normalizeEntry(entry);
  if (!e) return null;
  return {
    id: e.id,
    lessonPlanId: e.lessonPlanId,
    title: e.title,
    age: e.age,
    theme: e.theme,
    submittedAt: e.submittedAt,
    batchId: e.batchId,
    batchName: e.batchName,
    revisionId: e.revisionId,
    submissionKey: e.submissionKey,
    source: e.source,
    status: e.status,
    statusLabel: e.statusLabel,
    structuralScore: e.scores?.structuralScore ?? null,
    premiumScore: e.scores?.premiumScore ?? null,
    blockers: e.scores?.blockers || [],
    changedActivities: e.stats?.changedActivities ?? 0,
    printables: e.stats?.printables ?? 0,
    missingRequiredImages: e.stats?.missingRequiredImages ?? 0,
    reviewNotes: e.reviewNotes,
  };
}

function matchLesson(plan, expected = {}) {
  const errors = [];
  if (!plan) {
    errors.push({ code: "lesson_not_found", message: "Unknown lesson ID. Draft Review never creates lessons silently." });
    return { ok: false, errors };
  }
  const norm = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (expected.lessonPlanId && plan.id !== expected.lessonPlanId) {
    errors.push({ code: "lesson_id_mismatch", message: `Lesson id mismatch.` });
  }
  if (expected.age && norm(plan.age || plan.ageBucket) !== norm(expected.age)) {
    errors.push({ code: "age_mismatch", message: `Age mismatch: "${plan.age}" vs "${expected.age}"` });
  }
  if (expected.theme && norm(plan.theme) !== norm(expected.theme)) {
    errors.push({ code: "theme_mismatch", message: `Theme mismatch: "${plan.theme}" vs "${expected.theme}"` });
  }
  if (expected.title && norm(plan.title) !== norm(expected.title)) {
    errors.push({ code: "title_mismatch", message: `Title mismatch: "${plan.title}" vs "${expected.title}"` });
  }
  return { ok: errors.length === 0, errors };
}

function buildCompare(publishedPlan, enrichmentDraft) {
  const acts = enrichmentDraft?.activities && typeof enrichmentDraft.activities === "object"
    ? enrichmentDraft.activities
    : {};
  const week = enrichmentDraft?.week && typeof enrichmentDraft.week === "object" ? enrichmentDraft.week : {};
  const changed = [];
  Object.keys(acts).forEach((key) => {
    Object.keys(acts[key] || {}).forEach((field) => changed.push({ scope: "activity", key, field }));
  });
  const weekFields = Object.keys(week).filter((field) => {
    const v = week[field];
    if (v == null || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  });
  return {
    publishedTitle: publishedPlan?.title || "",
    activityKeysTouched: Object.keys(acts).length,
    weekFieldsTouched: weekFields.length,
    changedFields: changed.slice(0, 400),
    weekFields: weekFields.slice(0, 100),
  };
}

function phaseGate(action) {
  const key = String(action || "").trim().toLowerCase();
  if (PHASE2_ONLY.includes(key)) {
    return {
      blocked: true,
      code: "phase2_required",
      error: `“${key}” is unavailable in Phase 1. Publishing/approval will be added only after the queue workflow is approved.`,
    };
  }
  return { blocked: false };
}

/** Optional local seed descriptors (first proof only — architecture is not limited to these). */
const LOCAL_SEED_PACKAGES = Object.freeze([
  {
    packageId: "amazing-apples",
    lessonPlanId: "cur-lp-toddler-amazing-apples",
    title: "Amazing Apples",
    age: "Toddler",
    theme: "Apples",
    relativeDir: "amazing-apples",
    pdfFile: "Amazing-Apples-Picture-Card-Pack.pdf",
    resourceId: "cur-res-draft-amazing-apples-picture-cards",
    resourceTitle: "Amazing Apples Picture Card Pack",
  },
  {
    packageId: "all-about-me",
    lessonPlanId: "cur-lp-preschool-all-about-me",
    title: "All About Me",
    age: "Preschool",
    theme: "All About Me",
    relativeDir: "all-about-me",
    pdfFile: "All-About-Me-Picture-Card-Pack.pdf",
    resourceId: "cur-res-draft-all-about-me-picture-cards",
    resourceTitle: "All About Me Picture Card Pack",
  },
]);

module.exports = {
  STATUSES,
  STATUS_LABELS,
  PHASE1_ACTIONS,
  PHASE2_ONLY,
  LOCAL_SEED_PACKAGES,
  sha256Short,
  cloneJson,
  normalizeStatus,
  statusLabel,
  generateId,
  publishedBodyFingerprint,
  activityLinkFingerprint,
  enrichmentHasContent,
  draftContentFingerprint,
  stripLocalUrls,
  sanitizeDraft,
  buildStats,
  buildScores,
  normalizeEntry,
  normalizeQueue,
  listItem,
  matchLesson,
  buildCompare,
  phaseGate,
};
