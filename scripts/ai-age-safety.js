/**
 * Age-aware developmental / choking-hazard validation for AI-generated provider content.
 * Hard-blocks unsafe recommendations for infants and young toddlers.
 * Also gates blank/vague observation inputs so AI cannot invent observed facts.
 * Does not rewrite production child/curriculum records.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHAiAgeSafety = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** Materials / activities unsafe for infants (0–12 months). */
  const INFANT_UNSAFE = /\b(scissors?|safe cutting|cutting practice|cut along|tracing|trace|worksheets?|beads?|beading|stringing|play\s*-?dough|playdough|tongs?|tweezers?|pencils?|crayons?|markers?|fine[- ]motor writing|sticker sheets?|small (parts|pieces|toys)|loose buttons?|coins?|pom[- ]?poms?|dried beans?|small magnets?|water beads?|marble[s]?|legos?\b|mini erasers?)\b/i;
  const INFANT_RISK = /\b(choking|strangulation|ingestion|swallow|unsupervised|alone in crib|prone sleep|honey|whole grapes|popcorn|latex balloons?)\b/i;

  /**
   * Choking / small-parts hazards for under-3 (Young Toddler and mixed groups that include them).
   * Explicit list from live-audit critical repairs.
   */
  const UNDER3_CHOKING = /\b(loose buttons?|buttons?\b|beads?|beading|stringing beads?|coins?|pom[- ]?poms?|pom poms?|dried beans?|dry beans?|small magnets?|magnets?\b|small caps?|bottle caps?|water beads?|orbeez|small (parts|pieces|objects|toys)|tiny (parts|pieces|toys)|marbles?\b|legos?\b|mini erasers?|thumb tacks?|push pins?|paper clips?|googly eyes|sequins?|glitter|hot dogs?|whole grapes|nuts?\b|hard candy|latex balloons?)\b/i;

  /** Developmentally inappropriate for Young Toddler even when not classic choking items. */
  const YOUNG_TODDLER_UNSAFE = /\b(scissors?|cutting practice|worksheets?|tracing worksheets?|pencils? for writing|independent writing|small tongs?|tweezers?)\b/i;

  const SAFE_SUBSTITUTIONS = Object.freeze({
    Infant: [
      "Large soft grasping toys and baby-safe rattles",
      "Large stacking rings (too big to swallow)",
      "Large fabric shapes and textured cloths (supervised)",
      "Sealed sensory bottles/containers (lids secured)",
      "Floor tummy time with high-contrast cards",
      "Board books and caregiver narration",
    ],
    "Young Toddler": [
      "Large stacking rings",
      "Large fabric shapes and scarves",
      "Jumbo blocks and chunky nesting cups",
      "Sealed sensory containers (no loose fillers)",
      "Chunky crayons with close supervision (not for mouthing ages)",
      "Large washable toys securely contained",
    ],
    Toddler: [
      "Jumbo blocks and large manipulative toys",
      "Chunky crayons and large paper",
      "Large fabric shapes and scarves",
      "Sealed sensory bins with oversized items only",
    ],
    default: [
      "Large washable, securely contained materials",
      "Jumbo blocks or nesting cups",
      "Large fabric shapes",
      "Sealed sensory containers",
    ],
  });

  const OBSERVATION_TOOLS = new Set([
    "observation",
    "observations",
    "learning-story",
    "learningStory",
    "portfolio",
    "portfolio-entry",
  ]);

  /** Documentation Helpers that must never invent facts from blank/whitespace notes. */
  const DOCUMENTATION_HELPER_TOOLS = new Set([
    "observation",
    "observations",
    "learning-story",
    "learningstory",
    "portfolio",
    "portfolio-entry",
    "daily",
    "daily-log",
    "daily-report",
    "dailylog",
    "dailyreport",
    "parentmessage",
    "parent-message",
    "parent_message",
    "behaviornote",
    "behavior",
    "behavior-note",
    "behavior_note",
    "incidentreport",
    "incident",
    "incident-report",
    "incident_report",
    // Fail closed: missing/unknown tool must not bypass blank gates.
    "unknown",
    "",
  ]);

  const NON_DOCUMENTATION_TOOLS = new Set([
    "lesson",
    "lesson-plan",
    "lesson_plan",
    "activity",
    "activity-idea",
    "form",
    "form-builder",
    "daycareform",
  ]);

  const VAGUE_ONLY = /^(the child|child|they|he|she|baby|toddler|preschooler|kid)(\s+was)?(\s+good|\s+fine|\s+okay|\s+ok|\s+happy|\s+sad|\s+nice|\s+busy)?[.!]?$/i;

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeAgeGroup(value) {
    const raw = text(value).toLowerCase();
    if (!raw) return "Unknown";
    if (/mixed/.test(raw)) return "Mixed Ages";
    if (/young\s*toddler|12\s*[-–]\s*24|1\s*[-–]\s*2\s*year|walkers?/.test(raw)) return "Young Toddler";
    if (/infant\s*\(?\s*0\s*[-–]\s*6|0\s*[-–]\s*6\s*month|newborn|0-6/.test(raw)) return "Infant 0-6 months";
    if (/infant\s*\(?\s*6\s*[-–]\s*12|6\s*[-–]\s*12\s*month|6-12/.test(raw)) return "Infant 6-12 months";
    if (/infant|0\s*[-–]\s*12|baby|10[-\s]?month|months?\s*old/.test(raw)) return "Infant";
    if (/toddler|12\s*[-–]\s*36|2\s*[-–]\s*3|2\s*year/.test(raw)) return "Toddler";
    if (/preschool|prek|3\s*[-–]\s*5|4\s*year|pre-?k/.test(raw)) return "Preschool";
    if (/school.?age|k-?2|elementary/.test(raw)) return "School Age";
    return text(value) || "Unknown";
  }

  function isInfantAge(value) {
    const age = normalizeAgeGroup(value);
    return age === "Infant" || age === "Infant 0-6 months" || age === "Infant 6-12 months";
  }

  function isYoungToddlerAge(value) {
    return normalizeAgeGroup(value) === "Young Toddler";
  }

  function isUnderThreeAge(value) {
    const age = normalizeAgeGroup(value);
    return isInfantAge(age) || age === "Young Toddler" || age === "Toddler" || age === "Mixed Ages";
  }

  function appliesChokingGate(value) {
    const age = normalizeAgeGroup(value);
    return isInfantAge(age) || age === "Young Toddler" || age === "Mixed Ages"
      || age === "Toddler"; // toddlers still under ~3; block classic small-parts
  }

  function findUnsafeMatches(content, ageGroup) {
    const body = text(content);
    if (!body) return [];
    const age = normalizeAgeGroup(ageGroup);
    const matches = [];

    if (isInfantAge(age)) {
      const unsafe = body.match(INFANT_UNSAFE);
      if (unsafe) matches.push({ kind: "developmental", match: unsafe[0], age });
      const risk = body.match(INFANT_RISK);
      if (risk) matches.push({ kind: "safety", match: risk[0], age });
    }

    if (appliesChokingGate(age)) {
      const choke = body.match(UNDER3_CHOKING);
      if (choke) matches.push({ kind: "choking", match: choke[0], age });
    }

    if (isYoungToddlerAge(age) || age === "Mixed Ages") {
      const yt = body.match(YOUNG_TODDLER_UNSAFE);
      if (yt) matches.push({ kind: "developmental", match: yt[0], age });
    }

    return matches;
  }

  function safeSubstitutions(ageGroup, area = "") {
    const age = normalizeAgeGroup(ageGroup);
    let list;
    if (isInfantAge(age)) list = SAFE_SUBSTITUTIONS.Infant;
    else if (age === "Young Toddler" || age === "Mixed Ages") list = SAFE_SUBSTITUTIONS["Young Toddler"];
    else if (age === "Toddler") list = SAFE_SUBSTITUTIONS.Toddler;
    else list = SAFE_SUBSTITUTIONS.default;
    const out = list.slice();
    if (/fine motor/i.test(text(area)) && isInfantAge(age)) {
      return [
        "Large soft grasping toys",
        "Finger plays and hand songs",
        "Board book page turning with support",
        "Reaching for high-contrast objects on the floor",
      ];
    }
    return out;
  }

  /**
   * Validate AI output for age appropriateness / choking hazards.
   * @returns {{ ok: boolean, blocked: boolean, ageGroup: string, matches: Array, message: string, alternatives: string[] }}
   */
  function validateAiContentForAge(content, ageGroup, options = {}) {
    const age = normalizeAgeGroup(ageGroup || options.age || "");
    const matches = findUnsafeMatches(content, age);
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
    const listed = [...new Set(matches.map((m) => m.match))].join(", ");
    const alternatives = safeSubstitutions(age, options.area || options.developmentalArea || "");
    return {
      ok: false,
      blocked: true,
      ageGroup: age,
      matches,
      message: `Unsafe or developmentally inappropriate recommendation for ${age}: ${listed}. Use large, washable, securely contained materials instead (for example: ${alternatives.slice(0, 3).join("; ")}).`,
      alternatives,
    };
  }

  function normalizeToolKey(tool) {
    return text(tool).replace(/_/g, "-").toLowerCase();
  }

  function isObservationTool(tool) {
    const id = normalizeToolKey(tool);
    return OBSERVATION_TOOLS.has(id)
      || OBSERVATION_TOOLS.has(text(tool))
      || /observation|learning.?story|portfolio/i.test(id);
  }

  function isDocumentationHelperTool(tool) {
    const id = normalizeToolKey(tool);
    if (NON_DOCUMENTATION_TOOLS.has(id)) return false;
    if (DOCUMENTATION_HELPER_TOOLS.has(id)) return true;
    if (isObservationTool(tool)) return true;
    return /^(daily|parent|behavior|incident)/i.test(id);
  }

  /**
   * Detect whether provider note contains an observed action (not just blank/vague).
   * Returns { ok, code, message } — when ok=false, do not call the model.
   */
  function validateObservationInput(prompt, options = {}) {
    const note = text(prompt || options.providerNotes || options.note || "");
    const tool = options.tool || "observation";
    if (!isObservationTool(tool) && options.forceObservationCheck !== true) {
      return { ok: true, code: "", message: "" };
    }

    if (!note) {
      return {
        ok: false,
        code: "blank_observation",
        message: "Enter what the child actually did before generating an observation. AI will not invent speech, emotions, milestones, preferences, interactions, progress, diagnoses, or family information.",
      };
    }

    // Strip common instruction wrappers to inspect the provider's note.
    const stripped = note
      .replace(/^(shorten|rewrite|make|create|write|generate)[\s\S]{0,80}?:\s*/i, "")
      .replace(/do not add new details[\s\S]*$/i, "")
      .trim();

    const body = stripped || note;
    if (body.length < 12 || VAGUE_ONLY.test(body)) {
      return {
        ok: false,
        code: "vague_observation",
        message: "Add a clearer observed action (what the child did, said, or tried). Vague notes like “child was good” are not enough — AI will not invent developmental claims.",
      };
    }

    // Require at least one action / sensory / communication cue.
    const hasAction = /\b(play|played|play(?:ing)?|stack|stacked|stacking|reach|reached|grasp|grasped|crawl|crawled|walk|walked|run|ran|climb|climbed|sit|sat|stand|stood|look|looked|watch|watched|point|pointed|babble|babbled|say|said|speak|spoke|talk|talked|smile|smiled|cry|cried|laugh|laughed|explore|explored|pour|poured|build|built|count|counted|sort|sorted|draw|drew|paint|painted|sing|sang|dance|danced|eat|ate|drink|drank|nap|slept|hold|held|push|pushed|pull|pulled|throw|threw|catch|caught|share|shared|help|helped|try|tried|imitate|imitated|choose|chose|open|opened|close|closed)\b/i.test(body)
      || /\b(during|while|when)\b/i.test(body);

    if (!hasAction) {
      return {
        ok: false,
        code: "no_observed_action",
        message: "Describe what you observed the child do. Without an observed action, documentation helpers will not generate developmental claims.",
      };
    }

    return { ok: true, code: "", message: "" };
  }

  /**
   * Blank / whitespace / too-thin gates for all Documentation Helpers.
   * Observation tools keep the stricter observed-action checks.
   * Returns { ok, code, message } — when ok=false, do not call the model.
   */
  function validateDocumentationInput(prompt, options = {}) {
    const tool = options.tool || "unknown";
    const note = text(prompt || options.providerNotes || options.note || "");
    const force = options.forceDocumentationCheck === true;

    if (!force && !isDocumentationHelperTool(tool)) {
      return { ok: true, code: "", message: "" };
    }

    if (isObservationTool(tool) || options.forceObservationCheck === true) {
      return validateObservationInput(prompt, { ...options, tool, forceObservationCheck: true });
    }

    if (!note) {
      return {
        ok: false,
        code: "blank_documentation",
        message: "Enter real classroom notes before generating. AI will not invent meals, naps, incidents, activities, emotions, or family information from a blank request.",
      };
    }

    if (note.length < 12 || VAGUE_ONLY.test(note)) {
      return {
        ok: false,
        code: "too_short_documentation",
        message: "Add clearer notes before generating. AI will not invent childcare documentation from vague or empty details.",
      };
    }

    return { ok: true, code: "", message: "" };
  }

  /** Soft checks for awkward or high-risk copy (non-blocking unless option.strict). */
  function lintAiProviderCopy(content) {
    const body = text(content);
    const issues = [];
    if (/\.\./.test(body) || /!!/.test(body) || /\?\?/.test(body)) {
      issues.push({ code: "double_punctuation", message: "Remove repeated punctuation." });
    }
    if (/\[Your Name\]|\[Child(?:'s)? Name\]|\[insert|lorem ipsum|leave blank if not needed/i.test(body)) {
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
      .replace(/\bLeave blank if not needed\.?/gi, "")
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

  function ageSafetyRewriteInstruction(ageGroup) {
    const age = normalizeAgeGroup(ageGroup);
    const alts = safeSubstitutions(age).slice(0, 4).join("; ");
    return [
      `CRITICAL AGE SAFETY: The child age group is ${age}.`,
      "Never recommend loose buttons, beads, coins, pom-poms, dried beans, small magnets, small caps, water beads, marbles, or other choking hazards for infants or children under 3.",
      "Infants and young toddlers must use large, washable, securely contained materials only.",
      `Safe substitutions include: ${alts}.`,
      "Do not invent observations, speech, emotions, milestones, diagnoses, or family information.",
      "If rewriting an observation, stay strictly grounded in the provider note; separate observed facts from optional interpretation.",
    ].join(" ");
  }

  return {
    INFANT_UNSAFE,
    INFANT_RISK,
    UNDER3_CHOKING,
    YOUNG_TODDLER_UNSAFE,
    SAFE_SUBSTITUTIONS,
    normalizeAgeGroup,
    isInfantAge,
    isYoungToddlerAge,
    isUnderThreeAge,
    findUnsafeMatches,
    safeSubstitutions,
    infantAlternatives: safeSubstitutions,
    validateAiContentForAge,
    validateObservationInput,
    validateDocumentationInput,
    isObservationTool,
    isDocumentationHelperTool,
    lintAiProviderCopy,
    sanitizeProviderFacingCopy,
    ageSafetyRewriteInstruction,
  };
});
