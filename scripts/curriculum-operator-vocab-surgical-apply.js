/**
 * Surgical vocabulary-only connected apply.
 *
 * Narrow weeklyFieldScope=["vocabCards"] must persist ONLY:
 *   teachingKit.vocabCards + plan.vocabularyWords
 *
 * Historical enrichmentDraft songs/books/printables/metadata must NOT be
 * promoted by mergeDraftIntoPlan during this path.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");
const lessonRead = require("./curriculum-operator-lesson-read.js");

const MUTATION_CATEGORY = Object.freeze({
  AUTHORITATIVE_CURRICULUM_MUTATION: "AUTHORITATIVE_CURRICULUM_MUTATION",
  INTERMEDIATE_ENRICHMENT_BOOKKEEPING: "INTERMEDIATE_ENRICHMENT_BOOKKEEPING",
  JOB_METADATA: "JOB_METADATA",
  REPORT_METADATA: "REPORT_METADATA",
  SYSTEM_METADATA: "SYSTEM_METADATA",
});

/** Exact system-metadata paths permitted without counting as curriculum scope mutation. */
const SYSTEM_METADATA_PATHS = Object.freeze([
  "updatedAt",
  "lastEditedBy",
  "teachingKit.updatedAt",
  "teachingKit.lastEditedBy",
  "teachingKit.completionPercent",
  "teachingKit.completeness",
  "teachingKit.schemaVersion",
  "teachingKit.lastEnrichmentPublishedAt",
  "teachingKit.lastEnrichmentPublishedBy",
  "teachingKit.lastEnrichmentPublishFingerprint",
  "teachingKit.lastEnrichmentVersionId",
]);

const VOCAB_ONLY_AUTHORITATIVE_PATH_RE = /^(vocabularyWords|teachingKit\.vocabCards)(\.|$|\[)/;

function text(value, max = 4000) {
  return schema.text(value, max);
}

function isVocabOnlyAllowlist(allowlist = {}) {
  const scope = schema.asArray(allowlist.weeklyFieldScope).map((f) => text(f, 80)).filter(Boolean);
  if (scope.length !== 1 || scope[0] !== "vocabCards") return false;
  if (allowlist.assets?.images || allowlist.assets?.printables || allowlist.assets?.cover
    || allowlist.assets?.songs || allowlist.assets?.books) {
    return false;
  }
  if (allowlist.allowedActivityFields && allowlist.allowedActivityFields.size > 0) return false;
  return true;
}

function isVocabOnlyCommand(command = {}) {
  const scope = schema.asArray(command?.actions?.weeklyFieldScope).map((f) => text(f, 80)).filter(Boolean);
  return scope.length === 1 && scope[0] === "vocabCards";
}

/**
 * Preserve structured { word, definition } cards. Coerce plain strings.
 * Reject combined-list dumps and empty terms.
 */
function normalizeStructuredVocabCards(rawCards = []) {
  const out = [];
  const seen = new Set();
  schema.asArray(rawCards).forEach((card) => {
    let normalized = null;
    if (typeof card === "string") {
      const word = text(card, 120);
      if (!word || lessonRead.isCombinedVocabularyList(word)) return;
      normalized = { word };
    } else if (card && typeof card === "object" && !Array.isArray(card)) {
      const word = text(card.word || card.title || card.term || card.label, 120);
      if (!word || lessonRead.isCombinedVocabularyList(word)) return;
      normalized = { word };
      const definition = text(card.definition || card.description || card.meaning, 400);
      const example = text(card.example || card.sentence, 400);
      if (definition) normalized.definition = definition;
      if (example) normalized.example = example;
    }
    if (!normalized || !lessonRead.isValidVocabularyCard(normalized)) return;
    const key = lessonRead.normalizeVocabTermKey(normalized.word);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  });
  return out.slice(0, 40);
}

function vocabularyWordsFromCards(cards = []) {
  return normalizeStructuredVocabCards(cards)
    .map((card) => text(card.word, 120))
    .filter(Boolean)
    .join(", ");
}

function validateVocabApplyCards(cards = []) {
  const normalized = normalizeStructuredVocabCards(cards);
  if (!normalized.length) {
    return { ok: false, code: "vocab_cards_invalid", error: "No valid structured vocabulary cards to apply." };
  }
  if (normalized.length > 40) {
    return { ok: false, code: "vocab_cards_limit", error: "Vocabulary card count exceeds supported limit." };
  }
  const words = vocabularyWordsFromCards(normalized);
  if (!text(words, 2000)) {
    return { ok: false, code: "vocabulary_words_empty", error: "Synchronized vocabularyWords would be empty." };
  }
  return { ok: true, cards: normalized, vocabularyWords: words };
}

/**
 * Nested surgical teachingKit merge — preserve all other teachingKit fields.
 */
function mergeTeachingKitVocabCards(existingTeachingKit, vocabCards) {
  const base = existingTeachingKit && typeof existingTeachingKit === "object" && !Array.isArray(existingTeachingKit)
    ? { ...existingTeachingKit }
    : {};
  return {
    ...base,
    vocabCards: normalizeStructuredVocabCards(vocabCards),
  };
}

/**
 * Minimal authoritative patch for vocab-only apply.
 * Includes only identity/CAS-safe fields the caller already has on the base plan
 * plus vocabularyWords + nested teachingKit.vocabCards.
 */
function buildSurgicalVocabPersistencePayload(existingPlan = {}, validated = {}) {
  const cards = validated.cards || [];
  const vocabularyWords = validated.vocabularyWords || vocabularyWordsFromCards(cards);
  const teachingKit = mergeTeachingKitVocabCards(existingPlan.teachingKit, cards);
  return {
    id: text(existingPlan.id, 160),
    vocabularyWords,
    teachingKit,
  };
}

function assertMinimalVocabPayload(payload = {}) {
  const allowed = new Set(["id", "vocabularyWords", "teachingKit", "updatedAt", "lastEditedBy"]);
  const unexpected = Object.keys(payload || {}).filter((key) => !allowed.has(key));
  return {
    ok: unexpected.length === 0,
    unexpected,
  };
}

function classifyPersistedPath(pathKey = "") {
  const path = text(pathKey, 400);
  if (!path) return MUTATION_CATEGORY.REPORT_METADATA;
  if (SYSTEM_METADATA_PATHS.includes(path)
    || /^teachingKit\.(updatedAt|lastEditedBy|completionPercent|completeness|schemaVersion|lastEnrichment)/.test(path)) {
    return MUTATION_CATEGORY.SYSTEM_METADATA;
  }
  if (/^enrichmentDraft(\.|$)/.test(path) || /^enrichmentDraftUndo(\.|$)/.test(path)) {
    return MUTATION_CATEGORY.INTERMEDIATE_ENRICHMENT_BOOKKEEPING;
  }
  if (/^enrichmentPublishHistory(\.|$|\[)/.test(path)) {
    return MUTATION_CATEGORY.JOB_METADATA;
  }
  if (/^__llh|operatorJobId|composerSource|operatorPhase|previewReady/.test(path)) {
    return MUTATION_CATEGORY.JOB_METADATA;
  }
  return MUTATION_CATEGORY.AUTHORITATIVE_CURRICULUM_MUTATION;
}

function isAuthoritativeCurriculumPath(pathKey) {
  return classifyPersistedPath(pathKey) === MUTATION_CATEGORY.AUTHORITATIVE_CURRICULUM_MUTATION;
}

function isVocabOnlyAuthoritativePath(pathKey) {
  return VOCAB_ONLY_AUTHORITATIVE_PATH_RE.test(text(pathKey, 400));
}

/**
 * Authoritative-only before/after diff (excludes enrichmentDraft / publish history / system metadata).
 */
function computeAuthoritativeCurriculumDiff(beforePlan = {}, afterPlan = {}) {
  const raw = lessonRead.computePersistedPlanDiff(beforePlan, afterPlan);
  return raw.filter((pathKey) => isAuthoritativeCurriculumPath(pathKey));
}

function computeIntermediateDraftDiff(beforePlan = {}, afterPlan = {}) {
  const raw = lessonRead.computePersistedPlanDiff(
    { enrichmentDraft: beforePlan?.enrichmentDraft || null },
    { enrichmentDraft: afterPlan?.enrichmentDraft || null },
  );
  return raw.filter((pathKey) => classifyPersistedPath(pathKey) === MUTATION_CATEGORY.INTERMEDIATE_ENRICHMENT_BOOKKEEPING);
}

/**
 * Vocab-only post-persist guard: only authoritative out-of-scope curriculum paths block.
 */
function verifyVocabOnlyAuthoritativeDiff(beforePlan = {}, afterPlan = {}, allowlist = {}) {
  const allowlistApi = require("./curriculum-operator-mutation-allowlist.js");
  const authoritativeDiff = computeAuthoritativeCurriculumDiff(beforePlan, afterPlan);
  const intermediateDraftDiff = computeIntermediateDraftDiff(beforePlan, afterPlan);
  const unexpected = [];
  const violations = [];
  const permittedAuthoritative = [];

  authoritativeDiff.forEach((pathKey) => {
    if (isVocabOnlyAuthoritativePath(pathKey) || allowlistApi.isPathAllowed(pathKey, allowlist)) {
      permittedAuthoritative.push(pathKey);
      return;
    }
    unexpected.push(pathKey);
    allowlistApi.recordViolation(violations, {
      code: "UNEXPECTED_PERSISTED_MUTATION",
      path: pathKey,
      stage: "post_persist.authoritative_diff",
      message: "Authoritative curriculum mutation outside vocabulary-only scope.",
      requestedScope: allowlist.weeklyFieldScope,
    });
  });

  return {
    ok: unexpected.length === 0 && violations.length === 0,
    unexpected,
    violations,
    authoritativeDiff,
    permittedAuthoritative,
    intermediateDraftDiff,
    intermediateDraftReport: {
      code: "INTERMEDIATE_DRAFT_DIFF",
      paths: intermediateDraftDiff,
      blocksAuthoritativeApply: false,
    },
  };
}

/**
 * Pure surgical apply onto an in-memory plan. Does not touch activities, songs, books, etc.
 */
function applySurgicalVocabToPlan(existingPlan = {}, rawCards = []) {
  const validated = validateVocabApplyCards(rawCards);
  if (!validated.ok) return { ok: false, ...validated };

  const payloadCheck = assertMinimalVocabPayload(buildSurgicalVocabPersistencePayload(existingPlan, validated));
  if (!payloadCheck.ok) {
    return {
      ok: false,
      code: "vocab_payload_too_broad",
      error: `Surgical vocab payload contained unrelated fields: ${payloadCheck.unexpected.join(", ")}`,
      unexpected: payloadCheck.unexpected,
    };
  }

  const nextTeachingKit = mergeTeachingKitVocabCards(existingPlan.teachingKit, validated.cards);
  const nextDraft = existingPlan.enrichmentDraft && typeof existingPlan.enrichmentDraft === "object"
    ? JSON.parse(JSON.stringify(existingPlan.enrichmentDraft))
    : { week: {}, activities: {} };
  if (!nextDraft.week || typeof nextDraft.week !== "object") nextDraft.week = {};
  // Mirror authoritative vocab into draft.week.vocabCards only — do not promote songs/books.
  nextDraft.week.vocabCards = validated.cards;

  const nextPlan = {
    ...existingPlan,
    vocabularyWords: validated.vocabularyWords,
    teachingKit: nextTeachingKit,
    enrichmentDraft: nextDraft,
  };

  // Atomicity: both sides required.
  const quality = lessonRead.classifyVocabularyQuality(nextPlan, {});
  if (!quality.validCardCount || quality.state === "MALFORMED" || !text(nextPlan.vocabularyWords, 2000)) {
    return {
      ok: false,
      code: "PERSISTENCE_MISMATCH",
      error: "Vocabulary apply would leave cards/string out of sync.",
    };
  }

  return {
    ok: true,
    plan: nextPlan,
    cards: validated.cards,
    vocabularyWords: validated.vocabularyWords,
    payload: buildSurgicalVocabPersistencePayload(existingPlan, validated),
    preservedTeachingKitFields: Object.keys(existingPlan.teachingKit || {})
      .filter((key) => key !== "vocabCards"),
  };
}

/**
 * Extract vocab cards for surgical apply from composer diagnostics / enrichment draft.
 * Prefer draft.week.vocabCards written by this job; never invent from historical songs/books.
 */
function extractVocabCardsForSurgicalApply(plan = {}, lessonResult = {}) {
  const draftCards = schema.asArray(plan?.enrichmentDraft?.week?.vocabCards);
  if (draftCards.length) return draftCards;
  const accepted = schema.asArray(lessonResult?.composerDiagnostics?.accepted)
    .some((row) => row.scope === "week" && row.field === "vocabCards");
  if (!accepted) return [];
  return schema.asArray(lessonResult?.intended?.week?.vocabCards
    || lessonResult?.draftWeek?.vocabCards
    || plan?.teachingKit?.vocabCards);
}

module.exports = {
  MUTATION_CATEGORY,
  SYSTEM_METADATA_PATHS,
  isVocabOnlyAllowlist,
  isVocabOnlyCommand,
  normalizeStructuredVocabCards,
  vocabularyWordsFromCards,
  validateVocabApplyCards,
  mergeTeachingKitVocabCards,
  buildSurgicalVocabPersistencePayload,
  assertMinimalVocabPayload,
  classifyPersistedPath,
  isAuthoritativeCurriculumPath,
  isVocabOnlyAuthoritativePath,
  computeAuthoritativeCurriculumDiff,
  computeIntermediateDraftDiff,
  verifyVocabOnlyAuthoritativeDiff,
  applySurgicalVocabToPlan,
  extractVocabCardsForSurgicalApply,
};
