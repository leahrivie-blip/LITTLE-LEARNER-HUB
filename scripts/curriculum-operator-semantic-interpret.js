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
  };
}

function applyToParsedResult(parsed = {}, options = {}) {
  const command = parsed.command;
  if (!command || typeof command !== "object") return parsed;
  const raw = command.rawCommand || options.rawCommand || "";
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

  let nextActions = { ...command.actions };
  if (compiled.primary) {
    nextActions = capabilities.applyCapabilityFlags(nextActions, compiled);
  } else if (command.completion?.mutationsEnabled && nextActions.planOnly !== true) {
    nextActions.composeReviewDraft = true;
    nextActions.saveDraft = true;
    if (nextActions.connectedAutoApply !== false) nextActions.connectedAutoApply = true;
  }
  if (signals.exclude.publish) nextActions.publish = false;
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

  let nextIntent = compiled.intent || command.intent;
  if (compiled.primary === "ACTIVITY_IMAGE_REPAIR") nextIntent = "finish_images";
  if (compiled.primary === "META_INSTRUCTION") nextIntent = "unknown";

  const confirmReasons = [...schema.asArray(parsed.confirmReasons)];
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

  if (signals.collection && nextScope.plan) {
    parsed.ambiguous = false;
    const filtered = confirmReasons.filter((r) => r !== "unexpectedly_large_scope");
    confirmReasons.length = 0;
    confirmReasons.push(...filtered);
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

  if (compiled.primary) {
    nextCommand.actions = capabilities.applyCapabilityFlags(nextCommand.actions, compiled);
    if (compiled.intent) nextCommand.intent = compiled.intent;
  }
  nextCommand.actions.publish = false;
  if (signals.exclude.publish) nextCommand.actions.publish = false;
  if (compiled.primary === "ACTIVITY_IMAGE_REPAIR") {
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
    nextCommand.actions.replaceBadImages = true;
    nextCommand.actions.checkImages = true;
    nextCommand.actions.touchImages = true;
    nextCommand.actions.saveDraft = true;
    nextCommand.actions.composeReviewDraft = true;
    nextCommand.actions.connectedAutoApply = nextCommand.actions.planOnly !== true;
    nextCommand.completion.mutationsEnabled = true;
    nextCommand.scope.ageBand = signals.ageBand || null;
    if (signals.access) nextCommand.scope.plan = signals.access;
  }
  if (compiled.primary === "FULL_KIT_WORK") {
    nextCommand.intent = "finish_full_kit";
    nextCommand.actions.connectedUpgrade = true;
    nextCommand.actions.connectedAutoApply = nextCommand.actions.planOnly !== true;
    nextCommand.actions.composeReviewDraft = true;
    nextCommand.actions.saveDraft = true;
    if (signals.replaceBadImages) nextCommand.actions.replaceBadImages = true;
    if (signals.coverRequested) nextCommand.actions.touchCover = true;
    if (signals.exclude.printables) {
      nextCommand.actions.generatePrintables = false;
      nextCommand.actions.touchPrintables = false;
      nextCommand.actions.checkPrintables = false;
    }
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

  const contradiction = contradictionApi.checkContradictions({
    signals,
    command: nextCommand,
    resolvedRows: targets.rows,
    compiled,
  });
  contradiction.confirmReasons.forEach((reason) => confirmReasons.push(reason));

  const unjustified = capabilities.capabilityWithoutReason(nextCommand.actions, compiled.reasons);
  if (unjustified.length && compiled.primary === "ACTIVITY_IMAGE_REPAIR") {
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

module.exports = {
  INTERPRET_VERSION,
  applyToParsedResult,
  sanitizeOperatorContext,
  extractSignals: signalsApi.extractSignals,
};
