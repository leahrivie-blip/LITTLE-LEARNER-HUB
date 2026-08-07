/**
 * Teaching Kit presentation helpers — display-only humanization.
 * Never rewrite stored curriculum values; format for UI/print only.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LLHTeachingKitPresent = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LABEL_MAP = Object.freeze({
    copyrighted_title_only: "Copyrighted title only",
    copyrighted: "Copyrighted",
    title_only: "Title only",
    "title-only": "Title only",
    public_domain: "Public domain",
    traditional: "Traditional / public domain",
    original: "Original",
    unspecified: "Rights not specified",
    week_binder: "Weekly Teaching Kit",
    today_pack: "Today’s classroom pack",
    monday_setup_pack: "Monday Morning Setup pack",
    family_pack: "Family pack",
    ACTIVITY_NAME: "Activity",
    AGE_MODIFICATIONS: "Age adaptations",
    OBSERVATION_OPPORTUNITIES: "Observation opportunities",
    LEARNING_OBJECTIVES: "Learning objectives",
    TEACHER_TIPS: "Teacher tips",
    TEACHER_PROMPTS: "Teacher prompts",
    FAMILY_CONNECTION: "Family connection",
    WEEKLY_OVERVIEW: "Weekly overview",
    WEEKLY_MATERIALS: "Materials list",
    VOCABULARY_WORDS: "Vocabulary",
    SAFETY_NOTES: "Safety notes",
    INDOOR_ALTERNATIVES: "Indoor alternatives",
    OUTDOOR_ALTERNATIVES: "Outdoor alternatives",
    parent_message: "Family message",
    parent_connection: "Family connection",
    activity: "Activity",
    book: "Book",
    song: "Song",
    printable: "Printable",
    circle: "Circle time",
    circle_time: "Circle time",
    fine_motor: "Fine motor",
    gross_motor: "Gross motor",
    sensory: "Sensory",
    stem: "STEM",
    art: "Art",
    outdoor: "Outdoor",
    small_group: "Small group",
    large_group: "Large group",
    literacy: "Literacy",
    math: "Math",
    dramatic_play: "Dramatic play",
    open_ended: "Open-ended exploration",
    music_movement: "Music & movement",
  });

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function titleCaseWords(value) {
    return text(value)
      .toLowerCase()
      .replace(/(^|[\s/_-])([a-z])/g, (_, sep, ch) => `${sep === "_" || sep === "/" || sep === "-" ? " " : sep}${ch.toUpperCase()}`)
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Humanize an enum/id/snake_case/SCREAMING_SNAKE token for customer UI/print.
   */
  function presentLabel(value, fallback) {
    const raw = text(value);
    if (!raw) return text(fallback) || "";
    const key = raw.toLowerCase();
    if (LABEL_MAP[raw]) return LABEL_MAP[raw];
    if (LABEL_MAP[key]) return LABEL_MAP[key];
    if (/^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(raw)) {
      return titleCaseWords(raw.replace(/_/g, " "));
    }
    if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(raw)) {
      return titleCaseWords(raw.replace(/_/g, " "));
    }
    if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(raw)) {
      return titleCaseWords(raw.replace(/-/g, " "));
    }
    return raw;
  }

  function presentRightsStatus(value) {
    const raw = text(value);
    if (!raw) return "";
    return presentLabel(raw, "Rights not specified");
  }

  function presentPresetLabel(presetId, fallbackLabel) {
    const mapped = presentLabel(presetId, "");
    if (mapped && mapped !== text(presetId)) return mapped;
    return text(fallbackLabel) || mapped || "Print pack";
  }

  function presentKind(value) {
    return presentLabel(value, "Item");
  }

  function hasDisplayValue(value) {
    if (value == null) return false;
    if (Array.isArray(value)) return value.some((item) => hasDisplayValue(item));
    if (typeof value === "object") {
      return Object.keys(value).some((key) => hasDisplayValue(value[key]));
    }
    const raw = text(value);
    if (!raw) return false;
    if (/^(none listed|n\/a|na|null|undefined|tbd|coming soon)$/i.test(raw)) return false;
    return true;
  }

  /** Skip unfinished / developer-facing copy in customer surfaces. */
  function isDeveloperFacingCopy(value) {
    const raw = text(value);
    if (!raw) return false;
    return /\b(TODO|FIXME|lorem ipsum|placeholder|not implemented|ACTIVITY_NAME|AGE_MODIFICATIONS|OBSERVATION_OPPORTUNITIES)\b/i.test(raw)
      || /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(raw)
      || /^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(raw);
  }

  function presentCopy(value, fallback) {
    const raw = text(value);
    if (!raw || isDeveloperFacingCopy(raw)) return text(fallback) || "";
    return raw;
  }

  return {
    LABEL_MAP,
    presentLabel,
    presentRightsStatus,
    presentPresetLabel,
    presentKind,
    presentCopy,
    hasDisplayValue,
    isDeveloperFacingCopy,
    titleCaseWords,
  };
});
