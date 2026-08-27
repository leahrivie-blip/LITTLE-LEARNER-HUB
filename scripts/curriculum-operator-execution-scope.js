/**
 * AI Curriculum Operator — scope-aware execution labels and pre-run consistency checks.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const allowlistApi = require("./curriculum-operator-mutation-allowlist.js");

const FULL_KIT_PHASE_NOTE_RE = /Phase 6:\s*full Teaching Kit finish/i;
const FULL_KIT_JOB_LOG_RE = /Phase 6 full Teaching Kit finish/i;

function isNarrowWeeklyScope(command = {}) {
  return schema.asArray(command?.actions?.weeklyFieldScope).length > 0;
}

function narrowScopeLabel(weeklyScope = []) {
  const scope = schema.asArray(weeklyScope);
  if (scope.length === 1 && scope[0] === "vocabCards") return "Vocabulary-only";
  if (scope.length === 1 && scope[0] === "learningDomains") return "Learning-domains-only";
  if (scope.length === 1 && scope[0] === "teacherTips") return "Teacher-tips-only";
  return `Narrow weekly scope (${scope.join(", ")})`;
}

function isFullKitPhaseNote(value) {
  return FULL_KIT_PHASE_NOTE_RE.test(String(value || ""));
}

function isFullKitJobLog(value) {
  return FULL_KIT_JOB_LOG_RE.test(String(value || ""));
}

function computeExecutionFlags(command = {}) {
  const phase = Number(command?.completion?.phase) || 1;
  const actions = command?.actions || {};
  const doCreate = phase >= 7 && actions.createLesson === true;
  const doUpgrade = !doCreate && phase >= 2 && actions.saveDraft === true
    && (actions.upgradeLesson || actions.upgradeActivities)
    && actions.touchDraft !== false;
  const doImages = ((phase === 3) || (phase >= 6))
    && actions.generateImages === true
    && actions.touchImages !== false;
  const doPrintables = ((phase === 4) || (phase >= 6))
    && actions.generatePrintables === true
    && actions.touchPrintables !== false;
  const doSongsBooks = ((phase === 5) || (phase >= 6))
    && actions.generateSongsBooks === true
    && (actions.touchSongs !== false || actions.touchBooks !== false);
  return {
    phase,
    doCreate,
    doUpgrade,
    doImages,
    doPrintables,
    doSongsBooks,
    narrow: isNarrowWeeklyScope(command),
    weeklyFieldScope: schema.asArray(actions.weeklyFieldScope),
  };
}

function buildScopeAwarePhaseNote(command = {}) {
  const flags = computeExecutionFlags(command);
  const { phase, doCreate, doUpgrade, doImages, doPrintables, doSongsBooks, narrow, weeklyFieldScope } = flags;

  if (doCreate) {
    return "Phase 7.5: AI lesson architect designs a new draft Teaching Kit, then trusted lesson.create + Phase 6 kit finish. NOT PUBLISHED. Access default Free unless Free/Pro specified. No deterministic production fallback.";
  }
  if (narrow) {
    const fields = weeklyFieldScope.join("/");
    return `${narrowScopeLabel(weeklyFieldScope)} connected upgrade into existing draft. Only ${fields} may change. Assets and unrelated content are locked. NOT published.`;
  }
  if (phase >= 6 && (doUpgrade || doImages || doPrintables || doSongsBooks)) {
    return "Phase 6: full Teaching Kit finish into enrichmentDraft. NOT published. No lesson.create. Cover locked unless explicitly requested.";
  }
  if (doSongsBooks && phase === 5) {
    return "Phase 5: songs + books into enrichmentDraft only. NOT published. No image/printable regeneration. No new lessons.";
  }
  if (doPrintables && phase === 4) {
    return "Phase 4.6: intelligent printables — no generic fallback success; optional generated_asset embeds. NOT published. No image regeneration. No new lessons.";
  }
  if (doUpgrade && doImages) {
    return "Phase 2.5+3: AI draft text + useful activity images into enrichmentDraft. NOT published. No printables.";
  }
  if (doUpgrade) {
    return "Phase 2.5: enrichmentDraft text only. NOT published. No image/printable changes.";
  }
  if (doImages) {
    return "Phase 3: activity images only (KEEP/GENERATE/REPLACE/NOT_NEEDED). NOT published. No printables.";
  }
  return "Audit/plan only. No curriculum mutations.";
}

function buildJobCreatedLogMessage(status, command = {}) {
  const flags = computeExecutionFlags(command);
  const { phase, doCreate, doUpgrade, doImages, doPrintables, doSongsBooks, narrow, weeklyFieldScope } = flags;

  if (doCreate) {
    return `Job created (${status}). Phase 7 new draft lesson create + Teaching Kit finish — no publish.`;
  }
  if (narrow) {
    return `Job created (${status}). ${narrowScopeLabel(weeklyFieldScope)} connected upgrade — ${weeklyFieldScope.join("/")} only — no publish.`;
  }
  if (phase >= 6 && (doUpgrade || doImages || doPrintables || doSongsBooks)) {
    return `Job created (${status}). Phase 6 full Teaching Kit finish — no publish / no lesson.create.`;
  }
  if (doSongsBooks && !doImages && !doPrintables && phase === 5) {
    return `Job created (${status}). Phase 5 songs+books — no publish / no image or printable regeneration.`;
  }
  if (doPrintables && phase === 4) {
    return `Job created (${status}). Phase 4 printables — no publish / no image regeneration.`;
  }
  if (doUpgrade && doImages) {
    return `Job created (${status}). Phase 2.5 text + Phase 3 images — no publish.`;
  }
  if (doUpgrade) {
    return `Job created (${status}). Phase 2 draft upgrade — no publish.`;
  }
  if (doImages) {
    return `Job created (${status}). Phase 3 activity images — no publish.`;
  }
  return `Job created (${status}). Audit-only — no curriculum mutations.`;
}

function buildRunStartLogMessage(command = {}) {
  const flags = computeExecutionFlags(command);
  const { phase, doCreate, doUpgrade, doImages, doPrintables, doSongsBooks, narrow, weeklyFieldScope } = flags;

  if (doCreate) {
    return "Starting Phase 7 new draft lesson create + Teaching Kit finish (no publish).";
  }
  if (narrow) {
    return `Starting ${narrowScopeLabel(weeklyFieldScope).toLowerCase()} connected upgrade (${weeklyFieldScope.join("/")} only) — no publish.`;
  }
  if (phase >= 6 && (doUpgrade || doImages || doPrintables || doSongsBooks)) {
    return "Starting Phase 6 full Teaching Kit finish (no publish, no lesson.create).";
  }
  if (doSongsBooks && phase === 5) {
    return "Starting Phase 5 songs+books run (no publish, no image/printable regeneration).";
  }
  if (doPrintables && phase === 4) {
    return "Starting Phase 4 printable run (no publish, no image regeneration).";
  }
  if (doUpgrade && doImages) {
    return "Starting Phase 2.5 draft upgrade + Phase 3 activity images (no publish).";
  }
  if (doUpgrade) {
    return "Starting Phase 2.5 draft upgrade run (no publish).";
  }
  if (doImages) {
    return "Starting Phase 3 activity image run (no publish).";
  }
  return "Starting audit-only run.";
}

function activityUpdatesAllowed(command = {}, mutationAllowlist = null) {
  const allowlist = mutationAllowlist || allowlistApi.buildMutationAllowlist(command, {
    lessonIds: schema.asArray(command?.scope?.lessonIds),
  });
  return Boolean(allowlist?.allowedActivityFields?.size);
}

function detectPlannedScopeContradiction(command = {}, planSummary = {}, mutationAllowlist = null) {
  const flags = computeExecutionFlags(command);
  const allowlist = mutationAllowlist || allowlistApi.buildMutationAllowlist(command, {
    lessonIds: schema.asArray(command?.scope?.lessonIds),
  });
  const contradictions = [];

  if (!flags.narrow) {
    return { blocked: false, contradictions: [], confirmReasons: [] };
  }

  if (isFullKitPhaseNote(planSummary?.phaseNote)) {
    contradictions.push({
      code: "PLANNED_SCOPE_CONTRADICTION",
      message: "Narrow weekly scope but execution plan labels full Teaching Kit finish.",
    });
  }
  if (planSummary?.generatesImages || planSummary?.generatesPrintables || planSummary?.generatesSongsBooks) {
    contradictions.push({
      code: "PLANNED_SCOPE_CONTRADICTION",
      message: "Narrow weekly scope but plan summary includes asset generation flags.",
    });
  }
  if (flags.doImages || flags.doPrintables || flags.doSongsBooks) {
    contradictions.push({
      code: "PLANNED_SCOPE_CONTRADICTION",
      message: "Narrow weekly scope but internal execution flags include asset phases.",
    });
  }
  const lessonRow = schema.asArray(planSummary?.lessons)[0];
  const expected = schema.asArray(lessonRow?.expectedActions);
  if (expected.some((action) => ["image.generate", "printable.generatePages", "song.upsert", "book.upsert"].includes(action))) {
    contradictions.push({
      code: "PLANNED_SCOPE_CONTRADICTION",
      message: "Narrow weekly scope but planned expectedActions include asset mutation steps.",
    });
  }
  if (expected.includes("activity.update") && !activityUpdatesAllowed(command, allowlist)) {
    contradictions.push({
      code: "PLANNED_SCOPE_CONTRADICTION",
      message: "Narrow weekly scope excludes activity mutations but plan includes activity.update.",
    });
  }

  return {
    blocked: contradictions.length > 0,
    contradictions,
    confirmReasons: contradictions.length ? ["planned_scope_contradiction"] : [],
  };
}

function buildWouldRunPhaseMap(command = {}, mutationAllowlist = null) {
  const flags = computeExecutionFlags(command);
  const allowlist = mutationAllowlist || allowlistApi.buildMutationAllowlist(command, {
    lessonIds: schema.asArray(command?.scope?.lessonIds),
  });
  const textAllowed = allowlistApi.phaseAllowed("text", allowlist);
  const activityAllowed = Boolean(allowlist?.allowedActivityFields?.size);

  return {
    lessonContent: flags.doUpgrade && textAllowed ? "RUN (allowed weekly fields only)" : "SKIP",
    activities: activityAllowed ? "RUN (targeted activity fields only)" : "SKIP / OUT OF SCOPE",
    images: flags.doImages && allowlistApi.phaseAllowed("images", allowlist) ? "RUN" : "SKIP / EXCLUDED",
    printables: flags.doPrintables && allowlistApi.phaseAllowed("printables", allowlist) ? "RUN" : "SKIP / EXCLUDED",
    cover: allowlistApi.phaseAllowed("cover", allowlist) ? "RUN" : "SKIP / EXCLUDED",
    songs: flags.doSongsBooks && allowlistApi.phaseAllowed("songs", allowlist) ? "RUN" : "SKIP / EXCLUDED",
    books: flags.doSongsBooks && allowlistApi.phaseAllowed("books", allowlist) ? "RUN" : "SKIP / EXCLUDED",
    publish: allowlist?.publishAllowed ? "RUN" : "SKIP / FALSE",
  };
}

module.exports = {
  FULL_KIT_PHASE_NOTE_RE,
  isNarrowWeeklyScope,
  narrowScopeLabel,
  isFullKitPhaseNote,
  isFullKitJobLog,
  computeExecutionFlags,
  buildScopeAwarePhaseNote,
  buildJobCreatedLogMessage,
  buildRunStartLogMessage,
  activityUpdatesAllowed,
  detectPlannedScopeContradiction,
  buildWouldRunPhaseMap,
};
