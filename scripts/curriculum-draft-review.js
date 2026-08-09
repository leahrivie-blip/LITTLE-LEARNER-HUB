/**
 * Curriculum Draft Review Queue — shared model (permanent, reusable).
 * Owner workflow: submit → review → preview → revise → approve → publish → rollback.
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

const OWNER_ACTIONS = Object.freeze([
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
  "preview",
  "approve",
  "publish",
  "printable-review",
  "image-review",
  "approve-printable",
  "request-printable-revision",
  "record-printable-pages",
  "replace-printable",
  "ready-for-approval",
]);

/** @deprecated use OWNER_ACTIONS — kept for older tests/callers */
const PHASE1_ACTIONS = OWNER_ACTIONS;
const PHASE2_ONLY = Object.freeze([]);
const PUBLISH_CONFIRM_PHRASE = "PUBLISH TEACHING KIT";

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

function enrichmentHasContent(draft) {
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

function remapEnrichmentActivitiesToPlan(plan, storeActivities, enrichmentDraft, enrichApi) {
  const draft = enrichmentDraft && typeof enrichmentDraft === "object" ? cloneJson(enrichmentDraft) : {};
  const src = draft.activities && typeof draft.activities === "object" ? draft.activities : {};
  const flat = enrichApi?.flattenLessonActivities
    ? enrichApi.flattenLessonActivities(plan, storeActivities || [], draft)
    : [];
  if (!flat.length) return draft;
  const next = {};
  flat.forEach((act) => {
    const liveKey = String(act.id || act.itemId || "").trim();
    if (!liveKey) return;
    const itemId = String(act.itemId || "").trim();
    let patch = src[liveKey] || (itemId ? src[itemId] : null);
    if (!patch && itemId) {
      const hit = Object.entries(src).find(([key]) => (
        key === itemId || key.endsWith(`:${itemId}`)
      ));
      patch = hit ? hit[1] : null;
    }
    if (patch) next[liveKey] = patch;
  });
  draft.activities = next;
  return draft;
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
    const req = String(act.imageRequirement || "").toLowerCase().replace(/[\s-]+/g, "_");
    const needsSetup = ["required", "setup_only", "setup_required", "setup_and_example"].includes(req);
    const needsExample = ["required", "example_only", "example_required", "setup_and_example", "finished_example"].includes(req);
    if (!needsSetup && !needsExample) return;
    const hasSetup = Boolean(act.setupImageUrl || act.setupMediaAssetId);
    const hasExample = Boolean(act.exampleImageUrl || act.exampleMediaAssetId);
    if ((needsSetup && !hasSetup) || (needsExample && !hasExample)) missing += 1;
  });
  return missing;
}

function countRequiredImages(draft) {
  const acts = draft?.activities && typeof draft.activities === "object" ? draft.activities : {};
  let required = 0;
  Object.values(acts).forEach((act) => {
    if (!act || typeof act !== "object") return;
    const req = String(act.imageRequirement || "").toLowerCase().replace(/[\s-]+/g, "_");
    if (["required", "setup_only", "example_only", "setup_required", "example_required", "setup_and_example"].includes(req)) {
      required += 1;
    }
  });
  return required;
}

function decisionCounts(draft) {
  const week = draft?.week && typeof draft.week === "object" ? draft.week : {};
  const decisions = Array.isArray(week.activityDecisions) ? week.activityDecisions : [];
  const counts = { added: 0, removed: 0, replaced: 0, preserved: 0, rewritten: 0, improved: 0 };
  decisions.forEach((d) => {
    const key = String(d?.decision || d?.action || "").toLowerCase();
    if (key === "add" || key === "added") counts.added += 1;
    else if (key === "remove" || key === "removed") counts.removed += 1;
    else if (key === "replace" || key === "replaced") counts.replaced += 1;
    else if (key === "keep" || key === "preserved" || key === "unchanged") counts.preserved += 1;
    else if (key === "rewrite" || key === "rewritten") counts.rewritten += 1;
    else if (key === "improve" || key === "improved" || key === "substantially_improve") counts.improved += 1;
  });
  return counts;
}

function buildStats(draft, draftResourceIds = [], resources = []) {
  const acts = draft?.activities && typeof draft.activities === "object" ? draft.activities : {};
  const week = draft?.week && typeof draft.week === "object" ? draft.week : {};
  const decisions = decisionCounts(draft);
  const proposedDays = week.proposedDailyPlans && typeof week.proposedDailyPlans === "object"
    ? week.proposedDailyPlans
    : null;
  let proposedActivityCount = 0;
  if (proposedDays) {
    ["monday", "tuesday", "wednesday", "thursday", "friday"].forEach((day) => {
      proposedActivityCount += Array.isArray(proposedDays[day]?.items) ? proposedDays[day].items.length : 0;
    });
  }
  const linkedResources = (Array.isArray(resources) ? resources : [])
    .filter((r) => (draftResourceIds || []).includes(r.id));
  const printablePages = linkedResources.reduce((sum, r) => sum + (Number(r.pageCount) || 0), 0);
  const activityCount = proposedActivityCount || Object.keys(acts).length;
  return {
    activityCount,
    changedActivities: Object.keys(acts).length,
    activitiesAdded: decisions.added,
    activitiesRemoved: decisions.removed,
    activitiesReplaced: decisions.replaced,
    activitiesPreserved: decisions.preserved,
    activitiesRewritten: decisions.rewritten,
    activitiesImproved: decisions.improved,
    printables: Array.isArray(draftResourceIds) ? draftResourceIds.length : 0,
    printablePages,
    requiredImages: countRequiredImages(draft),
    missingRequiredImages: countMissingRequiredImages(draft),
    songCount: Array.isArray(week.songs) ? week.songs.length : 0,
    bookCount: Array.isArray(week.books) ? week.books.length : 0,
  };
}

function plainLanguageBlockers(qualityReport) {
  const raw = Array.isArray(qualityReport?.blockingIssues)
    ? qualityReport.blockingIssues
    : (Array.isArray(qualityReport?.publishBlockers) ? qualityReport.publishBlockers : []);
  return raw.map((item) => {
    if (typeof item === "string") {
      return { code: item, message: item, navigateTo: "", activityKey: "", activityTitle: "" };
    }
    return {
      code: String(item?.code || "").trim(),
      message: String(item?.message || item?.code || "Blocking issue").trim(),
      suggestion: String(item?.suggestion || "").trim(),
      navigateTo: String(item?.navigateTo || "").trim(),
      activityKey: String(item?.activityKey || item?.key || "").trim(),
      activityTitle: String(item?.activityTitle || item?.title || "").trim(),
    };
  }).filter((b) => b.code || b.message).slice(0, 40);
}

function buildScores(qualityReport, extras = {}) {
  if (!qualityReport || typeof qualityReport !== "object") {
    return {
      structuralScore: null,
      premiumScore: null,
      overallScore: null,
      blockers: [],
      blockerDetails: [],
      workflow: extras.workflow || "",
      libraryStatus: extras.blocking || "",
      publishReady: false,
      scoringMode: "actual_draft_catalog",
    };
  }
  const details = plainLanguageBlockers(qualityReport);
  const blocksPublish = qualityReport.blocksPublish === true || details.length > 0
    || String(qualityReport.publishReadiness || "").toLowerCase() === "blocked";
  let workflow = extras.workflow || "";
  if (blocksPublish && /publish\s*ready|ready for owner/i.test(workflow)) {
    workflow = "Needs Changes";
  }
  return {
    structuralScore: qualityReport.completionPercent ?? qualityReport.structuralScore ?? null,
    premiumScore: qualityReport.premiumReadinessPercent ?? qualityReport.premiumScore ?? null,
    overallScore: qualityReport.overallScore ?? null,
    blockers: details.map((d) => d.code || d.message).filter(Boolean),
    blockerDetails: details,
    workflow,
    libraryStatus: blocksPublish ? "Blocked" : (extras.blocking || "No blockers"),
    publishReady: !blocksPublish && String(qualityReport.publishReadiness || "").toLowerCase() === "ready",
    activityCount: extras.activityCount ?? null,
    scoringMode: "evaluateTeachingKit",
    note: "Scores are diagnostic only. Hard blockers control readiness. Draft printables never count as published.",
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
    revisionNumber: Number(e.revisionNumber) || Math.max(1, (Array.isArray(e.versions) ? e.versions.length : 0) + 1),
    batchId: String(e.batchId || "").trim(),
    batchName: String(e.batchName || "").trim(),
    source: String(e.source || "curriculum-tool").trim(),
    status,
    statusLabel: statusLabel(status),
    publishedStatus: String(e.publishedStatus || "published").trim(),
    submittedAt: String(e.submittedAt || e.receivedAt || "").trim(),
    updatedAt: String(e.updatedAt || "").trim(),
    enrichmentDraft: e.enrichmentDraft && typeof e.enrichmentDraft === "object" ? e.enrichmentDraft : null,
    draftResourceIds: Array.isArray(e.draftResourceIds) ? e.draftResourceIds.map((x) => String(x || "").trim()).filter(Boolean) : [],
    versions: Array.isArray(e.versions) ? e.versions.slice(0, 30) : [],
    snapshots: e.snapshots && typeof e.snapshots === "object" ? e.snapshots : null,
    publishSnapshot: e.publishSnapshot && typeof e.publishSnapshot === "object" ? e.publishSnapshot : null,
    reviewNotes: String(e.reviewNotes || "").trim(),
    notesHistory: Array.isArray(e.notesHistory) ? e.notesHistory.slice(0, 50) : [],
    scores: e.scores && typeof e.scores === "object" ? e.scores : buildScores(null),
    stats: e.stats && typeof e.stats === "object" ? e.stats : buildStats(e.enrichmentDraft, e.draftResourceIds),
    qualityResults: e.qualityResults && typeof e.qualityResults === "object" ? e.qualityResults : null,
    resourceApprovals: e.resourceApprovals && typeof e.resourceApprovals === "object" ? e.resourceApprovals : {},
    imageApprovals: e.imageApprovals && typeof e.imageApprovals === "object" ? e.imageApprovals : {},
    validationErrors: Array.isArray(e.validationErrors) ? e.validationErrors : [],
    approvedAt: String(e.approvedAt || "").trim(),
    publishedAt: String(e.publishedAt || "").trim(),
  };
}

function normalizeQueue(value) {
  return (Array.isArray(value) ? value : []).map(normalizeEntry).filter(Boolean).slice(0, 500);
}

function listItem(entry) {
  const e = normalizeEntry(entry);
  if (!e) return null;
  const stats = e.stats || {};
  const scores = e.scores || {};
  const publishedStatus = e.publishedStatus || "published";
  return {
    id: e.id,
    lessonPlanId: e.lessonPlanId,
    title: e.title,
    age: e.age,
    theme: e.theme,
    submittedAt: e.submittedAt,
    updatedAt: e.updatedAt,
    batchId: e.batchId,
    batchName: e.batchName,
    revisionId: e.revisionId,
    revisionNumber: Number(e.revisionNumber) || Math.max(1, (e.versions || []).length + 1),
    submissionKey: e.submissionKey,
    source: e.source,
    status: e.status,
    statusLabel: e.statusLabel,
    publishedStatus,
    publishedStatusLabel: String(publishedStatus).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    structuralScore: scores.structuralScore ?? null,
    premiumScore: scores.premiumScore ?? null,
    workflow: scores.workflow || e.qualityResults?.workflow || "",
    libraryStatus: scores.libraryStatus || e.qualityResults?.libraryStatus || "",
    publishReady: scores.publishReady === true,
    blockers: scores.blockers || [],
    blockerDetails: scores.blockerDetails || e.qualityResults?.blockingDetails || [],
    activityCount: stats.activityCount ?? scores.activityCount ?? 0,
    changedActivities: stats.changedActivities ?? 0,
    activitiesAdded: stats.activitiesAdded ?? 0,
    activitiesRemoved: stats.activitiesRemoved ?? 0,
    activitiesReplaced: stats.activitiesReplaced ?? 0,
    activitiesPreserved: stats.activitiesPreserved ?? 0,
    activitiesRewritten: stats.activitiesRewritten ?? 0,
    printables: stats.printables ?? 0,
    printablePages: stats.printablePages ?? 0,
    requiredImages: stats.requiredImages ?? 0,
    missingRequiredImages: stats.missingRequiredImages ?? 0,
    reviewNotes: e.reviewNotes,
    notesPresent: Boolean(String(e.reviewNotes || "").trim()),
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
  const decisions = Array.isArray(week.activityDecisions) ? week.activityDecisions : [];
  const readable = {
    added: [],
    removed: [],
    replaced: [],
    rewritten: [],
    unchanged: [],
    improved: [],
  };
  decisions.forEach((d) => {
    if (!d || typeof d !== "object") return;
    const title = String(d.title || "").trim() || "Untitled activity";
    const note = String(d.note || d.reason || "").trim();
    const row = { title, note, decision: String(d.decision || "").trim() };
    const key = String(d.decision || "").toLowerCase();
    if (key === "add" || key === "added") readable.added.push(row);
    else if (key === "remove" || key === "removed") readable.removed.push(row);
    else if (key === "replace" || key === "replaced") readable.replaced.push(row);
    else if (key === "rewrite" || key === "rewritten") readable.rewritten.push(row);
    else if (key === "keep" || key === "preserved" || key === "unchanged") readable.unchanged.push(row);
    else if (key === "improve" || key === "improved" || key === "substantially_improve") readable.improved.push(row);
    else readable.rewritten.push(row);
  });
  const changed = [];
  Object.keys(acts).forEach((key) => {
    Object.keys(acts[key] || {}).forEach((field) => changed.push({ scope: "activity", key, field }));
  });
  const weekFields = Object.keys(week).filter((field) => {
    if (["proposedDailyPlans", "activityDecisions", "removedActivityTitles", "removedItemIds"].includes(field)) {
      return false;
    }
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
    readable,
    summaryLines: [
      `${readable.added.length} added`,
      `${readable.removed.length} removed`,
      `${readable.replaced.length} replaced`,
      `${readable.rewritten.length + readable.improved.length} rewritten/improved`,
      `${readable.unchanged.length} unchanged`,
    ],
  };
}

function phaseGate(_action) {
  // Approve/publish are available but gated by hard blockers + owner confirmation in the API.
  return { blocked: false };
}

function canMarkPublishReady({ scores, stats, entry } = {}) {
  const details = scores?.blockerDetails || [];
  const blockers = scores?.blockers || [];
  if (scores?.publishReady !== true) return { ok: false, reason: "Quality review is not Publish Ready." };
  if (details.length || blockers.length) return { ok: false, reason: "Hard blockers remain." };
  if (Number(stats?.missingRequiredImages || 0) > 0) {
    return { ok: false, reason: "Required images are still missing." };
  }
  if (String(entry?.status || "") !== "approved" && String(entry?.status || "") !== "ready_for_owner_approval") {
    return { ok: false, reason: "Owner has not approved the final draft." };
  }
  return { ok: true };
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
  OWNER_ACTIONS,
  PHASE1_ACTIONS,
  PHASE2_ONLY,
  PUBLISH_CONFIRM_PHRASE,
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
  remapEnrichmentActivitiesToPlan,
  sanitizeDraft,
  buildStats,
  buildScores,
  plainLanguageBlockers,
  normalizeEntry,
  normalizeQueue,
  listItem,
  matchLesson,
  buildCompare,
  phaseGate,
  canMarkPublishReady,
  decisionCounts,
  countMissingRequiredImages,
  countRequiredImages,
};
