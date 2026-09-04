/**
 * Classified, bounded OpenAI/fetch transport for Operator AI calls.
 * Never logs secrets. Permanent errors do not retry.
 */
"use strict";

const ERROR_CATEGORIES = Object.freeze({
  TRANSIENT_NETWORK: "TRANSIENT_NETWORK",
  TIMEOUT: "TIMEOUT",
  RATE_LIMIT: "RATE_LIMIT",
  AUTH_FAILURE: "AUTH_FAILURE",
  INVALID_REQUEST: "INVALID_REQUEST",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  MODEL_ERROR: "MODEL_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
});

function classifyAiError(error, response = null) {
  const status = Number(response?.status || error?.status || 0);
  const message = String(error?.message || error || "");
  if (status === 401 || status === 403) return ERROR_CATEGORIES.AUTH_FAILURE;
  if (status === 429) return ERROR_CATEGORIES.RATE_LIMIT;
  if (status === 400 || status === 422) return ERROR_CATEGORIES.INVALID_REQUEST;
  if (status >= 500) return ERROR_CATEGORIES.MODEL_ERROR;
  if (/timeout|aborted|abort/i.test(message)) return ERROR_CATEGORIES.TIMEOUT;
  if (/fetch failed|econn|enotfound|network|socket/i.test(message)) return ERROR_CATEGORIES.TRANSIENT_NETWORK;
  if (/invalid json|schema|malformed/i.test(message)) return ERROR_CATEGORIES.INVALID_RESPONSE;
  return ERROR_CATEGORIES.INTERNAL_ERROR;
}

function isRetryable(category) {
  return category === ERROR_CATEGORIES.TRANSIENT_NETWORK
    || category === ERROR_CATEGORIES.TIMEOUT
    || category === ERROR_CATEGORIES.RATE_LIMIT;
}

function retryDelayMs(attempt, category, retryAfterSeconds) {
  if (category === ERROR_CATEGORIES.RATE_LIMIT && Number(retryAfterSeconds) > 0) {
    return Math.min(8000, Number(retryAfterSeconds) * 1000);
  }
  const base = Math.min(4000, 250 * (2 ** attempt));
  const jitter = Math.floor(Math.random() * 120);
  return base + jitter;
}

function ownerSafeAiError(error, category) {
  const label = category || classifyAiError(error);
  const hints = {
    TRANSIENT_NETWORK: "The AI service could not be reached. Try again in a moment.",
    TIMEOUT: "The AI service timed out before finishing.",
    RATE_LIMIT: "The AI service is busy. Wait briefly, then resume the same job.",
    AUTH_FAILURE: "AI is not authorized in this environment. Draft was not changed.",
    INVALID_REQUEST: "The AI request was rejected. Draft was not changed.",
    INVALID_RESPONSE: "The AI response was not usable. Draft was not changed.",
    MODEL_ERROR: "The AI service returned an error. Draft was not changed.",
    INTERNAL_ERROR: "AI work failed before any draft change.",
  };
  return {
    category: label,
    message: hints[label] || "AI work failed before any draft change.",
    retryable: isRetryable(label),
  };
}

async function callWithBoundedRetry(runOnce, options = {}) {
  const maxAttempts = Math.max(1, Math.min(4, Number(options.maxAttempts) || 3));
  const sleep = typeof options.sleep === "function" ? options.sleep : (ms) => new Promise((r) => setTimeout(r, ms));
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await runOnce(attempt);
    } catch (error) {
      lastError = error;
      const category = error?.category || classifyAiError(error, error?.response || null);
      error.category = category;
      if (!isRetryable(category) || attempt === maxAttempts - 1) throw error;
      const wait = retryDelayMs(attempt, category, error?.retryAfterSeconds);
      await sleep(wait);
    }
  }
  throw lastError;
}

function summarizeAiHealth(input = {}) {
  return {
    configured: input.configured === true,
    reachable: input.reachable === true,
    model: input.model ? String(input.model).slice(0, 80) : "",
    lastErrorCategory: input.lastErrorCategory || "",
    requestId: input.requestId ? String(input.requestId).slice(0, 80) : "",
    timestamp: input.timestamp || new Date().toISOString(),
  };
}

module.exports = {
  ERROR_CATEGORIES,
  classifyAiError,
  isRetryable,
  retryDelayMs,
  ownerSafeAiError,
  callWithBoundedRetry,
  summarizeAiHealth,
};
