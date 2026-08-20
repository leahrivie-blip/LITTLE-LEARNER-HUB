/**
 * AI Curriculum Operator — typed schemas (Phase 1+).
 *
 * Extensible command / job / action / asset-plan model for the full future
 * operator. Phase 1 executes read-only audit actions only.
 *
 * Never publishes. Never mutates curriculum from this module.
 */
"use strict";

const FIELD_DECISIONS = Object.freeze([
  "KEEP",
  "IMPROVE",
  "REPLACE",
  "FILL",
  "REMOVE",
  "WRONG",
  "MISSING",
]);

const IMAGE_DECISIONS = Object.freeze([
  "KEEP_EXISTING",
  "GENERATE",
  "REPLACE",
  "NOT_NEEDED",
]);

const PRINTABLE_DECISIONS = Object.freeze([
  "KEEP_EXISTING",
  "CREATE",
  "REPLACE",
  "REMOVE",
  "NOT_NEEDED",
]);

/** Future printable taxonomy (planning only in Phase 1). */
const PRINTABLE_TYPES = Object.freeze([
  "flashcards",
  "picture_cards",
  "matching_cards",
  "sorting_cards",
  "sequencing_cards",
  "cutouts",
  "counting_pieces",
  "counting_mats",
  "movement_cards",
  "dramatic_play_pack",
  "menu",
  "order_form",
  "recipe_card",
  "shopping_list",
  "pretend_money",
  "tickets",
  "badges",
  "map",
  "scavenger_hunt",
  "visual_direction_cards",
  "choice_board",
  "emotion_cards",
  "teacher_tool",
  "art_template",
  "handprint_template",
  "footprint_template",
  "game_pieces",
  "infant_visual_cards",
  "high_contrast_cards",
  "vocab_cards",
  "song_cards",
  "worksheet",
  "other",
]);

/**
 * Full future action catalog. Phase 1 may only *execute* PHASE1_EXECUTABLE_ACTIONS.
 * Mutation actions may appear in plannedRecommendations but must not run yet.
 */
const ACTION_TYPES = Object.freeze([
  "lesson.search",
  "lesson.get",
  "lesson.audit",
  "lesson.create",
  "lesson.updateFields",
  "lesson.saveDraft",
  "lesson.validate",
  "lesson.publish",
  "activity.update",
  "activity.audit",
  "song.audit",
  "song.upsert",
  "book.audit",
  "book.upsert",
  "image.inspect",
  "image.generate",
  "image.upload",
  "image.attachToActivity",
  "image.attachCover",
  "printable.plan",
  "printable.generatePages",
  "printable.buildPdf",
  "printable.upload",
  "printable.createResource",
  "printable.attach",
  "printable.verify",
  "teachingKit.score",
  "teachingKit.validate",
  "asset.plan",
  "job.log",
  "job.retry",
  "job.resume",
]);

const PHASE1_EXECUTABLE_ACTIONS = Object.freeze([
  "lesson.search",
  "lesson.get",
  "lesson.audit",
  "activity.audit",
  "song.audit",
  "book.audit",
  "image.inspect",
  "printable.plan",
  "teachingKit.score",
  "teachingKit.validate",
  "asset.plan",
  "job.log",
  "job.resume",
]);

/** Phase 2 adds draft field upgrades only — still no images/printables/publish/create. */
const PHASE2_EXECUTABLE_ACTIONS = Object.freeze([
  ...PHASE1_EXECUTABLE_ACTIONS,
  "lesson.updateFields",
  "activity.update",
  "lesson.saveDraft",
  "lesson.validate",
  "song.upsert",
  "book.upsert",
]);

/** Phase 3 adds activity image generate/upload/attach — still no printables/publish/create. */
const PHASE3_EXECUTABLE_ACTIONS = Object.freeze([
  ...PHASE2_EXECUTABLE_ACTIONS,
  "image.inspect",
  "image.generate",
  "image.upload",
  "image.attachToActivity",
  "image.attachCover",
]);

/** Phase 4 adds printable plan/generate/upload/attach — still no publish/create lessons. */
const PHASE4_EXECUTABLE_ACTIONS = Object.freeze([
  ...PHASE3_EXECUTABLE_ACTIONS,
  "printable.plan",
  "printable.generatePages",
  "printable.buildPdf",
  "printable.upload",
  "printable.createResource",
  "printable.attach",
  "printable.verify",
]);

const OWNER_REVIEW_STATUSES = Object.freeze([
  "READY_FOR_OWNER_REVIEW",
  "PARTIAL",
  "BLOCKED",
  "AUDIT_ONLY",
]);

const MUTATION_ACTIONS = Object.freeze([
  "lesson.create",
  "lesson.updateFields",
  "lesson.saveDraft",
  "lesson.publish",
  "activity.update",
  "song.upsert",
  "book.upsert",
  "image.generate",
  "image.upload",
  "image.attachToActivity",
  "image.attachCover",
  "printable.generatePages",
  "printable.buildPdf",
  "printable.upload",
  "printable.createResource",
  "printable.attach",
]);

const JOB_STATUSES = Object.freeze([
  "planned",
  "awaiting_confirm",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

const STEP_STATUSES = Object.freeze([
  "pending",
  "running",
  "success",
  "failed",
  "skipped",
  "retrying",
]);

const SELECTION_MODES = Object.freeze([
  "explicit_ids",
  "named_titles",
  "lowest_readiness",
  "updated_today",
  "updated_since",
  "missing_teaching_kit",
  "weak_printables",
  "needs_activity_images",
  "currently_selected",
  "filter",
]);

const INTENTS = Object.freeze([
  "audit",
  "upgrade_batch",
  "fix_lesson",
  "create_lesson",
  "finish_printables",
  "finish_images",
  "validate",
  "unknown",
]);

const DEFAULT_LIMITS = Object.freeze({
  maxLessons: 10,
  hardMaxLessons: 20,
  maxImageGenerations: 40,
  maxPrintableGenerations: 30,
  maxOpenAiCalls: 80,
});

const CONFIRM_REASONS = Object.freeze([
  "ambiguous_scope",
  "unexpectedly_large_scope",
  "destructive_operation",
  "would_replace_strong_content",
  "publish_requested",
  "mutation_not_enabled",
  "external_dependency_failed",
  "validation_unsatisfied",
]);

function text(value, max = 2000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeDecision(value, allowed, fallback = "KEEP") {
  const key = text(value, 40).toUpperCase().replace(/\s+/g, "_");
  if (allowed.includes(key)) return key;
  // Accept short aliases
  if (key === "KEEP_EXISTING" && allowed.includes("KEEP_EXISTING")) return "KEEP_EXISTING";
  if (key === "KEEP" && allowed.includes("KEEP")) return "KEEP";
  if (key === "MISSING" && allowed.includes("MISSING")) return "MISSING";
  if (key === "FILL" && allowed.includes("FILL")) return "FILL";
  return fallback;
}

function emptyActionsFlags() {
  return {
    audit: true,
    upgradeLesson: false,
    upgradeActivities: false,
    checkSongs: true,
    checkBooks: true,
    checkImages: true,
    checkPrintables: true,
    createLesson: false,
    generateImages: false,
    generatePrintables: false,
    replaceBadImages: false,
    touchImages: true,
    validate: true,
    saveDraft: false,
    publish: false,
  };
}

function normalizeLimits(raw = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  const hardMax = clampInt(input.hardMaxLessons, 1, 50, DEFAULT_LIMITS.hardMaxLessons);
  const maxLessons = clampInt(input.maxLessons, 1, hardMax, DEFAULT_LIMITS.maxLessons);
  return {
    maxLessons,
    hardMaxLessons: hardMax,
    maxImageGenerations: clampInt(
      input.maxImageGenerations,
      0,
      200,
      DEFAULT_LIMITS.maxImageGenerations,
    ),
    maxPrintableGenerations: clampInt(
      input.maxPrintableGenerations,
      0,
      200,
      DEFAULT_LIMITS.maxPrintableGenerations,
    ),
    maxOpenAiCalls: clampInt(input.maxOpenAiCalls, 0, 500, DEFAULT_LIMITS.maxOpenAiCalls),
  };
}

/**
 * Strict typed command schema.
 * options.phase: 1 = audit-only, 2 = draft upgrades (no publish/images/printables).
 */
function normalizeOperatorCommand(raw = {}, options = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  const phase = clampInt(options.phase != null ? options.phase : (input.completion?.phase || 1), 1, 8, 1);
  const phase1 = phase <= 1;
  const phase2 = phase === 2;
  const scopeIn = input.scope && typeof input.scope === "object" ? input.scope : {};
  const actionsIn = input.actions && typeof input.actions === "object" ? input.actions : {};
  const completionIn = input.completion && typeof input.completion === "object" ? input.completion : {};

  const intent = INTENTS.includes(text(input.intent, 40))
    ? text(input.intent, 40)
    : "audit";

  let selection = text(scopeIn.selection, 40) || "filter";
  if (!SELECTION_MODES.includes(selection)) selection = "filter";

  const actions = {
    audit: actionsIn.audit !== false,
    upgradeLesson: actionsIn.upgradeLesson === true,
    upgradeActivities: actionsIn.upgradeActivities === true,
    checkSongs: actionsIn.checkSongs !== false,
    checkBooks: actionsIn.checkBooks !== false,
    checkImages: actionsIn.checkImages !== false,
    checkPrintables: actionsIn.checkPrintables !== false,
    createLesson: actionsIn.createLesson === true,
    generateImages: actionsIn.generateImages === true,
    generatePrintables: actionsIn.generatePrintables === true,
    replaceBadImages: actionsIn.replaceBadImages === true,
    touchImages: actionsIn.touchImages !== false,
    validate: actionsIn.validate !== false,
    saveDraft: actionsIn.saveDraft === true,
    publish: actionsIn.publish === true,
  };

  // Always block create / publish. Printables unlock only at Phase 4+.
  actions.createLesson = false;
  actions.publish = false;
  if (phase < 4) {
    actions.generatePrintables = false;
  }

  const phase3 = phase === 3;
  const phase4 = phase >= 4;
  if (phase1) {
    actions.upgradeLesson = false;
    actions.upgradeActivities = false;
    actions.saveDraft = false;
    actions.generateImages = false;
    actions.replaceBadImages = false;
    actions.generatePrintables = false;
    actions.audit = true;
    actions.validate = true;
  } else if (phase2) {
    actions.generateImages = false;
    actions.replaceBadImages = false;
    actions.generatePrintables = false;
    if (actions.upgradeLesson || actions.upgradeActivities || intent === "upgrade_batch" || intent === "fix_lesson") {
      actions.saveDraft = true;
      actions.upgradeLesson = true;
      actions.upgradeActivities = true;
    }
  } else if (phase3) {
    actions.generatePrintables = false;
    if (actions.upgradeLesson || actions.upgradeActivities || intent === "upgrade_batch" || intent === "fix_lesson") {
      actions.saveDraft = true;
      actions.upgradeLesson = true;
      actions.upgradeActivities = true;
    }
    if (intent === "finish_images" || actions.generateImages) {
      actions.generateImages = actions.touchImages !== false;
      actions.saveDraft = true;
      if (actionsIn.replaceBadImages !== false) actions.replaceBadImages = true;
    }
    if (actions.touchImages === false) {
      actions.generateImages = false;
      actions.replaceBadImages = false;
    }
  } else if (phase4) {
    // Phase 4 / 4.5: printables only — do not regenerate activity images.
    // Phase 4.5 adds AI content planning before pdf-lib render (same action flags).
    actions.generateImages = false;
    actions.replaceBadImages = false;
    if (actions.upgradeLesson || actions.upgradeActivities || intent === "upgrade_batch" || intent === "fix_lesson") {
      actions.saveDraft = true;
      actions.upgradeLesson = true;
      actions.upgradeActivities = true;
    }
    if (intent === "finish_printables" || actions.generatePrintables || actionsIn.generatePrintables === true) {
      actions.generatePrintables = true;
      actions.saveDraft = true;
      actions.checkPrintables = true;
    }
    if (intent === "finish_images") {
      // Image finish commands in phase 4 still must not auto-run images.
      actions.generateImages = false;
    }
  } else {
    actions.generateImages = false;
    actions.generatePrintables = false;
  }

  const limits = normalizeLimits(input.limits);
  const count = clampInt(scopeIn.count, 1, limits.hardMaxLessons, limits.maxLessons);

  return {
    version: 1,
    rawCommand: text(input.rawCommand, 4000),
    intent,
    scope: {
      selection,
      count,
      plan: normalizePlanFilter(scopeIn.plan),
      ageBand: normalizeAgeBand(scopeIn.ageBand),
      lessonIds: asArray(scopeIn.lessonIds).map((id) => text(id, 160)).filter(Boolean).slice(0, 50),
      titles: asArray(scopeIn.titles).map((t) => text(t, 180)).filter(Boolean).slice(0, 50),
      updatedSince: text(scopeIn.updatedSince, 40) || null,
      currentlySelectedLessonId: text(scopeIn.currentlySelectedLessonId, 160) || null,
      requireExplicitIdsIfAmbiguous: scopeIn.requireExplicitIdsIfAmbiguous !== false,
    },
    actions,
    completion: {
      saveAsDraft: phase >= 2 ? true : (phase1 ? true : completionIn.saveAsDraft !== false),
      readyForOwnerReview: phase >= 2,
      publish: false,
      mutationsEnabled: phase >= 2 && (
        actions.saveDraft === true
        || actions.generateImages === true
        || actions.generatePrintables === true
      ),
      phase,
    },
    limits,
    confirmations: {
      planAcknowledged: input.confirmations?.planAcknowledged === true,
      publishAcknowledged: false,
      reasons: asArray(input.confirmations?.reasons).map((r) => text(r, 60)).filter(Boolean),
    },
    parsedNotes: asArray(input.parsedNotes).map((n) => text(n, 400)).filter(Boolean).slice(0, 20),
  };
}

function normalizePlanFilter(value) {
  const key = text(value, 20).toLowerCase();
  if (key === "pro") return "Pro";
  if (key === "free") return "Free";
  return null;
}

function normalizeAgeBand(value) {
  const key = text(value, 40).toLowerCase().replace(/[_-]+/g, " ");
  if (/infant|baby|0\s*[-–]\s*12/.test(key)) return "infant";
  if (/toddler|1\s*[-–]\s*2|2\s*[-–]\s*3/.test(key)) return "toddler";
  if (/preschool|pre.?k|3\s*[-–]\s*5|4\s*[-–]\s*5/.test(key)) return "preschool";
  if (/school.?age/.test(key)) return "school_age";
  return null;
}

function emptyCostCounters() {
  return {
    images: 0,
    printables: 0,
    openaiCalls: 0,
    lessonsAudited: 0,
  };
}

function normalizeAssetPlanItem(raw = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  return {
    activityId: text(input.activityId, 160),
    activityTitle: text(input.activityTitle, 180),
    weekday: text(input.weekday, 20),
    image: {
      decision: normalizeDecision(input.image?.decision, IMAGE_DECISIONS, "NOT_NEEDED"),
      reason: text(input.image?.reason, 600),
      concept: text(input.image?.concept, 800),
      existingUrl: text(input.image?.existingUrl, 500),
    },
    printable: {
      decision: normalizeDecision(input.printable?.decision, PRINTABLE_DECISIONS, "NOT_NEEDED"),
      reason: text(input.printable?.reason, 600),
      type: PRINTABLE_TYPES.includes(text(input.printable?.type, 40))
        ? text(input.printable?.type, 40)
        : null,
      title: text(input.printable?.title, 180),
      contents: asArray(input.printable?.contents).map((c) => text(c, 120)).filter(Boolean).slice(0, 20),
      purpose: text(input.printable?.purpose, 600),
      existingResourceIds: asArray(input.printable?.existingResourceIds)
        .map((id) => text(id, 160))
        .filter(Boolean)
        .slice(0, 20),
    },
  };
}

function normalizeFieldDecision(raw = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  return {
    field: text(input.field, 80),
    label: text(input.label, 120) || text(input.field, 80),
    decision: normalizeDecision(input.decision, FIELD_DECISIONS, "KEEP"),
    reason: text(input.reason, 600),
    preview: text(input.preview, 240),
  };
}

function isMutationAction(actionType) {
  return MUTATION_ACTIONS.includes(text(actionType, 60));
}

function isPhase1Executable(actionType) {
  return PHASE1_EXECUTABLE_ACTIONS.includes(text(actionType, 60));
}

function isPhase2Executable(actionType) {
  return PHASE2_EXECUTABLE_ACTIONS.includes(text(actionType, 60));
}

function isPhase3Executable(actionType) {
  return PHASE3_EXECUTABLE_ACTIONS.includes(text(actionType, 60));
}

function isPhase4Executable(actionType) {
  return PHASE4_EXECUTABLE_ACTIONS.includes(text(actionType, 60));
}

module.exports = {
  FIELD_DECISIONS,
  IMAGE_DECISIONS,
  PRINTABLE_DECISIONS,
  PRINTABLE_TYPES,
  ACTION_TYPES,
  PHASE1_EXECUTABLE_ACTIONS,
  PHASE2_EXECUTABLE_ACTIONS,
  PHASE3_EXECUTABLE_ACTIONS,
  PHASE4_EXECUTABLE_ACTIONS,
  OWNER_REVIEW_STATUSES,
  MUTATION_ACTIONS,
  JOB_STATUSES,
  STEP_STATUSES,
  SELECTION_MODES,
  INTENTS,
  DEFAULT_LIMITS,
  CONFIRM_REASONS,
  emptyActionsFlags,
  emptyCostCounters,
  normalizeLimits,
  normalizeOperatorCommand,
  normalizePlanFilter,
  normalizeAgeBand,
  normalizeAssetPlanItem,
  normalizeFieldDecision,
  isMutationAction,
  isPhase1Executable,
  isPhase2Executable,
  isPhase3Executable,
  isPhase4Executable,
  text,
  asArray,
  clampInt,
};
