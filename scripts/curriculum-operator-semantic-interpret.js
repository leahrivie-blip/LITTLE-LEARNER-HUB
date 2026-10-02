/**
 * Semantic interpretation overlay for the existing Curriculum Operator.
 * AI (optional) may propose meaning; deterministic code authorizes flags/targets.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const signalsApi = require("./curriculum-operator-semantic-signals.js");
const capabilities = require("./curriculum-operator-semantic-capabilities.js");
const targetsApi = require("./curriculum-operator-semantic-targets.js");
const contradictionApi = require("./curriculum-operator-semantic-contradiction.js");
const summaryApi = require("./curriculum-operator-semantic-summary.js");
const draftCompose = require("./curriculum-operator-review-draft-compose.js");

const INTERPRET_VERSION = 1;

function sanitizeOperatorContext(raw) {
  if (!raw || typeof raw !== "object") return {};
  return {
    previousIntent: schema.text(raw.previousIntent, 80) || "",
    previousResolvedTargets: schema.asArray(raw.previousResolvedTargets)
      .map((id) => schema.text(id, 160)).filter(Boolean).slice(0, 40),
    previousAllowedScopes: schema.asArray(raw.previousAllowedScopes)
      .map((flag) => schema.text(flag, 60)).filter(Boolean).slice(0, 40),
    previousExclusions: schema.asArray(raw.previousExclusions)
      .map((flag) => schema.text(flag, 60)).filter(Boolean).slice(0, 20),
    previousPlanId: schema.text(raw.previousPlanId, 80) || "",
    previousJobId: schema.text(raw.previousJobId, 80) || "",
    failedAssets: schema.asArray(raw.failedAssets).slice(0, 40),
    sourceJobId: schema.text(raw.sourceJobId, 80) || "",
  };
}

function normalizeActivityTitle(value) {
  return schema.text(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function resolveSingleActivityImageTarget({ signals, lessonIds, lessonPlans, activities }) {
  if (!signals?.singleActivityImageTarget && !signals?.activityOrdinal && !signals?.activityTitleHint) {
    return { ok: true, ids: [], ambiguous: false, unresolved: false };
  }
  const lessonId = schema.asArray(lessonIds)[0] || "";
  const plan = schema.asArray(lessonPlans).find((row) => row.id === lessonId) || null;
  const orderedIds = schema.asArray(plan?.activityIds).map((id) => schema.text(id, 160)).filter(Boolean);
  const acts = schema.asArray(activities).filter((act) => {
    const id = schema.text(act?.id || act?.itemId, 160);
    if (!id) return false;
    if (orderedIds.length) return orderedIds.includes(id);
    return schema.text(act?.lessonPlanId || act?.lessonId, 160) === lessonId;
  });
  const ordered = orderedIds.length
    ? orderedIds.map((id) => acts.find((a) => schema.text(a.id || a.itemId, 160) === id)).filter(Boolean)
    : acts;
  if (signals.activityOrdinal) {
    const hit = ordered[signals.activityOrdinal - 1];
    if (!hit) return { ok: false, ids: [], ambiguous: false, unresolved: true };
    return { ok: true, ids: [schema.text(hit.id || hit.itemId, 160)], ambiguous: false, unresolved: false };
  }
  const hint = normalizeActivityTitle(signals.activityTitleHint);
  if (!hint) return { ok: false, ids: [], ambiguous: false, unresolved: true };
  const matches = ordered.filter((act) => {
    const title = normalizeActivityTitle(act.title);
    return title === hint || title.includes(hint) || hint.includes(title);
  });
  if (matches.length === 1) {
    return { ok: true, ids: [schema.text(matches[0].id || matches[0].itemId, 160)], ambiguous: false, unresolved: false };
  }
  if (matches.length > 1) return { ok: false, ids: [], ambiguous: true, unresolved: false };
  return { ok: false, ids: [], ambiguous: false, unresolved: true };
}

function applyToParsedResult(parsed = {}, options = {}) {
  const command = parsed.command;
  if (!command || typeof command !== "object") return parsed;
  const raw = command.rawCommand || options.rawCommand || "";
  const isCreate = command.actions?.createLesson === true;
  const signals = signalsApi.extractSignals(raw);
  const context = sanitizeOperatorContext(options.operatorContext);

  const compiled = capabilities.compileCapabilities(signals, context);
  const targets = targetsApi.resolveTargets({
    signals,
    parsedTitles: command.scope?.titles || [],
    parsedLessonIds: command.scope?.lessonIds || [],
    lessonPlans: options.lessonPlans || [],
    currentlySelectedLessonId: options.currentlySelectedLessonId || command.scope?.currentlySelectedLessonId,
    context,
  });
  const conversationalFollowUp = targets.mode === "context_inherit"
    && targets.rows.length === 1
    && !signals.doTheSame;

  let nextActions = { ...command.actions };
  if (conversationalFollowUp) {
    nextActions.upgradeLesson = true;
    nextActions.upgradeActivities = true;
    nextActions.saveDraft = true;
    nextActions.connectedUpgrade = true;
    nextActions.connectedAutoApply = true;
  }
  if (compiled.primary && !isCreate) {
    nextActions = capabilities.applyCapabilityFlags(nextActions, compiled);
  } else if (command.completion?.mutationsEnabled && nextActions.planOnly !== true) {
    nextActions.composeReviewDraft = true;
    nextActions.saveDraft = true;
    if (nextActions.connectedAutoApply !== false) nextActions.connectedAutoApply = true;
  }
  if (signals.exclude.publish) nextActions.publish = false;
  if (signals.exclude.cover) nextActions.touchCover = false;
  if (signals.coverRequested) nextActions.touchCover = true;

  const nextScope = { ...command.scope };
  if (signals.access === "Free" || signals.access === "Pro") nextScope.plan = signals.access;
  if (!signals.ageBand) nextScope.ageBand = null;
  else nextScope.ageBand = signals.ageBand;

  if (targets.mode === "collection" || signals.collection) {
    nextScope.selection = "filter";
    nextScope.titles = [];
    nextScope.lessonIds = [];
  } else if (targets.lessonIds?.length && targets.mode !== "none") {
    nextScope.selection = targets.selection;
    nextScope.lessonIds = targets.lessonIds;
    nextScope.titles = targets.titles || [];
  } else if (targets.exampleOnly?.length && !targets.rows?.length) {
    nextScope.titles = [];
  }

  let nextIntent = conversationalFollowUp ? "finish_full_kit" : (isCreate ? command.intent : (compiled.intent || command.intent));
  if (!isCreate && compiled.primary === "ACTIVITY_IMAGE_REPAIR") nextIntent = "finish_images";
  if (!isCreate && compiled.primary === "META_INSTRUCTION") nextIntent = "unknown";

  const confirmReasons = conversationalFollowUp
    ? schema.asArray(parsed.confirmReasons).filter((reason) => reason !== "ambiguous_scope")
    : [...schema.asArray(parsed.confirmReasons)];
  if (signals.accessConflict) confirmReasons.push("semantic_contradiction");
  if (signals.publishConflict) confirmReasons.push("semantic_contradiction");
  if (signals.metaInstruction) confirmReasons.push("meta_instruction");
  if (signals.ambiguousBare && !context.previousIntent) confirmReasons.push("ambiguous_scope");
  if (targets.ambiguous?.length) confirmReasons.push("ambiguous_scope");
  if (targets.unresolved?.length && !signals.collection) confirmReasons.push("unresolved_target");

  const accessCheck = targetsApi.assertAccessInvariant(targets.rows, signals.access);
  if (!accessCheck.ok) confirmReasons.push(accessCheck.code);
  const ageCheck = targetsApi.assertAgeInvariant(targets.rows, signals.ageBand);
  if (!ageCheck.ok) confirmReasons.push(ageCheck.code);

  if (signals.collection) {
    // Intentional multi-target collections are not ambiguous single-target requests.
    parsed.ambiguous = false;
    const filtered = confirmReasons.filter((r) =>
      r !== "unexpectedly_large_scope" && r !== "ambiguous_scope" && r !== "multiple_lessons_matched");
    confirmReasons.length = 0;
    confirmReasons.push(...filtered);
    if (parsed.ownerIntent && typeof parsed.ownerIntent === "object") {
      parsed.ownerIntent.needsClarification = false;
    }
  }

  let nextCommand = schema.normalizeOperatorCommand({
    ...command,
    intent: nextIntent,
    scope: nextScope,
    actions: nextActions,
    confirmations: {
      ...(command.confirmations || {}),
      reasons: [...schema.asArray(command.confirmations?.reasons), ...confirmReasons],
    },
    parsedNotes: [
      ...schema.asArray(command.parsedNotes),
      ...schema.asArray(compiled.notes),
    ],
  }, { phase: command.completion?.phase || options.phase || 7 });

  if (compiled.primary && !isCreate) {
    nextCommand.actions = capabilities.applyCapabilityFlags(nextCommand.actions, compiled);
    if (compiled.intent) nextCommand.intent = compiled.intent;
  }
  nextCommand.actions.publish = false;
  if (signals.exclude.publish) nextCommand.actions.publish = false;
  if (!isCreate && compiled.primary === "ACTIVITY_IMAGE_REPAIR") {
    nextCommand.intent = "finish_images";
    nextCommand.actions.connectedUpgrade = false;
    nextCommand.actions.upgradeLesson = false;
    nextCommand.actions.upgradeActivities = false;
    nextCommand.actions.generatePrintables = false;
    nextCommand.actions.generateSongsBooks = false;
    nextCommand.actions.touchPrintables = false;
    nextCommand.actions.touchSongs = false;
    nextCommand.actions.touchBooks = false;
    nextCommand.actions.touchCover = signals.coverRequested === true;
    nextCommand.actions.checkPrintables = false;
    nextCommand.actions.checkSongs = false;
    nextCommand.actions.checkBooks = false;
    nextCommand.actions.generateImages = true;
    // replaceBadImages = replace only unjustified/bad/missing — KEEP stays authoritative in refineImageDecision.
    nextCommand.actions.replaceBadImages = true;
    nextCommand.actions.keepGoodImages = signals.keepGoodImages === true;
    nextCommand.actions.forceReplaceAllImages = false;
    nextCommand.actions.checkImages = true;
    nextCommand.actions.touchImages = true;
    nextCommand.actions.saveDraft = true;
    nextCommand.actions.composeReviewDraft = true;
    nextCommand.actions.connectedAutoApply = nextCommand.actions.planOnly !== true;
    nextCommand.completion.mutationsEnabled = true;
    nextCommand.scope.ageBand = signals.ageBand || null;
    if (signals.access) nextCommand.scope.plan = signals.access;
  }
  if (!isCreate && compiled.primary === "ASSETS_ONLY_WORK") {
    nextCommand.intent = "finish_images";
    nextCommand.actions.connectedUpgrade = false;
    nextCommand.actions.upgradeLesson = false;
    nextCommand.actions.upgradeActivities = false;
    nextCommand.actions.generateSongsBooks = false;
    nextCommand.actions.touchSongs = false;
    nextCommand.actions.touchBooks = false;
    nextCommand.actions.keepGoodImages = signals.keepGoodImages === true;
    nextCommand.actions.forceReplaceAllImages = false;
    nextCommand.actions.publish = false;
    nextCommand.actions.saveDraft = true;
    nextCommand.actions.composeReviewDraft = true;
    nextCommand.actions.connectedAutoApply = nextCommand.actions.planOnly !== true;
    nextCommand.completion.mutationsEnabled = true;
  }
  if (!isCreate && compiled.primary === "COVER_WORK") {
    nextCommand.intent = "fix_lesson";
    nextCommand.actions.touchCover = true;
    nextCommand.actions.connectedUpgrade = false;
    nextCommand.actions.generateImages = false;
    nextCommand.actions.replaceBadImages = false;
    nextCommand.actions.touchImages = false;
    nextCommand.actions.publish = false;
    nextCommand.actions.saveDraft = true;
    nextCommand.actions.composeReviewDraft = true;
    nextCommand.actions.connectedAutoApply = nextCommand.actions.planOnly !== true;
    nextCommand.completion.mutationsEnabled = true;
  }
  if (!isCreate && compiled.primary === "RETRY_FAILED_ASSETS") {
    nextCommand.intent = "finish_images";
    nextCommand.actions.publish = false;
    nextCommand.actions.connectedUpgrade = false;
    nextCommand.actions.upgradeLesson = false;
    nextCommand.actions.upgradeActivities = false;
    const failed = schema.asArray(context.failedAssets);
    const coverFails = failed.filter((row) => row?.type === "cover");
    const imageFails = failed.filter((row) => row?.type === "image");
    const printableFails = failed.filter((row) => row?.type === "printable");
    let selected = [];
    if (signals.retryCoverOnly) selected = coverFails;
    else if (signals.activityTitleHint) {
      const hint = normalizeActivityTitle(signals.activityTitleHint);
      selected = failed.filter((row) => normalizeActivityTitle(row?.activityTitle || row?.action?.activityTitle).includes(hint)
        || normalizeActivityTitle(row?.action?.activityTitle || "").includes(hint));
    } else if (imageFails.length === 1 && !signals.retryCoverOnly) selected = imageFails;
    else if (failed.length === 1) selected = failed;
    if (!selected.length) {
      confirmReasons.push("retry_asset_clarification_required");
      nextCommand.completion.mutationsEnabled = false;
      nextCommand.actions.generateImages = false;
      nextCommand.actions.generatePrintables = false;
      nextCommand.actions.touchCover = false;
      nextCommand.parsedNotes = [...schema.asArray(nextCommand.parsedNotes),
        "Retry needs a specific failed asset from the current job — I will not regenerate successful assets."];
    } else {
      nextCommand.actions.retryFailedAssets = true;
      nextCommand.actions.selectedFailedAssetIds = selected.map((row) => schema.text(row.idempotencyKey || row.action?.idempotencyKey, 240)).filter(Boolean);
      nextCommand.actions.selectedFailedAssetTypes = [...new Set(selected.map((row) => row.type))];
      nextCommand.actions.sourceJobId = context.sourceJobId || null;
      nextCommand.actions.touchCover = selected.some((row) => row.type === "cover");
      nextCommand.actions.generateImages = selected.some((row) => row.type === "image");
      nextCommand.actions.generatePrintables = selected.some((row) => row.type === "printable");
      nextCommand.completion.mutationsEnabled = true;
      // Unique failed-asset retry is intentionally scoped — not an ambiguous lesson target.
      parsed.ambiguous = false;
      if (parsed.ownerIntent && typeof parsed.ownerIntent === "object") {
        parsed.ownerIntent.needsClarification = false;
      }
      const filteredRetry = confirmReasons.filter((r) => r !== "ambiguous_scope" && r !== "multiple_lessons_matched");
      confirmReasons.length = 0;
      confirmReasons.push(...filteredRetry);
    }
  }
  // Single-activity image targeting — fail closed if not uniquely resolvable.
  if (!isCreate && (signals.singleActivityImageTarget || signals.activityOrdinal || signals.activityTitleHint)
    && (compiled.primary === "ACTIVITY_IMAGE_REPAIR" || compiled.primary === "ASSETS_ONLY_WORK")) {
    const resolvedActivity = resolveSingleActivityImageTarget({
      signals,
      lessonIds: nextCommand.scope?.lessonIds || targets.lessonIds || [],
      lessonPlans: options.lessonPlans || [],
      activities: options.activities || [],
    });
    if (!resolvedActivity.ok) {
      confirmReasons.push(resolvedActivity.ambiguous ? "ambiguous_activity_target" : "unresolved_activity_target");
      nextCommand.completion.mutationsEnabled = false;
      nextCommand.actions.generateImages = false;
      nextCommand.actions.replaceBadImages = false;
    } else if (resolvedActivity.ids.length) {
      nextCommand.scope.targetActivityIds = resolvedActivity.ids;
    }
  }
  if (signals.keepGoodImages) nextCommand.actions.keepGoodImages = true;
  if (!isCreate && compiled.primary === "FULL_KIT_WORK") {
    nextCommand.intent = "finish_full_kit";
    nextCommand.actions.connectedUpgrade = true;
    nextCommand.actions.connectedAutoApply = nextCommand.actions.planOnly !== true;
    nextCommand.actions.composeReviewDraft = true;
    nextCommand.actions.saveDraft = true;
    if (signals.replaceBadImages || signals.keepGoodImages) nextCommand.actions.replaceBadImages = true;
    nextCommand.actions.keepGoodImages = signals.keepGoodImages === true;
    nextCommand.actions.forceReplaceAllImages = false;
    if (signals.coverRequested) nextCommand.actions.touchCover = true;
    if (signals.exclude.cover) nextCommand.actions.touchCover = false;
    if (signals.exclude.printables) {
      nextCommand.actions.generatePrintables = false;
      nextCommand.actions.touchPrintables = false;
      nextCommand.actions.checkPrintables = false;
    }
    if (signals.exclude.songs || signals.exclude.books) {
      nextCommand.actions.generateSongsBooks = false;
      nextCommand.actions.touchSongs = false;
      nextCommand.actions.touchBooks = false;
    }
    nextCommand.actions.publish = false;
    nextCommand.completion.mutationsEnabled = true;
  }
  if (!isCreate && compiled.primary === "CONSERVATIVE_FULL_AUDIT") {
    nextCommand.intent = "finish_review";
    nextCommand.actions.conservativeFullAudit = true;
    nextCommand.actions.connectedUpgrade = true;
    nextCommand.actions.connectedAutoApply = nextCommand.actions.planOnly !== true;
    nextCommand.actions.composeReviewDraft = true;
    nextCommand.actions.saveDraft = true;
    nextCommand.actions.upgradeLesson = true;
    nextCommand.actions.upgradeActivities = true;
    nextCommand.actions.generateImages = true;
    nextCommand.actions.touchImages = true;
    nextCommand.actions.checkImages = true;
    nextCommand.actions.replaceBadImages = true;
    nextCommand.actions.keepGoodImages = signals.keepGoodImages === true;
    nextCommand.actions.forceReplaceAllImages = false;
    nextCommand.actions.generateSongsBooks = false;
    nextCommand.actions.touchSongs = false;
    nextCommand.actions.touchBooks = false;
    nextCommand.actions.checkSongs = false;
    nextCommand.actions.checkBooks = false;
    nextCommand.actions.generatePrintables = false;
    nextCommand.actions.touchPrintables = false;
    nextCommand.actions.checkPrintables = false;
    nextCommand.actions.touchCover = false;
    nextCommand.actions.publish = false;
    nextCommand.completion.mutationsEnabled = true;
  }
  if (compiled.primary === "META_INSTRUCTION" || signals.ambiguousBare && !context.previousIntent) {
    nextCommand.completion.mutationsEnabled = false;
    nextCommand.actions.saveDraft = false;
    nextCommand.actions.composeReviewDraft = false;
    nextCommand.actions.connectedAutoApply = false;
    nextCommand.actions.connectedUpgrade = false;
  }

  const contradiction = isCreate
    ? { blocked: false, contradictions: [], confirmReasons: [] }
    : contradictionApi.checkContradictions({
      signals,
      command: nextCommand,
      resolvedRows: targets.rows,
      compiled,
    });
  contradiction.confirmReasons.forEach((reason) => confirmReasons.push(reason));

  const unjustified = capabilities.capabilityWithoutReason(nextCommand.actions, compiled.reasons);
  if (!isCreate && unjustified.length && compiled.primary === "ACTIVITY_IMAGE_REPAIR") {
    unjustified.forEach((flag) => { nextCommand.actions[flag] = false; });
  }

  const confidence = {
    overall: contradiction.blocked || signals.ambiguousBare || signals.metaInstruction
      ? "low"
      : (compiled.primary && (signals.access || targets.rows.length || signals.collection) ? "high" : "medium"),
    targetResolution: targets.rows.length || signals.collection ? "high" : "low",
    operationResolution: compiled.primary ? "high" : "medium",
  };

  const ownerSummary = summaryApi.buildOwnerSummary({
    signals,
    compiled,
    command: nextCommand,
    targets,
    contradictions: contradiction.contradictions,
    confidence,
  });
  if (!summaryApi.summariesMatchCommand(ownerSummary, nextCommand)) {
    confirmReasons.push("semantic_contradiction");
    contradiction.blocked = true;
  }

  const uniqueReasons = [...new Set(confirmReasons)];
  const blocked = contradiction.blocked
    || uniqueReasons.includes("meta_instruction")
    || uniqueReasons.includes("unresolved_target")
    || uniqueReasons.includes("access_tier_mismatch")
    || uniqueReasons.includes("ambiguous_scope") && (signals.ambiguousBare || signals.metaInstruction);

  if (blocked) {
    nextCommand.completion.mutationsEnabled = false;
    nextCommand.actions.saveDraft = nextCommand.actions.saveDraft && !signals.metaInstruction && !signals.ambiguousBare;
    if (signals.metaInstruction || signals.ambiguousBare) {
      nextCommand.actions.upgradeLesson = false;
      nextCommand.actions.upgradeActivities = false;
      nextCommand.actions.generateImages = false;
      nextCommand.actions.generatePrintables = false;
      nextCommand.actions.generateSongsBooks = false;
    }
  }

  nextCommand.interpretation = {
    version: INTERPRET_VERSION,
    semanticVersion: signals.semanticVersion,
    operatorPlanVersion: draftCompose.OPERATOR_PLAN_VERSION,
    primary: compiled.primary,
    signals: {
      access: signals.access,
      ageBand: signals.ageBand,
      imagesOnly: signals.imagesOnly,
      vocabOnly: signals.vocabOnly,
      collection: signals.collection,
      keepGoodImages: signals.keepGoodImages,
      metaInstruction: signals.metaInstruction,
    },
    capabilityReasons: compiled.reasons,
    allowed: compiled.allowed,
    forbidden: compiled.forbidden,
    targets: {
      mode: targets.mode,
      ids: (targets.rows || []).map((r) => r.id),
      exampleOnly: targets.exampleOnly,
      unresolved: targets.unresolved,
      ambiguous: targets.ambiguous,
    },
    contradictions: contradiction.contradictions,
    confidence,
    ownerSummary: ownerSummary.text,
    ownerFacingFlags: ownerSummary.ownerFacingFlags,
    nextContext: {
      previousIntent: compiled.primary || command.intent,
      previousResolvedTargets: (targets.rows || []).map((r) => r.id),
      previousAllowedScopes: compiled.allowed,
      previousExclusions: Object.keys(signals.exclude || {}).filter((k) => signals.exclude[k]),
    },
  };

  const needsConfirmation = Boolean(parsed.needsConfirmation)
    || uniqueReasons.includes("publish_requested")
    || uniqueReasons.includes("semantic_contradiction")
    || uniqueReasons.includes("meta_instruction")
    || uniqueReasons.includes("unresolved_target")
    || uniqueReasons.includes("access_tier_mismatch")
    || uniqueReasons.includes("age_band_mismatch")
    || (uniqueReasons.includes("ambiguous_scope") && (signals.ambiguousBare || !compiled.primary && !signals.collection));

  return {
    ...parsed,
    command: nextCommand,
    confirmReasons: uniqueReasons,
    needsConfirmation,
    ambiguous: (Boolean(parsed.ambiguous) && !signals.collection)
      || signals.ambiguousBare
      || signals.metaInstruction,
    parseSafety: {
      ...(parsed.parseSafety || {}),
      blocked: Boolean(parsed.parseSafety?.blocked) || blocked,
      reasons: [...schema.asArray(parsed.parseSafety?.reasons), ...uniqueReasons.filter((r) => [
        "semantic_contradiction", "meta_instruction", "unresolved_target",
        "access_tier_mismatch", "age_band_mismatch", "ambiguous_scope",
      ].includes(r))],
      contradictions: [
        ...schema.asArray(parsed.parseSafety?.contradictions),
        ...contradiction.contradictions,
      ],
    },
    interpretation: nextCommand.interpretation,
  };
}

function refreshFinalizedResearchInterpretation(parsed = {}, { preserveTarget = false, targetRows = [] } = {}) {
  const command = parsed.command;
  if (!command || typeof command !== "object") return parsed;
  const scope = command.scope || {};
  const existing = command.interpretation || parsed.interpretation || {};
  const lessonIds = preserveTarget ? schema.asArray(scope.lessonIds) : [];
  const titles = preserveTarget ? schema.asArray(scope.titles) : [];
  const rows = preserveTarget ? schema.asArray(targetRows) : [];
  const summary = summaryApi.buildOwnerSummary({
    command,
    targets: { mode: lessonIds.length ? "explicit" : "none", rows },
    confidence: { overall: parsed.needsConfirmation ? "medium" : "high" },
  });
  command.interpretation = {
    ...existing,
    primary: null,
    capabilityReasons: [],
    allowed: [],
    forbidden: [],
    targets: {
      mode: lessonIds.length ? "explicit" : "none",
      ids: lessonIds,
      exampleOnly: [],
      unresolved: [],
      ambiguous: [],
      titles,
    },
    ownerSummary: summary.text,
    ownerFacingFlags: summary.ownerFacingFlags,
    nextContext: {
      ...(existing.nextContext || {}),
      previousIntent: command.intent,
      previousResolvedTargets: lessonIds,
      previousAllowedScopes: [],
    },
  };
  return { ...parsed, command, interpretation: command.interpretation };
}

module.exports = {
  INTERPRET_VERSION,
  applyToParsedResult,
  refreshFinalizedResearchInterpretation,
  sanitizeOperatorContext,
  extractSignals: signalsApi.extractSignals,
};
