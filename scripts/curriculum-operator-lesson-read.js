/**
 * Canonical read helpers for Curriculum Operator audits and reporting.
 * Merges enrichmentDraft week fields with persisted plan fields for one truth source.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

let learningDomainsApi = null;
try {
  learningDomainsApi = require("./curriculum-learning-domains.js");
} catch (_e) {
  learningDomainsApi = null;
}

function text(value, max = 4000) {
  return schema.text(value, max);
}

function asArray(value) {
  return schema.asArray(value);
}

function wordCount(value) {
  return text(value, 4000).split(/\s+/).filter(Boolean).length;
}

/**
 * Canonical vocabulary contract:
 * - Authoritative structured storage: teachingKit.vocabCards (array of card objects).
 * - Plan-level plan.vocabularyWords (comma-separated string) is the editor/audit string view.
 * - mergeDraftIntoPlan writes both from week.vocabCards; readers merge draft + persisted sources.
 */
function getActivityTeacherTips(activity, dailyPlanItem, patch = {}) {
  const draftTips = asArray(patch?.teacherTips).map((tip) => text(tip, 400)).filter(Boolean);
  if (draftTips.length) return draftTips;
  const activityTips = asArray(activity?.teacherTips).map((tip) => text(tip, 400)).filter(Boolean);
  if (activityTips.length) return activityTips;
  const itemTips = asArray(dailyPlanItem?.teacherTips).map((tip) => text(tip, 400)).filter(Boolean);
  if (itemTips.length) return itemTips;
  return [];
}

function teacherPreparationSources(plan = {}, week = {}) {
  const weekToolkit = week.teacherToolkit && typeof week.teacherToolkit === "object"
    ? week.teacherToolkit
    : {};
  const planToolkit = plan?.teachingKit?.teacherToolkit && typeof plan.teachingKit.teacherToolkit === "object"
    ? plan.teachingKit.teacherToolkit
    : {};
  return {
    week,
    weekToolkit,
    planToolkit,
    prepText: text(week.teacherPreparation)
      || text(weekToolkit.teacherPreparation)
      || text(planToolkit.teacherPreparation)
      || text(planToolkit.notes),
    prepChecklist: asArray(weekToolkit.prepChecklist).length
      ? asArray(weekToolkit.prepChecklist)
      : asArray(planToolkit.prepChecklist),
  };
}

function isTeacherPreparationSubstantial(plan = {}, week = {}) {
  const sources = teacherPreparationSources(plan, week);
  const prepWords = wordCount(sources.prepText);
  if (prepWords >= 15) return true;
  if (prepWords >= 8 && sources.prepChecklist.length >= 2) return true;
  return false;
}

function flattenObjectPaths(value, prefix = "", out = []) {
  if (value == null) {
    if (prefix) out.push(prefix);
    return out;
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      if (prefix) out.push(prefix);
      return out;
    }
    value.forEach((item, index) => flattenObjectPaths(item, `${prefix}[${index}]`, out));
    return out;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (!keys.length) {
      if (prefix) out.push(prefix);
      return out;
    }
    keys.forEach((key) => {
      const next = prefix ? `${prefix}.${key}` : key;
      flattenObjectPaths(value[key], next, out);
    });
    return out;
  }
  if (prefix) out.push(prefix);
  return out;
}

function computePersistedPlanDiff(beforePlan = {}, afterPlan = {}) {
  const ignore = new Set([
    "updatedAt", "enrichmentDraft", "enrichmentDraftUndo", "enrichmentPublishHistory",
    "__llhSurgicalDailyPlans", "__llhAccessPlanPatch",
  ]);
  const paths = new Set([
    ...flattenObjectPaths(beforePlan),
    ...flattenObjectPaths(afterPlan),
  ]);
  const changed = [];
  paths.forEach((pathKey) => {
    if (!pathKey || ignore.has(pathKey)) return;
    const beforeVal = pathKey.split(".").reduce((cur, part) => {
      if (cur == null) return undefined;
      const match = part.match(/^(.+)\[(\d+)\]$/);
      if (match) return cur[match[1]]?.[Number(match[2])];
      return cur[part];
    }, beforePlan);
    const afterVal = pathKey.split(".").reduce((cur, part) => {
      if (cur == null) return undefined;
      const match = part.match(/^(.+)\[(\d+)\]$/);
      if (match) return cur[match[1]]?.[Number(match[2])];
      return cur[part];
    }, afterPlan);
    if (JSON.stringify(beforeVal ?? null) !== JSON.stringify(afterVal ?? null)) {
      changed.push(pathKey);
    }
  });
  return changed.sort();
}

function verifyConnectedAutoApplyPersistence({
  beforePlan = {},
  afterPlan = {},
  requestedFieldSuccess = [],
} = {}) {
  const mismatches = [];
  asArray(requestedFieldSuccess).forEach((entry) => {
    const key = text(entry?.field, 80);
    const action = text(entry?.action || entry?.decision, 20).toUpperCase();
    if (!key || !["FILL", "IMPROVE", "REPLACE", "SUCCESS"].includes(action)) return;
    if (key === "learningDomains") {
      if (!asArray(afterPlan?.learningDomains).length) {
        mismatches.push({
          field: key,
          code: "PERSISTENCE_MISMATCH",
          message: "learningDomains repair did not persist after reload.",
        });
      }
      return;
    }
    if (key === "vocabularyWords" || key === "vocabCards") {
      const vocab = vocabularyTextFromSources(afterPlan, {});
      const cards = asArray(afterPlan?.teachingKit?.vocabCards);
      if (!vocab && !cards.length) {
        mismatches.push({
          field: "vocabularyWords",
          code: "PERSISTENCE_MISMATCH",
          message: "Vocabulary repair did not persist after reload.",
        });
      }
      return;
    }
    if (key === "milestones" && !asArray(afterPlan?.teachingKit?.milestones).length) {
      mismatches.push({
        field: key,
        code: "PERSISTENCE_MISMATCH",
        message: "milestones repair did not persist after reload.",
      });
    }
  });
  return {
    ok: mismatches.length === 0,
    mismatches,
    persistedDiff: computePersistedPlanDiff(beforePlan, afterPlan),
  };
}

function vocabCardLabel(card) {
  if (card == null) return "";
  if (typeof card === "string") return text(card, 200);
  if (typeof card !== "object") return "";
  return text(card.title || card.word || card.term || card.label, 200);
}

function vocabularyTextFromSources(plan = {}, draftWeek = {}) {
  const published = text(plan?.vocabularyWords, 2000);
  if (published) return published;
  const teachingKitCards = asArray(plan?.teachingKit?.vocabCards);
  if (teachingKitCards.length) {
    return teachingKitCards.map(vocabCardLabel).filter(Boolean).join(", ");
  }
  const draftCards = asArray(draftWeek?.vocabCards);
  if (draftCards.length) {
    return draftCards.map(vocabCardLabel).filter(Boolean).join(", ");
  }
  return "";
}

function learningDomainsFromSources(plan = {}, draftWeek = {}) {
  const draftList = asArray(draftWeek?.learningDomains);
  if (draftList.length) {
    if (learningDomainsApi?.normalizeLearningDomainsValue) {
      return learningDomainsApi.normalizeLearningDomainsValue(draftList, { allowEmpty: true }).value;
    }
    return draftList.map((d) => text(d, 80)).filter(Boolean);
  }
  const planList = asArray(plan?.learningDomains);
  if (planList.length) {
    if (learningDomainsApi?.normalizeLearningDomainsValue) {
      return learningDomainsApi.normalizeLearningDomainsValue(planList, { allowEmpty: true }).value;
    }
    return planList.map((d) => text(d, 80)).filter(Boolean);
  }
  return [];
}

function learningDomainsText(plan = {}, draftWeek = {}) {
  const list = learningDomainsFromSources(plan, draftWeek);
  return list.length ? list.join(", ") : "";
}

const CLASSROOM_LIBRARY_PROMPT_RE = /\b(search (the )?classroom library|search (your )?library|find books about|look for books about)\b/i;

function classifyBookRecord(book) {
  const title = text(book?.title, 240);
  if (!title) return "PLACEHOLDER";
  if (CLASSROOM_LIBRARY_PROMPT_RE.test(title)) return "CLASSROOM_LIBRARY_PROMPT";
  if (!text(book?.author) && !text(book?.whyThisBook) && !asArray(book?.beforeReadingQuestions).length
    && !asArray(book?.afterReadingQuestions).length) {
    return "PLACEHOLDER";
  }
  return "VERIFIED_BOOK";
}

function bookNeedsDiscussionGuide(book) {
  const type = classifyBookRecord(book);
  if (type === "CLASSROOM_LIBRARY_PROMPT") return false;
  const enrich = (() => {
    try { return require("./teaching-kit-enrichment.js"); } catch (_e) { return null; }
  })();
  if (enrich?.bookRecordComplete) return !enrich.bookRecordComplete(book);
  return !(asArray(book?.beforeReadingQuestions).length || asArray(book?.afterReadingQuestions).length
    || asArray(book?.questions).length || text(book?.whyThisBook));
}

/**
 * Build a plan-shaped view for standards/quality audits that includes draft week fields.
 */
function buildAuditPlanView(plan = {}, enrichmentDraft = null) {
  const draft = enrichmentDraft && typeof enrichmentDraft === "object" ? enrichmentDraft : {};
  const week = draft.week && typeof draft.week === "object" ? draft.week : {};
  const domains = learningDomainsFromSources(plan, week);
  const vocabularyWords = vocabularyTextFromSources(plan, week);
  const next = { ...plan };
  if (domains.length) next.learningDomains = domains.slice();
  if (vocabularyWords) next.vocabularyWords = vocabularyWords;
  if (asArray(week.books).length && !asArray(next.books).length) next.books = asArray(week.books);
  if (asArray(week.songs).length && !asArray(next.songs).length) next.songs = asArray(week.songs);
  if (text(week.familyConnection) && !text(next.familyConnection)) next.familyConnection = text(week.familyConnection);
  if (text(week.weeklyOverview) && !text(next.weeklyOverview)) next.weeklyOverview = text(week.weeklyOverview);
  if (text(week.objectives) && !text(next.objectives)) next.objectives = text(week.objectives);
  if (text(week.weeklyMaterials) && !text(next.weeklyMaterials)) next.weeklyMaterials = text(week.weeklyMaterials);
  return next;
}

function resolveCoverIntent(command = {}, options = {}) {
  if (options.forceReplace === true) return "EXPLICIT_REPLACE";
  const actions = command?.actions || {};
  if (actions.touchCover !== true) return "NO_TOUCH";
  const raw = text(command?.rawCommand || options.rawCommand || "", 4000);
  if (/\bREALISTIC_LESSON_COVER\b/i.test(raw)
    || /\b(new|replace|make|create|generate).{0,48}(realistic\s+)?(lesson\s+)?cover\b/i.test(raw)
    || /\b(replace|new).{0,24}cover\b/i.test(raw)) {
    return "EXPLICIT_REPLACE";
  }
  if (/\baudit.{0,24}cover\b/i.test(raw)) return "AUDIT_ONLY";
  return "REPLACE_IF_BAD";
}

function summarizeExecutionScope(kitScope = {}, command = {}) {
  const scope = kitScope || {};
  const locks = scope.locks || {};
  const coverIntent = resolveCoverIntent(command);
  return {
    lessonContent: scope.lessonContent ? "ENABLED" : "EXCLUDED",
    activities: scope.activities ? "ENABLED" : "EXCLUDED",
    images: scope.images ? "ENABLED" : (locks.images ? "EXCLUDED" : "AUDIT/KEEP"),
    printables: scope.printables ? "ENABLED" : (locks.printables ? "EXCLUDED" : "AUDIT/KEEP"),
    songs: scope.songs ? "ENABLED" : (locks.songs ? "EXCLUDED" : "AUDIT/KEEP"),
    books: scope.books ? "ENABLED" : (locks.books ? "EXCLUDED" : "AUDIT/KEEP"),
    cover: coverIntent === "EXPLICIT_REPLACE"
      ? "REPLACEMENT REQUESTED"
      : (coverIntent === "NO_TOUCH" || locks.cover ? "EXCLUDED" : "AUDIT/KEEP"),
    coverIntent,
  };
}

function classifyLessonReadiness(audit = {}) {
  const blockers = asArray(audit?.teachingKitBlockers);
  const critical = blockers.filter((b) => /critical|broken|missing required|blocks publish/i.test(String(b?.message || b || "")));
  if (critical.length) return "BLOCKED";
  if (blockers.length) return "NEEDS_WORK";
  if (Number(audit?.scores?.premiumReadinessPercent) >= 90 && !audit?.scores?.blocksPublish) return "COMPLETE";
  return "NEEDS_WORK";
}

function assertReportConsistency(audit = {}, meta = {}) {
  const issues = [];
  const weekly = asArray(audit?.weeklyContent);
  const blockers = asArray(audit?.teachingKitBlockers).map((b) => text(b?.message || b, 300));
  const domainsField = weekly.find((f) => f.field === "learningDomains");
  if (domainsField?.decision === "KEEP" && blockers.some((m) => /missing learning domains/i.test(m))) {
    issues.push("learning_domains_keep_vs_blocker");
  }
  const vocabField = weekly.find((f) => f.field === "vocabularyWords");
  if (vocabField?.decision === "KEEP" && blockers.some((m) => /vocabulary is missing/i.test(m))) {
    issues.push("vocabulary_keep_vs_blocker");
  }
  const prepField = weekly.find((f) => f.field === "teacherPreparation");
  if (prepField?.decision === "KEEP" && blockers.some((m) => /teacher preparation is weak or missing/i.test(m))) {
    issues.push("teacher_prep_keep_vs_blocker");
  }
  if (meta.printablesExcluded && Number(meta.printableMutations || 0) > 0) {
    issues.push("printables_excluded_but_mutated");
  }
  return { ok: issues.length === 0, issues };
}

module.exports = {
  vocabularyTextFromSources,
  learningDomainsFromSources,
  learningDomainsText,
  getActivityTeacherTips,
  teacherPreparationSources,
  isTeacherPreparationSubstantial,
  computePersistedPlanDiff,
  verifyConnectedAutoApplyPersistence,
  classifyBookRecord,
  bookNeedsDiscussionGuide,
  buildAuditPlanView,
  resolveCoverIntent,
  summarizeExecutionScope,
  classifyLessonReadiness,
  assertReportConsistency,
  CLASSROOM_LIBRARY_PROMPT_RE,
};
