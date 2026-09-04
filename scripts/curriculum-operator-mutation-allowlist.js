/**
 * AI Curriculum Operator — execution-layer mutation allowlist.
 * Built from canonical owner request (command), not composer output.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const orchestrator = require("./curriculum-operator-orchestrator.js");
const lessonRead = require("./curriculum-operator-lesson-read.js");

const DANGEROUS_CONFIRM_REASONS = Object.freeze([
  "unexpected_scope_expansion",
  "parsed_intent_contradiction",
  "multiple_lessons_matched",
  "ambiguous_scope",
  "missing_selected_lesson",
  "planned_scope_contradiction",
  "semantic_contradiction",
  "meta_instruction",
  "unresolved_target",
  "access_tier_mismatch",
  "age_band_mismatch",
]);

const WEEKLY_FIELD_ALIASES = Object.freeze({
  vocabCards: ["vocabCards", "vocabularyWords"],
  vocabularyWords: ["vocabularyWords", "vocabCards"],
  learningDomains: ["learningDomains"],
  milestones: ["milestones"],
  weeklyOverview: ["weeklyOverview"],
  objectives: ["objectives"],
  weeklyMaterials: ["weeklyMaterials"],
  teacherPreparation: ["teacherPreparation", "prepChecklist"],
  prepChecklist: ["prepChecklist", "teacherPreparation"],
  observationFocus: ["observationFocus", "observationOpportunities"],
  familyConnection: ["familyConnection"],
  dailyFocus: ["dailyFocus"],
  adaptations: ["adaptations"],
  teacherTips: ["teacherTips"],
  safetyNotes: ["safetyNotes"],
  cleanupTips: ["cleanupTips"],
  indoorOutdoorOptions: ["indoorOutdoorOptions", "indoorAlternatives", "outdoorAlternatives"],
});

const ACTIVITY_CONTENT_FIELDS = Object.freeze([
  "objective", "description", "materials", "teacherPrep", "preparation", "setup", "steps",
  "teacherTips", "questions", "observationFocus", "observationOpportunities", "safetyNotes",
  "cleanupTips", "adaptations", "addedChallenge", "mixedAgeNotes", "vocabulary",
  "teacherLanguage", "indoorAlternatives", "outdoorAlternatives", "extensions", "substitutions",
]);

const DRAFT_META_PATHS = new Set([
  "enrichmentDraft.updatedAt",
  "enrichmentDraft.lastEditedBy",
  "enrichmentDraft.schemaVersion",
  "enrichmentPublishHistory",
  "updatedAt",
]);

const IMAGE_ACTIVITY_FIELDS = new Set([
  "setupImageUrl", "exampleImageUrl", "setupImageThumbUrl", "exampleImageThumbUrl",
  "setupMediaAssetId", "exampleMediaAssetId", "imageRequirement",
]);

function text(value, max = 4000) {
  return schema.text(value, max);
}

function expandWeeklyScope(scope = []) {
  const out = new Set();
  schema.asArray(scope).forEach((field) => {
    const key = text(field, 80);
    if (!key) return;
    const aliases = WEEKLY_FIELD_ALIASES[key] || [key];
    aliases.forEach((alias) => out.add(alias));
  });
  return out;
}

function normalizeWeeklyFieldScope(actions = {}) {
  return [...expandWeeklyScope(actions.weeklyFieldScope)];
}

function buildMutationAllowlist(command = {}, options = {}) {
  const actions = command?.actions || {};
  const scope = command?.scope || {};
  const kitScope = orchestrator.normalizeKitScopeFlags(actions, { textOnly: actions.textOnly === true });
  const weeklyScope = normalizeWeeklyFieldScope(actions);
  const narrowWeekly = weeklyScope.length > 0;
  const lessonIds = [...new Set(schema.asArray(scope.lessonIds).map((id) => text(id, 160)).filter(Boolean))];
  const targetActivityIds = schema.asArray(options.targetActivityIds).map((id) => text(id, 160)).filter(Boolean);

  let allowedWeeklyFields = null;
  if (narrowWeekly) {
    allowedWeeklyFields = new Set(weeklyScope);
  } else if (actions.textOnly === true) {
    allowedWeeklyFields = new Set(Object.keys(WEEKLY_FIELD_ALIASES));
  }

  const allowActivities = !narrowWeekly
    ? kitScope.activities
    : (actions.upgradeActivities === true || weeklyScope.includes("teacherTips"));

  let allowedActivityFields = new Set();
  if (allowActivities) {
    if (narrowWeekly && weeklyScope.length === 1 && weeklyScope[0] === "teacherTips") {
      allowedActivityFields = new Set(["teacherTips"]);
    } else if (!narrowWeekly) {
      allowedActivityFields = new Set(ACTIVITY_CONTENT_FIELDS);
    } else if (weeklyScope.includes("teacherTips")) {
      allowedActivityFields = new Set(["teacherTips"]);
    }
  }

  const assets = {
    images: kitScope.images === true,
    printables: kitScope.printables === true,
    cover: kitScope.cover === true,
    songs: kitScope.songs === true,
    books: kitScope.books === true,
  };

  if (narrowWeekly) {
    const explicit = require("./curriculum-operator-command-safety.js").parseExplicitBooleanAssignments(command.rawCommand || "");
    assets.images = explicit.generateImages === true;
    assets.printables = explicit.generatePrintables === true;
    assets.cover = explicit.touchCover === true || actions.touchCover === true;
    assets.songs = explicit.touchSongs === true && actions.generateSongsBooks === true;
    assets.books = explicit.touchBooks === true && actions.generateSongsBooks === true;
  }

  return {
    version: 1,
    source: "canonical_command",
    lessonIds,
    weeklyFieldScope: weeklyScope,
    allowedWeeklyFields,
    allowedActivityFields,
    allowedActivityIds: targetActivityIds.length ? targetActivityIds : null,
    assets,
    publishAllowed: actions.publish === true,
    accessChangeAllowed: /\b(?:change|switch|upgrade|downgrade)\s+(?:to\s+)?(?:pro|free)\b/i.test(text(command.rawCommand))
      && actions.createLesson !== true,
    createLesson: actions.createLesson === true,
    clearRequiresExplicit: true,
    kitScope,
  };
}

function recordViolation(violations, entry) {
  const list = violations || [];
  list.push({
    code: entry.code || "OUT_OF_SCOPE_MUTATION_ATTEMPT",
    path: entry.path || null,
    field: entry.field || null,
    activityId: entry.activityId || null,
    lessonId: entry.lessonId || null,
    stage: entry.stage || null,
    message: entry.message || "Mutation outside allowed scope.",
    requestedScope: entry.requestedScope || null,
  });
  return list;
}

function isWeeklyFieldAllowed(field, allowlist) {
  const key = text(field, 80);
  if (!key) return false;
  if (!allowlist?.allowedWeeklyFields) return true;
  if (allowlist.allowedWeeklyFields.has(key)) return true;
  for (const allowed of allowlist.allowedWeeklyFields) {
    const aliases = WEEKLY_FIELD_ALIASES[allowed] || [allowed];
    if (aliases.includes(key)) return true;
  }
  return false;
}

function isActivityMutationAllowed(activityId, field, allowlist) {
  const id = text(activityId, 160);
  const f = text(field, 80);
  if (!id || !f) return false;
  if (allowlist?.allowedActivityIds?.length && !allowlist.allowedActivityIds.includes(id)) return false;
  if (IMAGE_ACTIVITY_FIELDS.has(f)) return allowlist?.assets?.images === true;
  if (!allowlist?.allowedActivityFields?.size) return false;
  return allowlist.allowedActivityFields.has(f);
}

function isPathAllowed(pathKey, allowlist, context = {}) {
  const path = text(pathKey, 400);
  if (!path || DRAFT_META_PATHS.has(path)) return true;

  if (/^id$|\.id$/.test(path) || path.endsWith(".lessonPlanId")) {
    if (context.proposedValue != null && context.beforeValue != null
      && text(context.proposedValue, 160) !== text(context.beforeValue, 160)) {
      return false;
    }
    return true;
  }

  if (/^status$|\.status$|^publishedAt$|\.publishedAt$/.test(path)) {
    return allowlist?.publishAllowed === true;
  }

  if (/^plan$|\.plan$|accessPlan/.test(path)) {
    return allowlist?.accessChangeAllowed === true;
  }

  if (/cover(ImageUrl|Url)?$|operatorCover/.test(path)) {
    return allowlist?.assets?.cover === true;
  }

  if (/resourceIds|printableIds|relatedPrintableId/.test(path)) {
    return allowlist?.assets?.printables === true;
  }

  if (/\.songs\b|^songs$|week\.songs/.test(path)) {
    return allowlist?.assets?.songs === true;
  }

  if (/\.books\b|^books$|week\.books/.test(path)) {
    return allowlist?.assets?.books === true;
  }

  if (IMAGE_ACTIVITY_FIELDS.has(path.split(".").pop()) || /ImageUrl|MediaAssetId|imageRequirement/.test(path)) {
    return allowlist?.assets?.images === true;
  }

  if (/^learningDomains$|\.learningDomains$/.test(path)) {
    return isWeeklyFieldAllowed("learningDomains", allowlist);
  }
  if (/^vocabularyWords$|\.vocabularyWords$/.test(path)) {
    return isWeeklyFieldAllowed("vocabularyWords", allowlist);
  }
  if (/teachingKit\.vocabCards|week\.vocabCards|\.vocabCards$/.test(path)) {
    return isWeeklyFieldAllowed("vocabCards", allowlist);
  }
  if (/teachingKit\.milestones|week\.milestones|\.milestones$/.test(path)) {
    return isWeeklyFieldAllowed("milestones", allowlist);
  }

  const activityMatch = path.match(/(?:activities\.|enrichmentDraft\.activities\.)([^.]+)\.([^.]+)$/);
  if (activityMatch) {
    return isActivityMutationAllowed(activityMatch[1], activityMatch[2], allowlist);
  }

  const weekFieldMatch = path.match(/(?:week\.|enrichmentDraft\.week\.)([A-Za-z0-9_]+)/);
  if (weekFieldMatch) {
    return isWeeklyFieldAllowed(weekFieldMatch[1], allowlist);
  }

  const topField = path.split(".")[0];
  if (WEEKLY_FIELD_ALIASES[topField] || Object.prototype.hasOwnProperty.call(WEEKLY_FIELD_ALIASES, topField)) {
    return isWeeklyFieldAllowed(topField, allowlist);
  }

  if (allowlist?.allowedWeeklyFields) return false;
  return true;
}

function isExplicitClearAuthorized(command = {}, field = "") {
  const raw = text(command?.rawCommand || "", 4000);
  const f = text(field, 80);
  if (!raw || !f) return false;
  return new RegExp(`\\b(?:clear|delete|remove)\\b[^.\\n]{0,40}\\b${f}\\b`, "i").test(raw);
}

function isEmptyClearValue(value) {
  if (value == null) return true;
  if (typeof value === "string") return text(value).trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function filterComposerPlan(validatedPlan = {}, allowlist = {}, work = {}, context = {}) {
  const violations = [];
  const filtered = {
    lessonId: validatedPlan.lessonId,
    weeklyChanges: {},
    activities: [],
    songs: [],
    books: [],
  };

  Object.entries(validatedPlan.weeklyChanges || {}).forEach(([field, entry]) => {
    if (!isWeeklyFieldAllowed(field, allowlist)) {
      recordViolation(violations, {
        code: "OUT_OF_SCOPE_MUTATION_ATTEMPT",
        field,
        stage: context.stage || "composer.weeklyChanges",
        requestedScope: allowlist.weeklyFieldScope,
        message: `Composer weekly field "${field}" is outside allowed scope.`,
      });
      return;
    }
    if (isEmptyClearValue(entry?.value) && allowlist.clearRequiresExplicit
      && !isExplicitClearAuthorized(context.command, field)) {
      recordViolation(violations, {
        code: "OUT_OF_SCOPE_MUTATION_ATTEMPT",
        field,
        stage: context.stage || "composer.weeklyChanges",
        message: `Empty/clear weekly field "${field}" rejected without explicit CLEAR authorization.`,
      });
      return;
    }
    filtered.weeklyChanges[field] = entry;
  });

  schema.asArray(validatedPlan.activities).forEach((row) => {
    const activityId = text(row.activityId, 160);
    const changes = {};
    Object.entries(row.changes || {}).forEach(([field, entry]) => {
      if (!isActivityMutationAllowed(activityId, field, allowlist)) {
        recordViolation(violations, {
          code: "OUT_OF_SCOPE_MUTATION_ATTEMPT",
          activityId,
          field,
          stage: context.stage || "composer.activityChanges",
          message: `Composer activity field "${field}" for ${activityId} is outside allowed scope.`,
        });
        return;
      }
      if (isEmptyClearValue(entry?.value) && allowlist.clearRequiresExplicit
        && !isExplicitClearAuthorized(context.command, field)) {
        recordViolation(violations, {
          code: "OUT_OF_SCOPE_MUTATION_ATTEMPT",
          activityId,
          field,
          stage: context.stage || "composer.activityChanges",
          message: `Empty/clear activity field "${field}" rejected without explicit CLEAR authorization.`,
        });
        return;
      }
      changes[field] = entry;
    });
    if (Object.keys(changes).length) filtered.activities.push({ activityId, changes });
  });

  if (allowlist.assets?.songs) filtered.songs = schema.asArray(validatedPlan.songs).slice();
  else if (schema.asArray(validatedPlan.songs).length) {
    recordViolation(violations, {
      code: "OUT_OF_SCOPE_MUTATION_ATTEMPT",
      field: "songs",
      stage: context.stage || "composer.songs",
      message: "Song mutations are excluded by scope.",
    });
  }

  if (allowlist.assets?.books) filtered.books = schema.asArray(validatedPlan.books).slice();
  else if (schema.asArray(validatedPlan.books).length) {
    recordViolation(violations, {
      code: "OUT_OF_SCOPE_MUTATION_ATTEMPT",
      field: "books",
      stage: context.stage || "composer.books",
      message: "Book mutations are excluded by scope.",
    });
  }

  return { plan: filtered, violations };
}

function validateEnrichmentDraftSave({
  beforeDraft = {},
  afterDraft = {},
  beforePlan = {},
  allowlist = {},
  lessonId = "",
  stage = "enrichmentDraft.save",
  command = {},
} = {}) {
  const violations = [];
  const before = beforeDraft && typeof beforeDraft === "object" ? beforeDraft : {};
  const after = afterDraft && typeof afterDraft === "object" ? JSON.parse(JSON.stringify(afterDraft)) : {};
  const filtered = JSON.parse(JSON.stringify(after));

  if (text(beforePlan?.id, 160) && text(beforePlan.id, 160) !== text(lessonId, 160)) {
    recordViolation(violations, {
      code: "IMMUTABLE_ID_MUTATION_ATTEMPT",
      path: "lessonId",
      lessonId,
      stage,
      message: "Cross-lesson draft write blocked.",
    });
    return { ok: false, blocked: true, violations, filteredDraft: beforeDraft };
  }

  const beforeActs = before.activities && typeof before.activities === "object" ? before.activities : {};
  const afterActs = filtered.activities && typeof filtered.activities === "object" ? filtered.activities : {};
  const allActIds = new Set([...Object.keys(beforeActs), ...Object.keys(afterActs)]);

  allActIds.forEach((activityId) => {
    const beforePatch = beforeActs[activityId] || {};
    const afterPatch = afterActs[activityId] || {};
    const keys = new Set([...Object.keys(beforePatch), ...Object.keys(afterPatch)]);
    keys.forEach((field) => {
      const beforeVal = beforePatch[field];
      const afterVal = afterPatch[field];
      if (JSON.stringify(beforeVal ?? null) === JSON.stringify(afterVal ?? null)) return;
      if (!isActivityMutationAllowed(activityId, field, allowlist)) {
        recordViolation(violations, {
          code: "OUT_OF_SCOPE_MUTATION_ATTEMPT",
          activityId,
          field,
          path: `enrichmentDraft.activities.${activityId}.${field}`,
          stage,
          requestedScope: allowlist.weeklyFieldScope,
        });
        if (Object.prototype.hasOwnProperty.call(beforePatch, field)) {
          afterActs[activityId][field] = beforePatch[field];
        } else {
          delete afterActs[activityId][field];
        }
      } else if (isEmptyClearValue(afterVal) && !isEmptyClearValue(beforeVal)
        && allowlist.clearRequiresExplicit && !isExplicitClearAuthorized(command, field)) {
        recordViolation(violations, {
          code: "OUT_OF_SCOPE_MUTATION_ATTEMPT",
          activityId,
          field,
          stage,
          message: `Implicit clear of activity.${field} blocked.`,
        });
        afterActs[activityId][field] = beforeVal;
      }
    });
    if (afterActs[activityId] && !Object.keys(afterActs[activityId]).length) delete afterActs[activityId];
  });

  const beforeWeek = before.week && typeof before.week === "object" ? before.week : {};
  const afterWeek = filtered.week && typeof filtered.week === "object" ? filtered.week : {};
  Object.keys(afterWeek).forEach((field) => {
    const beforeVal = beforeWeek[field];
    const afterVal = afterWeek[field];
    if (JSON.stringify(beforeVal ?? null) === JSON.stringify(afterVal ?? null)) return;
    if (field === "songs" && allowlist.assets?.songs !== true) {
      recordViolation(violations, { code: "OUT_OF_SCOPE_MUTATION_ATTEMPT", field: "songs", stage });
      afterWeek[field] = beforeVal;
      return;
    }
    if (field === "books" && allowlist.assets?.books !== true) {
      recordViolation(violations, { code: "OUT_OF_SCOPE_MUTATION_ATTEMPT", field: "books", stage });
      afterWeek[field] = beforeVal;
      return;
    }
    if (field === "printableIds" && allowlist.assets?.printables !== true) {
      recordViolation(violations, { code: "OUT_OF_SCOPE_MUTATION_ATTEMPT", field: "printableIds", stage });
      afterWeek[field] = beforeVal;
      return;
    }
    if (!isWeeklyFieldAllowed(field, allowlist)) {
      recordViolation(violations, {
        code: "OUT_OF_SCOPE_MUTATION_ATTEMPT",
        field,
        path: `enrichmentDraft.week.${field}`,
        stage,
        requestedScope: allowlist.weeklyFieldScope,
      });
      afterWeek[field] = beforeVal;
    } else if (isEmptyClearValue(afterVal) && !isEmptyClearValue(beforeVal)
      && allowlist.clearRequiresExplicit && !isExplicitClearAuthorized(command, field)) {
      recordViolation(violations, {
        code: "OUT_OF_SCOPE_MUTATION_ATTEMPT",
        field,
        stage,
        message: `Implicit clear of week.${field} blocked.`,
      });
      afterWeek[field] = beforeVal;
    }
  });

  if (filtered.operatorCover && allowlist.assets?.cover !== true) {
    recordViolation(violations, { code: "OUT_OF_SCOPE_MUTATION_ATTEMPT", field: "operatorCover", stage });
    delete filtered.operatorCover;
  }

  filtered.activities = afterActs;
  filtered.week = afterWeek;

  return {
    ok: violations.length === 0,
    blocked: false,
    violations,
    filteredDraft: filtered,
    stripped: violations.length > 0,
  };
}

function verifyPersistedMutationDiff(beforePlan = {}, afterPlan = {}, allowlist = {}) {
  const vocabSurgical = require("./curriculum-operator-vocab-surgical-apply.js");
  if (vocabSurgical.isVocabOnlyAllowlist(allowlist)) {
    const scoped = vocabSurgical.verifyVocabOnlyAuthoritativeDiff(beforePlan, afterPlan, allowlist);
    return {
      ok: scoped.ok,
      unexpected: scoped.unexpected,
      violations: scoped.violations,
      diff: scoped.authoritativeDiff,
      intermediateDraftDiff: scoped.intermediateDraftDiff,
      intermediateDraftReport: scoped.intermediateDraftReport,
      pathCategory: "AUTHORITATIVE_CURRICULUM_MUTATION",
    };
  }

  const diff = lessonRead.computePersistedPlanDiff(beforePlan, afterPlan);
  const unexpected = [];
  const violations = [];
  const intermediateDraftDiff = [];

  diff.forEach((pathKey) => {
    const category = vocabSurgical.classifyPersistedPath(pathKey);
    if (category === vocabSurgical.MUTATION_CATEGORY.INTERMEDIATE_ENRICHMENT_BOOKKEEPING
      || category === vocabSurgical.MUTATION_CATEGORY.JOB_METADATA
      || category === vocabSurgical.MUTATION_CATEGORY.SYSTEM_METADATA
      || category === vocabSurgical.MUTATION_CATEGORY.REPORT_METADATA) {
      if (category === vocabSurgical.MUTATION_CATEGORY.INTERMEDIATE_ENRICHMENT_BOOKKEEPING) {
        intermediateDraftDiff.push(pathKey);
      }
      return;
    }
    const beforeVal = pathKey.split(".").reduce((cur, part) => (cur == null ? undefined : cur[part]), beforePlan);
    const afterVal = pathKey.split(".").reduce((cur, part) => (cur == null ? undefined : cur[part]), afterPlan);
    const allowed = isPathAllowed(pathKey, allowlist, { beforeValue: beforeVal, proposedValue: afterVal });
    if (!allowed) {
      unexpected.push(pathKey);
      recordViolation(violations, {
        code: "UNEXPECTED_PERSISTED_MUTATION",
        path: pathKey,
        stage: "post_persist.diff",
        requestedScope: allowlist.weeklyFieldScope,
      });
    }
  });

  if (text(beforePlan?.id, 160) && text(afterPlan?.id, 160) && beforePlan.id !== afterPlan.id) {
    recordViolation(violations, {
      code: "IMMUTABLE_ID_MUTATION_ATTEMPT",
      path: "id",
      stage: "post_persist.diff",
    });
  }

  if (!allowlist.publishAllowed) {
    if (beforePlan?.status !== afterPlan?.status && String(afterPlan?.status).toLowerCase() === "published") {
      recordViolation(violations, { code: "OUT_OF_SCOPE_MUTATION_ATTEMPT", path: "status", stage: "post_persist.publish" });
    }
    if (beforePlan?.publishedAt !== afterPlan?.publishedAt && afterPlan?.publishedAt) {
      recordViolation(violations, { code: "OUT_OF_SCOPE_MUTATION_ATTEMPT", path: "publishedAt", stage: "post_persist.publish" });
    }
  }

  if (!allowlist.accessChangeAllowed) {
    const beforeAccess = beforePlan?.plan === "Pro" ? "Pro" : "Free";
    const afterAccess = afterPlan?.plan === "Pro" ? "Pro" : "Free";
    if (beforeAccess !== afterAccess) {
      recordViolation(violations, { code: "OUT_OF_SCOPE_MUTATION_ATTEMPT", path: "plan", stage: "post_persist.access" });
    }
  }

  return {
    ok: unexpected.length === 0 && violations.length === 0,
    unexpected,
    violations,
    diff,
    intermediateDraftDiff,
    intermediateDraftReport: intermediateDraftDiff.length
      ? { code: "INTERMEDIATE_DRAFT_DIFF", paths: intermediateDraftDiff, blocksAuthoritativeApply: false }
      : null,
  };
}

function evaluateZeroPersistRequestedWork(lessonResult = {}, command = {}, allowlist = {}) {
  const requested = lessonRead.buildRequestedOutcomes(command);
  const keys = Object.keys(requested || {});
  if (!keys.length) return { unsatisfied: false, gaps: [] };

  const persisted = schema.asArray(lessonResult.persistedChanges || lessonResult.persistedDiff);
  const proposed = schema.asArray(lessonResult.updated || lessonResult.proposedChanges);
  const relevantPersisted = persisted.filter((pathKey) => isPathAllowed(pathKey, allowlist));
  const hadComposerWork = proposed.length > 0 || schema.asArray(lessonResult.composerDiagnostics?.accepted).length > 0;

  const gaps = [];
  keys.forEach((key) => {
    const alreadyValid = lessonRead.evaluateRequestedOutcome(key, lessonResult.afterPlan || {}, lessonResult.draftWeek || {});
    if (alreadyValid) return;
    if (relevantPersisted.length === 0 && (hadComposerWork || keys.length > 0)) {
      gaps.push({
        field: key,
        code: "REQUESTED_REPAIR_UNSATISFIED",
        message: `Requested ${key} repair completed with zero relevant persisted changes.`,
      });
    }
  });

  return { unsatisfied: gaps.length > 0, gaps };
}

function evaluateJobCompletionStatus(lessonResults = [], command = {}, allowlist = {}) {
  let contentGaps = lessonResults.some((lr) => lr.contentPersistenceIncomplete === true);
  const allGaps = [];

  lessonResults.forEach((lr) => {
    const zero = evaluateZeroPersistRequestedWork(lr, command, allowlist);
    if (zero.unsatisfied) {
      contentGaps = true;
      lr.requestedOutcomeGaps = [...schema.asArray(lr.requestedOutcomeGaps), ...zero.gaps];
      allGaps.push(...zero.gaps);
    }
    if (schema.asArray(lr.mutationViolations).length) contentGaps = true;
    if (schema.asArray(lr.unexpectedPersistedMutations).length) contentGaps = true;
  });

  return { contentGaps, gaps: allGaps };
}

function phaseAllowed(phaseKey, allowlist = {}) {
  if (phaseKey === "text") {
    return allowlist.allowedWeeklyFields == null || allowlist.allowedWeeklyFields.size > 0
      || allowlist.allowedActivityFields?.size > 0;
  }
  if (phaseKey === "images") return allowlist.assets?.images === true;
  if (phaseKey === "printables") return allowlist.assets?.printables === true;
  if (phaseKey === "cover") return allowlist.assets?.cover === true;
  if (phaseKey === "songs") return allowlist.assets?.songs === true;
  if (phaseKey === "books") return allowlist.assets?.books === true;
  return true;
}

function detectStaleLessonVersion(snapshotUpdatedAt, currentUpdatedAt) {
  const before = text(snapshotUpdatedAt, 40);
  const after = text(currentUpdatedAt, 40);
  if (!before || !after) return false;
  return before !== after;
}

function isRunBlockedByConfirmations(confirmReasons = [], parseSafety = null) {
  if (parseSafety?.blocked) return true;
  return schema.asArray(confirmReasons).some((reason) => DANGEROUS_CONFIRM_REASONS.includes(reason));
}

function revalidateRunScope(command = {}, options = {}) {
  const commandApi = require("./curriculum-operator-command.js");
  const raw = text(command.rawCommand || "", 4000);
  if (!raw) return { ok: false, code: "command_required", message: "Missing raw command." };
  const reparsed = commandApi.parseOperatorCommand(raw, options);
  if (reparsed.parseSafety?.blocked) {
    return { ok: false, code: "PARSED_INTENT_CONTRADICTION", reparsed };
  }
  if (isRunBlockedByConfirmations(reparsed.confirmReasons, reparsed.parseSafety)) {
    return { ok: false, code: "RUN_BLOCKED", reparsed };
  }
  const allowlist = buildMutationAllowlist(reparsed.command, {
    lessonIds: reparsed.command?.scope?.lessonIds,
    targetActivityIds: options.targetActivityIds,
  });
  return { ok: true, command: reparsed.command, allowlist, reparsed };
}

function resumeUsesOriginalAllowlist(job = {}) {
  if (job.mutationAllowlist && job.mutationAllowlist.version) return job.mutationAllowlist;
  return buildMutationAllowlist(job.command || {}, { lessonIds: job.command?.scope?.lessonIds });
}

function attachViolationsToLessonResult(lessonResult = {}, violations = []) {
  if (!violations.length) return lessonResult;
  const next = { ...lessonResult };
  next.mutationViolations = [...schema.asArray(next.mutationViolations), ...violations];
  return next;
}

const WEEKLY_FIELD_STORAGE_MATRIX = Object.freeze([
  { field: "weeklyOverview", composer: true, normalize: true, merge: true, surgicalSave: true, reload: true, audit: true, editor: true },
  { field: "objectives", composer: true, normalize: true, merge: true, surgicalSave: true, reload: true, audit: true, editor: true },
  { field: "weeklyMaterials", composer: true, normalize: true, merge: true, surgicalSave: true, reload: true, audit: true, editor: true },
  { field: "teacherPreparation", composer: true, normalize: true, merge: true, surgicalSave: true, reload: true, audit: true, editor: true },
  { field: "prepChecklist", composer: true, normalize: true, merge: true, surgicalSave: true, reload: true, audit: true, editor: true },
  { field: "observationFocus", composer: true, normalize: true, merge: true, surgicalSave: true, reload: true, audit: true, editor: true },
  { field: "familyConnection", composer: true, normalize: true, merge: true, surgicalSave: true, reload: true, audit: true, editor: true },
  { field: "milestones", composer: true, normalize: true, merge: true, surgicalSave: true, reload: true, audit: true, editor: true },
  { field: "learningDomains", composer: true, normalize: true, merge: true, surgicalSave: true, reload: true, audit: true, editor: true },
  { field: "vocabCards", composer: true, normalize: true, merge: true, surgicalSave: true, reload: true, audit: true, editor: true },
  { field: "vocabularyWords", composer: true, normalize: true, merge: true, surgicalSave: true, reload: true, audit: true, editor: true },
]);

module.exports = {
  DANGEROUS_CONFIRM_REASONS,
  WEEKLY_FIELD_STORAGE_MATRIX,
  buildMutationAllowlist,
  recordViolation,
  isWeeklyFieldAllowed,
  isActivityMutationAllowed,
  isPathAllowed,
  filterComposerPlan,
  validateEnrichmentDraftSave,
  verifyPersistedMutationDiff,
  evaluateZeroPersistRequestedWork,
  evaluateJobCompletionStatus,
  phaseAllowed,
  detectStaleLessonVersion,
  isRunBlockedByConfirmations,
  revalidateRunScope,
  resumeUsesOriginalAllowlist,
  attachViolationsToLessonResult,
};
