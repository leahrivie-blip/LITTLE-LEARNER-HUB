/**
 * Canonical age-group values and display labels (Phase 10).
 * Normalizes hyphen/en-dash aliases at read/filter time — does not rewrite stored lesson content.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHAgeGroupNormalize = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CANONICAL_AGES = Object.freeze([
    "Infant",
    "Toddler",
    "Preschool",
    "School Age",
    "Mixed Ages",
    "All Ages",
  ]);

  const DISPLAY_LABELS = Object.freeze({
    Infant: "Infant",
    Toddler: "Toddler",
    Preschool: "Preschool",
    "School Age": "School Age",
    "Mixed Ages": "Mixed Ages",
    "All Ages": "All Ages",
  });

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  /** Collapse hyphen / en-dash / em-dash variants for matching. */
  function normalizeDashes(value) {
    return text(value)
      .toLowerCase()
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\s+/g, " ");
  }

  function canonicalAgeGroup(value) {
    const raw = text(value);
    if (!raw) return "";
    const normalized = normalizeDashes(raw);
    if (/^infant(\s*0\s*-\s*12(\s*months?)?)?$/.test(normalized) || normalized.includes("infant")) {
      return "Infant";
    }
    if (normalized.includes("young toddler")) return "Toddler";
    if (normalized.includes("older toddler")) return "Toddler";
    if (normalized.includes("toddler")) return "Toddler";
    if (normalized.includes("preschool") || normalized.includes("pre-k") || normalized.includes("prek")) {
      return "Preschool";
    }
    if (normalized.includes("school age") || normalized.includes("school-age") || /\bschool\b/.test(normalized)) {
      return "School Age";
    }
    if (normalized.includes("mixed")) return "Mixed Ages";
    if (normalized.includes("all ages") || normalized === "all") return "All Ages";
    return "";
  }

  function ageDisplayLabel(value) {
    const canonical = canonicalAgeGroup(value);
    return DISPLAY_LABELS[canonical] || canonical || text(value);
  }

  function agesMatch(left, right) {
    const a = canonicalAgeGroup(left);
    const b = canonicalAgeGroup(right);
    if (!a || !b) return text(left).toLowerCase() === text(right).toLowerCase();
    return a === b;
  }

  /** Unique canonical filter options from a list of raw age strings. */
  function uniqueCanonicalAgeOptions(rawAges) {
    const seen = new Set();
    const options = [];
    (Array.isArray(rawAges) ? rawAges : []).forEach((raw) => {
      const canonical = canonicalAgeGroup(raw);
      if (!canonical || seen.has(canonical)) return;
      seen.add(canonical);
      options.push({ value: canonical, label: ageDisplayLabel(canonical) });
    });
    return options.sort((a, b) => CANONICAL_AGES.indexOf(a.value) - CANONICAL_AGES.indexOf(b.value)
      || a.label.localeCompare(b.label));
  }

  return {
    CANONICAL_AGES,
    DISPLAY_LABELS,
    normalizeDashes,
    canonicalAgeGroup,
    ageDisplayLabel,
    agesMatch,
    uniqueCanonicalAgeOptions,
  };
});
