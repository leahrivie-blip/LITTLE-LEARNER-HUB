/**
 * Phase 23 — AI Testing service layer.
 *
 * Orchestrates the safety gate, prompt versioning, structured-output client,
 * and per-workflow adapters. This is the ONLY place server/ai-testing-api.js
 * and the Classroom Assistant integration should call into — it is also
 * what scripts/test-ai-testing-*.js mocks the transport for.
 *
 * Failure handling (required everywhere): the provider's original entry is
 * never lost, a failed/invalid AI call never silently reports success, and
 * every caller gets a clear, typed reason plus whether a retry or the local
 * heuristic fallback is appropriate.
 */

const safety = require("./ai-testing-safety.js");
const client = require("./ai-testing-openai-client.js");
const schemas = require("./ai-testing-schemas.js");
const prompts = require("./ai-testing-prompts.js");
const aiModel = require("./ai-testing-data-model.js");
const caModel = require("./classroom-assistant-data-model.js");
const caAdapter = require("./ai-testing-classroom-assistant-adapter.js");

const RETRYABLE_CODES = new Set(["timeout", "provider_unavailable", "incomplete_response", "empty_response", "invalid_structured_output", "network_error"]);

function resolvePromptText(store, workflowType) {
  const active = aiModel.getActivePromptVersion(store, workflowType);
  if (active) return { text: active.text, versionId: active.id };
  const seeded = aiModel.savePromptVersion(store, {
    workflowType,
    text: prompts.DEFAULT_PROMPTS[workflowType],
    schemaName: schemas.SCHEMAS_BY_WORKFLOW[workflowType]?.name || workflowType,
    createdBy: "system_default",
  });
  return { text: seeded.text, versionId: seeded.id };
}

/**
 * Generic single structured call with one automatic retry on a retryable
 * failure. Never throws — always resolves to { ok, ... }.
 */
async function callWorkflow({
  store,
  env,
  workflowType,
  userContent,
  accountEmail,
  organizationId,
  isVerifiedAdmin = false,
  isFakeAccountSession = false,
  modelOverride = "",
  fetchImpl,
  storedFlags = {},
}) {
  const gate = safety.assertAiTestingAllowed({
    env, storedFlags, isVerifiedAdmin, isFakeAccountSession, accountEmail, organizationId, store,
  });
  if (!gate.allowed) {
    return { ok: false, unavailable: true, status: gate.status, error: gate.payload?.error || "AI testing is unavailable.", code: gate.payload?.code || "unavailable" };
  }

  const { text: promptText, versionId } = resolvePromptText(store, workflowType);
  const schemaEntry = schemas.SCHEMAS_BY_WORKFLOW[workflowType];
  if (!schemaEntry) {
    return { ok: false, unavailable: true, error: `No schema is configured for workflow "${workflowType}".`, code: "unknown_workflow" };
  }
  const sanitizedContent = typeof userContent === "string" ? userContent : JSON.stringify(safety.sanitizeForAi(userContent));
  const model = modelOverride || gate.model;

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await client.callStructured({
        apiKey: gate.apiKey,
        model,
        systemPrompt: promptText,
        userContent: sanitizedContent,
        schema: schemaEntry.schema,
        schemaName: schemaEntry.name,
        store: false,
        fetchImpl,
      });
      const usage = aiModel.recordUsage(store, { tokensUsed: result.tokensUsed });
      return {
        ok: true,
        result: result.parsed,
        model,
        promptVersionId: versionId,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
        costCents: usage.costCents,
        attempt: attempt + 1,
      };
    } catch (error) {
      lastError = error;
      if (!(error instanceof client.AiTestingProviderError) || !error.retryable || attempt === 1) break;
    }
  }
  return {
    ok: false,
    unavailable: false,
    error: lastError?.message || "AI request failed.",
    code: lastError?.code || "provider_error",
    retryable: Boolean(lastError?.retryable),
    promptVersionId: versionId,
    model,
  };
}

/**
 * Classroom Assistant: runs the existing heuristic parser (always — it is
 * the safe, proven fallback and comparison baseline) and, if AI testing is
 * allowed, ALSO runs the structured AI interpretation. Never silently drops
 * the heuristic result; the caller/UI decides which one to present or lets
 * the provider compare both.
 */
async function interpretClassroomAssistantEntry({
  store, env, text, organizationId, children = [], checkedInIds = [],
  accountEmail, isVerifiedAdmin, isFakeAccountSession, modelOverride, fetchImpl, storedFlags,
}) {
  const heuristicPlan = caModel.parseNaturalNote(text, { organizationId, children, checkedInIds });

  const childContext = (children || []).map((c) => ({ name: c.name || c.displayName || "", id: c.id || c.childId || "" }));
  const userContent = JSON.stringify({
    providerNote: String(text || "").slice(0, 3000),
    childrenCheckedIn: childContext.filter((c) => (checkedInIds || []).map(String).includes(String(c.id))),
    allClassroomChildren: childContext,
  });

  const aiOutcome = await callWorkflow({
    store, env, workflowType: aiModel.WORKFLOW_TYPES.CLASSROOM_ASSISTANT, userContent,
    accountEmail, organizationId, isVerifiedAdmin, isFakeAccountSession, modelOverride, fetchImpl, storedFlags,
  });

  if (!aiOutcome.ok) {
    return {
      ok: true,
      usedFallback: true,
      heuristicPlan,
      aiPlan: null,
      aiUnavailableReason: aiOutcome.error,
      aiUnavailableCode: aiOutcome.code,
      aiUnavailable: aiOutcome.unavailable === true,
    };
  }

  const aiPlan = caAdapter.buildPlanFromAiResult(aiOutcome.result, {
    organizationId, children, checkedInIds, sourceText: text, model: aiOutcome.model, promptVersionId: aiOutcome.promptVersionId,
  });

  return {
    ok: true,
    usedFallback: false,
    heuristicPlan,
    aiPlan,
    aiRawResult: aiOutcome.result,
    model: aiOutcome.model,
    promptVersionId: aiOutcome.promptVersionId,
    tokensUsed: aiOutcome.tokensUsed,
    latencyMs: aiOutcome.latencyMs,
    costCents: aiOutcome.costCents,
  };
}

async function generateProfessionalDraft({ store, env, text, draftType, accountEmail, organizationId, isVerifiedAdmin, isFakeAccountSession, modelOverride, fetchImpl, storedFlags }) {
  const userContent = JSON.stringify({ providerNote: String(text || "").slice(0, 3000), requestedDraftType: draftType || "" });
  return callWorkflow({
    store, env, workflowType: aiModel.WORKFLOW_TYPES.PROFESSIONAL_DRAFT, userContent,
    accountEmail, organizationId, isVerifiedAdmin, isFakeAccountSession, modelOverride, fetchImpl, storedFlags,
  });
}

async function assistLessonPlan({ store, env, text, accountEmail, organizationId, isVerifiedAdmin, isFakeAccountSession, modelOverride, fetchImpl, storedFlags }) {
  const userContent = JSON.stringify({ pastedOrDescribedText: String(text || "").slice(0, 6000) });
  return callWorkflow({
    store, env, workflowType: aiModel.WORKFLOW_TYPES.LESSON_PLAN_ASSIST, userContent,
    accountEmail, organizationId, isVerifiedAdmin, isFakeAccountSession, modelOverride, fetchImpl, storedFlags,
  });
}

async function draftForm({ store, env, text, accountEmail, organizationId, isVerifiedAdmin, isFakeAccountSession, modelOverride, fetchImpl, storedFlags }) {
  const userContent = JSON.stringify({ plainLanguageRequest: String(text || "").slice(0, 3000) });
  return callWorkflow({
    store, env, workflowType: aiModel.WORKFLOW_TYPES.FORM_BUILDER, userContent,
    accountEmail, organizationId, isVerifiedAdmin, isFakeAccountSession, modelOverride, fetchImpl, storedFlags,
  });
}

module.exports = {
  callWorkflow,
  interpretClassroomAssistantEntry,
  generateProfessionalDraft,
  assistLessonPlan,
  draftForm,
  resolvePromptText,
  RETRYABLE_CODES,
};
