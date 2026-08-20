/**
 * Preschool Pro summer curriculum import targets
 * (Zoo Veterinarians, Water Park Engineers, Ice Cream Shop Entrepreneurs).
 */
const fs = require("fs");
const path = require("path");
const parser = require("./curriculum-lesson-import-parser.js");
require("./curriculum-lesson-import-v4.js");

const PRESCHOOL_SUMMER_IMPORT_DIR = path.join(__dirname, "curriculum-preschool-summer-imports");

const PRESCHOOL_SUMMER_IMPORT_TARGETS = [
  {
    file: "01-preschool-zoo-veterinarians-pro.txt",
    stableId: "cur-lp-preschool-zoo-veterinarians",
    plan: "Pro",
    title: "Zoo Veterinarians",
    dayThemes: {
      monday: "Clinic Opening Day",
      tuesday: "Habitats & Movement",
      wednesday: "Care & Measurement",
      thursday: "Rescue & Health",
      friday: "Veterinarian Celebration",
    },
  },
  {
    file: "02-preschool-water-park-engineers-pro.txt",
    stableId: "cur-lp-preschool-water-park-engineers",
    plan: "Pro",
    title: "Water Park Engineers",
    dayThemes: {
      monday: "Meet the Engineers",
      tuesday: "Water Flow & Slides",
      wednesday: "Float & Boat Challenges",
      thursday: "Measure & Power",
      friday: "Water Park Showcase",
    },
  },
  {
    file: "03-preschool-ice-cream-shop-entrepreneurs-pro.txt",
    stableId: "cur-lp-preschool-ice-cream-shop-entrepreneurs",
    plan: "Pro",
    title: "Ice Cream Shop Entrepreneurs",
    dayThemes: {
      monday: "Shop Opening Day",
      tuesday: "Menus & Flavors",
      wednesday: "Orders & Money",
      thursday: "Build & Serve",
      friday: "Grand Opening Celebration",
    },
  },
];

function parsePreschoolSummerLessonImport(text, { itemIdPrefix = "item", dayThemes = {} } = {}) {
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
    age: "Preschool",
    dailyPlans,
    _activityCount: activityCount,
  };
}

function readPreschoolSummerImportTarget(target) {
  const importDir = target.importDir || PRESCHOOL_SUMMER_IMPORT_DIR;
  const filePath = path.join(importDir, target.file);
  const text = fs.readFileSync(filePath, "utf8");
  const prefix = target.stableId.replace(/^cur-lp-/, "");
  const parsed = parsePreschoolSummerLessonImport(text, {
    itemIdPrefix: `item-${prefix}`,
    dayThemes: target.dayThemes || {},
  });
  return {
    ...parsed,
    id: target.stableId,
    title: target.title || parsed.title,
    plan: target.plan || "Pro",
    status: "published",
    age: "Preschool",
  };
}

function preschoolSummerPlansMissing(curriculum, targets = PRESCHOOL_SUMMER_IMPORT_TARGETS) {
  const { seedTargetsMissing } = require("./curriculum-deleted-lesson-tombstones.js");
  return seedTargetsMissing(curriculum, targets);
}

module.exports = {
  PRESCHOOL_SUMMER_IMPORT_DIR,
  PRESCHOOL_SUMMER_IMPORT_TARGETS,
  parsePreschoolSummerLessonImport,
  readPreschoolSummerImportTarget,
  preschoolSummerPlansMissing,
};
