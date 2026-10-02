"use strict";

const UNAVAILABLE_MESSAGE = "Live research is not connected yet. I can continue without current web research, or you can add an approved research provider.";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_RESULTS = 5;
/** Default live-research budget (web search often exceeds 8s on compound owner prompts). */
const TIMEOUT_MS = 22000;
const MIN_TIMEOUT_MS = 3000;
const MAX_TIMEOUT_MS = 45000;
const MAX_RESPONSE_BYTES = 120000;

function resolveResearchTimeoutMs(options = {}) {
  if (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
    return Math.min(Math.max(options.timeoutMs, 50), MAX_TIMEOUT_MS);
  }
  const fromEnv = Number(process.env.CURRICULUM_OPERATOR_RESEARCH_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv >= MIN_TIMEOUT_MS) {
    return Math.min(fromEnv, MAX_TIMEOUT_MS);
  }
  return TIMEOUT_MS;
}

/**
 * Narrow owner compound prompts to a search-friendly query (research slice only).
 * @param {string} rawCommand
 * @param {{ title?: string, theme?: string, ageBand?: string, ageLabel?: string }} [brief]
 */
function formatThemeAgeResearchQuery(theme, age) {
  const normalizedTheme = String(theme || "").trim();
  const normalizedAge = String(age || "").trim();
  const lower = normalizedTheme.toLowerCase();
  if (/\bspring\b/.test(lower) && /\bplant/.test(lower)) {
    return `Research NAEYC preschool spring garden planting and seed activities (${normalizedTheme}) for ${normalizedAge}`;
  }
  return `Research ${normalizedTheme} activities for ${normalizedAge}`;
}

/**
 * Deterministic retry query when the provider returns zero citations (research-only).
 * @param {string} primaryQuery
 * @param {{ theme?: string, title?: string, ageLabel?: string, ageBand?: string }} [brief]
 */
function buildResearchRetryQuery(primaryQuery, brief = null) {
  const theme = String(brief?.theme || brief?.title || "").trim();
  const age = String(brief?.ageLabel || brief?.ageBand || "").trim();
  const primary = String(primaryQuery || "").trim();
  if (!theme || !age) return "";
  const lower = `${theme} ${primary}`.toLowerCase();
  if (/\bspring\b/.test(lower) && /\bplant/.test(lower)) {
    const retry = `Research NAEYC playful garden planting seeds and spring activities for ${age}`;
    return retry === primary ? "" : retry.slice(0, 800);
  }
  return "";
}

function buildResearchQuery(rawCommand, brief = null) {
  const raw = String(rawCommand || "").trim();
  const theme = String(brief?.theme || brief?.title || "").trim();
  const age = String(brief?.ageLabel || brief?.ageBand || "").trim();
  if (theme && age) {
    return formatThemeAgeResearchQuery(theme, age).slice(0, 800);
  }
  const commaCreate = raw.split(/\s*,\s*(?=create\b)/i);
  if (commaCreate.length > 1 && /\bresearch\b/i.test(commaCreate[0])) {
    return commaCreate[0].trim().slice(0, 800);
  }
  const thenCreate = raw.split(/\s+then\s+(?=create\b)/i);
  if (thenCreate.length > 1 && /\bresearch\b/i.test(thenCreate[0])) {
    return thenCreate[0].trim().slice(0, 800);
  }
  if (/\bresearch\b/i.test(raw) && /\bcreate\b/i.test(raw)) {
    return raw.replace(/\s*,\s*create[\s\S]*$/i, "").trim().slice(0, 800);
  }
  return raw.slice(0, 800);
}

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
    if (Array.isArray(item?.annotations)) annotations.push(...item.annotations);
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      annotations.push(...(Array.isArray(content?.annotations) ? content.annotations : []));
    }
  }
  const seen = new Set();
  return annotations.map((annotation) => {
    const url = safeUrl(annotation?.url || annotation?.url_citation?.url);
    const title = String(annotation?.title || annotation?.url_citation?.title || "").trim().slice(0, 240)
      || (url ? url.hostname : "");
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

async function callResearchProvider({
  normalizedQuery,
  apiKey,
  fetchImpl,
  now,
  timeoutMs,
}) {
  const controller = new AbortController();
  const budgetMs = resolveResearchTimeoutMs({ timeoutMs });
  const timer = setTimeout(() => controller.abort(), budgetMs);
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
    if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) {
      return { ...researchUnavailable(normalizedQuery), code: "research_response_too_large" };
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      return { ...researchUnavailable(normalizedQuery), code: "research_malformed_response" };
    }
    const sources = normalizeSources(parsed, normalizedQuery, new Date(now()).toISOString());
    if (!sources.length) return { ...researchUnavailable(normalizedQuery), code: "research_empty_results" };
    return { ok: true, available: true, query: normalizedQuery, sources, provider: "openai_web_search" };
  } catch (error) {
    return {
      ...researchUnavailable(normalizedQuery),
      code: error?.name === "AbortError" ? "research_timeout" : "research_provider_error",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function requestResearch({
  query = "",
  apiKey = "",
  enabled = false,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  timeoutMs,
  brief = null,
} = {}) {
  const normalizedQuery = String(query || "").slice(0, 800);
  if (!enabled) return researchUnavailable(normalizedQuery);
  if (!String(apiKey || "").trim()) return { ...researchUnavailable(normalizedQuery), code: "research_api_key_missing" };
  if (typeof fetchImpl !== "function") return { ...researchUnavailable(normalizedQuery), code: "research_provider_unavailable" };
  const first = await callResearchProvider({
    normalizedQuery,
    apiKey,
    fetchImpl,
    now,
    timeoutMs,
  });
  if (first.ok || first.code !== "research_empty_results") return first;
  const retryQuery = buildResearchRetryQuery(normalizedQuery, brief);
  if (!retryQuery) return first;
  const second = await callResearchProvider({
    normalizedQuery: retryQuery,
    apiKey,
    fetchImpl,
    now,
    timeoutMs,
  });
  return second.ok ? second : first;
}

module.exports = {
  UNAVAILABLE_MESSAGE,
  OPENAI_RESPONSES_URL,
  MAX_RESULTS,
  TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  resolveResearchTimeoutMs,
  buildResearchQuery,
  buildResearchRetryQuery,
  formatThemeAgeResearchQuery,
  readiness,
  researchUnavailable,
  normalizeSources,
  requestResearch,
};
