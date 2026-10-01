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

function detectVisualGroups(tokens) {
  const found = new Set();
  tokens.forEach((token) => {
    Object.entries(VISUAL_GROUPS).forEach(([group, hints]) => {
      if (hints.some((hint) => token.includes(hint) || hint.includes(token))) {
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
  const tokens = tokenize(activityContextBlob(activity, patch));
  const groups = detectVisualGroups(tokens);
  const title = text(activity.title, 180).toLowerCase();
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

/**
 * @returns {{ matches: boolean, reason: string, activityGroups: string[], imageGroups: string[] }}
 */
function assessActivityImageSemanticMatch(activity, patch = {}, imageUrl, options = {}) {
  const url = text(imageUrl, 600);
  if (!url) {
    return { matches: false, reason: "No image URL to evaluate.", activityGroups: [], imageGroups: [] };
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
  const imageGroups = imageUrlGroups(url);
  return finishMatch(activityGroups, imageGroups, "heuristic");
}

function finishMatch(activityGroupsSet, imageGroupsSet, mode) {
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
