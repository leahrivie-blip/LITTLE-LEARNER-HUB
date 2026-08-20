/**
 * Infant core batch (jul2026) — plans that were truncated to Mon/Tue in production.
 */
const fs = require("fs");
const path = require("path");
const { parseCurriculumLessonPlanImport } = require("./curriculum-lesson-import-parser.js");
const { BLUEPRINTS } = require("./lib/truncated-week-completion-data.js");

const INFANT_CORE_IMPORT_DIR = path.join(__dirname, "curriculum-infant-core-imports");

const INFANT_CORE_IMPORT_TARGETS = Object.entries(BLUEPRINTS)
  .filter(([, bp]) => bp.sourceDir === "infant-batch-jul2026")
  .map(([stableId, bp]) => ({
    file: `${stableId.replace(/^cur-lp-/, "")}.txt`,
    stableId,
    plan: bp.plan || "Free",
    title: stableId.replace(/^cur-lp-infant-/, "").replace(/-/g, " "),
    dayThemes: bp.dayThemes || {},
    importDir: INFANT_CORE_IMPORT_DIR,
  }));

function parseInfantCoreLessonImport(text, { itemIdPrefix = "item", dayThemes = {} } = {}) {
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
      itemId: item.itemId || `${itemIdPrefix}-${day}-${index + 1}`,
    }));
    activityCount += items.length;
    dailyPlans[day] = {
      theme: dayThemes[day] || sourceDay.theme || "",
      objectives: sourceDay.objectives || "",
      materials: sourceDay.materials || "",
      vocabulary: sourceDay.vocabulary || "",
      books: sourceDay.books || [],
      songs: sourceDay.songs || [],
      circleTime: sourceDay.circleTime || [],
      outdoorPlay: sourceDay.outdoorPlay || "",
      observations: sourceDay.observations || [],
      adaptations: sourceDay.adaptations || "",
      safetyNotes: sourceDay.safetyNotes || "",
      learningDomains: sourceDay.learningDomains || [],
      items,
    };
  });
  return {
    ...data,
    dailyPlans,
    _activityCount: activityCount,
  };
}

function readInfantCoreImportTarget(target) {
  const importDir = target.importDir || INFANT_CORE_IMPORT_DIR;
  const filePath = path.join(importDir, target.file);
  const text = fs.readFileSync(filePath, "utf8");
  const prefix = target.stableId.replace(/^cur-lp-/, "");
  const parsed = parseInfantCoreLessonImport(text, {
    itemIdPrefix: `item-${prefix}`,
    dayThemes: target.dayThemes || {},
  });
  return {
    ...parsed,
    id: target.stableId,
    plan: target.plan || "Free",
    status: "published",
  };
}

function infantCorePlansMissing(curriculum, targets = INFANT_CORE_IMPORT_TARGETS) {
  const { seedTargetsMissing } = require("./curriculum-deleted-lesson-tombstones.js");
  return seedTargetsMissing(curriculum, targets);
}

module.exports = {
  INFANT_CORE_IMPORT_DIR,
  INFANT_CORE_IMPORT_TARGETS,
  parseInfantCoreLessonImport,
  readInfantCoreImportTarget,
  infantCorePlansMissing,
};
