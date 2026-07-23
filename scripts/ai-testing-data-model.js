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
// Deliberately conservative initial limits for a brand-new testing feature —
// easy to raise later once real usage patterns are understood, hard to walk
// back a surprise bill from limits that started too generous. Overridable
// via env ONLY for automated tests that need to exercise many functional
// (non-rate-limit) checks in one process without incidentally tripping the
// default limit — every test that verifies the limiting behavior itself
// uses its own dedicated server with the real, un-overridden defaults below.
const RATE_LIMIT_MAX_PER_WINDOW = Number(process.env.AI_TESTING_RATE_LIMIT_PER_TESTER || 5); // per tester (account), per minute
const RATE_LIMIT_MAX_PER_ORG_WINDOW = Number(process.env.AI_TESTING_RATE_LIMIT_PER_ORG_MINUTE || 20); // per organization (all accounts combined), per minute
const RATE_LIMIT_MAX_PER_ORG_DAY = Number(process.env.AI_TESTING_RATE_LIMIT_PER_ORG_DAY || 200); // per organization (all accounts combined), per rolling 24h — a second, independent ceiling so even many short bursts across a day can't add up to runaway usage
const RATE_LIMIT_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

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
 * Sliding-window rate limits, checked and incremented atomically per call.
 * Three independent ceilings, checked in order from tightest/shortest to
 * loosest/longest: per-tester-per-minute, per-organization-per-minute, and
 * per-organization-per-day. Any one of them being exceeded denies the
 * request — this never partially allows a call. Returns
 * { allowed, scope, retryAfterMs } and never throws.
 */
function checkAndConsumeRateLimit(store, { accountEmail = "", organizationId = "" }) {
  const s = ensureAiTestingStore(store);
  const now = Date.now();
  const accountKey = `account::${String(accountEmail || "").toLowerCase()}`;
  const orgKey = `org::${String(organizationId || "")}`;
  const orgDayKey = `org-day::${String(organizationId || "")}`;

  function checkBucket(key, max, windowMs) {
    const bucket = s.rateLimitBuckets[key] || { windowStart: now, count: 0 };
    if (now - bucket.windowStart > windowMs) {
      bucket.windowStart = now;
      bucket.count = 0;
    }
    const allowed = bucket.count < max;
    if (allowed) bucket.count += 1;
    s.rateLimitBuckets[key] = bucket;
    return { allowed, retryAfterMs: Math.max(0, windowMs - (now - bucket.windowStart)) };
  }

  const accountResult = checkBucket(accountKey, RATE_LIMIT_MAX_PER_WINDOW, RATE_LIMIT_WINDOW_MS);
  if (!accountResult.allowed) return { allowed: false, scope: "account", ...accountResult };
  const orgResult = organizationId ? checkBucket(orgKey, RATE_LIMIT_MAX_PER_ORG_WINDOW, RATE_LIMIT_WINDOW_MS) : { allowed: true, retryAfterMs: 0 };
  if (!orgResult.allowed) return { allowed: false, scope: "organization", ...orgResult };
  const orgDayResult = organizationId ? checkBucket(orgDayKey, RATE_LIMIT_MAX_PER_ORG_DAY, RATE_LIMIT_DAY_WINDOW_MS) : { allowed: true, retryAfterMs: 0 };
  if (!orgDayResult.allowed) return { allowed: false, scope: "organization_daily", ...orgDayResult };
  return { allowed: true, scope: "", retryAfterMs: 0 };
}

/**
 * Admin-facing, fully sanitized rate-limit/usage breakdown by organization —
 * counts and numbers only (organization id, current per-minute/per-day
 * bucket counts against their max, and time-to-reset). NEVER includes a
 * prompt, a completion, a tester's free-text entry, or any other private
 * provider request/response content — those only ever appear in an
 * explicit AI Evaluation Lab scenario run the admin chose to look at, never
 * in this aggregate usage view.
 */
function rateLimitStatusForAdmin(store) {
  const s = ensureAiTestingStore(store);
  const now = Date.now();
  const byOrg = {};
  Object.entries(s.rateLimitBuckets).forEach(([key, bucket]) => {
    const separatorIndex = key.indexOf("::");
    if (separatorIndex === -1) return;
    const scope = key.slice(0, separatorIndex);
    const rest = key.slice(separatorIndex + 2);
    if (scope !== "org" && scope !== "org-day") return;
    const organizationId = rest;
    if (!organizationId) return;
    byOrg[organizationId] = byOrg[organizationId] || { organizationId, perMinute: null, perDay: null };
    const windowMs = scope === "org-day" ? RATE_LIMIT_DAY_WINDOW_MS : RATE_LIMIT_WINDOW_MS;
    const active = now - bucket.windowStart <= windowMs;
    const entry = {
      count: active ? bucket.count : 0,
      max: scope === "org-day" ? RATE_LIMIT_MAX_PER_ORG_DAY : RATE_LIMIT_MAX_PER_ORG_WINDOW,
      resetInMs: active ? Math.max(0, windowMs - (now - bucket.windowStart)) : 0,
    };
    if (scope === "org-day") byOrg[organizationId].perDay = entry;
    else byOrg[organizationId].perMinute = entry;
  });
  return Object.values(byOrg).sort((a, b) => a.organizationId.localeCompare(b.organizationId));
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
  RATE_LIMIT_MAX_PER_ORG_DAY,
  RATE_LIMIT_DAY_WINDOW_MS,
  ensureAiTestingStore,
  savePromptVersion,
  getActivePromptVersion,
  listPromptVersions,
  rollbackPromptVersion,
  checkAndConsumeRateLimit,
  rateLimitStatusForAdmin,
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
