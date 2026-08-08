/**
 * Farm Animals owner image classifications (instructional value).
 * Keys match owner-approved titles; aliases cover current fixture titles.
 * Does not rename curriculum — only maps titles → imageRequirement.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LLHFarmAnimalsImageClassifications = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FARM_ANIMALS_LESSON_ID = "cur-lp-preschool-farm-animals";

  /**
   * Owner classifications for Farm Animals.
   * `titles` includes the owner-facing name first, then known aliases in the repo fixture.
   */
  const FARM_ANIMALS_IMAGE_CLASSIFICATIONS = Object.freeze([
    {
      requirement: "example_only",
      titles: ["Collaborative Animal-Track Mural", "Farm Collage Art"],
    },
    {
      requirement: "example_only",
      titles: ["Design Our Class Farm", "Farm Animal Puzzle Table"],
    },
    {
      requirement: "optional",
      titles: ["Pretend Milking Fine-Motor Station", "Milking the Cow Fine Motor"],
    },
    {
      requirement: "not_needed",
      titles: ["Barnyard Movement Trail", "Farm Animal Walk"],
    },
    {
      requirement: "not_needed",
      titles: ["Farm Animal Discovery Basket"],
    },
    {
      requirement: "not_needed",
      titles: ["Farm Sound & Motion Circle", "Old MacDonald Sing Along", "Harvest Hoedown Dance"],
    },
    {
      requirement: "not_needed",
      titles: ["Where Does It Belong? Farm Sorting", "Animal Sorting Center"],
    },
    {
      requirement: "not_needed",
      titles: ["From Farm to Table Story Investigation", "Farm Story Read-Aloud"],
    },
    {
      requirement: "not_needed",
      titles: ["Preschool Farmers Market", "Farmer's Market Dramatic Play"],
    },
    {
      requirement: "not_needed",
      titles: ["Egg Collection Counting Challenge", "Egg Carton Counting"],
    },
    {
      requirement: "not_needed",
      titles: ["Grooming and Caring for Animals", "Brush the Horse Grooming"],
    },
    {
      requirement: "not_needed",
      titles: ["Barnyard Story and Movement Celebration", "Farm Animals Celebration Circle"],
    },
    {
      requirement: "not_needed",
      titles: ["Mystery Farm Sound Game", "Farm Sound Bingo"],
    },
    {
      requirement: "required",
      titles: ["Build an Animal Shelter STEM Challenge"],
      // Preserve existing photos when present — no fixture rename required for STEM shelter.
      preserveImages: true,
    },
    {
      requirement: "required",
      titles: ["Muddy Animals Wash Laboratory", "Muddy Pig Sensory Bin"],
      preserveImages: true,
    },
  ]);

  function normTitle(value) {
    return String(value == null ? "" : value).trim().toLowerCase().replace(/\s+/g, " ");
  }

  function classificationLookup() {
    const map = new Map();
    FARM_ANIMALS_IMAGE_CLASSIFICATIONS.forEach((entry) => {
      (entry.titles || []).forEach((title) => {
        map.set(normTitle(title), {
          requirement: entry.requirement,
          preserveImages: entry.preserveImages === true,
          canonicalTitle: entry.titles[0],
        });
      });
    });
    return map;
  }

  function resolveFarmAnimalsImageRequirement(title) {
    const hit = classificationLookup().get(normTitle(title));
    return hit || null;
  }

  /**
   * Apply owner classifications onto activities / draft patches.
   * Never clears existing setup/example image URLs.
   */
  function applyFarmAnimalsImageClassifications(activities, enrichmentDraft) {
    const list = Array.isArray(activities) ? activities : [];
    const draft = enrichmentDraft && typeof enrichmentDraft === "object"
      ? JSON.parse(JSON.stringify(enrichmentDraft))
      : { activities: {}, week: {} };
    if (!draft.activities || typeof draft.activities !== "object") draft.activities = {};
    const applied = [];
    const unmatched = [];

    list.forEach((act) => {
      if (!act || typeof act !== "object") return;
      const title = String(act.title || "").trim();
      const hit = resolveFarmAnimalsImageRequirement(title);
      const key = String(act.id || act.itemId || "").trim();
      if (!hit) {
        unmatched.push({ key, title });
        return;
      }
      // Persist on the activity record when present.
      act.imageRequirement = hit.requirement;
      if (key) {
        const prev = draft.activities[key] && typeof draft.activities[key] === "object"
          ? draft.activities[key]
          : {};
        draft.activities[key] = {
          ...prev,
          imageRequirement: hit.requirement,
        };
        // Preserve existing image fields only — never clear or invent empty URLs.
        if (!Object.prototype.hasOwnProperty.call(draft.activities[key], "setupImageUrl") && act.setupImageUrl) {
          draft.activities[key].setupImageUrl = act.setupImageUrl;
        }
        if (!Object.prototype.hasOwnProperty.call(draft.activities[key], "exampleImageUrl") && act.exampleImageUrl) {
          draft.activities[key].exampleImageUrl = act.exampleImageUrl;
        }
        if (!Object.prototype.hasOwnProperty.call(draft.activities[key], "setupMediaAssetId") && act.setupMediaAssetId) {
          draft.activities[key].setupMediaAssetId = act.setupMediaAssetId;
        }
        if (!Object.prototype.hasOwnProperty.call(draft.activities[key], "exampleMediaAssetId") && act.exampleMediaAssetId) {
          draft.activities[key].exampleMediaAssetId = act.exampleMediaAssetId;
        }
      }
      applied.push({
        key,
        title,
        canonicalTitle: hit.canonicalTitle,
        requirement: hit.requirement,
        hadSetup: Boolean(String(act.setupImageUrl || "").trim()),
        hadExample: Boolean(String(act.exampleImageUrl || "").trim()),
      });
    });

    return { draft, applied, unmatched };
  }

  return {
    FARM_ANIMALS_LESSON_ID,
    FARM_ANIMALS_IMAGE_CLASSIFICATIONS,
    resolveFarmAnimalsImageRequirement,
    applyFarmAnimalsImageClassifications,
    classificationLookup,
  };
});
