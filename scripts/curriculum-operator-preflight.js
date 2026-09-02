/**
 * AI Curriculum Operator — pre-execution validation gate.
 * Jobs must not be created unless preflight.valid === true.
 */
"use strict";

const crypto = require("crypto");
const schema = require("./curriculum-operator-schema.js");
const targetResolver = require("./curriculum-operator-target-resolver.js");
const actionScopeApi = require("./curriculum-operator-action-scope.js");

function text(value, max = 4000) {
  return schema.text(value, max);
}

function hashRequest({ rawCommand, lessonIds, requestedCount, allowedActions }) {
  const canonical = JSON.stringify({
    raw: text(rawCommand, 4000),
    lessonIds: schema.asArray(lessonIds),
    requestedCount: requestedCount == null ? null : Number(requestedCount),
    allowedActions: schema.asArray(allowedActions).slice().sort(),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

function correctionFor(blockReasons, resolution) {
  if (blockReasons.includes("unresolved_lesson_id")) {
    return "Supply a valid existing lesson ID. The previous ID was not found, so no job was created.";
  }
  if (blockReasons.includes("ambiguous_title") || blockReasons.includes("multiple_lessons_matched")) {
    const rows = schema.asArray(resolution?.candidates);
    const listed = rows.map((row) => `${row.id} — ${row.title} (${row.ageGroup || row.ageBand}, ${row.accessLevel}, ${row.status})`).join("; ");
    return `Multiple lessons matched. Confirm one exact lesson ID${listed ? `: ${listed}` : "."}`;
  }
  if (blockReasons.includes("title_mismatch")) {
    return "Confirm the resolved lesson title, or correct the supplied title, before any mutation.";
  }
  if (blockReasons.includes("count_mismatch")) {
    return "Correct the requested count so it matches the resolved target, or name exact activity IDs.";
  }
  if (blockReasons.includes("count_limit_conflict")) {
    return "Lower the requested count to the system limit, or split the work. The count was not changed silently.";
  }
  if (blockReasons.includes("protected_lesson")) {
    return "Remove the protected lesson (Farm Animals) from this command. Protected lessons cannot be mutated.";
  }
  if (blockReasons.includes("interpretation_mismatch")) {
    return "Rephrase the command so the parsed plan matches the requested lesson, count, and categories.";
  }
  if (blockReasons.includes("unresolved_title")) {
    return "Use an exact lesson ID. The title could not be resolved to one lesson.";
  }
  return "Fix the interpretation issues above, then Interpret again. No job was created.";
}

/**
 * @param {{
 *   rawCommand?: string,
 *   command?: object,
 *   resolution?: object,
 *   actionScope?: object,
 *   selection?: object,
 *   limits?: object,
 * }} options
 */
function buildPreflight(options = {}) {
  const command = options.command && typeof options.command === "object" ? options.command : {};
  const raw = text(options.rawCommand || command.rawCommand, 4000);
  const resolution = options.resolution || targetResolver.resolveTargets({
    rawCommand: raw,
    lessonPlans: options.lessonPlans || [],
    currentlySelectedLessonId: command.scope?.currentlySelectedLessonId,
    suppliedTitles: command.scope?.titles,
  });
  const actionScope = options.actionScope || actionScopeApi.applyActionScope(raw, command.actions || {});
  const limits = options.limits || command.limits || schema.DEFAULT_LIMITS;
  const selection = options.selection || null;

  const mismatches = [...schema.asArray(resolution.mismatches)];
  const blockReasons = [...schema.asArray(resolution.blockReasons)];

  const lessonIds = schema.asArray(resolution.resolvedLessonIds).filter(Boolean);
  const selectedIds = selection
    ? schema.asArray(selection.selected).map((row) => text(row.id, 160)).filter(Boolean)
    : lessonIds;
  const lessonCount = selectedIds.length || lessonIds.length;
  const requestedCount = resolution.requestedItemCount != null
    ? resolution.requestedItemCount
    : resolution.requestedLessonCount;
  let resolvedCount = resolution.requestedItemCount != null
    ? resolution.requestedItemCount
    : lessonCount;
  if (selection?.resolvedItemCount != null) resolvedCount = selection.resolvedItemCount;

  if (resolution.selectionMethod === "explicit_ids" && resolution.suppliedLessonIds.length) {
    const allResolved = resolution.suppliedLessonIds.every((id) => lessonIds.includes(id));
    if (!allResolved) {
      blockReasons.push("unresolved_lesson_id");
      mismatches.push(`You supplied lesson ID ${resolution.suppliedLessonIds.find((id) => !lessonIds.includes(id))}, but it could not be resolved.`);
    }
  }

  const mustResolveTarget = Boolean(
    resolution.suppliedLessonIds?.length || resolution.suppliedTitles?.length,
  );
  if (resolution.selectionMethod === "unresolved" && mustResolveTarget) {
    if (!blockReasons.includes("unresolved_lesson_id") && !blockReasons.includes("unresolved_title")) {
      blockReasons.push(resolution.suppliedLessonIds.length ? "unresolved_lesson_id" : "unresolved_title");
    }
  }

  if (resolution.selectionMethod === "ambiguous") {
    blockReasons.push("ambiguous_title");
    if (resolution.requestedLessonCount === 1 && lessonCount > 1) {
      mismatches.push(`You requested 1 lesson, but ${lessonCount} lessons matched.`);
    }
  }

  if (
    resolution.requestedItemCount != null
    && selection?.selectedItemCount != null
    && selection.selectedItemCount !== resolution.requestedItemCount
  ) {
    blockReasons.push("count_mismatch");
    mismatches.push(
      `You requested exactly ${resolution.requestedItemCount} ${resolution.itemKind || "items"}, but ${selection.selectedItemCount} were selected.`,
    );
  }

  if (resolution.hardCap != null && resolvedCount > resolution.hardCap) {
    blockReasons.push("count_mismatch");
    mismatches.push(`You requested a hard cap of ${resolution.hardCap}, but ${resolvedCount} were selected.`);
  }

  const hardMaxLessons = Number(limits.hardMaxLessons) || schema.DEFAULT_LIMITS.hardMaxLessons;
  const hardMaxImages = Number(limits.maxImageGenerations) || schema.DEFAULT_LIMITS.maxImageGenerations;
  if (resolution.requestedLessonCount != null && resolution.requestedLessonCount > hardMaxLessons) {
    blockReasons.push("count_limit_conflict");
    mismatches.push(`Requested lesson count ${resolution.requestedLessonCount} exceeds the system limit of ${hardMaxLessons}.`);
  }
  if (
    resolution.requestedItemCount != null
    && (resolution.itemKind === "images" || resolution.itemKind === "activities")
    && resolution.requestedItemCount > hardMaxImages
  ) {
    blockReasons.push("count_limit_conflict");
    mismatches.push(`Requested count ${resolution.requestedItemCount} exceeds the system image limit of ${hardMaxImages}.`);
  }

  if (resolution.protectedLessonIds?.length && actionScope.mutationsEnabled) {
    blockReasons.push("protected_lesson");
    mismatches.push("This command includes a protected lesson (Farm Animals). Mutation is blocked.");
  }

  if (
    selection?.selectionMethod
    && resolution.selectionMethod === "explicit_ids"
    && selection.selectionMethod !== "explicit_ids"
  ) {
    blockReasons.push("interpretation_mismatch");
    mismatches.push("The execution plan does not use the supplied lesson IDs.");
  }

  if (actionScope.imageOnly) {
    mismatches.push("This request is image-only; songs, books, printables, lesson text, and cover are locked.");
  }
  if (actionScope.auditOnly) {
    mismatches.push("Audit-only mode: no draft or curriculum mutations are allowed.");
  }

  const uniqueReasons = [...new Set(blockReasons)];
  const blocking = uniqueReasons.filter((reason) => reason !== "");
  const targetBlocked = resolution.selectionMethod === "ambiguous"
    || (resolution.selectionMethod === "unresolved" && mustResolveTarget);
  const valid = blocking.length === 0 && !targetBlocked;

  const requestHash = hashRequest({
    rawCommand: raw,
    lessonIds: valid ? lessonIds : resolution.suppliedLessonIds,
    requestedCount,
    allowedActions: actionScope.allowedActions,
  });

  const preflight = {
    valid,
    lessonIds: valid ? lessonIds : [],
    lessonCount: valid ? lessonCount : 0,
    requestedCount: requestedCount == null ? null : requestedCount,
    resolvedCount: valid ? resolvedCount : 0,
    allowedActions: actionScope.allowedActions || [],
    blockedActions: actionScope.blockedActions || [],
    mutationsEnabled: valid ? actionScope.mutationsEnabled === true : false,
    saveDraft: valid ? actionScope.actions?.saveDraft === true : false,
    publish: false,
    selectionMethod: resolution.selectionMethod,
    auditOnly: actionScope.auditOnly === true,
    draftOnly: actionScope.draftOnly === true,
    imageOnly: actionScope.imageOnly === true,
    generateImages: valid && actionScope.generateImages === true,
    generatePrintables: valid && actionScope.generatePrintables === true,
    touchSongs: valid && actionScope.touchSongs === true,
    touchBooks: valid && actionScope.touchBooks === true,
    touchLessonBody: valid && actionScope.touchLessonBody === true,
    mismatches: [...new Set(mismatches)],
    blockReasons: blocking,
    blockMessage: resolution.blockMessage || (valid ? "" : correctionFor(blocking, resolution)),
    correction: valid ? "" : correctionFor(blocking, resolution),
    requestHash,
    requestId: `opreq_${requestHash}`,
    candidates: resolution.candidates || [],
    titleMismatches: resolution.titleMismatches || [],
    protectedLessonIds: resolution.protectedLessonIds || [],
    createJob: valid && actionScope.auditOnly !== true,
  };

  return preflight;
}

function shouldCreateJob(preflight, action = "plan") {
  if (!preflight || preflight.valid !== true) return false;
  if (preflight.auditOnly || preflight.createJob === false) return false;
  void action;
  return true;
}

module.exports = {
  hashRequest,
  buildPreflight,
  shouldCreateJob,
};
