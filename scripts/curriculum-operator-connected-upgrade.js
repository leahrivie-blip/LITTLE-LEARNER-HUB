/**
 * Connected existing-lesson upgrade — wires Operator audit/plan/run to enrichment apply.
 * Does not replace Operator pipelines; only connects them for Owner one-lesson workflow.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const orchestrator = require("./curriculum-operator-orchestrator.js");
const auditApi = require("./curriculum-operator-audit.js");

const COVER_QUALITY_GENERIC = /default\.svg|generic-infant|generic-toddler|generic-preschool/i;

function text(value, max = 400) {
  return schema.text(value, max);
}

function deriveCoverQuality(plan = {}) {
  const manual = String(plan.coverQualityStatus || "").trim();
  if (["good", "needs_upgrade", "missing"].includes(manual)) return manual;
  const url = String(plan.coverImageUrl || "").trim();
  if (!url) return "missing";
  if (COVER_QUALITY_GENERIC.test(url)) return "needs_upgrade";
  const source = String(plan.coverImageSource || "").trim();
  if (source === "uploaded" || source === "mapped" || source === "generated") return "good";
  if (/^\/api\/media\/lesson-covers\//i.test(url) || /^\/images\/lesson-covers\//i.test(url)) return "good";
  if (/^https?:\/\//i.test(url) && !COVER_QUALITY_GENERIC.test(url)) return "good";
  return "needs_upgrade";
}

function isUsableActivityImageUrl(url) {
  const u = String(url || "").trim();
  if (!u || /^data:/i.test(u)) return false;
  if (/\.pdf(\?|#|$)/i.test(u)) return false;
  if (/application\/pdf/i.test(u)) return false;
  if (!/^https?:\/\//i.test(u) && !u.startsWith("/")) return false;
  if (/\/printables?\//i.test(u) && !/\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(u)) return false;
  return true;
}

function activityImageUrl(plan, act, draftActs = {}) {
  const key = text(act.id) || text(act.itemId);
  const patch = draftActs[key] || draftActs[text(act.itemId)] || {};
  const setup = text(patch.setupImageUrl || act.setupImageUrl, 600);
  const example = text(patch.exampleImageUrl || act.exampleImageUrl, 600);
  const url = isUsableActivityImageUrl(setup) ? setup : (isUsableActivityImageUrl(example) ? example : "");
  return url;
}

/**
 * Pick strongest realistic activity image for cover replacement.
 * @param {object} plan
 * @param {object} curriculum
 * @param {string[]} preferActivityIds — newly generated image activities first
 */
function pickBestActivityImageForCover(plan, curriculum, preferActivityIds = []) {
  const prefer = new Set(schema.asArray(preferActivityIds).map((id) => text(id, 160)).filter(Boolean));
  const draftActs = plan?.enrichmentDraft?.activities && typeof plan.enrichmentDraft.activities === "object"
    ? plan.enrichmentDraft.activities
    : {};
  const acts = schema.asArray(curriculum?.activities).filter((a) => a && a.lessonPlanId === plan.id);
  const candidates = [];
  acts.forEach((act) => {
    const url = activityImageUrl(plan, act, draftActs);
    if (!url) return;
    const priority = prefer.has(text(act.id)) ? 20 : 0;
    candidates.push({
      activityId: act.id,
      title: text(act.title, 180),
      url,
      priority,
    });
  });
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const aSetup = String(a.url).includes("setup") ? 1 : 0;
    const bSetup = String(b.url).includes("setup") ? 1 : 0;
    if (bSetup !== aSetup) return bSetup - aSetup;
    return String(a.title).localeCompare(String(b.title));
  });
  return candidates[0] || null;
}

/**
 * Surface structural activity issues for Owner review (no silent restructuring).
 */
function detectStructuralReviewFlags(audit) {
  const flags = [];
  const classifications = schema.asArray(audit?.activityClassifications);
  const titleCounts = new Map();
  classifications.forEach((a) => {
    const key = text(a.title, 180).toLowerCase();
    if (key) titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
  });
  classifications.forEach((a) => {
    const titleKey = text(a.title, 180).toLowerCase();
    if (titleKey && titleCounts.get(titleKey) > 1) {
      flags.push({
        activityId: a.activityId,
        title: a.title,
        code: "duplicate_activity_title",
        message: `“${text(a.title, 120)}” appears more than once — review activity mix manually.`,
      });
    }
    if (a.decision === "REPLACE") {
      flags.push({
        activityId: a.activityId,
        title: a.title,
        code: "activity_replace_recommended",
        message: a.reason || "Activity may need structural Owner review.",
      });
    }
  });
  schema.asArray(audit?.teachingKitBlockers).forEach((b) => {
    flags.push({
      code: "teaching_kit_blocker",
      source: b.source || "audit",
      message: text(b.message, 300),
    });
  });
  if (audit?.scores?.blocksPublish) {
    flags.push({
      code: "quality_blocks_publish",
      message: "Quality review reports publish blockers — full publish-ready may require Owner review.",
    });
  }
  const structural = flags.filter((f) => (
    f.code === "duplicate_activity_title" || f.code === "activity_replace_recommended"
  ));
  return {
    flags,
    requiresOwnerReview: structural.length > 0 || audit?.scores?.blocksPublish === true,
    structuralActivityCount: structural.length,
  };
}

function buildCoverPlan(plan, curriculum, options = {}) {
  const quality = deriveCoverQuality(plan);
  const existingUrl = text(plan.coverImageUrl, 600);
  if (!options.forceReplace && quality === "good") {
    return {
      decision: "KEEP_EXISTING",
      reason: "Existing cover is already strong.",
      coverImageUrl: existingUrl,
      sourceActivityId: null,
      sourceActivityTitle: "",
    };
  }
  const best = pickBestActivityImageForCover(plan, curriculum);
  if (!best?.url) {
    return {
      decision: "KEEP_EXISTING",
      reason: quality === "missing"
        ? "No suitable activity image yet — cover will stay until images are generated."
        : "No stronger activity image available — keeping current cover.",
      coverImageUrl: existingUrl,
      sourceActivityId: null,
      sourceActivityTitle: "",
    };
  }
  if (!options.forceReplace && quality === "good" && existingUrl === best.url) {
    return {
      decision: "KEEP_EXISTING",
      reason: "Best activity image matches the existing cover.",
      coverImageUrl: existingUrl,
      sourceActivityId: best.activityId,
      sourceActivityTitle: best.title,
    };
  }
  return {
    decision: "REPLACE",
    reason: quality === "missing"
      ? "Cover missing — assign realistic activity image."
      : "Cover weak or generic — replace with strongest activity image.",
    proposedCoverImageUrl: best.url,
    sourceActivityId: best.activityId,
    sourceActivityTitle: best.title,
    previousCoverImageUrl: existingUrl,
  };
}

function buildConnectedUpgradeCommand(lessonId, planTitle = "", options = {}) {
  const id = text(lessonId, 160);
  const title = text(planTitle, 180);
  const touchCover = options.touchCover === true;
  return schema.normalizeOperatorCommand({
    rawCommand: text(
      options.rawCommand || `Upgrade ${title || "lesson"} and make it publish-ready.`,
      4000,
    ),
    intent: "finish_full_kit",
    scope: {
      selection: "explicit_ids",
      lessonIds: [id],
      count: 1,
      titles: title ? [title] : [],
    },
    actions: {
      upgradeLesson: true,
      upgradeActivities: true,
      generateSongsBooks: true,
      generateImages: true,
      generatePrintables: true,
      checkImages: true,
      checkPrintables: true,
      checkSongs: true,
      checkBooks: true,
      saveDraft: true,
      publish: false,
      createLesson: false,
      connectedUpgrade: true,
      connectedAutoApply: true,
      touchCover,
    },
    limits: { maxLessons: 1 },
    confirmations: {
      planAcknowledged: options.planAcknowledged === true,
      reasons: [],
    },
    completion: { phase: 6 },
  }, { phase: 6 });
}

function buildConnectedUpgradePlan(curriculum, lessonId) {
  const plan = schema.asArray(curriculum?.lessonPlans).find((p) => p && p.id === lessonId);
  if (!plan) {
    return { ok: false, code: "LESSON_NOT_FOUND", error: "Lesson not found." };
  }
  const audit = auditApi.auditLesson(plan, curriculum);
  const coverPlan = buildCoverPlan(plan, curriculum);
  const command = buildConnectedUpgradeCommand(plan.id, plan.title, {
    touchCover: coverPlan.decision === "REPLACE",
  });
  const kitScope = orchestrator.normalizeKitScopeFlags(command.actions || {});
  const workPlan = orchestrator.buildFullKitWorkPlan({
    plan,
    audit,
    kitScope,
    command,
  });
  workPlan.coverPlan = coverPlan;
  workPlan.cover = coverPlan.decision === "REPLACE" ? "REPLACE_WITH_ACTIVITY_IMAGE" : "KEEP_EXISTING";
  const ownerSummary = orchestrator.summarizeWorkPlanForOwner(workPlan);
  return {
    ok: true,
    lessonId: plan.id,
    title: plan.title,
    age: text(plan.age, 80),
    accessPlan: plan.plan === "Pro" ? "Pro" : "Free",
    status: text(plan.status, 40),
    plan,
    audit,
    coverPlan,
    workPlan,
    command,
    kitScope,
    ownerSummary,
    structuralReview: detectStructuralReviewFlags(audit),
  };
}

function summarizePlanForOwner(planBundle) {
  const wp = planBundle?.workPlan || {};
  const audit = planBundle?.audit || {};
  const contentChanges = [];
  schema.asArray(wp.text).forEach((f) => {
    if (f.decision && f.decision !== "KEEP") {
      contentChanges.push({
        area: "week",
        field: f.field,
        label: f.label || f.field,
        decision: f.decision,
        reason: f.reason || "",
      });
    }
  });
  schema.asArray(wp.activities).forEach((a) => {
    if (a.decision && a.decision !== "KEEP") {
      contentChanges.push({
        area: "activity",
        activityId: a.activityId,
        title: a.title,
        decision: a.decision,
        reason: a.reason || "",
      });
    }
  });
  const activitiesStrong = schema.asArray(wp.activities).filter((a) => a.decision === "KEEP");
  const activitiesNeedingWork = schema.asArray(wp.activities).filter((a) => a.decision && a.decision !== "KEEP");
  const missingWeeklyFields = schema.asArray(audit.weeklyContent).filter((f) => f.decision !== "KEEP");
  const imageActions = schema.asArray(wp.images);
  const printableActions = schema.asArray(wp.printables);
  const preservedImages = imageActions.filter((r) => (
    String(r.decision || "").toUpperCase() === "KEEP_EXISTING"
  ));
  const preservedPrintables = printableActions.filter((r) => (
    String(r.decision || "").toUpperCase() === "KEEP_EXISTING"
  ));
  const structuralReview = planBundle.structuralReview || detectStructuralReviewFlags(audit);
  const thinSections = schema.asArray(audit.completenessSections).filter((s) => (
    s.status === "missing" || s.status === "needs_improvement" || s.status === "thin"
  ));
  return {
    lessonId: planBundle.lessonId,
    title: planBundle.title,
    age: planBundle.age || audit.age || "",
    accessPlan: planBundle.accessPlan,
    status: planBundle.status || audit.status || "",
    coverPlan: planBundle.coverPlan,
    contentChanges,
    activitiesStrong,
    activitiesNeedingWork,
    missingWeeklyFields,
    imageActions,
    printableActions,
    preservedImages,
    preservedPrintables,
    songActions: schema.asArray(wp.songs),
    bookActions: schema.asArray(wp.books),
    completenessSections: thinSections,
    blockers: schema.asArray(audit.teachingKitBlockers),
    structuralReview,
    estimatedScope: audit.estimatedJobScope || null,
    readiness: {
      completionPercent: audit.scores?.completionPercent,
      premiumReadinessPercent: audit.scores?.premiumReadinessPercent,
      blocksPublish: audit.scores?.blocksPublish,
      currentStatus: audit.currentStatus,
    },
    counts: wp.counts || {},
    ownerSummary: planBundle.ownerSummary || "",
    writesOnPlan: false,
    publishes: false,
    autoPublish: false,
  };
}

function canAutoApplyConnectedEnrichment(lessonResult, job) {
  if (!lessonResult || !job) return { ok: false, code: "missing_result", message: "Missing job result." };
  const cmd = job.command || {};
  if (!cmd.actions?.connectedAutoApply) {
    return { ok: false, code: "auto_apply_not_requested", message: "Auto-apply not requested for this job." };
  }
  if (cmd.actions?.publish) {
    return { ok: false, code: "publish_requested", message: "Publish was requested — auto-apply blocked." };
  }
  if (lessonResult.status !== "success") {
    return { ok: false, code: "job_lesson_not_success", message: "Lesson job did not succeed." };
  }
  if (lessonResult.ownerReviewStatus !== "READY_FOR_OWNER_REVIEW") {
    return {
      ok: false,
      code: "owner_review_not_ready",
      message: `Owner review status is ${lessonResult.ownerReviewStatus || "unknown"} (need READY_FOR_OWNER_REVIEW).`,
      ownerReviewStatus: lessonResult.ownerReviewStatus,
    };
  }
  if (lessonResult.finalVerificationComplete !== true || !lessonResult.finalVerification?.ok) {
    return { ok: false, code: "final_verification_failed", message: "Final stored-state verification failed." };
  }
  if (lessonResult.code === "SCOPE_REVIEW_REQUIRED") {
    return { ok: false, code: "scope_review_required", message: "Scope review required." };
  }
  const kitScope = lessonResult.kitScope || {};
  if (cmd.actions?.upgradeLesson && lessonResult.textComplete === false) {
    return { ok: false, code: "text_incomplete", message: "Text upgrade incomplete." };
  }
  if (kitScope.images && lessonResult.imagesComplete === false) {
    return { ok: false, code: "images_incomplete", message: "Required images incomplete." };
  }
  if (kitScope.printables && lessonResult.printablesComplete === false) {
    return { ok: false, code: "printables_incomplete", message: "Required printables incomplete." };
  }
  if ((kitScope.songs || kitScope.books) && lessonResult.songsBooksComplete === false) {
    return { ok: false, code: "songs_books_incomplete", message: "Songs/books step incomplete." };
  }
  const lessonId = text(lessonResult.lessonId || lessonResult.audit?.lessonId, 160);
  if (!lessonId || lessonId !== text(lessonResult.audit?.lessonId, 160)) {
    return { ok: false, code: "lesson_id_mismatch", message: "Lesson ID verification failed." };
  }
  return { ok: true, code: "ready", message: "Eligible for connected auto-apply." };
}

function applyCoverToEnrichmentDraft(draft, coverPlan) {
  if (!draft || !coverPlan || coverPlan.decision !== "REPLACE") return draft;
  const url = text(coverPlan.proposedCoverImageUrl, 600);
  if (!url) return draft;
  return {
    ...draft,
    operatorCover: {
      coverImageUrl: url,
      coverImageSource: "generated",
      coverQualityStatus: "good",
      sourceActivityId: text(coverPlan.sourceActivityId, 160),
      sourceActivityTitle: text(coverPlan.sourceActivityTitle, 180),
      updatedAt: new Date().toISOString(),
    },
  };
}

function applyOperatorCoverToMergedPlan(plan, enrichmentDraft) {
  const oc = enrichmentDraft?.operatorCover;
  const url = text(oc?.coverImageUrl, 600);
  if (!url || !isUsableActivityImageUrl(url)) return plan;
  return {
    ...plan,
    coverImageUrl: url,
    coverImageSource: text(oc.coverImageSource, 40) || "generated",
    coverQualityStatus: text(oc.coverQualityStatus, 40) || "good",
    thumbnailUrl: url,
  };
}

module.exports = {
  deriveCoverQuality,
  isUsableActivityImageUrl,
  buildCoverPlan,
  pickBestActivityImageForCover,
  detectStructuralReviewFlags,
  buildConnectedUpgradeCommand,
  buildConnectedUpgradePlan,
  summarizePlanForOwner,
  canAutoApplyConnectedEnrichment,
  applyCoverToEnrichmentDraft,
  applyOperatorCoverToMergedPlan,
};
