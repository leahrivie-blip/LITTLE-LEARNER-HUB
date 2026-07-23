/**
 * Phase 23 — AI Testing safety gate.
 *
 * A request may reach the real OpenAI Responses API ONLY when every one of
 * these is true at the same time:
 *   1. Non-production hostname (SITE_URL does not resolve to the live site).
 *   2. ALLOW_OPENAI_TESTING=true (env) — a separate, explicit opt-in from the
 *      existing ALLOW_*_ADMIN_PREVIEW flags, which intentionally still force
 *      the ORIGINAL Document Helper / admin AI features off in preview mode.
 *   3. DISABLE_AI_CALLS is not explicitly true — the existing global AI kill
 *      switch always wins, even over ALLOW_OPENAI_TESTING.
 *   4. OPENAI_API_KEY is configured.
 *   5. The stored "aiTesting" feature flag is on (an explicit admin toggle,
 *      same pattern as directorCenter/formsCenter/testingLab).
 *   6. The caller is a verified admin OR an authenticated fake account in a
 *      fake organization (never a real member session).
 *   7. The account/organization has not exceeded its rate limit.
 *
 * If ANY of these is false, callers must fall back to the existing local
 * heuristic system — this module never partially allows a request.
 */

const expansionFlags = require("./expansion-feature-flags.js");
const aiTestingModel = require("./ai-testing-data-model.js");

function truthyEnv(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

/**
 * Resolves whether AI Testing is switched on for this deployment at all
 * (env + stored flag), independent of who is asking. Mirrors the shape of
 * scripts/expansion-feature-flags.js's evaluateExpansionAccess for the other
 * expansion features, reusing its production-lock logic exactly.
 */
function resolveAiTestingAccess({ env = process.env, storedFlags = {}, isVerifiedAdmin = false, isFakeAccountSession = false } = {}) {
  const environment = expansionFlags.resolveExpansionEnvironment({ env });
  const access = expansionFlags.evaluateExpansionAccess({
    flagKey: expansionFlags.EXPANSION_FEATURE_KEYS.AI_TESTING,
    storedFlags,
    environment,
    // Fake-account testing sessions count the same as a verified admin for this
    // one purpose only — they are still rejected outright on production by the
    // environment check above, and every fake account is itself rejected on
    // production by the existing family-foundation checks.
    isVerifiedAdmin: isVerifiedAdmin === true || isFakeAccountSession === true,
  });
  return { ...access, environment };
}

function hasRealOpenAiKey(env = process.env) {
  return Boolean(String(env.OPENAI_API_KEY || "").trim());
}

/**
 * The single entry point every AI-testing route handler must call before
 * doing anything else. Returns { allowed: true, model } or
 * { allowed: false, status, payload } — never throws.
 */
function assertAiTestingAllowed({
  env = process.env,
  storedFlags = {},
  isVerifiedAdmin = false,
  isFakeAccountSession = false,
  accountEmail = "",
  organizationId = "",
  store = null,
} = {}) {
  const access = resolveAiTestingAccess({ env, storedFlags, isVerifiedAdmin, isFakeAccountSession });
  if (!access.allowed) {
    return { allowed: false, status: access.status, payload: access.payload };
  }
  if (!hasRealOpenAiKey(env)) {
    return {
      allowed: false,
      status: 503,
      payload: { error: "AI testing is enabled but no testing OPENAI_API_KEY is configured yet.", code: "missing_api_key" },
    };
  }
  if (store) {
    const rate = aiTestingModel.checkAndConsumeRateLimit(store, { accountEmail, organizationId });
    if (!rate.allowed) {
      return {
        allowed: false,
        status: 429,
        payload: {
          error: `AI testing rate limit reached for this ${rate.scope}. Try again in a few seconds.`,
          code: "rate_limited",
          scope: rate.scope,
          retryAfterMs: rate.retryAfterMs,
        },
      };
    }
  }
  return {
    allowed: true,
    model: String(env.OPENAI_MODEL || "gpt-4o-mini"),
    apiKey: String(env.OPENAI_API_KEY || ""),
  };
}

// ---- Input sanitization -------------------------------------------------

// Fields that must never be forwarded to the AI provider, even accidentally,
// no matter which object shape a caller passes in.
const NEVER_SEND_KEYS = new Set([
  "password", "passwordhash", "temppasswordhash", "apikey", "api_key", "token",
  "membersessiontoken", "admintoken", "authorization", "signature", "signaturedata",
  "ssn", "creditcard", "cardnumber", "cvv", "bankaccount", "routingnumber",
  "privatestaffnotes", "internalnote",
]);

/**
 * Strips anything from an object tree that must never reach the AI provider —
 * credentials, tokens, signatures, payment details, and private staff notes —
 * recursively, by key name (case/format-insensitive). Also truncates to a
 * reasonable size so a full record can never be sent wholesale.
 */
function sanitizeForAi(input, { maxDepth = 4, maxStringLength = 4000 } = {}) {
  function clean(value, depth) {
    if (depth > maxDepth) return null;
    if (typeof value === "string") return value.slice(0, maxStringLength);
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => clean(item, depth + 1));
    if (value && typeof value === "object") {
      const out = {};
      for (const [key, val] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
        if (NEVER_SEND_KEYS.has(normalizedKey)) continue;
        out[key] = clean(val, depth + 1);
      }
      return out;
    }
    return value;
  }
  return clean(input, 0);
}

module.exports = {
  resolveAiTestingAccess,
  assertAiTestingAllowed,
  hasRealOpenAiKey,
  sanitizeForAi,
  NEVER_SEND_KEYS,
};
