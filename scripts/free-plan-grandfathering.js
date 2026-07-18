/**
 * Configurable Free-plan grandfathering.
 *
 * Existing Free accounts created before the curated Free launch keep the legacy
 * Free experience (all store Free-tier lesson plans + prior Free feature access).
 * New Free signups after the cutoff get the curated Free sample + new limits.
 *
 * Override sources (later wins on the client; server uses env + siteContent):
 * - Env: FREE_PLAN_GRANDFATHERING_ENABLED, FREE_PLAN_CURATED_CUTOFF_AT
 * - siteContent.freePlanAccess / featureFlags
 * - account.freeLessonAccessMode = "legacy" | "curated"
 * - window.LLH_FREE_PLAN_ACCESS / localStorage llhFreePlanAccess (client tests)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LLHFreePlanGrandfathering = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    enabled: true,
    // Accounts created strictly before this timestamp keep legacy Free access.
    // Adjust via env/siteContent without a code change.
    curatedCutoffAt: "2026-07-18T00:00:00.000Z",
    // Safer for pre-existing accounts that never stored createdAt/signupAt.
    missingDateMeansLegacy: true,
    accountModeField: "freeLessonAccessMode",
    earlySupporterTitle: "Early supporter Free access",
    earlySupporterBody:
      "You’re an early Little Learner Hub supporter, so you were grandfathered into the original Free plan. You keep the Free lesson plans and Free tools you’ve already been using. New Free accounts after our Free-plan update get a smaller curated sample — upgrade anytime for unlimited Pro access.",
  });

  function envFlag(name, fallback) {
    if (typeof process === "undefined" || !process.env) return fallback;
    const raw = process.env[name];
    if (raw === undefined || raw === null || raw === "") return fallback;
    const value = String(raw).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(value)) return true;
    if (["0", "false", "no", "off"].includes(value)) return false;
    return fallback;
  }

  function envText(name, fallback) {
    if (typeof process === "undefined" || !process.env) return fallback;
    const raw = process.env[name];
    if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
    return String(raw).trim();
  }

  function parseOverrides(raw) {
    if (!raw || typeof raw !== "object") return {};
    const next = {};
    if (typeof raw.enabled === "boolean") next.enabled = raw.enabled;
    if (raw.curatedCutoffAt) next.curatedCutoffAt = String(raw.curatedCutoffAt).trim();
    if (typeof raw.missingDateMeansLegacy === "boolean") next.missingDateMeansLegacy = raw.missingDateMeansLegacy;
    if (raw.earlySupporterTitle) next.earlySupporterTitle = String(raw.earlySupporterTitle);
    if (raw.earlySupporterBody) next.earlySupporterBody = String(raw.earlySupporterBody);
    if (raw.accountModeField) next.accountModeField = String(raw.accountModeField);
    return next;
  }

  function resolveConfig(extra = {}) {
    const fromEnv = {
      enabled: envFlag("FREE_PLAN_GRANDFATHERING_ENABLED", DEFAULTS.enabled),
      curatedCutoffAt: envText("FREE_PLAN_CURATED_CUTOFF_AT", DEFAULTS.curatedCutoffAt),
      missingDateMeansLegacy: envFlag("FREE_PLAN_MISSING_DATE_MEANS_LEGACY", DEFAULTS.missingDateMeansLegacy),
    };
    let fromWindow = {};
    let fromStorage = {};
    if (typeof globalThis !== "undefined") {
      if (globalThis.LLH_FREE_PLAN_ACCESS && typeof globalThis.LLH_FREE_PLAN_ACCESS === "object") {
        fromWindow = parseOverrides(globalThis.LLH_FREE_PLAN_ACCESS);
      }
      try {
        if (typeof localStorage !== "undefined") {
          fromStorage = parseOverrides(JSON.parse(localStorage.getItem("llhFreePlanAccess") || "{}"));
        }
      } catch {
        fromStorage = {};
      }
    }
    const site = parseOverrides(extra.siteContent?.freePlanAccess || extra.siteContent?.featureFlags || {});
    // featureFlags may include unrelated keys — only pick known ones.
    const flagPick = {};
    const flags = extra.siteContent?.featureFlags || {};
    if (typeof flags.freePlanGrandfatheringEnabled === "boolean") {
      flagPick.enabled = flags.freePlanGrandfatheringEnabled;
    }
    if (flags.freePlanCuratedCutoffAt) {
      flagPick.curatedCutoffAt = String(flags.freePlanCuratedCutoffAt).trim();
    }
    return {
      ...DEFAULTS,
      ...fromEnv,
      ...site,
      ...flagPick,
      ...fromWindow,
      ...fromStorage,
      ...parseOverrides(extra),
    };
  }

  function accountSignupMs(account = {}) {
    const candidates = [
      account?.signupAt,
      account?.createdAt,
      account?.accountCreatedAt,
      account?.joinedAt,
    ];
    for (const value of candidates) {
      const ms = Date.parse(String(value || ""));
      if (Number.isFinite(ms)) return ms;
    }
    return null;
  }

  function normalizeAccessMode(value) {
    const mode = String(value || "").trim().toLowerCase();
    if (mode === "legacy" || mode === "grandfathered" || mode === "original") return "legacy";
    if (mode === "curated" || mode === "new" || mode === "sample") return "curated";
    return "";
  }

  function resolveFreeLessonAccessMode(account = {}, extra = {}) {
    const config = resolveConfig(extra);
    if (!config.enabled) return "curated";

    const field = config.accountModeField || "freeLessonAccessMode";
    const explicit = normalizeAccessMode(account?.[field] || account?.freePlanAccessMode || account?.freeAccessMode);
    if (explicit) return explicit;

    // Paid / staff paths shouldn't be classified as Free access modes.
    const plan = String(account?.plan || "Free").trim();
    if (plan && plan !== "Free") return "curated";

    const signupMs = accountSignupMs(account);
    const cutoffMs = Date.parse(config.curatedCutoffAt);
    if (!Number.isFinite(cutoffMs)) {
      return config.missingDateMeansLegacy ? "legacy" : "curated";
    }
    if (signupMs === null) {
      return config.missingDateMeansLegacy ? "legacy" : "curated";
    }
    return signupMs < cutoffMs ? "legacy" : "curated";
  }

  function hasLegacyFreeLessonAccess(account = {}, extra = {}) {
    return resolveFreeLessonAccessMode(account, extra) === "legacy";
  }

  function isLegacyStoreFreePlan(plan = {}) {
    return String(plan?.plan || "Free").trim() !== "Pro";
  }

  function modeForNewSignup(extra = {}) {
    const config = resolveConfig(extra);
    if (!config.enabled) return "curated";
    const now = Date.now();
    const cutoffMs = Date.parse(config.curatedCutoffAt);
    if (Number.isFinite(cutoffMs) && now < cutoffMs) return "legacy";
    return "curated";
  }

  return {
    DEFAULTS,
    resolveConfig,
    accountSignupMs,
    normalizeAccessMode,
    resolveFreeLessonAccessMode,
    hasLegacyFreeLessonAccess,
    isLegacyStoreFreePlan,
    modeForNewSignup,
  };
});
