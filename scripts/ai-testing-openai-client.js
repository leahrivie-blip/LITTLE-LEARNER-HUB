/**
 * Phase 23 — AI Testing OpenAI client.
 *
 * A small, dependency-free wrapper around OpenAI's Responses API
 * (https://api.openai.com/v1/responses), separate from the existing
 * server/index.js Document Helper client (callOpenAiOnce/callOpenAiRaw) so
 * this new, explicitly opt-in testing pathway can never interfere with that
 * already-shipped, production-serving feature.
 *
 * - Uses Structured Outputs (`text.format = { type: "json_schema", ... }`)
 *   with `strict: true` for every call — callers never get loose text back.
 * - `store: false` unless a caller has a documented reason to pass `store: true`.
 * - Model is always read from the caller (never hardcoded here) so
 *   OPENAI_MODEL stays the single source of truth.
 * - The HTTP transport is injectable (`fetchImpl`) so every automated test in
 *   this codebase mocks the transport — no test in this repository makes a
 *   real network call to OpenAI.
 */

const DEFAULT_TIMEOUT_MS = 30000;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

class AiTestingProviderError extends Error {
  constructor(message, { code = "provider_error", retryable = false, status = 0 } = {}) {
    super(message);
    this.name = "AiTestingProviderError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const fromOutput = (data?.output || [])
    .flatMap((item) => item?.content || [])
    .map((item) => item?.text || "")
    .join("\n")
    .trim();
  return fromOutput;
}

/**
 * Calls the Responses API once with a strict JSON-schema structured output.
 *
 * @param {object} opts
 * @param {string} opts.apiKey - OPENAI_API_KEY. Never logged, never echoed back.
 * @param {string} opts.model - OPENAI_MODEL (or an admin-selected comparison model).
 * @param {string} opts.systemPrompt
 * @param {string} opts.userContent - Already-sanitized input (see ai-testing-safety.js).
 * @param {object} opts.schema - JSON schema object (see ai-testing-schemas.js). The schema
 *   name/strict wrapper is applied here so callers only pass the bare schema.
 * @param {string} opts.schemaName
 * @param {number} [opts.temperature]
 * @param {number} [opts.timeoutMs]
 * @param {boolean} [opts.store] - defaults to false (Structured Outputs testing default).
 * @param {Function} [opts.fetchImpl] - injectable transport for tests; defaults to global fetch.
 * @returns {Promise<{ parsed: object, raw: string, model: string, tokensUsed: { input: number, output: number, total: number }, latencyMs: number }>}
 */
async function callStructured({
  apiKey,
  model,
  systemPrompt,
  userContent,
  schema,
  schemaName,
  temperature = 0.4,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  store = false,
  fetchImpl,
}) {
  if (!apiKey) {
    throw new AiTestingProviderError("OPENAI_API_KEY is not configured.", { code: "missing_api_key" });
  }
  if (!model) {
    throw new AiTestingProviderError("No model was configured for this request.", { code: "missing_model" });
  }
  const transport = typeof fetchImpl === "function" ? fetchImpl : global.fetch;
  if (typeof transport !== "function") {
    throw new AiTestingProviderError("No HTTP transport is available to reach OpenAI.", { code: "no_transport" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await transport(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature,
        store,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema,
          },
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - startedAt;
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errType = String(data?.error?.type || "unknown");
      const errMsg = String(data?.error?.message || "Request failed.");
      const errCode = String(data?.error?.code || "");
      if (response.status === 401) {
        throw new AiTestingProviderError("AI testing key was rejected. Check the testing OPENAI_API_KEY.", { code: "invalid_api_key", status: 401 });
      }
      if (response.status === 429 || errCode === "insufficient_quota" || /quota|billing/i.test(errMsg)) {
        throw new AiTestingProviderError("AI testing is rate-limited or over its spending limit right now.", { code: "rate_or_budget_limited", retryable: true, status: response.status });
      }
      if (response.status >= 500) {
        throw new AiTestingProviderError("The AI service is temporarily unavailable.", { code: "provider_unavailable", retryable: true, status: response.status });
      }
      throw new AiTestingProviderError(`AI request failed (${errType}): ${errMsg}`, { code: errCode || "provider_error", status: response.status });
    }

    if (data.status === "incomplete" || data.incomplete_details) {
      throw new AiTestingProviderError("The AI response was incomplete.", { code: "incomplete_response", retryable: true });
    }

    const rawText = extractOutputText(data);
    if (!rawText) {
      throw new AiTestingProviderError("The AI did not return any content.", { code: "empty_response", retryable: true });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new AiTestingProviderError("The AI response was not valid structured JSON.", { code: "invalid_structured_output", retryable: true });
    }

    const usage = data.usage || {};
    return {
      parsed,
      raw: rawText,
      model,
      tokensUsed: {
        input: Number(usage.input_tokens || 0),
        output: Number(usage.output_tokens || 0),
        total: Number(usage.total_tokens || (Number(usage.input_tokens || 0) + Number(usage.output_tokens || 0))),
      },
      latencyMs,
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof AiTestingProviderError) throw error;
    if (error?.name === "AbortError") {
      throw new AiTestingProviderError("The AI request timed out.", { code: "timeout", retryable: true });
    }
    throw new AiTestingProviderError(error?.message || "AI request failed unexpectedly.", { code: "network_error", retryable: true });
  }
}

module.exports = {
  AiTestingProviderError,
  callStructured,
  OPENAI_RESPONSES_URL,
};
