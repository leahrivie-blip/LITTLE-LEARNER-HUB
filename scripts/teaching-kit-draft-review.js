/**
 * Permanent Curriculum Draft Review Queue — shared model (Phase 1).
 *
 * Phase 1: submit, queue, preview data, compare, request revision, discard, rollback.
 * Phase 2 (later): approve + separate manual publish + batches up to 10.
 *
 * Safety:
 * - Attach to existing lesson IDs only (unless createAsNewLesson — Phase 1 blocked)
 * - Never auto-publish
 * - Draft resources stay draft
 * - Published lesson body unchanged until owner Publish (Phase 2)
 */
"use strict";

const crypto = require("crypto");

const DRAFT_REVIEW_STATUSES = Object.freeze([
  "incoming",
  "needs_owner_review",
  "changes_requested",
  "revised",
  "approved_for_publishing",
  "published",
  "rejected",
  "rolled_back",
]);

const PHASE1_ACTIONS = Object.freeze([
  "list",
  "get",
  "submit",
  "submit-seed-packages",
  "request-revision",
  "discard",
  "rollback",
  "compare",
  "preview",
]);

const PHASE2_BLOCKED_ACTIONS = Object.freeze([
  "approve",
  "publish",
  "reject", // use discard for Phase 1 reject-equivalent
]);

const STATUS_LABELS = Object.freeze({
  incoming: "Incoming",
  needs_owner_review: "Needs Owner Review",
  changes_requested: "Changes Requested",
  revised: "Revised",
  approved_for_publishing: "Approved for Publishing",
  published: "Published",
  rejected: "Rejected",
  rolled_back: "Rolled Back",
});

const BLOCKED_LESSON_IDS = Object.freeze([
  "cur-lp-preschool-farm-animals",
  "cur-lp-toddler-farm-friends",
]);

/** Phase 1 seed allowlist — prove the permanent queue with these two only. */
const PHASE1_SEED_PACKAGES = Object.freeze([
  {
    packageId: "amazing-apples",
    lessonPlanId: "cur-lp-toddler-amazing-apples",
    expectedTitle: "Amazing Apples",
    expectedAge: "Toddler",
    expectedTheme: "Apples",
  },
  {
    packageId: "all-about-me",
    lessonPlanId: "cur-lp-preschool-all-about-me",
    expectedTitle: "All About Me",
    expectedAge: "Preschool",
    expectedTheme: "All About Me",
  },
]);

function sha256Short(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 24);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function normalizeStatus(value) {
  const key = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return DRAFT_REVIEW_STATUSES.includes(key) ? key : "incoming";
}

function statusLabel(status) {
  return STATUS_LABELS[normalizeStatus(status)] || status;
}

function generateDraftReviewId() {
  return `cdr-${crypto.randomBytes(10).toString("hex")}`;
}

function generateRollbackId() {
  return `cdr-snap-${crypto.randomBytes(10).toString("hex")}`;
}

function publishedLessonBodyPayload(plan) {
  if (!plan || typeof plan !== "object") return {};
  const {
    enrichmentDraft: _d,
    enrichmentDraftUndo: _u,
    enrichmentPublishHistory: _h,
    enrichmentPublished: _p,
    resourceIds: _r,
    updatedAt: _updatedAt,
    ...rest
  } = plan;
  return cloneJson(rest);
}

function publishedLessonBodyFingerprint(plan) {
  return sha256Short(JSON.stringify(publishedLessonBodyPayload(plan)));
}

function activityLinkFingerprint(plan, activities) {
  const planId = String(plan?.id || "");
  const linked = (activities || [])
    .filter((item) => item && item.lessonPlanId === planId)
    .map((item) => ({
      id: item.id,
      itemId: item.itemId || "",
      sourceKey: item.sourceKey || "",
      title: item.title || "",
      dayOfWeek: item.dayOfWeek || "",
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const dailyKeys = [];
  const days = plan?.dailyPlans && typeof plan.dailyPlans === "object" ? plan.dailyPlans : {};
  Object.keys(days).sort().forEach((day) => {
    (days[day]?.items || []).forEach((item) => {
      dailyKeys.push({ day, itemId: item.itemId || item.id || "", title: item.title || "" });
    });
  });
  return {
    fingerprint: sha256Short(JSON.stringify({ linked, dailyKeys })),
    linkedActivityCount: linked.length,
    dailyItemCount: dailyKeys.length,
  };
}

function enrichmentDraftHasContent(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return false;
  const activities = draft.activities && typeof draft.activities === "object" && !Array.isArray(draft.activities)
    ? draft.activities
    : {};
  if (Object.keys(activities).length > 0) {
    return Object.values(activities).some((act) => act && typeof act === "object" && Object.keys(act).length > 0);
  }
  const week = draft.week && typeof draft.week === "object" && !Array.isArray(draft.week) ? draft.week : {};
  return Object.keys(week).some((key) => {
    const value = week[key];
    if (value == null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  });
}

function stripLocalFileUrls(value) {
  if (typeof value === "string") return /^file:\/\//i.test(value) ? "" : value;
  if (Array.isArray(value)) return value.map((item) => stripLocalFileUrls(item));
  if (value && typeof value === "object") {
    const next = {};
    Object.keys(value).forEach((key) => { next[key] = stripLocalFileUrls(value[key]); });
    return next;
  }
  return value;
}

function sanitizeEnrichmentDraftForQueue(draft, { lastEditedBy = "", batchId = "" } = {}) {
  const cleaned = stripLocalFileUrls(cloneJson(draft || {}));
  cleaned.updatedAt = new Date().toISOString();
  if (lastEditedBy) cleaned.lastEditedBy = lastEditedBy;
  cleaned.importChannel = "draft_review_queue";
  if (batchId) cleaned.batchId = batchId;
  return cleaned;
}

function countChangedActivities(publishedPlan, enrichmentDraft) {
  const draftActs = enrichmentDraft?.activities && typeof enrichmentDraft.activities === "object"
    ? enrichmentDraft.activities
    : {};
  return Object.keys(draftActs).length;
}

function songsBooksStatus(enrichmentDraft) {
  const week = enrichmentDraft?.week && typeof enrichmentDraft.week === "object" ? enrichmentDraft.week : {};
  const songs = Array.isArray(week.songs) ? week.songs : [];
  const books = Array.isArray(week.books) ? week.books : [];
  const originalOrPd = songs.filter((s) => {
    const rights = String(s?.rightsStatus || "").toLowerCase();
    return rights === "original" || rights === "public_domain" || rights === "pd";
  }).length;
  const verifiedBooks = books.filter((b) => Boolean(String(b?.verificationSource || "").trim())).length;
  return {
    songCount: songs.length,
    originalOrPublicDomainSongs: originalOrPd,
    bookCount: books.length,
    verifiedBooks,
    label: `${songs.length} songs (${originalOrPd} original/PD) · ${books.length} books (${verifiedBooks} verified)`,
  };
}

function countImages(enrichmentDraft) {
  const draftActs = enrichmentDraft?.activities && typeof enrichmentDraft.activities === "object"
    ? enrichmentDraft.activities
    : {};
  let count = 0;
  Object.values(draftActs).forEach((act) => {
    if (!act || typeof act !== "object") return;
    if (act.exampleImageUrl || act.setupImageUrl || act.exampleMediaAssetId || act.setupMediaAssetId) count += 1;
  });
  return count;
}

function buildQueueStats(enrichmentDraft, draftResourceIds = []) {
  return {
    changedActivities: countChangedActivities(null, enrichmentDraft),
    newPrintables: Array.isArray(draftResourceIds) ? draftResourceIds.length : 0,
    images: countImages(enrichmentDraft),
    songsBooks: songsBooksStatus(enrichmentDraft),
  };
}

function buildScoresSummary(qualityReport) {
  if (!qualityReport || typeof qualityReport !== "object") {
    return {
      structuralScore: null,
      premiumScore: null,
      overallScore: null,
      overallLabel: "",
      blockingIssues: [],
      scoringMode: "actual_draft_catalog",
    };
  }
  const blockers = Array.isArray(qualityReport.blockingIssues)
    ? qualityReport.blockingIssues
    : (Array.isArray(qualityReport.publishBlockers) ? qualityReport.publishBlockers : []);
  const blockingIssues = blockers.map((item) => {
    if (typeof item === "string") return item;
    return item?.code || item?.message || item?.title || String(item);
  }).filter(Boolean).slice(0, 40);
  return {
    structuralScore: qualityReport.completionPercent ?? qualityReport.structuralScore ?? null,
    premiumScore: qualityReport.premiumReadinessPercent ?? qualityReport.premiumScore ?? null,
    overallScore: qualityReport.overallScore ?? null,
    overallLabel: qualityReport.overallLabel || qualityReport.publishReadinessLabel || "",
    blockingIssues,
    scoringMode: "actual_draft_catalog",
    note: "Honest actual scores with draft printables — never treat draft resources as published.",
  };
}

function normalizeDraftReviewEntry(value) {
  const entry = value && typeof value === "object" ? value : {};
  const id = String(entry.id || "").trim();
  const lessonPlanId = String(entry.lessonPlanId || "").trim();
  if (!id || !lessonPlanId) return null;
  if (BLOCKED_LESSON_IDS.includes(lessonPlanId)) return null;
  const status = normalizeStatus(entry.status);
  return {
    id,
    lessonPlanId,
    title: String(entry.title || "").trim(),
    age: String(entry.age || "").trim(),
    theme: String(entry.theme || "").trim(),
    batchId: String(entry.batchId || "").trim(),
    batchName: String(entry.batchName || "").trim(),
    source: String(entry.source || "cursor-agent").trim(),
    status,
    statusLabel: statusLabel(status),
    receivedAt: String(entry.receivedAt || "").trim(),
    updatedAt: String(entry.updatedAt || "").trim(),
    rollbackId: String(entry.rollbackId || "").trim(),
    enrichmentDraft: entry.enrichmentDraft && typeof entry.enrichmentDraft === "object"
      ? entry.enrichmentDraft
      : null,
    draftResourceIds: Array.isArray(entry.draftResourceIds)
      ? entry.draftResourceIds.map((x) => String(x || "").trim()).filter(Boolean)
      : [],
    draftVersions: Array.isArray(entry.draftVersions) ? entry.draftVersions.slice(0, 20) : [],
    snapshots: entry.snapshots && typeof entry.snapshots === "object" ? entry.snapshots : null,
    reviewNotes: String(entry.reviewNotes || "").trim(),
    ownerNotesHistory: Array.isArray(entry.ownerNotesHistory) ? entry.ownerNotesHistory.slice(0, 50) : [],
    scores: entry.scores && typeof entry.scores === "object" ? entry.scores : buildScoresSummary(null),
    stats: entry.stats && typeof entry.stats === "object" ? entry.stats : buildQueueStats(entry.enrichmentDraft, entry.draftResourceIds),
    createAsNewLesson: entry.createAsNewLesson === true,
    phase: entry.phase || "phase1",
    publishedVersionLabel: entry.publishedVersionLabel || "Published",
    draftVersionLabel: entry.draftVersionLabel || "Incoming draft",
  };
}

function normalizeDraftReviewQueue(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map(normalizeDraftReviewEntry).filter(Boolean).slice(0, 200);
}

function queueListItem(entry) {
  const item = normalizeDraftReviewEntry(entry);
  if (!item) return null;
  return {
    id: item.id,
    lessonPlanId: item.lessonPlanId,
    title: item.title,
    age: item.age,
    theme: item.theme,
    publishedVersionLabel: item.publishedVersionLabel,
    draftVersionLabel: item.draftVersionLabel,
    receivedAt: item.receivedAt,
    updatedAt: item.updatedAt,
    batchName: item.batchName,
    batchId: item.batchId,
    source: item.source,
    status: item.status,
    statusLabel: item.statusLabel,
    structuralScore: item.scores?.structuralScore ?? null,
    premiumScore: item.scores?.premiumScore ?? null,
    blockingIssues: item.scores?.blockingIssues || [],
    changedActivities: item.stats?.changedActivities ?? 0,
    newPrintables: item.stats?.newPrintables ?? 0,
    images: item.stats?.images ?? 0,
    songsBooksStatus: item.stats?.songsBooks?.label || "",
    rollbackId: item.rollbackId,
  };
}

function buildCompareSummary(publishedPlan, enrichmentDraft) {
  const draftActs = enrichmentDraft?.activities && typeof enrichmentDraft.activities === "object"
    ? enrichmentDraft.activities
    : {};
  const week = enrichmentDraft?.week && typeof enrichmentDraft.week === "object" ? enrichmentDraft.week : {};
  const addedFields = [];
  const changedFields = [];
  Object.keys(draftActs).forEach((key) => {
    const act = draftActs[key] || {};
    Object.keys(act).forEach((field) => {
      changedFields.push({ scope: "activity", key, field });
    });
  });
  Object.keys(week).forEach((field) => {
    const value = week[field];
    if (value == null || value === "" || (Array.isArray(value) && !value.length)) return;
    addedFields.push({ scope: "week", field });
  });
  return {
    activityKeysTouched: Object.keys(draftActs).length,
    weekFieldsTouched: addedFields.length,
    changedFields: changedFields.slice(0, 300),
    weekFields: addedFields.slice(0, 100),
    publishedTitle: publishedPlan?.title || "",
    publishedAge: publishedPlan?.age || "",
    publishedTheme: publishedPlan?.theme || "",
  };
}

function matchLessonGuard(plan, expected = {}) {
  const errors = [];
  if (!plan) {
    errors.push({ code: "lesson_not_found", message: "Lesson not found. Draft Review never creates lessons unless Create as new lesson is explicitly chosen (Phase 1 blocked)." });
    return { ok: false, errors };
  }
  if (BLOCKED_LESSON_IDS.includes(plan.id)) {
    errors.push({ code: "blocked_lesson", message: "Farm Animals (and related) lessons are blocked from Draft Review submissions." });
  }
  if (expected.lessonPlanId && plan.id !== expected.lessonPlanId) {
    errors.push({ code: "lesson_id_mismatch", message: `Lesson id mismatch: ${plan.id} vs ${expected.lessonPlanId}` });
  }
  const norm = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (expected.expectedAge && norm(plan.age || plan.ageBucket) !== norm(expected.expectedAge)) {
    errors.push({ code: "age_mismatch", message: `Age mismatch: "${plan.age}" vs "${expected.expectedAge}"` });
  }
  if (expected.expectedTheme && norm(plan.theme) !== norm(expected.expectedTheme)) {
    errors.push({ code: "theme_mismatch", message: `Theme mismatch: "${plan.theme}" vs "${expected.expectedTheme}"` });
  }
  if (expected.expectedTitle && norm(plan.title) !== norm(expected.expectedTitle)) {
    errors.push({ code: "title_mismatch", message: `Title mismatch: "${plan.title}" vs "${expected.expectedTitle}"` });
  }
  return { ok: errors.length === 0, errors };
}

function phase1BlocksAction(action) {
  const key = String(action || "").trim().toLowerCase();
  if (PHASE2_BLOCKED_ACTIONS.includes(key)) {
    return {
      blocked: true,
      code: "phase2_required",
      error: `Action "${key}" is Phase 2 only. Phase 1 supports review, request revision, discard, and rollback — not approve/publish.`,
    };
  }
  return { blocked: false };
}

module.exports = {
  DRAFT_REVIEW_STATUSES,
  PHASE1_ACTIONS,
  PHASE2_BLOCKED_ACTIONS,
  STATUS_LABELS,
  BLOCKED_LESSON_IDS,
  PHASE1_SEED_PACKAGES,
  sha256Short,
  cloneJson,
  normalizeStatus,
  statusLabel,
  generateDraftReviewId,
  generateRollbackId,
  publishedLessonBodyPayload,
  publishedLessonBodyFingerprint,
  activityLinkFingerprint,
  enrichmentDraftHasContent,
  stripLocalFileUrls,
  sanitizeEnrichmentDraftForQueue,
  buildQueueStats,
  buildScoresSummary,
  normalizeDraftReviewEntry,
  normalizeDraftReviewQueue,
  queueListItem,
  buildCompareSummary,
  matchLessonGuard,
  phase1BlocksAction,
  songsBooksStatus,
};
