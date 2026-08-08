/**
 * Teaching Kit materials normalization + duplicate detection.
 * Safe merge: does not delete distinct supplies; collapses clear duplicates.
 * Pure helpers — browser + Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHTeachingKitMaterials = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WEEKDAYS = Object.freeze(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const DAY_LABELS = Object.freeze({
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  });

  /** Synonym map: normalized key → preferred display label */
  const CANONICAL = Object.freeze({
    "farm animal": "Plastic farm animals",
    "farm animals": "Plastic farm animals",
    "plastic farm animal": "Plastic farm animals",
    "plastic farm animals": "Plastic farm animals",
    hay: "Hay",
    basket: "Basket",
    baskets: "Basket",
    "egg carton": "Egg cartons",
    "egg cartons": "Egg cartons",
    "empty egg carton": "Egg cartons",
    "empty egg cartons": "Egg cartons",
    "farm puzzle": "Farm animal puzzles",
    "farm puzzles": "Farm animal puzzles",
    "farm animal puzzle": "Farm animal puzzles",
    "farm animal puzzles": "Farm animal puzzles",
    brush: "Paintbrushes",
    brushes: "Paintbrushes",
    paintbrush: "Paintbrushes",
    paintbrushes: "Paintbrushes",
    bucket: "Buckets",
    buckets: "Buckets",
    towel: "Towels",
    towels: "Towels",
    glue: "Glue",
    "glue stick": "Glue sticks",
    "glue sticks": "Glue sticks",
    "glue stick pack": "Glue sticks",
    crayon: "Crayons",
    crayons: "Crayons",
    "box of crayons": "Crayons",
    marker: "Markers",
    markers: "Markers",
    scissors: "Scissors",
    "pair of scissors": "Scissors",
    "child scissors": "Scissors",
    "childrens scissors": "Scissors",
    paper: "Paper",
    "construction paper": "Construction paper",
    "white paper": "Paper",
    "copy paper": "Paper",
    "watercolor paper": "Watercolor paper",
    "soft book": "Soft books",
    "soft books": "Soft books",
    "soft scarf": "Soft scarves",
    "soft scarves": "Soft scarves",
    rattle: "Rattles",
    rattles: "Rattles",
    "soft rattle": "Soft rattles",
    "soft rattles": "Soft rattles",
    mirror: "Mirror",
    "unbreakable mirror": "Unbreakable mirror",
    "soft mat": "Soft mat",
    "tummy time mat": "Tummy-time mat",
    "tummy-time mat": "Tummy-time mat",
    tape: "Tape",
    "masking tape": "Masking tape",
    "painter tape": "Masking tape",
    "painters tape": "Masking tape",
    bin: "Bins",
    bins: "Bins",
    "storage bin": "Bins",
    "storage bins": "Bins",
  });

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null || value === "") return [];
    return [value];
  }

  function materialsList(value) {
    if (Array.isArray(value)) {
      return value.map(text).filter(Boolean);
    }
    const raw = text(value);
    if (!raw) return [];
    return raw.split(/[\n,;•]+/).map((part) => text(part)).filter(Boolean);
  }

  function normalizeKey(label) {
    let key = text(label)
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/\boptional\b/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!key) return "";
    // Collapse simple English plurals for inventory matching only (presentation labels stay rich).
    // Keep materially different items distinct (construction paper vs watercolor paper).
    const parts = key.split(" ").map((word) => {
      if (word.length <= 3) return word;
      if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
      if (word.endsWith("ves") && word.length > 4) return `${word.slice(0, -3)}f`; // scarves → scarf
      if (/(?:sses|shes|ches|xes|zes)$/.test(word) && word.length > 4) return word.slice(0, -2);
      if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) {
        return word.slice(0, -1);
      }
      return word;
    });
    return parts.join(" ").trim();
  }

  function displayLabel(label) {
    const key = normalizeKey(label);
    if (!key) return "";
    if (CANONICAL[key]) return CANONICAL[key];
    // Title-case first letter of each word for consistency.
    return text(label).replace(/\w\S*/g, (word) => {
      if (/^[A-Z0-9]+$/.test(word) && word.length <= 4) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }

  /**
   * Collapse duplicates / near-duplicates without dropping distinct supplies.
   * @returns {{ items: Array<{label:string,key:string,sources:string[],aliases:string[]}>, duplicatesRemoved: number }}
   */
  function normalizeMaterialInventory(labels, sourceTag) {
    const map = new Map();
    let duplicatesRemoved = 0;
    asArray(labels).forEach((raw) => {
      const original = text(raw);
      if (!original) return;
      const key = normalizeKey(original);
      if (!key) return;
      const canonicalKey = normalizeKey(CANONICAL[key] || original);
      const label = displayLabel(CANONICAL[key] || original);
      const existing = map.get(canonicalKey);
      if (existing) {
        duplicatesRemoved += 1;
        if (!existing.aliases.includes(original) && normalizeKey(original) !== canonicalKey) {
          existing.aliases.push(original);
        }
        if (sourceTag && !existing.sources.includes(sourceTag)) existing.sources.push(sourceTag);
        return;
      }
      map.set(canonicalKey, {
        label,
        key: canonicalKey,
        sources: sourceTag ? [sourceTag] : [],
        aliases: normalizeKey(original) === canonicalKey ? [] : [original],
      });
    });
    return {
      items: [...map.values()].sort((a, b) => a.label.localeCompare(b.label)),
      duplicatesRemoved,
    };
  }

  function mergeInventories(parts) {
    const map = new Map();
    let duplicatesRemoved = 0;
    asArray(parts).forEach((part) => {
      asArray(part && part.items).forEach((item) => {
        const key = item.key || normalizeKey(item.label);
        if (!key) return;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            label: item.label,
            key,
            sources: [...(item.sources || [])],
            aliases: [...(item.aliases || [])],
          });
          return;
        }
        duplicatesRemoved += 1;
        (item.sources || []).forEach((src) => {
          if (!existing.sources.includes(src)) existing.sources.push(src);
        });
        (item.aliases || []).forEach((alias) => {
          if (!existing.aliases.includes(alias)) existing.aliases.push(alias);
        });
      });
      duplicatesRemoved += Number(part && part.duplicatesRemoved) || 0;
    });
    return {
      items: [...map.values()].sort((a, b) => a.label.localeCompare(b.label)),
      duplicatesRemoved,
    };
  }

  /**
   * Build master + per-day + per-activity materials for a Teaching Kit.
   */
  function buildMaterialsModel(plan, activityCards) {
    const weekInv = normalizeMaterialInventory(materialsList(plan && plan.weeklyMaterials), "master");
    const byDay = {};
    WEEKDAYS.forEach((day) => {
      const dayPlan = plan && plan.dailyPlans && plan.dailyPlans[day] ? plan.dailyPlans[day] : {};
      byDay[day] = normalizeMaterialInventory(materialsList(dayPlan.materials), day);
    });
    const byActivity = (activityCards || []).map((card) => ({
      activityId: card.id,
      title: card.title,
      dayOfWeek: card.dayOfWeek || "",
      inventory: normalizeMaterialInventory(card.materials || materialsList(card.materialsText), `activity:${card.id}`),
    }));

    const master = mergeInventories([
      weekInv,
      ...WEEKDAYS.map((day) => byDay[day]),
      ...byActivity.map((row) => row.inventory),
    ]);

    return {
      master: master.items.map((item) => item.label),
      masterDetailed: master.items,
      duplicatesCollapsed: master.duplicatesRemoved,
      byDay: Object.fromEntries(WEEKDAYS.map((day) => [day, {
        day,
        dayLabel: DAY_LABELS[day],
        materials: (byDay[day].items || []).map((item) => item.label),
      }])),
      byActivity: byActivity.map((row) => ({
        activityId: row.activityId,
        title: row.title,
        dayOfWeek: row.dayOfWeek,
        materials: row.inventory.items.map((item) => item.label),
      })),
    };
  }

  /**
   * Explain missing materials for Monday Setup.
   * When no readyMaterials are provided, do NOT treat items as "missing" —
   * list them as "to gather" instead. Missing only applies when a ready set exists.
   */
  function explainMissingMaterials(materials, readyMaterials, options = {}) {
    const list = asArray(materials).map((item) => (typeof item === "string"
      ? { id: "", label: item, critical: false }
      : item));
    const readyRaw = asArray(readyMaterials).map(text).filter(Boolean);
    const readyKeys = new Set(readyRaw.map(normalizeKey).filter(Boolean));
    const critical = list.filter((item) => item.critical);

    if (!readyKeys.size) {
      const toGather = (options.highlightCritical === false ? list : (critical.length ? critical : list.slice(0, 8)))
        .map((item) => text(item.label))
        .filter(Boolean);
      return {
        mode: "gather",
        missing: [],
        toGather,
        readyCount: 0,
        listedCount: list.length,
        summary: toGather.length
          ? `Gather ${toGather.length} priority supply${toGather.length === 1 ? "" : "ies"} before Monday. Nothing is marked missing yet — check off items as you pull them.`
          : "No materials listed for this week yet.",
        fixHint: "Mark supplies ready in Monday Setup (or pass readyMaterials) to track what is still missing.",
        items: toGather.map((label) => ({
          label,
          status: "to_gather",
          howToFix: "Pull this supply onto your prep tray, then mark it ready.",
        })),
      };
    }

    const missingItems = critical.length ? critical : list;
    const missing = missingItems.filter((item) => {
      const key = normalizeKey(item.label);
      if (!key) return false;
      if (readyKeys.has(key)) return false;
      // substring match against ready labels
      for (const ready of readyKeys) {
        if (ready.includes(key) || key.includes(ready)) return false;
      }
      return true;
    });

    return {
      mode: "missing",
      missing: missing.map((item) => text(item.label)),
      toGather: [],
      readyCount: readyKeys.size,
      listedCount: list.length,
      summary: missing.length
        ? `${missing.length} priority supply${missing.length === 1 ? "" : "ies"} still missing after your ready list.`
        : `All ${critical.length || list.length} priority supplies are marked ready.`,
      fixHint: missing.length
        ? "Add or substitute each missing supply, then mark it ready. Distinct items are kept — only clear duplicates were collapsed."
        : "You are clear to set stations.",
      items: missing.map((item) => ({
        label: text(item.label),
        status: "missing",
        howToFix: `Locate or substitute “${text(item.label)}”, place it on the prep tray, then mark ready.`,
      })),
    };
  }

  return {
    WEEKDAYS,
    DAY_LABELS,
    materialsList,
    normalizeKey,
    displayLabel,
    normalizeMaterialInventory,
    mergeInventories,
    buildMaterialsModel,
    explainMissingMaterials,
  };
});
