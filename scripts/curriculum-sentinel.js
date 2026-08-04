/**
 * Canonical empty-state / sentinel normalizer for curriculum text.
 * Used by import parsing, AI prompting, and save-time normalization.
 * Sentinel phrases become empty values — never titles or generated content.
 */
(function curriculumSentinelModule(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else if (root) {
    root.LLHCurriculumSentinel = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const SENTINEL_EXACT = new Set([
    "none",
    "none required",
    "n/a",
    "na",
    "not applicable",
    "no books",
    "no book",
    "no songs",
    "no song",
    "no materials",
    "no material",
    "not needed",
    "none needed",
    "nil",
    "null",
    "undefined",
    "-",
    "—",
    "–",
    "--",
    "---",
  ]);

  function collapseWs(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripOuterPunctuation(value) {
    return String(value || "")
      .replace(/^[\s"'`“”‘’([{<]+/, "")
      .replace(/[\s"'`“”‘’.,;:!?)\]}>]+$/g, "")
      .trim();
  }

  function normalizeSentinelKey(value) {
    const collapsed = collapseWs(value).toLowerCase();
    if (!collapsed) return "";
    const stripped = stripOuterPunctuation(collapsed);
    // Keep slash forms like n/a intact; only normalize decorative separators.
    if (SENTINEL_EXACT.has(stripped)) return stripped;
    return stripped
      .replace(/[.|_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isSentinelValue(value) {
    if (value == null) return true;
    if (typeof value === "string") {
      const key = normalizeSentinelKey(value);
      if (!key || SENTINEL_EXACT.has(key)) return true;
      // Also accept "n a" after separator normalization of "n/a".
      if (key === "n a") return true;
      return false;
    }
    if (typeof value === "object") {
      const title = value.title != null ? value.title : (value.name != null ? value.name : "");
      const author = value.author != null ? value.author : "";
      const notes = value.notes != null ? value.notes : "";
      const titleSentinel = isSentinelValue(title);
      if (!collapseWs(title)) return true;
      if (titleSentinel && !collapseWs(author) && !collapseWs(notes)) return true;
      if (titleSentinel) return true;
      return false;
    }
    return false;
  }

  function emptyFromSentinel(value, { asArray = false } = {}) {
    if (asArray) {
      if (Array.isArray(value)) {
        return value
          .map((item) => (typeof item === "string" ? collapseWs(item) : item))
          .filter((item) => !isSentinelValue(item));
      }
      if (isSentinelValue(value)) return [];
      if (typeof value === "string") {
        return collapseWs(value)
          .split(/\r?\n|,|;/)
          .map((part) => collapseWs(part))
          .filter((part) => part && !isSentinelValue(part));
      }
      return [];
    }
    if (isSentinelValue(value)) return "";
    if (typeof value === "string") return collapseWs(value);
    return value;
  }

  function normalizeBookOrSongEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    if (isSentinelValue(entry)) return null;
    const title = emptyFromSentinel(entry.title || entry.name || "");
    if (!title) return null;
    return {
      ...entry,
      title,
      author: emptyFromSentinel(entry.author || ""),
      notes: emptyFromSentinel(entry.notes || ""),
    };
  }

  function normalizeTextList(values) {
    return emptyFromSentinel(values, { asArray: true });
  }

  function normalizeMaterialsField(value) {
    return emptyFromSentinel(value, { asArray: false });
  }

  function dayHasContent(day) {
    if (!day || typeof day !== "object") return false;
    if (Array.isArray(day.items) && day.items.length) return true;
    const keys = [
      "theme", "objectives", "materials", "vocabulary", "outdoorPlay",
      "familyConnection", "adaptations", "safetyNotes",
    ];
    if (keys.some((key) => collapseWs(day[key]))) return true;
    if (["books", "songs", "circleTime", "transitions", "observations"].some((key) => {
      const list = day[key];
      return Array.isArray(list) && list.some((item) => !isSentinelValue(item));
    })) return true;
    return false;
  }

  /**
   * Mark weekdays without real content as empty/missing.
   * Does not invent Tuesday–Friday content when only Monday exists.
   */
  function normalizeDailyPlansEmpties(dailyPlans) {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    const input = dailyPlans && typeof dailyPlans === "object" ? dailyPlans : {};
    const out = {};
    const missing = [];
    days.forEach((day) => {
      const raw = input[day] && typeof input[day] === "object" ? input[day] : {};
      const books = Array.isArray(raw.books)
        ? raw.books.map(normalizeBookOrSongEntry).filter(Boolean)
        : [];
      const songs = Array.isArray(raw.songs)
        ? raw.songs.map(normalizeBookOrSongEntry).filter(Boolean)
        : [];
      const next = {
        ...raw,
        theme: emptyFromSentinel(raw.theme || ""),
        objectives: emptyFromSentinel(raw.objectives || ""),
        materials: normalizeMaterialsField(raw.materials || ""),
        vocabulary: emptyFromSentinel(raw.vocabulary || ""),
        books,
        songs,
        circleTime: normalizeTextList(raw.circleTime),
        transitions: normalizeTextList(raw.transitions),
        observations: normalizeTextList(raw.observations),
        outdoorPlay: emptyFromSentinel(raw.outdoorPlay || ""),
        familyConnection: emptyFromSentinel(raw.familyConnection || ""),
        adaptations: emptyFromSentinel(raw.adaptations || ""),
        safetyNotes: emptyFromSentinel(raw.safetyNotes || ""),
        items: Array.isArray(raw.items) ? raw.items : [],
      };
      if (!dayHasContent(next)) {
        missing.push(day);
        next.empty = true;
        next.missing = true;
      } else {
        next.empty = false;
        next.missing = false;
      }
      out[day] = next;
    });
    return { dailyPlans: out, missingDays: missing };
  }

  function scrubSentinelsFromLessonPlan(plan) {
    if (!plan || typeof plan !== "object") return plan;
    const books = Array.isArray(plan.books)
      ? plan.books.map(normalizeBookOrSongEntry).filter(Boolean)
      : [];
    const songs = Array.isArray(plan.songs)
      ? plan.songs.map(normalizeBookOrSongEntry).filter(Boolean)
      : [];
    const dayNorm = normalizeDailyPlansEmpties(plan.dailyPlans);
    return {
      ...plan,
      books,
      songs,
      weeklyMaterials: normalizeMaterialsField(plan.weeklyMaterials || ""),
      familyConnection: emptyFromSentinel(plan.familyConnection || ""),
      vocabularyWords: emptyFromSentinel(plan.vocabularyWords || ""),
      dailyPlans: dayNorm.dailyPlans,
      _missingWeekdays: dayNorm.missingDays,
    };
  }

  function scrubSentinelsFromPromptContext(text) {
    const lines = String(text || "").split(/\r?\n/);
    return lines
      .map((line) => {
        const match = line.match(/^(\s*[A-Za-z][A-Za-z0-9_/ -]*:\s*)(.*)$/);
        if (!match) return isSentinelValue(line) ? "" : line;
        const value = match[2];
        if (isSentinelValue(value)) return `${match[1]}`.replace(/:\s*$/, ": (empty)");
        return line;
      })
      .filter((line, index, arr) => !(isSentinelValue(line) && line === "" && arr[index - 1] === ""))
      .join("\n");
  }

  return {
    SENTINEL_EXACT,
    isSentinelValue,
    emptyFromSentinel,
    normalizeBookOrSongEntry,
    normalizeTextList,
    normalizeMaterialsField,
    normalizeDailyPlansEmpties,
    scrubSentinelsFromLessonPlan,
    scrubSentinelsFromPromptContext,
    dayHasContent,
  };
}));
