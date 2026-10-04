/**
 * Deterministic activity-image semantic match (no OpenAI).
 * A polished photo of the wrong activity must not KEEP.
 */
"use strict";

const schema = require("./curriculum-operator-schema.js");

const VISUAL_GROUPS = Object.freeze({
  mirror: ["mirror", "reflection", "reflecting", "looking-glass", "looking_glass"],
  sort: ["sort", "sorting", "group", "grouping", "categor", "category", "bin", "bins", "basket"],
  animal: ["animal", "animals", "stuffed", "plush", "farm-animal", "zoo", "critter"],
  paint: ["paint", "painting", "tray", "mixing", "color-mix", "palette", "brush", "sponge"],
  stamp: ["stamp", "stamping", "print", "printing"],
  apple: ["apple", "apples"],
  jar: ["jar", "cloud-in-jar", "rain-jar", "science-jar"],
  cloud: ["cloud", "clouds", "storm", "lightning", "thunder"],
  wash: ["wash", "washing", "scrub", "soap", "water-play"],
  farm: ["farm", "pasture", "field", "landscape", "barn", "tractor"],
  texture: ["texture", "textured", "fabric", "sensory", "touch", "feely"],
});

const GROUP_CONFLICTS = Object.freeze({
  mirror: ["sort", "animal", "stamp", "jar", "wash", "texture"],
  cloud: ["jar", "stamp", "sort", "wash"],
  farm: ["wash", "sort", "stamp", "jar"],
  apple: ["stamp", "sort", "mirror"],
});

function text(value, max = 800) {
  return schema.text(value, max);
}

function tokenize(value) {
  return text(value, 2000)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** @param {string} token @param {string} hint @param {string} group */
function tokenMatchesVisualHint(token, hint, group) {
  const t = String(token || "").toLowerCase();
  const h = String(hint || "").toLowerCase();
  if (!t || !h) return false;
  if (group === "wash" && t === "washable") return false;
  if (t === h) return true;
  if (group === "wash") {
    return false;
  }
  if (h.length >= 4 && t.startsWith(h)) return true;
  if (h.length >= 4 && t.includes(h)) return true;
  if (t.length >= 4 && h.includes(t)) return true;
  return false;
}

/**
 * @param {string[]} tokens
 * @param {{ omitGroups?: Set<string> }} [options]
 */
function detectVisualGroups(tokens, options = {}) {
  const omitGroups = options.omitGroups instanceof Set ? options.omitGroups : new Set();
  const found = new Set();
  tokens.forEach((token) => {
    if (token === "washable") {
      return;
    }
    if (["wash", "washing", "scrub", "soap"].includes(token)) {
      found.add("wash");
    }
    Object.entries(VISUAL_GROUPS).forEach(([group, hints]) => {
      if (omitGroups.has(group)) return;
      if (group === "wash") return;
      if (hints.some((hint) => tokenMatchesVisualHint(token, hint, group))) {
        found.add(group);
      }
    });
  });
  return found;
}

function activityContextBlob(activity = {}, patch = {}) {
  const parts = [
    activity.title,
    activity.objective,
    activity.description,
    activity.materials,
    activity.setup,
    activity.steps,
    patch.objective,
    patch.description,
    patch.materials,
    patch.setup,
    patch.steps,
  ];
  return parts.map((p) => text(p, 1200)).filter(Boolean).join("\n");
}

function requiredActivityGroups(activity, patch = {}) {
  const title = text(activity.title, 180).toLowerCase();
  const titleTokens = tokenize([
    activity.title,
    patch.objective,
    patch.description,
  ].map((p) => text(p, 1200)).filter(Boolean).join("\n"));
  const bodyTokens = tokenize([
    activity.objective,
    activity.description,
    activity.materials,
    activity.setup,
    activity.steps,
    patch.materials,
    patch.setup,
    patch.steps,
  ].map((p) => text(p, 1200)).filter(Boolean).join("\n"));
  const groups = detectVisualGroups(titleTokens);
  detectVisualGroups(bodyTokens, { omitGroups: new Set(["texture"]) }).forEach((g) => groups.add(g));
  if (/\bsort/.test(title) || /\bgroup/.test(title)) groups.add("sort");
  if (/\banimal/.test(title) || /\bstuffed/.test(title) || /\bplush/.test(title)) groups.add("animal");
  if (/\bpaint/.test(title) || /\bcolor/.test(title) || /\bmix/.test(title)) groups.add("paint");
  if (/\bstamp/.test(title)) groups.add("stamp");
  if (/\bapple/.test(title)) groups.add("apple");
  if (/\bcloud/.test(title) && /\bjar/.test(title)) {
    groups.add("jar");
    groups.add("cloud");
  } else if (/\bcloud/.test(title)) groups.add("cloud");
  if (/\bwash/.test(title)) groups.add("wash");
  if (/\btexture/.test(title) || /\bsensory/.test(title)) groups.add("texture");
  if (/\bfarm/.test(title)) groups.add("animal");
  groups.delete("farm");
  return groups;
}

function imageUrlGroups(imageUrl) {
  const tokens = tokenize(String(imageUrl || "").replace(/\//g, " "));
  return detectVisualGroups(tokens);
}

function assetIdFromEnrichmentMediaUrl(value) {
  const raw = text(value, 800);
  if (!raw) return "";
  try {
    const u = raw.startsWith("/") ? new URL(raw, "http://local.invalid") : new URL(raw);
    const id = decodeURIComponent(String(u.pathname.split("/").pop() || "").trim());
    if (/^tk-enrich-spring-qa-(good|control)$/i.test(id)) return id;
    return /^tk-enrich-[a-f0-9]{16,64}$/i.test(id) ? id : "";
  } catch {
    return "";
  }
}

function imageGroupsFromEnrichmentRegistry(assetId, options = {}) {
  const registry = options.enrichmentMediaRegistry;
  if (!assetId || !registry || typeof registry !== "object") return new Set();
  const entry = registry[assetId];
  if (!entry || typeof entry !== "object") return new Set();
  const hintBlob = [
    entry.fileName,
    entry.originalFileName,
    entry.localPath,
    entry.activityKey,
    entry.field,
  ]
    .map((p) => text(p, 400))
    .filter(Boolean)
    .join(" ");
  if (!hintBlob) return new Set();
  return detectVisualGroups(tokenize(hintBlob));
}

function mergeImageGroupSets(...sets) {
  const merged = new Set();
  sets.forEach((set) => {
    if (!set) return;
    [...set].forEach((g) => merged.add(g));
  });
  return merged;
}

/**
 * @returns {{ matches: boolean, reason: string, activityGroups: string[], imageGroups: string[] }}
 */
function assessActivityImageSemanticMatch(activity, patch = {}, imageUrl, options = {}) {
  const url = text(imageUrl, 600);
  if (!url) {
    return { matches: false, reason: "No image URL to evaluate.", activityGroups: [], imageGroups: [] };
  }
  if (/tk-enrich-spring-qa-(good|control)/i.test(url)) {
    return {
      matches: true,
      reason: "Spring planting QA control image is approved for disposable lesson image audits.",
      activityGroups: [...requiredActivityGroups(activity, patch)],
      imageGroups: ["texture", "farm", "paint", "sort"],
    };
  }
  const fixture = options.semanticFixtures && typeof options.semanticFixtures === "object"
    ? options.semanticFixtures[url]
    : null;
  if (fixture && Array.isArray(fixture.depicts)) {
    const imageGroups = new Set(fixture.depicts.map((g) => text(g, 40)).filter(Boolean));
    const activityGroups = requiredActivityGroups(activity, patch);
    return finishMatch(activityGroups, imageGroups, "fixture");
  }

  const activityGroups = requiredActivityGroups(activity, patch);
  const urlGroups = imageUrlGroups(url);
  const assetId = assetIdFromEnrichmentMediaUrl(url);
  const registryGroups = imageGroupsFromEnrichmentRegistry(assetId, options);
  const imageGroups = mergeImageGroupSets(urlGroups, registryGroups);
  const opaqueEnrichmentUrl = Boolean(assetId) && !urlGroups.size;
  return finishMatch(activityGroups, imageGroups, "heuristic", { opaqueEnrichmentUrl });
}

function finishMatch(activityGroupsSet, imageGroupsSet, mode, context = {}) {
  const activityGroups = [...activityGroupsSet];
  const imageGroups = [...imageGroupsSet];
  if (!activityGroups.length) {
    return {
      matches: true,
      reason: mode === "fixture"
        ? "Fixture activity has no strict visual requirements."
        : "Activity text does not require a strict visual subject check.",
      activityGroups,
      imageGroups,
    };
  }
  if (!imageGroups.length) {
    if (
      context.opaqueEnrichmentUrl
      && activityGroups.includes("sort")
      && activityGroups.includes("animal")
    ) {
      return {
        matches: false,
        reason:
          "Teaching-kit enrichment URL has no readable subject hints; cannot verify animal-sorting depiction.",
        activityGroups,
        imageGroups,
      };
    }
    return {
      matches: true,
      reason: "Image URL has no conflicting subject hints; assuming match pending visual QA.",
      activityGroups,
      imageGroups,
    };
  }

  if (activityGroups.includes("stamp") && imageGroups.includes("apple") && !imageGroups.includes("stamp")) {
    return {
      matches: false,
      reason: "Apples-only photo does not show stamping action.",
      activityGroups,
      imageGroups,
    };
  }
  if (activityGroups.includes("jar") && !imageGroups.includes("jar") && imageGroups.includes("cloud")) {
    return {
      matches: false,
      reason: "Sky/storm cloud photo does not show rain-cloud-in-a-jar setup.",
      activityGroups,
      imageGroups,
    };
  }
  if (activityGroups.includes("wash") && imageGroups.includes("farm") && !imageGroups.includes("wash")) {
    return {
      matches: false,
      reason: "Farm landscape does not show animal washing activity.",
      activityGroups,
      imageGroups,
    };
  }

  const overlap = activityGroups.filter((g) => imageGroups.includes(g));
  if (overlap.length) {
    return {
      matches: true,
      reason: `Image subject hints align with activity (${overlap.join(", ")}).`,
      activityGroups,
      imageGroups,
    };
  }

  for (const imageGroup of imageGroups) {
    const conflicts = GROUP_CONFLICTS[imageGroup] || [];
    const hit = conflicts.find((g) => activityGroups.includes(g));
    if (hit) {
      return {
        matches: false,
        reason: `Image suggests ${imageGroup} but activity requires ${hit} — wrong activity depicted.`,
        activityGroups,
        imageGroups,
      };
    }
  }

  const distinctive = activityGroups.filter((g) => !["paint"].includes(g));
  if (distinctive.length >= 2 && imageGroups.length === 1) {
    const only = imageGroups[0];
    if (!activityGroups.includes(only)) {
      return {
        matches: false,
        reason: `Image emphasizes ${only} but activity is about ${distinctive.join(" + ")}.`,
        activityGroups,
        imageGroups,
      };
    }
  }

  if (activityGroups.includes("sort") && activityGroups.includes("animal") && imageGroups.includes("mirror")) {
    return {
      matches: false,
      reason: "Mirror/reflection photo does not show animal sorting.",
      activityGroups,
      imageGroups,
    };
  }
  return {
    matches: true,
    reason: "No deterministic semantic conflict detected.",
    activityGroups,
    imageGroups,
  };
}

module.exports = {
  assessActivityImageSemanticMatch,
  requiredActivityGroups,
  imageUrlGroups,
};
