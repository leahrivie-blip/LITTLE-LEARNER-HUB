/**
 * Phase 7 AI Form Builder session store.
 *
 * Stores the original provider prompt/pasted text, generated suggestion,
 * provider edits, accepted result (form id), generator mode, creation date,
 * and audit history. Never stores API keys or real child/family/staff data
 * in fixtures.
 */

const crypto = require("node:crypto");

const SESSION_STATUSES = Object.freeze({
  DRAFT_SUGGESTION: "draft_suggestion",
  ACCEPTED: "accepted",
  DISCARDED: "discarded",
});

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanLongText(value, max = 20000) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function ensureAiFormBuilderStore(store) {
  if (!store || typeof store !== "object") throw new Error("store is required");
  store.aiFormBuilder = store.aiFormBuilder && typeof store.aiFormBuilder === "object" ? store.aiFormBuilder : {};
  const afb = store.aiFormBuilder;
  afb.sessions = afb.sessions && typeof afb.sessions === "object" && !Array.isArray(afb.sessions) ? afb.sessions : {};
  afb.audit = afb.audit && typeof afb.audit === "object" && !Array.isArray(afb.audit) ? afb.audit : {};
  afb.meta = {
    ...(afb.meta && typeof afb.meta === "object" ? afb.meta : {}),
    createdAt: afb.meta?.createdAt || nowIso(),
    updatedAt: nowIso(),
    noOutboundEmail: true,
    noOutboundSms: true,
    noStripe: true,
    note: "Phase 7 AI Form Builder sessions. Live AI is disabled in testing; mock fixtures only. Never auto-publishes.",
  };
  return store;
}

function createAuditRecord({
  id = "",
  organizationId = "",
  sessionId = "",
  action = "",
  actorEmail = "",
  actorRole = "",
  message = "",
  changes = null,
} = {}) {
  return {
    id: id || newId("afbaudit"),
    organizationId: cleanText(organizationId, 160),
    sessionId: cleanText(sessionId, 160),
    action: cleanText(action, 80),
    actorEmail: cleanText(actorEmail, 180).toLowerCase(),
    actorRole: cleanText(actorRole, 80),
    message: cleanLongText(message, 1000),
    changes: changes && typeof changes === "object" ? changes : {},
    createdAt: nowIso(),
  };
}

function createSessionRecord({
  id = "",
  organizationId = "",
  createdByEmail = "",
  createdByRole = "",
  generatorMode = "mock_fixture",
  input = null,
  suggestion = null,
  review = null,
  suggestionId = "",
  label = "",
} = {}) {
  const createdAt = nowIso();
  return {
    id: id || newId("afbsess"),
    organizationId: cleanText(organizationId, 160),
    status: SESSION_STATUSES.DRAFT_SUGGESTION,
    generatorMode: cleanText(generatorMode, 60) || "mock_fixture",
    label: cleanText(label, 220) || "Testing Preview — AI Not Called.",
    aiCalled: false,
    originalPrompt: cleanLongText(input?.prompt || "", 4000),
    originalPastedText: cleanLongText(input?.pastedText || "", 20000),
    input: input && typeof input === "object" ? JSON.parse(JSON.stringify(input)) : {},
    generatedSuggestion: suggestion && typeof suggestion === "object" ? JSON.parse(JSON.stringify(suggestion)) : null,
    providerEdits: null,
    acceptedSuggestion: null,
    acceptedFormId: "",
    acceptedAt: "",
    suggestionId: cleanText(suggestionId, 160),
    review: review && typeof review === "object" ? JSON.parse(JSON.stringify(review)) : null,
    regenerateCount: 0,
    createdByEmail: cleanText(createdByEmail, 180).toLowerCase(),
    createdByRole: cleanText(createdByRole, 80),
    createdAt,
    updatedAt: createdAt,
    // Future import foundation — prepared, not overbuilt.
    importFoundation: {
      sourceType: input?.pastedText ? "pasted_text" : "plain_language",
      futureSupportedTypes: ["pdf", "word", "image", "scanned_form"],
    },
  };
}

function summarizeSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    organizationId: session.organizationId,
    status: session.status,
    generatorMode: session.generatorMode,
    label: session.label,
    aiCalled: session.aiCalled === true,
    title: session.generatedSuggestion?.title || session.acceptedSuggestion?.title || "",
    category: session.generatedSuggestion?.category || session.acceptedSuggestion?.category || "",
    acceptedFormId: session.acceptedFormId || "",
    regenerateCount: session.regenerateCount || 0,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    warningCount: session.review?.warningCount || 0,
  };
}

module.exports = {
  SESSION_STATUSES,
  ensureAiFormBuilderStore,
  createSessionRecord,
  createAuditRecord,
  summarizeSession,
  newId,
  nowIso,
  cleanText,
  cleanLongText,
};
