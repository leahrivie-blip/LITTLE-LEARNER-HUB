/**
 * Expansion feature flags for Director Center, Forms Center, and Family Hub.
 *
 * Phase 1: all expansion flags default OFF and must stay OFF in production
 * until an explicit later release approval.
 *
 * playBasedCurriculum remains a separate permanent curriculum flag.
 * Hiding a nav item is not security — server routes must call isExpansionFeatureEnabled.
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
 * Views that must stay unreachable while their expansion flag is OFF.
 * Only unfinished expansion surfaces are gated here.
 * Existing Settings → Staff / partial classroom tools keep current access.
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

/**
 * Normalize expansion flags. Unknown keys are ignored.
 * Only an explicit boolean true turns a flag ON.
 */
function normalizeExpansionFeatureFlags(value) {
  const defaults = defaultExpansionFeatureFlags();
  const input = value && typeof value === "object" ? value : {};
  return {
    [EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]: coerceFlag(input[EXPANSION_FEATURE_KEYS.DIRECTOR_CENTER]),
    [EXPANSION_FEATURE_KEYS.FORMS_CENTER]: coerceFlag(input[EXPANSION_FEATURE_KEYS.FORMS_CENTER]),
    [EXPANSION_FEATURE_KEYS.FAMILY_HUB]: coerceFlag(input[EXPANSION_FEATURE_KEYS.FAMILY_HUB]),
  };
}

function mergeFeatureFlags(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    playBasedCurriculum: true,
    ...normalizeExpansionFeatureFlags(input),
  };
}

function isExpansionFeatureEnabled(flags, flagKey) {
  const normalized = normalizeExpansionFeatureFlags(flags);
  return normalized[flagKey] === true;
}

function expansionFlagForView(view) {
  const key = String(view || "").trim().toLowerCase();
  return EXPANSION_VIEW_FLAGS[key] || "";
}

function isExpansionViewEnabled(flags, view) {
  const flagKey = expansionFlagForView(view);
  if (!flagKey) return true;
  return isExpansionFeatureEnabled(flags, flagKey);
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

function isExpansionRouteEnabled(flags, pathname) {
  const flagKey = expansionFlagForRoute(pathname);
  if (!flagKey) return true;
  return isExpansionFeatureEnabled(flags, flagKey);
}

function unavailableExpansionPayload(flagKey) {
  const label = EXPANSION_FEATURE_LABELS[flagKey] || "This feature";
  return {
    error: `${label} is not available yet.`,
    code: "feature_unavailable",
    feature: flagKey || "",
    enabled: false,
  };
}

function publicExpansionFeatureFlagsPayload(flags) {
  const normalized = normalizeExpansionFeatureFlags(flags);
  return {
    flags: normalized,
    labels: { ...EXPANSION_FEATURE_LABELS },
    allOff: Object.values(normalized).every((value) => value === false),
    phase: 1,
    note: "Expansion features are hidden until approved release. Defaults are OFF.",
  };
}

module.exports = {
  EXPANSION_FEATURE_KEYS,
  EXPANSION_FEATURE_LABELS,
  EXPANSION_VIEW_FLAGS,
  EXPANSION_ROUTE_FLAGS,
  defaultExpansionFeatureFlags,
  normalizeExpansionFeatureFlags,
  mergeFeatureFlags,
  isExpansionFeatureEnabled,
  expansionFlagForView,
  isExpansionViewEnabled,
  expansionFlagForRoute,
  isExpansionRouteEnabled,
  unavailableExpansionPayload,
  publicExpansionFeatureFlagsPayload,
};
