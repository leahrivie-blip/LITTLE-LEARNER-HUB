"use strict";

const UNAVAILABLE_MESSAGE = "Live research is not connected yet. I can continue without current web research, or you can add an approved research provider.";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_RESULTS = 5;
const TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 120000;

// Live research is opt-in: OPENAI_API_KEY and CURRICULUM_OPERATOR_LIVE_RESEARCH_ENABLED=true.
function readiness({ enabled = false, apiKey = "" } = {}) {
  if (!enabled) return { status: "disabled", available: false };
  if (!String(apiKey || "").trim()) return { status: "missing_api_key", available: false };
  return { status: "ready", available: true };
}

function researchUnavailable(query = "") {
  return {
    ok: false,
    available: false,
    code: "research_provider_unavailable",
    query: String(query || "").slice(0, 800),
    sources: [],
    message: UNAVAILABLE_MESSAGE,
  };
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url : null;
  } catch (_error) {
    return null;
  }
}

function normalizeSources(response = {}, query = "", retrievedAt = new Date().toISOString()) {
  const annotations = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      annotations.push(...(Array.isArray(content?.annotations) ? content.annotations : []));
    }
  }
  const seen = new Set();
  return annotations.map((annotation) => {
    const url = safeUrl(annotation?.url || annotation?.url_citation?.url);
    const title = String(annotation?.title || annotation?.url_citation?.title || "").trim().slice(0, 240);
    if (!url || !title || seen.has(url.href)) return null;
    seen.add(url.href);
    return {
      query: String(query).slice(0, 800),
      title,
      url: url.href,
      source: url.hostname,
      publicationDate: null,
      retrievedAt,
      provider: "openai_web_search",
      summary: String(annotation?.text || "").trim().slice(0, 500),
      sourceId: `openai:${url.href}`,
    };
  }).filter(Boolean).slice(0, MAX_RESULTS);
}

async function requestResearch({ query = "", apiKey = "", enabled = false, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const normalizedQuery = String(query || "").slice(0, 800);
  if (!enabled) return researchUnavailable(normalizedQuery);
  if (!String(apiKey || "").trim()) return { ...researchUnavailable(normalizedQuery), code: "research_api_key_missing" };
  if (typeof fetchImpl !== "function") return { ...researchUnavailable(normalizedQuery), code: "research_provider_unavailable" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        tools: [{ type: "web_search_preview" }],
        tool_choice: "required",
        input: `Find current early-childhood education inspiration for this owner request. Return only short factual guidance with citations; do not copy source passages. Request: ${normalizedQuery}`,
        max_output_tokens: 700,
      }),
    });
    if (!response.ok) return { ...researchUnavailable(normalizedQuery), code: "research_provider_error" };
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) return { ...researchUnavailable(normalizedQuery), code: "research_response_too_large" };
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_error) { return { ...researchUnavailable(normalizedQuery), code: "research_malformed_response" }; }
    const sources = normalizeSources(parsed, normalizedQuery, new Date(now()).toISOString());
    if (!sources.length) return { ...researchUnavailable(normalizedQuery), code: "research_empty_results" };
    return { ok: true, available: true, query: normalizedQuery, sources, provider: "openai_web_search" };
  } catch (error) {
    return { ...researchUnavailable(normalizedQuery), code: error?.name === "AbortError" ? "research_timeout" : "research_provider_error" };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { UNAVAILABLE_MESSAGE, OPENAI_RESPONSES_URL, MAX_RESULTS, TIMEOUT_MS, readiness, researchUnavailable, normalizeSources, requestResearch };
