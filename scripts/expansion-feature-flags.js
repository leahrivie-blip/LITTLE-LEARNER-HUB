/**
 * Expansion feature flags for Director Center, Forms Center, and Family Hub.
 *
 * Security policy (approved for Phase 2 private preview):
 * - Production / live site: all expansion flags remain OFF.
 * - formsCenter + familyHub: forced OFF until a later approved phase.
 * - directorCenter: may be enabled only in a private preview environment
 *   (ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW=true) AND only for verified approved
 *   admin accounts. Regular users, teachers, assistants, and parents are denied
 *   even when the stored flag is true.
 *
 * Hiding a nav item is not security — server routes must call evaluateExpansionAccess.
 */

const EXPANSION_FEATURE_KEYS = Object.freeze({
  DIRECTOR_CENTER: "directorCenter",
  FORMS_CENTER: "formsCenter",
  FAMILY_HUB: "familyHub",
});

const EXPANSION_FEATURE_LABELS = Object.freeze({
  directorCenter: "Director Center",
  formsCenter: "Forms Center",
  familyHub: "Family Hub",
});

/**
 * Views that must stay unreachable while their expansion flag is OFF / unauthorized.
 * Only unfinished expansion surfaces are gated here.
 */
const EXPANSION_VIEW_FLAGS = Object.freeze({
  "director-center": EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER,
  "forms-center": EXPANSION_FEATURE_KEYS.FORMS_CENTER,
  "family-hub": EXPANSION_FEATURE_KEYS.FAMILY_HUB,
});

/** Future API route prefixes gated by expansion flags. */
const EXPANSION_ROUTE_FLAGS = Object.freeze([
  { prefix: "/api/director-center", flag: EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER },
  { prefix: "/api/forms-center", flag: EXPANSION_FEATURE_KEYS.FORMS_CENTER },
  { prefix: "/api/family-hub", flag: EXPANSION_FEATURE_KEYS.FAMILY_HUB },
]);

const LIVE_PRODUCTION_HOST_SUFFIXES = Object.freeze([
  "littlelearnershubbyleah.com",
]);

function defaultExpansionFeatureFlags() {
  return {
    [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: false,
    [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: false,
    [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: false,
  };
}

function coerceFlag(value) {
  return value === true;
}

function truthyEnv(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

/**
 * Normalize stored expansion flags.
 * formsCenter + familyHub are always forced OFF in this phase.
 * directorCenter may be stored true for private preview, but effective access
 * still requires environment + verified admin checks.
 */
function normalizeExpansionFeatureFlags(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: coerceFlag(input[EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]),
    [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: false,
    [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: false,
  };
}

function mergeFeatureFlags(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    playBasedCurriculum: true,
    ...normalizeExpansionFeatureFlags(input),
  };
}

function hostnameFromSiteUrl(siteUrl = "") {
  try {
    return new URL(String(siteUrl || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLiveProductionSite(siteUrl = "") {
  const host = hostnameFromSiteUrl(siteUrl);
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1") return false;
  return LIVE_PRODUCTION_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * Build environment policy for expansion features.
 * Private preview opt-in: ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW=true
 * Live production hosts always lock expansion OFF.
 */
function resolveExpansionEnvironment(options = {}) {
  const env = options.env || process.env || {};
  const siteUrl = options.siteUrl || env.SITE_URL || "";
  const liveProduction = options.liveProduction === true
    || isLiveProductionSite(siteUrl)
    || truthyEnv(env.LLH_FORCE_EXPANSION_FLAGS_OFF);
  const allowDirectorCenterAdminPreview = !liveProduction && truthyEnv(env.ALLOW_DIRECTOR_CENTER_ADMIN_PREVIEW);
  return {
    liveProduction: Boolean(liveProduction),
    allowDirectorCenterAdminPreview: Boolean(allowDirectorCenterAdminPreview),
    siteUrl: String(siteUrl || ""),
    nodeEnv: String(env.NODE_ENV || ""),
  };
}

/**
 * Environment-effective flags (before per-request admin authorization).
 * Production / missing preview opt-in → directorCenter false.
 * formsCenter + familyHub always false.
 */
function resolveEffectiveExpansionFlags(storedFlags, environment = {}) {
  const normalized = normalizeExpansionFeatureFlags(storedFlags);
  const env = environment && typeof environment === "object" ? environment : {};
  const directorAllowedInEnv = env.liveProduction !== true && env.allowDirectorCenterAdminPreview === true;
  return {
    [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: directorAllowedInEnv && normalized.directorCenter === true,
    [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: false,
    [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: false,
  };
}

function isExpansionFeatureEnabled(flags, flagKey, environment = null) {
  if (environment) {
    return resolveEffectiveExpansionFlags(flags, environment)[flagKey] === true;
  }
  const normalized = normalizeExpansionFeatureFlags(flags);
  if (flagKey === EXPANSION_FEATURE_KEYS.FORMS_CENTER || flagKey === EXPANSION_FEATURE_KEYS.FAMILY_HUB) {
    return false;
  }
  return normalized[flagKey] === true;
}

function expansionFlagForView(view) {
  const key = String(view || "").trim().toLowerCase();
  return EXPANSION_VIEW_FLAGS[key] || "";
}

function isExpansionViewEnabled(flags, view, environment = null) {
  const flagKey = expansionFlagForView(view);
  if (!flagKey) return true;
  return isExpansionFeatureEnabled(flags, flagKey, environment);
}

function expansionFlagForRoute(pathname) {
  const path = String(pathname || "");
  for (const entry of EXPANSION_ROUTE_FLAGS) {
    if (path === entry.prefix || path.startsWith(`${entry.prefix}/`)) {
      return entry.flag;
    }
  }
  return "";
}

function isExpansionRouteEnabled(flags, pathname, environment = null) {
  const flagKey = expansionFlagForRoute(pathname);
  if (!flagKey) return true;
  return isExpansionFeatureEnabled(flags, flagKey, environment);
}

function unavailableExpansionPayload(flagKey, extra = {}) {
  const label = EXPANSION_FEATURE_LABELS[flagKey] || "This feature";
  return {
    error: `${label} is not available yet.`,
    code: "feature_unavailable",
    feature: flagKey || "",
    enabled: false,
    ...extra,
  };
}

function unauthorizedExpansionPayload(flagKey, extra = {}) {
  const label = EXPANSION_FEATURE_LABELS[flagKey] || "This feature";
  return {
    error: `${label} requires a verified approved admin account.`,
    code: "admin_required",
    feature: flagKey || "",
    enabled: false,
    ...extra,
  };
}

/**
 * Full access decision for an expansion feature.
 * directorCenter requires: env preview opt-in + stored flag + verified admin.
 */
function evaluateExpansionAccess({
  flagKey = "",
  storedFlags = null,
  environment = null,
  isVerifiedAdmin = false,
} = {}) {
  const env = environment || resolveExpansionEnvironment();
  const stored = normalizeExpansionFeatureFlags(storedFlags);
  const effective = resolveEffectiveExpansionFlags(stored, env);
  const result = {
    allowed: false,
    status: 403,
    flagKey,
    stored: stored[flagKey] === true,
    effective: effective[flagKey] === true,
    isVerifiedAdmin: isVerifiedAdmin === true,
    environment: {
      liveProduction: env.liveProduction === true,
      allowDirectorCenterAdminPreview: env.allowDirectorCenterAdminPreview === true,
    },
    reason: "",
    payload: null,
  };

  if (!flagKey) {
    result.allowed = true;
    result.status = 200;
    result.reason = "ok";
    return result;
  }

  if (flagKey === EXPANSION_FEATURE_KEYS.FORMS_CENTER || flagKey === EXPANSION_FEATURE_KEYS.FAMILY_HUB) {
    result.reason = "feature_forced_off";
    result.payload = unavailableExpansionPayload(flagKey, { reason: result.reason });
    return result;
  }

  if (env.liveProduction === true) {
    result.reason = "production_locked";
    result.payload = unavailableExpansionPayload(flagKey, { reason: result.reason });
    return result;
  }

  if (flagKey === EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER) {
    if (env.allowDirectorCenterAdminPreview !== true) {
      result.reason = "preview_env_disabled";
      result.payload = unavailableExpansionPayload(flagKey, { reason: result.reason });
      return result;
    }
    if (stored.directorCenter !== true) {
      result.reason = "feature_unavailable";
      result.payload = unavailableExpansionPayload(flagKey, { reason: result.reason });
      return result;
    }
    if (isVerifiedAdmin !== true) {
      result.reason = "admin_required";
      result.payload = unauthorizedExpansionPayload(flagKey, { reason: result.reason });
      return result;
    }
    result.allowed = true;
    result.status = 200;
    result.reason = "ok";
    result.effective = true;
    return result;
  }

  result.reason = "feature_unavailable";
  result.payload = unavailableExpansionPayload(flagKey, { reason: result.reason });
  return result;
}

function viewerExpansionFlags(storedFlags, environment, isVerifiedAdmin) {
  const effective = resolveEffectiveExpansionFlags(storedFlags, environment);
  return {
    directorCenter: effective.directorCenter === true && isVerifiedAdmin === true,
    formsCenter: false,
    familyHub: false,
  };
}

function publicExpansionFeatureFlagsPayload(storedFlags, options = {}) {
  const environment = options.environment || resolveExpansionEnvironment(options);
  const isVerifiedAdmin = options.isVerifiedAdmin === true;
  const stored = normalizeExpansionFeatureFlags(storedFlags);
  const effective = resolveEffectiveExpansionFlags(stored, environment);
  const viewerFlags = viewerExpansionFlags(stored, environment, isVerifiedAdmin);
  return {
    flags: viewerFlags,
    storedFlags: stored,
    effectiveFlags: effective,
    labels: { ...EXPANSION_FEATURE_LABELS },
    allOff: Object.values(viewerFlags).every((value) => value === false),
    phase: 2,
    policy: {
      directorCenter: "admin_preview_only",
      formsCenter: "forced_off",
      familyHub: "forced_off",
      productionLocked: environment.liveProduction === true,
      allowDirectorCenterAdminPreview: environment.allowDirectorCenterAdminPreview === true,
      note: "Director Center private preview is admin-only. Forms Center and Family Hub remain OFF.",
    },
    viewer: {
      isVerifiedAdmin,
      canAccessDirectorCenter: viewerFlags.directorCenter === true,
    },
  };
}

module.exports = {
  EXPANSION_FEATURE_KEYS,
  EXPANSION_FEATURE_LABELS,
  EXPANSION_VIEW_FLAGS,
  EXPANSION_ROUTE_FLAGS,
  LIVE_PRODUCTION_HOST_SUFFIXES,
  defaultExpansionFeatureFlags,
  normalizeExpansionFeatureFlags,
  mergeFeatureFlags,
  truthyEnv,
  isLiveProductionSite,
  resolveExpansionEnvironment,
  resolveEffectiveExpansionFlags,
  isExpansionFeatureEnabled,
  expansionFlagForView,
  isExpansionViewEnabled,
  expansionFlagForRoute,
  isExpansionRouteEnabled,
  unavailableExpansionPayload,
  unauthorizedExpansionPayload,
  evaluateExpansionAccess,
  viewerExpansionFlags,
  publicExpansionFeatureFlagsPayload,
};
