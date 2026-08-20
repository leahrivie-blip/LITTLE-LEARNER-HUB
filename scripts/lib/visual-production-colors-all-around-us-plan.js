/**
 * Colors All Around Us — planned Visual Production briefs only.
 * Does not generate, attach, assemble PDF, publish, or change Master Paste.
 *
 * originalInstruction for activities uses owner kit visual/setup text as-is.
 * Activity IDs are matched from the live lesson catalog when unique; otherwise pending.
 */
"use strict";

const kit = require("./teaching-kit-premium-drafts/kit-infant-colors.js");

const LESSON_ID = "cur-lp-infant-colors-all-around-us";
const PACK_ID = "vpp-infant-colors-all-around-us";
const PACK_TITLE = "Colors All Around Us Infant Visual & Keepsake Pack";

const PAGE_TITLES = Object.freeze([
  "Cover",
  "Black, White + Bright Color Visual Cards",
  "Color Tummy-Time Cards",
  "Favorite Color Look Cards",
  "Rainbow Scarf Song + Teacher Prompt Card",
  "My Color Footprint Keepsake",
]);

const COLOR_LABELS = Object.freeze(["Black", "White", "Red", "Blue", "Yellow", "Green"]);

function oneLine(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function materialsLine(activity) {
  const list = Array.isArray(activity.materials) ? activity.materials : [activity.materials];
  const parts = list.map((item) => oneLine(item)).filter(Boolean);
  return parts.length ? `Materials: ${parts.join("; ")}.` : "";
}

function activityOriginalInstruction(activity) {
  const visual = oneLine(activity.imageBriefSetup) || oneLine(activity.setup);
  return [visual, materialsLine(activity)].filter(Boolean).join("\n");
}

function flattenKitActivities() {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  /** @type {object[]} */
  const out = [];
  days.forEach((day) => {
    (kit.activitiesByDay[day] || []).forEach((activity) => {
      out.push({ ...activity, dayOfWeek: day });
    });
  });
  return out;
}

function uniqueActivityId(activity, activities) {
  const model = require("../visual-production-brief.js");
  const titles = [activity.title, activity.legacyTitle].map(oneLine).filter(Boolean);
  const ids = [];
  titles.forEach((title) => {
    const hit = model.matchActivity(title, activities || []);
    if (hit.activityId) ids.push(hit.activityId);
  });
  const unique = [...new Set(ids)];
  return unique.length === 1 ? unique[0] : "";
}

function songOverlayLines() {
  const songs = Array.isArray(kit.planMeta.songs) ? kit.planMeta.songs : [];
  const look = songs.find((song) => /look at the bright color/i.test(String(song.title || "")));
  const hello = songs.find((song) => /color hello/i.test(String(song.title || "")));
  const lines = [];
  if (look?.title) lines.push(look.title);
  if (look?.lyrics) {
    String(look.lyrics).split("\n").map((line) => oneLine(line)).filter(Boolean).forEach((line) => lines.push(line));
  }
  if (hello?.title) lines.push(hello.title);
  if (hello?.lyrics) {
    String(hello.lyrics).split("\n").map((line) => oneLine(line)).filter(Boolean).forEach((line) => lines.push(line));
  }
  const cuddle = flattenKitActivities().find((item) => item.title === "Color Song Cuddle");
  const helloAct = flattenKitActivities().find((item) => item.title === "Color Hello with Caregiver");
  if (cuddle?.teacherLanguage) lines.push(oneLine(cuddle.teacherLanguage));
  if (helloAct?.teacherLanguage) lines.push(oneLine(helloAct.teacherLanguage));
  return lines;
}

function printablePages() {
  const songLines = songOverlayLines();
  return [
    {
      pageNumber: 1,
      pageTitle: PAGE_TITLES[0],
      assetType: "PRINTABLE_PAGE",
      visualStyle: "CLEAN_PRINTABLE",
      textOverlayRequirements: ["Colors All Around Us", "Infant 0–6 Months", "Visual & Keepsake Pack"],
    },
    {
      pageNumber: 2,
      pageTitle: PAGE_TITLES[1],
      assetType: "PRINTABLE_CARDS",
      visualStyle: "CLEAN_PRINTABLE",
      textOverlayRequirements: COLOR_LABELS.slice(),
    },
    {
      pageNumber: 3,
      pageTitle: PAGE_TITLES[2],
      assetType: "PRINTABLE_CARDS",
      visualStyle: "CLEAN_PRINTABLE",
      textOverlayRequirements: COLOR_LABELS.slice(),
    },
    {
      pageNumber: 4,
      pageTitle: PAGE_TITLES[3],
      assetType: "PRINTABLE_CARDS",
      visualStyle: "CLEAN_PRINTABLE",
      textOverlayRequirements: COLOR_LABELS.slice(),
    },
    {
      pageNumber: 5,
      pageTitle: PAGE_TITLES[4],
      assetType: "PRINTABLE_PAGE",
      visualStyle: "CLEAN_PRINTABLE",
      textOverlayRequirements: songLines,
    },
    {
      pageNumber: 6,
      pageTitle: PAGE_TITLES[5],
      assetType: "HANDPRINT_FOOTPRINT_TEMPLATE",
      visualStyle: "CLEAN_PRINTABLE",
      textOverlayRequirements: ["Name", "Date"],
    },
  ];
}

/**
 * @param {{ activities?: object[] }} [options]
 */
function buildColorsAllAroundUsStructuredBriefs(options) {
  const activities = Array.isArray(options?.activities) ? options.activities : [];
  const kitActivities = flattenKitActivities();
  const activityBriefs = kitActivities.map((activity) => {
    const activityId = uniqueActivityId(activity, activities);
    return {
      lessonId: LESSON_ID,
      activityName: activity.title,
      activityId,
      allowPendingActivity: true,
      assetType: "ACTIVITY_IMAGE",
      visualStyle: "REALISTIC_CLASSROOM",
      originalInstruction: activityOriginalInstruction(activity),
      instruction: activityOriginalInstruction(activity),
    };
  });
  const pageBriefs = printablePages().map((page) => ({
    lessonId: LESSON_ID,
    activityName: `Page ${page.pageNumber} — ${page.pageTitle}`,
    allowPendingActivity: true,
    assetType: page.assetType,
    visualStyle: page.visualStyle,
    originalInstruction: `${page.pageTitle}\nPrintable page for ${PACK_TITLE}.`,
    instruction: `${page.pageTitle}\nPrintable page for ${PACK_TITLE}.`,
    printablePackId: PACK_ID,
    packTitle: PACK_TITLE,
    pageNumber: page.pageNumber,
    pageTitle: page.pageTitle,
    textOverlayRequirements: page.textOverlayRequirements,
  }));
  return {
    lessonId: LESSON_ID,
    printablePackId: PACK_ID,
    packTitle: PACK_TITLE,
    structuredBriefs: activityBriefs.concat(pageBriefs),
  };
}

module.exports = {
  LESSON_ID,
  PACK_ID,
  PACK_TITLE,
  PAGE_TITLES,
  flattenKitActivities,
  buildColorsAllAroundUsStructuredBriefs,
};
