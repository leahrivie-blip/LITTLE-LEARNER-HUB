/**
 * Age-aware developmental / safety validation for AI-generated provider content.
 * Hard-blocks unsafe infant recommendations; does not rewrite production records.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHAiAgeSafety = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const INFANT_UNSAFE = /\b(scissors?|safe cutting|cutting practice|cut along|tracing|trace|worksheets?|beads?|beading|stringing|play\s*-?dough|playdough|tongs?|tweezers?|pencils?|fine[- ]motor writing|sticker sheets?)\b/i;
  const INFANT_RISK = /\b(choking|strangulation|ingestion|swallow|unsupervised|alone in crib|prone sleep|honey|whole grapes|popcorn|latex balloons?)\b/i;

  const INFANT_ALTERNATIVES = Object.freeze({
    "Fine Motor": [
      "Large soft grasping toys",
      "Finger plays and hand songs",
      "Board book page turning with support",
      "Reaching for high-contrast objects on the floor",
    ],
    sensory: [
      "Supervised textured fabric play",
      "Water play with large cups (constant supervision)",
      "Mirror play on the floor",
    ],
    default: [
      "Floor tummy time with close supervision",
      "Simple songs and face-to-face talk",
      "Large baby-safe rattles and grasping toys",
      "Board books and caregiver narration",
    ],
  });

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeAgeGroup(value) {
    const raw = text(value).toLowerCase();
    if (/infant|0\s*[-–]\s*12|10[-\s]?month|months?\s*old|baby/.test(raw)) return "Infant";
    if (/toddler|12\s*[-–]\s*36|1\s*[-–]\s*2|2\s*year/.test(raw)) return "Toddler";
    if (/preschool|prek|3\s*[-–]\s*5|4\s*year/.test(raw)) return "Preschool";
    if (/school.?age|k-?2|elementary/.test(raw)) return "School Age";
    return text(value) || "Unknown";
  }

  function isInfantAge(value) {
    return normalizeAgeGroup(value) === "Infant";
  }

  function findUnsafeMatches(content) {
    const body = text(content);
    if (!body) return [];
    const matches = [];
    const unsafe = body.match(INFANT_UNSAFE);
    if (unsafe) matches.push({ kind: "developmental", match: unsafe[0] });
    const risk = body.match(INFANT_RISK);
    if (risk) matches.push({ kind: "safety", match: risk[0] });
    return matches;
  }

  function infantAlternatives(area = "") {
    const key = text(area);
    if (/fine motor/i.test(key)) return INFANT_ALTERNATIVES["Fine Motor"].slice();
    if (/sensor/i.test(key)) return INFANT_ALTERNATIVES.sensory.slice();
    return INFANT_ALTERNATIVES.default.slice();
  }

  /**
   * Validate AI output for age appropriateness.
   * @returns {{ ok: boolean, blocked: boolean, ageGroup: string, matches: Array, message: string, alternatives: string[] }}
   */
  function validateAiContentForAge(content, ageGroup, options = {}) {
    const age = normalizeAgeGroup(ageGroup || options.age || "");
    const matches = isInfantAge(age) ? findUnsafeMatches(content) : [];
    if (!matches.length) {
      return {
        ok: true,
        blocked: false,
        ageGroup: age,
        matches: [],
        message: "",
        alternatives: [],
      };
    }
    const listed = matches.map((m) => m.match).join(", ");
    return {
      ok: false,
      blocked: true,
      ageGroup: age,
      matches,
      message: `Unsafe or developmentally inappropriate recommendation for ${age}: ${listed}. Rewrite with age-appropriate sensory/motor alternatives before this can be accepted as finished content.`,
      alternatives: infantAlternatives(options.area || options.developmentalArea || ""),
    };
  }

  /** Soft checks for toddler/preschool awkward or high-risk copy (non-blocking unless option.strict). */
  function lintAiProviderCopy(content) {
    const body = text(content);
    const issues = [];
    if (/\.\./.test(body) || /!!/.test(body) || /\?\?/.test(body)) {
      issues.push({ code: "double_punctuation", message: "Remove repeated punctuation." });
    }
    if (/\[Your Name\]|\[Child(?:'s)? Name\]|\[insert|lorem ipsum/i.test(body)) {
      issues.push({ code: "placeholder", message: "Remove unfinished placeholders before save." });
    }
    if (/^\s*#{1,6}\s+/m.test(body)) {
      issues.push({ code: "raw_markdown", message: "Remove raw Markdown headings from provider-facing copy." });
    }
    return issues;
  }

  function sanitizeProviderFacingCopy(content) {
    let out = text(content);
    out = out
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/\[Your Name\]/gi, "")
      .replace(/\[Child(?:'s)? Name\]/gi, "")
      .replace(/\[Insert[^\]]*\]/gi, "")
      .replace(/\blorem ipsum\b/gi, "")
      .replace(/\bParent lesson\b/gi, "From lesson plan")
      .replace(/\bParent Lesson\b/g, "From lesson plan")
      .replace(/connected to\s+Select\b/gi, "connected to today's lesson focus")
      .replace(/\.{2,}(?!\.)/g, ".")
      .replace(/!{2,}/g, "!")
      .replace(/\?{2,}/g, "?")
      .replace(/\s+([.,!?])/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return out;
  }

  return {
    INFANT_UNSAFE,
    INFANT_RISK,
    normalizeAgeGroup,
    isInfantAge,
    findUnsafeMatches,
    infantAlternatives,
    validateAiContentForAge,
    lintAiProviderCopy,
    sanitizeProviderFacingCopy,
  };
});
