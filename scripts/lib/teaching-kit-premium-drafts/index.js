"use strict";

const shared = require("./shared.js");
const colors = require("./kit-infant-colors.js");
const blackWhite = require("./kit-infant-black-white.js");
const community = require("./kit-preschool-community-helpers.js");
const weather = require("./kit-preschool-weather-watchers.js");

const KITS = Object.freeze([
  {
    key: "infant-colors-all-around-us",
    importRelativePath: "scripts/curriculum-infant-core-imports/infant-colors-all-around-us.txt",
    ...colors,
  },
  {
    key: "infant-black-white-discovery",
    importRelativePath: "scripts/curriculum-infant-core-imports/infant-black-white-discovery.txt",
    ...blackWhite,
  },
  {
    key: "preschool-community-helpers",
    importRelativePath: "scripts/curriculum-preschool-free-imports/06-preschool-community-helpers-free.txt",
    ...community,
  },
  {
    key: "preschool-weather-watchers",
    importRelativePath: "scripts/curriculum-preschool-free-imports/08-preschool-weather-watchers-free.txt",
    ...weather,
  },
]);

function buildKitArtifacts(kit, extras = {}) {
  const enrichmentDraft = shared.buildEnrichmentDraft(
    kit.planMeta,
    kit.activitiesByDay,
    {
      removedActivityTitles: kit.removedActivityTitles,
      printableIds: extras.printableIds || [],
    },
  );
  const importText = shared.buildImportText(kit.planMeta, kit.activitiesByDay);
  return { enrichmentDraft, importText };
}

function summarizeKit(kit) {
  const days = shared.WEEKDAYS;
  const activities = [];
  days.forEach((day) => {
    (kit.activitiesByDay[day] || []).forEach((act) => {
      activities.push({ day, ...act });
    });
  });
  const domains = [...new Set(activities.map((a) => a.activityCategory))];
  const withImages = activities.filter((a) => a.imageRequirement && a.imageRequirement !== "not_needed");
  const withoutImages = activities.filter((a) => !a.imageRequirement || a.imageRequirement === "not_needed");
  const decisions = {
    keep: activities.filter((a) => a.decision === "keep").map((a) => a.title),
    improve: activities.filter((a) => a.decision === "improve").map((a) => a.title),
    replace: activities.filter((a) => a.decision === "replace").map((a) => ({
      title: a.title,
      replaces: a.replaces,
      reason: a.replaceReason,
    })),
    add: activities.filter((a) => a.decision === "add").map((a) => a.title),
  };
  return {
    id: kit.planMeta.id,
    title: kit.planMeta.title,
    age: kit.planMeta.age,
    activityCount: activities.length,
    domains,
    decisions,
    removedActivityTitles: kit.removedActivityTitles || [],
    withImages: withImages.map((a) => ({
      title: a.title,
      imageRequirement: a.imageRequirement,
      why: a.imageBriefSetup || a.imageBriefExample || "Instructional setup/example value",
    })),
    withoutImages: withoutImages.map((a) => ({
      title: a.title,
      why: "Song/movement/conversation/book experience — picture would not change teaching clarity",
    })),
    printables: kit.planMeta.printableIdeas || [],
    songs: (kit.planMeta.songs || []).map((s) => s.title || s),
    books: (kit.planMeta.books || []).map((b) => `${b.title}${b.author ? ` — ${b.author}` : ""}`),
    teacherToolkit: kit.planMeta.teacherToolkit || {},
    researchSources: kit.researchSources || kit.planMeta.researchSources || [],
    finalLineup: days.map((day) => ({
      day,
      activities: (kit.activitiesByDay[day] || []).map((a) => a.title),
    })),
  };
}

module.exports = {
  KITS,
  shared,
  buildKitArtifacts,
  summarizeKit,
};
