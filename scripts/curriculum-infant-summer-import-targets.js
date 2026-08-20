/**
 * Infant Pro summer curriculum import targets
 * (Water Play Wonders, Animal Sounds Discovery, Summer Colors).
 */
const fs = require("fs");
const path = require("path");
const parser = require("./curriculum-lesson-import-parser.js");
require("./curriculum-lesson-import-v4.js");

const INFANT_SUMMER_IMPORT_DIR = path.join(__dirname, "curriculum-infant-summer-imports");

const INFANT_SUMMER_IMPORT_TARGETS = [
  {
    file: "01-infant-water-play-wonders-pro.txt",
    stableId: "cur-lp-infant-water-play-wonders",
    plan: "Pro",
    title: "Water Play Wonders",
    dayThemes: {
      monday: "Water Discovery",
      tuesday: "Floating & Waves",
      wednesday: "Bubbles & Sensory",
      thursday: "Cool Touch & Boats",
      friday: "Water Play Celebration",
    },
  },
  {
    file: "02-infant-animal-sounds-discovery-pro.txt",
    stableId: "cur-lp-infant-animal-sounds-discovery",
    plan: "Pro",
    title: "Animal Sounds Discovery",
    dayThemes: {
      monday: "Animal Discovery",
      tuesday: "Dog Sounds & Movement",
      wednesday: "Farm Sounds",
      thursday: "Birds & Rhythm",
      friday: "Animal Sounds Celebration",
    },
  },
  {
    file: "03-infant-summer-colors-pro.txt",
    stableId: "cur-lp-infant-summer-colors",
    plan: "Pro",
    title: "Summer Colors",
    dayThemes: {
      monday: "Red Discovery",
      tuesday: "Yellow Sunshine",
      wednesday: "Blue Ocean",
      thursday: "Green & Rainbow",
      friday: "Summer Colors Celebration",
    },
  },
];

function parseInfantSummerLessonImport(text, { itemIdPrefix = "item", dayThemes = {} } = {}) {
  const parsed = parser.parseCurriculumLessonPlanImport(text, { mode: "v4" });
  if (!parsed.ok) {
    throw new Error((parsed.errors || []).join(" "));
  }
  const data = parsed.data || {};
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const dailyPlans = {};
  let activityCount = 0;
  weekdays.forEach((day) => {
    const sourceDay = data.dailyPlans?.[day] || {};
    const items = (sourceDay.items || []).map((item, index) => ({
      ...item,
      itemId: `${itemIdPrefix}-${day}-${index + 1}`,
    }));
    activityCount += items.length;
    dailyPlans[day] = {
      theme: dayThemes[day] || sourceDay.theme || "",
      objectives: sourceDay.objectives || "",
      materials: sourceDay.materials || "",
      vocabulary: sourceDay.vocabulary || "",
      books: sourceDay.books || [],
      songs: sourceDay.songs || [],
      items,
    };
  });
  return {
    ...data,
    // Keep exact infant age label so browse buckets (Infant 0–12 Months) match.
    age: data.age || "Infant 0–12 Months",
    dailyPlans,
    _activityCount: activityCount,
  };
}

function readInfantSummerImportTarget(target) {
  const importDir = target.importDir || INFANT_SUMMER_IMPORT_DIR;
  const filePath = path.join(importDir, target.file);
  const text = fs.readFileSync(filePath, "utf8");
  const prefix = target.stableId.replace(/^cur-lp-/, "");
  const parsed = parseInfantSummerLessonImport(text, {
    itemIdPrefix: `item-${prefix}`,
    dayThemes: target.dayThemes || {},
  });
  return {
    ...parsed,
    id: target.stableId,
    title: target.title || parsed.title,
    plan: target.plan || "Pro",
    status: "published",
    age: parsed.age || "Infant 0–12 Months",
  };
}

function infantSummerPlansMissing(curriculum, targets = INFANT_SUMMER_IMPORT_TARGETS) {
  const { seedTargetsMissing } = require("./curriculum-deleted-lesson-tombstones.js");
  return seedTargetsMissing(curriculum, targets);
}

module.exports = {
  INFANT_SUMMER_IMPORT_DIR,
  INFANT_SUMMER_IMPORT_TARGETS,
  parseInfantSummerLessonImport,
  readInfantSummerImportTarget,
  infantSummerPlansMissing,
};
