/**
 * Enrichment publish-history retention (Phase A — not a schema split).
 *
 * History entry shape (writers in server/index.js + curriculum-draft-review.js):
 * {
 *   versionId: string,          // stable identity for rollback UI (NOT array index)
 *   kind: "publish" | "draft" | "rollback" | "draft_review",
 *   publishedAt: ISO string,
 *   publishedBy: string,
 *   fingerprint: string,        // content fingerprint when available
 *   lessonPlanId: string,
 *   rollbackOf?: string,        // versionId restored from (rollback entries)
 *   snapshot: object | null,    // publish: dailyPlans/activities…; draft: { enrichmentDraft }
 * }
 *
 * Retention policy (newest-first arrays):
 * - Prefer rollback-worthy kinds: publish, rollback (and unknown non-draft snapshots).
 * - Keep at most ENRICHMENT_HISTORY_RETENTION_LIMIT (5) rollback-worthy entries.
 * - Keep at most 1 draft-like entry (draft / draft_review) when room remains,
 *   OR up to the full limit when the history is draft-only.
 * - Drop consecutive duplicates that share the same non-empty fingerprint.
 * - Never mutates current enrichmentDraft / enrichmentPublished / lesson body —
 *   this helper only returns a trimmed history array.
 */

"use strict";

/** Max retained history entries per lesson plan after a history write. */
const ENRICHMENT_HISTORY_RETENTION_LIMIT = 5;

/**
 * Defensive ceiling for normalize / unexpected growth paths.
 * Writers must use trimEnrichmentPublishHistory (retention limit), not this alone.
 */
const ENRICHMENT_HISTORY_ABSOLUTE_CEILING = 250;

const DRAFT_LIKE_KINDS = new Set(["draft", "draft_review"]);
const ROLLBACK_WORTHY_KINDS = new Set(["publish", "rollback"]);

/**
 * @param {unknown} entry
 * @returns {boolean}
 */
function isDraftLikeHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  const kind = String(entry.kind || "").toLowerCase();
  if (DRAFT_LIKE_KINDS.has(kind)) return true;
  const snap = entry.snapshot;
  // Mirror editor isDraftHistorySnapshot: draft payload without published dailyPlans.
  return Boolean(snap && typeof snap === "object" && snap.enrichmentDraft && !snap.dailyPlans);
}

/**
 * @param {unknown} entry
 * @returns {boolean}
 */
function isRollbackWorthyHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (isDraftLikeHistoryEntry(entry)) return false;
  const kind = String(entry.kind || "publish").toLowerCase();
  if (ROLLBACK_WORTHY_KINDS.has(kind)) return true;
  // Unknown kinds with a snapshot are treated as rollback-worthy (safe default).
  return Boolean(entry.snapshot && typeof entry.snapshot === "object");
}

/**
 * @param {unknown} entry
 * @returns {string}
 */
function historyEntryFingerprint(entry) {
  if (!entry || typeof entry !== "object") return "";
  return String(entry.fingerprint || "").trim();
}

/**
 * Drop consecutive newest-first entries that share the same non-empty fingerprint.
 * @param {object[]} entries
 * @returns {object[]}
 */
function dedupeConsecutiveHistoryEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const out = [];
  let lastFingerprint = "";
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const fp = historyEntryFingerprint(entry);
    if (fp && fp === lastFingerprint) continue;
    out.push(entry);
    lastFingerprint = fp || `version:${String(entry.versionId || "")}`;
  }
  return out;
}

/**
 * Canonical retention trim for enrichmentPublishHistory (newest-first).
 * @param {unknown} history
 * @param {{ limit?: number, maxDraftLike?: number }} [options]
 * @returns {object[]}
 */
function trimEnrichmentPublishHistory(history, options = {}) {
  const limit = Math.max(1, Number(options.limit) || ENRICHMENT_HISTORY_RETENTION_LIMIT);
  const maxDraftLike = options.maxDraftLike === undefined
    ? 1
    : Math.max(0, Number(options.maxDraftLike) || 0);

  if (!Array.isArray(history) || history.length === 0) return [];

  const cleaned = history.filter((entry) => (
    entry
    && typeof entry === "object"
    && String(entry.versionId || "").trim()
  ));
  if (cleaned.length === 0) return [];

  const deduped = dedupeConsecutiveHistoryEntries(cleaned);
  const preferred = [];
  const drafts = [];
  for (const entry of deduped) {
    if (isDraftLikeHistoryEntry(entry)) drafts.push(entry);
    else if (isRollbackWorthyHistoryEntry(entry)) preferred.push(entry);
  }

  /** @type {object[]} */
  const selected = [];
  if (preferred.length === 0) {
    // Draft-only histories: keep up to the full retention limit.
    selected.push(...drafts.slice(0, limit));
  } else {
    selected.push(...preferred.slice(0, limit));
    if (selected.length < limit && maxDraftLike > 0) {
      const room = Math.min(maxDraftLike, limit - selected.length);
      selected.push(...drafts.slice(0, room));
    }
  }

  const keepIds = new Set(selected.map((entry) => String(entry.versionId)));
  // Preserve newest-first relative order from the input array.
  return deduped.filter((entry) => keepIds.has(String(entry.versionId)));
}

/**
 * Prepend a new history entry then apply retention.
 * @param {unknown} history
 * @param {object} entry
 * @param {{ limit?: number, maxDraftLike?: number }} [options]
 * @returns {object[]}
 */
function prependEnrichmentPublishHistory(history, entry, options = {}) {
  const prior = Array.isArray(history) ? history : [];
  if (!entry || typeof entry !== "object" || !String(entry.versionId || "").trim()) {
    return trimEnrichmentPublishHistory(prior, options);
  }
  return trimEnrichmentPublishHistory([entry, ...prior], options);
}

/**
 * Apply retention to every lesson plan's enrichmentPublishHistory (store mutation helper for maintenance tools).
 * Does not touch enrichmentDraft, enrichmentPublished, dailyPlans, teachingKit, or resources.
 * @param {object} store
 * @param {{ limit?: number, maxDraftLike?: number }} [options]
 * @returns {{ plansTouched: number, entriesBefore: number, entriesAfter: number }}
 */
function pruneEnrichmentPublishHistoryInStore(store, options = {}) {
  const plans = store?.siteContent?.curriculum?.lessonPlans;
  if (!Array.isArray(plans)) {
    return { plansTouched: 0, entriesBefore: 0, entriesAfter: 0 };
  }
  let plansTouched = 0;
  let entriesBefore = 0;
  let entriesAfter = 0;
  for (const plan of plans) {
    if (!plan || typeof plan !== "object") continue;
    const before = Array.isArray(plan.enrichmentPublishHistory) ? plan.enrichmentPublishHistory : [];
    entriesBefore += before.length;
    const after = trimEnrichmentPublishHistory(before, options);
    entriesAfter += after.length;
    if (after.length !== before.length) {
      plan.enrichmentPublishHistory = after;
      plansTouched += 1;
    } else {
      plan.enrichmentPublishHistory = after;
    }
  }
  return { plansTouched, entriesBefore, entriesAfter };
}

module.exports = {
  ENRICHMENT_HISTORY_RETENTION_LIMIT,
  ENRICHMENT_HISTORY_ABSOLUTE_CEILING,
  // Back-compat alias used by older tests / docs wording.
  ENRICHMENT_HISTORY_LIMIT: ENRICHMENT_HISTORY_RETENTION_LIMIT,
  isDraftLikeHistoryEntry,
  isRollbackWorthyHistoryEntry,
  historyEntryFingerprint,
  dedupeConsecutiveHistoryEntries,
  trimEnrichmentPublishHistory,
  prependEnrichmentPublishHistory,
  pruneEnrichmentPublishHistoryInStore,
};
