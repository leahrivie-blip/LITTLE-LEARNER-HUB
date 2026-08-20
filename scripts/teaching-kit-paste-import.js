/**
 * Teaching Kit Owner Admin — structured Paste Week / Paste Activity importers.
 *
 * Pure helpers only. Does not touch publishing, autosave, linked resources, or AI.
 * Writes exclusively into the existing enrichmentDraft shape (week / activities[key]).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitPasteImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WEEK_MILESTONE_BANK = Object.freeze([
    "Sorting",
    "Fine motor",
    "Language",
    "Social-emotional",
    "Gross motor",
    "Creativity",
    "Self-help",
  ]);

  const SETTING_TAG_BY_LABEL = Object.freeze({
    "small group": "small_group",
    "large group": "large_group",
    indoor: "indoor",
    outdoor: "outdoor",
  });

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);

  function normalizeHeading(raw) {
    return text(raw)
      .toLowerCase()
      .replace(/[_/&]+/g, " ")
      .replace(/[:：]+$/g, "")
      .replace(/[–—−⸻]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function freezeNormalizedAliases(source) {
    const out = {};
    Object.keys(source).forEach((key) => {
      out[normalizeHeading(key)] = source[key];
    });
    return Object.freeze(out);
  }

  /** Exact/alias heading → week field id. No fuzzy guessing. */
  const WEEK_HEADING_ALIASES = freezeNormalizedAliases({
    "weekly overview": "weeklyOverview",
    "week overview": "weeklyOverview",
    "learning objectives": "objectives",
    objectives: "objectives",
    materials: "weeklyMaterials",
    "materials list": "weeklyMaterials",
    "teacher preparation": "teacherPreparation",
    "teacher preparation / toolkit": "teacherPreparation",
    "teacher toolkit": "teacherPreparation",
    toolkit: "teacherPreparation",
    "prep checklist": "prepChecklist",
    "preparation checklist": "prepChecklist",
    "observation focus": "observationFocus",
    "observation focuses": "observationFocus",
    "weekly observation focus": "observationFocus",
    "family connection": "familyConnection",
    "family connections": "familyConnection",
    "family idea": "familyConnection",
    milestones: "milestones",
    "developmental milestones": "milestones",
    books: "books",
    book: "books",
    "book title": "books",
    author: "books",
    "why this book": "books",
    "why it fits": "books",
    "book questions": "books",
    "discussion questions": "books",
    lyrics: "songs",
    instructions: "printableIdeas",
    "purpose / description": "printableIdeas",
    songs: "songs",
    song: "songs",
    "song title": "songs",
    tune: "songs",
    "how to use": "songs",
    "suggested use": "songs",
    lyrics: "songs",
    motions: "songs",
    "printable ideas": "printableIdeas",
    "printable idea": "printableIdeas",
    "idea title": "printableIdeas",
    "purpose / description": "printableIdeas",
    purpose: "printableIdeas",
    instructions: "printableIdeas",
    notes: "printableIdeas",
    "linked resources": "linkedResources",
    "linked resource": "linkedResources",
    "resource title": "linkedResources",
    "resource type": "linkedResources",
    "resource placement": "linkedResources",
    placement: "linkedResources",
    "resource section": "linkedResources",
    // Legacy resource headings — recognized but never auto-created as files.
    printable: "linkedResourcesManual",
    printables: "linkedResourcesManual",
    "draft books": "linkedResourcesManual",
    "draft songs": "linkedResourcesManual",
    "draft printables": "linkedResourcesManual",
  });

  /** Exact/alias heading → activity field id. */
  const ACTIVITY_HEADING_ALIASES = freezeNormalizedAliases({
    "activity name": "title",
    title: "title",
    weekday: "dayOfWeek",
    "activity weekday": "dayOfWeek",
    day: "dayOfWeek",
    "day of week": "dayOfWeek",
    category: "activityCategory",
    "developmental domain": "activityCategory",
    "category / developmental domain": "activityCategory",
    "category/domain": "activityCategory",
    "recommended age": "ageModifications",
    age: "ageModifications",
    "estimated duration": "durationMinutes",
    duration: "durationMinutes",
    "activity objective": "objective",
    objective: "objective",
    "what children will do": "description",
    description: "description",
    materials: "materials",
    "teacher preparation": "preparation",
    "teacher prep": "preparation",
    preparation: "preparation",
    prep: "preparation",
    setup: "setup",
    "step-by-step directions": "steps",
    "step by step directions": "steps",
    steps: "steps",
    directions: "steps",
    "suggested questions": "teacherLanguage",
    "suggested questions to ask": "teacherLanguage",
    questions: "teacherLanguage",
    "learning and observation focus": "observationOpportunities",
    "learning & observation focus": "observationOpportunities",
    "observation focus": "observationOpportunities",
    "safety and supervision": "safetyNotes",
    safety: "safetyNotes",
    cleanup: "cleanupTips",
    "small group": "settingTag_small_group",
    "large group": "settingTag_large_group",
    indoor: "indoorAlternatives",
    "indoor option": "indoorAlternatives",
    outdoor: "outdoorAlternatives",
    "outdoor option": "outdoorAlternatives",
    "teacher tip": "teacherTips",
    "teacher tips": "teacherTips",
    "supply substitution": "substitutions",
    "supply substitutions": "substitutions",
    substitutions: "substitutions",
    "support adaptations": "adaptations",
    adaptations: "adaptations",
    "added challenge": "extensions",
    extensions: "extensions",
    "mixed-age adaptations": "mixedAgeAdaptations",
    "mixed age adaptations": "mixedAgeAdaptations",
    "observation prompts": "observationPrompts",
    observations: "observationPrompts",
    vocabulary: "vocabulary",
    "vocabulary words": "vocabulary",
    "image requirement": "imageRequirement",
    "image request": "imageRequirement",
    "setup example brief": "imageBriefSetup",
    "finished example brief": "imageBriefExample",
    "example image brief": "imageBriefExample",
    "setup image": "setupImageUpload",
    "setup image url": "setupImageUpload",
    "setup photo": "setupImageUpload",
    "example image": "exampleImageUpload",
    "example image url": "exampleImageUpload",
    "example images": "exampleImageUpload",
    "finished example image": "exampleImageUpload",
    "finished example image url": "exampleImageUpload",
    // Resource headings — recognized but never auto-applied from an activity paste.
    "linked resources": "linkedResourcesManual",
    printable: "linkedResourcesManual",
    printables: "linkedResourcesManual",
    books: "linkedResourcesManual",
    songs: "linkedResourcesManual",
    "draft books": "linkedResourcesManual",
    "draft songs": "linkedResourcesManual",
    "draft printables": "linkedResourcesManual",
  });

  const WEEK_FIELD_META = Object.freeze({
    weeklyOverview: { label: "Weekly overview", kind: "scalar", path: "weeklyOverview" },
    objectives: { label: "Learning objectives", kind: "lineList", path: "objectives", max: 40 },
    weeklyMaterials: { label: "Materials list", kind: "lineList", path: "weeklyMaterials", max: 80 },
    teacherPreparation: { label: "Teacher preparation / Toolkit", kind: "scalar", path: "teacherPreparation" },
    prepChecklist: { label: "Prep checklist", kind: "array", path: "teacherToolkit.prepChecklist", max: 24 },
    observationFocus: { label: "Observation focus", kind: "array", path: "teacherToolkit.observationFocus", max: 24 },
    familyConnection: { label: "Family connection", kind: "scalar", path: "familyConnection" },
    milestones: { label: "Milestones", kind: "milestones", path: "milestones", max: 16 },
    books: { label: "Books", kind: "recordList", path: "books", max: 24 },
    songs: { label: "Songs", kind: "recordList", path: "songs", max: 24 },
    printableIdeas: { label: "Printable Ideas", kind: "recordList", path: "printableIdeas", max: 24 },
    linkedResources: { label: "Linked Resources", kind: "linkedResources", path: "resourceIds" },
    linkedResourcesManual: {
      label: "Linked / draft resources",
      kind: "manualResource",
      path: null,
    },
  });

  const ACTIVITY_FIELD_META = Object.freeze({
    title: { label: "Activity name", kind: "scalar", path: "title" },
    dayOfWeek: { label: "Weekday", kind: "weekday", path: "dayOfWeek" },
    activityCategory: { label: "Category / developmental domain", kind: "scalar", path: "activityCategory" },
    ageModifications: { label: "Recommended age", kind: "scalar", path: "ageModifications" },
    durationMinutes: { label: "Estimated duration", kind: "duration", path: "durationMinutes" },
    objective: { label: "Activity objective", kind: "scalar", path: "objective" },
    description: { label: "What children will do", kind: "scalar", path: "description" },
    materials: { label: "Materials", kind: "lineList", path: "materials", max: 80 },
    preparation: { label: "Teacher preparation", kind: "scalar", path: "preparation" },
    setup: { label: "Setup", kind: "scalar", path: "setup" },
    steps: { label: "Step-by-step directions", kind: "orderedLineList", path: "steps", max: 40 },
    teacherLanguage: { label: "Suggested questions to ask", kind: "lineList", path: "teacherLanguage", max: 40 },
    observationOpportunities: {
      label: "Learning and observation focus",
      kind: "scalar",
      path: "observationOpportunities",
    },
    safetyNotes: { label: "Safety and supervision", kind: "scalar", path: "safetyNotes" },
    cleanupTips: { label: "Cleanup", kind: "scalar", path: "cleanupTips" },
    settingTag_small_group: {
      label: "Small group",
      kind: "settingTag",
      tag: "small_group",
      /**
       * Activity-level prose for Small/Large group does not exist in the current
       * curriculum item / enrichment draft schema (only day-level smallGroup /
       * largeGroup and week toolkit smallGroupOptions / largeGroupOptions).
       * Prose under this heading is NEVER persisted until owner approves a field.
       */
      proseUnsupported: true,
      proseUnsupportedReason:
        "UNSUPPORTED — NOT APPLIED. No activity-level Small group text field exists in the Teaching Kit schema today (only a setting chip). Day-level smallGroup and week toolkit smallGroupOptions are different scopes and must not receive activity paste content.",
    },
    settingTag_large_group: {
      label: "Large group",
      kind: "settingTag",
      tag: "large_group",
      proseUnsupported: true,
      proseUnsupportedReason:
        "UNSUPPORTED — NOT APPLIED. No activity-level Large group text field exists in the Teaching Kit schema today (only a setting chip). Day-level largeGroup and week toolkit largeGroupOptions are different scopes and must not receive activity paste content.",
    },
    indoorAlternatives: {
      label: "Indoor",
      kind: "scalarWithSettingTag",
      path: "indoorAlternatives",
      tag: "indoor",
    },
    outdoorAlternatives: {
      label: "Outdoor",
      kind: "scalarWithSettingTag",
      path: "outdoorAlternatives",
      tag: "outdoor",
    },
    teacherTips: { label: "Teacher tips", kind: "array", path: "teacherTips", max: 8 },
    substitutions: { label: "Supply substitutions", kind: "substitutions", path: "substitutions", max: 12 },
    adaptations: { label: "Support adaptations", kind: "scalar", path: "adaptations" },
    extensions: { label: "Added challenge", kind: "scalar", path: "extensions" },
    mixedAgeAdaptations: { label: "Mixed-age adaptations", kind: "scalar", path: "mixedAgeAdaptations" },
    observationPrompts: { label: "Observation prompts", kind: "array", path: "observationPrompts", max: 8 },
    vocabulary: { label: "Vocabulary", kind: "vocab", path: "vocabulary", max: 16 },
    imageRequirement: {
      label: "Image requirement",
      kind: "enum",
      path: "imageRequirement",
    },
    imageBriefSetup: { label: "Setup example brief", kind: "scalar", path: "imageBriefSetup" },
    imageBriefExample: { label: "Finished example brief", kind: "scalar", path: "imageBriefExample" },
    setupImageUpload: {
      label: "Setup image",
      kind: "uploadRequired",
      path: null,
      reason: "Activity setup photo is upload-only. Reference detected — manual upload required. Not applied as a fake file.",
    },
    exampleImageUpload: {
      label: "Finished example image",
      kind: "uploadRequired",
      path: null,
      reason: "Activity finished example photo is upload-only. Reference detected — manual upload required. Not applied as a fake file.",
    },
    linkedResourcesManual: {
      label: "Linked / draft resources",
      kind: "manualResource",
      path: null,
    },
  });

  /**
   * System/identity fields copied onto a Replace-mode draft activity.
   * Editable instructional content is never preserved from this list.
   */
  const ACTIVITY_SYSTEM_PRESERVE_KEYS = Object.freeze([
    "id",
    "itemId",
    "lessonPlanId",
    "createdAt",
    "createdBy",
    "updatedBy",
    "ownerId",
    "version",
    "revision",
    "sourceActivityId",
    "sourceKey",
    "activityId",
    "setupImageUrl",
    "exampleImageUrl",
    "setupImageThumbUrl",
    "exampleImageThumbUrl",
    "setupMediaAssetId",
    "exampleMediaAssetId",
    "setupPhotoUrl",
    "examplePhotoUrl",
    "imageRequirement",
  ]);

  const ACTIVITY_REPLACE_REQUIRED_FIELD_IDS = Object.freeze([
    "title",
    "dayOfWeek",
    "activityCategory",
    "ageModifications",
    "durationMinutes",
    "objective",
    "description",
    "materials",
    "preparation",
    "setup",
    "steps",
    "teacherLanguage",
    "observationOpportunities",
    "safetyNotes",
    "cleanupTips",
  ]);

  const ACTIVITY_REPLACE_PREVIEW_GROUPS = Object.freeze({
    core: [
      "title",
      "dayOfWeek",
      "activityCategory",
      "ageModifications",
      "durationMinutes",
      "objective",
      "description",
      "materials",
      "preparation",
      "setup",
    ],
    teaching: ["steps", "teacherLanguage", "observationOpportunities"],
    safety: ["safetyNotes", "cleanupTips"],
    enrichment: [
      "settingTag_small_group",
      "settingTag_large_group",
      "indoorAlternatives",
      "outdoorAlternatives",
      "teacherTips",
      "substitutions",
      "adaptations",
      "extensions",
      "mixedAgeAdaptations",
      "observationPrompts",
      "vocabulary",
    ],
  });

  const ACTIVITY_REPLACE_EMPTY_BY_PATH = Object.freeze({
    title: "",
    dayOfWeek: "",
    activityCategory: "",
    ageModifications: "",
    durationMinutes: "",
    objective: "",
    description: "",
    materials: "",
    preparation: "",
    setup: "",
    steps: "",
    teacherLanguage: "",
    observationOpportunities: "",
    safetyNotes: "",
    cleanupTips: "",
    indoorAlternatives: "",
    outdoorAlternatives: "",
    adaptations: "",
    extensions: "",
    mixedAgeAdaptations: "",
    teacherTips: [],
    substitutions: [],
    observationPrompts: [],
    vocabulary: [],
    settingTags: [],
    imageBriefSetup: "",
    imageBriefExample: "",
    imageRequirementAiSuggestion: "",
  });

  function weekKitApi() {
    if (typeof globalThis !== "undefined" && globalThis.LLHCurriculumWeekKitPaste) {
      return globalThis.LLHCurriculumWeekKitPaste;
    }
    if (typeof require === "function") {
      try { return require("./curriculum-week-kit-paste.js"); } catch (_error) { return null; }
    }
    return null;
  }

  function text(value) {
    if (value == null) return "";
    if (typeof value === "object") return "";
    return String(value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function stripListMarker(line) {
    return text(line)
      .replace(/^[-*•●▪◦]+\s+/, "")
      .replace(/^\d+[\.)]\s+/, "")
      .replace(/^[a-z][\.)]\s+/i, "")
      .trim();
  }

  function splitContentLines(body) {
    return text(body)
      .split(/\r?\n/)
      .map(stripListMarker)
      .filter(Boolean);
  }

  /** Steps: keep owner numbering/punctuation; only trim blank lines. */
  function splitOrderedStepLines(body) {
    return text(body)
      .split(/\r?\n/)
      .map((line) => text(line))
      .filter(Boolean);
  }

  function stepDedupeKey(line) {
    return stripListMarker(line).toLowerCase();
  }

  /**
   * Vocabulary: one word/phrase per line, or comma/semicolon separated on a single line.
   */
  function parseVocabularyItems(body) {
    const lines = text(body).split(/\r?\n/).map((line) => text(line)).filter(Boolean);
    const items = [];
    lines.forEach((line) => {
      const cleaned = stripListMarker(line);
      if (!cleaned) return;
      if (/,|;/.test(cleaned) && !/\s{2,}/.test(cleaned)) {
        cleaned.split(/[,;]+/).map((part) => text(part)).filter(Boolean).forEach((part) => items.push(part));
      } else {
        items.push(cleaned);
      }
    });
    return dedupePreserveOrder(items);
  }

  function dedupePreserveOrder(items, keyFn) {
    const seen = new Set();
    const out = [];
    asArray(items).forEach((item) => {
      const key = keyFn ? keyFn(item) : text(item).toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return out;
  }

  function normalizeMilestoneLabel(raw) {
    const cleaned = text(raw).replace(/\s+/g, " ");
    if (!cleaned) return "";
    const lower = cleaned.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
    const hit = WEEK_MILESTONE_BANK.find((m) => m.toLowerCase().replace(/-/g, " ") === lower);
    return hit || "";
  }

  function parseWeekday(raw) {
    const cleaned = text(raw).toLowerCase();
    if (WEEKDAYS.includes(cleaned)) return cleaned;
    const map = {
      mon: "monday",
      tue: "tuesday",
      tues: "tuesday",
      wed: "wednesday",
      thu: "thursday",
      thur: "thursday",
      thurs: "thursday",
      fri: "friday",
    };
    if (map[cleaned]) return map[cleaned];
    const full = WEEKDAYS.find((d) => d.startsWith(cleaned) || cleaned.startsWith(d));
    return full || "";
  }

  function parseDurationValue(raw) {
    const s = text(raw);
    if (!s) return "";
    if (/^\d+$/.test(s)) return Number(s);
    return s;
  }

  function parseSubstitutionBlocks(body) {
    const lines = text(body).split(/\r?\n/).map((line) => text(line)).filter(Boolean);
    const out = [];
    let pendingNeed = "";
    lines.forEach((line) => {
      const cleaned = stripListMarker(line);
      const arrow = cleaned.match(/^(?:no\s+)?(.+?)\s*(?:→|->|=>|—)\s*(?:use\s+)?(.+)$/i);
      if (arrow) {
        const need = text(arrow[1].replace(/^if\s+missing:?\s*/i, ""));
        const use = text(arrow[2].replace(/^use\s+instead:?\s*/i, ""));
        if (need && use) out.push({ need, use });
        pendingNeed = "";
        return;
      }
      const needMatch = cleaned.match(/^(?:if\s+missing|need|missing)\s*:?\s*(.+)$/i);
      if (needMatch) {
        pendingNeed = text(needMatch[1]);
        return;
      }
      const useMatch = cleaned.match(/^(?:use\s+instead|use|instead)\s*:?\s*(.+)$/i);
      if (useMatch && pendingNeed) {
        const use = text(useMatch[1]);
        if (use) out.push({ need: pendingNeed, use });
        pendingNeed = "";
        return;
      }
      if (useMatch && !pendingNeed) {
        const use = text(useMatch[1]);
        if (use) out.push({ need: "listed material", use });
        pendingNeed = "";
        return;
      }
      if (pendingNeed && cleaned) {
        // Second line without explicit "use instead" — treat as use value.
        out.push({ need: pendingNeed, use: cleaned });
        pendingNeed = "";
      }
    });
    return dedupePreserveOrder(out, (s) => `${text(s.need).toLowerCase()}=>${text(s.use).toLowerCase()}`);
  }

  /**
   * Split pasted text into heading sections.
   * A heading is either:
   * - a line with "Label:" whose normalized label is in the alias map, or
   * - a bare line whose entire normalized text exactly matches a known alias.
   * Unknown short sentences and body lines never become headings.
   */
  function splitLabeledSections(pastedText, aliasMap) {
    const lines = String(pastedText || "").replace(/\r\n/g, "\n").split("\n");
    const sections = [];
    let current = null;
    const bodyLines = [];

    function flush() {
      if (!current) return;
      sections.push({
        headingRaw: current.headingRaw,
        fieldId: current.fieldId,
        body: bodyLines.join("\n").replace(/^\n+|\n+$/g, ""),
        recognized: Boolean(current.fieldId),
      });
      bodyLines.length = 0;
      current = null;
    }

    function startKnownHeading(labelPart, fieldId, rest) {
      flush();
      current = {
        headingRaw: String(labelPart || "").trim(),
        fieldId,
      };
      if (rest) bodyLines.push(rest);
    }

    lines.forEach((line) => {
      const trimmed = line.trim();
      const headingMatch = trimmed.match(/^(.+?)\s*:\s*(.*)$/);
      if (headingMatch) {
        const labelPart = headingMatch[1];
        const rest = headingMatch[2];
        const normalized = normalizeHeading(labelPart);
        // Only treat as a heading when the label (before colon) is a known alias,
        // or when the line is "Label:" with optional same-line value.
        // Reject lines like "Can you hear the rattle?" (no known label).
        const fieldId = Object.prototype.hasOwnProperty.call(aliasMap, normalized)
          ? aliasMap[normalized]
          : "";
        if (fieldId) {
          startKnownHeading(labelPart, fieldId, rest);
          return;
        }
        // Unknown "Label:" with empty rest still starts an unrecognized section so
        // nested unknown headings cannot leak into the previous field's body.
        if (/^[A-Za-z][A-Za-z0-9 /&'-]{0,60}$/.test(labelPart) && rest === "" && /[A-Za-z]/.test(labelPart)) {
          flush();
          current = {
            headingRaw: labelPart.trim(),
            fieldId: "",
          };
          return;
        }
      } else if (trimmed) {
        // Bare known alias only — never invent headings from ordinary body sentences.
        const bareNormalized = normalizeHeading(trimmed.replace(/[:：]+$/g, ""));
        if (Object.prototype.hasOwnProperty.call(aliasMap, bareNormalized)
          && /^[A-Za-z][A-Za-z0-9 /&'’:,-]{0,80}$/.test(trimmed)
          && !/[.!?]$/.test(trimmed)) {
          startKnownHeading(trimmed.replace(/[:：]+$/g, "").trim(), aliasMap[bareNormalized], "");
          return;
        }
      }
      if (!current) {
        // Leading content before any heading → unrecognized preamble.
        current = { headingRaw: "(preamble)", fieldId: "" };
      }
      bodyLines.push(line);
    });
    flush();
    return sections;
  }

  function linesFromScalarOrList(value, { preserveMarkers = false } = {}) {
    if (Array.isArray(value)) {
      return asArray(value).map((item) => text(item)).filter(Boolean);
    }
    return text(value)
      .split(/\r?\n/)
      .map((line) => (preserveMarkers ? text(line) : stripListMarker(line)))
      .filter(Boolean);
  }

  function getByPath(obj, path) {
    if (!path) return undefined;
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length; i += 1) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function ensureWeekToolkit(week) {
    if (!week.teacherToolkit || typeof week.teacherToolkit !== "object") {
      week.teacherToolkit = {
        prepChecklist: [],
        observationFocus: [],
        notes: "",
        teacherPreparation: "",
      };
    }
    return week.teacherToolkit;
  }

  function buildListDiff(currentItems, pastedItems, { max = 40, keyFn = null } = {}) {
    const keyOf = typeof keyFn === "function"
      ? keyFn
      : (item) => text(item).toLowerCase();
    const current = dedupePreserveOrder(currentItems, keyOf);
    const currentKeys = new Set(current.map((item) => keyOf(item)));
    const add = [];
    const duplicates = [];
    dedupePreserveOrder(pastedItems, keyOf).forEach((item) => {
      const key = keyOf(item);
      if (!key) return;
      if (currentKeys.has(key)) {
        duplicates.push(item);
        return;
      }
      if (add.length + current.length >= max) return;
      currentKeys.add(key);
      add.push(item);
    });
    return {
      keep: current,
      add,
      duplicates,
      selected: true,
      next: [...current, ...add].slice(0, max),
    };
  }

  function buildScalarDiff(currentValue, pastedValue) {
    const current = text(currentValue);
    const next = text(pastedValue);
    if (!next) {
      return {
        kind: "scalar",
        current,
        next: "",
        action: "noop",
        selected: false,
        blankFill: false,
        requiresReplace: false,
      };
    }
    if (!current) {
      return {
        kind: "scalar",
        current: "",
        next,
        action: "fill",
        selected: true,
        blankFill: true,
        requiresReplace: false,
      };
    }
    if (current === next) {
      return {
        kind: "scalar",
        current,
        next,
        action: "unchanged",
        selected: false,
        blankFill: false,
        requiresReplace: false,
      };
    }
    return {
      kind: "scalar",
      current,
      next,
      action: "replace",
      selected: false,
      blankFill: false,
      requiresReplace: true,
    };
  }

  function buildWeekPreview(pastedText, currentWeek, publishedPlan, options = {}) {
    const week = currentWeek && typeof currentWeek === "object" ? currentWeek : {};
    const plan = publishedPlan && typeof publishedPlan === "object" ? publishedPlan : {};
    const toolkit = week.teacherToolkit && typeof week.teacherToolkit === "object" ? week.teacherToolkit : {};
    const kit = weekKitApi();
    const sections = splitLabeledSections(pastedText, WEEK_HEADING_ALIASES);
    const fieldChanges = [];
    const unrecognized = [];
    const manualResources = [];
    const seenFields = new Set();
    const kitTextBuffers = {};

    function currentFor(fieldId) {
      if (fieldId === "weeklyOverview") {
        return text(week.weeklyOverview) || text(plan.weeklyOverview);
      }
      if (fieldId === "objectives") {
        return text(week.objectives) || text(plan.objectives);
      }
      if (fieldId === "weeklyMaterials") {
        return text(week.weeklyMaterials) || text(plan.weeklyMaterials);
      }
      if (fieldId === "teacherPreparation") {
        return text(week.teacherPreparation)
          || text(toolkit.teacherPreparation)
          || text(plan.teachingKit?.teacherToolkit?.teacherPreparation);
      }
      if (fieldId === "familyConnection") {
        return text(week.familyConnection) || text(plan.familyConnection);
      }
      if (fieldId === "prepChecklist") {
        return asArray(toolkit.prepChecklist).map(text).filter(Boolean);
      }
      if (fieldId === "observationFocus") {
        return asArray(toolkit.observationFocus).map(text).filter(Boolean);
      }
      if (fieldId === "milestones") {
        return asArray(week.milestones).map(text).filter(Boolean);
      }
      if (fieldId === "books") return asArray(week.books);
      if (fieldId === "songs") return asArray(week.songs);
      if (fieldId === "printableIdeas") return asArray(week.printableIdeas);
      return "";
    }

    sections.forEach((section) => {
      if (!section.fieldId) {
        if (text(section.body) || (section.headingRaw && section.headingRaw !== "(preamble)")) {
          unrecognized.push({
            heading: section.headingRaw,
            body: section.body,
          });
        }
        return;
      }
      const meta = WEEK_FIELD_META[section.fieldId];
      if (!meta) {
        unrecognized.push({ heading: section.headingRaw, body: section.body });
        return;
      }
      if (meta.kind === "manualResource") {
        manualResources.push({
          heading: section.headingRaw,
          body: section.body,
          note: "Requires manual resource action",
        });
        return;
      }
      if (meta.kind === "recordList" || meta.kind === "linkedResources") {
        if (!kit) {
          if (meta.kind === "linkedResources") {
            manualResources.push({ heading: section.headingRaw, body: section.body, note: "Requires manual resource action" });
          } else {
            unrecognized.push({ heading: section.headingRaw, body: section.body });
          }
          return;
        }
        const kitBody = `${section.headingRaw}:\n${section.body || ""}`;
        kitTextBuffers[section.fieldId] = `${kitTextBuffers[section.fieldId] || ""}\n\n${kitBody}`.trim();
        return;
      }
      if (seenFields.has(section.fieldId)) {
        // Later duplicate headings append body into the first change when list-like.
        const existing = fieldChanges.find((c) => c.fieldId === section.fieldId);
        if (existing && (meta.kind === "array" || meta.kind === "lineList" || meta.kind === "milestones")) {
          const extra = splitContentLines(section.body);
          if (meta.kind === "milestones") {
            const unknown = [];
            const valid = [];
            extra.forEach((item) => {
              const norm = normalizeMilestoneLabel(item);
              if (norm) valid.push(norm);
              else if (text(item)) unknown.push(item);
            });
            const listDiff = buildListDiff(
              existing.list.keep,
              [...(existing.list.add || []), ...valid],
              { max: meta.max },
            );
            existing.list = {
              ...listDiff,
              unknown: dedupePreserveOrder([...(existing.list.unknown || []), ...unknown]),
            };
            existing.selected = listDiff.add.length > 0;
          } else {
            existing.list = buildListDiff(
              existing.list.keep,
              [...(existing.list.add || []), ...extra],
              { max: meta.max },
            );
            if (meta.kind === "lineList") {
              existing.nextText = existing.list.next.join("\n");
            }
            existing.selected = existing.list.add.length > 0;
          }
        }
        return;
      }
      seenFields.add(section.fieldId);

      if (meta.kind === "scalar") {
        const scalar = buildScalarDiff(currentFor(section.fieldId), section.body);
        fieldChanges.push({
          fieldId: section.fieldId,
          label: meta.label,
          kind: "scalar",
          ...scalar,
        });
        return;
      }

      if (meta.kind === "lineList") {
        const currentLines = linesFromScalarOrList(currentFor(section.fieldId));
        const pastedLines = splitContentLines(section.body);
        const list = buildListDiff(currentLines, pastedLines, { max: meta.max });
        fieldChanges.push({
          fieldId: section.fieldId,
          label: meta.label,
          kind: "lineList",
          list,
          nextText: list.next.join("\n"),
          selected: list.add.length > 0,
        });
        return;
      }

      if (meta.kind === "array") {
        const currentItems = currentFor(section.fieldId);
        const pastedItems = splitContentLines(section.body);
        const list = buildListDiff(currentItems, pastedItems, { max: meta.max });
        fieldChanges.push({
          fieldId: section.fieldId,
          label: meta.label,
          kind: "array",
          list,
          selected: list.add.length > 0,
        });
        return;
      }

      if (meta.kind === "milestones") {
        const currentItems = currentFor(section.fieldId);
        const unknown = [];
        const valid = [];
        splitContentLines(section.body).forEach((item) => {
          const norm = normalizeMilestoneLabel(item);
          if (norm) valid.push(norm);
          else if (text(item)) unknown.push(item);
        });
        const list = buildListDiff(currentItems, valid, { max: meta.max });
        fieldChanges.push({
          fieldId: section.fieldId,
          label: meta.label,
          kind: "milestones",
          list: { ...list, unknown },
          selected: list.add.length > 0,
        });
      }
    });

    Object.keys(kitTextBuffers).forEach((fieldId) => {
      const meta = WEEK_FIELD_META[fieldId];
      const body = kitTextBuffers[fieldId];
      if (!kit || !meta) return;
      if (meta.kind === "recordList") {
        const parsedKit = fieldId === "books"
          ? kit.parseBooksSection(body)
          : fieldId === "songs"
            ? kit.parseSongsSection(body)
            : kit.parsePrintableIdeasSection(body);
        const incoming = parsedKit.records || [];
        fieldChanges.push({
          fieldId,
          label: meta.label,
          kind: "recordList",
          records: kit.mergeRecordsByTitle(currentFor(fieldId), incoming, meta.max),
          incoming,
          titles: incoming.map((item) => item.title),
          selected: incoming.length > 0,
          unsupported: parsedKit.unsupported || [],
        });
        return;
      }
      if (meta.kind === "linkedResources") {
        const parsedLinks = kit.parseLinkedResourcesSection(
          body,
          options.existingResources,
          { ageDisplay: text(plan.age) },
        );
        const existingIds = new Set(
          [...asArray(plan.resourceIds), ...asArray(options.existingResourceIds)].map(text).filter(Boolean),
        );
        const resolved = (parsedLinks.resolved || []).map((item) => ({
          ...item,
          alreadyLinked: existingIds.has(text(item.resource?.id)),
        }));
        const unresolved = parsedLinks.unresolved || [];
        unresolved.forEach((item) => {
          manualResources.push({
            heading: item.entry?.title || "Linked resource",
            body: item.reason || "",
            note: "Requires manual resource action",
          });
        });
        fieldChanges.push({
          fieldId,
          label: meta.label,
          kind: "linkedResources",
          resolved,
          unresolved,
          destination: "Lesson → Linked Resources → Printables",
          selected: resolved.some((row) => row.resource?.id && !row.alreadyLinked),
        });
      }
    });

    return {
      scope: "week",
      fieldChanges,
      unrecognized,
      manualResources,
      activityKey: "",
    };
  }

  function resolveActivityCurrent(fieldId, activity, draftActivity) {
    const act = activity && typeof activity === "object" ? activity : {};
    const d = draftActivity && typeof draftActivity === "object" ? draftActivity : {};
    const meta = ACTIVITY_FIELD_META[fieldId];
    if (!meta) return "";

    if (meta.kind === "settingTag") {
      const tags = asArray(d.settingTags).length
        ? asArray(d.settingTags).map(text)
        : asArray(act.settingTags).map(text);
      return tags.includes(meta.tag) ? meta.tag : "";
    }

    if (meta.path === "durationMinutes") {
      if (Object.prototype.hasOwnProperty.call(d, "durationMinutes")) {
        const v = d.durationMinutes;
        if (v === "" || v === null || v === undefined) return "";
        return String(v);
      }
      if (act.durationMinutes === null || act.durationMinutes === undefined) return "";
      return String(act.durationMinutes);
    }

    if (meta.path === "materials") {
      if (Object.prototype.hasOwnProperty.call(d, "materials")) {
        return Array.isArray(d.materials)
          ? d.materials.map(text).filter(Boolean).join("\n")
          : text(d.materials);
      }
      return Array.isArray(act.materials)
        ? act.materials.map(text).filter(Boolean).join("\n")
        : text(act.materials);
    }

    if (meta.path === "steps") {
      if (Object.prototype.hasOwnProperty.call(d, "steps")) {
        return Array.isArray(d.steps)
          ? d.steps.map(text).filter(Boolean).join("\n")
          : text(d.steps);
      }
      const src = act.steps || act.directions;
      return Array.isArray(src) ? src.map(text).filter(Boolean).join("\n") : text(src);
    }

    if (meta.path === "preparation") {
      if (Object.prototype.hasOwnProperty.call(d, "preparation")) return text(d.preparation);
      return text(act.preparation || act.prep);
    }

    if (meta.path === "cleanupTips") {
      if (Object.prototype.hasOwnProperty.call(d, "cleanupTips")) return text(d.cleanupTips);
      return text(act.cleanupTips || act.cleanup || act.resetNotes);
    }

    if (meta.path === "mixedAgeAdaptations") {
      if (Object.prototype.hasOwnProperty.call(d, "mixedAgeAdaptations")) return text(d.mixedAgeAdaptations);
      return text(act.mixedAgeAdaptations || act.mixedAge);
    }

    if (meta.kind === "array" || meta.kind === "vocab") {
      if (Object.prototype.hasOwnProperty.call(d, meta.path)) {
        const raw = d[meta.path];
        if (meta.kind === "vocab") {
          if (Array.isArray(raw)) return asArray(raw).map(text).filter(Boolean);
          return text(raw).split(/[,;\n]+/).map(text).filter(Boolean);
        }
        return asArray(raw).map(text).filter(Boolean);
      }
      if (meta.kind === "vocab") {
        if (Array.isArray(act.vocabulary)) return asArray(act.vocabulary).map(text).filter(Boolean);
        return text(act.vocabulary).split(/[,;\n]+/).map(text).filter(Boolean);
      }
      if (meta.path === "observationPrompts") {
        if (asArray(act.observationPrompts).length) {
          return asArray(act.observationPrompts).map(text).filter(Boolean);
        }
        return text(act.observationOpportunities).split(/\n+/).map(text).filter(Boolean);
      }
      return asArray(act[meta.path]).map(text).filter(Boolean);
    }

    if (meta.kind === "substitutions") {
      return asArray(Object.prototype.hasOwnProperty.call(d, "substitutions") ? d.substitutions : act.substitutions)
        .filter((s) => s && typeof s === "object")
        .map((s) => ({ need: text(s.need), use: text(s.use) }))
        .filter((s) => s.need && s.use);
    }

    if (Object.prototype.hasOwnProperty.call(d, meta.path)) return text(d[meta.path]);
    return text(act[meta.path]);
  }

  function buildActivityPreview(pastedText, activity, draftActivity, activityKey) {
    const key = text(activityKey);
    const sections = splitLabeledSections(pastedText, ACTIVITY_HEADING_ALIASES);
    const fieldChanges = [];
    const unrecognized = [];
    const manualResources = [];
    const seenFields = new Set();

    sections.forEach((section) => {
      if (!section.fieldId) {
        if (text(section.body) || (section.headingRaw && section.headingRaw !== "(preamble)")) {
          unrecognized.push({ heading: section.headingRaw, body: section.body });
        }
        return;
      }
      const meta = ACTIVITY_FIELD_META[section.fieldId];
      if (!meta) {
        unrecognized.push({ heading: section.headingRaw, body: section.body });
        return;
      }

      if (meta.kind === "unsupported") {
        fieldChanges.push({
          fieldId: section.fieldId,
          label: meta.label,
          kind: "unsupported",
          selected: false,
          applicable: false,
          body: section.body,
          reason: meta.reason || "UNSUPPORTED — NOT APPLIED.",
        });
        return;
      }
      if (meta.kind === "uploadRequired") {
        fieldChanges.push({
          fieldId: section.fieldId,
          label: meta.label,
          kind: "unsupported",
          selected: false,
          applicable: false,
          body: section.body,
          reason: meta.reason || "Upload-only field. Reference detected — manual upload required.",
        });
        return;
      }
      if (meta.kind === "enum" && section.fieldId === "imageRequirement") {
        const kit = weekKitApi();
        const parsedReq = kit && typeof kit.parseImageRequirement === "function"
          ? kit.parseImageRequirement(section.body)
          : "";
        if (!parsedReq) {
          fieldChanges.push({
            fieldId: section.fieldId,
            label: meta.label,
            kind: "unsupported",
            selected: false,
            applicable: false,
            body: section.body,
            reason: "Image requirement value is not an existing owner option. Not guessed.",
          });
          return;
        }
        const current = text(resolveActivityCurrent(section.fieldId, activity, draftActivity));
        const scalar = buildScalarDiff(current, parsedReq);
        fieldChanges.push({
          fieldId: section.fieldId,
          label: meta.label,
          kind: "scalar",
          ...scalar,
          parsedEnum: parsedReq,
        });
        seenFields.add(section.fieldId);
        return;
      }

      if (meta.kind === "manualResource") {
        if (text(section.body) || text(section.headingRaw)) {
          manualResources.push({
            heading: section.headingRaw,
            body: section.body,
          });
        }
        return;
      }

      if (meta.kind === "settingTag") {
        const currentTag = resolveActivityCurrent(section.fieldId, activity, draftActivity);
        const prose = text(section.body);
        const alreadyOn = Boolean(currentTag);
        if (prose && meta.proseUnsupported) {
          // Critical: never present prose as ADD/REPLACE when it cannot persist/redisplay.
          fieldChanges.push({
            fieldId: `${section.fieldId}_prose`,
            label: `${meta.label} (text)`,
            kind: "unsupported",
            selected: false,
            applicable: false,
            body: prose,
            reason: meta.proseUnsupportedReason
              || "UNSUPPORTED — NOT APPLIED. No persisted text field exists for this heading.",
          });
        }
        // Setting chip may still be offered as supplemental metadata (not a prose substitute).
        fieldChanges.push({
          fieldId: section.fieldId,
          label: `${meta.label} (setting tag)`,
          kind: "settingTag",
          tag: meta.tag,
          current: alreadyOn ? meta.label : "",
          next: meta.label,
          action: alreadyOn ? "unchanged" : "add",
          selected: !alreadyOn,
          proseNote: prose
            ? "Supplemental chip only — pasted paragraph text is listed separately as unsupported."
            : "",
        });
        seenFields.add(section.fieldId);
        return;
      }

      if (seenFields.has(section.fieldId)) {
        const existing = fieldChanges.find((c) => c.fieldId === section.fieldId);
        if (!existing) return;
        if (meta.kind === "array" || meta.kind === "vocab" || meta.kind === "lineList"
          || meta.kind === "orderedLineList") {
          const extra = meta.kind === "vocab"
            ? parseVocabularyItems(section.body)
            : meta.kind === "orderedLineList"
              ? splitOrderedStepLines(section.body)
              : splitContentLines(section.body);
          const priorDuplicates = asArray(existing.list?.duplicates);
          // Re-diff against original keep, including previously queued adds + new lines.
          // Also re-include prior duplicate lines so they remain visible as ignored.
          existing.list = buildListDiff(
            existing.list?.keep || [],
            [...(existing.list?.add || []), ...priorDuplicates, ...extra],
            {
              max: meta.max,
              keyFn: meta.kind === "orderedLineList" ? stepDedupeKey : null,
            },
          );
          if (meta.kind === "lineList" || meta.kind === "orderedLineList") {
            existing.nextText = existing.list.next.join("\n");
          }
          existing.selected = existing.list.add.length > 0;
        } else if (meta.kind === "substitutions") {
          const extra = parseSubstitutionBlocks(section.body);
          const currentItems = existing.list?.keep || [];
          const alreadyQueued = existing.list?.add || [];
          const currentKeys = new Set(
            currentItems.concat(alreadyQueued)
              .map((s) => `${text(s.need).toLowerCase()}=>${text(s.use).toLowerCase()}`),
          );
          const add = alreadyQueued.slice();
          const duplicates = (existing.list?.duplicates || []).slice();
          extra.forEach((item) => {
            const keyName = `${text(item.need).toLowerCase()}=>${text(item.use).toLowerCase()}`;
            if (currentKeys.has(keyName)) {
              duplicates.push(item);
              return;
            }
            if (currentItems.length + add.length >= (meta.max || 12)) return;
            currentKeys.add(keyName);
            add.push(item);
          });
          existing.list = {
            keep: currentItems,
            add,
            duplicates,
            next: [...currentItems, ...add].slice(0, meta.max || 12),
          };
          existing.selected = add.length > 0;
        }
        return;
      }

      if (meta.kind === "scalar" || meta.kind === "duration" || meta.kind === "weekday"
        || meta.kind === "scalarWithSettingTag") {
        let pastedValue = section.body;
        if (meta.kind === "weekday") {
          pastedValue = parseWeekday(section.body);
          if (!pastedValue) {
            unrecognized.push({ heading: section.headingRaw, body: section.body, note: "Unsupported weekday" });
            return;
          }
        }
        if (meta.kind === "duration") {
          pastedValue = String(parseDurationValue(section.body));
        }
        const current = resolveActivityCurrent(section.fieldId, activity, draftActivity);
        const scalar = buildScalarDiff(current, pastedValue);
        const change = {
          ...scalar,
          fieldId: section.fieldId,
          label: meta.label,
          kind: meta.kind === "scalarWithSettingTag" ? "scalarWithSettingTag" : "scalar",
          tag: meta.tag || "",
        };
        if (meta.kind === "duration") {
          change.parsedDuration = parseDurationValue(section.body);
        }
        if (meta.kind === "weekday") {
          change.parsedWeekday = pastedValue;
        }
        fieldChanges.push(change);
        seenFields.add(section.fieldId);
        return;
      }

      if (meta.kind === "lineList" || meta.kind === "orderedLineList") {
        const preserveMarkers = meta.kind === "orderedLineList";
        const currentLines = linesFromScalarOrList(
          resolveActivityCurrent(section.fieldId, activity, draftActivity),
          { preserveMarkers },
        );
        const pastedLines = preserveMarkers
          ? splitOrderedStepLines(section.body)
          : splitContentLines(section.body);
        const list = buildListDiff(currentLines, pastedLines, {
          max: meta.max,
          keyFn: preserveMarkers ? stepDedupeKey : null,
        });
        fieldChanges.push({
          fieldId: section.fieldId,
          label: meta.label,
          kind: meta.kind,
          list,
          nextText: list.next.join("\n"),
          selected: list.add.length > 0,
        });
        seenFields.add(section.fieldId);
        return;
      }

      if (meta.kind === "array") {
        const currentItems = resolveActivityCurrent(section.fieldId, activity, draftActivity);
        const pastedItems = splitContentLines(section.body);
        const list = buildListDiff(currentItems, pastedItems, { max: meta.max });
        fieldChanges.push({
          fieldId: section.fieldId,
          label: meta.label,
          kind: "array",
          list,
          selected: list.add.length > 0,
        });
        seenFields.add(section.fieldId);
        return;
      }

      if (meta.kind === "vocab") {
        const currentItems = resolveActivityCurrent(section.fieldId, activity, draftActivity);
        const pastedItems = parseVocabularyItems(section.body);
        const list = buildListDiff(currentItems, pastedItems, { max: meta.max });
        fieldChanges.push({
          fieldId: section.fieldId,
          label: meta.label,
          kind: "vocab",
          list,
          selected: list.add.length > 0,
        });
        seenFields.add(section.fieldId);
        return;
      }

      if (meta.kind === "substitutions") {
        const currentItems = resolveActivityCurrent(section.fieldId, activity, draftActivity);
        const pastedItems = parseSubstitutionBlocks(section.body);
        const currentKeys = new Set(
          currentItems.map((s) => `${text(s.need).toLowerCase()}=>${text(s.use).toLowerCase()}`),
        );
        const add = [];
        const duplicates = [];
        pastedItems.forEach((item) => {
          const keyName = `${text(item.need).toLowerCase()}=>${text(item.use).toLowerCase()}`;
          if (currentKeys.has(keyName)) {
            duplicates.push(item);
            return;
          }
          if (currentItems.length + add.length >= meta.max) return;
          currentKeys.add(keyName);
          add.push(item);
        });
        fieldChanges.push({
          fieldId: section.fieldId,
          label: meta.label,
          kind: "substitutions",
          list: {
            keep: currentItems,
            add,
            duplicates,
            next: [...currentItems, ...add].slice(0, meta.max),
          },
          selected: add.length > 0,
        });
        seenFields.add(section.fieldId);
      }
    });

    return {
      scope: "activity",
      activityKey: key,
      fieldChanges,
      unrecognized,
      manualResources,
    };
  }

  /**
   * Apply selected preview changes into a draft clone.
   * Never mutates activities other than `activityKey` for activity scope.
   * Never mutates week for activity scope (and vice versa).
   */
  function applyPreviewToDraft(draftInput, preview, { selectedFieldIds } = {}) {
    const draft = draftInput && typeof draftInput === "object"
      ? JSON.parse(JSON.stringify(draftInput))
      : { activities: {}, week: {} };
    if (!draft.activities || typeof draft.activities !== "object") draft.activities = {};
    if (!draft.week || typeof draft.week !== "object") draft.week = {};

    const appliedFields = [];
    const selected = new Set(
      Array.isArray(selectedFieldIds)
        ? selectedFieldIds.map(text).filter(Boolean)
        : (preview.fieldChanges || [])
          .filter((c) => c.selected && c.kind !== "unsupported" && c.applicable !== false)
          .map((c) => c.fieldId),
    );

    if (preview.scope === "week") {
      const activitiesSnapshot = JSON.parse(JSON.stringify(draft.activities));
      (preview.fieldChanges || []).forEach((change) => {
        if (!selected.has(change.fieldId)) return;
        if (change.kind === "scalar") {
          if (change.action === "noop" || change.action === "unchanged") return;
          // selectedFieldIds / change inclusion means owner approved replace or fill.
          if (!text(change.next)) return;
          draft.week[change.fieldId] = change.next;
          if (change.fieldId === "objectives") {
            if (!draft.week.fieldOwnership || typeof draft.week.fieldOwnership !== "object") {
              draft.week.fieldOwnership = {};
            }
            draft.week.fieldOwnership.objectives = true;
          }
          if (change.fieldId === "teacherPreparation") {
            const toolkit = ensureWeekToolkit(draft.week);
            toolkit.teacherPreparation = change.next;
          }
          appliedFields.push(change.fieldId);
          return;
        }
        if (change.kind === "lineList") {
          draft.week[change.fieldId] = change.nextText || (change.list?.next || []).join("\n");
          if (change.fieldId === "objectives") {
            if (!draft.week.fieldOwnership || typeof draft.week.fieldOwnership !== "object") {
              draft.week.fieldOwnership = {};
            }
            draft.week.fieldOwnership.objectives = true;
          }
          appliedFields.push(change.fieldId);
          return;
        }
        if (change.kind === "array") {
          const toolkit = ensureWeekToolkit(draft.week);
          if (change.fieldId === "prepChecklist") {
            toolkit.prepChecklist = asArray(change.list?.next).map(text).filter(Boolean).slice(0, 24);
          } else if (change.fieldId === "observationFocus") {
            toolkit.observationFocus = asArray(change.list?.next).map(text).filter(Boolean).slice(0, 24);
          }
          appliedFields.push(change.fieldId);
          return;
        }
        if (change.kind === "milestones") {
          draft.week.milestones = asArray(change.list?.next).map(text).filter(Boolean).slice(0, 16);
          appliedFields.push(change.fieldId);
          return;
        }
        if (change.kind === "recordList") {
          const kit = weekKitApi();
          const current = asArray(draft.week[change.fieldId]);
          const incoming = asArray(change.incoming?.length ? change.incoming : change.records);
          draft.week[change.fieldId] = kit
            ? kit.mergeRecordsByTitle(current, incoming, 24)
            : current.concat(incoming).slice(0, 24);
          appliedFields.push(change.fieldId);
          return;
        }
        if (change.kind === "linkedResources") {
          appliedFields.push(change.fieldId);
        }
      });
      // Isolation guarantee: week apply never mutates activity drafts.
      draft.activities = activitiesSnapshot;
      return { draft, appliedFields, scope: "week", activityKey: "" };
    }

    if (preview.scope === "activity") {
      const activityKey = text(preview.activityKey);
      if (!activityKey) {
        return { draft, appliedFields: [], scope: "activity", activityKey: "", error: "missing_activity_key" };
      }
      const weekSnapshot = JSON.stringify(draft.week);
      const otherActsSnapshot = {};
      Object.keys(draft.activities).forEach((k) => {
        if (k !== activityKey) otherActsSnapshot[k] = draft.activities[k];
      });

      if (!draft.activities[activityKey] || typeof draft.activities[activityKey] !== "object") {
        draft.activities[activityKey] = {};
      }
      const act = draft.activities[activityKey];

      (preview.fieldChanges || []).forEach((change) => {
        if (!selected.has(change.fieldId)) return;
        if (change.kind === "unsupported" || change.applicable === false) return;
        const meta = ACTIVITY_FIELD_META[change.fieldId];
        if (!meta) return;

        if (change.kind === "settingTag") {
          const list = asArray(act.settingTags).map(text).filter(Boolean);
          if (!list.includes(change.tag)) list.push(change.tag);
          act.settingTags = list.slice(0, 8);
          appliedFields.push(change.fieldId);
          return;
        }

        if (change.kind === "scalar" || change.kind === "scalarWithSettingTag") {
          if (change.action === "noop" || change.action === "unchanged") return;
          if (!text(change.next) && change.action !== "fill") return;
          if (change.fieldId === "durationMinutes") {
            act.durationMinutes = Object.prototype.hasOwnProperty.call(change, "parsedDuration")
              ? change.parsedDuration
              : parseDurationValue(change.next);
          } else if (change.fieldId === "dayOfWeek") {
            act.dayOfWeek = change.parsedWeekday || parseWeekday(change.next);
          } else {
            act[meta.path] = change.next;
          }
          if (change.kind === "scalarWithSettingTag" && change.tag) {
            const list = asArray(act.settingTags).map(text).filter(Boolean);
            if (!list.includes(change.tag)) list.push(change.tag);
            act.settingTags = list.slice(0, 8);
          }
          appliedFields.push(change.fieldId);
          return;
        }

        if (change.kind === "lineList" || change.kind === "orderedLineList") {
          act[meta.path] = change.nextText || (change.list?.next || []).join("\n");
          appliedFields.push(change.fieldId);
          return;
        }

        if (change.kind === "array" || change.kind === "vocab") {
          act[meta.path] = asArray(change.list?.next).map(text).filter(Boolean);
          if (meta.max) act[meta.path] = act[meta.path].slice(0, meta.max);
          appliedFields.push(change.fieldId);
          return;
        }

        if (change.kind === "substitutions") {
          act.substitutions = asArray(change.list?.next)
            .filter((s) => s && text(s.need) && text(s.use))
            .map((s) => ({ need: text(s.need), use: text(s.use) }))
            .slice(0, meta.max || 12);
          appliedFields.push(change.fieldId);
        }
      });

      // Isolation: restore week + other activities if anything leaked.
      draft.week = JSON.parse(weekSnapshot);
      Object.keys(draft.activities).forEach((k) => {
        if (k !== activityKey) {
          if (Object.prototype.hasOwnProperty.call(otherActsSnapshot, k)) {
            draft.activities[k] = otherActsSnapshot[k];
          } else {
            delete draft.activities[k];
          }
        }
      });
      // Re-apply other acts that existed.
      Object.keys(otherActsSnapshot).forEach((k) => {
        draft.activities[k] = otherActsSnapshot[k];
      });

      return { draft, appliedFields, scope: "activity", activityKey };
    }

    return { draft, appliedFields: [], scope: text(preview.scope), activityKey: "" };
  }

  function emptyValueForEditablePath(path) {
    if (Object.prototype.hasOwnProperty.call(ACTIVITY_REPLACE_EMPTY_BY_PATH, path)) {
      const blank = ACTIVITY_REPLACE_EMPTY_BY_PATH[path];
      return Array.isArray(blank) ? blank.slice() : blank;
    }
    return "";
  }

  function pickPreservedSystemFields(draftActivity, publishedActivity) {
    const out = {};
    const sources = [draftActivity, publishedActivity];
    ACTIVITY_SYSTEM_PRESERVE_KEYS.forEach((key) => {
      for (let i = 0; i < sources.length; i += 1) {
        const src = sources[i];
        if (src && typeof src === "object" && Object.prototype.hasOwnProperty.call(src, key)
          && src[key] !== undefined) {
          out[key] = JSON.parse(JSON.stringify(src[key]));
          break;
        }
      }
    });
    if (!text(out.id) && publishedActivity && text(publishedActivity.id)) {
      out.id = text(publishedActivity.id);
    }
    if (!text(out.itemId) && publishedActivity && text(publishedActivity.itemId)) {
      out.itemId = text(publishedActivity.itemId);
    }
    return out;
  }

  function parseReplaceSectionValue(fieldId, body) {
    const meta = ACTIVITY_FIELD_META[fieldId];
    if (!meta) return { ok: false };
    if (meta.kind === "manualResource") {
      return { ok: true, kind: "manualResource" };
    }
    if (meta.kind === "settingTag") {
      return {
        ok: true,
        kind: "settingTag",
        tag: meta.tag,
        prose: text(body),
        proseUnsupported: Boolean(meta.proseUnsupported),
        proseUnsupportedReason: meta.proseUnsupportedReason || "",
      };
    }
    if (meta.kind === "weekday") {
      const parsed = parseWeekday(body);
      if (!parsed) return { ok: false, note: "Unsupported weekday" };
      return { ok: true, kind: "weekday", value: parsed };
    }
    if (meta.kind === "duration") {
      return { ok: true, kind: "duration", value: parseDurationValue(body) };
    }
    if (meta.kind === "scalar" || meta.kind === "scalarWithSettingTag") {
      return {
        ok: true,
        kind: meta.kind,
        value: text(body),
        tag: meta.tag || "",
      };
    }
    if (meta.kind === "orderedLineList") {
      return { ok: true, kind: meta.kind, value: splitOrderedStepLines(body).slice(0, meta.max || 40) };
    }
    if (meta.kind === "lineList") {
      return { ok: true, kind: meta.kind, value: splitContentLines(body).slice(0, meta.max || 80) };
    }
    if (meta.kind === "array") {
      return { ok: true, kind: meta.kind, value: splitContentLines(body).slice(0, meta.max || 8) };
    }
    if (meta.kind === "vocab") {
      return { ok: true, kind: meta.kind, value: parseVocabularyItems(body).slice(0, meta.max || 16) };
    }
    if (meta.kind === "substitutions") {
      return {
        ok: true,
        kind: meta.kind,
        value: parseSubstitutionBlocks(body).slice(0, meta.max || 12),
      };
    }
    if (meta.kind === "uploadRequired" || meta.kind === "unsupported") {
      return { ok: true, kind: "unsupported", reason: meta.reason || "UNSUPPORTED — NOT APPLIED." };
    }
    if (meta.kind === "enum") {
      const kit = weekKitApi();
      const parsedReq = kit && typeof kit.parseImageRequirement === "function"
        ? kit.parseImageRequirement(body)
        : "";
      if (!parsedReq) return { ok: false, note: "Unsupported image requirement value" };
      return { ok: true, kind: "scalar", value: parsedReq };
    }
    return { ok: false };
  }

  function mergeReplaceParsedValues(prior, extra, kind, max) {
    if (kind === "lineList" || kind === "orderedLineList" || kind === "array" || kind === "vocab") {
      const keyFn = kind === "orderedLineList" ? stepDedupeKey : null;
      return dedupePreserveOrder([].concat(prior || [], extra || []), keyFn).slice(0, max || 80);
    }
    if (kind === "substitutions") {
      return dedupePreserveOrder(
        [].concat(prior || [], extra || []),
        (s) => `${text(s.need).toLowerCase()}=>${text(s.use).toLowerCase()}`,
      ).slice(0, max || 12);
    }
    return extra;
  }

  function displayReplaceValue(fieldId, value) {
    const meta = ACTIVITY_FIELD_META[fieldId];
    if (!meta) return "";
    if (value == null || value === "") return "";
    if (Array.isArray(value)) {
      if (meta.kind === "substitutions") {
        return value.map((s) => `If missing: ${s.need} → Use instead: ${s.use}`).join("\n");
      }
      return value.map((item) => (typeof item === "string" ? item : text(item))).filter(Boolean).join("\n");
    }
    return text(value);
  }

  function collectPlanResourceHints(plan, week) {
    const relationships = [];
    asArray(plan?.resourceIds).forEach((id) => {
      const rid = text(id);
      if (!rid) return;
      relationships.push({ kind: "resourceId", id: rid, title: rid });
    });
    asArray(week?.printableIds).forEach((id) => {
      const rid = text(id);
      if (!rid) return;
      relationships.push({ kind: "printableId", id: rid, title: rid });
    });
    asArray(plan?.books).concat(asArray(week?.books)).forEach((book) => {
      const title = text(book?.title || book);
      if (title) relationships.push({ kind: "book", id: title, title });
    });
    asArray(plan?.songs).concat(asArray(week?.songs)).forEach((song) => {
      const title = text(song?.title || song);
      if (title) relationships.push({ kind: "song", id: title, title });
    });
    return { relationships };
  }

  function materialsMayMatchResource(materialsText, resourceTitle) {
    const hay = text(materialsText).toLowerCase();
    const needle = text(resourceTitle).toLowerCase();
    if (!hay || !needle || needle.length < 4) return false;
    return hay.includes(needle);
  }

  /**
   * Build a CLEAN replacement draft activity in memory.
   * Omitted editable fields are explicitly blank. Lists are pasted-only.
   */
  function buildReplacementActivity(publishedActivity, draftActivity, parsedValues, activityKey) {
    const preserved = pickPreservedSystemFields(draftActivity, publishedActivity);
    const next = { ...preserved, replaceOwned: true };
    Object.keys(ACTIVITY_REPLACE_EMPTY_BY_PATH).forEach((path) => {
      next[path] = emptyValueForEditablePath(path);
    });

    const values = parsedValues && typeof parsedValues === "object" ? parsedValues : {};
    Object.keys(values).forEach((fieldId) => {
      if (fieldId === "settingTags") return;
      const meta = ACTIVITY_FIELD_META[fieldId];
      if (!meta || !meta.path) return;
      const parsed = values[fieldId];
      if (meta.kind === "lineList" || meta.kind === "orderedLineList") {
        next[meta.path] = asArray(parsed).map(text).filter(Boolean).join("\n");
        return;
      }
      if (meta.kind === "array" || meta.kind === "vocab") {
        next[meta.path] = asArray(parsed).map(text).filter(Boolean);
        if (meta.max) next[meta.path] = next[meta.path].slice(0, meta.max);
        return;
      }
      if (meta.kind === "substitutions") {
        next.substitutions = asArray(parsed)
          .filter((s) => s && text(s.need) && text(s.use))
          .map((s) => ({ need: text(s.need), use: text(s.use) }))
          .slice(0, meta.max || 12);
        return;
      }
      if (meta.kind === "duration") {
        next.durationMinutes = parsed === "" || parsed == null ? "" : parsed;
        return;
      }
      if (meta.kind === "weekday") {
        next.dayOfWeek = text(parsed);
        return;
      }
      next[meta.path] = parsed == null ? "" : parsed;
    });

    next.settingTags = dedupePreserveOrder(asArray(parsedValues?.settingTags).map(text).filter(Boolean)).slice(0, 8);
    next.imageBriefSetup = "";
    next.imageBriefExample = "";
    next.imageRequirementAiSuggestion = "";

    const key = text(activityKey);
    if (key) {
      if (!text(next.id) && !text(next.itemId)) next.id = key;
      if (text(publishedActivity?.id) === key && !text(next.id)) next.id = key;
      if (text(publishedActivity?.itemId) === key && !text(next.itemId)) next.itemId = key;
    }
    return next;
  }

  function validateReplacementActivity(replacement, expectedKey) {
    if (!replacement || typeof replacement !== "object" || Array.isArray(replacement)) {
      return "invalid_replacement";
    }
    const key = text(expectedKey);
    if (!key) return "missing_activity_key";
    const id = text(replacement.id);
    const itemId = text(replacement.itemId);
    if (!id && !itemId) return "missing_identity";
    if (id !== key && itemId !== key) return "identity_mismatch";
    if (replacement.replaceOwned !== true) return "missing_replace_owned";
    return "";
  }

  function activityReplaceFingerprint({ planId, activityKey, mode, draftActivity, week } = {}) {
    return JSON.stringify({
      planId: text(planId),
      activityKey: text(activityKey),
      mode: text(mode) || "replace",
      draftActivity: draftActivity && typeof draftActivity === "object" ? draftActivity : {},
      week: week && typeof week === "object" ? week : {},
    });
  }

  function formatRecognizedRow(fieldId, value, supplied) {
    const meta = ACTIVITY_FIELD_META[fieldId] || {};
    return {
      fieldId,
      label: meta.label || fieldId,
      kind: meta.kind || "scalar",
      supplied: Boolean(supplied),
      display: supplied ? displayReplaceValue(fieldId, value) : "",
      required: ACTIVITY_REPLACE_REQUIRED_FIELD_IDS.includes(fieldId),
    };
  }

  /**
   * Replace-mode preview: parse one complete activity paste, build a clean
   * replacement object, and describe missing/unrecognized/protected items.
   * Does not write to a draft.
   */
  function buildActivityReplacePreview(pastedText, activity, draftActivity, activityKey, options = {}) {
    const key = text(activityKey);
    const planId = text(options.planId);
    const week = options.week && typeof options.week === "object" ? options.week : {};
    const plan = options.plan && typeof options.plan === "object" ? options.plan : {};
    const sections = splitLabeledSections(String(pastedText || ""), ACTIVITY_HEADING_ALIASES);
    const parsedValues = {};
    const unrecognized = [];
    const manualResources = [];
    const unsupported = [];
    const settingTags = [];
    const seenFields = new Set();
    let recognizedCount = 0;

    if (!key) {
      return {
        mode: "replace",
        scope: "activity",
        activityKey: "",
        planId,
        error: "missing_activity_key",
        replacementActivity: null,
        fieldChanges: [],
        ui: { singleConfirm: true, perFieldCheckboxes: false },
        unrecognized: [],
        manualResources: [],
        missing: [],
        groups: { core: [], teaching: [], safety: [], enrichment: [], images: [] },
      };
    }

    sections.forEach((section) => {
      if (!section.fieldId) {
        if (text(section.body) || (section.headingRaw && section.headingRaw !== "(preamble)")) {
          unrecognized.push({ heading: section.headingRaw, body: section.body });
        }
        return;
      }
      const meta = ACTIVITY_FIELD_META[section.fieldId];
      if (!meta) {
        unrecognized.push({ heading: section.headingRaw, body: section.body });
        return;
      }
      if (meta.kind === "unsupported") {
        unsupported.push({
          fieldId: section.fieldId,
          label: meta.label,
          body: section.body,
          reason: meta.reason || "UNSUPPORTED — NOT APPLIED.",
        });
        return;
      }
      if (meta.kind === "uploadRequired") {
        unsupported.push({
          fieldId: section.fieldId,
          label: meta.label,
          body: section.body,
          reason: meta.reason || "Upload-only field. Reference detected — manual upload required.",
        });
        return;
      }
      const parsed = parseReplaceSectionValue(section.fieldId, section.body);
      if (!parsed.ok) {
        unrecognized.push({
          heading: section.headingRaw,
          body: section.body,
          note: parsed.note || "Could not map this section",
        });
        return;
      }
      if (parsed.kind === "manualResource") {
        manualResources.push({ heading: section.headingRaw, body: section.body });
        return;
      }
      if (parsed.kind === "settingTag") {
        if (parsed.tag && !settingTags.includes(parsed.tag)) settingTags.push(parsed.tag);
        if (parsed.prose && parsed.proseUnsupported) {
          unsupported.push({
            fieldId: `${section.fieldId}_prose`,
            label: `${meta.label} (text)`,
            body: parsed.prose,
            reason: parsed.proseUnsupportedReason,
          });
        }
        seenFields.add(section.fieldId);
        recognizedCount += 1;
        return;
      }
      if (parsed.kind === "scalarWithSettingTag" && parsed.tag && !settingTags.includes(parsed.tag)) {
        settingTags.push(parsed.tag);
      }
      if (seenFields.has(section.fieldId)
        && (parsed.kind === "lineList" || parsed.kind === "orderedLineList"
          || parsed.kind === "array" || parsed.kind === "vocab" || parsed.kind === "substitutions")) {
        parsedValues[section.fieldId] = mergeReplaceParsedValues(
          parsedValues[section.fieldId],
          parsed.value,
          parsed.kind,
          meta.max,
        );
        return;
      }
      parsedValues[section.fieldId] = parsed.value;
      seenFields.add(section.fieldId);
      recognizedCount += 1;
    });

    parsedValues.settingTags = settingTags;

    if (!recognizedCount && !unsupported.length && !manualResources.length) {
      return {
        mode: "replace",
        scope: "activity",
        activityKey: key,
        planId,
        error: "parse_empty",
        replacementActivity: null,
        fieldChanges: [],
        ui: { singleConfirm: true, perFieldCheckboxes: false },
        unrecognized,
        manualResources,
        missing: [],
        groups: { core: [], teaching: [], safety: [], enrichment: [], images: [] },
        currentTitle: text(draftActivity?.title) || text(activity?.title),
        nextTitle: "",
      };
    }

    const replacementActivity = buildReplacementActivity(activity, draftActivity, parsedValues, key);
    const identityError = validateReplacementActivity(replacementActivity, key);
    if (identityError) {
      return {
        mode: "replace",
        scope: "activity",
        activityKey: key,
        planId,
        error: identityError,
        replacementActivity: null,
        fieldChanges: [],
        ui: { singleConfirm: true, perFieldCheckboxes: false },
        unrecognized,
        manualResources,
        missing: [],
        groups: { core: [], teaching: [], safety: [], enrichment: [], images: [] },
      };
    }

    const missing = [];
    const groups = { core: [], teaching: [], safety: [], enrichment: [], images: [] };
    Object.keys(ACTIVITY_REPLACE_PREVIEW_GROUPS).forEach((groupId) => {
      ACTIVITY_REPLACE_PREVIEW_GROUPS[groupId].forEach((fieldId) => {
        if (fieldId === "settingTag_small_group" || fieldId === "settingTag_large_group") {
          const tag = ACTIVITY_FIELD_META[fieldId].tag;
          const supplied = settingTags.includes(tag);
          const row = {
            fieldId,
            label: ACTIVITY_FIELD_META[fieldId].label,
            kind: "settingTag",
            supplied,
            display: supplied ? ACTIVITY_FIELD_META[fieldId].label : "",
            required: false,
          };
          groups[groupId].push(row);
          if (!supplied) missing.push(row);
          return;
        }
        const meta = ACTIVITY_FIELD_META[fieldId];
        const supplied = Object.prototype.hasOwnProperty.call(parsedValues, fieldId)
          && !(Array.isArray(parsedValues[fieldId]) && parsedValues[fieldId].length === 0)
          && parsedValues[fieldId] !== "";
        const value = supplied
          ? parsedValues[fieldId]
          : (meta && meta.path ? replacementActivity[meta.path] : "");
        const row = formatRecognizedRow(fieldId, value, supplied);
        groups[groupId].push(row);
        if (!supplied) missing.push(row);
      });
    });

    const currentTitle = text(draftActivity?.title) || text(activity?.title) || "";
    const nextTitle = text(replacementActivity.title);
    const oldBriefSetup = text(draftActivity?.imageBriefSetup);
    const oldBriefExample = text(draftActivity?.imageBriefExample);
    const staleImageBriefs = [];
    if (oldBriefSetup) {
      staleImageBriefs.push({
        field: "imageBriefSetup",
        previous: oldBriefSetup,
        action: "cleared",
        reason: "AI/generated setup brief from the previous activity is not kept as active.",
      });
    }
    if (oldBriefExample) {
      staleImageBriefs.push({
        field: "imageBriefExample",
        previous: oldBriefExample,
        action: "cleared",
        reason: "AI/generated example brief from the previous activity is not kept as active.",
      });
    }

    const preserved = pickPreservedSystemFields(draftActivity, activity);
    const protectedImages = [];
    ["setupImageUrl", "exampleImageUrl", "setupPhotoUrl", "examplePhotoUrl"].forEach((field) => {
      if (text(preserved[field])) {
        protectedImages.push({
          field,
          url: text(preserved[field]),
          note: "EXISTING IMAGE MAY NO LONGER MATCH THIS ACTIVITY — keep for review, replace later, or remove. Not deleted.",
        });
      }
    });
    ["setupMediaAssetId", "exampleMediaAssetId"].forEach((field) => {
      if (text(preserved[field])) {
        protectedImages.push({
          field,
          id: text(preserved[field]),
          note: "Uploaded media asset is not being deleted.",
        });
      }
    });

    const resourceHints = collectPlanResourceHints(plan, week);
    const newMaterials = text(replacementActivity.materials);
    const protectedResources = resourceHints.relationships.map((rel) => {
      const oldMaterials = text(draftActivity?.materials) || text(activity?.materials);
      const matchedOld = materialsMayMatchResource(oldMaterials, rel.title);
      const matchedNew = materialsMayMatchResource(newMaterials, rel.title);
      return {
        ...rel,
        protected: true,
        review: matchedOld && !matchedNew
          ? "May no longer match replacement activity — review manually."
          : "These resources will remain linked and are not being deleted.",
      };
    });

    groups.images = [
      ...staleImageBriefs.map((item) => ({
        fieldId: item.field,
        label: item.field === "imageBriefSetup" ? "Setup example brief" : "Finished example brief",
        supplied: false,
        display: "",
        previous: item.previous,
        note: item.reason,
        required: false,
      })),
      ...protectedImages.map((item) => ({
        fieldId: item.field,
        label: item.field,
        supplied: true,
        display: item.url || item.id || "",
        note: item.note,
        required: false,
        protected: true,
      })),
    ];

    const fingerprint = activityReplaceFingerprint({
      planId,
      activityKey: key,
      mode: "replace",
      draftActivity,
      week,
    });

    return {
      mode: "replace",
      scope: "activity",
      activityKey: key,
      planId,
      currentTitle,
      nextTitle,
      replacementActivity,
      fieldChanges: [],
      ui: { singleConfirm: true, perFieldCheckboxes: false },
      unrecognized,
      manualResources,
      unsupported,
      missing,
      groups,
      staleImageBriefs,
      protectedImages,
      protectedResources,
      fingerprint,
      imageRequirementPreserved: Object.prototype.hasOwnProperty.call(preserved, "imageRequirement")
        ? preserved.imageRequirement
        : "",
    };
  }

  /**
   * Atomically swap one replacement activity into a draft clone.
   * Week + every other activity remain byte-identical. Zero writes on error.
   */
  function applyActivityReplacementToDraft(draftInput, preview, {
    confirm = false,
    expectedActivityKey = "",
    expectedPlanId = "",
    expectedFingerprint = "",
    currentDraftActivity = null,
    currentWeek = null,
  } = {}) {
    const fail = (error) => ({
      draft: JSON.parse(JSON.stringify(draftInput && typeof draftInput === "object" ? draftInput : { activities: {}, week: {} })),
      appliedFields: [],
      scope: "activity",
      activityKey: text(preview?.activityKey),
      error,
      changed: false,
    });

    if (!preview || preview.mode !== "replace") return fail("invalid_preview");
    if (!confirm) return fail("confirm_required");
    if (preview.error) return fail(preview.error);
    const activityKey = text(preview.activityKey);
    if (!activityKey) return fail("missing_activity_key");
    if (expectedActivityKey && activityKey !== text(expectedActivityKey)) return fail("stale_selection");
    if (expectedPlanId && preview.planId && preview.planId !== text(expectedPlanId)) return fail("stale_plan");
    if (!preview.replacementActivity) return fail("invalid_replacement");

    const identityError = validateReplacementActivity(preview.replacementActivity, activityKey);
    if (identityError) return fail(identityError);

    if (expectedFingerprint && preview.fingerprint && expectedFingerprint !== preview.fingerprint) {
      return fail("stale_preview");
    }

    const source = draftInput && typeof draftInput === "object"
      ? JSON.parse(JSON.stringify(draftInput))
      : { activities: {}, week: {} };
    if (!source.activities || typeof source.activities !== "object") source.activities = {};
    if (!source.week || typeof source.week !== "object") source.week = {};

    if (currentDraftActivity != null || currentWeek != null) {
      const liveFingerprint = activityReplaceFingerprint({
        planId: preview.planId,
        activityKey,
        mode: "replace",
        draftActivity: currentDraftActivity != null ? currentDraftActivity : source.activities[activityKey],
        week: currentWeek != null ? currentWeek : source.week,
      });
      if (preview.fingerprint && liveFingerprint !== preview.fingerprint) return fail("stale_preview");
    }

    const weekSnapshot = JSON.stringify(source.week);
    const otherActsSnapshot = {};
    Object.keys(source.activities).forEach((k) => {
      if (k !== activityKey) otherActsSnapshot[k] = source.activities[k];
    });

    source.activities[activityKey] = JSON.parse(JSON.stringify(preview.replacementActivity));

    source.week = JSON.parse(weekSnapshot);
    Object.keys(source.activities).forEach((k) => {
      if (k !== activityKey) {
        if (Object.prototype.hasOwnProperty.call(otherActsSnapshot, k)) {
          source.activities[k] = otherActsSnapshot[k];
        } else {
          delete source.activities[k];
        }
      }
    });
    Object.keys(otherActsSnapshot).forEach((k) => {
      source.activities[k] = otherActsSnapshot[k];
    });

    const appliedFields = Object.keys(ACTIVITY_REPLACE_EMPTY_BY_PATH).filter((path) => (
      Object.prototype.hasOwnProperty.call(source.activities[activityKey], path)
    ));
    return {
      draft: source,
      appliedFields,
      scope: "activity",
      activityKey,
      error: "",
      changed: true,
    };
  }

  function emptyImporterState() {
    return {
      open: false,
      scope: "", // week | activity
      activityKey: "",
      planId: "",
      rawText: "",
      phase: "edit", // edit | preview
      preview: null,
      highlightFields: [],
      highlightUntil: 0,
      mode: "update", // update | replace
      replaceConfirm: false,
    };
  }

  function shouldClearImporterState(importerState, { planId, mode, activityKey } = {}) {
    if (!importerState || (!importerState.open && !importerState.preview && !importerState.rawText)) {
      return false;
    }
    if (planId && importerState.planId && planId !== importerState.planId) return true;
    if (importerState.scope === "week" && mode && mode !== "week") return true;
    if (importerState.scope === "activity" && mode && mode !== "activities") return true;
    if (
      importerState.scope === "activity"
      && activityKey
      && importerState.activityKey
      && activityKey !== importerState.activityKey
    ) {
      return true;
    }
    if (importerState.preview && importerState.preview.mode === "replace") {
      if (activityKey && importerState.preview.activityKey && activityKey !== importerState.preview.activityKey) {
        return true;
      }
      if (planId && importerState.preview.planId && planId !== importerState.preview.planId) {
        return true;
      }
    }
    return false;
  }

  return {
    WEEK_MILESTONE_BANK,
    WEEK_HEADING_ALIASES,
    ACTIVITY_HEADING_ALIASES,
    WEEK_FIELD_META,
    ACTIVITY_FIELD_META,
    ACTIVITY_SYSTEM_PRESERVE_KEYS,
    ACTIVITY_REPLACE_REQUIRED_FIELD_IDS,
    ACTIVITY_REPLACE_EMPTY_BY_PATH,
    SETTING_TAG_BY_LABEL,
    normalizeHeading,
    splitLabeledSections,
    splitContentLines,
    splitOrderedStepLines,
    parseVocabularyItems,
    parseSubstitutionBlocks,
    parseWeekday,
    normalizeMilestoneLabel,
    buildWeekPreview,
    buildActivityPreview,
    buildActivityReplacePreview,
    buildReplacementActivity,
    applyPreviewToDraft,
    applyActivityReplacementToDraft,
    activityReplaceFingerprint,
    pickPreservedSystemFields,
    emptyImporterState,
    shouldClearImporterState,
    buildListDiff,
    buildScalarDiff,
  };
});
