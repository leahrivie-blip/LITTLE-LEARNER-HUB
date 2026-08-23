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

function activityImageUrl(plan, act, draftActs = {}) {
  const key = text(act.id) || text(act.itemId);
  const patch = draftActs[key] || draftActs[text(act.itemId)] || {};
  const setup = text(patch.setupImageUrl || act.setupImageUrl, 600);
  const example = text(patch.exampleImageUrl || act.exampleImageUrl, 600);
  const url = setup || example;
  if (!url || /^data:/i.test(url)) return "";
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
  candidates.sort((a, b) => b.priority - a.priority || String(a.title).localeCompare(String(b.title)));
  return candidates[0] || null;
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
    accessPlan: plan.plan === "Pro" ? "Pro" : "Free",
    audit,
    coverPlan,
    workPlan,
    command,
    kitScope,
    ownerSummary,
  };
}

function summarizePlanForOwner(planBundle) {
  const wp = planBundle?.workPlan || {};
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
  return {
    lessonId: planBundle.lessonId,
    title: planBundle.title,
    accessPlan: planBundle.accessPlan,
    coverPlan: planBundle.coverPlan,
    contentChanges,
    imageActions: schema.asArray(wp.images),
    printableActions: schema.asArray(wp.printables),
    songActions: schema.asArray(wp.songs),
    bookActions: schema.asArray(wp.books),
    counts: wp.counts || {},
    ownerSummary: planBundle.ownerSummary || "",
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
  if (!url) return plan;
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
  buildCoverPlan,
  pickBestActivityImageForCover,
  buildConnectedUpgradeCommand,
  buildConnectedUpgradePlan,
  summarizePlanForOwner,
  canAutoApplyConnectedEnrichment,
  applyCoverToEnrichmentDraft,
  applyOperatorCoverToMergedPlan,
};
