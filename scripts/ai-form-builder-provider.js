/**
 * Clean AI-provider interface for the Phase 7 AI Form Builder.
 *
 * A real approved AI service can be connected later by implementing
 * `generateWithLiveProvider()` without rewriting the Form Builder, the
 * session model, or the accept/save flow. For the current safe testing
 * environment, live AI calls remain disabled and a deterministic mock
 * fixture generator is used instead.
 *
 * Rules:
 * - Production must reject mock / preview AI modes.
 * - Never store API keys in this file, fixtures, logs, or responses.
 * - AI is a drafting aid only — never publish, send, sign, approve, or
 *   overwrite an existing form from here.
 */

const crypto = require("node:crypto");
const formsModel = require("./forms-center-data-model.js");
const fixtures = require("./ai-form-builder-fixtures.js");

const GENERATOR_MODES = Object.freeze({
  MOCK_FIXTURE: "mock_fixture",
  LIVE: "live",
  UNAVAILABLE: "unavailable",
});

const MAX_PROMPT_CHARS = 4000;
const MAX_PASTE_CHARS = 20000;
const PRODUCTION_HOST = "littlelearnershubbyleah.com";

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function productionSiteFromUrl(siteUrl) {
  const value = String(siteUrl || "").toLowerCase();
  return Boolean(value) && value.indexOf(PRODUCTION_HOST) !== -1;
}

function isLiveProduction(expansionEnvironment = {}) {
  const siteUrl = String(expansionEnvironment.siteUrl || process.env.SITE_URL || "");
  return expansionEnvironment.liveProduction === true || productionSiteFromUrl(siteUrl);
}

/**
 * Resolve which generator mode is allowed for this request.
 * - Live production: mock is always rejected; live AI is also rejected unless
 *   an explicitly approved future path is wired (currently never).
 * - Approved testing preview: mock fixtures are allowed; live AI stays off
 *   while DISABLE_AI_CALLS / preview-safe-mode is active.
 * - Outside approved preview with AI disabled: unavailable.
 */
function resolveGeneratorMode({
  expansionEnvironment = {},
  aiCallsDisabled = true,
  allowMockInPreview = true,
  requestedMode = "",
  // Phase 23: a SEPARATE, explicit opt-in — set only by server/ai-form-builder-api.js
  // after scripts/ai-testing-safety.js#assertAiTestingAllowed has already confirmed
  // production lock, ALLOW_OPENAI_TESTING, the stored aiTesting flag, a real key, an
  // approved caller, and an available rate-limit slot. Never set from a client-supplied
  // request field. Existing callers that never pass this get byte-for-byte identical
  // behavior to before this phase.
  aiTestingAllowed = false,
} = {}) {
  const production = isLiveProduction(expansionEnvironment);
  const previewAllowed = expansionEnvironment.allowFormsCenterAdminPreview === true && !production;
  const requested = String(requestedMode || "").trim().toLowerCase();

  if (!production && aiTestingAllowed === true) {
    return {
      mode: GENERATOR_MODES.LIVE,
      ok: true,
      code: "live_ai_testing",
      message: "Testing Preview — a real OpenAI structured response was used (fake data only).",
    };
  }

  if (production) {
    if (requested === GENERATOR_MODES.MOCK_FIXTURE || requested === "mock" || requested === "preview") {
      return {
        mode: GENERATOR_MODES.UNAVAILABLE,
        ok: false,
        code: "mock_ai_forbidden_in_production",
        message: "Mock AI mode is not available in production.",
      };
    }
    return {
      mode: GENERATOR_MODES.UNAVAILABLE,
      ok: false,
      code: "ai_unavailable_in_production",
      message: "AI Form Builder is not available in production yet.",
    };
  }

  if (aiCallsDisabled) {
    if (previewAllowed && allowMockInPreview) {
      return {
        mode: GENERATOR_MODES.MOCK_FIXTURE,
        ok: true,
        code: "mock_fixture",
        message: "Testing Preview — AI Not Called. Showing deterministic fake suggestions.",
      };
    }
    return {
      mode: GENERATOR_MODES.UNAVAILABLE,
      ok: false,
      code: "ai_calls_disabled",
      message: "AI Form Builder is unavailable because AI calls are disabled. Ask an administrator to enable an approved testing preview, or connect an approved AI provider later.",
    };
  }

  // Live AI path is reserved for a future approved connection. Until then,
  // approved preview still falls back to the mock fixture so the complete
  // interface remains testable without calling a real AI service.
  if (previewAllowed && allowMockInPreview) {
    return {
      mode: GENERATOR_MODES.MOCK_FIXTURE,
      ok: true,
      code: "mock_fixture_while_live_unwired",
      message: "Testing Preview — AI Not Called. A live AI provider is not connected yet.",
    };
  }

  return {
    mode: GENERATOR_MODES.UNAVAILABLE,
    ok: false,
    code: "ai_provider_not_configured",
    message: "AI Form Builder is unavailable because no approved AI provider is configured.",
  };
}

/**
 * Strip / neutralize common prompt-injection patterns. The generator never
 * executes instructions from pasted text — it only extracts form structure.
 */
function sanitizeProviderInput(text) {
  const raw = String(text || "");
  return raw
    .replace(/\r\n/g, "\n")
    // Neutralize obvious instruction-override attempts without deleting the
    // surrounding form content the provider intended to paste.
    .replace(/(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|system)\s+instructions?/gi, "[instruction removed]")
    .replace(/(?:reveal|print|show)\s+(?:the\s+)?(?:api\s*key|secret|password|token|admin\s*code)/gi, "[sensitive request removed]")
    .replace(/(?:access|open|switch\s+to)\s+(?:another|other|different)\s+organization/gi, "[cross-org request removed]")
    .replace(/(?:publish|send|approve|sign|void)\s+(?:this\s+)?(?:form|response|assignment)/gi, "[action request removed]")
    .slice(0, Math.max(MAX_PROMPT_CHARS, MAX_PASTE_CHARS));
}

function validateGenerateInput(body = {}) {
  const errors = [];
  const prompt = sanitizeProviderInput(body.prompt || body.description || "").slice(0, MAX_PROMPT_CHARS);
  const pastedText = sanitizeProviderInput(body.pastedText || body.paste || "").slice(0, MAX_PASTE_CHARS);
  if (!prompt && !pastedText) {
    errors.push({ field: "prompt", message: "Describe the form you need, or paste an existing form/policy text." });
  }
  if ((body.prompt || body.description || "").length > MAX_PROMPT_CHARS) {
    errors.push({ field: "prompt", message: `Keep the description under ${MAX_PROMPT_CHARS} characters.` });
  }
  if ((body.pastedText || body.paste || "").length > MAX_PASTE_CHARS) {
    errors.push({ field: "pastedText", message: `Keep pasted text under ${MAX_PASTE_CHARS} characters.` });
  }
  const category = formsModel.normalizeCategory(body.category || formsModel.FORM_CATEGORIES.CUSTOM);
  const intendedRecipient = ["child", "guardian", "staff", "classroom", "program", "family"].includes(String(body.intendedRecipient || "").toLowerCase())
    ? String(body.intendedRecipient).toLowerCase()
    : "guardian";
  const involves = {
    child: body.involves?.child === true || body.involvesChild === true,
    guardian: body.involves?.guardian === true || body.involvesGuardian === true,
    staff: body.involves?.staff === true || body.involvesStaff === true,
    classroom: body.involves?.classroom === true || body.involvesClassroom === true,
    program: body.involves?.program === true || body.involvesProgram === true,
  };
  if (!involves.child && !involves.guardian && !involves.staff && !involves.classroom && !involves.program) {
    if (intendedRecipient === "staff") involves.staff = true;
    else if (intendedRecipient === "classroom") involves.classroom = true;
    else if (intendedRecipient === "program") involves.program = true;
    else if (intendedRecipient === "child") involves.child = true;
    else involves.guardian = true;
  }
  const requestOptions = {
    signatures: body.requestSignatures !== false,
    initials: body.requestInitials === true,
    acknowledgments: body.requestAcknowledgments !== false,
    dates: body.requestDates !== false,
    attachments: body.requestAttachments === true,
    conditionalQuestions: body.requestConditionalQuestions === true,
  };
  return {
    ok: errors.length === 0,
    errors,
    input: {
      prompt,
      pastedText,
      category,
      intendedRecipient,
      involves,
      requestOptions,
      filingDestination: ["child", "staff", "classroom", "program"].includes(String(body.filingDestination || "").toLowerCase())
        ? String(body.filingDestination).toLowerCase()
        : (involves.child ? "child" : involves.staff ? "staff" : involves.classroom ? "classroom" : "program"),
    },
  };
}

/**
 * Live provider — Phase 23 AI Testing pathway. Only reached when
 * resolveGeneratorMode() already decided LIVE mode (i.e. aiTestingAllowed
 * was true and this is not production). Falls back to the mock fixture —
 * never a thrown error the provider has to deal with — if the AI call
 * itself is unavailable, invalid, or times out, since Form Builder's own
 * safe default is already a good, complete draft.
 */
async function generateWithLiveProvider(input, context = {}) {
  const aiService = require("./ai-testing-service.js");
  const params = context.aiServiceParams || {};
  const text = [input.prompt, input.pastedText].filter(Boolean).join("\n\n");
  const outcome = await aiService.draftForm({
    store: params.store,
    env: params.env,
    text,
    accountEmail: params.accountEmail,
    organizationId: params.organizationId,
    isVerifiedAdmin: params.isVerifiedAdmin,
    isFakeAccountSession: params.isFakeAccountSession,
    storedFlags: params.storedFlags,
    fetchImpl: params.fetchImpl,
  });
  if (!outcome.ok) {
    // Never a false success and never a lost request — hand back the same
    // deterministic mock fixture Form Builder already relies on, with a
    // clear label so the provider knows AI was attempted but unavailable.
    const suggestion = fixtures.buildMockSuggestion(input);
    suggestion.generatorLabel = `AI suggestion unavailable (${outcome.error || "unknown reason"}) — showing the local draft instead.`;
    suggestion.liveAiUnavailableReason = outcome.error || "";
    return suggestion;
  }
  const ai = outcome.result;
  return {
    title: ai.title,
    description: ai.description,
    providerInstructions: "Review every field before publishing or sending — this AI draft is a starting point only.",
    familyInstructions: "",
    category: ai.category,
    intendedRecipient: input.intendedRecipient,
    filingDestination: input.filingDestination,
    reviewReminder: "Review and edit this AI-generated draft before it is ever published or sent to a family.",
    expirationReminder: "",
    disclaimer: ai.reviewDisclaimer || "This draft does not automatically satisfy any licensing or legal requirement — review with your program's policies.",
    scenario: "ai_testing_live",
    generatorLabel: "Testing Preview — a real OpenAI structured response was used (fake data only).",
    originalPrompt: input.prompt || "",
    originalPastedText: input.pastedText || "",
    importFoundation: {
      sourceType: "plain_language",
      futureSupportedTypes: ["pdf", "word", "image", "scanned_form"],
      note: "Pasted/typed text only in this testing phase.",
    },
    sections: (ai.sections || []).map((section, sectionIndex) => ({
      title: section.title,
      description: "",
      fields: (section.fields || []).map((field, fieldIndex) => ({
        tempKey: `field_${sectionIndex}_${fieldIndex}`,
        type: field.fieldType === "long_text" ? "long_text"
          : field.fieldType === "checkbox" ? "checkbox"
          : field.fieldType === "date" ? "date"
          : field.fieldType === "signature" ? "signature"
          : field.fieldType === "select" ? "select"
          : "short_text",
        label: field.label,
        helpText: "",
        required: field.required === true,
        options: [],
        conditionalOn: null,
        confidence: 0.7,
      })),
    })),
    aiModel: outcome.model,
    aiPromptVersionId: outcome.promptVersionId,
  };
}

/**
 * Generate a structured form suggestion. Never publishes, sends, signs,
 * approves, or overwrites an existing form.
 */
async function generateFormSuggestion(rawBody = {}, context = {}) {
  const modeDecision = resolveGeneratorMode(context);
  if (!modeDecision.ok) {
    const error = new Error(modeDecision.message);
    error.code = modeDecision.code;
    error.status = modeDecision.code.indexOf("production") !== -1 ? 403 : 503;
    throw error;
  }

  const validated = validateGenerateInput(rawBody);
  if (!validated.ok) {
    const error = new Error(validated.errors[0]?.message || "Invalid AI Form Builder input.");
    error.code = "invalid_input";
    error.status = 400;
    error.errors = validated.errors;
    throw error;
  }

  let suggestion;
  if (modeDecision.mode === GENERATOR_MODES.LIVE) {
    suggestion = await generateWithLiveProvider(validated.input, context);
  } else {
    suggestion = fixtures.buildMockSuggestion(validated.input);
  }

  return {
    mode: modeDecision.mode,
    label: modeDecision.message,
    aiCalled: modeDecision.mode === GENERATOR_MODES.LIVE && !suggestion.liveAiUnavailableReason,
    input: validated.input,
    suggestion,
    suggestionId: `aigensug_${crypto.randomBytes(8).toString("hex")}`,
  };
}

module.exports = {
  GENERATOR_MODES,
  MAX_PROMPT_CHARS,
  MAX_PASTE_CHARS,
  resolveGeneratorMode,
  sanitizeProviderInput,
  validateGenerateInput,
  generateFormSuggestion,
  generateWithLiveProvider,
  isLiveProduction,
  truthy,
};
