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

const VOCAB_ONLY_WEEKLY_FIELDS = Object.freeze(new Set(["vocabCards", "vocabularyWords"]));

/**
 * True when weeklyFieldScope is non-empty and exclusively vocabulary fields.
 * buildMutationAllowlist expands vocabCards → [vocabCards, vocabularyWords]; both
 * still mean vocabulary-only intent and must NOT open the broad enrichment path.
 */
function isVocabOnlyWeeklyScope(scope = []) {
  const fields = schema.asArray(scope).map((f) => text(f, 80)).filter(Boolean);
  if (!fields.length) return false;
  return fields.every((field) => VOCAB_ONLY_WEEKLY_FIELDS.has(field));
}

function isVocabOnlyAllowlist(allowlist = {}) {
  if (!isVocabOnlyWeeklyScope(allowlist.weeklyFieldScope)) return false;
  if (allowlist.assets?.images || allowlist.assets?.printables || allowlist.assets?.cover
    || allowlist.assets?.songs || allowlist.assets?.books) {
    return false;
  }
  if (allowlist.allowedActivityFields && allowlist.allowedActivityFields.size > 0) return false;
  return true;
}

function isVocabOnlyCommand(command = {}) {
  return isVocabOnlyWeeklyScope(command?.actions?.weeklyFieldScope);
}

/**
 * Route connected auto-apply for a job/allowlist.
 * Vocab-only requests MUST use surgical apply (or fail closed) — never broad enrichment.
 */
function resolveConnectedApplyMode(allowlist = {}, command = null) {
  if (isVocabOnlyAllowlist(allowlist) || isVocabOnlyCommand(command)) {
    return { mode: "surgical_vocab" };
  }
  // Expanded/partial vocab weekly scope that failed asset/activity checks still must
  // not fall through to broad enrichment promotion of historical draft songs/printables.
  if (isVocabOnlyWeeklyScope(allowlist?.weeklyFieldScope)) {
    return {
      mode: "fail_closed",
      code: "vocab_only_surgical_required",
      error: "Vocabulary-only connected auto-apply cannot use broad enrichment persistence.",
    };
  }
  return { mode: "broad_enrichment" };
}

/**
 * Preserve structured { word, definition } cards. Coerce plain strings.
 * Combined-list dumps are expanded into separate single-word cards (never kept as one card).
 */
function normalizeStructuredVocabCards(rawCards = []) {
  return lessonRead.expandVocabularyCardEntries(rawCards).slice(0, 40);
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
 * Extract an explicit user-supplied vocabulary word list from a command.
 * Generative requests without an exact list return [].
 *
 * Examples that yield words:
 *   "exactly these four separate cards: art, create, explore, build"
 *   "Change vocabulary to art, create, explore, build"
 * Examples that yield [] (composer may generate):
 *   "Improve the vocabulary cards for Little Makers Workshop"
 */
function extractExplicitVocabularyWords(command = {}) {
  const raw = text(command?.rawCommand || command?.commandText || command?.text || "", 4000);
  if (!raw || !/\bvocab/i.test(raw)) return [];

  const countWord = "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten)";
  const patterns = [
    new RegExp(
      String.raw`\bexactly\s+(?:these\s+)?(?:${countWord}\s+)?(?:separate\s+)?(?:vocabulary\s+)?cards?\s*[:=]?\s*([^\n.]+)`,
      "i",
    ),
    new RegExp(
      String.raw`\breplace\s+vocabulary\s+with\s+(?:exactly\s+)?(?:these\s+)?(?:${countWord}\s+)?(?:separate\s+)?(?:cards?\s*[:=]?\s*)?([^\n.]+)`,
      "i",
    ),
    /\b(?:change|set|use|make)\s+vocabulary\s+(?:cards?\s+)?(?:to|with|=)\s*([^\n.]+)/i,
    /\bvocabulary\s*(?:cards?|words?)?\s*[:=]\s*([^\n.]+)/i,
  ];

  let captured = "";
  for (let i = 0; i < patterns.length; i += 1) {
    const match = raw.match(patterns[i]);
    if (match && match[1]) {
      captured = match[1];
      break;
    }
  }
  if (!captured) return [];

  captured = captured
    // Drop residual lead-in if a pattern left "cards: art, ..." in the capture.
    .replace(/^(?:exactly\s+)?(?:these\s+)?(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?(?:separate\s+)?(?:vocabulary\s+)?cards?\s*[:=]?\s*/i, "")
    .replace(/\bONE\s+existing\b[\s\S]*$/i, "")
    .replace(/\bconnected(?:Upgrade|AutoApply)\b[\s\S]*$/i, "")
    .replace(/\bpublish\s*=[\s\S]*$/i, "")
    .replace(/\bupgradeActivities\b[\s\S]*$/i, "")
    .replace(/\btextOnly\b[\s\S]*$/i, "")
    .replace(/\bDo not\b[\s\S]*$/i, "")
    .trim();

  const stop = /^(exactly|these|four|five|six|seven|eight|nine|ten|\d+|separate|cards?|vocabulary|words?|only|existing|lesson|true|false|publish|with|to|and)$/i;
  const words = [];
  const seen = new Set();
  captured.split(/\s*,\s*|\s+and\s+/i).forEach((part) => {
    const cleaned = text(part, 120).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9'\-]+$/g, "").trim();
    if (!cleaned || stop.test(cleaned)) return;
    if (/^cur-lp-/i.test(cleaned)) return;
    if (/=/.test(cleaned)) return;
    if (cleaned.length > 40) return;
    if (/\s/.test(cleaned) && cleaned.split(/\s+/).length > 3) return;
    if (!/[A-Za-z]/.test(cleaned)) return;
    const key = cleaned.toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) return;
    seen.add(key);
    words.push(cleaned);
  });
  return words.slice(0, 40);
}

function cardsFromExplicitVocabularyWords(words = []) {
  return normalizeStructuredVocabCards(schema.asArray(words).map((word) => ({ word })));
}

function vocabularyWordKeys(cardsOrWords = []) {
  return normalizeStructuredVocabCards(
    schema.asArray(cardsOrWords).map((entry) => (
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? entry
        : { word: entry }
    )),
  ).map((card) => text(card.word, 120).trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean);
}

/**
 * Exact content equality for explicit vocabulary requests (count + values).
 * Comparison is case-insensitive to match project vocab dedupe keys; order must match.
 */
function vocabularyListsExactlyEqual(left = [], right = []) {
  const a = vocabularyWordKeys(left);
  const b = vocabularyWordKeys(right);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * When the user supplied an explicit vocabulary list, that list is authoritative
 * over AI/composer-generated vocabulary. Generative requests (no explicit list)
 * leave candidateCards unchanged.
 *
 * Fail closed with VOCAB_CONTENT_MISMATCH when an explicit list exists and the
 * candidate set differs in count or values.
 */
function resolveAuthoritativeVocabCards({ command = null, candidateCards = [] } = {}) {
  const explicitWords = extractExplicitVocabularyWords(command || {});
  if (!explicitWords.length) {
    const normalized = normalizeStructuredVocabCards(candidateCards);
    return {
      ok: Boolean(normalized.length),
      explicit: false,
      cards: normalized,
      requestedWords: [],
      code: normalized.length ? "vocab_generative_ok" : "vocab_cards_invalid",
      error: normalized.length ? "" : "No valid structured vocabulary cards to apply.",
    };
  }

  const requestedCards = cardsFromExplicitVocabularyWords(explicitWords);
  if (!requestedCards.length) {
    return {
      ok: false,
      explicit: true,
      cards: [],
      requestedWords: explicitWords,
      code: "VOCAB_CONTENT_MISMATCH",
      error: "Explicit vocabulary request could not be normalized into structured cards.",
    };
  }

  const candidateNormalized = normalizeStructuredVocabCards(candidateCards);
  // No candidate yet (override path before composer / deferred stage): use explicit.
  if (!candidateNormalized.length) {
    return {
      ok: true,
      explicit: true,
      cards: requestedCards,
      requestedWords: explicitWords,
      code: "vocab_explicit_authoritative",
      error: "",
    };
  }

  if (!vocabularyListsExactlyEqual(candidateNormalized, requestedCards)) {
    return {
      ok: false,
      explicit: true,
      cards: [],
      requestedWords: explicitWords,
      candidateWords: vocabularyWordKeys(candidateNormalized),
      code: "VOCAB_CONTENT_MISMATCH",
      error: "Composer/intended vocabulary does not exactly match the explicit user-requested vocabulary set.",
    };
  }

  // Prefer the explicit casing/order as the authoritative persist payload.
  return {
    ok: true,
    explicit: true,
    cards: requestedCards,
    requestedWords: explicitWords,
    code: "vocab_explicit_match",
    error: "",
  };
}

/**
 * Apply explicit-vocabulary authority onto a composer/upgrade result.
 * Mutates a shallow copy of intended week vocabCards when an explicit list exists.
 * Does not invent vocabulary for generative requests.
 */
function applyExplicitVocabularyAuthorityToIntended(command = {}, intended = {}) {
  const explicitWords = extractExplicitVocabularyWords(command);
  if (!explicitWords.length) {
    return { changed: false, intended, requestedWords: [] };
  }
  const cards = cardsFromExplicitVocabularyWords(explicitWords);
  const next = intended && typeof intended === "object" ? { ...intended } : {};
  const week = next.week && typeof next.week === "object" ? { ...next.week } : {};
  week.vocabCards = cards;
  next.week = week;
  return { changed: true, intended: next, requestedWords: explicitWords, cards };
}

/**
 * Extract vocab cards for surgical apply from composer diagnostics / enrichment draft.
 * Prefer this job's intended/composer output over historical draft cards so a prior
 * malformed enrichmentDraft.week.vocabCards dump cannot poison surgical apply.
 *
 * When command contains an explicit vocabulary list, that list is authoritative:
 * - empty intended → use the explicit list
 * - intended that diverges from the explicit list → fail closed (VOCAB_CONTENT_MISMATCH)
 * - never fall back to historical draft / teachingKit for explicit requests
 * Generative requests (no exact list) keep the prior intended → draft → teachingKit chain.
 */
function extractVocabCardsForSurgicalApply(plan = {}, lessonResult = {}, command = null) {
  const intendedCards = schema.asArray(
    lessonResult?.intended?.week?.vocabCards
    || lessonResult?.draftWeek?.vocabCards,
  );
  const intendedNormalized = normalizeStructuredVocabCards(intendedCards);
  const explicitWords = extractExplicitVocabularyWords(command || {});

  if (explicitWords.length) {
    // Explicit list: do not consult historical draft/teachingKit (those caused the
    // live content mismatch when AI intended was empty or wrong).
    const resolved = resolveAuthoritativeVocabCards({
      command,
      candidateCards: intendedNormalized,
    });
    if (!resolved.ok) {
      const err = new Error(resolved.error || "Vocabulary content mismatch.");
      err.code = resolved.code || "VOCAB_CONTENT_MISMATCH";
      err.details = {
        requestedWords: resolved.requestedWords || [],
        candidateWords: resolved.candidateWords || vocabularyWordKeys(intendedNormalized),
      };
      throw err;
    }
    return resolved.cards;
  }

  let candidate = intendedNormalized;
  if (!candidate.length) {
    const draftCards = schema.asArray(plan?.enrichmentDraft?.week?.vocabCards);
    const draftNormalized = normalizeStructuredVocabCards(draftCards);
    candidate = draftNormalized.length
      ? draftNormalized
      : normalizeStructuredVocabCards(plan?.teachingKit?.vocabCards);
  }

  const resolved = resolveAuthoritativeVocabCards({ command, candidateCards: candidate });
  if (!resolved.ok) {
    const err = new Error(resolved.error || "Vocabulary content mismatch.");
    err.code = resolved.code || "VOCAB_CONTENT_MISMATCH";
    err.details = {
      requestedWords: resolved.requestedWords || [],
      candidateWords: resolved.candidateWords || vocabularyWordKeys(candidate),
    };
    throw err;
  }
  return resolved.cards;
}

/**
 * Vocab-only connected auto-apply should not persist a broad enrichment draft first.
 * Stage intended cards in memory and let surgical apply write authoritative fields.
 */
function shouldDeferVocabDraftPersist(command = {}, allowlist = null) {
  const actions = command?.actions || {};
  if (actions.planOnly === true) return false;
  if (actions.connectedAutoApply === false) return false;
  const autoApply = actions.connectedAutoApply === true || actions.connectedUpgrade === true;
  if (!autoApply) return false;
  if (allowlist && isVocabOnlyAllowlist(allowlist)) return true;
  return isVocabOnlyCommand(command);
}

module.exports = {
  MUTATION_CATEGORY,
  SYSTEM_METADATA_PATHS,
  VOCAB_ONLY_WEEKLY_FIELDS,
  isVocabOnlyWeeklyScope,
  isVocabOnlyAllowlist,
  isVocabOnlyCommand,
  resolveConnectedApplyMode,
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
  extractExplicitVocabularyWords,
  cardsFromExplicitVocabularyWords,
  vocabularyWordKeys,
  vocabularyListsExactlyEqual,
  resolveAuthoritativeVocabCards,
  applyExplicitVocabularyAuthorityToIntended,
  extractVocabCardsForSurgicalApply,
  shouldDeferVocabDraftPersist,
};
