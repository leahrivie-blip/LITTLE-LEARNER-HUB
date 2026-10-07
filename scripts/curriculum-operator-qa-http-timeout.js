"use strict";

const DEFAULT_QA_HTTP_TIMEOUT_MS = 900000;

/**
 * @param {string|undefined|null} raw
 * @returns {number}
 */
function parseQaHttpTimeoutMs(raw = process.env.LLH_QA_HTTP_TIMEOUT_MS) {
  if (raw == null || raw === "") return DEFAULT_QA_HTTP_TIMEOUT_MS;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_QA_HTTP_TIMEOUT_MS;
  return n;
}

module.exports = {
  DEFAULT_QA_HTTP_TIMEOUT_MS,
  parseQaHttpTimeoutMs,
};
