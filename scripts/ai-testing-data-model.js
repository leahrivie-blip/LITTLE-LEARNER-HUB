/**
 * Phase 23 — AI Testing data model.
 *
 * Everything here is fake-data-only and testing-host-only (enforced by
 * scripts/ai-testing-safety.js + server/ai-testing-api.js, never by this
 * file alone). Stores: prompt template versions (with rollback), a curated
 * scenario library for the AI Evaluation Lab, run history (heuristic vs AI
 * comparisons), sanitized outcome feedback, and per-account/org rate limits.
 *
 * Nothing here ever stores an API key, a raw model "thinking"/reasoning
 * trace, or unsanitized personal data — see sanitizeFeedbackNote().
 */

const crypto = require("node:crypto");

const WORKFLOW_TYPES = Object.freeze({
  CLASSROOM_ASSISTANT: "classroom_assistant",
  PROFESSIONAL_DRAFT: "professional_draft",
  LESSON_PLAN_ASSIST: "lesson_plan_assist",
  FORM_BUILDER: "form_builder",
});

const OUTCOME_RATINGS = Object.freeze({
  HELPFUL: "helpful",
  NEEDS_CHANGES: "needs_changes",
  NOT_USABLE: "not_usable",
});

const FEEDBACK_REASONS = Object.freeze([
  "too_formal",
  "too_wordy",
  "incorrect_child",
  "incorrect_facts",
  "sounds_blaming",
  "missing_important_details",
  "not_play_based",
  "would_not_send_to_parent",
  "other",
]);

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute sliding window
const RATE_LIMIT_MAX_PER_WINDOW = 20; // per account
const RATE_LIMIT_MAX_PER_ORG_WINDOW = 50; // per organization, all accounts combined

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function listValues(map) {
  return map && typeof map === "object" ? Object.values(map) : [];
}

function ensureAiTestingStore(store) {
  store.aiTesting = store.aiTesting && typeof store.aiTesting === "object" ? store.aiTesting : {};
  const s = store.aiTesting;
  s.schemaVersion = 1;
  s.promptVersions = s.promptVersions && typeof s.promptVersions === "object" ? s.promptVersions : {};
  s.scenarios = s.scenarios && typeof s.scenarios === "object" ? s.scenarios : {};
  s.runs = s.runs && typeof s.runs === "object" ? s.runs : {};
  s.feedback = s.feedback && typeof s.feedback === "object" ? s.feedback : {};
  s.rateLimitBuckets = s.rateLimitBuckets && typeof s.rateLimitBuckets === "object" ? s.rateLimitBuckets : {};
  s.usageTotals = s.usageTotals && typeof s.usageTotals === "object" ? s.usageTotals : {
    totalRequests: 0,
    totalTokens: 0,
    estimatedCostCents: 0,
  };
  return s;
}

// ---- Prompt versioning ------------------------------------------------

function createPromptVersionRecord({ workflowType, text, schemaName, createdBy = "" }) {
  const now = nowIso();
  return {
    id: newId("promptver"),
    workflowType,
    schemaName,
    text: String(text || ""),
    createdAt: now,
    createdBy: createdBy || "system",
    active: false,
  };
}

function savePromptVersion(store, { workflowType, text, schemaName, createdBy }) {
  const s = ensureAiTestingStore(store);
  const list = Array.isArray(s.promptVersions[workflowType]) ? s.promptVersions[workflowType] : [];
  const record = createPromptVersionRecord({ workflowType, text, schemaName, createdBy });
  list.forEach((row) => { row.active = false; });
  record.active = true;
  list.push(record);
  s.promptVersions[workflowType] = list;
  return record;
}

function getActivePromptVersion(store, workflowType) {
  const s = ensureAiTestingStore(store);
  const list = Array.isArray(s.promptVersions[workflowType]) ? s.promptVersions[workflowType] : [];
  return list.find((row) => row.active) || null;
}

function listPromptVersions(store, workflowType) {
  const s = ensureAiTestingStore(store);
  return Array.isArray(s.promptVersions[workflowType]) ? [...s.promptVersions[workflowType]] : [];
}

function rollbackPromptVersion(store, { workflowType, versionId }) {
  const s = ensureAiTestingStore(store);
  const list = Array.isArray(s.promptVersions[workflowType]) ? s.promptVersions[workflowType] : [];
  const target = list.find((row) => row.id === versionId);
  if (!target) return null;
  list.forEach((row) => { row.active = false; });
  target.active = true;
  return target;
}

// ---- Rate limiting -----------------------------------------------------

/**
 * Sliding-window rate limit, checked and incremented atomically per call.
 * Returns { allowed, retryAfterMs } and never throws.
 */
function checkAndConsumeRateLimit(store, { accountEmail = "", organizationId = "" }) {
  const s = ensureAiTestingStore(store);
  const now = Date.now();
  const accountKey = `account::${String(accountEmail || "").toLowerCase()}`;
  const orgKey = `org::${String(organizationId || "")}`;

  function checkBucket(key, max) {
    const bucket = s.rateLimitBuckets[key] || { windowStart: now, count: 0 };
    if (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
      bucket.windowStart = now;
      bucket.count = 0;
    }
    const allowed = bucket.count < max;
    if (allowed) bucket.count += 1;
    s.rateLimitBuckets[key] = bucket;
    return { allowed, retryAfterMs: Math.max(0, RATE_LIMIT_WINDOW_MS - (now - bucket.windowStart)) };
  }

  const accountResult = checkBucket(accountKey, RATE_LIMIT_MAX_PER_WINDOW);
  if (!accountResult.allowed) return { allowed: false, scope: "account", ...accountResult };
  const orgResult = organizationId ? checkBucket(orgKey, RATE_LIMIT_MAX_PER_ORG_WINDOW) : { allowed: true, retryAfterMs: 0 };
  if (!orgResult.allowed) return { allowed: false, scope: "organization", ...orgResult };
  return { allowed: true, scope: "", retryAfterMs: 0 };
}

// ---- Usage / cost tracking ---------------------------------------------

// Rough, conservative per-1K-token estimate for a small/balanced testing model —
// only ever used to show the admin an approximate order of magnitude in the AI
// Evaluation Lab, never billed or reconciled against real invoices.
const ESTIMATED_CENTS_PER_1K_INPUT_TOKENS = 0.015;
const ESTIMATED_CENTS_PER_1K_OUTPUT_TOKENS = 0.06;

function estimateCostCents(tokensUsed = {}) {
  const input = Number(tokensUsed.input || 0);
  const output = Number(tokensUsed.output || 0);
  return (input / 1000) * ESTIMATED_CENTS_PER_1K_INPUT_TOKENS + (output / 1000) * ESTIMATED_CENTS_PER_1K_OUTPUT_TOKENS;
}

function recordUsage(store, { tokensUsed = {}, }) {
  const s = ensureAiTestingStore(store);
  const costCents = estimateCostCents(tokensUsed);
  s.usageTotals.totalRequests += 1;
  s.usageTotals.totalTokens += Number(tokensUsed.total || 0);
  s.usageTotals.estimatedCostCents += costCents;
  return { costCents, totals: { ...s.usageTotals } };
}

// ---- Run history (AI Evaluation Lab) -----------------------------------

function createRunRecord({
  scenarioId,
  workflowType,
  model,
  promptVersionId,
  heuristicResult,
  aiResult,
  warnings = [],
  tokensUsed = {},
  latencyMs = 0,
  costCents = 0,
  actorEmail = "",
  organizationId = "",
}) {
  return {
    id: newId("airun"),
    scenarioId,
    workflowType,
    model,
    promptVersionId,
    heuristicResult: heuristicResult ?? null,
    aiResult: aiResult ?? null,
    warnings,
    tokensUsed,
    latencyMs,
    costCents,
    actorEmail,
    organizationId,
    rating: "",
    correctedExpectedResponse: null,
    createdAt: nowIso(),
  };
}

function saveRun(store, params) {
  const s = ensureAiTestingStore(store);
  const record = createRunRecord(params);
  s.runs[record.id] = record;
  return record;
}

function rateRun(store, { runId, rating, correctedExpectedResponse = null }) {
  const s = ensureAiTestingStore(store);
  const run = s.runs[runId];
  if (!run) return null;
  run.rating = rating;
  if (correctedExpectedResponse !== null) run.correctedExpectedResponse = correctedExpectedResponse;
  run.ratedAt = nowIso();
  return run;
}

// ---- Outcome feedback (from the AI review screen, not just the Lab) ----

function sanitizeFeedbackNote(note) {
  // Testing feedback is sanitized free text: strip anything that looks like a
  // credential/token/key so a pasted screenshot-style note can never leak one,
  // even though real credentials are never sent to the AI in the first place.
  return String(note || "")
    .replace(/\b(sk-|Bearer\s+)[A-Za-z0-9_-]{8,}\b/gi, "[redacted]")
    .slice(0, 1000);
}

function saveFeedback(store, {
  workflowType,
  promptVersionId,
  model,
  rating,
  reasons = [],
  note = "",
  actorEmail = "",
  organizationId = "",
  runId = "",
}) {
  const s = ensureAiTestingStore(store);
  const record = {
    id: newId("aifeedback"),
    workflowType,
    promptVersionId,
    model,
    rating,
    reasons: (Array.isArray(reasons) ? reasons : []).filter((r) => FEEDBACK_REASONS.includes(r)),
    note: sanitizeFeedbackNote(note),
    actorEmail,
    organizationId,
    runId,
    createdAt: nowIso(),
  };
  s.feedback[record.id] = record;
  return record;
}

// ---- Scenario library ---------------------------------------------------

function ensureScenario(store, scenario) {
  const s = ensureAiTestingStore(store);
  if (!s.scenarios[scenario.id]) {
    s.scenarios[scenario.id] = { ...scenario, createdAt: nowIso() };
  }
  return s.scenarios[scenario.id];
}

function listScenarios(store) {
  const s = ensureAiTestingStore(store);
  return listValues(s.scenarios);
}

module.exports = {
  WORKFLOW_TYPES,
  OUTCOME_RATINGS,
  FEEDBACK_REASONS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_PER_WINDOW,
  RATE_LIMIT_MAX_PER_ORG_WINDOW,
  ensureAiTestingStore,
  savePromptVersion,
  getActivePromptVersion,
  listPromptVersions,
  rollbackPromptVersion,
  checkAndConsumeRateLimit,
  estimateCostCents,
  recordUsage,
  saveRun,
  rateRun,
  sanitizeFeedbackNote,
  saveFeedback,
  ensureScenario,
  listScenarios,
  newId,
  nowIso,
  listValues,
};
