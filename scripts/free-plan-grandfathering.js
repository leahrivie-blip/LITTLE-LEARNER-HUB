/**
 * Free-plan access policy.
 *
 * Business policy (2026-07): every Free account — new and existing — receives
 * exactly the same 10-plan Free Starter Library. Legacy/grandfathered Free
 * unlock is permanently disabled.
 *
 * Saved favorites, calendar entries, and provider-created work are preserved,
 * but premium curriculum contents stay locked unless the plan is one of the 10
 * curated starters (or the resource is provider-owned).
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

  const FREE_POLICY_NOTICE =
    "Your Free account includes 10 complete Starter Lesson Plans across Infant, Toddler and Preschool. Your saved information remains available, but additional premium plans require Founding or Pro access.";

  const DEFAULTS = Object.freeze({
    // Legacy Free unlock is retired — always curated for every Free account.
    enabled: false,
    curatedCutoffAt: "2026-07-18T00:00:00.000Z",
    missingDateMeansLegacy: false,
    accountModeField: "freeLessonAccessMode",
    earlySupporterTitle: "Free Starter Library",
    earlySupporterBody: FREE_POLICY_NOTICE,
    freePolicyNotice: FREE_POLICY_NOTICE,
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
    // enabled may still be read for admin display, but access mode ignores it.
    if (typeof raw.enabled === "boolean") next.enabled = raw.enabled;
    if (raw.curatedCutoffAt) next.curatedCutoffAt = String(raw.curatedCutoffAt).trim();
    if (typeof raw.missingDateMeansLegacy === "boolean") next.missingDateMeansLegacy = raw.missingDateMeansLegacy;
    if (raw.earlySupporterTitle) next.earlySupporterTitle = String(raw.earlySupporterTitle);
    if (raw.earlySupporterBody) next.earlySupporterBody = String(raw.earlySupporterBody);
    if (raw.freePolicyNotice) next.freePolicyNotice = String(raw.freePolicyNotice);
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
      // Policy lock: grandfathering cannot be re-enabled via CMS/env for unlock.
      enabled: false,
      missingDateMeansLegacy: false,
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

  /** Every Free account uses the curated 10-plan Starter Library. */
  function resolveFreeLessonAccessMode() {
    return "curated";
  }

  /** Legacy Free unlock is retired — always false. */
  function hasLegacyFreeLessonAccess() {
    return false;
  }

  function isLegacyStoreFreePlan(plan = {}) {
    return String(plan?.plan || "Free").trim() !== "Pro";
  }

  function modeForNewSignup() {
    return "curated";
  }

  function freePolicyNotice(extra = {}) {
    const config = resolveConfig(extra);
    return config.freePolicyNotice || FREE_POLICY_NOTICE;
  }

  return {
    DEFAULTS,
    FREE_POLICY_NOTICE,
    resolveConfig,
    accountSignupMs,
    normalizeAccessMode,
    resolveFreeLessonAccessMode,
    hasLegacyFreeLessonAccess,
    isLegacyStoreFreePlan,
    modeForNewSignup,
    freePolicyNotice,
  };
});
