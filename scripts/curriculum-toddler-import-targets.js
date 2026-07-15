/**
 * Shared Toddler Pro curriculum import targets and parse helper.
 */
const fs = require("fs");
const path = require("path");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");

const TODDLER_PRO_IMPORT_DIR = path.join(__dirname, "curriculum-toddler-pro-imports");

const TODDLER_PRO_IMPORT_TARGETS = [
  {
    file: "01-toddler-zoo-adventures-pro.txt",
    stableId: "cur-lp-toddler-zoo-adventures",
    plan: "Pro",
    title: "Zoo Adventures",
    dayThemes: {
      monday: "Welcome to the Zoo",
      tuesday: "Amazing Animal Habitats",
      wednesday: "Animal Features",
      thursday: "Zoo Helpers",
      friday: "Zoo Celebration",
    },
  },
  {
    file: "02-toddler-camping-under-the-stars-pro.txt",
    stableId: "cur-lp-toddler-camping-under-the-stars",
    plan: "Pro",
    title: "Camping Under the Stars",
    dayThemes: {
      monday: "Welcome to Camp",
      tuesday: "Forest Friends",
      wednesday: "Nature Explorers",
      thursday: "Nighttime Camping",
      friday: "Camping Celebration",
    },
  },
  {
    file: "03-toddler-construction-crew-pro.txt",
    stableId: "cur-lp-toddler-construction-crew",
    plan: "Pro",
    title: "Construction Crew",
    dayThemes: {
      monday: "Meet the Builders",
      tuesday: "Big Construction Vehicles",
      wednesday: "Building Structures",
      thursday: "Tools and Engineering",
      friday: "Construction Celebration",
    },
  },
  {
    file: "04-toddler-pet-vet-clinic-pro.txt",
    stableId: "cur-lp-toddler-pet-vet-clinic",
    plan: "Pro",
    title: "Pet Vet Clinic",
    dayThemes: {
      monday: "Welcome to the Vet Clinic",
      tuesday: "Caring for Animals",
      wednesday: "Animal Checkups",
      thursday: "Helping Pets",
      friday: "Pet Celebration Day",
    },
  },
  {
    file: "05-toddler-bugs-and-butterflies-pro.txt",
    stableId: "cur-lp-toddler-bugs-and-butterflies",
    plan: "Pro",
    title: "Bugs & Butterflies",
    dayThemes: {
      monday: "Meet the Bugs",
      tuesday: "Butterfly Adventures",
      wednesday: "Busy Bugs",
      thursday: "Nature Explorers",
      friday: "Bug Celebration",
    },
  },
  {
    file: "06-toddler-superhero-training-camp-pro.txt",
    stableId: "cur-lp-toddler-superhero-training-camp",
    plan: "Pro",
    title: "Superhero Training Camp",
    dayThemes: {
      monday: "Welcome Heroes",
      tuesday: "Super Strength Day",
      wednesday: "Kindness Heroes",
      thursday: "Save the Day",
      friday: "Superhero Graduation",
    },
  },
  {
    file: "07-toddler-pirate-adventure-pro.txt",
    stableId: "cur-lp-toddler-pirate-adventure",
    plan: "Pro",
    title: "Pirate Adventure",
    dayThemes: {
      monday: "Welcome Aboard Pirates",
      tuesday: "Treasure Hunt Day",
      wednesday: "Ocean Explorers",
      thursday: "Treasure Maps & Islands",
      friday: "Pirate Celebration",
    },
  },
];

const TODDLER_IMPORT_TARGETS = [...TODDLER_PRO_IMPORT_TARGETS];

function parseToddlerLessonImport(text, { itemIdPrefix = "item", dayThemes = {} } = {}) {
  const parsed = parseCurriculumLessonPlanImport(text);
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
    dailyPlans,
    _activityCount: activityCount,
  };
}

function readToddlerImportTarget(target) {
  const importDir = target.importDir || TODDLER_PRO_IMPORT_DIR;
  const filePath = path.join(importDir, target.file);
  const text = fs.readFileSync(filePath, "utf8");
  const prefix = target.stableId.replace(/^cur-lp-/, "");
  const parsed = parseToddlerLessonImport(text, {
    itemIdPrefix: `item-${prefix}`,
    dayThemes: target.dayThemes || {},
  });
  return {
    ...parsed,
    id: target.stableId,
    plan: target.plan || "Pro",
    status: "published",
  };
}

function toddlerPlansMissing(curriculum, targets = TODDLER_IMPORT_TARGETS) {
  const plans = curriculum?.lessonPlans || [];
  return targets.filter((target) => !plans.some((plan) => plan.id === target.stableId));
}

module.exports = {
  TODDLER_PRO_IMPORT_DIR,
  TODDLER_PRO_IMPORT_TARGETS,
  TODDLER_IMPORT_TARGETS,
  parseToddlerLessonImport,
  readToddlerImportTarget,
  toddlerPlansMissing,
};
