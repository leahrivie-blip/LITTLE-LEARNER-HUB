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
      .replace(/[–—−]/g, "-")
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
    // Resource headings — recognized but never auto-applied.
    "linked resources": "linkedResourcesManual",
    printable: "linkedResourcesManual",
    printables: "linkedResourcesManual",
    books: "linkedResourcesManual",
    songs: "linkedResourcesManual",
    "draft books": "linkedResourcesManual",
    "draft songs": "linkedResourcesManual",
    "draft printables": "linkedResourcesManual",
  });

  /** Exact/alias heading → activity field id. */
  const ACTIVITY_HEADING_ALIASES = freezeNormalizedAliases({
    "activity name": "title",
    title: "title",
    weekday: "dayOfWeek",
    day: "dayOfWeek",
    "day of week": "dayOfWeek",
    category: "activityCategory",
    "developmental domain": "activityCategory",
    "category / developmental domain": "activityCategory",
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
    "safety and supervision": "safetyNotes",
    safety: "safetyNotes",
    cleanup: "cleanupTips",
    "small group": "settingTag_small_group",
    "large group": "settingTag_large_group",
    indoor: "indoorAlternatives",
    outdoor: "outdoorAlternatives",
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
      proseUnsupported: true,
    },
    settingTag_large_group: {
      label: "Large group",
      kind: "settingTag",
      tag: "large_group",
      proseUnsupported: true,
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
  });

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
    const lower = cleaned.toLowerCase();
    const hit = WEEK_MILESTONE_BANK.find((m) => m.toLowerCase() === lower);
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
      if (pendingNeed && cleaned) {
        // Second line without explicit "use instead" — treat as use value.
        out.push({ need: pendingNeed, use: cleaned });
        pendingNeed = "";
      }
    });
    return dedupePreserveOrder(out, (s) => `${text(s.need).toLowerCase()}=>${text(s.use).toLowerCase()}`);
  }

  /**
   * Split pasted text into heading sections. A heading is a line ending with ":"
   * whose normalized label is in the alias map (exact match only).
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
        if (fieldId || (/^[A-Za-z][A-Za-z0-9 /&'-]{0,60}$/.test(labelPart) && rest === "" && /[A-Za-z]/.test(labelPart))) {
          flush();
          current = {
            headingRaw: labelPart.trim(),
            fieldId: fieldId || "",
          };
          if (rest) bodyLines.push(rest);
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

  function linesFromScalarOrList(value) {
    if (Array.isArray(value)) return asArray(value).map(text).filter(Boolean);
    return text(value).split(/\r?\n/).map(stripListMarker).filter(Boolean);
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

  function buildListDiff(currentItems, pastedItems, { max = 40 } = {}) {
    const current = dedupePreserveOrder(currentItems);
    const currentKeys = new Set(current.map((item) => text(item).toLowerCase()));
    const add = [];
    const duplicates = [];
    dedupePreserveOrder(pastedItems).forEach((item) => {
      const key = text(item).toLowerCase();
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

  function buildWeekPreview(pastedText, currentWeek, publishedPlan) {
    const week = currentWeek && typeof currentWeek === "object" ? currentWeek : {};
    const plan = publishedPlan && typeof publishedPlan === "object" ? publishedPlan : {};
    const toolkit = week.teacherToolkit && typeof week.teacherToolkit === "object" ? week.teacherToolkit : {};
    const sections = splitLabeledSections(pastedText, WEEK_HEADING_ALIASES);
    const fieldChanges = [];
    const unrecognized = [];
    const manualResources = [];
    const seenFields = new Set();

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

      if (meta.kind === "settingTag") {
        const currentTag = resolveActivityCurrent(section.fieldId, activity, draftActivity);
        const prose = text(section.body);
        const alreadyOn = Boolean(currentTag);
        fieldChanges.push({
          fieldId: section.fieldId,
          label: meta.label,
          kind: "settingTag",
          tag: meta.tag,
          current: alreadyOn ? meta.label : "",
          next: meta.label,
          action: alreadyOn ? "unchanged" : "add",
          selected: !alreadyOn,
          proseNote: prose
            ? "Prose under this heading is not stored (chips only). Enable the setting tag; paste prose into an existing text field if needed."
            : "",
          unrecognizedProse: prose || "",
        });
        if (prose) {
          unrecognized.push({
            heading: `${section.headingRaw} (prose)`,
            body: prose,
            note: "Setting-tag chips do not store paragraph text.",
          });
        }
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
            : splitContentLines(section.body);
          const priorDuplicates = asArray(existing.list?.duplicates);
          // Re-diff against original keep, including previously queued adds + new lines.
          // Also re-include prior duplicate lines so they remain visible as ignored.
          existing.list = buildListDiff(
            existing.list?.keep || [],
            [...(existing.list?.add || []), ...priorDuplicates, ...extra],
            { max: meta.max },
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
          fieldId: section.fieldId,
          label: meta.label,
          kind: meta.kind === "scalarWithSettingTag" ? "scalarWithSettingTag" : "scalar",
          tag: meta.tag || "",
          ...scalar,
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
        const currentLines = linesFromScalarOrList(
          resolveActivityCurrent(section.fieldId, activity, draftActivity),
        );
        const pastedLines = splitContentLines(section.body);
        const list = buildListDiff(currentLines, pastedLines, { max: meta.max });
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
      manualResources: [],
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
          .filter((c) => c.selected)
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
    return false;
  }

  return {
    WEEK_MILESTONE_BANK,
    WEEK_HEADING_ALIASES,
    ACTIVITY_HEADING_ALIASES,
    WEEK_FIELD_META,
    ACTIVITY_FIELD_META,
    SETTING_TAG_BY_LABEL,
    normalizeHeading,
    splitLabeledSections,
    splitContentLines,
    parseVocabularyItems,
    parseSubstitutionBlocks,
    parseWeekday,
    normalizeMilestoneLabel,
    buildWeekPreview,
    buildActivityPreview,
    applyPreviewToDraft,
    emptyImporterState,
    shouldClearImporterState,
    buildListDiff,
    buildScalarDiff,
  };
});
