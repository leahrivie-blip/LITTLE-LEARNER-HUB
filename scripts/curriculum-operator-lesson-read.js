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

function shouldIgnorePersistedDiffPath(pathKey = "") {
  const path = text(pathKey, 400);
  if (!path) return true;
  // Exact top-level ignores (legacy) plus nested bookkeeping prefixes.
  if (path === "updatedAt" || path === "__llhSurgicalDailyPlans" || path === "__llhAccessPlanPatch") {
    return true;
  }
  if (/^enrichmentDraft(\.|$)/.test(path) || /^enrichmentDraftUndo(\.|$)/.test(path)) return true;
  if (/^enrichmentPublishHistory(\.|$|\[)/.test(path)) return true;
  return false;
}

function computePersistedPlanDiff(beforePlan = {}, afterPlan = {}) {
  const paths = new Set([
    ...flattenObjectPaths(beforePlan),
    ...flattenObjectPaths(afterPlan),
  ]);
  const changed = [];
  paths.forEach((pathKey) => {
    if (shouldIgnorePersistedDiffPath(pathKey)) return;
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
  command = {},
  draftWeek = {},
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
      // Authoritative teachingKit.vocabCards wins over stale enrichmentDraft week cards.
      const authoritativeWeek = asArray(afterPlan?.teachingKit?.vocabCards).length
        ? { vocabCards: afterPlan.teachingKit.vocabCards }
        : draftWeek;
      const quality = classifyVocabularyQuality(afterPlan, authoritativeWeek);
      const synced = Boolean(text(afterPlan?.vocabularyWords, 2000));
      if (!quality.validCardCount || quality.state === "MALFORMED" || !synced) {
        mismatches.push({
          field: "vocabularyWords",
          code: "PERSISTENCE_MISMATCH",
          message: "Vocabulary repair did not persist as valid structured cards with synchronized plan text.",
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
  const requested = verifyRequestedOutcomes({
    command,
    afterPlan,
    draftWeek,
    composerAccepted: requestedFieldSuccess,
  });
  requested.gaps.forEach((gap) => mismatches.push(gap));
  return {
    ok: mismatches.length === 0,
    mismatches,
    requestedOutcomes: requested.requestedOutcomes,
    requestedOutcomeGaps: requested.gaps,
    persistedDiff: computePersistedPlanDiff(beforePlan, afterPlan),
  };
}

const VOCAB_CARD_TERM_KEYS = ["word", "title", "term", "label"];

function vocabCardTerm(card) {
  if (card == null) return "";
  if (typeof card === "string") return text(card, 200);
  if (typeof card !== "object" || Array.isArray(card)) return "";
  for (let i = 0; i < VOCAB_CARD_TERM_KEYS.length; i += 1) {
    const value = text(card[VOCAB_CARD_TERM_KEYS[i]], 200);
    if (value) return value;
  }
  return "";
}

function vocabCardLabel(card) {
  const term = vocabCardTerm(card);
  if (!term) return "";
  if (typeof card === "object" && card && !Array.isArray(card)) {
    const definition = text(card.definition || card.description || card.meaning, 400);
    if (definition) return `${term} — ${definition}`;
  }
  return term;
}

function normalizeVocabTermKey(value) {
  return text(value, 200).trim().toLowerCase().replace(/\s+/g, " ");
}

function isCombinedVocabularyList(value) {
  const raw = text(value, 2000).trim();
  if (!raw) return false;
  if (/,/.test(raw)) {
    const parts = raw.split(/,+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) return true;
  }
  if (/;/.test(raw)) {
    const parts = raw.split(/;+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) return true;
  }
  if (/\n/.test(raw)) {
    const parts = raw.split(/\n+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) return true;
  }
  if (/\s+\/\s+/.test(raw) || (/\//.test(raw) && raw.split(/\s*\/\s*/).filter(Boolean).length >= 2)) {
    return true;
  }
  return false;
}

function isValidVocabularyCard(card) {
  if (card == null) return false;
  if (typeof card === "string") {
    const term = text(card, 200).trim();
    return Boolean(term) && !isCombinedVocabularyList(term);
  }
  if (typeof card !== "object" || Array.isArray(card)) return false;
  const term = vocabCardTerm(card);
  if (!term || isCombinedVocabularyList(term)) return false;
  return true;
}

function dedupeValidVocabularyCards(cards = []) {
  const out = [];
  const seen = new Set();
  asArray(cards).forEach((card) => {
    if (!isValidVocabularyCard(card)) return;
    const key = normalizeVocabTermKey(vocabCardTerm(card));
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(card);
  });
  return out.slice(0, 40);
}

function getValidVocabularyCards(plan = {}, draftWeek = {}) {
  const draftCards = dedupeValidVocabularyCards(asArray(draftWeek?.vocabCards));
  if (draftCards.length) return draftCards;
  return dedupeValidVocabularyCards(asArray(plan?.teachingKit?.vocabCards));
}

function vocabularyWordsFromValidCards(cards = []) {
  return dedupeValidVocabularyCards(cards)
    .map((card) => vocabCardTerm(card))
    .filter(Boolean)
    .join(", ");
}

function classifyVocabularyQuality(plan = {}, draftWeek = {}) {
  const planString = text(plan?.vocabularyWords, 2000);
  const rawCards = asArray(draftWeek?.vocabCards).length
    ? asArray(draftWeek?.vocabCards)
    : asArray(plan?.teachingKit?.vocabCards);
  const validCards = dedupeValidVocabularyCards(rawCards);
  const hasRawCards = rawCards.length > 0;
  const planStringValid = Boolean(planString);

  if (!validCards.length) {
    if (hasRawCards) {
      return {
        state: "MALFORMED",
        reason: "Legacy vocabulary is stored as a combined-word dump instead of structured cards.",
        validCardCount: 0,
        preview: text(vocabCardTerm(rawCards[0]) || planString, 160),
      };
    }
    return {
      state: "MISSING",
      reason: planStringValid
        ? "Vocabulary string exists but structured cards are missing."
        : "Vocabulary is empty.",
      validCardCount: 0,
      preview: text(planString, 160),
    };
  }
  if (!planStringValid) {
    return {
      state: "SYNC_NEEDED",
      reason: "Structured vocabulary cards exist but plan.vocabularyWords is not synchronized.",
      validCardCount: validCards.length,
      preview: vocabularyWordsFromValidCards(validCards).slice(0, 160),
    };
  }
  if (validCards.length < 4) {
    return {
      state: "THIN",
      reason: "Structured vocabulary is present but thin.",
      validCardCount: validCards.length,
      preview: vocabularyWordsFromValidCards(validCards).slice(0, 160),
    };
  }
  return {
    state: "VALID",
    reason: "Valid structured vocabulary present.",
    validCardCount: validCards.length,
    preview: vocabularyWordsFromValidCards(validCards).slice(0, 160),
  };
}

function hasValidStructuredVocabularyAndSync(plan = {}, draftWeek = {}) {
  const quality = classifyVocabularyQuality(plan, draftWeek);
  return quality.state === "VALID" || quality.state === "THIN";
}

function vocabularyTextFromSources(plan = {}, draftWeek = {}) {
  const planString = text(plan?.vocabularyWords, 2000);
  if (planString) return planString;
  const validCards = getValidVocabularyCards(plan, draftWeek);
  if (validCards.length) return vocabularyWordsFromValidCards(validCards);
  return "";
}

function commandRequestsVocabularyRepair(command = {}) {
  const raw = text(command?.rawCommand || command?.task || "", 4000);
  const scope = asArray(command?.actions?.weeklyFieldScope);
  if (scope.includes("vocabCards") || scope.includes("vocabularyWords")) return true;
  if (!/\bvocab/i.test(raw)) return false;
  return /\b(repair|fix|fill|populate|missing|authoritative|remaining|only|upgrade|prove)\b/i.test(raw)
    || /\bmake\s+sure\b/i.test(raw)
    || /\bvocabular(?:y|ies)\s*[- ]?only\b/i.test(raw);
}

function commandRequestsLearningDomainsRepair(command = {}) {
  const raw = text(command?.rawCommand || command?.task || "", 4000);
  if (!/\blearning\s*domains?\b/i.test(raw)) return false;
  return /\b(repair|fix|fill|populate|missing|authoritative|remaining)\b/i.test(raw)
    || /\bmake\s+sure\b/i.test(raw)
    || /\bdo\s+not\s+leave\s+learning\s*domains?\s+empty\b/i.test(raw);
}

function buildRequestedOutcomes(command = {}) {
  const outcomes = {};
  const raw = text(command?.rawCommand || command?.task || "", 4000);
  const narrowDomainsAndVocab = /\bonly\s+(?:fix|prove|repair)\s+(?:the\s+)?(?:remaining\s+)?(?:learning\s+)?domains?\s+and\s+vocab/i.test(raw)
    || /\b(?:fix|repair)\s+only\s+(?:learning\s+)?domains?\s+and\s+vocab/i.test(raw);
  if (narrowDomainsAndVocab || commandRequestsLearningDomainsRepair(command)) {
    outcomes.learningDomains = "valid_nonempty";
  }
  if (narrowDomainsAndVocab || commandRequestsVocabularyRepair(command)) {
    outcomes.vocabulary = "valid_structured_and_synced";
  }
  return outcomes;
}

function evaluateRequestedOutcome(outcomeKey, plan = {}, draftWeek = {}) {
  if (outcomeKey === "learningDomains") {
    return asArray(plan?.learningDomains).length > 0;
  }
  if (outcomeKey === "vocabulary") {
    const authoritativeWeek = asArray(plan?.teachingKit?.vocabCards).length
      ? { vocabCards: plan.teachingKit.vocabCards }
      : draftWeek;
    const quality = classifyVocabularyQuality(plan, authoritativeWeek);
    const synced = Boolean(text(plan?.vocabularyWords, 2000));
    return quality.validCardCount > 0 && quality.state !== "MALFORMED" && synced;
  }
  return true;
}

function verifyRequestedOutcomes({
  command = {},
  afterPlan = {},
  draftWeek = {},
  composerAccepted = [],
} = {}) {
  const requested = buildRequestedOutcomes(command);
  const gaps = [];
  Object.keys(requested).forEach((key) => {
    if (evaluateRequestedOutcome(key, afterPlan, draftWeek)) return;
    const composerTouched = asArray(composerAccepted).some((row) => {
      const field = text(row?.field, 80);
      if (key === "vocabulary") return field === "vocabCards" || field === "vocabularyWords";
      if (key === "learningDomains") return field === "learningDomains";
      return false;
    });
    gaps.push({
      field: key,
      code: composerTouched ? "PERSISTENCE_MISMATCH" : "REQUESTED_REPAIR_UNSATISFIED",
      message: composerTouched
        ? `${key} repair was accepted but authoritative stored state is still invalid.`
        : `${key} repair was explicitly requested but no valid work completed.`,
      requestedOutcome: requested[key],
    });
  });
  return { ok: gaps.length === 0, gaps, requestedOutcomes: requested };
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
  const validCards = getValidVocabularyCards(plan, week);
  const vocabularyWords = text(plan?.vocabularyWords, 2000)
    || vocabularyWordsFromValidCards(validCards);
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
  if (vocabField?.decision === "KEEP") {
    const quality = classifyVocabularyQuality(meta.plan || {}, meta.week || {});
    if (quality.state !== "VALID" && blockers.some((m) => /vocabulary is missing/i.test(m))) {
      issues.push("vocabulary_keep_vs_blocker");
    }
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
  vocabCardTerm,
  vocabCardLabel,
  normalizeVocabTermKey,
  isCombinedVocabularyList,
  isValidVocabularyCard,
  dedupeValidVocabularyCards,
  getValidVocabularyCards,
  vocabularyWordsFromValidCards,
  classifyVocabularyQuality,
  hasValidStructuredVocabularyAndSync,
  commandRequestsVocabularyRepair,
  commandRequestsLearningDomainsRepair,
  buildRequestedOutcomes,
  evaluateRequestedOutcome,
  verifyRequestedOutcomes,
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
